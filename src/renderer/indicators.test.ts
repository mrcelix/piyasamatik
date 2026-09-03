import { describe, it, expect } from 'vitest';
import { computeSMA, computeRSI } from './indicators';
import type { HistoryPoint } from '../main/providers/types';

function points(values: number[]): HistoryPoint[] {
  return values.map((v, i) => ({ t: i, v }));
}

describe('computeSMA', () => {
  it('leaves entries before the period is filled as null', () => {
    const result = computeSMA(points([1, 2, 3]), 5);
    expect(result).toEqual([null, null, null]);
  });

  it('computes a simple moving average once enough points exist', () => {
    const result = computeSMA(points([1, 2, 3, 4, 5]), 3);
    expect(result).toEqual([null, null, 2, 3, 4]);
  });

  it('slides the window forward correctly', () => {
    const result = computeSMA(points([10, 20, 30, 40]), 2);
    expect(result).toEqual([null, 15, 25, 35]);
  });
});

describe('computeRSI', () => {
  it('returns all nulls when there are fewer points than period + 1', () => {
    const result = computeRSI(points([1, 2, 3]), 14);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it('returns 100 when every move in the seed window is a gain', () => {
    const series = Array.from({ length: 15 }, (_, i) => i + 1); // strictly increasing
    const result = computeRSI(points(series), 14);
    expect(result[14]).toBe(100);
  });

  it('returns a mid-range value for an alternating series', () => {
    const series = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10];
    const result = computeRSI(points(series), 14);
    expect(result[14]).not.toBeNull();
    expect(result[14]!).toBeGreaterThan(0);
    expect(result[14]!).toBeLessThan(100);
  });
});
