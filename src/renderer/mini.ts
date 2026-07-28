import { formatPrice, formatChange, changeClass, CHART_ICON } from './format';

const itemId = new URLSearchParams(window.location.search).get('itemId') ?? '';

const labelEl = document.getElementById('mini-label') as HTMLSpanElement;
const priceEl = document.getElementById('mini-price') as HTMLDivElement;
const changeEl = document.getElementById('mini-change') as HTMLDivElement;
const chartBtn = document.getElementById('btn-mini-chart') as HTMLButtonElement;
chartBtn.innerHTML = CHART_ICON;

function applyTheme(themeMode: 'dark' | 'light') {
  document.body.classList.toggle('theme-light', themeMode === 'light');
}

function applyAccent(color: string | undefined) {
  document.body.classList.toggle('has-accent', !!color);
  if (color) document.documentElement.style.setProperty('--widget-accent', color);
}

async function init() {
  const [watchlist, settings] = await Promise.all([window.miniTakip.getWatchlist(), window.miniTakip.getSettings()]);
  const item = watchlist.find((i) => i.id === itemId);
  labelEl.textContent = item?.label ?? '???';
  labelEl.title = item?.label ?? '';
  applyTheme(settings.themeMode);
  applyAccent(item?.color);
}

window.miniTakip.onSettingsChanged((settings) => {
  applyTheme(settings.themeMode);
});

window.miniTakip.onQuotesUpdated((quotes) => {
  const q = quotes[itemId];
  if (!q || q.error) {
    priceEl.textContent = '--';
    changeEl.textContent = '';
    changeEl.className = 'change-flat';
    return;
  }
  priceEl.textContent = formatPrice(q.price, q.currency);
  changeEl.textContent = formatChange(q.changePercent);
  changeEl.className = changeClass(q.changePercent);
});

window.miniTakip.onWatchlistChanged((watchlist) => {
  const item = watchlist.find((i) => i.id === itemId);
  if (item) {
    labelEl.textContent = item.label;
    labelEl.title = item.label;
    applyAccent(item.color);
  }
});

document.getElementById('btn-attach')!.addEventListener('click', () => {
  window.miniTakip.attachItem(itemId);
});

chartBtn.addEventListener('click', () => {
  window.miniTakip.openChart(itemId);
});

init();
