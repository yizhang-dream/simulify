/**
 * Simulify v2.2 Dynamic Field, Flow, Particle & Engineering Annotation Primitives (`kit/field-viz.js`).
 *
 * Visualizes invisible physical & mathematical quantities as pure, reversible functions of `t`:
 * - Perceptually uniform scientific colormaps (`viridis`, `magma`, `coolwarm`, `thermal`, `cividis`, `spectral`)
 *   + DOM `renderColorbar()` legend
 * - `createFlowConduit`: variable-radius 3D conduit with animated directional pulse flow (`setFlowPhase(t)`)
 *   and `0..1` progressive path draw-on (`setDrawProgress(u)`)
 * - `createVectorField`: zero-GC `InstancedMesh` 3D arrow array for magnetic/electric/velocity/gradient fields
 * - `createDeterministicSwarm`: zero-GC `InstancedMesh` 4D particle/electron/photon/droplet stream (`update(t, sampleFn)`)
 * - `createMotionTrail`: zero-GC tapered 3D ribbon trail + optional stroboscopic multi-exposure ghost markers
 * - `createDimensionMeasure`, `createForceArrow`, `createAngleArc`: crisp 3D engineering annotations & vector arrows
 * - `createContourField`: scalar surface with sharp iso-contour bands + scientific colormap (16x anisotropy)
 */

import * as THREE from 'three';
import { createCrispCanvasTexture, canvasFont } from './fonts.js';
import { createHeightfieldSurface, createSculptMaterial, createTaperedConduit } from './geo-sculpt.js';
import { GROUND_LAYER, SOLID_LAYER } from './outline-pass.js';

const clamp01 = (u) => Math.max(0, Math.min(1, Number(u) || 0));

// ============================================================================
// 1. Perceptually Uniform Scientific Colormaps & DOM Colorbar Legend
// ============================================================================

export const COLORMAPS = Object.freeze({
  viridis: [
    [0.267, 0.005, 0.329],
    [0.282, 0.141, 0.458],
    [0.254, 0.265, 0.530],
    [0.191, 0.407, 0.556],
    [0.128, 0.567, 0.551],
    [0.267, 0.679, 0.480],
    [0.565, 0.844, 0.263],
    [0.993, 0.906, 0.144],
  ],
  magma: [
    [0.001, 0.000, 0.014],
    [0.114, 0.065, 0.276],
    [0.316, 0.071, 0.485],
    [0.546, 0.161, 0.506],
    [0.779, 0.244, 0.450],
    [0.953, 0.464, 0.349],
    [0.995, 0.727, 0.494],
    [0.987, 0.991, 0.749],
  ],
  coolwarm: [
    [0.230, 0.299, 0.754],
    [0.384, 0.510, 0.918],
    [0.616, 0.741, 0.996],
    [0.865, 0.865, 0.865],
    [0.961, 0.718, 0.592],
    [0.890, 0.424, 0.333],
    [0.706, 0.016, 0.150],
  ],
  thermal: [
    [0.094, 0.129, 0.239],
    [0.082, 0.420, 0.525],
    [0.078, 0.588, 0.580],
    [0.824, 0.678, 0.235],
    [0.878, 0.420, 0.141],
    [0.784, 0.212, 0.173],
    [0.996, 0.882, 0.620],
  ],
  cividis: [
    [0.000, 0.135, 0.305],
    [0.181, 0.268, 0.423],
    [0.369, 0.388, 0.449],
    [0.548, 0.517, 0.471],
    [0.737, 0.665, 0.443],
    [0.916, 0.824, 0.294],
    [0.996, 0.918, 0.271],
  ],
  spectral: [
    [0.369, 0.310, 0.635],
    [0.196, 0.533, 0.741],
    [0.400, 0.761, 0.647],
    [0.902, 0.961, 0.596],
    [0.996, 0.878, 0.545],
    [0.957, 0.427, 0.263],
    [0.620, 0.004, 0.259],
  ],
});

/**
 * Sample a perceptually uniform colormap at `u in [0, 1]` into `outColor` (or a new THREE.Color).
 * @param {keyof typeof COLORMAPS} name
 * @param {number} u
 * @param {THREE.Color} [outColor]
 */
export function sampleColormap(name = 'viridis', u = 0.5, outColor = new THREE.Color()) {
  const stops = COLORMAPS[name] || COLORMAPS.viridis;
  const x = clamp01(u) * (stops.length - 1);
  const i0 = Math.min(stops.length - 1, Math.floor(x));
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const f = x - i0;
  const a = stops[i0];
  const b = stops[i1];
  outColor.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  return outColor;
}

/** Return a CSS `linear-gradient(...)` string for a named colormap. */
export function colormapCssGradient(name = 'viridis', direction = 'to right') {
  const stops = COLORMAPS[name] || COLORMAPS.viridis;
  const parts = stops.map(([r, g, b], idx) => {
    const pct = Math.round((idx / Math.max(1, stops.length - 1)) * 100);
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}) ${pct}%`;
  });
  return `linear-gradient(${direction}, ${parts.join(', ')})`;
}

/**
 * Render a compact scientific Colorbar Legend into `containerEl`.
 */
export function renderColorbar(
  containerEl,
  { colormap = 'viridis', min = 0, max = 1, mid = null, label = '', unit = '' } = {}
) {
  if (!containerEl) return null;
  const root = document.createElement('div');
  root.className = 'colorbar-legend';

  if (label || unit) {
    const head = document.createElement('div');
    head.className = 'colorbar-head';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    const un = document.createElement('span');
    un.className = 'mono';
    un.textContent = unit;
    head.append(lbl, un);
    root.append(head);
  }

  const strip = document.createElement('div');
  strip.className = 'colorbar-strip';
  strip.style.background = colormapCssGradient(colormap, 'to right');

  const ticks = document.createElement('div');
  ticks.className = 'colorbar-ticks';
  const midVal = mid !== null ? mid : +((Number(min) + Number(max)) * 0.5).toFixed(2);
  for (const val of [min, midVal, max]) {
    const sp = document.createElement('span');
    sp.textContent = String(val);
    ticks.append(sp);
  }

  root.append(strip, ticks);
  containerEl.replaceChildren(root);
  return root;
}

// ============================================================================
// 2. Animated Flow Conduit (`createFlowConduit`) — Pure Function of `t`
// ============================================================================

function createFlowPulseTexture({
  baseColor = '#0f3d44',
  pulseColor = '#2dd4bf',
  chevrons = true,
  pulses = 4,
} = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    const n = 64;
    const data = new Uint8Array(n * 4 * 4);
    const cBase = new THREE.Color(baseColor);
    const cPulse = new THREE.Color(pulseColor);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const wave = 0.5 + 0.5 * Math.sin((x / n) * Math.PI * 2 * pulses);
        const w = Math.pow(wave, 3);
        const idx = (y * n + x) * 4;
        data[idx] = Math.round((cBase.r * (1 - w) + cPulse.r * w) * 255);
        data[idx + 1] = Math.round((cBase.g * (1 - w) + cPulse.g * w) * 255);
        data[idx + 2] = Math.round((cBase.b * (1 - w) + cPulse.b * w) * 255);
        data[idx + 3] = 255;
      }
    }
    const dt = new THREE.DataTexture(data, n, 4, THREE.RGBAFormat);
    dt.wrapS = THREE.RepeatWrapping;
    dt.wrapT = THREE.RepeatWrapping;
    dt.needsUpdate = true;
    return dt;
  }

  const W = 512;
  const H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);

  const count = Math.max(1, Math.round(pulses));
  const segW = W / count;
  for (let i = 0; i < count; i += 1) {
    const x0 = i * segW;
    const grad = ctx.createLinearGradient(x0, 0, x0 + segW * 0.72, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.68, pulseColor);
    grad.addColorStop(0.92, '#ffffff');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, 0, segW * 0.76, H);

    if (chevrons) {
      const tipX = x0 + segW * 0.68;
      ctx.strokeStyle = 'rgba(255,255,255,0.86)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(tipX - 18, 12);
      ctx.lineTo(tipX, H * 0.5);
      ctx.lineTo(tipX - 18, H - 12);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create a variable-radius 3D conduit with traveling directional pulses / chevrons and `0..1` draw-on reveal.
 * Call `conduit.setFlowPhase(t * speed)` and `conduit.setDrawProgress(u)` purely from `t`.
 */
export function createFlowConduit(
  points,
  {
    radius = 0.055,
    baseColor = '#124e52',
    pulseColor = '#2dd4bf',
    pulses = 4,
    chevrons = true,
    emissiveIntensity = 0.42,
    tubularSegments = 56,
    radialSegments = 12,
    capEnds = false,
    layer = SOLID_LAYER,
    name = 'flow-conduit',
  } = {}
) {
  const flowTex = createFlowPulseTexture({ baseColor, pulseColor, chevrons, pulses });
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: flowTex,
    emissive: new THREE.Color(pulseColor),
    emissiveMap: flowTex,
    emissiveIntensity,
    roughness: 0.34,
    metalness: 0.16,
  });

  const mesh = createTaperedConduit(points, radius, {
    tubularSegments,
    radialSegments,
    capEnds,
    material: mat,
    layer,
    name,
  });

  const indexCount = mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count;

  /** Scroll directional pulses as a pure function of phase `p` (e.g. `t * speed`). */
  mesh.setFlowPhase = (phase) => {
    flowTex.offset.x = -((Number(phase) || 0) % 1);
  };

  /** Reveal conduit progressively from start (`u=0`) to end (`u=1`) via zero-GC `setDrawRange`. */
  mesh.setDrawProgress = (u) => {
    const clamped = clamp01(u);
    const trisPerRing = radialSegments * 6;
    const maxRings = Math.floor(indexCount / trisPerRing);
    const activeRings = Math.round(maxRings * clamped);
    mesh.geometry.setDrawRange(0, activeRings * trisPerRing);
    mesh.visible = clamped > 0.002;
    return clamped;
  };

  mesh.flowTexture = flowTex;
  return mesh;
}

// ============================================================================
// 3. Zero-GC 3D Vector Field (`createVectorField`)
// ============================================================================

function buildArrowGeometry() {
  // Lathe profile along +Y from y=0 to y=1: shaft (0..0.68) + flared cone head (0.68..1.0)
  const pts = [
    new THREE.Vector2(0.0001, 0),
    new THREE.Vector2(0.055, 0),
    new THREE.Vector2(0.055, 0.68),
    new THREE.Vector2(0.165, 0.68),
    new THREE.Vector2(0.0001, 1.0),
  ];
  const geo = new THREE.LatheGeometry(pts, 12);
  geo.computeVertexNormals();
  geo.userData.simulifyGeoKind = 'field';
  return geo;
}

/**
 * Create a zero-GC `InstancedMesh` 3D arrow vector field (magnetic, electric, velocity, gradient).
 *
 * @param {number} count Maximum number of vectors
 * @param {{
 *   colormap?: keyof typeof COLORMAPS,
 *   scale?: number,
 *   minLength?: number,
 *   maxLength?: number,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createVectorField(
  count,
  {
    colormap = 'viridis',
    scale = 0.72,
    minLength = 0.04,
    maxLength = 1.4,
    layer = GROUND_LAYER,
    name = 'vector-field',
  } = {}
) {
  const cap = Math.max(1, Math.round(count));
  const geo = buildArrowGeometry();
  const mat = createSculptMaterial('ceramic', {
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.14,
    microTexture: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.layers.set(layer);
  mesh.name = name;
  mesh.userData.simulifyGeoKind = 'field';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();
  const col = new THREE.Color();

  /**
   * Update all arrows in-place from an array of `{ origin, vec, magnitude?, norm? }`
   * or a generator callback `(index, out) => { origin, vec, norm }`.
   */
  mesh.updateVectors = (samplesOrFn, { maxMagnitude = 1, activeCount = cap } = {}) => {
    const isFn = typeof samplesOrFn === 'function';
    const n = Math.min(cap, isFn ? activeCount : (samplesOrFn?.length || 0));
    const maxMag = Math.max(1e-6, Number(maxMagnitude) || 1);
    const scratch = { origin: [0, 0, 0], vec: [0, 1, 0], norm: undefined, visible: true };

    for (let i = 0; i < cap; i += 1) {
      if (i >= n) {
        scl.set(0, 0, 0);
        mat4.compose(pos.set(0, -999, 0), quat.identity(), scl);
        mesh.setMatrixAt(i, mat4);
        continue;
      }
      const item = isFn ? (samplesOrFn(i, scratch) || scratch) : samplesOrFn[i];
      if (!item || item.visible === false) {
        scl.set(0, 0, 0);
        mat4.compose(pos.set(0, -999, 0), quat.identity(), scl);
        mesh.setMatrixAt(i, mat4);
        continue;
      }
      const o = item.origin || [0, 0, 0];
      const v = item.vec || [0, 1, 0];
      const vx = Array.isArray(v) ? v[0] : v.x;
      const vy = Array.isArray(v) ? v[1] : v.y;
      const vz = Array.isArray(v) ? v[2] : v.z;
      const mag = Math.hypot(vx, vy, vz);
      if (mag < 1e-5) {
        scl.set(0, 0, 0);
        mat4.compose(pos.set(0, -999, 0), quat.identity(), scl);
        mesh.setMatrixAt(i, mat4);
        continue;
      }

      dir.set(vx / mag, vy / mag, vz / mag);
      quat.setFromUnitVectors(up, dir);
      const norm = item.norm !== undefined ? clamp01(item.norm) : clamp01(mag / maxMag);
      const len = Math.max(minLength, Math.min(maxLength, (0.28 + 0.72 * norm) * scale));
      const rad = scale * (0.55 + 0.45 * norm);

      pos.set(Array.isArray(o) ? o[0] : o.x, Array.isArray(o) ? o[1] : o.y, Array.isArray(o) ? o[2] : o.z);
      scl.set(rad, len, rad);
      mat4.compose(pos, quat, scl);
      mesh.setMatrixAt(i, mat4);

      if (item.color !== undefined) {
        col.set(item.color);
      } else {
        sampleColormap(colormap, norm, col);
      }
      mesh.setColorAt(i, col);
    }

    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return n;
  };

  return mesh;
}

// ============================================================================
// 4. Deterministic 4D Instanced Particle Swarm (`createDeterministicSwarm`)
// ============================================================================

/**
 * Create a zero-GC `InstancedMesh` 4D particle/electron/photon/droplet swarm driven purely by `t`.
 * Supports reversible forward/backward timeline scrubbing with zero state accumulation drift.
 */
export function createDeterministicSwarm(
  count,
  {
    shape = 'sphere',
    radius = 0.06,
    color = 0x2dd4bf,
    emissive = 0x149694,
    emissiveIntensity = 0.45,
    layer = GROUND_LAYER,
    name = 'deterministic-swarm',
  } = {}
) {
  const cap = Math.max(1, Math.round(count));
  const geo =
    shape === 'octa'
      ? new THREE.OctahedronGeometry(radius, 0)
      : shape === 'capsule'
        ? new THREE.CapsuleGeometry(radius * 0.6, radius * 1.4, 4, 8)
        : new THREE.IcosahedronGeometry(radius, 1);
  geo.userData.simulifyGeoKind = 'swarm';

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
    roughness: 0.28,
    metalness: 0.12,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.layers.set(layer);
  mesh.name = name;
  mesh.userData.simulifyGeoKind = 'swarm';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const mat4 = new THREE.Matrix4();
  const col = new THREE.Color(color);
  const defaultColor = new THREE.Color(color);

  /**
   * Evaluate deterministic state at global time `t`.
   * `sampleFn(index, t, out)` fills `{ x, y, z, scale, color, visible }`.
   */
  mesh.update = (t, sampleFn) => {
    if (typeof sampleFn !== 'function') return 0;
    const time = Number(t) || 0;
    let visibleCount = 0;
    const out = { x: 0, y: 0, z: 0, scale: 1, color: null, visible: true };

    for (let i = 0; i < cap; i += 1) {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      out.scale = 1;
      out.color = null;
      out.visible = true;

      sampleFn(i, time, out);
      if (!out.visible || out.scale <= 1e-4) {
        scl.set(0, 0, 0);
        mat4.compose(pos.set(0, -999, 0), quat.identity(), scl);
        mesh.setMatrixAt(i, mat4);
        continue;
      }

      visibleCount += 1;
      pos.set(out.x, out.y, out.z);
      scl.setScalar(out.scale);
      mat4.compose(pos, quat.identity(), scl);
      mesh.setMatrixAt(i, mat4);

      if (out.color !== null && out.color !== undefined) {
        if (out.color.isColor) col.copy(out.color);
        else col.set(out.color);
      } else {
        col.copy(defaultColor);
      }
      mesh.setColorAt(i, col);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return visibleCount;
  };

  return mesh;
}

// ============================================================================
// 5. Tapered Motion Ribbon & Stroboscopic Multi-Exposure Trail (`createMotionTrail`)
// ============================================================================

/**
 * Create a zero-GC tapered 3D motion ribbon trail with optional stroboscopic multi-exposure markers.
 */
export function createMotionTrail(
  maxPoints = 64,
  {
    width = 0.08,
    color = '#149694',
    tailColor = '#f6eddd',
    opacity = 0.88,
    strobeCount = 0,
    strobeRadius = 0.08,
    layer = GROUND_LAYER,
    name = 'motion-trail',
  } = {}
) {
  const cap = Math.max(2, Math.round(maxPoints));
  const positions = new Float32Array(cap * 2 * 3);
  const colors = new Float32Array(cap * 2 * 3);
  const indices = [];
  for (let i = 0; i < cap - 1; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.setDrawRange(0, 0);
  geo.userData.simulifyGeoKind = 'trail';

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.08,
    transparent: opacity < 0.99,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const ribbon = new THREE.Mesh(geo, mat);
  ribbon.layers.set(layer);
  ribbon.userData.simulifyGeoKind = 'trail';

  const group = new THREE.Group();
  group.name = name;
  group.userData.simulifyGeoKind = 'trail';
  group.add(ribbon);

  let strobeMesh = null;
  if (strobeCount > 0) {
    const sGeo = new THREE.SphereGeometry(strobeRadius, 14, 10);
    sGeo.userData.simulifyGeoKind = 'trail';
    const sMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    strobeMesh = new THREE.InstancedMesh(sGeo, sMat, Math.round(strobeCount));
    strobeMesh.layers.set(layer);
    strobeMesh.userData.simulifyGeoKind = 'trail';
    strobeMesh.count = 0;
    group.add(strobeMesh);
  }

  const cHead = new THREE.Color(color);
  const cTail = new THREE.Color(tailColor);
  const cTmp = new THREE.Color();
  const tang = new THREE.Vector3();
  const side = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  const altUp = new THREE.Vector3(1, 0, 0);
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const ptPos = new THREE.Vector3();

  group.ribbonMesh = ribbon;
  group.strobeMesh = strobeMesh;

  /** Update ribbon vertices in-place from an ordered array of `[x,y,z]` or `THREE.Vector3` points (tail -> head). */
  group.updateTrail = (pts = []) => {
    const n = Math.min(cap, pts.length);
    if (n < 2) {
      geo.setDrawRange(0, 0);
      if (strobeMesh) strobeMesh.count = 0;
      return 0;
    }

    const readP = (idx) => {
      const p = pts[idx];
      return Array.isArray(p) ? [p[0], p[1], p[2]] : [p.x, p.y, p.z];
    };

    for (let i = 0; i < n; i += 1) {
      const u = i / Math.max(1, n - 1);
      const cur = readP(i);
      const prev = readP(Math.max(0, i - 1));
      const next = readP(Math.min(n - 1, i + 1));
      tang.set(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      if (tang.lengthSq() < 1e-10) tang.set(1, 0, 0);
      else tang.normalize();

      const ref = Math.abs(tang.dot(upVec)) > 0.92 ? altUp : upVec;
      side.crossVectors(tang, ref).normalize();
      const halfW = width * 0.5 * (0.18 + 0.82 * u);

      const base = i * 6;
      positions[base] = cur[0] - side.x * halfW;
      positions[base + 1] = cur[1] - side.y * halfW;
      positions[base + 2] = cur[2] - side.z * halfW;
      positions[base + 3] = cur[0] + side.x * halfW;
      positions[base + 4] = cur[1] + side.y * halfW;
      positions[base + 5] = cur[2] + side.z * halfW;

      cTmp.copy(cTail).lerp(cHead, u);
      colors[base] = cTmp.r;
      colors[base + 1] = cTmp.g;
      colors[base + 2] = cTmp.b;
      colors[base + 3] = cTmp.r;
      colors[base + 4] = cTmp.g;
      colors[base + 5] = cTmp.b;
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    geo.setDrawRange(0, (n - 1) * 6);

    if (strobeMesh && strobeCount > 0) {
      const sc = Math.min(strobeCount, n);
      for (let k = 0; k < sc; k += 1) {
        const u = sc > 1 ? k / (sc - 1) : 1;
        const idx = Math.min(n - 1, Math.round(u * (n - 1)));
        const p = readP(idx);
        ptPos.set(p[0], p[1], p[2]);
        scl.setScalar(0.55 + 0.45 * u);
        mat4.compose(ptPos, quat.identity(), scl);
        strobeMesh.setMatrixAt(k, mat4);
      }
      strobeMesh.count = sc;
      strobeMesh.instanceMatrix.needsUpdate = true;
    }
    return n;
  };

  return group;
}

// ============================================================================
// 6. 3D Engineering Annotations: Dimension Measure, Force Arrow, Angle Arc
// ============================================================================

function resolvePlaqueBg(colorStr, explicitBg) {
  if (explicitBg) return explicitBg;
  const c = new THREE.Color(colorStr);
  const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (luma > 0.34) return 'rgba(13, 21, 36, 0.94)';
  const theme = typeof document !== 'undefined' ? document.documentElement?.dataset?.theme : '';
  const isDarkTheme = theme === 'dark-studio' || theme === 'blueprint' || theme === 'obsidian-gallery';
  if (isDarkTheme && luma > 0.06) return 'rgba(13, 21, 36, 0.94)';
  return 'rgba(250, 244, 232, 0.94)';
}

function makePlaqueMesh(text, { color = '#18213d', bg, width = 0.98, height = 0.30 } = {}) {
  let labelStr = String(text ?? '');
  const resolvedBg = resolvePlaqueBg(color, bg);
  const tex = createCrispCanvasTexture(THREE, {
    width: 512,
    height: 160,
    draw(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      const r = 24;
      ctx.fillStyle = resolvedBg;
      ctx.beginPath();
      ctx.roundRect?.(8, 8, w - 16, h - 16, r) ?? ctx.rect(8, 8, w - 16, h - 16);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = canvasFont('mono', 56, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelStr, w * 0.5, h * 0.52, w - 40);
    },
  });
  // Camera-facing Sprite keeps 3D dimension/force/angle plaques crisp and readable at any orbit angle
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, height, 1);
  sprite.layers.set(GROUND_LAYER);
  sprite.userData.simulifyInternal = true;
  sprite.setText = (next) => {
    const str = String(next ?? '');
    if (str !== labelStr) {
      labelStr = str;
      tex.redraw();
    }
  };
  sprite.plaqueTexture = tex;
  return sprite;
}

/**
 * Create a 3D engineering dimension measure with extension ticks, double arrowheads, and live plaque.
 */
export function createDimensionMeasure(
  pA = [0, 0, 0],
  pB = [2, 0, 0],
  { offset = [0, 0.45, 0], label = '2.0 m', color = '#18213d', tickSize = 0.14, layer = GROUND_LAYER } = {}
) {
  const group = new THREE.Group();
  group.name = 'dimension-measure';
  group.userData.simulifyInternal = true;

  const lineMat = new THREE.LineBasicMaterial({ color });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.layers.set(layer);
  lines.userData.simulifyInternal = true;

  const coneGeo = new THREE.ConeGeometry(0.055, 0.18, 10);
  const coneMat = createSculptMaterial('anodized', { color, microTexture: false });
  const headA = new THREE.Mesh(coneGeo, coneMat);
  const headB = new THREE.Mesh(coneGeo, coneMat);
  headA.layers.set(layer);
  headB.layers.set(layer);
  headA.userData.simulifyInternal = true;
  headB.userData.simulifyInternal = true;

  const plaque = makePlaqueMesh(label, { color });
  group.add(lines, headA, headB, plaque);

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vOff = new THREE.Vector3();
  const dA = new THREE.Vector3();
  const dB = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  group.updateMeasure = (nextA, nextB, nextLabel) => {
    vA.set(nextA[0], nextA[1], nextA[2]);
    vB.set(nextB[0], nextB[1], nextB[2]);
    vOff.set(offset[0], offset[1], offset[2]);
    dA.copy(vA).add(vOff);
    dB.copy(vB).add(vOff);
    const arr = lineGeo.attributes.position.array;
    // Main span + 2 extension lines
    arr.set([
      dA.x, dA.y, dA.z, dB.x, dB.y, dB.z,
      vA.x, vA.y, vA.z, dA.x + (vOff.x ? Math.sign(vOff.x) * tickSize : 0), dA.y + (vOff.y ? Math.sign(vOff.y) * tickSize : 0), dA.z + (vOff.z ? Math.sign(vOff.z) * tickSize : 0),
      vB.x, vB.y, vB.z, dB.x + (vOff.x ? Math.sign(vOff.x) * tickSize : 0), dB.y + (vOff.y ? Math.sign(vOff.y) * tickSize : 0), dB.z + (vOff.z ? Math.sign(vOff.z) * tickSize : 0),
    ]);
    lineGeo.attributes.position.needsUpdate = true;

    dir.subVectors(dB, dA);
    const len = dir.length();
    if (len > 1e-4) {
      dir.divideScalar(len);
      headB.position.copy(dB).addScaledVector(dir, -0.09);
      headB.quaternion.setFromUnitVectors(up, dir);
      headA.position.copy(dA).addScaledVector(dir, 0.09);
      headA.quaternion.setFromUnitVectors(up, dir.clone().negate());
    }
    plaque.position.copy(dA).lerp(dB, 0.5);
    plaque.position.y += 0.22;
    if (nextLabel !== undefined) plaque.setText(nextLabel);
  };

  group.updateMeasure(pA, pB, label);
  return group;
}

/**
 * Create a sculpted 3D force / velocity / field vector arrow with optional plaque.
 */
export function createForceArrow(
  origin = [0, 0, 0],
  vec = [0, 1.5, 0],
  { color = '#c96d24', radius = 0.045, label = '', layer = SOLID_LAYER } = {}
) {
  const group = new THREE.Group();
  group.name = 'force-arrow';
  group.userData.simulifyGeoKind = 'field';

  const arrowGeo = buildArrowGeometry();
  const arrowMat = createSculptMaterial('ceramic', { color, roughness: 0.34, metalness: 0.18, microTexture: false });
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.castShadow = true;
  arrowMesh.receiveShadow = true;
  arrowMesh.layers.set(layer);
  arrowMesh.userData.simulifyGeoKind = 'field';
  group.add(arrowMesh);

  const plaque = label ? makePlaqueMesh(label, { color, width: 0.72, height: 0.24 }) : null;
  if (plaque) group.add(plaque);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();

  group.updateArrow = (nextOrigin, nextVec, nextLabel) => {
    const ox = Array.isArray(nextOrigin) ? nextOrigin[0] : nextOrigin.x;
    const oy = Array.isArray(nextOrigin) ? nextOrigin[1] : nextOrigin.y;
    const oz = Array.isArray(nextOrigin) ? nextOrigin[2] : nextOrigin.z;
    const vx = Array.isArray(nextVec) ? nextVec[0] : nextVec.x;
    const vy = Array.isArray(nextVec) ? nextVec[1] : nextVec.y;
    const vz = Array.isArray(nextVec) ? nextVec[2] : nextVec.z;
    const mag = Math.hypot(vx, vy, vz);
    group.visible = mag > 1e-4;
    if (!group.visible) return 0;

    group.position.set(ox, oy, oz);
    dir.set(vx / mag, vy / mag, vz / mag);
    arrowMesh.quaternion.setFromUnitVectors(up, dir);
    const sRad = radius / 0.055;
    arrowMesh.scale.set(sRad, mag, sRad);
    if (plaque) {
      plaque.position.copy(dir).multiplyScalar(mag + 0.22);
      if (nextLabel !== undefined) plaque.setText(nextLabel);
    }
    return mag;
  };

  group.updateArrow(origin, vec, label);
  return group;
}

/**
 * Create a 3D circular sector & arc annotation measuring the angle between two directions.
 */
export function createAngleArc(
  center = [0, 0, 0],
  dirA = [1, 0, 0],
  dirB = [0.7, 0.7, 0],
  { radius = 0.75, color = '#149694', opacity = 0.28, segments = 24, label = '' } = {}
) {
  const group = new THREE.Group();
  group.name = 'angle-arc';
  group.userData.simulifyInternal = true;

  const segs = Math.max(8, Math.round(segments));
  const fanPos = new Float32Array((segs + 2) * 3);
  const fanIdx = [];
  for (let i = 1; i <= segs; i += 1) fanIdx.push(0, i, i + 1);
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute('position', new THREE.BufferAttribute(fanPos, 3));
  fanGeo.setIndex(fanIdx);
  const fanMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  const fanMesh = new THREE.Mesh(fanGeo, fanMat);
  fanMesh.layers.set(GROUND_LAYER);
  fanMesh.userData.simulifyInternal = true;

  const arcPos = new Float32Array((segs + 1) * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color }));
  arcLine.layers.set(GROUND_LAYER);
  arcLine.userData.simulifyInternal = true;

  const plaque = label ? makePlaqueMesh(label, { color, width: 0.68, height: 0.24 }) : null;
  group.add(fanMesh, arcLine);
  if (plaque) group.add(plaque);

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const q = new THREE.Quaternion();

  group.updateAngle = (nextCenter, nextA, nextB, nextLabel) => {
    group.position.set(nextCenter[0], nextCenter[1], nextCenter[2]);
    vA.set(nextA[0], nextA[1], nextA[2]).normalize();
    vB.set(nextB[0], nextB[1], nextB[2]).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, vA.dot(vB))));
    axis.crossVectors(vA, vB);
    if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0);
    else axis.normalize();

    fanPos[0] = 0;
    fanPos[1] = 0;
    fanPos[2] = 0;
    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      q.setFromAxisAngle(axis, angle * u);
      pt.copy(vA).applyQuaternion(q).multiplyScalar(radius);
      fanPos[(i + 1) * 3] = pt.x;
      fanPos[(i + 1) * 3 + 1] = pt.y;
      fanPos[(i + 1) * 3 + 2] = pt.z;
      arcPos[i * 3] = pt.x;
      arcPos[i * 3 + 1] = pt.y;
      arcPos[i * 3 + 2] = pt.z;
    }
    fanGeo.attributes.position.needsUpdate = true;
    arcGeo.attributes.position.needsUpdate = true;

    if (plaque) {
      q.setFromAxisAngle(axis, angle * 0.5);
      plaque.position.copy(vA).applyQuaternion(q).multiplyScalar(radius * 1.28);
      if (nextLabel !== undefined) plaque.setText(nextLabel);
    }
    return (angle * 180) / Math.PI;
  };

  group.updateAngle(center, dirA, dirB, label);
  return group;
}

// ============================================================================
// 7. Crisp Iso-Contour Scalar Heightfield (`createContourField`)
// ============================================================================

function bakeContourTexture(scalarFn, {
  resolution = 256,
  min = 0,
  max = 1,
  levels = 10,
  colormap = 'viridis',
  contourColor = [20, 26, 44],
  contourOpacity = 0.52,
  lineWidth = 0.075,
} = {}) {
  const n = Math.max(32, Math.min(512, Math.round(resolution)));
  const data = new Uint8Array(n * n * 4);
  const span = Math.max(1e-6, max - min);
  const tmp = new THREE.Color();

  for (let iy = 0; iy < n; iy += 1) {
    const v = iy / (n - 1);
    for (let ix = 0; ix < n; ix += 1) {
      const u = ix / (n - 1);
      const raw = Number(scalarFn(u, v)) || 0;
      const norm = clamp01((raw - min) / span);
      sampleColormap(colormap, norm, tmp);

      let r = tmp.r * 255;
      let g = tmp.g * 255;
      let b = tmp.b * 255;

      if (levels > 0) {
        const scaled = norm * levels;
        const frac = Math.abs(scaled - Math.round(scaled));
        if (frac < lineWidth) {
          const blend = (1 - frac / lineWidth) * contourOpacity;
          r = r * (1 - blend) + contourColor[0] * blend;
          g = g * (1 - blend) + contourColor[1] * blend;
          b = b * (1 - blend) + contourColor[2] * blend;
        }
      }

      const idx = (iy * n + ix) * 4;
      data[idx] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create a continuous 3D heightfield surface textured with crisp scientific iso-contour bands
 * and perceptually uniform colormap (works identically on WebGPU & WebGL2, zero GLSL divergence).
 */
export function createContourField({
  width = 6,
  depth = 4.5,
  segsX = 48,
  segsZ = 36,
  heightFn = (u, v) => Math.sin(u * Math.PI) * Math.sin(v * Math.PI),
  scalarFn = null,
  min = 0,
  max = 1,
  levels = 10,
  colormap = 'viridis',
  textureSize = 256,
  skirt = true,
  skirtBottom = -0.35,
  skirtColor = null,
  name = 'contour-field',
} = {}) {
  const sFn = typeof scalarFn === 'function' ? scalarFn : heightFn;
  const contourTex = bakeContourTexture(sFn, {
    resolution: textureSize,
    min,
    max,
    levels,
    colormap,
  });

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: contourTex,
    roughness: 0.44,
    metalness: 0.06,
  });

  const activeTheme = typeof document !== 'undefined' ? document.documentElement?.dataset?.theme : '';
  const isDarkTheme = activeTheme === 'dark-studio' || activeTheme === 'blueprint' || activeTheme === 'obsidian-gallery';
  const skirtMat = skirt
    ? createSculptMaterial('travertine', {
        color: skirtColor ?? (isDarkTheme ? 0x26354d : 0xd4c6b0),
        roughness: 0.78,
        metalness: 0.05,
        microTexture: false,
      })
    : null;

  const mesh = createHeightfieldSurface({
    width,
    depth,
    segsX,
    segsZ,
    heightFn,
    skirt,
    baseY: skirtBottom,
    material: mat,
    skirtMaterial: skirtMat,
    name,
  });

  mesh.contourTexture = contourTex;
  mesh.updateField = (nextHeightFn, nextOpts = {}) => {
    const fnH = nextHeightFn || heightFn;
    const fnS = nextOpts.scalarFn || fnH;
    mesh.updateHeights(fnH);
    const nextTex = bakeContourTexture(fnS, {
      resolution: nextOpts.textureSize ?? textureSize,
      min: nextOpts.min ?? min,
      max: nextOpts.max ?? max,
      levels: nextOpts.levels ?? levels,
      colormap: nextOpts.colormap ?? colormap,
    });
    const prev = mat.map;
    mat.map = nextTex;
    mat.needsUpdate = true;
    mesh.contourTexture = nextTex;
    prev?.dispose?.();
  };

  return mesh;
}
