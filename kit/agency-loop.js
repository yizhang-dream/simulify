/**
 * Autonomous closed-loop simulation driver for living primers (e.g. circuits,
 * self-cycling thermostats, waveforms). Runs immediately on arrival and supports
 * seamless user intervention, pause/resume, and speed scaling.
 */
export class AliveLoop {
  constructor({ onTick, speed = 1, onStateChange = null, autoStart = true } = {}) {
    this.onTick = onTick;
    this.speed = speed;
    this.onStateChange = onStateChange;
    this.reducedMotion =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    this._running = false;
    this._userIntervened = false;
    this._raf = 0;
    this._last = 0;

    this._onVisibilityChange = () => {
      if (!this._running) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        if (this._raf && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this._raf);
        }
        this._raf = 0;
      } else if (!this._raf) {
        this._last = performance.now();
        this._scheduleFrame();
      }
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    if (autoStart && !this.reducedMotion) {
      this.start();
    }
  }

  isRunning() {
    return this._running;
  }

  hasUserIntervened() {
    return this._userIntervened;
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Number(speed) || 1);
  }

  _scheduleFrame() {
    if (!this._running || this._raf || typeof requestAnimationFrame !== 'function') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const loop = (now) => {
      this._raf = 0;
      if (!this._running) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const dt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
      this._last = now;
      if (this.onTick) {
        this.onTick(dt * this.speed, now);
      }
      if (this._running) {
        this._raf = requestAnimationFrame(loop);
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._emitState();
    this._scheduleFrame();
  }

  pause() {
    if (!this._running) return;
    this._running = false;
    if (this._raf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._raf);
    }
    this._raf = 0;
    this._emitState();
  }

  toggle() {
    if (this._running) this.pause();
    else this.start();
    return this._running;
  }

  onUserIntervene({ pause = false } = {}) {
    this._userIntervened = true;
    if (pause) {
      this.pause();
    } else {
      this._emitState();
    }
  }

  _emitState() {
    if (this.onStateChange) {
      this.onStateChange({ running: this._running, userIntervened: this._userIntervened });
    }
  }

  dispose() {
    this.pause();
    if (this._onVisibilityChange && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
  }
}

/**
 * Opening one-pass demonstration runner for Device/Rule and Process primers.
 * Auto-plays a representative pass on arrival so devices never sit idle,
 * and yields control cleanly on the user's first interaction.
 */
export class IntroDemo {
  constructor({ sequence = [], stepMs = 760, onStep, onDone = null, onYield = null } = {}) {
    this.sequence = [...sequence];
    this.stepMs = stepMs;
    this.onStep = onStep;
    this.onDone = onDone;
    this.onYield = onYield;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._token = 0;
    this._timer = 0;
    this._playing = false;
  }

  isPlaying() {
    return this._playing;
  }

  setSequence(sequence) {
    this.sequence = [...sequence];
  }

  start({ speed = 1 } = {}) {
    this.stop();
    if (!this.sequence.length || !this.onStep) return;

    const token = ++this._token;
    if (this.reducedMotion) {
      // Populate instructive live state immediately without unsolicited motion
      for (const item of this.sequence) {
        if (token !== this._token) return;
        this.onStep(item, { instant: true });
      }
      if (this.onDone) this.onDone({ yielded: false });
      return;
    }

    this._playing = true;
    let i = 0;
    const next = () => {
      if (token !== this._token) return;
      if (i >= this.sequence.length) {
        this._playing = false;
        if (this.onDone) this.onDone({ yielded: false });
        return;
      }
      const item = this.sequence[i++];
      const customDelay = this.onStep(item, { instant: false, index: i - 1, total: this.sequence.length });
      const delay = typeof customDelay === 'number' ? customDelay : this.stepMs;
      this._timer = setTimeout(next, Math.max(80, Math.round(delay / Math.max(0.1, speed))));
    };
    next();
  }

  replay(opts = {}) {
    this.start(opts);
  }

  yieldToUser() {
    const wasPlaying = this._playing;
    this.stop();
    if (wasPlaying && this.onYield) {
      this.onYield();
    }
  }

  stop() {
    this._token += 1;
    clearTimeout(this._timer);
    this._timer = 0;
    this._playing = false;
  }
}
