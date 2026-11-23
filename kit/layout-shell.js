/**
 * Simulify v2.2 Multi-Archetype Layout & Viewport Chrome Controllers (`kit/layout-shell.js`).
 *
 * Zero-dependency helpers powering:
 * - `WipeCompareController`: draggable + keyboard-accessible A/B wipe curtain (`ab-compare`)
 * - `mountViewCube`: compact 3D orientation / Front-Side-Top-Iso switcher & camera-lock badge
 * - `mountScaleBar`: live world-unit physical scale bar synced to orthographic/perspective zoom
 * - `toggleZenMode`: one-click immersion deck mode (`data-zen="true"`) on any layout archetype
 * - `ICONS`: crisp 1.5px stroke technical inline SVG icons matching 1-ring engineering ink
 */

const clamp01 = (u) => Math.max(0, Math.min(1, Number(u) || 0));

export const LAYOUT_ARCHETYPES = Object.freeze([
  'fullbleed-hud',
  'split-bench',
  'ab-compare',
]);

export const THEME_PRESETS = Object.freeze([
  'paper-ink',
  'dark-studio',
  'bio-cutaway',
  'blueprint',
  'monochrome-print',
  'obsidian-gallery',
]);

export const ICONS = Object.freeze({
  play: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 2.8v10.4L13 8 4 2.8z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3" width="3.2" height="10" rx="0.8"/><rect x="9.3" y="3" width="3.2" height="10" rx="0.8"/></svg>',
  reset: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.4-3.5L3 6"/><path d="M3 2.5V6h3.5"/></svg>',
  cutaway: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 11.5 11.5 2.5M6.5 13.5l7-7"/></svg>',
  explode: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6 2.5 2.5m0 0H5m-2.5 0V5M10 6l3.5-3.5m0 0H11m2.5 0V5M6 10l-3.5 3.5m0 0H5m-2.5 0V11M10 10l3.5 3.5m0 0H11m2.5 0V11"/></svg>',
  xray: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke-dasharray="2.5 2"/><circle cx="8" cy="8" r="2.2"/></svg>',
  zen: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
  cube: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5L8 1.8z"/><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6"/></svg>',
  lock: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>',
});

/**
 * Toggle Zen / Immersion Deck mode (`data-zen="true"`) on a Simulify shell element.
 * @param {HTMLElement} shellEl
 * @param {boolean} [force]
 * @returns {boolean} Active Zen state
 */
export function toggleZenMode(shellEl, force) {
  if (!shellEl || !shellEl.dataset) return false;
  const next = force === undefined ? shellEl.dataset.zen !== 'true' : Boolean(force);
  if (next) {
    shellEl.dataset.zen = 'true';
  } else {
    delete shellEl.dataset.zen;
  }
  return next;
}

/**
 * Apply layout archetype and optional theme onto the document / shell cleanly.
 * @param {HTMLElement} shellEl
 * @param {{ layout?: string, theme?: string, split?: 'left'|'right'|'bottom', stage?: any }} [opts]
 */
export function setShellPresentation(shellEl, { layout, theme, split, stage } = {}) {
  if (shellEl?.dataset) {
    if (layout && LAYOUT_ARCHETYPES.includes(layout)) {
      shellEl.dataset.layout = layout;
    }
    if (split) {
      shellEl.dataset.split = split;
    }
  }
  if (theme && THEME_PRESETS.includes(theme) && typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
    stage?.setTheme?.(theme);
  }
  stage?.resize?.(true);
}

/**
 * Interactive pointer & keyboard wipe curtain controller for `data-layout="ab-compare"`.
 */
export class WipeCompareController {
  /**
   * @param {HTMLElement} shellEl Container with `.ab-wipe-shell`
   * @param {{ initial?: number, min?: number, max?: number, onChange?: ((pct: number) => void) | null }} [opts]
   */
  constructor(shellEl, { initial = 0.5, min = 0.08, max = 0.92, onChange = null } = {}) {
    if (!shellEl) throw new Error('WipeCompareController requires a container element.');
    this.shellEl = shellEl;
    this.min = clamp01(min);
    this.max = Math.max(this.min, clamp01(max));
    this.value = this.#clamp(initial);
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this._dragging = false;

    this.dividerEl = document.createElement('div');
    this.dividerEl.className = 'ab-wipe-divider';
    this.dividerEl.setAttribute('role', 'slider');
    this.dividerEl.setAttribute('aria-label', '对比滑帘位置');
    this.dividerEl.setAttribute('aria-valuemin', String(Math.round(this.min * 100)));
    this.dividerEl.setAttribute('aria-valuemax', String(Math.round(this.max * 100)));
    this.dividerEl.tabIndex = 0;

    const handle = document.createElement('span');
    handle.className = 'ab-wipe-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '⇄';
    this.dividerEl.append(handle);
    this.shellEl.append(this.dividerEl);

    this._onDown = (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this.dividerEl.setPointerCapture?.(e.pointerId);
      this.#setFromClientX(e.clientX);
    };
    this._onMove = (e) => {
      if (!this._dragging) return;
      this.#setFromClientX(e.clientX);
    };
    this._onUp = (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      this.dividerEl.releasePointerCapture?.(e.pointerId);
    };
    this._onKey = (e) => {
      const step = e.shiftKey ? 0.1 : 0.03;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.setFraction(this.value - step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.setFraction(this.value + step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.setFraction(this.min);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.setFraction(this.max);
      }
    };

    this.dividerEl.addEventListener('pointerdown', this._onDown);
    this.dividerEl.addEventListener('pointermove', this._onMove);
    this.dividerEl.addEventListener('pointerup', this._onUp);
    this.dividerEl.addEventListener('pointercancel', this._onUp);
    this.dividerEl.addEventListener('keydown', this._onKey);

    this.setFraction(this.value);
  }

  #clamp(v) {
    return Math.max(this.min, Math.min(this.max, Number(v) || 0.5));
  }

  #setFromClientX(clientX) {
    const rect = this.shellEl.getBoundingClientRect?.();
    if (!rect || !rect.width) return;
    this.setFraction((clientX - rect.left) / rect.width);
  }

  setFraction(frac) {
    this.value = this.#clamp(frac);
    const pct = +(this.value * 100).toFixed(2);
    this.shellEl.style?.setProperty?.('--wipe', `${pct}%`);
    this.dividerEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (this.onChange) this.onChange(this.value);
    return this.value;
  }

  dispose() {
    this.dividerEl.removeEventListener('pointerdown', this._onDown);
    this.dividerEl.removeEventListener('pointermove', this._onMove);
    this.dividerEl.removeEventListener('pointerup', this._onUp);
    this.dividerEl.removeEventListener('pointercancel', this._onUp);
    this.dividerEl.removeEventListener('keydown', this._onKey);
    this.dividerEl.remove();
  }
}

/**
 * Mount a compact 3D Orientation / Cardinal ViewCube + Camera-Lock indicator onto a stage container.
 * Clicking Front / Side / Top / Iso calls `stage.setCardinalView()`, and clicking the lock pill
 * unlocks user camera ownership so choreography resumes smoothly.
 *
 * @param {HTMLElement} containerEl
 * @param {import('./stage-3d.js').IsometricStage} stage
 * @param {{ lang?: 'zh'|'en', showAngles?: boolean, zenShell?: HTMLElement | null }} [opts]
 */
export function mountViewCube(containerEl, stage, { lang = 'zh', showAngles = true, zenShell = null } = {}) {
  if (!containerEl || !stage) {
    throw new Error('mountViewCube requires both containerEl and stage.');
  }

  const labels = lang === 'en'
    ? { iso: 'ISO', front: 'Front', side: 'Side', top: 'Top', lock: 'Manual View · Resume Auto', zen: 'Zen' }
    : { iso: '等轴', front: '正视', side: '侧视', top: '俯视', lock: '手动视角 · 恢复导演', zen: '沉浸' };

  const dock = document.createElement('div');
  dock.className = 'view-cube-dock';
  dock.dataset.exportRole = 'chrome';

  const grid = document.createElement('div');
  grid.className = 'view-cube-grid';
  grid.setAttribute('role', 'toolbar');
  grid.setAttribute('aria-label', lang === 'en' ? '3D View Orientation' : '三维标准视角');

  const viewDefs = [
    ['iso', labels.iso],
    ['front', labels.front],
    ['side', labels.side],
    ['top', labels.top],
  ];
  const buttons = new Map();

  for (const [viewKey, text] of viewDefs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'view-cube-btn';
    btn.dataset.view = viewKey;
    btn.textContent = text;
    btn.setAttribute('aria-pressed', viewKey === 'iso' ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (viewKey === 'iso') {
        stage.resetView?.();
      } else {
        stage.setCardinalView?.(viewKey, { unlock: false });
      }
      sync(stage.getCameraState?.());
    });
    buttons.set(viewKey, btn);
    grid.append(btn);
  }

  let zenBtn = null;
  if (zenShell) {
    zenBtn = document.createElement('button');
    zenBtn.type = 'button';
    zenBtn.className = 'view-cube-btn';
    zenBtn.innerHTML = ICONS.zen;
    zenBtn.setAttribute('aria-label', labels.zen);
    zenBtn.setAttribute('aria-pressed', 'false');
    zenBtn.addEventListener('click', () => {
      const on = toggleZenMode(zenShell);
      zenBtn.setAttribute('aria-pressed', String(on));
      stage.resize?.(true);
    });
    grid.append(zenBtn);
  }

  const angleEl = document.createElement('span');
  angleEl.className = 'view-cube-angles';
  angleEl.hidden = !showAngles;
  if (showAngles) grid.append(angleEl);

  const lockPill = document.createElement('button');
  lockPill.type = 'button';
  lockPill.className = 'camera-lock-pill';
  lockPill.hidden = true;
  lockPill.innerHTML = `${ICONS.lock}<span>${labels.lock}</span>`;
  lockPill.addEventListener('click', () => {
    stage.unlockUserCamera?.();
    stage.resetView?.();
    sync(stage.getCameraState?.());
  });

  dock.append(grid, lockPill);
  containerEl.append(dock);

  const sync = (cam) => {
    if (!cam) return;
    if (showAngles) {
      angleEl.textContent = `${Math.round(cam.azimuthDeg)}° / ${Math.round(cam.elevationDeg)}°`;
    }
    const locked = Boolean(cam.userCameraLocked);
    lockPill.hidden = !locked;

    let activeView = 'iso';
    if (Math.abs(cam.elevationDeg) < 3 && Math.abs(cam.azimuthDeg % 360) < 3) activeView = 'front';
    else if (Math.abs(cam.elevationDeg) < 3 && Math.abs(Math.abs(cam.azimuthDeg) - 90) < 3) activeView = 'side';
    else if (cam.elevationDeg >= 82) activeView = 'top';

    for (const [k, b] of buttons.entries()) {
      b.setAttribute('aria-pressed', String(k === activeView));
    }
  };

  const prevOnView = stage._onViewChange;
  const wrappedOnView = (cam) => {
    prevOnView?.(cam);
    sync(cam);
  };
  stage._onViewChange = wrappedOnView;
  sync(stage.getCameraState?.());

  return {
    root: dock,
    sync,
    unmount() {
      if (stage._onViewChange === wrappedOnView) {
        stage._onViewChange = prevOnView || null;
      }
      dock.remove();
    },
  };
}

/**
 * Mount a live physical scale bar synced to the 3D stage's zoom and world unit scale.
 * @param {HTMLElement} containerEl
 * @param {import('./stage-3d.js').IsometricStage} stage
 * @param {{ worldUnitsPerMeter?: number, unitScale?: number, unitLabel?: string, niceSteps?: number[] }} [opts]
 */
export function mountScaleBar(
  containerEl,
  stage,
  { worldUnitsPerMeter = 1, unitScale = 1 / worldUnitsPerMeter, unitLabel = 'm',
    niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50] } = {}
) {
  if (!containerEl || !stage) {
    throw new Error('mountScaleBar requires containerEl and stage.');
  }

  const root = document.createElement('div');
  root.className = 'scale-bar';
  root.dataset.exportRole = 'callout';

  const rule = document.createElement('div');
  rule.className = 'scale-bar-rule';
  const label = document.createElement('span');
  label.className = 'scale-bar-label';

  root.append(rule, label);
  containerEl.append(root);

  const sync = () => {
    const h = Math.max(160, stage.size?.height || 600);
    const zoom = Math.max(0.2, stage.view?.zoom || 1);
    const camera = stage.camera;
    const spanWorld =
      stage.cameraType === 'perspective'
        ? 2 * ((stage.view?.distance || stage.distance || 16) / zoom) * Math.tan(((camera?.fov ?? stage.fov ?? 36) * Math.PI) / 360)
        : camera?.isOrthographicCamera ? camera.top - camera.bottom : (stage.baseSpan || 11.5) / zoom;
    const pxPerWorldUnit = h / Math.max(1e-4, spanWorld);
    const targetPx = 84;
    const rawWorld = targetPx / Math.max(1, pxPerWorldUnit);
    const rawPhysical = rawWorld * unitScale;

    let best = niceSteps[0];
    let bestErr = Infinity;
    for (const s of niceSteps) {
      const err = Math.abs(s - rawPhysical);
      if (err < bestErr) {
        bestErr = err;
        best = s;
      }
    }
    const barPx = Math.round((best / unitScale) * pxPerWorldUnit);
    rule.style.width = `${barPx}px`;
    label.textContent = `${best} ${unitLabel}`;
    return { barPx, value: best, unitLabel };
  };

  const prevOnView = stage._onViewChange;
  const wrappedOnView = (cam) => {
    prevOnView?.(cam);
    sync();
  };
  stage._onViewChange = wrappedOnView;
  sync();

  return {
    root,
    sync,
    unmount() {
      if (stage._onViewChange === wrappedOnView) {
        stage._onViewChange = prevOnView || null;
      }
      root.remove();
    },
  };
}
