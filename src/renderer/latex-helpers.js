'use strict';
/**
 * LaTeX helpers for the editor:
 *  - COMMANDS: autocomplete list (name, snippet, description). "█" marks the cursor,
 *    and every "{}" pair can be reached with Tab.
 *  - SNIPPETS: the Insert menu.
 *  - siunitx-lite: \SI, \si, \qty, \unit, \num for the common units (MathJax has no siunitx).
 *  - highlight(): syntax colouring for the editor overlay.
 */
(function (global) {
  const C = (name, snippet, desc) => ({ name, snippet: snippet ?? name, desc: desc || '' });

  const COMMANDS = [
    C('\\frac', '\\frac{█}{}', 'fraction'), C('\\dfrac', '\\dfrac{█}{}', 'display fraction'),
    C('\\tfrac', '\\tfrac{█}{}', 'small fraction'), C('\\sqrt', '\\sqrt{█}', 'square root'),
    C('\\sum', '\\sum_{█}^{}', 'sum'), C('\\prod', '\\prod_{█}^{}', 'product'),
    C('\\int', '\\int_{█}^{}', 'integral'), C('\\iint', '\\iint', 'double integral'),
    C('\\oint', '\\oint', 'contour integral'), C('\\lim', '\\lim_{█ \\to }', 'limit'),
    C('\\left(', '\\left( █ \\right)', 'auto-size ( )'), C('\\left[', '\\left[ █ \\right]', 'auto-size [ ]'),
    C('\\left\\{', '\\left\\{ █ \\right\\}', 'auto-size { }'), C('\\left|', '\\left| █ \\right|', 'auto-size | |'),
    C('\\text', '\\text{█}', 'upright text'), C('\\mathrm', '\\mathrm{█}', 'roman'),
    C('\\mathbf', '\\mathbf{█}', 'bold'), C('\\boldsymbol', '\\boldsymbol{█}', 'bold symbol'),
    C('\\mathbb', '\\mathbb{█}', 'blackboard (ℝ)'), C('\\mathcal', '\\mathcal{█}', 'calligraphic'),
    C('\\mathit', '\\mathit{█}', 'italic'), C('\\mathsf', '\\mathsf{█}', 'sans serif'),
    C('\\hat', '\\hat{█}', 'hat'), C('\\bar', '\\bar{█}', 'bar'), C('\\vec', '\\vec{█}', 'arrow'),
    C('\\dot', '\\dot{█}', 'dot'), C('\\ddot', '\\ddot{█}', 'double dot'), C('\\tilde', '\\tilde{█}', 'tilde'),
    C('\\overline', '\\overline{█}', 'line over'), C('\\underbrace', '\\underbrace{█}_{}', 'brace under'),
    C('\\overbrace', '\\overbrace{█}^{}', 'brace over'),
    // physics package
    C('\\dv', '\\dv{█}{}', 'derivative'), C('\\pdv', '\\pdv{█}{}', 'partial derivative'),
    C('\\dd', '\\dd{█}', 'differential d'), C('\\abs', '\\abs{█}', '|x|'), C('\\norm', '\\norm{█}', '‖x‖'),
    C('\\ket', '\\ket{█}', '|ψ⟩'), C('\\bra', '\\bra{█}', '⟨ψ|'), C('\\braket', '\\braket{█}{}', '⟨a|b⟩'),
    C('\\expval', '\\expval{█}', '⟨A⟩'), C('\\mel', '\\mel{█}{}{}', '⟨a|A|b⟩'),
    C('\\dyad', '\\dyad{█}', '|a⟩⟨a|'), C('\\vb', '\\vb{█}', 'bold vector'), C('\\va', '\\va{█}', 'arrow vector'),
    C('\\grad', '\\grad', '∇'), C('\\curl', '\\curl', '∇×'), C('\\div', '\\div', '∇·'),
    C('\\laplacian', '\\laplacian', '∇²'), C('\\comm', '\\comm{█}{}', '[A,B]'), C('\\order', '\\order{█}', 'O(x)'),
    C('\\Tr', '\\Tr', 'trace'), C('\\eval', '\\eval{█}_{}', 'evaluated at'),
    // units
    C('\\SI', '\\SI{█}{}', 'value + unit'), C('\\si', '\\si{█}', 'unit'), C('\\qty', '\\qty{█}{}', 'value + unit'),
    C('\\num', '\\num{█}', 'number'),
    // environments
    C('\\begin{aligned}', '\\begin{aligned}\n  █ &= \\\\\n   &= \n\\end{aligned}', 'aligned lines'),
    C('\\begin{cases}', '\\begin{cases}\n  █ & \\text{if } \\\\\n   & \\text{otherwise}\n\\end{cases}', 'cases'),
    C('\\begin{pmatrix}', '\\begin{pmatrix}\n  █ &  \\\\\n   & \n\\end{pmatrix}', '( matrix )'),
    C('\\begin{bmatrix}', '\\begin{bmatrix}\n  █ &  \\\\\n   & \n\\end{bmatrix}', '[ matrix ]'),
    C('\\begin{gathered}', '\\begin{gathered}\n  █ \\\\\n  \n\\end{gathered}', 'centred lines'),
    // symbols
    C('\\infty', null, '∞'), C('\\partial', null, '∂'), C('\\nabla', null, '∇'), C('\\hbar', null, 'ℏ'),
    C('\\cdot', null, '·'), C('\\times', null, '×'), C('\\pm', null, '±'), C('\\mp', null, '∓'),
    C('\\approx', null, '≈'), C('\\simeq', null, '≃'), C('\\equiv', null, '≡'), C('\\propto', null, '∝'),
    C('\\neq', null, '≠'), C('\\leq', null, '≤'), C('\\geq', null, '≥'), C('\\ll', null, '≪'), C('\\gg', null, '≫'),
    C('\\to', null, '→'), C('\\rightarrow', null, '→'), C('\\Rightarrow', null, '⇒'), C('\\leftrightarrow', null, '↔'),
    C('\\Leftrightarrow', null, '⇔'), C('\\mapsto', null, '↦'), C('\\in', null, '∈'), C('\\subset', null, '⊂'),
    C('\\cup', null, '∪'), C('\\cap', null, '∩'), C('\\forall', null, '∀'), C('\\exists', null, '∃'),
    C('\\langle', null, '⟨'), C('\\rangle', null, '⟩'), C('\\dagger', null, '†'), C('\\circ', null, '∘'),
    C('\\otimes', null, '⊗'), C('\\oplus', null, '⊕'), C('\\ldots', null, '…'), C('\\cdots', null, '⋯'),
    C('\\quad', null, 'space'), C('\\qquad', null, 'wide space'), C('\\,', null, 'thin space'),
    C('\\sin', null, 'sin'), C('\\cos', null, 'cos'), C('\\tan', null, 'tan'), C('\\tanh', null, 'tanh'),
    C('\\exp', null, 'exp'), C('\\ln', null, 'ln'), C('\\log', null, 'log'), C('\\max', null, 'max'), C('\\min', null, 'min'),
    C('\\color', '\\color{█}', 'colour'), C('\\cancel', '\\cancel{█}', 'strike out'),
    C('\\ce', '\\ce{█}', 'chemistry'),
  ];
  const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi',
    'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'];
  const GREEK_CHARS = 'αβγδϵεζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ';
  GREEK.forEach((g, i) => COMMANDS.push(C('\\' + g, null, GREEK_CHARS[i])));

  const SNIPPETS = [
    { label: 'Fraction', code: '\\frac{a}{b}', snippet: '\\frac{█}{}' },
    { label: 'Square root', code: '\\sqrt{x}', snippet: '\\sqrt{█}' },
    { label: 'Power & index', code: 'x^{n}_{i}', snippet: '^{█}_{}' },
    { label: 'Parentheses', code: '\\left( \\right)', snippet: '\\left( █ \\right)' },
    null,
    { label: 'Sum', code: '\\sum_{i}^{N}', snippet: '\\sum_{█}^{}' },
    { label: 'Integral', code: '\\int_a^b', snippet: '\\int_{█}^{} \\dd{x}' },
    { label: 'Derivative', code: '\\dv{f}{x}', snippet: '\\dv{█}{}' },
    { label: 'Partial derivative', code: '\\pdv{f}{x}', snippet: '\\pdv{█}{}' },
    null,
    { label: 'Vector', code: '\\vb{v}', snippet: '\\vb{█}' },
    { label: 'Ket', code: '\\ket{\\psi}', snippet: '\\ket{█}' },
    { label: 'Text', code: '\\text{…}', snippet: '\\text{█}' },
    { label: 'Value with unit', code: '\\SI{3}{\\milli\\volt}', snippet: '\\SI{█}{}' },
    null,
    { label: 'Aligned equations', code: 'aligned', snippet: '\\begin{aligned}\n  █ &= \\\\\n   &= \n\\end{aligned}' },
    { label: 'Cases', code: 'cases', snippet: '\\begin{cases}\n  █ & \\text{if } \\\\\n   & \\text{otherwise}\n\\end{cases}' },
    { label: 'Matrix', code: 'pmatrix', snippet: '\\begin{pmatrix}\n  █ &  \\\\\n   & \n\\end{pmatrix}' },
  ];

  // ------------------------------------------------------------ siunitx-lite
  const PREFIX = { yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n', micro: '\\mu ',
    milli: 'm', centi: 'c', deci: 'd', deca: 'da', hecto: 'h', kilo: 'k', mega: 'M', giga: 'G', tera: 'T', peta: 'P' };
  const UNIT = { metre: 'm', meter: 'm', gram: 'g', second: 's', ampere: 'A', kelvin: 'K', mole: 'mol',
    candela: 'cd', volt: 'V', ohm: '\\Omega', farad: 'F', henry: 'H', hertz: 'Hz', watt: 'W', joule: 'J',
    newton: 'N', pascal: 'Pa', coulomb: 'C', siemens: 'S', tesla: 'T', weber: 'Wb', electronvolt: 'eV',
    degreeCelsius: '{}^{\\circ}\\mathrm{C}', celsius: '{}^{\\circ}\\mathrm{C}', degree: '{}^{\\circ}', liter: 'L', litre: 'L',
    bar: 'bar', minute: 'min', hour: 'h', day: 'd', percent: '\\%', decibel: 'dB', angstrom: 'Å', dBm: 'dBm',
    becquerel: 'Bq', gray: 'Gy', lux: 'lx', lumen: 'lm', radian: 'rad', steradian: 'sr' };
  const POWER = { squared: '^{2}', cubed: '^{3}' };

  function unitToTex(spec) {
    // handles \milli\volt\per\second\squared and plain text like "mV/s"
    if (!/\\/.test(spec)) return `\\mathrm{${spec.replace(/\s+/g, '\\,')}}`;
    const toks = spec.match(/\\[A-Za-z]+|\{[^}]*\}|[^\\\s]+/g) || [];
    const parts = [];
    let prefix = '', per = false, cur = null;
    const flush = () => { if (cur !== null) { parts.push(cur); cur = null; } };
    for (const t of toks) {
      const n = t.startsWith('\\') ? t.slice(1) : null;
      if (n === 'per') { flush(); per = true; continue; }
      if (n && n in PREFIX) { prefix += PREFIX[n]; continue; }
      if (n && n in POWER) { if (cur !== null) cur += POWER[n]; continue; }
      if (n === 'tothe') continue;
      if (n && n in UNIT) {
        flush();
        const u = UNIT[n];
        cur = (u.startsWith('{') || u.startsWith('\\%')) ? u : `\\mathrm{${prefix}${u}}`;
        if (u === '\\Omega') cur = `\\mathrm{${prefix}}\\Omega`;
        if (per) { cur += '^{-1}'; per = false; }
        prefix = '';
        continue;
      }
      if (/^\{.*\}$/.test(t) && cur !== null) { cur += `^{${t.slice(1, -1)}}`; continue; }
      flush();
      cur = `\\mathrm{${prefix}${n ?? t}}`;
      prefix = '';
    }
    flush();
    return parts.join('\\,');
  }

  function numToTex(n) {
    return n.trim().replace(/([0-9.]+)[eE]([-+]?\d+)/, '$1 \\times 10^{$2}').replace(/\+-|±/g, '\\pm ');
  }

  /** Replace \SI{x}{u}, \qty{x}{u}, \si{u}, \unit{u}, \num{x} with plain MathJax. */
  function expandUnits(tex) {
    const arg = '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}';
    return tex
      .replace(new RegExp(`\\\\(?:SI|qty)(?:\\[[^\\]]*\\])?\\s*${arg}\\s*${arg}`, 'g'),
        (_, n, u) => `${numToTex(n)}\\,${unitToTex(u)}`)
      .replace(new RegExp(`\\\\(?:si|unit)(?:\\[[^\\]]*\\])?\\s*${arg}`, 'g'), (_, u) => unitToTex(u))
      .replace(new RegExp(`\\\\num(?:\\[[^\\]]*\\])?\\s*${arg}`, 'g'), (_, n) => numToTex(n));
  }

  /** Strip $…$, $$…$$, \[…\], \(…\) around a pasted equation. */
  function stripDelimiters(src) {
    const s = src.trim();
    for (const [a, b] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]) {
      if (s.startsWith(a) && s.endsWith(b) && s.length >= a.length + b.length) {
        const inner = s.slice(a.length, s.length - b.length);
        if (a === '$' && inner.includes('$')) continue;
        return inner.trim();
      }
    }
    return s;
  }

  // ------------------------------------------------------------ highlighting
  function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  /** Syntax-coloured HTML; if start/end are given, that range is wrapped in <mark>. */
  function highlight(text, start, end) {
    if (start != null && end > start) {
      return colour(text.slice(0, start)) + '<mark class="link">' + colour(text.slice(start, end)) +
        '</mark>' + colour(text.slice(end)) + '\n';
    }
    return colour(text) + '\n';
  }
  function colour(text) {
    const re = /(%[^\n]*)|(\\(?:[A-Za-z@]+|.))|([{}\[\]])|([\^_&])/g;
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      const cls = m[1] ? 'hl-comment' : m[2] ? 'hl-cmd' : m[3] ? 'hl-brace' : 'hl-op';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }

  /** Short, file-name-friendly name derived from the equation. */
  function slug(src) {
    let s = src.replace(/\\(text|mathrm|mathbf|left|right|displaystyle|begin|end)\b/g, '');
    s = s.replace(/\\/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return ('eq_' + s.slice(0, 40)).replace(/_+$/, '') || 'equation';
  }

  global.Latex = { COMMANDS, SNIPPETS, GREEK, GREEK_CHARS, expandUnits, stripDelimiters, highlight, slug };
})(window);
