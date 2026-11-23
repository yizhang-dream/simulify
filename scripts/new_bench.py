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

PROFILES = ("primer-lesson", "mechanical-3d", "field-math", "sandbox-direct")
LAYOUTS = ("primer-lesson", "fullbleed-hud", "split-bench", "ab-compare")
SKINS = ("paper-ink", "dark-studio", "bio-cutaway", "blueprint", "monochrome-print", "obsidian-gallery")

PRIMER_LESSON_DATA = """export const COURSE = {
  title: TITLE_JSON,
  subtitle: '观察 · 推演 · 理解',
  palette: 'forest',
  backdrop: 'iso-grid',
  lessons: [
    {
      id: 'intro',
      category: '基础',
      title: TITLE_JSON,
      progressTitle: '核心进度',
      mode: 'steps',
      icon: '◈',
      description: '从零开始的交互式分步微缩沙盘课程。',
      stages: [
        {
          id: 'setup',
          title: '建立基座',
          shortTitle: '建立基座',
          icon: '①',
          summary: '先清空干扰，只把最核心的载体摆到桌面上，看清它的基本结构。',
          steps: [
            { id: 'base', title: '铺设底座', icon: '▭', cue: '底座决定整个系统的承载边界。', durationMs: 2200 },
            { id: 'core', title: '放置核心块', icon: '◆', cue: '引入第一个主角模块，观察它与底座的关系。', durationMs: 2200 },
          ],
          explain: [
            '把复杂系统拆成第一步能看懂的最小载体，先立住直觉，再逐步加变量。',
            '当你拖动画布旋转视角时，可以确认每个模块在空间中的真实位置关系。',
          ],
          think: {
            question: '先想一想：为什么要先摆底座，而不是一次把所有模块全放上去？',
            answer: '如果一次暴露所有零件，大脑无法区分“谁是前提、谁是后果”。按因果顺序逐块出现，每一步的必要性才清晰。',
          },
          tips: [
            '每个阶段只解决一个认知卡点，不要一次塞入多个新概念。',
            '用右侧的“讲解”写清楚因果，用“提示”列出最容易踩的坑。',
          ],
        },
        {
          id: 'action',
          title: '引入变化',
          shortTitle: '引入变化',
          icon: '②',
          summary: '加上驱动条件后，观察状态如何在模块之间传递。',
          steps: [
            { id: 'signal', title: '接入输入流', icon: '→', cue: '输入到达核心模块，触发状态转换。', durationMs: 2200 },
            { id: 'output', title: '输出稳态结果', icon: '✓', cue: '系统完成一次完整闭环。', durationMs: 2200 },
          ],
          explain: [
            '把抽象因果映射成看得见的立体流向或几何形变，读者不需要背诵术语也能一眼看穿机制。',
          ],
          tips: [
            '同一时刻画面只保留 1 个聚焦标注气泡，避免文字遮挡主体。',
          ],
        },
      ],
    },
  ],
};
"""

PRIMER_MAIN = """import * as THREE from 'three';
import { IsometricStage } from 'simulify/stage-3d.js';
import { DioramaAnimator, mountPrimerLesson } from 'simulify/primer-lesson.js';
import { exposeTestHooks } from 'simulify/timeline-director.js';
import { COURSE } from './lesson-data.js';

const shell = mountPrimerLesson(document.querySelector('#app'), {
  ...COURSE,
});

const stage = await IsometricStage.create(shell.canvas, {
  theme: document.documentElement.dataset.theme || 'paper-ink',
  gridStyle: 'none',
  baseSpan: 7.5,
  target: [0.8, 0.8, 0],
  azimuth: 38 * Math.PI / 180,
  elevation: 31 * Math.PI / 180,
});
shell.attachStage(stage);

const root = new THREE.Group();
stage.scene.add(root);

const base = new THREE.Mesh(
  new THREE.BoxGeometry(3.8, 0.36, 2.8),
  new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.78, metalness: 0.04 }),
);
base.position.set(0, 0.18, 0);
base.castShadow = true;
base.receiveShadow = true;

const core = new THREE.Mesh(
  new THREE.CylinderGeometry(0.68, 0.78, 1.15, 28),
  new THREE.MeshStandardMaterial({ color: 0x2f7d6e, roughness: 0.45, metalness: 0.08 }),
);
core.position.set(0, 0.94, 0);
core.castShadow = true;

const badge = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 24, 18),
  new THREE.MeshStandardMaterial({ color: 0xe56a2c, roughness: 0.38, metalness: 0.12 }),
);
badge.position.set(1.15, 1.15, 0);
badge.castShadow = true;

root.add(base, core, badge);
stage.fitShadowFrustum(root);

const anim = new DioramaAnimator()
  .trackPresence('core', core, { lift: 0.42, duration: 0.45, initial: false })
  .trackPresence('badge', badge, { lift: 0.32, duration: 0.4, initial: false })
  .trackScalar('badgeX', -1.15, { speed: 7.5 });

function applySceneState(state, { immediate = false } = {}) {
  const showCore = state.stageIndex > 0 || state.stepIndex >= 1;
  const showAction = state.stageIndex >= 1;
  anim.setPresent('core', showCore);
  anim.setPresent('badge', showAction);
  anim.setScalar('badgeX', state.stepIndex >= 1 ? 1.25 : -1.15);
  if (immediate) anim.snap();
  badge.position.x = anim.getScalar('badgeX');

  const pin = !showCore
    ? { id: 'base', label: '核心底座', worldPos: [0, 0.42, 0], offset: [56, -48] }
    : !showAction
      ? { id: 'core', label: '主角模块', worldPos: [0, 1.55, 0], offset: [58, -42] }
      : { id: 'signal', label: state.stepIndex >= 1 ? '输出结果' : '输入信号', worldPos: [badge.position.x, 1.45, 0], offset: [48, -46], tone: 'accent' };
  shell.setPins([pin]);
  stage.requestRender();
}

shell.onStateChange = (state) => {
  applySceneState(state);
};
applySceneState(shell.getState(), { immediate: true });

let lastTs = performance.now();
function tick(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
  lastTs = now;
  if (!stage._manualMode && anim.step(dt)) {
    badge.position.x = anim.getScalar('badgeX');
    stage.requestRender();
  }
  shell.updatePins();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

exposeTestHooks({
  version: 3,
  profile: PROFILE,
  stage,
  lessonShell: shell,
  onSeek() {
    anim.snap();
    badge.position.x = anim.getScalar('badgeX');
    shell.updatePins();
  },
});
"""

PRIMER_LESSON_MD = """# {title} — 课案（Lesson Script）

> **先备课，再建模**：写这份稿子时不要提 Three.js、CSS 或皮肤。先把一节课的认知推进聊透。

## 1. 这节课要破除什么困惑？
- 开场问题：
- 观众最容易产生的误解：

## 2. 表达载体判定
- [ ] 具象实物 / 实操步骤（1:1 建模）
- [x] 抽象概念 / 机制（等距微缩积木沙盘隐喻：________）
- 模式：`分步教学 (steps)` / `探索识别 (explore)`

## 3. 阶段与认知台阶（4–6 个阶段）
### 阶段 1：
- **核心一句话**：
- **小步骤（2–4 步）**：每步画面新出现什么 + 唯一聚焦标注气泡
- **讲解（Why）**：
- **追问（先想一想）**：
- **提示（避坑）**：
"""

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
    if layout == "primer-lesson":
        return f"""<!doctype html>
<html lang="zh-Hans" data-theme="{skin}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%231e3123'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='16' font-family='Georgia,serif' fill='%23f6efe2'%3EP%3C/text%3E%3C/svg%3E">
  <title>{title}</title>
  <link rel="stylesheet" href="{kit}/primer-tokens.css">
  <link rel="stylesheet" href="{kit}/theme-studio.css">
  <link rel="stylesheet" href="{kit}/primer-lesson.css">{katex_link}
  <link rel="stylesheet" href="styles.css">
  <script type="importmap">{imports}</script>
  <script type="module" src="main.js"></script>
</head>
<body>
  <div id="app" data-layout="primer-lesson"></div>
</body>
</html>
"""
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
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%231e3123'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='16' font-family='Georgia,serif' fill='%23f6efe2'%3EP%3C/text%3E%3C/svg%3E">
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
    if args.layout == "primer-lesson":
        files = {
            "index.html": make_html(args.title, args.layout, args.skin, kit, vendor, katex=not args.no_katex),
            "main.js": PRIMER_MAIN.replace("PROFILE", json.dumps(args.profile)),
            "lesson-data.js": PRIMER_LESSON_DATA.replace("TITLE_JSON", json.dumps(args.title, ensure_ascii=False)),
            "lesson.md": PRIMER_LESSON_MD.format(title=args.title),
            "styles.css": "/* Lesson-specific overrides on top of kit/primer-lesson.css */\n",
        }
    else:
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
