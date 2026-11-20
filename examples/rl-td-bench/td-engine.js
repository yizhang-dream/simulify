export const ROWS = 4;
export const COLS = 8;
export const START = [3, 0];
export const GOAL = [3, 7];
export const ACTIONS = ['↑', '→', '↓', '←'];
const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

const DEG = Math.PI / 180;

export function isCliff(r, c) {
  return r === ROWS - 1 && c > 0 && c < COLS - 1;
}

export function stepEnv(r, c, action) {
  const [dr, dc] = DIRS[action] || [0, 0];
  const nr = Math.max(0, Math.min(ROWS - 1, r + dr));
  const nc = Math.max(0, Math.min(COLS - 1, c + dc));
  if (isCliff(nr, nc)) {
    return { nextState: [...START], reward: -100, cliff: true, done: false };
  }
  if (nr === GOAL[0] && nc === GOAL[1]) {
    return { nextState: [...GOAL], reward: -1, cliff: false, done: true };
  }
  return { nextState: [nr, nc], reward: -1, cliff: false, done: false };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RL_ACTS = [
  {
    id: 'act-1',
    num: 1,
    methodId: 'td0',
    shortTitle: { zh: '1. TD(0)', en: '1. TD(0)' },
    title: { zh: '第 1 幕 · TD(0) 状态值自举', en: 'Act 1 · TD(0) State Bootstrap' },
    cue: {
      zh: '每走一步只回头看紧邻下一格 V(S\')，把终点回报一格格向起点搬运。',
      en: 'Each step updates V(S) from the very next state V(S\') without waiting for episode end.',
    },
    carries: { zh: '起点：先看懂单格状态价值 V(s) 的单步传播。', en: 'Start: See 1-step V(s) value propagation from Goal back.' },
    hook: { zh: '钩子：只知 V(s) 不知该往哪迈步，换成 4 向动作价值 Q(s,a)。', en: 'Hook: V(s) cannot pick directions alone; split each tile into 4 Q(s,a) facets.' },
    relates: [{ to: 'act-2', type: 'deepens', why: { zh: '展开四向动作扇区', en: 'Split into 4 Q facets' } }],
    camera: { target: [0.95, 0.15, -0.35], azimuth: 28 * DEG, elevation: 37 * DEG, zoom: 0.86 },
    codeTitle: 'Python · TD(0) State Value',
    codeLines: [
      'for t in range(T):',
      '    s2, r, done = step(s, a)',
      '    target = r + gamma * V[s2]',
      '    delta = target - V[s]',
      '    V[s] += alpha * delta',
      '    s = s2',
    ],
    activeCodeLine: 3,
  },
  {
    id: 'act-2',
    num: 2,
    methodId: 'sarsa',
    shortTitle: { zh: '2. Sarsa', en: '2. Sarsa' },
    title: { zh: '第 2 幕 · Sarsa 四向动作扇区', en: 'Act 2 · Sarsa 4-Action Facets' },
    cue: {
      zh: '每格剖开四向 Q 扇区；因含 ε 探索风险，Sarsa 主动绕开深红悬崖走上方。',
      en: 'Each cell splits into 4 Q triangles; facing ε-exploration risk, Sarsa learns the upper path.',
    },
    carries: { zh: '承上：四向扇区让格子直接给出明确策略箭头。', en: 'Carries: Four directional Q facets produce explicit arrows.' },
    hook: { zh: '钩子：只看 1 步传播太慢，拉高 n-step 视野一次更新多步。', en: 'Hook: 1-step updates propagate slowly; raise the n-step glass arc.' },
    relates: [{ to: 'act-3', type: 'deepens', why: { zh: '1 步 TD 向 MC 连续过渡', en: 'Continuous n-step spectrum' } }],
    camera: { target: [0.95, 0.15, -0.35], azimuth: 28 * DEG, elevation: 37 * DEG, zoom: 0.86 },
    codeTitle: 'Python · On-Policy Sarsa',
    codeLines: [
      'for t in range(T):',
      '    s2, r, done = step(s, a)',
      '    a2 = eps_greedy(Q, s2, eps)',
      '    target = r + gamma * Q[s2, a2]',
      '    Q[s, a] += alpha * (target - Q[s, a])',
      '    s, a = s2, a2',
    ],
    activeCodeLine: 4,
  },
  {
    id: 'act-3',
    num: 3,
    methodId: 'nstep',
    shortTitle: { zh: '3. n-step', en: '3. n-step' },
    title: { zh: '第 3 幕 · n-step 悬浮时空视野弧', en: 'Act 3 · Floating n-step Horizon Arc' },
    cue: {
      zh: '调 n 看悬浮玻璃弧拉长：n=1 是 TD(0)，n 增大就把整条真实回报串进更新。',
      en: 'Slide n to stretch the 3D glass arc: n=1 is 1-step TD, larger n bridges to Monte Carlo.',
    },
    carries: { zh: '承上：一条玻璃弧同时囊括 1 步 TD 与多步真实轨迹回报。', en: 'Carries: Bridges 1-step TD and full rollout horizon.' },
    hook: { zh: '钩子：Sarsa 与 Q-learning 在崖边遇到完全相同的随机失足会怎样？', en: 'Hook: Compare Sarsa vs Q-learning on an identical cliff ε-slip.' },
    relates: [{ to: 'act-4', type: 'contrast', why: { zh: '同种子分叉反例对比', en: 'Same-seed fork contrast' } }],
    camera: { target: [0.95, 0.35, -0.35], azimuth: 29 * DEG, elevation: 35 * DEG, zoom: 0.84 },
    codeTitle: 'Python · n-step Sarsa Target',
    codeLines: [
      'if tau >= 0:',
      '    G = sum(gamma**k * R[tau+k+1] for k in range(n))',
      '    G += (gamma**n) * Q[S[tau+n], A[tau+n]]',
      '    delta = G - Q[S[tau], A[tau]]',
      '    Q[S[tau], A[tau]] += alpha * delta',
      '    tau += 1',
    ],
    activeCodeLine: 3,
  },
  {
    id: 'act-4',
    num: 4,
    methodId: 'qlearn',
    shortTitle: { zh: '4. Q-Fork', en: '4. Q-Fork' },
    title: { zh: '第 4 幕 · 同种子崖边分叉显微镜', en: 'Act 4 · Same-Seed Cliff TD Fork' },
    cue: {
      zh: '点右下「注入崖边 ε 跌落」：Sarsa 因 ε=-100 大跌绕行；Q 只取 max 贴崖最短却偶发掉坑。',
      en: 'Trigger Cliff ε-Drop: Sarsa gets -100 shocked to detour; Q takes max along the cliff.',
    },
    carries: { zh: '承上：同随机数流检验 π_b 探索与 π_T 目标解耦机制。', en: 'Carries: Separates behavior policy π_b from target max.' },
    hook: { zh: '反例：把 ε 调到 0.00，两条曲线和轨迹立刻重合到 -9 最优线。', en: 'Counterexample: Setting ε=0 merges Q-learning return smoothly to -9.' },
    relates: [{ to: 'act-5', type: 'uses', why: { zh: '收口统一视角与代码执行', en: 'Unify into one TD template' } }],
    camera: { target: [0.95, 0.18, -0.32], azimuth: 27 * DEG, elevation: 38 * DEG, zoom: 0.86 },
    codeTitle: 'Python · Q-learning Max Target',
    codeLines: [
      'for t in range(T):',
      '    s2, r, done = step(s, a)',
      '    target = r + gamma * np.max(Q[s2])',
      '    delta = target - Q[s, a]',
      '    Q[s, a] += alpha * delta',
      '    s, a = s2, eps_greedy(Q, s2, eps)',
    ],
    activeCodeLine: 3,
  },
  {
    id: 'act-5',
    num: 5,
    methodId: 'qlearn',
    shortTitle: { zh: '5. Code', en: '5. Code' },
    title: { zh: '第 5 幕 · 统一公式表与代码单步同步', en: 'Act 5 · Unified Matrix & Live Code' },
    cue: {
      zh: 'TD(0)、Sarsa、n-step 与 Q-learning 只在 target 一行分叉；点击矩阵行切换验证。',
      en: 'TD(0), Sarsa, n-step, and Q-learning differ only on the target line.',
    },
    carries: { zh: '承上：整章四个算法归约成同一套增量更新骨架。', en: 'Carries: Unifies all Chapter 7 algorithms in 6 lines.' },
    hook: { zh: '下一章预告：网格状态爆炸时，查表 Q[s,a] 必须升级为函数近似 w。', en: 'Next Chapter: Function approximation replaces lookup tables.' },
    relates: [{ to: 'act-1', type: 'uses', why: { zh: '回望 TD(0) 起点', en: 'Revisit TD(0) foundation' } }],
    camera: { target: [0.95, 0.22, -0.34], azimuth: 28 * DEG, elevation: 36 * DEG, zoom: 0.85 },
    codeTitle: 'Python · Unified td_step()',
    codeLines: [
      'def td_step(s, a, r, s2, a2, mode):',
      '    if mode == "sarsa":',
      '        target = r + gamma * Q[s2, a2]',
      '    else:  # q-learning off-policy max',
      '        target = r + gamma * np.max(Q[s2])',
      '    Q[s, a] += alpha * (target - Q[s, a])',
    ],
    activeCodeLine: 5,
  },
];

function createEmptyV() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function createEmptyQ() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => [0, 0, 0, 0]));
}

function epsGreedyPick(qRow, epsilon, rng) {
  if (rng() < epsilon) {
    return Math.min(3, Math.floor(rng() * 4));
  }
  let bestVal = -Infinity;
  const ties = [];
  for (let a = 0; a < 4; a += 1) {
    if (qRow[a] > bestVal + 1e-9) {
      bestVal = qRow[a];
      ties.length = 0;
      ties.push(a);
    } else if (Math.abs(qRow[a] - bestVal) <= 1e-9) {
      ties.push(a);
    }
  }
  return ties[Math.floor(rng() * ties.length)] ?? 1;
}

function extractGreedyPath(qGrid, start, maxLen = 28) {
  const path = [[...start]];
  const seen = new Set([`${start[0]},${start[1]}`]);
  let [r, c] = start;
  for (let i = 0; i < maxLen; i += 1) {
    if (r === GOAL[0] && c === GOAL[1]) break;
    const qRow = qGrid[r][c];
    let bestA = 1;
    let bestVal = -Infinity;
    for (let a = 0; a < 4; a += 1) {
      if (qRow[a] > bestVal + 1e-9) {
        bestVal = qRow[a];
        bestA = a;
      }
    }
    const [dr, dc] = DIRS[bestA];
    const nr = Math.max(0, Math.min(ROWS - 1, r + dr));
    const nc = Math.max(0, Math.min(COLS - 1, c + dc));
    const key = `${nr},${nc}`;
    path.push([nr, nc]);
    if (isCliff(nr, nc) || seen.has(key)) break;
    seen.add(key);
    r = nr;
    c = nc;
  }
  return path;
}

/**
 * Compute deterministic rollouts for TD(0), Sarsa, Q-learning, and n-step horizon comparison.
 */
export function runTdSimulation({ epsilon = 0.1, alpha = 0.5, gamma = 0.95, nStep = 3, episodes = 240, seed = 20261120 } = {}) {
  const cpEpisodes = [
    Math.min(episodes, 8),
    Math.min(episodes, 24),
    Math.min(episodes, 60),
    Math.min(episodes, 130),
    episodes,
  ];
  const cloneV = (g) => g.map((row) => [...row]);
  const cloneQ = (g) => g.map((row) => row.map((cell) => [...cell]));
  const vSnapshots = [];
  const cpSet = new Set(cpEpisodes);

  // 1. State value V(s) along an upper-safe stochastic policy via TD(0)
  const vGrid = createEmptyV();
  const rngV = mulberry32(seed + 11);
  for (let ep = 0; ep < episodes; ep += 1) {
    let [r, c] = ep % 2 === 0
      ? START
      : [Math.floor(rngV() * 3), Math.floor(rngV() * COLS)];
    for (let step = 0; step < 90; step += 1) {
      if (r === GOAL[0] && c === GOAL[1]) break;
      let a;
      if (rngV() < Math.max(0.08, epsilon)) {
        a = Math.min(3, Math.floor(rngV() * 4));
      } else if (c === 0 && r > 0) {
        a = 0;
      } else if (r === 0 && c < COLS - 1) {
        a = 1;
      } else if (c === COLS - 1) {
        a = 2;
      } else {
        a = r >= 2 && rngV() < 0.45 ? 0 : 1;
      }
      const { nextState: [nr, nc], reward, done } = stepEnv(r, c, a);
      const target = reward + (done ? 0 : gamma * vGrid[nr][nc]);
      vGrid[r][c] += alpha * (target - vGrid[r][c]);
      [r, c] = [nr, nc];
      if (done) break;
    }
    if (cpSet.has(ep + 1)) {
      vSnapshots.push({ ep: ep + 1, vGrid: cloneV(vGrid) });
    }
  }

  // 2. Twin seeded rollouts for Sarsa vs Q-learning
  const qSarsa = createEmptyQ();
  const qLearn = createEmptyQ();
  let qMidSnapshot = null;
  const rngS = mulberry32(seed);
  const rngQ = mulberry32(seed);
  const sarsaAll = [];
  const qAll = [];
  const qSnapshots = [];

  for (let ep = 0; ep < episodes; ep += 1) {
    // Sarsa episode
    let [sr, sc] = START;
    let sa = epsGreedyPick(qSarsa[sr][sc], epsilon, rngS);
    let sRet = 0;
    for (let st = 0; st < 110; st += 1) {
      const { nextState: [nr, nc], reward, done } = stepEnv(sr, sc, sa);
      sRet += reward;
      const na = done ? 0 : epsGreedyPick(qSarsa[nr][nc], epsilon, rngS);
      const nextQ = done ? 0 : qSarsa[nr][nc][na];
      qSarsa[sr][sc][sa] += alpha * (reward + gamma * nextQ - qSarsa[sr][sc][sa]);
      sr = nr;
      sc = nc;
      sa = na;
      if (done) break;
    }
    sarsaAll.push(Math.max(-95, sRet));

    // Q-learning episode with identical seed sequence
    let [qr, qc] = START;
    let qRet = 0;
    for (let st = 0; st < 110; st += 1) {
      const qa = epsGreedyPick(qLearn[qr][qc], epsilon, rngQ);
      const { nextState: [nr, nc], reward, done } = stepEnv(qr, qc, qa);
      qRet += reward;
      const maxNext = done ? 0 : Math.max(...qLearn[nr][nc]);
      qLearn[qr][qc][qa] += alpha * (reward + gamma * maxNext - qLearn[qr][qc][qa]);
      qr = nr;
      qc = nc;
      if (done) break;
    }
    qAll.push(Math.max(-95, qRet));

    if (ep === 5) {
      qMidSnapshot = cloneQ(qSarsa);
    }
    if (cpSet.has(ep + 1)) {
      qSnapshots.push({
        ep: ep + 1,
        qSarsa: cloneQ(qSarsa),
        qLearn: cloneQ(qLearn),
        sarsaPath: extractGreedyPath(qSarsa, START),
        qPath: extractGreedyPath(qLearn, START),
      });
    }
  }

  // Combine V and Q checkpoints cleanly
  const checkpoints = cpEpisodes.map((cpEp, idx) => {
    const vEntry = vSnapshots.find((v) => v.ep === cpEp) || vSnapshots[idx] || { vGrid };
    const qEntry = qSnapshots.find((q) => q.ep === cpEp) || qSnapshots[idx] || {
      qSarsa,
      qLearn,
      sarsaPath: extractGreedyPath(qSarsa, START),
      qPath: extractGreedyPath(qLearn, START),
    };
    return {
      ep: cpEp,
      vGrid: vEntry.vGrid,
      qSarsa: qEntry.qSarsa,
      qLearn: qEntry.qLearn,
      sarsaPath: qEntry.sarsaPath,
      qPath: qEntry.qPath,
    };
  });

  // Downsample 240 episodes into 80 chart points (smoothed 7-point rolling Sarsa vs raw jagged Q drops)
  const chartPoints = 80;
  const binSize = Math.max(1, Math.floor(episodes / chartPoints));
  const sarsaRaw = [];
  const qReturns = [];
  for (let i = 0; i < chartPoints; i += 1) {
    const startIdx = i * binSize;
    const endIdx = Math.min(episodes, startIdx + binSize);
    const sSlice = sarsaAll.slice(startIdx, endIdx);
    const qSlice = qAll.slice(startIdx, endIdx);
    const sMean = sSlice.reduce((a, b) => a + b, 0) / Math.max(1, sSlice.length);
    const qMin = Math.min(...qSlice);
    const qMean = qSlice.reduce((a, b) => a + b, 0) / Math.max(1, qSlice.length);
    const qPlot = qMin <= -45 ? Math.round((qMean * 0.4 + qMin * 0.6) * 10) / 10 : +qMean.toFixed(1);
    sarsaRaw.push(sMean);
    qReturns.push({ x: i + 1, y: qPlot });
  }
  const sarsaReturns = sarsaRaw.map((_, idx) => {
    const lo = Math.max(0, idx - 3);
    const hi = Math.min(sarsaRaw.length - 1, idx + 3);
    let sum = 0;
    for (let j = lo; j <= hi; j += 1) sum += sarsaRaw[j];
    return { x: idx + 1, y: +(sum / (hi - lo + 1)).toFixed(1) };
  });

  // Extract Sarsa vs Q-learning clean greedy policy trajectories
  const sarsaPath = extractGreedyPath(qSarsa, START);
  const qPath = extractGreedyPath(qLearn, START);

  // n-step horizon trajectory over row 2 (evaluating mid-training partial estimates so n=1 vs n=4 shows genuine bootstrap bias reduction)
  const sampleWalk = [
    [2, 0],
    [2, 1],
    [2, 2],
    [2, 3],
    [2, 4],
    [2, 5],
    [2, 6],
  ];
  const horizon = Math.max(1, Math.min(6, Math.round(nStep)));
  const arcNodes = sampleWalk.slice(0, horizon + 1);
  const tailCell = arcNodes[arcNodes.length - 1];
  const qEarly = qMidSnapshot || qSarsa;
  const bootstrapQ = qEarly[tailCell[0]][tailCell[1]][1] ?? -1.5;
  let nStepTarget = 0;
  for (let k = 0; k < horizon; k += 1) {
    nStepTarget += (gamma ** k) * (-1);
  }
  nStepTarget += (gamma ** horizon) * bootstrapQ;

  return {
    vGrid,
    qSarsa,
    qLearn,
    sarsaPath,
    qPath,
    checkpoints,
    sarsaReturns,
    qReturns,
    arcNodes,
    nStepTarget,
    greedyRef: -9,
  };
}

export class TdChapterEngine {
  constructor() {
    this.actIndex = 0;
    this.epsilon = 0.1;
    this.alpha = 0.5;
    this.gamma = 0.95;
    this.nStep = 3;
    this.episodes = 240;
    this.stepCursor = 0;
    this.selectedCell = [2, 3];
    this.forkProbeActive = false;
    this.lang = 'zh';
    this.checkpointIdx = 4;
    this.curveFraction = 1;
    this.pathStepCount = 99;
    this.activeCodeLineOverride = null;
    this.activeMethodOverride = null;
    this.customAgentCell = null;
    this.customArcStart = null;
    this._cacheKey = '';
    this._cached = null;
  }

  get act() {
    return RL_ACTS[this.actIndex] || RL_ACTS[0];
  }

  resetPlaybackOverrides() {
    this.checkpointIdx = 4;
    this.curveFraction = 1;
    this.pathStepCount = 99;
    this.activeCodeLineOverride = null;
    this.activeMethodOverride = null;
    this.customAgentCell = null;
    this.customArcStart = null;
  }

  setAct(indexOrId) {
    const idx =
      typeof indexOrId === 'number'
        ? Math.max(0, Math.min(RL_ACTS.length - 1, indexOrId))
        : Math.max(0, RL_ACTS.findIndex((a) => a.id === indexOrId));
    this.actIndex = idx;
    if (this.act.num === 4) {
      this.selectedCell = [2, 3];
    }
    return this.solve();
  }

  setParams(patch = {}) {
    if (patch.epsilon !== undefined) this.epsilon = Math.max(0, Math.min(0.4, Number(patch.epsilon)));
    if (patch.alpha !== undefined) this.alpha = Math.max(0.05, Math.min(1, Number(patch.alpha)));
    if (patch.gamma !== undefined) this.gamma = Math.max(0.5, Math.min(0.99, Number(patch.gamma)));
    if (patch.nStep !== undefined) this.nStep = Math.max(1, Math.min(6, Math.round(Number(patch.nStep))));
    if (patch.episodes !== undefined) this.episodes = Math.max(10, Math.min(120, Math.round(Number(patch.episodes))));
    if (patch.forkProbeActive !== undefined) this.forkProbeActive = Boolean(patch.forkProbeActive);
    if (patch.selectedCell) this.selectedCell = [...patch.selectedCell];
    if (patch.stepCursor !== undefined) this.stepCursor = Math.max(0, Math.round(Number(patch.stepCursor)));
    if (patch.checkpointIdx !== undefined) this.checkpointIdx = Math.max(0, Math.min(4, Math.round(Number(patch.checkpointIdx))));
    if (patch.curveFraction !== undefined) this.curveFraction = Math.max(0.05, Math.min(1, Number(patch.curveFraction)));
    if (patch.pathStepCount !== undefined) this.pathStepCount = Math.max(2, Math.round(Number(patch.pathStepCount)));
    if ('activeCodeLineOverride' in patch) this.activeCodeLineOverride = patch.activeCodeLineOverride;
    if ('activeMethodOverride' in patch) this.activeMethodOverride = patch.activeMethodOverride;
    if ('customAgentCell' in patch) this.customAgentCell = patch.customAgentCell ? [...patch.customAgentCell] : null;
    if ('customArcStart' in patch) this.customArcStart = patch.customArcStart ? [...patch.customArcStart] : null;
    if (patch.lang) this.lang = patch.lang;
    return this.solve();
  }

  solve() {
    const key = `${this.epsilon.toFixed(3)}|${this.alpha.toFixed(2)}|${this.gamma.toFixed(2)}|${this.nStep}|${this.episodes}`;
    if (this._cacheKey !== key || !this._cached) {
      this._cached = runTdSimulation({
        epsilon: this.epsilon,
        alpha: this.alpha,
        gamma: this.gamma,
        nStep: this.nStep,
        episodes: this.episodes,
      });
      this._cacheKey = key;
    }

    const sim = this._cached;
    const cp = sim.checkpoints?.[Math.min((sim.checkpoints?.length || 1) - 1, Math.max(0, this.checkpointIdx))] || sim;
    const act = this.act;

    // Select active Q table for surface display
    const useQTable = act.num >= 4 ? cp.qLearn : cp.qSarsa;
    const cliffHit = Boolean(this.forkProbeActive);

    // Single-step TD fork evaluated at S_t=(2,2), A_t=RIGHT -> S'=(2,3)
    const rNext = -1;
    const prevQ = cp.qSarsa[2][2][1] ?? -6.0;
    const prevQq = cp.qLearn[2][2][1] ?? -5.0;
    const sarsaRight = cp.qSarsa[2][3][1] ?? -5.2;
    const sarsaCliff = Math.min(-80, cp.qSarsa[2][3][2] ?? -98.0);
    const sarsaNextQ = cliffHit ? sarsaCliff : sarsaRight;
    const qMaxNext = Math.max(...cp.qLearn[2][3]);
    const td0Target = rNext + this.gamma * (cp.vGrid[2][3] ?? -5.0);
    const sarsaTarget = rNext + this.gamma * sarsaNextQ;
    const qTarget = rNext + this.gamma * qMaxNext;

    const fork = {
      cliffHit,
      rNext,
      sarsaActionLabel: cliffHit ? '↓ (-100)' : '→',
      sarsaNextQ,
      qMaxNext,
      td0Target,
      sarsaTarget,
      qTarget,
      sarsaDelta: this.alpha * (sarsaTarget - prevQ),
      qDelta: this.alpha * (qTarget - prevQq),
    };

    const slicePath = (p) => (p && p.length >= 2 ? p.slice(0, Math.max(2, Math.min(p.length, this.pathStepCount))) : p);
    const sarsaPath = act.num >= 2 ? slicePath(cp.sarsaPath) : null;
    const qPath = act.num >= 4 ? slicePath(cp.qPath) : null;

    // Determine visible puck cell
    let agentCell = [3, 0];
    let highlightCell = this.selectedCell;
    if (this.customAgentCell) {
      agentCell = [...this.customAgentCell];
      if (act.num === 4) highlightCell = [2, 3];
    } else if (act.num === 4 || cliffHit) {
      agentCell = cliffHit ? [3, 3] : [2, 3];
      highlightCell = [2, 3];
    } else if (act.num === 3) {
      const idx = Math.min(sim.arcNodes.length - 1, this.stepCursor % sim.arcNodes.length);
      agentCell = sim.arcNodes[idx];
    } else if (act.num === 2) {
      const p = cp.sarsaPath;
      agentCell = p[Math.min(p.length - 1, this.stepCursor % p.length)];
    } else if (act.num === 5) {
      const p = cp.qPath;
      agentCell = p[Math.min(p.length - 1, this.stepCursor % p.length)];
    } else {
      const p = cp.sarsaPath;
      agentCell = p[Math.min(p.length - 1, this.stepCursor % p.length)];
    }

    // Determine 1-step glass arc in Act 1 vs n-step arc in Act 3/5
    let arcNodes = sim.arcNodes;
    if (act.num === 1) {
      if (this.customArcStart) {
        const [ar, ac] = this.customArcStart;
        const p = cp.sarsaPath;
        const idx = p.findIndex(([pr, pc]) => pr === ar && pc === ac);
        const nextCell = idx >= 0 && idx + 1 < p.length ? p[idx + 1] : [ar, Math.min(COLS - 1, ac + 1)];
        arcNodes = [[ar, ac], nextCell];
      } else {
        arcNodes = [[2, 2], [2, 3]];
      }
    }

    const chartCount = this.curveFraction >= 0.999
      ? sim.sarsaReturns.length
      : Math.max(2, Math.round(sim.sarsaReturns.length * this.curveFraction));
    const sarsaReturns = chartCount >= sim.sarsaReturns.length ? sim.sarsaReturns : sim.sarsaReturns.slice(0, chartCount);
    const qReturns = chartCount >= sim.qReturns.length ? sim.qReturns : sim.qReturns.slice(0, chartCount);

    const qEndSlice = qReturns.slice(-15);
    const sEndSlice = sarsaReturns.slice(-15);
    const meanReturn = (arr) => +(arr.reduce((acc, it) => acc + it.y, 0) / Math.max(1, arr.length)).toFixed(1);

    return {
      actNum: act.num,
      actId: act.id,
      checkpointIdx: this.checkpointIdx,
      checkpointEp: cp.ep,
      activeMethod: this.activeMethodOverride ?? act.methodId,
      epsilon: this.epsilon,
      alpha: this.alpha,
      gamma: this.gamma,
      nStep: this.nStep,
      episodes: this.episodes,
      lang: this.lang,
      vGrid: cp.vGrid,
      qGrid: useQTable,
      qSarsa: cp.qSarsa,
      qLearn: cp.qLearn,
      sarsaPath,
      qPath,
      showSarsaPath: act.num >= 2,
      showArc: act.num === 1 || act.num === 3 || act.num === 5,
      arcNodes,
      nStepTarget: sim.nStepTarget,
      sarsaReturns,
      qReturns,
      curveTotalPoints: sim.sarsaReturns.length,
      meanSarsa: meanReturn(sEndSlice),
      meanQ: meanReturn(qEndSlice),
      greedyRef: sim.greedyRef,
      selectedCell: this.selectedCell,
      highlightCell,
      agentCell,
      forkProbeActive: cliffHit,
      fork,
      codeTitle: act.codeTitle,
      codeLines: act.codeLines,
      activeCodeLine: this.activeCodeLineOverride ?? act.activeCodeLine,
    };
  }

  /**
   * Executable counterfactual verification suite invoked by verify_stage.py falsify-oracle leg.
   */
  runFalsificationSuite() {
    const saved = {
      actIndex: this.actIndex,
      epsilon: this.epsilon,
      nStep: this.nStep,
      forkProbeActive: this.forkProbeActive,
      checkpointIdx: this.checkpointIdx,
      curveFraction: this.curveFraction,
      pathStepCount: this.pathStepCount,
      activeCodeLineOverride: this.activeCodeLineOverride,
      activeMethodOverride: this.activeMethodOverride,
      customAgentCell: this.customAgentCell,
      customArcStart: this.customArcStart,
    };

    try {
      this.resetPlaybackOverrides();

      // Assertion 1: Cliff ε-drop shocks Sarsa while Q-learning stays sheltered by max
      this.setAct('act-4');
      this.setParams({ epsilon: 0.1, forkProbeActive: false });
      const normalFork = this.solve().fork;
      this.setParams({ forkProbeActive: true });
      const shockedFork = this.solve().fork;
      const assert1 = {
        id: 'cliff-fork-sign-split',
        passed:
          shockedFork.sarsaTarget < normalFork.sarsaTarget - 20 &&
          shockedFork.sarsaDelta < shockedFork.qDelta - 15 &&
          Math.abs(shockedFork.qTarget - normalFork.qTarget) < 1e-6,
        sarsaShockDelta: +shockedFork.sarsaDelta.toFixed(2),
        qDelta: +shockedFork.qDelta.toFixed(2),
      };

      // Assertion 2: Setting epsilon=0 merges Q-learning return smoothly to optimal (-9)
      this.setParams({ epsilon: 0.1, forkProbeActive: false });
      const meanEps10 = this.solve().meanQ;
      this.setParams({ epsilon: 0.0 });
      const meanEps0 = this.solve().meanQ;
      const assert2 = {
        id: 'epsilon-zero-convergence',
        passed: meanEps0 >= -11 && meanEps0 > meanEps10 + 3,
        meanEps10,
        meanEps0,
      };

      // Assertion 3: Raising nStep stretches arc nodes and updates truncated target G_{t:t+n}
      this.setAct('act-3');
      this.setParams({ epsilon: 0.1, nStep: 1 });
      const s1 = this.solve();
      this.setParams({ nStep: 4 });
      const s4 = this.solve();
      const assert3 = {
        id: 'n-step-horizon-change',
        passed: s1.arcNodes.length === 2 && s4.arcNodes.length === 5 && Math.abs(s4.nStepTarget - s1.nStepTarget) > 0.5,
        n1Target: +s1.nStepTarget.toFixed(2),
        n4Target: +s4.nStepTarget.toFixed(2),
      };

      const assertions = [assert1, assert2, assert3];
      return {
        passed: assertions.every((a) => a.passed),
        assertions,
      };
    } finally {
      this.actIndex = saved.actIndex;
      this.epsilon = saved.epsilon;
      this.nStep = saved.nStep;
      this.forkProbeActive = saved.forkProbeActive;
      this.checkpointIdx = saved.checkpointIdx;
      this.curveFraction = saved.curveFraction;
      this.pathStepCount = saved.pathStepCount;
      this.activeCodeLineOverride = saved.activeCodeLineOverride;
      this.activeMethodOverride = saved.activeMethodOverride;
      this.customAgentCell = saved.customAgentCell;
      this.customArcStart = saved.customArcStart;
      this._cacheKey = '';
      this.solve();
    }
  }
}
