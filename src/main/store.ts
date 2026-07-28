import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { WatchlistItem } from './providers/types';

export type ViewMode = 'list' | 'compact' | 'grid';
export type ThemeMode = 'dark' | 'light';

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

export interface Settings {
  refreshIntervalSec: number;
  launchAtStartup: boolean;
  windowBounds: WindowRect;
  viewMode: ViewMode;
  themeMode: ThemeMode;
  magnetEnabled: boolean;
  hotkeyEnabled: boolean;
  // Presence of a key means that item's mini window should be open;
  // the value remembers its last position/size across restarts.
  detachedWindows: Record<string, WindowRect>;
}

const DEFAULT_SETTINGS: Settings = {
  refreshIntervalSec: 60,
  launchAtStartup: false,
  windowBounds: { width: 340, height: 520 },
  viewMode: 'list',
  themeMode: 'dark',
  magnetEnabled: true,
  hotkeyEnabled: true,
  detachedWindows: {},
};

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
