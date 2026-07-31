import { contextBridge, ipcRenderer } from 'electron';
import type { WatchlistItem, Quote, SearchResult, HistoryPoint } from './providers/types';
import type { Settings, UpdateStatus, WatchlistList, Transaction } from './store';
import type { ConvertCode } from './providers/truncgil';
import type { ChartRange, NewsItem } from './providers';
import type { AuthUser } from './auth';

const api = {
  getWatchlist: (): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:get'),
  addItem: (item: Omit<WatchlistItem, 'id'>): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:add', item),
  removeItem: (id: string): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:remove', id),
  updateItem: (id: string, patch: Partial<WatchlistItem>): Promise<WatchlistItem[]> =>
    ipcRenderer.invoke('watchlist:update', id, patch),
  reorder: (ids: string[]): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:reorder', ids),
  getLists: (): Promise<WatchlistList[]> => ipcRenderer.invoke('lists:get'),
  addList: (name: string): Promise<WatchlistList[]> => ipcRenderer.invoke('lists:add', name),
  renameList: (id: string, name: string): Promise<WatchlistList[]> => ipcRenderer.invoke('lists:rename', id, name),
  removeList: (id: string): Promise<WatchlistList[]> => ipcRenderer.invoke('lists:remove', id),
  onListsChanged: (cb: (lists: WatchlistList[]) => void) => {
    ipcRenderer.on('lists-changed', (_e, lists) => cb(lists));
  },
  getTransactions: (): Promise<Transaction[]> => ipcRenderer.invoke('transactions:get'),
  addTransaction: (tx: Omit<Transaction, 'id'>): Promise<Transaction[]> => ipcRenderer.invoke('transactions:add', tx),
  removeTransaction: (id: string): Promise<Transaction[]> => ipcRenderer.invoke('transactions:remove', id),
  onTransactionsChanged: (cb: (transactions: Transaction[]) => void) => {
    ipcRenderer.on('transactions-changed', (_e, transactions) => cb(transactions));
  },
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
  openSettings: (focusItemId?: string): void => void ipcRenderer.invoke('window:open-settings', focusItemId),
  onFocusItem: (cb: (id: string) => void) => {
    ipcRenderer.on('focus-item', (_e, id) => cb(id));
  },
  hideWindow: (): void => void ipcRenderer.invoke('window:hide'),
  setDeclutterMode: (enabled: boolean): void => void ipcRenderer.invoke('window:set-declutter', enabled),
  onExitDeclutterMode: (cb: () => void) => {
    ipcRenderer.on('exit-declutter-mode', () => cb());
  },
  setWindowsLocked: (locked: boolean): void => void ipcRenderer.invoke('window:set-windows-locked', locked),
  onWindowsLockChanged: (cb: (locked: boolean) => void) => {
    ipcRenderer.on('windows-lock-changed', (_e, locked) => cb(locked));
  },
  minimizeWindow: (): void => void ipcRenderer.invoke('window:minimize'),
  quit: (): void => void ipcRenderer.invoke('window:quit'),
  closeSelf: (): void => void ipcRenderer.invoke('window:close-self'),
  showContextMenu: (): void => void ipcRenderer.invoke('window:context-menu'),
  requestAutofit: (width: number, height: number): void => void ipcRenderer.invoke('window:request-autofit', width, height),
  onMenuAction: (cb: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_e, action) => cb(action));
  },
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
  getAuthUser: (): Promise<AuthUser | null> => ipcRenderer.invoke('auth:get-user'),
  signInWithGoogle: (): Promise<{ user?: AuthUser; error?: string }> => ipcRenderer.invoke('auth:sign-in-google'),
  signUpWithEmail: (email: string, password: string): Promise<{ user?: AuthUser; needsConfirmation?: boolean; error?: string }> =>
    ipcRenderer.invoke('auth:sign-up-email', email, password),
  signInWithEmail: (email: string, password: string): Promise<{ user?: AuthUser; error?: string }> =>
    ipcRenderer.invoke('auth:sign-in-email', email, password),
  signOut: (): Promise<void> => ipcRenderer.invoke('auth:sign-out'),
  onAuthChanged: (cb: (user: AuthUser | null) => void) => {
    ipcRenderer.on('auth-changed', (_e, user) => cb(user));
  },
  submitFeedback: (message: string, email?: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke('feedback:submit', message, email),
};

export type MiniTakipApi = typeof api;

contextBridge.exposeInMainWorld('miniTakip', api);
