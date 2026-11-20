import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GROUND_LAYER, OutlinePass } from './outline-pass.js';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Reusable orthographic isometric Three.js stage with:
 * - Warm studio lighting + RoomEnvironment reflections + sepia soft shadows
 * - Normal + Depth GLSL ink outline pass (Layer 0 solids, Layer 1 floor/grid)
 * - Smooth orbit, pan, zoom, top-down toggle, and flyTo transitions
 * - Raycaster hover/click picking and 3D-to-2D screen projection
 */
export class IsometricStage {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.defaultView = {
      azimuth: options.azimuth ?? 36 * DEG,
      elevation: options.elevation ?? 40 * DEG,
      zoom: options.zoom ?? 1.0,
      target: new THREE.Vector3(...(options.target ?? [0, 0.35, 0])),
    };
    this.baseSpan = options.baseSpan ?? 11.5;
    this.distance = options.distance ?? 90;
    this.view = {
      azimuth: this.defaultView.azimuth,
      elevation: this.defaultView.elevation,
      zoom: this.defaultView.zoom,
      target: this.defaultView.target.clone(),
    };
    this._savedOblique = null;
    this._topView = false;
    this._fly = null;
    this._frameCallbacks = new Set();
    this._pickables = new Map();
    this._pickRoots = [];
    this._hoveredId = null;
    this._onHover = options.onHover ?? null;
    this._onSelect = options.onSelect ?? null;
    this._onViewChange = options.onViewChange ?? null;
    this._drag = null;
    this._raf = 0;
    this._disposed = false;
    this.size = { width: 800, height: 500, dpr: 1 };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 240);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = options.envIntensity ?? 0.38;
    pmrem.dispose();

    this.outline = new OutlinePass(this.renderer, {
      lineColor: options.lineColor ?? '#141a2c',
      thickness: options.lineThickness ?? 1.25,
      opacity: options.lineOpacity ?? 0.92,
      depthThreshold: options.depthThreshold ?? 0.32,
      normalThreshold: options.normalThreshold ?? 0.22,
    });

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmpVec = new THREE.Vector3();

    this._setupLights(options.shadowBounds ?? 16);
    this._setupGround(options.groundY ?? 0, options.gridSize ?? 36);
    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);
    this.resize();
    this._startLoop();
  }

  _setupLights(shadowBounds) {
    const hemi = new THREE.HemisphereLight(0xfffaf3, 0xc2ae90, 0.62);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff6ea, 1.18);
    key.position.set(-45, 90, 58);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xdfe8f2, 0.24);
    fill.position.set(42, 34, 48);
    this.scene.add(fill);

    const shadowLight = new THREE.DirectionalLight(0xffffff, 0.16);
    shadowLight.position.set(52, 94, -26);
    shadowLight.target.position.set(0, 0, 0);
    shadowLight.castShadow = true;
    shadowLight.shadow.mapSize.set(2048, 2048);
    shadowLight.shadow.camera.left = -shadowBounds;
    shadowLight.shadow.camera.right = shadowBounds;
    shadowLight.shadow.camera.top = shadowBounds;
    shadowLight.shadow.camera.bottom = -shadowBounds;
    shadowLight.shadow.camera.near = 10;
    shadowLight.shadow.camera.far = 200;
    shadowLight.shadow.radius = 4;
    shadowLight.shadow.bias = -0.0004;
    this.scene.add(shadowLight);
    this.scene.add(shadowLight.target);
  }

  _setupGround(groundY, gridSize) {
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.ShadowMaterial({ color: 0x7a5532, opacity: 0.27, depthWrite: false })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = groundY;
    shadowPlane.receiveShadow = true;
    shadowPlane.layers.set(GROUND_LAYER);
    shadowPlane.renderOrder = -1;
    this.scene.add(shadowPlane);

    const grid = new THREE.GridHelper(gridSize, gridSize / 1.5, 0xc0b097, 0xd8cbb6);
    grid.position.y = groundY - 0.008;
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = 0.42;
      m.depthWrite = false;
    }
    grid.layers.set(GROUND_LAYER);
    grid.renderOrder = -2;
    this.scene.add(grid);

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
    this.scene.add(this._ringMesh);
  }

  setHighlightRing(worldPos, radius = 0.85, color = '#149694') {
    this._ringMesh.position.copy(worldPos);
    this._ringMesh.scale.setScalar(radius / 0.85);
    this._ringMat.color.set(color);
    this._ringMesh.visible = true;
  }

  clearHighlightRing() {
    this._ringMesh.visible = false;
  }

  _bindEvents() {
    const c = this.canvas;
    c.style.cursor = 'grab';
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this._fly = null;
      c.setPointerCapture(e.pointerId);
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

    c.addEventListener('pointermove', (e) => {
      if (this._drag && e.pointerId === this._drag.id) {
        const dx = e.clientX - this._drag.lastX;
        const dy = e.clientY - this._drag.lastY;
        this._drag.lastX = e.clientX;
        this._drag.lastY = e.clientY;
        this._drag.moved += Math.hypot(dx, dy);

        if (this._drag.mode === 'orbit') {
          this.view.azimuth -= dx * 0.0072;
          this.view.elevation = clamp(this.view.elevation + dy * 0.0068, 15 * DEG, 86 * DEG);
          this._topView = false;
        } else {
          const span = this.baseSpan / this.view.zoom;
          const scale = span / Math.max(this.size.height, 240);
          const forward = new THREE.Vector3(-Math.sin(this.view.azimuth), 0, -Math.cos(this.view.azimuth));
          const right = new THREE.Vector3(Math.cos(this.view.azimuth), 0, -Math.sin(this.view.azimuth));
          this.view.target.addScaledVector(right, -dx * scale);
          this.view.target.addScaledVector(forward, dy * scale);
          this.view.target.x = clamp(this.view.target.x, -9, 9);
          this.view.target.z = clamp(this.view.target.z, -9, 9);
        }
        this._updateCamera();
        this._notifyViewChange();
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
    };

    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);
    c.addEventListener('pointerleave', () => {
      if (!this._drag) this._setHover(null, 0, 0);
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this._fly = null;
        const factor = Math.exp(-e.deltaY * 0.0011);
        this.view.zoom = clamp(this.view.zoom * factor, 0.58, 2.35);
        this._updateCamera();
        this._notifyViewChange();
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
    if (!this._drag) {
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

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(200, Math.round(rect.width));
    const height = Math.max(160, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.size.width && height === this.size.height && dpr === this.size.dpr) return;
    this.size = { width, height, dpr };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.outline.setSize(width, height, dpr);
    this._updateCamera();
  }

  _updateCamera() {
    const aspect = this.size.width / Math.max(1, this.size.height);
    const fitBoost = aspect < 1 ? 1.48 : 1.0;
    const halfH = (this.baseSpan * fitBoost) / (2 * this.view.zoom);
    const halfW = halfH * aspect;

    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    const { target, azimuth, elevation } = this.view;
    const cosEl = Math.cos(elevation);
    this.camera.position.set(
      target.x + this.distance * cosEl * Math.sin(azimuth),
      target.y + this.distance * Math.sin(elevation),
      target.z + this.distance * cosEl * Math.cos(azimuth)
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  flyTo(goal = {}, durationMs = 420) {
    const targetGoal = goal.target ? new THREE.Vector3(...goal.target) : this.view.target.clone();
    const nextAz = goal.azimuth ?? this.view.azimuth;
    const nextEl = clamp(goal.elevation ?? this.view.elevation, 15 * DEG, 86 * DEG);
    const nextZoom = clamp(goal.zoom ?? this.view.zoom, 0.58, 2.35);

    if (this.reducedMotion || durationMs <= 0) {
      this.view.azimuth = nextAz;
      this.view.elevation = nextEl;
      this.view.zoom = nextZoom;
      this.view.target.copy(targetGoal);
      this._fly = null;
      this._updateCamera();
      this._notifyViewChange();
      return;
    }

    this._fly = {
      start: performance.now(),
      duration: durationMs,
      fromAz: this.view.azimuth,
      fromEl: this.view.elevation,
      fromZoom: this.view.zoom,
      fromTarget: this.view.target.clone(),
      toAz: nextAz,
      toEl: nextEl,
      toZoom: nextZoom,
      toTarget: targetGoal,
    };
  }

  /** Focus camera cleanly on a registered pickable object ("Zoom to it"). */
  focusPart(id, zoom = 1.48) {
    const entry = this._pickables.get(id);
    if (!entry) return false;
    const center = new THREE.Box3().setFromObject(entry.object3D).getCenter(new THREE.Vector3());
    this.setHighlightRing(entry.object3D);
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
        target: [this.view.target.x, this.view.target.y, this.view.target.z],
      };
      this._topView = true;
      this.flyTo({ azimuth: 0, elevation: 85 * DEG, zoom: Math.min(this.view.zoom, 1.05) }, 420);
    } else {
      const restore = this._savedOblique || {
        azimuth: this.defaultView.azimuth,
        elevation: this.defaultView.elevation,
        zoom: this.defaultView.zoom,
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
    this.flyTo(
      {
        azimuth: this.defaultView.azimuth,
        elevation: this.defaultView.elevation,
        zoom: this.defaultView.zoom,
        target: [this.defaultView.target.x, this.defaultView.target.y, this.defaultView.target.z],
      },
      380
    );
    this._notifyViewChange();
  }

  isTopView() {
    return this._topView;
  }

  getCameraState() {
    return {
      azimuthDeg: +(this.view.azimuth / DEG).toFixed(1),
      elevationDeg: +(this.view.elevation / DEG).toFixed(1),
      zoom: +this.view.zoom.toFixed(2),
      topView: this._topView,
    };
  }

  _notifyViewChange() {
    if (this._onViewChange) {
      this._onViewChange(this.getCameraState());
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
    return () => this._frameCallbacks.delete(fn);
  }

  _startLoop() {
    let last = performance.now();
    const tick = (now) => {
      if (this._disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (this._fly) {
        const t = clamp((now - this._fly.start) / this._fly.duration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        this.view.azimuth = this._fly.fromAz + (this._fly.toAz - this._fly.fromAz) * ease;
        this.view.elevation = this._fly.fromEl + (this._fly.toEl - this._fly.fromEl) * ease;
        this.view.zoom = this._fly.fromZoom + (this._fly.toZoom - this._fly.fromZoom) * ease;
        this.view.target.lerpVectors(this._fly.fromTarget, this._fly.toTarget, ease);
        this._updateCamera();
        if (t >= 1) {
          this._fly = null;
          this._notifyViewChange();
        }
      }

      for (const fn of this._frameCallbacks) {
        fn(now, dt);
      }
      if (this._ringMesh.visible && !this.reducedMotion) {
        this._ringMat.opacity = 0.72 + 0.22 * Math.sin(now * 0.007);
      }
      this.outline.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.outline.dispose();
    this._envRT.dispose();
    this.renderer.dispose();
  }
}
