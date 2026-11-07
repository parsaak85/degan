const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
function fixture(initial={}){
 const values=new Map(Object.entries(initial)),exports={};
 const storage={getItem:async key=>values.get(key)||null,setItem:async(key,value)=>values.set(key,value),removeItem:async key=>values.delete(key)};
 const code=transformSync(fs.readFileSync('src/storage.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 vm.runInNewContext(code,{exports,require:()=>({__esModule:true,default:storage})});
 return {api:exports,values};
}
test('existing saved account migrates without losing password or dining hall',async()=>{
 const f=fixture({'degan-account':JSON.stringify({username:'old',password:'saved',selfId:3})});
 assert.equal((await f.api.loadAccount()).password,'saved');
 await f.api.saveAccount({username:'next',password:'second',selfId:2,remember:true});
 const data=await f.api.loadAccounts();assert.equal(data.profiles.length,2);
 assert.equal(data.profiles.find(item=>item.username==='old').selfId,3);
 assert.equal((await f.api.loadAccount()).username,'next');assert.equal(f.values.has('degan-account'),false);
});
test('saving and updating profiles preserves each other account and selected hall',async()=>{
 const f=fixture();
 await f.api.saveAccount({username:'alpha',password:'a',selfId:1,remember:true});
 await f.api.saveAccount({username:'beta',password:'b',selfId:4,remember:true});
 await f.api.saveAccount({username:' alpha ',password:'updated',selfId:5,remember:true});
 const data=await f.api.loadAccounts();assert.equal(data.profiles.length,2);
 assert.equal((await f.api.loadAccount()).selfId,5);assert.equal((await f.api.loadAccount()).password,'updated');
 assert.equal(data.profiles.find(item=>item.username==='beta').password,'b');
});
test('forgetting one login preserves other profiles and avoids autofilling the wrong account',async()=>{
 const f=fixture();
 for(const username of ['alpha','beta'])await f.api.saveAccount({username,password:'saved',selfId:1,remember:true});
 await f.api.saveAccount({username:'alpha',password:'temporary',selfId:1,remember:false});
 const data=await f.api.loadAccounts();assert.equal(data.profiles.length,1);assert.equal(data.profiles[0].username,'beta');
 assert.equal(await f.api.loadAccount(),null);
});
