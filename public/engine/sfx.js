// 音效库：全部现场合成（没有版权问题），转场、弹出、画面出现时用。
// 用法：模板给出 [{t, kind, gain}]，addSfx 把它们混进成片声音里。
const cache = new Map();

/** 白噪声 */
function noiseBuffer(ctx, sec) {
  const b = ctx.createBuffer(1, Math.ceil(sec * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0); let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  return b;
}
const env = (g, t0, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); };

// 每种音效：时长 + 合成函数（在 OfflineAudioContext 里搭电路）
const RECIPES = {
  // 呼——：带通噪声，频率从低扫到高再回落
  whoosh: [0.55, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.6);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(3200, 0.28); f.frequency.exponentialRampToValueAtTime(900, 0.55);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, 0.22); g.gain.exponentialRampToValueAtTime(0.0001, 0.55);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 短促的“嗖”
  swish: [0.25, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.3);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(1200, 0); f.frequency.exponentialRampToValueAtTime(6000, 0.2);
    const g = c.createGain(); env(g, 0, 0.04, 0.7, 0.2);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 重击：低频下潜 + 一下噪声
  impact: [0.9, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, 0); o.frequency.exponentialRampToValueAtTime(38, 0.5);
    const g = c.createGain(); env(g, 0, 0.005, 1, 0.85);
    o.connect(g).connect(c.destination); o.start(); o.stop(0.9);
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.2);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
    const g2 = c.createGain(); env(g2, 0, 0.002, 0.6, 0.15);
    n.connect(f).connect(g2).connect(c.destination); n.start();
  }],
  // 电影低音“咚——”
  boom: [2.2, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, 0); o.frequency.exponentialRampToValueAtTime(32, 1.8);
    const g = c.createGain(); env(g, 0, 0.02, 1, 2.1);
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 2.2);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, 0); f.frequency.exponentialRampToValueAtTime(80, 1.5);
    const g2 = c.createGain(); env(g2, 0, 0.01, 0.35, 1.6);
    o.connect(g).connect(c.destination); n.connect(f).connect(g2).connect(c.destination); o.start(); o.stop(2.2); n.start();
  }],
  // 啵：气泡弹出
  pop: [0.16, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(900, 0); o.frequency.exponentialRampToValueAtTime(260, 0.08);
    const g = c.createGain(); env(g, 0, 0.003, 0.8, 0.12);
    o.connect(g).connect(c.destination); o.start(); o.stop(0.16);
  }],
  // 嗒：短促点击
  click: [0.06, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.06);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3500; f.Q.value = 4;
    const g = c.createGain(); env(g, 0, 0.001, 1, 0.04);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 叮：铃声（几个泛音一起衰减）
  ding: [1.4, (c) => {
    [[1318, 0.6], [2637, 0.25], [3950, 0.12]].forEach(([fq, a]) => {
      const o = c.createOscillator(); o.frequency.value = fq; const g = c.createGain(); env(g, 0, 0.004, a, 1.3);
      o.connect(g).connect(c.destination); o.start(); o.stop(1.4);
    });
  }],
  // 闪闪：一串上行的小铃
  sparkle: [0.9, (c) => {
    [2093, 2637, 3136, 4186].forEach((fq, k) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fq; const g = c.createGain(); env(g, k * 0.06, 0.004, 0.35, 0.5);
      o.connect(g).connect(c.destination); o.start(k * 0.06); o.stop(0.9);
    });
  }],
  // 咔嚓：相机快门（两下）
  shutter: [0.3, (c) => {
    [0, 0.09].forEach((t0, k) => {
      const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.08);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = k ? 2200 : 4200; f.Q.value = 2;
      const g = c.createGain(); env(g, t0, 0.001, 0.9, 0.06);
      n.connect(f).connect(g).connect(c.destination); n.start(t0);
    });
  }],
  // 沙沙：电视雪花 / 录像带
  static: [0.45, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.5);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 800;
    const g = c.createGain(); g.gain.setValueAtTime(0.5, 0);
    for (let k = 0; k < 9; k++) g.gain.setValueAtTime(k % 2 ? 0.08 : 0.55, k * 0.045);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.45);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 嘀：摄像机提示音
  beep: [0.35, (c) => {
    [0, 0.16].forEach((t0) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2000; const g = c.createGain(); env(g, t0, 0.002, 0.18, 0.1); o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + 0.14); });
  }],
  // 叮咚：新闻开场提示
  sting: [1.3, (c) => {
    [[880, 0], [1318, 0.18], [1760, 0.36]].forEach(([fq, t0]) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fq; const g = c.createGain(); env(g, t0, 0.005, 0.5, 0.8);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(1.3);
    });
  }],
  // 蓄力：噪声 + 上扬的音
  riser: [1.0, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 1);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(7000, 0.95);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, 0.9); g.gain.exponentialRampToValueAtTime(0.0001, 1);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 嘣~：卡通弹簧
  boing: [0.5, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; const lfo = c.createOscillator(); lfo.frequency.value = 22; const lg = c.createGain(); lg.gain.value = 60;
    o.frequency.setValueAtTime(220, 0); o.frequency.exponentialRampToValueAtTime(520, 0.4);
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain(); env(g, 0, 0.01, 0.6, 0.45);
    o.connect(g).connect(c.destination); o.start(); lfo.start(); o.stop(0.5); lfo.stop(0.5);
  }],
  // 翻页：纸张摩擦
  paper: [0.35, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.4);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(2500, 0); f.frequency.exponentialRampToValueAtTime(5000, 0.3);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.5, 0.08); g.gain.exponentialRampToValueAtTime(0.2, 0.18); g.gain.exponentialRampToValueAtTime(0.0001, 0.35);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 打字机：一下按键
  key: [0.05, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.05);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 6;
    const g = c.createGain(); env(g, 0, 0.001, 0.8, 0.035);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // ---- 新版式用的 ----
  // 消息提示：两声短促的“嘟嘟”（聊天、动态）
  msg: [0.32, (c) => {
    [[1046, 0], [1568, 0.09]].forEach(([fq, t0]) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; const g = c.createGain(); env(g, t0, 0.004, 0.45, 0.16); o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + 0.22); });
  }],
  // 风铃：几个高音随机错开（国风、美术馆）
  chime: [1.8, (c) => {
    [[2349, 0], [3136, 0.07], [2637, 0.15], [3520, 0.24]].forEach(([fq, t0]) => {
      [[1, 0.3], [2.4, 0.06]].forEach(([k, a]) => { const o = c.createOscillator(); o.frequency.value = fq * k; const g = c.createGain(); env(g, t0, 0.003, a, 1.4); o.connect(g).connect(c.destination); o.start(t0); o.stop(1.8); });
    });
  }],
  // 撕胶带
  tape: [0.4, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.4);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(1500, 0); f.frequency.linearRampToValueAtTime(3800, 0.3);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0);
    for (let k = 0; k < 14; k++) g.gain.setValueAtTime(k % 2 ? 0.15 : 0.55, k * 0.022);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.38);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 划走卡片：短“唰” + 轻轻一下
  swipe: [0.3, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.3);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(5000, 0); f.frequency.exponentialRampToValueAtTime(1200, 0.18);
    const g = c.createGain(); env(g, 0, 0.01, 0.6, 0.18);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 点赞爱心：往上滑的“啵”
  heart: [0.3, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(500, 0); o.frequency.exponentialRampToValueAtTime(1400, 0.12);
    const g = c.createGain(); env(g, 0, 0.004, 0.6, 0.22);
    o.connect(g).connect(c.destination); o.start(); o.stop(0.3);
  }],
  // 老电视换台：咔哒 + 一小段雪花
  channel: [0.35, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.35);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = c.createGain(); g.gain.setValueAtTime(1, 0); g.gain.exponentialRampToValueAtTime(0.05, 0.012); g.gain.setValueAtTime(0.35, 0.04); g.gain.exponentialRampToValueAtTime(0.0001, 0.33);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 响指
  snap: [0.12, (c) => {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.12);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.4;
    const g = c.createGain(); env(g, 0, 0.001, 1, 0.08);
    n.connect(f).connect(g).connect(c.destination); n.start();
  }],
  // 闷响：盖章、落地
  thud: [0.4, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(50, 0.2);
    const g = c.createGain(); env(g, 0, 0.003, 0.9, 0.3);
    o.connect(g).connect(c.destination); o.start(); o.stop(0.4);
  }],
  // 电流“滋”：故障风
  zap: [0.25, (c) => {
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1800, 0); o.frequency.exponentialRampToValueAtTime(120, 0.2);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
    const g = c.createGain(); env(g, 0, 0.002, 0.25, 0.2);
    o.connect(f).connect(g).connect(c.destination); o.start(); o.stop(0.25);
  }],
  // 鼓点：重低音“咚”，卡点切换用
  kick: [0.35, (c) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, 0); o.frequency.exponentialRampToValueAtTime(45, 0.12);
    const g = c.createGain(); env(g, 0, 0.002, 1, 0.3);
    o.connect(g).connect(c.destination); o.start(); o.stop(0.35);
  }],
};
export const SFX_KINDS = Object.keys(RECIPES);

async function render(kind, sr) {
  const key = kind + '@' + sr;
  if (!cache.has(key)) {
    const [dur, build] = RECIPES[kind];
    const c = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
    build(c);
    cache.set(key, c.startRendering());
  }
  return cache.get(key);
}

/**
 * 把音效混进成片声音
 * @param {AudioBuffer} master 人声 + 背景音乐
 * @param {{t:number, kind:string, gain?:number}[]} cues
 */
export async function addSfx(master, cues) {
  const list = (cues || []).filter((c) => RECIPES[c.kind] && c.t >= 0 && c.t < master.duration);
  if (!list.length) return master;
  const sr = master.sampleRate;
  const bufs = new Map();
  await Promise.all([...new Set(list.map((c) => c.kind))].map(async (k) => bufs.set(k, await render(k, sr))));
  const off = new OfflineAudioContext(2, master.length, sr);
  // 最后一道限幅：人声 + 音乐 + 音效叠在一起也不破音
  const lim = off.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  lim.connect(off.destination);
  const m = off.createBufferSource(); m.buffer = master; m.connect(lim); m.start(0);
  const bus = off.createGain(); bus.gain.value = 0.5; // 音效整体比人声低，不抢话
  bus.connect(lim);
  for (const c of list) {
    const s = off.createBufferSource(); s.buffer = bufs.get(c.kind);
    const g = off.createGain(); g.gain.value = c.gain ?? 1;
    s.connect(g).connect(bus); s.start(c.t);
  }
  return off.startRendering();
}
