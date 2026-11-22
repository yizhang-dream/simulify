---
name: simulify
description: >-
  Turn a mechanism, physical structure, hardware/protocol flow, mathematical law, or algorithm into a
  standalone offline interactive 3D/4D HTML explainer: progressive temporal revelation over continuous
  reversible 4D timelines, 3D cutaways and exploded views, WebGPU + HTML-in-Canvas progressive
  enhancement, live equation substitution, counterfactual ghosts, and offline MP4/WebM/GIF export.
  Use whenever a flat page (answer-me-with-html), 2D diagram (archify), or static textbook
  (atlas-textbook) cannot show 3D spatial occlusion, progressive causal time evolution, or hands-on
  "what-if" dynamics — or when the user asks for 用 3D 讲 / 做个 3D 或 4D 交互演示 / 拆解内部结构 /
  做成可调参实验台 / 拖时间轴看过程 / 动起来看原理 / 仿真拆解 / interactive 3D explainer /
  explorable simulation / cutaway view. Do not use for pure mini-games or decorative 3D backgrounds
  without explanatory rules.
---

# Simulify v2 — True 4D Mechanism, Progressive-Reveal & Simulation Explainer

> **Suite Role**: **`answer-me-with-html`** explains via 2D prose/tables; **`archify`** draws structural/sequence diagrams; **`atlas-textbook`** weaves connected readable books; **`simulify`** builds **true 4D progressive-reveal 3D/2.5D simulation workbenches** where actors, subsystems, equations, and plots enter *only when causal friction demands them*, learners scrub time continuously forward/backward, manipulate the stage directly, compare counterfactual ghosts, and export clean MP4/WebM/GIF clips.

Simulify v2 enforces quality through **1 human visual decision + the True 4D Progressive-Reveal Law + code-enforced engineering & temporal oracles**:

---

## Step 1 · Native Truth Audit, Cast & Reveal Ledger & 3 Visual Concepts (Only Human Checkpoint)

Before writing HTML or scene code:
1. Lock the orthogonal coordinate choices:
   - **Native Truth Axis (`①–④`)** in [fidelity-isomorphism.md](references/fidelity-isomorphism.md):
     **① Physical/Spatial** (3D cutaway/X-Ray, clipping planes) · **② Logic/Code/Protocol** (2D/2.5D spacetime ladder or hardware ↔ synchronized code/dissector) · **③ Math/Optimization/RL** (formal workspace + `LiveMathsPanel` with bidirectional `LinkBus` tokens) · **④ Physical × Math Dual** (3D bench coupled live to phase-time helix/plot + collapsible formulas from one `solve()`).
   - **Time Regime (`T1–T4`) & Progressive-Reveal Law** in [time-dimension.md](references/time-dimension.md):
     - **BAN `t = 0` spatial dumping & `showEnd()` on load.** Never drop the whole chapter's objects, comparison tracks, and 4-corner HUD panels onto frame 0.
     - **Draft a Beat-by-Beat Cast & Reveal Ledger**: open sparse at `t = 0` (`<= 2` active actors on stage, minimal chrome), unfold over an unhurried **25–60 s continuous global timeline**, and state the exact **causal trigger** for every subsequent actor, subsystem, chart, formula, and HUD reveal (`enter`, `focus`, `cameraBeat`, `hudReveal`).
   - **Topic Track & Agency** in [topic-fit.md](references/topic-fit.md): design direct on-stage manipulation (`kit/manipulator.js` — drag handles, paintable tiles, clickable in-flight packets) instead of slider-only sidebars.
2. Generate **3 genuinely distinct architectural & visual concept renders** matching the truth axis & theme (`paper-ink`, `dark-studio`, `bio-cutaway`) and present them side-by-side to the user.
3. **Stop for user selection.** Do NOT skip directly to code unless the user explicitly opted out of concept selection for the current turn.

---

## Step 2 · Assemble from `kit/` & Domain `primitives/` (Zero-CDN Offline ESM)

Once the user selects a concept:
1. **Extract offline vendor runtime**: run `python scripts/setup_vendor.py <target_dir>` (zero CDN imports; bundles `three.core.js`, `three.webgpu.js`, `three.tsl.js`, `RoomEnvironment.js`, `RoundedBoxGeometry.js`, plus legacy `three.module.js`).
2. **Drive everything from ONE deterministic 4D clock + pure-function choreography**:
   - Use [`kit/spacetime.js`](kit/spacetime.js): `SpacetimeClock` (single master global clock `0 → T`, speed dilation `0.1×–2×`, beat/act bookmarks, `setManualMode(bool)`) and `SimulationTape` (O(1) continuous forward/backward `sampleAt(t)` + `captureGhost()` / `getGhost()` for translucent counterfactual overlays). **Never** drive scene animations off raw `performance.now()` or spawn competing `rAF` loops.
   - Use [`kit/choreography.js`](kit/choreography.js): `ActorChoreographer` (`register`, `enter`, `exit`, `focus`, `cameraBeat`, `hudReveal`, `evaluate(t)`, `getActiveActorCount(t)`) so every 3D actor, 3D HTML surface, camera move, and contextual HUD panel is a pure, reversible function of `t`.
   - Use [`kit/timeline-director.js`](kit/timeline-director.js): `mountTimelineBar(el, clockOrDirector)` for interactive global scrubbing with beat ticks, `applyUrlState` (`?stage=&step=&t=&paused&end&thumb=1&export=stage|caption|hud`), and `exposeTestHooks(clockOrDirector, { stage, callouts, choreographer, syncAll, falsify, ... })` which automatically synthesizes the **`window.__simulify` v2 unified contract** (`version: 2`, `getTimelineInfo`, `enterExportMode`, `seek`, `exitExportMode`, `getCaptureTargets`, `getCaptionState`, `getActiveActorCount`).
3. **Progressive WebGPU + HTML-in-Canvas + Direct Manipulation**:
   - Initialize [`kit/stage-3d.js`](kit/stage-3d.js) via `await IsometricStage.create(canvas, opts)` (Hardware WebGPU → WebGL2 → graceful fallback; supports `orthographic` / `perspective`, clipping planes, theme-aware lighting, opt-in `OutlinePass`, `setManualMode`, `renderNow`, `setCameraImmediate`, `setExportSize`).
   - Mount live diegetic HTML (equations from [`kit/live-maths.js`](kit/live-maths.js) with `surfaceMode: true` & `LinkBus` `linkId` tokens, code traces, telemetry) via `kit/html-surface.js` (modern `<canvas content="drawable">` + `drawElementImageToTexture`/`texElementSubImage2D` + TSL `sRGBTransferEOTF`, seamlessly falling back to CSS `matrix3d` DOM / `CanvasTexture` on Firefox/Safari).
   - Wire direct stage interactions via `kit/manipulator.js`, scrubbable charts via [`kit/chart-card.js`](kit/chart-card.js) (`onScrub`), exportable callouts via [`kit/callout-layer.js`](kit/callout-layer.js) (`getExportSnapshot`), and in-browser offline export via `kit/stage-exporter.js`.
   - Reuse crafted domain primitives in [`primitives/`](primitives/) (e.g. [`primitives/rl-primitives.js`](primitives/rl-primitives.js)) instead of crude stacked boxes; keep boxed HUD chrome `<= 25%` of viewport and tag HUD containers with `data-export-role="chrome|caption|callout|panel|stage"`.
   - Follow [`design-system.md`](references/design-system.md) & [`stage-architecture.md`](references/stage-architecture.md); add `shell/` when delivering multi-lesson sites or desktop apps.

---

## Step 3 · Pass the v2 4D Quality Oracle, Visual Check & Export

1. Run `node tests/run-tests.mjs` for ESM syntax, core 4D unit invariants, and zero broken markdown links.
2. Run the upgraded **v2 4D Quality Oracle** ([`scripts/verify_stage.py`](scripts/verify_stage.py)):
   ```bash
   python scripts/verify_stage.py --root <dir> --entry <index.html> --probe "?stage=..."
   ```
   A v2 bench (`window.__simulify.version >= 2`) passes ONLY when ALL oracle legs report `OK` across `1280×800`, `1440×900`, `390×844`, and deep-link probes:
   - **`prose-lint`**: Zero AI clichés and zero desktop guide scroll overflow.
   - **`stage-frame` & `visual-integrity`**: Active non-blank canvas (`>= 45%` desktop area), zero horizontal code/prose truncation (`scrollWidth <= clientWidth + 2`), zero GPU/console errors.
   - **`chart-legibility` & `hud-overlap`**: Readable visible plots (`>= 200 × 85` px) and zero HUD dock collisions (`<= 6px`).
   - **`initial-sparsity`**: Bench boots near `t = 0` (NOT `showEnd()`) and strictly grows over time (`getActiveActorCount(0) < getActiveActorCount(T)`).
   - **`temporal-scrub-determinism`**: Driving `seek(0.1T) → seek(0.5T) → seek(0.9T) → seek(0.5T)` yields real visual evolution across timepoints AND repeatable state/pixels on rewind.
   - **`mandatory-falsify`**: `window.__simulify.falsify()` MUST exist and return `{ passed: true }` across `>= 2` counterfactual assertions.
3. Visually inspect rendered screenshots side-by-side against the concept chosen in Step 1. For galleries, bake crisp 2× thumbnails with [`scripts/bake_thumbs.py`](scripts/bake_thumbs.py); for studio MP4/WebM/GIF reels, run `scripts/export_video.py` (Tier 2 Playwright CLI) or the in-browser `kit/stage-exporter.js` popover (Tier 1).
