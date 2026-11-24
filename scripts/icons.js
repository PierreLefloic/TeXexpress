'use strict';
/**
 * Renders src/renderer/assets/icon.svg (the single icon source) into:
 *   build/icon.png  – 1024×1024 (macOS icon, window icon)
 *   build/icon.ico  – 16…256 px (Windows exe, installer, taskbar)
 * Run with:  npm run icons
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'src/renderer/assets/icon.svg'), 'utf8');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<html><body></body></html>');
  const render = (size) => w.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = ${size};
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        resolve(c.toDataURL('image/png').split(',')[1]);
      };
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    })`).then((b64) => Buffer.from(b64, 'base64'));

  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build/icon.png'), await render(1024));

  // ICO file made of PNG entries (supported since Windows Vista)
  const pngs = [];
  for (const s of SIZES) pngs.push({ s, data: await render(s) });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ s, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, o);
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([header, dir, ...pngs.map((p) => p.data)]));
  console.log(`icons: build/icon.png (1024) and build/icon.ico (${SIZES.join(', ')})`);
  app.quit();
});
