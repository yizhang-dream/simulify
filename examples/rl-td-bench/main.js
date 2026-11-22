import { CalloutLayer } from '../../kit/callout-layer.js';
import { ChartCard } from '../../kit/chart-card.js';
import { ActorChoreographer } from '../../kit/choreography.js';
import { waitForFonts } from '../../kit/fonts.js';
import { LinkBus } from '../../kit/link-bus.js';
import {
  LiveMathsPanel,
  mathGroup,
  mathNum,
  mathOp,
  mathSub,
  mathSup,
  mathText,
  mathVar,
} from '../../kit/live-maths.js';
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
  GOAL,
  GOAL_REWARD,
  RL_BEATS,
  ROWS,
  START,
  STEP_REWARD,
  TdChapterEngine,
  TOTAL_DURATION,
  getSafeExplorationWalk,
  isCliff,
  isEndpoint,
} from './td-engine.js';

const $ = (id) => document.getElementById(id);
const lerp = (a, b, u) => a + (b - a) * clamp01(u);
const fmtSigned = (v, digits = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

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
    brushBlocked: '已拦截：至少需保留一条从起点 S 到终点 G 的可行路径。',
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
    unifiedNote: '四类算法共用同一增量更新骨架，仅在 target 估值项分叉；切换标签即时同步上方 3D 代码板与高亮行。',
    sarsaLabel: 'Sarsa 安全绕行',
    qGhostLabel: 'Q 贴崖虚影',
    cliffLabel: '-100 悬崖深渊',
    cliffSub: '踏入即归零重返 S',
  },
  en: {
    brand: 'RL Ch.7 · Temporal Difference 4D Bench',
    paintCliff: 'Paint Cliff',
    paintingCliff: 'Done Painting',
    resetCliff: 'Reset Cliff',
    brushHint: 'Paint mode: click or drag 3D tiles to paint / erase -100 cliffs (or hold Alt anytime)',
    brushBlocked: 'Blocked: keep at least one walkable path from Start S to Goal G.',
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
    unifiedNote: 'All four TD methods share one update loop differing only in target. Switch tabs to highlight live.',
    sarsaLabel: 'Sarsa Safe Detour',
    qGhostLabel: 'Q Cliff Ghost',
    cliffLabel: '-100 Cliff Chasm',
    cliffSub: 'Resets immediately to S',
  },
};

const UNIFIED_TD_LINES = [
  'def td_step(s, a, r, s2, a2, mode):',
  '    if mode == "sarsa":',
  '        target = r + gamma * Q[s2, a2]',
  '    else:  # q-learning off-policy max',
  '        target = r + gamma * max(Q[s2])',
  '    Q[s, a] += alpha * (target - Q[s, a])',
];

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
    defaultActiveLine: 3,
    lineLinks: ['td-vs', 'td-vs-next', 'td-target', 'td-delta', 'td-vs', 'td-delta'],
  },
  sarsa: {
    title: 'Python · td_step("sarsa")',
    lines: UNIFIED_TD_LINES,
    defaultActiveLine: 3,
    lineLinks: ['td-vs', 'fork-sarsa', 'fork-sarsa', 'fork-q', 'fork-q', 'td-delta'],
  },
  nstep: {
    title: 'Python · nstep_step()',
    lines: [
      'def nstep_step(S, R, tau, n):',
      '    G = sum(gamma**k * R[tau+k+1] for k in range(n))',
      '    G += (gamma**n) * V[S[tau + n]]',
      '    delta = G - V[S[tau]]',
      '    V[S[tau]] += alpha * delta',
      '    return G',
    ],
    defaultActiveLine: 2,
    lineLinks: ['td-vs', 'td-target', 'td-vs-next', 'td-delta', 'td-vs', 'td-target'],
  },
  qlearn: {
    title: 'Python · td_step("qlearn")',
    lines: UNIFIED_TD_LINES,
    defaultActiveLine: 5,
    lineLinks: ['td-vs', 'fork-sarsa', 'fork-sarsa', 'fork-q', 'fork-q', 'td-delta'],
  },
};

// Centered overhead gallery-sky anchor for Beat 6 3D HTML-in-Canvas Code Slate:
// Verified 0% overlap with BOTH `.right-dock` and `.beat-caption-pill` at 1280x800 & 1440x900!
const CODE_SLATE_POS = [-0.45, 3.72, -2.55];

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 900;
}

/** Center the 4x8 board cleanly on mobile (<= 900px) so Start S is never clipped off the left edge. */
function getAdaptedCamera(baseCam) {
  if (!baseCam) return baseCam;
  if (!isMobileViewport()) return baseCam;
  return {
    target: [0.0, 0.34, -0.05],
    azimuth: baseCam.azimuth,
    elevation: Math.max(baseCam.elevation, (35 * Math.PI) / 180),
    zoom: 0.72,
  };
}

/** Position hover tooltip without overlapping any visible CalloutLayer tag or leaving canvas bounds. */
function positionTooltipSafe(tipEl, x, y, canvasEl) {
  const sr = canvasEl.getBoundingClientRect();
  const maxW = Math.max(200, sr.width);
  const maxH = Math.max(160, sr.height);
  const tipW = tipEl.offsetWidth || 156;
  const tipH = tipEl.offsetHeight || 28;

  const calloutRects = [];
  for (const tag of document.querySelectorAll('#tags-layer .callout-tag')) {
    const cs = getComputedStyle(tag);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const r = tag.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    calloutRects.push({
      left: r.left - sr.left - 6,
      top: r.top - sr.top - 6,
      right: r.right - sr.left + 6,
      bottom: r.bottom - sr.top + 6,
    });
  }

  const candidates = [
    [x + 14, y - tipH - 12],
    [x + 14, y + 18],
    [x - tipW - 14, y - tipH - 12],
    [x - tipW - 14, y + 18],
  ];

  let chosen = candidates[0];
  for (const [cx, cy] of candidates) {
    const lx = Math.max(8, Math.min(maxW - tipW - 8, cx));
    const ty = Math.max(58, Math.min(maxH - tipH - 86, cy));
    const hitsCallout = calloutRects.some(
      (b) => lx < b.right && lx + tipW > b.left && ty < b.bottom && ty + tipH > b.top
    );
    if (!hitsCallout) {
      chosen = [lx, ty];
      break;
    }
    chosen = [lx, ty];
  }

  tipEl.style.left = `${Math.round(chosen[0])}px`;
  tipEl.style.top = `${Math.round(chosen[1])}px`;
}

async function bootstrap() {
  const i18n = createI18n({
    defaultLang: urlState.lang === 'en' ? 'en' : 'zh',
    dicts: DICT,
  });
  document.documentElement.lang = i18n.getLang() === 'en' ? 'en' : 'zh-CN';

  const engine = new TdChapterEngine();
  engine.setParams({ lang: i18n.getLang() });
  const sound = new TactileSound({ muted: Boolean(urlState.thumb || urlState.exportMode) });
  const linkBus = new LinkBus();

  // Interactive runtime state (cleanly separated from master clock `t`)
  let hoveredCell = null;
  let userProbeOverride = null; // null = Beat 5 auto-slip; boolean = user explicit toggle (resets on beat exit)
  let userEpisodeOverride = null; // null = follow timeline beat; number = Beat 5-6 chart scrub override
  let unifiedMethod = 'qlearn';
  let activeLinkTarget = null;
  let mobileCodeCard = null;
  let brushActive = false;
  let lastBeatIndex = -1;
  let brushToastTimer = null;

  const hideTooltip = () => {
    const tip = $('stage-tooltip');
    if (tip) tip.hidden = true;
    hoveredCell = null;
  };

  const showBrushToast = (msg) => {
    const el = $('brush-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    if (brushToastTimer) clearTimeout(brushToastTimer);
    brushToastTimer = setTimeout(() => {
      el.hidden = true;
      brushToastTimer = null;
    }, 2600);
  };

  // 1. Create Simulify v2 IsometricStage (1:1 HiDPI physical pixels, sharp OutlinePass, Neutral tone mapping)
  const initCam = getAdaptedCamera(RL_BEATS[0].camera);
  const stage = await IsometricStage.create($('stage-canvas'), {
    target: urlState.thumb ? [0.1, 0.35, 0.05] : initCam.target,
    baseSpan: 8.4,
    azimuth: initCam.azimuth,
    elevation: initCam.elevation,
    zoom: urlState.thumb ? 0.94 : initCam.zoom,
    outlinePreset: 'crisp',
    shadowBounds: 13,
    gridSize: 28,
    onHover: (hit, x, y) => {
      const tip = $('stage-tooltip');
      if (!hit || !hit.meta || hit.meta.row === undefined) {
        if (!tip.hidden || hoveredCell !== null) {
          tip.hidden = true;
          hoveredCell = null;
          stage.clearHighlightRing();
          linkBus.clearHover('3d');
          syncAll(clock.t, { skipCamera: true });
          stage.requestRender();
        }
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
      tip.hidden = false;
      positionTooltipSafe(tip, x, y, $('stage-canvas'));
      linkBus.hover(`cell-${row}-${col}`, '3d');
      syncAll(t, { skipCamera: true });
      stage.requestRender();
    },
    onViewChange: () => {
      codeSurface.syncPose(stage.camera, CODE_SLATE_POS);
      callouts.update();
    },
  });

  // Trigger one crisp redraw once offline WOFF2 fonts finish settling
  waitForFonts(2500, () => {
    codeSurface.surface?.markDirty?.();
    stage.requestRender();
  });

  // 2. Build Sculpted 3D Instrument Stage & Diegetic 3D HTML-in-Canvas Code Trace Slate
  const tray = new CliffInstrumentTray(stage, { rows: ROWS, cols: COLS });
  const codeSurface = new CodeTraceSurface(stage, {
    id: 'code-trace-3d',
    linkBus,
    worldWidth: 5.35,
    worldHeight: 2.38,
  });

  // Mobile flat fallback card (only displayed <= 900px)
  mobileCodeCard = new CodeTraceCard($('mobile-code-slot'), { linkBus, surfaceMode: false });

  // 3. Build Direct Manipulation GridBrush (auto-exits on beat change via `bindClock`!)
  const brush = new GridBrush(stage, {
    targets: tray.getBrushTargets(),
    active: false,
    holdModifier: 'altKey',
    onActiveChange: (active) => {
      brushActive = Boolean(active);
      stage.setCursorOverride?.(brushActive ? 'crosshair' : null);
      if (!brushActive) {
        hideTooltip();
      }
      syncAll(clock.t, { skipCamera: true });
      stage.requestRender();
    },
    onStrokeStart: (cell) => {
      if (isEndpoint(cell.row, cell.col)) return null;
      clock.pause();
      hideTooltip();
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
        syncAll(clock.t, { skipCamera: true });
        stage.requestRender();
      } else if (engine.lastBlockedEdit?.reason === 'path-blocked') {
        showBrushToast(i18n.t('brushBlocked'));
      }
    },
    onClickCell: (cell) => {
      if (isCliff(cell.row, cell.col, engine.cliffMask)) return;
      sound.click();
      engine.setForkCell(cell.row, cell.col);
      linkBus.select(`cell-${cell.row}-${cell.col}`, '3d');
      syncAll(clock.t, { skipCamera: true });
      stage.requestRender();
    },
  });

  // 4. Build CalloutLayer, LiveMathsPanel, ChartCard, TdForkPanel
  const callouts = new CalloutLayer(stage, $('leader-svg'), $('tags-layer'));
  callouts.setBlockers(() => {
    const sr = $('stage-canvas').getBoundingClientRect();
    const scaleX = stage.size.width / Math.max(1, sr.width);
    const scaleY = stage.size.height / Math.max(1, sr.height);
    const ids = ['top-ribbon', 'beat-caption-pill', 'right-dock', 'bottom-left-dock', 'bottom-transport'];
    const boxes = [];
    for (const id of ids) {
      const el = $(id);
      if (!el || el.hidden || el.dataset.hudHidden === 'true' || getComputedStyle(el).display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes.push({
        left: (r.left - sr.left) * scaleX - 8,
        top: (r.top - sr.top) * scaleY - 8,
        right: (r.right - sr.left) * scaleX + 8,
        bottom: (r.bottom - sr.top) * scaleY + 8,
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
      syncAll(clock.t, { skipCamera: true });
      stage.requestRender();
    },
    onSelectMethod: (beatIdx, methodId) => {
      sound.click();
      unifiedMethod = methodId;
      stage.unlockUserCamera();
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
        // Continuous scrub inside Beat 4 early credit progression (22.4s .. 29.4s)
        clock.seek(22.4 + xNorm * 7.0);
      } else {
        // Real live episode scrubbing in Beats 5-6 (drives Q facets, terrain & curve crosshair!)
        const targetEp = Math.max(1, Math.min(engine.episodes, Math.round(xNorm * engine.episodes)));
        userEpisodeOverride = targetEp;
        engine.setParams({ episodeCursor: targetEp });
        syncAll(clock.t, { skipCamera: true });
        stage.requestRender();
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

  // Bind GridBrush to SpacetimeClock: switching beats or scrubbing back to Beat 1-2 auto-exits paint mode!
  brush.bindClock(clock, {
    autoExitOnBeatChange: true,
    allowedBeats: ['beat-3', 'beat-4', 'beat-5', 'beat-6'],
    onAutoExit: () => {
      brushActive = false;
      stage.setCursorOverride?.(null);
      hideTooltip();
    },
  });

  // 6. Configure ActorChoreographer (TRUE t=0 sparsity: ONLY 3 actors visible at t=0!)
  const choreographer = new ActorChoreographer({ initialCamera: RL_BEATS[0].camera });

  choreographer.register('base-deck', tray.deckGroup, { initiallyVisible: true });
  choreographer.register('start-goal', tray.endpointsGroup, { initiallyVisible: true });
  choreographer.register('agent-puck', tray.puckGroup, { initiallyVisible: true });

  choreographer
    .register('walk-trail', tray.walkTrailGroup, { initiallyVisible: false })
    .enter('walk-trail', 1.0, 0.45, 'fade')
    .exit('walk-trail', 7.0, 0.4, 'fade');

  choreographer
    .register('td-wavefront', tray.wavefrontGroup, { initiallyVisible: false })
    .enter('td-wavefront', 7.15, 0.5, 'fade')
    .exit('td-wavefront', 15.05, 0.4, 'fade');

  choreographer.hudReveal('right-dock', 7.3, 0.55, { el: $('right-dock'), from: [18, 0, 0] });

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
        const show3d = st.visible && !isMobileViewport() && !urlState.thumb;
        codeSurface.setChoreoState({ ...st, visible: show3d });
        if (show3d) {
          codeSurface.syncPose(stage.camera, [st.pos[0], st.pos[1], st.pos[2]]);
        }
      },
    })
    .enter('code-surface', 38.2, 0.65, 'rise', { distance: 0.36 });

  choreographer
    .register('code-tether', tray.tetherGroup, { initiallyVisible: false })
    .enter('code-tether', 38.55, 0.45, 'fade');

  for (let i = 1; i < RL_BEATS.length; i += 1) {
    choreographer.cameraBeat(RL_BEATS[i].start, 1.35, RL_BEATS[i].camera);
  }

  choreographer.calloutReveal('cliff-lbl', 16.4, 0.4, { exitAt: 21.8, exitDur: 0.3 });
  choreographer.calloutReveal('arc-0', 22.8, 0.4, { exitAt: 29.6, exitDur: 0.3 });
  choreographer.calloutReveal('arc-end', 22.9, 0.4, { exitAt: 29.6, exitDur: 0.3 });
  choreographer.calloutReveal('sarsa-lbl', 30.8, 0.4, { exitAt: 37.8, exitDur: 0.3 });
  choreographer.calloutReveal('q-lbl', 31.0, 0.4, { exitAt: 37.8, exitDur: 0.3 });
  callouts.setChoreographer(choreographer);

  // 7. Continuous Computations & Beat-2 Real Cliff-Safe Backward Credit Steps
  function computeEpisodeForTime(t, beat) {
    const u = beat.localProgress;
    if (beat.index === 0) return 0;
    if (beat.index === 1) return lerp(1, 96, easeInOutCubic(u));
    if (beat.index === 2) return lerp(24, 185, easeInOutCubic(u));
    if (beat.index === 3) return lerp(2, 56, clamp01((t - 22.4) / 6.8));
    if (userEpisodeOverride !== null) return userEpisodeOverride;
    return engine.episodes;
  }

  function getEffectiveForkProbe(t) {
    if (userProbeOverride !== null) return userProbeOverride;
    return t >= 33.5 && t <= 36.8;
  }

  function buildBackwardTdSteps(bfsPath) {
    const path = Array.isArray(bfsPath) && bfsPath.length >= 2
      ? bfsPath
      : [[3, 0], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [3, 7]];
    const steps = [];
    for (let i = path.length - 1; i >= 1; i -= 1) {
      const sNext = path[i];
      const s = path[i - 1];
      const isGoal = sNext[0] === GOAL[0] && sNext[1] === GOAL[1];
      steps.push({ s, sNext, r: isGoal ? GOAL_REWARD : STEP_REWARD });
      if (steps.length >= 6) break;
    }
    return steps.length > 0 ? steps : [{ s: [2, 7], sNext: [3, 7], r: GOAL_REWARD }];
  }

  // LinkBus bi-directional synchronization (hover NEVER steals or resets user camera!)
  linkBus.onHover((id) => {
    activeLinkTarget = id;
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  });
  linkBus.onFocus((id) => {
    const m = String(id).match(/^cell-(\d+)-(\d+)$/);
    if (m) tray.focusCell(Number(m[1]), Number(m[2]), 1.36);
  });

  // 8. Master Deterministic `syncAll(t, opts)` Function
  let lastCalloutKey = '';

  function syncAll(t = clock.t, { skipCamera = false } = {}) {
    const time = Math.max(0, Math.min(TOTAL_DURATION, Number(t) || 0));
    const lang = i18n.getLang();
    const beat = clock.getBeatAt(time);
    const beatNum = beat.index + 1;
    const actMeta = RL_BEATS[beat.index] || RL_BEATS[0];
    const u = beat.localProgress;

    // Beat-boundary housekeeping: unlock user camera for new beat framing, clear stale hover/probe/scrub overrides!
    if (lastBeatIndex !== -1 && beat.index !== lastBeatIndex) {
      if (!skipCamera) {
        stage.unlockUserCamera();
        $('view-top')?.setAttribute('aria-pressed', 'false');
      }
      hideTooltip();
      if (lastBeatIndex === 4) userProbeOverride = null;
      if (beat.index < 4) userEpisodeOverride = null;
    }
    lastBeatIndex = beat.index;

    // Evaluate choreographer actors + camera pose (apply camera cleanly through setCameraFromScript!)
    const choreoState = choreographer.evaluate(time, { apply: true });
    if (!skipCamera && choreoState.cameraPose) {
      stage.setCameraFromScript(getAdaptedCamera(choreoState.cameraPose));
    }

    // Solve engine cleanly for current beat & policy view
    const epFloat = computeEpisodeForTime(time, beat);
    const effectiveProbe = beatNum === 5 ? getEffectiveForkProbe(time) : false;
    engine.actIndex = beat.index;
    engine.forkProbeActive = effectiveProbe;
    engine.activeMethodOverride =
      beatNum === 6
        ? unifiedMethod
        : beatNum === 5 && activeLinkTarget === 'fork-q'
          ? 'qlearn'
          : null;
    const snap = engine.solve(epFloat);

    // Derive continuous 3D visual state strictly from `time` & live engine ground truth
    let tileMode = 'clean';
    let qMorph = 0;
    let cliffCarve = engine.isCustomCliff() && beatNum >= 3 ? 1 : 0;
    let vLiftStrength = 0;
    let walkProgress = 0;
    let wavefront = null;
    let arcReveal = 0;
    let arcPulsePhase = 0;
    let puckPos = null;
    let puckTone = 'teal';
    let slipProbe = null;
    const tdBackwardSteps = buildBackwardTdSteps(snap.bfsPath);
    let tdStepPair = tdBackwardSteps[0];
    const safeExplorationWalk = getSafeExplorationWalk(engine.cliffMask);

    if (beatNum === 1) {
      tileMode = 'clean';
      cliffCarve = engine.isCustomCliff() ? 1 : 0;
      walkProgress = clamp01((time - 1.0) / 5.4);
      puckPos = { pathCells: safeExplorationWalk, pathProgress: walkProgress };
      puckTone = walkProgress > 0.94 ? 'amber' : 'teal';
    } else if (beatNum === 2) {
      tileMode = 'v';
      cliffCarve = engine.isCustomCliff() ? 1 : 0;
      vLiftStrength = easeOutCubic(clamp01((time - 7.3) / 1.1));
      const cycleFloat = u * tdBackwardSteps.length;
      const stepIdx = Math.min(tdBackwardSteps.length - 1, Math.floor(cycleFloat));
      const phase = cycleFloat - stepIdx;
      tdStepPair = tdBackwardSteps[stepIdx];
      wavefront = {
        fromCell: tdStepPair.sNext,
        toCell: tdStepPair.s,
        phase,
      };
      const dx = tdStepPair.sNext[1] - tdStepPair.s[1];
      const dz = tdStepPair.sNext[0] - tdStepPair.s[0];
      puckPos = {
        row: tdStepPair.s[0],
        col: tdStepPair.s[1],
        heading: Math.atan2(-dz, dx),
      };
      puckTone = 'teal';
    } else if (beatNum === 3) {
      tileMode = 'q';
      qMorph = easeOutCubic(clamp01((time - 15.0) / 1.3));
      cliffCarve = engine.isCustomCliff() ? 1 : easeInOutCubic(clamp01((time - 15.4) / 2.0));
      vLiftStrength = 1 - easeInOutCubic(clamp01((time - 15.0) / 1.1));
      const safeDemoPath = snap.convergedSarsaPath.slice(0, Math.min(8, snap.convergedSarsaPath.length));
      puckPos = { pathCells: safeDemoPath, pathProgress: clamp01((time - 15.8) / 5.4) };
      puckTone = 'teal';
    } else if (beatNum === 4) {
      tileMode = 'q';
      qMorph = 1;
      cliffCarve = 1;
      arcReveal = easeOutCubic(clamp01((time - 22.2) / 1.1));
      arcPulsePhase = ((time - 22.2) * 0.45) % 1;
      puckPos = { pathCells: snap.arcNodes, pathProgress: clamp01((time - 22.5) / 6.6) };
      puckTone = 'amber';
    } else if (beatNum === 5) {
      tileMode = 'q';
      qMorph = 1;
      cliffCarve = 1;
      const forkApproach = snap.convergedQPath.length >= 2
        ? snap.convergedQPath.slice(0, Math.max(2, snap.convergedQPath.findIndex(([r, c]) => r === snap.fork.forkCell[0] && c === snap.fork.forkCell[1]) + 1 || 5))
        : [START, snap.fork.forkCell];
      const approachU = clamp01((time - 30.0) / 2.4);
      puckPos = approachU < 0.999
        ? { pathCells: forkApproach, pathProgress: approachU }
        : { row: snap.fork.forkCell[0], col: snap.fork.forkCell[1], heading: effectiveProbe ? -Math.PI * 0.5 : 0 };
      puckTone = effectiveProbe ? 'danger' : 'teal';

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
      tileMode = 'q';
      qMorph = 1;
      cliffCarve = 1;
      // Show n-step glass arc in Beat 6 ONLY when n-step tab is active (eliminates 5-tube visual spaghetti!)
      const showNStepArcInBeat6 = unifiedMethod === 'nstep';
      arcReveal = showNStepArcInBeat6 ? 1 : 0;
      tray.arcGroup.visible = showNStepArcInBeat6;
      arcPulsePhase = ((time - 38.2) * 0.4) % 1;
      const activeWalk = unifiedMethod === 'sarsa' ? snap.convergedSarsaPath : snap.convergedQPath;
      puckPos = { pathCells: activeWalk, pathProgress: clamp01((time - 38.4) / 4.8) };
      puckTone = unifiedMethod === 'sarsa' ? 'teal' : 'amber';
    }

    // If user painted a custom cliff early, keep chasm signage visible only when custom cliffs exist
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

    // Sync diegetic 3D code slate pose & bottom-center tether target
    const tetherWorldTarget = codeSurface.syncPose(
      stage.camera,
      choreoState.actorStates['code-surface']?.pos || CODE_SLATE_POS
    );
    const show3dCode = Boolean(choreoState.actorStates['code-surface']?.visible && !isMobileViewport() && !urlState.thumb);

    // Counterfactual Ghost: works for BOTH ε/param adjustments AND custom painted cliffs, NEVER leaks into Beat 1-2!
    const ghostMeta = engine.getGhostMeta();
    const hasGhost = Boolean(ghostMeta && engine.hasCounterfactualGhost());
    const customGhostPath = hasGhost && beatNum >= 3
      ? (engine.isCustomCliff() ? ghostMeta.qPath : ghostMeta.sarsaPath)
      : null;
    tray.customGhostGroup.visible = Boolean(customGhostPath && beatNum >= 3 && cliffCarve > 0.3);

    // Update sculpted 3D stage deterministically
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
      qVisits: snap.qVisits,
      selectedCell: beatNum >= 3 ? snap.selectedCell : null,
      hoveredCell,
      forkCell: snap.fork.forkCell,
      linkSrcCell,
      linkDstCell,
      walkTrailCells: beatNum === 1 ? safeExplorationWalk : null,
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
        fromCell: null, // resolved inside tray to exact live probe cell!
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

    // Update Right Contextual Dock cleanly per beat with TRUE KaTeX mathematical typesetting!
    const mathsSlot = $('td-maths-slot');
    const forkSlot = $('fork-panel-slot');
    const unifiedSlot = $('unified-slot');
    const cellInsp = $('cell-inspector');

    mathsSlot.hidden = beatNum < 2 || beatNum > 4;
    forkSlot.hidden = beatNum !== 5;
    unifiedSlot.hidden = beatNum !== 6;
    cellInsp.hidden = beatNum < 3 || beatNum > 4;

    if (beatNum === 2) {
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
            label: lang === 'en' ? 'Incremental Backup' : '增量更新律',
            tokens: [
              mathGroup([mathVar('V'), '(', mathVar('S'), ')'], { tone: 'teal', emph: true, linkId: 'td-vs' }),
              ' ← ',
              mathVar('V'),
              ' + ',
              mathVar('α'),
              '[',
              mathGroup([mathVar('R'), '+', mathVar('γ'), mathVar('V'), '(', mathVar("S'"), ')'], {
                tone: 'amber',
                emph: true,
                linkId: 'td-vs-next',
              }),
              ' − ',
              mathVar('V'),
              ']',
            ],
          },
          {
            label: lang === 'en' ? 'Live Substitution' : '实时数值代入',
            tokens: [
              mathNum(vS.toFixed(2), { tone: 'teal', linkId: 'td-vs' }),
              ' + ',
              mathNum(engine.alpha.toFixed(1)),
              '×[',
              mathGroup([
                mathNum(`${tdStepPair.r >= 0 ? '+' : ''}${tdStepPair.r}`),
                ' + ',
                mathNum(engine.gamma.toFixed(2)),
                '×',
                mathNum(vNext.toFixed(1)),
              ], { tone: 'amber', linkId: 'td-vs-next' }),
              ' − ',
              mathNum(vS.toFixed(1)),
              '] ',
              mathGroup([mathVar('δ'), '=', mathNum(fmtSigned(delta, 2))], {
                tone: delta >= 0 ? 'teal' : 'danger',
                emph: true,
                linkId: 'td-delta',
              }),
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
              mathGroup([mathVar('Q'), '(', mathVar('S'), ',', mathVar('A'), ')'], {
                tone: 'teal',
                emph: true,
                linkId: 'td-vs',
              }),
              ' ← ',
              mathVar('Q'),
              ' + ',
              mathVar('α'),
              '[',
              mathGroup([mathVar('R'), '+', mathVar('γ'), mathVar('Q'), '(', mathVar("S'"), ',', mathVar("A'"), ')'], {
                tone: 'amber',
                emph: true,
                linkId: 'td-vs-next',
              }),
              ' − ',
              mathVar('Q'),
              ']',
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
      const nVal = engine.nStep;
      const liveG = snap.liveNStepTarget;
      liveMaths.titleEl.textContent = lang === 'en' ? `n-step Return (n=${nVal})` : `n 步截断回报 (n=${nVal})`;
      liveMaths.update({
        badge: `G=${liveG.toFixed(1)}`,
        subtitle: lang === 'en' ? 'Chains n real rewards before bootstrapping' : '先累加 n 步真实回报再自举',
        equations: [
          {
            label: lang === 'en' ? 'Truncated Horizon' : '多步回报目标',
            tokens: [
              mathSub(mathVar('G'), [mathVar('t'), ':', mathVar('t'), '+', mathNum(nVal)], {
                tone: 'amber',
                emph: true,
                linkId: 'td-target',
              }),
              ' = ',
              mathOp('∑', { lower: [mathVar('k'), '=0'], upper: [mathNum(nVal - 1)], stacked: false }),
              mathSup(mathVar('γ'), mathVar('k')),
              mathSub(mathVar('R'), [mathVar('t'), '+', mathVar('k'), '+1']),
              ' + ',
              mathGroup(
                [
                  mathSup(mathVar('γ'), mathNum(nVal)),
                  mathVar('V'),
                  '(',
                  mathSub(mathVar('S'), [mathVar('t'), '+', mathNum(nVal)]),
                  ')',
                ],
                { tone: 'teal', emph: true, linkId: 'td-vs-next' }
              ),
            ],
          },
        ],
        breakdown: [
          {
            tag: `n=${nVal}`,
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
      if (hasGhost) {
        diffBadge.hidden = false;
        if (engine.isCustomCliff()) {
          const oldSteps = ghostMeta.qPath.length - 1;
          const newSteps = snap.convergedQPath.length - 1;
          const diff = newSteps - oldSteps;
          diffBadge.textContent = lang === 'en'
            ? `Ghost ${oldSteps} steps → New ${newSteps} steps (${diff >= 0 ? '+' : ''}${diff})`
            : `原悬崖 ${oldSteps} 步 → 新布局 ${newSteps} 步 (${diff >= 0 ? '+' : ''}${diff})`;
        } else {
          const oldRet = ghostMeta.sarsaOnlineReturn ?? ghostMeta.sarsaGreedyReturn;
          const newRet = snap.sarsaOnlineReturn;
          const diff = newRet - oldRet;
          diffBadge.textContent = lang === 'en'
            ? `Ghost (${ghostMeta.label}) Sarsa ${oldRet.toFixed(1)} → ${newRet.toFixed(1)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`
            : `对照 (${ghostMeta.label}) Sarsa ${oldRet.toFixed(1)} → ${newRet.toFixed(1)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`;
        }
      } else {
        diffBadge.hidden = true;
      }
    }

    // Update Bottom-Left ChartCard + Legend Strip (Revealed in Beat 4+)
    if (beatNum >= 4) {
      updateChart(snap, beatNum, epFloat, lang, hasGhost, ghostMeta);
    }

    // Update Diegetic 3D HTML-in-Canvas Python Code Trace (Beat 6) + Mobile fallback
    // Real algorithmic line highlighting + real live δ/target watch (ZERO fake timer loop!)
    const codeSpec = UNIFIED_CODES[unifiedMethod] || UNIFIED_CODES.qlearn;
    let activeLine = codeSpec.defaultActiveLine;
    if (activeLinkTarget && Array.isArray(codeSpec.lineLinks)) {
      const hoverLineIdx = codeSpec.lineLinks.indexOf(activeLinkTarget);
      if (hoverLineIdx >= 0) activeLine = hoverLineIdx + 1;
    }

    const [fr, fc] = snap.fork.forkCell;
    const vHere = snap.vGrid[fr]?.[fc] ?? 0;
    const td0Delta = engine.alpha * (snap.fork.td0Target - vHere);
    let watchStr;
    if (unifiedMethod === 'td0') {
      watchStr = `V=${vHere.toFixed(1)} · δ=${fmtSigned(td0Delta, 2)}`;
    } else if (unifiedMethod === 'nstep') {
      watchStr = `n=${engine.nStep} · G=${snap.liveNStepTarget.toFixed(1)}`;
    } else if (unifiedMethod === 'sarsa') {
      watchStr = `target=${snap.fork.sarsaTarget.toFixed(1)} · δ=${fmtSigned(snap.fork.sarsaDelta, 2)}`;
    } else {
      watchStr = `target=${snap.fork.qTarget.toFixed(1)} · δ=${fmtSigned(snap.fork.qDelta, 2)}`;
    }

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

    // Sync view controls, mobile thumb dock & screen-reader status
    $('view-top').textContent = i18n.t('top');
    $('view-reset').textContent = i18n.t('reset');
    $('mob-prev').textContent = i18n.t('prev');
    $('mob-next').textContent = i18n.t('next');
    $('mob-play').textContent = clock.playing ? i18n.t('pause') : i18n.t('play');
    $('mob-paint').hidden = beatNum < 3;
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

  function updateChart(snap, beatNum, epFloat, lang, hasGhost, ghostMeta) {
    const legendEl = $('chart-legend-strip');
    if (beatNum === 4) {
      const maxEp = 60;
      const n1Pts = snap.n1Curve.filter((p) => p.x <= maxEp);
      const nLivePts = snap.nStepCurve.filter((p) => p.x <= maxEp);
      const curEp = Math.max(1, clamp01(epFloat / maxEp) * maxEp);
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
        dot: { x: curEp, y: fCur.nStepStartV, tone: 'teal' },
        scrubX: curEp,
      });
      if (legendEl) {
        legendEl.innerHTML = `
          <span class="legend-item"><i class="legend-dot teal"></i>n=${engine.nStep}</span>
          <span class="legend-item"><i class="legend-dot navy"></i>n=1 (${lang === 'en' ? 'baseline' : '基准'})</span>
        `;
      }
    } else {
      const totalEps = engine.episodes;
      const curEp = Math.max(1, Math.min(totalEps, Math.round(epFloat)));
      const fCur = engine.sampleAtEpisode(curEp);

      const ghosts = [
        {
          points: [
            { x: 1, y: snap.greedyRef },
            { x: totalEps, y: snap.greedyRef },
          ],
          tone: 'navy',
          opacity: 0.45,
          dash: '3 3',
        },
      ];
      if (hasGhost && ghostMeta?.sarsaReturns?.length >= 2) {
        ghosts.push({
          points: ghostMeta.sarsaReturns,
          tone: '#6366f1',
          opacity: 0.78,
          dash: '4 3',
          movingAverageWindow: 5,
        });
      }

      chartCard.setHeader(i18n.t('chartReturnTitle'), `ε=${engine.epsilon.toFixed(2)}`);
      chartCard.updateXY({
        badge: `S:${snap.sarsaOnlineReturn.toFixed(0)} Q:${snap.qOnlineReturn.toFixed(0)}`,
        xMin: 1,
        xMax: totalEps,
        yMin: -108,
        yMax: Math.max(24, snap.greedyRef + 22),
        xLabel: lang === 'en' ? 'Episodes (drag to scrub)' : '训练回合（拖拽可擦洗）',
        yLabel: lang === 'en' ? 'Return' : '回合回报',
        ghosts,
        series: [
          { points: snap.sarsaReturns, tone: 'teal', movingAverageWindow: 5, rawOpacity: 0.24 },
          { points: snap.qReturns, tone: 'amber', movingAverageWindow: 7, rawOpacity: 0.22 },
        ],
        marks: [{ axis: 'y', value: snap.greedyRef, label: `Opt ${snap.greedyRef >= 0 ? '+' : ''}${snap.greedyRef}`, tone: 'navy' }],
        dot: {
          x: curEp,
          y: snap.forkProbeActive ? fCur.qSmooth : fCur.sarsaSmooth,
          tone: snap.forkProbeActive ? 'danger' : 'teal',
        },
        scrubX: userEpisodeOverride !== null ? curEp : null,
      });
      if (legendEl) {
        const ghostChip = hasGhost
          ? `<span class="legend-item"><i class="legend-dot ghost"></i>${lang === 'en' ? 'Ghost' : '反事实虚影'}</span>`
          : '';
        legendEl.innerHTML = `
          <span class="legend-item"><i class="legend-dot teal"></i>Sarsa (${lang === 'en' ? 'avg' : '均值'})</span>
          <span class="legend-item"><i class="legend-dot amber"></i>Q-learn (${lang === 'en' ? 'avg' : '均值'})</span>
          ${ghostChip}
        `;
      }
    }
  }

  function syncCallouts(snap, beatNum, lang) {
    const arcNodes = tray.getArcNodeTargets();
    const key = `${beatNum}|${lang}|${engine.nStep}|${arcNodes.length}|${snap.fork.forkCell.join(',')}|${snap.sarsaOnlineReturn.toFixed(1)}`;
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
      const span = arcNodes.length - 1;
      items.push({
        id: 'arc-0',
        label: 'S(t)',
        sublabel: lang === 'en' ? 'Update target' : '回写起点',
        tone: 'teal',
        dx: -46,
        dy: -38,
        getWorldPos: () => first.worldPos,
      });
      items.push({
        id: 'arc-end',
        label: `S(t+${span})`,
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

  // 9. Mount Interactive 4D Timeline Bar & Export Button (full live i18n sync!)
  const timelineBar = mountTimelineBar($('timeline-bar-slot'), clock, {
    lang: i18n.getLang(),
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

  // Single on-demand clock subscription (NO duplicate rAF, NO redundant renderNow during idle!)
  clock.onTick((st) => {
    if (clock.playing && userEpisodeOverride !== null) {
      userEpisodeOverride = null;
    }
    syncAll(st.t);
    stage.requestRender();
  });
  clock.onSeek((st) => {
    syncAll(st.t);
    stage.requestRender();
  });

  // Wire UI Controls
  const togglePaintMode = () => {
    sound.click();
    brush.setActive(!brushActive);
  };
  $('btn-paint-cliff').onclick = togglePaintMode;
  $('mob-paint').onclick = togglePaintMode;

  $('btn-reset-cliff').onclick = () => {
    sound.click();
    engine.resetCliff();
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };

  $('eps-dec').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ epsilon: Math.max(0, +(engine.epsilon - 0.05).toFixed(2)), captureGhost: true });
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };
  $('eps-inc').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ epsilon: Math.min(0.3, +(engine.epsilon + 0.05).toFixed(2)), captureGhost: true });
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };
  $('alpha-dec').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ alpha: Math.max(0.1, +(engine.alpha - 0.1).toFixed(2)) });
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };
  $('alpha-inc').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ alpha: Math.min(0.9, +(engine.alpha + 0.1).toFixed(2)) });
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };
  $('n-dec').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ nStep: Math.max(1, engine.nStep - 1) });
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };
  $('n-inc').onclick = () => {
    sound.click();
    clock.pause();
    engine.setParams({ nStep: Math.min(6, engine.nStep + 1) });
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  };

  $('unified-tabs').querySelectorAll('.unified-tab').forEach((btn) => {
    btn.onclick = () => {
      sound.click();
      unifiedMethod = btn.dataset.method || 'qlearn';
      syncAll(clock.t, { skipCamera: true });
      stage.requestRender();
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
    stage.unlockUserCamera();
    const beat = clock.getBeatAt(clock.t);
    const cam = getAdaptedCamera(RL_BEATS[beat.index]?.camera || RL_BEATS[0].camera);
    stage.flyTo(cam, 380, { lockUser: false });
    $('view-top').setAttribute('aria-pressed', 'false');
  };

  $('mob-prev').onclick = () => {
    stage.unlockUserCamera();
    clock.prevBeat();
  };
  $('mob-play').onclick = () => clock.toggle();
  $('mob-next').onclick = () => {
    stage.unlockUserCamera();
    clock.nextBeat();
  };

  // Clear hover tooltip cleanly when pointer leaves canvas
  $('stage-canvas').addEventListener('pointerleave', () => {
    hideTooltip();
    stage.clearHighlightRing();
  });

  // Re-adapt mobile/desktop camera framing & code slate on viewport resize
  window.addEventListener('resize', () => {
    syncAll(clock.t, { skipCamera: stage.isUserCameraLocked() });
    stage.requestRender();
  });

  mountLangSwitch($('lang-slot'), i18n, [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'EN' },
  ]);

  const palette = new CommandPalette({
    placeholder: i18n.t('searchPh'),
    items: RL_BEATS.map((b) => ({
      id: b.id,
      title: b.title[i18n.getLang()] || b.title.zh,
      subtitle: b.hook[i18n.getLang()] || b.hook.zh,
      keywords: [b.id, b.shortTitle.zh, b.shortTitle.en],
    })),
    onSelect: (item) => {
      stage.unlockUserCamera();
      clock.jumpToBeat(item.id, { play: false, offset: 1.5 });
    },
  });
  $('btn-palette').onclick = () => palette.open();

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
      syncAll(clock.t, { skipCamera: true });
      stage.requestRender();
      return res;
    },
    falsify: () => engine.runFalsificationSuite(),
  });

  const exportBtn = mountExportButton($('export-btn-slot'), {
    filenamePrefix: 'simulify-rl-td-4d',
    lang: i18n.getLang(),
    i18n,
  });

  // Full bilingual EN/ZH synchronization (timeline beats + stage pills + export popover + palette + 3D plaques!)
  i18n.subscribe((lang) => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    engine.setParams({ lang });
    clock.setTimeline({ duration: TOTAL_DURATION, beats: buildClockBeats(lang) });
    timelineBar.setLang(lang, {
      prev: i18n.t('prev'),
      play: i18n.t('play'),
      pause: i18n.t('pause'),
      next: i18n.t('next'),
    });
    timelineBar.setStageLabels(RL_BEATS.map((b) => b.shortTitle[lang] || b.shortTitle.zh));
    exportBtn.setLang(lang);
    palette.setPlaceholder(i18n.t('searchPh'));
    palette.setItems(
      RL_BEATS.map((b) => ({
        id: b.id,
        title: b.title[lang] || b.title.zh,
        subtitle: b.hook[lang] || b.hook.zh,
        keywords: [b.id, b.shortTitle.zh, b.shortTitle.en],
      }))
    );
    syncAll(clock.t, { skipCamera: true });
    stage.requestRender();
  });

  initToolbars();

  // 11. Position timeline deterministically from URL or start sparse at t = 0
  const applied = applyUrlState(clock, location.search);
  const hasExplicitUrlPos = Boolean(
    applied && (applied.stage !== null || applied.step !== null || applied.end || applied.paused || applied.t !== null)
  );

  if (urlState.thumb && !hasExplicitUrlPos) {
    clock.pause();
    clock.seek(35.0);
  } else if (!hasExplicitUrlPos) {
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
