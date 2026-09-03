import { describe, it, expect } from 'vitest';
import { parseNumber, searchTruncgil } from './truncgil';

describe('parseNumber', () => {
  it('passes numbers through unchanged', () => {
    expect(parseNumber(42.5)).toBe(42.5);
  });

  it('parses Turkish-formatted strings (dot thousands separator, comma decimal)', () => {
    expect(parseNumber('1.234,56')).toBeCloseTo(1234.56);
  });

  it('strips currency symbols before parsing', () => {
    expect(parseNumber('$1.234,56')).toBeCloseTo(1234.56);
  });

  it('returns null for unparseable input', () => {
    expect(parseNumber('yok')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe('searchTruncgil', () => {
  it('is case- and locale-insensitive for Turkish currency/gold labels', () => {
    const results = searchTruncgil('dolar');
    expect(results.some((r) => r.symbol === 'USD')).toBe(true);
  });

  it('matches on code as well as label', () => {
    const results = searchTruncgil('usd');
    expect(results.some((r) => r.symbol === 'USD' && r.category === 'currency')).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchTruncgil('   ')).toEqual([]);
  });
});
