import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GROUND_LAYER, SOLID_LAYER } from '../kit/outline-pass.js';

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

/**
 * Draw one 256x256 high-DPI tile face into a 2D canvas context.
 * Supports:
 * - 'start' / 'goal' archival keycaps (Goal +10)
 * - 'clean' neutral tile with optional Beat 1 exploration trail glow
 * - 'v' scalar V(s) value heatmap with crisp numeric readout
 * - 'q' 4-triangle directional Q(s,a) facets with smooth morph progress `qMorph` (0..1)
 * - 'cliff' sunken crimson -100 hazard pit face
 */
export function drawTileFace(ctx, state) {
  const W = 256;
  const H = 256;
  const kind = state.kind || 'normal';
  const mode = state.mode || 'q';
  const lang = state.lang || 'zh';
  const qMorph = state.qMorph !== undefined ? clamp(state.qMorph, 0, 1) : 1;
  const linkRole = state.linkRole || null; // 'src' (teal V(S)) | 'dst' (amber V(S')) | 'fork'

  ctx.clearRect(0, 0, W, H);

  // Start & Goal keycaps
  if (kind === 'start' || kind === 'goal') {
    const isGoal = kind === 'goal';
    ctx.fillStyle = isGoal ? '#f6e7c6' : '#f4eee2';
    ctx.fillRect(0, 0, W, H);

    // Subtle corner accent stripe
    ctx.fillStyle = isGoal ? 'rgba(201, 109, 36, 0.16)' : 'rgba(20, 150, 148, 0.14)';
    ctx.fillRect(10, 10, W - 20, 32);

    ctx.strokeStyle = state.selected || linkRole ? '#0f766e' : isGoal ? '#b8631a' : '#24304a';
    ctx.lineWidth = state.selected || linkRole ? 14 : 8;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.fillStyle = isGoal ? '#92400e' : '#18213d';
    ctx.font = '800 76px "Segoe UI", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGoal ? 'G' : 'S', W / 2, H / 2 - 8);

    ctx.fillStyle = isGoal ? '#9a4f10' : '#475569';
    ctx.font = '700 24px "Cascadia Code", monospace';
    ctx.fillText(isGoal ? (lang === 'en' ? '+10 GOAL' : '+10 终点') : (lang === 'en' ? 'START' : '起点'), W / 2, H / 2 + 64);
    return;
  }

  // Sunken crimson -100 cliff tile face
  if (state.isCliff && (state.cliffCarve ?? 1) > 0.25) {
    const k = clamp((state.cliffCarve - 0.25) / 0.75, 0, 1);
    ctx.fillStyle = lerpColorHex('#d9c7bc', '#731e18', k);
    ctx.fillRect(0, 0, W, H);

    // Subtle architectural hazard hatch
    ctx.save();
    ctx.strokeStyle = `rgba(254, 215, 208, ${(0.14 * k).toFixed(2)})`;
    ctx.lineWidth = 10;
    for (let d = -W; d < W * 2; d += 46) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d - H, H);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = state.hovered ? '#fda4af' : '#4a120e';
    ctx.lineWidth = state.hovered ? 12 : 6;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    // Show individual -100 badge on custom-painted upper cliffs (or standalone cliff cells)
    if (state.showIndivCliffLabel) {
      ctx.fillStyle = `rgba(255, 228, 224, ${(0.95 * k).toFixed(2)})`;
      ctx.font = '800 58px "Cascadia Code", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('-100', W / 2, H / 2);
    }
    return;
  }

  // Beat 1: Clean sparse neutral archival tile (with optional exploration trail glow)
  if (mode === 'clean') {
    const trail = clamp(state.trailGlow || 0, 0, 1);
    ctx.fillStyle = trail > 0.01 ? lerpColorHex('#f4efe4', '#dcefe9', trail * 0.85) : '#f4efe4';
    ctx.fillRect(0, 0, W, H);

    if (trail > 0.05) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 22 + trail * 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(20, 150, 148, ${(0.22 * trail).toFixed(2)})`;
      ctx.fill();
    }

    ctx.strokeStyle = state.selected ? '#0f766e' : state.hovered ? '#c96d24' : '#c6baa6';
    ctx.lineWidth = state.selected || state.hovered ? 10 : 5;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    ctx.fillStyle = '#8b8376';
    ctx.font = '600 22px "Cascadia Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`(${state.row},${state.col})`, W / 2, H - 30);
    return;
  }

  // Beat 2: Scalar V(s) value heatmap
  if (mode === 'v' || (mode === 'q' && qMorph <= 0.04)) {
    const vVal = state.v ?? 0;
    const norm = clamp((vVal + 4.5) / 14.5, 0, 1);
    const fillCol = norm >= 0.35
      ? lerpColorHex('#f4efe4', '#8fd6c7', (norm - 0.35) / 0.65)
      : lerpColorHex('#f0d4c8', '#f4efe4', norm / 0.35);
    ctx.fillStyle = fillCol;
    ctx.fillRect(0, 0, W, H);

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
    ctx.lineWidth = linkRole || state.selected ? 16 : 5;
    ctx.strokeRect(7, 7, W - 14, H - 14);

    if (linkRole === 'src' || linkRole === 'dst') {
      ctx.fillStyle = linkRole === 'src' ? '#0f766e' : '#c96d24';
      ctx.fillRect(14, 14, 72, 34);
      ctx.fillStyle = '#fffaf2';
      ctx.font = '800 22px "Cascadia Code", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(linkRole === 'src' ? 'S' : "S'", 50, 32);
    }

    ctx.fillStyle = '#18213d';
    ctx.font = '700 48px "Cascadia Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sign = vVal > 0.05 ? '+' : '';
    ctx.fillText(`${sign}${vVal.toFixed(1)}`, W / 2, H / 2 - 4);

    ctx.fillStyle = '#475569';
    ctx.font = '600 20px "Cascadia Code", monospace';
    ctx.fillText(`(${state.row},${state.col})`, W / 2, H - 28);
    return;
  }

  // Beat 3+: 4-triangle directional Q(s,a) facets (0: UP, 1: RIGHT, 2: DOWN, 3: LEFT)
  const q = state.q || [0, 0, 0, 0];
  const colorFacet = (val) => {
    if (val <= -25) return '#e89d93';
    const norm = clamp((val + 14) / 24, 0, 1);
    return norm >= 0.5
      ? lerpColorHex('#f4efe4', '#a2d9cd', (norm - 0.5) * 2)
      : lerpColorHex('#f0d4c6', '#f4efe4', norm * 2);
  };

  // Base fill (blends cleanly during qMorph 0 -> 1)
  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, W, H);

  const polys = [
    [[0, 0], [W, 0], [W / 2, H / 2]],       // 0 UP
    [[W, 0], [W, H], [W / 2, H / 2]],       // 1 RIGHT
    [[W, H], [0, H], [W / 2, H / 2]],       // 2 DOWN
    [[0, H], [0, 0], [W / 2, H / 2]],       // 3 LEFT
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
    ctx.fillStyle = colorFacet(q[idx]);
    ctx.fill();

    if (idx === best && (state.highlighted || state.selected || linkRole)) {
      ctx.fillStyle = 'rgba(15, 118, 110, 0.16)';
      ctx.fill();
    }
  });

  // Diagonal X bevel seams
  ctx.strokeStyle = '#334059';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, H);
  ctx.moveTo(W, 0);
  ctx.lineTo(0, H);
  ctx.stroke();

  if (state.showValues || state.selected || state.isForkCell) {
    const centers = [
      [W / 2, 40],
      [W - 44, H / 2],
      [W / 2, H - 38],
      [44, H / 2],
    ];
    ctx.font = '700 22px "Cascadia Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    q.forEach((val, idx) => {
      const [cx, cy] = centers[idx];
      ctx.fillStyle = val <= -25 ? '#8f1d14' : idx === best ? '#0f5c55' : '#2c374c';
      ctx.fillText(val <= -50 ? '-100' : val.toFixed(1), cx, cy);
    });
  }

  // Center arrow medallion
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 33, 0, Math.PI * 2);
  ctx.fillStyle = state.isForkCell ? '#fef3c7' : state.selected ? '#e6f5f2' : 'rgba(250, 245, 236, 0.94)';
  ctx.fill();
  ctx.strokeStyle = state.isForkCell ? '#c96d24' : state.selected ? '#0f766e' : '#24304a';
  ctx.lineWidth = 4.5;
  ctx.stroke();

  const angleMap = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angleMap[best] || 0);
  ctx.strokeStyle = state.isForkCell ? '#b85c14' : state.highlighted ? '#0f766e' : '#18213d';
  ctx.lineWidth = 7;
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
  ctx.lineWidth = state.isForkCell || state.selected || linkRole ? 16 : 6;
  ctx.strokeRect(5, 5, W - 10, H - 10);
}

/**
 * Reusable beveled tile canvas texture with key-based caching (zero redundant uploads).
 */
export function createBeveledGridTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let lastKey = '';
  return {
    texture: tex,
    update(state, key = null) {
      if (key !== null && key === lastKey) return false;
      lastKey = key ?? '';
      drawTileFace(ctx, state);
      tex.needsUpdate = true;
      return true;
    },
    dispose() {
      tex.dispose();
    },
  };
}

function makeChasmBannerTex(text = '-100   CLIFF') {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  // Subtle dark crimson pill backing so -100 pops with razor contrast
  ctx.fillStyle = 'rgba(72, 14, 12, 0.72)';
  ctx.beginPath();
  ctx.roundRect(128, 34, 512, 124, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(254, 202, 202, 0.45)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#fee2e2';
  ctx.font = '800 72px "Cascadia Code", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Simulify v2 4D Anodized Instrument Tray for 4x8 Cliff Walking.
 *
 * Pure function of master time `t` (zero stateful lagging springs or performance.now() loops!).
 * Exposes separate choreographed actor groups so `ActorChoreographer` achieves true `t=0` sparsity
 * (`visibleActors(0) = 3`) and progressive 6-beat physical reveal:
 *   - `deckGroup` (base anodized chassis + 30 flat walkable tiles)
 *   - `endpointsGroup` (Start S + Goal G +10)
 *   - `puckGroup` (metallic agent puck)
 *   - `walkTrailGroup` (Beat 1 warm exploration footprints)
 *   - `wavefrontGroup` (Beat 2 backward TD(0) credit pulse S' -> S)
 *   - `chasmSignGroup` (Beat 3 sunken crimson -100 chasm signage)
 *   - `arcGroup` (Beat 4 frosted glass n-step return arc + traveling credit beads)
 *   - `sarsaRibbonGroup` (Beat 5 live solid teal Sarsa safe path)
 *   - `qGhostRibbonGroup` (Beat 5 translucent amber Counterfactual Ghost Q-learning path + slip probe)
 *   - `customGhostGroup` (Counterfactual Ghost path before custom cliff painting)
 *   - `tetherGroup` (Beat 6 glowing tether from active cell to 3D HTML-in-Canvas code slate)
 */
export class CliffInstrumentTray {
  constructor(stage, { rows = 4, cols = 8 } = {}) {
    this.stage = stage;
    this.rows = rows;
    this.cols = cols;
    this.pitch = 1.06;
    this.tileSize = 0.98;
    this.tileH = 0.24;
    this.tileBaseY = 0.34;
    this.tiles = new Map();
    this._brushTargets = [];
    this._arcNodeCoords = [];
    this._lastRibbonKeys = { sarsa: '', q: '', custom: '', arc: '', walk: '' };

    // Choreographed 3D actor roots
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
    this.walkTrailGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.walkTrailGroup);

    this.wavefrontGroup = new THREE.Group();
    this.wavefrontGroup.name = 'td-wavefront';
    this.wavefrontGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.wavefrontGroup);

    this.chasmSignGroup = new THREE.Group();
    this.chasmSignGroup.name = 'cliff-chasm';
    this.chasmSignGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.chasmSignGroup);

    this.arcGroup = new THREE.Group();
    this.arcGroup.name = 'nstep-arc';
    this.arcGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.arcGroup);

    this.sarsaRibbonGroup = new THREE.Group();
    this.sarsaRibbonGroup.name = 'sarsa-ribbon';
    this.sarsaRibbonGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.sarsaRibbonGroup);

    this.qGhostRibbonGroup = new THREE.Group();
    this.qGhostRibbonGroup.name = 'q-ghost-ribbon';
    this.qGhostRibbonGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.qGhostRibbonGroup);

    this.customGhostGroup = new THREE.Group();
    this.customGhostGroup.name = 'custom-ghost';
    this.customGhostGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.customGhostGroup);

    this.tetherGroup = new THREE.Group();
    this.tetherGroup.name = 'code-tether';
    this.tetherGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.tetherGroup);

    this._buildHardwareDeck();
    this._buildAllTiles();
    this._buildChasmSignage();
    this._buildAgentPuck();
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
      return new THREE.Vector3(tile.group.position.x, tile.group.position.y + this.tileH / 2, tile.group.position.z);
    }
    const w = this.cellToWorld(row, col);
    return new THREE.Vector3(w.x, this.tileBaseY + this.tileH / 2, w.z);
  }

  _buildHardwareDeck() {
    const aluMat = new THREE.MeshStandardMaterial({ color: '#c8cdd3', roughness: 0.34, metalness: 0.45 });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#273142', roughness: 0.44, metalness: 0.28 });
    const bedMat = new THREE.MeshStandardMaterial({ color: '#1b2434', roughness: 0.56, metalness: 0.2 });
    const screwMat = new THREE.MeshStandardMaterial({ color: '#8f9aa6', roughness: 0.25, metalness: 0.72 });

    const deckW = this.cols * this.pitch + 0.92;
    const deckD = this.rows * this.pitch + 0.92;

    const alu = new THREE.Mesh(new RoundedBoxGeometry(deckW, 0.14, deckD, 4, 0.12), aluMat);
    alu.position.set(0, 0.07, 0);
    alu.castShadow = true;
    alu.receiveShadow = true;
    this.deckGroup.add(alu);

    const wallT = 0.34;
    const bezelY = 0.28;
    const bezelH = 0.22;
    const addRail = (w, d, x, z) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, bezelH, d, 3, 0.05), frameMat);
      m.position.set(x, bezelY, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.deckGroup.add(m);
    };
    const innerW = this.cols * this.pitch + 0.08;
    const innerD = this.rows * this.pitch + 0.08;
    addRail(innerW + wallT * 2, wallT, 0, -(innerD / 2 + wallT / 2));
    addRail(innerW + wallT * 2, wallT, 0, innerD / 2 + wallT / 2);
    addRail(wallT, innerD, -(innerW / 2 + wallT / 2), 0);
    addRail(wallT, innerD, innerW / 2 + wallT / 2, 0);

    // Deep charcoal recessed chassis floor under all 32 tiles
    const floorBed = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.1, innerD), bedMat);
    floorBed.position.set(0, 0.15, 0);
    floorBed.receiveShadow = true;
    this.deckGroup.add(floorBed);

    // Corner precision hex bolts
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12), screwMat);
        bolt.position.set(sx * (deckW / 2 - 0.18), 0.21, sz * (deckD / 2 - 0.18));
        this.deckGroup.add(bolt);
      }
    }
  }

  _buildAllTiles() {
    const capGeo = new RoundedBoxGeometry(this.tileSize, this.tileH, this.tileSize, 2, 0.055);
    const faceGeo = new THREE.PlaneGeometry(this.tileSize - 0.05, this.tileSize - 0.05);
    const normalBodyMat = new THREE.MeshStandardMaterial({ color: '#ddd5c5', roughness: 0.44, metalness: 0.08 });
    const cliffBodyMat = new THREE.MeshStandardMaterial({
      color: '#731e18',
      emissive: '#380907',
      emissiveIntensity: 0.18,
      roughness: 0.58,
      metalness: 0.1,
    });
    const endpointBodyMat = new THREE.MeshStandardMaterial({ color: '#e6dcc8', roughness: 0.38, metalness: 0.1 });

    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const pos = this.cellToWorld(r, c);
        const kind = r === 3 && c === 0 ? 'start' : r === 3 && c === this.cols - 1 ? 'goal' : 'normal';
        const isEnd = kind !== 'normal';

        const group = new THREE.Group();
        group.position.set(pos.x, this.tileBaseY, pos.z);
        group.userData.cell = { row: r, col: c, key: `${r},${c}`, kind };

        const body = new THREE.Mesh(capGeo, isEnd ? endpointBodyMat : normalBodyMat);
        body.castShadow = false;
        body.receiveShadow = true;
        body.layers.set(SOLID_LAYER);
        group.add(body);

        const texHolder = createBeveledGridTileTexture();
        const faceMat = new THREE.MeshBasicMaterial({ map: texHolder.texture });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.rotation.x = -Math.PI / 2;
        face.position.y = this.tileH / 2 + 0.002;
        face.layers.set(SOLID_LAYER);
        group.add(face);

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
          normalBodyMat,
          cliffBodyMat,
          texHolder,
          baseX: pos.x,
          baseZ: pos.z,
        });
      }
    }

    // Subtle Goal beacon ring on GROUND_LAYER (part of endpointsGroup)
    const goalPos = this.cellToWorld(3, this.cols - 1);
    const goalRingGeo = new THREE.RingGeometry(0.46, 0.54, 36);
    goalRingGeo.rotateX(-Math.PI / 2);
    this._goalBeacon = new THREE.Mesh(
      goalRingGeo,
      new THREE.MeshBasicMaterial({ color: '#c96d24', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    this._goalBeacon.position.set(goalPos.x, this.tileBaseY + this.tileH / 2 + 0.012, goalPos.z);
    this._goalBeacon.layers.set(GROUND_LAYER);
    this.endpointsGroup.add(this._goalBeacon);
  }

  _buildChasmSignage() {
    const startP = this.cellToWorld(3, 1);
    const endP = this.cellToWorld(3, this.cols - 2);
    const chasmW = endP.x - startP.x + this.tileSize + 0.04;
    const chasmD = this.tileSize + 0.02;
    const cx = (startP.x + endP.x) / 2;
    const cz = startP.z;

    this._chasmBannerMat = new THREE.MeshBasicMaterial({
      map: makeChasmBannerTex('-100  CLIFF'),
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    this._chasmBanner = new THREE.Mesh(
      new THREE.PlaneGeometry(chasmW * 0.78, chasmD * 0.76),
      this._chasmBannerMat
    );
    this._chasmBanner.rotation.x = -Math.PI / 2;
    this._chasmBanner.position.set(cx, this.tileBaseY - 0.195 + this.tileH / 2 + 0.014, cz);
    this._chasmBanner.layers.set(GROUND_LAYER);
    this.chasmSignGroup.add(this._chasmBanner);

    // Subtle glowing crimson north-rim edge strip along row 2/3 border
    this._cliffRimMat = new THREE.MeshBasicMaterial({
      color: '#dc2626',
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(chasmW, 0.028, 0.045), this._cliffRimMat);
    rim.position.set(cx, this.tileBaseY + this.tileH / 2 - 0.01, cz - chasmD / 2 - 0.02);
    rim.layers.set(GROUND_LAYER);
    this.chasmSignGroup.add(rim);
  }

  _buildAgentPuck() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.27, 0.12, 28),
      new THREE.MeshStandardMaterial({ color: '#18213d', roughness: 0.26, metalness: 0.48 })
    );
    base.castShadow = true;
    base.layers.set(SOLID_LAYER);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: '#d6dce3', roughness: 0.24, metalness: 0.65 })
    );
    collar.position.y = 0.075;
    collar.layers.set(SOLID_LAYER);

    this.puckCrownMat = new THREE.MeshStandardMaterial({
      color: '#2dd4bf',
      emissive: '#0f766e',
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.15,
    });
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.036, 14, 28), this.puckCrownMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.078;
    crown.layers.set(SOLID_LAYER);

    const haloGeo = new THREE.RingGeometry(0.30, 0.38, 32);
    haloGeo.rotateX(-Math.PI / 2);
    this.puckHaloMat = new THREE.MeshBasicMaterial({
      color: '#149694',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, this.puckHaloMat);
    halo.position.y = -0.052;
    halo.layers.set(GROUND_LAYER);

    this.puckGroup.add(base, collar, crown, halo);
    const sp = this.cellToWorld(3, 0);
    this.puckGroup.position.set(sp.x, this.tileBaseY + this.tileH / 2 + 0.068, sp.z);
  }

  _buildWavefrontVisuals() {
    // Glowing rings on S (teal) and S' (amber) + traveling TD error orb + curved arc
    const ringGeo = new THREE.RingGeometry(0.41, 0.50, 36);
    ringGeo.rotateX(-Math.PI / 2);

    this._wfSrcRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
    );
    this._wfSrcRing.layers.set(GROUND_LAYER);

    this._wfDstRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: '#c96d24', transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
    );
    this._wfDstRing.layers.set(GROUND_LAYER);

    this._wfOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 18, 18),
      new THREE.MeshBasicMaterial({ color: '#14b8a6', transparent: true, opacity: 0.96 })
    );
    this._wfOrb.layers.set(GROUND_LAYER);

    this._wfOrbGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 18, 18),
      new THREE.MeshBasicMaterial({ color: '#5eead4', transparent: true, opacity: 0.34, depthWrite: false })
    );
    this._wfOrbGlow.layers.set(GROUND_LAYER);

    this._wfArcMesh = null;
    this._wfArcKey = '';

    this.wavefrontGroup.add(this._wfSrcRing, this._wfDstRing, this._wfOrb, this._wfOrbGlow);
  }

  _buildSlipProbeVisuals() {
    this._slipGroup = new THREE.Group();
    this._slipGroup.layers.set(GROUND_LAYER);
    this._slipGroup.visible = false;

    // Translucent crimson ghost puck dropping cleanly to the rim (never hiding -100 banner!)
    this._slipGhostPuck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.22, 0.10, 24),
      new THREE.MeshBasicMaterial({ color: '#dc2626', transparent: true, opacity: 0.58, depthWrite: false })
    );
    this._slipGhostPuck.layers.set(GROUND_LAYER);
    this._slipGroup.add(this._slipGhostPuck);

    this._slipArcMesh = null;
    this._slipKey = '';
    this.qGhostRibbonGroup.add(this._slipGroup);
  }

  focusCell(row, col, zoom = 1.38) {
    const p = this.getTileWorldPos(row, col);
    this.stage.setHighlightRing(new THREE.Vector3(p.x, p.y + 0.015, p.z), 0.56, '#0f766e');
    this.stage.flyTo({ target: [p.x * 0.55, 0.45, p.z * 0.55], zoom: Math.max(this.stage.view.zoom, zoom) }, 380);
    return true;
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
      puckPos = null, // { row, col } or { x, y, z }
      puckTone = 'teal',
      slipProbe = null, // { active, fromCell, toCell, progress }
      tether = null, // { visible, fromCell, toWorld }
      lang = 'zh',
    } = rs;

    const sameCell = (a, r, c) => Boolean(a && a[0] === r && a[1] === c);

    // Check whether standard bottom cliff (3,1)..(3,6) is fully intact for wide banner vs individual -100 labels
    let standardChasmCount = 0;
    for (let c = 1; c < this.cols - 1; c += 1) {
      if (cliffMask?.[3]?.[c]) standardChasmCount += 1;
    }
    const useWideChasmBanner = standardChasmCount >= 4 && cliffCarve > 0.15;
    this._chasmBanner.visible = useWideChasmBanner;
    if (useWideChasmBanner) {
      this._chasmBannerMat.opacity = clamp((cliffCarve - 0.15) / 0.85, 0, 1) * 0.96;
      this._cliffRimMat.opacity = clamp(cliffCarve, 0, 1) * 0.82;
    }

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

    // 1. Update all 32 physical morphing tiles
    for (const tile of this.tiles.values()) {
      const { row, col, kind, group, body, texHolder } = tile;
      const isCliffCell = kind === 'normal' && Boolean(cliffMask?.[row]?.[col]);
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
      let bestA = 0;
      for (let a = 1; a < 4; a += 1) {
        if (qRow[a] > qRow[bestA] + 1e-6) bestA = a;
      }

      // Compute deterministic physical Y elevation
      let targetY = this.tileBaseY;
      if (isCliffCell && cliffCarve > 0.001) {
        targetY = this.tileBaseY - 0.195 * cliffCarve;
      } else if (kind === 'normal' && vLiftStrength > 0.001) {
        const vNorm = clamp((vVal + 3.0) / 13.0, 0, 1);
        targetY = this.tileBaseY + vNorm * 0.30 * vLiftStrength;
      }
      if (!isCliffCell && (isHovered || linkRole)) {
        targetY += 0.032;
      }
      group.position.y = targetY;

      // Swap tile bevel body material cleanly between neutral cream and deep crimson pit
      if (kind === 'normal') {
        const wantCliffMat = isCliffCell && cliffCarve > 0.45;
        body.material = wantCliffMat ? tile.cliffBodyMat : tile.normalBodyMat;
      }

      const isStdBottom = row === 3 && col >= 1 && col <= this.cols - 2;
      const showIndivCliffLabel = isCliffCell && (!useWideChasmBanner || !isStdBottom);
      const trailGlow = trailGlowMap.get(`${row},${col}`) || 0;
      const showValues = tileMode === 'q' && qMorph > 0.6 && (isSelected || isHovered || isForkCell);

      const qKey = tileMode === 'q'
        ? `${qRow[0].toFixed(1)},${qRow[1].toFixed(1)},${qRow[2].toFixed(1)},${qRow[3].toFixed(1)}`
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

    // Subtle deterministic pulse on Goal beacon ring driven purely by `t`
    this._goalBeacon.scale.setScalar(1 + 0.07 * Math.sin(t * 2.4));

    // 2. Beat 1 Exploration Trail ribbon
    this._updateWalkTrail(walkTrailCells, walkProgress);

    // 3. Beat 2 TD(0) Backward Credit Wavefront
    this._updateWavefront(wavefront);

    // 4. Beat 4+ Translucent Frosted-Glass n-step Return Arc
    this._updateGlassArc(arcNodes, arcReveal, arcPulsePhase);

    // 5. Beat 5+ Simultaneous Live Sarsa + Counterfactual Ghost Q-learning + Custom Cliff Ghost
    this._updatePathRibbon(this.sarsaRibbonGroup, 'sarsa', sarsaPath, {
      color: '#0f766e',
      opacity: 0.92,
      radius: 0.044,
      yOffset: 0.025,
      xShift: -0.05,
      ghost: false,
    });
    this._updatePathRibbon(this.qGhostRibbonGroup, 'q', qPath, {
      color: '#d97706',
      opacity: 0.56,
      radius: 0.042,
      yOffset: 0.042,
      xShift: 0.06,
      ghost: true,
    });
    this._updatePathRibbon(this.customGhostGroup, 'custom', customGhostPath, {
      color: '#6366f1',
      opacity: 0.44,
      radius: 0.036,
      yOffset: 0.072,
      xShift: 0.0,
      ghost: true,
    });

    // 6. Cliff-slip counterfactual probe visual (keeps solid puck clear of -100 banner!)
    this._updateSlipProbe(slipProbe);

    // 7. Pure deterministic Agent Puck placement
    if (puckPos) {
      if (puckPos.x !== undefined && puckPos.z !== undefined) {
        this.puckGroup.position.set(puckPos.x, puckPos.y ?? (this.tileBaseY + this.tileH / 2 + 0.068), puckPos.z);
      } else if (puckPos.row !== undefined && puckPos.col !== undefined) {
        const tp = this.getTileWorldPos(puckPos.row, puckPos.col);
        this.puckGroup.position.set(tp.x, tp.y + 0.068, tp.z);
      }
    }
    const crownColor = puckTone === 'amber' ? '#f59e0b' : puckTone === 'danger' ? '#f43f5e' : '#2dd4bf';
    const emissiveColor = puckTone === 'amber' ? '#b45309' : puckTone === 'danger' ? '#be123c' : '#0f766e';
    this.puckCrownMat.color.set(crownColor);
    this.puckCrownMat.emissive.set(emissiveColor);
    this.puckHaloMat.color.set(crownColor);

    // 8. Beat 6 tether connecting floating 3D HTML-in-Canvas code slate to active tile
    this._updateTether(tether);
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
    const key = `${cells.length}|${clampedP.toFixed(2)}`;
    if (key === this._lastRibbonKeys.walk) return;
    this._lastRibbonKeys.walk = key;
    this._clearGroup(this.walkTrailGroup);

    const exactIdx = clampedP * (cells.length - 1);
    const whole = Math.floor(exactIdx);
    const frac = exactIdx - whole;
    const pts = [];
    for (let i = 0; i <= whole; i += 1) {
      const p = this.getTileWorldPos(cells[i][0], cells[i][1]);
      pts.push(new THREE.Vector3(p.x, p.y + 0.032, p.z));
    }
    if (whole < cells.length - 1 && frac > 0.01) {
      const a = this.getTileWorldPos(cells[whole][0], cells[whole][1]);
      const b = this.getTileWorldPos(cells[whole + 1][0], cells[whole + 1][1]);
      pts.push(new THREE.Vector3(lerp(a.x, b.x, frac), lerp(a.y, b.y, frac) + 0.032, lerp(a.z, b.z, frac)));
    }
    if (pts.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.16);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(16, pts.length * 6), 0.034, 10, false),
      new THREE.MeshBasicMaterial({ color: '#149694', transparent: true, opacity: 0.65, depthWrite: false })
    );
    tube.layers.set(GROUND_LAYER);
    this.walkTrailGroup.add(tube);
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

    // Backward credit pulse travels FROM sNext (dst, amber) -> TO s (src, teal)
    const pSrc = this.getTileWorldPos(wf.toCell[0], wf.toCell[1]);
    const pDst = this.getTileWorldPos(wf.fromCell[0], wf.fromCell[1]);

    this._wfSrcRing.visible = true;
    this._wfDstRing.visible = true;
    this._wfOrb.visible = true;
    this._wfOrbGlow.visible = true;

    this._wfSrcRing.position.set(pSrc.x, pSrc.y + 0.018, pSrc.z);
    this._wfDstRing.position.set(pDst.x, pDst.y + 0.018, pDst.z);

    const mid = new THREE.Vector3(
      (pDst.x + pSrc.x) * 0.5,
      Math.max(pDst.y, pSrc.y) + 0.88,
      (pDst.z + pSrc.z) * 0.5
    );
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(pDst.x, pDst.y + 0.1, pDst.z),
      mid,
      new THREE.Vector3(pSrc.x, pSrc.y + 0.1, pSrc.z)
    );

    const key = `${wf.fromCell.join(',')}>${wf.toCell.join(',')}|${pDst.y.toFixed(2)}|${pSrc.y.toFixed(2)}`;
    if (key !== this._wfArcKey) {
      this._wfArcKey = key;
      if (this._wfArcMesh) {
        this._wfArcMesh.geometry?.dispose?.();
        this._wfArcMesh.material?.dispose?.();
        this._wfArcMesh.removeFromParent();
      }
      this._wfArcMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.044, 10, false),
        new THREE.MeshBasicMaterial({ color: '#0d9488', transparent: true, opacity: 0.84, depthWrite: false })
      );
      this._wfArcMesh.layers.set(GROUND_LAYER);
      this.wavefrontGroup.add(this._wfArcMesh);
    }
    if (this._wfArcMesh) this._wfArcMesh.visible = true;

    const u = clamp(wf.phase ?? 0.5, 0, 1);
    const orbPt = curve.getPoint(u);
    this._wfOrb.position.copy(orbPt);
    this._wfOrb.scale.setScalar(1.22);
    this._wfOrbGlow.position.copy(orbPt);
    const pulseScale = 1.05 + 0.42 * Math.sin(u * Math.PI);
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
    const nodeKey = `${nodes.map((c) => c.join(',')).join(';')}|${rQuant.toFixed(2)}`;
    if (nodeKey !== this._lastRibbonKeys.arc) {
      this._lastRibbonKeys.arc = nodeKey;
      this._clearGroup(this.arcGroup);
      this._arcNodeCoords = [];

      const span = nodes.length - 1;
      const pts = nodes.map((cell, idx) => {
        const u = idx / span;
        const tp = this.getTileWorldPos(cell[0], cell[1]);
        const archH = Math.sin(u * Math.PI) * (0.92 + Math.min(0.85, span * 0.16)) * rQuant;
        return new THREE.Vector3(tp.x, tp.y + 0.06 + archH, tp.z);
      });

      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.4);
      this._arcCurve = curve;

      // Frosted translucent glass tube on GROUND_LAYER (zero black outline artifacts)
      const glassMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.082, 16, false),
        new THREE.MeshPhysicalMaterial({
          color: '#e8f5f3',
          transparent: true,
          opacity: 0.46 * rQuant,
          roughness: 0.15,
          metalness: 0.04,
          depthWrite: false,
        })
      );
      glassMesh.layers.set(GROUND_LAYER);
      this.arcGroup.add(glassMesh);

      const coreMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.022, 10, false),
        new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.85 * rQuant, depthWrite: false })
      );
      coreMesh.layers.set(GROUND_LAYER);
      this.arcGroup.add(coreMesh);

      pts.forEach((p, idx) => {
        const isHorizon = idx === pts.length - 1;
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(isHorizon ? 0.095 : 0.078, 16, 16),
          new THREE.MeshStandardMaterial({
            color: isHorizon ? '#e68a2e' : '#149694',
            emissive: isHorizon ? '#b8631a' : '#0f766e',
            emissiveIntensity: 0.55,
            roughness: 0.22,
          })
        );
        bead.position.copy(p);
        bead.layers.set(GROUND_LAYER);
        this.arcGroup.add(bead);

        this._arcNodeCoords.push({
          index: idx,
          label: idx === 0 ? 's_t' : `s_{t+${idx}}`,
          tone: isHorizon ? 'amber' : 'teal',
          worldPos: p.clone(),
        });
      });

      // Backward credit pulse orbs gliding along the frosted arc from horizon -> s_t
      this._arcPulses = [];
      for (let k = 0; k < 2; k += 1) {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.068, 14, 14),
          new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.92, depthWrite: false })
        );
        orb.layers.set(GROUND_LAYER);
        this.arcGroup.add(orb);
        this._arcPulses.push(orb);
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

    const key = `${cells.map((c) => c.join(',')).join(';')}|${opts.color}`;
    if (key === this._lastRibbonKeys[cacheKeyName]) return;
    this._lastRibbonKeys[cacheKeyName] = key;
    this._clearGroup(group, cacheKeyName === 'q' ? this._slipGroup : null);

    const pts = cells.map(([r, c]) => {
      const p = this.getTileWorldPos(r, c);
      return new THREE.Vector3(p.x + opts.xShift, p.y + opts.yOffset, p.z + opts.xShift * 0.55);
    });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.14);

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(16, cells.length * 6), opts.radius, 10, false),
      new THREE.MeshBasicMaterial({
        color: opts.color,
        transparent: true,
        opacity: opts.opacity,
        depthWrite: !opts.ghost,
      })
    );
    tube.layers.set(GROUND_LAYER);
    group.add(tube);

    // For Counterfactual Ghost paths, add crisp translucent glass ring markers along steps
    if (opts.ghost) {
      const beadGeo = new THREE.SphereGeometry(0.056, 12, 12);
      const beadMat = new THREE.MeshBasicMaterial({
        color: opts.color,
        transparent: true,
        opacity: Math.min(0.85, opts.opacity + 0.2),
        depthWrite: false,
      });
      for (let i = 1; i < pts.length - 1; i += 2) {
        const b = new THREE.Mesh(beadGeo, beadMat);
        b.position.copy(pts[i]);
        b.layers.set(GROUND_LAYER);
        group.add(b);
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
    // Keep ghost slip target near the north edge of the cliff cell so it NEVER covers the centered -100 banner!
    const pTo = new THREE.Vector3(pToRaw.x, pToRaw.y + 0.12, pToRaw.z - 0.28);
    const mid = new THREE.Vector3((pFrom.x + pTo.x) * 0.5, Math.max(pFrom.y, pTo.y) + 0.42, (pFrom.z + pTo.z) * 0.5);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(pFrom.x, pFrom.y + 0.08, pFrom.z),
      mid,
      pTo
    );
    const key = `${probe.fromCell.join(',')}>${probe.toCell.join(',')}`;
    if (key !== this._slipKey) {
      this._slipKey = key;
      if (this._slipArcMesh) {
        this._slipArcMesh.geometry?.dispose?.();
        this._slipArcMesh.material?.dispose?.();
        this._slipArcMesh.removeFromParent();
      }
      this._slipArcMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 20, 0.032, 10, false),
        new THREE.MeshBasicMaterial({ color: '#dc2626', transparent: true, opacity: 0.78, depthWrite: false })
      );
      this._slipArcMesh.layers.set(GROUND_LAYER);
      this._slipGroup.add(this._slipArcMesh);
    }
    const u = clamp(probe.progress ?? 0.85, 0, 1);
    this._slipGhostPuck.position.copy(curve.getPoint(u));
  }

  _updateTether(tether) {
    if (!tether || !tether.visible || !tether.fromCell || !tether.toWorld) {
      if (this._tetherMesh) this._tetherMesh.visible = false;
      return;
    }
    const pFrom = this.getTileWorldPos(tether.fromCell[0], tether.fromCell[1]);
    const pTo = tether.toWorld;
    const key = `${pFrom.x.toFixed(2)},${pFrom.y.toFixed(2)},${pFrom.z.toFixed(2)}>${pTo.x.toFixed(2)},${pTo.y.toFixed(2)},${pTo.z.toFixed(2)}`;
    if (key !== this._tetherKey) {
      this._tetherKey = key;
      this._clearGroup(this.tetherGroup);
      const mid = new THREE.Vector3(lerp(pFrom.x, pTo.x, 0.5), Math.max(pFrom.y, pTo.y) + 0.45, lerp(pFrom.z, pTo.z, 0.5));
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pFrom.x, pFrom.y + 0.08, pFrom.z),
        mid,
        pTo.clone()
      );
      this._tetherMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.022, 8, false),
        new THREE.MeshBasicMaterial({ color: '#149694', transparent: true, opacity: 0.72, depthWrite: false })
      );
      this._tetherMesh.layers.set(GROUND_LAYER);
      const anchorDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 14, 14),
        new THREE.MeshBasicMaterial({ color: '#2dd4bf' })
      );
      anchorDot.position.set(pFrom.x, pFrom.y + 0.08, pFrom.z);
      anchorDot.layers.set(GROUND_LAYER);
      this.tetherGroup.add(this._tetherMesh, anchorDot);
    }
    if (this._tetherMesh) this._tetherMesh.visible = true;
  }

  _clearGroup(group, preserveChild = null) {
    for (let i = group.children.length - 1; i >= 0; i -= 1) {
      const ch = group.children[i];
      if (preserveChild && ch === preserveChild) continue;
      group.remove(ch);
      ch.geometry?.dispose?.();
      if (Array.isArray(ch.material)) ch.material.forEach((m) => m?.dispose?.());
      else ch.material?.dispose?.();
    }
  }

  getArcNodeTargets() {
    return this._arcNodeCoords;
  }
}

/**
 * Beat 5 Real-Data TD Fork Panel:
 * Single-step Sarsa vs Q-learning SVG schematic + live substituted targets + 100% proportional
 * real-value 4-row target matrix (ZERO hardcoded pct values!).
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

    // 100% real-value proportional bar mapping (zero hardcoded pct constants!)
    const rawTargets = [f.td0Target, f.sarsaTarget, snapshot.nStepTarget, f.qTarget];
    const lo = Math.min(-25, ...rawTargets);
    const hi = Math.max(10, ...rawTargets);
    const span = Math.max(1e-3, hi - lo);
    const pctFromRealValue = (v) => Math.round(clamp(((v - lo) / span) * 86 + 10, 8, 100));

    const rows = [
      { id: 'td0', beatIdx: 1, name: 'TD(0)', val: f.td0Target, pct: pctFromRealValue(f.td0Target), tone: 'teal' },
      { id: 'sarsa', beatIdx: 2, name: 'Sarsa', val: f.sarsaTarget, pct: pctFromRealValue(f.sarsaTarget), tone: f.cliffHit ? 'danger' : 'teal' },
      { id: 'nstep', beatIdx: 3, name: `n-step (n=${snapshot.nStep})`, val: snapshot.nStepTarget, pct: pctFromRealValue(snapshot.nStepTarget), tone: 'navy' },
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
    svg.setAttribute('viewBox', '0 0 284 88');
    svg.setAttribute('class', 'fork-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Sarsa 与 Q-learning 单步分叉图');

    const cliffCol = f.cliffHit ? '#b83b3b' : '#0f766e';
    const sarsaEndLabel = f.cliffHit ? `${f.sarsaNextQ.toFixed(0)} ${f.sarsaActionLabel.slice(0, 1)}` : `${f.sarsaNextQ.toFixed(1)} (${f.sarsaActionLabel})`;
    const qEndLabel = `max ${f.qMaxNext.toFixed(1)}`;

    svg.innerHTML = `
      <path d="M 38 44 C 72 44, 86 20, 130 20 L 190 20" fill="none" stroke="${cliffCol}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 38 44 C 72 44, 86 68, 130 68 L 190 68" fill="none" stroke="#c26a1b" stroke-width="2.5" stroke-linecap="round"/>

      <circle cx="24" cy="44" r="14" fill="#faf4e8" stroke="#18213d" stroke-width="2.1"/>
      <text x="24" y="48" text-anchor="middle" font-size="11" font-weight="700" fill="#18213d">S,A</text>

      <circle cx="130" cy="20" r="10.5" fill="#fffaf2" stroke="${cliffCol}" stroke-width="2" stroke-dasharray="3 2"/>
      <text x="130" y="24" text-anchor="middle" font-size="10" font-weight="700" fill="${cliffCol}">A'</text>
      <text x="84" y="13" text-anchor="middle" font-size="10" font-weight="700" fill="${cliffCol}">Sarsa</text>

      <polygon points="120,57 144,68 120,79" fill="#fbe8d5" stroke="#c26a1b" stroke-width="2"/>
      <text x="129" y="71.5" text-anchor="middle" font-size="8.5" font-weight="800" fill="#9a4f10">MAX</text>
      <text x="82" y="82" text-anchor="middle" font-size="10" font-weight="700" fill="#b8631a">Q-learn</text>

      <rect x="192" y="8" width="88" height="24" rx="6" fill="${f.cliffHit ? '#fae1df' : '#d9f1ef'}" stroke="${cliffCol}" stroke-width="1.5"/>
      <text x="236" y="24" text-anchor="middle" font-size="11" font-weight="700" fill="${cliffCol}">${sarsaEndLabel}</text>

      <rect x="192" y="56" width="88" height="24" rx="6" fill="#fbe8d5" stroke="#c26a1b" stroke-width="1.5"/>
      <text x="236" y="72" text-anchor="middle" font-size="11" font-weight="700" fill="#9a4f10">${qEndLabel}</text>
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
 * Native Chrome 157+ HTML-in-Canvas texture upload with seamless CSS matrix3d fallback on Firefox/Safari.
 */
export class CodeTraceSurface {
  constructor(stage, { id = 'code-trace-3d', linkBus = null, worldWidth = 4.9, worldHeight = 2.3 } = {}) {
    this.stage = stage;
    this.id = id;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.codeCard = new CodeTraceCard(null, { linkBus, surfaceMode: true });
    this.el = this.codeCard.getElement();
    this.el.dataset.hudHidden = 'true';
    this.el.dataset.exportRole = 'panel';

    // Custom PlaneGeometry with upright V-coordinate orientation for Chrome 157+ HTML-in-Canvas
    // (gl.texElementSubImage2D + TSL 1-uv.y inverts V on WebGL2; CSS matrix3d fallback only reads geometry bbox)
    const planeGeo = new THREE.PlaneGeometry(worldWidth, worldHeight);
    if (stage.htmlSurfaces?.nativeEnabled && stage.backendKind !== 'webgpu') {
      const uv = planeGeo.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) {
        uv.setY(i, 1 - uv.getY(i));
      }
      uv.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(
      planeGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.FrontSide })
    );
    mesh.layers.set(GROUND_LAYER);

    this.surface = stage.htmlSurfaces.mount(id, this.el, {
      mesh,
      worldWidth,
      worldHeight,
      mode: 'interactive',
      opacity: 1,
      layer: GROUND_LAYER,
    });
    this.mesh = this.surface.mesh;
    this.mesh.visible = false;
    this.surface.setVisible(false);
    this.stage.scene.add(this.mesh);

    this._tiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.07, 0));
    this._tetherAnchor = new THREE.Vector3();
  }

  /** Align slate cleanly facing camera in 3D space with a crisp subtle architectural tilt. */
  syncPose(camera, worldCenter = [5.15, 2.05, -0.35]) {
    if (!camera) return this._tetherAnchor;
    this.mesh.position.set(worldCenter[0], worldCenter[1], worldCenter[2]);
    this.mesh.quaternion.copy(camera.quaternion).multiply(this._tiltQuat);
    this.mesh.updateMatrixWorld(true);

    // Compute left-center world anchor for the glowing 3D tether beam
    this._tetherAnchor.set(-this.worldWidth * 0.48, -this.worldHeight * 0.12, 0).applyMatrix4(this.mesh.matrixWorld);
    return this._tetherAnchor;
  }

  update(payload) {
    const changed = this.codeCard.update(payload);
    if (changed) {
      this.surface.markDirty();
    }
    return changed;
  }

  setChoreoState(state) {
    this.el.dataset.hudHidden = state.visible ? 'false' : 'true';
    this.surface.setVisible(state.visible);
    this.surface.setOpacity(state.opacity);
  }

  dispose() {
    this.surface.unmount();
  }
}
