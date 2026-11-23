import { clamp, createSimModel, lerp } from '../../kit/model-core.js';
import { DIMENSIONS as D } from '../../primitives/gears-drivetrain.js';

export const DURATION = 16;
export const FINAL_DRIVE = D.crownTeeth / D.pinionTeeth;
export const GRIP_TORQUE = 1000;
export const REQUESTED_TORQUE = 1200;
export const GRIP_THRESHOLD = REQUESTED_TORQUE / (2 * GRIP_TORQUE);

const DEFAULTS = Object.freeze({
  inputOmega: 10.5, steeringBias: 0, muLeft: 0.85, muRight: 0.85, cutaway: 0, story: false,
});

export const BEATS = Object.freeze([
  { id: 'housing', title: '传动路径', summary: '传动轴带动差速器，两根半轴把动力送到车轮。' },
  { id: 'cutaway', title: '剖开壳体', summary: '小锥齿轮驱动冠齿轮，冠齿轮带着行星架一起转。' },
  { id: 'corner', title: '弯道差速', summary: '右轮走外圈。行星齿轮开始自转，左右轮的平均转速不变。' },
  { id: 'ice', title: '右轮上冰', summary: '冰面限制了右轮扭矩。左轮也只分到同样的扭矩，车很难向前。' },
].map((beat, i) => Object.freeze({ ...beat, start: i * 4, end: (i + 1) * 4 })));

const smooth = (v) => {
  const u = clamp(v, 0, 1);
  return u * u * (3 - 2 * u);
};

const turnStarts = 8;
const iceStarts = 12;
const transition = 1.25;

function conditions(params, t) {
  if (!params.story) return params;
  const turn = smooth((t - turnStarts) / transition);
  const ice = smooth((t - iceStarts) / transition);
  return {
    ...params,
    steeringBias: 0.55 * turn * (1 - ice),
    muRight: lerp(params.muRight, 0.05, ice),
    cutaway: smooth((t - 4) / 1.6),
  };
}

function motion(params) {
  const muLeft = clamp(params.muLeft, 0.05, 0.95);
  const muRight = clamp(params.muRight, 0.05, 0.95);
  const limit = Math.min(muLeft, muRight);
  const steeringBias = clamp(params.steeringBias, -0.8, 0.8);
  // Smooth quasi-static wheel-speed split. A grip deficit alone cannot select
  // a faster wheel: that also requires unequal traction at the contact patches.
  const slip = smooth((GRIP_THRESHOLD - limit) / (GRIP_THRESHOLD - 0.05))
    * smooth(Math.abs(muLeft - muRight) / 0.30);
  const sign = Math.sign(muLeft - muRight);
  const speedBias = lerp(steeringBias, sign, slip);
  return { muLeft, muRight, limit, steeringBias, slip, speedBias };
}

function integrateBias(params, t, bias) {
  if (!params.story) return t * bias;
  // Simpson quadrature only on the two transitions. Plateau integrals are exact.
  let integral = Math.min(t, turnStarts) * motion(conditions(params, 0)).speedBias;
  for (const start of [turnStarts, iceStarts]) {
    const end = Math.min(t, start + transition);
    if (end <= start) break;
    const n = 16;
    const h = (end - start) / n;
    let sum = 0;
    for (let i = 0; i <= n; i += 1) {
      const weight = i === 0 || i === n ? 1 : i % 2 === 0 ? 2 : 4;
      sum += weight * motion(conditions(params, start + i * h)).speedBias;
    }
    integral += sum * h / 3;
    const plateauEnd = Math.min(t, start === turnStarts ? iceStarts : DURATION);
    integral += Math.max(0, plateauEnd - end) * motion(conditions(params, end)).speedBias;
  }
  return integral;
}

function solve(params, time) {
  const t = clamp(time, 0, DURATION);
  const active = conditions(params, t);
  const { muLeft, muRight, limit, steeringBias, slip, speedBias } = motion(active);
  const inputOmega = active.inputOmega;
  const omegaC = inputOmega / FINAL_DRIVE;
  const omegaL = omegaC * (1 - speedBias);
  const omegaR = omegaC * (1 + speedBias);
  const ratio = D.sideRadius / D.spiderRadius;
  const omegaS = (omegaR - omegaL) * ratio / 2;
  const tau = inputOmega === 0 ? 0 : Math.min(REQUESTED_TORQUE / 2, limit * GRIP_TORQUE);
  const wheelRadius = D.wheelDiameter * D.metresPerUnit / 2;
  const carrierAngle = omegaC * t;
  const relativeAngle = omegaC * integrateBias(params, t, speedBias);
  return {
    inputOmega, omegaC, omegaL, omegaR, omegaS, tauL: tau, tauR: tau,
    driveForce: 2 * tau / wheelRadius,
    muLeft, muRight, steeringBias, slip, cutaway: clamp(active.cutaway, 0, 1),
    inputAngle: inputOmega * t, carrierAngle,
    leftAngle: carrierAngle - relativeAngle, rightAngle: carrierAngle + relativeAngle,
    spiderAngle: relativeAngle * ratio,
  };
}

const checks = [
  {
    name: 'single-wheel-ice-stall', patch: { muRight: 0.05 }, metric: 'driveForce',
    check: (base, ice) => ice.driveForce < 0.2 * base.driveForce
      && ice.omegaR > 1.75 * ice.omegaC && ice.omegaL < 0.25 * ice.omegaC
      && ice.tauL === ice.tauR,
  },
  {
    name: 'kinematic-average-invariant', patch: { steeringBias: 0.55 }, metric: 'omegaS',
    check: (_, turn) => Math.abs((turn.omegaL + turn.omegaR) / 2 - turn.omegaC) < 1e-6
      && Math.abs(turn.omegaS) > 0.5,
  },
  {
    name: 'zero-input-rest', patch: { inputOmega: 0 }, metric: 'omegaC',
    check: (_, stop) => [stop.omegaC, stop.omegaL, stop.omegaR, stop.omegaS].every((omega) => omega === 0),
  },
];

export function createModel(clock) {
  return createSimModel({
    clock, params: DEFAULTS, solve,
    falsifyCases: checks.map(({ name, patch, metric, check }) => ({
      name,
      run(evaluate) {
        // Keep the printed experiment fixed even when a visitor has changed the rig.
        evaluate(0);
        const base = evaluate(0, DEFAULTS);
        const mutant = evaluate(0, { ...DEFAULTS, ...patch });
        return { passed: check(base, mutant), baseMetric: base[metric], mutantMetric: mutant[metric] };
      },
    })),
  });
}
