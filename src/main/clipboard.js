'use strict';
/**
 * Multi-format clipboard writes (Electron's own clipboard API can't put several
 * custom-named formats on the clipboard at once, which PowerPoint/Affinity need).
 *
 *  - Windows: user32/kernel32 through koffi (prebuilt FFI, nothing to compile).
 *  - macOS:   NSPasteboard through a JavaScript-for-Automation script (osascript).
 *
 * writeFormats([{ format: 'image/svg+xml', data: Buffer }, ...])
 * writeFile(path)  -> puts a file on the clipboard (like Ctrl+C in Explorer/Finder)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// ------------------------------------------------------------------ Windows
let win = null;
function winApi() {
  if (win) return win;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  win = {
    OpenClipboard: user32.func('bool __stdcall OpenClipboard(void *hWnd)'),
    CloseClipboard: user32.func('bool __stdcall CloseClipboard()'),
    EmptyClipboard: user32.func('bool __stdcall EmptyClipboard()'),
    SetClipboardData: user32.func('void * __stdcall SetClipboardData(uint32_t fmt, void *hMem)'),
    RegisterClipboardFormatW: user32.func('uint32_t __stdcall RegisterClipboardFormatW(str16 name)'),
    GlobalAlloc: kernel32.func('void * __stdcall GlobalAlloc(uint32_t flags, size_t bytes)'),
    GlobalLock: kernel32.func('void * __stdcall GlobalLock(void *hMem)'),
    GlobalUnlock: kernel32.func('bool __stdcall GlobalUnlock(void *hMem)'),
    GlobalFree: kernel32.func('void * __stdcall GlobalFree(void *hMem)'),
    koffi,
  };
  return win;
}

const CF_HDROP = 15;
const GMEM_MOVEABLE = 0x0002;

function winFormatId(format) {
  if (typeof format === 'number') return format;
  return winApi().RegisterClipboardFormatW(format);
}

async function openClipboardWithRetry(api) {
  for (let i = 0; i < 25; i++) {
    if (api.OpenClipboard(null)) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('The clipboard is busy – try again.');
}

async function winWrite(items) {
  const api = winApi();
  await openClipboardWithRetry(api);
  try {
    api.EmptyClipboard();
    for (const { format, data } of items) {
      const h = api.GlobalAlloc(GMEM_MOVEABLE, data.length);
      if (!h) throw new Error('Out of memory');
      const p = api.GlobalLock(h);
      api.koffi.encode(p, 'uint8_t', Array.from(data), data.length);
      api.GlobalUnlock(h);
      if (!api.SetClipboardData(winFormatId(format), h)) api.GlobalFree(h);
    }
  } finally {
    api.CloseClipboard();
  }
}

function winDropFiles(paths) {
  // DROPFILES header (20 bytes, wide chars) + double-null-terminated UTF-16 list
  const header = Buffer.alloc(20);
  header.writeUInt32LE(20, 0);
  header.writeUInt32LE(1, 16); // fWide
  const list = Buffer.from(paths.map((p) => path.resolve(p) + '\0').join('') + '\0', 'utf16le');
  return Buffer.concat([header, list]);
}

// ------------------------------------------------------------------ macOS
function macWrite(items, filePaths = []) {
  // Write each blob to a temp file, then let JXA load them into the pasteboard.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxe-clip-'));
  const entries = items.map((it, i) => {
    const f = path.join(dir, `item${i}`);
    fs.writeFileSync(f, it.data);
    return { type: it.format, file: f };
  });
  const script = `
    ObjC.import('AppKit');
    function run(argv) {
      const spec = JSON.parse(argv[0]);
      const pb = $.NSPasteboard.generalPasteboard;
      pb.clearContents;
      if (spec.files.length) {
        const urls = $.NSMutableArray.array;
        spec.files.forEach(p => urls.addObject($.NSURL.fileURLWithPath(p)));
        pb.writeObjects(urls);
      }
      spec.entries.forEach(e => {
        const d = $.NSData.dataWithContentsOfFile(e.file);
        pb.setDataForType(d, e.type);
      });
      return 'ok';
    }`;
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script, JSON.stringify({ entries, files: filePaths })],
      (err) => {
        fs.rm(dir, { recursive: true, force: true }, () => {});
        err ? reject(err) : resolve();
      });
  });
}

// ------------------------------------------------------------------ public
async function writeFormats(items) {
  if (process.platform === 'win32') return winWrite(items);
  if (process.platform === 'darwin') return macWrite(items);
  throw new Error('Image clipboard export is only supported on Windows and macOS.');
}

async function writeFile(filePath, extra = []) {
  if (process.platform === 'win32') {
    const effect = Buffer.alloc(4);
    effect.writeUInt32LE(1, 0); // DROPEFFECT_COPY
    return winWrite([
      { format: CF_HDROP, data: winDropFiles([filePath]) },
      { format: 'Preferred DropEffect', data: effect },
      ...extra,
    ]);
  }
  if (process.platform === 'darwin') return macWrite(extra, [filePath]);
  throw new Error('Unsupported platform');
}

module.exports = { writeFormats, writeFile };
