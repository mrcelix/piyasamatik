import { formatPrice, formatChange, changeClass, CHART_ICON, getAssetIconHtml, getDirectionIndicator } from './format';
import type { AccentTheme } from '../main/store';

const itemId = new URLSearchParams(window.location.search).get('itemId') ?? '';
let autofitEnabled = true;
let lastPrice: number | undefined;

// A fixed, uniform size for every mini window regardless of item data (label
// length, price magnitude, ...) — comfortably fits the widest realistic
// content without making short items look tiny or letting long ones vary.
const MINI_IDEAL_WIDTH = 220;
const MINI_IDEAL_HEIGHT = 90;

const iconEl = document.getElementById('mini-icon') as HTMLSpanElement;
const labelEl = document.getElementById('mini-label') as HTMLSpanElement;
const actionsEl = document.getElementById('mini-titlebar-actions') as HTMLDivElement;
const priceEl = document.getElementById('mini-price') as HTMLDivElement;
const changeEl = document.getElementById('mini-change') as HTMLDivElement;
const dirArrowEl = document.getElementById('mini-dir-arrow') as HTMLSpanElement;
const chartBtn = document.getElementById('btn-mini-chart') as HTMLButtonElement;
chartBtn.innerHTML = CHART_ICON;

function applyTheme(themeMode: 'dark' | 'light') {
  document.body.classList.toggle('theme-light', themeMode === 'light');
}

function applyAccentTheme(theme: AccentTheme) {
  document.body.classList.remove('accent-gold', 'accent-green', 'accent-red', 'accent-purple');
  if (theme !== 'blue') document.body.classList.add(`accent-${theme}`);
}

function applyAccent(color: string | undefined) {
  document.body.classList.toggle('has-accent', !!color);
  if (color) document.documentElement.style.setProperty('--widget-accent', color);
}

function requestAutofit() {
  if (!autofitEnabled) return;
  window.miniTakip.requestAutofit(MINI_IDEAL_WIDTH, MINI_IDEAL_HEIGHT);
}

async function init() {
  const [watchlist, settings] = await Promise.all([window.miniTakip.getWatchlist(), window.miniTakip.getSettings()]);
  const item = watchlist.find((i) => i.id === itemId);
  labelEl.textContent = item?.label ?? '???';
  labelEl.title = item?.label ?? '';
  if (item) iconEl.innerHTML = getAssetIconHtml(item.category, item.symbol);
  applyTheme(settings.themeMode);
  applyAccentTheme(settings.accentTheme);
  applyAccent(item?.color);
  autofitEnabled = settings.autofitEnabled;
  requestAutofit();
}

window.miniTakip.onSettingsChanged((settings) => {
  applyTheme(settings.themeMode);
  applyAccentTheme(settings.accentTheme);
  autofitEnabled = settings.autofitEnabled;
  if (autofitEnabled) requestAutofit();
});

window.miniTakip.onQuotesUpdated((quotes) => {
  const q = quotes[itemId];
  if (!q || q.error) {
    priceEl.textContent = '--';
    changeEl.textContent = '';
    changeEl.className = 'change-flat';
    dirArrowEl.textContent = '';
    return;
  }
  const dir = getDirectionIndicator(q.price, lastPrice);
  lastPrice = q.price;
  dirArrowEl.innerHTML = dir.html;
  dirArrowEl.className = `dir-arrow ${dir.cls}`;
  priceEl.textContent = formatPrice(q.price, q.currency);
  changeEl.textContent = formatChange(q.changePercent);
  changeEl.className = changeClass(q.changePercent);
});

window.miniTakip.onWatchlistChanged((watchlist) => {
  const item = watchlist.find((i) => i.id === itemId);
  if (item) {
    labelEl.textContent = item.label;
    labelEl.title = item.label;
    iconEl.innerHTML = getAssetIconHtml(item.category, item.symbol);
    applyAccent(item.color);
    requestAutofit();
  }
});

document.getElementById('btn-attach')!.addEventListener('click', () => {
  window.miniTakip.attachItem(itemId);
});

chartBtn.addEventListener('click', () => {
  window.miniTakip.openChart(itemId);
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.miniTakip.showContextMenu();
});

init();
