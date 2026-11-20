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
import {
  ACTS,
  CARTRIDGES,
  CARTRIDGE_IDS,
  CacheBenchSimulation,
  HIT_NS,
  MISS_NS,
} from './lru-engine.js';
import { LruWorkbenchScene } from './lru-scene.js';

const $ = (id) => document.getElementById(id);
const urlState = parseUrlState(location.search);
if (urlState.thumb) {
  document.documentElement.dataset.thumb = '1';
}

const DICT = {
  zh: {
    brandTitle: '双槽缓存 · 4 幕淘汰实验台',
    brandSub: '点卡盒干预执行 · 对照 1 ns 命中与 100 ns 主存回源',
    ready: '准备就绪',
    hit: '工作台命中',
    miss: '主存回源',
    partsHeading: '反事实手动干预 (点击 1–4 抢发请求)',
    chartTitle: 'LRU vs FIFO 命中率轨迹',
    mathsTitle: '活公式 · AMAT 平均访存',
    mathsSub: '点击展开 1:1 实时数值代入',
    top: '俯视',
    reset: '复位',
    callouts: '标注',
    sound: '音效',
    zoom: '聚焦部件',
    searchBtn: '⌘K 搜索',
    searchPh: '搜索幕次或缓存概念 (按 Enter 跳转)…',
  },
  en: {
    brandTitle: 'Dual-Bay Cache · 4-Act Workbench',
    brandSub: 'Click cartridges to perturb execution · 1 ns hit vs 100 ns miss',
    ready: 'Ready',
    hit: 'L1 Hit',
    miss: 'Backing Fetch',
    partsHeading: 'Counterfactual Input (Click 1–4)',
    chartTitle: 'LRU vs FIFO Hit-Rate XY Curve',
    mathsTitle: 'Live Maths · AMAT Substitution',
    mathsSub: 'Expand for exact step-by-step latency',
    top: 'Top',
    reset: 'Reset',
    callouts: 'Labels',
    sound: 'Sound',
    zoom: 'Zoom to it',
    searchBtn: '⌘K Search',
    searchPh: 'Jump to act or cache concept…',
  },
};

const i18n = createI18n({
  defaultLang: urlState.lang === 'en' ? 'en' : 'zh',
  dicts: DICT,
});

const sim = new CacheBenchSimulation();
const sound = new TactileSound({ muted: urlState.thumb });
const linkBus = new LinkBus();
const mastery = new MasteryStore(createLocalStorage('simulify:cache:'), ACTS.map((a) => a.id));

let selectedInspectId = null;
let predictionChoiceId = null;
let lastPredictedCorrect = null;

const INSPECT_COPY = {
  'lru-bay-0': {
    zh: ['左槽 · MRU', '刚命中或刚调入的卡放最左侧，下次访问 1 ns 命中。'],
    en: ['Left Bay · MRU', 'Most recently used cartridge sits here for 1 ns hits.'],
  },
  'lru-bay-1': {
    zh: ['右槽 · LRU 候选', '最久未访问的卡滑到这里；满槽再来新卡将从右坡滑出。'],
    en: ['Right Bay · LRU Candidate', 'Oldest unused item; evicted down the ramp on next miss.'],
  },
  'fifo-bay-0': {
    zh: ['FIFO 后入槽', '新调入项排队进入左槽，不因命中而改变位置。'],
    en: ['FIFO Tail Bay', 'Newly fetched item enters here; hits never promote it.'],
  },
  'fifo-bay-1': {
    zh: ['FIFO 先出槽', '即使反复命中仍是队列头，下一轮缺页必被挤出。'],
    en: ['FIFO Head Bay', 'Next out regardless of hot hits.'],
  },
  hub: {
    zh: ['CPU 总线仲裁器', '命中直接由桌面短轨返回 (1 ns)；缺页沿后排长轨取回 (100 ns)。'],
    en: ['CPU Memory Bus', 'Returns 1 ns from front bays or 100 ns from rear store.'],
  },
};

const scene = new LruWorkbenchScene({
  canvas: $('stage-canvas'),
  svgLeaders: $('leader-svg'),
  tagsLayer: $('tags-layer'),
  popupsLayer: $('popups-layer'),
  tooltipEl: $('stage-tooltip'),
  sound,
  onRequestKey: (key) => manualRequest(key),
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

const xyChart = new ChartCard($('chart-card'), {
  title: i18n.t('chartTitle'),
  mode: 'xy',
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
  scene.stage.focusPart(id, 1.48);
});

// Build progressive 4-Act TimelineDirector
const stages = ACTS.map((act, actIdx) => ({
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
          scene.setDualMode(act.dualMode);
          scene.callouts.setCurrentStep(actIdx);
          scene.applySnapshot(sim.getSnapshot());
          syncAll();
        });
        act.sequence.forEach((key, kIdx) => {
          const at = 0.25 + kIdx * 0.9;
          tl.add(
            at,
            0.01,
            () => {},
            {
              begin: () => {
                const record = sim.request(key);
                const snap = sim.getSnapshot();
                scene.applySnapshot(snap);
                if (!urlState.thumb) {
                  scene.animateTransition(record);
                }
                syncAll();
              },
            }
          );
          tl.add(at + 0.05, 0.75, () => {}, { fx: true });
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
  items: ACTS.map((a) => ({
    id: a.id,
    title: a.title[i18n.getLang()] || a.title.zh,
    subtitle: a.hook[i18n.getLang()] || a.hook.zh,
    keywords: [a.id, a.shortTitle.zh, a.shortTitle.en, a.cue.zh, a.cue.en],
  })),
  onSelect: (item) => director.jumpStage(item.id, { play: true }),
});

function manualRequest(key) {
  director.pause();
  const record = sim.request(key);
  const snap = sim.getSnapshot();
  scene.animateTransition(record);
  if (record.lru.hit) sound.hit();
  else sound.miss();
  syncAll();
  const lang = i18n.getLang();
  $('status-bar').textContent =
    lang === 'en'
      ? `Manual fetch ${key}: LRU ${record.lru.hit ? 'HIT' : 'MISS'} (${record.lru.latencyNs} ns)`
      : `手动取用 ${key}：LRU ${record.lru.hit ? '命中' : '缺页'}（${record.lru.latencyNs} ns）`;
}

function renderPartControls(lang) {
  const grid = $('part-grid');
  const thumb = $('thumb-parts');
  grid.replaceChildren();
  thumb.replaceChildren();
  const snap = sim.getSnapshot();
  for (const id of CARTRIDGE_IDS) {
    const info = CARTRIDGES[id];
    const titleText = lang === 'en' ? info.enTitle : info.title;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'part-btn';
    b.dataset.resident = String(snap.lruSlots.includes(id));
    b.innerHTML = `<span class="part-swatch" style="background:${info.color}">${id}</span><span class="part-meta"><strong>${info.tag}</strong><small>${titleText}</small></span>`;
    b.onclick = () => manualRequest(id);
    grid.append(b);

    const tb = document.createElement('button');
    tb.type = 'button';
    tb.className = 'btn-chip';
    tb.textContent = `${id} ${info.tag}`;
    tb.onclick = () => manualRequest(id);
    thumb.append(tb);
  }
}

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
  const snap = sim.getSnapshot();

  $('brand-title').textContent = i18n.t('brandTitle');
  $('brand-sub').textContent = i18n.t('brandSub');
  $('parts-heading').textContent = i18n.t('partsHeading');
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

  const pill = $('latency-pill');
  if (!snap.event) {
    delete pill.dataset.kind;
    $('latency-label').textContent = i18n.t('ready');
    $('latency-value').textContent = '0 ns';
  } else {
    pill.dataset.kind = snap.event.lru.hit ? 'hit' : 'miss';
    $('latency-label').textContent = snap.event.lru.hit ? i18n.t('hit') : i18n.t('miss');
    $('latency-value').textContent = `${snap.event.lru.latencyNs} ns`;
  }

  const slotLabel = snap.lruSlots.length ? `[${snap.lruSlots.join(', ')}]` : lang === 'en' ? 'Empty' : '空';
  $('readout-slots').textContent = `LRU: ${slotLabel}${snap.evicted ? ` · out ${snap.evicted}` : ''}`;
  $('readout-totals').textContent = `${snap.lruStats.hits}/${snap.lruStats.total} · ${snap.lruStats.totalNs} ns`;

  const xMax = Math.max(4, snap.stepNumber, act.sequence.length);
  xyChart.setHeader(i18n.t('chartTitle'), `${snap.lruStats.hitRate}%`);
  xyChart.updateXY({
    badge: `${snap.stepNumber} steps`,
    xMin: 1,
    xMax,
    yMin: 0,
    yMax: 100,
    xLabel: lang === 'en' ? 'Access #' : '访问步数',
    yLabel: '%',
    series: [
      { points: snap.lruCurve, tone: 'teal', label: 'LRU' },
      ...(act.dualMode ? [{ points: snap.fifoCurve, tone: 'amber', dashed: true, label: 'FIFO' }] : []),
    ],
    ghost: !act.dualMode && snap.fifoCurve.length >= 2 ? { points: snap.fifoCurve } : null,
    marks: [{ axis: 'y', value: 50, label: '50%', tone: 'amber' }],
    dot: snap.lruCurve.length ? { ...snap.lruCurve[snap.lruCurve.length - 1], tone: 'teal' } : null,
  });

  const hRate = snap.lruStats.total ? +(snap.lruStats.hits / snap.lruStats.total).toFixed(2) : 0;
  const mRate = +(1 - hRate).toFixed(2);
  liveMaths.update({
    badge: `${snap.lruStats.amatNs} ns`,
    equations: [
      {
        label: lang === 'en' ? 'Average Memory Access Time (AMAT)' : '平均访存延迟 AMAT 实时计算',
        tokens: [
          { text: 'AMAT = ', tone: 'muted' },
          { text: `${hRate}`, tone: 'teal', emph: true },
          { text: `·${HIT_NS}ns + `, tone: 'muted' },
          { text: `${mRate}`, tone: 'amber', emph: true },
          { text: `·${MISS_NS}ns = `, tone: 'muted' },
          { text: `${snap.lruStats.amatNs} ns`, tone: 'navy', emph: true },
        ],
      },
    ],
    table: {
      headers: [lang === 'en' ? 'Policy' : '策略', lang === 'en' ? 'Slots' : '当前槽位', 'Hit%', 'AMAT'],
      rows: [
        ['LRU', `[${snap.lruSlots.join(',') || '-'}]`, `${snap.lruStats.hitRate}%`, `${snap.lruStats.amatNs} ns`],
        ...(act.dualMode ? [['FIFO', `[${snap.fifoQueue.join(',') || '-'}]`, `${snap.fifoStats.hitRate}%`, `${snap.fifoStats.amatNs} ns`]] : []),
      ],
      activeRow: selectedInspectId?.startsWith('fifo') && act.dualMode ? 1 : 0,
    },
  });

  renderPrediction(act, lang);
  renderPartControls(lang);
}

// Button & keyboard bindings
$('btn-palette').onclick = () => palette.open();
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
    const act = ACTS[idx];
    if (act) btn.textContent = act.shortTitle[lang] || act.shortTitle.zh;
  });
  palette.setPlaceholder(i18n.t('searchPh'));
  palette.setItems(
    ACTS.map((a) => ({
      id: a.id,
      title: a.title[lang] || a.title.zh,
      subtitle: a.hook[lang] || a.hook.zh,
      keywords: [a.id, a.shortTitle.zh, a.shortTitle.en],
    }))
  );
  syncAll();
});

initToolbars();

// Apply URL deep link (?stage=act-3&end / ?thumb=1 / ?lang=en) or start Act 1 playing
const applied = applyUrlState(director, location.search);
if (!applied || (applied.stage === null && applied.step === null && !applied.end && !applied.paused && applied.t === null)) {
  if (urlState.thumb) {
    director.jumpStage('act-4', { play: false });
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
