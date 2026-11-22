import { CalloutLayer } from '../../../kit/callout-layer.js';
import { ChartCard } from '../../../kit/chart-card.js';
import { LinkBus } from '../../../kit/link-bus.js';
import { LiveMathsPanel } from '../../../kit/live-maths.js';
import { FloatingPopups } from '../../../kit/popups.js';
import { TactileSound } from '../../../kit/sound.js';
import {
  applyUrlState,
  easeLinear,
  exposeTestHooks,
  mountTimelineBar,
  parseUrlState,
  TimelineDirector,
} from '../../../kit/timeline-director.js';
import { initToolbars } from '../../../kit/toolbar-a11y.js';
import { mountLangSwitch, mountMasteryBar } from '../../../shell/app-shell.js';
import { CommandPalette } from '../../../shell/command-palette.js';
import { createI18n } from '../../../shell/i18n.js';
import { createLocalStorage, MasteryStore } from '../../../shell/storage-adapter.js';
import { PROB_ACTS, ProbBenchEngine } from './prob-engine.js';
import { ACT_CAMERAS, ProbStage } from './prob-stage.js';

const $ = (id) => document.getElementById(id);
const urlState = parseUrlState(location.search);
if (urlState.thumb) document.documentElement.dataset.thumb = '1';

const L = (obj, lang) => {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj[lang] ?? obj.zh ?? obj.en ?? '';
  return obj ?? '';
};

const DICT = {
  zh: {
    chart: '分布对照',
    maths: '活公式 · 代入与推导',
    mathsSub: '点击展开完整代入',
    top: '俯视',
    reset: '复位',
    callouts: '标注',
    sound: '音效',
    result: '结果',
    carries: '承上：',
    hook: '钩子：',
    searchPh: '搜索幕次或概念：L² 投影、泊松、正态、χ²、t、F…',
    mastery: (p) => `${p.done}/${p.total} 幕已看`,
    relType: { uses: '用到', deepens: '深入', contrast: '对照', aside: '旁支' },
    tl: { prev: '上一步', play: '播放', pause: '暂停', next: '下一步', end: '直达终态' },
    mobPrev: '上一幕',
    mobNext: '下一幕',
  },
  en: {
    chart: 'Distribution vs reference',
    maths: 'Live maths · substitution',
    mathsSub: 'Click to expand the full derivation',
    top: 'Top',
    reset: 'Reset',
    callouts: 'Labels',
    sound: 'Sound',
    result: 'Result',
    carries: 'Carries: ',
    hook: 'Hook: ',
    searchPh: 'Search act or concept: L² projection, Poisson, Normal, χ², t, F…',
    mastery: (p) => `${p.done}/${p.total} acts seen`,
    relType: { uses: 'uses', deepens: 'deepens', contrast: 'contrast', aside: 'aside' },
    tl: { prev: 'Prev', play: 'Play', pause: 'Pause', next: 'Next', end: 'Show End' },
    mobPrev: 'Prev act',
    mobNext: 'Next act',
  },
};

const i18n = createI18n({ defaultLang: urlState.lang === 'en' ? 'en' : 'zh', dicts: DICT });
const tx = (key) => i18n.t(key);
const dictObj = (key) => DICT[i18n.getLang()]?.[key] ?? DICT.zh[key];

const engine = new ProbBenchEngine();
const sound = new TactileSound({ muted: true });
const linkBus = new LinkBus();
const mastery = new MasteryStore(createLocalStorage('simulify:prob-ch5:'), PROB_ACTS.map((a) => a.id));

let director = null;

const stage = new ProbStage($('stage-canvas'), {
  thumb: Boolean(urlState.thumb),
  onHover: (hit, x, y) => {
    const tip = $('stage-tooltip');
    if (!hit) {
      tip.hidden = true;
      linkBus.clearHover('3d');
      return;
    }
    const idx = hit.meta?.deck ?? 0;
    const actNum = idx === 0 ? 1 : idx === 2 ? 5 : 2;
    const act = PROB_ACTS[actNum - 1];
    tip.textContent = L(act?.shortTitle, i18n.getLang()) || hit.id;
    tip.style.left = `${x + 12}px`;
    tip.style.top = `${y - 12}px`;
    tip.hidden = false;
    linkBus.hover(hit.id, '3d');
  },
  onSelect: (hit) => {
    if (!hit) return;
    const idx = hit.meta?.deck ?? 0;
    const actId = idx === 0 ? 'act-1' : idx === 2 ? 'act-5' : 'act-2';
    sound.click();
    director?.jumpStage(actId, { play: false, emitCamera: true });
    director?.showEnd();
    linkBus.select(hit.id, '3d');
  },
});

const popups = new FloatingPopups(stage.stage, $('popups-layer'));
const callouts = new CalloutLayer(stage.stage, $('leader-svg'), $('tags-layer'));
callouts.setBlockers(() => {
  const sr = $('stage-canvas').getBoundingClientRect();
  const boxes = [];
  for (const id of ['top-ribbon', 'right-dock', 'bottom-left-dock', 'bottom-transport']) {
    const el = $(id);
    if (!el || el.hidden || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    boxes.push({ left: r.left - sr.left - 6, top: r.top - sr.top - 6, right: r.right - sr.left + 6, bottom: r.bottom - sr.top + 6 });
  }
  return boxes;
});

const chartCard = new ChartCard($('chart-card'), { title: tx('chart'), mode: 'xy', collapsed: false });
const liveMaths = new LiveMathsPanel($('live-maths-slot'), { title: tx('maths'), subtitle: tx('mathsSub'), collapsed: true });
const masteryBar = mountMasteryBar($('mastery-slot'), mastery, { labelFn: (p) => dictObj('mastery')(p) });

function spawnPop(slot, text, tone = 'teal') {
  if (urlState.thumb || !text) return;
  popups.spawn(stage.getAnchor(slot), text, tone);
}

// ---------- Playback scripts: params only touch keys that exist in act.controls ----------
const ACT_SCRIPTS = {
  1: {
    beats: [
      { at: 0.3, set: { estimator: { opt: 0 } } },
      { at: 1.7, set: { estimator: { opt: 1 } }, pop: { slot: 'mFoot', text: 'MSE(V) < MSE(T)', tone: 'teal' } },
      { at: 3.2, set: { p: 0.3 } },
      { at: 4.0, set: { p: 0.5 } },
    ],
    dur: 5.2,
  },
  2: {
    beats: [
      { at: 0.3, set: { mode: { opt: 0 } } },
      { at: 1.6, set: { mode: { opt: 1 } }, pop: { slot: 'barPeak', text: 'Var 9 → 900', tone: 'amber' } },
      { at: 3.0, set: { pRel: 0.4 } },
      { at: 3.8, set: { pRel: 0.6 }, pop: { slot: 'barMid', text: 'R5 − R3', tone: 'teal' } },
    ],
    dur: 5.2,
  },
  3: {
    beats: [
      { at: 0.3, set: { alpha: 0.1 } },
      { at: 1.5, set: { alpha: 0.05 }, pop: { slot: 'barPeak', text: 'E[g(V)] ≠ g(E[V])', tone: 'amber' } },
      { at: 2.8, set: { alpha: 0.01 } },
      { at: 4.0, set: { alpha: 0.05 } },
    ],
    dur: 5.2,
  },
  4: {
    beats: [
      { at: 0.2, set: { t: 0 } },
      { at: 4.2, set: { t: 8 }, pop: { slot: 'railCursor', text: 'P(T₃>8) = P(N≤2)', tone: 'teal' } },
      { at: 4.7, set: { lambdaP: 0.8 }, pop: { slot: 'barPeak', text: 'E[Y] = ∞', tone: 'danger' } },
    ],
    sweep: { key: 't', from: 0, to: 8, at: 0.4, dur: 3.6 },
    dur: 5.6,
  },
  5: {
    beats: [
      { at: 0.2, set: { dim: { opt: 0 }, nu: 30 } },
      { at: 1.4, set: { nu: 5 } },
      { at: 2.6, set: { nu: 2 }, pop: { slot: 'barPeak', text: 'Var(t) = ∞', tone: 'danger' } },
      { at: 3.6, set: { dim: { opt: 1 } }, pop: { slot: 'domeTop', text: '0.5222 > 0.3247', tone: 'amber' } },
    ],
    dur: 5.4,
  },
};

const actByNum = (n) => PROB_ACTS[n - 1];
const controlsOf = (act) => (Array.isArray(act?.controls) ? act.controls : []);

function resolveSet(act, set = {}) {
  const out = {};
  const ctl = controlsOf(act);
  for (const [key, raw] of Object.entries(set)) {
    const def = ctl.find((c) => c.key === key);
    if (!def) continue;
    if (raw && typeof raw === 'object' && 'opt' in raw) {
      const opt = def.options?.[raw.opt];
      if (opt) out[key] = opt.value;
    } else {
      out[key] = raw;
    }
  }
  return out;
}

function actDefaults(act) {
  const out = {};
  for (const c of controlsOf(act)) if (c.value !== undefined) out[c.key] = c.value;
  return { ...(act.defaultParams || {}), ...out };
}

function enterAct(idx) {
  const act = PROB_ACTS[idx];
  engine.setAct(idx);
  engine.resetPlaybackOverrides();
  engine.setParams(actDefaults(act));
}

function buildStage(idx) {
  const act = PROB_ACTS[idx];
  const num = idx + 1;
  const script = ACT_SCRIPTS[num] || { beats: [], dur: 4 };
  return {
    id: act.id,
    title: L(act.shortTitle, 'zh'),
    camera: ACT_CAMERAS[num],
    summary: L(act.cue, 'zh'),
    carries: L(act.carries, 'zh'),
    hook: L(act.hook, 'zh'),
    relates: act.relates || [],
    steps: [
      {
        id: `${act.id}-step-0`,
        title: L(act.title, 'zh'),
        run: (tl) => {
          tl.call(0, () => {
            enterAct(idx);
            syncAll();
          });
          script.beats.forEach((b) => {
            tl.add(b.at, 0.01, () => {}, {
              begin: () => {
                engine.setParams(resolveSet(act, b.set));
                syncAll();
              },
            });
            if (b.pop) {
              tl.add(b.at, 0.01, () => {}, {
                fx: true,
                begin: () => {
                  sound.step();
                  spawnPop(b.pop.slot, b.pop.text, b.pop.tone);
                },
              });
            }
          });
          if (script.sweep) {
            const s = script.sweep;
            tl.add(
              s.at,
              s.dur,
              (e) => {
                engine.setParams(resolveSet(act, { [s.key]: s.from + (s.to - s.from) * e }));
                syncAll();
              },
              { ease: easeLinear }
            );
          }
          tl.add(script.dur - 0.7, 0.7, () => {}, {
            begin: () => {
              engine.setParams(actDefaults(act));
              syncAll();
            },
          });
        },
      },
    ],
  };
}

// ---------- Right dock rendering ----------
let controlsBuiltFor = '';
const controlEls = new Map();

function fmt(v, step) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const s = Number(step) || 1;
  const dec = s >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(s)));
  return n.toFixed(dec);
}

function setParam(key, value) {
  director?.pause();
  engine.setParams({ [key]: value });
  syncAll();
}

function buildControls(act, lang) {
  const slot = $('controls-slot');
  slot.replaceChildren();
  controlEls.clear();
  for (const c of controlsOf(act)) {
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const head = document.createElement('div');
    head.className = 'ctl-head';
    const lab = document.createElement('span');
    lab.textContent = L(c.label, lang);
    const val = document.createElement('span');
    val.className = 'ctl-val';
    head.append(lab, val);
    row.append(head);

    if (c.kind === 'toggle') {
      const seg = document.createElement('div');
      seg.className = 'ctl-seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', L(c.label, lang));
      const btns = (c.options || []).map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = L(o.label, lang);
        b.addEventListener('click', () => {
          sound.click();
          setParam(c.key, o.value);
        });
        seg.append(b);
        return { value: o.value, b };
      });
      row.append(seg);
      controlEls.set(c.key, { kind: 'toggle', btns, val, def: c });
    } else {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step);
      input.setAttribute('aria-label', L(c.label, lang));
      input.addEventListener('input', () => setParam(c.key, Number(input.value)));
      row.append(input);
      controlEls.set(c.key, { kind: 'range', input, val, def: c });
    }
    slot.append(row);
  }
}

function renderControlValues(snap) {
  const params = snap.params || {};
  for (const [key, el] of controlEls) {
    const v = params[key] ?? el.def.value;
    if (el.kind === 'range') {
      if (document.activeElement !== el.input) el.input.value = String(v);
      el.val.textContent = fmt(v, el.def.step);
    } else {
      const cur = el.btns.find((b) => b.value === v);
      el.btns.forEach((b) => b.b.setAttribute('aria-pressed', String(b === cur)));
      el.val.textContent = cur ? cur.b.textContent : '';
    }
  }
}

function renderDock(snap) {
  const lang = i18n.getLang();
  const act = actByNum(snap.actNum) || PROB_ACTS[0];
  $('act-title').textContent = L(act.title, lang);
  $('act-cue').textContent = L(act.cue, lang);
  const carries = L(act.carries, lang);
  const hook = L(act.hook, lang);
  $('txt-carries').textContent = carries ? `${tx('carries')}${carries}` : '';
  $('txt-carries').hidden = !carries;
  $('txt-hook').textContent = hook ? `${tx('hook')}${hook}` : '';
  $('txt-hook').hidden = !hook;

  const rel = $('txt-relates');
  rel.replaceChildren();
  const types = dictObj('relType') || {};
  for (const r of act.relates || []) {
    const chip = document.createElement('span');
    chip.className = 'qc-chip';
    const b = document.createElement('b');
    b.textContent = types[r.type] || r.type;
    chip.append(b, document.createTextNode(` ${String(r.to).replace('act-', '')} · ${L(r.why, lang)}`));
    rel.append(chip);
  }

  const key = `${act.id}:${lang}`;
  if (key !== controlsBuiltFor) {
    controlsBuiltFor = key;
    buildControls(act, lang);
  }
  renderControlValues(snap);

  const hud = snap.hud || {};
  const pill = $('hud-pill');
  pill.dataset.tone = hud.pillTone || 'teal';
  $('pill-label').textContent = hud.pillLabel || tx('result');
  $('pill-value').textContent = hud.pillValue ?? '—';
  $('readout-left').textContent = hud.readoutLeft || '';
  $('readout-right').textContent = hud.readoutRight || '';

  const grid = $('inspector-grid');
  grid.replaceChildren();
  for (const it of (hud.inspectorItems || []).slice(0, 6)) {
    const chip = document.createElement('div');
    chip.className = 'insp-chip';
    const s = document.createElement('small');
    s.textContent = it.label ?? it.k ?? '';
    const bb = document.createElement('b');
    bb.textContent = it.value ?? it.v ?? '';
    chip.append(s, bb);
    grid.append(chip);
  }
}

// ---------- Act stepper ----------
let stepperKey = '';
function buildStepper(snap) {
  const lang = i18n.getLang();
  const nav = $('act-stepper');
  const key = `${lang}:${snap.actNum}`;
  if (key === stepperKey) return;
  stepperKey = key;
  nav.replaceChildren();
  PROB_ACTS.forEach((act, idx) => {
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'act-sep';
      sep.textContent = '→';
      nav.append(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `act-tab ${snap.actNum === idx + 1 ? 'active' : ''}`;
    btn.textContent = L(act.shortTitle, lang);
    if (snap.actNum === idx + 1) btn.setAttribute('aria-current', 'step');
    btn.addEventListener('click', () => gotoAct(act.id));
    nav.append(btn);
  });
}

function gotoAct(id) {
  sound.click();
  director.jumpStage(id, { play: false, emitCamera: true });
  director.showEnd();
}

// ---------- Single-truth sync ----------
let calloutSig = '';
function syncCallouts(snap) {
  const hud = snap.hud || {};
  const fallback = (hud.inspectorItems || []).slice(0, 3).map((it) => ({
    label: it.label ?? it.k ?? '',
    sublabel: it.value ?? it.v ?? '',
  }));
  const items = stage.calloutItems(snap, fallback);
  const sig = `${snap.actNum}:${items.map((i) => i.id).join('|')}`;
  if (sig !== calloutSig) {
    calloutSig = sig;
    callouts.setItems(items);
  } else {
    for (const it of items) callouts.updateItem(it.id, { label: it.label, sublabel: it.sublabel, tone: it.tone });
  }
}

function syncAll() {
  const snap = engine.solve();
  stage.syncFromState(snap);
  syncCallouts(snap);
  buildStepper(snap);
  renderDock(snap);

  if (snap.chart) {
    const ch = snap.chart;
    chartCard.setHeader(ch.title || tx('chart'), '');
    chartCard.updateXY({ ...ch, badge: ch.badge || '' });
  }
  if (snap.maths) liveMaths.update(snap.maths);

  $('status-bar').textContent = `${snap.actId} ${snap.hud?.pillValue ?? ''}`;
  if (director) updatePlaybackUI(director.getState());
  return snap;
}

function updatePlaybackUI(st) {
  const lang = i18n.getLang();
  const mob = $('mob-play');
  if (mob) mob.textContent = st.playing ? (lang === 'en' ? 'Pause' : '暂停') : lang === 'en' ? 'Play' : '播放';
}

// ---------- Director ----------
director = new TimelineDirector({
  stages: PROB_ACTS.map((_, i) => buildStage(i)),
  autoAdvance: true,
  onStageCamera: (cam, meta) => {
    if (!urlState.thumb) stage.flyToAct(meta.stageIndex + 1, 420);
  },
  onStepChange: (st) => {
    mastery.markDone(st.stageId);
    if (director) syncAll();
  },
});

const timelineMount = mountTimelineBar($('timeline-slot'), director, {
  speeds: [0.5, 1, 2],
  showStages: false,
  showEndButton: true,
  labels: DICT[i18n.getLang()].tl,
});

director.subscribe(updatePlaybackUI);

// ---------- Wire toolbar ----------
const applyChrome = () => {
  $('view-top').querySelector('span').textContent = tx('top');
  $('view-reset').querySelector('span').textContent = tx('reset');
  $('toggle-callouts').querySelector('span').textContent = tx('callouts');
  $('toggle-sound').querySelector('span').textContent = tx('sound');
  $('mob-prev').textContent = tx('mobPrev');
  $('mob-next').textContent = tx('mobNext');
  chartCard.setHeader(tx('chart'), '');
  liveMaths.titleEl.textContent = tx('maths');
  liveMaths.subtitleEl.textContent = tx('mathsSub');
  masteryBar.refresh();
  timelineMount.setLabels(DICT[i18n.getLang()].tl);
};

$('view-top').onclick = () => {
  $('view-top').setAttribute('aria-pressed', String(stage.toggleTopView()));
};
$('view-reset').onclick = () => {
  stage.resetView();
  $('view-top').setAttribute('aria-pressed', 'false');
};
$('toggle-callouts').onclick = () => {
  const next = $('toggle-callouts').getAttribute('aria-pressed') !== 'true';
  $('toggle-callouts').setAttribute('aria-pressed', String(next));
  callouts.setEnabled(next);
};
$('toggle-sound').onclick = () => {
  const next = $('toggle-sound').getAttribute('aria-pressed') !== 'true';
  $('toggle-sound').setAttribute('aria-pressed', String(next));
  sound.setMuted(!next);
  if (next) sound.click();
};
$('mob-prev').onclick = () => {
  director.prevStage({ play: false });
  director.showEnd();
};
$('mob-next').onclick = () => {
  director.nextStage({ play: false });
  director.showEnd();
};
$('mob-play').onclick = () => {
  const st = director.getState();
  if (st.playing) director.pause();
  else if (st.stepProgress >= 0.98) director.jumpStage(st.stageIndex, { play: true, emitCamera: true });
  else director.play();
};

linkBus.onFocus((id) => stage.focusTarget(id));

mountLangSwitch($('lang-slot'), i18n, [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
]);

const paletteItems = () =>
  PROB_ACTS.map((a) => ({
    id: a.id,
    title: L(a.title, i18n.getLang()),
    subtitle: L(a.hook, i18n.getLang()),
    keywords: [a.id, L(a.shortTitle, 'zh'), L(a.shortTitle, 'en')],
  }));
const palette = new CommandPalette({
  placeholder: tx('searchPh'),
  items: paletteItems(),
  onSelect: (item) => gotoAct(item.id),
});
$('btn-palette').onclick = () => palette.open();

i18n.subscribe(() => {
  palette.setPlaceholder(tx('searchPh'));
  palette.setItems(paletteItems());
  controlsBuiltFor = '';
  stepperKey = '';
  applyChrome();
  syncAll();
});

initToolbars();
stage.stage.onFrame(() => {
  if (!urlState.thumb && callouts.items.size > 0) callouts.update();
});

// ---------- URL deep link, clock, test hooks ----------
const applied = applyUrlState(director, location.search);
if (!applied || (applied.stage === null && applied.step === null && !applied.end && !applied.paused && applied.t === null)) {
  director.jumpStage(urlState.thumb ? 'act-3' : 'act-1', { play: false });
  director.showEnd();
}

let lastClock = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastClock) / 1000);
  lastClock = now;
  director.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

applyChrome();

exposeTestHooks(director, {
  engine,
  stage,
  linkBus,
  i18n,
  mastery,
  falsify: () => {
    const result = engine.runFalsificationSuite();
    syncAll();
    return result;
  },
});
syncAll();
