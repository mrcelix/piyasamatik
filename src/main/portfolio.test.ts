import { describe, it, expect } from 'vitest';
import { computeItemValuation, groupValuationsByCurrency, computeBenchmarkReturnPercent } from './portfolio';
import type { Transaction } from './store';

function tx(partial: Partial<Transaction>): Transaction {
  return { id: 'x', itemId: 'item', type: 'buy', quantity: 0, price: 0, date: 0, ...partial } as Transaction;
}

describe('computeItemValuation', () => {
  it('returns null when the item has no manual quantity/costBasis and no transactions', () => {
    const result = computeItemValuation({ id: 'i1', currency: 'TRY' }, { price: 100 }, []);
    expect(result).toBeNull();
  });

  it('returns null when there is no usable live quote', () => {
    const result = computeItemValuation({ id: 'i1', currency: 'TRY', quantity: 10, costBasis: 5 }, undefined, []);
    expect(result).toBeNull();
  });

  it('returns null when the quote errored', () => {
    const result = computeItemValuation(
      { id: 'i1', currency: 'TRY', quantity: 10, costBasis: 5 },
      { price: 0, error: 'fail' },
      []
    );
    expect(result).toBeNull();
  });

  it('values a manually-entered quantity/costBasis position against the live price', () => {
    const result = computeItemValuation({ id: 'i1', currency: 'TRY', quantity: 10, costBasis: 5 }, { price: 8 }, []);
    expect(result).toEqual({
      itemId: 'i1',
      currency: 'TRY',
      quantity: 10,
      costBasis: 50,
      marketValue: 80,
      unrealizedPL: 30,
      realizedPL: 0,
    });
  });

  it('prefers the transaction-derived position over manual quantity/costBasis when both exist', () => {
    const result = computeItemValuation(
      { id: 'i1', currency: 'TRY', quantity: 999, costBasis: 999 },
      { price: 10 },
      [tx({ type: 'buy', quantity: 4, price: 5, date: 1 })]
    );
    expect(result?.quantity).toBe(4);
    expect(result?.costBasis).toBe(20);
    expect(result?.marketValue).toBe(40);
  });

  it('includes realizedPL from transactions in the valuation', () => {
    const result = computeItemValuation({ id: 'i1', currency: 'TRY' }, { price: 12 }, [
      tx({ type: 'buy', quantity: 10, price: 10, date: 1 }),
      tx({ type: 'sell', quantity: 4, price: 15, date: 2 }),
    ]);
    expect(result?.quantity).toBe(6);
    expect(result?.realizedPL).toBe(4 * (15 - 10));
  });
});

describe('groupValuationsByCurrency', () => {
  it('sums valuations within a currency and never mixes currencies together', () => {
    const groups = groupValuationsByCurrency([
      { itemId: 'a', currency: 'TRY', quantity: 1, costBasis: 100, marketValue: 120, unrealizedPL: 20, realizedPL: 0 },
      { itemId: 'b', currency: 'TRY', quantity: 1, costBasis: 200, marketValue: 180, unrealizedPL: -20, realizedPL: 5 },
      { itemId: 'c', currency: 'USD', quantity: 1, costBasis: 50, marketValue: 60, unrealizedPL: 10, realizedPL: 0 },
    ]);
    expect(groups).toHaveLength(2);
    const try_ = groups.find((g) => g.currency === 'TRY')!;
    expect(try_.itemCount).toBe(2);
    expect(try_.totalCostBasis).toBe(300);
    expect(try_.totalMarketValue).toBe(300);
    expect(try_.unrealizedPL).toBe(0);
    expect(try_.realizedPL).toBe(5);
    expect(try_.returnPercent).toBe(0);

    const usd = groups.find((g) => g.currency === 'USD')!;
    expect(usd.totalCostBasis).toBe(50);
    expect(usd.returnPercent).toBeCloseTo(20);
  });

  it('returns an empty array for no valuations', () => {
    expect(groupValuationsByCurrency([])).toEqual([]);
  });

  it('leaves returnPercent null when total cost basis is 0', () => {
    const groups = groupValuationsByCurrency([
      { itemId: 'a', currency: 'TRY', quantity: 1, costBasis: 0, marketValue: 0, unrealizedPL: 0, realizedPL: 3 },
    ]);
    expect(groups[0].returnPercent).toBeNull();
  });
});

describe('computeBenchmarkReturnPercent', () => {
  it('computes percent change from the first to the last point', () => {
    expect(computeBenchmarkReturnPercent([{ v: 100 }, { v: 110 }, { v: 121 }])).toBeCloseTo(21);
  });

  it('returns null with fewer than 2 points', () => {
    expect(computeBenchmarkReturnPercent([])).toBeNull();
    expect(computeBenchmarkReturnPercent([{ v: 100 }])).toBeNull();
  });

  it('returns null when the first point is 0 (would divide by zero)', () => {
    expect(computeBenchmarkReturnPercent([{ v: 0 }, { v: 10 }])).toBeNull();
  });
});
