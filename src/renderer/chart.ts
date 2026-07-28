import type { HistoryPoint } from '../main/providers/types';

const itemId = new URLSearchParams(window.location.search).get('itemId') ?? '';
let currentRange = '1a';

const titleEl = document.getElementById('chart-title') as HTMLSpanElement;
const rangeBarEl = document.getElementById('range-bar') as HTMLDivElement;
const chartAreaEl = document.getElementById('chart-area') as HTMLDivElement;

function applyTheme(themeMode: 'dark' | 'light') {
  document.body.classList.toggle('theme-light', themeMode === 'light');
}

function buildChartSvg(points: HistoryPoint[]): string {
  const w = 400;
  const h = 200;
  const padX = 4;
  const padY = 10;
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (points.length - 1);
  const linePoints = points
    .map((p, i) => `${(padX + i * stepX).toFixed(1)},${(h - padY - ((p.v - min) / range) * (h - padY * 2)).toFixed(1)}`)
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  const color = up ? 'var(--up)' : 'var(--down)';
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" preserveAspectRatio="none"><polyline points="${linePoints}" fill="none" stroke="${color}" stroke-width="2" /></svg>`;
}

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

async function loadHistory() {
  chartAreaEl.innerHTML = '<div class="chart-status">Yukleniyor...</div>';
  const points = await window.miniTakip.getHistory(itemId, currentRange);
  if (points.length < 2) {
    chartAreaEl.innerHTML = '<div class="chart-status">Bu oge icin gecmis veri bulunamiyor.</div>';
    return;
  }
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  chartAreaEl.innerHTML = `
    <div class="chart-minmax top"><span>${max.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</span></div>
    <div class="chart-svg-wrap">${buildChartSvg(points)}</div>
    <div class="chart-minmax bottom"><span>${min.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</span></div>
    <div class="chart-range-labels"><span>${formatDate(points[0].t)}</span><span>${formatDate(points[points.length - 1].t)}</span></div>
  `;
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

document.getElementById('btn-close-chart')!.addEventListener('click', () => {
  window.miniTakip.closeSelf();
});

window.miniTakip.onSettingsChanged((settings) => {
  applyTheme(settings.themeMode);
});

async function init() {
  const [watchlist, settings, ranges] = await Promise.all([
    window.miniTakip.getWatchlist(),
    window.miniTakip.getSettings(),
    window.miniTakip.getChartRanges(),
  ]);
  applyTheme(settings.themeMode);
  const item = watchlist.find((i) => i.id === itemId);
  titleEl.textContent = item?.label ?? '???';
  renderRangeButtons(ranges);
  await loadHistory();
}

init();
