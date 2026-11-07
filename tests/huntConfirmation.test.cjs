const {test}=require('node:test');
const assert=require('node:assert/strict');
const {confirmedHuntFood}=require('./loadModule.cjs')('huntConfirmation');
test('a committed report confirms a hunt even when the website response is not the menu page',()=>{
 const food={programId:12,date:'2026-11-03'};
 assert.equal(confirmedHuntFood([food],[{programId:12,date:food.date,selectedCount:1}]),food);
});
test('other dates, programs, zero counts and sold records never confirm a purchase',()=>{
 const food={programId:12,date:'2026-11-03'};
 for(const change of [{date:'2026-11-04'},{programId:13},{selectedCount:0},{sold:true}]){
  assert.equal(confirmedHuntFood([food],[{...food,selectedCount:1,...change}]),undefined);
 }
});
