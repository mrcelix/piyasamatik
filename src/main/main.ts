import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  MenuItemConstructorOptions,
  ipcMain,
  nativeImage,
  screen,
  globalShortcut,
  Notification,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import {
  loadSettings,
  saveSettings,
  loadWatchlist,
  saveWatchlist,
  loadLists,
  saveLists,
  loadTransactions,
  saveTransactions,
  DEFAULT_LIST_ID,
  Settings,
  UpdateStatus,
  WatchlistList,
  Transaction,
} from './store';
import {
  fetchQuotesForWatchlist,
  searchAllProviders,
  fetchSparklinesForWatchlist,
  convertAmount,
  getConvertibleCodes,
  fetchHistoryForItem,
  CHART_RANGES,
  fetchMarketNews,
} from './providers';
import type { Quote, WatchlistItem } from './providers/types';
import { registerForSnapping, clampToVisibleDisplay } from './windows';
import { computePosition } from './position';
import {
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  signOut,
  getCurrentUser,
  cloudRowExists,
  pullFromCloud,
  pushToCloud,
  submitFeedback,
  type AuthUser,
} from './auth';
import { randomUUID } from 'crypto';

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const APP_ICON = path.join(ASSETS_DIR, 'icon.png');
const HOTKEY = 'CommandOrControl+Shift+M';
const HUD_HOTKEY = 'CommandOrControl+Shift+Q';
const HUD_WIDTH = 240;
const HUD_MAX_HEIGHT = 320;
const HUD_AUTO_DISMISS_MS = 4500;
const SPARKLINE_INTERVAL_MS = 10 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATE_AUTO_INSTALL_DELAY_MS = 60 * 1000;

// Only one instance may own the userData files (watchlist.json/settings.json)
// at a time; a second launch just focuses the existing window and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tickerWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let hudDismissTimer: NodeJS.Timeout | null = null;
const detachedWindows = new Map<string, BrowserWindow>();
const chartWindows = new Map<string, BrowserWindow>();

let tray: Tray | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let sparklineTimer: NodeJS.Timeout | null = null;
let updateCheckTimer: NodeJS.Timeout | null = null;
let updateAutoInstallTimer: NodeJS.Timeout | null = null;
let latestQuotes = new Map<string, Quote>();
let latestSparklines = new Map<string, number[]>();
// "Yokken neler oldu" summary: a snapshot taken when the window hides/minimizes,
// compared against current quotes when it's shown again.
let hiddenAt: number | null = null;
let quotesAtHide: Map<string, Quote> | null = null;
const AWAY_SUMMARY_MIN_HIDDEN_MS = 60_000;
const AWAY_SUMMARY_MIN_MOVE_PCT = 0.1;
const AWAY_SUMMARY_MAX_ITEMS = 3;
const alertState = new Map<
  string,
  {
    aboveFired: boolean;
    belowFired: boolean;
    upPctFired: boolean;
    downPctFired: boolean;
    ratioAboveFired: boolean;
    ratioBelowFired: boolean;
  }
>();
const globalAlertState = new Map<string, { upFired: boolean; downFired: boolean }>();

let currentUser: AuthUser | null = null;
let cloudPushTimer: NodeJS.Timeout | null = null;

// The app's productName has changed twice now ("Mini Takip" -> "Piyasamatik"
// -> "Piyasamatik.com"), and Electron's default userData folder is derived
// from productName each time. Copy any existing data over from the most
// recent old folder that actually exists, so returning users don't lose
// their watchlist/settings/auth session across a rename.
function migrateUserDataFromOldProductName(): void {
  const newDir = app.getPath('userData');
  if (fs.existsSync(newDir)) return;
  const oldNames = ['Piyasamatik', 'Mini Takip'];
  for (const oldName of oldNames) {
    const oldDir = path.join(app.getPath('appData'), oldName);
    if (fs.existsSync(oldDir)) {
      fs.cpSync(oldDir, newDir, { recursive: true });
      return;
    }
  }
}
migrateUserDataFromOldProductName();

// Without this, Windows shows the generic "electron.app.Electron" as the
// sender name on notifications instead of the app's own identity.
app.setAppUserModelId('com.mustafacelik.piyasamatik');

const settings: Settings = loadSettings();
let watchlist: WatchlistItem[] = loadWatchlist();
let lists: WatchlistList[] = loadLists();
let transactions: Transaction[] = loadTransactions();

const commonWebPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
};

// ---- Broadcast helpers ----

function broadcastQuotes() {
  const payload = Object.fromEntries(latestQuotes);
  mainWindow?.webContents.send('quotes-updated', payload);
  tickerWindow?.webContents.send('quotes-updated', payload);
  for (const win of detachedWindows.values()) {
    win.webContents.send('quotes-updated', payload);
  }
  applyTrayMood();
}

function broadcastWatchlist() {
  mainWindow?.webContents.send('watchlist-changed', watchlist);
  settingsWindow?.webContents.send('watchlist-changed', watchlist);
  tickerWindow?.webContents.send('watchlist-changed', watchlist);
}

function broadcastSettings() {
  mainWindow?.webContents.send('settings-changed', settings);
  settingsWindow?.webContents.send('settings-changed', settings);
  tickerWindow?.webContents.send('settings-changed', settings);
}

function broadcastLists() {
  mainWindow?.webContents.send('lists-changed', lists);
  settingsWindow?.webContents.send('lists-changed', lists);
}

function broadcastTransactions() {
  mainWindow?.webContents.send('transactions-changed', transactions);
  settingsWindow?.webContents.send('transactions-changed', transactions);
}

function broadcastDetachedIds() {
  const ids = [...detachedWindows.keys()];
  mainWindow?.webContents.send('detached-changed', ids);
  settingsWindow?.webContents.send('detached-changed', ids);
}


function broadcastUpdateStatus(status: UpdateStatus) {
  mainWindow?.webContents.send('update-status', status);
  settingsWindow?.webContents.send('update-status', status);
}

function broadcastAuth() {
  mainWindow?.webContents.send('auth-changed', currentUser);
  settingsWindow?.webContents.send('auth-changed', currentUser);
}

// Cloud sync is opportunistic and best-effort: once signed in, local changes push
// up (debounced) so a second device picks them up on its next pull.
function scheduleCloudPush() {
  if (!currentUser) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  const userId = currentUser.id;
  cloudPushTimer = setTimeout(() => {
    pushToCloud(userId, settings, watchlist).catch((err) => console.error('cloud push failed', err));
  }, 2000);
}

// ---- Main list window ----

function createMainWindow() {
  const bounds = clampToVisibleDisplay(settings.windowBounds) ?? settings.windowBounds;
  const display = screen.getPrimaryDisplay();
  const x = bounds.x ?? display.workArea.width - bounds.width - 24;
  const y = bounds.y ?? 24;

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    minWidth: 260,
    minHeight: 300,
    alwaysOnTop: settings.mainAlwaysOnTopEnabled,
    skipTaskbar: false,
    show: false,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });
  mainWindow.setOpacity(settings.transparentEnabled ? settings.windowOpacity : 1);

  mainWindow.loadFile(path.join(RENDERER_DIR, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  registerForSnapping(mainWindow, () => settings);

  // Minimizing (our own button, or an OS-level shortcut like Win+D/Win+M)
  // would normally leave a taskbar button behind; "minimize" isn't
  // cancelable, so instead hide right after so only the tray icon remains,
  // matching how "Pencereyi Gizle" already behaves.
  mainWindow.on('minimize', () => {
    mainWindow?.hide();
  });

  mainWindow.on('hide', onMainWindowHide);
  mainWindow.on('show', onMainWindowShow);

  const persistBounds = () => {
    if (!mainWindow) return;
    const [width, height] = mainWindow.getSize();
    const [wx, wy] = mainWindow.getPosition();
    settings.windowBounds = { x: wx, y: wy, width, height };
    saveSettings(settings);
  };
  mainWindow.on('move', persistBounds);
  mainWindow.on('resize', persistBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- Per-item detached mini windows ----

function createItemWindow(item: WatchlistItem) {
  const existing = detachedWindows.get(item.id);
  if (existing) {
    existing.focus();
    return;
  }

  const saved = clampToVisibleDisplay(settings.detachedWindows[item.id]);
  const width = saved?.width ?? 220;
  const height = saved?.height ?? 90;

  const win = new BrowserWindow({
    width,
    height,
    x: saved?.x,
    y: saved?.y,
    frame: false,
    resizable: true,
    minWidth: 160,
    minHeight: 64,
    alwaysOnTop: settings.miniAlwaysOnTopEnabled,
    skipTaskbar: true,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });
  win.setOpacity(settings.transparentEnabled ? settings.windowOpacity : 1);

  win.loadFile(path.join(RENDERER_DIR, 'mini.html'), { query: { itemId: item.id } });
  registerForSnapping(win, () => settings);

  const persistBounds = () => {
    settings.detachedWindows[item.id] = win.getBounds();
    saveSettings(settings);
  };
  win.on('move', persistBounds);
  win.on('resize', persistBounds);

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('quotes-updated', Object.fromEntries(latestQuotes));
  });

  win.on('closed', () => {
    detachedWindows.delete(item.id);
    delete settings.detachedWindows[item.id];
    saveSettings(settings);
    broadcastDetachedIds();
  });

  detachedWindows.set(item.id, win);
  settings.detachedWindows[item.id] = win.getBounds();
  saveSettings(settings);
  broadcastDetachedIds();
}

function closeItemWindow(id: string) {
  detachedWindows.get(id)?.close();
}

// ---- Per-item history chart windows ----

function createChartWindow(item: WatchlistItem) {
  const existing = chartWindows.get(item.id);
  if (existing) {
    existing.focus();
    return;
  }

  const saved = clampToVisibleDisplay(settings.chartWindowBounds);
  const win = new BrowserWindow({
    width: saved?.width ?? 460,
    height: saved?.height ?? 360,
    x: saved?.x,
    y: saved?.y,
    frame: false,
    resizable: true,
    minWidth: 320,
    minHeight: 240,
    alwaysOnTop: settings.miniAlwaysOnTopEnabled,
    skipTaskbar: true,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });

  win.loadFile(path.join(RENDERER_DIR, 'chart.html'), { query: { itemId: item.id } });
  registerForSnapping(win, () => settings);

  const persistBounds = () => {
    settings.chartWindowBounds = win.getBounds();
    saveSettings(settings);
  };
  win.on('move', persistBounds);
  win.on('resize', persistBounds);

  win.on('closed', () => {
    chartWindows.delete(item.id);
  });

  chartWindows.set(item.id, win);
}

function closeChartWindow(id: string) {
  chartWindows.get(id)?.close();
}

// ---- Kayan Serit (ticker) window ----
// The ticker view mode gets its own slim, always-on-top window (rather than
// rendering inline in the main list) so it can sit at a screen edge like a
// classic stock ticker bar while the main window stays free for other views.

function createTickerWindow() {
  if (tickerWindow) {
    tickerWindow.focus();
    return;
  }
  const saved = clampToVisibleDisplay(settings.tickerWindowBounds);
  tickerWindow = new BrowserWindow({
    width: saved?.width ?? 480,
    height: saved?.height ?? 40,
    x: saved?.x,
    y: saved?.y,
    frame: false,
    resizable: true,
    minWidth: 220,
    minHeight: 32,
    alwaysOnTop: settings.miniAlwaysOnTopEnabled,
    skipTaskbar: true,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });
  tickerWindow.setOpacity(settings.transparentEnabled ? settings.windowOpacity : 1);

  tickerWindow.loadFile(path.join(RENDERER_DIR, 'ticker.html'));
  registerForSnapping(tickerWindow, () => settings);

  const persistBounds = () => {
    if (!tickerWindow) return;
    settings.tickerWindowBounds = tickerWindow.getBounds();
    saveSettings(settings);
  };
  tickerWindow.on('move', persistBounds);
  tickerWindow.on('resize', persistBounds);

  tickerWindow.webContents.once('did-finish-load', () => {
    tickerWindow?.webContents.send('quotes-updated', Object.fromEntries(latestQuotes));
  });

  tickerWindow.on('closed', () => {
    tickerWindow = null;
    // Nothing left to show the ticker view in, so fall back to grid rather
    // than leaving viewMode stuck on 'ticker' with no window displaying it.
    if (settings.viewMode === 'ticker') {
      settings.viewMode = 'grid';
      saveSettings(settings);
      broadcastSettings();
    }
  });
}

function closeTickerWindow() {
  tickerWindow?.close();
}

function syncTickerWindow() {
  if (settings.viewMode === 'ticker') createTickerWindow();
  else closeTickerWindow();
}

// ---- Quick-peek HUD (global hotkey, transient, near the cursor) ----

function closeHud() {
  if (hudDismissTimer) {
    clearTimeout(hudDismissTimer);
    hudDismissTimer = null;
  }
  hudWindow?.close();
}

function createHud() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const work = display.workArea;
  const height = HUD_MAX_HEIGHT;
  const x = Math.min(cursor.x + 16, work.x + work.width - HUD_WIDTH);
  const y = Math.min(cursor.y + 16, work.y + work.height - height);

  const win = new BrowserWindow({
    width: HUD_WIDTH,
    height,
    x: Math.max(x, work.x),
    y: Math.max(y, work.y),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });

  win.loadFile(path.join(RENDERER_DIR, 'hud.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('quotes-updated', Object.fromEntries(latestQuotes));
  });
  win.on('closed', () => {
    if (hudWindow === win) hudWindow = null;
    if (hudDismissTimer) {
      clearTimeout(hudDismissTimer);
      hudDismissTimer = null;
    }
  });

  hudWindow = win;
  hudDismissTimer = setTimeout(() => closeHud(), HUD_AUTO_DISMISS_MS);
}

function toggleHud() {
  if (hudWindow) {
    closeHud();
    return;
  }
  createHud();
}

function reopenPersistedDetachedWindows() {
  for (const id of Object.keys(settings.detachedWindows)) {
    const item = watchlist.find((i) => i.id === id);
    if (item) createItemWindow(item);
    else delete settings.detachedWindows[id];
  }
  saveSettings(settings);
}

// ---- Settings window ----

function createSettingsWindow(focusItemId?: string) {
  if (settingsWindow) {
    settingsWindow.focus();
    if (focusItemId) settingsWindow.webContents.send('focus-item', focusItemId);
    return;
  }
  const saved = clampToVisibleDisplay(settings.settingsWindowBounds);
  settingsWindow = new BrowserWindow({
    width: saved?.width ?? 480,
    height: saved?.height ?? 580,
    x: saved?.x,
    y: saved?.y,
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: 420,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });
  settingsWindow.loadFile(
    path.join(RENDERER_DIR, 'settings.html'),
    focusItemId ? { query: { focusItemId } } : undefined
  );
  registerForSnapping(settingsWindow, () => settings);

  const persistBounds = () => {
    if (!settingsWindow) return;
    settings.settingsWindowBounds = settingsWindow.getBounds();
    saveSettings(settings);
  };
  settingsWindow.on('move', persistBounds);
  settingsWindow.on('resize', persistBounds);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---- Tray ----

const TRAY_ICONS = {
  neutral: nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.png')),
  up: nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray-up.png')),
  down: nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray-down.png')),
};
let trayMood: 'neutral' | 'up' | 'down' = 'neutral';

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Piyasamatik.com');
  const menu = Menu.buildFromTemplate([
    { label: 'Goster/Gizle', click: () => toggleWindow() },
    { label: 'Ayarlar', click: () => createSettingsWindow() },
    { label: 'Simdi Yenile', click: () => refreshQuotes() },
    { type: 'separator' },
    { label: 'Cikis', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleWindow());
  applyTrayMood();
}

// Tints the tray icon green/red when the watchlist's average daily change
// leans clearly one way, so the overall market mood is visible at a glance
// without opening the window. Resets to neutral when the toggle is off.
function applyTrayMood() {
  if (!tray) return;
  if (!settings.trayMoodEnabled) {
    if (trayMood !== 'neutral') {
      trayMood = 'neutral';
      tray.setImage(TRAY_ICONS.neutral);
    }
    return;
  }
  const changes = Array.from(latestQuotes.values())
    .filter((q) => !q.error && Number.isFinite(q.changePercent))
    .map((q) => q.changePercent as number);
  if (changes.length === 0) return;
  const avg = changes.reduce((sum, c) => sum + c, 0) / changes.length;
  const MOOD_THRESHOLD = 0.3;
  const nextMood: typeof trayMood = avg > MOOD_THRESHOLD ? 'up' : avg < -MOOD_THRESHOLD ? 'down' : 'neutral';
  if (nextMood !== trayMood) {
    trayMood = nextMood;
    tray.setImage(TRAY_ICONS[nextMood]);
  }
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
}

function applyTrayVisibility() {
  if (settings.showTrayIcon && !tray) {
    createTray();
  } else if (!settings.showTrayIcon && tray) {
    tray.destroy();
    tray = null;
  }
}

function applyAlwaysOnTop() {
  mainWindow?.setAlwaysOnTop(settings.mainAlwaysOnTopEnabled);
  tickerWindow?.setAlwaysOnTop(settings.miniAlwaysOnTopEnabled);
  for (const win of detachedWindows.values()) win.setAlwaysOnTop(settings.miniAlwaysOnTopEnabled);
  for (const win of chartWindows.values()) win.setAlwaysOnTop(settings.miniAlwaysOnTopEnabled);
}

function applyTransparency() {
  const opacity = settings.transparentEnabled ? settings.windowOpacity : 1;
  mainWindow?.setOpacity(opacity);
  tickerWindow?.setOpacity(opacity);
  for (const win of detachedWindows.values()) win.setOpacity(opacity);
  for (const win of chartWindows.values()) win.setOpacity(opacity);
}

// ---- Right-click context menus ----

function findDetachedItemId(win: BrowserWindow): string | null {
  for (const [id, w] of detachedWindows) if (w === win) return id;
  return null;
}

function findChartItemId(win: BrowserWindow): string | null {
  for (const [id, w] of chartWindows) if (w === win) return id;
  return null;
}

let mainDeclutterMode = false;
let mainWindowsLocked = false;

function buildContextMenu(win: BrowserWindow): Menu {
  if (win === mainWindow) {
    const items: MenuItemConstructorOptions[] = [];
    if (mainDeclutterMode) {
      items.push(
        {
          label: 'Ana Pencereyi Goster',
          click: () => {
            mainDeclutterMode = false;
            mainWindowsLocked = false;
            mainWindow?.webContents.send('exit-declutter-mode');
          },
        },
        {
          label: 'Pencereleri Kilitle',
          type: 'checkbox',
          checked: mainWindowsLocked,
          click: () => {
            mainWindowsLocked = !mainWindowsLocked;
            mainWindow?.webContents.send('windows-lock-changed', mainWindowsLocked);
          },
        },
        { type: 'separator' }
      );
    }
    items.push(
      { label: 'Simdi Yenile', click: () => refreshQuotes() },
      { label: 'Oge Ekle', click: () => mainWindow?.webContents.send('menu-action', 'open-add') },
      { label: 'Kur Cevirici', click: () => mainWindow?.webContents.send('menu-action', 'open-convert') },
      { label: 'Piyasa Haberleri', click: () => mainWindow?.webContents.send('menu-action', 'open-news') },
      { type: 'separator' },
      {
        label: 'Miknatis',
        type: 'checkbox',
        checked: settings.magnetEnabled,
        click: () => {
          settings.magnetEnabled = !settings.magnetEnabled;
          saveSettings(settings);
          broadcastSettings();
        },
      },
      {
        label: 'Otomatik Sigdir',
        type: 'checkbox',
        checked: settings.autofitEnabled,
        click: () => {
          settings.autofitEnabled = !settings.autofitEnabled;
          saveSettings(settings);
          broadcastSettings();
        },
      },
      {
        label: 'Her Zaman Ustte',
        type: 'checkbox',
        checked: settings.mainAlwaysOnTopEnabled,
        click: () => {
          settings.mainAlwaysOnTopEnabled = !settings.mainAlwaysOnTopEnabled;
          saveSettings(settings);
          applyAlwaysOnTop();
          broadcastSettings();
        },
      },
      { label: 'Ayarlar', click: () => createSettingsWindow() },
      { type: 'separator' },
      { label: 'Pencereyi Gizle', click: () => mainWindow?.hide() },
      { label: 'Cikis', click: () => app.quit() }
    );
    return Menu.buildFromTemplate(items);
  }

  const detachedId = findDetachedItemId(win);
  if (detachedId) {
    const item = watchlist.find((i) => i.id === detachedId);
    return Menu.buildFromTemplate([
      { label: 'Gecmis Grafik', click: () => item && createChartWindow(item) },
      {
        label: 'Her Zaman Ustte',
        type: 'checkbox',
        checked: settings.miniAlwaysOnTopEnabled,
        click: () => {
          settings.miniAlwaysOnTopEnabled = !settings.miniAlwaysOnTopEnabled;
          saveSettings(settings);
          applyAlwaysOnTop();
          broadcastSettings();
        },
      },
      { label: 'Listeye Don', click: () => closeItemWindow(detachedId) },
      { type: 'separator' },
      { label: 'Ana Pencereyi Goster', click: () => mainWindow?.show() },
    ]);
  }

  if (findChartItemId(win)) {
    return Menu.buildFromTemplate([{ label: 'Kapat', click: () => win.close() }]);
  }

  if (win === tickerWindow) {
    return Menu.buildFromTemplate([
      { label: 'Simdi Yenile', click: () => refreshQuotes() },
      { label: 'Listeye Don', click: () => closeTickerWindow() },
    ]);
  }

  return Menu.buildFromTemplate([{ label: 'Kapat', click: () => win.close() }]);
}

// ---- "Yokken neler oldu" away summary ----

function onMainWindowHide() {
  hiddenAt = Date.now();
  quotesAtHide = new Map(latestQuotes);
}

function onMainWindowShow() {
  if (hiddenAt != null && Date.now() - hiddenAt >= AWAY_SUMMARY_MIN_HIDDEN_MS) {
    fireAwaySummary();
  }
  hiddenAt = null;
  quotesAtHide = null;
}

function fireAwaySummary() {
  if (!quotesAtHide || !Notification.isSupported()) return;
  const movers: { label: string; deltaPct: number }[] = [];
  for (const item of watchlist) {
    const before = quotesAtHide.get(item.id);
    const now = latestQuotes.get(item.id);
    if (!before || !now || before.error || now.error || before.price === 0) continue;
    const deltaPct = ((now.price - before.price) / before.price) * 100;
    if (Math.abs(deltaPct) >= AWAY_SUMMARY_MIN_MOVE_PCT) movers.push({ label: item.label, deltaPct });
  }
  if (movers.length === 0) return;
  movers.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  const top = movers.slice(0, AWAY_SUMMARY_MAX_ITEMS);
  const body = top.map((m) => `${m.label} ${m.deltaPct > 0 ? '+' : ''}${m.deltaPct.toFixed(2)}%`).join(', ');
  const notif = new Notification({
    title: 'Yokken neler oldu?',
    body,
    icon: APP_ICON,
  });
  notif.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  notif.show();
}

// ---- Price target alerts ----

function fireAlertNotification(item: WatchlistItem, body: string) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: `${item.label} hedefe ulasti`,
    body,
    icon: APP_ICON,
  });
  notif.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  notif.show();
}

function formatAlertPct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function checkAlerts() {
  for (const item of watchlist) {
    const quote = latestQuotes.get(item.id);
    if (!quote || quote.error) continue;

    const hasPerItemAlert =
      item.alertAbove != null ||
      item.alertBelow != null ||
      item.alertUpPercent != null ||
      item.alertDownPercent != null ||
      (item.alertRatioTargetId != null && (item.alertRatioAbove != null || item.alertRatioBelow != null));
    if (hasPerItemAlert) {
      const state =
        alertState.get(item.id) ??
        {
          aboveFired: false,
          belowFired: false,
          upPctFired: false,
          downPctFired: false,
          ratioAboveFired: false,
          ratioBelowFired: false,
        };

      if (item.alertAbove != null) {
        if (quote.price >= item.alertAbove && !state.aboveFired) {
          state.aboveFired = true;
          fireAlertNotification(item, `${quote.price} ${quote.currency} (hedef: ${item.alertAbove} uzeri)`);
        } else if (quote.price < item.alertAbove) {
          state.aboveFired = false;
        }
      }
      if (item.alertBelow != null) {
        if (quote.price <= item.alertBelow && !state.belowFired) {
          state.belowFired = true;
          fireAlertNotification(item, `${quote.price} ${quote.currency} (hedef: ${item.alertBelow} alti)`);
        } else if (quote.price > item.alertBelow) {
          state.belowFired = false;
        }
      }
      if (item.alertUpPercent != null && quote.changePercent != null) {
        if (quote.changePercent >= item.alertUpPercent && !state.upPctFired) {
          state.upPctFired = true;
          fireAlertNotification(item, `${formatAlertPct(quote.changePercent)} degisim (hedef: +%${item.alertUpPercent} artis)`);
        } else if (quote.changePercent < item.alertUpPercent) {
          state.upPctFired = false;
        }
      }
      if (item.alertDownPercent != null && quote.changePercent != null) {
        if (quote.changePercent <= -item.alertDownPercent && !state.downPctFired) {
          state.downPctFired = true;
          fireAlertNotification(item, `${formatAlertPct(quote.changePercent)} degisim (hedef: -%${item.alertDownPercent} azalis)`);
        } else if (quote.changePercent > -item.alertDownPercent) {
          state.downPctFired = false;
        }
      }
      if (item.alertRatioTargetId != null) {
        const targetItem = watchlist.find((i) => i.id === item.alertRatioTargetId);
        const targetQuote = latestQuotes.get(item.alertRatioTargetId);
        if (targetItem && targetQuote && !targetQuote.error && targetQuote.price !== 0) {
          const ratio = quote.price / targetQuote.price;
          if (item.alertRatioAbove != null) {
            if (ratio >= item.alertRatioAbove && !state.ratioAboveFired) {
              state.ratioAboveFired = true;
              fireAlertNotification(
                item,
                `Oran ${ratio.toFixed(4)} (hedef: ${item.label}/${targetItem.label} orani ${item.alertRatioAbove} uzeri)`
              );
            } else if (ratio < item.alertRatioAbove) {
              state.ratioAboveFired = false;
            }
          }
          if (item.alertRatioBelow != null) {
            if (ratio <= item.alertRatioBelow && !state.ratioBelowFired) {
              state.ratioBelowFired = true;
              fireAlertNotification(
                item,
                `Oran ${ratio.toFixed(4)} (hedef: ${item.label}/${targetItem.label} orani ${item.alertRatioBelow} alti)`
              );
            } else if (ratio > item.alertRatioBelow) {
              state.ratioBelowFired = false;
            }
          }
        }
      }
      alertState.set(item.id, state);
    }

    // Global rule: a single up/down percent threshold applied to every item,
    // independent of and in addition to any per-item alarms above.
    if (settings.globalAlert.enabled && quote.changePercent != null) {
      const gstate = globalAlertState.get(item.id) ?? { upFired: false, downFired: false };
      const { upPercent, downPercent } = settings.globalAlert;

      if (upPercent != null) {
        if (quote.changePercent >= upPercent && !gstate.upFired) {
          gstate.upFired = true;
          fireAlertNotification(item, `Genel alarm: ${formatAlertPct(quote.changePercent)} (esik: +%${upPercent})`);
        } else if (quote.changePercent < upPercent) {
          gstate.upFired = false;
        }
      }
      if (downPercent != null) {
        if (quote.changePercent <= -downPercent && !gstate.downFired) {
          gstate.downFired = true;
          fireAlertNotification(item, `Genel alarm: ${formatAlertPct(quote.changePercent)} (esik: -%${downPercent})`);
        } else if (quote.changePercent > -downPercent) {
          gstate.downFired = false;
        }
      }
      globalAlertState.set(item.id, gstate);
    }
  }
}

// ---- Quotes / sparkline refresh loops ----

async function refreshQuotes() {
  try {
    latestQuotes = await fetchQuotesForWatchlist(watchlist);
    checkAlerts();
    broadcastQuotes();
  } catch (err) {
    console.error('refreshQuotes failed', err);
  }
}

function startRefreshLoop() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshQuotes, Math.max(5, settings.refreshIntervalSec) * 1000);
}

async function refreshSparklines() {
  try {
    latestSparklines = await fetchSparklinesForWatchlist(watchlist);
    mainWindow?.webContents.send('sparklines-updated', Object.fromEntries(latestSparklines));
  } catch (err) {
    console.error('refreshSparklines failed', err);
  }
}

function startSparklineLoop() {
  if (sparklineTimer) clearInterval(sparklineTimer);
  sparklineTimer = setInterval(refreshSparklines, SPARKLINE_INTERVAL_MS);
}

// ---- Global hotkey (show/hide) ----

function registerHotkey() {
  globalShortcut.unregisterAll();
  if (settings.hotkeyEnabled) {
    globalShortcut.register(HOTKEY, () => toggleWindow());
  }
  if (settings.hudHotkeyEnabled) {
    globalShortcut.register(HUD_HOTKEY, () => toggleHud());
  }
}

// ---- Auto-update (GitHub Releases via electron-builder/electron-updater) ----

function installUpdateNow() {
  if (updateAutoInstallTimer) {
    clearTimeout(updateAutoInstallTimer);
    updateAutoInstallTimer = null;
  }
  autoUpdater.quitAndInstall();
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  // We handle installing ourselves (notify + short grace period, see below)
  // rather than the default "install silently on next quit" behavior, so a
  // long-running tray session actually gets updated without the user having
  // to know to quit the app first.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => broadcastUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    broadcastUpdateStatus({ state: 'available', version: info.version });
    autoUpdater.downloadUpdate();
  });
  autoUpdater.on('update-not-available', () => broadcastUpdateStatus({ state: 'not-available' }));
  autoUpdater.on('download-progress', (p) => broadcastUpdateStatus({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateStatus({ state: 'downloaded', version: info.version });

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Guncelleme hazir',
        body: `Piyasamatik.com ${info.version} indirildi. 60 saniye icinde otomatik olarak yuklenip yeniden baslatilacak. Hemen yuklemek icin tiklayin.`,
        icon: APP_ICON,
      });
      notif.on('click', () => installUpdateNow());
      notif.show();
    }

    if (updateAutoInstallTimer) clearTimeout(updateAutoInstallTimer);
    updateAutoInstallTimer = setTimeout(installUpdateNow, UPDATE_AUTO_INSTALL_DELAY_MS);
  });
  autoUpdater.on('error', (err) => broadcastUpdateStatus({ state: 'error', message: err.message }));
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    broadcastUpdateStatus({
      state: 'error',
      message: 'Gelistirme modunda guncelleme kontrolu yapilamaz (once "npm run pack" ile paketleyin)',
    });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    broadcastUpdateStatus({ state: 'error', message: err?.message ?? 'bilinmeyen hata' });
  }
}

function startUpdateCheckLoop() {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

app.whenReady().then(async () => {
  // Restore any signed-in session and pull cloud data before the first render,
  // so a returning user sees their synced watchlist/settings immediately.
  currentUser = await getCurrentUser();
  if (currentUser) {
    const cloud = await pullFromCloud(currentUser.id);
    if (cloud) {
      Object.assign(settings, cloud.settings);
      watchlist = cloud.watchlist;
      saveSettings(settings);
      saveWatchlist(watchlist);
    }
  }

  createMainWindow();
  applyTrayVisibility();
  reopenPersistedDetachedWindows();
  syncTickerWindow();
  refreshQuotes();
  startRefreshLoop();
  refreshSparklines();
  startSparklineLoop();
  registerHotkey();
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
  setupAutoUpdater();
  checkForUpdates();
  startUpdateCheckLoop();
});

app.on('window-all-closed', () => {
  // keep running in tray; do not quit on window close except explicit "Cikis"
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ---- IPC handlers ----

ipcMain.handle('watchlist:get', () => watchlist);

ipcMain.handle('watchlist:add', (_e, item: Omit<WatchlistItem, 'id'>) => {
  const newItem: WatchlistItem = { ...item, id: randomUUID() };
  watchlist.push(newItem);
  saveWatchlist(watchlist);
  broadcastWatchlist();
  scheduleCloudPush();
  refreshQuotes();
  refreshSparklines();
  return watchlist;
});

ipcMain.handle('watchlist:remove', (_e, id: string) => {
  watchlist = watchlist
    .filter((i) => i.id !== id)
    // Drop any dangling ratio-alarm reference some other item had pointing at the removed item.
    .map((i) => (i.alertRatioTargetId === id ? { ...i, alertRatioTargetId: undefined } : i));
  saveWatchlist(watchlist);
  closeItemWindow(id);
  closeChartWindow(id);
  alertState.delete(id);
  globalAlertState.delete(id);
  if (transactions.some((t) => t.itemId === id)) {
    transactions = transactions.filter((t) => t.itemId !== id);
    saveTransactions(transactions);
    broadcastTransactions();
  }
  broadcastWatchlist();
  scheduleCloudPush();
  return watchlist;
});

ipcMain.handle('watchlist:update', (_e, id: string, patch: Partial<WatchlistItem>) => {
  watchlist = watchlist.map((i) => (i.id === id ? { ...i, ...patch } : i));
  saveWatchlist(watchlist);
  broadcastWatchlist();
  scheduleCloudPush();
  return watchlist;
});

ipcMain.handle('watchlist:reorder', (_e, orderedIds: string[]) => {
  const byId = new Map(watchlist.map((i) => [i.id, i]));
  watchlist = orderedIds.map((id) => byId.get(id)).filter(Boolean) as WatchlistItem[];
  saveWatchlist(watchlist);
  broadcastWatchlist();
  scheduleCloudPush();
  return watchlist;
});

ipcMain.handle('lists:get', () => lists);

ipcMain.handle('lists:add', (_e, name: string) => {
  lists.push({ id: randomUUID(), name });
  saveLists(lists);
  broadcastLists();
  return lists;
});

ipcMain.handle('lists:rename', (_e, id: string, name: string) => {
  lists = lists.map((l) => (l.id === id ? { ...l, name } : l));
  saveLists(lists);
  broadcastLists();
  return lists;
});

ipcMain.handle('lists:remove', (_e, id: string) => {
  if (id === DEFAULT_LIST_ID || lists.length <= 1) return lists;
  lists = lists.filter((l) => l.id !== id);
  saveLists(lists);
  // Items in the removed list fall back to the default list rather than disappearing.
  watchlist = watchlist.map((i) => (i.listId === id ? { ...i, listId: DEFAULT_LIST_ID } : i));
  saveWatchlist(watchlist);
  broadcastLists();
  broadcastWatchlist();
  scheduleCloudPush();
  return lists;
});

ipcMain.handle('transactions:get', () => transactions);

ipcMain.handle('transactions:add', (_e, tx: Omit<Transaction, 'id'>) => {
  transactions.push({ ...tx, id: randomUUID() });
  saveTransactions(transactions);
  broadcastTransactions();
  return transactions;
});

ipcMain.handle('transactions:remove', (_e, id: string) => {
  transactions = transactions.filter((t) => t.id !== id);
  saveTransactions(transactions);
  broadcastTransactions();
  return transactions;
});

ipcMain.handle('search:query', async (_e, query: string) => {
  return searchAllProviders(query);
});

ipcMain.handle('quotes:refresh-now', async () => {
  await refreshQuotes();
});

ipcMain.handle('sparkline:get-all', () => Object.fromEntries(latestSparklines));

ipcMain.handle('convert:codes', () => getConvertibleCodes());

ipcMain.handle('convert:query', async (_e, amount: number, from: string, to: string) => {
  return convertAmount(amount, from, to);
});

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
  Object.assign(settings, patch);
  saveSettings(settings);
  if (patch.refreshIntervalSec) startRefreshLoop();
  if (typeof patch.launchAtStartup === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: patch.launchAtStartup });
  }
  if (typeof patch.hotkeyEnabled === 'boolean' || typeof patch.hudHotkeyEnabled === 'boolean') registerHotkey();
  if (typeof patch.showTrayIcon === 'boolean') applyTrayVisibility();
  if (typeof patch.trayMoodEnabled === 'boolean') applyTrayMood();
  if (typeof patch.mainAlwaysOnTopEnabled === 'boolean' || typeof patch.miniAlwaysOnTopEnabled === 'boolean') {
    applyAlwaysOnTop();
  }
  if (typeof patch.transparentEnabled === 'boolean' || typeof patch.windowOpacity === 'number') {
    applyTransparency();
  }
  if (patch.viewMode) syncTickerWindow();
  broadcastSettings();
  scheduleCloudPush();
  return settings;
});

ipcMain.handle('item:detach', (_e, id: string) => {
  const item = watchlist.find((i) => i.id === id);
  if (item) createItemWindow(item);
});

ipcMain.handle('item:attach', (_e, id: string) => {
  closeItemWindow(id);
});

ipcMain.handle('item:detached-ids', () => [...detachedWindows.keys()]);

ipcMain.handle('item:open-chart', (_e, id: string) => {
  const item = watchlist.find((i) => i.id === id);
  if (item) createChartWindow(item);
});

ipcMain.handle('chart:get-ranges', () => CHART_RANGES);

ipcMain.handle('chart:get-history', async (_e, id: string, rangeKey: string) => {
  const item = watchlist.find((i) => i.id === id);
  if (!item) return [];
  return fetchHistoryForItem(item, rangeKey);
});

ipcMain.handle('news:get', async (_e, force: boolean) => fetchMarketNews(force));
ipcMain.handle('news:open-link', (_e, url: string) => shell.openExternal(url));

ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('update:install', () => installUpdateNow());
ipcMain.handle('update:get-version', () => app.getVersion());

ipcMain.handle('auth:get-user', () => currentUser);

async function completeSignIn(user: AuthUser): Promise<void> {
  currentUser = user;
  try {
    const exists = await cloudRowExists(user.id);
    if (exists) {
      const cloud = await pullFromCloud(user.id);
      if (cloud) {
        Object.assign(settings, cloud.settings);
        watchlist = cloud.watchlist;
        saveSettings(settings);
        saveWatchlist(watchlist);
        broadcastSettings();
        broadcastWatchlist();
        refreshQuotes();
        refreshSparklines();
      }
    } else {
      await pushToCloud(user.id, settings, watchlist);
    }
  } catch (err) {
    console.error('post-login cloud sync failed', err);
  }
  broadcastAuth();
}

ipcMain.handle('auth:sign-in-google', async () => {
  const result = await signInWithGoogle();
  if (!result.user) return { error: result.error };
  await completeSignIn(result.user);
  return { user: currentUser };
});

ipcMain.handle('auth:sign-up-email', async (_e, email: string, password: string) => {
  const result = await signUpWithEmail(email, password);
  if (result.error) return { error: result.error };
  if (result.needsConfirmation) return { needsConfirmation: true };
  if (result.user) await completeSignIn(result.user);
  return { user: currentUser };
});

ipcMain.handle('auth:sign-in-email', async (_e, email: string, password: string) => {
  const result = await signInWithEmail(email, password);
  if (!result.user) return { error: result.error };
  await completeSignIn(result.user);
  return { user: currentUser };
});

ipcMain.handle('auth:sign-out', async () => {
  await signOut();
  currentUser = null;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  broadcastAuth();
});

ipcMain.handle('feedback:submit', (_e, message: string, email?: string) => submitFeedback(message, email));

ipcMain.handle('window:open-settings', (_e, focusItemId?: string) => createSettingsWindow(focusItemId));
ipcMain.handle('window:hide', () => mainWindow?.hide());
ipcMain.handle('window:set-declutter', (_e, enabled: boolean) => {
  mainDeclutterMode = enabled;
});
ipcMain.handle('window:set-windows-locked', (_e, locked: boolean) => {
  mainWindowsLocked = locked;
});
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:quit', () => app.quit());
ipcMain.handle('window:close-self', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

ipcMain.handle('window:context-menu', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  buildContextMenu(win).popup({ window: win });
});

ipcMain.handle('window:request-autofit', (e, width: number, height: number) => {
  if (!settings.autofitEnabled) return;
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  const [minW, minH] = win.getMinimumSize();
  const maxHeight = screen.getPrimaryDisplay().workAreaSize.height - 40;
  const clampedWidth = Math.max(minW, Math.round(width));
  const clampedHeight = Math.max(minH, Math.min(maxHeight, Math.round(height)));
  win.setContentSize(clampedWidth, clampedHeight);
});
