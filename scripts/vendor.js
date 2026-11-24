#!/usr/bin/env node
'use strict';
/**
 * Copies the parts of MathJax the app actually uses into src/vendor/, so the packaged app
 * doesn't ship whole npm packages (each font package also contains CHTML/woff, CJS and ESM
 * builds we never load). Runs automatically before `npm start` and `npm run dist`.
 *
 *   src/vendor/mathjax/            tex-svg-nofont.js + dynamically loaded TeX extensions
 *   src/vendor/fonts/<name>/       svg.js + svg/ dynamic data for each font (and mhchem)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'src', 'vendor');

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(out, { recursive: true, force: true });

// --- MathJax core: the combined TeX→SVG component plus what it loads on demand
const mj = path.join(nm, 'mathjax');
for (const f of ['tex-svg-nofont.js', 'package.json', 'LICENSE']) copy(path.join(mj, f), path.join(out, 'mathjax', f));
copy(path.join(mj, 'input'), path.join(out, 'mathjax', 'input'));
for (const d of ['output', 'adaptors', 'ui']) {
  if (fs.existsSync(path.join(mj, d))) copy(path.join(mj, d), path.join(out, 'mathjax', d));
}
// CommonHTML output is never used
fs.rmSync(path.join(out, 'mathjax', 'output', 'chtml'), { recursive: true, force: true });
fs.rmSync(path.join(out, 'mathjax', 'output', 'chtml.js'), { force: true });

// --- fonts and font extensions: SVG data only (keep in sync with FONTS in src/renderer/app.js)
const FONT_PACKAGES = [
  'mathjax-newcm-font',            // Computer Modern – LaTeX's default look
  'mathjax-pagella-font',          // Palatino – common for theses and books
  'mathjax-termes-font',           // Times – journal articles
  'mathjax-fira-font',             // Fira Sans – slides
  'mathjax-mhchem-font-extension', // glyphs for \ce{…}
];
const scope = path.join(nm, '@mathjax');
for (const pkg of FONT_PACKAGES) {
  const src = path.join(scope, pkg);
  const dst = path.join(out, 'fonts', pkg);
  for (const f of ['svg.js', 'package.json', 'LICENSE']) {
    if (fs.existsSync(path.join(src, f))) copy(path.join(src, f), path.join(dst, f));
  }
  if (fs.existsSync(path.join(src, 'svg'))) copy(path.join(src, 'svg'), path.join(dst, 'svg'));
}

// --- the app's own license, shown in Help → About & licenses (src/licenses holds the others)
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'src', 'licenses', 'TeXexpress-MIT.txt'));
// …and on the Windows installer's license page: NSIS needs a UTF-8 BOM, otherwise
// non-ASCII characters (the ï in the author's name) are read in the ANSI code page
fs.writeFileSync(path.join(root, 'build', 'license.txt'),
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(path.join(root, 'LICENSE'))]));

// report
let bytes = 0;
(function walk(p) {
  for (const f of fs.readdirSync(p)) {
    const q = path.join(p, f);
    const st = fs.statSync(q);
    st.isDirectory() ? walk(q) : (bytes += st.size);
  }
})(out);
console.log(`vendor: copied MathJax and fonts to src/vendor (${(bytes / 1e6).toFixed(1)} MB)`);
