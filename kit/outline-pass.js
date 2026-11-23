import * as THREE from 'three';

export const SOLID_LAYER = 0;
export const GROUND_LAYER = 1;
export const SURFACE_LAYER = 2;
export const GLASS_LAYER = 3;

export const OUTLINE_PRESETS = Object.freeze({
  primer: Object.freeze({
    enabled: true,
    thickness: 1.3,
    opacityScale: 1.0,
    depthThreshold: 0.28,
    normalThreshold: 0.42,
    creaseWeight: 0.45,
    outerWeight: 0.42,
    aoStrength: 0.22,
  }),
  crisp: Object.freeze({
    enabled: true,
    thickness: 1.15,
    opacityScale: 1.0,
    depthThreshold: 0.28,
    normalThreshold: 0.28,
    aoStrength: 0.22,
  }),
  subtle: Object.freeze({
    enabled: true,
    thickness: 0.88,
    opacityScale: 0.56,
    depthThreshold: 0.36,
    normalThreshold: 0.36,
    aoStrength: 0.14,
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
  if (preset === 'primer' || preset === 'subtle') return preset;
  return 'crisp';
}

function readInheritedUserData(object, key) {
  let cur = object;
  for (let i = 0; i < 4 && cur; i += 1) {
    if (cur.userData && cur.userData[key] !== undefined) {
      return cur.userData[key];
    }
    cur = cur.parent;
  }
  return undefined;
}

/**
 * Pack per-mesh ink controls into a single HalfFloat channel (exact resolution ~1/256):
 * - base [0..1]: `ink` strength (default 1.0; 0 suppresses strokes while preserving depth occlusion)
 * - +2.0 flag: `inkThin` (scales edge kernel reach by 0.55x for thin wires/rods/stems)
 * - +4.0 flag: `inkNormals === 'none' || inkNormals === false` (silhouette/ID only, suppresses internal normal creases)
 */
function encodeInkMeta(object) {
  const rawInk = readInheritedUserData(object, 'ink');
  const ink = rawInk !== undefined ? Math.max(0, Math.min(1, Number(rawInk) || 0)) : 1.0;
  const thin = Boolean(readInheritedUserData(object, 'inkThin'));
  const rawNormals = readInheritedUserData(object, 'inkNormals');
  const noNormals = rawNormals === 'none' || rawNormals === false;
  return ink + (thin ? 2.0 : 0.0) + (noNormals ? 4.0 : 0.0);
}

const GBUFFER_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPosView;
  void main() {
    vec3 transformedNormal = normal;
    vec4 mvPos = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mvPos = instanceMatrix * mvPos;
      transformedNormal = mat3(instanceMatrix) * transformedNormal;
    #endif
    mvPos = modelViewMatrix * mvPos;
    vPosView = mvPos.xyz;
    vNormalView = normalize(normalMatrix * transformedNormal);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const GBUFFER_FRAGMENT = /* glsl */ `
  #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
  #endif
  uniform float uObjectId;
  uniform float uInkPacked;
  uniform float uFlatFlag;
  varying vec3 vNormalView;
  varying vec3 vPosView;

  void main() {
    vec3 n = normalize(vNormalView);
    if (uFlatFlag > 0.5) {
      vec3 fn = cross(dFdx(vPosView), dFdy(vPosView));
      float len = length(fn);
      if (len > 1e-6) n = fn / len;
    }
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4(n.xy * 0.5 + 0.5, uInkPacked, uObjectId);
  }
`;

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
  uniform float creaseWeight;
  uniform float outerWeight;
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

  vec3 decodeNormal(vec2 rg) {
    vec2 xy = rg * 2.0 - 1.0;
    float z = sqrt(max(0.0, 1.0 - dot(xy, xy)));
    return vec3(xy, z);
  }

  void decodeMeta(float b, out float inkStr, out float isThin, out float noNormals) {
    noNormals = step(3.5, b);
    float b1 = b - noNormals * 4.0;
    isThin = step(1.5, b1);
    inkStr = clamp(b1 - isThin * 2.0, 0.0, 1.0);
  }

  // Evaluate 8-direction circular ring (cos(i*pi/4), sin(i*pi/4)) with nearer-side silhouette ownership
  float sampleRing(vec2 uv, vec2 radius, vec4 n0, float d0, vec3 cNorm, float cInk, float cNoNorm) {
    const float DIAG = 0.70710678;
    vec2 dirs[8];
    dirs[0] = vec2(1.0, 0.0);
    dirs[1] = vec2(-1.0, 0.0);
    dirs[2] = vec2(0.0, 1.0);
    dirs[3] = vec2(0.0, -1.0);
    dirs[4] = vec2(DIAG, DIAG);
    dirs[5] = vec2(-DIAG, DIAG);
    dirs[6] = vec2(DIAG, -DIAG);
    dirs[7] = vec2(-DIAG, -DIAG);

    float cSolid = step(0.5, n0.a);
    float silAccum = 0.0;
    float creaseMax = 0.0;
    float depthMax = 0.0;

    for (int i = 0; i < 8; i++) {
      vec2 nuv = uv + dirs[i] * radius;
      vec4 ns = texture2D(tNormal, nuv);
      float dn = depthAt(nuv);
      float nSolid = step(0.5, ns.a);
      float nInk, nThin, nNoNorm;
      decodeMeta(ns.b, nInk, nThin, nNoNorm);

      if (cSolid > 0.5) {
        // Nearer-side silhouette & inter-part seam ownership (drawn INSIDE the nearer object, zero background bleed)
        float otherObj = step(0.5, abs(ns.a - n0.a));
        float neighborBg = 1.0 - nSolid;
        float centerNearer = step(-0.002, dn - d0);
        if (otherObj > 0.5 && (neighborBg > 0.5 || centerNearer > 0.5)) {
          silAccum += 1.0;
        } else if (nSolid > 0.5 && otherObj < 0.5) {
          // Same-object depth discontinuity (self-occlusion)
          float dd = dn - d0;
          if (dd > 0.0) {
            float dOpp = depthAt(uv - dirs[i] * radius);
            float lap = abs(dn + dOpp - 2.0 * d0);
            float dEdge = smoothstep(depthThreshold, depthThreshold * 2.0, min(lap, dd * 2.0));
            depthMax = max(depthMax, dEdge);
          }
          // Same-object normal crease (respecting userData.inkNormals = 'none')
          if (cNoNorm < 0.5 && nNoNorm < 0.5) {
            vec3 nn = decodeNormal(ns.rg);
            float ndiff = 1.0 - dot(cNorm, nn);
            float nEdge = creaseWeight * smoothstep(normalThreshold, normalThreshold * 2.1, ndiff);
            creaseMax = max(creaseMax, nEdge);
          }
        }
      }
    }

    // Smooth subpixel silhouette coverage across the 8 circular taps
    float silEdge = smoothstep(0.0, 2.2, silAccum);
    float edge = max(silEdge, max(depthMax, creaseMax));
    return edge * cInk;
  }

  void main() {
    vec4 col = texture2D(tColor, vUv);
    vec4 n0 = texture2D(tNormal, vUv);
    float d0 = depthAt(vUv);

    float cInk, cThin, cNoNorm;
    decodeMeta(n0.b, cInk, cThin, cNoNorm);
    vec3 cNorm = decodeNormal(n0.rg);

    float e = 0.0;
    if (thickness > 0.01 && lineOpacity > 0.001) {
      float reachScale = cThin > 0.5 ? 0.55 : 1.0;
      float basePx = clamp(thickness * reachScale, 0.55, 2.8);
      vec2 r1 = texel * basePx;
      vec2 r2 = r1 * 1.5;

      // Primary 8-direction circular ring + soft feathered outer AA ring
      float e1 = sampleRing(vUv, r1, n0, d0, cNorm, cInk, cNoNorm);
      float e2 = sampleRing(vUv, r2, n0, d0, cNorm, cInk, cNoNorm);
      e = clamp(max(e1, e2 * outerWeight) * lineOpacity, 0.0, 1.0);
    }

    // Unpremultiply linear color target, apply zero-extra-pass screen-space crease AO & focus vignette
    float a = clamp(col.a, 0.0, 1.0);
    vec3 rgb = a > 1e-4 ? col.rgb / a : vec3(0.0);
    if (aoStrength > 0.001 && n0.a > 0.5) {
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
          float crease = smoothstep(0.04, 0.48, 1.0 - dot(cNorm, decodeNormal(nn.rg)));
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
 * Dual-backend Next-Gen Primer technical ink outline pass (Simulify v3.1):
 * - Object-ID + per-mesh metadata packing (`userData.ink` 0..1, `userData.inkThin`,
 *   `userData.inkNormals = 'none'`, `userData.inkFlat`, `userData.inkGroupId`) in HalfFloat RGBA
 * - 8-direction circular kernel (`cos(i*pi/4), sin(i*pi/4)`) with nearer-side silhouette
 *   ownership (crisp internal seams between touching parts, zero outward background bleed)
 * - Soft feathered 2nd AA ring (`1.5x` @ `0.35`) preserving 4x MSAA visual crispness
 * - Separated tone-mapping (`outputColorTransform = false`): tone mapping runs ONLY on
 *   lit 3D colorPass (`SOLID_LAYER + GROUND_LAYER + GLASS_LAYER`), never crushing ink strokes
 *   or `SURFACE_LAYER` (HTML-in-Canvas 3D panels)
 * - Full parity across Three.js r187 WebGPURenderer (TSL) and legacy WebGLRenderer (GLSL).
 */
export class OutlinePass {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.preset = resolvePresetName(options.preset);
    const presetCfg = OUTLINE_PRESETS[this.preset];

    this.enabled = presetCfg.enabled;
    this._baseOpacity = options.opacity ?? 0.84;
    this._explicitThickness = options.thickness !== undefined ? options.thickness : null;
    this._explicitDepthThreshold = options.depthThreshold !== undefined ? options.depthThreshold : null;
    this._explicitNormalThreshold = options.normalThreshold !== undefined ? options.normalThreshold : null;

    this.thickness = this._explicitThickness ?? presetCfg.thickness;
    this.pixelRatio = 1;
    this.lineScale = 1;
    this.opacity = this._baseOpacity * presetCfg.opacityScale;
    this.depthThreshold = this._explicitDepthThreshold ?? presetCfg.depthThreshold;
    this.normalThreshold = this._explicitNormalThreshold ?? presetCfg.normalThreshold;
    this.creaseWeight = presetCfg.creaseWeight ?? 0.86;
    this.outerWeight = presetCfg.outerWeight ?? 0.35;
    this.lineColor = new THREE.Color(options.lineColor ?? '#1f160f');
    this.focusDim = options.focusDim ?? 0;
    this._explicitAO = options.aoStrength !== undefined ? Number(options.aoStrength) : null;
    this.aoStrength = this._explicitAO !== null ? this._explicitAO : presetCfg.aoStrength;

    // Frame-stable object-ID registry (exact integers 1..2040 in HalfFloat)
    this._objectIdMap = new WeakMap();
    this._groupIdMap = new Map();
    this._nextObjectId = 1;

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

  _resolveObjectId(object) {
    if (!object) return 1;
    const groupKey = readInheritedUserData(object, 'inkGroupId');
    if (groupKey !== undefined && groupKey !== null) {
      let gid = this._groupIdMap.get(groupKey);
      if (gid === undefined) {
        gid = this._nextObjectId;
        this._nextObjectId = this._nextObjectId >= 2040 ? 1 : this._nextObjectId + 1;
        this._groupIdMap.set(groupKey, gid);
      }
      return gid;
    }
    let id = this._objectIdMap.get(object);
    if (id === undefined) {
      id = this._nextObjectId;
      this._nextObjectId = this._nextObjectId >= 2040 ? 1 : this._nextObjectId + 1;
      this._objectIdMap.set(object, id);
    }
    return id;
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
    this._uCreaseWeight = TSL.uniform(this.creaseWeight);
    this._uOuterWeight = TSL.uniform(this.outerWeight);
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
      normalFlat,
      uniform,
      Fn,
      vec2,
      vec3,
      vec4,
      float,
      screenUV,
      viewportSize,
      smoothstep,
      step,
      sqrt,
      abs,
      dot,
      max,
      min,
      clamp,
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
    // not once per browser rAF (NodeUpdateType.FRAME), so deterministic seeks never composite stale passes.
    const renderUpdateType = THREE.NodeUpdateType?.RENDER ?? 'render';

    // 1. Lit 3D scene pass (SOLID_LAYER + GROUND_LAYER + GLASS_LAYER, inherits 4x MSAA + stencil for cutaway caps)
    const colorPass = pass(scene, this._colorCamera, {
      stencilBuffer: true,
    });
    colorPass.updateBeforeType = renderUpdateType;

    // 2. Non-MSAA nearest-filtered G-buffer pass (SOLID_LAYER only) packing:
    //    R,G = view-space normal.xy * 0.5 + 0.5 (supports userData.inkFlat via normalFlat)
    //    B   = inkStrength [0..1] + (inkThin ? 2 : 0) + (inkNormals==='none' ? 4 : 0)
    //    A   = per-object integer ID [1..2040] (0 on background)
    const solidPass = pass(scene, this._solidCamera, {
      samples: 0,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    solidPass.updateBeforeType = renderUpdateType;

    const uObjId = uniform(1.0).onObjectUpdate(({ object }) => this._resolveObjectId(object));
    const uInkPacked = uniform(1.0).onObjectUpdate(({ object }) => encodeInkMeta(object));
    const uFlatFlag = uniform(0.0).onObjectUpdate(({ object }) =>
      readInheritedUserData(object, 'inkFlat') ? 1.0 : 0.0
    );
    const activeNormal = normalFlat
      ? select(uFlatFlag.greaterThan(0.5), normalFlat, normalView)
      : normalView;

    solidPass.setMRT(
      mrt({
        output: vec4(activeNormal.xy.mul(0.5).add(0.5), uInkPacked, uObjId),
      })
    );
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
    const uCreaseWeight = this._uCreaseWeight;
    const uOuterWeight = this._uOuterWeight;
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

    const DIAG = 0.70710678;
    const CIRCULAR_DIRS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [DIAG, DIAG],
      [-DIAG, DIAG],
      [DIAG, -DIAG],
      [-DIAG, -DIAG],
    ];

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

      const decodeNormal = (rg) => {
        const xy = rg.mul(2.0).sub(1.0);
        const z = sqrt(max(float(0.0), float(1.0).sub(dot(xy, xy))));
        return vec3(xy.x, xy.y, z);
      };

      const decodeMeta = (bVal) => {
        const noNormals = step(float(3.5), bVal);
        const b1 = bVal.sub(noNormals.mul(4.0));
        const isThin = step(float(1.5), b1);
        const inkStr = clamp(b1.sub(isThin.mul(2.0)), 0.0, 1.0);
        return { inkStr, isThin, noNormals };
      };

      const d0 = depthAt(screenUV);
      const cMeta = decodeMeta(n0.b);
      const cNorm = decodeNormal(n0.rg);
      const cSolid = n0.a.greaterThan(0.5);

      // 8-direction circular kernel with nearer-side silhouette/ID ownership + smooth coverage
      const sampleRing = (radius) => {
        let silAccum = float(0.0);
        let depthMax = float(0.0);
        let creaseMax = float(0.0);

        for (let i = 0; i < CIRCULAR_DIRS.length; i += 1) {
          const [dx, dy] = CIRCULAR_DIRS[i];
          const off = vec2(radius.x.mul(dx), radius.y.mul(dy));
          const nuv = screenUV.add(off);
          const ns = normalNode.sample(nuv);
          const dn = depthAt(nuv);
          const nSolid = ns.a.greaterThan(0.5);
          const nMeta = decodeMeta(ns.b);
          const otherObj = abs(ns.a.sub(n0.a)).greaterThan(0.5);

          // Nearer-side silhouette & touching-part seam ownership (zero outward bleed)
          const centerNearer = dn.sub(d0).greaterThanEqual(-0.002);
          const silHit = select(
            cSolid.and(otherObj).and(nSolid.not().or(centerNearer)),
            float(1.0),
            float(0.0)
          );
          silAccum = silAccum.add(silHit);

          // Same-object depth discontinuity (second-derivative Laplacian rejects smooth slopes)
          const sameSolid = cSolid.and(nSolid).and(otherObj.not());
          const dd = max(float(0.0), dn.sub(d0));
          const dOpp = depthAt(screenUV.sub(off));
          const lap = abs(dn.add(dOpp).sub(d0.mul(2.0)));
          const dEdge = select(
            sameSolid.and(dd.greaterThan(0.0)),
            smoothstep(uDepthThreshold, uDepthThreshold.mul(2.0), min(lap, dd.mul(2.0))),
            float(0.0)
          );
          depthMax = max(depthMax, dEdge);

          // Same-object normal crease (respecting userData.inkNormals = 'none')
          const allowNormals = sameSolid
            .and(cMeta.noNormals.lessThan(0.5))
            .and(nMeta.noNormals.lessThan(0.5));
          const nn = decodeNormal(ns.rg);
          const ndiff = float(1.0).sub(dot(cNorm, nn));
          const nEdge = select(
            allowNormals,
            smoothstep(uNormalThreshold, uNormalThreshold.mul(2.1), ndiff).mul(uCreaseWeight),
            float(0.0)
          );
          creaseMax = max(creaseMax, nEdge);
        }

        const silEdge = smoothstep(float(0.0), float(2.2), silAccum);
        return max(silEdge, max(depthMax, creaseMax)).mul(cMeta.inkStr);
      };

      const reachScale = select(cMeta.isThin.greaterThan(0.5), float(0.55), float(1.0));
      const basePx = clamp(uThickness.mul(reachScale), 0.55, 2.8);
      const r1 = texel.mul(basePx);
      const r2 = r1.mul(1.5);

      // Primary circular ring + soft feathered outer AA ring
      const e1 = sampleRing(r1);
      const e2 = sampleRing(r2);
      const eRaw = max(e1, e2.mul(uOuterWeight));
      const e = select(
        uThickness.greaterThan(0.01),
        clamp(eRaw.mul(uLineOpacity), 0.0, 1.0),
        float(0.0)
      );

      // Properly unpremultiply linear HDR colorPass before tone mapping
      const a = clamp(rawCol.a, 0.0, 1.0);
      const colLinearStraight = select(a.greaterThan(1e-4), colPreBase.div(a), vec3(0.0));

      // Apply tone mapping ONLY to lit 3D colorPass — ink strokes & HTML surfaces stay crisp and uncrushed
      const colMappedBase =
        activeToneMapping !== THREE.NoToneMapping && typeof tslToneMapping === 'function'
          ? tslToneMapping(activeToneMapping, uExposure, vec4(colLinearStraight, float(1.0))).rgb
          : colLinearStraight;

      // Zero-extra-pass Screen-Space Crease Ambient Occlusion (darkens concave mechanical seams)
      const aoTap = (off) => {
        const uvN = screenUV.add(off);
        const nn = normalNode.sample(uvN);
        const dn = depthAt(uvN);
        const dd = d0.sub(dn);
        const nearMask = smoothstep(0.02, 0.28, dd).mul(float(1.0).sub(smoothstep(0.55, 1.35, dd)));
        const crease = smoothstep(0.04, 0.48, float(1.0).sub(dot(cNorm, decodeNormal(nn.rg))));
        return select(nn.a.greaterThan(0.5), nearMask.mul(crease), float(0.0));
      };
      const aoOff = texel.mul(3.0);
      const aoRaw = aoTap(vec2(aoOff.x, aoOff.y))
        .add(aoTap(vec2(aoOff.x.negate(), aoOff.y)))
        .add(aoTap(vec2(aoOff.x, aoOff.y.negate())))
        .add(aoTap(vec2(aoOff.x.negate(), aoOff.y.negate())));
      const aoFactor = select(
        cSolid.and(uAoStrength.greaterThan(0.001)),
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
      const surfOccluded = cSolid.and(surfDepthRaw.greaterThan(solidDepthRaw.add(1e-4)));
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

    const self = this;
    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: GBUFFER_VERTEX,
      fragmentShader: GBUFFER_FRAGMENT,
      uniforms: {
        uObjectId: { value: 1.0 },
        uInkPacked: { value: 1.0 },
        uFlatFlag: { value: 0.0 },
      },
      side: THREE.FrontSide,
      extensions: { derivatives: true },
    });
    this.normalMaterial.onBeforeRender = function onBeforeRender(_renderer, _scene, _camera, _geo, object) {
      this.uniforms.uObjectId.value = self._resolveObjectId(object);
      this.uniforms.uInkPacked.value = encodeInkMeta(object);
      this.uniforms.uFlatFlag.value = readInheritedUserData(object, 'inkFlat') ? 1.0 : 0.0;
      this.uniformsNeedUpdate = true;
    };

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
        creaseWeight: { value: this.creaseWeight },
        outerWeight: { value: this.outerWeight },
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
   * Switch outline quality preset at runtime: 'primer' | 'crisp' | 'subtle' | 'none'.
   */
  setPreset(preset) {
    this.preset = resolvePresetName(preset);
    const cfg = OUTLINE_PRESETS[this.preset];
    this.enabled = cfg.enabled;
    this.thickness = this._explicitThickness !== null && cfg.enabled ? this._explicitThickness : cfg.thickness;
    this.opacity = this._baseOpacity * cfg.opacityScale;
    this.depthThreshold = this._explicitDepthThreshold !== null && cfg.enabled ? this._explicitDepthThreshold : cfg.depthThreshold;
    this.normalThreshold = this._explicitNormalThreshold !== null && cfg.enabled ? this._explicitNormalThreshold : cfg.normalThreshold;
    this.creaseWeight = cfg.creaseWeight ?? 0.86;
    this.outerWeight = cfg.outerWeight ?? 0.35;
    this.aoStrength = this._explicitAO !== null && cfg.enabled ? this._explicitAO : cfg.aoStrength;

    if (this.isTSL) {
      this._uDepthThreshold.value = this.depthThreshold;
      this._uNormalThreshold.value = this.normalThreshold;
      this._uCreaseWeight.value = this.creaseWeight;
      this._uOuterWeight.value = this.outerWeight;
      this._uLineOpacity.value = this.enabled ? this.opacity : 0;
      this._uAoStrength.value = this.enabled ? this.aoStrength : 0;
    } else if (this.material) {
      this.material.uniforms.depthThreshold.value = this.depthThreshold;
      this.material.uniforms.normalThreshold.value = this.normalThreshold;
      this.material.uniforms.creaseWeight.value = this.creaseWeight;
      this.material.uniforms.outerWeight.value = this.outerWeight;
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
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
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

    // Pass 1: Object-ID + Normals + Ink metadata + Depth of Layer 0 solid objects only
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
    if (!this.enabled) {
      if (this.renderer && this.renderer._initialized === false && typeof this.renderer.init === 'function') {
        await this.renderer.init();
      }
      this.renderer.render(scene, camera);
      return;
    }
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
