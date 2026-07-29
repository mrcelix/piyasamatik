import type { WatchlistItem, Quote } from '../main/providers/types';
import { formatPrice, formatChange, changeClass, getDirectionIndicator } from './format';

let watchlist: WatchlistItem[] = [];
let quotes: Record<string, Quote> = {};
const lastPrices: Record<string, number> = {};
let directions: Record<string, { html: string; cls: string }> = {};

const listEl = document.getElementById('ticker-list') as HTMLDivElement;

function buildTickerItem(item: WatchlistItem): HTMLDivElement {
  const quote = quotes[item.id];
  const el = document.createElement('div');
  el.className = 'ticker-item';

  const label = document.createElement('span');
  label.className = 'ticker-label';
  label.textContent = item.label;
  el.appendChild(label);

  if (quote && !quote.error) {
    const dir = directions[item.id];
    if (dir) {
      const dirEl = document.createElement('span');
      dirEl.className = `dir-arrow ${dir.cls}`;
      dirEl.innerHTML = dir.html;
      el.appendChild(dirEl);
    }
    const price = document.createElement('span');
    price.className = 'ticker-price';
    price.textContent = formatPrice(quote.price, quote.currency);
    el.appendChild(price);

    const change = document.createElement('span');
    change.className = `ticker-change ${changeClass(quote.changePercent ?? null)}`;
    change.textContent = formatChange(quote.changePercent);
    el.appendChild(change);
  } else {
    const err = document.createElement('span');
    err.className = 'ticker-price';
    err.textContent = '...';
    el.appendChild(err);
  }

  el.addEventListener('click', () => window.miniTakip.openChart(item.id));
  return el;
}

function render() {
  listEl.innerHTML = '';
  if (watchlist.length === 0) return;
  const track = document.createElement('div');
  track.className = 'ticker-track';
  // The item sequence is duplicated so the CSS animation can scroll from
  // translateX(0) to translateX(-50%) and loop seamlessly.
  for (const item of [...watchlist, ...watchlist]) track.appendChild(buildTickerItem(item));
  listEl.appendChild(track);
}

window.miniTakip.onQuotesUpdated((updated) => {
  const newDirections: Record<string, { html: string; cls: string }> = {};
  for (const id of Object.keys(updated)) {
    const q = updated[id];
    if (!q.error) {
      newDirections[id] = getDirectionIndicator(q.price, lastPrices[id]);
      lastPrices[id] = q.price;
    }
  }
  directions = newDirections;
  quotes = updated;
  render();
});

window.miniTakip.onWatchlistChanged((updated) => {
  watchlist = updated;
  render();
});

window.miniTakip.onSettingsChanged((settings) => {
  document.body.classList.toggle('theme-light', settings.themeMode === 'light');
  document.body.classList.remove('accent-gold', 'accent-green', 'accent-red', 'accent-purple');
  if (settings.accentTheme !== 'blue') document.body.classList.add(`accent-${settings.accentTheme}`);
});

document.getElementById('btn-ticker-close')!.addEventListener('click', () => {
  window.miniTakip.closeSelf();
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.miniTakip.showContextMenu();
});

async function init() {
  const [wl, settings] = await Promise.all([window.miniTakip.getWatchlist(), window.miniTakip.getSettings()]);
  watchlist = wl;
  document.body.classList.toggle('theme-light', settings.themeMode === 'light');
  if (settings.accentTheme !== 'blue') document.body.classList.add(`accent-${settings.accentTheme}`);
  render();
}

init();
