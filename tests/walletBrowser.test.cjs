const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./loadModule.cjs');
const {openWalletBrowser,samadBrowserLoginUrl}=load('walletBrowser');
function decode(value){const url=new URL(value);assert.equal(url.origin,'https://samad.app');assert.equal(url.search,'');assert.equal(url.hash,'');const parts=url.pathname.split('/');assert.equal(parts[1],'loginCas');return parts.slice(2).map(decodeURIComponent);}
function fixture({missingRefresh=false,expired=false}={}){
 const calls=[];let grants=0,profiles=0;
 const client=load('samad').createSamadClient({username:'selected-profile-user',password:'do-not-send-this-password'},async(url,options)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/oauth/token'){grants++;assert.ok(options.body.includes('username=selected-profile-user'));return {ok:true,json:async()=>({access_token:'access+cached/'+grants,...(missingRefresh?{}:{refresh_token:'refresh&cached?'+grants})})};}
  profiles++;if(expired&&profiles===2)return {ok:false,status:401};
  return {ok:true,json:async()=>({payload:{}})};
 });return {client,calls};
}
test('Samad browser login reuses the cached OAuth pair and selects official Guilan key GLN',async()=>{
 const f=fixture();await f.client.browserSession();let opened;
 await openWalletBrowser({client:f.client,checkConnection:async()=>{},openURL:async value=>{opened=value;}});
 assert.deepEqual(decode(opened),['access_token=access+cached/1','refresh_token=refresh&cached?1','uni_code=GLN']);
 assert.equal(f.calls.filter(path=>path==='/oauth/token').length,1);
 assert.ok(!opened.includes('selected-profile-user'));assert.ok(!opened.includes('do-not-send-this-password'));
 assert.ok(!f.calls.some(path=>/login-token|process-payment/.test(path)));
});
test('browser launch failure retries with the same valid cached pair, without another login grant',async()=>{
 const f=fixture(),seen=[];const deps={client:f.client,checkConnection:async()=>{},openURL:async value=>{seen.push(value);if(seen.length===1)throw Error('no-browser');}};
 await assert.rejects(openWalletBrowser(deps),/no-browser/);await openWalletBrowser(deps);
 assert.equal(seen[0],seen[1]);assert.equal(f.calls.filter(path=>path==='/oauth/token').length,1);
});
test('expired access token obtains a matching replacement pair before opening Samad',async()=>{
 const f=fixture({expired:true});await f.client.browserSession();let opened;
 await openWalletBrowser({client:f.client,checkConnection:async()=>{},openURL:async value=>{opened=value;}});
 assert.deepEqual(decode(opened),['access_token=access+cached/2','refresh_token=refresh&cached?2','uni_code=GLN']);
 assert.equal(f.calls.filter(path=>path==='/oauth/token').length,2);
});
test('missing refresh tokens fail clearly instead of opening Samad with a broken session',async()=>{
 const f=fixture({missingRefresh:true});let opened=false;
 await assert.rejects(openWalletBrowser({client:f.client,checkConnection:async()=>{},openURL:async()=>{opened=true;}}),/توکن/);assert.equal(opened,false);
 for(const value of [{},{accessToken:'x'},{accessToken:'',refreshToken:'x'}])assert.throws(()=>samadBrowserLoginUrl(value));
});
test('VPN and leaving the native screen prevent handing account tokens to the browser',async()=>{
 const f=fixture();let opened=false;
 await assert.rejects(openWalletBrowser({client:f.client,checkConnection:async()=>{throw Error('VPN');},openURL:async()=>{opened=true;}}),/VPN/);
 assert.equal(f.calls.length,0);
 assert.equal(await openWalletBrowser({client:f.client,checkConnection:async()=>{},isActive:()=>false,openURL:async()=>{opened=true;}}),false);assert.equal(opened,false);assert.equal(f.calls.length,0);
});
test('leaving while session validation is in flight prevents a late browser launch',async()=>{
 let active=true,opened=false;
 const client={browserSession:async()=>{active=false;return {accessToken:'a',refreshToken:'r'};}};
 assert.equal(await openWalletBrowser({client,checkConnection:async()=>{},isActive:()=>active,openURL:async()=>{opened=true;}}),false);assert.equal(opened,false);
});
