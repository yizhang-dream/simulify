# Simulify v3.1

[简体中文](README.zh-CN.md) · [Install](INSTALL.md) · [Agent skill](SKILL.md) · [Local gallery](examples/index.html) · [Live gallery](https://simulify.xn--ltr42g543b.cn/)

Simulify builds interactive 3D/4D workbenches for mechanisms, physical structures, mathematical laws, and dynamical systems. Use it to expose occluded parts, rewind causal changes, or let learners manipulate a model and test where it fails. Each bench ships as a zero-build static directory with local Three.js, fonts, and KaTeX.

## 3 profiles × 3 layouts × 6 skins (2 aesthetic tiers)

| Profile | Use it for |
|---|---|
| `mechanical-3d` | Assemblies, linkages, and cutaways with a shared `DIMENSIONS` table and an orthographic Front / Side / Top blueprint. |
| `field-math` | Scalar and vector fields, phase surfaces, waves, and optimization. |
| `sandbox-direct` | Instruments and coordinate spaces learners can manipulate immediately. |

Choose `fullbleed-hud` for a stage-first view, `split-bench` for a separate workspace, or `ab-compare` for synchronized views. `toggleZenMode()` hides peripheral panels within the current layout. The 6 CSS skins split into two crisp rendering tiers: **Primer Tactile Illustration** (`paper-ink`, `monochrome-print` — `NoToneMapping`, selective IBL, object-ID circular-AA ink outlines, analytical `fwidth()` grid) and **Studio Precision PBR** (`dark-studio`, `obsidian-gallery`, `bio-cutaway`, `blueprint` — `StudioLightformerEnvironment`, `NeutralToneMapping`, native 4× MSAA with chamfered highlights and tight `Box3` shadows). [Design system](references/design-system.md)

## Quick start

From the repository root, scaffold and serve a self-contained bench.

```bash
python scripts/new_bench.py my-bench --title "My Mechanism" --profile mechanical-3d --layout split-bench --skin paper-ink --with-vendor --serve
```

Open the generated bench over HTTP. Use `--with-vendor` for a standalone directory with the Kit, reusable `primitives/`, modern Three.js, fonts, and KaTeX. Use `--no-katex` for benches without formulas. Shared mode is available for targets inside the repository. The standalone renderer supports WebGPU and WebGL2 through `three.webgpu.js`. [Local preview](http://127.0.0.1:8092/)

Put the deterministic `solve(params, t)` and structured `falsifyCases` in `model.js`. `createSimModel()` shares one snapshot across 3D geometry, charts, code highlights, and live equations. The model kit also provides `rk4Step`, `integrateRK4`, and `bisectRoot`. [Scaffold](scripts/new_bench.py) · [Vendor setup](scripts/setup_vendor.py) · [Model core](kit/model-core.js) · [API declarations](kit/index.d.ts)

Use WebGL2/WebGPU with DOM/CSS HUD and callouts by default. Opt into 3D HTML-in-Canvas for content attached to a surface inside the scene. Use `SpacetimeClock` and `SimulationTape` for reversible time and baseline overlays, and add progressive reveal when multiple beats serve the explanation. [Architecture](references/stage-architecture.md) · [Time and interaction](references/time-dimension.md)

## Verification and handoff

```bash
node tests/run-tests.mjs
uv run scripts/verify_stage.py --root my-bench --entry index.html
```

The browser verifier writes multi-viewport screenshots, a 2× close-up crop, a labeled contact sheet (`*-contact-sheet.png`), look-dev pixel/scene telemetry (including magenta-frame detection), and a JSON receipt. Inspect the contact sheet, rendered stills, close-up bevels, and failure modes against the mechanism and its source. [Profile gate matrix](references/engine-contract.md)

Use `archify` for pure 2D flowcharts and `onetake` for motion-video production.
