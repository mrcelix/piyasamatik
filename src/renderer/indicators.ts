import type { HistoryPoint } from '../main/providers/types';

// Pure technical-indicator math over an already-fetched price history. Kept
// free of DOM access (unlike chart.ts, which reads document.* at module load)
// so it can be unit-tested directly under Node.

export function computeSMA(points: HistoryPoint[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(points.length).fill(null);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].v;
    if (i >= period) sum -= points[i - period].v;
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

// Standard Wilder's-smoothing RSI.
export function computeRSI(points: HistoryPoint[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(points.length).fill(null);
  if (points.length < period + 1) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = points[i].v - points[i - 1].v;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < points.length; i++) {
    const diff = points[i].v - points[i - 1].v;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
