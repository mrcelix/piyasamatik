import { app } from 'electron';
import { supabase } from './auth';

// Lightweight crash/error reporting: forwards unhandled errors from the main
// process, renderer processes, and renderer/GPU crashes to Supabase, reusing
// the same client/table pattern as submitFeedback() in auth.ts. Never throws
// itself (it's invoked from crash handlers, where a further exception would
// be silently swallowed by Node/Electron anyway) and never blocks the caller.

export type CrashSource = 'main' | 'renderer' | 'renderer-crash' | 'child-process';

// Caps total reports for one app run (a repeating error every tick shouldn't
// flood the table) and de-dupes identical messages from the same source.
const MAX_REPORTS_PER_RUN = 25;
const seen = new Set<string>();
let sentCount = 0;

// Mirrors Settings.crashReportingEnabled; kept as a plain module flag (rather
// than importing store.ts here) to avoid a main.ts <-> crashReporter.ts
// import cycle. main.ts calls this once at startup and again whenever the
// user changes the setting.
let enabled = true;
export function setCrashReportingEnabled(value: boolean): void {
  enabled = value;
}

export async function reportError(source: CrashSource, message: string, stack?: string, context?: string): Promise<void> {
  try {
    if (!enabled) return;
    const key = `${source}:${message}`;
    if (seen.has(key) || sentCount >= MAX_REPORTS_PER_RUN) return;
    seen.add(key);
    sentCount++;

    const { data } = await supabase.auth.getSession();
    await supabase.from('error_reports').insert({
      user_id: data.session?.user.id ?? null,
      source,
      message: message.slice(0, 2000),
      stack: stack ? stack.slice(0, 8000) : null,
      context: context ?? null,
      app_version: app.getVersion(),
      platform: process.platform,
    });
  } catch {
    // A broken network/table must not throw out of a crash handler.
  }
}

// Registered once, as early as possible in main.ts (before window creation),
// so it can catch errors during startup too. We deliberately do NOT let an
// uncaughtException take the process down: for a tray widget, staying alive
// in a possibly-degraded state beats vanishing outright, and Node only
// auto-exits on uncaughtException when nothing is listening for it.
export function installGlobalCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    void reportError('main', err.message, err.stack);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[unhandledRejection]', err);
    void reportError('main', err.message, err.stack);
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    if (details.reason === 'clean-exit') return;
    console.error('[render-process-gone]', details.reason, webContents.getURL());
    void reportError('renderer-crash', `render-process-gone: ${details.reason}`, undefined, webContents.getURL());
  });

  app.on('child-process-gone', (_event, details) => {
    console.error('[child-process-gone]', details.type, details.reason);
    void reportError('child-process', `${details.type} ${details.reason}`);
  });
}
