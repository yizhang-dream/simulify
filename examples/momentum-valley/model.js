import { clamp, createSimModel, lerp } from 'simulify/model-core.js';

export const DURATION = 12;
export const STEPS = 36;
export const DEFAULTS = Object.freeze({ kappa: 14, lr: 0.11, beta: 0.78, startX: -2.6, startY: 0.95 });
export const START_BOUNDS = { x: [-2.8, -0.6], y: [-1.2, 1.2] };
export const BEATS = [
  { id: 'momentum-valley', start: 0, end: 2, title: '跨过谷底' },
  { id: 'descent', start: 2, end: 6, title: '沿谷下降' },
  { id: 'convergence', start: 6, end: DURATION, title: '比较终态' },
];

export const gradient = (x, y, kappa) => ({ x, y: kappa * y });
export const loss = (x, y, kappa) => (x * x + kappa * y * y) / 2;

function point(x, y, kappa) {
  const z = loss(x, y, kappa);
  return { x, y, z, loss: z, gradient: gradient(x, y, kappa) };
}

function trajectory({ startX, startY, kappa, lr }, beta) {
  let x = startX;
  let y = startY;
  let vx = 0;
  let vy = 0;
  const path = [point(x, y, kappa)];
  for (let i = 0; i < STEPS; i += 1) {
    const grad = gradient(x, y, kappa);
    vx = beta * vx - lr * grad.x;
    vy = beta * vy - lr * grad.y;
    x += vx;
    y += vy;
    path.push(point(x, y, kappa));
  }
  return path;
}

export function solve(params, t) {
  const { kappa, lr, beta } = params;
  const step = clamp(t / DURATION, 0, 1) * STEPS;
  const index = Math.min(Math.floor(step), STEPS - 1);
  const fraction = step - index;
  const current = (path) => point(
    lerp(path[index].x, path[index + 1].x, fraction),
    lerp(path[index].y, path[index + 1].y, fraction), kappa,
  );
  const momentumPath = trajectory(params, beta);
  const sgdPath = trajectory(params, 0);
  const etaMax = 2 / kappa;
  return {
    step, momentumPath, sgdPath,
    momentum: current(momentumPath), sgd: current(sgdPath),
    initialLoss: momentumPath[0].loss,
    momentumFinalLoss: momentumPath[STEPS].loss, sgdFinalLoss: sgdPath[STEPS].loss,
    etaMax, diverging: lr > etaMax && params.startY !== 0,
    momentumDiverging: lr > (1 + beta) * etaMax && params.startY !== 0,
  };
}

function countCrossings(path) {
  return path.slice(1).filter(({ y }, i) => y * path[i].y < 0).length;
}

const falsifyCases = [
  {
    name: 'supercritical-lr-divergence',
    run(evaluate) {
      evaluate(DURATION);
      const base = evaluate(DURATION, DEFAULTS);
      const mutant = evaluate(DURATION, { ...DEFAULTS, lr: 0.18 });
      return {
        passed: !base.diverging && mutant.diverging && mutant.sgdFinalLoss > 100 * mutant.initialLoss
          && Math.abs(mutant.sgd.y) > 100 * Math.abs(mutant.sgdPath[0].y),
        baseMetric: base.sgdFinalLoss, mutantMetric: mutant.sgdFinalLoss,
        detail: 'SGD at η = 0.18 exceeds the stability limit and grows across the valley.',
      };
    },
  },
  {
    name: 'momentum-accelerates-ill-conditioned-valley',
    run(evaluate) {
      evaluate(DURATION);
      // Keep η fixed across the ablation. At the UI default 0.11 the reduction is only 39.5%.
      const common = { ...DEFAULTS, lr: 0.09 };
      const base = evaluate(DURATION, common);
      const mutant = evaluate(DURATION, { ...common, beta: 0 });
      const reduction = 1 - base.momentumFinalLoss / mutant.momentumFinalLoss;
      return {
        passed: reduction > 0.75,
        baseMetric: base.momentumFinalLoss, mutantMetric: mutant.momentumFinalLoss,
        detail: `At κ = 14 and η = 0.09, momentum reduces final loss by ${(100 * reduction).toFixed(1)}%.`,
      };
    },
  },
  {
    name: 'isotropic-bowl-no-zigzag',
    run(evaluate) {
      evaluate(DURATION);
      const base = evaluate(DURATION, DEFAULTS);
      const mutant = evaluate(DURATION, { ...DEFAULTS, kappa: 1 });
      const baseMetric = countCrossings(base.sgdPath);
      const mutantMetric = countCrossings(mutant.sgdPath);
      const radialError = Math.max(...mutant.sgdPath.map(({ x, y }) =>
        Math.abs(DEFAULTS.startX * y - DEFAULTS.startY * x)));
      return {
        passed: baseMetric > 0 && mutantMetric === 0 && radialError < 1e-12
          && mutant.sgdFinalLoss < mutant.initialLoss / 1000,
        baseMetric, mutantMetric,
        detail: 'In the isotropic bowl SGD follows a straight radial path and loses no steps to cross-valley zigzag.',
      };
    },
  },
];

export function createModel(clock) {
  return createSimModel({ params: DEFAULTS, solve, falsifyCases, clock });
}
