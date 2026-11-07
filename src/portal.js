export const PORTAL_ORIGIN = 'https://food.guilan.ac.ir';
export const PORTAL_HOST = 'food.guilan.ac.ir';
export const LEGACY_PANEL_PATH = '/nurture/user/multi/reserve/showPanel.rose';

export function legacyPanelUrl(selfId = 1) {
  return `${PORTAL_ORIGIN}${LEGACY_PANEL_PATH}?selectedSelfDefId=${Number(selfId) || 1}`;
}

// Never include query strings in diagnostics: SSO and payment URLs contain tokens.
export function safePagePath(value) {
  try { const url = new URL(value); return url.origin + url.pathname; } catch { return ''; }
}

export function portalNavigation(value, { wallet = false } = {}) {
  if (value === 'about:blank') return { action: 'allow' };
  let url;
  try { url = new URL(value); } catch { return { action: 'block' }; }
  if (wallet && ['https:', 'http:'].includes(url.protocol)) return { action: 'external', url: url.href };
  if (url.hostname === PORTAL_HOST) {
    return { action: ['https:', 'http:'].includes(url.protocol) ? 'allow' : 'block' };
  }
  if (['samad.app', 'www.samad.app'].includes(url.hostname) && !wallet) return { action: 'block' };
  if (['https:', 'http:', 'intent:', 'market:', 'tel:', 'mailto:'].includes(url.protocol)) return { action: 'external', url: url.href };
  return { action: 'block' };
}
