import type { ItemCategory, Quote, SearchResult, WatchlistItem, HistoryPoint } from './types';
import { fetchTruncgilQuotes, searchTruncgil, convertAmount, getConvertibleCodes } from './truncgil';
import { fetchYahooQuotes, searchYahoo, fetchYahooSparklines, fetchYahooHistory } from './yahoo';
import { fetchCoingeckoQuotes, searchCoingecko, fetchCoingeckoSparklines, fetchCoingeckoHistory } from './coingecko';

export * from './types';
export { convertAmount, getConvertibleCodes } from './truncgil';
export type { ConvertCode } from './truncgil';
export { fetchMarketNews } from './news';
export type { NewsItem } from './news';

export interface ChartRange {
  key: string;
  label: string;
}

export const CHART_RANGES: ChartRange[] = [
  { key: '1g', label: '1G' },
  { key: '1h', label: '1H' },
  { key: '1a', label: '1A' },
  { key: '3a', label: '3A' },
  { key: '6a', label: '6A' },
  { key: '1y', label: '1Y' },
];

const YAHOO_RANGE_CONFIG: Record<string, { range: string; interval: string }> = {
  '1g': { range: '1d', interval: '5m' },
  '1h': { range: '5d', interval: '30m' },
  '1a': { range: '1mo', interval: '1d' },
  '3a': { range: '3mo', interval: '1d' },
  '6a': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
};

const GECKO_DAYS_CONFIG: Record<string, number> = {
  '1g': 1,
  '1h': 7,
  '1a': 30,
  '3a': 90,
  '6a': 180,
  '1y': 365,
};

export async function fetchHistoryForItem(item: WatchlistItem, rangeKey: string): Promise<HistoryPoint[]> {
  if (item.category === 'stock' || item.category === 'index') {
    const cfg = YAHOO_RANGE_CONFIG[rangeKey];
    if (!cfg) return [];
    return fetchYahooHistory(item.symbol, cfg.range, cfg.interval);
  }
  if (item.category === 'crypto') {
    const days = GECKO_DAYS_CONFIG[rangeKey];
    if (!days) return [];
    return fetchCoingeckoHistory(item.symbol, days);
  }
  // currency/gold: no free historical data source
  return [];
}

export async function fetchSparklinesForWatchlist(items: WatchlistItem[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();

  // Truncgil (currency/gold) has no free historical endpoint, so no sparkline for those.
  const yahooItems = items.filter((i) => i.category === 'stock' || i.category === 'index');
  const cryptoItems = items.filter((i) => i.category === 'crypto');

  const [yahoo, crypto] = await Promise.all([
    fetchYahooSparklines(yahooItems.map((i) => i.symbol)),
    fetchCoingeckoSparklines(cryptoItems.map((i) => i.symbol)),
  ]);

  for (const item of yahooItems) {
    const s = yahoo.get(item.symbol);
    if (s && s.length > 1) result.set(item.id, s);
  }
  for (const item of cryptoItems) {
    const s = crypto.get(item.symbol);
    if (s && s.length > 1) result.set(item.id, s);
  }

  return result;
}

export async function fetchQuotesForWatchlist(items: WatchlistItem[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();

  const truncgilItems = items.filter((i) => i.category === 'currency' || i.category === 'gold');
  const yahooItems = items.filter((i) => i.category === 'stock' || i.category === 'index');
  const cryptoItems = items.filter((i) => i.category === 'crypto');

  const [truncgil, yahoo, crypto] = await Promise.all([
    fetchTruncgilQuotes(truncgilItems.map((i) => i.symbol)),
    fetchYahooQuotes(yahooItems.map((i) => i.symbol)),
    fetchCoingeckoQuotes(cryptoItems.map((i) => i.symbol)),
  ]);

  for (const item of truncgilItems) {
    const q = truncgil.get(item.symbol);
    if (q) result.set(item.id, q);
  }
  for (const item of yahooItems) {
    const q = yahoo.get(item.symbol);
    if (q) result.set(item.id, q);
  }
  for (const item of cryptoItems) {
    const q = crypto.get(item.symbol);
    if (q) result.set(item.id, q);
  }

  return result;
}

export async function searchAllProviders(query: string): Promise<SearchResult[]> {
  if (query.trim().length < 1) return [];
  const [local, stocks, crypto] = await Promise.all([
    Promise.resolve(searchTruncgil(query)),
    searchYahoo(query),
    searchCoingecko(query),
  ]);
  return [...local, ...stocks, ...crypto];
}

export function categoryLabel(category: ItemCategory): string {
  switch (category) {
    case 'currency':
      return 'Doviz';
    case 'gold':
      return 'Altin/Emtia';
    case 'stock':
      return 'Hisse';
    case 'index':
      return 'Endeks';
    case 'crypto':
      return 'Kripto';
  }
}
