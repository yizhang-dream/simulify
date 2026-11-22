import * as THREE from 'three';

export const SOLID_LAYER = 0;
export const GROUND_LAYER = 1;
export const SURFACE_LAYER = 2;
export const GLASS_LAYER = 3;

export const OUTLINE_PRESETS = Object.freeze({
  crisp: Object.freeze({
    enabled: true,
    thickness: 0.9,
    opacityScale: 1.0,
    depthThreshold: 0.34,
    normalThreshold: 0.26,
    aoStrength: 0.24,
  }),
  subtle: Object.freeze({
    enabled: true,
    thickness: 0.72,
    opacityScale: 0.56,
    depthThreshold: 0.42,
    normalThreshold: 0.34,
    aoStrength: 0.16,
  }),
  none: Object.freeze({
    enabled: false,
    thickness: 0,
    opacityScale: 0,
    depthThreshold: 0.5,
    normalThreshold: 0.5,
    aoStrength: 0.0,
  }),
});

function resolvePresetName(preset) {
  if (preset === false || preset === 'none') return 'none';
  if (preset === 'subtle') return 'subtle';
  return 'crisp';
}

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
  uniform float aoStrength;
  varying vec2 vUv;

  float depthAt(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    if (isOrtho > 0.5) {
      return d * (cameraFar - cameraNear);
    }
    return (cameraNear * cameraFar) / max(cameraFar - d * (cameraFar - cameraNear), 1e-4);
  }

  float edgePair(vec2 uv, vec2 off, float d0, vec4 n0, float bwdWeight, float weightScale) {
    vec4 na = texture2D(tNormal, uv + off);
    vec4 nb = texture2D(tNormal, uv - off);
    float da = depthAt(uv + off);
    float db = depthAt(uv - off);

    // Outer 1px silhouette on background pixel; subtle AA / HiDPI thickness on interior pixel
    float outerSil = max(max(0.0, na.a - n0.a), max(0.0, nb.a - n0.a));
    float innerSil = max(max(0.0, n0.a - na.a), max(0.0, n0.a - nb.a)) * bwdWeight;
    float edge = max(outerSil, innerSil);

    if (n0.a > 0.5) {
      // Second-derivative depth step detection (rejects smooth sloped surfaces)
      float lap = abs(da + db - 2.0 * d0);
      float stepA = (na.a > 0.5) ? abs(da - d0) : 0.0;
      float stepB = (nb.a > 0.5) ? abs(db - d0) : 0.0;
      float dEdgeA = smoothstep(depthThreshold, depthThreshold * 2.0, min(lap, stepA * 2.0));
      float dEdgeB = smoothstep(depthThreshold, depthThreshold * 2.0, min(lap, stepB * 2.0)) * bwdWeight;
      edge = max(edge, max(dEdgeA, dEdgeB));

      // Normal crease detection along mechanical bevels and sharp ridges
      vec3 c = n0.xyz * 2.0 - 1.0;
      float ca = (na.a > 0.5) ? 1.0 - dot(c, na.xyz * 2.0 - 1.0) : 0.0;
      float cb = (nb.a > 0.5) ? 1.0 - dot(c, nb.xyz * 2.0 - 1.0) : 0.0;
      float nEdgeA = 0.88 * smoothstep(normalThreshold, normalThreshold * 2.1, ca);
      float nEdgeB = 0.88 * smoothstep(normalThreshold, normalThreshold * 2.1, cb) * bwdWeight;
      edge = max(edge, max(nEdgeA, nEdgeB));
    }
    return edge * weightScale;
  }

  void main() {
    vec4 col = texture2D(tColor, vUv);
    vec4 n0 = texture2D(tNormal, vUv);
    float d0 = depthAt(vUv);

    float e = 0.0;
    if (thickness > 0.01 && lineOpacity > 0.001) {
      float stepPx = clamp(floor(thickness * 0.5 + 0.5), 1.0, 2.0);
      float bwdWeight = clamp((thickness - 0.8) / 0.85, 0.22, 1.0);
      vec2 o = texel * stepPx;

      e = max(e, edgePair(vUv, vec2(o.x, 0.0), d0, n0, bwdWeight, 1.0));
      e = max(e, edgePair(vUv, vec2(0.0, o.y), d0, n0, bwdWeight, 1.0));
      e = max(e, edgePair(vUv, vec2(o.x, o.y), d0, n0, bwdWeight, 0.78));
      e = max(e, edgePair(vUv, vec2(o.x, -o.y), d0, n0, bwdWeight, 0.78));
      e = clamp(e * lineOpacity, 0.0, 1.0);
    }

    // Unpremultiply linear color target, apply zero-extra-pass screen-space crease AO & focus vignette
    float a = clamp(col.a, 0.0, 1.0);
    vec3 rgb = a > 1e-4 ? col.rgb / a : vec3(0.0);
    if (aoStrength > 0.001 && n0.a > 0.5) {
      vec3 cn = n0.xyz * 2.0 - 1.0;
      vec2 aoOff = texel * 3.0;
      float occ = 0.0;
      vec2 dirs[4];
      dirs[0] = vec2(aoOff.x, aoOff.y);
      dirs[1] = vec2(-aoOff.x, aoOff.y);
      dirs[2] = vec2(aoOff.x, -aoOff.y);
      dirs[3] = vec2(-aoOff.x, -aoOff.y);
      for (int i = 0; i < 4; i++) {
        vec4 nn = texture2D(tNormal, vUv + dirs[i]);
        if (nn.a > 0.5) {
          float dn = depthAt(vUv + dirs[i]);
          float dd = d0 - dn;
          float nearMask = smoothstep(0.02, 0.28, dd) * (1.0 - smoothstep(0.55, 1.35, dd));
          float crease = smoothstep(0.04, 0.48, 1.0 - dot(cn, nn.xyz * 2.0 - 1.0));
          occ += nearMask * crease;
        }
      }
      rgb *= 1.0 - clamp(occ * 0.25 * aoStrength, 0.0, 0.34);
    }
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

function syncCameraProps(src, dst, layers) {
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
  dst.layers.disableAll();
  for (const layer of layers) {
    dst.layers.enable(layer);
  }
}

function cloneCameraShell(camera) {
  return camera.isPerspectiveCamera
    ? new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far)
    : new THREE.OrthographicCamera(camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far);
}

/**
 * Dual-backend technical ink outline post-processing pass:
 * - On Three.js WebGPURenderer (WebGPU + WebGL2 fallback): unified TSL RenderPipeline with:
 *   1. Nearest-filtered Layer 0 normal+depth solidPass (zero bilinear pre-blur)
 *   2. Exact 1-ring ~0.85–1.0px crisp engineering ink (no 1.5x fuzzy halo)
 *   3. Separated tone-mapping (`outputColorTransform = false`): tone mapping runs ONLY on
 *      lit 3D colorPass (SOLID_LAYER + GROUND_LAYER), NEVER crushing ink strokes or
 *      `SURFACE_LAYER` (HTML-in-Canvas 3D panels) with double ACES compression
 *   4. Proper premultiplied-alpha handling matching WebGPU/WebGL canvas compositing
 * - On legacy WebGLRenderer (v1 benches using three.module.js): aligned crisp GLSL 3-pass fallback.
 */
export class OutlinePass {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.preset = resolvePresetName(options.preset);
    const presetCfg = OUTLINE_PRESETS[this.preset];

    this.enabled = presetCfg.enabled;
    this._baseOpacity = options.opacity ?? 0.86;
    this._explicitThickness = options.thickness !== undefined ? options.thickness : null;
    this._explicitDepthThreshold = options.depthThreshold !== undefined ? options.depthThreshold : null;
    this._explicitNormalThreshold = options.normalThreshold !== undefined ? options.normalThreshold : null;

    this.thickness = this._explicitThickness ?? presetCfg.thickness;
    this.pixelRatio = 1;
    this.lineScale = 1;
    this.opacity = this._baseOpacity * presetCfg.opacityScale;
    this.depthThreshold = this._explicitDepthThreshold ?? presetCfg.depthThreshold;
    this.normalThreshold = this._explicitNormalThreshold ?? presetCfg.normalThreshold;
    this.lineColor = new THREE.Color(options.lineColor ?? '#141a2c');
    this.focusDim = options.focusDim ?? 0;
    this._explicitAO = options.aoStrength !== undefined ? Number(options.aoStrength) : null;
    this.aoStrength = this._explicitAO !== null ? this._explicitAO : presetCfg.aoStrength;

    this.isTSL = Boolean(renderer?.isWebGPURenderer && THREE.RenderPipeline && THREE.TSL);

    if (this.isTSL) {
      this._initTSLState(options);
      if (options.bloom) {
        const bloomOpts = typeof options.bloom === 'object' ? options.bloom : {};
        this.enableBloom(bloomOpts);
      }
      if (options.dof) {
        const dofOpts = typeof options.dof === 'object' ? options.dof : {};
        this.enableDepthOfField(dofOpts);
      }
    } else {
      this._initLegacyGLSL(options);
    }
  }

  _initTSLState(options) {
    const TSL = THREE.TSL;
    this._pipeline = null;
    this._boundScene = null;
    this._boundCamera = null;
    this._boundToneMapping = null;
    this._solidCamera = null;
    this._colorCamera = null;
    this._surfaceCamera = null;
    this._colorPass = null;
    this._solidPass = null;
    this._surfacePass = null;
    this._bloomAddon = null;
    this._bloomConfig = options.bloom
      ? {
          enabled: true,
          strength: options.bloom.strength ?? 0.22,
          radius: options.bloom.radius ?? 0.35,
          threshold: options.bloom.threshold ?? 0.88,
        }
      : { enabled: false, strength: 0.22, radius: 0.35, threshold: 0.88 };
    this._dofAddon = null;
    this._dofConfig = options.dof
      ? {
          enabled: true,
          focusDistance: options.dof.focusDistance ?? 16,
          focalLength: options.dof.focalLength ?? 8,
          bokehScale: options.dof.bokehScale ?? 1.4,
        }
      : { enabled: false, focusDistance: 16, focalLength: 8, bokehScale: 1.4 };

    this._uThickness = TSL.uniform(this.enabled ? this.thickness : 0);
    this._uIsOrtho = TSL.uniform(1.0);
    this._uNear = TSL.uniform(1.0);
    this._uFar = TSL.uniform(240.0);
    this._uDepthThreshold = TSL.uniform(this.depthThreshold);
    this._uNormalThreshold = TSL.uniform(this.normalThreshold);
    this._uLineColor = TSL.uniform(this.lineColor.clone());
    this._uLineOpacity = TSL.uniform(this.enabled ? this.opacity : 0);
    this._uFocusDim = TSL.uniform(this.focusDim);
    this._uAoStrength = TSL.uniform(this.enabled ? this.aoStrength : 0);
    this._uExposure = TSL.uniform(this.renderer?.toneMappingExposure ?? 1.0);
    this._uBloomStrength = TSL.uniform(this._bloomConfig.enabled ? this._bloomConfig.strength : 0);
    this._uDofFocus = TSL.uniform(this._dofConfig.focusDistance);
    this._uDofFocalLength = TSL.uniform(this._dofConfig.focalLength);
    this._uDofBokeh = TSL.uniform(this._dofConfig.bokehScale);
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
      floor,
      mix,
      length,
      select,
      sRGBTransferOETF,
      toneMapping: tslToneMapping,
    } = TSL;

    this._boundScene = scene;
    this._boundCamera = camera;
    this._boundToneMapping = this.renderer.toneMapping;

    this._solidCamera = cloneCameraShell(camera);
    this._colorCamera = cloneCameraShell(camera);
    this._surfaceCamera = cloneCameraShell(camera);

    syncCameraProps(camera, this._solidCamera, [SOLID_LAYER]);
    syncCameraProps(camera, this._colorCamera, [SOLID_LAYER, GROUND_LAYER, GLASS_LAYER]);
    syncCameraProps(camera, this._surfaceCamera, [SURFACE_LAYER]);

    // Ensure main camera sees all layers for picking & non-pipeline renders
    camera.layers.enable(SOLID_LAYER);
    camera.layers.enable(GROUND_LAYER);
    camera.layers.enable(SURFACE_LAYER);
    camera.layers.enable(GLASS_LAYER);

    // Force PassNodes to refresh on every explicit pipeline.render() (NodeUpdateType.RENDER),
    // not once per browser rAF (NodeUpdateType.FRAME), so same-frame onpaint + renderNowAsync()
    // and back-to-back deterministic export seeks never composite stale surfacePass/colorPass frames.
    const renderUpdateType = THREE.NodeUpdateType?.RENDER ?? 'render';

    // 1. Lit 3D scene pass (SOLID_LAYER + GROUND_LAYER + GLASS_LAYER, keeps renderer MSAA + stencil for cutaway caps)
    const colorPass = pass(scene, this._colorCamera, {
      stencilBuffer: true,
    });
    colorPass.updateBeforeType = renderUpdateType;

    // 2. Non-MSAA nearest-filtered normal+depth pass (SOLID_LAYER only) — zero bilinear pre-blur!
    const solidPass = pass(scene, this._solidCamera, {
      samples: 0,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    solidPass.updateBeforeType = renderUpdateType;
    solidPass.setMRT(mrt({ output: vec4(normalView.mul(0.5).add(0.5), float(1.0)) }));
    if (solidPass.renderTarget?.texture) {
      solidPass.renderTarget.texture.minFilter = THREE.NearestFilter;
      solidPass.renderTarget.texture.magFilter = THREE.NearestFilter;
      solidPass.renderTarget.texture.generateMipmaps = false;
    }
    if (solidPass.renderTarget?.depthTexture) {
      solidPass.renderTarget.depthTexture.minFilter = THREE.NearestFilter;
      solidPass.renderTarget.depthTexture.magFilter = THREE.NearestFilter;
      solidPass.renderTarget.depthTexture.generateMipmaps = false;
    }

    // 3. Dedicated un-tone-mapped 3D HTML-in-Canvas surface pass (SURFACE_LAYER only)
    const surfacePass = pass(scene, this._surfaceCamera, {
      samples: 0,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    surfacePass.updateBeforeType = renderUpdateType;
    if (surfacePass.renderTarget?.depthTexture) {
      surfacePass.renderTarget.depthTexture.minFilter = THREE.NearestFilter;
      surfacePass.renderTarget.depthTexture.magFilter = THREE.NearestFilter;
      surfacePass.renderTarget.depthTexture.generateMipmaps = false;
    }

    this._colorPass = colorPass;
    this._solidPass = solidPass;
    this._surfacePass = surfacePass;

    const colorNode = colorPass.getTextureNode('output');
    const normalNode = solidPass.getTextureNode('output');
    const depthNode = solidPass.getTextureNode('depth');
    const surfaceNode = surfacePass.getTextureNode('output');
    const surfaceDepthNode = surfacePass.getTextureNode('depth');

    const uThickness = this._uThickness;
    const uIsOrtho = this._uIsOrtho;
    const uNear = this._uNear;
    const uFar = this._uFar;
    const uDepthThreshold = this._uDepthThreshold;
    const uNormalThreshold = this._uNormalThreshold;
    const uLineColor = this._uLineColor;
    const uLineOpacity = this._uLineOpacity;
    const uFocusDim = this._uFocusDim;
    const uAoStrength = this._uAoStrength;
    const uExposure = this._uExposure;
    const activeToneMapping = this._boundToneMapping;

    const bloomNode =
      this._bloomConfig.enabled && this._bloomAddon
        ? this._bloomAddon(colorNode, this._bloomConfig.strength, this._bloomConfig.radius, this._bloomConfig.threshold)
        : null;
    if (bloomNode && 'updateBeforeType' in bloomNode) {
      bloomNode.updateBeforeType = renderUpdateType;
    }

    const dofNode =
      this._dofConfig.enabled && this._dofAddon && typeof colorPass.getViewZNode === 'function'
        ? this._dofAddon(colorNode, colorPass.getViewZNode(), this._uDofFocus, this._uDofFocalLength, this._uDofBokeh)
        : null;
    if (dofNode && 'updateBeforeType' in dofNode) {
      dofNode.updateBeforeType = renderUpdateType;
    }

    const composite = Fn(() => {
      const texel = vec2(1.0).div(viewportSize);
      const rawCol = colorNode.sample(screenUV);
      const baseRgb = dofNode ? dofNode.rgb : rawCol.rgb;
      const colPreBase = bloomNode ? baseRgb.add(bloomNode.rgb) : baseRgb;
      const n0 = normalNode.sample(screenUV);
      const solidDepthRaw = depthNode.sample(screenUV).r;

      const depthAt = (uvCoord) => {
        const d = depthNode.sample(uvCoord).r;
        const span = uFar.sub(uNear);
        const orthoZ = d.mul(span);
        const perspZ = uNear.mul(uFar).div(max(uFar.sub(d.mul(span)), float(1e-4)));
        return select(uIsOrtho.greaterThan(0.5), orthoZ, perspZ);
      };

      const d0 = depthAt(screenUV);

      // Exact integer physical texel step (1px for DPR 1..2.5) + smooth width AA weight
      const stepPx = clamp(floor(uThickness.mul(0.5).add(0.5)), 1.0, 2.0);
      const bwdWeight = clamp(uThickness.sub(0.8).div(0.85), 0.22, 1.0);
      const o = texel.mul(stepPx);

      const edgePair = (off, weightScale) => {
        const uvA = screenUV.add(off);
        const uvB = screenUV.sub(off);
        const na = normalNode.sample(uvA);
        const nb = normalNode.sample(uvB);
        const da = depthAt(uvA);
        const db = depthAt(uvB);

        // Crisp 1px outer silhouette + width-controlled inner AA pixel
        const outerSil = max(max(float(0.0), na.a.sub(n0.a)), max(float(0.0), nb.a.sub(n0.a)));
        const innerSil = max(max(float(0.0), n0.a.sub(na.a)), max(float(0.0), n0.a.sub(nb.a))).mul(bwdWeight);
        const sil = max(outerSil, innerSil);

        // Second-derivative depth step detection (rejects smooth angled terrain/tiles)
        const lap = abs(da.add(db).sub(d0.mul(2.0)));
        const stepA = select(na.a.greaterThan(0.5), abs(da.sub(d0)), float(0.0));
        const stepB = select(nb.a.greaterThan(0.5), abs(db.sub(d0)), float(0.0));
        const dEdgeA = smoothstep(uDepthThreshold, uDepthThreshold.mul(2.0), min(lap, stepA.mul(2.0)));
        const dEdgeB = smoothstep(uDepthThreshold, uDepthThreshold.mul(2.0), min(lap, stepB.mul(2.0))).mul(bwdWeight);
        const dEdge = max(dEdgeA, dEdgeB);

        // Normal crease detection along mechanical bevels and ridges
        const c = n0.xyz.mul(2.0).sub(1.0);
        const ca = select(na.a.greaterThan(0.5), float(1.0).sub(dot(c, na.xyz.mul(2.0).sub(1.0))), float(0.0));
        const cb = select(nb.a.greaterThan(0.5), float(1.0).sub(dot(c, nb.xyz.mul(2.0).sub(1.0))), float(0.0));
        const nEdgeA = smoothstep(uNormalThreshold, uNormalThreshold.mul(2.1), ca).mul(0.88);
        const nEdgeB = smoothstep(uNormalThreshold, uNormalThreshold.mul(2.1), cb).mul(0.88).mul(bwdWeight);
        const nEdge = max(nEdgeA, nEdgeB);

        const interior = select(n0.a.greaterThan(0.5), max(dEdge, nEdge), float(0.0));
        return max(sil, interior).mul(weightScale);
      };

      // Single crisp ring (no 1.5x wide grey halo!)
      const eRaw = max(
        max(edgePair(vec2(o.x, 0.0), 1.0), edgePair(vec2(0.0, o.y), 1.0)),
        max(edgePair(vec2(o.x, o.y), 0.78), edgePair(vec2(o.x, o.y.negate()), 0.78))
      );
      const e = select(
        uThickness.greaterThan(0.01),
        clamp(eRaw.mul(uLineOpacity), 0.0, 1.0),
        float(0.0)
      );

      // Properly unpremultiply linear HDR colorPass before tone mapping (fixes double-alpha darkening!)
      const a = clamp(rawCol.a, 0.0, 1.0);
      const colLinearStraight = select(a.greaterThan(1e-4), colPreBase.div(a), vec3(0.0));

      // Apply tone mapping ONLY to lit 3D colorPass — ink strokes & HTML surfaces stay crisp and uncrushed
      const colMappedBase =
        activeToneMapping !== THREE.NoToneMapping && typeof tslToneMapping === 'function'
          ? tslToneMapping(activeToneMapping, uExposure, vec4(colLinearStraight, float(1.0))).rgb
          : colLinearStraight;

      // Zero-extra-pass Screen-Space Crease Ambient Occlusion (darkens concave mechanical seams, zero silhouette halo)
      const aoTap = (off) => {
        const uvN = screenUV.add(off);
        const nn = normalNode.sample(uvN);
        const dn = depthAt(uvN);
        const dd = d0.sub(dn);
        const nearMask = smoothstep(0.02, 0.28, dd).mul(float(1.0).sub(smoothstep(0.55, 1.35, dd)));
        const cn = n0.xyz.mul(2.0).sub(1.0);
        const crease = smoothstep(0.04, 0.48, float(1.0).sub(dot(cn, nn.xyz.mul(2.0).sub(1.0))));
        return select(nn.a.greaterThan(0.5), nearMask.mul(crease), float(0.0));
      };
      const aoOff = texel.mul(3.0);
      const aoRaw = aoTap(vec2(aoOff.x, aoOff.y))
        .add(aoTap(vec2(aoOff.x.negate(), aoOff.y)))
        .add(aoTap(vec2(aoOff.x, aoOff.y.negate())))
        .add(aoTap(vec2(aoOff.x.negate(), aoOff.y.negate())));
      const aoFactor = select(
        n0.a.greaterThan(0.5).and(uAoStrength.greaterThan(0.001)),
        float(1.0).sub(clamp(aoRaw.mul(0.25).mul(uAoStrength), 0.0, 0.34)),
        float(1.0)
      );
      const colMapped = colMappedBase.mul(aoFactor);

      // Optional peripheral focus-dimming for progressive temporal beats
      const radial = length(screenUV.sub(0.5).mul(vec2(1.15, 1.0)));
      const dimMask = smoothstep(0.28, 0.78, radial).mul(uFocusDim);
      const luma = dot(colMapped, vec3(0.2126, 0.7152, 0.0722));
      const colFinal = mix(colMapped, vec3(luma).mul(0.78), dimMask.mul(0.55));

      // Premultiplied linear Porter-Duff: crisp ink stroke OVER lit 3D scene
      const inkA = a.add(e.mul(float(1.0).sub(a)));
      const inkPre = colFinal.mul(a).mul(float(1.0).sub(e)).add(uLineColor.mul(e));

      // Composite un-tone-mapped 3D HTML-in-Canvas surfaces with accurate 3D solid depth occlusion
      const surfCol = surfaceNode.sample(screenUV);
      const surfDepthRaw = surfaceDepthNode.sample(screenUV).r;
      const surfOccluded = n0.a.greaterThan(0.5).and(surfDepthRaw.greaterThan(solidDepthRaw.add(1e-4)));
      const sA = select(surfOccluded, float(0.0), clamp(surfCol.a, 0.0, 1.0));
      const sPre = select(surfOccluded, vec3(0.0), surfCol.rgb);

      const outA = sA.add(inkA.mul(float(1.0).sub(sA)));
      const outPreLinear = sPre.add(inkPre.mul(float(1.0).sub(sA)));

      // Unpremultiply -> clamp -> sRGB OETF -> premultiply for WebGPU/WebGL alpha canvas
      const outStraightLinear = select(outA.greaterThan(1e-4), outPreLinear.div(outA), vec3(0.0));
      const outSrgb = sRGBTransferOETF(clamp(outStraightLinear, 0.0, 1.0));
      return vec4(outSrgb.mul(outA), outA);
    });

    this._pipeline = new THREE.RenderPipeline(this.renderer);
    // Disable automatic post-composite RenderOutputNode so tone mapping NEVER crushes ink or HTML surfaces
    this._pipeline.outputColorTransform = false;
    this._pipeline.outputNode = composite();
    this._pipeline.needsUpdate = true;
  }

  _disposeTSLPipeline() {
    if (this._colorPass?.dispose) this._colorPass.dispose();
    if (this._solidPass?.dispose) this._solidPass.dispose();
    if (this._surfacePass?.dispose) this._surfacePass.dispose();
    if (this._pipeline?.dispose) this._pipeline.dispose();
    this._colorPass = null;
    this._solidPass = null;
    this._surfacePass = null;
    this._pipeline = null;
    this._boundScene = null;
    this._boundCamera = null;
    this._boundToneMapping = null;
    this._solidCamera = null;
    this._colorCamera = null;
    this._surfaceCamera = null;
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

  /**
   * Optional async hook to enable TSL Depth-of-Field (DepthOfFieldNode) for macro / cutaway focus.
   */
  async enableDepthOfField({ focusDistance = 16, focalLength = 8, bokehScale = 1.4 } = {}) {
    if (!this.isTSL) return false;
    try {
      const mod = await import('three/addons/tsl/display/DepthOfFieldNode.js');
      this._dofAddon = mod.dof || null;
      this._dofConfig = {
        enabled: Boolean(this._dofAddon),
        focusDistance: Number(focusDistance) || 16,
        focalLength: Number(focalLength) || 8,
        bokehScale: Number(bokehScale) || 1.4,
      };
      this._uDofFocus.value = this._dofConfig.focusDistance;
      this._uDofFocalLength.value = this._dofConfig.focalLength;
      this._uDofBokeh.value = this._dofConfig.bokehScale;
      if (this._boundScene && this._boundCamera) {
        this._buildTSLPipeline(this._boundScene, this._boundCamera);
      }
      return this._dofConfig.enabled;
    } catch {
      return false;
    }
  }

  /** Update Depth-of-Field parameters or toggle it off without reloading modules. */
  setDepthOfField({ enabled, focusDistance, focalLength, bokehScale } = {}) {
    if (!this.isTSL) return false;
    let rebuild = false;
    if (enabled !== undefined && Boolean(enabled) !== this._dofConfig.enabled) {
      this._dofConfig.enabled = Boolean(enabled) && Boolean(this._dofAddon);
      rebuild = true;
    }
    if (focusDistance !== undefined) {
      this._dofConfig.focusDistance = Number(focusDistance);
      this._uDofFocus.value = this._dofConfig.focusDistance;
    }
    if (focalLength !== undefined) {
      this._dofConfig.focalLength = Number(focalLength);
      this._uDofFocalLength.value = this._dofConfig.focalLength;
    }
    if (bokehScale !== undefined) {
      this._dofConfig.bokehScale = Number(bokehScale);
      this._uDofBokeh.value = this._dofConfig.bokehScale;
    }
    if (rebuild && this._boundScene && this._boundCamera) {
      this._buildTSLPipeline(this._boundScene, this._boundCamera);
    }
    return this._dofConfig.enabled;
  }

  /** Control zero-extra-pass screen-space crease ambient occlusion strength (0..1). */
  setAOStrength(strength) {
    this._explicitAO = Math.max(0, Math.min(1, Number(strength) || 0));
    this.aoStrength = this._explicitAO;
    if (this.isTSL) {
      this._uAoStrength.value = this.enabled ? this.aoStrength : 0;
    } else if (this.material?.uniforms?.aoStrength) {
      this.material.uniforms.aoStrength.value = this.enabled ? this.aoStrength : 0;
    }
    return this.aoStrength;
  }

  _initLegacyGLSL(options) {
    const samples = this.renderer.capabilities?.isWebGL2 ? (options.samples ?? 4) : 0;
    this.colorTarget = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples,
      stencilBuffer: true,
    });

    const depthTexture = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;

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
        thickness: { value: this.enabled ? this.thickness : 0 },
        isOrtho: { value: 1.0 },
        cameraNear: { value: 1.0 },
        cameraFar: { value: 240.0 },
        depthThreshold: { value: this.depthThreshold },
        normalThreshold: { value: this.normalThreshold },
        lineColor: { value: this.lineColor.clone() },
        lineOpacity: { value: this.enabled ? this.opacity : 0 },
        focusDim: { value: this.focusDim },
        aoStrength: { value: this.enabled ? this.aoStrength : 0 },
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

  /**
   * Switch outline quality preset at runtime: 'crisp' | 'subtle' | 'none'.
   */
  setPreset(preset) {
    this.preset = resolvePresetName(preset);
    const cfg = OUTLINE_PRESETS[this.preset];
    this.enabled = cfg.enabled;
    this.thickness = this._explicitThickness !== null && cfg.enabled ? this._explicitThickness : cfg.thickness;
    this.opacity = this._baseOpacity * cfg.opacityScale;
    this.depthThreshold = this._explicitDepthThreshold !== null && cfg.enabled ? this._explicitDepthThreshold : cfg.depthThreshold;
    this.normalThreshold = this._explicitNormalThreshold !== null && cfg.enabled ? this._explicitNormalThreshold : cfg.normalThreshold;
    this.aoStrength = this._explicitAO !== null && cfg.enabled ? this._explicitAO : cfg.aoStrength;

    if (this.isTSL) {
      this._uDepthThreshold.value = this.depthThreshold;
      this._uNormalThreshold.value = this.normalThreshold;
      this._uLineOpacity.value = this.enabled ? this.opacity : 0;
      this._uAoStrength.value = this.enabled ? this.aoStrength : 0;
    } else if (this.material) {
      this.material.uniforms.depthThreshold.value = this.depthThreshold;
      this.material.uniforms.normalThreshold.value = this.normalThreshold;
      this.material.uniforms.lineOpacity.value = this.enabled ? this.opacity : 0;
      if (this.material.uniforms.aoStrength) {
        this.material.uniforms.aoStrength.value = this.enabled ? this.aoStrength : 0;
      }
    }
    this.setLineScale(this.lineScale);
    return this.preset;
  }

  setSize(width, height, pixelRatio = 1, physicalWidth = null, physicalHeight = null) {
    const rw = Math.max(2, Math.round(physicalWidth ?? width * pixelRatio));
    const rh = Math.max(2, Math.round(physicalHeight ?? height * pixelRatio));
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
    const px = this.enabled ? this.thickness * this.pixelRatio * scale : 0;
    if (this.isTSL) {
      this._uThickness.value = px;
    } else if (this.material) {
      this.material.uniforms.thickness.value = px;
    }
  }

  setInkColor(color, opacity) {
    this.lineColor.set(color);
    if (opacity !== undefined) {
      this._baseOpacity = opacity;
      this.opacity = opacity * OUTLINE_PRESETS[this.preset].opacityScale;
    }
    if (this.isTSL) {
      this._uLineColor.value.copy(this.lineColor);
      if (opacity !== undefined) this._uLineOpacity.value = this.enabled ? this.opacity : 0;
    } else if (this.material) {
      this.material.uniforms.lineColor.value.copy(this.lineColor);
      if (opacity !== undefined) this.material.uniforms.lineOpacity.value = this.enabled ? this.opacity : 0;
    }
  }

  setFocusDim(strength = 0) {
    this.focusDim = Math.max(0, Math.min(1, Number(strength) || 0));
    if (this.isTSL) {
      this._uFocusDim.value = this.focusDim;
    } else if (this.material) {
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

    // Pass 2: Full lit color including Layer 1 ground shadows/ribbons & Layer 2 surfaces
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
      if (this.renderer && this.renderer._initialized === false && typeof this.renderer.init === 'function') {
        await this.renderer.init();
      }
      this._prepareTSLFrame(scene, camera);
      this._pipeline.render();
      return;
    }
    this.render(scene, camera);
  }

  _prepareTSLFrame(scene, camera) {
    if (
      !this._pipeline ||
      this._boundScene !== scene ||
      this._boundCamera !== camera ||
      this._boundToneMapping !== this.renderer.toneMapping ||
      Boolean(this._solidCamera?.isPerspectiveCamera) !== Boolean(camera?.isPerspectiveCamera)
    ) {
      this._buildTSLPipeline(scene, camera);
    }
    syncCameraProps(camera, this._solidCamera, [SOLID_LAYER]);
    syncCameraProps(camera, this._colorCamera, [SOLID_LAYER, GROUND_LAYER, GLASS_LAYER]);
    syncCameraProps(camera, this._surfaceCamera, [SURFACE_LAYER]);
    this._uIsOrtho.value = camera.isOrthographicCamera ? 1.0 : 0.0;
    this._uNear.value = camera.near;
    this._uFar.value = camera.far;
    this._uExposure.value = this.renderer.toneMappingExposure ?? 1.0;
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
