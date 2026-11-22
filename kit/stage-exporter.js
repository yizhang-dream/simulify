/**
 * Simulify Tier 1 — Zero-CDN Offline In-Browser 4D Video & Animated Image Exporter.
 *
 * Consumes the unified `window.__simulify` v2 contract (with a clean legacy v1 adapter),
 * deterministically steps `t = tStart + i / fps` frame by frame (zero dropped frames),
 * lazy-loads only the requested encoder module under `./export/*.js`, and supports:
 *   - MP4 (WebCodecs H.264 + pure-JS ISOBMFF muxer, graceful fallback)
 *   - WebM (WebCodecs VP9/VP8 + pure-JS EBML muxer, MediaRecorder fallback)
 *   - GIF (pure-JS GIF89a with keyframe median-cut palette, 4x4 Bayer dither, hold coalescing)
 *   - APNG (lossless 24-bit native PNG chunk stitcher with hold coalescing)
 *   - PNG (single deterministic frame still)
 */

const RESOLUTION_PRESETS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeEven(n) {
  return Math.max(2, Math.floor(n) & ~1);
}

function slugify(str) {
  return String(str || 'simulify-4d')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'simulify-4d';
}

/**
 * Build a graceful v2-shaped adapter for legacy v1 workbenches that only expose `director` / `scene`.
 */
function buildLegacyAdapter(raw) {
  const director = raw?.director || null;
  const stage = raw?.stage?.stage || raw?.stage || raw?.scene?.stage || null;
  const callouts = raw?.callouts || raw?.scene?.callouts || null;
  let savedExportAttr = null;
  let savedPlaying = false;

  const computeSteps = () => {
    if (!director || !Array.isArray(director.flatSteps)) {
      return { duration: 6, stages: [] };
    }
    const stages = [];
    const byStage = new Map();
    let cursor = 0;
    director.flatSteps.forEach((meta, idx) => {
      const dur = meta._cachedDur ?? 4.0;
      const start = cursor;
      const end = start + dur;
      cursor = end;
      let st = byStage.get(meta.stageIndex);
      if (!st) {
        st = {
          id: meta.stageId,
          index: meta.stageIndex,
          title: meta.stageTitle,
          start,
          end,
          carries: meta.carries || '',
          hook: meta.hook || '',
          steps: [],
        };
        byStage.set(meta.stageIndex, st);
        stages.push(st);
      }
      st.end = end;
      st.steps.push({
        id: meta.id,
        index: idx,
        title: meta.title,
        start,
        end,
        summary: meta.summary || '',
        carries: meta.carries || '',
        hook: meta.hook || '',
      });
    });
    return { duration: Math.max(0.5, cursor), stages };
  };

  return {
    version: 1,
    getTimelineInfo() {
      if (director && typeof director.getTimelineInfo === 'function') {
        return director.getTimelineInfo();
      }
      const { duration, stages } = computeSteps();
      return { mode: director ? 'director' : 'custom', duration, defaultFps: 30, stages };
    },
    enterExportMode({ hud = 'caption' } = {}) {
      savedExportAttr = document.documentElement.getAttribute('data-export');
      document.documentElement.setAttribute('data-export', hud);
      if (director) {
        savedPlaying = Boolean(director.playing);
        director.pause();
      }
      stage?.setManualMode?.(true);
    },
    seek(globalTimeSec) {
      if (director && typeof director.seekGlobal === 'function') {
        director.seekGlobal(globalTimeSec);
      } else if (director) {
        const info = this.getTimelineInfo();
        let targetStep = 0;
        let localT = globalTimeSec;
        for (const st of info.stages) {
          for (const step of st.steps) {
            if (globalTimeSec >= step.start && globalTimeSec <= step.end) {
              targetStep = step.index;
              localT = globalTimeSec - step.start;
            }
          }
        }
        if (director.index !== targetStep) {
          director.jump(targetStep, { play: false, emitCamera: true });
        }
        director.seekTo(localT);
      }
      stage?.renderNow?.();
    },
    exitExportMode() {
      stage?.setManualMode?.(false);
      if (savedExportAttr === null) {
        document.documentElement.removeAttribute('data-export');
      } else {
        document.documentElement.setAttribute('data-export', savedExportAttr);
      }
      if (director && savedPlaying) director.play();
    },
    getCaptureTargets() {
      const rootEl = document.querySelector('.artboard-shell') || document.body;
      const stageCanvas = stage?.canvas || document.querySelector('#stage-canvas, canvas.stage-canvas');
      const stageSvg = !stageCanvas ? document.querySelector('.stage-2d-svg') : null;
      return {
        rootEl,
        stageCanvas,
        stageSvg,
        overlayEls: Array.from(
          rootEl.querySelectorAll(
            '.leader-svg, .tags-layer, .popups-layer, .hud-top-left, .hud-guide, .hud-bottom-left, .hud-bottom-center, .top-ribbon, .right-dock, .bottom-left-dock, .bottom-transport'
          )
        ),
        callouts,
        stage,
        renderNow: () => {
          if (typeof stage?.renderNow === 'function') {
            stage.renderNow();
          } else if (stage?.outline && stage?.scene && stage?.camera) {
            stage.outline.render(stage.scene, stage.camera);
          }
        },
        renderNowAsync: async () => {
          if (typeof stage?.renderNowAsync === 'function') {
            await stage.renderNowAsync();
          } else if (typeof stage?.renderNow === 'function') {
            stage.renderNow();
          } else if (stage?.outline && stage?.scene && stage?.camera) {
            await stage.outline.renderAsync?.(stage.scene, stage.camera);
          }
        },
      };
    },
    getCaptionState() {
      if (!director) return null;
      const st = director.getState();
      const info = this.getTimelineInfo();
      return {
        stageIndex: st.stageIndex,
        stageCount: st.stageCount,
        stageTitle: st.stageTitle,
        stepTitle: st.stepTitle,
        caption: st.summary || st.carries || '',
        carries: st.carries,
        hook: st.hook,
        progress: st.totalProgress,
        t: st.t,
        duration: info.duration,
      };
    },
  };
}

function resolveWorkbench(explicit) {
  const wb = explicit || globalThis.__simulify;
  if (!wb) {
    throw new Error('StageExporter requires window.__simulify (call exposeTestHooks first).');
  }
  if (typeof wb.seek === 'function' && typeof wb.getTimelineInfo === 'function') {
    return wb;
  }
  return buildLegacyAdapter(wb);
}

async function pickSupportedVideoCodec(candidates, { width, height, fps, bitrate, avcFormat }) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }
  for (const codec of candidates) {
    const config = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      ...(avcFormat ? { avc: { format: avcFormat } } : {}),
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support?.supported) return { codec, config: support.config || config };
    } catch {
      // try next candidate
    }
  }
  return null;
}

export class StageExporter {
  /**
   * @param {{ workbench?: any, filenamePrefix?: string }} [options]
   */
  constructor(options = {}) {
    this._explicitWorkbench = options.workbench || null;
    this.filenamePrefix = options.filenamePrefix || '';
    this.lang = String(
      options.lang ||
      (typeof document !== 'undefined' && document.documentElement?.lang?.toLowerCase().startsWith('en') ? 'en' : 'zh')
    ).toLowerCase().startsWith('en')
      ? 'en'
      : 'zh';
    this._langListeners = new Set();
    this._busy = false;
  }

  /**
   * Update exporter language ('zh' | 'en') and notify any attached export UI buttons/popovers.
   */
  setLang(lang) {
    const next = String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'zh';
    this.lang = next;
    for (const fn of this._langListeners) {
      try {
        fn(next);
      } catch {
        // ignore listener errors
      }
    }
    return this.lang;
  }

  getWorkbench() {
    return resolveWorkbench(this._explicitWorkbench);
  }

  getTimelineInfo() {
    return this.getWorkbench().getTimelineInfo();
  }

  async getCapabilities() {
    const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
    const hasHic =
      typeof HTMLCanvasElement !== 'undefined' &&
      'content' in HTMLCanvasElement.prototype &&
      typeof CanvasRenderingContext2D !== 'undefined' &&
      'drawElementImage' in CanvasRenderingContext2D.prototype;

    let mp4WebCodecs = false;
    let webmWebCodecs = false;
    if (hasWebCodecs) {
      const [h264, vp9] = await Promise.all([
        pickSupportedVideoCodec(['avc1.640028', 'avc1.42001f'], { width: 1280, height: 720, fps: 30, bitrate: 4e6, avcFormat: 'avc' }),
        pickSupportedVideoCodec(['vp09.00.10.08', 'vp8'], { width: 1280, height: 720, fps: 30, bitrate: 4e6 }),
      ]);
      mp4WebCodecs = Boolean(h264);
      webmWebCodecs = Boolean(vp9);
    }
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    return {
      mp4: mp4WebCodecs || (hasMediaRecorder && MediaRecorder.isTypeSupported?.('video/mp4')),
      mp4Deterministic: mp4WebCodecs,
      webm: webmWebCodecs || (hasMediaRecorder && MediaRecorder.isTypeSupported?.('video/webm')),
      webmDeterministic: webmWebCodecs,
      gif: true,
      apng: true,
      png: true,
      htmlInCanvas: hasHic,
      worker: typeof Worker !== 'undefined',
    };
  }

  /**
   * Export the 4D workbench deterministically into MP4, WebM, GIF, APNG, or PNG.
   * @param {{
   *   format?: 'mp4' | 'webm' | 'gif' | 'apng' | 'png',
   *   hud?: 'caption' | 'stage' | 'hud',
   *   scope?: 'full' | 'current' | string | { stageId?: string, start?: number, end?: number },
   *   resolution?: 'current' | '720p' | '1080p' | { width: number, height: number },
   *   fps?: number,
   *   bitrate?: number,
   *   dither?: boolean,
   *   signal?: AbortSignal,
   *   onProgress?: (info: { phase: string, frame: number, totalFrames: number, pct: number, elapsedMs: number, message?: string }) => void,
   *   onNotice?: (msg: string) => void
   * }} [opts]
   */
  async export(opts = {}) {
    if (this._busy) {
      throw new Error('An export is already in progress.');
    }
    this._busy = true;
    const tWallStart = performance.now();

    const wb = this.getWorkbench();
    const info = wb.getTimelineInfo();
    const format = String(opts.format || 'mp4').toLowerCase();
    const hud = opts.hud || 'caption';
    const fps = Math.max(1, Math.min(60, Number(opts.fps || (format === 'gif' ? 15 : 30))));
    const signal = opts.signal || null;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const onNotice = typeof opts.onNotice === 'function' ? opts.onNotice : null;

    const checkAbort = () => {
      if (signal?.aborted) {
        const err = new Error('Export cancelled');
        err.name = 'AbortError';
        throw err;
      }
    };

    // Resolve time range from scope
    const range = this.#resolveRange(opts.scope || 'full', info, wb);
    const durationSec = Math.max(0, range.end - range.start);
    const totalFrames = format === 'png' ? 1 : Math.max(2, Math.round(durationSec * fps));

    // Resolve export dimensions (even integers for H.264/VP9 compatibility)
    const rawTargets = wb.getCaptureTargets();
    const rootRect = (rawTargets.rootEl || document.body).getBoundingClientRect();
    let width;
    let height;
    if (opts.resolution && typeof opts.resolution === 'object') {
      width = makeEven(opts.resolution.width);
      height = makeEven(opts.resolution.height);
    } else if (RESOLUTION_PRESETS[opts.resolution]) {
      width = RESOLUTION_PRESETS[opts.resolution].width;
      height = RESOLUTION_PRESETS[opts.resolution].height;
    } else if (format === 'gif' && !opts.resolution) {
      // Crisp default GIF size keeping viewport aspect ratio
      const aspect = (rootRect.width || 1280) / Math.max(1, rootRect.height || 720);
      width = makeEven(Math.min(960, rootRect.width || 800));
      height = makeEven(width / aspect);
    } else {
      width = makeEven(rootRect.width || 1280);
      height = makeEven(rootRect.height || 720);
    }

    const bitrate = opts.bitrate || Math.round(Math.max(2_500_000, Math.min(18_000_000, width * height * fps * 0.14)));

    // Lazy-load compositor + requested format encoder
    const { createFrameCompositor } = await import('./export/compositor.js');
    let compositor = null;
    let enteredExport = false;

    try {
      checkAbort();
      onProgress?.({ phase: 'init', frame: 0, totalFrames, pct: 0, elapsedMs: 0, message: 'Preparing export…' });

      await wb.enterExportMode?.({ hud, width, height, dpr: 1, muteAudio: true });
      enteredExport = true;
      const targets = wb.getCaptureTargets();

      compositor = createFrameCompositor({
        targets,
        width,
        height,
        hudMode: hud,
        preferHic: opts.preferHic !== false,
        getCaptionState: () => wb.getCaptionState?.() ?? null,
        onNotice,
      });

      let blob;
      let mimeType;
      let actualFormat = format;
      let extraStats = null;

      if (format === 'png') {
        await wb.seek(range.start);
        const frameCanvas = await compositor.captureFrame();
        blob = await new Promise((resolve, reject) => {
          frameCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG capture failed'))), 'image/png');
        });
        mimeType = 'image/png';
        onProgress?.({ phase: 'done', frame: 1, totalFrames: 1, pct: 100, elapsedMs: performance.now() - tWallStart });
      } else if (format === 'gif') {
        const { GifEncoderSession } = await import('./export/gif-encoder.js');
        const session = new GifEncoderSession({
          width,
          height,
          fps,
          dither: opts.dither !== false,
          coalesceHolds: true,
          dirtyRect: true,
          useWorker: true,
        });
        for (let i = 0; i < totalFrames; i += 1) {
          checkAbort();
          const t = range.start + (i / fps);
          await wb.seek(Math.min(range.end, t));
          const frameCanvas = await compositor.captureFrame();
          session.addCanvas(frameCanvas);
          if (i % 3 === 0 || i === totalFrames - 1) {
            onProgress?.({
              phase: 'capture',
              frame: i + 1,
              totalFrames,
              pct: Math.round(((i + 1) / totalFrames) * 78),
              elapsedMs: performance.now() - tWallStart,
              message: `Capturing ${i + 1}/${totalFrames}…`,
            });
            await yieldToMain();
          }
        }
        onProgress?.({ phase: 'encode', frame: totalFrames, totalFrames, pct: 82, elapsedMs: performance.now() - tWallStart, message: 'Quantizing & LZW encoding GIF…' });
        const res = await session.finalize();
        blob = res.blob;
        mimeType = 'image/gif';
        extraStats = res.stats;
      } else if (format === 'apng') {
        const { ApngSession } = await import('./export/apng-muxer.js');
        const session = new ApngSession({ fps, loop: 0, coalesceHolds: true });
        for (let i = 0; i < totalFrames; i += 1) {
          checkAbort();
          const t = range.start + (i / fps);
          await wb.seek(Math.min(range.end, t));
          const frameCanvas = await compositor.captureFrame();
          await session.addCanvas(frameCanvas);
          if (i % 3 === 0 || i === totalFrames - 1) {
            onProgress?.({
              phase: 'capture',
              frame: i + 1,
              totalFrames,
              pct: Math.round(((i + 1) / totalFrames) * 90),
              elapsedMs: performance.now() - tWallStart,
              message: `Capturing PNG ${i + 1}/${totalFrames}…`,
            });
            await yieldToMain();
          }
        }
        onProgress?.({ phase: 'encode', frame: totalFrames, totalFrames, pct: 95, elapsedMs: performance.now() - tWallStart, message: 'Stitching APNG chunks…' });
        const res = session.finalize();
        blob = res.blob;
        mimeType = 'image/apng';
        extraStats = res.stats;
      } else if (format === 'mp4' || format === 'webm') {
        const res = await this.#exportVideo({
          format,
          wb,
          compositor,
          range,
          totalFrames,
          fps,
          width,
          height,
          bitrate,
          tWallStart,
          checkAbort,
          onProgress,
          onNotice,
        });
        blob = res.blob;
        mimeType = res.mimeType;
        actualFormat = res.actualFormat;
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }

      const elapsedMs = Math.round(performance.now() - tWallStart);
      onProgress?.({ phase: 'done', frame: totalFrames, totalFrames, pct: 100, elapsedMs, message: 'Export ready' });

      const base = slugify(this.filenamePrefix || document.title || 'simulify-4d');
      const scopeTag = range.label ? `-${slugify(range.label)}` : '';
      const filename = `${base}${scopeTag}.${actualFormat}`;

      return {
        blob,
        filename,
        mimeType,
        format: actualFormat,
        width,
        height,
        fps: format === 'png' ? 0 : fps,
        frameCount: totalFrames,
        durationSec,
        compositorMode: compositor.mode,
        elapsedMs,
        stats: extraStats,
      };
    } finally {
      try {
        compositor?.dispose();
      } catch {
        // ignore cleanup errors
      }
      if (enteredExport) {
        try {
          await wb.exitExportMode?.();
        } catch {
          // ignore exit errors
        }
      }
      this._busy = false;
    }
  }

  async #exportVideo({ format, wb, compositor, range, totalFrames, fps, width, height, bitrate, tWallStart, checkAbort, onProgress, onNotice }) {
    const isMp4 = format === 'mp4';
    const { Mp4Muxer, MP4_CODEC_CANDIDATES } = isMp4 ? await import('./export/mp4-muxer.js') : {};
    const { WebmMuxer, WEBM_CODEC_CANDIDATES, createMediaRecorderSession } = await import('./export/webm-muxer.js');

    let selected = isMp4
      ? await pickSupportedVideoCodec(MP4_CODEC_CANDIDATES, { width, height, fps, bitrate, avcFormat: 'avc' })
      : await pickSupportedVideoCodec(WEBM_CODEC_CANDIDATES, { width, height, fps, bitrate });

    let actualFormat = format;
    if (isMp4 && !selected) {
      // Fall back to WebCodecs WebM before MediaRecorder so export stays deterministic CFR
      const webmFallback = await pickSupportedVideoCodec(WEBM_CODEC_CANDIDATES, { width, height, fps, bitrate });
      if (webmFallback) {
        selected = webmFallback;
        actualFormat = 'webm';
        onNotice?.('H.264 WebCodecs unavailable in this browser; fell back to deterministic WebM (VP9/VP8).');
      }
    }

    if (selected) {
      const muxer = actualFormat === 'mp4'
        ? new Mp4Muxer({ width, height, fps })
        : new WebmMuxer({ width, height, fps, codec: selected.codec });

      let encoderErr = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addChunk(chunk, meta);
          } catch (e) {
            encoderErr = e;
          }
        },
        error: (e) => {
          encoderErr = e;
        },
      });
      encoder.configure(selected.config);

      const frameDurUs = Math.round(1e6 / fps);
      const keyEvery = Math.max(fps, Math.round(fps * 2));

      try {
        for (let i = 0; i < totalFrames; i += 1) {
          checkAbort();
          if (encoderErr) throw encoderErr;
          while (encoder.encodeQueueSize > 8) {
            await new Promise((r) => setTimeout(r, 8));
            checkAbort();
            if (encoderErr) throw encoderErr;
          }
          const t = range.start + (i / fps);
          await wb.seek(Math.min(range.end, t));
          const frameCanvas = await compositor.captureFrame();
          const vf = new VideoFrame(frameCanvas, {
            timestamp: Math.round(i * (1e6 / fps)),
            duration: frameDurUs,
          });
          encoder.encode(vf, { keyFrame: i === 0 || i % keyEvery === 0 });
          vf.close();

          if (i % 4 === 0 || i === totalFrames - 1) {
            onProgress?.({
              phase: 'encode',
              frame: i + 1,
              totalFrames,
              pct: Math.round(((i + 1) / totalFrames) * 94),
              elapsedMs: performance.now() - tWallStart,
              message: `Encoding ${actualFormat.toUpperCase()} ${i + 1}/${totalFrames}…`,
            });
            await yieldToMain();
          }
        }
        await encoder.flush();
        if (encoderErr) throw encoderErr;
      } finally {
        try {
          if (encoder.state !== 'closed') encoder.close();
        } catch {
          // ignore
        }
      }

      const blob = muxer.toBlob();
      return {
        blob,
        mimeType: actualFormat === 'mp4' ? 'video/mp4' : 'video/webm',
        actualFormat,
      };
    }

    // Final fallback: MediaRecorder (real-time paced when WebCodecs is unavailable)
    onNotice?.('WebCodecs unavailable; using MediaRecorder fallback.');
    const mr = createMediaRecorderSession(compositor.canvas, { fps, prefer: format, bitrate });
    try {
      for (let i = 0; i < totalFrames; i += 1) {
        checkAbort();
        const t = range.start + (i / fps);
        await wb.seek(Math.min(range.end, t));
        await compositor.captureFrame();
        await mr.addFrame();
        if (i % 4 === 0 || i === totalFrames - 1) {
          onProgress?.({
            phase: 'encode',
            frame: i + 1,
            totalFrames,
            pct: Math.round(((i + 1) / totalFrames) * 94),
            elapsedMs: performance.now() - tWallStart,
            message: `Recording ${i + 1}/${totalFrames}…`,
          });
        }
      }
      const blob = await mr.finish();
      const recFmt = mr.mimeType.includes('mp4') ? 'mp4' : 'webm';
      return { blob, mimeType: blob.type || `video/${recFmt}`, actualFormat: recFmt };
    } catch (err) {
      mr.abort();
      throw err;
    }
  }

  #resolveRange(scope, info, wb) {
    const total = Math.max(0.5, Number(info?.duration) || 6);
    if (scope === 'current') {
      const cap = wb.getCaptionState?.();
      const curT = Number(cap?.t ?? wb.director?.getState?.()?.t ?? 0);
      return { start: Math.max(0, curT), end: Math.max(0, curT), label: 'frame' };
    }
    if (typeof scope === 'string' && scope.startsWith('stage:')) {
      const id = scope.slice('stage:'.length);
      const st = (info?.stages || []).find((s) => s.id === id || String(s.index) === id);
      if (st) return { start: st.start, end: st.end, label: st.id };
    }
    if (scope && typeof scope === 'object') {
      if (scope.stageId) {
        const st = (info?.stages || []).find((s) => s.id === scope.stageId);
        if (st) return { start: st.start, end: st.end, label: st.id };
      }
      if (Number.isFinite(scope.start) && Number.isFinite(scope.end)) {
        const start = Math.max(0, Math.min(total, Number(scope.start)));
        const end = Math.max(start, Math.min(total, Number(scope.end)));
        return { start, end, label: `${start.toFixed(0)}s-${end.toFixed(0)}s` };
      }
    }
    return { start: 0, end: total, label: '' };
  }

  static download(result, customFilename = null) {
    if (!result?.blob) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = customFilename || result.filename || `simulify-export.${result.format || 'mp4'}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

const DEFAULT_LABELS = {
  zh: {
    btn: '导出',
    title: '导出 4D 视频 / 动图',
    format: '格式',
    fmtGif: 'GIF (动图)',
    fmtApng: 'APNG (无损动图)',
    fmtPng: 'PNG (静帧)',
    scope: '时间范围',
    fullStory: '完整剧情 (全幕)',
    currentFrame: '当前帧',
    hud: '画面模式',
    hudCaption: '纯净字幕 (推荐)',
    hudStage: '纯舞台画面',
    hudFull: '完整实验台 HUD',
    res: '分辨率',
    resCurrent: '当前视口',
    fps: '帧率',
    start: '开始导出',
    cancel: '取消',
    close: '关闭',
    done: '已导出并下载',
    cancelled: '已取消导出。',
    failed: '导出失败。',
  },
  en: {
    btn: 'Export',
    title: 'Export 4D Video / GIF',
    format: 'Format',
    fmtGif: 'GIF (Animated)',
    fmtApng: 'APNG (Lossless)',
    fmtPng: 'PNG (Still)',
    scope: 'Time Range',
    fullStory: 'Full 4D Story',
    currentFrame: 'Current Frame',
    hud: 'HUD Mode',
    hudCaption: 'Clean Caption (Recommended)',
    hudStage: 'Stage Only',
    hudFull: 'Full Workbench HUD',
    res: 'Resolution',
    resCurrent: 'Current Viewport',
    fps: 'FPS',
    start: 'Export',
    cancel: 'Cancel',
    close: 'Close',
    done: 'Exported & downloaded',
    cancelled: 'Export cancelled.',
    failed: 'Export failed.',
  },
};

function normalizeLang(lang) {
  return String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'zh';
}

/**
 * Mount a compact accessible Export button + floating popover into any toolbar/viewbar.
 * Automatically marked `data-export-role="chrome"` so it never appears in exported media.
 * Supports responsive runtime language switching via `handle.setLang('en' | 'zh')` or `exporter.setLang(...)`.
 * @param {HTMLElement} containerEl
 * @param {{ exporter?: StageExporter, workbench?: any, filenamePrefix?: string, lang?: 'zh'|'en', i18n?: { subscribe?: Function, getLang?: Function }, labels?: Record<string,string>, onExported?: (res: any) => void }} [opts]
 */
export function mountExportButton(containerEl, opts = {}) {
  if (!containerEl) {
    throw new Error('mountExportButton requires a valid container element.');
  }
  const initialLang = normalizeLang(
    opts.lang ||
    opts.i18n?.getLang?.() ||
    (typeof document !== 'undefined' && document.documentElement?.lang?.toLowerCase().startsWith('en') ? 'en' : 'zh')
  );
  const exporter = opts.exporter || new StageExporter({
    workbench: opts.workbench,
    filenamePrefix: opts.filenamePrefix,
    lang: initialLang,
  });

  let currentLang = initialLang;
  let customLabels = opts.labels ? { ...opts.labels } : {};
  let L = { ...(DEFAULT_LABELS[currentLang] || DEFAULT_LABELS.zh), ...customLabels };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-btn export-trigger-btn';
  btn.setAttribute('data-export-role', 'chrome');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', L.title);
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="15" height="16" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg><span class="export-trigger-label">${L.btn}</span>`;
  containerEl.append(btn);

  const popover = document.createElement('section');
  popover.className = 'export-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', L.title);
  popover.setAttribute('data-export-role', 'chrome');
  popover.hidden = true;

  popover.innerHTML = `
    <div class="export-pop-head">
      <strong data-export-label="title">${L.title}</strong>
      <button type="button" class="inspector-close export-close-btn" aria-label="${L.close}">×</button>
    </div>
    <div class="export-grid">
      <label class="export-field">
        <span data-export-label="format">${L.format}</span>
        <select name="format">
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm">WebM (VP9)</option>
          <option value="gif">${L.fmtGif}</option>
          <option value="apng">${L.fmtApng}</option>
          <option value="png">${L.fmtPng}</option>
        </select>
      </label>
      <label class="export-field">
        <span data-export-label="hud">${L.hud}</span>
        <select name="hud">
          <option value="caption" selected>${L.hudCaption}</option>
          <option value="stage">${L.hudStage}</option>
          <option value="hud">${L.hudFull}</option>
        </select>
      </label>
      <label class="export-field export-field-wide">
        <span data-export-label="scope">${L.scope}</span>
        <select name="scope"></select>
      </label>
      <label class="export-field">
        <span data-export-label="res">${L.res}</span>
        <select name="resolution">
          <option value="720p">1280×720</option>
          <option value="1080p">1920×1080</option>
          <option value="current">${L.resCurrent}</option>
        </select>
      </label>
      <label class="export-field">
        <span data-export-label="fps">${L.fps}</span>
        <select name="fps">
          <option value="15">15 fps</option>
          <option value="24">24 fps</option>
          <option value="30" selected>30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </label>
    </div>
    <div class="export-progress-wrap" hidden>
      <div class="export-progress-track"><div class="export-progress-fill"></div></div>
      <div class="export-status"></div>
    </div>
    <div class="export-notice" hidden></div>
    <div class="export-actions">
      <button type="button" class="btn-primary export-start-btn">${L.start}</button>
      <button type="button" class="btn-secondary export-cancel-btn" hidden>${L.cancel}</button>
    </div>
  `;

  const host = document.querySelector('.artboard-shell') || document.body;
  host.append(popover);

  const btnLabelEl = btn.querySelector('.export-trigger-label') || btn.querySelector('span');
  const titleEl = popover.querySelector('[data-export-label="title"]');
  const formatLabelEl = popover.querySelector('[data-export-label="format"]');
  const hudLabelEl = popover.querySelector('[data-export-label="hud"]');
  const scopeLabelEl = popover.querySelector('[data-export-label="scope"]');
  const resLabelEl = popover.querySelector('[data-export-label="res"]');
  const fpsLabelEl = popover.querySelector('[data-export-label="fps"]');

  const fmtSel = popover.querySelector('select[name="format"]');
  const hudSel = popover.querySelector('select[name="hud"]');
  const scopeSel = popover.querySelector('select[name="scope"]');
  const resSel = popover.querySelector('select[name="resolution"]');
  const fpsSel = popover.querySelector('select[name="fps"]');
  const progWrap = popover.querySelector('.export-progress-wrap');
  const progFill = popover.querySelector('.export-progress-fill');
  const statusEl = popover.querySelector('.export-status');
  const noticeEl = popover.querySelector('.export-notice');
  const startBtn = popover.querySelector('.export-start-btn');
  const cancelBtn = popover.querySelector('.export-cancel-btn');
  const closeBtn = popover.querySelector('.export-close-btn');

  let abortCtrl = null;

  const setOptionText = (selectEl, value, text) => {
    const opt = selectEl?.querySelector(`option[value="${value}"]`);
    if (opt) opt.textContent = text;
  };

  const applyLabels = () => {
    btn.setAttribute('aria-label', L.title);
    if (btnLabelEl) btnLabelEl.textContent = L.btn;
    popover.setAttribute('aria-label', L.title);
    if (titleEl) titleEl.textContent = L.title;
    closeBtn?.setAttribute('aria-label', L.close);
    if (formatLabelEl) formatLabelEl.textContent = L.format;
    if (hudLabelEl) hudLabelEl.textContent = L.hud;
    if (scopeLabelEl) scopeLabelEl.textContent = L.scope;
    if (resLabelEl) resLabelEl.textContent = L.res;
    if (fpsLabelEl) fpsLabelEl.textContent = L.fps;

    setOptionText(fmtSel, 'gif', L.fmtGif);
    setOptionText(fmtSel, 'apng', L.fmtApng);
    setOptionText(fmtSel, 'png', L.fmtPng);
    setOptionText(hudSel, 'caption', L.hudCaption);
    setOptionText(hudSel, 'stage', L.hudStage);
    setOptionText(hudSel, 'hud', L.hudFull);
    setOptionText(resSel, 'current', L.resCurrent);

    if (startBtn) startBtn.textContent = L.start;
    if (cancelBtn) cancelBtn.textContent = L.cancel;
  };

  const populateScopes = () => {
    const prevValue = scopeSel.value;
    scopeSel.replaceChildren();
    const fullOpt = document.createElement('option');
    fullOpt.value = 'full';
    try {
      const info = exporter.getTimelineInfo();
      fullOpt.textContent = `${L.fullStory} (${Number(info.duration || 0).toFixed(1)}s)`;
      scopeSel.append(fullOpt);
      for (const st of info.stages || []) {
        const opt = document.createElement('option');
        opt.value = `stage:${st.id}`;
        const dur = Math.max(0, (st.end ?? 0) - (st.start ?? 0));
        opt.textContent = `${st.index + 1}. ${st.title} (${dur.toFixed(1)}s)`;
        scopeSel.append(opt);
      }
    } catch {
      fullOpt.textContent = L.fullStory;
      scopeSel.append(fullOpt);
    }
    const curOpt = document.createElement('option');
    curOpt.value = 'current';
    curOpt.textContent = L.currentFrame;
    scopeSel.append(curOpt);

    if (prevValue && Array.from(scopeSel.options || []).some((o) => o.value === prevValue)) {
      scopeSel.value = prevValue;
    }
  };

  const setLang = (nextLang, nextLabels = null) => {
    currentLang = normalizeLang(nextLang);
    exporter.lang = currentLang;
    if (nextLabels && typeof nextLabels === 'object') {
      customLabels = { ...customLabels, ...nextLabels };
    }
    L = { ...(DEFAULT_LABELS[currentLang] || DEFAULT_LABELS.zh), ...customLabels };
    applyLabels();
    if (!popover.hidden || scopeSel.options?.length > 0) {
      populateScopes();
    }
    return currentLang;
  };

  const onExporterLang = (nextLang) => {
    if (nextLang !== currentLang) {
      setLang(nextLang);
    }
  };
  exporter._langListeners?.add(onExporterLang);
  const unsubI18n = typeof opts.i18n?.subscribe === 'function' ? opts.i18n.subscribe((l) => setLang(l)) : null;

  fmtSel.addEventListener('change', () => {
    const f = fmtSel.value;
    if (f === 'gif') fpsSel.value = '15';
    else if (f === 'mp4' || f === 'webm') fpsSel.value = '30';
    if (f === 'png') scopeSel.value = 'current';
    else if (scopeSel.value === 'current') scopeSel.value = 'full';
  });

  const open = () => {
    populateScopes();
    popover.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    noticeEl.hidden = true;
  };

  const close = () => {
    if (abortCtrl) return; // keep visible while actively exporting
    popover.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', () => {
    if (popover.hidden) open();
    else close();
  });
  closeBtn.addEventListener('click', close);

  const onKeyDown = (ev) => {
    if (ev.key === 'Escape' && !popover.hidden) close();
  };
  const onDocClick = (ev) => {
    if (popover.hidden || abortCtrl) return;
    if (!popover.contains(ev.target) && !btn.contains(ev.target)) close();
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onDocClick);

  cancelBtn.addEventListener('click', () => {
    abortCtrl?.abort();
  });

  startBtn.addEventListener('click', async () => {
    if (abortCtrl) return;
    abortCtrl = new AbortController();
    startBtn.disabled = true;
    cancelBtn.hidden = false;
    progWrap.hidden = false;
    noticeEl.hidden = true;
    progFill.style.width = '0%';
    statusEl.textContent = '0%';

    try {
      const result = await exporter.export({
        format: fmtSel.value,
        hud: hudSel.value,
        scope: scopeSel.value,
        resolution: resSel.value,
        fps: Number(fpsSel.value),
        signal: abortCtrl.signal,
        onProgress: ({ pct, message }) => {
          progFill.style.width = `${pct}%`;
          statusEl.textContent = message ? `${pct}% · ${message}` : `${pct}%`;
        },
        onNotice: (msg) => {
          noticeEl.textContent = msg;
          noticeEl.hidden = false;
        },
      });
      StageExporter.download(result);
      const kb = (result.blob.size / 1024).toFixed(0);
      statusEl.textContent = `${L.done}: ${result.filename} (${kb} KB, ${(result.elapsedMs / 1000).toFixed(1)}s)`;
      opts.onExported?.(result);
    } catch (err) {
      if (err?.name === 'AbortError') {
        statusEl.textContent = L.cancelled;
      } else {
        noticeEl.textContent = String(err?.message || err);
        noticeEl.hidden = false;
        statusEl.textContent = L.failed;
      }
    } finally {
      abortCtrl = null;
      startBtn.disabled = false;
      cancelBtn.hidden = true;
    }
  });

  return {
    button: btn,
    popover,
    exporter,
    open,
    close,
    setLang,
    destroy() {
      abortCtrl?.abort();
      exporter._langListeners?.delete(onExporterLang);
      if (typeof unsubI18n === 'function') unsubI18n();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onDocClick);
      btn.remove();
      popover.remove();
    },
  };
}
