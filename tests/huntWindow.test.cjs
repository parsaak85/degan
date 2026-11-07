const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const load=require('./loadModule.cjs');
const {isHuntExpired,canHuntFood}=load('huntWindow');
const {huntScript}=load('pageScripts');
test('hunting closes exactly at 15:00 Tehran and keeps future days available',()=>{
 assert.equal(isHuntExpired('2026-10-25',Date.parse('2026-10-25T11:29:59Z')),false);
 assert.equal(isHuntExpired('2026-10-25',Date.parse('2026-10-25T11:30:00Z')),true);
 assert.equal(isHuntExpired('2026-10-26',Date.parse('2026-10-25T11:30:00Z')),false);
 assert.equal(isHuntExpired('2026-10-24',Date.parse('2026-10-25T01:00:00Z')),true);
});
test('hunt list excludes ordinary reservations, owned days and expired dates',()=>{
 const now=Date.parse('2026-10-25T09:00:00Z'),food={date:'2026-10-25',actions:{buy:false},reserved:false};
 assert.equal(canHuntFood(food,[],now),true);
 assert.equal(canHuntFood({...food,actions:{buy:true}},[],now),false);
 assert.equal(canHuntFood({...food,reserved:true},[],now),false);
 assert.equal(canHuntFood(food,[{date:food.date,reserved:true}],now),false);
 assert.equal(canHuntFood(food,[],Date.parse('2026-10-25T11:30:00Z')),false);
});
function run({clock='2026-10-25T09:00:00Z',available=[false,true],normal=[false,false]}={}){
 let time=Date.parse(clock);const messages=[],clicked=[],timers=[];
 class Clock extends Date {constructor(...args){super(...(args.length?args:[time]));}}
 const foods=[{index:0,date:'2026-10-25',programId:10},{index:1,date:'2026-10-26',programId:20}];
 const boxes=foods.map((food,index)=>({disabled:!normal[index],defaultChecked:false,getAttribute:()=>food.date}));
 const ids=new Map();foods.forEach((food,index)=>{
  ids.set('userWeekReserves.selected'+index,boxes[index]);
  if(available[index])ids.set('buyFreeFoodIconSpanuserWeekReserves.selected'+index,{querySelector:()=>({click:()=>clicked.push('cart-'+index)})});
 });ids.set('doReservBtn',{click:()=>clicked.push('save')});
 const context={Date:Clock,window:{ReactNativeWebView:{postMessage:data=>messages.push(JSON.parse(data))}},
  document:{body:{innerText:''},getElementById:id=>ids.get(id)||null,querySelectorAll:()=>boxes,querySelector:selector=>({value:selector.includes('[0]')?'10':'20'})},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:fn=>{timers.push(fn);return 1;},setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(huntScript([0,1],'',null,foods),context);
 return {clicked,messages,advance(value){time=Date.parse(value);},submit(){timers.shift()?.();},restart(){vm.runInNewContext(load('pageScripts').stopHuntScript(),{...context,clearTimeout(){},clearInterval(){}});vm.runInNewContext(huntScript([0,1],'',null,foods),context);}};
}
test('multiple selected foods buy the first available target only',()=>{
 const f=run();assert.deepEqual(f.clicked,['cart-1']);f.submit();assert.deepEqual(f.clicked,['cart-1','save']);
 const both=run({available:[true,true]});assert.deepEqual(both.clicked,['cart-0']);
});
test('normal-buy targets are skipped and crossing the cutoff prevents delayed save',()=>{
 const f=run({available:[true,true],normal:[true,false]});assert.deepEqual(f.clicked,['cart-1']);
 const late=run({clock:'2026-10-25T11:29:59Z',available:[true,false]});
 late.advance('2026-10-25T11:30:00Z');late.submit();assert.deepEqual(late.clicked,['cart-0']);assert.equal(late.messages.at(-1).type,'hunt-expired');
});

test('stopping an unavailable-food hunt allows starting again in the same website document',()=>{
 const f=run({available:[false,false]});assert.equal(f.messages.at(-1).type,'miss');
 f.restart();assert.equal(f.messages.length,2);assert.equal(f.messages.at(-1).type,'miss');
});
