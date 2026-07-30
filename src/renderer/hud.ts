import type { WatchlistItem, Quote } from '../main/providers/types';
import { formatPrice, formatChange, changeClass } from './format';

let watchlist: WatchlistItem[] = [];
let quotes: Record<string, Quote> = {};

const listEl = document.getElementById('hud-list') as HTMLDivElement;

function render() {
  listEl.innerHTML = '';
  const favorites = watchlist.filter((i) => i.favorite);

  if (favorites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hud-empty';
    empty.textContent = 'Favori oge eklenmedi.';
    listEl.appendChild(empty);
    return;
  }

  for (const item of favorites) {
    const quote = quotes[item.id];
    const row = document.createElement('div');
    row.className = 'hud-row';

    const label = document.createElement('span');
    label.className = 'hud-label';
    label.textContent = item.label;
    row.appendChild(label);

    if (quote && !quote.error) {
      const price = document.createElement('span');
      price.className = 'hud-price';
      price.textContent = formatPrice(quote.price, quote.currency);
      row.appendChild(price);

      const change = document.createElement('span');
      change.className = `hud-change ${changeClass(quote.changePercent ?? null)}`;
      change.textContent = formatChange(quote.changePercent);
      row.appendChild(change);
    } else {
      const err = document.createElement('span');
      err.className = 'hud-price';
      err.textContent = '...';
      row.appendChild(err);
    }

    listEl.appendChild(row);
  }
}

window.miniTakip.onQuotesUpdated((updated) => {
  quotes = updated;
  render();
});

// Dismiss early on click anywhere; the main process also auto-closes this
// window after a few seconds regardless.
document.addEventListener('click', () => window.miniTakip.closeSelf());

async function init() {
  const [wl, settings] = await Promise.all([window.miniTakip.getWatchlist(), window.miniTakip.getSettings()]);
  watchlist = wl;
  document.body.classList.toggle('theme-light', settings.themeMode === 'light');
  if (settings.accentTheme !== 'blue') document.body.classList.add(`accent-${settings.accentTheme}`);
  render();
}

init();
