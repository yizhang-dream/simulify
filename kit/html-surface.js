import * as THREE from 'three';
import { GROUND_LAYER, SURFACE_LAYER } from './outline-pass.js';

const _pixelToLocal = new THREE.Matrix4();
const _mvp = new THREE.Matrix4();
const _viewport = new THREE.Matrix4();
const _size = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _pX = new THREE.Vector3();
const _pY = new THREE.Vector3();

const DEFAULT_MAX_TEXTURE_SIZE = 2048;

const LEGACY_HIC_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LEGACY_HIC_FS = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 srgbToLinear(vec3 c) {
    vec3 clamped = clamp(c, 0.0, 1.0);
    vec3 lo = clamped / 12.92;
    vec3 hi = pow((clamped + 0.055) / 1.055, vec3(2.4));
    return mix(lo, hi, step(vec3(0.04045), clamped));
  }

  void main() {
    vec4 tex = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
    float outA = tex.a * uOpacity;
    if (outA < 0.01) discard;
    gl_FragColor = vec4(srgbToLinear(tex.rgb), outA);
  }
`;

const WEBGPU_MIPMAP_WGSL = /* wgsl */ `
@group(0) @binding(0) var srcTex : texture_2d<f32>;

struct VSOut {
  @builtin(position) pos : vec4f,
};

@vertex
fn vsMain(@builtin(vertex_index) idx : u32) -> VSOut {
  var pts = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var out : VSOut;
  out.pos = vec4f(pts[idx], 0.0, 1.0);
  return out;
}

fn srgbToLinear(c : vec3f) -> vec3f {
  let clamped = max(c, vec3f(0.0));
  let lo = clamped / 12.92;
  let hi = pow((clamped + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(hi, lo, clamped <= vec3f(0.04045));
}

fn linearToSrgb(c : vec3f) -> vec3f {
  let clamped = clamp(c, vec3f(0.0), vec3f(1.0));
  let lo = clamped * 12.92;
  let hi = pow(clamped, vec3f(1.0 / 2.4)) * 1.055 - vec3f(0.055);
  return select(hi, lo, clamped <= vec3f(0.0031308));
}

@fragment
fn fsMain(@builtin(position) fragPos : vec4f) -> @location(0) vec4f {
  let srcDim = vec2i(textureDimensions(srcTex, 0));
  let maxCoord = max(srcDim - vec2i(1, 1), vec2i(0, 0));
  let base = vec2i(floor(fragPos.xy)) * 2;
  let c00 = textureLoad(srcTex, min(base + vec2i(0, 0), maxCoord), 0);
  let c10 = textureLoad(srcTex, min(base + vec2i(1, 0), maxCoord), 0);
  let c01 = textureLoad(srcTex, min(base + vec2i(0, 1), maxCoord), 0);
  let c11 = textureLoad(srcTex, min(base + vec2i(1, 1), maxCoord), 0);

  let aSum = c00.a + c10.a + c01.a + c11.a;
  if (aSum <= 1e-5) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  let linPre =
    srgbToLinear(c00.rgb) * c00.a +
    srgbToLinear(c10.rgb) * c10.a +
    srgbToLinear(c01.rgb) * c01.a +
    srgbToLinear(c11.rgb) * c11.a;
  let avgSrgb = linearToSrgb(linPre / aSum);
  return vec4f(avgSrgb, aSum * 0.25);
}
`;

const _mipmapPipelines = new WeakMap();

function generateWebGPUMipmaps(device, gpuTex, mipLevelCount) {
  if (!device || !gpuTex || mipLevelCount <= 1) return;
  try {
    let pipeline = _mipmapPipelines.get(device);
    if (!pipeline) {
      const module = device.createShaderModule({
        label: 'simulify-hic-mipmap',
        code: WEBGPU_MIPMAP_WGSL,
      });
      pipeline = device.createRenderPipeline({
        label: 'simulify-hic-mipmap-pipeline',
        layout: 'auto',
        vertex: { module, entryPoint: 'vsMain' },
        fragment: {
          module,
          entryPoint: 'fsMain',
          targets: [{ format: 'rgba8unorm' }],
        },
        primitive: { topology: 'triangle-list' },
      });
      _mipmapPipelines.set(device, pipeline);
    }

    const bindGroupLayout = pipeline.getBindGroupLayout(0);
    const encoder = device.createCommandEncoder({ label: 'simulify-hic-mipmap-enc' });
    for (let level = 1; level < mipLevelCount; level += 1) {
      const srcView = gpuTex.createView({
        dimension: '2d',
        baseMipLevel: level - 1,
        mipLevelCount: 1,
      });
      const dstView = gpuTex.createView({
        dimension: '2d',
        baseMipLevel: level,
        mipLevelCount: 1,
      });
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: srcView }],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: dstView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  } catch {
    // Non-fatal: mip level 0 remains intact
  }
}

/**
 * Feature-detect modern Chrome/Edge 157+ HTML-in-Canvas API (`<canvas content="drawable">`).
 * Never probes or uses deprecated draft APIs (`layoutsubtree`, `texElementImage2D`, `copyElementImageToTexture`).
 */
export function supportsHtmlInCanvas() {
  return (
    typeof HTMLCanvasElement !== 'undefined' &&
    'content' in HTMLCanvasElement.prototype &&
    'requestPaint' in HTMLCanvasElement.prototype &&
    'updateElementGeometry' in HTMLCanvasElement.prototype
  );
}

/**
 * Compute column-major Matrix4 mapping HTML element local CSS pixels (0..elW, 0..elH)
 * onto the front face of a 3D mesh in canvas CSS pixel coordinates (0..canvasW, 0..canvasH).
 * Works for both OrthographicCamera and PerspectiveCamera, and drives BOTH
 * native `canvas.updateElementGeometry` (DOMMatrix) and fallback CSS `matrix3d(...)`.
 */
export function computeCanvasMatrix4(canvas, el, mesh, camera, out = new THREE.Matrix4()) {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const elemW = el.offsetWidth;
  const elemH = el.offsetHeight;
  if (!cssW || !cssH || !elemW || !elemH) return null;

  const geometry = mesh.geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  geometry.boundingBox.getSize(_size);
  if (_size.x <= 0 || _size.y <= 0) return null;

  mesh.updateWorldMatrix(true, false);

  _pixelToLocal.set(
    _size.x / elemW, 0, 0, -_size.x / 2,
    0, -_size.y / elemH, 0, _size.y / 2,
    0, 0, 1, geometry.boundingBox.max.z,
    0, 0, 0, 1
  );

  _viewport.set(
    cssW / 2, 0, 0, cssW / 2,
    0, -cssH / 2, 0, cssH / 2,
    0, 0, 1, 0,
    0, 0, 0, 1
  );

  _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _mvp.multiply(mesh.matrixWorld);
  _mvp.multiply(_pixelToLocal);
  out.multiplyMatrices(_viewport, _mvp);
  return out;
}

/**
 * Compute a DOMMatrix suitable for `canvas.updateElementGeometry(el, { canvasTransform })`.
 */
export function computeCanvasTransform(canvas, el, mesh, camera) {
  const mat = computeCanvasMatrix4(canvas, el, mesh, camera);
  if (!mat || typeof DOMMatrix === 'undefined') return null;
  return new DOMMatrix(Array.from(mat.elements));
}

function createSurfaceMaterial(extTex, { side = THREE.FrontSide, opacity = 1, isNodeRenderer = false } = {}) {
  if (isNodeRenderer && THREE.MeshBasicNodeMaterial && THREE.TSL) {
    const TSL = THREE.TSL;
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      toneMapped: false,
      side,
      depthWrite: true,
      alphaTest: 0.01,
    });
    const uvNode = TSL.uv();
    const flippedUv = TSL.vec2(uvNode.x, TSL.float(1.0).sub(uvNode.y));
    const texNode = TSL.texture(extTex, flippedUv);
    const uOpacity = TSL.uniform(opacity);

    // Subtle sub-pixel UV edge AA keeps tilted plane boundaries silky smooth on samples:0 surfacePass
    let alphaNode = texNode.a.mul(uOpacity);
    if (typeof TSL.fwidth === 'function') {
      const fw = TSL.fwidth(uvNode);
      const edgeDist = TSL.min(uvNode, TSL.vec2(1.0).sub(uvNode));
      const edgeAaVec = TSL.smoothstep(TSL.vec2(0.0), TSL.max(fw.mul(0.85), TSL.vec2(1e-4)), edgeDist);
      alphaNode = alphaNode.mul(TSL.min(edgeAaVec.x, edgeAaVec.y));
    }

    mat.colorNode = TSL.sRGBTransferEOTF(TSL.clamp(texNode.rgb, 0.0, 1.0));
    mat.opacityNode = alphaNode;
    return { material: mat, texNode, uOpacity };
  }

  const mat = new THREE.ShaderMaterial({
    vertexShader: LEGACY_HIC_VS,
    fragmentShader: LEGACY_HIC_FS,
    uniforms: {
      uMap: { value: extTex },
      uOpacity: { value: opacity },
    },
    transparent: true,
    toneMapped: false,
    side,
    depthWrite: true,
  });
  return { material: mat, texNode: null, uOpacity: mat.uniforms.uOpacity };
}

function isTransparentCssColor(colorStr) {
  if (!colorStr) return true;
  const s = colorStr.trim().toLowerCase();
  if (s === 'transparent' || s === 'none') return true;
  const m = s.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/);
  return Boolean(m && Number(m[1]) <= 0.001);
}

function traceRoundedRect(ctx, x, y, w, h, radii) {
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, w * 0.5, h * 0.5)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * Pure-Canvas2D, 100%-untainted DOM-to-Canvas HiDPI rasterizer for non-HIC browsers
 * (Firefox, Safari, Chrome without CanvasDrawElement).
 * Reads real browser layout boxes (`getBoundingClientRect` + `Range.getClientRects`) and
 * computed styles so 3D HTML panels render onto a crisp 3D `CanvasTexture` with mipmaps,
 * 16x anisotropy, true 3D depth occlusion, and full video/GIF/PNG export fidelity.
 */
function rasterizeElementToCanvas2D(el, canvas, scale) {
  if (!el || !canvas || typeof getComputedStyle !== 'function') return false;

  const prevTransform = el.style.transform;
  const prevDisplay = el.style.display;
  const prevVisibility = el.style.visibility;

  // Measure cleanly in untransformed layout coordinates (while opacity remains 0 -> zero flash)
  el.style.transform = 'none';
  if (prevDisplay === 'none') el.style.display = '';

  try {
    const rootRect = el.getBoundingClientRect();
    if (rootRect.width < 2 || rootRect.height < 2) {
      // Element is temporarily hidden/unlaid-out (e.g., ancestor display:none); keep previous crisp buffer
      return false;
    }
    const cssW = Math.max(1, Math.round(rootRect.width || el.offsetWidth || 256));
    const cssH = Math.max(1, Math.round(rootRect.height || el.offsetHeight || 128));
    const targetW = Math.max(2, Math.round(cssW * scale));
    const targetH = Math.max(2, Math.round(cssH * scale));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const range = typeof document !== 'undefined' && document.createRange ? document.createRange() : null;

    const walk = (node, inheritedAlpha, isRoot) => {
      if (!node) return;
      if (node.nodeType === 1) {
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const ownAlpha = isRoot ? 1 : Math.max(0, Math.min(1, parseFloat(cs.opacity) || 1));
        const alpha = inheritedAlpha * ownAlpha;
        if (alpha <= 0.005) return;

        const r = node.getBoundingClientRect();
        const x = r.left - rootRect.left;
        const y = r.top - rootRect.top;
        const w = r.width;
        const h = r.height;

        if (w > 0 && h > 0) {
          const radii = [
            parseFloat(cs.borderTopLeftRadius) || 0,
            parseFloat(cs.borderTopRightRadius) || 0,
            parseFloat(cs.borderBottomRightRadius) || 0,
            parseFloat(cs.borderBottomLeftRadius) || 0,
          ];

          ctx.save();
          ctx.globalAlpha = alpha;

          if (!isTransparentCssColor(cs.backgroundColor)) {
            traceRoundedRect(ctx, x, y, w, h, radii);
            ctx.fillStyle = cs.backgroundColor;
            ctx.fill();
          }

          const bt = parseFloat(cs.borderTopWidth) || 0;
          const br = parseFloat(cs.borderRightWidth) || 0;
          const bb = parseFloat(cs.borderBottomWidth) || 0;
          const bl = parseFloat(cs.borderLeftWidth) || 0;

          if (bt > 0 && bt === br && br === bb && bb === bl && !isTransparentCssColor(cs.borderTopColor)) {
            traceRoundedRect(ctx, x + bt * 0.5, y + bt * 0.5, w - bt, h - bt, radii);
            ctx.strokeStyle = cs.borderTopColor;
            ctx.lineWidth = bt;
            ctx.stroke();
          } else {
            if (bl > 0 && !isTransparentCssColor(cs.borderLeftColor)) {
              ctx.fillStyle = cs.borderLeftColor;
              ctx.fillRect(x, y + Math.min(radii[0], h * 0.25), bl, Math.max(1, h - Math.min(radii[0] + radii[3], h * 0.5)));
            }
            if (bb > 0 && !isTransparentCssColor(cs.borderBottomColor)) {
              ctx.fillStyle = cs.borderBottomColor;
              ctx.fillRect(x, y + h - bb, w, bb);
            }
            if (bt > 0 && !isTransparentCssColor(cs.borderTopColor)) {
              ctx.fillStyle = cs.borderTopColor;
              ctx.fillRect(x, y, w, bt);
            }
            if (br > 0 && !isTransparentCssColor(cs.borderRightColor)) {
              ctx.fillStyle = cs.borderRightColor;
              ctx.fillRect(x + w - br, y, br, h);
            }
          }
          ctx.restore();
        }

        const clipOverflow = cs.overflow === 'hidden' || cs.overflowX === 'hidden';
        if (clipOverflow && w > 0 && h > 0) {
          ctx.save();
          const radii = [
            parseFloat(cs.borderTopLeftRadius) || 0,
            parseFloat(cs.borderTopRightRadius) || 0,
            parseFloat(cs.borderBottomRightRadius) || 0,
            parseFloat(cs.borderBottomLeftRadius) || 0,
          ];
          traceRoundedRect(ctx, x, y, w, h, radii);
          ctx.clip();
        }

        for (const child of node.childNodes) {
          walk(child, alpha, false);
        }

        if (clipOverflow && w > 0 && h > 0) {
          ctx.restore();
        }
      } else if (node.nodeType === 3) {
        const rawText = node.textContent;
        if (!rawText || !rawText.trim()) return;
        const parent = node.parentElement;
        if (!parent) return;
        const cs = getComputedStyle(parent);
        const fontStyle = cs.fontStyle && cs.fontStyle !== 'normal' ? `${cs.fontStyle} ` : '';
        const fontWeight = cs.fontWeight || '400';
        const fontSize = cs.fontSize || '12px';
        const fontFamily = cs.fontFamily || 'sans-serif';

        ctx.save();
        ctx.globalAlpha = inheritedAlpha;
        ctx.font = `${fontStyle}${fontWeight} ${fontSize} ${fontFamily}`;
        ctx.fillStyle = cs.color || '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let painted = false;
        if (range) {
          try {
            range.selectNodeContents(node);
            const rects = range.getClientRects();
            if (rects && rects.length === 1) {
              const tr = rects[0];
              const text = cs.whiteSpace && cs.whiteSpace.startsWith('pre') ? rawText : rawText.replace(/\s+/g, ' ');
              const fontPx = parseFloat(fontSize) || 12;
              const vPad = Math.max(0, (tr.height - fontPx) * 0.35);
              ctx.fillText(text, tr.left - rootRect.left, tr.top - rootRect.top + vPad);
              painted = true;
            }
          } catch {
            // Fall through to parent-rect fallback
          }
        }
        if (!painted) {
          const pr = parent.getBoundingClientRect();
          const pl = parseFloat(cs.paddingLeft) || 0;
          const pt = parseFloat(cs.paddingTop) || 0;
          const text = cs.whiteSpace && cs.whiteSpace.startsWith('pre') ? rawText : rawText.replace(/\s+/g, ' ').trim();
          ctx.fillText(text, pr.left - rootRect.left + pl, pr.top - rootRect.top + pt);
        }
        ctx.restore();
      }
    };

    walk(el, 1, true);
    return true;
  } finally {
    el.style.transform = prevTransform;
    el.style.display = prevDisplay;
    el.style.visibility = prevVisibility;
  }
}

/**
 * Progressive-enhancement HTML-in-Canvas surface manager for Simulify v2.
 *
 * - On Chrome/Edge 157+ (`supportsHtmlInCanvas()`):
 *   Sets `<canvas content="drawable">`, manages ONE centralized `canvas.onpaint`
 *   dispatcher reading `event.changedElements`, measures TRUE CSS `border-box` dimensions
 *   multiplied by a HiDPI/projection scale factor (>= 2x, up to 2048px — completely fixing
 *   the content-box 0.5x blur bug), uploads via WebGPU `drawElementImageToTexture` (with
 *   gamma-correct premultiplied-linear WGSL mipmap chain + 16x anisotropy) or WebGL2
 *   `gl.texElementSubImage2D` (`gl.generateMipmap` + max anisotropy), places meshes on
 *   un-tone-mapped `SURFACE_LAYER`, and syncs 3D hit-test bounds via `updateElementGeometry`.
 *
 * - On Firefox / Safari (or non-flag Chrome / `enabled: false`):
 *   Renders crisp HiDPI 3D `CanvasTexture` directly onto `surf.mesh` (using `drawFallback`
 *   when provided, or the built-in untainted Canvas2D DOM rasterizer) with mipmaps + 16x
 *   anisotropy + full 3D depth occlusion + 100% export consistency, while keeping an
 *   invisible `matrix3d` DOM overlay for live hover/click/focus interactivity.
 */
export class HtmlSurfaceManager {
  constructor(stage, options = {}) {
    this.stage = stage;
    this.canvas = stage.canvas;
    this.nativeEnabled = options.enabled !== false && supportsHtmlInCanvas();
    this.surfaces = new Map();
    this._elToId = new WeakMap();
    this._fallbackHost = null;
    this._resizeObserver = null;
    this._disposed = false;
    this._paintPending = false;
    this._paintWaiters = new Set();
    this._tmpMat = new THREE.Matrix4();

    if (this.nativeEnabled) {
      this._initNative();
    } else {
      this._initFallbackObserver();
    }
  }

  _initNative() {
    this.canvas.setAttribute('content', 'drawable');
    this.canvas.onpaint = (event) => this._handlePaint(event);

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver((entries) => {
        if (this._disposed) return;
        let anyChanged = false;
        for (const entry of entries) {
          const id = this._elToId.get(entry.target);
          if (!id) continue;
          const surf = this.surfaces.get(id);
          if (!surf) continue;
          const bbs = entry.borderBoxSize;
          const hintCssW = bbs && bbs.length > 0 ? Math.round(bbs[0].inlineSize) : null;
          const hintCssH = bbs && bbs.length > 0 ? Math.round(bbs[0].blockSize) : null;
          if (this._measureElement(surf, this.stage?.camera || null, hintCssW, hintCssH, true)) {
            anyChanged = true;
          }
        }
        if (anyChanged) this.requestPaint();
      });
    }
  }

  _initFallbackObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    this._resizeObserver = new ResizeObserver((entries) => {
      if (this._disposed) return;
      for (const entry of entries) {
        const id = this._elToId.get(entry.target);
        if (!id) continue;
        const surf = this.surfaces.get(id);
        if (!surf) continue;
        surf.dirty = true;
        this._syncFallbackSurface(surf);
      }
    });
  }

  _ensureFallbackHost() {
    if (this._fallbackHost) return this._fallbackHost;
    const parent = this.canvas?.parentElement;
    if (!parent) return null;
    if (typeof getComputedStyle === 'function' && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    const host = document.createElement('div');
    host.className = 'simulify-html-fallback';
    // Never tag data-export-role="chrome": CSS [data-export] would set display:none and break layout capture!
    // compositor.js explicitly excludes `.simulify-html-fallback` by class name.
    host.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4;';
    parent.appendChild(host);
    this._fallbackHost = host;
    return host;
  }

  /**
   * Mount a live HTML element onto a 3D plane/mesh.
   * @param {string} id
   * @param {HTMLElement} el
   * @param {{
   *   mesh?: THREE.Mesh,
   *   worldWidth?: number,
   *   worldHeight?: number,
   *   mode?: 'interactive'|'decal',
   *   side?: number,
   *   opacity?: number,
   *   layer?: number,
   *   toneMapped?: boolean,
   *   maxTextureSize?: number,
   *   drawFallback?: (ctx: CanvasRenderingContext2D, w: number, h: number, el: HTMLElement) => void
   * }} [opts]
   */
  mount(id, el, opts = {}) {
    if (this.surfaces.has(id)) {
      this.unmount(id);
    }

    const mode = opts.mode === 'decal' ? 'decal' : 'interactive';
    const worldWidth = opts.worldWidth ?? 2.4;
    const worldHeight = opts.worldHeight ?? 1.2;
    const opacity = opts.opacity ?? 1;
    const side = opts.side ?? THREE.FrontSide;
    // Place un-tone-mapped HTML panels onto dedicated SURFACE_LAYER so OutlinePass never ACES-crushes them
    const targetLayer = opts.toneMapped === true ? (opts.layer ?? GROUND_LAYER) : SURFACE_LAYER;

    let mesh = opts.mesh || null;
    let ownsMesh = false;
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(worldWidth, worldHeight),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side })
      );
      mesh.layers.set(targetLayer);
      ownsMesh = true;
    } else if (opts.toneMapped !== true) {
      mesh.layers.set(targetLayer);
    }
    mesh.userData.simulifyGeoKind = 'html-surface';

    const surf = {
      id,
      el,
      mesh,
      ownsMesh,
      mode,
      side,
      opacity,
      visible: true,
      dirty: true,
      awaitingPaint: true,
      needsAlloc: true,
      uploadedOnce: false,
      cssWidth: 0,
      cssHeight: 0,
      width: 0,
      height: 0,
      mipLevelCount: 1,
      maxTextureSize: Math.max(256, Math.min(4096, Number(opts.maxTextureSize) || DEFAULT_MAX_TEXTURE_SIZE)),
      extTex: null,
      rawGpuTex: null,
      rawGlTex: null,
      material: null,
      texNode: null,
      uOpacity: null,
      fallbackCanvas: null,
      fallbackTex: null,
      fallbackWidth: opts.fallbackWidth ?? null,
      fallbackHeight: opts.fallbackHeight ?? null,
      drawFallback: typeof opts.drawFallback === 'function' ? opts.drawFallback : null,
    };

    this.surfaces.set(id, surf);
    this._elToId.set(el, id);

    if (this.nativeEnabled) {
      el.setAttribute('drawable', '');
      // Outer CSS box-shadow gets hard-clipped at border-box by drawElementImageToTexture,
      // leaving faint rectangular corner tints outside border-radius. Suppress outer shadows by default.
      if (opts.keepBoxShadow !== true && el.style) {
        surf._prevInlineBoxShadow = el.style.boxShadow;
        el.style.boxShadow = 'none';
      }
      if (el.parentElement !== this.canvas) {
        this.canvas.appendChild(el);
      }
      if (this._resizeObserver) {
        try {
          this._resizeObserver.observe(el, { box: 'border-box' });
        } catch {
          this._resizeObserver.observe(el);
        }
      }
      this._measureElement(surf, this.stage?.camera || null, null, null, true);
      this.requestPaint();
    } else {
      // Non-HIC path (Firefox / Safari / non-flag Chrome):
      // Render crisp HiDPI 3D CanvasTexture directly on `surf.mesh` (export-safe & depth-tested!),
      // and keep `el` mounted in the fallback host for layout measurement & invisible hit-testing.
      const host = this._ensureFallbackHost();
      if (host && el.parentElement !== host) {
        host.appendChild(el);
      }
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.transformOrigin = '0 0';
      // Invisible visually (3D mesh displays the crisp CanvasTexture), still interactive when mode==='interactive'
      el.style.opacity = '0';
      el.style.pointerEvents = mode === 'interactive' ? 'auto' : 'none';

      if (this._resizeObserver) {
        try {
          this._resizeObserver.observe(el, { box: 'border-box' });
        } catch {
          this._resizeObserver.observe(el);
        }
      }
      this._initFallbackTexture(surf);
      this._syncFallbackSurface(surf);
    }

    return {
      id,
      mesh,
      el,
      markDirty: () => this.markDirty(id),
      setVisible: (v) => this.setVisible(id, v),
      setOpacity: (a) => this.setOpacity(id, a),
      unmount: () => this.unmount(id),
    };
  }

  _initFallbackTexture(surf) {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = Math.max(64, Math.round(surf.fallbackWidth ?? 512));
    c.height = Math.max(32, Math.round(surf.fallbackHeight ?? 256));
    const tex = new THREE.CanvasTexture(c);
    if (typeof this.stage?.configureSharpTexture === 'function') {
      this.stage.configureSharpTexture(tex, { colorSpace: THREE.SRGBColorSpace });
    } else {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(16, this.stage?.getMaxAnisotropy?.() ?? 16);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: surf.opacity,
      toneMapped: false,
      side: surf.side,
      depthWrite: true,
      alphaTest: 0.01,
    });
    if (surf.ownsMesh && surf.mesh.material) {
      surf.mesh.material.dispose();
    }
    surf.mesh.material = mat;
    surf.fallbackCanvas = c;
    surf.fallbackTex = tex;
    surf.material = mat;
  }

  _syncFallbackSurface(surf) {
    if (!surf || !surf.fallbackCanvas || !surf.fallbackTex) return false;
    const prevW = surf.fallbackCanvas.width;
    const prevH = surf.fallbackCanvas.height;
    const { scale, width, height } = this._computeTargetResolution(surf, this.stage?.camera || null);
    let painted = false;
    if (surf.drawFallback) {
      const targetW = Math.max(64, Math.round(surf.fallbackWidth ? surf.fallbackWidth * Math.max(1, scale * 0.5) : width));
      const targetH = Math.max(32, Math.round(surf.fallbackHeight ? surf.fallbackHeight * Math.max(1, scale * 0.5) : height));
      if (surf.fallbackCanvas.width !== targetW || surf.fallbackCanvas.height !== targetH) {
        surf.fallbackCanvas.width = targetW;
        surf.fallbackCanvas.height = targetH;
      }
      const ctx = surf.fallbackCanvas.getContext('2d');
      ctx.clearRect(0, 0, targetW, targetH);
      surf.drawFallback(ctx, targetW, targetH, surf.el);
      painted = true;
    } else {
      painted = rasterizeElementToCanvas2D(surf.el, surf.fallbackCanvas, scale);
    }

    if (painted) {
      const sizeChanged = surf.fallbackCanvas.width !== prevW || surf.fallbackCanvas.height !== prevH;
      surf.width = surf.fallbackCanvas.width;
      surf.height = surf.fallbackCanvas.height;
      if (sizeChanged && surf.material) {
        const oldTex = surf.fallbackTex;
        const nextTex = new THREE.CanvasTexture(surf.fallbackCanvas);
        if (typeof this.stage?.configureSharpTexture === 'function') {
          this.stage.configureSharpTexture(nextTex, { colorSpace: THREE.SRGBColorSpace });
        } else {
          nextTex.colorSpace = THREE.SRGBColorSpace;
          nextTex.anisotropy = Math.min(16, this.stage?.getMaxAnisotropy?.() ?? 16);
          nextTex.generateMipmaps = true;
          nextTex.minFilter = THREE.LinearMipmapLinearFilter;
          nextTex.magFilter = THREE.LinearFilter;
        }
        surf.fallbackTex = nextTex;
        surf.material.map = nextTex;
        surf.material.needsUpdate = true;
        oldTex?.dispose?.();
      } else {
        surf.fallbackTex.anisotropy = this.stage?.getMaxAnisotropy?.() ?? 16;
        surf.fallbackTex.needsUpdate = true;
      }
      surf.dirty = false;
      surf.uploadedOnce = true;
      this.stage?.requestRender?.();
    }
    return painted;
  }

  _readCssBorderBox(el, hintCssW = null, hintCssH = null) {
    let cssW = el.offsetWidth || hintCssW || 0;
    let cssH = el.offsetHeight || hintCssH || 0;
    if ((!cssW || !cssH) && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (!cssW && rect.width > 0) cssW = rect.width;
      if (!cssH && rect.height > 0) cssH = rect.height;
    }
    if ((!cssW || !cssH) && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(el);
      if (!cssW) cssW = parseFloat(cs.width) || 0;
      if (!cssH) cssH = parseFloat(cs.height) || 0;
    }
    return {
      cssW: Math.max(1, Math.round(cssW || 256)),
      cssH: Math.max(1, Math.round(cssH || 128)),
    };
  }

  _computeProjectedScreenScale(surf, camera, cssW, cssH) {
    if (!camera || !surf.mesh?.geometry) return 0;
    const geom = surf.mesh.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    geom.boundingBox.getSize(_size);
    if (_size.x <= 0 || _size.y <= 0) return 0;

    const physW = this.stage?.size?.physicalWidth || this.canvas?.width || this.stage?.size?.width || 800;
    const physH = this.stage?.size?.physicalHeight || this.canvas?.height || this.stage?.size?.height || 500;
    if (!physW || !physH) return 0;

    surf.mesh.updateWorldMatrix(true, false);
    const zFront = geom.boundingBox.max.z;
    _p0.set(-_size.x * 0.5, -_size.y * 0.5, zFront).applyMatrix4(surf.mesh.matrixWorld).project(camera);
    _pX.set(_size.x * 0.5, -_size.y * 0.5, zFront).applyMatrix4(surf.mesh.matrixWorld).project(camera);
    _pY.set(-_size.x * 0.5, _size.y * 0.5, zFront).applyMatrix4(surf.mesh.matrixWorld).project(camera);

    const screenPxW = Math.hypot((_pX.x - _p0.x) * 0.5 * physW, (_pX.y - _p0.y) * 0.5 * physH);
    const screenPxH = Math.hypot((_pY.x - _p0.x) * 0.5 * physW, (_pY.y - _p0.y) * 0.5 * physH);
    if (!Number.isFinite(screenPxW) || !Number.isFinite(screenPxH)) return 0;
    return Math.max(screenPxW / Math.max(1, cssW), screenPxH / Math.max(1, cssH));
  }

  _computeTargetResolution(surf, camera = null, hintCssW = null, hintCssH = null) {
    const { cssW, cssH } = this._readCssBorderBox(surf.el, hintCssW, hintCssH);
    const stageDpr =
      this.stage?.size?.dpr ||
      (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const projectedScale = this._computeProjectedScreenScale(surf, camera, cssW, cssH);

    // Guarantee >= 2x crisp supersampling (fixing HiDPI 0.5x blur), tracking both DPR & projected scale
    const desiredScale = Math.max(2, stageDpr, projectedScale * 1.25);
    const maxDim = surf.maxTextureSize || DEFAULT_MAX_TEXTURE_SIZE;
    const maxAspectScale = Math.min(maxDim / cssW, maxDim / cssH, 4);
    const scale = Math.max(1, Math.min(desiredScale, maxAspectScale));

    return {
      cssW,
      cssH,
      scale,
      width: Math.max(2, Math.round(cssW * scale)),
      height: Math.max(2, Math.round(cssH * scale)),
    };
  }

  _measureElement(surf, camera = null, hintCssW = null, hintCssH = null, forceUpdate = false) {
    const { cssW, cssH, width, height } = this._computeTargetResolution(surf, camera, hintCssW, hintCssH);
    const cssChanged = cssW !== surf.cssWidth || cssH !== surf.cssHeight;
    const uninitialized = surf.width <= 0 || surf.height <= 0;
    const relDeltaW = Math.abs(width - surf.width) / Math.max(1, surf.width);
    const relDeltaH = Math.abs(height - surf.height) / Math.max(1, surf.height);
    // Hysteresis avoids reallocating GPU textures on tiny sub-pixel camera movements
    const significantScaleChange =
      width > surf.width * 1.06 ||
      height > surf.height * 1.06 ||
      relDeltaW > 0.18 ||
      relDeltaH > 0.18;

    if (uninitialized || cssChanged || forceUpdate && (width !== surf.width || height !== surf.height) || significantScaleChange) {
      surf.cssWidth = cssW;
      surf.cssHeight = cssH;
      surf.width = width;
      surf.height = height;
      surf.needsAlloc = true;
      surf.dirty = true;
      if (this.nativeEnabled) {
        surf.awaitingPaint = true;
      }
      return true;
    }
    return false;
  }

  /** Re-evaluate HiDPI texture resolution for all mounted surfaces when viewport / DPR changes. */
  handleViewportResize() {
    if (this._disposed || this.surfaces.size === 0) return;
    const camera = this.stage?.camera || null;
    let anyNativeChanged = false;
    for (const surf of this.surfaces.values()) {
      if (this.nativeEnabled) {
        if (this._measureElement(surf, camera, null, null, true)) {
          anyNativeChanged = true;
        }
      } else {
        surf.dirty = true;
        this._syncFallbackSurface(surf);
      }
    }
    if (anyNativeChanged) {
      this.requestPaint();
    }
  }

  _getBackendContext() {
    const renderer = this.stage.renderer;
    if (!renderer) return null;
    if (renderer.isWebGPURenderer) {
      if (renderer.backend?.isWebGPUBackend && renderer.backend.device) {
        return { kind: 'webgpu', device: renderer.backend.device, isNodeRenderer: true };
      }
      if (renderer.backend?.isWebGLBackend && renderer.backend.gl) {
        return { kind: 'webgl2', gl: renderer.backend.gl, isNodeRenderer: true };
      }
      return null;
    }
    const gl = renderer.getContext?.();
    if (gl && typeof gl.texElementSubImage2D === 'function') {
      return { kind: 'webgl2', gl, isNodeRenderer: false };
    }
    return null;
  }

  _allocateSurfaceTexture(surf, ctxInfo) {
    const { width, height } = surf;
    if (width <= 0 || height <= 0) return false;

    this._releaseSurfaceGpuResources(surf);

    const maxAniso = this.stage?.getMaxAnisotropy?.() ?? 16;
    const mipLevelCount = Math.max(1, Math.floor(Math.log2(Math.max(width, height))) + 1);
    surf.mipLevelCount = mipLevelCount;

    let extTex = null;
    if (ctxInfo.kind === 'webgpu') {
      const rawGpuTex = ctxInfo.device.createTexture({
        label: `simulify-hic-${surf.id}`,
        size: { width, height },
        mipLevelCount,
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING,
      });
      surf.rawGpuTex = rawGpuTex;
      extTex = new THREE.ExternalTexture(rawGpuTex);
      extTex.minFilter = THREE.LinearMipmapLinearFilter;
      extTex.magFilter = THREE.LinearFilter;
      extTex.anisotropy = maxAniso;
      extTex.generateMipmaps = false;
    } else {
      const gl = ctxInfo.gl;
      const prevBinding = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const rawGlTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, rawGlTex);
      try {
        // Mutable allocation required by spec (never immutable texStorage2D)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const anisoExt =
          gl.getExtension('EXT_texture_filter_anisotropic') ||
          gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
          gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
        if (anisoExt) {
          const hwMax = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
          gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maxAniso, hwMax));
        }
      } finally {
        // Always restore WebGLBackend's cached TEXTURE_2D binding so post-processing passes stay intact!
        gl.bindTexture(gl.TEXTURE_2D, prevBinding);
      }
      surf.rawGlTex = rawGlTex;
      extTex = new THREE.ExternalTexture(rawGlTex);
      extTex.minFilter = THREE.LinearMipmapLinearFilter;
      extTex.magFilter = THREE.LinearFilter;
      extTex.anisotropy = maxAniso;
      extTex.generateMipmaps = false;
    }

    extTex.flipY = false;
    extTex.wrapS = THREE.ClampToEdgeWrapping;
    extTex.wrapT = THREE.ClampToEdgeWrapping;
    surf.extTex = extTex;

    if (!surf.material) {
      const created = createSurfaceMaterial(extTex, {
        side: surf.side,
        opacity: surf.opacity,
        isNodeRenderer: ctxInfo.isNodeRenderer,
      });
      if (surf.ownsMesh && surf.mesh.material) {
        surf.mesh.material.dispose();
      }
      surf.mesh.material = created.material;
      surf.material = created.material;
      surf.texNode = created.texNode;
      surf.uOpacity = created.uOpacity;
    } else if (surf.texNode) {
      surf.texNode.value = extTex;
      surf.material.needsUpdate = true;
    } else if (surf.material.uniforms?.uMap) {
      surf.material.uniforms.uMap.value = extTex;
    }

    surf.needsAlloc = false;
    return true;
  }

  _releaseSurfaceGpuResources(surf) {
    if (surf.extTex) {
      surf.extTex.dispose();
      surf.extTex = null;
    }
    if (surf.rawGpuTex) {
      try {
        surf.rawGpuTex.destroy();
      } catch {
        // Ignore if device already lost
      }
      surf.rawGpuTex = null;
    }
    if (surf.rawGlTex) {
      const ctxInfo = this._getBackendContext();
      if (ctxInfo?.gl) {
        try {
          ctxInfo.gl.deleteTexture(surf.rawGlTex);
        } catch {
          // Ignore if context lost
        }
      }
      surf.rawGlTex = null;
    }
  }

  _isElementCssHidden(el) {
    if (!el) return true;
    if (el.hidden === true || el.dataset?.hudHidden === 'true') return true;
    if (typeof getComputedStyle === 'function') {
      try {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.005) {
          return true;
        }
      } catch {
        // Ignore in headless/mock environments
      }
    }
    return false;
  }

  /** Return true if any currently visible mounted surface still needs a Blink paint or GPU upload. */
  hasPendingVisible() {
    if (this._disposed || this.surfaces.size === 0) return false;
    if (!this.nativeEnabled) {
      for (const surf of this.surfaces.values()) {
        if (surf.visible && surf.mesh?.visible !== false && (surf.dirty || !surf.uploadedOnce)) {
          return true;
        }
      }
      return false;
    }
    for (const surf of this.surfaces.values()) {
      if (
        surf.visible &&
        surf.mesh?.visible !== false &&
        !this._isElementCssHidden(surf.el) &&
        (surf.dirty || surf.awaitingPaint || !surf.uploadedOnce || surf.needsAlloc)
      ) {
        return true;
      }
    }
    return false;
  }

  _uploadSurface(surf, ctxInfo) {
    if (!surf.visible || this._isElementCssHidden(surf.el)) return false;
    this._measureElement(surf, this.stage?.camera || null);
    if (surf.width <= 0 || surf.height <= 0) return false;
    if (surf.needsAlloc || !surf.extTex) {
      if (!this._allocateSurfaceTexture(surf, ctxInfo)) return false;
    }

    const size = { width: surf.width, height: surf.height };
    try {
      if (ctxInfo.kind === 'webgpu') {
        ctxInfo.device.queue.drawElementImageToTexture(
          { source: surf.el },
          { texture: surf.rawGpuTex, size }
        );
        generateWebGPUMipmaps(ctxInfo.device, surf.rawGpuTex, surf.mipLevelCount);
      } else {
        const gl = ctxInfo.gl;
        const prevBinding = gl.getParameter(gl.TEXTURE_BINDING_2D);
        const prevFlipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
        gl.bindTexture(gl.TEXTURE_2D, surf.rawGlTex);
        if (prevFlipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        try {
          gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, surf.el, size);
          gl.generateMipmap(gl.TEXTURE_2D);
        } finally {
          if (prevFlipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.bindTexture(gl.TEXTURE_2D, prevBinding);
        }
      }
      surf.dirty = false;
      surf.awaitingPaint = false;
      surf.uploadedOnce = true;
      return true;
    } catch {
      // Element may not have a paint record on the very first tick; retry on next paint
      surf.dirty = true;
      surf.awaitingPaint = true;
      return false;
    }
  }

  _resolvePaintWaiters(receivedPaint = true) {
    if (this._paintWaiters.size === 0) return;
    const waiters = Array.from(this._paintWaiters);
    this._paintWaiters.clear();
    for (const resolve of waiters) {
      try {
        resolve(receivedPaint);
      } catch {
        // ignore
      }
    }
  }

  _handlePaint(event) {
    this._paintPending = false;
    if (this._disposed) {
      this._resolvePaintWaiters(false);
      return;
    }
    this.syncPaint(event?.changedElements ?? null, { fromPaint: true });
    this._resolvePaintWaiters(true);
    if (!this.stage._manualMode && this.stage._rendererReady) {
      this.stage.requestRender();
    }
  }

  /**
   * Wait for any pending `<canvas content="drawable">` `onpaint` & GPU texture upload
   * (or synchronously flush dirty HiDPI fallback canvases on non-HIC browsers).
   * Used by `compositor.js`, `stage.renderNowAsync()`, and `__simulify.seek(t)` for deterministic capture.
   */
  async flushPaint({ timeoutMs = 180 } = {}) {
    if (this._disposed || this.surfaces.size === 0) return false;

    if (!this.nativeEnabled) {
      return this.syncPaint(null);
    }

    if (!this.hasPendingVisible()) return false;

    for (let pass = 0; pass < 2; pass += 1) {
      if (!this.hasPendingVisible()) break;

      let receivedPaint = false;
      await new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const done = (fromOnPaint = false) => {
          if (settled) return;
          settled = true;
          receivedPaint = Boolean(fromOnPaint);
          this._paintWaiters.delete(done);
          if (timer) clearTimeout(timer);
          resolve();
        };
        this._paintWaiters.add(done);
        timer = setTimeout(() => done(false), Math.max(40, Number(timeoutMs) || 180));
        this._paintPending = false;
        this.requestPaint();
      });

      if (!receivedPaint && this.hasPendingVisible()) {
        // Timeout fallback: attempt upload only when element is visible and laid out
        this.syncPaint(null, { fromPaint: true });
      }
    }

    return true;
  }

  /**
   * Upload dirty or changed drawable elements into GPU textures (or redraw dirty fallback canvases).
   * In native HTML-in-Canvas mode, calls outside `canvas.onpaint` (`fromPaint: false`) never
   * prematurely upload or clear `dirty` for surfaces still awaiting Blink paint after a DOM or
   * `hidden -> visible` transition — `onpaint` / `flushPaint()` remains the authoritative upload exit.
   */
  syncPaint(changedElements = null, opts = {}) {
    if (this._disposed || this.surfaces.size === 0) return false;

    if (!this.nativeEnabled) {
      let updatedAny = false;
      for (const surf of this.surfaces.values()) {
        if (surf.visible && (surf.dirty || !surf.uploadedOnce)) {
          if (this._syncFallbackSurface(surf)) updatedAny = true;
        }
      }
      return updatedAny;
    }

    const fromPaint = Boolean(opts && opts.fromPaint);
    const hasChangedList = Boolean(changedElements && changedElements.length > 0);
    if (hasChangedList) {
      for (const changedEl of changedElements) {
        const id = this._elToId.get(changedEl);
        if (id) {
          const surf = this.surfaces.get(id);
          if (surf) surf.dirty = true;
        }
      }
    }

    const ctxInfo = this._getBackendContext();
    if (!ctxInfo) return false;

    let uploadedAny = false;
    let needsRetry = false;
    for (const surf of this.surfaces.values()) {
      if (!surf.visible || this._isElementCssHidden(surf.el)) continue;
      if (surf.dirty || surf.awaitingPaint || !surf.uploadedOnce) {
        if (!fromPaint && surf.awaitingPaint) {
          // Defer upload until Blink fires canvas.onpaint with the freshly painted element record
          surf.dirty = true;
          needsRetry = true;
          continue;
        }
        const ok = this._uploadSurface(surf, ctxInfo);
        if (ok) uploadedAny = true;
        else if (surf.dirty || surf.awaitingPaint) needsRetry = true;
      }
    }

    if (needsRetry && !this._paintPending) {
      this.requestPaint();
    }
    return uploadedAny;
  }

  requestPaint() {
    if (!this.nativeEnabled || this._disposed || this._paintPending) return;
    this._paintPending = true;
    try {
      this.canvas.requestPaint();
    } catch {
      this._paintPending = false;
    }
  }

  markDirty(id) {
    const surf = this.surfaces.get(id);
    if (!surf) return;
    surf.dirty = true;
    if (this.nativeEnabled) {
      surf.awaitingPaint = true;
      this.requestPaint();
    } else {
      this._syncFallbackSurface(surf);
    }
    this.stage?.requestRender?.();
  }

  setVisible(id, visible) {
    const surf = this.surfaces.get(id);
    if (!surf) return;
    const next = Boolean(visible);
    const changed = surf.visible !== next;
    surf.visible = next;
    surf.mesh.visible = next;

    if (this.nativeEnabled) {
      if (!next) {
        try {
          this.canvas.clearElementGeometry(surf.el);
        } catch {
          // Ignore if geometry was not set
        }
      } else if (changed || !surf.uploadedOnce) {
        surf.dirty = true;
        surf.awaitingPaint = true;
        this.requestPaint();
      }
    } else {
      surf.el.style.display = next ? '' : 'none';
      surf.el.style.pointerEvents = next && surf.mode === 'interactive' && surf.opacity > 0.05 ? 'auto' : 'none';
      if (next && (changed || surf.dirty || !surf.uploadedOnce)) {
        surf.dirty = true;
        this._syncFallbackSurface(surf);
      }
    }
    if (changed) {
      this.stage?.requestRender?.();
    }
  }

  setOpacity(id, opacity) {
    const surf = this.surfaces.get(id);
    if (!surf) return;
    const a = Math.max(0, Math.min(1, Number(opacity) || 0));
    const changed = Math.abs(surf.opacity - a) > 1e-4;
    surf.opacity = a;
    if (surf.uOpacity) {
      surf.uOpacity.value = a;
    } else if (surf.material && 'opacity' in surf.material) {
      surf.material.opacity = a;
    }
    if (!this.nativeEnabled && surf.mode === 'interactive') {
      // Keep DOM overlay invisible (3D mesh renders the HiDPI CanvasTexture) while preserving hit-testing
      surf.el.style.opacity = '0';
      surf.el.style.pointerEvents = a > 0.05 && surf.visible ? 'auto' : 'none';
    }
    if (changed) {
      this.stage?.requestRender?.();
    }
  }

  /**
   * Sync 3D hit-test & accessibility geometry (native Chrome 157+) OR transparent
   * hit-test CSS matrix3d overlay (non-HIC fallback), and re-check projected resolution.
   * Called once per camera/frame update.
   */
  updateGeometries(camera) {
    if (this._disposed || this.surfaces.size === 0 || !camera) return;

    let needsNativeRepaint = false;

    for (const surf of this.surfaces.values()) {
      const active = surf.visible && surf.mesh.visible && Boolean(surf.mesh.parent) && surf.opacity > 0.01;

      if (this.nativeEnabled) {
        if (!active) {
          try {
            this.canvas.clearElementGeometry(surf.el);
          } catch {
            // Ignore
          }
          continue;
        }
        if (this._measureElement(surf, camera)) {
          needsNativeRepaint = true;
        }
        const mat = computeCanvasMatrix4(this.canvas, surf.el, surf.mesh, camera, this._tmpMat);
        if (mat && typeof DOMMatrix !== 'undefined') {
          try {
            this.canvas.updateElementGeometry(surf.el, {
              canvasTransform: new DOMMatrix(Array.from(mat.elements)),
            });
          } catch {
            // Ignore if element temporarily detached
          }
        }
      } else {
        if (!active) {
          surf.el.style.display = 'none';
          continue;
        }
        if (this._measureElement(surf, camera)) {
          this._syncFallbackSurface(surf);
        }
        if (surf.mode === 'interactive') {
          const mat = computeCanvasMatrix4(this.canvas, surf.el, surf.mesh, camera, this._tmpMat);
          if (mat) {
            surf.el.style.display = '';
            surf.el.style.opacity = '0';
            surf.el.style.transform = `matrix3d(${mat.elements.join(',')})`;
          } else {
            surf.el.style.display = 'none';
          }
        }
      }
    }

    if (needsNativeRepaint) {
      this.requestPaint();
    }
  }

  unmount(id) {
    const surf = this.surfaces.get(id);
    if (!surf) return;

    if (this._resizeObserver) {
      try {
        this._resizeObserver.unobserve(surf.el);
      } catch {
        // Ignore
      }
    }
    if (this.nativeEnabled) {
      try {
        this.canvas.clearElementGeometry(surf.el);
      } catch {
        // Ignore
      }
      if ('_prevInlineBoxShadow' in surf && surf.el?.style) {
        surf.el.style.boxShadow = surf._prevInlineBoxShadow;
      }
    }
    this._releaseSurfaceGpuResources(surf);
    if (surf.fallbackTex) {
      surf.fallbackTex.dispose();
    }
    if (surf.material) {
      surf.material.dispose();
    }
    if (surf.ownsMesh) {
      surf.mesh.geometry?.dispose?.();
      surf.mesh.removeFromParent();
    }
    if (surf.el.parentElement === this.canvas || surf.el.parentElement === this._fallbackHost) {
      surf.el.remove();
    }
    this.surfaces.delete(id);
    this.stage?.requestRender?.();
  }

  dispose() {
    this._disposed = true;
    this._resolvePaintWaiters(false);
    for (const id of Array.from(this.surfaces.keys())) {
      this.unmount(id);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.nativeEnabled) {
      this.canvas.onpaint = null;
    }
    if (this._fallbackHost) {
      this._fallbackHost.remove();
      this._fallbackHost = null;
    }
  }
}
