---
name: simulify
description: >-
  Turn a mechanism, physical structure, hardware/protocol flow, mathematical law, or algorithm into a
  standalone offline interactive 3D/4D HTML explainer: 3D cutaways and exploded views, scrubbable 4D
  timelines across multi-act chapters, live equation substitution, synchronized XY/phase plots, and
  counterfactual parameter controls. Use whenever a flat page (answer-me-with-html), 2D diagram
  (archify), or static textbook (atlas-textbook) cannot show 3D spatial occlusion, transient or
  multi-stage time evolution, or hands-on "what-if" causal dynamics — or when the user asks for
  用 3D 讲 / 做个 3D 或 4D 交互演示 / 拆解内部结构 / 做成可调参实验台 / 拖时间轴看过程 / 动起来看原理 /
  仿真拆解 / interactive 3D explainer / explorable simulation / cutaway view. Do not use for pure
  mini-games or decorative 3D backgrounds without explanatory rules.
---

# Simulify — 3D / 4D Mechanism, Cutaway & Simulation Explainer

> **Suite Role**: **`answer-me-with-html`** explains via 2D prose/tables; **`archify`** draws structural/sequence diagrams; **`atlas-textbook`** weaves connected readable books; **`simulify`** builds **explorable 3D spatial cutaways, 4D scrubbable timelines, and live-formula simulation workbenches** where learners tweak parameters, scrub time backward/forward, and test failure modes firsthand.

Simulify enforces quality through **1 human visual decision + 3 code-enforced engineering constraints** rather than long prose checklists:

---

## Step 1 · Native Truth Audit & 3 Visual Concepts (Only Human Checkpoint)

Before writing HTML or Three.js scene code:
1. Lock the orthogonal coordinate choices:
   - **Native Truth Axis (`①–④`)** in [fidelity-isomorphism.md](references/fidelity-isomorphism.md):
     **① Physical/Spatial** (pure 3D cutaway/X-Ray) · **② Logic/Code/Protocol** (2D wire/payload or 3D hardware ↔ synchronized code/truth table) · **③ Math/Optimization/RL** (high-precision formal workspace + permanent live formulas) · **④ Physical × Math Dual** (3D workbench + phase plot + collapsible formulas from one `solve()`).
   - **Time Regime (`T1–T4`)** in [time-dimension.md](references/time-dimension.md): **T1** transient slow-mo scrubber · **T2** continuous slow evolution · **T3** deterministic multi-step rewind (`TimelineDirector`) · **T4** whole-chapter progressive multi-act assembly (`carries` / `hook` / `relates`).
   - **Topic Track & Agency** in [topic-fit.md](references/topic-fit.md).
2. Generate **3 genuinely distinct architectural & visual concept renders** (different geometry/theme/perspective setups matching the truth axis, e.g., 2.5D anodized instrument vs. Swiss 2D editorial blueprint vs. dark scientific oscilloscope) and present them side-by-side to the user.
3. **Stop for user selection.** Do NOT skip directly to code unless the user explicitly opted out of concept selection for the current turn.

---

## Step 2 · Assemble from `kit/` & Domain `primitives/` (Zero-CDN Offline ESM)

Once the user selects a concept:
1. **Extract offline vendor runtime**: run `python scripts/setup_vendor.py <target_dir>` (zero CDN imports; works in browsers and desktop WebViews).
2. **Reuse crafted domain primitives (`primitives/`) instead of building crude primitive blocks**:
   - Inspect [`primitives/`](primitives/) (e.g., [`primitives/rl-primitives.js`](primitives/rl-primitives.js) for 4-Q beveled instrument tiles, sunken cliff chasm, translucent glass `n-step` arc on `GROUND_LAYER`, `TdForkPanel`, and dark `CodeTraceCard`).
   - For multi-lesson series or software platforms, keep identical concepts coming from the same canonical factory so visual geometry stays uniform everywhere.
3. **Wire single-truth causal state + runnable counterfactual verifier**:
   - Route ALL visual layers, SVG schematics, `CalloutLayer` (`setBlockers` + `setItems`), [`kit/chart-card.js`](kit/chart-card.js), [`kit/live-maths.js`](kit/live-maths.js), [`kit/link-bus.js`](kit/link-bus.js), and [`kit/timeline-director.js`](kit/timeline-director.js) (`applyUrlState`, `carries`/`hook`) from one deterministic `solve()`.
   - Export an executable falsification suite via `exposeTestHooks(director, { ..., falsify: () => ... })` testing at least 2 critical parameter/counterexample assertions.
   - Follow [`design-system.md`](references/design-system.md) & [`stage-architecture.md`](references/stage-architecture.md); add `shell/` (`i18n.js`, `command-palette.js`, `storage-adapter.js`, `app-shell.js`) when delivering multi-lesson sites or desktop apps.

---

## Step 3 · Pass the Automated Quality Oracle + Visual Side-by-Side Check

1. Run `node tests/run-tests.mjs` for ESM syntax and markdown link integrity.
2. Run the automated **Quality Oracle**:
   ```bash
   python scripts/verify_stage.py --root <dir> --entry <index.html> --probe "?stage=..."
   ```
   A run passes ONLY when ALL machine-enforced oracle legs report `OK` across `1280×800`, `1440×900`, `390×844`, and deep-link probes:
   - **`prose-lint`**: Zero AI clichés (`本质上`, `值得注意的是`, `总而言之`, `综上所述`, `赋能`, etc.) and zero desktop guide scroll overflow.
   - **`stage-frame`**: Desktop stage canvas covers `>= 45%` width & height with active WebGL/SVG rendering.
   - **`chart-legibility`**: Visible plots maintain readable size (`>= 200 × 85` px).
   - **`hud-overlap`**: Zero mutual bounding-box collision (`<= 6px`) among floating HUD docks.
   - **`falsify-oracle`**: Invokes `window.__simulify.falsify()` live in headless Chromium and asserts `passed === true`.
3. Visually inspect the captured screenshots side-by-side against the concept render chosen in Step 1. For galleries, bake crisp 2× scene thumbnails with `python scripts/bake_thumbs.py`.
