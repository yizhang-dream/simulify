import * as THREE from 'three';
import {
  canvasFont,
  createCrispCanvasTexture,
} from '../kit/fonts.js';
import {
  createArchSpan,
  createBeaconLighthouse,
  createBevelledProfile,
  createFracturedChasm,
  createHeightfieldSurface,
  createLathedSolid,
  createSculptedProbe,
  createSculptMaterial,
  createTaperedConduit,
} from '../kit/geo-sculpt.js';
import { GROUND_LAYER, SOLID_LAYER, SURFACE_LAYER } from '../kit/outline-pass.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function lerpColorHex(hexA, hexB, t) {
  const clampT = clamp(t, 0, 1);
  const pa = parseInt(hexA.slice(1), 16);
  const pb = parseInt(hexB.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * clampT);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * clampT);
  const b = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * clampT);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Create a centered chamfered octagonal 2D THREE.Shape (`width x depth`, corner bevel `chamfer`). */
function makeChamferedRectShape(width, depth, chamfer) {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const ch = Math.min(chamfer, hw * 0.45, hd * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-hw + ch, -hd);
  s.lineTo(hw - ch, -hd);
  s.lineTo(hw, -hd + ch);
  s.lineTo(hw, hd - ch);
  s.lineTo(hw - ch, hd);
  s.lineTo(-hw + ch, hd);
  s.lineTo(-hw, hd - ch);
  s.lineTo(-hw, -hd + ch);
  s.closePath();
  return s;
}

/**
 * Create a chamfered non-cuboid horizontal cap (`ShapeGeometry` rotated into XZ)
 * with exact [0, 1] planar UVs so 512x512 CanvasTextures map 1:1 with UP=-Z, RIGHT=+X.
 */
function makeChamferedFaceGeometry(width, depth, chamfer) {
  const shape = makeChamferedRectShape(width, depth, chamfer);
  const geo = new THREE.ShapeGeometry(shape, 4);
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = pos.getX(i) / width + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / depth + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  geo.userData = { ...(geo.userData || {}), simulifyGeoKind: 'tile-inlay' };
  return geo;
}

/**
 * Draw one high-DPI (512x512 default) crisp tile face into a 2D canvas context
 * using Simulify's unified offline 4-tier typography (`canvasFont`).
 *
 * Supports:
 * - 'start' / 'goal' archival dials (Goal +10)
 * - 'clean' neutral tile with optional Beat 1 exploration trail glow
 * - 'v' scalar V(s) value heatmap with crisp numeric readout
 * - 'q' 4-triangle directional Q(s,a) facets with smooth morph `qMorph` (0..1)
 *   and mathematically honest `qVisited` arrow dimming for unconverged cells
 * - 'cliff' carved -100 volcanic hazard badge
 */
export function drawTileFace(ctx, state, width = 512, height = 512) {
  const W = width || 512;
  const H = height || 512;
  const s = W / 256;
  const kind = state?.kind || 'normal';
  const mode = state?.mode || 'q';
  const lang = state?.lang || 'zh';
  const qMorph = state?.qMorph !== undefined ? clamp(state.qMorph, 0, 1) : 1;
  const linkRole = state?.linkRole || null; // 'src' (teal V(S)) | 'dst' (amber V(S'))

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.scale(s, s);
  const B = 256;

  // Start & Goal architectural dials
  if (kind === 'start' || kind === 'goal') {
    const isGoal = kind === 'goal';
    ctx.fillStyle = isGoal ? '#f7e9cb' : '#f5efe3';
    ctx.fillRect(0, 0, B, B);

    ctx.fillStyle = isGoal ? 'rgba(201, 109, 36, 0.16)' : 'rgba(20, 150, 148, 0.14)';
    ctx.fillRect(10, 10, B - 20, 34);

    ctx.strokeStyle = state.selected || linkRole ? '#0f766e' : isGoal ? '#b8631a' : '#24304a';
    ctx.lineWidth = state.selected || linkRole ? 13 : 7;
    ctx.strokeRect(10, 10, B - 20, B - 20);

    // Subtle shift left-forward on Goal so lighthouse turret at rear-east never crowds 'G'
    const cx = isGoal ? B * 0.44 : B * 0.5;
    const cy = isGoal ? B * 0.49 : B * 0.46;

    ctx.fillStyle = isGoal ? '#8c3d0c' : '#18213d';
    ctx.font = canvasFont('display', 74, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGoal ? 'G' : 'S', cx, cy);

    ctx.fillStyle = isGoal ? '#8f470e' : '#334155';
    ctx.font = canvasFont('sans', 25, 700);
    ctx.fillText(
      isGoal ? (lang === 'en' ? '+10 GOAL' : '+10 终点') : (lang === 'en' ? 'START' : '起点'),
      B * 0.5,
      B * 0.78
    );
    ctx.restore();
    return;
  }

  // Sunken crimson -100 cliff tile face (fallback for standalone/custom pits)
  if (state.isCliff && (state.cliffCarve ?? 1) > 0.25) {
    const k = clamp((state.cliffCarve - 0.25) / 0.75, 0, 1);
    ctx.fillStyle = lerpColorHex('#cbb8ae', '#5c1814', k);
    ctx.fillRect(0, 0, B, B);

    ctx.save();
    ctx.strokeStyle = `rgba(254, 215, 208, ${(0.16 * k).toFixed(2)})`;
    ctx.lineWidth = 9;
    for (let d = -B; d < B * 2; d += 44) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d - B, B);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = state.hovered ? '#fda4af' : '#4a120e';
    ctx.lineWidth = state.hovered ? 12 : 6;
    ctx.strokeRect(6, 6, B - 12, B - 12);

    if (state.showIndivCliffLabel) {
      ctx.fillStyle = `rgba(255, 232, 228, ${(0.96 * k).toFixed(2)})`;
      ctx.font = canvasFont('mono', 56, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('-100', B / 2, B / 2);
    }
    ctx.restore();
    return;
  }

  // Beat 1: Clean sparse archival stone tile (with optional exploration trail glow)
  if (mode === 'clean') {
    const trail = clamp(state.trailGlow || 0, 0, 1);
    ctx.fillStyle = trail > 0.01 ? lerpColorHex('#f5f0e5', '#d8eee7', trail * 0.85) : '#f5f0e5';
    ctx.fillRect(0, 0, B, B);

    if (trail > 0.05) {
      ctx.beginPath();
      ctx.arc(B / 2, B / 2, 22 + trail * 12, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(20, 150, 148, ${(0.24 * trail).toFixed(2)})`;
      ctx.fill();
    }

    ctx.strokeStyle = state.selected ? '#0f766e' : state.hovered ? '#c96d24' : '#c6baa6';
    ctx.lineWidth = state.selected || state.hovered ? 10 : 5;
    ctx.strokeRect(7, 7, B - 14, B - 14);

    ctx.fillStyle = '#6f695e';
    ctx.font = canvasFont('mono', 23, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`(${state.row},${state.col})`, B / 2, B - 30);
    ctx.restore();
    return;
  }

  // Beat 2: Scalar V(s) value terrain dial
  if (mode === 'v' || (mode === 'q' && qMorph <= 0.04)) {
    const vVal = state.v ?? 0;
    const norm = clamp((vVal + 4.5) / 14.5, 0, 1);
    const fillCol = norm >= 0.35
      ? lerpColorHex('#f5f0e5', '#87d4c4', (norm - 0.35) / 0.65)
      : lerpColorHex('#f0d2c4', '#f5f0e5', norm / 0.35);
    ctx.fillStyle = fillCol;
    ctx.fillRect(0, 0, B, B);

    const ringCol =
      linkRole === 'src'
        ? '#0f766e'
        : linkRole === 'dst'
          ? '#c96d24'
          : state.selected
            ? '#0f766e'
            : state.hovered
              ? '#c96d24'
              : '#4a5568';
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = linkRole || state.selected ? 15 : 5;
    ctx.strokeRect(8, 8, B - 16, B - 16);

    if (linkRole === 'src' || linkRole === 'dst') {
      ctx.fillStyle = linkRole === 'src' ? '#0f766e' : '#c96d24';
      ctx.beginPath();
      ctx.roundRect(14, 14, 68, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#fffaf2';
      ctx.font = canvasFont('mathItalic', 24, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(linkRole === 'src' ? 'S' : "S'", 48, 33);
    }

    ctx.fillStyle = '#18213d';
    ctx.font = canvasFont('mono', 50, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sign = vVal > 0.05 ? '+' : '';
    ctx.fillText(`${sign}${vVal.toFixed(1)}`, B / 2, B / 2 - 4);

    ctx.fillStyle = '#475569';
    ctx.font = canvasFont('mono', 22, 600);
    ctx.fillText(`(${state.row},${state.col})`, B / 2, B - 28);
    ctx.restore();
    return;
  }

  // Beat 3+: 4-triangle directional Q(s,a) facets (0: UP, 1: RIGHT, 2: DOWN, 3: LEFT)
  const q = state.q || [0, 0, 0, 0];
  const visited = state.qVisited !== false;
  const colorFacet = (val, isVisited = true) => {
    if (val <= -25) return isVisited ? '#e5958a' : '#f1d2cc';
    if (!isVisited) return '#f3eee4';
    const norm = clamp((val + 14) / 24, 0, 1);
    return norm >= 0.5
      ? lerpColorHex('#f5f0e5', '#9bd7ca', (norm - 0.5) * 2)
      : lerpColorHex('#efd1c2', '#f5f0e5', norm * 2);
  };

  ctx.fillStyle = '#f5f0e5';
  ctx.fillRect(0, 0, B, B);

  const polys = [
    [[0, 0], [B, 0], [B / 2, B / 2]],       // 0 UP
    [[B, 0], [B, B], [B / 2, B / 2]],       // 1 RIGHT
    [[B, B], [0, B], [B / 2, B / 2]],       // 2 DOWN
    [[0, B], [0, 0], [B / 2, B / 2]],       // 3 LEFT
  ];

  const best = state.bestAction ?? 1;
  ctx.save();
  ctx.globalAlpha = qMorph;
  polys.forEach((pts, idx) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fillStyle = colorFacet(q[idx], visited);
    ctx.fill();

    if (visited && idx === best && (state.highlighted || state.selected || linkRole)) {
      ctx.fillStyle = 'rgba(15, 118, 110, 0.18)';
      ctx.fill();
    }
  });

  // Diagonal X bevel seams
  ctx.strokeStyle = visited ? '#334059' : '#9aa3b2';
  ctx.lineWidth = visited ? 4 : 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(B, B);
  ctx.moveTo(B, 0);
  ctx.lineTo(0, B);
  ctx.stroke();

  if (state.showValues || state.selected || state.isForkCell) {
    const centers = [
      [B / 2, 42],
      [B - 46, B / 2],
      [B / 2, B - 40],
      [46, B / 2],
    ];
    ctx.font = canvasFont('mono', 26, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    q.forEach((val, idx) => {
      const [cx, cy] = centers[idx];
      const txt = val <= -50 ? '-100' : val.toFixed(1);
      // High-contrast warm ivory halo behind numeric readout for instant oblique legibility
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(250, 245, 236, 0.88)';
      ctx.strokeText(txt, cx, cy);
      ctx.fillStyle = val <= -25 ? '#8f1d14' : idx === best && visited ? '#0b5d56' : '#24304a';
      ctx.fillText(txt, cx, cy);
    });
  }

  // Center policy medallion: crisp arrow when converged/visited, honest subtle dot when unvisited
  ctx.beginPath();
  ctx.arc(B / 2, B / 2, visited ? 34 : 22, 0, Math.PI * 2);
  ctx.fillStyle = !visited
    ? 'rgba(246, 240, 229, 0.86)'
    : state.isForkCell
      ? '#fef3c7'
      : state.selected
        ? '#e2f4f0'
        : 'rgba(250, 245, 236, 0.95)';
  ctx.fill();
  ctx.strokeStyle = !visited
    ? '#a8b0be'
    : state.isForkCell
      ? '#c96d24'
      : state.selected
        ? '#0f766e'
        : '#24304a';
  ctx.lineWidth = visited ? 4.5 : 3;
  ctx.stroke();

  if (visited) {
    const angleMap = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    ctx.save();
    ctx.translate(B / 2, B / 2);
    ctx.rotate(angleMap[best] || 0);
    ctx.strokeStyle = state.isForkCell ? '#b85c14' : state.highlighted ? '#0f766e' : '#18213d';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 17);
    ctx.lineTo(0, -15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(0, -18);
    ctx.lineTo(11, -4);
    ctx.stroke();
    ctx.restore();
  } else {
    // Mathematically honest unvisited/unconverged state marker (no bogus arrows!)
    ctx.beginPath();
    ctx.arc(B / 2, B / 2, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
  }
  ctx.restore();

  // Outer selection / fork / hover border
  const borderCol =
    linkRole === 'dst' || state.isForkCell
      ? '#c96d24'
      : linkRole === 'src' || state.selected
        ? '#0f766e'
        : state.hovered
          ? '#c96d24'
          : '#273142';
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = state.isForkCell || state.selected || linkRole ? 15 : 5.5;
  ctx.strokeRect(6, 6, B - 12, B - 12);
  ctx.restore();
}

/**
 * Reusable high-DPI 512x512 beveled tile CanvasTexture powered by `kit/fonts.js`
 * (`createCrispCanvasTexture` with 16x anisotropy, sRGB mipmaps, and automatic
 * redraw once offline `@font-face` fonts settle).
 */
export function createBeveledGridTileTexture({ anisotropy = 16, onRedraw = null } = {}) {
  let lastKey = '';
  let latestState = { kind: 'normal', mode: 'clean', row: 0, col: 0, lang: 'zh' };

  const tex = createCrispCanvasTexture(THREE, {
    width: 512,
    height: 512,
    anisotropy,
    srgb: true,
    mipmaps: true,
    onRedraw,
    draw(ctx, w, h) {
      drawTileFace(ctx, latestState, w, h);
    },
  });

  return {
    texture: tex,
    update(state, key = null) {
      if (key !== null && key === lastKey) return false;
      lastKey = key ?? '';
      latestState = state;
      tex.redraw();
      return true;
    },
    dispose() {
      tex.dispose();
    },
  };
}

function makeChasmBannerTexture({ anisotropy = 16, onRedraw = null } = {}) {
  let currentLang = 'zh';
  const tex = createCrispCanvasTexture(THREE, {
    width: 1024,
    height: 256,
    anisotropy,
    srgb: true,
    mipmaps: true,
    onRedraw,
    draw(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);

      // Architectural dark volcanic badge with ember edge trim
      ctx.fillStyle = 'rgba(42, 12, 12, 0.88)';
      ctx.beginPath();
      ctx.roundRect(112, 34, w - 224, h - 68, 32);
      ctx.fill();

      ctx.strokeStyle = 'rgba(248, 146, 114, 0.72)';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe4de';
      if (currentLang === 'en') {
        ctx.font = canvasFont('mono', 78, 700);
        ctx.fillText('-100  CLIFF CHASM', w / 2, h / 2 + 2);
      } else {
        ctx.font = canvasFont('mono', 80, 700);
        ctx.fillText('-100', w * 0.34, h / 2 + 2);
        ctx.font = canvasFont('sans', 64, 700);
        ctx.fillText('悬崖深渊', w * 0.64, h / 2 + 2);
      }
    },
  });

  return {
    texture: tex,
    setLang(lang) {
      const next = lang === 'en' ? 'en' : 'zh';
      if (next === currentLang) return;
      currentLang = next;
      tex.redraw();
    },
    dispose() {
      tex.dispose();
    },
  };
}

/**
 * Simulify v2 Non-Cuboid Sculpted 4D Instrument Stage for 4x8 Cliff Walking.
 *
 * Pure deterministic function of master clock `t`:
 * - Architectural chamfered plinth & continuous bezel (`createBevelledProfile` + turned brass feet)
 * - 32 lit PBR chamfered ceramic pedestals with 512px crisp `createCrispCanvasTexture` faces
 * - Real 3D continuous value terrain (`createHeightfieldSurface`, zero-GC in-place updates)
 * - Real 3D fractured volcanic cliff canyon (`createFracturedChasm`, progressive Beat 3 carving + ember seam)
 * - Turned brass + ceramic directional Agent Probe (`createSculptedProbe`, real heading tracking)
 * - Fresnel optical glass Goal Lighthouse Beacon (`createBeaconLighthouse`) & Start Arch Gantry (`createArchSpan`)
 * - Parallel-transport swept 3D conduits (`createTaperedConduit`) for walk trail, TD wavefront,
 *   frosted-glass n-step return arc, Sarsa/Q policy ribbons, slip probe, and code-slate tether.
 */
export class CliffInstrumentTray {
  constructor(stage, { rows = 4, cols = 8 } = {}) {
    this.stage = stage;
    this.rows = rows;
    this.cols = cols;
    this.pitch = 1.06;
    this.tileSize = 0.88;
    this.tileH = 0.14;
    this.tileBaseY = 0.36;
    this.maxAnisotropy = typeof stage.getMaxAnisotropy === 'function' ? stage.getMaxAnisotropy() : 16;

    this.tiles = new Map();
    this._brushTargets = [];
    this._arcNodeCoords = [];
    this._lastRibbonKeys = { sarsa: '', q: '', custom: '', arc: '', walk: '' };
    this._lastHeightfieldKey = '';
    this._customChasmPockets = new Map();
    this._lastHeading = 0;

    // Choreographed 3D actor roots (3 initial visible actors at t = 0!)
    this.deckGroup = new THREE.Group();
    this.deckGroup.name = 'base-deck';
    this.stage.scene.add(this.deckGroup);

    this.endpointsGroup = new THREE.Group();
    this.endpointsGroup.name = 'start-goal';
    this.stage.scene.add(this.endpointsGroup);

    this.puckGroup = new THREE.Group();
    this.puckGroup.name = 'agent-puck';
    this.stage.scene.add(this.puckGroup);

    this.walkTrailGroup = new THREE.Group();
    this.walkTrailGroup.name = 'walk-trail';
    this.stage.scene.add(this.walkTrailGroup);

    this.wavefrontGroup = new THREE.Group();
    this.wavefrontGroup.name = 'td-wavefront';
    this.stage.scene.add(this.wavefrontGroup);

    this.chasmSignGroup = new THREE.Group();
    this.chasmSignGroup.name = 'cliff-chasm';
    this.stage.scene.add(this.chasmSignGroup);

    this.arcGroup = new THREE.Group();
    this.arcGroup.name = 'nstep-arc';
    this.stage.scene.add(this.arcGroup);

    this.sarsaRibbonGroup = new THREE.Group();
    this.sarsaRibbonGroup.name = 'sarsa-ribbon';
    this.stage.scene.add(this.sarsaRibbonGroup);

    this.qGhostRibbonGroup = new THREE.Group();
    this.qGhostRibbonGroup.name = 'q-ghost-ribbon';
    this.stage.scene.add(this.qGhostRibbonGroup);

    this.customGhostGroup = new THREE.Group();
    this.customGhostGroup.name = 'custom-ghost';
    this.stage.scene.add(this.customGhostGroup);

    this.tetherGroup = new THREE.Group();
    this.tetherGroup.name = 'code-tether';
    this.stage.scene.add(this.tetherGroup);

    this._buildHardwareDeck();
    this._buildValueHeightfield();
    this._buildAllTiles();
    this._buildEndpointsLandmarks();
    this._buildChasmCanyon();
    this._buildAgentProbe();
    this._buildWavefrontVisuals();
    this._buildSlipProbeVisuals();
  }

  cellToWorld(row, col) {
    return {
      x: (col - (this.cols - 1) / 2) * this.pitch,
      z: (row - (this.rows - 1) / 2) * this.pitch,
    };
  }

  getBrushTargets() {
    return this._brushTargets;
  }

  getTileWorldPos(row, col) {
    const tile = this.tiles.get(`cell-${row}-${col}`);
    if (tile) {
      return new THREE.Vector3(tile.group.position.x, tile.group.position.y + this.tileH * 0.5, tile.group.position.z);
    }
    const w = this.cellToWorld(row, col);
    return new THREE.Vector3(w.x, this.tileBaseY + this.tileH * 0.5, w.z);
  }

  _buildHardwareDeck() {
    const deckW = this.cols * this.pitch + 0.96;
    const deckD = this.rows * this.pitch + 0.96;
    const innerW = this.cols * this.pitch + 0.14;
    const innerD = this.rows * this.pitch + 0.14;

    // 1. Chamfered travertine-steel lower architectural plinth (non-cuboid ExtrudeGeometry)
    const plinthShape = makeChamferedRectShape(deckW, deckD, 0.34);
    const plinth = createBevelledProfile(plinthShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.032,
      bevelSize: 0.035,
      bevelSegments: 3,
      orient: 'xz',
      preset: 'travertine',
      materialOverrides: { color: 0xc9c1b2, roughness: 0.42, metalness: 0.18 },
      layer: SOLID_LAYER,
      name: 'instrument-plinth',
    });
    plinth.position.set(0, 0.08, 0);
    this.deckGroup.add(plinth);

    // 2. Single continuous machined anodized bezel frame with pierced inner cavity (zero BoxGeometry!)
    const bezelOuter = makeChamferedRectShape(deckW - 0.12, deckD - 0.12, 0.28);
    const holePts = [
      [-innerW * 0.5, -innerD * 0.5],
      [-innerW * 0.5, innerD * 0.5],
      [innerW * 0.5, innerD * 0.5],
      [innerW * 0.5, -innerD * 0.5],
    ];
    const bezel = createBevelledProfile(bezelOuter, {
      holes: [holePts],
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.024,
      bevelSize: 0.022,
      bevelSegments: 3,
      orient: 'xz',
      preset: 'anodized',
      layer: SOLID_LAYER,
      name: 'instrument-bezel',
    });
    bezel.position.set(0, 0.27, 0);
    this.deckGroup.add(bezel);

    // 3. Recessed obsidian chassis floor beneath the terrain & chasm
    const bedShape = makeChamferedRectShape(innerW + 0.04, innerD + 0.04, 0.08);
    const floorBed = createBevelledProfile(bedShape, {
      depth: 0.08,
      bevelEnabled: false,
      orient: 'xz',
      preset: 'obsidian',
      castShadow: false,
      receiveShadow: true,
      layer: SOLID_LAYER,
      name: 'instrument-bed',
    });
    floorBed.position.set(0, 0.11, 0);
    this.deckGroup.add(floorBed);

    // 4. Precision turned brass corner vernier fasteners (LatheGeometry)
    const finialProfile = [
      [0.001, 0],
      [0.105, 0],
      [0.115, 0.025],
      [0.085, 0.055],
      [0.095, 0.075],
      [0.068, 0.105],
      [0.001, 0.115],
    ];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const fastener = createLathedSolid(finialProfile, {
          segments: 24,
          preset: 'brass',
          layer: SOLID_LAYER,
          name: `corner-fastener-${sx > 0 ? 'e' : 'w'}-${sz > 0 ? 's' : 'n'}`,
        });
        fastener.position.set(sx * (deckW * 0.5 - 0.24), 0.17, sz * (deckD * 0.5 - 0.24));
        this.deckGroup.add(fastener);
      }
    }
  }

  _buildValueHeightfield() {
    const fieldW = this.cols * this.pitch + 0.02;
    const fieldD = this.rows * this.pitch + 0.02;

    this._heightfield = createHeightfieldSurface({
      width: fieldW,
      depth: fieldD,
      segsX: 64,
      segsZ: 32,
      skirt: true,
      baseY: 0.12,
      skirtColor: 0x3b4860,
      preset: 'ceramic',
      vertexColors: true,
      materialOverrides: { roughness: 0.46, metalness: 0.06 },
      heightFn: () => this.tileBaseY - 0.02,
      colorFn: (_u, _v, _y, out) => out.set(0xe7dfd0),
      castShadow: true,
      receiveShadow: true,
      layer: SOLID_LAYER,
      name: 'value-heightfield',
    });
    this._heightfield.visible = false;
    this.deckGroup.add(this._heightfield);
  }

  _buildAllTiles() {
    const tileShape = makeChamferedRectShape(this.tileSize, this.tileSize, 0.11);
    const sharedCapMesh = createBevelledProfile(tileShape, {
      depth: this.tileH,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.022,
      bevelSegments: 2,
      orient: 'xz',
      preset: 'ceramic',
    });
    const capGeo = sharedCapMesh.geometry;
    sharedCapMesh.material.dispose();

    const faceGeo = makeChamferedFaceGeometry(this.tileSize - 0.04, this.tileSize - 0.04, 0.095);
    const hitPlaneGeo = new THREE.PlaneGeometry(this.pitch * 0.96, this.pitch * 0.96);
    hitPlaneGeo.rotateX(-Math.PI / 2);
    const hitPlaneMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });

    const normalBodyMat = createSculptMaterial('travertine', {
      color: 0xd9cfbe,
      roughness: 0.46,
      metalness: 0.06,
    });
    const cliffBodyMat = createSculptMaterial('obsidian', {
      color: 0x5c1d18,
      emissive: 0x360a07,
      emissiveIntensity: 0.24,
      roughness: 0.72,
      metalness: 0.1,
    });
    const endpointBodyMat = createSculptMaterial('ceramic', {
      color: 0xe6d9c2,
      roughness: 0.36,
      metalness: 0.1,
    });

    const requestRedraw = () => this.stage.requestRender?.();

    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const pos = this.cellToWorld(r, c);
        const kind = r === 3 && c === 0 ? 'start' : r === 3 && c === this.cols - 1 ? 'goal' : 'normal';
        const isEnd = kind !== 'normal';

        const group = new THREE.Group();
        group.position.set(pos.x, this.tileBaseY, pos.z);
        group.userData.cell = { row: r, col: c, key: `${r},${c}`, kind };

        // Sculpted bevelled octagonal ceramic pedestal (casts & receives real shadows!)
        const body = new THREE.Mesh(capGeo, isEnd ? endpointBodyMat : normalBodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        body.layers.set(SOLID_LAYER);
        body.userData.simulifyGeoKind = 'extrude';
        group.add(body);

        // Lit PBR MeshStandardMaterial chamfered inlay with 512px crisp texture (receives shadows!)
        const texHolder = createBeveledGridTileTexture({
          anisotropy: this.maxAnisotropy,
          onRedraw: requestRedraw,
        });
        const faceMat = new THREE.MeshStandardMaterial({
          map: texHolder.texture,
          roughness: 0.62,
          metalness: 0.04,
        });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.position.y = this.tileH * 0.5 + 0.023;
        face.castShadow = false;
        face.receiveShadow = true;
        face.layers.set(SOLID_LAYER);
        face.userData.simulifyGeoKind = 'tile-inlay';
        group.add(face);

        // Permanent invisible raycast proxy so hovering/painting works seamlessly even over deep carved chasms
        const hitProxy = new THREE.Mesh(hitPlaneGeo, hitPlaneMat);
        hitProxy.position.y = this.tileH * 0.5 + 0.03;
        hitProxy.layers.set(GROUND_LAYER);
        hitProxy.userData.simulifyInternal = true;
        group.add(hitProxy);

        const parentGroup = isEnd ? this.endpointsGroup : this.deckGroup;
        parentGroup.add(group);

        const id = `cell-${r}-${c}`;
        this.stage.registerPickable(id, group, { row: r, col: c, kind });
        this._brushTargets.push(group);

        this.tiles.set(id, {
          id,
          row: r,
          col: c,
          kind,
          group,
          body,
          face,
          hitProxy,
          normalBodyMat,
          cliffBodyMat,
          texHolder,
          baseX: pos.x,
          baseZ: pos.z,
        });
      }
    }
  }

  _buildEndpointsLandmarks() {
    // 1. Sculpted Fresnel Optical Glass Lighthouse Beacon on Goal G (3, 7)
    const goalPos = this.cellToWorld(3, this.cols - 1);
    this._goalLighthouse = createBeaconLighthouse({
      radius: 0.21,
      height: 0.96,
      fresnelRings: 4,
      color: 'gold',
      basePreset: 'anodized',
      trimPreset: 'brass',
      glassPreset: 'glass',
      segments: 36,
      layer: SOLID_LAYER,
      name: 'goal-lighthouse',
    });
    // Mounted gracefully on the rear-east turret shoulder of Goal tile so '+10 G' face remains unobstructed
    this._goalLighthouse.position.set(
      goalPos.x + 0.30,
      this.tileBaseY + this.tileH * 0.5 + 0.02,
      goalPos.z - 0.28
    );
    this.endpointsGroup.add(this._goalLighthouse);

    // Subtle pulsing gold optical aura ring around Goal tile
    const goalRingGeo = new THREE.RingGeometry(0.45, 0.53, 40);
    goalRingGeo.rotateX(-Math.PI / 2);
    this._goalBeacon = new THREE.Mesh(
      goalRingGeo,
      createSculptMaterial('ember', {
        color: 0xd99b2e,
        emissive: 0xc96d24,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this._goalBeacon.castShadow = false;
    this._goalBeacon.receiveShadow = false;
    this._goalBeacon.position.set(goalPos.x, this.tileBaseY + this.tileH * 0.5 + 0.026, goalPos.z);
    this._goalBeacon.layers.set(GROUND_LAYER);
    this.endpointsGroup.add(this._goalBeacon);

    // 2. Sculpted Parabolic Start Arch Gantry framing Start S (3, 0) along its north launch threshold
    const startPos = this.cellToWorld(3, 0);
    this._startArchGroup = new THREE.Group();
    this._startArchGroup.name = 'start-arch-gantry';
    const arch = createArchSpan({
      span: 1.02,
      rise: 0.60,
      archThickness: 0.105,
      deckThickness: 0.075,
      depth: 0.16,
      bevel: 0.016,
      archStyle: 'parabolic',
      spandrelCutouts: true,
      preset: 'travertine',
      materialOverrides: { color: 0xe6dccb, roughness: 0.45, metalness: 0.08 },
      layer: SOLID_LAYER,
      name: 'start-arch-span',
    });
    this._startArchGroup.add(arch);

    // Turned brass keystone finial crowning the start arch
    const keystone = createLathedSolid(
      [
        [0.001, 0],
        [0.09, 0],
        [0.075, 0.04],
        [0.055, 0.09],
        [0.025, 0.13],
        [0.001, 0.15],
      ],
      {
        segments: 24,
        preset: 'brass',
        layer: SOLID_LAYER,
        name: 'start-arch-keystone',
      }
    );
    keystone.position.set(0, 0.675, 0);
    this._startArchGroup.add(keystone);

    // Positioned along the north launch edge between Start (3,0) and (2,0) — frames S without blocking it!
    this._startArchGroup.position.set(
      startPos.x,
      this.tileBaseY + this.tileH * 0.5 + 0.015,
      startPos.z - this.pitch * 0.49
    );
    this.endpointsGroup.add(this._startArchGroup);
  }

  _buildChasmCanyon() {
    const startP = this.cellToWorld(3, 1);
    const endP = this.cellToWorld(3, this.cols - 2);
    const chasmW = endP.x - startP.x + this.pitch - 0.02;
    const chasmD = this.pitch - 0.02;
    const cx = (startP.x + endP.x) * 0.5;
    const cz = startP.z;

    // 1. Real 3D sculpted fractured volcanic cliff chasm with terraced strata & ember fissure
    this._mainChasm = createFracturedChasm({
      width: chasmW,
      depth: chasmD,
      chasmDepth: 0.68,
      rimHeight: 0.058,
      segsX: 72,
      segsZ: 24,
      strataCount: 5,
      jaggedness: 0.15,
      seed: 73,
      rimColor: 0xbf5a40,
      strataColors: [0x8c3528, 0x5c1d1a, 0x3a1216, 0x220a0f],
      floorColor: 0x16080d,
      glowEmber: true,
      emberColor: 0xf45d2a,
      layer: SOLID_LAYER,
      name: 'main-fractured-chasm',
    });
    this._mainChasm.position.set(cx, this.tileBaseY + this.tileH * 0.5 + 0.01, cz);
    this._mainChasm.setCarveProgress(0);
    this.chasmSignGroup.add(this._mainChasm);

    // 2. High-DPI 1024x256 chamfered floating chasm plaque (cleanly clear of terraced rock floor!)
    this._chasmBannerHolder = makeChasmBannerTexture({
      anisotropy: this.maxAnisotropy,
      onRedraw: () => this.stage.requestRender?.(),
    });
    this._chasmBannerMat = new THREE.MeshStandardMaterial({
      map: this._chasmBannerHolder.texture,
      transparent: true,
      opacity: 0.96,
      roughness: 0.55,
      metalness: 0.05,
      depthWrite: false,
    });
    const bannerGeo = makeChamferedFaceGeometry(chasmW * 0.52, chasmD * 0.60, 0.08);
    bannerGeo.userData.simulifyGeoKind = 'plaque';
    this._chasmBanner = new THREE.Mesh(bannerGeo, this._chasmBannerMat);
    this._chasmBanner.position.set(cx, this.tileBaseY + 0.045, cz + 0.03);
    this._chasmBanner.castShadow = false;
    this._chasmBanner.receiveShadow = false;
    this._chasmBanner.layers.set(GROUND_LAYER);
    this._chasmBanner.userData.simulifyGeoKind = 'plaque';
    this.chasmSignGroup.add(this._chasmBanner);

    // 3. Glowing sculpted ember hazard seam along the north cliff lip (createTaperedConduit, zero Box!)
    const rimPts = [];
    for (let i = 0; i <= 10; i += 1) {
      const u = i / 10;
      const rx = lerp(cx - chasmW * 0.49, cx + chasmW * 0.49, u);
      const rz = cz - chasmD * 0.505 + Math.sin(u * Math.PI * 5) * 0.012;
      rimPts.push([rx, this.tileBaseY + this.tileH * 0.5 + 0.022, rz]);
    }
    this._cliffRimMat = createSculptMaterial('ember', {
      color: 0xdc2626,
      emissive: 0xef4444,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.85,
    });
    this._cliffRimMesh = createTaperedConduit(rimPts, (u) => 0.018 + 0.008 * Math.sin(u * Math.PI), {
      tubularSegments: 40,
      radialSegments: 8,
      material: this._cliffRimMat,
      castShadow: false,
      receiveShadow: false,
      layer: GROUND_LAYER,
      name: 'chasm-north-ember-rim',
    });
    this.chasmSignGroup.add(this._cliffRimMesh);

    // Container for per-cell custom-painted fractured chasm pockets
    this._customPocketsGroup = new THREE.Group();
    this._customPocketsGroup.name = 'custom-chasm-pockets';
    this.chasmSignGroup.add(this._customPocketsGroup);
  }

  _getOrCreateCustomPocket(row, col) {
    const key = `${row},${col}`;
    if (this._customChasmPockets.has(key)) {
      return this._customChasmPockets.get(key);
    }
    const pos = this.cellToWorld(row, col);
    const pocket = createFracturedChasm({
      width: this.pitch - 0.03,
      depth: this.pitch - 0.03,
      chasmDepth: 0.56,
      rimHeight: 0.048,
      segsX: 20,
      segsZ: 20,
      strataCount: 4,
      jaggedness: 0.16,
      seed: 101 + row * 31 + col * 17,
      rimColor: 0xc2714f,
      strataColors: [0x884233, 0x5c2925, 0x36181e],
      floorColor: 0x160a10,
      glowEmber: true,
      emberColor: 0xf05a28,
      layer: SOLID_LAYER,
      name: `custom-chasm-${row}-${col}`,
    });
    pocket.position.set(pos.x, this.tileBaseY + this.tileH * 0.5 + 0.01, pos.z);
    this._customPocketsGroup.add(pocket);
    this._customChasmPockets.set(key, pocket);
    return pocket;
  }

  _buildAgentProbe() {
    this._probe = createSculptedProbe({
      radius: 0.25,
      height: 0.62,
      tone: 'teal',
      bodyPreset: 'ceramic',
      trimPreset: 'brass',
      vane: true,
      segments: 36,
      layer: SOLID_LAYER,
      name: 'agent-sculpted-probe',
    });
    this.puckGroup.add(this._probe);

    // Subtle glowing ground contact aura ring
    const haloGeo = new THREE.RingGeometry(0.29, 0.37, 36);
    haloGeo.rotateX(-Math.PI / 2);
    this.puckHaloMat = createSculptMaterial('ember', {
      color: 0x149694,
      emissive: 0x149694,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, this.puckHaloMat);
    halo.castShadow = false;
    halo.receiveShadow = false;
    halo.position.y = 0.01;
    halo.layers.set(GROUND_LAYER);
    this.puckGroup.add(halo);

    const sp = this.cellToWorld(3, 0);
    this.puckGroup.position.set(sp.x, this.tileBaseY + this.tileH * 0.5 + 0.022, sp.z);
    this._probe.setHeading(Math.PI * 0.5); // Facing North out through Start arch
  }

  _buildWavefrontVisuals() {
    const ringGeo = new THREE.RingGeometry(0.39, 0.48, 36);
    ringGeo.rotateX(-Math.PI / 2);

    this._wfSrcRing = new THREE.Mesh(
      ringGeo,
      createSculptMaterial('ember', {
        color: 0x0f766e,
        emissive: 0x14b8a6,
        emissiveIntensity: 0.62,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this._wfSrcRing.castShadow = false;
    this._wfSrcRing.layers.set(GROUND_LAYER);

    this._wfDstRing = new THREE.Mesh(
      ringGeo,
      createSculptMaterial('ember', {
        color: 0xc96d24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.62,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this._wfDstRing.castShadow = false;
    this._wfDstRing.layers.set(GROUND_LAYER);

    // Sculpted lathed optical energy jewel orb traveling S' -> S
    this._wfOrb = createLathedSolid(
      [
        [0.001, -0.11],
        [0.085, -0.06],
        [0.115, 0],
        [0.085, 0.06],
        [0.001, 0.11],
      ],
      {
        segments: 24,
        preset: 'ember',
        materialOverrides: {
          color: 0x2dd4bf,
          emissive: 0x0d9488,
          emissiveIntensity: 0.95,
          roughness: 0.18,
        },
        castShadow: true,
        layer: SOLID_LAYER,
        name: 'td-wavefront-orb',
      }
    );

    this._wfOrbGlow = createLathedSolid(
      [
        [0.001, -0.18],
        [0.14, -0.10],
        [0.18, 0],
        [0.14, 0.10],
        [0.001, 0.18],
      ],
      {
        segments: 20,
        preset: 'glass',
        materialOverrides: {
          color: 0x5eead4,
          emissive: 0x14b8a6,
          emissiveIntensity: 0.55,
          opacity: 0.34,
        },
        castShadow: false,
        receiveShadow: false,
        layer: GROUND_LAYER,
        name: 'td-wavefront-halo',
      }
    );

    this._wfArcMesh = null;
    this._wfArcKey = '';

    this.wavefrontGroup.add(this._wfSrcRing, this._wfDstRing, this._wfOrb, this._wfOrbGlow);
  }

  _buildSlipProbeVisuals() {
    this._slipGroup = new THREE.Group();
    this._slipGroup.visible = false;

    // Smaller sculpted crimson counterfactual slip probe dropping toward cliff rim
    this._slipGhostProbe = createSculptedProbe({
      radius: 0.19,
      height: 0.44,
      tone: 'danger',
      bodyPreset: 'ember',
      trimPreset: 'obsidian',
      vane: true,
      segments: 24,
      layer: GROUND_LAYER,
      name: 'slip-ghost-probe',
    });
    this._slipGhostProbe.traverse((ch) => {
      if (ch.isMesh && ch.material) {
        ch.material = ch.material.clone();
        ch.material.transparent = true;
        ch.material.opacity = 0.68;
        ch.material.depthWrite = false;
        ch.castShadow = false;
      }
    });
    this._slipGhostProbe.setHeading(-Math.PI * 0.5); // Facing South into cliff!
    this._slipGroup.add(this._slipGhostProbe);

    this._slipArcMesh = null;
    this._slipKey = '';
    this.qGhostRibbonGroup.add(this._slipGroup);
  }

  focusCell(row, col, zoom = 1.38) {
    const p = this.getTileWorldPos(row, col);
    this.stage.setHighlightRing(new THREE.Vector3(p.x, p.y + 0.025, p.z), 0.56, '#0f766e');
    this.stage.flyTo({ target: [p.x * 0.55, 0.45, p.z * 0.55], zoom: Math.max(this.stage.view.zoom, zoom) }, 380);
    return true;
  }

  /**
   * Update the continuous sculpted 3D value heightfield in-place (zero GC!).
   * Bilinearly interpolates either V(s) (Beat 2) or max_a Q(s,a) (Beats 3-6) across the board.
   */
  _updateValueHeightfield({ tileMode, vGrid, qGrid, cliffMask, cliffCarve, vLiftStrength, qMorph }) {
    const showTerrain = tileMode === 'v' ? vLiftStrength > 0.02 : tileMode === 'q' ? (qMorph > 0.02 || vLiftStrength > 0.02) : false;
    this._heightfield.visible = showTerrain;
    if (!showTerrain) return;

    // Build grid scalar height matrix (rows x cols) in world Y
    const cellY = Array.from({ length: this.rows }, () => new Float32Array(this.cols));
    const cellNorm = Array.from({ length: this.rows }, () => new Float32Array(this.cols));
    let fp = `${tileMode}|${cliffCarve.toFixed(2)}|${vLiftStrength.toFixed(2)}|${qMorph.toFixed(2)}`;

    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const isEnd = (r === 3 && c === 0) || (r === 3 && c === this.cols - 1);
        const isCliffCell = !isEnd && Boolean(cliffMask?.[r]?.[c]);
        const vVal = vGrid?.[r]?.[c] ?? 0;
        const qRow = qGrid?.[r]?.[c] || [0, 0, 0, 0];
        const maxQ = Math.max(qRow[0], qRow[1], qRow[2], qRow[3]);

        let lift = 0;
        let norm = 0.35;
        if (isCliffCell && cliffCarve > 0.001) {
          lift = -0.36 * cliffCarve;
          norm = 0;
        } else if (r === 3 && c === this.cols - 1) {
          // Goal G sits proudly on the elevated summit peak!
          const gLift = tileMode === 'v' ? 0.68 * vLiftStrength : 0.44 * Math.max(qMorph, vLiftStrength);
          lift = gLift;
          norm = 1;
        } else if (r === 3 && c === 0) {
          lift = 0.02;
          norm = 0.25;
        } else if (tileMode === 'v') {
          const vn = clamp((vVal + 3.0) / 12.5, 0, 1);
          lift = vn * 0.66 * vLiftStrength;
          norm = vn;
        } else {
          const vn = clamp((vVal + 3.0) / 12.5, 0, 1);
          const qn = clamp((maxQ + 14.0) / 23.0, 0, 1);
          const blendedN = lerp(vn, qn, qMorph);
          lift = blendedN * lerp(0.66 * vLiftStrength, 0.44, qMorph);
          norm = blendedN;
        }
        cellY[r][c] = this.tileBaseY + lift;
        cellNorm[r][c] = norm;
        if ((r + c) % 2 === 0 || isCliffCell) {
          fp += `|${lift.toFixed(2)}`;
        }
      }
    }

    if (fp === this._lastHeightfieldKey) return;
    this._lastHeightfieldKey = fp;

    const maxC = this.cols - 1;
    const maxR = this.rows - 1;
    const colLow = new THREE.Color(0x9a3d30);
    const colMid = new THREE.Color(0xebe2d2);
    const colHigh = new THREE.Color(0x2ca59a);
    const colGoal = new THREE.Color(0xd99b2e);

    const sampleBilinear = (grid, u, v) => {
      const gx = clamp(u * this.cols - 0.5, 0, maxC);
      const gz = clamp(v * this.rows - 0.5, 0, maxR);
      const c0 = Math.floor(gx);
      const r0 = Math.floor(gz);
      const c1 = Math.min(maxC, c0 + 1);
      const r1 = Math.min(maxR, r0 + 1);
      const fx = gx - c0;
      const fz = gz - r0;
      // Smoothstep blending yields organic architectural hill ridges instead of faceted pyramids
      const sx = fx * fx * (3 - 2 * fx);
      const sz = fz * fz * (3 - 2 * fz);
      const a = grid[r0][c0] * (1 - sx) + grid[r0][c1] * sx;
      const b = grid[r1][c0] * (1 - sx) + grid[r1][c1] * sx;
      return a * (1 - sz) + b * sz;
    };

    this._heightfield.updateHeights(
      (u, v) => sampleBilinear(cellY, u, v) - 0.012,
      (u, v, y, out) => {
        if (y < this.tileBaseY - 0.08) {
          const drop = clamp((this.tileBaseY - 0.08 - y) / 0.28, 0, 1);
          return out.copy(colMid).lerp(colLow, 0.45 + drop * 0.55);
        }
        const n = sampleBilinear(cellNorm, u, v);
        if (n >= 0.86) {
          return out.copy(colHigh).lerp(colGoal, clamp((n - 0.86) / 0.14, 0, 1));
        }
        if (n >= 0.36) {
          return out.copy(colMid).lerp(colHigh, clamp((n - 0.36) / 0.50, 0, 1));
        }
        return out.copy(colLow).lerp(colMid, clamp(n / 0.36, 0, 1));
      }
    );
  }

  /**
   * Pure deterministic scene update from a single time-derived render state `rs`.
   */
  updateFromRenderState(rs) {
    const {
      t = 0,
      beatNum = 1,
      tileMode = 'clean', // 'clean' | 'v' | 'q'
      qMorph = 0,
      cliffCarve = 0,
      vLiftStrength = 0,
      cliffMask = null,
      vGrid = null,
      qGrid = null,
      qVisits = null,
      selectedCell = null,
      hoveredCell = null,
      forkCell = null,
      linkSrcCell = null,
      linkDstCell = null,
      walkTrailCells = null,
      walkProgress = 0,
      wavefront = null,
      arcNodes = null,
      arcReveal = 0,
      arcPulsePhase = 0,
      sarsaPath = null,
      qPath = null,
      customGhostPath = null,
      puckPos = null, // { pathCells, pathProgress } | { row, col, heading? } | { x, y, z, heading? }
      puckTone = 'teal',
      slipProbe = null, // { active, fromCell, toCell, progress }
      tether = null, // { visible, fromCell, toWorld }
      lang = 'zh',
    } = rs;

    const sameCell = (a, r, c) => Boolean(a && a[0] === r && a[1] === c);

    // 0. Update continuous sculpted 3D Value Landscape Heightfield
    this._updateValueHeightfield({
      tileMode,
      vGrid,
      qGrid,
      cliffMask,
      cliffCarve,
      vLiftStrength,
      qMorph,
    });

    // Check whether all 6 default bottom cliff cells (3,1)..(3,6) are intact for wide continuous fractured chasm
    let standardChasmCount = 0;
    for (let c = 1; c < this.cols - 1; c += 1) {
      if (cliffMask?.[3]?.[c]) standardChasmCount += 1;
    }
    const useContiguousChasm = standardChasmCount === this.cols - 2 && cliffCarve > 0.02;
    this._mainChasm.visible = useContiguousChasm;
    if (useContiguousChasm) {
      this._mainChasm.setCarveProgress(cliffCarve);
    }

    this._chasmBannerHolder.setLang(lang);
    const useWideChasmBanner = standardChasmCount >= 4 && cliffCarve > 0.2;
    this._chasmBanner.visible = useWideChasmBanner;
    this._cliffRimMesh.visible = useContiguousChasm && cliffCarve > 0.08;
    if (useWideChasmBanner) {
      this._chasmBannerMat.opacity = clamp((cliffCarve - 0.2) / 0.8, 0, 1) * 0.96;
      this._cliffRimMat.opacity = clamp(cliffCarve, 0, 1) * 0.86;
    }

    // Track active custom pocket keys so unused pockets hide cleanly
    const activeCustomPockets = new Set();

    // Build Beat 1 trail lookup for tile glow
    const trailGlowMap = new Map();
    if (tileMode === 'clean' && Array.isArray(walkTrailCells) && walkTrailCells.length > 0) {
      const litIdx = walkProgress * (walkTrailCells.length - 1);
      walkTrailCells.forEach(([tr, tc], idx) => {
        if (idx <= litIdx + 0.5) {
          const dist = Math.max(0, litIdx - idx);
          const glow = clamp(1 - dist * 0.12, 0.25, 1);
          trailGlowMap.set(`${tr},${tc}`, glow);
        }
      });
    }

    // 1. Update all 32 physical sculpted tiles (resting cleanly on heightfield or retracting into fractured chasm)
    for (const tile of this.tiles.values()) {
      const { row, col, kind, group, body, face, texHolder } = tile;
      const isCliffCell = kind === 'normal' && Boolean(cliffMask?.[row]?.[col]);
      const isStdBottom = row === 3 && col >= 1 && col <= this.cols - 2;
      const isSelected = sameCell(selectedCell, row, col);
      const isHovered = sameCell(hoveredCell, row, col);
      const isForkCell = beatNum >= 5 && sameCell(forkCell, row, col);
      const linkRole = sameCell(linkSrcCell, row, col)
        ? 'src'
        : sameCell(linkDstCell, row, col)
          ? 'dst'
          : null;

      const vVal = vGrid?.[row]?.[col] ?? 0;
      const qRow = qGrid?.[row]?.[col] || [0, 0, 0, 0];
      const visitsHere = qVisits?.[row]?.[col] ?? 10;
      const sortedQ = [...qRow].sort((a, b) => b - a);
      const qMargin = sortedQ[0] - sortedQ[1];
      const minVisits = beatNum >= 5 ? 8 : 4;
      const minMargin = beatNum >= 5 ? 0.35 : 0.15;
      const qVisited = visitsHere >= minVisits && qMargin >= minMargin;

      let bestA = 0;
      for (let a = 1; a < 4; a += 1) {
        if (qRow[a] > qRow[bestA] + 1e-6) bestA = a;
      }

      // Determine whether this cliff cell is represented by a real 3D fractured chasm
      const carvedIntoMainChasm = isCliffCell && isStdBottom && useContiguousChasm;
      const needsCustomPocket = isCliffCell && cliffCarve > 0.08 && !carvedIntoMainChasm;

      if (needsCustomPocket) {
        const pKey = `${row},${col}`;
        activeCustomPockets.add(pKey);
        const pocket = this._getOrCreateCustomPocket(row, col);
        pocket.visible = true;
        pocket.setCarveProgress(cliffCarve);
      }

      // When carved into a 3D chasm (> 0.22), retract and hide the flat tile cap so rocky terraced strata shine!
      const hideCapInChasm = (carvedIntoMainChasm || needsCustomPocket) && cliffCarve > 0.22;
      body.visible = !hideCapInChasm;
      face.visible = !hideCapInChasm;

      // Compute exact physical elevation synced with continuous Value Heightfield (zero z-fighting!)
      let targetY = this.tileBaseY;
      if (isCliffCell && cliffCarve > 0.001) {
        targetY = this.tileBaseY - 0.28 * cliffCarve;
      } else if (this._heightfield.visible) {
        targetY = this._heightfield.sampleHeight(tile.baseX, tile.baseZ) + 0.02;
      } else if (kind === 'normal' && vLiftStrength > 0.001) {
        const vNorm = clamp((vVal + 3.0) / 12.5, 0, 1);
        targetY = this.tileBaseY + vNorm * 0.66 * vLiftStrength;
      }
      if (!isCliffCell && (isHovered || linkRole)) {
        targetY += 0.036;
      }
      group.position.y = targetY;

      if (kind === 'normal') {
        const wantCliffMat = isCliffCell && cliffCarve > 0.45;
        body.material = wantCliffMat ? tile.cliffBodyMat : tile.normalBodyMat;
      }

      const showIndivCliffLabel = isCliffCell && (!useWideChasmBanner || !isStdBottom);
      const trailGlow = trailGlowMap.get(`${row},${col}`) || 0;
      const showValues = tileMode === 'q' && qMorph > 0.6 && (isSelected || isHovered || isForkCell);

      const qKey = tileMode === 'q'
        ? `${qRow[0].toFixed(1)},${qRow[1].toFixed(1)},${qRow[2].toFixed(1)},${qRow[3].toFixed(1)}|${qVisited ? 1 : 0}`
        : '';
      const faceKey = `${kind}|${tileMode}|${isCliffCell ? 'C' : 'W'}|${cliffCarve.toFixed(2)}|${qMorph.toFixed(2)}|${vVal.toFixed(1)}|${qKey}|${bestA}|${isSelected ? 1 : 0}|${isHovered ? 1 : 0}|${isForkCell ? 1 : 0}|${linkRole || ''}|${trailGlow.toFixed(2)}|${showIndivCliffLabel ? 1 : 0}|${lang}`;

      texHolder.update(
        {
          row,
          col,
          kind,
          mode: tileMode,
          v: vVal,
          q: qRow,
          qVisited,
          bestAction: bestA,
          qMorph,
          isCliff: isCliffCell,
          cliffCarve,
          showIndivCliffLabel,
          trailGlow,
          selected: isSelected,
          hovered: isHovered,
          highlighted: isSelected || isForkCell || Boolean(linkRole),
          isForkCell,
          linkRole,
          showValues,
          lang,
        },
        faceKey
      );
    }

    // Hide any previously carved custom chasm pockets that were erased
    for (const [key, pocket] of this._customChasmPockets.entries()) {
      if (!activeCustomPockets.has(key)) {
        pocket.visible = false;
      }
    }

    // Keep Start Arch & Goal Lighthouse anchored seamlessly to their elevated endpoint pedestals
    const goalTop = this.getTileWorldPos(3, this.cols - 1);
    this._goalLighthouse.position.set(goalTop.x + 0.30, goalTop.y + 0.02, goalTop.z - 0.28);
    this._goalLighthouse.setBeaconIntensity(0.78 + 0.34 * Math.sin(t * 2.6));
    this._goalBeacon.position.set(goalTop.x, goalTop.y + 0.026, goalTop.z);
    this._goalBeacon.scale.setScalar(1 + 0.065 * Math.sin(t * 2.4));

    const startTop = this.getTileWorldPos(3, 0);
    this._startArchGroup.position.set(startTop.x, startTop.y + 0.015, startTop.z - this.pitch * 0.49);

    // 2. Beat 1 Exploration Trail swept conduit
    this._updateWalkTrail(walkTrailCells, walkProgress);

    // 3. Beat 2 TD(0) Backward Credit Wavefront
    this._updateWavefront(wavefront);

    // 4. Beat 4+ Frosted-Glass n-step Return Arc
    this._updateGlassArc(arcNodes, arcReveal, arcPulsePhase);

    // 5. Beat 5+ Live Solid PBR Sarsa Ribbon + Counterfactual Ghost Q-learning + Custom/ε Ghost
    this._updatePathRibbon(this.sarsaRibbonGroup, 'sarsa', sarsaPath, {
      color: 0x0f766e,
      emissive: 0x0d9488,
      emissiveIntensity: 0.22,
      opacity: 0.96,
      radius: 0.048,
      yOffset: 0.052,
      xShift: -0.045,
      ghost: false,
      layer: SOLID_LAYER,
    });
    this._updatePathRibbon(this.qGhostRibbonGroup, 'q', qPath, {
      color: 0xd97706,
      emissive: 0xb45309,
      emissiveIntensity: 0.28,
      opacity: 0.58,
      radius: 0.042,
      yOffset: 0.068,
      xShift: 0.055,
      ghost: true,
      layer: GROUND_LAYER,
    });
    this._updatePathRibbon(this.customGhostGroup, 'custom', customGhostPath, {
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.32,
      opacity: 0.56,
      radius: 0.038,
      yOffset: 0.095,
      xShift: 0.0,
      ghost: true,
      layer: GROUND_LAYER,
    });

    // 6. Cliff-slip counterfactual probe visual
    this._updateSlipProbe(slipProbe);

    // 7. Pure deterministic Sculpted Agent Probe placement & directional airfoil heading
    let resolvedCell = null;
    if (puckPos) {
      if (Array.isArray(puckPos.pathCells) && puckPos.pathCells.length > 0) {
        const cells = puckPos.pathCells;
        if (cells.length === 1) {
          const tp = this.getTileWorldPos(cells[0][0], cells[0][1]);
          this.puckGroup.position.set(tp.x, tp.y + 0.022, tp.z);
          resolvedCell = cells[0];
        } else {
          const u = clamp(puckPos.pathProgress ?? 0, 0, 1) * (cells.length - 1);
          const idx = Math.min(cells.length - 2, Math.floor(u));
          const frac = u - idx;
          const pA = this.getTileWorldPos(cells[idx][0], cells[idx][1]);
          const pB = this.getTileWorldPos(cells[idx + 1][0], cells[idx + 1][1]);
          const hop = Math.sin(frac * Math.PI) * 0.12;
          this.puckGroup.position.set(
            lerp(pA.x, pB.x, frac),
            lerp(pA.y, pB.y, frac) + 0.022 + hop,
            lerp(pA.z, pB.z, frac)
          );
          const dx = pB.x - pA.x;
          const dz = pB.z - pA.z;
          if (Math.hypot(dx, dz) > 1e-4) {
            this._lastHeading = Math.atan2(-dz, dx);
          }
          resolvedCell = frac < 0.5 ? cells[idx] : cells[idx + 1];
        }
      } else if (puckPos.x !== undefined && puckPos.z !== undefined) {
        this.puckGroup.position.set(
          puckPos.x,
          puckPos.y ?? (this.tileBaseY + this.tileH * 0.5 + 0.022),
          puckPos.z
        );
        if (puckPos.heading !== undefined) this._lastHeading = puckPos.heading;
      } else if (puckPos.row !== undefined && puckPos.col !== undefined) {
        const tp = this.getTileWorldPos(puckPos.row, puckPos.col);
        this.puckGroup.position.set(tp.x, tp.y + 0.022, tp.z);
        resolvedCell = [puckPos.row, puckPos.col];
        if (puckPos.heading !== undefined) this._lastHeading = puckPos.heading;
      }
    }
    this._probe.setHeading(this._lastHeading);

    const crownColor = puckTone === 'amber' ? 0xf59e0b : puckTone === 'danger' ? 0xf43f5e : 0x14b8a6;
    this._probe.setAccentColor(crownColor);
    this._probe.setEmissiveIntensity(puckTone === 'danger' ? 0.72 : 0.46);
    this.puckHaloMat.color.set(crownColor);
    this.puckHaloMat.emissive.set(crownColor);

    // 8. Beat 6 tapered tether connecting active cell up to 3D HTML-in-Canvas code slate
    const effectiveTether = tether
      ? { ...tether, fromCell: tether.fromCell || resolvedCell || forkCell || [2, 3] }
      : null;
    this._updateTether(effectiveTether);
  }

  _updateWalkTrail(cells, progress) {
    if (!cells || cells.length < 2 || progress <= 0.02) {
      if (this._lastRibbonKeys.walk !== '') {
        this._clearGroup(this.walkTrailGroup);
        this._lastRibbonKeys.walk = '';
      }
      return;
    }
    const clampedP = clamp(progress, 0.02, 1);
    const key = `${cells.map((c) => c.join(',')).join(';')}|${clampedP.toFixed(2)}`;
    if (key === this._lastRibbonKeys.walk) return;
    this._lastRibbonKeys.walk = key;
    this._clearGroup(this.walkTrailGroup);

    const exactIdx = clampedP * (cells.length - 1);
    const whole = Math.floor(exactIdx);
    const frac = exactIdx - whole;
    const pts = [];
    for (let i = 0; i <= whole; i += 1) {
      const p = this.getTileWorldPos(cells[i][0], cells[i][1]);
      pts.push(new THREE.Vector3(p.x, p.y + 0.05, p.z));
    }
    if (whole < cells.length - 1 && frac > 0.01) {
      const a = this.getTileWorldPos(cells[whole][0], cells[whole][1]);
      const b = this.getTileWorldPos(cells[whole + 1][0], cells[whole + 1][1]);
      pts.push(new THREE.Vector3(lerp(a.x, b.x, frac), lerp(a.y, b.y, frac) + 0.05, lerp(a.z, b.z, frac)));
    }
    if (pts.length < 2) return;

    const conduit = createTaperedConduit(pts, (u) => lerp(0.018, 0.044, u), {
      tubularSegments: Math.max(20, pts.length * 6),
      radialSegments: 10,
      curveTension: 0.2,
      preset: 'ceramic',
      materialOverrides: {
        color: 0x149694,
        emissive: 0x0f766e,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      },
      castShadow: false,
      receiveShadow: false,
      layer: GROUND_LAYER,
      name: 'walk-trail-conduit',
    });
    this.walkTrailGroup.add(conduit);
  }

  _updateWavefront(wf) {
    if (!wf || !wf.fromCell || !wf.toCell) {
      this._wfSrcRing.visible = false;
      this._wfDstRing.visible = false;
      this._wfOrb.visible = false;
      this._wfOrbGlow.visible = false;
      if (this._wfArcMesh) this._wfArcMesh.visible = false;
      return;
    }

    const pSrc = this.getTileWorldPos(wf.toCell[0], wf.toCell[1]);
    const pDst = this.getTileWorldPos(wf.fromCell[0], wf.fromCell[1]);

    this._wfSrcRing.visible = true;
    this._wfDstRing.visible = true;
    this._wfOrb.visible = true;
    this._wfOrbGlow.visible = true;

    this._wfSrcRing.position.set(pSrc.x, pSrc.y + 0.032, pSrc.z);
    this._wfDstRing.position.set(pDst.x, pDst.y + 0.032, pDst.z);

    const mid = new THREE.Vector3(
      (pDst.x + pSrc.x) * 0.5,
      Math.max(pDst.y, pSrc.y) + 0.92,
      (pDst.z + pSrc.z) * 0.5
    );
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(pDst.x, pDst.y + 0.12, pDst.z),
      mid,
      new THREE.Vector3(pSrc.x, pSrc.y + 0.12, pSrc.z)
    );

    const key = `${wf.fromCell.join(',')}>${wf.toCell.join(',')}|${pDst.y.toFixed(2)}|${pSrc.y.toFixed(2)}`;
    if (key !== this._wfArcKey) {
      this._wfArcKey = key;
      if (this._wfArcMesh) {
        this._wfArcMesh.geometry?.dispose?.();
        this._wfArcMesh.material?.dispose?.();
        this._wfArcMesh.removeFromParent();
      }
      const cAmber = new THREE.Color(0xd97706);
      const cTeal = new THREE.Color(0x0d9488);
      this._wfArcMesh = createTaperedConduit(
        curve,
        (u) => 0.024 + 0.026 * Math.sin(u * Math.PI),
        {
          tubularSegments: 28,
          radialSegments: 12,
          colorFn: (u, out) => out.copy(cAmber).lerp(cTeal, u),
          preset: 'ceramic',
          materialOverrides: {
            emissive: 0x0f766e,
            emissiveIntensity: 0.24,
            roughness: 0.28,
            transparent: true,
            opacity: 0.90,
          },
          castShadow: true,
          receiveShadow: false,
          layer: SOLID_LAYER,
          name: 'td-wavefront-arc',
        }
      );
      this.wavefrontGroup.add(this._wfArcMesh);
    }
    if (this._wfArcMesh) this._wfArcMesh.visible = true;

    const u = clamp(wf.phase ?? 0.5, 0, 1);
    const orbPt = curve.getPoint(u);
    this._wfOrb.position.copy(orbPt);
    this._wfOrbGlow.position.copy(orbPt);
    const pulseScale = 1.05 + 0.38 * Math.sin(u * Math.PI);
    this._wfOrbGlow.scale.setScalar(pulseScale);
  }

  _updateGlassArc(nodes, reveal = 1, pulsePhase = 0) {
    if (!nodes || nodes.length < 2 || reveal <= 0.02) {
      if (this._lastRibbonKeys.arc !== '') {
        this._clearGroup(this.arcGroup);
        this._arcNodeCoords = [];
        this._lastRibbonKeys.arc = '';
      }
      return;
    }

    const rQuant = clamp(reveal, 0, 1);
    const tileTops = nodes.map((cell) => this.getTileWorldPos(cell[0], cell[1]));
    const ySig = tileTops.map((p) => p.y.toFixed(2)).join(',');
    const nodeKey = `${nodes.map((c) => c.join(',')).join(';')}|${rQuant.toFixed(2)}|${ySig}`;
    if (nodeKey !== this._lastRibbonKeys.arc) {
      this._lastRibbonKeys.arc = nodeKey;
      this._clearGroup(this.arcGroup);
      this._arcNodeCoords = [];

      const span = nodes.length - 1;
      const pts = tileTops.map((tp, idx) => {
        const u = idx / span;
        const archH = Math.sin(u * Math.PI) * (1.14 + Math.min(0.84, span * 0.17)) * rQuant;
        return new THREE.Vector3(tp.x, tp.y + 0.10 + archH, tp.z);
      });

      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.4);
      this._arcCurve = curve;

      // Sculpted translucent frosted-glass tapered conduit shell
      const glassShell = createTaperedConduit(
        curve,
        (u) => (0.068 + 0.036 * Math.sin(u * Math.PI)) * Math.max(0.3, rQuant),
        {
          tubularSegments: 52,
          radialSegments: 18,
          preset: 'glass',
          materialOverrides: {
            color: 0x5eead4,
            emissive: 0x0d9488,
            emissiveIntensity: 0.22,
            opacity: 0.34 * rQuant,
          },
          castShadow: false,
          receiveShadow: false,
          layer: GROUND_LAYER,
          name: 'nstep-glass-conduit',
        }
      );
      this.arcGroup.add(glassShell);

      // Gradient teal -> amber glowing inner credit core beam
      const cStart = new THREE.Color(0x0f766e);
      const cHorizon = new THREE.Color(0xd97706);
      const coreBeam = createTaperedConduit(
        curve,
        (u) => (0.026 + 0.014 * Math.sin(u * Math.PI)) * Math.max(0.3, rQuant),
        {
          tubularSegments: 52,
          radialSegments: 12,
          colorFn: (u, out) => out.copy(cStart).lerp(cHorizon, u),
          preset: 'ceramic',
          materialOverrides: {
            emissive: 0x149694,
            emissiveIntensity: 0.42,
            transparent: true,
            opacity: 0.94 * rQuant,
            depthWrite: false,
          },
          castShadow: false,
          receiveShadow: false,
          layer: GROUND_LAYER,
          name: 'nstep-core-conduit',
        }
      );
      this.arcGroup.add(coreBeam);

      const subDigits = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
      const dropMat = createSculptMaterial('anodized', {
        color: 0x149694,
        transparent: true,
        opacity: 0.34 * rQuant,
        depthWrite: false,
      });

      pts.forEach((p, idx) => {
        const isHorizon = idx === pts.length - 1;
        const isStart = idx === 0;
        const rNode = isHorizon ? 0.12 : isStart ? 0.105 : 0.088;

        // Turned biconvex brass/gem node markers instead of bare spheres
        const nodeLens = createLathedSolid(
          [
            [0.001, -rNode * 0.85],
            [rNode * 0.82, -rNode * 0.42],
            [rNode, 0],
            [rNode * 0.82, rNode * 0.42],
            [0.001, rNode * 0.85],
          ],
          {
            segments: 20,
            preset: 'ceramic',
            materialOverrides: {
              color: isHorizon ? 0xf59e0b : 0x14b8a6,
              emissive: isHorizon ? 0xc26a1b : 0x0f766e,
              emissiveIntensity: isHorizon ? 0.65 : 0.50,
              roughness: 0.2,
              metalness: 0.16,
            },
            castShadow: true,
            layer: SOLID_LAYER,
            name: `nstep-node-${idx}`,
          }
        );
        nodeLens.position.copy(p);
        this.arcGroup.add(nodeLens);

        // Subtle tapered vertical drop filament anchoring each arc node to its tile center
        const dropH = Math.max(0.02, p.y - (tileTops[idx].y + 0.04));
        if (dropH > 0.12) {
          const drop = createTaperedConduit(
            [
              [p.x, tileTops[idx].y + 0.04, p.z],
              [p.x, p.y - rNode * 0.7, p.z],
            ],
            [0.014, 0.009],
            {
              tubularSegments: 6,
              radialSegments: 6,
              material: dropMat,
              castShadow: false,
              receiveShadow: false,
              layer: GROUND_LAYER,
              name: `nstep-drop-${idx}`,
            }
          );
          this.arcGroup.add(drop);
        }

        this._arcNodeCoords.push({
          index: idx,
          label: idx === 0 ? 'sₜ' : `sₜ₊${subDigits[idx] || idx}`,
          tone: isHorizon ? 'amber' : 'teal',
          worldPos: p.clone(),
        });
      });

      // Bright amber-gold backward credit pulse gems gliding horizon -> s_t
      this._arcPulses = [];
      for (let k = 0; k < 2; k += 1) {
        const pulseGroup = new THREE.Group();
        const core = createLathedSolid(
          [
            [0.001, -0.075],
            [0.078, 0],
            [0.001, 0.075],
          ],
          {
            segments: 16,
            preset: 'ember',
            materialOverrides: {
              color: 0xf59e0b,
              emissive: 0xf59e0b,
              emissiveIntensity: 1.0,
            },
            castShadow: false,
            layer: GROUND_LAYER,
            name: `nstep-pulse-core-${k}`,
          }
        );
        const halo = createLathedSolid(
          [
            [0.001, -0.13],
            [0.135, 0],
            [0.001, 0.13],
          ],
          {
            segments: 16,
            preset: 'glass',
            materialOverrides: {
              color: 0xfbbf24,
              emissive: 0xf59e0b,
              emissiveIntensity: 0.55,
              opacity: 0.34,
            },
            castShadow: false,
            receiveShadow: false,
            layer: GROUND_LAYER,
            name: `nstep-pulse-halo-${k}`,
          }
        );
        pulseGroup.add(core, halo);
        this.arcGroup.add(pulseGroup);
        this._arcPulses.push(pulseGroup);
      }
    }

    if (this._arcCurve && this._arcPulses) {
      this._arcPulses.forEach((orb, idx) => {
        const u = 1 - ((pulsePhase + idx * 0.5) % 1);
        orb.position.copy(this._arcCurve.getPoint(clamp(u, 0, 1)));
      });
    }
  }

  _updatePathRibbon(group, cacheKeyName, cells, opts) {
    if (!cells || cells.length < 2) {
      if (this._lastRibbonKeys[cacheKeyName] !== '') {
        this._clearGroup(group, cacheKeyName === 'q' ? this._slipGroup : null);
        this._lastRibbonKeys[cacheKeyName] = '';
      }
      return;
    }

    const pts = cells.map(([r, c]) => {
      const p = this.getTileWorldPos(r, c);
      return new THREE.Vector3(p.x + opts.xShift, p.y + opts.yOffset, p.z + opts.xShift * 0.55);
    });
    const ySig = pts.map((p) => p.y.toFixed(2)).join(',');
    const key = `${cells.map((c) => c.join(',')).join(';')}|${opts.color}|${ySig}`;
    if (key === this._lastRibbonKeys[cacheKeyName]) return;
    this._lastRibbonKeys[cacheKeyName] = key;
    this._clearGroup(group, cacheKeyName === 'q' ? this._slipGroup : null);

    const conduit = createTaperedConduit(
      pts,
      (u) => opts.radius * (0.78 + 0.32 * Math.sin(u * Math.PI)),
      {
        tubularSegments: Math.max(20, cells.length * 6),
        radialSegments: 12,
        curveTension: 0.16,
        preset: opts.ghost ? 'glass' : 'ceramic',
        materialOverrides: {
          color: opts.color,
          emissive: opts.emissive ?? opts.color,
          emissiveIntensity: opts.emissiveIntensity ?? 0.22,
          roughness: opts.ghost ? 0.24 : 0.32,
          metalness: opts.ghost ? 0.08 : 0.14,
          transparent: true,
          opacity: opts.opacity,
          depthWrite: !opts.ghost,
        },
        castShadow: !opts.ghost,
        receiveShadow: !opts.ghost,
        layer: opts.layer ?? GROUND_LAYER,
        name: `ribbon-${cacheKeyName}`,
      }
    );
    group.add(conduit);

    // For Counterfactual Ghost paths, add subtle turned diamond-bead step pips
    if (opts.ghost) {
      for (let i = 1; i < pts.length - 1; i += 2) {
        const pip = createLathedSolid(
          [
            [0.001, -0.048],
            [0.056, 0],
            [0.001, 0.048],
          ],
          {
            segments: 14,
            preset: 'ember',
            materialOverrides: {
              color: opts.color,
              emissive: opts.emissive ?? opts.color,
              emissiveIntensity: 0.45,
              transparent: true,
              opacity: Math.min(0.88, opts.opacity + 0.22),
              depthWrite: false,
            },
            castShadow: false,
            receiveShadow: false,
            layer: GROUND_LAYER,
            name: `ghost-pip-${cacheKeyName}-${i}`,
          }
        );
        pip.position.copy(pts[i]);
        group.add(pip);
      }
    }
  }

  _updateSlipProbe(probe) {
    if (!probe || !probe.active || !probe.fromCell || !probe.toCell) {
      this._slipGroup.visible = false;
      return;
    }
    this._slipGroup.visible = true;
    const pFrom = this.getTileWorldPos(probe.fromCell[0], probe.fromCell[1]);
    const pToRaw = this.getTileWorldPos(probe.toCell[0], probe.toCell[1]);
    const pTo = new THREE.Vector3(pToRaw.x, this.tileBaseY - 0.14, pToRaw.z - 0.18);
    const mid = new THREE.Vector3((pFrom.x + pTo.x) * 0.5, Math.max(pFrom.y, pTo.y) + 0.44, (pFrom.z + pTo.z) * 0.5);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(pFrom.x, pFrom.y + 0.08, pFrom.z),
      mid,
      pTo
    );
    const key = `${probe.fromCell.join(',')}>${probe.toCell.join(',')}|${pFrom.y.toFixed(2)}`;
    if (key !== this._slipKey) {
      this._slipKey = key;
      if (this._slipArcMesh) {
        this._slipArcMesh.geometry?.dispose?.();
        this._slipArcMesh.material?.dispose?.();
        this._slipArcMesh.removeFromParent();
      }
      this._slipArcMesh = createTaperedConduit(curve, [0.036, 0.022], {
        tubularSegments: 24,
        radialSegments: 10,
        preset: 'ember',
        materialOverrides: {
          color: 0xdc2626,
          emissive: 0xef4444,
          emissiveIntensity: 0.72,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        },
        castShadow: false,
        receiveShadow: false,
        layer: GROUND_LAYER,
        name: 'slip-arc-conduit',
      });
      this._slipGroup.add(this._slipArcMesh);
    }
    const u = clamp(probe.progress ?? 0.85, 0, 1);
    const pt = curve.getPoint(u);
    this._slipGhostProbe.position.copy(pt);
    this._slipGhostProbe.rotation.x = u * 0.45; // Subtle tumble tilt toward abyss!
  }

  _updateTether(tether) {
    if (!tether || !tether.visible || !tether.fromCell || !tether.toWorld) {
      if (this._tetherMesh) this._tetherMesh.visible = false;
      if (this._tetherAnchorDot) this._tetherAnchorDot.visible = false;
      return;
    }
    const pFrom = this.getTileWorldPos(tether.fromCell[0], tether.fromCell[1]);
    const pTo = tether.toWorld;
    const key = `${pFrom.x.toFixed(2)},${pFrom.y.toFixed(2)},${pFrom.z.toFixed(2)}>${pTo.x.toFixed(2)},${pTo.y.toFixed(2)},${pTo.z.toFixed(2)}`;
    if (key !== this._tetherKey) {
      this._tetherKey = key;
      this._clearGroup(this.tetherGroup);
      const mid = new THREE.Vector3(
        lerp(pFrom.x, pTo.x, 0.45),
        lerp(pFrom.y, pTo.y, 0.62) + 0.35,
        lerp(pFrom.z, pTo.z, 0.45)
      );
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pFrom.x, pFrom.y + 0.12, pFrom.z),
        mid,
        pTo.clone()
      );
      this._tetherMesh = createTaperedConduit(curve, [0.032, 0.015], {
        tubularSegments: 28,
        radialSegments: 10,
        preset: 'ember',
        materialOverrides: {
          color: 0x149694,
          emissive: 0x2dd4bf,
          emissiveIntensity: 0.65,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        },
        castShadow: false,
        receiveShadow: false,
        layer: GROUND_LAYER,
        name: 'code-tether-conduit',
      });
      this._tetherAnchorDot = createLathedSolid(
        [
          [0.001, -0.055],
          [0.068, 0],
          [0.001, 0.055],
        ],
        {
          segments: 16,
          preset: 'ember',
          materialOverrides: { color: 0x2dd4bf, emissive: 0x14b8a6, emissiveIntensity: 0.8 },
          castShadow: false,
          layer: GROUND_LAYER,
          name: 'code-tether-anchor',
        }
      );
      this._tetherAnchorDot.position.set(pFrom.x, pFrom.y + 0.12, pFrom.z);
      this.tetherGroup.add(this._tetherMesh, this._tetherAnchorDot);
    }
    if (this._tetherMesh) this._tetherMesh.visible = true;
    if (this._tetherAnchorDot) this._tetherAnchorDot.visible = true;
  }

  _clearGroup(group, preserveChild = null) {
    for (let i = group.children.length - 1; i >= 0; i -= 1) {
      const ch = group.children[i];
      if (preserveChild && ch === preserveChild) continue;
      group.remove(ch);
      ch.traverse((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
        else node.material?.dispose?.();
      });
    }
  }

  getArcNodeTargets() {
    return this._arcNodeCoords;
  }
}

/**
 * Beat 5 Real-Data TD Fork Panel:
 * Single-step Sarsa vs Q-learning SVG schematic (>= 12px crisp legible labels!) +
 * live substituted targets + 100% proportional real-value 4-row target matrix.
 */
export class TdForkPanel {
  constructor(containerEl, { onInjectCliffDrop, onSelectMethod, linkBus = null } = {}) {
    this.container = containerEl;
    this.onInjectCliffDrop = onInjectCliffDrop;
    this.onSelectMethod = onSelectMethod;
    this.linkBus = linkBus;

    this.root = document.createElement('div');
    this.root.className = 'td-fork-panel';
    this.root.innerHTML = `
      <div class="fork-svg-card">
        <div class="fork-svg-head">
          <div class="fork-title-stack">
            <strong class="fork-title">TD Fork · 单步分叉</strong>
            <span class="fork-cell-badge" data-role="fork-cell"></span>
          </div>
          <button type="button" class="btn-chip fork-probe-btn">⚡ 崖边 ε 失足</button>
        </div>
        <div class="fork-svg-slot"></div>
      </div>
      <div class="formula-bars">
        <div class="formula-pill teal" data-link-id="fork-sarsa" tabindex="0">
          <div class="formula-head"><strong>Sarsa</strong><code>R + γ Q(S', A')</code></div>
          <div class="formula-sub" data-role="sarsa-sub"></div>
        </div>
        <div class="formula-pill amber" data-link-id="fork-q" tabindex="0">
          <div class="formula-head"><strong>Q-learn</strong><code>R + γ max Q(S', a)</code></div>
          <div class="formula-sub" data-role="q-sub"></div>
        </div>
      </div>
      <div class="unified-matrix" data-role="matrix"></div>
    `;
    this.svgSlot = this.root.querySelector('.fork-svg-slot');
    this.probeBtn = this.root.querySelector('.fork-probe-btn');
    this.sarsaSub = this.root.querySelector('[data-role="sarsa-sub"]');
    this.qSub = this.root.querySelector('[data-role="q-sub"]');
    this.matrixEl = this.root.querySelector('[data-role="matrix"]');
    this.titleEl = this.root.querySelector('.fork-title');
    this.cellBadgeEl = this.root.querySelector('[data-role="fork-cell"]');

    this.probeBtn.onclick = () => this.onInjectCliffDrop?.();

    if (this.linkBus) {
      this.root.querySelectorAll('[data-link-id]').forEach((el) => {
        const id = el.dataset.linkId;
        el.addEventListener('pointerenter', () => this.linkBus.hover(id, 'fork-panel'));
        el.addEventListener('pointerleave', () => {
          if (this.linkBus.hoveredId === id) this.linkBus.clearHover('fork-panel');
        });
      });
    }

    this.container.append(this.root);
  }

  update(snapshot) {
    const lang = snapshot.lang || 'zh';
    const f = snapshot.fork;
    const [r1, c1] = f.prevCell || [2, 2];
    const [r2, c2] = f.forkCell || [2, 3];

    this.titleEl.textContent = lang === 'en' ? 'TD Fork · Live Split' : 'TD 分叉 · 实时单步';
    this.cellBadgeEl.textContent = `(${r1},${c1}) ${f.prevActionLabel} (${r2},${c2})`;
    this.probeBtn.textContent = snapshot.forkProbeActive
      ? (lang === 'en' ? '↺ Normal Step' : '↺ 恢复常态步')
      : (lang === 'en' ? '⚡ Cliff ε-Slip' : '⚡ 注入崖边失足');
    this.probeBtn.setAttribute('aria-pressed', String(Boolean(snapshot.forkProbeActive)));

    this._renderForkSvg(f, snapshot);

    const fmtS = (v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
    this.sarsaSub.textContent = `${f.rNext} + ${snapshot.gamma.toFixed(2)}×(${f.sarsaNextQ.toFixed(1)}) = ${f.sarsaTarget.toFixed(1)} (Δ=${fmtS(f.sarsaDelta)})`;
    this.qSub.textContent = `${f.rNext} + ${snapshot.gamma.toFixed(2)}×(${f.qMaxNext.toFixed(1)}) = ${f.qTarget.toFixed(1)} (Δ=${fmtS(f.qDelta)})`;

    const rawTargets = [f.td0Target, f.sarsaTarget, snapshot.nStepTarget, f.qTarget];
    const lo = Math.min(-25, ...rawTargets);
    const hi = Math.max(10, ...rawTargets);
    const span = Math.max(1e-3, hi - lo);
    const pctFromRealValue = (v) => Math.round(clamp(((v - lo) / span) * 86 + 10, 8, 100));

    const rows = [
      { id: 'td0', beatIdx: 1, name: 'TD(0)', val: f.td0Target, pct: pctFromRealValue(f.td0Target), tone: 'teal' },
      { id: 'sarsa', beatIdx: 2, name: 'Sarsa', val: f.sarsaTarget, pct: pctFromRealValue(f.sarsaTarget), tone: f.cliffHit ? 'danger' : 'teal' },
      { id: 'nstep', beatIdx: 3, name: `n-step (${snapshot.nStep})`, val: snapshot.nStepTarget, pct: pctFromRealValue(snapshot.nStepTarget), tone: 'navy' },
      { id: 'qlearn', beatIdx: 4, name: 'Q-learning', val: f.qTarget, pct: pctFromRealValue(f.qTarget), tone: 'amber' },
    ];

    this.matrixEl.replaceChildren();
    for (const row of rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `matrix-row ${snapshot.activeMethod === row.id ? 'active' : ''}`;
      btn.onclick = () => this.onSelectMethod?.(row.beatIdx, row.id);
      btn.innerHTML = `
        <span class="m-name">${row.name}</span>
        <span class="m-bar-wrap"><span class="m-bar ${row.tone}" style="width:${row.pct}%"></span></span>
        <span class="m-val">${row.val.toFixed(1)}</span>
      `;
      this.matrixEl.append(btn);
    }
  }

  _renderForkSvg(f) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    // Generous 320x104 canvas so every label stays >= 12px at real desktop pixel size!
    svg.setAttribute('viewBox', '0 0 320 104');
    svg.setAttribute('class', 'fork-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Sarsa 与 Q-learning 单步分叉图');

    const cliffCol = f.cliffHit ? '#b83b3b' : '#0f766e';
    const sarsaEndLabel = f.cliffHit
      ? `${f.sarsaNextQ.toFixed(0)} ${f.sarsaActionLabel.slice(0, 1)}`
      : `${f.sarsaNextQ.toFixed(1)} (${f.sarsaActionLabel})`;
    const qEndLabel = `max ${f.qMaxNext.toFixed(1)}`;

    svg.innerHTML = `
      <path d="M 46 52 C 78 52, 92 26, 134 26 L 208 26" fill="none" stroke="${cliffCol}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M 46 52 C 78 52, 92 78, 134 78 L 208 78" fill="none" stroke="#c26a1b" stroke-width="2.6" stroke-linecap="round"/>

      <circle cx="26" cy="52" r="18" fill="var(--card, #faf4e8)" stroke="var(--navy, #18213d)" stroke-width="2.2"/>
      <text x="26" y="56.5" text-anchor="middle" font-size="12.5" font-weight="700" font-family="var(--font-mono)" fill="var(--navy, #18213d)">S,A</text>

      <text x="86" y="16" text-anchor="middle" font-size="12" font-weight="700" font-family="var(--font-sans)" fill="${cliffCol}">Sarsa</text>
      <circle cx="146" cy="26" r="14" fill="var(--card, #fffaf2)" stroke="${cliffCol}" stroke-width="2" stroke-dasharray="3.5 2"/>
      <text x="146" y="30.5" text-anchor="middle" font-size="12.5" font-weight="700" font-family="var(--font-mono)" fill="${cliffCol}">A'</text>

      <text x="84" y="96" text-anchor="middle" font-size="12" font-weight="700" font-family="var(--font-sans)" fill="#b8631a">Q-learn</text>
      <rect x="122" y="64" width="48" height="28" rx="6" fill="var(--amber-soft, #fbe8d5)" stroke="#c26a1b" stroke-width="2"/>
      <text x="146" y="82.5" text-anchor="middle" font-size="12" font-weight="800" font-family="var(--font-mono)" fill="#92400e">MAX</text>

      <rect x="210" y="12" width="104" height="28" rx="7" fill="${f.cliffHit ? 'var(--danger-soft, #fae1df)' : 'var(--teal-soft, #d9f1ef)'}" stroke="${cliffCol}" stroke-width="1.6"/>
      <text x="262" y="30.5" text-anchor="middle" font-size="12.5" font-weight="700" font-family="var(--font-mono)" fill="${cliffCol}">${sarsaEndLabel}</text>

      <rect x="210" y="64" width="104" height="28" rx="7" fill="var(--amber-soft, #fbe8d5)" stroke="#c26a1b" stroke-width="1.6"/>
      <text x="262" y="82.5" text-anchor="middle" font-size="12.5" font-weight="700" font-family="var(--font-mono)" fill="#92400e">${qEndLabel}</text>
    `;
    this.svgSlot.replaceChildren(svg);
  }
}

/**
 * Dark-slate 6-line live Python execution trace card (zero horizontal truncation!).
 * Supports standalone DOM mounting AND 3D diegetic `HtmlSurfaceManager` mounting (`CodeTraceSurface`).
 */
export class CodeTraceCard {
  constructor(containerEl = null, { linkBus = null, surfaceMode = false } = {}) {
    this.container = containerEl;
    this.linkBus = linkBus;
    this.surfaceMode = Boolean(surfaceMode);
    this._lastSig = '';

    this.card = document.createElement('section');
    this.card.className = `code-trace-card ${this.surfaceMode ? 'is-diegetic-surface' : ''}`;
    this.card.setAttribute('aria-label', '实时同步 Python 更新轨迹');
    this.card.innerHTML = `
      <header class="code-trace-head">
        <span class="code-trace-title">Python · Live Step</span>
        <span class="code-trace-watch"></span>
      </header>
      <div class="code-trace-lines"></div>
    `;
    this.titleEl = this.card.querySelector('.code-trace-title');
    this.watchEl = this.card.querySelector('.code-trace-watch');
    this.linesEl = this.card.querySelector('.code-trace-lines');

    if (this.container) {
      this.container.append(this.card);
    }
  }

  getElement() {
    return this.card;
  }

  update({ title = '', lines = [], activeLine = 0, watch = '', lineLinks = [] } = {}) {
    const sig = `${title}|${watch}|${activeLine}|${lines.join('\n')}`;
    if (sig === this._lastSig) return false;
    this._lastSig = sig;

    if (title) this.titleEl.textContent = title;
    this.watchEl.textContent = watch;
    this.linesEl.replaceChildren();
    lines.forEach((txt, idx) => {
      const row = document.createElement('div');
      const lineNum = idx + 1;
      row.className = `code-line ${lineNum === activeLine ? 'active' : ''}`;
      const linkId = lineLinks[idx] || null;
      if (linkId && this.linkBus) {
        row.dataset.linkId = linkId;
        row.style.cursor = 'pointer';
        row.addEventListener('pointerenter', () => this.linkBus.hover(linkId, 'code-trace'));
        row.addEventListener('pointerleave', () => {
          if (this.linkBus.hoveredId === linkId) this.linkBus.clearHover('code-trace');
        });
      }
      const num = document.createElement('span');
      num.className = 'code-ln';
      num.textContent = String(lineNum);
      const code = document.createElement('code');
      code.textContent = txt;
      row.append(num, code);
      this.linesEl.append(row);
    });
    return true;
  }
}

/**
 * Diegetic 3D HTML-in-Canvas Code Trace Slate powered by `stage.htmlSurfaces`.
 * Mounted strictly on `SURFACE_LAYER` (bypasses secondary ACES/Neutral tone-mapping dimming)
 * and aligned cleanly front-facing to the camera (zero blurry oblique skew tilt!).
 */
export class CodeTraceSurface {
  constructor(stage, { id = 'code-trace-3d', linkBus = null, worldWidth = 5.35, worldHeight = 2.38 } = {}) {
    this.stage = stage;
    this.id = id;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this._wasVisible = false;
    this.codeCard = new CodeTraceCard(null, { linkBus, surfaceMode: true });
    this.el = this.codeCard.getElement();
    this.el.dataset.hudHidden = 'true';
    // Diegetic 3D stage object inside <canvas content="drawable">, NOT an outer HUD panel
    this.el.dataset.exportRole = 'stage';

    this.surface = stage.htmlSurfaces.mount(id, this.el, {
      worldWidth,
      worldHeight,
      mode: 'interactive',
      opacity: 1,
      layer: SURFACE_LAYER,
    });
    this.mesh = this.surface.mesh;
    this.mesh.visible = false;
    this.surface.setVisible(false);
    this.stage.scene.add(this.mesh);

    this._tetherAnchor = new THREE.Vector3();
  }

  /** Align slate dead-on facing camera (0 rad skew -> razor-sharp 1:1 HiDPI text!). */
  syncPose(camera, worldCenter = [-0.45, 3.72, -2.55]) {
    if (!camera) return this._tetherAnchor;
    this.mesh.position.set(worldCenter[0], worldCenter[1], worldCenter[2]);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.updateMatrixWorld(true);

    // Bottom-center anchor so the glowing 3D tether rises cleanly from the active tile into the slate
    this._tetherAnchor.set(0, -this.worldHeight * 0.49, 0).applyMatrix4(this.mesh.matrixWorld);
    return this._tetherAnchor;
  }

  update(payload) {
    const changed = this.codeCard.update(payload);
    if (changed) {
      this.surface.markDirty();
      this.stage.requestRender?.();
    }
    return changed;
  }

  setChoreoState(state) {
    const visible = Boolean(state.visible);
    this.el.dataset.hudHidden = visible ? 'false' : 'true';
    this.surface.setVisible(visible);
    this.surface.setOpacity(state.opacity);
    if (visible && !this._wasVisible) {
      this.surface.markDirty();
      this.stage.htmlSurfaces?.requestPaint?.();
      this.stage.htmlSurfaces?.syncPaint?.(null);
      this.stage.requestRender?.();
    }
    this._wasVisible = visible;
  }

  dispose() {
    this.surface.unmount();
  }
}
