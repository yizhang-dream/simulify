export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBack(t, overshoot = 1.45) {
  const x = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

/**
 * Lightweight damped spring integrator for tactile mechanical motion.
 */
export class Spring {
  constructor({ value = 0, target = value, stiffness = 260, damping = 20, mass = 1, precision = 0.001 } = {}) {
    this.value = value;
    this.target = target;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.precision = precision;
  }

  snap(v) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  impulse(v) {
    this.velocity += v;
  }

  settled() {
    return Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision;
  }

  step(dt) {
    if (this.settled()) {
      this.value = this.target;
      this.velocity = 0;
      return this.value;
    }
    const h = Math.min(Math.max(0, Number(dt) || 0), 0.04);
    if (h <= 0) return this.value;
    const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
    this.velocity += (force / this.mass) * h;
    this.value += this.velocity * h;
    if (this.settled()) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
}
