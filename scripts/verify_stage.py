#!/usr/bin/env python3
"""
Automated 3-viewport & deep-link verification gate (Gate 5) for simulify explainers.
Spins up an ephemeral loopback HTTP server, verifies zero console/page/request errors,
zero guide-card overflow on desktop, mobile thumb-dock visibility, optional URL probes,
and writes screenshots + a machine-readable JSON receipt.
"""

import argparse
import functools
import http.server
import json
import pathlib
import socketserver
import sys
import threading
from urllib.parse import urljoin


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


def launch_browser(p):
    args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
    for attempt in [
        lambda: p.chromium.launch(headless=True, args=args),
        lambda: p.chromium.launch(headless=True, channel='chrome', args=args),
        lambda: p.chromium.launch(headless=True, channel='msedge', args=args),
    ]:
        try:
            return attempt()
        except Exception:
            continue
    raise RuntimeError('No Chromium/Chrome/Edge browser executable found for Playwright.')


def check_target(browser, base_url: str, rel_url: str, width: int, height: int, shot_path: pathlib.Path):
    for attempt in range(2):
        console_errors = []
        page_errors = []
        failed_requests = []

        ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
        page = ctx.new_page()
        page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
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
                if (cs.display === 'none' || el.hidden) continue;
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
                if (!el || el.hidden) continue;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;
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
                if (cs.display !== 'none' && r.width > 0 && r.height > 0) {
                  chartSize = { width: Math.round(r.width), height: Math.round(r.height) };
                }
              }

              // 4. Live counterfactual falsification runner (if exposed)
              let falsifyResult = null;
              if (hook && typeof hook.falsify === 'function') {
                falsifyResult = hook.falsify();
              }

              return {
                title: document.title,
                ready: Boolean(window.__ready),
                hasDirector: Boolean(hook && hook.director),
                directorState: hook?.director?.getState ? hook.director.getState() : null,
                guideOverflow,
                thumbVisible,
                thumbTop,
                hasCanvas: Boolean(canvas),
                canvasWidth: canvasRect ? Math.round(canvasRect.width) : 0,
                canvasHeight: canvasRect ? Math.round(canvasRect.height) : 0,
                bodyTextLen: document.body.innerText.trim().length,
                proseHits: [...new Set(proseHits)],
                hudOverlaps,
                chartSize,
                falsifyResult,
              };
            }"""
        )

        shot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shot_path), animations='disabled', timeout=45000)
        page.close()
        ctx.close()

        is_win_buf_blip = any('ERR_NO_BUFFER_SPACE' in e for e in console_errors)
        if is_win_buf_blip and attempt == 0:
            import time
            time.sleep(0.25)
            continue

        prose_ok = len(metrics['proseHits']) == 0
        frame_ok = (width <= 900) or (not metrics['hasCanvas']) or (
            metrics['canvasWidth'] >= width * 0.45 and metrics['canvasHeight'] >= height * 0.45
        )
        chart_ok = (metrics['chartSize'] is None) or (
            metrics['chartSize']['width'] >= 200 and metrics['chartSize']['height'] >= 85
        )
        hud_ok = (width <= 900) or (len(metrics['hudOverlaps']) == 0)
        falsify_res = metrics.get('falsifyResult')
        falsify_ok = True if falsify_res is None else bool(falsify_res.get('passed'))

        oracle = {
            'prose': {'passed': prose_ok, 'hits': metrics['proseHits']},
            'frame': {'passed': frame_ok, 'w': metrics['canvasWidth'], 'h': metrics['canvasHeight']},
            'chart': {'passed': chart_ok, 'size': metrics['chartSize']},
            'hud': {'passed': hud_ok, 'overlaps': metrics['hudOverlaps']},
            'falsify': falsify_res,
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
            'metrics': metrics,
            'oracle': oracle,
            'passed': ok,
        }


def main():
    parser = argparse.ArgumentParser(description='Verify simulify pages across 3 viewports and deep-link probes.')
    parser.add_argument('--root', required=True, help='Root directory to serve over HTTP')
    parser.add_argument('--entry', default='index.html', help='Entry URL relative to root')
    parser.add_argument('--probe', action='append', default=[], help='Additional deep-link query probes (e.g. "?stage=act-2&end")')
    parser.add_argument('--out-dir', default='./.verify-shots', help='Screenshot & receipt output folder')
    args = parser.parse_args()

    root_dir = pathlib.Path(args.root).resolve()
    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        print(f'ERROR: playwright Python package is required ({exc}).', file=sys.stderr)
        sys.exit(2)

    httpd, port = start_server(root_dir)
    base_url = f'http://127.0.0.1:{port}/'
    slug = pathlib.Path(args.entry).parent.name or pathlib.Path(args.entry).stem

    results = []
    try:
        with sync_playwright() as p:
            browser = launch_browser(p)
            for vw, vh in [(1280, 800), (1440, 900), (390, 844)]:
                shot = out_dir / f'{slug}-{vw}x{vh}.png'
                results.append(check_target(browser, base_url, args.entry, vw, vh, shot))

            for idx, probe in enumerate(args.probe):
                sep = '' if probe.startswith('?') else '?'
                probe_url = f'{args.entry}{sep}{probe}'
                shot = out_dir / f'{slug}-probe-{idx + 1}.png'
                results.append(check_target(browser, base_url, probe_url, 1280, 800, shot))

            browser.close()
    finally:
        httpd.shutdown()

    passed_all = all(r['passed'] for r in results)
    receipt = {
        'root': str(root_dir),
        'entry': args.entry,
        'passed': passed_all,
        'checks': results,
    }
    receipt_path = out_dir / f'{slug}-receipt.json'
    receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding='utf-8')

    print(f'Receipt: {receipt_path}')
    for r in results:
        tag = 'PASS' if r['passed'] else 'FAIL'
        ora = r.get('oracle', {})
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
            fal_str = 'N/A'
        else:
            ok_cnt = sum(1 for a in fal.get('assertions', []) if a.get('passed'))
            tot_cnt = len(fal.get('assertions', []))
            fal_str = f'{ok_cnt}/{tot_cnt}'
        print(
            f'  [{tag}] {r["url"]} @ {r["viewport"]} | '
            f'console={len(r["consoleErrors"])} pageErr={len(r["pageErrors"])} '
            f'reqFail={len(r["failedRequests"])} overflow={r["metrics"]["guideOverflow"]} '
            f'oracle=[prose:{p_str} frame:{f_str} chart:{c_str} hud:{h_str} falsify:{fal_str}] '
            f'-> {pathlib.Path(r["screenshot"]).name}'
        )
    sys.exit(0 if passed_all else 1)


if __name__ == '__main__':
    main()
