import { SITE_WEEK_SCRIPT } from './siteWeek';
// Keep the injected source literal: Hermes release builds do not retain function
// source for Function.prototype.toString(). This runs only inside the website.
const WEBSITE_BRIDGE = String.raw`(function () {
  if (window.__deganSite) { window.__deganSite.read(); return; }
  const scope = 'degan-site-v2';
  const pageId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let revision = 0;
  let signature = '';
  let current = null;
  let locked = false;
  let debounce = null;
  let navigation = null;
  const pendingKey = 'degan-dom-action-v2';
  const post = (value) => window.ReactNativeWebView?.postMessage(JSON.stringify({ scope, ...value }));
  const text = (node) => String(node?.innerText || node?.textContent || node?.value || '').replace(/\s+/g, ' ').trim();
  const field = (index, name) => document.querySelector('[name="userWeekReserves[' + index + '].' + name + '"]');
  const visible = (node) => {
    if (!node || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
    for (let element = node; element && element !== document.body; element = element.parentElement) {
      const css = window.getComputedStyle(element);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  };
  const clickable = (node) => {
    if (!visible(node)) return null;
    return node.querySelector?.('[onclick], a, button, input[type="image"]') || node.querySelector?.('img') || node;
  };
  const pending = () => { try { return JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { return null; } };
  const creditControl = () => Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')).find(node=>visible(node)&&
    (text(node)+' '+(node.getAttribute('title')||'')).replace(/[\u200c\u200d]/g,' ').includes('افزایش اعتبار'));
  const clearPending = () => { try { sessionStorage.removeItem(pendingKey); } catch { /* Browser privacy mode. */ } locked = false; };
  function rowControls(box, index) {
    const cell = box.closest('td') || box.parentElement;
    const reserveId = Number(field(index, 'id')?.value);
    const controls = { cart: clickable(document.getElementById('buyFreeFoodIconSpanuserWeekReserves.selected' + index)),
      sell: reserveId > 0 ? clickable(document.getElementById('sellIconSpan' + reserveId)) : null, withdraw: null, details: null };
    // Sale controls live outside the checkbox's inner cell in the real portal.
    const own = Array.from(cell?.querySelectorAll('a, button, input[type="image"], img[onclick], span[onclick]') || []);
    const linked = Array.from(document.querySelectorAll('[onclick*="confirmSell"], [onclick*="confirmCancelSell"]')).filter((node) => {
      const match = (node.getAttribute('onclick') || '').match(/[?&]reserveId=(\d+)/);
      return reserveId > 0 && match && Number(match[1]) === reserveId;
    });
    for (const node of [...own, ...linked]) {
      if (!visible(node)) continue;
      const hint = ['id', 'title', 'alt', 'onclick', 'src'].map((name) => node.getAttribute(name) || '').join(' ') + ' ' + text(node);
      if (/cancel.*(?:sell|sale)|withdraw|انصراف.*فروش|لغو.*فروش/i.test(hint)) controls.withdraw = node;
      else if (/confirmSell\s*\(|sellFreeFood|sellFood|فروش/i.test(hint) && !/buy|خرید/i.test(hint)) controls.sell = node;
      else if (/qr|barcode|بارکد|forget.*card|forgot.*card|جزئیات/i.test(hint)) controls.details = node;
    }
    return controls;
  }
  function collect() {
    const login = document.getElementById('login_btn_submit');
    const password = document.querySelector('input[type="password"]');
    // Detect login without reading, clearing or writing any typed credentials.
    if ((login && visible(login)) || (password && visible(password))) return { kind: 'login', foods: [], weekStart: '', pending: false, dirty: false };
    const labels = document.querySelectorAll('label[for^="userWeekReserves.selected"]');
    const weekInput = document.getElementById('weekStartDateTimeAjx');
    if (!labels.length && !weekInput) {
      const bodyText = text(document.body);
      const blocked = /Web Application Firewall|FortiGuard|FortiWeb|Fortinet/i.test(bodyText);
      return { kind: 'website', foods: [], weekStart: '', pending: Boolean(pending()), dirty: false,
        authenticated: Boolean(document.querySelector('a[href*="/accessMgmt/action/logout.rose"]')),
        blocked, href: blocked ? String(window.location?.href || '') : '', blockText: blocked ? bodyText.slice(0, 1500) : '' };
    }
    const foods = [];
    const seen = new Set();
    for (const label of labels) {
      const id = label.getAttribute('for');
      const index = Number(String(id).replace('userWeekReserves.selected', ''));
      const box = document.getElementById(id);
      if (!box || !Number.isInteger(index) || seen.has(index)) continue;
      seen.add(index);
      const raw = text(label);
      const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
      const programId = String(field(index, 'programId')?.value || '');
      const date = box.getAttribute('programDate') || '';
      const foodTypeId = box.getAttribute('foodTypeId') || String(field(index, 'foodTypeId')?.value || '');
      const selfId = String(field(index, 'selfId')?.value || '');
      const controls = rowControls(box, index);
      const priceMatch = (box.getAttribute('onclick') || '').match(/enableDisableNumber\(this,\s*'[^']*',\s*'([0-9]+)'/);
      foods.push({
        key: [selfId, date, programId, foodTypeId].join(':'), index, programId, date, foodTypeId, selfId,
        id: Number(field(index, 'id')?.value) || null,
        selectedCount: box.defaultChecked ? Number(field(index, 'selectedCount')?.value) || 1 : 0,
        mealTypeId: box.getAttribute('mealTypeId') || '',
        name: parts.length > 1 ? parts[1] : raw, detail: parts.filter((_, i) => i !== 1).join(' · '),
        reserved: Boolean(box.defaultChecked), checked: Boolean(box.checked), dirty: box.checked !== box.defaultChecked,
        priceRials: priceMatch ? Number(priceMatch[1]) : null,
        forSale: Boolean(controls.withdraw),
        actions: { buy: !box.disabled && !box.defaultChecked, cancel: !box.disabled && box.defaultChecked,
          cart: Boolean(controls.cart), sell: Boolean(controls.sell), withdraw: Boolean(controls.withdraw), details: Boolean(controls.details) },
      });
    }
    const actualWeek=window.__deganReadWeek();
    const weekStart=actualWeek.weekStart;
    const select = document.querySelector('[name="selectedSelfDefId"]');
    const selfName = select?.selectedOptions?.[0]?.textContent?.trim() || '';
    const errorNodes = document.querySelectorAll('.errorMessage, .actionMessage, .error, .alert-danger, .alert-success');
    const siteMessage = Array.from(errorNodes).map(text).filter(Boolean).join(' ').slice(0, 500);
    const pageText = text(document.body);
    const creditLink = creditControl();
    const credit = Boolean(creditLink);
    const creditUrl = creditLink && /^https?:/i.test(creditLink.href || '') ? creditLink.href : '';
    const dialog = Array.from(document.querySelectorAll('[role="dialog"], .ui-dialog, .ant-modal-wrap')).some((node) => visible(node) && text(node));
    const balanceMatch = pageText.match(/موجودی[^0-9۰-۹\-−]{0,16}([\-−]?[0-9۰-۹][0-9۰-۹,٬.\s]*)/);
    const digits = (value) => String(value).replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch))).replace(/[^0-9]/g, '');
    return {
      kind: 'panel', foods, weekStart, selfName, siteMessage, credit, creditUrl, dialog,
      tableWeek: actualWeek.tableWeek, headerWeek: actualWeek.headerWeek, weekReady: actualWeek.weekReady,
      navigating: actualWeek.navigating || !actualWeek.weekReady,
      balance: balanceMatch ? Number(digits(balanceMatch[1])) * (/^[\-−]/.test(balanceMatch[1]) ? -1 : 1) * (/تومان|تومن/.test(pageText.slice(balanceMatch.index + balanceMatch[0].length, balanceMatch.index + balanceMatch[0].length + 18)) ? 10 : 1) : null,
      previous: visible(document.getElementById('beforeWeekImgBtn')),
      next: visible(document.getElementById('nextWeekBtn')),
      dirty: foods.some((food) => food.dirty), pending: Boolean(pending()) || locked,
    };
  }
  function finishStored(snapshot) {
    const stored = pending();
    if (!stored || snapshot.kind !== 'panel') return;
    if (!snapshot.foods.length) return;
    const food = snapshot.foods.find((item) => item.key === stored.key);
    const confirmed = food && !food.dirty && (
      (stored.kind === 'buy' || stored.kind === 'cart') ? food.reserved :
        stored.kind === 'cancel' ? !food.reserved :
          stored.kind === 'sell' ? food.forSale : stored.kind === 'withdraw' ? !food.forSale : false);
    if (confirmed) {
      clearPending();
      snapshot.pending = false;
      post({ type: 'result', id: stored.id, ok: true, message: 'وضعیت در صفحه سایت تأیید شد.' });
    } else if (stored.pageId !== pageId) {
      clearPending();
      snapshot.pending = false;
      post({ type: 'result', id: stored.id, ok: false, code: 'not-confirmed', message: snapshot.siteMessage || 'ثبت تغییر در سایت تأیید نشد. صفحه سایت را بررسی کنید.' });
    }
  }
  function read() {
    const snapshot = collect();
    if (navigation && snapshot.kind === 'panel' && snapshot.weekReady && !snapshot.navigating && snapshot.weekStart && snapshot.weekStart !== navigation.weekStart) {
      post({ type: 'result', id: navigation.id, ok: true, message: 'هفته سایت تغییر کرد.' });
      navigation = null;
      locked = false;
      snapshot.pending = Boolean(pending());
    }
    finishStored(snapshot);
    const next = JSON.stringify(snapshot);
    if (next !== signature) { revision += 1; signature = next; }
    current = { ...snapshot, pageId, snapshotKey: pageId + ':' + revision };
    post({ type: 'snapshot', snapshot: current });
    return current;
  }
  const reject = (request, code, message) => { post({ type: 'result', id: request.id, ok: false, code, message }); read(); };
  function perform(request) {
    const snapshot = read();
    if (snapshot.kind === 'login') { reject(request, 'login', 'ابتدا در سایت وارد شوید.'); return; }
    if (snapshot.kind !== 'panel') { reject(request, 'website', 'این کار را در صفحه سایت انجام دهید.'); return; }
    if (request.snapshotKey !== snapshot.snapshotKey) { reject(request, 'stale', 'صفحه سایت تغییر کرده است؛ دوباره غذا را انتخاب کنید.'); return; }
    if (locked || pending()) { reject(request, 'busy', 'نتیجه عملیات قبلی هنوز مشخص نیست.'); return; }
    if (snapshot.dialog) { reject(request, 'dialog', 'ابتدا پنجره باز سایت را کامل کنید.'); return; }
    if (snapshot.dirty) { reject(request, 'dirty', 'تغییرات ثبت‌نشده در سایت وجود دارد. ابتدا آن‌ها را در سایت بررسی کنید.'); return; }
    if (request.kind === 'previous' || request.kind === 'next') {
      const id = request.kind === 'next' ? 'nextWeekBtn' : 'beforeWeekImgBtn';
      const button = document.getElementById(id);
      if (!visible(button)) { reject(request, 'unavailable', 'تغییر هفته در سایت در دسترس نیست.'); return; }
      locked = true;
      navigation = { id: request.id, weekStart: snapshot.weekStart };
      button.click(); // The actual website handler owns navigation and its confirmations.
      post({ type: 'clicked', id: request.id, kind: request.kind });
      setTimeout(() => { if (navigation?.id === request.id) { navigation = null; locked = false; post({ type: 'waiting', id: request.id, message: 'تغییر هفته در سایت را بررسی کنید.' }); read(); } }, 10000);
      return;
    }
    if (request.kind === 'credit') {
      const link = creditControl();
      if (!link) { reject(request, 'unavailable', 'لینک افزایش اعتبار در صفحه فعلی نیست.'); return; }
      post({ type: 'show-site', id: request.id });
      link.click();
      return;
    }
    const food = snapshot.foods.find((item) => item.key === request.foodKey);
    if (!food) { reject(request, 'target', 'این غذا در صفحه فعلی سایت نیست.'); return; }
    const box = document.getElementById('userWeekReserves.selected' + food.index);
    if (!box || String(field(food.index, 'programId')?.value || '') !== food.programId || box.getAttribute('programDate') !== food.date) {
      reject(request, 'target', 'غذا یا هفته سایت تغییر کرده است.'); return;
    }
    if (request.kind === 'inspect') { box.scrollIntoView?.({ block: 'center' }); rowControls(box, food.index).details?.click(); post({ type: 'show-site', id: request.id }); return; }
    if (request.kind === 'buy' || request.kind === 'cart') {
      if (snapshot.foods.some((item) => item.date === food.date && item.reserved)) { reject(request, 'day-reserved', 'برای این روز در صفحه سایت غذا رزرو شده است.'); return; }
    }
    const controls = rowControls(box, food.index);
    const save = document.getElementById('doReservBtn');
    const kind = request.kind;
    const control = kind === 'buy' || kind === 'cancel' ? box : kind === 'cart' ? controls.cart : kind === 'sell' ? controls.sell : kind === 'withdraw' ? controls.withdraw : null;
    const allowed = kind === 'buy' ? food.actions.buy : kind === 'cancel' ? food.actions.cancel : kind === 'cart' ? Boolean(controls.cart) : kind === 'sell' ? Boolean(controls.sell) : kind === 'withdraw' ? Boolean(controls.withdraw) : false;
    if (!allowed || !visible(control) || ((kind === 'buy' || kind === 'cancel' || kind === 'cart') && !visible(save))) {
      reject(request, 'unavailable', 'دکمه این عملیات در صفحه فعلی سایت فعال نیست.'); return;
    }
    const stored = { id: request.id, kind, key: food.key, pageId };
    try { sessionStorage.setItem(pendingKey, JSON.stringify(stored)); } catch { reject(request, 'storage', 'مرورگر نتوانست وضعیت عملیات را نگه دارد. از نمایش سایت استفاده کنید.'); return; }
    locked = true;
    function confirmedClick(node) {
      const original = window.confirm;
      window.confirm = () => true; // The app's food/date confirmation was already accepted.
      try { node.click(); } finally { window.confirm = original; }
    }
    confirmedClick(control); // Runs the site's own validation, counters and event handlers.
    if (kind === 'buy' || kind === 'cancel' || kind === 'cart') {
      setTimeout(() => {
        if (collect().dialog) { post({ type: 'waiting', id: request.id, message: 'پنجره تأیید سایت را کامل کنید.' }); return; }
        const selected = kind === 'cancel' ? !box.checked : box.checked;
        if (!selected) {
          clearPending();
          reject(request, 'validation', 'سایت انتخاب را نپذیرفت. پیام یا پنجره سایت را بررسی کنید.');
          return;
        }
        const currentSave = document.getElementById('doReservBtn');
        if (visible(currentSave)) confirmedClick(currentSave);
        else post({ type: 'waiting', id: request.id, message: 'مرحله تأیید را در خود سایت کامل کنید.' });
      }, 120);
    }
    post({ type: 'clicked', id: request.id, kind });
    setTimeout(() => {
      read();
      if (pending()) post({ type: 'waiting', id: request.id, message: 'نتیجه هنوز در صفحه سایت تأیید نشده است؛ آن را در نمایش سایت بررسی کنید.' });
    }, 10000);
  }
  function scheduleRead() {
    clearTimeout(debounce);
    debounce = setTimeout(read, 100);
  }
  window.__deganSite = { read, perform };
  document.addEventListener('change', scheduleRead, true);
  document.addEventListener('click', scheduleRead, true);
  const observe = () => {
    if (!document.body) return;
    new MutationObserver(scheduleRead).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    read();
  };
  if (document.body) observe();
  else document.addEventListener('DOMContentLoaded', observe, { once: true });
})(); true;`;

export function installWebsiteBridge() {
  return SITE_WEEK_SCRIPT + WEBSITE_BRIDGE;
}

export function websiteAction(request) {
  return 'if (window.__deganSite) window.__deganSite.perform(' + JSON.stringify(request) + '); true;';
}

export function websiteCreditClickScript(){
  return installWebsiteBridge()+`if(window.__deganSite){
    var creditSnapshot=window.__deganSite.read();
    window.__deganSite.perform({id:'degan-credit-open',kind:'credit',snapshotKey:creditSnapshot.snapshotKey});
  }true;`;
}
