/**
 * Deterministic multi-stage timeline & time-scaling engine for interactive primers.
 * Supports:
 * - T1/T2 continuous phase scrubbing & speed control (`PhaseScrubber`)
 * - T3/T4 chapter-scale deterministic fast-forward, global reversible scrubbing
 *   (`seekGlobal`), stage cameras (`TrackTimeline` + `TimelineDirector`)
 * - Unified `mountTimelineBar()` working with both `TimelineDirector` and `SpacetimeClock`
 * - Unified `window.__simulify` v2 contract via `exposeTestHooks()` for Tier 1/Tier 2
 *   deterministic export and v2 4D Quality Oracle verification.
 */

export const easeLinear = (u) => u;

export const easeOutCubic = (u) => {
  const x = Math.max(0, Math.min(1, u));
  return 1 - Math.pow(1 - x, 3);
};

export const easeInOutCubic = (u) => {
  const x = Math.max(0, Math.min(1, u));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * Composable concurrent track timeline for one lesson step.
 * Structural tracks are executed to completion during finish() (skipping fx-only tracks),
 * enabling instant deterministic jumps to later chapters.
 */
export class TrackTimeline {
  constructor() {
    this.tracks = [];
    this.duration = 0;
    this._sorted = null;
  }

  /**
   * Register an animated or procedural track segment.
   * @param {number} at Start offset in seconds within this step.
   * @param {number} dur Duration in seconds (0 for discrete callback).
   * @param {(eased: number, raw: number) => void} update
   * @param {{ begin?: () => void, ease?: (u: number) => number, fx?: boolean }} [opts]
   */
  add(at, dur, update, { begin, ease = easeInOutCubic, fx = false } = {}) {
    const start = Math.max(0, Number(at) || 0);
    const len = Math.max(0, Number(dur) || 0);
    this.tracks.push({
      at: start,
      dur: len,
      update: typeof update === 'function' ? update : () => {},
      begin: typeof begin === 'function' ? begin : null,
      ease: typeof ease === 'function' ? ease : easeInOutCubic,
      fx: Boolean(fx),
      started: false,
      done: false,
    });
    this.duration = Math.max(this.duration, start + len);
    this._sorted = null;
    return this;
  }

  /**
   * Register a zero-duration structural mutation or callback at time `at`.
   * @param {number} at
   * @param {() => void} fn
   * @param {{ fx?: boolean }} [opts]
   */
  call(at, fn, { fx = false } = {}) {
    return this.add(at, 0, () => {}, { begin: fn, ease: easeLinear, fx });
  }

  /**
   * Forward-evaluate all active tracks up to local time `t`.
   * Note: Backward scrubbing resets and replays deterministically via TimelineDirector.seekTo()/seekGlobal().
   * @param {number} t
   */
  seek(t) {
    const time = Math.max(0, Number(t) || 0);
    for (const track of this.#ordered()) {
      if (track.done || time < track.at) continue;
      if (!track.started) {
        track.started = true;
        track.begin?.();
      }
      const raw = track.dur > 0 ? Math.min(1, Math.max(0, (time - track.at) / track.dur)) : 1;
      track.update(track.ease(raw), raw);
      if (raw >= 1) {
        track.done = true;
      }
    }
  }

  /**
   * Fast-forward all structural tracks to their exact terminal state (skipping fx: true).
   */
  finish() {
    for (const track of this.#ordered()) {
      if (track.done) continue;
      if (!track.fx) {
        if (!track.started) {
          track.started = true;
          track.begin?.();
        }
        track.update(track.ease(1), 1);
      }
      track.done = true;
    }
  }

  #ordered() {
    if (!this._sorted) {
      this._sorted = [...this.tracks].sort((a, b) => a.at - b.at);
    }
    return this._sorted;
  }
}

/**
 * Multi-stage / multi-step chapter director for T3 (long morphing processes) and
 * T4 (progressive chapter-scale world assembly), with global timeline indexing and
 * deterministic reversible `seekGlobal(t)`.
 */
export class TimelineDirector {
  /**
   * @param {{
   *   stages: Array<{ id: string, title: string, camera?: any, summary?: string, steps: Array<{ id: string, title: string, duration?: number, run: (tl: TrackTimeline, ctx: any) => void }> }>,
   *   ctx?: any,
   *   onReset?: (ctx: any) => void,
   *   onStageCamera?: (camera: any, stageMeta: { stageIndex: number, stageId: string, stageTitle: string }) => void,
   *   onStepChange?: (state: any) => void,
   *   speed?: number,
   *   autoAdvance?: boolean,
   *   defaultFps?: number,
   * }} options
   */
  constructor({
    stages = [],
    ctx = {},
    onReset = null,
    onStageCamera = null,
    onStepChange = null,
    speed = 1,
    autoAdvance = true,
    defaultFps = 60,
  } = {}) {
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new Error('TimelineDirector requires at least one stage.');
    }

    this.stages = stages;
    this.ctx = ctx;
    this.onReset = onReset;
    this.onStageCamera = onStageCamera;
    this.onStepChange = onStepChange;
    this.speed = Math.max(0.05, Number(speed) || 1);
    this.autoAdvance = Boolean(autoAdvance);
    this.defaultFps = Math.max(1, Number(defaultFps) || 60);
    this.manualMode = false;

    this.flatSteps = [];
    this.stageStarts = [];
    stages.forEach((stage, stageIndex) => {
      this.stageStarts.push(this.flatSteps.length);
      const steps = Array.isArray(stage.steps) ? stage.steps : [];
      steps.forEach((step, localIndex) => {
        this.flatSteps.push({
          globalIndex: this.flatSteps.length,
          localIndex,
          stageIndex,
          stageId: stage.id ?? `stage-${stageIndex}`,
          stageTitle: stage.title ?? `Stage ${stageIndex + 1}`,
          camera: step.camera !== undefined ? step.camera : stage.camera,
          summary: step.summary ?? stage.summary ?? '',
          carries: step.carries ?? stage.carries ?? '',
          hook: step.hook ?? stage.hook ?? '',
          relates: step.relates ?? stage.relates ?? [],
          id: step.id ?? `step-${this.flatSteps.length}`,
          title: step.title ?? `Step ${localIndex + 1}`,
          explicitDuration: Number.isFinite(Number(step.duration)) ? Math.max(0, Number(step.duration)) : null,
          run: step.run,
        });
      });
    });

    if (this.flatSteps.length === 0) {
      throw new Error('TimelineDirector requires at least one step across stages.');
    }

    this._stepSpans = [];
    this._stageSpans = [];
    this._globalDuration = 0;
    this.#buildGlobalIndex();

    this.index = -1;
    this.lastCameraStage = -1;
    this.tl = null;
    this.t = 0;
    this.playing = false;
    this.complete = false;
    this._gen = 0;
    this._subs = new Set();

    this.jump(0, { play: false, emitCamera: true });
  }

  /** Total duration in seconds across all stages and steps. */
  getGlobalDuration() {
    return this._globalDuration;
  }

  /** Current global timeline position in seconds (0..getGlobalDuration()). */
  getGlobalTime() {
    const span = this._stepSpans[this.index];
    if (!span) return Math.max(0, this.t);
    return Math.min(this._globalDuration, span.start + Math.max(0, this.t));
  }

  /** Unified v2 timeline manifest for `window.__simulify.getTimelineInfo()`. */
  getTimelineInfo() {
    return {
      mode: 'director',
      duration: this._globalDuration,
      defaultFps: this.defaultFps,
      stages: this.stages.map((stage, stageIndex) => {
        const sSpan = this._stageSpans[stageIndex] || { start: 0, end: 0 };
        const steps = this.flatSteps
          .filter((st) => st.stageIndex === stageIndex)
          .map((st) => {
            const sp = this._stepSpans[st.globalIndex] || { start: sSpan.start, end: sSpan.start };
            return {
              id: st.id,
              title: st.title,
              start: sp.start,
              end: sp.end,
              summary: st.summary,
              carries: st.carries,
              hook: st.hook,
            };
          });
        return {
          id: stage.id ?? `stage-${stageIndex}`,
          index: stageIndex,
          title: stage.title ?? `Stage ${stageIndex + 1}`,
          start: sSpan.start,
          end: sSpan.end,
          carries: stage.carries ?? '',
          hook: stage.hook ?? '',
          steps,
        };
      }),
    };
  }

  /**
   * Deterministically seek to any global time `globalTimeSec` in [0, getGlobalDuration()],
   * cleanly crossing stage and step boundaries forward or backward without state drift.
   */
  seekGlobal(globalTimeSec, { emitCamera = true } = {}) {
    const total = this._globalDuration;
    const g = Math.max(0, Math.min(total, Number(globalTimeSec) || 0));

    let targetStep = this.flatSteps.length - 1;
    let localT = this._stepSpans[targetStep]?.duration ?? 0;

    for (let i = 0; i < this._stepSpans.length; i += 1) {
      const sp = this._stepSpans[i];
      const isLast = i === this._stepSpans.length - 1;
      if (g < sp.end - 1e-9 || (isLast && g <= sp.end + 1e-9)) {
        targetStep = i;
        localT = Math.max(0, Math.min(sp.duration, g - sp.start));
        break;
      }
    }

    if (targetStep === this.index && this.tl) {
      return this.seekTo(localT);
    }

    const wasPlaying = this.playing;
    const prevStage = this.index >= 0 ? this.flatSteps[this.index].stageIndex : -1;
    const stepMeta = this.#prepareStep(targetStep);
    this.playing = wasPlaying;

    const clampedLocal = Math.max(0, Math.min(this.tl.duration, localT));
    if (clampedLocal >= this.tl.duration - 1e-9 && targetStep === this.flatSteps.length - 1 && g >= total - 1e-9) {
      this.tl.finish();
      this.t = this.tl.duration;
      this.complete = true;
    } else {
      this.tl.seek(clampedLocal);
      this.t = clampedLocal;
      this.complete = false;
    }

    if (emitCamera && stepMeta.camera !== undefined && (prevStage !== stepMeta.stageIndex || this.lastCameraStage === -1)) {
      this.lastCameraStage = stepMeta.stageIndex;
      this.onStageCamera?.(stepMeta.camera, {
        stageIndex: stepMeta.stageIndex,
        stageId: stepMeta.stageId,
        stageTitle: stepMeta.stageTitle,
      });
    }

    const snap = this.getState();
    this.onStepChange?.(snap);
    this.#notify(snap);
    return snap;
  }

  setManualMode(enabled) {
    this.manualMode = Boolean(enabled);
    if (this.manualMode) this.playing = false;
    this.#notify();
    return this.manualMode;
  }

  /**
   * Deterministically rebuild the world from step 0 through `stepIndex - 1`, then enter `stepIndex` at t = 0.
   * @param {number} stepIndex
   * @param {{ play?: boolean, emitCamera?: boolean }} [opts]
   */
  jump(stepIndex, { play = true, emitCamera = true } = {}) {
    const prevStage = this.index >= 0 ? this.flatSteps[this.index].stageIndex : -1;
    const stepMeta = this.#prepareStep(stepIndex);
    this.playing = Boolean(play);

    if (emitCamera && stepMeta.camera !== undefined && (prevStage !== stepMeta.stageIndex || this.lastCameraStage === -1)) {
      this.lastCameraStage = stepMeta.stageIndex;
      this.onStageCamera?.(stepMeta.camera, {
        stageIndex: stepMeta.stageIndex,
        stageId: stepMeta.stageId,
        stageTitle: stepMeta.stageTitle,
      });
    }

    const snap = this.getState();
    this.onStepChange?.(snap);
    this.#notify(snap);
    return snap;
  }

  /**
   * Jump directly to the first step of a stage (by index or stage id).
   * @param {number|string} stageIdOrIndex
   * @param {{ play?: boolean, emitCamera?: boolean }} [opts]
   */
  jumpStage(stageIdOrIndex, opts = {}) {
    let stageIdx = -1;
    if (typeof stageIdOrIndex === 'number') {
      stageIdx = Math.max(0, Math.min(this.stages.length - 1, stageIdOrIndex));
    } else {
      stageIdx = this.stages.findIndex((s) => s.id === stageIdOrIndex);
    }
    if (stageIdx < 0) return this.getState();
    const firstStep = this.stageStarts[stageIdx] ?? 0;
    return this.jump(firstStep, opts);
  }

  /**
   * Scrub cleanly forward or backward within the current step without state drift.
   * @param {number} localTime
   */
  seekTo(localTime) {
    if (!this.tl) return this.getState();
    const clamped = Math.max(0, Math.min(this.tl.duration, Number(localTime) || 0));
    if (clamped < this.t) {
      // Deterministic rewind without re-triggering stage camera or step-change hooks
      const wasPlaying = this.playing;
      this.#prepareStep(this.index);
      this.playing = wasPlaying;
    }
    this.tl.seek(clamped);
    this.t = clamped;
    if (this.t < this.tl.duration) {
      this.complete = false;
    }
    const snap = this.getState();
    this.#notify(snap);
    return snap;
  }

  /**
   * Instantly jump (if requested) and finish the current step cleanly to its terminal state.
   * @param {number} [stepIndex]
   */
  showEnd(stepIndex = this.index) {
    const targetIdx = Math.max(0, Math.min(this.flatSteps.length - 1, Number(stepIndex) || 0));
    if (targetIdx !== this.index) {
      this.jump(targetIdx, { play: false, emitCamera: true });
    }
    this.tl.finish();
    this.t = this.tl.duration;
    this.playing = false;
    this.complete = this.index === this.flatSteps.length - 1;
    const snap = this.getState();
    this.onStepChange?.(snap);
    this.#notify(snap);
    return snap;
  }

  /**
   * Advance director clock by dt seconds.
   * @param {number} dt
   */
  tick(dt) {
    if (!this.playing || !this.tl || this.manualMode) return false;
    const delta = Math.max(0, Number(dt) || 0) * this.speed;
    if (delta <= 0) return false;

    this.t += delta;
    if (this.t < this.tl.duration) {
      this.tl.seek(this.t);
      this.#notify();
      return true;
    }

    // Reached end of current step
    this.tl.finish();
    if (this.autoAdvance && this.index < this.flatSteps.length - 1) {
      const prevStage = this.flatSteps[this.index].stageIndex;
      const nextIdx = this.index + 1;
      this.index = nextIdx;
      this.tl = this.#buildStepTimeline(nextIdx);
      this.t = 0;
      this.complete = false;
      this.tl.seek(0);

      const nextMeta = this.flatSteps[nextIdx];
      if (nextMeta.camera !== undefined && nextMeta.stageIndex !== prevStage) {
        this.lastCameraStage = nextMeta.stageIndex;
        this.onStageCamera?.(nextMeta.camera, {
          stageIndex: nextMeta.stageIndex,
          stageId: nextMeta.stageId,
          stageTitle: nextMeta.stageTitle,
        });
      }
      const snap = this.getState();
      this.onStepChange?.(snap);
      this.#notify(snap);
      return true;
    }

    this.t = this.tl.duration;
    this.playing = false;
    this.complete = this.index === this.flatSteps.length - 1;
    this.#notify();
    return true;
  }

  play() {
    if (this.complete && this.index === this.flatSteps.length - 1 && this.t >= this.tl.duration) {
      return this.jump(0, { play: true, emitCamera: true });
    }
    this.playing = true;
    this.#notify();
    return this.getState();
  }

  pause() {
    this.playing = false;
    this.#notify();
    return this.getState();
  }

  toggle() {
    return this.playing ? this.pause() : this.play();
  }

  setSpeed(mult) {
    this.speed = Math.max(0.05, Math.min(16, Number(mult) || 1));
    this.#notify();
    return this.speed;
  }

  nextStep({ play = true } = {}) {
    if (this.index < this.flatSteps.length - 1) {
      return this.jump(this.index + 1, { play, emitCamera: true });
    }
    return this.showEnd(this.index);
  }

  prevStep({ play = true } = {}) {
    if (this.t > 0.25) {
      return this.seekTo(0);
    }
    return this.jump(Math.max(0, this.index - 1), { play, emitCamera: true });
  }

  nextStage({ play = true } = {}) {
    const curStage = this.flatSteps[this.index].stageIndex;
    return this.jumpStage(Math.min(this.stages.length - 1, curStage + 1), { play, emitCamera: true });
  }

  prevStage({ play = true } = {}) {
    const curStage = this.flatSteps[this.index].stageIndex;
    const stageStart = this.stageStarts[curStage] ?? 0;
    if (this.index > stageStart || this.t > 0.25) {
      return this.jumpStage(curStage, { play, emitCamera: true });
    }
    return this.jumpStage(Math.max(0, curStage - 1), { play, emitCamera: true });
  }

  getState() {
    const meta = this.flatSteps[this.index] || this.flatSteps[0];
    const dur = this.tl?.duration ?? 0;
    const stepProgress = dur > 0 ? Math.min(1, Math.max(0, this.t / dur)) : 1;
    const totalProgress = (this.index + stepProgress) / this.flatSteps.length;
    const globalTime = this.getGlobalTime();
    return {
      stepIndex: this.index,
      stepCount: this.flatSteps.length,
      stageIndex: meta.stageIndex,
      stageCount: this.stages.length,
      stageId: meta.stageId,
      stageTitle: meta.stageTitle,
      stepId: meta.id,
      stepTitle: meta.title,
      summary: meta.summary,
      carries: meta.carries,
      hook: meta.hook,
      relates: meta.relates,
      t: this.t,
      duration: dur,
      globalTime,
      globalDuration: this._globalDuration,
      stepProgress,
      totalProgress,
      progress: this._globalDuration > 0 ? Math.min(1, Math.max(0, globalTime / this._globalDuration)) : totalProgress,
      speed: this.speed,
      playing: this.playing,
      complete: this.complete,
    };
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._subs.add(fn);
    fn(this.getState());
    return () => this._subs.delete(fn);
  }

  destroy() {
    this.playing = false;
    this._subs.clear();
  }

  #buildGlobalIndex() {
    let cursor = 0;
    this._stepSpans = [];
    this._stageSpans = this.stages.map(() => ({ start: Infinity, end: 0 }));

    this.flatSteps.forEach((step, idx) => {
      const dryTl = this.#buildStepTimeline(idx);
      const dur = step.explicitDuration !== null
        ? Math.max(step.explicitDuration, dryTl.duration)
        : dryTl.duration;
      const start = cursor;
      const end = cursor + dur;
      this._stepSpans.push({ start, end, duration: dur });

      const stSpan = this._stageSpans[step.stageIndex];
      stSpan.start = Math.min(stSpan.start, start);
      stSpan.end = Math.max(stSpan.end, end);
      cursor = end;
    });

    for (const stSpan of this._stageSpans) {
      if (!Number.isFinite(stSpan.start)) stSpan.start = 0;
    }
    this._globalDuration = cursor;
  }

  #prepareStep(stepIndex) {
    const targetIdx = Math.max(0, Math.min(this.flatSteps.length - 1, Number(stepIndex) || 0));
    this._gen += 1;

    this.onReset?.(this.ctx);
    for (let i = 0; i < targetIdx; i += 1) {
      const priorTl = this.#buildStepTimeline(i);
      priorTl.finish();
    }

    this.index = targetIdx;
    this.tl = this.#buildStepTimeline(targetIdx);
    this.t = 0;
    this.complete = false;
    this.tl.seek(0);
    return this.flatSteps[targetIdx];
  }

  #buildStepTimeline(idx) {
    const tl = new TrackTimeline();
    const step = this.flatSteps[idx];
    if (step && typeof step.run === 'function') {
      step.run(tl, this.ctx);
    }
    return tl;
  }

  #notify(snapshot = null) {
    const state = snapshot || this.getState();
    for (const fn of this._subs) {
      fn(state);
    }
  }
}

/**
 * Continuous phase scrubber & time-dilation controller for T1 (transient/periodic)
 * and T2 (continuous slow evolution with fast-forward / jump-to-steady-state).
 */
export class PhaseScrubber {
  constructor({
    duration = 1,
    loop = true,
    speed = 1,
    steadyTime = null,
    playing = true,
    onEvaluate = null,
  } = {}) {
    this.duration = Math.max(1e-4, Number(duration) || 1);
    this.loop = Boolean(loop);
    this.speed = Math.max(0.02, Number(speed) || 1);
    this.steadyTime = steadyTime !== null ? Math.max(0, Math.min(this.duration, Number(steadyTime))) : this.duration;
    this.playing = Boolean(playing);
    this.onEvaluate = typeof onEvaluate === 'function' ? onEvaluate : null;
    this.t = 0;
    this._subs = new Set();
    this.#evaluate();
  }

  play() {
    if (!this.loop && this.t >= this.duration) this.t = 0;
    this.playing = true;
    this.#evaluate();
  }

  pause() {
    this.playing = false;
    this.#notify();
  }

  freeze() {
    return this.pause();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(mult) {
    this.speed = Math.max(0.02, Math.min(32, Number(mult) || 1));
    this.#notify();
  }

  scrub(t) {
    const raw = Number(t) || 0;
    this.t = this.loop
      ? ((raw % this.duration) + this.duration) % this.duration
      : Math.max(0, Math.min(this.duration, raw));
    this.#evaluate();
    return this.getState();
  }

  scrubNorm(u) {
    return this.scrub((Number(u) || 0) * this.duration);
  }

  jumpToSteady() {
    this.playing = false;
    this.t = this.steadyTime;
    this.#evaluate();
    return this.getState();
  }

  reset() {
    this.t = 0;
    this.#evaluate();
    return this.getState();
  }

  tick(dt) {
    if (!this.playing) return false;
    const step = Math.max(0, Number(dt) || 0) * this.speed;
    if (step <= 0) return false;
    let next = this.t + step;
    if (this.loop) {
      next %= this.duration;
    } else if (next >= this.duration) {
      next = this.duration;
      this.playing = false;
    }
    this.t = next;
    this.#evaluate();
    return true;
  }

  getState() {
    return {
      t: this.t,
      globalTime: this.t,
      duration: this.duration,
      globalDuration: this.duration,
      norm: this.t / this.duration,
      progress: this.t / this.duration,
      speed: this.speed,
      playing: this.playing,
      loop: this.loop,
    };
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._subs.add(fn);
    fn(this.getState());
    return () => this._subs.delete(fn);
  }

  #evaluate() {
    const snap = this.getState();
    this.onEvaluate?.(snap.norm, snap.t, snap);
    this.#notify(snap);
  }

  #notify(snap = null) {
    const s = snap || this.getState();
    for (const fn of this._subs) {
      fn(s);
    }
  }
}

function isSpacetimeClock(ctrl) {
  return Boolean(ctrl && typeof ctrl.jumpToBeat === 'function' && typeof ctrl.seek === 'function');
}

function isTimelineDirector(ctrl) {
  return Boolean(ctrl && typeof ctrl.seekGlobal === 'function' && Array.isArray(ctrl.flatSteps));
}

function isPhaseScrubber(ctrl) {
  return Boolean(ctrl && typeof ctrl.scrub === 'function' && typeof ctrl.jumpToSteady === 'function');
}

/**
 * Mount a standard accessible chapter/4D timeline control dock bound to either
 * `TimelineDirector` or `SpacetimeClock`. Always provides an interactive pointer-drag
 * scrubber with beat markers, speed dilation (`0.25x / 0.5x / 1x / 2x`), play/pause,
 * and act/beat jump pills.
 *
 * @param {HTMLElement} containerEl
 * @param {TimelineDirector | import('./spacetime.js').SpacetimeClock} controller
 * @param {{
 *   speeds?: number[],
 *   showStages?: boolean,
 *   showEndButton?: boolean,
 *   globalScrub?: boolean,
 *   showBeatMarkers?: boolean,
 *   labels?: Record<string, string>,
 * }} [opts]
 */
export function mountTimelineBar(
  containerEl,
  controller,
  {
    speeds = [0.25, 0.5, 1, 2],
    showStages = true,
    showEndButton = undefined,
    globalScrub = undefined,
    showBeatMarkers = true,
    labels = {},
  } = {}
) {
  if (!containerEl || !controller) {
    throw new Error('mountTimelineBar requires both a container element and a TimelineDirector or SpacetimeClock instance.');
  }

  const isClock = isSpacetimeClock(controller);
  const useGlobalScrub = globalScrub !== undefined ? Boolean(globalScrub) : isClock;
  const displayEndBtn = showEndButton !== undefined ? Boolean(showEndButton) : !isClock;

  let copy = {
    prev: '上一步',
    play: '播放',
    pause: '暂停',
    next: '下一步',
    end: '直达终态',
    ...labels,
  };

  const root = document.createElement('div');
  root.className = 'timeline-dock';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', '分幕时间轴控制');

  const timelineInfo = typeof controller.getTimelineInfo === 'function'
    ? controller.getTimelineInfo()
    : { stages: [], duration: 0 };
  const stageList = isClock ? (controller.acts || timelineInfo.stages || []) : (controller.stages || []);

  const stageBtns = [];
  if (showStages && stageList.length > 0) {
    const stageRow = document.createElement('div');
    stageRow.className = 'timeline-stages';
    stageRow.setAttribute('role', 'tablist');
    stageRow.setAttribute('aria-label', '章节分幕');

    stageList.forEach((stage, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'timeline-stage-btn';
      btn.textContent = stage.title || `第 ${idx + 1} 幕`;
      btn.addEventListener('click', () => {
        if (isClock) {
          controller.jumpToAct(stage.id ?? idx, { play: true });
        } else {
          controller.jumpStage(idx, { play: true, emitCamera: true });
        }
      });
      stageRow.append(btn);
      stageBtns.push(btn);
    });
    root.append(stageRow);
  }

  const controlsRow = document.createElement('div');
  controlsRow.className = 'timeline-controls';

  const makeBtn = (label, ariaLabel, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'timeline-btn';
    b.textContent = label;
    b.setAttribute('aria-label', ariaLabel);
    b.addEventListener('click', onClick);
    return b;
  };

  const prevBtn = makeBtn(copy.prev, copy.prev, () => {
    if (isClock) controller.prevBeat();
    else controller.prevStep();
  });
  const playBtn = makeBtn(copy.play, `${copy.play}/${copy.pause}`, () => controller.toggle());
  const nextBtn = makeBtn(copy.next, copy.next, () => {
    if (isClock) controller.nextBeat();
    else controller.nextStep();
  });

  // Scrubber wrapper supporting continuous pointer-drag scrubbing + beat markers
  const scrubWrap = document.createElement('div');
  scrubWrap.className = 'timeline-scrub-wrap';
  scrubWrap.style.position = 'relative';
  scrubWrap.style.display = 'flex';
  scrubWrap.style.alignItems = 'center';
  scrubWrap.style.flex = '1 1 130px';
  scrubWrap.style.minInlineSize = '100px';
  scrubWrap.style.maxInlineSize = '260px';

  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'timeline-scrub';
  scrub.min = '0';
  scrub.max = '1000';
  scrub.step = '1';
  scrub.value = '0';
  scrub.style.width = '100%';
  scrub.style.maxInlineSize = 'none';
  scrub.setAttribute('aria-label', 'Timeline scrub');

  const applyScrubFraction = (frac) => {
    const u = Math.max(0, Math.min(1, Number(frac) || 0));
    if (isClock) {
      controller.seek(u * controller.duration);
    } else if (useGlobalScrub && typeof controller.seekGlobal === 'function') {
      controller.seekGlobal(u * controller.getGlobalDuration());
    } else {
      const dur = controller.getState().duration || 0;
      controller.seekTo(u * dur);
    }
  };

  let dragging = false;
  scrub.addEventListener('pointerdown', () => {
    dragging = true;
    controller.pause?.();
  });
  scrub.addEventListener('pointerup', () => {
    dragging = false;
  });
  scrub.addEventListener('pointercancel', () => {
    dragging = false;
  });
  scrub.addEventListener('input', () => {
    applyScrubFraction(Number(scrub.value) / 1000);
  });

  scrubWrap.append(scrub);

  // Beat / Act bookmark tick markers
  const ticksEl = document.createElement('div');
  ticksEl.className = 'timeline-beat-ticks';
  ticksEl.setAttribute('aria-hidden', 'true');
  ticksEl.style.position = 'absolute';
  ticksEl.style.inset = '0 7px';
  ticksEl.style.pointerEvents = 'none';

  const renderBeatMarkers = () => {
    ticksEl.replaceChildren();
    if (!showBeatMarkers) return;
    const info = typeof controller.getTimelineInfo === 'function' ? controller.getTimelineInfo() : null;
    const total = info?.duration || 0;
    if (total <= 0) return;
    const markers = isClock
      ? (info.beats || info.stages || [])
      : (useGlobalScrub ? (info.stages || []) : []);
    for (const m of markers) {
      if (!Number.isFinite(m.start) || m.start <= 0 || m.start >= total) continue;
      const pct = (m.start / total) * 100;
      const tick = document.createElement('span');
      tick.className = 'timeline-beat-tick';
      tick.title = m.title || '';
      tick.style.position = 'absolute';
      tick.style.left = `${pct.toFixed(2)}%`;
      tick.style.top = '50%';
      tick.style.width = '2px';
      tick.style.height = '8px';
      tick.style.transform = 'translate(-50%, -50%)';
      tick.style.borderRadius = '1px';
      tick.style.background = 'currentColor';
      tick.style.opacity = '0.35';
      ticksEl.append(tick);
    }
  };
  renderBeatMarkers();
  scrubWrap.append(ticksEl);

  const timeLabel = document.createElement('span');
  timeLabel.className = 'timeline-time';

  const validSpeeds = Array.isArray(speeds) && speeds.length > 0 ? speeds : [0.25, 0.5, 1, 2];
  const speedBtn = makeBtn(`${controller.speed}×`, 'Speed', () => {
    const cur = controller.speed;
    const idx = validSpeeds.findIndex((v) => Math.abs(v - cur) < 1e-3);
    const next = validSpeeds[(idx + 1) % validSpeeds.length];
    controller.setSpeed(next);
  });

  controlsRow.append(prevBtn, playBtn, nextBtn, scrubWrap, timeLabel, speedBtn);

  let endBtn = null;
  if (displayEndBtn) {
    endBtn = makeBtn(copy.end, copy.end, () => {
      if (isClock) {
        controller.pause();
        controller.seek(controller.duration);
      } else {
        controller.showEnd();
      }
    });
    controlsRow.append(endBtn);
  }

  root.append(controlsRow);
  containerEl.append(root);

  const renderState = (state) => {
    stageBtns.forEach((btn, idx) => {
      if (idx === state.stageIndex) {
        btn.setAttribute('aria-current', 'step');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    prevBtn.textContent = copy.prev;
    nextBtn.textContent = copy.next;
    playBtn.textContent = state.playing ? copy.pause : copy.play;
    playBtn.setAttribute('aria-pressed', String(Boolean(state.playing)));
    if (endBtn) endBtn.textContent = copy.end;

    const totalDur = isClock
      ? state.duration
      : useGlobalScrub
        ? (state.globalDuration ?? state.duration)
        : state.duration;
    const curT = isClock
      ? state.t
      : useGlobalScrub
        ? (state.globalTime ?? state.t)
        : state.t;

    prevBtn.disabled = isClock
      ? state.t <= 0.05
      : state.stepIndex === 0 && state.t <= 0.05;
    nextBtn.disabled = isClock
      ? state.beatIndex >= state.beatCount - 1 && state.complete
      : state.stepIndex >= state.stepCount - 1 && state.complete;
    scrub.disabled = totalDur <= 0;
    if (!dragging) {
      scrub.value = totalDur > 0 ? String(Math.round((curT / totalDur) * 1000)) : '0';
    }
    timeLabel.textContent = isClock
      ? `${curT.toFixed(1)}s / ${totalDur.toFixed(1)}s`
      : useGlobalScrub
        ? `${state.stepIndex + 1}/${state.stepCount} · ${curT.toFixed(1)}/${totalDur.toFixed(1)}s`
        : `${state.stepIndex + 1}/${state.stepCount} · ${state.t.toFixed(1)}s`;
    speedBtn.textContent = `${state.speed}×`;
  };

  const unsub = controller.subscribe(renderState);

  return {
    root,
    scrub,
    unsub,
    refreshMarkers: renderBeatMarkers,
    setLabels(nextLabels = {}) {
      copy = { ...copy, ...nextLabels };
      renderState(controller.getState());
    },
    unmount() {
      unsub();
      root.remove();
    },
  };
}

/**
 * Parse URL deep-linking query parameters:
 * `?stage=&step=&t=&paused&end&thumb=1&export=stage|caption|hud&lang=&backend=`.
 * @param {string} [search='']
 */
export function parseUrlState(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const rawStage = params.get('stage');
  const rawStep = params.get('step');
  const rawT = params.get('t');
  const rawExport = params.get('export');
  const stageNum = rawStage !== null && /^\d+$/.test(rawStage) ? Number(rawStage) : rawStage;
  const stepNum = rawStep !== null && /^\d+$/.test(rawStep) ? Number(rawStep) : null;
  const timeVal = rawT !== null && Number.isFinite(Number(rawT)) ? Number(rawT) : null;

  let exportMode = null;
  if (params.has('export')) {
    const val = (rawExport || '').toLowerCase();
    if (val === 'stage' || val === 'caption' || val === 'hud') {
      exportMode = val;
    } else if (val === '1' || val === 'true' || val === '') {
      exportMode = 'caption';
    }
  }

  return {
    stage: rawStage !== null ? stageNum : null,
    step: stepNum,
    t: timeVal,
    paused: params.has('paused'),
    end: params.has('end'),
    thumb: params.get('thumb') === '1' || params.has('thumb'),
    exportMode,
    export: exportMode,
    backend: params.get('backend'),
    lang: params.get('lang'),
  };
}

/**
 * Deterministically position a `TimelineDirector` or `SpacetimeClock` from URL query parameters
 * for deep-linking, headless Playwright verification, video export, and thumbnail baking.
 * @param {TimelineDirector | import('./spacetime.js').SpacetimeClock} controller
 * @param {string} [search]
 */
export function applyUrlState(controller, search = globalThis.location?.search || '') {
  if (!controller) return null;
  const parsed = parseUrlState(search);

  if (typeof document !== 'undefined') {
    if (parsed.thumb) document.documentElement.dataset.thumb = '1';
    if (parsed.exportMode) document.documentElement.dataset.export = parsed.exportMode;
  }

  const hasPositionParam = parsed.stage !== null || parsed.step !== null || parsed.end || parsed.paused || parsed.t !== null;
  if (!hasPositionParam) return parsed;

  const autoPlay = !parsed.paused && !parsed.end && parsed.t === null;

  if (isSpacetimeClock(controller)) {
    if (parsed.t !== null) {
      controller.seek(parsed.t);
      if (parsed.paused) controller.pause();
    } else if (parsed.stage !== null) {
      controller.jumpToAct(parsed.stage, { play: autoPlay });
      if (parsed.end) {
        const act = controller.getActAt(controller.t);
        controller.pause();
        controller.seek(act?.end ?? controller.duration);
      }
    } else if (parsed.step !== null) {
      controller.jumpToBeat(parsed.step, { play: autoPlay });
    } else if (parsed.end) {
      controller.pause();
      controller.seek(controller.duration);
    } else if (parsed.paused) {
      controller.pause();
    }
    return parsed;
  }

  if (parsed.stage !== null) {
    controller.jumpStage(parsed.stage, { play: autoPlay, emitCamera: true });
    if (parsed.step !== null) {
      const state = controller.getState();
      const stageStart = controller.stageStarts[state.stageIndex] ?? 0;
      const targetStep = stageStart + Math.max(0, parsed.step);
      controller.jump(targetStep, { play: autoPlay, emitCamera: true });
    }
  } else if (parsed.step !== null) {
    controller.jump(parsed.step, { play: autoPlay, emitCamera: true });
  }

  if (parsed.end) {
    controller.showEnd();
  } else if (parsed.t !== null) {
    if (parsed.stage === null && parsed.step === null && typeof controller.seekGlobal === 'function' && parsed.t > (controller.tl?.duration ?? 0)) {
      controller.seekGlobal(parsed.t);
    } else {
      controller.seekTo(parsed.t);
    }
    if (parsed.paused) controller.pause();
  } else if (parsed.paused) {
    controller.pause();
  }
  return parsed;
}

/**
 * Expose the unified `window.__simulify` v2 contract (100% backward-compatible with v1 hooks)
 * for Tier 1 in-browser export, Tier 2 Playwright studio video export, and v2 4D verification.
 *
 * @param {TimelineDirector | import('./spacetime.js').SpacetimeClock | PhaseScrubber | null} controller
 * @param {Record<string, any>} [extra]
 */
export function exposeTestHooks(controller, extra = {}) {
  const isClock = isSpacetimeClock(controller);
  const isDirector = isTimelineDirector(controller);
  const isScrubber = isPhaseScrubber(controller);

  const resolveStage = () => extra.stage || extra.scene?.stage || null;
  const resolveCallouts = () => extra.callouts || extra.scene?.callouts || null;
  const resolveSound = () => extra.sound || extra.scene?.sound || null;
  const choreographer = extra.choreographer || null;

  const exportRestore = {
    active: false,
    prevPlaying: false,
    prevMuted: false,
    prevExportAttr: null,
  };

  const getTimelineInfo = () => {
    if (typeof extra.getTimelineInfo === 'function') {
      return extra.getTimelineInfo();
    }
    if (isClock || isDirector) {
      return controller.getTimelineInfo();
    }
    if (isScrubber) {
      return {
        mode: 'scrubber',
        duration: controller.duration,
        defaultFps: 60,
        stages: [{
          id: 'phase',
          index: 0,
          title: 'Phase',
          start: 0,
          end: controller.duration,
          carries: '',
          hook: '',
          steps: [{
            id: 'phase-0',
            title: 'Phase',
            start: 0,
            end: controller.duration,
            summary: '',
            carries: '',
            hook: '',
          }],
        }],
      };
    }
    return { mode: 'static', duration: 0, defaultFps: 60, stages: [] };
  };

  const seek = (globalTimeSec) => {
    const t = Math.max(0, Number(globalTimeSec) || 0);
    let snap = null;

    if (isClock) {
      snap = controller.seek(t);
    } else if (isDirector) {
      snap = controller.seekGlobal(t, { emitCamera: true });
    } else if (isScrubber) {
      snap = controller.scrub(t);
    }

    const stage = resolveStage();
    if (choreographer) {
      const choreoState = choreographer.evaluate(t, { apply: true, stage });
      if (choreoState?.cameraPose && stage?.setCameraImmediate) {
        stage.setCameraImmediate(choreoState.cameraPose);
      }
    }

    if (typeof extra.onSeek === 'function') {
      extra.onSeek(t, snap);
    }
    if (typeof extra.syncAll === 'function') {
      extra.syncAll(t);
    }

    const callouts = resolveCallouts();
    if (callouts && typeof callouts.update === 'function') {
      callouts.update();
    }
    if (stage && typeof stage.renderNow === 'function') {
      stage.renderNow();
    }
    return snap || (controller?.getState ? controller.getState() : { t });
  };

  const enterExportMode = ({ hud = 'caption', width = null, height = null, dpr = 1, muteAudio = true } = {}) => {
    const stage = resolveStage();
    const sound = resolveSound();
    if (!exportRestore.active) {
      exportRestore.active = true;
      exportRestore.prevPlaying = Boolean(controller?.playing);
      exportRestore.prevMuted = Boolean(sound?.isMuted?.());
      exportRestore.prevExportAttr = typeof document !== 'undefined'
        ? (document.documentElement.dataset.export ?? null)
        : null;
    }

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.export = hud || 'caption';
    }

    controller?.pause?.();
    controller?.setManualMode?.(true);
    stage?.setManualMode?.(true);

    if (muteAudio && sound?.setMuted) {
      sound.setMuted(true);
    }
    if (width && height && stage?.setExportSize) {
      stage.setExportSize(Number(width), Number(height), Number(dpr) || 1);
    }
    if (typeof extra.onEnterExportMode === 'function') {
      extra.onEnterExportMode({ hud, width, height, dpr, muteAudio });
    }
    return { ok: true, hud, width, height, dpr };
  };

  const exitExportMode = () => {
    const stage = resolveStage();
    const sound = resolveSound();

    if (typeof document !== 'undefined') {
      if (exportRestore.prevExportAttr !== null) {
        document.documentElement.dataset.export = exportRestore.prevExportAttr;
      } else {
        delete document.documentElement.dataset.export;
      }
    }

    if (stage?.restoreSize) {
      stage.restoreSize();
    } else if (stage?.setExportSize) {
      stage.setExportSize(null);
    }
    stage?.setManualMode?.(false);
    controller?.setManualMode?.(false);

    if (sound?.setMuted) {
      sound.setMuted(exportRestore.prevMuted);
    }
    if (typeof extra.onExitExportMode === 'function') {
      extra.onExitExportMode();
    }
    if (exportRestore.prevPlaying) {
      controller?.play?.();
    }
    exportRestore.active = false;
    stage?.renderNow?.();
    return { ok: true };
  };

  const getCaptureTargets = () => {
    const stage = resolveStage();
    const callouts = resolveCallouts();
    const hasDoc = typeof document !== 'undefined';
    const rootEl = extra.rootEl || (hasDoc ? document.querySelector('.artboard-shell') || document.body : null);
    const stageCanvas = stage?.canvas || (hasDoc ? document.querySelector('#stage-canvas, canvas.stage-canvas, canvas') : null);
    const stageSvg = hasDoc ? document.querySelector('.stage-2d-svg') : null;
    const overlayEls = hasDoc
      ? Array.from(document.querySelectorAll('#leader-svg, #tags-layer, #popups-layer, .hud-top-left, .top-ribbon, .hud-guide, .right-dock, .hud-bottom-left, .bottom-left-dock, .hud-bottom-center, .bottom-transport'))
      : [];
    return {
      rootEl,
      stageCanvas,
      stageSvg,
      overlayEls,
      callouts,
      stage,
      renderNow: () => stage?.renderNow?.(),
    };
  };

  const getCaptionState = () => {
    if (typeof extra.getCaptionState === 'function') {
      return extra.getCaptionState();
    }
    const st = controller?.getState ? controller.getState() : {};
    const info = getTimelineInfo();
    const t = st.globalTime ?? st.t ?? 0;
    const duration = info.duration || st.globalDuration || st.duration || 0;
    const hasDoc = typeof document !== 'undefined';
    const domTitle = hasDoc ? (document.querySelector('#act-title, #lesson-title')?.textContent?.trim() || '') : '';
    const domCue = hasDoc ? (document.querySelector('#act-cue, #lesson-cue')?.textContent?.trim() || '') : '';
    const liveEqText = hasDoc
      ? Array.from(document.querySelectorAll('.eq-line')).map((el) => el.textContent?.trim()).filter(Boolean).join(' | ')
      : '';

    return {
      stageIndex: st.stageIndex ?? 0,
      stageCount: st.stageCount ?? info.stages.length,
      stageTitle: st.stageTitle || domTitle || '',
      stepTitle: st.stepTitle || domTitle || '',
      caption: st.summary || domCue || '',
      carries: st.carries || '',
      hook: st.hook || '',
      progress: duration > 0 ? Math.max(0, Math.min(1, t / duration)) : (st.totalProgress ?? 0),
      t,
      duration,
      liveEqText,
    };
  };

  const getActiveActorCount = (t = undefined) => {
    if (typeof extra.getActiveActorCount === 'function') {
      return extra.getActiveActorCount(t);
    }
    if (choreographer) {
      const targetT = t !== undefined ? t : (controller?.getState?.().globalTime ?? controller?.t ?? 0);
      return choreographer.getActiveActorCount(targetT);
    }
    return null;
  };

  const getMotionMagnitude = (t0, t1) => {
    if (typeof extra.getMotionMagnitude === 'function') {
      return extra.getMotionMagnitude(t0, t1);
    }
    if (choreographer) {
      const p0 = choreographer.getCameraPoseAt(t0);
      const p1 = choreographer.getCameraPoseAt(t1);
      if (p0 && p1) {
        const dAz = Math.abs((p1.azimuth ?? 0) - (p0.azimuth ?? 0));
        const dEl = Math.abs((p1.elevation ?? 0) - (p0.elevation ?? 0));
        const dZoom = Math.abs((p1.zoom ?? 1) - (p0.zoom ?? 1));
        const tA = p0.target || [0, 0, 0];
        const tB = p1.target || [0, 0, 0];
        const dTarget = Math.hypot(tB[0] - tA[0], tB[1] - tA[1], tB[2] - tA[2]);
        return dAz * 2 + dEl * 2 + dZoom + dTarget * 0.5;
      }
    }
    return null;
  };

  const setParams = typeof extra.setParams === 'function'
    ? extra.setParams
    : typeof extra.engine?.setParams === 'function'
      ? (patch) => {
          const res = extra.engine.setParams(patch);
          extra.syncAll?.();
          resolveStage()?.renderNow?.();
          return res;
        }
      : undefined;

  const setLang = typeof extra.setLang === 'function'
    ? extra.setLang
    : typeof extra.i18n?.setLang === 'function'
      ? (lang) => extra.i18n.setLang(lang)
      : undefined;

  globalThis.__simulify = {
    ...extra,
    version: extra.version ?? 2,
    director: isDirector ? controller : (extra.director ?? null),
    clock: isClock ? controller : (extra.clock ?? null),
    scrubber: isScrubber ? controller : (extra.scrubber ?? null),
    choreographer,
    getTimelineInfo,
    enterExportMode,
    seek,
    exitExportMode,
    getCaptureTargets,
    getCaptionState,
    getActiveActorCount,
    getMotionMagnitude,
    ...(setParams ? { setParams } : {}),
    ...(setLang ? { setLang } : {}),
  };
  globalThis.__ready = true;
  return globalThis.__simulify;
}
