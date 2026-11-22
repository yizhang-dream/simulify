<h1 align="center">Simulify v2.1</h1>

<p align="center">
  <b>True 4D Interactive Mechanism, Sculpted Cutaway &amp; Simulation Explainer &nbsp;|&nbsp; 1:1 HiDPI WebGPU + HTML-in-Canvas &nbsp;|&nbsp; Offline Four-Tier Typography &amp; Video/GIF Export</b>
</p>

<p align="center">
  An open-source AI Agent Skill &amp; zero-build offline ESM kit for teaching physical assemblies, algorithms, hardware/protocol flows, and multi-act chapters via 1:1 isomorphic sculpted 3D cutaways, continuous reversible 4D timelines, offline four-tier WOFF2 &amp; KaTeX live equation substitution, direct 3D manipulation, and deterministic MP4/WebM/GIF/APNG export.
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
| **`simulify` v2.1** | **True 4D Spacetime + Three-View Volumetric 3D + KaTeX Dual Views** | **1:1 HiDPI counterfactual benches, orthographic three-view proportion lock, offline four-tier typography & deterministic video export** | Structured concept drafts + Front/Side/Top blueprints, progressive temporal reveal, non-cuboid 3D sculpting, WebGPU + 2× HTML-in-Canvas, direct 3D editing, and multi-beat + four-view quality gates |

---

## What's New in Simulify v2.1

1. **1:1 Physical Sharpness, Crisp Outlines & Camera Ownership ([`kit/stage-3d.js`](kit/stage-3d.js), [`kit/outline-pass.js`](kit/outline-pass.js), [`kit/html-surface.js`](kit/html-surface.js))**:
   - [`IsometricStage`](kit/stage-3d.js) aligns backing buffers 1:1 to `device-pixel-content-box` physical pixels (up to 3× DPR, zero fractional-DPI bilinear blur), renders on-demand (`requestRender()`, 0fps idle GPU burn), exposes `configureSharpTexture()` (up to 16× anisotropy + trilinear mipmaps), `setOutlinePreset('crisp' | 'subtle' | 'none')`, `getGeometryAudit()`, and strict user camera lock (`setCameraFromScript` never hijacks a dragged camera).
   - [`OutlinePass`](kit/outline-pass.js) delivers 1-ring physical-pixel engineering ink lines (zero wide grey halo), `NeutralToneMapping`, and separates un-tone-mapped 3D HTML surfaces onto `SURFACE_LAYER = 2`.
   - [`HtmlSurfaceManager`](kit/html-surface.js) allocates Chrome/Edge 157+ `<canvas content="drawable">` surfaces at `>= 2×` border-box / projected scale with premultiplied-linear WGSL mipmaps + 16× anisotropy + `flushPaint()`, and falls back cleanly on Firefox/Safari to an untainted pure-Canvas2D HiDPI 3D `CanvasTexture` with full 3D depth occlusion and export parity.
2. **Offline Four-Tier WOFF2 Typography & True KaTeX Math ([`kit/fonts/`](kit/fonts/fonts.css), [`kit/fonts.js`](kit/fonts.js), [`kit/live-maths.js`](kit/live-maths.js))**:
   - Bundles 18 zero-CDN `.woff2` fonts (`Newsreader` + `Simulify Display SC`, `Inter` + `Simulify Sans SC`, `KaTeX_Main/Math/Size1/Size2`, `JetBrains Mono` + CJK fallback), unified ClearType CSS (`transform: none` at rest, zero `backdrop-filter`, `>= 11.5px` legible text floor), `canvasFont()`, and `createCrispCanvasTexture()` (`>= 512px`, auto-redraw after font load).
   - [`LiveMathsPanel`](kit/live-maths.js) provides composable KaTeX math AST helpers (`mathVar`, `mathSub`, `mathSup`, `mathSubSup`, `mathFrac`, `mathOp`, `mathNum`, `mathText`, `mathGroup`) plus `normalizeUnicodeScripts()` rescue and bidirectional `LinkBus` highlighting.
   - [`scripts/setup_vendor.py`](scripts/setup_vendor.py) bundles Three.js (`three.webgpu.js`, `three.tsl.js`, `BufferGeometryUtils.js`, legacy `three.module.js`) + `kit/fonts/` and supports `--subset-cjk <project_dir>` for ultra-compact standalone CJK bundles.
3. **Cross-Domain Non-Cuboid 3D Sculpting Library ([`kit/geo-sculpt.js`](kit/geo-sculpt.js))**:
   - Ends Lego-box scenes across physics, mechanics, optics, EM, biology, protocols, and math with 5 universal sculpting families + 10 theme-aware lit PBR presets (`createSculptMaterial`, zero `MeshBasicMaterial`): turned solids (`createLathedSolid`, `createGlassVessel`, `createSculptedProbe`, `createBeaconLighthouse`), bevelled extrusions (`createBevelledProfile`, `createGearWheel`, `createHorseshoeYoke`, `createArchSpan`, `createAirfoilVane`), zero-GC deformable surfaces & beams (`createHeightfieldSurface`, `createFracturedChasm`, `createParametricSurface`, `createDeformableStrip`), and true 3D helices/conduits/bellows (`createHelicalCoil`, `createTaperedConduit`, `createPleatedBellows`).
4. **True 4D Progressive Reveal, Direct Manipulation & Persistent Charts ([`kit/spacetime.js`](kit/spacetime.js), [`kit/choreography.js`](kit/choreography.js), [`kit/manipulator.js`](kit/manipulator.js), [`kit/chart-card.js`](kit/chart-card.js))**:
   - [`SpacetimeClock`](kit/spacetime.js) (`seek()` strictly 1× dispatch) + [`SimulationTape`](kit/spacetime.js) (`sampleAt(t)` + immutable `captureGhost()`) + [`ActorChoreographer`](kit/choreography.js) (pure function of `t`, sparse `t = 0` openings).
   - [`StageManipulator`](kit/manipulator.js) & [`GridBrush`](kit/manipulator.js) add cursor sync and `bindClock()` auto-exit on act switch; [`ChartCard`](kit/chart-card.js) uses persistent pooled SVG nodes (unbroken drag scrubbing) + `movingAverageWindow` smoothing.
5. **Upgraded Multi-Beat Real-Interaction Quality Oracle & Two-Tier Export ([`scripts/verify_stage.py`](scripts/verify_stage.py), [`kit/stage-exporter.js`](kit/stage-exporter.js), [`scripts/export_video.py`](scripts/export_video.py))**:
   - [`scripts/verify_stage.py`](scripts/verify_stage.py) eliminates `t = 0.35s` false greens by sampling every act midpoint from `getTimelineInfo()` for `hud-overlap` (including `.beat-caption-pill` and 3D `HtmlSurface` `> 15%` HUD occlusion), `guideOverflow`, `horizontalTruncations`, and `chart-legibility`, plus new v2 gates: `typography-crispness`, `geometry-diversity` (`cuboidRatio <= 0.70`, `sculptedMeshes > 0`), real mouse-drag `camera-ownership` (+ 400ms hold), and `--no-hic` fallback testing.
   - Tier 1 in-browser zero-CDN export (`MP4`/`WebM`/`GIF`/`APNG`/`PNG` with live `setLang()`) and Tier 2 CLI studio capture (`scripts/export_video.py`, `--shutter 180`).

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
├── plugin.json               # Plugin manifest (v2.1.0, synced with .claude-plugin/marketplace.json)
├── LICENSE                   # MIT License
├── kit/                      # Layer 1: 1:1 HiDPI WebGPU/TSL 3D stage (with timeout WebGL2 fallback &
│   │                         #          setCardinalView), sharp OutlinePass, 2x HtmlSurface,
│   │                         #          non-cuboid geo-sculpt, 4D spacetime/choreography, manipulators,
│   │                         #          persistent ChartCard, KaTeX LiveMathsPanel, ClearType tokens
│   ├── fonts/                # Offline four-tier WOFF2 font kit (Newsreader, Inter, KaTeX, JetBrains Mono + CJK)
│   └── export/               # Lazy pure-JS MP4/WebM/GIF/APNG muxers & dual-path compositor
├── primitives/               # Canonical domain 3D primitive factories built from locked Three-View DIMENSIONS
├── shell/                    # Layer 2: Opt-in i18n, Ctrl+K command palette, storage adapters, mastery bar
├── scripts/                  # setup_vendor.py (--subset-cjk), verify_stage.py (--no-hic + three-views), bake_thumbs.py, export_video.py
├── references/               # Fidelity & Geo-Sculpt, Time Dimension (T1–T4), Topic Fit, Design System, Architecture
├── examples/                 # Clean showcase gallery + shared offline Three.js vendor runtime
└── tests/                    # Full Node ESM unit, geo-sculpt, typography, muxer, syntax & link-integrity suite
```
