import { describe, it, expect } from 'vitest';
import { computePosition } from './position';
import type { Transaction } from './store';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    itemId: 'item',
    type: 'buy',
    quantity: 0,
    price: 0,
    date: 0,
    ...partial,
  } as Transaction;
}

describe('computePosition', () => {
  it('returns a flat position with no transactions', () => {
    expect(computePosition([])).toEqual({ quantity: 0, avgCost: 0, realizedPL: 0 });
  });

  it('tracks a single buy', () => {
    const result = computePosition([tx({ type: 'buy', quantity: 10, price: 100, date: 1 })]);
    expect(result).toEqual({ quantity: 10, avgCost: 100, realizedPL: 0 });
  });

  it('blends average cost across multiple buys', () => {
    const result = computePosition([
      tx({ type: 'buy', quantity: 10, price: 100, date: 1 }),
      tx({ type: 'buy', quantity: 10, price: 200, date: 2 }),
    ]);
    expect(result.quantity).toBe(20);
    expect(result.avgCost).toBe(150);
    expect(result.realizedPL).toBe(0);
  });

  it('realizes P/L against the current average cost on a sell, without moving avgCost', () => {
    const result = computePosition([
      tx({ type: 'buy', quantity: 10, price: 100, date: 1 }),
      tx({ type: 'sell', quantity: 4, price: 150, date: 2 }),
    ]);
    expect(result.quantity).toBe(6);
    expect(result.avgCost).toBe(100);
    expect(result.realizedPL).toBe(4 * (150 - 100));
  });

  it('clamps a sell larger than the held quantity to the held quantity', () => {
    const result = computePosition([
      tx({ type: 'buy', quantity: 5, price: 100, date: 1 }),
      tx({ type: 'sell', quantity: 20, price: 120, date: 2 }),
    ]);
    expect(result.quantity).toBe(0);
    expect(result.realizedPL).toBe(5 * (120 - 100));
  });

  it('leaves avgCost at its last buy-derived value once the position is fully closed (a sell never touches avgCost)', () => {
    const result = computePosition([
      tx({ type: 'buy', quantity: 5, price: 100, date: 1 }),
      tx({ type: 'sell', quantity: 5, price: 120, date: 2 }),
    ]);
    expect(result.quantity).toBe(0);
    expect(result.avgCost).toBe(100);
  });

  it('processes transactions in chronological order regardless of input order', () => {
    const chronological = computePosition([
      tx({ type: 'buy', quantity: 10, price: 100, date: 1 }),
      tx({ type: 'buy', quantity: 10, price: 200, date: 2 }),
      tx({ type: 'sell', quantity: 5, price: 250, date: 3 }),
    ]);
    const shuffled = computePosition([
      tx({ type: 'sell', quantity: 5, price: 250, date: 3 }),
      tx({ type: 'buy', quantity: 10, price: 200, date: 2 }),
      tx({ type: 'buy', quantity: 10, price: 100, date: 1 }),
    ]);
    expect(shuffled).toEqual(chronological);
  });
});
