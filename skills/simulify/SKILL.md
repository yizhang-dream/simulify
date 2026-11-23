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

# Simulify (plugin entry shim)

The full skill lives at the repository root. This thin shim exists so plugin loaders that only scan `skills/<name>/SKILL.md` (Antigravity, Claude Code) can discover it.

**When invoked: read [../../SKILL.md](../../SKILL.md) completely and follow it.** Treat the directory two levels above this file as `<PLUGIN_ROOT>`. Every relative file reference (`kit/`, `primitives/`, `scripts/`, `references/`, `examples/`, `tests/`) resolves against `<PLUGIN_ROOT>`, while generated benches (`<target_dir>`) should live in the **user's workspace** — invoke scripts via `<PLUGIN_ROOT>/scripts/...` instead of `cd`-ing into `<PLUGIN_ROOT>` and writing outputs into the plugin install directory.
