#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.45", "numpy>=1.24", "pillow>=9.0"]
# ///
"""
Automated 3-viewport, deep-link, and Simulify v2 4D Progressive-Reveal verification gate.

Spins up an ephemeral loopback HTTP server, verifies zero console/page/request errors,
zero guide-card overflow on desktop, mobile thumb-dock visibility, optional URL probes,
and writes screenshots + a machine-readable JSON receipt.

v1 legs (always enforced):
  - prose-lint, stage-frame, chart-legibility, hud-overlap, falsify-oracle

v2 legs (auto-enforced when `window.__simulify.version >= 2` or `--strict-4d` is set):
  1. initial-sparsity: bench must NOT boot in `showEnd` state; `actors(0) < peakActors`.
  2. temporal-scrub-determinism: drives `seek(0.1T) -> seek(0.5T) -> seek(0.9T) -> seek(0.5T)`
     and verifies real visual progression over time + reversible rewind determinism.
  3. mandatory-falsify: fails if `window.__simulify.falsify` is missing or `passed !== true`.
  4. visual-integrity: `canvasNonBlank` (RGB pixel variance > 0), zero horizontal truncation
     on code/guide cards, and zero GPU/WebGL/WebGPU console errors.
"""

import argparse
import functools
import http.server
import io
import json
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


def build_browser_args(backend: str = 'auto'):
    common = ['--enable-blink-features=CanvasDrawElement']
    if backend == 'webgpu':
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


def launch_browser(p, channel: str = 'auto', backend: str = 'auto'):
    args = build_browser_args(backend=backend)
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


def analyze_canvas_variance(shot_path: pathlib.Path, canvas_box: dict | None) -> tuple[bool, float]:
    """Verify the rendered canvas area is non-blank (catches SwiftShader/WebGPU blank regressions)."""
    if Image is None or np is None or not shot_path.exists():
        return True, -1.0
    img = Image.open(shot_path).convert('RGB')
    arr = np.asarray(img, dtype=np.float32)
    if canvas_box and canvas_box.get('width', 0) > 10 and canvas_box.get('height', 0) > 10:
        x0 = max(0, int(canvas_box['left']))
        y0 = max(0, int(canvas_box['top']))
        x1 = min(arr.shape[1], int(canvas_box['left'] + canvas_box['width']))
        y1 = min(arr.shape[0], int(canvas_box['top'] + canvas_box['height']))
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


def run_v2_4d_probes(page, strict_4d: bool) -> dict:
    """Run initial-sparsity and reversible temporal-scrub determinism checks on primary desktop check."""
    probe = page.evaluate(
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
          };
        }"""
    )

    v2_active = (probe['version'] >= 2) or strict_4d

    # 1. initial-sparsity
    if not v2_active:
        sparsity = {'passed': True, 'skipped': True, 'reason': 'v1 bench'}
    else:
        not_end = not probe['bootedComplete']
        actor_growth = True
        if probe['hasActorFn'] and probe['actorsAt0'] is not None and probe['peakActors'] is not None:
            actor_growth = probe['actorsAt0'] < probe['peakActors']
        elif strict_4d and not probe['hasActorFn']:
            actor_growth = False
        sparsity = {
            'passed': bool(not_end and actor_growth),
            'bootedComplete': probe['bootedComplete'],
            'initT': probe['initT'],
            'actorsAt0': probe['actorsAt0'],
            'peakActors': probe['peakActors'],
        }

    # 2. temporal-scrub-determinism: seek(0.1T) -> seek(0.5T) -> seek(0.9T) -> seek(0.5T)
    if not v2_active:
        scrub = {'passed': True, 'skipped': True, 'reason': 'v1 bench'}
    elif not probe['hasSeek'] or probe['dur'] <= 0.2:
        scrub = {
            'passed': False,
            'reason': 'Missing window.__simulify.seek(t) or zero duration',
            'dur': probe['dur'],
        }
    else:
        dur = probe['dur']
        page.evaluate("() => window.__simulify.enterExportMode?.({ hud: 'hud', muteAudio: true })")

        def seek_and_grab(frac: float) -> bytes:
            page.evaluate(
                """async (t) => {
                  await window.__simulify.seek(t);
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
        'version': probe['version'],
        'sparsity': sparsity,
        'scrub': scrub,
    }


def check_target(
    browser,
    base_url: str,
    rel_url: str,
    width: int,
    height: int,
    shot_path: pathlib.Path,
    *,
    run_4d_checks: bool = False,
    strict_4d: bool = False,
):
    for attempt in range(2):
        console_errors = []
        gpu_errors = []
        page_errors = []
        failed_requests = []

        ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
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

        page.wait_for_timeout(350)

        metrics = page.evaluate(
            """() => {
              const guide = document.querySelector('.hud-guide') || document.querySelector('.right-dock');
              const thumbDock = document.querySelector('.thumb-dock');
              const canvas = document.querySelector('canvas');
              const guideOverflow = guide ? (guide.scrollHeight > guide.clientHeight + 2) : false;
              const thumbVisible = thumbDock ? getComputedStyle(thumbDock).display !== 'none' : null;
              const thumbTop = thumbDock ? thumbDock.getBoundingClientRect().top : null;
              const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
              const hook = window.__simulify;

              // 1. Prose lint (AI clichés check on visible HUD prose)
              const AI_CLICHES = [
                '本质上', '值得注意的是', '总而言之', '综上所述', '不难发现', '众所周知',
                '至关重要', '深入探讨', '赋能', '旨在', '极大地', '正如我们所见'
              ];
              const proseEls = document.querySelectorAll('.hud-guide, .right-dock, .question-chain, .brand-sub');
              const proseHits = [];
              for (const el of proseEls) {
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || el.hidden || el.getAttribute('data-hud-hidden') === 'true') continue;
                const txt = el.innerText || '';
                for (const word of AI_CLICHES) {
                  if (txt.includes(word)) proseHits.push(word);
                }
              }

              // 2. HUD panel mutual overlap check (desktop > 900px)
              const hudSelectors = [
                '.hud-top-left', '.top-ribbon', '.hud-guide', '.right-dock',
                '.hud-bottom-left', '.bottom-left-dock', '.hud-bottom-center', '.bottom-transport'
              ];
              const visibleHud = [];
              for (const sel of hudSelectors) {
                const el = document.querySelector(sel);
                if (!el || el.hidden || el.getAttribute('data-hud-hidden') === 'true') continue;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  visibleHud.push({ sel, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
                }
              }
              const hudOverlaps = [];
              for (let i = 0; i < visibleHud.length; i += 1) {
                for (let j = i + 1; j < visibleHud.length; j += 1) {
                  const a = visibleHud[i];
                  const b = visibleHud[j];
                  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  if (ox > 6 && oy > 6) {
                    hudOverlaps.push(`${a.sel}<->${b.sel}(${Math.round(ox)}x${Math.round(oy)})`);
                  }
                }
              }

              // 3. Chart legibility bounds
              const chartEl = document.querySelector('.xy-svg, .hyst-svg');
              let chartSize = null;
              if (chartEl) {
                const cs = getComputedStyle(chartEl);
                const r = chartEl.getBoundingClientRect();
                if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) {
                  chartSize = { width: Math.round(r.width), height: Math.round(r.height) };
                }
              }

              // 4. Horizontal truncation audit on visible code/guide/maths cards (v2 visual-integrity)
              const truncSelectors = ['.code-trace-card', '.code-trace-card pre', '.hud-guide', '.right-dock', '.live-maths-panel'];
              const horizontalTruncations = [];
              for (const sel of truncSelectors) {
                for (const el of document.querySelectorAll(sel)) {
                  const cs = getComputedStyle(el);
                  if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden || el.getAttribute('data-hud-hidden') === 'true') continue;
                  if (el.clientWidth > 20 && el.scrollWidth > el.clientWidth + 2) {
                    horizontalTruncations.push(`${sel}(${el.scrollWidth}>${el.clientWidth})`);
                  }
                }
              }

              // 5. Telemetry: rendererBackend & HTML-in-Canvas support
              const stageObj = hook?.stage?.stage || hook?.stage || hook?.scene?.stage;
              const rendererBackend = stageObj?.backendKind || (canvas ? 'webgl2' : 'svg');
              const htmlInCanvasSupported = 'content' in HTMLCanvasElement.prototype;

              // 6. Live counterfactual falsification runner (if exposed)
              let falsifyResult = null;
              if (hook && typeof hook.falsify === 'function') {
                falsifyResult = hook.falsify();
              }

              return {
                title: document.title,
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
                bodyTextLen: document.body.innerText.trim().length,
                proseHits: [...new Set(proseHits)],
                hudOverlaps,
                chartSize,
                horizontalTruncations,
                rendererBackend,
                htmlInCanvasSupported,
                falsifyResult,
              };
            }"""
        )

        shot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shot_path), animations='disabled', timeout=45000)

        v2_probes = None
        if run_4d_checks:
            v2_probes = run_v2_4d_probes(page, strict_4d=strict_4d)

        page.close()
        ctx.close()

        is_win_buf_blip = any('ERR_NO_BUFFER_SPACE' in e for e in console_errors)
        if is_win_buf_blip and attempt == 0:
            time.sleep(0.25)
            continue

        canvas_non_blank, canvas_std = (True, -1.0)
        if metrics['hasCanvas']:
            canvas_non_blank, canvas_std = analyze_canvas_variance(shot_path, metrics.get('canvasBox'))

        v2_active = (metrics['simulifyVersion'] >= 2) or strict_4d

        prose_ok = len(metrics['proseHits']) == 0
        frame_ok = (width <= 900) or (not metrics['hasCanvas']) or (
            metrics['canvasWidth'] >= width * 0.45 and metrics['canvasHeight'] >= height * 0.45
        )
        chart_ok = (metrics['chartSize'] is None) or (
            metrics['chartSize']['width'] >= 200 and metrics['chartSize']['height'] >= 85
        )
        hud_ok = (width <= 900) or (len(metrics['hudOverlaps']) == 0)

        falsify_res = metrics.get('falsifyResult')
        if v2_active:
            falsify_ok = falsify_res is not None and bool(falsify_res.get('passed'))
        else:
            falsify_ok = True if falsify_res is None else bool(falsify_res.get('passed'))

        trunc_ok = (not v2_active) or (width <= 900) or (len(metrics['horizontalTruncations']) == 0)
        gpu_ok = len(gpu_errors) == 0
        visual_integrity_ok = canvas_non_blank and trunc_ok and gpu_ok

        sparsity_res = v2_probes['sparsity'] if v2_probes else {'passed': True, 'skipped': True}
        scrub_res = v2_probes['scrub'] if v2_probes else {'passed': True, 'skipped': True}

        oracle = {
            'prose': {'passed': prose_ok, 'hits': metrics['proseHits']},
            'frame': {'passed': frame_ok, 'w': metrics['canvasWidth'], 'h': metrics['canvasHeight']},
            'chart': {'passed': chart_ok, 'size': metrics['chartSize']},
            'hud': {'passed': hud_ok, 'overlaps': metrics['hudOverlaps']},
            'falsify': falsify_res,
            'mandatoryFalsify': {'passed': falsify_ok, 'enforced': v2_active},
            'initialSparsity': sparsity_res,
            'temporalScrubDeterminism': scrub_res,
            'visualIntegrity': {
                'passed': visual_integrity_ok,
                'canvasNonBlank': canvas_non_blank,
                'canvasStd': canvas_std,
                'horizontalTruncations': metrics['horizontalTruncations'],
                'gpuErrors': gpu_errors,
            },
        }

        telemetry = {
            'v2Active': v2_active,
            'simulifyVersion': metrics['simulifyVersion'],
            'rendererBackend': metrics['rendererBackend'],
            'htmlInCanvasSupported': metrics['htmlInCanvasSupported'],
            'canvasNonBlank': canvas_non_blank,
            'canvasStd': canvas_std,
        }

        ok = (
            len(console_errors) == 0
            and len(page_errors) == 0
            and len(failed_requests) == 0
            and (width <= 900 or not metrics['guideOverflow'])
            and prose_ok
            and frame_ok
            and chart_ok
            and hud_ok
            and falsify_ok
            and visual_integrity_ok
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
    parser = argparse.ArgumentParser(description='Verify simulify pages across 3 viewports, deep-links, and v2 4D gates.')
    parser.add_argument('--root', required=True, help='Root directory to serve over HTTP')
    parser.add_argument('--entry', default='index.html', help='Entry URL relative to root')
    parser.add_argument('--probe', action='append', default=[], help='Additional deep-link query probes (e.g. "?stage=act-2&end")')
    parser.add_argument('--out-dir', default='./.verify-shots', help='Screenshot & receipt output folder')
    parser.add_argument('--channel', choices=['auto', 'chrome', 'chromium'], default='auto', help='Browser channel')
    parser.add_argument('--backend', choices=['auto', 'webgl2', 'webgpu'], default='auto', help='Graphics backend')
    parser.add_argument('--strict-4d', action='store_true', help='Enforce Simulify v2 4D quality legs even on v1 benches')
    args = parser.parse_args()

    root_dir = pathlib.Path(args.root).resolve()
    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

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
            browser = launch_browser(p, channel=args.channel, backend=args.backend)
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
                        run_4d_checks=(idx == 0),
                        strict_4d=args.strict_4d,
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
                        run_4d_checks=False,
                        strict_4d=args.strict_4d,
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
        h_str = 'OK' if h_info.get('passed') else f'FAIL({",".join(h_info.get("overlaps", []))})'
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

        print(
            f'  [{tag}] {r["url"]} @ {r["viewport"]} | '
            f'backend={tel.get("rendererBackend")} hic={tel.get("htmlInCanvasSupported")} | '
            f'console={len(r["consoleErrors"])} pageErr={len(r["pageErrors"])} '
            f'reqFail={len(r["failedRequests"])} overflow={r["metrics"]["guideOverflow"]} '
            f'oracle=[prose:{p_str} frame:{f_str} chart:{c_str} hud:{h_str} falsify:{fal_str} '
            f'sparse:{sp_str} scrub:{sc_str} vis:{vi_str}] '
            f'-> {pathlib.Path(r["screenshot"]).name}'
        )
    sys.exit(0 if passed_all else 1)


if __name__ == '__main__':
    main()
