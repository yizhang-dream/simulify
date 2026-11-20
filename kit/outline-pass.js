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
  uniform float depthRange;
  uniform float depthThreshold;
  uniform float normalThreshold;
  uniform vec3 lineColor;
  uniform float lineOpacity;
  varying vec2 vUv;

  float depthAt(vec2 uv) {
    return texture2D(tDepth, uv).r * depthRange;
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

    // Unpremultiply linear color target, blend ink stroke, convert to sRGB, then premultiply
    vec3 rgb = col.a > 1e-4 ? col.rgb / col.a : vec3(0.0);
    float a = col.a;
    float outA = a + e * (1.0 - a);
    vec3 mixed = (rgb * a * (1.0 - e) + lineColor * e) / max(outA, 1e-4);

    gl_FragColor = vec4(mixed, outA);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

export const SOLID_LAYER = 0;
export const GROUND_LAYER = 1;

/**
 * Post-processing pass that renders Layer 0 normals+depth and overlays crisp
 * technical ink outlines (silhouette + depth steps + normal creases) on top
 * of a multi-sampled color buffer.
 */
export class OutlinePass {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.thickness = options.thickness ?? 1.25;
    this.pixelRatio = 1;
    this.lineScale = 1;

    const samples = renderer.capabilities.isWebGL2 ? (options.samples ?? 4) : 0;
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
        depthRange: { value: 1 },
        depthThreshold: { value: options.depthThreshold ?? 0.32 },
        normalThreshold: { value: options.normalThreshold ?? 0.22 },
        lineColor: { value: new THREE.Color(options.lineColor ?? '#141a2c') },
        lineOpacity: { value: options.opacity ?? 0.92 },
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
    this.colorTarget.setSize(rw, rh);
    this.normalTarget.setSize(rw, rh);
    this.material.uniforms.texel.value.set(1 / rw, 1 / rh);
    this.setLineScale(this.lineScale);
  }

  setLineScale(scale) {
    this.lineScale = scale;
    this.material.uniforms.thickness.value = this.thickness * this.pixelRatio * scale;
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const savedAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._savedClearColor);
    const savedMask = camera.layers.mask;

    this.material.uniforms.depthRange.value = camera.far - camera.near;
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

  dispose() {
    this.colorTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.fsQuad.geometry.dispose();
    this.material.dispose();
  }
}
