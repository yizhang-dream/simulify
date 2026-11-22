/**
 * Zero-dependency pure-JS ISOBMFF (MP4) muxer for WebCodecs H.264 (avc1) video chunks.
 * Produces fast-start (`ftyp` -> `moov` -> `mdat`) constant-frame-rate MP4 files
 * playable across browsers, macOS/Windows/Linux players, and FFmpeg.
 */

const TIMESCALE = 90000;

function ascii(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
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

function box(type, ...payloads) {
  let payloadLen = 0;
  for (const p of payloads) payloadLen += p.byteLength;
  const size = 8 + payloadLen;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size, false);
  out.set(ascii(type), 4);
  let off = 8;
  for (const p of payloads) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

function fullBox(type, version, flags, ...payloads) {
  const hdr = new Uint8Array(4);
  hdr[0] = version & 0xff;
  hdr[1] = (flags >>> 16) & 0xff;
  hdr[2] = (flags >>> 8) & 0xff;
  hdr[3] = flags & 0xff;
  return box(type, hdr, ...payloads);
}

/**
 * Split Annex-B H.264 byte stream (0x000001 / 0x00000001 start codes) into raw NAL units.
 * Used only as a defensive fallback if a browser emits Annex-B instead of AVCC length-prefixed chunks.
 */
function splitAnnexBNals(bytes) {
  const nals = [];
  let i = 0;
  const n = bytes.length;
  const findStart = (pos) => {
    for (let k = pos; k < n - 2; k += 1) {
      if (bytes[k] === 0 && bytes[k + 1] === 0) {
        if (bytes[k + 2] === 1) return { idx: k, len: 3 };
        if (k + 3 < n && bytes[k + 2] === 0 && bytes[k + 3] === 1) return { idx: k, len: 4 };
      }
    }
    return null;
  };
  let cur = findStart(0);
  if (!cur) return null;
  while (cur) {
    const start = cur.idx + cur.len;
    const next = findStart(start);
    const end = next ? next.idx : n;
    if (end > start) {
      nals.push(bytes.subarray(start, end));
    }
    cur = next;
  }
  return nals;
}

function isAnnexB(bytes) {
  if (bytes.length < 4) return false;
  return (
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1) ||
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 1)
  );
}

function buildAvcCFromSpsPps(sps, pps) {
  const profile = sps.length > 1 ? sps[1] : 0x42;
  const compat = sps.length > 2 ? sps[2] : 0xc0;
  const level = sps.length > 3 ? sps[3] : 0x1e;
  const out = new Uint8Array(11 + sps.length + pps.length);
  const view = new DataView(out.buffer);
  out[0] = 1; // configurationVersion
  out[1] = profile;
  out[2] = compat;
  out[3] = level;
  out[4] = 0xff; // 4-byte NAL length size (lengthSizeMinusOne = 3)
  out[5] = 0xe1; // 1 SPS
  view.setUint16(6, sps.length, false);
  out.set(sps, 8);
  const ppsOff = 8 + sps.length;
  out[ppsOff] = 1; // 1 PPS
  view.setUint16(ppsOff + 1, pps.length, false);
  out.set(pps, ppsOff + 3);
  return out;
}

function annexBToAvcc(bytes) {
  const nals = splitAnnexBNals(bytes);
  if (!nals || nals.length === 0) return { data: bytes, sps: null, pps: null };
  let sps = null;
  let pps = null;
  const filtered = [];
  let total = 0;
  for (const nal of nals) {
    const nalType = nal[0] & 0x1f;
    if (nalType === 7 && !sps) sps = nal;
    else if (nalType === 8 && !pps) pps = nal;
    filtered.push(nal);
    total += 4 + nal.length;
  }
  const avcc = new Uint8Array(total);
  const view = new DataView(avcc.buffer);
  let off = 0;
  for (const nal of filtered) {
    view.setUint32(off, nal.length, false);
    avcc.set(nal, off + 4);
    off += 4 + nal.length;
  }
  return { data: avcc, sps, pps };
}

function buildFtyp() {
  const minor = new Uint8Array(4);
  new DataView(minor.buffer).setUint32(0, 512, false);
  return box('ftyp', ascii('isom'), minor, ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
}

function buildMvhd(durationTicks) {
  const buf = new Uint8Array(96);
  const view = new DataView(buf.buffer);
  // creation_time (0), modification_time (4) = 0
  view.setUint32(8, TIMESCALE, false);
  view.setUint32(12, Math.max(1, durationTicks >>> 0), false);
  view.setUint32(16, 0x00010000, false); // rate 1.0
  view.setUint16(20, 0x0100, false); // volume 1.0
  // 10 reserved bytes (22..31)
  // Unity matrix (32..67)
  view.setUint32(32, 0x00010000, false);
  view.setUint32(48, 0x00010000, false);
  view.setUint32(64, 0x40000000, false);
  // 24 pre_defined bytes (68..91)
  view.setUint32(92, 2, false); // next_track_id
  return fullBox('mvhd', 0, 0, buf);
}

function buildTkhd(width, height, durationTicks) {
  const buf = new Uint8Array(80);
  const view = new DataView(buf.buffer);
  // creation_time (0), modification_time (4) = 0
  view.setUint32(8, 1, false); // track_id
  // reserved (12)
  view.setUint32(16, Math.max(1, durationTicks >>> 0), false);
  // reserved (20..27), layer/alternate_group/volume/reserved (28..35)
  // Unity matrix (36..71)
  view.setUint32(36, 0x00010000, false);
  view.setUint32(52, 0x00010000, false);
  view.setUint32(68, 0x40000000, false);
  view.setUint32(72, (width & 0xffff) << 16, false);
  view.setUint32(76, (height & 0xffff) << 16, false);
  return fullBox('tkhd', 0, 0x000003, buf);
}

function buildMdhd(durationTicks) {
  const buf = new Uint8Array(20);
  const view = new DataView(buf.buffer);
  view.setUint32(8, TIMESCALE, false);
  view.setUint32(12, Math.max(1, durationTicks >>> 0), false);
  view.setUint16(16, 0x55c4, false); // 'und'
  return fullBox('mdhd', 0, 0, buf);
}

function buildHdlr() {
  const fixed = new Uint8Array(20);
  fixed.set(ascii('vide'), 4);
  return fullBox('hdlr', 0, 0, fixed, ascii('VideoHandler\0'));
}

function buildVmhd() {
  return fullBox('vmhd', 0, 1, new Uint8Array(8));
}

function buildDinf() {
  const entryCount = new Uint8Array(4);
  new DataView(entryCount.buffer).setUint32(0, 1, false);
  const urlBox = fullBox('url ', 0, 1);
  return box('dinf', fullBox('dref', 0, 0, entryCount, urlBox));
}

function buildColr() {
  // nclx: BT.709 primaries (1), sRGB/BT.709 transfer (1), BT.709 matrix (1), limited range (0)
  const buf = new Uint8Array(11);
  const view = new DataView(buf.buffer);
  buf.set(ascii('nclx'), 0);
  view.setUint16(4, 1, false);
  view.setUint16(6, 1, false);
  view.setUint16(8, 1, false);
  buf[10] = 0x00;
  return box('colr', buf);
}

function buildStsd(width, height, avcCBytes) {
  // VisualSampleEntry fixed body = 78 bytes (86 including 8-byte 'avc1' header)
  const visual = new Uint8Array(78);
  const view = new DataView(visual.buffer);
  view.setUint16(6, 1, false); // data_reference_index
  view.setUint16(24, width, false);
  view.setUint16(26, height, false);
  view.setUint32(28, 0x00480000, false); // 72 dpi horiz
  view.setUint32(32, 0x00480000, false); // 72 dpi vert
  view.setUint16(40, 1, false); // frame_count
  // compressorname (32 bytes at 42..73) left 0
  view.setUint16(74, 0x0018, false); // depth 24
  view.setInt16(76, -1, false); // pre_defined = -1

  const avcCBox = box('avcC', avcCBytes);
  const avc1Box = box('avc1', visual, avcCBox, buildColr());
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, 1, false);
  return fullBox('stsd', 0, 0, count, avc1Box);
}

function buildStts(samples) {
  // Run-length encode sample durations in timescale ticks
  const runs = [];
  for (const s of samples) {
    const delta = Math.max(1, Math.round(s.durationTicks));
    const last = runs[runs.length - 1];
    if (last && last.delta === delta) {
      last.count += 1;
    } else {
      runs.push({ count: 1, delta });
    }
  }
  const buf = new Uint8Array(4 + runs.length * 8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, runs.length, false);
  let off = 4;
  for (const r of runs) {
    view.setUint32(off, r.count, false);
    view.setUint32(off + 4, r.delta, false);
    off += 8;
  }
  return fullBox('stts', 0, 0, buf);
}

function buildStss(samples) {
  const keyIndices = [];
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i].isKey) keyIndices.push(i + 1);
  }
  if (keyIndices.length === 0 || keyIndices.length === samples.length) {
    return null;
  }
  const buf = new Uint8Array(4 + keyIndices.length * 4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, keyIndices.length, false);
  for (let i = 0; i < keyIndices.length; i += 1) {
    view.setUint32(4 + i * 4, keyIndices[i], false);
  }
  return fullBox('stss', 0, 0, buf);
}

function buildStsc(sampleCount) {
  // Single contiguous chunk holding all samples in mdat
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 1, false); // entry_count = 1
  view.setUint32(4, 1, false); // first_chunk = 1
  view.setUint32(8, sampleCount, false); // samples_per_chunk = N
  view.setUint32(12, 1, false); // sample_description_index = 1
  return fullBox('stsc', 0, 0, buf);
}

function buildStsz(samples) {
  const buf = new Uint8Array(8 + samples.length * 4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0, false); // variable sample size
  view.setUint32(4, samples.length, false);
  for (let i = 0; i < samples.length; i += 1) {
    view.setUint32(8 + i * 4, samples[i].data.byteLength, false);
  }
  return fullBox('stsz', 0, 0, buf);
}

function buildChunkOffsetBox(offset, use64) {
  if (use64) {
    const buf = new Uint8Array(12);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 1, false);
    const hi = Math.floor(offset / 0x100000000);
    const lo = offset >>> 0;
    view.setUint32(4, hi, false);
    view.setUint32(8, lo, false);
    return fullBox('co64', 0, 0, buf);
  }
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 1, false);
  view.setUint32(4, offset >>> 0, false);
  return fullBox('stco', 0, 0, buf);
}

export class Mp4Muxer {
  /**
   * @param {{ width: number, height: number, fps?: number, description?: Uint8Array }} opts
   */
  constructor({ width, height, fps = 30, description = null } = {}) {
    this.width = Math.max(2, Math.floor(Number(width) || 0) & ~1);
    this.height = Math.max(2, Math.floor(Number(height) || 0) & ~1);
    this.fps = Math.max(1, Number(fps) || 30);
    this.defaultDeltaTicks = Math.max(1, Math.round(TIMESCALE / this.fps));
    this.avcC = description ? new Uint8Array(description) : null;
    this._sps = null;
    this._pps = null;
    this.samples = [];
    this.mdatBytes = 0;
  }

  /**
   * Append a WebCodecs EncodedVideoChunk or raw `{ data, isKey, durationUs, description }` object.
   * @param {EncodedVideoChunk | { data: Uint8Array, isKey?: boolean, durationUs?: number, description?: Uint8Array }} chunk
   * @param {{ decoderConfig?: { description?: BufferSource } }} [meta]
   */
  addChunk(chunk, meta = null) {
    const desc = meta?.decoderConfig?.description || chunk?.description;
    if (desc && !this.avcC) {
      this.avcC = desc instanceof Uint8Array
        ? new Uint8Array(desc)
        : ArrayBuffer.isView(desc)
          ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength)
          : new Uint8Array(desc);
    }

    let raw;
    if (chunk instanceof Uint8Array) {
      raw = chunk;
    } else if (typeof chunk.copyTo === 'function') {
      raw = new Uint8Array(chunk.byteLength);
      chunk.copyTo(raw);
    } else if (chunk.data instanceof Uint8Array) {
      raw = chunk.data;
    } else if (ArrayBuffer.isView(chunk.data)) {
      raw = new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
    } else {
      throw new Error('Mp4Muxer.addChunk expects an EncodedVideoChunk or { data: Uint8Array }.');
    }

    let payload = raw;
    if (isAnnexB(raw)) {
      const converted = annexBToAvcc(raw);
      payload = converted.data;
      if (converted.sps && !this._sps) this._sps = converted.sps;
      if (converted.pps && !this._pps) this._pps = converted.pps;
    }

    const isKey = typeof chunk.type === 'string'
      ? chunk.type === 'key'
      : Boolean(chunk.isKey ?? this.samples.length === 0);

    const durUs = typeof chunk.duration === 'number' && chunk.duration > 0
      ? chunk.duration
      : typeof chunk.durationUs === 'number' && chunk.durationUs > 0
        ? chunk.durationUs
        : null;
    const durationTicks = durUs !== null
      ? Math.max(1, Math.round((durUs * TIMESCALE) / 1e6))
      : this.defaultDeltaTicks;

    this.samples.push({ data: payload, isKey, durationTicks });
    this.mdatBytes += payload.byteLength;
  }

  /**
   * Finalize and emit a contiguous fast-start MP4 Uint8Array.
   * @returns {Uint8Array}
   */
  finalize() {
    if (this.samples.length === 0) {
      throw new Error('Mp4Muxer.finalize called with zero samples.');
    }
    if (!this.avcC) {
      if (this._sps && this._pps) {
        this.avcC = buildAvcCFromSpsPps(this._sps, this._pps);
      } else {
        // Minimal baseline fallback avcC if tests feed synthetic chunks without SPS/PPS
        this.avcC = buildAvcCFromSpsPps(
          new Uint8Array([0x67, 0x42, 0xc0, 0x1f]),
          new Uint8Array([0x68, 0xce, 0x3c, 0x80])
        );
      }
    }

    let totalDuration = 0;
    for (const s of this.samples) totalDuration += s.durationTicks;

    const ftyp = buildFtyp();
    const mdatExtended = 8 + this.mdatBytes > 0xffffffff;
    const mdatHeaderSize = mdatExtended ? 16 : 8;

    const buildMoov = (chunkOffset, use64) => {
      const stblChildren = [
        buildStsd(this.width, this.height, this.avcC),
        buildStts(this.samples),
      ];
      const stss = buildStss(this.samples);
      if (stss) stblChildren.push(stss);
      stblChildren.push(
        buildStsc(this.samples.length),
        buildStsz(this.samples),
        buildChunkOffsetBox(chunkOffset, use64)
      );
      const stbl = box('stbl', ...stblChildren);
      const minf = box('minf', buildVmhd(), buildDinf(), stbl);
      const mdia = box('mdia', buildMdhd(totalDuration), buildHdlr(), minf);
      const trak = box('trak', buildTkhd(this.width, this.height, totalDuration), mdia);
      return box('moov', buildMvhd(totalDuration), trak);
    };

    // Measure moov size first to compute exact fast-start mdat data offset
    let use64 = false;
    let probeMoov = buildMoov(0, false);
    let mdatDataOffset = ftyp.byteLength + probeMoov.byteLength + mdatHeaderSize;
    if (mdatDataOffset > 0xffffffff) {
      use64 = true;
      probeMoov = buildMoov(0, true);
      mdatDataOffset = ftyp.byteLength + probeMoov.byteLength + mdatHeaderSize;
    }
    const moov = buildMoov(mdatDataOffset, use64);

    // Build mdat header
    const mdatHdr = new Uint8Array(mdatHeaderSize);
    const mdatView = new DataView(mdatHdr.buffer);
    if (mdatExtended) {
      mdatView.setUint32(0, 1, false);
      mdatHdr.set(ascii('mdat'), 4);
      const totalMdat = 16 + this.mdatBytes;
      mdatView.setUint32(8, Math.floor(totalMdat / 0x100000000), false);
      mdatView.setUint32(12, totalMdat >>> 0, false);
    } else {
      mdatView.setUint32(0, 8 + this.mdatBytes, false);
      mdatHdr.set(ascii('mdat'), 4);
    }

    const parts = [ftyp, moov, mdatHdr];
    for (const s of this.samples) parts.push(s.data);
    return concatBytes(parts);
  }

  toBlob() {
    return new Blob([this.finalize()], { type: 'video/mp4' });
  }
}

export const MP4_CODEC_CANDIDATES = [
  'avc1.640034', // High L5.2 (up to 4K60)
  'avc1.640028', // High L4.0 (up to 1080p60)
  'avc1.4d4028', // Main L4.0
  'avc1.42001f', // Baseline L3.1
];
