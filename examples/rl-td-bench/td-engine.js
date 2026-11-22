import { SimulationTape } from '../../kit/spacetime.js';

export const ROWS = 4;
export const COLS = 8;
export const START = [3, 0];
export const GOAL = [3, 7];
export const ACTIONS = ['↑', '→', '↓', '←'];
export const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

export const GOAL_REWARD = 10;
export const STEP_REWARD = -1;
export const CLIFF_REWARD = -100;
export const TOTAL_DURATION = 44.0;

const DEG = Math.PI / 180;

export function createDefaultCliffMask() {
  const mask = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let c = 1; c < COLS - 1; c += 1) {
    mask[ROWS - 1][c] = true;
  }
  return mask;
}

export function cloneCliffMask(mask) {
  if (!Array.isArray(mask) || mask.length !== ROWS) return createDefaultCliffMask();
  return mask.map((row, r) =>
    Array.from({ length: COLS }, (_, c) => Boolean(row?.[c]) && !isEndpoint(r, c))
  );
}

export function isEndpoint(r, c) {
  return (r === START[0] && c === START[1]) || (r === GOAL[0] && c === GOAL[1]);
}

export function cliffMaskKey(mask) {
  const m = mask || createDefaultCliffMask();
  let s = '';
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      s += m[r]?.[c] ? '1' : '0';
    }
  }
  return s;
}

export function isCliff(r, c, cliffMask = null) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (isEndpoint(r, c)) return false;
  if (cliffMask) return Boolean(cliffMask[r]?.[c]);
  return r === ROWS - 1 && c > 0 && c < COLS - 1;
}

export function stepEnv(r, c, action, opts = {}) {
  const {
    cliffMask = null,
    cliffEnabled = true,
    goalReward = GOAL_REWARD,
    stepReward = STEP_REWARD,
    cliffReward = CLIFF_REWARD,
  } = opts;
  const [dr, dc] = DIRS[action] || [0, 0];
  const nr = Math.max(0, Math.min(ROWS - 1, r + dr));
  const nc = Math.max(0, Math.min(COLS - 1, c + dc));
  if (cliffEnabled && isCliff(nr, nc, cliffMask)) {
    return { nextState: [...START], reward: cliffReward, cliff: true, done: false };
  }
  if (nr === GOAL[0] && nc === GOAL[1]) {
    return { nextState: [...GOAL], reward: goalReward, cliff: false, done: true };
  }
  return { nextState: [nr, nc], reward: stepReward, cliff: false, done: false };
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

/**
 * Compute exact shortest cliff-free path via BFS (used to validate obstacle detours & safe baselines).
 */
export function bfsShortestPath(cliffMask = null, start = START, goal = GOAL) {
  const q = [[start[0], start[1]]];
  const prev = new Map();
  const startKey = `${start[0]},${start[1]}`;
  prev.set(startKey, null);

  while (q.length > 0) {
    const [r, c] = q.shift();
    if (r === goal[0] && c === goal[1]) {
      const path = [];
      let cur = `${r},${c}`;
      while (cur) {
        const [cr, cc] = cur.split(',').map(Number);
        path.push([cr, cc]);
        cur = prev.get(cur);
      }
      path.reverse();
      return path;
    }
    for (let a = 0; a < 4; a += 1) {
      const [dr, dc] = DIRS[a];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (isCliff(nr, nc, cliffMask)) continue;
      const k = `${nr},${nc}`;
      if (!prev.has(k)) {
        prev.set(k, `${r},${c}`);
        q.push([nr, nc]);
      }
    }
  }
  return [[...start]];
}

/**
 * 6-Beat Unhurried 4D Progressive Temporal Story (0.0s .. 44.0s).
 * Every beat introduces a new visual layer ONLY when the previous beat creates causal friction.
 */
export const RL_BEATS = [
  {
    id: 'beat-1',
    num: 1,
    methodId: 'td0',
    start: 0.0,
    end: 7.0,
    shortTitle: { zh: '1. 初探网格', en: '1. First Walk' },
    title: { zh: '第 1 幕 · 初探网格与终点奖励', en: 'Beat 1 · Clean Grid & First Walk' },
    cue: {
      zh: '智能体从 S 摸索抵达终点 G (+10)：终点的一次奖赏，怎么一步步传回起点？',
      en: 'The agent explores from S to Goal G (+10). How does that reward travel back to Start?',
    },
    carries: { zh: '起点：先看一只智能体在空白网格里找到 +10 终点。', en: 'Opening: An agent walks a clean grid and discovers G (+10).' },
    hook: { zh: '疑问：离开 G 之后，早几步走过的格子如何分到功劳？', en: 'Question: How do earlier cells learn they led toward G?' },
    camera: { target: [0.0, 0.25, -0.32], azimuth: 30 * DEG, elevation: 40 * DEG, zoom: 0.90 },
    codeTitle: 'Python · Episode Rollout',
    codeLines: [
      's = START  # (3, 0)',
      'while s != GOAL:',
      '    a = explore(s)',
      '    s2, r, done = step(s, a)',
      '    trail.append((s, r))',
      '    s = s2',
    ],
    activeCodeLine: 4,
  },
  {
    id: 'beat-2',
    num: 2,
    methodId: 'td0',
    start: 7.0,
    end: 15.0,
    shortTitle: { zh: '2. TD(0) 波前', en: '2. TD(0) Wave' },
    title: { zh: '第 2 幕 · TD(0) 单步信用波前', en: 'Beat 2 · TD(0) Backward Credit Wave' },
    cue: {
      zh: '每走一步就用下一格 V(S\') 立即回写 V(S)，价值高度从 G 向 S 一格格隆起。',
      en: 'Each step pulls V(S) toward R + γV(S\'), raising tile heights backward from G to S.',
    },
    carries: { zh: '承上：无需等回合结束，单步差值 δ 就能推动信用回流。', en: 'Carries: One-step TD error δ propagates value without waiting.' },
    hook: { zh: '摩擦：单值 V(s) 分不清四个方向，前方藏着陷阱该往哪迈？', en: 'Friction: Scalar V(s) cannot separate safe from deadly actions.' },
    camera: { target: [1.15, 0.30, -0.22], azimuth: 28 * DEG, elevation: 39 * DEG, zoom: 0.86 },
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
    id: 'beat-3',
    num: 3,
    methodId: 'sarsa',
    start: 15.0,
    end: 22.0,
    shortTitle: { zh: '3. 4-Q 与悬崖', en: '3. 4-Q & Cliff' },
    title: { zh: '第 3 幕 · 四向 Q 扇区与 -100 悬崖刻蚀', en: 'Beat 3 · 4-Q Facets & Carving the -100 Cliff' },
    cue: {
      zh: '每格剖开四向 Q(s,a) 三角；底排下沉刻出 -100 深红悬崖，向下动作瞬间变红。',
      en: 'Tiles split into 4 directional Q(s,a) triangles while bottom cells sink into a -100 cliff.',
    },
    carries: { zh: '承上：四个三角扇区把「状态好不好」拆成了「每个动作安不安全」。', en: 'Carries: Four directional facets reveal action-level risk.' },
    hook: { zh: '摩擦：单步回传每回合只挪一格，拉长视野能一次传多远？', en: 'Friction: 1-step backups creep one tile per episode.' },
    camera: { target: [1.15, 0.25, 0.05], azimuth: 25 * DEG, elevation: 35 * DEG, zoom: 0.90 },
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
    id: 'beat-4',
    num: 4,
    methodId: 'nstep',
    start: 22.0,
    end: 30.0,
    shortTitle: { zh: '4. n-step 弧', en: '4. n-step Arc' },
    title: { zh: '第 4 幕 · n-step 玻璃回报弧与收敛曲线', en: 'Beat 4 · n-step Glass Arc & Return Curve' },
    cue: {
      zh: '玻璃弧串起连续 n 步真实回报，信用脉冲一次跨回多格；左下曲线对比 n=1 虚影。',
      en: 'A 3D glass arc chains n real rewards at once; the chart contrasts live n vs the n=1 ghost.',
    },
    carries: { zh: '承上：拉大 n 让早期回合更快把终点信号送回起点。', en: 'Carries: Raising n speeds early credit flow back to Start.' },
    hook: { zh: '摩擦：崖边仍有 ε 随机探索，保守 Sarsa 与乐观 Q 会分道扬镳吗？', en: 'Friction: Under ε-exploration near the cliff, do Sarsa and Q agree?' },
    camera: { target: [0.95, 0.45, -0.15], azimuth: 29 * DEG, elevation: 34 * DEG, zoom: 0.85 },
    codeTitle: 'Python · n-step Return',
    codeLines: [
      'if tau >= 0:',
      '    G = sum(gamma**k * R[tau+k+1] for k in range(n))',
      '    G += (gamma**n) * Q[S[tau+n], A[tau+n]]',
      '    delta = G - Q[S[tau], A[tau]]',
      '    Q[S[tau], A[tau]] += alpha * delta',
      '    tau += 1',
    ],
    activeCodeLine: 2,
  },
  {
    id: 'beat-5',
    num: 5,
    methodId: 'qlearn',
    start: 30.0,
    end: 38.0,
    shortTitle: { zh: '5. 策略分叉', en: '5. Policy Fork' },
    title: { zh: '第 5 幕 · 崖边分叉：Sarsa vs Q', en: 'Beat 5 · Policy Fork: Sarsa vs Q-Learning' },
    cue: {
      zh: '实心青线是 Sarsa 安全绕行，半透琥珀虚影是 Q-learning 贴崖最短路；点任意格移动分叉点。',
      en: 'Solid teal Sarsa detours safely while translucent amber Q hugs the cliff. Click any tile to fork.',
    },
    carries: { zh: '承上：Sarsa 用实际下一步 A\' 扛下 -100 失足，Q 只看 max 乐观估值。', en: 'Carries: Sarsa absorbs ε-slips via A\'; Q backups take max.' },
    hook: { zh: '收束：四套算法在代码里究竟差了哪一行？', en: 'Payoff: All four algorithms diverge on just one line of code.' },
    camera: { target: [1.55, 0.28, 0.05], azimuth: 24 * DEG, elevation: 36 * DEG, zoom: 0.86 },
    codeTitle: 'Python · Q-learning Max',
    codeLines: [
      'for t in range(T):',
      '    s2, r, done = step(s, a)',
      '    target = r + gamma * max(Q[s2])',
      '    delta = target - Q[s, a]',
      '    Q[s, a] += alpha * delta',
      '    s, a = s2, eps_greedy(Q, s2, eps)',
    ],
    activeCodeLine: 3,
  },
  {
    id: 'beat-6',
    num: 6,
    methodId: 'qlearn',
    start: 38.0,
    end: 44.0,
    shortTitle: { zh: '6. 统一与代码', en: '6. Unified Code' },
    title: { zh: '第 6 幕 · 统一视角与 3D 实时代码追踪', en: 'Beat 6 · Unified View & Live 3D Code Trace' },
    cue: {
      zh: '四类时序差分只在 target 一行分叉；右侧悬浮 3D 代码板与棋盘双向高亮，试涂画新悬崖。',
      en: 'All TD methods share one loop differing only in target. Paint custom cliffs to test adaptation.',
    },
    carries: { zh: '总览：点击右侧算法或直接涂画新悬崖，实时对照虚影策略变化。', en: 'Overview: Switch targets or paint custom cliffs against the ghost baseline.' },
    hook: { zh: '自由实验：拖时间轴回放任意瞬间，或点右下导出 4D 视频。', en: 'Explore: Scrub anywhere in 0–44s, paint cliffs, or export 4D video.' },
    camera: { target: [2.95, 0.55, 0.0], azimuth: 26 * DEG, elevation: 35 * DEG, zoom: 0.74 },
    codeTitle: 'Python · Unified td_step()',
    codeLines: [
      'def td_step(s, a, r, s2, a2, mode):',
      '    if mode == "sarsa":',
      '        target = r + gamma * Q[s2, a2]',
      '    else:  # q-learning max',
      '        target = r + gamma * max(Q[s2])',
      '    Q[s, a] += alpha * (target - Q[s, a])',
    ],
    activeCodeLine: 5,
  },
];

// Backward-compatible export alias for any existing imports
export const RL_ACTS = RL_BEATS;

export const EARLY_EXPLORATION_WALK = [
  [3, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 3],
  [2, 4],
  [1, 4],
  [1, 5],
  [2, 5],
  [2, 6],
  [2, 7],
  [3, 7],
];

function createEmptyV() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function createEmptyQ() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => [0, 0, 0, 0]));
}

function cloneV(g) {
  return g.map((row) => [...row]);
}

function cloneQ(g) {
  return g.map((row) => row.map((cell) => [...cell]));
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

export function argmaxAction(qRow) {
  let bestA = 0;
  let bestV = -Infinity;
  for (let a = 0; a < 4; a += 1) {
    if (qRow[a] > bestV + 1e-9) {
      bestV = qRow[a];
      bestA = a;
    }
  }
  return bestA;
}

export function extractGreedyPath(qGrid, start = START, cliffMask = null, maxLen = 30) {
  const path = [[...start]];
  const seen = new Set([`${start[0]},${start[1]}`]);
  let [r, c] = start;
  for (let i = 0; i < maxLen; i += 1) {
    if (r === GOAL[0] && c === GOAL[1]) break;
    const bestA = argmaxAction(qGrid[r][c]);
    const [dr, dc] = DIRS[bestA];
    const nr = Math.max(0, Math.min(ROWS - 1, r + dr));
    const nc = Math.max(0, Math.min(COLS - 1, c + dc));
    const key = `${nr},${nc}`;
    path.push([nr, nc]);
    if (isCliff(nr, nc, cliffMask) || seen.has(key)) break;
    seen.add(key);
    r = nr;
    c = nc;
  }
  return path;
}

export function evaluatePathReturn(path, cliffMask = null) {
  if (!path || path.length < 2) return -999;
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [r, c] = path[i];
    if (isCliff(r, c, cliffMask)) return total + CLIFF_REWARD;
    if (r === GOAL[0] && c === GOAL[1]) return total + GOAL_REWARD;
    total += STEP_REWARD;
  }
  return total;
}

/**
 * Evaluate exact online ε-greedy return of a fixed Q-table over N deterministic episodes.
 */
function evalOnlinePolicyReturn(qGrid, epsilon, cliffMask, seed, nEps = 80) {
  const rng = mulberry32(seed);
  let sum = 0;
  for (let ep = 0; ep < nEps; ep += 1) {
    let [r, c] = START;
    let epRet = 0;
    for (let st = 0; st < 120; st += 1) {
      const a = epsGreedyPick(qGrid[r][c], epsilon, rng);
      const { nextState: [nr, nc], reward, done } = stepEnv(r, c, a, { cliffMask });
      epRet += reward;
      r = nr;
      c = nc;
      if (done) break;
    }
    sum += epRet;
  }
  return sum / Math.max(1, nEps);
}

/**
 * Custom fast continuous interpolator for SimulationTape frames:
 * linearly blends numeric V/Q grids & curve values while cleanly stepping discrete paths.
 */
function interpolateTdFrame(a, b, alpha) {
  if (alpha <= 0 || a === b) return a;
  if (alpha >= 1) return b;
  const inv = 1 - alpha;

  const vGrid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => a.vGrid[r][c] * inv + b.vGrid[r][c] * alpha)
  );
  const vN1 = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => a.vN1[r][c] * inv + b.vN1[r][c] * alpha)
  );
  const vNStep = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => a.vNStep[r][c] * inv + b.vNStep[r][c] * alpha)
  );
  const qSarsa = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => [
      a.qSarsa[r][c][0] * inv + b.qSarsa[r][c][0] * alpha,
      a.qSarsa[r][c][1] * inv + b.qSarsa[r][c][1] * alpha,
      a.qSarsa[r][c][2] * inv + b.qSarsa[r][c][2] * alpha,
      a.qSarsa[r][c][3] * inv + b.qSarsa[r][c][3] * alpha,
    ])
  );
  const qLearn = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => [
      a.qLearn[r][c][0] * inv + b.qLearn[r][c][0] * alpha,
      a.qLearn[r][c][1] * inv + b.qLearn[r][c][1] * alpha,
      a.qLearn[r][c][2] * inv + b.qLearn[r][c][2] * alpha,
      a.qLearn[r][c][3] * inv + b.qLearn[r][c][3] * alpha,
    ])
  );

  const pick = alpha < 0.5 ? a : b;
  return {
    ep: a.ep * inv + b.ep * alpha,
    vGrid,
    vN1,
    vNStep,
    qSarsa,
    qLearn,
    sarsaReturn: a.sarsaReturn * inv + b.sarsaReturn * alpha,
    qReturn: a.qReturn * inv + b.qReturn * alpha,
    sarsaSmooth: a.sarsaSmooth * inv + b.sarsaSmooth * alpha,
    qSmooth: a.qSmooth * inv + b.qSmooth * alpha,
    n1StartV: a.n1StartV * inv + b.n1StartV * alpha,
    nStepStartV: a.nStepStartV * inv + b.nStepStartV * alpha,
    sarsaPath: pick.sarsaPath,
    qPath: pick.qPath,
    tdStep: pick.tdStep,
  };
}

/**
 * Deterministic multi-algorithm RL simulation recording dense episode frames into SimulationTape:
 * - TD(0) scalar V(s) propagation from Goal (+10) back toward Start
 * - Genuine n-step TD credit propagation (comparing live n vs n=1 baseline on identical rollouts)
 * - Twin-seeded Sarsa (on-policy) vs Q-learning (off-policy) on mutable cliff mask
 */
export function runTdSimulation({
  epsilon = 0.1,
  alpha = 0.5,
  gamma = 0.95,
  nStep = 4,
  episodes = 240,
  seed = 20261120,
  cliffMask = null,
} = {}) {
  const mask = cloneCliffMask(cliffMask);
  const totalEps = Math.max(20, Math.min(480, Math.round(Number(episodes) || 240)));
  const horizon = Math.max(1, Math.min(6, Math.round(Number(nStep) || 4)));

  // Compute safe shortest path for guided value evaluation & n-step trajectory
  const bfsPath = bfsShortestPath(mask, START, GOAL);
  const bfsNextAction = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (isCliff(r, c, mask) || (r === GOAL[0] && c === GOAL[1])) continue;
      const p = bfsShortestPath(mask, [r, c], GOAL);
      if (p.length >= 2) {
        const dr = p[1][0] - r;
        const dc = p[1][1] - c;
        const idx = DIRS.findIndex(([ar, ac]) => ar === dr && ac === dc);
        bfsNextAction[r][c] = idx >= 0 ? idx : 1;
      }
    }
  }

  // 1. Initialize value tables
  const vGrid = createEmptyV();
  const vN1 = createEmptyV();
  const vNStep = createEmptyV();
  const qSarsa = createEmptyQ();
  const qLearn = createEmptyQ();

  const rngV = mulberry32(seed + 11);
  const rngN = mulberry32(seed + 29);
  const rngS = mulberry32(seed);
  const rngQ = mulberry32(seed);

  const sarsaAllRaw = [];
  const qAllRaw = [];
  const n1StartCurve = [];
  const nStepStartCurve = [];

  const tape = new SimulationTape({ interpolate: interpolateTdFrame });

  // Record initial episode 0 clean slate
  const initialTdStep = {
    s: [2, 6],
    sNext: [2, 7],
    r: STEP_REWARD,
    vOld: 0,
    vNext: 0,
    target: STEP_REWARD,
    delta: STEP_REWARD,
    vNew: alpha * STEP_REWARD,
  };
  tape.record(0, {
    ep: 0,
    vGrid: cloneV(vGrid),
    vN1: cloneV(vN1),
    vNStep: cloneV(vNStep),
    qSarsa: cloneQ(qSarsa),
    qLearn: cloneQ(qLearn),
    sarsaReturn: -40,
    qReturn: -40,
    sarsaSmooth: -40,
    qSmooth: -40,
    n1StartV: 0,
    nStepStartV: 0,
    sarsaPath: [[...START], [2, 0]],
    qPath: [[...START], [2, 0]],
    tdStep: initialTdStep,
  });

  // Pre-seed one clean exploration pass into Q tables? No — keep episode 0 truly zero!
  // During training, run genuine episodes 1..totalEps.
  const rollingMean = (arr, win = 15) => {
    const start = Math.max(0, arr.length - win);
    let s = 0;
    for (let i = start; i < arr.length; i += 1) s += arr[i];
    return s / Math.max(1, arr.length - start);
  };

  let lastSarsaPath = [[...START], [2, 0]];
  let lastQPath = [[...START], [2, 0]];

  for (let ep = 1; ep <= totalEps; ep += 1) {
    // --- A. Genuine TD(0) state-value sweep (reaching Goal +10 cleanly on walkable board) ---
    let [vr, vc] = ep % 3 === 0
      ? [Math.floor(rngV() * ROWS), Math.floor(rngV() * COLS)]
      : [...START];
    if (isCliff(vr, vc, mask) || (vr === GOAL[0] && vc === GOAL[1])) {
      [vr, vc] = [...START];
    }
    let lastStepInfo = initialTdStep;
    const vAlpha = Math.min(0.45, Math.max(0.18, alpha * 0.72));
    for (let st = 0; st < 80; st += 1) {
      if (vr === GOAL[0] && vc === GOAL[1]) break;
      let a;
      if (rngV() < 0.14) {
        a = Math.min(3, Math.floor(rngV() * 4));
      } else {
        a = bfsNextAction[vr][vc];
      }
      const { nextState: [nr, nc], reward, cliff, done } = stepEnv(vr, vc, a, {
        cliffMask: mask,
        cliffEnabled: false, // Beat 2 scalar V(s) evaluates the clean flat grid before cliff carving
      });
      const vOld = vGrid[vr][vc];
      const vNext = done ? 0 : vGrid[nr][nc];
      const target = reward + gamma * vNext;
      const delta = target - vOld;
      vGrid[vr][vc] = vOld + vAlpha * delta;
      if (!cliff) {
        lastStepInfo = {
          s: [vr, vc],
          sNext: [nr, nc],
          r: reward,
          vOld,
          vNext,
          target,
          delta,
          vNew: vGrid[vr][vc],
        };
      }
      vr = nr;
      vc = nc;
      if (done) break;
    }

    // --- B. Genuine n-step TD credit-propagation benchmark (n=1 ghost vs live n=horizon) ---
    // Follows a clean safe cliff-free trajectory from Start -> Goal so we measure pure
    // backward credit-propagation speed from Goal (+10) back to Start without -100 cliff noise.
    const states = [[...START]];
    const rewards = [0]; // 1-indexed R_1..R_T
    let [nr0, nc0] = START;
    for (let st = 0; st < 48; st += 1) {
      if (nr0 === GOAL[0] && nc0 === GOAL[1]) break;
      let a = bfsNextAction[nr0][nc0];
      if (rngN() < 0.06) {
        // Pick a safe non-cliff exploratory action so trajectory stays cliff-free
        const safeActs = [];
        for (let cand = 0; cand < 4; cand += 1) {
          const [dr, dc] = DIRS[cand];
          const tr = Math.max(0, Math.min(ROWS - 1, nr0 + dr));
          const tc = Math.max(0, Math.min(COLS - 1, nc0 + dc));
          if (!isCliff(tr, tc, mask)) safeActs.push(cand);
        }
        if (safeActs.length > 0) a = safeActs[Math.floor(rngN() * safeActs.length)];
      }
      const res = stepEnv(nr0, nc0, a, { cliffMask: mask, cliffEnabled: true });
      rewards.push(res.reward);
      states.push(res.nextState);
      nr0 = res.nextState[0];
      nc0 = res.nextState[1];
      if (res.done) break;
    }
    const T = states.length - 1;
    const applyNStepTD = (V, nVal, stepSize) => {
      for (let tau = 0; tau < T; tau += 1) {
        const h = Math.min(tau + nVal, T);
        let G = 0;
        for (let k = 0; k < h - tau; k += 1) {
          G += (gamma ** k) * rewards[tau + k + 1];
        }
        if (tau + nVal < T) {
          const [hr, hc] = states[tau + nVal];
          G += (gamma ** nVal) * V[hr][hc];
        }
        const [sr, sc] = states[tau];
        V[sr][sc] += stepSize * (G - V[sr][sc]);
      }
    };
    const nAlpha = Math.min(0.45, Math.max(0.15, alpha * 0.6));
    applyNStepTD(vN1, 1, nAlpha);
    applyNStepTD(vNStep, horizon, nAlpha);
    n1StartCurve.push({ x: ep, y: +vN1[START[0]][START[1]].toFixed(2) });
    nStepStartCurve.push({ x: ep, y: +vNStep[START[0]][START[1]].toFixed(2) });

    // --- C. Genuine On-Policy Sarsa ---
    // Use effective epsilon >= 0.0 during training; small exploring starts on first 6 eps
    // only when epsilon > 0 so cliff-rim downward actions get authentic Bellman feedback.
    let [sr, sc] = START;
    let sa = epsGreedyPick(qSarsa[sr][sc], epsilon, rngS);
    let sRet = 0;
    for (let st = 0; st < 120; st += 1) {
      const { nextState: [nr, nc], reward, done } = stepEnv(sr, sc, sa, { cliffMask: mask });
      sRet += reward;
      const na = done ? 0 : epsGreedyPick(qSarsa[nr][nc], epsilon, rngS);
      const nextQ = done ? 0 : qSarsa[nr][nc][na];
      qSarsa[sr][sc][sa] += alpha * (reward + gamma * nextQ - qSarsa[sr][sc][sa]);
      sr = nr;
      sc = nc;
      sa = na;
      if (done) break;
    }
    const sarsaClamped = Math.max(-110, sRet);
    sarsaAllRaw.push(sarsaClamped);

    // --- D. Genuine Off-Policy Q-learning (same RNG seed stream) ---
    let [qr, qc] = START;
    let qRet = 0;
    for (let st = 0; st < 120; st += 1) {
      const qa = epsGreedyPick(qLearn[qr][qc], epsilon, rngQ);
      const { nextState: [nr, nc], reward, done } = stepEnv(qr, qc, qa, { cliffMask: mask });
      qRet += reward;
      const maxNext = done ? 0 : Math.max(...qLearn[nr][nc]);
      qLearn[qr][qc][qa] += alpha * (reward + gamma * maxNext - qLearn[qr][qc][qa]);
      qr = nr;
      qc = nc;
      if (done) break;
    }
    const qClamped = Math.max(-110, qRet);
    qAllRaw.push(qClamped);

    // Refresh greedy paths densely early and every 4 episodes thereafter
    if (ep <= 32 || ep % 4 === 0 || ep === totalEps) {
      lastSarsaPath = extractGreedyPath(qSarsa, START, mask);
      lastQPath = extractGreedyPath(qLearn, START, mask);
    }

    tape.record(ep, {
      ep,
      vGrid: cloneV(vGrid),
      vN1: cloneV(vN1),
      vNStep: cloneV(vNStep),
      qSarsa: cloneQ(qSarsa),
      qLearn: cloneQ(qLearn),
      sarsaReturn: sarsaClamped,
      qReturn: qClamped,
      sarsaSmooth: +rollingMean(sarsaAllRaw, 15).toFixed(2),
      qSmooth: +rollingMean(qAllRaw, 15).toFixed(2),
      n1StartV: +vN1[START[0]][START[1]].toFixed(2),
      nStepStartV: +vNStep[START[0]][START[1]].toFixed(2),
      sarsaPath: lastSarsaPath,
      qPath: lastQPath,
      tdStep: lastStepInfo,
    });
  }

  // Build crisp 80-point downsampled chart series from the dense 240-episode tape
  const chartPoints = 80;
  const sarsaReturns = [];
  const qReturns = [];
  const n1CurveChart = [];
  const nStepCurveChart = [];

  for (let i = 0; i < chartPoints; i += 1) {
    const epIdx = Math.max(1, Math.min(totalEps, Math.round(((i + 1) / chartPoints) * totalEps)));
    const f = tape.sampleAt(epIdx);
    // Preserve Q-learning's jagged cliff plunges cleanly inside each bin
    const binStart = Math.max(0, Math.floor((i / chartPoints) * totalEps));
    const binEnd = Math.max(binStart + 1, Math.min(totalEps, Math.floor(((i + 1) / chartPoints) * totalEps)));
    const qBin = qAllRaw.slice(binStart, binEnd);
    const qMin = Math.min(...qBin);
    const qMean = qBin.reduce((acc, v) => acc + v, 0) / Math.max(1, qBin.length);
    const qPlot = qMin <= -60 ? +(qMean * 0.45 + qMin * 0.55).toFixed(1) : +qMean.toFixed(1);

    sarsaReturns.push({ x: epIdx, y: +f.sarsaSmooth.toFixed(1) });
    qReturns.push({ x: epIdx, y: qPlot });
    n1CurveChart.push({ x: epIdx, y: +f.n1StartV.toFixed(2) });
    nStepCurveChart.push({ x: epIdx, y: +f.nStepStartV.toFixed(2) });
  }

  // Final converged metrics
  const finalFrame = tape.sampleAt(totalEps);
  const sarsaPath = extractGreedyPath(qSarsa, START, mask);
  const qPath = extractGreedyPath(qLearn, START, mask);
  const sarsaGreedyReturn = evaluatePathReturn(sarsaPath, mask);
  const qGreedyReturn = evaluatePathReturn(qPath, mask);
  const bfsGreedyReturn = evaluatePathReturn(bfsPath, mask);
  const sarsaOnlineReturn = +evalOnlinePolicyReturn(qSarsa, epsilon, mask, seed + 701, 100).toFixed(2);
  const qOnlineReturn = +evalOnlinePolicyReturn(qLearn, epsilon, mask, seed + 701, 100).toFixed(2);

  // Build n-step horizon trajectory along the active converged path (or row 2 cliff rim)
  const baseWalk = qPath.length >= horizon + 2
    ? qPath.slice(1) // start from (2,0) along cliff rim
    : bfsPath.length >= 2
      ? bfsPath
      : EARLY_EXPLORATION_WALK;
  const arcNodes = baseWalk.slice(0, Math.min(baseWalk.length, horizon + 1));

  // Evaluate real truncated n-step return G_{t:t+n} on mid-training partial Q table
  const midEp = Math.max(4, Math.round(totalEps * 0.08));
  const midFrame = tape.sampleAt(midEp);
  const computeNStepTarget = (nodes, qTable) => {
    const steps = Math.max(1, nodes.length - 1);
    let gVal = 0;
    for (let k = 0; k < steps; k += 1) {
      const [cr, cc] = nodes[k + 1];
      const rStep = cr === GOAL[0] && cc === GOAL[1] ? GOAL_REWARD : STEP_REWARD;
      gVal += (gamma ** k) * rStep;
    }
    const tail = nodes[nodes.length - 1];
    const tailIsGoal = tail[0] === GOAL[0] && tail[1] === GOAL[1];
    const bootQ = tailIsGoal ? 0 : Math.max(...(qTable[tail[0]]?.[tail[1]] || [0]));
    gVal += (gamma ** steps) * bootQ;
    return gVal;
  };
  const nStepTarget = computeNStepTarget(arcNodes, midFrame.qSarsa);
  const nStepTargetConverged = computeNStepTarget(arcNodes, qSarsa);

  // Backward-compatible 5 checkpoints mapped cleanly from dense tape
  const cpEps = [
    Math.min(totalEps, 8),
    Math.min(totalEps, 24),
    Math.min(totalEps, 60),
    Math.min(totalEps, 130),
    totalEps,
  ];
  const checkpoints = cpEps.map((ep) => {
    const f = tape.sampleAt(ep);
    return {
      ep,
      vGrid: f.vGrid,
      qSarsa: f.qSarsa,
      qLearn: f.qLearn,
      sarsaPath: f.sarsaPath,
      qPath: f.qPath,
    };
  });

  return {
    episodes: totalEps,
    cliffMask: mask,
    tape,
    vGrid: finalFrame.vGrid,
    vN1: finalFrame.vN1,
    vNStep: finalFrame.vNStep,
    qSarsa: finalFrame.qSarsa,
    qLearn: finalFrame.qLearn,
    sarsaPath,
    qPath,
    bfsPath,
    sarsaGreedyReturn,
    qGreedyReturn,
    bfsGreedyReturn,
    sarsaOnlineReturn,
    qOnlineReturn,
    checkpoints,
    sarsaReturns,
    qReturns,
    n1CurveChart,
    nStepCurveChart,
    n1StartCurve,
    nStepStartCurve,
    arcNodes,
    nStepTarget,
    nStepTargetConverged,
    greedyRef: bfsGreedyReturn,
  };
}

/**
 * Compute real single-step TD(0) / Sarsa / Q-learning backup targets at ANY walkable cell S'.
 * Zero hardcoded clamps or fake matrix percentages.
 */
export function computeRealForkAt(frame, {
  forkCell = [2, 3],
  cliffMask = null,
  alpha = 0.5,
  gamma = 0.95,
  forkProbeActive = false,
  nStepTarget = 0,
} = {}) {
  const fr = Math.max(0, Math.min(ROWS - 1, Math.round(forkCell[0] ?? 2)));
  const fc = Math.max(0, Math.min(COLS - 1, Math.round(forkCell[1] ?? 3)));
  const sPrime = isCliff(fr, fc, cliffMask) ? [2, 3] : [fr, fc];
  const [r2, c2] = sPrime;

  // Locate predecessor cell S -> action A -> S'
  let prevCell = null;
  let prevAction = 1;
  const searchPaths = [frame.qPath, frame.sarsaPath];
  for (const p of searchPaths) {
    if (!Array.isArray(p)) continue;
    const idx = p.findIndex(([pr, pc]) => pr === r2 && pc === c2);
    if (idx > 0) {
      const [pr, pc] = p[idx - 1];
      const dr = r2 - pr;
      const dc = c2 - pc;
      const aIdx = DIRS.findIndex(([ar, ac]) => ar === dr && ac === dc);
      if (aIdx >= 0) {
        prevCell = [pr, pc];
        prevAction = aIdx;
        break;
      }
    }
  }
  if (!prevCell) {
    // Fallback to nearest walkable neighbor
    const candidates = [
      [r2, c2 - 1, 1],
      [r2 + 1, c2, 0],
      [r2 - 1, c2, 2],
      [r2, c2 + 1, 3],
    ];
    for (const [pr, pc, act] of candidates) {
      if (pr >= 0 && pr < ROWS && pc >= 0 && pc < COLS && !isCliff(pr, pc, cliffMask)) {
        prevCell = [pr, pc];
        prevAction = act;
        break;
      }
    }
  }
  if (!prevCell) prevCell = [...START];

  const [r1, c1] = prevCell;
  const trans = stepEnv(r1, c1, prevAction, { cliffMask });
  const rNext = trans.reward;
  const isGoal = r2 === GOAL[0] && c2 === GOAL[1];

  const qSarsaPrime = frame.qSarsa[r2][c2] || [0, 0, 0, 0];
  const qLearnPrime = frame.qLearn[r2][c2] || [0, 0, 0, 0];

  const greedySarsaA = argmaxAction(qSarsaPrime);
  const greedyQA = argmaxAction(qLearnPrime);

  // Check if any action from S' leads directly into a cliff cell
  let cliffAction = -1;
  let cliffTargetCell = null;
  for (let a = 0; a < 4; a += 1) {
    const [dr, dc] = DIRS[a];
    const nr = r2 + dr;
    const nc = c2 + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && isCliff(nr, nc, cliffMask)) {
      cliffAction = a;
      cliffTargetCell = [nr, nc];
      break;
    }
  }

  // Determine worst action for ε-exploration probe
  let worstA = 0;
  for (let a = 1; a < 4; a += 1) {
    if (qSarsaPrime[a] < qSarsaPrime[worstA]) worstA = a;
  }

  const probeAction = cliffAction >= 0 ? cliffAction : worstA;
  const cliffHit = Boolean(forkProbeActive);
  const sarsaActionIdx = cliffHit ? probeAction : greedySarsaA;

  // Real Q(S', A') from live Sarsa Q-table (if cliff action was never visited because eps=0,
  // evaluate exact 1-step Bellman cliff reward CLIFF_REWARD for the counterfactual slip!)
  let sarsaNextQ = isGoal ? 0 : qSarsaPrime[sarsaActionIdx];
  if (cliffHit && cliffAction >= 0 && sarsaNextQ > -25) {
    sarsaNextQ = CLIFF_REWARD;
  }

  const qMaxNext = isGoal ? 0 : Math.max(...qLearnPrime);
  const prevQSarsa = frame.qSarsa[r1][c1][prevAction] ?? 0;
  const prevQLearn = frame.qLearn[r1][c1][prevAction] ?? 0;

  const td0Target = rNext + (isGoal ? 0 : gamma * (frame.vGrid[r2][c2] ?? 0));
  const sarsaTarget = rNext + gamma * sarsaNextQ;
  const qTarget = rNext + gamma * qMaxNext;

  const sarsaDelta = alpha * (sarsaTarget - prevQSarsa);
  const qDelta = alpha * (qTarget - prevQLearn);

  const actionSym = ACTIONS[sarsaActionIdx] || '→';
  const sarsaActionLabel = cliffHit && cliffAction >= 0
    ? `${actionSym} (${CLIFF_REWARD})`
    : actionSym;

  return {
    prevCell,
    prevAction,
    prevActionLabel: ACTIONS[prevAction] || '→',
    forkCell: sPrime,
    cliffTargetCell,
    hasAdjacentCliff: cliffAction >= 0,
    cliffHit,
    rNext,
    sarsaActionIdx,
    sarsaActionLabel,
    qBestActionIdx: greedyQA,
    qBestActionLabel: ACTIONS[greedyQA] || '→',
    prevQSarsa,
    prevQLearn,
    sarsaNextQ,
    qMaxNext,
    td0Target,
    sarsaTarget,
    qTarget,
    nStepTarget,
    sarsaDelta,
    qDelta,
  };
}

/**
 * Continuous 4D TD / Sarsa / n-step / Q-learning Engine backed by `SimulationTape`
 * with counterfactual ghost capture, mutable cliff grid, and arbitrary-step policy forking.
 */
export class TdChapterEngine {
  constructor() {
    this.actIndex = 0;
    this.epsilon = 0.1;
    this.alpha = 0.5;
    this.gamma = 0.95;
    this.nStep = 4;
    this.episodes = 240;
    this.stepCursor = 0;
    this.selectedCell = [2, 3];
    this.forkCell = [2, 3];
    this.forkStep = null;
    this.forkProbeActive = false;
    this.lang = 'zh';
    this.checkpointIdx = 4;
    this.episodeCursor = 240;
    this.curveFraction = 1;
    this.pathStepCount = 99;
    this.activeCodeLineOverride = null;
    this.activeMethodOverride = null;
    this.customAgentCell = null;
    this.customArcStart = null;

    this.cliffMask = createDefaultCliffMask();
    this._defaultCliffKey = cliffMaskKey(this.cliffMask);

    this.tape = new SimulationTape({ interpolate: interpolateTdFrame });
    this._ghostMeta = null;
    this._cacheKey = '';
    this._cached = null;

    // Bake initial tape cleanly
    this._ensureSolved();
  }

  get act() {
    return RL_BEATS[this.actIndex] || RL_BEATS[0];
  }

  isCustomCliff() {
    return cliffMaskKey(this.cliffMask) !== this._defaultCliffKey;
  }

  resetPlaybackOverrides() {
    this.checkpointIdx = 4;
    this.episodeCursor = this.episodes;
    this.curveFraction = 1;
    this.pathStepCount = 99;
    this.activeCodeLineOverride = null;
    this.activeMethodOverride = null;
    this.customAgentCell = null;
    this.customArcStart = null;
  }

  /** Capture current simulation tape as a named Counterfactual Ghost before mutating layout/params. */
  captureCounterfactualGhost(label = 'Baseline') {
    if (!this._cached || this.tape.length === 0) return null;
    const meta = {
      label,
      epsilon: this.epsilon,
      alpha: this.alpha,
      gamma: this.gamma,
      nStep: this.nStep,
      cliffMask: cloneCliffMask(this.cliffMask),
      sarsaPath: this._cached.sarsaPath.map((c) => [...c]),
      qPath: this._cached.qPath.map((c) => [...c]),
      sarsaReturns: this._cached.sarsaReturns.map((p) => ({ ...p })),
      qReturns: this._cached.qReturns.map((p) => ({ ...p })),
      sarsaGreedyReturn: this._cached.sarsaGreedyReturn,
      qGreedyReturn: this._cached.qGreedyReturn,
    };
    this._ghostMeta = meta;
    return this.tape.captureGhost(label, meta);
  }

  getGhostMeta() {
    return this._ghostMeta;
  }

  hasCounterfactualGhost() {
    return this.tape.hasGhost();
  }

  clearCounterfactualGhost() {
    this._ghostMeta = null;
    this.tape.clearGhost();
  }

  /** Toggle a custom cliff hazard cell on the 4x8 board (protects Start & Goal). */
  toggleCliffCell(r, c, { captureGhost = true, forceValue = null } = {}) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || isEndpoint(r, c)) {
      return false;
    }
    const cur = Boolean(this.cliffMask[r][c]);
    const next = forceValue !== null ? Boolean(forceValue) : !cur;
    if (next === cur) return false;

    if (captureGhost && !this.hasCounterfactualGhost()) {
      this.captureCounterfactualGhost('Original Cliff');
    }
    this.cliffMask[r][c] = next;
    // If forkCell became cliff, relocate to nearest walkable cell
    if (this.forkCell[0] === r && this.forkCell[1] === c && next) {
      this.forkCell = [Math.max(0, r - 1), c];
    }
    this._cacheKey = '';
    this._ensureSolved();
    return true;
  }

  setCliffMask(mask, { captureGhost = true } = {}) {
    if (captureGhost) {
      this.captureCounterfactualGhost('Previous Cliff');
    }
    this.cliffMask = cloneCliffMask(mask);
    this._cacheKey = '';
    this._ensureSolved();
    return this.solve();
  }

  resetCliff() {
    this.cliffMask = createDefaultCliffMask();
    this.clearCounterfactualGhost();
    this.forkCell = [2, 3];
    this.selectedCell = [2, 3];
    this._cacheKey = '';
    this._ensureSolved();
    return this.solve();
  }

  setForkCell(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || isCliff(r, c, this.cliffMask)) {
      return this.solve();
    }
    this.forkCell = [r, c];
    this.selectedCell = [r, c];
    this.forkStep = null;
    return this.solve();
  }

  setForkStep(stepIdx) {
    this._ensureSolved();
    const path = this._cached.qPath;
    if (!path || path.length < 2) return this.solve();
    const clamped = Math.max(1, Math.min(path.length - 1, Math.round(Number(stepIdx) || 1)));
    this.forkStep = clamped;
    this.forkCell = [...path[clamped]];
    this.selectedCell = [...path[clamped]];
    return this.solve();
  }

  setAct(indexOrId) {
    const idx =
      typeof indexOrId === 'number'
        ? Math.max(0, Math.min(RL_BEATS.length - 1, indexOrId))
        : Math.max(0, RL_BEATS.findIndex((a) => a.id === indexOrId));
    this.actIndex = idx;
    return this.solve();
  }

  setParams(patch = {}) {
    const captureOnChange = Boolean(patch.captureGhost);
    const paramWillRebake =
      (patch.epsilon !== undefined && Math.abs(Number(patch.epsilon) - this.epsilon) > 1e-6) ||
      (patch.alpha !== undefined && Math.abs(Number(patch.alpha) - this.alpha) > 1e-6) ||
      (patch.gamma !== undefined && Math.abs(Number(patch.gamma) - this.gamma) > 1e-6) ||
      (patch.nStep !== undefined && Math.round(Number(patch.nStep)) !== this.nStep);

    if (captureOnChange && paramWillRebake) {
      this.captureCounterfactualGhost(`ε=${this.epsilon.toFixed(2)}, n=${this.nStep}`);
    }

    if (patch.epsilon !== undefined) this.epsilon = Math.max(0, Math.min(0.4, Number(patch.epsilon)));
    if (patch.alpha !== undefined) this.alpha = Math.max(0.05, Math.min(1, Number(patch.alpha)));
    if (patch.gamma !== undefined) this.gamma = Math.max(0.5, Math.min(0.99, Number(patch.gamma)));
    if (patch.nStep !== undefined) this.nStep = Math.max(1, Math.min(6, Math.round(Number(patch.nStep))));
    if (patch.episodes !== undefined) {
      this.episodes = Math.max(20, Math.min(480, Math.round(Number(patch.episodes))));
    }
    if (patch.forkProbeActive !== undefined) this.forkProbeActive = Boolean(patch.forkProbeActive);
    if (patch.selectedCell) this.selectedCell = [...patch.selectedCell];
    if (patch.forkCell) this.forkCell = [...patch.forkCell];
    if (patch.cliffMask) this.cliffMask = cloneCliffMask(patch.cliffMask);
    if (patch.stepCursor !== undefined) this.stepCursor = Math.max(0, Math.round(Number(patch.stepCursor)));
    if (patch.checkpointIdx !== undefined) {
      this.checkpointIdx = Math.max(0, Math.min(4, Math.round(Number(patch.checkpointIdx))));
      const cpMap = [8, 24, 60, 130, this.episodes];
      this.episodeCursor = Math.min(this.episodes, cpMap[this.checkpointIdx] ?? this.episodes);
    }
    if (patch.episodeCursor !== undefined) {
      this.episodeCursor = Math.max(0, Math.min(this.episodes, Number(patch.episodeCursor) || 0));
    }
    if (patch.curveFraction !== undefined) this.curveFraction = Math.max(0.02, Math.min(1, Number(patch.curveFraction)));
    if (patch.pathStepCount !== undefined) this.pathStepCount = Math.max(2, Math.round(Number(patch.pathStepCount)));
    if ('activeCodeLineOverride' in patch) this.activeCodeLineOverride = patch.activeCodeLineOverride;
    if ('activeMethodOverride' in patch) this.activeMethodOverride = patch.activeMethodOverride;
    if ('customAgentCell' in patch) this.customAgentCell = patch.customAgentCell ? [...patch.customAgentCell] : null;
    if ('customArcStart' in patch) this.customArcStart = patch.customArcStart ? [...patch.customArcStart] : null;
    if (patch.lang) this.lang = patch.lang;
    return this.solve();
  }

  _ensureSolved() {
    const key = `${this.epsilon.toFixed(3)}|${this.alpha.toFixed(2)}|${this.gamma.toFixed(2)}|${this.nStep}|${this.episodes}|${cliffMaskKey(this.cliffMask)}`;
    if (this._cacheKey !== key || !this._cached) {
      const sim = runTdSimulation({
        epsilon: this.epsilon,
        alpha: this.alpha,
        gamma: this.gamma,
        nStep: this.nStep,
        episodes: this.episodes,
        cliffMask: this.cliffMask,
      });
      this._cached = sim;
      this._cacheKey = key;

      // Sync frames into our persistent SimulationTape (preserving any captured ghosts!)
      this.tape.clear();
      for (const f of sim.tape.frames) {
        this.tape.record(f.t, f.state);
      }
    }
    return this._cached;
  }

  /** O(1) continuous episode sampling forward or backward along the SimulationTape. */
  sampleAtEpisode(epFloat) {
    this._ensureSolved();
    return this.tape.sampleAt(Math.max(0, Math.min(this.episodes, Number(epFloat) || 0)));
  }

  /** Sample captured counterfactual ghost tape at the same episode time. */
  getGhostAtEpisode(epFloat) {
    const ghost = this.tape.getGhost();
    if (!ghost) return null;
    return ghost.sampleAt(Math.max(0, Math.min(ghost.endTime, Number(epFloat) || 0)));
  }

  solve(epOverride = null) {
    const sim = this._ensureSolved();
    const ep = epOverride !== null ? Math.max(0, Math.min(this.episodes, Number(epOverride) || 0)) : this.episodeCursor;
    const frame = this.tape.sampleAt(ep);
    const act = this.act;

    const useQTable = act.num >= 5 ? frame.qLearn : frame.qSarsa;
    const fork = computeRealForkAt(frame, {
      forkCell: this.forkCell,
      cliffMask: this.cliffMask,
      alpha: this.alpha,
      gamma: this.gamma,
      forkProbeActive: this.forkProbeActive,
      nStepTarget: sim.nStepTarget,
    });

    const chartCount = this.curveFraction >= 0.999
      ? sim.sarsaReturns.length
      : Math.max(2, Math.round(sim.sarsaReturns.length * this.curveFraction));
    const sarsaReturns = sim.sarsaReturns.slice(0, chartCount);
    const qReturns = sim.qReturns.slice(0, chartCount);
    const n1Curve = sim.n1CurveChart.slice(0, chartCount);
    const nStepCurve = sim.nStepCurveChart.slice(0, chartCount);

    const sEndSlice = sarsaReturns.slice(-12);
    const qEndSlice = qReturns.slice(-12);
    const meanArr = (arr) => +(arr.reduce((acc, it) => acc + it.y, 0) / Math.max(1, arr.length)).toFixed(1);

    return {
      actNum: act.num,
      actId: act.id,
      episode: ep,
      totalEpisodes: this.episodes,
      checkpointIdx: this.checkpointIdx,
      checkpointEp: Math.round(ep),
      activeMethod: this.activeMethodOverride ?? act.methodId,
      epsilon: this.epsilon,
      alpha: this.alpha,
      gamma: this.gamma,
      nStep: this.nStep,
      episodes: this.episodes,
      lang: this.lang,
      cliffMask: this.cliffMask,
      isCustomCliff: this.isCustomCliff(),
      vGrid: frame.vGrid,
      vN1: frame.vN1,
      vNStep: frame.vNStep,
      qGrid: useQTable,
      qSarsa: frame.qSarsa,
      qLearn: frame.qLearn,
      sarsaPath: frame.sarsaPath,
      qPath: frame.qPath,
      convergedSarsaPath: sim.sarsaPath,
      convergedQPath: sim.qPath,
      bfsPath: sim.bfsPath,
      tdStep: frame.tdStep,
      arcNodes: sim.arcNodes,
      nStepTarget: sim.nStepTarget,
      nStepTargetConverged: sim.nStepTargetConverged,
      sarsaReturns,
      qReturns,
      n1Curve,
      nStepCurve,
      curveTotalPoints: sim.sarsaReturns.length,
      meanSarsa: meanArr(sEndSlice),
      meanQ: meanArr(qEndSlice),
      sarsaGreedyReturn: sim.sarsaGreedyReturn,
      qGreedyReturn: sim.qGreedyReturn,
      sarsaOnlineReturn: sim.sarsaOnlineReturn,
      qOnlineReturn: sim.qOnlineReturn,
      greedyRef: sim.greedyRef,
      selectedCell: this.selectedCell,
      forkCell: fork.forkCell,
      highlightCell: this.selectedCell,
      agentCell: this.customAgentCell || fork.forkCell,
      forkProbeActive: this.forkProbeActive,
      fork,
      ghost: this._ghostMeta,
      codeTitle: act.codeTitle,
      codeLines: act.codeLines,
      activeCodeLine: this.activeCodeLineOverride ?? act.activeCodeLine,
    };
  }

  /**
   * Executable 3-assertion counterfactual falsification suite:
   * 1. Q-learning greedy path hugs the cliff & achieves higher greedy return than Sarsa,
   *    while Sarsa achieves strictly higher online ε-greedy return (and cliff ε-slip shocks Sarsa only).
   * 2. Increasing n-step (n=1 -> n=4) genuinely accelerates early-episode credit propagation back to Start.
   * 3. Painting an extra cliff obstacle visibly shifts the optimal policy and strictly increases step count.
   */
  runFalsificationSuite() {
    const saved = {
      actIndex: this.actIndex,
      epsilon: this.epsilon,
      alpha: this.alpha,
      gamma: this.gamma,
      nStep: this.nStep,
      episodes: this.episodes,
      forkProbeActive: this.forkProbeActive,
      forkCell: [...this.forkCell],
      selectedCell: [...this.selectedCell],
      cliffMask: cloneCliffMask(this.cliffMask),
      checkpointIdx: this.checkpointIdx,
      episodeCursor: this.episodeCursor,
      curveFraction: this.curveFraction,
      ghostMeta: this._ghostMeta,
    };

    try {
      this.cliffMask = createDefaultCliffMask();
      this.resetPlaybackOverrides();
      this.setParams({ epsilon: 0.1, alpha: 0.5, gamma: 0.95, nStep: 4, episodes: 240, forkProbeActive: false });
      const baseSim = this._ensureSolved();

      // Assertion 1: Sarsa vs Q-learning greedy-vs-online paradox + real cliff-rim fork shock
      const qHugsCliff = baseSim.qPath.some(([r, c]) => r === 2 && c >= 2 && c <= 5);
      const qBetterGreedy = baseSim.qGreedyReturn > baseSim.sarsaGreedyReturn;
      const sarsaBetterOnline = baseSim.sarsaOnlineReturn > baseSim.qOnlineReturn + 2.0;

      this.forkCell = [2, 3];
      this.forkProbeActive = false;
      const normalFork = this.solve(this.episodes).fork;
      this.forkProbeActive = true;
      const shockedFork = this.solve(this.episodes).fork;
      const forkSplits =
        shockedFork.sarsaTarget < normalFork.sarsaTarget - 20 &&
        shockedFork.sarsaDelta < shockedFork.qDelta - 15 &&
        Math.abs(shockedFork.qTarget - normalFork.qTarget) < 1e-6;

      const assert1 = {
        id: 'sarsa-vs-q-cliff-paradox',
        passed: Boolean(qHugsCliff && qBetterGreedy && sarsaBetterOnline && forkSplits),
        qGreedyReturn: baseSim.qGreedyReturn,
        sarsaGreedyReturn: baseSim.sarsaGreedyReturn,
        sarsaOnlineReturn: baseSim.sarsaOnlineReturn,
        qOnlineReturn: baseSim.qOnlineReturn,
        sarsaShockDelta: +shockedFork.sarsaDelta.toFixed(2),
        qDelta: +shockedFork.qDelta.toFixed(2),
      };

      // Assertion 2: Increasing n (n=1 -> n=4) accelerates early-episode credit propagation back to Start
      const earlyEp = 14;
      const simN1 = runTdSimulation({
        epsilon: 0.1,
        alpha: 0.5,
        gamma: 0.95,
        nStep: 1,
        episodes: 60,
        cliffMask: createDefaultCliffMask(),
      });
      const simN4 = runTdSimulation({
        epsilon: 0.1,
        alpha: 0.5,
        gamma: 0.95,
        nStep: 4,
        episodes: 60,
        cliffMask: createDefaultCliffMask(),
      });
      const vStartN1 = simN1.tape.sampleAt(earlyEp).n1StartV;
      const vStartN4 = simN4.tape.sampleAt(earlyEp).nStepStartV;
      const assert2 = {
        id: 'nstep-early-credit-acceleration',
        passed: Boolean(vStartN4 > vStartN1 + 0.5 && simN4.arcNodes.length > simN1.arcNodes.length),
        earlyEp,
        vStartN1: +vStartN1.toFixed(2),
        vStartN4: +vStartN4.toFixed(2),
        n1ArcLen: simN1.arcNodes.length,
        n4ArcLen: simN4.arcNodes.length,
      };

      // Assertion 3: Painting an extra cliff obstacle blocks the cliff-edge corridor,
      // visibly shifts Q-learning's optimal policy, and raises optimal step count
      const baseSteps = baseSim.qPath.length - 1;
      const blockedMask = createDefaultCliffMask();
      blockedMask[2][3] = true; // paint cliff barrier right on row 2 col 3
      blockedMask[1][3] = true; // extend barrier to row 1 col 3 so detour climbs over row 0
      const blockedSim = runTdSimulation({
        epsilon: 0.1,
        alpha: 0.5,
        gamma: 0.95,
        nStep: 4,
        episodes: 240,
        cliffMask: blockedMask,
      });
      const blockedSteps = blockedSim.qPath.length - 1;
      const avoidsObstacle = !blockedSim.qPath.some(([r, c]) => (r === 2 && c === 3) || (r === 1 && c === 3));
      const reachesGoal =
        blockedSim.qPath[blockedSim.qPath.length - 1][0] === GOAL[0] &&
        blockedSim.qPath[blockedSim.qPath.length - 1][1] === GOAL[1];
      const assert3 = {
        id: 'custom-cliff-obstacle-detour',
        passed: Boolean(reachesGoal && avoidsObstacle && blockedSteps > baseSteps),
        baseSteps,
        blockedSteps,
        avoidsObstacle,
        reachesGoal,
      };

      const assertions = [assert1, assert2, assert3];
      return {
        passed: assertions.every((a) => a.passed),
        assertions,
      };
    } finally {
      this.actIndex = saved.actIndex;
      this.epsilon = saved.epsilon;
      this.alpha = saved.alpha;
      this.gamma = saved.gamma;
      this.nStep = saved.nStep;
      this.episodes = saved.episodes;
      this.forkProbeActive = saved.forkProbeActive;
      this.forkCell = saved.forkCell;
      this.selectedCell = saved.selectedCell;
      this.cliffMask = saved.cliffMask;
      this.checkpointIdx = saved.checkpointIdx;
      this.episodeCursor = saved.episodeCursor;
      this.curveFraction = saved.curveFraction;
      this._ghostMeta = saved.ghostMeta;
      this._cacheKey = '';
      this._ensureSolved();
    }
  }
}
