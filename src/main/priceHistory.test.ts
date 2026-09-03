import { describe, it, expect } from 'vitest';
import { upsertSnapshot, filterByRange, historyKey } from './priceHistory';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000; // arbitrary fixed epoch ms, well within a single calendar day

describe('historyKey', () => {
  it('namespaces by category so identically-named symbols across categories cannot collide', () => {
    expect(historyKey('currency', 'USD')).not.toBe(historyKey('gold', 'USD'));
  });
});

describe('upsertSnapshot', () => {
  it('appends a first point to an empty series', () => {
    const result = upsertSnapshot([], T0, 40);
    expect(result).toEqual([{ t: T0, v: 40 }]);
  });

  it('overwrites the last point when called again on the same calendar day', () => {
    const first = upsertSnapshot([], T0, 40);
    const second = upsertSnapshot(first, T0 + 60_000, 41);
    expect(second).toEqual([{ t: T0 + 60_000, v: 41 }]);
  });

  it('appends a new point once the calendar day rolls over', () => {
    const first = upsertSnapshot([], T0, 40);
    const second = upsertSnapshot(first, T0 + DAY, 42);
    expect(second).toEqual([
      { t: T0, v: 40 },
      { t: T0 + DAY, v: 42 },
    ]);
  });

  it('returns the same array reference (no-op) when price is unchanged within the same day', () => {
    const first = upsertSnapshot([], T0, 40);
    const second = upsertSnapshot(first, T0 + 60_000, 40);
    expect(second).toBe(first);
  });

  it('caps retention to the configured max, dropping the oldest points', () => {
    let points: { t: number; v: number }[] = [];
    for (let i = 0; i < 800; i++) {
      points = upsertSnapshot(points, T0 + i * DAY, i);
    }
    expect(points.length).toBe(730);
    expect(points[0].v).toBe(800 - 730);
    expect(points[points.length - 1].v).toBe(799);
  });
});

describe('filterByRange', () => {
  const points = [
    { t: T0 - 400 * DAY, v: 1 },
    { t: T0 - 100 * DAY, v: 2 },
    { t: T0 - 10 * DAY, v: 3 },
    { t: T0 - 1 * DAY, v: 4 },
    { t: T0, v: 5 },
  ];

  it('keeps only points within the range cutoff', () => {
    expect(filterByRange(points, '1a', T0)).toEqual([
      { t: T0 - 10 * DAY, v: 3 },
      { t: T0 - 1 * DAY, v: 4 },
      { t: T0, v: 5 },
    ]);
  });

  it('returns everything for an unrecognized range key', () => {
    expect(filterByRange(points, 'bogus', T0)).toEqual(points);
  });

  it('a wide range (1y) still excludes points older than a year', () => {
    const result = filterByRange(points, '1y', T0);
    expect(result.some((p) => p.v === 1)).toBe(false);
  });
});
