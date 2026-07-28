export type ItemCategory = 'currency' | 'gold' | 'stock' | 'index' | 'crypto';

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
  favorite?: boolean;
  // Custom accent color (hex) for this item's row / detached widget.
  color?: string;
}

export interface Quote {
  price: number;
  changePercent: number | null;
  currency: string;
  updatedAt: number;
  error?: string;
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
