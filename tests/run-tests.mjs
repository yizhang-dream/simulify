import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as nodeModule from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CalloutLayer, resolveCalloutRects } from '../kit/callout-layer.js';
import { ChartCard } from '../kit/chart-card.js';
import { ActorChoreographer } from '../kit/choreography.js';
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
} from '../kit/live-maths.js';
import {
  ICONS,
  LAYOUT_ARCHETYPES,
  mountScaleBar,
  mountViewCube,
  ScrollyBridge,
  THEME_PRESETS,
  toggleZenMode,
  WipeCompareController,
} from '../kit/layout-shell.js';
import { SvgFlowStage } from '../kit/stage-2d.js';
import {
  defaultInterpolateState,
  SimulationTape,
  SpacetimeClock,
} from '../kit/spacetime.js';
import { Spring } from '../kit/spring.js';
import { StageExporter, mountExportButton } from '../kit/stage-exporter.js';
import {
  applyUrlState,
  easeLinear,
  exposeTestHooks,
  mountTimelineBar,
  parseUrlState,
  PhaseScrubber,
  TimelineDirector,
} from '../kit/timeline-director.js';
import { ApngSession, crc32, muxApngWithStats } from '../kit/export/apng-muxer.js';
import { supportsHtmlInCanvasCompositor } from '../kit/export/compositor.js';
import { encodeGifWithStats, GifEncoderSession } from '../kit/export/gif-encoder.js';
import { Mp4Muxer } from '../kit/export/mp4-muxer.js';
import { WebmMuxer } from '../kit/export/webm-muxer.js';
import { createI18n } from '../shell/i18n.js';
import { createMemoryStorage, MasteryStore } from '../shell/storage-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

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

// Helper to build a minimal valid PNG Uint8Array for APNG tests
function buildSyntheticPng(width, height, idatPayload) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const makeChunk = (type, data) => {
    const out = new Uint8Array(12 + data.byteLength);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.byteLength, false);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.byteLength, crc32(out, 4, 8 + data.byteLength), false);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width, false);
  iv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const parts = [sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idatPayload), makeChunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    merged.set(p, off);
    off += p.byteLength;
  }
  return merged;
}

function indexOfBytes(haystack, needle) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function asciiBytes(str) {
  return Uint8Array.from(str, (ch) => ch.charCodeAt(0) & 0xff);
}

// ============================================================================
// 1. Verify all active JS syntax across kit/, primitives/, shell/, examples/, tests/
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
  ...walkJs(path.join(ROOT, 'shell')),
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

assert.ok(
  skillText.includes('Orthographic Three-View Blueprint') && skillText.includes('DIMENSIONS'),
  'SKILL.md must enforce the Concept Draft + Orthographic Three-View Blueprint workflow'
);

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
assert.equal(bus.clearHover('3d'), true);
assert.equal(events.length, 3);
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

const urlParsed = parseUrlState('?stage=act-2&t=0.5&paused&lang=en&export=caption&backend=webgpu');
assert.equal(urlParsed.stage, 'act-2');
assert.equal(urlParsed.t, 0.5);
assert.equal(urlParsed.paused, true);
assert.equal(urlParsed.lang, 'en');
assert.equal(urlParsed.exportMode, 'caption');
assert.equal(urlParsed.export, 'caption');
assert.equal(urlParsed.backend, 'webgpu');
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
const syncStage = {
  setManualMode() {},
  unlockUserCamera() {},
  renderNow() { clockHookRenderCount += 1; },
  getGeometryAudit: () => ({ totalMeshes: 4, cuboidMeshes: 1, sculptedMeshes: 3, cuboidRatio: 0.25 }),
};
const clockHooks = exposeTestHooks(syncClock, {
  stage: syncStage,
  choreographer: syncChoreo,
  syncAll: (t) => {
    clockHookSyncCount += 1;
    syncChoreo.evaluate(t, { apply: true, stage: syncStage });
  },
});
const evalBefore = syncChoreo._evalCount;
clockHooks.seek(6.0);
assert.equal(clockHookSyncCount, 1, 'exposeTestHooks.seek must invoke syncAll strictly once');
assert.equal(clockHookOnSeekCount, 0, 'exposeTestHooks.seek must suppress redundant clock onSeek when syncAll exists');
assert.equal(syncChoreo._evalCount - evalBefore, 1, 'choreographer.evaluate must run strictly once per seek');
assert.equal(clockHookRenderCount, 1, 'stage.renderNow must run strictly once per seek');
assert.equal(clockHooks.getGeometryAudit().sculptedMeshes, 3);
assert.equal(clockHooks.getFontAudit().supported, false);

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
console.log('[OK] TimelineDirector v1/v2, SpacetimeClock 1x seek, mountTimelineBar i18n, and exposeTestHooks v2 verified');

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
// 10. Verify Shell i18n (including RTL) & MasteryStore
// ============================================================================
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
console.log('[OK] Shell i18n (zh/en/ar) & MasteryStore verified');

// ============================================================================
// 11. Verify Stage 3D bounds audit & cardinal 3-view contract (kit/stage-3d.js)
//     (executed in Section 13 once Three.js ESM import hook is active)
// ============================================================================

// ============================================================================
// 12. Verify Pure-JS Export Muxers & Encoders (`kit/export/*.js`)
// ============================================================================

// 12a. MP4 Muxer (ISOBMFF: ftyp -> moov -> avcC -> mdat)
const avcCDesc = new Uint8Array([
  0x01, 0x64, 0x00, 0x28, 0xff, 0xe1,
  0x00, 0x04, 0x67, 0x64, 0x00, 0x28,
  0x01, 0x00, 0x04, 0x68, 0xee, 0x3c, 0x80,
]);
const mp4Mux = new Mp4Muxer({ width: 320, height: 180, fps: 30 });
mp4Mux.addChunk(
  { data: new Uint8Array([0x00, 0x00, 0x00, 0x04, 0x65, 0x88, 0x84, 0x21]), isKey: true, durationUs: 33333 },
  { decoderConfig: { description: avcCDesc } }
);
mp4Mux.addChunk({ data: new Uint8Array([0x00, 0x00, 0x00, 0x03, 0x41, 0x9a, 0x02]), isKey: false, durationUs: 33333 });
const mp4Bytes = mp4Mux.finalize();
const mp4View = new DataView(mp4Bytes.buffer, mp4Bytes.byteOffset, mp4Bytes.byteLength);

const topBoxes = [];
let mp4Off = 0;
while (mp4Off + 8 <= mp4Bytes.byteLength) {
  const size = mp4View.getUint32(mp4Off, false);
  const type = String.fromCharCode(...mp4Bytes.subarray(mp4Off + 4, mp4Off + 8));
  assert.ok(size >= 8 && mp4Off + size <= mp4Bytes.byteLength, `Valid MP4 box bounds for ${type}`);
  topBoxes.push({ type, offset: mp4Off, size });
  mp4Off += size;
}
assert.equal(mp4Off, mp4Bytes.byteLength, 'MP4 top-level boxes must span entire buffer cleanly');
assert.deepEqual(topBoxes.map((b) => b.type), ['ftyp', 'moov', 'mdat'], 'Fast-start MP4 box order must be ftyp/moov/mdat');
assert.ok(indexOfBytes(mp4Bytes, asciiBytes('avcC')) > 0, 'MP4 moov must embed avcC box');
assert.ok(indexOfBytes(mp4Bytes, asciiBytes('mvhd')) > 0, 'MP4 moov must embed mvhd box');
const stcoPos = indexOfBytes(mp4Bytes, asciiBytes('stco'));
assert.ok(stcoPos > 0, 'MP4 moov must embed stco chunk offset table');
const stcoChunkOffset = mp4View.getUint32(stcoPos + 12, false);
assert.equal(stcoChunkOffset, topBoxes[2].offset + 8, 'stco chunk offset must point directly to mdat payload');

// Also verify Annex-B auto-conversion path
const annexMux = new Mp4Muxer({ width: 160, height: 120, fps: 24 });
annexMux.addChunk({
  data: new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1f, 0, 0, 0, 1, 0x68, 0xce, 0x3c, 0x80, 0, 0, 0, 1, 0x65, 0x88]),
  isKey: true,
});
assert.ok(indexOfBytes(annexMux.finalize(), asciiBytes('avcC')) > 0);
console.log(`[OK] Mp4Muxer verified (ftyp/moov/avcC/mdat, ${mp4Bytes.byteLength} bytes, exact stco=${stcoChunkOffset})`);

// 12b. WebM Muxer (EBML header + DocType 'webm' + Segment + Tracks + Cluster + Cues)
const webmMux = new WebmMuxer({ width: 320, height: 180, fps: 30, codec: 'vp09.00.10.08' });
webmMux.addChunk({ data: new Uint8Array([0x82, 0x49, 0x83, 0x42, 0x00]), isKey: true, timestampUs: 0, durationUs: 33333 });
webmMux.addChunk({ data: new Uint8Array([0x86, 0x11, 0x22, 0x33]), isKey: false, timestampUs: 33333, durationUs: 33333 });
webmMux.addChunk({ data: new Uint8Array([0x82, 0x49, 0x83, 0x42, 0x01]), isKey: true, timestampUs: 66666, durationUs: 33333 });
const webmBytes = webmMux.finalize();
assert.deepEqual(Array.from(webmBytes.subarray(0, 4)), [0x1a, 0x45, 0xdf, 0xa3], 'WebM must start with EBML magic ID');
assert.ok(indexOfBytes(webmBytes, asciiBytes('webm')) > 0, 'WebM EBML header must contain DocType "webm"');
assert.ok(indexOfBytes(webmBytes, asciiBytes('V_VP9')) > 0, 'WebM Tracks must declare V_VP9 CodecID');
assert.ok(indexOfBytes(webmBytes, new Uint8Array([0x18, 0x53, 0x80, 0x67])) > 0, 'WebM must contain Segment ID');
assert.ok(indexOfBytes(webmBytes, new Uint8Array([0x1f, 0x43, 0xb6, 0x75])) > 0, 'WebM must contain Cluster ID');
assert.ok(indexOfBytes(webmBytes, new Uint8Array([0x1c, 0x53, 0xbb, 0x6b])) > 0, 'WebM must contain seekable Cues ID');
console.log(`[OK] WebmMuxer verified (EBML/webm/V_VP9/Segment/Cluster/Cues, ${webmBytes.byteLength} bytes)`);

// 12c. GIF Encoder (GIF89a header + hold-frame coalescing reduces emitted frames)
const gw = 16;
const gh = 16;
const makeRgbaFrame = (fillR, fillG, fillB, patch = false) => {
  const buf = new Uint8Array(gw * gh * 4);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const o = (y * gw + x) * 4;
      const inPatch = patch && x >= 4 && x < 8 && y >= 4 && y < 8;
      buf[o] = inPatch ? 220 : fillR;
      buf[o + 1] = inPatch ? 60 : fillG;
      buf[o + 2] = inPatch ? 40 : fillB;
      buf[o + 3] = 255;
    }
  }
  return buf;
};
const frameA = makeRgbaFrame(20, 150, 148, false);
const frameB = makeRgbaFrame(20, 150, 148, true);
const gifFrames = [frameA, frameA, frameA, frameA, frameB, frameB];

const gifCoalesced = encodeGifWithStats({
  width: gw,
  height: gh,
  frames: gifFrames,
  fps: 15,
  coalesceHolds: true,
  dirtyRect: true,
});
const gifNoCoalesce = encodeGifWithStats({
  width: gw,
  height: gh,
  frames: gifFrames,
  fps: 15,
  coalesceHolds: false,
  dirtyRect: false,
});

assert.equal(String.fromCharCode(...gifCoalesced.bytes.subarray(0, 6)), 'GIF89a', 'GIF must begin with GIF89a header');
assert.equal(gifCoalesced.bytes[gifCoalesced.bytes.length - 1], 0x3b, 'GIF must end with 0x3B trailer');
assert.ok(indexOfBytes(gifCoalesced.bytes, asciiBytes('NETSCAPE2.0')) > 0, 'Looping GIF must embed NETSCAPE2.0');
assert.equal(gifCoalesced.stats.inputFrames, 6);
assert.equal(gifCoalesced.stats.emittedFrames, 2, 'Hold coalescing must collapse 6 frames (4+2 holds) into 2 frames');
assert.equal(gifCoalesced.stats.coalescedHolds, 4);
assert.ok(
  gifCoalesced.stats.emittedFrames < gifNoCoalesce.stats.emittedFrames,
  'Coalesced GIF must emit strictly fewer frames than uncoalesced'
);

const gifSess = new GifEncoderSession({ width: gw, height: gh, fps: 15, useWorker: false });
gifFrames.forEach((f) => gifSess.addRgbaFrame(f));
const gifSessOut = await gifSess.finalize();
assert.equal(String.fromCharCode(...gifSessOut.bytes.subarray(0, 6)), 'GIF89a');
assert.equal(gifSessOut.stats.emittedFrames, 2);
console.log(
  `[OK] GifEncoder verified (GIF89a, hold coalescing ${gifCoalesced.stats.inputFrames}->${gifCoalesced.stats.emittedFrames} frames, ${gifCoalesced.bytes.byteLength} bytes)`
);

// 12d. APNG Muxer (valid PNG + acTL/fcTL/fdAT chunks + CRC32 + hold coalescing)
const pngA = buildSyntheticPng(16, 16, new Uint8Array([0x78, 0x9c, 0x01, 0x02, 0x03, 0x04]));
const pngB = buildSyntheticPng(16, 16, new Uint8Array([0x78, 0x9c, 0x09, 0x08, 0x07, 0x06]));
const apngSess = new ApngSession({ fps: 24, loop: 0, coalesceHolds: true });
apngSess.addPng(pngA);
apngSess.addPng(pngA);
apngSess.addPng(pngA);
apngSess.addPng(pngB);
apngSess.addPng(pngB);
const apngRes = apngSess.finalize();
const apngBytes = apngRes.bytes;
assert.deepEqual(
  Array.from(apngBytes.subarray(0, 8)),
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'APNG must start with valid PNG signature'
);
assert.equal(apngRes.stats.inputFrames, 5);
assert.equal(apngRes.stats.emittedFrames, 2, 'APNG hold coalescing must collapse 5 frames into 2');
assert.equal(apngRes.stats.coalescedHolds, 3);

// Walk every PNG chunk and verify CRC32 + presence of acTL, fcTL, IDAT, fdAT, IEND
const apngView = new DataView(apngBytes.buffer, apngBytes.byteOffset, apngBytes.byteLength);
const chunkTypes = [];
const fctlDelays = [];
let apngOff = 8;
while (apngOff + 12 <= apngBytes.byteLength) {
  const len = apngView.getUint32(apngOff, false);
  const type = String.fromCharCode(...apngBytes.subarray(apngOff + 4, apngOff + 8));
  const dataEnd = apngOff + 8 + len;
  const storedCrc = apngView.getUint32(dataEnd, false);
  const calcCrc = crc32(apngBytes, apngOff + 4, dataEnd);
  assert.equal(storedCrc, calcCrc, `CRC32 mismatch in APNG chunk ${type}`);
  chunkTypes.push(type);
  if (type === 'fcTL') {
    fctlDelays.push(apngView.getUint16(apngOff + 8 + 20, false));
  }
  apngOff = dataEnd + 4;
}
assert.equal(apngOff, apngBytes.byteLength);
assert.deepEqual(chunkTypes, ['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
assert.deepEqual(fctlDelays, [3, 2], 'Coalesced fcTL delayNum must accumulate hold durations (3 + 2 ticks)');
const apngRaw = muxApngWithStats({ frames: [{ png: pngA }, { png: pngA }], fps: 24, coalesceHolds: false });
assert.equal(apngRaw.stats.emittedFrames, 2);
console.log(`[OK] ApngMuxer verified (PNG/acTL/fcTL/fdAT + CRC32 + hold coalescing 5->2, ${apngBytes.byteLength} bytes)`);

// ============================================================================
// 13. Safe Node-Import Smoke Checks (`kit/html-surface.js`, `kit/manipulator.js`, `kit/stage-exporter.js`)
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

// StageExporter & compositor Node smoke check
assert.equal(typeof StageExporter, 'function');
assert.equal(typeof mountExportButton, 'function');
assert.equal(supportsHtmlInCanvasCompositor(), false, 'HTML-in-Canvas compositor must return false in Node');
const exporter = new StageExporter({
  workbench: {
    getTimelineInfo: () => ({ mode: 'spacetime', duration: 10, defaultFps: 30, stages: [] }),
    seek: () => {},
  },
});
assert.equal(exporter.getTimelineInfo().duration, 10);
const caps = await exporter.getCapabilities();
assert.equal(caps.gif, true);
assert.equal(caps.apng, true);
assert.equal(caps.png, true);
assert.equal(caps.htmlInCanvas, false);

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
const stage = new IsometricStage(mockStageCanvas, { backend: 'legacy-webgl', htmlInCanvas: false, autoLoop: false });
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

console.log('[OK] Node smoke checks passed for stage-3d (bounds + 3-views), html-surface, manipulator, GridBrush, stage-exporter, and compositor');

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
// 16. Verify Simulify v2.2 Visual Presentation, Multi-Layout, Lighting, Cutaway,
//     Field-Viz, Choreography, ClearType Callouts, Extended Maths & Charts
// ============================================================================

// 16a. Layout Archetypes, 6 Themes, ScrollyBridge, WipeCompare, ViewCube, ScaleBar
assert.deepEqual(LAYOUT_ARCHETYPES, ['fullbleed-hud', 'split-bench', 'ab-compare', 'multi-view', 'scrolly-stage']);
assert.equal(THEME_PRESETS.length, 6);
assert.ok(ICONS.cutaway.includes('<svg') && ICONS.explode.includes('<svg'));

withMockDocument(() => {
  const shellEl = createMockElement('div');
  assert.equal(toggleZenMode(shellEl), true);
  assert.equal(shellEl.dataset.zen, 'true');
  assert.equal(toggleZenMode(shellEl), false);
  assert.equal(shellEl.dataset.zen, undefined);

  // ScrollyBridge bidirectional deterministic mapping
  const sClock = new SpacetimeClock({ duration: 30, manualMode: true });
  const step0 = createMockElement('section');
  step0.dataset.tStart = '0';
  step0.dataset.tEnd = '10';
  const step1 = createMockElement('section');
  step1.dataset.tStart = '10';
  step1.dataset.tEnd = '20';
  const step2 = createMockElement('section');
  step2.dataset.tStart = '20';
  step2.dataset.tEnd = '30';
  const progEl = createMockElement('div');
  progEl.style.setProperty = (k, v) => { progEl.style[k] = v; };

  const bridge = new ScrollyBridge({ clock: sClock, steps: [step0, step1, step2], scrollTarget: null, progressEl: progEl });
  const midRes = bridge.applyComputed(
    bridge.computeTimeFromRects(
      [
        { top: -600, bottom: -100, height: 500 },
        { top: -100, bottom: 500, height: 600 },
        { top: 500, bottom: 1100, height: 600 },
      ],
      1000 // anchorY = 420 -> inside step1 at (420 - -100)/600 = 520/600 -> t ≈ 18.67
    )
  );
  assert.equal(midRes.activeIndex, 1);
  assert.ok(midRes.t > 18 && midRes.t < 19, `Expected t ~ 18.67, got ${midRes.t}`);
  assert.equal(step1.classList.contains('is-active'), true);

  // Scroll back up -> rewinds clock deterministically
  const backRes = bridge.applyComputed(
    bridge.computeTimeFromRects(
      [
        { top: 100, bottom: 700, height: 600 },
        { top: 700, bottom: 1300, height: 600 },
        { top: 1300, bottom: 1900, height: 600 },
      ],
      1000
    )
  );
  assert.equal(backRes.activeIndex, 0);
  assert.ok(backRes.t > 5 && backRes.t < 6);
  assert.equal(step0.classList.contains('is-active'), true);
  assert.equal(step1.classList.contains('is-active'), false);
  bridge.dispose();
  sClock.destroy();

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

const stageA = new IsometricStage(mockStageCanvas, { backend: 'legacy-webgl', htmlInCanvas: false, autoLoop: false, theme: 'blueprint' });
const stageB = new IsometricStage(mockStageCanvas, { backend: 'legacy-webgl', htmlInCanvas: false, autoLoop: false, theme: 'obsidian-gallery' });
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
const unlinkSync = stageA.syncCameraWith(stageB);
stageA.setCameraImmediate({ azimuthDeg: 62, elevationDeg: 35, zoom: 1.4 });
assert.ok(Math.abs(stageB.getCameraState().azimuthDeg - 62) < 0.2, 'syncCameraWith must mirror camera to peer stage');
unlinkSync();

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
stageB.dispose();

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

// 16e. Choreography v2.2: matte/wireframe focus, explodeGroup, clipSweep, draw & blueprint transitions
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

// 16h. Extended ChartCard modes (distribution, heatmap, timing, spark-kpi, generic hysteresis) + 4D SvgFlowStage
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

  // Deterministic 4D Track B SvgFlowStage
  const s2dHost = createMockElement('div');
  const s2d = new SvgFlowStage(s2dHost);
  s2d.setTopology({
    nodes: [{ id: 'A', x: 100, y: 200, label: 'Client' }, { id: 'B', x: 500, y: 200, label: 'Server' }],
    edges: [{ id: 'e1', from: 'A', to: 'B', arc: 30 }],
  });
  s2d.setPacketSchedule([{ id: 'syn', from: 'A', to: 'B', edgeId: 'e1', start: 1, end: 3, label: 'SYN', tone: 'teal' }]);
  assert.equal(s2d.evaluate(0.5).length, 0);
  const midPkt = s2d.evaluate(2.0);
  assert.equal(midPkt.length, 1);
  assert.ok(Math.abs(midPkt[0].x - 300) < 2, 'Packet midpoint must travel centered between trimmed node borders');
  const e1 = s2d.edges.get('e1');
  assert.ok(e1.pStart.x > 160 && e1.pEnd.x < 440, 'Stage2D edges must trim cleanly to node box boundaries');
  assert.equal(s2d.evaluate(0.5).length, 0, 'Backward seek must cleanly hide future packet');
});

console.log('[OK] Simulify v2.2 upgrades verified (6 layouts, 6 themes, aligned lights/rim/cutaway-cap, micro-PBR/X-Ray, field-viz, matte focus, ClearType callouts, extended maths/charts & 4D stage-2d)');
console.log('[OK] All Simulify v1 + v2.2 unit, typography, geo-sculpt, field-viz, layout, mathematical, muxer, syntax, and link-integrity tests PASSED');
