import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { HistoryPoint, ItemCategory, Quote, WatchlistItem } from './providers/types';

// Currency/gold have no free historical-data API (see fetchHistoryForItem's
// comment in providers/index.ts), so instead we build our own history by
// snapshotting each currency/gold item's price once per calendar day, going
// forward from whenever a user first adds/keeps that item. This can never
// backfill data from before the app was installed — that limitation is
// surfaced to the user directly in the chart window (see chart.ts).

const MAX_POINTS_PER_KEY = 730; // ~2 years of daily snapshots

type HistoryStore = Record<string, HistoryPoint[]>;

function filePath(): string {
  return path.join(app.getPath('userData'), 'price-history.json');
}

function loadStore(): HistoryStore {
  try {
    return JSON.parse(fs.readFileSync(filePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveStore(store: HistoryStore): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(store));
}

export function historyKey(category: string, symbol: string): string {
  return `${category}:${symbol}`;
}

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Pure: today's snapshot overwrites in place (so the chart's "today" point
// keeps tracking the latest price intraday) instead of appending a new point
// per refresh tick; a new calendar day appends. Returns the same array
// reference when nothing actually changed, so callers can skip persisting.
export function upsertSnapshot(points: HistoryPoint[], now: number, price: number): HistoryPoint[] {
  const last = points[points.length - 1];
  if (last && isSameCalendarDay(last.t, now) && last.v === price) return points;
  const next = last && isSameCalendarDay(last.t, now) ? [...points.slice(0, -1), { t: now, v: price }] : [...points, { t: now, v: price }];
  return next.length > MAX_POINTS_PER_KEY ? next.slice(next.length - MAX_POINTS_PER_KEY) : next;
}

const RANGE_CUTOFF_MS: Record<string, number> = {
  '1g': 1 * 24 * 60 * 60 * 1000,
  '1h': 5 * 24 * 60 * 60 * 1000,
  '1a': 31 * 24 * 60 * 60 * 1000,
  '3a': 92 * 24 * 60 * 60 * 1000,
  '6a': 183 * 24 * 60 * 60 * 1000,
  '1y': 366 * 24 * 60 * 60 * 1000,
};

// Pure: same CHART_RANGES keys used for Yahoo/CoinGecko history (see
// providers/index.ts), applied here as a simple "since N ms ago" cutoff
// since our own data is daily-granularity regardless of range.
export function filterByRange(points: HistoryPoint[], rangeKey: string, now: number): HistoryPoint[] {
  const cutoffMs = RANGE_CUTOFF_MS[rangeKey];
  if (!cutoffMs) return points;
  const cutoff = now - cutoffMs;
  return points.filter((p) => p.t >= cutoff);
}

const SNAPSHOT_CATEGORIES: ItemCategory[] = ['currency', 'gold'];

export function recordSnapshots(
  items: Pick<WatchlistItem, 'id' | 'category' | 'symbol'>[],
  quotes: Map<string, Quote>,
  now: number = Date.now()
): void {
  const store = loadStore();
  let changed = false;
  for (const item of items) {
    if (!SNAPSHOT_CATEGORIES.includes(item.category)) continue;
    const quote = quotes.get(item.id);
    if (!quote || quote.error || !quote.price) continue;
    const key = historyKey(item.category, item.symbol);
    const existing = store[key] ?? [];
    const updated = upsertSnapshot(existing, now, quote.price);
    if (updated !== existing) {
      store[key] = updated;
      changed = true;
    }
  }
  if (changed) saveStore(store);
}

export function getStoredHistory(category: string, symbol: string, rangeKey: string): HistoryPoint[] {
  const store = loadStore();
  const points = store[historyKey(category, symbol)] ?? [];
  return filterByRange(points, rangeKey, Date.now());
}
