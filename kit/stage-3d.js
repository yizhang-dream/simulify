import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HtmlSurfaceManager, supportsHtmlInCanvas } from './html-surface.js';
import { GROUND_LAYER, OutlinePass, SOLID_LAYER } from './outline-pass.js';

export { GROUND_LAYER, SOLID_LAYER };

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const STUDIO_THEMES = {
  'paper-ink': {
    hemiSky: 0xfffaf3,
    hemiGround: 0xc2ae90,
    hemiIntensity: 0.62,
    keyColor: 0xfff6ea,
    keyIntensity: 1.18,
    fillColor: 0xdfe8f2,
    fillIntensity: 0.24,
    shadowColor: 0x7a5532,
    shadowOpacity: 0.27,
    gridCenter: 0xc0b097,
    gridLine: 0xd8cbb6,
    gridOpacity: 0.42,
    envIntensity: 0.38,
    inkColor: '#141a2c',
    inkOpacity: 0.92,
  },
  'dark-studio': {
    hemiSky: 0xdbeafe,
    hemiGround: 0x1e293b,
    hemiIntensity: 0.56,
    keyColor: 0xf8fafc,
    keyIntensity: 1.25,
    fillColor: 0x38bdf8,
    fillIntensity: 0.34,
    shadowColor: 0x050811,
    shadowOpacity: 0.48,
    gridCenter: 0x334155,
    gridLine: 0x1e293b,
    gridOpacity: 0.52,
    envIntensity: 0.52,
    inkColor: '#060911',
    inkOpacity: 0.72,
  },
  'bio-cutaway': {
    hemiSky: 0xf4fbf9,
    hemiGround: 0x8faea7,
    hemiIntensity: 0.66,
    keyColor: 0xfafffe,
    keyIntensity: 1.12,
    fillColor: 0xd1fae5,
    fillIntensity: 0.28,
    shadowColor: 0x254442,
    shadowOpacity: 0.24,
    gridCenter: 0x9eb8b1,
    gridLine: 0xc3d5d0,
    gridOpacity: 0.4,
    envIntensity: 0.42,
    inkColor: '#142b2e',
    inkOpacity: 0.88,
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

/**
 * Simulify v2 3D/4D Stage supporting:
 * - Automatic 3-tier backend: Hardware WebGPU -> WebGL2 (TSL) -> Graceful Fallback
 * - Full backward compatibility for v1 benches using `three.module.js` (`WebGLRenderer`)
 * - Orthographic & Perspective cameras, cutaway clipping planes, opt-in TSL/GLSL ink outlines
 * - Theme-aware lighting, shadows, and grid (`paper-ink`, `dark-studio`, `bio-cutaway`)
 * - Native HTML-in-Canvas surface manager (`stage.htmlSurfaces`) with Firefox/Safari fallback
 * - Deterministic manual/export contract (`setManualMode`, `renderNow`, `renderFrame`,
 *   `setCameraImmediate`, `setExportSize`, `restoreSize`)
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
    this.outlineEnabled = options.outline !== false;
    this.themeName = detectThemeName(options.theme);

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
    this._raf = 0;
    this._lastFrameTime = null;
    this._manualMode = options.autoLoop === false;
    this._exportSize = null;
    this._disposed = false;
    this._rendererReady = false;
    this.size = { width: 800, height: 500, dpr: 1 };
    this.backendKind = 'pending';
    this.htmlInCanvasSupported = supportsHtmlInCanvas();
    this.gpuErrors = [];

    this.scene = new THREE.Scene();
    this.camera = this._createCamera();
    this.camera.layers.enable(SOLID_LAYER);
    this.camera.layers.enable(GROUND_LAYER);

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmpVec = new THREE.Vector3();

    this._gridSize = options.gridSize ?? 36;
    this._groundY = options.groundY ?? 0;
    this._showGrid = options.showGrid !== false;
    this._showGround = options.showGround !== false;

    this._setupLights(options.shadowBounds ?? 16);
    this._setupGround(this._groundY, this._gridSize);

    // Attach HtmlSurfaceManager early so callers can mount surfaces before or after stage.ready
    this.htmlSurfaces =
      options.htmlInCanvas === false
        ? null
        : new HtmlSurfaceManager(this, {
            enabled: options.htmlInCanvas !== false,
          });

    this._bindEvents();
    this._resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this._resizeObserver?.observe(canvas);

    this.renderer = null;
    this._envRT = null;
    this.outline = null;

    const requestedBackend = parseRequestedBackend(options.backend);
    const useWebGPURenderer = Boolean(THREE.WebGPURenderer) && requestedBackend !== 'legacy-webgl';

    if (useWebGPURenderer) {
      this.ready = this._initWebGPURenderer(options, requestedBackend);
    } else {
      this._initLegacyWebGLRenderer(options);
      this.ready = Promise.resolve(this);
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
    try {
      let forceWebGL = requestedBackend === 'webgl2';

      if (!forceWebGL) {
        let adapter = null;
        if (typeof navigator !== 'undefined' && navigator.gpu) {
          try {
            adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
          } catch {
            adapter = null;
          }
        }
        const isSoftwareFallback = Boolean(
          adapter && (adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter)
        );
        // Only engage WebGPU automatically on real hardware adapters (avoids Linux headless
        // Dawn SwiftShader silent-blank regression unless explicitly forced via ?backend=webgpu)
        if (!adapter || (isSoftwareFallback && requestedBackend !== 'webgpu')) {
          forceWebGL = true;
        }
      }

      if (this._disposed) return this;

      const renderer = new THREE.WebGPURenderer({
        canvas: this.canvas,
        antialias: options.antialias !== false,
        alpha: options.alpha !== false,
        forceWebGL,
      });
      await renderer.init();

      if (this._disposed) {
        renderer.dispose();
        return this;
      }

      this.renderer = renderer;
      this.backendKind = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';

      if (renderer.backend?.device) {
        renderer.backend.device.addEventListener('uncapturederror', (ev) => {
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
        this._startLoop();
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
        preserveDrawingBuffer: Boolean(options.preserveDrawingBuffer),
        powerPreference: 'high-performance',
      });
      this.renderer = renderer;
      this.backendKind = renderer.capabilities?.isWebGL2 ? 'webgl2' : 'webgl';
      this._configureRendererCommon(options);
      this._rendererReady = true;
      this.resize(true);
      if (!this._manualMode) {
        this._startLoop();
      }
    } catch (err) {
      this._enterFallback(err);
    }
  }

  _configureRendererCommon(options) {
    const theme = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const r = this.renderer;

    if (typeof r.setClearColor === 'function') {
      r.setClearColor(0x000000, 0);
    }
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = options.toneMappingExposure ?? 1.02;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = Boolean(options.localClippingEnabled ?? true);

    try {
      const pmrem = new THREE.PMREMGenerator(r);
      this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = this._envRT.texture;
      this.scene.environmentIntensity = options.envIntensity ?? theme.envIntensity;
      pmrem.dispose();
    } catch {
      this._envRT = null;
    }

    if (this.outlineEnabled) {
      this.outline = new OutlinePass(r, {
        lineColor: options.lineColor ?? theme.inkColor,
        thickness: options.lineThickness ?? 1.25,
        opacity: options.lineOpacity ?? theme.inkOpacity,
        depthThreshold: options.depthThreshold ?? 0.32,
        normalThreshold: options.normalThreshold ?? 0.22,
        bloom: options.bloom ?? false,
      });
    }
  }

  _enterFallback(error) {
    this.backendKind = 'fallback';
    this._rendererReady = false;
    const reason = error instanceof Error ? error.message : String(error || 'WebGPU/WebGL unavailable');
    if (this.canvas) {
      this.canvas.dataset.stageFallback = 'true';
      this.canvas.dispatchEvent(
        new CustomEvent('stage:fallback', {
          bubbles: true,
          detail: { reason, error },
        })
      );
    }
  }

  _setupLights(shadowBounds) {
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];

    this._hemiLight = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiIntensity);
    this.scene.add(this._hemiLight);

    this._keyLight = new THREE.DirectionalLight(t.keyColor, t.keyIntensity);
    this._keyLight.position.set(-45, 90, 58);
    this.scene.add(this._keyLight);

    this._fillLight = new THREE.DirectionalLight(t.fillColor, t.fillIntensity);
    this._fillLight.position.set(42, 34, 48);
    this.scene.add(this._fillLight);

    this._shadowLight = new THREE.DirectionalLight(0xffffff, 0.16);
    this._shadowLight.position.set(52, 94, -26);
    this._shadowLight.target.position.set(0, 0, 0);
    this._shadowLight.castShadow = true;
    this._shadowLight.shadow.mapSize.set(2048, 2048);
    this._shadowLight.shadow.camera.left = -shadowBounds;
    this._shadowLight.shadow.camera.right = shadowBounds;
    this._shadowLight.shadow.camera.top = shadowBounds;
    this._shadowLight.shadow.camera.bottom = -shadowBounds;
    this._shadowLight.shadow.camera.near = 10;
    this._shadowLight.shadow.camera.far = 200;
    this._shadowLight.shadow.radius = 4;
    this._shadowLight.shadow.bias = -0.0004;
    this.scene.add(this._shadowLight);
    this.scene.add(this._shadowLight.target);
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
    this.scene.add(this._shadowPlane);

    this._grid = null;
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
    const divisions = Math.max(4, Math.round(gridSize / 1.5));
    const grid = new THREE.GridHelper(gridSize, divisions, theme.gridCenter, theme.gridLine);
    grid.position.y = groundY - 0.008;
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = theme.gridOpacity;
      m.depthWrite = false;
    }
    grid.layers.set(GROUND_LAYER);
    grid.renderOrder = -2;
    grid.visible = this._showGrid;
    this.scene.add(grid);
    this._grid = grid;
  }

  /** Switch studio lighting, shadow tint, grid palette, and outline ink live. */
  setTheme(themeName) {
    const key = STUDIO_THEMES[themeName] ? themeName : 'paper-ink';
    this.themeName = key;
    const t = STUDIO_THEMES[key];
    this._hemiLight.color.setHex(t.hemiSky);
    this._hemiLight.groundColor.setHex(t.hemiGround);
    this._hemiLight.intensity = t.hemiIntensity;
    this._keyLight.color.setHex(t.keyColor);
    this._keyLight.intensity = t.keyIntensity;
    this._fillLight.color.setHex(t.fillColor);
    this._fillLight.intensity = t.fillIntensity;
    this._shadowMat.color.setHex(t.shadowColor);
    this._shadowMat.opacity = t.shadowOpacity;
    if (this.scene.environment) {
      this.scene.environmentIntensity = this._options.envIntensity ?? t.envIntensity;
    }
    this._rebuildGrid(this._groundY, this._gridSize, t);
    if (this.outline && this._options.lineColor === undefined) {
      this.outline.setInkColor(t.inkColor, this._options.lineOpacity ?? t.inkOpacity);
    }
  }

  /** Toggle camera orbit/pan/zoom input (e.g. while a 3D manipulator owns the drag). */
  setOrbitEnabled(enabled) {
    this._orbitEnabled = Boolean(enabled);
    if (!this._orbitEnabled && this._drag) {
      this._drag = null;
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
    this.camera.layers.enable(SOLID_LAYER);
    this.camera.layers.enable(GROUND_LAYER);
    this._updateCamera();
    this._notifyViewChange();
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
  }

  clearHighlightRing() {
    this._ringMesh.visible = false;
  }

  _bindEvents() {
    const c = this.canvas;
    c.style.cursor = 'grab';
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
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

    c.addEventListener('pointermove', (e) => {
      if (this._drag && e.pointerId === this._drag.id) {
        const dx = e.clientX - this._drag.lastX;
        const dy = e.clientY - this._drag.lastY;
        this._drag.lastX = e.clientX;
        this._drag.lastY = e.clientY;
        this._drag.moved += Math.hypot(dx, dy);

        if (this._drag.mode === 'orbit') {
          this.view.azimuth -= dx * 0.0072;
          this.view.elevation = clamp(this.view.elevation + dy * 0.0068, 12 * DEG, 86 * DEG);
          this._topView = false;
        } else {
          const span =
            this.cameraType === 'perspective'
              ? 2 * (this.view.distance / this.view.zoom) * Math.tan((this.fov * DEG) / 2)
              : this.baseSpan / this.view.zoom;
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
        if (!this._orbitEnabled) return;
        e.preventDefault();
        this._fly = null;
        const factor = Math.exp(-e.deltaY * 0.0011);
        this.view.zoom = clamp(this.view.zoom * factor, 0.5, 2.8);
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

  /**
   * Resize renderer, outline pass, and camera. Respects locked export dimensions
   * when `setExportSize(w, h, dpr)` is active.
   */
  resize(force = false) {
    let width;
    let height;
    let dpr;
    if (this._exportSize) {
      ({ width, height, dpr } = this._exportSize);
    } else {
      const rect = this.canvas.getBoundingClientRect();
      width = Math.max(200, Math.round(rect.width || this.canvas.width || 800));
      height = Math.max(160, Math.round(rect.height || this.canvas.height || 500));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    }

    if (!force && width === this.size.width && height === this.size.height && dpr === this.size.dpr) return;
    this.size = { width, height, dpr };

    if (this.renderer) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
    }
    if (this.outline) {
      this.outline.setSize(width, height, dpr);
    }
    this._updateCamera();
    if (this.htmlSurfaces?.nativeEnabled) {
      this.htmlSurfaces.requestPaint();
    }
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
    const { target, azimuth, elevation } = this.view;
    const cosEl = Math.cos(elevation);

    if (this.cameraType === 'perspective') {
      this.camera.fov = this.fov;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      const dist = (this.view.distance || this.distance) / Math.max(0.2, this.view.zoom);
      this.camera.position.set(
        target.x + dist * cosEl * Math.sin(azimuth),
        target.y + dist * Math.sin(elevation),
        target.z + dist * cosEl * Math.cos(azimuth)
      );
    } else {
      const fitBoost = aspect < 1 ? 1.48 : 1.0;
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

  /**
   * Instant deterministic camera placement (no wall-clock flyTo easing).
   * Shared contract with ActorChoreographer cameraBeat() and deterministic exporters.
   */
  setCameraImmediate(pose = {}) {
    if (!pose) return;
    this._fly = null;
    if (pose.azimuth !== undefined) this.view.azimuth = Number(pose.azimuth);
    else if (pose.azimuthDeg !== undefined) this.view.azimuth = Number(pose.azimuthDeg) * DEG;

    if (pose.elevation !== undefined) this.view.elevation = clamp(Number(pose.elevation), 10 * DEG, 86 * DEG);
    else if (pose.elevationDeg !== undefined) {
      this.view.elevation = clamp(Number(pose.elevationDeg) * DEG, 10 * DEG, 86 * DEG);
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
  }

  flyTo(goal = {}, durationMs = 420) {
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
      this.setCameraImmediate({
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
    this.flyTo(
      {
        azimuth: this.defaultView.azimuth,
        elevation: this.defaultView.elevation,
        zoom: this.defaultView.zoom,
        distance: this.defaultView.distance,
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
      azimuth: this.view.azimuth,
      elevation: this.view.elevation,
      azimuthDeg: +(this.view.azimuth / DEG).toFixed(1),
      elevationDeg: +(this.view.elevation / DEG).toFixed(1),
      distance: +this.view.distance.toFixed(2),
      zoom: +this.view.zoom.toFixed(2),
      target: [+this.view.target.x.toFixed(3), +this.view.target.y.toFixed(3), +this.view.target.z.toFixed(3)],
      topView: this._topView,
      cameraType: this.cameraType,
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

  /**
   * Toggle manual deterministic rendering mode (stops/resumes internal rAF loop).
   * Shared contract with SpacetimeClock and StageExporter / export_video.py.
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
      this._startLoop();
    }
  }

  /**
   * Synchronously render the current scene state and sync HTML surface geometries.
   * Safe to call inside deterministic `window.__simulify.seek(t)`.
   */
  renderNow() {
    if (this._disposed || !this._rendererReady || !this.renderer) return false;
    this.scene.updateMatrixWorld();
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
    return true;
  }

  /**
   * Async render variant using Three.js renderAsync() while keeping the WebGPU
   * swapchain texture live for immediate drawImage / toBlob / VideoFrame capture.
   */
  async renderNowAsync() {
    if (this._disposed || !this._rendererReady || !this.renderer) return false;
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    if (this.htmlSurfaces) {
      this.htmlSurfaces.syncPaint(null);
      this.htmlSurfaces.updateGeometries(this.camera);
    }
    if (this.outline && this.outlineEnabled) {
      await this.outline.renderAsync(this.scene, this.camera);
    } else if (typeof this.renderer.renderAsync === 'function') {
      await this.renderer.renderAsync(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    return true;
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
      if (t >= 1) {
        this._fly = null;
        this._notifyViewChange();
      }
    }

    for (const fn of this._frameCallbacks) {
      fn(nowMs, dt);
    }
    if (this._ringMesh.visible && !this.reducedMotion) {
      this._ringMat.opacity = 0.72 + 0.22 * Math.sin(nowMs * 0.007);
    }
    return this.renderNow();
  }

  _startLoop() {
    if (this._raf || this._disposed || this._manualMode) return;
    this._lastFrameTime = performance.now();
    const tick = (now) => {
      if (this._disposed || this._manualMode) {
        this._raf = 0;
        return;
      }
      this.renderFrame(now);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  dispose() {
    this._disposed = true;
    this._rendererReady = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    this._resizeObserver?.disconnect();
    this.htmlSurfaces?.dispose();
    this.outline?.dispose();
    this._envRT?.dispose();
    this.renderer?.dispose();
  }
}
