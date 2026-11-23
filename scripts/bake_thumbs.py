#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.45"]
# ///
"""
Deterministic headless Chromium/Chrome thumbnail baker for simulify multi-lesson galleries.
Renders actual live scenes at deep-linked stage/time URLs (`?thumb=1` or `?export=stage`)
into crisp 2x PNG assets. Supports optional deterministic `seek(t)` via manifest `t` field,
Chrome 157+ HTML-in-Canvas, and WebGPU/WebGL2 backend selection.
"""

import argparse
import functools
import http.server
import json
import pathlib
import sys
import threading
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class ThreadingBakeServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    request_queue_size = 64
    daemon_threads = True


def start_server(root_dir: pathlib.Path):
    handler = functools.partial(QuietHandler, directory=str(root_dir))
    httpd = ThreadingBakeServer(('127.0.0.1', 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def build_browser_args(backend: str = 'auto'):
    common = ['--enable-blink-features=CanvasDrawElement']
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


def main():
    parser = argparse.ArgumentParser(description='Bake deterministic scene thumbnails from simulify manifest.')
    parser.add_argument('--root', required=True, help='Root directory containing examples & manifest paths')
    parser.add_argument('--manifest', required=True, help='JSON list of { id, url, out, width?, height?, waitMs?, t?, exportMode? }')
    parser.add_argument('--channel', choices=['auto', 'chrome', 'chromium'], default='auto')
    parser.add_argument('--backend', choices=['auto', 'webgl2', 'webgpu'], default='auto')
    parser.add_argument('--dpr', type=float, default=2.0, help='Device scale factor for baked thumbnails (default: 2.0)')
    args = parser.parse_args()
    dpr = max(1.0, min(3.0, float(args.dpr)))

    root_dir = pathlib.Path(args.root).resolve()
    manifest_path = pathlib.Path(args.manifest).resolve()
    items = json.loads(manifest_path.read_text(encoding='utf-8-sig'))

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        print(f'ERROR: playwright Python package is required ({exc}). Try: uv run scripts/bake_thumbs.py ...', file=sys.stderr)
        sys.exit(2)

    httpd, port = start_server(root_dir)
    base_url = f'http://127.0.0.1:{port}/'

    try:
        with sync_playwright() as p:
            browser = launch_browser(p, channel=args.channel, backend=args.backend)
            for item in items:
                w = int(item.get('width', 640))
                h = int(item.get('height', 400))
                wait_ms = int(item.get('waitMs', 300))
                entry = urlsplit(item['url'])
                query = parse_qsl(entry.query, keep_blank_values=True)
                keys = {key for key, _ in query}
                export_mode = item.get('exportMode')
                if export_mode:
                    if 'export' not in keys:
                        query.append(('export', export_mode))
                elif not {'thumb', 'export'} & keys:
                    query.append(('thumb', '1'))
                if args.backend != 'auto':
                    query = [(key, value) for key, value in query if key != 'backend']
                    query.append(('backend', args.backend))
                rel_url = entry._replace(query=urlencode(query)).geturl()

                out_file = (root_dir / item['out']).resolve()
                out_file.parent.mkdir(parents=True, exist_ok=True)

                ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
                page = ctx.new_page()
                response = page.goto(urljoin(base_url, rel_url.lstrip('/')), wait_until='domcontentloaded', timeout=25000)
                if response is None or not response.ok:
                    raise RuntimeError(f'Unable to open thumbnail entry: {rel_url}')
                page.wait_for_function('window.__ready === true', timeout=15000)

                # Apply the mode through the shared hook for entries that do not parse export URLs.
                if export_mode:
                    page.evaluate(
                        "(mode) => window.__simulify?.enterExportMode?.({ hud: mode, muteAudio: true })",
                        export_mode,
                    )

                if item.get('t') is not None:
                    page.evaluate('async (t) => { await window.__simulify?.seek?.(t); }', float(item['t']))
                page.evaluate('() => document.fonts ? document.fonts.ready : null')
                page.wait_for_timeout(wait_ms)
                rendered = page.evaluate(
                    """async () => {
                      const wb = window.__simulify || {};
                      const stage = wb.stage?.stage || wb.stage || wb.scene?.stage;
                      const ok = stage?.renderNowAsync ? await stage.renderNowAsync() : stage?.renderNow?.();
                      return {
                        ok: ok === true && stage?.backendKind !== 'fallback'
                          && !document.querySelector('[data-stage-fallback="true"]'),
                        backend: stage?.backendKind ?? 'unknown',
                      };
                    }"""
                )
                if not rendered['ok'] or (args.backend != 'auto' and rendered['backend'] != args.backend):
                    raise RuntimeError(f'Thumbnail render failed for {item["id"]}: active backend {rendered["backend"]}, requested {args.backend}')
                target = page.locator(item['selector']) if item.get('selector') else page
                target.screenshot(path=str(out_file), animations='disabled')
                ctx.close()
                print(f'[OK] Baked {item["id"]} -> {out_file} (viewport {w}x{h} @{dpr:g}x)')
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    main()
