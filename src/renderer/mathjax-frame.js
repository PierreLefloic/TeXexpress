'use strict';
// Receives {id, tex, display} from the app window and answers with the raw MathJax SVG.

let queue = Promise.resolve();

window.addEventListener('message', (ev) => {
  const msg = ev.data || {};
  if (msg.type !== 'render') return;
  // MathJax keeps \newcommand definitions between calls; render one at a time
  queue = queue.then(() => render(msg)).catch(() => {});
});

async function render({ id, tex, display }) {
  try {
    MathJax.texReset();
    const node = await MathJax.tex2svgPromise(tex, { display });
    const svg = node.querySelector('svg');
    if (!svg) throw new Error('No output');
    const err = svg.querySelector('[data-mml-node="merror"]');
    if (err) throw new Error(err.getAttribute('data-mjx-error') || err.textContent || 'LaTeX error');
    parent.postMessage({ type: 'rendered', id, svg: svg.outerHTML }, '*');
  } catch (e) {
    parent.postMessage({ type: 'rendered', id, error: cleanError(e) }, '*');
  }
}

function cleanError(e) {
  let m = (e && (e.message || String(e))) || 'LaTeX error';
  m = m.replace(/^TeX Error:\s*/i, '');
  return m;
}
