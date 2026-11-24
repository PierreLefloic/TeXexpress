'use strict';
// Small UI kit: tooltips, popovers/menus, modals, toasts, segmented controls, number fields.
(function (global) {
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------------------------------------------------------------- tooltips
  const tip = $('#tooltip');
  let tipTimer = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    clearTimeout(tipTimer);
    if (!el) { tip.classList.remove('show'); return; }
    tipTimer = setTimeout(() => {
      if (document.querySelector('.popover-layer.open')) return;
      tip.textContent = el.dataset.tip;
      const r = el.getBoundingClientRect();
      tip.classList.add('show');
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2;
      let y = r.bottom + 8;
      if (y + th > innerHeight - 4) y = r.top - th - 8;
      x = Math.max(6, Math.min(x, innerWidth - tw - 6));
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }, 450);
  });
  document.addEventListener('mousedown', () => { clearTimeout(tipTimer); tip.classList.remove('show'); }, true);

  // ---------------------------------------------------------------- popovers
  const layer = $('#popover-layer');
  let current = null;

  function closePopover() {
    if (!current) return;
    const { onClose } = current;
    current = null;
    layer.innerHTML = '';
    layer.classList.remove('open');
    onClose && onClose();
  }
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) closePopover(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) { e.preventDefault(); e.stopPropagation(); closePopover(); }
  }, true);
  addEventListener('blur', () => { if (current && !current.keepOnBlur) closePopover(); });
  addEventListener('resize', closePopover);

  /** Show `el` anchored under `anchor`. Returns the popover element. */
  function popover(anchor, el, { align = 'left', onClose, keepOnBlur, offset = 6 } = {}) {
    closePopover();
    const box = document.createElement('div');
    box.className = 'popover';
    box.appendChild(el);
    layer.appendChild(box);
    layer.classList.add('open');
    current = { box, onClose, keepOnBlur };
    const r = anchor.getBoundingClientRect();
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let x = align === 'right' ? r.right - bw : r.left;
    let y = r.bottom + offset;
    if (y + bh > innerHeight - 8) y = Math.max(8, r.top - bh - offset);
    x = Math.max(8, Math.min(x, innerWidth - bw - 8));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    return box;
  }

  /**
   * Menu: items = [{label, hint, code, checked, icon, action} | 'sep' | {head}]
   * Keyboard: arrows + Enter.
   */
  function menu(anchor, items, opts = {}) {
    const el = document.createElement('div');
    el.className = 'menu';
    const rows = [];
    for (const it of items) {
      if (it === 'sep') { el.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); continue; }
      if (it.head) { el.insertAdjacentHTML('beforeend', `<div class="menu-head">${it.head}</div>`); continue; }
      if (it.grid) {
        const g = document.createElement('div');
        g.className = 'menu-grid';
        for (const cell of it.grid) {
          const c = document.createElement('div');
          c.className = 'menu-item';
          c.textContent = cell.label;
          c.title = cell.title || '';
          c.onclick = () => { closePopover(); cell.action(); };
          g.appendChild(c);
        }
        el.appendChild(g);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'menu-item' + (it.checked ? ' checked' : '');
      row.innerHTML =
        (opts.checks ? `<span class="menu-check">${it.checked ? Icons.icon('check') : ''}</span>` : '') +
        (it.icon ? `<span class="menu-check">${Icons.icon(it.icon)}</span>` : '') +
        `<span>${it.label}</span>` +
        (it.code ? `<span class="menu-hint menu-code">${it.code}</span>` : '') +
        (it.hint ? `<span class="menu-hint">${it.hint}</span>` : '');
      row.onclick = () => { closePopover(); it.action(); };
      el.appendChild(row);
      rows.push(row);
    }
    const box = popover(anchor, el, opts);
    let k = rows.findIndex((r) => r.classList.contains('checked'));
    const setK = (i) => { rows.forEach((r) => r.classList.remove('kbd')); k = i; if (rows[k]) { rows[k].classList.add('kbd'); rows[k].scrollIntoView({ block: 'nearest' }); } };
    if (k >= 0) rows[k].scrollIntoView({ block: 'center' });
    const onKey = (e) => {
      if (!box.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
      if (e.key === 'ArrowDown') { setK((k + 1) % rows.length); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setK((k - 1 + rows.length) % rows.length); e.preventDefault(); }
      else if (e.key === 'Enter' && rows[k]) { e.preventDefault(); rows[k].click(); }
    };
    document.addEventListener('keydown', onKey, true);
    return box;
  }

  // ---------------------------------------------------------------- modals
  const modalLayer = $('#modal-layer');
  let modalClose = null;
  function modal({ title, sub, body, foot, width, onClose }) {
    const m = document.createElement('div');
    m.className = 'modal';
    if (width) m.style.width = `min(${width}px, calc(100vw - 48px))`;
    m.innerHTML = `<div class="modal-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <div class="spacer"></div><button class="icon-btn" data-close>${Icons.icon('x')}</button></div>
      <div class="modal-body"></div>${foot ? '<div class="modal-foot"></div>' : ''}`;
    m.querySelector('.modal-body').append(body);
    if (foot) m.querySelector('.modal-foot').append(foot);
    // switching from one dialog to another (Help → About → license): swap in place,
    // without closing the backdrop or replaying the opening animation
    if (modalLayer.classList.contains('open')) m.classList.add('no-anim');
    modalLayer.innerHTML = '';
    modalLayer.appendChild(m);
    modalLayer.classList.add('open');
    const close = () => {
      modalLayer.classList.remove('open');
      modalLayer.innerHTML = '';
      modalClose = null;
      onClose && onClose();
    };
    modalClose = close;
    m.querySelector('[data-close]').onclick = close;
    modalLayer.onmousedown = (e) => { if (e.target === modalLayer) close(); };
    return { el: m, close };
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalClose && !current) { e.preventDefault(); modalClose(); }
  });
  const modalOpen = () => !!modalClose;

  /** Small confirmation dialog. Resolves true when confirmed. */
  function confirmDialog({ title, message, confirm = 'OK', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      const body = document.createElement('div');
      body.style.cssText = 'color: var(--text-2); padding: 2px 0 10px';
      body.textContent = message;
      const foot = document.createElement('div');
      foot.style.display = 'contents';
      foot.innerHTML = `<div class="spacer"></div><button class="btn" data-no>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-yes></button>`;
      foot.querySelector('[data-yes]').textContent = confirm;
      const m = modal({ title, body, foot, width: 420, onClose: () => { if (!answered) resolve(false); } });
      const answer = (v) => { answered = true; m.close(); resolve(v); };
      foot.querySelector('[data-no]').onclick = () => answer(false);
      foot.querySelector('[data-yes]').onclick = () => answer(true);
      setTimeout(() => foot.querySelector('[data-yes]').focus(), 0);
    });
  }

  // ---------------------------------------------------------------- toast
  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(text) {
    toastEl.innerHTML = Icons.icon('check') + `<span>${text}</span>`;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- segmented
  function segmented(el, value, onChange) {
    const set = (v) => el.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === v));
    set(value);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      set(b.dataset.value);
      onChange(b.dataset.value);
    });
    return { set };
  }

  // ---------------------------------------------------------------- number
  function numberField(el, { value, min, max, step, onChange }) {
    const input = el.querySelector('input');
    const fmt = (v) => String(+(+v).toFixed(2));
    input.value = fmt(value);
    const commit = (v) => {
      if (!isFinite(v)) return;
      v = Math.min(max, Math.max(min, v));
      input.value = fmt(v);
      onChange(v);
    };
    el.querySelectorAll('[data-step]').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => commit(parseFloat(input.value.replace(',', '.')) + +b.dataset.step));
    });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value.replace(',', '.'));
      if (isFinite(v) && v >= min && v <= max) onChange(v);
    });
    input.addEventListener('blur', () => commit(parseFloat(input.value.replace(',', '.'))));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        commit(parseFloat(input.value.replace(',', '.')) + (e.key === 'ArrowUp' ? step : -step));
      }
      if (e.key === 'Enter') input.blur();
    });
    el.addEventListener('wheel', (e) => {
      if (document.activeElement !== input) return;
      e.preventDefault();
      commit(parseFloat(input.value.replace(',', '.')) + (e.deltaY < 0 ? step : -step));
    }, { passive: false });
    return { set: (v) => { input.value = fmt(v); } };
  }

  global.UI = { $, popover, closePopover, menu, modal, modalOpen, confirm: confirmDialog, toast, segmented, numberField };
})(window);
