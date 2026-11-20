import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CalloutLayer } from '../../kit/callout-layer.js';
import { SOLID_LAYER } from '../../kit/outline-pass.js';
import { FloatingPopups } from '../../kit/popups.js';
import { clamp, Spring } from '../../kit/spring.js';
import { IsometricStage } from '../../kit/stage-3d.js';

const DEG = Math.PI / 180;

function makeLabelTex(text, { bg = '#18213d', fg = '#faf4e8', border = '#d4ab58', w = 256, h = 72, font = 'bold 34px "Cascadia Code", monospace' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeScaleTex() {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#faf4e8';
  ctx.fillRect(0, 0, 160, 512);
  ctx.strokeStyle = '#18213d';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 154, 506);

  const temps = [24, 22, 20, 18, 16];
  ctx.font = 'bold 30px "Cascadia Code", monospace';
  ctx.textBaseline = 'middle';
  temps.forEach((t, idx) => {
    const y = 56 + idx * 100;
    ctx.fillStyle = t === 18 ? '#c96d24' : t === 22 ? '#149694' : '#18213d';
    ctx.fillRect(14, y - 3, 34, 6);
    ctx.textAlign = 'left';
    ctx.fillText(`${t}°`, 58, y);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class ThermostatWorkbenchScene {
  constructor({ canvas, svgLeaders, tagsLayer, popupsLayer, tooltipEl, sound, onTempDelta, onInspect }) {
    this.sound = sound;
    this.tooltipEl = tooltipEl;
    this.onTempDelta = onTempDelta;
    this.onInspect = onInspect;

    this.stage = new IsometricStage(canvas, {
      target: [0.1, 0.72, 0.0],
      baseSpan: 7.4,
      azimuth: 34 * DEG,
      elevation: 32 * DEG,
      zoom: 1.12,
      shadowBounds: 10,
      gridSize: 24,
      onHover: (hit, x, y) => this._handleHover(hit, x, y),
      onSelect: (hit) => this._handleSelect(hit),
    });

    this.callouts = new CalloutLayer(this.stage, svgLeaders, tagsLayer);
    this.popups = new FloatingPopups(this.stage, popupsLayer);

    this.tempSpring = new Spring({ value: 20, target: 20, stiffness: 180, damping: 20 });
    this.snapSpring = new Spring({ value: 0, target: 0, stiffness: 420, damping: 16 });
    this.coilSpring = new Spring({ value: 0, target: 0, stiffness: 140, damping: 22 });

    this._segments = [];
    this._sparkTimer = 0;
    this._buildInstrument();
    this._setupCallouts();
    this.stage.onFrame((now, dt) => this._tick(now, dt));
  }

  _buildInstrument() {
    const slateMat = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.48, metalness: 0.14 });
    const navyMat = new THREE.MeshStandardMaterial({ color: '#24304a', roughness: 0.44, metalness: 0.22 });
    const brassMat = new THREE.MeshStandardMaterial({ color: '#d4ab58', roughness: 0.32, metalness: 0.58 });
    const copperMat = new THREE.MeshStandardMaterial({ color: '#d97343', roughness: 0.36, metalness: 0.45 });
    const steelMat = new THREE.MeshStandardMaterial({ color: '#6e7b8b', roughness: 0.38, metalness: 0.6 });

    // Main base deck
    const deck = new THREE.Mesh(new RoundedBoxGeometry(5.6, 0.36, 3.2, 4, 0.08), slateMat);
    deck.position.set(0, 0.18, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.stage.scene.add(deck);

    // Front silkscreen title plate
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.3),
      new THREE.MeshBasicMaterial({ map: makeLabelTex('THERMOSTAT · 双金属温控台', { w: 512, h: 72, font: 'bold 30px "Segoe UI", sans-serif' }) })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(-0.3, 0.363, 1.32);
    this.stage.scene.add(plate);

    // Corner screws
    for (const sx of [-2.55, 2.55]) {
      for (const sz of [-1.35, 1.35]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), brassMat);
        bolt.position.set(sx, 0.37, sz);
        this.stage.scene.add(bolt);
      }
    }

    // 1. Left: Glass Thermometer Column & Scale
    const thermoGroup = new THREE.Group();
    const scaleBack = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.95, 0.16, 2, 0.03), navyMat);
    scaleBack.position.set(-2.05, 1.33, -0.35);
    scaleBack.castShadow = true;
    thermoGroup.add(scaleBack);

    const scaleFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 1.75),
      new THREE.MeshBasicMaterial({ map: makeScaleTex() })
    );
    scaleFace.position.set(-2.05, 1.33, -0.265);
    thermoGroup.add(scaleFace);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 18, 18),
      new THREE.MeshStandardMaterial({ color: '#c9483b', roughness: 0.28 })
    );
    bulb.position.set(-2.05, 0.56, -0.05);
    bulb.castShadow = true;
    thermoGroup.add(bulb);

    this._mercuryMat = new THREE.MeshStandardMaterial({ color: '#c9483b', roughness: 0.25 });
    this._mercury = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.0, 14), this._mercuryMat);
    this._mercury.position.set(-2.05, 1.05, -0.05);
    thermoGroup.add(this._mercury);

    const glassTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 1.65, 16),
      new THREE.MeshStandardMaterial({ color: '#eef5f7', transparent: true, opacity: 0.28, roughness: 0.1 })
    );
    glassTube.position.set(-2.05, 1.38, -0.05);
    thermoGroup.add(glassTube);

    this.stage.scene.add(thermoGroup);
    this.stage.registerPickable('thermometer', thermoGroup, {
      kind: 'part',
      title: '液体温度计',
      hint: '实时显示当前模拟室温 (16–24 °C)',
      ringPos: new THREE.Vector3(-2.05, 0.37, -0.15),
      ringRadius: 0.62,
      ringColor: '#18213d',
    });

    // 2. Center: Articulated Bimetallic Strip + Contact + Magnet
    const anchor = new THREE.Mesh(new RoundedBoxGeometry(0.32, 1.15, 0.54, 2, 0.04), navyMat);
    anchor.position.set(-1.1, 0.93, 0.0);
    anchor.castShadow = true;
    this.stage.scene.add(anchor);

    this._stripRoot = new THREE.Group();
    this._stripRoot.position.set(-0.94, 1.25, 0.0);
    this.stage.scene.add(this._stripRoot);

    let parent = this._stripRoot;
    const segLen = 0.16;
    for (let i = 0; i < 10; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(i === 0 ? 0 : segLen, 0, 0);

      // Top copper layer (expands more) & bottom steel layer
      const cu = new THREE.Mesh(new THREE.BoxGeometry(segLen * 1.04, 0.045, 0.36), copperMat);
      cu.position.set(segLen * 0.5, 0.023, 0);
      cu.castShadow = true;
      const st = new THREE.Mesh(new THREE.BoxGeometry(segLen * 1.04, 0.045, 0.36), steelMat);
      st.position.set(segLen * 0.5, -0.023, 0);
      st.castShadow = true;

      pivot.add(cu, st);
      parent.add(pivot);
      this._segments.push(pivot);
      parent = pivot;
    }

    // Contact tip & spark sphere at strip end
    this._tipContact = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 14), brassMat);
    this._tipContact.position.set(segLen, 0, 0);
    parent.add(this._tipContact);

    this._sparkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#ffae38', transparent: true, opacity: 0 })
    );
    this._sparkMesh.position.set(segLen, 0.08, 0);
    this._sparkMesh.visible = false;
    parent.add(this._sparkMesh);

    this.stage.registerPickable('bimetal', this._stripRoot, {
      kind: 'part',
      title: '双金属弯曲片（铜/钢）',
      hint: '铜层热胀冷缩更明显：低温向上弯接通，高温向下弯断开',
      ringPos: new THREE.Vector3(-0.2, 0.37, 0.0),
      ringRadius: 0.9,
      ringColor: '#c96d24',
    });

    // Upper Fixed Contact Post + Permanent Snap Magnet
    const contactTower = new THREE.Group();
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.28, 1.38, 0.42, 2, 0.03), navyMat);
    post.position.set(0.85, 1.05, -0.35);
    post.castShadow = true;
    contactTower.add(post);

    const upperArm = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.1, 0.42, 2, 0.02), brassMat);
    upperArm.position.set(0.75, 1.54, -0.08);
    contactTower.add(upperArm);

    const magnet = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.18, 0.24, 2, 0.03), navyMat);
    magnet.position.set(0.76, 1.36, -0.22);
    contactTower.add(magnet);

    const magBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.29, 0.06, 0.25),
      new THREE.MeshStandardMaterial({ color: '#c9483b', roughness: 0.4 })
    );
    magBand.position.set(0.76, 1.29, -0.22);
    contactTower.add(magBand);

    this.stage.scene.add(contactTower);
    this.stage.registerPickable('magnet', contactTower, {
      kind: 'part',
      title: '永磁吸合触点',
      hint: '磁铁产生 4 °C 滞回死区：吸合后会稳稳保持到 22 °C 才松开',
      ringPos: new THREE.Vector3(0.8, 0.37, -0.22),
      ringRadius: 0.65,
      ringColor: '#149694',
    });

    // 3. Right: Ceramic Heating Coil
    const heaterGroup = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.38, 0.26, 1.38, 3, 0.06), navyMat);
    base.position.set(1.85, 0.49, -0.15);
    base.castShadow = true;
    base.receiveShadow = true;
    heaterGroup.add(base);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.36, 0.96, 18),
      new THREE.MeshStandardMaterial({ color: '#d8d0bf', roughness: 0.65 })
    );
    core.position.set(1.85, 1.08, -0.15);
    core.castShadow = true;
    heaterGroup.add(core);

    this._coilMat = new THREE.MeshStandardMaterial({
      color: '#5a504b',
      emissive: '#ff5d14',
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.3,
    });
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.055, 10, 26), this._coilMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(1.85, 0.72 + i * 0.17, -0.15);
      ring.castShadow = true;
      heaterGroup.add(ring);
    }

    this._heaterLight = new THREE.PointLight('#ff7726', 0, 5.5);
    this._heaterLight.position.set(1.85, 1.18, -0.15);
    this.stage.scene.add(this._heaterLight);

    this.stage.scene.add(heaterGroup);
    this.stage.registerPickable('heater', heaterGroup, {
      kind: 'part',
      title: '陶瓷加热器线圈',
      hint: '触点闭合时通电发红升温，断开后逐渐冷却',
      ringPos: new THREE.Vector3(1.85, 0.37, -0.15),
      ringRadius: 0.92,
      ringColor: '#c96d24',
    });

    // 4. Directly Clickable 3D -1°C / +1°C Brass Push-Buttons
    for (const spec of [
      { id: 'btn-down', x: 1.38, text: '-1°', delta: -1, color: '#149694', hint: '点击直接在 3D 台面降温 1 °C' },
      { id: 'btn-up', x: 2.15, text: '+1°', delta: 1, color: '#c96d24', hint: '点击直接在 3D 台面升温 1 °C' },
    ]) {
      const g = new THREE.Group();
      const cap = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.16, 0.56, 2, 0.04), brassMat);
      cap.position.set(spec.x, 0.44, 1.15);
      cap.castShadow = true;
      g.add(cap);

      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.38),
        new THREE.MeshBasicMaterial({ map: makeLabelTex(spec.text, { bg: '#faf4e8', fg: '#18213d', border: spec.color, w: 128, h: 112, font: 'bold 48px "Cascadia Code", monospace' }) })
      );
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(spec.x, 0.525, 1.15);
      g.add(lbl);

      this.stage.scene.add(g);
      this.stage.registerPickable(spec.id, g, {
        kind: 'dial',
        delta: spec.delta,
        title: `机台调节钮 ${spec.text}`,
        hint: spec.hint,
        ringPos: new THREE.Vector3(spec.x, 0.38, 1.15),
        ringRadius: 0.54,
        ringColor: spec.color,
      });
    }
  }

  _setupCallouts() {
    this.callouts.setItems([
      {
        id: 'strip',
        getWorldPos: () => new THREE.Vector3(-0.2, 1.4, 0.0),
        dx: -42,
        dy: -72,
        tone: 'teal',
        label: '双金属片',
        sublabel: '20 °C',
      },
      {
        id: 'magnet',
        getWorldPos: () => new THREE.Vector3(0.8, 1.56, -0.22),
        dx: 48,
        dy: -68,
        tone: 'amber',
        label: '磁吸触点',
        sublabel: '18°吸合 / 22°断开',
      },
      {
        id: 'heater',
        getWorldPos: () => new THREE.Vector3(1.85, 1.35, -0.15),
        dx: 54,
        dy: -38,
        tone: '',
        label: '加热线圈',
        sublabel: '关闭',
      },
    ]);
  }

  setCameraPreset(preset) {
    if (preset) this.stage.flyTo(preset, 460);
  }

  setCalloutsVisible(v) {
    this.callouts.setEnabled(v);
  }

  _handleHover(hit, x, y) {
    if (!hit) {
      this.tooltipEl.hidden = true;
      this.stage.clearHighlightRing();
      return;
    }
    if (hit.meta.ringPos) {
      this.stage.setHighlightRing(hit.meta.ringPos, hit.meta.ringRadius ?? 0.7, hit.meta.ringColor ?? '#18213d');
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
    if (hit.meta.kind === 'dial' && this.onTempDelta) {
      this.onTempDelta(hit.meta.delta);
      return;
    }
    if (this.onInspect) this.onInspect(hit.id, hit.meta);
  }

  syncState({ temperature, heating, flipped, lastFlip, band }, { animate = true } = {}) {
    this.tempSpring.target = temperature;
    this.snapSpring.target = heating ? 0.24 : -0.14;
    this.coilSpring.target = heating ? 1 : 0;

    if (!animate || this.stage.reducedMotion) {
      this.tempSpring.snap(temperature);
      this.snapSpring.snap(this.snapSpring.target);
      this.coilSpring.snap(this.coilSpring.target);
    }

    if (flipped) {
      this._sparkTimer = 0.22;
      this.snapSpring.impulse(lastFlip === 'on' ? 3.5 : -3.5);
      if (lastFlip === 'on') this.sound.hit();
      else this.sound.evict();

      this.popups.spawn(
        new THREE.Vector3(0.75, 1.72, -0.05),
        lastFlip === 'on' ? '触点吸合 · 加热开!' : '触点断开 · 加热关',
        lastFlip === 'on' ? 'amber' : 'teal'
      );
    }

    this.callouts.updateItem('strip', { sublabel: `${temperature} °C` });
    this.callouts.updateItem('magnet', {
      sublabel: band > 0 ? '18°开 / 22°关' : '20° 无回差',
    });
    this.callouts.updateItem('heater', {
      sublabel: heating ? '加热中' : '关闭',
      tone: heating ? 'amber' : '',
    });
  }

  _tick(now, dt) {
    const temp = this.tempSpring.step(dt);
    const snap = this.snapSpring.step(dt);
    const coil = this.coilSpring.step(dt);

    // Thermometer column height: maps 16..24 -> 0.22..1.52
    const ratio = clamp((temp - 16) / 8, 0, 1);
    const colH = 0.22 + ratio * 1.3;
    this._mercury.scale.y = colH;
    this._mercury.position.y = 0.56 + colH * 0.5;

    // Bimetallic bend: colder (<20) bends upward (+Z rotation), hotter bends downward
    const bendPerSeg = (20 - temp) * 0.011 + snap * 0.045;
    for (let i = 0; i < this._segments.length; i++) {
      this._segments[i].rotation.z = bendPerSeg * (i === 0 ? 1.2 : 1.0);
    }

    // Heater glow + subtle pulse
    const pulse = coil > 0.1 && !this.stage.reducedMotion ? 0.08 * Math.sin(now * 0.008) : 0;
    this._coilMat.emissiveIntensity = clamp(coil * 1.45 + pulse, 0, 2);
    this._coilMat.color.setRGB(0.35 + 0.45 * coil, 0.31 - 0.05 * coil, 0.29 - 0.12 * coil);
    this._heaterLight.intensity = coil * 3.2;

    // Contact spark flash
    if (this._sparkTimer > 0) {
      this._sparkTimer = Math.max(0, this._sparkTimer - dt);
      this._sparkMesh.visible = this._sparkTimer > 0;
      this._sparkMesh.material.opacity = this._sparkTimer / 0.22;
      this._sparkMesh.scale.setScalar(1 + (1 - this._sparkTimer / 0.22) * 0.6);
    } else {
      this._sparkMesh.visible = false;
      this._sparkMesh.material.opacity = 0;
    }

    this.callouts.update();
  }

  dispose() {
    this.stage.dispose();
  }
}
