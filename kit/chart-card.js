const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_LABEL_FONT_SIZE = 11.5;

const TONE_COLORS = {
  teal: 'var(--teal, #149694)',
  amber: 'var(--amber, #c96d24)',
  danger: 'var(--danger, #b83b3b)',
  navy: 'var(--navy, #18213d)',
  cat1: 'var(--cat-1, #0072b2)',
  cat2: 'var(--cat-2, #d55e00)',
  cat3: 'var(--cat-3, #009e73)',
  cat4: 'var(--cat-4, #cc79a7)',
  cat5: 'var(--cat-5, #e69f00)',
  cat6: 'var(--cat-6, #56b4e9)',
  cat7: 'var(--cat-7, #18213d)',
  cat8: 'var(--cat-8, #7c5c99)',
};

const MINI_COLORMAPS = {
  viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
  coolwarm: [[59, 76, 192], [141, 176, 254], [221, 221, 221], [244, 154, 123], [180, 4, 38]],
  thermal: [[24, 33, 61], [20, 150, 148], [210, 173, 60], [224, 107, 36], [254, 225, 158]],
  magma: [[10, 8, 22], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]],
};

function sampleMiniColormap(name, u) {
  const stops = MINI_COLORMAPS[name] || MINI_COLORMAPS.viridis;
  const x = Math.max(0, Math.min(1, Number(u) || 0)) * (stops.length - 1);
  const i0 = Math.min(stops.length - 1, Math.floor(x));
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const f = x - i0;
  const a = stops[i0];
  const b = stops[i1];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  const luma = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
  return { css: `rgb(${r},${g},${bl})`, luma };
}

function resolveToneColor(tone, fallback = TONE_COLORS.teal) {
  if (!tone) return fallback;
  return TONE_COLORS[tone] || tone;
}

function styleChartLabel(el, sizePx = CHART_LABEL_FONT_SIZE) {
  el.setAttribute('font-size', String(sizePx));
  if (el.style) {
    el.style.fontSize = `${sizePx}px`;
  }
}

/**
 * Compute an O(N) clamped centered moving average preserving exact X coordinates
 * with zero phase lag and smooth boundary handling (avoids terminal cliff-drop spikes).
 */
function computeMovingAverage(points, windowSize) {
  const n = points.length;
  const win = Math.max(2, Math.round(Number(windowSize) || 0));
  if (n < 3 || win <= 1) return points;

  const prefixSum = new Float64Array(n + 1);
  const prefixCnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    const y = Number(points[i]?.y);
    if (Number.isFinite(y)) {
      prefixSum[i + 1] = prefixSum[i] + y;
      prefixCnt[i + 1] = prefixCnt[i] + 1;
    } else {
      prefixSum[i + 1] = prefixSum[i];
      prefixCnt[i + 1] = prefixCnt[i];
    }
  }

  const half = Math.floor(win / 2);
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    const cnt = prefixCnt[hi + 1] - prefixCnt[lo];
    const avg = cnt > 0 ? (prefixSum[hi + 1] - prefixSum[lo]) / cnt : Number(points[i]?.y) || 0;
    out[i] = { x: points[i].x, y: avg };
  }
  return out;
}

function syncSvgPool(group, pool, needed, createFn) {
  if (pool.length < needed) {
    const added = [];
    while (pool.length < needed) {
      const node = createFn();
      pool.push(node);
      added.push(node);
    }
    group.append(...added);
  } else if (pool.length > needed) {
    pool.length = needed;
    group.replaceChildren(...pool);
  }
}

/**
 * Reusable collapsible floating telemetry / diagram card supporting:
 * - 'compare': side-by-side meters and live slot chips
 * - 'hysteresis': live SVG XY state loop with threshold guides and flow arrows
 * - 'xy': persistent-DOM multi-series XY coordinate plot with ghost baselines,
 *   optional moving-average trend smoothing (`movingAverageWindow` / `rawOpacity`),
 *   threshold marks, live dot, >= 11.5px legible labels, and continuous unbroken
 *   pointer-capture drag scrubbing (`onScrub`).
 */
export class ChartCard {
  constructor(rootEl, { title = '实时图表', mode = 'compare', collapsed = false, onScrub = null } = {}) {
    this.root = rootEl;
    this.mode = mode;
    this.collapsed = collapsed;
    this._onScrub = typeof onScrub === 'function' ? onScrub : null;
    this._scrubMeta = null;
    this._xy = null;

    this.root.classList.add('chart-card');
    this.root.innerHTML = `
      <header class="chart-head">
        <span class="chart-title"></span>
        <span class="chart-badge"></span>
        <button type="button" class="chart-fold" aria-expanded="${!collapsed}" aria-label="展开或收起图表"></button>
      </header>
      <div class="chart-body"></div>
    `;

    this.titleEl = this.root.querySelector('.chart-title');
    this.badgeEl = this.root.querySelector('.chart-badge');
    this.foldBtn = this.root.querySelector('.chart-fold');
    this.bodyEl = this.root.querySelector('.chart-body');
    this.titleEl.textContent = title;

    this.foldBtn.textContent = collapsed ? '展开' : '收起';
    this.bodyEl.hidden = collapsed;
    this.foldBtn.onclick = () => this.setCollapsed(!this.collapsed);
  }

  setOnScrub(fn) {
    this._onScrub = typeof fn === 'function' ? fn : null;
  }

  setVisible(visible) {
    this.root.hidden = !visible;
  }

  setHeader(title, badge = '') {
    this.titleEl.textContent = title;
    this.badgeEl.textContent = badge;
  }

  setCollapsed(collapsed) {
    this.collapsed = Boolean(collapsed);
    this.foldBtn.setAttribute('aria-expanded', String(!this.collapsed));
    this.foldBtn.textContent = this.collapsed ? '展开' : '收起';
    this.bodyEl.hidden = this.collapsed;
  }

  updateCompare({ badge = '', rows = [] }) {
    this.mode = 'compare';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const grid = document.createElement('div');
    grid.className = 'compare-grid';
    for (const row of rows) {
      const box = document.createElement('div');
      box.className = 'compare-row';
      const head = document.createElement('div');
      head.className = 'compare-head';
      const strong = document.createElement('strong');
      strong.textContent = row.label;
      const stat = document.createElement('span');
      stat.textContent = row.stat;
      head.append(strong, stat);

      const track = document.createElement('div');
      track.className = 'meter-track';
      const fill = document.createElement('div');
      fill.className = `meter-fill ${row.tone === 'amber' ? 'fifo' : ''}`.trim();
      if (row.tone) fill.dataset.tone = row.tone;
      fill.style.width = `${Math.max(0, Math.min(100, row.pct))}%`;
      track.append(fill);

      box.append(head, track);
      if (row.chips) {
        const chips = document.createElement('div');
        chips.className = 'slot-chips';
        if (row.chipsPrefix) chips.append(document.createTextNode(row.chipsPrefix));
        for (const ch of row.chips) {
          const sp = document.createElement('span');
          sp.className = 'slot-chip';
          sp.textContent = ch;
          chips.append(sp);
        }
        box.append(chips);
      }
      grid.append(box);
    }
    this.bodyEl.replaceChildren(grid);
  }

  updateHysteresis({
    badge = '',
    xMin = 0,
    xMax = 10,
    thresholds = [3, 7],
    points = [], // [{ x, y (0 or 1) }]
    current = { x: 5, y: 0 },
    onLabel = '1',
    offLabel = '0',
    unit = '',
    ariaLabel = '滞回状态回路',
  } = {}) {
    this.mode = 'hysteresis';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const W = 256;
    const H = 116;
    const padL = 32;
    const padR = 12;
    const padT = 14;
    const padB = 22;
    const mapX = (x) => padL + ((x - xMin) / Math.max(1e-6, xMax - xMin)) * (W - padL - padR);
    const mapY = (y) => (y ? padT + 14 : H - padB - 14);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'hyst-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ariaLabel);

    // Horizontal ON/OFF guide rails (theme-token driven)
    for (const [val, label] of [[1, onLabel], [0, offLabel]]) {
      const yy = mapY(val);
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', padL);
      ln.setAttribute('x2', W - padR);
      ln.setAttribute('y1', yy);
      ln.setAttribute('y2', yy);
      ln.setAttribute('stroke', 'var(--line-soft, #d9ceb8)');
      ln.setAttribute('stroke-width', '1');
      svg.append(ln);

      const tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('x', '5');
      tx.setAttribute('y', yy + 4);
      tx.setAttribute('class', 'hyst-label');
      styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
      tx.textContent = String(label);
      svg.append(tx);
    }

    // Threshold vertical dashed guides
    thresholds.forEach((th, idx) => {
      const xx = mapX(th);
      const col = idx === 0 ? TONE_COLORS.amber : TONE_COLORS.teal;
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', xx);
      ln.setAttribute('x2', xx);
      ln.setAttribute('y1', padT);
      ln.setAttribute('y2', H - padB);
      ln.setAttribute('stroke', col);
      ln.setAttribute('stroke-width', '1.2');
      ln.setAttribute('stroke-dasharray', '3 3');
      svg.append(ln);

      const tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('x', xx);
      tx.setAttribute('y', H - 5);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('class', 'hyst-label');
      styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
      tx.textContent = `${th}${unit}`;
      svg.append(tx);
    });

    // Ideal loop envelope faint underlay + directional flow chevrons when hysteresis > 0
    if (thresholds.length === 2 && thresholds[1] > thresholds[0]) {
      const xLo = mapX(thresholds[0]);
      const xHi = mapX(thresholds[1]);
      const yOn = mapY(1);
      const yOff = mapY(0);
      const ghost = document.createElementNS(SVG_NS, 'rect');
      ghost.setAttribute('x', xLo);
      ghost.setAttribute('y', yOn);
      ghost.setAttribute('width', xHi - xLo);
      ghost.setAttribute('height', yOff - yOn);
      ghost.setAttribute('fill', 'none');
      ghost.setAttribute('stroke', 'var(--line, #cec0ad)');
      ghost.setAttribute('stroke-width', '1.2');
      ghost.setAttribute('stroke-dasharray', '2 2');
      svg.append(ghost);

      const midX = (xLo + xHi) / 2;
      const topChevron = document.createElementNS(SVG_NS, 'path');
      topChevron.setAttribute('d', `M ${(midX - 3).toFixed(1)} ${(yOn - 3).toFixed(1)} L ${(midX + 2.5).toFixed(1)} ${yOn.toFixed(1)} L ${(midX - 3).toFixed(1)} ${(yOn + 3).toFixed(1)}`);
      topChevron.setAttribute('fill', 'none');
      topChevron.setAttribute('stroke', TONE_COLORS.amber);
      topChevron.setAttribute('stroke-width', '1.4');
      topChevron.setAttribute('stroke-linecap', 'round');

      const botChevron = document.createElementNS(SVG_NS, 'path');
      botChevron.setAttribute('d', `M ${(midX + 3).toFixed(1)} ${(yOff - 3).toFixed(1)} L ${(midX - 2.5).toFixed(1)} ${yOff.toFixed(1)} L ${(midX + 3).toFixed(1)} ${(yOff + 3).toFixed(1)}`);
      botChevron.setAttribute('fill', 'none');
      botChevron.setAttribute('stroke', TONE_COLORS.teal);
      botChevron.setAttribute('stroke-width', '1.4');
      botChevron.setAttribute('stroke-linecap', 'round');
      svg.append(topChevron, botChevron);
    }

    // Live traversed path
    if (points.length >= 2) {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', TONE_COLORS.navy);
      poly.setAttribute('stroke-width', '2.1');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('stroke-linecap', 'round');
      poly.setAttribute(
        'points',
        points.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
      );
      svg.append(poly);
    }

    // Live dot
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', mapX(current.x).toFixed(1));
    dot.setAttribute('cy', mapY(current.y).toFixed(1));
    dot.setAttribute('r', '5.2');
    dot.setAttribute('fill', current.y ? TONE_COLORS.amber : TONE_COLORS.teal);
    dot.setAttribute('stroke', 'var(--bg-elevated, #fffaf2)');
    dot.setAttribute('stroke-width', '2');
    svg.append(dot);

    this.bodyEl.replaceChildren(svg);
  }

  _ensurePersistentXY(W, H) {
    const alreadyMounted = this._xy && this.bodyEl.children?.[0] === this._xy.svg;
    if (alreadyMounted) return this._xy;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'xy-svg');
    svg.setAttribute('role', 'img');

    const gridGroup = document.createElementNS(SVG_NS, 'g');
    gridGroup.setAttribute('class', 'xy-grid-layer');
    const gridLines = [];
    const gridLabels = [];
    for (let i = 0; i < 3; i += 1) {
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('class', 'xy-axis');
      gridGroup.append(ln);
      gridLines.push(ln);
    }
    for (let i = 0; i < 2; i += 1) {
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('class', 'xy-label');
      styleChartLabel(lbl, CHART_LABEL_FONT_SIZE);
      gridGroup.append(lbl);
      gridLabels.push(lbl);
    }

    const marksGroup = document.createElementNS(SVG_NS, 'g');
    marksGroup.setAttribute('class', 'xy-marks-layer');
    const markLinesGroup = document.createElementNS(SVG_NS, 'g');
    const markTextsGroup = document.createElementNS(SVG_NS, 'g');
    marksGroup.append(markLinesGroup, markTextsGroup);

    const ghostsGroup = document.createElementNS(SVG_NS, 'g');
    ghostsGroup.setAttribute('class', 'xy-ghosts-layer');

    const rawSeriesGroup = document.createElementNS(SVG_NS, 'g');
    rawSeriesGroup.setAttribute('class', 'xy-raw-series-layer');

    const seriesGroup = document.createElementNS(SVG_NS, 'g');
    seriesGroup.setAttribute('class', 'xy-series-layer');

    const labelsGroup = document.createElementNS(SVG_NS, 'g');
    labelsGroup.setAttribute('class', 'xy-labels-layer');

    const xLabelEl = document.createElementNS(SVG_NS, 'text');
    xLabelEl.setAttribute('text-anchor', 'middle');
    xLabelEl.setAttribute('class', 'xy-label');
    styleChartLabel(xLabelEl, CHART_LABEL_FONT_SIZE);

    const yLabelEl = document.createElementNS(SVG_NS, 'text');
    yLabelEl.setAttribute('text-anchor', 'start');
    yLabelEl.setAttribute('class', 'xy-label');
    styleChartLabel(yLabelEl, CHART_LABEL_FONT_SIZE);

    const crosshairEl = document.createElementNS(SVG_NS, 'line');
    crosshairEl.setAttribute('class', 'xy-crosshair');
    crosshairEl.setAttribute('stroke', 'var(--navy, #18213d)');
    crosshairEl.setAttribute('stroke-width', '1.15');
    crosshairEl.setAttribute('stroke-opacity', '0.55');
    crosshairEl.setAttribute('stroke-dasharray', '2 2');
    crosshairEl.style.display = 'none';

    const dotGroup = document.createElementNS(SVG_NS, 'g');
    dotGroup.setAttribute('class', 'xy-dot-layer');
    const dotEl = document.createElementNS(SVG_NS, 'circle');
    dotEl.setAttribute('r', '4.8');
    dotEl.setAttribute('stroke', 'var(--card, #fffaf2)');
    dotEl.setAttribute('stroke-width', '2');

    svg.append(
      gridGroup,
      marksGroup,
      ghostsGroup,
      rawSeriesGroup,
      seriesGroup,
      labelsGroup,
      crosshairEl,
      dotGroup
    );

    const state = {
      svg,
      gridLines,
      gridLabels,
      markLinesGroup,
      markTextsGroup,
      markLines: [],
      markTexts: [],
      ghostsGroup,
      ghostPolys: [],
      rawSeriesGroup,
      rawPolys: [],
      seriesGroup,
      seriesPolys: [],
      labelsGroup,
      xLabelEl,
      yLabelEl,
      hasXLabel: false,
      hasYLabel: false,
      crosshairEl,
      dotGroup,
      dotEl,
      hasDot: false,
      activePointerId: null,
      scrubHandler: null,
      scrubX: null,
      meta: null,
    };

    const emitFromClientX = (clientX, eventMeta) => {
      if (!state.scrubHandler || !state.meta) return;
      const rect = svg.getBoundingClientRect();
      if (!rect || !rect.width) return;
      const { W: viewW, padL, plotW, xMin, xSpan } = state.meta;
      const svgX = ((clientX - rect.left) / rect.width) * viewW;
      const xNorm = Math.max(0, Math.min(1, (svgX - padL) / plotW));
      const val = xMin + xNorm * xSpan;
      const clampedSvgX = padL + xNorm * plotW;
      crosshairEl.setAttribute('x1', clampedSvgX.toFixed(1));
      crosshairEl.setAttribute('x2', clampedSvgX.toFixed(1));
      crosshairEl.style.display = '';
      state.scrubHandler(xNorm, val, eventMeta);
    };

    svg.addEventListener('pointerdown', (e) => {
      if (!state.scrubHandler || e.button !== 0) return;
      state.activePointerId = e.pointerId;
      try {
        svg.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore synthetic events
      }
      emitFromClientX(e.clientX, { dragging: true, type: 'down' });
    });

    svg.addEventListener('pointermove', (e) => {
      if (!state.scrubHandler) return;
      if (state.activePointerId === e.pointerId) {
        emitFromClientX(e.clientX, { dragging: true, type: 'drag' });
      } else if (state.activePointerId === null) {
        emitFromClientX(e.clientX, { dragging: false, type: 'hover' });
      }
    });

    const finishDrag = (e) => {
      if (state.activePointerId !== e.pointerId) return;
      state.activePointerId = null;
      try {
        svg.releasePointerCapture?.(e.pointerId);
      } catch {
        // Ignore if already released
      }
    };
    svg.addEventListener('pointerup', finishDrag);
    svg.addEventListener('pointercancel', finishDrag);
    svg.addEventListener('pointerleave', () => {
      if (state.activePointerId === null && (state.scrubX === null || !Number.isFinite(state.scrubX))) {
        crosshairEl.style.display = 'none';
      }
    });

    this.bodyEl.replaceChildren(svg);
    this._xy = state;
    return state;
  }

  /**
   * Render or update a persistent-DOM scientific XY plot with multi-series curves,
   * optional moving-average trend smoothing (`movingAverageWindow` / `rawOpacity`),
   * counterfactual ghost curve(s), critical threshold marks, live operating dot,
   * non-colliding >= 11.5px Y-axis title/ticks, and unbroken pointer-capture drag scrubbing.
   */
  updateXY({
    badge = '',
    xMin = 0,
    xMax = 10,
    yMin = 0,
    yMax = 100,
    xLabel = '',
    yLabel = '',
    series = [],
    ghost = null,
    ghosts = null,
    marks = [],
    dot = null,
    scrubX = null,
    onScrub = null,
    movingAverageWindow = 0,
    rawOpacity = 0.28,
    ariaLabel = '坐标曲线图',
  } = {}) {
    this.mode = 'xy';
    this.badgeEl.textContent = badge;

    const scrubHandler = typeof onScrub === 'function' ? onScrub : this._onScrub;
    const hasTopMark = marks.some((mk) => mk.axis === 'x' && mk.label);

    const W = 256;
    const H = 128;
    const padL = 36;
    const padR = 12;
    const padT = yLabel || hasTopMark ? 24 : 15;
    const padB = xLabel ? 24 : 16;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const xSpan = Math.max(1e-6, xMax - xMin);
    const ySpan = Math.max(1e-6, yMax - yMin);
    const mapX = (x) => padL + Math.max(0, Math.min(1, (x - xMin) / xSpan)) * plotW;
    const mapY = (y) => (H - padB) - Math.max(0, Math.min(1, (y - yMin) / ySpan)) * plotH;

    const xy = this._ensurePersistentXY(W, H);
    xy.svg.setAttribute('aria-label', ariaLabel);
    xy.scrubHandler = scrubHandler;
    xy.scrubX = scrubX;
    xy.meta = { W, padL, plotW, xMin, xSpan };
    this._scrubMeta = scrubHandler ? xy.meta : null;

    if (xy.svg.style) {
      xy.svg.style.cursor = scrubHandler ? 'ew-resize' : '';
      xy.svg.style.touchAction = scrubHandler ? 'none' : '';
    }

    // 1. Horizontal grid guides & Y bounds (persistent, zero DOM churn)
    const fracs = [0, 0.5, 1];
    let labelIdx = 0;
    for (let i = 0; i < fracs.length; i += 1) {
      const frac = fracs[i];
      const yVal = yMin + frac * (yMax - yMin);
      const yy = mapY(yVal);
      const ln = xy.gridLines[i];
      ln.setAttribute('x1', String(padL));
      ln.setAttribute('x2', String(W - padR));
      ln.setAttribute('y1', yy.toFixed(1));
      ln.setAttribute('y2', yy.toFixed(1));

      if (frac !== 0.5) {
        const lbl = xy.gridLabels[labelIdx++];
        lbl.setAttribute('x', String(padL - 5));
        lbl.setAttribute('y', (yy + 3.6).toFixed(1));
        lbl.textContent = Number.isInteger(yVal) ? String(yVal) : yVal.toFixed(1);
      }
    }

    // 2. Critical threshold marks (pooled in-place)
    const markLabelItems = [];
    syncSvgPool(xy.markLinesGroup, xy.markLines, marks.length, () => {
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('stroke-width', '1.2');
      ln.setAttribute('stroke-dasharray', '3 3');
      return ln;
    });

    for (let i = 0; i < marks.length; i += 1) {
      const mk = marks[i];
      const col = resolveToneColor(mk.tone, TONE_COLORS.amber);
      const ln = xy.markLines[i];
      ln.setAttribute('stroke', col);
      if (mk.axis === 'x') {
        const xx = mapX(mk.value).toFixed(1);
        ln.setAttribute('x1', xx);
        ln.setAttribute('x2', xx);
        ln.setAttribute('y1', String(padT));
        ln.setAttribute('y2', String(H - padB));
        if (mk.label) {
          const clampedTx = Math.max(padL + (yLabel ? 46 : 8), Math.min(W - padR - 6, Number(xx)));
          markLabelItems.push({
            x: clampedTx.toFixed(1),
            y: String(padT - 5),
            anchor: 'middle',
            fill: col,
            text: mk.label,
          });
        }
      } else {
        const yy = mapY(mk.value).toFixed(1);
        ln.setAttribute('x1', String(padL));
        ln.setAttribute('x2', String(W - padR));
        ln.setAttribute('y1', yy);
        ln.setAttribute('y2', yy);
        if (mk.label) {
          markLabelItems.push({
            x: String(W - padR - 2),
            y: (Number(yy) - 3).toFixed(1),
            anchor: 'end',
            fill: col,
            text: mk.label,
          });
        }
      }
    }

    syncSvgPool(xy.markTextsGroup, xy.markTexts, markLabelItems.length, () => {
      const tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('class', 'xy-label');
      styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
      return tx;
    });
    for (let i = 0; i < markLabelItems.length; i += 1) {
      const item = markLabelItems[i];
      const tx = xy.markTexts[i];
      tx.setAttribute('x', item.x);
      tx.setAttribute('y', item.y);
      tx.setAttribute('text-anchor', item.anchor);
      tx.setAttribute('fill', item.fill);
      tx.textContent = item.text;
    }

    // 3. Counterfactual / theoretical ghost baseline curve(s)
    const ghostList = [];
    if (ghost && Array.isArray(ghost.points) && ghost.points.length >= 2) ghostList.push(ghost);
    if (Array.isArray(ghosts)) {
      for (const g of ghosts) {
        if (g && Array.isArray(g.points) && g.points.length >= 2) ghostList.push(g);
      }
    }
    syncSvgPool(xy.ghostsGroup, xy.ghostPolys, ghostList.length, () => {
      const gp = document.createElementNS(SVG_NS, 'polyline');
      gp.setAttribute('class', 'xy-ghost');
      gp.setAttribute('fill', 'none');
      return gp;
    });
    for (let i = 0; i < ghostList.length; i += 1) {
      const g = ghostList[i];
      const gp = xy.ghostPolys[i];
      const win = Math.round(Number(g.movingAverageWindow ?? 0));
      const pts = win > 1 && g.points.length >= 3 ? computeMovingAverage(g.points, win) : g.points;
      gp.setAttribute('stroke', g.tone ? resolveToneColor(g.tone) : 'var(--muted, #656a73)');
      gp.setAttribute('stroke-width', String(g.width ?? 1.55));
      gp.setAttribute('stroke-dasharray', g.dash ?? '4 3');
      gp.setAttribute('stroke-opacity', String(g.opacity ?? 0.62));
      gp.setAttribute(
        'points',
        pts.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
      );
    }

    // 4. Live series curves (+ optional dimmed raw curve underneath moving-average trend line)
    const validSeries = [];
    const rawUnderlays = [];
    for (const s of series) {
      if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
      const win = Math.round(Number(s.movingAverageWindow ?? movingAverageWindow ?? 0));
      const smoothed = win > 1 && s.points.length >= 3;
      const color = resolveToneColor(s.tone, TONE_COLORS.teal);
      if (smoothed) {
        rawUnderlays.push({
          points: s.points,
          color,
          opacity: s.rawOpacity ?? rawOpacity ?? 0.28,
        });
        validSeries.push({
          ...s,
          color,
          points: computeMovingAverage(s.points, win),
          isSmoothed: true,
        });
      } else {
        validSeries.push({
          ...s,
          color,
          isSmoothed: false,
        });
      }
    }

    syncSvgPool(xy.rawSeriesGroup, xy.rawPolys, rawUnderlays.length, () => {
      const p = document.createElementNS(SVG_NS, 'polyline');
      p.setAttribute('class', 'xy-series-raw');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-linecap', 'round');
      return p;
    });
    for (let i = 0; i < rawUnderlays.length; i += 1) {
      const r = rawUnderlays[i];
      const p = xy.rawPolys[i];
      p.setAttribute('stroke', r.color);
      p.setAttribute('stroke-width', '1.05');
      p.setAttribute('stroke-opacity', String(Math.max(0.05, Math.min(1, Number(r.opacity) || 0.28))));
      p.setAttribute(
        'points',
        r.points.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
      );
    }

    syncSvgPool(xy.seriesGroup, xy.seriesPolys, validSeries.length, () => {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('stroke-linecap', 'round');
      return poly;
    });
    for (let i = 0; i < validSeries.length; i += 1) {
      const s = validSeries[i];
      const poly = xy.seriesPolys[i];
      poly.setAttribute('class', s.isSmoothed ? 'xy-series xy-series-smooth' : 'xy-series');
      poly.setAttribute('stroke', s.color);
      poly.setAttribute('stroke-width', String(s.width ?? (s.dashed ? 1.65 : s.isSmoothed ? 2.35 : 2.2)));
      if (s.dashed) {
        poly.setAttribute('stroke-dasharray', s.dash ?? '4 3');
      } else {
        poly.removeAttribute('stroke-dasharray');
      }
      if (s.opacity !== undefined) {
        poly.setAttribute('stroke-opacity', String(s.opacity));
      } else {
        poly.removeAttribute('stroke-opacity');
      }
      poly.setAttribute(
        'points',
        s.points.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
      );
    }

    // 5. Axis captions — yLabel sits cleanly at x=36, y=11 above top plot edge
    const wantX = Boolean(xLabel);
    const wantY = Boolean(yLabel);
    if (wantX) {
      xy.xLabelEl.setAttribute('x', ((padL + W - padR) / 2).toFixed(1));
      xy.xLabelEl.setAttribute('y', String(H - 4));
      xy.xLabelEl.textContent = xLabel;
    }
    if (wantY) {
      xy.yLabelEl.setAttribute('x', String(padL));
      xy.yLabelEl.setAttribute('y', '11');
      xy.yLabelEl.textContent = yLabel;
    }
    if (wantX !== xy.hasXLabel || wantY !== xy.hasYLabel) {
      const activeLabels = [];
      if (wantX) activeLabels.push(xy.xLabelEl);
      if (wantY) activeLabels.push(xy.yLabelEl);
      xy.labelsGroup.replaceChildren(...activeLabels);
      xy.hasXLabel = wantX;
      xy.hasYLabel = wantY;
    }

    // 6. Optional scrub crosshair line
    xy.crosshairEl.setAttribute('y1', String(padT));
    xy.crosshairEl.setAttribute('y2', String(H - padB));
    if (scrubX !== null && Number.isFinite(scrubX)) {
      const sx = mapX(scrubX).toFixed(1);
      xy.crosshairEl.setAttribute('x1', sx);
      xy.crosshairEl.setAttribute('x2', sx);
      xy.crosshairEl.style.display = '';
    } else if (xy.activePointerId === null) {
      xy.crosshairEl.style.display = 'none';
    }

    // 7. Live operating dot
    const wantDot = Boolean(dot && Number.isFinite(dot.x) && Number.isFinite(dot.y));
    if (wantDot) {
      xy.dotEl.setAttribute('cx', mapX(dot.x).toFixed(1));
      xy.dotEl.setAttribute('cy', mapY(dot.y).toFixed(1));
      xy.dotEl.setAttribute('fill', resolveToneColor(dot.tone, TONE_COLORS.teal));
    }
    if (wantDot !== xy.hasDot) {
      xy.dotGroup.replaceChildren(...(wantDot ? [xy.dotEl] : []));
      xy.hasDot = wantDot;
    }
  }

  /**
   * Render a probability / frequency distribution chart (histogram bars + smooth PDF/CDF curve
   * + shaded integral area + mean/threshold markers).
   */
  updateDistribution({
    badge = '',
    xMin = 0,
    xMax = 1,
    yMax = null,
    bins = [], // [{ x0, x1, y }] or number[]
    curve = [], // [{ x, y }]
    shadeRange = null, // [a, b]
    markers = [], // [{ x, label, tone }]
    xLabel = '',
    tone = 'teal',
    ariaLabel = '概率分布图',
  } = {}) {
    this.mode = 'distribution';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const W = 264;
    const H = 132;
    const padL = 28;
    const padR = 12;
    const padT = 18;
    const padB = xLabel ? 24 : 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const xSpan = Math.max(1e-6, xMax - xMin);

    let maxVal = yMax !== null ? Number(yMax) : 0;
    const normBins = bins.map((b, i) => {
      if (typeof b === 'number') {
        const bw = xSpan / Math.max(1, bins.length);
        return { x0: xMin + i * bw, x1: xMin + (i + 1) * bw, y: b };
      }
      return b;
    });
    for (const b of normBins) maxVal = Math.max(maxVal, Number(b.y) || 0);
    for (const pt of curve) maxVal = Math.max(maxVal, Number(pt.y) || 0);
    maxVal = Math.max(1e-6, maxVal * 1.08);

    const mapX = (x) => padL + Math.max(0, Math.min(1, (x - xMin) / xSpan)) * plotW;
    const mapY = (y) => (H - padB) - Math.max(0, Math.min(1, (y || 0) / maxVal)) * plotH;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'dist-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ariaLabel);

    const axis = document.createElementNS(SVG_NS, 'line');
    axis.setAttribute('x1', String(padL));
    axis.setAttribute('x2', String(W - padR));
    axis.setAttribute('y1', String(H - padB));
    axis.setAttribute('y2', String(H - padB));
    axis.setAttribute('class', 'xy-axis');
    svg.append(axis);

    const col = resolveToneColor(tone, TONE_COLORS.teal);

    // Histogram bars
    for (const b of normBins) {
      const bx0 = mapX(b.x0);
      const bx1 = mapX(b.x1);
      const by = mapY(b.y);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', (bx0 + 0.8).toFixed(1));
      rect.setAttribute('y', by.toFixed(1));
      rect.setAttribute('width', Math.max(1, bx1 - bx0 - 1.6).toFixed(1));
      rect.setAttribute('height', Math.max(0, (H - padB) - by).toFixed(1));
      rect.setAttribute('fill', col);
      rect.setAttribute('fill-opacity', '0.32');
      rect.setAttribute('stroke', col);
      rect.setAttribute('stroke-width', '0.9');
      svg.append(rect);
    }

    // Shaded integral area under curve
    if (shadeRange && curve.length >= 2) {
      const [lo, hi] = [Math.min(shadeRange[0], shadeRange[1]), Math.max(shadeRange[0], shadeRange[1])];
      const sub = curve.filter((pt) => pt.x >= lo && pt.x <= hi);
      if (sub.length >= 2) {
        const dPts = [
          `M ${mapX(sub[0].x).toFixed(1)} ${(H - padB).toFixed(1)}`,
          ...sub.map((pt) => `L ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`),
          `L ${mapX(sub[sub.length - 1].x).toFixed(1)} ${(H - padB).toFixed(1)} Z`,
        ].join(' ');
        const area = document.createElementNS(SVG_NS, 'path');
        area.setAttribute('d', dPts);
        area.setAttribute('fill', TONE_COLORS.amber);
        area.setAttribute('fill-opacity', '0.28');
        svg.append(area);
      }
    }

    // Smooth density curve
    if (curve.length >= 2) {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', col);
      poly.setAttribute('stroke-width', '2.2');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('points', curve.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' '));
      svg.append(poly);
    }

    // Vertical markers
    for (const mk of markers) {
      const mx = mapX(mk.x);
      const mc = resolveToneColor(mk.tone, TONE_COLORS.amber);
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', mx.toFixed(1));
      ln.setAttribute('x2', mx.toFixed(1));
      ln.setAttribute('y1', String(padT));
      ln.setAttribute('y2', String(H - padB));
      ln.setAttribute('stroke', mc);
      ln.setAttribute('stroke-width', '1.3');
      ln.setAttribute('stroke-dasharray', '3 2');
      svg.append(ln);
      if (mk.label) {
        const tx = document.createElementNS(SVG_NS, 'text');
        tx.setAttribute('x', Math.max(padL + 10, Math.min(W - padR - 10, mx)).toFixed(1));
        tx.setAttribute('y', String(padT - 4));
        tx.setAttribute('text-anchor', 'middle');
        tx.setAttribute('class', 'chart-axis-label');
        tx.setAttribute('fill', mc);
        styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
        tx.textContent = mk.label;
        svg.append(tx);
      }
    }

    if (xLabel) {
      const xl = document.createElementNS(SVG_NS, 'text');
      xl.setAttribute('x', (padL + plotW * 0.5).toFixed(1));
      xl.setAttribute('y', String(H - 4));
      xl.setAttribute('text-anchor', 'middle');
      xl.setAttribute('class', 'chart-axis-label');
      styleChartLabel(xl, CHART_LABEL_FONT_SIZE);
      xl.textContent = xLabel;
      svg.append(xl);
    }

    this.bodyEl.replaceChildren(svg);
  }

  /**
   * Render an interactive 2D matrix heatmap (attention weights, Q-table, confusion or stiffness matrix).
   */
  updateHeatmap({
    badge = '',
    matrix = [], // number[][]
    rowLabels = [],
    colLabels = [],
    min = null,
    max = null,
    colormap = 'viridis',
    activeCell = null, // [r, c]
    showValues = true,
    onCellClick = null,
    ariaLabel = '二维矩阵热力图',
  } = {}) {
    this.mode = 'heatmap';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const rows = matrix.length;
    const cols = rows > 0 ? matrix[0].length : 0;
    if (!rows || !cols) {
      this.bodyEl.replaceChildren();
      return;
    }

    let lo = min !== null ? Number(min) : Infinity;
    let hi = max !== null ? Number(max) : -Infinity;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const v = Number(matrix[r][c]);
        if (!Number.isFinite(v)) continue;
        if (min === null && v < lo) lo = v;
        if (max === null && v > hi) hi = v;
      }
    }
    const span = Math.max(1e-6, hi - lo);

    const padL = rowLabels.length ? 36 : 8;
    const padT = colLabels.length ? 22 : 8;
    const padR = 8;
    const padB = 8;
    const cellW = Math.max(26, Math.min(54, Math.floor((264 - padL - padR) / cols)));
    const cellH = Math.max(22, Math.min(36, Math.floor(136 / rows)));
    const W = padL + cols * cellW + padR;
    const H = padT + rows * cellH + padB;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'heatmap-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ariaLabel);

    for (let c = 0; c < cols; c += 1) {
      if (colLabels[c] === undefined) continue;
      const tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('x', (padL + (c + 0.5) * cellW).toFixed(1));
      tx.setAttribute('y', String(padT - 6));
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('class', 'chart-axis-label');
      styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
      tx.textContent = String(colLabels[c]);
      svg.append(tx);
    }

    for (let r = 0; r < rows; r += 1) {
      if (rowLabels[r] !== undefined) {
        const ty = document.createElementNS(SVG_NS, 'text');
        ty.setAttribute('x', String(padL - 5));
        ty.setAttribute('y', (padT + (r + 0.5) * cellH + 4).toFixed(1));
        ty.setAttribute('text-anchor', 'end');
        ty.setAttribute('class', 'chart-axis-label');
        styleChartLabel(ty, CHART_LABEL_FONT_SIZE);
        ty.textContent = String(rowLabels[r]);
        svg.append(ty);
      }

      for (let c = 0; c < cols; c += 1) {
        const v = Number(matrix[r][c]) || 0;
        const norm = (v - lo) / span;
        const { css, luma } = sampleMiniColormap(colormap, norm);
        const x = padL + c * cellW;
        const y = padT + r * cellH;
        const isActive = activeCell && activeCell[0] === r && activeCell[1] === c;

        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', (x + 1).toFixed(1));
        rect.setAttribute('y', (y + 1).toFixed(1));
        rect.setAttribute('width', Math.max(4, cellW - 2).toFixed(1));
        rect.setAttribute('height', Math.max(4, cellH - 2).toFixed(1));
        rect.setAttribute('rx', '3');
        rect.setAttribute('fill', css);
        rect.setAttribute('stroke', isActive ? 'var(--amber, #f59e0b)' : 'var(--bg-elevated, #fff)');
        rect.setAttribute('stroke-width', isActive ? '2.2' : '0.8');
        if (typeof onCellClick === 'function') {
          rect.setAttribute('class', 'heatmap-cell');
          rect.addEventListener('click', () => onCellClick(r, c, v));
        }
        svg.append(rect);

        if (showValues && cellW >= 26) {
          const valEl = document.createElementNS(SVG_NS, 'text');
          valEl.setAttribute('x', (x + cellW * 0.5).toFixed(1));
          valEl.setAttribute('y', (y + cellH * 0.5 + 4).toFixed(1));
          valEl.setAttribute('text-anchor', 'middle');
          valEl.setAttribute('class', 'heatmap-cell-val');
          valEl.setAttribute('fill', luma > 0.56 ? '#141a2c' : '#fffaf2');
          styleChartLabel(valEl, CHART_LABEL_FONT_SIZE);
          valEl.textContent = Number.isInteger(v) ? String(v) : v.toFixed(1);
          svg.append(valEl);
        }
      }
    }

    this.bodyEl.replaceChildren(svg);
  }

  /**
   * Render a hardware / protocol logic-analyzer timing diagram with synchronized time cursor.
   */
  updateTiming({
    badge = '',
    channels = [], // [{ name, tone?, segments: [{ t0, t1, level: 0|1|'bus', label? }] }]
    tMin = 0,
    tMax = 10,
    cursorT = null,
    onScrub = null,
    ariaLabel = '时序逻辑波形图',
  } = {}) {
    this.mode = 'timing';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const rowH = 26;
    const padL = 48;
    const padR = 10;
    const padT = 10;
    const padB = 20;
    const W = 268;
    const H = Math.max(96, padT + channels.length * rowH + padB);
    const plotW = W - padL - padR;
    const span = Math.max(1e-6, tMax - tMin);
    const mapX = (t) => padL + Math.max(0, Math.min(1, (t - tMin) / span)) * plotW;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'timing-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ariaLabel);

    channels.forEach((ch, idx) => {
      const yTop = padT + idx * rowH + 4;
      const yBot = yTop + rowH - 10;
      const yMid = (yTop + yBot) * 0.5;
      const col = resolveToneColor(ch.tone, idx % 2 === 0 ? TONE_COLORS.teal : TONE_COLORS.amber);

      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', String(padL - 6));
      lbl.setAttribute('y', (yMid + 4).toFixed(1));
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('class', 'chart-axis-label');
      styleChartLabel(lbl, CHART_LABEL_FONT_SIZE);
      lbl.textContent = String(ch.name ?? `CH${idx}`);
      svg.append(lbl);

      const segs = ch.segments || [];
      let pathD = '';
      for (const seg of segs) {
        const x0 = mapX(seg.t0);
        const x1 = mapX(seg.t1);
        if (seg.level === 'bus') {
          const r = document.createElementNS(SVG_NS, 'rect');
          r.setAttribute('x', x0.toFixed(1));
          r.setAttribute('y', yTop.toFixed(1));
          r.setAttribute('width', Math.max(2, x1 - x0).toFixed(1));
          r.setAttribute('height', (yBot - yTop).toFixed(1));
          r.setAttribute('rx', '3');
          r.setAttribute('fill', col);
          r.setAttribute('fill-opacity', '0.18');
          r.setAttribute('stroke', col);
          r.setAttribute('stroke-width', '1.4');
          svg.append(r);
          if (seg.label && x1 - x0 >= 22) {
            const bt = document.createElementNS(SVG_NS, 'text');
            bt.setAttribute('x', ((x0 + x1) * 0.5).toFixed(1));
            bt.setAttribute('y', (yMid + 4).toFixed(1));
            bt.setAttribute('text-anchor', 'middle');
            bt.setAttribute('class', 'chart-axis-label');
            bt.setAttribute('fill', 'var(--navy, #18213d)');
            styleChartLabel(bt, CHART_LABEL_FONT_SIZE);
            bt.textContent = seg.label;
            svg.append(bt);
          }
        } else {
          const yy = seg.level ? yTop : yBot;
          pathD += pathD ? ` L ${x0.toFixed(1)} ${yy.toFixed(1)} L ${x1.toFixed(1)} ${yy.toFixed(1)}` : `M ${x0.toFixed(1)} ${yy.toFixed(1)} L ${x1.toFixed(1)} ${yy.toFixed(1)}`;
        }
      }
      if (pathD) {
        const wave = document.createElementNS(SVG_NS, 'path');
        wave.setAttribute('d', pathD);
        wave.setAttribute('fill', 'none');
        wave.setAttribute('stroke', col);
        wave.setAttribute('stroke-width', '1.9');
        wave.setAttribute('stroke-linejoin', 'round');
        svg.append(wave);
      }
    });

    if (cursorT !== null && Number.isFinite(cursorT)) {
      const cx = mapX(cursorT);
      const cur = document.createElementNS(SVG_NS, 'line');
      cur.setAttribute('x1', cx.toFixed(1));
      cur.setAttribute('x2', cx.toFixed(1));
      cur.setAttribute('y1', String(padT));
      cur.setAttribute('y2', String(H - padB + 4));
      cur.setAttribute('stroke', TONE_COLORS.danger);
      cur.setAttribute('stroke-width', '1.5');
      svg.append(cur);
    }

    const scrubFn = typeof onScrub === 'function' ? onScrub : this._onScrub;
    if (scrubFn) {
      svg.style.cursor = 'ew-resize';
      svg.addEventListener('pointerdown', (e) => {
        const rect = svg.getBoundingClientRect?.();
        if (!rect || !rect.width) return;
        const svgX = ((e.clientX - rect.left) / rect.width) * W;
        const u = Math.max(0, Math.min(1, (svgX - padL) / plotW));
        scrubFn(u, tMin + u * span, { type: 'down' });
      });
    }

    this.bodyEl.replaceChildren(svg);
  }

  /**
   * Render a Hero Telemetry KPI readout paired with an inline sparkline trend.
   */
  updateSparkKpi({
    badge = '',
    value = '0',
    unit = '',
    delta = '',
    points = [],
    tone = 'teal',
  } = {}) {
    this.mode = 'spark-kpi';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const wrap = document.createElement('div');
    wrap.className = 'spark-kpi-body';

    const row = document.createElement('div');
    row.className = 'spark-kpi-row';

    const valWrap = document.createElement('div');
    valWrap.className = 'kpi-value-row';
    const valEl = document.createElement('span');
    valEl.className = 'kpi-value';
    valEl.textContent = String(value);
    valWrap.append(valEl);
    if (unit) {
      const unitEl = document.createElement('span');
      unitEl.className = 'kpi-unit';
      unitEl.textContent = String(unit);
      valWrap.append(unitEl);
    }
    row.append(valWrap);

    if (delta) {
      const dEl = document.createElement('span');
      dEl.className = 'kpi-delta';
      dEl.textContent = String(delta);
      row.append(dEl);
    }
    wrap.append(row);

    if (points.length >= 2) {
      const W = 248;
      const H = 48;
      const vals = points.map((p) => (typeof p === 'number' ? p : Number(p.y) || 0));
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const span = Math.max(1e-6, hi - lo);
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('class', 'spark-svg');
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', resolveToneColor(tone, TONE_COLORS.teal));
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute(
        'points',
        vals
          .map((v, idx) => {
            const x = 6 + (idx / Math.max(1, vals.length - 1)) * (W - 12);
            const y = H - 6 - ((v - lo) / span) * (H - 12);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      );
      svg.append(poly);
      wrap.append(svg);
    }

    this.bodyEl.replaceChildren(wrap);
  }
}
