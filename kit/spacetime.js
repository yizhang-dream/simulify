/**
 * Simulify v2 4D Spacetime Engine:
 * - SpacetimeClock: single master deterministic clock (0 -> totalDuration) with
 *   continuous reversible global scrubbing, speed dilation, beat/act bookmarks,
 *   and manual export/test stepping (disabling internal rAF).
 * - SimulationTape: caches deterministic fixed-step/episode trajectories with
 *   O(1) uniform-grid continuous sampling forward & backward, plus named
 *   counterfactual ghost capture for translucent ghost-vs-live comparisons.
 */

export const clamp01 = (u) => Math.max(0, Math.min(1, Number(u) || 0));

export const easeLinear = (u) => clamp01(u);

export const easeOutCubic = (u) => {
  const x = clamp01(u);
  return 1 - Math.pow(1 - x, 3);
};

export const easeInOutCubic = (u) => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutExpo = (u) => {
  const x = clamp01(u);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
};

export const easeOutBack = (u, overshoot = 1.45) => {
  const x = clamp01(u) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
};

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function deepClone(val) {
  if (val === null || typeof val !== 'object') return val;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(val);
    } catch {
      // Fall through to manual clone for objects with non-cloneable fields
    }
  }
  if (Array.isArray(val)) return val.map(deepClone);
  if (ArrayBuffer.isView(val)) return new val.constructor(val);
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    out[k] = deepClone(v);
  }
  return out;
}

/**
 * Default continuous interpolator for SimulationTape states:
 * linearly blends numbers, numeric arrays, and plain-object numeric fields;
 * steps discrete fields cleanly at alpha >= 0.5.
 */
export function defaultInterpolateState(a, b, alpha) {
  if (alpha <= 0 || a === b) return a;
  if (alpha >= 1) return b;
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return alpha < 0.5 ? a : b;
    return a + (b - a) * alpha;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const out = new Array(a.length);
    for (let i = 0; i < a.length; i += 1) {
      out[i] = defaultInterpolateState(a[i], b[i], alpha);
    }
    return out;
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    Object.getPrototypeOf(a) === Object.prototype &&
    Object.getPrototypeOf(b) === Object.prototype
  ) {
    const out = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (k in a && k in b) {
        out[k] = defaultInterpolateState(a[k], b[k], alpha);
      } else {
        out[k] = alpha < 0.5 ? a[k] : b[k];
      }
    }
    return out;
  }
  return alpha < 0.5 ? a : b;
}

function normalizeBeatsAndActs({ duration = 30, beats = [], acts = null } = {}) {
  const normActs = [];
  const normBeats = [];

  if (Array.isArray(acts) && acts.length > 0) {
    acts.forEach((act, actIdx) => {
      const actId = act.id ?? `act-${actIdx + 1}`;
      const actTitle = act.title ?? `Act ${actIdx + 1}`;
      const rawSteps = Array.isArray(act.steps) && act.steps.length > 0
        ? act.steps
        : [{
            id: act.stepId ?? `${actId}-beat-0`,
            title: actTitle,
            start: act.start ?? 0,
            end: act.end ?? act.start ?? 0,
            summary: act.summary ?? '',
            carries: act.carries ?? '',
            hook: act.hook ?? '',
            camera: act.camera,
            meta: act.meta ?? null,
          }];

      const steps = [];
      let minStart = Infinity;
      let maxEnd = 0;

      rawSteps.forEach((step, localIdx) => {
        const start = Math.max(0, Number(step.start ?? act.start ?? 0));
        const end = Math.max(start, Number(step.end ?? act.end ?? start));
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end);
        const beatObj = {
          id: step.id ?? `${actId}-beat-${localIdx}`,
          index: normBeats.length,
          localIndex: localIdx,
          stageIndex: actIdx,
          stageId: actId,
          stageTitle: actTitle,
          title: step.title ?? actTitle,
          start,
          end,
          duration: Math.max(0, end - start),
          summary: step.summary ?? act.summary ?? '',
          carries: step.carries ?? act.carries ?? '',
          hook: step.hook ?? act.hook ?? '',
          relates: step.relates ?? act.relates ?? [],
          camera: step.camera !== undefined ? step.camera : act.camera,
          meta: step.meta ?? act.meta ?? null,
        };
        normBeats.push(beatObj);
        steps.push(beatObj);
      });

      const actStart = Number.isFinite(act.start) ? Math.max(0, act.start) : (Number.isFinite(minStart) ? minStart : 0);
      const actEnd = Number.isFinite(act.end) ? Math.max(actStart, act.end) : Math.max(actStart, maxEnd);
      normActs.push({
        id: actId,
        index: actIdx,
        title: actTitle,
        start: actStart,
        end: actEnd,
        summary: act.summary ?? '',
        carries: act.carries ?? '',
        hook: act.hook ?? '',
        relates: act.relates ?? [],
        camera: act.camera,
        steps,
      });
    });
  } else if (Array.isArray(beats) && beats.length > 0) {
    const sorted = [...beats].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    const actById = new Map();

    sorted.forEach((b, idx) => {
      const start = Math.max(0, Number(b.start) || 0);
      const nextStart = idx + 1 < sorted.length ? Math.max(start, Number(sorted[idx + 1].start) || start) : Math.max(start, Number(duration) || start);
      const end = b.end !== undefined ? Math.max(start, Number(b.end)) : nextStart;
      const stageId = b.stageId ?? b.actId ?? b.id ?? `stage-${idx}`;
      let act = actById.get(stageId);
      if (!act) {
        act = {
          id: stageId,
          index: normActs.length,
          title: b.stageTitle ?? b.actTitle ?? b.title ?? `Stage ${normActs.length + 1}`,
          start,
          end,
          summary: b.summary ?? '',
          carries: b.carries ?? '',
          hook: b.hook ?? '',
          relates: b.relates ?? [],
          camera: b.camera,
          steps: [],
        };
        actById.set(stageId, act);
        normActs.push(act);
      } else {
        act.start = Math.min(act.start, start);
        act.end = Math.max(act.end, end);
      }

      const beatObj = {
        id: b.id ?? `beat-${idx}`,
        index: idx,
        localIndex: act.steps.length,
        stageIndex: act.index,
        stageId: act.id,
        stageTitle: act.title,
        title: b.title ?? `Beat ${idx + 1}`,
        start,
        end,
        duration: Math.max(0, end - start),
        summary: b.summary ?? act.summary ?? '',
        carries: b.carries ?? act.carries ?? '',
        hook: b.hook ?? act.hook ?? '',
        relates: b.relates ?? act.relates ?? [],
        camera: b.camera !== undefined ? b.camera : act.camera,
        meta: b.meta ?? null,
      };
      act.steps.push(beatObj);
      normBeats.push(beatObj);
    });
  }

  let totalDuration = Math.max(0, Number(duration) || 0);
  for (const b of normBeats) totalDuration = Math.max(totalDuration, b.end);
  for (const a of normActs) totalDuration = Math.max(totalDuration, a.end);
  if (totalDuration <= 0) totalDuration = 1;

  if (normActs.length === 0) {
    const soleBeat = {
      id: 'beat-0',
      index: 0,
      localIndex: 0,
      stageIndex: 0,
      stageId: 'act-1',
      stageTitle: 'Timeline',
      title: 'Timeline',
      start: 0,
      end: totalDuration,
      duration: totalDuration,
      summary: '',
      carries: '',
      hook: '',
      relates: [],
      camera: undefined,
      meta: null,
    };
    normBeats.push(soleBeat);
    normActs.push({
      id: 'act-1',
      index: 0,
      title: 'Timeline',
      start: 0,
      end: totalDuration,
      summary: '',
      carries: '',
      hook: '',
      relates: [],
      camera: undefined,
      steps: [soleBeat],
    });
  }

  return { duration: totalDuration, beats: normBeats, acts: normActs };
}

/**
 * Single master deterministic 4D clock driving continuous reversible time (0 -> totalDuration).
 */
export class SpacetimeClock {
  /**
   * @param {{
   *   duration?: number,
   *   speed?: number,
   *   loop?: boolean,
   *   playing?: boolean,
   *   manualMode?: boolean,
   *   beats?: Array<object>,
   *   acts?: Array<object>,
   *   defaultFps?: number,
   *   onTick?: (state: any) => void,
   *   onSeek?: (state: any) => void,
   * }} [options]
   */
  constructor(options = {}) {
    const {
      duration = 30,
      speed = 1,
      loop = false,
      playing = false,
      manualMode = false,
      beats = [],
      acts = null,
      defaultFps = 60,
      onTick = null,
      onSeek = null,
    } = options;

    const normalized = normalizeBeatsAndActs({ duration, beats, acts });
    this.duration = normalized.duration;
    this.beats = normalized.beats;
    this.acts = normalized.acts;
    this.defaultFps = Math.max(1, Number(defaultFps) || 60);
    this.speed = Math.max(0.05, Math.min(16, Number(speed) || 1));
    this.loop = Boolean(loop);
    this.manualMode = Boolean(manualMode);

    this.t = 0;
    this.playing = false;
    this.complete = false;
    this._raf = 0;
    this._lastMs = 0;
    this._disposed = false;

    this._tickSubs = new Set();
    this._seekSubs = new Set();
    this._stateSubs = new Set();

    if (typeof onTick === 'function') this._tickSubs.add(onTick);
    if (typeof onSeek === 'function') this._seekSubs.add(onSeek);

    this._onVisibilityChange = () => {
      if (this._disposed || this.manualMode) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.#stopRaf();
      } else if (this.playing) {
        this._lastMs = nowMs();
        this.#startRaf();
      }
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    if (playing && !this.manualMode) {
      this.play();
    }
  }

  /** Replace or update beat/act bookmarks dynamically (e.g., on language change). */
  setTimeline({ duration = this.duration, beats = [], acts = null } = {}) {
    const normalized = normalizeBeatsAndActs({ duration, beats, acts });
    this.duration = normalized.duration;
    this.beats = normalized.beats;
    this.acts = normalized.acts;
    this.t = Math.max(0, Math.min(this.duration, this.t));
    this.#notifyState();
    return this.getTimelineInfo();
  }

  /** Start continuous playback (restarts from 0 if already at end). */
  play() {
    if (this._disposed) return this.getState();
    if (!this.loop && this.t >= this.duration - 1e-6) {
      this.t = 0;
      this.complete = false;
    }
    this.playing = true;
    this.complete = false;
    if (!this.manualMode) {
      this.#startRaf();
    }
    const snap = this.getState();
    this.#notifyState(snap);
    return snap;
  }

  /** Pause playback cleanly without altering `t`. */
  pause() {
    this.playing = false;
    this.#stopRaf();
    const snap = this.getState();
    this.#notifyState(snap);
    return snap;
  }

  toggle() {
    return this.playing ? this.pause() : this.play();
  }

  /** Set playback dilation rate (e.g. 0.1, 0.25, 0.5, 1, 2). */
  setSpeed(rate) {
    this.speed = Math.max(0.05, Math.min(16, Number(rate) || 1));
    this.#notifyState();
    return this.speed;
  }

  /**
   * Enable or disable manual mode (stops internal rAF for deterministic video export
   * and headless verification).
   */
  setManualMode(enabled) {
    this.manualMode = Boolean(enabled);
    if (this.manualMode) {
      this.#stopRaf();
    } else if (this.playing) {
      this.#startRaf();
    }
    this.#notifyState();
    return this.manualMode;
  }

  /**
   * Continuous reversible global seek to any time `t` in [0, duration].
   * Fires strictly ONE handler channel (`onSeek` when registered, otherwise `onTick`
   * fallback) so consumers registering both `onTick` and `onSeek` never run 2× per seek.
   */
  seek(t, { silent = false, notifyHandlers = true, emitTick = false } = {}) {
    this.t = Math.max(0, Math.min(this.duration, Number(t) || 0));
    this.complete = !this.loop && this.t >= this.duration - 1e-6;
    const snap = this.getState();
    if (!silent) {
      if (notifyHandlers) {
        if (this._seekSubs.size > 0) {
          this.#notifySeek(snap);
          if (emitTick) this.#notifyTick(snap);
        } else {
          this.#notifyTick(snap);
        }
      }
      this.#notifyState(snap);
    }
    return snap;
  }

  seekNorm(u, opts) {
    return this.seek(clamp01(u) * this.duration, opts);
  }

  /** Pause and advance/rewind by exactly one frame (`dir / fps`). */
  stepFrame(fps = this.defaultFps, dir = 1) {
    const rate = Math.max(1, Number(fps) || this.defaultFps);
    const step = (Number(dir) || 1) / rate;
    this.playing = false;
    this.#stopRaf();
    return this.seek(this.t + step);
  }

  /** Advance clock deterministically by `dt` seconds (clamped >= 0). */
  tick(dt) {
    if (!this.playing) return false;
    const delta = Math.max(0, Number(dt) || 0) * this.speed;
    if (delta <= 0) return false;

    let next = this.t + delta;
    if (this.loop) {
      next = ((next % this.duration) + this.duration) % this.duration;
      this.complete = false;
    } else if (next >= this.duration) {
      next = this.duration;
      this.playing = false;
      this.complete = true;
      this.#stopRaf();
    }
    this.t = next;
    const snap = this.getState();
    this.#notifyTick(snap);
    this.#notifyState(snap);
    return true;
  }

  /** Lookup active beat metadata at time `t`. */
  getBeatAt(t = this.t) {
    const time = Math.max(0, Math.min(this.duration, Number(t) || 0));
    let found = this.beats[0];
    for (let i = 0; i < this.beats.length; i += 1) {
      const b = this.beats[i];
      if (time >= b.start - 1e-6) {
        found = b;
        if (time < b.end - 1e-6 || i === this.beats.length - 1) {
          break;
        }
      }
    }
    const span = Math.max(1e-6, found.end - found.start);
    const localT = Math.max(0, Math.min(found.end - found.start, time - found.start));
    return {
      ...found,
      localT,
      localProgress: found.end > found.start ? clamp01(localT / span) : 1,
    };
  }

  /** Lookup active act/stage metadata at time `t`. */
  getActAt(t = this.t) {
    const beat = this.getBeatAt(t);
    return this.acts[beat.stageIndex] || this.acts[0];
  }

  /** Jump cleanly to a beat by id or numeric index. */
  jumpToBeat(idOrIndex, { play = null, offset = 0 } = {}) {
    let beat = null;
    if (typeof idOrIndex === 'number') {
      const idx = Math.max(0, Math.min(this.beats.length - 1, Math.round(idOrIndex)));
      beat = this.beats[idx];
    } else {
      beat = this.beats.find((b) => b.id === idOrIndex) || this.acts.find((a) => a.id === idOrIndex)?.steps?.[0];
    }
    if (!beat) return this.getState();
    if (play === true) this.play();
    else if (play === false) this.pause();
    return this.seek(beat.start + (Number(offset) || 0));
  }

  jumpToAct(idOrIndex, { play = null, offset = 0 } = {}) {
    let act = null;
    if (typeof idOrIndex === 'number') {
      const idx = Math.max(0, Math.min(this.acts.length - 1, Math.round(idOrIndex)));
      act = this.acts[idx];
    } else {
      act = this.acts.find((a) => a.id === idOrIndex);
    }
    if (!act) return this.getState();
    if (play === true) this.play();
    else if (play === false) this.pause();
    return this.seek(act.start + (Number(offset) || 0));
  }

  nextBeat(opts = {}) {
    const cur = this.getBeatAt(this.t);
    const nextIdx = Math.min(this.beats.length - 1, cur.index + 1);
    return this.jumpToBeat(nextIdx, opts);
  }

  prevBeat(opts = {}) {
    const cur = this.getBeatAt(this.t);
    if (cur.localT > 0.35) {
      return this.jumpToBeat(cur.index, opts);
    }
    const prevIdx = Math.max(0, cur.index - 1);
    return this.jumpToBeat(prevIdx, opts);
  }

  /** Return unified v2 timeline manifest for `window.__simulify.getTimelineInfo()`. */
  getTimelineInfo() {
    return {
      mode: 'spacetime',
      duration: this.duration,
      defaultFps: this.defaultFps,
      stages: this.acts.map((act) => ({
        id: act.id,
        index: act.index,
        title: act.title,
        start: act.start,
        end: act.end,
        carries: act.carries,
        hook: act.hook,
        steps: act.steps.map((s) => ({
          id: s.id,
          title: s.title,
          start: s.start,
          end: s.end,
          summary: s.summary,
          carries: s.carries,
          hook: s.hook,
        })),
      })),
      beats: this.beats.map((b) => ({
        id: b.id,
        index: b.index,
        stageId: b.stageId,
        stageIndex: b.stageIndex,
        title: b.title,
        start: b.start,
        end: b.end,
      })),
    };
  }

  getState() {
    const beat = this.getBeatAt(this.t);
    const act = this.acts[beat.stageIndex] || this.acts[0];
    return {
      t: this.t,
      globalTime: this.t,
      duration: this.duration,
      globalDuration: this.duration,
      progress: this.duration > 0 ? clamp01(this.t / this.duration) : 1,
      totalProgress: this.duration > 0 ? clamp01(this.t / this.duration) : 1,
      stepProgress: beat.localProgress,
      speed: this.speed,
      playing: this.playing,
      manualMode: this.manualMode,
      complete: this.complete,
      beat,
      beatIndex: beat.index,
      beatCount: this.beats.length,
      stepIndex: beat.index,
      stepCount: this.beats.length,
      stepId: beat.id,
      stepTitle: beat.title,
      stageIndex: act.index,
      stageCount: this.acts.length,
      stageId: act.id,
      stageTitle: act.title,
      summary: beat.summary,
      carries: beat.carries,
      hook: beat.hook,
      relates: beat.relates,
    };
  }

  onTick(fn) {
    if (typeof fn !== 'function') return () => {};
    this._tickSubs.add(fn);
    return () => this._tickSubs.delete(fn);
  }

  onSeek(fn) {
    if (typeof fn !== 'function') return () => {};
    this._seekSubs.add(fn);
    return () => this._seekSubs.delete(fn);
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._stateSubs.add(fn);
    fn(this.getState());
    return () => this._stateSubs.delete(fn);
  }

  destroy() {
    this._disposed = true;
    this.playing = false;
    this.#stopRaf();
    if (this._onVisibilityChange && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
    this._tickSubs.clear();
    this._seekSubs.clear();
    this._stateSubs.clear();
  }

  #startRaf() {
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    if (!this.manualMode && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this._lastMs = nowMs();
    const step = (now) => {
      if (this._disposed || !this.playing || this.manualMode) {
        this._raf = 0;
        return;
      }
      const rawDt = (now - this._lastMs) / 1000;
      this._lastMs = now;
      const dt = Math.min(0.05, Math.max(0, Number.isFinite(rawDt) ? rawDt : 0));
      if (dt > 0) {
        this.tick(dt);
      }
      if (this.playing && !this.manualMode && !this._disposed) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._raf = 0;
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  #stopRaf() {
    if (this._raf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._raf);
    }
    this._raf = 0;
  }

  #notifyTick(snap) {
    const s = snap || this.getState();
    for (const fn of this._tickSubs) fn(s);
  }

  #notifySeek(snap) {
    const s = snap || this.getState();
    for (const fn of this._seekSubs) fn(s);
  }

  #notifyState(snap) {
    const s = snap || this.getState();
    for (const fn of this._stateSubs) fn(s);
  }
}

function createSamplerForFrames(frames, uniformDt, startTime) {
  const sampleAt = (t, interpolateFn = null) => {
    const n = frames.length;
    if (n === 0) return null;
    if (n === 1) return frames[0].state;

    const time = Number(t) || 0;
    const first = frames[0];
    const last = frames[n - 1];
    if (time <= first.t) return first.state;
    if (time >= last.t) return last.state;

    let lo = 0;
    if (uniformDt > 0) {
      // O(1) direct index lookup on uniform baked/recorded tape
      lo = Math.max(0, Math.min(n - 2, Math.floor((time - startTime) / uniformDt)));
      // Guard against floating-point edge rounding
      while (lo > 0 && frames[lo].t > time) lo -= 1;
      while (lo < n - 2 && frames[lo + 1].t < time) lo += 1;
    } else {
      let hi = n - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].t <= time) lo = mid;
        else hi = mid;
      }
    }

    const a = frames[lo];
    const b = frames[lo + 1];
    const span = b.t - a.t;
    const alpha = span > 1e-12 ? clamp01((time - a.t) / span) : 0;
    if (typeof interpolateFn === 'function') {
      return interpolateFn(a.state, b.state, alpha, { a, b, t: time, alpha, index: lo });
    }
    return defaultInterpolateState(a.state, b.state, alpha);
  };

  const sampleRange = (t0, t1, maxSamples = 128) => {
    if (frames.length === 0) return [];
    const loT = Math.min(Number(t0) || 0, Number(t1) || 0);
    const hiT = Math.max(Number(t0) || 0, Number(t1) || 0);
    const slice = [];
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i];
      if (f.t >= loT - 1e-9 && f.t <= hiT + 1e-9) {
        slice.push(f);
      }
    }
    if (slice.length <= maxSamples) return slice;
    const out = [];
    const stride = (slice.length - 1) / Math.max(1, maxSamples - 1);
    for (let i = 0; i < maxSamples; i += 1) {
      out.push(slice[Math.round(i * stride)]);
    }
    return out;
  };

  return { sampleAt, sampleRange };
}

/**
 * Deterministic trajectory cache supporting O(1) continuous forward/backward sampling
 * and counterfactual ghost preservation across parameter changes.
 */
export class SimulationTape {
  constructor({ interpolate = null } = {}) {
    this.frames = [];
    this.byKey = new Map();
    this.interpolate = typeof interpolate === 'function' ? interpolate : null;
    this._uniformDt = 0;
    this._startTime = 0;
    this._ghosts = new Map();
    this._latestGhostLabel = null;
  }

  get length() {
    return this.frames.length;
  }

  get startTime() {
    return this.frames.length > 0 ? this.frames[0].t : 0;
  }

  get endTime() {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0;
  }

  get duration() {
    return Math.max(0, this.endTime - this.startTime);
  }

  clear() {
    this.frames = [];
    this.byKey.clear();
    this._uniformDt = 0;
    this._startTime = 0;
    return this;
  }

  /**
   * Append one deterministic sample to the tape.
   * @param {number|string} keyOrTime Numeric timestamp (seconds/episode) or string key
   * @param {any} state Snapshot payload
   * @param {number} [explicitTime] Optional explicit time if first arg is string key
   */
  record(keyOrTime, state, explicitTime = undefined) {
    const isNum = typeof keyOrTime === 'number' && Number.isFinite(keyOrTime);
    const t = explicitTime !== undefined
      ? Number(explicitTime)
      : isNum
        ? keyOrTime
        : this.frames.length;
    const key = String(keyOrTime);
    const entry = { t, key, state };

    if (this.frames.length === 0) {
      this._startTime = t;
      this._uniformDt = 0;
    } else if (this.frames.length === 1) {
      const dt = t - this.frames[0].t;
      this._uniformDt = dt > 0 ? dt : 0;
    } else if (this._uniformDt > 0) {
      const dt = t - this.frames[this.frames.length - 1].t;
      if (Math.abs(dt - this._uniformDt) > 1e-6 * Math.max(1, this._uniformDt)) {
        this._uniformDt = 0;
      }
    }

    this.frames.push(entry);
    this.byKey.set(key, entry);
    return entry;
  }

  /**
   * Populate the tape deterministically in one pass.
   * Overloads:
   * - `bake((tape) => { ... tape.record(...) })`
   * - `bake(count, (index, u) => state)`
   * - `bake({ duration, fps, step, count, startTime }, (t, index, u) => state)`
   */
  bake(specOrFn, generatorFn = null) {
    this.clear();
    if (typeof specOrFn === 'function') {
      specOrFn(this);
      return this;
    }
    if (typeof generatorFn !== 'function') {
      throw new Error('SimulationTape.bake requires a generator function.');
    }

    if (typeof specOrFn === 'number') {
      const count = Math.max(1, Math.round(specOrFn));
      for (let i = 0; i < count; i += 1) {
        const u = count > 1 ? i / (count - 1) : 1;
        this.record(i, generatorFn(i, u, i));
      }
      return this;
    }

    const {
      startTime = 0,
      duration = 1,
      fps = 0,
      step = 0,
      count = 0,
    } = specOrFn || {};

    let n = Math.max(0, Math.round(count));
    let dt = step > 0 ? step : (fps > 0 ? 1 / fps : 0);
    if (n <= 0) {
      if (dt > 0) {
        n = Math.max(2, Math.round(duration / dt) + 1);
      } else {
        n = 61;
        dt = duration / (n - 1);
      }
    } else if (dt <= 0) {
      dt = n > 1 ? duration / (n - 1) : 0;
    }

    for (let i = 0; i < n; i += 1) {
      const u = n > 1 ? i / (n - 1) : 1;
      const t = startTime + (n > 1 ? i * dt : 0);
      this.record(t, generatorFn(t, i, u));
    }
    return this;
  }

  /** Retrieve an exact recorded entry by key. */
  getByKey(key) {
    return this.byKey.get(String(key))?.state ?? null;
  }

  /** Continuous O(1) (uniform) or O(log N) sampling forward or backward at any time `t`. */
  sampleAt(t, interpolateFn = this.interpolate) {
    const { sampleAt } = createSamplerForFrames(this.frames, this._uniformDt, this._startTime);
    return sampleAt(t, interpolateFn);
  }

  /** Return all (or downsampled) recorded frames within [t0, t1]. */
  sampleRange(t0, t1, maxSamples = 128) {
    const { sampleRange } = createSamplerForFrames(this.frames, this._uniformDt, this._startTime);
    return sampleRange(t0, t1, maxSamples);
  }

  /**
   * Snapshot the current trajectory into a named immutable ghost for counterfactual overlay.
   */
  captureGhost(label = 'Baseline', meta = {}) {
    const clonedFrames = this.frames.map((f) => ({
      t: f.t,
      key: f.key,
      state: deepClone(f.state),
    }));
    const uniformDt = this._uniformDt;
    const startTime = this._startTime;
    const defaultInterp = this.interpolate;
    const { sampleAt, sampleRange } = createSamplerForFrames(clonedFrames, uniformDt, startTime);
    const ghost = {
      label: String(label),
      meta: deepClone(meta),
      frames: clonedFrames,
      length: clonedFrames.length,
      startTime,
      endTime: clonedFrames.length > 0 ? clonedFrames[clonedFrames.length - 1].t : 0,
      sampleAt: (t, interp = defaultInterp) => sampleAt(t, interp),
      sampleRange,
    };
    this._ghosts.set(ghost.label, ghost);
    this._latestGhostLabel = ghost.label;
    return ghost;
  }

  /** Retrieve the latest (or named) captured counterfactual ghost tape. */
  getGhost(label = null) {
    if (label !== null && label !== undefined) {
      return this._ghosts.get(String(label)) || null;
    }
    if (this._latestGhostLabel === null) return null;
    return this._ghosts.get(this._latestGhostLabel) || null;
  }

  listGhosts() {
    return Array.from(this._ghosts.values());
  }

  hasGhost(label = null) {
    return this.getGhost(label) !== null;
  }

  clearGhost(label = null) {
    if (label !== null && label !== undefined) {
      this._ghosts.delete(String(label));
      if (this._latestGhostLabel === String(label)) {
        const keys = Array.from(this._ghosts.keys());
        this._latestGhostLabel = keys.length > 0 ? keys[keys.length - 1] : null;
      }
      return;
    }
    this._ghosts.clear();
    this._latestGhostLabel = null;
  }
}
