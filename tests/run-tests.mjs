import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveCalloutRects } from '../kit/callout-layer.js';
import { ChartCard } from '../kit/chart-card.js';
import { LinkBus } from '../kit/link-bus.js';
import { LiveMathsPanel } from '../kit/live-maths.js';
import {
  applyUrlState,
  easeLinear,
  parseUrlState,
  PhaseScrubber,
  TimelineDirector,
} from '../kit/timeline-director.js';
import { createI18n } from '../shell/i18n.js';
import { createMemoryStorage, MasteryStore } from '../shell/storage-adapter.js';
import { CacheBenchSimulation, HOTSPOT_SEQUENCE } from '../examples/cache-bench/lru-engine.js';
import { ThermostatSimulation } from '../examples/hysteresis-bench/thermostat-engine.js';
import { TdChapterEngine } from '../examples/rl-td-bench/td-engine.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// 1. Verify all JS syntax across kit/, shell/, and examples/
function walkJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'vendor' || ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJs(full));
    else if (ent.name.endsWith('.js') || ent.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const jsFiles = [
  ...walkJs(path.join(ROOT, 'kit')),
  ...walkJs(path.join(ROOT, 'primitives')),
  ...walkJs(path.join(ROOT, 'shell')),
  ...walkJs(path.join(ROOT, 'examples')),
  ...walkJs(path.join(ROOT, 'tests')),
];
for (const f of jsFiles) {
  execFileSync(process.execPath, ['--check', f]);
}
console.log(`[OK] Syntax checked ${jsFiles.length} JS modules`);

// 2. Verify SKILL.md YAML frontmatter + zero broken markdown links
const skillText = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
const fmMatch = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert.ok(fmMatch && fmMatch[1].includes('name: simulify'), 'SKILL.md must declare name: simulify');

const mdFiles = [
  path.join(ROOT, 'SKILL.md'),
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'README.zh-CN.md'),
  ...fs.readdirSync(path.join(ROOT, 'references')).filter((f) => f.endsWith('.md')).map((f) => path.join(ROOT, 'references', f)),
];
let checkedLinks = 0;
for (const md of mdFiles) {
  const txt = fs.readFileSync(md, 'utf8');
  for (const m of txt.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|file:)/.test(target)) continue;
    checkedLinks += 1;
    const resolved = path.resolve(path.dirname(md), target);
    assert.ok(fs.existsSync(resolved), `Broken relative link in ${path.relative(ROOT, md)}: ${target}`);
  }
}
console.log(`[OK] Checked ${mdFiles.length} markdown docs (${checkedLinks} links, 0 broken)`);

// 3. Verify LinkBus deduplication + events
const bus = new LinkBus();
const events = [];
bus.onHover((id, src) => events.push(['hover', id, src]));
bus.onSelect((id, src) => events.push(['select', id, src]));
bus.onFocus((id, src) => events.push(['focus', id, src]));
assert.equal(bus.hover('bay-0', '3d'), true);
assert.equal(bus.hover('bay-0', '3d'), false, 'Duplicate hover must deduplicate');
assert.equal(bus.focus('bay-0', 'ui'), true);
assert.equal(bus.getState().selectedId, 'bay-0');
assert.equal(bus.clearHover('3d'), true);
assert.equal(events.length, 3);
console.log('[OK] LinkBus deduplication and focus behavior verified');

// 4. Verify CalloutLayer geometric repulsion & HUD blocker avoidance
const resolved = resolveCalloutRects(
  [
    { id: 'c1', left: 950, top: 80, width: 120, height: 36 },
    { id: 'c2', left: 200, top: 200, width: 120, height: 36 },
    { id: 'c3', left: 210, top: 210, width: 120, height: 36 },
  ],
  { width: 1280, height: 800, padX: 10, padTop: 56, padBottom: 66 },
  [{ left: 940, top: 20, right: 1265, bottom: 520 }]
);
assert.ok(resolved[0].left + 120 <= 940 || resolved[0].top >= 520, 'c1 must move clear of HUD guide blocker');
const overlap23 =
  Math.max(0, Math.min(resolved[1].right, resolved[2].right) - Math.max(resolved[1].left, resolved[2].left)) *
  Math.max(0, Math.min(resolved[1].bottom, resolved[2].bottom) - Math.max(resolved[1].top, resolved[2].top));
assert.equal(overlap23, 0, 'Adjacent tags c2/c3 must repel cleanly without overlap');
console.log('[OK] CalloutLayer blocker & repulsion geometry verified');

// 5. Verify TimelineDirector question-chain metadata + URL deep link + rewind
const stateLog = { val: 0, late: false, fx: 0 };
const dir = new TimelineDirector({
  ctx: stateLog,
  onReset: (s) => { s.val = 0; s.late = false; s.fx = 0; },
  stages: [
    {
      id: 'act-1',
      title: 'Act 1',
      carries: 'Start',
      hook: 'Next question?',
      relates: [{ to: 'act-2', type: 'deepens', why: 'Tests' }],
      steps: [{
        id: 's0',
        title: 'S0',
        run: (tl, s) => {
          tl.add(0, 1.0, (e) => { s.val = e * 10; }, { ease: easeLinear });
          tl.call(0.6, () => { s.late = true; });
          tl.add(0.2, 0.3, () => { s.fx += 1; }, { fx: true });
        },
      }],
    },
    {
      id: 'act-2',
      title: 'Act 2',
      carries: 'Answers Act 1',
      hook: 'Limit?',
      steps: [{
        id: 's1',
        title: 'S1',
        run: (tl, s) => {
          tl.add(0, 1.0, (e) => { s.val = 10 + e * 20; }, { ease: easeLinear });
        },
      }],
    },
  ],
});

const urlParsed = parseUrlState('?stage=act-2&t=0.5&paused&lang=en');
assert.equal(urlParsed.stage, 'act-2');
assert.equal(urlParsed.t, 0.5);
assert.equal(urlParsed.paused, true);
assert.equal(urlParsed.lang, 'en');

applyUrlState(dir, '?stage=act-2&t=0.5&paused');
assert.equal(dir.getState().stageId, 'act-2');
assert.equal(dir.getState().carries, 'Answers Act 1');
assert.equal(stateLog.fx, 0, 'fx tracks skipped on fast-forward');
assert.ok(Math.abs(stateLog.val - 20) < 1e-6);

applyUrlState(dir, '?stage=act-1&end');
assert.equal(dir.getState().stageId, 'act-1');
assert.equal(stateLog.late, true);
dir.seekTo(0.2);
assert.equal(stateLog.late, false, 'Backward seek cleanly clears late trigger');
assert.ok(Math.abs(stateLog.val - 2) < 1e-6);

// 6. Verify PhaseScrubber & exported classes
const scrub = new PhaseScrubber({ duration: 2, speed: 0.5, steadyTime: 1.5, playing: true });
scrub.tick(1.0);
assert.ok(Math.abs(scrub.getState().t - 0.5) < 1e-6);
scrub.jumpToSteady();
assert.ok(Math.abs(scrub.getState().t - 1.5) < 1e-6);
assert.equal(typeof ChartCard, 'function');
assert.equal(typeof LiveMathsPanel, 'function');

// 7. Verify Shell i18n (including RTL) & MasteryStore
const i18n = createI18n({
  defaultLang: 'zh',
  dicts: { zh: { hi: '你好 {n}' }, en: { hi: 'Hi {n}' }, ar: { hi: 'أهلا {n}' } },
});
assert.equal(i18n.t('hi', { n: '3D' }), '你好 3D');
await i18n.setLang('ar');
assert.equal(i18n.t('hi', { n: 'World' }), 'أهلا World');

const mem = createMemoryStorage();
const store = new MasteryStore(mem, ['a', 'b', 'c']);
store.markDone('a');
store.markDone('c');
assert.deepEqual(store.getProgress(), { done: 2, total: 3, pct: 67 });

// 8. Verify Benchmark Engines mathematically (Falsification logic)
const cacheSim = new CacheBenchSimulation();
cacheSim.loadAct('act-3');
assert.equal(cacheSim.request('A').lru.hit, true);
assert.equal(cacheSim.request('D').lru.evicted, 'B', 'LRU must evict B after A promotion');

cacheSim.loadAct('act-4');
for (const k of HOTSPOT_SEQUENCE) cacheSim.request(k);
const snap = cacheSim.getSnapshot();
assert.ok(snap.lruStats.hits > snap.fifoStats.hits, 'LRU must strictly beat FIFO on HOTSPOT_SEQUENCE');

const thSim = new ThermostatSimulation();
thSim.setBand(4);
thSim.setTemperature(18);
assert.equal(thSim.heating, true);
thSim.setTemperature(20);
assert.equal(thSim.heating, true, '4° band holds ON at 20° coming from 18°');
thSim.setBand(0);
let chatterCount = 0;
for (const t of [19.5, 20.5, 19.5, 20.5, 19.5, 20.5]) {
  if (thSim.setTemperature(t).flipped) chatterCount += 1;
}
assert.equal(chatterCount, 6, '0° band must flip on all 6 crossings around 20°');

const rlEngine = new TdChapterEngine();
const rlFalsify = rlEngine.runFalsificationSuite();
assert.equal(rlFalsify.passed, true, `RL Ch.7 falsification suite failed: ${JSON.stringify(rlFalsify)}`);
assert.equal(rlFalsify.assertions.length, 3);

// 9. Verify RL checkpoint progression & TimelineDirector.toggle()
const cp0 = rlEngine.setParams({ checkpointIdx: 0, curveFraction: 0.25 }).vGrid[2][0];
const cp4 = rlEngine.setParams({ checkpointIdx: 4, curveFraction: 1.0 }).vGrid[2][0];
assert.notEqual(cp0, cp4, 'Early vs final TD(0) checkpoint must differ for wave animation');
assert.equal(typeof TimelineDirector.prototype.toggle, 'function');
dir.pause();
assert.equal(dir.toggle().playing, true, 'TimelineDirector.toggle() must start playback');
assert.equal(dir.toggle().playing, false, 'TimelineDirector.toggle() must pause playback');
console.log('[OK] All unit, mathematical, i18n, storage, and simulation-engine tests PASSED');
