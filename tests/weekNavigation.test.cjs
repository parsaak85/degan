const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
const scripts={};
vm.runInNewContext(transformSync(fs.readFileSync('src/weekNavigation.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code,{exports:scripts,require:()=>require('./loadModule.cjs')('siteWeek')});
function fixture({start='2026-10-17',target='2026-10-24',dirty=false,login=false,disabled=false,timestamp,rowDates=[],preferCurrent=false,currentButton=false}={}){
 const messages=[],clicks=[],timers=[];
 let now=0;
 const week={value:String(timestamp ?? new Date(`${start}T12:00:00`).getTime())};
 const window={ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))},getComputedStyle:()=>({display:'block',visibility:'visible'})};
 const document={getElementById:id=>id==='weekStartDateTimeAjx'?week:id==='login_btn_submit'?login?{}:null:
  ['nextWeekBtn','beforeWeekImgBtn'].includes(id)?{disabled,click:()=>clicks.push(id)}:null,
  querySelectorAll:selector=>selector.startsWith('a,button')?(currentButton?[{textContent:'هفته‌ جاری',click:()=>clicks.push('current-week')}]:[]):selector.startsWith('label[')?[]:rowDates.length?rowDates.map(date=>({checked:dirty,defaultChecked:false,getAttribute:()=>date})):dirty?[{checked:true,defaultChecked:false,getAttribute:()=>start}]:[]};
 class Clock extends Date { static now(){return now;} }
 const context={window,document,Date:Clock,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 vm.runInNewContext(scripts.weekNavigationScript(target,{preferCurrent}),context);
 return {messages,clicks,week,setRows(dates){rowDates=dates;},inject(value=target){vm.runInNewContext(scripts.weekNavigationScript(value),context);},stop(){vm.runInNewContext(scripts.stopWeekNavigationScript,context);},tick(ms=200){now+=ms;timers.shift()?.();}};
}

test('refresh uses the actual current-week control once and waits for matching table dates',()=>{
 const f=fixture({start:'2026-10-24',target:'2026-10-17',rowDates:['2026-10-25'],preferCurrent:true,currentButton:true});
 assert.deepEqual(f.clicks,['current-week']);f.tick();f.inject();assert.equal(f.clicks.length,1);
 f.setRows(['2026-10-18']);f.tick();assert.equal(f.messages.at(-1).type,'week-ready');assert.equal(f.messages.at(-1).weekStart,'2026-10-17');
});

test('a fresh page already on current week needs no extra current-week submission',()=>{
 const f=fixture({start:'2026-10-17',target:'2026-10-17',rowDates:['2026-10-18'],preferCurrent:true,currentButton:true});
 assert.equal(f.messages[0].type,'week-ready');assert.deepEqual(f.clicks,[]);
});

test('ordinary next-week navigation does not use the current-week control',()=>{
 const f=fixture({rowDates:['2026-10-18'],currentButton:true});assert.deepEqual(f.clicks,['nextWeekBtn']);
});

test('real table dates win over a stale hidden week and release a single pending arrow',()=>{
 const f=fixture({rowDates:['2026-10-18','2026-10-19']});
 assert.deepEqual(f.clicks,['nextWeekBtn']);
 f.week.value=String(Date.parse('2026-10-24T12:00:00+03:30'));f.tick();
 assert.equal(f.messages.length,0);assert.equal(f.clicks.length,1);
 f.week.value=String(Date.parse('2026-10-17T12:00:00+03:30'));
 f.setRows(['2026-10-25','2026-10-26']);f.tick();
 assert.equal(f.messages.at(-1).type,'week-ready');assert.equal(f.messages.at(-1).weekStart,'2026-10-24');assert.equal(f.clicks.length,1);
});

test('multiweek AJAX moves again only after all actual rows reached the intermediate week',()=>{
 const f=fixture({target:'2026-10-31',rowDates:['2026-10-18','2026-10-19']});
 f.setRows(['2026-10-25','2026-10-19']);f.tick();assert.equal(f.clicks.length,1);
 f.setRows(['2026-10-25','2026-10-26']);f.tick();assert.equal(f.clicks.length,2);
 f.inject();f.tick();assert.equal(f.clicks.length,2);
 f.setRows(['2026-11-01','2026-11-02']);f.tick();assert.equal(f.messages.at(-1).type,'week-ready');assert.equal(f.clicks.length,2);
});
test('week changes click the visible website arrow and wait for the new week',()=>{
 const f=fixture();
 assert.deepEqual(f.clicks,['nextWeekBtn']);
 f.tick();f.tick(); assert.equal(f.clicks.length,1);assert.equal(f.messages.length,0);
 f.week.value=String(new Date('2026-10-24T12:00:00').getTime());f.tick();
 assert.equal(f.messages.length,0); // Updating a hidden field is not a server response.
 const response=fixture({start:'2026-10-24'});
 assert.equal(response.messages.at(-1).type,'week-ready');assert.equal(response.clicks.length,0);
});
test('multiweek navigation submits at most one real form per document',()=>{
 const f=fixture({start:'2026-10-31',target:'2026-10-17'});
 assert.deepEqual(f.clicks,['beforeWeekImgBtn']);
 f.week.value=String(new Date('2026-10-24T12:00:00').getTime());f.tick();
 assert.deepEqual(f.clicks,['beforeWeekImgBtn']);
 const nextDocument=fixture({start:'2026-10-24',target:'2026-10-17'});
 assert.deepEqual(nextDocument.clicks,['beforeWeekImgBtn']);
 const finalDocument=fixture({start:'2026-10-17',target:'2026-10-17'});
 assert.equal(finalDocument.messages.at(-1).type,'week-ready');
});

test('duplicate injection and opposite targets cannot queue extra clicks while a form is in flight',()=>{
 const f=fixture();f.inject();f.inject('2026-10-10');f.tick();f.inject();
 assert.deepEqual(f.clicks,['nextWeekBtn']);
 f.stop();f.tick();f.inject('2026-10-10');f.tick();
 assert.deepEqual(f.clicks,['nextWeekBtn']);
});
test('same week is ready immediately without clicking an arrow',()=>{
 const f=fixture({target:'2026-10-17'});assert.equal(f.messages[0].type,'week-ready');assert.deepEqual(f.clicks,[]);
});

test('the actual portal timestamp is interpreted in Tehran, so a UTC Friday cannot cause week oscillation',()=>{
 const f=fixture({target:'2026-10-24',timestamp:Date.parse('2026-10-23T23:46:05.826Z')});
 assert.equal(f.messages[0].type,'week-ready');assert.equal(f.messages[0].weekStart,'2026-10-24');assert.equal(f.clicks.length,0);
});
test('disabled arrows, unsaved selections and login pages do not submit a form',()=>{
 for(const config of [{disabled:true},{dirty:true}]){const f=fixture(config);assert.equal(f.messages[0].type,'week-error');assert.deepEqual(f.clicks,[]);}
 const f=fixture({login:true});assert.equal(f.messages[0].type,'login-page');assert.deepEqual(f.clicks,[]);
});
test('unresponsive website times out without repeated clicks or guessed success',()=>{
 const f=fixture();f.tick(16000);assert.equal(f.messages.at(-1).type,'week-error');assert.equal(f.clicks.length,1);
});
