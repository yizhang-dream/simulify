import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as nodeModule from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AliveLoop } from '../kit/agency-loop.js';
import { CalloutLayer, resolveCalloutRects } from '../kit/callout-layer.js';
import { ChartCard } from '../kit/chart-card.js';
import { ActorChoreographer, applyExplodeFactor, collectExplodeParts } from '../kit/choreography.js';
import {
  areFontsReady,
  canvasFont,
  createCrispCanvasTexture,
  FONT_STACKS,
  getFontStack,
  onFontsReady,
  waitForFonts,
} from '../kit/fonts.js';
import { LinkBus } from '../kit/link-bus.js';
import { bisectRoot, createSimModel, formatUnit, integrateRK4, rk4Step } from '../kit/model-core.js';
import {
  LiveMathsPanel,
  mathAccent,
  mathAlign,
  mathCases,
  mathFence,
  mathFrac,
  mathGroup,
  mathMatrix,
  mathNum,
  mathOp,
  mathSqrt,
  mathSub,
  mathSubSup,
  mathSup,
  mathText,
  mathVar,
  normalizeUnicodeScripts,
  parseMathSegments,
  renderMathInElement,
  renderTex,
  substituteTexVars,
} from '../kit/live-maths.js';
import {
  ICONS,
  LAYOUT_ARCHETYPES,
  mountScaleBar,
  mountViewCube,
  THEME_PRESETS,
  toggleZenMode,
  WipeCompareController,
} from '../kit/layout-shell.js';
import {
  defaultInterpolateState,
  SimulationTape,
  SpacetimeClock,
} from '../kit/spacetime.js';
import { Spring } from '../kit/spring.js';
import {
  applyUrlState,
  easeLinear,
  exposeTestHooks,
  mountTimelineBar,
  parseUrlState,
  PhaseScrubber,
  TimelineDirector,
  VALID_PROFILES,
} from '../kit/timeline-director.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const expectedProfiles = ['mechanical-3d', 'field-math', 'sandbox-direct'];

// Minimal pure-JS DOM harness scoped strictly inside `withMockDocument(fn)` for Node tests
function createMockElement(tagName, ns = null) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = new Map();
  const el = {
    tagName: String(tagName).toUpperCase(),
    namespaceURI: ns,
    children: [],
    dataset: {},
    style: {},
    hidden: false,
    open: false,
    tabIndex: -1,
    offsetWidth: 132,
    offsetHeight: 38,
    _text: '',
    get textContent() {
      if (this._text) return this._text;
      return this.children.map((c) => (typeof c === 'string' ? c : c.textContent ?? '')).join('');
    },
    set textContent(v) {
      this._text = String(v ?? '');
      this.children = [];
    },
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(v) {
      classes.clear();
      for (const token of String(v || '').split(/\s+/).filter(Boolean)) classes.add(token);
    },
    classList: {
      add(...tokens) {
        for (const t of tokens) if (t) classes.add(t);
      },
      remove(...tokens) {
        for (const t of tokens) classes.delete(t);
      },
      contains(t) {
        return classes.has(t);
      },
    },
    setAttribute(k, v) {
      attrs.set(String(k), String(v));
      if (k === 'class') this.className = String(v);
    },
    getAttribute(k) {
      return attrs.has(String(k)) ? attrs.get(String(k)) : null;
    },
    removeAttribute(k) {
      attrs.delete(String(k));
    },
    append(...nodes) {
      for (const n of nodes) {
        if (n && n._isFragment) {
          this.children.push(...n.children);
        } else if (n !== null && n !== undefined) {
          this.children.push(n);
        }
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this._text = '';
      this.append(...nodes);
    },
    remove() {
      this._removed = true;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
    dispatchEvent(type, ev = {}) {
      for (const fn of listeners.get(type) || []) fn(ev);
    },
    querySelectorAll(predicate) {
      const out = [];
      const walk = (node) => {
        for (const ch of node.children || []) {
          if (typeof ch === 'object' && ch) {
            if (predicate(ch)) out.push(ch);
            walk(ch);
          }
        }
      };
      walk(this);
      return out;
    },
  };
  return el;
}

function withMockDocument(fn) {
  const prevDoc = globalThis.document;
  globalThis.document = {
    documentElement: { dataset: {}, getAttribute: () => null, setAttribute: () => {}, removeAttribute: () => {} },
    createElement: (tag) => createMockElement(tag),
    createElementNS: (ns, tag) => createMockElement(tag, ns),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text ?? '') }),
    createDocumentFragment: () => ({
      _isFragment: true,
      children: [],
      append(...nodes) {
        for (const n of nodes) this.children.push(n);
      },
    }),
  };
  try {
    return fn(globalThis.document);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
}

// ============================================================================
// 1. Verify all active JS syntax across kit/, primitives/, examples/, tests/
//    (skipping vendor, node_modules, and archive)
// ============================================================================
function walkJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'vendor' || ent.name === 'node_modules' || ent.name === 'archive') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJs(full));
    else if (ent.name.endsWith('.js') || ent.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const jsFiles = [
  ...walkJs(path.join(ROOT, 'kit')),
  ...walkJs(path.join(ROOT, 'primitives')),
  ...walkJs(path.join(ROOT, 'examples')),
  ...walkJs(path.join(ROOT, 'tests')),
];
for (const f of jsFiles) {
  execFileSync(process.execPath, ['--check', f]);
}
console.log(`[OK] Syntax checked ${jsFiles.length} active JS modules (skipped vendor/node_modules/archive)`);

// ============================================================================
// 2. Verify SKILL.md YAML frontmatter, zero broken markdown links & thumbs manifest
// ============================================================================
const skillText = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
const fmMatch = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert.ok(fmMatch && fmMatch[1].includes('name: simulify'), 'SKILL.md must declare name: simulify');

const shimSkillText = fs.readFileSync(path.join(ROOT, 'skills', 'simulify', 'SKILL.md'), 'utf8');
const shimFmMatch = shimSkillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert.ok(shimFmMatch, 'skills/simulify/SKILL.md must have YAML frontmatter');
assert.equal(
  shimFmMatch[1].replace(/\r\n/g, '\n').trim(),
  fmMatch[1].replace(/\r\n/g, '\n').trim(),
  'skills/simulify/SKILL.md frontmatter must stay 100% synced with root SKILL.md'
);

const pluginJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const marketJson = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
assert.ok(pluginJson.version && packageJson.version && marketJson.plugins?.[0]?.version, 'plugin.json, package.json & marketplace.json must declare versions');
assert.equal(
  pluginJson.version,
  marketJson.plugins[0].version,
  'plugin.json and .claude-plugin/marketplace.json versions must match'
);
assert.equal(
  packageJson.version,
  pluginJson.version,
  'package.json and plugin.json versions must match'
);
const majorMinor = pluginJson.version.split('.').slice(0, 2).join('.');
assert.equal(majorMinor, '3.1', 'Current release minor version must be 3.1');
for (const relPath of [
  'INSTALL.md',
  'index.html',
  'examples/index.html',
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'references/topic-fit.md',
]) {
  const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const isRedirect = relPath === 'examples/index.html' && /http-equiv\s*=\s*["']refresh["']|location\.replace\(/i.test(text);
  assert.ok(
    !/Simulify\s+v?3\.0\b/i.test(text) && !/\bv3\.0\b/.test(text),
    `${relPath} must not contain stale 3.0 version strings`
  );
  if (!isRedirect) {
    assert.ok(
      new RegExp(`\\bv?${majorMinor.replace('.', '\\.')}\\b`).test(text),
      `${relPath} must reference current version ${majorMinor}`
    );
  }
}
assert.ok(
  fs.existsSync(path.join(ROOT, 'examples', 'shared', 'vendor', 'three', 'addons', 'utils', 'BufferGeometryUtils.js')),
  'examples/shared/vendor/three/addons/utils/BufferGeometryUtils.js must exist'
);

const mdFiles = [
  path.join(ROOT, 'SKILL.md'),
  path.join(ROOT, 'skills', 'simulify', 'SKILL.md'),
  path.join(ROOT, 'INSTALL.md'),
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'README.zh-CN.md'),
  path.join(ROOT, 'primitives', 'README.md'),
  ...fs
    .readdirSync(path.join(ROOT, 'references'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(ROOT, 'references', f)),
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

assert.match(skillText, /^## Step 0\b/m, 'SKILL.md must describe Step 0 grounding');
assert.ok(skillText.includes('references/grounding-discovery.md'), 'SKILL.md must link to the grounding workflow');
assert.ok(skillText.includes('references/engine-contract.md'), 'SKILL.md must link to the engine contract');
assert.ok(skillText.split(/\r?\n/).some((line) => (
  line.includes('`mechanical-3d`') && line.includes('`DIMENSIONS`')
  && /orthographic Front\s*\/\s*Side\s*\/\s*Top/i.test(line)
)), 'SKILL.md must require a dimensioned orthographic blueprint for mechanical-3d');
for (const profile of expectedProfiles) {
  assert.ok(skillText.includes(`\`${profile}\``), `SKILL.md must cover the ${profile} profile`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'thumbs-manifest.json'), 'utf8'));
assert.ok(Array.isArray(manifest), 'thumbs-manifest.json must be a JSON array');
for (const entry of manifest) {
  const relPath = String(entry.url).split('?')[0];
  assert.ok(fs.existsSync(path.join(ROOT, relPath)), `Missing manifest entry target: ${relPath}`);
}
console.log(`[OK] Checked ${mdFiles.length} markdown docs (${checkedLinks} links, 0 broken) + thumbs-manifest.json (${manifest.length} entries)`);

// ============================================================================
// 3. Verify LinkBus deduplication + events
// ============================================================================
const bus = new LinkBus();
const events = [];
bus.onHover((id, src) => events.push(['hover', id, src]));
bus.onSelect((id, src) => events.push(['select', id, src]));
bus.onFocus((id, src) => events.push(['focus', id, src]));
assert.equal(bus.hover('bay-0', '3d'), true);
assert.equal(bus.hover('bay-0', '3d'), false, 'Duplicate hover must deduplicate');
assert.equal(bus.focus('bay-0', 'ui'), true);
assert.equal(bus.getState().selectedId, 'bay-0');
assert.equal(bus.select('bay-0', 'ui'), false, 'Focus must already have published selection');
assert.equal(bus.clearHover('3d'), true);
assert.deepEqual(events, [
  ['hover', 'bay-0', '3d'], ['select', 'bay-0', 'ui'], ['focus', 'bay-0', 'ui'], ['hover', null, '3d'],
]);
console.log('[OK] LinkBus deduplication and focus behavior verified');

// ============================================================================
// 4. Verify CalloutLayer geometric repulsion, HUD avoidance, getExportSnapshot() & choreographer opacity
// ============================================================================
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

withMockDocument(() => {
  const mockStage = {
    size: { width: 1280, height: 800 },
    projectToScreen: ([x, y]) => ({ x, y, visible: true }),
  };
  const svgEl = createMockElement('svg', 'http://www.w3.org/2000/svg');
  const tagsEl = createMockElement('div');
  const calloutChoreo = new ActorChoreographer();
  calloutChoreo.calloutReveal('c-late', 5, 1.0, { exitAt: 10, exitDur: 0.5 });

  const layer = new CalloutLayer(mockStage, svgEl, tagsEl);
  layer.setChoreographer(calloutChoreo);
  layer.setItems([
    { id: 'c-early', label: 'Start', sublabel: 'S0', tone: 'teal', getWorldPos: () => [300, 320, 0] },
    { id: 'c-late', label: 'Fork', sublabel: 'Q vs Sarsa', tone: 'amber', getWorldPos: () => [620, 400, 0] },
  ]);

  calloutChoreo.evaluate(0, { apply: false });
  layer.update();
  const snapEarly = layer.getExportSnapshot();
  assert.equal(snapEarly.width, 1280);
  assert.equal(snapEarly.height, 800);
  assert.equal(snapEarly.items.length, 1, 'c-late must be hidden before choreographer reveal at t=5');
  assert.equal(snapEarly.items[0].id, 'c-early');
  assert.equal(snapEarly.items[0].title, 'Start');
  assert.equal(snapEarly.items[0].detail, 'S0');
  assert.equal(snapEarly.items[0].accent, '#149694');
  assert.equal(snapEarly.items[0].opacity, 1);
  assert.equal(snapEarly.items[0].leaderPoints.length, 3);

  calloutChoreo.evaluate(5.5, { apply: false });
  layer.update();
  const snapMid = layer.getExportSnapshot();
  assert.equal(snapMid.items.length, 2, 'c-late must appear mid-reveal at t=5.5');
  const lateMid = snapMid.items.find((it) => it.id === 'c-late');
  assert.ok(lateMid.opacity > 0.1 && lateMid.opacity < 1.0, `Expected partial fade opacity, got ${lateMid.opacity}`);

  calloutChoreo.evaluate(7.0, { apply: false });
  layer.update();
  const snapFull = layer.getExportSnapshot();
  assert.equal(snapFull.items.find((it) => it.id === 'c-late').opacity, 1);

  calloutChoreo.evaluate(11.0, { apply: false });
  layer.update();
  assert.equal(layer.getExportSnapshot().items.length, 1, 'c-late must disappear cleanly after exitAt+exitDur');

  layer.setEnabled(false);
  assert.deepEqual(layer.getExportSnapshot().items, []);
});
console.log('[OK] CalloutLayer geometry, getExportSnapshot(), and choreographer opacity verified');

// ============================================================================
// 5. Verify SpacetimeClock & SimulationTape (`kit/spacetime.js`)
// ============================================================================
const tickLog = [];
const seekLog = [];
const clock = new SpacetimeClock({
  duration: 20,
  defaultFps: 30,
  manualMode: true,
  acts: [
    {
      id: 'act-1',
      title: 'Act 1 · Opening',
      carries: 'Raw grid',
      hook: 'Why bootstrap?',
      steps: [
        { id: 'beat-1', title: 'Sparse Board', start: 0, end: 6 },
        { id: 'beat-2', title: 'TD(0) Pulse', start: 6, end: 12 },
      ],
    },
    {
      id: 'act-2',
      title: 'Act 2 · Fork',
      carries: 'TD(0) converges',
      hook: 'Cliff or detour?',
      steps: [
        { id: 'beat-3', title: 'Policy Fork', start: 12, end: 20 },
      ],
    },
  ],
  onTick: (st) => tickLog.push(st.t),
  onSeek: (st) => seekLog.push(st.t),
});

const clockInfo = clock.getTimelineInfo();
assert.equal(clockInfo.mode, 'spacetime');
assert.equal(clockInfo.duration, 20);
assert.equal(clockInfo.defaultFps, 30);
assert.equal(clockInfo.stages.length, 2);
assert.equal(clockInfo.beats.length, 3);

assert.equal(clock.play().playing, true);
assert.equal(clock.tick(-2), false, 'Negative dt must be ignored safely');
assert.equal(clock.t, 0);
assert.equal(clock.tick(2.5), true);
assert.ok(Math.abs(clock.t - 2.5) < 1e-6);
assert.equal(clock.toggle().playing, false);
assert.equal(clock.toggle().playing, true);
assert.equal(clock.pause().playing, false);

clock.setSpeed(2);
clock.play();
clock.tick(1.0);
assert.ok(Math.abs(clock.t - 4.5) < 1e-6, '2x speed dilation must advance 2s per 1s tick');

clock.stepFrame(20, 1);
assert.equal(clock.playing, false, 'stepFrame must pause playback');
assert.ok(Math.abs(clock.t - 4.55) < 1e-6);
clock.stepFrame(20, -1);
assert.ok(Math.abs(clock.t - 4.5) < 1e-6);

const jumped = clock.jumpToBeat('beat-3');
assert.equal(jumped.t, 12);
assert.equal(jumped.stageId, 'act-2');
assert.equal(jumped.stepId, 'beat-3');
assert.equal(clock.prevBeat().stepId, 'beat-2');
assert.equal(clock.nextBeat().stepId, 'beat-3');

clock.seek(25);
assert.equal(clock.t, 20);
assert.equal(clock.complete, true);
clock.seek(0);
assert.equal(clock.t, 0);
assert.equal(clock.complete, false);
clock.seekNorm(0.5);
assert.ok(Math.abs(clock.t - 10) < 1e-6);
assert.ok(tickLog.length > 0 && seekLog.length > 0);
clock.destroy();

// Wave 1 SpacetimeClock.seek() single-callback guarantee (never fires both onSeek + onTick)
let singleSeekCalls = 0;
let singleTickCalls = 0;
const singleClock = new SpacetimeClock({
  duration: 12,
  manualMode: true,
  onTick: () => { singleTickCalls += 1; },
  onSeek: () => { singleSeekCalls += 1; },
});
singleClock.seek(4.5);
assert.equal(singleSeekCalls, 1, 'seek() must invoke onSeek exactly once');
assert.equal(singleTickCalls, 0, 'seek() must NOT also fire onTick when onSeek is registered');
singleClock.seek(7.0, { notifyHandlers: false });
assert.equal(singleSeekCalls, 1, 'seek({ notifyHandlers: false }) must suppress onSeek');
assert.equal(singleTickCalls, 0, 'seek({ notifyHandlers: false }) must suppress onTick');
singleClock.destroy();

// Fallback to onTick when onSeek is absent
let tickFallbackCalls = 0;
const tickOnlyClock = new SpacetimeClock({
  duration: 10,
  manualMode: true,
  onTick: () => { tickFallbackCalls += 1; },
});
tickOnlyClock.seek(3.0);
assert.equal(tickFallbackCalls, 1, 'seek() must fall back to onTick exactly once when onSeek is absent');
tickOnlyClock.destroy();

// SimulationTape: record, bake, forward/backward sampleAt, ghost immutability
const tape = new SimulationTape();
tape.bake({ duration: 10, fps: 2 }, (t, i) => ({
  x: t * 3,
  vec: [t, t * 2],
  nested: { reward: -10 + t },
  phase: i >= 10 ? 'fork' : 'warmup',
}));
assert.equal(tape.length, 21);
assert.equal(tape.duration, 10);

const sFwd = tape.sampleAt(2.25);
assert.ok(Math.abs(sFwd.x - 6.75) < 1e-6);
assert.ok(Math.abs(sFwd.vec[1] - 4.5) < 1e-6);
assert.ok(Math.abs(sFwd.nested.reward - -7.75) < 1e-6);
const sLate = tape.sampleAt(8.5);
const sBack = tape.sampleAt(2.25);
assert.deepEqual(sBack, sFwd, 'Backward sampling must be bit-identical to forward sampling');
assert.equal(sLate.phase, 'fork');
assert.ok(tape.sampleRange(2, 6, 4).length === 4);

// Capture counterfactual ghost and mutate both source frames and live tape
const ghost = tape.captureGhost('Safe-Sarsa', { epsilon: 0.1 });
assert.equal(tape.hasGhost('Safe-Sarsa'), true);
tape.frames[4].state.nested.reward = 9999; // mutate internal state in-place
tape.frames[4].state.vec[0] = -777;
tape.bake({ duration: 10, fps: 2 }, (t) => ({ x: -t, vec: [0, 0], nested: { reward: -100 }, phase: 'cliff' }));

const ghostMid = tape.getGhost('Safe-Sarsa').sampleAt(2.25);
assert.ok(Math.abs(ghostMid.x - 6.75) < 1e-6, 'Captured ghost must remain immutable after live tape re-bake');
assert.ok(Math.abs(ghostMid.nested.reward - -7.75) < 1e-6, 'Captured ghost nested objects must be deep-cloned');
assert.equal(tape.sampleAt(2.25).nested.reward, -100);
assert.equal(tape.listGhosts().length, 1);
tape.clearGhost('Safe-Sarsa');
assert.equal(tape.hasGhost(), false);

// Non-uniform record() + binary-search fallback
const irregTape = new SimulationTape();
irregTape.record(0, { v: 0 });
irregTape.record(1, { v: 10 });
irregTape.record(5, { v: 50 });
assert.ok(Math.abs(irregTape.sampleAt(3).v - 30) < 1e-6);
assert.equal(defaultInterpolateState(10, 20, 0.25), 12.5);
console.log('[OK] SpacetimeClock & SimulationTape (forward/backward scrub + immutable ghosts) verified');

// ============================================================================
// 6. Verify ActorChoreographer (`kit/choreography.js`)
// ============================================================================
function makeMock3dActor(restPos = [0, 0, 0]) {
  const mat = { opacity: 0.9, transparent: false, depthWrite: true };
  return {
    visible: true,
    position: {
      x: restPos[0],
      y: restPos[1],
      z: restPos[2],
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    scale: {
      x: 1,
      y: 1,
      z: 1,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    material: mat,
    traverse(fn) {
      fn(this);
    },
  };
}

const actorBoard = makeMock3dActor([0, 0, 0]);
const actorArc = makeMock3dActor([1, 2, 0]);
const actorCliff = makeMock3dActor([0, -0.4, 2]);
const hudPanelEl = createMockElement('aside');
const appliedCameras = [];
const mockCamStage = { setCameraImmediate: (pose) => appliedCameras.push(pose) };

const choreo = new ActorChoreographer({
  initialCamera: { azimuth: 0.4, elevation: 0.6, zoom: 1.0, target: [0, 0, 0] },
});
choreo
  .register('board', actorBoard, { kind: '3d', initiallyVisible: true })
  .register('arc', actorArc, { kind: '3d' })
  .register('cliff', actorCliff, { kind: '3d' })
  .enter('arc', 5.0, 1.0, 'rise')
  .exit('arc', 14.0, 1.0, 'fade')
  .enter('cliff', 8.0, 1.0, 'drop')
  .hudReveal('hud-chart', 10.0, 0.5, { el: hudPanelEl })
  .focus(['cliff'], 9.0, 0.5, { dimOpacity: 0.2, holdUntil: 12.0, releaseDur: 0.5 })
  .cameraBeat(6.0, 2.0, { azimuth: 1.0, elevation: 0.8, zoom: 1.4, target: [2, 0, -1] });

// Initial sparsity: at t=0 only board is active; at t=11 board + arc + cliff + hud-chart = 4
assert.equal(choreo.getActiveActorCount(0), 1);
assert.equal(choreo.getActiveActorCount(11), 4);
assert.ok(choreo.getActiveActorCount(0) < choreo.getActiveActorCount(11), 'initial-sparsity invariant');
assert.equal(choreo.getCastLedger().length, 4);

const ev0 = choreo.evaluate(0, { apply: true, stage: mockCamStage });
assert.equal(actorBoard.visible, true);
assert.equal(actorArc.visible, false);
assert.equal(actorCliff.visible, false);
assert.equal(hudPanelEl.dataset.hudHidden, 'true');
assert.equal(hudPanelEl.hidden, true);
assert.equal(ev0.cameraPose.zoom, 1.0);

// Focus dimming at t=10.5 (cliff focused, board & arc dimmed to 0.2; hud-chart revealed)
const evFocus = choreo.evaluate(10.5, { apply: true, stage: mockCamStage });
assert.equal(evFocus.actorStates.cliff.opacity, 1);
assert.ok(Math.abs(evFocus.actorStates.board.opacity - 0.2) < 1e-6);
assert.ok(Math.abs(actorBoard.material.opacity - 0.9 * 0.2) < 1e-6);
assert.equal(actorBoard.material.transparent, true);
assert.equal(hudPanelEl.dataset.hudHidden, 'false');
assert.equal(hudPanelEl.hidden, false);

// Camera interpolation midpoint at t=7.0 (halfway through 6..8s beat)
const camMid = choreo.getCameraPoseAt(7.0);
assert.ok(camMid.zoom > 1.05 && camMid.zoom < 1.35);
const camEnd = choreo.getCameraPoseAt(8.5);
assert.ok(Math.abs(camEnd.zoom - 1.4) < 1e-6);
assert.ok(Math.abs(camEnd.target[0] - 2) < 1e-6);

// After focus release (t=13.0): material restores original opacity/transparent/depthWrite losslessly
choreo.evaluate(13.0, { apply: true, stage: mockCamStage });
assert.equal(actorBoard.material.opacity, 0.9);
assert.equal(actorBoard.material.transparent, false);
assert.equal(actorBoard.material.depthWrite, true);

// After arc exits at t=15.5, arc is hidden; scrubbing backward to t=7 restores arc!
choreo.evaluate(15.5, { apply: true });
assert.equal(actorArc.visible, false);
choreo.evaluate(7.0, { apply: true });
assert.equal(actorArc.visible, true);
assert.ok(appliedCameras.length >= 3);

// Wave 1 ActorChoreographer camera-lock, steady-state DOM ClearType transform & surface target.element alias
const lockedCamCalls = [];
let camLocked = true;
const lockStage = {
  isUserCameraLocked: () => camLocked,
  setCameraFromScript: (pose) => {
    if (camLocked) return false;
    lockedCamCalls.push(['script', pose]);
    return true;
  },
  setCameraImmediate: (pose) => {
    lockedCamCalls.push(['immediate', pose]);
  },
};
const surfEl = createMockElement('div');
const surfMesh = makeMock3dActor([0, 0, 0]);
const surfOpacities = [];
const mockSurf = {
  mesh: surfMesh,
  element: surfEl,
  setVisible(v) { this._vis = v; },
  setOpacity(a) { surfOpacities.push(a); },
};
const steadyHudEl = createMockElement('div');
const lockChoreo = new ActorChoreographer({
  initialCamera: { azimuth: 0.2, elevation: 0.5, zoom: 1.0, target: [0, 0, 0] },
});
lockChoreo
  .register('code-surf', mockSurf, { kind: 'surface' })
  .enter('code-surf', 2.0, 1.0, 'fade')
  .hudReveal('steady-hud', 1.0, 0.5, { el: steadyHudEl })
  .cameraBeat(1.0, 2.0, { azimuth: 1.2, elevation: 0.7, zoom: 1.3, target: [1, 0, 0] });

lockChoreo.evaluate(2.5, { apply: true, stage: lockStage });
assert.equal(lockedCamCalls.length, 0, 'Scripted cameraBeat must NOT hijack camera when userCameraLocked is true');
assert.equal(steadyHudEl.style.transform, '', 'HUD steady state (u=1) must clear transform for crisp ClearType');
assert.equal(surfEl.classList.contains('hud-reveal'), false, '3D surface element must not get .hud-reveal class');
assert.equal(surfMesh.material.opacity, 0.9, 'kind=surface must delegate opacity to setOpacity, not mutate material');
assert.ok(surfOpacities.length >= 1);

lockChoreo.evaluate(2.5, { apply: true, stage: lockStage, forceCamera: true });
assert.equal(lockedCamCalls.length, 1);
assert.equal(lockedCamCalls[0][0], 'immediate', 'forceCamera: true must apply camera even when locked');
camLocked = false;
lockChoreo.evaluate(3.0, { apply: true, stage: lockStage });
assert.equal(lockedCamCalls[1][0], 'script', 'Unlocked camera must use stage.setCameraFromScript');
console.log('[OK] ActorChoreographer (enter/exit/focus/hudReveal/cameraBeat/camera-lock/ClearType) verified');

// ============================================================================
// 7. Verify TimelineDirector v1 + v2 (`getGlobalDuration`, `seekGlobal`, `?export=`, `exposeTestHooks`)
// ============================================================================
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

const urlParsed = parseUrlState('?stage=act-2&t=0.5&paused&lang=en&export=caption&backend=webgpu&skin=obsidian-gallery');
assert.equal(urlParsed.stage, 'act-2');
assert.equal(urlParsed.t, 0.5);
assert.equal(urlParsed.paused, true);
assert.equal(urlParsed.lang, 'en');
assert.equal(urlParsed.exportMode, 'caption');
assert.equal(urlParsed.export, 'caption');
assert.equal(urlParsed.backend, 'webgpu');
assert.equal(urlParsed.skin, 'obsidian-gallery');
assert.equal(parseUrlState('?stage=act-1').skin, null);
assert.equal(parseUrlState('?export=stage').exportMode, 'stage');
assert.equal(parseUrlState('?export=hud').exportMode, 'hud');
assert.equal(parseUrlState('?export=1').exportMode, 'caption');

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

// TimelineDirector v2 global duration & cross-stage reversible seekGlobal
assert.equal(dir.getGlobalDuration(), 2.0);
const dirInfo = dir.getTimelineInfo();
assert.equal(dirInfo.mode, 'director');
assert.equal(dirInfo.duration, 2.0);
assert.equal(dirInfo.stages.length, 2);
assert.equal(dirInfo.stages[1].start, 1.0);
assert.equal(dirInfo.stages[1].end, 2.0);

dir.seekGlobal(1.5);
assert.equal(dir.getState().stageId, 'act-2');
assert.ok(Math.abs(dir.getGlobalTime() - 1.5) < 1e-6);
assert.ok(Math.abs(stateLog.val - 20) < 1e-6);

// Rewind back across stage boundary into act-1 before the 0.6s trigger
dir.seekGlobal(0.3);
assert.equal(dir.getState().stageId, 'act-1');
assert.ok(Math.abs(dir.getGlobalTime() - 0.3) < 1e-6);
assert.equal(stateLog.late, false, 'Cross-stage seekGlobal rewind must clear act-1 late trigger');
assert.ok(Math.abs(stateLog.val - 3) < 1e-6);

// Toggle playback
assert.equal(typeof TimelineDirector.prototype.toggle, 'function');
dir.pause();
assert.equal(dir.toggle().playing, true, 'TimelineDirector.toggle() must start playback');
assert.equal(dir.toggle().playing, false, 'TimelineDirector.toggle() must pause playback');

// exposeTestHooks v2 contract shape + export mode round-trip
let manualFlag = false;
let renderCount = 0;
const stubStage = {
  setManualMode(v) { manualFlag = v; },
  renderNow() { renderCount += 1; },
  setCameraImmediate() {},
  restoreSize() {},
};
const hooks = exposeTestHooks(dir, { stage: stubStage, choreographer: choreo });
assert.equal(globalThis.__ready, true);
assert.equal(hooks.version, 2);
assert.equal(hooks.profile, 'mechanical-3d');
assert.equal(hooks.getProfile(), 'mechanical-3d');
for (const fnName of [
  'getTimelineInfo',
  'enterExportMode',
  'seek',
  'exitExportMode',
  'getCaptureTargets',
  'getCaptionState',
  'getActiveActorCount',
  'getMotionMagnitude',
  'getGeometryAudit',
  'getFontAudit',
]) {
  assert.equal(typeof hooks[fnName], 'function', `window.__simulify.${fnName} must be a function`);
}
assert.equal(hooks.getTimelineInfo().duration, 2.0);
assert.equal(hooks.getActiveActorCount(0), 1);
assert.ok(hooks.getMotionMagnitude(6.0, 8.0) > 0, 'Camera beat must report positive motion magnitude');
hooks.enterExportMode({ hud: 'caption' });
assert.equal(manualFlag, true);
hooks.seek(1.25);
assert.equal(dir.getState().stageId, 'act-2');
assert.equal(hooks.getCaptionState().stageTitle, 'Act 2');
assert.ok(renderCount >= 1);
hooks.exitExportMode();
assert.equal(manualFlag, false);

assert.deepEqual(VALID_PROFILES, expectedProfiles);
assert.ok(Object.isFrozen(VALID_PROFILES));
const grounding = { sources: ['source-a'] };
for (const profile of expectedProfiles) {
  const profileHooks = exposeTestHooks(dir, { profile, grounding, stage: stubStage, version: 2 });
  assert.equal(globalThis.__simulify, profileHooks);
  assert.equal(profileHooks.profile, profile);
  assert.equal(profileHooks.getProfile(), profile);
  assert.equal(profileHooks.grounding, grounding);
}
const legacyHooks = exposeTestHooks(dir);
assert.equal(legacyHooks.version, 1);
assert.equal(legacyHooks.profile, null);
assert.equal(legacyHooks.getProfile(), null);
assert.equal(exposeTestHooks(dir, { stage: stubStage, profile: 'invalid' }).getProfile(), 'mechanical-3d');
delete globalThis.__simulify;
delete globalThis.__ready;

// Wave 1 exposeTestHooks(SpacetimeClock) single-seek 1x dispatch + mountTimelineBar i18n
let clockHookSyncCount = 0;
let clockHookOnSeekCount = 0;
let clockHookRenderCount = 0;
const syncClock = new SpacetimeClock({
  duration: 10,
  manualMode: true,
  acts: [
    { id: 'a1', title: '第 1 幕', start: 0, end: 5 },
    { id: 'a2', title: '第 2 幕', start: 5, end: 10 },
  ],
  onSeek: () => { clockHookOnSeekCount += 1; },
});
const syncChoreo = new ActorChoreographer();
syncChoreo.register('base', makeMock3dActor(), { kind: '3d', initiallyVisible: true });
const seekTimes = [];
syncClock.subscribe(({ t }) => seekTimes.push(['clock', t]));
const syncStage = {
  setManualMode() {},
  unlockUserCamera() {},
  renderNow() { clockHookRenderCount += 1; },
  getGeometryAudit: () => ({ totalMeshes: 4, cuboidMeshes: 1, sculptedMeshes: 3, cuboidRatio: 0.25 }),
};
const clockHooks = exposeTestHooks(syncClock, {
  stage: syncStage,
  choreographer: syncChoreo,
  onSeek: (t) => seekTimes.push(['seek', t]),
  syncAll: (t) => {
    seekTimes.push(['sync', t]);
    clockHookSyncCount += 1;
    syncChoreo.evaluate(t, { apply: true, stage: syncStage });
  },
});
const evalBefore = syncChoreo._evalCount;
clockHooks.seek(16);
assert.deepEqual(seekTimes.slice(-3), [['clock', 10], ['seek', 10], ['sync', 10]]);
assert.equal(clockHookSyncCount, 1, 'exposeTestHooks.seek must invoke syncAll strictly once');
assert.equal(clockHookOnSeekCount, 0, 'exposeTestHooks.seek must suppress redundant clock onSeek when syncAll exists');
assert.equal(syncChoreo._evalCount - evalBefore, 1, 'choreographer.evaluate must run strictly once per seek');
assert.equal(clockHookRenderCount, 1, 'stage.renderNow must run strictly once per seek');
assert.equal(clockHooks.getGeometryAudit().sculptedMeshes, 3);
assert.equal(clockHooks.getFontAudit().supported, false);

const singleFalsify = () => ({ passed: true, assertions: [{ name: 'baseline', passed: true }] });
const configHooks = exposeTestHooks({
  clock: syncClock, director: dir, stage: syncStage, profile: 'field-math', falsify: singleFalsify,
});
assert.equal(configHooks.version, 3);
assert.equal(configHooks.getProfile(), 'field-math');
assert.equal(configHooks.clock, syncClock);
assert.equal(configHooks.director, dir);
assert.equal(configHooks.stage, syncStage);
assert.equal(configHooks.falsify, singleFalsify);
assert.equal(configHooks.seek(3).t, 3);
assert.equal(syncClock.t, 3);
assert.equal(exposeTestHooks({ version: 2, clock: syncClock }).profile, 'mechanical-3d');
assert.equal(exposeTestHooks({ profile: 'narrative-3d', stage: { profile: 'field-math' } }).profile, 'mechanical-3d');
assert.equal(exposeTestHooks({ stage: { profile: 'field-math' } }).profile, 'field-math');
assert.equal(exposeTestHooks({ director: dir }).seek(1.25).globalTime, 1.25);
const choreographed = [];
const boundedHooks = exposeTestHooks({
  clock: syncClock, choreographer: { evaluate: (t) => choreographed.push(t) },
});
assert.equal(boundedHooks.seek(100).t, 10);
assert.equal(boundedHooks.seek(-100).t, 0);
assert.deepEqual(choreographed, [10, 0]);

withMockDocument(() => {
  const barSlot = createMockElement('div');
  const bar = mountTimelineBar(barSlot, syncClock, { lang: 'zh' });
  const stageBtns = bar.root.querySelectorAll((n) => n.classList.contains('timeline-stage-btn'));
  assert.equal(stageBtns.length, 2);
  assert.equal(stageBtns[0].textContent, '第 1 幕');
  bar.setLang('en', { stages: ['Act 1', 'Act 2'] });
  assert.equal(stageBtns[0].textContent, 'Act 1');
  assert.equal(stageBtns[1].textContent, 'Act 2');
  bar.setStageLabels({ a1: 'Intro', a2: 'Fork' });
  assert.equal(stageBtns[0].textContent, 'Intro');
  assert.equal(stageBtns[1].textContent, 'Fork');
  bar.unmount();
});
syncClock.destroy();
delete globalThis.__simulify;
delete globalThis.__ready;
console.log('[OK] TimelineDirector compatibility, SpacetimeClock 1x seek, timeline i18n, and v3 hook options verified');

execFileSync(python, ['-B', '-c', `
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from scripts import verify_stage as verify
from scripts.setup_vendor import collect_project_cjk_chars
from scripts.verify_stage import PROFILE_GATES, entry_url, evaluate_falsify, evaluate_profile_policy, resolve_effective_profile

assert list(PROFILE_GATES) == ${JSON.stringify(expectedProfiles)}
resolve = resolve_effective_profile
assert resolve('mechanical-3d', 'field-math', False, True) == 'mechanical-3d'
assert resolve('auto', 'sandbox-direct', True, True) == 'sandbox-direct'
assert resolve('auto', None, True, True) == 'mechanical-3d'
assert resolve('auto', 'invalid', False, True) == 'mechanical-3d'
assert resolve('auto', None, True, False) is None
assert resolve('auto', None, False, False) is None

all_hard = dict.fromkeys((
    'geometry_diversity', 'three_views', 'initial_sparsity',
    'temporal_scrub', 'camera_ownership', 'mandatory_falsify',
), 'hard')
advisory = dict(all_hard, geometry_diversity='advisory', three_views='advisory', initial_sparsity='advisory')
for profile, expected in (
    ('mechanical-3d', all_hard),
    ('field-math', advisory), ('sandbox-direct', advisory),
):
    assert PROFILE_GATES[profile] == expected, profile
    assert evaluate_profile_policy(profile) == expected, profile
    assert evaluate_profile_policy(profile, duration=0.201)['temporal_scrub'] == 'hard', profile
    static_scrub = 'hard' if profile == 'mechanical-3d' else 'skipped'
    assert evaluate_profile_policy(profile, duration=0.2)['temporal_scrub'] == static_scrub, profile
    assert evaluate_profile_policy(profile, has_3d=False) == (expected if profile == 'mechanical-3d' else dict(
        expected, geometry_diversity='skipped', three_views='skipped', camera_ownership='skipped',
    )), profile

named_check = {'name': 'deflection', 'passed': True}
assert evaluate_falsify({'passed': True, 'assertions': [named_check]}, True)
for assertions in ([], [{}], [{'name': ' ', 'passed': True}],
                   [dict(named_check, passed=1)], [dict(named_check, baseMetric=1, mutantMetric=1)],
                   [dict(named_check, baseMetric=1)], [dict(named_check, baseMetric=None, mutantMetric=None)]):
    assert not evaluate_falsify({'passed': True, 'assertions': assertions}, True), assertions
structured = dict(passed=True, version=3, total=1, passedCount=1)
assert not evaluate_falsify({'passed': True, 'assertions': [named_check]}, True, is_v3=True)
assert not evaluate_falsify(dict(structured, assertions=[dict(named_check, comparisons=2)]), True, is_v3=True)
assert evaluate_falsify(dict(structured, assertions=[dict(named_check, comparisons=2)]), True, from_model=True, is_v3=True)
for malformed in (dict(total=True), dict(passedCount=1.0), dict(version=3.0)):
    assert not evaluate_falsify(dict(structured, assertions=[dict(named_check, comparisons=2)]) | malformed,
                                True, from_model=True, is_v3=True)
assert not evaluate_falsify(dict(structured, assertions=[named_check]), True)
assert not evaluate_falsify({'passed': True, 'assertions': [named_check]}, True, from_model=True)
assert evaluate_falsify(dict(structured, assertions=[dict(named_check, comparisons=1, baseMetric=1, mutantMetric=2)]),
                        True, from_model=True)
for result in (None, {}, {'passed': False}, {'passed': 'true'}, {'passed': 1}, True):
    assert not evaluate_falsify(result, True), result
assert evaluate_falsify(None, False)
assert evaluate_falsify({'passed': 'true'}, False)
assert not evaluate_falsify({'passed': False}, False)
assert entry_url('index.html?backend=webgpu&skin=paper-ink#view', 'webgl2', '?stage=ice&end') == (
    'index.html?skin=paper-ink&stage=ice&end=&backend=webgl2#view'
)
with TemporaryDirectory() as directory:
    root = Path(directory)
    invalid = root / 'missing.png'
    assert verify.analyze_canvas_variance(invalid, None) == (False, -1.0)
    if verify.Image is not None:
        solid = root / 'solid.png'
        image = verify.Image.new('RGB', (40, 30), (31, 22, 15))
        image.save(solid)
        assert verify.analyze_canvas_variance(solid, None) == (False, 0.0)
        image.paste((100, 22, 15), (20, 0, 40, 30))
        image.save(solid)
        assert verify.analyze_canvas_variance(solid, dict(left=50, top=0, width=20, height=20)) == (False, -1.0)
        assert verify.analyze_canvas_variance(solid, None) == (True, 34.5)
        with patch.object(verify, 'Image', None):
            assert verify.analyze_canvas_variance(solid, None) == (False, -1.0)
    else:
        print('[SKIP] Solid PNG variance requires Pillow and NumPy')
    project = root / 'build' / 'dist' / 'project'
    project.mkdir(parents=True)
    (project / 'index.html').write_text('硅', encoding='utf-8')
    (project / 'build').mkdir()
    (project / 'build' / 'index.html').write_text('釷', encoding='utf-8')
    assert '硅' in collect_project_cjk_chars(project)
    assert '釷' not in collect_project_cjk_chars(project)
`], { cwd: ROOT, stdio: 'inherit' });
console.log('[OK] Python verifier profile resolution, gate policies, and legacy and structured falsification verified');

// ============================================================================
// 8. Verify Spring negative `dt` guard (`kit/spring.js`)
// ============================================================================
const spring = new Spring({ value: 0, target: 10, stiffness: 260, damping: 20 });
const beforeVal = spring.step(-5);
assert.equal(beforeVal, 0, 'Negative dt=-5 must not move spring');
assert.ok(Number.isFinite(spring.value) && Number.isFinite(spring.velocity), 'Negative dt must never produce NaN/Infinity');
spring.step(-0.016);
spring.step(Number.NaN);
assert.equal(spring.value, 0);
assert.equal(spring.velocity, 0);
for (let i = 0; i < 120; i += 1) spring.step(1 / 60);
assert.equal(spring.settled(), true, 'Spring must settle cleanly under positive dt');
assert.equal(spring.value, 10);
spring.impulse(5);
assert.equal(spring.settled(), false);
spring.snap(4);
assert.equal(spring.value, 4);
assert.equal(spring.target, 4);
assert.equal(spring.velocity, 0);
console.log('[OK] Spring negative dt guard & convergence verified');

// ============================================================================
// 9. Verify PhaseScrubber, ChartCard v2, LiveMathsPanel v2
// ============================================================================
const scrub = new PhaseScrubber({ duration: 2, speed: 0.5, steadyTime: 1.5, playing: true });
scrub.tick(1.0);
assert.ok(Math.abs(scrub.getState().t - 0.5) < 1e-6);
scrub.jumpToSteady();
assert.ok(Math.abs(scrub.getState().t - 1.5) < 1e-6);

withMockDocument(() => {
  // ChartCard v2: non-colliding Y-label + multi-ghost + onScrub
  const titleEl = createMockElement('span');
  const badgeEl = createMockElement('span');
  const foldBtn = createMockElement('button');
  const bodyEl = createMockElement('div');
  const rootEl = createMockElement('section');
  rootEl.querySelector = (sel) => ({
    '.chart-title': titleEl,
    '.chart-badge': badgeEl,
    '.chart-fold': foldBtn,
    '.chart-body': bodyEl,
  }[sel] || null);

  const scrubbed = [];
  const card = new ChartCard(rootEl, { title: 'Return', mode: 'xy', onScrub: (u, val) => scrubbed.push([u, val]) });
  card.updateXY({
    badge: 'n=4',
    xMin: 0,
    xMax: 100,
    yMin: -100,
    yMax: 0,
    xLabel: 'Episode',
    yLabel: 'Return',
    series: [{ tone: 'teal', points: [{ x: 0, y: -90 }, { x: 100, y: -15 }] }],
    ghosts: [{ tone: 'amber', points: [{ x: 0, y: -95 }, { x: 100, y: -35 }] }],
    dot: { x: 50, y: -40, tone: 'teal' },
  });
  const svg = bodyEl.children[0];
  assert.equal(svg.tagName, 'SVG');
  const texts = svg.querySelectorAll((n) => n.tagName === 'TEXT');
  const yLabelEl = texts.find((t) => t.textContent === 'Return');
  assert.ok(yLabelEl, 'ChartCard.updateXY must render yLabel');
  assert.equal(yLabelEl.getAttribute('x'), '36', 'yLabel sits at padL=36 clear of left tick gutter');
  assert.equal(yLabelEl.getAttribute('y'), '11', 'yLabel sits above top plot line (padT=24)');
  for (const tx of texts) {
    assert.ok(Number(tx.getAttribute('font-size')) >= 11.5, 'ChartCard axis/tick labels must be >= 11.5px');
  }
  assert.equal(svg.querySelectorAll((n) => n.getAttribute('class') === 'xy-ghost').length, 1);
  assert.equal(card._scrubMeta.xSpan, 100);

  // Wave 1 ChartCard persistent SVG node reuse (no pointerCapture loss) + movingAverageWindow trend smoothing
  const noisyPts = Array.from({ length: 12 }, (_, i) => ({
    x: i * 10,
    y: -50 + (i % 2 === 0 ? 30 : -30),
  }));
  card.updateXY({
    badge: 'MA5',
    xMin: 0,
    xMax: 110,
    yMin: -100,
    yMax: 0,
    xLabel: 'Episode',
    yLabel: 'Return',
    movingAverageWindow: 5,
    rawOpacity: 0.25,
    series: [{ tone: 'teal', points: noisyPts }],
    dot: { x: 60, y: -50, tone: 'teal' },
  });
  assert.equal(bodyEl.children[0], svg, 'Consecutive updateXY() must reuse the exact same persistent SVG root node');
  const rawPolys = svg.querySelectorAll((n) => n.getAttribute('class') === 'xy-series-raw');
  const smoothPolys = svg.querySelectorAll((n) => (n.getAttribute('class') || '').includes('xy-series-smooth'));
  assert.equal(rawPolys.length, 1, 'movingAverageWindow must emit dimmed raw underlay polyline');
  assert.equal(rawPolys[0].getAttribute('stroke-opacity'), '0.25');
  assert.equal(smoothPolys.length, 1, 'movingAverageWindow must emit smoothed trend polyline');
  const parseYRange = (poly) => {
    const ys = String(poly.getAttribute('points') || '')
      .trim()
      .split(/\s+/)
      .map((pair) => Number(pair.split(',')[1]));
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(
    parseYRange(smoothPolys[0]) < parseYRange(rawPolys[0]),
    'Moving-average smoothed curve must strictly damp raw oscillation amplitude'
  );

  // LiveMathsPanel v2 + Wave 1 KaTeX AST helpers & normalizeUnicodeScripts rescue
  const rescuedSegs = normalizeUnicodeScripts('Gₜ:ₜ₊₄ = Σ γᵏ R + γ⁴ V(Sₜ₊₄)');
  assert.ok(rescuedSegs.some((s) => s.type === 'sub' && s.value === 't:t+4'), 'Must rescue Unicode subscript range t:t+4');
  assert.ok(rescuedSegs.some((s) => s.type === 'sup' && s.value === 'k'), 'Must rescue Unicode superscript k');
  assert.ok(rescuedSegs.some((s) => s.type === 'sup' && s.value === '4'), 'Must rescue Unicode superscript 4');
  assert.ok(rescuedSegs.some((s) => s.type === 'sub' && s.value === 't+4'), 'Must rescue Unicode subscript t+4');
  assert.equal(
    rescuedSegs.some((s) => /[ₜ₊ₖ⁴]/.test(s.value)),
    false,
    'Normalized segments must contain zero leftover Unicode micro-scripts'
  );

  const mathsBus = new LinkBus();
  const panel = new LiveMathsPanel(null, { title: 'TD(0)', surfaceMode: true, linkBus: mathsBus });
  assert.equal(panel.getElement().dataset.surfaceMode, 'true');
  panel.update({
    badge: 'α=0.5',
    equations: [
      {
        label: 'Structured AST',
        tokens: [
          mathSub(mathVar('G'), 't:t+n', { tone: 'teal', linkId: 'cell-2-1' }),
          ' = ',
          mathOp('∑', { lower: 'k=0', upper: 'n-1', display: true }),
          mathSup(mathVar('γ'), 'k'),
          mathSub(mathVar('R'), 't+k+1'),
          ' + ',
          mathFrac(mathSubSup(mathVar('V'), 't', 'π'), mathNum('100')),
          mathGroup([mathText(' ns'), ' · AMAT'], { tone: 'amber' }),
        ],
      },
      {
        label: 'Legacy Unicode Rescue',
        tokens: [{ text: 'V(Sₜ) ← V(Sₜ) + α·δₜ + γ⁴', tone: 'navy' }],
      },
    ],
  });
  const panelRoot = panel.getElement();
  const linkedTerms = panelRoot.querySelectorAll((n) => n.dataset?.linkId === 'cell-2-1');
  assert.equal(linkedTerms.length, 1);
  mathsBus.hover('cell-2-1', '3d');
  assert.equal(linkedTerms[0].dataset.linkedHot, 'true');
  mathsBus.select('cell-2-1', '3d');
  assert.equal(linkedTerms[0].dataset.linkedSelected, 'true');

  assert.ok(panelRoot.querySelectorAll((n) => n.tagName === 'VAR' && n.classList?.contains('lm-var')).length >= 4);
  assert.ok(panelRoot.querySelectorAll((n) => n.tagName === 'SUB' && n.classList?.contains('lm-sub')).length >= 3);
  assert.ok(panelRoot.querySelectorAll((n) => n.tagName === 'SUP' && n.classList?.contains('lm-sup')).length >= 2);
  assert.equal(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-subsup')).length, 1);
  assert.equal(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-frac')).length, 1);
  assert.equal(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-frac-num')).length, 1);
  assert.equal(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-frac-den')).length, 1);
  assert.ok(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-op')).length >= 1);
  assert.equal(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-op-lower')).length, 1);
  assert.equal(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-op-upper')).length, 1);
  assert.ok(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-num')).length >= 1);
  assert.ok(panelRoot.querySelectorAll((n) => n.classList?.contains('lm-text')).length >= 1);
  const italicWords = panelRoot
    .querySelectorAll((n) => n.tagName === 'VAR')
    .map((n) => n.textContent);
  assert.equal(italicWords.includes('AMAT'), false, 'Multi-letter Roman identifiers like AMAT must stay upright');
  panel.destroy();
});
console.log('[OK] PhaseScrubber, ChartCard v2 (persistent SVG/MA/11.5px), and LiveMathsPanel v2 (KaTeX AST/Unicode rescue) verified');

// ============================================================================
// 13. Safe Node-Import Smoke Checks (`kit/html-surface.js`, `kit/manipulator.js`)
// ============================================================================
const threeUrl = pathToFileURL(path.join(ROOT, 'examples', 'shared', 'vendor', 'three', 'three.webgpu.js')).href;
const addonsPrefix = pathToFileURL(path.join(ROOT, 'examples', 'shared', 'vendor', 'three', 'addons') + path.sep).href;

if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'three') return { url: threeUrl, shortCircuit: true };
      if (specifier.startsWith('three/addons/')) {
        return { url: addonsPrefix + specifier.slice('three/addons/'.length), shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
} else if (typeof nodeModule.register === 'function') {
  const hookSrc = `export async function resolve(s, c, n) {
    if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
    if (s.startsWith('three/addons/')) return { url: ${JSON.stringify(addonsPrefix)} + s.slice(13), shortCircuit: true };
    return n(s, c);
  }`;
  nodeModule.register('data:text/javascript,' + encodeURIComponent(hookSrc));
}

const THREE = await import('three');
const { supportsHtmlInCanvas, computeCanvasMatrix4, HtmlSurfaceManager } = await import('../kit/html-surface.js');
const { StageManipulator, GridBrush } = await import('../kit/manipulator.js');

assert.equal(supportsHtmlInCanvas(), false, 'supportsHtmlInCanvas() must return false in Node');
assert.equal(typeof HtmlSurfaceManager, 'function');
assert.equal(typeof computeCanvasMatrix4, 'function');

const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1));
const orthoCam = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
orthoCam.position.set(0, 0, 10);
orthoCam.lookAt(0, 0, 0);
orthoCam.updateMatrixWorld(true);
const mat4 = computeCanvasMatrix4(
  { clientWidth: 1280, clientHeight: 800 },
  { offsetWidth: 320, offsetHeight: 160 },
  planeMesh,
  orthoCam
);
assert.ok(mat4 && mat4.elements.length === 16 && mat4.elements.every(Number.isFinite));

// HtmlSurfaceManager native hidden->visible awaitingPaint guard & __simulify.seek async coordination
{
  const prevHtmlCanvas = globalThis.HTMLCanvasElement;
  const prevGpuUsage = globalThis.GPUTextureUsage;
  globalThis.HTMLCanvasElement = {
    prototype: { content: '', requestPaint() {}, updateElementGeometry() {} },
  };
  globalThis.GPUTextureUsage = { COPY_DST: 8, RENDER_ATTACHMENT: 16, TEXTURE_BINDING: 4 };
  try {
    let paintReqCount = 0;
    let drawElCount = 0;
    let renderReqCount = 0;
    const mockHicCanvas = {
      width: 2560,
      height: 1600,
      clientWidth: 1280,
      clientHeight: 800,
      onpaint: null,
      setAttribute() {},
      appendChild(el) { el.parentElement = this; },
      requestPaint() { paintReqCount += 1; },
      updateElementGeometry() {},
      clearElementGeometry() {},
    };
    const mockGpuDevice = {
      createTexture: (desc) => ({ width: desc.size.width, height: desc.size.height, destroy() {} }),
      queue: {
        drawElementImageToTexture() { drawElCount += 1; },
        submit() {},
      },
    };
    const mockHicStage = {
      canvas: mockHicCanvas,
      camera: orthoCam,
      size: { width: 1280, height: 800, dpr: 2, physicalWidth: 2560, physicalHeight: 1600 },
      _manualMode: false,
      _rendererReady: true,
      backendKind: 'webgpu',
      renderer: { isWebGPURenderer: true, backend: { isWebGPUBackend: true, device: mockGpuDevice } },
      getMaxAnisotropy: () => 16,
      requestRender() { renderReqCount += 1; },
    };
    const mgr = new HtmlSurfaceManager(mockHicStage, { enabled: true });
    assert.equal(mgr.nativeEnabled, true);

    const panelEl = createMockElement('section');
    panelEl.offsetWidth = 468;
    panelEl.offsetHeight = 206;
    panelEl.dataset.hudHidden = 'true';
    const handle = mgr.mount('trace', panelEl, { worldWidth: 4, worldHeight: 2 });
    handle.setVisible(false);

    // Hidden element must never be uploaded or mark pending visible
    assert.equal(mgr.hasPendingVisible(), false);
    assert.equal(mgr.syncPaint(null), false);
    assert.equal(drawElCount, 0);

    // hidden -> visible transition: synchronous syncPaint(null) BEFORE onpaint must NOT upload or clear dirty!
    panelEl.dataset.hudHidden = 'false';
    handle.setVisible(true);
    const surf = mgr.surfaces.get('trace');
    assert.equal(surf.dirty, true);
    assert.equal(surf.awaitingPaint, true);
    assert.equal(mgr.hasPendingVisible(), true);

    assert.equal(mgr.syncPaint(null), false, 'syncPaint(null) outside onpaint must defer awaitingPaint surface');
    assert.equal(drawElCount, 0, 'Must not call drawElementImageToTexture before Blink onpaint');
    assert.equal(surf.dirty, true, 'syncPaint(null) must preserve surf.dirty until onpaint uploads a valid frame');
    assert.equal(surf.awaitingPaint, true);

    // Once Blink fires canvas.onpaint (even with empty changedElements), upload succeeds & clears flags
    mockHicCanvas.onpaint({ changedElements: [] });
    assert.equal(drawElCount, 1, 'onpaint must upload visible awaitingPaint surface exactly once');
    assert.equal(surf.dirty, false);
    assert.equal(surf.awaitingPaint, false);
    assert.equal(surf.uploadedOnce, true);
    assert.equal(mgr.hasPendingVisible(), false);
    assert.ok(paintReqCount >= 1 && renderReqCount >= 1);

    // exposeTestHooks.seek(t) must coordinate with stage.renderNowAsync() when a visible HIC surface is pending
    panelEl.dataset.hudHidden = 'false';
    handle.markDirty();
    assert.equal(mgr.hasPendingVisible(), true);
    let asyncRenders = 0;
    const seekClock = new SpacetimeClock({ duration: 44, manualMode: true });
    const seekStage = {
      ...mockHicStage,
      htmlSurfaces: mgr,
      unlockUserCamera() {},
      renderNow() {},
      async renderNowAsync() {
        asyncRenders += 1;
        mockHicCanvas.onpaint({ changedElements: [panelEl] });
        return true;
      },
    };
    const seekHooks = exposeTestHooks(seekClock, { stage: seekStage });
    const seekPromise = seekHooks.seek(41.0);
    assert.equal(typeof seekPromise?.then, 'function', '__simulify.seek must return a Promise when HIC surface is pending');
    await seekPromise;
    assert.equal(asyncRenders, 1, '__simulify.seek must await stage.renderNowAsync() for pending HIC surfaces');
    assert.equal(mgr.hasPendingVisible(), false);
    seekClock.destroy();
    delete globalThis.__simulify;
    delete globalThis.__ready;
    mgr.dispose();
  } finally {
    if (prevHtmlCanvas === undefined) delete globalThis.HTMLCanvasElement;
    else globalThis.HTMLCanvasElement = prevHtmlCanvas;
    if (prevGpuUsage === undefined) delete globalThis.GPUTextureUsage;
    else globalThis.GPUTextureUsage = prevGpuUsage;
  }
}

// StageManipulator & GridBrush Node smoke lifecycle
const fakeCanvas = {
  style: {},
  addEventListener() {},
  removeEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
};
const fakeManipStage = { canvas: fakeCanvas, camera: orthoCam, _drag: false };
const manip = new StageManipulator(fakeManipStage);
manip.addHandle('h1', planeMesh, { axis: [1, 0, 0], min: -2, max: 2 });
manip.addClickable('c1', new THREE.Object3D());
assert.equal(manip.isDragging(), false);
manip.dispose();

const brush = new GridBrush(fakeManipStage, { targets: [planeMesh], active: false });
brush.setActive(true);
assert.equal(brush.active, true);
assert.equal(fakeCanvas.style.cursor, 'crosshair');
brush.dispose();

// IsometricStage volumetric bounds audit, setCardinalView() (Front/Side/Top/Iso) & WebGPU timeout auto-fallback
const { IsometricStage } = await import('../kit/stage-3d.js');
const mockStageCanvas = {
  style: {},
  dataset: {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setPointerCapture() {},
  releasePointerCapture() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
};
const stage = new IsometricStage(mockStageCanvas, { backend: 'webgl2', htmlInCanvas: false, autoLoop: false });
const volMesh = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.01, 0), new THREE.Vector2(1.2, 0.8), new THREE.Vector2(0.4, 2.0)]), new THREE.MeshStandardMaterial());
volMesh.userData.simulifyGeoKind = 'lathe';
stage.scene.add(volMesh);

const geoAudit = stage.getGeometryAudit();
assert.equal(geoAudit.sculptedMeshes, 1);
assert.ok(geoAudit.bounds && geoAudit.bounds.width > 2.0 && geoAudit.bounds.height >= 1.9 && geoAudit.bounds.depth > 2.0);
assert.ok(geoAudit.bounds.flatnessRatio >= 0.7, `Expected volumetric flatnessRatio >= 0.7, got ${geoAudit.bounds.flatnessRatio}`);

const vFront = stage.setCardinalView('front', { unlock: true });
assert.equal(vFront.view, 'front');
assert.equal(vFront.azimuthDeg, 0);
assert.equal(vFront.elevationDeg, 0);
const vSide = stage.setCardinalView('side', { unlock: true });
assert.equal(vSide.azimuthDeg, 90);
assert.equal(vSide.elevationDeg, 0);
const vTop = stage.setCardinalView('top', { unlock: true });
assert.equal(vTop.elevationDeg, 88.5);
const vIso = stage.setCardinalView('iso', { unlock: true });
assert.equal(vIso.view, 'iso');

const tvClock = new SpacetimeClock({ duration: 10, manualMode: true });
const tvHooks = exposeTestHooks(tvClock, { stage });
assert.equal(typeof tvHooks.setCardinalView, 'function', 'exposeTestHooks must expose setCardinalView()');
assert.equal(tvHooks.setCardinalView('side').azimuthDeg, 90);
tvClock.destroy();
delete globalThis.__simulify;
delete globalThis.__ready;
stage.dispose();

console.log('[OK] Node smoke checks passed for stage-3d (bounds + 3-views), html-surface, manipulator, GridBrush');

// ============================================================================
// 14. Verify Offline Four-Tier Typography & Crisp CanvasTexture (`kit/fonts.js`)
// ============================================================================
for (const role of ['display', 'sans', 'math', 'mathItalic', 'mono']) {
  assert.ok(typeof FONT_STACKS[role] === 'string' && FONT_STACKS[role].length > 8, `FONT_STACKS.${role} must be non-empty`);
}

const monoFontStr = canvasFont('mono', 14, 600);
assert.ok(monoFontStr.includes('JetBrains Mono'), 'canvasFont("mono") must lead with JetBrains Mono');
assert.ok(
  /Simulify Sans SC|Noto Sans SC|Source Han Sans/.test(monoFontStr),
  `canvasFont("mono") must include offline CJK fallback, got: ${monoFontStr}`
);
assert.ok(monoFontStr.startsWith('normal 600 14px '), `Unexpected mono font spec: ${monoFontStr}`);

const sansFontStr = canvasFont('sans', 13.5, 500);
assert.ok(sansFontStr.includes('Inter') && sansFontStr.includes('Simulify Sans SC'));
const displayFontStr = canvasFont('display', 22, 700);
assert.ok(displayFontStr.includes('Newsreader') && displayFontStr.includes('Simulify Display SC'));
const mathItStr = canvasFont('mathItalic', 15, 400);
assert.ok(mathItStr.startsWith('italic 400 15px ') && mathItStr.includes('KaTeX_Math'));

// Verify getFontStack appends CJK fallback even if a custom theme CSS var omits CJK
const prevGetComputedStyle = globalThis.getComputedStyle;
withMockDocument(() => {
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (prop) => (prop === '--font-mono' ? '"JetBrains Mono", monospace' : ''),
  });
  const resolvedMono = getFontStack('mono');
  assert.ok(
    resolvedMono.includes('JetBrains Mono') && resolvedMono.includes('Simulify Sans SC'),
    'getFontStack("mono") must append CJK fallback when CSS var omits CJK'
  );
});
if (prevGetComputedStyle === undefined) delete globalThis.getComputedStyle;
else globalThis.getComputedStyle = prevGetComputedStyle;

let waitCbRes = null;
const fontWaitRes = await waitForFonts(50, (res) => { waitCbRes = res; });
assert.equal(fontWaitRes.status, 'unavailable', 'waitForFonts() must resolve safely in Node without DOM fonts');
assert.deepEqual(waitCbRes, fontWaitRes, 'waitForFonts(ms, onReady) must deliver result to callback');
assert.equal(areFontsReady(), true);
assert.equal(typeof onFontsReady, 'function');

// Verify createCrispCanvasTexture configures sRGB, mipmaps, 16x anisotropy, redraw & resize
let crispDrawCalls = 0;
let lastDrawSize = null;
withMockDocument((doc) => {
  const origCreate = doc.createElement;
  doc.createElement = (tag) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          setTransform() {},
          clearRect() {},
          fillRect() {},
          fillText() {},
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
        }),
      };
    }
    return origCreate(tag);
  };
  const tex = createCrispCanvasTexture(THREE, {
    width: 512,
    height: 512,
    anisotropy: 16,
    draw: (ctx, w, h, meta) => {
      crispDrawCalls += 1;
      lastDrawSize = [w, h];
      assert.equal(typeof meta.canvasFont, 'function');
      assert.equal(ctx.imageSmoothingQuality, 'high');
    },
  });
  assert.equal(tex.texture, tex, 'createCrispCanvasTexture must alias .texture to itself');
  assert.equal(tex.anisotropy, 16);
  assert.equal(tex.generateMipmaps, true);
  assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
  assert.equal(crispDrawCalls, 1);
  assert.deepEqual(lastDrawSize, [512, 512]);
  tex.redraw({ step: 2 });
  assert.equal(crispDrawCalls, 2);
  tex.resize(1024, 512);
  assert.equal(crispDrawCalls, 3);
  assert.deepEqual(lastDrawSize, [1024, 512]);
  tex.dispose();
  tex.redraw();
  assert.equal(crispDrawCalls, 3, 'Disposed texture must ignore subsequent redraw() calls');
});
console.log('[OK] Offline typography kit (kit/fonts.js: FONT_STACKS/canvasFont CJK/waitForFonts/createCrispCanvasTexture) verified');

// ============================================================================
// 15. Verify Cross-Domain Non-Cuboid 3D Sculpting Library (`kit/geo-sculpt.js`)
// ============================================================================
const GeoSculpt = await import('../kit/geo-sculpt.js');
const {
  SCULPT_GEO_KINDS,
  SCULPT_MATERIAL_PRESETS,
  createSculptMaterial,
  createLathedSolid,
  createGlassVessel,
  createSculptedProbe,
  createBeaconLighthouse,
  createBevelledProfile,
  createGearWheel,
  createHorseshoeYoke,
  createArchSpan,
  createAirfoilVane,
  createHeightfieldSurface,
  createFracturedChasm,
  createParametricSurface,
  createDeformableStrip,
  createHelicalCoil,
  createTaperedConduit,
  createPleatedBellows,
} = GeoSculpt;

assert.ok(Array.isArray(SCULPT_GEO_KINDS) && SCULPT_GEO_KINDS.length === 9);
assert.ok(Object.keys(SCULPT_MATERIAL_PRESETS).length >= 10);

// 15a. Lit PBR Material Factory (zero MeshBasicMaterial, adapts to paper-ink & dark-studio)
for (const presetName of Object.keys(SCULPT_MATERIAL_PRESETS)) {
  const matLight = createSculptMaterial(presetName, { theme: 'paper-ink' });
  const matDark = createSculptMaterial(presetName, { theme: 'dark-studio' });
  for (const m of [matLight, matDark]) {
    assert.ok(
      m.isMeshStandardMaterial || m.isMeshPhysicalMaterial,
      `Preset "${presetName}" must construct a physically lit PBR material`
    );
    assert.equal(Boolean(m.isMeshBasicMaterial), false, `Preset "${presetName}" must never use MeshBasicMaterial`);
    m.dispose();
  }
}

// Helper to verify every generated mesh has finite vertices/normals, valid indices, simulifyGeoKind & PBR material
function assertValidSculpt(root, expectedKinds, label) {
  const allowed = new Set(Array.isArray(expectedKinds) ? expectedKinds : [expectedKinds]);
  let meshCount = 0;
  root.traverse((obj) => {
    if (!obj || !obj.isMesh) return;
    meshCount += 1;
    const meshKind = obj.userData?.simulifyGeoKind;
    const geoKind = obj.geometry?.userData?.simulifyGeoKind;
    assert.ok(
      SCULPT_GEO_KINDS.includes(meshKind),
      `${label}: mesh.userData.simulifyGeoKind ("${meshKind}") must be a registered sculpt kind`
    );
    assert.equal(geoKind, meshKind, `${label}: geometry.userData.simulifyGeoKind must match mesh tag`);
    assert.ok(allowed.has(meshKind), `${label}: unexpected kind "${meshKind}", expected one of [${[...allowed]}]`);

    const pos = obj.geometry.getAttribute('position');
    assert.ok(pos && pos.count > 0, `${label}: geometry must contain vertices`);
    for (let i = 0; i < pos.array.length; i += 1) {
      assert.ok(Number.isFinite(pos.array[i]), `${label}: NaN/Infinity in position[${i}]`);
    }
    const norm = obj.geometry.getAttribute('normal');
    assert.ok(norm && norm.count === pos.count, `${label}: geometry must contain matching vertex normals`);
    for (let i = 0; i < norm.array.length; i += 1) {
      assert.ok(Number.isFinite(norm.array[i]), `${label}: NaN/Infinity in normal[${i}]`);
    }
    const idx = obj.geometry.getIndex();
    if (idx) {
      for (let i = 0; i < idx.array.length; i += 1) {
        const v = idx.array[i];
        assert.ok(Number.isInteger(v) && v >= 0 && v < pos.count, `${label}: index ${v} out of range [0, ${pos.count})`);
      }
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      assert.ok(m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial), `${label}: mesh must use lit PBR material`);
      assert.equal(Boolean(m.isMeshBasicMaterial), false, `${label}: mesh must never use unlit MeshBasicMaterial`);
    }
  });
  assert.ok(meshCount > 0, `${label}: must produce at least one 3D mesh`);
}

// 15b. Family 1 — Turned / Lathed Precision Solids
const lathed = createLathedSolid([[0.01, 0], [0.25, 0.05], [0.18, 0.4], [0.01, 0.5]], { smooth: true, closed: true });
assertValidSculpt(lathed, 'lathe', 'createLathedSolid');

for (const style of ['ampoule', 'flask', 'dome', 'lens']) {
  const vessel = createGlassVessel({ style, fillLevel: style === 'lens' ? null : 0.45 });
  assertValidSculpt(vessel, 'lathe', `createGlassVessel(${style})`);
  if (vessel.setFillLevel && vessel.fluidMesh) {
    vessel.setFillLevel(0.8);
    assertValidSculpt(vessel, 'lathe', `createGlassVessel(${style}).setFillLevel`);
  }
}

const probe = createSculptedProbe({ tone: 'teal', vane: true });
assertValidSculpt(probe, ['lathe', 'extrude'], 'createSculptedProbe');
probe.setAccentColor('amber');
probe.setHeading(Math.PI / 3);
probe.setEmissiveIntensity(0.75);
assert.ok(Math.abs(probe.rotation.y - Math.PI / 3) < 1e-6);

const beacon = createBeaconLighthouse({ fresnelRings: 4, color: 'gold' });
assertValidSculpt(beacon, 'lathe', 'createBeaconLighthouse');
beacon.setBeaconColor('teal');
beacon.setBeaconIntensity(1.1);

// 15c. Family 2 — Bevelled Extruded Profiles
const profileMesh = createBevelledProfile([[-0.4, -0.2], [0.4, -0.2], [0.3, 0.3], [-0.3, 0.3]], { depth: 0.2 });
assertValidSculpt(profileMesh, 'extrude', 'createBevelledProfile');

const gear = createGearWheel({ teeth: 14, spokes: 4, hub: true });
assertValidSculpt(gear, ['extrude', 'lathe'], 'createGearWheel');

const yoke = createHorseshoeYoke({ poleTips: true });
assertValidSculpt(yoke, 'extrude', 'createHorseshoeYoke');

for (const archStyle of ['parabolic', 'circular', 'pointed']) {
  assertValidSculpt(createArchSpan({ archStyle }), 'extrude', `createArchSpan(${archStyle})`);
}
assertValidSculpt(createAirfoilVane({ camber: 0.04, orient: 'xz' }), 'extrude', 'createAirfoilVane');

// 15d. Family 3 — Zero-GC Deformable Heightfield, Fractured Chasm, Parametric Surface & Elastic Strip
const hf = createHeightfieldSurface({
  width: 4,
  depth: 3,
  segsX: 16,
  segsZ: 12,
  heightFn: (u, v) => Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.6,
  colorFn: (u, v, y, out) => out.setRGB(0.2 + u * 0.5, 0.4 + y * 0.4, 0.6),
  skirt: true,
});
assertValidSculpt(hf, 'heightfield', 'createHeightfieldSurface');
const hfPosArr = hf.geometry.getAttribute('position').array;
const hfNormArr = hf.geometry.getAttribute('normal').array;
const hfColArr = hf.geometry.getAttribute('color').array;
hf.updateHeights(
  (u, v) => 0.4 + 0.5 * Math.cos((u - 0.5) * Math.PI) * Math.cos((v - 0.5) * Math.PI),
  (u, v, y, out) => out.setRGB(0.8, 0.3, 0.2)
);
assert.equal(hf.geometry.getAttribute('position').array, hfPosArr, 'Heightfield updateHeights must mutate position buffer in-place (zero GC)');
assert.equal(hf.geometry.getAttribute('normal').array, hfNormArr, 'Heightfield updateHeights must mutate normal buffer in-place (zero GC)');
assert.equal(hf.geometry.getAttribute('color').array, hfColArr, 'Heightfield updateHeights must mutate color buffer in-place (zero GC)');
assert.ok(Math.abs(hf.sampleHeight(0, 0) - 0.9) < 0.03, `Expected center sampleHeight ~0.9, got ${hf.sampleHeight(0, 0)}`);
assertValidSculpt(hf, 'heightfield', 'createHeightfieldSurface.afterUpdate');

const chasm = createFracturedChasm({ width: 4, depth: 1, segsX: 24, segsZ: 10, glowEmber: true });
assertValidSculpt(chasm, 'chasm', 'createFracturedChasm');
const chasmPosArr = chasm.chasmMesh.geometry.getAttribute('position').array;
chasm.setCarveProgress(0);
assert.equal(chasm.chasmMesh.geometry.getAttribute('position').array, chasmPosArr, 'Chasm setCarveProgress must mutate in-place (zero GC)');
assert.equal(chasm.emberMesh.visible, false, 'Ember seam should hide when chasm is uncarved (u=0)');
let maxAbsYAt0 = 0;
for (let i = 1; i < chasmPosArr.length; i += 3) maxAbsYAt0 = Math.max(maxAbsYAt0, Math.abs(chasmPosArr[i]));
assert.equal(maxAbsYAt0, 0, 'Uncarved chasm (u=0) must flatten Y to 0');
chasm.setCarveProgress(0.85);
assert.equal(chasm.chasmMesh.geometry.getAttribute('position').array, chasmPosArr, 'Chasm re-carve must remain zero-GC');
assert.equal(chasm.emberMesh.visible, true);
assertValidSculpt(chasm, 'chasm', 'createFracturedChasm.carved');

const paramSurf = createParametricSurface(
  12,
  10,
  (u, v, out) => out.set((u - 0.5) * 2, Math.sin(u * Math.PI) * 0.4, (v - 0.5) * 2),
  { colorFn: (u, v, pos, out) => out.setRGB(u, v, 0.5) }
);
assertValidSculpt(paramSurf, 'parametric', 'createParametricSurface');
const paramPosArr = paramSurf.geometry.getAttribute('position').array;
paramSurf.updateSurface((u, v, out) => out.set((u - 0.5) * 2, Math.cos(v * Math.PI) * 0.3, (v - 0.5) * 2));
assert.equal(paramSurf.geometry.getAttribute('position').array, paramPosArr, 'Parametric updateSurface must be zero-GC');
assertValidSculpt(paramSurf, 'parametric', 'createParametricSurface.updated');

const singleStrip = createDeformableStrip({ length: 2.0, width: 0.25, thickness: 0.05, curvature: 0 });
assertValidSculpt(singleStrip, 'strip', 'createDeformableStrip(single)');
const stripPosArr = singleStrip.geometry.getAttribute('position').array;
const tipBent = singleStrip.setCurvature(0.5);
assert.equal(singleStrip.geometry.getAttribute('position').array, stripPosArr, 'Strip setCurvature must mutate in-place (zero GC)');
assert.ok(tipBent.tipPos.every(Number.isFinite) && tipBent.tipPos[1] > 0.3 && Math.abs(tipBent.tipAngle - 1.0) < 1e-5);
assertValidSculpt(singleStrip, 'strip', 'createDeformableStrip(single).bent');

const biStrip = createDeformableStrip({ length: 2.0, bimetallic: true, curvature: 0 });
assertValidSculpt(biStrip, 'strip', 'createDeformableStrip(bimetallic)');
const biTopArr = biStrip.topMesh.geometry.getAttribute('position').array;
const biBotArr = biStrip.bottomMesh.geometry.getAttribute('position').array;
const biTip = biStrip.setCurvature(-0.4);
assert.equal(biStrip.topMesh.geometry.getAttribute('position').array, biTopArr, 'Bimetallic top layer must update in-place');
assert.equal(biStrip.bottomMesh.geometry.getAttribute('position').array, biBotArr, 'Bimetallic bottom layer must update in-place');
assert.ok(biTip.tipPos[1] < -0.2, 'Negative curvature must deflect tip downward');

// 15e. Family 4 — True 3D Helical Coils, Variable-Radius Conduits & Pleated Bellows
const coil = createHelicalCoil({ turns: 5, leads: 0.12 });
assertValidSculpt(coil, 'helix', 'createHelicalCoil');
coil.setGlow(0.85, 'ember');
coil.setCompression(0.75);
assert.ok(Math.abs(coil.scale.y - 0.75) < 1e-6);

const conduit = createTaperedConduit(
  [[0, 0, 0], [0.8, 0.5, 0.2], [1.6, 0.2, -0.3]],
  (t) => 0.04 + 0.06 * Math.sin(t * Math.PI),
  { colorFn: (t, out) => out.setRGB(0.1 + 0.7 * t, 0.6, 0.5) }
);
assertValidSculpt(conduit, 'conduit', 'createTaperedConduit');

const bellows = createPleatedBellows({ pleats: 5, height: 0.7 });
assertValidSculpt(bellows, 'bellows', 'createPleatedBellows');
const bellowsPosArr = bellows.geometry.getAttribute('position').array;
const extH = bellows.setExtension(1.4);
assert.equal(bellows.geometry.getAttribute('position').array, bellowsPosArr, 'Bellows setExtension must mutate in-place (zero GC)');
assert.ok(extH > 0.85, `Extended bellows height must grow cleanly, got ${extH}`);
assertValidSculpt(bellows, 'bellows', 'createPleatedBellows.extended');

console.log('[OK] Cross-domain non-cuboid 3D sculpting kit (kit/geo-sculpt.js: all 5 families, 10 PBR presets & zero-GC updates) verified');

// ============================================================================
// 16. Verify Simulify v3.0 Visual Presentation, Multi-Layout, Lighting, Cutaway,
//     Field-Viz, Choreography, ClearType Callouts, Extended Maths & Charts
// ============================================================================

// 16a. Layout Archetypes, 6 Themes, WipeCompare, ViewCube, ScaleBar
assert.deepEqual(LAYOUT_ARCHETYPES, ['fullbleed-hud', 'split-bench', 'ab-compare']);
assert.equal(THEME_PRESETS.length, 6);
assert.ok(ICONS.cutaway.includes('<svg') && ICONS.explode.includes('<svg'));

withMockDocument(() => {
  const shellEl = createMockElement('div');
  assert.equal(toggleZenMode(shellEl), true);
  assert.equal(shellEl.dataset.zen, 'true');
  assert.equal(toggleZenMode(shellEl), false);
  assert.equal(shellEl.dataset.zen, undefined);

  // WipeCompareController clamping + CSS property
  const wipeHost = createMockElement('div');
  wipeHost.style.setProperty = (k, v) => { wipeHost.style[k] = v; };
  const wipe = new WipeCompareController(wipeHost, { initial: 0.5 });
  assert.equal(wipe.setFraction(0.75), 0.75);
  assert.equal(wipeHost.style['--wipe'], '75%');
  assert.equal(wipe.setFraction(0.01), 0.08, 'Wipe must clamp to min');
  assert.equal(wipe.setFraction(0.99), 0.92, 'Wipe must clamp to max');
  wipe.dispose();
});

// 16b. Stage-3D aligned key/shadow light, rim light, 6 studio themes, GLASS_LAYER, cutaway cap, camera sync
const { STUDIO_THEMES, GLASS_LAYER } = await import('../kit/stage-3d.js');
assert.equal(GLASS_LAYER, 3);
for (const th of THEME_PRESETS) {
  assert.ok(STUDIO_THEMES[th], `STUDIO_THEMES must define "${th}"`);
  assert.ok(STUDIO_THEMES[th].rimColor !== undefined, `STUDIO_THEMES.${th} must define rimColor`);
}

assert.throws(() => new IsometricStage(mockStageCanvas, { backend: 'legacy-webgl' }),
  /requires mapping "three" to three\.module\.js/);
const stageA = new IsometricStage(mockStageCanvas, { backend: 'webgl2', htmlInCanvas: false, autoLoop: false, theme: 'blueprint' });
const stageB = new IsometricStage(mockStageCanvas, { backend: 'webgl2', htmlInCanvas: false, autoLoop: false, theme: 'obsidian-gallery' });
assert.equal(stageA._keyLight, stageA._shadowLight, 'Key light and shadow-casting light must be aligned (same light)');
assert.equal(stageA._keyLight.castShadow, true, 'Key light must cast shadows');
assert.ok(stageA._rimLight && stageA._rimLight.isDirectionalLight, 'Stage must include dedicated rim light');
assert.equal(stageA.setGridStyle('polar'), 'polar');
assert.equal(stageA.setGridStyle('plinth'), 'plinth');
const cShadow = stageA.addContactShadow({ radiusX: 2, radiusZ: 2 });
const accLight = stageA.createAccentLight({ color: 0xffaa44, intensity: 1.8 });
const cutSolid = createLathedSolid([[0.01, 0], [1.0, 0.4], [0.8, 1.8], [0.01, 2.0]], { preset: 'brass' });
stageA.scene.add(cutSolid);
const cutPlane = stageA.createCutawayPlane([0, -1, 0], 1.2);
const cutCap = stageA.createCutawayCap(cutSolid, cutPlane, { capSize: 8 });
cutCap.setConstant(0.8);
assert.equal(cutPlane.constant, 0.8);
assert.equal(stageA.getGeometryAudit().cuboidMeshes, 0, 'Internal cutaway cap & contact shadow must not pollute cuboid count');
stageA.syncCameraWith(stageB);
stageA.setCameraImmediate({ azimuthDeg: 62, elevationDeg: 35, zoom: 1.4 });
assert.ok(Math.abs(stageB.getCameraState().azimuthDeg - 62) < 0.2, 'syncCameraWith must mirror camera to peer stage');

withMockDocument(() => {
  const vcHost = createMockElement('div');
  const vc = mountViewCube(vcHost, stageA, { lang: 'zh' });
  assert.equal(vc.root.className, 'view-cube-dock');
  const sb = mountScaleBar(vcHost, stageA, { unitScale: 10, unitLabel: 'mm' });
  assert.ok(sb.sync().barPx >= 36);
  vc.unmount();
  sb.unmount();
});
cutCap.dispose();
cShadow.dispose();
accLight.dispose();
stageA.dispose();
assert.ok(!stageB._syncedPeers.has(stageA), 'Disposing one camera must unlink it from the live peer');
stageB.dispose();

{
  const canvas = createMockElement('canvas');
  let width = 390;
  canvas.getBoundingClientRect = () => ({ width, height: 600 });
  canvas.getContext = () => null;
  const stage = new IsometricStage(canvas, {
    backend: 'webgl2', cameraType: 'perspective', fov: 36, distance: 10, htmlInCanvas: false, autoLoop: false,
  });
  await stage.ready;
  assert.equal(stage.backendKind, 'fallback', 'Failed renderer init must resolve to fallback without rejecting');
  stage.resize(true);
  withMockDocument(() => {
    const host = createMockElement('div');
    const bar = mountScaleBar(host, stage, { worldUnitsPerMeter: 2, niceSteps: [0.5] });
    const legacyBar = mountScaleBar(host, stage, { unitScale: 0.5, niceSteps: [0.5] });
    const expected = (fov) => Math.round(600 / (20 * Math.tan(fov * Math.PI / 360)));
    assert.equal(stage.camera.fov, 36 * 1.48);
    assert.equal(bar.sync().barPx, expected(stage.camera.fov));
    assert.equal(legacyBar.sync().barPx, bar.sync().barPx);
    width = 1000;
    stage.resize();
    assert.equal(stage.camera.fov, 36);
    assert.equal(bar.root.children[0].style.width, `${expected(36)}px`, 'Resize must update the mounted scale');
    legacyBar.unmount();
    bar.unmount();
  });
  const events = ['contextmenu', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'wheel'];
  for (const type of events) assert.equal(canvas.listenerCount(type), 1, type);
  let finishPaint;
  let frames = 0;
  stage.htmlSurfaces = {
    flushPaint: () => new Promise((resolve) => { finishPaint = resolve; }),
    dispose() {},
  };
  stage.renderer = { render: () => { frames += 1; }, dispose() {} };
  stage._rendererReady = true;
  stage._prepareSceneBeforeRender = () => {};
  const pendingFrame = stage.renderNowAsync();
  stage.dispose();
  finishPaint(true);
  assert.equal(await pendingFrame, false);
  assert.equal(await stage.renderNowAsync(), false);
  assert.equal(stage.renderNow(), false);
  assert.equal(frames, 0);
  for (const type of events) assert.equal(canvas.listenerCount(type), 0, type);
}

// 16c. Procedural PBR Micro-Textures, Fresnel X-Ray & GLASS_LAYER on glass vessels
const { createProceduralSurfaceMaps, createXRayMaterial } = GeoSculpt;
const brushedMap = createProceduralSurfaceMaps('brushed');
assert.equal(brushedMap, createProceduralSurfaceMaps('brushed'), 'Micro-textures must be cached');
const brassMat = createSculptMaterial('brass');
assert.ok(brassMat.bumpMap && brassMat.roughnessMap, 'Brass PBR preset must auto-wire procedural brushed micro-maps');
const flatBrass = createSculptMaterial('brass', { microTexture: false });
assert.equal(flatBrass.bumpMap, null, 'microTexture: false must opt out of micro-maps');
const xrayMat = createXRayMaterial({ color: 'teal', opacity: 0.22 });
assert.equal(xrayMat.isMeshPhysicalMaterial, true);
assert.equal(xrayMat.userData.recommendedLayer, GLASS_LAYER);
const glassFlask = createGlassVessel({ style: 'flask', fillLevel: 0.6 });
assert.equal(glassFlask.glassMesh.layers.isEnabled(GLASS_LAYER), true, 'Glass shell must default onto GLASS_LAYER');
brassMat.dispose();
flatBrass.dispose();
xrayMat.dispose();

// 16d. Dynamic Field, Flow, Particle & Engineering Annotation Primitives (`kit/field-viz.js`)
const FieldViz = await import('../kit/field-viz.js');
assert.ok(Object.keys(FieldViz.COLORMAPS).length >= 6);
const cmCol = FieldViz.sampleColormap('viridis', 0.5);
assert.ok(Number.isFinite(cmCol.r) && cmCol.g > 0.3);
assert.ok(FieldViz.colormapCssGradient('thermal').startsWith('linear-gradient('));

const flowCond = FieldViz.createFlowConduit([[0, 0, 0], [1, 0.5, 0], [2, 0, 0.5]]);
flowCond.setFlowPhase(0.35);
flowCond.setDrawProgress(0.5);
assert.ok(flowCond.geometry.drawRange.count > 0);

const vField = FieldViz.createVectorField(9, { colormap: 'coolwarm' });
const updatedVecs = vField.updateVectors([
  { origin: [0, 0, 0], vec: [1, 0, 0] },
  { origin: [1, 0, 0], vec: [0, 1, 0] },
]);
assert.equal(updatedVecs, 2);

const swarm = FieldViz.createDeterministicSwarm(16);
const visA = swarm.update(2.5, (i, t, out) => {
  out.x = Math.cos(t + i) * 1.5;
  out.y = 0.5;
  out.z = Math.sin(t + i) * 1.5;
  out.scale = 1;
});
assert.equal(visA, 16);

const trail = FieldViz.createMotionTrail(20, { strobeCount: 4 });
assert.equal(trail.updateTrail([[0, 0, 0], [0.5, 0.4, 0], [1, 0.6, 0.2], [1.5, 0.2, 0.5]]), 4);
assert.equal(trail.strobeMesh.count, 4);

const dimAnn = FieldViz.createDimensionMeasure([0, 0, 0], [3, 0, 0], { label: '3.0 m' });
dimAnn.updateMeasure([0, 0, 0], [4, 0, 0], '4.0 m');
const fArrow = FieldViz.createForceArrow([0, 0, 0], [0, 2, 0], { label: 'F=2N' });
assert.ok(Math.abs(fArrow.updateArrow([0, 0, 0], [3, 4, 0]) - 5) < 1e-5);
const angArc = FieldViz.createAngleArc([0, 0, 0], [1, 0, 0], [0, 1, 0]);
assert.ok(Math.abs(angArc.updateAngle([0, 0, 0], [1, 0, 0], [0, 1, 0]) - 90) < 1e-4);

const contour = FieldViz.createContourField({ width: 4, depth: 4, segsX: 12, segsZ: 12, textureSize: 64 });
assert.ok(contour.contourTexture && contour.topMaterial.map === contour.contourTexture);
assert.ok(Array.isArray(contour.material) && contour.material.length === 2, 'Contour field with skirt must separate top map & matte skirt material');
contour.updateField((u, v) => Math.cos(u * Math.PI) * 0.5 + 0.5);

// 16e. Choreography: matte/wireframe focus, explodeGroup, clipSweep, draw & blueprint transitions
const matteMat = new THREE.MeshStandardMaterial({ color: 0x149694, roughness: 0.4 });
const matteActor = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), matteMat);
const heroActor = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: 0xc96d24 }));
const drawTarget = { mesh: flowCond, drawn: 0, setDrawProgress(u) { this.drawn = u; } };
const sweepPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 3);

const c22 = new ActorChoreographer({ defaultFocusMode: 'matte' });
c22
  .register('bgPart', matteActor, { kind: '3d', initiallyVisible: true })
  .register('heroPart', heroActor, { kind: '3d', initiallyVisible: true })
  .register('flow', flowCond, { kind: '3d' })
  .enter('flow', 2, 2, 'draw')
  .focus(['heroPart'], 1, 0.5, { mode: 'matte', holdUntil: 5, releaseDur: 0.5 })
  .explodeGroup('asm', [{ object: heroActor, restPos: [0, 0, 0], offset: [0, 2, 0] }], 3, 1)
  .clipSweep('cut', sweepPlane, 3, 2, { from: 3, to: 0 });

c22.evaluate(2.0, { apply: true });
assert.equal(matteMat.transparent, false, 'Matte focus mode must NEVER enable alpha transparency sorting artifacts');
assert.equal(matteMat.depthWrite, true, 'Matte focus mode must preserve depthWrite');
assert.ok(matteMat.color.getHex() !== 0x149694, 'Matte focus must desaturate/mute dimmed actor color');

c22.evaluate(4.0, { apply: true });
assert.ok(Math.abs(heroActor.position.y - 2.0) < 1e-5, 'explodeGroup must offset part at t=4');
assert.ok(Math.abs(sweepPlane.constant - 1.5) < 1e-4, 'clipSweep must interpolate plane.constant to midpoint');

c22.evaluate(6.0, { apply: true });
assert.equal(matteMat.color.getHex(), 0x149694, 'Releasing matte focus must losslessly restore original color');

// 16f. ClearType-safe CalloutLayer (zero steady-state translate3d) + editorial style + quietMode
withMockDocument(() => {
  const mockStage = { size: { width: 1280, height: 800 }, projectToScreen: ([x, y]) => ({ x, y, visible: true }) };
  const svgEl = createMockElement('svg', 'http://www.w3.org/2000/svg');
  const tagsEl = createMockElement('div');
  const clBus = new LinkBus();
  const cl = new CalloutLayer(mockStage, svgEl, tagsEl, { style: 'editorial', quietMode: true, linkBus: clBus });
  cl.setItems([
    { id: 'pin', label: 'Pinned', pinned: true, getWorldPos: () => [200, 200, 0] },
    { id: 'quiet', label: 'HoverMe', linkId: 'q1', getWorldPos: () => [420, 260, 0] },
  ]);
  assert.equal(cl.getExportSnapshot().items.length, 1, 'quietMode must hide unpinned non-hovered callouts');
  const pinTag = cl.items.get('pin').tag;
  assert.equal(pinTag.style.transform, '', 'CalloutLayer must NOT use steady-state translate3d (ClearType)');
  assert.ok(pinTag.style.left.endsWith('px') && pinTag.style.top.endsWith('px'));
  assert.equal(pinTag.dataset.style, 'editorial');
  clBus.hover('q1', 'test');
  assert.equal(cl.getExportSnapshot().items.length, 2, 'Hovering LinkBus id must reveal quiet callout');
});

// 16g. Extended LiveMathsPanel AST: sqrt, matrix, cases, accent, fence, align
withMockDocument(() => {
  const host = createMockElement('div');
  const lm = new LiveMathsPanel(host, { title: 'Extended Maths' });
  lm.update({
    equations: [
      {
        label: 'Vector & Matrix',
        tokens: [
          mathAccent(mathVar('F'), 'vec'),
          '=',
          mathMatrix([[mathVar('a'), mathVar('b')], [mathVar('c'), mathVar('d')]], { fence: 'brackets' }),
          mathFence(mathFrac(mathSqrt(mathVar('x')), mathNum(2))),
        ],
      },
      {
        label: 'Piecewise & Align',
        tokens: [
          mathCases([[mathNum(1), 'x ≥ 0'], [mathNum(0), 'x < 0']]),
          mathAlign([[mathVar('E'), '=', mathGroup([mathVar('m'), mathSup(mathVar('c'), 2)])]]),
        ],
      },
    ],
  });
  assert.ok(host.querySelectorAll((n) => n.classList?.contains('lm-sqrt')).length === 1);
  assert.ok(host.querySelectorAll((n) => n.classList?.contains('lm-matrix')).length === 1);
  assert.ok(host.querySelectorAll((n) => n.classList?.contains('lm-cases')).length === 1);
  assert.ok(host.querySelectorAll((n) => n.classList?.contains('lm-accent')).length === 1);
  assert.ok(host.querySelectorAll((n) => n.classList?.contains('lm-fence')).length === 1);
  assert.ok(host.querySelectorAll((n) => n.classList?.contains('lm-align')).length === 1);
});

// 16h. Extended ChartCard modes (distribution, heatmap, timing, spark-kpi, generic hysteresis)
withMockDocument(() => {
  const makeCardHost = () => {
    const titleEl = createMockElement('span');
    const badgeEl = createMockElement('span');
    const foldBtn = createMockElement('button');
    const bodyEl = createMockElement('div');
    const root = createMockElement('section');
    root.querySelector = (sel) => ({ '.chart-title': titleEl, '.chart-badge': badgeEl, '.chart-fold': foldBtn, '.chart-body': bodyEl }[sel] || null);
    return { root, bodyEl };
  };
  const { root, bodyEl } = makeCardHost();
  const chart = new ChartCard(root, { title: 'Multi-Mode' });
  chart.updateHysteresis({ onLabel: 'HIGH', offLabel: 'LOW', unit: 'V', ariaLabel: 'Schmitt Trigger' });
  assert.equal(bodyEl.children[0].getAttribute('aria-label'), 'Schmitt Trigger');
  chart.updateDistribution({
    xMin: -3, xMax: 3,
    bins: [0.1, 0.3, 0.4, 0.2],
    curve: [{ x: -3, y: 0.01 }, { x: 0, y: 0.4 }, { x: 3, y: 0.01 }],
    shadeRange: [-1, 1],
    markers: [{ x: 0, label: 'μ=0' }],
  });
  assert.equal(bodyEl.children[0].getAttribute('class'), 'dist-svg');
  chart.updateHeatmap({ matrix: [[0.1, 0.9], [0.6, 0.2]], rowLabels: ['S0', 'S1'], colLabels: ['A', 'B'] });
  assert.equal(bodyEl.children[0].getAttribute('class'), 'heatmap-svg');
  chart.updateTiming({
    channels: [{ name: 'CLK', segments: [{ t0: 0, t1: 2, level: 0 }, { t0: 2, t1: 4, level: 1 }] }],
    tMin: 0, tMax: 4, cursorT: 2.5,
  });
  assert.equal(bodyEl.children[0].getAttribute('class'), 'timing-svg');
  chart.updateSparkKpi({ value: '98.4', unit: '%', delta: '+2.1%', points: [82, 88, 95, 98.4] });
  assert.equal(chart.mode, 'spark-kpi');

});

console.log('[OK] Simulify v3.0 visual presentation verified (3 layouts, 6 themes, aligned lights/rim/cutaway-cap, micro-PBR/X-Ray, field-viz, matte focus, ClearType callouts, extended maths/charts)');

// ============================================================================
// 17. Claude Editorial Serif Typography & Full Offline KaTeX Formula Rendering
// ============================================================================
{
  // 17a. Verify offline KaTeX runtime & CSS + every font URL resolves on disk
  const katexJsPath = path.join(ROOT, 'kit', 'katex', 'katex.mjs');
  const katexCssPath = path.join(ROOT, 'kit', 'katex', 'katex.min.css');
  const fontsCssPath = path.join(ROOT, 'kit', 'fonts', 'fonts.css');
  const primerCssPath = path.join(ROOT, 'kit', 'primer-tokens.css');
  const studioCssPath = path.join(ROOT, 'kit', 'theme-studio.css');

  assert.ok(fs.existsSync(katexJsPath), 'kit/katex/katex.mjs must exist offline');
  assert.ok(fs.existsSync(katexCssPath), 'kit/katex/katex.min.css must exist offline');
  assert.ok(fs.existsSync(path.join(ROOT, 'kit', 'fonts', 'NotoSerifSC-Regular.woff2')), 'NotoSerifSC-Regular.woff2 must exist offline');

  for (const cssFile of [fontsCssPath, katexCssPath]) {
    const cssText = fs.readFileSync(cssFile, 'utf8');
    const urlMatches = [...cssText.matchAll(/url\((['"]?)([^'")]+)\1\)/g)];
    assert.ok(urlMatches.length > 0, `${path.basename(cssFile)} must declare local font URLs`);
    for (const m of urlMatches) {
      const target = path.resolve(path.dirname(cssFile), m[2]);
      assert.ok(fs.existsSync(target), `Missing local font asset referenced in ${path.basename(cssFile)}: ${m[2]}`);
    }
  }

  // 17b. Claude serif editorial typography tokens & still exactly 6 skins (no extra skins)
  const primerCss = fs.readFileSync(primerCssPath, 'utf8');
  const studioCss = fs.readFileSync(studioCssPath, 'utf8');
  assert.doesNotMatch(primerCss, /@import[^;]+katex/, 'KaTeX is opt-in per page');
  for (const example of ['open-differential', 'momentum-valley']) {
    const html = fs.readFileSync(path.join(ROOT, 'examples', example, 'index.html'), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="[^"]+\/katex\/katex\.min\.css">/);
  }
  assert.ok(primerCss.includes('--font-prose:'), 'primer-tokens.css must define --font-prose Claude serif stack');
  assert.ok(primerCss.includes('--font-serif:'), 'primer-tokens.css must define --font-serif stack');
  assert.ok(!primerCss.includes('backdrop-filter'), 'primer-tokens.css must maintain zero backdrop-filter ClearType rule');
  assert.equal(THEME_PRESETS.length, 6, 'Theme count must remain strictly 6 curated skins');
  const studioThemeNames = new Set([...studioCss.matchAll(/:root\[data-theme="([^"]+)"\]/g)].map((m) => m[1]));
  assert.equal(studioThemeNames.size, 5, 'theme-studio.css must declare exactly the 5 non-default skins (6 total with paper-ink)');

  assert.ok(FONT_STACKS.prose.includes('Newsreader') && FONT_STACKS.prose.includes('Simulify Serif SC'));
  assert.ok(FONT_STACKS.serif.includes('Simulify Serif SC'));
  assert.ok(canvasFont('prose', 16, 400).includes('Simulify Serif SC'));

  // 17c. Offline KaTeX renderTex + substituteTexVars
  const rawHtml = renderTex(String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`, null, { displayMode: true });
  assert.ok(rawHtml.includes('katex-display') && rawHtml.includes('katex-html'), 'renderTex must output real KaTeX HTML');

  const subTex = substituteTexVars(
    String.raw`V(s) \leftarrow V(s) + {{alpha}} \big(\var{reward} + \gamma V(s')\big)`,
    {
      alpha: { value: 0.25, tone: 'teal', emph: true, linkId: 'param-alpha' },
      reward: 1.5,
    },
    { linkMap: { reward: 'term-r' } }
  );
  assert.ok(subTex.includes('\\htmlClass{lm-tex-val lm-tone-teal is-emph}'));
  assert.ok(subTex.includes('\\htmlData{link-id=param-alpha}{0.25}'));
  assert.ok(subTex.includes('\\htmlData{link-id=term-r}{1.5}'));

  const subHtml = renderTex(subTex);
  assert.ok(subHtml.includes('data-link-id="param-alpha"'), 'KaTeX trust filter must allow \\htmlData{link-id=...}');
  assert.ok(subHtml.includes('lm-tone-teal'), 'KaTeX trust filter must allow \\htmlClass');

  // 17d. parseMathSegments & renderMathInElement (delimiters, escapes, currency guard, code skip)
  const parsed = parseMathSegments(String.raw`Price \$100 vs $5 and $10, inline $E = mc^2$, paren \(\alpha+\beta\), display $$a^2+b^2=c^2$$ and \[\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}\].`);
  assert.equal(parsed.hasMath, true);
  assert.equal(parsed.hasEscapedDollar, true);
  const mathSegs = parsed.segments.filter((s) => s.type === 'math');
  assert.equal(mathSegs.length, 4, 'Must parse exactly 4 math segments without currency false positives');
  assert.deepEqual(
    mathSegs.map((s) => [s.displayMode, s.value]),
    [
      [false, 'E = mc^2'],
      [false, '\\alpha+\\beta'],
      [true, 'a^2+b^2=c^2'],
      [true, '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}'],
    ]
  );

  const currencyOnly = parseMathSegments('Budget is $100 to $250 for 2 items ($5.50 each).');
  assert.equal(currencyOnly.hasMath, false, 'Plain currency amounts must NEVER trigger math rendering');

  withMockDocument(() => {
    // Minimal text-node helper compatible with renderMathInElement
    const makeTextNode = (val, parent) => ({
      nodeType: 3,
      nodeValue: val,
      textContent: val,
      parentNode: parent,
      replaceWith(...nodes) {
        const idx = parent.childNodes.indexOf(this);
        if (idx >= 0) {
          const flat = [];
          for (const n of nodes) {
            if (n && n.nodeType === 11 && Array.isArray(n.childNodes)) flat.push(...n.childNodes);
            else flat.push(n);
          }
          parent.childNodes.splice(idx, 1, ...flat);
          parent.children = parent.childNodes.filter((c) => c && c.nodeType !== 3);
        }
      },
    });
    const prevCreateText = document.createTextNode;
    const prevCreateFrag = document.createDocumentFragment;
    document.createTextNode = (v) => makeTextNode(v, null);
    document.createDocumentFragment = () => {
      const frag = {
        nodeType: 11,
        childNodes: [],
        append(...items) {
          for (const it of items) this.childNodes.push(it);
        },
      };
      return frag;
    };
    try {
      const article = createMockElement('article');
      const p = createMockElement('p');
      p.childNodes = [makeTextNode('Energy $E = mc^2$ and cost $100.', p)];
      const code = createMockElement('code');
      code.childNodes = [makeTextNode('$not_math$', code)];
      article.childNodes = [p, code];
      article.children = [p, code];

      const renderedCount = renderMathInElement(article);
      assert.equal(renderedCount, 1, 'renderMathInElement must render $E=mc^2$ and skip <code> and $100');
      assert.equal(code.childNodes[0].nodeValue, '$not_math$', '<code> elements must remain untouched');
      const mathEl = p.childNodes.find((n) => n.className === 'lm-inline-math');
      assert.ok(mathEl && mathEl.innerHTML.includes('katex'), 'Rendered inline holder must contain KaTeX markup');
    } finally {
      document.createTextNode = prevCreateText;
      document.createDocumentFragment = prevCreateFrag;
    }

    // 17e. LiveMathsPanel native tex + vars + LinkBus alongside legacy AST
    const host = createMockElement('div');
    const bus = new LinkBus();
    const panel = new LiveMathsPanel(host, { title: 'Hybrid KaTeX', linkBus: bus });
    panel.update({
      equations: [
        {
          label: 'KaTeX TD Target',
          tex: String.raw`\delta_t = {{r}} + \gamma V(S_{t+1}) - V(S_t)`,
          displayMode: true,
          vars: { r: { value: '+1.0', tone: 'teal', linkId: 'reward-term' } },
        },
        {
          label: 'Legacy AST Equation',
          tokens: [mathVar('F'), '=', mathVar('m'), mathVar('a')],
        },
      ],
    });
    const katexLines = host.querySelectorAll((n) => n.classList?.contains('is-katex'));
    assert.equal(katexLines.length, 1, 'LiveMathsPanel must render native tex equation with .is-katex');
    assert.ok(katexLines[0].innerHTML.includes('katex-display') && katexLines[0].innerHTML.includes('data-link-id="reward-term"'));
  });

  console.log('[OK] Claude editorial serif typography & full offline KaTeX formula rendering verified (20 KaTeX woff2 + NotoSerifSC Regular/Display + renderTex/renderMathInElement/LiveMathsPanel)');
}

// One solve produces the exact same immutable value for every subscriber.
{
  const clock = new SpacetimeClock({ duration: 4, manualMode: true });
  const input = { speed: 2, nested: { bias: 0 } };
  const calls = [];
  const model = createSimModel({
    clock, params: input,
    solve: (p, t) => {
      calls.push([p.speed, t]);
      return { coordinates: [p.speed * t + p.nested.bias] };
    },
    falsifyCases: [
      {
        name: 'double speed', t: [1, 2],
        mutateParams: ({ speed }) => ({ speed: speed * 2 }),
        check: (base, mutant, { baseParams, mutantParams }) => ({
          passed: mutant.coordinates[0] === 2 * base.coordinates[0]
            && mutantParams.speed === 2 * baseParams.speed,
          baseMetric: base.coordinates[0], mutantMetric: mutant.coordinates[0],
        }),
      },
      {
        name: 'run in reverse order',
        run: (evaluate) => evaluate(1, { speed: 4 }).coordinates[0] > evaluate(1).coordinates[0],
      },
      { name: 'empty runner', run: () => true },
      { name: 'irrelevant mutation', mutateParams: () => ({ unused: true }), check: () => true },
      { name: 'no mutation', mutateParams: () => ({}), check: () => true },
      { name: 'failed check', t: 1, mutateParams: () => ({ speed: 4 }), check: () => false },
    ],
  });
  const stageFrames = [];
  const chartFrames = [];
  model.subscribe((snapshot) => stageFrames.push(snapshot));
  model.subscribe((snapshot) => chartFrames.push(snapshot));
  input.nested.bias = 10;
  const hooks = exposeTestHooks({ clock, model, syncAll: () => {} });
  hooks.seek(3);
  assert.deepEqual(calls, [[2, 0], [2, 3]]);
  assert.equal(chartFrames.at(-1), stageFrames.at(-1));
  assert.equal(model.getSnapshot(), stageFrames.at(-1));
  assert.ok(Object.isFrozen(model.getSnapshot().coordinates));
  assert.ok(Object.isFrozen(model.getParams().nested));
  assert.deepEqual(model.evaluate(2, { speed: 5 }).coordinates, [10]);
  assert.equal(model.t, 3);
  assert.deepEqual(model.getSnapshot().coordinates, [6]);
  assert.equal(model.getParams().speed, 2);
  assert.deepEqual(hooks.setParams({ speed: 3 }).coordinates, [9]);
  assert.deepEqual(model.resetParams().coordinates, [6]);
  const beforeFalsify = calls.length;
  const audit = hooks.falsify();
  assert.deepEqual(calls.slice(beforeFalsify, beforeFalsify + 4), [[2, 1], [4, 1], [2, 2], [4, 2]]);
  assert.equal(audit.version, 3);
  assert.equal(audit.passed, false);
  assert.equal(audit.total, 6);
  assert.equal(audit.passedCount, 2);
  assert.deepEqual(audit.assertions[0], {
    name: 'double speed', passed: true, detail: '', baseMetric: 4, mutantMetric: 8, comparisons: 2,
  });
  assert.ok(audit.assertions.slice(2).every((item) => !item.passed && item.detail));
  assert.equal(model.t, 3);
  model.dispose();
  clock.seek(1);
  assert.equal(model.t, 3);
  clock.destroy();
  delete globalThis.__simulify;
  delete globalThis.__ready;
}
assert.ok(Math.abs(rk4Step(1, 0, 0.1, (y) => y) - Math.exp(0.1)) < 1e-7);
const [position, velocity] = integrateRK4([1, 0], 0, Math.PI / 2, 100, ([x, v]) => [v, -x]);
assert.ok(Math.abs(position) < 1e-8 && Math.abs(velocity + 1) < 1e-8);
assert.ok(Math.abs(bisectRoot((x) => x * x - 2, 0, 2) - Math.SQRT2) < 1e-8);
assert.throws(() => bisectRoot((x) => x * x + 1, 0, 2), RangeError);
assert.equal(formatUnit(1.256, 'm'), '1.26 m');
{
  const m = createSimModel({ params: { value: 0 }, solve: (p) => p.value });
  const previousError = console.error;
  const errors = [];
  const snapshots = [];
  console.error = (...args) => errors.push(args);
  try {
    m.subscribe((value) => {
      if (value === 1) m.setParams({ value: 2 });
      if (value) throw new Error('subscriber failure');
    });
    m.subscribe((value) => snapshots.push(value));
    m.setParams({ value: 1 });
    m.setParams({ value: 3 });
  } finally {
    console.error = previousError;
  }
  assert.deepEqual(snapshots, [0, 1, 2, 3]);
  assert.equal(errors.length, 3);
}
console.log('[OK] Single-snapshot model, RK4, bisection, and boundary failure cases verified');

// ============================================================================
// 18. v3.1 Root-Cause Fixes: Dual-Tier Outline Hot-Swap, Shell Cutaway/X-Ray,
//     Staggered Explode, Narrow-Screen Callout Bar, applyFalsifyCase,
//     Visibility/Offscreen Pause & Stage Fallback Card
// ============================================================================
{
  // 18a. Dual-tier outline resolution & live Primer <-> Studio setTheme() hot-swap
  const stageStudio = new IsometricStage(mockStageCanvas, {
    backend: 'webgl2',
    htmlInCanvas: false,
    autoLoop: false,
    theme: 'obsidian-gallery',
  });
  assert.equal(stageStudio.outlinePreset, 'none', 'Studio theme with omitted outline must default to "none" (4x MSAA)');
  assert.equal(stageStudio.outlineEnabled, false);
  stageStudio.setTheme('paper-ink');
  assert.equal(stageStudio.outlinePreset, 'primer', 'Switching to Primer theme with auto outline must engage "primer"');
  assert.equal(stageStudio.outlineEnabled, true);
  stageStudio.setTheme('dark-studio');
  assert.equal(stageStudio.outlinePreset, 'none', 'Switching back to Studio theme must turn outline off cleanly');
  assert.equal(stageStudio.outlineEnabled, false);
  stageStudio.dispose();

  const stageLocked = new IsometricStage(mockStageCanvas, {
    backend: 'webgl2',
    htmlInCanvas: false,
    autoLoop: false,
    theme: 'paper-ink',
    outline: 'none',
  });
  assert.equal(stageLocked.outlinePreset, 'none');
  stageLocked.setTheme('monochrome-print');
  assert.equal(stageLocked.outlinePreset, 'none', 'Explicit outline:"none" must stay locked across theme switches');
  stageLocked.dispose();

  // 18b. Analytical hatch cutaway cap + onlyShells filter + setShellXRay lossless restore
  const stageShell = new IsometricStage(mockStageCanvas, {
    backend: 'webgl2',
    htmlInCanvas: false,
    autoLoop: false,
    theme: 'paper-ink',
  });
  const asm = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x363b44, roughness: 0.5, metalness: 0.72 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xd2a34e, roughness: 0.25, metalness: 0.9 });
  const shellMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 24), shellMat);
  shellMesh.userData.shell = true;
  const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), coreMat);
  asm.add(shellMesh, coreMesh);
  stageShell.scene.add(asm);

  const sPlane = stageShell.createCutawayPlane([0, -1, 0], 0.5);
  const sCap = stageShell.createCutawayCap(asm, sPlane, { onlyShells: true, hatchMode: 'analytical', capSize: 6 });
  assert.equal(sCap.onlyShells, true);
  assert.equal(sCap.hatchMode, 'analytical');
  assert.equal(sCap.capMesh.material.userData.simulifyHatchMode, 'analytical');
  assert.ok(Array.isArray(shellMat.clippingPlanes) && shellMat.clippingPlanes.includes(sPlane), 'Shell material must receive clip plane');
  assert.ok(!coreMat.clippingPlanes || !coreMat.clippingPlanes.includes(sPlane), 'Core mesh must NOT be clipped when onlyShells:true');
  sCap.dispose();
  assert.equal(shellMat.clippingPlanes.length, 0, 'Disposing cutaway cap must detach clip planes');

  const xrayCount = stageShell.setShellXRay(asm, true, { opacity: 0.25 });
  assert.equal(xrayCount, 1, 'setShellXRay must affect only shell:true meshes');
  assert.notEqual(shellMesh.material, shellMat);
  assert.equal(shellMesh.layers.isEnabled(GLASS_LAYER), true, 'X-Ray shell must move to GLASS_LAYER');
  assert.equal(coreMesh.material, coreMat, 'Core material must remain untouched');
  stageShell.setShellXRay(asm, false);
  assert.equal(shellMesh.material, shellMat, 'Disabling setShellXRay must restore original shell material');
  assert.equal(shellMesh.layers.isEnabled(0), true, 'Disabling setShellXRay must restore SOLID_LAYER');
  shellMat.dispose();
  coreMat.dispose();
  stageShell.dispose();

  // 18c. Declarative staggered exploded-view (collectExplodeParts + applyExplodeFactor + explodeGroup)
  const expRoot = new THREE.Group();
  const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 16), new THREE.MeshStandardMaterial());
  basePlate.position.set(0, 0, 0);
  const midGear = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16), new THREE.MeshStandardMaterial());
  midGear.position.set(0, 0.2, 0);
  midGear.userData = { explodeStage: 1, explodeOffset: [0, 1.0, 0] };
  const topBridge = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 16), new THREE.MeshStandardMaterial());
  topBridge.position.set(0, 0.5, 0);
  topBridge.userData = { stage: 2, explode: [0, 2.0, 0] };
  expRoot.add(basePlate, midGear, topBridge);

  const collected = collectExplodeParts(expRoot);
  assert.equal(collected.length, 2);
  assert.equal(collected[0].object, midGear);
  assert.equal(collected[1].object, topBridge);

  applyExplodeFactor(expRoot, 0.35, { stageStagger: 0.25 });
  const midProgress = (midGear.position.y - 0.2) / 1.0;
  const topProgress = (topBridge.position.y - 0.5) / 2.0;
  assert.ok(midProgress > topProgress, 'Lower stage must begin separating ahead of higher stage');
  applyExplodeFactor(expRoot, 1.0, { stageStagger: 0.25 });
  assert.ok(Math.abs(midGear.position.y - 1.2) < 1e-5 && Math.abs(topBridge.position.y - 2.5) < 1e-5);
  applyExplodeFactor(expRoot, 0.0, { stageStagger: 0.25 });
  assert.ok(Math.abs(midGear.position.y - 0.2) < 1e-5 && Math.abs(topBridge.position.y - 0.5) < 1e-5, 'Rewinding to 0 must restore exact restPos without drift');

  const choreoExp = new ActorChoreographer();
  choreoExp.explodeGroup('watch', expRoot, 1.0, 2.0, { stageStagger: 0.25 });
  choreoExp.evaluate(3.0, { apply: true });
  assert.ok(Math.abs(topBridge.position.y - 2.5) < 1e-5, 'explodeGroup(root) must expand declarative parts');
  choreoExp.evaluate(0.0, { apply: true });
  assert.ok(Math.abs(topBridge.position.y - 0.5) < 1e-5);

  // 18d. CalloutLayer 390px narrow-screen compact bar + LinkBus selection + desktop restoration
  withMockDocument(() => {
    const stageSize = { width: 390, height: 420 };
    const mockStage = { size: stageSize, projectToScreen: ([x, y]) => ({ x, y, visible: true }) };
    const svgEl = createMockElement('svg', 'http://www.w3.org/2000/svg');
    const tagsEl = createMockElement('div');
    const bus = new LinkBus();
    const cl = new CalloutLayer(mockStage, svgEl, tagsEl, { linkBus: bus, compactBreakpoint: 480, compactMode: 'bar' });
    cl.setItems([
      { id: 'crown', linkId: 'crown', label: '冠齿轮', sublabel: '减速比 3.7:1', pinned: true, getWorldPos: () => [120, 140, 0] },
      { id: 'spider', linkId: 'spider', label: '行星齿轮', sublabel: '差速自转', getWorldPos: () => [240, 180, 0] },
    ]);
    assert.equal(cl.items.get('crown').tag.style.display, 'none', 'Floating pill must be hidden in 390px compact bar mode');
    assert.equal(cl.items.get('crown').polyline.style.display, 'none', 'SVG leader line must be hidden in 390px compact bar mode');
    const bar = tagsEl.children.find((el) => el.classList?.contains('callout-compact-bar'));
    assert.ok(bar && bar.style.display !== 'none', 'Compact chip bar must render at 390px width');
    const chips = bar.querySelectorAll((el) => el.classList?.contains('callout-compact-chip'));
    assert.equal(chips.length, 2);
    chips[1].dispatchEvent('click');
    assert.equal(bus.selectedId, 'spider', 'Clicking a compact chip must publish LinkBus selection');

    // Widening back to desktop restores floating callouts and hides compact bar
    stageSize.width = 1280;
    stageSize.height = 800;
    cl.update();
    assert.equal(bar.style.display, 'none', 'Compact bar must hide above compactBreakpoint');
    assert.equal(cl.items.get('crown').tag.style.display, '', 'Floating pill must restore on desktop width');
  });

  // 18e. createSimModel getFalsifyCases() & applyFalsifyCase() (params shorthand + mutateParams)
  {
    const m = createSimModel({
      params: { torque: 100, mu: 0.85 },
      solve: (p, t) => ({ force: p.torque * p.mu, angle: t * p.mu }),
      falsifyCases: [
        {
          name: 'ice-slip',
          label: '冰面打滑',
          description: '右轮摩擦降到 0.05',
          params: { mu: 0.05 },
          t: 1,
          check: (base, mutant) => ({
            passed: mutant.force < base.force * 0.2,
            baseMetric: base.force,
            mutantMetric: mutant.force,
          }),
        },
        {
          name: 'zero-torque',
          label: '断动力',
          mutateParams: () => ({ torque: 0 }),
          t: 1,
          check: (_base, mutant) => mutant.force === 0,
        },
      ],
    });
    const list = m.getFalsifyCases();
    assert.equal(list.length, 2);
    assert.deepEqual(list[0], { name: 'ice-slip', label: '冰面打滑', description: '右轮摩擦降到 0.05', hasParams: true });
    assert.equal(m.falsify().passed, true, 'params shorthand must work inside falsify()');
    const iceSnap = m.applyFalsifyCase('ice-slip');
    assert.equal(m.getParams().mu, 0.05);
    assert.ok(Math.abs(iceSnap.force - 5) < 1e-6);
    const zeroSnap = m.applyFalsifyCase('zero-torque');
    assert.equal(m.getParams().mu, 0.85, 'Applying a second failure case must mutate from clean baseline, not stack');
    assert.equal(zeroSnap.force, 0);
    m.resetParams();
    assert.equal(m.getParams().torque, 100);
    assert.throws(() => m.applyFalsifyCase('nonexistent'), RangeError);
  }

  // 18f. WebGL/WebGPU fallback overlay card + visibilitychange offscreen pause on Clock & AliveLoop
  withMockDocument((doc) => {
    const docListeners = new Map();
    doc.visibilityState = 'visible';
    doc.addEventListener = (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    };
    doc.removeEventListener = (type, fn) => docListeners.get(type)?.delete(fn);
    const fireVis = (state) => {
      doc.visibilityState = state;
      for (const fn of docListeners.get('visibilitychange') || []) fn();
    };

    // Fallback card mounts inside canvas parent when stage:fallback is not prevented
    const host = createMockElement('div');
    const fbCanvas = createMockElement('canvas');
    fbCanvas.parentElement = host;
    fbCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400 });
    fbCanvas.getContext = () => null;
    const fbStage = new IsometricStage(fbCanvas, { backend: 'webgl2', htmlInCanvas: false, autoLoop: false });
    fbStage._enterFallback(new Error('Mock WebGL context unavailable'));
    assert.equal(fbStage.backendKind, 'fallback');
    assert.equal(fbCanvas.dataset.stageFallback, 'true');
    const fbCard = host.children.find((c) => c.classList?.contains('stage-fallback-card'));
    assert.ok(fbCard, 'Fallback card must mount when stage:fallback is not prevented');
    fbStage.dispose();
    assert.equal(fbCard._removed, true, 'stage.dispose() must remove fallback card');

    // SpacetimeClock & AliveLoop pause rAF when hidden and resume cleanly when visible
    const prevRaf = globalThis.requestAnimationFrame;
    const prevCaf = globalThis.cancelAnimationFrame;
    let rafSeq = 0;
    const activeRafs = new Set();
    globalThis.requestAnimationFrame = () => {
      const id = ++rafSeq;
      activeRafs.add(id);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => activeRafs.delete(id);
    try {
      const clk = new SpacetimeClock({ duration: 10, playing: true });
      assert.equal(activeRafs.size, 1);
      fireVis('hidden');
      assert.equal(activeRafs.size, 0, 'SpacetimeClock must stop rAF when tab is hidden');
      assert.equal(clk.playing, true, 'SpacetimeClock must preserve playing state across background pause');
      fireVis('visible');
      assert.equal(activeRafs.size, 1, 'SpacetimeClock must resume rAF when tab returns visible');
      clk.destroy();
      assert.equal(activeRafs.size, 0);

      const alive = new AliveLoop({ onTick: () => {}, autoStart: true });
      assert.equal(activeRafs.size, 1);
      fireVis('hidden');
      assert.equal(activeRafs.size, 0, 'AliveLoop must stop rAF when tab is hidden');
      fireVis('visible');
      assert.equal(activeRafs.size, 1, 'AliveLoop must resume rAF when tab returns visible');
      alive.dispose();
      assert.equal(activeRafs.size, 0);
    } finally {
      globalThis.requestAnimationFrame = prevRaf;
      globalThis.cancelAnimationFrame = prevCaf;
    }
  });

  console.log('[OK] v3.1 engine fixes verified (dual-tier outline hot-swap, onlyShells analytical cutaway & X-Ray, staggered explode, 390px callout bar, applyFalsifyCase, visibility pause & fallback card)');
}

const declarations = fs.readFileSync(path.join(ROOT, 'kit', 'index.d.ts'), 'utf8');
assert.match(declarations, /mountScaleBar\([^\n]+options\?: \{[^}]*worldUnitsPerMeter\?: number;[^}]*unitScale\?: number;/);
assert.match(declarations, /backend\?: "auto" \| "webgl2" \| "webgpu" \| "legacy-webgl";/);
assert.match(declarations, /renderNowAsync\(\): Promise<boolean>;/);
for (const file of fs.readdirSync(path.join(ROOT, 'kit')).filter((name) => name.endsWith('.js'))) {
  const marker = `declare module "*/${file}" {`;
  const start = declarations.indexOf(marker);
  assert.ok(start >= 0, `Missing declarations for ${file}`);
  const end = declarations.indexOf('\n}', start);
  const section = declarations.slice(start + marker.length, end);
  const declared = new Set();
  for (const match of section.matchAll(/^  export (?:class|const|function) (\w+)|^  export \{([^}]+)\}/gm)) {
    for (const name of match[1] ? [match[1]] : match[2].split(',').map((item) => item.trim())) declared.add(name);
  }
  const runtime = await import(`../kit/${file}`);
  assert.deepEqual([...declared].sort(), Object.keys(runtime).sort(), `Runtime exports differ in ${file}`);
}
console.log('[OK] Type declaration modules cover every public runtime export');

const benchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'simulify-bench-'));
const sharedRoot = fs.mkdtempSync(path.join(ROOT, 'examples', '.test-benches-'));
try {
  const runPython = (args) => spawnSync(python, ['-B', ...args], { cwd: ROOT, encoding: 'utf8' });
  const rejected = path.join(benchRoot, 'rejected');
  const outsideTargets = [rejected];
  if (process.platform === 'win32') {
    const alternate = path.parse(ROOT).root.toUpperCase() === 'Z:\\' ? 'Y:' : 'Z:';
    outsideTargets.push(path.win32.join(alternate + '\\', path.basename(benchRoot), 'rejected'));
  }
  for (const target of outsideTargets) {
    for (const extra of [[], ['--vendor-base', '../shared/vendor'], ['--vendor-base', 'https://example.com/vendor', '--serve']]) {
      const result = runPython(['scripts/new_bench.py', target, ...extra]);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /outside the repository require --with-vendor/);
      assert.doesNotMatch(result.stderr, /Traceback/);
    }
  }
  assert.ok(!fs.existsSync(rejected));
  const badServe = runPython(['scripts/new_bench.py', path.join(sharedRoot, 'unsafe'),
    '--vendor-base', '../../../../outside-vendor', '--serve']);
  assert.equal(badServe.status, 2, badServe.stderr);
  assert.match(badServe.stderr, /--serve requires --vendor-base/);

  const emptyProject = path.join(benchRoot, 'empty');
  fs.mkdirSync(emptyProject);
  for (const [project, error] of [[rejected, /does not exist/], [emptyProject, /No readable project text files/]]) {
    const result = runPython(['scripts/setup_vendor.py', rejected, '--fonts-only', '--subset-cjk', project]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, error);
    assert.ok(!fs.existsSync(rejected));
  }

  const retryTarget = path.join(benchRoot, 'retry');
  fs.mkdirSync(retryTarget);
  fs.writeFileSync(path.join(retryTarget, 'keep.txt'), 'keep');
  execFileSync(python, ['-B', '-c', `
from pathlib import Path
import sys
from unittest.mock import patch
sys.path.insert(0, 'scripts')
import new_bench

target = Path(sys.argv[1])
sys.argv = ['new_bench.py', str(target), '--with-vendor', '--no-katex']
def partial_vendor(command, **kwargs):
    staged = Path(command[3])
    (staged / 'vendor').mkdir()
    (staged / 'kit').mkdir()
    raise OSError('injected partial vendor copy')
with patch.object(new_bench.subprocess, 'run', side_effect=partial_vendor):
    try:
        new_bench.main()
    except SystemExit as exc:
        assert exc.code == 2
    else:
        raise AssertionError('Partial vendor copy succeeded')
assert [p.name for p in target.iterdir()] == ['keep.txt']
`, retryTarget], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync(python, ['-B', 'scripts/new_bench.py', retryTarget, '--with-vendor', '--no-katex'], { cwd: ROOT });
  const targets = [
    { name: 'vendored bench', layout: 'split-bench', profile: 'field-math', skin: 'blueprint', extra: ['--with-vendor', '--no-katex'] },
    { name: 'shared bench', layout: 'split-bench', profile: 'sandbox-direct', skin: 'bio-cutaway', extra: ['--vendor-base', '../../shared/vendor'] },
    { name: 'default bench', layout: 'fullbleed-hud', profile: 'mechanical-3d', skin: 'paper-ink', extra: [] },
    { name: 'URL bench', layout: 'ab-compare', profile: 'field-math', skin: 'dark-studio', extra: ['--vendor-base', 'https://example.com/vendor/'] },
  ];
  for (const { name, layout, profile, skin, extra } of targets) {
    const vendored = extra.includes('--with-vendor');
    const target = path.join(vendored ? benchRoot : sharedRoot, name);
    execFileSync(python, ['-B', 'scripts/new_bench.py', target, '--title', '<测试 & bench>',
      '--profile', profile, '--layout', layout, '--skin', skin, ...extra], {
      cwd: ROOT, env: { ...process.env, npm_config_offline: 'true' },
    });
    const html = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
    assert.ok(html.includes('&lt;测试 &amp; bench&gt;'));
    assert.ok(html.includes(`data-layout="${layout}"`) && html.includes(`data-theme="${skin}"`));
    const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]+?)<\/script>/)[1]);
    for (const file of ['main.js', 'model.js']) {
      const source = fs.readFileSync(path.join(target, file), 'utf8');
      execFileSync(process.execPath, ['--input-type=module', '--check'], { input: source });
    }
    assert.ok(fs.existsSync(path.join(target, 'styles.css')));
    assert.ok(fs.readFileSync(path.join(target, 'main.js'), 'utf8').includes(`profile: "${profile}"`));
    const kit = path.resolve(target, decodeURIComponent(imports['simulify/']));
    assert.ok(fs.existsSync(path.join(kit, 'fonts', 'fonts.css')));
    assert.doesNotMatch(fs.readFileSync(path.join(kit, 'primer-tokens.css'), 'utf8'), /@import[^;]+katex/);
    assert.equal(html.includes('/katex/katex.min.css'), !vendored);
    assert.equal(fs.existsSync(path.join(kit, 'katex', 'katex.mjs')), !vendored);
    if (vendored) {
      assert.ok(fs.existsSync(path.join(target, 'primitives', 'gears-drivetrain.js')));
      assert.ok(!fs.existsSync(path.join(target, 'vendor', 'three', 'three.module.js')));
    }
    if (name === 'shared bench') assert.equal(imports.three, '../../shared/vendor/three/three.webgpu.js');
    if (name === 'URL bench') assert.equal(imports.three, 'https://example.com/vendor/three/three.webgpu.js');
    else for (const key of ['three', 'three/tsl', 'three/addons/']) {
      assert.ok(fs.existsSync(path.resolve(target, decodeURIComponent(imports[key]))), imports[key]);
    }
  }
  execFileSync(python, ['-B', '-c', `
import sys
from pathlib import Path
from scripts.verify_stage import launch_browser, start_server
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('[SKIP] Offline scaffold browser check requires Playwright')
    sys.exit()
root = Path(sys.argv[1])
server, port = start_server(root)
try:
    with sync_playwright() as p:
        try:
            browser = launch_browser(p, backend='webgl2')
        except RuntimeError as exc:
            print(f'[SKIP] Offline scaffold browser check: {exc}')
            sys.exit()
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        errors = []
        page.on('response', lambda response: errors.append(response.url) if response.status >= 400 else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{port}/index.html?backend=webgl2')
        page.wait_for_function('window.__ready === true')
        assert page.evaluate('window.__simulify.stage.backendKind') == 'webgl2'
        assert page.evaluate('window.__simulify.model.falsify().passed')
        assert page.evaluate("""() => {
            const shell = document.querySelector('.artboard-shell');
            const stage = document.querySelector('.stage-pane').getBoundingClientRect();
            const transport = document.querySelector('#transport').getBoundingClientRect();
            return getComputedStyle(shell).gridTemplateAreas.includes('transport transport')
                && transport.height > 0 && transport.top >= stage.bottom - 1;
        }""")
        assert errors == [], errors
        browser.close()
        print('[OK] Standalone --no-katex renders through HTTP with zero 404s and a placed split transport')
finally:
    server.shutdown()
`, path.join(benchRoot, 'vendored bench')], { cwd: ROOT, stdio: 'inherit' });
} finally {
  fs.rmSync(benchRoot, { recursive: true, force: true });
  fs.rmSync(sharedRoot, { recursive: true, force: true });
}
console.log('[OK] Scaffold syntax, import maps, and bundled offline assets verified');
console.log('[OK] All Simulify tests passed');
