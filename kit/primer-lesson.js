/**
 * Simulify Primer Lesson Shell (`kit/primer-lesson.js`).
 *
 * Dilum Primers-inspired guided isometric course UI supporting:
 * - Dual-level progression: bottom horizontal stage cards + right floating Steps / Explain / Tips card
 * - Two pedagogical modes: `steps` (auto-playing/self-paced walkthrough) and `explore` (interactive identification)
 * - Left collapsible dark rail + multi-lesson filterable catalog modal
 * - Top compact camera orbit (`-45°` / reset / `+45°`), playback (`replay` / `play-pause` / `1x..2x`), and progress pill
 * - Thematic SVG diorama backdrops (`topo` | `iso-grid` | `paper`)
 * - Crisp single-focus 3D callout pins (dark pill + thin white leader + target ring)
 * - Direct compatibility with `exposeTestHooks({ profile: 'primer-lesson', stage, lessonShell })`
 */

import * as THREE from 'three';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEX_HINT_RE = /\$|\\\(|\\\[/;
const SPEEDS = [1, 1.5, 2];
let mathModulePromise = null;

const UI_ICONS = Object.freeze({
  chevronRight: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
  chevronLeft: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8 10 12.5"/></svg>',
  chevronDown: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>',
  home: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.2 10 3.8l6.5 5.4V16a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V9.2Z"/><path d="M8 17v-5h4v5"/></svg>',
  book: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.2A2.2 2.2 0 0 1 5.7 3H10v13.5H5.7a2.2 2.2 0 0 0-2.2 2V5.2Z"/><path d="M16.5 5.2A2.2 2.2 0 0 0 14.3 3H10v13.5h4.3a2.2 2.2 0 0 1 2.2 2V5.2Z"/></svg>',
  compass: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.2"/><polygon points="12.8 7.2 11.2 11.2 7.2 12.8 8.8 8.8 12.8 7.2" fill="currentColor" stroke="none"/></svg>',
  rotateLeft: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.2A5 5 0 1 1 3.5 10"/><path d="M4.2 3.2v3.3h3.3"/></svg>',
  rotateRight: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 6.2A5 5 0 1 0 12.5 10"/><path d="M11.8 3.2v3.3H8.5"/></svg>',
  replay: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3.5v9"/><path d="M12.5 4.2 6.8 8l5.7 3.8V4.2Z" fill="currentColor" stroke="none"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4.5 3v10L13 8 4.5 3Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="3.5" y="3" width="3.2" height="10" rx="0.9"/><rect x="9.3" y="3" width="3.2" height="10" rx="0.9"/></svg>',
  expand: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
  close: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  grid: '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5.5" height="5.5" rx="1.2"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2"/><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2"/></svg>',
  defaultEmblem: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/><path d="M12 12 20 7.5M12 12 4 7.5M12 12v9"/></svg>',
});

function setRichText(el, text) {
  const str = String(text ?? '');
  if (typeof document !== 'undefined' && str.includes('**')) {
    el.replaceChildren();
    for (const part of str.split(/(\*\*[^*]+\*\*)/g)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        el.append(strong);
      } else {
        el.append(document.createTextNode(part));
      }
    }
  } else {
    el.textContent = str;
  }
  if (str && TEX_HINT_RE.test(str) && typeof document !== 'undefined') {
    mathModulePromise ||= import('./live-maths.js').catch(() => null);
    mathModulePromise.then((mod) => {
      if (mod?.renderMathInElement && el.isConnected !== false) {
        try {
          mod.renderMathInElement(el);
        } catch {
          // Keep plain text when KaTeX is unavailable
        }
      }
    });
  }
}

function el(tag, className = '', attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') node.textContent = String(v);
    else if (k === 'svg') node.innerHTML = String(v);
    else node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * Generate a lightweight thematic SVG backdrop (`topo` | `iso-grid` | `paper`).
 * Pure vector data-driven background giving a tactile tabletop diorama feel.
 */
export function buildBackdropSvg(kind = 'iso-grid') {
  if (kind === 'paper') return '';
  if (kind === 'topo') {
    return `<svg class="pl-backdrop-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="pl-iso-subtle" width="56" height="32.33" patternUnits="userSpaceOnUse">
          <path d="M0 16.16 28 0 56 16.16 28 32.33Z" fill="none" stroke="#c8bc9f" stroke-opacity="0.28" stroke-width="0.9"/>
        </pattern>
      </defs>
      <rect width="1200" height="800" fill="url(#pl-iso-subtle)"/>
      <g fill="none" stroke="#c6b99c" stroke-opacity="0.46" stroke-width="1.35">
        <path d="M-40 160 C 120 90, 260 220, 410 140 S 700 80, 920 170 S 1140 120, 1260 180"/>
        <path d="M-40 230 C 140 170, 280 290, 440 210 S 740 150, 940 245 S 1140 195, 1260 250"/>
        <path d="M-40 520 C 160 440, 290 610, 490 540 S 780 460, 990 560 S 1150 510, 1260 580"/>
        <path d="M-40 610 C 170 540, 320 690, 520 630 S 820 550, 1020 650 S 1160 600, 1260 670"/>
        <ellipse cx="190" cy="145" rx="115" ry="64"/>
        <ellipse cx="190" cy="145" rx="68" ry="34"/>
        <ellipse cx="960" cy="640" rx="150" ry="74"/>
        <ellipse cx="960" cy="640" rx="92" ry="42"/>
      </g>
    </svg>`;
  }
  // Default: `iso-grid` — crisp isometric architectural blueprint grid for abstract/systems lessons
  return `<svg class="pl-backdrop-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <pattern id="pl-iso-main" width="64" height="36.95" patternUnits="userSpaceOnUse">
        <path d="M0 18.475 32 0 64 18.475 32 36.95Z" fill="none" stroke="#c7baa2" stroke-opacity="0.34" stroke-width="0.95"/>
        <circle cx="32" cy="18.475" r="1.15" fill="#b7a78a" fill-opacity="0.4"/>
      </pattern>
      <radialGradient id="pl-iso-fade" cx="42%" cy="48%" r="58%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#f6efe2" stop-opacity="0.72"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#pl-iso-main)"/>
    <rect width="1200" height="800" fill="url(#pl-iso-fade)"/>
  </svg>`;
}

/**
 * Crisp single-focus 3D callout pin layer matching Backcountry 101's dark badge + white leader + anchor ring.
 */
export class FocusPinLayer {
  constructor(stage, containerEl) {
    this.stage = stage;
    this.container = containerEl;
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'pl-pins-svg');
    this.badgesHost = el('div', 'pl-pins-badges');
    this.container.replaceChildren(this.svg, this.badgesHost);
    this.pins = [];
    this._badgeEls = new Map();
    this._vec = new THREE.Vector3();
  }

  setPins(pinDefs = []) {
    this.pins = Array.isArray(pinDefs) ? pinDefs.filter(Boolean) : [];
    this._badgeEls.clear();
    this.badgesHost.replaceChildren();
    for (const def of this.pins) {
      const badge = el('div', 'pl-pin-badge', { text: def.label || '' });
      if (def.tone) badge.dataset.tone = def.tone;
      this.badgesHost.append(badge);
      this._badgeEls.set(def.id || def.label, badge);
    }
    this.update();
  }

  update() {
    if (!this.stage || !this.container) return;
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    if (!this.pins.length) return;

    const width = this.container.clientWidth || 0;
    const height = this.container.clientHeight || 0;
    if (width < 4 || height < 4) return;

    // Respect floating right lesson card so pin pills never clip behind it on narrower desktops
    let safeRight = width - 64;
    const cardEl = this.container.parentElement?.querySelector?.('.pl-card');
    if (cardEl && width > 820) {
      const cRect = this.container.getBoundingClientRect?.();
      const kRect = cardEl.getBoundingClientRect?.();
      if (cRect && kRect && kRect.left > cRect.left + 180) {
        safeRight = Math.min(safeRight, kRect.left - cRect.left - 16);
      }
    }

    for (const def of this.pins) {
      const badge = this._badgeEls.get(def.id || def.label);
      if (!badge) continue;
      const wp = typeof def.worldPos === 'function' ? def.worldPos() : def.worldPos;
      if (!wp) {
        badge.style.opacity = '0';
        continue;
      }
      if (Array.isArray(wp)) this._vec.set(wp[0], wp[1], wp[2]);
      else this._vec.set(wp.x ?? 0, wp.y ?? 0, wp.z ?? 0);

      const projected = this.stage.projectToScreen?.(this._vec);
      if (!projected || projected.visible === false || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
        badge.style.opacity = '0';
        continue;
      }

      const ox = Number(def.offset?.[0] ?? 42);
      const oy = Number(def.offset?.[1] ?? -52);
      const ax = projected.x;
      const ay = projected.y;
      const halfW = Math.max(44, (badge.offsetWidth || 96) / 2);
      const bx = Math.max(halfW + 16, Math.min(safeRight - halfW, ax + ox));
      const by = Math.max(88, Math.min(height - 130, ay + oy));

      badge.style.opacity = '1';
      badge.style.left = `${bx.toFixed(1)}px`;
      badge.style.top = `${by.toFixed(1)}px`;

      const d = `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`;
      const halo = document.createElementNS(SVG_NS, 'path');
      halo.setAttribute('class', 'pl-pin-line-halo');
      halo.setAttribute('d', d);
      const line = document.createElementNS(SVG_NS, 'path');
      line.setAttribute('class', 'pl-pin-line');
      line.setAttribute('d', d);

      const ringHalo = document.createElementNS(SVG_NS, 'circle');
      ringHalo.setAttribute('class', 'pl-pin-ring-halo');
      ringHalo.setAttribute('cx', ax.toFixed(1));
      ringHalo.setAttribute('cy', ay.toFixed(1));
      ringHalo.setAttribute('r', '6.5');

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('class', 'pl-pin-ring');
      ring.setAttribute('cx', ax.toFixed(1));
      ring.setAttribute('cy', ay.toFixed(1));
      ring.setAttribute('r', '6.5');

      this.svg.append(halo, line, ringHalo, ring);
    }
  }
}

/**
 * Attach clean click-to-inspect raycasting for `explore` mode lessons.
 */
export function attachExplorePicking(stage, getPickables, onPick) {
  if (!stage?.canvas || typeof onPick !== 'function') return () => {};
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;

  const onDown = (e) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const rect = stage.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, stage.camera);
    const items = typeof getPickables === 'function' ? getPickables() : (getPickables || []);
    const hits = raycaster.intersectObjects(items, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        if (obj.userData?.exploreId) {
          onPick(obj.userData.exploreId, obj);
          return;
        }
        obj = obj.parent;
      }
    }
  };

  stage.canvas.addEventListener('pointerdown', onDown);
  stage.canvas.addEventListener('pointerup', onUp);
  return () => {
    stage.canvas.removeEventListener('pointerdown', onDown);
    stage.canvas.removeEventListener('pointerup', onUp);
  };
}

/**
 * Core controller for Dilum-style interactive lessons.
 */
export class PrimerLessonShell {
  constructor(rootEl, config = {}) {
    if (!rootEl) throw new Error('PrimerLessonShell requires a mount element.');
    this.root = rootEl;
    this.config = config;
    this.lessons = Array.isArray(config.lessons) && config.lessons.length ? config.lessons : [];
    if (!this.lessons.length) throw new Error('PrimerLessonShell requires at least one lesson.');

    this.stage = config.stage || null;
    this.onStateChange = typeof config.onStateChange === 'function' ? config.onStateChange : null;

    this.lessonIndex = 0;
    this.stageIndex = 0;
    this.stepIndex = 0;
    this.activeTab = 'steps'; // 'steps' | 'explain' | 'tips'
    this.exploreSelectedId = null;
    this.playing = false;
    this.speedIndex = 0;
    this.railExpanded = false;
    this.cardExpanded = false;
    this.catalogCategory = 'all';

    // Track completed stages and explored items per lesson id
    this.completedStages = new Map();
    this.seenExploreIds = new Map();

    this._timerId = null;
    this._toastTimer = null;
    this._stageControlsCleanup = null;
    this._disposed = false;
    this._onKeyDown = (e) => this.#handleKeyDown(e);

    this.#applyInitialUrlParams();
    this.#buildDom();
    if (this.stage) this.attachStage(this.stage);
    this.#renderAll(true);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
    }

    if (config.autoPlay) {
      this.play();
    }
  }

  get currentLesson() {
    return this.lessons[this.lessonIndex] || this.lessons[0];
  }

  get currentStage() {
    const stages = this.currentLesson.stages || [];
    return stages[this.stageIndex] || stages[0] || { id: 'stage-0', title: '', steps: [], explain: [], tips: [] };
  }

  get currentStep() {
    const steps = this.currentStage.steps || [];
    return steps[this.stepIndex] || steps[0] || null;
  }

  get isExploreMode() {
    return this.currentLesson.mode === 'explore';
  }

  get speed() {
    return SPEEDS[this.speedIndex] || 1;
  }

  get canvas() {
    return this._canvasEl;
  }

  getState() {
    const lesson = this.currentLesson;
    const stage = this.currentStage;
    const step = this.currentStep;
    const stages = lesson.stages || [];
    const doneSet = this.#getDoneSet(lesson.id);
    const seenSet = this.#getSeenSet(lesson.id);
    return {
      lessonId: lesson.id,
      lessonIndex: this.lessonIndex,
      lessonTitle: lesson.title,
      mode: lesson.mode || 'steps',
      stageIndex: this.stageIndex,
      stageCount: stages.length,
      stageId: stage.id,
      stageTitle: stage.title,
      stepIndex: this.stepIndex,
      stepCount: (stage.steps || []).length,
      stepId: step?.id || null,
      stepTitle: step?.title || stage.title,
      activeTab: this.activeTab,
      exploreSelectedId: this.exploreSelectedId,
      playing: this.playing,
      speed: this.speed,
      completedCount: doneSet.size,
      seenExploreCount: seenSet.size,
      totalProgress: this.#computeTotalProgress(),
    };
  }

  attachStage(stage) {
    this.stage = stage;
    if (this._pinsHost) {
      this.pinLayer = new FocusPinLayer(stage, this._pinsHost);
      const prevOnView = stage._onViewChange;
      stage._onViewChange = (camState) => {
        prevOnView?.(camState);
        this.pinLayer?.update();
      };
      this.setPins(this.#resolveActivePins());
    }
    return this;
  }

  setPins(pins) {
    this.pinLayer?.setPins(pins || []);
  }

  updatePins() {
    this.pinLayer?.update();
  }

  selectLesson(lessonIdOrIndex) {
    const idx = typeof lessonIdOrIndex === 'number'
      ? lessonIdOrIndex
      : this.lessons.findIndex((l) => l.id === lessonIdOrIndex);
    if (idx < 0 || idx >= this.lessons.length) return;
    this.pause();
    this.lessonIndex = idx;
    this.stageIndex = 0;
    this.stepIndex = 0;
    this.activeTab = 'steps';
    this.exploreSelectedId = null;
    this.closeCatalog();
    this.#renderAll(true);
  }

  setStage(index, { stepIndex = 0, autoMarkPrevious = false } = {}) {
    const stages = this.currentLesson.stages || [];
    const nextIdx = Math.max(0, Math.min(stages.length - 1, Number(index) || 0));
    if (autoMarkPrevious && nextIdx > this.stageIndex) {
      this.#markStageDone(this.stageIndex);
    }
    this.stageIndex = nextIdx;
    const steps = this.currentStage.steps || [];
    this.stepIndex = Math.max(0, Math.min(Math.max(0, steps.length - 1), Number(stepIndex) || 0));
    this.#renderAll(true);
    if (this.playing) this.#scheduleNextTick();
  }

  setStep(stepIndex) {
    const steps = this.currentStage.steps || [];
    if (!steps.length) return;
    this.stepIndex = Math.max(0, Math.min(steps.length - 1, Number(stepIndex) || 0));
    if (this.stepIndex === steps.length - 1) {
      this.#markStageDone(this.stageIndex);
    }
    this.#renderAll(true);
    if (this.playing) this.#scheduleNextTick();
  }

  selectExploreItem(itemId) {
    const items = this.currentStage.exploreItems || this.currentLesson.exploreItems || [];
    const found = items.find((it) => it.id === itemId);
    if (!found) return;
    this.exploreSelectedId = found.id;
    this.#getSeenSet(this.currentLesson.id).add(found.id);
    if (found.stageIndex !== undefined && found.stageIndex !== this.stageIndex) {
      this.stageIndex = found.stageIndex;
    }
    const doneSet = this.#getDoneSet(this.currentLesson.id);
    doneSet.add(this.stageIndex);
    this.#renderAll(true);
  }

  setTab(tab) {
    if (!['steps', 'explain', 'tips'].includes(tab)) return;
    this.activeTab = tab;
    this.#renderCard();
    this.#emitChange();
  }

  nextStage() {
    const stages = this.currentLesson.stages || [];
    this.#markStageDone(this.stageIndex);
    if (this.stageIndex < stages.length - 1) {
      this.setStage(this.stageIndex + 1, { stepIndex: 0 });
    } else {
      this.pause();
      this.#renderAll(false);
      this.showToast(this.currentLesson.completionToast || `课程完成：${this.currentLesson.title}`);
    }
  }

  prevStage() {
    if (this.stageIndex > 0) {
      this.setStage(this.stageIndex - 1, { stepIndex: 0 });
    }
  }

  play() {
    if (this.isExploreMode) return;
    this.playing = true;
    this.#updatePlaybackButtons();
    this.#scheduleNextTick();
  }

  pause() {
    this.playing = false;
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this.#updatePlaybackButtons();
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  replayStage() {
    this.setStep(0);
    if (!this.isExploreMode) this.play();
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.#updatePlaybackButtons();
    if (this.playing) this.#scheduleNextTick();
  }

  orbitBy(deltaDeg) {
    if (!this.stage) return;
    const rad = (Number(deltaDeg) || 0) * (Math.PI / 180);
    const cur = this.stage.getCameraState?.() || this.stage.view;
    const startAz = this._camTween?.toAz ?? (cur?.azimuth ?? 0);
    this.#animateCamera({
      fromAz: cur?.azimuth ?? startAz,
      toAz: startAz + rad,
      fromEl: cur?.elevation ?? this.stage.view?.elevation ?? 0.55,
      toEl: cur?.elevation ?? this.stage.view?.elevation ?? 0.55,
      fromUser: true,
    });
  }

  resetCamera() {
    if (!this.stage) return;
    this.stage.unlockUserCamera?.();
    const cur = this.stage.getCameraState?.() || this.stage.view;
    const def = this.stage.defaultView;
    if (cur && def && typeof requestAnimationFrame === 'function') {
      this.#animateCamera({
        fromAz: cur.azimuth ?? def.azimuth,
        toAz: def.azimuth,
        fromEl: cur.elevation ?? def.elevation,
        toEl: def.elevation,
        fromZoom: cur.zoom ?? def.zoom ?? 1,
        toZoom: def.zoom ?? 1,
        fromTarget: cur.target ? [...cur.target] : null,
        toTarget: def.target ? [def.target.x, def.target.y, def.target.z] : null,
        fromUser: false,
      });
    } else {
      this.stage.resetView?.();
      this.pinLayer?.update();
    }
  }

  #animateCamera({ fromAz, toAz, fromEl, toEl, fromZoom, toZoom, fromTarget, toTarget, fromUser = true, durationMs = 360 }) {
    if (this._camTweenRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._camTweenRaf);
      this._camTweenRaf = null;
    }
    if (typeof requestAnimationFrame !== 'function' || this.stage?._manualMode) {
      this.stage?.setCameraImmediate?.({
        azimuth: toAz,
        elevation: toEl,
        ...(toZoom !== undefined ? { zoom: toZoom } : {}),
        ...(toTarget ? { target: toTarget } : {}),
      }, { fromUser });
      this.pinLayer?.update();
      return;
    }
    const start = performance.now();
    this._camTween = { toAz, toEl };
    const tick = (now) => {
      if (this._disposed) return;
      const raw = Math.min(1, Math.max(0, (now - start) / durationMs));
      const ease = 1 - Math.pow(1 - raw, 3);
      const pose = {
        azimuth: fromAz + (toAz - fromAz) * ease,
        elevation: fromEl + (toEl - fromEl) * ease,
      };
      if (fromZoom !== undefined && toZoom !== undefined) {
        pose.zoom = fromZoom + (toZoom - fromZoom) * ease;
      }
      if (fromTarget && toTarget) {
        pose.target = [
          fromTarget[0] + (toTarget[0] - fromTarget[0]) * ease,
          fromTarget[1] + (toTarget[1] - fromTarget[1]) * ease,
          fromTarget[2] + (toTarget[2] - fromTarget[2]) * ease,
        ];
      }
      this.stage?.setCameraImmediate?.(pose, { fromUser });
      this.pinLayer?.update();
      if (raw < 1) {
        this._camTweenRaf = requestAnimationFrame(tick);
      } else {
        this._camTween = null;
        this._camTweenRaf = null;
      }
    };
    this._camTweenRaf = requestAnimationFrame(tick);
  }

  openCatalog() {
    if (this._modalBackdrop) {
      this._modalBackdrop.hidden = false;
      this.#renderCatalogModal();
    }
  }

  closeCatalog() {
    if (this._modalBackdrop) {
      this._modalBackdrop.hidden = true;
    }
  }

  showToast(message, durationMs = 2800) {
    if (!this._toastEl) return;
    this._toastEl.textContent = String(message || '');
    this._toastEl.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toastEl?.classList.remove('is-visible');
    }, durationMs);
  }

  /**
   * Deterministic global seek across all (stage, step) pairs so `exposeTestHooks` & `verify_stage.py`
   * can scrub smoothly across the lesson without requiring continuous differential equations.
   */
  getTotalDuration() {
    let total = 0;
    for (const st of this.currentLesson.stages || []) {
      const steps = st.steps && st.steps.length ? st.steps : [{ durationMs: 2400 }];
      for (const sp of steps) {
        total += Math.max(0.5, (Number(sp.durationMs) || 2400) / 1000);
      }
    }
    return Math.max(1, total);
  }

  seekGlobal(seconds) {
    this.pause();
    const target = Math.max(0, Number(seconds) || 0);
    const stages = this.currentLesson.stages || [];
    let acc = 0;
    for (let si = 0; si < stages.length; si++) {
      const steps = stages[si].steps && stages[si].steps.length ? stages[si].steps : [{ durationMs: 2400 }];
      for (let pi = 0; pi < steps.length; pi++) {
        const dur = Math.max(0.5, (Number(steps[pi].durationMs) || 2400) / 1000);
        if (target <= acc + dur || (si === stages.length - 1 && pi === steps.length - 1)) {
          this.stageIndex = si;
          this.stepIndex = pi;
          this.#renderAll(true);
          return this.getState();
        }
        acc += dur;
      }
    }
    return this.getState();
  }

  getTimelineInfo() {
    let acc = 0;
    const stages = (this.currentLesson.stages || []).map((st, idx) => {
      const steps = st.steps && st.steps.length ? st.steps : [{ durationMs: 2400 }];
      const start = acc;
      const dur = steps.reduce((sum, sp) => sum + Math.max(0.5, (Number(sp.durationMs) || 2400) / 1000), 0);
      acc += dur;
      return { id: st.id || `stage-${idx}`, title: st.title, start, end: acc, duration: dur };
    });
    return { duration: Math.max(1, acc), stages };
  }

  dispose() {
    this._disposed = true;
    this.pause();
    clearTimeout(this._toastTimer);
    if (this._camTweenRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._camTweenRaf);
    }
    this._stageControlsCleanup?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
    }
  }

  #getDoneSet(lessonId) {
    if (!this.completedStages.has(lessonId)) this.completedStages.set(lessonId, new Set());
    return this.completedStages.get(lessonId);
  }

  #getSeenSet(lessonId) {
    if (!this.seenExploreIds.has(lessonId)) this.seenExploreIds.set(lessonId, new Set());
    return this.seenExploreIds.get(lessonId);
  }

  #markStageDone(idx) {
    this.#getDoneSet(this.currentLesson.id).add(idx);
  }

  #computeTotalProgress() {
    const stages = this.currentLesson.stages || [];
    if (!stages.length) return 0;
    const steps = this.currentStage.steps || [];
    const inner = steps.length ? (this.stepIndex + 1) / steps.length : 1;
    return Math.min(1, (this.stageIndex + inner) / stages.length);
  }

  #applyInitialUrlParams() {
    if (typeof window === 'undefined' || !window.location?.search) return;
    const params = new URLSearchParams(window.location.search);
    const lessonParam = params.get('lesson');
    if (lessonParam) {
      const idx = this.lessons.findIndex((l) => l.id === lessonParam);
      if (idx >= 0) this.lessonIndex = idx;
    }
    const stageParam = params.get('stage');
    if (stageParam !== null) {
      const stages = this.currentLesson.stages || [];
      const byId = stages.findIndex((s) => s.id === stageParam);
      if (byId >= 0) this.stageIndex = byId;
      else if (/^\d+$/.test(stageParam)) {
        this.stageIndex = Math.max(0, Math.min(stages.length - 1, Number(stageParam)));
      }
    }
    const stepParam = params.get('step');
    if (stepParam !== null && /^\d+$/.test(stepParam)) {
      const steps = this.currentStage.steps || [];
      this.stepIndex = Math.max(0, Math.min(Math.max(0, steps.length - 1), Number(stepParam)));
    }
    const tabParam = params.get('tab');
    if (tabParam && ['steps', 'explain', 'tips'].includes(tabParam)) {
      this.activeTab = tabParam;
    }
  }

  #handleKeyDown(e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.#advanceOneSubstep();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (this.stepIndex > 0) this.setStep(this.stepIndex - 1);
      else this.prevStage();
    } else if (e.key === 'r' || e.key === 'R') {
      this.resetCamera();
    } else if (e.key === 'Escape') {
      this.closeCatalog();
    }
  }

  #advanceOneSubstep() {
    const steps = this.currentStage.steps || [];
    if (!this.isExploreMode && this.stepIndex < steps.length - 1) {
      this.setStep(this.stepIndex + 1);
    } else {
      this.nextStage();
    }
  }

  #scheduleNextTick() {
    clearTimeout(this._timerId);
    if (!this.playing || this.isExploreMode || this._disposed) return;
    const step = this.currentStep;
    const baseMs = Math.max(900, Number(step?.durationMs) || 2600);
    const delay = Math.round(baseMs / this.speed);
    this._timerId = setTimeout(() => {
      if (!this.playing || this._disposed) return;
      const steps = this.currentStage.steps || [];
      const stages = this.currentLesson.stages || [];
      if (this.stepIndex < steps.length - 1) {
        this.stepIndex += 1;
        this.#renderAll(true);
        this.#scheduleNextTick();
      } else {
        this.#markStageDone(this.stageIndex);
        if (this.stageIndex < stages.length - 1) {
          this.stageIndex += 1;
          this.stepIndex = 0;
          this.#renderAll(true);
          this.#scheduleNextTick();
        } else {
          this.pause();
          this.#renderAll(false);
          this.showToast(this.currentLesson.completionToast || `课程完成：${this.currentLesson.title}`);
        }
      }
    }, delay);
  }

  #buildDom() {
    const shell = el('div', 'artboard-shell pl-shell', {
      'data-layout': 'primer-lesson',
      'data-lesson-palette': this.config.palette || 'forest',
      'data-rail-expanded': 'false',
    });
    this._shellEl = shell;

    // 1. Left dark rail
    const rail = el('nav', 'pl-rail', { 'aria-label': '课程导航' });
    this._railToggleBtn = this.#makeRailBtn(UI_ICONS.chevronRight, '展开侧边栏', () => {
      this.railExpanded = !this.railExpanded;
      shell.dataset.railExpanded = String(this.railExpanded);
      this._railToggleBtn.querySelector('.pl-rail-icon').innerHTML = this.railExpanded ? UI_ICONS.chevronLeft : UI_ICONS.chevronRight;
      this._railToggleBtn.querySelector('.pl-rail-label').textContent = this.railExpanded ? '收起侧边栏' : '展开侧边栏';
      setTimeout(() => this.stage?.resize?.(true), 230);
    });
    rail.append(this._railToggleBtn, el('div', 'pl-rail-divider'));

    this._railLessonsHost = el('div', 'pl-rail-lessons');
    rail.append(this._railLessonsHost);

    const catalogRailBtn = this.#makeRailBtn(UI_ICONS.book, '全部课程', () => this.openCatalog());
    rail.append(catalogRailBtn);

    rail.append(el('div', 'pl-rail-spacer'));
    if (this.config.homeHref) {
      const backLink = el('a', 'pl-rail-btn', { href: this.config.homeHref, title: '返回全部入门课' });
      backLink.append(
        el('span', 'pl-rail-icon', { svg: UI_ICONS.grid }),
        el('span', 'pl-rail-label', { text: '全部入门课' })
      );
      rail.append(backLink);
    }

    // 2. Main full-bleed stage workspace
    const main = el('main', 'pl-main');

    // Thematic SVG backdrop
    const backdrop = el('div', 'pl-backdrop');
    backdrop.innerHTML = buildBackdropSvg(this.config.backdrop || 'iso-grid');

    // 3D Stage canvas wrap
    const stageWrap = el('div', 'pl-stage-wrap stage-pane');
    this._canvasEl = el('canvas', 'stage-canvas', {
      id: 'stage-canvas',
      'aria-label': `${this.config.title || '3D 课程舞台'}。拖动可旋转视角。`,
    });
    stageWrap.append(this._canvasEl);

    // 3D Focus Pins overlay
    this._pinsHost = el('div', 'pl-pins');

    // Top floating overlay bar
    const topbar = el('header', 'pl-topbar');

    const brand = el('div', 'pl-brand');
    const emblem = el('div', 'pl-emblem', { svg: this.config.emblemSvg || UI_ICONS.defaultEmblem });
    const brandCopy = el('div', 'pl-brand-copy');
    brandCopy.append(
      el('h1', 'pl-brand-title', { text: this.config.title || 'PRIMER 101' }),
      el('p', 'pl-brand-sub', { text: this.config.subtitle || '观察 · 推演 · 理解' })
    );
    brand.append(emblem, brandCopy);

    // Center camera + playback pill
    const ctrlPill = el('div', 'pl-controls-pill', { role: 'toolbar', 'aria-label': '视角与播放控制' });
    const rotLeftBtn = el('button', 'pl-ctrl-btn', { type: 'button', title: '逆时针旋转视角', 'aria-label': '逆时针旋转视角', svg: UI_ICONS.rotateLeft });
    const resetCamBtn = el('button', 'pl-ctrl-btn', { type: 'button', title: '重置视角 (R)', 'aria-label': '重置视角', svg: UI_ICONS.compass });
    const rotRightBtn = el('button', 'pl-ctrl-btn', { type: 'button', title: '顺时针旋转视角', 'aria-label': '顺时针旋转视角', svg: UI_ICONS.rotateRight });
    rotLeftBtn.addEventListener('click', () => this.orbitBy(-45));
    resetCamBtn.addEventListener('click', () => this.resetCamera());
    rotRightBtn.addEventListener('click', () => this.orbitBy(45));

    this._playbackGroup = el('span', 'pl-playback-group');
    this._playbackGroup.style.display = 'inline-flex';
    this._playbackGroup.style.alignItems = 'center';
    this._playbackGroup.style.gap = '3px';
    const sep = el('span', 'pl-ctrl-sep');
    const replayBtn = el('button', 'pl-ctrl-btn', { type: 'button', title: '重新播放本阶段', 'aria-label': '重新播放本阶段', svg: UI_ICONS.replay });
    this._playBtn = el('button', 'pl-ctrl-btn is-primary', { type: 'button', title: '播放 / 暂停 (Space)', 'aria-label': '播放或暂停', svg: UI_ICONS.play });
    this._speedBtn = el('button', 'pl-ctrl-btn', { type: 'button', title: '切换播放速度', 'aria-label': '切换播放速度', text: '1×' });
    replayBtn.addEventListener('click', () => this.replayStage());
    this._playBtn.addEventListener('click', () => this.togglePlay());
    this._speedBtn.addEventListener('click', () => this.cycleSpeed());
    this._playbackGroup.append(sep, replayBtn, this._playBtn, this._speedBtn);
    ctrlPill.append(rotLeftBtn, resetCamBtn, rotRightBtn, this._playbackGroup);

    // Right progress pill + home/catalog button
    const topRight = el('div', 'pl-top-right');
    const progressPill = el('button', 'pl-progress-pill', { type: 'button', title: '打开全部课程目录' });
    progressPill.addEventListener('click', () => this.openCatalog());
    const progressIcon = el('span', 'pl-progress-icon', { svg: UI_ICONS.book });
    const progressMeta = el('span', 'pl-progress-meta');
    this._progressNameEl = el('span', 'pl-progress-name');
    const progressRow = el('span', 'pl-progress-row');
    const progressTrack = el('span', 'pl-progress-track');
    this._progressFillEl = el('span', 'pl-progress-fill');
    progressTrack.append(this._progressFillEl);
    this._progressCountEl = el('span', 'pl-progress-count');
    progressRow.append(progressTrack, this._progressCountEl);
    progressMeta.append(this._progressNameEl, progressRow);
    progressPill.append(progressIcon, progressMeta);
    topRight.append(progressPill);

    if (this.config.homeHref) {
      const homeLink = el('a', 'pl-home-link', {
        href: this.config.homeHref,
        title: '返回入门总览',
        'aria-label': '返回入门总览',
        svg: UI_ICONS.grid,
      });
      topRight.append(homeLink);
    }

    topbar.append(brand, ctrlPill, topRight);

    // 3. Right floating lesson card
    const card = el('aside', 'pl-card hud-guide', { 'aria-label': '课程讲解面板' });
    this._cardEl = card;
    const tabsBar = el('div', 'pl-tabs', { role: 'tablist' });
    this._tabBtns = {};
    for (const [key, label] of [['steps', '步骤'], ['explain', '讲解'], ['tips', '提示']]) {
      const btn = el('button', 'pl-tab', { type: 'button', role: 'tab', 'aria-selected': String(key === this.activeTab), text: label });
      btn.addEventListener('click', () => this.setTab(key));
      this._tabBtns[key] = btn;
      tabsBar.append(btn);
    }
    this._cardBodyEl = el('div', 'pl-card-body');
    card.append(tabsBar, this._cardBodyEl);

    // Toast feedback
    this._toastEl = el('div', 'pl-toast', { role: 'status', 'aria-live': 'polite' });

    // 4. Bottom horizontal stage stepper bar
    const bottomDock = el('section', 'pl-bottom-dock', { 'aria-label': '课程阶段进度' });
    this._lessonChipBtn = el('button', 'pl-lesson-chip', { type: 'button' });
    this._lessonChipBtn.addEventListener('click', () => this.openCatalog());

    const stageBar = el('div', 'pl-stage-bar');
    this._stageTrackEl = el('div', 'pl-stage-track');
    const navArrows = el('div', 'pl-nav-arrows');
    this._prevStageBtn = el('button', 'pl-nav-btn', { type: 'button', title: '上一阶段', 'aria-label': '上一阶段', svg: UI_ICONS.chevronLeft });
    this._nextStageBtn = el('button', 'pl-nav-btn is-next', { type: 'button', title: '下一阶段', 'aria-label': '下一阶段', svg: UI_ICONS.chevronRight });
    this._prevStageBtn.addEventListener('click', () => this.prevStage());
    this._nextStageBtn.addEventListener('click', () => this.nextStage());
    navArrows.append(this._prevStageBtn, this._nextStageBtn);
    stageBar.append(this._stageTrackEl, navArrows);
    bottomDock.append(this._lessonChipBtn, stageBar);

    main.append(backdrop, stageWrap, this._pinsHost, topbar, card, this._toastEl, bottomDock);

    // 5. Catalog modal
    this._modalBackdrop = el('div', 'pl-modal-backdrop', { hidden: '' });
    this._modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this._modalBackdrop) this.closeCatalog();
    });
    const modal = el('div', 'pl-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '全部课程' });
    const modalHead = el('div', 'pl-modal-head');
    const modalTitles = el('div');
    this._modalTitleEl = el('h2', 'pl-modal-title', { text: '全部课程' });
    this._modalSubEl = el('p', 'pl-modal-sub');
    modalTitles.append(this._modalTitleEl, this._modalSubEl);
    const modalClose = el('button', 'pl-expand-btn', { type: 'button', 'aria-label': '关闭目录', svg: UI_ICONS.close });
    modalClose.addEventListener('click', () => this.closeCatalog());
    modalHead.append(modalTitles, modalClose);

    this._modalFiltersEl = el('div', 'pl-modal-filters');
    this._modalGridEl = el('div', 'pl-catalog-grid');
    modal.append(modalHead, this._modalFiltersEl, this._modalGridEl);
    this._modalBackdrop.append(modal);

    shell.append(rail, main, this._modalBackdrop);
    this.root.replaceChildren(shell);
  }

  #makeRailBtn(iconSvg, label, onClick) {
    const btn = el('button', 'pl-rail-btn', { type: 'button', title: label });
    btn.append(
      el('span', 'pl-rail-icon', { svg: iconSvg }),
      el('span', 'pl-rail-label', { text: label })
    );
    btn.addEventListener('click', onClick);
    return btn;
  }

  #renderAll(notifyScene = true) {
    this.#renderRailLessons();
    this.#renderTopProgress();
    this.#updatePlaybackButtons();
    this.#renderCard();
    this.#renderBottomStages();
    if (notifyScene) {
      this.#emitChange();
    }
    this.setPins(this.#resolveActivePins());
  }

  #renderRailLessons() {
    this._railLessonsHost.replaceChildren();
    this.lessons.forEach((lesson, idx) => {
      const btn = el('button', 'pl-rail-btn', { type: 'button', title: lesson.title });
      if (idx === this.lessonIndex) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'true');
      }
      const iconWrap = el('span', 'pl-rail-icon');
      if (lesson.iconSvg) iconWrap.innerHTML = lesson.iconSvg;
      else iconWrap.textContent = lesson.icon || (idx === 0 ? '●' : String(idx + 1));
      btn.append(iconWrap, el('span', 'pl-rail-label', { text: lesson.title }));
      btn.addEventListener('click', () => this.selectLesson(idx));
      this._railLessonsHost.append(btn);
    });
  }

  #renderTopProgress() {
    const lesson = this.currentLesson;
    const stages = lesson.stages || [];
    const doneCount = this.#getDoneSet(lesson.id).size;
    const total = Math.max(1, stages.length);
    const pct = Math.min(100, Math.round((doneCount / total) * 100));
    this._progressNameEl.textContent = lesson.progressTitle || lesson.title;
    this._progressCountEl.textContent = `${doneCount}/${stages.length}`;
    this._progressFillEl.style.width = `${pct}%`;

    this._lessonChipBtn.replaceChildren();
    const chipIcon = el('span', '', { text: lesson.icon || '📘' });
    const chipText = el('span', '', { text: `课程：${lesson.title}` });
    const chipArrow = el('span', '', { svg: UI_ICONS.chevronDown });
    this._lessonChipBtn.append(chipIcon, chipText, chipArrow);
  }

  #updatePlaybackButtons() {
    if (this._playbackGroup) {
      this._playbackGroup.hidden = this.isExploreMode;
      this._playbackGroup.style.display = this.isExploreMode ? 'none' : 'inline-flex';
    }
    if (this._playBtn) {
      this._playBtn.innerHTML = this.playing ? UI_ICONS.pause : UI_ICONS.play;
      this._playBtn.setAttribute('aria-label', this.playing ? '暂停' : '播放');
    }
    if (this._speedBtn) {
      this._speedBtn.textContent = `${this.speed}×`;
    }
  }

  #renderCard() {
    this._stageControlsCleanup?.();
    this._stageControlsCleanup = null;

    const stage = this.currentStage;
    const firstTabLabel = this.isExploreMode ? '识别' : '步骤';
    this._tabBtns.steps.textContent = firstTabLabel;
    for (const [k, btn] of Object.entries(this._tabBtns)) {
      btn.setAttribute('aria-selected', String(k === this.activeTab));
    }

    const body = this._cardBodyEl;
    body.replaceChildren();

    const head = el('div', 'pl-stage-head');
    const titleEl = el('h2', 'pl-stage-title', { id: 'lesson-title', text: stage.title || this.currentLesson.title });
    const expandBtn = el('button', 'pl-expand-btn', {
      type: 'button',
      title: this.cardExpanded ? '收起讲解卡' : '展开讲解卡',
      'aria-label': this.cardExpanded ? '收起讲解卡' : '展开讲解卡',
      svg: UI_ICONS.expand,
    });
    expandBtn.addEventListener('click', () => {
      this.cardExpanded = !this.cardExpanded;
      this._cardEl.dataset.expanded = String(this.cardExpanded);
    });
    head.append(titleEl, expandBtn);
    body.append(head);

    if (this.activeTab === 'steps') {
      if (stage.summary) {
        const summary = el('p', 'pl-stage-summary', { id: 'lesson-cue' });
        setRichText(summary, stage.summary);
        body.append(summary);
      }

      if (this.isExploreMode) {
        const list = el('div', 'pl-explore-list');
        const items = stage.exploreItems || this.currentLesson.exploreItems || [];
        const seenSet = this.#getSeenSet(this.currentLesson.id);
        for (const item of items) {
          const isActive = item.id === this.exploreSelectedId;
          const isSeen = seenSet.has(item.id);
          const btn = el('button', `pl-explore-btn${isActive ? ' is-active' : ''}${isSeen ? ' is-seen' : ''}`, { type: 'button' });
          btn.append(
            el('span', 'pl-step-thumb', { text: item.icon || '◆' }),
            el('span', 'pl-step-text', { text: item.title }),
            el('span', 'pl-explore-status', isSeen ? { svg: UI_ICONS.check } : { text: '?' })
          );
          btn.addEventListener('click', () => this.selectExploreItem(item.id));
          list.append(btn);
        }
        body.append(list);

        const activeItem = items.find((i) => i.id === this.exploreSelectedId);
        if (activeItem?.detail) {
          const cue = el('div', 'pl-step-cue');
          const strong = el('strong', '', { text: activeItem.title });
          const span = el('span');
          setRichText(span, activeItem.detail);
          cue.append(strong, span);
          body.append(cue);
        }
      } else {
        const list = el('ol', 'pl-step-list');
        const steps = stage.steps || [];
        steps.forEach((step, idx) => {
          const isDone = idx < this.stepIndex || this.#getDoneSet(this.currentLesson.id).has(this.stageIndex);
          const isActive = idx === this.stepIndex;
          const row = el('li', `pl-step-row${isDone && !isActive ? ' is-done' : ''}${isActive ? ' is-active' : ''}`);
          const dot = el('span', 'pl-step-dot', isDone && !isActive ? { svg: UI_ICONS.check } : {});
          const btn = el('button', 'pl-step-btn', { type: 'button' });
          const thumb = el('span', 'pl-step-thumb');
          if (step.iconSvg) thumb.innerHTML = step.iconSvg;
          else thumb.textContent = step.icon || `${idx + 1}`;
          const text = el('span', 'pl-step-text', { text: `${idx + 1}. ${step.title}` });
          const chev = el('span', 'pl-step-chevron', { svg: UI_ICONS.chevronRight });
          btn.append(thumb, text, chev);
          btn.addEventListener('click', () => this.setStep(idx));
          row.append(dot, btn);
          list.append(row);
        });
        body.append(list);

        const curStep = this.currentStep;
        if (curStep?.cue) {
          const cueBox = el('div', 'pl-step-cue');
          const tag = el('strong', '', { text: curStep.cueLabel || '这一步发生了什么' });
          const span = el('span');
          setRichText(span, curStep.cue);
          cueBox.append(tag, span);
          body.append(cueBox);
        }
      }
    } else if (this.activeTab === 'explain') {
      const prose = el('div', 'pl-prose');
      const paras = Array.isArray(stage.explain) ? stage.explain : (stage.explain ? [stage.explain] : []);
      for (const pText of paras) {
        const p = el('p');
        setRichText(p, pText);
        prose.append(p);
      }
      if (stage.think?.question) {
        const details = el('details', 'pl-think-box');
        const summary = el('summary');
        const qSpan = el('span');
        setRichText(qSpan, stage.think.question);
        summary.append(qSpan, el('span', 'pl-think-badge', { text: '先想一想' }));
        const ans = el('div', 'pl-think-answer');
        setRichText(ans, stage.think.answer || '');
        details.append(summary, ans);
        prose.append(details);
      }
      body.append(prose);
    } else if (this.activeTab === 'tips') {
      const ul = el('ul', 'pl-tips-list');
      const tips = Array.isArray(stage.tips) ? stage.tips : [];
      for (const tip of tips) {
        const li = el('li', 'pl-tip-item');
        const span = el('span');
        setRichText(span, tip);
        li.append(el('span', 'pl-tip-dot'), span);
        ul.append(li);
      }
      body.append(ul);
    }

    if (typeof stage.mountControls === 'function') {
      const slot = el('div', 'pl-stage-controls');
      const cleanup = stage.mountControls(slot, { shell: this, state: this.getState() });
      if (slot.children.length > 0) body.append(slot);
      if (typeof cleanup === 'function') this._stageControlsCleanup = cleanup;
    }
  }

  #renderBottomStages() {
    const stages = this.currentLesson.stages || [];
    const doneSet = this.#getDoneSet(this.currentLesson.id);
    this._stageTrackEl.replaceChildren();

    stages.forEach((st, idx) => {
      const isActive = idx === this.stageIndex;
      const isDone = doneSet.has(idx);
      const card = el('button', `pl-stage-card${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`, { type: 'button' });
      const icon = el('span', 'pl-stage-card-icon');
      if (st.iconSvg) icon.innerHTML = st.iconSvg;
      else icon.textContent = st.icon || String(idx + 1);
      const name = el('span', 'pl-stage-card-name', { text: `${idx + 1}. ${st.shortTitle || st.title}` });
      const check = el('span', 'pl-stage-card-check', { svg: UI_ICONS.check });
      card.append(icon, name, check);
      card.addEventListener('click', () => this.setStage(idx));
      this._stageTrackEl.append(card);
    });

    this._prevStageBtn.disabled = this.stageIndex <= 0;
    this._nextStageBtn.disabled = false;
  }

  #renderCatalogModal() {
    const categories = ['all', ...new Set(this.lessons.map((l) => l.category).filter(Boolean))];
    this._modalSubEl.textContent = `${this.lessons.length} 节交互课 · 选一节开始`;

    this._modalFiltersEl.replaceChildren();
    if (categories.length > 1) {
      this._modalFiltersEl.hidden = false;
      for (const cat of categories) {
        const count = cat === 'all' ? this.lessons.length : this.lessons.filter((l) => l.category === cat).length;
        const chip = el('button', `pl-filter-chip${cat === this.catalogCategory ? ' is-active' : ''}`, {
          type: 'button',
          text: `${cat === 'all' ? '全部' : cat} ${count}`,
        });
        chip.addEventListener('click', () => {
          this.catalogCategory = cat;
          this.#renderCatalogModal();
        });
        this._modalFiltersEl.append(chip);
      }
    } else {
      this._modalFiltersEl.hidden = true;
    }

    this._modalGridEl.replaceChildren();
    const visible = this.catalogCategory === 'all'
      ? this.lessons
      : this.lessons.filter((l) => l.category === this.catalogCategory);

    for (const lesson of visible) {
      const isCurrent = lesson.id === this.currentLesson.id;
      const card = el('button', `pl-catalog-card${isCurrent ? ' is-active' : ''}`, { type: 'button' });
      const top = el('div', 'pl-catalog-top');
      top.append(
        el('span', '', { text: lesson.icon || '📘' }),
        el('span', 'pl-catalog-badge', { text: lesson.mode === 'explore' ? '探索' : '分步教学' })
      );
      card.append(
        top,
        el('div', 'pl-catalog-name', { text: lesson.title }),
        el('div', 'pl-catalog-desc', { text: lesson.description || `${(lesson.stages || []).length} 个阶段` })
      );
      card.addEventListener('click', () => this.selectLesson(lesson.id));
      this._modalGridEl.append(card);
    }
  }

  #resolveActivePins() {
    if (this.isExploreMode) {
      const items = this.currentStage.exploreItems || this.currentLesson.exploreItems || [];
      const active = items.find((i) => i.id === this.exploreSelectedId);
      if (active?.pins) return active.pins;
      return this.currentStage.pins || [];
    }
    return this.currentStep?.pins || this.currentStage.pins || [];
  }

  #emitChange() {
    this.onStateChange?.(this.getState(), {
      shell: this,
      lesson: this.currentLesson,
      stage: this.currentStage,
      step: this.currentStep,
    });
  }
}

/**
 * Smooth state transition helper for Primer diorama scenes.
 * Eliminates hard `visible = true/false` popping and abrupt color/position jumps between
 * consecutive stages and sub-steps while preserving 100% deterministic `snap()` for `seek()`.
 */
export class DioramaAnimator {
  constructor() {
    this._presences = new Map();
    this._colors = new Map();
    this._scalars = new Map();
    this._tmpColor = new THREE.Color();
  }

  /**
   * Register an Object3D whose appearance/disappearance should animate smoothly with
   * tabletop drop-in + gentle overshoot (scale + vertical lift), and reverse smoothly on exit.
   */
  trackPresence(id, object, {
    lift = 0.42,
    duration = 0.46,
    delay = 0,
    scaleFrom = 0.04,
    overshoot = 0.055,
    mode = 'drop', // 'drop' | 'grow-x' | 'grow-y' | 'pop'
    initial = false,
  } = {}) {
    if (!object) return this;
    const basePos = object.position.clone();
    const baseScale = object.scale.clone();
    const u = initial ? 1 : 0;
    const entry = {
      id,
      object,
      basePos,
      baseScale,
      lift,
      duration: Math.max(0.08, Number(duration) || 0.46),
      delay: Math.max(0, Number(delay) || 0),
      scaleFrom,
      overshoot,
      mode,
      target: u,
      current: u,
      pendingDelay: 0,
    };
    this._presences.set(id, entry);
    this.#applyPresence(entry);
    return this;
  }

  /** Set target visibility (`true`/`false`) for a tracked object (starts smooth transition). */
  setPresent(id, visible, { delay = undefined } = {}) {
    const entry = this._presences.get(id);
    if (!entry) return;
    const next = visible ? 1 : 0;
    if (next !== entry.target) {
      entry.target = next;
      // Apply stagger delay only when entering so exit feels snappy and immediate
      entry.pendingDelay = next === 1 ? (delay !== undefined ? delay : entry.delay) : 0;
    }
  }

  /** Register a THREE.Material whose color should blend smoothly between states. */
  trackColor(id, material, { speed = 7.5 } = {}) {
    if (!material?.color) return this;
    this._colors.set(id, {
      material,
      speed,
      current: material.color.clone(),
      target: material.color.clone(),
    });
    return this;
  }

  setColor(id, hexOrColor) {
    const entry = this._colors.get(id);
    if (!entry) return;
    entry.target.set(hexOrColor);
  }

  /** Track a continuous scalar (e.g., packet flow rate, overload pulse, conduit opacity). */
  trackScalar(id, initial = 0, { speed = 6.5 } = {}) {
    this._scalars.set(id, { current: Number(initial) || 0, target: Number(initial) || 0, speed });
    return this;
  }

  setScalar(id, value) {
    const entry = this._scalars.get(id);
    if (!entry) return;
    entry.target = Number(value) || 0;
  }

  getScalar(id) {
    return this._scalars.get(id)?.current ?? 0;
  }

  getPresence(id) {
    return this._presences.get(id)?.current ?? 0;
  }

  /** Advance all transitions by `dt` seconds. Returns `true` if any property changed. */
  step(dt) {
    const h = Math.min(0.05, Math.max(0, Number(dt) || 0));
    let dirty = false;

    for (const entry of this._presences.values()) {
      if (Math.abs(entry.current - entry.target) < 1e-4 && entry.pendingDelay <= 0) continue;
      dirty = true;
      if (entry.pendingDelay > 0) {
        entry.pendingDelay = Math.max(0, entry.pendingDelay - h);
        continue;
      }
      const rate = 1 / entry.duration;
      if (entry.target > entry.current) {
        entry.current = Math.min(1, entry.current + h * rate);
      } else {
        entry.current = Math.max(0, entry.current - h * rate * 1.35);
      }
      this.#applyPresence(entry);
    }

    for (const entry of this._colors.values()) {
      const dr = entry.target.r - entry.current.r;
      const dg = entry.target.g - entry.current.g;
      const db = entry.target.b - entry.current.b;
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 1e-4) continue;
      dirty = true;
      const k = 1 - Math.exp(-entry.speed * h);
      entry.current.r += dr * k;
      entry.current.g += dg * k;
      entry.current.b += db * k;
      entry.material.color.copy(entry.current);
    }

    for (const entry of this._scalars.values()) {
      const diff = entry.target - entry.current;
      if (Math.abs(diff) < 1e-4) continue;
      dirty = true;
      entry.current += diff * (1 - Math.exp(-entry.speed * h));
    }

    return dirty;
  }

  /** Jump immediately to all target values (used during deterministic `seek` / export). */
  snap() {
    for (const entry of this._presences.values()) {
      entry.pendingDelay = 0;
      entry.current = entry.target;
      this.#applyPresence(entry);
    }
    for (const entry of this._colors.values()) {
      entry.current.copy(entry.target);
      entry.material.color.copy(entry.target);
    }
    for (const entry of this._scalars.values()) {
      entry.current = entry.target;
    }
  }

  #applyPresence(entry) {
    const u = entry.current;
    const obj = entry.object;
    if (u <= 0.002) {
      obj.visible = false;
      obj.position.copy(entry.basePos);
      obj.scale.set(
        entry.baseScale.x * entry.scaleFrom,
        entry.baseScale.y * entry.scaleFrom,
        entry.baseScale.z * entry.scaleFrom,
      );
      return;
    }
    obj.visible = true;
    // Smooth cubic ease with subtle tactile landing settle
    const inv = 1 - u;
    const ease = 1 - inv * inv * inv;
    const settle = entry.overshoot > 0 ? Math.sin(u * Math.PI) * (1 - u) * entry.overshoot : 0;

    if (entry.mode === 'grow-x') {
      obj.position.copy(entry.basePos);
      const sx = Math.max(0.001, entry.scaleFrom + (1 - entry.scaleFrom) * ease);
      const syz = Math.max(0.001, 0.35 + 0.65 * ease);
      obj.scale.set(entry.baseScale.x * sx, entry.baseScale.y * syz, entry.baseScale.z * syz);
    } else if (entry.mode === 'grow-y') {
      const sy = Math.max(0.001, entry.scaleFrom + (1 - entry.scaleFrom) * ease + settle);
      obj.position.copy(entry.basePos);
      obj.scale.set(entry.baseScale.x * (0.4 + 0.6 * ease), entry.baseScale.y * sy, entry.baseScale.z * (0.4 + 0.6 * ease));
    } else {
      const sc = Math.max(0.001, entry.scaleFrom + (1 - entry.scaleFrom) * ease + settle);
      obj.scale.set(entry.baseScale.x * sc, entry.baseScale.y * sc, entry.baseScale.z * sc);
      obj.position.set(
        entry.basePos.x,
        entry.basePos.y + (entry.mode === 'pop' ? 0 : entry.lift * (1 - ease)),
        entry.basePos.z,
      );
    }
  }
}

export function mountPrimerLesson(rootEl, config) {
  return new PrimerLessonShell(rootEl, config);
}
