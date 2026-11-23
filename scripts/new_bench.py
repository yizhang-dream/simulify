#!/usr/bin/env python3
"""Create a minimal Simulify 3D bench. Serve the bench and its assets over HTTP."""
import argparse
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
from html import escape
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

from setup_vendor import REPO_ROOT

PROFILES = ("mechanical-3d", "field-math", "sandbox-direct")
LAYOUTS = ("fullbleed-hud", "split-bench", "ab-compare")
SKINS = ("paper-ink", "dark-studio", "bio-cutaway", "blueprint", "monochrome-print", "obsidian-gallery")

MODEL = """import { createSimModel } from 'simulify/model-core.js';

export function createModel(clock) {
  return createSimModel({
    clock,
    params: { speed: Math.PI / 2 },
    solve: ({ speed }, t) => ({ angle: speed * t, markerVisible: t >= 1 }),
    falsifyCases: [{
      name: 'A stopped rotor keeps its initial orientation',
      t: [0.5, 1, 4],
      params: { speed: 0 },
      check: (_base, stopped) => Math.abs(stopped.angle) < 1e-9,
    }, {
      name: 'The default rotor returns to its initial orientation after four seconds',
      run(evaluate) {
        const atStart = evaluate(0);
        const atPeriod = evaluate(4);
        const slower = evaluate(4, { speed: Math.PI / 3 });
        const distance = (a, b) => Math.hypot(Math.cos(a) - Math.cos(b), Math.sin(a) - Math.sin(b));
        const baseMetric = distance(atStart.angle, atPeriod.angle);
        const mutantMetric = distance(atStart.angle, slower.angle);
        return { passed: baseMetric < 1e-9 && mutantMetric > 0.5, baseMetric, mutantMetric };
      },
    }],
  });
}
"""

MAIN = """import * as THREE from 'three';
import { IsometricStage } from 'simulify/stage-3d.js';
import { SpacetimeClock } from 'simulify/spacetime.js';
import { exposeTestHooks, mountTimelineBar } from 'simulify/timeline-director.js';
import { createModel } from './model.js';

const clock = new SpacetimeClock({ duration: 4 });
const model = createModel(clock);

async function mountRotor(canvas, color) {
  const stage = await IsometricStage.create(canvas, {
    theme: document.documentElement.dataset.theme,
    baseSpan: 6,
    target: [0, 1, 0],
  });
  const rotor = new THREE.Group();
  rotor.position.y = 1.2;
  const hub = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.23, 24, 72),
    new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.18 }),
  );
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xd89742 }),
  );
  marker.position.y = 1;
  rotor.add(hub, marker);
  stage.scene.add(rotor);
  return {
    stage,
    update(snapshot) {
      rotor.rotation.z = snapshot.angle;
      marker.visible = snapshot.markerVisible;
      stage.requestRender();
    },
  };
}

const live = await mountRotor(document.querySelector('#stage-canvas'), 0x278884);
const referenceCanvas = document.querySelector('#reference-canvas');
const reference = referenceCanvas && await mountRotor(referenceCanvas, 0x627caa);
if (reference) live.stage.syncCameraWith(reference.stage);
model.subscribe((snapshot, params, t) => {
  live.update(snapshot);
  reference?.update(model.evaluate(t, { speed: params.speed / 2 }));
  const readout = document.querySelector('#angle');
  if (readout) readout.value = snapshot.angle.toFixed(2) + ' rad';
});

mountTimelineBar(document.querySelector('#transport'), clock, { lang: 'en', showStages: false });
exposeTestHooks({
  profile: PROFILE,
  clock,
  stage: live.stage,
  model,
  getActiveActorCount: (t = clock.t) => 1 + Number(model.evaluate(t).markerVisible),
});
"""

STYLES = """h1 {
  margin: 0;
  font: 600 clamp(1.2rem, 3vw, 2rem) var(--font-serif);
}

.bench-transport {
  grid-area: transport;
  z-index: 2;
  padding: 0.75rem;
}

[data-layout="fullbleed-hud"] .bench-transport {
  position: absolute;
  inset: auto 1rem 0.5rem;
}

@media (max-width: 900px) {
  [data-layout="fullbleed-hud"] .bench-transport {
    position: static;
  }
  .bench-transport, .timeline-dock {
    order: 4;
    min-width: 0;
  }
  .timeline-dock {
    flex-wrap: wrap;
  }
}
"""


def relative_url(path, target):
    url = quote(Path(os.path.relpath(path, target)).as_posix(), safe="/")
    return url if url.startswith("../") else f"./{url}"


def make_html(title, layout, skin, kit, vendor, *, katex):
    title = escape(title)
    katex_link = f'\n  <link rel="stylesheet" href="{kit}/katex/katex.min.css">' if katex else ""
    imports = json.dumps({"imports": {
        "simulify/": f"{kit}/",
        "three": f"{vendor}/three/three.webgpu.js",
        "three/webgpu": f"{vendor}/three/three.webgpu.js",
        "three/tsl": f"{vendor}/three/three.tsl.js",
        "three/addons/": f"{vendor}/three/addons/",
    }}, indent=2).replace("<", "\\u003c")
    canvas = '<canvas id="stage-canvas" class="stage-canvas" aria-label="Rotating ring"></canvas>'
    if layout == "ab-compare":
        stage = f"""<div class="ab-stage-grid">
      <div class="ab-pane">{canvas}<span class="ab-pane-badge">Baseline</span></div>
      <div class="ab-pane"><canvas id="reference-canvas" class="stage-canvas" aria-label="Half-speed ring"></canvas>
        <span class="ab-pane-badge">Half speed</span></div>
    </div>"""
    else:
        stage = f'<div class="stage-pane">{canvas}</div>'
        if layout == "split-bench":
            stage += '\n    <aside class="split-aside"><label for="angle">Angle</label> <output id="angle"></output></aside>'
    heading_class = "hud-top-left" if layout == "fullbleed-hud" else "top-ribbon"
    return f"""<!doctype html>
<html lang="en" data-theme="{skin}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="stylesheet" href="{kit}/primer-tokens.css">
  <link rel="stylesheet" href="{kit}/theme-studio.css">{katex_link}
  <link rel="stylesheet" href="styles.css">
  <script type="importmap">{imports}</script>
  <script type="module" src="main.js"></script>
</head>
<body>
  <main class="artboard-shell" data-layout="{layout}">
    <header class="{heading_class}"><h1>{title}</h1></header>
    {stage}
    <div id="transport" class="bench-transport"></div>
  </main>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target_dir", type=Path)
    parser.add_argument("--title", default="Simulify bench")
    parser.add_argument("--profile", choices=PROFILES, default=PROFILES[0])
    parser.add_argument("--layout", choices=LAYOUTS, default=LAYOUTS[0])
    parser.add_argument("--skin", choices=SKINS, default=SKINS[0])
    vendor_group = parser.add_mutually_exclusive_group()
    vendor_group.add_argument("--with-vendor", action="store_true", help="Copy a self-contained kit and vendor tree (omits legacy three.module.js)")
    vendor_group.add_argument("--vendor-base", help="Three.js vendor URL relative to the bench (defaults to the repository's shared vendor)")
    parser.add_argument("--no-katex", action="store_true", help="Omit the KaTeX stylesheet link and skip bundling its assets")
    parser.add_argument("--serve", action="store_true", help="Start a local HTTP preview server after scaffolding")
    parser.add_argument("--port", type=int, default=8092, help="Port for --serve (default: 8092)")
    args = parser.parse_args()
    target = args.target_dir.resolve()
    repo_root = REPO_ROOT.resolve()
    if not args.with_vendor and not target.is_relative_to(repo_root):
        parser.error("Targets outside the repository require --with-vendor to include the local Kit")
    try:
        kit = "./kit" if args.with_vendor else relative_url(repo_root / "kit", target)
        vendor = "./vendor" if args.with_vendor else (
            args.vendor_base or relative_url(repo_root / "examples" / "shared" / "vendor", target)
        )
    except ValueError as exc:
        parser.error(f"Cannot make relative asset URLs ({exc}). Use --with-vendor.")
    vendor_url = urlsplit(vendor)
    if args.serve and args.vendor_base and not (vendor_url.scheme or vendor_url.netloc):
        vendor_path = unquote(vendor_url.path)
        local_vendor = ((repo_root / vendor_path.lstrip("/")) if vendor_path.startswith("/")
                        else (target / vendor_path)).resolve()
        if not local_vendor.is_relative_to(repo_root) or not (local_vendor / "three/three.webgpu.js").is_file():
            parser.error("--serve requires --vendor-base to resolve to Three.js inside the repository or to an absolute URL")
    if not (vendor_url.scheme or vendor.startswith(("./", "../", "/"))):
        vendor = f"./{vendor}"
    vendor = vendor.rstrip("/")
    files = {
        "index.html": make_html(args.title, args.layout, args.skin, kit, vendor, katex=not args.no_katex),
        "main.js": MAIN.replace("PROFILE", json.dumps(args.profile)),
        "model.js": MODEL,
        "styles.css": STYLES,
    }
    reserved = [*files, "kit", "vendor", "primitives"] if args.with_vendor else files
    for name in reserved:
        if (target / name).exists() or (target / name).is_symlink():
            parser.error(f"Refusing to overwrite {target / name}")
    created_dirs = []
    published = []
    try:
        missing = []
        for directory in (target, *target.parents):
            if directory.exists():
                break
            missing.append(directory)
        for directory in reversed(missing):
            directory.mkdir()
            created_dirs.append(directory)
        with tempfile.TemporaryDirectory(prefix=".simulify-", dir=target) as staging:
            staged = Path(staging)
            if args.with_vendor:
                setup_cmd = [sys.executable, "-B", str(repo_root / "scripts/setup_vendor.py"), staging, "--no-legacy"]
                if args.no_katex:
                    setup_cmd.append("--no-katex")
                subprocess.run(setup_cmd, check=True)
                for source in (repo_root / "kit").iterdir():
                    if source.suffix in {".js", ".css", ".ts"}:
                        shutil.copy2(source, staged / "kit" / source.name)
                (staged / "primitives").mkdir()
                for source in (repo_root / "primitives").glob("*.js"):
                    shutil.copy2(source, staged / "primitives" / source.name)
            for name, content in files.items():
                (staged / name).write_text(content, encoding="utf-8", newline="\n")
            for name in (*[name for name in reserved if name != "index.html"], "index.html"):
                destination = target / name
                if destination.exists() or destination.is_symlink():
                    raise FileExistsError(f"Refusing to overwrite {destination}")
                (staged / name).rename(destination)
                published.append(destination)
    except BaseException as exc:
        for entry in reversed(published):
            if entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink()
        for directory in reversed(created_dirs):
            if not any(directory.iterdir()):
                directory.rmdir()
        if isinstance(exc, (OSError, subprocess.CalledProcessError)):
            parser.error(f"Could not scaffold {target}: {exc}")
        raise
    print(f"Created {target / 'index.html'}")
    if args.serve:
        serve_root = target
        url_path = ""
        if not args.with_vendor:
            rel = target.relative_to(repo_root).as_posix()
            serve_root = repo_root
            url_path = "" if rel == "." else f"{quote(rel, safe='/')}/"
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(serve_root))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
        port = server.server_address[1]
        print(f"Serving {serve_root} at http://127.0.0.1:{port}/{url_path} (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
