const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_LABEL_FONT_SIZE = 11.5;

const TONE_COLORS = {
  teal: 'var(--teal, #149694)',
  amber: 'var(--amber, #c96d24)',
  danger: 'var(--danger, #b83b3b)',
  navy: 'var(--navy, #18213d)',
};

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
      fill.className = `meter-fill ${row.tone === 'amber' ? 'fifo' : ''}`;
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
    xMin = 16,
    xMax = 24,
    thresholds = [18, 22],
    points = [], // [{ x, y (0 or 1) }]
    current = { x: 20, y: 0 },
  }) {
    this.mode = 'hysteresis';
    this._xy = null;
    this.badgeEl.textContent = badge;

    const W = 252;
    const H = 114;
    const padL = 28;
    const padR = 12;
    const padT = 14;
    const padB = 22;
    const mapX = (x) => padL + ((x - xMin) / Math.max(1e-6, xMax - xMin)) * (W - padL - padR);
    const mapY = (y) => (y ? padT + 14 : H - padB - 14);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'hyst-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '温度与加热开关滞回曲线');

    // Horizontal ON/OFF guide rails
    for (const [val, label] of [[1, '开'], [0, '关']]) {
      const yy = mapY(val);
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', padL);
      ln.setAttribute('x2', W - padR);
      ln.setAttribute('y1', yy);
      ln.setAttribute('y2', yy);
      ln.setAttribute('stroke', '#d9ceb8');
      ln.setAttribute('stroke-width', '1');
      svg.append(ln);

      const tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('x', '6');
      tx.setAttribute('y', yy + 4);
      tx.setAttribute('class', 'hyst-label');
      styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
      tx.textContent = label;
      svg.append(tx);
    }

    // Threshold vertical dashed guides
    for (const th of thresholds) {
      const xx = mapX(th);
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', xx);
      ln.setAttribute('x2', xx);
      ln.setAttribute('y1', padT);
      ln.setAttribute('y2', H - padB);
      ln.setAttribute('stroke', th <= 19 ? '#c96d24' : '#149694');
      ln.setAttribute('stroke-width', '1.2');
      ln.setAttribute('stroke-dasharray', '3 3');
      svg.append(ln);

      const tx = document.createElementNS(SVG_NS, 'text');
      tx.setAttribute('x', xx);
      tx.setAttribute('y', H - 5);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('class', 'hyst-label');
      styleChartLabel(tx, CHART_LABEL_FONT_SIZE);
      tx.textContent = `${th}°`;
      svg.append(tx);
    }

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
      ghost.setAttribute('stroke', '#18213d22');
      ghost.setAttribute('stroke-width', '1.2');
      ghost.setAttribute('stroke-dasharray', '2 2');
      svg.append(ghost);

      const midX = (xLo + xHi) / 2;
      const topChevron = document.createElementNS(SVG_NS, 'path');
      topChevron.setAttribute('d', `M ${(midX - 3).toFixed(1)} ${(yOn - 3).toFixed(1)} L ${(midX + 2.5).toFixed(1)} ${yOn.toFixed(1)} L ${(midX - 3).toFixed(1)} ${(yOn + 3).toFixed(1)}`);
      topChevron.setAttribute('fill', 'none');
      topChevron.setAttribute('stroke', '#c96d24');
      topChevron.setAttribute('stroke-width', '1.4');
      topChevron.setAttribute('stroke-linecap', 'round');

      const botChevron = document.createElementNS(SVG_NS, 'path');
      botChevron.setAttribute('d', `M ${(midX + 3).toFixed(1)} ${(yOff - 3).toFixed(1)} L ${(midX - 2.5).toFixed(1)} ${yOff.toFixed(1)} L ${(midX + 3).toFixed(1)} ${(yOff + 3).toFixed(1)}`);
      botChevron.setAttribute('fill', 'none');
      botChevron.setAttribute('stroke', '#149694');
      botChevron.setAttribute('stroke-width', '1.4');
      botChevron.setAttribute('stroke-linecap', 'round');
      svg.append(topChevron, botChevron);
    }

    // Live traversed path
    if (points.length >= 2) {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#18213d');
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
    dot.setAttribute('fill', current.y ? '#c96d24' : '#149694');
    dot.setAttribute('stroke', '#fffaf2');
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
}
