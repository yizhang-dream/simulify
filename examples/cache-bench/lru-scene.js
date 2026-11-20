import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CalloutLayer } from '../../kit/callout-layer.js';
import { SOLID_LAYER } from '../../kit/outline-pass.js';
import { FloatingPopups } from '../../kit/popups.js';
import { clamp, easeOutCubic, Spring } from '../../kit/spring.js';
import { IsometricStage } from '../../kit/stage-3d.js';
import { CARTRIDGES, CARTRIDGE_IDS } from './lru-engine.js';

const ARCHIVE_Z = -2.85;
const ARCHIVE_Y = 1.16;
const ARCHIVE_DOCK_X = { A: -2.45, B: -1.15, C: 0.15, D: 1.45 };

const LRU_Z = -0.15;
const LRU_BAY_POS = [
  new THREE.Vector3(-1.25, 0.58, LRU_Z),
  new THREE.Vector3(0.55, 0.58, LRU_Z),
];
const LRU_RAMP_LIP = new THREE.Vector3(1.85, 0.62, LRU_Z);
const LRU_TRAY_POS = new THREE.Vector3(3.45, 0.34, LRU_Z);

const FIFO_Z = 2.55;
const FIFO_BAY_POS = [
  new THREE.Vector3(-1.25, 0.58, FIFO_Z), // Left: newest
  new THREE.Vector3(0.55, 0.58, FIFO_Z),  // Right: oldest (next out)
];
const FIFO_RAMP_LIP = new THREE.Vector3(1.85, 0.62, FIFO_Z);
const FIFO_TRAY_POS = new THREE.Vector3(3.45, 0.34, FIFO_Z);

const smooth = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const _faceplateCache = new Map();
function getFaceplateTexture(id) {
  if (_faceplateCache.has(id)) return _faceplateCache.get(id);
  const info = CARTRIDGES[id];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#faf4e8';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = info.color;
  ctx.fillRect(0, 0, 256, 48);
  ctx.strokeStyle = '#18213d';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  ctx.fillStyle = '#fffaf2';
  ctx.font = 'bold 26px "Cascadia Code", "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.tag, 128, 26);

  ctx.fillStyle = '#18213d';
  ctx.font = '800 112px "Cascadia Code", "JetBrains Mono", monospace';
  ctx.fillText(info.id, 128, 136);

  ctx.fillStyle = '#5c626d';
  ctx.font = '600 22px "Cascadia Code", "JetBrains Mono", monospace';
  ctx.fillText(info.size, 128, 216);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _faceplateCache.set(id, tex);
  return tex;
}

function createSilkscreenTexture(text, { bg = '#24304a', fg = '#faf4e8', border = '#d4ab58', w = 512, h = 128, font = 'bold 50px "Segoe UI", sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildCartridgeMesh(id, scale = 1) {
  const info = CARTRIDGES[id];
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1.06, 0.34, 1.22, 3, 0.06),
    new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.44, metalness: 0.08 })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const grip = new THREE.Mesh(
    new RoundedBoxGeometry(0.68, 0.1, 0.18, 2, 0.03),
    new THREE.MeshStandardMaterial({ color: info.accent, roughness: 0.38, metalness: 0.12 })
  );
  grip.position.set(0, 0.19, -0.44);
  grip.castShadow = true;
  group.add(grip);

  const brassMat = new THREE.MeshStandardMaterial({ color: '#d8b263', roughness: 0.32, metalness: 0.55 });
  for (let i = -2; i <= 2; i++) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.08), brassMat);
    pin.position.set(i * 0.16, -0.09, 0.61);
    group.add(pin);
  }

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.78),
    new THREE.MeshStandardMaterial({ map: getFaceplateTexture(id), roughness: 0.55, metalness: 0.02 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0.173, 0.08);
  plate.receiveShadow = true;
  group.add(plate);

  group.scale.setScalar(scale);
  group.layers.set(SOLID_LAYER);
  return group;
}

function createPulseTrail(color) {
  const orbs = [];
  const radii = [0.14, 0.105, 0.078, 0.055];
  for (let i = 0; i < radii.length; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.95 - i * 0.15,
      transparent: i > 0,
      opacity: 1 - i * 0.22,
      roughness: 0.2,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(radii[i], 14, 14), mat);
    m.visible = false;
    orbs.push(m);
  }
  return orbs;
}

export class LruWorkbenchScene {
  constructor({ canvas, svgLeaders, tagsLayer, popupsLayer, tooltipEl, sound, onRequestKey, onInspect }) {
    this.sound = sound;
    this.tooltipEl = tooltipEl;
    this.onRequestKey = onRequestKey;
    this.onInspect = onInspect;
    this.speed = 1;
    this.dualMode = false;

    this.stage = new IsometricStage(canvas, {
      target: [0.85, 0.4, -0.55],
      baseSpan: 10.0,
      azimuth: 35 * (Math.PI / 180),
      elevation: 40 * (Math.PI / 180),
      zoom: 1.04,
      shadowBounds: 15,
      gridSize: 32,
      onHover: (hit, x, y) => this._handleHover(hit, x, y),
      onSelect: (hit) => this._handleSelect(hit),
    });

    this.callouts = new CalloutLayer(this.stage, svgLeaders, tagsLayer);
    this.popups = new FloatingPopups(this.stage, popupsLayer);

    this._hoveredId = null;
    this._hoverLift = new Map();
    this._archiveMaster = new Map();
    this._dockLeds = new Map();
    this._deskCards = new Map();      // LRU desktop cards: id -> { group, spring }
    this._fifoCards = new Map();      // FIFO desktop cards: id -> { group, spring }
    this._lruEvictedCard = null;
    this._fifoEvictedCard = null;
    this._lruAnim = null;
    this._fifoAnim = null;
    this._pulses = [];
    this._cpuLedMat = null;

    this._lruGroup = this._buildDeck({
      z: LRU_Z,
      prefix: 'lru',
      title: 'LRU 工作台 · 最近使用',
      leftColor: '#149694',
      rightColor: '#c96d24',
      leftTitle: '左槽 · MRU (最新 1ns)',
      rightTitle: '右槽 · LRU (淘汰候选)',
      trayTitle: 'LRU 回收盘 · 已淘汰',
    });
    this.stage.scene.add(this._lruGroup);

    this._fifoGroup = this._buildDeck({
      z: FIFO_Z,
      prefix: 'fifo',
      title: 'FIFO 对照台 · 先进先出',
      leftColor: '#567896',
      rightColor: '#c96d24',
      leftTitle: 'FIFO 后入槽',
      rightTitle: 'FIFO 先出槽 (即将淘汰)',
      trayTitle: 'FIFO 回收盘 · 已淘汰',
    });
    this._fifoGroup.visible = false;
    this.stage.scene.add(this._fifoGroup);

    this._buildArchiveRack();
    this._buildBusConduit();
    this._setupCallouts();

    this.stage.onFrame((now, dt) => this._tick(now, dt));
  }

  _buildDeck({ z, prefix, title, leftColor, rightColor, leftTitle, rightTitle, trayTitle }) {
    const group = new THREE.Group();
    const slateMat = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.48, metalness: 0.14 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#24304a', roughness: 0.45, metalness: 0.22 });
    const brassMat = new THREE.MeshStandardMaterial({ color: '#d4ab58', roughness: 0.34, metalness: 0.58 });

    const chassis = new THREE.Mesh(new RoundedBoxGeometry(3.85, 0.44, 2.38, 4, 0.09), slateMat);
    chassis.position.set(-0.35, 0.22, z);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // Front silkscreen deck nameplate
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.95, 0.26),
      new THREE.MeshBasicMaterial({ map: createSilkscreenTexture(title, { w: 512, h: 72, font: 'bold 34px "Segoe UI", sans-serif' }) })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(-0.35, 0.443, z + 0.96);
    group.add(plate);

    // Corner brass fasteners
    for (const sx of [-2.05, 1.35]) {
      for (const sz of [z - 1.0, z + 1.0]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), brassMat);
        bolt.position.set(sx, 0.45, sz);
        group.add(bolt);
      }
    }

    const baySpecs = [
      { id: `${prefix}-bay-0`, x: -1.25, color: leftColor, title: leftTitle, sub: prefix === 'lru' ? 'MRU' : 'NEW' },
      { id: `${prefix}-bay-1`, x: 0.55, color: rightColor, title: rightTitle, sub: prefix === 'lru' ? 'LRU' : 'OLD' },
    ];

    for (const spec of baySpecs) {
      const bayGroup = new THREE.Group();
      const pad = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.07, 1.54, 2, 0.03), trimMat);
      pad.position.set(spec.x, 0.44, z);
      pad.receiveShadow = true;
      bayGroup.add(pad);

      const ring = new THREE.Mesh(
        new RoundedBoxGeometry(1.46, 0.04, 1.64, 2, 0.03),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.color,
          emissiveIntensity: 0.22,
          roughness: 0.38,
        })
      );
      ring.position.set(spec.x, 0.425, z);
      bayGroup.add(ring);

      const slotTag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.18),
        new THREE.MeshBasicMaterial({ map: createSilkscreenTexture(spec.sub, { bg: '#1b2439', border: spec.color, w: 256, h: 64, font: 'bold 34px "Cascadia Code", monospace' }) })
      );
      slotTag.rotation.x = -Math.PI / 2;
      slotTag.position.set(spec.x, 0.445, z - 0.92);
      bayGroup.add(slotTag);

      group.add(bayGroup);
      this.stage.registerPickable(spec.id, bayGroup, {
        kind: 'bay',
        title: spec.title,
        hint: '空槽位置 — 点击查看调度规则',
        ringPos: new THREE.Vector3(spec.x, 0.49, z),
        ringRadius: 0.98,
        ringColor: spec.color,
      });
    }

    // Brass chevrons
    for (const offset of [-0.08, 0.14]) {
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.045), brassMat);
      topBar.position.set(-0.35 + offset, 0.46, z - 0.06);
      topBar.rotation.y = -0.6;
      const botBar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.045), brassMat);
      botBar.position.set(-0.35 + offset, 0.46, z + 0.06);
      botBar.rotation.y = 0.6;
      group.add(topBar, botBar);
    }

    // Sloped Return Ramp
    const rampPlate = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.1, 1.25, 2, 0.03), slateMat);
    rampPlate.position.set(2.2, 0.28, z);
    rampPlate.rotation.z = -0.22;
    rampPlate.castShadow = true;
    rampPlate.receiveShadow = true;
    group.add(rampPlate);

    for (const rz of [z - 0.53, z + 0.53]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.12, 0.08, 2, 0.02), trimMat);
      rail.position.set(2.2, 0.34, rz);
      rail.rotation.z = -0.22;
      rail.castShadow = true;
      group.add(rail);
    }
    for (const rz of [z - 0.23, z, z + 0.23]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.03, 0.04), brassMat);
      rib.position.set(2.2, 0.34, rz);
      rib.rotation.z = -0.22;
      group.add(rib);
    }

    // Eviction Tray
    const trayGroup = new THREE.Group();
    const trayBase = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.28, 1.94, 3, 0.07), slateMat);
    trayBase.position.set(3.45, 0.14, z);
    trayBase.castShadow = true;
    trayBase.receiveShadow = true;
    trayGroup.add(trayBase);

    const trayInner = new THREE.Mesh(new RoundedBoxGeometry(1.38, 0.07, 1.6, 2, 0.03), trimMat);
    trayInner.position.set(3.45, 0.27, z);
    trayInner.receiveShadow = true;
    trayGroup.add(trayInner);

    const trayLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.24),
      new THREE.MeshBasicMaterial({ map: createSilkscreenTexture('EVICTED', { bg: '#1b2439', border: '#656a73', w: 256, h: 64, font: 'bold 34px "Cascadia Code", monospace' }) })
    );
    trayLabel.rotation.x = -Math.PI / 2;
    trayLabel.position.set(3.45, 0.308, z + 0.58);
    trayGroup.add(trayLabel);

    group.add(trayGroup);
    this.stage.registerPickable(`${prefix}-tray`, trayGroup, {
      kind: 'tray',
      title: trayTitle,
      hint: '记录从右侧淘汰滑出的卡盒',
      ringPos: new THREE.Vector3(3.45, 0.32, z),
      ringRadius: 1.05,
      ringColor: '#c96d24',
    });

    return group;
  }

  _buildArchiveRack() {
    const rackGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#293550', roughness: 0.48, metalness: 0.22 });
    const capMat = new THREE.MeshStandardMaterial({ color: '#d8d0bf', roughness: 0.46, metalness: 0.1 });

    const plinth = new THREE.Mesh(new RoundedBoxGeometry(5.65, 0.88, 1.68, 4, 0.08), bodyMat);
    plinth.position.set(-0.5, 0.44, ARCHIVE_Z);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    rackGroup.add(plinth);

    const topPlate = new THREE.Mesh(new RoundedBoxGeometry(5.52, 0.14, 1.54, 3, 0.04), capMat);
    topPlate.position.set(-0.5, 0.93, ARCHIVE_Z);
    topPlate.castShadow = true;
    topPlate.receiveShadow = true;
    rackGroup.add(topPlate);

    const rackBanner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.25),
      new THREE.MeshBasicMaterial({ map: createSilkscreenTexture('MAIN MEMORY · 100 ns', { bg: '#1d273f', border: '#d4ab58', w: 512, h: 68, font: 'bold 34px "Cascadia Code", monospace' }) })
    );
    rackBanner.rotation.x = -Math.PI / 2;
    rackBanner.position.set(-0.5, 1.005, ARCHIVE_Z - 0.63);
    rackGroup.add(rackBanner);

    this.stage.scene.add(rackGroup);

    for (const id of CARTRIDGE_IDS) {
      const dockX = ARCHIVE_DOCK_X[id];
      const master = buildCartridgeMesh(id, 0.88);
      master.position.set(dockX, ARCHIVE_Y, ARCHIVE_Z);
      this.stage.scene.add(master);
      this._archiveMaster.set(id, master);
      this._hoverLift.set(`archive-${id}`, 0);

      const ledMat = new THREE.MeshStandardMaterial({ color: '#8f96a3', emissive: '#000000', emissiveIntensity: 0, roughness: 0.35 });
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), ledMat);
      led.position.set(dockX, 1.01, ARCHIVE_Z + 0.65);
      this.stage.scene.add(led);
      this._dockLeds.set(id, ledMat);

      this.stage.registerPickable(`archive-${id}`, master, {
        kind: 'archive',
        key: id,
        title: `主存 ${id} · ${CARTRIDGES[id].title}`,
        hint: '点击发起取用',
        ringPos: new THREE.Vector3(dockX, 1.03, ARCHIVE_Z),
        ringRadius: 0.72,
        ringColor: CARTRIDGES[id].color,
      });
    }
  }

  _buildBusConduit() {
    const hubGroup = new THREE.Group();
    const hubMat = new THREE.MeshStandardMaterial({ color: '#24304a', roughness: 0.42, metalness: 0.25 });
    const brassMat = new THREE.MeshStandardMaterial({ color: '#d4ab58', roughness: 0.36, metalness: 0.5 });

    const hub = new THREE.Mesh(new RoundedBoxGeometry(1.14, 0.56, 1.24, 3, 0.07), hubMat);
    hub.position.set(-3.35, 0.28, LRU_Z);
    hub.castShadow = true;
    hub.receiveShadow = true;
    hubGroup.add(hub);

    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.08, 0.98, 2, 0.03), brassMat);
    cap.position.set(-3.35, 0.58, LRU_Z);
    hubGroup.add(cap);

    const cpuPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.88),
      new THREE.MeshBasicMaterial({ map: createSilkscreenTexture('CPU · REQ', { bg: '#18213d', border: '#d4ab58', w: 256, h: 256, font: 'bold 42px "Cascadia Code", monospace' }) })
    );
    cpuPlate.rotation.x = -Math.PI / 2;
    cpuPlate.position.set(-3.35, 0.625, LRU_Z);
    hubGroup.add(cpuPlate);

    this._cpuLedMat = new THREE.MeshStandardMaterial({ color: '#149694', emissive: '#149694', emissiveIntensity: 0.8 });
    const cpuLed = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14), this._cpuLedMat);
    cpuLed.position.set(-3.0, 0.625, LRU_Z + 0.34);
    hubGroup.add(cpuLed);

    this.stage.scene.add(hubGroup);
    this.stage.registerPickable('hub', hubGroup, {
      kind: 'hub',
      title: 'CPU 请求总线',
      hint: '优先探测桌面短轨 (1 ns)，未命中走后排慢轨 (100 ns)',
      ringPos: new THREE.Vector3(-3.35, 0.04, LRU_Z),
      ringRadius: 0.92,
      ringColor: '#149694',
    });

    const railMat = new THREE.MeshStandardMaterial({ color: '#b8aa92', roughness: 0.5, metalness: 0.3 });
    this._lruFastCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.78, 0.22, LRU_Z),
      new THREE.Vector3(-2.3, 0.22, LRU_Z),
      new THREE.Vector3(-1.25, 0.32, LRU_Z),
    ]);
    this.stage.scene.add(new THREE.Mesh(new THREE.TubeGeometry(this._lruFastCurve, 18, 0.045, 8, false), railMat));

    this._slowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.35, 0.22, LRU_Z - 0.62),
      new THREE.Vector3(-3.35, 0.22, -1.7),
      new THREE.Vector3(-2.45, 0.52, ARCHIVE_Z),
    ]);
    this.stage.scene.add(new THREE.Mesh(new THREE.TubeGeometry(this._slowCurve, 24, 0.045, 8, false), railMat));

    // Forked FIFO rail (hidden unless dualMode)
    this._fifoFastCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.35, 0.22, LRU_Z + 0.62),
      new THREE.Vector3(-3.35, 0.22, FIFO_Z),
      new THREE.Vector3(-1.25, 0.32, FIFO_Z),
    ]);
    this._fifoRail = new THREE.Mesh(new THREE.TubeGeometry(this._fifoFastCurve, 22, 0.045, 8, false), railMat);
    this._fifoRail.visible = false;
    this.stage.scene.add(this._fifoRail);

    this._trailLruHit = createPulseTrail('#149694');
    this._trailMiss = createPulseTrail('#c96d24');
    this._trailFifo = createPulseTrail('#3a6fa3');
    for (const arr of [this._trailLruHit, this._trailMiss, this._trailFifo]) {
      arr.forEach((m) => this.stage.scene.add(m));
    }
  }

  _setupCallouts() {
    this.callouts.setItems([
      {
        id: 'bay-0',
        getWorldPos: () => new THREE.Vector3(LRU_BAY_POS[0].x - 0.12, 0.52, LRU_Z + 0.6),
        dx: -50,
        dy: 66,
        tone: 'teal',
        label: '左槽 MRU',
        sublabel: '空槽',
      },
      {
        id: 'bay-1',
        getWorldPos: () => new THREE.Vector3(LRU_BAY_POS[1].x + 0.08, 0.52, LRU_Z + 0.6),
        dx: 36,
        dy: 66,
        tone: 'amber',
        label: '右槽 LRU',
        sublabel: '空槽',
      },
      {
        id: 'archive',
        getWorldPos: () => new THREE.Vector3(0.45, 1.2, ARCHIVE_Z - 0.58),
        dx: 24,
        dy: -56,
        tone: '',
        label: '主存档案架',
        sublabel: '100 ns',
      },
      {
        id: 'tray',
        getWorldPos: () => new THREE.Vector3(LRU_TRAY_POS.x - 0.05, 0.52, LRU_Z - 0.48),
        dx: -16,
        dy: -58,
        tone: '',
        label: '回收盘',
        sublabel: '暂无淘汰',
      },
    ]);
  }

  setDualMode(enabled) {
    this.dualMode = Boolean(enabled);
    this._fifoGroup.visible = this.dualMode;
    this._fifoRail.visible = this.dualMode;
    // In dual mode, 3D silkscreen plates keep the scene super clean without cluttering middle lanes
    this.callouts.updateItem('bay-0', { visible: !this.dualMode });
    this.callouts.updateItem('bay-1', { visible: !this.dualMode });
    this.callouts.updateItem('tray', { visible: !this.dualMode });
  }

  setCameraPreset(preset) {
    if (!preset) return;
    this.stage.flyTo(preset, 460);
  }

  setCalloutsVisible(visible) {
    this.callouts.setEnabled(visible);
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  _handleHover(hit, x, y) {
    this._hoveredId = hit ? hit.id : null;
    if (!hit) {
      this.tooltipEl.hidden = true;
      this.stage.clearHighlightRing();
      return;
    }
    if (hit.meta.ringPos) {
      this.stage.setHighlightRing(hit.meta.ringPos, hit.meta.ringRadius ?? 0.85, hit.meta.ringColor ?? '#149694');
    }
    this.tooltipEl.textContent = `${hit.meta.title} · ${hit.meta.hint}`;
    this.tooltipEl.hidden = false;
    const { width, height } = this.stage.size;
    const tw = this.tooltipEl.offsetWidth || 160;
    const th = this.tooltipEl.offsetHeight || 28;
    const left = clamp(x + 14, 8, Math.max(8, width - tw - 8));
    const top = clamp(y - th - 10, 8, Math.max(8, height - th - 8));
    this.tooltipEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  _handleSelect(hit) {
    if ((hit.meta.kind === 'archive' || hit.meta.kind === 'desk-card') && this.onRequestKey) {
      this.onRequestKey(hit.meta.key);
      return;
    }
    if (this.onInspect) {
      this.onInspect(hit.id, hit.meta);
    }
  }

  _clearDynamicDeskPickables() {
    for (const id of CARTRIDGE_IDS) {
      this.stage.unregisterPickable(`desk-lru-${id}`);
    }
  }

  _registerDeskPickables(slots) {
    this._clearDynamicDeskPickables();
    slots.forEach((id, idx) => {
      const card = this._deskCards.get(id);
      if (!card) return;
      const pos = LRU_BAY_POS[idx];
      this.stage.registerPickable(`desk-lru-${id}`, card.group, {
        kind: 'desk-card',
        key: id,
        title: `工作台 ${id} (${CARTRIDGES[id].tag})`,
        hint: '直接点击 1 ns 命中',
        ringPos: new THREE.Vector3(pos.x, 0.49, LRU_Z),
        ringRadius: 0.78,
        ringColor: '#149694',
      });
    });
  }

  _ensureCard(map, id) {
    if (!map.has(id)) {
      const group = buildCartridgeMesh(id, 1.0);
      this.stage.scene.add(group);
      map.set(id, {
        group,
        spring: new Spring({ value: 0, target: 0, stiffness: 360, damping: 16 }),
        baseY: 0.58,
      });
    }
    return map.get(id);
  }

  _clearAllDynamicCards() {
    this._clearDynamicDeskPickables();
    for (const c of this._deskCards.values()) this.stage.scene.remove(c.group);
    this._deskCards.clear();
    for (const c of this._fifoCards.values()) this.stage.scene.remove(c.group);
    this._fifoCards.clear();
    if (this._lruEvictedCard) {
      this.stage.scene.remove(this._lruEvictedCard.group);
      this._lruEvictedCard = null;
    }
    if (this._fifoEvictedCard) {
      this.stage.scene.remove(this._fifoEvictedCard.group);
      this._fifoEvictedCard = null;
    }
  }

  _syncDockLeds(slots) {
    for (const id of CARTRIDGE_IDS) {
      const mat = this._dockLeds.get(id);
      const residentIdx = slots.indexOf(id);
      if (residentIdx === 0) {
        mat.color.set('#149694');
        mat.emissive.set('#149694');
        mat.emissiveIntensity = 0.9;
      } else if (residentIdx === 1) {
        mat.color.set('#c96d24');
        mat.emissive.set('#c96d24');
        mat.emissiveIntensity = 0.85;
      } else {
        mat.color.set('#8f96a3');
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
    }
  }

  _syncCallouts(slots, evicted) {
    this.callouts.updateItem('bay-0', {
      sublabel: slots[0] ? `${slots[0]} · ${CARTRIDGES[slots[0]].tag}` : '空槽',
    });
    this.callouts.updateItem('bay-1', {
      sublabel: slots[1] ? `${slots[1]} · ${CARTRIDGES[slots[1]].tag}` : '空槽',
    });
    this.callouts.updateItem('tray', {
      sublabel: evicted ? `淘汰: ${evicted}` : '暂无淘汰',
    });
  }

  applySnapshot(snapshot) {
    this._lruAnim = null;
    this._fifoAnim = null;
    this._pulses = [];
    for (const arr of [this._trailLruHit, this._trailMiss, this._trailFifo]) {
      arr.forEach((m) => (m.visible = false));
    }
    this._clearAllDynamicCards();

    snapshot.lruSlots.forEach((id, idx) => {
      const card = this._ensureCard(this._deskCards, id);
      card.group.position.copy(LRU_BAY_POS[idx]);
      card.baseY = LRU_BAY_POS[idx].y;
      card.spring.snap(0);
    });
    this._registerDeskPickables(snapshot.lruSlots);

    if (snapshot.evicted) {
      const ev = buildCartridgeMesh(snapshot.evicted, 0.86);
      ev.position.copy(LRU_TRAY_POS);
      this.stage.scene.add(ev);
      this._lruEvictedCard = { id: snapshot.evicted, group: ev };
    }

    if (this.dualMode) {
      const fifoDisplay = [...snapshot.fifoQueue].reverse();
      fifoDisplay.forEach((id, idx) => {
        const card = this._ensureCard(this._fifoCards, id);
        card.group.position.copy(FIFO_BAY_POS[idx]);
        card.baseY = FIFO_BAY_POS[idx].y;
        card.spring.snap(0);
      });
      if (snapshot.fifoEvicted) {
        const evF = buildCartridgeMesh(snapshot.fifoEvicted, 0.86);
        evF.position.copy(FIFO_TRAY_POS);
        this.stage.scene.add(evF);
        this._fifoEvictedCard = { id: snapshot.fifoEvicted, group: evF };
      }
    }

    this._syncDockLeds(snapshot.lruSlots);
    this._syncCallouts(snapshot.lruSlots, snapshot.evicted);
  }

  animateTransition(event) {
    const { lru, fifo } = event;
    this._syncDockLeds(lru.after);
    this._syncCallouts(lru.after, lru.evicted);

    if (this.stage.reducedMotion) {
      this.applySnapshot({
        lruSlots: lru.after,
        fifoQueue: fifo.after,
        evicted: lru.evicted,
        fifoEvicted: fifo.evicted,
      });
      this.popups.spawn(LRU_BAY_POS[0].clone().add(new THREE.Vector3(0, 0.5, 0)), lru.hit ? 'HIT · 1 ns' : 'MISS · 100 ns', lru.hit ? 'teal' : 'amber');
      return;
    }

    this._clearAllDynamicCards();
    this._pulses = [];
    for (const arr of [this._trailLruHit, this._trailMiss, this._trailFifo]) {
      arr.forEach((m) => (m.visible = false));
    }

    // Prepare LRU animation
    const lruEntries = new Map();
    lru.before.forEach((id, idx) => {
      const c = this._ensureCard(this._deskCards, id);
      c.group.position.copy(LRU_BAY_POS[idx]);
      c.spring.snap(0);
      lruEntries.set(id, { card: c, startPos: LRU_BAY_POS[idx].clone(), startScale: 1 });
    });
    if (!lru.hit) {
      const dockStart = new THREE.Vector3(ARCHIVE_DOCK_X[lru.key], ARCHIVE_Y, ARCHIVE_Z);
      const inc = this._ensureCard(this._deskCards, lru.key);
      inc.group.position.copy(dockStart);
      inc.group.scale.setScalar(0.88);
      inc.spring.snap(0);
      lruEntries.set(lru.key, { card: inc, startPos: dockStart, startScale: 0.88 });
    }
    this._registerDeskPickables(lru.after);

    // Distinct felt speed: HIT is crisp ~290ms, MISS is deliberate ~1120ms!
    const lruDuration = (lru.hit ? (lru.sourceIndex === 1 ? 420 : 280) : (lru.evicted ? 1160 : 1080)) / this.speed;
    this._lruAnim = {
      start: performance.now(),
      duration: lruDuration,
      lru,
      entries: lruEntries,
      bounced: false,
      popupFired: false,
    };

    // Bus trails
    if (lru.hit) {
      this._pulses.push({ start: performance.now(), duration: 240 / this.speed, curve: this._lruFastCurve, trail: this._trailLruHit });
      this._cpuLedMat.color.set('#149694');
      this._cpuLedMat.emissive.set('#149694');
      this.sound.hit();
    } else {
      const slowCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.35, 0.22, LRU_Z - 0.62),
        new THREE.Vector3(-3.35, 0.22, -1.7),
        new THREE.Vector3(ARCHIVE_DOCK_X[lru.key], 0.55, ARCHIVE_Z),
      ]);
      this._pulses.push({ start: performance.now(), duration: 480 / this.speed, curve: slowCurve, trail: this._trailMiss });
      this._cpuLedMat.color.set('#c96d24');
      this._cpuLedMat.emissive.set('#c96d24');
      this.sound.miss();
      if (lru.evicted) this.sound.evict();
    }

    // Prepare FIFO parallel animation in Dual Mode
    if (this.dualMode) {
      const fifoEntries = new Map();
      const beforeRev = [...fifo.before].reverse();
      beforeRev.forEach((id, idx) => {
        const c = this._ensureCard(this._fifoCards, id);
        c.group.position.copy(FIFO_BAY_POS[idx]);
        c.spring.snap(0);
        fifoEntries.set(id, { card: c, startPos: FIFO_BAY_POS[idx].clone(), startScale: 1 });
      });
      if (!fifo.hit) {
        const dockStart = new THREE.Vector3(ARCHIVE_DOCK_X[fifo.key], ARCHIVE_Y, ARCHIVE_Z);
        const inc = this._ensureCard(this._fifoCards, fifo.key);
        inc.group.position.copy(dockStart);
        inc.group.scale.setScalar(0.88);
        inc.spring.snap(0);
        fifoEntries.set(fifo.key, { card: inc, startPos: dockStart, startScale: 0.88 });
      }
      const afterRev = [...fifo.after].reverse();
      this._pulses.push({ start: performance.now(), duration: 260 / this.speed, curve: this._fifoFastCurve, trail: this._trailFifo });
      this._fifoAnim = {
        start: performance.now(),
        duration: (fifo.hit ? 300 : 1120) / this.speed,
        fifo,
        afterRev,
        entries: fifoEntries,
        bounced: false,
        popupFired: false,
      };
    }
  }

  _tick(now, dt) {
    // Archive hover lift
    for (const id of CARTRIDGE_IDS) {
      const key = `archive-${id}`;
      const target = this._hoveredId === key ? 0.14 : 0;
      const prev = this._hoverLift.get(key) ?? 0;
      const next = prev + (target - prev) * Math.min(1, dt * 15);
      this._hoverLift.set(key, next);
      const mesh = this._archiveMaster.get(id);
      if (mesh) mesh.position.y = ARCHIVE_Y + next;
    }

    // Step springs on resident cards
    for (const c of this._deskCards.values()) {
      const offset = c.spring.step(dt);
      if (!this._lruAnim) c.group.position.y = c.baseY + offset;
    }
    for (const c of this._fifoCards.values()) {
      const offset = c.spring.step(dt);
      if (!this._fifoAnim) c.group.position.y = c.baseY + offset;
    }

    // Bus pulse trails
    for (let i = this._pulses.length - 1; i >= 0; i--) {
      const ps = this._pulses[i];
      const p = clamp((now - ps.start) / ps.duration, 0, 1);
      ps.trail.forEach((orb, idx) => {
        const tp = clamp(easeOutCubic(p) - idx * 0.06, 0, 1);
        orb.visible = p < 1 && tp > 0;
        if (orb.visible) orb.position.copy(ps.curve.getPoint(tp));
      });
      if (p >= 1) {
        ps.trail.forEach((o) => (o.visible = false));
        this._pulses.splice(i, 1);
      }
    }

    // LRU animation
    if (this._lruAnim) {
      const { start, duration, lru, entries } = this._lruAnim;
      const p = clamp((now - start) / duration, 0, 1);

      if (!this._lruAnim.popupFired && p > 0.25) {
        this._lruAnim.popupFired = true;
        this.popups.spawn(
          LRU_BAY_POS[0].clone().add(new THREE.Vector3(0, 0.58, 0)),
          lru.hit ? 'HIT · 1 ns' : 'MISS · 100 ns',
          lru.hit ? 'teal' : 'amber'
        );
        if (lru.evicted) {
          this.popups.spawn(LRU_TRAY_POS.clone().add(new THREE.Vector3(0, 0.52, 0)), `淘汰 ${lru.evicted}`, 'amber');
        }
      }

      const activeEntry = entries.get(lru.key);
      if (activeEntry) {
        const delay = lru.hit ? 0.05 : 0.34;
        const t = smooth((p - delay) / (1 - delay));
        activeEntry.card.group.position.lerpVectors(activeEntry.startPos, LRU_BAY_POS[0], t);
        const arc = lru.hit ? (lru.sourceIndex === 1 ? 1.48 : 0.42) : 1.18;
        activeEntry.card.group.position.y += Math.sin(t * Math.PI) * arc + activeEntry.card.spring.value;
        activeEntry.card.group.scale.setScalar(activeEntry.startScale + (1 - activeEntry.startScale) * t);
      }

      for (const id of lru.after) {
        if (id === lru.key) continue;
        const e = entries.get(id);
        if (!e) continue;
        const targetIdx = lru.after.indexOf(id);
        const t = smooth((p - 0.16) / 0.58);
        e.card.group.position.lerpVectors(e.startPos, LRU_BAY_POS[targetIdx], t);
        e.card.group.position.y += e.card.spring.value;
      }

      if (lru.evicted && entries.has(lru.evicted)) {
        const ev = entries.get(lru.evicted);
        if (p < 0.45) {
          const t = smooth((p - 0.14) / 0.31);
          ev.card.group.position.lerpVectors(ev.startPos, LRU_RAMP_LIP, t);
          ev.card.group.rotation.z = -0.14 * t;
        } else {
          const t = smooth((p - 0.45) / 0.5);
          ev.card.group.position.lerpVectors(LRU_RAMP_LIP, LRU_TRAY_POS, t);
          ev.card.group.position.y += Math.sin(t * Math.PI) * 0.18;
          ev.card.group.rotation.z = -0.22 * (1 - t);
          ev.card.group.scale.setScalar(1 - 0.14 * t);
        }
      }

      if (p >= 1) {
        if (activeEntry) activeEntry.card.spring.impulse(-2.2);
        if (lru.evicted && entries.has(lru.evicted)) {
          const ev = entries.get(lru.evicted);
          this._deskCards.delete(lru.evicted);
          this._lruEvictedCard = { id: lru.evicted, group: ev.card.group };
          this._lruEvictedCard.group.position.copy(LRU_TRAY_POS);
          this._lruEvictedCard.group.rotation.set(0, 0, 0);
          this._lruEvictedCard.group.scale.setScalar(0.86);
        }
        this._lruAnim = null;
      }
    }

    // FIFO parallel animation
    if (this._fifoAnim) {
      const { start, duration, fifo, afterRev, entries } = this._fifoAnim;
      const p = clamp((now - start) / duration, 0, 1);

      if (!this._fifoAnim.popupFired && p > 0.32) {
        this._fifoAnim.popupFired = true;
        if (fifo.evicted) {
          const wrongKick = this._lruAnim?.lru.after.includes(fifo.evicted);
          this.popups.spawn(
            FIFO_TRAY_POS.clone().add(new THREE.Vector3(0, 0.56, 0)),
            wrongKick ? `FIFO 误踢 ${fifo.evicted}!` : `FIFO 淘汰 ${fifo.evicted}`,
            wrongKick ? 'danger' : 'amber'
          );
        } else if (fifo.hit) {
          const slotIdx = afterRev.indexOf(fifo.key);
          this.popups.spawn(FIFO_BAY_POS[slotIdx].clone().add(new THREE.Vector3(0, 0.54, 0)), 'FIFO 命中', 'teal');
        }
      }

      for (const [idx, id] of afterRev.entries()) {
        const e = entries.get(id);
        if (!e) continue;
        const delay = fifo.hit ? 0 : (id === fifo.key ? 0.34 : 0.16);
        const t = smooth((p - delay) / (1 - delay));
        e.card.group.position.lerpVectors(e.startPos, FIFO_BAY_POS[idx], t);
        const isIncoming = !fifo.hit && id === fifo.key;
        const isHit = fifo.hit && id === fifo.key;
        e.card.group.position.y += Math.sin(t * Math.PI) * (isIncoming ? 1.05 : isHit ? 0.36 : 0) + e.card.spring.value;
        if (isIncoming) e.card.group.scale.setScalar(e.startScale + (1 - e.startScale) * t);
      }

      if (fifo.evicted && entries.has(fifo.evicted)) {
        const ev = entries.get(fifo.evicted);
        if (p < 0.45) {
          const t = smooth((p - 0.14) / 0.31);
          ev.card.group.position.lerpVectors(ev.startPos, FIFO_RAMP_LIP, t);
          ev.card.group.rotation.z = -0.14 * t;
        } else {
          const t = smooth((p - 0.45) / 0.5);
          ev.card.group.position.lerpVectors(FIFO_RAMP_LIP, FIFO_TRAY_POS, t);
          ev.card.group.position.y += Math.sin(t * Math.PI) * 0.18;
          ev.card.group.rotation.z = -0.22 * (1 - t);
          ev.card.group.scale.setScalar(1 - 0.14 * t);
        }
      }

      if (p >= 1) {
        const newEntry = entries.get(fifo.key);
        if (newEntry) newEntry.card.spring.impulse(-2.0);
        if (fifo.evicted && entries.has(fifo.evicted)) {
          const ev = entries.get(fifo.evicted);
          this._fifoCards.delete(fifo.evicted);
          this._fifoEvictedCard = { id: fifo.evicted, group: ev.card.group };
          this._fifoEvictedCard.group.position.copy(FIFO_TRAY_POS);
          this._fifoEvictedCard.group.rotation.set(0, 0, 0);
          this._fifoEvictedCard.group.scale.setScalar(0.86);
        }
        this._fifoAnim = null;
      }
    }

    this.callouts.update();
  }

  dispose() {
    this.stage.dispose();
  }
}
