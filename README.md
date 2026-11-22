<h1 align="center">Simulify v2</h1>

<p align="center">
  <b>True 4D Interactive Mechanism, Cutaway &amp; Simulation Explainer &nbsp;|&nbsp; WebGPU + HTML-in-Canvas &nbsp;|&nbsp; Offline Video/GIF Export</b>
</p>

<p align="center">
  An open-source AI Agent Skill &amp; zero-build ESM kit for teaching physical assemblies, algorithms, hardware/protocol flows, and multi-act chapters via 1:1 isomorphic 3D cutaways, continuous reversible 4D timelines, live equation substitution, direct 3D manipulation, and deterministic MP4/WebM/GIF/APNG export.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <a href="https://simulify.xn--ltr42g543b.cn/">Live Gallery</a> · <a href="SKILL.md">Agent Skill Spec</a> · <a href="INSTALL.md">Install</a> · <a href="examples/index.html">Local Examples</a> · <a href="#quick-start--cli-tools">Quick Start</a>
</p>

---

## Why Simulify? (Benchmark Against Sibling Explainers)

| Explainer Family | Native Medium | Core Strength | Where Simulify Steps In |
| :--- | :--- | :--- | :--- |
| Plain Text Wall | Paragraphs | Fast to print | Fails on 3D geometry, timing, feedback loops, and coupled rules |
| `answer-me-with-html` | 2D HTML + Tables + Flow | Low-token readable one-page explanations | Static once built; learners cannot perturb parameters and observe 3D dynamics |
| `archify` | Validated 2D SVG Diagrams | Exact architecture, sequence, ERD & lifecycle maps | Best for 2D structural topology (compare its `cache-miss` sequence with `examples/cache-bench/`) |
| `atlas-textbook` | Interactive HTML Book | Question-chained `carries`/`hook`/`relates` chapters & clean prose | Inspires Simulify's multi-act chapter chaining & direct intuition prose inside explorable workbenches |
| **`simulify` v2** | **True 4D Spacetime + 3D Cutaway + Formal Dual Views** | **Continuous scrubbable counterfactual benches + offline video export** | Progressive temporal reveal, WebGPU + HTML-in-Canvas, direct 3D editing, and falsifiable failure modes |

---

## What's New in Simulify v2

1. **True 4D Progressive Temporal Reveal ([`kit/spacetime.js`](kit/spacetime.js) + [`kit/choreography.js`](kit/choreography.js))**:
   - [`SpacetimeClock`](kit/spacetime.js) drives one master reversible clock (`0 -> T`) with continuous scrubbing, speed dilation (`0.25x`–`2x`), frame stepping, and act/beat bookmarks.
   - [`SimulationTape`](kit/spacetime.js) caches deterministic simulation trajectories for O(1) forward/backward sampling and immutable counterfactual ghosts (`captureGhost()`) so learners compare live parameter changes directly against prior trajectories.
   - [`ActorChoreographer`](kit/choreography.js) evaluates every 3D actor, contextual HUD panel (`hudReveal`), callout opacity, focus dimming, and camera beat (`cameraBeat`) as a pure function of `t` — stages open sparse at `t = 0` and introduce each piece only when causal friction demands it.
2. **Zero-CDN WebGPU + TSL + Native HTML-in-Canvas ([`kit/stage-3d.js`](kit/stage-3d.js), [`kit/outline-pass.js`](kit/outline-pass.js), [`kit/html-surface.js`](kit/html-surface.js), [`kit/manipulator.js`](kit/manipulator.js))**:
   - [`IsometricStage`](kit/stage-3d.js) and [`OutlinePass`](kit/outline-pass.js) run Three.js `WebGPURenderer` + TSL pipelines automatically on hardware WebGPU and fall back cleanly to WebGL2 / Canvas2D with zero external CDN imports.
   - [`HtmlSurfaceManager`](kit/html-surface.js) projects crisp live HTML/CJK typography, equations, and code traces onto 3D surfaces using Chrome/Edge 157+ `<canvas content="drawable">` (`drawElementImageToTexture` / `texElementSubImage2D` / `updateElementGeometry`), degrading cleanly to CSS `matrix3d` DOM overlays or `CanvasTexture` decals on Firefox and Safari.
   - [`StageManipulator`](kit/manipulator.js) and [`GridBrush`](kit/manipulator.js) add capture-phase 3D handle dragging and direct grid painting right on the 3D stage.
3. **Two-Tier Deterministic Video & GIF Export ([`kit/stage-exporter.js`](kit/stage-exporter.js) + [`scripts/export_video.py`](scripts/export_video.py))**:
   - **Tier 1 (In-Browser, Zero-CDN)**: [`StageExporter`](kit/stage-exporter.js) steps `window.__simulify.seek(t)` frame by frame and lazy-loads pure-JS encoders under [`kit/export/`](kit/export/mp4-muxer.js) (`MP4` via WebCodecs H.264, `WebM` via VP9/VP8 or MediaRecorder, `GIF` with 4×4 Bayer dithering + hold coalescing, `APNG`, and single-frame `PNG`) via HTML-in-Canvas or Canvas2D compositing.
   - **Tier 2 (CLI Studio Export)**: [`scripts/export_video.py`](scripts/export_video.py) (`uv run` ready) renders deterministic multi-worker captures with presets (`draft`, `1080p60`, `4k60`, `gif`, `webm`), HUD modes (`caption`, `stage`, `hud`), and linear-light shutter motion blur (`--shutter 180`).
4. **Upgraded 4D Quality Oracle ([`scripts/verify_stage.py`](scripts/verify_stage.py))**:
   - Enforces all v1 gates (`prose-lint`, `stage-frame`, `chart-legibility`, `hud-overlap`, `falsify-oracle`) plus 4 v2 gates under `--strict-4d`: `initial-sparsity`, `temporal-scrub-determinism`, `mandatory-falsify`, and `visual-integrity`.
5. **1:1 Native Truth Fidelity & Optional Platform Shell (`shell/`)**:
   - Keeps every visual linked to a single `solve()` ground truth (paired with [`LiveMathsPanel`](kit/live-maths.js) bidirectional `LinkBus` highlighting and [`ChartCard`](kit/chart-card.js) interactive scrubbable XY/hysteresis plots), plus offline `i18n`, `Ctrl+K` Command Palette, storage adapters, and deterministic thumbnail baking ([`scripts/bake_thumbs.py`](scripts/bake_thumbs.py)).

---

## Active Flagship & Benchmark Examples

Start a local static HTTP server at the repository root and open [`examples/index.html`](examples/index.html) (or [`index.html`](index.html)):

- **`examples/rl-td-bench/`** *(v2 Flagship · True 4D Continuous 6-Beat Workbench)*: Rebuilds RL Chapter 7 (`TD(0) → Sarsa → 4-Q Cliff → n-step Glass Arc → Policy Fork → Diegetic Code Trace`) on a continuous 44-second `SpacetimeClock` + `ActorChoreographer`, featuring direct 3D `GridBrush` cliff painting, live Sarsa vs counterfactual Ghost Q-Learning trajectories, WebGPU + TSL + HTML-in-Canvas progressive enhancement, and one-click MP4/WebM/GIF/APNG export.
- **`examples/cache-bench/`** *(Active Benchmark · LRU vs FIFO 4-Act Workbench)*: Contrasts `1 ns` SRAM hits against `100 ns` DRAM misses on identical traces across 4 acts with `LinkBus` part-to-table highlighting, live `ChartCard.updateXY` hit-rate vs `ghost` baseline curves, and collapsible live AMAT substitution *(scheduled for v2 upgrade in a later wave)*.
- **`examples/hysteresis-bench/`** *(Active Benchmark · Physical × Math Dual Workbench)*: Shows how a single switching threshold triggers high-frequency relay chatter under sensor noise, then widens the $\Delta T$ hysteresis band across 3 acts while synchronizing the bimetallic strip, heater glow, phase-space loop, and switching inequality table *(scheduled for v2 upgrade in a later wave)*.

> **Archived v1 workbenches**: Earlier v1 examples (including `prob-stat-ch5-bench`) are preserved cleanly with full git history and standalone runnable files under [`examples/archive/`](examples/archive/README.md).

---

## Quick Start & CLI Tools

Requires Python 3.10+ (or `uv`) and Node.js 20+. No bundler or external CDN is needed:

```bash
# 1. Extract offline Three.js WebGPU + TSL + legacy ESM bundle into examples/shared
python3 scripts/setup_vendor.py examples/shared

# 2. Run full Node syntax, link-integrity, v1 & v2 unit test suite
npm test

# 3. Verify 3 viewports + v2 4D quality gates (--strict-4d)
uv run scripts/verify_stage.py --root . --entry examples/rl-td-bench/index.html --strict-4d

# 4. Bake deterministic 2x thumbnails from live scenes (supports manifest `t` + `exportMode`)
uv run scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json

# 5. Export deterministic 4D video / GIF from CLI (Tier 2 studio exporter)
uv run scripts/export_video.py --root . --entry examples/rl-td-bench/index.html \
  --out dist/rl-td.mp4 --preset 1080p60 --hud caption --formats mp4,gif
```

---

## Repository Structure

```text
simulify/
├── SKILL.md                  # Agent Skill workflow, fidelity rules & v2 4D gates
├── LICENSE                   # MIT License
├── kit/                      # Layer 1: Zero-build 4D spacetime, choreography, WebGPU/TSL 3D stage,
│   │                         #          HTML-in-Canvas surfaces, 3D manipulators, charts, live maths
│   └── export/               # Lazy pure-JS MP4/WebM/GIF/APNG muxers & dual-path compositor
├── primitives/               # Canonical domain 3D primitives (e.g. rl-primitives.js)
├── shell/                    # Layer 2: Opt-in i18n, Ctrl+K command palette, storage adapters, mastery bar
├── scripts/                  # setup_vendor.py, verify_stage.py (--strict-4d), bake_thumbs.py, export_video.py
├── references/               # Fidelity, Time Dimension (T1–T4), Topic Fit, Design System, Stage Architecture
├── examples/                 # Active showcase (rl-td-bench v2 flagship, cache-bench, hysteresis-bench)
│   └── archive/              # Archived v1 workbenches preserved with history (prob-stat-ch5-bench)
└── tests/                    # Full Node ESM unit, muxer, syntax & link-integrity test suite
```
