const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {WALLET_BRIDGE,walletDestinationScript,managedWalletBridgeScript,enableWebsiteWalletScript,disableWebsiteWalletScript}=require('./loadModule.cjs')('walletScripts');
function fixture(storage=new Map()){
 const messages=[],handlers={},forms=[];let submits=0;
 class Form {constructor(action,method='post',fields=[]){this.action=action;this.method=method;this.fields=fields;forms.push(this);}submit(){submits++;}}
 class Data {constructor(form){this.fields=form.fields;}forEach(fn){this.fields.forEach(([name,value])=>fn(value,name));}}
 const context={URL,HTMLFormElement:Form,FormData:Data,location:new URL('https://food.guilan.ac.ir/nurture/user/credit/charge/view.rose'),
  sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  window:{ReactNativeWebView:{postMessage:data=>messages.push(JSON.parse(data))}},
  document:{addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll:()=>forms}};
 vm.runInNewContext(WALLET_BRIDGE,context);
 return {messages,handlers,Form,context,submits:()=>submits};
}

test('managed bridge leaves ordinary forms alone and enables bank handoff only for the wallet session',()=>{
 const f=fixture();vm.runInNewContext(managedWalletBridgeScript(),f.context);
 new f.Form('https://outside.example/ordinary','post',[['field','fixture']]).submit();assert.equal(f.submits(),1);assert.equal(f.messages.length,0);
 vm.runInNewContext(enableWebsiteWalletScript,f.context);
 new f.Form('https://sadad.shaparak.ir/VPG/Purchase','post',[['Token','fixture']]).submit();assert.equal(f.messages[0].type,'post');assert.equal(f.submits(),1);
 vm.runInNewContext(disableWebsiteWalletScript,f.context);
 new f.Form('https://outside.example/ordinary','post',[['field','fixture']]).submit();assert.equal(f.submits(),2);
});

test('wallet mode survives a real page navigation in the same WebView and clears on return home',()=>{
 const storage=new Map([['degan-wallet-active','1']]);const wallet=fixture(storage);
 vm.runInNewContext(managedWalletBridgeScript(),wallet.context);
 new wallet.Form('https://sadad.shaparak.ir/VPG/Purchase','post',[['Token','same-session']]).submit();assert.equal(wallet.messages.length,1);
 vm.runInNewContext(disableWebsiteWalletScript,wallet.context);
 const home=fixture(storage);vm.runInNewContext(managedWalletBridgeScript(),home.context);
 assert.equal(home.context.window.__deganWalletEnabled,false);assert.equal(storage.has('degan-wallet-active'),false);
});
test('amount selection and confirmation forms remain inside the app',()=>{
 const f=fixture();new f.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/payment.rose','post',[['amount','420000']]).submit();
 assert.equal(f.submits(),1);assert.equal(f.messages.length,0);
});
test('POST-only bank handoff preserves exact action and original hidden fields',()=>{
 const f=fixture();const action='https://bpm.shaparak.ir/pgwchannel/startpay.mellat';
 new f.Form(action,'post',[['RefId','a+b&token=fixture'],['amount','420000']]).submit();
 assert.equal(f.submits(),0);assert.equal(f.messages[0].type,'post');assert.equal(f.messages[0].action,action);
 assert.deepEqual(f.messages[0].fields,[{name:'RefId',value:'a+b&token=fixture'},{name:'amount',value:'420000'}]);
});

test('Sadad transfer preserves its original token POST and leaves amount preparation inside the app',()=>{
 const f=fixture();new f.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/payment.rose','post',[['amount','500000']]).submit();
 assert.equal(f.messages.length,0);assert.equal(f.submits(),1);
 const action='https://sadad.shaparak.ir/VPG/Purchase';
 new f.Form(action,'post',[['Token','fixture+sadad&token'],['MerchantId','fixture-merchant']]).submit();
 assert.equal(f.messages.length,1);assert.equal(f.messages[0].action,action);assert.equal(f.messages[0].type,'post');
 assert.deepEqual(f.messages[0].fields,[{name:'Token',value:'fixture+sadad&token'},{name:'MerchantId',value:'fixture-merchant'}]);
 assert.equal(f.submits(),1);
});
test('navigation fallback recovers the bank POST form instead of turning it into a broken GET',()=>{
 const f=fixture();new f.Form('https://bank.example/pay','post',[['Token','fixture']]);
 vm.runInNewContext(walletDestinationScript('https://bank.example/pay'),f.context);
 assert.equal(f.messages[0].type,'post');assert.equal(f.messages[0].fields[0].value,'fixture');
 vm.runInNewContext(walletDestinationScript('https://bank.example/pay'),f.context);assert.equal(f.messages.length,1);
});
test('ordinary gateway GET links open externally without submitting a payment',()=>{
 const f=fixture();vm.runInNewContext(walletDestinationScript('https://bank.example/pay?Token=fixture'),f.context);
 assert.equal(f.messages[0].type,'get');assert.equal(f.messages[0].url,'https://bank.example/pay?Token=fixture');
});


test('amount confirmation immediately hands the exact site amount to browser checkout and never submits the WebView POST',()=>{
 const f=fixture();
 const form=new f.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/charge.rose?consumer=','post',[['customAmount','420000'],['consumer',''],['_csrf','private-csrf-fixture']]);
 form.submit();form.submit();
 assert.deepEqual(f.messages.map(m=>m.type),['checkout']);
 const checkout=new URL(f.messages[0].url);
 assert.equal(checkout.pathname,'/modules/epayment/processing/checkout.rose');
 assert.equal(checkout.searchParams.get('selectedAmount'),'420000');
 assert.equal(checkout.searchParams.get('consumer'),'CreditCharge');
 assert.equal(checkout.searchParams.get('actionName'),'requestPaymentForm');
 assert.ok(!f.messages[0].url.includes('csrf'));assert.equal(f.submits(),0);
 const off=fixture();off.context.window.__deganWalletEnabled=false;
 new off.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/charge.rose','post',[]).submit();
 assert.equal(off.messages.length,0);
 assert.equal(off.submits(),1);
});

test('invalid site amount stays on the amount page and can be corrected without a duplicate handoff',()=>{
 const f=fixture();const form=new f.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/charge.rose','post',[['customAmount','']]);
 form.submit();assert.equal(f.messages[0].type,'amount-error');assert.equal(f.submits(),0);
 form.fields=[['customAmount','۴۲۰۰۰۰'],['consumer','CreditCharge']];form.submit();
 assert.equal(f.messages[1].type,'checkout');assert.equal(new URL(f.messages[1].url).searchParams.get('selectedAmount'),'420000');assert.equal(f.submits(),0);
});

test('a failed browser launch can be explicitly retried without submitting the old university amount POST',()=>{
 const f=fixture();const form=new f.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/charge.rose','post',[['customAmount','420000']]);
 form.submit();assert.equal(f.messages.length,1);
 f.context.window.__deganWallet.retry();form.submit();
 assert.equal(f.messages.length,2);assert.equal(f.submits(),0);
});

test('submit-event handoff cancels native form submission and does not send the selected button or CSRF to the browser URL',()=>{
 const f=fixture();const form=new f.Form('https://food.guilan.ac.ir/nurture/user/credit/charge/charge.rose','post',[['customAmount','10000']]);
 let prevented=false,stopped=false;
 f.handlers.submit({target:form,submitter:{name:'bank',value:'ignored'},preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(f.submits(),0);assert.equal(f.messages.length,1);
 assert.equal(new URL(f.messages[0].url).searchParams.get('selectedAmount'),'10000');
});
