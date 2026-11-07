const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('@babel/core');
const { toQR } = require('toqr');
const loadModule = require('./loadModule.cjs');
const priceExports = loadModule('prices');
const portalExports = loadModule('portal');
const dateExports = {};
const dateCode = transformSync(fs.readFileSync('src/dates.js', 'utf8'), {
 babelrc:false, configFile:false, plugins:['@babel/plugin-transform-modules-commonjs']
}).code;
vm.runInNewContext(dateCode, {exports:dateExports, Date, Intl});
const foodExports = {};
const foodCode = transformSync(fs.readFileSync('src/foodWeek.js', 'utf8'), {
 babelrc:false, configFile:false, plugins:['@babel/plugin-transform-modules-commonjs']
}).code;
vm.runInNewContext(foodCode, {exports:foodExports,require:(name)=>{if(name==='./prices')return priceExports;throw Error(name);}});
const exportsObject = {};
const { code } = transformSync(fs.readFileSync('src/samad.js', 'utf8'), {
 babelrc:false, configFile:false, plugins:['@babel/plugin-transform-modules-commonjs']
});
vm.runInNewContext(code, { exports:exportsObject, fetch:()=>{}, AbortController, setTimeout, clearTimeout, Date,
 require:(name)=>{ if(name==='./dates') return dateExports; if(name==='./foodWeek') return foodExports; if(name==='./portal')return portalExports; if(name==='./walletCheckout')return loadModule('walletCheckout'); throw new Error(name); } });
const { weekStart, reservationRows, createSamadClient } = exportsObject;
const report = { payload: { mealTypes:[{id:2,name:'ناهار'}], weekDays: [{ date:'2026-10-25', mealTypes:[{
 mealTypeId:2, reserve:{ id:77, selectedCount:1, foodNames:'غذای نمونه', selfName:'سلف مرکزی', consumed:false },
 teammateReserve:{ id:99, selectedCount:1, foodNames:'غذای هم‌گروهی' }
 }]}] } };

test('Iranian weeks start on Saturday across month and year boundaries', () => {
 assert.equal(weekStart(0,new Date('2026-10-22T12:00:00')), '2026-10-17');
 assert.equal(weekStart(1,new Date('2026-12-31T12:00:00')), '2027-01-02');
});
test('Jalali dates use Persian year, month and digits in the UI', () => {
 const value=dateExports.jalaliDateLabel('2026-10-25');
 assert.ok(value.includes('۱۴۰۵'));
 assert.ok(value.includes('آبان'));
 assert.ok(!value.includes('2026'));
 assert.equal(dateExports.shiftWeek('2026-10-17',1),'2026-10-24');
 assert.equal(dateExports.shiftWeek('2026-10-24',-1),'2026-10-17');
});
test('Samad receives the full timestamp required by the live service', () => {
 assert.equal(dateExports.samadWeekTimestamp('2026-10-24'),'2026-10-24 00:00:00');
 assert.throws(()=>dateExports.samadWeekTimestamp('۱۴۰۵/۰۸/۰۲'),/invalid-week-date/);
});
test('selected weeks stay anchored across Gregorian and Jalali year boundaries', () => {
 assert.equal(dateExports.shiftWeek('2026-12-26',1),'2027-01-02');
 assert.equal(dateExports.shiftWeek('2027-01-02',-1),'2026-12-26');
 assert.equal(dateExports.shiftWeek('2027-03-20',1),'2027-03-27');
 assert.equal(dateExports.isInWeek('2026-10-23','2026-10-17'),true);
 assert.equal(dateExports.isInWeek('2026-10-24','2026-10-17'),false);
 assert.equal(dateExports.isInWeek('2026-10-16','2026-10-17'),false);
 assert.equal(dateExports.isInWeek('undefined','2026-10-17'),false);
 assert.ok(dateExports.weekDateRange('2026-10-24').includes('آبان'));
});
test('week menu excludes rows from another week even if the server returns them', async () => {
 const calls=[];
 const client=createSamadClient({username:'fixture',password:'fixture'},async(url)=>{
  calls.push(url);
  return {ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture'}:{payload:{selfWeekPrograms:[[
   {programId:1,date:'2026-10-18',foodTypeId:1,foodName:'current'},
   {programId:2,date:'2026-10-25',foodTypeId:1,foodName:'next'}
  ]]}}};
 });
 const current=await client.programs(1,'2026-10-17');
 const next=await client.programs(1,'2026-10-24');
 assert.deepEqual(Array.from(current,row=>row.programId),[1]);
 assert.deepEqual(Array.from(next,row=>row.programId),[2]);
 assert.ok(calls.some(url=>url.includes('weekStartDate=2026-10-17%2000%3A00%3A00')));
 assert.ok(calls.some(url=>url.includes('weekStartDate=2026-10-24%2000%3A00%3A00')));
});
test('report rows preserve reservation IDs, dates, counts and ownership', () => {
 const rows=reservationRows(report,{payload:[{ reserveDailySaleId:88, selectedCount:2, programDate:'2026-10-26 12:00', mealTypeName:'شام', foodNames:'غذای روزفروش' }]});
 assert.equal(rows.length,2);
 assert.equal(rows[0].id,77);
 assert.equal(rows[0].date,'2026-10-25');
 assert.equal(rows[0].meal,'ناهار');
 assert.equal(rows[1].dailySale,true);
 assert.equal(rows[1].selectedCount,2);
 assert.ok(!rows.some(row=>row.id===99));
});
test('client authenticates once, reads weekly reservations and requests only the selected QR', async () => {
 const calls=[];
 const fetcher=async (url,options) => {
  calls.push({url,options});
  const data=url.endsWith('/oauth/token')?{access_token:'fixture-token'}:
   url.includes('/forget-card-codes/')?{payload:{forgotCardCode:'012345'}}:
   url.includes('/reserve-daily-sales')?{payload:[]}:report;
  return {ok:true,json:async()=>data};
 };
 const client=createSamadClient({username:'student',password:'a&b=c'},fetcher);
 const rows=await client.reservations('2026-10-24');
 assert.equal(rows.length,1);
 assert.ok(calls[0].options.body.includes('password=a%26b%3Dc'));
 assert.equal(calls.filter(call=>call.url.includes('/forget-card-codes/')).length,0);
 assert.equal(await client.qr(rows[0]),'012345');
 assert.equal(calls.filter(call=>call.url.endsWith('/oauth/token')).length,1);
 assert.ok(calls.some(call=>call.url.includes('selfType=NORMAL')));
 assert.ok(calls.some(call=>call.url.includes('weekStartDate=2026-10-24%2000%3A00%3A00')));
 assert.ok(calls.some(call=>call.url.includes('reserveId=77&count=1&dailySale=false')));
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer fixture-token');
 const matrix=toQR('012345');
 assert.equal(Math.sqrt(matrix.length)%1,0);
});
test('a missing server code fails rather than inventing a pickup code', async () => {
 const client=createSamadClient({username:'student',password:'fixture'},async url => ({
  ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture-token'}:{payload:{}}
 }));
 await assert.rejects(client.qr({id:77,selectedCount:1,dailySale:false}),/samad-no-code/);
});
test('a changed report schema is shown as an error, not an empty reservation list', async () => {
 const client=createSamadClient({username:'student',password:'fixture'},async url => ({
  ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture-token'}:{payload:[]}
 }));
 await assert.rejects(client.reservations('2026-10-24'),/samad-report-format/);
});

test('weekly menu flattens real Samad groups and marks only the reserved option', () => {
 const menu=foodExports.menuRows({payload:{selfWeekPrograms:[[
  {programId:10,date:'2026-10-25',mealTypeId:2,mealTypeName:'ناهار',reserveRuleViolated:false,cancelRuleViolated:false,
   programFoodTypes:[{programId:10,foodTypeId:1,foodNames:'گزینه اول'},{programId:10,foodTypeId:2,foodNames:'گزینه دوم'}]}
 ]],userWeekReserves:[{id:1,programId:10,foodTypeId:1,selectedCount:1}]}});
 assert.equal(menu.length,2);
 assert.equal(menu[0].reserved,true);
 assert.equal(menu[1].reserved,false);
 const rows=foodExports.mergeMenuReservations(menu,[{key:'reserve-1',id:1,programId:10,foodTypeId:1,date:'2026-10-25',selectedCount:1}]);
 assert.equal(rows.filter(row=>row.reserved).length,1);
 assert.equal(foodExports.dayHasReservation(rows,'2026-10-25'),true);
});

function mutableService(initial=[]) {
 const state={rows:[...initial],writes:[]};
 const food={programId:88,foodTypeId:597,mealTypeId:2,date:'2026-10-25',reserveRuleViolated:false,cancelRuleViolated:false};
 const fetcher=async(url,options) => {
  let data;
  if(url.endsWith('/oauth/token'))data={access_token:'fixture-token'};
  else if(options.method==='PUT'){
   const body=JSON.parse(options.body);state.writes.push({url,body});
   if(url.endsWith('/reserve')){
    const programId=Number(url.match(/reserves\/(\d+)/)[1]);
    state.rows=state.rows.filter(row=>row.programId!==programId);
    if(body.selected)state.rows.push({...food,key:'reserve-101',id:101,programId,selectedCount:1,consumed:false,saleableFreeFood:true,forSale:false});
   }else{
    const id=Number(url.match(/reserves\/v2\/(\d+)/)[1]);
    const row=state.rows.find(row=>row.id===id);
    row.forSale=url.endsWith('/sell-reserve');
   }
   data={type:'SUCCESS',payload:{}};
  }else if(url.includes('reserve-daily-sales'))data={payload:[]};
  else data={payload:{weekDays:[{date:food.date,mealTypes:state.rows.map(reserve=>({mealTypeId:2,reserve}))}],mealTypes:[{id:2,name:'ناهار'}]}};
  return {ok:true,json:async()=>data};
 };
 return {client:createSamadClient({username:'fixture',password:'fixture'},fetcher),state,food};
}

test('buy rechecks all reservations and refuses a second meal on an occupied day', async () => {
 const service=mutableService([{id:1,programId:12,programDate:'2026-10-25',selectedCount:1}]);
 await assert.rejects(service.client.buy(service.food,'2026-10-24'),/برای این روز/);
 assert.equal(service.state.writes.length,0);
});

test('normal buy is count one, concurrent taps are locked, and subsequent buys on that day are blocked', async () => {
 const {client,state,food}=mutableService();
 const first=client.buy(food,'2026-10-24');
 await assert.rejects(client.buy({...food,programId:89},'2026-10-24'),/عملیات قبلی/);
 const rows=await first;
 assert.equal(rows.length,1);
 assert.equal(state.writes.length,1);
 assert.equal(state.writes[0].body.selectedCount,1);
 assert.equal(state.writes[0].body.freeFoodSelected,false);
 await assert.rejects(client.buy({...food,programId:89},'2026-10-24'),/برای این روز/);
 assert.equal(state.writes.length,1);
});

test('normal cancellation and marketplace sell/withdraw use separate actions and verify new state', async () => {
 const {client,state,food}=mutableService();
 const rows=await client.buy(food,'2026-10-24');
 const reserved={...food,...rows[0]};
 let updated=await client.sell(reserved,'2026-10-24');
 assert.equal(updated[0].forSale,true);
 assert.ok(state.writes.at(-1).url.endsWith('/rest/reserves/v2/101/sell-reserve'));
 updated=await client.sell({...reserved,forSale:true},'2026-10-24',true);
 assert.equal(updated[0].forSale,false);
 updated=await client.cancel(reserved,'2026-10-24');
 assert.equal(updated.length,0);
 assert.equal(state.writes.at(-1).body.selected,false);
 assert.equal(state.writes.at(-1).body.selectedCount,0);
});

