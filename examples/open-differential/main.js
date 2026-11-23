import { ChartCard } from '../../kit/chart-card.js';
import { mountViewCube, setShellPresentation, THEME_PRESETS } from '../../kit/layout-shell.js';
import { LiveMathsPanel } from '../../kit/live-maths.js';
import { SimulationTape, SpacetimeClock } from '../../kit/spacetime.js';
import { exposeTestHooks, mountTimelineBar, parseUrlState, TimelineDirector } from '../../kit/timeline-director.js';
import { BEATS, DURATION, GRIP_TORQUE, REQUESTED_TORQUE, createModel } from './model.js';
import { mountDrivetrain } from './scene.js';

const byId = (id) => document.getElementById(id);
const clock = new SpacetimeClock({ duration: DURATION, beats: BEATS });
const director = new TimelineDirector({
  stages: BEATS.map((beat) => ({
    ...beat, steps: [{ ...beat, duration: beat.end - beat.start }],
  })),
});
const model = createModel(clock);
const dry = model.getSnapshot();
model.setParams({ story: true });

const fields = ['muLeft', 'muRight', 'steeringBias', 'cutaway'];
const inputs = fields.map((key) => ({
  key, input: byId(key), output: document.querySelector(`output[for="${key}"]`),
}));

function setExperiment(patch) {
  const active = model.getSnapshot();
  model.setParams({
    ...Object.fromEntries(fields.map((key) => [key, active[key]])),
    ...patch, story: false,
  });
}

const { stage, choreographer, update } = await mountDrivetrain(byId('stage-canvas'), (cutaway) => {
  setExperiment({ cutaway });
});
mountViewCube(byId('views'), stage, { showAngles: false });
mountTimelineBar(byId('transport'), clock, {
  lang: 'zh', showStages: false, showBeatMarkers: true, speeds: [0.5, 1, 2],
});
const maths = new LiveMathsPanel(byId('maths'), { title: '转速与扭矩' });
const chart = new ChartCard(byId('chart'), { title: '右轮摩擦扫描', mode: 'xy' });
const tape = new SimulationTape();

const curves = [
  { key: 'omegaL', name: '左轮', tone: 'cat1', scale: 2 * dry.omegaC },
  { key: 'omegaR', name: '右轮', tone: 'cat2', scale: 2 * dry.omegaC },
  { key: 'driveForce', name: '推进力', tone: 'cat3', scale: dry.driveForce },
];
const samples = Array.from({ length: 46 }, (_, i) => (5 + i * 2) / 100);
const presets = {
  straight: { time: 6, bias: 0, right: 0.85 },
  corner: { time: 10, bias: 0.55, right: 0.85 },
  ice: { time: 14, bias: 0, right: 0.05 },
};
let scanKey = '';
let currentScan;
let lastMath = '';
let lastChart = '';

function seriesFrom(frames) {
  return curves.map(({ key, name, tone, scale }) => ({
    name, tone, points: frames.map(({ t, state }) => ({ x: t, y: state[key] * 100 / scale })),
  }));
}

function updateChart(s) {
  const nextScan = [s.muLeft.toFixed(2), s.steeringBias.toFixed(2), s.inputOmega].join('/');
  if (nextScan !== scanKey) {
    tape.clear();
    for (const muRight of samples) {
      tape.record(muRight, model.evaluate(0, {
        muLeft: s.muLeft, muRight, steeringBias: s.steeringBias, story: false,
      }));
    }
    currentScan = seriesFrom(tape.frames);
    scanKey = nextScan;
  }
  const ghost = tape.getGhost();
  const key = [scanKey, s.muRight.toFixed(2), ghost?.meta.revision].join('/');
  if (key === lastChart) return;
  lastChart = key;
  chart.updateXY({
    xMin: 0.05, xMax: 0.95, yMax: 100,
    xLabel: '右轮摩擦系数', yLabel: '%',
    series: currentScan, ghosts: ghost ? seriesFrom(ghost.frames) : [],
    marks: [
      { axis: 'x', value: s.muRight, tone: 'navy' },
      ...(ghost ? [{ axis: 'x', value: ghost.meta.muRight, tone: 'cat4', label: '基准' }] : []),
    ],
    ariaLabel: '右轮摩擦系数变化时，左右轮转速和总推进力的百分比',
  });
}

function updateMath(s) {
  const left = s.omegaL.toFixed(2);
  const right = s.omegaR.toFixed(2);
  const carrier = s.omegaC.toFixed(2);
  const mu = Math.min(s.muLeft, s.muRight).toFixed(2);
  const torque = s.tauL.toFixed(0);
  const tex = [
    String.raw`\omega_c = \frac{\omega_L+\omega_R}{2} = \frac{${left}+${right}}{2}=${carrier}`,
    String.raw`\tau_L=\tau_R=\min(${REQUESTED_TORQUE / 2},\,${mu}\times${GRIP_TORQUE})=${torque}`,
  ];
  if (s.inputOmega === 0) tex[1] = String.raw`\tau_L=\tau_R=0\;\mathrm{N\,m}`;
  if (lastMath === tex.join('/')) return;
  lastMath = tex.join('/');
  maths.update({ equations: [
    { label: '冠齿轮 · rad/s', tex: tex[0] },
    { label: '每侧扭矩 · N·m', tex: tex[1] },
  ] });
}

model.subscribe((s, params, t) => {
  update(s, t, params.story);
  const beat = BEATS[Math.min(BEATS.length - 1, Math.floor(t / 4))];
  byId('act-title').textContent = params.story ? beat.title : '自由试验';
  byId('act-cue').textContent = params.story ? beat.summary : (
    s.slip > 0.05 ? '打滑侧限制了两根半轴的扭矩，抓地侧也分不到更多。'
      : '拖动绿色手柄剖开壳体。降低一侧摩擦，观察两轮和推进力。'
  );
  for (const { key, input, output } of inputs) {
    input.value = s[key];
    output.value = key === 'cutaway' ? `${Math.round(s.cutaway * 100)}%` : s[key].toFixed(2);
  }
  byId('left-speed').textContent = s.omegaL.toFixed(2);
  byId('right-speed').textContent = s.omegaR.toFixed(2);
  byId('drive-force').textContent = (s.driveForce / 1000).toFixed(2);
  updateMath(s);
  updateChart(s);
  const ghost = tape.getGhost();
  if (ghost) {
    const delta = (s.driveForce - ghost.meta.force) / 1000;
    byId('ghost-result').value = `推进力差 ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)} kN`;
  }
});

for (const { key, input } of inputs) {
  input.addEventListener('input', () => setExperiment({ [key]: input.valueAsNumber }));
}
for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    const { time, bias, right } = presets[button.dataset.preset];
    setExperiment({ muLeft: dry.muLeft, muRight: right, steeringBias: bias, cutaway: 1 });
    clock.seek(time);
    clock.play();
  });
}
byId('story').addEventListener('click', () => {
  model.resetParams();
  model.setParams({ story: true });
  stage.unlockUserCamera();
  clock.seek(0);
  clock.play();
});
let ghostRevision = 0;
byId('ghost').addEventListener('click', () => {
  const { driveForce, muRight } = model.getSnapshot();
  tape.captureGhost('基准对照', { force: driveForce, muRight, revision: ++ghostRevision });
  updateChart(model.getSnapshot());
  byId('ghost-result').value = '推进力差 +0.00 kN';
});

clock.subscribe(({ t }) => director.seekGlobal(t));
const hooks = exposeTestHooks({ version: 3, profile: 'mechanical-3d', clock, director, stage, choreographer, model });
const parsedUrl = parseUrlState(location.search);
if (parsedUrl.exportMode) document.documentElement.dataset.export = parsedUrl.exportMode;
const url = new URLSearchParams(location.search);
const requestedSkin = parsedUrl.skin || url.get('skin');
if (requestedSkin && THEME_PRESETS.includes(requestedSkin)) {
  setShellPresentation(document.querySelector('.artboard-shell'), { theme: requestedSkin, stage });
}
const beat = BEATS.find((item) => item.id === url.get('stage'));
if (url.has('t') || url.has('end') || beat) {
  await hooks.seek(url.has('t') ? Number(url.get('t')) : url.has('end') ? DURATION : beat.start);
}
