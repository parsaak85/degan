const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
const portal=require('./loadModule.cjs')('portal');
const api={};
const {code}=transformSync(fs.readFileSync('src/pageScripts.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']});
vm.runInNewContext(code,{exports:api,require:(name)=>{if(name==='./portal')return portal;if(name==='./huntWindow')return require('./loadModule.cjs')('huntWindow');throw Error(name);}});
function runHunt({reserved=false,date='2026-10-25',programId=88}={}){
 const messages=[];
 const doc={
  body:{innerText:''},
  getElementById:(id)=>id==='userWeekReserves.selected1'?{getAttribute:()=>date}:null,
  querySelectorAll:()=>reserved?[{defaultChecked:true,getAttribute:()=>date}]:[],
  querySelector:()=>({value:String(programId)}),
 };
 const win={ReactNativeWebView:{postMessage:(value)=>messages.push(JSON.parse(value))}};
 class Clock extends Date { constructor(...args){super(...(args.length?args:['2026-10-25T09:00:00Z']));} }
 vm.runInNewContext(api.huntScript([1],'2026-10-25',88),{window:win,document:doc,Date:Clock,sessionStorage:{getItem:()=>null,removeItem:()=>{}},setTimeout:()=>{throw Error('Purchase must not be attempted');}});
 return messages;
}
test('روزفروش stops when another food is already reserved on the same date',()=>{
 assert.equal(runHunt({reserved:true})[0].type,'day-reserved');
});
test('روزفروش refuses a changed week or changed food rather than purchasing by a stale row number',()=>{
 assert.equal(runHunt({date:'2026-11-01'})[0].type,'target-changed');
 assert.equal(runHunt({programId:99})[0].type,'target-changed');
});
test('page bridge reads actual program IDs, dates and the selected legacy week',()=>{
 const messages=[];
 const body={innerText:''};
 const label={firstChild:null,parentElement:body,previousElementSibling:null,textContent:'پرهزینه | غذای نمونه',getAttribute:()=> 'userWeekReserves.selected1'};
 const input={defaultChecked:true,getAttribute:(name)=>name==='onclick'?"enableDisableNumber(this, 'row', '420000')":'2026-10-25'};
 const week={value:String(new Date('2026-10-24T12:00:00').getTime())};
 const doc={body,getElementById:(id)=>id==='weekStartDateTimeAjx'?week:id==='userWeekReserves.selected1'?input:null,
  querySelectorAll:(selector)=>selector.startsWith('label[')?[label]:[],querySelector:()=>({value:'88'})};
 vm.runInNewContext(api.readPageScript(),{window:{ReactNativeWebView:{postMessage:(value)=>messages.push(JSON.parse(value))}},document:doc,Date});
 assert.equal(messages[0].weekStart,'2026-10-24');
 assert.equal(messages[0].foods[0].programId,88);
 assert.equal(messages[0].foods[0].date,'2026-10-25');
 assert.equal(messages[0].foods[0].reserved,true);
 assert.equal(messages[0].foods[0].priceRials,420000);
});
