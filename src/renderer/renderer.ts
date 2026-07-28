import type { WatchlistItem, Quote, SearchResult, ItemCategory } from '../main/providers/types';
import type { ViewMode, ThemeMode } from '../main/store';
import type { ConvertCode } from '../main/providers/truncgil';
import type { NewsItem } from '../main/providers';
import { formatPrice, formatChange, changeClass, CHART_ICON, MAGNET_ICON, NEWS_ICON } from './format';

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  currency: 'Doviz',
  gold: 'Altin/Emtia',
  stock: 'Hisse',
  index: 'Endeks',
  crypto: 'Kripto',
};

const TABS: { key: ItemCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Tumu' },
  { key: 'currency', label: 'Doviz' },
  { key: 'gold', label: 'Altin' },
  { key: 'stock', label: 'Hisse' },
  { key: 'index', label: 'Endeks' },
  { key: 'crypto', label: 'Kripto' },
];

let watchlist: WatchlistItem[] = [];
let quotes: Record<string, Quote> = {};
let sparklines: Record<string, number[]> = {};
let detachedIds: string[] = [];
let activeFilter: ItemCategory | 'all' = 'all';
let draggedId: string | null = null;
let convertCodesLoaded = false;
let magnetEnabled = true;
let newsLoaded = false;

const btnMagnet = document.getElementById('btn-magnet') as HTMLButtonElement;
btnMagnet.innerHTML = MAGNET_ICON;
const btnNews = document.getElementById('btn-news') as HTMLButtonElement;
btnNews.innerHTML = NEWS_ICON;

const listEl = document.getElementById('list') as HTMLDivElement;
const tabsEl = document.getElementById('category-tabs') as HTMLDivElement;
const addPanel = document.getElementById('add-panel') as HTMLDivElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchResultsEl = document.getElementById('search-results') as HTMLDivElement;

const convertPanel = document.getElementById('convert-panel') as HTMLDivElement;
const convertAmountInput = document.getElementById('convert-amount') as HTMLInputElement;
const convertFromSelect = document.getElementById('convert-from') as HTMLSelectElement;
const convertToSelect = document.getElementById('convert-to') as HTMLSelectElement;
const convertResultEl = document.getElementById('convert-result') as HTMLDivElement;

const newsPanel = document.getElementById('news-panel') as HTMLDivElement;
const newsListEl = document.getElementById('news-list') as HTMLDivElement;

function applyViewMode(viewMode: ViewMode) {
  document.body.classList.remove('view-list', 'view-compact', 'view-grid');
  document.body.classList.add(`view-${viewMode}`);
}

function applyTheme(themeMode: ThemeMode) {
  document.body.classList.toggle('theme-light', themeMode === 'light');
}

function applyMagnetButton() {
  btnMagnet.classList.toggle('active', magnetEnabled);
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.className = tab.key === activeFilter ? 'tab active' : 'tab';
    btn.addEventListener('click', () => {
      activeFilter = tab.key;
      renderTabs();
      render();
    });
    tabsEl.appendChild(btn);
  }
}

function buildSparklineSvg(values: number[]): string {
  if (values.length < 2) return '';
  const w = 56;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  const color = up ? 'var(--up)' : 'var(--down)';
  return `<svg viewBox="0 0 ${w} ${h}" class="sparkline"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" /></svg>`;
}

function attachDragHandlers(row: HTMLDivElement, item: WatchlistItem) {
  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    draggedId = item.id;
    e.dataTransfer?.setData('text/plain', item.id);
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    draggedId = null;
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over');
  });
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    row.classList.remove('drag-over');
    const sourceId = draggedId ?? e.dataTransfer?.getData('text/plain') ?? null;
    if (!sourceId || sourceId === item.id) return;
    const ids = watchlist.map((i) => i.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(item.id);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    watchlist = await window.miniTakip.reorder(ids);
    render();
  });
}

function buildRow(item: WatchlistItem): HTMLDivElement {
  const quote = quotes[item.id];
  const isDetached = detachedIds.includes(item.id);
  const row = document.createElement('div');
  row.className = 'row';
  if (item.color) row.style.borderLeft = `3px solid ${item.color}`;
  attachDragHandlers(row, item);

  const main = document.createElement('div');
  main.className = 'row-main';
  const labelRow = document.createElement('div');
  labelRow.className = 'row-label-line';

  const starBtn = document.createElement('button');
  starBtn.className = `star-btn${item.favorite ? ' active' : ''}`;
  starBtn.textContent = item.favorite ? '★' : '☆';
  starBtn.title = item.favorite ? 'Favorilerden cikar' : 'Favorilere ekle';
  starBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    watchlist = await window.miniTakip.updateItem(item.id, { favorite: !item.favorite });
    render();
  });
  labelRow.appendChild(starBtn);

  const label = document.createElement('span');
  label.className = 'row-label';
  label.textContent = item.label;
  label.title = item.label;
  labelRow.appendChild(label);
  if (item.alertAbove != null || item.alertBelow != null) {
    const dot = document.createElement('span');
    dot.className = 'alert-dot';
    const parts: string[] = [];
    if (item.alertAbove != null) parts.push(`ustu: ${item.alertAbove}`);
    if (item.alertBelow != null) parts.push(`alti: ${item.alertBelow}`);
    dot.title = `Alarm - ${parts.join(', ')}`;
    labelRow.appendChild(dot);
  }
  const category = document.createElement('div');
  category.className = 'row-category';
  category.textContent = CATEGORY_LABEL[item.category];
  main.appendChild(labelRow);
  main.appendChild(category);

  const sparkValues = sparklines[item.id];
  if (sparkValues && sparkValues.length > 1) {
    const sparkWrap = document.createElement('div');
    sparkWrap.className = 'row-sparkline';
    sparkWrap.innerHTML = buildSparklineSvg(sparkValues);
    main.appendChild(sparkWrap);
  }

  const right = document.createElement('div');
  right.className = 'row-right';

  if (quote?.error) {
    const err = document.createElement('div');
    err.className = 'error-text';
    err.textContent = 'veri alinamadi';
    right.appendChild(err);
  } else {
    const price = document.createElement('div');
    price.className = 'row-price';
    price.textContent = quote ? formatPrice(quote.price, quote.currency) : '...';

    const change = document.createElement('div');
    change.className = `row-change ${changeClass(quote?.changePercent ?? null)}`;
    change.textContent = quote ? formatChange(quote.changePercent) : '';

    right.appendChild(price);
    right.appendChild(change);

    if (quote && item.quantity && item.costBasis != null) {
      const currentValue = item.quantity * quote.price;
      const costValue = item.quantity * item.costBasis;
      const pl = currentValue - costValue;
      const plPct = costValue !== 0 ? (pl / costValue) * 100 : null;
      const plEl = document.createElement('div');
      plEl.className = `row-pl ${changeClass(pl === 0 ? 0 : pl)}`;
      const sign = pl > 0 ? '+' : '';
      const pctText = plPct !== null ? ` (${sign}${plPct.toFixed(2)}%)` : '';
      plEl.textContent = `K/Z: ${sign}${pl.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}${pctText}`;
      right.appendChild(plEl);
    }
  }

  const chartBtn = document.createElement('button');
  chartBtn.className = 'chart-btn';
  chartBtn.innerHTML = CHART_ICON;
  chartBtn.title = 'Gecmis grafik (1 yila kadar)';
  chartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.miniTakip.openChart(item.id);
  });

  const detachBtn = document.createElement('button');
  detachBtn.className = `detach-btn${isDetached ? ' active' : ''}`;
  detachBtn.textContent = '⧉';
  detachBtn.title = isDetached ? 'Ayri pencereyi kapat' : 'Ayri pencerede goster';
  detachBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isDetached) {
      await window.miniTakip.attachItem(item.id);
    } else {
      await window.miniTakip.detachItem(item.id);
    }
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.title = 'Kaldir';
  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    watchlist = await window.miniTakip.removeItem(item.id);
    render();
  });

  row.appendChild(main);
  row.appendChild(right);
  row.appendChild(chartBtn);
  row.appendChild(detachBtn);
  row.appendChild(removeBtn);
  return row;
}

function render() {
  listEl.innerHTML = '';
  const visible = activeFilter === 'all' ? watchlist : watchlist.filter((i) => i.category === activeFilter);

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = watchlist.length === 0 ? 'Izleme listeniz bos. Eklemek icin + butonuna basin.' : 'Bu kategoride oge yok.';
    listEl.appendChild(empty);
    return;
  }

  const favorites = visible.filter((i) => i.favorite);
  const rest = visible.filter((i) => !i.favorite);

  if (favorites.length > 0) {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = '★ Favoriler';
    listEl.appendChild(header);
    for (const item of favorites) listEl.appendChild(buildRow(item));

    if (rest.length > 0) {
      const restHeader = document.createElement('div');
      restHeader.className = 'section-header';
      restHeader.textContent = 'Tumu';
      listEl.appendChild(restHeader);
    }
  }

  for (const item of rest) listEl.appendChild(buildRow(item));
}

window.miniTakip.onQuotesUpdated((updated) => {
  quotes = updated;
  render();
});

window.miniTakip.onSparklinesUpdated((updated) => {
  sparklines = updated;
  render();
});

window.miniTakip.onWatchlistChanged((updated) => {
  watchlist = updated;
  render();
});

window.miniTakip.onDetachedChanged((ids) => {
  detachedIds = ids;
  render();
});

window.miniTakip.onSettingsChanged((settings) => {
  applyViewMode(settings.viewMode);
  applyTheme(settings.themeMode);
  magnetEnabled = settings.magnetEnabled;
  applyMagnetButton();
});

document.getElementById('btn-refresh')!.addEventListener('click', () => {
  window.miniTakip.refreshNow();
});
document.getElementById('btn-settings')!.addEventListener('click', () => {
  window.miniTakip.openSettings();
});
btnMagnet.addEventListener('click', async () => {
  const updated = await window.miniTakip.setSettings({ magnetEnabled: !magnetEnabled });
  magnetEnabled = updated.magnetEnabled;
  applyMagnetButton();
});
document.getElementById('btn-minimize')!.addEventListener('click', () => {
  window.miniTakip.minimizeWindow();
});
document.getElementById('btn-hide')!.addEventListener('click', () => {
  window.miniTakip.hideWindow();
});
document.getElementById('btn-add')!.addEventListener('click', () => {
  addPanel.classList.remove('hidden');
  searchInput.value = '';
  searchResultsEl.innerHTML = '';
  searchInput.focus();
});
document.getElementById('btn-close-add')!.addEventListener('click', () => {
  addPanel.classList.add('hidden');
});

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
searchInput.addEventListener('input', () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  const query = searchInput.value;
  searchDebounce = setTimeout(async () => {
    if (query.trim().length === 0) {
      searchResultsEl.innerHTML = '';
      return;
    }
    const results = await window.miniTakip.search(query);
    renderSearchResults(results);
  }, 300);
});

function renderSearchResults(results: SearchResult[]) {
  searchResultsEl.innerHTML = '';
  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Sonuc bulunamadi.';
    searchResultsEl.appendChild(empty);
    return;
  }
  for (const res of results) {
    const row = document.createElement('div');
    row.className = 'result-row';

    const left = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'result-label';
    label.textContent = res.label;
    left.appendChild(label);
    if (res.sub) {
      const sub = document.createElement('div');
      sub.className = 'result-sub';
      sub.textContent = res.sub;
      left.appendChild(sub);
    }

    const badge = document.createElement('div');
    badge.className = 'result-badge';
    badge.textContent = CATEGORY_LABEL[res.category];

    row.appendChild(left);
    row.appendChild(badge);

    row.addEventListener('click', async () => {
      watchlist = await window.miniTakip.addItem({
        category: res.category,
        symbol: res.symbol,
        label: res.label,
        currency: res.currency,
      });
      render();
      addPanel.classList.add('hidden');
      window.miniTakip.refreshNow();
    });

    searchResultsEl.appendChild(row);
  }
}

// ---- Currency/gold converter ----

async function ensureConvertCodes() {
  if (convertCodesLoaded) return;
  const codes: ConvertCode[] = await window.miniTakip.getConvertibleCodes();
  for (const c of codes) {
    const optFrom = document.createElement('option');
    optFrom.value = c.code;
    optFrom.textContent = c.label;
    convertFromSelect.appendChild(optFrom);

    const optTo = document.createElement('option');
    optTo.value = c.code;
    optTo.textContent = c.label;
    convertToSelect.appendChild(optTo);
  }
  convertFromSelect.value = 'USD';
  convertToSelect.value = 'TRY';
  convertCodesLoaded = true;
}

async function recomputeConversion() {
  const amount = parseFloat(convertAmountInput.value);
  if (!Number.isFinite(amount)) {
    convertResultEl.textContent = '--';
    return;
  }
  try {
    const result = await window.miniTakip.convert(amount, convertFromSelect.value, convertToSelect.value);
    convertResultEl.textContent = result.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
  } catch {
    convertResultEl.textContent = 'Kur alinamadi';
  }
}

document.getElementById('btn-convert')!.addEventListener('click', async () => {
  await ensureConvertCodes();
  convertPanel.classList.remove('hidden');
  recomputeConversion();
});
document.getElementById('btn-close-convert')!.addEventListener('click', () => {
  convertPanel.classList.add('hidden');
});
for (const el of [convertAmountInput, convertFromSelect, convertToSelect]) {
  el.addEventListener('input', recomputeConversion);
  el.addEventListener('change', recomputeConversion);
}

// ---- Market news ----

function renderNews(items: NewsItem[]) {
  newsListEl.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Haber bulunamadi.';
    newsListEl.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'news-row';

    const title = document.createElement('div');
    title.className = 'news-title';
    title.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'news-meta';
    const date = item.pubDate ? new Date(item.pubDate) : null;
    const dateText = date && !Number.isNaN(date.getTime())
      ? date.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    meta.textContent = [item.source, dateText].filter(Boolean).join(' · ');

    row.appendChild(title);
    row.appendChild(meta);
    row.addEventListener('click', () => window.miniTakip.openExternal(item.link));
    newsListEl.appendChild(row);
  }
}

async function loadNews(force = false) {
  if (newsLoaded && !force) return;
  newsListEl.innerHTML = '<div class="empty-state">Yukleniyor...</div>';
  const items = await window.miniTakip.getNews(force);
  renderNews(items);
  newsLoaded = true;
}

btnNews.addEventListener('click', () => {
  newsPanel.classList.remove('hidden');
  loadNews();
});
document.getElementById('btn-close-news')!.addEventListener('click', () => {
  newsPanel.classList.add('hidden');
});
document.getElementById('btn-refresh-news')!.addEventListener('click', () => {
  loadNews(true);
});

async function init() {
  renderTabs();
  const [wl, ids, settings, sparks] = await Promise.all([
    window.miniTakip.getWatchlist(),
    window.miniTakip.getDetachedIds(),
    window.miniTakip.getSettings(),
    window.miniTakip.getSparklines(),
  ]);
  watchlist = wl;
  detachedIds = ids;
  sparklines = sparks;
  applyViewMode(settings.viewMode);
  applyTheme(settings.themeMode);
  magnetEnabled = settings.magnetEnabled;
  applyMagnetButton();
  render();
}

init();
