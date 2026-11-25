// 原创背景音乐生成器（v2）：自动作曲 + 合成器演奏，全部现场生成，没有任何版权问题。
// 结构：前奏 2 小节 → [主歌 A 8 小节 → 副歌 B 8 小节 → 主歌 A' 8 小节 → 间奏 C 8 小节] 循环。
// 乐器：钢琴、拨弦吉他（Karplus-Strong 物理建模）、钟琴、弦乐铺底、合成器拨弦、方波芯片音、完整鼓组和过门。
export const BGM_STYLES = {
  chip: { name: '像素轻快', desc: '8-bit 小游戏风，俏皮活泼', bpm: 112 },
  pop: { name: '活力流行', desc: '吉他+拍手，明亮有劲，适合招生获客', bpm: 116 },
  edm: { name: '燃炸电音', desc: '蓄力→爆发，128 拍，高燃开场', bpm: 128, fast: true },
  phonk: { name: '飙车 Phonk', desc: '牛铃+重低音，140 拍，酷炫卡点', bpm: 140, fast: true },
  rock: { name: '热血摇滚', desc: '失真吉他+鼓，150 拍，闭眼冲', bpm: 150, fast: true },
  warm: { name: '温暖钢琴', desc: '钢琴+木吉他+弦乐，轻松治愈', bpm: 80 },
  tech: { name: '科技律动', desc: '电子律动，适合讲数据讲趋势', bpm: 100 },
  story: { name: '悬念纪录', desc: '小调+钟表声，适合讲真相讲误区', bpm: 76 },
  lofi: { name: '松弛 Lo-fi', desc: '电钢琴+黑胶底噪，慵懒放松，适合日常记录', bpm: 82 },
  house: { name: '律动浩室', desc: '四四拍底鼓+钢琴和弦，时髦有律动', bpm: 122 },
  citypop: { name: '复古 City Pop', desc: '七和弦+跳跃贝斯，港风复古', bpm: 108 },
  uke: { name: '清新尤克里里', desc: '尤克里里+口哨+拍手，明亮轻快', bpm: 120 },
  guofeng: { name: '国风古韵', desc: '五声音阶拨弦+笛子+鼓，雅致有韵味', bpm: 86 },
  none: { name: '不要音乐', desc: '只保留人声' },
};

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// 和弦：根音 MIDI + 大/小三和弦
const CH = {
  C: [60, 'M'], Dm: [62, 'm'], Em: [52, 'm'], E: [52, 'M'], F: [53, 'M'], G: [55, 'M'], Am: [57, 'm'],
  Cmaj7: [60, 'M7'], Fmaj7: [53, 'M7'], Dm7: [62, 'm7'], Em7: [52, 'm7'], Am7: [57, 'm7'], G7: [55, '7'], Gsus: [55, 's'],
};
const Q = { M: [4, 7], m: [3, 7], M7: [4, 7, 11], m7: [3, 7, 10], 7: [4, 7, 10], s: [5, 7] };
const triad = (name) => { const [r, q] = CH[name]; return [r, ...Q[q].map((iv) => r + iv)]; };

const PROGS = {
  chip: { A: ['C', 'G', 'Am', 'F'], B: ['F', 'G', 'Em', 'Am'], C: ['Am', 'F', 'C', 'G'] },
  pop: { A: ['C', 'Am', 'F', 'G'], B: ['F', 'G', 'C', 'Am'], C: ['Am', 'F', 'C', 'G'] },
  warm: { A: ['F', 'G', 'Em', 'Am'], B: ['Dm', 'G', 'C', 'Am'], C: ['F', 'Em', 'Dm', 'G'] },
  tech: { A: ['Am', 'F', 'C', 'G'], B: ['Am', 'F', 'C', 'G'], C: ['F', 'G', 'Am', 'Am'] },
  story: { A: ['Am', 'Am', 'F', 'E'], B: ['Dm', 'Am', 'E', 'Am'], C: ['F', 'G', 'Am', 'E'] },
  edm: { A: ['Am', 'F', 'C', 'G'], B: ['Am', 'F', 'C', 'G'], C: ['F', 'G', 'Am', 'G'] },
  phonk: { A: ['Am', 'Am', 'Dm', 'E'], B: ['Am', 'F', 'Dm', 'E'], C: ['F', 'F', 'E', 'E'] },
  rock: { A: ['Am', 'F', 'C', 'G'], B: ['F', 'C', 'G', 'Am'], C: ['F', 'G', 'Am', 'G'] },
  lofi: { A: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], B: ['Dm7', 'G7', 'Cmaj7', 'Am7'], C: ['Fmaj7', 'Fmaj7', 'Em7', 'Am7'] },
  house: { A: ['Am7', 'Fmaj7', 'Cmaj7', 'G'], B: ['Fmaj7', 'G', 'Em7', 'Am7'], C: ['Dm7', 'Em7', 'Fmaj7', 'G'] },
  citypop: { A: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], B: ['Fmaj7', 'G7', 'Em7', 'Am7'], C: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'] },
  uke: { A: ['C', 'G', 'Am', 'F'], B: ['F', 'C', 'G', 'C'], C: ['Am', 'F', 'C', 'G'] },
  guofeng: { A: ['C', 'Am', 'Dm', 'G'], B: ['F', 'G', 'Em', 'Am'], C: ['Am', 'G', 'F', 'C'] },
};
// 同一种风格的不同“版本”：换调、换速度、换旋律（写成 'pop@3'），每套版式的歌听起来都不一样
const VARIANTS = [
  { tr: 0, bs: 1 }, { tr: 2, bs: 1.04 }, { tr: -3, bs: 0.95 }, { tr: 5, bs: 1 }, { tr: -2, bs: 1.07 },
  { tr: 3, bs: 0.93 }, { tr: -5, bs: 1.03 }, { tr: 1, bs: 0.97 }, { tr: -1, bs: 1.05 },
];
/** 'pop@3' → { base:'pop', v:3 } */
export function parseBgm(style) {
  const [base, v] = String(style || '').split('@');
  return { base, v: Math.max(0, Math.min(VARIANTS.length - 1, Number(v) || 0)) };
}
/** 这首歌每分钟几拍（卡点剪辑按这个算） */
export function bgmTempo(style) {
  const { base, v } = parseBgm(style);
  const b = BGM_STYLES[base]?.bpm; if (!b) return 0;
  return b * VARIANTS[v].bs;
}
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [9, 11, 0, 2, 4, 5, 7, 8]; // A 小调（含升 G，配 E 大三和弦）
const PENTA = [0, 2, 4, 7, 9]; // 五声音阶：宫商角徵羽

const INTRO_BARS = 2;
// 段落顺序：快歌是“主歌 → 蓄力 → 爆发 → 爆发变奏”
const ORDERS = { edm: ['A', 'C', 'B', 'B2'], phonk: ['A', 'B', 'C', 'B2'], rock: ['A', 'B', 'A2', 'B2'], house: ['A', 'B', 'C', 'B2'] };
const DEFAULT_ORDER = ['A', 'B', 'A2', 'C'];
const SEC_BARS = 8;
const LOOP_BARS = 4 * SEC_BARS;
const FAST = new Set(['edm', 'phonk', 'rock']);

// ---------------------------------------------------------------------
// 作曲：旋律按乐理生成——强拍落和弦音，弱拍走音阶级进，动机重复再变奏
// ---------------------------------------------------------------------
const RHYTHMS = [
  [1, 0.5, 0.5, 1, 1, 2, 2],
  [0.5, 0.5, 1, 0.5, 0.5, 1, 1, 1, 2],
  [1.5, 0.5, 1, 1, 1.5, 0.5, 2],
  [1, 1, 0.5, 0.5, 1, 2, 2],
  [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 2],
  [2, 1, 1, 1.5, 0.5, 2],
];
function composeMelody(chords8, rand, { low, high, scale, sparse = 0 }) {
  const pcs = new Set(scale);
  const r1 = RHYTHMS[Math.floor(rand() * RHYTHMS.length)];
  const r2 = RHYTHMS[Math.floor(rand() * RHYTHMS.length)];
  const r3 = RHYTHMS[Math.floor(rand() * RHYTHMS.length)];
  const plan = [r1, r2, r1, r3];
  const notes = [];
  let prev = Math.round((low + high) / 2);
  const inRange = (m) => m >= low && m <= high;
  plan.forEach((rh, p) => {
    let beat = p * 8;
    rh.forEach((d, i) => {
      const bar = Math.min(7, Math.floor(beat / 4));
      const chordPcs = chords8[bar].map((m) => m % 12);
      const last = i === rh.length - 1;
      const strong = Math.abs(beat % 2) < 1e-6;
      let cands = [];
      for (let m = low; m <= high; m++) {
        const pc = m % 12;
        if (strong || last ? chordPcs.includes(pc) : pcs.has(pc) || chordPcs.includes(pc)) cands.push(m);
      }
      if (last) cands = cands.filter((m) => m % 12 === chordPcs[0] || m % 12 === chordPcs[1]);
      const step = (rand() < 0.5 ? -1 : 1) * (rand() < 0.7 ? 2 : 4);
      const target = prev + (last ? 0 : step);
      let best = cands[0] ?? prev; let bd = 1e9;
      for (const m of cands) { const dd = Math.abs(m - target) + (m === prev && !last ? 1.5 : 0); if (dd < bd) { bd = dd; best = m; } }
      const rest = sparse && i > 0 && !last && rand() < sparse;
      if (!rest && inRange(best)) notes.push({ t: beat, d: d * 0.92, m: best });
      if (!rest) prev = best;
      beat += d;
    });
  });
  return notes;
}

// Karplus-Strong 拨弦：用一小段噪声在延迟线里循环衰减，得到很真实的吉他/竖琴音色
const ksCache = new Map();
/** 每个音高只算一次，做成 AudioBuffer 全局共用（AudioBuffer 可以跨多个音频上下文使用） */
function ksBuffer(m, sr) {
  const key = m + '|' + sr;
  if (ksCache.has(key)) return ksCache.get(key);
  const N = Math.max(2, Math.round(sr / hz(m)));
  const len = Math.floor(sr * 1.6);
  const out = new Float32Array(len);
  const line = new Float32Array(N);
  let seed = m * 7919;
  for (let i = 0; i < N; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; line[i] = (seed / 4294967296) * 2 - 1; }
  for (let i = 1; i < N; i++) line[i] = 0.5 * (line[i] + line[i - 1]); // 初始噪声先柔化，音色更暖
  const damp = 0.996 - Math.max(0, m - 60) * 0.0004;
  let idx = 0;
  for (let n = 0; n < len; n++) {
    const a = line[idx]; const b = line[(idx + 1) % N];
    out[n] = a;
    line[idx] = 0.5 * (a + b) * damp;
    idx = (idx + 1) % N;
  }
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  buf.copyToChannel(out, 0);
  ksCache.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------
const cache = new Map();

/** 生成指定时长的背景音乐：每种风格只合成一次（前奏 + 32 小节循环），之后按长度拼接，接缝交叉淡化 */
export async function renderBgm(style, duration, sampleRate = 48000) {
  const key = style + '|' + sampleRate;
  if (!cache.has(key)) cache.set(key, renderSegment(style, sampleRate));
  const job = cache.get(key);
  cache.delete(key); cache.set(key, job); // 最近用过的排到最后
  while (cache.size > 6) cache.delete(cache.keys().next().value); // 每首一两分钟的音频占几十兆，只留最近 6 首
  const { buf, introLen, loopLen } = await job;
  const len = Math.ceil(duration * sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate });
  const xf = Math.floor(sampleRate * 0.04);
  for (let c = 0; c < 2; c++) {
    const src = buf.getChannelData(c); const dst = out.getChannelData(c);
    dst.set(src.subarray(0, Math.min(len, introLen)));
    let pos = introLen;
    while (pos < len) {
      const n = Math.min(loopLen, len - pos);
      for (let k = 0; k < n; k++) {
        const v = src[introLen + k];
        dst[pos + k] = k < xf && pos > introLen ? src[introLen + loopLen + k] * (1 - k / xf) + v * (k / xf) : v;
      }
      pos += loopLen;
    }
  }
  return out;
}

async function renderSegment(styleKey, sr) {
  const { base: style, v } = parseBgm(styleKey);
  if (!PROGS[style]) throw new Error('未知的音乐风格');
  const { tr } = VARIANTS[v];
  const bpm = bgmTempo(styleKey);
  const beat = 60 / bpm; const bar = beat * 4;
  const rand = rng(style.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + v * 7919);
  const minor = style === 'story' || style === 'phonk';
  const SECTIONS = ORDERS[style] || DEFAULT_ORDER;
  const scale = style === 'guofeng' ? PENTA : minor ? MINOR : MAJOR;
  const hzT = (m) => hz(m + tr); // 换调：所有音高一起挪
  const prog = PROGS[style];
  const chordsOf = (sec) => { const p = prog[sec === 'A2' ? 'A' : sec === 'B2' ? 'B' : sec]; return [...p, ...p].map(triad); };

  // 旋律：A 和 A' 共用一条（A' 最后一句变奏），B 更高更密，C 稀疏
  const melA = composeMelody(chordsOf('A'), rand, { low: 67, high: 81, scale, sparse: 0.1 });
  const melA2 = melA.map((n) => ({ ...n }));
  const tailA2 = composeMelody(chordsOf('A'), rand, { low: 67, high: 81, scale, sparse: 0.1 }).filter((n) => n.t >= 24);
  const melAv = [...melA2.filter((n) => n.t < 24), ...tailA2];
  const melB = composeMelody(chordsOf('B'), rand, { low: 72, high: 86, scale, sparse: 0 });
  const melC = composeMelody(chordsOf('C'), rand, { low: 72, high: 88, scale, sparse: 0.45 });
  const tailB2 = composeMelody(chordsOf('B'), rand, { low: 72, high: 86, scale, sparse: 0 }).filter((n) => n.t >= 16);
  const melB2 = [...melB.filter((n) => n.t < 16), ...tailB2];
  const melodies = { A: melA, A2: melAv, B: melB, B2: melB2, C: melC };

  const TAIL = 2.2; // 每小节多渲染的尾音
  const totalBars = INTRO_BARS + LOOP_BARS + 1; // 多一小节给循环接缝
  const total = Math.ceil(totalBars * bar * sr);
  const noiseData = new Float32Array(sr);
  for (let i = 0; i < sr; i++) noiseData[i] = Math.random() * 2 - 1;

  function makeChunk(base) {
    const ac = new OfflineAudioContext(2, Math.ceil((bar + TAIL) * sr), sr);
    const bus = ac.createGain(); bus.gain.value = 0.9; bus.connect(ac.destination);
    // 侧链“呼吸感”：科技风的铺底和贝斯每拍被压一下
    const pump = ac.createGain(); pump.connect(bus);
    if (style === 'tech' || style === 'house') {
      for (let k = 0; k * beat < bar + TAIL; k++) { pump.gain.setValueAtTime(0.35, k * beat); pump.gain.linearRampToValueAtTime(1, k * beat + beat * 0.55); }
    }
    const wetBus = ac.createGain();
    for (const [dt, lv] of [[0.75, 0.22], [1.5, 0.09], [0.37, 0.06]]) {
      const d = ac.createDelay(2); d.delayTime.value = beat * dt;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
      const w = ac.createGain(); w.gain.value = lv;
      wetBus.connect(d).connect(lp).connect(w).connect(bus);
    }
    const noise = ac.createBuffer(1, sr, sr); noise.copyToChannel(noiseData, 0);
    const R = (t) => t - base;
    const env = (g, t, peak, a, d) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    // 声像和混响发送做成共享总线（每个音符单独建节点会让离线渲染慢好几倍）
    const pans = new Map(); const sends = new Map(); const lps = new Map();
    const panBus = (pan, toPump) => {
      const key = Math.round(pan * 10) + (toPump ? 'p' : '');
      if (!pans.has(key)) { const p = ac.createStereoPanner(); p.pan.value = Math.round(pan * 10) / 10; p.connect(toPump ? pump : bus); pans.set(key, p); }
      return pans.get(key);
    };
    const sendBus = (lv) => {
      const key = Math.round(lv * 20);
      if (!sends.has(key)) { const g = ac.createGain(); g.gain.value = key / 20; g.connect(wetBus); sends.set(key, g); }
      return sends.get(key);
    };
    const lpBus = (freq, pan, toPump) => {
      const key = freq + '|' + Math.round(pan * 10) + toPump;
      if (!lps.has(key)) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = freq; fl.connect(panBus(pan, toPump)); fl.connect(sendBus(0.3)); lps.set(key, fl); }
      return lps.get(key);
    };
    const out = (node, { send = 0, pan = 0, toPump = false } = {}) => {
      node.connect(panBus(pan, toPump));
      if (send) node.connect(sendBus(send));
    };
    const I = {
      osc(type, m, ta, dur, peak, { attack = 0.005, detune = 0, lp = 0, send = 0, pan = 0, toPump = false, vib = 0 } = {}) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = type; o.frequency.value = hzT(m); o.detune.value = detune;
        if (vib) { const l = ac.createOscillator(); l.frequency.value = 5.5; const lg = ac.createGain(); lg.gain.value = vib; l.connect(lg).connect(o.detune); l.start(t); l.stop(t + attack + dur + 0.1); }
        const g = ac.createGain(); env(g, t, peak, attack, dur);
        let n = o.connect(g);
        if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n = n.connect(f); }
        out(n, { send, pan, toPump });
        o.start(t); o.stop(t + attack + dur + 0.05);
      },
      piano(m, ta, dur, vel, { send = 0.25, pan = 0 } = {}) {
        const t = R(ta); if (t < 0) return;
        const decay = Math.min(dur + 0.8, 2.4);
        [[1, 1, 1], [2, 0.45, 0.55], [3, 0.2, 0.32]].forEach(([k, gk, dk]) => {
          const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = hzT(m) * k * (1 + 0.0007 * k * k);
          const g = ac.createGain(); env(g, t, 0.09 * vel * gk, 0.004, decay * dk);
          out(o.connect(g), { send, pan }); o.start(t); o.stop(t + decay * dk + 0.05);
        });
      },
      ks(m, ta, dur, vel, { send = 0.2, pan = 0, bright = 3800 } = {}) {
        const t = R(ta); if (t < 0) return;
        const s = ac.createBufferSource();
        s.buffer = ksBuffer(m + tr, sr);
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright;
        const g = ac.createGain(); g.gain.setValueAtTime(0.32 * vel, t);
        g.gain.setValueAtTime(0.32 * vel, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
        out(s.connect(f).connect(g), { send, pan }); s.start(t); s.stop(t + dur + 0.3);
      },
      strum(chord, ta, dur, vel, down = true) {
        const ns = [chord[0] - 12, ...chord, chord[0] + 12];
        (down ? ns : [...ns].reverse()).forEach((m, k) => I.ks(m, ta + k * 0.014, dur, vel * (k === 0 ? 0.8 : 0.6), { pan: (k - 2) * 0.12 }));
      },
      bell(m, ta, vel, { send = 0.45, pan = 0 } = {}) {
        const t = R(ta); if (t < 0) return;
        [[1, 1, 1.3], [2.76, 0.28, 0.45], [5.4, 0.09, 0.18]].forEach(([k, gk, dk]) => {
          const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = hzT(m) * k;
          const g = ac.createGain(); env(g, t, 0.06 * vel * gk, 0.002, dk);
          out(o.connect(g), { send, pan }); o.start(t); o.stop(t + dk + 0.1);
        });
      },
      strings(chord, ta, dur, vel, { lp = 1700 } = {}) {
        const t = R(ta); if (t < 0) return;
        [...chord, chord[0] - 12].forEach((m, k) => {
          for (const dt of [-9, 9]) {
            const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hzT(m); o.detune.value = dt;
            const g = ac.createGain();
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.011 * vel, t + 0.6);
            g.gain.setValueAtTime(0.011 * vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
            o.connect(g).connect(lpBus(lp, k % 2 ? 0.3 : -0.3, true));
            o.start(t); o.stop(t + dur + 1);
          }
        });
      },
      pluck(m, ta, vel, { send = 0.35, pan = 0, toPump = false } = {}) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hzT(m);
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.22);
        const g = ac.createGain(); env(g, t, 0.06 * vel, 0.003, 0.3);
        out(o.connect(f).connect(g), { send, pan, toPump }); o.start(t); o.stop(t + 0.4);
      },
      noise(ta, type, freq, peak, dur, { q = 0.8, attack = 0.002, pan = 0, send = 0 } = {}) {
        const t = R(ta); if (t < 0) return;
        const s = ac.createBufferSource(); s.buffer = noise;
        const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ac.createGain(); env(g, t, peak, attack, dur);
        out(s.connect(f).connect(g), { pan, send }); s.start(t, rand() * 0.4); s.stop(t + attack + dur + 0.05);
      },
      kick(ta, peak) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        const g = ac.createGain(); env(g, t, peak, 0.002, 0.3);
        out(o.connect(g)); o.start(t); o.stop(t + 0.4);
        I.noise(ta, 'highpass', 3000, peak * 0.08, 0.01);
      },
      snare(ta, peak) {
        I.noise(ta, 'bandpass', 1900, peak, 0.13, { q: 0.6, send: 0.15 });
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
        const g = ac.createGain(); env(g, t, peak * 0.6, 0.002, 0.09);
        out(o.connect(g)); o.start(t); o.stop(t + 0.15);
      },
      clap(ta, peak) { for (const d of [0, 0.011, 0.022]) I.noise(ta + d, 'bandpass', 1300, peak * (d ? 0.7 : 1), d === 0.022 ? 0.16 : 0.012, { q: 1.2, send: 0.2 }); },
      hat(ta, peak, open = false) { I.noise(ta, 'highpass', 7800, peak, open ? 0.28 : 0.04, { pan: 0.2 }); },
      shaker(ta, peak) { I.noise(ta, 'highpass', 6200, peak, 0.05, { attack: 0.012, pan: -0.25 }); },
      crash(ta, peak) { I.noise(ta, 'highpass', 4800, peak, 1.7, { q: 0.5, send: 0.2 }); },
      tick(ta, peak) { I.noise(ta, 'bandpass', 4200, peak, 0.012, { q: 4, pan: 0.3 }); },
      tom(ta, peak, f0) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.25);
        const g = ac.createGain(); env(g, t, peak, 0.002, 0.3);
        out(o.connect(g), { send: 0.15 }); o.start(t); o.stop(t + 0.4);
      },
      timp(ta, peak) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.5);
        const g = ac.createGain(); env(g, t, peak, 0.004, 1.3);
        out(o.connect(g), { send: 0.3 }); o.start(t); o.stop(t + 1.5);
        I.noise(ta, 'lowpass', 400, peak * 0.4, 0.15);
      },
      riser(ta, dur, peak) {
        const t = R(ta); if (t < 0) return;
        const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
        out(s.connect(f).connect(g), { send: 0.3 }); s.start(t); s.stop(t + dur + 0.1);
      },
      // ---- 快歌用的乐器 ----
      /** 超级锯齿：每个音 5 根失谐锯齿波叠在一起，电音“大合唱”的那种厚度 */
      supersaw(chord, ta, dur, vel, { lp = 5200, toPump = true, release = 0.12 } = {}) {
        const t = R(ta); if (t < 0) return;
        [...chord, chord[0] + 12].forEach((m, k) => {
          for (const dt of [-24, -11, 0, 11, 24]) {
            const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hzT(m); o.detune.value = dt;
            const g = ac.createGain();
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.0055 * vel, t + 0.01);
            g.gain.setValueAtTime(0.0055 * vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + release);
            o.connect(g).connect(lpBus(lp, (dt / 24) * 0.6, toPump));
            o.start(t); o.stop(t + dur + release + 0.02);
          }
        });
      },
      /** 主旋律合成器：3 根锯齿 + 颤音 */
      lead(m, ta, dur, vel, { lp = 4200 } = {}) {
        const t = R(ta); if (t < 0) return;
        for (const dt of [-12, 0, 12]) {
          const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hzT(m); o.detune.value = dt;
          const l = ac.createOscillator(); l.frequency.value = 5.8; const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.4, dur));
          l.connect(lg).connect(o.detune);
          const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016 * vel, t + 0.012);
          g.gain.setValueAtTime(0.016 * vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
          o.connect(g).connect(lpBus(lp, dt / 30, false));
          o.start(t); o.stop(t + dur + 0.1); l.start(t); l.stop(t + dur + 0.1);
        }
      },
      /** 失真：tanh 波形整形，给 808 和吉他用 */
      dist(amount) {
        const key = 'dist' + amount;
        if (!lps.has(key)) {
          const ws = ac.createWaveShaper();
          const curve = new Float32Array(1024);
          for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(amount * x) / Math.tanh(amount); }
          ws.curve = curve; ws.oversample = '2x';
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = amount > 4 ? 3200 : 1800;
          ws.connect(lp); lp.connect(panBus(0, false)); lp.connect(sendBus(0.1));
          lps.set(key, ws);
        }
        return lps.get(key);
      },
      /** 808 重低音：带滑音和失真 */
      b808(m, ta, dur, vel, from = 0) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'sine';
        if (from) { o.frequency.setValueAtTime(hzT(from), t); o.frequency.exponentialRampToValueAtTime(hzT(m), t + 0.09); } else o.frequency.value = hzT(m);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.005);
        g.gain.setValueAtTime(0.45 * vel, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
        o.connect(g).connect(I.dist(2.2)); o.start(t); o.stop(t + dur + 0.15);
      },
      /** 牛铃：两个方波 + 带通，Phonk 的灵魂 */
      cowbell(m, ta, vel) {
        const t = R(ta); if (t < 0) return;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hzT(m) * 2.2; f.Q.value = 1.6;
        const g = ac.createGain(); env(g, t, 0.16 * vel, 0.002, 0.28);
        for (const k of [1, 1.48]) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = hzT(m) * k; o.connect(f); o.start(t); o.stop(t + 0.35); }
        out(f.connect(g), { send: 0.3, pan: 0.1 });
      },
      /** 失真强力和弦（根音 + 五度 + 八度），mute=true 是闷音“咚咚咚” */
      power(rootM, ta, dur, vel, mute = false) {
        const t = R(ta); if (t < 0) return;
        for (const [iv, dt] of [[0, -8], [0, 8], [7, -6], [12, 5]]) {
          const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hzT(rootM + iv); o.detune.value = dt;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.004);
          if (mute) g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.14));
          else { g.gain.setValueAtTime(0.045 * vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08); }
          o.connect(g).connect(I.dist(7));
          o.start(t); o.stop(t + dur + 0.1);
        }
      },
      ride(ta, peak) { I.noise(ta, 'bandpass', 6500, peak, 0.32, { q: 1, pan: -0.2 }); },
      // ---- 新风格用的乐器 ----
      /** 电钢琴（Rhodes 味）：正弦 + 一点三角波，带颤音 */
      ep(m, ta, dur, vel, { pan = 0, send = 0.3 } = {}) {
        const t = R(ta); if (t < 0) return;
        const decay = Math.min(dur + 0.6, 2.2);
        [[1, 'sine', 1], [2, 'triangle', 0.18], [4, 'sine', 0.05]].forEach(([k, type, gk]) => {
          const o = ac.createOscillator(); o.type = type; o.frequency.value = hzT(m) * k;
          const g = ac.createGain(); env(g, t, 0.085 * vel * gk, 0.006, decay);
          const trem = ac.createGain(); trem.gain.value = 1;
          const l = ac.createOscillator(); l.frequency.value = 4.2; const lg = ac.createGain(); lg.gain.value = 0.25; l.connect(lg).connect(trem.gain); l.start(t); l.stop(t + decay + 0.1);
          out(o.connect(g).connect(trem), { send, pan }); o.start(t); o.stop(t + decay + 0.05);
        });
      },
      /** 笛子：带气声和颤音的正弦 */
      flute(m, ta, dur, vel, { pan = 0.1 } = {}) {
        const t = R(ta); if (t < 0) return;
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = hzT(m);
        const l = ac.createOscillator(); l.frequency.value = 5.2; const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(16, t + Math.min(0.5, dur)); l.connect(lg).connect(o.detune);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.06);
        g.gain.setValueAtTime(0.045 * vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.18);
        out(o.connect(g), { send: 0.45, pan }); o.start(t); o.stop(t + dur + 0.2); l.start(t); l.stop(t + dur + 0.2);
        I.noise(ta, 'bandpass', hzT(m) * 2, 0.012 * vel, dur * 0.8, { q: 3, attack: 0.05, pan });
      },
      /** 黑胶底噪：随机的小噼啪 */
      crackle(ta, n) { for (let k = 0; k < n; k++) I.noise(ta + rand() * beat * 4, 'highpass', 2500 + rand() * 3000, 0.02 + rand() * 0.03, 0.004, { pan: rand() - 0.5 }); },
    };
    return { I, render: () => ac.startRendering() };
  }

  // 快歌：燃炸电音 / 飙车 Phonk / 热血摇滚
  function playFast(I, { intro, sec, bi, chord, root, nextRoot, lastBar, beatT, mel, newSection }) {
    const drop = sec === 'B' || sec === 'B2';
    const melT = (n) => beatT(n.t - bi * 4);
    if (style === 'edm') {
      if (intro) {
        I.supersaw(chord, beatT(0), 4 * beat * 0.95, 0.6, { lp: 900 + bi * 700, toPump: false, release: 0.4 });
        if (bi === 1) I.riser(beatT(0), 4 * beat, 0.1);
        return;
      }
      if (sec === 'A') {
        for (let i = 0; i < 4; i++) I.kick(beatT(i), 0.6);
        I.clap(beatT(1), 0.16); I.clap(beatT(3), 0.16);
        for (let i = 0; i < 4; i++) I.hat(beatT(i + 0.5), 0.045, true);
        for (let i = 0; i < 4; i++) I.osc('sawtooth', root - 24, beatT(i + 0.5), beat * 0.4, 0.1, { lp: 600, toPump: true });
        for (const x of [0.5, 1.5, 2.5, 3.5]) I.supersaw(chord, beatT(x), beat * 0.2, 0.55, { lp: 2600 });
        mel.forEach((n) => I.pluck(n.m, melT(n), 1.1, { send: 0.45 }));
      } else if (sec === 'C') {
        // 蓄力：鼓点越来越密、滤波越来越亮、上扬音效越来越响
        const step = bi < 4 ? 1 : bi < 6 ? 0.5 : bi < 7 ? 0.25 : 0.125;
        for (let x = 0; x < 4 - 1e-6; x += step) I.snare(beatT(x), 0.05 + (bi * 4 + x) * 0.004);
        I.supersaw(chord, beatT(0), 4 * beat * 0.95, 0.7, { lp: 700 + bi * 450, toPump: false, release: 0.2 });
        if (bi >= 4) I.riser(beatT(0), 4 * beat, 0.03 + (bi - 4) * 0.025);
        if (bi < 4) for (let i = 0; i < 4; i++) I.kick(beatT(i), 0.45);
        mel.forEach((n) => I.pluck(n.m, melT(n), 0.8, { send: 0.5 }));
      } else {
        // 爆发
        if (newSection) I.crash(beatT(0), 0.12);
        for (let i = 0; i < 4; i++) I.kick(beatT(i), 0.75);
        I.clap(beatT(1), 0.2); I.clap(beatT(3), 0.2);
        for (let i = 0; i < 16; i++) I.hat(beatT(i / 4), i % 4 === 2 ? 0.055 : 0.028, i % 4 === 2);
        I.supersaw(chord, beatT(0), 4 * beat * 0.98, 1, { lp: 5200 });
        for (let i = 0; i < 4; i++) I.osc('sine', root - 24, beatT(i), beat * 0.6, 0.26, { toPump: true });
        mel.forEach((n) => I.lead(n.m, melT(n), n.d * beat, 1.1));
        mel.forEach((n) => I.pluck(n.m + 12, melT(n), 0.5, { send: 0.4 }));
        if (lastBar) [3, 3.25, 3.5, 3.75].forEach((x, k) => I.snare(beatT(x), 0.08 + k * 0.03));
      }
    } else if (style === 'phonk') {
      // 半拍感：底鼓 1、2.75、3.5，军鼓在第 3 拍；16 分音符踩镲带三连音滚动
      const hats = () => {
        for (let i = 0; i < 16; i++) { if (i === 14) continue; I.hat(beatT(i / 4), i % 2 ? 0.03 : 0.045); }
        for (let k = 0; k < 3; k++) I.hat(beatT(3.5 + k / 6), 0.035);
      };
      if (intro) {
        hats();
        mel.forEach((n) => I.cowbell(n.m, melT(n), 0.7));
        if (bi === 1) I.riser(beatT(0), 4 * beat, 0.07);
        I.strings(chord, beatT(0), 4 * beat * 0.95, 0.6, { lp: 900 });
        return;
      }
      hats();
      I.strings(chord, beatT(0), 4 * beat * 0.95, sec === 'C' ? 0.9 : 0.5, { lp: 900 });
      if (sec !== 'C') {
        I.kick(beatT(0), 0.7); I.kick(beatT(1.75), 0.55); I.kick(beatT(2.5), 0.6);
        I.snare(beatT(2), 0.22); I.clap(beatT(2), 0.14);
        if (drop) I.snare(beatT(3.75), 0.08);
        I.b808(root - 24, beatT(0), beat * 1.6, 1, bi > 0 ? root - 24 + 12 : 0);
        I.b808(root - 24 + (bi % 2 ? 7 : 0), beatT(2.5), beat * 1.2, 0.9, root - 24);
      } else {
        I.b808(root - 24, beatT(0), beat * 3.6, 0.9);
      }
      const cowVel = drop ? 1 : sec === 'C' ? 0.55 : 0.75;
      mel.forEach((n) => I.cowbell(n.m - (drop ? 0 : 12), melT(n), cowVel));
      if (drop) mel.forEach((n) => I.cowbell(n.m + 12, melT(n) + beat * 0.5, 0.35));
      if (newSection && drop) I.crash(beatT(0), 0.09);
    } else if (style === 'rock') {
      if (intro) {
        I.power(root - 12, beatT(0), 4 * beat * 0.9, 0.9);
        if (bi === 1) [[2, 300], [2.5, 250], [3, 200], [3.5, 160]].forEach(([x, f]) => I.tom(beatT(x), 0.35, f));
        return;
      }
      if (newSection) I.crash(beatT(0), 0.12);
      if (drop) {
        // 副歌：大开的强力和弦 + 主旋律 + 双踩
        I.power(root - 12, beatT(0), beat * 1.9, 1); I.power(root - 12, beatT(2), beat * 1.9, 1);
        mel.forEach((n) => I.lead(n.m, melT(n), n.d * beat, 1.2, { lp: 3600 }));
        for (const x of [0, 0.5, 1.5, 2, 2.5, 3.5]) I.kick(beatT(x), 0.6);
        for (let i = 0; i < 8; i++) I.ride(beatT(i / 2), i % 2 ? 0.035 : 0.05);
      } else {
        // 主歌：闷音八分音符“咚咚咚”
        for (let i = 0; i < 8; i++) I.power(root - 12, beatT(i / 2), beat * 0.45, i % 4 === 0 ? 0.95 : 0.7, i % 4 !== 0);
        if (sec === 'A2') mel.forEach((n) => I.lead(n.m - 12, melT(n), n.d * beat, 0.8, { lp: 2600 }));
        for (const x of [0, 1.5, 2]) I.kick(beatT(x), 0.6);
        for (let i = 0; i < 8; i++) I.hat(beatT(i / 2), i % 2 ? 0.03 : 0.045);
      }
      I.snare(beatT(1), 0.24); I.snare(beatT(3), 0.24);
      for (let i = 0; i < 8; i++) I.osc('sawtooth', (i === 7 ? nextRoot : root) - 24, beatT(i / 2), beat * 0.45, 0.09, { lp: 700 });
      if (lastBar) { [[3, 280], [3.25, 230], [3.5, 190], [3.75, 150]].forEach(([x, f]) => I.tom(beatT(x), 0.4, f)); I.snare(beatT(3.75), 0.2); }
    }
  }

  // 一个小节里演奏什么
  function playBar(I, b, t0) {
    const intro = b < INTRO_BARS;
    const li = intro ? 0 : (b - INTRO_BARS) % LOOP_BARS;
    const sec = intro ? 'I' : SECTIONS[Math.floor(li / SEC_BARS)];
    const bi = intro ? b : li % SEC_BARS;           // 段内第几小节
    const chords = chordsOf(sec === 'I' ? 'A' : sec);
    const chord = chords[bi];
    const root = chord[0];
    const nextRoot = chords[(bi + 1) % 8][0];
    const lastBar = bi === SEC_BARS - 1;
    const full = sec === 'B';
    const beatT = (x) => t0 + x * beat;
    const mel = intro ? [] : melodies[sec].filter((n) => n.t >= bi * 4 && n.t < bi * 4 + 4);
    const newSection = !intro && bi === 0;

    if (style === 'chip') {
      for (let i = 0; i < 8; i++) {
        const m = i === 7 && nextRoot !== root ? nextRoot - 24 + (nextRoot > root ? -1 : 1) : root - 24 + (i % 2 ? 12 : 0);
        I.osc('triangle', m, beatT(i / 2), 0.17, 0.17);
      }
      const pat = sec === 'A2' || sec === 'C' ? [0, 1, 2, 1] : [0, 2, 1, 2];
      for (let i = 0; i < 16; i++) {
        if (sec === 'C' && i % 2) continue;
        I.osc('square', chord[pat[i % 4]] + 12 + (i % 8 === 7 ? 12 : 0), beatT(i / 4), 0.06, intro ? 0.014 : 0.018, { send: 0.25, pan: i % 2 ? 0.3 : -0.3 });
      }
      if (full) for (const x of [0.5, 1.5, 2.5, 3.5]) chord.forEach((m) => I.osc('square', m, beatT(x), 0.08, 0.009, { lp: 2400, pan: -0.15 }));
      mel.forEach((n) => I.osc('square', n.m, beatT(n.t - bi * 4), n.d * beat, sec === 'C' ? 0.022 : 0.03, { send: 0.35, lp: 3600, vib: 12 }));
      if (sec === 'B') mel.forEach((n) => I.osc('triangle', n.m - 12, beatT(n.t - bi * 4), n.d * beat, 0.03, { send: 0.2 }));
      if (!intro && sec !== 'C') {
        I.kick(beatT(0), 0.55); I.kick(beatT(2), 0.5); if (full) I.kick(beatT(2.5), 0.35);
        I.snare(beatT(1), 0.15); I.snare(beatT(3), 0.15);
        for (let i = 0; i < (full ? 16 : 8); i++) I.hat(beatT(i * (full ? 0.25 : 0.5)), i % 2 ? 0.035 : 0.05);
      } else if (sec === 'C') { for (let i = 0; i < 4; i++) I.hat(beatT(i + 0.5), 0.03); I.kick(beatT(0), 0.3); }
    } else if (style === 'pop') {
      // 吉他扫弦：下 下上 上下上
      const strum = [[0, true, 1], [1, true, 0.7], [1.5, false, 0.55], [2.5, false, 0.6], [3, true, 0.75], [3.5, false, 0.55]];
      strum.forEach(([x, down, v]) => { if (!(intro && x > 0)) I.strum(chord, beatT(x), beat * 0.45, v * (sec === 'C' ? 0.6 : 0.85), down); });
      I.osc('sine', root - 24, beatT(0), beat * 1.4, 0.24, { attack: 0.01 });
      I.osc('sine', root - 24 + 7, beatT(1.5), beat * 0.4, 0.16);
      I.osc('sine', (lastBar || bi % 2 ? nextRoot : root) - 24, beatT(2), beat * 1.6, 0.22);
      if (full || sec === 'A2') for (const x of [0, 2]) chord.forEach((m) => I.piano(m + 12, beatT(x), beat * 1.6, 0.55, { pan: 0.2 }));
      if (full) I.strings(chord, beatT(0), bar * 0.95, 0.8);
      mel.forEach((n) => I.bell(n.m, beatT(n.t - bi * 4), sec === 'C' ? 0.8 : 1, { pan: -0.1 }));
      if (sec === 'B') mel.forEach((n) => I.osc('sine', n.m + 12, beatT(n.t - bi * 4), n.d * beat, 0.018, { vib: 18, send: 0.4 }));
      if (!intro && sec !== 'C') {
        for (const x of full ? [0, 1, 2, 3] : [0, 1.5, 2]) I.kick(beatT(x), 0.55);
        I.clap(beatT(1), 0.2); I.clap(beatT(3), 0.2);
        for (let i = 0; i < 16; i++) I.shaker(beatT(i / 4), i % 2 ? 0.02 : 0.035);
        if (full) for (const x of [0.5, 1.5, 2.5, 3.5]) I.hat(beatT(x), 0.035, true);
      } else if (sec === 'C') { I.clap(beatT(3), 0.12); for (let i = 0; i < 8; i++) I.shaker(beatT(i / 2), 0.02); }
    } else if (style === 'warm') {
      // 钢琴分解和弦
      const order = [0, 1, 2, 1, 0, 2, 1, 2];
      for (let i = 0; i < 8; i++) if (!(intro && i % 2)) I.piano(chord[order[i]] + (i >= 4 ? 0 : -12), beatT(i / 2), beat * 0.9, i % 4 === 0 ? 0.75 : 0.5, { pan: -0.15 });
      I.piano(root - 24, beatT(0), beat * 3, 0.9);
      mel.forEach((n) => I.piano(n.m, beatT(n.t - bi * 4), n.d * beat, 0.85, { pan: 0.1, send: 0.3 }));
      if (full || sec === 'A2') for (let i = 0; i < 8; i++) I.ks(chord[[0, 2, 1, 2][i % 4]] + 12, beatT(i / 2 + 0.25), beat * 0.4, 0.5, { pan: 0.35 });
      if (full || sec === 'C') I.strings(chord, beatT(0), bar * 0.95, sec === 'C' ? 1 : 0.7, { lp: 1400 });
      if (full) mel.forEach((n, k) => { if (k % 2 === 0) I.bell(n.m + 12, beatT(n.t - bi * 4 + 0.5), 0.45, { pan: -0.3 }); });
      if (!intro && sec !== 'C') {
        I.kick(beatT(0), 0.32); if (full) { I.kick(beatT(2), 0.28); I.snare(beatT(1), 0.06); I.snare(beatT(3), 0.06); }
        for (let i = 0; i < 8; i++) I.shaker(beatT(i / 2), i % 2 ? 0.02 : 0.012);
      }
    } else if (style === 'tech') {
      I.strings(chord, beatT(0), bar * 0.95, intro ? 0.6 : 0.8, { lp: 1200 });
      for (let i = 0; i < 8; i++) I.osc('sawtooth', (i === 7 ? nextRoot : root) - 24, beatT(i / 2), beat * 0.4, i % 2 ? 0.08 : 0.11, { lp: 420, toPump: true });
      if (!intro) {
        const pat = sec === 'B' ? [0, 1, 2, 3] : [2, 1, 0, 1];
        for (let i = 0; i < 16; i++) {
          if (sec === 'C' && i % 4 !== 0) continue;
          const idx = pat[i % 4];
          I.pluck((idx === 3 ? chord[0] + 12 : chord[idx]) + 12, beatT(i / 4), i % 4 === 0 ? 0.9 : 0.55, { pan: i % 2 ? 0.35 : -0.35 });
        }
        mel.forEach((n) => I.pluck(n.m, beatT(n.t - bi * 4), 1.1, { send: 0.45 }));
        if (sec === 'B') mel.forEach((n) => I.bell(n.m + 12, beatT(n.t - bi * 4), 0.35));
      }
      if (!intro && sec !== 'C') {
        for (let i = 0; i < 4; i++) I.kick(beatT(i), 0.5);
        I.clap(beatT(1), 0.14); I.clap(beatT(3), 0.14);
        if (full) for (let i = 0; i < 16; i++) I.hat(beatT(i / 4), i % 4 === 2 ? 0.05 : 0.025, i % 4 === 2);
        else for (let i = 0; i < 4; i++) I.hat(beatT(i + 0.5), 0.04); // 反拍踩镲
      }
      if (sec === 'C' && lastBar) I.riser(beatT(0), bar, 0.12);
    } else if (style === 'story') {
      I.strings(chord, beatT(0), bar * 0.97, intro ? 0.7 : 0.9, { lp: 1100 });
      // 低音钢琴固定音型
      const os = [0, 2, 1, 2, 0, 2, 1, 2];
      for (let i = 0; i < 8; i++) I.piano(chord[os[i]] - 12, beatT(i / 2), beat * 0.6, i % 4 === 0 ? 0.6 : 0.4, { pan: -0.2, send: 0.35 });
      I.osc('sawtooth', root - 24, beatT(0), bar * 0.9, 0.05, { attack: 0.2, lp: 260 });
      for (let i = 0; i < 8; i++) I.tick(beatT(i / 2), i % 2 ? 0.04 : 0.07); // 钟表滴答
      if (!intro) {
        mel.forEach((n) => I.bell(n.m - (sec === 'B' ? 0 : 12), beatT(n.t - bi * 4), sec === 'C' ? 0.6 : 0.85, { pan: 0.15, send: 0.5 }));
        if (sec !== 'C') { I.timp(beatT(0), 0.5); if (full) { I.timp(beatT(2.5), 0.35); I.snare(beatT(3), 0.05); } }
      }
        } else if (style === 'lofi') {
      // 慵懒：电钢琴七和弦 + 摇摆的鼓 + 黑胶噼啪
      const sw = (x) => (x % 1 === 0.5 ? x + 0.08 : x); // 八分音符后半拍晚一点，摇摆感
      I.crackle(beatT(0), 6);
      I.ep(chord[0] - 12, beatT(0), beat * 1.8, 0.8, { pan: -0.1 });
      chord.slice(1).forEach((m) => I.ep(m, beatT(0), beat * 1.8, 0.6, { pan: 0.15 }));
      chord.slice(1).forEach((m) => I.ep(m, beatT(sw(2.5)), beat * 1.2, 0.45, { pan: 0.15 }));
      I.osc('sine', root - 24, beatT(0), beat * 1.5, 0.2, { attack: 0.02 });
      I.osc('sine', root - 24 + 7, beatT(sw(2.5)), beat * 0.9, 0.14, { attack: 0.02 });
      if (!intro) {
        mel.forEach((n) => I.bell(n.m - 12, beatT(n.t - bi * 4), sec === 'B' ? 0.75 : 0.5, { pan: 0.2, send: 0.55 }));
        if (sec !== 'C') {
          I.kick(beatT(0), 0.42); I.kick(beatT(sw(1.5)), 0.28); I.kick(beatT(2.25), 0.3);
          I.snare(beatT(1), 0.09); I.snare(beatT(3), 0.09);
          for (let i = 0; i < 8; i++) I.hat(beatT(sw(i / 2)), i % 2 ? 0.018 : 0.03);
        } else for (let i = 0; i < 4; i++) I.hat(beatT(i + 0.5), 0.02);
      }
    } else if (style === 'house') {
      // 浩室：四四拍底鼓、反拍开镲、钢琴切分和弦、反拍贝斯
      if (!intro) for (let i = 0; i < 4; i++) I.kick(beatT(i), sec === 'C' ? 0.35 : 0.62);
      for (let i = 0; i < 4; i++) I.hat(beatT(i + 0.5), 0.05, true);
      if (!intro && sec !== 'C') { I.clap(beatT(1), 0.17); I.clap(beatT(3), 0.17); for (let i = 0; i < 16; i++) if (i % 4) I.hat(beatT(i / 4), 0.018); }
      for (const x of [0, 0.75, 1.5, 2.5, 3.25]) chord.forEach((m) => I.piano(m + 12, beatT(x), beat * 0.3, 0.55, { pan: 0.1, send: 0.2 }));
      for (let i = 0; i < 4; i++) I.osc('sawtooth', root - 24, beatT(i + 0.5), beat * 0.35, 0.12, { lp: 520, toPump: true });
      if (!intro) mel.forEach((n) => I.pluck(n.m, beatT(n.t - bi * 4), sec === 'B' || sec === 'B2' ? 1.1 : 0.7, { send: 0.4 }));
      if (sec === 'B' || sec === 'B2') I.strings(chord, beatT(0), bar * 0.95, 0.6, { lp: 2200 });
      if (sec === 'C' && bi >= 6) I.riser(beatT(0), bar, 0.06);
    } else if (style === 'citypop') {
      // 城市流行：七和弦电钢琴 + 八度跳跃的贝斯 + 明亮的拨弦主旋律
      I.ep(chord[0], beatT(0), beat * 1.4, 0.7, { pan: -0.15 }); chord.slice(1).forEach((m) => I.ep(m + 12, beatT(0), beat * 1.4, 0.55, { pan: 0.2 }));
      chord.slice(1).forEach((m) => I.ep(m + 12, beatT(1.5), beat * 0.8, 0.5, { pan: 0.2 }));
      chord.slice(1).forEach((m) => I.ep(m + 12, beatT(3), beat * 0.8, 0.45, { pan: 0.2 }));
      const bass = [[0, 0], [0.5, 12], [1.5, 0], [2, 7], [2.5, 12], [3.5, 10]];
      bass.forEach(([x, iv]) => I.osc('triangle', root - 24 + iv, beatT(x), beat * 0.4, 0.2, { lp: 900 }));
      if (!intro) {
        mel.forEach((n) => I.pluck(n.m + 12, beatT(n.t - bi * 4), 0.9, { send: 0.4, pan: 0.15 }));
        if (sec === 'B') { I.strings(chord, beatT(0), bar * 0.95, 0.7, { lp: 2600 }); mel.forEach((n) => I.bell(n.m + 12, beatT(n.t - bi * 4), 0.4)); }
        if (sec !== 'C') {
          I.kick(beatT(0), 0.5); I.kick(beatT(2.5), 0.4); I.snare(beatT(1), 0.13); I.snare(beatT(3), 0.13); I.clap(beatT(3), 0.08);
          for (let i = 0; i < 16; i++) I.shaker(beatT(i / 4), i % 2 ? 0.016 : 0.03);
        } else I.shaker(beatT(0), 0.03);
      }
    } else if (style === 'uke') {
      // 尤克里里：高把位扫弦 + 口哨 + 拍手 + 钟琴
      const hi = (c) => c.map((m) => m + 12);
      const pat = [[0, true, 0.9], [1, true, 0.6], [1.5, false, 0.5], [2.5, false, 0.55], [3, true, 0.65], [3.5, false, 0.5]];
      pat.forEach(([x, down, v]) => { if (!(intro && x > 0)) (down ? hi(chord) : [...hi(chord)].reverse()).forEach((m, k) => I.ks(m, beatT(x) + k * 0.012, beat * 0.4, v * 0.7, { pan: (k - 1) * 0.15, bright: 6000 })); });
      I.osc('sine', root - 24, beatT(0), beat * 0.8, 0.18); I.osc('sine', root - 24 + 7, beatT(2), beat * 0.8, 0.15);
      if (!intro) {
        mel.forEach((n) => I.osc('sine', n.m + 12, beatT(n.t - bi * 4), n.d * beat, sec === 'C' ? 0.02 : 0.03, { attack: 0.03, vib: 22, send: 0.45 }));
        if (sec === 'B') mel.forEach((n, k) => { if (k % 2 === 0) I.bell(n.m + 12, beatT(n.t - bi * 4), 0.5); });
        if (sec !== 'C') { I.kick(beatT(0), 0.4); I.kick(beatT(2), 0.35); I.clap(beatT(1), 0.2); I.clap(beatT(3), 0.2); for (let i = 0; i < 8; i++) I.shaker(beatT(i / 2), 0.025); }
      }
    } else if (style === 'guofeng') {
      // 国风：五声音阶拨弦（像古筝）+ 笛子 + 低沉的鼓 + 弦乐铺底
      I.strings(chord, beatT(0), bar * 0.97, intro ? 0.6 : 0.75, { lp: 1200 });
      const arp = [0, 2, 1, 2, 0, 1, 2, 1];
      for (let i = 0; i < 8; i++) I.ks(chord[arp[i] % chord.length] + (i % 4 === 3 ? 12 : 0), beatT(i / 2), beat * 0.9, i % 4 === 0 ? 0.8 : 0.5, { pan: -0.25, bright: 5200 });
      if (!intro) {
        if (sec === 'C') mel.forEach((n) => I.ks(n.m + 12, beatT(n.t - bi * 4), n.d * beat, 0.9, { pan: 0.2, bright: 6500, send: 0.5 }));
        else mel.forEach((n) => I.flute(n.m, beatT(n.t - bi * 4), n.d * beat, sec === 'B' ? 1 : 0.8));
        if (sec !== 'C') { I.tom(beatT(0), 0.45, 90); I.tom(beatT(2.5), 0.3, 110); if (sec === 'B') { I.tom(beatT(1.5), 0.25, 140); I.tick(beatT(3), 0.06); } }
        if (newSection) I.bell(chord[0] + 12, beatT(0), 0.5, { send: 0.6 });
      }
    }

    if (FAST.has(style)) playFast(I, { intro, sec, bi, chord, root, nextRoot, lastBar, beatT, mel, newSection });

    // 过门、镲片、上扬：让段落之间有“换气”感
    if (!intro && !FAST.has(style) && !['story', 'warm', 'lofi', 'guofeng', 'house'].includes(style)) {
      if (newSection && sec !== 'C') I.crash(beatT(0), 0.07);
      if (lastBar && SECTIONS[Math.floor(li / SEC_BARS) + 1] !== 'C' && sec !== 'C') {
        [3, 3.25, 3.5, 3.75].forEach((x, k) => I.snare(beatT(x), 0.07 + k * 0.03));
        if (style !== 'tech') [[3.5, 210], [3.75, 150]].forEach(([x, f]) => I.tom(beatT(x), 0.25, f));
      }
      if (lastBar && sec === 'A' && style !== 'chip') I.riser(beatT(0), bar, 0.08);
    }
    if (!intro && (style === 'warm' || style === 'story') && newSection && sec === 'B') I.bell(chord[0] + 24, beatT(0), 0.6);
  }

  const jobs = [];
  for (let b = 0; b < totalBars; b++) {
    const t0 = b * bar;
    const { I, render } = makeChunk(t0);
    playBar(I, b, t0);
    jobs.push(render().then((buf) => ({ buf, at: Math.round(t0 * sr) })));
  }
  const out = new AudioBuffer({ numberOfChannels: 2, length: total, sampleRate: sr });
  for (const { buf, at } of await Promise.all(jobs)) {
    for (let c = 0; c < 2; c++) {
      const src = buf.getChannelData(c); const dst = out.getChannelData(c);
      const n = Math.min(src.length, total - at);
      for (let i = 0; i < n; i++) dst[at + i] += src[i];
    }
  }
  // 统一响度：RMS 对齐到约 -24 dBFS；超过 0.8 的峰值软限幅
  let sum = 0; const d0 = out.getChannelData(0);
  for (let i = 0; i < d0.length; i += 16) sum += d0[i] * d0[i];
  const k = 0.063 / (Math.sqrt(sum / (d0.length / 16)) || 1);
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = d[i] * k; d[i] = Math.abs(v) > 0.8 ? Math.sign(v) * (0.8 + 0.2 * Math.tanh((Math.abs(v) - 0.8) / 0.2)) : v; }
  }
  return { buf: out, introLen: Math.round(INTRO_BARS * bar * sr), loopLen: Math.round(LOOP_BARS * bar * sr) };
}

/** 提前在后台把音乐合成好（进入创作台时调用） */
export function warmBgm(style, sampleRate = 48000) {
  if (!style || style === 'none' || !PROGS[parseBgm(style).base]) return;
  renderBgm(style, 1, sampleRate).catch(() => {});
}
