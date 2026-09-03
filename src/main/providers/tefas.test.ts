import { describe, it, expect, vi, beforeEach } from 'vitest';

function jsonResponse(body: any, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

// tefas.ts caches the fund list and per-code quotes at module scope; reset
// the module registry (and re-import fresh each test) so those caches can't
// leak a mocked response from one test into the next.
beforeEach(() => {
  vi.resetModules();
  global.fetch = vi.fn();
});

describe('searchTefas', () => {
  it('returns [] for an empty query without calling fetch', async () => {
    const { searchTefas } = await import('./tefas');
    const result = await searchTefas('   ');
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('matches funds by code or (Turkish-locale-insensitive) name and maps to SearchResult', async () => {
    (global.fetch as any).mockResolvedValue(
      jsonResponse({
        resultList: [
          { fonKodu: 'TCD', fonUnvan: 'TACİRLER PORTFÖY DEĞIŞKEN FON', fonTurAciklama: 'Degisken Fon' },
          { fonKodu: 'AU1', fonUnvan: 'A1 CAPİTAL PORTFÖY ALTIN FONU', fonTurAciklama: 'Kiymetli Madenler Fonu' },
        ],
      })
    );
    const { searchTefas } = await import('./tefas');
    const result = await searchTefas('altin');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      category: 'fund',
      symbol: 'AU1',
      label: 'A1 CAPİTAL PORTFÖY ALTIN FONU',
      currency: 'TRY',
      sub: 'Kiymetli Madenler Fonu',
    });
  });

  it('returns [] when the fund list request fails, rather than throwing', async () => {
    (global.fetch as any).mockResolvedValue(jsonResponse({}, false));
    const { searchTefas } = await import('./tefas');
    await expect(searchTefas('tcd')).resolves.toEqual([]);
  });
});

describe('fetchTefasQuotes', () => {
  it('derives price from the latest date and changePercent from the prior date', async () => {
    (global.fetch as any).mockResolvedValue(
      jsonResponse({
        resultList: [
          { fonKodu: 'TCD', tarih: '2026-04-29', fiyat: 44.0 },
          { fonKodu: 'TCD', tarih: '2026-04-30', fiyat: 45.410537 },
        ],
      })
    );
    const { fetchTefasQuotes } = await import('./tefas');
    const result = await fetchTefasQuotes(['TCD']);
    const quote = result.get('TCD')!;
    expect(quote.price).toBeCloseTo(45.410537);
    expect(quote.changePercent).toBeCloseTo(((45.410537 - 44.0) / 44.0) * 100);
    expect(quote.currency).toBe('TRY');
    expect(quote.error).toBeUndefined();
  });

  it('returns an error quote when the fund has no history data', async () => {
    (global.fetch as any).mockResolvedValue(jsonResponse({ resultList: [] }));
    const { fetchTefasQuotes } = await import('./tefas');
    const result = await fetchTefasQuotes(['NOPE']);
    expect(result.get('NOPE')?.error).toBeTruthy();
  });

  it('returns an error quote when the request fails, without throwing', async () => {
    (global.fetch as any).mockResolvedValue(jsonResponse({}, false));
    const { fetchTefasQuotes } = await import('./tefas');
    const result = await fetchTefasQuotes(['TCD']);
    expect(result.get('TCD')?.error).toBeTruthy();
  });
});

describe('fetchTefasHistory', () => {
  it('maps tarih/fiyat pairs to HistoryPoint and sorts chronologically', async () => {
    (global.fetch as any).mockResolvedValue(
      jsonResponse({
        resultList: [
          { fonKodu: 'TCD', tarih: '2026-04-30', fiyat: 45.4 },
          { fonKodu: 'TCD', tarih: '2026-03-31', fiyat: 44.0 },
        ],
      })
    );
    const { fetchTefasHistory } = await import('./tefas');
    const result = await fetchTefasHistory('TCD', '3a');
    expect(result).toEqual([
      { t: new Date('2026-03-31').getTime(), v: 44.0 },
      { t: new Date('2026-04-30').getTime(), v: 45.4 },
    ]);
  });

  it('returns [] instead of throwing when the request fails', async () => {
    (global.fetch as any).mockResolvedValue(jsonResponse({}, false));
    const { fetchTefasHistory } = await import('./tefas');
    await expect(fetchTefasHistory('TCD', '1y')).resolves.toEqual([]);
  });
});
