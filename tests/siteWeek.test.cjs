const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialBookingWeek,bookingWeeks,clampBookingWeek}=require('./loadModule.cjs')('siteWeek');
test('navigation is bounded to the two Tehran booking weeks, including year rollover',()=>{
 const now=Date.parse('2026-12-31T12:00:00+03:30');
 const limits=bookingWeeks(now);assert.equal(limits.current,'2026-12-26');assert.equal(limits.next,'2027-01-02');
 for(const input of ['2026-12-19','2026-12-26'])assert.equal(clampBookingWeek(input,now),limits.current);
 for(const input of ['2027-01-02','2027-01-09','2028-01-01'])assert.equal(clampBookingWeek(input,now),limits.next);
});
test('Thursday and Friday open the coming Saturday; other days keep their current week',()=>{
 for(const [now,expected] of [
  ['2026-11-04T12:00:00+03:30','2026-10-31'],
  ['2026-11-05T00:00:00+03:30','2026-11-07'],
  ['2026-11-06T23:59:59+03:30','2026-11-07'],
  ['2026-11-07T00:00:00+03:30','2026-11-07'],
  ['2026-12-31T12:00:00+03:30','2027-01-02']
 ])assert.equal(initialBookingWeek(Date.parse(now)),expected);
});
test('initial week uses the Tehran calendar date even when UTC is still Wednesday',()=>{
 assert.equal(initialBookingWeek(Date.parse('2026-11-04T21:00:00Z')),'2026-11-07');
 // Returning to the app calculates an absolute target, never another +1 click.
 assert.equal(initialBookingWeek(Date.parse('2026-11-05T20:00:00Z')),'2026-11-07');
});
