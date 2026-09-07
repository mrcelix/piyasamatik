import { describe, it, expect } from 'vitest';
import { deriveExtendedQuote, type YahooMetaLike } from './yahoo';

// Epochs are arbitrary but internally consistent: a session whose pre-market
// runs 1000-2000, regular 2000-3000 and after-hours 3000-4000.
const PRE = { start: 1000, end: 2000 };
const REGULAR = { start: 2000, end: 3000 };
const POST = { start: 3000, end: 4000 };

function meta(over: Partial<YahooMetaLike> = {}): YahooMetaLike {
  return {
    hasPrePostMarketData: true,
    regularMarketPrice: 100,
    chartPreviousClose: 90,
    fulldayPrice: 110,
    currentTradingPeriod: { pre: PRE, regular: REGULAR, post: POST },
    ...over,
  };
}

const at = (sec: number) => sec * 1000;

describe('deriveExtendedQuote', () => {
  it('reports a pre-market quote against the previous close', () => {
    const ext = deriveExtendedQuote(meta(), at(1500));
    expect(ext).toEqual({
      kind: 'pre',
      price: 110,
      // (110 - 90) / 90
      changePercent: expect.closeTo(22.222, 3),
    });
  });

  it('reports an after-hours quote against today close, not the previous one', () => {
    const ext = deriveExtendedQuote(meta(), at(3500));
    expect(ext?.kind).toBe('post');
    // (110 - 100) / 100 — uses regularMarketPrice, not chartPreviousClose.
    expect(ext?.changePercent).toBeCloseTo(10, 6);
  });

  it('shows nothing during the regular session', () => {
    expect(deriveExtendedQuote(meta(), at(2500))).toBeUndefined();
  });

  // The case that motivated splitting this out. The chart endpoint always
  // answers with the most recent session, so on a US holiday it returns the
  // previous trading day — windows and all. A wall-clock check ("is it
  // pre-market hours in New York?") would then present that stale after-hours
  // price as this morning's pre-market. Requiring `now` to fall inside the
  // payload's own dated windows rejects it.
  it('shows nothing when the payload is a stale session (holiday/weekend)', () => {
    const muchLater = at(4000 + 60 * 60 * 60); // ~60h past the payload's post window
    expect(deriveExtendedQuote(meta(), muchLater)).toBeUndefined();
  });

  it('shows nothing before the payload session has begun', () => {
    expect(deriveExtendedQuote(meta(), at(500))).toBeUndefined();
  });

  it('shows nothing for instruments without extended hours', () => {
    // Indices and BIST report hasPrePostMarketData false, or zero-length
    // windows (start === end), which must not count as "inside".
    expect(deriveExtendedQuote(meta({ hasPrePostMarketData: false }), at(1500))).toBeUndefined();
    expect(
      deriveExtendedQuote(
        meta({ currentTradingPeriod: { pre: { start: 1500, end: 1500 }, regular: REGULAR, post: { start: 3000, end: 3000 } } }),
        at(1500)
      )
    ).toBeUndefined();
  });

  it('shows nothing when nothing has traded outside regular hours yet', () => {
    // Yahoo sets fulldayPrice === regularMarketPrice until an extended trade
    // happens; repeating the same number would be noise.
    expect(deriveExtendedQuote(meta({ fulldayPrice: 100 }), at(1500))).toBeUndefined();
  });

  it('falls back to previousClose when chartPreviousClose is absent', () => {
    const ext = deriveExtendedQuote(
      meta({ chartPreviousClose: undefined, previousClose: 90 }),
      at(1500)
    );
    expect(ext?.changePercent).toBeCloseTo(22.222, 3);
  });

  it('returns a null change rather than dividing by a missing or zero basis', () => {
    expect(
      deriveExtendedQuote(meta({ chartPreviousClose: undefined, previousClose: undefined }), at(1500))
        ?.changePercent
    ).toBeNull();
    expect(deriveExtendedQuote(meta({ chartPreviousClose: 0 }), at(1500))?.changePercent).toBeNull();
  });

  it('tolerates missing prices', () => {
    expect(deriveExtendedQuote(meta({ fulldayPrice: undefined }), at(1500))).toBeUndefined();
    expect(deriveExtendedQuote(meta({ regularMarketPrice: undefined }), at(1500))).toBeUndefined();
    expect(deriveExtendedQuote({}, at(1500))).toBeUndefined();
  });
});
