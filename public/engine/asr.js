// 视频 → 文字：浏览器里拆出音轨（16kHz 单声道），交给后台线程里的 Whisper
let worker = null;
let seq = 0;
const jobs = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id); if (!job) return;
    if (data.type === 'progress') job.onProgress?.(data);
    else { jobs.delete(data.id); data.type === 'done' ? job.resolve(data.text) : job.reject(new Error(data.message)); }
  };
  worker.onerror = (e) => {
    for (const j of jobs.values()) j.reject(new Error('转文字模块加载失败：' + (e.message || '请刷新页面重试')));
    jobs.clear(); worker = null;
  };
  return worker;
}

const MAX_MINUTES = 15;

// 快路：MP4/MOV 用 mp4box 拆出音轨 + WebCodecs 硬件解码（2 分钟视频约 1 秒）
async function decodeMp4(file) {
  if (typeof AudioDecoder === 'undefined') throw new Error('no-webcodecs');
  const { createFile, MP4BoxBuffer } = await import('/vendor/mp4box/mp4box.all.mjs');
  const mp4 = createFile();
  let info = null; let track = null;
  const samples = [];
  mp4.onError = () => {};
  mp4.onSamples = (_id, _u, list) => { for (const s of list) samples.push(s); };
  mp4.onReady = (i) => {
    info = i; track = i.audioTracks?.[0];
    if (track) { mp4.setExtractionOptions(track.id, null, { nbSamples: 500 }); mp4.start(); }
  };
  const CH = 16 << 20;
  for (let off = 0; off < file.size; off += CH) {
    mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(await file.slice(off, off + CH).arrayBuffer(), off));
  }
  mp4.flush();
  if (!info) throw new Error('not-mp4');
  if (!track) throw Object.assign(new Error('这个视频里没有声音'), { final: true });
  if (!samples.length) throw new Error('no-samples');
  const entry = mp4.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0];
  const dsi = entry.esds?.esd?.descs?.[0]?.descs?.[0]?.data;
  const sr = track.audio.sample_rate; const ch = track.audio.channel_count;
  const cfg = { codec: track.codec, sampleRate: sr, numberOfChannels: ch, ...(dsi ? { description: dsi } : {}) };
  if (!(await AudioDecoder.isConfigSupported(cfg)).supported) throw new Error('codec');

  const parts = []; let total = 0; let fail = null;
  const dec = new AudioDecoder({
    output: (ad) => {
      const n = ad.numberOfFrames; const mono = new Float32Array(n); const tmp = new Float32Array(n);
      for (let c = 0; c < ad.numberOfChannels; c++) {
        ad.copyTo(tmp, { planeIndex: c, format: 'f32-planar' });
        for (let i = 0; i < n; i++) mono[i] += tmp[i] / ad.numberOfChannels;
      }
      parts.push(mono); total += n; ad.close();
    },
    error: (e) => { fail = e; },
  });
  dec.configure(cfg);
  for (const s of samples) dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: (s.cts * 1e6) / s.timescale, duration: (s.duration * 1e6) / s.timescale, data: s.data }));
  await dec.flush(); dec.close();
  if (fail || !total) throw new Error('decode');
  // 重采样到 16kHz（浏览器自带的高质量重采样）
  const buf = new AudioBuffer({ length: total, sampleRate: sr, numberOfChannels: 1 });
  let o = 0; for (const p of parts) { buf.copyToChannel(p, 0, o); o += p.length; }
  const off = new OfflineAudioContext(1, Math.ceil((total * 16000) / sr), 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

// 慢路：浏览器自带解码（兼容 WebM、MP3 等，MP4 大文件会慢）
async function decodeGeneric(file) {
  const ab = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await file.arrayBuffer()); // 自动重采样到 16kHz
  let audio = ab.getChannelData(0);
  if (ab.numberOfChannels > 1) {
    audio = new Float32Array(audio);
    for (let c = 1; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < audio.length; i++) audio[i] += d[i]; }
    for (let i = 0; i < audio.length; i++) audio[i] /= ab.numberOfChannels;
  }
  return audio;
}

export async function decodeAudio(file) {
  if (file.size > 2e9) throw new Error('视频太大了（超过 2GB），剪短一点再传');
  let audio;
  try {
    audio = await decodeMp4(file);
  } catch (e) {
    if (e.final) throw e;
    try { audio = await decodeGeneric(file); } catch { throw new Error('读不出这个视频的声音。换成 MP4 格式，或者确认视频里有人说话'); }
  }
  const duration = audio.length / 16000;
  if (duration < 3) throw new Error('这个视频太短了，没听到说话');
  if (duration > MAX_MINUTES * 60) throw new Error(`视频超过 ${MAX_MINUTES} 分钟了，剪出最精彩的一段再传`);
  return { audio, duration };
}

/** onProgress({stage:'decode'|'download'|'listen', ...}) */
export async function transcribe(file, opts = {}) {
  opts.onProgress?.({ stage: 'decode' });
  const { audio } = await decodeAudio(file);
  return transcribeAudio(audio, opts);
}

/** 16 位 PCM ↔ Float32（手机扫码上传时只传 16 位音频，体积减半） */
export const toPcm16 = (f32) => { const o = new Int16Array(f32.length); for (let i = 0; i < f32.length; i++) { const v = Math.max(-1, Math.min(1, f32[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
export const fromPcm16 = (buf) => { const a = new Int16Array(buf); const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] / 0x8000; return o; };

/** audio：16kHz 单声道 Float32Array */
export async function transcribeAudio(audio, { base = '/models/asr/', model, device, dtype, onProgress } = {}) {
  const duration = audio.length / 16000;
  const id = ++seq;
  const text = await new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress });
    const copy = new Float32Array(audio); // 解码结果可能被音频引擎持有，复制一份再转交
    getWorker().postMessage({ id, base, model, device, dtype, audio: copy }, [copy.buffer]);
  });
  if (text.replace(/[\s，。？！]/g, '').length < 10) throw new Error('没听清视频里说了什么。要有人说话的视频才能复刻');
  return { text, duration };
}
