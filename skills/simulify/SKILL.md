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

# Simulify (plugin entry shim)

The full skill lives at the repository root. This thin shim exists so plugin loaders that only scan `skills/<name>/SKILL.md` (Antigravity, Claude Code) can discover it.

**When invoked: read [../../SKILL.md](../../SKILL.md) completely and follow it.** Treat the directory two levels above this file as `<PLUGIN_ROOT>`. Every relative file reference (`kit/`, `primitives/`, `scripts/`, `references/`, `examples/`, `tests/`) resolves against `<PLUGIN_ROOT>`, while generated benches (`<target_dir>`) should live in the **user's workspace** — invoke scripts via `<PLUGIN_ROOT>/scripts/...` instead of `cd`-ing into `<PLUGIN_ROOT>` and writing outputs into the plugin install directory.
