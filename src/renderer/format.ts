export function formatPrice(value: number, currency: string): string {
  if (!Number.isFinite(value) || value === 0) return '--';
  const decimals = value >= 1000 ? 2 : value >= 1 ? 4 : 8;
  const formatted = value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: decimals });
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return '';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function changeClass(change: number | null): string {
  if (change === null || !Number.isFinite(change) || change === 0) return 'change-flat';
  return change > 0 ? 'change-up' : 'change-down';
}

export const CHART_ICON =
  '<svg viewBox="0 0 16 16" width="11" height="11"><polyline points="1,13 5,8 9,10 15,2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const MAGNET_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M4 2v6a4 4 0 0 0 8 0V2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 1.3v3.2M12 1.3v3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export const NEWS_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12"><rect x="1" y="2" width="14" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="3.5" y1="5" x2="12.5" y2="5" stroke="currentColor" stroke-width="1.2"/><line x1="3.5" y1="8" x2="12.5" y2="8" stroke="currentColor" stroke-width="1.2"/><line x1="3.5" y1="11" x2="9" y2="11" stroke="currentColor" stroke-width="1.2"/></svg>';

export const TRANSPARENT_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="1" y="1" width="7" height="7" fill="currentColor" opacity="0.35"/><rect x="8" y="8" width="7" height="7" fill="currentColor" opacity="0.35"/></svg>';

// ---- Per-asset icon (currency flag or category glyph) ----

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  CHF: '🇨🇭',
  JPY: '🇯🇵',
  SAR: '🇸🇦',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  RUB: '🇷🇺',
  TRY: '🇹🇷',
};

const GOLD_COIN_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="#f0c454" stroke="#c99a2e" stroke-width="1.2"/><path d="M5 8h6M8 5v6" stroke="#c99a2e" stroke-width="1.2" stroke-linecap="round"/></svg>';

const CRYPTO_COIN_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="#8a63d2" stroke="#6a45b0" stroke-width="1"/><path d="M5 6.3l3-1.8 3 1.8v3.4l-3 1.8-3-1.8z" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>';

const STOCK_BARS_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="9" width="3" height="5" fill="currentColor"/><rect x="6.5" y="6" width="3" height="8" fill="currentColor"/><rect x="11" y="3" width="3" height="11" fill="currentColor"/></svg>';

const GLOBE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/><ellipse cx="8" cy="8" rx="3" ry="7" fill="none" stroke="currentColor" stroke-width="1"/><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1"/></svg>';

export function getAssetIconHtml(category: string, symbol: string): string {
  if (category === 'currency') return CURRENCY_FLAGS[symbol] ?? GLOBE_ICON;
  if (category === 'gold') return GOLD_COIN_ICON;
  if (category === 'crypto') return CRYPTO_COIN_ICON;
  if (category === 'stock' || category === 'index') return STOCK_BARS_ICON;
  return GLOBE_ICON;
}

export const AUTOFIT_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- Tick direction indicator (up/down/neutral vs the previous update) ----
// Rendered as small precise SVG shapes (fill via currentColor) rather than Unicode
// glyphs, which render inconsistently at small sizes and can look like stray blobs.

const DIR_UP_ICON = '<svg viewBox="0 0 10 10" width="8" height="8"><polygon points="5,1 9,8 1,8" fill="currentColor"/></svg>';
const DIR_DOWN_ICON = '<svg viewBox="0 0 10 10" width="8" height="8"><polygon points="5,9 1,2 9,2" fill="currentColor"/></svg>';
const DIR_FLAT_ICON =
  '<svg viewBox="0 0 10 10" width="8" height="8"><rect x="1" y="4.2" width="8" height="1.6" rx="0.8" fill="currentColor"/></svg>';

export function getDirectionIndicator(newPrice: number, oldPrice: number | undefined): { html: string; cls: string } {
  if (oldPrice == null || !Number.isFinite(newPrice) || !Number.isFinite(oldPrice) || newPrice === oldPrice) {
    return { html: DIR_FLAT_ICON, cls: 'change-flat' };
  }
  return newPrice > oldPrice ? { html: DIR_UP_ICON, cls: 'change-up' } : { html: DIR_DOWN_ICON, cls: 'change-down' };
}
