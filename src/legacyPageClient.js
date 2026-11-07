// The native panel is a projection of the persistent legacy WebView document.
// Only QR lookup uses the read-only backend client; mutations click the real form.
export function pageFoods(snapshot) {
  if (snapshot?.kind !== 'panel') return [];
  return snapshot.foods.map((food) => ({
    ...food, programId: Number(food.programId), foodTypeId: Number(food.foodTypeId),
    price: food.priceRials, meal: food.detail,
    selectedCount: food.reserved ? food.selectedCount || 1 : 0,
    consumed: false, sold: false, dailySale: false,
    reserveRuleViolated: !food.actions.buy || snapshot.dirty || snapshot.pending || snapshot.dialog,
    cancelRuleViolated: !food.actions.cancel || snapshot.dirty || snapshot.pending || snapshot.dialog,
    saleableFreeFood: food.actions.sell, forSale: food.forSale,
    daysDifferenceWithToday: Math.floor((new Date(food.date + 'T12:00:00') - new Date(new Date().toDateString())) / 86400000),
  }));
}

export function createLegacyPageClient({ read, navigateWeek, stopNavigation = () => {}, send, reload, qr, timeoutMs = 25000 }) {
  let snapshot = null;
  let syncing = null;
  let action = null;
  let invalidated = false;
  let preferCurrent = false;
  let ignoredPage = null;
  const listeners = new Set();
  const error = (message) => new Error(message);
  function finishSync(reason) {
    if (!syncing) return;
    const item = syncing; syncing = null; clearTimeout(item.timer); clearInterval(item.poll);
    stopNavigation();
    if(reason&&item.reloading)invalidated=true;
    if (reason) item.reject(reason); else item.resolve(snapshot);
  }
  function update(value) {
    // A refresh must not repaint the balance/list from the old browser document
    // while the new reservation GET is still loading.
    if(ignoredPage!==null&&value.pageId===ignoredPage)return false;
    if(ignoredPage!==null){ignoredPage=null;if(!syncing)invalidated=false;}
    snapshot = value;
    if (syncing && value.kind === 'panel' && value.weekReady !== false && !value.navigating) {
      if (value.weekStart === syncing.start && (!syncing.reloading || value.pageId !== syncing.oldPageId)) finishSync();
      else if ((!syncing.reloading || value.pageId !== syncing.oldPageId) && (value.pageId !== syncing.sentPageId || value.weekStart !== syncing.sentWeek)) {
        syncing.sentPageId = value.pageId;
        if (value.dirty || value.pending || value.dialog) finishSync(error('ابتدا تغییرات ثبت‌نشده یا پنجره باز سایت را بررسی کنید.'));
        else if (value.weekStart === syncing.sentWeek || (syncing.sentWeek && (
          (syncing.start > syncing.sentWeek && (value.weekStart < syncing.sentWeek || value.weekStart > syncing.start)) ||
          (syncing.start < syncing.sentWeek && (value.weekStart > syncing.sentWeek || value.weekStart < syncing.start))
        ))) finishSync(error('سایت هفته درخواستی را باز نکرد. دوباره تازه‌سازی کنید.'));
        else { syncing.sentWeek = value.weekStart; navigateWeek(syncing.start,{preferCurrent:syncing.preferCurrent}); }
      }
    }
    for (const listener of listeners) listener(value);
    return true;
  }
  function ensureWeek(start) {
    if (syncing) {
      if (syncing.start === start) return syncing.promise;
      return Promise.reject(error('تغییر هفته قبلی هنوز تمام نشده است.'));
    }
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    syncing = { start, promise, resolve, reject, oldPageId: snapshot?.pageId??ignoredPage, reloading: invalidated, preferCurrent, sentPageId: null };
    preferCurrent=false;
    syncing.timer = setTimeout(() => finishSync(error('صفحه سایت قدیمی آماده نشد. نمایش سایت را بررسی کنید.')), timeoutMs);
    // Hidden WebViews may miss AJAX/load notifications. Poll reads only; the
    // arrow script retains exclusive ownership of actual navigation clicks.
    syncing.poll = setInterval(read, 500);
    if (invalidated) { invalidated = false;ignoredPage=syncing.oldPageId??null;snapshot=null;reload(); }
    else if (snapshot?.kind === 'panel' && snapshot.weekStart !== start) {
      syncing.sentPageId = snapshot.pageId;
      syncing.sentWeek = snapshot.weekStart;
      if (snapshot.dirty || snapshot.pending || snapshot.dialog) finishSync(error('ابتدا تغییرات ثبت‌نشده یا پنجره باز سایت را بررسی کنید.'));
      else navigateWeek(start);
    } else read();
    return promise;
  }
  async function perform(kind, food, start) {
    if (action) throw error('عملیات قبلی هنوز تمام نشده است.');
    await ensureWeek(start);
    if (action) throw error('عملیات قبلی هنوز تمام نشده است.');
    const current = snapshot.foods.find((row) => row.key === food.key);
    if (!current || snapshot.kind !== 'panel' || snapshot.weekStart !== start) throw error('غذا یا هفته سایت تغییر کرده است.');
    if (snapshot.dirty || snapshot.pending || snapshot.dialog) throw error('ابتدا تغییرات یا پنجره باز سایت را بررسی کنید.');
    if (kind === 'buy' && snapshot.foods.some((row) => row.date === current.date && row.reserved)) throw error('برای این روز غذا رزرو شده است.');
    const request = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), kind, foodKey: current.key, snapshotKey: snapshot.snapshotKey };
    return new Promise((resolve, reject) => {
      action = { ...request, resolve, reject, timer: setTimeout(() => {
        if (action?.id !== request.id) return;
        action = null;
        reject(error('نتیجه در صفحه سایت تأیید نشد؛ نمایش سایت را بررسی کنید.'));
      }, timeoutMs) };
      send(request);
    });
  }
  function result(value) {
    if (action?.id !== value.id) return;
    const current = action; action = null; clearTimeout(current.timer);
    if (value.ok) current.resolve();
    else current.reject(error(value.message || 'سایت این عملیات را تأیید نکرد.'));
  }
  const client = {
    update, result, ensureWeek,
    getSnapshot: () => snapshot,
    get pendingWeek() { return syncing?.start || ''; },
    get busy() { return Boolean(syncing || action); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate(options={}) { invalidated = true; preferCurrent=Boolean(options.currentWeek); },
    reset() {
      finishSync(error('در حال بازگشت به پنل رزرو.'));
      if(action){const previous=action;action=null;clearTimeout(previous.timer);previous.reject(error('نتیجه را پس از بازگشت به پنل بررسی کنید.'));}
      snapshot=null;invalidated=false;preferCurrent=false;ignoredPage=null;
    },
    rejectSync(message) { finishSync(error(message)); },
    async programs(_selfId, start) { const value = await ensureWeek(start); return pageFoods(value); },
    async reservations(start) { const value = await ensureWeek(start); return pageFoods(value).filter((food) => food.reserved); },
    buy: (food, start) => perform('buy', food, start),
    cancel: (food, start) => perform('cancel', food, start),
    sell: (food, start, withdraw = false) => perform(withdraw ? 'withdraw' : 'sell', food, start),
    async qr(food) {
      const value = snapshot?.foods.find((item) => item.key === food.key);
      if (!value?.reserved) throw error('این غذا در صفحه سایت رزرو نشده است.');
      return qr({ ...food, id: value.id, selectedCount: value.selectedCount || 1 }, snapshot.weekStart);
    },
    dispose() {
      finishSync(error('صفحه بسته شد.'));
      if (action) { clearTimeout(action.timer); action.reject(error('صفحه بسته شد؛ نتیجه را پیش از تلاش دوباره بررسی کنید.')); action = null; }
      listeners.clear();
    },
  };
  return client;
}
