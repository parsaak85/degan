const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLegacyPageClient,pageFoods}=require('./loadModule.cjs')('legacyPageClient');

test('hidden-page AJAX is read again without opening the actual site or repeating an arrow',async()=>{
 let reads=0,arrows=0;const client=createLegacyPageClient({timeoutMs:1500,
  read:()=>{reads++;if(reads===2)client.update({kind:'panel',pageId:'ajax',weekStart:'2026-10-24',foods:[],navigating:false});},
  navigateWeek:()=>arrows++,send(){},reload(){},qr(){}});
 try{await client.programs(1,'2026-10-24');assert.equal(reads,2);assert.equal(arrows,0);}finally{client.dispose();}
});

test('returning from another site page discards old synchronization and can read the panel again',async()=>{
 const f=fixture();const pending=f.client.ensureWeek('2026-10-31');
 const rejection=assert.rejects(pending,/بازگشت/);
 f.update({kind:'website',authenticated:true,foods:[]});f.client.reset();await rejection;
 assert.equal(f.client.getSnapshot(),null);
 const fresh=f.client.ensureWeek('2026-10-24');
 f.update({kind:'panel',pageId:'returned-panel',weekStart:'2026-10-24',foods:[]});
 assert.equal((await fresh).pageId,'returned-panel');f.client.dispose();
});
function fixture(){
 const calls=[];
 let snapshot={kind:'panel',pageId:'page-1',snapshotKey:'page-1:1',weekStart:'2026-10-24',dirty:false,pending:false,dialog:false,foods:[{
  key:'1:2026-10-25:7:1',programId:'7',foodTypeId:'1',date:'2026-10-25',name:'food',priceRials:420000,
  reserved:true,id:23,selectedCount:1,actions:{buy:false,cancel:true,sell:true},forSale:false,
 }]};
 const client=createLegacyPageClient({timeoutMs:1000,read:()=>calls.push('read'),reload:()=>calls.push('reload'),
  navigateWeek:(start,options)=>calls.push({week:start,...(options?.preferCurrent?{preferCurrent:true}:{})}),send:request=>calls.push(request),qr:async(food,start)=>{calls.push({qr:food.id,start});return '678901';}});
 client.update(snapshot);
 return {client,calls,get snapshot(){return snapshot;},update(change={}){snapshot={...snapshot,...change};client.update(snapshot);},food:()=>pageFoods(snapshot)[0]};
}

test('refresh drops old balance/data, reloads once and anchors the fresh page to current week',async()=>{
 const f=fixture(),seen=[];f.client.subscribe(value=>seen.push(value));
 f.client.invalidate({currentWeek:true});const result=f.client.ensureWeek('2026-10-24');
 assert.deepEqual(f.calls,['reload']);assert.equal(f.client.getSnapshot(),null);
 f.update({balance:100});assert.equal(seen.length,0);assert.equal(f.client.getSnapshot(),null);
 f.update({pageId:'fresh',weekStart:'2026-10-31',balance:920000});
 assert.deepEqual(f.calls,['reload',{week:'2026-10-24',preferCurrent:true}]);
 f.update({weekStart:'2026-10-24'});const page=await result;
 assert.equal(page.balance,920000);assert.equal(page.pageId,'fresh');assert.equal(page.weekStart,'2026-10-24');
 assert.ok(seen.every(value=>value.balance!==100));f.client.dispose();
});

test('failed refresh cannot expose cached balance as if it had refreshed successfully',async()=>{
 const client=createLegacyPageClient({timeoutMs:15,read(){},reload(){},navigateWeek(){},send(){},qr(){}});
 const old={kind:'panel',pageId:'old',weekStart:'2026-10-24',foods:[],balance:100};
 client.update(old);client.invalidate({currentWeek:true});await assert.rejects(client.ensureWeek('2026-10-24'),/آماده نشد/);
 assert.equal(client.getSnapshot(),null);assert.equal(client.update(old),false);
 assert.equal(client.update({...old,pageId:'late-fresh',balance:200}),true);assert.equal(client.getSnapshot().balance,200);client.dispose();
});
test('native menu and reservations share one real-page read, including actual prices',async()=>{
 const f=fixture();const menu=f.client.programs(1,'2026-10-24'),reserves=f.client.reservations('2026-10-24');
 assert.deepEqual(f.calls,['read']);f.update();
 const [rows,reserved]=await Promise.all([menu,reserves]);
 assert.equal(rows[0].price,420000);assert.equal(rows[0].reserved,true);assert.equal(rows[0].cancelRuleViolated,false);
 assert.equal(reserved[0].id,23);f.client.dispose();
});
test('week list waits for the actual website arrow response and publishes manual page changes',async()=>{
 const f=fixture(),seen=[];f.client.subscribe(value=>seen.push(value.weekStart));
 const promise=f.client.programs(1,'2026-10-31');let settled=false;promise.then(()=>settled=true);
 assert.deepEqual(f.calls,[{week:'2026-10-31'}]);f.update();await Promise.resolve();assert.equal(settled,false);
 f.update({weekStart:'2026-10-31'});await promise;assert.equal(settled,true);
 f.update({weekStart:'2026-11-07'});assert.equal(seen.at(-1),'2026-11-07');f.client.dispose();
});

test('overlapping week requests are rejected and a changing old document cannot complete navigation',async()=>{
 const f=fixture();const promise=f.client.ensureWeek('2026-10-31');
 await assert.rejects(f.client.ensureWeek('2026-10-17'),/هنوز تمام نشده/);
 f.update({weekStart:'2026-10-31',navigating:true});assert.equal(f.client.pendingWeek,'2026-10-31');
 assert.equal(f.calls.length,1);
 f.update({pageId:'page-2',navigating:false});await promise;assert.equal(f.client.pendingWeek,'');f.client.dispose();
});

test('unchanged server response fails without clicking an arrow again',async()=>{
 const f=fixture();const promise=f.client.ensureWeek('2026-10-31');
 f.update({pageId:'page-2'});await assert.rejects(promise,/هفته درخواستی/);
 assert.deepEqual(f.calls,[{week:'2026-10-31'}]);f.client.dispose();
});

test('a server date that overshoots the target cannot trigger a forward/backward ping-pong loop',async()=>{
 const f=fixture();const promise=f.client.ensureWeek('2026-10-31');
 f.update({pageId:'page-2',weekStart:'2026-11-01'});await assert.rejects(promise,/هفته درخواستی/);
 assert.deepEqual(f.calls,[{week:'2026-10-31'}]);f.client.dispose();
});
test('refresh requires a new document rather than reusing an old snapshot',async()=>{
 const f=fixture();f.client.invalidate();const promise=f.client.programs(1,'2026-10-24');
 let settled=false;promise.then(()=>settled=true);assert.deepEqual(f.calls,['reload']);f.update();
 await Promise.resolve();assert.equal(settled,false);f.update({pageId:'page-2',snapshotKey:'page-2:1'});
 await promise;assert.deepEqual(f.calls,['reload']);f.client.dispose();
});
test('cancellation sends the exact DOM key and waits for bridge confirmation',async()=>{
 const f=fixture();const promise=f.client.cancel(f.food(),'2026-10-24');f.update();await Promise.resolve();
 const request=f.calls.find(value=>value.kind==='cancel');
 assert.equal(request.foodKey,f.food().key);assert.equal(request.snapshotKey,'page-1:1');
 await assert.rejects(f.client.cancel(f.food(),'2026-10-24'),/عملیات قبلی/);
 f.client.result({id:request.id,ok:false,message:'site refused'});
 await assert.rejects(promise,/site refused/);assert.equal(f.food().reserved,true);f.client.dispose();
});
test('dirty page cannot change week or submit a purchase',async()=>{
 const f=fixture();f.update({dirty:true});await assert.rejects(f.client.ensureWeek('2026-10-31'),/تغییرات/);
 assert.equal(f.calls.length,0);const purchase=f.client.buy(f.food(),'2026-10-24');f.update();
 await assert.rejects(purchase,/تغییرات/);assert.equal(f.calls.some(value=>value.kind==='buy'),false);f.client.dispose();
});
test('second food on a reserved day is blocked before any website click',async()=>{
 const f=fixture();const second={...f.snapshot.foods[0],key:'other',programId:'8',reserved:false};
 f.update({foods:[...f.snapshot.foods,second]});const promise=f.client.buy(second,'2026-10-24');f.update();
 await assert.rejects(promise,/برای این روز/);assert.equal(f.calls.some(value=>value.kind==='buy'),false);f.client.dispose();
});
test('QR lookup requires a reservation from the current actual document',async()=>{
 const f=fixture();assert.equal(await f.client.qr(f.food()),'678901');
 assert.deepEqual(f.calls,[{qr:23,start:'2026-10-24'}]);f.update({foods:[]});
 await assert.rejects(f.client.qr({key:'old'}),/رزرو نشده/);f.client.dispose();
});
