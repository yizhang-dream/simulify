/**
 * Unified Offline Four-Tier Typography & Crisp Canvas 2D Texture Utilities.
 *
 * Bridges CSS `@font-face` assets (`kit/fonts/fonts.css`) with DOM, SVG, and
 * Three.js / Canvas 2D rendering so every Simulify scene shares identical
 * publication-grade typography across Windows, macOS, and Linux — 100% offline.
 */

export const FONT_STACKS = Object.freeze({
  display:
    '"Newsreader", "Simulify Display SC", "Source Han Serif SC", "Noto Serif SC", "Songti SC", "STSong", Georgia, serif',
  sans:
    '"Inter", "Simulify Sans SC", "HarmonyOS Sans SC", "MiSans", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif',
  math:
    '"KaTeX_Main", "KaTeX_Size1", "KaTeX_Math", "Inter", "Simulify Sans SC", "Cambria Math", "STIX Two Math", serif',
  mathItalic:
    '"KaTeX_Math", "KaTeX_Main", "Inter", "Simulify Sans SC", serif',
  mono:
    '"JetBrains Mono", "Simulify Sans SC", "HarmonyOS Sans SC", "MiSans", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", ui-monospace, monospace',
});

const ROLE_CSS_VAR = Object.freeze({
  display: '--font-display',
  sans: '--font-sans',
  math: '--font-math',
  mono: '--font-mono',
});

const CJK_FALLBACK_SUFFIX =
  '"Simulify Sans SC", "HarmonyOS Sans SC", "MiSans", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI"';

const PRELOAD_SPECIFIERS = Object.freeze([
  ['400 16px "Inter"', 'Aa01'],
  ['600 16px "Inter"', 'Aa01'],
  ['700 16px "Inter"', 'Aa01'],
  ['400 16px "Simulify Sans SC"', '中文字体'],
  ['600 16px "Simulify Sans SC"', '中文字体'],
  ['700 20px "Newsreader"', 'Simulify'],
  ['700 20px "Simulify Display SC"', '原理图解'],
  ['400 14px "JetBrains Mono"', '0123+-=αδ'],
  ['500 14px "JetBrains Mono"', '0123+-=αδ'],
  ['600 14px "JetBrains Mono"', '0123+-=αδ'],
  ['700 14px "JetBrains Mono"', '0123+-=αδ'],
  ['400 16px "KaTeX_Main"', '0123V(S)+='],
  ['italic 400 16px "KaTeX_Math"', 'VSQRαγδε'],
  ['400 16px "KaTeX_Size1"', '∑∏∫'],
]);

let _fontsSettled = false;
let _fontsReadyPromise = null;
const _readyListeners = new Set();

function normalizeRole(role) {
  if (!role) return 'sans';
  const key = String(role).trim();
  if (key === 'math-italic' || key === 'mathItalic') return 'mathItalic';
  if (key in FONT_STACKS) return key;
  return 'sans';
}

function ensureCjkFallback(stack) {
  if (/(Simulify\s+(Sans|Display)\s+SC|Noto\s+(Sans|Serif)\s+SC|Source\s+Han|HarmonyOS|MiSans|PingFang|YaHei)/i.test(stack)) {
    return stack;
  }
  return `${stack}, ${CJK_FALLBACK_SUFFIX}`;
}

/**
 * Resolve the effective CSS font-family stack for a typography role.
 * Reads live CSS custom properties on `:root` when available so theme overrides
 * stay synchronized between DOM, SVG, and Canvas 2D.
 *
 * @param {'display' | 'sans' | 'math' | 'mathItalic' | 'mono'} [role='sans']
 * @returns {string}
 */
export function getFontStack(role = 'sans') {
  const norm = normalizeRole(role);
  if (norm === 'mathItalic') {
    return FONT_STACKS.mathItalic;
  }
  const cssVar = ROLE_CSS_VAR[norm];
  if (
    cssVar &&
    typeof document !== 'undefined' &&
    typeof getComputedStyle === 'function' &&
    document.documentElement
  ) {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      if (value) {
        return norm === 'mono' || norm === 'sans' ? ensureCjkFallback(value) : value;
      }
    } catch {
      // Fallback to static offline stacks when styles are unavailable
    }
  }
  return FONT_STACKS[norm];
}

/**
 * Build a complete Canvas 2D `ctx.font` string for one of Simulify's four font tiers.
 * Automatically appends offline CJK fallback chains for `'mono'` and `'sans'` so mixed
 * Latin/numeric/Chinese labels (e.g. `"+10 终点"`, `"起点 (2,0)"`) never fall back to
 * mismatched Latin-only monospace or legacy system fonts.
 *
 * @param {'display' | 'sans' | 'math' | 'mathItalic' | 'mono'} [role='sans']
 * @param {number | string} [px=14]
 * @param {number | string} [weight=500]
 * @param {'normal' | 'italic' | 'oblique'} [style]
 * @returns {string}
 */
export function canvasFont(role = 'sans', px = 14, weight = 500, style) {
  const norm = normalizeRole(role);
  const fontStyle = style || (norm === 'mathItalic' ? 'italic' : 'normal');
  const sizeStr = typeof px === 'number' ? `${px}px` : String(px || '14px');
  const weightStr = weight === undefined || weight === null ? '500' : String(weight);
  const stack = getFontStack(norm);
  return `${fontStyle} ${weightStr} ${sizeStr} ${stack}`;
}

/**
 * Wait for Simulify's offline `@font-face` library (`document.fonts.ready` plus
 * proactive Canvas 2D face warmup) with a bounded timeout, and optionally invoke
 * a callback once fonts are settled.
 *
 * Safe in Node / headless / non-DOM environments (resolves immediately).
 *
 * @param {number} [timeoutMs=2500]
 * @param {(result: { loaded: boolean, timedOut: boolean, status: string }) => void} [onReady]
 * @returns {Promise<{ loaded: boolean, timedOut: boolean, status: string }>}
 */
export function waitForFonts(timeoutMs = 2500, onReady = null) {
  const emit = (result) => {
    if (typeof onReady === 'function') {
      try {
        onReady(result);
      } catch {
        // Isolate user callback errors
      }
    }
    return result;
  };

  if (typeof document === 'undefined' || !document.fonts || !document.fonts.ready) {
    _fontsSettled = true;
    return Promise.resolve(emit({ loaded: false, timedOut: false, status: 'unavailable' }));
  }

  if (_fontsSettled && _fontsReadyPromise) {
    return _fontsReadyPromise.then(emit);
  }

  if (!_fontsReadyPromise) {
    const loadTasks = [];
    if (typeof document.fonts.load === 'function') {
      for (const [spec, sample] of PRELOAD_SPECIFIERS) {
        try {
          loadTasks.push(Promise.resolve(document.fonts.load(spec, sample)).catch(() => []));
        } catch {
          // Ignore malformed/unsupported font specs
        }
      }
    }

    const readyAll = Promise.all([
      Promise.resolve(document.fonts.ready).catch(() => null),
      Promise.allSettled(loadTasks),
    ]).then(() => ({ loaded: true, timedOut: false, status: 'loaded' }));

    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 2500;
    let timerId = null;
    const timeoutPromise = new Promise((resolve) => {
      timerId = setTimeout(() => {
        resolve({ loaded: false, timedOut: true, status: 'timeout' });
      }, ms);
      if (timerId && typeof timerId.unref === 'function') {
        timerId.unref();
      }
    });

    _fontsReadyPromise = Promise.race([readyAll, timeoutPromise]).then((res) => {
      if (timerId !== null) clearTimeout(timerId);
      _fontsSettled = true;
      for (const listener of Array.from(_readyListeners)) {
        try {
          listener(res);
        } catch {
          // Isolate listener errors
        }
      }
      _readyListeners.clear();
      return res;
    });
  }

  return _fontsReadyPromise.then(emit);
}

/**
 * Subscribe a one-shot callback to run as soon as fonts are ready.
 * Returns an unsubscribe function.
 *
 * @param {(result: { loaded: boolean, timedOut: boolean, status: string }) => void} callback
 * @param {number} [timeoutMs=2500]
 * @returns {() => void}
 */
export function onFontsReady(callback, timeoutMs = 2500) {
  if (typeof callback !== 'function') return () => {};
  if (_fontsSettled && _fontsReadyPromise) {
    _fontsReadyPromise.then((res) => {
      try {
        callback(res);
      } catch {
        // Ignore callback error
      }
    });
    return () => {};
  }
  _readyListeners.add(callback);
  waitForFonts(timeoutMs);
  return () => {
    _readyListeners.delete(callback);
  };
}

/**
 * Whether `waitForFonts()` has already settled.
 * @returns {boolean}
 */
export function areFontsReady() {
  return _fontsSettled;
}

/**
 * Create a high-resolution, crisp Three.js `CanvasTexture` configured with
 * sRGB color space, mipmaps, and high anisotropic filtering (default 16x).
 *
 * Immediately paints frame 0 synchronously, and automatically triggers one
 * clean `redraw()` after `document.fonts.ready` settles so 3D plaques, gauges,
 * tiles, and callout badges never stay stuck on fallback system fonts.
 *
 * Returns the `THREE.CanvasTexture` instance augmented with `.redraw()`,
 * `.resize(w, h)`, `.canvas`, `.ctx`, `.ready`, and `.texture` (self-alias)
 * so both `mat.map = createCrispCanvasTexture(...)` and destructuring
 * `const { texture, redraw } = createCrispCanvasTexture(...)` work seamlessly.
 *
 * @param {typeof import('three')} THREE
 * @param {{
 *   width?: number,
 *   height?: number,
 *   draw: (ctx: CanvasRenderingContext2D, width: number, height: number, meta: {
 *     canvas: HTMLCanvasElement,
 *     texture: import('three').CanvasTexture,
 *     canvasFont: typeof canvasFont,
 *     fontsReady: boolean,
 *     state?: any,
 *   }) => void,
 *   anisotropy?: number,
 *   srgb?: boolean,
 *   mipmaps?: boolean,
 *   flipY?: boolean,
 *   onRedraw?: ((texture: import('three').CanvasTexture) => void) | null,
 *   fontTimeoutMs?: number,
 * }} options
 */
export function createCrispCanvasTexture(
  THREE,
  {
    width = 512,
    height = 512,
    draw,
    anisotropy = 16,
    srgb = true,
    mipmaps = true,
    flipY = true,
    onRedraw = null,
    fontTimeoutMs = 2500,
  } = {}
) {
  if (!THREE || typeof THREE.CanvasTexture !== 'function') {
    throw new Error('createCrispCanvasTexture requires a valid THREE module with CanvasTexture.');
  }
  if (typeof draw !== 'function') {
    throw new Error('createCrispCanvasTexture requires a draw(ctx, width, height, meta) callback.');
  }

  let curWidth = Math.max(1, Math.round(width));
  let curHeight = Math.max(1, Math.round(height));

  const canvas =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : { width: curWidth, height: curHeight, getContext: () => null };
  canvas.width = curWidth;
  canvas.height = curHeight;

  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  const texture = new THREE.CanvasTexture(canvas);

  if (srgb && 'SRGBColorSpace' in THREE) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.anisotropy = Math.max(1, Number(anisotropy) || 16);
  texture.generateMipmaps = Boolean(mipmaps);
  if ('LinearMipmapLinearFilter' in THREE && 'LinearFilter' in THREE) {
    texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  texture.flipY = Boolean(flipY);

  let disposed = false;
  let lastState = undefined;

  const paint = (fontsReady, state) => {
    if (disposed) return texture;
    if (state !== undefined) lastState = state;
    if (ctx) {
      if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, curWidth, curHeight);
      if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      draw(ctx, curWidth, curHeight, {
        canvas,
        texture,
        canvasFont,
        fontsReady,
        state: lastState,
      });
    }
    texture.needsUpdate = true;
    if (typeof onRedraw === 'function') {
      try {
        onRedraw(texture);
      } catch {
        // Ignore onRedraw callback errors
      }
    }
    return texture;
  };

  const redraw = (state) => paint(_fontsSettled, state);

  const resize = (nextWidth, nextHeight, state) => {
    if (disposed) return texture;
    curWidth = Math.max(1, Math.round(nextWidth));
    curHeight = Math.max(1, Math.round(nextHeight));
    canvas.width = curWidth;
    canvas.height = curHeight;
    return paint(_fontsSettled, state);
  };

  // Synchronous initial paint so frame 0 is never blank
  const initiallySettled = _fontsSettled;
  paint(initiallySettled, undefined);

  // Automatic one-shot redraw once offline @font-face library finishes loading
  const ready = initiallySettled
    ? Promise.resolve({ loaded: true, timedOut: false, status: 'loaded' })
    : waitForFonts(fontTimeoutMs).then((res) => {
        if (!disposed) {
          paint(true, undefined);
        }
        return res;
      });

  const origDispose = typeof texture.dispose === 'function' ? texture.dispose.bind(texture) : null;
  texture.dispose = () => {
    disposed = true;
    if (origDispose) origDispose();
  };

  texture.texture = texture;
  texture.canvas = canvas;
  texture.ctx = ctx;
  texture.redraw = redraw;
  texture.resize = resize;
  texture.ready = ready;

  return texture;
}
