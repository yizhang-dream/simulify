# Domain 3D Primitives (`primitives/`)

This directory holds reusable, domain-specific 3D primitive factories built on top of [`kit/geo-sculpt.js`](../kit/geo-sculpt.js).

## Authoring Rules

1. **Lock dimensions from the Step 1 Three-View Blueprint first**: export a `DIMENSIONS` table (`L`, `W`, `H` in world units) derived directly from the approved Front / Side / Top orthographic blueprint — never eyeball thickness or depth from a single 2D perspective drawing.
2. **Same object = same geometry & PBR material across acts/chapters**: instantiate recurring assemblies from one shared factory so proportions, clearances, interaction halos, and cutaway planes stay consistent.
3. **Full volumetric 3D across every angle**: every factory must remain structurally valid in Front, Side, Top, and free-orbit views and pass `stage.getGeometryAudit()` (`cuboidRatio <= 0.70`, `sculptedMeshes > 0`, non-flat volumetric bounds).
