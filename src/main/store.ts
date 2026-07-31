import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { WatchlistItem } from './providers/types';

export type ViewMode = 'list' | 'compact' | 'grid' | 'table' | 'ticker' | 'heatmap';
export type ThemeMode = 'dark' | 'light';
export type AccentTheme = 'blue' | 'gold' | 'green' | 'red' | 'purple';

export interface UpdateStatus {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

export interface WindowRect {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

// A single daily percent-change rule applied to every watchlist item at once,
// independent of any per-item price/percent alarms set via "Alarm".
export interface GlobalAlertSettings {
  enabled: boolean;
  upPercent?: number;
  downPercent?: number;
}

export interface Settings {
  refreshIntervalSec: number;
  launchAtStartup: boolean;
  windowBounds: WindowRect;
  viewMode: ViewMode;
  themeMode: ThemeMode;
  magnetEnabled: boolean;
  hotkeyEnabled: boolean;
  hudHotkeyEnabled: boolean;
  mainAlwaysOnTopEnabled: boolean;
  miniAlwaysOnTopEnabled: boolean;
  showTrayIcon: boolean;
  trayMoodEnabled: boolean;
  transparentEnabled: boolean;
  // 0.4-1: fraction of full opacity applied when transparentEnabled is on.
  windowOpacity: number;
  accentTheme: AccentTheme;
  autofitEnabled: boolean;
  gridShowCategory: boolean;
  globalAlert: GlobalAlertSettings;
  // Presence of a key means that item's mini window should be open;
  // the value remembers its last position/size across restarts.
  detachedWindows: Record<string, WindowRect>;
  settingsWindowBounds?: WindowRect;
  chartWindowBounds?: WindowRect;
  tickerWindowBounds?: WindowRect;
}

const DEFAULT_SETTINGS: Settings = {
  refreshIntervalSec: 30,
  launchAtStartup: false,
  // Wide enough for exactly 3 fixed 120px grid cards side by side (3*120 + 2*5
  // gaps + 10 #list padding = 380), plus a small buffer.
  windowBounds: { width: 390, height: 520 },
  viewMode: 'grid',
  themeMode: 'dark',
  magnetEnabled: true,
  hotkeyEnabled: true,
  hudHotkeyEnabled: true,
  mainAlwaysOnTopEnabled: true,
  miniAlwaysOnTopEnabled: true,
  showTrayIcon: true,
  trayMoodEnabled: true,
  transparentEnabled: false,
  windowOpacity: 0.88,
  accentTheme: 'blue',
  autofitEnabled: true,
  gridShowCategory: false,
  globalAlert: { enabled: false },
  detachedWindows: {},
};

export interface WatchlistList {
  id: string;
  name: string;
}

// A single buy/sell entry against a watchlist item, used to derive an
// average-cost position (quantity, cost basis) and realized P/L, as an
// alternative to manually typing a single quantity + average cost.
export interface Transaction {
  id: string;
  itemId: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: number; // epoch ms
  note?: string;
}

export const DEFAULT_LIST_ID = 'default';

const DEFAULT_LISTS: WatchlistList[] = [{ id: DEFAULT_LIST_ID, name: 'Izleme Listesi' }];

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { id: 'cur-usd', category: 'currency', symbol: 'USD', label: 'USD/TRY', currency: 'TRY' },
  { id: 'cur-eur', category: 'currency', symbol: 'EUR', label: 'EUR/TRY', currency: 'TRY' },
  { id: 'gold-gram', category: 'gold', symbol: 'gram-altin', label: 'Gram Altin', currency: 'TRY' },
  { id: 'gold-ceyrek', category: 'gold', symbol: 'ceyrek-altin', label: 'Ceyrek Altin', currency: 'TRY' },
  { id: 'gold-ons', category: 'gold', symbol: 'ons', label: 'Ons Altin', currency: 'USD' },
  { id: 'idx-xu100', category: 'index', symbol: 'XU100.IS', label: 'BIST 100', currency: 'TRY' },
  { id: 'idx-spx', category: 'index', symbol: '^GSPC', label: 'S&P 500', currency: 'USD' },
  { id: 'stock-aapl', category: 'stock', symbol: 'AAPL', label: 'Apple Inc.', currency: 'USD' },
  { id: 'stock-msft', category: 'stock', symbol: 'MSFT', label: 'Microsoft Corp.', currency: 'USD' },
  { id: 'crypto-btc', category: 'crypto', symbol: 'bitcoin', label: 'Bitcoin (BTC)', currency: 'USD' },
  { id: 'crypto-eth', category: 'crypto', symbol: 'ethereum', label: 'Ethereum (ETH)', currency: 'USD' },
];

function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadSettings(): Settings {
  return readJson(userDataFile('settings.json'), DEFAULT_SETTINGS);
}

export function saveSettings(settings: Settings): void {
  writeJson(userDataFile('settings.json'), settings);
}

export function loadWatchlist(): WatchlistItem[] {
  const file = userDataFile('watchlist.json');
  if (!fs.existsSync(file)) {
    writeJson(file, DEFAULT_WATCHLIST);
    return DEFAULT_WATCHLIST;
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as WatchlistItem[];
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function saveWatchlist(items: WatchlistItem[]): void {
  writeJson(userDataFile('watchlist.json'), items);
}

export function loadLists(): WatchlistList[] {
  const file = userDataFile('lists.json');
  if (!fs.existsSync(file)) {
    writeJson(file, DEFAULT_LISTS);
    return DEFAULT_LISTS;
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as WatchlistList[];
    return parsed.length > 0 ? parsed : DEFAULT_LISTS;
  } catch {
    return DEFAULT_LISTS;
  }
}

export function saveLists(lists: WatchlistList[]): void {
  writeJson(userDataFile('lists.json'), lists);
}

export function loadTransactions(): Transaction[] {
  const file = userDataFile('transactions.json');
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as Transaction[];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  writeJson(userDataFile('transactions.json'), transactions);
}
