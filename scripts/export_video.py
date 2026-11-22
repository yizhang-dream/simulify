#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.45", "numpy>=1.24", "pillow>=9.0"]
# ///
"""
Simulify Tier 2 — Deterministic CLI Studio Video / Animated-Image Exporter.

Drives any Simulify 4D workbench (v2 `window.__simulify` contract or legacy v1 director)
deterministically frame-by-frame via headless Chrome (157+ HTML-in-Canvas + WebGL2/Vulkan GPU
or SwiftShader fallback), with parallel Playwright workers, optional linear-light supersampled
shutter motion blur (with hold-skipping and hard-cut guard), clean `?export=` HUD modes,
act/beat time slicing, and multi-format FFmpeg encoding (MP4, WebM, 2-pass palettegen GIF,
animated WebP, APNG).

Examples:
  uv run scripts/export_video.py --root . --entry examples/rl-td-bench/index.html \
    --out dist/rl-td.mp4 --preset 1080p60 --hud caption

  uv run scripts/export_video.py --root . --entry examples/rl-td-bench/index.html \
    --out dist/rl-td-act2.gif --preset gif --stage act-2 --hud caption

  uv run scripts/export_video.py --root . --entry examples/rl-td-bench/index.html \
    --out dist/rl-td-final.mp4 --preset 4k60 --shutter 180 --formats mp4,gif,webm --gpu
"""

import argparse
import asyncio
import functools
import http.server
import io
import json
import math
import multiprocessing
import os
import pathlib
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ProcessPoolExecutor, wait
from urllib.parse import urlencode, urljoin

import numpy as np
from PIL import Image


# Linear-light sRGB LUTs for physically accurate shutter motion blur integration
_U = np.arange(256) / 255.0
SRGB_TO_LIN = np.where(_U <= 0.04045, _U / 12.92, ((_U + 0.055) / 1.055) ** 2.4).astype(np.float32)
_L = np.arange(65536) / 65535.0
LIN_TO_SRGB = np.clip(
    np.rint(np.where(_L <= 0.0031308, _L * 12.92, 1.055 * np.power(_L, 1.0 / 2.4) - 0.055) * 255.0),
    0,
    255,
).astype(np.uint8)

PRESETS = {
    'draft': {'width': 1280, 'height': 720, 'scale': 1, 'fps': 30, 'crf': 18, 'shutter': 0.0},
    '1080p60': {'width': 1920, 'height': 1080, 'scale': 1, 'fps': 60, 'crf': 16, 'shutter': 0.0},
    '4k60': {'width': 1920, 'height': 1080, 'scale': 2, 'fps': 60, 'crf': 15, 'shutter': 180.0},
    'gif': {'width': 960, 'height': 540, 'scale': 1, 'fps': 15, 'crf': 18, 'shutter': 0.0},
    'webm': {'width': 1280, 'height': 720, 'scale': 1, 'fps': 30, 'crf': 24, 'shutter': 0.0},
}


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class ThreadingExportServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    request_queue_size = 128
    daemon_threads = True


def start_server(root_dir: pathlib.Path):
    handler = functools.partial(QuietHandler, directory=str(root_dir))
    httpd = ThreadingExportServer(('127.0.0.1', 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def build_browser_args(gpu: bool = False):
    common = ['--enable-blink-features=CanvasDrawElement']
    if gpu:
        return common + [
            '--use-gl=angle',
            '--use-angle=vulkan',
            '--enable-features=Vulkan',
            '--enable-unsafe-webgpu',
            '--ignore-gpu-blocklist',
        ]
    return common + [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
    ]


async def launch_browser_async(p, channel: str = 'auto', gpu: bool = False):
    args = build_browser_args(gpu=gpu)
    attempts = []
    if channel == 'chrome':
        attempts = [
            lambda: p.chromium.launch(headless=True, channel='chrome', args=args),
            lambda: p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome', args=args),
        ]
    elif channel == 'chromium':
        attempts = [lambda: p.chromium.launch(headless=True, args=args)]
    else:
        attempts = [
            lambda: p.chromium.launch(headless=True, channel='chrome', args=args),
            lambda: p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome', args=args),
            lambda: p.chromium.launch(headless=True, args=args),
            lambda: p.chromium.launch(headless=True, channel='msedge', args=args),
        ]
    last_err = None
    for attempt in attempts:
        try:
            return await attempt()
        except Exception as exc:
            last_err = exc
    raise RuntimeError(f'No Chrome/Chromium executable available for Playwright ({last_err}).')


def decode_rgb(png_bytes: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(png_bytes)).convert('RGB'))


def cut_side(small_frames):
    """Preserve hard camera/act cuts across shutter integration window."""
    n = len(small_frames)
    if n < 4:
        return list(range(n))
    diffs = np.array([np.abs(small_frames[k + 1] - small_frames[k]).mean() for k in range(n - 1)])
    j = int(diffs.argmax())
    others = np.delete(diffs, j)
    if diffs[j] <= 0 or (len(others) > 0 and diffs[j] < 3.0 * others.max()):
        return list(range(n))
    return list(range(j + 1, n)) if j < n // 2 else list(range(j + 1))


def integrate_pngs(pngs):
    """Integrate sub-frame PNGs in linear light while guarding against hard cuts."""
    if len(pngs) >= 4:
        small = [np.asarray(Image.open(io.BytesIO(p)).convert('L').reduce(8), np.int16) for p in pngs]
        keep = cut_side(small)
    else:
        keep = list(range(len(pngs)))
    acc = None
    for k in keep:
        lin = SRGB_TO_LIN[decode_rgb(pngs[k])]
        acc = lin if acc is None else (acc + lin)
    idx = np.clip(np.rint(acc * (65535.0 / len(keep))), 0, 65535).astype(np.uint16)
    return LIN_TO_SRGB[idx], len(keep) < len(pngs)


# Injected helper on page so BOTH v2 workbenches and legacy v1 benches expose deterministic seek + caption bar
PAGE_BRIDGE_JS = r"""
({ hud, width, height, dpr, paramsJson, lang }) => {
  const wb = window.__simulify || {};
  if (lang && typeof wb.setLang === 'function') {
    wb.setLang(lang);
  }
  if (paramsJson && typeof wb.setParams === 'function') {
    try { wb.setParams(JSON.parse(paramsJson)); } catch (e) { console.error('params error', e); }
  }
  document.documentElement.setAttribute('data-export', hud);

  let captionBar = null;
  const ensureCaptionBar = () => {
    if (hud !== 'caption') return null;
    if (captionBar) return captionBar;
    const existing = document.querySelector('.export-caption-bar');
    if (existing) {
      captionBar = existing;
      return captionBar;
    }
    const host = document.querySelector('.artboard-shell') || document.body;
    const bar = document.createElement('div');
    bar.className = 'export-caption-bar';
    bar.setAttribute('data-export-role', 'caption');
    bar.innerHTML = `
      <div class="export-caption-head">
        <span class="export-caption-badge"></span>
        <strong class="export-caption-title"></strong>
        <span class="export-caption-time"></span>
      </div>
      <p class="export-caption-text"></p>
      <div class="export-caption-eq" hidden></div>
      <div class="export-caption-rail"><div class="export-caption-fill"></div></div>
    `;
    host.appendChild(bar);
    captionBar = bar;
    return bar;
  };

  const updateCaptionBar = () => {
    const bar = ensureCaptionBar();
    if (!bar) return;
    let st = null;
    if (typeof wb.getCaptionState === 'function') {
      st = wb.getCaptionState();
    } else if (wb.director?.getState) {
      const ds = wb.director.getState();
      st = {
        stageIndex: ds.stageIndex,
        stageCount: ds.stageCount,
        stageTitle: ds.stageTitle,
        stepTitle: ds.stepTitle,
        caption: ds.summary || ds.carries || '',
        progress: ds.totalProgress,
        t: ds.t,
        duration: ds.duration || 1,
      };
    }
    if (!st) { bar.hidden = true; return; }
    bar.hidden = false;
    const sNum = (st.stageIndex ?? 0) + 1;
    const sCnt = Math.max(1, st.stageCount ?? 1);
    bar.querySelector('.export-caption-badge').textContent = st.stageTitle ? `${sNum}/${sCnt} · ${st.stageTitle}` : `Act ${sNum}/${sCnt}`;
    bar.querySelector('.export-caption-title').textContent = st.stepTitle || '';
    const tCur = Number(st.t || 0);
    const tDur = Math.max(0.01, Number(st.duration || 1));
    bar.querySelector('.export-caption-time').textContent = `${tCur.toFixed(1)}s / ${tDur.toFixed(1)}s`;
    const txtEl = bar.querySelector('.export-caption-text');
    txtEl.textContent = st.caption || st.summary || st.carries || '';
    txtEl.hidden = !txtEl.textContent;
    const eqEl = bar.querySelector('.export-caption-eq');
    if (st.liveEqText) { eqEl.textContent = st.liveEqText; eqEl.hidden = false; }
    else { eqEl.hidden = true; }
    const prog = Math.max(0, Math.min(1, Number(st.progress ?? (tCur / tDur))));
    bar.querySelector('.export-caption-fill').style.width = `${(prog * 100).toFixed(2)}%`;
  };

  if (typeof wb.enterExportMode === 'function') {
    wb.enterExportMode({ hud, width, height, dpr, muteAudio: true });
  } else if (wb.director) {
    wb.director.pause?.();
  }

  window.__simulifyExportSeek = async (tSec) => {
    if (typeof wb.seek === 'function') {
      await wb.seek(tSec);
    } else if (wb.director && typeof wb.director.seekGlobal === 'function') {
      wb.director.seekGlobal(tSec);
    } else if (wb.director) {
      wb.director.seekTo(tSec);
    }
    const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage;
    if (typeof stageObj?.renderNow === 'function') {
      stageObj.renderNow();
    }
    updateCaptionBar();
    await new Promise((r) => requestAnimationFrame(() => r()));
  };
  updateCaptionBar();
}
"""


async def probe_workbench(url: str, width: int, height: int, hud: str, channel: str, gpu: bool, params_json: str, lang: str):
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await launch_browser_async(p, channel=channel, gpu=gpu)
        ctx = await browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        try:
            await page.wait_for_function('window.__ready === true', timeout=15000)
        except Exception:
            await page.wait_for_timeout(1200)

        await page.evaluate(
            PAGE_BRIDGE_JS,
            {'hud': hud, 'width': width, 'height': height, 'dpr': 1, 'paramsJson': params_json, 'lang': lang},
        )
        info = await page.evaluate(
            """() => {
              const wb = window.__simulify || {};
              const tl = typeof wb.getTimelineInfo === 'function' ? wb.getTimelineInfo() : null;
              const stageObj = wb.stage?.stage || wb.stage || wb.scene?.stage;
              const backend = stageObj?.backendKind || (document.querySelector('canvas') ? 'webgl2' : 'svg');
              return {
                version: wb.version || 1,
                timeline: tl,
                hasSeek: typeof wb.seek === 'function' || typeof wb.director?.seekGlobal === 'function',
                hasMotion: typeof wb.getMotionMagnitude === 'function',
                directorDuration: wb.director?.getState?.()?.duration ?? null,
                rendererBackend: backend,
                htmlInCanvasSupported: 'content' in HTMLCanvasElement.prototype,
              };
            }"""
        )
        await browser.close()
        return info


def resolve_time_range(info: dict, args) -> tuple[float, float]:
    tl = info.get('timeline') or {}
    stages = tl.get('stages') or []
    total_dur = float(tl.get('duration') or info.get('directorDuration') or 8.0)

    def find_stage(ref):
        for s in stages:
            if str(s.get('id')) == str(ref) or str(s.get('index')) == str(ref):
                return s
        return None

    t_start = 0.0
    t_end = total_dur

    if args.stage:
        st = find_stage(args.stage)
        if not st:
            avail = [s.get('id') for s in stages]
            raise ValueError(f'Stage "{args.stage}" not found. Available: {avail}')
        t_start = float(st['start'])
        t_end = float(st['end'])
    else:
        if args.from_stage:
            st = find_stage(args.from_stage)
            if not st:
                raise ValueError(f'--from-stage "{args.from_stage}" not found.')
            t_start = float(st['start'])
        if args.to_stage:
            st = find_stage(args.to_stage)
            if not st:
                raise ValueError(f'--to-stage "{args.to_stage}" not found.')
            t_end = float(st['end'])

    if args.start is not None:
        t_start = max(0.0, float(args.start))
    if args.end is not None:
        t_end = max(t_start + 0.05, float(args.end))

    if t_end <= t_start:
        t_end = t_start + max(1.0, total_dur)
    return t_start, t_end


def worker_entry(job: dict) -> dict:
    return asyncio.run(_worker_run(job))


async def _worker_run(j: dict) -> dict:
    from playwright.async_api import async_playwright

    fps = j['fps']
    t_start = j['t_start']
    t_end = j['t_end']
    fr_dir = j['fr_dir']
    shutter = j['shutter']
    st = {'captures': 0, 'still': 0, 'cuts': 0, 'errors': []}

    async with async_playwright() as p:
        state = {}

        async def launch():
            if state:
                await state['br'].close()
            br = await launch_browser_async(p, channel=j['channel'], gpu=j['gpu'])
            ctx = await br.new_context(
                viewport={'width': j['width'], 'height': j['height']},
                device_scale_factor=j['scale'],
            )
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: st['errors'].append(str(e)))
            pg.on('console', lambda m: st['errors'].append(m.text) if m.type == 'error' else None)
            await pg.goto(j['url'], wait_until='domcontentloaded', timeout=30000)
            try:
                await pg.wait_for_function('window.__ready === true', timeout=15000)
            except Exception:
                await pg.wait_for_timeout(1200)
            await pg.evaluate(
                PAGE_BRIDGE_JS,
                {
                    'hud': j['hud'],
                    'width': j['width'],
                    'height': j['height'],
                    'dpr': j['scale'],
                    'paramsJson': j['params_json'],
                    'lang': j['lang'],
                },
            )
            state['br'] = br
            state['pg'] = pg

        await launch()
        adaptive = shutter > 0 and j['has_motion']
        open_s = (shutter / 360.0) / fps

        async def grab(t_sec: float) -> bytes:
            clamped = min(max(t_sec, t_start), max(t_start, t_end - 1e-6))
            await state['pg'].evaluate('window.__simulifyExportSeek', clamped)
            st['captures'] += 1
            return await state['pg'].screenshot(type='png')

        done = 0
        for f in range(j['k'], j['N'], j['n']):
            out_path = os.path.join(fr_dir, f'{f:05d}.png')
            if j['resume'] and os.path.exists(out_path):
                continue
            if done and j['recycle'] and done % j['recycle'] == 0:
                await launch()
            done += 1

            t = t_start + f / fps
            if shutter <= 0:
                png = await grab(t)
                with open(out_path, 'wb') as fh:
                    fh.write(png)
                continue

            samples = j['samples']
            if adaptive:
                try:
                    t0 = max(t - open_s * 0.5, t_start)
                    t1 = min(t + open_s * 0.5, max(t_start, t_end - 1e-6))
                    far = await state['pg'].evaluate(
                        '([a, b]) => window.__simulify?.getMotionMagnitude?.(a, b) ?? 0',
                        [t0, t1],
                    )
                    samples = min(j['smax'], max(j['smin'], math.ceil(float(far) * j['scale'] / j['gap'])))
                except Exception:
                    samples = j['samples']

            times = [
                min(max(t + open_s * ((s_idx + 0.5) / samples - 0.5), t_start), max(t_start, t_end - 1e-6))
                for s_idx in range(samples)
            ]
            first = await grab(times[0])
            last = await grab(times[-1])
            if first == last:
                with open(out_path, 'wb') as fh:
                    fh.write(first)
                st['still'] += 1
                continue

            pngs = [first] + [await grab(tk) for tk in times[1:-1]] + [last]
            img_arr, had_cut = integrate_pngs(pngs)
            if had_cut:
                st['cuts'] += 1
            Image.fromarray(img_arr).save(out_path, compress_level=1)

        if state:
            await state['br'].close()
    return st


def encode_format(fmt: str, frames_dir: pathlib.Path, out_path: pathlib.Path, fps: int, crf: int, nvenc: bool):
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('ffmpeg executable not found on PATH.')

    out_path.parent.mkdir(parents=True, exist_ok=True)
    inp = str(frames_dir / '%05d.png')

    if fmt == 'mp4':
        vcodec = 'h264_nvenc' if nvenc else 'libx264'
        cmd = [ffmpeg, '-v', 'error', '-y', '-framerate', str(fps), '-i', inp, '-c:v', vcodec]
        if nvenc:
            cmd += ['-cq', str(crf), '-preset', 'p5']
        else:
            cmd += ['-preset', 'medium', '-crf', str(crf), '-profile:v', 'high']
        cmd += ['-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out_path)]
        subprocess.run(cmd, check=True)
    elif fmt == 'webm':
        cmd = [
            ffmpeg, '-v', 'error', '-y', '-framerate', str(fps), '-i', inp,
            '-c:v', 'libvpx-vp9', '-crf', str(max(18, crf)), '-b:v', '0',
            '-row-mt', '1', '-pix_fmt', 'yuv420p', str(out_path),
        ]
        subprocess.run(cmd, check=True)
    elif fmt == 'gif':
        gif_fps = min(fps, 20)
        pal_path = frames_dir / '_palette.png'
        vf_base = f'fps={gif_fps}'
        subprocess.run(
            [
                ffmpeg, '-v', 'error', '-y', '-framerate', str(fps), '-i', inp,
                '-vf', f'{vf_base},palettegen=stats_mode=diff:max_colors=256',
                str(pal_path),
            ],
            check=True,
        )
        subprocess.run(
            [
                ffmpeg, '-v', 'error', '-y', '-framerate', str(fps), '-i', inp, '-i', str(pal_path),
                '-lavfi', f'{vf_base}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
                str(out_path),
            ],
            check=True,
        )
    elif fmt == 'webp':
        cmd = [
            ffmpeg, '-v', 'error', '-y', '-framerate', str(fps), '-i', inp,
            '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '85', '-loop', '0',
            str(out_path),
        ]
        subprocess.run(cmd, check=True)
    elif fmt == 'apng':
        cmd = [
            ffmpeg, '-v', 'error', '-y', '-framerate', str(fps), '-i', inp,
            '-c:v', 'apng', '-plays', '0', str(out_path),
        ]
        subprocess.run(cmd, check=True)
    else:
        raise ValueError(f'Unsupported output format: {fmt}')


def main():
    ap = argparse.ArgumentParser(description='Simulify Tier 2 deterministic 4D video/GIF studio exporter.')
    ap.add_argument('--root', required=True, help='Root directory to serve over loopback HTTP')
    ap.add_argument('--entry', default='index.html', help='Workbench HTML path relative to --root')
    ap.add_argument('--out', required=True, help='Primary output file path (e.g. dist/demo.mp4 or dist/demo.gif)')
    ap.add_argument('--preset', choices=list(PRESETS.keys()), default='draft', help='Resolution/fps/shutter preset')
    ap.add_argument('--formats', default=None, help='Comma-separated formats to emit from one capture (mp4,gif,webm,webp,apng)')
    ap.add_argument('--hud', choices=['caption', 'stage', 'hud'], default='caption', help='Export HUD mode')
    ap.add_argument('--stage', default=None, help='Export only a single stage/act id or index')
    ap.add_argument('--from-stage', default=None, help='Start at this stage/act id or index')
    ap.add_argument('--to-stage', default=None, help='End at this stage/act id or index')
    ap.add_argument('--start', type=float, default=None, help='Start timestamp in seconds')
    ap.add_argument('--end', type=float, default=None, help='End timestamp in seconds')
    ap.add_argument('--width', type=int, default=None)
    ap.add_argument('--height', type=int, default=None)
    ap.add_argument('--scale', type=int, default=None)
    ap.add_argument('--fps', type=int, default=None)
    ap.add_argument('--crf', type=int, default=None)
    ap.add_argument('--shutter', type=float, default=None, help='Shutter angle in degrees (0 = off, 180 = cinematic blur)')
    ap.add_argument('--samples', type=int, default=6, help='Shutter sub-samples per moving frame')
    ap.add_argument('--samples-min', type=int, default=4)
    ap.add_argument('--samples-max', type=int, default=12)
    ap.add_argument('--gap', type=float, default=24.0, help='Adaptive shutter px gap when getMotionMagnitude exists')
    ap.add_argument('--params', default=None, help='JSON dict passed to window.__simulify.setParams()')
    ap.add_argument('--lang', default=None, help='Language query/switch (zh|en)')
    ap.add_argument('--gpu', action='store_true', help='Use Vulkan hardware GPU acceleration in Chrome')
    ap.add_argument('--nvenc', action='store_true', help='Use h264_nvenc hardware encoder for MP4')
    ap.add_argument('--channel', choices=['auto', 'chrome', 'chromium'], default='auto')
    ap.add_argument('--workers', type=int, default=None, help='Parallel Playwright worker processes')
    ap.add_argument('--recycle', type=int, default=150, help='Relaunch worker browser every N frames (0 = off)')
    ap.add_argument('--resume', action='store_true', help='Reuse already-rendered frames in _frames/')
    ap.add_argument('--keep-frames', action='store_true', help='Keep temporary _frames/ PNG directory')
    args = ap.parse_args()

    try:
        import playwright  # noqa: F401
    except ImportError as exc:
        print(f'ERROR: playwright Python package is required ({exc}). Try: uv run scripts/export_video.py ...', file=sys.stderr)
        sys.exit(2)

    preset = PRESETS[args.preset]
    width = (args.width or preset['width']) & ~1
    height = (args.height or preset['height']) & ~1
    scale = max(1, args.scale or preset['scale'])
    fps = max(1, args.fps or preset['fps'])
    crf = args.crf if args.crf is not None else preset['crf']
    shutter = args.shutter if args.shutter is not None else preset['shutter']

    root_dir = pathlib.Path(args.root).resolve()
    out_path = pathlib.Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    frames_dir = out_path.parent / f'.{out_path.stem}_frames'
    if not args.resume:
        shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Resolve output format list
    if args.formats:
        formats = [f.strip().lower().lstrip('.') for f in args.formats.split(',') if f.strip()]
    else:
        ext = out_path.suffix.lower().lstrip('.') or 'mp4'
        formats = [ext]

    httpd, port = start_server(root_dir)
    base_url = f'http://127.0.0.1:{port}/'
    query = {'export': args.hud, 'paused': '1'}
    if args.lang:
        query['lang'] = args.lang
    entry_url = urljoin(base_url, args.entry.lstrip('/'))
    sep = '&' if '?' in entry_url else '?'
    full_url = f'{entry_url}{sep}{urlencode(query)}'

    try:
        info = asyncio.run(
            probe_workbench(full_url, width, height, args.hud, args.channel, args.gpu, args.params, args.lang)
        )
        t_start, t_end = resolve_time_range(info, args)
        dur = max(0.05, t_end - t_start)
        total_frames = max(2, int(round(dur * fps)))

        default_workers = min(4 if args.gpu else 6, max(1, (os.cpu_count() or 3) - 2))
        nw = max(1, min(args.workers or default_workers, total_frames))

        print(
            f'[simulify-export] {args.entry} | {width * scale}x{height * scale} @ {fps}fps | '
            f't={t_start:.2f}..{t_end:.2f}s ({total_frames} frames) | hud={args.hud} | '
            f'shutter={shutter:g}° | workers={nw} | backend={info["rendererBackend"]} | hic={info["htmlInCanvasSupported"]}',
            flush=True,
        )

        job = {
            'url': full_url,
            'fr_dir': str(frames_dir),
            'fps': fps,
            't_start': t_start,
            't_end': t_end,
            'N': total_frames,
            'n': nw,
            'width': width,
            'height': height,
            'scale': scale,
            'hud': args.hud,
            'shutter': shutter,
            'samples': max(2, args.samples),
            'smin': max(2, args.samples_min),
            'smax': max(2, args.samples_max),
            'gap': args.gap,
            'has_motion': bool(info.get('hasMotion')),
            'params_json': args.params,
            'lang': args.lang,
            'channel': args.channel,
            'gpu': args.gpu,
            'resume': args.resume,
            'recycle': args.recycle,
        }

        t0 = time.time()
        with ProcessPoolExecutor(max_workers=nw, mp_context=multiprocessing.get_context('spawn')) as ex:
            futs = [ex.submit(worker_entry, {**job, 'k': k}) for k in range(nw)]
            while wait(futs, timeout=10).not_done:
                done_cnt = sum(1 for name in os.listdir(frames_dir) if name.endswith('.png') and not name.startswith('_'))
                print(f'  rendered {done_cnt}/{total_frames} frames ({time.time() - t0:.0f}s)', flush=True)
            results = [f.result() for f in futs]

        render_secs = time.time() - t0
        captures = sum(r['captures'] for r in results)
        still_skipped = sum(r['still'] for r in results)
        cut_frames = sum(r['cuts'] for r in results)
        errors = [e for r in results for e in r['errors']]

        emitted = []
        for fmt in formats:
            target = out_path if (len(formats) == 1 and out_path.suffix.lower().lstrip('.') == fmt) else out_path.with_suffix(f'.{fmt}')
            encode_format(fmt, frames_dir, target, fps=fps, crf=crf, nvenc=args.nvenc)
            emitted.append({'format': fmt, 'path': str(target), 'bytes': target.stat().st_size})
            print(f'  [OK] {fmt.upper()} -> {target} ({target.stat().st_size / 1024:.1f} KB)', flush=True)

        if not args.keep_frames:
            shutil.rmtree(frames_dir, ignore_errors=True)

        receipt = {
            'entry': args.entry,
            'hud': args.hud,
            'preset': args.preset,
            'size': [width * scale, height * scale],
            'fps': fps,
            'range': [round(t_start, 3), round(t_end, 3)],
            'durationSec': round(dur, 3),
            'frames': total_frames,
            'captures': captures,
            'stillSkipped': still_skipped,
            'cutFrames': cut_frames,
            'shutterDeg': shutter,
            'workers': nw,
            'seconds': round(render_secs, 2),
            'rendererBackend': info.get('rendererBackend'),
            'htmlInCanvasSupported': info.get('htmlInCanvasSupported'),
            'outputs': emitted,
            'errors': errors[:20],
        }
        receipt_path = out_path.with_suffix('.export.json')
        receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f'[OK] Receipt -> {receipt_path} ({render_secs:.1f}s, errors={len(errors)})')
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    main()
