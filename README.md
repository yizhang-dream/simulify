<h1 align="center">Simulify</h1>

<p align="center">
  <b>Interactive 3D/4D Mechanism, Cutaway &amp; Simulation Explainer &nbsp;|&nbsp; 1:1 Native Truth &nbsp;|&nbsp; Offline Web &amp; Desktop Ready</b>
</p>

<p align="center">
  An open-source AI Agent Skill &amp; zero-build kit for teaching physical assemblies, algorithms, hardware/protocol flows, and whole multi-act chapters via 1:1 isomorphic 3D/4D cutaways, scrubbable timelines, live equation substitution, and falsifiable counterfactual controls instead of passive text walls or oversimplified metaphors.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <a href="https://simulify.xn--ltr42g543b.cn/">Live Gallery</a> · <a href="SKILL.md">Agent Skill Spec</a> · <a href="INSTALL.md">Install</a> · <a href="examples/index.html">Local Examples</a> · <a href="#quick-start">Quick Start</a>
</p>

---

## Why Simulify? (Benchmark Against Sibling Explainers)

| Explainer Family | Native Medium | Core Strength | Where Simulify Steps In |
| :--- | :--- | :--- | :--- |
| Plain Text Wall | Paragraphs | Fast to print | Fails on 3D geometry, timing, feedback loops, and coupled rules |
| `answer-me-with-html` | 2D HTML + Tables + Flow | Ultra-low-token readable one-page explanations | Static once built; learners cannot perturb parameters and observe 3D dynamics |
| `archify` | Validated 2D SVG Diagrams | Exact architecture, sequence, ERD & lifecycle maps | Best for 2D structural topology (compare its `cache-miss` sequence with `examples/cache-bench/`) |
| `atlas-textbook` | Interactive HTML Book | Question-chained `carries`/`hook`/`relates` chapters & clean prose | Inspires Simulify's multi-act chapter chaining & anti-AI-slop discipline inside explorable workbenches |
| **`simulify`** | **3D Spatial + 4D Time + Formal Dual Views** | **Playable counterfactual workbenches driven by a single `solve()` engine** | Spatial cutaways, deterministic multi-act timelines, live formula substitution, & falsifiable failure modes |

---

## Core Design Principles

1. **1:1 Native Truth Fidelity (No Toy Oversimplification)**:
   - Audit every topic against 4 Native Truth Axes before drawing a pixel:
     - **Axis 1 · Physical / Spatial**: True 3D cutaways, X-Ray traces, and mis-wiring consequences (no forced math cards).
     - **Axis 2 · Logic / Code / Protocol**: Precision 2D field/sequence dissectors or hardware interlocked with live code lines.
     - **Axis 3 · Math / Optimization / RL**: Precision formal coordinate/tree workspaces with permanent [`LiveMathsPanel`](kit/live-maths.js) substitution.
     - **Axis 4 · Physical × Math Dual**: 3D bench coupled live with schematics, phase plots, and collapsible equations from one `solve()`.
2. **Time Dimension (`T1–T4`) & Chapter Span**:
   - Supports **T1** slow-mo transient scrubbing (`PhaseScrubber`), **T2** continuous evolution + jump-to-steady, **T3** deterministic multi-step jumps (`TimelineDirector`), and **T4** whole-chapter progressive assembly so stages accumulate objects and couplings Act by Act instead of staying sparse.
3. **Atlas Question Chains (`carries` / `hook` / `relates`)**:
   - Each act picks up the unresolved bottleneck (`carries`) from the prior act and ends with a falsifiable question (`hook`) leading naturally to the next.
4. **Reusable Domain Primitives + Optional Platform Shell (`shell/`)**:
   - Ships zero-dependency modules for offline **i18n**, **`Ctrl+K` Command Palette**, **Mastery Progress**, pluggable **Storage Adapters** (Web `localStorage` or Desktop Electron/Tauri IPC), and **headless WebP/PNG Thumbnail Baking** (`?thumb=1`).

---

## Benchmark Examples Included

Run an offline HTTP server inside `simulify/` and inspect [`examples/index.html`](examples/index.html):

- **`examples/rl-td-bench/`** *(Flagship Whole-Chapter 5-Act Bench · Concept A 2.5D Instrument)*: Covers RL Chapter 7 (`TD(0) → Sarsa → n-step → Q-Fork → Unified Code`) with a brushed aluminum + recessed `-100` crimson chasm tray, 4-facet beveled Q tiles, floating frosted-glass 3D `n-step` arc, live `TD Fork` schematic, synchronized Python trace, and live Oracle falsification suite.
- **`examples/cache-bench/`** *(Direct benchmark to 2D sequence diagrams)*: Turns cache hits/misses into a **4-Act 3D Dual-Bay Memory Workbench** comparing `LRU` vs `FIFO` side by side (`1 ns` SRAM vs `100 ns` DRAM trays), `LinkBus` part-to-table highlighting, live `ChartCard.updateXY` hit-rate vs `ghost` baseline curve, and collapsible live $\text{AMAT}$ equation substitution.
- **`examples/hysteresis-bench/`** *(Physical × Math Dual Simulation Workbench)*: Demonstrates why a **single switching threshold triggers rapid relay chatter** in noisy physics, then lets you expand the **$\Delta T$ hysteresis band** across 3 acts while watching a physical bimetallic strip, LED/heater glow, phase-space loop, and switching inequality table update from one simulation core.
- **`examples/prob-stat-ch5-bench/`** *(Whole-Chapter 5-Act Probability & Statistics Instrument Bench)*: Unifies $L^2$ conditional expectation projection & MSE decomposition, discrete counts with finite-population correction, non-monotonic square transforms & tower law, Poisson–Gamma duality / Pareto heavy tails, and 3D $\chi^2 / t / F$ sampling domes with a 4/4 live falsification Oracle.

---

## Quick Start & CLI Tools

Requires Python 3.9+ and Node.js 20+ (plus Python `playwright` for headless verification & thumbnail baking). No bundler or internet CDN needed:

```bash
# 1. Extract offline Three.js ESM vendor bundle into a lesson folder
python scripts/setup_vendor.py examples/shared

# 2. Run unit & syntax checks (kit + shell + examples)
npm test

# 3. Verify 3 viewports (1280x800, 1440x900, 390x844) + deep-link probes
python scripts/verify_stage.py --root . --entry examples/cache-bench/index.html --probe "?stage=act-3&end"

# 4. Bake deterministic 2x thumbnails from live scenes (?thumb=1)
python scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json
```

---

## Repository Structure

```text
simulify/
├── SKILL.md                  # 1 human concept pick + 3 code-enforced constraints
├── LICENSE                   # MIT License
├── kit/                      # Layer 1: Zero-build 3D/2D stage, timeline, link-bus, XY chart, live maths, CSS tokens
├── primitives/               # Canonical crafted domain primitives (e.g. rl-primitives.js)
├── shell/                    # Layer 2: Opt-in i18n, Ctrl+K command palette, storage adapters, mastery progress
├── scripts/                  # setup_vendor.py, verify_stage.py (Quality Oracle CLI), bake_thumbs.py
├── references/               # Fidelity, Time Dimension (T1–T4), Topic Fit, Design System, Stage Architecture
├── examples/                 # Offline benchmark gallery (shared vendor + baked thumbs + rl-td-bench + cache-bench + hysteresis-bench)
└── tests/                    # Node ESM unit & integrity test suite
```
