const SVG_NS = 'http://www.w3.org/2000/svg';

const clamp01 = (u) => Math.max(0, Math.min(1, Number(u) || 0));
const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Trim an edge endpoint along the ray from node center `(cx, cy)` toward `(tx, ty)` onto the padded box border. */
function clipPointToNodeRect(cx, cy, w, h, tx, ty, pad = 3) {
  const dx = tx - cx;
  const dy = ty - cy;
  const halfW = w * 0.5 + pad;
  const halfH = h * 0.5 + pad;
  const sx = Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * Track B reusable stage for network protocols, packet flows, and state-machine timelines.
 * - 100% theme-aware across all 6 Simulify skins via semantic CSS variables (`.s2d-*`)
 * - Deterministic 4D packet scheduling (`setPacketSchedule(packets)` + `evaluate(t)`)
 *   for exact forward/backward `SpacetimeClock` scrubbing & offline video export
 * - Backward-compatible one-shot `animatePacket()` helper for interactive triggers
 */
export class SvgFlowStage {
  constructor(containerEl, { width = 760, height = 420, onSelectNode = null } = {}) {
    this.container = containerEl;
    this.width = width;
    this.height = height;
    this.onSelectNode = onSelectNode;
    this.reducedMotion =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    this.nodes = new Map();
    this.edges = new Map();
    this._schedule = [];
    this._packetLayerSvg = null;
    this._packetEls = new Map();
    this._lastT = 0;

    this.container.classList.add('stage-2d-wrap');
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('class', 'stage-2d-svg');

    this.packetsLayer = document.createElement('div');
    this.packetsLayer.className = 'stage-2d-packets';
    this.container.replaceChildren(this.svg, this.packetsLayer);
  }

  setTopology({ nodes = [], edges = [] }) {
    this.nodes.clear();
    this.edges.clear();
    this._packetEls.clear();
    this.svg.replaceChildren();

    const defs = document.createElementNS(SVG_NS, 'defs');
    const makeArrowMarker = (id, fillVar) => {
      const marker = document.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8.5');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      const arrowPath = document.createElementNS(SVG_NS, 'path');
      arrowPath.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
      arrowPath.setAttribute('fill', fillVar);
      marker.append(arrowPath);
      return marker;
    };
    defs.append(
      makeArrowMarker('s2d-arrow', 'var(--ink-secondary, #475569)'),
      makeArrowMarker('s2d-arrow-active', 'var(--accent, #149694)')
    );
    this.svg.append(defs);

    const edgesGroup = document.createElementNS(SVG_NS, 'g');
    edgesGroup.setAttribute('class', 's2d-edges');
    const nodesGroup = document.createElementNS(SVG_NS, 'g');
    nodesGroup.setAttribute('class', 's2d-nodes');
    const packetSvgGroup = document.createElementNS(SVG_NS, 'g');
    packetSvgGroup.setAttribute('class', 's2d-packets-svg');
    this._packetLayerSvg = packetSvgGroup;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const aw = a.w ?? 132;
      const ah = a.h ?? 60;
      const bw = b.w ?? 132;
      const bh = b.h ?? 60;
      const mx = (a.x + b.x) / 2;
      const my = Math.min(a.y, b.y) - (e.arc ?? 0);
      const aimFromA = Math.hypot(mx - a.x, my - a.y) > 1 ? { x: mx, y: my } : { x: b.x, y: b.y };
      const aimFromB = Math.hypot(mx - b.x, my - b.y) > 1 ? { x: mx, y: my } : { x: a.x, y: a.y };
      const pStart = clipPointToNodeRect(a.x, a.y, aw, ah, aimFromA.x, aimFromA.y, 2);
      const pEnd = clipPointToNodeRect(b.x, b.y, bw, bh, aimFromB.x, aimFromB.y, 5);
      const line = document.createElementNS(SVG_NS, 'path');
      const d = `M ${pStart.x.toFixed(1)} ${pStart.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${pEnd.x.toFixed(1)} ${pEnd.y.toFixed(1)}`;
      line.setAttribute('d', d);
      line.setAttribute('class', 's2d-edge');
      line.setAttribute('marker-end', 'url(#s2d-arrow)');
      edgesGroup.append(line);
      this.edges.set(e.id, { ...e, a, b, pStart, pEnd, cx: mx, cy: my, el: line });
    }

    for (const n of nodes) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 's2d-node');
      g.dataset.nodeId = String(n.id);
      g.style.cursor = this.onSelectNode ? 'pointer' : 'default';
      const w = n.w ?? 132;
      const h = n.h ?? 60;

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 's2d-node-rect');
      rect.setAttribute('x', n.x - w / 2);
      rect.setAttribute('y', n.y - h / 2);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('rx', '10');

      const title = document.createElementNS(SVG_NS, 'text');
      title.setAttribute('class', 's2d-node-title');
      title.setAttribute('x', n.x);
      title.setAttribute('y', n.y - 4);
      title.setAttribute('text-anchor', 'middle');
      title.textContent = n.label;

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('class', 's2d-node-sub');
      sub.setAttribute('x', n.x);
      sub.setAttribute('y', n.y + 15);
      sub.setAttribute('text-anchor', 'middle');
      sub.textContent = n.sub ?? '';

      g.append(rect, title, sub);
      if (this.onSelectNode) {
        g.addEventListener('click', () => this.onSelectNode(n));
      }
      nodesGroup.append(g);
      this.nodes.set(n.id, { ...n, el: g });
    }

    this.svg.append(edgesGroup, nodesGroup, packetSvgGroup);
    if (this._schedule.length > 0) {
      this.evaluate(this._lastT);
    }
  }

  /** Highlight active node IDs cleanly via `[data-active="true"]`. */
  setActiveNodes(ids = []) {
    const active = new Set(ids);
    for (const [id, n] of this.nodes.entries()) {
      if (active.has(id)) n.el.dataset.active = 'true';
      else delete n.el.dataset.active;
    }
  }

  /** Highlight active edge IDs cleanly via `[data-active="true"]`. */
  setActiveEdges(ids = []) {
    const active = new Set(ids);
    for (const [id, e] of this.edges.entries()) {
      if (active.has(id)) {
        e.el.dataset.active = 'true';
        e.el.setAttribute('marker-end', 'url(#s2d-arrow-active)');
      } else {
        delete e.el.dataset.active;
        e.el.setAttribute('marker-end', 'url(#s2d-arrow)');
      }
    }
  }

  /**
   * Register a deterministic 4D packet/signal schedule driven purely by `evaluate(t)`.
   * Each item: `{ id, from, to, edgeId?, start, end, label, tone?, arc? }`.
   */
  setPacketSchedule(packets = []) {
    this._schedule = Array.isArray(packets)
      ? packets.map((p, idx) => ({
          id: String(p.id ?? `pkt-${idx}`),
          from: p.from,
          to: p.to,
          edgeId: p.edgeId ?? null,
          start: Number(p.start) || 0,
          end: Math.max(Number(p.start) || 0, Number(p.end) || (Number(p.start) || 0) + 1),
          label: String(p.label ?? ''),
          tone: p.tone || 'teal',
          arc: p.arc ?? 0,
        }))
      : [];
    this._packetEls.clear();
    this._packetLayerSvg?.replaceChildren();
    return this;
  }

  /**
   * Pure function of time `t`: positions all scheduled packets along their quadratic Bezier edges,
   * supporting exact forward/backward scrubbing and video export.
   */
  evaluate(t) {
    const time = Math.max(0, Number(t) || 0);
    this._lastT = time;
    if (!this._packetLayerSvg) return [];

    const activePackets = [];
    for (const pkt of this._schedule) {
      const a = this.nodes.get(pkt.from);
      const b = this.nodes.get(pkt.to);
      if (!a || !b) continue;

      const edge = pkt.edgeId ? this.edges.get(pkt.edgeId) : null;
      const inWindow = time >= pkt.start && time <= pkt.end;
      let entry = this._packetEls.get(pkt.id);

      if (!inWindow) {
        if (entry) entry.g.style.display = 'none';
        continue;
      }

      const raw = pkt.end > pkt.start ? clamp01((time - pkt.start) / (pkt.end - pkt.start)) : 1;
      const u = easeInOutCubic(raw);
      const p0 = edge?.pStart || a;
      const p2 = edge?.pEnd || b;
      const cx = edge ? edge.cx : (a.x + b.x) * 0.5;
      const cy = edge ? edge.cy : Math.min(a.y, b.y) - pkt.arc;
      const omt = 1 - u;
      const px = omt * omt * p0.x + 2 * omt * u * cx + u * u * p2.x;
      const py = omt * omt * p0.y + 2 * omt * u * cy + u * u * p2.y;

      if (!entry) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 's2d-packet');
        const pillW = Math.max(54, pkt.label.length * 8.5 + 18);
        const pillH = 24;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', 's2d-packet-pill');
        rect.dataset.tone = pkt.tone;
        rect.setAttribute('x', (-pillW * 0.5).toFixed(1));
        rect.setAttribute('y', (-pillH * 0.5).toFixed(1));
        rect.setAttribute('width', pillW.toFixed(1));
        rect.setAttribute('height', String(pillH));
        rect.setAttribute('rx', '12');

        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('class', 's2d-packet-text');
        txt.setAttribute('x', '0');
        txt.setAttribute('y', '4');
        txt.setAttribute('text-anchor', 'middle');
        txt.textContent = pkt.label;

        g.append(rect, txt);
        this._packetLayerSvg.append(g);
        entry = { g, rect, txt };
        this._packetEls.set(pkt.id, entry);
      }

      entry.g.style.display = '';
      entry.g.setAttribute('transform', `translate(${px.toFixed(1)}, ${py.toFixed(1)})`);
      activePackets.push({ id: pkt.id, x: px, y: py, u });
    }
    return activePackets;
  }

  /** One-shot interactive packet pulse (for non-scheduled click triggers). */
  animatePacket({ from, to, label, tone = 'teal', duration = 640 }) {
    const a = this.nodes.get(from);
    const b = this.nodes.get(to);
    if (!a || !b) return;

    const chip = document.createElement('div');
    chip.className = 'float-popup';
    chip.dataset.tone = tone;
    chip.textContent = label;
    this.packetsLayer.append(chip);

    const x0 = `${(a.x / this.width) * 100}%`;
    const y0 = `${(a.y / this.height) * 100}%`;
    const x1 = `${(b.x / this.width) * 100}%`;
    const y1 = `${(b.y / this.height) * 100}%`;

    if (this.reducedMotion || typeof chip.animate !== 'function') {
      chip.style.left = x1;
      chip.style.top = y1;
      chip.style.transform = 'translate(-50%, -50%)';
      setTimeout(() => chip.remove(), 450);
      return;
    }

    const anim = chip.animate(
      [
        { left: x0, top: y0, transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.9 },
        { left: x1, top: y1, transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ],
      { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
    );
    anim.onfinish = () => setTimeout(() => chip.remove(), 180);
  }
}
