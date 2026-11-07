import { PORTAL_HOST } from './portal';

// The university confirmation page follows the real in-app amount form.
// Preserve the server query, including consumer and selectedAmount.
export function walletCheckoutPath(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== PORTAL_HOST || url.port || url.username || url.password) return null;
    if (url.pathname !== '/modules/epayment/processing/checkout.rose' || url.searchParams.get('actionName') !== 'requestPaymentForm') return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export async function openWalletCheckout(value, { client, open, active }) {
  if (!walletCheckoutPath(value)) throw new Error('صفحه پرداخت دانشگاه معتبر نیست.');
  if (!active()) return false;
  const loginUrl = await client.checkoutLoginUrl(value);
  if (!active()) return false;
  await open(loginUrl);
  return true;
}
