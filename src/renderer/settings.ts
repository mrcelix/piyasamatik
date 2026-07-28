import type { WatchlistItem, ItemCategory } from '../main/providers/types';
import type { Settings, ViewMode, ThemeMode, UpdateStatus } from '../main/store';

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  currency: 'Doviz',
  gold: 'Altin/Emtia',
  stock: 'Hisse',
  index: 'Endeks',
  crypto: 'Kripto',
};

let watchlist: WatchlistItem[] = [];
let detachedIds: string[] = [];
let expandedId: string | null = null;

const inputRefresh = document.getElementById('input-refresh') as HTMLInputElement;
const inputStartup = document.getElementById('input-startup') as HTMLInputElement;
const inputMagnet = document.getElementById('input-magnet') as HTMLInputElement;
const inputHotkey = document.getElementById('input-hotkey') as HTMLInputElement;
const viewModeOptions = document.getElementById('view-mode-options') as HTMLDivElement;
const themeModeOptions = document.getElementById('theme-mode-options') as HTMLDivElement;
const watchlistManageEl = document.getElementById('watchlist-manage') as HTMLDivElement;
const appVersionEl = document.getElementById('app-version') as HTMLSpanElement;
const updateStatusTextEl = document.getElementById('update-status-text') as HTMLParagraphElement;
const btnCheckUpdate = document.getElementById('btn-check-update') as HTMLButtonElement;
const btnInstallUpdate = document.getElementById('btn-install-update') as HTMLButtonElement;

function renderUpdateStatus(status: UpdateStatus) {
  btnInstallUpdate.classList.add('hidden');
  switch (status.state) {
    case 'checking':
      updateStatusTextEl.textContent = 'Kontrol ediliyor...';
      break;
    case 'available':
      updateStatusTextEl.textContent = `Yeni surum bulundu: ${status.version} - indiriliyor...`;
      break;
    case 'not-available':
      updateStatusTextEl.textContent = 'Guncelsiniz.';
      break;
    case 'downloading':
      updateStatusTextEl.textContent = `Indiriliyor... %${Math.round(status.percent ?? 0)}`;
      break;
    case 'downloaded':
      updateStatusTextEl.textContent = `${status.version} indirildi, kuruluma hazir.`;
      btnInstallUpdate.classList.remove('hidden');
      break;
    case 'error':
      updateStatusTextEl.textContent = status.message ?? 'Bilinmeyen hata';
      break;
  }
}

function renderGeneral(settings: Settings) {
  inputRefresh.value = String(settings.refreshIntervalSec);
  inputStartup.checked = settings.launchAtStartup;
  inputMagnet.checked = settings.magnetEnabled;
  inputHotkey.checked = settings.hotkeyEnabled;
  const viewRadio = viewModeOptions.querySelector<HTMLInputElement>(`input[value="${settings.viewMode}"]`);
  if (viewRadio) viewRadio.checked = true;
  const themeRadio = themeModeOptions.querySelector<HTMLInputElement>(`input[value="${settings.themeMode}"]`);
  if (themeRadio) themeRadio.checked = true;
}

function buildDetailPanel(item: WatchlistItem): HTMLDivElement {
  const detail = document.createElement('div');
  detail.className = 'manage-detail';

  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.step = 'any';
  qtyInput.placeholder = 'Adet';
  qtyInput.value = item.quantity != null ? String(item.quantity) : '';

  const costInput = document.createElement('input');
  costInput.type = 'number';
  costInput.step = 'any';
  costInput.placeholder = `Ort. maliyet (${item.currency || 'birim'})`;
  costInput.value = item.costBasis != null ? String(item.costBasis) : '';

  const aboveInput = document.createElement('input');
  aboveInput.type = 'number';
  aboveInput.step = 'any';
  aboveInput.placeholder = 'Alarm: ustu';
  aboveInput.value = item.alertAbove != null ? String(item.alertAbove) : '';

  const belowInput = document.createElement('input');
  belowInput.type = 'number';
  belowInput.step = 'any';
  belowInput.placeholder = 'Alarm: alti';
  belowInput.value = item.alertBelow != null ? String(item.alertBelow) : '';

  for (const [labelText, input] of [
    ['Adet', qtyInput],
    ['Ort. Maliyet', costInput],
    ['Alarm ustu', aboveInput],
    ['Alarm alti', belowInput],
  ] as const) {
    const label = document.createElement('label');
    label.textContent = labelText;
    label.appendChild(input);
    grid.appendChild(label);
  }

  const colorRow = document.createElement('div');
  colorRow.className = 'color-row';

  const colorEnable = document.createElement('input');
  colorEnable.type = 'checkbox';
  colorEnable.checked = !!item.color;

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = item.color ?? '#4a7dff';
  colorInput.disabled = !item.color;

  colorEnable.addEventListener('change', () => {
    colorInput.disabled = !colorEnable.checked;
  });

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Ozel renk';
  colorLabel.appendChild(colorEnable);
  colorRow.appendChild(colorLabel);
  colorRow.appendChild(colorInput);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Kaydet';
  saveBtn.className = 'save-detail';
  saveBtn.addEventListener('click', async () => {
    const parse = (v: string) => (v.trim() === '' ? undefined : parseFloat(v));
    watchlist = await window.miniTakip.updateItem(item.id, {
      quantity: parse(qtyInput.value),
      costBasis: parse(costInput.value),
      alertAbove: parse(aboveInput.value),
      alertBelow: parse(belowInput.value),
      color: colorEnable.checked ? colorInput.value : undefined,
    });
    renderWatchlistManage();
  });

  detail.appendChild(grid);
  detail.appendChild(colorRow);
  detail.appendChild(saveBtn);
  return detail;
}

function renderWatchlistManage() {
  watchlistManageEl.innerHTML = '';
  if (watchlist.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Izleme listeniz bos.';
    watchlistManageEl.appendChild(empty);
    return;
  }
  for (const item of watchlist) {
    const isDetached = detachedIds.includes(item.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'watchlist-manage-item';

    const row = document.createElement('div');
    row.className = 'watchlist-manage-row';

    const main = document.createElement('div');
    main.className = 'row-main';
    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = item.label;
    label.title = item.label;
    const category = document.createElement('div');
    category.className = 'row-category';
    category.textContent = CATEGORY_LABEL[item.category];
    main.appendChild(label);
    main.appendChild(category);

    const actions = document.createElement('div');
    actions.className = 'manage-actions';

    const favBtn = document.createElement('button');
    favBtn.textContent = item.favorite ? '★' : '☆';
    favBtn.className = item.favorite ? 'active' : '';
    favBtn.title = item.favorite ? 'Favorilerden cikar' : 'Favorilere ekle';
    favBtn.addEventListener('click', async () => {
      watchlist = await window.miniTakip.updateItem(item.id, { favorite: !item.favorite });
      renderWatchlistManage();
    });

    const detailBtn = document.createElement('button');
    detailBtn.textContent = 'Detay';
    detailBtn.className = expandedId === item.id ? 'active' : '';
    detailBtn.addEventListener('click', () => {
      expandedId = expandedId === item.id ? null : item.id;
      renderWatchlistManage();
    });

    const detachBtn = document.createElement('button');
    detachBtn.textContent = isDetached ? 'Ayri (kapat)' : 'Ayri pencere';
    detachBtn.className = isDetached ? 'active' : '';
    detachBtn.addEventListener('click', async () => {
      if (isDetached) {
        await window.miniTakip.attachItem(item.id);
      } else {
        await window.miniTakip.detachItem(item.id);
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Kaldir';
    removeBtn.className = 'danger';
    removeBtn.addEventListener('click', async () => {
      watchlist = await window.miniTakip.removeItem(item.id);
      renderWatchlistManage();
    });

    actions.appendChild(favBtn);
    actions.appendChild(detailBtn);
    actions.appendChild(detachBtn);
    actions.appendChild(removeBtn);

    row.appendChild(main);
    row.appendChild(actions);
    wrapper.appendChild(row);

    if (expandedId === item.id) {
      wrapper.appendChild(buildDetailPanel(item));
    }

    watchlistManageEl.appendChild(wrapper);
  }
}

inputRefresh.addEventListener('change', () => {
  const value = Math.max(15, parseInt(inputRefresh.value, 10) || 60);
  inputRefresh.value = String(value);
  window.miniTakip.setSettings({ refreshIntervalSec: value });
});

inputStartup.addEventListener('change', () => {
  window.miniTakip.setSettings({ launchAtStartup: inputStartup.checked });
});

inputMagnet.addEventListener('change', () => {
  window.miniTakip.setSettings({ magnetEnabled: inputMagnet.checked });
});

inputHotkey.addEventListener('change', () => {
  window.miniTakip.setSettings({ hotkeyEnabled: inputHotkey.checked });
});

viewModeOptions.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'viewMode') {
    window.miniTakip.setSettings({ viewMode: target.value as ViewMode });
  }
});

themeModeOptions.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'themeMode') {
    window.miniTakip.setSettings({ themeMode: target.value as ThemeMode });
  }
});

document.getElementById('btn-close-settings')!.addEventListener('click', () => {
  window.miniTakip.closeSelf();
});

btnCheckUpdate.addEventListener('click', () => {
  window.miniTakip.checkForUpdates();
});
btnInstallUpdate.addEventListener('click', () => {
  window.miniTakip.installUpdate();
});

window.miniTakip.onUpdateStatus((status) => {
  renderUpdateStatus(status);
});

window.miniTakip.onSettingsChanged((settings) => {
  renderGeneral(settings);
  document.body.classList.toggle('theme-light', settings.themeMode === 'light');
});

window.miniTakip.onWatchlistChanged((updated) => {
  watchlist = updated;
  renderWatchlistManage();
});

window.miniTakip.onDetachedChanged((ids) => {
  detachedIds = ids;
  renderWatchlistManage();
});

async function init() {
  const [settings, wl, ids, version] = await Promise.all([
    window.miniTakip.getSettings(),
    window.miniTakip.getWatchlist(),
    window.miniTakip.getDetachedIds(),
    window.miniTakip.getAppVersion(),
  ]);
  watchlist = wl;
  detachedIds = ids;
  appVersionEl.textContent = version;
  updateStatusTextEl.textContent = '-';
  renderGeneral(settings);
  document.body.classList.toggle('theme-light', settings.themeMode === 'light');
  renderWatchlistManage();
}

init();
