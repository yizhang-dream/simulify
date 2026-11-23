import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createXRayMaterial } from './geo-sculpt.js';
import { HtmlSurfaceManager, supportsHtmlInCanvas } from './html-surface.js';
import {
  GLASS_LAYER,
  GROUND_LAYER,
  OUTLINE_PRESETS,
  OutlinePass,
  SOLID_LAYER,
  SURFACE_LAYER,
} from './outline-pass.js';

export { GLASS_LAYER, GROUND_LAYER, SOLID_LAYER, SURFACE_LAYER };

const DEG = Math.PI / 180;
const MAX_DPR = 3;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const CUBOID_GEO_TYPES = new Set(['BoxGeometry', 'RoundedBoxGeometry', 'PlaneGeometry']);
const CUBOID_KINDS = new Set(['box', 'cuboid', 'rounded-box', 'roundedbox', 'plane', 'slab']);
const PRIMITIVE_GEO_TYPES = new Set([
  'CylinderGeometry',
  'SphereGeometry',
  'ConeGeometry',
  'RingGeometry',
  'CircleGeometry',
  'CapsuleGeometry',
]);
const PRIMITIVE_KINDS = new Set(['cylinder', 'sphere', 'cone', 'ring', 'circle', 'capsule']);
const SCULPTED_GEO_TYPES = new Set([
  'LatheGeometry',
  'ExtrudeGeometry',
  'TubeGeometry',
  'TorusGeometry',
  'TorusKnotGeometry',
  'ShapeGeometry',
  'PolyhedronGeometry',
  'IcosahedronGeometry',
  'OctahedronGeometry',
  'DodecahedronGeometry',
  'TetrahedronGeometry',
  'BufferGeometry',
]);

export const PRIMER_THEMES = new Set(['paper-ink', 'monochrome-print']);

/**
 * Procedural high-contrast dark-wall Studio Softbox / Lightformer environment for PMREM baking.
 * Replaces bright-wall `RoomEnvironment(sigma=0.04)` gray wash with crisp specular strips
 * and dark negative-fill baffles — zero external HDRI/EXR assets, works identically on
 * WebGPURenderer and WebGLRenderer.
 */
export class StudioLightformerEnvironment extends THREE.Scene {
  constructor() {
    super();
    this.name = 'StudioLightformerEnvironment';

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.deleteAttribute('uv');

    // Dark absorbent enclosure eliminates 360-degree grey ambient floor
    const enclosureMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.BackSide,
    });
    const enclosure = new THREE.Mesh(boxGeo, enclosureMat);
    enclosure.scale.set(34, 28, 34);
    enclosure.position.set(0, 6, 0);
    this.add(enclosure);

    const makeLightformer = (hex, intensity, pos, scale, rot = null) => {
      // Emissive-only MeshLambertMaterial works identically on WebGPURenderer & WebGLRenderer (#31348)
      const mat = new THREE.MeshLambertMaterial({
        color: 0x000000,
        emissive: hex,
        emissiveIntensity: intensity,
      });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      this.add(mesh);
      return mesh;
    };

    // 1. Overhead warm key softbox strip (broad hero highlight across top bevels)
    makeLightformer(0xfff6e8, 12.0, [-2.5, 14.0, 3.5], [10.5, 0.2, 6.0]);
    // 2. Narrow cool rim strip (razor specular catchlight on machined metal & glass edges)
    makeLightformer(0xcfe2ff, 7.5, [11.5, 8.5, -9.0], [0.25, 8.5, 4.8], [0, -0.35, 0]);
    // 3. Side warm-white key accent strip
    makeLightformer(0xfff1dc, 5.2, [-12.5, 9.0, 6.5], [0.25, 5.2, 7.0], [0, 0.25, 0]);
    // 4. Subdued cool-neutral fill card (keeps shadows readable without muddying contrast)
    makeLightformer(0xd8e2f0, 2.0, [12.5, 5.5, 8.0], [0.25, 4.0, 6.0]);
    // 5. Subtle ground bounce card (gives metallic undersides natural horizon tone)
    makeLightformer(0x2c303a, 0.65, [0, -5.5, 0], [18.0, 0.2, 18.0]);

    // 6. Dark negative-fill baffles opposite key for crisp dark-to-bright specular rolloff
    const baffleMat = new THREE.MeshStandardMaterial({ color: 0x040507, roughness: 1.0, metalness: 0.0 });
    const baffleA = new THREE.Mesh(boxGeo, baffleMat);
    baffleA.position.set(-10.0, 4.0, -9.5);
    baffleA.scale.set(5.5, 10.0, 0.3);
    this.add(baffleA);
    const baffleB = new THREE.Mesh(boxGeo, baffleMat);
    baffleB.position.set(1.5, 3.5, -13.0);
    baffleB.scale.set(9.0, 9.0, 0.3);
    this.add(baffleB);
  }

  dispose() {
    const resources = new Set();
    this.traverse((obj) => {
      if (obj.isMesh) {
        resources.add(obj.geometry);
        resources.add(obj.material);
      }
    });
    for (const r of resources) r?.dispose?.();
  }
}

export const STUDIO_THEMES = {
  'paper-ink': {
    hemiSky: 0xfffaf2,
    hemiGround: 0xa68e6e,
    hemiIntensity: 0.56,
    keyColor: 0xfff7ec,
    keyIntensity: 1.42,
    fillColor: 0xdfe8f2,
    fillIntensity: 0.16,
    rimColor: 0xfff4e0,
    rimIntensity: 0.24,
    shadowColor: 0x6f4d2d,
    shadowOpacity: 0.25,
    gridCenter: 0xb6a489,
    gridLine: 0xd3c4ac,
    gridOpacity: 0.48,
    envIntensity: 0.95,
    inkColor: '#1f160f',
    inkOpacity: 0.84,
  },
  'dark-studio': {
    hemiSky: 0xdbeafe,
    hemiGround: 0x1e293b,
    hemiIntensity: 0.52,
    keyColor: 0xf8fafc,
    keyIntensity: 1.38,
    fillColor: 0x38bdf8,
    fillIntensity: 0.28,
    rimColor: 0x5eead4,
    rimIntensity: 0.64,
    shadowColor: 0x04070f,
    shadowOpacity: 0.52,
    gridCenter: 0x475569,
    gridLine: 0x293548,
    gridOpacity: 0.56,
    envIntensity: 0.85,
    inkColor: '#060911',
    inkOpacity: 0.72,
  },
  'bio-cutaway': {
    hemiSky: 0xf4fbf9,
    hemiGround: 0x86a69f,
    hemiIntensity: 0.6,
    keyColor: 0xfafffe,
    keyIntensity: 1.28,
    fillColor: 0xd1fae5,
    fillIntensity: 0.24,
    rimColor: 0x99f6e4,
    rimIntensity: 0.36,
    shadowColor: 0x254442,
    shadowOpacity: 0.26,
    gridCenter: 0x9eb8b1,
    gridLine: 0xc3d5d0,
    gridOpacity: 0.46,
    envIntensity: 0.72,
    inkColor: '#142b2e',
    inkOpacity: 0.8,
  },
  blueprint: {
    hemiSky: 0xdbeeff,
    hemiGround: 0x0b1f3a,
    hemiIntensity: 0.56,
    keyColor: 0xf0f9ff,
    keyIntensity: 1.34,
    fillColor: 0x38bdf8,
    fillIntensity: 0.36,
    rimColor: 0x38e8ff,
    rimIntensity: 0.72,
    shadowColor: 0x030b18,
    shadowOpacity: 0.48,
    gridCenter: 0x7dd3fc,
    gridLine: 0x38bdf8,
    gridOpacity: 0.36,
    envIntensity: 0.8,
    inkColor: '#e0f2fe',
    inkOpacity: 0.68,
  },
  'monochrome-print': {
    hemiSky: 0xffffff,
    hemiGround: 0xc0beb8,
    hemiIntensity: 0.58,
    keyColor: 0xffffff,
    keyIntensity: 1.38,
    fillColor: 0xe6e8ec,
    fillIntensity: 0.16,
    rimColor: 0xffffff,
    rimIntensity: 0.22,
    shadowColor: 0x54473d,
    shadowOpacity: 0.25,
    gridCenter: 0x8c9099,
    gridLine: 0xcbc9c2,
    gridOpacity: 0.36,
    envIntensity: 0.85,
    inkColor: '#111317',
    inkOpacity: 0.9,
  },
  'obsidian-gallery': {
    hemiSky: 0xfaf0dc,
    hemiGround: 0x1c1916,
    hemiIntensity: 0.46,
    keyColor: 0xfff5e4,
    keyIntensity: 1.44,
    fillColor: 0x5eead4,
    fillIntensity: 0.2,
    rimColor: 0xd9b061,
    rimIntensity: 0.76,
    shadowColor: 0x050403,
    shadowOpacity: 0.56,
    gridCenter: 0x6b5b43,
    gridLine: 0x3a3228,
    gridOpacity: 0.46,
    envIntensity: 0.95,
    inkColor: '#090807',
    inkOpacity: 0.74,
  },
};

function detectThemeName(explicit) {
  if (explicit && STUDIO_THEMES[explicit]) return explicit;
  const attr = typeof document !== 'undefined' ? document.documentElement?.dataset?.theme : '';
  return STUDIO_THEMES[attr] ? attr : 'paper-ink';
}

function parseRequestedBackend(explicit) {
  if (explicit && explicit !== 'auto') return explicit;
  if (typeof location !== 'undefined' && location.search) {
    const q = new URLSearchParams(location.search).get('backend');
    if (q === 'webgpu' || q === 'webgl2' || q === 'legacy-webgl') return q;
  }
  return 'auto';
}

function resolveOutlinePreset(opt, themeName) {
  if (opt === undefined || opt === 'auto') {
    return PRIMER_THEMES.has(themeName) ? 'primer' : 'none';
  }
  if (opt === 'primer') return 'primer';
  if (opt === false || opt === 'none') return 'none';
  if (opt === 'subtle') return 'subtle';
  return 'crisp';
}

function withTimeout(promise, ms, label) {
  let timer = 0;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function hexToCss(hex, alpha = 1) {
  const n = typeof hex === 'number' ? hex : new THREE.Color(hex).getHex();
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return alpha >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

async function disposeRenderer(renderer) {
  try {
    await renderer?.dispose();
  } catch {
    // Three.js disposal awaits initialization and can reject with the same init error.
  }
}

const ANALYTICAL_GRID_VERTEX = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vXZ = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ANALYTICAL_GRID_FRAGMENT = /* glsl */ `
  #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
  #endif
  uniform vec3 uMinorColor;
  uniform vec3 uMajorColor;
  uniform float uOpacity;
  uniform float uHalfSize;
  uniform float uCellSize;
  uniform float uStyle; // 0 = cartesian, 1 = polar, 2 = plinth
  varying vec2 vXZ;

  void main() {
    float r = length(vXZ);
    float rNorm = r / max(uHalfSize, 1e-4);
    float fade = 1.0 - smoothstep(0.32, 0.98, rNorm);
    if (fade <= 0.001) discard;

    float minorMask = 0.0;
    float majorMask = 0.0;

    if (uStyle < 0.5) {
      // Crisp analytical 1px cartesian drafting grid
      vec2 coord = vXZ / max(uCellSize, 1e-4);
      vec2 gMin = abs(fract(coord - 0.5) - 0.5) / max(fwidth(coord), vec2(1e-4));
      minorMask = 1.0 - min(min(gMin.x, gMin.y), 1.0);

      vec2 coordMaj = coord * 0.25;
      vec2 gMaj = abs(fract(coordMaj - 0.5) - 0.5) / max(fwidth(coordMaj), vec2(1e-4));
      majorMask = 1.0 - min(min(gMaj.x, gMaj.y), 1.0);

      float axX = 1.0 - clamp(abs(vXZ.x) / max(fwidth(vXZ.x) * 1.4, 1e-4), 0.0, 1.0);
      float axZ = 1.0 - clamp(abs(vXZ.y) / max(fwidth(vXZ.y) * 1.4, 1e-4), 0.0, 1.0);
      majorMask = max(majorMask, max(axX, axZ));
    } else if (uStyle < 1.5) {
      // Crisp analytical polar rings + seam-free 12-spoke reticle
      float ringStep = uHalfSize / 8.0;
      float rc = r / max(ringStep, 1e-4);
      float gRing = abs(fract(rc - 0.5) - 0.5) / max(fwidth(rc), 1e-4);
      minorMask = (1.0 - min(gRing, 1.0)) * step(0.08, rc);

      float rcMaj = rc * 0.5;
      float gRingMaj = abs(fract(rcMaj - 0.5) - 0.5) / max(fwidth(rcMaj), 1e-4);
      majorMask = (1.0 - min(gRingMaj, 1.0)) * step(0.08, rc);

      float ang = atan(vXZ.y, vXZ.x);
      float fwPos = max((fwidth(vXZ.x) + fwidth(vXZ.y)) * 0.7071, 1e-4);
      float spokeDist = abs(sin(ang * 6.0)) * r / (6.0 * fwPos);
      minorMask = max(minorMask, (1.0 - min(spokeDist, 1.0)) * smoothstep(0.0, 0.12, rNorm));
      float majSpokeDist = abs(sin(ang * 2.0)) * r / (2.0 * fwPos);
      majorMask = max(majorMask, (1.0 - min(majSpokeDist, 1.0)) * smoothstep(0.0, 0.12, rNorm));
    } else {
      // Crisp analytical plinth double ring + interior crosshairs
      float fwR = max(fwidth(r), 1e-4);
      float outerR = uHalfSize * 0.82;
      float innerR = uHalfSize * 0.77;
      majorMask = 1.0 - clamp(abs(r - outerR) / (fwR * 1.6), 0.0, 1.0);
      minorMask = 1.0 - clamp(abs(r - innerR) / (fwR * 1.1), 0.0, 1.0);
      float inside = 1.0 - smoothstep(innerR - fwR, innerR + fwR, r);
      float axX = 1.0 - clamp(abs(vXZ.x) / max(fwidth(vXZ.x) * 1.1, 1e-4), 0.0, 1.0);
      float axZ = 1.0 - clamp(abs(vXZ.y) / max(fwidth(vXZ.y) * 1.1, 1e-4), 0.0, 1.0);
      minorMask = max(minorMask, max(axX, axZ) * inside);
    }

    float lineAlpha = max(minorMask * 0.72, majorMask * 0.96);
    float outAlpha = lineAlpha * fade * uOpacity;
    if (outAlpha <= 0.002) discard;
    vec3 col = mix(uMinorColor, uMajorColor, clamp(majorMask, 0.0, 1.0));
    gl_FragColor = vec4(col, outAlpha);
  }
`;

/**
 * Build a razor-sharp analytical `fwidth()` ground grid material (TSL on WebGPURenderer,
 * GLSL ShaderMaterial on legacy WebGLRenderer) with smooth radial edge fade and zero texture blur.
 */
function createAnalyticalGridMaterial(style, theme, gridSize, useTSL) {
  const halfSize = Math.max(1, gridSize * 0.5);
  const cellSize = Math.max(0.5, gridSize / Math.max(8, Math.round(gridSize / 1.5)));
  const minorCol = new THREE.Color(theme.gridLine);
  const majorCol = new THREE.Color(theme.gridCenter);
  const styleIdx = style === 'polar' ? 1 : style === 'plinth' ? 2 : 0;

  if (useTSL && THREE.MeshBasicNodeMaterial && THREE.TSL) {
    const TSL = THREE.TSL;
    const {
      positionLocal,
      vec2,
      float,
      color: tslColor,
      abs,
      fract,
      fwidth,
      min,
      max,
      clamp: tslClamp,
      smoothstep,
      mix,
      length,
      sin,
      atan,
      step,
    } = TSL;

    const posXZ = vec2(positionLocal.x, positionLocal.z);
    const r = length(posXZ);
    const rNorm = r.div(float(halfSize));
    const fade = float(1.0).sub(smoothstep(0.32, 0.98, rNorm));

    let minorMask;
    let majorMask;

    if (styleIdx === 0) {
      const coord = posXZ.div(float(cellSize));
      const gMin = abs(fract(coord.sub(0.5)).sub(0.5)).div(max(fwidth(coord), vec2(1e-4)));
      minorMask = float(1.0).sub(min(min(gMin.x, gMin.y), float(1.0)));

      const coordMaj = coord.mul(0.25);
      const gMaj = abs(fract(coordMaj.sub(0.5)).sub(0.5)).div(max(fwidth(coordMaj), vec2(1e-4)));
      const majGrid = float(1.0).sub(min(min(gMaj.x, gMaj.y), float(1.0)));

      const axX = float(1.0).sub(tslClamp(abs(posXZ.x).div(max(fwidth(posXZ.x).mul(1.4), float(1e-4))), 0.0, 1.0));
      const axZ = float(1.0).sub(tslClamp(abs(posXZ.y).div(max(fwidth(posXZ.y).mul(1.4), float(1e-4))), 0.0, 1.0));
      majorMask = max(majGrid, max(axX, axZ));
    } else if (styleIdx === 1) {
      const ringStep = float(halfSize / 8.0);
      const rc = r.div(ringStep);
      const gRing = abs(fract(rc.sub(0.5)).sub(0.5)).div(max(fwidth(rc), float(1e-4)));
      const ringGate = step(float(0.08), rc);
      const minRing = float(1.0).sub(min(gRing, float(1.0))).mul(ringGate);

      const rcMaj = rc.mul(0.5);
      const gRingMaj = abs(fract(rcMaj.sub(0.5)).sub(0.5)).div(max(fwidth(rcMaj), float(1e-4)));
      const majRing = float(1.0).sub(min(gRingMaj, float(1.0))).mul(ringGate);

      const ang = atan(posXZ.y, posXZ.x);
      const fwPos = max(fwidth(posXZ.x).add(fwidth(posXZ.y)).mul(0.7071), float(1e-4));
      const centerGate = smoothstep(0.0, 0.12, rNorm);
      const spokeDist = abs(sin(ang.mul(6.0))).mul(r).div(fwPos.mul(6.0));
      const majSpokeDist = abs(sin(ang.mul(2.0))).mul(r).div(fwPos.mul(2.0));
      minorMask = max(minRing, float(1.0).sub(min(spokeDist, float(1.0))).mul(centerGate));
      majorMask = max(majRing, float(1.0).sub(min(majSpokeDist, float(1.0))).mul(centerGate));
    } else {
      const fwR = max(fwidth(r), float(1e-4));
      const outerR = float(halfSize * 0.82);
      const innerR = float(halfSize * 0.77);
      majorMask = float(1.0).sub(tslClamp(abs(r.sub(outerR)).div(fwR.mul(1.6)), 0.0, 1.0));
      const innerRing = float(1.0).sub(tslClamp(abs(r.sub(innerR)).div(fwR.mul(1.1)), 0.0, 1.0));
      const inside = float(1.0).sub(smoothstep(innerR.sub(fwR), innerR.add(fwR), r));
      const axX = float(1.0).sub(tslClamp(abs(posXZ.x).div(max(fwidth(posXZ.x).mul(1.1), float(1e-4))), 0.0, 1.0));
      const axZ = float(1.0).sub(tslClamp(abs(posXZ.y).div(max(fwidth(posXZ.y).mul(1.1), float(1e-4))), 0.0, 1.0));
      minorMask = max(innerRing, max(axX, axZ).mul(inside));
    }

    const lineAlpha = max(minorMask.mul(0.72), majorMask.mul(0.96));
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
    });
    mat.colorNode = mix(tslColor(minorCol), tslColor(majorCol), tslClamp(majorMask, 0.0, 1.0));
    mat.opacityNode = lineAlpha.mul(fade).mul(float(theme.gridOpacity));
    return mat;
  }

  return new THREE.ShaderMaterial({
    vertexShader: ANALYTICAL_GRID_VERTEX,
    fragmentShader: ANALYTICAL_GRID_FRAGMENT,
    uniforms: {
      uMinorColor: { value: minorCol },
      uMajorColor: { value: majorCol },
      uOpacity: { value: theme.gridOpacity },
      uHalfSize: { value: halfSize },
      uCellSize: { value: cellSize },
      uStyle: { value: styleIdx },
    },
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true },
  });
}

function createGaussianContactBlobTexture(colorHex, size = 128) {
  const n = Math.max(32, Math.min(256, Math.round(size)));
  const data = new Uint8Array(n * n * 4);
  const c = new THREE.Color(colorHex);
  const cr = Math.round(c.r * 255);
  const cg = Math.round(c.g * 255);
  const cb = Math.round(c.b * 255);
  const half = (n - 1) * 0.5;
  for (let y = 0; y < n; y += 1) {
    const dy = (y - half) / half;
    for (let x = 0; x < n; x += 1) {
      const dx = (x - half) / half;
      const t = Math.min(1, Math.hypot(dx, dy));
      // Backcountry-101 Gaussian grounding curve: exp(-t^2 * 4.5) * (1 - t)
      const alpha = Math.max(0, Math.min(1, Math.exp(-t * t * 4.5) * (1 - t)));
      const idx = (y * n + x) * 4;
      data[idx] = cr;
      data[idx + 1] = cg;
      data[idx + 2] = cb;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(colorHex) {
  return createGaussianContactBlobTexture(colorHex, 128);
}

function toneMappingName(tm) {
  if (tm === THREE.NoToneMapping) return 'NoToneMapping';
  if (tm === THREE.NeutralToneMapping) return 'NeutralToneMapping';
  if (tm === THREE.ACESFilmicToneMapping) return 'ACESFilmicToneMapping';
  if (tm === THREE.AgXToneMapping) return 'AgXToneMapping';
  if (tm === THREE.LinearToneMapping) return 'LinearToneMapping';
  if (tm === THREE.ReinhardToneMapping) return 'ReinhardToneMapping';
  if (tm === THREE.CineonToneMapping) return 'CineonToneMapping';
  return String(tm ?? 'unknown');
}

function shadowTypeName(st) {
  if (st === THREE.PCFShadowMap) return 'PCFShadowMap';
  if (st === THREE.VSMShadowMap) return 'VSMShadowMap';
  if (st === THREE.BasicShadowMap) return 'BasicShadowMap';
  if (st === THREE.PCFSoftShadowMap) return 'PCFSoftShadowMap';
  return String(st ?? 'unknown');
}

function createCutawayHatchTexture({
  baseColor = '#e9dec9',
  hatchColor = '#18213d',
  spacing = 16,
  lineWidth = 2.2,
  angleDeg = 45,
} = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  ctx.fillStyle = typeof baseColor === 'number' ? hexToCss(baseColor) : baseColor;
  ctx.fillRect(0, 0, 256, 256);

  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.strokeStyle = typeof hatchColor === 'number' ? hexToCss(hatchColor, 0.72) : hatchColor;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = lineWidth;
  const step = Math.max(6, Number(spacing) || 16);
  for (let x = -384; x <= 384; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, -384);
    ctx.lineTo(x, 384);
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

const ANALYTICAL_CAP_VERTEX = /* glsl */ `
  varying vec2 vPlaneXY;
  void main() {
    vPlaneXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ANALYTICAL_CAP_FRAGMENT = /* glsl */ `
  #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
  #endif
  uniform vec3 uBaseColor;
  uniform vec3 uHatchColor;
  uniform vec2 uDir;
  uniform float uSpacing;
  uniform float uLinePx;
  uniform float uHatchOpacity;
  varying vec2 vPlaneXY;

  void main() {
    float coord = dot(vPlaneXY, uDir) / max(uSpacing, 1e-4);
    float fw = max(fwidth(coord), 1e-4);
    float dist = abs(fract(coord - 0.5) - 0.5) / fw;
    float mask = 1.0 - clamp(dist / max(uLinePx, 0.5), 0.0, 1.0);
    vec3 col = mix(uBaseColor, uHatchColor, mask * uHatchOpacity);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Build a resolution-independent world-space analytical `fwidth()` cross-hatch material
 * for solid stencil cutaway caps (TSL on WebGPURenderer, GLSL ShaderMaterial on legacy WebGL).
 */
function createAnalyticalCutawayCapMaterial({
  baseColor = '#eadec9',
  hatchColor = '#1f160f',
  spacing = 0.14,
  angleDeg = 45,
  linePx = 1.25,
  hatchOpacity = 0.68,
  useTSL = false,
} = {}) {
  const baseCol = new THREE.Color(baseColor);
  const hatchCol = new THREE.Color(hatchColor);
  const rad = ((Number(angleDeg) || 45) * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const worldSpacing =
    spacing !== undefined && spacing !== null
      ? Number(spacing) <= 2
        ? Math.max(0.03, Number(spacing) || 0.14)
        : Math.max(0.03, (Number(spacing) / 16) * 0.14)
      : 0.14;

  const stencilProps = {
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  };

  if (useTSL && THREE.TSL && (THREE.MeshStandardNodeMaterial || THREE.MeshBasicNodeMaterial)) {
    const TSL = THREE.TSL;
    const { positionLocal, float, color: tslColor, abs, fract, fwidth, max, clamp: tslClamp, mix } = TSL;
    const coord = positionLocal.x
      .mul(float(cosA))
      .add(positionLocal.y.mul(float(sinA)))
      .div(float(worldSpacing));
    const fw = max(fwidth(coord), float(1e-4));
    const dist = abs(fract(coord.sub(0.5)).sub(0.5)).div(fw);
    const lineMask = float(1.0).sub(tslClamp(dist.div(float(linePx)), 0.0, 1.0));
    const colorExpr = mix(tslColor(baseCol), tslColor(hatchCol), lineMask.mul(float(hatchOpacity)));

    const mat = THREE.MeshStandardNodeMaterial
      ? new THREE.MeshStandardNodeMaterial({
          roughness: 0.72,
          metalness: 0.08,
          ...stencilProps,
        })
      : new THREE.MeshBasicNodeMaterial(stencilProps);
    mat.colorNode = colorExpr;
    mat.userData = { ...(mat.userData || {}), simulifyHatchMode: 'analytical', reflective: false };
    return mat;
  }

  const mat = new THREE.ShaderMaterial({
    vertexShader: ANALYTICAL_CAP_VERTEX,
    fragmentShader: ANALYTICAL_CAP_FRAGMENT,
    uniforms: {
      uBaseColor: { value: baseCol },
      uHatchColor: { value: hatchCol },
      uDir: { value: new THREE.Vector2(cosA, sinA) },
      uSpacing: { value: worldSpacing },
      uLinePx: { value: linePx },
      uHatchOpacity: { value: hatchOpacity },
    },
    extensions: { derivatives: true },
    ...stencilProps,
  });
  mat.userData = { ...(mat.userData || {}), simulifyHatchMode: 'analytical', reflective: false };
  return mat;
}

/**
 * Simulify v2 3D/4D Stage supporting:
 * - Automatic 3-tier backend: Hardware WebGPU -> WebGL2 (TSL) -> Graceful Fallback
 * - Full backward compatibility for v1 benches using `three.module.js` (`WebGLRenderer`)
 * - 1:1 physical pixel backing-store via ResizeObserver `device-pixel-content-box` (DPR up to 3x)
 * - Separated user/script camera ownership (`setCameraFromScript`, `isUserCameraLocked`, `unlockUserCamera`)
 * - On-demand dirty-flag rendering (`requestRender`) eliminating 60fps idle GPU spin
 * - Sharp texture helpers (`getMaxAnisotropy`, `configureSharpTexture`) & `getGeometryAudit()`
 * - Crisp TSL/GLSL ink outlines (`'primer' | 'crisp' | 'subtle' | 'none'`) with un-tone-mapped `SURFACE_LAYER`
 * - Native HTML-in-Canvas surface manager (`stage.htmlSurfaces`) with HiDPI fallback
 * - Deterministic manual/export contract (`setManualMode`, `renderNow`, `renderNowAsync`,
 *   `renderFrame`, `setCameraImmediate`, `setExportSize`, `restoreSize`)
 */
export class IsometricStage {
  /**
   * Recommended v2 async factory ensuring WebGPURenderer.init() finishes before scene build.
   * @param {HTMLCanvasElement} canvas
   * @param {Record<string, any>} [options]
   * @returns {Promise<IsometricStage>}
   */
  static async create(canvas, options = {}) {
    const stage = new IsometricStage(canvas, options);
    await stage.ready;
    return stage;
  }

  constructor(canvas, options = {}) {
    const requestedBackend = parseRequestedBackend(options.backend);
    if (requestedBackend === 'legacy-webgl' && !THREE.WebGLRenderer) {
      throw new Error('legacy-webgl requires mapping "three" to three.module.js. Use webgl2 with three.webgpu.js.');
    }
    if (requestedBackend === 'webgpu' && !THREE.WebGPURenderer) {
      throw new Error('webgpu requires mapping "three" to three.webgpu.js.');
    }
    this.canvas = canvas;
    this._options = options;
    this.reducedMotion =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    this.cameraType = options.cameraType === 'perspective' ? 'perspective' : 'orthographic';
    this.fov = options.fov ?? 36;
    this.near = options.near ?? (this.cameraType === 'perspective' ? 0.2 : 1);
    this.far = options.far ?? (this.cameraType === 'perspective' ? 260 : 240);
    this.baseSpan = options.baseSpan ?? 11.5;
    this.distance = options.distance ?? (this.cameraType === 'perspective' ? 16 : 90);
    this.themeName = detectThemeName(options.theme);
    this._outlineOption = options.outline;
    this.outlinePreset = resolveOutlinePreset(this._outlineOption, this.themeName);
    this.outlineEnabled = this.outlinePreset !== 'none';

    this.defaultView = {
      azimuth: options.azimuth ?? 36 * DEG,
      elevation: options.elevation ?? 40 * DEG,
      zoom: options.zoom ?? 1.0,
      distance: this.distance,
      target: new THREE.Vector3(...(options.target ?? [0, 0.35, 0])),
    };
    this.view = {
      azimuth: this.defaultView.azimuth,
      elevation: this.defaultView.elevation,
      zoom: this.defaultView.zoom,
      distance: this.defaultView.distance,
      target: this.defaultView.target.clone(),
    };

    this._savedOblique = null;
    this._topView = false;
    this._userCameraLocked = false;
    this._fly = null;
    this._frameCallbacks = new Set();
    this._pickables = new Map();
    this._pickRoots = [];
    this._hoveredId = null;
    this._onHover = options.onHover ?? null;
    this._onSelect = options.onSelect ?? null;
    this._onViewChange = options.onViewChange ?? null;
    this._drag = null;
    this._orbitEnabled = options.orbitEnabled !== false;
    this._cursorOverride = null;
    this._raf = 0;
    this._dirty = true;
    this._lastFrameTime = null;
    this._manualMode = options.autoLoop === false;
    this._exportSize = null;
    this._physSize = null;
    this._disposed = false;
    this._rendererReady = false;
    this.size = { width: 800, height: 500, dpr: 1, physicalWidth: 800, physicalHeight: 500 };
    this.backendKind = 'pending';
    this.htmlInCanvasSupported = supportsHtmlInCanvas();
    this.gpuErrors = [];

    this.scene = new THREE.Scene();
    this.camera = this._createCamera();
    this._enableCameraLayers(this.camera);

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmpVec = new THREE.Vector3();

    this._gridSize = options.gridSize ?? 36;
    this._groundY = options.groundY ?? 0;
    this._showGrid = options.showGrid !== false;
    this._gridStyle = options.gridStyle ?? (options.showGrid === false ? 'none' : 'cartesian');
    this._showGround = options.showGround !== false;
    this._accentLights = new Set();
    this._contactShadows = new Set();
    this._cutawayCaps = new Set();
    this._shellXRaySaved = new WeakMap();
    this._shellXRayMats = new Set();
    this._syncedPeers = new Set();
    this._syncingCamera = false;
    this._shadowTypeOption = options.shadowType;
    this._autoUpdateShadows = options.autoUpdateShadows !== false;
    this._autoFitShadowFrustum = options.autoFitShadowFrustum !== false;
    this._autoPauseOffscreen = options.autoPauseOffscreen !== false;
    this._pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this._offscreen = false;
    this._fallbackEl = null;
    this._intersectionObserver = null;
    this._onVisibilityChange = null;
    this._shadowFrustumFitted = false;
    this._envAppliedOnce = false;
    this._envKind = 'none';
    this._selectiveIBL = options.selectiveIBL !== undefined ? Boolean(options.selectiveIBL) : PRIMER_THEMES.has(this.themeName);
    this.envMap = null;
    this._keyLightOffset = new THREE.Vector3(-42, 86, 54);

    this._setupLights(options.shadowBounds ?? 16);
    this._setupGround(this._groundY, this._gridSize);

    // Expose live telemetry getter on globalThis.__SIMULIFY_TELEMETRY__ for verify_stage.py look-dev audit
    this._registerGlobalTelemetry();

    // Attach HtmlSurfaceManager early so callers can mount surfaces before or after stage.ready
    this.htmlSurfaces =
      options.htmlInCanvas === false
        ? null
        : new HtmlSurfaceManager(this, {
            enabled: options.htmlInCanvas !== false,
          });

    this._bindEvents();
    this._initResizeObserver();
    this._initVisibilityGuards();

    this.renderer = null;
    this._envRT = null;
    this.outline = null;

    const useWebGPURenderer = Boolean(THREE.WebGPURenderer) && requestedBackend !== 'legacy-webgl';

    if (useWebGPURenderer) {
      this.ready = this._initWebGPURenderer(options, requestedBackend);
    } else {
      this._initLegacyWebGLRenderer(options);
      this.ready = Promise.resolve(this);
    }
  }

  _enableCameraLayers(cam) {
    cam.layers.enable(SOLID_LAYER);
    cam.layers.enable(GROUND_LAYER);
    cam.layers.enable(SURFACE_LAYER);
    cam.layers.enable(GLASS_LAYER);
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._eventCleanups.push(() => target.removeEventListener(type, handler, options));
  }

  _initResizeObserver() {
    this._supportsDpc =
      typeof ResizeObserverEntry !== 'undefined' &&
      'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;

    if (typeof ResizeObserver === 'undefined') {
      this._resizeObserver = null;
      return;
    }

    this._resizeObserver = new ResizeObserver((entries) => {
      if (this._disposed) return;
      for (const entry of entries) {
        const dpc = entry.devicePixelContentBoxSize;
        if (dpc && dpc.length > 0 && dpc[0].inlineSize > 0 && dpc[0].blockSize > 0) {
          this._physSize = {
            width: Math.round(dpc[0].inlineSize),
            height: Math.round(dpc[0].blockSize),
          };
        } else {
          this._physSize = null;
        }
      }
      this.resize();
    });

    if (this._supportsDpc) {
      try {
        this._resizeObserver.observe(this.canvas, { box: 'device-pixel-content-box' });
        return;
      } catch {
        this._supportsDpc = false;
      }
    }
    this._resizeObserver.observe(this.canvas);
  }

  _isPausedByVisibility() {
    return Boolean(this._autoPauseOffscreen && !this._manualMode && (this._pageHidden || this._offscreen));
  }

  _syncVisibilityPlayback() {
    if (this._disposed) return;
    if (this._isPausedByVisibility()) {
      if (this._raf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
      this._lastFrameTime = null;
      return;
    }
    if (!this._manualMode && this._rendererReady && (this._dirty || this._needsContinuousLoop())) {
      this._lastFrameTime = null;
      this._scheduleTick();
    }
  }

  _initVisibilityGuards() {
    if (!this._autoPauseOffscreen) return;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this._onVisibilityChange = () => {
        this._pageHidden = document.visibilityState === 'hidden';
        this._syncVisibilityPlayback();
      };
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
    if (typeof IntersectionObserver === 'function' && this.canvas) {
      try {
        this._intersectionObserver = new IntersectionObserver(
          (entries) => {
            if (this._disposed || !entries || entries.length === 0) return;
            const entry = entries[entries.length - 1];
            this._offscreen = !entry.isIntersecting;
            this._syncVisibilityPlayback();
          },
          { threshold: 0.01 }
        );
        this._intersectionObserver.observe(this.canvas);
      } catch {
        this._intersectionObserver = null;
      }
    }
  }

  _createCamera() {
    const aspect = this.size.width / Math.max(1, this.size.height);
    if (this.cameraType === 'perspective') {
      return new THREE.PerspectiveCamera(this.fov, aspect, this.near, this.far);
    }
    return new THREE.OrthographicCamera(-1, 1, 1, -1, this.near, this.far);
  }

  async _initWebGPURenderer(options, requestedBackend) {
    const timeoutMs = Math.max(500, Number(options.webgpuTimeoutMs) || 4000);
    const buildRenderer = (forceWebGL) =>
      new THREE.WebGPURenderer({
        canvas: this.canvas,
        antialias: options.antialias !== false,
        alpha: options.alpha !== false,
        stencil: true,
        forceWebGL,
      });

    try {
      let forceWebGL = requestedBackend === 'webgl2';

      if (!forceWebGL) {
        let adapter = null;
        if (typeof navigator !== 'undefined' && navigator.gpu) {
          try {
            adapter = await withTimeout(
              navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
              Math.min(2500, timeoutMs),
              'WebGPU requestAdapter'
            );
          } catch {
            adapter = null;
          }
        }
        const isSoftwareFallback = Boolean(
          adapter && (adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter)
        );
        if (!adapter && requestedBackend === 'webgpu') {
          throw new Error('Requested WebGPU backend is unavailable');
        }
        // Only engage WebGPU automatically on real hardware adapters (avoids headless
        // Dawn SwiftShader silent-blank regression unless explicitly forced via ?backend=webgpu)
        if (!adapter || (isSoftwareFallback && requestedBackend !== 'webgpu')) {
          forceWebGL = true;
        }
      }

      if (this._disposed) return this;

      let renderer = buildRenderer(forceWebGL);
      try {
        await (forceWebGL
          ? renderer.init()
          : withTimeout(renderer.init(), timeoutMs, 'WebGPURenderer.init'));
      } catch (initErr) {
        void disposeRenderer(renderer);
        if (this._disposed || forceWebGL || requestedBackend === 'webgpu') {
          throw initErr;
        }
        // Auto-recover from stalled/broken WebGPU init in embedded WebViews by falling back to WebGL2
        forceWebGL = true;
        renderer = buildRenderer(true);
        try {
          await renderer.init();
        } catch (fallbackError) {
          void disposeRenderer(renderer);
          throw fallbackError;
        }
      }

      if (this._disposed) {
        void disposeRenderer(renderer);
        return this;
      }
      if (requestedBackend === 'webgpu' && !renderer.backend?.isWebGPUBackend) {
        void disposeRenderer(renderer);
        throw new Error('Requested WebGPU backend could not be initialized');
      }

      this.renderer = renderer;
      this.backendKind = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';

      if (renderer.backend?.device) {
        this._listen(renderer.backend.device, 'uncapturederror', (ev) => {
          const msg = ev?.error?.message || String(ev?.error || 'WebGPU uncaptured error');
          this.gpuErrors.push(msg);
        });
      }

      this._configureRendererCommon(options);

      // Warm up context once so GPUCanvasContext is attached before any HTML-in-Canvas paint upload
      this.resize(true);
      this.renderer.render(this.scene, this.camera);
      this._rendererReady = true;

      if (this.htmlSurfaces?.nativeEnabled && this.htmlSurfaces.surfaces.size > 0) {
        this.htmlSurfaces.requestPaint();
      }
      if (!this._manualMode) {
        this.requestRender();
      }
    } catch (err) {
      this._enterFallback(err);
    }
    return this;
  }

  _initLegacyWebGLRenderer(options) {
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: options.antialias !== false,
        alpha: options.alpha !== false,
        stencil: true,
        preserveDrawingBuffer: Boolean(options.preserveDrawingBuffer),
        powerPreference: 'high-performance',
      });
      this.renderer = renderer;
      this.backendKind = renderer.capabilities?.isWebGL2 ? 'webgl2' : 'webgl';
      this._configureRendererCommon(options);
      this._rendererReady = true;
      this.resize(true);
      if (!this._manualMode) {
        this.requestRender();
      }
    } catch (err) {
      this._enterFallback(err);
    }
  }

  _registerGlobalTelemetry() {
    if (typeof globalThis === 'undefined') return;
    try {
      const stageRef = this;
      const getter = function getSimulifyTelemetry() {
        return stageRef.getTelemetry();
      };
      getter._simulifyStage = stageRef;
      this._telemetryGetter = getter;
      Object.defineProperty(globalThis, '__SIMULIFY_TELEMETRY__', {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    } catch {
      // Ignore if environment freezes globalThis
    }
  }

  _resolveDefaultToneMapping(themeName) {
    if (this._options.toneMapping !== undefined) return this._options.toneMapping;
    if (PRIMER_THEMES.has(themeName)) {
      // Faithful warm paper & pigment hex without ACES/Neutral grey crush (Primer aesthetic tier)
      return THREE.NoToneMapping;
    }
    return THREE.NeutralToneMapping !== undefined ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  }

  _configureRendererCommon(options) {
    const theme = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const r = this.renderer;

    if (typeof r.setClearColor === 'function') {
      r.setClearColor(0x000000, 0);
    }
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = this._resolveDefaultToneMapping(this.themeName);
    r.toneMappingExposure =
      options.toneMappingExposure ?? (PRIMER_THEMES.has(this.themeName) ? 1.0 : 1.02);
    r.shadowMap.enabled = true;
    r.shadowMap.autoUpdate = this._autoUpdateShadows;

    this._configureShadows();
    r.localClippingEnabled = Boolean(options.localClippingEnabled ?? true);
    this._bakeEnvironment();
    this._syncSceneEnvironment(theme);

    // Rebuild analytical grid now that we know whether WebGPURenderer (TSL) or legacy WebGL is active
    this._rebuildGrid(this._groundY, this._gridSize, theme);

    if (this.outlineEnabled) {
      this.outline = this._createOutlinePass(theme, options);
    }
  }

  _configureShadows() {
    const primer = PRIMER_THEMES.has(this.themeName);
    const { shadowRadius, shadowBlurSamples } = this._options;
    const shadowMap = this.renderer.shadowMap;
    const type = this._shadowTypeOption ?? 'pcf';
    const wantVsm = type === 'vsm' && THREE.VSMShadowMap !== undefined;
    shadowMap.type = wantVsm ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    this._keyLight.shadow.radius = shadowRadius ?? (wantVsm ? (primer ? 10 : 8) : (primer ? 4.2 : 1.65));
    if (wantVsm) this._keyLight.shadow.blurSamples = shadowBlurSamples ?? (primer ? 18 : 16);
    if (!this._autoUpdateShadows) shadowMap.needsUpdate = true;
  }

  _bakeEnvironment() {
    const pmremSigma = PRIMER_THEMES.has(this.themeName) ? 0.030 : 0.008;
    let pmrem;
    try {
      pmrem = new THREE.PMREMGenerator(this.renderer);
      for (const [Environment, sigma, kind] of [
        [StudioLightformerEnvironment, pmremSigma, 'studio-lightformer'],
        [RoomEnvironment, 0.02, 'room-fallback'],
      ]) {
        let environment;
        try {
          environment = new Environment();
          const target = pmrem.fromScene(environment, sigma);
          if (!target?.texture) continue;
          this._envRT = target;
          this._envKind = kind;
          this._pmremSigma = sigma;
          break;
        } catch {
          // Fall back to the room if the studio bake fails.
        } finally {
          environment?.dispose?.();
        }
      }
    } catch {
      // Environment lighting is optional when PMREM is unsupported.
    } finally {
      pmrem?.dispose();
    }
    this.envMap = this._envRT?.texture ?? null;
  }

  _syncSceneEnvironment(theme = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink']) {
    const selective =
      this._options.selectiveIBL !== undefined
        ? Boolean(this._options.selectiveIBL)
        : PRIMER_THEMES.has(this.themeName);
    this._selectiveIBL = selective;
    if (!this.envMap) {
      this.scene.environment = null;
      return;
    }
    if (selective) {
      // Primer Illustrated Tier: keep global scene.environment null so matte dielectrics never get washed gray
      this.scene.environment = null;
      this.scene.environmentIntensity = 0;
    } else {
      // Studio PBR Tier: rich StudioLightformerEnvironment on scene.environment
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = this._options.envIntensity ?? theme.envIntensity;
    }
    this.applyEnvironment(this.scene);
  }

  /**
   * Apply Three.js r187-safe Selective IBL across `root`:
   * In Three.js r187 (both WebGPURenderer and WebGLRenderer), `material.envMapIntensity` is
   * silently ignored unless `material.envMap` is explicitly assigned.
   * - On Primer illustrated skins (`paper-ink`, `monochrome-print`): assigns `stage.envMap` ONLY
   *   to reflective/metallic/glass/enamel materials (`userData.reflective === true`, high metalness,
   *   or clearcoat/glass), keeping matte dielectrics crisp with `envMap = null`.
   * - On Studio PBR skins: explicitly wires `material.envMap = stage.envMap` on materials carrying
   *   custom `simulifyEnvIntensity` or `reflective === false` so per-material intensity overrides
   *   are strictly honored in r187.
   */
  applyEnvironment(root = this.scene) {
    if (!root || typeof root.traverse !== 'function') return 0;
    const theme = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const envScale = this._options.envIntensity ?? theme.envIntensity;
    let updated = 0;

    root.traverse((obj) => {
      if (!obj || !obj.isMesh || !obj.material || obj.userData?.simulifyInternal) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) continue;
        // Never overwrite user-supplied custom HDRI envMaps
        if (mat.envMap && mat.envMap !== this.envMap && !mat.userData?.simulifyEnvManaged) continue;

        const explicitRefl = mat.userData?.reflective;
        const inferredRefl =
          (mat.metalness ?? 0) >= 0.35 ||
          (mat.clearcoat ?? 0) >= 0.35 ||
          (mat.transmission ?? 0) > 0 ||
          (Boolean(mat.transparent) && (mat.opacity ?? 1) < 0.85);
        const isReflective = explicitRefl !== undefined ? Boolean(explicitRefl) : inferredRefl;

        if (!this.envMap) {
          if (mat.userData?.simulifyEnvManaged) {
            mat.envMap = null;
            mat.needsUpdate = true;
          }
          continue;
        }

        const desiredIntensity =
          mat.userData?.simulifyEnvIntensity !== undefined
            ? mat.userData.simulifyEnvIntensity
            : isReflective
              ? Math.max(0.85, mat.envMapIntensity ?? 1.05)
              : Math.min(0.1, mat.envMapIntensity ?? 0.08);

        if (this._selectiveIBL) {
          if (isReflective) {
            if (mat.envMap !== this.envMap) {
              mat.envMap = this.envMap;
              mat.needsUpdate = true;
            }
            mat.envMapIntensity = desiredIntensity * Math.max(0.75, Math.min(1.25, envScale));
            mat.userData = { ...(mat.userData || {}), simulifyEnvManaged: true };
            updated += 1;
          } else if (mat.userData?.simulifyEnvManaged || mat.envMap === this.envMap) {
            mat.envMap = null;
            mat.needsUpdate = true;
            updated += 1;
          }
        } else {
          // Studio PBR tier: assign explicit envMap so r187 honors per-material envMapIntensity (matte vs metal!)
          if (mat.envMap !== this.envMap) {
            mat.envMap = this.envMap;
            mat.needsUpdate = true;
          }
          mat.envMapIntensity = isReflective
            ? desiredIntensity
            : Math.min(0.18, desiredIntensity);
          mat.userData = { ...(mat.userData || {}), simulifyEnvManaged: true };
          updated += 1;
        }
      }
    });
    return updated;
  }

  _createOutlinePass(theme, options = this._options) {
    return new OutlinePass(this.renderer, {
      preset: this.outlinePreset,
      lineColor: options.lineColor ?? theme.inkColor,
      thickness: options.lineThickness,
      opacity: options.lineOpacity ?? theme.inkOpacity,
      depthThreshold: options.depthThreshold,
      normalThreshold: options.normalThreshold,
      aoStrength: options.aoStrength,
      bloom: options.bloom ?? false,
      dof: options.dof ?? false,
    });
  }

  /**
   * Maximum anisotropic texture filtering supported by the active GPU backend (capped at 16).
   */
  getMaxAnisotropy() {
    let raw = 0;
    try {
      if (typeof this.renderer?.getMaxAnisotropy === 'function') {
        raw = this.renderer.getMaxAnisotropy();
      } else if (typeof this.renderer?.backend?.capabilities?.getMaxAnisotropy === 'function') {
        raw = this.renderer.backend.capabilities.getMaxAnisotropy();
      } else if (typeof this.renderer?.capabilities?.getMaxAnisotropy === 'function') {
        raw = this.renderer.capabilities.getMaxAnisotropy();
      } else if (!this.renderer) {
        return 16;
      }
    } catch {
      raw = 4;
    }
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return Math.max(1, Math.min(16, Math.round(raw)));
  }

  /**
   * Configure any Texture / CanvasTexture for crisp oblique readability:
   * max GPU anisotropy (up to 16x), SRGBColorSpace, and crisp trilinear mipmaps.
   */
  configureSharpTexture(tex, opts = {}) {
    if (!tex) return tex;
    tex.colorSpace = opts.colorSpace ?? THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(opts.anisotropy ?? 16, this.getMaxAnisotropy());
    const genMips = opts.generateMipmaps !== false;
    tex.generateMipmaps = genMips;
    tex.minFilter = opts.minFilter ?? (genMips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter);
    tex.magFilter = opts.magFilter ?? THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Switch outline quality preset at runtime: 'primer' | 'crisp' | 'subtle' | 'none'.
   */
  setOutlinePreset(preset) {
    this._outlineOption = preset;
    const next = resolveOutlinePreset(preset, this.themeName);
    this.outlinePreset = next;
    this.outlineEnabled = next !== 'none';
    if (this.outlineEnabled && !this.outline && this.renderer) {
      const theme = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
      this.outline = this._createOutlinePass(theme, this._options);
      this.outline.setSize(
        this.size.width,
        this.size.height,
        this.size.dpr,
        this.size.physicalWidth,
        this.size.physicalHeight
      );
    } else if (this.outline) {
      this.outline.setPreset(next);
    }
    this.requestRender();
    return this.outlinePreset;
  }

  /**
   * Audit visible 3D scene geometry diversity (cuboid vs sculpted vs simple primitives).
   * Used by Simulify's plugin-level visual/modeling oracle.
   */
  getGeometryAudit() {
    let cuboidMeshes = 0;
    let sculptedMeshes = 0;
    let primitiveMeshes = 0;
    let surfaceMeshes = 0;
    const kinds = Object.create(null);

    const box = new THREE.Box3();
    const meshBox = new THREE.Box3();
    let hasBounds = false;
    this.scene.updateMatrixWorld(true);

    this.scene.traverseVisible((obj) => {
      if (!obj || !obj.isMesh) return;
      if (obj.userData?.simulifyInternal === true) return;

      const explicitKind = obj.userData?.simulifyGeoKind || obj.geometry?.userData?.simulifyGeoKind || '';
      const rawCtorName = obj.geometry?.constructor?.name || '';
      const rawType = rawCtorName === 'RoundedBoxGeometry' ? 'RoundedBoxGeometry' : (obj.geometry?.type || 'BufferGeometry');
      const kindKey = explicitKind ? String(explicitKind) : rawType;
      const kindLower = kindKey.toLowerCase();

      kinds[kindKey] = (kinds[kindKey] || 0) + 1;

      if (kindLower === 'html-surface' || kindLower === 'htmlsurface') {
        surfaceMeshes += 1;
        return;
      }

      if (obj.geometry) {
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox && !obj.geometry.boundingBox.isEmpty()) {
          meshBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
          if (
            Number.isFinite(meshBox.min.x) &&
            Number.isFinite(meshBox.max.x) &&
            Number.isFinite(meshBox.min.y) &&
            Number.isFinite(meshBox.max.y) &&
            Number.isFinite(meshBox.min.z) &&
            Number.isFinite(meshBox.max.z)
          ) {
            box.union(meshBox);
            hasBounds = true;
          }
        }
      }

      if (explicitKind) {
        if (CUBOID_KINDS.has(kindLower)) {
          cuboidMeshes += 1;
        } else if (PRIMITIVE_KINDS.has(kindLower)) {
          primitiveMeshes += 1;
        } else {
          sculptedMeshes += 1;
        }
        return;
      }

      if (CUBOID_GEO_TYPES.has(rawType)) {
        cuboidMeshes += 1;
      } else if (SCULPTED_GEO_TYPES.has(rawType)) {
        sculptedMeshes += 1;
      } else if (PRIMITIVE_GEO_TYPES.has(rawType)) {
        primitiveMeshes += 1;
      } else {
        sculptedMeshes += 1;
      }
    });

    const totalMeshes = cuboidMeshes + sculptedMeshes + primitiveMeshes;
    const cuboidRatio = totalMeshes > 0 ? +(cuboidMeshes / totalMeshes).toFixed(4) : 0;
    const sculptedRatio = totalMeshes > 0 ? +(sculptedMeshes / totalMeshes).toFixed(4) : 0;

    let bounds = null;
    if (hasBounds) {
      const sz = new THREE.Vector3();
      const ctr = new THREE.Vector3();
      box.getSize(sz);
      box.getCenter(ctr);
      const maxDim = Math.max(sz.x, sz.y, sz.z, 1e-6);
      const minDim = Math.min(sz.x, sz.y, sz.z);
      bounds = {
        width: +sz.x.toFixed(4),
        height: +sz.y.toFixed(4),
        depth: +sz.z.toFixed(4),
        min: [+box.min.x.toFixed(4), +box.min.y.toFixed(4), +box.min.z.toFixed(4)],
        max: [+box.max.x.toFixed(4), +box.max.y.toFixed(4), +box.max.z.toFixed(4)],
        center: [+ctr.x.toFixed(4), +ctr.y.toFixed(4), +ctr.z.toFixed(4)],
        normalizedRatio: [+(sz.x / maxDim).toFixed(3), +(sz.y / maxDim).toFixed(3), +(sz.z / maxDim).toFixed(3)],
        flatnessRatio: +(minDim / maxDim).toFixed(4),
      };
    }

    return {
      totalMeshes,
      cuboidMeshes,
      sculptedMeshes,
      primitiveMeshes,
      surfaceMeshes,
      cuboidRatio,
      sculptedRatio,
      bounds,
      kinds: { ...kinds },
    };
  }

  _enterFallback(error) {
    if (this._disposed) return;
    this.backendKind = 'fallback';
    this._rendererReady = false;
    const reason = error instanceof Error ? error.message : String(error || 'WebGPU/WebGL unavailable');
    let prevented = false;
    if (this.canvas) {
      this.canvas.dataset.stageFallback = 'true';
      if (typeof CustomEvent === 'function' && typeof this.canvas.dispatchEvent === 'function') {
        const ev = new CustomEvent('stage:fallback', {
          bubbles: true,
          cancelable: true,
          detail: { reason, error },
        });
        const dispatched = this.canvas.dispatchEvent(ev);
        prevented = Boolean(ev.defaultPrevented) || dispatched === false;
      }
      if (!prevented && typeof document !== 'undefined' && this.canvas.parentElement) {
        this._mountFallbackOverlay(reason);
      }
    }
  }

  _mountFallbackOverlay(reason) {
    const parent = this.canvas?.parentElement;
    if (!parent || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    if (!this._fallbackEl) {
      const lang = String(document.documentElement?.lang || 'zh').toLowerCase();
      const isEn = lang.startsWith('en');
      const card = document.createElement('div');
      card.className = 'stage-fallback-card';
      card.setAttribute('role', 'status');
      const title = document.createElement('strong');
      title.textContent = isEn
        ? '3D Hardware Acceleration Unavailable (WebGL / WebGPU)'
        : '当前浏览器未启用 3D 硬件加速（WebGL / WebGPU 不可用）';
      const body = document.createElement('p');
      body.textContent = isEn
        ? 'Enable graphics acceleration in browser settings and reload. Parameters, live equations, and charts remain interactive.'
        : '请在浏览器设置中开启图形硬件加速后刷新；右侧参数、公式与图表仍可正常交互分析。';
      const code = document.createElement('code');
      code.className = 'stage-fallback-reason';
      card.append(title, body, code);
      card._reasonEl = code;
      parent.append(card);
      this._fallbackEl = card;
    }
    if (this._fallbackEl._reasonEl) {
      this._fallbackEl._reasonEl.textContent = String(reason || '');
    }
  }

  _setupLights(shadowBounds) {
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];

    this._hemiLight = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiIntensity);
    this.scene.add(this._hemiLight);

    // Key light casts shadows directly so highlights and cast shadows ALWAYS share one physical direction
    this._keyLight = new THREE.DirectionalLight(t.keyColor, t.keyIntensity);
    this._keyLight.position.set(-42, 86, 54);
    this._keyLight.target.position.set(0, 0, 0);
    this._keyLight.castShadow = true;
    this._keyLight.shadow.mapSize.set(2048, 2048);
    this._keyLight.shadow.camera.left = -shadowBounds;
    this._keyLight.shadow.camera.right = shadowBounds;
    this._keyLight.shadow.camera.top = shadowBounds;
    this._keyLight.shadow.camera.bottom = -shadowBounds;
    this._keyLight.shadow.camera.near = 10;
    this._keyLight.shadow.camera.far = 210;
    this._keyLight.shadow.bias = this._options.shadowBias ?? -0.00015;
    this._keyLight.shadow.normalBias = this._options.shadowNormalBias ?? 0.02;
    this.scene.add(this._keyLight);
    this.scene.add(this._keyLight.target);
    this._shadowLight = this._keyLight;

    // Soft cool/ambient fill opposite the key
    this._fillLight = new THREE.DirectionalLight(t.fillColor, t.fillIntensity);
    this._fillLight.position.set(46, 36, 44);
    this.scene.add(this._fillLight);

    // Dedicated back-top rim light separating metallic & dark sculpted silhouettes from backdrop
    this._rimLight = new THREE.DirectionalLight(t.rimColor ?? 0xfff4e0, t.rimIntensity ?? 0.45);
    this._rimLight.position.set(38, 46, -54);
    this.scene.add(this._rimLight);
  }

  _setupGround(groundY, gridSize) {
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];

    this._shadowMat = new THREE.ShadowMaterial({
      color: t.shadowColor,
      opacity: t.shadowOpacity,
      depthWrite: false,
    });
    this._shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), this._shadowMat);
    this._shadowPlane.rotation.x = -Math.PI / 2;
    this._shadowPlane.position.y = groundY;
    this._shadowPlane.receiveShadow = true;
    this._shadowPlane.layers.set(GROUND_LAYER);
    this._shadowPlane.renderOrder = -1;
    this._shadowPlane.visible = this._showGround;
    this._shadowPlane.userData.simulifyInternal = true;
    this.scene.add(this._shadowPlane);

    this._grid = null;
    this._gridTex = null;
    this._rebuildGrid(groundY, gridSize, t);

    const ringGeo = new THREE.RingGeometry(0.78, 0.94, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this._ringMat = new THREE.MeshBasicMaterial({
      color: '#149694',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._ringMesh = new THREE.Mesh(ringGeo, this._ringMat);
    this._ringMesh.visible = false;
    this._ringMesh.layers.set(GROUND_LAYER);
    this._ringMesh.renderOrder = 5;
    this._ringMesh.userData.simulifyInternal = true;
    this.scene.add(this._ringMesh);
  }

  _rebuildGrid(groundY, gridSize, theme) {
    if (this._grid) {
      this._grid.geometry?.dispose?.();
      const oldMats = Array.isArray(this._grid.material) ? this._grid.material : [this._grid.material];
      oldMats.forEach((m) => m?.dispose?.());
      this._grid.removeFromParent();
      this._grid = null;
    }
    if (this._gridTex) {
      this._gridTex.dispose?.();
      this._gridTex = null;
    }
    if (this._gridStyle === 'none') return;

    const useTSL = Boolean(
      (this.renderer?.isWebGPURenderer || (!this.renderer && THREE.WebGPURenderer)) &&
      THREE.MeshBasicNodeMaterial &&
      THREE.TSL
    );
    const geo = new THREE.PlaneGeometry(gridSize, gridSize);
    geo.rotateX(-Math.PI / 2);
    const mat = createAnalyticalGridMaterial(this._gridStyle, theme, gridSize, useTSL);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = groundY - 0.008;
    mesh.layers.set(GROUND_LAYER);
    mesh.renderOrder = -2;
    mesh.visible = this._showGrid;
    mesh.userData.simulifyInternal = true;
    this.scene.add(mesh);
    this._grid = mesh;
  }

  /**
   * Mark shadow map dirty (for `autoUpdateShadows: false` on-demand shadow rendering)
   * and schedule a stage render.
   */
  markShadowsDirty() {
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.requestRender();
  }

  /**
   * Compute a tight light-view-space orthographic shadow frustum wrapping visible shadow-casting
   * meshes under `target`, with texel snapping to eliminate shadow edge shimmering.
   *
   * @param {THREE.Object3D} [target=this.scene]
   * @param {number} [padding=1.12]
   */
  fitShadowFrustum(target = this.scene, padding = 1.12) {
    if (!this._keyLight || !target) return null;
    const pad = Math.max(1.0, Number(padding) || 1.12);
    target.updateMatrixWorld(true);

    const casters = [];
    const fallbackMeshes = [];
    const meshBox = new THREE.Box3();
    const worldBox = new THREE.Box3();

    target.traverseVisible((obj) => {
      if (!obj || !obj.isMesh || !obj.geometry || obj.userData?.simulifyInternal) return;
      if (obj.layers && !obj.layers.isEnabled(SOLID_LAYER)) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingBox || obj.geometry.boundingBox.isEmpty()) return;
      if (obj.castShadow) casters.push(obj);
      else fallbackMeshes.push(obj);
    });

    const list = casters.length > 0 ? casters : fallbackMeshes;
    if (list.length === 0) return null;

    for (const obj of list) {
      meshBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
      if (Number.isFinite(meshBox.min.x) && Number.isFinite(meshBox.max.x)) {
        worldBox.union(meshBox);
      }
    }
    if (worldBox.isEmpty()) return null;

    const worldCenter = new THREE.Vector3();
    const worldSize = new THREE.Vector3();
    worldBox.getCenter(worldCenter);
    worldBox.getSize(worldSize);

    // Keep key light direction & distance while re-centering onto the actual scene bounding center
    this._keyLight.target.position.copy(worldCenter);
    this._keyLight.position.copy(worldCenter).add(this._keyLightOffset);
    this._keyLight.target.updateMatrixWorld(true);
    this._keyLight.updateMatrixWorld(true);

    const shadowCam = this._keyLight.shadow.camera;
    shadowCam.position.copy(this._keyLight.position);
    shadowCam.up.set(0, 1, 0);
    shadowCam.lookAt(worldCenter);
    shadowCam.updateMatrixWorld(true);
    shadowCam.matrixWorldInverse.copy(shadowCam.matrixWorld).invert();

    // Project all 8 corners of every shadow caster into light view space
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const corner = new THREE.Vector3();

    for (const obj of list) {
      const bb = obj.geometry.boundingBox;
      const xs = [bb.min.x, bb.max.x];
      const ys = [bb.min.y, bb.max.y];
      const zs = [bb.min.z, bb.max.z];
      for (let ix = 0; ix < 2; ix += 1) {
        for (let iy = 0; iy < 2; iy += 1) {
          for (let iz = 0; iz < 2; iz += 1) {
            corner.set(xs[ix], ys[iy], zs[iz]).applyMatrix4(obj.matrixWorld).applyMatrix4(shadowCam.matrixWorldInverse);
            if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y) || !Number.isFinite(corner.z)) continue;
            if (corner.x < minX) minX = corner.x;
            if (corner.x > maxX) maxX = corner.x;
            if (corner.y < minY) minY = corner.y;
            if (corner.y > maxY) maxY = corner.y;
            if (corner.z < minZ) minZ = corner.z;
            if (corner.z > maxZ) maxZ = corner.z;
          }
        }
      }
    }

    if (!Number.isFinite(minX)) return null;

    // Pad tightly & make square aspect to match square 2048x2048 shadow map with texel snapping
    const rawSpanX = Math.max(0.5, maxX - minX);
    const rawSpanY = Math.max(0.5, maxY - minY);
    const sceneSpan = Math.max(rawSpanX, rawSpanY);
    const frustumSpan = Math.max(1.0, sceneSpan * pad);
    const halfSpan = frustumSpan * 0.5;

    const mapW = Math.max(256, this._keyLight.shadow.mapSize?.x || 2048);
    const texelSize = frustumSpan / mapW;
    const cx = Math.round(((minX + maxX) * 0.5) / texelSize) * texelSize;
    const cy = Math.round(((minY + maxY) * 0.5) / texelSize) * texelSize;

    const depthMargin = Math.max(4.0, frustumSpan * 0.6);
    shadowCam.left = cx - halfSpan;
    shadowCam.right = cx + halfSpan;
    shadowCam.top = cy + halfSpan;
    shadowCam.bottom = cy - halfSpan;
    shadowCam.near = Math.max(0.5, -maxZ - depthMargin);
    shadowCam.far = Math.max(shadowCam.near + 4.0, -minZ + depthMargin);
    shadowCam.updateProjectionMatrix();

    // Scale normalBias gently to scene scale to avoid acne on tiny or huge scenes
    if (this._options.shadowNormalBias === undefined) {
      this._keyLight.shadow.normalBias = clamp(frustumSpan * 0.0022, 0.008, 0.045);
    }

    this._shadowFrustumFitted = true;
    this.markShadowsDirty();

    return {
      left: +shadowCam.left.toFixed(4),
      right: +shadowCam.right.toFixed(4),
      top: +shadowCam.top.toFixed(4),
      bottom: +shadowCam.bottom.toFixed(4),
      near: +shadowCam.near.toFixed(4),
      far: +shadowCam.far.toFixed(4),
      sceneSpan: +sceneSpan.toFixed(4),
      frustumSpan: +frustumSpan.toFixed(4),
      utilization: +(sceneSpan / Math.max(1e-6, frustumSpan)).toFixed(4),
    };
  }

  /**
   * Deterministic look-dev & rendering telemetry snapshot for `verify_stage.py` and `window.__SIMULIFY_TELEMETRY__`.
   */
  getTelemetry() {
    const shadowCam = this._keyLight?.shadow?.camera;
    const frustumW = shadowCam ? Math.abs(shadowCam.right - shadowCam.left) : 0;
    const frustumH = shadowCam ? Math.abs(shadowCam.top - shadowCam.bottom) : 0;
    const frustumSpan = Math.max(frustumW, frustumH, 1e-6);

    const audit = this.getGeometryAudit();
    const b = audit.bounds;
    const sceneSpan = b ? Math.hypot(b.width, b.height, b.depth) * 0.72 : 0;
    const utilization = b ? clamp(sceneSpan / frustumSpan, 0, 1) : 0;

    let meshCount = 0;
    let roughMin = Infinity;
    let roughMax = -Infinity;
    let roughSum = 0;
    let roughCount = 0;
    let plasticClusterCount = 0;
    let metalMin = Infinity;
    let metalMax = -Infinity;
    let metalCount = 0;
    let midMetalnessCount = 0;
    let reflectiveCount = 0;
    let matteCount = 0;
    let maxTexAniso = 0;
    let minTexAniso = Infinity;

    const inspectTex = (tex) => {
      if (!tex || typeof tex.anisotropy !== 'number') return;
      if (tex.anisotropy > maxTexAniso) maxTexAniso = tex.anisotropy;
      if (tex.anisotropy < minTexAniso) minTexAniso = tex.anisotropy;
    };

    this.scene.traverseVisible((obj) => {
      if (!obj || !obj.isMesh || obj.userData?.simulifyInternal) return;
      meshCount += 1;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        inspectTex(m.map);
        inspectTex(m.roughnessMap);
        inspectTex(m.bumpMap);
        inspectTex(m.normalMap);
        if (typeof m.roughness === 'number') {
          const r = m.roughness;
          if (r < roughMin) roughMin = r;
          if (r > roughMax) roughMax = r;
          roughSum += r;
          roughCount += 1;
          const met = typeof m.metalness === 'number' ? m.metalness : 0;
          if (r >= 0.2 && r <= 0.45 && met < 0.5) plasticClusterCount += 1;
        }
        if (typeof m.metalness === 'number') {
          const met = m.metalness;
          if (met < metalMin) metalMin = met;
          if (met > metalMax) metalMax = met;
          metalCount += 1;
          if (met > 0.2 && met < 0.7) midMetalnessCount += 1;
        }
        const isRefl =
          m.userData?.reflective !== undefined
            ? Boolean(m.userData.reflective)
            : Boolean((m.metalness ?? 0) >= 0.35 || (m.clearcoat ?? 0) >= 0.35);
        if (isRefl) reflectiveCount += 1;
        else matteCount += 1;
      }
    });

    return {
      version: '3.1',
      theme: this.themeName,
      aestheticTier: PRIMER_THEMES.has(this.themeName) ? 'primer-illustration' : 'studio-pbr',
      backend: this.backendKind,
      dpr: +this.size.dpr.toFixed(3),
      physicalWidth: this.size.physicalWidth,
      physicalHeight: this.size.physicalHeight,
      toneMapping: toneMappingName(this.renderer?.toneMapping),
      toneMappingExposure: +(this.renderer?.toneMappingExposure ?? 1.0),
      outline: {
        preset: this.outlinePreset,
        enabled: Boolean(this.outlineEnabled),
        inkColor: this.outline ? `#${this.outline.lineColor.getHexString()}` : null,
      },
      ibl: {
        kind: this._envKind,
        pmremSigma: this._pmremSigma ?? null,
        selective: Boolean(this._selectiveIBL),
        sceneEnvironmentAttached: Boolean(this.scene.environment),
        environmentIntensity: +(this.scene.environmentIntensity ?? 0),
      },
      shadow: {
        type: shadowTypeName(this.renderer?.shadowMap?.type),
        radius: this._keyLight?.shadow?.radius ?? 0,
        autoUpdate: Boolean(this.renderer?.shadowMap?.autoUpdate ?? this._autoUpdateShadows),
        mapSize: [
          this._keyLight?.shadow?.mapSize?.x ?? 2048,
          this._keyLight?.shadow?.mapSize?.y ?? 2048,
        ],
        frustum: shadowCam
          ? {
              left: +shadowCam.left.toFixed(3),
              right: +shadowCam.right.toFixed(3),
              top: +shadowCam.top.toFixed(3),
              bottom: +shadowCam.bottom.toFixed(3),
              near: +shadowCam.near.toFixed(3),
              far: +shadowCam.far.toFixed(3),
            }
          : null,
        frustumSpan: +frustumSpan.toFixed(4),
        sceneSpan: +sceneSpan.toFixed(4),
        utilization: +utilization.toFixed(4),
        fitted: Boolean(this._shadowFrustumFitted),
      },
      materials: {
        meshCount,
        roughnessMin: roughCount > 0 ? +roughMin.toFixed(3) : null,
        roughnessMax: roughCount > 0 ? +roughMax.toFixed(3) : null,
        roughnessSpread: roughCount > 0 ? +(roughMax - roughMin).toFixed(3) : 0,
        roughnessMean: roughCount > 0 ? +(roughSum / roughCount).toFixed(3) : null,
        plasticClusterRatio: roughCount > 0 ? +(plasticClusterCount / roughCount).toFixed(3) : 0,
        metalnessMin: metalCount > 0 ? +metalMin.toFixed(3) : null,
        metalnessMax: metalCount > 0 ? +metalMax.toFixed(3) : null,
        midMetalnessCount,
        reflectiveCount,
        matteCount,
        maxTextureAnisotropy: maxTexAniso,
        minTextureAnisotropy: Number.isFinite(minTexAniso) ? minTexAniso : null,
      },
    };
  }

  /** Switch radial-fade stage ground grid style: `'cartesian' | 'polar' | 'plinth' | 'none'`. */
  setGridStyle(style = 'cartesian') {
    const allowed = new Set(['cartesian', 'polar', 'plinth', 'none']);
    this._gridStyle = allowed.has(style) ? style : 'cartesian';
    this._showGrid = this._gridStyle !== 'none';
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    this._rebuildGrid(this._groundY, this._gridSize, t);
    this.requestRender();
    return this._gridStyle;
  }

  /** Switch studio lighting, rim light, shadow tint, radial grid palette, and outline ink live. */
  setTheme(themeName) {
    const key = STUDIO_THEMES[themeName] ? themeName : 'paper-ink';
    const tierChanged = PRIMER_THEMES.has(this.themeName) !== PRIMER_THEMES.has(key);
    this.themeName = key;
    const t = STUDIO_THEMES[key];
    this._hemiLight.color.setHex(t.hemiSky);
    this._hemiLight.groundColor.setHex(t.hemiGround);
    this._hemiLight.intensity = t.hemiIntensity;
    this._keyLight.color.setHex(t.keyColor);
    this._keyLight.intensity = t.keyIntensity;
    this._fillLight.color.setHex(t.fillColor);
    this._fillLight.intensity = t.fillIntensity;
    if (this._rimLight) {
      this._rimLight.color.setHex(t.rimColor ?? 0xfff4e0);
      this._rimLight.intensity = t.rimIntensity ?? 0.45;
    }
    this._shadowMat.color.setHex(t.shadowColor);
    this._shadowMat.opacity = t.shadowOpacity;
    if (this.renderer && this._options.toneMapping === undefined) {
      this.renderer.toneMapping = this._resolveDefaultToneMapping(key);
      this.renderer.toneMappingExposure =
        this._options.toneMappingExposure ?? (PRIMER_THEMES.has(key) ? 1.0 : 1.02);
    }
    const previousEnv = tierChanged && this.renderer ? this._envRT : null;
    if (tierChanged) {
      if (this.renderer) {
        this._configureShadows();
        this._bakeEnvironment();
      }
      if (this._outlineOption === undefined || this._outlineOption === 'auto') {
        this.setOutlinePreset(this._outlineOption);
      }
    }
    this._syncSceneEnvironment(t);
    if (previousEnv !== this._envRT) previousEnv?.dispose();
    this._rebuildGrid(this._groundY, this._gridSize, t);
    if (this.outline && this._options.lineColor === undefined) {
      this.outline.setInkColor(t.inkColor, this._options.lineOpacity ?? t.inkOpacity);
    }
    this.requestRender();
  }

  /**
   * Add a Backcountry-101 Gaussian grounding blob shadow (`exp(-t*t*4.5)*(1-t)`) on `GROUND_LAYER`.
   * Accepts either `(radius, opacity, opts)` or an options object `{ radius, radiusX, radiusZ, opacity, position, color }`.
   */
  addContactBlobShadow(radiusOrOpts = 2.4, opacity = 0.28, opts = {}) {
    if (radiusOrOpts && typeof radiusOrOpts === 'object') {
      const rx = radiusOrOpts.radiusX ?? radiusOrOpts.radius ?? 2.4;
      const rz = radiusOrOpts.radiusZ ?? radiusOrOpts.radius ?? rx;
      return this.addContactShadow({
        position: radiusOrOpts.position ?? [0, this._groundY, 0],
        radiusX: rx,
        radiusZ: rz,
        opacity: radiusOrOpts.opacity ?? 0.28,
        color: radiusOrOpts.color,
      });
    }
    const r = Math.max(0.2, Number(radiusOrOpts) || 2.4);
    return this.addContactShadow({
      position: opts.position ?? [0, this._groundY, 0],
      radiusX: opts.radiusX ?? r,
      radiusZ: opts.radiusZ ?? r,
      opacity: Number(opacity) || 0.28,
      color: opts.color,
    });
  }

  /**
   * Add a soft ambient-occlusion contact shadow decal on `GROUND_LAYER` beneath a mechanism or plinth.
   * Grounding objects with soft contact shadows eliminates floating look on bright paper backgrounds.
   */
  addContactShadow({ position = [0, 0, 0], radiusX = 2.4, radiusZ = 2.4, opacity = 0.28, color } = {}) {
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const tex = createContactShadowTexture(color ?? t.shadowColor);
    const geo = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: tex ? 0xffffff : (color ?? t.shadowColor),
      map: tex || null,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position[0] ?? 0, (position[1] ?? this._groundY) + 0.004, position[2] ?? 0);
    mesh.layers.set(GROUND_LAYER);
    mesh.renderOrder = -1;
    mesh.userData.simulifyInternal = true;
    this.scene.add(mesh);

    const handle = {
      mesh,
      setPosition(x, z, y = mesh.position.y) {
        mesh.position.set(x, y, z);
      },
      setScale(rx, rz = rx) {
        mesh.scale.set(rx / radiusX, 1, rz / radiusZ);
      },
      setOpacity(op) {
        mat.opacity = op;
      },
      dispose: () => {
        mesh.removeFromParent();
        geo.dispose();
        tex?.dispose?.();
        mat.dispose();
        this._contactShadows.delete(handle);
      },
    };
    this._contactShadows.add(handle);
    this.requestRender();
    return handle;
  }

  /**
   * Create a controllable local accent light (PointLight / SpotLight) for glowing coils, lenses, or lasers.
   */
  createAccentLight({
    type = 'point',
    color = 0xff8a3d,
    intensity = 2.2,
    distance = 8,
    decay = 2,
    position = [0, 1.5, 0],
    target = [0, 0, 0],
    angle = Math.PI / 5,
    penumbra = 0.45,
  } = {}) {
    const light =
      type === 'spot'
        ? new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay)
        : new THREE.PointLight(color, intensity, distance, decay);
    light.position.set(position[0] ?? 0, position[1] ?? 1.5, position[2] ?? 0);
    this.scene.add(light);
    if (type === 'spot' && light.target) {
      light.target.position.set(target[0] ?? 0, target[1] ?? 0, target[2] ?? 0);
      this.scene.add(light.target);
    }
    const entry = {
      light,
      setIntensity: (v) => {
        light.intensity = Number(v) || 0;
        this.requestRender();
      },
      setColor: (c) => {
        light.color.set(c);
        this.requestRender();
      },
      setPosition: (x, y, z) => {
        light.position.set(x, y, z);
        this.requestRender();
      },
      dispose: () => {
        light.removeFromParent();
        light.target?.removeFromParent?.();
        light.dispose?.();
        this._accentLights.delete(entry);
      },
    };
    this._accentLights.add(entry);
    this.requestRender();
    return entry;
  }

  /** Adjust screen-space crease ambient occlusion strength (0..1) on the active OutlinePass. */
  setAOStrength(strength) {
    if (!this.outline) return 0;
    const val = this.outline.setAOStrength(strength);
    this.requestRender();
    return val;
  }

  /** Enable TSL Depth-of-Field post-processing on WebGPU/WebGL2 RenderPipeline. */
  async enableDepthOfField(opts = {}) {
    if (!this.outline?.enableDepthOfField) return false;
    const ok = await this.outline.enableDepthOfField({
      focusDistance: opts.focusDistance ?? this.view.distance,
      focalLength: opts.focalLength ?? 8,
      bokehScale: opts.bokehScale ?? 1.4,
    });
    this.requestRender();
    return ok;
  }

  /** Update or toggle Depth-of-Field parameters live. */
  setDepthOfField(opts = {}) {
    if (!this.outline?.setDepthOfField) return false;
    const ok = this.outline.setDepthOfField(opts);
    this.requestRender();
    return ok;
  }

  /**
   * Build a true solid Stencil Cutaway Cross-Section Cap with 45-degree engineering hatching.
   * Eliminates hollow paper-shell clipping artifacts when slicing closed sculpted parts.
   *
   * @param {THREE.Object3D} target Closed Mesh or Group whose materials will be sliced by `plane`
   * @param {THREE.Plane} plane Clipping plane (`stage.createCutawayPlane(...)`)
   * @param {{
   *   capSize?: number,
   *   baseColor?: string|number,
   *   hatchColor?: string|number,
   *   hatchAngle?: number,
   *   hatchSpacing?: number,
   *   renderOrder?: number,
   *   attachClipping?: boolean,
   * }} [opts]
   */
  /**
   * Create a Three.js `ClippingGroup` (required by WebGPURenderer r187+ for hardware/shader clipping;
   * falls back to a standard `THREE.Group` on legacy WebGLRenderer).
   */
  createClippingGroup(planes = [], { clipShadows = true, clipIntersection = false, enabled = true, name = 'simulify-clipping-group' } = {}) {
    const grp = typeof THREE.ClippingGroup === 'function' ? new THREE.ClippingGroup() : new THREE.Group();
    grp.name = name;
    grp.userData.simulifyInternal = true;
    if (grp.isClippingGroup) {
      grp.clippingPlanes = Array.isArray(planes) ? planes : [];
      grp.clipShadows = Boolean(clipShadows);
      grp.clipIntersection = Boolean(clipIntersection);
      grp.enabled = Boolean(enabled);
    }
    return grp;
  }

  /**
   * Create a true solid-section **Stencil Cutaway Cap** for a closed 3D mesh or group sliced by `plane`.
   * Works on BOTH WebGPURenderer (via `THREE.ClippingGroup` + `stencilBuffer: true` on `OutlinePass` `colorPass`)
   * and legacy WebGLRenderer (via `material.clippingPlanes`), preventing hollow paper-shell slices and
   * rendering crisp 45° engineering cross-hatching on the cut face.
   *
   * - `onlyShells: true` clips ONLY subtrees tagged with `userData.shell === true`, leaving inner mechanisms intact.
   * - `hatchMode: 'analytical' | 'texture'` (default `'analytical'`) selects resolution-independent `fwidth()` hatching.
   */
  createCutawayCap(target, plane, opts = {}) {
    if (!target || !plane) {
      throw new Error('createCutawayCap requires a target Object3D and a THREE.Plane.');
    }
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const capSize = Math.max(2, Number(opts.capSize) || 14);
    const baseOrder = Number(opts.renderOrder) || 10;
    const onlyShells = Boolean(opts.onlyShells);
    const hatchMode = opts.hatchMode === 'texture' ? 'texture' : 'analytical';
    const group = new THREE.Group();
    group.name = opts.name || 'simulify-cutaway-cap';
    group.userData.simulifyInternal = true;

    const collectShellRoots = (rootObj) => {
      const found = [];
      const walk = (node) => {
        if (!node || node.userData?.simulifyInternal) return;
        if (node.userData?.shell === true) {
          found.push(node);
          return;
        }
        if (Array.isArray(node.children)) {
          for (const ch of node.children) walk(ch);
        }
      };
      walk(rootObj);
      return found;
    };

    const clipTargets = onlyShells ? collectShellRoots(target) : [target];

    // On WebGPURenderer r187+, clipping is scoped by `THREE.ClippingGroup` (not `material.clippingPlanes`).
    // Wrap each clipped subtree inside an identity-transform ClippingGroup at its current parent so transforms stay identical.
    const targetClipGroups = [];
    const targetClipPairs = [];
    if (typeof THREE.ClippingGroup === 'function' && opts.attachClipping !== false) {
      clipTargets.forEach((subTarget, idx) => {
        const cg = this.createClippingGroup([plane], {
          clipShadows: true,
          enabled: true,
          name: `${group.name}-target-clip-${idx}`,
        });
        if (subTarget.parent) {
          const origParent = subTarget.parent;
          origParent.add(cg);
          cg.add(subTarget);
        }
        targetClipGroups.push(cg);
        targetClipPairs.push({ subTarget, cg });
      });
    }
    const targetClipGroup = targetClipGroups[0] || null;

    const stencilGroup = this.createClippingGroup([plane], {
      clipShadows: false,
      enabled: true,
      name: `${group.name}-stencil`,
    });
    stencilGroup.renderOrder = baseOrder;
    group.add(stencilGroup);

    const stencilMats = [];
    const clonedPairs = [];

    const backMat = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      side: THREE.BackSide,
      clippingPlanes: [plane],
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.IncrementWrapStencilOp,
      stencilZFail: THREE.IncrementWrapStencilOp,
      stencilZPass: THREE.IncrementWrapStencilOp,
    });

    const frontMat = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      side: THREE.FrontSide,
      clippingPlanes: [plane],
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.DecrementWrapStencilOp,
      stencilZFail: THREE.DecrementWrapStencilOp,
      stencilZPass: THREE.DecrementWrapStencilOp,
    });
    stencilMats.push(backMat, frontMat);

    const attachedMats = [];
    const seenMeshes = new Set();
    for (const subTarget of clipTargets) {
      subTarget.traverse((obj) => {
        if (!obj || !obj.isMesh || !obj.geometry || obj.userData?.simulifyInternal || seenMeshes.has(obj)) return;
        seenMeshes.add(obj);
        if (opts.attachClipping !== false && obj.material) {
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of list) {
            if (!m) continue;
            const prev = Array.isArray(m.clippingPlanes) ? m.clippingPlanes : [];
            if (!prev.includes(plane)) {
              m.clippingPlanes = [...prev, plane];
            }
            m.clipShadows = true;
            attachedMats.push(m);
          }
        }
        const mBack = new THREE.Mesh(obj.geometry, backMat);
        mBack.renderOrder = baseOrder;
        mBack.frustumCulled = false;
        mBack.matrixAutoUpdate = false;
        mBack.userData.simulifyInternal = true;
        mBack.layers.set(GROUND_LAYER);

        const mFront = new THREE.Mesh(obj.geometry, frontMat);
        mFront.renderOrder = baseOrder;
        mFront.frustumCulled = false;
        mFront.matrixAutoUpdate = false;
        mFront.userData.simulifyInternal = true;
        mFront.layers.set(GROUND_LAYER);

        stencilGroup.add(mBack, mFront);
        clonedPairs.push({ source: obj, back: mBack, front: mFront });
      });
    }

    const isDark =
      this.themeName === 'dark-studio' || this.themeName === 'blueprint' || this.themeName === 'obsidian-gallery';
    const baseCapColor = opts.baseColor ?? (isDark ? '#24344e' : '#eadec9');
    const hatchCapColor = opts.hatchColor ?? t.inkColor;

    let hatchTex = null;
    let capMat;
    if (hatchMode === 'analytical') {
      const useTSL = Boolean(
        (this.renderer?.isWebGPURenderer || (!this.renderer && THREE.WebGPURenderer)) &&
          THREE.TSL &&
          (THREE.MeshStandardNodeMaterial || THREE.MeshBasicNodeMaterial)
      );
      capMat = createAnalyticalCutawayCapMaterial({
        baseColor: baseCapColor,
        hatchColor: hatchCapColor,
        spacing: opts.hatchSpacing,
        angleDeg: opts.hatchAngle ?? 45,
        useTSL,
      });
    } else {
      hatchTex = createCutawayHatchTexture({
        baseColor: baseCapColor,
        hatchColor: hatchCapColor,
        spacing: opts.hatchSpacing ?? 16,
        angleDeg: opts.hatchAngle ?? 45,
      });
      if (hatchTex) {
        const rep = Math.max(2, capSize * 1.1);
        hatchTex.repeat.set(rep, rep);
        hatchTex.anisotropy = this.getMaxAnisotropy();
      }
      capMat = new THREE.MeshStandardMaterial({
        color: hatchTex ? 0xffffff : (opts.baseColor ?? 0xd9cbb4),
        map: hatchTex || null,
        roughness: 0.72,
        metalness: 0.08,
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      });
      capMat.userData = { ...(capMat.userData || {}), simulifyHatchMode: 'texture' };
    }

    const capGeo = new THREE.PlaneGeometry(capSize, capSize);

    const capGroup = new THREE.Group();
    capGroup.name = `${group.name}-cap-plane`;
    capGroup.renderOrder = baseOrder + 1;
    capGroup.userData.simulifyInternal = true;

    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.renderOrder = baseOrder + 1;
    capMesh.layers.set(GROUND_LAYER);
    capMesh.userData.simulifyInternal = true;
    capGroup.add(capMesh);
    group.add(capGroup);

    this.scene.add(group);

    const coplanar = new THREE.Vector3();
    const negNormal = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);

    const syncMatrices = () => {
      // If any clipped target was added to scene AFTER createCutawayCap, wrap it now
      for (const { subTarget, cg } of targetClipPairs) {
        if (!cg.parent && subTarget.parent && subTarget.parent !== cg) {
          const origParent = subTarget.parent;
          origParent.add(cg);
          cg.add(subTarget);
        }
      }
      target.updateMatrixWorld(true);
      for (const pair of clonedPairs) {
        pair.back.matrix.copy(pair.source.matrixWorld);
        pair.front.matrix.copy(pair.source.matrixWorld);
        pair.back.matrixWorld.copy(pair.source.matrixWorld);
        pair.front.matrixWorld.copy(pair.source.matrixWorld);
        pair.back.matrixWorldNeedsUpdate = false;
        pair.front.matrixWorldNeedsUpdate = false;
        pair.back.visible = pair.source.visible;
        pair.front.visible = pair.source.visible;
      }
      plane.coplanarPoint(coplanar);
      capMesh.position.copy(coplanar);
      negNormal.copy(plane.normal).negate().normalize();
      // Singularity-free orientation for horizontal (0,±1,0), vertical, and oblique cut planes
      capMesh.quaternion.setFromUnitVectors(zAxis, negNormal);
      capMesh.updateMatrixWorld(true);
    };

    const sync = () => {
      syncMatrices();
      this.requestRender();
    };
    sync();

    const handle = {
      group,
      targetClipGroup,
      targetClipGroups,
      stencilGroup,
      plane,
      capMesh,
      onlyShells,
      hatchMode,
      sync,
      syncMatrices,
      setConstant: (c) => {
        plane.constant = Number(c) || 0;
        sync();
      },
      setEnabled: (enabled) => {
        const on = Boolean(enabled);
        group.visible = on;
        for (const cg of targetClipGroups) {
          if (cg && cg.isClippingGroup) cg.enabled = on;
        }
        if (stencilGroup && stencilGroup.isClippingGroup) stencilGroup.enabled = on;
        for (const m of attachedMats) {
          m.clippingPlanes = on ? [plane] : [];
        }
        this.requestRender();
      },
      dispose: () => {
        group.removeFromParent();
        for (const { subTarget, cg } of targetClipPairs) {
          if (cg.parent && subTarget.parent === cg) {
            cg.parent.add(subTarget);
          }
          cg.removeFromParent();
        }
        capGeo.dispose();
        hatchTex?.dispose?.();
        capMat.dispose();
        stencilMats.forEach((m) => m.dispose());
        for (const m of attachedMats) {
          if (Array.isArray(m.clippingPlanes)) {
            m.clippingPlanes = m.clippingPlanes.filter((p) => p !== plane);
          }
        }
        this._cutawayCaps.delete(handle);
      },
    };
    this._cutawayCaps.add(handle);
    return handle;
  }

  /**
   * Toggle Fresnel X-Ray visibility strictly on meshes inside `userData.shell === true` subtrees,
   * moving them to `GLASS_LAYER` so internal solid mechanisms retain crisp shadows and outlines.
   * Restores original materials, layers, and `castShadow` flags losslessly when disabled.
   *
   * @param {THREE.Object3D} root
   * @param {boolean} enabled
   * @param {{ color?: string|number, rimColor?: string|number, opacity?: number, emissiveIntensity?: number, doubleSide?: boolean }} [opts]
   * @returns {number} Count of shell meshes updated
   */
  setShellXRay(root, enabled, opts = {}) {
    if (!root || typeof root.traverse !== 'function') return 0;
    const on = Boolean(enabled);
    const shellMeshes = [];
    const walk = (node, insideShell) => {
      if (!node || node.userData?.simulifyInternal) return;
      const isShell = insideShell || node.userData?.shell === true;
      if (isShell && node.isMesh) {
        shellMeshes.push(node);
      }
      if (Array.isArray(node.children)) {
        for (const ch of node.children) walk(ch, isShell);
      }
    };
    walk(root, false);

    if (shellMeshes.length === 0) return 0;

    if (on) {
      const xrayMat = createXRayMaterial(opts);
      xrayMat.userData = { ...(xrayMat.userData || {}), simulifyShellXRay: true };
      this._shellXRayMats.add(xrayMat);
      for (const mesh of shellMeshes) {
        if (!this._shellXRaySaved.has(mesh)) {
          this._shellXRaySaved.set(mesh, {
            material: mesh.material,
            layerMask: mesh.layers.mask,
            castShadow: mesh.castShadow,
          });
        }
        mesh.material = xrayMat;
        mesh.layers.set(GLASS_LAYER);
        mesh.castShadow = false;
      }
    } else {
      for (const mesh of shellMeshes) {
        const saved = this._shellXRaySaved.get(mesh);
        if (!saved) continue;
        mesh.material = saved.material;
        mesh.layers.mask = saved.layerMask;
        mesh.castShadow = saved.castShadow;
        this._shellXRaySaved.delete(mesh);
      }
      if (this._shellXRayMats.size > 0) {
        const inUse = new Set();
        this.scene.traverse((obj) => {
          if (obj?.isMesh && obj.material && this._shellXRayMats.has(obj.material)) {
            inUse.add(obj.material);
          }
        });
        for (const mat of Array.from(this._shellXRayMats)) {
          if (!inUse.has(mat)) {
            mat.dispose?.();
            this._shellXRayMats.delete(mat);
          }
        }
      }
    }
    this.requestRender();
    return shellMeshes.length;
  }

  /**
   * Synchronize camera orbit/zoom/pan lockstep with a peer IsometricStage (e.g. `ab-compare`).
   * Returns an unlink function.
   */
  syncCameraWith(otherStage) {
    if (this._disposed || !otherStage || otherStage === this || otherStage._disposed) return () => {};
    this._syncedPeers.add(otherStage);
    otherStage._syncedPeers?.add(this);
    return () => {
      this._syncedPeers.delete(otherStage);
      otherStage._syncedPeers?.delete(this);
    };
  }

  /**
   * Render a crisp orthographic Front / Side / Top snapshot of the current scene into a target
   * 2D `<canvas>` without creating a second WebGL/WebGPU context.
   */
  captureCardinalSnapshot(viewName, destCanvas, { zoom } = {}) {
    if (!destCanvas || !this._rendererReady || !this.renderer) return false;
    const saved = {
      azimuth: this.view.azimuth,
      elevation: this.view.elevation,
      zoom: this.view.zoom,
      distance: this.view.distance,
      target: this.view.target.clone(),
      locked: this._userCameraLocked,
      topView: this._topView,
    };
    try {
      this.setCardinalView(viewName, { zoom: zoom ?? this.defaultView.zoom, unlock: false });
      const ctx = destCanvas.getContext?.('2d');
      if (ctx) {
        const rect = destCanvas.getBoundingClientRect?.();
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
        const w = Math.max(120, Math.round((rect?.width || destCanvas.width || 240) * dpr));
        const h = Math.max(80, Math.round((rect?.height || destCanvas.height || 140) * dpr));
        if (destCanvas.width !== w || destCanvas.height !== h) {
          destCanvas.width = w;
          destCanvas.height = h;
        }
        ctx.clearRect(0, 0, w, h);
        const srcW = this.canvas.width || 1;
        const srcH = this.canvas.height || 1;
        const scale = Math.min(w / srcW, h / srcH);
        const dw = srcW * scale;
        const dh = srcH * scale;
        ctx.drawImage(this.canvas, 0, 0, srcW, srcH, (w - dw) * 0.5, (h - dh) * 0.5, dw, dh);
      }
      return true;
    } finally {
      this.view.azimuth = saved.azimuth;
      this.view.elevation = saved.elevation;
      this.view.zoom = saved.zoom;
      this.view.distance = saved.distance;
      this.view.target.copy(saved.target);
      this._userCameraLocked = saved.locked;
      this._topView = saved.topView;
      this._updateCamera();
      this.renderNow();
    }
  }

  /** Toggle camera orbit/pan/zoom input (e.g. while a 3D manipulator owns the drag). */
  setOrbitEnabled(enabled) {
    this._orbitEnabled = Boolean(enabled);
    if (!this._orbitEnabled && this._drag) {
      this._drag = null;
    }
  }

  /** Optional cursor lock for manipulators/brushes so hover picking never overwrites it. */
  setCursorOverride(cursor) {
    this._cursorOverride = cursor || null;
    if (this.canvas) {
      this.canvas.style.cursor = this._cursorOverride || (this._hoveredId ? 'pointer' : 'grab');
    }
  }

  /** Switch between orthographic isometric and perspective camera at runtime. */
  setCameraType(type, { fov, distance } = {}) {
    const nextType = type === 'perspective' ? 'perspective' : 'orthographic';
    if (fov !== undefined) this.fov = fov;
    if (distance !== undefined) {
      this.distance = distance;
      this.view.distance = distance;
    } else if (nextType !== this.cameraType) {
      this.distance = nextType === 'perspective' ? 16 : 90;
      this.view.distance = this.distance;
    }
    this.cameraType = nextType;
    this.near = this._options.near ?? (nextType === 'perspective' ? 0.2 : 1);
    this.far = this._options.far ?? (nextType === 'perspective' ? 260 : 240);
    this.camera = this._createCamera();
    this._enableCameraLayers(this.camera);
    this._updateCamera();
    this._notifyViewChange();
    this.requestRender();
  }

  /** Create a THREE.Plane for cutaway cross-section slicing on materials (`material.clippingPlanes`). */
  createCutawayPlane(normal = [0, -1, 0], constant = 2) {
    return new THREE.Plane(new THREE.Vector3(...normal).normalize(), constant);
  }

  /** Set global renderer clipping planes (pass `[]` to clear). */
  setClippingPlanes(planes = []) {
    if (this.renderer) {
      this.renderer.clippingPlanes = Array.isArray(planes) ? planes : [];
    }
    this.requestRender();
  }

  setHighlightRing(worldPos, radius = 0.85, color = '#149694') {
    if (worldPos && worldPos.isObject3D) {
      const center = new THREE.Box3().setFromObject(worldPos).getCenter(this._tmpVec);
      this._ringMesh.position.copy(center);
    } else if (worldPos) {
      this._ringMesh.position.copy(worldPos);
    }
    this._ringMesh.scale.setScalar(radius / 0.85);
    this._ringMat.color.set(color);
    this._ringMesh.visible = true;
    this.requestRender();
  }

  clearHighlightRing() {
    if (this._ringMesh.visible) {
      this._ringMesh.visible = false;
      this.requestRender();
    }
  }

  _bindEvents() {
    const c = this.canvas;
    this._eventCleanups = [];
    const listen = (type, handler, options) => this._listen(c, type, handler, options);
    c.style.cursor = 'grab';
    listen('contextmenu', (e) => e.preventDefault());

    listen('pointerdown', (e) => {
      if (!this._orbitEnabled) return;
      if (e.button !== 0 && e.button !== 2) return;
      this._fly = null;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic pointer events without active pointer
      }
      const panMode = e.button === 2 || e.shiftKey;
      this._drag = {
        id: e.pointerId,
        mode: panMode ? 'pan' : 'orbit',
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: 0,
      };
      c.style.cursor = panMode ? 'move' : 'grabbing';
    });

    listen('pointermove', (e) => {
      if (this._drag && e.pointerId === this._drag.id) {
        const dx = e.clientX - this._drag.lastX;
        const dy = e.clientY - this._drag.lastY;
        this._drag.lastX = e.clientX;
        this._drag.lastY = e.clientY;
        this._drag.moved += Math.hypot(dx, dy);

        // Lock camera ownership to user once an intentional drag begins (click-to-pick does not lock)
        if (this._drag.moved >= 2) {
          this._userCameraLocked = true;
        }

        if (this._drag.mode === 'orbit') {
          this.view.azimuth -= dx * 0.0072;
          this.view.elevation = clamp(this.view.elevation + dy * 0.0068, 2 * DEG, 88 * DEG);
          this._topView = false;
        } else {
          const span =
            this.cameraType === 'perspective'
              ? 2 * (this.view.distance / this.view.zoom) * Math.tan((this.camera.fov * DEG) / 2)
              : this.camera.top - this.camera.bottom;
          const scale = span / Math.max(this.size.height, 240);
          const forward = new THREE.Vector3(-Math.sin(this.view.azimuth), 0, -Math.cos(this.view.azimuth));
          const right = new THREE.Vector3(Math.cos(this.view.azimuth), 0, -Math.sin(this.view.azimuth));
          this.view.target.addScaledVector(right, -dx * scale);
          this.view.target.addScaledVector(forward, dy * scale);
          this.view.target.x = clamp(this.view.target.x, -12, 12);
          this.view.target.z = clamp(this.view.target.z, -12, 12);
        }
        this._updateCamera();
        this._notifyViewChange();
        this.requestRender();
        return;
      }
      this._updateHover(e.clientX, e.clientY);
    });

    const endPointer = (e) => {
      if (!this._drag || e.pointerId !== this._drag.id) return;
      const wasClick = this._drag.moved < 6 && e.button === 0;
      this._drag = null;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if capture was already released
      }
      if (wasClick) {
        const hit = this._pickAt(e.clientX, e.clientY);
        if (hit && this._onSelect) {
          this._onSelect(hit);
        }
      }
      this._updateHover(e.clientX, e.clientY);
      this.requestRender();
    };

    listen('pointerup', endPointer);
    listen('pointercancel', endPointer);
    listen('pointerleave', () => {
      if (!this._drag) this._setHover(null, 0, 0);
    });

    listen(
      'wheel',
      (e) => {
        if (!this._orbitEnabled) return;
        e.preventDefault();
        this._fly = null;
        this._userCameraLocked = true;
        const factor = Math.exp(-e.deltaY * 0.0011);
        this.view.zoom = clamp(this.view.zoom * factor, 0.5, 2.8);
        this._updateCamera();
        this._notifyViewChange();
        this.requestRender();
      },
      { passive: false }
    );
  }

  _updateHover(clientX, clientY) {
    const hit = this._pickAt(clientX, clientY);
    this._setHover(hit, clientX, clientY);
  }

  _setHover(hit, clientX, clientY) {
    const nextId = hit ? hit.id : null;
    if (
      !this._drag &&
      this._orbitEnabled &&
      !this._cursorOverride &&
      this.canvas.dataset?.cursorLock !== 'true' &&
      this.canvas.style.cursor !== 'crosshair'
    ) {
      this.canvas.style.cursor = nextId ? 'pointer' : 'grab';
    }
    const changed = nextId !== this._hoveredId;
    this._hoveredId = nextId;
    if (this._onHover && (changed || hit)) {
      const rect = this.canvas.getBoundingClientRect();
      this._onHover(hit, clientX - rect.left, clientY - rect.top, changed);
    }
  }

  _pickAt(clientX, clientY) {
    if (!this._pickRoots.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this._pickRoots, true);
    for (const h of hits) {
      let cur = h.object;
      let invisible = false;
      let foundId = null;
      while (cur) {
        if (cur.visible === false) invisible = true;
        if (!foundId && cur.userData && cur.userData.pickId) {
          foundId = cur.userData.pickId;
        }
        cur = cur.parent;
      }
      if (!invisible && foundId) {
        return this._pickables.get(foundId) || null;
      }
    }
    return null;
  }

  registerPickable(id, object3D, meta = {}) {
    object3D.userData.pickId = id;
    object3D.traverse((child) => {
      child.userData.pickId = id;
    });
    const entry = { id, object3D, meta };
    this._pickables.set(id, entry);
    this._pickRoots = Array.from(this._pickables.values(), (p) => p.object3D);
    return entry;
  }

  unregisterPickable(id) {
    const existing = this._pickables.get(id);
    if (existing) {
      delete existing.object3D.userData.pickId;
      existing.object3D.traverse((child) => {
        delete child.userData.pickId;
      });
      this._pickables.delete(id);
      this._pickRoots = Array.from(this._pickables.values(), (p) => p.object3D);
    }
    if (this._hoveredId === id) {
      this._hoveredId = null;
      this.clearHighlightRing();
    }
  }

  clearPickables() {
    this._pickables.clear();
    this._pickRoots = [];
    this._hoveredId = null;
  }

  /**
   * Resize renderer, outline pass, and camera with 1:1 physical pixel accuracy.
   * Uses `device-pixel-content-box` when available (preventing Windows 125%/150%/200%
   * fractional-DPR 1px off-by-one blur) and supports DPR up to 3x.
   * Respects locked export dimensions when `setExportSize(w, h, dpr)` is active.
   */
  resize(force = false) {
    if (this._disposed) return;
    let width;
    let height;
    let dpr;
    let physicalWidth;
    let physicalHeight;

    if (this._exportSize) {
      ({ width, height, dpr } = this._exportSize);
      physicalWidth = Math.max(2, Math.round(width * dpr));
      physicalHeight = Math.max(2, Math.round(height * dpr));
    } else {
      const rect = this.canvas.getBoundingClientRect();
      const rawCssW = rect.width || this.canvas.clientWidth || this.canvas.width || 800;
      const rawCssH = rect.height || this.canvas.clientHeight || this.canvas.height || 500;
      width = Math.max(200, Math.round(rawCssW));
      height = Math.max(160, Math.round(rawCssH));
      const rawDpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      const cappedDpr = Math.min(rawDpr, MAX_DPR);
      const expectedPhysW = Math.max(2, Math.round(rawCssW * cappedDpr));
      const expectedPhysH = Math.max(2, Math.round(rawCssH * cappedDpr));

      if (this._physSize && this._physSize.width >= 2 && this._physSize.height >= 2) {
        const capScale = rawDpr > MAX_DPR ? MAX_DPR / rawDpr : 1;
        const dpcW = Math.max(2, Math.round(this._physSize.width * capScale));
        const dpcH = Math.max(2, Math.round(this._physSize.height * capScale));
        // Trust devicePixelContentBoxSize when aligned with devicePixelRatio (real 125%/150%/200% displays);
        // fall back to exact Math.round(css * dpr) when emulated/headless DPC lags behind DPR.
        if (Math.abs(dpcW - expectedPhysW) <= 4 && Math.abs(dpcH - expectedPhysH) <= 4) {
          physicalWidth = dpcW;
          physicalHeight = dpcH;
        } else {
          physicalWidth = expectedPhysW;
          physicalHeight = expectedPhysH;
        }
        dpr = physicalWidth / Math.max(1, rawCssW);
      } else {
        physicalWidth = expectedPhysW;
        physicalHeight = expectedPhysH;
        dpr = cappedDpr;
      }
    }

    if (
      !force &&
      width === this.size.width &&
      height === this.size.height &&
      physicalWidth === this.size.physicalWidth &&
      physicalHeight === this.size.physicalHeight &&
      Math.abs(dpr - this.size.dpr) < 1e-4
    ) {
      return;
    }

    this.size = { width, height, dpr, physicalWidth, physicalHeight };

    if (this.renderer) {
      // Set exact integer physical dimensions with pixelRatio=1 so Three.js Math.floor(w * dpr)
      // NEVER drops 1 physical pixel on Windows 125% / 150% / 175% DPI scaling
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(physicalWidth, physicalHeight, false);
    }
    if (this.outline) {
      this.outline.setSize(width, height, dpr, physicalWidth, physicalHeight);
    }
    this._updateCamera();
    this._onViewChange?.(this.getCameraState());
    this.htmlSurfaces?.handleViewportResize?.();
    if (this.htmlSurfaces?.nativeEnabled) {
      this.htmlSurfaces.requestPaint();
    }
    this.requestRender();
  }

  /**
   * Lock exact canvas backing dimensions for deterministic video/image export.
   * Pass `null` (or call `restoreSize()`) to unlock and resume viewport sizing.
   */
  setExportSize(width, height, dpr = 1) {
    if (width === null || width === undefined) {
      return this.restoreSize();
    }
    this._exportSize = {
      width: Math.max(64, Math.round(Number(width) || 1280)),
      height: Math.max(64, Math.round(Number(height) || 720)),
      dpr: Math.max(1, Number(dpr) || 1),
    };
    this.resize(true);
    return { ...this.size };
  }

  restoreSize() {
    this._exportSize = null;
    this.resize(true);
    return { ...this.size };
  }

  _updateCamera() {
    const aspect = this.size.width / Math.max(1, this.size.height);
    const fitBoost = aspect < 1 ? 1.48 : 1;
    const { target, azimuth, elevation } = this.view;
    const cosEl = Math.cos(elevation);

    if (this.cameraType === 'perspective') {
      this.camera.fov = this.fov * fitBoost;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      const dist = (this.view.distance || this.distance) / Math.max(0.2, this.view.zoom);
      this.camera.position.set(
        target.x + dist * cosEl * Math.sin(azimuth),
        target.y + dist * Math.sin(elevation),
        target.z + dist * cosEl * Math.cos(azimuth)
      );
    } else {
      const halfH = (this.baseSpan * fitBoost) / (2 * this.view.zoom);
      const halfW = halfH * aspect;

      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.updateProjectionMatrix();

      const dist = this.view.distance || this.distance;
      this.camera.position.set(
        target.x + dist * cosEl * Math.sin(azimuth),
        target.y + dist * Math.sin(elevation),
        target.z + dist * cosEl * Math.cos(azimuth)
      );
    }

    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.htmlSurfaces?.updateGeometries(this.camera);
  }

  /** Whether the user has manually taken over the camera via drag, wheel, or flyTo. */
  isUserCameraLocked() {
    return Boolean(this._userCameraLocked);
  }

  /** Release user camera lock so scripted choreography camera beats may resume. */
  unlockUserCamera() {
    this._userCameraLocked = false;
    this.requestRender();
  }

  /**
   * Scripted choreography camera placement: applies ONLY when the user has NOT
   * manually taken over the camera. Never interrupts an active user drag or flyTo.
   * @returns {boolean} True if applied, false if respected user lock.
   */
  setCameraFromScript(pose = {}) {
    if (!pose || this._userCameraLocked) return false;
    this._applyPoseImmediate(pose);
    return true;
  }

  /**
   * Instant deterministic camera placement (no wall-clock flyTo easing).
   * Reserved for explicit reset, export mode, act-jump unlock, or direct overrides.
   */
  setCameraImmediate(pose = {}, opts = {}) {
    if (!pose) return;
    if (opts && opts.unlock === true) {
      this._userCameraLocked = false;
    }
    this._applyPoseImmediate(pose);
  }

  _applyPoseImmediate(pose) {
    this._fly = null;
    if (pose.azimuth !== undefined) this.view.azimuth = Number(pose.azimuth);
    else if (pose.azimuthDeg !== undefined) this.view.azimuth = Number(pose.azimuthDeg) * DEG;

    if (pose.elevation !== undefined) this.view.elevation = clamp(Number(pose.elevation), 0, 89 * DEG);
    else if (pose.elevationDeg !== undefined) {
      this.view.elevation = clamp(Number(pose.elevationDeg) * DEG, 0, 89 * DEG);
    }

    if (pose.distance !== undefined) this.view.distance = Math.max(1, Number(pose.distance));
    if (pose.zoom !== undefined) this.view.zoom = clamp(Number(pose.zoom), 0.45, 3.0);
    if (pose.fov !== undefined && this.cameraType === 'perspective') this.fov = Number(pose.fov);

    if (pose.target) {
      if (Array.isArray(pose.target)) {
        this.view.target.set(pose.target[0] ?? 0, pose.target[1] ?? 0, pose.target[2] ?? 0);
      } else if (pose.target.isVector3) {
        this.view.target.copy(pose.target);
      } else if (typeof pose.target === 'object') {
        this.view.target.set(pose.target.x ?? 0, pose.target.y ?? 0, pose.target.z ?? 0);
      }
    }

    this._topView = this.view.elevation >= 83 * DEG;
    this._updateCamera();
    this._notifyViewChange();
    this.requestRender();
  }

  /**
   * Snap camera immediately to a standard engineering view for 3-view (Front / Side / Top)
   * proportion verification against Step 1 orthographic blueprints.
   * @param {'front'|'side'|'right'|'left'|'back'|'top'|'iso'} [viewName='iso']
   * @param {{ centerOnBounds?: boolean, zoom?: number, unlock?: boolean }} [opts]
   */
  setCardinalView(viewName = 'iso', opts = {}) {
    const key = String(viewName || 'iso').toLowerCase();
    const auditBounds = opts.centerOnBounds !== false ? this.getGeometryAudit()?.bounds : null;
    const target = auditBounds
      ? auditBounds.center
      : [this.defaultView.target.x, this.defaultView.target.y, this.defaultView.target.z];
    const zoom = opts.zoom ?? this.defaultView.zoom;
    const poses = {
      front: { azimuthDeg: 0, elevationDeg: 0, zoom, target },
      back: { azimuthDeg: 180, elevationDeg: 0, zoom, target },
      side: { azimuthDeg: 90, elevationDeg: 0, zoom, target },
      right: { azimuthDeg: 90, elevationDeg: 0, zoom, target },
      left: { azimuthDeg: -90, elevationDeg: 0, zoom, target },
      top: { azimuthDeg: 0, elevationDeg: 88.5, zoom, target },
      iso: {
        azimuth: this.defaultView.azimuth,
        elevation: this.defaultView.elevation,
        zoom: this.defaultView.zoom,
        distance: this.defaultView.distance,
        target: this.defaultView.target,
      },
    };
    const pose = poses[key] || poses.iso;
    this.setCameraImmediate(pose, { unlock: opts.unlock === true });
    this.renderNow();
    return {
      view: poses[key] ? key : 'iso',
      azimuthDeg: +(this.view.azimuth / DEG).toFixed(2),
      elevationDeg: +(this.view.elevation / DEG).toFixed(2),
      bounds: auditBounds,
    };
  }

  flyTo(goal = {}, durationMs = 420, opts = {}) {
    const shouldLock = opts?.lockUser !== false && opts?.fromScript !== true;
    if (shouldLock) {
      this._userCameraLocked = true;
    }

    const targetGoal = goal.target
      ? Array.isArray(goal.target)
        ? new THREE.Vector3(...goal.target)
        : new THREE.Vector3(goal.target.x ?? 0, goal.target.y ?? 0, goal.target.z ?? 0)
      : this.view.target.clone();
    const nextAz = goal.azimuth ?? this.view.azimuth;
    const nextEl = clamp(goal.elevation ?? this.view.elevation, 12 * DEG, 86 * DEG);
    const nextZoom = clamp(goal.zoom ?? this.view.zoom, 0.5, 2.8);
    const nextDist = goal.distance ?? this.view.distance;

    if (this.reducedMotion || this._manualMode || durationMs <= 0) {
      this._applyPoseImmediate({
        azimuth: nextAz,
        elevation: nextEl,
        zoom: nextZoom,
        distance: nextDist,
        target: targetGoal,
      });
      return;
    }

    this._fly = {
      start: performance.now(),
      duration: durationMs,
      fromAz: this.view.azimuth,
      fromEl: this.view.elevation,
      fromZoom: this.view.zoom,
      fromDist: this.view.distance,
      fromTarget: this.view.target.clone(),
      toAz: nextAz,
      toEl: nextEl,
      toZoom: nextZoom,
      toDist: nextDist,
      toTarget: targetGoal,
    };
    this.requestRender();
  }

  /** Focus camera cleanly on a registered pickable object ("Zoom to it"). */
  focusPart(id, zoom = 1.48) {
    const entry = this._pickables.get(id);
    if (!entry) return false;
    const center = new THREE.Box3().setFromObject(entry.object3D).getCenter(new THREE.Vector3());
    this.setHighlightRing(center);
    this.flyTo({ target: [center.x, center.y, center.z], zoom: Math.max(this.view.zoom, zoom) }, 400);
    return true;
  }

  rotateBy(degDelta) {
    this._topView = false;
    this.flyTo({ azimuth: this.view.azimuth + degDelta * DEG }, 300);
  }

  zoomBy(factor) {
    this.flyTo({ zoom: this.view.zoom * factor }, 240);
  }

  toggleTopView() {
    if (!this._topView) {
      this._savedOblique = {
        azimuth: this.view.azimuth,
        elevation: this.view.elevation,
        zoom: this.view.zoom,
        distance: this.view.distance,
        target: [this.view.target.x, this.view.target.y, this.view.target.z],
      };
      this._topView = true;
      this.flyTo({ azimuth: 0, elevation: 85 * DEG, zoom: Math.min(this.view.zoom, 1.05) }, 420);
    } else {
      const restore = this._savedOblique || {
        azimuth: this.defaultView.azimuth,
        elevation: this.defaultView.elevation,
        zoom: this.defaultView.zoom,
        distance: this.defaultView.distance,
        target: [this.defaultView.target.x, this.defaultView.target.y, this.defaultView.target.z],
      };
      this._topView = false;
      this.flyTo(restore, 420);
    }
    this._notifyViewChange();
    return this._topView;
  }

  resetView() {
    this._topView = false;
    this._savedOblique = null;
    this._userCameraLocked = false;
    this.flyTo(
      {
        azimuth: this.defaultView.azimuth,
        elevation: this.defaultView.elevation,
        zoom: this.defaultView.zoom,
        distance: this.defaultView.distance,
        target: [this.defaultView.target.x, this.defaultView.target.y, this.defaultView.target.z],
      },
      380,
      { lockUser: false }
    );
    this._notifyViewChange();
  }

  isTopView() {
    return this._topView;
  }

  getCameraState() {
    return {
      azimuth: this.view.azimuth,
      elevation: this.view.elevation,
      azimuthDeg: +(this.view.azimuth / DEG).toFixed(1),
      elevationDeg: +(this.view.elevation / DEG).toFixed(1),
      distance: +this.view.distance.toFixed(2),
      zoom: +this.view.zoom.toFixed(2),
      target: [+this.view.target.x.toFixed(3), +this.view.target.y.toFixed(3), +this.view.target.z.toFixed(3)],
      topView: this._topView,
      userCameraLocked: this._userCameraLocked,
      cameraType: this.cameraType,
    };
  }

  _notifyViewChange() {
    const state = this.getCameraState();
    if (this._onViewChange) {
      this._onViewChange(state);
    }
    if (!this._syncingCamera && this._syncedPeers.size > 0) {
      this._syncingCamera = true;
      try {
        for (const peer of this._syncedPeers) {
          if (!peer || peer._disposed || peer._syncingCamera) continue;
          peer._syncingCamera = true;
          try {
            peer._applyPoseImmediate({
              azimuth: this.view.azimuth,
              elevation: this.view.elevation,
              zoom: this.view.zoom,
              distance: this.view.distance,
              target: this.view.target,
            });
          } finally {
            peer._syncingCamera = false;
          }
        }
      } finally {
        this._syncingCamera = false;
      }
    }
  }

  projectToScreen(worldPos) {
    this._tmpVec.copy(worldPos).project(this.camera);
    return {
      x: (this._tmpVec.x * 0.5 + 0.5) * this.size.width,
      y: (-this._tmpVec.y * 0.5 + 0.5) * this.size.height,
      visible: this._tmpVec.z >= -1 && this._tmpVec.z <= 1,
    };
  }

  onFrame(fn) {
    this._frameCallbacks.add(fn);
    this.requestRender();
    return () => this._frameCallbacks.delete(fn);
  }

  /**
   * Mark the 3D stage dirty and schedule an on-demand animation frame.
   * When paused/idle with no flyTo, drag, pulse ring, or frame callbacks,
   * the GPU renders 0 idle frames instead of spinning at 60fps.
   */
  requestRender() {
    this._dirty = true;
    if (!this._disposed && !this._manualMode && this._rendererReady && !this._raf) {
      this._scheduleTick();
    }
  }

  _needsContinuousLoop() {
    return Boolean(
      this._fly ||
      this._drag ||
      this._frameCallbacks.size > 0 ||
      (this._ringMesh?.visible && !this.reducedMotion)
    );
  }

  /**
   * Toggle manual deterministic rendering mode (stops/resumes internal rAF loop).
   * Shared contract with SpacetimeClock and deterministic capture hooks.
   */
  setManualMode(enabled) {
    const next = Boolean(enabled);
    if (next === this._manualMode) return;
    this._manualMode = next;
    if (next) {
      this._fly = null;
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
    } else if (this._rendererReady && !this._disposed) {
      this.requestRender();
    }
  }

  _prepareSceneBeforeRender() {
    if (!this._envAppliedOnce && this.envMap) {
      const applied = this.applyEnvironment(this.scene);
      if (applied > 0 || this.scene.children.length > 8) {
        this._envAppliedOnce = true;
      }
    }
    if (this._autoFitShadowFrustum && !this._shadowFrustumFitted) {
      this.fitShadowFrustum(this.scene, 1.15);
    }
  }

  /**
   * Synchronously render the current scene state and sync HTML surface geometries.
   * Safe to call inside deterministic `window.__simulify.seek(t)`.
   */
  renderNow() {
    if (this._disposed || !this._rendererReady || !this.renderer) return false;
    this._prepareSceneBeforeRender();
    this.scene.updateMatrixWorld();
    if (this._cutawayCaps.size > 0) {
      for (const cap of this._cutawayCaps) {
        cap.syncMatrices?.();
      }
    }
    this.camera.updateMatrixWorld();
    if (this.htmlSurfaces) {
      this.htmlSurfaces.syncPaint(null);
      this.htmlSurfaces.updateGeometries(this.camera);
    }
    if (this.outline && this.outlineEnabled) {
      this.outline.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this._dirty = false;
    return true;
  }

  /**
   * Async render variant awaiting WebGPU init & pending HTML-in-Canvas paints, then
   * submitting the frame synchronously so the WebGPU swapchain texture stays live
   * for immediate `drawImage` / `toBlob` / `VideoFrame` capture.
   */
  async renderNowAsync() {
    if (this._disposed) return false;
    if (!this._rendererReady && this.ready) {
      await this.ready;
    }
    if (this._disposed || !this._rendererReady || !this.renderer) return false;
    this._prepareSceneBeforeRender();
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    if (this.htmlSurfaces?.flushPaint) {
      await this.htmlSurfaces.flushPaint();
      if (this._disposed) return false;
    }
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    if (this.htmlSurfaces) {
      this.htmlSurfaces.updateGeometries(this.camera);
      if (this.htmlSurfaces.hasPendingVisible?.() && this.htmlSurfaces.flushPaint) {
        await this.htmlSurfaces.flushPaint();
        if (this._disposed) return false;
      }
    }
    if (this.renderer._initialized === false && typeof this.renderer.init === 'function') {
      await this.renderer.init();
    }
    return this.renderNow();
  }

  /**
   * Deterministic single-frame step at explicit timestamp `nowMs`.
   */
  renderFrame(nowMs = performance.now(), explicitDt = null) {
    if (this._disposed) return false;
    const prev = this._lastFrameTime === null ? nowMs : this._lastFrameTime;
    const dt =
      explicitDt !== null
        ? Math.max(0, Math.min(0.05, Number(explicitDt) || 0))
        : Math.max(0, Math.min(0.05, (nowMs - prev) / 1000));
    this._lastFrameTime = nowMs;

    if (this._fly) {
      const t = clamp((nowMs - this._fly.start) / this._fly.duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.view.azimuth = this._fly.fromAz + (this._fly.toAz - this._fly.fromAz) * ease;
      this.view.elevation = this._fly.fromEl + (this._fly.toEl - this._fly.fromEl) * ease;
      this.view.zoom = this._fly.fromZoom + (this._fly.toZoom - this._fly.fromZoom) * ease;
      this.view.distance = this._fly.fromDist + (this._fly.toDist - this._fly.fromDist) * ease;
      this.view.target.lerpVectors(this._fly.fromTarget, this._fly.toTarget, ease);
      this._updateCamera();
      this._dirty = true;
      if (t >= 1) {
        this._fly = null;
        this._notifyViewChange();
      }
    }

    if (this._frameCallbacks.size > 0) {
      for (const fn of this._frameCallbacks) {
        fn(nowMs, dt);
      }
      this._dirty = true;
    }

    if (this._ringMesh.visible && !this.reducedMotion) {
      this._ringMat.opacity = 0.72 + 0.22 * Math.sin(nowMs * 0.007);
      this._dirty = true;
    }

    return this.renderNow();
  }

  _scheduleTick() {
    if (this._raf || this._disposed || this._manualMode || this._isPausedByVisibility()) return;
    if (this._lastFrameTime === null) {
      this._lastFrameTime = performance.now();
    }
    this._raf = requestAnimationFrame((now) => {
      this._raf = 0;
      if (this._disposed || this._manualMode || this._isPausedByVisibility()) return;
      if (this._dirty || this._needsContinuousLoop()) {
        this.renderFrame(now);
      }
      if (this._dirty || this._needsContinuousLoop()) {
        this._scheduleTick();
      } else {
        // Reset timestamp so the next on-demand wakeup has a clean dt
        this._lastFrameTime = null;
      }
    });
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._rendererReady = false;
    for (const cleanup of this._eventCleanups.splice(0)) cleanup();
    if (this._drag && this.canvas.hasPointerCapture?.(this._drag.id)) {
      this.canvas.releasePointerCapture(this._drag.id);
    }
    this._drag = null;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    if (this._onVisibilityChange && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      this._onVisibilityChange = null;
    }
    this._intersectionObserver?.disconnect?.();
    this._intersectionObserver = null;
    this._fallbackEl?.remove?.();
    this._fallbackEl = null;
    for (const cap of Array.from(this._cutawayCaps)) cap.dispose();
    for (const mat of Array.from(this._shellXRayMats)) mat.dispose?.();
    this._shellXRayMats.clear();
    for (const cs of Array.from(this._contactShadows)) cs.dispose();
    for (const al of Array.from(this._accentLights)) al.dispose();
    for (const peer of this._syncedPeers) peer._syncedPeers?.delete(this);
    this._syncedPeers.clear();
    this._gridTex?.dispose?.();
    this._resizeObserver?.disconnect();
    this.htmlSurfaces?.dispose();
    this.outline?.dispose();
    this._envRT?.dispose();
    this.envMap = null;
    if (typeof globalThis !== 'undefined' && this._telemetryGetter) {
      try {
        const desc = Object.getOwnPropertyDescriptor(globalThis, '__SIMULIFY_TELEMETRY__');
        if (desc?.get === this._telemetryGetter) {
          delete globalThis.__SIMULIFY_TELEMETRY__;
        }
      } catch {}
    }
    void disposeRenderer(this.renderer);
  }
}
