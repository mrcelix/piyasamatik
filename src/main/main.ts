import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, globalShortcut, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { loadSettings, saveSettings, loadWatchlist, saveWatchlist, Settings, UpdateStatus } from './store';
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
import { randomUUID } from 'crypto';

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const APP_ICON = path.join(ASSETS_DIR, 'icon.png');
const HOTKEY = 'CommandOrControl+Shift+M';
const SPARKLINE_INTERVAL_MS = 10 * 60 * 1000;

// Only one instance may own the userData files (watchlist.json/settings.json)
// at a time; a second launch just focuses the existing window and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const detachedWindows = new Map<string, BrowserWindow>();
const chartWindows = new Map<string, BrowserWindow>();

let tray: Tray | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let sparklineTimer: NodeJS.Timeout | null = null;
let latestQuotes = new Map<string, Quote>();
let latestSparklines = new Map<string, number[]>();
const alertState = new Map<string, { aboveFired: boolean; belowFired: boolean }>();

const settings: Settings = loadSettings();
let watchlist: WatchlistItem[] = loadWatchlist();

const commonWebPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
};

// ---- Broadcast helpers ----

function broadcastQuotes() {
  const payload = Object.fromEntries(latestQuotes);
  mainWindow?.webContents.send('quotes-updated', payload);
  for (const win of detachedWindows.values()) {
    win.webContents.send('quotes-updated', payload);
  }
}

function broadcastWatchlist() {
  mainWindow?.webContents.send('watchlist-changed', watchlist);
  settingsWindow?.webContents.send('watchlist-changed', watchlist);
}

function broadcastSettings() {
  mainWindow?.webContents.send('settings-changed', settings);
  settingsWindow?.webContents.send('settings-changed', settings);
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
    resizable: true,
    minWidth: 260,
    minHeight: 300,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });

  mainWindow.loadFile(path.join(RENDERER_DIR, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  registerForSnapping(mainWindow, () => settings);

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
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });

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

  const win = new BrowserWindow({
    width: 460,
    height: 360,
    frame: false,
    resizable: true,
    minWidth: 320,
    minHeight: 240,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });

  win.loadFile(path.join(RENDERER_DIR, 'chart.html'), { query: { itemId: item.id } });
  registerForSnapping(win, () => settings);

  win.on('closed', () => {
    chartWindows.delete(item.id);
  });

  chartWindows.set(item.id, win);
}

function closeChartWindow(id: string) {
  chartWindows.get(id)?.close();
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

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 380,
    height: 560,
    frame: false,
    resizable: true,
    minWidth: 320,
    minHeight: 400,
    icon: APP_ICON,
    webPreferences: commonWebPreferences,
  });
  settingsWindow.loadFile(path.join(RENDERER_DIR, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---- Tray ----

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Mini Takip');
  const menu = Menu.buildFromTemplate([
    { label: 'Goster/Gizle', click: () => toggleWindow() },
    { label: 'Ayarlar', click: () => createSettingsWindow() },
    { label: 'Simdi Yenile', click: () => refreshQuotes() },
    { type: 'separator' },
    { label: 'Cikis', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleWindow());
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
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

function checkAlerts() {
  for (const item of watchlist) {
    if (item.alertAbove == null && item.alertBelow == null) continue;
    const quote = latestQuotes.get(item.id);
    if (!quote || quote.error) continue;
    const state = alertState.get(item.id) ?? { aboveFired: false, belowFired: false };

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
    alertState.set(item.id, state);
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
  refreshTimer = setInterval(refreshQuotes, Math.max(15, settings.refreshIntervalSec) * 1000);
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
}

// ---- Auto-update (GitHub Releases via electron-builder/electron-updater) ----

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.on('checking-for-update', () => broadcastUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    broadcastUpdateStatus({ state: 'available', version: info.version });
    autoUpdater.downloadUpdate();
  });
  autoUpdater.on('update-not-available', () => broadcastUpdateStatus({ state: 'not-available' }));
  autoUpdater.on('download-progress', (p) => broadcastUpdateStatus({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => broadcastUpdateStatus({ state: 'downloaded', version: info.version }));
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

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  reopenPersistedDetachedWindows();
  refreshQuotes();
  startRefreshLoop();
  refreshSparklines();
  startSparklineLoop();
  registerHotkey();
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
  setupAutoUpdater();
  checkForUpdates();
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
  refreshQuotes();
  refreshSparklines();
  return watchlist;
});

ipcMain.handle('watchlist:remove', (_e, id: string) => {
  watchlist = watchlist.filter((i) => i.id !== id);
  saveWatchlist(watchlist);
  closeItemWindow(id);
  closeChartWindow(id);
  alertState.delete(id);
  broadcastWatchlist();
  return watchlist;
});

ipcMain.handle('watchlist:update', (_e, id: string, patch: Partial<WatchlistItem>) => {
  watchlist = watchlist.map((i) => (i.id === id ? { ...i, ...patch } : i));
  saveWatchlist(watchlist);
  broadcastWatchlist();
  return watchlist;
});

ipcMain.handle('watchlist:reorder', (_e, orderedIds: string[]) => {
  const byId = new Map(watchlist.map((i) => [i.id, i]));
  watchlist = orderedIds.map((id) => byId.get(id)).filter(Boolean) as WatchlistItem[];
  saveWatchlist(watchlist);
  broadcastWatchlist();
  return watchlist;
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
  if (typeof patch.hotkeyEnabled === 'boolean') registerHotkey();
  broadcastSettings();
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
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
ipcMain.handle('update:get-version', () => app.getVersion());

ipcMain.handle('window:open-settings', () => createSettingsWindow());
ipcMain.handle('window:hide', () => mainWindow?.hide());
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:quit', () => app.quit());
ipcMain.handle('window:close-self', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
