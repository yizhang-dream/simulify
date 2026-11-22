import * as THREE from 'three';

const OUTLINE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float thickness;
  uniform float isOrtho;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float depthThreshold;
  uniform float normalThreshold;
  uniform vec3 lineColor;
  uniform float lineOpacity;
  uniform float focusDim;
  varying vec2 vUv;

  float depthAt(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    if (isOrtho > 0.5) {
      return d * (cameraFar - cameraNear);
    }
    return (cameraNear * cameraFar) / max(cameraFar - d * (cameraFar - cameraNear), 1e-4);
  }

  float edgePair(vec2 uv, vec2 off, float d0, vec4 n0) {
    vec4 na = texture2D(tNormal, uv + off);
    vec4 nb = texture2D(tNormal, uv - off);
    float da = depthAt(uv + off);
    float db = depthAt(uv - off);

    // Silhouette against transparent background
    float edge = max(abs(na.a - n0.a), abs(nb.a - n0.a));

    if (n0.a > 0.5) {
      // Second-derivative depth step detection (ignores smooth angled planes)
      float lap = abs(da + db - 2.0 * d0);
      float stepA = (na.a > 0.5) ? abs(da - d0) : 0.0;
      float stepB = (nb.a > 0.5) ? abs(db - d0) : 0.0;
      float dEdge = smoothstep(
        depthThreshold,
        depthThreshold * 2.0,
        min(lap, max(stepA, stepB) * 2.0)
      );
      edge = max(edge, dEdge);

      // Normal crease detection along mechanical bevels and corners
      vec3 c = n0.xyz * 2.0 - 1.0;
      float ca = (na.a > 0.5) ? 1.0 - dot(c, na.xyz * 2.0 - 1.0) : 0.0;
      float cb = (nb.a > 0.5) ? 1.0 - dot(c, nb.xyz * 2.0 - 1.0) : 0.0;
      edge = max(edge, 0.9 * smoothstep(normalThreshold, normalThreshold * 2.2, max(ca, cb)));
    }
    return edge;
  }

  void main() {
    vec4 col = texture2D(tColor, vUv);
    vec4 n0 = texture2D(tNormal, vUv);
    float d0 = depthAt(vUv);

    vec2 o = texel * thickness;
    float e = 0.0;
    e = max(e, edgePair(vUv, vec2(o.x, 0.0), d0, n0));
    e = max(e, edgePair(vUv, vec2(0.0, o.y), d0, n0));
    e = max(e, edgePair(vUv, vec2(o.x, o.y) * 0.7071, d0, n0));
    e = max(e, edgePair(vUv, vec2(o.x, -o.y) * 0.7071, d0, n0));

    // Soft outer anti-aliased ring
    vec2 o2 = o * 1.5;
    float e2 = 0.0;
    e2 = max(e2, edgePair(vUv, vec2(o2.x, 0.0), d0, n0));
    e2 = max(e2, edgePair(vUv, vec2(0.0, o2.y), d0, n0));
    e = clamp(max(e, e2 * 0.35) * lineOpacity, 0.0, 1.0);

    // Unpremultiply linear color target, blend ink stroke, apply subtle focus vignette
    vec3 rgb = col.a > 1e-4 ? col.rgb / col.a : vec3(0.0);
    float a = col.a;
    if (focusDim > 0.001) {
      float radial = length((vUv - 0.5) * vec2(1.15, 1.0));
      float dimMask = smoothstep(0.28, 0.78, radial) * focusDim;
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(rgb, vec3(luma) * 0.78, dimMask * 0.55);
    }
    float outA = a + e * (1.0 - a);
    vec3 mixed = (rgb * a * (1.0 - e) + lineColor * e) / max(outA, 1e-4);

    gl_FragColor = vec4(mixed, outA);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

export const SOLID_LAYER = 0;
export const GROUND_LAYER = 1;

function syncCameraProps(src, dst) {
  dst.position.copy(src.position);
  dst.quaternion.copy(src.quaternion);
  dst.scale.copy(src.scale);
  dst.near = src.near;
  dst.far = src.far;
  dst.zoom = src.zoom;
  if (src.isOrthographicCamera && dst.isOrthographicCamera) {
    dst.left = src.left;
    dst.right = src.right;
    dst.top = src.top;
    dst.bottom = src.bottom;
  } else if (src.isPerspectiveCamera && dst.isPerspectiveCamera) {
    dst.fov = src.fov;
    dst.aspect = src.aspect;
  }
  dst.matrixWorld.copy(src.matrixWorld);
  dst.matrixWorldInverse.copy(src.matrixWorldInverse);
  dst.projectionMatrix.copy(src.projectionMatrix);
  dst.projectionMatrixInverse.copy(src.projectionMatrixInverse);
  dst.layers.set(SOLID_LAYER);
}

/**
 * Dual-backend technical ink outline post-processing pass:
 * - On Three.js WebGPURenderer (WebGPU + WebGL2 fallback): unified TSL RenderPipeline
 *   using dual pass(scene, camera) + Layer 0 MRT(normalView + depth), with optional
 *   subtle bloom and peripheral focus-dimming hooks.
 * - On legacy WebGLRenderer (v1 benches using three.module.js): proven GLSL 3-pass fallback.
 */
export class OutlinePass {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.thickness = options.thickness ?? 1.25;
    this.pixelRatio = 1;
    this.lineScale = 1;
    this.opacity = options.opacity ?? 0.92;
    this.depthThreshold = options.depthThreshold ?? 0.32;
    this.normalThreshold = options.normalThreshold ?? 0.22;
    this.lineColor = new THREE.Color(options.lineColor ?? '#141a2c');
    this.focusDim = options.focusDim ?? 0;

    this.isTSL = Boolean(renderer?.isWebGPURenderer && THREE.RenderPipeline && THREE.TSL);

    if (this.isTSL) {
      this._initTSLState(options);
    } else {
      this._initLegacyGLSL(options);
    }
  }

  _initTSLState(options) {
    const TSL = THREE.TSL;
    this._pipeline = null;
    this._boundScene = null;
    this._boundCamera = null;
    this._solidCamera = null;
    this._colorPass = null;
    this._solidPass = null;
    this._bloomAddon = null;
    this._bloomConfig = options.bloom
      ? {
          enabled: true,
          strength: options.bloom.strength ?? 0.22,
          radius: options.bloom.radius ?? 0.35,
          threshold: options.bloom.threshold ?? 0.88,
        }
      : { enabled: false, strength: 0.22, radius: 0.35, threshold: 0.88 };

    this._uThickness = TSL.uniform(this.thickness);
    this._uIsOrtho = TSL.uniform(1.0);
    this._uNear = TSL.uniform(1.0);
    this._uFar = TSL.uniform(240.0);
    this._uDepthThreshold = TSL.uniform(this.depthThreshold);
    this._uNormalThreshold = TSL.uniform(this.normalThreshold);
    this._uLineColor = TSL.uniform(this.lineColor.clone());
    this._uLineOpacity = TSL.uniform(this.opacity);
    this._uFocusDim = TSL.uniform(this.focusDim);
    this._uBloomStrength = TSL.uniform(this._bloomConfig.enabled ? this._bloomConfig.strength : 0);
  }

  _buildTSLPipeline(scene, camera) {
    this._disposeTSLPipeline();

    const TSL = THREE.TSL;
    const {
      pass,
      mrt,
      normalView,
      Fn,
      vec2,
      vec3,
      vec4,
      float,
      screenUV,
      viewportSize,
      smoothstep,
      abs,
      dot,
      max,
      min,
      clamp,
      mix,
      length,
      select,
    } = TSL;

    this._boundScene = scene;
    this._boundCamera = camera;
    this._solidCamera = camera.isPerspectiveCamera
      ? new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far)
      : new THREE.OrthographicCamera(camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far);
    syncCameraProps(camera, this._solidCamera);

    // Ensure color pass sees both SOLID_LAYER and GROUND_LAYER
    camera.layers.enable(SOLID_LAYER);
    camera.layers.enable(GROUND_LAYER);

    const colorPass = pass(scene, camera);
    const solidPass = pass(scene, this._solidCamera, { samples: 0 });
    solidPass.setMRT(mrt({ output: vec4(normalView.mul(0.5).add(0.5), float(1.0)) }));

    this._colorPass = colorPass;
    this._solidPass = solidPass;

    const colorNode = colorPass.getTextureNode('output');
    const normalNode = solidPass.getTextureNode('output');
    const depthNode = solidPass.getTextureNode('depth');

    const uThickness = this._uThickness;
    const uIsOrtho = this._uIsOrtho;
    const uNear = this._uNear;
    const uFar = this._uFar;
    const uDepthThreshold = this._uDepthThreshold;
    const uNormalThreshold = this._uNormalThreshold;
    const uLineColor = this._uLineColor;
    const uLineOpacity = this._uLineOpacity;
    const uFocusDim = this._uFocusDim;

    const bloomNode =
      this._bloomConfig.enabled && this._bloomAddon
        ? this._bloomAddon(colorNode, this._bloomConfig.strength, this._bloomConfig.radius, this._bloomConfig.threshold)
        : null;

    const composite = Fn(() => {
      const texel = vec2(1.0).div(viewportSize);
      const rawCol = colorNode.sample(screenUV);
      const colRgbBase = bloomNode ? rawCol.rgb.add(bloomNode.rgb) : rawCol.rgb;
      const n0 = normalNode.sample(screenUV);

      const depthAt = (uvCoord) => {
        const d = depthNode.sample(uvCoord).r;
        const span = uFar.sub(uNear);
        const orthoZ = d.mul(span);
        const perspZ = uNear.mul(uFar).div(max(uFar.sub(d.mul(span)), float(1e-4)));
        return select(uIsOrtho.greaterThan(0.5), orthoZ, perspZ);
      };

      const d0 = depthAt(screenUV);

      const edgePair = (off) => {
        const uvA = screenUV.add(off);
        const uvB = screenUV.sub(off);
        const na = normalNode.sample(uvA);
        const nb = normalNode.sample(uvB);
        const da = depthAt(uvA);
        const db = depthAt(uvB);

        // Silhouette against transparent background
        const sil = max(abs(na.a.sub(n0.a)), abs(nb.a.sub(n0.a)));

        // Second-derivative depth step detection
        const lap = abs(da.add(db).sub(d0.mul(2.0)));
        const stepA = select(na.a.greaterThan(0.5), abs(da.sub(d0)), float(0.0));
        const stepB = select(nb.a.greaterThan(0.5), abs(db.sub(d0)), float(0.0));
        const dEdge = smoothstep(uDepthThreshold, uDepthThreshold.mul(2.0), min(lap, max(stepA, stepB).mul(2.0)));

        // Normal crease detection along mechanical bevels and corners
        const c = n0.xyz.mul(2.0).sub(1.0);
        const ca = select(na.a.greaterThan(0.5), float(1.0).sub(dot(c, na.xyz.mul(2.0).sub(1.0))), float(0.0));
        const cb = select(nb.a.greaterThan(0.5), float(1.0).sub(dot(c, nb.xyz.mul(2.0).sub(1.0))), float(0.0));
        const nEdge = smoothstep(uNormalThreshold, uNormalThreshold.mul(2.2), max(ca, cb)).mul(0.9);

        const interior = select(n0.a.greaterThan(0.5), max(dEdge, nEdge), float(0.0));
        return max(sil, interior);
      };

      const o = texel.mul(uThickness);
      const e1 = max(
        max(edgePair(vec2(o.x, 0.0)), edgePair(vec2(0.0, o.y))),
        max(edgePair(vec2(o.x, o.y).mul(0.7071)), edgePair(vec2(o.x, o.y.negate()).mul(0.7071)))
      );

      // Soft outer anti-aliased halo
      const o2 = o.mul(1.5);
      const e2 = max(edgePair(vec2(o2.x, 0.0)), edgePair(vec2(0.0, o2.y)));
      const e = clamp(max(e1, e2.mul(0.35)).mul(uLineOpacity), 0.0, 1.0);

      // Optional peripheral focus-dimming for progressive temporal beats
      const radial = length(screenUV.sub(0.5).mul(vec2(1.15, 1.0)));
      const dimMask = smoothstep(0.28, 0.78, radial).mul(uFocusDim);
      const luma = dot(colRgbBase, vec3(0.2126, 0.7152, 0.0722));
      const colRgb = mix(colRgbBase, vec3(luma).mul(0.78), dimMask.mul(0.55));

      const a = rawCol.a;
      const outA = a.add(e.mul(float(1.0).sub(a)));
      const mixedRgb = colRgb.mul(a).mul(float(1.0).sub(e)).add(uLineColor.mul(e)).div(max(outA, float(1e-4)));
      return vec4(mixedRgb, outA);
    });

    this._pipeline = new THREE.RenderPipeline(this.renderer);
    this._pipeline.outputNode = composite();
  }

  _disposeTSLPipeline() {
    if (this._colorPass?.dispose) this._colorPass.dispose();
    if (this._solidPass?.dispose) this._solidPass.dispose();
    this._colorPass = null;
    this._solidPass = null;
    this._pipeline = null;
    this._boundScene = null;
    this._boundCamera = null;
    this._solidCamera = null;
  }

  /**
   * Optional async hook to enable subtle TSL bloom on WebGPU / WebGL2 RenderPipeline.
   * Dynamically imports BloomNode so legacy importmaps without three/tsl never fail.
   */
  async enableBloom({ strength = 0.22, radius = 0.35, threshold = 0.88 } = {}) {
    if (!this.isTSL) return false;
    try {
      const mod = await import('three/addons/tsl/display/BloomNode.js');
      this._bloomAddon = mod.bloom || null;
      this._bloomConfig = { enabled: Boolean(this._bloomAddon), strength, radius, threshold };
      this._uBloomStrength.value = this._bloomConfig.enabled ? strength : 0;
      if (this._boundScene && this._boundCamera) {
        this._buildTSLPipeline(this._boundScene, this._boundCamera);
      }
      return this._bloomConfig.enabled;
    } catch {
      return false;
    }
  }

  _initLegacyGLSL(options) {
    const samples = this.renderer.capabilities?.isWebGL2 ? (options.samples ?? 4) : 0;
    this.colorTarget = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples,
    });

    const depthTexture = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.type = THREE.UnsignedIntType;

    this.normalTarget = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture,
    });

    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.material = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERTEX,
      fragmentShader: OUTLINE_FRAGMENT,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.normalTarget.depthTexture },
        texel: { value: new THREE.Vector2(0.5, 0.5) },
        thickness: { value: this.thickness },
        isOrtho: { value: 1.0 },
        cameraNear: { value: 1.0 },
        cameraFar: { value: 240.0 },
        depthThreshold: { value: this.depthThreshold },
        normalThreshold: { value: this.normalThreshold },
        lineColor: { value: this.lineColor.clone() },
        lineOpacity: { value: this.opacity },
        focusDim: { value: this.focusDim },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.NoBlending,
    });

    this.fsScene = new THREE.Scene();
    this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.fsScene.add(this.fsQuad);

    this._savedClearColor = new THREE.Color();
  }

  setSize(width, height, pixelRatio = 1) {
    const rw = Math.max(2, Math.round(width * pixelRatio));
    const rh = Math.max(2, Math.round(height * pixelRatio));
    this.pixelRatio = pixelRatio;

    if (this.isTSL) {
      this.setLineScale(this.lineScale);
      return;
    }

    this.colorTarget.setSize(rw, rh);
    this.normalTarget.setSize(rw, rh);
    this.material.uniforms.texel.value.set(1 / rw, 1 / rh);
    this.setLineScale(this.lineScale);
  }

  setLineScale(scale) {
    this.lineScale = scale;
    const px = this.thickness * this.pixelRatio * scale;
    if (this.isTSL) {
      this._uThickness.value = px;
    } else {
      this.material.uniforms.thickness.value = px;
    }
  }

  setInkColor(color, opacity) {
    this.lineColor.set(color);
    if (opacity !== undefined) this.opacity = opacity;
    if (this.isTSL) {
      this._uLineColor.value.copy(this.lineColor);
      if (opacity !== undefined) this._uLineOpacity.value = this.opacity;
    } else {
      this.material.uniforms.lineColor.value.copy(this.lineColor);
      if (opacity !== undefined) this.material.uniforms.lineOpacity.value = this.opacity;
    }
  }

  setFocusDim(strength = 0) {
    this.focusDim = Math.max(0, Math.min(1, Number(strength) || 0));
    if (this.isTSL) {
      this._uFocusDim.value = this.focusDim;
    } else {
      this.material.uniforms.focusDim.value = this.focusDim;
    }
  }

  render(scene, camera) {
    if (this.isTSL) {
      this._prepareTSLFrame(scene, camera);
      this._pipeline.render();
      return;
    }

    const renderer = this.renderer;
    const savedAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._savedClearColor);
    const savedMask = camera.layers.mask;

    this.material.uniforms.isOrtho.value = camera.isOrthographicCamera ? 1.0 : 0.0;
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    renderer.setClearColor(0x000000, 0);

    // Pass 1: Normals + Depth of Layer 0 solid objects only
    camera.layers.set(SOLID_LAYER);
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.normalMaterial;
    renderer.setRenderTarget(this.normalTarget);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;

    // Pass 2: Full lit color including Layer 1 ground shadows & grid lines
    camera.layers.enableAll();
    renderer.setRenderTarget(this.colorTarget);
    renderer.clear();
    renderer.render(scene, camera);

    camera.layers.mask = savedMask;

    // Pass 3: Composite color + technical ink outlines to screen
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(this.fsScene, this.fsCamera);

    renderer.setClearColor(this._savedClearColor, savedAlpha);
  }

  async renderAsync(scene, camera) {
    if (this.isTSL) {
      this._prepareTSLFrame(scene, camera);
      await this._pipeline.renderAsync();
      return;
    }
    this.render(scene, camera);
  }

  _prepareTSLFrame(scene, camera) {
    if (
      !this._pipeline ||
      this._boundScene !== scene ||
      this._boundCamera !== camera ||
      Boolean(this._solidCamera?.isPerspectiveCamera) !== Boolean(camera?.isPerspectiveCamera)
    ) {
      this._buildTSLPipeline(scene, camera);
    }
    syncCameraProps(camera, this._solidCamera);
    this._uIsOrtho.value = camera.isOrthographicCamera ? 1.0 : 0.0;
    this._uNear.value = camera.near;
    this._uFar.value = camera.far;
  }

  dispose() {
    if (this.isTSL) {
      this._disposeTSLPipeline();
      return;
    }
    this.colorTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.fsQuad.geometry.dispose();
    this.material.dispose();
  }
}
