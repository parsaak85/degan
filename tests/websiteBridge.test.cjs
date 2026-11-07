const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('@babel/core');
const exportsBridge = {};
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/websiteBridge.js'), 'utf8');
vm.runInNewContext(transformSync(source, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, { exports: exportsBridge, require:()=>require('./loadModule.cjs')('siteWeek') });

// Deliberately model browser checkbox semantics: .click changes checked, while
// defaultChecked changes only when the website supplies a committed response.
function fixture({ login = false, disabled = false, reserved = false, sale = false, outside = false, homepage = false, authenticated = false, balanceText = '',credit=false } = {}) {
  const messages = [], timers = [], storage = new Map(), clicks = [];
  const node = (attrs = {}) => ({ disabled: false, parentElement: null, textContent: '', value: '',
    getAttribute(name) { return attrs[name] ?? null; }, querySelector() { return null; },
    querySelectorAll() { return []; }, click() { clicks.push(attrs.id); }, ...attrs });
  const fields = new Map(), ids = new Map(), labels = [];
  const body = node({textContent: balanceText});
  const week = node({ id: 'weekStartDateTimeAjx', value: String(new Date('2026-10-17T00:00:00').getTime()) });
  if (!homepage) ids.set(week.id, week);
  const save = node({ id: 'doReservBtn' }); ids.set(save.id, save);
  const next = node({ id: 'nextWeekBtn' }); ids.set(next.id, next);
  const previous = node({ id: 'beforeWeekImgBtn' }); ids.set(previous.id, previous);
  const creditButton=node({id:'actual-credit-button',textContent:credit==='button'?'':'افزایش اعتبار',value:credit==='button'?'افزایش اعتبار':'',href:'javascript:actualSiteCreditHandler()'});
  const saleControls = sale ? [node({ id: 'sellFreeFood', onclick: outside ? "confirmSell('/nurture/user/multi/reserve/sell.rose?reserveId=101&weekStartDateTime=1')" : 'sellFood()' })] : [];
  const boxes = [0, 1].map((index) => {
    const box = node({ id: `userWeekReserves.selected${index}`, programDate: '2026-10-18', foodTypeId: '1',
      onclick: "enableDisableNumber(this, 'x', '350000')", disabled, defaultChecked: reserved && index === 0, checked: reserved && index === 0 });
    box.closest = () => ({ ...node(), querySelectorAll: () => index === 0 && !outside ? saleControls : [] });
    box.click = () => { if (!box.disabled) { clicks.push(box.id); box.checked = !box.checked; } };
    box.scrollIntoView = () => {};
    ids.set(box.id, box);
    labels.push(node({ for: box.id, textContent: `1 | food ${index} | lunch` }));
    for (const [name, value] of Object.entries({ id: String(101+index), programId: `program-${index}`, selfId: '1', foodTypeId: '1' })) fields.set(`[name="userWeekReserves[${index}].${name}"]`, node({ value }));
    return box;
  });
  if (login) ids.set('login_btn_submit', node({ id: 'login_btn_submit' }));
  const document = { body, getElementById: (id) => ids.get(id) || null,
    querySelector: (selector) => selector === 'a[href*="/accessMgmt/action/logout.rose"]' && authenticated ? node() : fields.get(selector) || null,
    querySelectorAll: (selector) => selector.startsWith('label[') ? homepage ? [] : labels : selector.startsWith('a,button')?credit?[creditButton]:[]:selector==='input[type="checkbox"][programDate]' ? homepage?[]:boxes : outside && selector.startsWith('[onclick*') ? saleControls : [], addEventListener() {} };
  const confirm = () => true, alert = () => {};
  const window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    ReactNativeWebView: { postMessage: (message) => messages.push(JSON.parse(message)) }, confirm, alert };
  const context = { window, document, sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {}, MutationObserver: class { observe() {} } };
  vm.runInNewContext(exportsBridge.installWebsiteBridge(), context);
  return { window, messages, boxes, week, next, clicks, confirm, alert,
    clickCredit(){vm.runInNewContext(exportsBridge.websiteCreditClickScript(),context);},
    setDates(value){boxes.forEach((box,index)=>{const original=box.getAttribute.bind(box);box.getAttribute=name=>name==='programDate'?(Array.isArray(value)?value[index]:value):original(name);});},
    setForSale(value) { saleControls.splice(0, saleControls.length, node({ id: value ? 'cancelSellFreeFood' : 'sellFreeFood', onclick: outside ? (value ? 'confirmCancelSell' : 'confirmSell')+"('/nurture/user/multi/reserve/sell.rose?reserveId=101')" : value ? 'cancelSellFreeFood()' : 'sellFood()' })); },
    snapshot: () => window.__deganSite.read(),
    action(kind, index = 0, snapshot = window.__deganSite.read()) { window.__deganSite.perform({ id: 'request', kind, snapshotKey: snapshot.snapshotKey, foodKey: snapshot.foods[index]?.key }); },
    run(delay) { const all = timers.splice(0); timers.push(...all.filter((task) => task.delay !== delay)); for (const task of all.filter((task) => task.delay === delay)) task.fn(); },
    results: () => messages.filter((message) => message.type === 'result') };
}

test('app credit command clicks the actual site control, including a JavaScript-owned button',()=>{
 for(const credit of [true,'button']){
  const f=fixture({credit});f.clickCredit();
  assert.deepEqual(f.clicks,['actual-credit-button']);assert.ok(f.messages.some(value=>value.type==='show-site'));
  assert.ok(!f.messages.some(value=>value.type==='wallet-url'));assert.equal(f.results().length,0);
 }
});

test('missing or dirty credit page never falls back to another login URL',()=>{
 const missing=fixture();missing.clickCredit();assert.deepEqual(missing.clicks,[]);assert.equal(missing.results().at(-1).code,'unavailable');
 const dirty=fixture({credit:true});dirty.boxes[0].checked=true;dirty.clickCredit();assert.deepEqual(dirty.clicks,[]);assert.equal(dirty.results().at(-1).code,'dirty');
});

test('menu and week come from the current document; arrows click its controls', () => {
  const f = fixture(), page = f.snapshot();
  assert.equal(page.weekStart, '2026-10-17');
  assert.equal(page.foods[0].programId, 'program-0');
  assert.equal(page.foods[0].priceRials, 350000);
  f.action('next');
  assert.deepEqual(f.clicks, ['nextWeekBtn']);
  assert.equal(f.snapshot().weekStart, '2026-10-17');
  assert.equal(f.results().length, 0);
  f.week.value = String(new Date('2026-10-24T00:00:00').getTime());
  assert.equal(f.snapshot().weekStart, '2026-10-17');
  assert.equal(f.results().length,0);
  f.setDates('2026-10-25');
  assert.equal(f.snapshot().weekStart, '2026-10-24');
  assert.equal(f.results().at(-1).ok, true);
});
test('login page refuses food actions', () => {
  const f = fixture({ login: true }); f.action('buy');
  assert.equal(f.snapshot().kind, 'login');
  assert.equal(f.results().at(-1).code, 'login'); assert.deepEqual(f.clicks, []);
});

test('homepage snapshots identify a successful login through the actual logout link',()=>{
 const signedIn=fixture({homepage:true,authenticated:true}).snapshot();
 assert.equal(signedIn.kind,'website');assert.equal(signedIn.authenticated,true);
 assert.equal(fixture({homepage:true}).snapshot().authenticated,false);
});

test('an AJAX replacement releases navigation only after real rows arrive; mere hidden-field edits do not',()=>{
 const f=fixture();
 f.window.__deganWeekClicked={from:'2026-10-17',dates:'2026-10-18|2026-10-18'};
 f.week.value=String(new Date('2026-10-24T12:00:00+03:30').getTime());
 assert.equal(f.snapshot().navigating,true);
 assert.equal(f.snapshot().weekStart,'2026-10-17');
 // Actual table dates are sufficient even when the hidden input stays stale.
 f.week.value=String(new Date('2026-10-17T12:00:00+03:30').getTime());
 f.setDates('2026-10-25');
 assert.equal(f.snapshot().navigating,false);
 assert.equal(f.window.__deganWeekClicked,null);
 assert.equal(f.snapshot().weekStart,'2026-10-24');
 assert.equal(f.snapshot().headerWeek,'2026-10-17');
});

test('mixed old/new table rows cannot confirm a week or unlock navigation',()=>{
 const f=fixture();f.window.__deganWeekClicked={from:'2026-10-17',dates:'2026-10-18|2026-10-18'};
 f.setDates(['2026-10-18','2026-10-25']);
 assert.equal(f.snapshot().weekReady,false);assert.equal(f.snapshot().navigating,true);
 f.setDates('2026-10-25');assert.equal(f.snapshot().weekReady,true);assert.equal(f.snapshot().navigating,false);
});

test('website balance is normalized to rials, including zero, negative and explicit toman amounts',()=>{
 assert.equal(fixture({balanceText:'موجودی: ۰ ریال'}).snapshot().balance,0);
 assert.equal(fixture({balanceText:'موجودی: ۳۵٬۰۰۰ تومان'}).snapshot().balance,350000);
 assert.equal(fixture({balanceText:'موجودی: ۳۵۰٬۰۰۰ ریال'}).snapshot().balance,350000);
 assert.equal(fixture({balanceText:'موجودی: -۱۰۰۰ ریال'}).snapshot().balance,-1000);
});
test('changed document week invalidates an earlier native selection', () => {
  const f = fixture(), old = f.snapshot();
  f.week.value = String(new Date('2026-10-24T00:00:00').getTime());
  f.action('buy', 0, old);
  assert.equal(f.results().at(-1).code, 'stale'); assert.deepEqual(f.clicks, []);
});
test('buy uses checkbox and real save; success waits for committed site state', () => {
  const f = fixture(); f.action('buy');
  assert.equal(f.boxes[0].checked, true); assert.equal(f.boxes[0].defaultChecked, false);
  f.run(120);
  assert.deepEqual(f.clicks, ['userWeekReserves.selected0', 'doReservBtn']);
  assert.equal(f.results().length, 0); assert.equal(f.snapshot().pending, true);
  f.boxes[0].defaultChecked = true;
  assert.equal(f.snapshot().pending, false); assert.equal(f.results().at(-1).ok, true);
  assert.equal(f.window.confirm, f.confirm); assert.equal(f.window.alert, f.alert);
});
test('disabled site controls are never enabled', () => {
  const f = fixture({ disabled: true }); f.action('buy');
  assert.equal(f.results().at(-1).code, 'unavailable');
  assert.equal(f.boxes[0].disabled, true); assert.deepEqual(f.clicks, []);
});
test('second food on a reserved date is rejected', () => {
  const f = fixture({ reserved: true }); f.action('buy', 1);
  assert.equal(f.results().at(-1).code, 'day-reserved'); assert.deepEqual(f.clicks, []);
});
test('uncommitted manual edits stop overlay actions', () => {
  const f = fixture(); f.boxes[1].checked = true; f.action('buy');
  assert.equal(f.results().at(-1).code, 'dirty'); assert.deepEqual(f.clicks, []);
});
test('timeout cannot report an unconfirmed purchase as successful', () => {
  const f = fixture(); f.action('buy'); f.run(120); f.run(10000);
  assert.equal(f.results().length, 0);
  assert.equal(f.messages.at(-1).type, 'waiting');
  f.action('buy', 1);
  assert.equal(f.results().at(-1).code, 'busy');
  assert.equal(f.clicks.filter((id) => id === 'doReservBtn').length, 1);
});
test('cancel follows the site checkbox and waits for committed cancellation', () => {
  const f = fixture({ reserved: true }); f.action('cancel'); f.run(120);
  assert.equal(f.results().length, 0);
  f.boxes[0].defaultChecked = false;
  assert.equal(f.snapshot().foods[0].reserved, false); assert.equal(f.results().at(-1).ok, true);
});

test('reserved food can be listed and withdrawn using actual sale controls even when ordinary cancellation is closed',()=>{
 const f=fixture({reserved:true,disabled:true,sale:true});
 assert.equal(f.snapshot().foods[0].actions.cancel,false);
 assert.equal(f.snapshot().foods[0].actions.sell,true);
 f.action('sell');assert.deepEqual(f.clicks,['sellFreeFood']);assert.equal(f.results().length,0);
 f.setForSale(true);assert.equal(f.snapshot().foods[0].forSale,true);assert.equal(f.results().at(-1).ok,true);
 f.action('withdraw');assert.deepEqual(f.clicks,['sellFreeFood','cancelSellFreeFood']);
 f.setForSale(false);assert.equal(f.snapshot().foods[0].forSale,false);assert.equal(f.results().at(-1).ok,true);
});

test('live legacy confirmSell icon outside the checkbox cell matches only its hidden reservation ID',()=>{
 const f=fixture({reserved:true,disabled:true,sale:true,outside:true});
 assert.equal(f.snapshot().foods[0].actions.sell,true);assert.equal(f.snapshot().foods[1].actions.sell,false);
 f.action('sell');assert.deepEqual(f.clicks,['sellFreeFood']);
 f.setForSale(true);assert.equal(f.snapshot().foods[0].forSale,true);assert.equal(f.results().at(-1).ok,true);
 f.action('withdraw');assert.deepEqual(f.clicks,['sellFreeFood','cancelSellFreeFood']);
 f.setForSale(false);assert.equal(f.snapshot().foods[0].forSale,false);assert.equal(f.results().at(-1).ok,true);
});

test('a firewall block page is reported as blocked with the blocked university URL',()=>{
 const text='Web Application Firewall The page cannot be displayed. URL http://food.guilan.ac.ir/modules/epayment/processing/checkout.rose?actionName=requestPaymentForm&consumer=CreditCharge Event ID 60140003';
 const blocked=fixture({homepage:true,balanceText:text}).snapshot();
 assert.equal(blocked.kind,'website');assert.equal(blocked.blocked,true);assert.ok(blocked.blockText.includes('checkout.rose'));
 const normal=fixture({homepage:true,balanceText:'خوش آمدید'}).snapshot();
 assert.equal(normal.blocked,false);assert.equal(normal.blockText,'');
});
