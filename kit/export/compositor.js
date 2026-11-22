/**
 * Dual-path frame compositor for Simulify Tier 1 in-browser video & animated image export.
 *
 * - Path A (Chrome/Edge 157+): Native HTML-in-Canvas (`<canvas content="drawable">` + `drawElementImage`)
 *   temporarily hosting screen-space overlay roots (`try/finally` restored) so 3D WebGL/WebGPU +
 *   SVG leaders + CJK HTML callouts/LiveMaths/Charts/Captions composite pixel-identically (~1.4 ms/frame).
 * - Path B (Universal Firefox/Safari fallback & `stage` mode): Pure Canvas2D compositor drawing
 *   theme-aware studio backdrop + synchronous `stage.renderNow()` + `drawImage(stageCanvas)` (or SVG
 *   stage rasterization) + vector rendering of `CalloutLayer.getExportSnapshot()` + cinematic
 *   narrative bottom caption bar from `getCaptionState()`.
 */

export function supportsHtmlInCanvasCompositor() {
  return (
    typeof HTMLCanvasElement !== 'undefined' &&
    'content' in HTMLCanvasElement.prototype &&
    typeof CanvasRenderingContext2D !== 'undefined' &&
    'drawElementImage' in CanvasRenderingContext2D.prototype
  );
}

function readThemePalette(rootEl) {
  const el = rootEl || document.documentElement;
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  const get = (name, fallback) => (cs?.getPropertyValue(name)?.trim() || fallback);
  const theme = document.documentElement?.dataset?.theme || 'paper-ink';
  const dark = theme === 'dark-studio' || theme === 'blueprint' || theme === 'obsidian-gallery';
  return {
    theme,
    dark,
    bg: get('--bg', dark ? '#12161f' : '#f6eddd'),
    bgDeep: get('--bg-deep', dark ? '#0b0e15' : '#efe3d1'),
    card: get('--card-solid', dark ? 'rgba(24, 31, 46, 0.94)' : 'rgba(250, 244, 232, 0.96)'),
    line: get('--line', dark ? '#323e56' : '#cec0ad'),
    navy: get('--navy', dark ? '#eef3fa' : '#18213d'),
    ink: get('--ink', dark ? '#d4dce9' : '#383e49'),
    muted: get('--muted', dark ? '#8b97ad' : '#656a73'),
    teal: get('--teal', dark ? '#2dd4bf' : '#149694'),
    tealSoft: get('--teal-soft', dark ? 'rgba(15, 58, 57, 0.92)' : 'rgba(217, 241, 239, 0.95)'),
    amber: get('--amber', dark ? '#f59e0b' : '#c96d24'),
    amberSoft: get('--amber-soft', dark ? 'rgba(67, 42, 12, 0.94)' : 'rgba(251, 232, 213, 0.96)'),
    danger: get('--danger', dark ? '#f87171' : '#b83b3b'),
    fontSans: get('--font-sans', '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif'),
    fontMono: get('--font-mono', '"Cascadia Code", "JetBrains Mono", ui-monospace, monospace'),
  };
}

function drawStudioBackdrop(ctx, width, height, pal) {
  ctx.save();
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, width, height);

  const gx = width * 0.46;
  const gy = height * 0.42;
  const rad = Math.max(width, height) * 0.68;
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
  if (pal.theme === 'blueprint') {
    grad.addColorStop(0, 'rgba(30, 82, 142, 0.32)');
    grad.addColorStop(1, 'rgba(7, 23, 43, 0.78)');
  } else if (pal.theme === 'obsidian-gallery') {
    grad.addColorStop(0, 'rgba(168, 134, 78, 0.16)');
    grad.addColorStop(1, 'rgba(10, 9, 8, 0.92)');
  } else if (pal.dark) {
    grad.addColorStop(0, 'rgba(45, 72, 114, 0.22)');
    grad.addColorStop(1, 'rgba(11, 14, 21, 0.88)');
  } else if (pal.theme === 'monochrome-print') {
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
    grad.addColorStop(1, 'rgba(242, 240, 234, 0.4)');
  } else if (pal.theme === 'bio-cutaway') {
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
    grad.addColorStop(1, 'rgba(225, 232, 229, 0.45)');
  } else {
    grad.addColorStop(0, 'rgba(255, 253, 248, 0.72)');
    grad.addColorStop(1, 'rgba(239, 227, 209, 0.36)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (pal.theme === 'blueprint') {
    const step = Math.max(20, Math.round(28 * (width / 1280)));
    ctx.strokeStyle = 'rgba(147, 213, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let x = step; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }
  } else if (pal.theme !== 'monochrome-print' && pal.theme !== 'obsidian-gallery') {
    const step = Math.max(18, Math.round(22 * (width / 1280)));
    ctx.fillStyle = pal.dark ? 'rgba(68, 86, 120, 0.32)' : 'rgba(190, 174, 152, 0.42)';
    for (let y = step * 0.5; y < height; y += step) {
      for (let x = step * 0.5; x < width; x += step) {
        ctx.fillRect(Math.round(x), Math.round(y), 1.2, 1.2);
      }
    }
  }
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawFittedImage(ctx, source, srcW, srcH, dstW, dstH) {
  if (!source || !srcW || !srcH) return;
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (dstW - drawW) * 0.5;
  const dy = (dstH - drawH) * 0.5;
  ctx.drawImage(source, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
  return { dx, dy, drawW, drawH, scale };
}

async function rasterizeSvgElement(svgEl, width, height) {
  if (!svgEl || typeof XMLSerializer === 'undefined') return null;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('width')) clone.setAttribute('width', String(width));
  if (!clone.getAttribute('height')) clone.setAttribute('height', String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawCalloutsCanvas2D(ctx, snapshot, dstW, dstH, pal, fitBox = null) {
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) return;
  const srcW = snapshot.width || dstW;
  const srcH = snapshot.height || dstH;
  const offsetX = fitBox ? fitBox.dx : 0;
  const offsetY = fitBox ? fitBox.dy : 0;
  const scaleX = (fitBox ? fitBox.drawW : dstW) / Math.max(1, srcW);
  const scaleY = (fitBox ? fitBox.drawH : dstH) / Math.max(1, srcH);
  const s = (scaleX + scaleY) * 0.5;

  ctx.save();
  for (const item of snapshot.items) {
    if (item.visible === false || (typeof item.opacity === 'number' && item.opacity <= 0.01)) continue;
    const alpha = typeof item.opacity === 'number' ? Math.max(0, Math.min(1, item.opacity)) : 1;
    ctx.globalAlpha = alpha;

    const tone = item.accent || item.tone || '';
    const strokeCol = tone === 'teal' ? pal.teal : tone === 'amber' ? pal.amber : tone === 'danger' ? pal.danger : pal.navy;
    const fillCol = tone === 'teal' ? pal.tealSoft : tone === 'amber' ? pal.amberSoft : pal.card;
    const borderCol = tone === 'teal' ? pal.teal : tone === 'amber' ? pal.amber : pal.line;

    // Leader polyline (supports leaderPoints array or anchor/left/top geometry)
    const rawPts = Array.isArray(item.leaderPoints) && item.leaderPoints.length >= 2
      ? item.leaderPoints
      : (() => {
          const ax = item.anchorX ?? item.pt?.x ?? 0;
          const ay = item.anchorY ?? item.pt?.y ?? 0;
          const lx = item.left ?? 0;
          const ty = item.top ?? 0;
          const tw = item.width ?? 120;
          const th = item.height ?? 36;
          const elbowY = ty + th * 0.5;
          const attachX = ax <= lx ? lx : lx + tw;
          const kneeX = ax + (attachX - ax) * 0.45;
          return [[ax, ay], [kneeX, elbowY], [attachX, elbowY]];
        })();

    const pts = rawPts.map((p) => {
      const px = Array.isArray(p) ? p[0] : p.x;
      const py = Array.isArray(p) ? p[1] : p.y;
      return [offsetX + px * scaleX, offsetY + py * scaleY];
    });

    if (pts.length >= 2) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Shadow underlay
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = pal.dark ? 'rgba(11, 14, 21, 0.85)' : 'rgba(255, 250, 242, 0.9)';
      ctx.lineWidth = Math.max(2.5, 3.6 * s);
      ctx.stroke();

      // Primary colored leader
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = Math.max(1.2, 1.5 * s);
      ctx.stroke();

      // Anchor dot
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], Math.max(2.6, 3.4 * s), 0, Math.PI * 2);
      ctx.fillStyle = strokeCol;
      ctx.fill();
    }

    // Callout pill box
    const bx = offsetX + (item.left ?? 0) * scaleX;
    const by = offsetY + (item.top ?? 0) * scaleY;
    const bw = Math.max(60 * s, (item.width ?? 124) * scaleX);
    const bh = Math.max(24 * s, (item.height ?? 36) * scaleY);

    ctx.save();
    ctx.shadowColor = pal.dark ? 'rgba(0,0,0,0.35)' : 'rgba(24,33,61,0.09)';
    ctx.shadowBlur = 8 * s;
    ctx.shadowOffsetY = 2 * s;
    drawRoundedRect(ctx, bx, by, bw, bh, 7 * s);
    ctx.fillStyle = fillCol;
    ctx.fill();
    ctx.restore();

    drawRoundedRect(ctx, bx, by, bw, bh, 7 * s);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = Math.max(1, 1.1 * s);
    ctx.stroke();

    const title = String(item.title ?? item.label ?? '');
    const detail = String(item.detail ?? item.sublabel ?? '');
    const padX = 8 * s;
    const titleSize = Math.max(10, Math.round(11.5 * s));
    const subSize = Math.max(9, Math.round(10.2 * s));

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = pal.navy;
    ctx.font = `700 ${titleSize}px ${pal.fontSans}`;
    ctx.fillText(title, bx + padX, by + (detail ? 4 * s : (bh - titleSize) * 0.45), bw - padX * 2);

    if (detail) {
      ctx.fillStyle = tone === 'teal' ? (pal.dark ? '#5eead4' : '#0e6b69') : tone === 'amber' ? (pal.dark ? '#fbbf24' : '#924810') : pal.muted;
      ctx.font = `600 ${subSize}px ${pal.fontMono}`;
      ctx.fillText(detail, bx + padX, by + 4 * s + titleSize + 2 * s, bw - padX * 2);
    }
  }
  ctx.restore();
}

function drawCaptionBarCanvas2D(ctx, captionState, width, height, pal) {
  if (!captionState) return;
  const s = Math.max(0.75, Math.min(1.6, width / 1280));
  const barW = Math.min(width - 48 * s, 900 * s);
  const hasEq = Boolean(captionState.liveEqText);
  const barH = Math.round((hasEq ? 84 : 68) * s);
  const bx = Math.round((width - barW) * 0.5);
  const by = Math.round(height - barH - 22 * s);
  const padX = Math.round(16 * s);

  ctx.save();
  ctx.shadowColor = pal.dark ? 'rgba(0,0,0,0.45)' : 'rgba(24,33,61,0.12)';
  ctx.shadowBlur = 18 * s;
  ctx.shadowOffsetY = 6 * s;
  drawRoundedRect(ctx, bx, by, barW, barH, 12 * s);
  ctx.fillStyle = pal.card;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, bx, by, barW, barH, 12 * s);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = Math.max(1, 1.2 * s);
  ctx.stroke();

  // Top row: Act badge + step title + timestamp
  const stageNum = (captionState.stageIndex ?? 0) + 1;
  const stageCount = Math.max(1, captionState.stageCount ?? 1);
  const badgeText = captionState.stageTitle
    ? `${stageNum}/${stageCount} · ${captionState.stageTitle}`
    : `Act ${stageNum}/${stageCount}`;

  const badgeFontSize = Math.round(11 * s);
  ctx.font = `700 ${badgeFontSize}px ${pal.fontMono}`;
  const badgeW = Math.min(barW * 0.42, ctx.measureText(badgeText).width + 16 * s);
  const badgeH = Math.round(20 * s);
  const topY = by + Math.round(11 * s);

  drawRoundedRect(ctx, bx + padX, topY, badgeW, badgeH, 999);
  ctx.fillStyle = pal.tealSoft;
  ctx.fill();
  ctx.fillStyle = pal.dark ? '#79f2e4' : '#0b6967';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, bx + padX + 8 * s, topY + badgeH * 0.5 + 0.5, badgeW - 14 * s);

  // Right-aligned clock
  const tCur = Number(captionState.t || 0);
  const tDur = Math.max(0.01, Number(captionState.duration || 0));
  const timeText = `${tCur.toFixed(1)}s / ${tDur.toFixed(1)}s`;
  ctx.font = `600 ${Math.round(11 * s)}px ${pal.fontMono}`;
  ctx.fillStyle = pal.muted;
  ctx.textAlign = 'right';
  const timeW = ctx.measureText(timeText).width;
  ctx.fillText(timeText, bx + barW - padX, topY + badgeH * 0.5 + 0.5);

  // Step title beside badge
  if (captionState.stepTitle) {
    const titleX = bx + padX + badgeW + 10 * s;
    const maxTitleW = Math.max(40, bx + barW - padX - timeW - 12 * s - titleX);
    ctx.font = `700 ${Math.round(13.5 * s)}px ${pal.fontSans}`;
    ctx.fillStyle = pal.navy;
    ctx.textAlign = 'left';
    ctx.fillText(String(captionState.stepTitle), titleX, topY + badgeH * 0.5 + 0.5, maxTitleW);
  }

  // Narrative caption line
  const capText = String(captionState.caption || captionState.summary || captionState.carries || '');
  if (capText) {
    ctx.font = `500 ${Math.round(13 * s)}px ${pal.fontSans}`;
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(capText, bx + padX, topY + badgeH + 7 * s, barW - padX * 2);
  }

  // Optional live equation chip
  if (hasEq) {
    ctx.font = `600 ${Math.round(11.5 * s)}px ${pal.fontMono}`;
    ctx.fillStyle = pal.teal;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(captionState.liveEqText), bx + padX, topY + badgeH + 26 * s, barW - padX * 2);
  }

  // Bottom progress rail
  const railH = Math.max(3, Math.round(3.5 * s));
  const railY = by + barH - railH - Math.round(6 * s);
  const railX = bx + padX;
  const railW = barW - padX * 2;
  drawRoundedRect(ctx, railX, railY, railW, railH, 999);
  ctx.fillStyle = pal.dark ? 'rgba(255,255,255,0.12)' : 'rgba(24,33,61,0.10)';
  ctx.fill();

  const prog = Math.max(0, Math.min(1, Number(captionState.progress ?? (tCur / tDur))));
  if (prog > 0) {
    drawRoundedRect(ctx, railX, railY, Math.max(railH, railW * prog), railH, 999);
    ctx.fillStyle = pal.teal;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Create/update a clean DOM `.export-caption-bar` for both Path A (HTML-in-Canvas)
 * and Tier 2 CLI (`?export=caption`).
 */
export function createCaptionBarController(parentEl) {
  const bar = document.createElement('div');
  bar.className = 'export-caption-bar';
  bar.setAttribute('data-export-role', 'caption');
  bar.setAttribute('aria-hidden', 'true');

  const top = document.createElement('div');
  top.className = 'export-caption-head';

  const badge = document.createElement('span');
  badge.className = 'export-caption-badge';

  const title = document.createElement('strong');
  title.className = 'export-caption-title';

  const time = document.createElement('span');
  time.className = 'export-caption-time';

  top.append(badge, title, time);

  const body = document.createElement('p');
  body.className = 'export-caption-text';

  const eq = document.createElement('div');
  eq.className = 'export-caption-eq';
  eq.hidden = true;

  const rail = document.createElement('div');
  rail.className = 'export-caption-rail';
  const fill = document.createElement('div');
  fill.className = 'export-caption-fill';
  rail.append(fill);

  bar.append(top, body, eq, rail);
  parentEl.append(bar);

  return {
    el: bar,
    update(state) {
      if (!state) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      const stageNum = (state.stageIndex ?? 0) + 1;
      const stageCount = Math.max(1, state.stageCount ?? 1);
      badge.textContent = state.stageTitle
        ? `${stageNum}/${stageCount} · ${state.stageTitle}`
        : `Act ${stageNum}/${stageCount}`;
      title.textContent = state.stepTitle || '';
      const tCur = Number(state.t || 0);
      const tDur = Math.max(0.01, Number(state.duration || 0));
      time.textContent = `${tCur.toFixed(1)}s / ${tDur.toFixed(1)}s`;
      body.textContent = state.caption || state.summary || state.carries || '';
      body.hidden = !body.textContent;
      if (state.liveEqText) {
        eq.textContent = state.liveEqText;
        eq.hidden = false;
      } else {
        eq.hidden = true;
      }
      const prog = Math.max(0, Math.min(1, Number(state.progress ?? (tCur / tDur))));
      fill.style.width = `${(prog * 100).toFixed(2)}%`;
    },
    destroy() {
      bar.remove();
    },
  };
}

/**
 * Create a unified frame compositor (Path A HTML-in-Canvas on Chrome/Edge 157+, Path B Canvas2D fallback).
 * @param {{
 *   targets: {
 *     rootEl?: HTMLElement,
 *     stageCanvas?: HTMLCanvasElement | null,
 *     stageSvg?: SVGSVGElement | null,
 *     overlayEls?: HTMLElement[],
 *     callouts?: { getExportSnapshot?: () => any } | null,
 *     renderNow?: () => void
 *   },
 *   width: number,
 *   height: number,
 *   hudMode?: 'caption' | 'stage' | 'hud',
 *   preferHic?: boolean,
 *   getCaptionState?: () => any,
 *   onNotice?: (msg: string) => void
 * }} opts
 */
export function createFrameCompositor({
  targets = {},
  width,
  height,
  hudMode = 'caption',
  preferHic = true,
  getCaptionState = null,
  onNotice = null,
}) {
  const rootEl = targets.rootEl || document.querySelector('.artboard-shell') || document.body;
  const stage = targets.stage || globalThis.__simulify?.stage?.stage || globalThis.__simulify?.stage || null;
  const stageCanvas = targets.stageCanvas || stage?.canvas || document.querySelector('#stage-canvas, canvas.stage-canvas');
  const stageSvg = targets.stageSvg || (!stageCanvas ? document.querySelector('.stage-2d-svg') : null);
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));

  // Flush any pending 3D HTML-in-Canvas paints (or HiDPI fallback textures) before sampling stageCanvas
  const flushStageHtmlSurfaces = async () => {
    if (stage?.htmlSurfaces?.flushPaint) {
      await stage.htmlSurfaces.flushPaint();
    } else if (stage?.htmlSurfaces?.syncPaint) {
      stage.htmlSurfaces.syncPaint(null);
    }
  };

  // Render stage deterministically: on WebGPU await renderNowAsync() so init + HIC paints finish cleanly
  const renderStageAsync = async () => {
    await flushStageHtmlSurfaces();
    if (typeof targets.renderNowAsync === 'function') {
      await targets.renderNowAsync();
    } else if (stage && stage.backendKind === 'webgpu' && typeof stage.renderNowAsync === 'function') {
      await stage.renderNowAsync();
    } else if (typeof targets.renderNow === 'function') {
      await targets.renderNow();
    } else if (stage && typeof stage.renderNow === 'function') {
      stage.renderNow();
    }
  };

  const renderStageSync = () => {
    if (typeof targets.renderNow === 'function') {
      targets.renderNow();
    } else if (stage && typeof stage.renderNow === 'function') {
      stage.renderNow();
    }
  };

  // Choose Path A (HTML-in-Canvas) only when supported AND DOM overlays are actually needed (`caption` or `hud`)
  const hicAvailable = supportsHtmlInCanvasCompositor();
  const rootRect = rootEl.getBoundingClientRect();
  const aspectDelta = rootRect.width > 0 && rootRect.height > 0
    ? Math.abs((rootRect.width / rootRect.height) - (w / h))
    : 0;
  // For `hud` mode always prefer HIC when available; for `caption` prefer HIC when viewport aspect aligns
  const useHic = Boolean(
    preferHic &&
    hicAvailable &&
    hudMode !== 'stage' &&
    (hudMode === 'hud' || aspectDelta < 0.25)
  );

  if (hudMode === 'hud' && !hicAvailable && onNotice) {
    onNotice('Full HUD capture uses HTML-in-Canvas (Chrome/Edge 157+); using Clean Caption Canvas2D fallback.');
  }

  // Always prepare a Path B Canvas2D fallback canvas (also used directly in `stage` mode & Firefox/Safari)
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = w;
  fallbackCanvas.height = h;
  const fallbackCtx = fallbackCanvas.getContext('2d', { willReadFrequently: true });

  const renderFallbackFrame = async () => {
    const pal = readThemePalette(rootEl);
    drawStudioBackdrop(fallbackCtx, w, h, pal);

    let fitBox = null;
    if (stageCanvas) {
      await renderStageAsync();
      fitBox = drawFittedImage(
        fallbackCtx,
        stageCanvas,
        stageCanvas.width || stageCanvas.clientWidth || w,
        stageCanvas.height || stageCanvas.clientHeight || h,
        w,
        h
      );
    } else if (stageSvg) {
      const img = await rasterizeSvgElement(stageSvg, w, h);
      if (img) {
        fitBox = drawFittedImage(fallbackCtx, img, img.naturalWidth || w, img.naturalHeight || h, w, h);
      }
    }

    if (hudMode !== 'stage') {
      const snap = targets.callouts?.getExportSnapshot?.();
      if (snap) {
        drawCalloutsCanvas2D(fallbackCtx, snap, w, h, pal, fitBox);
      }
      const cap = typeof getCaptionState === 'function' ? getCaptionState() : null;
      if (cap) {
        drawCaptionBarCanvas2D(fallbackCtx, cap, w, h, pal);
      }
    }
    return fallbackCanvas;
  };

  if (!useHic) {
    return {
      canvas: fallbackCanvas,
      mode: 'canvas2d',
      width: w,
      height: h,
      captureFrame: renderFallbackFrame,
      dispose() {},
    };
  }

  // --- Path A: Ephemeral HTML-in-Canvas Compositor (`<canvas content="drawable">`) ---
  const cssW = Math.max(200, Math.round(rootRect.width || w));
  const cssH = Math.max(160, Math.round(rootRect.height || h));

  const compCanvas = document.createElement('canvas');
  compCanvas.setAttribute('content', 'drawable');
  compCanvas.setAttribute('data-export-role', 'compositor');
  compCanvas.width = w;
  compCanvas.height = h;
  compCanvas.style.cssText = [
    'position:absolute',
    'inset:0',
    `width:${cssW}px`,
    `height:${cssH}px`,
    'pointer-events:none',
    'z-index:9998',
    'opacity:0',
  ].join(';');

  const hicLayer = document.createElement('div');
  hicLayer.className = 'export-hic-layer';
  hicLayer.setAttribute('drawable', '');
  hicLayer.style.cssText = `position:relative;width:${cssW}px;height:${cssH}px;overflow:hidden;pointer-events:none;`;
  compCanvas.appendChild(hicLayer);

  // Collect screen-space overlay elements (never moving stageCanvas or its HIC children!)
  const candidateOverlays = Array.isArray(targets.overlayEls) && targets.overlayEls.length > 0
    ? targets.overlayEls
    : Array.from(
        rootEl.querySelectorAll(
          '.leader-svg, .tags-layer, .popups-layer, .hud-top-left, .hud-guide, .hud-bottom-left, .hud-bottom-center, .top-ribbon, .right-dock, .bottom-left-dock, .bottom-transport'
        )
      );

  const savedNodes = [];
  const seen = new Set();
  for (const el of candidateOverlays) {
    if (!el || !(el instanceof Element) || seen.has(el)) continue;
    if (el === stageCanvas || (stageCanvas && stageCanvas.contains(el))) continue;
    if (
      el.getAttribute('data-export-role') === 'chrome' ||
      el.classList.contains('export-popover') ||
      el.classList.contains('simulify-html-fallback')
    ) {
      continue;
    }
    // Skip nested descendants if an ancestor is already being moved
    let ancestorMoved = false;
    for (const prev of seen) {
      if (prev.contains(el)) {
        ancestorMoved = true;
        break;
      }
    }
    if (ancestorMoved) continue;
    seen.add(el);
    savedNodes.push({
      el,
      parent: el.parentNode,
      nextSibling: el.nextSibling,
    });
  }

  let captionCtrl = null;
  let disposed = false;
  let hicDegraded = false;
  const compCtx = compCanvas.getContext('2d', { willReadFrequently: true });

  const restoreDom = () => {
    if (disposed) return;
    disposed = true;
    try {
      captionCtrl?.destroy();
    } catch {
      // ignore
    }
    // Restore moved elements in reverse order so sibling ordering is exact
    for (let i = savedNodes.length - 1; i >= 0; i -= 1) {
      const { el, parent, nextSibling } = savedNodes[i];
      try {
        if (parent) {
          if (nextSibling && nextSibling.parentNode === parent) {
            parent.insertBefore(el, nextSibling);
          } else {
            parent.appendChild(el);
          }
        }
      } catch {
        // ignore detached parent
      }
    }
    compCanvas.onpaint = null;
    compCanvas.remove();
  };

  try {
    for (const entry of savedNodes) {
      hicLayer.appendChild(entry.el);
    }
    if (hudMode === 'caption') {
      captionCtrl = createCaptionBarController(hicLayer);
    }
    rootEl.appendChild(compCanvas);
  } catch (err) {
    restoreDom();
    onNotice?.(`HTML-in-Canvas mount fell back to Canvas2D: ${err?.message || err}`);
    return {
      canvas: fallbackCanvas,
      mode: 'canvas2d',
      width: w,
      height: h,
      captureFrame: renderFallbackFrame,
      dispose() {},
    };
  }

  const handle = {
    canvas: compCanvas,
    mode: 'hic',
    width: w,
    height: h,
    async captureFrame() {
      if (hicDegraded) {
        return renderFallbackFrame();
      }
      if (captionCtrl && typeof getCaptionState === 'function') {
        captionCtrl.update(getCaptionState());
      }
      const pal = readThemePalette(rootEl);

      // Flush stage's own 3D HTML-in-Canvas surfaces and await WebGPU init before compositing
      if (stageCanvas) {
        await renderStageAsync();
      }

      try {
        await new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error('HTML-in-Canvas onpaint timeout'));
            }
          }, 1200);

          compCanvas.onpaint = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
              compCtx.reset();
              drawStudioBackdrop(compCtx, w, h, pal);
              if (stageCanvas) {
                renderStageSync();
                drawFittedImage(
                  compCtx,
                  stageCanvas,
                  stageCanvas.width || stageCanvas.clientWidth || w,
                  stageCanvas.height || stageCanvas.clientHeight || h,
                  w,
                  h
                );
              }
              compCtx.drawElementImage(hicLayer, 0, 0, w, h);
              resolve();
            } catch (e) {
              reject(e);
            }
          };
          compCanvas.requestPaint();
        });
        return compCanvas;
      } catch (err) {
        hicDegraded = true;
        handle.mode = 'canvas2d';
        handle.canvas = fallbackCanvas;
        onNotice?.(`HTML-in-Canvas paint fallback triggered: ${err?.message || err}`);
        restoreDom();
        return renderFallbackFrame();
      }
    },
    dispose: restoreDom,
  };

  return handle;
}
