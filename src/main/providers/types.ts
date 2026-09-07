export type ItemCategory = 'currency' | 'gold' | 'stock' | 'index' | 'crypto' | 'fund';

export interface WatchlistItem {
  id: string;
  category: ItemCategory;
  symbol: string;
  label: string;
  currency: string;
  // Portfolio tracking (optional; both set together to show P/L).
  quantity?: number;
  costBasis?: number;
  // Price target alerts (optional; either or both may be set).
  alertAbove?: number;
  alertBelow?: number;
  // Daily percent-change alerts (optional; either or both may be set).
  // Compared against the provider's own changePercent (day change).
  alertUpPercent?: number;
  alertDownPercent?: number;
  // Ratio (correlation) alert: compares this item's price against another
  // tracked item's price (price / alertRatioTargetId's price).
  alertRatioTargetId?: string;
  alertRatioAbove?: number;
  alertRatioBelow?: number;
  favorite?: boolean;
  // Custom accent color (hex) for this item's row / detached widget.
  color?: string;
  // Which named watchlist this item belongs to; absent means the default list
  // (items created before multi-list support existed, or a single-list setup).
  listId?: string;
}

// Extended-hours (pre-market / after-hours) quote, when one is currently
// running for this instrument. Only Yahoo-backed US equities produce this;
// indices, BIST and every other provider leave it undefined.
export interface ExtendedQuote {
  kind: 'pre' | 'post';
  price: number;
  // Pre-market is quoted against the previous regular close, after-hours
  // against today's regular close — the usual convention on quote sites.
  changePercent: number | null;
}

export interface Quote {
  price: number;
  changePercent: number | null;
  currency: string;
  updatedAt: number;
  error?: string;
  extended?: ExtendedQuote;
}

export interface HistoryPoint {
  t: number; // epoch ms
  v: number;
}

export interface SearchResult {
  category: ItemCategory;
  symbol: string;
  label: string;
  currency: string;
  sub?: string;
}
