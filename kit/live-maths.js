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
    this.subtitleEl.textContent = subtitle;
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
      this.subtitleEl.textContent = subtitle;
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

  #buildEquationBlock(eq) {
    const block = document.createElement('div');
    block.className = 'eq-block';

    if (eq.label) {
      const label = document.createElement('div');
      label.className = 'eq-label';
      label.textContent = eq.label;
      block.append(label);
    }

    const line = document.createElement('div');
    line.className = 'eq-line';
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
      cap.textContent = table.caption;
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
      note.textContent = table.note;
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
    text.textContent = String(item.text ?? '');

    li.append(tag, text);
    return li;
  }
}
