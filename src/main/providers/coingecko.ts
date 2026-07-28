import type { Quote, SearchResult, HistoryPoint } from './types';

const PRICE_URL = (ids: string[]) =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(',')
  )}&vs_currencies=usd&include_24hr_change=true`;
const SEARCH_URL = (q: string) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const MARKET_CHART_URL = (id: string) =>
  `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7`;

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (MiniTakip Desktop Widget)' };

export async function fetchCoingeckoQuotes(ids: string[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  if (ids.length === 0) return result;
  try {
    const res = await fetch(PRICE_URL(ids), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    for (const id of ids) {
      const entry = json?.[id];
      if (!entry) {
        result.set(id, { price: 0, changePercent: null, currency: 'USD', updatedAt: Date.now(), error: 'bulunamadi' });
        continue;
      }
      result.set(id, {
        price: entry.usd ?? 0,
        changePercent: entry.usd_24h_change ?? null,
        currency: 'USD',
        updatedAt: Date.now(),
      });
    }
  } catch (err: any) {
    for (const id of ids) {
      result.set(id, { price: 0, changePercent: null, currency: 'USD', updatedAt: Date.now(), error: err?.message ?? 'fetch failed' });
    }
  }
  return result;
}

async function fetchOneSparkline(id: string): Promise<number[]> {
  try {
    const res = await fetch(MARKET_CHART_URL(id), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const prices: [number, number][] = json?.prices ?? [];
    return prices.map((p) => p[1]);
  } catch {
    return [];
  }
}

export async function fetchCoingeckoSparklines(ids: string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const settled = await Promise.all(ids.map((id) => fetchOneSparkline(id)));
  ids.forEach((id, i) => result.set(id, settled[i]));
  return result;
}

const HISTORY_URL = (id: string, days: number) =>
  `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;

export async function fetchCoingeckoHistory(id: string, days: number): Promise<HistoryPoint[]> {
  try {
    const res = await fetch(HISTORY_URL(id, days), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const prices: [number, number][] = json?.prices ?? [];
    return prices.map(([t, v]) => ({ t, v }));
  } catch {
    return [];
  }
}

export async function searchCoingecko(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(SEARCH_URL(q), { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const coins: any[] = json?.coins ?? [];
    return coins.slice(0, 10).map((c) => ({
      category: 'crypto' as const,
      symbol: c.id,
      label: `${c.name} (${(c.symbol ?? '').toUpperCase()})`,
      currency: 'USD',
      sub: 'Kripto Para',
    }));
  } catch {
    return [];
  }
}
