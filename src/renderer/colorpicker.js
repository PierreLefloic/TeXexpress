'use strict';
// Colour picker popover: preset swatches with shades, recent colours, a saturation/brightness
// square with a hue slider, and a hex field. Changes preview live; Esc restores the original.
(function (global) {
  const BASE = ['#000000', '#FFFFFF', '#1F4E79', '#2563EB', '#0E7490', '#15803D', '#CA8A04', '#EA580C', '#C00000', '#7E22CE'];

  const hexToRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (c, o, t) => { const a = hexToRgb(c), b = hexToRgb(o); return rgbToHex(...a.map((x, i) => x + (b[i] - x) * t)); };
  const parseHex = (t) => { t = (t || '').trim().replace(/^#/, ''); return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? rgbToHex(...hexToRgb(t)) : null; };

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6; if (h < 0) h += 1;
    }
    return [h, max ? d / max : 0, max];
  }
  function hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
    return [r * 255, g * 255, b * 255];
  }

  function shades() {
    const rows = [];
    const steps = [['l', .8], ['l', .6], ['l', .4], ['d', .25], ['d', .5]];
    for (const [kind, t] of steps) {
      rows.push(BASE.map((c) => {
        if (c === '#000000') return mix(c, '#FFFFFF', { .8: .85, .6: .65, .4: .5, .25: .35, .5: .2 }[t]);
        if (c === '#FFFFFF') return mix(c, '#000000', { .8: .05, .6: .15, .4: .25, .25: .35, .5: .5 }[t]);
        return mix(c, kind === 'l' ? '#FFFFFF' : '#000000', t);
      }));
    }
    return rows;
  }

  /**
   * open(anchor, { color, recent, onChange(color), onClose(color, committed) })
   */
  function open(anchor, { color, recent = [], onChange, onClose }) {
    const original = color.toUpperCase();
    let cur = original;
    let [h, s, v] = rgbToHsv(...hexToRgb(cur));
    let committed = false;

    const el = document.createElement('div');
    el.className = 'cp';
    const grid = (colors) => `<div class="cp-grid">${colors.map((c) =>
      `<button class="cp-sw${c === cur ? ' current' : ''}" style="background:${c}" data-c="${c}" title="${c}"></button>`).join('')}</div>`;
    el.innerHTML =
      `<div class="cp-head">COLOURS</div>${grid(BASE)}<div style="height:8px"></div>` +
      shades().map(grid).join('').replace(/<\/div><div class="cp-grid">/g, '</div><div class="cp-grid" style="margin-top:4px">') +
      (recent.length ? `<div class="cp-sep"></div><div class="cp-head">RECENT</div>${grid(recent.slice(0, 10))}` : '') +
      `<div class="cp-sep"></div><div class="cp-head">CUSTOM</div>
       <div class="cp-sv"><div class="cp-knob"></div></div>
       <div class="cp-hue"><div class="cp-knob"></div></div>
       <div class="cp-foot"><div class="cp-preview"></div><input class="cp-hex" spellcheck="false" maxlength="7">
       <button class="btn primary small" data-done>Done</button></div>`;

    const sv = el.querySelector('.cp-sv'), svKnob = sv.querySelector('.cp-knob');
    const hue = el.querySelector('.cp-hue'), hueKnob = hue.querySelector('.cp-knob');
    const prev = el.querySelector('.cp-preview'), hex = el.querySelector('.cp-hex');

    function sync({ fromHex = false, notify = true } = {}) {
      sv.style.background = rgbToHex(...hsvToRgb(h, 1, 1));
      svKnob.style.left = s * 100 + '%';
      svKnob.style.top = (1 - v) * 100 + '%';
      hueKnob.style.left = h * 100 + '%';
      prev.style.background = cur;
      if (!fromHex) { hex.value = cur; hex.classList.remove('bad'); }
      el.querySelectorAll('.cp-sw').forEach((b) => b.classList.toggle('current', b.dataset.c === cur));
      if (notify) onChange(cur);
    }
    function setHex(c, opts) { cur = c; [h, s, v] = rgbToHsv(...hexToRgb(c)); sync(opts); }
    function fromHsv() { cur = rgbToHex(...hsvToRgb(h, s, v)); sync(); }

    function drag(target, fn) {
      target.addEventListener('pointerdown', (e) => {
        target.setPointerCapture(e.pointerId);
        fn(e);
        const move = (ev) => fn(ev);
        const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
      });
    }
    drag(sv, (e) => {
      const r = sv.getBoundingClientRect();
      s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      fromHsv();
    });
    drag(hue, (e) => {
      const r = hue.getBoundingClientRect();
      h = Math.min(.9999, Math.max(0, (e.clientX - r.left) / r.width));
      if (s < .05) { s = 1; v = Math.max(v, .5); }
      fromHsv();
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.cp-sw');
      if (b) { setHex(b.dataset.c); committed = true; UI.closePopover(); }
      if (e.target.closest('[data-done]')) { committed = true; UI.closePopover(); }
    });
    hex.addEventListener('input', () => {
      const c = parseHex(hex.value);
      hex.classList.toggle('bad', !c && hex.value.length > 0);
      if (c && c !== cur) setHex(c, { fromHex: true });
    });
    hex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const c = parseHex(hex.value); if (c) { setHex(c); committed = true; UI.closePopover(); } }
    });
    // Esc → revert; any other way of closing keeps the colour
    let escaped = false;
    const onEsc = (e) => { if (e.key === 'Escape') escaped = true; };
    document.addEventListener('keydown', onEsc, true);

    UI.popover(anchor, el, {
      onClose: () => {
        document.removeEventListener('keydown', onEsc, true);
        if (escaped) { onChange(original); onClose(original, false); }
        else onClose(cur, true);
      },
    });
    sync({ notify: false });
  }

  global.ColorPicker = { open };
})(window);
