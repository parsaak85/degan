const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const load=require('./loadModule.cjs');
const {createPanelEntry}=load('panelEntry');
const home=(pageId='home')=>({kind:'website',authenticated:true,pageId});

test('native home restores a manually displaced website panel once, without disrupting site mode',()=>{
 const entry=createPanelEntry();entry.observe({kind:'panel',pageId:'panel'});
 assert.equal(entry.observe(home('manual')),'');
 assert.equal(entry.observe(home('manual'),{home:true}),'open-panel');
 assert.equal(entry.observe(home('manual'),{home:true}),'');
 assert.equal(entry.observe(home('failed-return'),{home:true}),'failed');
 entry.observe({kind:'panel',pageId:'restored'});
 assert.equal(entry.observe(home('another-page'),{home:true}),'open-panel');
});

test('an unauthenticated non-panel page cannot remain behind native home',()=>{
 const entry=createPanelEntry();entry.observe({kind:'panel',pageId:'panel'});
 assert.equal(entry.observe({kind:'website',pageId:'lost-session',authenticated:false},{home:true}),'failed');
});
test('successful login landing on home opens the reservation panel once, then leaves manual browsing alone',()=>{
 const entry=createPanelEntry();
 assert.equal(entry.observe({kind:'login',pageId:'login'}),'');
 assert.equal(entry.observe(home()),'open-panel');
 assert.equal(entry.observe(home()),'');
 assert.equal(entry.observe({kind:'panel',pageId:'reservation'}),'');
 assert.equal(entry.observe(home('manual-home')),'');
});
test('failed login and unauthenticated pages never trigger a panel redirect loop',()=>{
 const entry=createPanelEntry();
 for(const page of [{kind:'login',pageId:'login'},{kind:'website',pageId:'other',authenticated:false},{kind:'login',pageId:'rejected'}])assert.equal(entry.observe(page),'');
 assert.equal(entry.observe(home()),'open-panel');
});
test('server returning home after recovery reports failure instead of repeatedly redirecting',()=>{
 const entry=createPanelEntry();
 assert.equal(entry.observe(home()),'open-panel');
 assert.equal(entry.observe(home('returned-home')),'failed');
 assert.equal(entry.observe(home('another-home')),'');
});
test('session expiry re-arms panel entry for the next successful login',()=>{
 const entry=createPanelEntry();entry.observe({kind:'panel',pageId:'first-panel'});
 assert.equal(entry.observe({kind:'login',pageId:'expired-login'}),'');
 assert.equal(entry.observe(home('signed-in-again')),'open-panel');
 entry.observe({kind:'panel',pageId:'second-panel'});
 assert.equal(entry.observe(home('manual-browse')),'');
});

test('panel recovery preserves the current legacy scheme and selected dining hall',()=>{
 const script=load('pageScripts').openReservationPanelScript(4),destinations=[];
 const location={hostname:'food.guilan.ac.ir',protocol:'http:',origin:'http://food.guilan.ac.ir',replace:url=>destinations.push(url)};
 vm.runInNewContext(script,{location});
 const url=new URL(destinations[0]);assert.equal(url.protocol,'http:');
 assert.equal(url.pathname,'/nurture/user/multi/reserve/showPanel.rose');
 assert.equal(url.searchParams.get('selectedSelfDefId'),'4');
 location.hostname='bank.example';vm.runInNewContext(script,{location});assert.equal(destinations.length,1);
});
