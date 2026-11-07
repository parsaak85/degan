const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
const load=require('./loadModule.cjs');
function fixture(native){
 const exports={};
 const code=transformSync(fs.readFileSync('src/backgroundHunt.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 vm.runInNewContext(code,{exports,require:name=>name==='expo-modules-core'?{requireOptionalNativeModule:()=>native}:load(name.slice(2))});
 return exports;
}
test('background configuration preserves actual target identity and resolves refreshed row indices',()=>{
 const api=fixture({});
 const rows=[{key:'self-program-date',index:3,programId:88,date:'2099-01-05',name:'meal'}];
 const config=JSON.parse(api.huntConfiguration(rows,'2099-01-03',1));
 assert.deepEqual(config.foods,rows);
 assert.ok(!config.hunt.includes('var wanted = [];'));assert.ok(!config.hunt.includes('var targets=[];'));
 // Execute exactly the native service's generated hunt script against a fresh
 // website document whose actual row moved from index 3 to index 9.
 const fresh={...rows[0],index:9};const events=[];let saveCount=0,cartCount=0;
 const box={disabled:true,defaultChecked:false,getAttribute:()=>fresh.date};
 const cart={disabled:false,parentElement:null,querySelector:()=>cart,click:()=>cartCount++};
 const doc={body:{innerText:''},getElementById:id=>id==='userWeekReserves.selected9'?box:id==='buyFreeFoodIconSpanuserWeekReserves.selected9'?cart:id==='doReservBtn'?{click:()=>{assert.equal(events.at(-1).type,'hunt-submitted');saveCount++;}}:null,
  querySelector:()=>({value:'88'}),querySelectorAll:()=>[box]};
 const win={ReactNativeWebView:{postMessage:raw=>events.push(JSON.parse(raw))},getComputedStyle:()=>({})};
 const context={window:win,document:doc,Date,Intl,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:fn=>{fn();return 1;},setInterval:()=>1,clearInterval(){}};
 const script=config.hunt.replace('__DEGAN_INDICES__','[9]').replace('__DEGAN_TARGETS__',JSON.stringify([fresh]));
 vm.runInNewContext(script,context);
 vm.runInNewContext(script,context); // duplicate snapshot must not submit twice
 assert.equal(cartCount,1);assert.equal(saveCount,1);assert.equal(events[0].index,9);
 assert.ok(!events.some(event=>event.type==='bought')); // submission alone is not confirmation
});
test('native hunt start receives no password and stop/state use the same owner',async()=>{
 let captured,stopped=false;const api=fixture({startHunt:raw=>{captured=JSON.parse(raw);},stopHunt:()=>{stopped=true;},huntState:()=>'{"phase":"verifying"}'});
 await api.startBackgroundHunt([{key:'a',index:1,date:'2099-01-05',programId:88}],'2099-01-03',1);
 assert.equal(captured.start,'2099-01-03');assert.ok(!('password' in captured));
 assert.equal(JSON.parse(await api.backgroundHuntState()).phase,'verifying');await api.stopBackgroundHunt();assert.equal(stopped,true);
});
test('missing native background engine fails instead of silently using foreground timers',async()=>{
 await assert.rejects(fixture(null).startBackgroundHunt([],'2099-01-03',1),/APK/);
});
