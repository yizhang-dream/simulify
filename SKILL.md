---
name: simulify
description: >-
  Turn a mechanism, physical structure, hardware/protocol flow, mathematical law, or algorithm into a
  standalone offline interactive 3D/4D HTML explainer: progressive temporal revelation over continuous
  reversible 4D timelines, 1:1 HiDPI WebGPU + HTML-in-Canvas progressive enhancement, offline four-tier
  typography & KaTeX live equation substitution, cross-domain non-cuboid 3D sculpting & cutaways,
  counterfactual ghosts, and offline MP4/WebM/GIF export.
  Use whenever a flat page (answer-me-with-html), 2D diagram (archify), or static textbook
  (atlas-textbook) cannot show 3D spatial occlusion, progressive causal time evolution, or hands-on
  "what-if" dynamics — or when the user asks for 用 3D 讲 / 做个 3D 或 4D 交互演示 / 拆解内部结构 /
  做成可调参实验台 / 拖时间轴看过程 / 动起来看原理 / 仿真拆解 / interactive 3D explainer /
  explorable simulation / cutaway view. Do not use for pure mini-games or decorative 3D backgrounds
  without explanatory rules.
---

# Simulify v2.1 — True 4D Mechanism, Sculpted Cutaway & Simulation Explainer

> **Suite Role**: **`answer-me-with-html`** explains via 2D prose/tables; **`archify`** draws structural/sequence diagrams; **`atlas-textbook`** weaves connected readable books; **`simulify`** builds **true 4D progressive-reveal 3D/2.5D simulation workbenches** where sculpted actors, subsystems, KaTeX equations, and plots enter *only when causal friction demands them*, learners scrub time continuously forward/backward, manipulate the stage directly, compare counterfactual ghosts, and export crisp MP4/WebM/GIF clips.

Simulify v2.1 enforces quality through **1 human visual decision + Four Plugin-Level Iron Laws + code-enforced multi-beat engineering & interactive oracles**:

---

## The Four Plugin-Level Iron Laws (Mandatory Across All Disciplines)

Every Simulify workbench — whether physics, mechanics, electronics, optics, biology, protocols, or mathematics — MUST obey all four laws:

### Iron Law 1 · 1:1 Physical Sharpness, Zero Halo & Camera Ownership
- **Exact physical backing**: [`IsometricStage`](kit/stage-3d.js) binds `ResizeObserver({ box: 'device-pixel-content-box' })` and renders at exact physical pixels (`setPixelRatio(1) + setSize(physicalWidth, physicalHeight, false)`, DPR up to 3×), eliminating fractional-DPI bilinear blur.
- **Crisp textures & outlines**: Run `stage.configureSharpTexture(tex)` on every custom `CanvasTexture` / texture (auto max anisotropy up to 16×, `SRGBColorSpace`, trilinear mipmaps). Select `stage.setOutlinePreset('crisp' | 'subtle' | 'none')` (1-ring physical-pixel engineering ink line, `NeutralToneMapping`, zero wide grey fog halo).
- **Isolated 2× HiDPI 3D HTML surfaces**: Mount diegetic 3D HTML panels via [`kit/html-surface.js`](kit/html-surface.js) onto un-tone-mapped `SURFACE_LAYER` (Layer 2) — automatically allocated at `>= 2×` CSS border-box / projected screen scale with premultiplied-linear mipmaps, 16× anisotropy, and an untainted pure-Canvas2D 3D `CanvasTexture` fallback for Firefox/Safari.
- **Respect user camera ownership & idle GPU**: Choreography beats MUST call `stage.setCameraFromScript(pose)` so user orbit/zoom/`flyTo` locks (`stage.isUserCameraLocked()`) are NEVER snapped back by script (`resetView()` or `stage.unlockUserCamera()` releases lock). Drive updates via on-demand `stage.requestRender()` so paused scenes burn 0fps GPU.
- **ClearType DOM discipline**: **BAN `backdrop-filter`** on content/HUD cards and **BAN steady-state `translate3d(...)` / static `will-change: transform`** (use `transform: none` at rest; integer `Math.round()` offsets only during transitions).

### Iron Law 2 · Offline Four-Tier Typography & True Math Typesetting
- **Zero-CDN four-tier WOFF2 system**: Import [`kit/primer-tokens.css`](kit/primer-tokens.css) (which pulls [`kit/fonts/fonts.css`](kit/fonts/fonts.css) offline) and use the four semantic font tokens:
  - `--font-display`: `Newsreader` + `Simulify Display SC` (hero, act & caption headings)
  - `--font-sans`: `Inter` + `Simulify Sans SC` (body prose, UI labels)
  - `--font-math` / `--font-math-italic`: `KaTeX_Main`, `KaTeX_Math`, `KaTeX_Size1/2` (formulas)
  - `--font-mono`: `JetBrains Mono` + `Simulify Sans SC` fallback (code & `tabular-nums` readouts)
- **Unified Canvas/DOM font bridge**: Use [`kit/fonts.js`](kit/fonts.js) (`waitForFonts()`, `canvasFont(role, px, weight, style)`, and `createCrispCanvasTexture(THREE, { width: 512, height: 512, draw, ... })` with `>= 512px` textures that auto-redraw once fonts settle).
- **True mathematical typesetting**: Build formulas with [`kit/live-maths.js`](kit/live-maths.js) AST helpers — `mathVar`, `mathSub`, `mathSup`, `mathSubSup`, `mathFrac`, `mathOp`, `mathNum`, `mathText`, `mathGroup` (`normalizeUnicodeScripts` also rescues legacy strings).
- **Hard typography bans**: **NEVER** render Chinese text with Latin-only monospace fonts; **NEVER** hand-type broken Unicode micro-subscripts/superscripts (`ₜ`, `ₙ`, `ᵏ`, `⁴`) in formulas; **NEVER** ship unreadable `< 11.5px` micro-text (HUD/SVG floor `>= 11.5px`, prose `>= 13.5px`, equations `14.5px`).
- **Offline project font shrinking**: Use `scripts/setup_vendor.py` to bundle `vendor/three/` + `kit/fonts/`, and shrink standalone deliverables to exact used glyphs via:
  ```bash
  uv run --with fonttools --with brotli python scripts/setup_vendor.py <target_dir> --fonts-only --subset-cjk <project_dir>
  ```

### Iron Law 3 · Anti-Cuboid Sculpting Law (`kit/geo-sculpt.js`)
- **BAN Lego-box scenes**: **Explicitly FORBIDDEN** to build whole 3D workbenches out of stacked `RoundedBoxGeometry` / `BoxGeometry` / `PlaneGeometry` + unlit `MeshBasicMaterial`! Every v2 3D bench is audited via `stage.getGeometryAudit()` (`cuboidRatio <= 0.70` and `sculptedMeshes > 0`).
- **Compose from [`kit/geo-sculpt.js`](kit/geo-sculpt.js)'s 5 universal sculpting families** (all meshes auto-tagged with `userData.simulifyGeoKind`, casting/receiving shadows, using physically lit PBR `MeshStandardMaterial` / `MeshPhysicalMaterial`, zero `MeshBasicMaterial`):
  1. **Turned / Lathed Solids (`'lathe'`)**: `createLathedSolid`, `createGlassVessel` (`ampoule`/`flask`/`dome`/`lens` + `setFillLevel`), `createSculptedProbe` (`setAccentColor`/`setHeading`/`setEmissiveIntensity`), `createBeaconLighthouse` (`setBeaconColor`/`setBeaconIntensity`).
  2. **Bevelled Extruded Profiles (`'extrude'`)**: `createBevelledProfile`, `createGearWheel`, `createHorseshoeYoke`, `createArchSpan`, `createAirfoilVane`.
  3. **Zero-GC Deformable Terrains, Fractures, Parametric Surfaces & Elastic Strips (`'heightfield' | 'chasm' | 'parametric' | 'strip'`)**: `createHeightfieldSurface` (`updateHeights`, `sampleHeight`, solid skirt), `createFracturedChasm` (`setCarveProgress`), `createParametricSurface` (`updateSurface`), `createDeformableStrip` (single or `bimetallic`, `setCurvature` returning `{ tipPos, tipAngle, tipNormal }`).
  4. **True 3D Helices, Variable-Radius Conduits & Pleated Bellows (`'helix' | 'conduit' | 'bellows'`)**: `createHelicalCoil` (`setGlow`/`setCompression`), `createTaperedConduit` (parallel-transport frame + vertex color gradient + caps), `createPleatedBellows` (`setExtension`).
  5. **Theme-Aware Lit PBR Material Factory**: `createSculptMaterial(preset, overrides)` (`'ceramic' | 'travertine' | 'brass' | 'anodized' | 'copper' | 'obsidian' | 'steel' | 'glass' | 'frostedGlass' | 'ember'`).
- **Cross-disciplinary sculpting map** (full guide in [fidelity-isomorphism.md](references/fidelity-isomorphism.md)):

| Discipline | Replace Crude Boxes With (`kit/geo-sculpt.js`) |
| :--- | :--- |
| **Mechanics / Thermo** | `createGearWheel`, `createHelicalCoil` (spring/filament), `createDeformableStrip` (`bimetallic` / cantilever), `createPleatedBellows`, `createArchSpan` |
| **Optics / Thermal / Chem** | `createGlassVessel` (`ampoule`/`flask`/`dome`/`lens`), `createBeaconLighthouse` (Fresnel rings), `createHelicalCoil` (emitter), `createTaperedConduit` (light/fluid beam) |
| **EM / Math / Opt / RL** | `createHorseshoeYoke` (magnet), `createHeightfieldSurface` (potential/value/loss landscape), `createFracturedChasm` (discontinuity/cliff), `createSculptedProbe` (agent/field probe), `createTaperedConduit` (flux/policy ribbon) |
| **Biology / Anatomy / Fluid** | `createParametricSurface` (membrane/tissue), `createLathedSolid` + cutaway planes (vessel/chamber), `createTaperedConduit` (vascular duct), `createPleatedBellows` (diaphragm/pump) |
| **Hardware / Aero / Protocols** | `createAirfoilVane` (fin/wing), `createBevelledProfile` (chassis/PCB/bracket), `createTaperedConduit` (signal/bus stream), `createSculptedProbe` (logic probe) |

### Iron Law 4 · Multi-Beat Real Interaction Oracle & Truth Integrity
- **Single `solve()` truth — zero fakes**: Every 3D displacement, trajectory ribbon, chart coordinate, code highlight, and live equation number MUST come from one deterministic `solve()` engine. **BAN** hardcoded fake trajectories, fake progress bars, or fake highlights.
- **Pass EVERY leg of [`scripts/verify_stage.py`](scripts/verify_stage.py)** across all sampled acts (never rely on a `t = 0.35s` opening screenshot alone): multi-beat HUD & 3D `HtmlSurface` occlusion (`<= 15%`), `typography-crispness`, `geometry-diversity`, `camera-ownership` real drag + 400ms hold, and `--no-hic` non-`CanvasDrawElement` fallback parity.

---

## Step 1 · Native Truth Audit, Cast & Reveal Ledger & 3 Visual Concepts (Only Human Checkpoint)

Before writing HTML or scene code:
1. Lock the orthogonal coordinate choices:
   - **Native Truth Axis (`①–④`)** in [fidelity-isomorphism.md](references/fidelity-isomorphism.md):
     **① Physical/Spatial** (3D cutaway/X-Ray, clipping planes) · **② Logic/Code/Protocol** (2D/2.5D spacetime ladder or hardware ↔ synchronized code/dissector) · **③ Math/Optimization/RL** (formal workspace + `LiveMathsPanel` with bidirectional `LinkBus` tokens) · **④ Physical × Math Dual** (3D bench coupled live to phase-time helix/plot + collapsible formulas from one `solve()`).
   - **Time Regime (`T1–T4`) & Progressive-Reveal Law** in [time-dimension.md](references/time-dimension.md):
     - **BAN `t = 0` spatial dumping & `showEnd()` on load.** Never drop the whole chapter's objects, comparison tracks, and 4-corner HUD panels onto frame 0.
     - **Draft a Beat-by-Beat Cast & Reveal Ledger**: open sparse at `t = 0` (`<= 2` active actors on stage, minimal chrome), unfold over an unhurried **25–60 s continuous global timeline**, and state the exact **causal trigger** for every subsequent actor, subsystem, chart, formula, and HUD reveal (`enter`, `focus`, `cameraBeat`, `hudReveal`).
   - **Topic Track & Agency** in [topic-fit.md](references/topic-fit.md): design direct on-stage manipulation (`kit/manipulator.js` — drag handles, paintable tiles, clickable in-flight packets, clock-bound auto-exit on act switch) instead of slider-only sidebars.
2. Generate **3 genuinely distinct architectural & visual concept renders** matching the truth axis, sculpted forms, and theme (`paper-ink`, `dark-studio`, `bio-cutaway`) and present them side-by-side to the user.
3. **Stop for user selection.** Do NOT skip directly to code unless the user explicitly opted out of concept selection for the current turn.

---

## Step 2 · Assemble from `kit/` & Domain `primitives/` (Zero-CDN Offline ESM)

Once the user selects a concept:
1. **Extract offline vendor runtime + four-tier fonts**: run `python scripts/setup_vendor.py <target_dir>` (zero CDN imports; extracts `three.core.js`, `three.webgpu.js`, `three.tsl.js`, `RoomEnvironment.js`, `RoundedBoxGeometry.js`, `BufferGeometryUtils.js`, legacy `three.module.js`, plus `kit/fonts/`). For compact standalone bundles, append `--subset-cjk <project_dir>`.
2. **Drive everything from ONE deterministic 4D clock + pure-function choreography**:
   - Use [`kit/spacetime.js`](kit/spacetime.js): `SpacetimeClock` (single master global clock `0 → T`, single-channel `seek()` dispatch, speed dilation `0.1×–2×`, beat/act bookmarks, `setManualMode(bool)`) and `SimulationTape` (O(1) continuous forward/backward `sampleAt(t)` + `captureGhost()` / `getGhost()` for translucent counterfactual overlays). **Never** drive scene animations off raw `performance.now()` or spawn competing `rAF` loops.
   - Use [`kit/choreography.js`](kit/choreography.js): `ActorChoreographer` (`register`, `enter`, `exit`, `focus`, `cameraBeat` respecting `stage.setCameraFromScript`, `hudReveal`, `evaluate(t)`, `getActiveActorCount(t)`) so every 3D actor, 3D HTML surface, camera move, and contextual HUD panel is a pure, reversible function of `t`.
   - Use [`kit/timeline-director.js`](kit/timeline-director.js): `mountTimelineBar(el, clockOrDirector)` (with runtime `setLang()` / `setStageLabels()`), `applyUrlState` (`?stage=&step=&t=&paused&end&thumb=1&export=stage|caption|hud`), and `exposeTestHooks(clockOrDirector, { stage, callouts, choreographer, syncAll, falsify, ... })` synthesizing the **`window.__simulify` v2 contract** (`version: 2`, `getTimelineInfo`, `enterExportMode`, `seek` [1× sync + 1× evaluate + 1× render], `exitExportMode`, `getCaptureTargets`, `getCaptionState`, `getActiveActorCount`, `getGeometryAudit`, `getFontAudit`).
3. **Crisp 1:1 WebGPU + Sculpted 3D + HTML-in-Canvas + Direct Manipulation**:
   - Initialize [`kit/stage-3d.js`](kit/stage-3d.js) via `await IsometricStage.create(canvas, opts)` (1:1 physical pixels, `configureSharpTexture`, `setOutlinePreset`, `setCameraFromScript`, `requestRender`, `getGeometryAudit`, `SURFACE_LAYER`, hardware WebGPU → WebGL2 → fallback).
   - Build 3D mechanisms using [`kit/geo-sculpt.js`](kit/geo-sculpt.js) and reusable domain [`primitives/`](primitives/) instead of stacked cuboids; draw 3D plaques/gauges with [`kit/fonts.js`](kit/fonts.js) `createCrispCanvasTexture` (`>= 512px`).
   - Mount live diegetic HTML (KaTeX equations from [`kit/live-maths.js`](kit/live-maths.js) with `surfaceMode: true` & `LinkBus` `linkId` tokens, code traces, telemetry) via [`kit/html-surface.js`](kit/html-surface.js) (`SURFACE_LAYER`, `>= 2×` HiDPI + mipmaps + untainted non-HIC 3D fallback).
   - Wire direct stage interactions via [`kit/manipulator.js`](kit/manipulator.js) (pass `clock` or call `.bindClock(clock)` for automatic act-change exit + cursor sync), persistent-DOM scrubbable charts via [`kit/chart-card.js`](kit/chart-card.js) (`onScrub`, `movingAverageWindow`), exportable callouts via [`kit/callout-layer.js`](kit/callout-layer.js), and offline export via [`kit/stage-exporter.js`](kit/stage-exporter.js) (with live `setLang()`).
   - Keep boxed HUD chrome `<= 25%` of viewport, tag HUD containers with `data-export-role="chrome|caption|callout|panel|stage"`, and follow [`design-system.md`](references/design-system.md) & [`stage-architecture.md`](references/stage-architecture.md).

---

## Step 3 · Pass the v2.1 Multi-Beat 4D Quality Oracle, Visual Check & Export

1. Run `node tests/run-tests.mjs` for ESM syntax, Wave 1/v2.1 core kit unit invariants (geo-sculpt, fonts, live-maths, chart-card, spacetime, choreography, muxers), manifest sync, and zero broken markdown links.
2. Run the upgraded **v2.1 Multi-Beat 4D Quality Oracle** ([`scripts/verify_stage.py`](scripts/verify_stage.py)):
   ```bash
   uv run scripts/verify_stage.py --root <dir> --entry <index.html> --probe "?stage=..."
   # Also verify Firefox/Safari non-HTML-in-Canvas fallback parity:
   uv run scripts/verify_stage.py --root <dir> --entry <index.html> --no-hic
   ```
   A v2 bench (`window.__simulify.version >= 2`) passes ONLY when ALL oracle legs report `OK` across `1280×800`, `1440×900`, `390×844`, multi-beat timeline samples (first + middle + final acts), and deep-link probes:
   - **`prose-lint` & `multi-beat` layout**: Zero AI clichés and zero desktop `guideOverflow` across EVERY sampled act (not just `t ≈ 0.35s`).
   - **`stage-frame` & `visual-integrity`**: Active non-blank canvas (`>= 45%` desktop area), zero horizontal code/guide/maths/caption truncation (`scrollWidth <= clientWidth + 2`) at every sampled act, zero GPU/console errors.
   - **`chart-legibility` & `hud-overlap`**: Readable visible plots (`>= 200 × 85` px) across all acts, zero HUD dock collisions (`<= 6px`, including `.beat-caption-pill`), and zero 3D `HtmlSurface` vs HUD dock occlusion `> 15%`.
   - **`typography-crispness`** *(v2)*: Offline fonts loaded (`getFontAudit().loadedCount >= 2, failedCount === 0`), 1:1 physical canvas backing (`canvas.width >= rect.width * dpr - 2`), zero visible HUD/SVG text `< 10.5px`, and active 3D `HtmlSurface` texture pixel density `>= HiDPI floor` (blocks 0.5× blur regressions).
   - **`geometry-diversity`** *(v2 3D)*: `getGeometryAudit()` on populated acts satisfies `cuboidRatio <= 0.70` and `sculptedMeshes > 0` (v1 classic benches remain exempt).
   - **`camera-ownership`** *(desktop 3D)*: Real Playwright mouse drag across canvas rotates the camera AND holds ownership for `>= 400ms` without script snap-back.
   - **`initial-sparsity`**: Bench boots near `t = 0` (NOT `showEnd()`) and strictly grows over time (`getActiveActorCount(0) < getActiveActorCount(T)`).
   - **`temporal-scrub-determinism`**: Driving `seek(0.1T) → seek(0.5T) → seek(0.9T) → seek(0.5T)` yields real visual evolution across timepoints AND repeatable state/pixels on rewind.
   - **`mandatory-falsify`**: `window.__simulify.falsify()` MUST exist and return `{ passed: true }` across `>= 2` counterfactual assertions.
3. Visually inspect rendered screenshots side-by-side against the concept chosen in Step 1. For galleries, bake crisp 2× thumbnails with [`scripts/bake_thumbs.py`](scripts/bake_thumbs.py); for studio MP4/WebM/GIF reels, run [`scripts/export_video.py`](scripts/export_video.py) (Tier 2 Playwright CLI) or the in-browser [`kit/stage-exporter.js`](kit/stage-exporter.js) popover (Tier 1).
