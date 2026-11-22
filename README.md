<h1 align="center">Simulify v2.2</h1>

<p align="center">
  <b>True 4D Interactive Mechanism, Multi-Layout Studio &amp; Scientific Field Explainer &nbsp;|&nbsp; 6 Layouts × 6 Skins &nbsp;|&nbsp; 1:1 HiDPI WebGPU + Stencil Cutaways &amp; Video/GIF Export</b>
</p>

<p align="center">
  An open-source AI Agent Skill &amp; zero-build offline ESM kit for teaching physical assemblies, algorithms, scientific fields, hardware/protocol flows, and editorial scrollytelling stories via 6 declarative layout archetypes, 1:1 isomorphic sculpted 3D cutaways, continuous reversible 4D timelines, offline four-tier WOFF2 &amp; extended KaTeX live equations, direct 3D manipulation, and deterministic MP4/WebM/GIF/APNG export.
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
| `archify` | Validated 2D SVG Diagrams | Exact architecture, sequence, ERD & lifecycle maps | Best for 2D structural topology |
| `atlas-textbook` | Interactive HTML Book | Question-chained `carries`/`hook`/`relates` chapters & clean prose | Inspires Simulify's multi-act chapter chaining & direct intuition prose inside explorable workbenches |
| **`simulify` v2.2** | **True 4D Spacetime + 6 Layout Archetypes + Volumetric 3D & Fields + KaTeX Dual Views** | **6 layouts (`split-bench`, `scrolly-stage`, `ab-compare`, `multi-view`, `fullbleed-hud`, `zen`), 6 curated skins, stencil 45° cutaways, scientific field primitives & deterministic video export** | Structured concept drafts + Front/Side/Top blueprints, progressive temporal/scroll reveal, non-cuboid micro-PBR sculpting, WebGPU + 2× HTML-in-Canvas, direct 3D editing, and layout-aware multi-beat quality gates |

---

## What's New in Simulify v2.2

1. **6 Layout Archetypes, 6 Curated Skins & Editorial Typography ([`kit/layout-shell.js`](kit/layout-shell.js), [`kit/primer-tokens.css`](kit/primer-tokens.css), [`kit/theme-studio.css`](kit/theme-studio.css))**:
   - Breaks out of single full-bleed HUD cards with 6 declarative layouts: **`fullbleed-hud`**, **`split-bench`** (side-by-side zero-occlusion workspace with `@container` queries), **`ab-compare`** (synced dual-stage side-by-side or `WipeCompareController` curtain), **`multi-view`** (Iso + live Front/Side/Top strip), **`scrolly-stage`** (Claude-inspired editorial serif `16px / 60ch` scrollytelling driven reversibly by `ScrollyBridge` + CSS Scroll-Driven progress rail), and **`zen`** (`toggleZenMode()`).
   - Preserves all 6 curated skins (`paper-ink`, `dark-studio`, `bio-cutaway`, `blueprint`, `monochrome-print`, `obsidian-gallery`) while upgrading headings & reading prose across every skin to an offline Claude-style serif cadence (`Newsreader` + `Noto Serif SC` 400 Regular / 650 Display), keeping controls crisp in `Inter` + `Noto Sans SC` and telemetry in `JetBrains Mono`.
2. **Studio Lighting Depth, True Stencil 45° Cutaways & `GLASS_LAYER = 3` ([`kit/stage-3d.js`](kit/stage-3d.js), [`kit/outline-pass.js`](kit/outline-pass.js), [`kit/geo-sculpt.js`](kit/geo-sculpt.js))**:
   - Aligns main key & shadow light directions + adds silhouette `_rimLight`, zero-extra-pass **Screen-Space Crease Ambient Occlusion** (`setAOStrength()`), radial-fade procedural ground grids (`cartesian`/`polar`/`plinth`/`none`), soft contact shadows (`addContactShadow()`), local accent lights (`createAccentLight()`), and optional Depth-of-Field (`enableDepthOfField()`).
   - Implements dual-backend (WebGPURenderer `THREE.ClippingGroup` + legacy WebGLRenderer) **Stencil 45° Cross-Hatched Cutaway Caps** (`stage.createCutawayCap()`), cached procedural micro-PBR surface maps (`createProceduralSurfaceMaps()`), and Fresnel **`createXRayMaterial()`** isolated on **`GLASS_LAYER = 3`** so transparent shells never obscure interior ink lines.
3. **Scientific Field & Dynamic Process Visualization Library ([`kit/field-viz.js`](kit/field-viz.js))**:
   - Ships 6 perceptually uniform scientific colormaps (`viridis`, `plasma`, `magma`, `coolwarm`, `thermal`, `cividis`) + `renderColorbar()`, directional pulsing `createFlowConduit()`, zero-GC 3D `createVectorField()`, reversible 4D `createDeterministicSwarm()`, `createMotionTrail()` with stroboscopic ghosts, auto-contrast camera-facing 3D engineering annotations (`createDimensionMeasure`, `createForceArrow`, `createAngleArc`), and `createContourField()` with clean matte architectural skirts.
4. **Upgraded Choreography, Extended KaTeX AST, 6-Mode Charts & 4D Track B ([`kit/choreography.js`](kit/choreography.js), [`kit/live-maths.js`](kit/live-maths.js), [`kit/chart-card.js`](kit/chart-card.js), [`kit/stage-2d.js`](kit/stage-2d.js))**:
   - [`ActorChoreographer`](kit/choreography.js) adds artifact-free `matte` / `wireframe` focus modes, `explodeGroup()`, `clipSweep()`, and `explode`/`draw`/`blueprint` transitions.
   - [`LiveMathsPanel`](kit/live-maths.js) now bundles full offline KaTeX ([`kit/katex/katex.mjs`](kit/katex/katex.mjs) + 20 `.woff2` fonts, zero CDN) with `renderTex()`, `substituteTexVars()`, and `renderMathInElement()` (auto-rendering `$...$` / `$$...$$` / `\(...\)` / `\[...\]` with currency guards across prose, panels & callouts), plus native `tex:` + `LinkBus` equations alongside 100% backward-compatible AST helpers (`mathSqrt`, `mathMatrix`, `mathCases`, `mathAccent`, `mathFence`, `mathAlign`).
   - [`ChartCard`](kit/chart-card.js) adds `distribution` (histogram + PDF + integral shading), `heatmap`, `timing` (logic analyzer), and `spark-kpi` alongside generalized `hysteresis` and persistent `xy` plots; [`SvgFlowStage`](kit/stage-2d.js) gains theme tokens, border-trimmed Bezier arrows, and deterministic 4D `setPacketSchedule()`.
5. **Layout-Aware Multi-Beat Quality Oracle & Two-Tier Offline Export ([`scripts/verify_stage.py`](scripts/verify_stage.py), [`kit/stage-exporter.js`](kit/stage-exporter.js), [`scripts/export_video.py`](scripts/export_video.py))**:
   - [`scripts/verify_stage.py`](scripts/verify_stage.py) adapts automatically to all 6 layout archetypes while enforcing multi-beat `hud-overlap`, `typography-crispness`, `geometry-diversity`, `three-views`, real mouse-drag `camera-ownership`, `initial-sparsity`, `temporal-scrub-determinism`, `mandatory-falsify`, and `--no-hic` parity.
   - Tier 1 in-browser zero-CDN export (`MP4`/`WebM`/`GIF`/`APNG`/`PNG` across all 6 skins) and Tier 2 CLI studio capture (`scripts/export_video.py`, `--shutter 180`).

---

## Clean-Slate True 4D Workflow (Concept Draft → Orthographic Three-View Blueprint → True 4D)

Legacy single-view-2D-derived sample benches have been cleared so the showcase starts clean under the **Three-View Volumetric 4D** standard:

1. **Structured Concept Draft (Step 1a)**: Choose Truth Axis (`①–④`), volumetric 3D structure & cutaway hierarchy, `T1–T4` beat-by-beat reveal ledger, direct manipulation, and falsification plan — no misleading single-view 2D perspective art.
2. **Orthographic Three-View Blueprint (Step 1b)**: Lock aligned **Front / Side / Top** orthographic views plus an explicit `DIMENSIONS` constant table (`L × W × H`, thicknesses, clearances, 4D motion envelopes) before writing Three.js code.
3. **True 4D Assembly & Multi-View Verification (Steps 2–3)**: Build volumetric sculpted 3D mechanisms over continuous reversible time and verify with `verify_stage.py` (multi-beat layout, crispness, geometry diversity, camera ownership, and automated **Front / Side / Top / Iso** four-view capture).

---

## Quick Start & CLI Tools

Requires Python 3.10+ (or `uv`) and Node.js 20+. No bundler or external CDN is needed:

```bash
# 1. Extract offline Three.js WebGPU + TSL + addons + four-tier fonts
python3 scripts/setup_vendor.py examples/shared
# Optional: shrink CJK WOFF2 fonts to exact glyphs used by a standalone project
uv run --with fonttools --with brotli python3 scripts/setup_vendor.py dist/my-bench --fonts-only --subset-cjk dist/my-bench

# 2. Run full Node syntax, manifest sync, link-integrity & v2.1 unit test suite
npm test

# 3. Verify 3 viewports + multi-beat + Front/Side/Top/Iso three-view & crispness/geometry/camera gates
uv run scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html
# Also verify Firefox/Safari non-HTML-in-Canvas fallback parity
uv run scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html --no-hic

# 4. Bake deterministic 2x thumbnails from live scenes (supports manifest `t` + `exportMode`)
uv run scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json

# 5. Export deterministic 4D video / GIF from CLI (Tier 2 studio exporter)
uv run scripts/export_video.py --root . --entry examples/<your-bench>/index.html \
  --out dist/demo.mp4 --preset 1080p60 --hud caption --formats mp4,gif
```

---

## Repository Structure

```text
simulify/
├── SKILL.md                  # Agent Skill spec, Concept Draft + Three-View workflow & Four Iron Laws
├── plugin.json               # Plugin manifest (v2.2.0, synced with .claude-plugin/marketplace.json)
├── LICENSE                   # MIT License
├── kit/                      # Layer 1: 1:1 HiDPI WebGPU/TSL 3D stage (aligned lights/rim/AO/cutaway caps),
│   │                         #          6-layout shell (layout-shell.js), scientific field-viz.js, 4-layer
│   │                         #          OutlinePass (GLASS_LAYER=3), 2x HtmlSurface, micro-PBR geo-sculpt,
│   │                         #          4D spacetime/choreography, 6-mode ChartCard, extended KaTeX LiveMathsPanel
│   ├── fonts/                # Offline four-tier WOFF2 font kit (Newsreader, Inter, KaTeX, JetBrains Mono + CJK)
│   └── export/               # Lazy pure-JS MP4/WebM/GIF/APNG muxers & dual-path compositor
├── primitives/               # Canonical domain 3D primitive factories built from locked Three-View DIMENSIONS
├── shell/                    # Layer 2: Opt-in i18n, Ctrl+K command palette, storage adapters, mastery bar
├── scripts/                  # setup_vendor.py (--subset-cjk), verify_stage.py (--no-hic + three-views), bake_thumbs.py, export_video.py
├── references/               # Fidelity & Geo-Sculpt, Time Dimension (T1–T4), Topic Fit, Design System, Architecture
├── examples/                 # Clean showcase gallery + shared offline Three.js vendor runtime
└── tests/                    # Full Node ESM unit, geo-sculpt, typography, muxer, syntax & link-integrity suite
```
