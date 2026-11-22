/**
 * Zero-dependency pure-JS APNG chunk stitcher.
 * Leverages the browser's native PNG encoder (`canvas.toBlob('image/png')`) for lossless
 * 24/32-bit DEFLATE compression and stitches `acTL`, `fcTL`, and `fdAT` chunks with
 * IEEE 802.3 CRC32 plus consecutive identical hold-frame coalescing.
 */

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function ascii4(type) {
  return new Uint8Array([
    type.charCodeAt(0) & 0xff,
    type.charCodeAt(1) & 0xff,
    type.charCodeAt(2) & 0xff,
    type.charCodeAt(3) & 0xff,
  ]);
}

function buildPngChunk(type, data) {
  const payload = data || new Uint8Array(0);
  const out = new Uint8Array(12 + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.byteLength, false);
  out.set(ascii4(type), 4);
  if (payload.byteLength > 0) out.set(payload, 8);
  const crc = crc32(out, 4, 8 + payload.byteLength);
  view.setUint32(8 + payload.byteLength, crc, false);
  return out;
}

function bytesEqual(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function concatBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

/**
 * Parse a standard PNG Uint8Array into IHDR, optional ancillary palette/color chunks, and merged IDAT payload.
 */
export function parsePng(pngBytes) {
  if (pngBytes.byteLength < 33) {
    throw new Error('Invalid PNG: file too small.');
  }
  for (let i = 0; i < 8; i += 1) {
    if (pngBytes[i] !== PNG_SIG[i]) throw new Error('Invalid PNG signature.');
  }
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  let off = 8;
  let ihdr = null;
  const idatParts = [];
  const keepAncillary = [];

  while (off + 12 <= pngBytes.byteLength) {
    const len = view.getUint32(off, false);
    const type = String.fromCharCode(
      pngBytes[off + 4],
      pngBytes[off + 5],
      pngBytes[off + 6],
      pngBytes[off + 7]
    );
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > pngBytes.byteLength) break;
    const data = pngBytes.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      ihdr = new Uint8Array(data);
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'PLTE' || type === 'tRNS' || type === 'sRGB' || type === 'gAMA' || type === 'cHRM') {
      keepAncillary.push({ type, data: new Uint8Array(data) });
    } else if (type === 'IEND') {
      break;
    }
    off = dataEnd + 4;
  }

  if (!ihdr || ihdr.byteLength !== 13 || idatParts.length === 0) {
    throw new Error('Invalid PNG: missing IHDR or IDAT.');
  }
  const ihdrView = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  return {
    width: ihdrView.getUint32(0, false),
    height: ihdrView.getUint32(4, false),
    ihdr,
    ancillary: keepAncillary,
    idat: concatBytes(idatParts),
  };
}

/**
 * Stitch parsed PNG frames into an APNG Uint8Array, coalescing identical consecutive hold frames.
 * @param {{
 *   frames: Array<{ png: Uint8Array, delayNum?: number, delayDen?: number }>,
 *   fps?: number,
 *   loop?: number,
 *   coalesceHolds?: boolean
 * }} opts
 */
export function muxApngWithStats({ frames, fps = 24, loop = 0, coalesceHolds = true }) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('muxApng requires at least one PNG frame.');
  }
  const defaultDen = Math.max(1, Math.min(65535, Math.round(fps)));
  const parsedList = [];
  let coalescedHolds = 0;

  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    const parsed = parsePng(f.png);
    const delayNum = Math.max(1, Math.round(f.delayNum ?? 1));
    const delayDen = Math.max(1, Math.min(65535, Math.round(f.delayDen ?? defaultDen)));

    const prev = parsedList[parsedList.length - 1];
    if (
      coalesceHolds &&
      prev &&
      prev.delayDen === delayDen &&
      prev.delayNum + delayNum <= 65535 &&
      bytesEqual(prev.idat, parsed.idat)
    ) {
      prev.delayNum += delayNum;
      coalescedHolds += 1;
      continue;
    }

    parsedList.push({
      ...parsed,
      delayNum,
      delayDen,
    });
  }

  const first = parsedList[0];
  const chunks = [PNG_SIG, buildPngChunk('IHDR', first.ihdr)];
  for (const anc of first.ancillary) {
    chunks.push(buildPngChunk(anc.type, anc.data));
  }

  // acTL (Animation Control Chunk): num_frames (u32), num_plays (u32, 0 = infinite)
  const actl = new Uint8Array(8);
  const actlView = new DataView(actl.buffer);
  actlView.setUint32(0, parsedList.length, false);
  actlView.setUint32(4, Math.max(0, loop >>> 0), false);
  chunks.push(buildPngChunk('acTL', actl));

  let seq = 0;
  for (let i = 0; i < parsedList.length; i += 1) {
    const frame = parsedList[i];
    // fcTL (Frame Control Chunk): 26 bytes
    const fctl = new Uint8Array(26);
    const fv = new DataView(fctl.buffer);
    fv.setUint32(0, seq, false);
    seq += 1;
    fv.setUint32(4, frame.width, false);
    fv.setUint32(8, frame.height, false);
    fv.setUint32(12, 0, false); // x_offset
    fv.setUint32(16, 0, false); // y_offset
    fv.setUint16(20, frame.delayNum, false);
    fv.setUint16(22, frame.delayDen, false);
    fctl[24] = 0; // dispose_op: APNG_DISPOSE_OP_NONE
    fctl[25] = 0; // blend_op: APNG_BLEND_OP_SOURCE
    chunks.push(buildPngChunk('fcTL', fctl));

    if (i === 0) {
      chunks.push(buildPngChunk('IDAT', frame.idat));
    } else {
      const fdat = new Uint8Array(4 + frame.idat.byteLength);
      new DataView(fdat.buffer).setUint32(0, seq, false);
      seq += 1;
      fdat.set(frame.idat, 4);
      chunks.push(buildPngChunk('fdAT', fdat));
    }
  }

  chunks.push(buildPngChunk('IEND', new Uint8Array(0)));
  const bytes = concatBytes(chunks);

  return {
    bytes,
    stats: {
      inputFrames: frames.length,
      emittedFrames: parsedList.length,
      coalescedHolds,
      width: first.width,
      height: first.height,
      byteLength: bytes.byteLength,
    },
  };
}

export function muxApng(opts) {
  return muxApngWithStats(opts).bytes;
}

/**
 * Browser-friendly APNG session capturing each frame via native `canvas.toBlob('image/png')`.
 */
export class ApngSession {
  constructor({ fps = 24, loop = 0, coalesceHolds = true } = {}) {
    this.fps = Math.max(1, Number(fps) || 24);
    this.loop = loop;
    this.coalesceHolds = coalesceHolds;
    this.frames = [];
  }

  addPng(pngBytes, delayNum = 1, delayDen = this.fps) {
    this.frames.push({
      png: pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes),
      delayNum,
      delayDen,
    });
  }

  async addCanvas(canvas) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob(image/png) returned null'))), 'image/png');
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    this.addPng(bytes, 1, this.fps);
  }

  finalize() {
    const res = muxApngWithStats({
      frames: this.frames,
      fps: this.fps,
      loop: this.loop,
      coalesceHolds: this.coalesceHolds,
    });
    return {
      bytes: res.bytes,
      blob: typeof Blob !== 'undefined' ? new Blob([res.bytes], { type: 'image/apng' }) : null,
      stats: res.stats,
    };
  }
}
