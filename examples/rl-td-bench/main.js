import * as THREE from 'three';
import { CalloutLayer } from '../../kit/callout-layer.js';
import { ChartCard } from '../../kit/chart-card.js';
import { ActorChoreographer } from '../../kit/choreography.js';
import { LinkBus } from '../../kit/link-bus.js';
import { LiveMathsPanel } from '../../kit/live-maths.js';
import { GridBrush } from '../../kit/manipulator.js';
import { TactileSound } from '../../kit/sound.js';
import {
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  SpacetimeClock,
} from '../../kit/spacetime.js';
import { IsometricStage } from '../../kit/stage-3d.js';
import { mountExportButton } from '../../kit/stage-exporter.js';
import {
  applyUrlState,
  exposeTestHooks,
  mountTimelineBar,
  parseUrlState,
} from '../../kit/timeline-director.js';
import { initToolbars } from '../../kit/toolbar-a11y.js';
import {
  CliffInstrumentTray,
  CodeTraceCard,
  CodeTraceSurface,
  TdForkPanel,
} from '../../primitives/rl-primitives.js';
import { mountLangSwitch } from '../../shell/app-shell.js';
import { CommandPalette } from '../../shell/command-palette.js';
import { createI18n } from '../../shell/i18n.js';
import {
  ACTIONS,
  COLS,
  EARLY_EXPLORATION_WALK,
  GOAL,
  isCliff,
  isEndpoint,
  RL_BEATS,
  ROWS,
  START,
  TdChapterEngine,
  TOTAL_DURATION,
} from './td-engine.js';

const $ = (id) => document.getElementById(id);
const lerp = (a, b, u) => a + (b - a) * clamp01(u);
const SUB_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const SUP_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const toSub = (n) => String(n).split('').map((ch) => SUB_DIGITS[Number(ch)] ?? ch).join('');
const toSup = (n) => String(n).split('').map((ch) => SUP_DIGITS[Number(ch)] ?? ch).join('');
const urlState = parseUrlState(location.search);
if (urlState.thumb) {
  document.documentElement.dataset.thumb = '1';
}

const DICT = {
  zh: {
    brand: 'RL 第 7 章 · 时序差分 4D 实验台',
    paintCliff: '涂画悬崖',
    paintingCliff: '退出涂画',
    resetCliff: '重置悬崖',
    brushHint: '涂画模式：点击或拖拽 3D 格子涂画 / 擦除 -100 悬崖（按住 Alt 随时快涂）',
    zoomCell: '聚焦格',
    top: '俯视',
    reset: '复位',
    prev: '上幕',
    play: '播放',
    pause: '暂停',
    next: '下幕',
    searchPh: '搜索 6 幕剧情或 TD / Sarsa / Q-learning…',
    chartNstepTitle: '早期信用回传 V(Start)',
    chartReturnTitle: 'Sarsa vs Q 回合回报',
    unifiedTitle: '统一 TD 更新模板',
    unifiedNote: '四个算法共用同一增量更新骨架，只在 target 估值项处分叉；点上方切换实时同步 3D 代码板。',
    sarsaLabel: 'Sarsa 安全绕行',
    qGhostLabel: 'Q 贴崖虚影',
    cliffLabel: '-100 悬崖陷阱',
    cliffSub: '踏入立刻归零回 S',
  },
  en: {
    brand: 'RL Ch.7 · Temporal Difference 4D Bench',
    paintCliff: 'Paint Cliff',
    paintingCliff: 'Done Painting',
    resetCliff: 'Reset Cliff',
    brushHint: 'Paint mode: click or drag 3D tiles to paint / erase -100 cliffs (or hold Alt anytime)',
    zoomCell: 'Focus',
    top: 'Top',
    reset: 'Reset',
    prev: 'Prev',
    play: 'Play',
    pause: 'Pause',
    next: 'Next',
    searchPh: 'Search 6 beats or TD / Sarsa / Q-learning…',
    chartNstepTitle: 'Early Credit V(Start)',
    chartReturnTitle: 'Sarsa vs Q Online Return',
    unifiedTitle: 'Unified TD Template',
    unifiedNote: 'All four TD methods share one update loop differing only in target. Switch above to trace live.',
    sarsaLabel: 'Sarsa Safe Detour',
    qGhostLabel: 'Q Cliff Ghost',
    cliffLabel: '-100 Cliff Chasm',
    cliffSub: 'Resets immediately to S',
  },
};

const UNIFIED_CODES = {
  td0: {
    title: 'Python · TD(0) State Value',
    lines: [
      'def td0_step(s, r, s2):',
      '    v_next = V[s2]',
      '    target = r + gamma * v_next',
      '    delta = target - V[s]',
      '    V[s] += alpha * delta',
      '    return delta',
    ],
    lineLinks: ['td-vs', 'td-vs-next', 'td-target', 'td-delta', 'td-vs', 'td-delta'],
  },
  sarsa: {
    title: 'Python · On-Policy Sarsa',
    lines: [
      'def sarsa_step(s, a, r, s2, a2):',
      '    q_next = Q[s2, a2]  # actual A\'',
      '    target = r + gamma * q_next',
      '    delta = target - Q[s, a]',
      '    Q[s, a] += alpha * delta',
      '    return delta',
    ],
    lineLinks: ['td-vs', 'fork-sarsa', 'fork-sarsa', 'td-delta', 'td-vs', 'td-delta'],
  },
  nstep: {
    title: 'Python · n-step TD Return',
    lines: [
      'def nstep_step(S, R, tau, n):',
      '    G = sum(gamma**k * R[tau+k+1] for k in range(n))',
      '    G += (gamma**n) * V[S[tau + n]]',
      '    delta = G - V[S[tau]]',
      '    V[S[tau]] += alpha * delta',
      '    return G',
    ],
    lineLinks: ['td-vs', 'td-target', 'td-vs-next', 'td-delta', 'td-vs', 'td-target'],
  },
  qlearn: {
    title: 'Python · Unified td_step()',
    lines: [
      'def td_step(s, a, r, s2, a2, mode):',
      '    if mode == "sarsa":',
      '        target = r + gamma * Q[s2, a2]',
      '    else:  # q-learning off-policy max',
      '        target = r + gamma * max(Q[s2])',
      '    Q[s, a] += alpha * (target - Q[s, a])',
    ],
    lineLinks: ['td-vs', 'fork-sarsa', 'fork-sarsa', 'fork-q', 'fork-q', 'td-delta'],
  },
};

const CODE_SLATE_POS = [7.85, 2.25, -1.35];

async function bootstrap() {
  const i18n = createI18n({
    defaultLang: urlState.lang === 'en' ? 'en' : 'zh',
    dicts: DICT,
  });

  const engine = new TdChapterEngine();
  engine.setParams({ lang: i18n.getLang() });
  const sound = new TactileSound({ muted: Boolean(urlState.thumb || urlState.exportMode) });
  const linkBus = new LinkBus();

  // Interactive runtime state (separate from pure clock state)
  let hoveredCell = null;
  let userProbeOverride = null; // null = follow timeline beat 5 auto-slip; boolean = user explicit toggle
  let unifiedMethod = 'qlearn';
  let activeLinkTarget = null;
  let mobileCodeCard = null;

  // 1. Create Simulify v2 IsometricStage (WebGPU -> WebGL2 auto-fallback, native HTML-in-Canvas ready)
  const initCam = RL_BEATS[0].camera;
  const stage = await IsometricStage.create($('stage-canvas'), {
    target: urlState.thumb ? [0.1, 0.35, 0.05] : initCam.target,
    baseSpan: 8.4,
    azimuth: initCam.azimuth,
    elevation: initCam.elevation,
    zoom: urlState.thumb ? 0.94 : initCam.zoom,
    shadowBounds: 12,
    gridSize: 28,
    onHover: (hit, x, y) => {
      const tip = $('stage-tooltip');
      if (!hit || !hit.meta || hit.meta.row === undefined) {
        tip.hidden = true;
        hoveredCell = null;
        stage.clearHighlightRing();
        linkBus.clearHover('3d');
        return;
      }
      const { row, col } = hit.meta;
      hoveredCell = [row, col];
      const t = clock.t;
      const beat = clock.getBeatAt(t);
      const snap = engine.solve(computeEpisodeForTime(t, beat));
      const cliffHere = isCliff(row, col, engine.cliffMask);
      let label = `(${row},${col})`;
      if (row === START[0] && col === START[1]) {
        label = i18n.getLang() === 'en' ? 'Start S (3,0)' : '起点 S (3,0)';
      } else if (row === GOAL[0] && col === GOAL[1]) {
        label = i18n.getLang() === 'en' ? 'Goal G (+10)' : '终点 G (+10)';
      } else if (cliffHere && (beat.index >= 2 || engine.isCustomCliff())) {
        label = i18n.getLang() === 'en' ? `(${row},${col}) Cliff -100` : `(${row},${col}) 悬崖 -100`;
      } else if (beat.index === 1) {
        label = `(${row},${col}) V=${snap.vGrid[row][col].toFixed(2)}`;
      } else if (beat.index >= 2) {
        const qRow = snap.qGrid[row][col];
        label = `(${row},${col}) max Q=${Math.max(...qRow).toFixed(1)}`;
      }
      tip.textContent = label;
      tip.style.left = `${x + 12}px`;
      tip.style.top = `${y - 12}px`;
      tip.hidden = false;
      linkBus.hover(`cell-${row}-${col}`, '3d');
      syncAll(t);
    },
    onViewChange: () => {
      codeSurface.syncPose(stage.camera, CODE_SLATE_POS);
      callouts.update();
    },
  });

  // 2. Build 3D Anodized Instrument Tray & Diegetic 3D HTML-in-Canvas Code Trace Slate
  const tray = new CliffInstrumentTray(stage, { rows: ROWS, cols: COLS });
  const codeSurface = new CodeTraceSurface(stage, {
    id: 'code-trace-3d',
    linkBus,
    worldWidth: 4.95,
    worldHeight: 2.3,
  });

  // Mobile flat fallback card (only displayed <= 900px)
  mobileCodeCard = new CodeTraceCard($('mobile-code-slot'), { linkBus, surfaceMode: false });

  // 3. Build Direct Manipulation GridBrush (paint/erase custom cliffs directly in 3D!)
  let brushActive = false;
  const brush = new GridBrush(stage, {
    targets: tray.getBrushTargets(),
    active: false,
    holdModifier: 'altKey',
    onStrokeStart: (cell) => {
      if (isEndpoint(cell.row, cell.col)) return null;
      clock.pause();
      if (!engine.hasCounterfactualGhost()) {
        engine.captureCounterfactualGhost(i18n.getLang() === 'en' ? 'Original Layout' : '原悬崖布局');
      }
      return !engine.cliffMask[cell.row][cell.col];
    },
    onPaintCell: (cell, { strokeValue }) => {
      if (strokeValue === null || strokeValue === undefined) return;
      if (isEndpoint(cell.row, cell.col)) return;
      const changed = engine.toggleCliffCell(cell.row, cell.col, {
        captureGhost: false,
        forceValue: strokeValue,
      });
      if (changed) {
        sound.click();
        syncAll(clock.t);
        stage.renderNow();
      }
    },
    onClickCell: (cell) => {
      if (isCliff(cell.row, cell.col, engine.cliffMask)) return;
      sound.click();
      engine.setForkCell(cell.row, cell.col);
      linkBus.select(`cell-${cell.row}-${cell.col}`, '3d');
      syncAll(clock.t);
      stage.renderNow();
    },
  });

  // 4. Build CalloutLayer, LiveMathsPanel, ChartCard, TdForkPanel
  const callouts = new CalloutLayer(stage, $('leader-svg'), $('tags-layer'));
  callouts.setBlockers(() => {
    const sr = $('stage-canvas').getBoundingClientRect();
    const ids = ['top-ribbon', 'beat-caption-pill', 'right-dock', 'bottom-left-dock', 'bottom-transport'];
    const boxes = [];
    for (const id of ids) {
      const el = $(id);
      if (!el || el.hidden || el.dataset.hudHidden === 'true' || getComputedStyle(el).display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes.push({
        left: r.left - sr.left - 8,
        top: r.top - sr.top - 8,
        right: r.right - sr.left + 8,
        bottom: r.bottom - sr.top + 8,
      });
    }
    return boxes;
  });

  const liveMaths = new LiveMathsPanel($('td-maths-slot'), {
    title: 'TD(0) 增量更新',
    subtitle: 'V(S) ← V(S) + α[R + γV(S\') − V(S)]',
    collapsed: false,
    linkBus,
  });

  const forkPanel = new TdForkPanel($('fork-panel-slot'), {
    linkBus,
    onInjectCliffDrop: () => {
      sound.click();
      clock.pause();
      const curProbe = getEffectiveForkProbe(clock.t);
      userProbeOverride = !curProbe;
      engine.setParams({ forkProbeActive: userProbeOverride });
      syncAll(clock.t);
      stage.renderNow();
    },
    onSelectMethod: (beatIdx, methodId) => {
      sound.click();
      unifiedMethod = methodId;
      clock.jumpToBeat(beatIdx, { play: false, offset: 2.2 });
    },
  });

  const chartCard = new ChartCard($('chart-card'), {
    title: i18n.t('chartReturnTitle'),
    mode: 'xy',
    collapsed: false,
    onScrub: (xNorm, _val, meta) => {
      if (!meta?.dragging) return;
      clock.pause();
      const beat = clock.getBeatAt(clock.t);
      if (beat.index === 3) {
        // Scrub within Beat 4 early credit progression (22.4s .. 29.4s)
        clock.seek(22.4 + xNorm * 7.0);
      } else {
        // Scrub continuously across Beat 2..Beat 5 training trajectory
        const targetEp = Math.max(1, Math.round(xNorm * engine.episodes));
        engine.setParams({ episodeCursor: targetEp });
        syncAll(clock.t);
        stage.renderNow();
      }
    },
  });

  // 5. Configure Single Master SpacetimeClock (0s .. 44s, 6 progressive beats)
  const buildClockBeats = (lang) =>
    RL_BEATS.map((b) => ({
      id: b.id,
      stageId: b.id,
      stageTitle: b.shortTitle[lang] || b.shortTitle.zh,
      title: b.title[lang] || b.title.zh,
      start: b.start,
      end: b.end,
      summary: b.cue[lang] || b.cue.zh,
      carries: b.carries[lang] || b.carries.zh,
      hook: b.hook[lang] || b.hook.zh,
      camera: b.camera,
    }));

  const clock = new SpacetimeClock({
    duration: TOTAL_DURATION,
    speed: 1,
    loop: false,
    playing: false,
    defaultFps: 60,
    beats: buildClockBeats(i18n.getLang()),
  });

  // 6. Configure ActorChoreographer (TRUE t=0 sparsity: ONLY 3 actors visible at t=0!)
  const choreographer = new ActorChoreographer({ initialCamera: RL_BEATS[0].camera });

  // 3 Initial sparse actors visible at t = 0
  choreographer.register('base-deck', tray.deckGroup, { initiallyVisible: true });
  choreographer.register('start-goal', tray.endpointsGroup, { initiallyVisible: true });
  choreographer.register('agent-puck', tray.puckGroup, { initiallyVisible: true });

  // Progressive 3D & HUD actors (ALL hidden at t = 0!)
  choreographer
    .register('walk-trail', tray.walkTrailGroup, { initiallyVisible: false })
    .enter('walk-trail', 1.0, 0.45, 'fade')
    .exit('walk-trail', 7.0, 0.4, 'fade');

  choreographer
    .register('td-wavefront', tray.wavefrontGroup, { initiallyVisible: false })
    .enter('td-wavefront', 7.15, 0.5, 'fade')
    .exit('td-wavefront', 15.05, 0.4, 'fade');

  choreographer.hudReveal('right-dock', 7.3, 0.55, { el: $('right-dock'), from: [18, 0, 0] });

  // Progressive top-bar control disclosure (zero spoilers in Beat 1!)
  choreographer.hudReveal('pill-alpha', 7.2, 0.4, { el: $('pill-alpha'), from: [0, -6, 0], countInSparsity: false });
  choreographer.hudReveal('btn-paint-cliff', 15.4, 0.4, { el: $('btn-paint-cliff'), from: [0, -6, 0], countInSparsity: false });
  choreographer.hudReveal('pill-eps', 15.4, 0.4, { el: $('pill-eps'), from: [0, -6, 0], countInSparsity: false });
  choreographer.hudReveal('pill-n', 22.4, 0.4, { el: $('pill-n'), from: [0, -6, 0], countInSparsity: false });

  choreographer
    .register('cliff-chasm', tray.chasmSignGroup, { initiallyVisible: false })
    .enter('cliff-chasm', 15.6, 0.8, 'fade');

  choreographer
    .register('nstep-arc', tray.arcGroup, { initiallyVisible: false })
    .enter('nstep-arc', 22.15, 0.65, 'rise', { distance: 0.35 })
    .exit('nstep-arc', 29.75, 0.35, 'fade')
    .enter('nstep-arc', 38.15, 0.65, 'rise', { distance: 0.35 });

  choreographer.hudReveal('bottom-left-dock', 22.6, 0.55, { el: $('bottom-left-dock'), from: [0, 14, 0] });

  choreographer
    .register('sarsa-ribbon', tray.sarsaRibbonGroup, { initiallyVisible: false })
    .enter('sarsa-ribbon', 30.1, 0.6, 'fade');

  choreographer
    .register('q-ghost-ribbon', tray.qGhostRibbonGroup, { initiallyVisible: false })
    .enter('q-ghost-ribbon', 30.55, 0.6, 'fade');

  choreographer
    .register('code-surface', codeSurface.surface, {
      kind: 'surface',
      initiallyVisible: false,
      restPos: CODE_SLATE_POS,
      onApply: (st) => {
        const isMobile = window.innerWidth <= 900;
        const show3d = st.visible && !isMobile && !urlState.thumb;
        codeSurface.setChoreoState({ ...st, visible: show3d });
        if (show3d) {
          codeSurface.syncPose(stage.camera, [st.pos[0], st.pos[1], st.pos[2]]);
        }
      },
    })
    .enter('code-surface', 38.2, 0.65, 'rise', { distance: 0.4 });

  choreographer
    .register('code-tether', tray.tetherGroup, { initiallyVisible: false })
    .enter('code-tether', 38.55, 0.45, 'fade');

  // Camera choreography beats
  for (let i = 1; i < RL_BEATS.length; i += 1) {
    choreographer.cameraBeat(RL_BEATS[i].start, 1.35, RL_BEATS[i].camera);
  }

  // Callout reveal windows
  choreographer.calloutReveal('cliff-lbl', 16.4, 0.4, { exitAt: 21.8, exitDur: 0.3 });
  choreographer.calloutReveal('arc-0', 22.8, 0.4, { exitAt: 29.6, exitDur: 0.3 });
  choreographer.calloutReveal('arc-end', 22.9, 0.4, { exitAt: 29.6, exitDur: 0.3 });
  choreographer.calloutReveal('sarsa-lbl', 30.8, 0.4, { exitAt: 37.8, exitDur: 0.3 });
  choreographer.calloutReveal('q-lbl', 31.0, 0.4, { exitAt: 37.8, exitDur: 0.3 });
  callouts.setChoreographer(choreographer);

  // 7. Helper: Pure Continuous Computations from Master Clock `t`
  function computeEpisodeForTime(t, beat) {
    const u = beat.localProgress;
    if (beat.index === 0) return 0;
    if (beat.index === 1) return lerp(1, 96, easeInOutCubic(u));
    if (beat.index === 2) return lerp(24, 185, easeInOutCubic(u));
    if (beat.index === 3) return lerp(2, 56, clamp01((t - 22.4) / 6.8));
    return engine.episodes;
  }

  function getEffectiveForkProbe(t) {
    if (userProbeOverride !== null) return userProbeOverride;
    // Dramatic auto cliff-slip window inside Beat 5 (33.5s .. 36.8s)
    return t >= 33.5 && t <= 36.8;
  }

  function sampleCellPathSmooth(cells, progress) {
    if (!cells || cells.length === 0) return { row: START[0], col: START[1] };
    if (cells.length === 1) return { row: cells[0][0], col: cells[0][1] };
    const u = clamp01(progress) * (cells.length - 1);
    const idx = Math.min(cells.length - 2, Math.floor(u));
    const frac = u - idx;
    const pA = tray.getTileWorldPos(cells[idx][0], cells[idx][1]);
    const pB = tray.getTileWorldPos(cells[idx + 1][0], cells[idx + 1][1]);
    const hop = Math.sin(frac * Math.PI) * 0.11;
    return {
      x: lerp(pA.x, pB.x, frac),
      y: lerp(pA.y, pB.y, frac) + 0.068 + hop,
      z: lerp(pA.z, pB.z, frac),
      cell: frac < 0.5 ? cells[idx] : cells[idx + 1],
    };
  }

  // Beat 2 backward TD(0) steps walking backward from Goal toward Start
  const TD_BACKWARD_STEPS = [
    { s: [2, 7], sNext: [3, 7], r: 10 },
    { s: [2, 6], sNext: [2, 7], r: -1 },
    { s: [2, 5], sNext: [2, 6], r: -1 },
    { s: [2, 4], sNext: [2, 5], r: -1 },
    { s: [2, 3], sNext: [2, 4], r: -1 },
    { s: [2, 2], sNext: [2, 3], r: -1 },
  ];

  // LinkBus bi-directional synchronization (formula/code hover <-> 3D board highlight!)
  linkBus.onHover((id) => {
    activeLinkTarget = id;
    syncAll(clock.t);
    stage.renderNow();
  });
  linkBus.onFocus((id) => {
    const m = String(id).match(/^cell-(\d+)-(\d+)$/);
    if (m) tray.focusCell(Number(m[1]), Number(m[2]), 1.36);
  });

  // 8. Master Pure Deterministic `syncAll(t)` Function
  let lastCalloutKey = '';

  function syncAll(t = clock.t) {
    const time = Math.max(0, Math.min(TOTAL_DURATION, Number(t) || 0));
    const lang = i18n.getLang();
    const beat = clock.getBeatAt(time);
    const beatNum = beat.index + 1;
    const actMeta = RL_BEATS[beat.index] || RL_BEATS[0];
    const u = beat.localProgress;

    // Evaluate choreographer purely at `time` (actors, HUD progressive reveals, camera)
    const choreoState = choreographer.evaluate(time, { apply: true, stage });

    // Compute exact continuous episode & solve engine
    const epFloat = computeEpisodeForTime(time, beat);
    const effectiveProbe = beatNum === 5 ? getEffectiveForkProbe(time) : Boolean(userProbeOverride);
    engine.actIndex = beat.index;
    engine.forkProbeActive = effectiveProbe;
    const snap = engine.solve(epFloat);

    // Derive continuous visual parameters purely from `time`
    let tileMode = 'clean';
    let qMorph = 0;
    let cliffCarve = engine.isCustomCliff() ? 1 : 0;
    let vLiftStrength = 0;
    let walkProgress = 0;
    let wavefront = null;
    let arcReveal = 0;
    let arcPulsePhase = 0;
    let puckPos = null;
    let puckTone = 'teal';
    let slipProbe = null;
    let tdStepPair = TD_BACKWARD_STEPS[0];

    if (beatNum === 1) {
      tileMode = 'clean';
      walkProgress = clamp01((time - 1.0) / 5.4);
      puckPos = sampleCellPathSmooth(EARLY_EXPLORATION_WALK, walkProgress);
      puckTone = walkProgress > 0.94 ? 'amber' : 'teal';
    } else if (beatNum === 2) {
      tileMode = 'v';
      vLiftStrength = easeOutCubic(clamp01((time - 7.3) / 1.1));
      const cycleFloat = u * TD_BACKWARD_STEPS.length;
      const stepIdx = Math.min(TD_BACKWARD_STEPS.length - 1, Math.floor(cycleFloat));
      const phase = cycleFloat - stepIdx;
      tdStepPair = TD_BACKWARD_STEPS[stepIdx];
      wavefront = {
        fromCell: tdStepPair.sNext,
        toCell: tdStepPair.s,
        phase,
      };
      puckPos = { row: tdStepPair.s[0], col: tdStepPair.s[1] };
      puckTone = 'teal';
    } else if (beatNum === 3) {
      tileMode = 'q';
      qMorph = easeOutCubic(clamp01((time - 15.0) / 1.3));
      cliffCarve = engine.isCustomCliff() ? 1 : easeInOutCubic(clamp01((time - 15.4) / 2.0));
      vLiftStrength = 1 - easeInOutCubic(clamp01((time - 15.0) / 1.1));
      const safeDemoPath = snap.convergedSarsaPath.slice(0, Math.min(8, snap.convergedSarsaPath.length));
      puckPos = sampleCellPathSmooth(safeDemoPath, clamp01((time - 15.8) / 5.4));
      puckTone = 'teal';
    } else if (beatNum === 4) {
      tileMode = 'q';
      qMorph = 1;
      cliffCarve = 1;
      arcReveal = easeOutCubic(clamp01((time - 22.2) / 1.1));
      arcPulsePhase = ((time - 22.2) * 0.45) % 1;
      puckPos = sampleCellPathSmooth(snap.arcNodes, clamp01((time - 22.5) / 6.6));
      puckTone = 'amber';
    } else if (beatNum === 5) {
      tileMode = 'q';
      qMorph = 1;
      cliffCarve = 1;
      const forkApproach = [START, [2, 0], [2, 1], [2, 2], snap.fork.forkCell];
      const approachU = clamp01((time - 30.0) / 2.4);
      puckPos = approachU < 0.999
        ? sampleCellPathSmooth(forkApproach, approachU)
        : { row: snap.fork.forkCell[0], col: snap.fork.forkCell[1] };
      puckTone = effectiveProbe ? 'amber' : 'teal';

      if (effectiveProbe && snap.fork.cliffTargetCell) {
        const slipProgress = userProbeOverride !== null
          ? 0.92
          : clamp01((time - 33.5) / 0.8);
        slipProbe = {
          active: true,
          fromCell: snap.fork.forkCell,
          toCell: snap.fork.cliffTargetCell,
          progress: slipProgress,
        };
      }
    } else {
      // Beat 6: Unified View & Diegetic 3D HTML-in-Canvas Code Trace
      tileMode = 'q';
      qMorph = 1;
      cliffCarve = 1;
      arcReveal = 1;
      arcPulsePhase = ((time - 38.2) * 0.4) % 1;
      const activeWalk = unifiedMethod === 'sarsa' ? snap.convergedSarsaPath : snap.convergedQPath;
      puckPos = sampleCellPathSmooth(activeWalk, clamp01((time - 38.4) / 4.8));
      puckTone = unifiedMethod === 'sarsa' ? 'teal' : 'amber';
    }

    // If user painted a custom cliff early, keep chasm signage visible immediately
    if (engine.isCustomCliff()) {
      tray.chasmSignGroup.visible = true;
    }

    // Resolve bidirectional LinkBus highlights onto 3D tiles
    let linkSrcCell = null;
    let linkDstCell = null;
    if (activeLinkTarget === 'td-vs') {
      linkSrcCell = beatNum === 2 ? tdStepPair.s : snap.fork.prevCell;
    } else if (activeLinkTarget === 'td-vs-next') {
      linkDstCell = beatNum === 2 ? tdStepPair.sNext : snap.fork.forkCell;
    } else if (activeLinkTarget === 'td-delta' || activeLinkTarget === 'td-target') {
      linkSrcCell = beatNum === 2 ? tdStepPair.s : snap.fork.prevCell;
      linkDstCell = beatNum === 2 ? tdStepPair.sNext : snap.fork.forkCell;
    } else if (activeLinkTarget === 'fork-sarsa' || activeLinkTarget === 'fork-q') {
      linkDstCell = snap.fork.forkCell;
      linkSrcCell = snap.fork.prevCell;
    }

    // Sync diegetic 3D code slate pose & tether target
    const activeCellForTether = puckPos?.cell || snap.fork.forkCell || [2, 3];
    const tetherWorldTarget = codeSurface.syncPose(
      stage.camera,
      choreoState.actorStates['code-surface']?.pos || CODE_SLATE_POS
    );
    const show3dCode = Boolean(choreoState.actorStates['code-surface']?.visible && window.innerWidth > 900 && !urlState.thumb);

    // Custom counterfactual ghost path (from previous cliff layout before GridBrush edits!)
    const ghostMeta = engine.getGhostMeta();
    const customGhostPath = ghostMeta && engine.isCustomCliff() ? ghostMeta.qPath : null;
    tray.customGhostGroup.visible = Boolean(customGhostPath && cliffCarve > 0.3);

    // Update 3D Instrument Tray deterministically
    tray.updateFromRenderState({
      t: time,
      beatNum,
      tileMode,
      qMorph,
      cliffCarve,
      vLiftStrength,
      cliffMask: engine.cliffMask,
      vGrid: snap.vGrid,
      qGrid: snap.qGrid,
      selectedCell: beatNum >= 3 ? snap.selectedCell : null,
      hoveredCell,
      forkCell: snap.fork.forkCell,
      linkSrcCell,
      linkDstCell,
      walkTrailCells: beatNum === 1 ? EARLY_EXPLORATION_WALK : null,
      walkProgress,
      wavefront,
      arcNodes: snap.arcNodes,
      arcReveal,
      arcPulsePhase,
      sarsaPath: snap.convergedSarsaPath,
      qPath: snap.convergedQPath,
      customGhostPath,
      puckPos,
      puckTone,
      slipProbe,
      tether: {
        visible: show3dCode,
        fromCell: activeCellForTether,
        toWorld: tetherWorldTarget,
      },
      lang,
    });

    // Update CalloutLayer anchors cleanly
    syncCallouts(snap, beatNum, lang);

    // Update Top Ribbon & Floating Beat Caption
    $('brand-title').textContent = i18n.t('brand');
    $('beat-chip').textContent = `${beatNum}/6`;
    $('act-title').textContent = actMeta.title[lang] || actMeta.title.zh;
    $('act-cue').textContent = actMeta.cue[lang] || actMeta.cue.zh;
    const epTag = $('beat-ep-tag');
    if (beatNum === 1) {
      epTag.hidden = true;
    } else {
      epTag.hidden = false;
      epTag.textContent = `ep ${Math.round(epFloat)}/${engine.episodes}`;
    }

    $('val-eps').textContent = engine.epsilon.toFixed(2);
    $('val-alpha').textContent = engine.alpha.toFixed(2);
    $('val-n').textContent = String(engine.nStep);
    $('lbl-paint-cliff').textContent = brushActive ? i18n.t('paintingCliff') : i18n.t('paintCliff');
    $('btn-paint-cliff').setAttribute('aria-pressed', String(brushActive));
    $('btn-reset-cliff').hidden = !engine.isCustomCliff();
    $('btn-reset-cliff').textContent = i18n.t('resetCliff');
    $('brush-banner').hidden = !brushActive;
    $('brush-banner').textContent = i18n.t('brushHint');

    // Update Right Contextual Dock content cleanly per beat (ZERO wall dump!)
    const mathsSlot = $('td-maths-slot');
    const forkSlot = $('fork-panel-slot');
    const unifiedSlot = $('unified-slot');
    const cellInsp = $('cell-inspector');

    mathsSlot.hidden = beatNum < 2 || beatNum > 4;
    forkSlot.hidden = beatNum !== 5;
    unifiedSlot.hidden = beatNum !== 6;
    cellInsp.hidden = beatNum < 3 || beatNum > 4;

    if (beatNum === 2) {
      // Compact single-formula TD(0) live card wired to LinkBus
      const [sr, sc] = tdStepPair.s;
      const [nr, nc] = tdStepPair.sNext;
      const vS = snap.vGrid[sr][sc];
      const vNext = (nr === GOAL[0] && nc === GOAL[1]) ? 0 : snap.vGrid[nr][nc];
      const target = tdStepPair.r + engine.gamma * vNext;
      const delta = target - vS;
      liveMaths.titleEl.textContent = lang === 'en' ? 'TD(0) Live Update' : 'TD(0) 实时单步公式';
      liveMaths.update({
        badge: `S=(${sr},${sc})`,
        subtitle: lang === 'en' ? 'Hover terms to highlight 3D tiles' : '悬停公式项高亮 3D 对应格',
        equations: [
          {
            label: lang === 'en' ? 'Symbolic Rule' : '增量更新律',
            tokens: [
              { text: 'V(S)', tone: 'teal', emph: true, linkId: 'td-vs' },
              { text: ' ← ' },
              { text: 'V(S)', tone: 'teal', linkId: 'td-vs' },
              { text: ' + α[' },
              { text: 'R + γV(S\')', tone: 'amber', emph: true, linkId: 'td-vs-next' },
              { text: ' − ' },
              { text: 'V(S)', tone: 'teal', linkId: 'td-vs' },
              { text: ']' },
            ],
          },
          {
            label: lang === 'en' ? 'Live Substitution' : '实时数值代入',
            tokens: [
              { text: `${vS.toFixed(2)}`, tone: 'teal', linkId: 'td-vs' },
              { text: ` + ${engine.alpha.toFixed(1)}×[` },
              { text: `${tdStepPair.r >= 0 ? '+' : ''}${tdStepPair.r} + ${engine.gamma.toFixed(2)}×${vNext.toFixed(1)}`, tone: 'amber', linkId: 'td-vs-next' },
              { text: ` − ${vS.toFixed(1)}] ` },
              { text: `δ=${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`, tone: delta >= 0 ? 'teal' : 'danger', emph: true, linkId: 'td-delta' },
            ],
          },
        ],
      });
    } else if (beatNum === 3) {
      const [sr, sc] = snap.selectedCell || [2, 3];
      const qRow = snap.qSarsa[sr][sc];
      const bestA = qRow.indexOf(Math.max(...qRow));
      liveMaths.titleEl.textContent = lang === 'en' ? '4-Action Q(s, a) Facets' : '四向动作价值 Q(s, a)';
      liveMaths.update({
        badge: `(${sr},${sc}) ${ACTIONS[bestA]}`,
        subtitle: lang === 'en' ? 'Scalar V(s) splits into 4 directions' : '单格标量拆分为四向动作决策',
        equations: [
          {
            label: lang === 'en' ? 'Action-Value Backup' : '动作价值回传',
            tokens: [
              { text: 'Q(S,A)', tone: 'teal', emph: true, linkId: 'td-vs' },
              { text: ' ← Q + α[' },
              { text: 'R + γQ(S\',A\')', tone: 'amber', emph: true, linkId: 'td-vs-next' },
              { text: ' − Q]' },
            ],
          },
        ],
        breakdown: [
          {
            tag: '-100',
            tone: 'danger',
            text: lang === 'en' ? 'Downward cliff facets turn crimson immediately' : '面向悬崖的 ↓ 扇区瞬间吸收 -100 警示变红',
          },
        ],
      });
      renderCellInspector(snap, lang);
    } else if (beatNum === 4) {
      const fNow = engine.sampleAtEpisode(epFloat);
      const nSub = toSub(engine.nStep);
      const nSup = toSup(engine.nStep);
      liveMaths.titleEl.textContent = lang === 'en' ? `n-step Return (n=${engine.nStep})` : `n 步截断回报 (n=${engine.nStep})`;
      liveMaths.update({
        badge: `G=${snap.nStepTarget.toFixed(1)}`,
        subtitle: lang === 'en' ? 'Chains n real rewards before bootstrapping' : '先累加 n 步真实回报再自举',
        equations: [
          {
            label: lang === 'en' ? 'Truncated Horizon' : '多步回报目标',
            tokens: [
              { text: `Gₜ:ₜ₊${nSub}`, tone: 'amber', emph: true, linkId: 'td-target' },
              { text: ' = Σ γᵏ R + ' },
              { text: `γ${nSup} V(Sₜ₊${nSub})`, tone: 'teal', emph: true, linkId: 'td-vs-next' },
            ],
          },
        ],
        breakdown: [
          {
            tag: `n=${engine.nStep}`,
            tone: 'teal',
            text: `V(Start) = ${fNow.nStepStartV.toFixed(2)}  (vs n=1: ${fNow.n1StartV.toFixed(2)})`,
          },
        ],
      });
      renderCellInspector(snap, lang);
    } else if (beatNum === 5) {
      forkPanel.update(snap);
    } else if (beatNum === 6) {
      $('unified-title').textContent = i18n.t('unifiedTitle');
      $('unified-note').textContent = i18n.t('unifiedNote');
      $('unified-tabs').querySelectorAll('.unified-tab').forEach((btn) => {
        btn.setAttribute('aria-pressed', String(btn.dataset.method === unifiedMethod));
      });
      const diffBadge = $('ghost-diff-badge');
      if (ghostMeta && engine.isCustomCliff()) {
        const oldSteps = ghostMeta.qPath.length - 1;
        const newSteps = snap.convergedQPath.length - 1;
        diffBadge.hidden = false;
        diffBadge.textContent = lang === 'en'
          ? `Ghost ${oldSteps} steps → New ${newSteps} steps (${newSteps - oldSteps >= 0 ? '+' : ''}${newSteps - oldSteps})`
          : `原布局 ${oldSteps} 步 → 现布局 ${newSteps} 步 (${newSteps - oldSteps >= 0 ? '+' : ''}${newSteps - oldSteps})`;
      } else {
        diffBadge.hidden = true;
      }
    }

    // Update Bottom-Left ChartCard (Revealed in Beat 4+)
    if (beatNum >= 4) {
      updateChart(snap, beatNum, epFloat, lang);
    }

    // Update Diegetic 3D HTML-in-Canvas Python Code Trace (Beat 6) + Mobile fallback
    const codeSpec = UNIFIED_CODES[unifiedMethod] || UNIFIED_CODES.qlearn;
    const stepCycle = Math.floor(((time - 38.0) * 1.15) % codeSpec.lines.length);
    const activeLine = beatNum === 6
      ? (stepCycle + 1)
      : (actMeta.activeCodeLine || 3);
    const watchStr = unifiedMethod === 'td0'
      ? `V=${snap.vGrid[snap.fork.forkCell[0]][snap.fork.forkCell[1]].toFixed(1)}`
      : `δ=${(unifiedMethod === 'sarsa' ? snap.fork.sarsaDelta : snap.fork.qDelta).toFixed(1)}`;

    const codePayload = {
      title: codeSpec.title,
      lines: codeSpec.lines,
      activeLine,
      watch: watchStr,
      lineLinks: codeSpec.lineLinks,
    };
    codeSurface.update(codePayload);
    mobileCodeCard.update(codePayload);
    $('mobile-code-slot').hidden = beatNum < 6;

    // Sync view controls & screen-reader status
    $('view-top').textContent = i18n.t('top');
    $('view-reset').textContent = i18n.t('reset');
    $('mob-play').textContent = clock.playing ? i18n.t('pause') : i18n.t('play');
    $('mob-paint').textContent = brushActive ? `✓ ${i18n.t('paintingCliff')}` : `🖌 ${i18n.t('paintCliff')}`;
    $('status-bar').textContent = `${actMeta.shortTitle[lang]} | t=${time.toFixed(1)}s | ep=${Math.round(epFloat)}`;

    callouts.update();
  }

  function renderCellInspector(snap, lang) {
    const [sr, sc] = snap.selectedCell || [2, 3];
    $('inspect-cell-title').textContent = lang === 'en' ? `Cell (${sr},${sc}) · Q(s,a)` : `格子 (${sr},${sc}) · 四向 Q 值`;
    $('btn-zoom-cell').textContent = i18n.t('zoomCell');
    const qRow = snap.qGrid[sr][sc] || [0, 0, 0, 0];
    let bestA = 0;
    for (let a = 1; a < 4; a += 1) {
      if (qRow[a] > qRow[bestA] + 1e-6) bestA = a;
    }
    const gridEl = $('cell-q-grid');
    gridEl.replaceChildren();
    ACTIONS.forEach((sym, idx) => {
      const chip = document.createElement('div');
      const v = qRow[idx];
      chip.className = `cell-q-chip ${v <= -25 ? 'danger' : idx === bestA ? 'best' : ''}`;
      chip.textContent = `${sym} ${v <= -50 ? '-100' : v.toFixed(1)}`;
      gridEl.append(chip);
    });
  }

  function updateChart(snap, beatNum, epFloat, lang) {
    const ghostMeta = engine.getGhostMeta();
    if (beatNum === 4) {
      // Beat 4: Live n-step early credit propagation V(Start) vs n=1 Ghost baseline
      const maxEp = 60;
      const n1Pts = snap.n1Curve.filter((p) => p.x <= maxEp);
      const nLivePts = snap.nStepCurve.filter((p) => p.x <= maxEp);
      const curEp = clamp01(epFloat / maxEp) * maxEp;
      const fCur = engine.sampleAtEpisode(curEp);
      chartCard.setHeader(i18n.t('chartNstepTitle'), `n=${engine.nStep} vs n=1`);
      chartCard.updateXY({
        badge: `n=${engine.nStep}:${fCur.nStepStartV.toFixed(1)}`,
        xMin: 1,
        xMax: maxEp,
        yMin: -5,
        yMax: 1,
        xLabel: lang === 'en' ? 'Early Episodes (drag to scrub)' : '早期回合（拖拽可擦洗）',
        yLabel: 'V(Start)',
        ghost: { points: n1Pts, tone: 'navy', opacity: 0.65, dash: '4 3' },
        series: [{ points: nLivePts, tone: 'teal' }],
        dot: { x: Math.max(1, curEp), y: fCur.nStepStartV, tone: 'teal' },
        scrubX: Math.max(1, curEp),
      });
    } else {
      // Beats 5–6: Real continuous Sarsa vs Q-learning online returns + Counterfactual Ghost
      const totalEps = engine.episodes;
      const ghosts = [
        {
          points: [
            { x: 1, y: snap.greedyRef },
            { x: totalEps, y: snap.greedyRef },
          ],
          tone: 'navy',
          opacity: 0.48,
          dash: '3 3',
        },
      ];
      if (ghostMeta && engine.isCustomCliff() && ghostMeta.sarsaReturns?.length >= 2) {
        ghosts.push({
          points: ghostMeta.sarsaReturns,
          tone: '#6366f1',
          opacity: 0.72,
          dash: '4 3',
        });
      }
      const lastS = snap.sarsaReturns[snap.sarsaReturns.length - 1] || { x: totalEps, y: snap.sarsaOnlineReturn };
      const lastQ = snap.qReturns[snap.qReturns.length - 1] || { x: totalEps, y: snap.qOnlineReturn };
      chartCard.setHeader(i18n.t('chartReturnTitle'), `ε=${engine.epsilon.toFixed(2)}`);
      chartCard.updateXY({
        badge: `S:${snap.sarsaOnlineReturn.toFixed(0)} Q:${snap.qOnlineReturn.toFixed(0)}`,
        xMin: 1,
        xMax: totalEps,
        yMin: -108,
        yMax: Math.max(24, snap.greedyRef + 22),
        xLabel: lang === 'en' ? 'Episodes (1–240)' : '训练回合 (1–240)',
        yLabel: lang === 'en' ? 'Return' : '回合回报',
        ghosts,
        series: [
          { points: snap.sarsaReturns, tone: 'teal' },
          { points: snap.qReturns, tone: 'amber' },
        ],
        marks: [{ axis: 'y', value: snap.greedyRef, label: `Opt ${snap.greedyRef >= 0 ? '+' : ''}${snap.greedyRef}`, tone: 'navy' }],
        dot: {
          x: snap.forkProbeActive ? lastQ.x : lastS.x,
          y: snap.forkProbeActive ? lastQ.y : lastS.y,
          tone: snap.forkProbeActive ? 'danger' : 'teal',
        },
      });
    }
  }

  function syncCallouts(snap, beatNum, lang) {
    const arcNodes = tray.getArcNodeTargets();
    const key = `${beatNum}|${lang}|${engine.nStep}|${arcNodes.length}|${snap.fork.forkCell.join(',')}`;
    if (key === lastCalloutKey) return;
    lastCalloutKey = key;

    const items = [];
    items.push({
      id: 'cliff-lbl',
      label: i18n.t('cliffLabel'),
      sublabel: i18n.t('cliffSub'),
      tone: 'amber',
      dx: -24,
      dy: 76,
      getWorldPos: () => tray.getTileWorldPos(3, 4),
    });

    if (arcNodes.length >= 2) {
      const first = arcNodes[0];
      const last = arcNodes[arcNodes.length - 1];
      const spanSub = toSub(arcNodes.length - 1);
      items.push({
        id: 'arc-0',
        label: 'sₜ',
        sublabel: lang === 'en' ? 'Update target' : '回写起点',
        tone: 'teal',
        dx: -46,
        dy: -38,
        getWorldPos: () => first.worldPos,
      });
      items.push({
        id: 'arc-end',
        label: `sₜ₊${spanSub}`,
        sublabel: `n = ${engine.nStep}`,
        tone: 'amber',
        dx: 46,
        dy: -38,
        getWorldPos: () => last.worldPos,
      });
    }

    items.push({
      id: 'sarsa-lbl',
      label: i18n.t('sarsaLabel'),
      sublabel: `${lang === 'en' ? 'Online' : '在线'} ${snap.sarsaOnlineReturn.toFixed(1)}`,
      tone: 'teal',
      dx: -54,
      dy: -42,
      getWorldPos: () => tray.getTileWorldPos(0, 3),
    });

    items.push({
      id: 'q-lbl',
      label: i18n.t('qGhostLabel'),
      sublabel: `${lang === 'en' ? 'Greedy' : '贪心'} +${snap.qGreedyReturn}`,
      tone: 'amber',
      dx: 44,
      dy: 28,
      getWorldPos: () => tray.getTileWorldPos(2, 4),
    });

    callouts.setItems(items);
  }

  // 9. Mount Interactive 4D Timeline Bar & One-Click Video/GIF Exporter
  const timelineBar = mountTimelineBar($('timeline-bar-slot'), clock, {
    speeds: [0.25, 0.5, 1, 2],
    showStages: true,
    showEndButton: false,
    showBeatMarkers: true,
    labels: {
      prev: i18n.t('prev'),
      play: i18n.t('play'),
      pause: i18n.t('pause'),
      next: i18n.t('next'),
    },
  });

  // Subscribe SpacetimeClock to sync entire 3D + HUD scene purely from `t`
  clock.onTick((st) => {
    syncAll(st.t);
    stage.renderNow();
  });
  clock.onSeek((st) => {
    syncAll(st.t);
    stage.renderNow();
  });

  // Wire UI Controls
  const togglePaintMode = () => {
    sound.click();
    brushActive = !brushActive;
    brush.setActive(brushActive);
    syncAll(clock.t);
  };
  $('btn-paint-cliff').onclick = togglePaintMode;
  $('mob-paint').onclick = togglePaintMode;

  $('btn-reset-cliff').onclick = () => {
    sound.click();
    engine.resetCliff();
    syncAll(clock.t);
    stage.renderNow();
  };

  $('eps-dec').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ epsilon: Math.max(0, +(engine.epsilon - 0.05).toFixed(2)), captureGhost: true });
    syncAll(clock.t);
    stage.renderNow();
  };
  $('eps-inc').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ epsilon: Math.min(0.3, +(engine.epsilon + 0.05).toFixed(2)), captureGhost: true });
    syncAll(clock.t);
    stage.renderNow();
  };
  $('alpha-dec').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ alpha: Math.max(0.1, +(engine.alpha - 0.1).toFixed(2)) });
    syncAll(clock.t);
    stage.renderNow();
  };
  $('alpha-inc').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ alpha: Math.min(0.9, +(engine.alpha + 0.1).toFixed(2)) });
    syncAll(clock.t);
    stage.renderNow();
  };
  $('n-dec').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ nStep: Math.max(1, engine.nStep - 1) });
    syncAll(clock.t);
    stage.renderNow();
  };
  $('n-inc').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ nStep: Math.min(6, engine.nStep + 1) });
    syncAll(clock.t);
    stage.renderNow();
  };

  $('unified-tabs').querySelectorAll('.unified-tab').forEach((btn) => {
    btn.onclick = () => {
      sound.click();
      unifiedMethod = btn.dataset.method || 'qlearn';
      syncAll(clock.t);
      stage.renderNow();
    };
  });

  $('btn-zoom-cell').onclick = () => {
    const [r, c] = engine.selectedCell || [2, 3];
    linkBus.focus(`cell-${r}-${c}`, 'ui');
  };

  $('view-top').onclick = () => {
    clock.pause();
    const top = stage.toggleTopView();
    $('view-top').setAttribute('aria-pressed', String(top));
  };
  $('view-reset').onclick = () => {
    const beat = clock.getBeatAt(clock.t);
    const cam = RL_BEATS[beat.index]?.camera || RL_BEATS[0].camera;
    stage.flyTo(cam, 380);
    $('view-top').setAttribute('aria-pressed', 'false');
  };

  $('mob-prev').onclick = () => clock.prevBeat();
  $('mob-play').onclick = () => clock.toggle();
  $('mob-next').onclick = () => clock.nextBeat();

  mountLangSwitch($('lang-slot'), i18n, [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'EN' },
  ]);

  const palette = new CommandPalette({
    placeholder: i18n.t('searchPh'),
    items: RL_BEATS.map((b) => ({
      id: b.id,
      title: b.title.zh,
      subtitle: b.hook.zh,
      keywords: [b.id, b.shortTitle.zh, b.shortTitle.en],
    })),
    onSelect: (item) => {
      clock.jumpToBeat(item.id, { play: false, offset: 1.5 });
    },
  });
  $('btn-palette').onclick = () => palette.open();

  i18n.subscribe((lang) => {
    engine.setParams({ lang });
    clock.setTimeline({ duration: TOTAL_DURATION, beats: buildClockBeats(lang) });
    timelineBar.setLabels({
      prev: i18n.t('prev'),
      play: i18n.t('play'),
      pause: i18n.t('pause'),
      next: i18n.t('next'),
    });
    palette.setPlaceholder(i18n.t('searchPh'));
    palette.setItems(
      RL_BEATS.map((b) => ({
        id: b.id,
        title: b.title[lang] || b.title.zh,
        subtitle: b.hook[lang] || b.hook.zh,
        keywords: [b.id, b.shortTitle.zh, b.shortTitle.en],
      }))
    );
    syncAll(clock.t);
    stage.renderNow();
  });

  // 10. Expose unified Simulify v2 contract BEFORE mounting Export Button
  const getCaptionState = () => {
    const st = clock.getState();
    const lang = i18n.getLang();
    const actMeta = RL_BEATS[st.beatIndex] || RL_BEATS[0];
    const eqText = Array.from(document.querySelectorAll('.eq-line'))
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join(' | ');
    return {
      stageIndex: st.beatIndex,
      stageCount: RL_BEATS.length,
      stageTitle: actMeta.shortTitle[lang] || actMeta.shortTitle.zh,
      stepTitle: actMeta.title[lang] || actMeta.title.zh,
      caption: actMeta.cue[lang] || actMeta.cue.zh,
      carries: actMeta.carries[lang] || actMeta.carries.zh,
      hook: actMeta.hook[lang] || actMeta.hook.zh,
      progress: st.progress,
      t: st.t,
      duration: TOTAL_DURATION,
      liveEqText: eqText,
    };
  };

  exposeTestHooks(clock, {
    version: 2,
    stage,
    engine,
    tray,
    choreographer,
    callouts,
    sound,
    linkBus,
    i18n,
    codeSurface,
    brush,
    syncAll,
    getCaptionState,
    setParams: (patch) => {
      const res = engine.setParams(patch);
      syncAll(clock.t);
      stage.renderNow();
      return res;
    },
    falsify: () => engine.runFalsificationSuite(),
  });

  mountExportButton($('export-btn-slot'), {
    filenamePrefix: 'simulify-rl-td-4d',
    lang: i18n.getLang(),
  });

  initToolbars();

  // 11. Position timeline deterministically from URL or start sparse at t = 0 (NEVER showEnd on load!)
  const applied = applyUrlState(clock, location.search);
  const hasExplicitUrlPos = Boolean(
    applied && (applied.stage !== null || applied.step !== null || applied.end || applied.paused || applied.t !== null)
  );

  if (urlState.thumb && !hasExplicitUrlPos) {
    // Rich hero frame for automated thumbnail baking (?thumb=1)
    clock.pause();
    clock.seek(35.0);
  } else if (!hasExplicitUrlPos) {
    // TRUE 4D Progressive Opening: start cleanly & sparsely at t = 0!
    clock.seek(0);
    if (!stage.reducedMotion && !urlState.exportMode) {
      clock.play();
    }
  } else {
    syncAll(clock.t);
    stage.renderNow();
  }
}

bootstrap().catch((err) => {
  console.error('RL TD 4D Workbench bootstrap error:', err);
});
