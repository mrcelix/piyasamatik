import { BrowserWindow, screen, Rectangle } from 'electron';
import type { Settings, WindowRect } from './store';

const SNAP_THRESHOLD = 16;
const MIN_VISIBLE_OVERLAP = 40;

/**
 * Returns saved bounds only if they'd still land at least partially on some
 * currently connected display; otherwise drops x/y so the caller falls back
 * to its own default placement (protects against a since-unplugged monitor).
 */
export function clampToVisibleDisplay(saved: WindowRect | undefined): WindowRect | undefined {
  if (!saved || saved.x == null || saved.y == null) return saved;
  const { x, y, width, height } = saved;
  const onScreen = screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    const overlapX = Math.min(x + width, wa.x + wa.width) - Math.max(x, wa.x);
    const overlapY = Math.min(y + height, wa.y + wa.height) - Math.max(y, wa.y);
    return overlapX >= MIN_VISIBLE_OVERLAP && overlapY >= MIN_VISIBLE_OVERLAP;
  });
  return onScreen ? saved : { width, height };
}

const managed = new Set<BrowserWindow>();

/**
 * Makes `win` snap to screen edges and to the edges of other registered
 * windows while being dragged, and keeps the snap-target registry in sync.
 * `getSettings` is read live (not captured once) so toggling the magnet
 * setting takes effect on windows already open.
 */
export function registerForSnapping(win: BrowserWindow, getSettings: () => Settings): void {
  managed.add(win);
  let snapping = false;

  win.on('move', () => {
    if (snapping) return;
    if (!getSettings().magnetEnabled) return;
    const bounds = win.getBounds();
    const snapped = computeSnap(win, bounds);
    if (snapped.x !== bounds.x || snapped.y !== bounds.y) {
      snapping = true;
      win.setBounds({ ...bounds, x: snapped.x, y: snapped.y });
      setImmediate(() => {
        snapping = false;
      });
    }
  });

  win.on('closed', () => {
    managed.delete(win);
  });
}

function computeSnap(current: BrowserWindow, bounds: Rectangle): { x: number; y: number } {
  let { x, y } = bounds;
  const { width, height } = bounds;

  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;

  if (Math.abs(x - wa.x) <= SNAP_THRESHOLD) x = wa.x;
  if (Math.abs(x + width - (wa.x + wa.width)) <= SNAP_THRESHOLD) x = wa.x + wa.width - width;
  if (Math.abs(y - wa.y) <= SNAP_THRESHOLD) y = wa.y;
  if (Math.abs(y + height - (wa.y + wa.height)) <= SNAP_THRESHOLD) y = wa.y + wa.height - height;

  for (const other of managed) {
    if (other === current || other.isDestroyed()) continue;
    const ob = other.getBounds();

    if (Math.abs(x - (ob.x + ob.width)) <= SNAP_THRESHOLD) x = ob.x + ob.width;
    if (Math.abs(x + width - ob.x) <= SNAP_THRESHOLD) x = ob.x - width;
    if (Math.abs(y - (ob.y + ob.height)) <= SNAP_THRESHOLD) y = ob.y + ob.height;
    if (Math.abs(y + height - ob.y) <= SNAP_THRESHOLD) y = ob.y - height;
  }

  return { x, y };
}
