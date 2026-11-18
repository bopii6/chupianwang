// 浏览器本地导出 MP4：WebCodecs 编码 + mp4-muxer 封装，不经过服务器。
// 默认放到 Worker 后台线程里跑：用户切到别的标签页也不会被浏览器限速，页面也不卡。
import { Muxer, ArrayBufferTarget } from '/vendor/mp4-muxer/mp4-muxer.mjs';

const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42003e', 'avc1.420034'];

// 让出线程：MessageChannel 不会像 setTimeout 那样在后台被限速
const channel = new MessageChannel();
const yieldQueue = [];
channel.port1.onmessage = () => yieldQueue.shift()?.();
const yieldNow = () => new Promise((r) => { yieldQueue.push(r); channel.port2.postMessage(0); });

/**
 * RGBA → I420，BT.709 有限范围（16–235）。
 * 浏览器直接从画布编码会标成“全范围”，部分播放器和平台转码会忽略这个标记，导致对比度偏高、发黄；
 * 自己转成标准有限范围，任何播放器都显示正确。
 */
function rgbaToI420(src, w, h, out) {
  const ySize = w * h;
  const uOff = ySize; const vOff = ySize + (ySize >> 2);
  const cw = w >> 1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i0 = (y * w + x) * 4; const i1 = i0 + 4; const i2 = i0 + w * 4; const i3 = i2 + 4;
      const r0 = src[i0]; const g0 = src[i0 + 1]; const b0 = src[i0 + 2];
      const r1 = src[i1]; const g1 = src[i1 + 1]; const b1 = src[i1 + 2];
      const r2 = src[i2]; const g2 = src[i2 + 1]; const b2 = src[i2 + 2];
      const r3 = src[i3]; const g3 = src[i3 + 1]; const b3 = src[i3 + 2];
      const yi = y * w + x;
      out[yi] = ((47 * r0 + 157 * g0 + 16 * b0 + 128) >> 8) + 16;
      out[yi + 1] = ((47 * r1 + 157 * g1 + 16 * b1 + 128) >> 8) + 16;
      out[yi + w] = ((47 * r2 + 157 * g2 + 16 * b2 + 128) >> 8) + 16;
      out[yi + w + 1] = ((47 * r3 + 157 * g3 + 16 * b3 + 128) >> 8) + 16;
      const r = (r0 + r1 + r2 + r3) >> 2; const g = (g0 + g1 + g2 + g3) >> 2; const b = (b0 + b1 + b2 + b3) >> 2;
      const ci = (y >> 1) * cw + (x >> 1);
      out[uOff + ci] = ((-26 * r - 87 * g + 112 * b + 128) >> 8) + 128;
      out[vOff + ci] = ((112 * r - 102 * g - 10 * b + 128) >> 8) + 128;
    }
  }
}

export function exportSupported() {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

async function pickVideoCodec(width, height, fps) {
  for (const codec of VIDEO_CODECS) {
    // 实测：多核电脑上软件编码比显卡编码更快、文件更小；核数少的电脑优先用显卡
    const cores = self.navigator?.hardwareConcurrency || 4;
    const order = cores >= 8 ? ['prefer-software', 'prefer-hardware', 'no-preference'] : ['prefer-hardware', 'prefer-software', 'no-preference'];
    for (const hardwareAcceleration of order) {
      const cfg = { codec, width, height, bitrate: 2_500_000, framerate: fps, avc: { format: 'avc' }, hardwareAcceleration };
      try {
        if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
      } catch { /* next */ }
    }
  }
  throw new Error('当前浏览器不支持 H.264 编码，请使用最新版 Chrome 或 Edge');
}

/**
 * 核心编码流程（主线程和 Worker 通用）
 * @param {object} o
 * @param {(ctx:OffscreenCanvasRenderingContext2D, t:number)=>void} o.draw
 * @param {{sampleRate:number, channels:Float32Array[]}} o.audio
 */

/** 两字节 AudioSpecificConfig，给 mp4-muxer 当 decoderConfig.description */
function makeAsc(profile, freqIdx, channels) {
  return new Uint8Array([(profile << 3) | (freqIdx >> 1), ((freqIdx & 1) << 7) | (channels << 3)]);
}

/**
 * 从 ADTS 流里拆出裸 AAC 帧。Linux 版 Chrome 没有系统 AAC 编码器，软件编码输出带 ADTS 头；
 * MP4 里要的是去头后的帧。
 */
function* iterAdtsFrames(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let off = 0;
  while (off + 7 <= u8.length) {
    if (u8[off] !== 0xFF || (u8[off + 1] & 0xF6) !== 0xF0) { off++; continue; }
    const hdr = (u8[off + 1] & 1) ? 7 : 9;
    const frameLen = ((u8[off + 3] & 0x03) << 11) | (u8[off + 4] << 3) | ((u8[off + 5] & 0xE0) >> 5);
    if (frameLen < hdr || off + frameLen > u8.length) break;
    const b2 = u8[off + 2];
    const b3 = u8[off + 3];
    yield {
      payload: u8.subarray(off + hdr, off + frameLen),
      profile: ((b2 >> 6) & 3) + 1,
      freqIdx: (b2 >> 2) & 0x0F,
      channels: ((b2 & 1) << 2) | ((b3 >> 6) & 3),
    };
    off += frameLen;
  }
}

/** 把一截 ADTS 喂给 muxer；state 用已写出的帧数算时间戳。 */
function addAdtsToMuxer(muxer, adts, sr, frameSamples, state) {
  if (!adts?.length) return;
  for (const { payload, profile, freqIdx, channels } of iterAdtsFrames(adts)) {
    if (!payload.length) continue;
    const timestamp = Math.round((state.frameIndex * frameSamples / sr) * 1e6);
    const duration = Math.round((frameSamples / sr) * 1e6);
    const chunk = new EncodedAudioChunk({ type: 'key', timestamp, duration, data: payload });
    if (!state.descSent) {
      muxer.addAudioChunk(chunk, {
        decoderConfig: { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: 2, description: makeAsc(profile, freqIdx, channels) },
      });
      state.descSent = true;
    } else {
      muxer.addAudioChunk(chunk);
    }
    state.frameIndex++;
  }
}

export async function encodeMp4({ width, height, fps, duration, draw, frameSource, audio, onProgress, signal }) {
  const vcfg = await pickVideoCodec(width, height, fps);
  const sr = audio.sampleRate;
  const acfg = { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: 2, bitrate: 160_000 };
  const aacNative = !!(await AudioEncoder.isConfigSupported(acfg).catch(() => ({}))).supported;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: sr },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { failure = e; } });
  venc.configure(vcfg);
  // Linux 版 Chrome 没有系统 AAC 编码器；这时 aenc 为空，后面改走软件编码。
  let aenc = null;
  const [L, R = L] = audio.channels;
  const total = Math.min(L.length, Math.ceil(duration * sr));
  const block = Math.floor(sr / 10);
  if (aacNative) {
    aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { failure = e; } });
    aenc.configure(acfg);
    // 音频：按 0.1 秒切块
    for (let s = 0; s < total; s += block) {
      const n = Math.min(block, total - s);
      const planar = new Float32Array(n * 2);
      planar.set(L.subarray(s, s + n), 0);
      planar.set(R.subarray(s, s + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfChannels: 2, numberOfFrames: n, timestamp: Math.round((s / sr) * 1e6), data: planar });
      aenc.encode(ad);
      ad.close();
    }
  } else {
    // 只在需要时加载约 500KB 的 FDK WASM，Windows / macOS 不会走到这里。
    const { default: createAac } = await import('/vendor/encode-aac/aac-encode.js');
    const enc = await createAac({ sampleRate: sr, channels: 2, bitrate: 160, profile: 'lc' });
    const frameSamples = enc.frameLength || 1024;
    const state = { frameIndex: 0, descSent: false };
    for (let s = 0; s < total; s += block) {
      const n = Math.min(block, total - s);
      addAdtsToMuxer(muxer, await enc.encode([L.subarray(s, s + n), R.subarray(s, s + n)]), sr, frameSamples, state);
    }
    addAdtsToMuxer(muxer, await enc.flush(), sr, frameSamples, state);
  }

  // 视频：有 frameSource 时由多个渲染子线程并行出帧；否则在本线程逐帧绘制
  let ctx = null;
  if (!frameSource) ctx = new OffscreenCanvas(width, height).getContext('2d', { alpha: false, willReadFrequently: true });
  const frames = Math.ceil(duration * fps);
  let yuv = new Uint8Array(width * height * 1.5);
  const t0 = performance.now();
  const stats = { waitFrame: 0, waitEncoder: 0, codec: vcfg.codec + '/' + vcfg.hardwareAcceleration };
  for (let i = 0; i < frames; i++) {
    if (signal?.cancelled) throw new Error('已取消');
    if (failure) throw failure;
    if (frameSource) { const a = performance.now(); yuv = await frameSource.get(i, frames); stats.waitFrame += performance.now() - a; }
    else {
      draw(ctx, i / fps);
      rgbaToI420(ctx.getImageData(0, 0, width, height).data, width, height, yuv);
    }
    const vf = new VideoFrame(yuv, {
      format: 'I420', codedWidth: width, codedHeight: height,
      timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps),
      colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    if (frameSource) frameSource.recycle(i, yuv);
    { const a = performance.now(); while (venc.encodeQueueSize > 6) await new Promise((r) => venc.addEventListener('dequeue', r, { once: true })); stats.waitEncoder += performance.now() - a; }
    if (i % 10 === 0) {
      const p = (i + 1) / frames;
      const el = (performance.now() - t0) / 1000;
      onProgress?.(p, el / p - el);
      await yieldNow();
    }
  }
  await venc.flush();
  if (aenc) await aenc.flush();
  if (failure) throw failure;
  muxer.finalize();
  onProgress?.(1, 0);
  stats.total = performance.now() - t0; stats.frames = frames;
  self.__exportStats = stats;
  return muxer.target.buffer;
}

/**
 * 主线程调用：把渲染交给 Worker
 * @param {object} o
 * @param {string} o.formUrl 形式模块地址，例如 /forms/data-card.js
 * @param {object} o.frameData 传给 drawFrame 的数据（script/tl/planData/skinId/env/fps）
 * @param {AudioBuffer} o.audioBuffer
 */
export function exportInWorker({ formUrl, frameData, width, height, fps, duration, audioBuffer, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/engine/export-worker.js', { type: 'module' });
    const channels = [0, Math.min(1, audioBuffer.numberOfChannels - 1)].map((c) => audioBuffer.getChannelData(c).slice());
    const finish = (fn, v) => { clearInterval(watch); worker.terminate(); fn(v); };
    const watch = setInterval(() => { if (signal?.cancelled) finish(reject, new Error('已取消')); }, 200);
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.p, m.left);
      else if (m.type === 'done') { globalThis.__lastExportStats = { ...m.stats, threads: m.threads }; finish(resolve, new Blob([m.buffer], { type: 'video/mp4' })); }
      else if (m.type === 'error') finish(reject, new Error(m.message));
    };
    worker.onerror = (e) => finish(reject, new Error(e.message || '导出线程出错'));
    worker.postMessage({
      formUrl, frameData, width, height, fps, duration,
      fontCss: ['/vendor/noto-sans-sc/700.css', '/vendor/noto-sans-sc/900.css', '/fonts/fusion-pixel-12/font.css'],
      audio: { sampleRate: audioBuffer.sampleRate, channels },
    }, channels.map((c) => c.buffer));
  });
}
export { rgbaToI420 };
