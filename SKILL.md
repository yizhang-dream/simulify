---
name: simulify
description: >-
  Build offline interactive isometric lessons and 3D/4D visual explainers (self-contained static
  bundles) inspired by Dilum Sanjaya's Primers (Backcountry 101 / Algo Lab / System Design).
  Separates pure lesson authoring (`lesson.md`: cognitive arc, misconceptions, step/explain/tips,
  and isometric diorama metaphor for abstract topics) from 3D look-dev and UI assembly.
  Defaults to the `primer-lesson` guided course shell (left collapsible rail, top orbit/playback/progress
  pills, tabletop diorama backdrop, focused single-pin callouts, right Steps/Explain/Tips card,
  bottom stage stepper, plus Steps & Explore modes), while retaining scientific workbench profiles
  (`mechanical-3d`, `field-math`, `sandbox-direct`) when equations and counterfactual falsification
  are genuinely needed. Use for interactive 3D lessons, step-by-step skill guides, abstract system
  dioramas, cutaway mechanisms, or explorable simulations. Do not use for pure 2D flowcharts
  (use archify), launch videos (use onetake), or decorative 3D backgrounds.
---

# Simulify v3.1 — Guided Isometric Primer Lessons & 3D/4D Workbenches

> **Suite Role**: **`answer-me-with-html`** explains via 2D prose/tables; **`archify`** draws 2D architecture/flow diagrams; **`atlas-textbook`** builds interactive readable books; **`onetake`** produces motion videos; **`simulify`** builds **offline interactive isometric lessons (`primer-lesson`, default)** and **3D/4D scientific workbenches (`mechanical-3d` / `field-math` / `sandbox-direct`)** — turning both concrete skills (e.g., wilderness survival, mechanisms) and abstract topics (e.g., algorithms, system architecture, workflows, mental models) into crisp tabletop diorama lessons that genuinely feel like taking a great class.

---

## Core Philosophy: Lesson First, 3D Second (先上课，后建模)

Why 3D explainers often feel like cold "parameter museums" instead of a great class: the model spends 85% of its attention on shaders/sliders and skips teaching. **Simulify v3.1 enforces a hard separation between Lesson Authoring and 3D Production:**

1. **Default Primary Track — `primer-lesson` (Dilum Primers Guided Course Shell)**
   - Modeled on the crisp, calm UX of `dilum.dev/primers` (`Backcountry 101`, `Algo Lab`, `System Design`):
     - **Left collapsible dark rail** (`kit/primer-lesson.js` + `kit/primer-lesson.css`) with multi-lesson quick links & filterable course catalog modal.
     - **Top 3-pill floating header**: emblem + title/subtitle; camera orbit (`↺ / compass / ↻`) + playback (`⏮ / ⏸ / 1×..2×`); green progress pill (`3/6`).
     - **Full-bleed warm tabletop diorama**: subtle SVG topographic contour or isometric grid backdrop (`topo` | `iso-grid` | `paper`), tactile cel/inked 3D models, and **focused single-pin callouts** (`FocusPinLayer`: dark pill + thin white leader + target ring — 1–2 active pins per step, never label spam).
     - **Right floating lesson card** with generous whitespace and 3 clean tabs:
       - `步骤` (or `识别` in `explore` mode): stage title, human-voice summary, vertical numbered sub-step timeline (green checkmarks, orange active card), plus a concise teacher cue box.
       - `讲解`: genuine causal teaching prose (why this step exists, optional KaTeX formulas, and optional "先想一想 / Pause & Predict" Socratic reveal card).
       - `提示`: 2–4 sharp practical tips / misconception warnings.
     - **Bottom horizontal stage stepper**: course selector chip + numbered stage cards with green completion badges, orange active border, and `‹ ›` buttons.
   - **Two Pedagogical Modes**:
     - `mode: 'steps'` — guided step-by-step walkthrough with auto-play (`1× / 1.5× / 2×`) or self-paced stepping.
     - `mode: 'explore'` — playback hides, scene spreads components across the tabletop, learners click list items or 3D objects (`attachExplorePicking`) to inspect them.
   - **Seamless State-to-State Continuity (No Hard-Cut Popping)**:
     - Never switch diorama parts with abrupt `mesh.visible = true/false` or instant material hex jumps between consecutive steps. Use `DioramaAnimator` from `kit/primer-lesson.js` (`trackPresence`, `trackColor`, `trackScalar`, `step(dt)`, and `snap()` inside `onSeek`) so every entering/exiting object lands/lifts smoothly with subtle stagger, colors blend continuously (e.g., thermal heating/cooling), flows ramp smoothly, and deterministic `seek()` remains exact.
   - **Concrete vs. Abstract Topics**:
     - Concrete skills/objects (firecraft, knots, mechanisms) → model the real objects directly step-by-step.
     - Abstract topics (algorithms, distributed systems, protocols, workflows, decision models) → **never force fake differential equations**; translate the core tension into an **isometric miniature block/pipe/actor diorama** (like `Algo Lab` / `System Design`) and step through how state moves.
   - **Personal Deliverables Stay Separate**: put finished personal courses in a dedicated repo/folder (e.g., `c:\Users\zyz\my-primers/<slug>`) using `--with-vendor` — never mix personal course creations into the `simulify` engine repository's `examples/`.

2. **Optional Scientific Track — Workbench Profiles (`mechanical-3d`, `field-math`, `sandbox-direct`)**
   - Use only when the topic genuinely requires continuous numerical solving (`createSimModel()` + `solve(params, t)`), live parametric plots/fields, or structured physical counterfactual tests (`falsifyCases`).
   - For precision `mechanical-3d` assemblies, lock a shared `DIMENSIONS` constant table and an orthographic Front / Side / Top blueprint before authoring Three.js geometry; `primer-lesson`, `field-math`, and `sandbox-direct` are exempt from three-view blueprints.
   - Supports 3 layouts (`fullbleed-hud` | `split-bench` | `ab-compare`) and 6 CSS skins across 2 aesthetic rendering tiers ([references/design-system.md](references/design-system.md)):
     - **Primer Tactile Illustration** (`paper-ink`, `monochrome-print`): `NoToneMapping`, Selective IBL, object-ID 8-direction circular-AA outlines (`#1f160f`), soft PCF (radius 4.2).
     - **Studio Precision PBR** (`dark-studio`, `obsidian-gallery`, `bio-cutaway`, `blueprint`): `StudioLightformerEnvironment`, `NeutralToneMapping`, native 4× MSAA, tight shadows.

---

## Tactile Diorama Craft & Three.js r187 Guardrails

- **Generous Bevel Law (10%–18%)**: In Primer skins (`paper-ink`, `monochrome-print`), bevel solid blocks, bases, housings, and diorama tiles by 10–18% of thickness (`bevelSegments: 3–4`, `curveSegments: 24–32`). Compose parts with [`kit/geo-sculpt.js`](kit/geo-sculpt.js) and [`primitives/`](primitives/) rather than raw sharp-edged cubes.
- **Satin vs. Chrome Separation**: For `paper-ink` / `monochrome-print`, use PMREM `sigma: 0.030`, satin metal `roughness: 0.30–0.36`, soft PCF shadows (`radius: 4.2`, opacity `0.25`), and rounded ink nib (`thickness: 1.3`, `normalThreshold: 0.42`; set `inkNormals: 'none'` on curved/toothed meshes if internal creases get noisy).
- **Hard Anti-Slop & r187 Rules**:
  - **Never wash matte dielectrics with global `RoomEnvironment`**: in Three.js r187, `scene.environment` ignores `material.envMapIntensity`. Keep `envMap = null` on matte clay/wood/stone/paper; bind studio `envMap` ONLY on reflective metals/glass.
  - **Never use mud-zone intermediate metalness (`0.2–0.7`)** or blurry `128²` noise bump maps that turn matte into greasy plastic.
  - **Never wash out fields/heightfields with `emissive > 0` albedo lift**; never call `bumpMap(proceduralPositionLocalNode)` in r187 TSL.
  - **Always call `stage.fitShadowFrustum(root)`** after mounting initial geometry, and keep typography offline/sharp via `kit/fonts/` and optional `kit/katex/` (zero CDN, zero broken Unicode micro-subscripts `ₜ`/`ₙ`, zero AI-cliché filler prose).

---

## Step 0 · Pure Lesson Authoring (`lesson.md` — NO 3D/CSS Yet)

Before touching Three.js, layouts, or shaders, switch purely into **Teacher Mode** and produce/confirm `lesson.md` (for open-ended or deep courses, have 1–2 quick back-and-forth turns with the user acting as the first student):

1. **Core cognitive bottleneck**: What single misconception or "wait, why does this work?" question drives the lesson?
2. **Carrier & Mode decision**:
   - Concrete physical/procedural skill → 1:1 miniature object modeling (`primer-lesson`, `steps` or `explore`).
   - Abstract concept/system/methodology → design a clear **isometric diorama metaphor** (blocks, pipelines, tokens, actors, weights) — or, if no natural spatial metaphor exists, honestly recommend a 2D explainer (`archify` / `answer-me-with-html`) instead of forcing floating boxes.
   - Continuous physics/math law → opt into scientific workbench (`mechanical-3d` / `field-math` / `sandbox-direct`).
3. **Stage & Sub-step Ledger (4–6 Stages)**:
   - For each stage: `title`, `summary` (2 concise sentences), `2–4 sub-steps` (each specifies **exact visual delta** on the tabletop + **1 focused pin** + concise `cue`), `explain` (genuine causal reasoning, optionally with a `think: { question, answer }` Socratic card), and `tips` (2–3 mistake-prevention rules).
   - **Rule of restraint**: Only reveal the objects and at most 1–2 optional inline controls needed for *this* stage. Never dump the finished machine + 6 sliders on frame 1.
4. Pause to confirm the lesson arc on open-ended requests unless the user asked to build immediately.

---

## Step 1 · Scaffold & Assemble Offline

> **Delivery Reality**: Every Simulify deliverable is a **zero-CDN offline static directory** (ESM + local Three.js/fonts/optional KaTeX). Serve over local HTTP (`python -m http.server`); ESM cannot run over `file://`.

1. **Check APIs once** in [`kit/index.d.ts`](kit/index.d.ts).
2. **Scaffold via `<PLUGIN_ROOT>/scripts/new_bench.py`** (for personal courses outside `<PLUGIN_ROOT>`, always pass `--with-vendor`, and add `--no-katex` when equation-free):
   ```bash
   # Default Dilum-style guided isometric lesson (standalone offline bundle):
   python "<PLUGIN_ROOT>/scripts/new_bench.py" "<my_primers_dir>/<slug>" --title "我的交互课" \
     --profile primer-lesson --layout primer-lesson --skin paper-ink --with-vendor --no-katex

   # Optional scientific workbench mode (equations + falsifyCases):
   python "<PLUGIN_ROOT>/scripts/new_bench.py" "<target_dir>" --title "My Workbench" \
     --profile mechanical-3d --layout split-bench --skin paper-ink --with-vendor
   ```
3. **Wire the lesson (`primer-lesson` default)**:
   - Author structured lesson content in `lesson-data.js` (directly faithful to `lesson.md`).
   - Mount `mountPrimerLesson(document.querySelector('#app'), { ...COURSE, onStateChange })` from [`kit/primer-lesson.js`](kit/primer-lesson.js), create `IsometricStage` with `gridStyle: 'none'` (letting the thematic SVG diorama backdrop breathe cleanly underneath), and call `shell.attachStage(stage)`.
   - Drive smooth visibility/position/state deltas per `(stageIndex, stepIndex)` and call `shell.setPins([...])` with 1–2 crisp focus pins per step.
   - Expose verification hooks:
     ```js
     exposeTestHooks({ version: 3, profile: 'primer-lesson', stage, lessonShell: shell });
     ```
4. **Static Look-Dev Gate (Before Adding Extra Polish)**:
   - Verify silhouette readability, generous rounded bevels, warm ink contrast, shadow frustum tightness, and calm UI breathing room on the desktop + mobile viewport before finalizing.

---

## Step 2 · Verify (Profile-Aware Oracle + Real Visual Inspection)

```bash
node "<PLUGIN_ROOT>/tests/run-tests.mjs"
# Standalone --with-vendor course bundle:
uv run "<PLUGIN_ROOT>/scripts/verify_stage.py" --root "<target_dir>" --entry index.html --dpr 2 --probe "?stage=1"
```

- **Universal Hard Gates (`verify_stage.py`)**: zero console/page/request/WebGPU errors; active non-blank 3D stage; zero horizontal or guide overflow; zero HUD overlaps (`.pl-topbar`, `.pl-card`, `.pl-bottom-dock`); offline fonts crisp (`typography-crispness`); zero AI-cliché prose (`prose-lint`); magenta guard; `camera-ownership` and `temporal-scrub-determinism`.
- **Profile Gate Matrix** ([references/engine-contract.md](references/engine-contract.md)):
  - `primer-lesson`: focuses on clean rendering, stage progression scrub, camera ownership, prose/layout/look-dev quality; `mandatory_falsify`, `three_views`, `initial_sparsity`, and `geometry_diversity` are advisory (not forced on procedural or abstract diorama courses).
  - `mechanical-3d`: enforces `geometry-diversity`, `three-views`, `initial-sparsity`, `mandatory_falsify`, `camera-ownership`, `temporal-scrub`.
  - `field-math` & `sandbox-direct`: enforce `mandatory_falsify`, `camera-ownership`, `temporal-scrub`.
- **Mandatory Visual & Pedagogical Eyes (Never Replaced by Exit Code `0`)**:
  - Open and inspect `*-contact-sheet.png`, full stills, `*-closeup.png`, and mobile shots yourself.
  - Check **both craft and class feel**: Does the tabletop look crisp and calm (not cluttered)? Does stepping from Stage 1 → Stage N genuinely read like a thoughtful teacher guiding you step by step?

---

## Reference Map (Load On Demand)

- [`kit/index.d.ts`](kit/index.d.ts) — Single-file TypeScript API contract for every public `kit/` export (including `primer-lesson.js`).
- [references/grounding-discovery.md](references/grounding-discovery.md) — Step 0 lesson grounding, misconception mining, source transparency.
- [references/topic-fit.md](references/topic-fit.md) — `primer-lesson` vs. workbench selection guide, layouts & skins.
- [references/design-system.md](references/design-system.md) — 6 CSS skins, Primer tactile roundness craft, offline fonts & KaTeX.
- [references/engine-contract.md](references/engine-contract.md) — Render layers, `exposeTestHooks`, `verify_stage.py` profile gate matrix.
- [references/fidelity-isomorphism.md](references/fidelity-isomorphism.md) — Mechanical three-view blueprints & anti-cuboid sculpting map.
- [references/time-dimension.md](references/time-dimension.md) — Multi-stage pacing, progressive reveal & anti-cliché prose rules.
- [references/stage-architecture.md](references/stage-architecture.md) — Repository layout & render pipeline.
