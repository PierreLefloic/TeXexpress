'use strict';
/* global UI, Icons, Latex, SvgTools, ColorPicker, api */
const { $ } = UI;

// A short list of fonts, each with a reason to pick it (keep in sync with scripts/vendor.js)
const FONTS = [
  { id: 'mathjax-newcm', label: 'Computer Modern', note: 'LaTeX default' },
  { id: 'mathjax-pagella', label: 'Palatino', note: 'theses & books' },
  { id: 'mathjax-termes', label: 'Times', note: 'journal articles' },
  { id: 'mathjax-fira', label: 'Fira Sans', note: 'slides' },
];
const ZOOMS = ['fit', 50, 100, 150, 200, 300, 400];
const isMac = navigator.userAgent.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl';

let S = null;          // persisted settings
let R = null;          // last successful render: { key, src, built, name, iconPng }
let lastError = null;
let renderTimer = null;
let renderSeq = 0;

const save = (patch) => { Object.assign(S, patch); api.setStore(patch); };

// =============================================================== MathJax frames
const frames = {};
const pending = new Map();
let msgId = 0;
window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'mj-ready' && frames[d.font]) frames[d.font].resolve();
  if (d.type === 'rendered' && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
});
function frameFor(font) {
  if (frames[font]) return frames[font];
  const f = document.createElement('iframe');
  f.src = `mathjax-frame.html?font=${encodeURIComponent(font)}`;
  let resolve;
  const ready = new Promise((r) => { resolve = r; });
  frames[font] = { el: f, ready, resolve };
  $('#mathjax-frames').appendChild(f);
  return frames[font];
}
async function texToSvg(font, tex, display) {
  const fr = frameFor(font);
  await fr.ready;
  const id = ++msgId;
  return new Promise((res) => {
    pending.set(id, res);
    fr.el.contentWindow.postMessage({ type: 'render', id, tex, display }, '*');
  });
}

// =============================================================== rendering
function source() { return $('#editor-input').value; }

function prepared(src) {
  const macros = (S.macros || '').split('\n').map((l) => l.replace(/(^|[^\\])%.*$/, '$1')).join('\n').trim();
  // drop invisible control characters (they would make the SVG invalid)
  const clean = src.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  let tex = Latex.expandUnits(Latex.stripDelimiters(clean));
  if (S.bold) tex = `\\boldsymbol{${tex}}`; // bold letters, digits, Greek and operators
  return (macros ? macros + '\n' : '') + tex;
}

function renderKey() {
  return JSON.stringify([source(), S.font, S.size, S.color, S.mode, S.padding, S.macros, !!S.bold]);
}

function scheduleRender(delay = 220) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, delay);
}

async function renderNow() {
  clearTimeout(renderTimer);
  const key = renderKey();
  if (R && R.key === key && !lastError) return true;
  const src = source();
  if (!src.trim()) { R = null; lastError = null; showEmpty(); return false; }
  const seq = ++renderSeq;
  const t0 = performance.now();
  if (!frames[S.font]) setStatus('Loading font…', 'busy');
  const res = await texToSvg(S.font, prepared(src), S.mode === 'display');
  if (seq !== renderSeq) return renderKey() === key ? !!R : false; // superseded
  if (res.error) {
    lastError = res.error;
    showError(res.error);
    return false;
  }
  let built;
  try {
    built = SvgTools.build(res.svg, { size: S.size, color: S.color, padding: S.padding });
  } catch (e) {
    lastError = e.message;
    showError(e.message);
    return false;
  }
  lastError = null;
  R = { key, src, built, name: Latex.slug(src), iconPng: null };
  showPreview();
  const dt = performance.now() - t0;
  setStatus(dt > 60 ? `Rendered in ${(dt / 1000).toFixed(1)} s` : 'Ready', 'ok');
  // small drag image, prepared in the background
  SvgTools.toPng(built.svg, built.widthPt, built.heightPt, 72 * Math.min(2, 160 / Math.max(built.widthPt, 1)))
    .then((b) => b.arrayBuffer()).then((ab) => { if (R && R.key === key) R.iconPng = new Uint8Array(ab); }).catch(() => {});
  return true;
}

// =============================================================== preview
const preview = $('#preview');
const previewInner = $('#preview-inner');
const ta = $('#editor-input');
const hl = $('#editor-hl');

function showEmpty() {
  previewInner.innerHTML = '';
  preview.classList.add('empty');
  preview.classList.remove('stale');
  $('#preview-size').textContent = '';
  $('#editor-card').classList.remove('error');
  setStatus('Type an equation to start', '');
}

function showError(msg) {
  preview.classList.add('stale');
  preview.classList.toggle('empty', !R);
  $('#preview-error').textContent = msg;
  $('#editor-card').classList.add('error');
  setStatus(msg, 'err');
}

function showPreview() {
  preview.classList.remove('empty', 'stale');
  $('#editor-card').classList.remove('error');
  const b = R.built;
  previewInner.innerHTML = b.previewSvg;
  previewInner.appendChild(hlBox);
  buildSourceMap();
  const mm = 25.4 / 72;
  $('#preview-size').textContent =
    `${b.widthPt.toFixed(1)} × ${b.heightPt.toFixed(1)} pt · ${(b.widthPt * mm).toFixed(1)} × ${(b.heightPt * mm).toFixed(1)} mm`;
  applyZoom();
}

function applyZoom() {
  const svg = previewInner.querySelector('svg');
  if (!svg || !R) return;
  const pxPerPt = 96 / 72;
  let k;
  if (S.zoom === 'fit') {
    const pad = 48;
    const fit = Math.min((preview.clientWidth - pad) / (R.built.widthPt * pxPerPt),
                         (preview.clientHeight - pad) / (R.built.heightPt * pxPerPt));
    k = Math.max(0.1, Math.min(fit, 4));
  } else {
    k = S.zoom / 100;
  }
  svg.style.width = R.built.widthPt * pxPerPt * k + 'px';
  svg.style.height = R.built.heightPt * pxPerPt * k + 'px';
  $('#sel-zoom .select-value').textContent = S.zoom === 'fit' ? `Fit · ${Math.round(k * 100)}%` : `${S.zoom}%`;
}
new ResizeObserver(() => applyZoom()).observe(preview);

preview.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const steps = ZOOMS.filter((z) => z !== 'fit');
  let cur = S.zoom === 'fit' ? 100 : S.zoom;
  let i = steps.indexOf(cur);
  if (i < 0) i = 2;
  i = Math.max(0, Math.min(steps.length - 1, i + (e.deltaY < 0 ? 1 : -1)));
  save({ zoom: steps[i] });
  applyZoom();
}, { passive: false });

// =============================================================== preview ⇄ editor links
// Every part of MathJax's output carries the LaTeX it came from (data-latex). We locate those
// snippets in the editor text, left to right, so hovering one side highlights the other.
const hlBox = document.createElement('div');
hlBox.className = 'hl-box';
let parts = [];          // [{ el, start, end }] for the current preview
let hoverPart = null;

function buildSourceMap() {
  parts = [];
  hoverPart = null;
  const svg = previewInner.querySelector('svg');
  if (!svg || !R) return;
  const text = R.src;
  const childrenOf = (el) => [...el.querySelectorAll('[data-latex]')]
    .filter((c) => c.parentElement.closest('[data-latex]') === el);
  function assign(el, lo, hi) {
    let pos = lo;
    for (const c of childrenOf(el)) {
      const tex = (c.getAttribute('data-latex') || '').trim();
      let start = -1;
      if (tex) {
        start = text.indexOf(tex, pos);
        if (start < 0 || start + tex.length > hi) start = text.indexOf(tex, lo); // out-of-order children (x_i^2)
        if (start >= 0 && start + tex.length > hi) start = -1;
      }
      if (start >= 0) {
        const end = start + tex.length;
        if (c.getAttribute('data-mml-node') !== 'mrow' || end - start < hi - lo) parts.push({ el: c, start, end });
        pos = Math.max(pos, end);
        assign(c, start, end);
      } else {
        assign(c, pos, hi);
      }
    }
  }
  const root = svg.querySelector('[data-mml-node="math"]') || svg;
  assign(root, 0, text.length);
}

function partAtPoint(x, y) {
  let best = null, bestArea = Infinity;
  for (const p of parts) {
    const r = p.el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const m = 2; // a little tolerance around thin glyphs
    if (x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m) {
      const a = r.width * r.height;
      if (a < bestArea) { best = p; bestArea = a; }
    }
  }
  return best;
}

function partAtIndex(i) {
  let best = null;
  for (const p of parts) {
    if (i >= p.start && i < p.end && (!best || p.end - p.start < best.end - best.start)) best = p;
  }
  return best;
}

function showLink(p) {
  if (p === hoverPart) return;
  hoverPart = p;
  if (!p) {
    hlBox.classList.remove('show');
    preview.classList.remove('linking');
    hl.innerHTML = Latex.highlight(ta.value);
    return;
  }
  const r = p.el.getBoundingClientRect(), o = previewInner.getBoundingClientRect();
  const pad = 3;
  Object.assign(hlBox.style, {
    left: r.left - o.left - pad + 'px', top: r.top - o.top - pad + 'px',
    width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px',
  });
  hlBox.classList.add('show');
  preview.classList.add('linking');
  hl.innerHTML = Latex.highlight(ta.value, p.start, p.end);
}

const linksActive = () => R && !lastError && renderKey() === R.key && parts.length;

// hover the preview → highlight the LaTeX
let rafPending = false;
preview.addEventListener('mousemove', (e) => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (dragFrom) return;
    showLink(linksActive() ? partAtPoint(e.clientX, e.clientY) : null);
  });
});
preview.addEventListener('mouseleave', () => showLink(null));

// hover the editor → highlight the preview
ta.addEventListener('mousemove', (e) => {
  if (!linksActive() || e.buttons) return;
  const i = textIndexAt(e.clientX, e.clientY);
  showLink(i == null ? null : partAtIndex(i));
});
ta.addEventListener('mouseleave', () => showLink(null));
ta.addEventListener('input', () => showLink(null));

/** Character index under the mouse in the editor (via the highlight overlay's text). */
function textIndexAt(x, y) {
  ta.style.pointerEvents = 'none';
  const range = document.caretRangeFromPoint(x, y);
  ta.style.pointerEvents = '';
  if (!range || !hl.contains(range.startContainer)) return null;
  // ignore positions past the end of a line (empty space to the right)
  const pre = document.createRange();
  pre.setStart(hl, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const i = pre.toString().length;
  const rects = range.getClientRects();
  if (rects.length && Math.abs(rects[0].left - x) > 14) return null;
  return i < ta.value.length ? i : null;
}

// drag the equation out as a file; a simple click selects the LaTeX of the part under the mouse
let dragFrom = null;
preview.addEventListener('mousedown', (e) => { if (e.button === 0 && R && !lastError) dragFrom = [e.clientX, e.clientY]; });
preview.addEventListener('mousemove', (e) => {
  if (!dragFrom || !(e.buttons & 1)) { dragFrom = null; return; }
  if (Math.hypot(e.clientX - dragFrom[0], e.clientY - dragFrom[1]) < 6) return;
  dragFrom = null;
  showLink(null);
  api.startDrag({ svg: R.built.svg, name: R.name, iconPng: R.iconPng });
  remember();
});
preview.addEventListener('mouseup', (e) => {
  if (!dragFrom) return;
  dragFrom = null;
  const p = linksActive() ? partAtPoint(e.clientX, e.clientY) : null;
  if (!p) return;
  ta.focus();
  ta.setSelectionRange(p.start, p.end);
  // scroll the selection into view inside the editor
  const before = ta.value.slice(0, p.start).split('\n').length - 1;
  ta.scrollTop = Math.max(0, before * parseFloat(getComputedStyle(ta).lineHeight) - ta.clientHeight / 3);
});

// =============================================================== status
function setStatus(text, kind) {
  const el = $('#status');
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
  el.title = text || '';
}

// =============================================================== exports
async function ready() {
  const ok = await renderNow();
  if (!ok || lastError || !R) {
    if (lastError) setStatus('Fix the LaTeX error first: ' + lastError, 'err');
    flashError();
    return false;
  }
  return true;
}
function flashError() {
  const c = $('#editor-card');
  c.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
    { transform: 'translateX(0)' }], { duration: 220 });
}
function done(msg) {
  preview.classList.remove('flash');
  void preview.offsetWidth;
  preview.classList.add('flash');
  UI.toast(msg);
  setStatus(msg, 'ok');
  remember();
}
async function guard(fn) {
  try { await fn(); } catch (e) { setStatus(String(e.message || e), 'err'); }
}

function copySvg() {
  return guard(async () => {
    if (!(await ready())) return;
    const scale = S.affinityPpi ? S.affinityPpi / 72 : 1;
    await api.copySvg({ svg: R.built.svg, affinitySvg: SvgTools.affinityVariant(R.built, R.name, scale) });
    done(`SVG copied · paste with ${MOD}+V`);
  });
}
function copyPdf() {
  return guard(async () => {
    if (!(await ready())) return;
    setStatus('Making PDF…', 'busy');
    await api.copyPdf({ svg: R.built.svg, widthPt: R.built.widthPt, heightPt: R.built.heightPt, name: R.name });
    done(`PDF copied · paste with ${MOD}+V`);
  });
}
async function pngBytes() {
  const blob = await SvgTools.toPng(R.built.svg, R.built.widthPt, R.built.heightPt, S.pngDpi);
  return new Uint8Array(await blob.arrayBuffer());
}
function copyPng() {
  return guard(async () => {
    if (!(await ready())) return;
    await api.copyPng({ png: await pngBytes() });
    done(`PNG copied · ${S.pngDpi} dpi, transparent`);
  });
}
function saveAs(kind) {
  return guard(async () => {
    if (!(await ready())) return;
    const name = await api.save({
      kind, name: R.name, svg: R.built.svg, widthPt: R.built.widthPt, heightPt: R.built.heightPt,
      png: kind === 'png' ? await pngBytes() : null,
    });
    if (name) done(`Saved ${name}`);
  });
}
function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => { UI.toast(msg); setStatus(msg, 'ok'); });
}

// =============================================================== history
function remember() {
  if (!R) return;
  const src = R.src.trim();
  const h = S.history.filter((x) => x.src !== src);
  const old = S.history.find((x) => x.src === src);
  h.unshift({ src, t: Date.now(), pinned: !!(old && old.pinned), svg: R.built.svg.replace(/^<\?xml[^>]*>\s*/, '') });
  const pinned = h.filter((x) => x.pinned), rest = h.filter((x) => !x.pinned).slice(0, 150);
  save({ history: [...pinned, ...rest].sort((a, b) => (b.pinned - a.pinned) || (b.t - a.t)) });
  renderHistory();
}

function renderHistory() {
  const q = $('#history-search').value.trim().toLowerCase();
  const list = $('#history-list');
  const items = S.history.filter((x) => !q || x.src.toLowerCase().includes(q));
  $('#history-count').textContent = S.history.length || '';
  $('#btn-clear-history').hidden = !S.history.some((x) => !x.pinned);
  const card = $('.history-card');
  card.classList.toggle('empty', items.length === 0);
  card.querySelector('.history-empty .empty-title').textContent = q ? 'No match' : 'No equations yet';
  card.querySelector('.history-empty div:last-child').textContent =
    q ? 'Try another search.' : 'Equations you copy or save show up here.';
  list.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'history-item' + (it.pinned ? ' pinned' : '');
    li.innerHTML = `<div class="thumb">${it.svg || ''}</div>
      <div class="item-side">
        <button class="pin" data-act="pin" data-tip="${it.pinned ? 'Unpin' : 'Pin to top'}">${Icons.icon(it.pinned ? 'starFill' : 'star')}</button>
        <button class="del" data-act="del" data-tip="Remove">${Icons.icon('trash')}</button>
      </div>
      <div class="src"></div>`;
    li.querySelector('.src').textContent = it.src.replace(/\s+/g, ' ');
    li.title = it.src;
    li.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'pin') { it.pinned = !it.pinned; save({ history: [...S.history].sort((a, b) => (b.pinned - a.pinned) || (b.t - a.t)) }); renderHistory(); return; }
      if (act === 'del') { removeEntry(it); return; }
      loadEquation(it.src);
      list.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
      li.classList.add('selected');
    });
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      UI.menu(li, [
        { label: 'Load', action: () => loadEquation(it.src) },
        { label: it.pinned ? 'Unpin' : 'Pin to top', action: () => { it.pinned = !it.pinned; save({ history: [...S.history].sort((a, b) => (b.pinned - a.pinned) || (b.t - a.t)) }); renderHistory(); } },
        { label: 'Copy LaTeX', action: () => copyText(it.src, 'LaTeX copied') },
        'sep',
        { label: 'Remove', action: () => removeEntry(it) },
        { label: 'Clear unpinned…', action: () => clearHistory() },
      ]);
    });
    list.appendChild(li);
  }
}
async function removeEntry(it) {
  if (it.pinned) {
    const ok = await UI.confirm({
      title: 'Remove pinned equation?',
      message: 'This equation is pinned. Remove it from the history anyway?',
      confirm: 'Remove', danger: true,
    });
    if (!ok) return;
  }
  save({ history: S.history.filter((x) => x !== it) });
  renderHistory();
}
async function clearHistory() {
  const n = S.history.filter((x) => !x.pinned).length;
  if (!n) return;
  const ok = await UI.confirm({
    title: 'Clear history?',
    message: `Remove ${n} unpinned equation${n > 1 ? 's' : ''}? Pinned equations are kept.`,
    confirm: 'Clear', danger: true,
  });
  if (!ok) return;
  save({ history: S.history.filter((x) => x.pinned) });
  renderHistory();
}
$('#history-search').addEventListener('input', renderHistory);
$('#btn-clear-history').addEventListener('click', clearHistory);

function loadEquation(src) {
  const ta = $('#editor-input');
  ta.value = src;
  onEditorInput();
  ta.focus();
  renderNow();
}

// =============================================================== editor

function syncHighlight() {
  hl.innerHTML = Latex.highlight(ta.value);
  hl.parentElement.scrollTop = ta.scrollTop;
}
function onEditorInput() {
  syncHighlight();
  save({ editorText: ta.value });
  scheduleRender();
}
ta.addEventListener('input', () => { onEditorInput(); autocomplete.update(); });
ta.addEventListener('scroll', () => { hl.parentElement.scrollTop = ta.scrollTop; });
ta.addEventListener('focus', () => $('#editor-card').classList.add('focus'));
ta.addEventListener('blur', () => { $('#editor-card').classList.remove('focus'); setTimeout(() => autocomplete.hide(), 150); });
ta.addEventListener('click', () => autocomplete.hide());

/** Insert a snippet at the cursor; █ = cursor position, selection goes there. */
function insertSnippet(snippet, replaceFrom = null) {
  const start = replaceFrom ?? ta.selectionStart, end = ta.selectionEnd;
  const sel = replaceFrom == null ? ta.value.slice(ta.selectionStart, end) : '';
  const text = snippet.replace('█', sel);
  const caret = snippet.includes('█') ? start + snippet.indexOf('█') + sel.length : start + text.length;
  ta.focus();
  ta.setSelectionRange(start, end);
  document.execCommand('insertText', false, text); // keeps undo history
  ta.setSelectionRange(caret, caret);
  onEditorInput();
}

ta.addEventListener('keydown', (e) => {
  if (autocomplete.handleKey(e)) return;
  if (e.key === 'Tab' && !e.shiftKey) {
    // jump to the next empty {} after the cursor (handy after inserting a snippet);
    // when there is none left, jump to the end of the equation
    e.preventDefault();
    const i = ta.value.indexOf('{}', ta.selectionEnd);
    const pos = i >= 0 ? i + 1 : ta.value.length;
    ta.setSelectionRange(pos, pos);
  }
});

// ---- autocomplete
const autocomplete = (() => {
  let box = null, items = [], k = 0, from = 0;
  function caretXY() {
    // mirror div to locate the caret
    const m = document.createElement('div');
    const cs = getComputedStyle(ta);
    for (const p of ['font', 'lineHeight', 'padding', 'whiteSpace', 'wordWrap', 'overflowWrap', 'tabSize', 'letterSpacing'])
      m.style[p] = cs[p];
    m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.width = ta.clientWidth + 'px';
    m.textContent = ta.value.slice(0, ta.selectionStart);
    const span = document.createElement('span'); span.textContent = '\u200b'; m.appendChild(span);
    document.body.appendChild(m);
    const r = ta.getBoundingClientRect();
    const x = r.left + span.offsetLeft, y = r.top + span.offsetTop - ta.scrollTop + parseFloat(cs.lineHeight);
    m.remove();
    return [x, y];
  }
  function hide() { if (box) { box.remove(); box = null; } items = []; }
  function update() {
    const pos = ta.selectionStart;
    const m = /\\([A-Za-z]*)$/.exec(ta.value.slice(0, pos));
    if (!m || m[1].length < 1) return hide();
    const q = m[1].toLowerCase();
    from = pos - m[0].length;
    items = Latex.COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(q));
    items.sort((a, b) => a.name.length - b.name.length);
    items = items.slice(0, 9);
    if (!items.length || (items.length === 1 && items[0].name.slice(1) === m[1] && items[0].snippet === items[0].name)) return hide();
    if (!box) { box = document.createElement('div'); box.className = 'ac'; document.body.appendChild(box); }
    k = 0;
    draw();
    const [x, y] = caretXY();
    box.style.left = Math.min(x, innerWidth - box.offsetWidth - 8) + 'px';
    box.style.top = (y + box.offsetHeight > innerHeight - 8 ? y - box.offsetHeight - 24 : y + 4) + 'px';
  }
  function draw() {
    box.innerHTML = items.map((c, i) => `<div class="ac-item${i === k ? ' active' : ''}" data-i="${i}">
      <span class="ac-name"></span><span class="ac-desc"></span></div>`).join('');
    box.querySelectorAll('.ac-item').forEach((el, i) => {
      el.querySelector('.ac-name').textContent = items[i].name;
      el.querySelector('.ac-desc').textContent = items[i].desc;
      el.onmousedown = (e) => { e.preventDefault(); k = i; accept(); };
    });
  }
  function accept() { const c = items[k]; hide(); insertSnippet(c.snippet, from); }
  function handleKey(e) {
    if (!box) return false;
    if (e.key === 'ArrowDown') { k = (k + 1) % items.length; draw(); e.preventDefault(); return true; }
    if (e.key === 'ArrowUp') { k = (k - 1 + items.length) % items.length; draw(); e.preventDefault(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return true; }
    return false;
  }
  return { update, hide, handleKey };
})();

// ---- Insert menu
$('#btn-insert').addEventListener('click', (e) => {
  const items = [];
  for (const s of Latex.SNIPPETS) {
    if (!s) { items.push('sep'); continue; }
    items.push({ label: s.label, code: s.code, action: () => insertSnippet(s.snippet) });
  }
  items.push('sep', { head: 'Greek letters' },
    { grid: Latex.GREEK.map((g, i) => ({ label: Latex.GREEK_CHARS[i], title: '\\' + g, action: () => insertSnippet('\\' + g + ' ') })) });
  UI.menu(e.currentTarget, items, { align: 'right' });
});

// =============================================================== toolbar
function fontLabel(id) { const f = FONTS.find((x) => x.id === id) || FONTS[0]; return f.label; }
$('#sel-font').addEventListener('click', (e) => {
  e.preventDefault();
  UI.menu(e.currentTarget, FONTS.map((f) => ({
    label: f.label, hint: f.note, checked: f.id === S.font,
    action: () => { save({ font: f.id }); $('#sel-font .select-value').textContent = f.label; scheduleRender(0); },
  })), { checks: true });
});

let sizeField, padField;
$('#btn-color').addEventListener('click', (e) => {
  e.preventDefault();
  const original = S.color;
  ColorPicker.open(e.currentTarget, {
    color: S.color, recent: S.recentColors || [],
    onChange: (c) => { S.color = c; setSwatch(); scheduleRender(60); },
    onClose: (c, committed) => {
      save({ color: c });
      setSwatch();
      if (committed && c !== original) save({ recentColors: [c, ...(S.recentColors || []).filter((x) => x !== c)].slice(0, 10) });
      if (S.color.toUpperCase() === '#FFFFFF' && S.previewBg === 'light') setBg('dark');
      scheduleRender(0);
    },
  });
});
function setSwatch() { $('#btn-color .swatch').style.background = S.color; }

function setBold(on) {
  save({ bold: on });
  $('#btn-bold').classList.toggle('on', on);
  scheduleRender(0);
}
$('#btn-bold').addEventListener('click', (e) => { e.preventDefault(); setBold(!S.bold); });

$('#sel-zoom').addEventListener('click', (e) => {
  UI.menu(e.currentTarget, ZOOMS.map((z) => ({
    label: z === 'fit' ? 'Fit to window' : `${z}%`, checked: z === S.zoom,
    hint: z === 100 ? 'true size' : '',
    action: () => { save({ zoom: z }); applyZoom(); },
  })), { checks: true, align: 'right' });
});
let bgSeg;
function setBg(v) { save({ previewBg: v }); preview.className = preview.className.replace(/bg-\w+/, 'bg-' + v); bgSeg && bgSeg.set(v); }

$('#btn-more').addEventListener('click', (e) => {
  UI.menu(e.currentTarget, [
    { label: 'Save as SVG…', icon: 'save', hint: `${MOD}+S`, action: () => saveAs('svg') },
    { label: 'Save as PDF…', icon: 'save', hint: `${MOD}+Shift+S`, action: () => saveAs('pdf') },
    { label: 'Save as PNG…', icon: 'save', action: () => saveAs('png') },
    'sep',
    { label: 'Copy LaTeX source', icon: 'code', action: () => copyText(source(), 'LaTeX copied') },
    { label: 'Copy as $…$ for LaTeX', icon: 'code', action: () => copyText(`$${Latex.stripDelimiters(source())}$`, 'LaTeX copied') },
  ]);
});

// =============================================================== title bar
function setPin(on) { $('#btn-pin').classList.toggle('on', on); }
$('#btn-pin').addEventListener('click', () => { const on = !S.onTop; save({ onTop: on }); api.setOnTop(on); setPin(on); });
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-help').addEventListener('click', openHelp);

// =============================================================== theme
let systemDark = false;
function applyTheme() {
  const dark = S.theme === 'dark' || (S.theme !== 'light' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
api.onSystemTheme((d) => { systemDark = d; applyTheme(); });

// =============================================================== settings
function openSettings() {
  const body = document.createElement('div');
  body.innerHTML = `
    <h3>Appearance</h3>
    <div class="form-row"><span>Theme</span>
      <div class="segmented" id="set-theme"><button data-value="system">System</button><button data-value="light">Light</button><button data-value="dark">Dark</button></div></div>
    <h3>Macros</h3>
    <div class="muted" style="margin:-4px 0 8px">Your own commands, available in every equation. One <span class="code">\\newcommand</span> per line.</div>
    <textarea class="textarea" id="set-macros" spellcheck="false"></textarea>
    <h3>Export</h3>
    <div class="form-row"><span>PNG resolution</span>
      <button class="select" id="set-dpi" style="min-width:160px"><span class="select-value"></span><i class="chev"></i></button></div>
    <div class="form-row"><span>Affinity paste size</span>
      <button class="select" id="set-aff" style="min-width:260px"><span class="select-value"></span><i class="chev"></i></button>
      <div class="desc">Affinity maps 1 SVG unit to 1 document pixel. Pick your document's resolution to paste at the true pt size.</div></div>`;
  const foot = document.createElement('div');
  foot.style.display = 'contents';
  foot.innerHTML = `<span class="muted">Settings are saved automatically.</span><div class="spacer"></div>
    <button class="btn primary" data-close-modal>Done</button>`;
  const m = UI.modal({ title: 'Settings', body, foot, width: 620 });
  foot.querySelector('[data-close-modal]').onclick = m.close;

  UI.segmented(body.querySelector('#set-theme'), S.theme || 'system', async (v) => {
    save({ theme: v });
    const dark = await api.setTheme(v);
    if (v === 'system') systemDark = dark;
    applyTheme();
  });
  const mac = body.querySelector('#set-macros');
  mac.value = S.macros || '';
  mac.addEventListener('input', () => { save({ macros: mac.value }); scheduleRender(500); });

  const dpiBtn = body.querySelector('#set-dpi');
  const showDpi = () => { dpiBtn.querySelector('.select-value').textContent = `${S.pngDpi} dpi`; };
  showDpi();
  dpiBtn.onclick = () => UI.menu(dpiBtn, [150, 300, 600, 1200].map((d) => ({
    label: `${d} dpi`, checked: d === S.pngDpi, hint: d === 600 ? 'default' : '', action: () => { save({ pngDpi: d }); showDpi(); },
  })), { checks: true });

  const affBtn = body.querySelector('#set-aff');
  const affLabel = (p) => (p ? `Match a ${p} ppi document` : '1 pt = 1 px (Affinity default)');
  const showAff = () => { affBtn.querySelector('.select-value').textContent = affLabel(S.affinityPpi); };
  showAff();
  affBtn.onclick = () => UI.menu(affBtn, [0, 72, 96, 150, 300].map((p) => ({
    label: affLabel(p), checked: p === S.affinityPpi, action: () => { save({ affinityPpi: p }); showAff(); },
  })), { checks: true });
}

// =============================================================== help
function openHelp() {
  const row = (k, v) => `<div class="help-row"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const body = document.createElement('div');
  body.innerHTML = `
    <h3><span class="num">1</span>Type your equation</h3>
    ${row('Write', `Plain LaTeX math, without $ signs.<br><span class="code block">\\frac{a}{b} + \\sqrt{x}</span>`)}
    ${row('Autocomplete', 'Type <span class="code">\\</span> and a few letters, then Enter or Tab. Tab also jumps to the next empty braces.')}
    ${row('Insert', 'The Insert menu adds common structures and Greek letters.')}
    ${row('Several lines', `Use an aligned block:<br><span class="code block">\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}</span>`)}
    ${row('Units', `<span class="code">\\SI{3}{\\milli\\volt}</span> gives 3 mV.`)}
    ${row('Find in LaTeX', 'Hover a part of the preview to see its LaTeX highlighted, and the other way round. Click a part to select its LaTeX.')}
    <h3><span class="num">2</span>Choose the look</h3>
    ${row('Toolbar', 'Font, size, colour, bold, mode and padding.')}
    ${row('Fonts', 'Computer Modern matches LaTeX documents, Palatino suits theses and books, Times matches most journals, Fira Sans fits slides.')}
    ${row('Size', 'A 20 pt equation matches 20 pt text in PowerPoint.')}
    <h3><span class="num">3</span>Put it in your document</h3>
    ${row('PowerPoint', `Copy SVG, then ${MOD}+V. To edit the shapes: right-click → Convert to Shape.`)}
    ${row('Affinity', `Copy SVG, then ${MOD}+V. It arrives as a group of curves.`)}
    ${row('PDF', 'Copy PDF for apps that prefer PDF.')}
    ${row('Other apps', 'Copy PNG gives a transparent image.')}
    ${row('Drag', 'Drag the preview onto an app or a folder to drop an .svg file.')}
    <h3>Good to know</h3>
    ${row('History', 'Every equation you copy. Click to reuse it; hover to pin ★ or remove it.')}
    ${row('More', 'Save as SVG, PDF or PNG, or copy the LaTeX source.')}
    ${row('Settings', 'Theme, your own macros, PNG resolution, Affinity paste size.')}
    ${row('Pin', 'The pin in the title bar keeps the window above other apps.')}
    <h3>Keyboard shortcuts</h3>
    <div class="kbd-row">
      <div>Copy SVG <span><kbd>${MOD}</kbd> <kbd>Shift</kbd> <kbd>C</kbd></span></div>
      <div>Copy PDF <span><kbd>${MOD}</kbd> <kbd>Shift</kbd> <kbd>D</kbd></span></div>
      <div>Copy PNG <span><kbd>${MOD}</kbd> <kbd>Shift</kbd> <kbd>B</kbd></span></div>
      <div>Save SVG <span><kbd>${MOD}</kbd> <kbd>S</kbd></span></div>
      <div>Render now <span><kbd>${MOD}</kbd> <kbd>Enter</kbd></span></div>
      <div>Bigger / smaller <span><kbd>${MOD}</kbd> <kbd>+</kbd> / <kbd>−</kbd></span></div>
      <div>This help <span><kbd>F1</kbd></span></div>
    </div><div style="height:12px"></div>`;
  const foot = document.createElement('div');
  foot.style.display = 'contents';
  foot.innerHTML = `<span class="muted">${COPYRIGHT} · MIT License</span><div class="spacer"></div>
    <button class="btn" data-about>About &amp; licenses</button>
    <button class="btn primary" data-gotit>Got it</button>`;
  const m = UI.modal({ title: 'How to use TeXexpress', sub: 'Type an equation, check the preview, copy it into your document.', body, foot, width: 680 });
  foot.querySelector('[data-about]').onclick = () => openAbout();
  foot.querySelector('[data-gotit]').onclick = () => m.close();
}

// =============================================================== about & licenses
const COPYRIGHT = 'Copyright © 2026 Pierre Lefloïc';
const THIRD_PARTY = [
  { group: 'Software' },
  { name: 'MathJax 4', what: 'Equation rendering and font data', by: 'The MathJax Consortium', license: 'Apache 2.0', file: 'MathJax-Apache-2.0.txt' },
  { name: 'Electron', what: 'Application framework (includes Chromium)', by: 'Electron contributors, GitHub Inc.', license: 'MIT', file: 'Electron-MIT.txt' },
  { name: 'koffi', what: 'Native clipboard access', by: 'Niels Martignène', license: 'MIT', file: 'koffi-MIT.txt' },
  { group: 'Fonts' },
  { name: 'New Computer Modern', what: '“Computer Modern”', by: 'Antonis Tsolomitis', license: 'GUST Font License', file: 'GUST-Font-License.txt' },
  { name: 'TeX Gyre Pagella Math', what: '“Palatino”', by: 'B. Jackowski, J. M. Nowacki, P. Pianowski, P. Strzelczyk', license: 'GUST Font License', file: 'GUST-Font-License.txt' },
  { name: 'TeX Gyre Termes Math', what: '“Times”', by: 'B. Jackowski, J. M. Nowacki, P. Pianowski, P. Strzelczyk', license: 'GUST Font License', file: 'GUST-Font-License.txt' },
  { name: 'Fira Math', what: '“Fira Sans”', by: 'Xiangdong Zeng', license: 'SIL OFL 1.1', file: 'OFL-1.1.txt' },
];

async function openAbout() {
  const info = await api.info();
  const body = document.createElement('div');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  body.innerHTML = `
    <div class="about-hero">
      <img class="about-logo" src="assets/icon.svg" alt="">
      <div>
        <div class="about-name">TeXexpress</div>
        <div class="muted">Version ${esc(info.version)}</div>
        <div class="about-copy">${COPYRIGHT}</div>
      </div>
    </div>
    <p class="about-text">Free software, released under the MIT License.
      <button class="link-btn" data-file="TeXexpress-MIT.txt" data-title="TeXexpress — MIT License">Read the license</button></p>
    <h3>Built with</h3>
    <div class="credits">${THIRD_PARTY.map((t) => t.group
      ? `<div class="credit-group">${t.group}</div>`
      : `<div class="credit">
           <div><div class="credit-name">${esc(t.name)} <span class="muted">· ${esc(t.what)}</span></div>
           <div class="muted">© ${esc(t.by)}</div></div>
           <button class="license-chip" data-file="${t.file}" data-title="${esc(t.name)} — ${esc(t.license)}">${esc(t.license)}</button>
         </div>`).join('')}</div>
    <p class="muted" style="margin-top:14px">The math fonts are MathJax font packages generated from the typefaces above.
      The GUST Font License is the LaTeX Project Public License 1.3c
      (<button class="link-btn" style="margin:0" data-file="LPPL-1.3c.txt" data-title="LaTeX Project Public License 1.3c">read it</button>)
      with a non-binding request about renaming derived fonts.
      Chromium's own notices are in LICENSES.chromium.html in the app's install folder.</p>`;
  const m = UI.modal({ title: 'About', body, width: 640 });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-file]');
    if (!b) return;
    const text = await api.readLicense(b.dataset.file);
    showLicense(m, b.dataset.title, text, () => openAbout());
  });
}

function showLicense(m, title, text, back) {
  const head = m.el.querySelector('.modal-head h1');
  const bodyEl = m.el.querySelector('.modal-body');
  head.textContent = title;
  bodyEl.innerHTML = '<button class="btn ghost small" data-back>← Back</button><pre class="license-text"></pre>';
  bodyEl.querySelector('.license-text').textContent = text;
  bodyEl.querySelector('[data-back]').onclick = back;
  bodyEl.scrollTop = 0;
}

// =============================================================== shortcuts
document.addEventListener('keydown', (e) => {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (e.key === 'F1') { e.preventDefault(); openHelp(); return; }
  if (UI.modalOpen()) return;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (e.shiftKey && k === 'c') { e.preventDefault(); copySvg(); }
  else if (e.shiftKey && k === 'd') { e.preventDefault(); copyPdf(); }
  else if (e.shiftKey && k === 'b') { e.preventDefault(); copyPng(); }
  else if (e.shiftKey && k === 's') { e.preventDefault(); saveAs('pdf'); }
  else if (!e.shiftKey && k === 's') { e.preventDefault(); saveAs('svg'); }
  else if (k === 'enter') { e.preventDefault(); renderNow(); }
  else if (!e.shiftKey && k === 'b') { e.preventDefault(); setBold(!S.bold); }
  else if (k === '=' || k === '+') { e.preventDefault(); bumpSize(1); }
  else if (k === '-') { e.preventDefault(); bumpSize(-1); }
});
function bumpSize(d) { const v = Math.max(4, Math.min(200, S.size + d)); save({ size: v }); sizeField.set(v); scheduleRender(0); }

$('#btn-copy-svg').addEventListener('click', copySvg);
$('#btn-copy-pdf').addEventListener('click', copyPdf);
$('#btn-copy-png').addEventListener('click', copyPng);

// =============================================================== init
(async function init() {
  const info = await api.info();
  document.documentElement.classList.add(info.platform === 'darwin' ? 'mac' : 'win');
  systemDark = info.dark;
  S = await api.getStore();
  if (S.theme && S.theme !== 'system') await api.setTheme(S.theme);
  applyTheme();

  // icons
  $('#btn-pin').innerHTML = Icons.icon('pin');
  $('#btn-settings').innerHTML = Icons.icon('settings');
  $('#btn-help').innerHTML = Icons.icon('help');
  document.querySelectorAll('.ic[data-ic]').forEach((el) => { el.innerHTML = Icons.icon(el.dataset.ic); });
  $('.search-icon').innerHTML = Icons.icon('search');
  $('#editor-hint').textContent = `Type LaTeX math · ${MOD}+Enter to render`;
  $('#btn-copy-svg').dataset.tip = `For PowerPoint and Affinity · ${MOD}+Shift+C`;
  $('#btn-copy-pdf').dataset.tip = `Vector PDF · ${MOD}+Shift+D`;
  $('#btn-copy-png').dataset.tip = `Transparent image · ${MOD}+Shift+B`;

  // controls
  if (!FONTS.some((f) => f.id === S.font)) S.font = 'mathjax-newcm';
  $('#sel-font .select-value').textContent = fontLabel(S.font);
  sizeField = UI.numberField($('#num-size'), { value: S.size, min: 4, max: 200, step: 1,
    onChange: (v) => { save({ size: v }); scheduleRender(120); } });
  padField = UI.numberField($('#num-pad'), { value: S.padding, min: 0, max: 50, step: 0.5,
    onChange: (v) => { save({ padding: v }); scheduleRender(120); } });
  setSwatch();
  $('#btn-bold').classList.toggle('on', !!S.bold);
  $('#btn-bold').dataset.tip = `Bold · ${MOD}+B`;
  UI.segmented($('#seg-mode'), S.mode, (v) => { save({ mode: v }); scheduleRender(0); });
  bgSeg = UI.segmented($('#seg-bg'), S.previewBg, (v) => setBg(v));
  setBg(S.previewBg);
  setPin(!!S.onTop);

  ta.value = S.editorText || '';
  syncHighlight();
  renderHistory();
  frameFor(S.font);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  if (ta.value.trim()) renderNow(); else showEmpty();
})();
