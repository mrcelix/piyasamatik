import type { WatchlistItem, ItemCategory } from '../main/providers/types';
import type { Settings, ViewMode, ThemeMode, AccentTheme, UpdateStatus } from '../main/store';
import type { AuthUser } from '../main/auth';

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
const inputTray = document.getElementById('input-tray') as HTMLInputElement;
const inputTrayMood = document.getElementById('input-tray-mood') as HTMLInputElement;
const inputHotkey = document.getElementById('input-hotkey') as HTMLInputElement;
const inputHudHotkey = document.getElementById('input-hud-hotkey') as HTMLInputElement;
const inputAlwaysOnTopMain = document.getElementById('input-alwaysontop-main') as HTMLInputElement;
const inputAlwaysOnTopMini = document.getElementById('input-alwaysontop-mini') as HTMLInputElement;
const inputMagnet = document.getElementById('input-magnet') as HTMLInputElement;
const inputAutofit = document.getElementById('input-autofit') as HTMLInputElement;
const inputTransparent = document.getElementById('input-transparent') as HTMLInputElement;
const inputOpacity = document.getElementById('input-opacity') as HTMLInputElement;
const opacityValueEl = document.getElementById('opacity-value') as HTMLSpanElement;
const inputGridCategory = document.getElementById('input-grid-category') as HTMLInputElement;
const viewModeOptions = document.getElementById('view-mode-options') as HTMLDivElement;
const themeModeOptions = document.getElementById('theme-mode-options') as HTMLDivElement;
const accentOptions = document.getElementById('accent-options') as HTMLDivElement;
const watchlistManageEl = document.getElementById('watchlist-manage') as HTMLDivElement;
const appVersionEl = document.getElementById('app-version') as HTMLSpanElement;
const updateStatusTextEl = document.getElementById('update-status-text') as HTMLParagraphElement;
const btnCheckUpdate = document.getElementById('btn-check-update') as HTMLButtonElement;
const btnInstallUpdate = document.getElementById('btn-install-update') as HTMLButtonElement;
const accountLoggedOutEl = document.getElementById('account-logged-out') as HTMLDivElement;
const accountLoggedInEl = document.getElementById('account-logged-in') as HTMLDivElement;
const accountEmailEl = document.getElementById('account-email') as HTMLSpanElement;
const accountStatusTextEl = document.getElementById('account-status-text') as HTMLParagraphElement;
const btnGoogleSignIn = document.getElementById('btn-google-signin') as HTMLButtonElement;
const btnGoogleSignOut = document.getElementById('btn-google-signout') as HTMLButtonElement;
const inputGlobalAlertEnabled = document.getElementById('input-global-alert-enabled') as HTMLInputElement;
const inputGlobalAlertUp = document.getElementById('input-global-alert-up') as HTMLInputElement;
const inputGlobalAlertDown = document.getElementById('input-global-alert-down') as HTMLInputElement;
const feedbackMessage = document.getElementById('feedback-message') as HTMLTextAreaElement;
const feedbackEmail = document.getElementById('feedback-email') as HTMLInputElement;
const btnFeedbackSend = document.getElementById('btn-feedback-send') as HTMLButtonElement;
const feedbackStatusEl = document.getElementById('feedback-status') as HTMLParagraphElement;

function renderAuth(user: AuthUser | null) {
  accountLoggedOutEl.classList.toggle('hidden', !!user);
  accountLoggedInEl.classList.toggle('hidden', !user);
  if (user) accountEmailEl.textContent = user.email ?? user.id;
  if (user?.email && !feedbackEmail.value) feedbackEmail.value = user.email;
}

btnFeedbackSend.addEventListener('click', async () => {
  const message = feedbackMessage.value.trim();
  if (!message) {
    feedbackStatusEl.textContent = 'Lutfen bir mesaj yazin.';
    return;
  }
  btnFeedbackSend.disabled = true;
  feedbackStatusEl.textContent = 'Gonderiliyor...';
  const result = await window.miniTakip.submitFeedback(message, feedbackEmail.value.trim() || undefined);
  btnFeedbackSend.disabled = false;
  if (result.error) {
    feedbackStatusEl.textContent = `Gonderilemedi: ${result.error}`;
    return;
  }
  feedbackMessage.value = '';
  feedbackStatusEl.textContent = 'Tesekkurler! Geri bildiriminiz alindi.';
});

btnGoogleSignIn.addEventListener('click', async () => {
  btnGoogleSignIn.disabled = true;
  accountStatusTextEl.textContent = 'Tarayicida Google girisi bekleniyor...';
  const result = await window.miniTakip.signInWithGoogle();
  btnGoogleSignIn.disabled = false;
  if (result.error) {
    accountStatusTextEl.textContent = `Giris basarisiz: ${result.error}`;
    return;
  }
  accountStatusTextEl.textContent = '';
  renderAuth(result.user ?? null);
});

btnGoogleSignOut.addEventListener('click', async () => {
  await window.miniTakip.signOut();
  renderAuth(null);
  accountStatusTextEl.textContent = '';
});

window.miniTakip.onAuthChanged((user) => {
  renderAuth(user);
});

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
      updateStatusTextEl.textContent = `${status.version} indirildi, birazdan otomatik yuklenecek. Hemen yuklemek icin butona basin.`;
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
  inputTray.checked = settings.showTrayIcon;
  inputTrayMood.checked = settings.trayMoodEnabled;
  inputHotkey.checked = settings.hotkeyEnabled;
  inputHudHotkey.checked = settings.hudHotkeyEnabled;
  inputAlwaysOnTopMain.checked = settings.mainAlwaysOnTopEnabled;
  inputAlwaysOnTopMini.checked = settings.miniAlwaysOnTopEnabled;
  inputMagnet.checked = settings.magnetEnabled;
  inputAutofit.checked = settings.autofitEnabled;
  inputTransparent.checked = settings.transparentEnabled;
  inputOpacity.value = String(Math.round(settings.windowOpacity * 100));
  opacityValueEl.textContent = `${Math.round(settings.windowOpacity * 100)}%`;
  inputGridCategory.checked = settings.gridShowCategory;
  inputGlobalAlertEnabled.checked = settings.globalAlert.enabled;
  inputGlobalAlertUp.value = settings.globalAlert.upPercent != null ? String(settings.globalAlert.upPercent) : '';
  inputGlobalAlertDown.value = settings.globalAlert.downPercent != null ? String(settings.globalAlert.downPercent) : '';
  const viewRadio = viewModeOptions.querySelector<HTMLInputElement>(`input[value="${settings.viewMode}"]`);
  if (viewRadio) viewRadio.checked = true;
  const themeRadio = themeModeOptions.querySelector<HTMLInputElement>(`input[value="${settings.themeMode}"]`);
  if (themeRadio) themeRadio.checked = true;
  accentOptions.querySelectorAll<HTMLLabelElement>('.accent-swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.accent === settings.accentTheme);
  });
}

function switchSection(sectionKey: string) {
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === sectionKey);
  });
  document.querySelectorAll<HTMLElement>('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `section-${sectionKey}`);
  });
}

document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchSection(btn.dataset.section!));
});

accentOptions.querySelectorAll<HTMLLabelElement>('.accent-swatch').forEach((el) => {
  el.addEventListener('click', () => {
    window.miniTakip.setSettings({ accentTheme: el.dataset.accent as AccentTheme });
  });
});

function buildGridRow(pairs: readonly (readonly [string, HTMLInputElement | HTMLSelectElement])[]): HTMLDivElement {
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  for (const [labelText, input] of pairs) {
    const label = document.createElement('label');
    label.textContent = labelText;
    label.appendChild(input);
    grid.appendChild(label);
  }
  return grid;
}

function buildAlarmGroup(title: string, hint: string, content: HTMLElement): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'alarm-group';
  const heading = document.createElement('div');
  heading.className = 'alarm-group-title';
  heading.textContent = title;
  const hintEl = document.createElement('div');
  hintEl.className = 'alarm-group-hint';
  hintEl.textContent = hint;
  group.appendChild(heading);
  group.appendChild(hintEl);
  group.appendChild(content);
  return group;
}

function buildDetailPanel(item: WatchlistItem): HTMLDivElement {
  const detail = document.createElement('div');
  detail.className = 'manage-detail';

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

  const portfolioGrid = buildGridRow([
    ['Adet', qtyInput],
    ['Ort. Maliyet', costInput],
  ]);

  const aboveInput = document.createElement('input');
  aboveInput.type = 'number';
  aboveInput.step = 'any';
  aboveInput.placeholder = 'Ustu';
  aboveInput.value = item.alertAbove != null ? String(item.alertAbove) : '';

  const belowInput = document.createElement('input');
  belowInput.type = 'number';
  belowInput.step = 'any';
  belowInput.placeholder = 'Alti';
  belowInput.value = item.alertBelow != null ? String(item.alertBelow) : '';

  const priceGroup = buildAlarmGroup(
    'Fiyat',
    `Belirli bir fiyat esigine ulasilinca uyar (${item.currency || 'birim'}).`,
    buildGridRow([
      ['Ustu', aboveInput],
      ['Alti', belowInput],
    ])
  );

  const upPctInput = document.createElement('input');
  upPctInput.type = 'number';
  upPctInput.step = 'any';
  upPctInput.min = '0';
  upPctInput.placeholder = '% artis';
  upPctInput.value = item.alertUpPercent != null ? String(item.alertUpPercent) : '';

  const downPctInput = document.createElement('input');
  downPctInput.type = 'number';
  downPctInput.step = 'any';
  downPctInput.min = '0';
  downPctInput.placeholder = '% azalis';
  downPctInput.value = item.alertDownPercent != null ? String(item.alertDownPercent) : '';

  const pctGroup = buildAlarmGroup(
    'Yuzde',
    'Gunluk degisim yuzdesi esigi gecince uyar.',
    buildGridRow([
      ['% artis', upPctInput],
      ['% azalis', downPctInput],
    ])
  );

  const ratioTargetSelect = document.createElement('select');
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '(oge secin)';
  ratioTargetSelect.appendChild(noneOpt);
  for (const other of watchlist) {
    if (other.id === item.id) continue;
    const opt = document.createElement('option');
    opt.value = other.id;
    opt.textContent = other.label;
    if (other.id === item.alertRatioTargetId) opt.selected = true;
    ratioTargetSelect.appendChild(opt);
  }

  const ratioAboveInput = document.createElement('input');
  ratioAboveInput.type = 'number';
  ratioAboveInput.step = 'any';
  ratioAboveInput.placeholder = 'Ustu';
  ratioAboveInput.value = item.alertRatioAbove != null ? String(item.alertRatioAbove) : '';

  const ratioBelowInput = document.createElement('input');
  ratioBelowInput.type = 'number';
  ratioBelowInput.step = 'any';
  ratioBelowInput.placeholder = 'Alti';
  ratioBelowInput.value = item.alertRatioBelow != null ? String(item.alertRatioBelow) : '';

  const ratioContent = document.createElement('div');
  const ratioSelectLabel = document.createElement('label');
  ratioSelectLabel.className = 'ratio-target-label';
  ratioSelectLabel.textContent = 'Karsilastirilacak oge';
  ratioSelectLabel.appendChild(ratioTargetSelect);
  ratioContent.appendChild(ratioSelectLabel);
  ratioContent.appendChild(
    buildGridRow([
      ['Oran ustu', ratioAboveInput],
      ['Oran alti', ratioBelowInput],
    ])
  );

  const ratioGroup = buildAlarmGroup(
    'Oran',
    'Bu ogenin fiyatini secilen diger ogeye bolerek (korelasyon orani) esik gecince uyar.',
    ratioContent
  );

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
      alertUpPercent: parse(upPctInput.value),
      alertDownPercent: parse(downPctInput.value),
      alertRatioTargetId: ratioTargetSelect.value || undefined,
      alertRatioAbove: ratioTargetSelect.value ? parse(ratioAboveInput.value) : undefined,
      alertRatioBelow: ratioTargetSelect.value ? parse(ratioBelowInput.value) : undefined,
      color: colorEnable.checked ? colorInput.value : undefined,
    });
    renderWatchlistManage();
  });

  detail.appendChild(portfolioGrid);
  detail.appendChild(priceGroup);
  detail.appendChild(pctGroup);
  detail.appendChild(ratioGroup);
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
    wrapper.id = `watchlist-item-${item.id}`;

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
    detailBtn.textContent = 'Alarm';
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
  const value = Math.max(5, parseInt(inputRefresh.value, 10) || 30);
  inputRefresh.value = String(value);
  window.miniTakip.setSettings({ refreshIntervalSec: value });
});

inputStartup.addEventListener('change', () => {
  window.miniTakip.setSettings({ launchAtStartup: inputStartup.checked });
});

inputTray.addEventListener('change', () => {
  window.miniTakip.setSettings({ showTrayIcon: inputTray.checked });
});

inputTrayMood.addEventListener('change', () => {
  window.miniTakip.setSettings({ trayMoodEnabled: inputTrayMood.checked });
});

inputMagnet.addEventListener('change', () => {
  window.miniTakip.setSettings({ magnetEnabled: inputMagnet.checked });
});

inputHotkey.addEventListener('change', () => {
  window.miniTakip.setSettings({ hotkeyEnabled: inputHotkey.checked });
});

inputHudHotkey.addEventListener('change', () => {
  window.miniTakip.setSettings({ hudHotkeyEnabled: inputHudHotkey.checked });
});

inputAlwaysOnTopMain.addEventListener('change', () => {
  window.miniTakip.setSettings({ mainAlwaysOnTopEnabled: inputAlwaysOnTopMain.checked });
});

inputAlwaysOnTopMini.addEventListener('change', () => {
  window.miniTakip.setSettings({ miniAlwaysOnTopEnabled: inputAlwaysOnTopMini.checked });
});

inputAutofit.addEventListener('change', () => {
  window.miniTakip.setSettings({ autofitEnabled: inputAutofit.checked });
});

inputTransparent.addEventListener('change', () => {
  window.miniTakip.setSettings({ transparentEnabled: inputTransparent.checked });
});

inputOpacity.addEventListener('input', () => {
  opacityValueEl.textContent = `${inputOpacity.value}%`;
});
inputOpacity.addEventListener('change', () => {
  window.miniTakip.setSettings({ windowOpacity: Number(inputOpacity.value) / 100 });
});

inputGridCategory.addEventListener('change', () => {
  window.miniTakip.setSettings({ gridShowCategory: inputGridCategory.checked });
});

// Always send the full globalAlert object together (settings:set merges patches
// shallowly, so a partial {enabled: true} alone would drop the percent fields).
function sendGlobalAlert() {
  const parse = (v: string) => (v.trim() === '' ? undefined : parseFloat(v));
  window.miniTakip.setSettings({
    globalAlert: {
      enabled: inputGlobalAlertEnabled.checked,
      upPercent: parse(inputGlobalAlertUp.value),
      downPercent: parse(inputGlobalAlertDown.value),
    },
  });
}
inputGlobalAlertEnabled.addEventListener('change', sendGlobalAlert);
inputGlobalAlertUp.addEventListener('change', sendGlobalAlert);
inputGlobalAlertDown.addEventListener('change', sendGlobalAlert);

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
  document.body.classList.remove('accent-gold', 'accent-green', 'accent-red', 'accent-purple');
  if (settings.accentTheme !== 'blue') document.body.classList.add(`accent-${settings.accentTheme}`);
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.miniTakip.showContextMenu();
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
  const [settings, wl, ids, version, user] = await Promise.all([
    window.miniTakip.getSettings(),
    window.miniTakip.getWatchlist(),
    window.miniTakip.getDetachedIds(),
    window.miniTakip.getAppVersion(),
    window.miniTakip.getAuthUser(),
  ]);
  watchlist = wl;
  detachedIds = ids;
  appVersionEl.textContent = version;
  updateStatusTextEl.textContent = '-';
  renderGeneral(settings);
  document.body.classList.toggle('theme-light', settings.themeMode === 'light');
  if (settings.accentTheme !== 'blue') document.body.classList.add(`accent-${settings.accentTheme}`);
  renderWatchlistManage();
  renderAuth(user);

  const focusItemId = new URLSearchParams(window.location.search).get('focusItemId');
  if (focusItemId) focusWatchlistItem(focusItemId);
}

function focusWatchlistItem(id: string) {
  switchSection('watchlist');
  expandedId = id;
  renderWatchlistManage();
  document.getElementById(`watchlist-item-${id}`)?.scrollIntoView({ block: 'center' });
}

window.miniTakip.onFocusItem((id) => focusWatchlistItem(id));

init();
