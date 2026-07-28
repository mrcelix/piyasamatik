import { contextBridge, ipcRenderer } from 'electron';
import type { WatchlistItem, Quote, SearchResult, HistoryPoint } from './providers/types';
import type { Settings, UpdateStatus } from './store';
import type { ConvertCode } from './providers/truncgil';
import type { ChartRange, NewsItem } from './providers';

const api = {
  getWatchlist: (): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:get'),
  addItem: (item: Omit<WatchlistItem, 'id'>): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:add', item),
  removeItem: (id: string): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:remove', id),
  updateItem: (id: string, patch: Partial<WatchlistItem>): Promise<WatchlistItem[]> =>
    ipcRenderer.invoke('watchlist:update', id, patch),
  reorder: (ids: string[]): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:reorder', ids),
  search: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('search:query', query),
  refreshNow: (): Promise<void> => ipcRenderer.invoke('quotes:refresh-now'),
  getSparklines: (): Promise<Record<string, number[]>> => ipcRenderer.invoke('sparkline:get-all'),
  getConvertibleCodes: (): Promise<ConvertCode[]> => ipcRenderer.invoke('convert:codes'),
  convert: (amount: number, from: string, to: string): Promise<number> =>
    ipcRenderer.invoke('convert:query', amount, from, to),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  detachItem: (id: string): Promise<void> => ipcRenderer.invoke('item:detach', id),
  attachItem: (id: string): Promise<void> => ipcRenderer.invoke('item:attach', id),
  getDetachedIds: (): Promise<string[]> => ipcRenderer.invoke('item:detached-ids'),
  openChart: (id: string): void => void ipcRenderer.invoke('item:open-chart', id),
  getChartRanges: (): Promise<ChartRange[]> => ipcRenderer.invoke('chart:get-ranges'),
  getHistory: (id: string, rangeKey: string): Promise<HistoryPoint[]> =>
    ipcRenderer.invoke('chart:get-history', id, rangeKey),
  getNews: (force = false): Promise<NewsItem[]> => ipcRenderer.invoke('news:get', force),
  openExternal: (url: string): void => void ipcRenderer.invoke('news:open-link', url),
  checkForUpdates: (): void => void ipcRenderer.invoke('update:check'),
  installUpdate: (): void => void ipcRenderer.invoke('update:install'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('update:get-version'),
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    ipcRenderer.on('update-status', (_e, status) => cb(status));
  },
  openSettings: (): void => void ipcRenderer.invoke('window:open-settings'),
  hideWindow: (): void => void ipcRenderer.invoke('window:hide'),
  minimizeWindow: (): void => void ipcRenderer.invoke('window:minimize'),
  quit: (): void => void ipcRenderer.invoke('window:quit'),
  closeSelf: (): void => void ipcRenderer.invoke('window:close-self'),
  onQuotesUpdated: (cb: (quotes: Record<string, Quote>) => void) => {
    ipcRenderer.on('quotes-updated', (_e, quotes) => cb(quotes));
  },
  onSparklinesUpdated: (cb: (sparklines: Record<string, number[]>) => void) => {
    ipcRenderer.on('sparklines-updated', (_e, sparklines) => cb(sparklines));
  },
  onWatchlistChanged: (cb: (watchlist: WatchlistItem[]) => void) => {
    ipcRenderer.on('watchlist-changed', (_e, watchlist) => cb(watchlist));
  },
  onSettingsChanged: (cb: (settings: Settings) => void) => {
    ipcRenderer.on('settings-changed', (_e, settings) => cb(settings));
  },
  onDetachedChanged: (cb: (ids: string[]) => void) => {
    ipcRenderer.on('detached-changed', (_e, ids) => cb(ids));
  },
};

export type MiniTakipApi = typeof api;

contextBridge.exposeInMainWorld('miniTakip', api);
