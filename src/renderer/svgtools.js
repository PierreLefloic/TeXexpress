'use strict';
/**
 * Turning MathJax's SVG into export-ready SVG.
 *
 * MathJax works in "em" units: its viewBox uses 1000 units per em. For a font size of
 * S pt, 1 viewBox unit = S / 1000 pt. All exports are sized in real points so a 20 pt
 * equation matches 20 pt text in PowerPoint.
 */
(function (global) {
  const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

  function parse(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    return doc.documentElement;
  }

  /** Remove MathJax-only attributes/elements so the SVG is small and portable.
   *  keepSource: keep data-latex / data-mml-node (used by the preview's hover links). */
  function clean(svg, keepSource = false) {
    const all = [svg, ...svg.querySelectorAll('*')];
    for (const el of all) {
      for (const a of [...el.attributes]) {
        const n = a.name;
        if (keepSource && (n === 'data-latex' || n === 'data-mml-node')) continue;
        if (n.startsWith('data-') || n === 'role' || n === 'focusable' || n.startsWith('aria-') ||
            n === 'style' || n === 'class' || n === 'xmlns:xlink') {
          el.removeAttribute(n);
        }
      }
    }
    svg.querySelectorAll('title, desc').forEach((n) => n.remove());
  }

  /**
   * Build the standalone SVG.
   * opts: { size (pt), color '#RRGGBB', padding (pt) }
   * returns { svg (string, pt units), widthPt, heightPt, viewBox:[x,y,w,h], inner (string) }
   */
  function build(mjSvgText, opts) {
    const src = parse(mjSvgText);
    if (src.nodeName !== 'svg' || src.querySelector('parsererror')) {
      throw new Error('Could not read the rendered equation');
    }
    const tagged = src.cloneNode(true);
    clean(tagged, true);
    clean(src);
    const vb = (src.getAttribute('viewBox') || '0 0 1000 1000').match(NUM).map(Number);
    const unitPt = opts.size / 1000; // pt per viewBox unit
    const pad = opts.padding / unitPt; // padding in viewBox units
    const [x, y, w, h] = [vb[0] - pad, vb[1] - pad, vb[2] + 2 * pad, vb[3] + 2 * pad];
    const widthPt = w * unitPt;
    const heightPt = h * unitPt;

    const innerOf = (node) => new XMLSerializer().serializeToString(node)
      .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      .replace(/currentColor/g, opts.color)                         // MathJax uses currentColor
      .replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');  // repeated on children
    const inner = innerOf(src);

    const f = (v) => +v.toFixed(4);
    const wrap = (content) =>
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
      `width="${f(widthPt)}pt" height="${f(heightPt)}pt" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}">` +
      `${content}</svg>\n`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` + wrap(inner);
    // preview copy keeps the LaTeX source of each part, for the hover links
    const previewSvg = wrap(innerOf(tagged));
    return { svg, previewSvg, widthPt, heightPt, viewBox: [x, y, w, h], inner };
  }

  /**
   * Variant for Affinity Designer: Affinity turns a top-level <g> into a *layer*, but a
   * nested <svg> into a plain *group* (named after its id). It also ignores units on paste
   * and maps 1 SVG unit to 1 document pixel, so the outer size is in "points as pixels"
   * times `scale` (= document ppi / 72 when the user wants true sizes).
   */
  function affinityVariant(built, name, scale = 1) {
    const [x, y, w, h] = built.viewBox;
    const W = built.widthPt * scale, H = built.heightPt * scale;
    const id = (name || 'equation').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 60) || 'equation';
    const f = (v) => +v.toFixed(4);
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${f(W)}" height="${f(H)}" ` +
      `viewBox="0 0 ${f(W)} ${f(H)}">` +
      `<svg id="${id}" x="0" y="0" width="${f(W)}" height="${f(H)}" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}">` +
      `${built.inner}</svg></svg>\n`;
  }

  /** Rasterise an SVG string to a PNG Blob at `dpi` (transparent background). */
  async function toPng(svgText, widthPt, heightPt, dpi) {
    const scale = dpi / 72;
    const wpx = Math.max(1, Math.round(widthPt * scale));
    const hpx = Math.max(1, Math.round(heightPt * scale));
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.decoding = 'sync';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas');
      c.width = wpx; c.height = hpx;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, wpx, hpx);
      return await new Promise((res) => c.toBlob(res, 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  global.SvgTools = { build, affinityVariant, toPng };
})(window);
