const SVG_NS = 'http://www.w3.org/2000/svg';

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
 * that avoid HUD blockers and support per-step reveal (`afterStep`).
 */
export class CalloutLayer {
  constructor(stage, svgEl, tagsEl) {
    this.stage = stage;
    this.svg = svgEl;
    this.tagsEl = tagsEl;
    this.items = new Map();
    this.enabled = true;
    this.currentStep = Number.POSITIVE_INFINITY;
    this._blockersFn = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.svg.style.display = this.enabled ? '' : 'none';
    this.tagsEl.style.display = this.enabled ? '' : 'none';
    if (this.enabled) {
      this.update();
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

      const title = document.createElement('strong');
      title.textContent = def.label;
      const sub = document.createElement('span');
      sub.textContent = def.sublabel ?? '';
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
    if (patch.label !== undefined) item.titleEl.textContent = patch.label;
    if (patch.sublabel !== undefined) item.subEl.textContent = patch.sublabel;
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
      if (!stepOk || !userVis) {
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

      const dx = (item.dx ?? 48) * scale;
      const dy = (item.dy ?? -48) * scale;
      const widthBox = item.tag.offsetWidth || 120;
      const heightBox = item.tag.offsetHeight || 38;
      const rawX = pt.x + dx;
      const rawY = pt.y + dy;
      const left = dx >= 0 ? rawX : rawX - widthBox;
      const top = rawY - heightBox / 2;

      visibleEntries.push({ id, item, pt, dx, left, top, width: widthBox, height: heightBox });
    }

    const blockers = this._blockersFn ? this._blockersFn() : [];
    const resolved = resolveCalloutRects(visibleEntries, bounds, blockers);

    resolved.forEach((rect, idx) => {
      const entry = visibleEntries[idx];
      const { item, pt, width: tagW, height: tagH } = entry;
      item.tag.style.transform = `translate3d(${Math.round(rect.left)}px, ${Math.round(rect.top)}px, 0)`;

      const elbowY = rect.top + tagH / 2;
      const attachX = pt.x <= rect.left ? rect.left : rect.left + tagW;
      const kneeX = Math.round(pt.x + (attachX - pt.x) * 0.45);
      const pts = `${pt.x.toFixed(1)},${pt.y.toFixed(1)} ${kneeX.toFixed(1)},${elbowY.toFixed(1)} ${attachX.toFixed(1)},${elbowY.toFixed(1)}`;

      item.dot.setAttribute('cx', pt.x.toFixed(1));
      item.dot.setAttribute('cy', pt.y.toFixed(1));
      item.shadow.setAttribute('points', pts);
      item.polyline.setAttribute('points', pts);
    });
  }
}
