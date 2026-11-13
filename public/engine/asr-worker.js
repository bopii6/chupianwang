// 视频转文字（在客户电脑的浏览器里跑，不占服务器）
// 默认 Whisper base 量化版（约 77MB，第一次用时下载，之后浏览器会缓存）。
// small 更准但慢约 2.5 倍、模型 250MB；改写时 AI 会按上下文纠正错别字，所以默认用 base
import { pipeline, env } from '/vendor/transformers/transformers.js';
import { Converter } from '/vendor/opencc/t2cn.js';

const toSimplified = Converter({ from: 't', to: 'cn' });
const SR = 16000;
let asrPromise = null;

function loadModel({ base, model = 'whisper-base', device = 'wasm', dtype }, post) {
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = base; // 本机路径或 CDN 地址都可以
  env.backends.onnx.wasm.wasmPaths = {
    mjs: '/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs',
    wasm: '/vendor/ort/ort-wasm-simd-threaded.asyncify.wasm',
  };
  // 多线程需要页面开启跨源隔离；没开就单线程（慢一些但能用）
  env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)) : 1;
  const files = {};
  return pipeline('automatic-speech-recognition', 'onnx-community/' + model, {
    device,
    dtype: dtype || (device === 'webgpu' ? { encoder_model: 'fp16', decoder_model_merged: 'q4' } : { encoder_model: 'q8', decoder_model_merged: 'q8' }),
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      const v = Object.values(files);
      post({ type: 'progress', stage: 'download', loaded: v.reduce((a, x) => a + x[0], 0), total: v.reduce((a, x) => a + x[1], 0) });
    },
  });
}

// 按停顿切成不超过 28 秒的段：在 20–28 秒之间找最安静的 0.1 秒切开，避免把一个字切成两半
function splitAudio(audio) {
  const frame = SR / 10;
  const rms = (s) => { let e = 0; const end = Math.min(audio.length, s + frame); for (let i = s; i < end; i++) e += audio[i] * audio[i]; return Math.sqrt(e / Math.max(1, end - s)); };
  const segs = [];
  let start = 0;
  while (audio.length - start > 28 * SR) {
    let best = start + 28 * SR; let bestE = Infinity;
    for (let s = start + 20 * SR; s <= start + 28 * SR - frame; s += frame) {
      const e = rms(s);
      if (e < bestE) { bestE = e; best = s + frame / 2; }
    }
    segs.push(audio.subarray(start, best));
    start = best;
  }
  if (audio.length - start > SR / 2) segs.push(audio.subarray(start));
  return segs;
}
const loudness = (a) => { let e = 0; for (let i = 0; i < a.length; i += 4) e += a[i] * a[i]; return Math.sqrt(e / (a.length / 4)); };

// Whisper 在静音、纯音乐处常“脑补”出的字幕组口播
const HALLUCINATION = /(字幕|subtitles?|amara|请不吝点赞|订阅.{0,4}转发|打赏支持|明镜与点点|感谢观看|谢谢观看|thank you for watching)/i;

function tidy(t) {
  return toSimplified(t)
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
    .replace(/,/g, '，').replace(/\?/g, '？').replace(/!/g, '！').replace(/;/g, '；').replace(/:/g, '：').replace(/\./g, '。')
    .replace(/\u0000/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/(?<=[一-鿿，。？！；：]) | (?=[一-鿿，。？！；：])/g, '')
    .trim();
}

self.onmessage = async ({ data }) => {
  const post = (m) => self.postMessage({ id: data.id, ...m });
  try {
    asrPromise ||= loadModel(data, post);
    const asr = await asrPromise.catch((e) => { asrPromise = null; throw e; });
    const segs = splitAudio(data.audio);
    const parts = [];
    for (let i = 0; i < segs.length; i++) {
      post({ type: 'progress', stage: 'listen', done: i, total: segs.length });
      if (loudness(segs[i]) < 0.004) continue; // 基本没声音
      const r = await asr(segs[i], { language: 'chinese', task: 'transcribe' });
      const t = tidy(r.text || '');
      if (t && !HALLUCINATION.test(t)) parts.push(t);
    }
    const text = parts.map((p) => (/[。？！…]$/.test(p) ? p : p + '，')).join('').replace(/，$/, '。');
    post({ type: 'done', text });
  } catch (e) {
    post({ type: 'error', message: String(e?.message || e) });
  }
};
