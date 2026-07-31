import type { WatchlistItem, Quote, SearchResult, ItemCategory } from '../main/providers/types';
import type { ViewMode, ThemeMode, AccentTheme, WatchlistList, Transaction } from '../main/store';
import { computePosition } from '../main/position';
import type { ConvertCode } from '../main/providers/truncgil';
import type { NewsItem } from '../main/providers';
import { formatPrice, formatChange, changeClass, CHART_ICON, MAGNET_ICON, NEWS_ICON, AUTOFIT_ICON, TRANSPARENT_ICON, getDirectionIndicator } from './format';

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  currency: 'Doviz',
  gold: 'Altin/Emtia',
  stock: 'Hisse',
  index: 'Endeks',
  crypto: 'Kripto',
};

const CATEGORY_OPTIONS: { key: ItemCategory; label: string }[] = [
  { key: 'currency', label: 'Doviz' },
  { key: 'gold', label: 'Altin' },
  { key: 'stock', label: 'Hisse' },
  { key: 'index', label: 'Endeks' },
  { key: 'crypto', label: 'Kripto' },
];

const VIEW_MODE_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'list', label: 'Liste' },
  { key: 'compact', label: 'Kompakt' },
  { key: 'grid', label: 'Izgara' },
  { key: 'table', label: 'Tablo' },
  { key: 'ticker', label: 'Kayan Serit' },
  { key: 'heatmap', label: 'Isi Haritasi' },
];

const DEFAULT_LIST_ID = 'default';

let watchlist: WatchlistItem[] = [];
let quotes: Record<string, Quote> = {};
let sparklines: Record<string, number[]> = {};
let detachedIds: string[] = [];
let lists: WatchlistList[] = [];
let activeListId: string = DEFAULT_LIST_ID;
let transactions: Transaction[] = [];
let activeFilter: ItemCategory | 'all' | 'favorites' = 'all';
let draggedId: string | null = null;
let convertCodesLoaded = false;
let magnetEnabled = true;
let autofitEnabled = true;
let transparentEnabled = false;
let gridShowCategory = false;
let newsLoaded = false;
const lastPrices: Record<string, number> = {};
let directions: Record<string, { html: string; cls: string }> = {};
let currentViewMode: ViewMode = 'list';

const btnMagnet = document.getElementById('btn-magnet') as HTMLButtonElement;
btnMagnet.innerHTML = MAGNET_ICON;
const btnAutofit = document.getElementById('btn-autofit') as HTMLButtonElement;
btnAutofit.innerHTML = AUTOFIT_ICON;
const btnTransparent = document.getElementById('btn-transparent') as HTMLButtonElement;
btnTransparent.innerHTML = TRANSPARENT_ICON;
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

const statusCountEl = document.getElementById('status-count') as HTMLSpanElement;
const statusUpdatedEl = document.getElementById('status-updated') as HTMLSpanElement;
const statusVersionEl = document.getElementById('status-version') as HTMLSpanElement;
let lastUpdateAt: number | null = null;

function formatRelativeSeconds(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}sn once`;
  const mins = Math.round(secs / 60);
  return `${mins}dk once`;
}

function renderStatusBar() {
  statusCountEl.textContent = `${watchlist.length} oge izleniyor`;
  statusUpdatedEl.textContent =
    lastUpdateAt != null
      ? `Son guncelleme: ${new Date(lastUpdateAt).toLocaleTimeString('tr-TR')} (${formatRelativeSeconds(lastUpdateAt)})`
      : 'Henuz guncellenmedi';
}

window.miniTakip.getAppVersion().then((version) => {
  statusVersionEl.textContent = `v${version}`;
});

setInterval(() => {
  if (lastUpdateAt != null) renderStatusBar();
}, 1000);

function applyViewMode(viewMode: ViewMode) {
  currentViewMode = viewMode;
  document.body.classList.remove('view-list', 'view-compact', 'view-grid', 'view-table', 'view-ticker', 'view-heatmap');
  document.body.classList.add(`view-${viewMode}`);
}

function applyTheme(themeMode: ThemeMode) {
  document.body.classList.toggle('theme-light', themeMode === 'light');
}

function applyMagnetButton() {
  btnMagnet.classList.toggle('active', magnetEnabled);
}

function applyAutofitButton() {
  btnAutofit.classList.toggle('active', autofitEnabled);
}

function applyTransparentButton() {
  btnTransparent.classList.toggle('active', transparentEnabled);
}

function applyGridShowCategory(value: boolean) {
  gridShowCategory = value;
  document.body.classList.toggle('grid-show-category', value);
}

function applyAccentTheme(theme: AccentTheme) {
  document.body.classList.remove('accent-gold', 'accent-green', 'accent-red', 'accent-purple');
  if (theme !== 'blue') document.body.classList.add(`accent-${theme}`);
}

function requestAutofit() {
  if (!autofitEnabled) return;
  // #list has an explicit height (calc() against the window size) so it can scroll;
  // that means scrollHeight normally just reflects the box's own (already-inflated)
  // height instead of the content's natural height, and the window could never
  // shrink back down. Clear the constraint just long enough to measure real content.
  const prevHeight = listEl.style.height;
  listEl.style.height = 'auto';
  const contentHeight = listEl.scrollHeight;
  listEl.style.height = prevHeight;

  const chromeHeight = declutterMode ? 0 : 34 + 30 + 20;
  const height = chromeHeight + contentHeight + 12;
  window.miniTakip.requestAutofit(document.body.clientWidth, height);
}

function renderTabs() {
  tabsEl.innerHTML = '';

  // Only shown once the user has actually created a second list, so a
  // single-list setup (the common case) doesn't get extra chrome.
  if (lists.length > 1) {
    const listSelect = document.createElement('select');
    listSelect.className = 'category-select';
    listSelect.title = 'Liste';
    for (const l of lists) {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      listSelect.appendChild(opt);
    }
    listSelect.value = activeListId;
    listSelect.addEventListener('change', () => {
      activeListId = listSelect.value;
      render();
    });
    tabsEl.appendChild(listSelect);
  }

  const favBtn = document.createElement('button');
  favBtn.textContent = '★ Favoriler';
  favBtn.className = activeFilter === 'favorites' ? 'tab active' : 'tab';
  favBtn.addEventListener('click', () => {
    activeFilter = 'favorites';
    renderTabs();
    render();
  });
  tabsEl.appendChild(favBtn);

  // Doubles as the old "Tumu" tab: picking any option here (including "Tumu")
  // switches away from the favorites-only filter too, so it's always enabled.
  const select = document.createElement('select');
  select.className = 'category-select';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Tumu';
  select.appendChild(allOption);
  for (const cat of CATEGORY_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = cat.key;
    opt.textContent = cat.label;
    select.appendChild(opt);
  }
  select.value = activeFilter === 'favorites' ? 'all' : activeFilter;
  select.addEventListener('change', () => {
    activeFilter = select.value === 'all' ? 'all' : (select.value as ItemCategory);
    renderTabs();
    render();
  });
  tabsEl.appendChild(select);

  const viewSelect = document.createElement('select');
  viewSelect.className = 'category-select';
  viewSelect.title = 'Gorunum';
  for (const mode of VIEW_MODE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = mode.key;
    opt.textContent = mode.label;
    viewSelect.appendChild(opt);
  }
  viewSelect.value = currentViewMode;
  viewSelect.addEventListener('change', async () => {
    const updated = await window.miniTakip.setSettings({ viewMode: viewSelect.value as ViewMode });
    applyViewMode(updated.viewMode);
    render();
  });
  tabsEl.appendChild(viewSelect);
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
  // HTML5 draggable="true" elements can swallow the right-click contextmenu event
  // on Windows/Chromium (right-click is ambiguous with the native drag gesture).
  // Momentarily drop draggable for the right button so the context menu fires,
  // then restore it so left-click drag-to-reorder keeps working.
  row.addEventListener('mousedown', (e) => {
    if (e.button === 2) row.draggable = false;
  });
  row.addEventListener('contextmenu', () => {
    row.draggable = true;
  });
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
  row.id = `row-${item.id}`;
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
    const priceRow = document.createElement('div');
    priceRow.className = 'row-price-line';

    const dir = directions[item.id];
    if (dir) {
      const dirEl = document.createElement('span');
      dirEl.className = `dir-arrow ${dir.cls}`;
      dirEl.innerHTML = dir.html;
      priceRow.appendChild(dirEl);
    }

    const price = document.createElement('div');
    price.className = 'row-price';
    price.textContent = quote ? formatPrice(quote.price, quote.currency) : '...';
    priceRow.appendChild(price);

    const change = document.createElement('div');
    change.className = `row-change ${changeClass(quote?.changePercent ?? null)}`;
    change.textContent = quote ? formatChange(quote.changePercent) : '';

    right.appendChild(priceRow);
    right.appendChild(change);

    // If transactions exist for this item, they're the source of truth for
    // quantity/cost basis (average-cost method); otherwise fall back to the
    // manually-typed fields, unchanged from before transactions existed.
    const itemTxs = transactions.filter((t) => t.itemId === item.id);
    const position = itemTxs.length > 0 ? computePosition(itemTxs) : null;
    const effectiveQty = position ? position.quantity : item.quantity;
    const effectiveCost = position ? position.avgCost : item.costBasis;

    if (quote && effectiveQty && effectiveCost != null) {
      const currentValue = effectiveQty * quote.price;
      const costValue = effectiveQty * effectiveCost;
      const unrealizedPL = currentValue - costValue;
      // Realized P/L (from past sells, average-cost method) only exists once
      // an item has an actual transaction ledger; manual qty/cost entries
      // have no sell history to realize anything from.
      const pl = unrealizedPL + (position?.realizedPL ?? 0);
      const plPct = costValue !== 0 ? (unrealizedPL / costValue) * 100 : null;
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

function buildHeatTile(item: WatchlistItem): HTMLDivElement {
  const quote = quotes[item.id];
  const tile = document.createElement('div');
  tile.className = 'heat-tile';

  const pct = quote && !quote.error ? (quote.changePercent ?? 0) : 0;
  const isUp = pct >= 0;
  const intensity = Math.min(Math.abs(pct) / 5, 1) * 0.75 + 0.15;
  tile.style.backgroundColor = isUp
    ? `rgba(38, 166, 91, ${intensity})`
    : `rgba(219, 68, 68, ${intensity})`;

  const label = document.createElement('div');
  label.className = 'heat-label';
  label.textContent = item.label;
  tile.appendChild(label);

  const price = document.createElement('div');
  price.className = 'heat-price';
  price.textContent = quote && !quote.error ? formatPrice(quote.price, quote.currency) : '...';
  tile.appendChild(price);

  const change = document.createElement('div');
  change.className = 'heat-change';
  change.textContent = quote && !quote.error ? formatChange(quote.changePercent) : '';
  tile.appendChild(change);

  tile.addEventListener('click', () => {
    if (windowsLocked) return;
    window.miniTakip.openChart(item.id);
  });
  return tile;
}

// Isi Haritasi orders tiles by daily change (highest first) so the biggest
// movers stay at a glance, but re-sorting on every quote tick would make
// tiles constantly jump around; instead the order is snapshotted and only
// recomputed every 5 minutes (see HEATMAP_RESORT_INTERVAL_MS below).
let heatmapSortedOrder: string[] | null = null;
const HEATMAP_RESORT_INTERVAL_MS = 5 * 60 * 1000;

function computeHeatmapOrder(): string[] {
  return [...watchlist]
    .filter((i) => quotes[i.id] && !quotes[i.id].error)
    .sort((a, b) => (quotes[b.id].changePercent ?? -Infinity) - (quotes[a.id].changePercent ?? -Infinity))
    .map((i) => i.id);
}

function refreshHeatmapOrder() {
  heatmapSortedOrder = computeHeatmapOrder();
  if (currentViewMode === 'heatmap') render();
}

setInterval(refreshHeatmapOrder, HEATMAP_RESORT_INTERVAL_MS);

function renderHeatmap(visible: WatchlistItem[]) {
  if (!heatmapSortedOrder) heatmapSortedOrder = computeHeatmapOrder();
  const orderIndex = new Map(heatmapSortedOrder.map((id, i) => [id, i]));
  const ordered = [...visible].sort(
    (a, b) => (orderIndex.get(a.id) ?? Infinity) - (orderIndex.get(b.id) ?? Infinity)
  );
  const grid = document.createElement('div');
  grid.className = 'heat-grid';
  for (const item of ordered) grid.appendChild(buildHeatTile(item));
  listEl.appendChild(grid);
}

function render() {
  listEl.innerHTML = '';

  if (currentViewMode === 'ticker') {
    // The ticker view runs in its own dedicated window (see ticker.ts), not
    // inline here, so the main window just points to it instead.
    const info = document.createElement('div');
    info.className = 'empty-state';
    info.textContent = 'Kayan Serit ayri bir pencerede acildi.';
    listEl.appendChild(info);
    requestAutofit();
    return;
  }

  const inActiveList = watchlist.filter((i) => (i.listId ?? DEFAULT_LIST_ID) === activeListId);
  let visible: WatchlistItem[];
  if (activeFilter === 'all') visible = inActiveList;
  else if (activeFilter === 'favorites') visible = inActiveList.filter((i) => i.favorite);
  else visible = inActiveList.filter((i) => i.category === activeFilter);

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      watchlist.length === 0
        ? 'Izleme listeniz bos. Eklemek icin + butonuna basin.'
        : inActiveList.length === 0
          ? 'Bu listede oge yok.'
          : activeFilter === 'favorites'
            ? 'Henuz favori eklemediniz.'
            : 'Bu kategoride oge yok.';
    listEl.appendChild(empty);
    return;
  }

  if (currentViewMode === 'heatmap') renderHeatmap(visible);
  else for (const item of visible) listEl.appendChild(buildRow(item));
  requestAutofit();
  drawCorrelationLines();
}

// Draws a subtle animated line between two Izgara tiles that have a ratio
// alarm configured between them, so the correlation is visible at a glance
// instead of only living in the alarm's settings.
function drawCorrelationLines() {
  const existing = document.getElementById('correlation-overlay');
  existing?.remove();
  if (currentViewMode !== 'grid') return;

  const pairs: { from: HTMLElement; to: HTMLElement }[] = [];
  for (const item of watchlist) {
    if (!item.alertRatioTargetId) continue;
    const from = document.getElementById(`row-${item.id}`);
    const to = document.getElementById(`row-${item.alertRatioTargetId}`);
    if (from && to) pairs.push({ from, to });
  }
  if (pairs.length === 0) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'correlation-overlay';
  svg.setAttribute('width', String(listEl.scrollWidth));
  svg.setAttribute('height', String(listEl.scrollHeight));

  for (const { from, to } of pairs) {
    const x1 = from.offsetLeft + from.offsetWidth / 2;
    const y1 = from.offsetTop + from.offsetHeight / 2;
    const x2 = to.offsetLeft + to.offsetWidth / 2;
    const y2 = to.offsetTop + to.offsetHeight / 2;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'correlation-line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    svg.appendChild(line);

    for (const [cx, cy] of [
      [x1, y1],
      [x2, y2],
    ]) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'correlation-dot');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '3');
      svg.appendChild(dot);
    }
  }
  listEl.appendChild(svg);
}

window.addEventListener('resize', () => {
  if (currentViewMode === 'grid') drawCorrelationLines();
});

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
  lastUpdateAt = Date.now();
  renderStatusBar();
  render();
});

window.miniTakip.onSparklinesUpdated((updated) => {
  sparklines = updated;
  render();
});

window.miniTakip.onWatchlistChanged((updated) => {
  watchlist = updated;
  renderStatusBar();
  render();
});

window.miniTakip.onDetachedChanged((ids) => {
  detachedIds = ids;
  render();
});

window.miniTakip.onListsChanged((updated) => {
  lists = updated;
  if (!lists.some((l) => l.id === activeListId)) activeListId = lists[0]?.id ?? DEFAULT_LIST_ID;
  renderTabs();
  render();
});

window.miniTakip.onTransactionsChanged((updated) => {
  transactions = updated;
  render();
});

window.miniTakip.onSettingsChanged((settings) => {
  const viewModeChanged = settings.viewMode !== currentViewMode;
  applyViewMode(settings.viewMode);
  applyTheme(settings.themeMode);
  applyAccentTheme(settings.accentTheme);
  magnetEnabled = settings.magnetEnabled;
  applyMagnetButton();
  autofitEnabled = settings.autofitEnabled;
  applyAutofitButton();
  transparentEnabled = settings.transparentEnabled;
  applyTransparentButton();
  applyGridShowCategory(settings.gridShowCategory);
  if (viewModeChanged) {
    renderTabs();
    render();
  } else if (autofitEnabled) requestAutofit();
});

window.miniTakip.onMenuAction((action) => {
  if (action === 'open-add') document.getElementById('btn-add')!.click();
  else if (action === 'open-convert') document.getElementById('btn-convert')!.click();
  else if (action === 'open-news') btnNews.click();
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.miniTakip.showContextMenu();
});

// Double-clicking empty space (not a row/tile) toggles a decluttered "widget
// mode": the titlebar, tabs and status bar hide and the window background
// becomes transparent, leaving only the item rows/tiles themselves visible
// (they keep their own opaque background). Double-click empty space again,
// or press Escape, to return to the normal view.
let declutterMode = false;
// Toggled from the "Pencereleri Kilitle" item in the widget-mode context menu;
// while locked, left-clicking a tile does not open its chart ("fiyat ekrani").
let windowsLocked = false;

function applyDeclutterMode() {
  document.body.classList.toggle('declutter-mode', declutterMode);
  window.miniTakip.setDeclutterMode(declutterMode);
  if (!declutterMode && windowsLocked) {
    windowsLocked = false;
    window.miniTakip.setWindowsLocked(false);
  }
  requestAutofit();
}

listEl.addEventListener('dblclick', (e) => {
  // Rows are direct children of #list in every view mode except heatmap,
  // where tiles sit inside a .heat-grid wrapper; check for an actual item
  // ancestor instead of exact target equality so gaps count as empty space
  // in every mode, not just the ones where #list itself is the direct parent.
  if ((e.target as HTMLElement).closest('.row, .heat-tile')) return;
  declutterMode = !declutterMode;
  applyDeclutterMode();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && declutterMode) {
    declutterMode = false;
    applyDeclutterMode();
  }
});

window.miniTakip.onExitDeclutterMode(() => {
  declutterMode = false;
  applyDeclutterMode();
});

window.miniTakip.onWindowsLockChanged((locked) => {
  windowsLocked = locked;
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
btnAutofit.addEventListener('click', async () => {
  const updated = await window.miniTakip.setSettings({ autofitEnabled: !autofitEnabled });
  autofitEnabled = updated.autofitEnabled;
  applyAutofitButton();
  if (autofitEnabled) requestAutofit();
});
btnTransparent.addEventListener('click', async () => {
  const updated = await window.miniTakip.setSettings({ transparentEnabled: !transparentEnabled });
  transparentEnabled = updated.transparentEnabled;
  applyTransparentButton();
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
        listId: activeListId,
      });
      const newItem = watchlist[watchlist.length - 1];
      render();
      addPanel.classList.add('hidden');
      window.miniTakip.refreshNow();
      // Open Settings straight to this item's alarm/portfolio form, since the
      // user just added it and alarms are most naturally set up right away.
      window.miniTakip.openSettings(newItem.id);
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
  const [wl, ids, settings, sparks, ls, txs] = await Promise.all([
    window.miniTakip.getWatchlist(),
    window.miniTakip.getDetachedIds(),
    window.miniTakip.getSettings(),
    window.miniTakip.getSparklines(),
    window.miniTakip.getLists(),
    window.miniTakip.getTransactions(),
  ]);
  watchlist = wl;
  detachedIds = ids;
  sparklines = sparks;
  lists = ls;
  transactions = txs;
  if (!lists.some((l) => l.id === activeListId)) activeListId = lists[0]?.id ?? DEFAULT_LIST_ID;
  applyViewMode(settings.viewMode);
  applyTheme(settings.themeMode);
  applyAccentTheme(settings.accentTheme);
  magnetEnabled = settings.magnetEnabled;
  applyMagnetButton();
  autofitEnabled = settings.autofitEnabled;
  applyAutofitButton();
  transparentEnabled = settings.transparentEnabled;
  applyTransparentButton();
  applyGridShowCategory(settings.gridShowCategory);
  renderTabs();
  renderStatusBar();
  render();
}

init();
