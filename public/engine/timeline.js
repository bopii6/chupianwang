// 时间轴 + 配音 + 混音：所有形式共用
import { renderBgm } from './music.js';

export const SAMPLE_RATE = 48000;
const START = 0.25;       // 片头留白
const LEAD = 0.3;         // 段落开始到第一句口播（让标题/转场先出来）
const GAP_COMMA = 0.1;    // 逗号结尾：几乎连着说
const GAP_STOP = 0.28;    // 句号/问号结尾：正常换气
const SECTION_TAIL = 0.25; // 段落最后一句说完，到画面切走
const SECTION_GAP = 0.15;  // 段落之间
const TAIL = 1.2;          // 片尾留白

const gapAfter = (text) => (/[，、；：,;:]$/.test(String(text).trim()) ? GAP_COMMA : GAP_STOP);

/** durations[i][j] = 第 i 段第 j 句的时长（秒） */
export function buildTimeline(script, durations) {
  let t = START;
  const sections = script.sections.map((s, i) => {
    const start = t;
    t += LEAD;
    const lines = (s.lines || []).map((text, j, arr) => {
      const d = durations?.[i]?.[j] ?? estimate(text);
      const ln = { text, start: t, end: t + d };
      t += d + (j < arr.length - 1 ? gapAfter(text) : 0);
      return ln;
    });
    if (!lines.length) { lines.push({ text: '', start: t, end: t + 2 }); t += 2; }
    const end = t + SECTION_TAIL;
    t = end + SECTION_GAP;
    return { start, end, lines };
  });
  return { sections, duration: t - SECTION_GAP + TAIL };
}

/** 没有配音时按字数估算（约 4.8 字/秒，已去掉首尾静音） */
export const estimate = (text) => Math.max(1, [...String(text)].length / 4.8);

let audioCtx;
export function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  return audioCtx;
}

/**
 * 裁掉配音首尾的静音。微软配音每句前面约 0.2 秒、后面 0.5~0.9 秒都是空白，
 * 不裁的话句与句之间会停顿 1 秒多，听着很拖。
 */
function trimSilence(ctx, buf) {
  const ch = buf.getChannelData(0);
  const th = 0.008;
  let a = 0; while (a < ch.length && Math.abs(ch[a]) < th) a++;
  let b = ch.length - 1; while (b > a && Math.abs(ch[b]) < th) b--;
  const pre = Math.floor(buf.sampleRate * 0.02); const post = Math.floor(buf.sampleRate * 0.06);
  a = Math.max(0, a - pre); b = Math.min(ch.length - 1, b + post);
  if (b - a < buf.sampleRate * 0.1) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, b - a + 1, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    d.set(buf.getChannelData(c).subarray(a, b + 1));
    // 首尾 5 毫秒淡入淡出，避免咔哒声
    const f = Math.min(240, d.length >> 2);
    for (let k = 0; k < f; k++) { d[k] *= k / f; d[d.length - 1 - k] *= k / f; }
  }
  return out;
}

/** 批量合成配音（服务端一次并发合成全部句子），返回 AudioBuffer 二维数组 */
export async function synthesize(script, { voice, rate }, onProgress) {
  const jobs = [];
  script.sections.forEach((s, i) => (s.lines || []).forEach((text, j) => jobs.push({ i, j, text })));
  const out = script.sections.map((s) => new Array((s.lines || []).length));
  onProgress?.(0, jobs.length, 'synth');
  let r;
  try {
    r = await fetch('/api/tts-batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: jobs.map((j) => j.text), voice, rate }),
      signal: AbortSignal.timeout(210000),
    });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' ? '配音等太久了（服务器没回话），再点一次重试' : (e?.message || '配音失败'));
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `配音失败 ${r.status}`);
  const ctx = getAudioCtx();
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const k = next++;
      const job = jobs[k];
      const res = await fetch(`/api/tts-file/${data.keys[k]}.mp3`);
      if (!res.ok) throw new Error(`配音文件丢失 ${res.status}`);
      out[job.i][job.j] = trimSilence(ctx, await ctx.decodeAudioData(await res.arrayBuffer()));
      onProgress?.(++done, jobs.length, 'load');
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

/** 把每句配音按时间轴拼成一条人声音轨 */
export async function mixAudio(tl, buffers) {
  const len = Math.ceil(tl.duration * SAMPLE_RATE);
  const off = new OfflineAudioContext(2, len, SAMPLE_RATE);
  tl.sections.forEach((sec, i) => sec.lines.forEach((ln, j) => {
    const b = buffers[i]?.[j];
    if (!b) return;
    const src = off.createBufferSource();
    src.buffer = b;
    src.connect(off.destination);
    src.start(ln.start);
  }));
  return off.startRendering();
}

const BGM_LEVEL = { low: 0.6, mid: 1, high: 1.45 };

/**
 * 人声 + 背景音乐。音乐在有人说话时自动压低（闪避），句子间隙稍微抬起来，片头片尾淡入淡出。
 * @param {AudioBuffer} voice 人声音轨
 * @param {{style:string, volume:'low'|'mid'|'high'}} bgm
 */
export async function mixWithBgm(voice, bgm) {
  const sr = voice.sampleRate; const dur = voice.duration;
  const off = new OfflineAudioContext(2, voice.length, sr);
  // 限幅器：防止人声提响后破音
  const limiter = off.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  limiter.connect(off.destination);
  // 人声响度标准化：说话部分 RMS 拉到约 -19 dBFS（手机外放清楚）
  const ch = voice.getChannelData(0);
  let sum = 0; let cnt = 0;
  for (let k = 0; k < ch.length; k += 8) { const x = ch[k]; if (Math.abs(x) > 0.01) { sum += x * x; cnt++; } }
  const vRms = cnt ? Math.sqrt(sum / cnt) : 0.1;
  const vGain = Math.min(4, 0.112 / vRms);
  const v = off.createBufferSource(); v.buffer = voice;
  const vg = off.createGain(); vg.gain.value = vGain;
  v.connect(vg).connect(limiter); v.start(0);

  if (bgm && bgm.style && bgm.style !== 'none') {
    const music = await renderBgm(bgm.style, dur, sr);
    const m = off.createBufferSource(); m.buffer = music;
    const g = off.createGain();
    // 闪避曲线：说话时音乐比人声低约 15 dB，句子之间抬回来一些
    const step = 0.05; const n = Math.ceil(dur / step) + 1;
    const per = Math.floor(sr * step);
    const level = BGM_LEVEL[bgm.volume] ?? 1;
    const curve = new Float32Array(n);
    let cur = 0.68;
    for (let i = 0; i < n; i++) {
      let peak = 0;
      for (let k = i * per; k < Math.min(ch.length, (i + 1) * per); k += 8) peak = Math.max(peak, Math.abs(ch[k]));
      const target = peak > 0.02 ? 0.3 : 0.68;
      cur += (target - cur) * (target < cur ? 0.6 : 0.12); // 压得快、回得慢
      const tsec = i * step;
      const fade = Math.min(1, tsec / 1.2, Math.max(0, (dur - tsec) / 1.8));
      curve[i] = cur * level * fade;
    }
    g.gain.setValueCurveAtTime(curve, 0, dur);
    m.connect(g).connect(limiter); m.start(0);
  }
  return off.startRendering();
}

/** 每帧音量包络，驱动语音条跳动（只用人声算） */
export function envelope(buffer, fps = 30) {
  const data = buffer.getChannelData(0);
  const per = Math.floor(buffer.sampleRate / fps);
  const n = Math.ceil(data.length / per);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const s = f * per; const e = Math.min(data.length, s + per);
    for (let k = s; k < e; k += 4) sum += data[k] * data[k];
    env[f] = Math.sqrt(sum / Math.max(1, (e - s) / 4));
  }
  const voiced = Array.from(env).filter((v) => v > 0.005).sort((a, b) => a - b);
  const ref = voiced.length ? voiced[Math.floor(voiced.length * 0.9)] : 1;
  for (let f = 0; f < n; f++) env[f] = Math.min(1, Math.sqrt(env[f] / ref));
  for (let f = 1; f < n; f++) env[f] = Math.max(env[f], env[f - 1] * 0.82);
  return env;
}
