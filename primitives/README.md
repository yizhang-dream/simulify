# Domain 3D primitives

This directory is the extension point for reusable domain-specific factories built on [kit/geo-sculpt.js](../kit/geo-sculpt.js). Use [kit/index.d.ts](../kit/index.d.ts) for the public API.

- For `mechanical-3d`, derive shared `DIMENSIONS` from the approved Front / Side / Top orthographic blueprint. Record world units, thickness, clearance, and motion bounds. Check the assembly from all cardinal views and in orbit. Geometry audit thresholds apply to the stage under its profile policy. [Engine contract](../references/engine-contract.md)
- For `field-math` and `sandbox-direct`, define coordinate ranges, units, and degrees of freedom. Build geometry that expresses those quantities and constraints.
- Reuse one factory for each recurring object so proportions, material semantics, interaction halos, and cutaway planes stay consistent across acts and chapters. Derive state-dependent transforms from the same model snapshot as the chart and HUD. [Model core](../kit/model-core.js) · [Fidelity guide](../references/fidelity-isomorphism.md)
- Scaffold the workbench with `new_bench.py --with-vendor`. If the bench imports its own domain factories, include those files in the offline static directory. [Scaffold](../scripts/new_bench.py) · [Architecture](../references/stage-architecture.md)
