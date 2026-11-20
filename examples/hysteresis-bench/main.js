import { ChartCard } from '../../kit/chart-card.js';
import { LinkBus } from '../../kit/link-bus.js';
import { LiveMathsPanel } from '../../kit/live-maths.js';
import { TactileSound } from '../../kit/sound.js';
import {
  applyUrlState,
  exposeTestHooks,
  mountTimelineBar,
  parseUrlState,
  TimelineDirector,
} from '../../kit/timeline-director.js';
import { initToolbars } from '../../kit/toolbar-a11y.js';
import { mountLangSwitch } from '../../shell/app-shell.js';
import { CommandPalette } from '../../shell/command-palette.js';
import { createI18n } from '../../shell/i18n.js';
import { createLocalStorage, MasteryStore } from '../../shell/storage-adapter.js';
import { THERMOSTAT_ACTS, ThermostatSimulation } from './thermostat-engine.js';
import { ThermostatWorkbenchScene } from './thermostat-scene.js';

const $ = (id) => document.getElementById(id);
const urlState = parseUrlState(location.search);
if (urlState.thumb) {
  document.documentElement.dataset.thumb = '1';
}

const DICT = {
  zh: {
    brandTitle: '双金属恒温器 · 磁吸回差实验台',
    brandSub: '铜钢形变 × 永磁死区 × 滞回环 · 单一 solve() 驱动',
    on: '加热开启',
    off: '加热关闭',
    band4: '有回差 4°',
    band0: '无回差 0°',
    chartTitle: '温度-开关滞回环',
    mathsTitle: '活公式 · 切换门限不等式',
    mathsSub: '物理 × 数学双真源（点击展开）',
    top: '俯视',
    reset: '复位',
    callouts: '标注',
    sound: '音效',
    zoom: '聚焦部件',
    searchBtn: '⌘K 搜索',
    searchPh: '搜索幕次或物理/控制概念…',
  },
  en: {
    brandTitle: 'Bimetallic Thermostat · Hysteresis Workbench',
    brandSub: 'Bimetallic Bend × Magnetic Latch × Hysteresis Loop',
    on: 'Heater ON',
    off: 'Heater OFF',
    band4: '4 °C Band',
    band0: '0 °C Band',
    chartTitle: 'Hysteresis Phase Loop',
    mathsTitle: 'Live Maths · Switching Thresholds',
    mathsSub: 'Physical × Math dual view (click to expand)',
    top: 'Top',
    reset: 'Reset',
    callouts: 'Labels',
    sound: 'Sound',
    zoom: 'Zoom to it',
    searchBtn: '⌘K Search',
    searchPh: 'Jump to act or hysteresis concept…',
  },
};

const INSPECT_COPY = {
  thermometer: {
    zh: ['液体温度计', '指示当前模拟室温 (16–24 °C)。'],
    en: ['Liquid Thermometer', 'Displays live ambient room temperature (16–24 °C).'],
  },
  bimetal: {
    zh: ['铜-钢双金属片', '铜的热膨胀率更高：冷却向上拱起压合触点，升温向下拉开。'],
    en: ['Copper-Steel Bimetallic Strip', 'Higher copper expansion bends the tip vertically across T.'],
  },
  magnet: {
    zh: ['永磁死区吸合件', '产生 18–22 °C 磁滞死区，避免单阈值微小温漂造成打火震颤。'],
    en: ['Hysteresis Magnet', 'Creates a 4 °C deadband holding contact firmly until 22 °C.'],
  },
  heater: {
    zh: ['电阻丝加热器', '触点闭合时通电发红，断开时冷却并触发反向行程。'],
    en: ['Resistive Heater Coil', 'Energizes only while bimetal tip latches onto contact post.'],
  },
};

const i18n = createI18n({
  defaultLang: urlState.lang === 'en' ? 'en' : 'zh',
  dicts: DICT,
});

const sim = new ThermostatSimulation();
const sound = new TactileSound({ muted: urlState.thumb });
const linkBus = new LinkBus();
const mastery = new MasteryStore(createLocalStorage('simulify:thermostat:'), THERMOSTAT_ACTS.map((a) => a.id));

let selectedInspectId = null;
let predictionChoiceId = null;
let lastPredictedCorrect = null;

const scene = new ThermostatWorkbenchScene({
  canvas: $('stage-canvas'),
  svgLeaders: $('leader-svg'),
  tagsLayer: $('tags-layer'),
  popupsLayer: $('popups-layer'),
  tooltipEl: $('stage-tooltip'),
  sound,
  onTempDelta: (d) => adjustTemp(sim.temperature + d),
  onInspect: (id, meta) => linkBus.select(id || null, '3d-scene') || openInspector(id, meta),
});

scene.callouts.setBlockers(() => {
  const stageRect = $('stage-canvas').getBoundingClientRect();
  const ids = ['hud-guide', 'hud-bottom-left', 'hud-bottom-center'];
  const boxes = [];
  for (const elId of ids) {
    const el = $(elId);
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    boxes.push({
      left: r.left - stageRect.left - 8,
      top: r.top - stageRect.top - 8,
      right: r.right - stageRect.left + 8,
      bottom: r.bottom - stageRect.top + 8,
    });
  }
  return boxes;
});

const hystChart = new ChartCard($('chart-card'), {
  title: i18n.t('chartTitle'),
  mode: 'hysteresis',
  collapsed: false,
});

const liveMaths = new LiveMathsPanel($('live-maths-slot'), {
  title: i18n.t('mathsTitle'),
  subtitle: i18n.t('mathsSub'),
  collapsed: true,
});

function openInspector(id, fallbackMeta = null) {
  if (!id) return;
  selectedInspectId = id;
  sound.click();
  const lang = i18n.getLang();
  const entry = INSPECT_COPY[id];
  if (entry) {
    const [tTitle, tDesc] = entry[lang] || entry.zh;
    $('inspector-title').textContent = tTitle;
    $('inspector-note').textContent = tDesc;
  } else {
    $('inspector-title').textContent = fallbackMeta?.title || id;
    $('inspector-note').textContent = fallbackMeta?.hint || '';
  }
  $('inspector-float').hidden = false;
  syncAll();
}

linkBus.onSelect((id) => {
  if (!id) {
    $('inspector-float').hidden = true;
    selectedInspectId = null;
    syncAll();
    return;
  }
  openInspector(id);
});

linkBus.onFocus((id) => {
  scene.stage.focusPart(id, 1.5);
});

function adjustTemp(nextTemp, { animate = true } = {}) {
  director.pause();
  const res = sim.setTemperature(nextTemp);
  scene.syncState({ ...res, band: sim.band }, { animate });
  syncAll();
  return res;
}

const stages = THERMOSTAT_ACTS.map((act, actIdx) => ({
  id: act.id,
  title: act.shortTitle[i18n.getLang()] || act.shortTitle.zh,
  camera: act.camera,
  summary: act.cue[i18n.getLang()] || act.cue.zh,
  carries: act.carries[i18n.getLang()] || act.carries.zh,
  hook: act.hook[i18n.getLang()] || act.hook.zh,
  relates: act.relates,
  steps: [
    {
      id: `${act.id}-step-0`,
      title: act.title[i18n.getLang()] || act.title.zh,
      run: (tl) => {
        tl.call(0, () => {
          sim.loadAct(actIdx);
          scene.callouts.setCurrentStep(actIdx);
          scene.syncState({ temperature: sim.temperature, heating: sim.heating, flipped: false, band: sim.band }, { animate: false });
          syncAll();
        });
        act.sequence.forEach((temp, idx) => {
          const at = 0.2 + idx * 0.55;
          tl.add(
            at,
            0.01,
            () => {},
            {
              begin: () => {
                const res = sim.setTemperature(temp);
                scene.syncState({ ...res, band: sim.band }, { animate: !urlState.thumb });
                syncAll();
              },
            }
          );
          tl.add(at + 0.04, 0.45, () => {}, { fx: true });
        });
      },
    },
  ],
}));

const director = new TimelineDirector({
  stages,
  autoAdvance: false,
  onReset: () => {
    predictionChoiceId = null;
    lastPredictedCorrect = null;
    $('prediction-verdict').hidden = true;
  },
  onStageCamera: (cam) => {
    if (cam) scene.stage.flyTo(cam, 420);
  },
  onStepChange: (state) => {
    mastery.markDone(state.stageId);
    syncAll();
  },
});

const TL_LABELS = {
  zh: { prev: '上一步', play: '播放', pause: '暂停', next: '下一步', end: '直达终态' },
  en: { prev: 'Prev', play: 'Play', pause: 'Pause', next: 'Next', end: 'Show End' },
};

const timelineMount = mountTimelineBar($('timeline-slot'), director, {
  speeds: [0.5, 1, 2],
  showStages: true,
  showEndButton: true,
  labels: TL_LABELS[i18n.getLang()] || TL_LABELS.zh,
});

mountLangSwitch($('lang-slot'), i18n, [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
]);

const palette = new CommandPalette({
  items: THERMOSTAT_ACTS.map((a) => ({
    id: a.id,
    title: a.title[i18n.getLang()] || a.title.zh,
    subtitle: a.hook[i18n.getLang()] || a.hook.zh,
    keywords: [a.id, a.shortTitle.zh, a.shortTitle.en],
  })),
  onSelect: (item) => director.jumpStage(item.id, { play: true }),
});

function renderPrediction(act, lang) {
  const box = $('prediction-box');
  if (!act.prediction) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $('prediction-prompt').textContent = act.prediction.prompt[lang] || act.prediction.prompt.zh;
  const choicesEl = $('prediction-choices');
  choicesEl.replaceChildren();
  for (const ch of act.prediction.choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    btn.setAttribute('aria-pressed', String(predictionChoiceId === ch.id));
    btn.textContent = ch.label[lang] || ch.label.zh;
    btn.onclick = () => {
      predictionChoiceId = ch.id;
      lastPredictedCorrect = Boolean(ch.correct);
      if (ch.correct) sound.success();
      director.jumpStage(act.id, { play: true });
    };
    choicesEl.append(btn);
  }
  const verdict = $('prediction-verdict');
  if (predictionChoiceId === null) {
    verdict.hidden = true;
  } else {
    verdict.hidden = false;
    verdict.textContent = lastPredictedCorrect
      ? act.prediction.verdictOk[lang] || act.prediction.verdictOk.zh
      : act.prediction.verdictBad[lang] || act.prediction.verdictBad.zh;
  }
}

function syncAll() {
  const lang = i18n.getLang();
  const act = sim.act;

  $('brand-title').textContent = i18n.t('brandTitle');
  $('brand-sub').textContent = i18n.t('brandSub');
  $('band-4').textContent = i18n.t('band4');
  $('band-0').textContent = i18n.t('band0');
  $('btn-palette').textContent = i18n.t('searchBtn');
  $('inspector-zoom').textContent = i18n.t('zoom');
  $('view-top').querySelector('span').textContent = i18n.t('top');
  $('view-reset').querySelector('span').textContent = i18n.t('reset');
  $('toggle-callouts').querySelector('span').textContent = i18n.t('callouts');
  $('toggle-sound').querySelector('span').textContent = i18n.t('sound');

  $('lesson-title').textContent = act.title[lang] || act.title.zh;
  $('lesson-cue').textContent = act.cue[lang] || act.cue.zh;

  const carriesText = act.carries[lang] || act.carries.zh;
  const hookText = act.hook[lang] || act.hook.zh;
  $('qc-carries').textContent = carriesText;
  $('qc-carries').hidden = !carriesText;
  $('qc-hook').textContent = hookText;
  $('qc-hook').hidden = !hookText;

  $('temp-range').value = String(sim.temperature);
  $('temp-reading').textContent = `${sim.temperature.toFixed(1)} °C`;
  $('heater-badge').dataset.on = String(sim.heating);
  $('heater-badge').textContent = sim.heating ? i18n.t('on') : i18n.t('off');

  const pill = $('heater-pill');
  pill.dataset.kind = sim.heating ? 'miss' : 'hit';
  $('heater-pill-label').textContent = sim.heating ? i18n.t('on') : i18n.t('off');
  $('heater-pill-temp').textContent = `${sim.temperature.toFixed(1)} °C`;

  $('band-4').setAttribute('aria-pressed', String(sim.band === 4));
  $('band-0').setAttribute('aria-pressed', String(sim.band === 0));

  const ticksEl = document.querySelector('.range-ticks');
  if (ticksEl) {
    ticksEl.innerHTML =
      lang === 'en'
        ? '<span>16°</span><span>18° ON</span><span>20°</span><span>22° OFF</span><span>24°</span>'
        : '<span>16°</span><span>18° 开</span><span>20°</span><span>22° 关</span><span>24°</span>';
  }

  const [tOn, tOff] = sim.thresholds;
  const activeRow = sim.temperature <= tOn ? 0 : sim.temperature >= tOff ? 2 : 1;
  const ruleTxt =
    sim.band === 0
      ? lang === 'en'
        ? 'Single 20° threshold'
        : '单点 20° 门限'
      : activeRow === 0
        ? `≤${tOn}° -> ON`
        : activeRow === 2
          ? `≥${tOff}° -> OFF`
          : lang === 'en'
            ? 'Deadband latch'
            : '死区延续前态';
  $('readout-rule').textContent = ruleTxt;
  $('readout-switches').textContent =
    lang === 'en' ? `Flips: ${sim.switchCount}` : `动作: ${sim.switchCount} 次`;

  hystChart.setHeader(i18n.t('chartTitle'), sim.band > 0 ? '4° band' : '0° chatter');
  hystChart.updateHysteresis({
    badge: sim.band > 0 ? i18n.t('band4') : i18n.t('band0'),
    thresholds: sim.thresholds,
    points: sim.trace,
    current: { x: sim.temperature, y: sim.heating ? 1 : 0 },
  });

  liveMaths.update({
    badge: `ΔT=${sim.band}°C`,
    equations: [
      {
        label: lang === 'en' ? 'Piecewise Latch Rule' : '滞回分段切换式',
        tokens: [
          { text: 'T = ', tone: 'muted' },
          { text: `${sim.temperature.toFixed(1)}°C`, tone: sim.heating ? 'amber' : 'teal', emph: true },
          { text: ` · T_on=${tOn}° · T_off=${tOff}° → `, tone: 'muted' },
          { text: sim.heating ? 'ON(1)' : 'OFF(0)', tone: sim.heating ? 'amber' : 'teal', emph: true },
        ],
      },
    ],
    table: {
      headers: [lang === 'en' ? 'Region' : '区间', 'Output'],
      rows: [
        [`T ≤ ${tOn}°C`, 'Heater = ON (1)'],
        [sim.band > 0 ? `${tOn}° < T < ${tOff}°` : 'T = 20° (none)', lang === 'en' ? 'Latch prev state' : '保持前态'],
        [`T ≥ ${tOff}°C`, 'Heater = OFF (0)'],
      ],
      activeRow,
    },
  });

  renderPrediction(act, lang);
}

$('btn-palette').onclick = () => palette.open();
$('temp-range').oninput = (e) => adjustTemp(Number(e.target.value));
$('btn-down').onclick = () => adjustTemp(sim.temperature - 1);
$('btn-up').onclick = () => adjustTemp(sim.temperature + 1);
$('thumb-down').onclick = () => adjustTemp(sim.temperature - 1);
$('thumb-up').onclick = () => adjustTemp(sim.temperature + 1);
$('thumb-band').onclick = () => {
  director.pause();
  sim.setBand(sim.band === 4 ? 0 : 4);
  scene.syncState({ temperature: sim.temperature, heating: sim.heating, flipped: false, band: sim.band }, { animate: false });
  syncAll();
};
$('band-4').onclick = () => {
  director.pause();
  sim.setBand(4);
  scene.syncState({ temperature: sim.temperature, heating: sim.heating, flipped: false, band: sim.band }, { animate: false });
  syncAll();
};
$('band-0').onclick = () => {
  director.pause();
  sim.setBand(0);
  scene.syncState({ temperature: sim.temperature, heating: sim.heating, flipped: false, band: sim.band }, { animate: false });
  syncAll();
};
$('inspector-close').onclick = () => linkBus.select(null, 'inspector-close');
$('inspector-zoom').onclick = () => {
  if (selectedInspectId) linkBus.focus(selectedInspectId, 'inspector-zoom');
};
$('view-left').onclick = () => scene.stage.rotateBy(-30);
$('view-right').onclick = () => scene.stage.rotateBy(30);
$('view-reset').onclick = () => {
  const cam = sim.act.camera;
  if (cam) scene.stage.flyTo(cam, 380);
  else scene.stage.resetView();
};
$('view-top').onclick = () => {
  const isTop = scene.stage.toggleTopView();
  $('view-top').setAttribute('aria-pressed', String(isTop));
};
$('toggle-callouts').onclick = (e) => {
  const next = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(next));
  scene.setCalloutsVisible(next);
};
$('toggle-sound').onclick = (e) => {
  const next = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(next));
  sound.setMuted(!next);
};

i18n.subscribe((lang) => {
  timelineMount.setLabels(TL_LABELS[lang] || TL_LABELS.zh);
  $('timeline-slot').querySelectorAll('.timeline-stage-btn').forEach((btn, idx) => {
    const act = THERMOSTAT_ACTS[idx];
    if (act) btn.textContent = act.shortTitle[lang] || act.shortTitle.zh;
  });
  palette.setPlaceholder(i18n.t('searchPh'));
  palette.setItems(
    THERMOSTAT_ACTS.map((a) => ({
      id: a.id,
      title: a.title[lang] || a.title.zh,
      subtitle: a.hook[lang] || a.hook.zh,
      keywords: [a.id, a.shortTitle.zh, a.shortTitle.en],
    }))
  );
  syncAll();
});

initToolbars();

const applied = applyUrlState(director, location.search);
if (!applied || (applied.stage === null && applied.step === null && !applied.end && !applied.paused && applied.t === null)) {
  if (urlState.thumb) {
    director.jumpStage('act-2', { play: false });
    director.showEnd();
  } else {
    director.jump(0, { play: true });
  }
}

let lastClock = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastClock) / 1000);
  lastClock = now;
  director.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

exposeTestHooks(director, {
  sim,
  scene,
  linkBus,
  i18n,
  mastery,
});
