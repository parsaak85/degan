const {test}=require('node:test');
const assert=require('node:assert/strict');
const {walletBalance}=require('./loadModule.cjs')('walletBalance');
test('low-balance warning compares real rial balance against maximum actual meal price',()=>{
 const snapshot={balance:400000,foods:[{priceRials:350000},{priceRials:420000}]};
 assert.equal(walletBalance(snapshot).low,true);assert.equal(walletBalance(snapshot).maxMealRials,420000);
 assert.equal(walletBalance({...snapshot,balance:420000}).low,false);
 assert.equal(walletBalance({...snapshot,balance:500000}).low,false);
});
test('unknown prices or balance cannot create a fixed-price warning',()=>{
 assert.equal(walletBalance({balance:0,foods:[{priceRials:null}]}).low,false);
 assert.equal(walletBalance({balance:null,foods:[{priceRials:350000}]}).low,false);
 assert.equal(walletBalance({balance:0,foods:[{priceRials:350000}]}).low,true);
});
