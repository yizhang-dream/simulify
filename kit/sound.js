/**
 * Procedural Web Audio tactile sound synthesizer (zero external audio files).
 * Safely unlocks on user interaction and supports instant muting.
 */
export class TactileSound {
  constructor(options = {}) {
    this._muted = Boolean(options.muted ?? false);
    this._ctx = null;
  }

  isMuted() {
    return this._muted;
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
  }

  _ensureCtx() {
    if (this._muted) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this._ctx) {
      this._ctx = new AudioCtx();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  _tone({ type = 'triangle', freqStart = 440, freqEnd = 440, duration = 0.08, gain = 0.06, delay = 0 }) {
    const ctx = this._ensureCtx();
    if (!ctx) return;

    const t0 = ctx.currentTime + delay;
    const t1 = t0 + duration;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t1);
    }

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.012, duration * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.01);
  }

  click() {
    this._tone({ type: 'triangle', freqStart: 540, freqEnd: 360, duration: 0.045, gain: 0.04 });
  }

  step() {
    this._tone({ type: 'sine', freqStart: 420, freqEnd: 480, duration: 0.055, gain: 0.045 });
  }

  hit() {
    this._tone({ type: 'triangle', freqStart: 587.3, freqEnd: 587.3, duration: 0.085, gain: 0.055 });
    this._tone({ type: 'triangle', freqStart: 880.0, freqEnd: 880.0, duration: 0.11, gain: 0.05, delay: 0.055 });
  }

  miss() {
    this._tone({ type: 'sine', freqStart: 270, freqEnd: 350, duration: 0.11, gain: 0.055 });
  }

  evict() {
    this._tone({ type: 'triangle', freqStart: 390, freqEnd: 175, duration: 0.17, gain: 0.06, delay: 0.08 });
  }

  success() {
    this._tone({ type: 'triangle', freqStart: 523.25, freqEnd: 523.25, duration: 0.09, gain: 0.055 });
    this._tone({ type: 'triangle', freqStart: 659.25, freqEnd: 659.25, duration: 0.09, gain: 0.055, delay: 0.07 });
    this._tone({ type: 'triangle', freqStart: 783.99, freqEnd: 783.99, duration: 0.14, gain: 0.055, delay: 0.14 });
  }
}
