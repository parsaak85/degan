const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
function fixture({permission='granted',scheduled=[]}={}){
 const calls=[];
 const api={AndroidImportance:{MAX:5},SchedulableTriggerInputTypes:{WEEKLY:'weekly'},setNotificationHandler(){},
  getAllScheduledNotificationsAsync:async()=>scheduled,setNotificationChannelAsync:async()=>{},
  getPermissionsAsync:async()=>({status:permission}),requestPermissionsAsync:async()=>({status:permission}),
  cancelScheduledNotificationAsync:async id=>calls.push({cancel:id}),scheduleNotificationAsync:async request=>calls.push(request)};
 const exports={};const code=transformSync(fs.readFileSync('src/reminders.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 vm.runInNewContext(code,{exports,require:name=>name==='react-native'?{Platform:{OS:'android'}}:api});
 return {...exports,calls};
}
test('weekly picture reminder runs Thursday at 9 AM and removes old diagnostic appointments',async()=>{
 const f=fixture({scheduled:[{identifier:'degan-test-20261104-1230',content:{data:{kind:'test'}}},{identifier:'unrelated',content:{}}]});
 await f.scheduleThursdayReminder();const item=f.calls.find(value=>value.identifier);
 assert.equal(item.trigger.type,'weekly');assert.equal(item.trigger.weekday,5);assert.equal(item.trigger.hour,9);assert.equal(item.trigger.minute,0);
 assert.equal(item.content.data.kind,'thursday');assert.equal(item.content.data.artworkVersion,1);
 assert.ok(f.calls.some(value=>value.cancel==='degan-test-20261104-1230'));assert.ok(!f.calls.some(value=>value.cancel==='unrelated'));
});
test('foreground repair avoids duplicate current reminders',async()=>{
 const f=fixture({scheduled:[{identifier:'degan-thursday-reserve',content:{data:{scheduleVersion:3}}}]});await f.scheduleThursdayReminder();assert.equal(f.calls.length,0);
});
test('exact alarm permission upgrade forces re-registration',async()=>{
 const f=fixture({scheduled:[{identifier:'degan-thursday-reserve',content:{data:{scheduleVersion:3}}}]});await f.scheduleThursdayReminder({force:true});
 assert.equal(f.calls[0].cancel,'degan-thursday-reserve');assert.equal(f.calls[1].trigger.hour,9);
});
test('older weekly configuration is replaced',async()=>{
 const f=fixture({scheduled:[{identifier:'degan-thursday-reserve',content:{data:{scheduleVersion:2}}}]});await f.scheduleThursdayReminder();assert.equal(f.calls.length,2);
});
test('denied permission never registers a reminder',async()=>{
 const f=fixture({permission:'denied'});assert.equal(await f.scheduleThursdayReminder(),false);assert.equal(f.calls.length,0);
});
