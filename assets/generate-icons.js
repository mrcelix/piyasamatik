// Regenerates icon.png (1024x1024, used by electron-builder + the main window
// icon), tray.png/tray@2x.png (32/64px), and the green/red "mood" tray icon
// variants (tray-up/tray-down) from icon-source.html.
// Run: npx electron assets/generate-icons.js
//
// icon.png and the tray icons are rendered from the SAME source but in two
// different modes: the app icon keeps its rounded tile, the tray icons are
// rendered bare (?bare=1) on transparency. A tile of any one colour is
// invisible against some taskbar — a dark tile disappears on Windows' default
// dark taskbar at 16px. See the design notes in icon-source.html.
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Mood variants reuse the existing --up/--down accent colors from styles.css
// (kept in sync manually since this script has no CSS parser).
const VARIANTS = [
  { suffix: '', color: null }, // default blue, also used for icon.png
  { suffix: '-up', color: '37d67a' },
  { suffix: '-down', color: 'ff5d6c' },
];

app.whenReady().then(async () => {
  const work = screen.getPrimaryDisplay().workAreaSize;
  // A window taller than the screen's work area gets silently clamped by
  // Windows, which would distort the square design (non-square viewport).
  // Pick a size guaranteed to fit and stay square.
  const size = Math.max(300, Math.min(work.width, work.height) - 60);

  async function render(params) {
    const win = new BrowserWindow({
      width: size,
      height: size,
      useContentSize: true,
      frame: false,
      transparent: true,
      resizable: false,
      show: false,
    });

    const search = params.length ? `?${params.join('&')}` : '';
    await win.loadFile(path.join(__dirname, 'icon-source.html'), { search });
    await new Promise((r) => setTimeout(r, 400));

    const captured = await win.webContents.capturePage();
    const capSize = captured.getSize();
    if (capSize.width !== capSize.height) {
      throw new Error(`capture not square: ${capSize.width}x${capSize.height}`);
    }
    win.close();
    return captured.resize({ width: 1024, height: 1024, quality: 'best' });
  }

  // App icon: tiled, default accent only.
  const appMaster = await render([]);
  fs.writeFileSync(path.join(__dirname, 'icon.png'), appMaster.toPNG());

  // Tray icons: bare glyph on transparency, one per mood.
  for (const variant of VARIANTS) {
    const params = ['bare=1'];
    if (variant.color) params.push(`color=${variant.color}`);
    const master = await render(params);

    fs.writeFileSync(
      path.join(__dirname, `tray${variant.suffix}.png`),
      master.resize({ width: 32, height: 32, quality: 'best' }).toPNG()
    );
    fs.writeFileSync(
      path.join(__dirname, `tray${variant.suffix}@2x.png`),
      master.resize({ width: 64, height: 64, quality: 'best' }).toPNG()
    );
  }

  console.log('icons written to', __dirname);
  app.quit();
});
