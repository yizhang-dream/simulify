---
name: simulify
description: >-
  Turn a mechanism, physical structure, mathematical law, or dynamical system into an offline
  interactive 3D/4D workbench (self-contained static bundle) — even from a short 5–20 word prompt
  or raw paper/notes/code/screenshot. Performs silent grounding discovery & misconception mining,
  scaffolds cleanly via `scripts/new_bench.py`, drives every view from one `createSimModel()`
  `solve()` truth with structured counterfactual falsification, and renders sculpted 3D/cutaways,
  fields, direct manipulation, offline four-tier typography & KaTeX across 3 profiles
  (`mechanical-3d`, `field-math`, `sandbox-direct`), 3 layouts, and 6 CSS skins.
  Primer skins use rounded tactile geometry and satin lighting.
  Use whenever 2D prose (answer-me-with-html), 2D diagrams (archify), or interactive books
  (atlas-textbook) cannot expose 3D spatial occlusion, continuous causal evolution, or hands-on
  "what-if" dynamics — or when the user asks for 用 3D 讲 / 做个 3D 或 4D 交互演示 / 拆解内部结构 /
  做成可调参实验台 / 拖时间轴看过程 / 动起来看原理 / 仿真拆解 / interactive 3D explainer /
  explorable simulation / cutaway view. Do not use for pure 2D flowcharts (use archify), motion
  video production (use onetake), mini-games, or decorative 3D backgrounds.
---

# Simulify v3.1 — Grounded 3D/4D Mechanism & Scientific Workbench

> **Suite Role**: **`answer-me-with-html`** explains via 2D prose/tables; **`archify`** draws 2D architecture/protocol/flow diagrams; **`atlas-textbook`** builds readable interactive books; **`onetake`** produces motion videos; **`simulify`** focuses strictly on **offline, single-truth 3D/4D simulation workbenches** across **3 focused profiles, 3 layouts, and 6 unified CSS skins (2 aesthetic rendering tiers)** — turning short prompts or raw study materials into crisp, directly manipulable models that expose *why* a mechanism works and *how* it breaks.

---

## Core Craft Laws

1. **Single-Truth `createSimModel()` & Failure-Mode Verification (No Fake Animations)**
   - Drive every 3D transform, field contour, chart curve, and live equation number from ONE deterministic `solve(params, t)` inside [`kit/model-core.js`](kit/model-core.js) (`createSimModel`, plus `rk4Step` / `integrateRK4` / `bisectRoot` when dynamics need numerical integration).
   - Every bench ships with **structured failure modes / stress tests (`falsifyCases`)** executed by `model.falsify()`: the runtime re-runs `solve()` on baseline vs. mutated parameters and checks **independent physical/mathematical invariants** (conservation laws, monotonicity, critical thresholds, zero-input rest — never copy `solve()` formulas to self-validate, and never ship hardcoded `{ passed: true }` stubs).

2. **Focused 3D/4D Form & Two Aesthetic Rendering Tiers (Zero Feature Bloat)**
   - Pick **1 of 3 Profiles** so the oracle enforces what actually matters:
     - `mechanical-3d` — precision assemblies, linkages, cutaways, anatomy (locks `DIMENSIONS` + orthographic three-view blueprint + anti-cuboid gate).
     - `field-math` — scalar/vector fields, loss/phase surfaces, optimization, RL, PDE/wave phenomena.
     - `sandbox-direct` — hands-on instruments and coordinate spaces that open immediately manipulable.
   - Pick **1 of 3 Layouts** (`fullbleed-hud` | `split-bench` | `ab-compare`; `zen` is a universal HUD-hide toggle via `toggleZenMode`) and **1 of 6 CSS Skins** split cleanly across **2 Aesthetic Tiers** ([references/design-system.md](references/design-system.md)):
     - **Primer Tactile Illustration** (`paper-ink`, `monochrome-print`): `NoToneMapping`, Selective IBL (matte dielectrics keep `envMap = null`), Next-Gen Object-ID + 8-direction circular-AA + `userData.ink` / `inkThin` outline pass, warm sepia ink `#1f160f`, analytical `fwidth()` ground grid, soft PCF (radius 4.2) + Gaussian contact shadow.
     - **Studio Precision PBR** (`dark-studio`, `obsidian-gallery`, `bio-cutaway`, `blueprint`, or `mechanical-3d` realistic mode): procedural `StudioLightformerEnvironment` (`sigma <= 0.01`), `NeutralToneMapping`, native 4× MSAA with `outline: 'none'` (relying on crisp chamfers/bevels + tight `Box3` shadows).
   - **Anti-Kitchen-Sink discipline**: consult [`kit/index.d.ts`](kit/index.d.ts) first and import only the 2–4 modules the core insight genuinely needs.

3. **Intentional Time & Direct Agency**
   - Drive all continuous evolution from one `SpacetimeClock` + `SimulationTape` (`captureGhost()` for baseline ghost overlays) and `ActorChoreographer` (pure functions of `t`, calling `stage.setCameraFromScript(pose)` so user drag never loses camera ownership).
   - Progressive reveal is a storytelling tool for multi-beat mechanisms, not a forced 4-act tax: `sandbox-direct` and `field-math` may open straight onto the live, directly draggable workspace (`kit/manipulator.js`).

4. **Sculpted Craft, Hard Anti-Slop & Three.js r187 Guardrails**
   - Compose physical mechanisms from [`kit/geo-sculpt.js`](kit/geo-sculpt.js) (lathed solids, gears, coils, conduits, bevelled profiles, deformable strips, heightfields, 45° stencil cutaways), [`kit/field-viz.js`](kit/field-viz.js), and reusable [`primitives/`](primitives/) — never stacked `BoxGeometry` Lego blocks. Glow never makes primitives look crafted: build authored forms first, then materials, then lighting, then motion.
   - **Hard Anti-Slop & r187 Rules**:
     - **Never wash matte dielectrics with global `RoomEnvironment`**: in Three.js r187, `scene.environment` silently ignores `material.envMapIntensity`! Use Selective IBL (`material.envMap = null` on matte clay/ceramic/travertine/rubber; studio softbox `envMap` ONLY on metals, enamel clearcoat, and glass).
     - **Never use mud-zone intermediate metalness (`0.2–0.7`)** or blurry `128²` `DataTexture` roughness/bump maps that slash matte roughness into shiny plastic. Separate material roles by **roughness/metalness contrast**, not hue alone.
     - **Never wash out mathematical heightfields/fields with `emissive > 0` albedo lift**: render shaded `MeshPhysicalMaterial` (`roughness ~0.44`, subtle `clearcoat ~0.24`, `emissiveIntensity: 0`) plus crisp analytical `fwidth()` iso-contours.
     - **Never call `bumpMap(proceduralPositionLocalNode)` in r187 TSL** (evaluates to zero because `bumpMap()` only perturbs `uv()`); use direct surface-gradient derivatives or TSL `roughnessNode`/`colorNode` micro-variation instead.
     - **Always call `stage.fitShadowFrustum(...)`** after mounting initial geometry so >50% of shadow map texels cover real meshes, and frame subjects tightly enough that bevels/chamfers span **≥ 2 px** on screen.
   - Keep typography razor-sharp and zero-CDN via `kit/fonts/` (`Newsreader` + `Noto Serif SC` / `Inter` + `Noto Sans SC` / `JetBrains Mono`) and offline KaTeX (`kit/katex/`). Never hand-type broken Unicode micro-subscripts (`ₜ`, `ₙ`, `ᵏ`) or `< 11.5px` micro-labels.
   - Default to the stable WebGL2/WebGPU + DOM/CSS HUD & Callout pipeline. Experimental 3D HTML-in-Canvas ([`kit/html-surface.js`](kit/html-surface.js)) is **strictly opt-in** when diegetic 3D panels are truly needed.

---

## Primer Tactile Roundness Craft (圆润手办造型规范)

- **Generous Bevel Law (10%–18%)**. In Primer mode, bevel solid blocks, bases, housings and cutaway caps by 10–18% of local thickness. Use `bevelSegments: 3–4` and `curveSegments: 24–32`. Use spline-smoothed or filleted lathe profiles on bell housings and tire shoulders. Finish shafts with domed ends (`CapsuleGeometry` or a rounded lathe profile). Every visible cutaway rim needs a readable rounded bevel.
- **Satin vs Chrome Separation**. For `paper-ink` and `monochrome-print`, use PMREM `sigma: 0.030`, satin metal `roughness: 0.30–0.36` and `metalness: 0.78–0.85`, and warm soft PCF shadows (`radius: 4.2`, receiver opacity `0.25`). The default `primer` outline uses a rounded nib (`thickness: 1.3`, `normalThreshold: 0.42`). Use `inkNormals: 'none'` on curved or multi-tooth parts when internal creases get noisy. Reserve sharp highlights (PMREM `sigma: 0.008`, polished metal `roughness: 0.18–0.24`, PCF `radius: 1.65`) for Studio Precision PBR skins.

---

## Step 0 · Discover & Ground (Assume Short Prompts by Default)

Follow [references/grounding-discovery.md](references/grounding-discovery.md) before designing:

1. **Short prompt (5–25 words, no files)**:
   - Silently assemble a compact **Grounding Brief**: (a) governing equations & realistic parameter ranges, (b) canonical learner misconceptions (fuel for Ghosts & `falsifyCases`), (c) component BOM & degrees of freedom / occluded internals, and (d) the single strongest visual "Aha" hook.
   - Ask **at most 1 high-information-gain question** targeting *which cognitive bottleneck to crack* (2–3 concrete angles, recommended default first) — never interrogate the user about skins or layouts. If the user says "just build it", skip the question and state a 3-line assumption card.
2. **Raw material (paper, notes, code, screenshot)**:
   - Extract the 4-piece skeleton: Baseline failure → 3D spatial/causal topology → 1–2 governing equations & parameters → Failure/ablation mode.
3. **Source transparency**: Tag key proportions/parameters as `[Verbatim / Measured]`, `[Canonical]`, or `[Pedagogical Scale]` (disclose visual exaggeration honestly on the scale bar or caption).

---

## Step 1 · Lock Direction & Blueprint

1. **Propose 1–3 clear explanatory directions** (concise prose or compact table):
   - **Core cognitive hook & `solve(params, t)` model**
   - **Profile** (`mechanical-3d` | `field-math` | `sandbox-direct`) + **Layout** (`fullbleed-hud` | `split-bench` | `ab-compare`) + **Skin** (one of the 6 CSS skins)
   - **Direct manipulation** (`kit/manipulator.js`) & **2–3 numerical `falsifyCases`**
   - For multi-beat narrative builds, include a compact **Beat & Reveal Ledger** ([references/time-dimension.md](references/time-dimension.md)).
2. **Orthographic Blueprint & `DIMENSIONS` table — `mechanical-3d` ONLY**:
   - **`mechanical-3d`**: Lock a shared `DIMENSIONS` constant table (`L × W × H`, elevation datums, clearances, motion envelopes) and an orthographic Front / Side / Top blueprint (parametric/SVG preferred over hallucination-prone raster generation) before writing Three.js geometry.
   - **`field-math` & `sandbox-direct`**: Exempt from three-view blueprints; lock coordinate ranges, axis units, and spatial bounds directly in `model.js` constants.
3. **Pause for user lock** on open-ended or high-effort builds unless the user explicitly asked to proceed immediately.

---

## Step 2 · Scaffold & Assemble Offline

> **Delivery Reality**: A Simulify deliverable is a **zero-CDN offline static directory** (ESM + local Three.js/fonts/KaTeX). Serve it over any local HTTP server (e.g. `python -m http.server`); ESM modules cannot run over `file://`.

1. **Check exact API signatures once** in [`kit/index.d.ts`](kit/index.d.ts) instead of guessing across 20 files.
2. **Generate a runnable starter bench via `<PLUGIN_ROOT>/scripts/new_bench.py`** (where `<PLUGIN_ROOT>` is the directory containing this `SKILL.md`; always write `<target_dir>` in the user's workspace, never inside an installed plugin directory, and always pass `--with-vendor` when `<target_dir>` is outside `<PLUGIN_ROOT>`):
   ```bash
   # Standalone static bundle (reuses bundled offline Three.js/fonts/KaTeX/primitives with zero network; omits legacy three.module.js; add --no-katex if equation-free — also omits katex.min.css; add --serve to preview):
   python "<PLUGIN_ROOT>/scripts/new_bench.py" <target_dir> --title "My Mechanism" \
     --profile mechanical-3d --layout split-bench --skin paper-ink --with-vendor --serve
   # Or inside the simulify repo itself sharing examples/shared/vendor:
   python "<PLUGIN_ROOT>/scripts/new_bench.py" "<PLUGIN_ROOT>/examples/<slug>" --title "My Mechanism" \
     --profile field-math --layout fullbleed-hud --skin dark-studio
   ```
   Optional CJK font subsetting for compact standalone bundles:
   ```bash
   uv run --with fonttools --with brotli python "<PLUGIN_ROOT>/scripts/setup_vendor.py" <target_dir> --fonts-only --subset-cjk <target_dir>
   ```
3. **Implement the single-truth model & scene**:
   - Write `model.js` with `createSimModel({ params, solve, falsifyCases })` from [`kit/model-core.js`](kit/model-core.js).
   - Wire `main.js` using [`kit/stage-3d.js`](kit/stage-3d.js), [`kit/spacetime.js`](kit/spacetime.js), [`kit/choreography.js`](kit/choreography.js), [`kit/layout-shell.js`](kit/layout-shell.js), and [`kit/timeline-director.js`](kit/timeline-director.js).
   - Add only what the topic requires: [`kit/geo-sculpt.js`](kit/geo-sculpt.js) + [`primitives/`](primitives/), [`kit/field-viz.js`](kit/field-viz.js), [`kit/live-maths.js`](kit/live-maths.js) + [`kit/link-bus.js`](kit/link-bus.js), [`kit/manipulator.js`](kit/manipulator.js), [`kit/chart-card.js`](kit/chart-card.js), [`kit/callout-layer.js`](kit/callout-layer.js).
   - Expose hooks using the unified single-object signature:
     ```js
     exposeTestHooks({ version: 3, profile, clock, director, stage, choreographer, model });
     ```
4. **Static Look-Dev Gate (BEFORE Wiring Animation & Interactivity)**:
   - Freeze at a representative resting pose, call `stage.fitShadowFrustum(...)`, and capture BOTH a full-frame still AND a 2× center close-up crop (`*-closeup.png`, automatically emitted by `verify_stage.py`).
   - Inspect **form, material separation, shadows, and edge crispness independently of solver math**:
     - Do silhouettes, negative space, joins, and ≥2px bevels read cleanly without leaning on glow/fog?
     - Are matte dielectrics genuinely matte (zero grey IBL wash) and distinct in roughness/metalness from bare metals and clearcoat enamel?
     - Are outlines (Primer tier) smooth without 1-bit stair-stepping or outward bleed, and do thin rods use `userData.inkThin = true`?
     - Does the shadow map hug the scene tightly without detached contact shadows or acne?
   - Fix geometry, material, or lighting defects here **before** adding choreography beats, sliders, and charts — never conflate solver accuracy with visual craft.

---

## Step 3 · Verify (Profile-Aware Oracle + Look-Dev Telemetry + Real Visual Eyes)

```bash
node "<PLUGIN_ROOT>/tests/run-tests.mjs"
# For standalone --with-vendor bundles:
uv run "<PLUGIN_ROOT>/scripts/verify_stage.py" --root <target_dir> --entry index.html --dpr 2 --probe "?stage=..."
# For in-repo shared examples (root must be <PLUGIN_ROOT> so ../../kit and ../../examples/shared/vendor resolve):
uv run "<PLUGIN_ROOT>/scripts/verify_stage.py" --root "<PLUGIN_ROOT>" --entry examples/<slug>/index.html --dpr 2 --probe "?stage=..."
# Optional: 2x crisp thumbnail for gallery/cards
uv run "<PLUGIN_ROOT>/scripts/bake_thumbs.py" --root <dir> --manifest <thumbs-manifest.json>
```

- **Universal Hard Gates (`verify_stage.py`)**: zero console/page/request/WebGPU errors; active non-blank stage; zero horizontal or guide overflow; zero HUD collisions; readable visible charts; offline fonts loaded & 1:1 physical backing (`typography-crispness`); zero AI-cliché copy (`prose-lint`); structured `window.__simulify.falsify()` passing with non-empty verified assertions.
- **Profile-Conditional Hard Gates** (matrix in [references/engine-contract.md](references/engine-contract.md)):
  - `mechanical-3d`: also enforces `geometry-diversity`, `three-views`, `initial-sparsity`, `camera-ownership`, `temporal-scrub-determinism`.
  - `field-math` & `sandbox-direct`: enforce `camera-ownership` and `temporal-scrub-determinism` (when `T > 0.2s`); treat `geometry-diversity`, `three-views`, and `initial-sparsity` as advisory telemetry.
- **Look-Dev Telemetry, Magenta Gate & Contact Sheet (`verify_stage.py`)**:
  - Measures pixel metrics on the hero canvas (`colorEntropyBits`, `dominantColorShare`, `edgeDensity`, `luminanceContrast`, and hard-gated `magentaRatio <= 0.015` purple-frame detection) and reads scene telemetry (`shadowFrustum` utilization, visible mesh roughness spread, active `toneMapping`, `backend`, `dpr`, `outline` mode), flagging flat-plastic clustering, muddy contrast, or oversized shadow frustums.
  - Emits a 2× zoomed center crop (`*-closeup.png`) and a labeled multi-view contact sheet (`*-contact-sheet.png`, recorded in `receipt.contactSheet`) so edge aliasing, bevel highlights, three-views, and 390px mobile layout are immediately inspectable.
- **Mandatory Visual Inspection (never replaced by exit code `0`)**:
  - Open and inspect `*-contact-sheet.png`, the full stills, `*-closeup.png`, and Front/Side/Top/Iso views with your own eyes to verify depth clarity, material separation, proportion accuracy, and that the failure-mode stress test actually delivers the Step 0 "Aha moment".
  - For narrated/launch motion videos built from the explainer, hand off to **`onetake`**.

---

## Reference Map (Load On Demand)

- [`kit/index.d.ts`](kit/index.d.ts) — Single-file TypeScript API contract for every public `kit/` export.
- [references/grounding-discovery.md](references/grounding-discovery.md) — Step 0 short-prompt mining, multi-modal extraction, source transparency tags.
- [references/fidelity-isomorphism.md](references/fidelity-isomorphism.md) — Native Truth Axes `①–④`, anti-cuboid sculpting map, analogy rules.
- [references/topic-fit.md](references/topic-fit.md) — Topic archetypes, 3 profiles, 3 layouts & 6 CSS skins selection guide.
- [references/time-dimension.md](references/time-dimension.md) — `T1–T4` time regimes, progressive reveal vs. direct sandbox, anti-cliché prose rules.
- [references/design-system.md](references/design-system.md) — 6 CSS skins, Okabe-Ito tokens, offline typography hierarchy, KaTeX & accessibility.
- [references/engine-contract.md](references/engine-contract.md) — WebGL2/WebGPU layers, ClearType rules, `exposeTestHooks`, `verify_stage.py` profile gate matrix.
- [references/stage-architecture.md](references/stage-architecture.md) — Repository layout, `kit/` / `primitives/` / `scripts/` architecture & render pipeline.
