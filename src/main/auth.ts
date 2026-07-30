import { app, safeStorage, shell } from 'electron';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type { Settings } from './store';
import type { WatchlistItem } from './providers/types';

// Public-by-design values (Supabase anon/publishable key is meant to live in client code;
// access is governed by Row Level Security policies on the database, not by key secrecy).
const SUPABASE_URL = 'https://bayvwzkajtohdwtvrkfr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_s-5gPVLhHcWCv_3PZ79FVA_bOTVlp7i';

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'auth-session.dat');
}

function readSessionStore(): Record<string, string> {
  try {
    const buf = fs.readFileSync(sessionFilePath());
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function writeSessionStore(store: Record<string, string>): void {
  const json = JSON.stringify(store);
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf-8');
  fs.mkdirSync(path.dirname(sessionFilePath()), { recursive: true });
  fs.writeFileSync(sessionFilePath(), data);
}

// supabase-js expects a browser-like storage API; Node has neither localStorage nor
// window, so we back it with an encrypted-at-rest file in userData.
const nodeStorage = {
  getItem: (key: string): string | null => readSessionStore()[key] ?? null,
  setItem: (key: string, value: string): void => {
    const store = readSessionStore();
    store[key] = value;
    writeSessionStore(store);
  },
  removeItem: (key: string): void => {
    const store = readSessionStore();
    delete store[key];
    writeSessionStore(store);
  },
};

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nodeStorage as any,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  // Electron's bundled Node has no native WebSocket; we don't use realtime
  // subscriptions (only auth + plain table reads/writes), but the client
  // constructor still needs a WebSocket-like constructor to be handed to it.
  realtime: {
    transport: WebSocket as any,
  },
});

export interface AuthUser {
  id: string;
  email: string | null;
}

function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getSession();
  return toAuthUser(data.session);
}

function startLoopbackServer(): Promise<{ port: number; waitForCode: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;
    const waitForCode = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const errorDescription = url.searchParams.get('error_description');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:80px">` +
          `<h2>${code ? 'Giris basarili. Bu sekmeyi kapatabilirsiniz.' : 'Giris basarisiz.'}</h2></body></html>`
      );
      setTimeout(() => server.close(), 500);
      if (code) resolveCode(code);
      else rejectCode(new Error(errorDescription ?? 'Google girisi iptal edildi'));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, waitForCode });
    });
  });
}

export async function signInWithGoogle(): Promise<{ user?: AuthUser; error?: string }> {
  try {
    const { port, waitForCode } = await startLoopbackServer();
    const redirectTo = `http://127.0.0.1:${port}/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? 'Giris baslatilamadi' };

    await shell.openExternal(data.url);

    const code = await Promise.race([
      waitForCode,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Zaman asimi (2 dakika)')), 120_000)),
    ]);

    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return { error: exchangeError.message };
    const user = toAuthUser(exchangeData.session);
    return user ? { user } : { error: 'Oturum olusturulamadi' };
  } catch (err: any) {
    return { error: err?.message ?? 'Bilinmeyen hata' };
  }
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ user?: AuthUser; needsConfirmation?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    const user = toAuthUser(data.session);
    // A null session (despite no error) means Supabase's "confirm email" setting
    // is on: the account was created but needs the emailed link before it can log in.
    if (!user) return { needsConfirmation: true };
    return { user };
  } catch (err: any) {
    return { error: err?.message ?? 'Bilinmeyen hata' };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<{ user?: AuthUser; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const user = toAuthUser(data.session);
    return user ? { user } : { error: 'Oturum olusturulamadi' };
  } catch (err: any) {
    return { error: err?.message ?? 'Bilinmeyen hata' };
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

interface CloudRow {
  settings: Settings;
  watchlist: WatchlistItem[];
}

export async function cloudRowExists(userId: string): Promise<boolean> {
  const { data } = await supabase.from('user_data').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

export async function pullFromCloud(userId: string): Promise<CloudRow | null> {
  const { data, error } = await supabase
    .from('user_data')
    .select('settings, watchlist')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { settings: data.settings as Settings, watchlist: data.watchlist as WatchlistItem[] };
}

export async function pushToCloud(userId: string, settings: Settings, watchlist: WatchlistItem[]): Promise<void> {
  await supabase.from('user_data').upsert({
    user_id: userId,
    settings,
    watchlist,
    updated_at: new Date().toISOString(),
  });
}

export async function submitFeedback(message: string, email?: string): Promise<{ error?: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    const { error } = await supabase.from('feedback').insert({
      user_id: data.session?.user.id ?? null,
      email: email || data.session?.user.email || null,
      message,
      app_version: app.getVersion(),
    });
    if (error) return { error: error.message };
    return {};
  } catch (err: any) {
    return { error: err?.message ?? 'Bilinmeyen hata' };
  }
}
