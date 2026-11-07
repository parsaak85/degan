const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./loadModule.cjs');
const {isFirewallBlock,blockedUrlFromText,httpErrorMessage,FIREWALL_MESSAGE}=load('siteGuard');
const {walletCheckoutPath}=load('walletCheckout');
const page='The transfer is blocked by a Web Application Firewall. URL http://food.guilan.ac.ir/modules/epayment/processing/checkout.rose?actionName=requestPaymentForm&consumer=CreditCharge&selectedAmount=420000 Event ID 60140003 Event Type signature';

test('recognises the Fortinet block page and nothing ordinary',()=>{
 assert.equal(isFirewallBlock(page),true);
 assert.equal(isFirewallBlock('FortiGuard'),true);
 for(const value of ['رزرو غذا','',null,undefined,42])assert.equal(isFirewallBlock(value),false);
});

test('extracts only the university URL from a block page, usable by the checkout handoff',()=>{
 const url=blockedUrlFromText(page);
 assert.ok(walletCheckoutPath(url));
 assert.equal(new URL(url).searchParams.get('selectedAmount'),'420000');
 assert.equal(blockedUrlFromText('see https://evil.example/checkout.rose'),'');
 assert.equal(blockedUrlFromText('https://food.guilan.ac.ir.evil.example/x'),'');
 assert.equal(blockedUrlFromText(null),'');
});

test('HTTP errors map to Persian explanations, never a bare code',()=>{
 for(const code of [401,403,404,429,500,503,418]){const message=httpErrorMessage(code);assert.match(message,/[؀-ۿ]/);}
 assert.match(httpErrorMessage(403),/۴۰۳/);
 assert.match(FIREWALL_MESSAGE,/فایروال/);
});
