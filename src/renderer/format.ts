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
