import { renderMathInElement } from './live-maths.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEX_HINT_RE = /\$|\\\(|\\\[/;

function setCalloutText(el, text) {
  const str = String(text ?? '');
  el.textContent = str;
  if (str && TEX_HINT_RE.test(str)) {
    renderMathInElement(el);
  }
}

const TONE_ACCENT = {
  teal: '#149694',
  amber: '#c96d24',
  danger: '#b83b3b',
  navy: '#18213d',
};

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

/**
 * Resolve floating callout pill rectangles against HUD blocker regions and adjacent pills.
 * Pure geometric helper exported for unit verification.
 * @param {Array<{ id: string, left: number, top: number, width: number, height: number }>} rects
 * @param {{ padX: number, padTop: number, padBottom: number, width: number, height: number }} bounds
 * @param {Array<{ left: number, top: number, right: number, bottom: number }>} [blockers=[]]
 */
export function resolveCalloutRects(rects, bounds, blockers = []) {
  const placed = [];
  const gap = 6;
  const maxRight = Math.max(bounds.padX, bounds.width - bounds.padX);
  const maxBottom = Math.max(bounds.padTop, bounds.height - bounds.padBottom);

  for (const r of rects) {
    const w = r.width || 120;
    const h = r.height || 36;
    const clamp = (lx, ty) => ({
      left: Math.max(bounds.padX, Math.min(maxRight - w, lx)),
      top: Math.max(bounds.padTop, Math.min(maxBottom - h, ty)),
    });

    let { left, top } = clamp(r.left, r.top);

    const scoreAt = (lx, ty) => {
      const candidate = { left: lx, top: ty, right: lx + w, bottom: ty + h };
      let penalty = 0;
      for (const blk of blockers) {
        penalty += overlapArea(candidate, blk) * 3;
      }
      for (const p of placed) {
        penalty += overlapArea(candidate, p) * 2;
      }
      return penalty;
    };

    if (scoreAt(left, top) > 0) {
      let best = { left, top, pen: scoreAt(left, top) };
      const candidates = [
        [left, top - (h + gap)],
        [left, top + (h + gap)],
        [left - (w + gap), top],
        [left + (w + gap), top],
        [left, top - (h + gap) * 2],
        [left, top + (h + gap) * 2],
      ];
      for (const blk of blockers) {
        candidates.push(
          [blk.left - w - gap, top],
          [blk.right + gap, top],
          [left, blk.top - h - gap],
          [left, blk.bottom + gap]
        );
      }
      for (const [cx, cy] of candidates) {
        const c = clamp(cx, cy);
        const pen = scoreAt(c.left, c.top);
        const dist = Math.hypot(c.left - left, c.top - top);
        const bestDist = Math.hypot(best.left - left, best.top - top);
        if (pen < best.pen - 1e-3 || (Math.abs(pen - best.pen) <= 1e-3 && dist < bestDist)) {
          best = { left: c.left, top: c.top, pen };
        }
      }
      left = best.left;
      top = best.top;
    }

    const finalRect = { id: r.id, left, top, right: left + w, bottom: top + h };
    placed.push(finalRect);
  }
  return placed;
}

/**
 * Projects 3D world anchors into 2D canvas coordinates each frame,
 * drawing dual-stroke crisp elbowed SVG leader lines paired with floating callout pills
 * that avoid HUD blockers, support per-step/choreographer reveal (`afterStep`, `opacity`),
 * and cache layout snapshots (`getExportSnapshot()`) for Canvas2D video export fallback.
 */
export class CalloutLayer {
  constructor(stage, svgEl, tagsEl, { style = 'pill', quietMode = false, linkBus = null } = {}) {
    this.stage = stage;
    this.svg = svgEl;
    this.tagsEl = tagsEl;
    this.defaultStyle = style === 'editorial' ? 'editorial' : 'pill';
    this.quietMode = Boolean(quietMode);
    this.linkBus = linkBus || null;
    this._linkUnsubs = [];
    this.items = new Map();
    this.enabled = true;
    this.currentStep = Number.POSITIVE_INFINITY;
    this._blockersFn = null;
    this._choreographer = null;
    this._lastLayout = { width: 0, height: 0, items: [] };
    if (this.linkBus) this.setLinkBus(this.linkBus);
  }

  /** Switch default callout visual style: `'pill' | 'editorial'`. */
  setStyle(style = 'pill') {
    this.defaultStyle = style === 'editorial' ? 'editorial' : 'pill';
    for (const item of this.items.values()) {
      const s = item.style || this.defaultStyle;
      if (s === 'editorial') item.tag.dataset.style = 'editorial';
      else delete item.tag.dataset.style;
    }
    this.update();
  }

  /** Toggle quiet mode (when enabled, shows only `pinned: true` and LinkBus hovered/selected callouts). */
  setQuietMode(enabled) {
    this.quietMode = Boolean(enabled);
    this.update();
  }

  /** Bind a `LinkBus` for clickable/hoverable callouts and quiet-mode filtering. */
  setLinkBus(linkBus) {
    for (const u of this._linkUnsubs) u?.();
    this._linkUnsubs = [];
    this.linkBus = linkBus || null;
    if (this.linkBus) {
      const refresh = () => this.update();
      if (typeof this.linkBus.onHover === 'function') this._linkUnsubs.push(this.linkBus.onHover(refresh));
      if (typeof this.linkBus.onSelect === 'function') this._linkUnsubs.push(this.linkBus.onSelect(refresh));
    }
    this.update();
  }

  /** Optional binding to an `ActorChoreographer` for pure-function-of-`t` callout opacity. */
  setChoreographer(choreographer) {
    this._choreographer = choreographer || null;
    this.update();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.svg?.style) this.svg.style.display = this.enabled ? '' : 'none';
    if (this.tagsEl?.style) this.tagsEl.style.display = this.enabled ? '' : 'none';
    if (this.enabled) {
      this.update();
    } else {
      this._lastLayout = {
        width: this.stage?.size?.width || 0,
        height: this.stage?.size?.height || 0,
        items: [],
      };
    }
  }

  /**
   * Bind current step index for `afterStep` progressive callout reveal.
   * @param {number} stepIndex
   */
  setCurrentStep(stepIndex) {
    this.currentStep = Number.isFinite(stepIndex) ? stepIndex : Number.POSITIVE_INFINITY;
    this.update();
  }

  /**
   * Provide a function returning stage-relative DOMRect/box blockers to avoid overlapping HUD cards.
   * @param {null | (() => Array<{ left: number, top: number, right: number, bottom: number }>)} fn
   */
  setBlockers(fn) {
    this._blockersFn = typeof fn === 'function' ? fn : null;
  }

  setItems(defs) {
    this.clear();
    for (const def of defs) {
      const shadow = document.createElementNS(SVG_NS, 'polyline');
      shadow.setAttribute('class', 'leader-shadow');

      const polyline = document.createElementNS(SVG_NS, 'polyline');
      polyline.setAttribute('class', 'leader-line');
      if (def.tone) polyline.dataset.tone = def.tone;

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'leader-dot');
      dot.setAttribute('r', '3.3');
      if (def.tone) dot.dataset.tone = def.tone;

      const tag = document.createElement('div');
      tag.className = 'callout-tag';
      if (def.tone) tag.dataset.tone = def.tone;
      const effStyle = def.style || this.defaultStyle;
      if (effStyle === 'editorial') tag.dataset.style = 'editorial';
      if (def.linkId) {
        tag.dataset.linkId = String(def.linkId);
        tag.dataset.interactive = 'true';
        tag.addEventListener('pointerenter', () => this.linkBus?.hover(String(def.linkId), 'callout'));
        tag.addEventListener('pointerleave', () => {
          if (this.linkBus?.hoveredId === String(def.linkId)) this.linkBus.clearHover('callout');
        });
        tag.addEventListener('click', () => this.linkBus?.select(String(def.linkId), 'callout'));
      }

      const title = document.createElement('strong');
      setCalloutText(title, def.label);
      const sub = document.createElement('span');
      setCalloutText(sub, def.sublabel ?? '');
      tag.append(title, sub);

      this.svg.append(shadow, polyline, dot);
      this.tagsEl.append(tag);

      this.items.set(def.id, {
        ...def,
        shadow,
        polyline,
        dot,
        tag,
        titleEl: title,
        subEl: sub,
      });
    }
    this.update();
  }

  updateItem(id, patch = {}) {
    const item = this.items.get(id);
    if (!item) return;
    Object.assign(item, patch);
    if (patch.label !== undefined) setCalloutText(item.titleEl, patch.label);
    if (patch.sublabel !== undefined) setCalloutText(item.subEl, patch.sublabel);
    if (patch.tone !== undefined) {
      if (patch.tone) {
        item.polyline.dataset.tone = patch.tone;
        item.dot.dataset.tone = patch.tone;
        item.tag.dataset.tone = patch.tone;
      } else {
        delete item.polyline.dataset.tone;
        delete item.dot.dataset.tone;
        delete item.tag.dataset.tone;
      }
    }
  }

  clear() {
    this.items.clear();
    this.svg.replaceChildren();
    this.tagsEl.replaceChildren();
    this._lastLayout = {
      width: this.stage?.size?.width || 0,
      height: this.stage?.size?.height || 0,
      items: [],
    };
  }

  /**
   * Return the latest cached 2D callout layout snapshot for Canvas2D video/image export fallback.
   * Shape: `{ width, height, items: [{ id, anchorX, anchorY, left, top, width, height, title, detail, accent, opacity, leaderPoints }] }`.
   */
  getExportSnapshot() {
    if (!this.enabled) {
      return {
        width: this.stage?.size?.width || 0,
        height: this.stage?.size?.height || 0,
        items: [],
      };
    }
    if (!this._lastLayout || (!this._lastLayout.width && this.stage?.size?.width)) {
      this.update();
    }
    return {
      width: this._lastLayout.width,
      height: this._lastLayout.height,
      items: this._lastLayout.items.map((it) => ({
        ...it,
        leaderPoints: it.leaderPoints.map((pt) => [...pt]),
      })),
    };
  }

  #resolveOpacity(id, item) {
    let op = typeof item.opacity === 'function'
      ? Number(item.opacity())
      : item.opacity !== undefined
        ? Number(item.opacity)
        : 1;
    if (!Number.isFinite(op)) op = 1;
    if (this._choreographer && typeof this._choreographer.getCalloutOpacity === 'function') {
      op *= this._choreographer.getCalloutOpacity(item.choreoId ?? id);
    }
    return Math.max(0, Math.min(1, op));
  }

  update() {
    if (!this.enabled) return;
    const { width, height } = this.stage.size;
    if (!width || !height) return;

    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const compact = width < 640;
    const scale = compact ? 0.68 : 1;
    const bounds = {
      width,
      height,
      padX: 10,
      padTop: 56,
      padBottom: compact ? 62 : 66,
    };

    const visibleEntries = [];
    for (const [id, item] of this.items.entries()) {
      const stepOk = item.afterStep === undefined || this.currentStep >= item.afterStep;
      const userVis = typeof item.visible === 'function' ? item.visible() : item.visible !== false;
      const linkedKey = item.linkId ? String(item.linkId) : String(id);
      const isHot = Boolean(this.linkBus && this.linkBus.hoveredId === linkedKey);
      const isSel = Boolean(this.linkBus && this.linkBus.selectedId === linkedKey);
      if (item.tag.dataset) {
        if (isHot) item.tag.dataset.linkedHot = 'true';
        else delete item.tag.dataset.linkedHot;
        if (isSel) item.tag.dataset.linkedSelected = 'true';
        else delete item.tag.dataset.linkedSelected;
      }
      const quietOk = !this.quietMode || Boolean(item.pinned) || isHot || isSel;
      const effOpacity = this.#resolveOpacity(id, item);

      if (!stepOk || !userVis || !quietOk || effOpacity <= 0.01) {
        item.shadow.style.display = 'none';
        item.polyline.style.display = 'none';
        item.dot.style.display = 'none';
        item.tag.style.display = 'none';
        continue;
      }

      const worldPos = item.getWorldPos();
      const pt = this.stage.projectToScreen(worldPos);
      if (!pt.visible) {
        item.shadow.style.display = 'none';
        item.polyline.style.display = 'none';
        item.dot.style.display = 'none';
        item.tag.style.display = 'none';
        continue;
      }

      item.shadow.style.display = '';
      item.polyline.style.display = '';
      item.dot.style.display = '';
      item.tag.style.display = '';

      const opStr = effOpacity < 0.999 ? effOpacity.toFixed(3) : '';
      item.shadow.style.opacity = opStr;
      item.polyline.style.opacity = opStr;
      item.dot.style.opacity = opStr;
      item.tag.style.opacity = opStr;

      const dx = (item.dx ?? 48) * scale;
      const dy = (item.dy ?? -48) * scale;
      const widthBox = item.tag.offsetWidth || 120;
      const heightBox = item.tag.offsetHeight || 38;
      const rawX = pt.x + dx;
      const rawY = pt.y + dy;
      const left = dx >= 0 ? rawX : rawX - widthBox;
      const top = rawY - heightBox / 2;

      visibleEntries.push({
        id,
        item,
        pt,
        dx,
        left,
        top,
        width: widthBox,
        height: heightBox,
        opacity: effOpacity,
      });
    }

    const blockers = this._blockersFn ? this._blockersFn() : [];
    const resolved = resolveCalloutRects(visibleEntries, bounds, blockers);
    const snapshotItems = [];

    resolved.forEach((rect, idx) => {
      const entry = visibleEntries[idx];
      const { id, item, pt, width: tagW, height: tagH, opacity } = entry;
      // Integer left/top with cleared transform keeps Windows ClearType subpixel AA razor sharp
      item.tag.style.left = `${Math.round(rect.left)}px`;
      item.tag.style.top = `${Math.round(rect.top)}px`;
      item.tag.style.transform = '';

      const isEditorial = (item.style || this.defaultStyle) === 'editorial';
      const elbowY = isEditorial ? rect.top + tagH - 1 : rect.top + tagH / 2;
      const attachX = pt.x <= rect.left ? rect.left : rect.left + tagW;
      const kneeX = Math.round(pt.x + (attachX - pt.x) * 0.45);
      const pts = `${pt.x.toFixed(1)},${pt.y.toFixed(1)} ${kneeX.toFixed(1)},${elbowY.toFixed(1)} ${attachX.toFixed(1)},${elbowY.toFixed(1)}`;

      item.dot.setAttribute('cx', pt.x.toFixed(1));
      item.dot.setAttribute('cy', pt.y.toFixed(1));
      item.shadow.setAttribute('points', pts);
      item.polyline.setAttribute('points', pts);

      snapshotItems.push({
        id,
        anchorX: pt.x,
        anchorY: pt.y,
        left: rect.left,
        top: rect.top,
        width: tagW,
        height: tagH,
        title: item.label ?? '',
        detail: item.sublabel ?? '',
        tone: item.tone ?? '',
        accent: item.accent ?? TONE_ACCENT[item.tone] ?? TONE_ACCENT.navy,
        opacity,
        leaderPoints: [
          [pt.x, pt.y],
          [kneeX, elbowY],
          [attachX, elbowY],
        ],
      });
    });

    this._lastLayout = { width, height, items: snapshotItems };
  }
}
