const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const load=require('./loadModule.cjs');
const portal=load('portal'),scripts=load('pageScripts'),prices=load('prices'),foods=load('foodWeek');
test('legacy redirects preserve the server scheme and query without a replacement loop',()=>{
 const url='http://food.guilan.ac.ir/j_security_check?loginAsToken=fixture&redirect=%2Fnurture%2F';
 const result=portal.portalNavigation(url);
 assert.equal(result.action,'allow');assert.equal(result.url,undefined);
 assert.equal(new URL(url).searchParams.get('loginAsToken'),'fixture');
});
test('embedded website stays legacy; every wallet destination opens externally',()=>{
 const fallback=portal.legacyPanelUrl(3);
 assert.equal(new URL(fallback).searchParams.get('selectedSelfDefId'),'3');
 assert.equal(portal.portalNavigation('https://samad.app/food/reserves-report',{fallback}).action,'block');
 assert.equal(portal.portalNavigation('https://samad.app/wallet',{wallet:true}).action,'external');
 assert.equal(portal.portalNavigation('https://bank.example/pay',{wallet:true}).action,'external');
 assert.equal(portal.portalNavigation(fallback,{wallet:true}).action,'external');
 assert.equal(portal.portalNavigation('http://bank.example/pay',{wallet:true}).action,'external');
 assert.equal(portal.portalNavigation('javascript:alert(1)').action,'block');
 assert.equal(portal.safePagePath('https://food.guilan.ac.ir/j_security_check?loginAsToken=secret'),'https://food.guilan.ac.ir/j_security_check');
});
test('legacy POST keeps the actual form action without forcing another redirect',()=>{
 const submitted=[];
 function Form(action){this.action=action;}
 Form.prototype.submit=function(){submitted.push({action:this.action,body:'selected=1'});};
 const old=new Form('http://food.guilan.ac.ir/nurture/reserve.rose');
 const gateway=new Form('https://bank.example/pay');
 const listeners={};
 vm.runInNewContext(scripts.beforeLoadScript(),{window:{HTMLFormElement:Form},document:{readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[old,gateway],addEventListener:(name,fn)=>{listeners[name]=fn;}},location:new URL('https://food.guilan.ac.ir/nurture/panel'),URL,localStorage:{setItem(){}}});
 old.action='http://food.guilan.ac.ir/nurture/reserve.rose';old.submit();gateway.submit();
 assert.equal(submitted[0].action,'http://food.guilan.ac.ir/nurture/reserve.rose');
 assert.equal(submitted[0].body,'selected=1');assert.equal(submitted[1].action,'https://bank.example/pay');
});

test('actual website credit click keeps its original handler and marks the same browsing session',()=>{
 const messages=[],listeners=[],storage=new Map();
 const context={window:{ReactNativeWebView:{postMessage:data=>messages.push(JSON.parse(data))}},
  document:{readyState:'complete',getElementById:()=>null,addEventListener:(name,fn)=>listeners.push(fn)},
  location:new URL('https://food.guilan.ac.ir/nurture/panel'),localStorage:{setItem(){}},sessionStorage:{setItem:(key,value)=>storage.set(key,value)}};
 vm.runInNewContext(scripts.beforeLoadScript(),context);
 vm.runInNewContext(scripts.beforeLoadScript(),context);
 assert.equal(listeners.length,1);
 let prevented=false,stopped=false;
 listeners[0]({target:{closest:()=>({textContent:'افزایش اعتبار',href:'https://samad.app/wallet'})},
  preventDefault:()=>prevented=true,stopImmediatePropagation:()=>stopped=true});
 assert.equal(prevented,false);assert.equal(stopped,false);
 assert.deepEqual(messages,[{type:'wallet-opened'}]);assert.equal(storage.get('degan-wallet-active'),'1');
});
test('SSO connects to the selected old-portal self; missing tokens fail explicitly',async()=>{
 const calls=[];
 const client=load('samad').createSamadClient({username:'fixture',password:'fixture'},async(url,options)=>{
  calls.push({url,method:options.method});return {ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture'}:{payload:{loginAsToken:'one+time&token'}}};
 });
 const url=new URL(await client.legacyLoginUrl(5));
 assert.equal(url.origin,portal.PORTAL_ORIGIN);assert.equal(url.pathname,'/j_security_check');
 assert.equal(url.searchParams.get('loginAsToken'),'one+time&token');
 assert.equal(url.searchParams.get('redirect'),'/nurture/user/multi/reserve/showPanel.rose?selectedSelfDefId=5');
 assert.ok(calls.every(call=>call.url.startsWith(portal.PORTAL_ORIGIN)));
 const bad=load('samad').createSamadClient({},async(url)=>({ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'x'}:{payload:{}}}));
 await assert.rejects(bad.legacyLoginUrl(1),/legacy-login-token/);
});

test('wallet opens Samad own authenticated amount-selection flow, without a new login or payment',async()=>{
 const calls=[];
 const client=load('samad').createSamadClient({username:'fixture',password:'fixture'},async(url,options)=>{
  calls.push({url,method:options.method});return {ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture'}:{payload:{loginAsToken:'one+time&token'}}};
 });
 const url=new URL(await client.walletLoginUrl());
 assert.equal(url.origin,portal.PORTAL_ORIGIN);assert.equal(url.pathname,'/j_security_check');
 assert.equal(url.searchParams.get('loginAsToken'),'one+time&token');
 const destination=new URL(url.searchParams.get('redirect'),portal.PORTAL_ORIGIN);
 assert.equal(destination.pathname,'/nurture/user/credit/charge/view.rose');
 assert.equal(destination.searchParams.get('callBackAppUrl'),'https://samad.app/user/wallet');
 assert.equal(calls.length,2);assert.equal(calls[1].url,portal.PORTAL_ORIGIN+'/rest/users/me/login-token');
 assert.equal(portal.portalNavigation(url.href,{wallet:true}).action,'external');
});
test('prices are independent server values, not a fixed 35000 toman label',()=>{
 assert.equal(prices.tomanPrice(350000),(35000).toLocaleString('fa-IR')+' تومان');
 assert.equal(prices.tomanPrice(420000),(42000).toLocaleString('fa-IR')+' تومان');
 assert.equal(prices.rialPrice('۴۲۰٬۰۰۰'),420000);
 assert.equal(prices.tomanPrice(null),'قیمت نامشخص');
 assert.equal(prices.tomanPrice(undefined),'قیمت نامشخص');
 assert.equal(prices.tomanPrice('not-a-price'),'قیمت نامشخص');
 assert.equal(prices.tomanPrice(0),(0).toLocaleString('fa-IR')+' تومان');
 const menu=foods.menuRows({payload:{selfWeekPrograms:[{programId:1,date:'2026-10-25',price:420000,foodTypeId:1}]}});
 assert.equal(foods.mergeMenuReservations(menu,[{programId:1,foodTypeId:1,date:'2026-10-25',price:undefined,id:1,key:'reserve-1'}])[0].price,420000);
});
test('stop hunting cancels the delayed confirmation and restores browser dialogs',()=>{
 const alert=()=>{},confirm=()=>true;const callbacks=[];let saves=0;
 const cart={click(){}};
 const document={body:{innerText:''},getElementById:id=>id.startsWith('buyFreeFoodIconSpan')?{querySelector:()=>cart}:id==='doReservBtn'?{click:()=>saves++}:null};
 const window={alert,confirm,ReactNativeWebView:{postMessage(){}}};
 const context={window,document,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:fn=>{callbacks.push(fn);return 1;},clearTimeout(){},clearInterval(){}};
 vm.runInNewContext(scripts.huntScript([1]),context);
 vm.runInNewContext(scripts.stopHuntScript(),context);
 callbacks[0]();assert.equal(saves,0);assert.equal(window.alert,alert);assert.equal(window.confirm,confirm);
});
test('API write refreshes once on 401 but never repeats an ambiguous server failure',async()=>{
 async function scenario(status){
  let tokens=0,writes=0,rows=[];
  const client=load('samad').createSamadClient({},async(url,options)=>{
   if(url.endsWith('/oauth/token')){tokens++;return{ok:true,json:async()=>({access_token:'fixture-'+tokens})};}
   if(options.method==='PUT'){
    writes++;
    if(writes===1)return{ok:false,status};
    rows=[{reserve:{id:1,programId:4,selectedCount:1,programDate:'2026-10-25'}}];
   }
   return{ok:true,json:async()=>url.includes('reserve-daily-sales')?{payload:[]}:{payload:{weekDays:[{date:'2026-10-25',mealTypes:rows}]}}};
  });
  const action=client.buy({programId:4,foodTypeId:1,mealTypeId:2,date:'2026-10-25'},'2026-10-24');
  if(status===401)await action;else await assert.rejects(action);
  return{tokens,writes};
 }
 assert.deepEqual(await scenario(401),{tokens:2,writes:2});
 assert.deepEqual(await scenario(500),{tokens:1,writes:1});
});
