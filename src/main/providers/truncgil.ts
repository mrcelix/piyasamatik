import type { Quote, SearchResult } from './types';

const API_URL = 'https://finans.truncgil.com/today.json';

// Curated set of Turkish currency & gold codes exposed by the Truncgil "today.json" feed.
// https://finans.truncgil.com/ is a free, keyless feed commonly used by Turkish
// doviz/altin widgets (successor data source to TCMB-style trackers).
export const CURRENCY_CODES: { code: string; label: string }[] = [
  { code: 'USD', label: 'Amerikan Dolari' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'Ingiliz Sterlini' },
  { code: 'CHF', label: 'Isvicre Frangi' },
  { code: 'JPY', label: 'Japon Yeni' },
  { code: 'SAR', label: 'Suudi Arabistan Riyali' },
  { code: 'CAD', label: 'Kanada Dolari' },
  { code: 'AUD', label: 'Avustralya Dolari' },
  { code: 'RUB', label: 'Rus Rublesi' },
];

const OUNCE_CODE = 'ons';

export const GOLD_CODES: { code: string; label: string }[] = [
  { code: 'ons', label: 'Ons Altin (USD)' },
  { code: 'gram-altin', label: 'Gram Altin' },
  { code: 'gram-has-altin', label: 'Gram Has Altin' },
  { code: 'ceyrek-altin', label: 'Ceyrek Altin' },
  { code: 'yarim-altin', label: 'Yarim Altin' },
  { code: 'tam-altin', label: 'Tam Altin' },
  { code: 'cumhuriyet-altini', label: 'Cumhuriyet Altini' },
  { code: 'ata-altin', label: 'Ata Altin' },
  { code: 'resat-altin', label: 'Resat Altin' },
  { code: 'hamit-altin', label: 'Hamit Altin' },
  { code: 'gumus', label: 'Gumus (Gram)' },
  { code: 'gram-platin', label: 'Gram Platin' },
];

let cache: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 20_000;

async function loadFeed(): Promise<any> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (MiniTakip Desktop Widget)' },
  });
  if (!res.ok) throw new Error(`truncgil HTTP ${res.status}`);
  const data = await res.json();
  cache = { data, fetchedAt: Date.now() };
  return data;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.,-]/g, ''); // strip currency symbols like "$"
    const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchTruncgilQuotes(codes: string[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  let data: any;
  try {
    data = await loadFeed();
  } catch (err: any) {
    for (const code of codes) {
      result.set(code, {
        price: 0,
        changePercent: null,
        currency: code === OUNCE_CODE ? 'USD' : 'TRY',
        updatedAt: Date.now(),
        error: err?.message ?? 'fetch failed',
      });
    }
    return result;
  }

  for (const code of codes) {
    const entry = data?.[code];
    if (!entry) {
      result.set(code, {
        price: 0,
        changePercent: null,
        currency: code === OUNCE_CODE ? 'USD' : 'TRY',
        updatedAt: Date.now(),
        error: 'bulunamadi',
      });
      continue;
    }
    const buy = parseNumber(entry.Alış ?? entry.Alis ?? entry.Buying);
    const sell = parseNumber(entry.Satış ?? entry.Satis ?? entry.Selling);
    const changeRaw = entry['Değişim'] ?? entry.Degisim ?? entry.Change;
    const change = parseNumber(typeof changeRaw === 'string' ? changeRaw.replace('%', '') : changeRaw);
    const price = sell ?? buy ?? 0;
    result.set(code, {
      price,
      changePercent: change,
      currency: code === OUNCE_CODE ? 'USD' : 'TRY',
      updatedAt: Date.now(),
    });
  }
  return result;
}

export interface ConvertCode {
  code: string;
  label: string;
}

export function getConvertibleCodes(): ConvertCode[] {
  return [{ code: 'TRY', label: 'Turk Lirasi' }, ...CURRENCY_CODES, ...GOLD_CODES];
}

/** All convertible codes are priced in TRY per unit, except 'ons' which is USD per unit. */
function rateToTRY(code: string, data: any): number {
  if (code === 'TRY') return 1;
  if (code === OUNCE_CODE) {
    const ons = parseNumber(data.ons?.Satış) ?? 0;
    const usd = parseNumber(data.USD?.Satış) ?? 0;
    return ons * usd;
  }
  return parseNumber(data[code]?.Satış) ?? 0;
}

export async function convertAmount(amount: number, fromCode: string, toCode: string): Promise<number> {
  const data = await loadFeed();
  const fromRate = rateToTRY(fromCode, data);
  const toRate = rateToTRY(toCode, data);
  if (!fromRate || !toRate) throw new Error('kur bulunamadi');
  return (amount * fromRate) / toRate;
}

export function searchTruncgil(query: string): SearchResult[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return [];
  const matches: SearchResult[] = [];
  for (const c of CURRENCY_CODES) {
    if (c.code.toLowerCase().includes(q) || c.label.toLocaleLowerCase('tr').includes(q)) {
      matches.push({ category: 'currency', symbol: c.code, label: c.label, currency: 'TRY' });
    }
  }
  for (const g of GOLD_CODES) {
    if (g.code.toLowerCase().includes(q) || g.label.toLocaleLowerCase('tr').includes(q)) {
      matches.push({ category: 'gold', symbol: g.code, label: g.label, currency: g.code === OUNCE_CODE ? 'USD' : 'TRY' });
    }
  }
  return matches;
}
