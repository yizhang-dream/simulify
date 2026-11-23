#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.45", "numpy>=1.24", "pillow>=9.0"]
# ///
"""
Automated 3-viewport, deep-link, multi-beat, and Simulify v3.1 Layout-Aware 4D & Look-Dev Quality Oracle.

Spins up an ephemeral loopback HTTP server, verifies zero console/page/request errors,
zero unintended guide-card overflow, mobile thumb-dock visibility, optional URL probes,
quantitative look-dev pixel/scene telemetry, a 2x center close-up crop, and writes
screenshots + a machine-readable JSON receipt.

Rendering, layout, and typography checks are independent of the profile.
PROFILE_GATES controls the severity of the 4D and 3D checks for v2/v3 benches
(`window.__simulify.version >= 2` or `--strict-4d`). v1 benches retain legacy checks.
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
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    np = None
    Image = None
    ImageDraw = None
    ImageFont = None


GPU_ERROR_PATTERNS = (
    'uncapturederror',
    'gl_invalid',
    'context_lost',
    'webgpu',
    'shader error',
    'three.webglprogram',
)


_MECHANICAL_GATES = {
    'geometry_diversity': 'hard',
    'three_views': 'hard',
    'initial_sparsity': 'hard',
    'temporal_scrub': 'hard',
    'camera_ownership': 'hard',
    'mandatory_falsify': 'hard',
}
_DIRECT_GATES = {
    **_MECHANICAL_GATES,
    'geometry_diversity': 'advisory',
    'three_views': 'advisory',
    'initial_sparsity': 'advisory',
}
PROFILE_GATES = {
    'mechanical-3d': _MECHANICAL_GATES.copy(),
    'field-math': _DIRECT_GATES,
    'sandbox-direct': _DIRECT_GATES.copy(),

}


def resolve_effective_profile(cli_profile, hook_profile, has_3d, is_v2) -> str | None:
    for profile in (cli_profile, hook_profile):
        if isinstance(profile, str) and profile in PROFILE_GATES:
            return profile
    if is_v2:
        return 'mechanical-3d'
    return None


def evaluate_profile_policy(profile, *, has_3d=True, duration=None) -> dict[str, str]:
    if profile is None:
        policy = dict.fromkeys(_MECHANICAL_GATES, 'skipped')
        policy.update(camera_ownership='hard', mandatory_falsify='hard')
    else:
        policy = PROFILE_GATES[profile].copy()
    if not has_3d and profile != 'mechanical-3d':
        policy.update(geometry_diversity='skipped', three_views='skipped', camera_ownership='skipped')
    if duration is not None and duration <= 0.2 and profile in ('field-math', 'sandbox-direct'):
        policy['temporal_scrub'] = 'skipped'
    return policy


def evaluate_falsify(result, is_v2: bool, *, from_model=False, is_v3=False) -> bool:
    structured = is_v3 or from_model or (isinstance(result, dict) and result.get('version') == 3)
    if not is_v2 and not structured:
        return result is None or (isinstance(result, dict) and bool(result.get('passed')))
    if not isinstance(result, dict) or result.get('passed') is not True:
        return False
    assertions = result.get('assertions')
    if not isinstance(assertions, list) or not assertions:
        return False
    if structured and (
        not from_model or type(result.get('version')) is not int or result['version'] != 3
        or any(type(result.get(key)) is not int or result[key] != len(assertions)
               for key in ('total', 'passedCount'))
    ):
        return False
    for assertion in assertions:
        if not isinstance(assertion, dict) or assertion.get('passed') is not True:
            return False
        name = assertion.get('name')
        if not isinstance(name, str) or not name.strip():
            return False
        if structured:
            comparisons = assertion.get('comparisons')
            if type(comparisons) is not int or comparisons < 1:
                return False
        base, mutant = assertion.get('baseMetric'), assertion.get('mutantMetric')
        if not structured and ('baseMetric' in assertion or 'mutantMetric' in assertion):
            if base is None and mutant is None:
                return False
        if base is not None or mutant is not None:
            if not all(type(metric) in (int, float) and math.isfinite(metric) for metric in (base, mutant)):
                return False
            if base == mutant:
                return False
    return True


def entry_url(entry: str, backend: str, probe: str = '') -> str:
    url = urlsplit(entry)
    overrides = parse_qsl(probe.removeprefix('?'), keep_blank_values=True)
    if backend != 'auto':
        overrides = [(key, value) for key, value in overrides if key != 'backend']
        overrides.append(('backend', backend))
    keys = {key for key, _ in overrides}
    query = [(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if key not in keys]
    query.extend(overrides)
    return url._replace(query=urlencode(query)).geturl()


def skipped_gate(reason: str) -> dict:
    return {'passed': True, 'skipped': True, 'reason': reason}


EVAL_FRAME_METRICS_JS = """(collectGeometry) => {
  const shellEl = document.querySelector('.artboard-shell');
  const layoutArchetype = shellEl?.dataset?.layout || 'fullbleed-hud';
  const thumbDock = document.querySelector('.thumb-dock');
  const hook = window.__simulify || null;
  const stageObj = hook?.stage?.stage || hook?.stage || hook?.scene?.stage || null;
  const canvas = stageObj?.canvas || document.querySelector('.stage-canvas') || document.querySelector('canvas');

  const isVisibleEl = (el) => {
    if (!el || el.hidden || el.getAttribute('data-hud-hidden') === 'true') return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const guideOverflow = Array.from(document.querySelectorAll('.hud-guide, .right-dock, .split-aside')).some(
    (guide) => isVisibleEl(guide) && !['auto', 'scroll'].includes(getComputedStyle(guide).overflowY)
      && guide.scrollHeight > guide.clientHeight + 2
  );
  const thumbVisible = thumbDock ? getComputedStyle(thumbDock).display !== 'none' : null;
  const thumbTop = thumbDock ? thumbDock.getBoundingClientRect().top : null;
  const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
  const stageRect = isVisibleEl(canvas) && canvas.width > 0 && canvas.height > 0
    ? canvasRect : null;

  // 1. Prose lint (AI clichés check on visible prose across all layout archetypes)
  const AI_CLICHES = [
    '本质上', '值得注意的是', '总而言之', '综上所述', '不难发现', '众所周知',
    '至关重要', '深入探讨', '赋能', '旨在', '极大地', '正如我们所见'
  ];
  const proseEls = document.querySelectorAll('.hud-guide, .right-dock, .split-aside, .question-chain, .brand-sub, .beat-caption-pill, .hero-act-banner');
  const proseHits = [];
  for (const el of proseEls) {
    if (!isVisibleEl(el)) continue;
    const txt = el.innerText || '';
    for (const word of AI_CLICHES) {
      if (txt.includes(word)) proseHits.push(word);
    }
  }

  // 2. HUD panel mutual overlap check, including .beat-caption-pill & .view-cube-dock
  const hudSelectors = [
    '.hud-top-left', '.top-ribbon', '.beat-caption-pill', '.hud-guide', '.right-dock',
    '.split-aside', '.scrolly-prose', '.hud-bottom-left', '.bottom-left-dock',
    '.hud-bottom-center', '.bottom-transport', '.bench-transport', '.view-cube-dock'
  ];
  const visibleHud = [];
  const seenHudEls = new Set();
  for (const sel of hudSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seenHudEls.has(el) || !isVisibleEl(el)) continue;
      seenHudEls.add(el);
      const r = el.getBoundingClientRect();
      visibleHud.push({ sel, el, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
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
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth + 2) {
    horizontalTruncations.push(`viewport(${root.scrollWidth}>${root.clientWidth})`);
  }
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
  for (const svgText of document.querySelectorAll('.xy-svg text, .hyst-svg text, .dist-svg text, .heatmap-svg text, .timing-svg text')) {
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
  if (collectGeometry) {
    if (typeof hook?.getGeometryAudit === 'function') {
      geometryAudit = hook.getGeometryAudit();
    } else if (typeof stageObj?.getGeometryAudit === 'function') {
      geometryAudit = stageObj.getGeometryAudit();
    }
  }

  // 9. Telemetry: rendererBackend, HTML-in-Canvas support & v3.1 look-dev telemetry
  const rendererBackend = stageObj?.backendKind || (canvas ? 'unknown' : 'svg');
  const htmlInCanvasSupported = 'content' in HTMLCanvasElement.prototype;
  let lookDevTelemetry = null;
  try {
    if (typeof stageObj?.getTelemetry === 'function') {
      lookDevTelemetry = stageObj.getTelemetry();
    } else if (typeof window.__SIMULIFY_TELEMETRY__ === 'function') {
      lookDevTelemetry = window.__SIMULIFY_TELEMETRY__();
    } else if (window.__SIMULIFY_TELEMETRY__ && typeof window.__SIMULIFY_TELEMETRY__ === 'object') {
      lookDevTelemetry = window.__SIMULIFY_TELEMETRY__;
    }
  } catch (err) {
    lookDevTelemetry = { error: String(err) };
  }

  // 10. Live counterfactual falsification runner (if exposed)
  let falsifyResult = null;
  const hasModel = typeof hook?.model?.falsify === "function";
  if (hasModel) {
    falsifyResult = hook.model.falsify();
  } else if (typeof hook?.falsify === 'function') {
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
    hasActiveStage: Boolean(stageRect),
    stageWidth: stageRect ? Math.round(stageRect.width) : 0,
    stageHeight: stageRect ? Math.round(stageRect.height) : 0,
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
    lookDevTelemetry,
    falsifyResult,
    hasModel,
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


def _crop_canvas_roi(img, canvas_box: dict | None, dpr: float = 1.0):
    """Crop PIL RGB image to the active canvas bounding box (in physical pixels)."""
    w, h = img.size
    if canvas_box and canvas_box.get('width', 0) > 10 and canvas_box.get('height', 0) > 10:
        x0 = max(0, int(canvas_box['left'] * dpr))
        y0 = max(0, int(canvas_box['top'] * dpr))
        x1 = min(w, int((canvas_box['left'] + canvas_box['width']) * dpr))
        y1 = min(h, int((canvas_box['top'] + canvas_box['height']) * dpr))
        if x1 - x0 > 10 and y1 - y0 > 10:
            return img.crop((x0, y0, x1, y1))
    return img


def analyze_canvas_variance(shot_path: pathlib.Path, canvas_box: dict | None, dpr: float = 1.0) -> tuple[bool, float]:
    """Verify the rendered canvas area is non-blank (catches SwiftShader/WebGPU blank regressions)."""
    if Image is None or np is None:
        return False, -1.0
    try:
        with Image.open(shot_path) as image:
            rgb = image.convert('RGB')
            img = _crop_canvas_roi(rgb, canvas_box, dpr=dpr)
            if canvas_box is not None and img is rgb:
                return False, -1.0
            arr = np.asarray(img, dtype=np.float64)
            std = float(arr.std(axis=(0, 1)).max())
    except (OSError, ValueError):
        return False, -1.0
    if not math.isfinite(std):
        return False, -1.0
    return std > 1.5, round(std, 2)


def analyze_lookdev_pixels(shot_path: pathlib.Path, canvas_box: dict | None, dpr: float = 1.0) -> dict:
    """
    Compute quantitative look-dev pixel telemetry on the rendered canvas ROI:
      - colorEntropyBits: Shannon entropy of 16x16x16 quantized RGB histogram (warn < 3.0)
      - dominantColorShare: max quantized RGB bin share (warn > 0.65)
      - edgeDensity: 3x3 Sobel gradient ratio (> 28) at CSS-pixel scale (warn < 0.025)
      - luminanceContrast: p95 - p5 luminance spread on 0..255 scale (warn < 55)
    """
    if Image is None or np is None or not shot_path.exists():
        return {'available': False, 'warnings': []}
    roi = _crop_canvas_roi(Image.open(shot_path).convert('RGB'), canvas_box, dpr=dpr)
    # Normalize to 1x CSS-pixel resolution so Sobel edgeDensity stays invariant across DPR=1..3
    if dpr > 1.05:
        norm_w = max(16, int(round(roi.width / dpr)))
        norm_h = max(16, int(round(roi.height / dpr)))
        resample = getattr(Image, 'Resampling', Image).BILINEAR
        roi = roi.resize((norm_w, norm_h), resample)

    arr_u8 = np.asarray(roi, dtype=np.uint8)
    if arr_u8.ndim != 3 or arr_u8.shape[0] < 4 or arr_u8.shape[1] < 4:
        return {'available': False, 'warnings': []}

    # 12-bit quantized RGB histogram (16 x 16 x 16 = 4096 bins)
    q = (
        ((arr_u8[:, :, 0].astype(np.int32) >> 4) << 8)
        | ((arr_u8[:, :, 1].astype(np.int32) >> 4) << 4)
        | (arr_u8[:, :, 2].astype(np.int32) >> 4)
    )
    counts = np.bincount(q.ravel(), minlength=4096).astype(np.float64)
    total = float(counts.sum())
    probs = counts[counts > 0] / max(total, 1.0)
    color_entropy_bits = float(-(probs * np.log2(probs)).sum()) if probs.size else 0.0
    dominant_color_share = float(probs.max()) if probs.size else 1.0

    # Rec. 709 luminance (0..255) & 3x3 Sobel edge density
    arr_f = arr_u8.astype(np.float32)
    lum = 0.2126 * arr_f[:, :, 0] + 0.7152 * arr_f[:, :, 1] + 0.0722 * arr_f[:, :, 2]
    p5, p95 = np.percentile(lum, [5.0, 95.0])
    luminance_contrast = float(p95 - p5)

    gx = (
        -lum[:-2, :-2] + lum[:-2, 2:]
        - 2.0 * lum[1:-1, :-2] + 2.0 * lum[1:-1, 2:]
        - lum[2:, :-2] + lum[2:, 2:]
    )
    gy = (
        -lum[:-2, :-2] - 2.0 * lum[:-2, 1:-1] - lum[:-2, 2:]
        + lum[2:, :-2] + 2.0 * lum[2:, 1:-1] + lum[2:, 2:]
    )
    grad_mag = np.hypot(gx, gy) / 4.0
    edge_density = float((grad_mag > 14.0).mean()) if grad_mag.size else 0.0

    # Magenta / purple-frame shader error detection (R>210, G<45, B>210)
    magenta_mask = (arr_u8[:, :, 0] > 210) & (arr_u8[:, :, 1] < 45) & (arr_u8[:, :, 2] > 210)
    magenta_ratio = float(magenta_mask.mean()) if magenta_mask.size else 0.0

    warnings = []
    if color_entropy_bits < 3.0:
        warnings.append(f'low_color_entropy({color_entropy_bits:.2f}<3.0)')
    if dominant_color_share > 0.65:
        warnings.append(f'high_dominant_color({dominant_color_share:.2f}>0.65)')
    if edge_density < 0.025:
        warnings.append(f'low_edge_density({edge_density:.4f}<0.025)')
    if luminance_contrast < 55.0:
        warnings.append(f'low_luminance_contrast({luminance_contrast:.1f}<55)')
    if magenta_ratio > 0.015:
        warnings.append(f'magenta_frame({magenta_ratio:.4f}>0.015)')

    return {
        'available': True,
        'colorEntropyBits': round(color_entropy_bits, 3),
        'dominantColorShare': round(dominant_color_share, 4),
        'edgeDensity': round(edge_density, 4),
        'luminanceContrast': round(luminance_contrast, 2),
        'magentaRatio': round(magenta_ratio, 5),
        'warnings': warnings,
    }


def save_closeup_crop(shot_path: pathlib.Path, canvas_box: dict | None, dpr: float = 1.0) -> str | None:
    """
    Save a 2x zoomed center crop (`*-closeup.png`) of the hero canvas so visual review
    immediately exposes edge aliasing, bevel highlights, and micro-texture crispness.
    """
    if Image is None or not shot_path.exists():
        return None
    roi = _crop_canvas_roi(Image.open(shot_path).convert('RGB'), canvas_box, dpr=dpr)
    w, h = roi.size
    if w < 32 or h < 32:
        return None
    crop_w = max(32, w // 2)
    crop_h = max(32, h // 2)
    x0 = (w - crop_w) // 2
    y0 = (h - crop_h) // 2
    closeup = roi.crop((x0, y0, x0 + crop_w, y0 + crop_h))
    if dpr < 1.5:
        nearest = getattr(Image, 'Resampling', Image).NEAREST
        closeup = closeup.resize((crop_w * 2, crop_h * 2), nearest)
    closeup_path = shot_path.with_name(f'{shot_path.stem}-closeup{shot_path.suffix}')
    closeup_path.parent.mkdir(parents=True, exist_ok=True)
    closeup.save(closeup_path)
    return str(closeup_path)


def save_contact_sheet(results: list[dict], out_path: pathlib.Path) -> str | None:
    """
    Assemble a single labeled visual review sheet (`*-contact-sheet.png`) combining
    the primary viewport still, 2x center close-up, cardinal three-views, probes,
    and the 390px mobile frame.
    """
    if Image is None or ImageDraw is None or not results:
        return None

    tiles: list[tuple[str, pathlib.Path]] = []
    seen: set[pathlib.Path] = set()

    def add_tile(label: str, raw_path: str | None) -> None:
        if not raw_path:
            return
        p = pathlib.Path(raw_path)
        if p.exists() and p not in seen:
            seen.add(p)
            tiles.append((label, p))

    primary = results[0]
    add_tile(f'MAIN {primary.get("viewport", "")}'.strip(), primary.get('screenshot'))
    add_tile('2x CLOSEUP', primary.get('closeupScreenshot'))

    three_shots = (primary.get('oracle') or {}).get('threeViews', {}).get('screenshots') or {}
    for vname in ('front', 'side', 'top', 'iso'):
        if vname in three_shots:
            add_tile(f'VIEW {vname.upper()}', three_shots[vname])

    probe_idx = 0
    mobile_tile = None
    for item in results[1:]:
        vp = str(item.get('viewport', ''))
        shot = item.get('screenshot')
        if vp.startswith('390x'):
            mobile_tile = (f'MOBILE {vp}', shot)
        elif '-probe-' in pathlib.Path(shot or '').name:
            probe_idx += 1
            query = str(item.get('url', '')).split('?', 1)
            suffix = f' ?{query[1]}' if len(query) > 1 and query[1] else ''
            add_tile(f'PROBE {probe_idx}{suffix}'[:42], shot)

    if mobile_tile:
        add_tile(*mobile_tile)

    if not tiles:
        return None

    cols = 2 if len(tiles) <= 4 else 3
    rows = math.ceil(len(tiles) / cols)
    cell_w, cell_h = 640, 400
    header_h, gap, pad = 30, 14, 16
    sheet_w = pad * 2 + cols * cell_w + (cols - 1) * gap
    sheet_h = pad * 2 + rows * (cell_h + header_h) + (rows - 1) * gap

    sheet = Image.new('RGB', (sheet_w, sheet_h), (20, 22, 26))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=15)
    except TypeError:
        font = ImageFont.load_default()
    resample = getattr(Image, 'Resampling', Image).LANCZOS

    for idx, (label, img_path) in enumerate(tiles):
        r, c = divmod(idx, cols)
        x0 = pad + c * (cell_w + gap)
        y0 = pad + r * (cell_h + header_h + gap)
        draw.rectangle([x0, y0, x0 + cell_w - 1, y0 + header_h - 1], fill=(32, 37, 46))
        draw.rectangle([x0, y0 + header_h, x0 + cell_w - 1, y0 + header_h + cell_h - 1], fill=(12, 14, 18))
        draw.text((x0 + 10, y0 + 7), label, fill=(235, 240, 248), font=font)
        with Image.open(img_path) as raw:
            im = raw.convert('RGB')
            scale = min(cell_w / max(im.width, 1), cell_h / max(im.height, 1))
            nw = max(1, int(round(im.width * scale)))
            nh = max(1, int(round(im.height * scale)))
            resized = im.resize((nw, nh), resample)
            ox = x0 + (cell_w - nw) // 2
            oy = y0 + header_h + (cell_h - nh) // 2
            sheet.paste(resized, (ox, oy))
        draw.rectangle([x0, y0, x0 + cell_w - 1, y0 + header_h + cell_h - 1], outline=(56, 64, 78), width=1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return str(out_path)


def evaluate_lookdev_scene_telemetry(raw_tel: dict | None) -> dict:
    """
    Inspect optional engine/scene telemetry (`stage.getTelemetry()` / `window.__SIMULIFY_TELEMETRY__`)
    matching Simulify v3.1 schema and produce advisory look-dev warnings while degrading gracefully
    on older benches.
    """
    if not isinstance(raw_tel, dict) or raw_tel.get('error'):
        return {
            'available': False,
            'error': raw_tel.get('error') if isinstance(raw_tel, dict) else None,
            'warnings': [],
        }

    warnings = []

    # 1. Shadow frustum utilization (sceneSpan / frustumSpan < 0.35 wastes shadow texels)
    sf = raw_tel.get('shadow') or raw_tel.get('shadowFrustum') or {}
    utilization = None
    shadow_type = None
    shadow_fitted = None
    if isinstance(sf, dict):
        shadow_type = sf.get('type')
        shadow_fitted = sf.get('fitted')
        if isinstance(sf.get('utilization'), (int, float)) and math.isfinite(sf['utilization']):
            utilization = float(sf['utilization'])
        elif isinstance(sf.get('sceneSpan'), (int, float)) and isinstance(sf.get('frustumSpan'), (int, float)):
            if sf['frustumSpan'] > 0:
                utilization = float(sf['sceneSpan']) / float(sf['frustumSpan'])
    if utilization is not None and utilization < 0.35:
        warnings.append(f'low_shadow_utilization({utilization:.2f}<0.35)')

    # 2. Visible mesh roughness spread & mud-zone metalness audit
    mat_info = raw_tel.get('materials') or raw_tel.get('roughness') or {}
    rough_summary = None
    if isinstance(mat_info, dict):
        r_min = mat_info.get('roughnessMin', mat_info.get('min'))
        r_max = mat_info.get('roughnessMax', mat_info.get('max'))
        r_count = mat_info.get('meshCount', mat_info.get('count', 0))
        r_spread = mat_info.get('roughnessSpread', mat_info.get('spread'))
        plastic_ratio = mat_info.get('plasticClusterRatio')
        mid_metal_cnt = mat_info.get('midMetalnessCount')
        if isinstance(r_min, (int, float)) and isinstance(r_max, (int, float)):
            spread = float(r_spread) if isinstance(r_spread, (int, float)) else float(r_max - r_min)
            rough_summary = {
                'count': int(r_count) if isinstance(r_count, (int, float)) else None,
                'min': round(float(r_min), 3),
                'max': round(float(r_max), 3),
                'spread': round(spread, 3),
                'plasticClusterRatio': round(float(plastic_ratio), 3) if isinstance(plastic_ratio, (int, float)) else None,
                'midMetalnessCount': int(mid_metal_cnt) if isinstance(mid_metal_cnt, (int, float)) else None,
            }
            if (r_count is None or r_count >= 2) and r_min >= 0.20 and r_max <= 0.45 and spread <= 0.15:
                warnings.append(f'plastic_roughness_cluster([{r_min:.2f},{r_max:.2f}])')
            elif (
                isinstance(plastic_ratio, (int, float))
                and (r_count is None or r_count >= 3)
                and plastic_ratio >= 0.85
            ):
                warnings.append(f'plastic_roughness_cluster(ratio={plastic_ratio:.2f})')
        if isinstance(mid_metal_cnt, (int, float)) and mid_metal_cnt > 0:
            warnings.append(f'mid_metalness_meshes({int(mid_metal_cnt)})')
        if mat_info.get('plasticCluster') is True and not any('plastic_roughness' in w for w in warnings):
            warnings.append('plastic_roughness_cluster')

    outline_raw = raw_tel.get('outline')
    if isinstance(outline_raw, dict):
        outline_mode = outline_raw.get('preset') or ('enabled' if outline_raw.get('enabled') else 'none')
    else:
        outline_mode = raw_tel.get('outlineMode') or outline_raw

    ibl_raw = raw_tel.get('ibl') if isinstance(raw_tel.get('ibl'), dict) else None

    return {
        'available': True,
        'theme': raw_tel.get('theme'),
        'aestheticTier': raw_tel.get('aestheticTier') or raw_tel.get('tier'),
        'backend': raw_tel.get('backend') or raw_tel.get('rendererBackend'),
        'toneMapping': raw_tel.get('toneMapping'),
        'dpr': raw_tel.get('dpr') or raw_tel.get('pixelRatio'),
        'outlineMode': outline_mode,
        'iblKind': ibl_raw.get('kind') if ibl_raw else None,
        'selectiveIBL': ibl_raw.get('selective') if ibl_raw else None,
        'shadowType': shadow_type,
        'shadowFitted': shadow_fitted,
        'shadowUtilization': round(utilization, 3) if utilization is not None else None,
        'roughness': rough_summary,
        'raw': raw_tel,
        'warnings': warnings,
    }


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
          const profile = typeof wb.getProfile === 'function' ? wb.getProfile() ?? wb.profile : wb.profile;
          const stage = wb.stage?.stage || wb.stage || wb.scene?.stage || null;
          const has3D = ['webgl2', 'webgpu', 'webgl'].includes(stage?.backendKind);
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
            profile: typeof profile === 'string' ? profile : null,
            has3D,
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


def run_multi_beat_audit(page, init_probe: dict, collect_geometry: bool) -> list[dict]:
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
        m = page.evaluate(EVAL_FRAME_METRICS_JS, collect_geometry)
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


def run_v2_4d_probes(page, init_probe: dict, strict_4d: bool, run_scrub: bool) -> dict:
    """Run initial-sparsity and reversible temporal-scrub determinism checks on primary desktop check."""
    v2_active = (init_probe['version'] >= 2) or strict_4d

    # 1. initial-sparsity (computed strictly from pre-seek load snapshot)
    if not v2_active:
        sparsity = skipped_gate('v1 bench')
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
        scrub = skipped_gate('v1 bench')
    elif not run_scrub:
        scrub = skipped_gate('timeline duration is at most 0.2s')
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


def run_camera_ownership_probe(page, v2_active: bool, *, required: bool) -> dict:
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
            'passed': not required,
            'skipped': not required,
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


def run_three_view_audit(page, init_probe: dict, shot_path: pathlib.Path) -> dict:
    """Capture cardinal Front / Side / Top / Iso views and check volumetric 3D LxWxH bounds."""
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
    cli_profile: str = 'auto',
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
        page.on('response', lambda res: failed_requests.append(f'{res.status} {res.url}') if res.status >= 400 else None)

        url = urljoin(base_url, entry_url(rel_url, requested_backend).lstrip('/'))
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
        v2_active = (init_probe['version'] >= 2) or strict_4d
        has_3d = init_probe['has3D']
        effective_profile = resolve_effective_profile(
            cli_profile, init_probe['profile'], has_3d or strict_4d, v2_active,
        )
        profile_policy = evaluate_profile_policy(effective_profile, has_3d=has_3d, duration=init_probe['dur'])
        collect_geometry = profile_policy['geometry_diversity'] != 'skipped'
        metrics = page.evaluate(EVAL_FRAME_METRICS_JS, collect_geometry)

        shot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shot_path), animations='disabled', timeout=45000)

        # Multi-beat inspection on desktop viewports (not pinned deep-link probes)
        has_pinned_query = any(k in rel_url for k in ('stage=', 't=', 'end'))
        beat_reports = []
        if width > 900 and not is_probe and not has_pinned_query:
            beat_reports = run_multi_beat_audit(page, init_probe, collect_geometry)

        sparsity_res = skipped_gate('non-primary viewport')
        scrub_res = skipped_gate('non-primary viewport')
        if run_4d_checks:
            v2_probes = run_v2_4d_probes(
                page, init_probe, strict_4d, run_scrub=profile_policy['temporal_scrub'] != 'skipped',
            )
            sparsity_res = v2_probes['sparsity']
            scrub_res = v2_probes['scrub']

        view_skip_reason = 'not applicable to this profile, stage or viewport'
        camera_ownership = skipped_gate(view_skip_reason)
        three_views = skipped_gate(view_skip_reason)
        missing_mechanical_stage = effective_profile == 'mechanical-3d' and not has_3d
        missing_stage_gate = {'passed': False, 'reason': 'mechanical-3d requires an active 3D renderer'}
        if missing_mechanical_stage:
            camera_ownership = missing_stage_gate.copy()
            three_views = missing_stage_gate.copy()
        elif run_4d_checks and width > 900 and metrics['hasCanvas']:
            if (v2_active or effective_profile == 'mechanical-3d') and profile_policy['three_views'] != 'skipped':
                three_views = run_three_view_audit(page, init_probe, shot_path)
            if profile_policy['camera_ownership'] != 'skipped':
                camera_ownership = run_camera_ownership_probe(
                    page, v2_active, required=profile_policy['camera_ownership'] == 'hard',
                )

        page.close()
        ctx.close()

        is_win_buf_blip = any('ERR_NO_BUFFER_SPACE' in e for e in console_errors)
        if is_win_buf_blip and attempt == 0:
            time.sleep(0.25)
            continue

        canvas_non_blank, canvas_std = (True, -1.0)
        lookdev_pixels = {'available': False, 'warnings': []}
        closeup_shot = None
        if metrics['hasCanvas']:
            canvas_non_blank, canvas_std = analyze_canvas_variance(shot_path, metrics.get('canvasBox'), dpr=dpr)
            lookdev_pixels = analyze_lookdev_pixels(shot_path, metrics.get('canvasBox'), dpr=dpr)
            if run_4d_checks or (width > 900 and is_probe):
                closeup_shot = save_closeup_crop(shot_path, metrics.get('canvasBox'), dpr=dpr)
        lookdev_scene = evaluate_lookdev_scene_telemetry(metrics.get('lookDevTelemetry'))
        lookdev_warnings = list(dict.fromkeys(
            list(lookdev_pixels.get('warnings') or []) + list(lookdev_scene.get('warnings') or [])
        ))

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
        min_canvas_w_ratio = 0.40 if metrics.get('layoutArchetype') == 'ab-compare' else 0.45
        if v2_active:
            frame_w, frame_h = metrics['stageWidth'], metrics['stageHeight']
            frame_ok = metrics['hasActiveStage'] and (
                width <= 900 or (frame_w >= width * min_canvas_w_ratio and frame_h >= height * 0.45)
            )
        else:
            frame_w, frame_h = metrics['canvasWidth'], metrics['canvasHeight']
            frame_ok = width <= 900 or not metrics['hasCanvas'] or (
                frame_w >= width * min_canvas_w_ratio and frame_h >= height * 0.45
            )
        chart_ok = len(chart_fail_beats) == 0
        hud_ok = len(all_hud_overlaps) == 0

        falsify_res = metrics.get('falsifyResult')
        is_v3 = metrics['simulifyVersion'] >= 3 or metrics['hasModel'] or (
            isinstance(falsify_res, dict) and falsify_res.get('version') == 3
        )
        falsify_enforced = v2_active or is_v3
        falsify_gate = {
            'passed': evaluate_falsify(falsify_res, v2_active, from_model=metrics['hasModel'], is_v3=is_v3),
            'enforced': falsify_enforced,
        }
        if not falsify_enforced and falsify_res is None:
            falsify_gate['skipped'] = True

        trunc_ok = len(all_truncations) == 0
        gpu_ok = len(gpu_errors) == 0
        magenta_ratio = float(lookdev_pixels.get('magentaRatio', 0.0)) if lookdev_pixels.get('available') else 0.0
        magenta_ok = magenta_ratio <= 0.015
        visual_integrity_ok = canvas_non_blank and trunc_ok and gpu_ok and magenta_ok

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
            typo_ok = fonts_ok and canvas_backing_ok and tiny_text_ok
        else:
            typo_ok = True

        # Anti-Cuboid Geometry Diversity gate (enforced on desktop v2 3D benches across populated beats;
        # v1 benches, mobile sparse-t=0 viewports & pinned single-beat probes remain exempt)
        geo_applicable = (v2_active or effective_profile == 'mechanical-3d') and collect_geometry and (
            width > 900 and not is_probe and not has_pinned_query
        )
        best_geo_beat = None
        best_geo_audit = None
        for btag, audit in geo_candidates:
            if best_geo_audit is None or (
                int(audit.get('totalMeshes', 0)) >= int(best_geo_audit.get('totalMeshes', 0))
            ):
                best_geo_beat = btag
                best_geo_audit = audit

        if missing_mechanical_stage:
            geo_res = missing_stage_gate.copy()
        elif not geo_applicable:
            geo_res = {
                **skipped_gate('v1 bench' if not v2_active else view_skip_reason),
                'sampleBeat': best_geo_beat,
                'audit': best_geo_audit,
            }
        elif best_geo_audit is None:
            geo_res = {
                'passed': False,
                'skipped': False,
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
                'sampleBeat': best_geo_beat,
                'cuboidRatio': cuboid_ratio,
                'sculptedMeshes': sculpted_meshes,
                'cuboidMeshes': int(best_geo_audit.get('cuboidMeshes', 0)),
                'totalMeshes': total_meshes,
                'audit': best_geo_audit,
            }

        gate_results = {
            'geometry_diversity': geo_res,
            'three_views': three_views,
            'initial_sparsity': sparsity_res,
            'temporal_scrub': scrub_res,
            'camera_ownership': camera_ownership,
            'mandatory_falsify': falsify_gate,
        }
        profile_gates = {
            gate: 'skipped' if result.get('skipped') else profile_policy[gate]
            for gate, result in gate_results.items()
        }
        geo_res['enforced'] = profile_gates['geometry_diversity'] == 'hard'

        oracle = {
            'prose': {'passed': prose_ok, 'hits': all_prose_hits_list},
            'frame': {'passed': frame_ok, 'w': frame_w, 'h': frame_h},
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
            'mandatoryFalsify': falsify_gate,
            'initialSparsity': sparsity_res,
            'temporalScrubDeterminism': scrub_res,
            'visualIntegrity': {
                'passed': visual_integrity_ok,
                'canvasNonBlank': canvas_non_blank,
                'canvasStd': canvas_std,
                'magentaRatio': round(magenta_ratio, 5),
                'magentaOk': magenta_ok,
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
            'lookDev': {
                'advisory': True,
                'passed': len(lookdev_warnings) == 0,
                'warnings': lookdev_warnings,
                'pixels': lookdev_pixels,
                'scene': lookdev_scene,
                'closeupScreenshot': closeup_shot,
            },
            'backend': {
                'requested': requested_backend,
                'actual': metrics['rendererBackend'],
                'enforced': requested_backend != 'auto',
                'passed': requested_backend == 'auto' or metrics['rendererBackend'] == requested_backend,
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
            'lookDevPixels': lookdev_pixels,
            'lookDevScene': lookdev_scene,
            'lookDevWarnings': lookdev_warnings,
        }

        ok = (
            len(console_errors) == 0
            and len(page_errors) == 0
            and len(failed_requests) == 0
            and not any_guide_overflow
            and backend_ok
            and prose_ok
            and frame_ok
            and chart_ok
            and hud_ok
            and visual_integrity_ok
            and typo_ok
            and all(gate_results[gate]['passed'] for gate, mode in profile_gates.items() if mode == 'hard')
        )
        if width <= 900 and metrics['thumbVisible'] is True and metrics['thumbTop'] is not None:
            if metrics['thumbTop'] > height:
                ok = False

        return {
            'url': rel_url,
            'viewport': f'{width}x{height}',
            'screenshot': str(shot_path),
            'closeupScreenshot': closeup_shot,
            'consoleErrors': console_errors,
            'pageErrors': page_errors,
            'failedRequests': failed_requests,
            'effectiveProfile': effective_profile,
            'profileGates': profile_gates,
            'telemetry': telemetry,
            'metrics': metrics,
            'oracle': oracle,
            'passed': ok,
        }


def main():
    parser = argparse.ArgumentParser(
        description='Verify Simulify v3.1 pages across 3 viewports, multi-beat timelines, deep-links, 4D gates, and Look-Dev telemetry.'
    )
    parser.add_argument('--root', required=True, help='Root directory to serve over HTTP')
    parser.add_argument('--entry', default='index.html', help='Entry URL relative to root')
    parser.add_argument('--probe', action='append', default=[], help='Additional deep-link query probes (e.g. "?stage=act-2&end")')
    parser.add_argument('--out-dir', default='./.verify-shots', help='Screenshot & receipt output folder')
    parser.add_argument('--channel', choices=['auto', 'chrome', 'chromium'], default='auto', help='Browser channel')
    parser.add_argument('--backend', choices=['auto', 'webgl2', 'webgpu'], default='auto', help='Graphics backend')
    parser.add_argument(
        '--profile', choices=['auto', *PROFILE_GATES], default='auto',
        help='Verification profile (auto reads the runtime profile or infers one for v2 benches)',
    )
    parser.add_argument('--dpr', type=float, default=1.0, help='Device scale factor for browser contexts (default: 1.0)')
    parser.add_argument(
        '--no-hic',
        action='store_true',
        help='Verify CanvasDrawElement fallback when the bench mounts a 3D HtmlSurface',
    )
    parser.add_argument('--strict-4d', action='store_true', help='Enforce Simulify v2 4D quality legs even on v1 benches')
    args = parser.parse_args()

    root_dir = pathlib.Path(args.root).resolve()
    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    dpr = max(1.0, min(3.0, float(args.dpr)))

    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright
    except ImportError as exc:
        print(f'ERROR: playwright Python package is required ({exc}). Try: uv run scripts/verify_stage.py ...', file=sys.stderr)
        sys.exit(2)

    httpd, port = start_server(root_dir)
    base_url = f'http://127.0.0.1:{port}/'
    slug = pathlib.Path(args.entry).parent.name or pathlib.Path(args.entry).stem

    results = []
    no_hic_applied = False
    try:
        with sync_playwright() as p:
            browser = launch_browser(p, channel=args.channel, backend=args.backend)
            if args.no_hic:
                for suffix in ['', *args.probe]:
                    probe_page = browser.new_page()
                    try:
                        probe_page.goto(urljoin(base_url, entry_url(args.entry, args.backend, suffix)), wait_until='domcontentloaded')
                        probe_page.wait_for_function('window.__ready === true', timeout=12000)
                        no_hic_applied = probe_page.evaluate("""() => {
                            const hook = window.__simulify;
                            const stage = hook?.stage?.stage || hook?.stage || hook?.scene?.stage;
                            return (stage?.htmlSurfaces?.surfaces?.size ?? 0) > 0;
                        }""")
                    except PlaywrightTimeout:
                        # The full verification captures the page's startup errors.
                        pass
                    finally:
                        probe_page.close()
                    if no_hic_applied:
                        browser.close()
                        browser = launch_browser(p, channel=args.channel, backend=args.backend, no_hic=True)
                        break
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
                        cli_profile=args.profile,
                    )
                )

            for idx, probe in enumerate(args.probe):
                probe_url = entry_url(args.entry, args.backend, probe)
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
                        cli_profile=args.profile,
                    )
                )

            browser.close()
    finally:
        httpd.shutdown()

    passed_all = all(r['passed'] for r in results)
    contact_sheet = save_contact_sheet(results, out_dir / f'{slug}-contact-sheet.png')
    receipt = {
        'root': str(root_dir),
        'entry': args.entry,
        'channel': args.channel,
        'backend': args.backend,
        'requestedProfile': args.profile,
        'effectiveProfile': results[0]['effectiveProfile'],
        'dpr': dpr,
        'noHic': no_hic_applied,
        'noHicRequested': args.no_hic,
        'strict4d': args.strict_4d,
        'passed': passed_all,
        'contactSheet': contact_sheet,
        'checks': results,
    }
    receipt_path = out_dir / f'{slug}-receipt.json'
    receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding='utf-8')

    print(f'Receipt: {receipt_path}')
    if contact_sheet:
        print(f'Contact sheet: {contact_sheet}')
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
        falsify_gate = ora['mandatoryFalsify']
        if fal is None:
            fal_str = 'N/A' if falsify_gate.get('skipped') else 'FAIL(missing)'
        elif not isinstance(fal, dict):
            fal_str = 'FAIL(invalid)'
        else:
            assertions = fal.get('assertions') or []
            ok_cnt = sum(1 for a in assertions if a.get('passed'))
            tot_cnt = len(assertions)
            fal_str = f'{ok_cnt}/{tot_cnt}'
            if not falsify_gate['passed']:
                fal_str = f'FAIL({fal_str})'
        sp = ora.get('initialSparsity', {})
        sp_str = 'SKIP' if sp.get('skipped') else ('OK' if sp.get('passed') else f'FAIL(a0={sp.get("actorsAt0")},pk={sp.get("peakActors")})')
        sc = ora.get('temporalScrubDeterminism', {})
        sc_str = 'SKIP' if sc.get('skipped') else ('OK' if sc.get('passed') else f'FAIL(p={sc.get("maxProgressDiff")},rw={sc.get("rewindDiff")})')
        vi = ora.get('visualIntegrity', {})
        vi_str = (
            'OK'
            if vi.get('passed')
            else f'FAIL(blank={not vi.get("canvasNonBlank")},magenta={vi.get("magentaRatio", 0):.4f},trunc={len(vi.get("horizontalTruncations", []))})'
        )
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
        ld = ora.get('lookDev', {})
        ld_px = ld.get('pixels') or {}
        ld_warns = ld.get('warnings') or []
        if not ld_px.get('available'):
            ld_str = 'N/A'
        else:
            ld_base = (
                f'H={ld_px.get("colorEntropyBits")} '
                f'dom={ld_px.get("dominantColorShare")} '
                f'edge={ld_px.get("edgeDensity")} '
                f'con={ld_px.get("luminanceContrast")}'
            )
            ld_str = f'OK({ld_base})' if not ld_warns else f'WARN({ld_base}; {",".join(ld_warns)})'
        mb_cnt = ora.get('multiBeat', {}).get('sampledCount', 0)
        bk_info = ora.get('backend', {})
        bk_str = str(tel.get('rendererBackend'))
        if bk_info.get('enforced') and not bk_info.get('passed', True):
            bk_str = f'{bk_str}(FAIL:expected={bk_info.get("requested")})'
        gates = r['profileGates']
        gate_summary = ' '.join(
            f'{mode}={",".join(gate for gate, state in gates.items() if state == mode) or "-"}'
            for mode in ('hard', 'advisory', 'skipped')
        )
        closeup_note = f' +{pathlib.Path(r["closeupScreenshot"]).name}' if r.get('closeupScreenshot') else ''

        print(
            f'  [{tag}] {r["url"]} @ {r["viewport"]} | '
            f'profile={r["effectiveProfile"] or "legacy"} {gate_summary} | '
            f'backend={bk_str} hic={tel.get("htmlInCanvasSupported")} beats={mb_cnt} | '
            f'console={len(r["consoleErrors"])} pageErr={len(r["pageErrors"])} '
            f'reqFail={len(r["failedRequests"])} overflow={r["metrics"]["guideOverflow"]} '
            f'oracle=[prose:{p_str} frame:{f_str} chart:{c_str} hud:{h_str} falsify:{fal_str} '
            f'sparse:{sp_str} scrub:{sc_str} vis:{vi_str} typo:{ty_str} geo:{gd_str} views:{tv_str} cam:{co_str} '
            f'lookdev:{ld_str}] '
            f'-> {pathlib.Path(r["screenshot"]).name}{closeup_note}'
        )
    sys.exit(0 if passed_all else 1)


if __name__ == '__main__':
    main()
