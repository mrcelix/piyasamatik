import type { Quote, WatchlistItem } from './providers/types';

// Pure alert-threshold evaluation, split out of main.ts's checkAlerts() so the
// "did we cross the threshold since last time" logic can be unit-tested
// without an Electron runtime, notifications, or the live watchlist/quote state.
// Side effects (firing an OS notification) stay in main.ts; this module only
// decides *whether* an event should fire and returns the next debounce state.

export interface AlertState {
  aboveFired: boolean;
  belowFired: boolean;
  upPctFired: boolean;
  downPctFired: boolean;
  ratioAboveFired: boolean;
  ratioBelowFired: boolean;
}

export function defaultAlertState(): AlertState {
  return {
    aboveFired: false,
    belowFired: false,
    upPctFired: false,
    downPctFired: false,
    ratioAboveFired: false,
    ratioBelowFired: false,
  };
}

export interface AlertEvent {
  kind: 'above' | 'below' | 'upPct' | 'downPct' | 'ratioAbove' | 'ratioBelow';
  message: string;
}

export function formatAlertPct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function evaluateItemAlerts(
  item: Pick<WatchlistItem, 'label' | 'alertAbove' | 'alertBelow' | 'alertUpPercent' | 'alertDownPercent' | 'alertRatioTargetId' | 'alertRatioAbove' | 'alertRatioBelow'>,
  quote: Quote,
  prevState: AlertState,
  target?: { item: Pick<WatchlistItem, 'label'>; quote: Quote }
): { state: AlertState; events: AlertEvent[] } {
  const state: AlertState = { ...prevState };
  const events: AlertEvent[] = [];

  if (item.alertAbove != null) {
    if (quote.price >= item.alertAbove && !state.aboveFired) {
      state.aboveFired = true;
      events.push({ kind: 'above', message: `${quote.price} ${quote.currency} (hedef: ${item.alertAbove} uzeri)` });
    } else if (quote.price < item.alertAbove) {
      state.aboveFired = false;
    }
  }

  if (item.alertBelow != null) {
    if (quote.price <= item.alertBelow && !state.belowFired) {
      state.belowFired = true;
      events.push({ kind: 'below', message: `${quote.price} ${quote.currency} (hedef: ${item.alertBelow} alti)` });
    } else if (quote.price > item.alertBelow) {
      state.belowFired = false;
    }
  }

  if (item.alertUpPercent != null && quote.changePercent != null) {
    if (quote.changePercent >= item.alertUpPercent && !state.upPctFired) {
      state.upPctFired = true;
      events.push({
        kind: 'upPct',
        message: `${formatAlertPct(quote.changePercent)} degisim (hedef: +%${item.alertUpPercent} artis)`,
      });
    } else if (quote.changePercent < item.alertUpPercent) {
      state.upPctFired = false;
    }
  }

  if (item.alertDownPercent != null && quote.changePercent != null) {
    if (quote.changePercent <= -item.alertDownPercent && !state.downPctFired) {
      state.downPctFired = true;
      events.push({
        kind: 'downPct',
        message: `${formatAlertPct(quote.changePercent)} degisim (hedef: -%${item.alertDownPercent} azalis)`,
      });
    } else if (quote.changePercent > -item.alertDownPercent) {
      state.downPctFired = false;
    }
  }

  if (item.alertRatioTargetId != null && target && !target.quote.error && target.quote.price !== 0) {
    const ratio = quote.price / target.quote.price;
    if (item.alertRatioAbove != null) {
      if (ratio >= item.alertRatioAbove && !state.ratioAboveFired) {
        state.ratioAboveFired = true;
        events.push({
          kind: 'ratioAbove',
          message: `Oran ${ratio.toFixed(4)} (hedef: ${item.label}/${target.item.label} orani ${item.alertRatioAbove} uzeri)`,
        });
      } else if (ratio < item.alertRatioAbove) {
        state.ratioAboveFired = false;
      }
    }
    if (item.alertRatioBelow != null) {
      if (ratio <= item.alertRatioBelow && !state.ratioBelowFired) {
        state.ratioBelowFired = true;
        events.push({
          kind: 'ratioBelow',
          message: `Oran ${ratio.toFixed(4)} (hedef: ${item.label}/${target.item.label} orani ${item.alertRatioBelow} alti)`,
        });
      } else if (ratio > item.alertRatioBelow) {
        state.ratioBelowFired = false;
      }
    }
  }

  return { state, events };
}

export interface GlobalAlertState {
  upFired: boolean;
  downFired: boolean;
}

export function evaluateGlobalAlert(
  changePercent: number | null,
  prevState: GlobalAlertState,
  upPercent: number | null | undefined,
  downPercent: number | null | undefined
): { state: GlobalAlertState; events: AlertEvent[] } {
  const state: GlobalAlertState = { ...prevState };
  const events: AlertEvent[] = [];
  if (changePercent == null) return { state, events };

  if (upPercent != null) {
    if (changePercent >= upPercent && !state.upFired) {
      state.upFired = true;
      events.push({ kind: 'upPct', message: `Genel alarm: ${formatAlertPct(changePercent)} (esik: +%${upPercent})` });
    } else if (changePercent < upPercent) {
      state.upFired = false;
    }
  }
  if (downPercent != null) {
    if (changePercent <= -downPercent && !state.downFired) {
      state.downFired = true;
      events.push({ kind: 'downPct', message: `Genel alarm: ${formatAlertPct(changePercent)} (esik: -%${downPercent})` });
    } else if (changePercent > -downPercent) {
      state.downFired = false;
    }
  }
  return { state, events };
}
