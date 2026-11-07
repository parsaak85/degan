const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./loadModule.cjs');
const {walletCheckoutPath,openWalletCheckout}=load('walletCheckout');
const {createSamadClient}=load('samad');
const checkout='https://food.guilan.ac.ir/modules/epayment/processing/checkout.rose?actionName=requestPaymentForm&consumer=CreditCharge&selectedAmount=420000&opaque=a%2Bb%26c';

test('only the university payment-method page crosses the browser boundary, preserving the exact query',()=>{
 assert.equal(walletCheckoutPath(checkout),new URL(checkout).pathname+new URL(checkout).search);
 assert.ok(walletCheckoutPath(checkout.replace('https:','http:')));
 for(const value of ['https://food.guilan.ac.ir/nurture/user/credit/charge/view.rose','https://food.guilan.ac.ir/nurture/user/credit/charge/charge.rose',checkout.replace('requestPaymentForm','processPayment'),checkout.replace('food.guilan.ac.ir','food.guilan.ac.ir.example'),checkout.replace('food.guilan.ac.ir','user:pass@food.guilan.ac.ir'),'not a url'])assert.equal(walletCheckoutPath(value),null);
});

test('browser confirmation sign-in reuses the account token and targets the actual selected amount, never the amount screen',async()=>{
 const calls=[];
 const client=createSamadClient({username:'fixture',password:'fixture'},async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture-access'}:{payload:{loginAsToken:'fixture+one&time'}}};
 });
 const opened=[];
 assert.equal(await openWalletCheckout(checkout,{client,open:async url=>opened.push(url),active:()=>true}),true);
 const browser=new URL(opened[0]);
 assert.equal(browser.origin,'https://food.guilan.ac.ir');
 assert.equal(browser.pathname,'/j_security_check');
 assert.equal(browser.searchParams.get('loginAsToken'),'fixture+one&time');
 assert.equal(browser.searchParams.get('redirect'),walletCheckoutPath(checkout));
 assert.equal(calls[1].options.headers.Authorization,'Bearer fixture-access');
 assert.equal(calls[1].options.headers['Cache-Control'],'no-cache, no-store');
 assert.equal(calls[1].options.headers.Pragma,'no-cache');
 assert.ok(new URL(calls[1].url).searchParams.get('deganNonce'));
 assert.equal(calls.length,2);
 await client.checkoutLoginUrl(checkout);
 assert.notEqual(calls[1].url,calls.at(-1).url);
 assert.equal(calls.filter(item=>item.url.endsWith('/oauth/token')).length,1);
 assert.ok(!opened[0].includes('fixture-access'));
});

test('leaving wallet during token preparation prevents a late browser launch',async()=>{
 let active=true,finish;
 const pending=new Promise(resolve=>{finish=resolve;});
 let opens=0;
 const result=openWalletCheckout(checkout,{client:{checkoutLoginUrl:()=>pending},open:async()=>opens++,active:()=>active});
 active=false;finish('https://food.guilan.ac.ir/j_security_check?fixture');
 assert.equal(await result,false);assert.equal(opens,0);
});

test('invalid destinations and missing sign-in tokens never launch a broken browser URL',async()=>{
 let calls=0,opens=0;
 await assert.rejects(openWalletCheckout('https://outside.example/checkout',{client:{checkoutLoginUrl:async()=>calls++},open:async()=>opens++,active:()=>true}));
 assert.equal(calls,0);assert.equal(opens,0);
 const client=createSamadClient({username:'fixture',password:'fixture'},async url=>({ok:true,json:async()=>url.endsWith('/oauth/token')?{access_token:'fixture'}:{payload:{}}}));
 await assert.rejects(openWalletCheckout(checkout,{client,open:async()=>opens++,active:()=>true}));
 assert.equal(opens,0);
});
