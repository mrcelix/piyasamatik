// Forwards uncaught renderer errors to the main process (which relays them to
// Supabase via crashReporter.ts). Call once, as early as possible, from each
// renderer entry point (renderer.ts, settings.ts, chart.ts, mini.ts,
// ticker.ts, hud.ts) since each loads as an independent script context.
export function installErrorReporting(windowName: string): void {
  window.addEventListener('error', (event) => {
    window.miniTakip.reportError(event.message, event.error?.stack, windowName);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    window.miniTakip.reportError(message, stack, windowName);
  });
}
