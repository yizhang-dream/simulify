const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Track B reusable stage for network protocols, packet flows, and state-machine timelines.
 * Combines semantic SVG endpoints/wires with WAAPI animated traveling packet chips.
 */
export class SvgFlowStage {
  constructor(containerEl, { width = 760, height = 420, onSelectNode = null } = {}) {
    this.container = containerEl;
    this.width = width;
    this.height = height;
    this.onSelectNode = onSelectNode;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.nodes = new Map();
    this.edges = new Map();

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
    this.svg.replaceChildren();

    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 's2d-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS(SVG_NS, 'path');
    arrowPath.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
    arrowPath.setAttribute('fill', '#18213d');
    marker.append(arrowPath);
    defs.append(marker);
    this.svg.append(defs);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const line = document.createElementNS(SVG_NS, 'path');
      const mx = (a.x + b.x) / 2;
      const d = `M ${a.x} ${a.y} Q ${mx} ${Math.min(a.y, b.y) - (e.arc ?? 0)} ${b.x} ${b.y}`;
      line.setAttribute('d', d);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#cec0ad');
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('marker-end', 'url(#s2d-arrow)');
      this.svg.append(line);
      this.edges.set(e.id, { ...e, a, b, el: line });
    }

    for (const n of nodes) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 's2d-node');
      g.style.cursor = this.onSelectNode ? 'pointer' : 'default';
      const w = n.w ?? 128;
      const h = n.h ?? 58;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', n.x - w / 2);
      rect.setAttribute('y', n.y - h / 2);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('rx', '10');
      rect.setAttribute('fill', '#faf4e8');
      rect.setAttribute('stroke', '#18213d');
      rect.setAttribute('stroke-width', '1.8');

      const title = document.createElementNS(SVG_NS, 'text');
      title.setAttribute('x', n.x);
      title.setAttribute('y', n.y - 4);
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('font-weight', '700');
      title.setAttribute('font-size', '13');
      title.setAttribute('fill', '#18213d');
      title.textContent = n.label;

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('x', n.x);
      sub.setAttribute('y', n.y + 14);
      sub.setAttribute('text-anchor', 'middle');
      sub.setAttribute('font-size', '11');
      sub.setAttribute('fill', '#656a73');
      sub.textContent = n.sub ?? '';

      g.append(rect, title, sub);
      if (this.onSelectNode) {
        g.addEventListener('click', () => this.onSelectNode(n));
      }
      this.svg.append(g);
      this.nodes.set(n.id, { ...n, el: g });
    }
  }

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

    if (this.reducedMotion) {
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
