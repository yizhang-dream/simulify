// Simulify kit public API. Include this file in tsconfig or via a triple-slash reference.
// Declarations match path-based JS imports. Three.js types are supplied by @types/three.

declare module "*/agency-loop.js" {
  export class AliveLoop {
    constructor({ onTick, speed, onStateChange, autoStart }?: {
      speed?: number;
      onStateChange?: any;
      autoStart?: boolean;
    });
    onTick: any;
    speed: number;
    onStateChange: any;
    reducedMotion: boolean;
    isRunning(): boolean;
    hasUserIntervened(): boolean;
    setSpeed(speed: any): void;
    start(): void;
    pause(): void;
    toggle(): boolean;
    onUserIntervene({ pause }?: {
      pause?: boolean;
    }): void;
    dispose(): void;
  }
  export class IntroDemo {
    constructor({ sequence, stepMs, onStep, onDone, onYield }?: {
      sequence?: any[];
      stepMs?: number;
      onDone?: any;
      onYield?: any;
    });
    sequence: any[];
    stepMs: number;
    onStep: any;
    onDone: any;
    onYield: any;
    reducedMotion: boolean;
    isPlaying(): boolean;
    setSequence(sequence: any): void;
    start({ speed }?: {
      speed?: number;
    }): void;
    replay(opts?: {}): void;
    yieldToUser(): void;
    stop(): void;
  }
}

declare module "*/callout-layer.js" {
  export function resolveCalloutRects(rects: Array<{
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>, bounds: {
    padX: number;
    padTop: number;
    padBottom: number;
    width: number;
    height: number;
  }, blockers?: Array<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>): {
    id: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[];
  export class CalloutLayer {
    constructor(stage: any, svgEl: any, tagsEl: any, { style, quietMode, linkBus, compactBreakpoint, compactMode }?: {
      style?: string;
      quietMode?: boolean;
      linkBus?: any;
      compactBreakpoint?: number;
      compactMode?: "bar" | "scale";
    });
    stage: any;
    svg: any;
    tagsEl: any;
    defaultStyle: string;
    quietMode: boolean;
    linkBus: any;
    compactBreakpoint: number;
    compactMode: "bar" | "scale";
    items: Map<any, any>;
    enabled: boolean;
    currentStep: number;
    setStyle(style?: string): void;
    setQuietMode(enabled: any): void;
    setLinkBus(linkBus: any): void;
    setChoreographer(choreographer: any): void;
    setEnabled(enabled: any): void;
    setCurrentStep(stepIndex: number): void;
    setBlockers(fn: null | (() => Array<{
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>)): void;
    setItems(defs: any): void;
    updateItem(id: any, patch?: {}): void;
    clear(): void;
    getExportSnapshot(): {
      width: any;
      height: any;
      items: any[];
    } | {
      width: number;
      height: number;
      items: any[];
    };
    update(): void;
    #private;
  }
}

declare module "*/chart-card.js" {
  export class ChartCard {
    constructor(rootEl: any, { title, mode, collapsed, onScrub }?: {
      title?: string;
      mode?: string;
      collapsed?: boolean;
      onScrub?: any;
    });
    root: any;
    mode: string;
    collapsed: boolean;
    titleEl: any;
    badgeEl: any;
    foldBtn: any;
    bodyEl: any;
    setOnScrub(fn: any): void;
    setVisible(visible: any): void;
    setHeader(title: any, badge?: string): void;
    setCollapsed(collapsed: any): void;
    updateCompare({ badge, rows }: {
      badge?: string;
      rows?: any[];
    }): void;
    updateHysteresis({ badge, xMin, xMax, thresholds, points, current, onLabel, offLabel, unit, ariaLabel, }?: {
      badge?: string;
      xMin?: number;
      xMax?: number;
      thresholds?: number[];
      points?: any[];
      current?: {
        x: number;
        y: number;
      };
      onLabel?: string;
      offLabel?: string;
      unit?: string;
      ariaLabel?: string;
    }): void;
    updateXY({ badge, xMin, xMax, yMin, yMax, xLabel, yLabel, series, ghost, ghosts, marks, dot, scrubX, onScrub, movingAverageWindow, rawOpacity, ariaLabel, }?: {
      badge?: string;
      xMin?: number;
      xMax?: number;
      yMin?: number;
      yMax?: number;
      xLabel?: string;
      yLabel?: string;
      series?: any[];
      ghost?: any;
      ghosts?: any;
      marks?: any[];
      dot?: any;
      scrubX?: any;
      onScrub?: any;
      movingAverageWindow?: number;
      rawOpacity?: number;
      ariaLabel?: string;
    }): void;
    updateDistribution({ badge, xMin, xMax, yMax, bins, curve, shadeRange, markers, xLabel, tone, ariaLabel, }?: {
      badge?: string;
      xMin?: number;
      xMax?: number;
      yMax?: any;
      bins?: any[];
      curve?: any[];
      shadeRange?: any;
      markers?: any[];
      xLabel?: string;
      tone?: string;
      ariaLabel?: string;
    }): void;
    updateHeatmap({ badge, matrix, rowLabels, colLabels, min, max, colormap, activeCell, showValues, onCellClick, ariaLabel, }?: {
      badge?: string;
      matrix?: any[];
      rowLabels?: any[];
      colLabels?: any[];
      min?: any;
      max?: any;
      colormap?: string;
      activeCell?: any;
      showValues?: boolean;
      onCellClick?: any;
      ariaLabel?: string;
    }): void;
    updateTiming({ badge, channels, tMin, tMax, cursorT, onScrub, ariaLabel, }?: {
      badge?: string;
      channels?: any[];
      tMin?: number;
      tMax?: number;
      cursorT?: any;
      onScrub?: any;
      ariaLabel?: string;
    }): void;
    updateSparkKpi({ badge, value, unit, delta, points, tone, }?: {
      badge?: string;
      value?: string;
      unit?: string;
      delta?: string;
      points?: any[];
      tone?: string;
    }): void;
  }
}

declare module "*/choreography.js" {
  export interface ExplodePartSpec {
    object: any;
    restPos: [number, number, number];
    offset: [number, number, number];
    stage: number;
  }
  export function collectExplodeParts(root: any): ExplodePartSpec[];
  export function applyExplodeFactor(partsOrRoot: any, factor: number, opts?: {
    stageStagger?: number;
    ease?: ((u: number) => number) | null;
  }): ExplodePartSpec[];
  export class ActorChoreographer {
    constructor({ initialCamera, defaultFocusMode }?: {
      initialCamera?: any;
      defaultFocusMode?: any;
    });
    actors: Map<any, any>;
    register(id: string, target: any, opts?: {
      kind?: "3d" | "hud" | "surface";
      restPos?: number[] | {
        x: number;
        y: number;
        z: number;
      };
      restScale?: number | number[] | {
        x: number;
        y: number;
        z: number;
      };
      enterFrom?: number[];
      initiallyVisible?: boolean;
      countInSparsity?: boolean;
      onApply?: (state: any, target: any, t: number) => void;
    }): this;
    unregister(id: any): this;
    enter(id: any, t0: any, dur?: number, style?: string, opts?: {}): this;
    exit(id: any, t0: any, dur?: number, style?: string, opts?: {}): this;
    hudReveal(id: any, t0: any, dur?: number, opts?: {}): this;
    focus(activeIds: any, t0: any, dur?: number, { mode, dimOpacity, holdUntil, releaseDur, ease, muteColor }?: {
      holdUntil?: number;
      releaseDur?: number;
      ease?: (u: any) => number;
      muteColor?: any;
    }): this;
    explodeGroup(id: any, partsOrRoot: any, t0: any, dur?: number, { ease, from, to, holdUntil, collapseDur, stageStagger }?: {
      ease?: (u: any) => number;
      from?: number;
      to?: number;
      holdUntil?: number;
      collapseDur?: number;
      stageStagger?: number;
    }): this;
    clipSweep(id: any, planeOrCap: any, t0: any, dur?: number, { from, to, ease }?: {
      from?: number;
      to?: number;
      ease?: (u: any) => number;
    }): this;
    cameraBeat(t0: number, dur?: number, pose?: {
      azimuth?: number;
      elevation?: number;
      distance?: number;
      target?: number[];
      zoom?: number;
      fov?: number;
    }, ease?: (u: number) => number): this;
    calloutReveal(calloutId: any, t0: any, dur?: number, { exitAt, exitDur }?: {
      exitAt?: number;
      exitDur?: number;
    }): this;
    getCalloutOpacity(calloutId: any, t?: number): number;
    getCameraPoseAt(t?: number): any;
    getActiveActorCount(t?: number): number;
    getCastLedger(): {
      id: any;
      kind: any;
      initiallyVisible: any;
      enterAt: any;
      enterStyle: any;
      exitAt: any;
    }[];
    evaluate(t: any, { apply, stage, forceCamera }?: {
      apply?: boolean;
      stage?: any;
      forceCamera?: boolean;
    }): {
      t: number;
      visibleActors: any[];
      visibleCount: number;
      visible3dCount: number;
      visibleHudCount: number;
      cameraPose: any;
      activeFocus: any[];
      actorStates: {};
    };
    #private;
  }
}

declare module "*/field-viz.js" {
  export function sampleColormap(name?: keyof typeof COLORMAPS, u?: number, outColor?: THREE.Color): THREE.Color;
  export function colormapCssGradient(name?: string, direction?: string): string;
  export function renderColorbar(containerEl: any, { colormap, min, max, mid, label, unit }?: {
    colormap?: string;
    min?: number;
    max?: number;
    mid?: any;
    label?: string;
    unit?: string;
  }): HTMLDivElement;
  export function createFlowConduit(points: any, { radius, baseColor, pulseColor, pulses, chevrons, emissiveIntensity, tubularSegments, radialSegments, capEnds, layer, name, }?: {
    radius?: number;
    baseColor?: string;
    pulseColor?: string;
    pulses?: number;
    chevrons?: boolean;
    emissiveIntensity?: number;
    tubularSegments?: number;
    radialSegments?: number;
    capEnds?: boolean;
    layer?: number;
    name?: string;
  }): any;
  export function createVectorField(count: number, { colormap, scale, minLength, maxLength, layer, name, }?: {
    colormap?: keyof typeof COLORMAPS;
    scale?: number;
    minLength?: number;
    maxLength?: number;
    layer?: number;
    name?: string;
  }): THREE.InstancedMesh<THREE.LatheGeometry, THREE.MeshStandardMaterial, THREE.Object3DEventMap>;
  export function createDeterministicSwarm(count: any, { shape, radius, color, emissive, emissiveIntensity, layer, name, }?: {
    shape?: string;
    radius?: number;
    color?: number;
    emissive?: number;
    emissiveIntensity?: number;
    layer?: number;
    name?: string;
  }): THREE.InstancedMesh<THREE.OctahedronGeometry | THREE.CapsuleGeometry | THREE.IcosahedronGeometry, THREE.MeshStandardMaterial, THREE.Object3DEventMap>;
  export function createMotionTrail(maxPoints?: number, { width, color, tailColor, opacity, strobeCount, strobeRadius, layer, name, }?: {
    width?: number;
    color?: string;
    tailColor?: string;
    opacity?: number;
    strobeCount?: number;
    strobeRadius?: number;
    layer?: number;
    name?: string;
  }): THREE.Group<THREE.Object3DEventMap>;
  export function createDimensionMeasure(pA?: number[], pB?: number[], { offset, label, color, tickSize, layer }?: {
    offset?: number[];
    label?: string;
    color?: string;
    tickSize?: number;
    layer?: number;
  }): THREE.Group<THREE.Object3DEventMap>;
  export function createForceArrow(origin?: number[], vec?: number[], { color, radius, label, layer }?: {
    color?: string;
    radius?: number;
    label?: string;
    layer?: number;
  }): THREE.Group<THREE.Object3DEventMap>;
  export function createAngleArc(center?: number[], dirA?: number[], dirB?: number[], { radius, color, opacity, segments, label }?: {
    radius?: number;
    color?: string;
    opacity?: number;
    segments?: number;
    label?: string;
  }): THREE.Group<THREE.Object3DEventMap>;
  export function createPhysicalFieldMaterial(opts?: {
    map?: THREE.Texture | null;
    color?: THREE.ColorRepresentation;
    vertexColors?: boolean;
    roughness?: number;
    metalness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    specularIntensity?: number;
    side?: THREE.Side;
    analyticalGrid?: boolean;
    gridDivisions?: number;
    gridLineWidth?: number;
    gridColor?: THREE.ColorRepresentation;
    gridOpacity?: number;
    analyticalContours?: boolean;
    contourFreq?: number;
    contourLineWidth?: number;
    contourColor?: THREE.ColorRepresentation;
    contourOpacity?: number;
  }): THREE.MeshPhysicalMaterial;
  export function createContourField({ width, depth, segsX, segsZ, heightFn, scalarFn, min, max, levels, colormap, textureSize, skirt, skirtBottom, skirtColor, analyticalGrid, gridDivisions, gridOpacity, analyticalContours, contourFreq, name, }?: {
    width?: number;
    depth?: number;
    segsX?: number;
    segsZ?: number;
    heightFn?: (u: any, v: any) => number;
    scalarFn?: any;
    min?: number;
    max?: number;
    levels?: number;
    colormap?: string;
    textureSize?: number;
    skirt?: boolean;
    skirtBottom?: number;
    skirtColor?: any;
    analyticalGrid?: boolean;
    gridDivisions?: number;
    gridOpacity?: number;
    analyticalContours?: boolean;
    contourFreq?: number;
    name?: string;
  }): THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, any, THREE.Object3DEventMap>;
  export const COLORMAPS: Readonly<{
    viridis: number[][];
    magma: number[][];
    coolwarm: number[][];
    thermal: number[][];
    cividis: number[][];
    spectral: number[][];
  }>;
  import * as THREE from 'three';
}

declare module "*/fonts.js" {
  export function getFontStack(role?: "display" | "sans" | "math" | "mathItalic" | "mono"): string;
  export function canvasFont(role?: "display" | "sans" | "math" | "mathItalic" | "mono", px?: number | string, weight?: number | string, style?: "normal" | "italic" | "oblique"): string;
  export function waitForFonts(timeoutMs?: number, onReady?: (result: {
    loaded: boolean;
    timedOut: boolean;
    status: string;
  }) => void): Promise<{
    loaded: boolean;
    timedOut: boolean;
    status: string;
  }>;
  export function onFontsReady(callback: (result: {
    loaded: boolean;
    timedOut: boolean;
    status: string;
  }) => void, timeoutMs?: number): () => void;
  export function areFontsReady(): boolean;
  export function createCrispCanvasTexture(THREE: typeof import("three"), { width, height, draw, anisotropy, srgb, mipmaps, flipY, onRedraw, fontTimeoutMs, }?: {
    width?: number;
    height?: number;
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number, meta: {
      canvas: HTMLCanvasElement;
      texture: import("three").CanvasTexture;
      canvasFont: typeof canvasFont;
      fontsReady: boolean;
      state?: any;
    }) => void;
    anisotropy?: number;
    srgb?: boolean;
    mipmaps?: boolean;
    flipY?: boolean;
    onRedraw?: ((texture: import("three").CanvasTexture) => void) | null;
    fontTimeoutMs?: number;
  }): import("three").CanvasTexture<HTMLCanvasElement | {
    width: number;
    height: number;
    getContext: () => any;
  }>;
  export const FONT_STACKS: Readonly<{
    display: "\"Newsreader\", \"Simulify Serif SC\", \"Simulify Display SC\", \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\", \"STSong\", Georgia, serif";
    serif: "\"Newsreader\", \"Simulify Serif SC\", \"Simulify Display SC\", \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\", \"STSong\", Georgia, serif";
    prose: "\"Newsreader\", \"Simulify Serif SC\", \"Simulify Display SC\", \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\", \"STSong\", Georgia, serif";
    sans: "\"Inter\", \"Simulify Sans SC\", \"HarmonyOS Sans SC\", \"MiSans\", \"Source Han Sans SC\", \"Noto Sans SC\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei UI\", sans-serif";
    math: "\"KaTeX_Main\", \"KaTeX_Size1\", \"KaTeX_Math\", \"Inter\", \"Simulify Sans SC\", \"Cambria Math\", \"STIX Two Math\", serif";
    mathItalic: "\"KaTeX_Math\", \"KaTeX_Main\", \"Inter\", \"Simulify Sans SC\", serif";
    mono: "\"JetBrains Mono\", \"Simulify Sans SC\", \"HarmonyOS Sans SC\", \"MiSans\", \"Source Han Sans SC\", \"Noto Sans SC\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei UI\", ui-monospace, monospace";
  }>;
}

declare module "*/geo-sculpt.js" {
  export function createProceduralSurfaceMaps(kind?: "brushed" | "satin-brushed" | "grain" | "anodized" | "hatch45" | "grid-pcb", { size, seed, anisotropy, repeat }?: {
    size?: number;
    seed?: number;
    anisotropy?: number;
    repeat?: [number, number];
  }): THREE.DataTexture;
  export function createSculptMaterial(preset?: "ceramic" | "clay" | "travertine" | "obsidian" | "rubber" | "enamel" | "painted" | "brass" | "anodized" | "copper" | "steel" | "satinSteel" | "satinBrass" | "castIron" | "glass" | "frostedGlass" | "ember", overrides?: Record<string, any>): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  export function createXRayMaterial({ color, rimColor, opacity, emissiveIntensity, doubleSide, }?: {
    color?: string | number;
    rimColor?: string | number;
    opacity?: number;
    emissiveIntensity?: number;
    doubleSide?: boolean;
  }): THREE.MeshPhysicalMaterial;
  export function filletProfile(profile: Array<[number, number] | THREE.Vector2>, setback: number, segments?: number): THREE.Vector2[];
  export function createLathedSolid(profile: Array<[
    number,
    number
  ] | THREE.Vector2>, opts?: { profileFillet?: number; profileFilletSegments?: number } & Record<string, any>): any;
  export function createGlassVessel(opts?: {
    style?: "ampoule" | "flask" | "dome" | "lens";
    radius?: number;
    height?: number;
    wallThickness?: number;
    segments?: number;
    collar?: boolean;
    collarPreset?: string;
    fillLevel?: number | null;
    fillColor?: number | string;
    preset?: string;
    meshOnly?: boolean;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createSculptedProbe(opts?: {
    radius?: number;
    height?: number;
    tone?: string | number;
    bodyPreset?: string;
    trimPreset?: string;
    vane?: boolean;
    segments?: number;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createBeaconLighthouse(opts?: {
    radius?: number;
    height?: number;
    fresnelRings?: number;
    color?: number | string;
    basePreset?: string;
    trimPreset?: string;
    glassPreset?: string;
    segments?: number;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createBevelledProfile(shapeOrPts: THREE.Shape | Array<[
    number,
    number
  ] | THREE.Vector2>, opts?: {
    holes?: Array<THREE.Path | Array<[
      number,
      number
    ] | THREE.Vector2>>;
    depth?: number;
    bevelEnabled?: boolean;
    bevelThickness?: number;
    bevelSize?: number;
    bevelSegments?: number;
    curveSegments?: number;
    center?: boolean;
    orient?: "xy" | "xz";
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createGearWheel(opts?: {
    teeth?: number;
    pitchRadius?: number;
    toothDepth?: number;
    pressureAngleDeg?: number;
    thickness?: number;
    boreRadius?: number;
    spokes?: number;
    bevel?: number;
    bevelSize?: number;
    bevelSegments?: number;
    curveSegments?: number;
    toothFillet?: number;
    hub?: boolean;
    orient?: "xy" | "xz";
    preset?: string;
    hubPreset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createHorseshoeYoke(opts?: {
    outerRadius?: number;
    innerRadius?: number;
    legLength?: number;
    thickness?: number;
    bevel?: number;
    poleTips?: boolean;
    northColor?: number | string;
    southColor?: number | string;
    orient?: "xy" | "xz";
    curveSegments?: number;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createArchSpan(opts?: {
    span?: number;
    rise?: number;
    archThickness?: number;
    deckThickness?: number;
    depth?: number;
    bevel?: number;
    archStyle?: "parabolic" | "circular" | "pointed";
    spandrelCutouts?: boolean;
    segments?: number;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createAirfoilVane(opts?: {
    chord?: number;
    thicknessRatio?: number;
    camber?: number;
    camberPos?: number;
    span?: number;
    bevel?: number;
    segments?: number;
    pivotAt?: number;
    orient?: "xy" | "xz";
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createHeightfieldSurface(opts?: {
    width?: number;
    depth?: number;
    segsX?: number;
    segsZ?: number;
    heightFn?: (u: number, v: number, x: number, z: number) => number;
    colorFn?: ((u: number, v: number, y: number, outColor: THREE.Color) => any) | null;
    skirt?: boolean;
    baseY?: number;
    skirtColor?: number | string;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, any, THREE.Object3DEventMap>;
  export function createFracturedChasm(opts?: {
    width?: number;
    depth?: number;
    chasmDepth?: number;
    rimHeight?: number;
    segsX?: number;
    segsZ?: number;
    strataCount?: number;
    jaggedness?: number;
    seed?: number;
    rimColor?: number | string;
    strataColors?: Array<number | string>;
    floorColor?: number | string;
    glowEmber?: boolean;
    emberColor?: number | string;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createParametricSurface(uSegs: number, vSegs: number, evalFn: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3 | number[] | void, opts?: {
    colorFn?: ((u: number, v: number, pos: THREE.Vector3, outColor: THREE.Color) => any) | null;
    doubleSided?: boolean;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, any, THREE.Object3DEventMap>;
  export function createDeformableStrip(opts?: {
    length?: number;
    width?: number;
    thickness?: number;
    segments?: number;
    curvature?: number;
    anchor?: "start" | "center";
    bimetallic?: boolean;
    preset?: string;
    topPreset?: string;
    bottomPreset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createHelicalCoil(opts?: {
    coilRadius?: number;
    wireRadius?: number;
    turns?: number;
    pitch?: number;
    height?: number;
    axis?: "y" | "x" | "z";
    leads?: number;
    tubularSegments?: number;
    radialSegments?: number;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): THREE.Mesh<THREE.TubeGeometry, any, THREE.Object3DEventMap>;
  export function createTaperedConduit(points: Array<[
    number,
    number,
    number
  ] | THREE.Vector3> | THREE.Curve<any>, radiusFn?: number | [
    number,
    number
  ] | ((t: number) => number), opts?: {
    tubularSegments?: number;
    radialSegments?: number;
    closed?: boolean;
    capStart?: boolean;
    capEnd?: boolean;
    curveTension?: number;
    colorFn?: ((t: number, outColor: THREE.Color) => any) | null;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): any;
  export function createPleatedBellows(opts?: {
    outerRadius?: number;
    innerRadius?: number;
    height?: number;
    pleats?: number;
    flangeHeight?: number;
    flangeRadius?: number;
    segments?: number;
    preset?: string;
    material?: THREE.Material;
    materialOverrides?: Record<string, any>;
    theme?: string;
    layer?: number;
    name?: string;
  }): THREE.Mesh<THREE.LatheGeometry, any, THREE.Object3DEventMap>;
  export const SCULPT_GEO_KINDS: readonly string[];
  export interface SculptMaterialPresetSpec {
    physical: boolean;
    reflective: boolean;
    color: number;
    darkColor: number;
    roughness: number;
    metalness: number;
    envMapIntensity: number;
    specularIntensity?: number;
    diffuseRoughness?: number;
    anisotropy?: number;
    sheen?: number;
    sheenRoughness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    ior?: number;
    reflectivity?: number;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    emissive?: number;
    emissiveIntensity?: number;
  }
  export const SCULPT_MATERIAL_PRESETS: Readonly<Record<
    "ceramic" | "clay" | "travertine" | "obsidian" | "rubber" | "enamel" | "painted" | "brass" | "anodized" | "copper" | "steel" | "satinSteel" | "satinBrass" | "castIron" | "glass" | "frostedGlass" | "ember",
    SculptMaterialPresetSpec
  >>;
  import * as THREE from 'three';
}

declare module "*/html-surface.js" {
  export function supportsHtmlInCanvas(): boolean;
  export function computeCanvasMatrix4(canvas: any, el: any, mesh: any, camera: any, out?: THREE.Matrix4): THREE.Matrix4;
  export function computeCanvasTransform(canvas: any, el: any, mesh: any, camera: any): DOMMatrix;
  export class HtmlSurfaceManager {
    constructor(stage: any, options?: {});
    stage: any;
    canvas: any;
    nativeEnabled: boolean;
    surfaces: Map<any, any>;
    mount(id: string, el: HTMLElement, opts?: {
      mesh?: THREE.Mesh;
      worldWidth?: number;
      worldHeight?: number;
      mode?: "interactive" | "decal";
      side?: number;
      opacity?: number;
      layer?: number;
      toneMapped?: boolean;
      maxTextureSize?: number;
      drawFallback?: (ctx: CanvasRenderingContext2D, w: number, h: number, el: HTMLElement) => void;
    }): {
      id: string;
      mesh: THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap>;
      el: HTMLElement;
      markDirty: () => void;
      setVisible: (v: any) => void;
      setOpacity: (a: any) => void;
      unmount: () => void;
    };
    handleViewportResize(): void;
    hasPendingVisible(): boolean;
    flushPaint({ timeoutMs }?: {
      timeoutMs?: number;
    }): Promise<boolean>;
    syncPaint(changedElements?: any, opts?: {}): boolean;
    requestPaint(): void;
    markDirty(id: any): void;
    setVisible(id: any, visible: any): void;
    setOpacity(id: any, opacity: any): void;
    updateGeometries(camera: any): void;
    unmount(id: any): void;
    dispose(): void;
  }
  import * as THREE from 'three';
}

declare module "*/layout-shell.js" {
  export function toggleZenMode(shellEl: HTMLElement, force?: boolean): boolean;
  export function setShellPresentation(shellEl: HTMLElement, { layout, theme, split, stage }?: {
    layout?: typeof LAYOUT_ARCHETYPES[number];
    theme?: typeof THEME_PRESETS[number];
    split?: "left" | "right" | "bottom";
    stage?: any;
  }): void;
  export function mountViewCube(containerEl: HTMLElement, stage: import("*/stage-3d.js").IsometricStage, { lang, showAngles, zenShell }?: {
    lang?: "zh" | "en";
    showAngles?: boolean;
    zenShell?: HTMLElement | null;
  }): {
    root: HTMLDivElement;
    sync: (cam: any) => void;
    unmount(): void;
  };
  export function mountScaleBar(containerEl: HTMLElement, stage: import("*/stage-3d.js").IsometricStage, options?: {
    /** World units per meter when unitLabel is "m". Defaults to 1. */
    worldUnitsPerMeter?: number;
    /** Display units per world unit. Overrides the reciprocal of worldUnitsPerMeter. */
    unitScale?: number;
    unitLabel?: string;
    niceSteps?: number[];
  }): {
    root: HTMLDivElement;
    sync: () => {
      barPx: number;
      value: number;
      unitLabel: string;
    };
    unmount(): void;
  };
  export const LAYOUT_ARCHETYPES: readonly ["fullbleed-hud", "split-bench", "ab-compare"];
  export const THEME_PRESETS: readonly ["paper-ink", "dark-studio", "bio-cutaway", "blueprint", "monochrome-print", "obsidian-gallery"];
  export const ICONS: Readonly<{
    play: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M4 2.8v10.4L13 8 4 2.8z\"/></svg>";
    pause: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"currentColor\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"3\" width=\"3.2\" height=\"10\" rx=\"0.8\"/><rect x=\"9.3\" y=\"3\" width=\"3.2\" height=\"10\" rx=\"0.8\"/></svg>";
    reset: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 8a5 5 0 1 0 1.4-3.5L3 6\"/><path d=\"M3 2.5V6h3.5\"/></svg>";
    cutaway: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"2.5\" y=\"2.5\" width=\"11\" height=\"11\" rx=\"1.5\"/><path d=\"M2.5 11.5 11.5 2.5M6.5 13.5l7-7\"/></svg>";
    explode: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 6 2.5 2.5m0 0H5m-2.5 0V5M10 6l3.5-3.5m0 0H11m2.5 0V5M6 10l-3.5 3.5m0 0H5m-2.5 0V11M10 10l3.5 3.5m0 0H11m2.5 0V11\"/></svg>";
    xray: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-dasharray=\"2.5 2\"/><circle cx=\"8\" cy=\"8\" r=\"2.2\"/></svg>";
    zen: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10\"/></svg>";
    cube: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 1.8 13.5 5v6L8 14.2 2.5 11V5L8 1.8z\"/><path d=\"M2.5 5 8 8.2 13.5 5M8 8.2v6\"/></svg>";
    lock: "<svg viewBox=\"0 0 16 16\" width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"7\" width=\"9\" height=\"6.5\" rx=\"1.4\"/><path d=\"M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7\"/></svg>";
  }>;
  export class WipeCompareController {
    constructor(shellEl: HTMLElement, { initial, min, max, onChange }?: {
      initial?: number;
      min?: number;
      max?: number;
      onChange?: ((pct: number) => void) | null;
    });
    shellEl: HTMLElement;
    min: any;
    max: number;
    value: any;
    onChange: (pct: number) => void;
    dividerEl: HTMLDivElement;
    setFraction(frac: any): any;
    dispose(): void;
    #private;
  }
}

declare module "*/link-bus.js" {
  export type LinkBusState = {
    hoveredId: any;
    selectedId: any;
  };
  
  export class LinkBus {
    hoveredId: any;
    selectedId: any;
    hover(id: string | null, source?: string): boolean;
    clearHover(source?: string): boolean;
    select(id: string | null, source?: string): boolean;
    focus(id: string, source?: string): boolean;
    getState(): LinkBusState;
    onHover(fn: any): () => void;
    onSelect(fn: any): () => void;
    onFocus(fn: any): () => void;
    destroy(): void;
  }
}

declare module "*/live-maths.js" {
  export function normalizeUnicodeScripts(input: string): Array<{
    type: "text" | "sub" | "sup";
    value: string;
  }>;
  export function mathVar(name: string, opts?: {
    sub?: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    text: string;
    sub?: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathSub(base: any, sub: any, opts?: {
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    base: any;
    sub: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathSup(base: any, sup: any, opts?: {
    sub?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    base: any;
    sup: any;
    sub?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathSubSup(base: any, sub: any, sup: any, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    base: any;
    sub: any;
    sup: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathFrac(num: any, den: any, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    num: any;
    den: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathOp(symbol: string, opts?: {
    lower?: any;
    upper?: any;
    display?: boolean;
    stacked?: boolean;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    symbol: string;
    lower?: any;
    upper?: any;
    display?: boolean;
    stacked?: boolean;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathNum(value: string | number, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    text: string;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathText(text: string, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    text: string;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathGroup(parts: Array<any>, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    parts: any[];
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathSqrt(radicand: any, opts?: {
    index?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    radicand: any;
    index?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathMatrix(rows: Array<Array<any>>, opts?: {
    fence?: "brackets" | "parens" | "bars" | "braces" | "none";
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    rows: any[][];
    fence: "none" | "brackets" | "parens" | "bars" | "braces";
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathCases(branches: Array<[
    any,
    any
  ] | {
    value: any;
    cond?: any;
  }>, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    branches: ([
      any,
      any
    ] | {
      value: any;
      cond?: any;
    })[];
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathAccent(base: any, accent?: "vec" | "hat" | "bar" | "dot" | "ddot" | "tilde", opts?: {
    sub?: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    base: any;
    accent: "vec" | "tilde" | "hat" | "bar" | "dot" | "ddot";
    sub?: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathFence(inner: any, opts?: {
    left?: string;
    right?: string;
    sub?: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    inner: any;
    left: string;
    right: string;
    sub?: any;
    sup?: any;
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function mathAlign(rows: Array<[
    any,
    string,
    any
  ] | {
    lhs: any;
    rel?: string;
    rhs: any;
  }>, opts?: {
    tone?: string;
    emph?: boolean;
    linkId?: string;
  }): {
    kind: string;
    rows: ([
      any,
      string,
      any
    ] | {
      lhs: any;
      rel?: string;
      rhs: any;
    })[];
    tone?: string;
    emph?: boolean;
    linkId?: string;
  };
  export function substituteTexVars(tex: string, vars?: Record<string, any>, opts?: {
    formatNumber?: (n: number) => string;
    linkMap?: Record<string, string>;
  }): string;
  export function renderTex(tex: string, container?: HTMLElement | null, opts?: {
    displayMode?: boolean;
    throwOnError?: boolean;
    strict?: boolean | string;
    macros?: Record<string, string>;
    vars?: Record<string, any> | null;
    linkMap?: Record<string, string> | null;
    formatNumber?: (n: number) => string;
    linkBus?: import("*/link-bus.js").LinkBus | null;
  }): HTMLElement | string;
  export function parseMathSegments(text: string): {
    hasMath: boolean;
    hasEscapedDollar: boolean;
    segments: Array<{
      type: "text" | "math";
      value: string;
      displayMode?: boolean;
    }>;
  };
  export function renderMathInElement(root: HTMLElement | null, opts?: {
    macros?: Record<string, string>;
    linkBus?: import("*/link-bus.js").LinkBus | null;
    throwOnError?: boolean;
  }): number;
  export class LiveMathsPanel {
    constructor(containerEl: HTMLElement | null, { title, subtitle, collapsed, linkBus, surfaceMode }?: {
      title?: string;
      subtitle?: string;
      collapsed?: boolean;
      linkBus?: import("*/link-bus.js").LinkBus | null;
      surfaceMode?: boolean;
    });
    container: HTMLElement;
    linkBus: import("*/link-bus.js").LinkBus;
    surfaceMode: boolean;
    detailsEl: HTMLDivElement | HTMLDetailsElement;
    summaryEl: HTMLElement;
    titleEl: HTMLElement;
    subtitleEl: HTMLSpanElement;
    badgeEl: HTMLSpanElement;
    bodyEl: HTMLDivElement;
    getElement(): HTMLDivElement | HTMLDetailsElement;
    bindLinkBus(linkBus: any): void;
    setVisible(visible: boolean): void;
    setOpen(open: boolean): void;
    update({ badge, subtitle, equations, table, breakdown }?: {
      badge?: string;
      subtitle?: string;
      equations?: Array<{
        label?: string;
        tokens: Array<any>;
      }>;
      table?: {
        caption?: string;
        headers: Array<string | number>;
        rows: Array<Array<string | number>>;
        rowLinkIds?: Array<string | null>;
        activeRow?: number;
        note?: string;
      };
      breakdown?: Array<{
        tag: string;
        text: string;
        tone?: "teal" | "amber" | "danger" | "navy";
        linkId?: string;
      }>;
    }): void;
    destroy(): void;
    #private;
  }
}

declare module "*/manipulator.js" {
  export class StageManipulator {
    constructor(stage: any, { onHover, onClick, clock, autoExitOnBeatChange, allowedBeats, disableOnBeatChange, onBeatExit, }?: {
      onHover?: any;
      onClick?: any;
      clock?: any;
      autoExitOnBeatChange?: boolean;
      allowedBeats?: any;
      disableOnBeatChange?: boolean;
      onBeatExit?: any;
    });
    stage: any;
    canvas: any;
    addHandle(id: string, object3D: THREE.Object3D, config?: {
      planeNormal?: [
        number,
        number,
        number
      ] | THREE.Vector3;
      planePoint?: [
        number,
        number,
        number
      ] | THREE.Vector3;
      axis?: [
        number,
        number,
        number
      ] | THREE.Vector3;
      origin?: [
        number,
        number,
        number
      ] | THREE.Vector3;
      min?: number;
      max?: number;
      cursor?: string;
      dragCursor?: string;
      meta?: Record<string, any>;
      onHover?: (hovered: boolean, info: any) => void;
      onDragStart?: (info: any) => void;
      onDrag?: (info: any) => void;
      onDragEnd?: (info: any) => void;
      onClick?: (info: any) => void;
    }): {
      id: string;
      kind: string;
      object3D: THREE.Object3D<THREE.Object3DEventMap>;
      planeNormal: any;
      planePoint: any;
      axis: any;
      origin: any;
      min: number;
      max: number;
      cursor: string;
      dragCursor: string;
      meta: Record<string, any>;
      onHover: (hovered: boolean, info: any) => void;
      onDragStart: (info: any) => void;
      onDrag: (info: any) => void;
      onDragEnd: (info: any) => void;
      onClick: (info: any) => void;
    };
    addClickable(id: any, object3D: any, config?: {}): {
      id: any;
      kind: string;
      object3D: any;
      cursor: any;
      dragCursor: any;
      meta: any;
      onHover: any;
      onClick: any;
    };
    remove(id: any): void;
    setEnabled(enabled: any): void;
    bindClock(clock: any, { autoExitOnBeatChange, allowedBeats, disableOnBeatChange, autoRestore, onBeatExit, }?: {
      autoExitOnBeatChange?: boolean;
      allowedBeats?: any;
      disableOnBeatChange?: boolean;
      autoRestore?: boolean;
      onBeatExit?: any;
    }): any;
    isDragging(): boolean;
    dispose(): void;
  }
  export class GridBrush {
    constructor(stage: any, { targets, getCell, active, mode, holdModifier, paintCursor, clock, autoExitOnBeatChange, autoExitOnSeek, allowedBeats, onActiveChange, onHoverCell, onClickCell, onPaintCell, onStrokeStart, onStrokeEnd, }?: {
      targets?: any[];
      getCell?: any;
      active?: boolean;
      mode?: string;
      holdModifier?: string;
      paintCursor?: string;
      clock?: any;
      autoExitOnBeatChange?: boolean;
      autoExitOnSeek?: boolean;
      allowedBeats?: any;
      onActiveChange?: any;
      onHoverCell?: any;
      onClickCell?: any;
      onPaintCell?: any;
      onStrokeStart?: any;
      onStrokeEnd?: any;
    });
    stage: any;
    canvas: any;
    active: boolean;
    mode: string;
    holdModifier: string;
    paintCursor: string;
    setTargets(meshes: any): void;
    setActive(active: any, meta?: {
      reason: string;
    }): void;
    bindClock(clock: any, { autoExitOnBeatChange, autoExitOnSeek, allowedBeats, onAutoExit, }?: {
      autoExitOnBeatChange?: boolean;
      autoExitOnSeek?: boolean;
      allowedBeats?: any;
      onAutoExit?: any;
    }): () => void;
    setMode(mode: any): void;
    dispose(): void;
  }
  import * as THREE from 'three';
}

declare module "*/model-core.js" {
  export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
  export interface ModelClock {
    t: number;
    subscribe(fn: (state: { t: number }) => void): () => unknown;
  }
  export interface FalsifyAssertion {
    name: string;
    passed: boolean;
    detail: string;
    baseMetric: number | null;
    mutantMetric: number | null;
    /** Number of same-time baseline/mutant solves that returned distinct snapshots. */
    comparisons: number;
  }
  export interface FalsifyReport {
    passed: boolean;
    version: 3;
    total: number;
    passedCount: number;
    assertions: FalsifyAssertion[];
  }
  export type CheckResult = boolean | {
    passed: boolean;
    detail?: string;
    metricDelta?: number | { baseMetric: number; mutantMetric: number };
    baseMetric?: number;
    mutantMetric?: number;
  };
  export type Evaluate<P, S> = (t: number, overrideParams?: Partial<P>) => DeepReadonly<S>;
  export type FalsifyCase<P, S> = {
    name: string;
    label?: string;
    description?: string;
    /** Optional shallow parameter patch applied over baseline parameters. */
    params?: Partial<P>;
    /** Return a shallow patch, or mutate the supplied copy in place. */
    mutateParams?: (params: P) => Partial<P> | void;
    t?: number | readonly number[];
    check(base: DeepReadonly<S>, mutant: DeepReadonly<S>, context: {
      baseParams: DeepReadonly<P>;
      mutantParams: DeepReadonly<P>;
    }): CheckResult;
  } | {
    name: string;
    label?: string;
    description?: string;
    params?: Partial<P>;
    mutateParams?: (params: P) => Partial<P> | void;
    run(evaluate: Evaluate<P, S>): CheckResult;
  } | ((evaluate: Evaluate<P, S>) => CheckResult);
  export interface FalsifyCaseSummary {
    readonly name: string;
    readonly label: string;
    readonly description: string;
    readonly hasParams: boolean;
  }
  export interface SimModel<P, S> {
    clock: ModelClock | null;
    readonly t: number;
    getParams(): DeepReadonly<P>;
    getSnapshot(): DeepReadonly<S>;
    setTime(t: number): DeepReadonly<S>;
    setParams(patch: Partial<P>): DeepReadonly<S>;
    resetParams(): DeepReadonly<S>;
    evaluate: Evaluate<P, S>;
    /** Immediately delivers the current snapshot. Returns an unsubscribe function. */
    subscribe(fn: (snapshot: DeepReadonly<S>, params: DeepReadonly<P>, t: number) => void): () => boolean;
    getFalsifyCases(): readonly FalsifyCaseSummary[];
    applyFalsifyCase(nameOrIndex: string | number): DeepReadonly<S>;
    falsify(): FalsifyReport;
    dispose(): void;
  }
  /** Both the parameter record and solve output must be plain data. */
  export function createSimModel<P extends object, S>(options: {
    params: P;
    solve(params: DeepReadonly<P>, t: number): S;
    falsifyCases?: readonly FalsifyCase<P, S>[];
    clock?: ModelClock | null;
  }): SimModel<P, S>;
  export function rk4Step(state: number, t: number, dt: number, derivFn: (state: number, t: number) => number): number;
  export function rk4Step<V extends readonly number[]>(state: V, t: number, dt: number, derivFn: (state: V, t: number) => readonly number[]): { -readonly [K in keyof V]: number };
  export function integrateRK4(y0: number, t0: number, t1: number, steps: number, derivFn: (state: number, t: number) => number): number;
  export function integrateRK4<V extends readonly number[]>(y0: V, t0: number, t1: number, steps: number, derivFn: (state: V, t: number) => readonly number[]): { -readonly [K in keyof V]: number };
  export function bisectRoot(fn: (x: number) => number, a: number, b: number, tol?: number, maxIter?: number): number;
  export function formatUnit(value: number, unit?: string, digits?: number): string;
  export const clamp: (x: number, lo: number, hi: number) => number;
  export const lerp: (a: number, b: number, u: number) => number;
}

declare module "*/outline-pass.js" {
  export const SOLID_LAYER: 0;
  export const GROUND_LAYER: 1;
  export const SURFACE_LAYER: 2;
  export const GLASS_LAYER: 3;
  /**
   * Optional per-mesh `userData` ink controls honored by `OutlinePass` on both WebGPU/TSL and WebGL2:
   * - `userData.ink?: number` — ink strength in `[0, 1]` (`0` suppresses strokes while keeping depth occlusion)
   * - `userData.inkThin?: boolean` — scales edge kernel reach by `0.55x` for thin rods/wires/stems
   * - `userData.inkNormals?: 'none' | false` — silhouette/ID-only outline (suppresses internal normal creases)
   * - `userData.inkFlat?: boolean` — uses flat facet normals (`dFdx`/`dFdy`) for faceted solids
   * - `userData.inkGroupId?: string | number` — merges touching sub-meshes under a shared object ID
   */
  export interface MeshInkUserData {
    ink?: number;
    inkThin?: boolean;
    inkNormals?: "none" | false;
    inkFlat?: boolean;
    inkGroupId?: string | number;
  }
  export const OUTLINE_PRESETS: Readonly<{
    primer: Readonly<{
      enabled: true;
      thickness: number;
      opacityScale: number;
      depthThreshold: number;
      normalThreshold: number;
      creaseWeight: number;
      outerWeight: number;
      aoStrength: number;
    }>;
    crisp: Readonly<{
      enabled: true;
      thickness: number;
      opacityScale: number;
      depthThreshold: number;
      normalThreshold: number;
      aoStrength: number;
    }>;
    subtle: Readonly<{
      enabled: true;
      thickness: number;
      opacityScale: number;
      depthThreshold: number;
      normalThreshold: number;
      aoStrength: number;
    }>;
    none: Readonly<{
      enabled: false;
      thickness: number;
      opacityScale: number;
      depthThreshold: number;
      normalThreshold: number;
      aoStrength: number;
    }>;
  }>;
  export class OutlinePass {
    constructor(renderer: any, options?: {});
    renderer: any;
    preset: string;
    enabled: any;
    thickness: any;
    pixelRatio: number;
    lineScale: number;
    opacity: number;
    depthThreshold: any;
    normalThreshold: any;
    creaseWeight: number;
    outerWeight: number;
    lineColor: THREE.Color;
    focusDim: any;
    aoStrength: any;
    isTSL: boolean;
    enableBloom({ strength, radius, threshold }?: {
      strength?: number;
      radius?: number;
      threshold?: number;
    }): Promise<boolean>;
    enableDepthOfField({ focusDistance, focalLength, bokehScale }?: {
      focusDistance?: number;
      focalLength?: number;
      bokehScale?: number;
    }): Promise<boolean>;
    setDepthOfField({ enabled, focusDistance, focalLength, bokehScale }?: {}): boolean;
    setAOStrength(strength: any): any;
    colorTarget: THREE.WebGLRenderTarget<THREE.Texture<unknown, THREE.TextureEventMap>>;
    normalTarget: THREE.WebGLRenderTarget<THREE.Texture<unknown, THREE.TextureEventMap>>;
    normalMaterial: THREE.ShaderMaterial | THREE.MeshNormalMaterial;
    material: THREE.ShaderMaterial;
    fsScene: THREE.Scene<THREE.Object3DEventMap>;
    fsCamera: THREE.OrthographicCamera;
    fsQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial, THREE.Object3DEventMap>;
    setPreset(preset: any): string;
    setSize(width: any, height: any, pixelRatio?: number, physicalWidth?: any, physicalHeight?: any): void;
    setLineScale(scale: any): void;
    setInkColor(color: any, opacity: any): void;
    setFocusDim(strength?: number): void;
    render(scene: any, camera: any): void;
    renderAsync(scene: any, camera: any): Promise<void>;
    dispose(): void;
  }
  import * as THREE from 'three';
}

declare module "*/popups.js" {
  export class FloatingPopups {
    constructor(stage: any, containerEl: any);
    stage: any;
    container: any;
    spawn(worldPos: any, text: any, tone?: string): void;
    clear(): void;
  }
}

declare module "*/sound.js" {
  export class TactileSound {
    constructor(options?: {});
    isMuted(): boolean;
    setMuted(muted: any): void;
    click(): void;
    step(): void;
    hit(): void;
    miss(): void;
    evict(): void;
    success(): void;
  }
}

declare module "*/spacetime.js" {
  export type SpacetimeClockState = {
    t: number;
    globalTime: number;
    duration: number;
    globalDuration: number;
    progress: number;
    totalProgress: number;
    stepProgress: number;
    speed: number;
    playing: boolean;
    manualMode: boolean;
    complete: boolean;
    beat: {
      localT: number;
      localProgress: number;
      id: string;
      index: number;
      localIndex: number;
      stageIndex: number;
      stageId: string;
      stageTitle: string;
      title: string;
      start: number;
      end: number;
      duration: number;
      summary: string;
      carries: string;
      hook: string;
      relates: any[];
      camera: any;
      meta: any;
    };
    beatIndex: number;
    beatCount: number;
    stepIndex: number;
    stepCount: number;
    stepId: string;
    stepTitle: string;
    stageIndex: number;
    stageCount: number;
    stageId: string;
    stageTitle: string;
    summary: string;
    carries: string;
    hook: string;
    relates: any[];
  };
  export type SpacetimeClockTimelineInfo = {
    mode: string;
    duration: number;
    defaultFps: number;
    stages: {
      id: string;
      index: number;
      title: string;
      start: number;
      end: number;
      carries: string;
      hook: string;
      steps: {
        id: string;
        title: string;
        start: number;
        end: number;
        summary: string;
        carries: string;
        hook: string;
      }[];
    }[];
    beats: {
      id: string;
      index: number;
      stageId: string;
      stageIndex: number;
      title: string;
      start: number;
      end: number;
    }[];
  };
  
  export function defaultInterpolateState(a: any, b: any, alpha: any): any;
  export function clamp01(u: any): number;
  export function easeLinear(u: any): number;
  export function easeOutCubic(u: any): number;
  export function easeInOutCubic(u: any): number;
  export function easeOutExpo(u: any): number;
  export function easeOutBack(u: any, overshoot?: number): number;
  export class SpacetimeClock {
    constructor(options?: {
      duration?: number;
      speed?: number;
      loop?: boolean;
      playing?: boolean;
      manualMode?: boolean;
      beats?: Array<object>;
      acts?: Array<object>;
      defaultFps?: number;
      onTick?: (state: SpacetimeClockState) => void;
      onSeek?: (state: SpacetimeClockState) => void;
    });
    duration: number;
    beats: {
      id: string;
      index: number;
      localIndex: number;
      stageIndex: number;
      stageId: string;
      stageTitle: string;
      title: string;
      start: number;
      end: number;
      duration: number;
      summary: string;
      carries: string;
      hook: string;
      relates: any[];
      camera: any;
      meta: any;
    }[];
    acts: {
      id: string;
      index: number;
      title: string;
      start: number;
      end: number;
      summary: string;
      carries: string;
      hook: string;
      relates: any[];
      camera: any;
      steps: {
        id: string;
        index: number;
        localIndex: number;
        stageIndex: number;
        stageId: string;
        stageTitle: string;
        title: string;
        start: number;
        end: number;
        duration: number;
        summary: string;
        carries: string;
        hook: string;
        relates: any[];
        camera: any;
        meta: any;
      }[];
    }[];
    defaultFps: number;
    speed: number;
    loop: boolean;
    manualMode: boolean;
    t: number;
    playing: boolean;
    complete: boolean;
    setTimeline({ duration, beats, acts }?: {
      duration?: number;
      beats?: any[];
      acts?: any;
    }): SpacetimeClockTimelineInfo;
    play(): SpacetimeClockState;
    pause(): SpacetimeClockState;
    toggle(): SpacetimeClockState;
    setSpeed(rate: any): number;
    setManualMode(enabled: any): boolean;
    seek(t: any, { silent, notifyHandlers, emitTick }?: {
      silent?: boolean;
      notifyHandlers?: boolean;
      emitTick?: boolean;
    }): SpacetimeClockState;
    seekNorm(u: any, opts: any): SpacetimeClockState;
    stepFrame(fps?: number, dir?: number): SpacetimeClockState;
    tick(dt: any): boolean;
    getBeatAt(t?: number): {
      localT: number;
      localProgress: number;
      id: string;
      index: number;
      localIndex: number;
      stageIndex: number;
      stageId: string;
      stageTitle: string;
      title: string;
      start: number;
      end: number;
      duration: number;
      summary: string;
      carries: string;
      hook: string;
      relates: any[];
      camera: any;
      meta: any;
    };
    getActAt(t?: number): {
      id: string;
      index: number;
      title: string;
      start: number;
      end: number;
      summary: string;
      carries: string;
      hook: string;
      relates: any[];
      camera: any;
      steps: {
        id: string;
        index: number;
        localIndex: number;
        stageIndex: number;
        stageId: string;
        stageTitle: string;
        title: string;
        start: number;
        end: number;
        duration: number;
        summary: string;
        carries: string;
        hook: string;
        relates: any[];
        camera: any;
        meta: any;
      }[];
    };
    jumpToBeat(idOrIndex: any, { play, offset }?: {
      play?: any;
      offset?: number;
    }): SpacetimeClockState;
    jumpToAct(idOrIndex: any, { play, offset }?: {
      play?: any;
      offset?: number;
    }): SpacetimeClockState;
    nextBeat(opts?: {}): SpacetimeClockState;
    prevBeat(opts?: {}): SpacetimeClockState;
    getTimelineInfo(): SpacetimeClockTimelineInfo;
    getState(): SpacetimeClockState;
    onTick(fn: (state: SpacetimeClockState) => void): () => void;
    onSeek(fn: (state: SpacetimeClockState) => void): () => void;
    subscribe(fn: (state: SpacetimeClockState) => void): () => void;
    destroy(): void;
    #private;
  }
  export class SimulationTape {
    constructor({ interpolate }?: {
      interpolate?: any;
    });
    frames: any[];
    byKey: Map<any, any>;
    interpolate: any;
    get length(): number;
    get startTime(): any;
    get endTime(): any;
    get duration(): number;
    clear(): this;
    record(keyOrTime: number | string, state: any, explicitTime?: number): {
      t: number;
      key: string;
      state: any;
    };
    bake(specOrFn: any, generatorFn?: any): this;
    getByKey(key: any): any;
    sampleAt(t: any, interpolateFn?: any): any;
    sampleRange(t0: any, t1: any, maxSamples?: number): any[];
    captureGhost(label?: string, meta?: {}): {
      label: string;
      meta: any;
      frames: {
        t: any;
        key: any;
        state: any;
      }[];
      length: number;
      startTime: number;
      endTime: any;
      sampleAt: (t: any, interp?: any) => any;
      sampleRange: (t0: any, t1: any, maxSamples?: number) => any[];
    };
    getGhost(label?: any): any;
    listGhosts(): any[];
    hasGhost(label?: any): boolean;
    clearGhost(label?: any): void;
  }
}

declare module "*/spring.js" {
  export function easeOutCubic(t: any): number;
  export function easeOutBack(t: any, overshoot?: number): number;
  export function clamp(v: any, lo: any, hi: any): number;
  export class Spring {
    constructor({ value, target, stiffness, damping, mass, precision }?: {
      value?: number;
      target?: any;
      stiffness?: number;
      damping?: number;
      mass?: number;
      precision?: number;
    });
    value: any;
    target: any;
    velocity: number;
    stiffness: number;
    damping: number;
    mass: number;
    precision: number;
    snap(v: any): void;
    impulse(v: any): void;
    settled(): boolean;
    step(dt: any): any;
  }
}

declare module "*/stage-3d.js" {
  export type IsometricStageCameraState = {
    azimuth: any;
    elevation: any;
    azimuthDeg: number;
    elevationDeg: number;
    distance: number;
    zoom: number;
    target: number[];
    topView: boolean;
    userCameraLocked: boolean;
    cameraType: string;
  };
  
  export type StudioTheme = "paper-ink" | "dark-studio" | "bio-cutaway" | "blueprint" | "monochrome-print" | "obsidian-gallery";
  export type GridStyle = "cartesian" | "polar" | "plinth" | "none";
  export type CardinalView = "front" | "side" | "right" | "left" | "back" | "top" | "iso";
  export type CameraPose = {
    azimuth?: number; azimuthDeg?: number; elevation?: number; elevationDeg?: number;
    zoom?: number; distance?: number; fov?: number;
    target?: number[] | THREE.Vector3 | { x?: number; y?: number; z?: number };
  };
  export type DepthOfFieldOptions = {
    enabled?: boolean; focusDistance?: number; focalLength?: number; bokehScale?: number;
  };
  export interface StageOptions extends Omit<CameraPose, "target" | "azimuthDeg" | "elevationDeg"> {
    target?: [number, number, number];
    /** Defaults to auto. legacy-webgl requires "three" to resolve to three.module.js. */
    backend?: "auto" | "webgl2" | "webgpu" | "legacy-webgl";
    cameraType?: "perspective" | "orthographic";
    near?: number; far?: number; baseSpan?: number;
    theme?: StudioTheme;
    outline?: boolean | "auto" | "primer" | "crisp" | "subtle" | "none";
    autoLoop?: boolean; autoPauseOffscreen?: boolean; orbitEnabled?: boolean; htmlInCanvas?: boolean;
    gridSize?: number; gridStyle?: GridStyle; groundY?: number; showGrid?: boolean; showGround?: boolean;
    shadowBounds?: number; alpha?: boolean; antialias?: boolean; localClippingEnabled?: boolean;
    shadowType?: "pcf" | "vsm"; shadowRadius?: number; shadowBlurSamples?: number;
    shadowBias?: number; shadowNormalBias?: number;
    autoUpdateShadows?: boolean; autoFitShadowFrustum?: boolean; selectiveIBL?: boolean;
    preserveDrawingBuffer?: boolean; webgpuTimeoutMs?: number;
    toneMapping?: THREE.ToneMapping; toneMappingExposure?: number; envIntensity?: number;
    lineColor?: THREE.ColorRepresentation; lineOpacity?: number; lineThickness?: number;
    depthThreshold?: number; normalThreshold?: number; aoStrength?: number;
    dof?: DepthOfFieldOptions;
    bloom?: { strength?: number; radius?: number; threshold?: number };
    onHover?: (part: Pickable | null) => void;
    onSelect?: (part: Pickable, event: PointerEvent) => void;
    onViewChange?: (state: IsometricStageCameraState) => void;
  }
  export interface StageShadowFrustumFit {
    left: number; right: number; top: number; bottom: number; near: number; far: number;
    sceneSpan: number; frustumSpan: number; utilization: number;
  }
  export interface StageTelemetry {
    version: string;
    theme: StudioTheme;
    aestheticTier: "primer-illustration" | "studio-pbr";
    backend: string;
    dpr: number;
    physicalWidth: number;
    physicalHeight: number;
    toneMapping: string;
    toneMappingExposure: number;
    outline: { preset: string; enabled: boolean; inkColor: string | null };
    ibl: { kind: string; pmremSigma: number | null; selective: boolean; sceneEnvironmentAttached: boolean; environmentIntensity: number };
    shadow: {
      type: string;
      radius: number; autoUpdate: boolean; mapSize: [number, number];
      frustum: { left: number; right: number; top: number; bottom: number; near: number; far: number } | null;
      frustumSpan: number; sceneSpan: number; utilization: number; fitted: boolean;
    };
    materials: {
      meshCount: number;
      roughnessMin: number | null; roughnessMax: number | null; roughnessSpread: number; roughnessMean: number | null;
      plasticClusterRatio: number;
      metalnessMin: number | null; metalnessMax: number | null; midMetalnessCount: number;
      reflectiveCount: number; matteCount: number;
      maxTextureAnisotropy: number; minTextureAnisotropy: number | null;
    };
  }
  export type Pickable = { id: string; object3D: THREE.Object3D; meta: Record<string, unknown> };
  export interface StudioLighting {
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    keyColor: number;
    keyIntensity: number;
    fillColor: number;
    fillIntensity: number;
    rimColor: number;
    rimIntensity: number;
    shadowColor: number;
    shadowOpacity: number;
    gridCenter: number;
    gridLine: number;
    gridOpacity: number;
    envIntensity: number;
    inkColor: string;
    inkOpacity: number;
  }
  export const PRIMER_THEMES: Set<StudioTheme>;
  export class StudioLightformerEnvironment extends THREE.Scene {
    constructor();
    dispose(): void;
  }
  export const STUDIO_THEMES: Record<StudioTheme, StudioLighting>;
  export class IsometricStage {
    static create(canvas: HTMLCanvasElement, options?: StageOptions): Promise<IsometricStage>;
    constructor(canvas: HTMLCanvasElement, options?: StageOptions);
    canvas: HTMLCanvasElement;
    reducedMotion: boolean;
    cameraType: "orthographic" | "perspective";
    fov: number;
    near: number;
    far: number;
    baseSpan: number;
    distance: number;
    outlinePreset: string;
    outlineEnabled: boolean;
    themeName: StudioTheme;
    envMap: THREE.Texture | null;
    defaultView: {
      azimuth: number;
      elevation: number;
      zoom: number;
      distance: number;
      target: THREE.Vector3;
    };
    view: {
      azimuth: number;
      elevation: number;
      zoom: number;
      distance: number;
      target: THREE.Vector3;
    };
    size: {
      width: number;
      height: number;
      dpr: number;
      physicalWidth: number;
      physicalHeight: number;
    };
    backendKind: "pending" | "webgl2" | "webgpu" | "fallback";
    htmlInCanvasSupported: boolean;
    gpuErrors: any[];
    scene: THREE.Scene<THREE.Object3DEventMap>;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    htmlSurfaces: HtmlSurfaceManager | null;
    renderer: THREE.WebGLRenderer | import("three/webgpu").WebGPURenderer | null;
    outline: OutlinePass | null;
    ready: Promise<this>;
    applyEnvironment(root?: THREE.Object3D): number;
    fitShadowFrustum(target?: THREE.Object3D, padding?: number): StageShadowFrustumFit | null;
    markShadowsDirty(): void;
    getTelemetry(): StageTelemetry;
    getMaxAnisotropy(): number;
    configureSharpTexture<T extends THREE.Texture>(tex: T, opts?: { colorSpace?: string; anisotropy?: number; generateMipmaps?: boolean; minFilter?: THREE.MinificationTextureFilter; magFilter?: THREE.MagnificationTextureFilter }): T;
    setOutlinePreset(preset: StageOptions["outline"]): string;
    getGeometryAudit(): {
      totalMeshes: number;
      cuboidMeshes: number;
      sculptedMeshes: number;
      primitiveMeshes: number;
      surfaceMeshes: number;
      cuboidRatio: number;
      sculptedRatio: number;
      bounds: {
        width: number;
        height: number;
        depth: number;
        min: number[];
        max: number[];
        center: number[];
        normalizedRatio: number[];
        flatnessRatio: number;
      };
      kinds: any;
    };
    setGridStyle(style?: GridStyle): GridStyle;
    setTheme(themeName: StudioTheme): void;
    addContactBlobShadow(radiusOrOpts?: number | {
      position?: number[];
      radius?: number;
      radiusX?: number;
      radiusZ?: number;
      opacity?: number;
      color?: THREE.ColorRepresentation;
    }, opacity?: number, opts?: {
      position?: number[];
      radiusX?: number;
      radiusZ?: number;
      color?: THREE.ColorRepresentation;
    }): {
      mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
      setPosition(x: any, z: any, y?: number): void;
      setScale(rx: any, rz?: any): void;
      setOpacity(op: any): void;
      dispose: () => void;
    };
    addContactShadow({ position, radiusX, radiusZ, opacity, color }?: {
      position?: number[];
      radiusX?: number;
      radiusZ?: number;
      opacity?: number;
      color?: THREE.ColorRepresentation;
    }): {
      mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
      setPosition(x: any, z: any, y?: number): void;
      setScale(rx: any, rz?: any): void;
      setOpacity(op: any): void;
      dispose: () => void;
    };
    createAccentLight({ type, color, intensity, distance, decay, position, target, angle, penumbra, }?: {
      type?: string;
      color?: number;
      intensity?: number;
      distance?: number;
      decay?: number;
      position?: number[];
      target?: number[];
      angle?: number;
      penumbra?: number;
    }): {
      light: THREE.SpotLight | THREE.PointLight;
      setIntensity: (v: any) => void;
      setColor: (c: any) => void;
      setPosition: (x: any, y: any, z: any) => void;
      dispose: () => void;
    };
    setAOStrength(strength: number): number;
    enableDepthOfField(opts?: DepthOfFieldOptions): Promise<boolean>;
    setDepthOfField(opts?: DepthOfFieldOptions): boolean;
    createClippingGroup(planes?: any[], { clipShadows, clipIntersection, enabled, name }?: {
      clipShadows?: boolean;
      clipIntersection?: boolean;
      enabled?: boolean;
      name?: string;
    }): any;
    createCutawayCap(target: any, plane: any, opts?: {
      capSize?: number;
      baseColor?: string | number;
      hatchColor?: string | number;
      hatchAngle?: number;
      hatchSpacing?: number;
      hatchMode?: "analytical" | "texture";
      onlyShells?: boolean;
      renderOrder?: number;
      attachClipping?: boolean;
      name?: string;
    }): {
      group: THREE.Group<THREE.Object3DEventMap>;
      targetClipGroup: any;
      targetClipGroups: any[];
      stencilGroup: any;
      plane: any;
      capMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material, THREE.Object3DEventMap>;
      onlyShells: boolean;
      hatchMode: "analytical" | "texture";
      sync: () => void;
      syncMatrices: () => void;
      setConstant: (c: any) => void;
      setEnabled: (enabled: any) => void;
      dispose: () => void;
    };
    setShellXRay(root: THREE.Object3D, enabled: boolean, opts?: {
      color?: string | number;
      rimColor?: string | number;
      opacity?: number;
      emissiveIntensity?: number;
      doubleSide?: boolean;
    }): number;
    syncCameraWith(otherStage: IsometricStage): () => void;
    captureCardinalSnapshot(viewName: CardinalView, destCanvas: HTMLCanvasElement, opts?: { zoom?: number }): boolean;
    setOrbitEnabled(enabled: boolean): void;
    setCursorOverride(cursor: string | null): void;
    setCameraType(type: StageOptions["cameraType"], opts?: { fov?: number; distance?: number }): void;
    createCutawayPlane(normal?: number[], constant?: number): THREE.Plane;
    setClippingPlanes(planes?: THREE.Plane[]): void;
    setHighlightRing(worldPos: THREE.Vector3 | number[], radius?: number, color?: THREE.ColorRepresentation): void;
    clearHighlightRing(): void;
    registerPickable(id: any, object3D: any, meta?: {}): {
      id: any;
      object3D: any;
      meta: {};
    };
    unregisterPickable(id: any): void;
    clearPickables(): void;
    resize(force?: boolean): void;
    setExportSize(width: any, height: any, dpr?: number): {
      width: number;
      height: number;
      dpr: number;
      physicalWidth: number;
      physicalHeight: number;
    };
    restoreSize(): {
      width: number;
      height: number;
      dpr: number;
      physicalWidth: number;
      physicalHeight: number;
    };
    isUserCameraLocked(): boolean;
    unlockUserCamera(): void;
    setCameraFromScript(pose?: CameraPose): boolean;
    setCameraImmediate(pose?: CameraPose, opts?: { unlock?: boolean }): void;
    setCardinalView(viewName?: CardinalView, opts?: {
      centerOnBounds?: boolean;
      zoom?: number;
      unlock?: boolean;
    }): {
      view: string;
      azimuthDeg: number;
      elevationDeg: number;
      bounds: {
        width: number;
        height: number;
        depth: number;
        min: number[];
        max: number[];
        center: number[];
        normalizedRatio: number[];
        flatnessRatio: number;
      };
    };
    flyTo(goal?: CameraPose, durationMs?: number, opts?: { lockUser?: boolean; fromScript?: boolean }): void;
    focusPart(id: any, zoom?: number): boolean;
    rotateBy(degDelta: number): void;
    zoomBy(factor: number): void;
    toggleTopView(): boolean;
    resetView(): void;
    isTopView(): boolean;
    getCameraState(): IsometricStageCameraState;
    projectToScreen(worldPos: any): {
      x: number;
      y: number;
      visible: boolean;
    };
    onFrame(fn: any): () => boolean;
    requestRender(): void;
    setManualMode(enabled: boolean): void;
    renderNow(): boolean;
    renderNowAsync(): Promise<boolean>;
    renderFrame(nowMs?: number, explicitDt?: number | null): boolean;
    dispose(): void;
  }
  import { GLASS_LAYER } from "*/outline-pass.js";
  import { GROUND_LAYER } from "*/outline-pass.js";
  import { SOLID_LAYER } from "*/outline-pass.js";
  import { SURFACE_LAYER } from "*/outline-pass.js";
  import * as THREE from 'three';
  import { HtmlSurfaceManager } from "*/html-surface.js";
  import { OutlinePass } from "*/outline-pass.js";
  export { GLASS_LAYER, GROUND_LAYER, SOLID_LAYER, SURFACE_LAYER };
}

declare module "*/timeline-director.js" {
  export type TimelineDirectorState = {
    stepIndex: any;
    stepCount: number;
    stageIndex: any;
    stageCount: number;
    stageId: any;
    stageTitle: any;
    stepId: any;
    stepTitle: any;
    summary: any;
    carries: any;
    hook: any;
    relates: any;
    t: number;
    duration: number;
    globalTime: number;
    globalDuration: number;
    stepProgress: number;
    totalProgress: number;
    progress: number;
    speed: number;
    playing: boolean;
    complete: boolean;
  };
  export type TimelineDirectorTimelineInfo = {
    mode: string;
    duration: number;
    defaultFps: number;
    stages: {
      id: string;
      index: number;
      title: string;
      start: any;
      end: any;
      carries: any;
      hook: any;
      steps: {
        id: any;
        title: any;
        start: any;
        end: any;
        summary: any;
        carries: any;
        hook: any;
      }[];
    }[];
  };
  export type PhaseScrubberState = {
    t: number;
    globalTime: number;
    duration: number;
    globalDuration: number;
    norm: number;
    progress: number;
    speed: number;
    playing: boolean;
    loop: boolean;
  };
  
  export function mountTimelineBar(containerEl: HTMLElement, controller: TimelineDirector | import("*/spacetime.js").SpacetimeClock, { speeds, showStages, showEndButton, globalScrub, showBeatMarkers, lang, labels, stageLabels, }?: {
    speeds?: number[];
    showStages?: boolean;
    showEndButton?: boolean;
    globalScrub?: boolean;
    showBeatMarkers?: boolean;
    lang?: string;
    labels?: Record<string, string>;
    stageLabels?: string[] | Record<string, string>;
  }): {
    root: HTMLDivElement;
    scrub: HTMLInputElement;
    unsub: () => void;
    refreshMarkers: () => void;
    setStageLabels: (nextStageLabels?: any) => void;
    setLang: (nextLang: any, nextLabels?: {}) => void;
    setLabels(nextLabels?: {}): void;
    unmount(): void;
  };
  export function parseUrlState(search?: string): {
    stage: string | number | null;
    step: number | null;
    t: number | null;
    paused: boolean;
    end: boolean;
    thumb: boolean;
    exportMode: "stage" | "caption" | "hud" | null;
    export: "stage" | "caption" | "hud" | null;
    backend: string | null;
    lang: string | null;
    skin: string | null;
  };
  export function applyUrlState(controller: TimelineDirector | import("*/spacetime.js").SpacetimeClock, search?: string): {
    stage: string | number | null;
    step: number | null;
    t: number | null;
    paused: boolean;
    end: boolean;
    thumb: boolean;
    exportMode: "stage" | "caption" | "hud" | null;
    export: "stage" | "caption" | "hud" | null;
    backend: string | null;
    lang: string | null;
    skin: string | null;
  };
  import type { SpacetimeClock, SpacetimeClockState, SpacetimeClockTimelineInfo } from "*/spacetime.js";
  import type { ActorChoreographer } from "*/choreography.js";
  import type { IsometricStage, CardinalView } from "*/stage-3d.js";
  import type { FalsifyReport, SimModel } from "*/model-core.js";
  export type Profile = "mechanical-3d" | "field-math" | "sandbox-direct";
  export type HookController = SpacetimeClock | TimelineDirector | PhaseScrubber;
  export type HookState = SpacetimeClockState | TimelineDirectorState | PhaseScrubberState | { t: number };
  export type HookStage = Partial<IsometricStage> & { profile?: Profile };
  export type ExportOptions = { hud?: string; width?: number | null; height?: number | null; dpr?: number; muteAudio?: boolean };
  export type LegacyFalsifyReport = { passed: boolean; assertions?: {
    name: string; passed: boolean; detail?: string; baseMetric?: number; mutantMetric?: number;
  }[] };
  export interface TestHookOptions<P extends object = Record<string, unknown>, S = unknown> {
    version?: number;
    profile?: Profile | "narrative-3d";
    clock?: SpacetimeClock | null;
    director?: TimelineDirector | null;
    scrubber?: PhaseScrubber | null;
    stage?: HookStage | null;
    choreographer?: ActorChoreographer | null;
    model?: SimModel<P, S> | null;
    falsify?(): FalsifyReport | LegacyFalsifyReport;
    syncAll?(t?: number): void;
    onSeek?(t: number, snapshot: HookState | null): void;
    setParams?(patch: Partial<P>): unknown;
    [extra: string]: unknown;
  }
  export interface TestHooks<P extends object = Record<string, unknown>, S = unknown> {
    version: number;
    profile: Profile | null;
    stage: HookStage | null;
    model: SimModel<P, S> | null;
    clock: SpacetimeClock | null;
    director: TimelineDirector | null;
    scrubber: PhaseScrubber | null;
    choreographer: ActorChoreographer | null;
    falsify?(): FalsifyReport | LegacyFalsifyReport;
    setParams?(patch: Partial<P>): unknown;
    setLang?(lang: string): unknown;
    seek(t: number, opts?: { forceCamera?: boolean }): HookState | Promise<HookState>;
    getProfile(): Profile | null;
    getTimelineInfo(): SpacetimeClockTimelineInfo | TimelineDirectorTimelineInfo | {
      mode: "static" | "scrubber"; duration: number; defaultFps: number; stages: TimelineDirectorTimelineInfo["stages"];
    };
    enterExportMode(opts?: ExportOptions): { ok: true; hud: string; width: number | null; height: number | null; dpr: number };
    exitExportMode(): { ok: true };
    getCaptureTargets(): {
      rootEl: Element | null;
      stageCanvas: HTMLCanvasElement | null;
      overlayEls: Element[];
      stage: HookStage | null;
      callouts: import("*/callout-layer.js").CalloutLayer | null;
      renderNow(): boolean | undefined;
    };
    getCaptionState(): {
      stageIndex: number; stageCount: number; stageTitle: string; stepTitle: string;
      caption: string; carries: string; hook: string; progress: number; t: number;
      duration: number; liveEqText: string;
    };
    getActiveActorCount(t?: number): number | null;
    getMotionMagnitude(t0: number, t1: number): number | null;
    getGeometryAudit(): ReturnType<IsometricStage["getGeometryAudit"]> | null;
    setCardinalView(viewName?: CardinalView, opts?: Parameters<IsometricStage["setCardinalView"]>[1]): ReturnType<IsometricStage["setCardinalView"]> | null;
    getFontAudit(): {
      supported: boolean; status: string; totalCount: number; loadedCount: number; failedCount: number;
      families: string[]; loadedFamilies: string[];
      faces: { family: string; weight: string; style: string; status: string }[];
    };
  }
  /** With both controllers present, the clock supplies playback and seek. */
  export function exposeTestHooks<P extends object, S, E extends TestHookOptions<P, S> = TestHookOptions<P, S>>(options: E & TestHookOptions<P, S>): TestHooks<P, S> & Omit<E, keyof TestHooks<P, S>>;
  export function exposeTestHooks<P extends object, S, E extends TestHookOptions<P, S> = TestHookOptions<P, S>>(controller: HookController | null, extra?: E & TestHookOptions<P, S>): TestHooks<P, S> & Omit<E, keyof TestHooks<P, S>>;
  export function easeLinear(u: number): number;
  export const VALID_PROFILES: readonly ["mechanical-3d", "field-math", "sandbox-direct"];
  export function easeOutCubic(u: any): number;
  export function easeInOutCubic(u: any): number;
  export class TrackTimeline {
    tracks: any[];
    duration: number;
    add(at: number, dur: number, update: (eased: number, raw: number) => void, { begin, ease, fx }?: {
      begin?: () => void;
      ease?: (u: number) => number;
      fx?: boolean;
    }): this;
    call(at: number, fn: () => void, { fx }?: {
      fx?: boolean;
    }): this;
    seek(t: number): void;
    finish(): void;
    #private;
  }
  export class TimelineDirector {
    constructor({ stages, ctx, onReset, onStageCamera, onStepChange, speed, autoAdvance, defaultFps, }?: {
      stages: Array<{
        id: string;
        title: string;
        camera?: any;
        summary?: string;
        steps: Array<{
          id: string;
          title: string;
          duration?: number;
          run: (tl: TrackTimeline, ctx: any) => void;
        }>;
      }>;
      ctx?: any;
      onReset?: (ctx: any) => void;
      onStageCamera?: (camera: any, stageMeta: {
        stageIndex: number;
        stageId: string;
        stageTitle: string;
      }) => void;
      onStepChange?: (state: any) => void;
      speed?: number;
      autoAdvance?: boolean;
      defaultFps?: number;
    });
    stages: {
      id: string;
      title: string;
      camera?: any;
      summary?: string;
      steps: Array<{
        id: string;
        title: string;
        duration?: number;
        run: (tl: TrackTimeline, ctx: any) => void;
      }>;
    }[];
    ctx: any;
    onReset: (ctx: any) => void;
    onStageCamera: (camera: any, stageMeta: {
      stageIndex: number;
      stageId: string;
      stageTitle: string;
    }) => void;
    onStepChange: (state: any) => void;
    speed: number;
    autoAdvance: boolean;
    defaultFps: number;
    manualMode: boolean;
    flatSteps: any[];
    stageStarts: any[];
    index: any;
    lastCameraStage: number;
    tl: TrackTimeline;
    t: number;
    playing: boolean;
    complete: boolean;
    getGlobalDuration(): number;
    getGlobalTime(): number;
    getTimelineInfo(): TimelineDirectorTimelineInfo;
    seekGlobal(globalTimeSec: any, { emitCamera }?: {
      emitCamera?: boolean;
    }): any;
    setManualMode(enabled: any): boolean;
    jump(stepIndex: number, { play, emitCamera }?: {
      play?: boolean;
      emitCamera?: boolean;
    }): any;
    jumpStage(stageIdOrIndex: number | string, opts?: {
      play?: boolean;
      emitCamera?: boolean;
    }): any;
    seekTo(localTime: number): any;
    showEnd(stepIndex?: number): any;
    tick(dt: number): boolean;
    play(): any;
    pause(): any;
    toggle(): any;
    setSpeed(mult: any): number;
    nextStep({ play }?: {
      play?: boolean;
    }): any;
    prevStep({ play }?: {
      play?: boolean;
    }): any;
    nextStage({ play }?: {
      play?: boolean;
    }): any;
    prevStage({ play }?: {
      play?: boolean;
    }): any;
    getState(): TimelineDirectorState;
    subscribe(fn: any): () => void;
    destroy(): void;
    #private;
  }
  export class PhaseScrubber {
    constructor({ duration, loop, speed, steadyTime, playing, onEvaluate, }?: {
      duration?: number;
      loop?: boolean;
      speed?: number;
      steadyTime?: any;
      playing?: boolean;
      onEvaluate?: any;
    });
    duration: number;
    loop: boolean;
    speed: number;
    steadyTime: number;
    playing: boolean;
    onEvaluate: any;
    t: number;
    play(): void;
    pause(): void;
    freeze(): void;
    toggle(): void;
    setSpeed(mult: any): void;
    scrub(t: any): PhaseScrubberState;
    scrubNorm(u: any): PhaseScrubberState;
    jumpToSteady(): PhaseScrubberState;
    reset(): PhaseScrubberState;
    tick(dt: any): boolean;
    getState(): PhaseScrubberState;
    subscribe(fn: any): () => void;
    #private;
  }
}

declare module "*/toolbar-a11y.js" {
  export function initToolbars(root?: Document): void;
}
