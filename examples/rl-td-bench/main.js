import * as THREE from 'three';
import { CalloutLayer } from '../../kit/callout-layer.js';
import { ChartCard } from '../../kit/chart-card.js';
import { LinkBus } from '../../kit/link-bus.js';
import { FloatingPopups } from '../../kit/popups.js';
import { TactileSound } from '../../kit/sound.js';
import { IsometricStage } from '../../kit/stage-3d.js';
import {
  applyUrlState,
  exposeTestHooks,
  parseUrlState,
  TimelineDirector,
} from '../../kit/timeline-director.js';
import { initToolbars } from '../../kit/toolbar-a11y.js';
import {
  CliffInstrumentTray,
  CodeTraceCard,
  TdForkPanel,
} from '../../primitives/rl-primitives.js';
import { mountLangSwitch } from '../../shell/app-shell.js';
import { CommandPalette } from '../../shell/command-palette.js';
import { createI18n } from '../../shell/i18n.js';
import { createLocalStorage, MasteryStore } from '../../shell/storage-adapter.js';
import { ACTIONS, COLS, RL_ACTS, ROWS, TdChapterEngine } from './td-engine.js';

const $ = (id) => document.getElementById(id);
const urlState = parseUrlState(location.search);
if (urlState.thumb) {
  document.documentElement.dataset.thumb = '1';
}

const DEG = Math.PI / 180;
const DICT = {
  zh: {
    carries: '承上：',
    hook: '钩子：',
    zoomCell: '聚焦格',
    chartTitle: 'Sarsa vs Q 回报',
    top: '俯视',
    reset: '复位',
    searchPh: '搜索幕次或 TD / Sarsa / Q-learning 概念…',
  },
  en: {
    carries: 'Carries: ',
    hook: 'Hook: ',
    zoomCell: 'Focus Cell',
    chartTitle: 'Sarsa vs Q Return',
    top: 'Top',
    reset: 'Reset',
    searchPh: 'Search act or RL Ch.7 concept…',
  },
};

const i18n = createI18n({
  defaultLang: urlState.lang === 'en' ? 'en' : 'zh',
  dicts: DICT,
});

const engine = new TdChapterEngine();
engine.setParams({ lang: i18n.getLang() });
const sound = new TactileSound({ muted: urlState.thumb });
const linkBus = new LinkBus();
const mastery = new MasteryStore(createLocalStorage('simulify:rl-td:'), RL_ACTS.map((a) => a.id));

const stage = new IsometricStage($('stage-canvas'), {
  target: urlState.thumb ? [-0.1, 0.4, 0.0] : [0.95, 0.15, -0.35],
  baseSpan: 8.6,
  azimuth: 28 * DEG,
  elevation: 37 * DEG,
  zoom: urlState.thumb ? 0.96 : 0.86,
  shadowBounds: 12,
  gridSize: 28,
  onHover: (hit, x, y) => {
    const tip = $('stage-tooltip');
    if (!hit) {
      tip.hidden = true;
      stage.clearHighlightRing();
      linkBus.clearHover('3d');
      return;
    }
    if (hit.meta?.kind === 'cliff') {
      tip.textContent = hit.meta.title;
      tip.style.left = `${x + 12}px`;
      tip.style.top = `${y - 12}px`;
      tip.hidden = false;
      return;
    }
    const { row, col } = hit.meta;
    const snap = engine.solve();
    const label = snap.actNum === 1
      ? `(${row},${col}) V=${snap.vGrid[row][col].toFixed(1)}`
      : `(${row},${col}) max Q=${Math.max(...snap.qGrid[row][col]).toFixed(1)}`;
    tip.textContent = label;
    tip.style.left = `${x + 12}px`;
    tip.style.top = `${y - 12}px`;
    tip.hidden = false;
    linkBus.hover(`cell-${row}-${col}`, '3d');
  },
  onSelect: (hit) => {
    if (!hit || hit.meta?.kind === 'cliff') return;
    const { row, col } = hit.meta;
    sound.click();
    director?.pause();
    engine.setParams({ selectedCell: [row, col] });
    linkBus.select(`cell-${row}-${col}`, '3d');
    syncAll();
  },
});

const tray = new CliffInstrumentTray(stage, { rows: ROWS, cols: COLS });
const popups = new FloatingPopups(stage, $('popups-layer'));
const callouts = new CalloutLayer(stage, $('leader-svg'), $('tags-layer'));

function spawnTilePopup(cell, text, tone = 'teal') {
  if (urlState.thumb || !cell) return;
  const wp = tray.cellToWorld(cell[0], cell[1]);
  popups.spawn(new THREE.Vector3(wp.x, 0.72, wp.z), text, tone);
}
callouts.setBlockers(() => {
  const sr = $('stage-canvas').getBoundingClientRect();
  const ids = ['top-ribbon', 'right-dock', 'bottom-left-dock', 'bottom-transport'];
  const boxes = [];
  for (const id of ids) {
    const el = $(id);
    if (!el || el.hidden || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    boxes.push({
      left: r.left - sr.left - 6,
      top: r.top - sr.top - 6,
      right: r.right - sr.left + 6,
      bottom: r.bottom - sr.top + 6,
    });
  }
  return boxes;
});

const chartCard = new ChartCard($('chart-card'), {
  title: i18n.t('chartTitle'),
  mode: 'xy',
  collapsed: false,
});

const codeCard = new CodeTraceCard($('code-trace-slot'));

const forkPanel = new TdForkPanel($('fork-panel-slot'), {
  onInjectCliffDrop: () => {
    const nextProbe = !engine.forkProbeActive;
    sound.click();
    director?.pause();
    engine.resetPlaybackOverrides();
    engine.setAct('act-4');
    director.jumpStage('act-4', { play: false, emitCamera: true });
    director.showEnd();
    engine.setParams({ forkProbeActive: nextProbe });
    syncAll();
  },
  onSelectMethod: (actNum) => {
    sound.click();
    director.jumpStage(actNum - 1, { play: false, emitCamera: true });
    director.showEnd();
    syncAll();
  },
});

linkBus.onFocus((id) => {
  const m = String(id).match(/^cell-(\d+)-(\d+)$/);
  if (m) tray.focusCell(Number(m[1]), Number(m[2]), 1.38);
});

const stages = [
  // Act 1 · TD(0) Value Bootstrap Wave (4.6s)
  (() => {
    const act = RL_ACTS[0];
    return {
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
            const beats = [
              { at: 0.0, cp: 0, cf: 0.15, cell: [3, 0], arc: [3, 0], line: 2, pop: null },
              { at: 0.75, cp: 1, cf: 0.35, cell: [2, 0], arc: [2, 0], line: 3, pop: '-1' },
              { at: 1.55, cp: 2, cf: 0.55, cell: [2, 1], arc: [2, 1], line: 4, pop: 'V(s) 自举' },
              { at: 2.35, cp: 3, cf: 0.80, cell: [2, 2], arc: [2, 2], line: 5, pop: '-1' },
              { at: 3.15, cp: 4, cf: 1.00, cell: [2, 3], arc: [2, 3], line: 3, pop: 'V 更新' },
            ];
            tl.call(0, () => {
              engine.setAct(0);
              engine.resetPlaybackOverrides();
              engine.setParams({
                forkProbeActive: false,
                checkpointIdx: 0,
                curveFraction: 0.15,
                customAgentCell: [3, 0],
                customArcStart: [3, 0],
                activeCodeLineOverride: 2,
              });
              syncAll();
            });
            beats.slice(1).forEach((b) => {
              tl.add(b.at, 0.01, () => {}, {
                begin: () => {
                  engine.setParams({
                    checkpointIdx: b.cp,
                    curveFraction: b.cf,
                    customAgentCell: b.cell,
                    customArcStart: b.arc,
                    activeCodeLineOverride: b.line,
                  });
                  syncAll();
                },
              });
              tl.add(b.at, 0.01, () => {}, {
                fx: true,
                begin: () => {
                  sound.step();
                  if (b.pop) spawnTilePopup(b.cell, b.pop, 'teal');
                },
              });
            });
            tl.add(4.0, 0.6, () => {}, {
              begin: () => {
                engine.resetPlaybackOverrides();
                engine.setParams({ forkProbeActive: false, customArcStart: [2, 2] });
                syncAll();
              },
            });
          },
        },
      ],
    };
  })(),

  // Act 2 · Sarsa 4-Q Facets & Safe Corridor Unroll (4.8s)
  (() => {
    const act = RL_ACTS[1];
    return {
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
              engine.setAct(1);
              engine.resetPlaybackOverrides();
              engine.setParams({
                forkProbeActive: false,
                checkpointIdx: 0,
                pathStepCount: 2,
                curveFraction: 0.15,
                customAgentCell: [3, 0],
                activeCodeLineOverride: 2,
              });
              syncAll();
            });
            const waves = [
              { at: 0.85, cp: 1, ps: 5, cf: 0.4, cell: [1, 0], line: 3, pop: '绕开悬崖' },
              { at: 1.85, cp: 2, ps: 9, cf: 0.7, cell: [0, 3], line: 4, pop: 'Q(s,a)' },
              { at: 2.95, cp: 3, ps: 12, cf: 0.9, cell: [1, 5], line: 5, pop: null },
            ];
            waves.forEach((w) => {
              tl.add(w.at, 0.01, () => {}, {
                begin: () => {
                  engine.setParams({
                    checkpointIdx: w.cp,
                    pathStepCount: w.ps,
                    curveFraction: w.cf,
                    customAgentCell: w.cell,
                    activeCodeLineOverride: w.line,
                  });
                  syncAll();
                },
              });
              tl.add(w.at, 0.01, () => {}, {
                fx: true,
                begin: () => {
                  sound.step();
                  if (w.pop) spawnTilePopup(w.cell, w.pop, 'teal');
                },
              });
            });
            tl.add(4.0, 0.8, () => {}, {
              begin: () => {
                engine.resetPlaybackOverrides();
                engine.setParams({ forkProbeActive: false });
                syncAll();
              },
            });
            tl.add(4.0, 0.01, () => {}, {
              fx: true,
              begin: () => {
                sound.hit();
                spawnTilePopup([3, 7], '安全到达', 'teal');
              },
            });
          },
        },
      ],
    };
  })(),

  // Act 3 · n-step Horizon Glass Arc Stretch (5.2s)
  (() => {
    const act = RL_ACTS[2];
    return {
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
              engine.setAct(2);
              engine.resetPlaybackOverrides();
              engine.setParams({
                forkProbeActive: false,
                nStep: 1,
                customAgentCell: [2, 1],
                activeCodeLineOverride: 2,
              });
              syncAll();
            });
            const sweeps = [
              { at: 0.8, n: 2, cell: [2, 2], line: 3, pop: 'n=1 → n=2' },
              { at: 1.6, n: 3, cell: [2, 3], line: 3, pop: null },
              { at: 2.4, n: 4, cell: [2, 4], line: 4, pop: 'n=4 (多步回报)' },
              { at: 3.2, n: 5, cell: [2, 5], line: 5, pop: null },
            ];
            sweeps.forEach((sw, idx) => {
              tl.add(sw.at, 0.01, () => {}, {
                begin: () => {
                  engine.setParams({
                    nStep: sw.n,
                    customAgentCell: sw.cell,
                    activeCodeLineOverride: sw.line,
                  });
                  syncAll();
                },
              });
              tl.add(sw.at, 0.01, () => {}, {
                fx: true,
                begin: () => {
                  if (idx === sweeps.length - 1) sound.hit();
                  else sound.step();
                  if (sw.pop) spawnTilePopup(sw.cell, sw.pop, 'amber');
                },
              });
            });
            tl.add(4.2, 1.0, () => {}, {
              begin: () => {
                engine.resetPlaybackOverrides();
                engine.setParams({ forkProbeActive: false, nStep: 3 });
                syncAll();
              },
            });
          },
        },
      ],
    };
  })(),

  // Act 4 · Same-Seed Cliff ε-Drop Dramatic Fork (6.0s)
  (() => {
    const act = RL_ACTS[3];
    return {
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
              engine.setAct(3);
              engine.resetPlaybackOverrides();
              engine.setParams({
                forkProbeActive: false,
                pathStepCount: 2,
                curveFraction: 0.25,
                customAgentCell: [3, 0],
                activeCodeLineOverride: 2,
              });
              syncAll();
            });
            const walk = [
              { at: 0.5, cell: [2, 0], ps: 3, cf: 0.45, line: 2, snd: false },
              { at: 1.0, cell: [2, 1], ps: 5, cf: 0.65, line: 2, snd: true },
              { at: 1.5, cell: [2, 2], ps: 7, cf: 0.85, line: 3, snd: true },
              { at: 2.0, cell: [2, 3], ps: 99, cf: 1.0, line: 3, snd: true },
            ];
            walk.forEach((w) => {
              tl.add(w.at, 0.01, () => {}, {
                begin: () => {
                  engine.setParams({
                    customAgentCell: w.cell,
                    pathStepCount: w.ps,
                    curveFraction: w.cf,
                    activeCodeLineOverride: w.line,
                  });
                  syncAll();
                },
              });
              if (w.snd) {
                tl.add(w.at, 0.01, () => {}, { fx: true, begin: () => sound.step() });
              }
            });

            // Dramatic cliff plunge at 2.4s
            tl.add(2.4, 0.01, () => {}, {
              begin: () => {
                engine.setParams({
                  forkProbeActive: true,
                  customAgentCell: [3, 3],
                  activeCodeLineOverride: 3,
                });
                syncAll();
              },
            });
            tl.add(2.4, 0.01, () => {}, {
              fx: true,
              begin: () => {
                sound.evict();
                spawnTilePopup([3, 3], '-100 · Sarsa Δ=-33.9!', 'danger');
                if (!urlState.thumb) {
                  stage.flyTo({ target: [0.95, 0.2, -0.15], azimuth: 27 * DEG, elevation: 36 * DEG, zoom: 0.94 }, 420);
                }
              },
            });

            // Hold settled contrast with off-policy max callout
            tl.add(4.2, 1.8, () => {}, {
              begin: () => {
                engine.resetPlaybackOverrides();
                engine.setParams({ forkProbeActive: true });
                syncAll();
              },
            });
            tl.add(4.2, 0.01, () => {}, {
              fx: true,
              begin: () => spawnTilePopup([2, 3], 'Q 取 max: Δ=0.0', 'amber'),
            });
          },
        },
      ],
    };
  })(),

  // Act 5 · Unified Target Matrix & 6-Line Python Stepping (5.0s)
  (() => {
    const act = RL_ACTS[4];
    return {
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
              engine.setAct(4);
              engine.resetPlaybackOverrides();
              engine.setParams({
                forkProbeActive: false,
                customAgentCell: [2, 4],
                activeCodeLineOverride: 1,
                activeMethodOverride: 'td0',
              });
              syncAll();
            });
            const steps5 = [
              { at: 0.75, line: 2, meth: 'sarsa', cell: [2, 5], pop: null, snd: 'step' },
              { at: 1.5, line: 3, meth: 'sarsa', cell: [2, 6], pop: 'Sarsa target', tone: 'teal', snd: null },
              { at: 2.25, line: 4, meth: 'nstep', cell: [2, 7], pop: null, snd: 'step' },
              { at: 3.0, line: 5, meth: 'qlearn', cell: [3, 7], pop: 'Q-learn max', tone: 'amber', snd: null },
            ];
            steps5.forEach((st) => {
              tl.add(st.at, 0.01, () => {}, {
                begin: () => {
                  engine.setParams({
                    activeCodeLineOverride: st.line,
                    activeMethodOverride: st.meth,
                    customAgentCell: st.cell,
                  });
                  syncAll();
                },
              });
              tl.add(st.at, 0.01, () => {}, {
                fx: true,
                begin: () => {
                  if (st.snd === 'step') sound.step();
                  if (st.pop) spawnTilePopup(st.cell, st.pop, st.tone);
                },
              });
            });
            tl.add(3.8, 1.2, () => {}, {
              begin: () => {
                engine.resetPlaybackOverrides();
                engine.setParams({ forkProbeActive: false, customAgentCell: [3, 7] });
                syncAll();
              },
            });
            tl.add(3.8, 0.01, () => {}, {
              fx: true,
              begin: () => {
                sound.success();
                spawnTilePopup([3, 7], 'Goal! +0', 'teal');
              },
            });
          },
        },
      ],
    };
  })(),
];

const stepperEl = $('act-stepper');

function buildStepper() {
  if (!stepperEl) return;
  const lang = i18n.getLang();
  const snap = engine.solve();
  stepperEl.replaceChildren();
  RL_ACTS.forEach((act, idx) => {
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'act-sep';
      sep.textContent = '→';
      stepperEl.append(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `act-tab ${snap.actNum === act.num ? 'active' : ''}`;
    btn.textContent = act.shortTitle[lang] || act.shortTitle.zh;
    btn.onclick = () => {
      sound.click();
      director.jumpStage(act.id, { play: false, emitCamera: true });
      director.showEnd();
      syncAll();
    };
    stepperEl.append(btn);
  });
}

let director = null;
director = new TimelineDirector({
  stages,
  autoAdvance: true,
  onStageCamera: (cam) => {
    if (cam && !urlState.thumb) stage.flyTo(cam, 420);
  },
  onStepChange: (st) => {
    mastery.markDone(st.stageId);
    if (director) syncAll();
  },
});

function updatePlaybackUI(st) {
  if (!st) return;
  const lang = i18n.getLang();
  const pct = Math.max(0, Math.min(100, Math.round((st.totalProgress || 0) * 100)));
  const fill = $('play-progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  const tlBtn = $('tl-play');
  if (tlBtn) tlBtn.textContent = st.playing ? '❚❚' : '▶';
  const mobBtn = $('mob-play');
  if (mobBtn) {
    mobBtn.textContent = st.playing ? (lang === 'en' ? 'Pause' : '暂停') : (lang === 'en' ? 'Play' : '播放');
  }
}

function toggleAutoPlay() {
  sound.click();
  const st = director.getState();
  if (st.playing) {
    director.pause();
  } else if (st.stepProgress >= 0.98) {
    if (st.stageIndex === st.stageCount - 1) {
      director.jumpStage(0, { play: true, emitCamera: true });
    } else {
      director.jumpStage(st.stageIndex, { play: true, emitCamera: true });
    }
  } else {
    director.play();
  }
  updatePlaybackUI(director.getState());
}

director.subscribe(updatePlaybackUI);

function syncCalloutArc(snap) {
  const arcCoords = tray.getArcNodeTargets();
  const items = [];
  if (snap.showArc && arcCoords.length >= 2) {
    arcCoords.forEach((n, idx) => {
      if (idx === 0 || idx === arcCoords.length - 1 || idx === 1) {
        items.push({
          id: `arc-${idx}`,
          label: idx === 0 ? 's_t' : idx === arcCoords.length - 1 ? `s_{t+${idx}}` : `s_{t+1}`,
          sublabel: idx === arcCoords.length - 1 ? `n=${snap.nStep}` : '',
          tone: n.tone,
          dx: idx === 0 ? -36 : 36,
          dy: -34,
          getWorldPos: () => n.worldPos,
        });
      }
    });
  }
  callouts.setItems(items);
}

function syncAll() {
  const lang = i18n.getLang();
  const snap = engine.solve();
  const act = engine.act;

  // Thumb bake mode puts dual paths + glass n-step arc on stage cleanly
  const renderSnap = urlState.thumb
    ? { ...snap, actNum: 4, showArc: true, sarsaPath: engine.solve().sarsaPath || snap.sarsaPath, qPath: snap.qPath }
    : snap;

  tray.updateFromState(renderSnap);
  syncCalloutArc(renderSnap);
  buildStepper();

  $('val-eps').textContent = snap.epsilon.toFixed(2);
  $('val-alpha').textContent = snap.alpha.toFixed(2);
  $('val-n').textContent = String(snap.nStep);
  $('n-slider').value = String(snap.nStep);

  $('act-title').textContent = act.title[lang] || act.title.zh;
  $('act-cue').textContent = act.cue[lang] || act.cue.zh;
  $('txt-carries').textContent = act.carries[lang] || act.carries.zh;
  $('txt-hook').textContent = act.hook[lang] || act.hook.zh;
  $('btn-zoom-cell').textContent = i18n.t('zoomCell');

  forkPanel.update(snap);

  // Selected cell 4-Q chips
  const [sr, sc] = snap.selectedCell || [2, 3];
  $('inspect-cell-title').textContent =
    lang === 'en' ? `Cell (${sr},${sc}) · Q(s,a)` : `格子 (${sr},${sc}) · 四向 Q 值`;
  const qRow = snap.qGrid[sr][sc] || [0, 0, 0, 0];
  let bestA = 0;
  for (let a = 1; a < 4; a += 1) {
    if (qRow[a] > qRow[bestA] + 1e-6) bestA = a;
  }
  const qGridEl = $('cell-q-grid');
  qGridEl.replaceChildren();
  ACTIONS.forEach((sym, aIdx) => {
    const ch = document.createElement('div');
    ch.className = `cell-q-chip ${aIdx === bestA ? 'best' : ''}`;
    const v = qRow[aIdx];
    ch.textContent = `${sym} ${v <= -50 ? '-100' : v.toFixed(1)}`;
    qGridEl.append(ch);
  });

  // Update dual-trace Episode Return XY chart
  const totalPts = snap.curveTotalPoints || snap.sarsaReturns.length;
  const lastSarsa = snap.sarsaReturns[snap.sarsaReturns.length - 1] || { x: totalPts, y: snap.meanSarsa };
  const lastQ = snap.qReturns[snap.qReturns.length - 1] || { x: totalPts, y: snap.meanQ };
  chartCard.setHeader(i18n.t('chartTitle'), `ε=${snap.epsilon.toFixed(2)}`);
  chartCard.updateXY({
    badge: `S:${snap.meanSarsa} Q:${snap.meanQ}`,
    xMin: 1,
    xMax: totalPts,
    yMin: -95,
    yMax: 0,
    xLabel: lang === 'en' ? 'Episodes (×3)' : '训练回合 (×3)',
    yLabel: '',
    series: [
      { points: snap.sarsaReturns, tone: 'teal' },
      { points: snap.qReturns, tone: 'amber' },
    ],
    ghost: {
      points: [
        { x: 1, y: snap.greedyRef },
        { x: totalPts, y: snap.greedyRef },
      ],
    },
    marks: [{ axis: 'y', value: snap.greedyRef, label: 'Greedy -9', tone: 'navy' }],
    dot: {
      x: snap.forkProbeActive ? lastQ.x : lastSarsa.x,
      y: snap.forkProbeActive ? lastQ.y : lastSarsa.y,
      tone: snap.forkProbeActive ? 'danger' : 'teal',
    },
  });

  // Update Dark-slate 6-line Python trace
  codeCard.update({
    title: snap.codeTitle,
    lines: snap.codeLines,
    activeLine: snap.activeCodeLine,
    watch: `δ=${snap.fork.qDelta.toFixed(1)}`,
  });

  // Update play button & transport controls
  const tlState = director ? director.getState() : { playing: false, totalProgress: 0 };
  updatePlaybackUI(tlState);
  $('view-top').textContent = i18n.t('top');
  $('view-reset').textContent = i18n.t('reset');
  $('status-bar').textContent = `${act.shortTitle[lang] || act.shortTitle.zh} | eps=${snap.epsilon.toFixed(2)} n=${snap.nStep}`;
}

// Keep CalloutLayer projected markers locked to 3D glass arc nodes when active
stage.onFrame(() => {
  if (!urlState.thumb && callouts.items.size > 0) callouts.update();
});

// Wire controls
$('eps-dec').onclick = () => {
  sound.click();
  director.pause();
  engine.setParams({ epsilon: Math.max(0, +(engine.epsilon - 0.05).toFixed(2)) });
  syncAll();
};
$('eps-inc').onclick = () => {
  sound.click();
  director.pause();
  engine.setParams({ epsilon: Math.min(0.3, +(engine.epsilon + 0.05).toFixed(2)) });
  syncAll();
};
$('alpha-dec').onclick = () => {
  sound.click();
  director.pause();
  engine.setParams({ alpha: Math.max(0.1, +(engine.alpha - 0.1).toFixed(2)) });
  syncAll();
};
$('alpha-inc').onclick = () => {
  sound.click();
  director.pause();
  engine.setParams({ alpha: Math.min(0.9, +(engine.alpha + 0.1).toFixed(2)) });
  syncAll();
};
$('n-slider').oninput = (ev) => {
  const nextN = Number(ev.target.value);
  director.pause();
  if (engine.act.num !== 3 && engine.act.num !== 5) {
    director.jumpStage('act-3', { play: false, emitCamera: true });
    director.showEnd();
  } else {
    engine.resetPlaybackOverrides();
  }
  engine.setParams({ nStep: nextN });
  syncAll();
};
$('btn-zoom-cell').onclick = () => {
  const [r, c] = engine.selectedCell || [2, 3];
  linkBus.focus(`cell-${r}-${c}`, 'ui');
};
$('tl-prev').onclick = () => {
  sound.click();
  director.prevStage({ play: false });
  director.showEnd();
};
$('tl-next').onclick = () => {
  sound.click();
  director.nextStage({ play: false });
  director.showEnd();
};
$('tl-play').onclick = () => toggleAutoPlay();
$('mob-prev').onclick = () => {
  director.prevStage({ play: false });
  director.showEnd();
};
$('mob-next').onclick = () => {
  director.nextStage({ play: false });
  director.showEnd();
};
$('mob-play').onclick = () => toggleAutoPlay();
$('mob-probe').onclick = () => forkPanel.probeBtn.click();

$('view-top').onclick = () => {
  const top = stage.toggleTopView();
  $('view-top').setAttribute('aria-pressed', String(top));
};
$('view-reset').onclick = () => {
  stage.resetView();
  $('view-top').setAttribute('aria-pressed', 'false');
};

mountLangSwitch($('lang-slot'), i18n, [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
]);

const palette = new CommandPalette({
  placeholder: i18n.t('searchPh'),
  items: RL_ACTS.map((a) => ({
    id: a.id,
    title: a.title.zh,
    subtitle: a.hook.zh,
    keywords: [a.id, a.shortTitle.zh, a.shortTitle.en],
  })),
  onSelect: (item) => {
    director.jumpStage(item.id, { play: false, emitCamera: true });
    director.showEnd();
    syncAll();
  },
});
$('btn-palette').onclick = () => palette.open();

i18n.subscribe((lang) => {
  engine.setParams({ lang });
  palette.setPlaceholder(i18n.t('searchPh'));
  palette.setItems(
    RL_ACTS.map((a) => ({
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
    director.jumpStage('act-3', { play: false });
    director.showEnd();
  } else {
    director.jumpStage('act-1', { play: false });
    director.showEnd();
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
  engine,
  tray,
  linkBus,
  i18n,
  mastery,
  falsify: () => engine.runFalsificationSuite(),
});
syncAll();
