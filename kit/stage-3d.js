import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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

export const STUDIO_THEMES = {
  'paper-ink': {
    hemiSky: 0xfffaf3,
    hemiGround: 0xc2ae90,
    hemiIntensity: 0.64,
    keyColor: 0xfff7ec,
    keyIntensity: 1.24,
    fillColor: 0xdfe8f2,
    fillIntensity: 0.28,
    rimColor: 0xfff4e0,
    rimIntensity: 0.42,
    shadowColor: 0x6f4d2d,
    shadowOpacity: 0.26,
    gridCenter: 0xb6a489,
    gridLine: 0xd3c4ac,
    gridOpacity: 0.48,
    envIntensity: 0.4,
    inkColor: '#141a2c',
    inkOpacity: 0.86,
  },
  'dark-studio': {
    hemiSky: 0xdbeafe,
    hemiGround: 0x1e293b,
    hemiIntensity: 0.56,
    keyColor: 0xf8fafc,
    keyIntensity: 1.32,
    fillColor: 0x38bdf8,
    fillIntensity: 0.34,
    rimColor: 0x5eead4,
    rimIntensity: 0.62,
    shadowColor: 0x04070f,
    shadowOpacity: 0.5,
    gridCenter: 0x475569,
    gridLine: 0x293548,
    gridOpacity: 0.56,
    envIntensity: 0.55,
    inkColor: '#060911',
    inkOpacity: 0.72,
  },
  'bio-cutaway': {
    hemiSky: 0xf4fbf9,
    hemiGround: 0x8faea7,
    hemiIntensity: 0.66,
    keyColor: 0xfafffe,
    keyIntensity: 1.18,
    fillColor: 0xd1fae5,
    fillIntensity: 0.3,
    rimColor: 0x99f6e4,
    rimIntensity: 0.4,
    shadowColor: 0x254442,
    shadowOpacity: 0.24,
    gridCenter: 0x9eb8b1,
    gridLine: 0xc3d5d0,
    gridOpacity: 0.46,
    envIntensity: 0.44,
    inkColor: '#142b2e',
    inkOpacity: 0.82,
  },
  blueprint: {
    hemiSky: 0xdbeeff,
    hemiGround: 0x0b1f3a,
    hemiIntensity: 0.62,
    keyColor: 0xf0f9ff,
    keyIntensity: 1.28,
    fillColor: 0x38bdf8,
    fillIntensity: 0.42,
    rimColor: 0x38e8ff,
    rimIntensity: 0.72,
    shadowColor: 0x030b18,
    shadowOpacity: 0.46,
    gridCenter: 0x7dd3fc,
    gridLine: 0x38bdf8,
    gridOpacity: 0.36,
    envIntensity: 0.5,
    inkColor: '#e0f2fe',
    inkOpacity: 0.68,
  },
  'monochrome-print': {
    hemiSky: 0xffffff,
    hemiGround: 0xd4d2cc,
    hemiIntensity: 0.7,
    keyColor: 0xffffff,
    keyIntensity: 1.22,
    fillColor: 0xe6e8ec,
    fillIntensity: 0.24,
    rimColor: 0xffffff,
    rimIntensity: 0.36,
    shadowColor: 0x1a1d24,
    shadowOpacity: 0.22,
    gridCenter: 0x8c9099,
    gridLine: 0xcbc9c2,
    gridOpacity: 0.36,
    envIntensity: 0.36,
    inkColor: '#111317',
    inkOpacity: 0.9,
  },
  'obsidian-gallery': {
    hemiSky: 0xfaf0dc,
    hemiGround: 0x1c1916,
    hemiIntensity: 0.5,
    keyColor: 0xfff5e4,
    keyIntensity: 1.38,
    fillColor: 0x5eead4,
    fillIntensity: 0.24,
    rimColor: 0xd9b061,
    rimIntensity: 0.74,
    shadowColor: 0x050403,
    shadowOpacity: 0.56,
    gridCenter: 0x6b5b43,
    gridLine: 0x3a3228,
    gridOpacity: 0.46,
    envIntensity: 0.62,
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

function hexToCss(hex, alpha = 1) {
  const n = typeof hex === 'number' ? hex : new THREE.Color(hex).getHex();
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return alpha >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function createRadialGridTexture(style, theme, divisions = 24) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  const S = 1024;
  const half = S * 0.5;
  ctx.clearRect(0, 0, S, S);

  const minorColor = hexToCss(theme.gridLine, 0.72);
  const majorColor = hexToCss(theme.gridCenter, 0.95);

  if (style === 'polar') {
    const rings = 8;
    const maxR = half * 0.94;
    for (let i = 1; i <= rings; i += 1) {
      const r = (i / rings) * maxR;
      ctx.beginPath();
      ctx.arc(half, half, r, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0 ? majorColor : minorColor;
      ctx.lineWidth = i % 2 === 0 ? 1.8 : 1.1;
      ctx.stroke();
    }
    const spokes = 12;
    for (let i = 0; i < spokes; i += 1) {
      const ang = (i / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(half, half);
      ctx.lineTo(half + Math.cos(ang) * maxR, half + Math.sin(ang) * maxR);
      ctx.strokeStyle = i % 3 === 0 ? majorColor : minorColor;
      ctx.lineWidth = i % 3 === 0 ? 1.6 : 1.0;
      ctx.stroke();
    }
  } else if (style === 'plinth') {
    const r = half * 0.82;
    ctx.beginPath();
    ctx.arc(half, half, r, 0, Math.PI * 2);
    ctx.strokeStyle = majorColor;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(half, half, r * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = minorColor;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Subtle crosshairs
    ctx.strokeStyle = minorColor;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(half - r * 0.94, half);
    ctx.lineTo(half + r * 0.94, half);
    ctx.moveTo(half, half - r * 0.94);
    ctx.lineTo(half, half + r * 0.94);
    ctx.stroke();
  } else {
    // Crisp cartesian drafting grid with major/minor hierarchy
    const step = S / Math.max(8, divisions);
    for (let i = 0; i <= divisions; i += 1) {
      const p = Math.round(i * step) + 0.5;
      const isAxis = Math.abs(i - divisions * 0.5) < 0.01;
      const isMajor = isAxis || i % 4 === 0;
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      ctx.lineWidth = isAxis ? 2.2 : isMajor ? 1.5 : 1.0;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, S);
      ctx.moveTo(0, p);
      ctx.lineTo(S, p);
      ctx.stroke();
    }
  }

  // Smooth radial edge fade so the grid never shows a harsh square boundary
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(half, half, S * 0.14, half, half, half * 0.98);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(0.62, 'rgba(255,255,255,0.86)');
  fade.addColorStop(0.86, 'rgba(255,255,255,0.28)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(colorHex) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const c = new THREE.Color(colorHex);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.92)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.48)`);
  grad.addColorStop(0.78, `rgba(${r},${g},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
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
    this._gridStyle = options.gridStyle ?? (options.showGrid === false ? 'none' : 'cartesian');
    this._showGround = options.showGround !== false;
    this._accentLights = new Set();
    this._contactShadows = new Set();
    this._cutawayCaps = new Set();
    this._syncedPeers = new Set();
    this._syncingCamera = false;

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
    cam.layers.enable(GLASS_LAYER);
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
    this._keyLight.shadow.radius = 3.5;
    this._keyLight.shadow.bias = -0.00035;
    this._keyLight.shadow.normalBias = 0.025;
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

    const divisions = Math.max(8, Math.round(gridSize / 1.5));
    const tex = createRadialGridTexture(this._gridStyle, theme, divisions);
    if (tex) {
      tex.anisotropy = this.getMaxAnisotropy();
      this._gridTex = tex;
      const geo = new THREE.PlaneGeometry(gridSize, gridSize);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: theme.gridOpacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = groundY - 0.008;
      mesh.layers.set(GROUND_LAYER);
      mesh.renderOrder = -2;
      mesh.visible = this._showGrid;
      mesh.userData.simulifyInternal = true;
      this.scene.add(mesh);
      this._grid = mesh;
      return;
    }

    // Node / non-DOM fallback
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
    if (this.scene.environment) {
      this.scene.environmentIntensity = this._options.envIntensity ?? t.envIntensity;
    }
    this._rebuildGrid(this._groundY, this._gridSize, t);
    if (this.outline && this._options.lineColor === undefined) {
      this.outline.setInkColor(t.inkColor, this._options.lineOpacity ?? t.inkOpacity);
    }
    this.requestRender();
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
   */
  createCutawayCap(target, plane, opts = {}) {
    if (!target || !plane) {
      throw new Error('createCutawayCap requires a target Object3D and a THREE.Plane.');
    }
    const t = STUDIO_THEMES[this.themeName] || STUDIO_THEMES['paper-ink'];
    const capSize = Math.max(2, Number(opts.capSize) || 14);
    const baseOrder = Number(opts.renderOrder) || 10;
    const group = new THREE.Group();
    group.name = opts.name || 'simulify-cutaway-cap';
    group.userData.simulifyInternal = true;

    // On WebGPURenderer r187+, clipping is scoped by `THREE.ClippingGroup` (not `material.clippingPlanes`).
    // Wrap `target` inside an identity-transform ClippingGroup at its current parent so local & world transforms stay identical.
    let targetClipGroup = null;
    if (typeof THREE.ClippingGroup === 'function' && opts.attachClipping !== false) {
      targetClipGroup = this.createClippingGroup([plane], {
        clipShadows: true,
        enabled: true,
        name: `${group.name}-target-clip`,
      });
      if (target.parent) {
        const origParent = target.parent;
        origParent.add(targetClipGroup);
        targetClipGroup.add(target);
      }
    }

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
    target.traverse((obj) => {
      if (!obj || !obj.isMesh || !obj.geometry || obj.userData?.simulifyInternal) return;
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

    const isDark =
      this.themeName === 'dark-studio' || this.themeName === 'blueprint' || this.themeName === 'obsidian-gallery';
    const hatchTex = createCutawayHatchTexture({
      baseColor: opts.baseColor ?? (isDark ? '#24344e' : '#eadec9'),
      hatchColor: opts.hatchColor ?? t.inkColor,
      spacing: opts.hatchSpacing ?? 16,
      angleDeg: opts.hatchAngle ?? 45,
    });
    if (hatchTex) {
      const rep = Math.max(2, capSize * 1.1);
      hatchTex.repeat.set(rep, rep);
      hatchTex.anisotropy = this.getMaxAnisotropy();
    }

    const capGeo = new THREE.PlaneGeometry(capSize, capSize);
    const capMat = new THREE.MeshStandardMaterial({
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
      // If target was added to scene AFTER createCutawayCap, wrap it now
      if (targetClipGroup && !targetClipGroup.parent && target.parent && target.parent !== targetClipGroup) {
        const origParent = target.parent;
        origParent.add(targetClipGroup);
        targetClipGroup.add(target);
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
      stencilGroup,
      plane,
      capMesh,
      sync,
      syncMatrices,
      setConstant: (c) => {
        plane.constant = Number(c) || 0;
        sync();
      },
      setEnabled: (enabled) => {
        const on = Boolean(enabled);
        group.visible = on;
        if (targetClipGroup && targetClipGroup.isClippingGroup) targetClipGroup.enabled = on;
        if (stencilGroup && stencilGroup.isClippingGroup) stencilGroup.enabled = on;
        for (const m of attachedMats) {
          m.clippingPlanes = on ? [plane] : [];
        }
        this.requestRender();
      },
      dispose: () => {
        group.removeFromParent();
        if (targetClipGroup) {
          if (targetClipGroup.parent && target.parent === targetClipGroup) {
            targetClipGroup.parent.add(target);
          }
          targetClipGroup.removeFromParent();
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
   * Synchronize camera orbit/zoom/pan lockstep with a peer IsometricStage (e.g. `ab-compare`).
   * Returns an unlink function.
   */
  syncCameraWith(otherStage) {
    if (!otherStage || otherStage === this) return () => {};
    this._syncedPeers.add(otherStage);
    otherStage._syncedPeers?.add(this);
    return () => {
      this._syncedPeers.delete(otherStage);
      otherStage._syncedPeers?.delete(this);
    };
  }

  /**
   * Render a crisp orthographic Front / Side / Top snapshot of the current scene into a target
   * 2D `<canvas>` without creating a second WebGL/WebGPU context (powers `multi-view` strips).
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

  /** Batch-update an array of `{ view: 'front'|'side'|'top', canvas: HTMLCanvasElement }` slots. */
  updateMultiViewStrip(slots = []) {
    if (!Array.isArray(slots) || !this._rendererReady) return 0;
    let count = 0;
    for (const slot of slots) {
      if (slot?.view && slot?.canvas && this.captureCardinalSnapshot(slot.view, slot.canvas, slot)) {
        count += 1;
      }
    }
    return count;
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
    for (const cap of Array.from(this._cutawayCaps)) cap.dispose();
    for (const cs of Array.from(this._contactShadows)) cs.dispose();
    for (const al of Array.from(this._accentLights)) al.dispose();
    this._syncedPeers.clear();
    this._gridTex?.dispose?.();
    this._resizeObserver?.disconnect();
    this.htmlSurfaces?.dispose();
    this.outline?.dispose();
    this._envRT?.dispose();
    this.renderer?.dispose();
  }
}
