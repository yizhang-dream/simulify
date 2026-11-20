const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Reusable collapsible floating telemetry / diagram card supporting:
 * - 'compare': side-by-side meters and live slot chips
 * - 'hysteresis': live SVG XY state loop with threshold guides
 * - 'xy': general multi-series XY coordinate plot with ghost baseline, threshold marks & live dot
 */
export class ChartCard {
  constructor(rootEl, { title = '实时图表', mode = 'compare', collapsed = false } = {}) {
    this.root = rootEl;
    this.mode = mode;
    this.collapsed = collapsed;

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

    // Ideal loop envelope faint underlay when hysteresis > 0
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
   * Render a general scientific XY plot with multi-series curves, theoretical ghost curve,
   * critical threshold marks, and live operating point dot.
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
    marks = [],
    dot = null,
    ariaLabel = '坐标曲线图',
  } = {}) {
    this.mode = 'xy';
    this.badgeEl.textContent = badge;

    const W = 256;
    const H = 122;
    const padL = 32;
    const padR = 12;
    const padT = 14;
    const padB = 24;
    const xSpan = Math.max(1e-6, xMax - xMin);
    const ySpan = Math.max(1e-6, yMax - yMin);
    const mapX = (x) => padL + (Math.max(0, Math.min(1, (x - xMin) / xSpan))) * (W - padL - padR);
    const mapY = (y) => (H - padB) - (Math.max(0, Math.min(1, (y - yMin) / ySpan))) * (H - padT - padB);

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

    // Subtle horizontal grid guides & Y bounds
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
        lbl.setAttribute('x', padL - 4);
        lbl.setAttribute('y', (yy + 3).toFixed(1));
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
          tx.setAttribute('x', xx);
          tx.setAttribute('y', padT - 3);
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
          tx.setAttribute('x', W - padR - 2);
          tx.setAttribute('y', (Number(yy) - 3).toFixed(1));
          tx.setAttribute('text-anchor', 'end');
          tx.setAttribute('class', 'xy-label');
          tx.setAttribute('fill', col);
          tx.textContent = mk.label;
          svg.append(tx);
        }
      }
    }

    // Optional theoretical ghost baseline curve
    if (ghost && Array.isArray(ghost.points) && ghost.points.length >= 2) {
      const gp = document.createElementNS(SVG_NS, 'polyline');
      gp.setAttribute('class', 'xy-ghost');
      gp.setAttribute(
        'points',
        ghost.points.map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`).join(' ')
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

    // Axis captions
    if (xLabel) {
      const xl = document.createElementNS(SVG_NS, 'text');
      xl.setAttribute('x', ((padL + W - padR) / 2).toFixed(1));
      xl.setAttribute('y', H - 5);
      xl.setAttribute('text-anchor', 'middle');
      xl.setAttribute('class', 'xy-label');
      xl.textContent = xLabel;
      svg.append(xl);
    }
    if (yLabel) {
      const yl = document.createElementNS(SVG_NS, 'text');
      yl.setAttribute('x', '6');
      yl.setAttribute('y', padT - 3);
      yl.setAttribute('class', 'xy-label');
      yl.textContent = yLabel;
      svg.append(yl);
    }

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

    this.bodyEl.replaceChildren(svg);
  }
}
