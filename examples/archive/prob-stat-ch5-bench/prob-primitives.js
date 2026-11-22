import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Concept A domain primitives: stone instrument decks, L² projection rig,
 * histogram bar field, arrival rail and Gaussian target dome.
 * Every probability object is built by one of these factories so the same
 * concept looks identical in all five acts.
 */

export const COLORS = {
  stone: '#dad5c7',
  stoneDark: '#c5bfb0',
  navy: '#28344f',
  orange: '#d96b43',
  blue: '#3a6fa3',
  sage: '#488a6d',
  amber: '#c7922e',
  ink: '#18213d',
};

const stdMat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.16, ...extra });

export const DECK_SIZE = { w: 3.0, d: 3.4, h: 0.25 };
export const DECK_TOP = DECK_SIZE.h;

function plateTexture(text, sub = '') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = COLORS.ink;
  g.font = '700 54px "Cascadia Code", "Segoe UI", monospace';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, 14, sub ? 46 : 64);
  if (sub) {
    g.fillStyle = '#656a73';
    g.font = '600 30px "Segoe UI", "PingFang SC", sans-serif';
    g.fillText(sub, 16, 100);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function flatLabel(text, sub, w = 1.5, h = 0.375) {
  const mat = new THREE.MeshBasicMaterial({ map: plateTexture(text, sub), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Stone instrument deck with a raised plinth and engraved nameplate. */
export function makeDeck({ x = 0, label = '', sub = '' } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, 0);
  g.userData.baseX = x;

  const slab = new THREE.Mesh(
    new RoundedBoxGeometry(DECK_SIZE.w, DECK_SIZE.h, DECK_SIZE.d, 3, 0.07),
    stdMat(COLORS.stone, { roughness: 0.55 })
  );
  slab.position.y = DECK_SIZE.h / 2;
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);

  const inset = new THREE.Mesh(
    new RoundedBoxGeometry(DECK_SIZE.w - 0.34, 0.04, DECK_SIZE.d - 0.34, 2, 0.02),
    stdMat('#ece6d6', { roughness: 0.7, metalness: 0.05 })
  );
  inset.position.y = DECK_TOP + 0.02;
  inset.receiveShadow = true;
  g.add(inset);

  if (label) {
    const plate = flatLabel(label, sub);
    plate.position.set(-0.55, DECK_TOP + 0.052, DECK_SIZE.d / 2 - 0.3);
    g.add(plate);
  }
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Shaft + cone arrow between two world points. */
export class Arrow3D {
  constructor(color, radius = 0.035) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10), stdMat(color));
    this.head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.8, radius * 7, 14), stdMat(color));
    this.group.add(this.shaft, this.head);
    this.shaft.castShadow = true;
    this.head.castShadow = true;
  }

  set(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    dir.normalize();
    const headLen = Math.min(this.radius * 7, len * 0.4);
    const shaftLen = Math.max(1e-3, len - headLen);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    this.shaft.quaternion.copy(q);
    this.shaft.scale.set(1, shaftLen, 1);
    this.shaft.position.copy(from).addScaledVector(dir, shaftLen / 2);
    this.head.quaternion.copy(q);
    this.head.scale.setScalar(headLen / (this.radius * 7));
    this.head.position.copy(from).addScaledVector(dir, shaftLen + headLen / 2);
  }
}

function thinBar(from, to, color, thickness = 0.014) {
  const len = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, len, thickness), new THREE.MeshBasicMaterial({ color }));
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3().subVectors(to, from).normalize());
  return mesh;
}

/** Act 1: glass L² prism with the span(1, Z) plane and the right-angled X, M, X−M triangle. */
export class ProjectionRig {
  constructor(deck) {
    this.group = new THREE.Group();
    this.group.position.y = DECK_TOP;
    deck.add(this.group);

    const glassMat = new THREE.MeshStandardMaterial({
      color: '#bfd2de',
      transparent: true,
      opacity: 0.16,
      roughness: 0.1,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.1, 2.7, 2, 0.04), glassMat);
    glass.position.y = 1.08;
    this.group.add(glass);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.5, 2.1, 2.7)),
      new THREE.LineBasicMaterial({ color: '#7a8a98', transparent: true, opacity: 0.7 })
    );
    edges.position.y = 1.08;
    this.group.add(edges);

    const plane = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 2.4), stdMat(COLORS.sage, { transparent: true, opacity: 0.88 }));
    plane.position.y = 0.06;
    plane.receiveShadow = true;
    this.group.add(plane);
    const tag = flatLabel('span(1, Z)', '', 1.3, 0.325);
    tag.position.set(-0.45, 0.08, 0.95);
    this.group.add(tag);

    this.arrowX = new Arrow3D(COLORS.blue, 0.04);
    this.arrowM = new Arrow3D(COLORS.navy, 0.04);
    this.arrowR = new Arrow3D(COLORS.orange, 0.03);
    this.group.add(this.arrowX.group, this.arrowM.group, this.arrowR.group);

    this.marker = new THREE.Group();
    this.group.add(this.marker);
    this.origin = new THREE.Vector3(-0.85, 0.09, 0.8);
    this.points = { xTip: new THREE.Vector3(), mFoot: new THREE.Vector3(), resid: new THREE.Vector3() };
  }

  update({ normX = 2, normM = 1.2 } = {}) {
    const nx = Math.max(1e-6, normX);
    const nm = Math.max(0, Math.min(nx, normM));
    const s = 1.55 / nx;
    const az = (-34 * Math.PI) / 180;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const o = this.origin;
    const mPt = o.clone().addScaledVector(d, nm * s);
    const h = Math.sqrt(Math.max(0, nx * nx - nm * nm)) * s;
    const xPt = mPt.clone().add(new THREE.Vector3(0, h, 0));
    this.arrowM.set(o, mPt);
    this.arrowX.set(o, xPt);
    this.arrowR.set(mPt, xPt);

    this.marker.clear();
    const side = new THREE.Vector3().crossVectors(UP, d).normalize();
    const k = 0.16;
    const a = mPt.clone().addScaledVector(d, -k);
    const b = a.clone().add(new THREE.Vector3(0, k, 0));
    const c = mPt.clone().add(new THREE.Vector3(0, k, 0));
    if (h > 0.2 && nm > 0.2) {
      this.marker.add(thinBar(a, b, COLORS.ink), thinBar(b, c, COLORS.ink));
    }
    void side;

    this.points.xTip.copy(xPt).y += DECK_TOP;
    this.points.mFoot.copy(mPt).y += DECK_TOP;
    this.points.resid.copy(mPt).lerp(xPt, 0.5).y += DECK_TOP;
    for (const key of Object.keys(this.points)) {
      this.points[key].x += this.group.parent.position.x;
    }
  }
}

/** Acts 1–5: pooled histogram bars with a thin blue "ghost" reference tick over each bar. */
export class BarField {
  constructor(deck, { max = 21, width = 2.5, depth = 0.34, maxHeight = 1.5, z = -0.5 } = {}) {
    this.group = new THREE.Group();
    this.group.position.y = DECK_TOP;
    deck.add(this.group);
    this.max = max;
    this.width = width;
    this.depth = depth;
    this.maxHeight = maxHeight;
    this.z = z;

    const tray = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.06, depth + 0.28), stdMat(COLORS.navy, { roughness: 0.6 }));
    tray.position.set(0, 0.03, z);
    this.group.add(tray);

    this.bars = [];
    this.ghosts = [];
    this.ghostStems = [];
    const barMat = [stdMat(COLORS.orange), stdMat(COLORS.blue)];
    const ghostMat = new THREE.MeshBasicMaterial({ color: '#e7f0fb' });
    const stemMat = stdMat('#7b8aa6', { transparent: true, opacity: 0.55 });
    for (let i = 0; i < max; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), barMat[i % 2]);
      bar.castShadow = true;
      bar.receiveShadow = true;
      bar.visible = false;
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
      ghost.visible = false;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stemMat);
      stem.visible = false;
      this.group.add(bar, ghost, stem);
      this.bars.push(bar);
      this.ghosts.push(ghost);
      this.ghostStems.push(stem);
    }
    this.points = { barPeak: new THREE.Vector3(), barMid: new THREE.Vector3() };
  }

  update(bars = []) {
    const list = bars.slice(0, this.max);
    const n = list.length;
    let maxVal = 1e-9;
    let maxAll = 1e-9;
    for (const b of list) {
      const av = Math.abs(b.value) || 0;
      const ag = Math.abs(b.ghost) || 0;
      maxVal = Math.max(maxVal, av);
      maxAll = Math.max(maxAll, av, ag);
    }
    const top = maxAll > maxVal * 3 ? maxVal : maxAll;
    const slot = this.width / Math.max(1, n);
    const bw = Math.min(0.34, slot * 0.72);
    let peakIdx = 0;
    let peakVal = -1;
    this.bars.forEach((bar, i) => {
      const ghost = this.ghosts[i];
      const stem = this.ghostStems[i];
      if (i >= n) {
        bar.visible = false;
        ghost.visible = false;
        stem.visible = false;
        return;
      }
      const item = list[i];
      const v = Math.max(0, Number(item.value) || 0);
      const h = Math.max(0.015, (v / top) * this.maxHeight);
      const x = -this.width / 2 + slot * (i + 0.5);
      bar.visible = true;
      bar.scale.set(bw, h, this.depth);
      bar.position.set(x, 0.06 + h / 2, this.z);
      if (v > peakVal) {
        peakVal = v;
        peakIdx = i;
      }
      if (item.ghost !== undefined && item.ghost !== null && Number.isFinite(item.ghost) && item.ghost > 1e-6) {
        const gh = Math.min(this.maxHeight * 1.15, Math.max(0.015, (item.ghost / top) * this.maxHeight));
        ghost.visible = true;
        ghost.scale.set(bw * 1.25, 0.032, this.depth * 1.18);
        ghost.position.set(x, 0.06 + gh, this.z);
        if (gh > h + 0.08) {
          stem.visible = true;
          stem.scale.set(bw * 0.22, gh, this.depth * 0.22);
          stem.position.set(x, 0.06 + gh / 2, this.z);
        } else {
          stem.visible = false;
        }
      } else {
        ghost.visible = false;
        stem.visible = false;
      }
    });

    const peakBar = this.bars[peakIdx];
    const midBar = this.bars[Math.floor(n / 2)] || peakBar;
    const ox = this.group.parent.position.x;
    this.points.barPeak.set(peakBar.position.x + ox, DECK_TOP + peakBar.position.y + peakBar.scale.y / 2, this.z);
    this.points.barMid.set(midBar.position.x + ox, DECK_TOP + midBar.position.y + midBar.scale.y / 2, this.z);
  }
}

/** Acts 2 & 4: amber arrival rail with landed / pending event pins and a time cursor. */
export class ArrivalRail {
  constructor(deck, { length = 2.5, z = 0.95, pins = 14 } = {}) {
    this.group = new THREE.Group();
    this.group.position.y = DECK_TOP;
    deck.add(this.group);
    this.length = length;
    this.z = z;

    const rail = new THREE.Mesh(new THREE.BoxGeometry(length + 0.2, 0.06, 0.16), stdMat(COLORS.amber, { roughness: 0.45 }));
    rail.position.set(0, 0.03, z);
    rail.receiveShadow = true;
    this.group.add(rail);

    this.pins = [];
    const landed = stdMat(COLORS.amber);
    const pending = stdMat('#a9a395', { transparent: true, opacity: 0.7 });
    for (let i = 0; i < pins; i += 1) {
      const pin = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8), stdMat(COLORS.ink));
      stick.position.y = 0.16;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), landed.clone());
      bulb.position.y = 0.34;
      bulb.castShadow = true;
      pin.add(stick, bulb);
      pin.visible = false;
      pin.userData = { bulb, landed, pending };
      this.group.add(pin);
      this.pins.push(pin);
    }

    this.cursor = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.3), stdMat(COLORS.navy));
    this.cursor.position.set(-length / 2, 0.2, z);
    this.group.add(this.cursor);
    this.points = { railPin: new THREE.Vector3(), railCursor: new THREE.Vector3() };
  }

  update(rail = null) {
    const visible = Boolean(rail && Number.isFinite(rail.tMax) && rail.tMax > 0);
    this.group.visible = visible;
    if (!visible) return;
    const tMax = rail.tMax;
    const t = Math.max(0, Math.min(tMax, Number(rail.t) || 0));
    const arrivals = Array.isArray(rail.arrivals) ? rail.arrivals : [];
    const ox = this.group.parent.position.x;
    const xOf = (time) => -this.length / 2 + (Math.max(0, Math.min(tMax, time)) / tMax) * this.length;
    let lastLanded = null;
    this.pins.forEach((pin, i) => {
      if (i >= arrivals.length) {
        pin.visible = false;
        return;
      }
      const at = arrivals[i];
      pin.visible = true;
      pin.position.set(xOf(at), 0, this.z);
      const done = at <= t + 1e-9;
      pin.userData.bulb.material = done ? pin.userData.landed : pin.userData.pending;
      if (done) lastLanded = pin;
    });
    this.cursor.position.x = xOf(t);
    this.points.railCursor.set(xOf(t) + ox, DECK_TOP + 0.4, this.z);
    const ref = lastLanded || this.pins.find((p) => p.visible);
    if (ref) {
      this.points.railPin.set(ref.position.x + ox, DECK_TOP + 0.46, this.z);
    } else {
      this.points.railPin.copy(this.points.railCursor);
    }
  }
}

/** Act 5: concentric Gaussian target rings with a glass threshold hemisphere for the 3D case. */
export class TargetDome {
  constructor(deck) {
    this.group = new THREE.Group();
    this.group.position.set(0, DECK_TOP, 0);
    deck.add(this.group);
    this.discMax = 1.2;

    this.discs = [];
    for (let i = 0; i < 5; i += 1) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 0.03, 48),
        stdMat(i % 2 === 0 ? COLORS.blue : COLORS.orange, { roughness: 0.6 })
      );
      disc.position.y = 0.02 + (4 - i) * 0.003 + 0.0;
      disc.receiveShadow = true;
      this.group.add(disc);
      this.discs.push(disc);
    }

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: '#e8f0f6',
        transparent: true,
        opacity: 0.22,
        roughness: 0.08,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.dome.position.y = 0.035;
    this.group.add(this.dome);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.016, 8, 72),
      new THREE.MeshBasicMaterial({ color: COLORS.ink })
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    const axisMat = new THREE.MeshBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.55 });
    const ax1 = new THREE.Mesh(new THREE.BoxGeometry(this.discMax * 2.1, 0.006, 0.012), axisMat);
    const ax2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, this.discMax * 2.1), axisMat);
    ax1.position.y = 0.05;
    ax2.position.y = 0.05;
    this.group.add(ax1, ax2);
    this.points = { domeTop: new THREE.Vector3(), ringEdge: new THREE.Vector3() };
  }

  update(dome = null) {
    const d = dome || {};
    const rings = Array.isArray(d.rings) && d.rings.length ? d.rings : null;
    const rMaxRing = rings ? Math.max(...rings.map((r) => r.r)) : 5;
    const unit = this.discMax / (rMaxRing || 1);
    this.discs.forEach((disc, i) => {
      const frac = rings ? (rings[Math.min(rings.length - 1, 4 - i)]?.r ?? rMaxRing) / rMaxRing : (5 - i) / 5;
      disc.scale.set(this.discMax * frac, 1, this.discMax * frac);
    });
    const radius = Number.isFinite(d.radius) ? d.radius : 1.5;
    const world = Math.max(0.25, Math.min(this.discMax, radius * unit));
    const is3d = d.dim === 3;
    this.dome.visible = is3d;
    this.dome.scale.setScalar(world);
    this.ring.scale.set(world, world, world);
    const ox = this.group.parent.position.x;
    this.points.domeTop.set(ox, DECK_TOP + 0.035 + (is3d ? world : 0.1), 0);
    this.points.ringEdge.set(ox + world * 0.72, DECK_TOP + 0.08, world * 0.72);
  }
}
