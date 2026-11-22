/**
 * Simulify v2 Non-Cuboid 3D Sculpting & Lit PBR Material Library (`kit/geo-sculpt.js`).
 *
 * Cross-domain parametric, lathed, bevelled-extrusion, continuous heightfield,
 * fractured chasm, helical coil, tapered conduit, pleated bellows, and deformable
 * strip primitives — zero external dependencies beyond `three`, compatible with
 * both `WebGPURenderer` and `WebGLRenderer`.
 *
 * Every generated solid mesh:
 * - tags `userData.simulifyGeoKind` (and `geometry.userData.simulifyGeoKind`)
 * - defaults to `castShadow = true; receiveShadow = true`
 * - uses physically lit PBR materials (`MeshStandardMaterial` / `MeshPhysicalMaterial`),
 *   never unlit `MeshBasicMaterial`.
 */

import * as THREE from 'three';
import { GLASS_LAYER } from './outline-pass.js';

export const SCULPT_GEO_KINDS = Object.freeze([
  'lathe',
  'extrude',
  'heightfield',
  'chasm',
  'parametric',
  'helix',
  'conduit',
  'bellows',
  'strip',
]);

export const SCULPT_MATERIAL_PRESETS = Object.freeze({
  ceramic: {
    physical: false,
    color: 0xf4eee2,
    darkColor: 0xd4dce8,
    roughness: 0.36,
    metalness: 0.04,
    envMapIntensity: 0.85,
  },
  travertine: {
    physical: false,
    color: 0xe6dccb,
    darkColor: 0x475569,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: 0.55,
  },
  brass: {
    physical: false,
    color: 0xc99c4e,
    darkColor: 0xd9ad5b,
    roughness: 0.28,
    metalness: 0.86,
    envMapIntensity: 1.15,
  },
  anodized: {
    physical: false,
    color: 0x2b3956,
    darkColor: 0x3b4d70,
    roughness: 0.36,
    metalness: 0.62,
    envMapIntensity: 0.95,
  },
  copper: {
    physical: false,
    color: 0xc86d42,
    darkColor: 0xd97d50,
    roughness: 0.3,
    metalness: 0.84,
    envMapIntensity: 1.1,
  },
  obsidian: {
    physical: false,
    color: 0x242836,
    darkColor: 0x181c28,
    roughness: 0.62,
    metalness: 0.18,
    envMapIntensity: 0.7,
  },
  steel: {
    physical: false,
    color: 0x8f99a8,
    darkColor: 0x9aa6b8,
    roughness: 0.3,
    metalness: 0.82,
    envMapIntensity: 1.05,
  },
  glass: {
    physical: true,
    color: 0xe8f6f8,
    darkColor: 0xc8eef6,
    roughness: 0.08,
    metalness: 0.04,
    transparent: true,
    opacity: 0.34,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    ior: 1.48,
    reflectivity: 0.92,
    depthWrite: false,
    envMapIntensity: 1.35,
  },
  frostedGlass: {
    physical: true,
    color: 0xedf4f6,
    darkColor: 0xb8d4de,
    roughness: 0.36,
    metalness: 0.04,
    transparent: true,
    opacity: 0.56,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    ior: 1.45,
    reflectivity: 0.72,
    depthWrite: false,
    envMapIntensity: 1.05,
  },
  ember: {
    physical: false,
    color: 0xe25624,
    darkColor: 0xf4632c,
    emissive: 0xff6a28,
    emissiveIntensity: 0.88,
    roughness: 0.38,
    metalness: 0.14,
    envMapIntensity: 0.7,
  },
});

const TONE_ACCENT_HEX = {
  teal: 0x149694,
  amber: 0xc96d24,
  danger: 0xb83b3b,
  navy: 0x18213d,
  gold: 0xd99b2e,
  indigo: 0x5c63d6,
  ember: 0xff6224,
};

function detectActiveTheme(explicitTheme) {
  if (explicitTheme) return explicitTheme;
  if (typeof document !== 'undefined') {
    return document.documentElement?.dataset?.theme || 'paper-ink';
  }
  return 'paper-ink';
}

function resolveColorInput(input, fallback = 0x149694) {
  if (input === null || input === undefined) return fallback;
  if (typeof input === 'string' && input in TONE_ACCENT_HEX) {
    return TONE_ACCENT_HEX[input];
  }
  return input;
}

function tagSculptMesh(mesh, kind, opts = {}) {
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  mesh.userData = { ...(mesh.userData || {}), simulifyGeoKind: kind };
  if (mesh.geometry) {
    mesh.geometry.userData = { ...(mesh.geometry.userData || {}), simulifyGeoKind: kind };
  }
  if (typeof opts.layer === 'number') {
    mesh.layers.set(opts.layer);
  }
  if (opts.name) {
    mesh.name = opts.name;
  }
  return mesh;
}

function tagSculptGroup(group, kind, opts = {}) {
  group.userData = { ...(group.userData || {}), simulifyGeoKind: kind };
  if (opts.name) group.name = opts.name;
  if (typeof opts.layer === 'number') {
    group.layers.set(opts.layer);
  }
  return group;
}

function toVec2Array(pts) {
  if (!Array.isArray(pts) || pts.length < 2) {
    throw new Error('geo-sculpt: profile/shape requires at least 2 points.');
  }
  return pts.map((p) => {
    if (p && typeof p === 'object' && 'isVector2' in p) return p.clone();
    if (Array.isArray(p)) return new THREE.Vector2(Number(p[0]) || 0, Number(p[1]) || 0);
    return new THREE.Vector2(Number(p?.x) || 0, Number(p?.y) || 0);
  });
}

function toVec3(p) {
  if (p && p.isVector3) return p.clone();
  if (Array.isArray(p)) return new THREE.Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);
  return new THREE.Vector3(Number(p?.x) || 0, Number(p?.y) || 0, Number(p?.z) || 0);
}

// Deterministic 2D hash & smooth value noise (never uses Math.random)
function hash2(ix, iz, seed = 42) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2(x, z, seed = 42) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm2(x, z, seed = 42, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise2(x * freq, z * freq, seed + i * 97);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return norm > 0 ? sum / norm : 0;
}

function resolveMaterial(opts, defaultPreset, extraOverrides = null) {
  if (opts.material) return opts.material;
  const overrides = {
    ...(opts.theme ? { theme: opts.theme } : {}),
    ...(extraOverrides || {}),
    ...(opts.materialOverrides || {}),
  };
  if (opts.color !== undefined && overrides.color === undefined) {
    overrides.color = resolveColorInput(opts.color);
  }
  return createSculptMaterial(opts.preset ?? defaultPreset, overrides);
}

// ============================================================================
// 5. Procedural Micro-Textures, Lit PBR Material Factory & Fresnel X-Ray
// ============================================================================

const DARK_THEMES = new Set(['dark-studio', 'blueprint', 'obsidian-gallery']);
const PRESET_MICRO_TEX = Object.freeze({
  brass: { kind: 'brushed', bumpScale: 0.012, repeat: [2, 2] },
  steel: { kind: 'brushed', bumpScale: 0.01, repeat: [2, 2] },
  copper: { kind: 'brushed', bumpScale: 0.012, repeat: [2, 2] },
  travertine: { kind: 'grain', bumpScale: 0.022, repeat: [3, 3] },
  obsidian: { kind: 'grain', bumpScale: 0.016, repeat: [3, 3] },
  anodized: { kind: 'anodized', bumpScale: 0.008, repeat: [4, 4] },
  ceramic: { kind: 'anodized', bumpScale: 0.004, repeat: [3, 3] },
});

const _microTexCache = new Map();

/**
 * Generate a cached, deterministic, seamless procedural DataTexture for PBR micro-surface detail
 * (`roughnessMap` / `bumpMap`). Zero DOM/CDN dependencies — works identically in WebGPU, WebGL2, and Node.
 *
 * @param {'brushed'|'grain'|'anodized'|'hatch45'|'grid-pcb'} kind
 * @param {{ size?: number, seed?: number }} [opts]
 * @returns {THREE.DataTexture}
 */
export function createProceduralSurfaceMaps(kind = 'grain', { size = 128, seed = 73 } = {}) {
  const key = `${kind}:${size}:${seed}`;
  if (_microTexCache.has(key)) {
    return _microTexCache.get(key);
  }
  const n = Math.max(32, Math.min(256, Math.round(size)));
  const data = new Uint8Array(n * n * 4);

  for (let y = 0; y < n; y += 1) {
    const v = y / n;
    for (let x = 0; x < n; x += 1) {
      const u = x / n;
      let val = 0.5;
      if (kind === 'brushed') {
        const streak = valueNoise2(u * 3.0, v * 58.0, seed) * 0.65 + valueNoise2(u * 8.0, v * 116.0, seed + 17) * 0.35;
        val = 0.38 + streak * 0.44;
      } else if (kind === 'anodized') {
        const fine = hash2(x, y, seed + 31);
        const macro = fbm2(u * 12, v * 12, seed + 5, 2);
        val = 0.42 + fine * 0.24 + macro * 0.22;
      } else if (kind === 'hatch45') {
        const diag = (x + y) % 12;
        val = diag < 2 ? 0.22 : 0.88;
      } else if (kind === 'grid-pcb') {
        const gx = x % 16;
        const gy = y % 16;
        val = gx === 0 || gy === 0 ? 0.28 : 0.78 + hash2(x, y, seed) * 0.08;
      } else {
        // 'grain': porous stone / travertine / plaster micro-detail
        const coarse = fbm2(u * 14, v * 14, seed, 3);
        const pit = hash2(x, y, seed + 19);
        val = 0.34 + coarse * 0.46 + (pit > 0.92 ? -0.18 : pit * 0.14);
      }
      const byte = Math.max(0, Math.min(255, Math.round(val * 255)));
      const idx = (y * n + x) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  _microTexCache.set(key, tex);
  return tex;
}

/**
 * Create a physically lit PBR material (`MeshStandardMaterial` or `MeshPhysicalMaterial`)
 * tuned across all 6 Simulify studio themes with automatic procedural micro-surface textures
 * (`brushed`, `grain`, `anodized`) for tactile realism instead of flat plastic surfaces.
 *
 * @param {'ceramic'|'travertine'|'brass'|'anodized'|'copper'|'obsidian'|'steel'|'glass'|'frostedGlass'|'ember'} [preset='ceramic']
 * @param {Record<string, any>} [overrides]
 */
export function createSculptMaterial(preset = 'ceramic', overrides = {}) {
  const spec = SCULPT_MATERIAL_PRESETS[preset] || SCULPT_MATERIAL_PRESETS.ceramic;
  const { theme: explicitTheme, microTexture = true, ...restOverrides } = overrides || {};
  const theme = detectActiveTheme(explicitTheme);
  const isDark = DARK_THEMES.has(theme);

  const baseColor = isDark && spec.darkColor !== undefined ? spec.darkColor : spec.color;
  const params = {
    color: restOverrides.vertexColors ? 0xffffff : baseColor,
    roughness: spec.roughness,
    metalness: spec.metalness,
    envMapIntensity: isDark ? spec.envMapIntensity * 1.18 : spec.envMapIntensity,
  };

  if (microTexture && preset in PRESET_MICRO_TEX && !restOverrides.bumpMap && !restOverrides.roughnessMap) {
    const mt = PRESET_MICRO_TEX[preset];
    const map = createProceduralSurfaceMaps(mt.kind);
    params.bumpMap = map;
    params.bumpScale = mt.bumpScale;
    params.roughnessMap = map;
  }

  if (spec.emissive !== undefined) {
    params.emissive = spec.emissive;
    params.emissiveIntensity = isDark ? (spec.emissiveIntensity ?? 0.85) * 1.15 : (spec.emissiveIntensity ?? 0.85);
  }
  if (spec.transparent !== undefined) params.transparent = spec.transparent;
  if (spec.opacity !== undefined) params.opacity = spec.opacity;
  if (spec.depthWrite !== undefined) params.depthWrite = spec.depthWrite;

  if (spec.physical) {
    if (spec.clearcoat !== undefined) params.clearcoat = spec.clearcoat;
    if (spec.clearcoatRoughness !== undefined) params.clearcoatRoughness = spec.clearcoatRoughness;
    if (spec.ior !== undefined) params.ior = spec.ior;
    if (spec.reflectivity !== undefined) params.reflectivity = spec.reflectivity;
  }

  for (const [k, v] of Object.entries(restOverrides)) {
    if (v !== undefined) {
      params[k] = k === 'color' || k === 'emissive' ? resolveColorInput(v) : v;
    }
  }

  const usePhysical =
    spec.physical ||
    params.clearcoat !== undefined ||
    params.transmission !== undefined ||
    params.ior !== undefined ||
    params.iridescence !== undefined ||
    params.sheen !== undefined;

  const mat = usePhysical
    ? new THREE.MeshPhysicalMaterial(params)
    : new THREE.MeshStandardMaterial(params);

  mat.userData = { ...(mat.userData || {}), simulifyPreset: preset, simulifyTheme: theme };
  return mat;
}

/**
 * Create a clean Fresnel X-Ray shell material (`MeshPhysicalMaterial`) for transparent
 * cutaway housings. Renders crisp rim sheen with zero opaque depth occlusion when placed
 * on `GLASS_LAYER = 3`, keeping internal solid outlines razor sharp.
 *
 * @param {{ color?: string|number, rimColor?: string|number, opacity?: number, emissiveIntensity?: number, doubleSide?: boolean }} [opts]
 */
export function createXRayMaterial({
  color = 'teal',
  rimColor = 0x7ef2ee,
  opacity = 0.22,
  emissiveIntensity = 0.28,
  doubleSide = false,
} = {}) {
  const baseHex = resolveColorInput(color, 0x149694);
  const rimHex = resolveColorInput(rimColor, baseHex);
  const mat = new THREE.MeshPhysicalMaterial({
    color: baseHex,
    emissive: rimHex,
    emissiveIntensity,
    roughness: 0.14,
    metalness: 0.06,
    transparent: true,
    opacity: Math.max(0.05, Math.min(0.85, Number(opacity) || 0.22)),
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    sheen: 1.0,
    sheenRoughness: 0.22,
    sheenColor: new THREE.Color(rimHex),
    ior: 1.52,
    reflectivity: 0.95,
    depthWrite: false,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  mat.userData = { simulifyPreset: 'xray', recommendedLayer: GLASS_LAYER };
  return mat;
}

// ============================================================================
// 1. Turned / Lathed Precision Solids (`'lathe'`)
// ============================================================================

/**
 * Revolve a 2D `[radius, y]` profile around the Y axis into a precision turned solid.
 * Supports optional Catmull-Rom spline smoothing and clean bottom/top axis caps.
 *
 * @param {Array<[number, number]|THREE.Vector2>} profile
 * @param {Record<string, any>} [opts]
 */
export function createLathedSolid(profile, opts = {}) {
  const {
    segments = 36,
    phiStart = 0,
    phiLength = Math.PI * 2,
    smooth = false,
    smoothDivisions = 48,
    closed = false,
    preset = 'brass',
  } = opts;

  let pts = toVec2Array(profile).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));

  if (smooth && pts.length >= 3) {
    const spline = new THREE.SplineCurve(pts);
    pts = spline.getPoints(Math.max(12, Math.round(smoothDivisions)));
    for (const p of pts) p.x = Math.max(0, p.x);
  }

  if (closed && pts.length >= 2) {
    if (pts[0].x > 1e-4) {
      pts.unshift(new THREE.Vector2(0.0001, pts[0].y));
    }
    const last = pts[pts.length - 1];
    if (last.x > 1e-4) {
      pts.push(new THREE.Vector2(0.0001, last.y));
    }
  }

  const geo = new THREE.LatheGeometry(pts, Math.max(8, Math.round(segments)), phiStart, phiLength);
  geo.computeVertexNormals();

  const mat = resolveMaterial(opts, preset);
  const mesh = new THREE.Mesh(geo, mat);
  return tagSculptMesh(mesh, 'lathe', opts);
}

/**
 * Create a precision turned laboratory/optical glass vessel (ampoule, Erlenmeyer/round flask,
 * optical bell dome, or condenser lens), with optional turned brass collar and internal fluid level.
 *
 * @param {{
 *   style?: 'ampoule'|'flask'|'dome'|'lens',
 *   radius?: number,
 *   height?: number,
 *   wallThickness?: number,
 *   segments?: number,
 *   collar?: boolean,
 *   collarPreset?: string,
 *   fillLevel?: number|null,
 *   fillColor?: number|string,
 *   preset?: string,
 *   meshOnly?: boolean,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createGlassVessel(opts = {}) {
  const {
    style = 'ampoule',
    radius = 0.28,
    height = 0.9,
    wallThickness = 0.022,
    segments = 40,
    collar = true,
    collarPreset = 'brass',
    fillLevel = null,
    fillColor = 'teal',
    preset = 'glass',
    meshOnly = false,
  } = opts;

  const r = Math.max(0.04, Number(radius) || 0.28);
  const h = Math.max(0.08, Number(height) || 0.9);
  const wt = Math.min(r * 0.25, Math.max(0.006, Number(wallThickness) || 0.022));

  let outerProfile;
  if (style === 'flask') {
    outerProfile = [
      [0.0001, 0],
      [r * 0.86, 0],
      [r, h * 0.09],
      [r * 0.98, h * 0.18],
      [r * 0.56, h * 0.52],
      [r * 0.34, h * 0.68],
      [r * 0.33, h * 0.93],
      [r * 0.42, h * 0.98],
      [r * 0.40, h],
      [Math.max(0.01, r * 0.33 - wt), h],
      [Math.max(0.01, r * 0.33 - wt), h * 0.67],
      [Math.max(0.01, r - wt), h * 0.16],
      [Math.max(0.01, r * 0.82 - wt), wt],
      [0.0001, wt],
    ];
  } else if (style === 'dome') {
    outerProfile = [
      [r * 1.12, 0],
      [r * 1.12, h * 0.06],
      [r, h * 0.08],
      [r, h * 0.56],
      [r * 0.95, h * 0.72],
      [r * 0.81, h * 0.85],
      [r * 0.57, h * 0.94],
      [r * 0.28, h * 0.99],
      [0.0001, h],
    ];
  } else if (style === 'lens') {
    outerProfile = [];
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const a = (i / steps) * Math.PI - Math.PI / 2;
      const rad = Math.max(0.0001, Math.cos(a) * r);
      const y = (Math.sin(a) * 0.5 + 0.5) * h;
      outerProfile.push([rad, y]);
    }
  } else {
    // Classic sealed scientific ampoule / glass thermometer bulb
    outerProfile = [
      [0.0001, 0],
      [r * 0.52, h * 0.03],
      [r * 0.90, h * 0.11],
      [r, h * 0.23],
      [r * 0.92, h * 0.35],
      [r * 0.66, h * 0.46],
      [r * 0.64, h * 0.78],
      [r * 0.34, h * 0.88],
      [r * 0.22, h * 0.96],
      [0.0001, h],
    ];
  }

  const glassMesh = createLathedSolid(outerProfile, {
    segments,
    smooth: style === 'ampoule' || style === 'dome',
    smoothDivisions: 44,
    preset,
    material: opts.material,
    materialOverrides: {
      side: style === 'dome' ? THREE.DoubleSide : THREE.FrontSide,
      ...(opts.materialOverrides || {}),
    },
    theme: opts.theme,
    castShadow: opts.castShadow ?? false,
    receiveShadow: opts.receiveShadow ?? true,
    layer: opts.glassLayer ?? opts.layer ?? GLASS_LAYER,
    name: opts.name ? `${opts.name}-glass` : 'glass-vessel',
  });

  if (meshOnly && !collar && fillLevel === null) {
    return glassMesh;
  }

  const group = tagSculptGroup(new THREE.Group(), 'lathe', opts);
  group.add(glassMesh);
  group.glassMesh = glassMesh;
  group.collarMesh = null;
  group.fluidMesh = null;

  if (collar && style !== 'lens') {
    const collarR = style === 'dome' ? r * 1.15 : style === 'flask' ? r * 0.90 : r * 0.72;
    const collarH = Math.max(0.04, h * 0.09);
    const collarProfile = [
      [0.0001, -collarH * 0.6],
      [collarR * 1.04, -collarH * 0.6],
      [collarR * 1.08, -collarH * 0.25],
      [collarR * 1.02, collarH * 0.22],
      [collarR * 0.94, collarH * 0.35],
      [0.0001, collarH * 0.35],
    ];
    const collarMesh = createLathedSolid(collarProfile, {
      segments,
      preset: collarPreset,
      theme: opts.theme,
      castShadow: opts.castShadow ?? true,
      receiveShadow: opts.receiveShadow ?? true,
      layer: opts.layer,
      name: 'vessel-collar',
    });
    group.add(collarMesh);
    group.collarMesh = collarMesh;
  }

  const buildFluidProfile = (lvl) => {
    const u = Math.max(0.04, Math.min(0.95, Number(lvl) || 0.5));
    const maxY = style === 'flask' ? h * 0.62 : h * 0.78;
    const topY = wt * 1.2 + u * (maxY - wt * 1.2);
    const innerR = Math.max(0.02, (style === 'ampoule' ? r * 0.60 : r * 0.86) - wt * 1.4);
    const topR = style === 'flask'
      ? Math.max(0.02, innerR * (1 - u * 0.52))
      : style === 'ampoule'
        ? (topY < h * 0.36 ? Math.max(0.02, r * 0.90 - wt * 1.4) : innerR)
        : innerR;
    return [
      [0.0001, wt * 1.1],
      [innerR * 0.92, wt * 1.1],
      [style === 'ampoule' ? Math.max(0.02, r * 0.90 - wt * 1.4) : innerR, Math.min(topY, h * 0.22)],
      [topR, topY],
      [0.0001, topY],
    ];
  };

  if (fillLevel !== null && fillLevel !== undefined) {
    const fluidMat = createSculptMaterial('ceramic', {
      color: resolveColorInput(fillColor, 0x149694),
      roughness: 0.18,
      metalness: 0.05,
      emissive: resolveColorInput(fillColor, 0x149694),
      emissiveIntensity: 0.18,
      theme: opts.theme,
    });
    const fluidMesh = createLathedSolid(buildFluidProfile(fillLevel), {
      segments: Math.max(20, Math.round(segments * 0.75)),
      material: fluidMat,
      castShadow: false,
      receiveShadow: true,
      layer: opts.layer,
      name: 'vessel-fluid',
    });
    group.add(fluidMesh);
    group.fluidMesh = fluidMesh;
  }

  group.setFillLevel = (level) => {
    if (!group.fluidMesh) return;
    const nextGeo = new THREE.LatheGeometry(
      toVec2Array(buildFluidProfile(level)),
      Math.max(20, Math.round(segments * 0.75))
    );
    nextGeo.computeVertexNormals();
    nextGeo.userData = { simulifyGeoKind: 'lathe' };
    group.fluidMesh.geometry.dispose();
    group.fluidMesh.geometry = nextGeo;
  };

  return group;
}

/**
 * Create a precision turned-brass + ceramic + aerodynamic directional-vane agent/probe.
 * Replaces flat cylinder/box hockey pucks across RL, robotics, navigation, and field sims.
 *
 * @param {{
 *   radius?: number,
 *   height?: number,
 *   tone?: string|number,
 *   bodyPreset?: string,
 *   trimPreset?: string,
 *   vane?: boolean,
 *   segments?: number,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createSculptedProbe(opts = {}) {
  const {
    radius = 0.26,
    height = 0.56,
    tone = 'teal',
    bodyPreset = 'ceramic',
    trimPreset = 'brass',
    vane = true,
    segments = 36,
    theme,
    layer,
  } = opts;

  const r = Math.max(0.06, Number(radius) || 0.26);
  const h = Math.max(0.14, Number(height) || 0.56);
  const accentHex = resolveColorInput(opts.accentColor ?? tone, 0x149694);

  const group = tagSculptGroup(new THREE.Group(), 'lathe', opts);

  // 1. Turned stepped brass plinth & weighted skirt
  const plinthProfile = [
    [0.0001, 0],
    [r * 0.96, 0],
    [r * 1.04, h * 0.05],
    [r * 1.04, h * 0.13],
    [r * 0.94, h * 0.17],
    [r * 0.99, h * 0.22],
    [r * 0.88, h * 0.26],
    [0.0001, h * 0.26],
  ];
  const plinth = createLathedSolid(plinthProfile, {
    segments,
    preset: trimPreset,
    theme,
    layer,
    name: 'probe-plinth',
  });
  group.add(plinth);

  // 2. Sculpted ogive satin-ceramic body fuselage
  const bodyProfile = [
    [0.0001, h * 0.24],
    [r * 0.86, h * 0.24],
    [r * 0.89, h * 0.34],
    [r * 0.82, h * 0.52],
    [r * 0.66, h * 0.70],
    [r * 0.44, h * 0.82],
    [0.0001, h * 0.84],
  ];
  const body = createLathedSolid(bodyProfile, {
    segments,
    smooth: true,
    smoothDivisions: 32,
    preset: bodyPreset,
    theme,
    layer,
    name: 'probe-body',
  });
  group.add(body);

  // 3. Equatorial turned brass telemetry collar ring
  const collarProfile = [
    [r * 0.84, h * 0.44],
    [r * 0.95, h * 0.465],
    [r * 0.95, h * 0.525],
    [r * 0.82, h * 0.55],
  ];
  const collar = createLathedSolid(collarProfile, {
    segments,
    preset: trimPreset,
    theme,
    layer,
    name: 'probe-collar',
  });
  group.add(collar);

  // 4. Glowing optical jewel crown / sensor dome
  const crownMat = createSculptMaterial('ceramic', {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.18,
    theme,
  });
  const crownProfile = [
    [0.0001, h * 0.78],
    [r * 0.46, h * 0.78],
    [r * 0.48, h * 0.85],
    [r * 0.36, h * 0.94],
    [r * 0.18, h * 0.99],
    [0.0001, h],
  ];
  const crown = createLathedSolid(crownProfile, {
    segments: Math.max(20, Math.round(segments * 0.75)),
    smooth: true,
    smoothDivisions: 20,
    material: crownMat,
    layer,
    name: 'probe-crown',
  });
  group.add(crown);

  // 5. Aerodynamic extruded directional airfoil prow vane (+X forward)
  let vaneMesh = null;
  let accentVaneMat = null;
  if (vane) {
    accentVaneMat = createSculptMaterial(trimPreset, {
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.16,
      roughness: 0.28,
      metalness: 0.55,
      theme,
    });
    vaneMesh = createAirfoilVane({
      chord: r * 1.48,
      thicknessRatio: 0.24,
      span: h * 0.22,
      bevel: Math.min(0.014, r * 0.05),
      pivotAt: 0.12,
      orient: 'xz',
      material: accentVaneMat,
      layer,
      name: 'probe-vane',
    });
    // Point sharp trailing/nose pointer along +X out from the equatorial collar
    vaneMesh.rotation.y = Math.PI;
    vaneMesh.position.set(r * 0.42, h * 0.495, 0);
    group.add(vaneMesh);
  }

  group.parts = { plinth, body, collar, crown, vane: vaneMesh };

  group.setAccentColor = (nextColor) => {
    const col = resolveColorInput(nextColor, accentHex);
    crownMat.color.set(col);
    crownMat.emissive.set(col);
    if (accentVaneMat) {
      accentVaneMat.color.set(col);
      accentVaneMat.emissive.set(col);
    }
  };

  group.setEmissiveIntensity = (intensity) => {
    const val = Math.max(0, Number(intensity) || 0);
    crownMat.emissiveIntensity = val;
    if (accentVaneMat) accentVaneMat.emissiveIntensity = val * 0.35;
  };

  group.setHeading = (angleRad) => {
    group.rotation.y = Number(angleRad) || 0;
  };

  return group;
}

/**
 * Create an architectural Fresnel-ring + turned optical glass lighthouse beacon.
 * Ideal for Goal markers, signal emitters, transmitters, and optical focal anchors.
 *
 * @param {{
 *   radius?: number,
 *   height?: number,
 *   fresnelRings?: number,
 *   color?: number|string,
 *   basePreset?: string,
 *   trimPreset?: string,
 *   glassPreset?: string,
 *   segments?: number,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createBeaconLighthouse(opts = {}) {
  const {
    radius = 0.30,
    height = 0.94,
    fresnelRings = 4,
    color = 'gold',
    basePreset = 'anodized',
    trimPreset = 'brass',
    glassPreset = 'glass',
    segments = 40,
    theme,
    layer,
  } = opts;

  const r = Math.max(0.08, Number(radius) || 0.30);
  const h = Math.max(0.24, Number(height) || 0.94);
  const beaconHex = resolveColorInput(color, 0xd99b2e);

  const group = tagSculptGroup(new THREE.Group(), 'lathe', opts);

  // 1. Turned architectural pedestal + gallery deck
  const pedestalProfile = [
    [0.0001, 0],
    [r * 1.08, 0],
    [r * 1.12, h * 0.05],
    [r * 0.96, h * 0.11],
    [r * 0.80, h * 0.32],
    [r * 0.92, h * 0.35],
    [r * 0.96, h * 0.39],
    [r * 0.72, h * 0.40],
    [0.0001, h * 0.40],
  ];
  const pedestal = createLathedSolid(pedestalProfile, {
    segments,
    preset: basePreset,
    theme,
    layer,
    name: 'beacon-pedestal',
  });
  group.add(pedestal);

  // 2. Gallery brass trim ring
  const galleryProfile = [
    [r * 0.88, h * 0.36],
    [r * 1.0, h * 0.37],
    [r * 1.0, h * 0.405],
    [r * 0.86, h * 0.415],
  ];
  const gallery = createLathedSolid(galleryProfile, {
    segments,
    preset: trimPreset,
    theme,
    layer,
    name: 'beacon-gallery',
  });
  group.add(gallery);

  // 3. Glowing core beacon emitter
  const coreMat = createSculptMaterial('ember', {
    color: beaconHex,
    emissive: beaconHex,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    metalness: 0.1,
    theme,
  });
  const coreProfile = [
    [0.0001, h * 0.41],
    [r * 0.34, h * 0.42],
    [r * 0.40, h * 0.56],
    [r * 0.34, h * 0.70],
    [0.0001, h * 0.72],
  ];
  const core = createLathedSolid(coreProfile, {
    segments: Math.max(20, Math.round(segments * 0.75)),
    smooth: true,
    smoothDivisions: 24,
    material: coreMat,
    castShadow: false,
    receiveShadow: false,
    layer,
    name: 'beacon-core',
  });
  group.add(core);

  // 4. Turned optical glass lantern chamber
  const glassProfile = [
    [r * 0.64, h * 0.40],
    [r * 0.66, h * 0.56],
    [r * 0.64, h * 0.73],
  ];
  const glass = createLathedSolid(glassProfile, {
    segments,
    preset: glassPreset,
    materialOverrides: { side: THREE.DoubleSide },
    theme,
    castShadow: false,
    receiveShadow: true,
    layer,
    name: 'beacon-glass',
  });
  group.add(glass);

  // 5. Concentric sculpted Fresnel prism rings
  const ringCount = Math.max(2, Math.min(8, Math.round(fresnelRings)));
  const fresnelProfile = [];
  const yLo = h * 0.425;
  const yHi = h * 0.71;
  const span = yHi - yLo;
  for (let i = 0; i < ringCount; i += 1) {
    const y0 = yLo + (i / ringCount) * span;
    const yMid = y0 + (span / ringCount) * 0.52;
    const y1 = y0 + (span / ringCount) * 0.92;
    const bulge = 1 + 0.08 * Math.sin(((i + 0.5) / ringCount) * Math.PI);
    fresnelProfile.push([r * 0.65, y0]);
    fresnelProfile.push([r * 0.76 * bulge, yMid]);
    fresnelProfile.push([r * 0.66, y1]);
  }
  const fresnel = createLathedSolid(fresnelProfile, {
    segments,
    preset: trimPreset,
    theme,
    castShadow: true,
    receiveShadow: true,
    layer,
    name: 'beacon-fresnel',
  });
  group.add(fresnel);

  // 6. Turned copper/brass ogee cupola roof & finial spire
  const cupolaProfile = [
    [0.0001, h * 0.72],
    [r * 0.76, h * 0.72],
    [r * 0.80, h * 0.75],
    [r * 0.62, h * 0.80],
    [r * 0.34, h * 0.86],
    [r * 0.11, h * 0.91],
    [r * 0.13, h * 0.935],
    [r * 0.04, h * 0.96],
    [0.0001, h],
  ];
  const cupola = createLathedSolid(cupolaProfile, {
    segments,
    preset: trimPreset,
    theme,
    layer,
    name: 'beacon-cupola',
  });
  group.add(cupola);

  group.parts = { pedestal, gallery, core, glass, fresnel, cupola };

  group.setBeaconColor = (nextColor) => {
    const col = resolveColorInput(nextColor, beaconHex);
    coreMat.color.set(col);
    coreMat.emissive.set(col);
  };

  group.setBeaconIntensity = (intensity) => {
    coreMat.emissiveIntensity = Math.max(0, Number(intensity) || 0);
  };

  return group;
}

// ============================================================================
// 2. Bevelled Extrusions & Mechanical Profiles (`'extrude'`)
// ============================================================================

/**
 * Extrude any `THREE.Shape` or 2D point list into a crisp bevelled solid profile.
 *
 * @param {THREE.Shape | Array<[number, number]|THREE.Vector2>} shapeOrPts
 * @param {{
 *   holes?: Array<THREE.Path | Array<[number, number]|THREE.Vector2>>,
 *   depth?: number,
 *   bevelEnabled?: boolean,
 *   bevelThickness?: number,
 *   bevelSize?: number,
 *   bevelSegments?: number,
 *   curveSegments?: number,
 *   center?: boolean,
 *   orient?: 'xy'|'xz',
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createBevelledProfile(shapeOrPts, opts = {}) {
  const {
    holes = null,
    depth = 0.24,
    bevelEnabled = true,
    bevelThickness = 0.025,
    bevelSize = 0.02,
    bevelSegments = 3,
    curveSegments = 24,
    center = true,
    orient = 'xy',
    preset = 'anodized',
  } = opts;

  let shape;
  if (
    shapeOrPts &&
    (shapeOrPts instanceof THREE.Shape ||
      shapeOrPts.type === 'Shape' ||
      typeof shapeOrPts.extractPoints === 'function')
  ) {
    shape = shapeOrPts;
  } else {
    const pts = toVec2Array(shapeOrPts);
    shape = new THREE.Shape(pts);
    shape.closePath();
  }

  if (Array.isArray(holes)) {
    for (const h of holes) {
      if (h && (h instanceof THREE.Path || h.type === 'Path' || typeof h.getPoints === 'function')) {
        shape.holes.push(h);
      } else if (Array.isArray(h) && h.length >= 3) {
        const path = new THREE.Path(toVec2Array(h));
        path.closePath();
        shape.holes.push(path);
      }
    }
  }

  const extrudeDepth = Math.max(0.005, Number(depth) || 0.24);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: Boolean(bevelEnabled),
    bevelThickness: bevelEnabled ? Math.max(0.001, Number(bevelThickness) || 0.025) : 0,
    bevelSize: bevelEnabled ? Math.max(0.001, Number(bevelSize) || 0.02) : 0,
    bevelSegments: Math.max(1, Math.round(bevelSegments)),
    curveSegments: Math.max(6, Math.round(curveSegments)),
  });

  if (center) {
    geo.translate(0, 0, -extrudeDepth * 0.5);
  }
  if (orient === 'xz') {
    geo.rotateX(-Math.PI / 2);
  }
  geo.computeVertexNormals();

  const mat = resolveMaterial(opts, preset);
  const mesh = new THREE.Mesh(geo, mat);
  return tagSculptMesh(mesh, 'extrude', opts);
}

/**
 * Create a precision bevelled spur gear wheel with involute-tapered trapezoidal teeth,
 * central bore, optional lightening spoke cutouts, and optional turned hub boss.
 *
 * @param {{
 *   teeth?: number,
 *   pitchRadius?: number,
 *   toothDepth?: number,
 *   pressureAngleDeg?: number,
 *   thickness?: number,
 *   boreRadius?: number,
 *   spokes?: number,
 *   bevel?: number,
 *   hub?: boolean,
 *   orient?: 'xy'|'xz',
 *   preset?: string,
 *   hubPreset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createGearWheel(opts = {}) {
  const {
    teeth = 16,
    pitchRadius = 0.56,
    toothDepth = 0.11,
    pressureAngleDeg = 20,
    thickness = 0.14,
    boreRadius = 0.13,
    spokes = 5,
    bevel = 0.016,
    hub = true,
    orient = 'xy',
    preset = 'brass',
    hubPreset = 'anodized',
  } = opts;

  const z = Math.max(6, Math.round(teeth));
  const rp = Math.max(0.12, Number(pitchRadius) || 0.56);
  const td = Math.min(rp * 0.42, Math.max(0.02, Number(toothDepth) || 0.11));
  const addendum = td * 0.46;
  const dedendum = td * 0.54;
  const rRoot = Math.max(0.05, rp - dedendum);
  const rTip = rp + addendum;
  const step = (Math.PI * 2) / z;
  const pressureRad = (Math.max(5, Math.min(35, Number(pressureAngleDeg) || 20)) * Math.PI) / 180;
  const taperFrac = Math.min(0.14, Math.tan(pressureRad) * (td / Math.max(0.05, rp * step)) * 0.35);

  const shape = new THREE.Shape();
  for (let i = 0; i < z; i += 1) {
    const a0 = i * step;
    const aRootL = a0 + step * (0.14 - taperFrac * 0.35);
    const aPitchL = a0 + step * 0.24;
    const aTipL = a0 + step * (0.31 + taperFrac * 0.5);
    const aTipR = a0 + step * (0.55 - taperFrac * 0.5);
    const aPitchR = a0 + step * 0.62;
    const aRootR = a0 + step * (0.72 + taperFrac * 0.35);

    const pts = [
      [Math.cos(aRootL) * rRoot, Math.sin(aRootL) * rRoot],
      [Math.cos(aPitchL) * rp, Math.sin(aPitchL) * rp],
      [Math.cos(aTipL) * rTip, Math.sin(aTipL) * rTip],
      [Math.cos(aTipR) * rTip, Math.sin(aTipR) * rTip],
      [Math.cos(aPitchR) * rp, Math.sin(aPitchR) * rp],
      [Math.cos(aRootR) * rRoot, Math.sin(aRootR) * rRoot],
    ];
    if (i === 0) shape.moveTo(pts[0][0], pts[0][1]);
    else shape.lineTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k += 1) {
      shape.lineTo(pts[k][0], pts[k][1]);
    }
  }
  shape.closePath();

  const boreR = Math.max(0, Math.min(rRoot * 0.65, Number(boreRadius) || 0));
  if (boreR > 0.015) {
    const boreHole = new THREE.Path();
    boreHole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(boreHole);
  }

  // Optional radial lightening spoke cutouts when web has safe structural margin
  const webInner = Math.max(boreR * 1.55, boreR + 0.07);
  const webOuter = rRoot * 0.80;
  const spokeCount = Math.max(0, Math.round(spokes));
  if (spokeCount >= 3 && webOuter - webInner > 0.09) {
    const holeR = Math.min((webOuter - webInner) * 0.42, (Math.PI * (webInner + webOuter) * 0.5) / spokeCount * 0.34);
    const ringR = (webInner + webOuter) * 0.5;
    if (holeR > 0.025) {
      for (let s = 0; s < spokeCount; s += 1) {
        const ang = (s / spokeCount) * Math.PI * 2;
        const cutout = new THREE.Path();
        cutout.absarc(Math.cos(ang) * ringR, Math.sin(ang) * ringR, holeR, 0, Math.PI * 2, true);
        shape.holes.push(cutout);
      }
    }
  }

  const gearMesh = createBevelledProfile(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 2,
    curveSegments: 16,
    center: true,
    orient,
    preset,
    material: opts.material,
    materialOverrides: opts.materialOverrides,
    theme: opts.theme,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow,
    layer: opts.layer,
    name: opts.name ? `${opts.name}-wheel` : 'gear-wheel',
  });

  if (!hub) return gearMesh;

  const group = tagSculptGroup(new THREE.Group(), 'extrude', opts);
  group.add(gearMesh);
  group.gearMesh = gearMesh;

  const hubOuter = Math.max(boreR * 1.48, Math.min(rRoot * 0.46, boreR + 0.08));
  const hubH = thickness * 1.55;
  const hubInner = Math.max(0.008, boreR * 0.96);
  const hubProfile = [
    [hubInner, -hubH * 0.5],
    [hubOuter * 0.94, -hubH * 0.5],
    [hubOuter, -hubH * 0.42],
    [hubOuter, hubH * 0.42],
    [hubOuter * 0.94, hubH * 0.5],
    [hubInner, hubH * 0.5],
  ];
  const hubMesh = createLathedSolid(hubProfile, {
    segments: 28,
    preset: hubPreset,
    theme: opts.theme,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow,
    layer: opts.layer,
    name: 'gear-hub',
  });
  if (orient === 'xy') {
    hubMesh.rotation.x = Math.PI / 2;
  }
  group.add(hubMesh);
  group.hubMesh = hubMesh;

  return group;
}

/**
 * Create a U-shaped bevelled horseshoe magnet yoke / clevis bracket, with optional
 * distinct North/South pole tip caps.
 *
 * @param {{
 *   outerRadius?: number,
 *   innerRadius?: number,
 *   legLength?: number,
 *   thickness?: number,
 *   bevel?: number,
 *   poleTips?: boolean,
 *   northColor?: number|string,
 *   southColor?: number|string,
 *   orient?: 'xy'|'xz',
 *   curveSegments?: number,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createHorseshoeYoke(opts = {}) {
  const {
    outerRadius = 0.52,
    innerRadius = 0.28,
    legLength = 0.48,
    thickness = 0.22,
    bevel = 0.022,
    poleTips = true,
    northColor = 0xb83b3b,
    southColor = 0x264b7c,
    orient = 'xy',
    curveSegments = 32,
    preset = 'anodized',
  } = opts;

  const rOut = Math.max(0.12, Number(outerRadius) || 0.52);
  const rIn = Math.max(0.04, Math.min(rOut * 0.85, Number(innerRadius) || 0.28));
  const leg = Math.max(0.05, Number(legLength) || 0.48);
  const tipH = poleTips ? Math.min(leg * 0.36, 0.16) : 0;
  const bodyLeg = Math.max(0.02, leg - tipH);

  const shape = new THREE.Shape();
  shape.moveTo(-rOut, -bodyLeg);
  shape.lineTo(-rOut, 0);
  shape.absarc(0, 0, rOut, Math.PI, 0, true);
  shape.lineTo(rOut, -bodyLeg);
  shape.lineTo(rIn, -bodyLeg);
  shape.lineTo(rIn, 0);
  shape.absarc(0, 0, rIn, 0, Math.PI, false);
  shape.lineTo(-rIn, -bodyLeg);
  shape.closePath();

  const yokeMesh = createBevelledProfile(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 3,
    curveSegments,
    center: true,
    orient,
    preset,
    material: opts.material,
    materialOverrides: opts.materialOverrides,
    theme: opts.theme,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow,
    layer: opts.layer,
    name: opts.name ? `${opts.name}-yoke` : 'horseshoe-yoke',
  });

  if (!poleTips) return yokeMesh;

  const group = tagSculptGroup(new THREE.Group(), 'extrude', opts);
  group.add(yokeMesh);
  group.yokeMesh = yokeMesh;

  const makeTip = (xLo, xHi, col, tipName) => {
    const tShape = new THREE.Shape();
    tShape.moveTo(xLo, -leg);
    tShape.lineTo(xLo, -bodyLeg);
    tShape.lineTo(xHi, -bodyLeg);
    tShape.lineTo(xHi, -leg);
    tShape.closePath();
    return createBevelledProfile(tShape, {
      depth: thickness,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel * 0.9,
      bevelSize: bevel * 0.75,
      bevelSegments: 2,
      center: true,
      orient,
      preset: 'anodized',
      materialOverrides: { color: resolveColorInput(col), roughness: 0.34, metalness: 0.35 },
      theme: opts.theme,
      castShadow: opts.castShadow,
      receiveShadow: opts.receiveShadow,
      layer: opts.layer,
      name: tipName,
    });
  };

  const northPole = makeTip(-rOut, -rIn, northColor, 'yoke-north-pole');
  const southPole = makeTip(rIn, rOut, southColor, 'yoke-south-pole');
  group.add(northPole, southPole);
  group.northPole = northPole;
  group.southPole = southPole;

  return group;
}

/**
 * Create a structural architectural arch bridge / gantry rib span with optional pierced
 * spandrel cutouts.
 *
 * @param {{
 *   span?: number,
 *   rise?: number,
 *   archThickness?: number,
 *   deckThickness?: number,
 *   depth?: number,
 *   bevel?: number,
 *   archStyle?: 'parabolic'|'circular'|'pointed',
 *   spandrelCutouts?: boolean,
 *   segments?: number,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createArchSpan(opts = {}) {
  const {
    span = 2.4,
    rise = 0.85,
    archThickness = 0.16,
    deckThickness = 0.10,
    depth = 0.42,
    bevel = 0.02,
    archStyle = 'parabolic',
    spandrelCutouts = true,
    segments = 28,
    preset = 'travertine',
  } = opts;

  const halfW = Math.max(0.3, (Number(span) || 2.4) * 0.5);
  const archRise = Math.max(0.15, Number(rise) || 0.85);
  const pierW = Math.max(0.08, Math.min(halfW * 0.32, Number(archThickness) || 0.16));
  const innerHalf = Math.max(0.12, halfW - pierW);
  const topY = archRise + Math.max(0.06, Number(deckThickness) || 0.10);
  const segs = Math.max(10, Math.round(segments));

  const evalArchY = (u) => {
    // u in [-1, 1]
    const au = Math.abs(u);
    if (archStyle === 'circular') {
      return Math.sqrt(Math.max(0, 1 - au * au)) * archRise;
    }
    if (archStyle === 'pointed') {
      return Math.pow(Math.max(0, 1 - au), 0.72) * archRise;
    }
    return (1 - au * au) * archRise;
  };

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(-halfW, topY);
  shape.lineTo(halfW, topY);
  shape.lineTo(halfW, 0);
  shape.lineTo(innerHalf, 0);

  for (let i = 0; i <= segs; i += 1) {
    const u = 1 - (2 * i) / segs; // +1 -> -1
    const x = u * innerHalf;
    const y = evalArchY(u);
    shape.lineTo(x, y);
  }
  shape.lineTo(-innerHalf, 0);
  shape.closePath();

  if (spandrelCutouts && archRise > 0.35 && innerHalf > 0.45) {
    for (const sign of [-1, 1]) {
      for (const frac of [0.58, 0.82]) {
        const cx = sign * innerHalf * frac;
        const archYHere = evalArchY(frac);
        const availH = topY - deckThickness * 0.8 - (archYHere + archThickness * 0.55);
        const holeR = Math.min(availH * 0.36, innerHalf * 0.085);
        if (holeR > 0.03) {
          const cy = archYHere + archThickness * 0.55 + availH * 0.5;
          const hole = new THREE.Path();
          hole.absarc(cx, cy, holeR, 0, Math.PI * 2, true);
          shape.holes.push(hole);
        }
      }
    }
  }

  return createBevelledProfile(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 2,
    curveSegments: 16,
    center: true,
    orient: 'xy',
    preset,
    material: opts.material,
    materialOverrides: opts.materialOverrides,
    theme: opts.theme,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow,
    layer: opts.layer,
    name: opts.name ?? 'arch-span',
  });
}

/**
 * Create a smooth NACA 4-digit aerodynamic airfoil vane / directional fin / instrument pointer.
 * Leading edge faces `-X`, sharp trailing edge points toward `+X` (or pivot-centered).
 *
 * @param {{
 *   chord?: number,
 *   thicknessRatio?: number,
 *   camber?: number,
 *   camberPos?: number,
 *   span?: number,
 *   bevel?: number,
 *   segments?: number,
 *   pivotAt?: number,
 *   orient?: 'xy'|'xz',
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createAirfoilVane(opts = {}) {
  const {
    chord = 0.52,
    thicknessRatio = 0.18,
    camber = 0.0,
    camberPos = 0.4,
    span = 0.08,
    bevel = 0.01,
    segments = 24,
    pivotAt = 0.25,
    orient = 'xy',
    preset = 'brass',
  } = opts;

  const c = Math.max(0.05, Number(chord) || 0.52);
  const t = Math.max(0.04, Math.min(0.45, Number(thicknessRatio) || 0.18));
  const m = Math.max(-0.15, Math.min(0.15, Number(camber) || 0));
  const p = Math.max(0.1, Math.min(0.9, Number(camberPos) || 0.4));
  const n = Math.max(10, Math.round(segments));
  const xOff = c * Math.max(0, Math.min(1, Number(pivotAt) || 0));

  const upper = [];
  const lower = [];

  for (let i = 0; i <= n; i += 1) {
    // Cosine spacing concentrates resolution near the rounded leading edge
    const beta = (i / n) * Math.PI;
    const x = 0.5 * (1 - Math.cos(beta));
    const yt =
      5 *
      t *
      (0.2969 * Math.sqrt(x) -
        0.126 * x -
        0.3516 * x * x +
        0.2843 * x * x * x -
        0.1036 * x * x * x * x);

    let yc = 0;
    let dyc = 0;
    if (Math.abs(m) > 1e-5) {
      if (x < p) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dyc = ((2 * m) / (p * p)) * (p - x);
      } else {
        yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
        dyc = ((2 * m) / ((1 - p) * (1 - p))) * (p - x);
      }
    }
    const theta = Math.atan(dyc);
    const xu = (x - yt * Math.sin(theta)) * c - xOff;
    const yu = (yc + yt * Math.cos(theta)) * c;
    const xl = (x + yt * Math.sin(theta)) * c - xOff;
    const yl = (yc - yt * Math.cos(theta)) * c;

    upper.push(new THREE.Vector2(xu, yu));
    lower.push(new THREE.Vector2(xl, yl));
  }

  const shape = new THREE.Shape();
  shape.moveTo(upper[0].x, upper[0].y);
  for (let i = 1; i < upper.length; i += 1) {
    shape.lineTo(upper[i].x, upper[i].y);
  }
  for (let i = lower.length - 2; i >= 1; i -= 1) {
    shape.lineTo(lower[i].x, lower[i].y);
  }
  shape.closePath();

  return createBevelledProfile(shape, {
    depth: span,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 12,
    center: true,
    orient,
    preset,
    material: opts.material,
    materialOverrides: opts.materialOverrides,
    theme: opts.theme,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow,
    layer: opts.layer,
    name: opts.name ?? 'airfoil-vane',
  });
}

// ============================================================================
// 3. Continuous Heightfields, Fractured Chasms & Parametric Surfaces
// ============================================================================

function applyColorToBuffer(colArr, vertIdx, colorFn, a, b, c, tmpColor) {
  const res = colorFn(a, b, c, tmpColor);
  if (res !== undefined && res !== null && res !== tmpColor) {
    if (res.isColor) tmpColor.copy(res);
    else tmpColor.set(res);
  }
  const o = vertIdx * 3;
  colArr[o] = tmpColor.r;
  colArr[o + 1] = tmpColor.g;
  colArr[o + 2] = tmpColor.b;
}

/**
 * Create a continuous sculpted 3D heightfield surface (with optional solid architectural
 * plinth skirt) supporting zero-GC in-place `updateHeights(heightFn, colorFn)`.
 * Ideal for RL value landscapes, potential wells, electromagnetic fields, PDFs, and wave membranes.
 *
 * @param {{
 *   width?: number,
 *   depth?: number,
 *   segsX?: number,
 *   segsZ?: number,
 *   heightFn?: (u: number, v: number, x: number, z: number) => number,
 *   colorFn?: ((u: number, v: number, y: number, outColor: THREE.Color) => any) | null,
 *   skirt?: boolean,
 *   baseY?: number,
 *   skirtColor?: number|string,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createHeightfieldSurface(opts = {}) {
  const {
    width = 4.0,
    depth = 3.0,
    segsX = 48,
    segsZ = 36,
    heightFn = () => 0,
    colorFn = null,
    skirt = true,
    baseY = -0.32,
    skirtColor = 0xc8baa4,
    preset = 'ceramic',
  } = opts;

  const w = Math.max(0.1, Number(width) || 4.0);
  const d = Math.max(0.1, Number(depth) || 3.0);
  const sx = Math.max(2, Math.round(segsX));
  const sz = Math.max(2, Math.round(segsZ));
  const cols = sx + 1;
  const rows = sz + 1;
  const topCount = cols * rows;
  const useColors = Boolean(opts.vertexColors ?? (typeof colorFn === 'function'));

  const northStart = topCount;
  const southStart = northStart + cols * 2;
  const westStart = southStart + cols * 2;
  const eastStart = westStart + rows * 2;
  const bottomStart = eastStart + rows * 2;
  const totalVerts = skirt ? bottomStart + 4 : topCount;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = useColors ? new Float32Array(totalVerts * 3) : null;
  const heights = new Float32Array(topCount);

  const stepX = w / sx;
  const stepZ = d / sz;
  const halfW = w * 0.5;
  const halfD = d * 0.5;

  // Initialize top grid XY/UV
  for (let iz = 0; iz < rows; iz += 1) {
    const v = iz / sz;
    const z = (v - 0.5) * d;
    for (let ix = 0; ix < cols; ix += 1) {
      const u = ix / sx;
      const x = (u - 0.5) * w;
      const idx = iz * cols + ix;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = z;
      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 1;
      normals[idx * 3 + 2] = 0;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = 1 - v;
    }
  }

  const indices = [];
  for (let iz = 0; iz < sz; iz += 1) {
    for (let ix = 0; ix < sx; ix += 1) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const dIdx = c + 1;
      indices.push(a, c, b, b, c, dIdx);
    }
  }
  const topIndexCount = indices.length;

  const skirtCol = new THREE.Color(resolveColorInput(skirtColor, 0xc8baa4));
  const setSkirtVert = (vi, x, y, z, nx, ny, nz, u, v) => {
    positions[vi * 3] = x;
    positions[vi * 3 + 1] = y;
    positions[vi * 3 + 2] = z;
    normals[vi * 3] = nx;
    normals[vi * 3 + 1] = ny;
    normals[vi * 3 + 2] = nz;
    uvs[vi * 2] = u;
    uvs[vi * 2 + 1] = v;
    if (colors) {
      colors[vi * 3] = skirtCol.r;
      colors[vi * 3 + 1] = skirtCol.g;
      colors[vi * 3 + 2] = skirtCol.b;
    }
  };

  if (skirt) {
    // North wall (z = -halfD, normal 0,0,-1)
    for (let ix = 0; ix < cols; ix += 1) {
      const u = ix / sx;
      const x = (u - 0.5) * w;
      setSkirtVert(northStart + ix * 2, x, 0, -halfD, 0, 0, -1, u, 1);
      setSkirtVert(northStart + ix * 2 + 1, x, baseY, -halfD, 0, 0, -1, u, 0);
    }
    for (let ix = 0; ix < sx; ix += 1) {
      const t0 = northStart + ix * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      indices.push(t0, t1, b0, t1, b1, b0);
    }

    // South wall (z = +halfD, normal 0,0,+1)
    for (let ix = 0; ix < cols; ix += 1) {
      const u = ix / sx;
      const x = (u - 0.5) * w;
      setSkirtVert(southStart + ix * 2, x, 0, halfD, 0, 0, 1, u, 1);
      setSkirtVert(southStart + ix * 2 + 1, x, baseY, halfD, 0, 0, 1, u, 0);
    }
    for (let ix = 0; ix < sx; ix += 1) {
      const t0 = southStart + ix * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      indices.push(t0, b0, t1, t1, b0, b1);
    }

    // West wall (x = -halfW, normal -1,0,0)
    for (let iz = 0; iz < rows; iz += 1) {
      const v = iz / sz;
      const z = (v - 0.5) * d;
      setSkirtVert(westStart + iz * 2, -halfW, 0, z, -1, 0, 0, v, 1);
      setSkirtVert(westStart + iz * 2 + 1, -halfW, baseY, z, -1, 0, 0, v, 0);
    }
    for (let iz = 0; iz < sz; iz += 1) {
      const t0 = westStart + iz * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      indices.push(t0, b0, t1, t1, b0, b1);
    }

    // East wall (x = +halfW, normal +1,0,0)
    for (let iz = 0; iz < rows; iz += 1) {
      const v = iz / sz;
      const z = (v - 0.5) * d;
      setSkirtVert(eastStart + iz * 2, halfW, 0, z, 1, 0, 0, v, 1);
      setSkirtVert(eastStart + iz * 2 + 1, halfW, baseY, z, 1, 0, 0, v, 0);
    }
    for (let iz = 0; iz < sz; iz += 1) {
      const t0 = eastStart + iz * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      indices.push(t0, t1, b0, t1, b1, b0);
    }

    // Bottom cap (y = baseY, normal 0,-1,0)
    setSkirtVert(bottomStart + 0, -halfW, baseY, -halfD, 0, -1, 0, 0, 0);
    setSkirtVert(bottomStart + 1, halfW, baseY, -halfD, 0, -1, 0, 1, 0);
    setSkirtVert(bottomStart + 2, -halfW, baseY, halfD, 0, -1, 0, 0, 1);
    setSkirtVert(bottomStart + 3, halfW, baseY, halfD, 0, -1, 0, 1, 1);
    indices.push(
      bottomStart + 0, bottomStart + 1, bottomStart + 2,
      bottomStart + 1, bottomStart + 3, bottomStart + 2
    );
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', normAttr);
  geo.setAttribute('uv', uvAttr);
  let colAttr = null;
  if (colors) {
    colAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('color', colAttr);
  }
  geo.setIndex(indices);

  const tmpColor = new THREE.Color(1, 1, 1);

  const updateHeights = (nextHeightFn = heightFn, nextColorFn = colorFn) => {
    const hFn = typeof nextHeightFn === 'function' ? nextHeightFn : heightFn;
    const cFn = typeof nextColorFn === 'function' ? nextColorFn : null;

    // 1. Update top heights & optional vertex colors in-place (zero allocations)
    for (let iz = 0; iz < rows; iz += 1) {
      const v = iz / sz;
      const z = (v - 0.5) * d;
      const rowOff = iz * cols;
      for (let ix = 0; ix < cols; ix += 1) {
        const u = ix / sx;
        const x = (u - 0.5) * w;
        const idx = rowOff + ix;
        const y = Number(hFn(u, v, x, z)) || 0;
        heights[idx] = y;
        positions[idx * 3 + 1] = y;
        if (colors && cFn) {
          applyColorToBuffer(colors, idx, cFn, u, v, y, tmpColor);
        }
      }
    }

    // 2. Recompute crisp analytical finite-difference normals on top surface in-place
    for (let iz = 0; iz < rows; iz += 1) {
      const iz0 = iz > 0 ? iz - 1 : 0;
      const iz1 = iz < sz ? iz + 1 : sz;
      const dz = (iz1 - iz0) * stepZ;
      const rowOff = iz * cols;
      const row0 = iz0 * cols;
      const row1 = iz1 * cols;
      for (let ix = 0; ix < cols; ix += 1) {
        const ix0 = ix > 0 ? ix - 1 : 0;
        const ix1 = ix < sx ? ix + 1 : sx;
        const dx = (ix1 - ix0) * stepX;
        const dydx = (heights[rowOff + ix1] - heights[rowOff + ix0]) / dx;
        const dydz = (heights[row1 + ix] - heights[row0 + ix]) / dz;
        const nx = -dydx;
        const ny = 1;
        const nz = -dydz;
        const invLen = 1 / Math.hypot(nx, ny, nz);
        const o = (rowOff + ix) * 3;
        normals[o] = nx * invLen;
        normals[o + 1] = ny * invLen;
        normals[o + 2] = nz * invLen;
      }
    }

    // 3. Synchronize skirt top edges cleanly in-place without bleeding normals
    if (skirt) {
      for (let ix = 0; ix < cols; ix += 1) {
        const topN = heights[ix];
        const topS = heights[sz * cols + ix];
        positions[(northStart + ix * 2) * 3 + 1] = topN;
        positions[(southStart + ix * 2) * 3 + 1] = topS;
        if (colors && cFn) {
          const nSrc = ix * 3;
          const sSrc = (sz * cols + ix) * 3;
          const nDst = (northStart + ix * 2) * 3;
          const sDst = (southStart + ix * 2) * 3;
          colors[nDst] = colors[nSrc] * 0.78 + skirtCol.r * 0.22;
          colors[nDst + 1] = colors[nSrc + 1] * 0.78 + skirtCol.g * 0.22;
          colors[nDst + 2] = colors[nSrc + 2] * 0.78 + skirtCol.b * 0.22;
          colors[sDst] = colors[sSrc] * 0.78 + skirtCol.r * 0.22;
          colors[sDst + 1] = colors[sSrc + 1] * 0.78 + skirtCol.g * 0.22;
          colors[sDst + 2] = colors[sSrc + 2] * 0.78 + skirtCol.b * 0.22;
        }
      }
      for (let iz = 0; iz < rows; iz += 1) {
        const topW = heights[iz * cols];
        const topE = heights[iz * cols + sx];
        positions[(westStart + iz * 2) * 3 + 1] = topW;
        positions[(eastStart + iz * 2) * 3 + 1] = topE;
        if (colors && cFn) {
          const wSrc = (iz * cols) * 3;
          const eSrc = (iz * cols + sx) * 3;
          const wDst = (westStart + iz * 2) * 3;
          const eDst = (eastStart + iz * 2) * 3;
          colors[wDst] = colors[wSrc] * 0.78 + skirtCol.r * 0.22;
          colors[wDst + 1] = colors[wSrc + 1] * 0.78 + skirtCol.g * 0.22;
          colors[wDst + 2] = colors[wSrc + 2] * 0.78 + skirtCol.b * 0.22;
          colors[eDst] = colors[eSrc] * 0.78 + skirtCol.r * 0.22;
          colors[eDst + 1] = colors[eSrc + 1] * 0.78 + skirtCol.g * 0.22;
          colors[eDst + 2] = colors[eSrc + 2] * 0.78 + skirtCol.b * 0.22;
        }
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    if (colAttr && cFn) colAttr.needsUpdate = true;
  };

  updateHeights(heightFn, colorFn);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mat = resolveMaterial(opts, preset, {
    vertexColors: useColors,
    roughness: 0.44,
    metalness: 0.05,
    side: skirt ? THREE.FrontSide : THREE.DoubleSide,
  });

  let finalMat = mat;
  if (skirt && opts.skirtMaterial && indices.length > topIndexCount) {
    geo.clearGroups();
    geo.addGroup(0, topIndexCount, 0);
    geo.addGroup(topIndexCount, indices.length - topIndexCount, 1);
    finalMat = [mat, opts.skirtMaterial];
  }

  const mesh = new THREE.Mesh(geo, finalMat);
  tagSculptMesh(mesh, 'heightfield', opts);
  mesh.topMaterial = mat;
  mesh.skirtMaterial = skirt && opts.skirtMaterial ? opts.skirtMaterial : null;

  mesh.updateHeights = updateHeights;
  mesh.sampleHeight = (x, z) => {
    const u = Math.max(0, Math.min(1, x / w + 0.5)) * sx;
    const v = Math.max(0, Math.min(1, z / d + 0.5)) * sz;
    const ix0 = Math.min(sx - 1, Math.floor(u));
    const iz0 = Math.min(sz - 1, Math.floor(v));
    const fx = u - ix0;
    const fz = v - iz0;
    const h00 = heights[iz0 * cols + ix0];
    const h10 = heights[iz0 * cols + ix0 + 1];
    const h01 = heights[(iz0 + 1) * cols + ix0];
    const h11 = heights[(iz0 + 1) * cols + ix0 + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  };
  mesh.getGridMeta = () => ({ width: w, depth: d, segsX: sx, segsZ: sz, baseY, skirt });

  return mesh;
}

/**
 * Create a real 3D sculpted fractured chasm / fault cliff / subsided canyon with
 * terraced rock strata ledges, serrated cliff rim, stratified vertex colors, and
 * zero-GC `setCarveProgress(u)` progressive carving.
 *
 * @param {{
 *   width?: number,
 *   depth?: number,
 *   chasmDepth?: number,
 *   rimHeight?: number,
 *   segsX?: number,
 *   segsZ?: number,
 *   strataCount?: number,
 *   jaggedness?: number,
 *   seed?: number,
 *   rimColor?: number|string,
 *   strataColors?: Array<number|string>,
 *   floorColor?: number|string,
 *   glowEmber?: boolean,
 *   emberColor?: number|string,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createFracturedChasm(opts = {}) {
  const {
    width = 6.0,
    depth = 1.05,
    chasmDepth = 0.85,
    rimHeight = 0.055,
    segsX = 64,
    segsZ = 22,
    strataCount = 5,
    jaggedness = 0.14,
    seed = 42,
    rimColor = 0xc97b55,
    strataColors = [0x8b4636, 0x622f2a, 0x411f24, 0x28141c],
    floorColor = 0x190d14,
    glowEmber = false,
    emberColor = 0xe85828,
    preset = 'obsidian',
  } = opts;

  const w = Math.max(0.4, Number(width) || 6.0);
  const d = Math.max(0.3, Number(depth) || 1.05);
  const cDepth = Math.max(0.15, Number(chasmDepth) || 0.85);
  const rHeight = Math.max(0, Number(rimHeight) || 0.055);
  const sx = Math.max(8, Math.round(segsX));
  const sz = Math.max(6, Math.round(segsZ));
  const cols = sx + 1;
  const rows = sz + 1;
  const count = cols * rows;
  const strata = Math.max(2, Math.round(strataCount));
  const jag = Math.max(0, Math.min(0.45, Number(jaggedness) || 0.14));

  const positions = new Float32Array(count * 3);
  const targetY = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);

  const palette = [
    new THREE.Color(resolveColorInput(rimColor, 0xc97b55)),
    ...(Array.isArray(strataColors) && strataColors.length > 0
      ? strataColors.map((c) => new THREE.Color(resolveColorInput(c)))
      : [new THREE.Color(0x8b4636), new THREE.Color(0x5a2b28), new THREE.Color(0x2d161d)]),
    new THREE.Color(resolveColorInput(floorColor, 0x190d14)),
  ];
  const tmpCol = new THREE.Color();

  for (let iz = 0; iz < rows; iz += 1) {
    const v = iz / sz;
    const z0 = (v - 0.5) * d;
    for (let ix = 0; ix < cols; ix += 1) {
      const u = ix / sx;
      const x0 = (u - 0.5) * w;
      const idx = iz * cols + ix;

      // Signed distance inward from the rectangle perimeter (0 on edge, 1 deep inside)
      const edgeU = Math.min(u, 1 - u) * (w / Math.min(w, d));
      const edgeV = Math.min(v, 1 - v) * (d / Math.min(w, d));
      const rawDist = Math.min(edgeU, edgeV);

      const nLarge = fbm2(x0 * 1.45 + 3.1, z0 * 2.1 - 1.7, seed, 3);
      const nFine = fbm2(x0 * 4.8 - 7.3, z0 * 5.2 + 4.9, seed + 313, 2);
      const crackJitter = (nLarge - 0.5) * jag * 1.15 + (nFine - 0.5) * jag * 0.45;

      // Subtle jagged lateral rock-face displacement on interior vertices (keep outer boundary flush)
      const boundaryMask = Math.min(1, Math.min(u, 1 - u) * 14, Math.min(v, 1 - v) * 8);
      const dispX = (nFine - 0.5) * jag * 0.28 * boundaryMask;
      const dispZ = (nLarge - 0.5) * jag * 0.34 * boundaryMask;

      const inset = Math.max(0, rawDist + crackJitter * boundaryMask);

      let y;
      let depthFrac = 0;
      if (inset < 0.09) {
        // Serrated fractured cliff rim lip
        const rimT = inset / 0.09;
        const rimCrest = Math.sin(rimT * Math.PI) * rHeight * (0.65 + nFine * 0.7);
        y = rimCrest * boundaryMask;
        depthFrac = 0;
      } else {
        // Steep stepped rock strata wall descending into rugged abyss floor
        const wallT = Math.min(1, (inset - 0.09) / 0.26);
        // Quantized sedimentary terraces blended with steep cliff drop
        const strataPhase = wallT * strata;
        const stepFloor = Math.floor(strataPhase);
        const stepFrac = strataPhase - stepFloor;
        const smoothLedge = stepFrac < 0.58
          ? Math.pow(stepFrac / 0.58, 2.2) * 0.84
          : 0.84 + ((stepFrac - 0.58) / 0.42) * 0.16;
        const terraced = Math.min(1, (stepFloor + smoothLedge) / strata);
        const dropFrac = wallT * 0.35 + terraced * 0.65;
        const rubble = (nFine - 0.5) * 0.085 * cDepth * (0.3 + 0.7 * wallT);
        y = -dropFrac * cDepth + rubble;
        depthFrac = Math.max(0, Math.min(1, -y / cDepth));
      }

      positions[idx * 3] = x0 + dispX;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z0 + dispZ;
      targetY[idx] = y;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;

      // Stratified rock color + crevice ambient occlusion shading
      const pScaled = depthFrac * (palette.length - 1);
      const pIdx = Math.min(palette.length - 2, Math.floor(pScaled));
      const pFrac = pScaled - pIdx;
      tmpCol.copy(palette[pIdx]).lerp(palette[pIdx + 1], pFrac);
      const bandShade = 0.86 + 0.14 * Math.sin(depthFrac * strata * Math.PI * 2) + (nFine - 0.5) * 0.12;
      const ao = 1 - depthFrac * 0.22;
      colors[idx * 3] = Math.max(0, Math.min(1, tmpCol.r * bandShade * ao));
      colors[idx * 3 + 1] = Math.max(0, Math.min(1, tmpCol.g * bandShade * ao));
      colors[idx * 3 + 2] = Math.max(0, Math.min(1, tmpCol.b * bandShade * ao));
    }
  }

  const indices = [];
  for (let iz = 0; iz < sz; iz += 1) {
    for (let ix = 0; ix < sx; ix += 1) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const dIdx = c + 1;
      indices.push(a, c, b, b, c, dIdx);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = resolveMaterial(opts, preset, {
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.08,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const chasmMesh = new THREE.Mesh(geo, mat);
  tagSculptMesh(chasmMesh, 'chasm', opts);

  const group = tagSculptGroup(new THREE.Group(), 'chasm', opts);
  group.add(chasmMesh);
  group.chasmMesh = chasmMesh;
  group.emberMesh = null;

  if (glowEmber) {
    const seamPts = [];
    const seamSegs = 12;
    for (let i = 0; i <= seamSegs; i += 1) {
      const u = i / seamSegs;
      const x = (u - 0.5) * w * 0.78;
      const z = (fbm2(x * 1.9, 0.3, seed + 77, 2) - 0.5) * d * 0.24;
      seamPts.push([x, -cDepth * 0.92, z]);
    }
    const emberMesh = createTaperedConduit(
      seamPts,
      (t) => Math.sin(t * Math.PI) * Math.min(d * 0.075, 0.048) + 0.008,
      {
        tubularSegments: 32,
        radialSegments: 8,
        preset: 'ember',
        materialOverrides: {
          color: resolveColorInput(emberColor, 0xe85828),
          emissive: resolveColorInput(emberColor, 0xe85828),
          emissiveIntensity: 0.92,
        },
        castShadow: false,
        receiveShadow: false,
        theme: opts.theme,
        layer: opts.layer,
        name: 'chasm-ember-vein',
      }
    );
    emberMesh.userData.simulifyGeoKind = 'chasm';
    emberMesh.geometry.userData.simulifyGeoKind = 'chasm';
    group.add(emberMesh);
    group.emberMesh = emberMesh;
  }

  let currentCarve = 1;
  group.setCarveProgress = (u) => {
    const next = Math.max(0, Math.min(1, Number(u) || 0));
    if (Math.abs(next - currentCarve) < 1e-4) return;
    currentCarve = next;
    for (let i = 0; i < count; i += 1) {
      positions[i * 3 + 1] = targetY[i] * next;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    if (group.emberMesh) {
      group.emberMesh.visible = next > 0.2;
      group.emberMesh.position.y = (1 - next) * cDepth * 0.85;
    }
  };

  return group;
}

/**
 * Create a general parametric 3D surface `evalFn(u, v, targetVec3)` with optional
 * vertex color mapping, periodic seam handling, and in-place `updateSurface()` deformation.
 *
 * @param {number} uSegs
 * @param {number} vSegs
 * @param {(u: number, v: number, out: THREE.Vector3) => THREE.Vector3 | number[] | void} evalFn
 * @param {{
 *   colorFn?: ((u: number, v: number, pos: THREE.Vector3, outColor: THREE.Color) => any) | null,
 *   doubleSided?: boolean,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createParametricSurface(uSegs = 32, vSegs = 32, evalFn, opts = {}) {
  if (typeof evalFn !== 'function') {
    throw new Error('createParametricSurface requires evalFn(u, v, targetVec3).');
  }
  const {
    colorFn = null,
    doubleSided = true,
    preset = 'ceramic',
  } = opts;

  const su = Math.max(2, Math.round(uSegs));
  const sv = Math.max(2, Math.round(vSegs));
  const cols = su + 1;
  const rows = sv + 1;
  const count = cols * rows;
  const useColors = Boolean(opts.vertexColors ?? (typeof colorFn === 'function'));

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = useColors ? new Float32Array(count * 3) : null;

  for (let iv = 0; iv < rows; iv += 1) {
    const v = iv / sv;
    for (let iu = 0; iu < cols; iu += 1) {
      const u = iu / su;
      const idx = iv * cols + iu;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  const indices = [];
  for (let iv = 0; iv < sv; iv += 1) {
    for (let iu = 0; iu < su; iu += 1) {
      const a = iv * cols + iu;
      const b = a + 1;
      const c = a + cols;
      const dIdx = c + 1;
      indices.push(a, c, b, b, c, dIdx);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  let colAttr = null;
  if (colors) {
    colAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('color', colAttr);
  }
  geo.setIndex(indices);

  const tmpPos = new THREE.Vector3();
  const tmpColor = new THREE.Color(1, 1, 1);

  const updateSurface = (nextEvalFn = evalFn, nextColorFn = colorFn) => {
    const eFn = typeof nextEvalFn === 'function' ? nextEvalFn : evalFn;
    const cFn = typeof nextColorFn === 'function' ? nextColorFn : null;

    for (let iv = 0; iv < rows; iv += 1) {
      const v = iv / sv;
      const rowOff = iv * cols;
      for (let iu = 0; iu < cols; iu += 1) {
        const u = iu / su;
        const idx = rowOff + iu;
        tmpPos.set(0, 0, 0);
        const res = eFn(u, v, tmpPos);
        if (res && res !== tmpPos) {
          if (Array.isArray(res)) tmpPos.set(Number(res[0]) || 0, Number(res[1]) || 0, Number(res[2]) || 0);
          else if (typeof res === 'object') tmpPos.set(Number(res.x) || 0, Number(res.y) || 0, Number(res.z) || 0);
        }
        positions[idx * 3] = tmpPos.x;
        positions[idx * 3 + 1] = tmpPos.y;
        positions[idx * 3 + 2] = tmpPos.z;
        if (colors && cFn) {
          applyColorToBuffer(colors, idx, cFn, u, v, tmpPos, tmpColor);
        }
      }
    }
    posAttr.needsUpdate = true;
    if (colAttr && cFn) colAttr.needsUpdate = true;
    geo.computeVertexNormals();
  };

  updateSurface(evalFn, colorFn);
  geo.computeBoundingSphere();

  const mat = resolveMaterial(opts, preset, {
    vertexColors: useColors,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  tagSculptMesh(mesh, 'parametric', opts);
  mesh.updateSurface = updateSurface;
  return mesh;
}

function buildStripSolidMesh({ length, width, yLo, yHi, segments, anchor, mat, opts }) {
  const segs = Math.max(4, Math.round(segments));
  const rings = segs + 1;
  // 4 separate face strips (top, bottom, front +Z, back -Z) + 2 end caps (start, end)
  // => crisp architectural edge normals everywhere, zero normal bleeding!
  const topOff = 0;
  const botOff = rings * 2;
  const frontOff = rings * 4;
  const backOff = rings * 6;
  const startCapOff = rings * 8;
  const endCapOff = startCapOff + 4;
  const totalVerts = endCapOff + 4;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  for (let i = 0; i < rings; i += 1) {
    const u = i / segs;
    uvs[(topOff + i * 2) * 2] = u; uvs[(topOff + i * 2) * 2 + 1] = 0;
    uvs[(topOff + i * 2 + 1) * 2] = u; uvs[(topOff + i * 2 + 1) * 2 + 1] = 1;
    uvs[(botOff + i * 2) * 2] = u; uvs[(botOff + i * 2) * 2 + 1] = 0;
    uvs[(botOff + i * 2 + 1) * 2] = u; uvs[(botOff + i * 2 + 1) * 2 + 1] = 1;
    uvs[(frontOff + i * 2) * 2] = u; uvs[(frontOff + i * 2) * 2 + 1] = 1;
    uvs[(frontOff + i * 2 + 1) * 2] = u; uvs[(frontOff + i * 2 + 1) * 2 + 1] = 0;
    uvs[(backOff + i * 2) * 2] = u; uvs[(backOff + i * 2) * 2 + 1] = 1;
    uvs[(backOff + i * 2 + 1) * 2] = u; uvs[(backOff + i * 2 + 1) * 2 + 1] = 0;
  }

  const indices = [];
  for (let i = 0; i < segs; i += 1) {
    // Top face (+N): [z=-hw, z=+hw] at i and i+1
    const t0 = topOff + i * 2;
    indices.push(t0, t0 + 1, t0 + 2, t0 + 2, t0 + 1, t0 + 3);
    // Bottom face (-N)
    const b0 = botOff + i * 2;
    indices.push(b0, b0 + 2, b0 + 1, b0 + 2, b0 + 3, b0 + 1);
    // Front face (+Z): [top, bot]
    const f0 = frontOff + i * 2;
    indices.push(f0, f0 + 1, f0 + 2, f0 + 2, f0 + 1, f0 + 3);
    // Back face (-Z): [top, bot]
    const k0 = backOff + i * 2;
    indices.push(k0, k0 + 2, k0 + 1, k0 + 2, k0 + 3, k0 + 1);
  }
  // Start cap (-T) & End cap (+T)
  indices.push(
    startCapOff + 0, startCapOff + 2, startCapOff + 1,
    startCapOff + 1, startCapOff + 2, startCapOff + 3,
    endCapOff + 0, endCapOff + 1, endCapOff + 2,
    endCapOff + 1, endCapOff + 3, endCapOff + 2
  );

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', normAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const hw = width * 0.5;

  const evalArc = (s, k) => {
    const ks = k * s;
    if (Math.abs(k) < 1e-4) {
      const s2 = s * s;
      const x = s - (k * k * s2 * s) / 6;
      const y = (k * s2) * 0.5 - (k * k * k * s2 * s2) / 24;
      const tx = Math.cos(ks);
      const ty = Math.sin(ks);
      return { x, y, tx, ty, nx: -ty, ny: tx, theta: ks };
    }
    const sinK = Math.sin(ks);
    const cosK = Math.cos(ks);
    return {
      x: sinK / k,
      y: (1 - cosK) / k,
      tx: cosK,
      ty: sinK,
      nx: -sinK,
      ny: cosK,
      theta: ks,
    };
  };

  const setVN = (vi, x, y, z, nx, ny, nz) => {
    const o = vi * 3;
    positions[o] = x;
    positions[o + 1] = y;
    positions[o + 2] = z;
    normals[o] = nx;
    normals[o + 1] = ny;
    normals[o + 2] = nz;
  };

  const deform = (curvature) => {
    const k = Number(curvature) || 0;
    const sStart = anchor === 'center' ? -length * 0.5 : 0;
    let firstPose = null;
    let lastPose = null;

    for (let i = 0; i < rings; i += 1) {
      const s = sStart + (i / segs) * length;
      const p = evalArc(s, k);
      if (i === 0) firstPose = p;
      if (i === rings - 1) lastPose = p;

      const xHi = p.x + p.nx * yHi;
      const yHiPos = p.y + p.ny * yHi;
      const xLo = p.x + p.nx * yLo;
      const yLoPos = p.y + p.ny * yLo;

      // Top face (+N)
      setVN(topOff + i * 2, xHi, yHiPos, -hw, p.nx, p.ny, 0);
      setVN(topOff + i * 2 + 1, xHi, yHiPos, hw, p.nx, p.ny, 0);
      // Bottom face (-N)
      setVN(botOff + i * 2, xLo, yLoPos, -hw, -p.nx, -p.ny, 0);
      setVN(botOff + i * 2 + 1, xLo, yLoPos, hw, -p.nx, -p.ny, 0);
      // Front face (+Z)
      setVN(frontOff + i * 2, xHi, yHiPos, hw, 0, 0, 1);
      setVN(frontOff + i * 2 + 1, xLo, yLoPos, hw, 0, 0, 1);
      // Back face (-Z)
      setVN(backOff + i * 2, xHi, yHiPos, -hw, 0, 0, -1);
      setVN(backOff + i * 2 + 1, xLo, yLoPos, -hw, 0, 0, -1);
    }

    // Start cap (-T)
    setVN(startCapOff + 0, firstPose.x + firstPose.nx * yHi, firstPose.y + firstPose.ny * yHi, -hw, -firstPose.tx, -firstPose.ty, 0);
    setVN(startCapOff + 1, firstPose.x + firstPose.nx * yHi, firstPose.y + firstPose.ny * yHi, hw, -firstPose.tx, -firstPose.ty, 0);
    setVN(startCapOff + 2, firstPose.x + firstPose.nx * yLo, firstPose.y + firstPose.ny * yLo, -hw, -firstPose.tx, -firstPose.ty, 0);
    setVN(startCapOff + 3, firstPose.x + firstPose.nx * yLo, firstPose.y + firstPose.ny * yLo, hw, -firstPose.tx, -firstPose.ty, 0);

    // End cap (+T)
    setVN(endCapOff + 0, lastPose.x + lastPose.nx * yHi, lastPose.y + lastPose.ny * yHi, -hw, lastPose.tx, lastPose.ty, 0);
    setVN(endCapOff + 1, lastPose.x + lastPose.nx * yHi, lastPose.y + lastPose.ny * yHi, hw, lastPose.tx, lastPose.ty, 0);
    setVN(endCapOff + 2, lastPose.x + lastPose.nx * yLo, lastPose.y + lastPose.ny * yLo, -hw, lastPose.tx, lastPose.ty, 0);
    setVN(endCapOff + 3, lastPose.x + lastPose.nx * yLo, lastPose.y + lastPose.ny * yLo, hw, lastPose.tx, lastPose.ty, 0);

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    return {
      tipPos: [lastPose.x, lastPose.y, 0],
      tipAngle: lastPose.theta,
      tipNormal: [lastPose.nx, lastPose.ny, 0],
    };
  };

  const mesh = new THREE.Mesh(geo, mat);
  tagSculptMesh(mesh, 'strip', opts);
  mesh._deform = deform;
  return mesh;
}

/**
 * Create a smooth arc-length-preserving deformable solid strip (bimetallic strip,
 * elastic cantilever beam, flexure spring, or energy ribbon) with real physical thickness
 * and zero-GC `setCurvature(k)`.
 *
 * @param {{
 *   length?: number,
 *   width?: number,
 *   thickness?: number,
 *   segments?: number,
 *   curvature?: number,
 *   anchor?: 'start'|'center',
 *   bimetallic?: boolean,
 *   preset?: string,
 *   topPreset?: string,
 *   bottomPreset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createDeformableStrip(opts = {}) {
  const {
    length = 2.0,
    width = 0.28,
    thickness = 0.048,
    segments = 36,
    curvature = 0,
    anchor = 'start',
    bimetallic = false,
    preset = 'brass',
    topPreset = 'steel',
    bottomPreset = 'copper',
  } = opts;

  const L = Math.max(0.1, Number(length) || 2.0);
  const W = Math.max(0.02, Number(width) || 0.28);
  const T = Math.max(0.008, Number(thickness) || 0.048);

  if (!bimetallic) {
    const mat = resolveMaterial(opts, preset);
    const mesh = buildStripSolidMesh({
      length: L,
      width: W,
      yLo: -T * 0.5,
      yHi: T * 0.5,
      segments,
      anchor,
      mat,
      opts,
    });
    let lastPose = mesh._deform(curvature);
    mesh.geometry.computeBoundingSphere();
    mesh.setCurvature = (k) => {
      lastPose = mesh._deform(k);
      return lastPose;
    };
    mesh.getTipPose = () => ({ ...lastPose, tipPos: [...lastPose.tipPos] });
    return mesh;
  }

  const group = tagSculptGroup(new THREE.Group(), 'strip', opts);
  const topMat = opts.topMaterial || createSculptMaterial(topPreset, { theme: opts.theme });
  const botMat = opts.bottomMaterial || createSculptMaterial(bottomPreset, { theme: opts.theme });

  const topMesh = buildStripSolidMesh({
    length: L,
    width: W,
    yLo: 0,
    yHi: T * 0.5,
    segments,
    anchor,
    mat: topMat,
    opts: { ...opts, name: opts.name ? `${opts.name}-top` : 'strip-top-layer' },
  });
  const bottomMesh = buildStripSolidMesh({
    length: L,
    width: W,
    yLo: -T * 0.5,
    yHi: 0,
    segments,
    anchor,
    mat: botMat,
    opts: { ...opts, name: opts.name ? `${opts.name}-bottom` : 'strip-bottom-layer' },
  });

  let lastPose = topMesh._deform(curvature);
  bottomMesh._deform(curvature);
  topMesh.geometry.computeBoundingSphere();
  bottomMesh.geometry.computeBoundingSphere();

  group.add(topMesh, bottomMesh);
  group.topMesh = topMesh;
  group.bottomMesh = bottomMesh;
  group.setCurvature = (k) => {
    lastPose = topMesh._deform(k);
    bottomMesh._deform(k);
    return lastPose;
  };
  group.getTipPose = () => ({ ...lastPose, tipPos: [...lastPose.tipPos] });
  return group;
}

// ============================================================================
// 4. True 3D Helices, Tapered Conduits & Pleated Bellows
// ============================================================================

class HelixCurve extends THREE.Curve {
  constructor({ coilRadius, turns, height, axis = 'y', leads = 0 }) {
    super();
    this.coilRadius = coilRadius;
    this.turns = turns;
    this.height = height;
    this.axis = axis;
    this.leads = leads;
  }

  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const u = Math.max(0, Math.min(1, t));
    const leadFrac = this.leads > 0 ? 0.08 : 0;
    let x;
    let y;
    let z;

    if (leadFrac > 0 && u < leadFrac) {
      const f = u / leadFrac;
      x = this.coilRadius;
      y = -this.height * 0.5 - this.leads * (1 - f);
      z = 0;
    } else if (leadFrac > 0 && u > 1 - leadFrac) {
      const f = (u - (1 - leadFrac)) / leadFrac;
      const endAngle = this.turns * Math.PI * 2;
      x = Math.cos(endAngle) * this.coilRadius;
      y = this.height * 0.5 + this.leads * f;
      z = Math.sin(endAngle) * this.coilRadius;
    } else {
      const coreU = leadFrac > 0 ? (u - leadFrac) / (1 - 2 * leadFrac) : u;
      const angle = coreU * this.turns * Math.PI * 2;
      x = Math.cos(angle) * this.coilRadius;
      y = (coreU - 0.5) * this.height;
      z = Math.sin(angle) * this.coilRadius;
    }

    if (this.axis === 'x') {
      return optionalTarget.set(y, x, z);
    }
    if (this.axis === 'z') {
      return optionalTarget.set(x, z, y);
    }
    return optionalTarget.set(x, y, z);
  }
}

/**
 * Create a true continuous 3D helical spring / inductor coil / heating filament.
 * Replaces stacked Torus rings with a genuine smooth helical tube and optional terminal leads.
 *
 * @param {{
 *   coilRadius?: number,
 *   wireRadius?: number,
 *   turns?: number,
 *   pitch?: number,
 *   height?: number,
 *   axis?: 'y'|'x'|'z',
 *   leads?: number,
 *   tubularSegments?: number,
 *   radialSegments?: number,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createHelicalCoil(opts = {}) {
  const {
    coilRadius = 0.24,
    wireRadius = 0.032,
    turns = 6,
    pitch = 0.14,
    height = null,
    axis = 'y',
    leads = 0,
    tubularSegments = null,
    radialSegments = 12,
    preset = 'copper',
  } = opts;

  const rCoil = Math.max(0.03, Number(coilRadius) || 0.24);
  const rWire = Math.max(0.005, Math.min(rCoil * 0.45, Number(wireRadius) || 0.032));
  const nTurns = Math.max(1, Number(turns) || 6);
  const totalH = height !== null && height !== undefined
    ? Math.max(rWire * 2.5 * nTurns, Number(height) || 0.84)
    : nTurns * Math.max(rWire * 2.4, Number(pitch) || 0.14);
  const tSegs = Math.max(36, Math.round(tubularSegments ?? nTurns * 28));
  const rSegs = Math.max(6, Math.round(radialSegments));

  const curve = new HelixCurve({
    coilRadius: rCoil,
    turns: nTurns,
    height: totalH,
    axis,
    leads: Math.max(0, Number(leads) || 0),
  });

  const geo = new THREE.TubeGeometry(curve, tSegs, rWire, rSegs, false);
  geo.computeVertexNormals();

  const mat = resolveMaterial(opts, preset);
  const mesh = new THREE.Mesh(geo, mat);
  tagSculptMesh(mesh, 'helix', opts);

  mesh.setGlow = (intensity, color = 0xff6224) => {
    const val = Math.max(0, Number(intensity) || 0);
    if ('emissive' in mat) {
      mat.emissive.set(resolveColorInput(color, 0xff6224));
      mat.emissiveIntensity = val;
    }
  };
  mesh.setCompression = (factor) => {
    const f = Math.max(0.35, Math.min(2.2, Number(factor) || 1));
    if (axis === 'x') mesh.scale.x = f;
    else if (axis === 'z') mesh.scale.z = f;
    else mesh.scale.y = f;
  };

  return mesh;
}

/**
 * Create a rotation-minimizing (parallel-transport) variable-radius 3D swept conduit /
 * fluid pipe / optical beam / policy ribbon along any polyline or `THREE.Curve`.
 *
 * @param {Array<[number, number, number]|THREE.Vector3> | THREE.Curve} points
 * @param {number | [number, number] | ((t: number) => number)} [radiusFn=0.06]
 * @param {{
 *   tubularSegments?: number,
 *   radialSegments?: number,
 *   closed?: boolean,
 *   capStart?: boolean,
 *   capEnd?: boolean,
 *   curveTension?: number,
 *   colorFn?: ((t: number, outColor: THREE.Color) => any) | null,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createTaperedConduit(points, radiusFn = 0.06, opts = {}) {
  const {
    tubularSegments = 48,
    radialSegments = 16,
    closed = false,
    capStart = true,
    capEnd = true,
    curveTension = 0.5,
    colorFn = null,
    preset = 'brass',
  } = opts;

  let curve;
  if (points && typeof points.getPointAt === 'function') {
    curve = points;
  } else if (Array.isArray(points) && points.length >= 2) {
    const vecs = points.map(toVec3);
    curve = new THREE.CatmullRomCurve3(vecs, Boolean(closed), 'catmullrom', curveTension);
  } else {
    throw new Error('createTaperedConduit requires at least 2 points or a THREE.Curve.');
  }

  let evalRadius;
  if (typeof radiusFn === 'function') {
    evalRadius = (t) => Math.max(0.002, Number(radiusFn(t)) || 0.002);
  } else if (Array.isArray(radiusFn) && radiusFn.length >= 2) {
    const r0 = Math.max(0.002, Number(radiusFn[0]) || 0.05);
    const r1 = Math.max(0.002, Number(radiusFn[1]) || 0.05);
    evalRadius = (t) => r0 + (r1 - r0) * t;
  } else {
    const rConst = Math.max(0.002, Number(radiusFn) || 0.06);
    evalRadius = () => rConst;
  }

  const tSegs = Math.max(4, Math.round(tubularSegments));
  const rSegs = Math.max(5, Math.round(radialSegments));
  const ringStride = rSegs + 1;
  const rings = tSegs + 1;
  const useCapStart = !closed && capStart;
  const useCapEnd = !closed && capEnd;
  const useColors = Boolean(opts.vertexColors ?? (typeof colorFn === 'function'));

  const tubeVertCount = rings * ringStride;
  const startCapCenter = tubeVertCount;
  const startCapRing = startCapCenter + 1;
  const endCapCenter = startCapCenter + (useCapStart ? 1 + ringStride : 0);
  const endCapRing = endCapCenter + 1;
  const totalVerts = endCapCenter + (useCapEnd ? 1 + ringStride : 0);

  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = useColors ? new Float32Array(totalVerts * 3) : null;

  // Build rotation-minimizing parallel-transport frames (zero Frenet inflection flips!)
  const centers = new Array(rings);
  const tangents = new Array(rings);
  const normalsArr = new Array(rings);
  const binormals = new Array(rings);

  for (let i = 0; i < rings; i += 1) {
    const u = i / tSegs;
    centers[i] = curve.getPointAt(u);
    tangents[i] = curve.getTangentAt(u).normalize();
  }

  const n0 = new THREE.Vector3();
  const upRef = Math.abs(tangents[0].y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  n0.crossVectors(tangents[0], upRef).normalize();
  normalsArr[0] = n0;
  binormals[0] = new THREE.Vector3().crossVectors(tangents[0], n0).normalize();

  const rotAxis = new THREE.Vector3();
  const rotQuat = new THREE.Quaternion();
  for (let i = 1; i < rings; i += 1) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const nextN = normalsArr[i - 1].clone();
    rotAxis.crossVectors(prevT, currT);
    if (rotAxis.lengthSq() > 1e-10) {
      rotAxis.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, prevT.dot(currT))));
      rotQuat.setFromAxisAngle(rotAxis, angle);
      nextN.applyQuaternion(rotQuat);
    }
    // Re-orthogonalize against currT to prevent numerical drift
    nextN.addScaledVector(currT, -nextN.dot(currT)).normalize();
    normalsArr[i] = nextN;
    binormals[i] = new THREE.Vector3().crossVectors(currT, nextN).normalize();
  }

  const tmpColor = new THREE.Color(1, 1, 1);
  const radialDir = new THREE.Vector3();
  const vPos = new THREE.Vector3();

  for (let i = 0; i < rings; i += 1) {
    const u = i / tSegs;
    const rad = evalRadius(u);
    const c = centers[i];
    const N = normalsArr[i];
    const B = binormals[i];
    if (colors && colorFn) {
      const res = colorFn(u, tmpColor);
      if (res !== undefined && res !== null && res !== tmpColor) {
        if (res.isColor) tmpColor.copy(res);
        else tmpColor.set(res);
      }
    }
    for (let j = 0; j <= rSegs; j += 1) {
      const v = j / rSegs;
      const theta = v * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      radialDir.set(
        cosT * N.x + sinT * B.x,
        cosT * N.y + sinT * B.y,
        cosT * N.z + sinT * B.z
      );
      vPos.copy(c).addScaledVector(radialDir, rad);
      const idx = i * ringStride + j;
      positions[idx * 3] = vPos.x;
      positions[idx * 3 + 1] = vPos.y;
      positions[idx * 3 + 2] = vPos.z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
      if (colors) {
        colors[idx * 3] = tmpColor.r;
        colors[idx * 3 + 1] = tmpColor.g;
        colors[idx * 3 + 2] = tmpColor.b;
      }
    }
  }

  const indices = [];
  for (let i = 0; i < tSegs; i += 1) {
    for (let j = 0; j < rSegs; j += 1) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const dIdx = i * ringStride + (j + 1);
      indices.push(a, dIdx, b, b, dIdx, c);
    }
  }

  const copyCapVert = (dst, srcX, srcY, srcZ, u, v, srcColIdx) => {
    positions[dst * 3] = srcX;
    positions[dst * 3 + 1] = srcY;
    positions[dst * 3 + 2] = srcZ;
    uvs[dst * 2] = u;
    uvs[dst * 2 + 1] = v;
    if (colors) {
      colors[dst * 3] = colors[srcColIdx * 3];
      colors[dst * 3 + 1] = colors[srcColIdx * 3 + 1];
      colors[dst * 3 + 2] = colors[srcColIdx * 3 + 2];
    }
  };

  if (useCapStart) {
    copyCapVert(startCapCenter, centers[0].x, centers[0].y, centers[0].z, 0.5, 0.5, 0);
    for (let j = 0; j <= rSegs; j += 1) {
      copyCapVert(
        startCapRing + j,
        positions[j * 3],
        positions[j * 3 + 1],
        positions[j * 3 + 2],
        0.5,
        0.5,
        j
      );
    }
    for (let j = 0; j < rSegs; j += 1) {
      indices.push(startCapCenter, startCapRing + j, startCapRing + j + 1);
    }
  }

  if (useCapEnd) {
    const lastOff = tSegs * ringStride;
    const lastC = centers[tSegs];
    copyCapVert(endCapCenter, lastC.x, lastC.y, lastC.z, 0.5, 0.5, lastOff);
    for (let j = 0; j <= rSegs; j += 1) {
      const src = lastOff + j;
      copyCapVert(
        endCapRing + j,
        positions[src * 3],
        positions[src * 3 + 1],
        positions[src * 3 + 2],
        0.5,
        0.5,
        src
      );
    }
    for (let j = 0; j < rSegs; j += 1) {
      indices.push(endCapCenter, endCapRing + j + 1, endCapRing + j);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) {
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = resolveMaterial(opts, preset, { vertexColors: useColors });
  const mesh = new THREE.Mesh(geo, mat);
  return tagSculptMesh(mesh, 'conduit', opts);
}

/**
 * Create a corrugated pleated bellows / pneumatic actuator / flexible vacuum coupler
 * with end mounting flanges and in-place `setExtension(factor)` compression/extension
 * that preserves flange thickness while flexing the pleats.
 *
 * @param {{
 *   outerRadius?: number,
 *   innerRadius?: number,
 *   height?: number,
 *   pleats?: number,
 *   flangeHeight?: number,
 *   flangeRadius?: number,
 *   segments?: number,
 *   preset?: string,
 *   material?: THREE.Material,
 *   materialOverrides?: Record<string, any>,
 *   theme?: string,
 *   layer?: number,
 *   name?: string,
 * }} [opts]
 */
export function createPleatedBellows(opts = {}) {
  const {
    outerRadius = 0.34,
    innerRadius = 0.22,
    height = 0.72,
    pleats = 6,
    flangeHeight = 0.055,
    flangeRadius = null,
    segments = 36,
    preset = 'anodized',
  } = opts;

  const rOut = Math.max(0.06, Number(outerRadius) || 0.34);
  const rIn = Math.max(0.03, Math.min(rOut * 0.9, Number(innerRadius) || 0.22));
  const h = Math.max(0.18, Number(height) || 0.72);
  const nPleats = Math.max(2, Math.round(pleats));
  const fH = Math.min(h * 0.16, Math.max(0.02, Number(flangeHeight) || 0.055));
  const fR = Math.max(rOut * 0.95, Number(flangeRadius) || rOut * 1.06);
  const segs = Math.max(12, Math.round(segments));

  const coreSpan = Math.max(0.08, h - 2 * fH);
  const profile = [];
  // Track profile classification so setExtension stretches pleats while preserving flange thickness
  const yMeta = []; // { kind: 'bot'|'core'|'top', u: number, localY: number }

  const pushPt = (r, y, kind, u = 0, localY = 0) => {
    profile.push(new THREE.Vector2(r, y));
    yMeta.push({ kind, u, localY });
  };

  // Bottom flange
  pushPt(0.0001, 0, 'bot', 0, 0);
  pushPt(fR, 0, 'bot', 0, 0);
  pushPt(fR, fH * 0.78, 'bot', 0, fH * 0.78);
  pushPt(rIn, fH, 'bot', 0, fH);

  // Smooth rounded accordion pleats
  const samplesPerPleat = 8;
  const totalSamples = nPleats * samplesPerPleat;
  for (let i = 1; i <= totalSamples; i += 1) {
    const u = i / totalSamples;
    const phase = u * nPleats * Math.PI * 2;
    // Slightly sharpened sinusoidal convolution for machined bellows silhouette
    const wave = 0.5 - 0.5 * Math.cos(phase);
    const shaped = Math.pow(wave, 0.85);
    const rad = rIn + (rOut - rIn) * shaped;
    pushPt(rad, fH + u * coreSpan, 'core', u, 0);
  }

  // Top flange
  pushPt(fR, h - fH * 0.78, 'top', 1, fH * 0.22);
  pushPt(fR, h, 'top', 1, fH);
  pushPt(0.0001, h, 'top', 1, fH);

  const geo = new THREE.LatheGeometry(profile, segs);
  geo.computeVertexNormals();

  const mat = resolveMaterial(opts, preset);
  const mesh = new THREE.Mesh(geo, mat);
  tagSculptMesh(mesh, 'bellows', opts);

  const posAttr = geo.getAttribute('position');
  const profLen = profile.length;
  const radialSteps = segs + 1;

  mesh.setExtension = (factor) => {
    const ext = Math.max(0.35, Math.min(1.85, Number(factor) || 1));
    const nextCore = coreSpan * ext;
    const nextBaseTop = fH + nextCore;
    for (let s = 0; s < radialSteps; s += 1) {
      for (let p = 0; p < profLen; p += 1) {
        const meta = yMeta[p];
        let y;
        if (meta.kind === 'bot') y = meta.localY;
        else if (meta.kind === 'core') y = fH + meta.u * nextCore;
        else y = nextBaseTop + meta.localY;
        posAttr.setY(s * profLen + p, y);
      }
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    return fH * 2 + nextCore;
  };

  return mesh;
}
