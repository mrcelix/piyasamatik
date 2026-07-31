import type { Quote, SearchResult, ItemCategory, HistoryPoint } from './types';

const CHART_URL = (symbol: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
const SPARKLINE_URL = (symbol: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
const HISTORY_URL = (symbol: string, range: string, interval: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
const SEARCH_URL = (q: string) =>
  `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (MiniTakip Desktop Widget)' };

async function fetchOne(symbol: string): Promise<Quote> {
  try {
    const res = await fetch(CHART_URL(symbol), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(json?.chart?.error?.description ?? 'veri yok');
    const meta = result.meta;
    const price = meta.regularMarketPrice as number;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    return {
      price,
      changePercent,
      currency: meta.currency ?? '',
      updatedAt: Date.now(),
    };
  } catch (err: any) {
    return {
      price: 0,
      changePercent: null,
      currency: 'USD',
      updatedAt: Date.now(),
      error: err?.message ?? 'fetch failed',
    };
  }
}

export async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  const settled = await Promise.all(symbols.map((s) => fetchOne(s)));
  symbols.forEach((s, i) => result.set(s, settled[i]));
  return result;
}

async function fetchOneSparkline(symbol: string): Promise<number[]> {
  try {
    const res = await fetch(SPARKLINE_URL(symbol), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const closes: (number | null)[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return closes.filter((v): v is number => typeof v === 'number');
  } catch {
    return [];
  }
}

export async function fetchYahooSparklines(symbols: string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const settled = await Promise.all(symbols.map((s) => fetchOneSparkline(s)));
  symbols.forEach((s, i) => result.set(s, settled[i]));
  return result;
}

export async function fetchYahooHistory(symbol: string, range: string, interval: string): Promise<HistoryPoint[]> {
  try {
    const res = await fetch(HISTORY_URL(symbol, range, interval), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const points: HistoryPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const v = closes[i];
      if (typeof v === 'number') points.push({ t: timestamps[i] * 1000, v });
    }
    return points;
  } catch {
    return [];
  }
}

function mapQuoteType(quoteType: string): ItemCategory {
  if (quoteType === 'INDEX') return 'index';
  if (quoteType === 'CRYPTOCURRENCY') return 'crypto';
  return 'stock';
}

export async function searchYahoo(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(SEARCH_URL(q), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const quotes: any[] = json?.quotes ?? [];
    return quotes
      .filter((qt) => qt.symbol && (qt.quoteType === 'EQUITY' || qt.quoteType === 'INDEX' || qt.quoteType === 'ETF'))
      .map((qt) => ({
        category: mapQuoteType(qt.quoteType),
        symbol: qt.symbol,
        label: qt.shortname ?? qt.longname ?? qt.symbol,
        // Search results don't include a currency field; the actual quote
        // (fetched separately once added) always reads the real currency
        // from Yahoo's chart endpoint, so this is only a display heuristic
        // for the search list itself. Istanbul-listed symbols trade in TRY.
        currency: qt.exchange === 'IST' ? 'TRY' : 'USD',
        sub: qt.exchDisp ?? qt.exchange,
      }));
  } catch {
    return [];
  }
}
