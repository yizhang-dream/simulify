/**
 * Zero-dependency pure-JS GIF89a encoder optimized for 4D scientific explainers:
 * - Global 255-color median-cut palette sampled across keyframes (+ index 255 transparent)
 * - 4x4 Bayer ordered dithering (eliminates Floyd-Steinberg temporal shimmer on 3D surfaces)
 * - Consecutive static hold-frame delay coalescing (massive size savings on reading holds)
 * - Dirty-rect sub-frame cropping with transparent unchanged pixels
 * - Inline Blob Web Worker offloading in browsers, seamless synchronous fallback in Node
 */

const BAYER_4X4 = new Int8Array([
  -8, 0, -6, 2,
  4, -4, 6, -2,
  -5, 3, -7, 1,
  7, -1, 5, -3,
]);

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgb555(r, g, b) {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/**
 * Build an optimal up-to-maxColors RGB palette using RGB555 histogram + median-cut.
 * @param {Uint8Array[]} rgbaFrames
 * @param {number} width
 * @param {number} height
 * @param {number} [maxColors=255]
 * @returns {{ palette: Uint8Array, colorCount: number }}
 */
export function buildGlobalPalette(rgbaFrames, width, height, maxColors = 255) {
  const hist = new Uint32Array(32768);
  const pixelCount = width * height;
  const maxSampleFrames = Math.min(rgbaFrames.length, 16);
  const stridePixels = Math.max(1, Math.floor((pixelCount * maxSampleFrames) / 400000));

  for (let s = 0; s < maxSampleFrames; s += 1) {
    const fIdx = maxSampleFrames === 1
      ? 0
      : Math.round((s * (rgbaFrames.length - 1)) / (maxSampleFrames - 1));
    const rgba = rgbaFrames[fIdx];
    for (let p = 0; p < pixelCount; p += stridePixels) {
      const o = p << 2;
      const key = rgb555(rgba[o], rgba[o + 1], rgba[o + 2]);
      hist[key] += 1;
    }
  }

  const entries = [];
  for (let key = 0; key < 32768; key += 1) {
    const count = hist[key];
    if (count > 0) {
      entries.push({
        r: ((key >> 10) & 31) * 8 + 4,
        g: ((key >> 5) & 31) * 8 + 4,
        b: (key & 31) * 8 + 4,
        count,
      });
    }
  }

  if (entries.length === 0) {
    const palette = new Uint8Array(256 * 3);
    return { palette, colorCount: 1 };
  }

  const makeBox = (items) => {
    let rMin = 255, rMax = 0;
    let gMin = 255, gMax = 0;
    let bMin = 255, bMax = 0;
    let total = 0;
    for (let i = 0; i < items.length; i += 1) {
      const e = items[i];
      if (e.r < rMin) rMin = e.r;
      if (e.r > rMax) rMax = e.r;
      if (e.g < gMin) gMin = e.g;
      if (e.g > gMax) gMax = e.g;
      if (e.b < bMin) bMin = e.b;
      if (e.b > bMax) bMax = e.b;
      total += e.count;
    }
    const dr = rMax - rMin;
    const dg = gMax - gMin;
    const db = bMax - bMin;
    const range = Math.max(dr, dg, db);
    const axis = dr >= dg && dr >= db ? 'r' : dg >= db ? 'g' : 'b';
    return { items, total, range, axis };
  };

  const boxes = [makeBox(entries)];
  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i += 1) {
      const b = boxes[i];
      if (b.items.length < 2 || b.range === 0) continue;
      // Weight range * log(pop) so prominent gradients and distinct UI accents both get slots
      const score = b.range * (1 + Math.log2(b.total + 1) * 0.25);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;

    const target = boxes[bestIdx];
    const axis = target.axis;
    target.items.sort((a, b) => a[axis] - b[axis]);

    const half = target.total / 2;
    let acc = 0;
    let split = 1;
    for (let i = 0; i < target.items.length - 1; i += 1) {
      acc += target.items[i].count;
      if (acc >= half) {
        split = Math.max(1, i + 1);
        break;
      }
    }
    const left = makeBox(target.items.slice(0, split));
    const right = makeBox(target.items.slice(split));
    boxes.splice(bestIdx, 1, left, right);
  }

  const palette = new Uint8Array(256 * 3);
  const colorCount = Math.min(maxColors, boxes.length);
  for (let i = 0; i < colorCount; i += 1) {
    const items = boxes[i].items;
    let sr = 0, sg = 0, sb = 0, w = 0;
    for (let j = 0; j < items.length; j += 1) {
      const e = items[j];
      sr += e.r * e.count;
      sg += e.g * e.count;
      sb += e.b * e.count;
      w += e.count;
    }
    palette[i * 3] = Math.round(sr / w);
    palette[i * 3 + 1] = Math.round(sg / w);
    palette[i * 3 + 2] = Math.round(sb / w);
  }
  return { palette, colorCount };
}

function createPaletteLookup(palette, colorCount) {
  const lut = new Int16Array(32768);
  lut.fill(-1);
  return (r, g, b) => {
    const key = rgb555(r, g, b);
    const cached = lut[key];
    if (cached >= 0) return cached;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < colorCount; i += 1) {
      const dr = r - palette[i * 3];
      const dg = g - palette[i * 3 + 1];
      const db = b - palette[i * 3 + 2];
      // Perceptual RGB weights (2, 4, 3)
      const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
        if (dist === 0) break;
      }
    }
    lut[key] = best;
    return best;
  };
}

function quantizeFrame(rgba, width, height, lookup, dither) {
  const out = new Uint8Array(width * height);
  if (!dither) {
    for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
      out[i] = lookup(rgba[p], rgba[p + 1], rgba[p + 2]);
    }
    return out;
  }
  const scale = typeof dither === 'number' ? dither : 1.0;
  let idx = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOff = (y & 3) << 2;
    for (let x = 0; x < width; x += 1) {
      const p = idx << 2;
      const bias = Math.round(BAYER_4X4[rowOff | (x & 3)] * scale);
      out[idx] = lookup(
        clampByte(rgba[p] + bias),
        clampByte(rgba[p + 1] + bias),
        clampByte(rgba[p + 2] + bias)
      );
      idx += 1;
    }
  }
  return out;
}

/**
 * Standard GIF89a LSB-first variable-width LZW encoder (minCodeSize = 8).
 * Uses an open-addressed hash table for fast O(1) prefix+symbol lookups.
 */
function lzwEncode(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const TABLE_SIZE = 8192; // power of 2 > 4096
  const keys = new Int32Array(TABLE_SIZE);
  const vals = new Int16Array(TABLE_SIZE);
  keys.fill(-1);

  const blocks = [];
  let sub = new Uint8Array(256);
  let subLen = 0;
  let bitBuf = 0;
  let bitCount = 0;

  const flushSub = () => {
    if (subLen > 0) {
      const chunk = new Uint8Array(subLen + 1);
      chunk[0] = subLen;
      chunk.set(sub.subarray(0, subLen), 1);
      blocks.push(chunk);
      subLen = 0;
    }
  };

  const emitCode = (code, codeSize) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      sub[subLen] = bitBuf & 0xff;
      subLen += 1;
      if (subLen === 255) flushSub();
      bitBuf >>>= 8;
      bitCount -= 8;
    }
  };

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  emitCode(clearCode, codeSize);

  if (indices.length > 0) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i += 1) {
      const k = indices[i];
      const composite = (prefix << 8) | k;
      let slot = ((composite * 2654435761) >>> 19) & (TABLE_SIZE - 1);
      let found = -1;
      while (keys[slot] !== -1) {
        if (keys[slot] === composite) {
          found = vals[slot];
          break;
        }
        slot = (slot + 1) & (TABLE_SIZE - 1);
      }

      if (found !== -1) {
        prefix = found;
      } else {
        emitCode(prefix, codeSize);
        if (nextCode < 4096) {
          keys[slot] = composite;
          vals[slot] = nextCode;
          nextCode += 1;
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize += 1;
          }
        } else {
          emitCode(clearCode, codeSize);
          keys.fill(-1);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }
    emitCode(prefix, codeSize);
  }

  emitCode(eoiCode, codeSize);
  if (bitCount > 0) {
    sub[subLen] = bitBuf & 0xff;
    subLen += 1;
  }
  flushSub();
  blocks.push(new Uint8Array([0])); // block terminator

  let total = 1;
  for (const b of blocks) total += b.byteLength;
  const out = new Uint8Array(total);
  out[0] = minCodeSize;
  let off = 1;
  for (const b of blocks) {
    out.set(b, off);
    off += b.byteLength;
  }
  return out;
}

function writeU16LE(arr, off, val) {
  arr[off] = val & 0xff;
  arr[off + 1] = (val >>> 8) & 0xff;
}

/**
 * Synchronously encode an array of RGBA Uint8Array frames into a GIF89a binary Uint8Array.
 * Supports hold-frame coalescing (returns `stats` when requested via `encodeGifWithStats`).
 * @param {{
 *   width: number,
 *   height: number,
 *   frames: Uint8Array[],
 *   fps?: number,
 *   delaysCs?: number[],
 *   loop?: number,
 *   dither?: boolean | number,
 *   coalesceHolds?: boolean,
 *   dirtyRect?: boolean
 * }} opts
 */
export function encodeGifWithStats({
  width,
  height,
  frames,
  fps = 15,
  delaysCs = null,
  loop = 0,
  dither = true,
  coalesceHolds = true,
  dirtyRect = true,
}) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('encodeGif requires at least one RGBA frame.');
  }
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const TRANSPARENT_IDX = 255;
  const defaultDelayCs = Math.max(2, Math.round(100 / Math.max(1, fps)));

  const { palette, colorCount } = buildGlobalPalette(frames, w, h, 255);
  const lookup = createPaletteLookup(palette, colorCount);

  // Quantize + coalesce identical consecutive holds + compute dirty-rect sub-frames
  const emitted = [];
  let prevIdx = null;
  let coalescedCount = 0;

  for (let f = 0; f < frames.length; f += 1) {
    const delay = delaysCs && Number.isFinite(delaysCs[f]) ? Math.max(2, Math.round(delaysCs[f])) : defaultDelayCs;
    const currIdx = quantizeFrame(frames[f], w, h, lookup, dither);

    if (prevIdx && coalesceHolds) {
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y += 1) {
        const row = y * w;
        for (let x = 0; x < w; x += 1) {
          if (currIdx[row + x] !== prevIdx[row + x]) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < 0) {
        // 100% identical frame — coalesce delay into previous frame
        const last = emitted[emitted.length - 1];
        if (last.delayCs + delay <= 65535) {
          last.delayCs += delay;
          coalescedCount += 1;
          continue;
        }
      } else if (dirtyRect) {
        const rw = maxX - minX + 1;
        const rh = maxY - minY + 1;
        const patch = new Uint8Array(rw * rh);
        let p = 0;
        for (let y = minY; y <= maxY; y += 1) {
          const row = y * w;
          for (let x = minX; x <= maxX; x += 1) {
            const c = currIdx[row + x];
            patch[p] = c === prevIdx[row + x] ? TRANSPARENT_IDX : c;
            p += 1;
          }
        }
        emitted.push({
          x: minX,
          y: minY,
          w: rw,
          h: rh,
          delayCs: delay,
          transparent: true,
          indices: patch,
        });
        prevIdx = currIdx;
        continue;
      }
    }

    emitted.push({
      x: 0,
      y: 0,
      w,
      h,
      delayCs: delay,
      transparent: false,
      indices: currIdx,
    });
    prevIdx = currIdx;
  }

  // Assemble GIF89a bitstream
  const chunks = [];

  // Header + Logical Screen Descriptor (13 bytes)
  const header = new Uint8Array(13);
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  writeU16LE(header, 6, w);
  writeU16LE(header, 8, h);
  header[10] = 0xf7; // Global Color Table flag (1), color res (7), sort (0), size (7 -> 256 colors)
  header[11] = 0; // bg color index
  header[12] = 0; // pixel aspect ratio
  chunks.push(header);

  // Global Color Table (256 * 3 = 768 bytes)
  chunks.push(palette);

  // NETSCAPE2.0 Application Extension (looping)
  if (loop >= 0) {
    const netscape = new Uint8Array(19);
    netscape.set([
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
      0x03, 0x01,
    ], 0);
    writeU16LE(netscape, 16, loop & 0xffff);
    netscape[18] = 0x00;
    chunks.push(netscape);
  }

  for (const frame of emitted) {
    // Graphic Control Extension (8 bytes)
    const gce = new Uint8Array(8);
    gce[0] = 0x21;
    gce[1] = 0xf9;
    gce[2] = 0x04;
    // disposal = 1 (do not dispose), transparent flag in bit 0
    gce[3] = (1 << 2) | (frame.transparent ? 1 : 0);
    writeU16LE(gce, 4, frame.delayCs);
    gce[6] = TRANSPARENT_IDX;
    gce[7] = 0x00;
    chunks.push(gce);

    // Image Descriptor (10 bytes)
    const desc = new Uint8Array(10);
    desc[0] = 0x2c;
    writeU16LE(desc, 1, frame.x);
    writeU16LE(desc, 3, frame.y);
    writeU16LE(desc, 5, frame.w);
    writeU16LE(desc, 7, frame.h);
    desc[9] = 0x00; // no local color table, not interlaced
    chunks.push(desc);

    chunks.push(lzwEncode(frame.indices, 8));
  }

  chunks.push(new Uint8Array([0x3b])); // GIF Trailer

  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }

  return {
    bytes,
    stats: {
      inputFrames: frames.length,
      emittedFrames: emitted.length,
      coalescedHolds: coalescedCount,
      paletteColors: colorCount,
      byteLength: bytes.byteLength,
    },
  };
}

export function encodeGif(opts) {
  return encodeGifWithStats(opts).bytes;
}

/**
 * Self-contained Blob Web Worker source for offloading GIF quantization + LZW in browsers.
 */
function buildWorkerSource() {
  return `
const BAYER_4X4 = new Int8Array([-8,0,-6,2,4,-4,6,-2,-5,3,-7,1,7,-1,5,-3]);
${clampByte.toString()}
${rgb555.toString()}
${buildGlobalPalette.toString()}
${createPaletteLookup.toString()}
${quantizeFrame.toString()}
${lzwEncode.toString()}
${writeU16LE.toString()}
${encodeGifWithStats.toString()}
self.onmessage = (ev) => {
  try {
    const { width, height, frames, fps, loop, dither, coalesceHolds, dirtyRect } = ev.data;
    const rgbaFrames = frames.map((buf) => new Uint8Array(buf));
    const res = encodeGifWithStats({ width, height, frames: rgbaFrames, fps, loop, dither, coalesceHolds, dirtyRect });
    self.postMessage({ ok: true, bytes: res.bytes.buffer, stats: res.stats }, [res.bytes.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
`;
}

/**
 * Streaming-style session that collects RGBA frames during deterministic capture and
 * runs quantization + LZW encoding in a Blob Web Worker when available (main-thread fallback in Node).
 */
export class GifEncoderSession {
  constructor({ width, height, fps = 15, loop = 0, dither = true, coalesceHolds = true, dirtyRect = true, useWorker = true } = {}) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.fps = Math.max(1, Number(fps) || 15);
    this.loop = loop;
    this.dither = dither;
    this.coalesceHolds = coalesceHolds;
    this.dirtyRect = dirtyRect;
    this.useWorker = useWorker;
    this.frames = [];
  }

  addRgbaFrame(rgba) {
    const copy = new Uint8Array(rgba.byteLength);
    copy.set(rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));
    this.frames.push(copy);
  }

  addCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, this.width, this.height);
    this.addRgbaFrame(img.data);
  }

  async finalize() {
    if (this.useWorker && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      try {
        return await this.#finalizeInWorker();
      } catch {
        // CSP or sandboxed worker restriction — fall back transparently to main thread
      }
    }
    const res = encodeGifWithStats({
      width: this.width,
      height: this.height,
      frames: this.frames,
      fps: this.fps,
      loop: this.loop,
      dither: this.dither,
      coalesceHolds: this.coalesceHolds,
      dirtyRect: this.dirtyRect,
    });
    return {
      bytes: res.bytes,
      blob: typeof Blob !== 'undefined' ? new Blob([res.bytes], { type: 'image/gif' }) : null,
      stats: res.stats,
    };
  }

  #finalizeInWorker() {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buildWorkerSource()], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      const cleanup = () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      };
      worker.onmessage = (ev) => {
        cleanup();
        if (!ev.data?.ok) {
          reject(new Error(ev.data?.error || 'GIF worker failed'));
          return;
        }
        const bytes = new Uint8Array(ev.data.bytes);
        resolve({
          bytes,
          blob: new Blob([bytes], { type: 'image/gif' }),
          stats: ev.data.stats,
        });
      };
      worker.onerror = (err) => {
        cleanup();
        reject(err);
      };
      const buffers = this.frames.map((f) => f.buffer);
      worker.postMessage(
        {
          width: this.width,
          height: this.height,
          frames: buffers,
          fps: this.fps,
          loop: this.loop,
          dither: this.dither,
          coalesceHolds: this.coalesceHolds,
          dirtyRect: this.dirtyRect,
        },
        buffers
      );
    });
  }
}
