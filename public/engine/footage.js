// 客户自己的视频素材：上传时压成小体积（最长 30 秒、720p、去掉原声）存在本机，出片时逐帧解码画进模板。
// 页面和导出线程通用：importVideo 只在页面里用，其余在 Worker 里也能跑。
export const CLIP_MAX_SEC = 30;
const STORE_FPS = 25;
const LONG = 1280; const SHORT = 720;
const CODECS = ['avc1.42001f', 'avc1.4d001f', 'avc1.640028', 'avc1.42002a'];

async function pickConfig(width, height) {
  for (const codec of CODECS) {
    // 码率按画面大小算：720×1280 约 3Mbps，小画面不浪费空间
    const bitrate = Math.round(Math.max(1_000_000, (3_000_000 * width * height) / (720 * 1280)));
    const cfg = { codec, width, height, bitrate, framerate: STORE_FPS, latencyMode: 'realtime', avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* next */ }
  }
  throw new Error('当前浏览器不能处理视频，请用最新版 Chrome 或 Edge');
}

/**
 * 收画面：一帧帧画到小画布上（转正方向、缩到 720p），再压成 H.264
 * vw/vh 是原始画面尺寸，rot 是要顺时针转的角度
 */
async function makeSink(vw, vh, rot, dur, onProgress) {
  const sw = rot % 180 ? vh : vw; const sh = rot % 180 ? vw : vh;
  const k = Math.min(1, LONG / Math.max(sw, sh), SHORT / Math.min(sw, sh));
  const w = Math.max(2, Math.round((sw * k) / 2) * 2); const h = Math.max(2, Math.round((sh * k) / 2) * 2);
  const canvas = new OffscreenCanvas(w, h); const g = canvas.getContext('2d');
  const cfg = await pickConfig(w, h);
  const chunks = []; let decoderConfig = null; let failure = null;
  const enc = new VideoEncoder({
    output: (c, m) => {
      if (m?.decoderConfig && !decoderConfig) decoderConfig = m.decoderConfig;
      const d = new Uint8Array(c.byteLength); c.copyTo(d);
      chunks.push({ t: c.timestamp / 1e6, key: c.type === 'key', d });
    },
    error: (e) => { failure = e; },
  });
  enc.configure(cfg);
  let last = -1; let lastKey = -1e9; let thumb = null;
  return {
    // 每 1/25 秒取一帧：按格子算，30 帧的视频也能取满 25 帧
    want: (t) => t >= 0 && t < dur && (last < 0 || Math.floor(t * STORE_FPS + 0.02) > Math.floor(last * STORE_FPS + 0.02)),
    async push(src, t) {
      if (failure) throw failure;
      g.save();
      if (rot) { g.translate(w / 2, h / 2); g.rotate((rot * Math.PI) / 180); const dw = rot % 180 ? h : w; const dh = rot % 180 ? w : h; g.drawImage(src, -dw / 2, -dh / 2, dw, dh); }
      else g.drawImage(src, 0, 0, w, h);
      g.restore();
      const key = t - lastKey >= 1; if (key) lastKey = t;
      const f = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) });
      enc.encode(f, { keyFrame: key }); f.close();
      last = t;
      if (!thumb && t >= Math.min(1, dur / 3)) thumb = canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      onProgress?.(Math.min(1, t / dur));
      while (enc.encodeQueueSize > 6) await new Promise((r) => enc.addEventListener('dequeue', r, { once: true }));
    },
    async finish() {
      await enc.flush();
      if (failure) throw failure;
      if (!chunks.length || !decoderConfig) throw new Error('视频里没读到画面');
      let off = 0;
      const index = chunks.map((c) => { const x = { t: c.t, key: c.key, off, len: c.d.byteLength }; off += c.d.byteLength; return x; });
      const desc = decoderConfig.description;
      const config = {
        codec: decoderConfig.codec, codedWidth: w, codedHeight: h,
        ...(desc ? { description: new Uint8Array(desc.buffer ? desc.buffer.slice(desc.byteOffset, desc.byteOffset + desc.byteLength) : desc.slice(0)).buffer } : {}),
      };
      const clip = { w, h, dur: Math.max(0.2, last + 1 / STORE_FPS), config, index, blob: new Blob(chunks.map((c) => c.d)) };
      return { clip, thumb: await (thumb || canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })) };
    },
    close() { try { if (enc.state !== 'closed') enc.close(); } catch { /* */ } },
  };
}

/** 快路：MP4 / MOV（手机拍的基本都是）直接拆包解码，不用播放，后台也不会变慢 */
async function viaDemux(file, onProgress) {
  if (typeof VideoDecoder === 'undefined') throw new Error('no-webcodecs');
  const { createFile, MP4BoxBuffer, DataStream } = await import('/vendor/mp4box/mp4box.all.mjs');
  const mp4 = createFile();
  let info = null; let track = null; let enough = false;
  const samples = [];
  mp4.onError = () => {};
  mp4.onReady = (i) => {
    info = i; track = i.videoTracks?.[0];
    if (track) { mp4.setExtractionOptions(track.id, null, { nbSamples: 300 }); mp4.start(); }
  };
  mp4.onSamples = (_id, _u, list) => {
    for (const s of list) { if (s.cts / s.timescale > CLIP_MAX_SEC + 1.5) { enough = true; break; } samples.push(s); }
  };
  const CH = 8 << 20;
  for (let off = 0; off < file.size && !enough; off += CH) {
    mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(await file.slice(off, off + CH).arrayBuffer(), off));
  }
  mp4.flush();
  if (!info) throw new Error('not-mp4');
  if (!track) throw Object.assign(new Error('这个视频里没有画面'), { final: true });
  if (!samples.length) throw new Error('no-samples');
  const entry = mp4.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0];
  const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
  let description;
  if (box) { const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(ds); description = new Uint8Array(ds.buffer, 8); }
  const vw = track.video?.width || track.track_width; const vh = track.video?.height || track.track_height;
  const cfg = { codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec, codedWidth: vw, codedHeight: vh, ...(description ? { description } : {}) };
  if (!(await VideoDecoder.isConfigSupported(cfg).catch(() => ({}))).supported) throw new Error('codec');
  // 手机竖着拍的视频常常是“横着存 + 标记旋转 90°”
  const m = track.matrix || [];
  let rot = m.length ? Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI) : 0;
  rot = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
  const total = samples.length ? Math.max(...samples.map((s) => s.cts / s.timescale)) : CLIP_MAX_SEC;
  const dur = Math.min(CLIP_MAX_SEC, total + 0.04);
  const sink = await makeSink(vw, vh, rot, dur, onProgress);
  const out = []; let fail = null; let t0 = null;
  const dec = new VideoDecoder({ output: (f) => out.push(f), error: (e) => { fail = e; } });
  try {
    dec.configure(cfg);
    const drain = async () => {
      while (out.length) {
        const f = out.shift();
        if (t0 == null) t0 = f.timestamp / 1e6;
        const t = f.timestamp / 1e6 - t0;
        try { if (sink.want(t)) await sink.push(f, t); } finally { f.close(); }
      }
    };
    for (const s of samples) {
      if (fail) throw fail;
      dec.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round((s.cts * 1e6) / s.timescale), duration: Math.round((s.duration * 1e6) / s.timescale), data: s.data }));
      while (dec.decodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      await drain();
    }
    await dec.flush(); await drain();
    if (fail) throw fail;
    return await sink.finish();
  } finally {
    out.forEach((f) => f.close());
    try { if (dec.state !== 'closed') dec.close(); } catch { /* */ }
    sink.close();
  }
}

/** 慢路：浏览器自己能放的格式（WebM 等），一帧帧跳着读（每秒取 15 帧） */
async function viaVideo(file, onProgress) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '4px', height: '4px', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
  document.body.appendChild(v);
  let sink = null;
  const seek = (t) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('视频读取卡住了，换一个试试')), 15000); v.onseeked = () => { clearTimeout(to); res(); }; v.currentTime = t; });
  try {
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('视频读取超时，换一个试试')), 30000);
      v.onloadeddata = () => { clearTimeout(to); res(); };
      v.onerror = () => { clearTimeout(to); rej(new Error('这个视频打不开，换成手机拍的 MP4 试试')); };
      v.src = url;
    });
    if (!v.videoWidth || !v.videoHeight) throw new Error('这个视频没有画面');
    if (!Number.isFinite(v.duration)) await seek(1e6); // 录屏类 WebM 不写时长：跳到最后让浏览器算出来
    const dur = Math.min(CLIP_MAX_SEC, Number.isFinite(v.duration) && v.duration > 0 ? v.duration : CLIP_MAX_SEC);
    sink = await makeSink(v.videoWidth, v.videoHeight, 0, dur, onProgress);
    for (let t = 0; t < dur; t += 1 / 15) { await seek(t); await sink.push(v, t); }
    return await sink.finish();
  } finally {
    sink?.close();
    v.pause(); v.removeAttribute('src'); v.load(); v.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * 读一个视频文件，压成我们自己的格式（最长 30 秒、720p、不要声音）
 * @returns {Promise<{clip:object, thumb:Blob}>}
 */
export async function importVideo(file, onProgress) {
  if (typeof VideoEncoder === 'undefined') throw new Error('当前浏览器不能处理视频，请用最新版 Chrome 或 Edge');
  if (/mp4|quicktime|m4v|3gp/i.test(file.type) || /\.(mp4|mov|m4v|3gp)$/i.test(file.name || '')) {
    try { return await viaDemux(file, onProgress); } catch (e) { if (e.final) throw e; /* 换慢路再试 */ }
  }
  return viaVideo(file, onProgress);
}

// ---------- 解码：按时间取画面 ----------
const LOOK = 2; // 多喂几帧，解码器才会把目标帧吐出来
// 等一帧解出来最多等多久：预览 250ms（卡了就先用相邻帧，不拖慢播放）；导出调大，宁可慢一点也要拿到准的那一帧
let DECODE_WAIT = 250;
export function setDecodeWait(ms) { DECODE_WAIT = ms; }
class ClipReader {
  constructor(clip) {
    this.clip = clip; this.data = null; this.dec = null; this.frames = []; this.fed = 0; this.outMax = -1;
    this.tsIdx = new Map(clip.index.map((c, i) => [Math.round(c.t * 1e6), i]));
    this.target = -1; this.doneIdx = -2; this.running = null; this.wake = null; this.dirty = false;
  }
  idxAt(t) {
    const ix = this.clip.index; let lo = 0; let hi = ix.length - 1;
    if (t <= ix[0].t) return 0;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ix[m].t <= t + 1e-4) lo = m; else hi = m - 1; }
    return lo;
  }
  keyBefore(j) { const ix = this.clip.index; while (j > 0 && !ix[j].key) j--; return j; }
  reset(from) {
    try { if (this.dec && this.dec.state !== 'closed') this.dec.close(); } catch { /* */ }
    this.frames.forEach((x) => x.f.close()); this.frames = []; this.outMax = from - 1; this.dirty = false;
    this.dec = new VideoDecoder({
      output: (f) => {
        const i = this.tsIdx.get(f.timestamp) ?? this.idxAt(f.timestamp / 1e6);
        this.frames.push({ i, f }); this.frames.sort((a, b) => a.i - b.i);
        this.outMax = Math.max(this.outMax, i);
        // 解码器手里的帧要及时还，太旧的关掉
        while (this.frames.length > 8) this.frames.shift().f.close();
        this.wake?.();
      },
      error: () => { this.dirty = true; this.wake?.(); },
    });
    this.dec.configure({ ...this.clip.config, optimizeForLatency: true });
    this.fed = from;
  }
  feedTo(n) {
    const ix = this.clip.index;
    while (this.fed <= n && this.fed < ix.length) {
      const c = ix[this.fed];
      this.dec.decode(new EncodedVideoChunk({ type: c.key ? 'key' : 'delta', timestamp: Math.round(c.t * 1e6), data: this.data.subarray(c.off, c.off + c.len) }));
      this.fed++;
    }
  }
  async decodeTo(j) {
    if (!this.data) this.data = new Uint8Array(await this.clip.blob.arrayBuffer());
    if (this.frames.some((x) => x.i === j)) return this.prune(j);
    const k = this.keyBefore(j);
    const passed = this.outMax >= j; // 已经解过去了，帧也扔了
    if (!this.dec || this.dec.state === 'closed' || this.dirty || passed || k > this.fed || j < this.fed - LOOK - 6) this.reset(k);
    this.feedTo(j + LOOK);
    const t0 = performance.now();
    while (this.outMax < j && !this.dirty && performance.now() - t0 < DECODE_WAIT) {
      await new Promise((r) => { this.wake = r; setTimeout(r, 40); });
    }
    this.wake = null;
    if (this.outMax < j && !this.dirty) {
      // 解码器憋着不吐：冲一下（冲完下一帧必须从关键帧开始，所以标脏）
      try { await this.dec.flush(); } catch { /* */ }
      this.dirty = true;
    }
    this.prune(j);
  }
  prune(j) {
    // 留下 j 之前最近的一帧和之后的帧
    let keep = -1;
    for (let n = 0; n < this.frames.length; n++) if (this.frames[n].i <= j) keep = n;
    while (keep > 0) { this.frames.shift().f.close(); keep--; }
  }
  /** 预览会一直催新的时间点：只解最新要的那一帧 */
  ensure(j) {
    this.target = j;
    if (!this.running) {
      this.running = (async () => {
        while (this.target !== this.doneIdx) { const want = this.target; try { await this.decodeTo(want); } catch { this.dirty = true; } this.doneIdx = want; }
      })().finally(() => { this.running = null; });
    }
    return this.running;
  }
  close() {
    try { if (this.dec && this.dec.state !== 'closed') this.dec.close(); } catch { /* */ }
    this.frames.forEach((x) => x.f.close()); this.frames = [];
  }
  peek(j) {
    let best = null;
    for (const x of this.frames) { if (x.i <= j) best = x.f; else { if (!best) best = x.f; break; } }
    return best;
  }
}

const readers = new Map();
// lane：同一个画面里同时出现几个视频（分屏、四宫格），同一段视频在不同格子里播不同位置，各用各的解码器
function readerOf(clip, lane = 0) {
  const key = (clip.id || 'clip') + ':' + lane;
  let r = readers.get(key);
  if (!r || r.clip.blob !== clip.blob) { r?.close(); r = new ClipReader(clip); readers.set(key, r); }
  return r;
}
/** 视频素材在第 t 秒（素材自己的时间）该显示哪帧：先解码好 */
export function prepareClip(clip, t, lane = 0) { const r = readerOf(clip, lane); return r.ensure(r.idxAt(t)); }
/** 取已经解好的那一帧（没有就返回 null），同步，给 drawFrame 用 */
export function clipFrame(clip, t, lane = 0) { const r = readerOf(clip, lane); return r.peek(r.idxAt(t)); }
export const isClip = (m) => !!(m && m.clip);
/** 一个镜头里视频播到哪：从 offset 开始播，播完从头循环 */
export function clipTime(m, start, t) { const d = m.clip.dur; return (m.offset + Math.max(0, t - start)) % d; }

// ---------- 分配：客户的照片和视频，均匀铺到各个镜头 ----------
/**
 * @param {number} n 镜头数
 * @param {{type:'photo'|'video', bitmap?:ImageBitmap, clip?:object, poster?:ImageBitmap}[]} items 客户素材
 * @returns {{slots:object[], media:(object|null)[], picks:(object|null)[]}}
 */
export function planFootage(n, items) {
  // 一段长视频能切成几个镜头用（每段从不同位置开始）
  const per = items.map((it) => (it.type === 'video' ? Math.max(1, Math.min(4, Math.floor(it.clip.dur / 3.5))) : 1));
  const slots = [];
  for (let r = 0; r < Math.max(0, ...per); r++) {
    items.forEach((it, k) => {
      if (r >= per[k]) return;
      slots.push(it.type === 'video' ? { clip: it.clip, poster: it.poster, offset: (it.clip.dur * r) / per[k] } : it.bitmap);
    });
  }
  const media = new Array(n).fill(null); const picks = new Array(n).fill(null);
  if (!slots.length) return { slots, media, picks };
  if (slots.length >= n) {
    for (let i = 0; i < n; i++) { media[i] = slots[i]; picks[i] = { own: true, idx: i }; }
  } else {
    // 不够：均匀撒开，空出来的镜头用素材库补
    slots.forEach((s, k) => { const i = Math.min(n - 1, Math.floor(((k + 0.5) * n) / slots.length)); media[i] = s; picks[i] = { own: true, idx: k }; });
  }
  return { slots, media, picks };
}
