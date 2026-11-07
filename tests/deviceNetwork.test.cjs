const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
function fixture(active){
 const exports={},calls=[];
 const code=transformSync(fs.readFileSync('src/deviceNetwork.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 const device={isVpnActive:async()=>{calls.push('check');return active;},openPaymentForm:async(action,fields)=>calls.push({action,fields})};
 vm.runInNewContext(code,{exports,require:name=>name==='react-native'?{Platform:{OS:'android'}}:{requireOptionalNativeModule:()=>device}});
 return {api:exports,calls};
}
test('Android VPN detection blocks authentication before any login request',async()=>{
 const f=fixture(true);await assert.rejects(f.api.assertVpnOff(),/VPN.*خاموش/);assert.deepEqual(f.calls,['check']);
});
test('ordinary network permits login and the native bank handoff preserves the POST fields',async()=>{
 const f=fixture(false);await f.api.assertVpnOff();
 await f.api.openPaymentForm('https://bank.example/pay',[{name:'Token',value:'fixture'}]);
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].fields[0].value,'fixture');
});
