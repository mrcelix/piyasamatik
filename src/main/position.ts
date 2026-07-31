import type { Transaction } from './store';

// Pure math, no Electron/Node dependency, so it can be bundled into both the
// main process and the renderer without pulling in `store.ts`'s fs/electron
// imports (only its types are used here, which TypeScript erases at compile time).

export interface ComputedPosition {
  quantity: number;
  avgCost: number;
  realizedPL: number;
}

// Average-cost method (not FIFO lot tracking): a buy blends into the running
// average cost; a sell realizes P/L against the current average cost without
// changing it. Transactions are processed in chronological order regardless
// of the order they're passed in.
export function computePosition(itemTransactions: Transaction[]): ComputedPosition {
  const sorted = [...itemTransactions].sort((a, b) => a.date - b.date);
  let quantity = 0;
  let avgCost = 0;
  let realizedPL = 0;
  for (const tx of sorted) {
    if (tx.type === 'buy') {
      const newQuantity = quantity + tx.quantity;
      avgCost = newQuantity !== 0 ? (quantity * avgCost + tx.quantity * tx.price) / newQuantity : 0;
      quantity = newQuantity;
    } else {
      const sellQty = Math.min(tx.quantity, quantity);
      realizedPL += sellQty * (tx.price - avgCost);
      quantity -= sellQty;
    }
  }
  return { quantity, avgCost, realizedPL };
}
