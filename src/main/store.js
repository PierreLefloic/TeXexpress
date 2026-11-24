'use strict';
// Tiny JSON settings/history store in the per-user app data folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  font: 'mathjax-pagella',
  size: 20,
  color: '#000000',
  bold: false,
  mode: 'display',
  padding: 1,
  macros: '% Your own macros, one per line, e.g.\n% \\newcommand{\\R}{\\mathbb{R}}\n',
  pngDpi: 600,
  affinityPpi: 0,
  previewBg: 'light',
  zoom: 'fit',
  onTop: false,
  theme: 'system',
  editorText: 'I(V) = I_\\text{s} \\tanh \\left(\\frac{qV}{2kT}\\right)',
  history: [],
  recentColors: [],
  lastDir: '',
  bounds: null,
  maximized: false,
  seenWelcome: false,
};

let data = null;
let timer = null;

/** The app used to be called "LaTeX Exporter": bring its settings and history along once. */
function migrateFromOldName() {
  if (fs.existsSync(FILE) || process.env.LXE_SHOT) return; // not in automated test runs
  for (const old of ['LaTeX Exporter', 'latex-exporter']) {
    const f = path.join(app.getPath('appData'), old, 'settings.json');
    if (fs.existsSync(f)) {
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.copyFileSync(f, FILE);
      } catch (e) {
        console.error('Could not migrate old settings', e);
      }
      return;
    }
  }
}

function load() {
  migrateFromOldName();
  try {
    data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    data = { ...DEFAULTS };
  }
  return data;
}

function get() { return data || load(); }

function set(patch) {
  Object.assign(get(), patch);
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}

function flush() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('Could not save settings', e);
  }
}

app.on('before-quit', flush);

module.exports = { get, set, flush, DEFAULTS, FILE };
