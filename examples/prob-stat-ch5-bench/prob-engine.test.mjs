import { strict as assert } from 'node:assert';
import {
  PROB_ACTS, ProbBenchEngine, __falsifyProbe,
  normalPdf, normalCdf, normalQuantile, logGamma, gammaRegP, gammaRegQ,
  chi2Pdf, chi2Cdf, chi2Sf, chi2Quantile, betaRegI, studentTPdf, studentTCdf,
  studentTQuantile, fPdf, fCdf, fQuantile, logisticPdf, logisticCdf, logisticQuantile, invertCdf,
} from './prob-engine.js';

let passed = 0;
let failed = 0;

function test(name, run) {
  try {
    run();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

function relative(actual, expected, tolerance) {
  near(actual / expected, 1, tolerance);
}

const checkpoints = [
  ['normalPdf(0)', () => normalPdf(0), 0.3989422804014327],
  ['normalCdf(-8)', () => normalCdf(-8), 6.220960574271784e-16, 1e-7],
  ['normalQuantile(0.975)', () => normalQuantile(0.975), 1.959963984540054, 1e-9],
  ['normalQuantile(1e-15)', () => normalQuantile(1e-15), -7.941345326170997, 1e-9],
  ['logGamma(0.5)', () => logGamma(0.5), 0.5723649429247001],
  ['gammaRegP(2, 1)', () => gammaRegP(2, 1), 0.2642411176571153],
  ['gammaRegQ(2, 3)', () => gammaRegQ(2, 3), 0.1991482734714558],
  ['chi2Pdf(2, 2)', () => chi2Pdf(2, 2), 0.1839397205857212],
  ['chi2Cdf(2, 2)', () => chi2Cdf(2, 2), 0.6321205588285577],
  ['chi2Quantile(0.95, 2)', () => chi2Quantile(0.95, 2), 5.991464547107982],
  ['betaRegI(0.75, 2, 3)', () => betaRegI(0.75, 2, 3), 0.94921875],
  ['studentTPdf(1, 1)', () => studentTPdf(1, 1), 0.1591549430918953],
  ['studentTCdf(-1, 1)', () => studentTCdf(-1, 1), 0.25],
  ['studentTQuantile(0.875, 1)', () => studentTQuantile(0.875, 1), 2.414213562373095],
  ['fPdf(3, 2, 2)', () => fPdf(3, 2, 2), 0.0625],
  ['fCdf(3, 2, 2)', () => fCdf(3, 2, 2), 0.75],
  ['fQuantile(0.9, 2, 2)', () => fQuantile(0.9, 2, 2), 9],
  ['logisticPdf(log(3), 0, 1)', () => logisticPdf(Math.log(3), 0, 1), 0.1875],
  ['logisticCdf(log(3), 0, 1)', () => logisticCdf(Math.log(3), 0, 1), 0.75],
  ['logisticQuantile(0.75, 0, 1)', () => logisticQuantile(0.75, 0, 1), 1.0986122886681098],
];

for (const [name, evaluate, expected, tolerance] of checkpoints) {
  test(name, () => near(evaluate(), expected, tolerance));
}

test('independent sampling-law and normal critical-value references', () => {
  near(chi2Cdf(30, 26), 0.732389);
  near(chi2Quantile(0.95, 15), 24.995790);
  near(studentTQuantile(0.975, 9), 2.262157);
  near(fQuantile(0.99, 6, 14), 4.455820);
  near(fCdf(1.5, 6, 14), 1 - 4246 * 14 ** 7 / 23 ** 9, 1e-12);
  relative(normalCdf(-8), 6.220960574271784e-16, 1e-7);
  for (const [alpha, z] of [[0.05, 1.6448536269514722], [0.025, 1.959963984540054], [0.01, 2.3263478740408408]]) {
    near(normalQuantile(1 - alpha), z, 1e-9);
  }
});

test('gamma and beta closed forms across both algorithm branches', () => {
  let prevGamma = 0;
  let prevBeta = 0;
  for (let index = 0; index <= 100; index++) {
    const xGamma = 6 * index / 100;
    const xBeta = index / 100;
    const lower = gammaRegP(2, xGamma);
    const upper = gammaRegQ(2, xGamma);
    const beta = betaRegI(xBeta, 2, 3);
    near(lower, 1 - (1 + xGamma) * Math.exp(-xGamma), 1e-12);
    near(upper, (1 + xGamma) * Math.exp(-xGamma), 1e-12);
    near(beta, 6 * xBeta ** 2 - 8 * xBeta ** 3 + 3 * xBeta ** 4, 1e-12);
    assert.ok(lower >= prevGamma && beta >= prevBeta);
    prevGamma = lower;
    prevBeta = beta;
  }
  relative(gammaRegQ(1e-20, 0.5), 5.597735947761608e-21, 1e-12);
  relative(chi2Cdf(Number.MIN_VALUE, 1), Math.sqrt(Number.MIN_VALUE) * Math.sqrt(2 / Math.PI), 1e-12);
});

test('CDF monotonicity and quantile round trips on chi-square, t and F grids', () => {
  const families = [
    [chi2Cdf, chi2Quantile, [[1], [2], [15], [26], [40]], [0.005, 0.1, 0.5, 1, 5, 12, 20, 30]],
    [studentTCdf, studentTQuantile, [[1], [2], [9], [12], [40]], [-8, -3, -1, -0.1, 0, 0.1, 1, 3, 8]],
    [fCdf, fQuantile, [[1, 1], [1, 12], [2, 2], [6, 14], [14, 6]], [0.005, 0.05, 0.2, 0.5, 1, 1.5, 3, 6]],
  ];
  for (const [cdf, quantile, parameterGrid, sample] of families) {
    for (const params of parameterGrid) {
      let previous = 0;
      for (const x of sample) {
        const q = cdf(x, ...params);
        assert.ok(previous <= q && q <= 1);
        if (q > 0 && q < 1) near(quantile(q, ...params), x, 1e-6);
        previous = q;
      }
    }
  }
  for (const q of [0.01, 0.1, 0.25, 0.5, 0.9, 0.975, 0.99]) {
    near(chi2Quantile(q, 2), -2 * Math.log1p(-q));
    near(studentTQuantile(q, 1), Math.tan(Math.PI * (q - 0.5)));
    near(fQuantile(q, 2, 2), q / (1 - q));
  }
  relative(fQuantile(1 - 2 ** -30, 2, 1), 2 ** 59, 1e-12);
  relative(chi2Sf(80, 2), Math.exp(-40), 1e-12);
  near(invertCdf(logisticCdf, 0.75, -4, -3), Math.log(3), 1e-9);
  near(invertCdf(logisticCdf, 0.25, 3, 4), -Math.log(3), 1e-9);
});

test('distribution endpoints, input validation and overflow-safe location and scale', () => {
  for (const cdf of [normalCdf, logisticCdf, (x) => chi2Cdf(x, 2), (x) => studentTCdf(x, 3), (x) => fCdf(x, 2, 3)]) {
    assert.equal(cdf(-Infinity), 0);
    assert.equal(cdf(Infinity), 1);
    assert.throws(() => cdf(NaN), RangeError);
  }
  assert.equal(normalQuantile(0), normalQuantile(1e-15));
  assert.equal(normalQuantile(1), normalQuantile(1 - 1e-15));
  assert.equal(logGamma(0), Infinity);
  assert.equal(gammaRegP(2, 0), 0);
  assert.equal(gammaRegQ(2, 0), 1);
  assert.equal(gammaRegP(2, Infinity), 1);
  assert.equal(gammaRegQ(2, Infinity), 0);
  assert.equal(betaRegI(0, 2, 3), 0);
  assert.equal(betaRegI(1, 2, 3), 1);
  assert.deepEqual([1, 2, 3].map((nu) => chi2Pdf(0, nu)), [Infinity, 0.5, 0]);
  assert.deepEqual([1, 2, 3].map((nu) => fPdf(0, nu, 4)), [Infinity, 1, 0]);
  for (const quantile of [(q) => chi2Quantile(q, 2), (q) => fQuantile(q, 2, 3)]) {
    assert.equal(quantile(0), 0);
    assert.equal(quantile(1), Infinity);
  }
  for (const quantile of [logisticQuantile, (q) => studentTQuantile(q, 3)]) {
    assert.equal(quantile(0), -Infinity);
    assert.equal(quantile(0.5), 0);
    assert.equal(quantile(1), Infinity);
  }
  for (const invalid of [
    () => normalPdf(0, 0, 0), () => normalQuantile(1.1), () => logGamma(-1),
    () => gammaRegQ(2, -1), () => gammaRegP(Infinity, 1), () => chi2Cdf(1, Number.MIN_VALUE),
    () => chi2Quantile(-0.1, 2), () => betaRegI(1.1, 2, 3), () => betaRegI(0, -1, 2),
    () => studentTCdf(0, 0), () => studentTPdf(0, Infinity), () => fPdf(0, '2', 2),
    () => fQuantile(NaN, 1, 2), () => logisticQuantile(0.5, Infinity, 1),
    () => logisticCdf(0, 0, Infinity), () => invertCdf(normalCdf, 0.5, 2, 1),
  ]) assert.throws(invalid, RangeError);
  assert.throws(() => invertCdf(() => 0.5, 0.75, 0, 1), /bracket/);
  const max = Number.MAX_VALUE;
  relative(normalPdf(max, -max, max), normalPdf(2) / max, 1e-12);
  near(logisticCdf(max, -max, max), logisticCdf(2), 1e-14);
  near(logisticQuantile(0.75, 2, 3), 2 + 3 * Math.log(3), 1e-14);
});

const tones = new Set(['teal', 'amber', 'danger', 'navy', 'muted']);

function nonempty(value) {
  assert.ok(typeof value === 'string' && value.trim().length > 0, `Expected nonempty text, got ${value}`);
}

function finiteNumbers(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Expected finite number, got ${value}`);
  if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
}

function verifySolution(solution, act, lang) {
  const { actId, actNum, topicKey, stageData, chart, maths, hud, params, numbers } = solution;
  assert.deepEqual([actId, actNum, topicKey, solution.lang], [act.id, act.num, act.topicKey, lang]);
  assert.equal(params.lang, lang);
  assert.ok(Object.keys(numbers).length > 0);
  assert.ok(Object.keys(stageData.metrics).length > 0);
  Object.values(stageData.metrics).forEach((value) => assert.ok(Number.isFinite(value)));
  nonempty(stageData.kind);
  assert.deepEqual(Object.keys(stageData.entities).sort(), [
    ['bars', 'projection'], ['bars', 'rail'], ['bars', 'threshold'], ['bars', 'rail'], ['bars', 'dome'],
  ][actNum - 1]);
  assert.ok(stageData.entities.bars.length <= (actNum === 2 ? 21 : 16));
  if (actNum === 1) assert.equal(stageData.entities.bars.length, 2);
  if (actNum === 2) assert.equal(stageData.entities.rail, null);
  for (const { label, value, ghost } of stageData.entities.bars) {
    nonempty(label);
    assert.ok(Number.isFinite(value) && Number.isFinite(ghost));
  }
  assert.ok(stageData.callouts.length > 0 && stageData.highlights.every((id) => typeof id === 'string'));
  for (const { id, label, sublabel, tone, anchor, dx, dy, afterStep } of stageData.callouts) {
    [id, label, sublabel].forEach(nonempty);
    assert.ok(tones.has(tone) && anchor.length === 3 && anchor.every(Number.isFinite));
    assert.ok([dx, dy, afterStep].every(Number.isFinite));
  }
  [chart.title, chart.badge, chart.xLabel, chart.yLabel, chart.ariaLabel].forEach(nonempty);
  assert.ok(chart.xMin < chart.xMax && chart.yMin < chart.yMax);
  assert.ok(Array.isArray(chart.marks) && Object.hasOwn(chart, 'ghost') && Object.hasOwn(chart, 'dot'));
  const lines = chart.ghost ? [...chart.series, chart.ghost] : chart.series;
  assert.ok(chart.series.length > 0 && chart.series.every(({ tone }) => tones.has(tone)));
  for (const { points } of lines) {
    assert.ok(points.length >= 40 && points.length <= 60);
    assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  }
  [maths.subtitle, maths.badge, hud.pillLabel, hud.pillValue, hud.readoutLeft, hud.readoutRight].forEach(nonempty);
  assert.ok(tones.has(hud.pillTone));
  assert.ok(maths.equations.length > 0 && maths.breakdown.length > 0 && hud.inspectorItems.length > 0);
  for (const { label, tokens } of maths.equations) {
    nonempty(label);
    assert.ok(tokens.length > 0);
    tokens.forEach(({ text }) => nonempty(text));
  }
  for (const { tag, text, tone } of maths.breakdown) {
    [tag, text].forEach(nonempty);
    assert.ok(tones.has(tone));
  }
  for (const { k, v } of hud.inspectorItems) [k, v].forEach(nonempty);
  if (maths.table !== null) {
    const { caption, headers, rows, activeRow, note } = maths.table;
    [caption, note, ...headers].forEach(nonempty);
    assert.ok(rows.every((row) => row.length === headers.length) && activeRow >= 0 && activeRow < rows.length);
  }
  finiteNumbers(solution);
}

const endpoints = [
  [['pBern', 0.02, 0.98], ['nSample', 3, 30], ['xFocus', -4, 4]],
  [['pReliab', 0, 1], ['lamPois', 1, 30], ['pThin', 0, 1], ['popL', 4, 60], ['drawN', 1, 60]],
  [['vLo', 0, 5], ['vHi', 0, 5], ['kV', 0.1, 10], ['muX', -12, 12], ['sigX', 0.1, 10], ['cutoff', 0, 1000], ['alpha', 0.01, 0.10]],
  [['lamExp', 0.05, 2], ['nStage', 1, 20], ['tHorizon', 0, 16], ['paretoLam', 0.5, 3]],
  [['nu', 1, 40], ['nuNum', 1, 40], ['nuDen', 1, 40], ['logisticMu', -12, 12], ['logisticScale', 0.1, 10]],
];

assert.equal(PROB_ACTS.length, 5);

for (const [index, act] of PROB_ACTS.entries()) {
  test(`${act.id} bilingual schema, controls and clamp extremes`, () => {
    const controls = [['p', 'estimator'], ['mode', 'pRel'], ['alpha'], ['lambdaP', 't'], ['nu', 'dim']][index];
    assert.deepEqual(act.controls.map(({ key }) => key), controls);
    assert.equal(act.num, index + 1);
    assert.deepEqual(act.relates.map(({ to, type }) => [to, type]), [[
      `act-${(index + 1) % 5 + 1}`, ['deepens', 'deepens', 'contrast', 'deepens', 'uses'][index],
    ]]);
    assert.ok(act.camera.target.length === 3);
    finiteNumbers(act.camera);
    for (const field of ['shortTitle', 'title', 'cue', 'carries', 'hook']) {
      nonempty(act[field].zh);
      nonempty(act[field].en);
    }
    assert.ok(['cue', 'hook'].every((key) => act[key].zh.length <= 40 && act[key].en.length <= 90));
    const engine = new ProbBenchEngine();
    const zh = engine.setAct(index);
    const en = engine.setParams({ lang: 'en' });
    verifySolution(zh, act, 'zh');
    verifySolution(en, act, 'en');
    assert.notEqual(zh.maths.subtitle, en.maths.subtitle);
    for (const edge of [1, 2]) {
      const patch = Object.fromEntries(endpoints[index].map((entry) => [entry[0], edge === 1 ? -Infinity : Infinity]));
      const solution = engine.setParams(patch);
      verifySolution(solution, act, 'en');
      for (const entry of endpoints[index]) assert.equal(solution.params[entry[0]], entry[edge]);
    }
    for (const control of act.controls) {
      const values = control.kind === 'range' ? [control.min, control.max] : control.options.map(({ value }) => value);
      assert.equal(zh.params[control.key], control.value);
      for (const value of values) {
        const updated = engine.setParams({ [control.key]: value });
        assert.equal(updated.params[control.key], value);
        verifySolution(updated, act, 'en');
      }
    }
  });
}

test('scene data follows the active controls and normalized internal parameters', () => {
  const engine = new ProbBenchEngine();
  const first = engine.setParams({ p: 0.3, estimator: 'V' });
  assert.equal(first.params.pBern, 0.3);
  assert.equal(first.hud.pillLabel, 'MSE(V)');
  near(first.stageData.entities.bars[1].value, 0.3 * 0.7 / 8, 1e-12);
  assert.deepEqual([first.numbers.eA, first.numbers.eA2, first.numbers.mseA, first.numbers.eB,
    first.numbers.eB2, first.numbers.bNotL2], [4 / 3, 2, 2 / 9, 2, null, true]);
  near(first.numbers.thetaDeg, 64.341094);
  const independent = engine.setAct('act-2');
  near(independent.numbers.hw8Q3.binom, 0.633968, 5e-7);
  near(independent.numbers.hw8Q3.poisson, 0.632121, 5e-7);
  const batch = engine.setParams({ mode: 'batch', pRel: 0.25, popL: 4, drawN: 60 });
  assert.equal(batch.params.pReliab, 0.25);
  assert.equal(batch.params.drawN, 4);
  assert.equal(batch.numbers.fpc, 0);
  for (const [index, current] of batch.stageData.entities.bars.entries()) {
    const reference = independent.stageData.entities.bars[index];
    assert.deepEqual([current.value, current.ghost], [reference.ghost, reference.value]);
  }
  near(batch.stageData.entities.bars.reduce((sum, { value }) => sum + value, 0), 1, 1e-12);
  const transform = engine.setAct('act-3');
  near(transform.numbers.gMeanV, 0.022025, 5e-7);
  near(transform.numbers.pSumGt25, 0.424027, 5e-7);
  near(transform.numbers.pDiffGt3, 0.246894, 5e-7);
  assert.ok(transform.numbers.twoTail > transform.numbers.oneTail);
  assert.equal(engine.setParams({ vLo: 2, vHi: 2 }).numbers.jensenGap, 0);
  engine.setAct('act-4');
  const earlier = engine.setParams({ lambdaP: 1, t: 4 });
  const later = engine.setParams({ t: 16 });
  assert.equal(earlier.params.paretoLam, 1);
  assert.equal(earlier.numbers.eY, null);
  assert.equal(later.params.tHorizon, 16);
  const firstRail = earlier.stageData.entities.rail;
  const lastRail = later.stageData.entities.rail;
  assert.deepEqual(firstRail.arrivals, lastRail.arrivals);
  assert.ok(lastRail.arrivals.every((time, index) => time > (lastRail.arrivals[index - 1] ?? 0) && time <= lastRail.tMax));
  assert.equal(firstRail.countLE, firstRail.arrivals.filter((time) => time <= firstRail.t).length);
  assert.equal(lastRail.countLE, lastRail.arrivals.length);
  near(later.numbers.waitingSF, later.numbers.poissonCDF, 1e-12);
  engine.setAct('act-5');
  const dim2 = engine.setParams({ dim: 2, nu: 1 });
  assert.equal(dim2.numbers.meanExists, false);
  assert.equal(dim2.numbers.varFinite, false);
  assert.equal(dim2.stageData.entities.dome.dim, 2);
  assert.equal(engine.setParams({ nu: 2 }).numbers.varFinite, false);
  const dim3 = engine.setParams({ dim: 3, nu: 3 });
  assert.equal(dim3.numbers.meanExists, true);
  assert.equal(dim3.numbers.varFinite, true);
  assert.ok(dim3.stageData.metrics.pExceed > dim2.stageData.metrics.pExceed);
  assert.equal(engine.setParams({ nu: NaN, dim: null }).params.nu, 3);
  engine.setParams({ stepCursor: 3, highlight: 'custom', cutPoints: [2] });
  assert.deepEqual(engine.solve().stageData.highlights, ['custom']);
  assert.equal(engine.solve().stageData.callouts[0].afterStep, 2);
  engine.resetPlaybackOverrides();
  assert.equal(engine.solve().params.stepCursor, 0);
  assert.deepEqual(engine.solve().stageData.highlights, []);
  assert.equal(engine.solve().stageData.callouts[0].afterStep, 0);
  assert.equal(engine.solve().params.nu, 3);
});

const probes = [
  ['act1-mse-bias-split', [{ mseV: 0.5 }, { dofTwoFits: 99 }]],
  ['act2-majority-flip', [{ fpc: 0 }, { delta25: 0 }, { conditionalCov: 0 }]],
  ['act3-4-jensen-pareto-duality', [{ meanI: 0 }, { poissonCDF2: 0 }, { eYAtOne: 42 }]],
  ['act5-sampling-limits', [{ chi3SF: 0 }, { fReciprocal: 0 }, { logisticQ75: 0 }]],
];

test('falsification suite passes and restores all engine state on success and error', () => {
  const engine = new ProbBenchEngine();
  engine.setAct('act-4');
  engine.setParams({ lang: 'en', p: 0.9, nSample: 4, mode: 'batch', t: 7, paretoLam: 0.8,
    nu: 2, stepCursor: 4, highlight: 'probe', cutPoints: [3] });
  const before = structuredClone(engine);
  const beforeResult = engine.solve();
  const suite = engine.runFalsificationSuite();
  assert.equal(suite.passed, true);
  assert.deepEqual(suite.assertions.map(({ id, passed }) => [id, passed]), probes.map(([id]) => [id, true]));
  assert.deepEqual(structuredClone(engine), before);
  assert.deepEqual(engine.solve(), beforeResult);
  class FailingEngine extends ProbBenchEngine {
    solve() {
      if (this.actIndex === 2) throw new Error('falsification interrupted');
      return super.solve();
    }
  }
  const interrupted = new FailingEngine();
  interrupted.setParams({ lang: 'en', p: 0.8, stepCursor: 2, highlight: 'retained' });
  const interruptedBefore = structuredClone(interrupted);
  assert.throws(() => interrupted.runFalsificationSuite(), /falsification interrupted/);
  assert.deepEqual(structuredClone(interrupted), interruptedBefore);
});

for (const [id, overrides] of probes) {
  test(`${id} fails on perturbed numbers`, () => {
    for (const patch of overrides) {
      const suite = __falsifyProbe(patch);
      assert.equal(suite.passed, false);
      assert.deepEqual(suite.assertions.filter(({ passed }) => !passed).map(({ id }) => id), [id]);
      const rejected = suite.assertions.find((assertion) => assertion.id === id);
      for (const [key, value] of Object.entries(patch)) assert.equal(rejected[key], value);
    }
  });
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
