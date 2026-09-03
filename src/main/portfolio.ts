import type { HistoryPoint, Quote, WatchlistItem } from './providers/types';
import type { Transaction } from './store';
import { computePosition } from './position';

// Pure portfolio math (no fs/electron imports) so it can be bundled into
// both the main process (for the aggregate summary IPC handler) and the
// settings renderer (for the benchmark comparison, which only needs a
// single item's already-fetched history) — same boundary-crossing pattern
// as position.ts.

export interface ItemValuation {
  itemId: string;
  currency: string;
  quantity: number;
  costBasis: number; // quantity * avgCost, not per-unit
  marketValue: number;
  unrealizedPL: number;
  realizedPL: number;
}

// Returns null when the item has no portfolio data (no transactions and no
// manual quantity/costBasis) or no usable live quote — a snapshot view, so
// a transient quote error just drops the item from this round rather than
// showing a stale/misleading value.
export function computeItemValuation(
  item: Pick<WatchlistItem, 'id' | 'currency' | 'quantity' | 'costBasis'>,
  quote: Pick<Quote, 'price' | 'error'> | undefined,
  itemTransactions: Transaction[]
): ItemValuation | null {
  const position = itemTransactions.length > 0 ? computePosition(itemTransactions) : null;
  const quantity = position ? position.quantity : (item.quantity ?? null);
  const avgCost = position ? position.avgCost : (item.costBasis ?? null);
  if (quantity == null || avgCost == null) return null;
  if (!quote || quote.error) return null;

  const realizedPL = position ? position.realizedPL : 0;
  const costBasis = quantity * avgCost;
  const marketValue = quantity * quote.price;
  return {
    itemId: item.id,
    currency: item.currency,
    quantity,
    costBasis,
    marketValue,
    unrealizedPL: marketValue - costBasis,
    realizedPL,
  };
}

// One entry per currency, never summed across currencies (mixing e.g. TRY
// and USD totals would be misleading — same principle the README already
// states for the watchlist's own totals).
export interface CurrencyGroupSummary {
  currency: string;
  itemCount: number;
  totalCostBasis: number;
  totalMarketValue: number;
  unrealizedPL: number;
  realizedPL: number;
  returnPercent: number | null;
}

export function groupValuationsByCurrency(valuations: ItemValuation[]): CurrencyGroupSummary[] {
  const groups = new Map<string, CurrencyGroupSummary>();
  for (const v of valuations) {
    const g = groups.get(v.currency) ?? {
      currency: v.currency,
      itemCount: 0,
      totalCostBasis: 0,
      totalMarketValue: 0,
      unrealizedPL: 0,
      realizedPL: 0,
      returnPercent: null,
    };
    g.itemCount += 1;
    g.totalCostBasis += v.costBasis;
    g.totalMarketValue += v.marketValue;
    g.unrealizedPL += v.unrealizedPL;
    g.realizedPL += v.realizedPL;
    groups.set(v.currency, g);
  }
  for (const g of groups.values()) {
    g.returnPercent = g.totalCostBasis !== 0 ? (g.unrealizedPL / g.totalCostBasis) * 100 : null;
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

// Simple first-point-to-last-point return over whatever range of history is
// passed in (the caller picks the range, e.g. via the existing chart-range
// history fetch) — not a true time-weighted return against the portfolio's
// actual purchase dates, so the UI should present it as an approximation.
export function computeBenchmarkReturnPercent(history: Pick<HistoryPoint, 'v'>[]): number | null {
  if (history.length < 2) return null;
  const first = history[0].v;
  const last = history[history.length - 1].v;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}
