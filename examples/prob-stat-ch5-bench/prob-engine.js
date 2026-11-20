const EPS = 8e-16;
const FPMIN = 1e-300;
const MAX_ITER = 100_000;
const LOG_SQRT_2PI = 0.91893853320467274178;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
const NORMAL_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.383577518672690e2, -3.066479806614716e1, 2.506628277459239,
];
const NORMAL_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1, 1,
];
const NORMAL_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
];
const NORMAL_D = [
  7.784695709041462e-3, 3.224671290700398e-1,
  2.445134137142996, 3.754408661907416, 1,
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const horner = (coefficients, value) => coefficients.reduce((sum, coefficient) => sum * value + coefficient, 0);
const softplus = (value) => Math.max(value, 0) + Math.log1p(Math.exp(-Math.abs(value)));

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  return value;
}

function halfDegrees(value, name) {
  return positive(positive(value, name) / 2, `${name} / 2`);
}

function real(value, name) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new RangeError(`${name} must be a number`);
  return value;
}

function probability(value, name = 'q') {
  if (real(value, name) < 0 || value > 1) throw new RangeError(`${name} must lie in [0, 1]`);
  return value;
}

function checked(value, operation) {
  if (!Number.isFinite(value)) throw new Error(`${operation} exceeded numerical range`);
  return value;
}

function guard(value) {
  if (Math.abs(value) >= FPMIN) return value;
  return value < 0 || Object.is(value, -0) ? -FPMIN : FPMIN;
}

function lanczosSum(shape) {
  let sum = LANCZOS[0];
  for (let index = 1; index < LANCZOS.length; index++) {
    sum += LANCZOS[index] / (shape + (index - 1));
  }
  return sum;
}

export function logGamma(shape) {
  if (shape === 0) return Infinity;
  positive(shape, 'shape');
  if (shape < 0.5) return logGamma(shape + 1) - Math.log(shape);
  const shifted = shape + 6.5;
  return checked(LOG_SQRT_2PI + (shape - 0.5) * Math.log(shifted) - shifted + Math.log(lanczosSum(shape)), 'log gamma');
}

function log1pRatio(other, shape) {
  const ratio = other / shape;
  return Number.isFinite(ratio) ? Math.log1p(ratio) : Math.log(other + shape) - Math.log(shape);
}

function logBeta(shapeA, shapeB) {
  let correction = 0;
  if (shapeA < 0.5) {
    correction += log1pRatio(shapeB, shapeA);
    shapeA += 1;
  }
  if (shapeB < 0.5) {
    correction += log1pRatio(shapeA, shapeB);
    shapeB += 1;
  }
  const shift = 6.5;
  const sum = checked(shapeA + shapeB, 'beta shape sum');
  return checked(
    LOG_SQRT_2PI - shift - 0.5 * Math.log(sum + shift)
    - (shapeA - 0.5) * Math.log1p(shapeB / (shapeA + shift))
    - (shapeB - 0.5) * Math.log1p(shapeA / (shapeB + shift))
    + Math.log(lanczosSum(shapeA)) + Math.log(lanczosSum(shapeB)) - Math.log(lanczosSum(sum))
    + correction,
    'log beta',
  );
}

function log1pMinusX(value) {
  let power = -value * value;
  let sum = power / 2;
  for (let order = 3; order <= MAX_ITER; order++) {
    power *= -value;
    const term = power / order;
    sum += term;
    if (Math.abs(term) <= EPS * Math.abs(sum)) return sum;
  }
  throw new Error('log1p series did not converge');
}

function gammaKernel(shape, x, logX) {
  if (shape < 0.5) return shape * logX - x - logGamma(shape);
  const shifted = shape + 6.5;
  const delta = (x - shifted) / shifted;
  const constant = 0.5 * Math.log(shifted) - LOG_SQRT_2PI - Math.log(lanczosSum(shape));
  return Math.abs(delta) < 0.125
    ? shape * log1pMinusX(delta) - 6.5 * delta + constant
    : shape * (logX - Math.log(shifted)) - (x - shifted) + constant;
}

function tailsFromLog(logTail, lowerIsDirect) {
  const log = Math.min(checked(logTail, 'log probability'), 0);
  const direct = Math.exp(log);
  const complement = -Math.expm1(log) || 0;
  return lowerIsDirect ? [direct, complement] : [complement, direct];
}

function smallShapeGammaTails(shape, x, logX) {
  const logGamma1p = shape * horner([
    -0.20738555102867398, 0.27058080842778455, -0.4006856343865314,
    0.8224670334241132, -0.5772156649015329,
  ], shape);
  const logLeading = shape * logX - logGamma1p;
  let factorialTerm = -x;
  let sum = factorialTerm / (shape + 1);
  for (let index = 2; index <= MAX_ITER; index++) {
    factorialTerm *= -x / index;
    const term = factorialTerm / (shape + index);
    if (Math.abs(term) <= EPS * Math.abs(sum)) {
      const upper = clamp(-Math.expm1(logLeading) - Math.exp(logLeading) * (shape * sum), 0, 1);
      return [1 - upper, upper];
    }
    sum += term;
  }
  throw new Error('small-shape gamma series did not converge');
}

function gammaTails(shape, x, logX = Math.log(x)) {
  if (x === 0 && logX === -Infinity) return [0, 1];
  if (x === Infinity) return [1, 0];
  if (shape <= 1e-4 && x < shape + 1) return smallShapeGammaTails(shape, x, logX);
  const kernel = checked(gammaKernel(shape, x, logX), 'gamma kernel');
  if (x < shape + 1) {
    let term = 1;
    let sum = 1;
    for (let index = 1; index <= MAX_ITER; index++) {
      term *= x / (shape + index);
      sum += term;
      const ratio = x / (shape + index + 1);
      if (ratio < 1 && term * ratio / (1 - ratio) <= EPS * sum) {
        return tailsFromLog(kernel - Math.log(shape) + Math.log(sum), true);
      }
    }
    throw new Error('gamma series did not converge');
  }
  const base = (x - shape) + 1;
  let numeratorTerm = 1 / FPMIN;
  let reciprocalTerm = 1 / guard(base);
  let fraction = reciprocalTerm;
  for (let index = 1; index <= MAX_ITER; index++) {
    const coefficient = checked(index * (shape - index), 'gamma fraction coefficient');
    const denominator = checked(base + 2 * index, 'gamma fraction denominator');
    reciprocalTerm = 1 / guard(checked(denominator + coefficient * reciprocalTerm, 'gamma fraction'));
    numeratorTerm = guard(checked(denominator + coefficient / numeratorTerm, 'gamma fraction'));
    const delta = numeratorTerm * reciprocalTerm;
    fraction = checked(fraction * delta, 'gamma fraction');
    if (Math.abs(delta - 1) <= EPS) return tailsFromLog(kernel + Math.log(fraction), false);
  }
  throw new Error('gamma fraction did not converge');
}

function regularizedGamma(shape, x) {
  positive(shape, 'shape');
  if (real(x, 'x') < 0) throw new RangeError('x must be nonnegative');
  return gammaTails(shape, x);
}

export const gammaRegP = (shape, x) => regularizedGamma(shape, x)[0];
export const gammaRegQ = (shape, x) => regularizedGamma(shape, x)[1];

export function chi2Pdf(x, nu) {
  const shape = halfDegrees(nu, 'nu');
  real(x, 'x');
  if (x < 0 || x === Infinity) return 0;
  if (x === 0) return nu < 2 ? Infinity : nu === 2 ? 0.5 : 0;
  const logX = Math.log(x);
  return Math.exp(checked(gammaKernel(shape, x / 2, logX - Math.LN2), 'chi-square kernel') - logX);
}

function chi2Tails(x, nu) {
  const shape = halfDegrees(nu, 'nu');
  if (real(x, 'x') <= 0) return [0, 1];
  return gammaTails(shape, x / 2, Math.log(x) - Math.LN2);
}

export const chi2Cdf = (x, nu) => chi2Tails(x, nu)[0];
export const chi2Sf = (x, nu) => chi2Tails(x, nu)[1];

function betaFraction(x, shapeA, shapeB, sum) {
  let numeratorTerm = 1;
  let reciprocalTerm = 1 / guard(1 - x * (sum / (shapeA + 1)));
  let fraction = reciprocalTerm;
  for (let index = 1; index <= MAX_ITER; index++) {
    const even = shapeA + 2 * index;
    const oddCoefficient = (index / (even - 1)) * ((shapeB - index) / even) * x;
    const evenCoefficient = -((shapeA + index) / even) * ((sum + index) / (even + 1)) * x;
    let delta;
    for (const coefficient of [oddCoefficient, evenCoefficient]) {
      reciprocalTerm = 1 / guard(checked(1 + coefficient * reciprocalTerm, 'beta fraction'));
      numeratorTerm = guard(checked(1 + coefficient / numeratorTerm, 'beta fraction'));
      delta = numeratorTerm * reciprocalTerm;
      fraction = checked(fraction * delta, 'beta fraction');
    }
    if (Math.abs(delta - 1) <= EPS) return fraction;
  }
  throw new Error('beta fraction did not converge');
}

function betaTails(logX, logComplement, shapeA, shapeB) {
  if (logX === -Infinity) return [0, 1];
  if (logComplement === -Infinity) return [1, 0];
  const sum = checked(shapeA + shapeB, 'beta shape sum');
  const lowerIsDirect = logX <= Math.log((shapeA + 1) / (sum + 2));
  if (!lowerIsDirect) {
    [logX, logComplement] = [logComplement, logX];
    [shapeA, shapeB] = [shapeB, shapeA];
  }
  const x = Math.exp(logX);
  const fraction = x === 0 ? 1 : betaFraction(x, shapeA, shapeB, sum);
  const logTail = shapeA * logX + shapeB * logComplement - logBeta(shapeA, shapeB)
    - Math.log(shapeA) + Math.log(fraction);
  return tailsFromLog(logTail, lowerIsDirect);
}

export function betaRegI(x, shapeA, shapeB) {
  positive(shapeA, 'shapeA');
  positive(shapeB, 'shapeB');
  probability(x, 'x');
  return betaTails(Math.log(x), Math.log1p(-x), shapeA, shapeB)[0];
}

export function studentTPdf(x, nu) {
  const shape = halfDegrees(nu, 'nu');
  if (!Number.isFinite(real(x, 'x'))) return 0;
  const logRatio = 2 * Math.log(Math.abs(x)) - Math.log(nu);
  return Math.exp(-0.5 * Math.log(nu) - logBeta(0.5, shape) - (shape + 0.5) * softplus(logRatio));
}

function studentTTails(x, nu) {
  const shape = halfDegrees(nu, 'nu');
  real(x, 'x');
  if (x === 0) return [0.5, 0.5];
  const logRatio = 2 * Math.log(Math.abs(x)) - Math.log(nu);
  const smallTail = 0.5 * betaTails(-softplus(logRatio), -softplus(-logRatio), shape, 0.5)[0];
  return x < 0 ? [smallTail, 1 - smallTail] : [1 - smallTail, smallTail];
}

export const studentTCdf = (x, nu) => studentTTails(x, nu)[0];

export function fPdf(x, dfNum, dfDen) {
  const shapeA = halfDegrees(dfNum, 'dfNum');
  const shapeB = halfDegrees(dfDen, 'dfDen');
  real(x, 'x');
  if (x < 0 || x === Infinity) return 0;
  if (x === 0) return dfNum < 2 ? Infinity : dfNum === 2 ? 1 : 0;
  const logX = Math.log(x);
  const logRatio = logX + Math.log(dfNum) - Math.log(dfDen);
  return Math.exp(-shapeA * softplus(-logRatio) - shapeB * softplus(logRatio) - logBeta(shapeA, shapeB) - logX);
}

function fTails(x, dfNum, dfDen) {
  const shapeA = halfDegrees(dfNum, 'dfNum');
  const shapeB = halfDegrees(dfDen, 'dfDen');
  if (real(x, 'x') <= 0) return [0, 1];
  const logRatio = Math.log(x) + Math.log(dfNum) - Math.log(dfDen);
  return betaTails(-softplus(-logRatio), -softplus(logRatio), shapeA, shapeB);
}

export const fCdf = (x, dfNum, dfDen) => fTails(x, dfNum, dfDen)[0];

function standardized(x, location, scale) {
  real(x, 'x');
  if (!Number.isFinite(location)) throw new RangeError('location must be finite');
  positive(scale, 'scale');
  const difference = x - location;
  return Number.isFinite(difference) || !Number.isFinite(x) ? difference / scale : x / scale - location / scale;
}

export function normalPdf(x, mu = 0, sigma = 1) {
  const z = standardized(x, mu, sigma);
  return Math.exp(-0.5 * z * z - LOG_SQRT_2PI - Math.log(sigma));
}

function normalTails(z) {
  real(z, 'z');
  if (z === 0) return [0.5, 0.5];
  const smallTail = Math.abs(z) >= 39 ? 0 : 0.5 * gammaTails(0.5, 0.5 * z * z)[1];
  return z < 0 ? [smallTail, 1 - smallTail] : [1 - smallTail, smallTail];
}

export const normalCdf = (z) => normalTails(z)[0];

export function normalQuantile(q) {
  probability(q);
  if (q === 0.5) return 0;
  const bounded = clamp(q, 1e-15, 1 - 1e-15);
  const tail = Math.min(bounded, 1 - bounded);
  let z;
  if (tail < 0.02425) {
    const root = Math.sqrt(-2 * Math.log(tail));
    z = horner(NORMAL_C, root) / horner(NORMAL_D, root);
  } else {
    const centered = tail - 0.5;
    const square = centered ** 2;
    z = centered * horner(NORMAL_A, square) / horner(NORMAL_B, square);
  }
  z -= (normalCdf(z) - tail) / normalPdf(z);
  return q > 0.5 ? -z : z;
}

export function logisticPdf(x, mu = 0, v = 1) {
  const distance = Math.abs(standardized(x, mu, v));
  return Math.exp(-distance - 2 * Math.log1p(Math.exp(-distance)) - Math.log(v));
}

export function logisticCdf(x, mu = 0, v = 1) {
  const z = standardized(x, mu, v);
  const tail = Math.exp(-Math.abs(z));
  return (z >= 0 ? 1 : tail) / (1 + tail);
}

export function logisticQuantile(q, mu = 0, v = 1) {
  probability(q);
  if (!Number.isFinite(mu)) throw new RangeError('location must be finite');
  positive(v, 'scale');
  return mu + v * (Math.log(q) - Math.log1p(-q));
}

function interpolate(lo, hi, fraction) {
  const width = hi - lo;
  return Number.isFinite(width) ? lo + fraction * width : (1 - fraction) * lo + fraction * hi;
}

function invertIncreasing(evaluate, target, lo, hi, pdf) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) throw new RangeError('Expected a finite lo < hi');
  let lower = checked(evaluate(lo), 'inversion function');
  let upper = checked(evaluate(hi), 'inversion function');
  let expansion = Math.min(hi - lo, Number.MAX_VALUE);
  while (lower > target || upper < target) {
    if (lower > target) {
      const next = Math.max(-Number.MAX_VALUE, lo - expansion);
      if (next === lo && lo === -Number.MAX_VALUE) throw new Error('Could not bracket quantile below');
      lo = next;
      lower = checked(evaluate(lo), 'inversion function');
    } else {
      const next = Math.min(Number.MAX_VALUE, hi + expansion);
      if (next === hi && hi === Number.MAX_VALUE) throw new Error('Could not bracket quantile above');
      hi = next;
      upper = checked(evaluate(hi), 'inversion function');
    }
    expansion = Math.min(2 * expansion, Number.MAX_VALUE);
  }
  if (lower === target) return { value: lo, resolutionLimited: false };
  if (upper === target) return { value: hi, resolutionLimited: false };
  let candidate = interpolate(lo, hi, 0.5);
  for (let iteration = 0; iteration < MAX_ITER; iteration++) {
    const midpoint = interpolate(lo, hi, 0.5);
    if (hi / 2 - lo / 2 <= 1e-10) return { value: midpoint, resolutionLimited: false };
    if (midpoint === lo || midpoint === hi) {
      return { value: target - lower <= upper - target ? lo : hi, resolutionLimited: true };
    }
    const value = checked(evaluate(candidate), 'inversion function');
    if (value < target) {
      lo = candidate;
      lower = value;
    } else {
      hi = candidate;
      upper = value;
    }
    const slope = pdf ? pdf(candidate) : (upper - lower) / (hi - lo);
    const proposal = candidate - (value - target) / slope;
    candidate = Number.isFinite(slope) && slope > 0
      && proposal > interpolate(lo, hi, 0.25) && proposal < interpolate(lo, hi, 0.75)
      ? proposal : interpolate(lo, hi, 0.5);
  }
  throw new Error('Quantile inversion did not converge');
}

export function invertCdf(cdfFn, q, lo, hi) {
  probability(q);
  return invertIncreasing((x) => probability(cdfFn(x), 'CDF'), q, lo, hi).value;
}

function invertTails(tails, pdf, q, hi) {
  const lower = q <= 0.5;
  return invertIncreasing(
    (x) => lower ? tails(x)[0] : -tails(x)[1],
    lower ? q : -(1 - q), 0, hi, pdf,
  ).value;
}

export function chi2Quantile(q, nu) {
  probability(q);
  halfDegrees(nu, 'nu');
  if (q === 0 || q === 1) return q === 0 ? 0 : Infinity;
  return invertTails((x) => chi2Tails(x, nu), (x) => chi2Pdf(x, nu), q, Math.max(1, nu));
}

export function studentTQuantile(q, nu) {
  probability(q);
  halfDegrees(nu, 'nu');
  if (q === 0 || q === 1 || q === 0.5) return q === 0 ? -Infinity : q === 1 ? Infinity : 0;
  const magnitude = invertIncreasing(
    (x) => -studentTTails(x, nu)[1], -Math.min(q, 1 - q), 0, 1, (x) => studentTPdf(x, nu),
  ).value;
  return q < 0.5 ? -magnitude : magnitude;
}

export function fQuantile(q, dfNum, dfDen) {
  probability(q);
  halfDegrees(dfNum, 'dfNum');
  halfDegrees(dfDen, 'dfDen');
  if (q === 0 || q === 1) return q === 0 ? 0 : Infinity;
  return invertTails((x) => fTails(x, dfNum, dfDen), (x) => fPdf(x, dfNum, dfDen), q, 1);
}

const text = (zh, en) => ({ zh, en });
const range = (key, label, min, max, step, value) => ({ key, kind: 'range', label, min, max, step, value });
const toggle = (key, label, value, options) => ({ key, kind: 'toggle', label, value, options });
const PARETO_80_20 = Math.log(5) / Math.log(4);
const DEG = Math.PI / 180;

export const PROB_ACTS = [
  {
    id: 'act-1', num: 1, topicKey: 'l2-projection',
    shortTitle: text('L²投影/MSE', 'L² projection / MSE'),
    title: text('第 1 幕 · 条件期望与均方误差', 'Act 1 · Conditional Expectation and MSE'),
    cue: text('把 X 投影到由 Z 决定的空间，再比较 T 与 V 的误差。', 'Project X onto the space determined by Z, then compare the errors of T and V.'),
    carries: text('HW7 Q1–Q4：用二阶矩判断平方可积，再计算投影与残差。', 'HW7 Q1–Q4: use second moments to identify L² variables and compute the projection.'),
    hook: text('观测共享同一天的结果时，平均值的方差会怎样？', 'How does the variance change when all observations share one daily outcome?'),
    relates: [{ to: 'act-2', type: 'deepens', why: text('用方差度量相关性的影响', 'Measure the effect of dependence using variance') }],
    camera: { target: [0, 0.35, 0], azimuth: 28 * DEG, elevation: 36 * DEG, zoom: 0.86 },
    defaultParams: { pBern: 0.5, nSample: 8, xFocus: 0, estimator: 'T' },
    controls: [
      range('p', text('伯努利概率', 'Bernoulli probability'), 0.05, 0.95, 0.05, 0.5),
      toggle('estimator', text('估计量', 'Estimator'), 'T', [
        { value: 'T', label: text('T（无偏）', 'T (unbiased)') },
        { value: 'V', label: text('V（缩减）', 'V (shrunken)') },
      ]),
    ],
  },
  {
    id: 'act-2', num: 2, topicKey: 'discrete-dependence',
    shortTitle: text('离散/相关', 'Discrete / dependence'),
    title: text('第 2 幕 · 离散计数与相关性', 'Act 2 · Discrete Counts and Dependence'),
    cue: text('比较独立试验与整批共用结果时的分布。', 'Compare the distributions of independent trials and a shared batch outcome.'),
    carries: text('用上一幕的方差分解比较均值同为 10 的总数。', 'Compare counts with the same mean of 10 using the variance from Act 1.'),
    hook: text('如果输入是连续量，能直接把均值代入非线性变换吗？', 'Can we put the mean of a continuous input directly into a nonlinear transform?'),
    relates: [{ to: 'act-3', type: 'deepens', why: text('把离散求和推广到连续积分', 'Move from discrete sums to continuous integrals') }],
    camera: { target: [0, 0.3, 0], azimuth: 24 * DEG, elevation: 34 * DEG, zoom: 0.86 },
    defaultParams: { pReliab: 0.75, lamPois: 10, pThin: 0.3, popL: 20, drawN: 6, mode: 'indep' },
    controls: [
      toggle('mode', text('计数模型', 'Count model'), 'indep', [
        { value: 'indep', label: text('独立', 'Independent') },
        { value: 'batch', label: text('整批', 'Shared batch') },
      ]),
      range('pRel', text('单件可靠度', 'Component reliability'), 0.05, 0.95, 0.05, 0.75),
    ],
  },
  {
    id: 'act-3', num: 3, topicKey: 'continuous-transform',
    shortTitle: text('变换/重期望', 'Transforms / tower rule'),
    title: text('第 3 幕 · 连续变换与重期望', 'Act 3 · Continuous Transforms and the Tower Rule'),
    cue: text('平方后的一个阈值，在正态输入上对应两条尾巴。', 'One threshold after squaring corresponds to two tails of the normal input.'),
    carries: text('从离散加权平均转到连续积分，比较 E[g(V)] 与 g(E[V])。', 'Move from finite sums to integrals and compare E[g(V)] with g(E[V]).'),
    hook: text('同一个到达事件，能同时用等待时间和计数描述吗？', 'Can the same arrival event be expressed using both a wait and a count?'),
    relates: [{ to: 'act-4', type: 'contrast', why: text('从平方变换转到计数与等待的等价事件', 'Compare a square transform with equivalent count and wait events') }],
    camera: { target: [0, 0.3, 0], azimuth: 24 * DEG, elevation: 34 * DEG, zoom: 0.86 },
    defaultParams: { vLo: 1, vHi: 3, kV: 5, muX: 6, sigX: 1, cutoff: 120, alpha: 0.05 },
    controls: [range('alpha', text('正态上尾面积 α', 'Normal upper-tail area α'), 0.01, 0.10, 0.01, 0.05)],
  },
  {
    id: 'act-4', num: 4, topicKey: 'waiting-heavy-tail',
    shortTitle: text('计数/重尾', 'Counts / heavy tails'),
    title: text('第 4 幕 · 等待时间与重尾', 'Act 4 · Waiting Times and Heavy Tails'),
    cue: text('移动时间游标，数出已经到达的事件。', 'Move the time cursor and count the arrivals.'),
    carries: text('同一个事件可写成 Tₙ > t 或 N(t) ≤ n−1。', 'The same event can be written as Tₙ > t or N(t) ≤ n−1.'),
    hook: text('形状参数改变时，分布的均值和方差还存在吗？', 'When shape changes, do the distribution’s mean and variance still exist?'),
    relates: [{ to: 'act-5', type: 'deepens', why: text('比较帕累托与 t 分布的矩条件', 'Compare the moment conditions for Pareto and Student t') }],
    camera: { target: [0, 0.3, 0], azimuth: 24 * DEG, elevation: 36 * DEG, zoom: 0.86 },
    defaultParams: { lamExp: 0.5, nStage: 3, tHorizon: 8, paretoLam: PARETO_80_20 },
    controls: [
      range('lambdaP', text('帕累托形状 λ', 'Pareto shape λ'), 0.6, 2, 0.05, PARETO_80_20),
      range('t', text('观测时刻', 'Observation time'), 0, 16, 1, 8),
    ],
  },
  {
    id: 'act-5', num: 5, topicKey: 'sampling-laws',
    shortTitle: text('采样/极限定理', 'Sampling / limit laws'),
    title: text('第 5 幕 · 卡方、t 与 F 分布', 'Act 5 · Chi-Square, t and F Distributions'),
    cue: text('切换二维和三维靶，比较同一半径外的概率。', 'Switch between 2D and 3D targets and compare probability outside one radius.'),
    carries: text('像帕累托一样，低自由度 t 分布可能缺少均值或方差。', 'As with Pareto, a low-degree t law can lack a mean or variance.'),
    hook: text('估计了一个均值以后，残差平方和还剩几个自由度？', 'After fitting a mean, how many degrees of freedom remain for squared residuals?'),
    relates: [{ to: 'act-1', type: 'uses', why: text('用投影空间的维数解释自由度', 'Use projection dimensions to explain degrees of freedom') }],
    camera: { target: [0, 0.5, 0], azimuth: 28 * DEG, elevation: 37 * DEG, zoom: 0.86 },
    defaultParams: { nu: 5, nuNum: 6, nuDen: 14, logisticMu: 0, logisticScale: 1, dim: 3 },
    controls: [
      range('nu', text('t 自由度 ν', 't degrees of freedom ν'), 1, 30, 1, 5),
      toggle('dim', text('靶的维数', 'Target dimensions'), 3, [
        { value: 2, label: text('二维', '2D') },
        { value: 3, label: text('三维', '3D') },
      ]),
    ],
  },
];

const DEFAULT_PARAMS = Object.assign({}, ...PROB_ACTS.map((act) => act.defaultParams));
const PARAM_RANGES = {
  pBern: [0.02, 0.98], nSample: [3, 30, true], xFocus: [-4, 4],
  pReliab: [0, 1], lamPois: [1, 30], pThin: [0, 1], popL: [4, 60, true], drawN: [1, 60, true],
  vLo: [0, 5], vHi: [0, 5], kV: [0.1, 10], muX: [-12, 12], sigX: [0.1, 10], cutoff: [0, 1_000],
  alpha: [0.01, 0.10], lamExp: [0.05, 2], nStage: [1, 20, true], tHorizon: [0, 16], paretoLam: [0.5, 3],
  nu: [1, 40, true], nuNum: [1, 40, true], nuDen: [1, 40, true], logisticMu: [-12, 12], logisticScale: [0.1, 10],
};
const PARAM_ALIASES = {
  p: ['pBern', 0.05, 0.95], pRel: ['pReliab', 0.05, 0.95],
  lambdaP: ['paretoLam', 0.6, 2], t: ['tHorizon', 0, 16],
};

const fmt = (value) => value === null ? '∞' : Number(value.toPrecision(6)).toString();
const token = (value, tone, emph) => ({ text: typeof value === 'number' ? fmt(value) : value, tone, emph });
const equation = (label, ...tokens) => ({ label, tokens });
const item = (k, value) => ({ k, v: typeof value === 'number' ? fmt(value) : value });
const bar = (label, value, ghost) => ({ label, value, ghost });
const mark = (axis, value, label, tone = 'amber') => ({ axis, value, label, tone });

function points(lo, hi, evaluate, count = 41) {
  return Array.from({ length: count }, (_, index) => {
    const x = lo + (hi - lo) * index / (count - 1);
    return { x, y: evaluate(x) };
  });
}

function chart(title, badge, xLabel, yLabel, series, { ghost = null, marks = [], dot = null } = {}) {
  const all = series.flatMap((line) => line.points).concat(ghost?.points || [], dot ? [dot] : []);
  return {
    title, badge, xLabel, yLabel, series, ghost, marks, dot, ariaLabel: title,
    xMin: Math.min(...all.map(({ x }) => x)), xMax: Math.max(...all.map(({ x }) => x)),
    yMin: Math.min(0, ...all.map(({ y }) => y)), yMax: 1.08 * Math.max(...all.map(({ y }) => y), 1e-12),
  };
}

function stage(kind, metrics, entities, pill, calloutId, stepCursor) {
  const callouts = [{
    id: calloutId, label: pill.pillLabel, sublabel: pill.pillValue, tone: pill.pillTone,
    anchor: [0, 0.55, 0], dx: 12, dy: -16, afterStep: 0,
  }];
  return { kind, metrics, entities, callouts, highlights: stepCursor > 0 ? [calloutId] : [] };
}

function hud(pillLabel, value, pillTone, readoutLeft, readoutRight, inspectorItems) {
  return { pillLabel, pillValue: typeof value === 'number' ? fmt(value) : value, pillTone, readoutLeft, readoutRight, inspectorItems };
}

function maths(subtitle, badge, equations, table, breakdown) {
  return { subtitle, badge, equations, table, breakdown };
}

function projectionAct(params, l) {
  const { pBern, nSample, xFocus, estimator, stepCursor } = params;
  const theta = pBern * (1 - pBern);
  const expectedConditionalVariance = 13 / 4;
  const varianceOfConditionalMean = 3 / 4;
  const varianceX = expectedConditionalVariance + varianceOfConditionalMean;
  const cosTheta = Math.sqrt(varianceOfConditionalMean / varianceX);
  const varT = theta * (0.5 - theta);
  const varV = varT / 4;
  const biasV = -theta / 2;
  const mseT = varT;
  const mseV = varV + biasV ** 2;
  const numbers = {
    expectedConditionalVariance, varianceOfConditionalMean, varianceX, cosTheta,
    thetaDeg: Math.acos(cosTheta) / DEG, theta, biasT: 0, biasV, varT, varV, mseT, mseV,
    dofOneFit: nSample - 1, dofTwoFits: nSample - 2,
    eA: 4 / 3, eA2: 2, mseA: 2 / 9, eB: 2, eB2: null, bNotL2: true,
  };
  const useT = estimator === 'T';
  const mse = useT ? mseT : mseV;
  const heading = l('偏差与方差', 'Bias and variance');
  const display = hud(
    `MSE(${estimator})`, mse, useT ? 'teal' : 'amber',
    `Var(X) = ${fmt(varianceX)}`, `p = ${fmt(pBern)}`,
    [item(l('投影夹角（度）', 'Projection angle (degrees)'), numbers.thetaDeg), item(l('横截面 x', 'Section x'), xFocus)],
  );
  return {
    numbers,
    stageData: stage('l2-projection', { varianceX, mseT, mseV, cosTheta, thetaDeg: numbers.thetaDeg }, {
      projection: { normX: Math.sqrt(varianceX), normM: Math.sqrt(varianceOfConditionalMean),
        cosTheta, within: expectedConditionalVariance, between: varianceOfConditionalMean },
      bars: [bar('T', mseT, 1 / 16), bar('V', mseV, 1 / 32)],
    }, display, 'projection', stepCursor),
    chart: chart(l('伯努利方差估计的 MSE', 'MSE for Bernoulli variance estimates'), heading, 'p', 'MSE', [
      { points: points(0.02, 0.98, (p) => p * (1 - p) * (0.5 - p * (1 - p))), tone: 'teal' },
      { points: points(0.02, 0.98, (p) => p * (1 - p) / 8), tone: 'amber' },
    ], { marks: [mark('x', pBern, 'p')], dot: { x: pBern, y: mse } }),
    maths: maths(l('投影把总方差拆成组内与组间两部分。', 'Projection splits total variance into within and between terms.'), heading, [
      equation(l('条件期望', 'Conditional expectation'), token('M = projₚ(X) = 1 + 2Z', 'teal')),
      equation(l('全方差', 'Total variance'), token('13/4 + 3/4 = '), token(varianceX, 'teal', true)),
      equation(l('估计量', 'Estimators'), token('T = (X₁−X₂)²/2'), token('V = T/2', 'amber')),
      equation(l('自由度', 'Degrees of freedom'), token(`n−1 = ${numbers.dofOneFit}`), token(`n−2 = ${numbers.dofTwoFits}`)),
    ], {
      caption: heading, headers: [l('估计量', 'Estimator'), l('偏差', 'Bias'), l('方差', 'Variance'), 'MSE'],
      rows: [['T', '0', fmt(varT), fmt(mseT)], ['V', fmt(biasV), fmt(varV), fmt(mseV)]],
      activeRow: useT ? 0 : 1,
      note: l('MSE 等于方差加偏差的平方。', 'MSE equals variance plus squared bias.'),
    }, [{ tag: 'L²', text: l('E[A²] = 2，而 E[B²] = ∞。', 'E[A²] = 2, while E[B²] = ∞.'), tone: 'navy' }]),
    hud: display,
  };
}

function majority(p) {
  const complement = 1 - p;
  const r3 = p ** 3 + 3 * p ** 2 * complement;
  const r5 = p ** 5 + 5 * p ** 4 * complement + 10 * p ** 3 * complement ** 2;
  return { r3, r5, delta: r5 - r3 };
}

function binomialCoefficient(n, k) {
  let coefficient = 1;
  for (let index = 1; index <= Math.min(k, n - k); index++) {
    coefficient *= (n - index + 1) / index;
  }
  return coefficient;
}

function discreteAct(params, l) {
  const { pReliab, lamPois, pThin, popL, drawN, mode, stepCursor } = params;
  const majorityResult = majority(pReliab);
  const n = Math.round(lamPois);
  const popK = Math.round(popL * pThin);
  const populationRate = popK / popL;
  const fpc = (popL - drawN) / (popL - 1);
  const binomVar = drawN * populationRate * (1 - populationRate);
  const numbers = {
    mean: 100 * 0.1, rossVariance: 100 ** 2 * 0.1 * 0.9, comparisonVariance: 100 * 0.1 * 0.9,
    ...majorityResult, flipPoint: 0.5, unconditionalCov: 0, conditionalCov: -n * pThin * (1 - pThin),
    n, popK, fpc, hypergeomVar: binomVar * fpc, binomVar,
    hw8Q3: { binom: -Math.expm1(100 * Math.log1p(-0.01)), poisson: -Math.expm1(-1) }, ross53aP: 3367 / 3876,
  };
  const batch = mode === 'batch';
  const binom = (k) => binomialCoefficient(100, k) * 0.1 ** k * 0.9 ** (100 - k);
  const bins = Array.from({ length: 20 }, (_, count) => binom(count));
  bins.push(1 - bins.reduce((sum, value) => sum + value, 0));
  const bars = bins.map((independent, count) => {
    const shared = count === 0 ? 0.9 : count === 20 ? 0.1 : 0;
    return bar(count === 20 ? '20+' : String(count), batch ? shared : independent, batch ? independent : shared);
  });
  const badge = l('多数表决', 'Majority vote');
  const variance = batch ? numbers.rossVariance : numbers.comparisonVariance;
  const display = hud(l('计数方差', 'Count variance'), variance, batch ? 'amber' : 'teal',
    `E[N] = ${numbers.mean}`, `R₅−R₃ = ${fmt(numbers.delta)}`,
    [item(l('给定总数的协方差', 'Covariance given total'), numbers.conditionalCov), item('FPC', fpc)]);
  return {
    numbers,
    stageData: stage('discrete-dependence', { variance, ...majorityResult, fpc, conditionalCov: numbers.conditionalCov },
      { bars, rail: null }, display, 'count-bars', stepCursor),
    chart: chart(l('三件与五件的多数可靠度', 'Three- and five-component majority reliability'), badge,
      'p', l('可靠度', 'Reliability'), [
        { points: points(0, 1, (p) => majority(p).r3), tone: 'teal' },
        { points: points(0, 1, (p) => majority(p).r5), tone: 'amber', dashed: true },
      ], { marks: [mark('x', 0.5, 'p = 0.5')], dot: { x: pReliab, y: numbers.r5 } }),
    maths: maths(l('共用一次伯努利结果使总数变成 0 或 100。', 'A shared Bernoulli outcome makes the count either 0 or 100.'), badge, [
      equation(l('可靠度差', 'Reliability gap'), token('R₅−R₃ = 3p²(1−p)²(2p−1) = '), token(numbers.delta, 'amber', true)),
      equation(l('泊松分流', 'Poisson thinning'), token('Cov(N₁,N₂) = 0'), token(`Cov(N₁,N₂ | N=${n}) = ${fmt(numbers.conditionalCov)}`, 'navy')),
      equation(l('不放回抽样', 'Sampling without replacement'), token('Var(H) = np(1−p) × FPC'), token(fpc, 'teal')),
    ], {
      caption: l('同均值的两种模型', 'Two models with the same mean'),
      headers: [l('模型', 'Model'), l('均值', 'Mean'), l('方差', 'Variance')],
      rows: [[l('独立', 'Independent'), '10', '9'], [l('整批', 'Shared batch'), '10', '900']],
      activeRow: batch ? 1 : 0, note: l('横轴最后一格含 20 及以上。', 'The last PMF bin includes counts of 20 and above.'),
    }, [{ tag: 'HW8 Q3', text: `Bin: ${fmt(numbers.hw8Q3.binom)} · Pois: ${fmt(numbers.hw8Q3.poisson)}`, tone: 'muted' }]),
    hud: display,
  };
}

function sumDisjointTails(left, right) {
  const larger = Math.max(left, right);
  const sum = left + right;
  if (left === 0 || right === 0 || larger === 1 || sum > larger) return Math.min(1, sum);
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, larger);
  bits.setBigUint64(0, bits.getBigUint64(0) + 1n);
  return bits.getFloat64(0);
}

function transformAct(params, l) {
  const { vLo, vHi, kV, muX, sigX, cutoff, alpha, stepCursor } = params;
  const meanV = (vLo + vHi) / 2;
  const span = kV * (vHi - vLo) / 2;
  const sinhc = span === 0 ? 1 : Math.sinh(span) / span;
  const gMeanV = 1e-6 * Math.expm1(kV * meanV);
  const jensenGap = 1e-6 * Math.exp(kV * meanV) * (sinhc - 1);
  const meanI = gMeanV + jensenGap;
  const root = Math.sqrt(cutoff / 3);
  const lowerTailRef = normalCdf((-root - muX) / sigX);
  const upperTailRef = normalTails((root - muX) / sigX)[1];
  const twoTail = sumDisjointTails(lowerTailRef, upperTailRef);
  const sumVar = 19.22;
  const eYgivenZ = [11 / 18, 17 / 30];
  const z = normalQuantile(1 - alpha);
  const numbers = {
    meanI, gMeanV, jensenGap, twoTail, oneTail: upperTailRef, lowerTailRef, upperTailRef,
    sumVar, pSumGt25: normalTails((25 - 24.16) / Math.sqrt(sumVar))[1],
    pDiffGt3: normalTails(3 / Math.sqrt(sumVar))[1],
    zAlpha: Object.fromEntries([0.05, 0.025, 0.01].map((level) => [level, normalQuantile(1 - level)])),
    z, towerResult: eYgivenZ[0] * 3 / 8 + eYgivenZ[1] * 5 / 8, eYgivenZ,
  };
  const density = (x) => normalPdf(x, muX, sigX);
  const lo = Math.min(-root, muX - 4 * sigX) - 1.2;
  const hi = Math.max(root, muX + 4 * sigX) + 1.0;
  const bars = points(muX - 4 * sigX, muX + 4 * sigX, density, 16)
    .map(({ x, y }) => bar(fmt(x), y, Math.abs(x) > root ? y : 0));
  const badge = l('平方变换', 'Square transform');
  const display = hud(l('双尾概率', 'Two-tail probability'), twoTail, 'teal',
    `W > ${fmt(cutoff)}`, `zα = ${fmt(z)}`,
    [item(l('左尾', 'Left tail'), lowerTailRef), item(l('右尾', 'Right tail'), upperTailRef), item(l('重期望', 'Tower rule'), numbers.towerResult)]);
  const fmtMark = (v) => Number(v.toPrecision(3)).toString();
  const posMark = cutoff === 120 ? '√40' : fmtMark(root);
  const negMark = cutoff === 120 ? '-√40' : fmtMark(-root);
  const chartMarks = [mark('x', root, posMark), mark('x', -root, negMark)];
  if (root === 0) chartMarks.pop();
  chartMarks.push(mark('x', muX + sigX * z, 'zα', 'navy'));
  return {
    numbers,
    stageData: stage('continuous-transform', { twoTail, meanI, gMeanV, jensenGap: numbers.jensenGap, zAlpha: z },
      { bars, threshold: { x: root, leftTail: lowerTailRef, rightTail: upperTailRef } }, display, 'two-tails', stepCursor),
    chart: chart(l('平方阈值在输入分布上的两条尾巴', 'Two input tails of the square threshold'), badge,
      'V', l('密度', 'Density'), [{ points: points(lo, hi, density), tone: 'teal' }],
      { marks: chartMarks, dot: { x: root, y: density(root) } }),
    maths: maths(l('标准化后，分别积分左尾和右尾。', 'Standardize, then integrate the left and right tails separately.'), badge, [
      equation(l('事件原像', 'Event preimage'), token('W = 3V²'), token(`|V| > ${fmt(root)}`, 'amber')),
      equation(l('标准化', 'Standardization'), token('P(Z > zα) = α'), token(`zα = ${fmt(z)}`, 'teal', true)),
      equation(l('重期望', 'Tower rule'), token('E[Y|X] = (3X+2)/(6X+3)'), token('E[Y] = 7/12', 'navy')),
      equation(l('正态和差方差', 'Normal sum and difference variance'), token('Var(S) = Var(D) = 19.22')),
    ], {
      caption: l('二极管电流', 'Diode current'), headers: [l('计算方式', 'Calculation'), l('电流', 'Current')],
      rows: [['E[g(V)]', fmt(meanI)], ['g(E[V])', fmt(gMeanV)]], activeRow: 0,
      note: l('指数变换是凸函数。', 'The exponential transform is convex.'),
    }, [{ tag: 'Jensen', text: `E[g(V)] − g(E[V]) = ${fmt(numbers.jensenGap)}`, tone: 'amber' }]),
    hud: display,
  };
}

function poissonThrough(count, mean) {
  let term = Math.exp(-mean);
  let sum = term;
  for (let index = 1; index <= count; index++) {
    term *= mean / index;
    sum += term;
  }
  return clamp(sum, 0, 1);
}

function arrivalTimes(rate, tMax) {
  let seed = 0x83b1e2af;
  let time = 0;
  const arrivals = [];
  while (time < tMax) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    time -= Math.log1p(-(seed + 0.5) / 2 ** 32) / rate;
    if (time <= tMax) arrivals.push(time);
  }
  return arrivals;
}

function waitingAct(params, l) {
  const { lamExp, nStage, tHorizon, paretoLam, stepCursor } = params;
  const lambdaT = 0.01 + 0.02 + 0.03;
  const y80OverAlpha = 4;
  const top20Share = y80OverAlpha ** (1 - paretoLam);
  const meanFinite = paretoLam > 1;
  const waitingSF = gammaRegQ(nStage, lamExp * tHorizon);
  const poissonCDF = poissonThrough(nStage - 1, lamExp * tHorizon);
  const numbers = {
    lambdaT, pSeries10: Math.exp(-lambdaT * 10), gammaSF8: gammaRegQ(3, 4), poissonCDF2: poissonThrough(2, 4),
    paretoLam, y80OverAlpha, top20Share, meanFinite, eY: meanFinite ? paretoLam / (paretoLam - 1) : null,
    topFifthShare: meanFinite ? 0.2 ** (1 - 1 / paretoLam) : null, waitingSF, poissonCDF,
  };
  const tMax = 16;
  const arrivals = arrivalTimes(lamExp, tMax);
  const countLE = arrivals.filter((time) => time <= tHorizon).length;
  const rail = { tMax, t: tHorizon, n: nStage, arrivals, countLE };
  const tail = (x) => x ** -paretoLam;
  const bars = points(1, 8, tail, 16).map(({ x, y }) => bar(fmt(x), y, x ** -PARETO_80_20));
  const badge = l('等待与计数', 'Waiting and counts');
  const display = hud(l('第 n 次到达仍未发生', 'Probability the nth arrival is still ahead'), waitingSF,
    meanFinite ? 'teal' : 'danger', `t = ${fmt(tHorizon)}`, `N(t) = ${countLE}`,
    [item('E[Y]', fmt(numbers.eY)), item(l('超过 4α 的总量占比', 'Share above 4α'), meanFinite ? fmt(top20Share) : '—')]);
  return {
    numbers,
    stageData: stage('waiting-heavy-tail', { waitingSF, poissonCDF, top20Share, countLE, paretoLam }, { rail, bars },
      display, 'arrivals', stepCursor),
    chart: chart(l('帕累托尾概率', 'Pareto survival probability'), l('重尾', 'Heavy tail'), 'y/α', 'P(Y > y)',
      [{ points: points(1, 8, tail), tone: 'teal' }],
      { ghost: { points: points(1, 8, (x) => x ** -PARETO_80_20) }, marks: [mark('x', 4, '4α')],
        dot: { x: 4, y: tail(4) } }),
    maths: maths(l('第 n 次到达晚于 t，等价于截至 t 只到达至多 n−1 次。', 'The nth arrival is after t exactly when at most n−1 arrivals have occurred.'), badge, [
      equation(l('计数与等待', 'Count and wait'), token('P(Tₙ > t) = P(N(t) ≤ n−1) = '), token(waitingSF, 'teal', true)),
      equation(l('指数无记忆性', 'Exponential memorylessness'), token('P(T > s+t | T > s) = P(T > t)')),
      equation(l('串联系统', 'Series system'), token('λₜ = 0.06'), token(`P(T > 10) = ${fmt(numbers.pSeries10)}`, 'navy')),
      equation(l('帕累托均值', 'Pareto mean'), token('Y = αeˣ'), token(`E[Y] = ${fmt(numbers.eY)}`, meanFinite ? 'teal' : 'danger')),
    ], null, [{ tag: '80/20', text: l('当 λ = ln(5)/ln(4) 时，最高 20% 占总量的 80%。',
      'At λ = ln(5)/ln(4), the top 20% accounts for 80% of the total.'), tone: 'amber' }]),
    hud: display,
  };
}

function samplingAct(params, l) {
  const { nu, nuNum, nuDen, logisticMu, logisticScale, dim, stepCursor } = params;
  const radius = 1.5;
  const chi3SF = chi2Sf(radius ** 2, 3);
  const chi2SF = chi2Sf(radius ** 2, 2);
  const fCurrentT2 = fCdf(1.4 ** 2, 1, nu);
  const numbers = {
    chi3SF, chi2SF, tCdf14: studentTCdf(1.4, 12), fCdfT2: fCdf(1.4 ** 2, 1, 12),
    f6_14: fCdf(1.5, 6, 14), f14_6: fCdf(1.5, 14, 6), fReciprocal: fCdf(1 / 1.5, 14, 6),
    f01: fQuantile(0.99, 6, 14), t975_9: studentTQuantile(0.975, 9),
    chi2_26_30: chi2Cdf(30, 26), chi2_05_15: chi2Quantile(0.95, 15),
    logisticQ75: logisticQuantile(0.75), logisticRoundTrip: logisticCdf(logisticQuantile(0.75)),
    meanExists: nu > 1, varFinite: nu > 2, fCurrent: fCdf(1.5, nuNum, nuDen),
    logisticCurrentQ75: logisticQuantile(0.75, logisticMu, logisticScale),
  };
  const rings = [0.5, 1, 1.5, 2, 2.5].map((r) => ({ r, prob: chi2Cdf(r ** 2, dim) }));
  const density = (x) => studentTPdf(x, nu);
  const bars = points(-4, 4, density, 15).map(({ x, y }) => bar(fmt(x), y, normalPdf(x)));
  const pExceed = dim === 3 ? chi3SF : chi2SF;
  const badge = l('自由度', 'Degrees of freedom');
  const display = hud(l('靶圈外概率', 'Probability outside the target'), pExceed, dim === 3 ? 'teal' : 'amber',
    `d = ${dim}, r = ${radius}`, `ν = ${nu}`,
    [item(l('t 均值', 't mean'), numbers.meanExists ? '0' : l('不存在', 'Undefined')),
      item(l('t 方差', 't variance'), numbers.varFinite ? fmt(nu / (nu - 2)) : nu > 1 ? '∞' : l('不存在', 'Undefined'))]);
  return {
    numbers,
    stageData: stage('sampling-laws', { pExceed, chi3SF, chi2SF, nu },
      { dome: { dim, radius, rings, pExceed3: chi3SF, pExceed2: chi2SF }, bars }, display, 'target-dome', stepCursor),
    chart: chart(l('t 分布与标准正态密度', 'Student t and standard normal densities'), badge, 'x', l('密度', 'Density'),
      [{ points: points(-5, 5, density), tone: 'teal' }],
      { ghost: { points: points(-5, 5, (x) => normalPdf(x)) } }),
    maths: maths(l('正态坐标的平方和服从卡方分布。', 'The sum of squared standard normal coordinates is chi-square.'), badge, [
      equation(l('卡方与伽马', 'Chi-square and gamma'), token('χ²ᵥ = Gamma(ν/2, rate 1/2)'), token(pExceed, 'teal', true)),
      equation(l('t 的平方', 'Squared t'), token('T² ∼ F₁,ᵥ'), token(`2Fₜ(1.4)−1 = ${fmt(fCurrentT2)}`, 'navy')),
      equation(l('F 的顺序', 'Order of F degrees'), token(`F₍${nuNum},${nuDen}₎(1.5) = `), token(numbers.fCurrent, 'teal')),
      equation(l('逻辑斯蒂分位数', 'Logistic quantile'), token('Q(q) = μ + v ln(q/(1−q))'), token(numbers.logisticCurrentQ75, 'amber')),
    ], {
      caption: l('维数与靶圈外概率', 'Dimensions and probability outside the target'),
      headers: [l('维数', 'Dimensions'), 'P(R > 1.5)'],
      rows: [[2, fmt(chi2SF)], [3, fmt(chi3SF)]], activeRow: dim - 2,
      note: l('两种靶使用相同半径。', 'Both targets use the same radius.'),
    }, [{ tag: 't', text: l('ν > 1 时均值存在，ν > 2 时方差有限。', 'The mean exists for ν > 1 and variance is finite for ν > 2.'), tone: 'amber' }]),
    hud: display,
  };
}

const SOLVERS = [projectionAct, discreteAct, transformAct, waitingAct, samplingAct];

function boundedParam(value, min, max, integer = false) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return undefined;
  const number = Number(value);
  if (Number.isNaN(number)) return undefined;
  return clamp(integer ? Math.round(number) : number, min, max);
}

export class ProbBenchEngine {
  constructor() {
    this.actIndex = 0;
    this.lang = 'zh';
    this.params = { ...DEFAULT_PARAMS };
    this.resetPlaybackOverrides();
  }

  get act() {
    return PROB_ACTS[this.actIndex];
  }

  resetPlaybackOverrides() {
    this.stepCursor = 0;
    this.highlight = null;
    this.cutPoints = null;
  }

  setAct(indexOrId) {
    const index = typeof indexOrId === 'number'
      ? boundedParam(indexOrId, 0, PROB_ACTS.length - 1, true)
      : PROB_ACTS.findIndex(({ id }) => id === indexOrId);
    this.actIndex = Math.max(0, index ?? 0);
    return this.solve();
  }

  setParams(patch = {}) {
    const params = { ...this.params };
    for (const [key, bounds] of Object.entries(PARAM_RANGES)) {
      params[key] = boundedParam(patch[key], ...bounds) ?? params[key];
    }
    for (const [alias, [key, min, max]] of Object.entries(PARAM_ALIASES)) {
      params[key] = boundedParam(patch[alias], min, max) ?? params[key];
    }
    if (params.vLo > params.vHi) [params.vLo, params.vHi] = [params.vHi, params.vLo];
    params.drawN = Math.min(params.drawN, params.popL);
    if (patch.estimator === 'T' || patch.estimator === 'V') params.estimator = patch.estimator;
    if (patch.mode === 'indep' || patch.mode === 'batch') params.mode = patch.mode;
    if ([2, 3, '2', '3'].includes(patch.dim)) params.dim = Number(patch.dim);
    if (patch.lang === 'zh' || patch.lang === 'en') this.lang = patch.lang;
    this.stepCursor = boundedParam(patch.stepCursor, 0, Number.MAX_SAFE_INTEGER, true) ?? this.stepCursor;
    if (patch.highlight === null || typeof patch.highlight === 'string') this.highlight = patch.highlight;
    if (patch.cutPoints === null || (Array.isArray(patch.cutPoints) && patch.cutPoints.every(Number.isFinite))) {
      this.cutPoints = patch.cutPoints?.slice() ?? null;
    }
    this.params = params;
    return this.solve();
  }

  solve() {
    const { id, num, topicKey } = this.act;
    const { lang, stepCursor } = this;
    const aliases = Object.fromEntries(Object.entries(PARAM_ALIASES).map(([alias, [key]]) => [alias, this.params[key]]));
    const params = { ...this.params, ...aliases, lang, stepCursor, highlight: this.highlight, cutPoints: this.cutPoints?.slice() ?? null };
    const result = SOLVERS[this.actIndex](params, (zh, en) => lang === 'en' ? en : zh);
    if (this.highlight !== null) result.stageData.highlights = [this.highlight];
    if (this.cutPoints !== null) {
      result.stageData.callouts.forEach((callout, index) => {
        callout.afterStep = this.cutPoints[index] ?? callout.afterStep;
      });
    }
    return { actId: id, actNum: num, lang, topicKey, params, ...result };
  }

  runFalsificationSuite() {
    return falsificationSuite(this);
  }
}

function falsificationSuite(engine, overrides = {}) {
  const close = (actual, expected, tolerance = 1e-12) => Math.abs(actual - expected) < tolerance;
  const numeric = (actual, expected) => close(actual, expected, 1e-8);
  const probe = (numbers) => Object.fromEntries(Object.entries(numbers).map(([key, value]) => [
    key, Object.hasOwn(overrides, key) ? overrides[key] : value,
  ]));
  const saved = {
    actIndex: engine.actIndex, lang: engine.lang, params: engine.params,
    stepCursor: engine.stepCursor, highlight: engine.highlight, cutPoints: engine.cutPoints,
  };
  try {
    engine.params = { ...DEFAULT_PARAMS };
    engine.resetPlaybackOverrides();
    const projection = probe(engine.setAct('act-1').numbers);
    engine.setAct('act-2');
    const { delta: rawDelta25 } = engine.setParams({ pReliab: 0.25 }).numbers;
    const { delta: rawDelta50 } = engine.setParams({ pReliab: 0.5 }).numbers;
    const { delta25, delta50 } = probe({ delta25: rawDelta25, delta50: rawDelta50 });
    const discrete = probe(engine.setParams({ pReliab: 0.75 }).numbers);
    const continuous = probe(engine.setAct('act-3').numbers);
    const waiting = probe(engine.setAct('act-4').numbers);
    const boundary = engine.setParams({ paretoLam: 1 }).numbers;
    const eYAtOne = Object.hasOwn(overrides, 'eYAtOne') ? overrides.eYAtOne : boundary.eY;
    const sampling = probe(engine.setAct('act-5').numbers);
    const assertions = [
      {
        id: 'act1-mse-bias-split',
        passed: close(projection.expectedConditionalVariance + projection.varianceOfConditionalMean, 4)
          && close(projection.varianceX, 4) && close(projection.cosTheta, Math.sqrt(3) / 4)
          && close(projection.mseV, 1 / 32) && close(projection.mseT, 1 / 16) && projection.mseT > projection.mseV
          && projection.dofOneFit === 8 - 1 && projection.dofTwoFits === 8 - 2,
        ...projection,
      },
      {
        id: 'act2-majority-flip',
        passed: close(delta25, -27 / 512) && close(delta50, 0) && close(discrete.delta, 27 / 512)
          && discrete.rossVariance === 900 && discrete.comparisonVariance === 9 && discrete.unconditionalCov === 0
          && close(discrete.conditionalCov, -10 * 0.3 * 0.7) && close(discrete.fpc, (20 - 6) / (20 - 1)),
        ...discrete, delta25, delta50,
      },
      {
        id: 'act3-4-jensen-pareto-duality',
        passed: continuous.meanI > continuous.gMeanV && close(continuous.meanI, 0.326886, 5e-7)
          && close(continuous.towerResult, 7 / 12)
          && numeric(continuous.twoTail, continuous.lowerTailRef + continuous.upperTailRef)
          && continuous.twoTail > continuous.oneTail && close(continuous.twoTail, 0.372759, 5e-7)
          && numeric(waiting.gammaSF8, waiting.poissonCDF2) && numeric(waiting.gammaSF8, 13 * Math.exp(-4))
          && close(waiting.paretoLam, PARETO_80_20) && waiting.y80OverAlpha === 4 && close(waiting.top20Share, 0.8)
          && eYAtOne === null && boundary.meanFinite === false,
        ...continuous, ...waiting, eYAtOne,
      },
      {
        id: 'act5-sampling-limits',
        passed: numeric(sampling.chi3SF, 0.5221671895353914) && numeric(sampling.chi2SF, Math.exp(-9 / 8))
          && sampling.chi3SF > sampling.chi2SF && numeric(sampling.tCdf14, 0.9065834967)
          && numeric(sampling.fCdfT2, 2 * sampling.tCdf14 - 1)
          && numeric(sampling.f6_14, 1 - 4246 * 14 ** 7 / 23 ** 9)
          && numeric(sampling.f6_14 + sampling.fReciprocal, 1)
          && Math.abs(sampling.f6_14 - sampling.f14_6) > 1e-8
          && numeric(sampling.logisticRoundTrip, 0.75) && numeric(sampling.logisticQ75, Math.log(3)),
        ...sampling,
      },
    ];
    return { passed: assertions.every(({ passed }) => passed), assertions };
  } finally {
    Object.assign(engine, saved);
  }
}

export function __falsifyProbe(overrides) {
  return falsificationSuite(new ProbBenchEngine(), overrides);
}
