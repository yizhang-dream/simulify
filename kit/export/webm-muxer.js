/**
 * Zero-dependency pure-JS EBML/WebM muxer for WebCodecs VP9/VP8/AV1 chunks,
 * plus a clean MediaRecorder fallback helper for browsers without WebCodecs.
 */

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

function encodeId(id) {
  const bytes = [];
  let v = id;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

/** Encode unsigned integer as EBML VINT size (1..8 bytes). */
function encodeVintSize(value) {
  let width = 1;
  while (width < 8) {
    const maxVal = Math.pow(2, 7 * width) - 2; // reserve all-1s for unknown size
    if (value <= maxVal) break;
    width += 1;
  }
  const out = new Uint8Array(width);
  let rem = value;
  for (let i = width - 1; i >= 0; i -= 1) {
    out[i] = rem & 0xff;
    rem = Math.floor(rem / 256);
  }
  out[0] |= 1 << (8 - width);
  return out;
}

function encodeUint(value) {
  if (value === 0) return new Uint8Array([0]);
  const bytes = [];
  let v = Math.floor(value);
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

function encodeFloat64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, false);
  return out;
}

function encodeAscii(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function ebmlEl(id, payload) {
  const idBytes = encodeId(id);
  const data = payload instanceof Uint8Array ? payload : concatBytes(payload);
  const sizeBytes = encodeVintSize(data.byteLength);
  return concatBytes([idBytes, sizeBytes, data]);
}

function ebmlUint(id, val) {
  return ebmlEl(id, encodeUint(val));
}

function ebmlStr(id, str) {
  return ebmlEl(id, encodeAscii(str));
}

const CODEC_TO_MATROSKA = {
  vp9: 'V_VP9',
  'vp09': 'V_VP9',
  vp8: 'V_VP8',
  av1: 'V_AV1',
  av01: 'V_AV1',
};

function resolveMatroskaCodecId(codec) {
  const low = String(codec || 'vp9').toLowerCase();
  if (low.startsWith('v_')) return codec.toUpperCase();
  for (const [prefix, id] of Object.entries(CODEC_TO_MATROSKA)) {
    if (low.startsWith(prefix)) return id;
  }
  return 'V_VP9';
}

export class WebmMuxer {
  /**
   * @param {{ width: number, height: number, fps?: number, codec?: string }} opts
   */
  constructor({ width, height, fps = 30, codec = 'vp09.00.10.08' } = {}) {
    this.width = Math.max(2, Math.round(Number(width) || 0));
    this.height = Math.max(2, Math.round(Number(height) || 0));
    this.fps = Math.max(1, Number(fps) || 30);
    this.codecId = resolveMatroskaCodecId(codec);
    this.clusters = [];
    this._currentCluster = null;
    this.lastEndMs = 0;
  }

  /**
   * Append a WebCodecs EncodedVideoChunk or raw `{ data, isKey, timestampUs, durationUs }` object.
   * @param {EncodedVideoChunk | { data: Uint8Array, isKey?: boolean, timestampUs?: number, durationUs?: number }} chunk
   */
  addChunk(chunk) {
    let data;
    if (chunk instanceof Uint8Array) {
      data = chunk;
    } else if (typeof chunk.copyTo === 'function') {
      data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
    } else if (chunk.data instanceof Uint8Array) {
      data = chunk.data;
    } else if (ArrayBuffer.isView(chunk.data)) {
      data = new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
    } else {
      throw new Error('WebmMuxer.addChunk expects an EncodedVideoChunk or { data: Uint8Array }.');
    }

    const isKey = typeof chunk.type === 'string'
      ? chunk.type === 'key'
      : Boolean(chunk.isKey ?? this.clusters.length === 0);

    const frameCountSoFar = this.clusters.reduce((acc, c) => acc + c.blocks.length, 0);
    const tsUs = typeof chunk.timestamp === 'number'
      ? chunk.timestamp
      : typeof chunk.timestampUs === 'number'
        ? chunk.timestampUs
        : Math.round((frameCountSoFar * 1e6) / this.fps);
    const durUs = typeof chunk.duration === 'number' && chunk.duration > 0
      ? chunk.duration
      : typeof chunk.durationUs === 'number' && chunk.durationUs > 0
        ? chunk.durationUs
        : Math.round(1e6 / this.fps);

    const tsMs = Math.max(0, Math.round(tsUs / 1000));
    const endMs = Math.max(tsMs + 1, Math.round((tsUs + durUs) / 1000));
    if (endMs > this.lastEndMs) this.lastEndMs = endMs;

    const needNewCluster =
      !this._currentCluster ||
      (isKey && this._currentCluster.blocks.length > 0) ||
      tsMs - this._currentCluster.timecodeMs > 30000;

    if (needNewCluster) {
      this._currentCluster = { timecodeMs: tsMs, blocks: [] };
      this.clusters.push(this._currentCluster);
    }

    const relMs = Math.max(-32768, Math.min(32767, tsMs - this._currentCluster.timecodeMs));
    const header = new Uint8Array(4);
    header[0] = 0x81; // track 1 as VINT
    new DataView(header.buffer).setInt16(1, relMs, false);
    header[3] = isKey ? 0x80 : 0x00;

    this._currentCluster.blocks.push(ebmlEl(0xa3, [header, data]));
  }

  /**
   * Finalize and emit a complete WebM file with seekable Cues.
   * @returns {Uint8Array}
   */
  finalize() {
    if (this.clusters.length === 0) {
      throw new Error('WebmMuxer.finalize called with zero samples.');
    }

    const docTypeVer = this.codecId === 'V_VP8' ? 2 : 4;
    const ebmlHeader = ebmlEl(0x1a45dfa3, [
      ebmlUint(0x4286, 1), // EBMLVersion
      ebmlUint(0x42f7, 1), // EBMLReadVersion
      ebmlUint(0x42f2, 4), // EBMLMaxIDLength
      ebmlUint(0x42f3, 8), // EBMLMaxSizeLength
      ebmlStr(0x4282, 'webm'), // DocType
      ebmlUint(0x4287, docTypeVer), // DocTypeVersion
      ebmlUint(0x4285, 2), // DocTypeReadVersion
    ]);

    const info = ebmlEl(0x1549a966, [
      ebmlUint(0x2ad7b1, 1000000), // TimecodeScale = 1ms
      ebmlStr(0x4d80, 'simulify-webm'), // MuxingApp
      ebmlStr(0x5741, 'simulify-exporter'), // WritingApp
      ebmlEl(0x4489, encodeFloat64(Math.max(1, this.lastEndMs))), // Duration (ms)
    ]);

    const videoEl = ebmlEl(0xe0, [
      ebmlUint(0xb0, this.width),
      ebmlUint(0xba, this.height),
    ]);

    const trackEntry = ebmlEl(0xae, [
      ebmlUint(0xd7, 1), // TrackNumber
      ebmlUint(0x73c5, 1), // TrackUID
      ebmlUint(0x83, 1), // TrackType: video
      ebmlStr(0x86, this.codecId), // CodecID
      ebmlUint(0x23e383, Math.round(1e9 / this.fps)), // DefaultDuration (ns)
      videoEl,
    ]);
    const tracks = ebmlEl(0x1654ae6b, [trackEntry]);

    // Encode clusters and track offsets relative to Segment data start for Cues
    const clusterBytes = [];
    const cueEntries = [];
    let relOffset = info.byteLength + tracks.byteLength;
    for (const c of this.clusters) {
      const encoded = ebmlEl(0x1f43b675, [
        ebmlUint(0xe7, c.timecodeMs),
        ...c.blocks,
      ]);
      cueEntries.push({ timecodeMs: c.timecodeMs, offset: relOffset });
      relOffset += encoded.byteLength;
      clusterBytes.push(encoded);
    }

    const cuePoints = cueEntries.map((entry) =>
      ebmlEl(0xbb, [
        ebmlUint(0xb3, entry.timecodeMs), // CueTime
        ebmlEl(0xb7, [
          ebmlUint(0xf7, 1), // CueTrack
          ebmlUint(0xf1, entry.offset), // CueClusterPosition
        ]),
      ])
    );
    const cues = ebmlEl(0x1c53bb6b, cuePoints);

    const segment = ebmlEl(0x18538067, [info, tracks, ...clusterBytes, cues]);
    return concatBytes([ebmlHeader, segment]);
  }

  toBlob() {
    return new Blob([this.finalize()], { type: 'video/webm' });
  }
}

export const WEBM_CODEC_CANDIDATES = [
  'vp09.00.10.08',
  'vp8',
];

/**
 * Pick the best MediaRecorder MIME type supported by the current browser.
 * @param {'webm'|'mp4'} [prefer='webm']
 */
export function pickMediaRecorderMime(prefer = 'webm') {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = prefer === 'mp4'
    ? [
        'video/mp4;codecs=avc1.640028',
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ]
    : [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm;codecs=av01',
        'video/webm',
        'video/mp4;codecs=avc1.640028',
        'video/mp4',
      ];
  for (const mime of list) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore unsupported probe
    }
  }
  return null;
}

/**
 * Fallback real-time paced MediaRecorder session for browsers lacking WebCodecs.
 * Uses `captureStream(0)` + `track.requestFrame()` when supported, pacing frame intervals cleanly.
 */
export function createMediaRecorderSession(canvas, { fps = 30, prefer = 'webm', bitrate = 5_000_000 } = {}) {
  const mimeType = pickMediaRecorderMime(prefer);
  if (!mimeType) {
    throw new Error('MediaRecorder is unavailable or supports no video MIME type in this browser.');
  }
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
    recorder.onerror = (ev) => reject(ev.error || new Error('MediaRecorder error'));
  });
  recorder.start(250);
  const frameMs = Math.max(10, Math.round(1000 / Math.max(1, fps)));

  return {
    mimeType,
    async addFrame() {
      if (track && typeof track.requestFrame === 'function') {
        track.requestFrame();
      }
      await new Promise((r) => setTimeout(r, frameMs));
    },
    async finish() {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      const blob = await stopped;
      stream.getTracks().forEach((t) => t.stop());
      return blob;
    },
    abort() {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // ignore
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
