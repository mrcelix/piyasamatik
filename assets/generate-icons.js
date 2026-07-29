// Regenerates icon.png (1024x1024, used by electron-builder + the main window
// icon) and tray.png/tray@2x.png (32/64px) from icon-source.html.
// Run: npx electron assets/generate-icons.js
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const work = screen.getPrimaryDisplay().workAreaSize;
  // A window taller than the screen's work area gets silently clamped by
  // Windows, which would distort the square design (non-square viewport).
  // Pick a size guaranteed to fit and stay square.
  const size = Math.max(300, Math.min(work.width, work.height) - 60);

  const win = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
  });

  await win.loadFile(path.join(__dirname, 'icon-source.html'));
  await new Promise((r) => setTimeout(r, 400));

  const captured = await win.webContents.capturePage();
  const capSize = captured.getSize();
  if (capSize.width !== capSize.height) {
    throw new Error(`capture not square: ${capSize.width}x${capSize.height}`);
  }

  const master = captured.resize({ width: 1024, height: 1024, quality: 'best' });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), master.toPNG());
  fs.writeFileSync(path.join(__dirname, 'tray.png'), master.resize({ width: 32, height: 32, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(__dirname, 'tray@2x.png'), master.resize({ width: 64, height: 64, quality: 'best' }).toPNG());

  console.log('icons written to', __dirname);
  app.quit();
});
