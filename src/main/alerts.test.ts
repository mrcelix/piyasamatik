import { describe, it, expect } from 'vitest';
import { evaluateItemAlerts, evaluateGlobalAlert, defaultAlertState } from './alerts';
import type { Quote } from './providers/types';

function quote(partial: Partial<Quote>): Quote {
  return { price: 0, changePercent: null, currency: 'TRY', updatedAt: 0, ...partial };
}

describe('evaluateItemAlerts', () => {
  it('fires an "above" event once price crosses the threshold', () => {
    const item = { label: 'USD', alertAbove: 40 } as any;
    const { state, events } = evaluateItemAlerts(item, quote({ price: 41 }), defaultAlertState());
    expect(state.aboveFired).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('above');
  });

  it('does not re-fire "above" while already fired and still above threshold', () => {
    const item = { label: 'USD', alertAbove: 40 } as any;
    const already = { ...defaultAlertState(), aboveFired: true };
    const { events } = evaluateItemAlerts(item, quote({ price: 42 }), already);
    expect(events).toHaveLength(0);
  });

  it('resets the fired flag once price drops back below the threshold', () => {
    const item = { label: 'USD', alertAbove: 40 } as any;
    const already = { ...defaultAlertState(), aboveFired: true };
    const { state } = evaluateItemAlerts(item, quote({ price: 39 }), already);
    expect(state.aboveFired).toBe(false);
  });

  it('fires a "below" event once price crosses under the threshold', () => {
    const item = { label: 'USD', alertBelow: 30 } as any;
    const { state, events } = evaluateItemAlerts(item, quote({ price: 29 }), defaultAlertState());
    expect(state.belowFired).toBe(true);
    expect(events[0].kind).toBe('below');
  });

  it('fires percent-change alerts independently of price alerts', () => {
    const item = { label: 'USD', alertUpPercent: 5 } as any;
    const { events } = evaluateItemAlerts(item, quote({ price: 1, changePercent: 6 }), defaultAlertState());
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('upPct');
  });

  it('ignores percent-change alerts when the quote has no changePercent', () => {
    const item = { label: 'USD', alertUpPercent: 5 } as any;
    const { events } = evaluateItemAlerts(item, quote({ price: 1, changePercent: null }), defaultAlertState());
    expect(events).toHaveLength(0);
  });

  it('evaluates a ratio alert against the target quote', () => {
    const item = { label: 'A', alertRatioTargetId: 'b', alertRatioAbove: 2 } as any;
    const target = { item: { label: 'B' }, quote: quote({ price: 10 }) };
    const { events } = evaluateItemAlerts(item, quote({ price: 25 }), defaultAlertState(), target);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('ratioAbove');
  });

  it('skips the ratio alert if the target quote errored', () => {
    const item = { label: 'A', alertRatioTargetId: 'b', alertRatioAbove: 2 } as any;
    const target = { item: { label: 'B' }, quote: quote({ price: 10, error: 'fail' }) };
    const { events } = evaluateItemAlerts(item, quote({ price: 25 }), defaultAlertState(), target);
    expect(events).toHaveLength(0);
  });
});

describe('evaluateGlobalAlert', () => {
  it('fires once changePercent crosses the up threshold', () => {
    const { state, events } = evaluateGlobalAlert(6, { upFired: false, downFired: false }, 5, null);
    expect(state.upFired).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('fires once changePercent crosses the down threshold', () => {
    const { state, events } = evaluateGlobalAlert(-6, { upFired: false, downFired: false }, null, 5);
    expect(state.downFired).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('is a no-op when changePercent is null', () => {
    const { state, events } = evaluateGlobalAlert(null, { upFired: false, downFired: false }, 5, 5);
    expect(events).toHaveLength(0);
    expect(state).toEqual({ upFired: false, downFired: false });
  });
});
