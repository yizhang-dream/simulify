import { ChartCard } from 'simulify/chart-card.js';
import { mountViewCube, setShellPresentation, THEME_PRESETS } from 'simulify/layout-shell.js';
import { LiveMathsPanel } from 'simulify/live-maths.js';
import { SimulationTape, SpacetimeClock } from 'simulify/spacetime.js';
import { exposeTestHooks, mountTimelineBar, parseUrlState, TimelineDirector } from 'simulify/timeline-director.js';
import { clamp } from 'simulify/model-core.js';
import { BEATS, createModel, DEFAULTS, DURATION, START_BOUNDS, STEPS } from './model.js';
import { mountValley } from './scene.js';

const byId = (id) => document.getElementById(id);
const clock = new SpacetimeClock({ duration: DURATION, beats: BEATS });
const director = new TimelineDirector({
  stages: BEATS.map((beat) => ({ ...beat, steps: [{ ...beat, duration: beat.end - beat.start }] })),
});
const model = createModel(clock);
const coordinates = [['startX', START_BOUNDS.x], ['startY', START_BOUNDS.y]];
const { stage, choreographer, update } = await mountValley(byId('stage-canvas'),
  ({ startX, startY }) => model.setParams({
    startX: Number(startX.toFixed(2)), startY: Number(startY.toFixed(2)),
  }));
const shell = document.querySelector('.artboard-shell');
mountViewCube(byId('views'), stage, { showAngles: false, zenShell: shell });
mountTimelineBar(byId('transport'), clock, { lang: 'zh', showStages: false, speeds: [0.5, 1, 2], showBeatMarkers: false });

const maths = new LiveMathsPanel(byId('maths'), { title: '当前损失与稳定上限' });
const chart = new ChartCard(byId('chart'), { title: '对数损失', mode: 'xy' });
const tape = new SimulationTape();
const fields = ['kappa', 'lr', 'beta'];
const buttons = [...document.querySelectorAll('[data-preset]')];
const presets = { valley: DEFAULTS, sgd: { ...DEFAULTS, beta: 0 }, unstable: { ...DEFAULTS, lr: 0.18 } };

const logPoints = (path) => path.map(({ loss }, x) => ({ x, y: Math.log10(Math.max(1e-12, loss)) }));
const numericTex = (value) => {
  if (value === 0 || Math.abs(value) >= 0.001 && Math.abs(value) < 100) return value.toFixed(3);
  const [coefficient, exponent] = value.toExponential(2).split('e');
  return `${coefficient}\\times10^{${Number(exponent)}}`;
};

let previousParams;
let previousGhost;
let previousStep;
let previousEquations = '';
function render(s, params, t) {
  const ghost = tape.getGhost();
  const momentumClamped = update(s, params, t, ghost);
  const step = Math.floor(s.step);
  const active = params.beta > 0 ? s.momentum : s.sgd;
  const equation = String.raw`f(x,y)=\tfrac12(x^2+${params.kappa}y^2)`;
  const numeric = momentumClamped
    ? String.raw`f(x_t,y_t)=${numericTex(active.loss)}`
    : String.raw`f\!\left(${numericTex(active.x)},\, ${numericTex(active.y)}\right)=${numericTex(active.loss)}`;
  const threshold = String.raw`\eta_{\max}=2/\kappa=\tfrac{2}{${params.kappa}}\approx${s.etaMax.toFixed(3)}`;
  const equations = [equation, numeric, threshold];
  if (previousEquations !== equations.join('/')) {
    maths.update({ equations: equations.map((tex) => ({ tex })) });
    previousEquations = equations.join('/');
  }
  if (previousParams !== params) {
    for (const [key] of coordinates) {
      const input = byId(key);
      if (input.valueAsNumber !== params[key]) input.value = params[key];
    }
    for (const key of fields) {
      byId(key).value = params[key];
      document.querySelector(`output[for="${key}"]`).value = params[key].toFixed(key === 'kappa' ? 0 : 2);
    }
    for (const button of buttons) {
      const { kappa, lr, beta } = presets[button.dataset.preset];
      button.setAttribute('aria-pressed', String(kappa === params.kappa && lr === params.lr && beta === params.beta));
    }
  }
  const status = byId('stability');
  const summary = params.beta > 0 && s.momentumDiverging ? 'Heavy-Ball 与 SGD 均发散'
    : s.diverging ? 'SGD 发散，曲线继续计步'
    : params.lr === s.etaMax && params.startY !== 0 ? 'SGD 在临界步长等幅振荡'
    : params.beta === 0 ? 'β = 0，两条轨迹重合' : '实线与虚线共用学习率';
  const message = momentumClamped ? `${summary}。橙色标记限于曲面边界，公式与曲线保留实际损失。` : summary;
  if (status.textContent !== message) status.textContent = message;
  status.dataset.unstable = String(s.diverging || momentumClamped);
  if (previousParams !== params || previousGhost !== ghost || previousStep !== step) {
    const series = [
      ...(params.beta > 0 ? [{ name: 'Heavy-Ball', tone: 'cat2', points: logPoints(s.momentumPath) }] : []),
      { name: '纯 SGD', tone: 'cat1', points: logPoints(s.sgdPath) },
    ];
    const ghosts = ghost ? [{ name: '基准对照', tone: 'cat4', points: logPoints(ghost.frames.map(({ state }) => state)) }] : [];
    const allY = [...series, ...ghosts].flatMap(({ points }) => points.map(({ y }) => y));
    const yMin = Math.min(-4, Math.floor(Math.min(...allY)));
    const yMax = Math.max(2, Math.ceil(Math.max(...allY)));
    chart.updateXY({
      badge: `${step} / ${STEPS} 步`,
      xMax: STEPS, yMin, yMax, xLabel: '迭代步', yLabel: 'log10 f',
      series, ghosts, marks: [{ axis: 'x', value: step, tone: 'navy' }],
      ariaLabel: '动量与纯梯度下降在 36 步中的对数损失',
    });
  }
  previousParams = params;
  previousGhost = ghost;
  previousStep = step;
}

model.subscribe(render);
for (const key of fields) {
  const input = byId(key);
  input.addEventListener('input', () => model.setParams({ [key]: input.valueAsNumber }));
}
for (const [key, [min, max]] of coordinates) {
  const input = byId(key);
  input.min = min;
  input.max = max;
  input.addEventListener('change', () => {
    if (Number.isFinite(input.valueAsNumber)) {
      model.setParams({ [key]: clamp(Number(input.valueAsNumber.toFixed(2)), min, max) });
    }
    input.value = model.getParams()[key];
  });
}
for (const button of buttons) {
  button.addEventListener('click', () => {
    model.setParams(presets[button.dataset.preset]);
    clock.seek(0);
    clock.play();
  });
}
byId('ghost').addEventListener('click', (event) => {
  const button = event.currentTarget;
  if (tape.getGhost()) {
    tape.clearGhost();
  } else {
    const { momentumPath } = model.getSnapshot();
    for (const [step, state] of momentumPath.entries()) tape.record(step * DURATION / STEPS, state);
    tape.captureGhost('基准对照');
    tape.clear();
  }
  const active = Boolean(tape.getGhost());
  button.setAttribute('aria-pressed', String(active));
  button.textContent = active ? '清除基准' : '保存基准对照';
  render(model.getSnapshot(), model.getParams(), clock.t);
});

clock.subscribe(({ t }) => director.seekGlobal(t));
const hooks = exposeTestHooks({ version: 3, profile: 'field-math', clock, director, stage, choreographer, model });
const url = parseUrlState(location.search);
const requestedSkin = url.skin || new URLSearchParams(location.search).get('skin');
if (requestedSkin && THEME_PRESETS.includes(requestedSkin)) {
  setShellPresentation(shell, { theme: requestedSkin, stage });
}
if (url.thumb) document.documentElement.dataset.thumb = '1';
if (url.exportMode) document.documentElement.dataset.export = url.exportMode;
const beat = BEATS.find(({ id }) => id === url.stage);
if (url.t !== null || url.end || beat) await hooks.seek(url.t ?? (url.end ? DURATION : beat.start));
