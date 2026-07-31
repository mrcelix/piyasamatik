import type { HistoryPoint } from '../main/providers/types';
import type { AccentTheme } from '../main/store';
import { formatPrice, getDirectionIndicator } from './format';

const itemId = new URLSearchParams(window.location.search).get('itemId') ?? '';
let currentRange = '1a';
let currentCurrency = '';
let currentPoints: HistoryPoint[] = [];
let layout: Layout | null = null;
let showSma = false;
let showRsi = false;

const SMA_PERIOD = 20;
const RSI_PERIOD = 14;

const titleEl = document.getElementById('chart-title') as HTMLSpanElement;
const summaryEl = document.getElementById('chart-summary') as HTMLDivElement;
const rangeBarEl = document.getElementById('range-bar') as HTMLDivElement;
const indicatorBarEl = document.getElementById('indicator-bar') as HTMLDivElement;
const chartAreaEl = document.getElementById('chart-area') as HTMLDivElement;

// ---- Technical indicators (pure math over the already-fetched history) ----

function computeSMA(points: HistoryPoint[], period: number): (number | null)[] {
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
function computeRSI(points: HistoryPoint[], period: number): (number | null)[] {
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

// Builds a polyline string from a sparse (nullable) series, breaking into
// separate segments wherever data is missing instead of bridging the gap.
function buildSegmentedPolylines(values: (number | null)[], toX: (i: number) => number, toY: (v: number) => number): string {
  const segments: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      continue;
    }
    current.push(`${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(' '));
  return segments.map((seg) => `<polyline points="${seg}" fill="none" />`).join('');
}

function applyTheme(themeMode: 'dark' | 'light') {
  document.body.classList.toggle('theme-light', themeMode === 'light');
}

function applyAccentTheme(theme: AccentTheme) {
  document.body.classList.remove('accent-gold', 'accent-green', 'accent-red', 'accent-purple');
  if (theme !== 'blue') document.body.classList.add(`accent-${theme}`);
}

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

function formatDateTime(t: number): string {
  return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// ---- Layout: shared coordinate math between drawing and pointer interaction ----

interface Layout {
  w: number;
  h: number;
  padX: number;
  padY: number;
  min: number;
  max: number;
  range: number;
  stepX: number;
  toX: (i: number) => number;
  toY: (v: number) => number;
}

function computeLayout(points: HistoryPoint[]): Layout {
  const w = 400;
  const h = 200;
  const padX = 4;
  const padY = 10;
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const toX = (i: number) => padX + i * stepX;
  const toY = (v: number) => h - padY - ((v - min) / range) * (h - padY * 2);
  return { w, h, padX, padY, min, max, range, stepX, toX, toY };
}

function buildChartSvg(points: HistoryPoint[], l: Layout, smaValues: (number | null)[] | null): string {
  const up = points[points.length - 1].v >= points[0].v;
  const color = up ? 'var(--up)' : 'var(--down)';
  const linePoints = points.map((p, i) => `${l.toX(i).toFixed(1)},${l.toY(p.v).toFixed(1)}`).join(' ');
  const areaPoints = `${l.toX(0).toFixed(1)},${l.h} ${linePoints} ${l.toX(points.length - 1).toFixed(1)},${l.h}`;
  const lastX = l.toX(points.length - 1);
  const lastY = l.toY(points[points.length - 1].v);
  const midY = l.toY(l.min + l.range / 2);
  const smaSvg = smaValues
    ? buildSegmentedPolylines(smaValues, l.toX, l.toY).replace(/<polyline /g, '<polyline class="sma-line" ')
    : '';

  return `
    <line class="grid-line" x1="${l.padX}" y1="${l.toY(l.max).toFixed(1)}" x2="${l.w - l.padX}" y2="${l.toY(l.max).toFixed(1)}" />
    <line class="grid-line" x1="${l.padX}" y1="${midY.toFixed(1)}" x2="${l.w - l.padX}" y2="${midY.toFixed(1)}" />
    <line class="grid-line" x1="${l.padX}" y1="${l.toY(l.min).toFixed(1)}" x2="${l.w - l.padX}" y2="${l.toY(l.min).toFixed(1)}" />
    <polygon points="${areaPoints}" fill="${color}" opacity="0.14" />
    <polyline points="${linePoints}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${smaSvg}
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4.5" fill="var(--bg-panel)" />
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${color}" />
    <rect class="measure-band hidden-overlay" id="measure-band" x="0" y="0" width="0" height="${l.h}" />
    <line class="measure-edge hidden-overlay" id="measure-edge-a" x1="0" y1="0" x2="0" y2="${l.h}" />
    <line class="measure-edge hidden-overlay" id="measure-edge-b" x1="0" y1="0" x2="0" y2="${l.h}" />
    <line class="crosshair-line hidden-overlay" id="crosshair-line" x1="0" y1="0" x2="0" y2="${l.h}" />
    <circle class="crosshair-dot hidden-overlay" id="crosshair-dot" r="3.5" fill="${color}" stroke="var(--bg-panel)" stroke-width="1.5" />
  `;
}

// RSI gets its own small panel with a fixed 0-100 scale (a different unit
// than price, so it can't share the main chart's y-axis).
function buildRsiSvg(rsiValues: (number | null)[], mainLayout: Layout, h: number): string {
  const padX = mainLayout.padX;
  const w = mainLayout.w;
  const toY = (v: number) => h - (v / 100) * h;
  const line = buildSegmentedPolylines(rsiValues, mainLayout.toX, toY).replace(/<polyline /g, '<polyline class="rsi-line" ');
  return `
    <line class="grid-line" x1="${padX}" y1="${toY(70).toFixed(1)}" x2="${w - padX}" y2="${toY(70).toFixed(1)}" />
    <line class="grid-line" x1="${padX}" y1="${toY(50).toFixed(1)}" x2="${w - padX}" y2="${toY(50).toFixed(1)}" />
    <line class="grid-line" x1="${padX}" y1="${toY(30).toFixed(1)}" x2="${w - padX}" y2="${toY(30).toFixed(1)}" />
    ${line}
  `;
}

function renderSummary(points: HistoryPoint[]) {
  const first = points[0].v;
  const last = points[points.length - 1].v;
  const pct = first !== 0 ? ((last - first) / first) * 100 : 0;
  const dir = getDirectionIndicator(last, first);
  summaryEl.innerHTML = `
    <span class="cs-price">${formatPrice(last, currentCurrency)}</span>
    <span class="cs-change ${dir.cls}">${dir.html}<span>${formatPct(pct)}</span></span>
    <span class="cs-range-label">${formatDate(points[0].t)} — ${formatDate(points[points.length - 1].t)}</span>
  `;
}

// ---- Pointer interaction: hover crosshair + drag-to-measure percentage tool ----

function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len - 1, i));
}

function indexFromClientX(wrap: HTMLDivElement, clientX: number, l: Layout, len: number): number {
  const rect = wrap.getBoundingClientRect();
  const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const x = frac * l.w;
  return clampIndex(Math.round((x - l.padX) / (l.stepX || 1)), len);
}

function showTooltip(wrap: HTMLDivElement, clientX: number, idx: number, l: Layout) {
  let tip = wrap.querySelector<HTMLDivElement>('.chart-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    wrap.appendChild(tip);
  }
  const p = currentPoints[idx];
  const first = currentPoints[0].v;
  const pct = first !== 0 ? ((p.v - first) / first) * 100 : 0;
  tip.innerHTML = `<span class="tt-price">${formatPrice(p.v, currentCurrency)}</span> · ${formatPct(pct)} baslangica gore<br>${formatDateTime(p.t)}`;

  const rect = wrap.getBoundingClientRect();
  const xFrac = l.toX(idx) / l.w;
  const left = xFrac > 0.6 ? undefined : xFrac * rect.width + 10;
  const right = xFrac > 0.6 ? (1 - xFrac) * rect.width + 10 : undefined;
  tip.style.left = left != null ? `${left}px` : 'auto';
  tip.style.right = right != null ? `${right}px` : 'auto';
}

function hideTooltip(wrap: HTMLDivElement) {
  wrap.querySelector('.chart-tooltip')?.remove();
}

function updateCrosshair(svg: SVGSVGElement, idx: number, l: Layout) {
  const x = l.toX(idx);
  const y = l.toY(currentPoints[idx].v);
  const line = svg.getElementById('crosshair-line') as unknown as SVGLineElement;
  const dot = svg.getElementById('crosshair-dot') as unknown as SVGCircleElement;
  line.setAttribute('x1', String(x));
  line.setAttribute('x2', String(x));
  line.classList.remove('hidden-overlay');
  dot.setAttribute('cx', String(x));
  dot.setAttribute('cy', String(y));
  dot.classList.remove('hidden-overlay');
}

function hideCrosshair(svg: SVGSVGElement) {
  svg.getElementById('crosshair-line').classList.add('hidden-overlay');
  svg.getElementById('crosshair-dot').classList.add('hidden-overlay');
}

function showMeasureBadge(wrap: HTMLDivElement, aIdx: number, bIdx: number, l: Layout) {
  let badge = wrap.querySelector<HTMLDivElement>('.chart-measure-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'chart-measure-badge';
    wrap.appendChild(badge);
  }
  const from = currentPoints[Math.min(aIdx, bIdx)];
  const to = currentPoints[Math.max(aIdx, bIdx)];
  const pct = from.v !== 0 ? ((to.v - from.v) / from.v) * 100 : 0;
  const diff = to.v - from.v;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  badge.innerHTML = `
    <div class="mb-pct ${cls}">${formatPct(pct)}</div>
    <div class="mb-sub">${diff >= 0 ? '+' : ''}${diff.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${currentCurrency}</div>
    <div class="mb-sub">${formatDate(from.t)} → ${formatDate(to.t)}</div>
  `;
  const rect = wrap.getBoundingClientRect();
  const midFrac = ((l.toX(aIdx) + l.toX(bIdx)) / 2) / l.w;
  const left = midFrac > 0.55 ? undefined : Math.max(4, midFrac * rect.width - 10);
  const right = midFrac > 0.55 ? Math.max(4, (1 - midFrac) * rect.width - 10) : undefined;
  badge.style.left = left != null ? `${left}px` : 'auto';
  badge.style.right = right != null ? `${right}px` : 'auto';
}

function hideMeasureBadge(wrap: HTMLDivElement) {
  wrap.querySelector('.chart-measure-badge')?.remove();
}

function updateMeasureBand(svg: SVGSVGElement, aIdx: number, bIdx: number, l: Layout) {
  const x1 = l.toX(Math.min(aIdx, bIdx));
  const x2 = l.toX(Math.max(aIdx, bIdx));
  const band = svg.getElementById('measure-band') as unknown as SVGRectElement;
  band.setAttribute('x', String(x1));
  band.setAttribute('width', String(Math.max(0, x2 - x1)));
  band.classList.remove('hidden-overlay');
  const edgeA = svg.getElementById('measure-edge-a') as unknown as SVGLineElement;
  const edgeB = svg.getElementById('measure-edge-b') as unknown as SVGLineElement;
  edgeA.setAttribute('x1', String(x1));
  edgeA.setAttribute('x2', String(x1));
  edgeA.classList.remove('hidden-overlay');
  edgeB.setAttribute('x1', String(x2));
  edgeB.setAttribute('x2', String(x2));
  edgeB.classList.remove('hidden-overlay');
}

function hideMeasureBand(svg: SVGSVGElement) {
  svg.getElementById('measure-band').classList.add('hidden-overlay');
  svg.getElementById('measure-edge-a').classList.add('hidden-overlay');
  svg.getElementById('measure-edge-b').classList.add('hidden-overlay');
}

function clearMeasurement(wrap: HTMLDivElement, svg: SVGSVGElement) {
  hideMeasureBand(svg);
  hideMeasureBadge(wrap);
}

function attachInteraction(wrap: HTMLDivElement, l: Layout) {
  const svg = wrap.querySelector('svg') as unknown as SVGSVGElement;
  let dragStartIdx: number | null = null;
  let didDrag = false;

  wrap.addEventListener('mousedown', (e) => {
    dragStartIdx = indexFromClientX(wrap, e.clientX, l, currentPoints.length);
    didDrag = false;
  });

  wrap.addEventListener('mousemove', (e) => {
    const idx = indexFromClientX(wrap, e.clientX, l, currentPoints.length);
    if (dragStartIdx != null && dragStartIdx !== idx) {
      didDrag = true;
      updateMeasureBand(svg, dragStartIdx, idx, l);
      showMeasureBadge(wrap, dragStartIdx, idx, l);
      hideTooltip(wrap);
      hideCrosshair(svg);
    } else if (dragStartIdx == null) {
      updateCrosshair(svg, idx, l);
      showTooltip(wrap, e.clientX, idx, l);
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragStartIdx != null && !didDrag) {
      // A plain click (no drag) clears any existing measurement.
      clearMeasurement(wrap, svg);
    }
    dragStartIdx = null;
    didDrag = false;
  });

  wrap.addEventListener('mouseleave', () => {
    hideCrosshair(svg);
    hideTooltip(wrap);
  });
}

function renderChartArea() {
  const points = currentPoints;
  const l = layout!;
  const smaValues = showSma ? computeSMA(points, SMA_PERIOD) : null;
  const rsiValues = showRsi ? computeRSI(points, RSI_PERIOD) : null;
  const hasRsiData = rsiValues != null && rsiValues.some((v) => v != null);

  const RSI_HEIGHT = 60;
  const rsiPanel =
    showRsi && hasRsiData
      ? `<div class="rsi-panel-wrap"><svg viewBox="0 0 ${l.w} ${RSI_HEIGHT}" class="chart-svg rsi-svg" preserveAspectRatio="none">${buildRsiSvg(rsiValues!, l, RSI_HEIGHT)}</svg></div>`
      : showRsi
        ? '<div class="rsi-panel-wrap chart-status rsi-insufficient">RSI icin yetersiz veri</div>'
        : '';

  chartAreaEl.innerHTML = `<div class="chart-svg-wrap"><svg viewBox="0 0 ${l.w} ${l.h}" class="chart-svg" preserveAspectRatio="none">${buildChartSvg(points, l, smaValues)}</svg></div>${rsiPanel}`;
  const wrap = chartAreaEl.querySelector('.chart-svg-wrap') as HTMLDivElement;
  attachInteraction(wrap, l);
}

async function loadHistory() {
  chartAreaEl.innerHTML = '<div class="chart-status">Yukleniyor...</div>';
  summaryEl.innerHTML = '';
  const points = await window.miniTakip.getHistory(itemId, currentRange);
  if (points.length < 2) {
    chartAreaEl.innerHTML = '<div class="chart-status">Bu oge icin gecmis veri bulunamiyor.</div>';
    return;
  }
  currentPoints = points;
  layout = computeLayout(points);
  renderSummary(points);
  renderChartArea();
}

function renderRangeButtons(ranges: { key: string; label: string }[]) {
  rangeBarEl.innerHTML = '';
  for (const r of ranges) {
    const btn = document.createElement('button');
    btn.textContent = r.label;
    btn.className = r.key === currentRange ? 'active' : '';
    btn.addEventListener('click', () => {
      currentRange = r.key;
      renderRangeButtons(ranges);
      loadHistory();
    });
    rangeBarEl.appendChild(btn);
  }
}

function renderIndicatorBar() {
  indicatorBarEl.innerHTML = '';

  const smaBtn = document.createElement('button');
  smaBtn.textContent = `SMA ${SMA_PERIOD}`;
  smaBtn.className = showSma ? 'active' : '';
  smaBtn.addEventListener('click', () => {
    showSma = !showSma;
    renderIndicatorBar();
    if (currentPoints.length > 1) renderChartArea();
  });
  indicatorBarEl.appendChild(smaBtn);

  const rsiBtn = document.createElement('button');
  rsiBtn.textContent = `RSI ${RSI_PERIOD}`;
  rsiBtn.className = showRsi ? 'active' : '';
  rsiBtn.addEventListener('click', () => {
    showRsi = !showRsi;
    renderIndicatorBar();
    if (currentPoints.length > 1) renderChartArea();
  });
  indicatorBarEl.appendChild(rsiBtn);
}

document.getElementById('btn-close-chart')!.addEventListener('click', () => {
  window.miniTakip.closeSelf();
});

window.miniTakip.onSettingsChanged((settings) => {
  applyTheme(settings.themeMode);
  applyAccentTheme(settings.accentTheme);
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.miniTakip.showContextMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const wrap = chartAreaEl.querySelector('.chart-svg-wrap') as HTMLDivElement | null;
    const svg = wrap?.querySelector('svg') as unknown as SVGSVGElement | null;
    if (wrap && svg) clearMeasurement(wrap, svg);
  }
});

async function init() {
  const [watchlist, settings, ranges] = await Promise.all([
    window.miniTakip.getWatchlist(),
    window.miniTakip.getSettings(),
    window.miniTakip.getChartRanges(),
  ]);
  applyTheme(settings.themeMode);
  applyAccentTheme(settings.accentTheme);
  const item = watchlist.find((i) => i.id === itemId);
  titleEl.textContent = item?.label ?? '???';
  currentCurrency = item?.currency ?? '';
  renderRangeButtons(ranges);
  renderIndicatorBar();
  await loadHistory();
}

init();
