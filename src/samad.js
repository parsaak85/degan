import { isInWeek, samadWeekTimestamp } from './dates';
import { dayHasReservation, menuRows } from './foodWeek';
import { legacyPanelUrl, PORTAL_ORIGIN } from './portal';
import { walletCheckoutPath } from './walletCheckout';

// Endpoints and response fields verified with سماد's live reservation report.
const ORIGIN = PORTAL_ORIGIN;
export const RESERVATIONS_URL = legacyPanelUrl();

export function weekStart(offset = 0, now = new Date()) {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7) + offset * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function reservationRows(report, dailySales = []) {
  const payload = report?.payload || report;
  const meals = new Map((payload?.mealTypes || []).map((meal) => [meal.id, meal.name]));
  const rows = [];
  const seen = new Set();
  function add(reserve, context, dailySale = false) {
    const id = dailySale ? reserve.reserveDailySaleId : reserve.id;
    if (id == null || !(Number(reserve.selectedCount) > 0)) return;
    const key = `${dailySale ? 'daily' : 'reserve'}-${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ...reserve, key, id, dailySale,
      date: String(reserve.programDate || context.date || '').split(' ')[0],
      meal: reserve.mealTypeName || context.meal || '',
      name: reserve.foodNames || reserve.foodName || 'غذای رزرو شده',
    });
  }
  function visit(value, context = {}) {
    if (Array.isArray(value)) { value.forEach((item) => visit(item, context)); return; }
    if (!value || typeof value !== 'object') return;
    const next = { date: value.date || value.programDate || context.date,
      meal: value.mealTypeName || meals.get(value.mealTypeId) || context.meal };
    if (value.reserve) add(value.reserve, next);
    for (const [key, child] of Object.entries(value)) {
      // Teammates' reservations and codes belong to the teammate, not this user.
      if (key !== 'reserve' && key !== 'teammateReserve') visit(child, next);
    }
  }
  visit(payload);
  const daily = dailySales?.payload || dailySales;
  if (Array.isArray(daily)) daily.forEach((item) => add(item, {}, true));
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

export function createSamadClient(account, fetcher = fetch) {
  let token = '';
  let refreshToken = '';
  let authenticating = null;
  let mutating = false;
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetcher(`${ORIGIN}${path}`, { ...options, signal: controller.signal });
      if (!response.ok) { const error = new Error('samad-request'); error.status = response.status; throw error; }
      const data = await response.json();
      if (String(data?.type).toLowerCase() === 'error') throw new Error(data.messageFa || 'عملیات در سماد انجام نشد.');
      return data;
    } finally { clearTimeout(timer); }
  }
  async function authorize() {
    if (token) return token;
    if (!authenticating) authenticating = request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Authorization: 'Basic c2FtYWQtbW9iaWxlOnNhbWFkLW1vYmlsZS1zZWNyZXQ=' },
      body: `username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}&grant_type=password&scope=read%20write`,
    }).then((data) => {
      if (!data.access_token) throw new Error('samad-login');
      token = data.access_token;
      refreshToken = typeof data.refresh_token==='string'?data.refresh_token:'';
      return token;
    }).finally(() => { authenticating = null; });
    return authenticating;
  }
  async function get(path, retry = true) {
    const accessToken = await authorize();
    try { return await request(path, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json',
      ...(path.startsWith('/rest/users/me/login-token?deganNonce=')?{'Cache-Control':'no-cache, no-store',Pragma:'no-cache'}:{}),
    } }); }
    catch (error) {
      if (retry && error.status === 401) { token = ''; return get(path, false); }
      throw error;
    }
  }
  async function write(path, method, body, retry = true) {
    const accessToken = await authorize();
    try {
      return await request(path, { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (error) {
      if (retry && error.status === 401) { token = ''; return write(path, method, body, false); }
      throw error;
    }
  }
  async function mutation(work) {
    if (mutating) throw new Error('لطفاً تا پایان عملیات قبلی صبر کنید.');
    mutating = true;
    try { return await work(); } finally { mutating = false; }
  }
  const client = {
    async browserSession() {
      // Validate/reuse the existing account token; the ordinary 401 repair
      // obtains a new pair only if the cached access token has expired.
      await get('/rest/users/me');
      if(!token||!refreshToken)throw new Error('توکن ورود خودکار سماد کامل دریافت نشد. دوباره وارد برنامه شوید.');
      return {accessToken:token,refreshToken};
    },
    async walletLoginUrl() {
      // Same handoff used by samad.app's openCreditIncreasePage, verified
      // against its public bundle. This opens the amount form, never a payment.
      const data = await get('/rest/users/me/login-token');
      const loginToken = data?.payload?.loginAsToken;
      if (typeof loginToken !== 'string' || !loginToken.trim()) throw new Error('لینک ورود به صفحه افزایش اعتبار دریافت نشد.');
      const redirect = '/nurture/user/credit/charge/view.rose?callBackAppUrl=https://samad.app/user/wallet';
      return `${PORTAL_ORIGIN}/j_security_check?loginAsToken=${encodeURIComponent(loginToken)}&redirect=${encodeURIComponent(redirect)}`;
    },
    async legacyLoginUrl(selfId) {
      const data = await get('/rest/users/me/login-token');
      const loginToken = data?.payload?.loginAsToken;
      if (typeof loginToken !== 'string' || !loginToken.trim()) throw new Error('legacy-login-token');
      const redirect = legacyPanelUrl(selfId).slice(PORTAL_ORIGIN.length);
      return `${PORTAL_ORIGIN}/j_security_check?loginAsToken=${encodeURIComponent(loginToken)}&redirect=${encodeURIComponent(redirect)}`;
    },
    async checkoutLoginUrl(value) {
      const redirect = walletCheckoutPath(value);
      if (!redirect) throw new Error('صفحه پرداخت دانشگاه معتبر نیست.');
      // Tokens are single-use; this endpoint supplies no cache policy itself.
      const nonce=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      const data = await get('/rest/users/me/login-token?deganNonce='+nonce);
      const loginToken = data?.payload?.loginAsToken;
      if (typeof loginToken !== 'string' || !loginToken.trim()) throw new Error('نشست مرورگر پرداخت آماده نشد. دوباره تلاش کنید.');
      return `${PORTAL_ORIGIN}/j_security_check?loginAsToken=${encodeURIComponent(loginToken)}&redirect=${encodeURIComponent(redirect)}`;
    },
    async programs(selfId, start) {
      const query = `selfId=${encodeURIComponent(selfId)}&weekStartDate=${encodeURIComponent(samadWeekTimestamp(start))}`;
      let response;
      try { response = await get(`/rest/reservations/programs/v2?${query}`); }
      catch (error) { if (error.status !== 404) throw error; response = await get(`/rest/programs/v2?${query}`); }
      return menuRows(response).filter((food) => isInWeek(food.date, start));
    },
    async reservations(start) {
      const [report, daily] = await Promise.all([
        get(`/rest/reserves?weekStartDate=${encodeURIComponent(samadWeekTimestamp(start))}&selfType=NORMAL`),
        get('/rest/users/me/reserve-daily-sales'),
      ]);
      if (!Array.isArray(report?.payload?.weekDays)) throw new Error('samad-report-format');
      return reservationRows(report, daily).filter((row) => isInWeek(row.date, start));
    },
    async qr(reservation) {
      const data = await get(`/rest/forget-card-codes/print?reserveId=${encodeURIComponent(reservation.id)}&count=${encodeURIComponent(reservation.selectedCount)}&dailySale=${reservation.dailySale ? 'true' : 'false'}`);
      const code = data?.payload?.forgotCardCode;
      if (code == null || !String(code).trim() || String(code).startsWith('ERROR')) throw new Error('samad-no-code');
      return String(code);
    },
    async buy(food, start) {
      return mutation(async () => {
        if (food.reserveRuleViolated || food.reportOnly || food.validTotalCount === 0 || food.validMaxCount === 0) throw new Error('رزرو عادی این غذا در حال حاضر مجاز نیست.');
        const before = await client.reservations(start);
        if (dayHasReservation(before, food.date)) throw new Error('برای این روز غذا رزرو شده است. ابتدا رزرو قبلی را لغو کنید.');
        await write(`/rest/reserves/${encodeURIComponent(food.programId)}/reserve`, 'PUT', {
          foodTypeId: food.foodTypeId, mealTypeId: food.mealTypeId, selectedCount: 1, freeFoodSelected: false, selected: true,
        });
        const after = await client.reservations(start);
        if (!after.some((row) => row.programId === food.programId && !row.sold)) throw new Error('ثبت رزرو تأیید نشد. رزروها را تازه‌سازی کنید.');
        return after;
      });
    },
    async cancel(food, start) {
      return mutation(async () => {
        if (food.cancelRuleViolated || food.reportOnly || food.consumed) throw new Error('لغو این رزرو در حال حاضر مجاز نیست.');
        await write(`/rest/reserves/${encodeURIComponent(food.programId)}/reserve`, 'PUT', {
          foodTypeId: food.foodTypeId, mealTypeId: food.mealTypeId, selectedCount: 0, freeFoodSelected: false, selected: false,
        });
        const after = await client.reservations(start);
        if (after.some((row) => row.id === food.id && !row.sold)) throw new Error('لغو رزرو تأیید نشد. رزروها را تازه‌سازی کنید.');
        return after;
      });
    },
    async sell(food, start, withdraw = false) {
      return mutation(async () => {
        if (food.consumed || food.sold || (!withdraw && !food.saleableFreeFood) || (withdraw && !food.forSale)) throw new Error('فروش این غذا در حال حاضر مجاز نیست.');
        await write(`/rest/reserves/v2/${encodeURIComponent(food.id)}/${withdraw ? 'cancel-sold-reserve' : 'sell-reserve'}`, 'PUT', {});
        const after = await client.reservations(start);
        const row = after.find((item) => item.id === food.id);
        if (!row || Boolean(row.forSale) === withdraw) throw new Error('وضعیت فروش تأیید نشد. رزروها را تازه‌سازی کنید.');
        return after;
      });
    },
  };
  return client;
}

