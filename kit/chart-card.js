const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Reusable collapsible floating telemetry / diagram card supporting:
 * - 'compare': side-by-side meters and live slot chips
 * - 'hysteresis': live SVG XY state loop with threshold guides and flow arrows
 * - 'xy': general multi-series XY coordinate plot with ghost baseline, threshold marks,
 *   live dot, non-colliding Y-axis title/ticks, and smooth hover/click-to-scrub (`onScrub`).
 */
export class ChartCard {
  constructor(rootEl, { title = '实时图表', mode = 'compare', collapsed = false, onScrub = null } = {}) {
    this.root = rootEl;
    this.mode = mode;
    this.collapsed = collapsed;
    this._onScrub = typeof onScrub === 'function' ? onScrub : null;
    this._scrubMeta = null;

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
      tx.setAttribute('y', H - 6);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('class', 'hyst-label');
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

  /**
   * Render a general scientific XY plot with multi-series curves, counterfactual ghost curve(s),
   * critical threshold marks, live operating point dot, non-colliding Y-axis title/ticks,
   * and optional interactive click/drag scrubbing (`onScrub(xNorm, value)`).
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

    const toneColor = {
      teal: 'var(--teal, #149694)',
      amber: 'var(--amber, #c96d24)',
      danger: 'var(--danger, #b83b3b)',
      navy: 'var(--navy, #18213d)',
    };

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'xy-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ariaLabel);
    if (scrubHandler) {
      svg.style.cursor = 'ew-resize';
      svg.style.touchAction = 'none';
    }

    // Subtle horizontal grid guides & Y bounds (kept cleanly inside left gutter x <= padL - 5)
    for (const frac of [0, 0.5, 1]) {
      const yVal = yMin + frac * (yMax - yMin);
      const yy = mapY(yVal);
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', padL);
      ln.setAttribute('x2', W - padR);
      ln.setAttribute('y1', yy.toFixed(1));
      ln.setAttribute('y2', yy.toFixed(1));
      ln.setAttribute('class', 'xy-axis');
      svg.append(ln);

      if (frac !== 0.5) {
        const lbl = document.createElementNS(SVG_NS, 'text');
        lbl.setAttribute('x', String(padL - 5));
        lbl.setAttribute('y', (yy + 3.2).toFixed(1));
        lbl.setAttribute('text-anchor', 'end');
        lbl.setAttribute('class', 'xy-label');
        lbl.textContent = Number.isInteger(yVal) ? String(yVal) : yVal.toFixed(1);
        svg.append(lbl);
      }
    }

    // Critical threshold marks
    for (const mk of marks) {
      const col = toneColor[mk.tone] || toneColor.amber;
      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('stroke', col);
      ln.setAttribute('stroke-width', '1.2');
      ln.setAttribute('stroke-dasharray', '3 3');
      if (mk.axis === 'x') {
        const xx = mapX(mk.value).toFixed(1);
        ln.setAttribute('x1', xx);
        ln.setAttribute('x2', xx);
        ln.setAttribute('y1', padT);
        ln.setAttribute('y2', H - padB);
        svg.append(ln);
        if (mk.label) {
          const tx = document.createElementNS(SVG_NS, 'text');
          const clampedTx = Math.max(padL + (yLabel ? 46 : 8), Math.min(W - padR - 6, Number(xx)));
          tx.setAttribute('x', clampedTx.toFixed(1));
          tx.setAttribute('y', String(padT - 5));
          tx.setAttribute('text-anchor', 'middle');
          tx.setAttribute('class', 'xy-label');
          tx.setAttribute('fill', col);
          tx.textContent = mk.label;
          svg.append(tx);
        }
      } else {
        const yy = mapY(mk.value).toFixed(1);
        ln.setAttribute('x1', padL);
        ln.setAttribute('x2', W - padR);
        ln.setAttribute('y1', yy);
        ln.setAttribute('y2', yy);
        svg.append(ln);
        if (mk.label) {
          const tx = document.createElementNS(SVG_NS, 'text');
          tx.setAttribute('x', String(W - padR - 2));
          tx.setAttribute('y', (Number(yy) - 3).toFixed(1));
          tx.setAttribute('text-anchor', 'end');
          tx.setAttribute('class', 'xy-label');
          tx.setAttribute('fill', col);
          tx.textContent = mk.label;
          svg.append(tx);
        }
      }
    }

    // Optional counterfactual / theoretical ghost baseline curve(s)
    const ghostList = [];
    if (ghost && Array.isArray(ghost.points) && ghost.points.length >= 2) ghostList.push(ghost);
    if (Array.isArray(ghosts)) {
      for (const g of ghosts) {
        if (g && Array.isArray(g.points) && g.points.length >= 2) ghostList.push(g);
      }
    }
    for (const g of ghostList) {
      const gp = document.createElementNS(SVG_NS, 'polyline');
      gp.setAttribute('class', 'xy-ghost');
      gp.setAttribute('fill', 'none');
      gp.setAttribute('stroke', g.tone ? (toneColor[g.tone] || g.tone) : 'var(--muted, #656a73)');
      gp.setAttribute('stroke-width', String(g.width ?? 1.55));
      gp.setAttribute('stroke-dasharray', g.dash ?? '4 3');
      gp.setAttribute('stroke-opacity', String(g.opacity ?? 0.62));
      gp.setAttribute(
        'points',
        g.points.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
      );
      svg.append(gp);
    }

    // Live series curves
    for (const s of series) {
      if (!Array.isArray(s.points) || s.points.length < 2) continue;
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', toneColor[s.tone] || toneColor.teal);
      poly.setAttribute('stroke-width', s.dashed ? '1.6' : '2.2');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('stroke-linecap', 'round');
      if (s.dashed) poly.setAttribute('stroke-dasharray', '4 3');
      poly.setAttribute(
        'points',
        s.points.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
      );
      svg.append(poly);
    }

    // Axis captions — yLabel sits cleanly at x=padL above the plot top edge, never colliding with left ticks
    if (xLabel) {
      const xl = document.createElementNS(SVG_NS, 'text');
      xl.setAttribute('x', ((padL + W - padR) / 2).toFixed(1));
      xl.setAttribute('y', String(H - 5));
      xl.setAttribute('text-anchor', 'middle');
      xl.setAttribute('class', 'xy-label');
      xl.textContent = xLabel;
      svg.append(xl);
    }
    if (yLabel) {
      const yl = document.createElementNS(SVG_NS, 'text');
      yl.setAttribute('x', String(padL));
      yl.setAttribute('y', '11');
      yl.setAttribute('text-anchor', 'start');
      yl.setAttribute('class', 'xy-label');
      yl.textContent = yLabel;
      svg.append(yl);
    }

    // Optional scrub crosshair line
    const crosshair = document.createElementNS(SVG_NS, 'line');
    crosshair.setAttribute('y1', String(padT));
    crosshair.setAttribute('y2', String(H - padB));
    crosshair.setAttribute('stroke', 'var(--navy, #18213d)');
    crosshair.setAttribute('stroke-width', '1.15');
    crosshair.setAttribute('stroke-opacity', '0.55');
    crosshair.setAttribute('stroke-dasharray', '2 2');
    if (scrubX !== null && Number.isFinite(scrubX)) {
      const sx = mapX(scrubX).toFixed(1);
      crosshair.setAttribute('x1', sx);
      crosshair.setAttribute('x2', sx);
      crosshair.style.display = '';
    } else {
      crosshair.style.display = 'none';
    }
    svg.append(crosshair);

    // Live operating dot
    if (dot && Number.isFinite(dot.x) && Number.isFinite(dot.y)) {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', mapX(dot.x).toFixed(1));
      c.setAttribute('cy', mapY(dot.y).toFixed(1));
      c.setAttribute('r', '4.8');
      c.setAttribute('fill', toneColor[dot.tone] || toneColor.teal);
      c.setAttribute('stroke', 'var(--card, #fffaf2)');
      c.setAttribute('stroke-width', '2');
      svg.append(c);
    }

    if (scrubHandler) {
      this._scrubMeta = { W, padL, plotW, xMin, xSpan };
      let activePointerId = null;

      const emitFromClientX = (clientX, meta) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const svgX = ((clientX - rect.left) / rect.width) * W;
        const xNorm = Math.max(0, Math.min(1, (svgX - padL) / plotW));
        const val = xMin + xNorm * xSpan;
        const clampedSvgX = padL + xNorm * plotW;
        crosshair.setAttribute('x1', clampedSvgX.toFixed(1));
        crosshair.setAttribute('x2', clampedSvgX.toFixed(1));
        crosshair.style.display = '';
        scrubHandler(xNorm, val, meta);
      };

      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        activePointerId = e.pointerId;
        svg.setPointerCapture?.(e.pointerId);
        emitFromClientX(e.clientX, { dragging: true, type: 'down' });
      });
      svg.addEventListener('pointermove', (e) => {
        if (activePointerId === e.pointerId) {
          emitFromClientX(e.clientX, { dragging: true, type: 'drag' });
        } else if (activePointerId === null) {
          emitFromClientX(e.clientX, { dragging: false, type: 'hover' });
        }
      });
      const finishDrag = (e) => {
        if (activePointerId !== e.pointerId) return;
        activePointerId = null;
        try {
          svg.releasePointerCapture?.(e.pointerId);
        } catch {
          // Ignore if already released
        }
      };
      svg.addEventListener('pointerup', finishDrag);
      svg.addEventListener('pointercancel', finishDrag);
      svg.addEventListener('pointerleave', () => {
        if (activePointerId === null && (scrubX === null || !Number.isFinite(scrubX))) {
          crosshair.style.display = 'none';
        }
      });
    }

    this.bodyEl.replaceChildren(svg);
  }
}
