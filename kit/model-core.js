// Model inputs and outputs are plain data so freezing also protects nested state.
function freezeData(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('Model state must contain only plain objects, arrays and scalar values');
  }
  if (!seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freezeData(child, seen);
    Object.freeze(value);
  }
  return value;
}

function sameData(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== b.length)) return false;
  if (seen.get(a)?.has(b)) return true;
  if (!seen.has(a)) seen.set(a, new WeakSet());
  seen.get(a).add(b);
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key], seen));
}

function finiteTime(t) {
  if (!Number.isFinite(t)) throw new TypeError('Model time must be finite');
  return t;
}

/**
 * A single clock and snapshot shared by all views. Parameters are shallow-patched.
 * solve must be deterministic and return plain data. Subscribers receive the
 * current snapshot immediately and share the same reference on every update.
 */
export function createSimModel({ params, solve, falsifyCases = [], clock = null }) {
  const initial = freezeData(structuredClone(params));
  let current = initial;
  let time = finiteTime(clock?.t ?? 0);
  const subscribers = new Set();
  let pending = [];
  let broadcasting = false;

  const mergeParams = (base, patch) => patch === undefined
    ? base : freezeData({ ...base, ...structuredClone(patch) });
  const evaluateWith = (t, p) => freezeData(structuredClone(solve(p, finiteTime(t))));
  let snapshot = evaluateWith(time, current);

  function notify(fn, ...frame) {
    try {
      fn(...frame);
    } catch (error) {
      console.error('Simulify model subscriber failed', error);
    }
  }

  function update(nextTime, nextParams) {
    if (nextTime === time && sameData(nextParams, current)) return snapshot;
    const nextSnapshot = evaluateWith(nextTime, nextParams);
    current = nextParams;
    time = nextTime;
    snapshot = nextSnapshot;
    pending.push([nextSnapshot, nextParams, nextTime]);
    if (!broadcasting) {
      broadcasting = true;
      try {
        for (const frame of pending) {
          for (const fn of [...subscribers]) if (subscribers.has(fn)) notify(fn, ...frame);
        }
      } finally {
        pending = [];
        broadcasting = false;
      }
    }
    return nextSnapshot;
  }

  const setTime = (t) => update(finiteTime(t), current);
  const unsubscribeClock = clock?.subscribe(({ t }) => setTime(t));

  function resolveCaseParams(test, baseParams) {
    if (test?.params && typeof test.params === 'object') {
      return mergeParams(baseParams, test.params);
    }
    if (typeof test?.mutateParams === 'function') {
      const draft = structuredClone(baseParams);
      return mergeParams(baseParams, test.mutateParams(draft) ?? draft);
    }
    throw new Error('Failure case must declare params or mutateParams');
  }

  function caseNameAt(test, index) {
    return typeof test?.name === 'string' && test.name.trim() ? test.name : `Case ${index + 1}`;
  }

  const caseManifest = freezeData(
    falsifyCases.map((test, index) => {
      const name = caseNameAt(test, index);
      const label = typeof test?.label === 'string' && test.label.trim() ? test.label.trim() : name;
      const description = typeof test?.description === 'string' ? test.description.trim() : '';
      const hasParams = Boolean(
        (test?.params && typeof test.params === 'object') || typeof test?.mutateParams === 'function'
      );
      return { name, label, description, hasParams };
    })
  );

  function getFalsifyCases() {
    return caseManifest;
  }

  function applyFalsifyCase(nameOrIndex) {
    const idx =
      typeof nameOrIndex === 'number'
        ? nameOrIndex
        : caseManifest.findIndex((item) => item.name === String(nameOrIndex));
    const test = falsifyCases[idx];
    if (!test) {
      throw new RangeError(`Unknown failure case "${nameOrIndex}"`);
    }
    const nextParams = resolveCaseParams(test, initial);
    return update(time, nextParams);
  }

  function falsify() {
    const baseParams = current;
    const assertions = falsifyCases.map((test, index) => {
      const name = caseNameAt(test, index);
      const assertion = { name, passed: false, detail: '', baseMetric: null, mutantMetric: null, comparisons: 0 };
      const failures = [];
      const checkResult = (result) => {
        if (result !== true && result?.passed !== true) failures.push(result?.detail || 'Check failed');
        if (result?.detail) assertion.detail = String(result.detail);
        const delta = result?.metricDelta;
        if (typeof delta === 'number' && (!Number.isFinite(delta) || delta === 0)) {
          failures.push('Reported metric delta must be finite and nonzero');
        }
        const baseMetric = delta?.baseMetric ?? result?.baseMetric;
        const mutantMetric = delta?.mutantMetric ?? result?.mutantMetric;
        if (baseMetric !== undefined || mutantMetric !== undefined) {
          if (!Number.isFinite(baseMetric) || !Number.isFinite(mutantMetric) || baseMetric === mutantMetric) {
            failures.push('Reported baseline and mutant metrics must be finite and distinct');
          } else {
            Object.assign(assertion, { baseMetric, mutantMetric });
          }
        }
      };
      const compare = (baseSnap, mutantSnap) => {
        if (!sameData(baseSnap, mutantSnap)) assertion.comparisons += 1;
      };

      try {
        const run = typeof test === 'function' ? test : test.run;
        if (typeof run === 'function') {
          const samples = new Map();
          checkResult(run((t, overrideParams) => {
            const p = mergeParams(baseParams, overrideParams);
            const snap = evaluateWith(t, p);
            const isBase = sameData(baseParams, p);
            const prior = samples.get(t) ?? [];
            for (const sample of prior) {
              if (sample.isBase !== isBase) compare(sample.snap, snap);
            }
            prior.push({ isBase, snap });
            samples.set(t, prior);
            return snap;
          }));
        } else {
          const mutantParams = resolveCaseParams(test, baseParams);
          if (sameData(baseParams, mutantParams)) throw new Error('Mutation did not change any parameters');
          const times = Array.isArray(test.t) ? test.t : [test.t ?? 0];
          for (const t of times) {
            const baseSnap = evaluateWith(t, baseParams);
            const mutantSnap = evaluateWith(t, mutantParams);
            compare(baseSnap, mutantSnap);
            checkResult(test.check(baseSnap, mutantSnap, { baseParams, mutantParams }));
          }
        }
        if (assertion.comparisons === 0) failures.push('No same-time baseline and mutant produced distinct snapshots');
      } catch (error) {
        failures.push(String(error?.message ?? error));
      }
      assertion.passed = failures.length === 0;
      if (!assertion.passed) assertion.detail = failures.join(' | ');
      return assertion;
    });
    const total = assertions.length;
    const passedCount = assertions.filter(({ passed }) => passed).length;
    return { passed: total > 0 && total === passedCount, version: 3, total, passedCount, assertions };
  }

  return {
    clock,
    get t() { return time; },
    getParams: () => current,
    getSnapshot: () => snapshot,
    setTime,
    setParams: (patch) => update(time, mergeParams(current, patch)),
    resetParams: () => update(time, initial),
    evaluate: (t, overrideParams) => evaluateWith(t, mergeParams(current, overrideParams)),
    subscribe(fn) {
      notify(fn, snapshot, current, time);
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    getFalsifyCases,
    applyFalsifyCase,
    falsify,
    dispose() {
      unsubscribeClock?.();
      subscribers.clear();
    },
  };
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const lerp = (a, b, u) => a + (b - a) * u;

/** One RK4 step for a scalar or vector of numbers. derivFn receives (state, t). */
export function rk4Step(state, t, dt, derivFn) {
  const scalar = typeof state === 'number';
  const y = scalar ? [state] : state;
  const slope = (v, at) => {
    const k = derivFn(scalar ? v[0] : v, at);
    return scalar ? [k] : k;
  };
  const shifted = (k, h) => y.map((x, i) => x + h * k[i]);
  const half = dt / 2;
  const k1 = slope(y, t);
  const k2 = slope(shifted(k1, half), t + half);
  const k3 = slope(shifted(k2, half), t + half);
  const k4 = slope(shifted(k3, dt), t + dt);
  const next = y.map((x, i) => x + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  return scalar ? next[0] : next;
}

export function integrateRK4(y0, t0, t1, steps, derivFn) {
  if (!Number.isSafeInteger(steps) || steps < 1) throw new RangeError('steps must be a positive integer');
  const dt = (t1 - t0) / steps;
  let state = y0;
  for (let i = 0; i < steps; i += 1) state = rk4Step(state, t0 + i * dt, dt, derivFn);
  return state;
}

export function bisectRoot(fn, a, b, tol = 1e-8, maxIter = 100) {
  if (!(Number.isFinite(tol) && tol > 0) || !Number.isSafeInteger(maxIter) || maxIter < 1) {
    throw new RangeError('Bisection needs a positive tolerance and iteration limit');
  }
  const evaluate = (x) => {
    const value = fn(x);
    if (!Number.isFinite(value)) throw new RangeError('Bisection function must return a finite number');
    return value;
  };
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) throw new RangeError('Invalid root bracket');
  let fa = evaluate(a);
  const fb = evaluate(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (Math.sign(fa) === Math.sign(fb)) throw new RangeError('Root must be bracketed');
  for (let i = 0; i < maxIter; i += 1) {
    const mid = a / 2 + b / 2;
    const fm = evaluate(mid);
    if (fm === 0 || b / 2 - a / 2 <= tol || mid === a || mid === b) return mid;
    if (Math.sign(fa) === Math.sign(fm)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }
  return a / 2 + b / 2;
}

export function formatUnit(value, unit = '', digits = 2) {
  return unit ? `${value.toFixed(digits)} ${unit}` : value.toFixed(digits);
}
