#!/usr/bin/env python3
"""
Deterministic headless Chromium thumbnail baker for simulify multi-lesson galleries.
Renders actual live scenes at deep-linked stage/time URLs (?thumb=1 isolates clean scene
without transient HUD overlays) into crisp 2x PNG assets. Zero runtime GPU cost for learners.
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


def main():
    parser = argparse.ArgumentParser(description='Bake deterministic scene thumbnails from simulify manifest.')
    parser.add_argument('--root', required=True, help='Root directory containing examples & manifest paths')
    parser.add_argument('--manifest', required=True, help='JSON list of { id, url, out, width?, height?, waitMs? }')
    args = parser.parse_args()

    root_dir = pathlib.Path(args.root).resolve()
    manifest_path = pathlib.Path(args.manifest).resolve()
    items = json.loads(manifest_path.read_text(encoding='utf-8'))

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        print(f'ERROR: playwright Python package is required ({exc}).', file=sys.stderr)
        sys.exit(2)

    httpd, port = start_server(root_dir)
    base_url = f'http://127.0.0.1:{port}/'

    try:
        with sync_playwright() as p:
            browser = launch_browser(p)
            for item in items:
                w = int(item.get('width', 640))
                h = int(item.get('height', 400))
                wait_ms = int(item.get('waitMs', 300))
                rel_url = item['url']
                sep = '&' if '?' in rel_url else '?'
                if 'thumb=' not in rel_url:
                    rel_url = f'{rel_url}{sep}thumb=1'

                out_file = (root_dir / item['out']).resolve()
                out_file.parent.mkdir(parents=True, exist_ok=True)

                ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2)
                page = ctx.new_page()
                page.goto(urljoin(base_url, rel_url.lstrip('/')), wait_until='domcontentloaded', timeout=25000)
                try:
                    page.wait_for_function('window.__ready === true', timeout=12000)
                except Exception:
                    page.wait_for_timeout(1200)
                page.wait_for_timeout(wait_ms)
                page.screenshot(path=str(out_file))
                ctx.close()
                print(f'[OK] Baked {item["id"]} -> {out_file} ({w}x{h} @2x)')
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    main()
