'use strict';
const { app, BrowserWindow, ipcMain, dialog, nativeImage, clipboard, Menu, shell, nativeTheme } =
  require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Automated test runs (LXE_SHOT) use their own data folder and may run next to the real app.
const TEST_MODE = !!process.env.LXE_SHOT;
if (TEST_MODE) app.setPath('userData', path.join(os.tmpdir(), 'texexpress-test-profile'));

const clip = require('./clipboard');
const store = require('./store');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
let win = null;

if (!TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

// ------------------------------------------------------------------ window
function createWindow() {
  const s = store.get();
  const b = s.bounds || { width: 1180, height: 780 };
  win = new BrowserWindow({
    ...b,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'TeXexpress',
    backgroundColor: themeBackground(s.theme),
    titleBarStyle: 'hidden',
    titleBarOverlay: isWin ? overlayColors(s.theme) : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(!!s.onTop);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => { if (s.maximized) win.maximize(); win.show(); });

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    store.set({ maximized: win.isMaximized(), ...(win.isMaximized() || win.isMinimized() ? {} : { bounds: win.getBounds() }) });
  };
  win.on('resize', debounce(saveBounds, 400));
  win.on('move', debounce(saveBounds, 400));
  win.on('close', saveBounds);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.LXE_SHOT) devScreenshots();
}

/** Development helper: LXE_SHOT=out.png [LXE_STEPS=steps.json] runs scripted steps and saves screenshots. */
async function devScreenshots() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg));
  win.webContents.on('render-process-gone', (_e, d) => console.log('[gone]', JSON.stringify(d)));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await wait(2500);
  let steps = [];
  if (process.env.LXE_STEPS) steps = JSON.parse(fs.readFileSync(process.env.LXE_STEPS, 'utf8'));
  for (const st of steps) {
    if (st.js) {
      try { const r = await win.webContents.executeJavaScript(st.js); if (r !== undefined) console.log('[step]', JSON.stringify(r)); }
      catch (e) { console.log('[step error]', e.message); }
    }
    if (st.size) { win.unmaximize(); win.setContentSize(st.size[0], st.size[1]); await wait(400); }
    if (st.wait) await wait(st.wait);
    if (st.shot) fs.writeFileSync(st.shot, (await win.webContents.capturePage()).toPNG());
  }
  fs.writeFileSync(process.env.LXE_SHOT, (await win.webContents.capturePage()).toPNG());
  app.exit(0);
}

function themeIsDark(theme) {
  return theme === 'dark' || (theme !== 'light' && nativeTheme.shouldUseDarkColors);
}
function themeBackground(theme) { return themeIsDark(theme) ? '#16181D' : '#F4F5F7'; }
function overlayColors(theme) {
  return themeIsDark(theme)
    ? { color: '#16181D', symbolColor: '#C9CED6', height: 44 }
    : { color: '#F4F5F7', symbolColor: '#3B4250', height: 44 };
}

function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ------------------------------------------------------------------ menu
function buildMenu() {
  if (!isMac) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (!isMac) app.quit(); });

// ------------------------------------------------------------------ helpers
const TMP = path.join(os.tmpdir(), 'texexpress');
fs.mkdirSync(TMP, { recursive: true });

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(TMP, 'x-'));
  return path.join(dir, name);
}

function cleanupTmp() {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const d of fs.readdirSync(TMP)) {
    const p = path.join(TMP, d);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }
}
cleanupTmp();

/** Vector PDF of an SVG, page = exact SVG size (via Chromium's PDF printer). */
async function svgToPdf(svg, widthPt, heightPt) {
  const body = svg.replace(/^<\?xml[^>]*>\s*/, '');
  // Chromium rounds the page to whole CSS pixels (0.75 pt); round up so nothing is clipped
  const up = (pt) => Math.ceil((pt * 4) / 3 - 1e-6) * 0.75;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${up(widthPt)}pt ${up(heightPt)}pt; margin: 0 }
    html, body { margin: 0; padding: 0; background: transparent }
    svg { display: block; width: ${widthPt}pt; height: ${heightPt}pt }
  </style></head><body>${body}</body></html>`;
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return await w.webContents.printToPDF({
      preferCSSPageSize: true, printBackground: false, margins: { marginType: 'none' },
    });
  } finally {
    w.destroy();
  }
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('store:get', () => store.get());
ipcMain.handle('store:set', (_e, patch) => { store.set(patch); return true; });

ipcMain.handle('app:info', () => ({
  platform: process.platform, version: app.getVersion(), dark: nativeTheme.shouldUseDarkColors,
}));

ipcMain.handle('win:onTop', (_e, on) => { win?.setAlwaysOnTop(!!on); store.set({ onTop: !!on }); });
ipcMain.handle('win:theme', (_e, theme) => {
  nativeTheme.themeSource = theme === 'light' || theme === 'dark' ? theme : 'system';
  if (isWin && win) win.setTitleBarOverlay(overlayColors(theme));
  win?.setBackgroundColor(themeBackground(theme));
  return themeIsDark(theme);
});
nativeTheme.on('updated', () => {
  win?.webContents.send('theme:system', nativeTheme.shouldUseDarkColors);
  const t = store.get().theme;
  if (isWin && win && (!t || t === 'system')) win.setTitleBarOverlay(overlayColors(t));
});

/**
 * Copy SVG. PowerPoint/Office read "image/svg+xml" (and honour pt units). Affinity reads
 * "image/x-inkscape-svg" / "Scalable Vector Graphics" and gets a variant whose content
 * is wrapped in a nested <svg> so it pastes as a single group.
 */
ipcMain.handle('copy:svg', async (_e, { svg, affinitySvg }) => {
  const ppt = Buffer.from(svg, 'utf8');
  const aff = Buffer.from(affinitySvg, 'utf8');
  if (isWin) {
    await clip.writeFormats([
      { format: 'image/svg+xml', data: ppt },
      { format: 'image/x-inkscape-svg', data: aff },
      { format: 'Scalable Vector Graphics', data: aff },
    ]);
  } else if (isMac) {
    await clip.writeFormats([
      { format: 'public.svg-image', data: ppt },
      { format: 'image/svg+xml', data: ppt },
      { format: 'image/x-inkscape-svg', data: aff },
      { format: 'Scalable Vector Graphics', data: aff },
    ]);
  } else {
    clipboard.writeText(svg);
  }
  return true;
});

ipcMain.handle('copy:pdf', async (_e, { svg, widthPt, heightPt, name }) => {
  const pdf = await svgToPdf(svg, widthPt, heightPt);
  const file = tmpFile(`${name || 'equation'}.pdf`);
  fs.writeFileSync(file, pdf);
  await clip.writeFile(file, [{ format: isMac ? 'com.adobe.pdf' : 'Portable Document Format', data: pdf }]);
  return true;
});

ipcMain.handle('copy:png', async (_e, { png }) => {
  const buf = Buffer.from(png);
  if (isWin) {
    // "PNG" keeps transparency (Office, Affinity…); CF_DIB is the plain-bitmap fallback
    const img = nativeImage.createFromBuffer(buf);
    const bmp = img.toBitmap(); // BGRA
    const { width, height } = img.getSize();
    await clip.writeFormats([
      { format: 'PNG', data: buf },
      { format: 8 /* CF_DIB */, data: dibFromBGRA(bmp, width, height) },
    ]);
  } else {
    clipboard.writeImage(nativeImage.createFromBuffer(buf));
  }
  return true;
});

function dibFromBGRA(bgra, w, h) {
  // 32-bit BI_RGB bottom-up DIB, composited on white (most apps ignore DIB alpha)
  const header = Buffer.alloc(40);
  header.writeInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(h, 8);
  header.writeInt16LE(1, 12);
  header.writeInt16LE(32, 14);
  header.writeInt32LE(0, 16);
  header.writeInt32LE(w * h * 4, 20);
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4, dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = bgra[src + x + 3] / 255;
      px[dst + x] = Math.round(bgra[src + x] * a + 255 * (1 - a));
      px[dst + x + 1] = Math.round(bgra[src + x + 1] * a + 255 * (1 - a));
      px[dst + x + 2] = Math.round(bgra[src + x + 2] * a + 255 * (1 - a));
      px[dst + x + 3] = 255;
    }
  }
  return Buffer.concat([header, px]);
}

ipcMain.handle('save', async (_e, { kind, name, svg, widthPt, heightPt, png }) => {
  const s = store.get();
  const filters = { svg: [{ name: 'SVG image', extensions: ['svg'] }],
                    pdf: [{ name: 'PDF document', extensions: ['pdf'] }],
                    png: [{ name: 'PNG image', extensions: ['png'] }] }[kind];
  const res = await dialog.showSaveDialog(win, {
    title: `Save ${kind.toUpperCase()}`,
    defaultPath: path.join(s.lastDir || app.getPath('documents'), `${name}.${kind}`),
    filters,
  });
  if (res.canceled || !res.filePath) return null;
  let data;
  if (kind === 'svg') data = Buffer.from(svg, 'utf8');
  else if (kind === 'pdf') data = await svgToPdf(svg, widthPt, heightPt);
  else data = Buffer.from(png);
  fs.writeFileSync(res.filePath, data);
  store.set({ lastDir: path.dirname(res.filePath) });
  return path.basename(res.filePath);
});

// Drag the equation out of the window as an .svg file (sync: must start inside the event)
ipcMain.on('drag:start', (e, { svg, name, iconPng }) => {
  try {
    const file = tmpFile(`${name || 'equation'}.svg`);
    fs.writeFileSync(file, svg, 'utf8');
    let icon = iconPng ? nativeImage.createFromBuffer(Buffer.from(iconPng)) : nativeImage.createEmpty();
    if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, '../../build/icon.png')).resize({ width: 48 });
    e.sender.startDrag({ file, icon });
  } catch (err) {
    console.error(err);
  }
});

ipcMain.handle('open:external', (_e, url) => shell.openExternal(url));

// License texts shown in Help → About & licenses (only files from src/licenses)
ipcMain.handle('license:read', (_e, name) => {
  if (!/^[A-Za-z0-9._-]+\.txt$/.test(name)) throw new Error('Invalid license name');
  return fs.readFileSync(path.join(__dirname, '../licenses', name), 'utf8');
});
