#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.45", "numpy>=1.24", "pillow>=9.0"]
# ///
"""
Automated 3-viewport, deep-link, multi-beat, and Simulify v2.2 Layout-Aware 4D Quality Oracle.

Spins up an ephemeral loopback HTTP server, verifies zero console/page/request errors,
zero guide-card overflow on desktop, mobile thumb-dock visibility, optional URL probes,
and writes screenshots + a machine-readable JSON receipt.

v1 legs (always enforced):
  - prose-lint, stage-frame, chart-legibility, hud-overlap (including multi-beat sampling
    and `.beat-caption-pill` + 3D HtmlSurface occlusion), falsify-oracle, camera-ownership

v2 legs (auto-enforced when `window.__simulify.version >= 2` or `--strict-4d` is set):
  1. initial-sparsity: bench must NOT boot in `showEnd` state; `actors(0) < peakActors`.
  2. temporal-scrub-determinism: drives `seek(0.1T) -> seek(0.5T) -> seek(0.9T) -> seek(0.5T)`
     and verifies real visual progression over time + reversible rewind determinism.
  3. mandatory-falsify: fails if `window.__simulify.falsify` is missing or `passed !== true`.
  4. visual-integrity: `canvasNonBlank` (RGB pixel variance > 0), zero horizontal truncation
     on visible code/guide/maths cards across sampled beats, and zero GPU console errors.
  5. typography-crispness: offline fonts loaded (`loadedCount >= 2, failedCount === 0`),
     1:1 physical canvas backing (`canvas.width >= rect.width * dpr - 2`), zero visible
     HUD/SVG text `< 10.5px`, and active 3D HtmlSurface physical pixel density >= HiDPI floor.
  6. geometry-diversity: on 3D stages, `getGeometryAudit()` must satisfy
     `cuboidRatio <= 0.70` and `sculptedMeshes > 0` (v1 classic benches remain exempt).
  7. camera-ownership: real mouse drag on desktop canvas rotates the camera and holds
     ownership for >= 400ms without script snap-back.
  8. three-views: on v2 3D desktop stages, captures orthographic/cardinal Front / Side / Top / Iso
     views via `setCardinalView()`, verifies non-flat volumetric LxWxH bounds (`flatnessRatio >= 0.08`),
     and verifies Front/Side/Top views render distinct non-blank frames.
"""

import argparse
import functools
import http.server
import io
import json
import math
import pathlib
import sys
import threading
import time
from urllib.parse import urljoin

try:
    import numpy as np
    from PIL import Image
except ImportError:
    np = None
    Image = None


GPU_ERROR_PATTERNS = (
    'uncapturederror',
    'gl_invalid',
    'context_lost',
    'webgpu',
    'shader error',
    'three.webglprogram',
)


EVAL_FRAME_METRICS_JS = """() => {
  const shellEl = document.querySelector('.artboard-shell, .scrolly-shell');
  const layoutArchetype = shellEl?.dataset?.layout || (document.querySelector('.scrolly-shell') ? 'scrolly-stage' : 'fullbleed-hud');
  const isScrollableWorkspace = layoutArchetype === 'split-bench' || layoutArchetype === 'scrolly-stage';
  const guide = document.querySelector('.hud-guide') || document.querySelector('.right-dock');
  const thumbDock = document.querySelector('.thumb-dock');
  const canvas = document.querySelector('.stage-canvas') || document.querySelector('canvas');
  const hook = window.__simulify || null;
  const stageObj = hook?.stage?.stage || hook?.stage || hook?.scene?.stage || null;

  const isVisibleEl = (el) => {
    if (!el || el.hidden || el.getAttribute('data-hud-hidden') === 'true') return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const guideVisible = isVisibleEl(guide);
  const guideOverflow = (!isScrollableWorkspace && guideVisible) ? (guide.scrollHeight > guide.clientHeight + 2) : false;
  const thumbVisible = thumbDock ? getComputedStyle(thumbDock).display !== 'none' : null;
  const thumbTop = thumbDock ? thumbDock.getBoundingClientRect().top : null;
  const canvasRect = canvas ? canvas.getBoundingClientRect() : null;

  // 1. Prose lint (AI clichés check on visible prose across all layout archetypes)
  const AI_CLICHES = [
    '本质上', '值得注意的是', '总而言之', '综上所述', '不难发现', '众所周知',
    '至关重要', '深入探讨', '赋能', '旨在', '极大地', '正如我们所见'
  ];
  const proseEls = document.querySelectorAll('.hud-guide, .right-dock, .split-aside, .scrolly-prose, .question-chain, .brand-sub, .beat-caption-pill, .hero-act-banner');
  const proseHits = [];
  for (const el of proseEls) {
    if (!isVisibleEl(el)) continue;
    const txt = el.innerText || '';
    for (const word of AI_CLICHES) {
      if (txt.includes(word)) proseHits.push(word);
    }
  }

  // 2. HUD panel mutual overlap check (desktop > 900px), including .beat-caption-pill & .view-cube-dock
  const hudSelectors = [
    '.hud-top-left', '.top-ribbon', '.beat-caption-pill', '.hud-guide', '.right-dock',
    '.split-aside', '.scrolly-prose', '.hud-bottom-left', '.bottom-left-dock',
    '.hud-bottom-center', '.bottom-transport', '.view-cube-dock'
  ];
  const visibleHud = [];
  const seenHudEls = new Set();
  for (const sel of hudSelectors) {
    const el = document.querySelector(sel);
    if (!el || seenHudEls.has(el) || !isVisibleEl(el)) continue;
    seenHudEls.add(el);
    const r = el.getBoundingClientRect();
    visibleHud.push({ sel, el, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  const hudOverlaps = [];
  for (let i = 0; i < visibleHud.length; i += 1) {
    for (let j = i + 1; j < visibleHud.length; j += 1) {
      const a = visibleHud[i];
      const b = visibleHud[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 6 && oy > 6) {
        hudOverlaps.push(`${a.sel}<->${b.sel}(${Math.round(ox)}x${Math.round(oy)})`);
      }
    }
  }

  // 2b. Active 3D HtmlSurface projected bbox vs HUD dock occlusion (> 15% fails) & HiDPI texture density
  const surfaceOcclusions = [];
  const surfaceDensities = [];
  const activeSurfaceEls = new Set();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const surfMap = stageObj?.htmlSurfaces?.surfaces;
  if (surfMap && typeof surfMap.values === 'function' && canvasRect && typeof stageObj.projectToScreen === 'function') {
    for (const surf of surfMap.values()) {
      const active = Boolean(
        surf &&
        surf.visible &&
        surf.mesh &&
        surf.mesh.visible !== false &&
        surf.mesh.parent &&
        (surf.opacity ?? 1) > 0.05
      );
      if (!active) continue;
      if (surf.el) activeSurfaceEls.add(surf.el);

      let projW = 0;
      let projH = 0;
      let projRect = null;
      const geom = surf.mesh.geometry;
      if (geom) {
        if (!geom.boundingBox) geom.computeBoundingBox();
        const bb = geom.boundingBox;
        if (bb && surf.mesh.position?.clone) {
          surf.mesh.updateWorldMatrix(true, false);
          const zFront = bb.max.z;
          const corners = [
            [bb.min.x, bb.min.y, zFront],
            [bb.max.x, bb.min.y, zFront],
            [bb.max.x, bb.max.y, zFront],
            [bb.min.x, bb.max.y, zFront],
          ];
          const tmp = surf.mesh.position.clone();
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          let anyVis = false;
          for (const [cx, cy, cz] of corners) {
            tmp.set(cx, cy, cz).applyMatrix4(surf.mesh.matrixWorld);
            const sc = stageObj.projectToScreen(tmp);
            if (sc && Number.isFinite(sc.x) && Number.isFinite(sc.y)) {
              anyVis = true;
              const sx = canvasRect.left + sc.x;
              const sy = canvasRect.top + sc.y;
              if (sx < minX) minX = sx;
              if (sy < minY) minY = sy;
              if (sx > maxX) maxX = sx;
              if (sy > maxY) maxY = sy;
            }
          }
          if (anyVis && maxX > minX + 4 && maxY > minY + 4) {
            projW = maxX - minX;
            projH = maxY - minY;
            projRect = { left: minX, top: minY, right: maxX, bottom: maxY };
            const surfArea = Math.max(1, projW * projH);
            for (const h of visibleHud) {
              const ox = Math.max(0, Math.min(projRect.right, h.right) - Math.max(projRect.left, h.left));
              const oy = Math.max(0, Math.min(projRect.bottom, h.bottom) - Math.max(projRect.top, h.top));
              const ratio = (ox * oy) / surfArea;
              if (ratio > 0.15) {
                surfaceOcclusions.push(
                  `surface(${surf.id})<->${h.sel}(${Math.round(ratio * 100)}%)`
                );
              }
            }
          }
        }
      }

      const cssW = Number(surf.cssWidth || surf.el?.offsetWidth || 0);
      const cssH = Number(surf.cssHeight || surf.el?.offsetHeight || 0);
      const texW = Number(surf.width || surf.fallbackCanvas?.width || 0);
      const texH = Number(surf.height || surf.fallbackCanvas?.height || 0);
      const maxTex = Number(surf.maxTextureSize || 2048);
      const ratioW = cssW > 0 ? texW / cssW : 0;
      const ratioH = cssH > 0 ? texH / cssH : 0;
      const minRatio = Math.min(ratioW, ratioH);
      const projPhysW = projW * dpr;
      const projPhysH = projH * dpr;
      const atCap = Math.max(texW, texH) >= maxTex - 8;
      const minRequiredRatio = Math.max(1.5, dpr * 0.9);
      const densityOk = Boolean(
        texW > 0 &&
        texH > 0 &&
        (atCap || (
          minRatio >= minRequiredRatio &&
          (projPhysW <= 0 || texW >= projPhysW * 0.85) &&
          (projPhysH <= 0 || texH >= projPhysH * 0.85)
        ))
      );
      surfaceDensities.push({
        id: String(surf.id || 'surface'),
        cssW: Math.round(cssW),
        cssH: Math.round(cssH),
        texW: Math.round(texW),
        texH: Math.round(texH),
        projW: Math.round(projW),
        projH: Math.round(projH),
        minRatio: +minRatio.toFixed(2),
        atCap,
        ok: densityOk,
      });
    }
  }

  // 3. Chart legibility bounds (inspect every visible scientific SVG chart)
  let chartSize = null;
  for (const chartEl of document.querySelectorAll('.xy-svg, .hyst-svg, .dist-svg, .heatmap-svg, .timing-svg')) {
    if (!isVisibleEl(chartEl)) continue;
    const r = chartEl.getBoundingClientRect();
    const sz = { width: Math.round(r.width), height: Math.round(r.height) };
    if (!chartSize || (sz.width * sz.height < chartSize.width * chartSize.height)) {
      chartSize = sz;
    }
  }

  // 4. Horizontal truncation audit on visible code/guide/maths/caption/split cards
  const truncSelectors = [
    '.code-trace-card', '.code-trace-card pre', '.hud-guide',
    '.right-dock', '.split-aside', '.scrolly-prose', '.live-maths-panel', '.beat-caption-pill'
  ];
  const horizontalTruncations = [];
  for (const sel of truncSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const inCanvas = Boolean(el.closest('canvas'));
      const inFallback = Boolean(el.closest('.simulify-html-fallback'));
      if (inCanvas || inFallback) {
        let belongsToActive = false;
        for (const activeEl of activeSurfaceEls) {
          if (activeEl === el || activeEl.contains(el)) {
            belongsToActive = true;
            break;
          }
        }
        if (!belongsToActive) continue;
      } else if (!isVisibleEl(el)) {
        continue;
      }
      if (el.clientWidth > 20 && el.scrollWidth > el.clientWidth + 2) {
        horizontalTruncations.push(`${sel}(${el.scrollWidth}>${el.clientWidth})`);
      }
    }
  }

  // 5. Visible HUD & SVG minimum font-size audit (no < 10.5px tiny unreadable text)
  const tinyTexts = [];
  const checkRoots = visibleHud.map((h) => h.el);
  const tagsLayer = document.querySelector('#tags-layer, .tags-layer');
  if (tagsLayer && isVisibleEl(tagsLayer)) checkRoots.push(tagsLayer);
  const visitedTextEls = new Set();

  const inspectTextEl = (el) => {
    if (!el || visitedTextEls.has(el)) return;
    visitedTextEls.add(el);
    if (el.closest('.visually-hidden, .simulify-html-fallback, [data-hud-hidden="true"], [hidden]')) return;
    if (el.closest('sub, sup, .lm-sub, .lm-sup, .lm-subsup, .lm-op-upper, .lm-op-lower')) return;

    let hasDirectText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent && node.textContent.trim().length > 0) {
        hasDirectText = true;
        break;
      }
    }
    if (!hasDirectText) return;

    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;

    const cssPx = parseFloat(cs.fontSize);
    if (!Number.isFinite(cssPx) || cssPx <= 0) return;

    const tag = el.tagName.toLowerCase();
    let effectivePx = cssPx;
    if (tag === 'text' || tag === 'tspan') {
      const svg = el.closest('svg');
      const vb = svg?.viewBox?.baseVal;
      if (svg && vb && vb.width > 0 && vb.height > 0) {
        const sr = svg.getBoundingClientRect();
        if (sr.width > 0 && sr.height > 0) {
          const svgScale = Math.min(sr.width / vb.width, sr.height / vb.height);
          if (svgScale < 0.75) {
            effectivePx = cssPx * svgScale;
          }
        }
      }
    }

    if (cssPx < 10.45 || effectivePx < 9.5) {
      if (tinyTexts.length < 12) {
        const cls = typeof el.className === 'string'
          ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.')
          : (el.getAttribute('class') || '');
        const label = cls ? `${tag}.${cls}` : tag;
        const snippet = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24);
        tinyTexts.push({
          el: label,
          fontSize: +cssPx.toFixed(2),
          effectivePx: +effectivePx.toFixed(2),
          text: snippet,
        });
      }
    }
  };

  for (const root of checkRoots) {
    inspectTextEl(root);
    for (const desc of root.querySelectorAll('*')) {
      inspectTextEl(desc);
    }
  }
  for (const svgText of document.querySelectorAll('.xy-svg text, .hyst-svg text, .dist-svg text, .heatmap-svg text, .timing-svg text, .stage-2d-svg text')) {
    inspectTextEl(svgText);
  }

  // 6. Physical canvas backing alignment (1:1 physical pixel crispness)
  let canvasBacking = null;
  if (canvas && canvasRect && canvasRect.width > 0 && canvasRect.height > 0) {
    const expW = canvasRect.width * dpr;
    const expH = canvasRect.height * dpr;
    canvasBacking = {
      width: canvas.width,
      height: canvas.height,
      cssWidth: +canvasRect.width.toFixed(1),
      cssHeight: +canvasRect.height.toFixed(1),
      dpr: +dpr.toFixed(3),
      aligned: canvas.width >= expW - 2 && canvas.height >= expH - 2,
    };
  }

  // 7. Font audit (`window.__simulify.getFontAudit()` with direct fallback)
  let fontAudit = null;
  if (hook && typeof hook.getFontAudit === 'function') {
    fontAudit = hook.getFontAudit();
  } else if (document.fonts && typeof document.fonts[Symbol.iterator] === 'function') {
    let totalCount = 0;
    let loadedCount = 0;
    let failedCount = 0;
    const loadedFamilies = new Set();
    for (const face of document.fonts) {
      totalCount += 1;
      const fam = String(face.family || '').replace(/^["']|["']$/g, '');
      if (face.status === 'loaded') {
        loadedCount += 1;
        if (fam) loadedFamilies.add(fam);
      } else if (face.status === 'error') {
        failedCount += 1;
      }
    }
    fontAudit = {
      supported: true,
      status: String(document.fonts.status || 'loaded'),
      totalCount,
      loadedCount,
      failedCount,
      loadedFamilies: Array.from(loadedFamilies),
    };
  }

  // 8. Geometry diversity audit (`window.__simulify.getGeometryAudit()`)
  let geometryAudit = null;
  if (hook && typeof hook.getGeometryAudit === 'function') {
    geometryAudit = hook.getGeometryAudit();
  } else if (stageObj && typeof stageObj.getGeometryAudit === 'function') {
    geometryAudit = stageObj.getGeometryAudit();
  }

  // 9. Telemetry: rendererBackend & HTML-in-Canvas support
  const rendererBackend = stageObj?.backendKind || (canvas ? 'webgl2' : 'svg');
  const htmlInCanvasSupported = 'content' in HTMLCanvasElement.prototype;

  // 10. Live counterfactual falsification runner (if exposed)
  let falsifyResult = null;
  if (hook && typeof hook.falsify === 'function') {
    falsifyResult = hook.falsify();
  }

  return {
    title: document.title,
    layoutArchetype,
    ready: Boolean(window.__ready),
    simulifyVersion: Number(hook?.version || 1),
    hasDirector: Boolean(hook && (hook.director || hook.clock)),
    directorState: hook?.director?.getState ? hook.director.getState() : null,
    guideOverflow,
    thumbVisible,
    thumbTop,
    hasCanvas: Boolean(canvas),
    canvasBox: canvasRect ? {
      left: Math.round(canvasRect.left),
      top: Math.round(canvasRect.top),
      width: Math.round(canvasRect.width),
      height: Math.round(canvasRect.height),
    } : null,
    canvasWidth: canvasRect ? Math.round(canvasRect.width) : 0,
    canvasHeight: canvasRect ? Math.round(canvasRect.height) : 0,
    canvasBacking,
    bodyTextLen: document.body.innerText.trim().length,
    proseHits: [...new Set(proseHits)],
    hudOverlaps,
    surfaceOcclusions,
    surfaceDensities,
    tinyTexts,
    chartSize,
    horizontalTruncations,
    fontAudit,
    geometryAudit,
    rendererBackend,
    htmlInCanvasSupported,
    falsifyResult,
  };
}"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class ThreadingVerifyServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    request_queue_size = 64
    daemon_threads = True


def start_server(root_dir: pathlib.Path):
    handler = functools.partial(QuietHandler, directory=str(root_dir))
    httpd = ThreadingVerifyServer(('127.0.0.1', 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def build_browser_args(backend: str = 'auto', no_hic: bool = False):
    hic_flag = (
        '--disable-blink-features=CanvasDrawElement'
        if no_hic
        else '--enable-blink-features=CanvasDrawElement'
    )
    common = [hic_flag]
    if backend == 'webgpu':
        if sys.platform in ('win32', 'darwin'):
            # Windows (D3D12 ANGLE) and macOS (Metal) expose hardware WebGPU natively;
            # forcing Linux Vulkan flags on Windows breaks hardware WebGPU and falls back to WebGL2.
            return common + [
                '--enable-unsafe-webgpu',
                '--ignore-gpu-blocklist',
            ]
        return common + [
            '--use-gl=angle',
            '--use-angle=vulkan',
            '--enable-features=Vulkan',
            '--enable-unsafe-webgpu',
            '--ignore-gpu-blocklist',
        ]
    if backend == 'webgl2':
        return common + [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
        ]
    # auto: SwiftShader WebGL2 + HTML-in-Canvas enabled cleanly for headless CI
    return common + [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--enable-unsafe-webgpu',
    ]


def launch_browser(p, channel: str = 'auto', backend: str = 'auto', no_hic: bool = False):
    args = build_browser_args(backend=backend, no_hic=no_hic)
    headless = backend != 'webgpu'
    if channel == 'chrome':
        attempts = [
            lambda: p.chromium.launch(headless=headless, channel='chrome', args=args),
            lambda: p.chromium.launch(headless=headless, executable_path='/usr/bin/google-chrome', args=args),
        ]
    elif channel == 'chromium':
        attempts = [lambda: p.chromium.launch(headless=headless, args=args)]
    else:
        # Prefer system Chrome (157+ has native HTML-in-Canvas) before Playwright Chromium
        attempts = [
            lambda: p.chromium.launch(headless=headless, channel='chrome', args=args),
            lambda: p.chromium.launch(headless=headless, executable_path='/usr/bin/google-chrome', args=args),
            lambda: p.chromium.launch(headless=headless, args=args),
            lambda: p.chromium.launch(headless=headless, channel='msedge', args=args),
        ]
    last_err = None
    for attempt in attempts:
        try:
            return attempt()
        except Exception as exc:
            last_err = exc
            continue
    raise RuntimeError(f'No Chromium/Chrome/Edge browser executable found for Playwright ({last_err}).')


def analyze_canvas_variance(shot_path: pathlib.Path, canvas_box: dict | None, dpr: float = 1.0) -> tuple[bool, float]:
    """Verify the rendered canvas area is non-blank (catches SwiftShader/WebGPU blank regressions)."""
    if Image is None or np is None or not shot_path.exists():
        return True, -1.0
    img = Image.open(shot_path).convert('RGB')
    arr = np.asarray(img, dtype=np.float32)
    if canvas_box and canvas_box.get('width', 0) > 10 and canvas_box.get('height', 0) > 10:
        x0 = max(0, int(canvas_box['left'] * dpr))
        y0 = max(0, int(canvas_box['top'] * dpr))
        x1 = min(arr.shape[1], int((canvas_box['left'] + canvas_box['width']) * dpr))
        y1 = min(arr.shape[0], int((canvas_box['top'] + canvas_box['height']) * dpr))
        if x1 - x0 > 10 and y1 - y0 > 10:
            arr = arr[y0:y1, x0:x1]
    std = float(arr.std())
    return std > 1.5, round(std, 2)


def png_mean_abs_diff(png_a: bytes, png_b: bytes) -> float:
    if Image is None or np is None:
        return 0.0 if png_a == png_b else 10.0
    a = np.asarray(Image.open(io.BytesIO(png_a)).convert('RGB'), dtype=np.float32)
    b = np.asarray(Image.open(io.BytesIO(png_b)).convert('RGB'), dtype=np.float32)
    if a.shape != b.shape:
        return 255.0
    return float(np.abs(a - b).mean())


def _angle_delta(a: float, b: float) -> float:
    diff = abs((a - b + math.pi) % (2 * math.pi) - math.pi)
    return diff


def capture_initial_4d_snapshot(page) -> dict:
    """Read initial t=0 sparsity metadata BEFORE any multi-beat seek mutates timeline state."""
    return page.evaluate(
        """() => {
          const wb = window.__simulify || {};
          const version = Number(wb.version || 1);
          const tl = typeof wb.getTimelineInfo === 'function' ? wb.getTimelineInfo() : null;
          const cs = wb.clock?.getState?.() ?? null;
          const ds = wb.director?.getState?.() ?? null;
          const dur = Number(tl?.duration ?? cs?.duration ?? ds?.duration ?? 0);
          const cap0 = typeof wb.getCaptionState === 'function' ? wb.getCaptionState() : null;
          const initT = Number(cap0?.t ?? cs?.t ?? ds?.t ?? 0);
          const bootedComplete = Boolean(ds?.complete) || (dur > 0.5 && initT >= dur * 0.92);
          const hasActorFn = typeof wb.getActiveActorCount === 'function';
          let actorsAt0 = null;
          let peakActors = null;
          if (hasActorFn && dur > 0) {
            actorsAt0 = Number(wb.getActiveActorCount(0));
            const samples = [0.25, 0.5, 0.75, 0.95, 1.0].map((u) => Number(wb.getActiveActorCount(u * dur)));
            peakActors = Math.max(actorsAt0, ...samples);
          }
          return {
            version,
            dur,
            initT: +initT.toFixed(3),
            bootedComplete,
            hasActorFn,
            actorsAt0,
            peakActors,
            hasSeek: typeof wb.seek === 'function',
            timeline: tl,
          };
        }"""
    )


def select_multi_beat_samples(timeline: dict | None, dur: float) -> list[dict]:
    """Select key act midpoints (first + middle + final acts, up to 6 acts) from getTimelineInfo()."""
    if not timeline or dur <= 0.2:
        return []
    stages = timeline.get('stages') or []
    beats = timeline.get('beats') or []

    source = stages if len(stages) >= 2 else (beats if len(beats) >= 2 else [])
    chosen = []
    if source:
        n = len(source)
        if n <= 6:
            indices = list(range(n))
        else:
            indices = sorted({0, int((n - 1) * 0.25), n // 2, int((n - 1) * 0.75), n - 1})
        for idx in indices:
            item = source[idx]
            s0 = float(item.get('start', 0.0))
            s1 = float(item.get('end', s0))
            span = max(0.0, s1 - s0)
            if idx == 0:
                t = s0 + span * 0.35
            elif idx == n - 1:
                t = s0 + span * 0.55
            else:
                t = s0 + span * 0.5
            t = max(0.0, min(dur, t))
            chosen.append({
                'id': str(item.get('id') or f'act-{idx + 1}'),
                'label': str(item.get('title') or item.get('id') or f'act-{idx + 1}'),
                't': round(t, 3),
            })
    else:
        for frac, name in ((0.15, 'early'), (0.5, 'mid'), (0.88, 'late')):
            chosen.append({'id': name, 'label': name, 't': round(dur * frac, 3)})

    # Deduplicate timestamps within 0.05s
    dedup = []
    for item in chosen:
        if not dedup or abs(item['t'] - dedup[-1]['t']) > 0.05:
            dedup.append(item)
    return dedup


def run_multi_beat_audit(page, init_probe: dict) -> list[dict]:
    """Seek across key acts/beats and evaluate layout, HUD/surface overlap, truncation, typography & geometry."""
    if not init_probe.get('hasSeek') or init_probe.get('dur', 0) <= 0.2:
        return []

    samples = select_multi_beat_samples(init_probe.get('timeline'), float(init_probe['dur']))
    if not samples:
        return []

    # Pause live playback during multi-beat DOM/3D geometry inspection (without entering export=caption,
    # because HUD panels must remain visible to test real dock collisions and overflow).
    page.evaluate(
        """() => {
          const wb = window.__simulify || {};
          wb.clock?.pause?.();
          wb.director?.pause?.();
        }"""
    )

    beat_reports = []
    for sample in samples:
        page.evaluate(
            """async (t) => {
              const wb = window.__simulify || {};
              const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
              if (typeof wb.seek === 'function') {
                await wb.seek(t);
              }
              if (stageObj?.htmlSurfaces?.flushPaint) {
                await stageObj.htmlSurfaces.flushPaint({ timeoutMs: 200 });
              }
              if (stageObj?.renderNowAsync) {
                await stageObj.renderNowAsync();
              } else if (stageObj?.renderNow) {
                stageObj.renderNow();
              }
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            }""",
            sample['t'],
        )
        m = page.evaluate(EVAL_FRAME_METRICS_JS)
        beat_reports.append({
            'id': sample['id'],
            'label': sample['label'],
            't': sample['t'],
            'guideOverflow': m['guideOverflow'],
            'proseHits': m['proseHits'],
            'hudOverlaps': m['hudOverlaps'],
            'surfaceOcclusions': m['surfaceOcclusions'],
            'surfaceDensities': m['surfaceDensities'],
            'tinyTexts': m['tinyTexts'],
            'chartSize': m['chartSize'],
            'horizontalTruncations': m['horizontalTruncations'],
            'geometryAudit': m['geometryAudit'],
        })

    return beat_reports


def run_v2_4d_probes(page, init_probe: dict, strict_4d: bool) -> dict:
    """Run initial-sparsity and reversible temporal-scrub determinism checks on primary desktop check."""
    v2_active = (init_probe['version'] >= 2) or strict_4d

    # 1. initial-sparsity (computed strictly from pre-seek load snapshot)
    if not v2_active:
        sparsity = {'passed': True, 'skipped': True, 'reason': 'v1 bench'}
    else:
        not_end = not init_probe['bootedComplete']
        actor_growth = True
        if init_probe['hasActorFn'] and init_probe['actorsAt0'] is not None and init_probe['peakActors'] is not None:
            actor_growth = init_probe['actorsAt0'] < init_probe['peakActors']
        elif strict_4d and not init_probe['hasActorFn']:
            actor_growth = False
        sparsity = {
            'passed': bool(not_end and actor_growth),
            'bootedComplete': init_probe['bootedComplete'],
            'initT': init_probe['initT'],
            'actorsAt0': init_probe['actorsAt0'],
            'peakActors': init_probe['peakActors'],
        }

    # 2. temporal-scrub-determinism: seek(0.1T) -> seek(0.5T) -> seek(0.9T) -> seek(0.5T)
    if not v2_active:
        scrub = {'passed': True, 'skipped': True, 'reason': 'v1 bench'}
    elif not init_probe['hasSeek'] or init_probe['dur'] <= 0.2:
        scrub = {
            'passed': False,
            'reason': 'Missing window.__simulify.seek(t) or zero duration',
            'dur': init_probe['dur'],
        }
    else:
        dur = init_probe['dur']
        page.evaluate("() => window.__simulify.enterExportMode?.({ hud: 'hud', muteAudio: true })")

        def seek_and_grab(frac: float) -> bytes:
            page.evaluate(
                """async (t) => {
                  const wb = window.__simulify || {};
                  const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
                  await wb.seek(t);
                  if (stageObj?.htmlSurfaces?.flushPaint) {
                    await stageObj.htmlSurfaces.flushPaint({ timeoutMs: 200 });
                  }
                  if (stageObj?.renderNowAsync) {
                    await stageObj.renderNowAsync();
                  }
                  await new Promise((r) => requestAnimationFrame(() => r()));
                }""",
                frac * dur,
            )
            return page.screenshot(type='png', animations='disabled', timeout=30000)

        png_10 = seek_and_grab(0.1)
        png_50a = seek_and_grab(0.5)
        png_90 = seek_and_grab(0.9)
        png_50b = seek_and_grab(0.5)
        page.evaluate("() => window.__simulify.exitExportMode?.()")

        diff_10_50 = png_mean_abs_diff(png_10, png_50a)
        diff_50_90 = png_mean_abs_diff(png_50a, png_90)
        diff_10_90 = png_mean_abs_diff(png_10, png_90)
        rewind_diff = png_mean_abs_diff(png_50a, png_50b)

        max_progress_diff = max(diff_10_50, diff_50_90, diff_10_90)
        progressed = max_progress_diff >= 0.35
        reversible = rewind_diff <= 1.8
        scrub = {
            'passed': bool(progressed and reversible),
            'maxProgressDiff': round(max_progress_diff, 3),
            'rewindDiff': round(rewind_diff, 3),
            'progressed': progressed,
            'reversible': reversible,
        }

    return {
        'v2Active': v2_active,
        'version': init_probe['version'],
        'sparsity': sparsity,
        'scrub': scrub,
    }


def run_camera_ownership_probe(page, init_probe: dict, v2_active: bool) -> dict:
    """
    Real interactive desktop mouse-drag probe on the 3D canvas:
    drags to orbit the camera, verifies real angular deflection, then waits >= 400ms
    while timeline playback/choreography runs to prove scripts do NOT snap the camera back.
    """
    setup = page.evaluate(
        """(v2Active) => {
          const wb = window.__simulify || {};
          const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
          const canvas = stageObj?.canvas || document.querySelector('canvas');
          if (!stageObj || !canvas || typeof stageObj.getCameraState !== 'function') {
            return { available: false, reason: 'No 3D IsometricStage camera API' };
          }
          // Ensure brush / manual export mode is inactive so user orbit drag owns the canvas
          wb.brush?.setActive?.(false);
          stageObj.setManualMode?.(false);
          stageObj.setOrbitEnabled?.(true);
          stageObj.unlockUserCamera?.();

          // On v2 benches, play clock during the hold so active cameraBeats are tested against user lock
          if (v2Active && wb.clock) {
            const dur = Number(wb.clock.duration || 0);
            if (dur > 1 && typeof wb.seek === 'function') {
              wb.seek(Math.min(dur * 0.2, 2.0));
            }
            wb.clock.play?.();
          }

          const rect = canvas.getBoundingClientRect();
          if (rect.width < 80 || rect.height < 80) {
            return { available: false, reason: 'Canvas too small for drag test' };
          }

          // Find an unobstructed point on the canvas not covered by any HUD overlay
          const candidates = [
            [0.50, 0.50], [0.42, 0.52], [0.56, 0.46],
            [0.36, 0.58], [0.62, 0.58], [0.48, 0.36],
          ];
          let dragStart = null;
          for (const [fx, fy] of candidates) {
            const px = rect.left + rect.width * fx;
            const py = rect.top + rect.height * fy;
            const hit = document.elementFromPoint(px, py);
            if (hit === canvas || (hit && canvas.contains(hit))) {
              dragStart = { x: px, y: py };
              break;
            }
          }
          if (!dragStart) {
            return { available: false, reason: 'Could not locate unobstructed canvas point' };
          }
          return {
            available: true,
            dragStart,
            before: stageObj.getCameraState(),
          };
        }""",
        v2_active,
    )

    if not setup.get('available'):
        return {
            'passed': True,
            'skipped': True,
            'reason': setup.get('reason', 'unavailable'),
        }

    sx = float(setup['dragStart']['x'])
    sy = float(setup['dragStart']['y'])
    before = setup['before']

    page.mouse.move(sx, sy)
    page.mouse.down(button='left')
    for step in range(1, 9):
        page.mouse.move(sx + step * 14.0, sy - step * 5.0)
        page.wait_for_timeout(14)
    page.mouse.up(button='left')

    after_drag = page.evaluate(
        """() => {
          const wb = window.__simulify || {};
          const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
          return stageObj?.getCameraState?.() ?? null;
        }"""
    )

    # Also nudge a scripted camera beat during the 450ms window if choreographer exists
    page.wait_for_timeout(200)
    if v2_active:
        page.evaluate(
            """() => {
              const wb = window.__simulify || {};
              const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
              if (wb.choreographer && stageObj) {
                const dur = Number(wb.clock?.duration || 20);
                wb.choreographer.evaluate(Math.min(dur * 0.65, dur), { apply: true, stage: stageObj });
              }
            }"""
        )
    page.wait_for_timeout(250)

    after_wait = page.evaluate(
        """() => {
          const wb = window.__simulify || {};
          const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
          wb.clock?.pause?.();
          return stageObj?.getCameraState?.() ?? null;
        }"""
    )

    if not after_drag or not after_wait:
        return {'passed': False, 'skipped': False, 'reason': 'Failed to read camera state after drag'}

    drag_delta = (
        _angle_delta(float(after_drag['azimuth']), float(before['azimuth']))
        + abs(float(after_drag['elevation']) - float(before['elevation']))
    )
    drift_after_wait = (
        _angle_delta(float(after_wait['azimuth']), float(after_drag['azimuth']))
        + abs(float(after_wait['elevation']) - float(after_drag['elevation']))
    )
    locked_val = after_wait.get('userCameraLocked')
    rotated = drag_delta >= 0.08
    held_ownership = drift_after_wait <= 0.05
    lock_ok = True if locked_val is None else bool(locked_val)

    return {
        'passed': bool(rotated and held_ownership and (lock_ok or not v2_active)),
        'skipped': False,
        'rotated': rotated,
        'heldOwnership': held_ownership,
        'dragDelta': round(drag_delta, 4),
        'driftAfterWait': round(drift_after_wait, 4),
        'userCameraLocked': locked_val,
    }


def run_three_view_audit(page, init_probe: dict, shot_path: pathlib.Path, v2_active: bool) -> dict:
    """Capture cardinal Front / Side / Top / Iso views and check volumetric 3D LxWxH bounds."""
    if not v2_active:
        return {'passed': True, 'skipped': True, 'reason': 'v1 bench'}

    has_hook = page.evaluate(
        "() => typeof window.__simulify?.setCardinalView === 'function' || typeof (window.__simulify?.stage?.stage || window.__simulify?.stage || window.__simulify?.scene?.stage)?.setCardinalView === 'function'"
    )
    if not has_hook:
        return {
            'passed': False,
            'skipped': False,
            'reason': 'Missing setCardinalView() on window.__simulify / stage',
        }

    dur = float(init_probe.get('dur') or 0)
    peak_t = round(dur * 0.85, 3) if dur > 0 else 0.0
    if dur > 0:
        page.evaluate(
            """(t) => {
              const h = window.__simulify;
              if (h?.clock?.pause) h.clock.pause();
              else if (h?.director?.pause) h.director.pause();
              if (typeof h?.seek === 'function') h.seek(t);
            }""",
            peak_t,
        )
        page.wait_for_timeout(120)

    view_shots = {}
    view_pngs = {}
    bounds = None
    for vname in ('front', 'side', 'top', 'iso'):
        res = page.evaluate(
            """(v) => {
              const h = window.__simulify;
              if (typeof h?.setCardinalView === 'function') return h.setCardinalView(v, { unlock: true });
              const st = h?.stage?.stage || h?.stage || h?.scene?.stage || null;
              return st?.setCardinalView?.(v, { unlock: true }) ?? null;
            }""",
            vname,
        )
        if res and res.get('bounds') and bounds is None:
            bounds = res['bounds']
        page.wait_for_timeout(100)
        v_path = shot_path.with_name(f'{shot_path.stem}-view-{vname}{shot_path.suffix}')
        v_path.parent.mkdir(parents=True, exist_ok=True)
        png_bytes = page.screenshot(path=str(v_path), animations='disabled', timeout=45000)
        view_shots[vname] = str(v_path)
        view_pngs[vname] = png_bytes

    diff_front_side = png_mean_abs_diff(view_pngs['front'], view_pngs['side'])
    diff_front_top = png_mean_abs_diff(view_pngs['front'], view_pngs['top'])
    views_distinct = (
        (diff_front_side < 0 or diff_front_side >= 0.4)
        and (diff_front_top < 0 or diff_front_top >= 0.4)
    )

    flatness_ratio = float(bounds.get('flatnessRatio', 0.0)) if bounds else 0.0
    bounds_ok = bool(
        bounds
        and float(bounds.get('width', 0)) > 0
        and float(bounds.get('height', 0)) > 0
        and float(bounds.get('depth', 0)) > 0
        and flatness_ratio >= 0.08
    )

    return {
        'passed': bool(bounds_ok and views_distinct),
        'skipped': False,
        'sampleTime': peak_t,
        'bounds': bounds,
        'flatnessRatio': round(flatness_ratio, 4),
        'boundsOk': bounds_ok,
        'viewsDistinct': views_distinct,
        'diffFrontSide': round(diff_front_side, 3),
        'diffFrontTop': round(diff_front_top, 3),
        'screenshots': view_shots,
    }


def check_target(
    browser,
    base_url: str,
    rel_url: str,
    width: int,
    height: int,
    shot_path: pathlib.Path,
    *,
    dpr: float = 1.0,
    run_4d_checks: bool = False,
    strict_4d: bool = False,
    is_probe: bool = False,
    requested_backend: str = 'auto',
):
    for attempt in range(2):
        console_errors = []
        gpu_errors = []
        page_errors = []
        failed_requests = []

        ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
        page = ctx.new_page()

        def on_console(m):
            txt = m.text
            low = txt.lower()
            if m.type == 'error':
                console_errors.append(txt)
            if m.type in ('error', 'warning') and any(p in low for p in GPU_ERROR_PATTERNS):
                gpu_errors.append(txt)

        page.on('console', on_console)
        page.on('pageerror', lambda err: page_errors.append(str(err)))
        page.on('requestfailed', lambda req: failed_requests.append(f'{req.method} {req.url}'))

        url = urljoin(base_url, rel_url.lstrip('/'))
        page.goto(url, wait_until='domcontentloaded', timeout=25000)

        try:
            page.wait_for_function('window.__ready === true', timeout=12000)
        except Exception:
            page.wait_for_timeout(1200)

        # Wait for offline @font-face library to settle before auditing typography
        page.evaluate(
            """() => {
              if (!document.fonts || !document.fonts.ready) return null;
              return Promise.race([
                document.fonts.ready.catch(() => null),
                new Promise((r) => setTimeout(r, 1500)),
              ]);
            }"""
        )
        page.wait_for_timeout(350)

        init_probe = capture_initial_4d_snapshot(page)
        metrics = page.evaluate(EVAL_FRAME_METRICS_JS)

        shot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shot_path), animations='disabled', timeout=45000)

        # Multi-beat inspection on desktop viewports (not pinned deep-link probes)
        has_pinned_query = any(k in rel_url for k in ('stage=', 't=', 'end'))
        beat_reports = []
        if width > 900 and not is_probe and not has_pinned_query:
            beat_reports = run_multi_beat_audit(page, init_probe)

        v2_probes = None
        if run_4d_checks:
            v2_probes = run_v2_4d_probes(page, init_probe, strict_4d=strict_4d)

        v2_active = (metrics['simulifyVersion'] >= 2) or strict_4d

        camera_ownership = {'passed': True, 'skipped': True, 'reason': 'non-primary viewport'}
        three_views = {'passed': True, 'skipped': True, 'reason': 'non-primary viewport'}
        if run_4d_checks and width > 900 and metrics['hasCanvas']:
            three_views = run_three_view_audit(page, init_probe, shot_path, v2_active)
            camera_ownership = run_camera_ownership_probe(page, init_probe, v2_active)

        page.close()
        ctx.close()

        is_win_buf_blip = any('ERR_NO_BUFFER_SPACE' in e for e in console_errors)
        if is_win_buf_blip and attempt == 0:
            time.sleep(0.25)
            continue

        canvas_non_blank, canvas_std = (True, -1.0)
        if metrics['hasCanvas']:
            canvas_non_blank, canvas_std = analyze_canvas_variance(shot_path, metrics.get('canvasBox'), dpr=dpr)

        # Aggregate multi-beat metrics with initial snapshot
        all_prose_hits = set(metrics['proseHits'])
        all_hud_overlaps = list(metrics['hudOverlaps'])
        all_surface_occlusions = list(metrics['surfaceOcclusions'])
        all_truncations = list(metrics['horizontalTruncations'])
        all_tiny_texts = list(metrics['tinyTexts'])
        all_surface_densities = [
            {**d, 'beat': 'init'} for d in (metrics.get('surfaceDensities') or [])
        ]

        overflow_beats = ['init'] if metrics['guideOverflow'] else []
        chart_sizes = [metrics['chartSize']] if metrics['chartSize'] is not None else []
        chart_fail_beats = []
        if metrics['chartSize'] is not None and (
            metrics['chartSize']['width'] < 200 or metrics['chartSize']['height'] < 85
        ):
            chart_fail_beats.append('init')

        # Collect geometry audits across initial + all sampled beats; pick peak populated beat
        geo_candidates = []
        if metrics.get('geometryAudit'):
            geo_candidates.append(('init', metrics['geometryAudit']))

        for br in beat_reports:
            btag = f"{br['id']}@{br['t']}s"
            for w in br['proseHits']:
                all_prose_hits.add(w)
            if br['guideOverflow']:
                overflow_beats.append(btag)
            for ov in br['hudOverlaps']:
                all_hud_overlaps.append(f'{btag}:{ov}')
            for socc in br['surfaceOcclusions']:
                all_surface_occlusions.append(f'{btag}:{socc}')
            for tr in br['horizontalTruncations']:
                all_truncations.append(f'{btag}:{tr}')
            for tt in br['tinyTexts']:
                if len(all_tiny_texts) < 16:
                    all_tiny_texts.append({**tt, 'beat': btag})
            for sd in br['surfaceDensities']:
                all_surface_densities.append({**sd, 'beat': btag})
            if br['chartSize'] is not None:
                chart_sizes.append(br['chartSize'])
                if br['chartSize']['width'] < 200 or br['chartSize']['height'] < 85:
                    chart_fail_beats.append(btag)
            if br.get('geometryAudit'):
                geo_candidates.append((btag, br['geometryAudit']))

        # Deduplicate overlap/truncation labels for readability
        all_prose_hits_list = sorted(all_prose_hits)
        all_hud_overlaps = list(dict.fromkeys(all_hud_overlaps))
        all_surface_occlusions = list(dict.fromkeys(all_surface_occlusions))
        all_truncations = list(dict.fromkeys(all_truncations))

        worst_chart_size = None
        for csz in chart_sizes:
            if worst_chart_size is None or (
                csz['width'] * csz['height'] < worst_chart_size['width'] * worst_chart_size['height']
            ):
                worst_chart_size = csz

        any_guide_overflow = len(overflow_beats) > 0
        metrics['guideOverflow'] = any_guide_overflow

        prose_ok = len(all_prose_hits_list) == 0
        min_canvas_w_ratio = 0.40 if metrics.get('layoutArchetype') in ('ab-compare', 'multi-view') else 0.45
        frame_ok = (width <= 900) or (not metrics['hasCanvas']) or (
            metrics['canvasWidth'] >= width * min_canvas_w_ratio and metrics['canvasHeight'] >= height * 0.45
        )
        chart_ok = len(chart_fail_beats) == 0
        hud_ok = (width <= 900) or (len(all_hud_overlaps) == 0 and len(all_surface_occlusions) == 0)

        falsify_res = metrics.get('falsifyResult')
        if v2_active:
            falsify_ok = falsify_res is not None and bool(falsify_res.get('passed'))
        else:
            falsify_ok = True if falsify_res is None else bool(falsify_res.get('passed'))

        trunc_ok = (not v2_active) or (width <= 900) or (len(all_truncations) == 0)
        gpu_ok = len(gpu_errors) == 0
        visual_integrity_ok = canvas_non_blank and trunc_ok and gpu_ok

        # Typography & Crispness gate (enforced on v2 benches)
        font_audit = metrics.get('fontAudit')
        fonts_ok = bool(
            font_audit
            and font_audit.get('loadedCount', 0) >= 2
            and font_audit.get('failedCount', 0) == 0
        )
        canvas_backing = metrics.get('canvasBacking')
        canvas_backing_ok = (not metrics['hasCanvas']) or bool(canvas_backing and canvas_backing.get('aligned'))
        tiny_text_ok = len(all_tiny_texts) == 0
        surface_density_ok = all(bool(d.get('ok')) for d in all_surface_densities)
        if v2_active:
            typo_ok = fonts_ok and canvas_backing_ok and tiny_text_ok and surface_density_ok
        else:
            typo_ok = True

        # Anti-Cuboid Geometry Diversity gate (enforced on desktop v2 3D benches across populated beats;
        # v1 benches, 2D stages, mobile sparse-t=0 viewports & pinned single-beat probes remain exempt)
        geo_enforced = bool(v2_active and metrics['hasCanvas'] and width > 900 and not is_probe and not has_pinned_query)
        best_geo_beat = None
        best_geo_audit = None
        for btag, audit in geo_candidates:
            if best_geo_audit is None or (
                int(audit.get('totalMeshes', 0)) >= int(best_geo_audit.get('totalMeshes', 0))
            ):
                best_geo_beat = btag
                best_geo_audit = audit

        if not geo_enforced:
            skip_reason = (
                'v1 bench'
                if not v2_active
                else ('2D stage (no 3D canvas)' if not metrics['hasCanvas'] else 'evaluated on desktop multi-beat check')
            )
            geo_res = {
                'passed': True,
                'skipped': True,
                'enforced': False,
                'reason': skip_reason,
                'sampleBeat': best_geo_beat,
                'audit': best_geo_audit,
            }
        elif best_geo_audit is None:
            geo_res = {
                'passed': False,
                'skipped': False,
                'enforced': True,
                'reason': 'Missing window.__simulify.getGeometryAudit()',
                'sampleBeat': None,
                'audit': None,
            }
        else:
            cuboid_ratio = float(best_geo_audit.get('cuboidRatio', 1.0))
            sculpted_meshes = int(best_geo_audit.get('sculptedMeshes', 0))
            total_meshes = int(best_geo_audit.get('totalMeshes', 0))
            geo_passed = total_meshes > 0 and cuboid_ratio <= 0.70 and sculpted_meshes > 0
            geo_res = {
                'passed': geo_passed,
                'skipped': False,
                'enforced': True,
                'sampleBeat': best_geo_beat,
                'cuboidRatio': cuboid_ratio,
                'sculptedMeshes': sculpted_meshes,
                'cuboidMeshes': int(best_geo_audit.get('cuboidMeshes', 0)),
                'totalMeshes': total_meshes,
                'audit': best_geo_audit,
            }

        sparsity_res = v2_probes['sparsity'] if v2_probes else {'passed': True, 'skipped': True}
        scrub_res = v2_probes['scrub'] if v2_probes else {'passed': True, 'skipped': True}

        oracle = {
            'prose': {'passed': prose_ok, 'hits': all_prose_hits_list},
            'frame': {'passed': frame_ok, 'w': metrics['canvasWidth'], 'h': metrics['canvasHeight']},
            'chart': {'passed': chart_ok, 'size': worst_chart_size, 'failedBeats': chart_fail_beats},
            'hud': {
                'passed': hud_ok,
                'overlaps': all_hud_overlaps,
                'surfaceOcclusions': all_surface_occlusions,
                'sampledBeats': len(beat_reports),
            },
            'multiBeat': {
                'sampledCount': len(beat_reports),
                'beats': [{'id': b['id'], 't': b['t']} for b in beat_reports],
                'overflowBeats': overflow_beats,
                'chartFailBeats': chart_fail_beats,
            },
            'falsify': falsify_res,
            'mandatoryFalsify': {'passed': falsify_ok, 'enforced': v2_active},
            'initialSparsity': sparsity_res,
            'temporalScrubDeterminism': scrub_res,
            'visualIntegrity': {
                'passed': visual_integrity_ok,
                'canvasNonBlank': canvas_non_blank,
                'canvasStd': canvas_std,
                'horizontalTruncations': all_truncations,
                'gpuErrors': gpu_errors,
            },
            'typographyCrispness': {
                'passed': typo_ok,
                'skipped': not v2_active,
                'enforced': v2_active,
                'fontsOk': fonts_ok,
                'fontAudit': font_audit,
                'canvasBackingOk': canvas_backing_ok,
                'canvasBacking': canvas_backing,
                'tinyTextOk': tiny_text_ok,
                'tinyTexts': all_tiny_texts,
                'surfaceDensityOk': surface_density_ok,
                'surfaceDensities': all_surface_densities,
            },
            'geometryDiversity': geo_res,
            'threeViews': three_views,
            'cameraOwnership': camera_ownership,
            'backend': {
                'requested': requested_backend,
                'actual': metrics['rendererBackend'],
                'enforced': bool(requested_backend == 'webgpu' and metrics['hasCanvas']),
                'passed': not (
                    requested_backend == 'webgpu'
                    and metrics['hasCanvas']
                    and metrics['rendererBackend'] != 'webgpu'
                ),
            },
        }

        backend_ok = bool(oracle['backend']['passed'])

        telemetry = {
            'v2Active': v2_active,
            'simulifyVersion': metrics['simulifyVersion'],
            'layoutArchetype': metrics.get('layoutArchetype', 'fullbleed-hud'),
            'rendererBackend': metrics['rendererBackend'],
            'requestedBackend': requested_backend,
            'htmlInCanvasSupported': metrics['htmlInCanvasSupported'],
            'canvasNonBlank': canvas_non_blank,
            'canvasStd': canvas_std,
            'dpr': dpr,
        }

        ok = (
            len(console_errors) == 0
            and len(page_errors) == 0
            and len(failed_requests) == 0
            and (width <= 900 or not any_guide_overflow)
            and backend_ok
            and prose_ok
            and frame_ok
            and chart_ok
            and hud_ok
            and falsify_ok
            and visual_integrity_ok
            and typo_ok
            and bool(geo_res.get('passed', True))
            and bool(three_views.get('passed', True))
            and bool(camera_ownership.get('passed', True))
            and bool(sparsity_res.get('passed', True))
            and bool(scrub_res.get('passed', True))
        )
        if width <= 900 and metrics['thumbVisible'] is True and metrics['thumbTop'] is not None:
            if metrics['thumbTop'] > height:
                ok = False

        return {
            'url': rel_url,
            'viewport': f'{width}x{height}',
            'screenshot': str(shot_path),
            'consoleErrors': console_errors,
            'pageErrors': page_errors,
            'failedRequests': failed_requests,
            'telemetry': telemetry,
            'metrics': metrics,
            'oracle': oracle,
            'passed': ok,
        }


def main():
    parser = argparse.ArgumentParser(
        description='Verify Simulify pages across 3 viewports, multi-beat timelines, deep-links, and v2.1 4D gates.'
    )
    parser.add_argument('--root', required=True, help='Root directory to serve over HTTP')
    parser.add_argument('--entry', default='index.html', help='Entry URL relative to root')
    parser.add_argument('--probe', action='append', default=[], help='Additional deep-link query probes (e.g. "?stage=act-2&end")')
    parser.add_argument('--out-dir', default='./.verify-shots', help='Screenshot & receipt output folder')
    parser.add_argument('--channel', choices=['auto', 'chrome', 'chromium'], default='auto', help='Browser channel')
    parser.add_argument('--backend', choices=['auto', 'webgl2', 'webgpu'], default='auto', help='Graphics backend')
    parser.add_argument('--dpr', type=float, default=1.0, help='Device scale factor for browser contexts (default: 1.0)')
    parser.add_argument(
        '--no-hic',
        action='store_true',
        help='Disable CanvasDrawElement (HTML-in-Canvas) to verify non-HIC browser fallback parity',
    )
    parser.add_argument('--strict-4d', action='store_true', help='Enforce Simulify v2 4D quality legs even on v1 benches')
    args = parser.parse_args()

    root_dir = pathlib.Path(args.root).resolve()
    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    dpr = max(1.0, min(3.0, float(args.dpr)))

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        print(f'ERROR: playwright Python package is required ({exc}). Try: uv run scripts/verify_stage.py ...', file=sys.stderr)
        sys.exit(2)

    httpd, port = start_server(root_dir)
    base_url = f'http://127.0.0.1:{port}/'
    slug = pathlib.Path(args.entry).parent.name or pathlib.Path(args.entry).stem

    results = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, channel=args.channel, backend=args.backend, no_hic=args.no_hic)
            for idx, (vw, vh) in enumerate([(1280, 800), (1440, 900), (390, 844)]):
                shot = out_dir / f'{slug}-{vw}x{vh}.png'
                results.append(
                    check_target(
                        browser,
                        base_url,
                        args.entry,
                        vw,
                        vh,
                        shot,
                        dpr=dpr,
                        run_4d_checks=(idx == 0),
                        strict_4d=args.strict_4d,
                        is_probe=False,
                        requested_backend=args.backend,
                    )
                )

            for idx, probe in enumerate(args.probe):
                sep = '' if probe.startswith('?') else '?'
                probe_url = f'{args.entry}{sep}{probe}'
                shot = out_dir / f'{slug}-probe-{idx + 1}.png'
                results.append(
                    check_target(
                        browser,
                        base_url,
                        probe_url,
                        1280,
                        800,
                        shot,
                        dpr=dpr,
                        run_4d_checks=False,
                        strict_4d=args.strict_4d,
                        is_probe=True,
                        requested_backend=args.backend,
                    )
                )

            browser.close()
    finally:
        httpd.shutdown()

    passed_all = all(r['passed'] for r in results)
    receipt = {
        'root': str(root_dir),
        'entry': args.entry,
        'channel': args.channel,
        'backend': args.backend,
        'dpr': dpr,
        'noHic': args.no_hic,
        'strict4d': args.strict_4d,
        'passed': passed_all,
        'checks': results,
    }
    receipt_path = out_dir / f'{slug}-receipt.json'
    receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding='utf-8')

    print(f'Receipt: {receipt_path}')
    for r in results:
        tag = 'PASS' if r['passed'] else 'FAIL'
        ora = r.get('oracle', {})
        tel = r.get('telemetry', {})
        p_str = 'OK' if ora.get('prose', {}).get('passed') else f'FAIL({",".join(ora.get("prose", {}).get("hits", []))})'
        f_info = ora.get('frame', {})
        f_str = 'OK' if f_info.get('passed') else f'FAIL({f_info.get("w")}x{f_info.get("h")})'
        c_info = ora.get('chart', {})
        c_sz = c_info.get('size')
        c_str = 'SKIP' if c_sz is None else ('OK' if c_info.get('passed') else f'FAIL({c_sz.get("width")}x{c_sz.get("height")})')
        h_info = ora.get('hud', {})
        h_issues = list(h_info.get('overlaps', [])) + list(h_info.get('surfaceOcclusions', []))
        h_str = 'OK' if h_info.get('passed') else f'FAIL({",".join(h_issues[:3])})'
        fal = ora.get('falsify')
        if fal is None:
            fal_str = 'FAIL(missing)' if ora.get('mandatoryFalsify', {}).get('enforced') else 'N/A'
        else:
            ok_cnt = sum(1 for a in fal.get('assertions', []) if a.get('passed'))
            tot_cnt = len(fal.get('assertions', []))
            fal_str = f'{ok_cnt}/{tot_cnt}'
        sp = ora.get('initialSparsity', {})
        sp_str = 'SKIP' if sp.get('skipped') else ('OK' if sp.get('passed') else f'FAIL(a0={sp.get("actorsAt0")},pk={sp.get("peakActors")})')
        sc = ora.get('temporalScrubDeterminism', {})
        sc_str = 'SKIP' if sc.get('skipped') else ('OK' if sc.get('passed') else f'FAIL(p={sc.get("maxProgressDiff")},rw={sc.get("rewindDiff")})')
        vi = ora.get('visualIntegrity', {})
        vi_str = 'OK' if vi.get('passed') else f'FAIL(blank={not vi.get("canvasNonBlank")},trunc={len(vi.get("horizontalTruncations", []))})'
        ty = ora.get('typographyCrispness', {})
        if ty.get('skipped'):
            ty_str = 'SKIP'
        elif ty.get('passed'):
            ty_str = 'OK'
        else:
            ty_bits = []
            if not ty.get('fontsOk'):
                fa = ty.get('fontAudit') or {}
                ty_bits.append(f'fonts={fa.get("loadedCount", 0)}/fail={fa.get("failedCount", 0)}')
            if not ty.get('canvasBackingOk'):
                ty_bits.append('backing')
            if not ty.get('tinyTextOk'):
                ty_bits.append(f'tiny={len(ty.get("tinyTexts", []))}')
            if not ty.get('surfaceDensityOk'):
                ty_bits.append('hicDensity')
            ty_str = f'FAIL({",".join(ty_bits)})'
        gd = ora.get('geometryDiversity', {})
        if gd.get('skipped'):
            gd_str = 'SKIP'
        elif gd.get('passed'):
            gd_str = f'OK(c={gd.get("cuboidRatio")},s={gd.get("sculptedMeshes")})'
        else:
            gd_str = f'FAIL(c={gd.get("cuboidRatio")},s={gd.get("sculptedMeshes")})'
        tv = ora.get('threeViews', {})
        if tv.get('skipped'):
            tv_str = 'SKIP'
        elif tv.get('passed'):
            tv_str = f'OK(flat={tv.get("flatnessRatio")})'
        else:
            tv_str = f'FAIL(flat={tv.get("flatnessRatio")},dist={tv.get("viewsDistinct")})'
        co = ora.get('cameraOwnership', {})
        if co.get('skipped'):
            co_str = 'SKIP'
        elif co.get('passed'):
            co_str = f'OK(d={co.get("dragDelta")})'
        else:
            co_str = f'FAIL(d={co.get("dragDelta")},drift={co.get("driftAfterWait")},lock={co.get("userCameraLocked")})'
        mb_cnt = ora.get('multiBeat', {}).get('sampledCount', 0)
        bk_info = ora.get('backend', {})
        bk_str = str(tel.get('rendererBackend'))
        if bk_info.get('enforced') and not bk_info.get('passed', True):
            bk_str = f'{bk_str}(FAIL:expected={bk_info.get("requested")})'

        print(
            f'  [{tag}] {r["url"]} @ {r["viewport"]} | '
            f'backend={bk_str} hic={tel.get("htmlInCanvasSupported")} beats={mb_cnt} | '
            f'console={len(r["consoleErrors"])} pageErr={len(r["pageErrors"])} '
            f'reqFail={len(r["failedRequests"])} overflow={r["metrics"]["guideOverflow"]} '
            f'oracle=[prose:{p_str} frame:{f_str} chart:{c_str} hud:{h_str} falsify:{fal_str} '
            f'sparse:{sp_str} scrub:{sc_str} vis:{vi_str} typo:{ty_str} geo:{gd_str} views:{tv_str} cam:{co_str}] '
            f'-> {pathlib.Path(r["screenshot"]).name}'
        )
    sys.exit(0 if passed_all else 1)


if __name__ == '__main__':
    main()
