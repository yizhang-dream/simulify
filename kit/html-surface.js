import * as THREE from 'three';
import { GROUND_LAYER } from './outline-pass.js';

const _pixelToLocal = new THREE.Matrix4();
const _mvp = new THREE.Matrix4();
const _viewport = new THREE.Matrix4();
const _size = new THREE.Vector3();

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
  void main() {
    vec4 tex = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
    gl_FragColor = vec4(tex.rgb, tex.a * uOpacity);
  }
`;

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
      depthWrite: false,
    });
    const flippedUv = TSL.vec2(TSL.uv().x, TSL.float(1.0).sub(TSL.uv().y));
    const texNode = TSL.texture(extTex, flippedUv);
    const uOpacity = TSL.uniform(opacity);
    mat.colorNode = TSL.sRGBTransferEOTF(texNode.rgb);
    mat.opacityNode = texNode.a.mul(uOpacity);
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
    depthWrite: false,
  });
  return { material: mat, texNode: null, uOpacity: mat.uniforms.uOpacity };
}

/**
 * Progressive-enhancement HTML-in-Canvas surface manager for Simulify v2.
 *
 * - On Chrome/Edge 157+ (`supportsHtmlInCanvas()`):
 *   Sets `<canvas content="drawable">`, manages ONE centralized `canvas.onpaint`
 *   dispatcher reading `event.changedElements`, tracks backing-store sizes via
 *   `ResizeObserver` (`devicePixelContentBoxSize`), uploads directly via WebGPU
 *   `device.queue.drawElementImageToTexture` or WebGL2 `gl.texElementSubImage2D`
 *   into `THREE.ExternalTexture` with bit-exact `sRGBTransferEOTF`, and syncs
 *   3D click/focus bounds via `canvas.updateElementGeometry`.
 *   (Bypasses `three@0.187.0`'s `THREE.HTMLTexture` which still targets removed
 *   draft APIs `layoutsubtree` / `texElementImage2D` / `copyElementImageToTexture`.)
 *
 * - On Firefox / Safari (or when `enabled: false`):
 *   Seamlessly degrades:
 *   - `mode: 'interactive'` -> CSS `matrix3d` DOM overlay projected onto 3D mesh
 *   - `mode: 'decal'` -> offscreen 2D `CanvasTexture` driven by `drawFallback(ctx, w, h)`
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
    this._supportsDpc =
      typeof ResizeObserverEntry !== 'undefined' &&
      'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;
    this._disposed = false;
    this._paintPending = false;
    this._tmpMat = new THREE.Matrix4();

    if (this.nativeEnabled) {
      this._initNative();
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
          const dpc = entry.devicePixelContentBoxSize;
          const dpr = window.devicePixelRatio || 1;
          const nextW = Math.max(
            1,
            dpc ? Math.round(dpc[0].inlineSize) : Math.round(entry.contentRect.width * dpr)
          );
          const nextH = Math.max(
            1,
            dpc ? Math.round(dpc[0].blockSize) : Math.round(entry.contentRect.height * dpr)
          );
          if (nextW !== surf.width || nextH !== surf.height) {
            surf.width = nextW;
            surf.height = nextH;
            surf.needsAlloc = true;
            surf.dirty = true;
            anyChanged = true;
          }
        }
        if (anyChanged) this.requestPaint();
      });
    }
  }

  _ensureFallbackHost() {
    if (this._fallbackHost) return this._fallbackHost;
    const parent = this.canvas.parentElement;
    if (!parent) return null;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    const host = document.createElement('div');
    host.className = 'simulify-html-fallback';
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
    const layer = opts.layer ?? GROUND_LAYER;

    let mesh = opts.mesh || null;
    let ownsMesh = false;
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(worldWidth, worldHeight),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side })
      );
      mesh.layers.set(layer);
      ownsMesh = true;
    }

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
      needsAlloc: true,
      uploadedOnce: false,
      width: 0,
      height: 0,
      extTex: null,
      rawGpuTex: null,
      rawGlTex: null,
      material: null,
      texNode: null,
      uOpacity: null,
      fallbackCanvas: null,
      fallbackTex: null,
      drawFallback: typeof opts.drawFallback === 'function' ? opts.drawFallback : null,
    };

    this.surfaces.set(id, surf);
    this._elToId.set(el, id);

    if (this.nativeEnabled) {
      el.setAttribute('drawable', '');
      if (el.parentElement !== this.canvas) {
        this.canvas.appendChild(el);
      }
      if (this._resizeObserver) {
        this._resizeObserver.observe(el, this._supportsDpc ? { box: 'device-pixel-content-box' } : {});
      }
      this._measureElement(surf);
      this.requestPaint();
    } else if (mode === 'decal' && surf.drawFallback) {
      const c = document.createElement('canvas');
      c.width = Math.max(64, Math.round(opts.fallbackWidth ?? 512));
      c.height = Math.max(32, Math.round(opts.fallbackHeight ?? 256));
      const ctx = c.getContext('2d');
      surf.drawFallback(ctx, c.width, c.height, el);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        toneMapped: false,
        side,
        depthWrite: false,
      });
      if (ownsMesh) mesh.material.dispose();
      mesh.material = mat;
      surf.fallbackCanvas = c;
      surf.fallbackTex = tex;
      surf.material = mat;
    } else {
      // Interactive CSS matrix3d DOM fallback (Firefox / Safari)
      const host = this._ensureFallbackHost();
      if (host && el.parentElement !== host) {
        host.appendChild(el);
      }
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.transformOrigin = '0 0';
      el.style.pointerEvents = 'auto';
      el.style.opacity = String(opacity);
      if (ownsMesh) {
        mesh.material.opacity = 0;
      }
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

  _measureElement(surf) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round((surf.el.offsetWidth || 256) * dpr));
    const h = Math.max(1, Math.round((surf.el.offsetHeight || 128) * dpr));
    if (w !== surf.width || h !== surf.height) {
      surf.width = w;
      surf.height = h;
      surf.needsAlloc = true;
      surf.dirty = true;
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

    let extTex = null;
    if (ctxInfo.kind === 'webgpu') {
      const rawGpuTex = ctxInfo.device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING,
      });
      surf.rawGpuTex = rawGpuTex;
      extTex = new THREE.ExternalTexture(rawGpuTex);
    } else {
      const gl = ctxInfo.gl;
      const rawGlTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, rawGlTex);
      // Mutable allocation required by spec (never immutable texStorage2D)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      surf.rawGlTex = rawGlTex;
      extTex = new THREE.ExternalTexture(rawGlTex);
    }

    extTex.flipY = false;
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

  _uploadSurface(surf, ctxInfo) {
    if (!surf.visible && surf.uploadedOnce) return false;
    if (surf.width <= 0 || surf.height <= 0) {
      this._measureElement(surf);
    }
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
      } else {
        const gl = ctxInfo.gl;
        gl.bindTexture(gl.TEXTURE_2D, surf.rawGlTex);
        gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, surf.el, size);
      }
      surf.dirty = false;
      surf.uploadedOnce = true;
      return true;
    } catch {
      // Element may not have a paint record on the very first tick; retry on next paint
      surf.dirty = true;
      return false;
    }
  }

  _handlePaint(event) {
    this._paintPending = false;
    if (this._disposed) return;
    this.syncPaint(event?.changedElements ?? null);
    if (!this.stage._manualMode && this.stage._rendererReady) {
      this.stage.renderNow();
    }
  }

  /**
   * Upload dirty or changed drawable elements into GPU textures.
   * Called automatically from `canvas.onpaint`, and safely callable from deterministic render loops.
   */
  syncPaint(changedElements = null) {
    if (!this.nativeEnabled || this._disposed || this.surfaces.size === 0) return false;
    const ctxInfo = this._getBackendContext();
    if (!ctxInfo) return false;

    if (changedElements && changedElements.length > 0) {
      for (const changedEl of changedElements) {
        const id = this._elToId.get(changedEl);
        if (id) {
          const surf = this.surfaces.get(id);
          if (surf) surf.dirty = true;
        }
      }
    }

    let uploadedAny = false;
    let needsRetry = false;
    for (const surf of this.surfaces.values()) {
      if (surf.dirty || !surf.uploadedOnce) {
        const ok = this._uploadSurface(surf, ctxInfo);
        if (ok) uploadedAny = true;
        else if (surf.dirty) needsRetry = true;
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
    if (this.nativeEnabled) {
      surf.dirty = true;
      this.requestPaint();
    } else if (surf.mode === 'decal' && surf.drawFallback && surf.fallbackCanvas && surf.fallbackTex) {
      const ctx = surf.fallbackCanvas.getContext('2d');
      ctx.clearRect(0, 0, surf.fallbackCanvas.width, surf.fallbackCanvas.height);
      surf.drawFallback(ctx, surf.fallbackCanvas.width, surf.fallbackCanvas.height, surf.el);
      surf.fallbackTex.needsUpdate = true;
    }
  }

  setVisible(id, visible) {
    const surf = this.surfaces.get(id);
    if (!surf) return;
    const next = Boolean(visible);
    surf.visible = next;
    surf.mesh.visible = next;

    if (this.nativeEnabled) {
      if (!next) {
        try {
          this.canvas.clearElementGeometry(surf.el);
        } catch {
          // Ignore if geometry was not set
        }
      } else {
        surf.dirty = true;
        this.requestPaint();
      }
    } else if (surf.mode === 'interactive') {
      surf.el.style.display = next ? '' : 'none';
    }
  }

  setOpacity(id, opacity) {
    const surf = this.surfaces.get(id);
    if (!surf) return;
    const a = Math.max(0, Math.min(1, Number(opacity) || 0));
    surf.opacity = a;
    if (surf.uOpacity) {
      surf.uOpacity.value = a;
    } else if (surf.material && 'opacity' in surf.material) {
      surf.material.opacity = a;
    }
    if (!this.nativeEnabled && surf.mode === 'interactive') {
      surf.el.style.opacity = String(a);
      surf.el.style.pointerEvents = a > 0.05 && surf.visible ? 'auto' : 'none';
    }
  }

  /**
   * Sync 3D hit-test & accessibility geometry (native Chrome 157+) OR CSS matrix3d fallback.
   * Called once per frame after camera matrices update.
   */
  updateGeometries(camera) {
    if (this._disposed || this.surfaces.size === 0 || !camera) return;

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
      } else if (surf.mode === 'interactive') {
        if (!active) {
          surf.el.style.display = 'none';
          continue;
        }
        const mat = computeCanvasMatrix4(this.canvas, surf.el, surf.mesh, camera, this._tmpMat);
        if (mat) {
          surf.el.style.display = '';
          surf.el.style.transform = `matrix3d(${mat.elements.join(',')})`;
        } else {
          surf.el.style.display = 'none';
        }
      }
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
  }

  dispose() {
    this._disposed = true;
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
