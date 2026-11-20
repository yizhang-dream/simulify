/**
 * Deterministic multi-stage timeline & time-scaling engine for interactive primers.
 * Supports T1/T2 continuous phase scrubbing & speed control (PhaseScrubber) and
 * T3/T4 chapter-scale deterministic fast-forward / backward scrub / stage cameras
 * (TrackTimeline + TimelineDirector + mountTimelineBar).
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
   * Note: Backward scrubbing should reset and replay via TimelineDirector.seekTo().
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
 * T4 (progressive chapter-scale world assembly).
 */
export class TimelineDirector {
  /**
   * @param {{
   *   stages: Array<{ id: string, title: string, camera?: any, summary?: string, steps: Array<{ id: string, title: string, run: (tl: TrackTimeline, ctx: any) => void }> }>,
   *   ctx?: any,
   *   onReset?: (ctx: any) => void,
   *   onStageCamera?: (camera: any, stageMeta: { stageIndex: number, stageId: string, stageTitle: string }) => void,
   *   onStepChange?: (state: any) => void,
   *   speed?: number,
   *   autoAdvance?: boolean
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
          run: step.run,
        });
      });
    });

    if (this.flatSteps.length === 0) {
      throw new Error('TimelineDirector requires at least one step across stages.');
    }

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
    if (!this.playing || !this.tl) return false;
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
      stepProgress,
      totalProgress,
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
      duration: this.duration,
      norm: this.t / this.duration,
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

/**
 * Mount a standard accessible chapter/timeline control dock bound to TimelineDirector.
 * @param {HTMLElement} containerEl
 * @param {TimelineDirector} director
 * @param {{ speeds?: number[], showStages?: boolean, showEndButton?: boolean, labels?: Record<string, string> }} [opts]
 */
export function mountTimelineBar(containerEl, director, { speeds = [0.5, 1, 2], showStages = true, showEndButton = true, labels = {} } = {}) {
  if (!containerEl || !director) {
    throw new Error('mountTimelineBar requires both a container element and a TimelineDirector instance.');
  }

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

  const stageBtns = [];
  if (showStages && director.stages.length > 0) {
    const stageRow = document.createElement('div');
    stageRow.className = 'timeline-stages';
    stageRow.setAttribute('role', 'tablist');
    stageRow.setAttribute('aria-label', '章节分幕');

    director.stages.forEach((stage, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'timeline-stage-btn';
      btn.textContent = stage.title || `第 ${idx + 1} 幕`;
      btn.addEventListener('click', () => director.jumpStage(idx, { play: true, emitCamera: true }));
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

  const prevBtn = makeBtn(copy.prev, copy.prev, () => director.prevStep());
  const playBtn = makeBtn(copy.play, `${copy.play}/${copy.pause}`, () => director.toggle());
  const nextBtn = makeBtn(copy.next, copy.next, () => director.nextStep());

  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'timeline-scrub';
  scrub.min = '0';
  scrub.max = '1000';
  scrub.step = '1';
  scrub.value = '0';
  scrub.setAttribute('aria-label', 'Timeline scrub');
  scrub.addEventListener('input', () => {
    const dur = director.getState().duration || 0;
    director.seekTo((Number(scrub.value) / 1000) * dur);
  });

  const timeLabel = document.createElement('span');
  timeLabel.className = 'timeline-time';

  const validSpeeds = Array.isArray(speeds) && speeds.length > 0 ? speeds : [0.5, 1, 2];
  const speedBtn = makeBtn(`${director.speed}×`, 'Speed', () => {
    const cur = director.speed;
    const idx = validSpeeds.findIndex((v) => Math.abs(v - cur) < 1e-3);
    const next = validSpeeds[(idx + 1) % validSpeeds.length];
    director.setSpeed(next);
  });

  controlsRow.append(prevBtn, playBtn, nextBtn, scrub, timeLabel, speedBtn);

  let endBtn = null;
  if (showEndButton) {
    endBtn = makeBtn(copy.end, copy.end, () => director.showEnd());
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
    playBtn.setAttribute('aria-pressed', String(state.playing));
    if (endBtn) endBtn.textContent = copy.end;
    prevBtn.disabled = state.stepIndex === 0 && state.t <= 0.05;
    nextBtn.disabled = state.stepIndex >= state.stepCount - 1 && state.complete;
    scrub.disabled = state.duration <= 0;
    scrub.value = state.duration > 0 ? String(Math.round((state.t / state.duration) * 1000)) : '0';
    timeLabel.textContent = `${state.stepIndex + 1}/${state.stepCount} · ${state.t.toFixed(1)}s`;
    speedBtn.textContent = `${state.speed}×`;
  };

  const unsub = director.subscribe(renderState);

  return {
    root,
    unsub,
    setLabels(nextLabels = {}) {
      copy = { ...copy, ...nextLabels };
      renderState(director.getState());
    },
    unmount() {
      unsub();
      root.remove();
    },
  };
}

/**
 * Parse URL deep-linking query parameters: `?stage=&step=&t=&paused&end&thumb=1`.
 * @param {string} [search='']
 */
export function parseUrlState(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const rawStage = params.get('stage');
  const rawStep = params.get('step');
  const rawT = params.get('t');
  const stageNum = rawStage !== null && /^\d+$/.test(rawStage) ? Number(rawStage) : rawStage;
  const stepNum = rawStep !== null && /^\d+$/.test(rawStep) ? Number(rawStep) : null;
  const timeVal = rawT !== null && Number.isFinite(Number(rawT)) ? Number(rawT) : null;
  return {
    stage: rawStage !== null ? stageNum : null,
    step: stepNum,
    t: timeVal,
    paused: params.has('paused'),
    end: params.has('end'),
    thumb: params.get('thumb') === '1' || params.has('thumb'),
    lang: params.get('lang'),
  };
}

/**
 * Deterministically position a TimelineDirector from URL query parameters
 * for deep-linking, headless Playwright verification, and thumbnail baking.
 * @param {TimelineDirector} director
 * @param {string} [search]
 */
export function applyUrlState(director, search = globalThis.location?.search || '') {
  if (!director) return null;
  const parsed = parseUrlState(search);
  const hasPositionParam = parsed.stage !== null || parsed.step !== null || parsed.end || parsed.paused || parsed.t !== null;
  if (!hasPositionParam) return parsed;

  const autoPlay = !parsed.paused && !parsed.end && parsed.t === null;
  if (parsed.stage !== null) {
    director.jumpStage(parsed.stage, { play: autoPlay, emitCamera: true });
    if (parsed.step !== null) {
      const state = director.getState();
      const stageStart = director.stageStarts[state.stageIndex] ?? 0;
      const targetStep = stageStart + Math.max(0, parsed.step);
      director.jump(targetStep, { play: autoPlay, emitCamera: true });
    }
  } else if (parsed.step !== null) {
    director.jump(parsed.step, { play: autoPlay, emitCamera: true });
  }

  if (parsed.end) {
    director.showEnd();
  } else if (parsed.t !== null) {
    director.seekTo(parsed.t);
    if (parsed.paused) director.pause();
  } else if (parsed.paused) {
    director.pause();
  }
  return parsed;
}

/**
 * Expose clean test and inspection hooks for Playwright verification & thumbnail baking.
 * @param {TimelineDirector|null} director
 * @param {Record<string, any>} [extra]
 */
export function exposeTestHooks(director, extra = {}) {
  globalThis.__simulify = {
    director,
    ...extra,
  };
  globalThis.__ready = true;
}
