import { PORTAL_HOST } from './portal';

// The university sits behind a Fortinet web application firewall. When it blocks
// a request, the WebView shows an English error page that the app must recognise
// instead of leaving the person stranded on it.
const FIREWALL = /Web Application Firewall|FortiGuard|FortiWeb|Fortinet/i;

export function isFirewallBlock(text) {
  return typeof text === 'string' && FIREWALL.test(text);
}

// The block page prints the blocked request URL. Return only a university URL.
export function blockedUrlFromText(text) {
  if (typeof text !== 'string') return '';
  const found = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const candidate of found) {
    try { if (new URL(candidate).hostname === PORTAL_HOST) return candidate; } catch { /* Keep looking. */ }
  }
  return '';
}

export function httpErrorMessage(status) {
  const code = Number(status);
  if (code === 401) return 'نشست شما در سایت دانشگاه منقضی شده است. دوباره وارد شوید.';
  if (code === 403) return 'سایت دانشگاه این درخواست را نپذیرفت (۴۰۳). چند لحظه بعد دوباره تلاش کنید و مطمئن شوید VPN خاموش است.';
  if (code === 404) return 'صفحه مورد نظر در سایت دانشگاه پیدا نشد (۴۰۴). سایت ممکن است تغییر کرده باشد.';
  if (code === 429) return 'تعداد درخواست‌ها زیاد است (۴۲۹). کمی صبر کنید و دوباره تلاش کنید.';
  if (code >= 500) return 'سرور دانشگاه در دسترس نیست (' + code + '). کمی بعد دوباره تلاش کنید.';
  return 'خطای سایت دانشگاه (' + code + ').';
}

export const FIREWALL_MESSAGE = 'فایروال دانشگاه این درخواست را مسدود کرد. VPN را خاموش کنید و دوباره تلاش کنید.';
