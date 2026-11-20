export const CAPACITY = 2;
export const HIT_NS = 1;
export const MISS_NS = 100;

export const CARTRIDGES = {
  A: { id: 'A', tag: 'CSS', title: '样式表', enTitle: 'Stylesheet', size: '14 KB', color: '#d96b43', accent: '#f6a887' },
  B: { id: 'B', tag: 'IMG', title: '用户头像', enTitle: 'User Avatar', size: '68 KB', color: '#488a6d', accent: '#98cbb2' },
  C: { id: 'C', tag: 'JSON', title: '商品列表', enTitle: 'Catalog JSON', size: '24 KB', color: '#3a6fa3', accent: '#8cb8e4' },
  D: { id: 'D', tag: 'CFG', title: '推荐配置', enTitle: 'Config Blob', size: '4 KB', color: '#c7922e', accent: '#edd086' },
};

export const CARTRIDGE_IDS = ['A', 'B', 'C', 'D'];
export const HOTSPOT_SEQUENCE = ['A', 'B', 'A', 'C', 'A', 'D', 'A', 'B', 'A'];

const DEG = Math.PI / 180;

export const ACTS = [
  {
    id: 'act-1',
    num: 1,
    shortTitle: { zh: '1. 命中差', en: '1. Hit vs Miss' },
    title: { zh: '第 1 幕 · 桌面缓存 vs 后排主存', en: 'Act 1 · L1 Bay vs Main Memory' },
    cue: {
      zh: '首次取 A 须从后排主存调入（100 ns）；再点桌上 A 仅需 1 ns。',
      en: 'First A fetch pulls from backing store (100 ns); a second click hits desk in 1 ns.',
    },
    carries: { zh: '起点：空工作台面对 100 ns 慢速主存。', en: 'Start: Empty L1 deck facing 100 ns store.' },
    hook: { zh: '钩子：两格放满后，第 3 张进来挤走谁？', en: 'Hook: Once 2 bays fill, who gets evicted on #3?' },
    relates: [{ to: 'act-2', type: 'deepens', why: { zh: '容量受限触发淘汰', en: 'Capacity forces eviction' } }],
    initialSlots: [],
    sequence: ['A', 'A'],
    dualMode: false,
    camera: { target: [0.85, 0.4, -0.55], azimuth: 35 * DEG, elevation: 40 * DEG, zoom: 1.04 },
  },
  {
    id: 'act-2',
    num: 2,
    shortTitle: { zh: '2. 满槽淘汰', en: '2. Eviction' },
    title: { zh: '第 2 幕 · 两格满载，谁滑出回收盘？', en: 'Act 2 · Full Bays & Eviction Ramp' },
    cue: {
      zh: '依次取 A → B → C：新卡入左槽 MRU，最老卡被挤到右槽并滑出。',
      en: 'Fetch A → B → C: newest enters left MRU bay, pushing oldest down the ramp.',
    },
    carries: { zh: '承上：解决“2 格装不下 3 张卡”的腾位规则。', en: 'Carries: Resolves full 2-bay capacity conflict.' },
    hook: { zh: '钩子：若老卡又被命中，还会按先来先死淘汰吗？', en: 'Hook: Can a fresh hit rescue an older card from eviction?' },
    relates: [{ to: 'act-3', type: 'deepens', why: { zh: '命中刷新最近序', en: 'Recency reorder on hit' } }],
    initialSlots: [],
    sequence: ['A', 'B', 'C'],
    dualMode: false,
    camera: { target: [0.85, 0.4, -0.45], azimuth: 35 * DEG, elevation: 40 * DEG, zoom: 1.03 },
  },
  {
    id: 'act-3',
    num: 3,
    shortTitle: { zh: '3. 命中改序', en: '3. Recency Flip' },
    title: { zh: '第 3 幕 · 命中瞬间改写淘汰命运', en: 'Act 3 · Hit Rewrites Eviction Order' },
    cue: {
      zh: '初态 [左 B, 右 A]。先点 A 命中跃回左槽，再取 D 看真正淘汰谁。',
      en: 'Starts [Left B, Right A]. Hit A to promote left, then fetch D to see B evicted.',
    },
    carries: { zh: '承上：桌面已满 [B, A]，检验命中重排规则。', en: 'Carries: Preloaded [B, A] tests hit-promotion.' },
    hook: { zh: '钩子：同样 9 步流，LRU 与盲目 FIFO 命中率差多少？', en: 'Hook: How far does LRU beat FIFO on a 9-step hotspot stream?' },
    relates: [{ to: 'act-4', type: 'contrast', why: { zh: '同序列双机对照', en: 'Side-by-side policy divergence' } }],
    initialSlots: ['B', 'A'],
    sequence: ['A', 'D'],
    dualMode: false,
    camera: { target: [1.15, 0.42, -0.15], azimuth: 32 * DEG, elevation: 39 * DEG, zoom: 1.08 },
    prediction: {
      prompt: { zh: '初态 [左 B, 右 A]，先取 A 再取 D，最终谁进回收盘？', en: 'On [B, A], request A then D — who is evicted?' },
      choices: [
        { id: 'A', label: { zh: '淘汰 A（按进桌先后）', en: 'Evict A (arrival order)' }, correct: false },
        { id: 'B', label: { zh: '淘汰 B（A 命中跃回左槽）', en: 'Evict B (A promoted to MRU)' }, correct: true },
      ],
      verdictOk: { zh: '准确！A 命中跨过 B 跃回左槽，D 进来时踢出的是 B。', en: 'Correct! Hit promotes A left; D evicts B.' },
      verdictBad: { zh: '第 1 步 A 命中已跃回左槽，真正淘汰出局的是 B。', en: 'Look at step 1: A promoted left on hit, so B was evicted.' },
    },
  },
  {
    id: 'act-4',
    num: 4,
    shortTitle: { zh: '4. LRU vs FIFO', en: '4. LRU vs FIFO' },
    title: { zh: '第 4 幕 · 双机对照 + 曲线验证', en: 'Act 4 · Dual Bench + XY Hit Curve' },
    cue: {
      zh: '前排升起 FIFO 台，9 步热点流分叉打入两台机器并实时绘出命中率差。',
      en: 'Front FIFO deck deploys; 9-step hotspot stream drives both bays and live XY plot.',
    },
    carries: { zh: '承上：把“访问序”和“进队列序”放到同一序列分叉检验。', en: 'Carries: Tests recency vs arrival on identical traffic.' },
    hook: { zh: '反例边界：若工作集变成 A→B→C→D 全轮询，两台均会跌向 0% 抖动。', en: 'Limit: A cyclic A→B→C→D scan thrashes both policies toward 0%.' },
    relates: [{ to: 'act-1', type: 'uses', why: { zh: '复算 AMAT 平均延迟', en: 'Recomputes AMAT savings' } }],
    initialSlots: [],
    sequence: HOTSPOT_SEQUENCE,
    dualMode: true,
    camera: { target: [0.45, 0.35, 0.25], azimuth: 33 * DEG, elevation: 42 * DEG, zoom: 0.78 },
  },
];

export function stepLru(beforeSlots, key) {
  const idx = beforeSlots.indexOf(key);
  if (idx >= 0) {
    return {
      key,
      before: [...beforeSlots],
      after: [key, ...beforeSlots.filter((k) => k !== key)],
      outcome: 'hit',
      hit: true,
      sourceIndex: idx,
      evicted: null,
      latencyNs: HIT_NS,
    };
  }
  const evicted = beforeSlots.length >= CAPACITY ? beforeSlots[CAPACITY - 1] : null;
  return {
    key,
    before: [...beforeSlots],
    after: [key, ...beforeSlots].slice(0, CAPACITY),
    outcome: 'miss',
    hit: false,
    sourceIndex: -1,
    evicted,
    latencyNs: MISS_NS,
  };
}

export function stepFifo(beforeQueue, key) {
  const idx = beforeQueue.indexOf(key);
  if (idx >= 0) {
    return {
      key,
      before: [...beforeQueue],
      after: [...beforeQueue],
      hit: true,
      sourceIndex: idx,
      evicted: null,
      latencyNs: HIT_NS,
    };
  }
  const evicted = beforeQueue.length >= CAPACITY ? beforeQueue[0] : null;
  const trimmed = beforeQueue.length >= CAPACITY ? beforeQueue.slice(1) : beforeQueue;
  return {
    key,
    before: [...beforeQueue],
    after: [...trimmed, key],
    hit: false,
    sourceIndex: -1,
    evicted,
    latencyNs: MISS_NS,
  };
}

export class CacheBenchSimulation {
  constructor() {
    this.actIndex = 0;
    this.initialLru = [];
    this.initialFifo = [];
    this.events = [];
    this.cursor = -1;
  }

  get act() {
    return ACTS[this.actIndex] || ACTS[0];
  }

  loadAct(indexOrId) {
    const idx =
      typeof indexOrId === 'number'
        ? Math.max(0, Math.min(ACTS.length - 1, indexOrId))
        : Math.max(0, ACTS.findIndex((a) => a.id === indexOrId));
    this.actIndex = idx;
    const init = [...this.act.initialSlots];
    this.initialLru = init;
    this.initialFifo = [...init].reverse();
    this.events = [];
    this.cursor = -1;
  }

  request(key) {
    if (!CARTRIDGES[key]) throw new Error(`Unknown cartridge: ${key}`);
    if (this.cursor < this.events.length - 1) {
      this.events.splice(this.cursor + 1);
    }
    const prev = this.events.at(-1);
    const lruBefore = prev ? prev.lru.after : this.initialLru;
    const fifoBefore = prev ? prev.fifo.after : this.initialFifo;
    const lru = stepLru(lruBefore, key);
    const fifo = stepFifo(fifoBefore, key);
    const rec = { index: this.events.length, key, lru, fifo };
    this.events.push(rec);
    this.cursor = rec.index;
    return rec;
  }

  getSnapshot() {
    const empty = {
      stepNumber: 0,
      event: null,
      lruSlots: [...this.initialLru],
      fifoQueue: [...this.initialFifo],
      evicted: null,
      fifoEvicted: null,
      lruStats: { total: 0, hits: 0, misses: 0, totalNs: 0, hitRate: 0, amatNs: 0 },
      fifoStats: { total: 0, hits: 0, misses: 0, totalNs: 0, hitRate: 0, amatNs: 0 },
      lruCurve: [],
      fifoCurve: [],
    };
    if (this.cursor < 0 || !this.events.length) return empty;

    const slice = this.events.slice(0, this.cursor + 1);
    let lruHits = 0;
    let lruNs = 0;
    let fifoHits = 0;
    let fifoNs = 0;
    const lruCurve = [];
    const fifoCurve = [];
    slice.forEach((ev, idx) => {
      if (ev.lru.hit) lruHits += 1;
      lruNs += ev.lru.latencyNs;
      if (ev.fifo.hit) fifoHits += 1;
      fifoNs += ev.fifo.latencyNs;
      const step = idx + 1;
      lruCurve.push({ x: step, y: Math.round((lruHits / step) * 100) });
      fifoCurve.push({ x: step, y: Math.round((fifoHits / step) * 100) });
    });
    const active = slice[slice.length - 1];
    const n = slice.length;
    return {
      stepNumber: n,
      event: active,
      lruSlots: [...active.lru.after],
      fifoQueue: [...active.fifo.after],
      evicted: active.lru.evicted,
      fifoEvicted: active.fifo.evicted,
      lruStats: {
        total: n,
        hits: lruHits,
        misses: n - lruHits,
        totalNs: lruNs,
        hitRate: Math.round((lruHits / n) * 100),
        amatNs: +(lruNs / n).toFixed(1),
      },
      fifoStats: {
        total: n,
        hits: fifoHits,
        misses: n - fifoHits,
        totalNs: fifoNs,
        hitRate: Math.round((fifoHits / n) * 100),
        amatNs: +(fifoNs / n).toFixed(1),
      },
      lruCurve,
      fifoCurve,
    };
  }
}

export { CacheBenchSimulation as CacheWorldSimulation };
