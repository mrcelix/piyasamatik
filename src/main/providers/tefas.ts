import type { HistoryPoint, Quote, SearchResult } from './types';

// TEFAS (Turkiye Elektronik Fon Alim Satim Platformu) has no public/documented
// API; these are the Next.js site's own internal JSON endpoints (verified
// working directly, no auth/cookies/session/particular headers required
// beyond Content-Type: application/json). The old `/api/DB/BindHistoryInfo`
// endpoint referenced by most older scraper tutorials is dead (404) since a
// 2026 site redesign.
const FUND_LIST_URL = 'https://www.tefas.gov.tr/api/funds/fonGetiriBazliBilgiGetir';
const FUND_HISTORY_URL = 'https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir';

interface TefasFundListEntry {
  fonKodu: string;
  fonUnvan: string;
  fonTurAciklama?: string;
}

// The whole fund roster (1000+ funds) comes back in one unpaginated call, so
// we fetch it once and cache — the roster itself changes rarely, unlike
// prices.
let fundListCache: { data: TefasFundListEntry[]; fetchedAt: number } | null = null;
const FUND_LIST_TTL_MS = 60 * 60 * 1000;

async function loadFundList(): Promise<TefasFundListEntry[]> {
  if (fundListCache && Date.now() - fundListCache.fetchedAt < FUND_LIST_TTL_MS) {
    return fundListCache.data;
  }
  const res = await fetch(FUND_LIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dil: 'TR',
      fonTipi: 'YAT',
      kurucuKodu: null,
      sfonTurKod: null,
      fonTurAciklama: null,
      islem: 1,
      fonTurKod: null,
      fonGrubu: null,
      donemGetiri1a: '1',
      donemGetiri3a: '1',
      donemGetiri6a: '1',
      donemGetiri1y: '1',
      donemGetiriyb: '1',
      donemGetiri3y: '1',
      donemGetiri5y: '1',
      basTarih: null,
      bitTarih: null,
      calismaTipi: 2,
      getiriOrani: '1',
    }),
  });
  if (!res.ok) throw new Error(`tefas HTTP ${res.status}`);
  const json: any = await res.json();
  const list: TefasFundListEntry[] = json?.resultList ?? [];
  fundListCache = { data: list, fetchedAt: Date.now() };
  return list;
}

// Real TEFAS fund names carry proper Turkish diacritics (e.g. "PORTFÖY"),
// but 'I'.toLocaleLowerCase('tr') is 'ı' (dotless), not 'i' — so a plain
// ASCII query like "altin" would never match "ALTIN" without folding both
// sides to a common ASCII-ish form first (mirrors how this app's own
// Turkish labels are written in plain ASCII throughout).
function turkishFold(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase();
}

export async function searchTefas(query: string): Promise<SearchResult[]> {
  const q = turkishFold(query.trim());
  if (!q) return [];
  let list: TefasFundListEntry[];
  try {
    list = await loadFundList();
  } catch {
    return [];
  }
  return list
    .filter((f) => turkishFold(f.fonKodu).includes(q) || turkishFold(f.fonUnvan).includes(q))
    .slice(0, 25)
    .map((f) => ({ category: 'fund', symbol: f.fonKodu, label: f.fonUnvan, currency: 'TRY', sub: f.fonTurAciklama }));
}

interface TefasHistoryEntry {
  tarih: string; // "YYYY-MM-DD"
  fiyat: number;
}

async function fetchHistoryRaw(code: string, periyod: number): Promise<TefasHistoryEntry[]> {
  const res = await fetch(FUND_HISTORY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fonKodu: code, dil: 'TR', periyod }),
  });
  if (!res.ok) throw new Error(`tefas HTTP ${res.status}`);
  const json: any = await res.json();
  const list: TefasHistoryEntry[] = json?.resultList ?? [];
  return [...list].sort((a, b) => a.tarih.localeCompare(b.tarih));
}

// Fund NAVs are official end-of-day prices published once per business day
// (unlike FX/stocks/crypto), so quotes are cached for an hour rather than
// re-fetched on every refresh tick — there is nothing new to find in between.
const quoteCache = new Map<string, { quote: Quote; fetchedAt: number }>();
const QUOTE_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchOneQuote(code: string): Promise<Quote> {
  try {
    const sorted = await fetchHistoryRaw(code, 1);
    if (sorted.length === 0) throw new Error('veri bulunamadi');
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const changePercent = prev && prev.fiyat !== 0 ? ((latest.fiyat - prev.fiyat) / prev.fiyat) * 100 : null;
    return { price: latest.fiyat, changePercent, currency: 'TRY', updatedAt: Date.now() };
  } catch (err: any) {
    return { price: 0, changePercent: null, currency: 'TRY', updatedAt: Date.now(), error: err?.message ?? 'fetch failed' };
  }
}

export async function fetchTefasQuotes(codes: string[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  await Promise.all(
    codes.map(async (code) => {
      const cached = quoteCache.get(code);
      if (cached && Date.now() - cached.fetchedAt < QUOTE_CACHE_TTL_MS) {
        result.set(code, cached.quote);
        return;
      }
      const quote = await fetchOneQuote(code);
      if (!quote.error) quoteCache.set(code, { quote, fetchedAt: Date.now() });
      result.set(code, quote);
    })
  );
  return result;
}

// The endpoint only takes "months back from today" (no explicit date range),
// snapped to one of a fixed set of periods the server accepts.
const RANGE_TO_PERIYOD: Record<string, number> = {
  '1g': 1,
  '1h': 1,
  '1a': 1,
  '3a': 3,
  '6a': 6,
  '1y': 12,
};

export async function fetchTefasHistory(code: string, rangeKey: string): Promise<HistoryPoint[]> {
  try {
    const periyod = RANGE_TO_PERIYOD[rangeKey] ?? 12;
    const sorted = await fetchHistoryRaw(code, periyod);
    return sorted.map((e) => ({ t: new Date(e.tarih).getTime(), v: e.fiyat }));
  } catch {
    return [];
  }
}
