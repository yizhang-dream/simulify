import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HtmlSurfaceManager, supportsHtmlInCanvas } from './html-surface.js';
import {
  GROUND_LAYER,
  OUTLINE_PRESETS,
  OutlinePass,
  SOLID_LAYER,
  SURFACE_LAYER,
} from './outline-pass.js';

export { GROUND_LAYER, SOLID_LAYER, SURFACE_LAYER };

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

const STUDIO_THEMES = {
  'paper-ink': {
    hemiSky: 0xfffaf3,
    hemiGround: 0xc2ae90,
    hemiIntensity: 0.64,
    keyColor: 0xfff7ec,
    keyIntensity: 1.18,
    fillColor: 0xdfe8f2,
    fillIntensity: 0.25,
    shadowColor: 0x7a5532,
    shadowOpacity: 0.27,
    gridCenter: 0xc0b097,
    gridLine: 0xd8cbb6,
    gridOpacity: 0.42,
    envIntensity: 0.38,
    inkColor: '#141a2c',
    inkOpacity: 0.86,
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
    inkOpacity: 0.82,
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

function resolveOutlinePreset(opt) {
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

/**
 * Simulify v2 3D/4D Stage supporting:
 * - Automatic 3-tier backend: Hardware WebGPU -> WebGL2 (TSL) -> Graceful Fallback
 * - Full backward compatibility for v1 benches using `three.module.js` (`WebGLRenderer`)
 * - 1:1 physical pixel backing-store via ResizeObserver `device-pixel-content-box` (DPR up to 3x)
 * - Separated user/script camera ownership (`setCameraFromScript`, `isUserCameraLocked`, `unlockUserCamera`)
 * - On-demand dirty-flag rendering (`requestRender`) eliminating 60fps idle GPU spin
 * - Sharp texture helpers (`getMaxAnisotropy`, `configureSharpTexture`) & `getGeometryAudit()`
 * - Crisp TSL/GLSL ink outlines (`'crisp' | 'subtle' | 'none'`) with un-tone-mapped `SURFACE_LAYER`
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
    this.outlinePreset = resolveOutlinePreset(options.outline);
    this.outlineEnabled = this.outlinePreset !== 'none';
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
    this._initResizeObserver();

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

  _enableCameraLayers(cam) {
    cam.layers.enable(SOLID_LAYER);
    cam.layers.enable(GROUND_LAYER);
    cam.layers.enable(SURFACE_LAYER);
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
        try {
          renderer.dispose?.();
        } catch {}
        if (forceWebGL || requestedBackend === 'webgpu') {
          throw initErr;
        }
        // Auto-recover from stalled/broken WebGPU init in embedded WebViews by falling back to WebGL2
        forceWebGL = true;
        renderer = buildRenderer(true);
        await renderer.init();
      }

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

  _configureRendererCommon(options) {
    const theme = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const r = this.renderer;

    if (typeof r.setClearColor === 'function') {
      r.setClearColor(0x000000, 0);
    }
    r.outputColorSpace = THREE.SRGBColorSpace;
    // Khronos PBR Neutral preserves true warm-paper albedo & crisp contrast without ACES grey crush
    r.toneMapping =
      options.toneMapping ??
      (THREE.NeutralToneMapping !== undefined ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping);
    r.toneMappingExposure = options.toneMappingExposure ?? 1.0;
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
      this.outline = this._createOutlinePass(theme, options);
    }
  }

  _createOutlinePass(theme, options = this._options) {
    return new OutlinePass(this.renderer, {
      preset: this.outlinePreset,
      lineColor: options.lineColor ?? theme.inkColor,
      thickness: options.lineThickness,
      opacity: options.lineOpacity ?? theme.inkOpacity,
      depthThreshold: options.depthThreshold,
      normalThreshold: options.normalThreshold,
      bloom: options.bloom ?? false,
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
   * Switch outline quality preset at runtime: 'crisp' | 'subtle' | 'none'.
   */
  setOutlinePreset(preset) {
    const next = resolveOutlinePreset(preset);
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
    this._shadowPlane.userData.simulifyInternal = true;
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
    grid.userData.simulifyInternal = true;
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
    this.requestRender();
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
      this.requestRender();
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
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    if (this.htmlSurfaces?.flushPaint) {
      await this.htmlSurfaces.flushPaint();
    }
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    if (this.htmlSurfaces) {
      this.htmlSurfaces.updateGeometries(this.camera);
      if (this.htmlSurfaces.hasPendingVisible?.() && this.htmlSurfaces.flushPaint) {
        await this.htmlSurfaces.flushPaint();
      }
      this.htmlSurfaces.syncPaint(null);
    }
    if (this.outline && this.outlineEnabled) {
      await this.outline.renderAsync(this.scene, this.camera);
    } else {
      if (this.renderer._initialized === false && typeof this.renderer.init === 'function') {
        await this.renderer.init();
      }
      this.renderer.render(this.scene, this.camera);
    }
    this._dirty = false;
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
    if (this._raf || this._disposed || this._manualMode) return;
    if (this._lastFrameTime === null) {
      this._lastFrameTime = performance.now();
    }
    this._raf = requestAnimationFrame((now) => {
      this._raf = 0;
      if (this._disposed || this._manualMode) return;
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
