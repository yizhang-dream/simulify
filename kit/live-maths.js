/**
 * Collapsible formal mathematical substitution & truth/transition table panel.
 * Synchronizes equations, live-substituted variables, active lookup rows,
 * and single-step causal traces directly from a single solve() ground truth.
 *
 * v2 Upgrades:
 * - Bidirectional `LinkBus` hover/select/focus on formula tokens (`token.linkId` / `data-link-id`),
 *   table rows, and breakdown items.
 * - Optional compact `surfaceMode: true` so the panel's root element (`getElement()`)
 *   can be mounted directly onto `HtmlSurfaceManager` in 3D space (while seamlessly
 *   rendering as standard DOM on fallback).
 * - True mathematical typography (`--font-math` via offline KaTeX fonts):
 *   automatic italic variables (`<var class="lm-var">`), tabular numerals,
 *   automatic Unicode subscript/superscript rescue (`ₜ`/`ₙ`/`ᵏ`/`⁴` -> real `<sub>`/`<sup>`),
 *   stacked fractions (`.lm-frac`), and big operators with limits (`.lm-op`),
 *   plus clean composable AST helpers (`mathVar`, `mathSub`, `mathSup`, `mathSubSup`,
 *   `mathFrac`, `mathOp`, `mathNum`, `mathText`, `mathGroup`) — 100% backward
 *   compatible with legacy `{ text, tone, emph, sub, linkId }` tokens.
 */

import katex from './katex/katex.mjs';

const UNICODE_SUB_MAP = Object.freeze({
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '−', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h',
  'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p',
  'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ᵣ': 'r',
  'ᵤ': 'u', 'ᵥ': 'v',
});

const UNICODE_SUP_MAP = Object.freeze({
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '−', '⁼': '=', '⁽': '(', '⁾': ')',
  'ⁿ': 'n', 'ⁱ': 'i', 'ᵏ': 'k', 'ᵗ': 't', 'ᵃ': 'a',
  'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f',
  'ᵍ': 'g', 'ʰ': 'h', 'ʲ': 'j', 'ˡ': 'l', 'ᵐ': 'm',
  'ᵒ': 'o', 'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's', 'ᵘ': 'u',
  'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
});

const SUB_CLASS = Object.keys(UNICODE_SUB_MAP).join('');
const SUP_CLASS = Object.keys(UNICODE_SUP_MAP).join('');
const SCRIPT_RUN_RE = new RegExp(
  `([${SUB_CLASS}]+(?:[:,][${SUB_CLASS}]+)*)|([${SUP_CLASS}]+(?:[:,][${SUP_CLASS}]+)*)`,
  'g'
);

const BIG_OP_SYMBOLS = new Set(['∑', 'Σ', '∏', 'Π', '∫', '∬', '∮', '⋃', '⋂']);
const MATH_WORD_OPS = new Set([
  'max', 'min', 'arg', 'argmax', 'argmin', 'lim', 'sup', 'inf',
  'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'det', 'Pr', 'Var', 'Cov',
]);

// Splits math plain text into typed fragments while preserving exact characters:
// 1) Multi-letter Latin identifiers / words (stay upright Roman, e.g. AMAT, ON, OFF, max, ns)
// 2) Numeric literals (tabular-nums upright, e.g. 0.75, 100)
// 3) Single Latin math variables (not preceded by ° or _ or alnum, not followed by _ or alnum)
// 4) Lowercase Greek math variables (α..ω)
// 5) Big operator glyphs (∑, ∏, ∫, standalone Σ)
// 6) Binary / relational operators (←, →, ↔, ⇒, ⇔, ≤, ≥, ≠, ≈, ×, ·, ⋅, −, +, =)
const INLINE_MATH_RE =
  /([A-Za-z]{2,}|[A-Za-z]+_[A-Za-z0-9]+)|(\d+(?:\.\d+)?)|((?<![A-Za-z0-9_°])[A-Za-z](?![A-Za-z0-9_]))|([α-ω])|([∑∏∫]|(?<![A-Za-z0-9])Σ(?![A-Za-z0-9]))|([←→↔⇒⇔≤≥≠≈×·⋅−+=])/g;

function mapScriptChars(str, table) {
  let out = '';
  for (const ch of str) {
    out += table[ch] ?? ch;
  }
  return out;
}

/**
 * Split a string containing legacy Unicode subscripts/superscripts (e.g. `Gₜ:ₜ₊₄`, `γᵏ`, `Sₜ₊ₙ`)
 * into structured segments `{ type: 'text' | 'sub' | 'sup', value: string }` so `LiveMathsPanel`
 * renders crisp semantic HTML `<sub>` / `<sup>` instead of broken Unicode micro-glyphs.
 *
 * @param {string} input
 * @returns {Array<{ type: 'text' | 'sub' | 'sup', value: string }>}
 */
export function normalizeUnicodeScripts(input) {
  const str = String(input ?? '');
  if (!str) return [];
  const segments = [];
  let lastIdx = 0;
  SCRIPT_RUN_RE.lastIndex = 0;
  let match;
  while ((match = SCRIPT_RUN_RE.exec(str)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: 'text', value: str.slice(lastIdx, match.index) });
    }
    if (match[1]) {
      segments.push({ type: 'sub', value: mapScriptChars(match[1], UNICODE_SUB_MAP) });
    } else if (match[2]) {
      segments.push({ type: 'sup', value: mapScriptChars(match[2], UNICODE_SUP_MAP) });
    }
    lastIdx = SCRIPT_RUN_RE.lastIndex;
  }
  if (lastIdx < str.length) {
    segments.push({ type: 'text', value: str.slice(lastIdx) });
  }
  return segments;
}

// ============================================================================
// Structured Math AST Helpers (composable inside `equations[i].tokens`)
// ============================================================================

/**
 * Create a true italic mathematical variable token (rendered in `KaTeX_Math-Italic`).
 * @param {string} name
 * @param {{ sub?: any, sup?: any, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathVar(name, opts = {}) {
  return { ...opts, kind: 'var', text: String(name ?? '') };
}

/**
 * Create a base-with-subscript math token (`<sub class="lm-sub">`).
 * Both `base` and `sub` may be strings, numbers, math tokens, or arrays of tokens.
 * @param {any} base
 * @param {any} sub
 * @param {{ sup?: any, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathSub(base, sub, opts = {}) {
  return { ...opts, kind: 'script', base, sub };
}

/**
 * Create a base-with-superscript math token (`<sup class="lm-sup">`).
 * Both `base` and `sup` may be strings, numbers, math tokens, or arrays of tokens.
 * @param {any} base
 * @param {any} sup
 * @param {{ sub?: any, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathSup(base, sup, opts = {}) {
  return { ...opts, kind: 'script', base, sup };
}

/**
 * Create a base with aligned stacked subscript and superscript (`.lm-subsup`).
 * @param {any} base
 * @param {any} sub
 * @param {any} sup
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathSubSup(base, sub, sup, opts = {}) {
  return { ...opts, kind: 'script', base, sub, sup };
}

/**
 * Create a stacked mathematical fraction (`.lm-frac`).
 * @param {any} num Numerator (string, number, math token, or array of tokens)
 * @param {any} den Denominator (string, number, math token, or array of tokens)
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathFrac(num, den, opts = {}) {
  return { ...opts, kind: 'frac', num, den };
}

/**
 * Create a large mathematical operator (`∑`, `∏`, `∫`, `max`, `min`, `lim`, `arg max`)
 * with optional stacked or inline lower/upper limits (`.lm-op`).
 * @param {string} symbol
 * @param {{ lower?: any, upper?: any, display?: boolean, stacked?: boolean, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathOp(symbol, opts = {}) {
  return { ...opts, kind: 'op', symbol: String(symbol ?? '') };
}

/**
 * Create an upright tabular numeral token (`.lm-num`).
 * @param {string | number} value
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathNum(value, opts = {}) {
  return { ...opts, kind: 'num', text: String(value ?? '') };
}

/**
 * Create an upright prose/unit text token inside an equation (`.lm-text`).
 * @param {string} text
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathText(text, opts = {}) {
  return { ...opts, kind: 'text', text: String(text ?? '') };
}

/**
 * Group multiple structured math tokens under a single tone / emphasis / `linkId` highlight.
 * @param {Array<any>} parts
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathGroup(parts, opts = {}) {
  return { ...opts, kind: 'group', parts: Array.isArray(parts) ? parts : [parts] };
}

/**
 * Create a radical / nth-root token (`\sqrt{x}` or `\sqrt[n]{x}`).
 * @param {any} radicand
 * @param {{ index?: any, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathSqrt(radicand, opts = {}) {
  return { ...opts, kind: 'sqrt', radicand };
}

/**
 * Create a 2D matrix or column vector with crisp stretchy SVG delimiters.
 * @param {Array<Array<any>>} rows
 * @param {{ fence?: 'brackets'|'parens'|'bars'|'braces'|'none', tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathMatrix(rows, opts = {}) {
  return { ...opts, kind: 'matrix', rows: Array.isArray(rows) ? rows : [], fence: opts.fence ?? 'brackets' };
}

/**
 * Create a piecewise function block (`\begin{cases} ... \end{cases}`) with a stretchy left curly brace.
 * Each branch is `[valueNode, conditionNode]` or `{ value, cond }`.
 * @param {Array<[any, any] | { value: any, cond?: any }>} branches
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathCases(branches, opts = {}) {
  return { ...opts, kind: 'cases', branches: Array.isArray(branches) ? branches : [] };
}

/**
 * Create an accented mathematical symbol (`\vec{F}`, `\hat{v}`, `\bar{x}`, `\dot{q}`, `\ddot{q}`, `\tilde{u}`).
 * @param {any} base
 * @param {'vec'|'hat'|'bar'|'dot'|'ddot'|'tilde'} [accent='vec']
 * @param {{ sub?: any, sup?: any, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathAccent(base, accent = 'vec', opts = {}) {
  return { ...opts, kind: 'accent', base, accent };
}

/**
 * Wrap tall expressions (e.g. fractions or sums) in stretchy delimiters (`(`, `)`, `[`, `]`, `{`, `}`, `|`).
 * @param {any} inner
 * @param {{ left?: string, right?: string, sub?: any, sup?: any, tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathFence(inner, opts = {}) {
  return { ...opts, kind: 'fence', inner, left: opts.left ?? '(', right: opts.right ?? ')' };
}

/**
 * Create a multi-row aligned derivation block (`\begin{aligned} lhs &= rhs \end{aligned}`).
 * Each row is `[lhs, rel, rhs]` or `{ lhs, rel, rhs }`.
 * @param {Array<[any, string, any] | { lhs: any, rel?: string, rhs: any }>} rows
 * @param {{ tone?: string, emph?: boolean, linkId?: string }} [opts]
 */
export function mathAlign(rows, opts = {}) {
  return { ...opts, kind: 'align', rows: Array.isArray(rows) ? rows : [] };
}

function isUnarySign(str, index, op) {
  if (op !== '+' && op !== '-' && op !== '−') return false;
  const before = str.slice(0, index).trimEnd();
  if (!before) return true;
  const prev = before[before.length - 1];
  return '(=[,:{←→↔⇒⇔≤≥≠≈+−-×·⋅'.includes(prev);
}

function appendInlineMathText(parent, rawText, { inScript = false } = {}) {
  const str = String(rawText ?? '');
  if (!str) return;
  let lastIdx = 0;
  INLINE_MATH_RE.lastIndex = 0;
  let match;
  while ((match = INLINE_MATH_RE.exec(str)) !== null) {
    if (match.index > lastIdx) {
      parent.append(document.createTextNode(str.slice(lastIdx, match.index)));
    }
    const [full, word, num, singleVar, greekVar, bigOp, binOp] = match;
    if (word) {
      if (MATH_WORD_OPS.has(word)) {
        const opEl = document.createElement('span');
        opEl.className = 'lm-op-sym';
        opEl.textContent = word;
        parent.append(opEl);
      } else {
        parent.append(document.createTextNode(word));
      }
    } else if (num) {
      const nEl = document.createElement('span');
      nEl.className = 'lm-num';
      nEl.textContent = num;
      parent.append(nEl);
    } else if (singleVar || greekVar) {
      const vEl = document.createElement('var');
      vEl.className = 'lm-var';
      vEl.textContent = singleVar || greekVar;
      parent.append(vEl);
    } else if (bigOp && !inScript) {
      const wrap = document.createElement('span');
      wrap.className = 'lm-op';
      const sym = document.createElement('span');
      sym.className = 'lm-op-sym';
      sym.textContent = bigOp;
      wrap.append(sym);
      parent.append(wrap);
    } else if (binOp) {
      if (inScript || isUnarySign(str, match.index, binOp)) {
        parent.append(document.createTextNode(binOp));
      } else {
        const bEl = document.createElement('span');
        bEl.className = 'lm-bin';
        bEl.textContent = binOp;
        parent.append(bEl);
      }
    } else {
      parent.append(document.createTextNode(full));
    }
    lastIdx = INLINE_MATH_RE.lastIndex;
  }
  if (lastIdx < str.length) {
    parent.append(document.createTextNode(str.slice(lastIdx)));
  }
}

function appendScriptedText(parent, rawText, { inScript = false } = {}) {
  const segments = normalizeUnicodeScripts(rawText);
  for (const seg of segments) {
    if (seg.type === 'text') {
      appendInlineMathText(parent, seg.value, { inScript });
    } else if (seg.type === 'sub') {
      const sub = document.createElement('sub');
      sub.className = 'lm-sub';
      appendInlineMathText(sub, seg.value, { inScript: true });
      parent.append(sub);
    } else if (seg.type === 'sup') {
      const sup = document.createElement('sup');
      sup.className = 'lm-sup';
      appendInlineMathText(sup, seg.value, { inScript: true });
      parent.append(sup);
    }
  }
}

function appendScripts(parent, subVal, supVal) {
  const hasSub = subVal !== undefined && subVal !== null && subVal !== '';
  const hasSup = supVal !== undefined && supVal !== null && supVal !== '';
  if (!hasSub && !hasSup) return;

  if (hasSub && hasSup) {
    const stack = document.createElement('span');
    stack.className = 'lm-subsup';
    const sup = document.createElement('sup');
    sup.className = 'lm-subsup-sup';
    renderMathContent(sup, supVal, { inScript: true });
    const sub = document.createElement('sub');
    sub.className = 'lm-subsup-sub';
    renderMathContent(sub, subVal, { inScript: true });
    stack.append(sup, sub);
    parent.append(stack);
    return;
  }

  if (hasSub) {
    const sub = document.createElement('sub');
    sub.className = 'lm-sub';
    renderMathContent(sub, subVal, { inScript: true });
    parent.append(sub);
  }
  if (hasSup) {
    const sup = document.createElement('sup');
    sup.className = 'lm-sup';
    renderMathContent(sup, supVal, { inScript: true });
    parent.append(sup);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ACCENT_GLYPHS = Object.freeze({
  vec: '→',
  hat: '^',
  bar: '',
  dot: '·',
  ddot: '··',
  tilde: '~',
});

function createStretchyDelim(glyph) {
  if (!glyph || glyph === '.' || glyph === 'none') return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', glyph === '{' || glyph === '}' ? '0 0 14 48' : '0 0 10 48');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', glyph === '{' || glyph === '}' ? 'lm-delim lm-delim-brace' : 'lm-delim');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.45');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  const paths = {
    '(': 'M 8.5 1.5 C 2 10, 2 38, 8.5 46.5',
    ')': 'M 1.5 1.5 C 8 10, 8 38, 1.5 46.5',
    '[': 'M 8.5 1.5 L 2.2 1.5 L 2.2 46.5 L 8.5 46.5',
    ']': 'M 1.5 1.5 L 7.8 1.5 L 7.8 46.5 L 1.5 46.5',
    '|': 'M 5 1.5 L 5 46.5',
    '{': 'M 12.5 1.5 C 6.5 1.5, 6.5 7, 6.5 16 C 6.5 21.5, 4.5 24, 1.5 24 C 4.5 24, 6.5 26.5, 6.5 32 C 6.5 41, 6.5 46.5, 12.5 46.5',
    '}': 'M 1.5 1.5 C 7.5 1.5, 7.5 7, 7.5 16 C 7.5 21.5, 9.5 24, 12.5 24 C 9.5 24, 7.5 26.5, 7.5 32 C 7.5 41, 7.5 46.5, 1.5 46.5',
  };
  path.setAttribute('d', paths[glyph] || paths['(']);
  svg.append(path);
  return svg;
}

function resolveMatrixFences(fence) {
  switch (fence) {
    case 'parens': return ['(', ')'];
    case 'bars': return ['|', '|'];
    case 'braces': return ['{', '}'];
    case 'none': return ['', ''];
    case 'brackets':
    default: return ['[', ']'];
  }
}

function renderMathContent(parent, node, { inScript = false } = {}) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const child of node) {
      renderMathContent(parent, child, { inScript });
    }
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    appendScriptedText(parent, String(node), { inScript });
    return;
  }
  if (typeof node !== 'object') {
    parent.append(document.createTextNode(String(node)));
    return;
  }

  const kind = node.kind;
  if (kind === 'var') {
    const v = document.createElement('var');
    v.className = 'lm-var';
    v.textContent = String(node.text ?? '');
    parent.append(v);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'num') {
    const n = document.createElement('span');
    n.className = 'lm-num';
    n.textContent = String(node.text ?? '');
    parent.append(n);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'text') {
    const t = document.createElement('span');
    t.className = 'lm-text';
    t.textContent = String(node.text ?? '');
    parent.append(t);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'script') {
    renderMathContent(parent, node.base, { inScript });
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'frac') {
    const frac = document.createElement('span');
    frac.className = 'lm-frac';
    const num = document.createElement('span');
    num.className = 'lm-frac-num';
    renderMathContent(num, node.num, { inScript: false });
    const den = document.createElement('span');
    den.className = 'lm-frac-den';
    renderMathContent(den, node.den, { inScript: false });
    frac.append(num, den);
    parent.append(frac);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'op') {
    const symText = String(node.symbol ?? node.text ?? '');
    const isWord = !BIG_OP_SYMBOLS.has(symText) && /[A-Za-z]/.test(symText);
    const hasLower = node.lower !== undefined && node.lower !== null && node.lower !== '';
    const hasUpper = node.upper !== undefined && node.upper !== null && node.upper !== '';
    const stacked = node.stacked !== undefined ? Boolean(node.stacked) : (hasLower || hasUpper);

    const op = document.createElement('span');
    op.className = 'lm-op';
    if (node.display) op.classList.add('is-display');
    if (isWord) op.classList.add('is-word');
    if (stacked) op.classList.add('is-stacked');

    const symEl = document.createElement('span');
    symEl.className = 'lm-op-sym';
    symEl.textContent = symText;

    if (stacked) {
      if (hasUpper) {
        const up = document.createElement('span');
        up.className = 'lm-op-upper';
        renderMathContent(up, node.upper, { inScript: true });
        op.append(up);
      }
      op.append(symEl);
      if (hasLower) {
        const lo = document.createElement('span');
        lo.className = 'lm-op-lower';
        renderMathContent(lo, node.lower, { inScript: true });
        op.append(lo);
      }
    } else {
      op.append(symEl);
      if (hasUpper || hasLower) {
        const lim = document.createElement('span');
        lim.className = 'lm-op-limits';
        if (hasUpper) {
          const up = document.createElement('span');
          up.className = 'lm-op-upper';
          renderMathContent(up, node.upper, { inScript: true });
          lim.append(up);
        }
        if (hasLower) {
          const lo = document.createElement('span');
          lo.className = 'lm-op-lower';
          renderMathContent(lo, node.lower, { inScript: true });
          lim.append(lo);
        }
        op.append(lim);
      }
    }
    parent.append(op);
    return;
  }

  if (kind === 'sqrt') {
    const wrap = document.createElement('span');
    wrap.className = 'lm-sqrt';
    if (node.index !== undefined && node.index !== null && node.index !== '') {
      const idx = document.createElement('span');
      idx.className = 'lm-sqrt-index';
      renderMathContent(idx, node.index, { inScript: true });
      wrap.append(idx);
    }
    const rad = document.createElementNS(SVG_NS, 'svg');
    rad.setAttribute('class', 'lm-sqrt-rad');
    rad.setAttribute('viewBox', '0 0 14 28');
    rad.setAttribute('preserveAspectRatio', 'none');
    rad.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M 1 16 L 4.2 14 L 7.4 26 L 13.5 1.5');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.45');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    rad.append(p);

    const body = document.createElement('span');
    body.className = 'lm-sqrt-body';
    renderMathContent(body, node.radicand, { inScript: false });
    wrap.append(rad, body);
    parent.append(wrap);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'matrix') {
    const wrap = document.createElement('span');
    wrap.className = 'lm-matrix-wrap';
    const [lDelim, rDelim] = resolveMatrixFences(node.fence);
    const leftSvg = createStretchyDelim(lDelim);
    if (leftSvg) wrap.append(leftSvg);

    const rows = Array.isArray(node.rows) ? node.rows : [];
    const cols = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 1), 1);
    const grid = document.createElement('span');
    grid.className = 'lm-matrix';
    grid.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [row];
      for (let c = 0; c < cols; c += 1) {
        const cell = document.createElement('span');
        cell.className = 'lm-matrix-cell';
        renderMathContent(cell, cells[c] ?? '', { inScript: false });
        grid.append(cell);
      }
    }
    wrap.append(grid);
    const rightSvg = createStretchyDelim(rDelim);
    if (rightSvg) wrap.append(rightSvg);
    parent.append(wrap);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'cases') {
    const wrap = document.createElement('span');
    wrap.className = 'lm-cases-wrap';
    const brace = createStretchyDelim('{');
    if (brace) wrap.append(brace);
    const grid = document.createElement('span');
    grid.className = 'lm-cases';
    for (const br of node.branches || []) {
      const val = Array.isArray(br) ? br[0] : br?.value;
      const cond = Array.isArray(br) ? br[1] : br?.cond;
      const valEl = document.createElement('span');
      valEl.className = 'lm-cases-val';
      renderMathContent(valEl, val, { inScript: false });
      const condEl = document.createElement('span');
      condEl.className = 'lm-cases-cond';
      renderMathContent(condEl, cond ?? '', { inScript: false });
      grid.append(valEl, condEl);
    }
    wrap.append(grid);
    parent.append(wrap);
    return;
  }

  if (kind === 'accent') {
    const wrap = document.createElement('span');
    wrap.className = 'lm-accent';
    const mark = document.createElement('span');
    mark.className = 'lm-accent-mark';
    const accKey = String(node.accent || 'vec');
    mark.dataset.accent = accKey;
    mark.textContent = ACCENT_GLYPHS[accKey] ?? accKey;
    const base = document.createElement('span');
    base.className = 'lm-accent-base';
    renderMathContent(base, node.base, { inScript });
    wrap.append(mark, base);
    parent.append(wrap);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'fence') {
    const wrap = document.createElement('span');
    wrap.className = 'lm-fence';
    const leftSvg = createStretchyDelim(node.left);
    if (leftSvg) wrap.append(leftSvg);
    const body = document.createElement('span');
    body.className = 'lm-fence-body';
    renderMathContent(body, node.inner, { inScript });
    wrap.append(body);
    const rightSvg = createStretchyDelim(node.right);
    if (rightSvg) wrap.append(rightSvg);
    parent.append(wrap);
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  if (kind === 'align') {
    const grid = document.createElement('div');
    grid.className = 'lm-align';
    for (const row of node.rows || []) {
      const lhs = Array.isArray(row) ? row[0] : row?.lhs;
      const rel = Array.isArray(row) ? row[1] : (row?.rel ?? '=');
      const rhs = Array.isArray(row) ? row[2] : row?.rhs;

      const lEl = document.createElement('span');
      lEl.className = 'lm-align-lhs';
      renderMathContent(lEl, lhs ?? '', { inScript: false });

      const rEl = document.createElement('span');
      rEl.className = 'lm-align-rel lm-bin';
      rEl.textContent = String(rel ?? '=');

      const rhsEl = document.createElement('span');
      rhsEl.className = 'lm-align-rhs';
      renderMathContent(rhsEl, rhs ?? '', { inScript: false });

      grid.append(lEl, rEl, rhsEl);
    }
    parent.append(grid);
    return;
  }

  if (kind === 'group' || Array.isArray(node.parts)) {
    renderMathContent(parent, node.parts, { inScript });
    appendScripts(parent, node.sub, node.sup);
    return;
  }

  // Legacy plain `{ text, sub, sup, raw }` token
  if (node.raw) {
    parent.append(document.createTextNode(String(node.text ?? '')));
  } else {
    appendScriptedText(parent, String(node.text ?? ''), { inScript });
  }
  appendScripts(parent, node.sub, node.sup);
}

// ============================================================================
// Full Offline KaTeX Formula Rendering & Auto-Delimiter Scanner
// ============================================================================

const SAFE_KATEX_TRUST_CMDS = new Set(['\\htmlData', '\\htmlClass', '\\htmlStyle']);
const SKIP_MATH_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'PRE', 'CODE']);
const TEX_DELIM_HINT_RE = /\$|\\\(|\\\[/;
const CURRENCY_PROSE_RE = /^\d+(?:[.,]\d+)?\s+[A-Za-z\u4e00-\u9fff]/;
const MATH_SIGNAL_RE = /[\\^_=<>+*/{}|]/;
const VALID_TONES = new Set(['teal', 'amber', 'danger', 'navy', 'muted']);

function sanitizeLinkId(id) {
  return String(id ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, '-');
}

function formatTexScalar(value, formatNumber) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return typeof formatNumber === 'function' ? String(formatNumber(value)) : String(value);
  }
  return String(value ?? '');
}

/**
 * Substitute live variables into a LaTeX template string (`{{name}}` or `\var{name}`).
 * Scalar values are formatted inline; rich descriptors `{ value, tex, tone, emph, linkId }`
 * are wrapped with KaTeX `\htmlClass` / `\htmlData{link-id=...}` for live tone styling
 * and bidirectional `LinkBus` interactivity.
 *
 * @param {string} tex
 * @param {Record<string, any>} [vars]
 * @param {{ formatNumber?: (n: number) => string, linkMap?: Record<string, string> }} [opts]
 * @returns {string}
 */
export function substituteTexVars(tex, vars = null, opts = {}) {
  const source = String(tex ?? '');
  if (!source || !vars || typeof vars !== 'object') return source;
  const formatNumber = typeof opts?.formatNumber === 'function' ? opts.formatNumber : null;
  const linkMap = opts?.linkMap && typeof opts.linkMap === 'object' ? opts.linkMap : null;

  return source.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}|\\var\{([A-Za-z0-9_.-]+)\}/g, (full, g1, g2) => {
    const key = g1 || g2;
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return full;
    const entry = vars[key];
    const mappedLink = linkMap?.[key] ?? null;

    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      let inner = entry.tex !== undefined ? String(entry.tex) : formatTexScalar(entry.value, formatNumber);
      const linkId = entry.linkId ?? mappedLink;
      if (linkId) {
        inner = `\\htmlData{link-id=${sanitizeLinkId(linkId)}}{${inner}}`;
      }
      const classes = ['lm-tex-val'];
      if (entry.tone && VALID_TONES.has(entry.tone)) classes.push(`lm-tone-${entry.tone}`);
      if (entry.emph) classes.push('is-emph');
      if (classes.length > 1 || entry.emph || linkId) {
        return `\\htmlClass{${classes.join(' ')}}{${inner}}`;
      }
      return inner;
    }

    let inner = formatTexScalar(entry, formatNumber);
    if (mappedLink) {
      inner = `\\htmlClass{lm-tex-val}{\\htmlData{link-id=${sanitizeLinkId(mappedLink)}}{${inner}}}`;
    }
    return inner;
  });
}

function wireContainerLinks(container, linkBus) {
  if (!linkBus || !container || typeof container.querySelectorAll !== 'function') return;
  let linked = [];
  try {
    linked = container.querySelectorAll('[data-link-id]');
  } catch {
    return;
  }
  for (const el of linked) {
    const id = el?.dataset?.linkId || el?.getAttribute?.('data-link-id');
    if (!id || el.dataset?.lmLinkWired === 'true') continue;
    if (el.dataset) el.dataset.lmLinkWired = 'true';
    el.tabIndex = 0;
    el.addEventListener('pointerenter', () => linkBus.hover?.(id, 'live-maths'));
    el.addEventListener('pointerleave', () => {
      if (linkBus.hoveredId === id) linkBus.clearHover?.('live-maths');
    });
    el.addEventListener('click', () => linkBus.select?.(id, 'live-maths'));
  }
}

/**
 * Render a LaTeX expression offline using bundled KaTeX (`kit/katex/katex.mjs`).
 * When `container` is provided, renders into it and returns `container`;
 * otherwise returns the rendered HTML string.
 *
 * @param {string} tex
 * @param {HTMLElement | null} [container]
 * @param {{
 *   displayMode?: boolean,
 *   throwOnError?: boolean,
 *   strict?: boolean | string,
 *   macros?: Record<string, string>,
 *   vars?: Record<string, any> | null,
 *   linkMap?: Record<string, string> | null,
 *   formatNumber?: (n: number) => string,
 *   linkBus?: import('./link-bus.js').LinkBus | null,
 * }} [opts]
 * @returns {HTMLElement | string}
 */
export function renderTex(tex, container = null, opts = {}) {
  const resolved = opts?.vars ? substituteTexVars(tex, opts.vars, opts) : String(tex ?? '');
  const katexOpts = {
    displayMode: Boolean(opts?.displayMode),
    throwOnError: opts?.throwOnError ?? false,
    strict: opts?.strict ?? 'ignore',
    trust: (ctx) => SAFE_KATEX_TRUST_CMDS.has(ctx?.command),
  };
  if (opts?.macros && typeof opts.macros === 'object') {
    katexOpts.macros = opts.macros;
  }

  if (!container) {
    return katex.renderToString(resolved, katexOpts);
  }

  try {
    katex.render(resolved, container, katexOpts);
  } catch {
    container.innerHTML = katex.renderToString(resolved, katexOpts);
  }
  if (opts?.linkBus) {
    wireContainerLinks(container, opts.linkBus);
  }
  return container;
}

function isEscapedAt(str, idx) {
  let slashes = 0;
  for (let i = idx - 1; i >= 0 && str[i] === '\\'; i -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

/**
 * Split plain text into prose and math delimiter segments (`$$...$$`, `\[...\]`, `$...$`, `\(...\)`).
 * Safely respects escaped `\$` and ignores plain currency values like `$100` or `$5 and $10`.
 *
 * @param {string} text
 * @returns {{ hasMath: boolean, hasEscapedDollar: boolean, segments: Array<{ type: 'text' | 'math', value: string, displayMode?: boolean }> }}
 */
export function parseMathSegments(text) {
  const str = String(text ?? '');
  const segments = [];
  let hasMath = false;
  let hasEscapedDollar = false;
  let buf = '';
  let i = 0;

  const flushText = () => {
    if (buf) {
      segments.push({ type: 'text', value: buf });
      buf = '';
    }
  };

  while (i < str.length) {
    const ch = str[i];

    // Escaped dollar `\$` -> literal `$`
    if (ch === '\\' && str[i + 1] === '$') {
      buf += '$';
      hasEscapedDollar = true;
      i += 2;
      continue;
    }

    // Display math: `\[ ... \]`
    if (ch === '\\' && str[i + 1] === '[') {
      let end = i + 2;
      let found = -1;
      while (end < str.length - 1) {
        if (str[end] === '\\' && str[end + 1] === ']' && !isEscapedAt(str, end)) {
          found = end;
          break;
        }
        end += 1;
      }
      if (found > i + 2) {
        const expr = str.slice(i + 2, found).trim();
        if (expr) {
          flushText();
          segments.push({ type: 'math', value: expr, displayMode: true });
          hasMath = true;
          i = found + 2;
          continue;
        }
      }
    }

    // Inline math: `\( ... \)`
    if (ch === '\\' && str[i + 1] === '(') {
      let end = i + 2;
      let found = -1;
      while (end < str.length - 1) {
        if (str[end] === '\\' && str[end + 1] === ')' && !isEscapedAt(str, end)) {
          found = end;
          break;
        }
        end += 1;
      }
      if (found > i + 2) {
        const expr = str.slice(i + 2, found).trim();
        if (expr) {
          flushText();
          segments.push({ type: 'math', value: expr, displayMode: false });
          hasMath = true;
          i = found + 2;
          continue;
        }
      }
    }

    // Display math: `$$ ... $$`
    if (ch === '$' && str[i + 1] === '$') {
      let end = i + 2;
      let found = -1;
      while (end < str.length - 1) {
        if (str[end] === '$' && str[end + 1] === '$' && !isEscapedAt(str, end)) {
          found = end;
          break;
        }
        end += 1;
      }
      if (found > i + 2) {
        const expr = str.slice(i + 2, found).trim();
        if (expr) {
          flushText();
          segments.push({ type: 'math', value: expr, displayMode: true });
          hasMath = true;
          i = found + 2;
          continue;
        }
      }
    }

    // Inline math: `$ ... $` (guarded against currency like `$100` or `$5 and $10`)
    if (ch === '$' && str[i + 1] !== '$' && i + 1 < str.length && !/\s/.test(str[i + 1])) {
      let end = i + 1;
      let found = -1;
      while (end < str.length) {
        if (str[end] === '\n' && str[end + 1] === '\n') break;
        if (str[end] === '$' && !isEscapedAt(str, end)) {
          if (str[end + 1] !== '$' && !/\s/.test(str[end - 1])) {
            found = end;
          }
          break;
        }
        end += 1;
      }
      if (found > i + 1) {
        const inner = str.slice(i + 1, found);
        const charAfter = str[found + 1] ?? '';
        const isCurrencyBoundary = /[0-9]/.test(charAfter);
        const isCurrencyProse = CURRENCY_PROSE_RE.test(inner) && !MATH_SIGNAL_RE.test(inner);
        if (!isCurrencyBoundary && !isCurrencyProse) {
          flushText();
          segments.push({ type: 'math', value: inner, displayMode: false });
          hasMath = true;
          i = found + 1;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }

  flushText();
  return { hasMath, hasEscapedDollar, segments };
}

function shouldSkipMathElement(el) {
  if (!el) return true;
  const tag = String(el.tagName || el.nodeName || '').toUpperCase();
  if (SKIP_MATH_TAGS.has(tag)) return true;
  if (el.dataset?.noMath !== undefined) return true;
  if (typeof el.hasAttribute === 'function' && el.hasAttribute('data-no-math')) return true;
  const cls = String(el.className || '');
  if (/\bkatex\b|\bkatex-display\b|\blm-inline-math\b|\blm-display-math\b/.test(cls)) return true;
  return false;
}

function collectMathTextNodes(root, out = []) {
  if (!root) return out;
  const children = root.childNodes ? Array.from(root.childNodes) : [];
  for (const child of children) {
    const nodeType = child.nodeType ?? (typeof child.nodeValue === 'string' && !child.tagName ? 3 : 1);
    if (nodeType === 3) {
      const val = child.nodeValue ?? child.textContent ?? '';
      if (val && TEX_DELIM_HINT_RE.test(val)) {
        out.push(child);
      }
    } else if (nodeType === 1) {
      if (!shouldSkipMathElement(child)) {
        collectMathTextNodes(child, out);
      }
    }
  }
  return out;
}

/**
 * Scan a DOM subtree and auto-render inline (`$...$`, `\(...\)`) and display
 * (`$$...$$`, `\[...\]`) LaTeX formulas offline via bundled KaTeX.
 * Skips `<script>`, `<style>`, `<pre>`, `<code>`, `<textarea>`, `.katex`, and `[data-no-math]`.
 *
 * @param {HTMLElement | null} root
 * @param {{ macros?: Record<string, string>, linkBus?: import('./link-bus.js').LinkBus | null, throwOnError?: boolean }} [opts]
 * @returns {number} Count of rendered mathematical expressions.
 */
export function renderMathInElement(root, opts = {}) {
  if (!root || typeof document === 'undefined') return 0;
  if (shouldSkipMathElement(root)) return 0;

  const textNodes = collectMathTextNodes(root);
  let count = 0;

  for (const node of textNodes) {
    const raw = node.nodeValue ?? node.textContent ?? '';
    const { hasMath, hasEscapedDollar, segments } = parseMathSegments(raw);
    if (!hasMath) {
      if (hasEscapedDollar) {
        const unescaped = segments.map((s) => s.value).join('');
        if ('nodeValue' in node) node.nodeValue = unescaped;
        else node.textContent = unescaped;
      }
      continue;
    }

    const parent = node.parentNode;
    if (!parent) continue;

    const frag =
      typeof document.createDocumentFragment === 'function'
        ? document.createDocumentFragment()
        : null;
    const replacements = [];

    for (const seg of segments) {
      if (seg.type === 'text') {
        const tn =
          typeof document.createTextNode === 'function'
            ? document.createTextNode(seg.value)
            : { nodeType: 3, nodeValue: seg.value, textContent: seg.value };
        if (frag) frag.append(tn);
        else replacements.push(tn);
      } else {
        const holder = document.createElement(seg.displayMode ? 'div' : 'span');
        holder.className = seg.displayMode ? 'lm-display-math' : 'lm-inline-math';
        renderTex(seg.value, holder, { ...opts, displayMode: Boolean(seg.displayMode) });
        if (frag) frag.append(holder);
        else replacements.push(holder);
        count += 1;
      }
    }

    if (typeof node.replaceWith === 'function') {
      if (frag) node.replaceWith(frag);
      else node.replaceWith(...replacements);
    } else if (typeof parent.replaceChild === 'function' && frag) {
      parent.replaceChild(frag, node);
    }
  }

  return count;
}

export class LiveMathsPanel {
  /**
   * @param {HTMLElement | null} containerEl
   * @param {{
   *   title?: string,
   *   subtitle?: string,
   *   collapsed?: boolean,
   *   linkBus?: import('./link-bus.js').LinkBus | null,
   *   surfaceMode?: boolean,
   * }} [options]
   */
  constructor(
    containerEl,
    { title = '活公式与推导', subtitle = '', collapsed = false, linkBus = null, surfaceMode = false } = {}
  ) {
    if (!containerEl && !surfaceMode) {
      throw new Error('LiveMathsPanel requires a valid container element (or surfaceMode: true).');
    }
    this.container = containerEl || null;
    this.linkBus = linkBus || null;
    this.surfaceMode = Boolean(surfaceMode);
    this._unsubs = [];
    this._linkedEls = [];

    if (this.surfaceMode) {
      this.detailsEl = document.createElement('div');
      this.detailsEl.className = 'live-maths-panel is-surface-mode';
      this.detailsEl.dataset.surfaceMode = 'true';
      this.summaryEl = document.createElement('header');
      this.summaryEl.className = 'live-maths-summary';
    } else {
      this.detailsEl = document.createElement('details');
      this.detailsEl.className = 'live-maths-panel';
      this.detailsEl.open = !collapsed;
      this.summaryEl = document.createElement('summary');
      this.summaryEl.className = 'live-maths-summary';
    }

    const titleWrap = document.createElement('span');
    titleWrap.className = 'live-maths-heading';

    this.titleEl = document.createElement('strong');
    this.titleEl.className = 'live-maths-title';
    this.titleEl.textContent = title;

    this.subtitleEl = document.createElement('span');
    this.subtitleEl.className = 'live-maths-subtitle';
    this.#setAutoMathText(this.subtitleEl, subtitle);
    this.subtitleEl.hidden = !subtitle;

    titleWrap.append(this.titleEl, this.subtitleEl);

    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'live-maths-badge';
    this.badgeEl.hidden = true;

    this.summaryEl.append(titleWrap, this.badgeEl);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'live-maths-body';

    this.detailsEl.append(this.summaryEl, this.bodyEl);
    if (this.container) {
      this.container.append(this.detailsEl);
    }

    if (this.linkBus) {
      this.bindLinkBus(this.linkBus);
    }
  }

  /** Return root DOM element (for mounting on `HtmlSurfaceManager` or `ActorChoreographer`). */
  getElement() {
    return this.detailsEl;
  }

  /** Attach or swap a `LinkBus` for bidirectional hover/select highlighting. */
  bindLinkBus(linkBus) {
    this.#clearLinkSubs();
    this.linkBus = linkBus || null;
    if (!this.linkBus) return;
    if (typeof this.linkBus.onHover === 'function') {
      this._unsubs.push(this.linkBus.onHover((id) => this.#syncLinkedState(id, this.linkBus?.selectedId ?? null)));
    }
    if (typeof this.linkBus.onSelect === 'function') {
      this._unsubs.push(this.linkBus.onSelect((id) => this.#syncLinkedState(this.linkBus?.hoveredId ?? null, id)));
    }
    this.#syncLinkedState(this.linkBus.hoveredId ?? null, this.linkBus.selectedId ?? null);
  }

  /**
   * Toggle panel visibility.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.detailsEl.hidden = !visible;
  }

  /**
   * Expand or collapse the details drawer (no-op in surfaceMode where body stays open).
   * @param {boolean} open
   */
  setOpen(open) {
    if (!this.surfaceMode) {
      this.detailsEl.open = Boolean(open);
    }
  }

  /**
   * Atomically re-render equations, active comparison table, and single-step breakdown.
   * Accepts both legacy `{ text, tone, emph, sub, sup, linkId }` tokens and structured
   * math tokens produced by `mathVar`, `mathSub`, `mathSup`, `mathSubSup`, `mathFrac`,
   * `mathOp`, `mathNum`, `mathText`, and `mathGroup`.
   *
   * @param {{
   *   badge?: string,
   *   subtitle?: string,
   *   equations?: Array<{ label?: string, tokens: Array<any> }>,
   *   table?: { caption?: string, headers: Array<string|number>, rows: Array<Array<string|number>>, rowLinkIds?: Array<string|null>, activeRow?: number, note?: string },
   *   breakdown?: Array<{ tag: string, text: string, tone?: 'teal'|'amber'|'danger'|'navy', linkId?: string }>
   * }} [payload]
   */
  update({ badge, subtitle, equations = [], table = null, breakdown = [] } = {}) {
    if (subtitle !== undefined) {
      this.#setAutoMathText(this.subtitleEl, subtitle);
      this.subtitleEl.hidden = !subtitle;
    }
    if (badge !== undefined) {
      this.badgeEl.textContent = badge;
      this.badgeEl.hidden = !badge;
    }

    this._linkedEls = [];
    const fragment = document.createDocumentFragment();

    if (equations.length > 0) {
      const eqList = document.createElement('div');
      eqList.className = 'eq-list';
      for (const eq of equations) {
        eqList.append(this.#buildEquationBlock(eq));
      }
      fragment.append(eqList);
    }

    if (table && Array.isArray(table.headers) && Array.isArray(table.rows)) {
      fragment.append(this.#buildTableBlock(table));
    }

    if (breakdown.length > 0) {
      const list = document.createElement('ul');
      list.className = 'breakdown-list';
      for (const item of breakdown) {
        list.append(this.#buildBreakdownItem(item));
      }
      fragment.append(list);
    }

    this.bodyEl.replaceChildren(fragment);
    if (this.linkBus) {
      this.#syncLinkedState(this.linkBus.hoveredId ?? null, this.linkBus.selectedId ?? null);
    }
  }

  /** Remove panel DOM nodes and LinkBus listeners. */
  destroy() {
    this.#clearLinkSubs();
    this._linkedEls = [];
    this.detailsEl.remove();
  }

  #clearLinkSubs() {
    for (const unsub of this._unsubs) {
      try {
        unsub();
      } catch {
        // Ignore cleanup errors
      }
    }
    this._unsubs = [];
  }

  #wireLinkTarget(el, linkId) {
    if (!linkId) return;
    const id = String(linkId);
    el.dataset.linkId = id;
    el.tabIndex = 0;
    el.style.cursor = 'pointer';
    this._linkedEls.push(el);

    el.addEventListener('pointerenter', () => this.linkBus?.hover(id, 'live-maths'));
    el.addEventListener('pointerleave', () => {
      if (this.linkBus?.hoveredId === id) this.linkBus.clearHover('live-maths');
    });
    el.addEventListener('focus', () => this.linkBus?.hover(id, 'live-maths'));
    el.addEventListener('blur', () => {
      if (this.linkBus?.hoveredId === id) this.linkBus.clearHover('live-maths');
    });
    el.addEventListener('click', () => this.linkBus?.select(id, 'live-maths'));
    el.addEventListener('dblclick', () => this.linkBus?.focus(id, 'live-maths'));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.linkBus?.select(id, 'live-maths');
      }
    });
  }

  #syncLinkedState(hoveredId, selectedId) {
    for (const el of this._linkedEls) {
      const id = el.dataset.linkId;
      const hot = hoveredId !== null && hoveredId === id;
      const sel = selectedId !== null && selectedId === id;
      if (hot) el.dataset.linkedHot = 'true';
      else delete el.dataset.linkedHot;
      if (sel) el.dataset.linkedSelected = 'true';
      else delete el.dataset.linkedSelected;
    }
  }

  #setAutoMathText(el, text) {
    const str = String(text ?? '');
    el.textContent = str;
    if (str && TEX_DELIM_HINT_RE.test(str)) {
      renderMathInElement(el, { linkBus: this.linkBus });
    }
  }

  #buildEquationBlock(eq) {
    const block = document.createElement('div');
    block.className = 'eq-block';

    if (eq.label) {
      const label = document.createElement('div');
      label.className = 'eq-label';
      this.#setAutoMathText(label, eq.label);
      block.append(label);
    }

    const line = document.createElement('div');
    line.className = 'eq-line';
    if (typeof eq.tex === 'string' && eq.tex.length > 0) {
      line.classList.add('is-katex');
      renderTex(eq.tex, line, {
        displayMode: eq.displayMode ?? true,
        vars: eq.vars ?? null,
        linkMap: eq.linkMap ?? null,
        macros: eq.macros,
        formatNumber: eq.formatNumber,
      });
      if (typeof line.querySelectorAll === 'function') {
        try {
          const linkedNodes = line.querySelectorAll('[data-link-id]');
          for (const node of linkedNodes) {
            const lid = node?.dataset?.linkId || node?.getAttribute?.('data-link-id');
            if (lid) this.#wireLinkTarget(node, lid);
          }
        } catch {
          // Ignore non-CSS querySelectorAll mocks in headless Node tests
        }
      }
      if (eq.linkId) {
        this.#wireLinkTarget(line, eq.linkId);
      }
    } else {
      for (const token of eq.tokens || []) {
        const span = document.createElement('span');
        span.className = 'eq-term';
        if (token && typeof token === 'object') {
          if (token.tone) span.dataset.tone = token.tone;
          if (token.emph) span.classList.add('is-emph');
          renderMathContent(span, token, { inScript: false });
          if (token.linkId) {
            this.#wireLinkTarget(span, token.linkId);
          }
        } else {
          renderMathContent(span, token, { inScript: false });
        }
        line.append(span);
      }
    }
    block.append(line);
    return block;
  }

  #buildTableBlock(table) {
    const wrap = document.createElement('div');
    wrap.className = 'live-table-wrap';

    const tableEl = document.createElement('table');
    tableEl.className = 'live-table';

    if (table.caption) {
      const cap = document.createElement('caption');
      cap.className = 'live-table-caption';
      this.#setAutoMathText(cap, table.caption);
      tableEl.append(cap);
    }

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const h of table.headers) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = String(h);
      headRow.append(th);
    }
    thead.append(headRow);
    tableEl.append(thead);

    const tbody = document.createElement('tbody');
    table.rows.forEach((cells, rowIdx) => {
      const tr = document.createElement('tr');
      if (rowIdx === table.activeRow) {
        tr.classList.add('is-active');
        tr.setAttribute('aria-current', 'true');
      }
      const rowLink = table.rowLinkIds?.[rowIdx];
      if (rowLink) {
        this.#wireLinkTarget(tr, rowLink);
      }
      for (const cell of cells) {
        const td = document.createElement('td');
        td.textContent = String(cell);
        tr.append(td);
      }
      tbody.append(tr);
    });
    tableEl.append(tbody);
    wrap.append(tableEl);

    if (table.note) {
      const note = document.createElement('div');
      note.className = 'live-table-note';
      this.#setAutoMathText(note, table.note);
      wrap.append(note);
    }

    return wrap;
  }

  #buildBreakdownItem(item) {
    const li = document.createElement('li');
    li.className = 'breakdown-item';
    if (item.tone) li.dataset.tone = item.tone;
    if (item.linkId) {
      this.#wireLinkTarget(li, item.linkId);
    }

    const tag = document.createElement('span');
    tag.className = 'breakdown-tag';
    if (item.tone) tag.dataset.tone = item.tone;
    tag.textContent = String(item.tag ?? '');

    const text = document.createElement('span');
    text.className = 'breakdown-text';
    this.#setAutoMathText(text, item.text ?? '');

    li.append(tag, text);
    return li;
  }
}
