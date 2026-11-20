import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GROUND_LAYER, SOLID_LAYER } from '../kit/outline-pass.js';
import { Spring } from '../kit/spring.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function lerpColorHex(hexA, hexB, t) {
  const clampT = Math.max(0, Math.min(1, t));
  const pa = parseInt(hexA.slice(1), 16);
  const pb = parseInt(hexB.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * clampT);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * clampT);
  const b = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * clampT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draw one 256x256 high-DPI tile face into a 2D canvas context.
 * Supports keycaps (`start`/`goal`), scalar `V(s)` heat mode, and 4-triangle `Q(s,a)` action facets.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   row: number,
 *   col: number,
 *   kind?: 'normal'|'start'|'goal',
 *   mode?: 'v'|'q',
 *   v?: number,
 *   q?: [number, number, number, number],
 *   bestAction?: number,
 *   selected?: boolean,
 *   highlighted?: boolean,
 *   showValues?: boolean,
 *   lang?: 'zh'|'en'
 * }} state
 */
export function drawTileFace(ctx, state) {
  const W = 256;
  const H = 256;
  const kind = state.kind || 'normal';
  const mode = state.mode || 'q';
  const lang = state.lang || 'zh';

  ctx.clearRect(0, 0, W, H);

  if (kind === 'start' || kind === 'goal') {
    const isGoal = kind === 'goal';
    ctx.fillStyle = isGoal ? '#f4e6c8' : '#f4eee2';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = state.selected ? '#0f766e' : isGoal ? '#b8631a' : '#24304a';
    ctx.lineWidth = state.selected ? 14 : 8;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.fillStyle = '#18213d';
    ctx.font = '700 54px "Segoe UI", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGoal ? (lang === 'en' ? 'Goal' : 'Goal') : 'Start', W / 2, H / 2 - 6);

    ctx.fillStyle = isGoal ? '#9a4f10' : '#4a5568';
    ctx.font = '700 22px "Cascadia Code", monospace';
    ctx.fillText(isGoal ? (lang === 'en' ? '+0 END' : '+0 终点') : '(3, 0)', W / 2, H / 2 + 54);
    return;
  }

  if (mode === 'v') {
    const norm = Math.max(0, Math.min(1, ((state.v ?? -8) + 12) / 12));
    ctx.fillStyle = lerpColorHex('#f4dad0', '#cbe7df', norm);
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = state.selected ? '#0f766e' : '#3a465e';
    ctx.lineWidth = state.selected ? 14 : 5;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    ctx.fillStyle = '#18213d';
    ctx.font = '700 44px "Cascadia Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((state.v ?? 0).toFixed(1), W / 2, H / 2 - 6);

    ctx.fillStyle = '#4f5d75';
    ctx.font = '600 20px "Cascadia Code", monospace';
    ctx.fillText(`(${state.row},${state.col})`, W / 2, H - 30);
    return;
  }

  // Mode 'q': 4-triangle directional facets (0: UP, 1: RIGHT, 2: DOWN, 3: LEFT)
  const q = state.q || [-6, -6, -6, -6];
  const colorFacet = (val) => {
    if (val <= -25) return '#ebbab0';
    const norm = Math.max(0, Math.min(1, (val + 14) / 13.5));
    return norm >= 0.5
      ? lerpColorHex('#f3ede0', '#b9dfd6', (norm - 0.5) * 2)
      : lerpColorHex('#f2d6c9', '#f3ede0', norm * 2);
  };

  const polys = [
    [[0, 0], [W, 0], [W / 2, H / 2]],       // 0 UP
    [[W, 0], [W, H], [W / 2, H / 2]],       // 1 RIGHT
    [[W, H], [0, H], [W / 2, H / 2]],       // 2 DOWN
    [[0, H], [0, 0], [W / 2, H / 2]],       // 3 LEFT
  ];

  const best = state.bestAction ?? 1;
  polys.forEach((pts, idx) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fillStyle = colorFacet(q[idx]);
    ctx.fill();

    if (idx === best && state.highlighted) {
      ctx.fillStyle = 'rgba(15, 118, 110, 0.14)';
      ctx.fill();
    }
  });

  // Diagonal X seams & crisp border
  ctx.strokeStyle = '#334059';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, H);
  ctx.moveTo(W, 0);
  ctx.lineTo(0, H);
  ctx.stroke();

  if (state.showValues || state.selected) {
    const centers = [
      [W / 2, 42],
      [W - 44, H / 2],
      [W / 2, H - 40],
      [44, H / 2],
    ];
    ctx.font = '700 22px "Cascadia Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    q.forEach((val, idx) => {
      const [cx, cy] = centers[idx];
      ctx.fillStyle = val <= -25 ? '#9f231b' : idx === best ? '#0f5c55' : '#2c374c';
      ctx.fillText(val <= -50 ? '-100' : val.toFixed(1), cx, cy);
    });
  }

  // Center arrow disk for crisp legibility at oblique angles
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 34, 0, Math.PI * 2);
  ctx.fillStyle = state.selected ? '#e6f5f2' : 'rgba(250, 245, 236, 0.92)';
  ctx.fill();
  ctx.strokeStyle = state.selected ? '#0f766e' : '#24304a';
  ctx.lineWidth = 4;
  ctx.stroke();

  const angleMap = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angleMap[best] || 0);
  ctx.strokeStyle = state.highlighted ? '#0f766e' : '#18213d';
  ctx.fillStyle = state.highlighted ? '#0f766e' : '#18213d';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(0, -16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-12, -5);
  ctx.lineTo(0, -19);
  ctx.lineTo(12, -5);
  ctx.stroke();
  ctx.restore();

  // Outer selection or cell border
  ctx.strokeStyle = state.selected ? '#0f766e' : state.highlighted ? '#c26a1b' : '#273142';
  ctx.lineWidth = state.selected ? 16 : 6;
  ctx.strokeRect(4, 4, W - 8, H - 8);
}

/**
 * Create a reusable beveled tile texture holder with zero per-frame texture leaks.
 */
export function createBeveledGridTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return {
    texture: tex,
    update(state) {
      drawTileFace(ctx, state);
      tex.needsUpdate = true;
    },
    dispose() {
      tex.dispose();
    },
  };
}

function makeChasmLabelTex(text = '-100') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 160);
  ctx.fillStyle = 'rgba(248, 203, 195, 0.92)';
  ctx.font = '700 72px "Cascadia Code", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 82);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 2.5D Anodized Instrument Tray Primitive for 4x8 Cliff Walking + n-step 3D glass ribbon.
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
    this._arcMeshes = [];
    this._pathMeshes = [];
    this._arcNodeCoords = [];
    this._cliffFlash = 0;

    this.puckX = new Spring({ value: this.cellToWorld(3, 0).x, target: this.cellToWorld(3, 0).x, stiffness: 200, damping: 22 });
    this.puckY = new Spring({ value: 0.49, target: 0.49, stiffness: 260, damping: 20 });
    this.puckZ = new Spring({ value: this.cellToWorld(3, 0).z, target: this.cellToWorld(3, 0).z, stiffness: 200, damping: 22 });

    this.root = new THREE.Group();
    this.stage.scene.add(this.root);

    this.ribbonGroup = new THREE.Group();
    this.ribbonGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.ribbonGroup);

    this.arcGroup = new THREE.Group();
    this.arcGroup.layers.set(GROUND_LAYER);
    this.stage.scene.add(this.arcGroup);

    this._buildHardwareDeck();
    this._buildChasm();
    this._buildTiles();
    this._buildAgentPuck();

    this.stage.onFrame((now, dt) => this._tick(now, dt));
  }

  cellToWorld(row, col) {
    return {
      x: (col - (this.cols - 1) / 2) * this.pitch,
      z: (row - (this.rows - 1) / 2) * this.pitch,
    };
  }

  _buildHardwareDeck() {
    const aluMat = new THREE.MeshStandardMaterial({ color: '#c8cdd3', roughness: 0.36, metalness: 0.44 });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#273142', roughness: 0.44, metalness: 0.28 });
    const bedMat = new THREE.MeshStandardMaterial({ color: '#1b2434', roughness: 0.56, metalness: 0.2 });
    const screwMat = new THREE.MeshStandardMaterial({ color: '#8f9aa6', roughness: 0.25, metalness: 0.72 });

    const deckW = this.cols * this.pitch + 0.92;
    const deckD = this.rows * this.pitch + 0.92;

    // Lower brushed aluminum chassis (kept below recessed chasm floor y=0.175)
    const alu = new THREE.Mesh(new RoundedBoxGeometry(deckW, 0.14, deckD, 4, 0.12), aluMat);
    alu.position.set(0, 0.07, 0);
    alu.castShadow = true;
    alu.receiveShadow = true;
    this.root.add(alu);

    // Charcoal bezel frame perimeter rails (leaving cliff cols 1..6 row 3 recessed!)
    const wallT = 0.34;
    const bezelY = 0.28;
    const bezelH = 0.22;
    const addRail = (w, d, x, z) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, bezelH, d, 3, 0.05), frameMat);
      m.position.set(x, bezelY, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
    };
    const innerW = this.cols * this.pitch + 0.08;
    const innerD = this.rows * this.pitch + 0.08;
    addRail(innerW + wallT * 2, wallT, 0, -(innerD / 2 + wallT / 2));
    addRail(innerW + wallT * 2, wallT, 0, innerD / 2 + wallT / 2);
    addRail(wallT, innerD, -(innerW / 2 + wallT / 2), 0);
    addRail(wallT, innerD, innerW / 2 + wallT / 2, 0);

    // Solid sub-bed for rows 0..2 + Start (3,0) + Goal (3,7)
    const upperBedD = 3 * this.pitch + 0.06;
    const upperBed = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.14, upperBedD), bedMat);
    upperBed.position.set(0, 0.18, -this.pitch * 0.5);
    upperBed.receiveShadow = true;
    this.root.add(upperBed);

    for (const col of [0, this.cols - 1]) {
      const p = this.cellToWorld(3, col);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(this.pitch, 0.14, this.pitch), bedMat);
      pod.position.set(p.x, 0.18, p.z);
      pod.receiveShadow = true;
      this.root.add(pod);
    }

    // Precision hex bolts on aluminum flange
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12), screwMat);
        bolt.position.set(sx * (deckW / 2 - 0.18), 0.21, sz * (deckD / 2 - 0.18));
        this.root.add(bolt);
      }
    }
  }

  _buildChasm() {
    const startP = this.cellToWorld(3, 1);
    const endP = this.cellToWorld(3, this.cols - 2);
    const chasmW = (endP.x - startP.x) + this.tileSize + 0.04;
    const chasmD = this.tileSize + 0.02;
    const cx = (startP.x + endP.x) / 2;
    const cz = startP.z;

    this._chasmCenter = new THREE.Vector3(cx, 0.24, cz);

    this._chasmFloorMat = new THREE.MeshStandardMaterial({
      color: '#7a221b',
      emissive: '#380907',
      emissiveIntensity: 0.2,
      roughness: 0.62,
      metalness: 0.08,
    });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#611914', roughness: 0.58, metalness: 0.1 });
    const northWallMat = new THREE.MeshStandardMaterial({ color: '#8e2d24', roughness: 0.52, metalness: 0.08 });

    const chasmGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(chasmW, 0.05, chasmD), this._chasmFloorMat);
    floor.position.set(cx, 0.175, cz);
    floor.receiveShadow = true;
    chasmGroup.add(floor);

    const wallH = 0.25;
    const addWall = (w, d, x, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat);
      m.position.set(x, 0.175 + wallH / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      chasmGroup.add(m);
    };
    addWall(chasmW, 0.04, cx, cz - chasmD / 2, northWallMat);
    addWall(chasmW, 0.04, cx, cz + chasmD / 2, wallMat);
    addWall(0.04, chasmD, cx - chasmW / 2, cz, wallMat);
    addWall(0.04, chasmD, cx + chasmW / 2, cz, wallMat);

    // Chasm floor silkscreen "-100"
    const labelPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(chasmW * 0.72, chasmD * 0.74),
      new THREE.MeshBasicMaterial({ map: makeChasmLabelTex('-100'), transparent: true })
    );
    labelPlane.rotation.x = -Math.PI / 2;
    labelPlane.position.set(cx, 0.205, cz);
    chasmGroup.add(labelPlane);

    // Invisible click hit volume for cliff inspection
    const hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(chasmW, 0.3, chasmD),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitMesh.position.set(cx, 0.26, cz);
    hitMesh.layers.set(GROUND_LAYER);
    chasmGroup.add(hitMesh);

    this.root.add(chasmGroup);
    this.stage.registerPickable('cliff-chasm', chasmGroup, {
      kind: 'cliff',
      title: '悬崖陷阱 (-100)',
      hint: '步入立刻扣 -100 并回到起点 Start。',
    });
  }

  _buildTiles() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#ddd5c5', roughness: 0.45, metalness: 0.08 });
    const capGeo = new RoundedBoxGeometry(this.tileSize, this.tileH, this.tileSize, 2, 0.055);
    const faceGeo = new THREE.PlaneGeometry(this.tileSize - 0.05, this.tileSize - 0.05);

    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (r === this.rows - 1 && c > 0 && c < this.cols - 1) continue;
        const pos = this.cellToWorld(r, c);
        const group = new THREE.Group();
        group.position.set(pos.x, this.tileBaseY, pos.z);

        const body = new THREE.Mesh(capGeo, bodyMat);
        body.castShadow = false;
        body.receiveShadow = true;
        group.add(body);

        const texHolder = createBeveledGridTileTexture();
        const faceMat = new THREE.MeshBasicMaterial({ map: texHolder.texture });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.rotation.x = -Math.PI / 2;
        face.position.y = this.tileH / 2 + 0.002;
        group.add(face);

        this.root.add(group);
        const id = `cell-${r}-${c}`;
        const kind = r === 3 && c === 0 ? 'start' : r === 3 && c === this.cols - 1 ? 'goal' : 'normal';
        this.stage.registerPickable(id, group, { row: r, col: c, kind });

        this.tiles.set(id, { id, row: r, col: c, kind, group, texHolder, worldPos: new THREE.Vector3(pos.x, this.tileBaseY + this.tileH / 2, pos.z) });
      }
    }
  }

  _buildAgentPuck() {
    const puck = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.27, 0.11, 24),
      new THREE.MeshStandardMaterial({ color: '#18213d', roughness: 0.28, metalness: 0.42 })
    );
    base.castShadow = true;
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.036, 12, 24),
      new THREE.MeshStandardMaterial({ color: '#2dd4bf', emissive: '#0f766e', emissiveIntensity: 0.38, roughness: 0.25 })
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.062;
    puck.add(base, crown);

    this.puckGroup = puck;
    this.puckCrownMat = crown.material;
    this.root.add(puck);
  }

  focusCell(row, col, zoom = 1.42) {
    const tile = this.tiles.get(`cell-${row}-${col}`);
    if (!tile) return false;
    const p = tile.worldPos;
    this.stage.setHighlightRing(new THREE.Vector3(p.x, p.y + 0.015, p.z), 0.56, '#0f766e');
    this.stage.flyTo({ target: [p.x * 0.55, 0.55, p.z * 0.55], zoom: Math.max(this.stage.view.zoom, zoom) }, 380);
    return true;
  }

  updateFromState(snapshot) {
    const mode = snapshot.actNum === 1 ? 'v' : 'q';
    const showMicro = snapshot.actNum >= 2;

    for (const tile of this.tiles.values()) {
      const { row, col, kind } = tile;
      const isSelected = snapshot.selectedCell && snapshot.selectedCell[0] === row && snapshot.selectedCell[1] === col;
      const isHighlight = snapshot.highlightCell && snapshot.highlightCell[0] === row && snapshot.highlightCell[1] === col;
      const qRow = snapshot.qGrid?.[row]?.[col] || [-6, -6, -6, -6];
      let bestA = 1;
      for (let a = 1; a < 4; a += 1) {
        if (qRow[a] > qRow[bestA] + 1e-6) bestA = a;
      }
      tile.texHolder.update({
        row,
        col,
        kind,
        mode,
        v: snapshot.vGrid?.[row]?.[col] ?? -6,
        q: qRow,
        bestAction: bestA,
        selected: Boolean(isSelected),
        highlighted: Boolean(isHighlight),
        showValues: showMicro && (Boolean(isSelected) || Boolean(isHighlight)),
        lang: snapshot.lang || 'zh',
      });
    }

    // Update raised path tubes on GROUND_LAYER (never outlined black)
    this._rebuildPathRibbons(snapshot);

    // Update translucent frosted glass n-step 3D arc
    this._rebuildGlassArc(snapshot);

    // Slide active puck
    const agent = snapshot.agentCell || [3, 0];
    const isDrop = snapshot.forkProbeActive && agent[0] === 3 && agent[1] > 0 && agent[1] < this.cols - 1;
    const wp = this.cellToWorld(agent[0], agent[1]);
    this.puckX.target = wp.x;
    this.puckZ.target = wp.z;
    this.puckY.target = isDrop ? 0.24 : 0.515;
    this.puckCrownMat.color.set(isDrop ? '#f43f5e' : snapshot.actNum >= 4 && !snapshot.showSarsaPath ? '#f59e0b' : '#2dd4bf');
    if (isDrop) this._cliffFlash = 1;
  }

  _rebuildPathRibbons(snapshot) {
    while (this.ribbonGroup.children.length) {
      const ch = this.ribbonGroup.children.pop();
      ch.geometry?.dispose?.();
      ch.material?.dispose?.();
    }

    const addTrace = (cells, color, yOffset, xShift) => {
      if (!cells || cells.length < 2) return;
      const pts = cells.map(([r, c]) => {
        const w = this.cellToWorld(r, c);
        return new THREE.Vector3(w.x + xShift, 0.478 + yOffset, w.z + xShift * 0.6);
      });
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.14);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(16, cells.length * 6), 0.042, 10, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      mesh.layers.set(GROUND_LAYER);
      this.ribbonGroup.add(mesh);
    };

    if (snapshot.sarsaPath) addTrace(snapshot.sarsaPath, '#0f766e', 0.0, -0.05);
    if (snapshot.qPath) addTrace(snapshot.qPath, '#c26a1b', 0.012, 0.06);
  }

  _rebuildGlassArc(snapshot) {
    while (this.arcGroup.children.length) {
      const ch = this.arcGroup.children.pop();
      ch.geometry?.dispose?.();
      ch.material?.dispose?.();
    }
    this._arcNodeCoords = [];

    const nodes = snapshot.arcNodes;
    if (!snapshot.showArc || !nodes || nodes.length < 2) return;

    const span = nodes.length - 1;
    const pts = nodes.map((cell, idx) => {
      const u = idx / span;
      const wp = this.cellToWorld(cell[0], cell[1]);
      const archH = Math.sin(u * Math.PI) * (0.95 + Math.min(0.85, span * 0.16));
      return new THREE.Vector3(wp.x, 0.50 + archH, wp.z);
    });

    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.4);

    // Outer translucent glass envelope (Concept A frosted arc)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#e8f4f2',
      transparent: true,
      opacity: 0.48,
      roughness: 0.16,
      metalness: 0.05,
      depthWrite: false,
    });
    const glassMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.085, 16, false), glassMat);
    glassMesh.layers.set(GROUND_LAYER);
    this.arcGroup.add(glassMesh);

    // Sleek core wire inside glass tube
    const coreMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.022, 10, false),
      new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.85 })
    );
    coreMesh.layers.set(GROUND_LAYER);
    this.arcGroup.add(coreMesh);

    // Glowing node beads along arc (teal early steps -> amber target bootstrap horizon)
    pts.forEach((p, idx) => {
      const isHorizon = idx === pts.length - 1;
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(isHorizon ? 0.095 : 0.082, 18, 18),
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
  }

  getArcNodeTargets() {
    return this._arcNodeCoords;
  }

  _tick(now, dt) {
    const px = this.puckX.step(dt);
    const py = this.puckY.step(dt);
    const pz = this.puckZ.step(dt);
    this.puckGroup.position.set(px, py, pz);

    if (this._cliffFlash > 0) {
      this._cliffFlash = Math.max(0, this._cliffFlash - dt * 1.4);
      this._chasmFloorMat.emissiveIntensity = 0.2 + this._cliffFlash * 0.75;
    } else {
      this._chasmFloorMat.emissiveIntensity = 0.2 + 0.06 * Math.sin(now * 0.004);
    }
  }
}

/**
 * Concept A Right Drafting Panel Primitive: TD Fork SVG + Live Formula Bars + Unified 4-Row Matrix.
 */
export class TdForkPanel {
  constructor(containerEl, { onInjectCliffDrop, onSelectMethod } = {}) {
    this.container = containerEl;
    this.onInjectCliffDrop = onInjectCliffDrop;
    this.onSelectMethod = onSelectMethod;

    this.root = document.createElement('div');
    this.root.className = 'td-fork-panel';
    this.root.innerHTML = `
      <div class="fork-svg-card">
        <div class="fork-svg-head">
          <strong class="fork-title">TD Fork · 单步分叉</strong>
          <button type="button" class="btn-chip fork-probe-btn">⚡ 崖边 ε 跌落反例</button>
        </div>
        <div class="fork-svg-slot"></div>
      </div>
      <div class="formula-bars">
        <div class="formula-pill teal">
          <div class="formula-head"><strong>Sarsa</strong><code>Q ← R + γ Q(S', A')</code></div>
          <div class="formula-sub" data-role="sarsa-sub"></div>
        </div>
        <div class="formula-pill amber">
          <div class="formula-head"><strong>Q-learning</strong><code>Q ← R + γ max Q(S', a)</code></div>
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

    this.probeBtn.onclick = () => this.onInjectCliffDrop?.();
    this.container.append(this.root);
  }

  update(snapshot) {
    const lang = snapshot.lang || 'zh';
    const f = snapshot.fork;
    this.titleEl.textContent = lang === 'en' ? 'TD Fork · Single-Step Split' : 'TD Fork · 同种子单步分叉';
    this.probeBtn.textContent = snapshot.forkProbeActive
      ? (lang === 'en' ? '↺ Restore Normal ε' : '↺ 恢复常态步')
      : (lang === 'en' ? '⚡ Cliff ε-Drop Test' : '⚡ 注入崖边 ε 跌落');
    this.probeBtn.setAttribute('aria-pressed', String(Boolean(snapshot.forkProbeActive)));

    this._renderForkSvg(f, snapshot);

    this.sarsaSub.textContent = `${f.rNext} + ${snapshot.gamma.toFixed(2)}×(${f.sarsaNextQ.toFixed(1)}) = ${f.sarsaTarget.toFixed(1)}  (Δ=${f.sarsaDelta >= 0 ? '+' : ''}${f.sarsaDelta.toFixed(1)})`;
    this.qSub.textContent = `${f.rNext} + ${snapshot.gamma.toFixed(2)}×(${f.qMaxNext.toFixed(1)}) = ${f.qTarget.toFixed(1)}  (Δ=${f.qDelta >= 0 ? '+' : ''}${f.qDelta.toFixed(1)})`;

    const rows = [
      { id: 'td0', act: 1, name: 'TD(0)', target: 'R + γ V(S\')', val: f.td0Target, pct: 46, tone: 'teal' },
      { id: 'sarsa', act: 2, name: 'Sarsa', target: `Q(S', ${f.sarsaActionLabel})`, val: f.sarsaTarget, pct: f.cliffHit ? 100 : 62, tone: f.cliffHit ? 'danger' : 'teal' },
      { id: 'nstep', act: 3, name: `n-step (n=${snapshot.nStep})`, target: 'G_{t:t+n}', val: snapshot.nStepTarget, pct: Math.min(95, 36 + snapshot.nStep * 10), tone: 'navy' },
      { id: 'qlearn', act: 4, name: 'Q-learning', target: 'max_a Q(S\', a)', val: f.qTarget, pct: 74, tone: 'amber' },
    ];

    this.matrixEl.replaceChildren();
    for (const row of rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `matrix-row ${snapshot.activeMethod === row.id ? 'active' : ''}`;
      btn.onclick = () => this.onSelectMethod?.(row.act);
      btn.innerHTML = `
        <span class="m-name">${row.name}</span>
        <span class="m-bar-wrap"><span class="m-bar ${row.tone}" style="width:${row.pct}%"></span></span>
        <span class="m-val">${row.val.toFixed(1)}</span>
      `;
      this.matrixEl.append(btn);
    }
  }

  _renderForkSvg(f, snapshot) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 284 96');
    svg.setAttribute('class', 'fork-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Sarsa 与 Q-learning 单步分叉图');

    const cliffCol = f.cliffHit ? '#b83b3b' : '#0f766e';
    const sarsaEndLabel = f.cliffHit ? '-100 ↓' : `${f.sarsaNextQ.toFixed(1)} (${f.sarsaActionLabel})`;
    const qEndLabel = `max ${f.qMaxNext.toFixed(1)}`;

    svg.innerHTML = `
      <path d="M 38 48 C 72 48, 86 22, 130 22 L 194 22" fill="none" stroke="${cliffCol}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M 38 48 C 72 48, 86 74, 130 74 L 194 74" fill="none" stroke="#c26a1b" stroke-width="2.6" stroke-linecap="round"/>

      <circle cx="24" cy="48" r="14" fill="#faf4e8" stroke="#18213d" stroke-width="2.2"/>
      <text x="24" y="52" text-anchor="middle" font-size="11" font-weight="700" fill="#18213d">s,a</text>

      <circle cx="132" cy="22" r="11" fill="#fffaf2" stroke="${cliffCol}" stroke-width="2" stroke-dasharray="3 2"/>
      <text x="132" y="26" text-anchor="middle" font-size="10" font-weight="700" fill="${cliffCol}">ε</text>
      <text x="86" y="15" text-anchor="middle" font-size="10.5" font-weight="700" fill="${cliffCol}">Sarsa</text>

      <polygon points="122,63 146,74 122,85" fill="#fbe8d5" stroke="#c26a1b" stroke-width="2"/>
      <text x="131" y="77.5" text-anchor="middle" font-size="9" font-weight="800" fill="#9a4f10">MAX</text>
      <text x="84" y="88" text-anchor="middle" font-size="10.5" font-weight="700" fill="#b8631a">Q-learn</text>

      <rect x="196" y="10" width="84" height="24" rx="6" fill="${f.cliffHit ? '#fae1df' : '#d9f1ef'}" stroke="${cliffCol}" stroke-width="1.6"/>
      <text x="238" y="26" text-anchor="middle" font-size="11" font-weight="700" fill="${cliffCol}">${sarsaEndLabel}</text>

      <rect x="196" y="62" width="84" height="24" rx="6" fill="#fbe8d5" stroke="#c26a1b" stroke-width="1.6"/>
      <text x="238" y="78" text-anchor="middle" font-size="11" font-weight="700" fill="#9a4f10">${qEndLabel}</text>
    `;
    this.svgSlot.replaceChildren(svg);
  }
}

/**
 * Dark-slate 6-line live Python execution trace monitor primitive.
 */
export class CodeTraceCard {
  constructor(containerEl) {
    this.container = containerEl;
    this.card = document.createElement('section');
    this.card.className = 'code-trace-card';
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
    this.container.append(this.card);
  }

  update({ title, lines = [], activeLine = 0, watch = '' }) {
    if (title) this.titleEl.textContent = title;
    this.watchEl.textContent = watch;
    this.linesEl.replaceChildren();
    lines.forEach((txt, idx) => {
      const row = document.createElement('div');
      const lineNum = idx + 1;
      row.className = `code-line ${lineNum === activeLine ? 'active' : ''}`;
      const num = document.createElement('span');
      num.className = 'code-ln';
      num.textContent = String(lineNum);
      const code = document.createElement('code');
      code.textContent = txt;
      row.append(num, code);
      this.linesEl.append(row);
    });
  }
}
