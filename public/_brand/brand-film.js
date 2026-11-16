// 出片王 品牌宣传片：专门写的一套动画（不是产品模板），用产品自己的配音、配乐、导出引擎出片
import { W, H, clamp, easeOut, easeInOut } from '../engine/draw.js';

export const meta = { id: 'brand-film', name: '品牌宣传片', category: '品牌', bgm: 'tech', durations: [1] };
export const skins = { dark: { name: '深色' } };

const FN = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
const C = { bg: '#0e0d0c', ink: '#f4f2ee', dim: 'rgba(244,242,238,.56)', faint: 'rgba(244,242,238,.16)', acc: '#ff5a1f', acc2: '#ff8a3d', card: '#1a1917', line: 'rgba(255,255,255,.12)', yellow: '#ffd84a' };

// 素材：产品真实做出来的成片截图
const IMG = {};
await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map(async (i) => {
  try { IMG['f' + i] = await createImageBitmap(await (await fetch(new URL(`./f${i}.jpg`, import.meta.url))).blob()); } catch { /* 缺图就画占位 */ }
}));

// ---------------------------------------------------------------- 小工具
const lerp = (a, b, p) => a + (b - a) * p;
const pop = (p) => { p = clamp(p); const s = 1.7; return 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2); }; // 回弹
const seg = (t, a, d) => clamp((t - a) / d);
function setFont(ctx, size, weight = 900) { ctx.font = `${weight} ${size}px ${FN}`; }
function text(ctx, s, x, y, size, color, { weight = 900, align = 'center', alpha = 1, spacing = 0 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; setFont(ctx, size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (spacing) ctx.letterSpacing = spacing + 'px';
  ctx.fillText(s, x, y); ctx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
/** 逐字出现的大字，每个字从下往上弹出来 */
function typeIn(ctx, s, cx, y, size, color, p, { weight = 900, stagger = 0.06 } = {}) {
  const chars = [...s]; setFont(ctx, size, weight);
  const widths = chars.map((c) => ctx.measureText(c).width); const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    const k = easeOut(clamp((p - i * stagger) / 0.35));
    if (k > 0) {
      ctx.save(); ctx.globalAlpha *= k; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(c, x, y + (1 - k) * size * 0.5); ctx.restore();
    }
    x += widths[i];
  });
  return total;
}
function cover(ctx, img, x, y, w, h) {
  if (!img) { ctx.fillStyle = '#222'; ctx.fillRect(x, y, w, h); return; }
  const s = Math.max(w / img.width, h / img.height); const iw = img.width * s; const ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
/** 手机：深色边框 + 屏幕里放成片截图 */
function phone(ctx, img, cx, cy, w, { alpha = 1, scale = 1, glow = 0.6, rot = 0 } = {}) {
  const h = w * 16 / 9; const r = w * 0.085; const b = w * 0.022;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale, scale);
  if (glow) { ctx.shadowColor = `rgba(255,90,31,${0.35 * glow})`; ctx.shadowBlur = 90; }
  rr(ctx, -w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2, r + b); ctx.fillStyle = '#1d1c1a'; ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); rr(ctx, -w / 2, -h / 2, w, h, r); ctx.clip(); cover(ctx, img, -w / 2, -h / 2, w, h); ctx.restore();
  ctx.restore();
}
function logo(ctx, cx, cy, size, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2); g.addColorStop(0, C.acc2); g.addColorStop(1, C.acc);
  rr(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.28); ctx.fillStyle = g; ctx.fill();
  const s = size / 24; ctx.beginPath(); ctx.moveTo(cx + (8 - 12) * s, cy + (5.5 - 12) * s); ctx.lineTo(cx + (8 - 12) * s, cy + (18.5 - 12) * s); ctx.lineTo(cx + (18.5 - 12) * s, cy); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
}
function chip(ctx, label, cx, cy, { size = 44, bg = C.card, color = C.ink, border = C.line, padX = 36, h = 96, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; setFont(ctx, size, 700); const w = ctx.measureText(label).width + padX * 2;
  rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill(); if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, cy + 2); ctx.restore();
  return w;
}
/** 小标题：橙色短线 + 字 */
function kicker(ctx, s, y, p) {
  const k = easeOut(p); if (k <= 0) return;
  ctx.save(); ctx.globalAlpha *= k;
  setFont(ctx, 40, 700); const w = ctx.measureText(s).width;
  ctx.fillStyle = C.acc; ctx.fillRect(W / 2 - w / 2 - 64, y - 3, 40 * k, 6);
  text(ctx, s, W / 2 + 0, y, 40, C.dim, { weight: 700, spacing: 4 });
  ctx.restore();
}

// ---------------------------------------------------------------- 背景
function background(ctx, t) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const gx = W / 2 + Math.sin(t * 0.35) * 160; const gy = H * 0.44 + Math.cos(t * 0.27) * 140;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 900); g.addColorStop(0, 'rgba(255,106,43,.20)'); g.addColorStop(1, 'rgba(255,106,43,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 点阵，缓慢往上飘
  ctx.fillStyle = 'rgba(255,255,255,.06)'; const off = (t * 14) % 44;
  for (let y = -off; y < H; y += 44) for (let x = 22; x < W; x += 44) ctx.fillRect(x, y, 3, 3);
}

// ---------------------------------------------------------------- 时间
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i]; const next = tl.sections[i + 1];
    return { start: sec.start, end: next ? next.start : tl.duration, lines: sec.lines.map((l) => ({ start: l.start, end: l.end })) };
  });
}
const lineAt = (p, j) => p.lines[Math.min(j, p.lines.length - 1)] || { start: p.start, end: p.end };

// ---------------------------------------------------------------- 各场景
const SCENES = {
  hook(ctx, lt, p, t) {
    const L = lineAt(p, 0); const d = L.end - p.start;
    typeIn(ctx, '做教培的', W / 2, 700, 76, C.dim, seg(lt, 0.1, d) * 2.2, { weight: 700 });
    typeIn(ctx, '都知道', W / 2, 860, 150, C.ink, seg(lt, d * 0.3, d) * 2);
    typeIn(ctx, '该发短视频', W / 2, 1050, 170, C.acc, seg(lt, d * 0.55, d) * 2.4);
  },
  pain(ctx, lt, p, t) {
    const L0 = lineAt(p, 0); const L1 = lineAt(p, 1); const t0 = L0.start - p.start; const t1 = L1.start - p.start;
    const words = ['写文案', '剪视频', '天天拍']; const d0 = L0.end - L0.start;
    words.forEach((w, i) => {
      const y = 640 + i * 230; const k = easeOut(seg(lt, t0 + i * d0 * 0.28, 0.4));
      const strike = easeInOut(seg(lt, t1 + i * 0.22, 0.4));
      ctx.save(); ctx.globalAlpha = k; ctx.translate((1 - k) * -60, 0);
      text(ctx, w, W / 2, y, 150, strike > 0.5 ? 'rgba(244,242,238,.35)' : C.ink);
      setFont(ctx, 150); const tw = ctx.measureText(w).width;
      if (strike > 0) { ctx.fillStyle = C.acc; rr(ctx, W / 2 - tw / 2 - 30, y - 9, (tw + 60) * strike, 18, 9); ctx.fill(); }
      ctx.restore();
    });
    const k = easeOut(seg(lt, t1 + 0.9, 0.5));
    if (k > 0) chip(ctx, '每一样，都要时间', W / 2, 1360, { size: 46, bg: 'rgba(255,90,31,.14)', border: 'rgba(255,90,31,.5)', color: C.acc2, alpha: k });
  },
  type(ctx, lt, p, t) {
    const L = lineAt(p, 0); const dur = p.end - p.start;
    const k = easeOut(seg(lt, 0, 0.5));
    typeIn(ctx, '现在', W / 2, 560, 90, C.dim, seg(lt, 0, 0.6) * 2, { weight: 700 });
    typeIn(ctx, '只要一句话', W / 2, 700, 140, C.ink, seg(lt, L.start - p.start + 0.2, 0.9) * 2);
    // 输入框
    const y = 1000; const bw = 900; const bh = 170;
    ctx.save(); ctx.globalAlpha = k;
    rr(ctx, W / 2 - bw / 2, y - bh / 2, bw, bh, 40); ctx.fillStyle = '#1b1a18'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,31,.6)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.shadowColor = 'rgba(255,90,31,.35)'; ctx.shadowBlur = 60; ctx.stroke(); ctx.shadowBlur = 0;
    const s = '我是教钢琴的，讲讲零基础怎么入门'; const n = Math.floor([...s].length * seg(lt, 0.5, Math.max(1.2, dur - 0.9)));
    const shown = [...s].slice(0, n).join('');
    setFont(ctx, 46, 700); ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const x0 = W / 2 - bw / 2 + 56; ctx.fillText(shown, x0, y + 2);
    if (Math.floor(t * 2.4) % 2 === 0 || n < [...s].length) { const cw = ctx.measureText(shown).width; ctx.fillStyle = C.acc; ctx.fillRect(x0 + cw + 6, y - 30, 5, 60); }
    ctx.restore();
    text(ctx, '说一句你想讲什么', W / 2, y + 150, 38, C.dim, { weight: 700, alpha: k });
  },
  make(ctx, lt, p, t) {
    const L = lineAt(p, 0); const d = L.end - L.start; const a = L.start - p.start;
    // 输入框缩到顶上，按下“生成”
    const k = easeInOut(seg(lt, 0, 0.6));
    const y = lerp(1000, 430, k); const bw = lerp(900, 760, k); const bh = lerp(170, 120, k);
    rr(ctx, W / 2 - bw / 2, y - bh / 2, bw, bh, 34); ctx.fillStyle = '#1b1a18'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    setFont(ctx, lerp(46, 36, k), 700); ctx.fillStyle = C.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('我是教钢琴的，讲讲零基础怎么入门', W / 2 - bw / 2 + 44, y + 2);
    // 生成按钮
    const press = seg(lt, 0.55, 0.3); const bs = press < 1 ? 1 - Math.sin(press * Math.PI) * 0.08 : 1;
    ctx.save(); ctx.translate(W / 2, 600); ctx.scale(bs, bs); ctx.globalAlpha = easeOut(seg(lt, 0.3, 0.3));
    rr(ctx, -200, -56, 400, 112, 56); const g = ctx.createLinearGradient(-200, 0, 200, 0); g.addColorStop(0, C.acc2); g.addColorStop(1, C.acc); ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,90,31,.7)'; ctx.shadowBlur = press > 0 ? 60 : 20; ctx.fill(); ctx.shadowBlur = 0;
    text(ctx, '生成成片  →', 0, 2, 44, '#fff', { weight: 900 }); ctx.restore();
    // 四件事依次点亮（跟着口播：写文案、配声音、配音乐、做画面）
    const items = [['写文案', 'AI 写口播'], ['配声音', '自动配音'], ['配音乐', '自动配乐'], ['做画面', '自动出画面']];
    items.forEach(([big, small], i) => {
      const cx = i % 2 ? W / 2 + 220 : W / 2 - 220; const cy = 900 + Math.floor(i / 2) * 290;
      const on = easeOut(seg(lt, a + d * (0.22 + i * 0.18), 0.45));
      ctx.save(); ctx.globalAlpha = 0.25 + on * 0.75; ctx.translate(cx, cy); const sc = 0.9 + pop(on) * 0.1; ctx.scale(sc, sc);
      rr(ctx, -200, -115, 400, 230, 36); ctx.fillStyle = on > 0.5 ? 'rgba(255,90,31,.14)' : C.card; ctx.fill();
      ctx.strokeStyle = on > 0.5 ? 'rgba(255,90,31,.7)' : C.line; ctx.lineWidth = 3; ctx.stroke();
      text(ctx, String(i + 1).padStart(2, '0'), -150, -62, 30, on > 0.5 ? C.acc2 : C.dim, { weight: 700, align: 'left' });
      text(ctx, big, 0, 4, 72, C.ink);
      text(ctx, small, 0, 70, 32, C.dim, { weight: 700 });
      // 打勾
      if (on > 0.5) { ctx.strokeStyle = C.acc2; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); const q = clamp((on - 0.5) * 2); ctx.moveTo(130, -66); ctx.lineTo(145, -50); if (q > 0.4) ctx.lineTo(lerp(145, 172, (q - 0.4) / 0.6), lerp(-50, -82, (q - 0.4) / 0.6)); ctx.stroke(); }
      ctx.restore();
    });
  },
  phone(ctx, lt, p, t) {
    const k = easeOut(seg(lt, 0, 0.8));
    typeIn(ctx, '几分钟', W / 2, 330, 170, C.acc, seg(lt, 0.1, 0.8) * 2);
    text(ctx, '一条竖屏成片', W / 2, 480, 64, C.ink, { alpha: easeOut(seg(lt, 0.5, 0.5)) });
    phone(ctx, IMG.f1, W / 2, lerp(1500, 1170, k), 560, { alpha: k, rot: (1 - k) * 0.08 });
    // 屏幕上一道光扫过去
    const sw = seg(lt, 0.9, 0.9);
    if (sw > 0 && sw < 1) {
      ctx.save(); const h = 560 * 16 / 9; rr(ctx, W / 2 - 280, 1170 - h / 2, 560, h, 48); ctx.clip();
      const x = lerp(W / 2 - 600, W / 2 + 600, sw); const g = ctx.createLinearGradient(x - 120, 0, x + 120, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(W / 2 - 300, 1170 - h / 2, 600, h); ctx.restore();
    }
  },
  styles(ctx, lt, p, t) {
    const dur = p.end - p.start;
    text(ctx, '6', W / 2 - 210, 330, 200, C.acc, { alpha: easeOut(seg(lt, 0, 0.5)) });
    text(ctx, '种画面风格', W / 2 + 70, 340, 92, C.ink, { alpha: easeOut(seg(lt, 0.15, 0.5)) });
    const list = [['f1', '真人图文口播'], ['f2', '系列课介绍'], ['f3', '手绘图解'], ['f4', '深度解读'], ['f5', '像素小剧场'], ['f6', '知识卡片']];
    // 横向滚动的手机带，中间那台放大
    const gap = 430; const scroll = lerp(0, gap * 5, easeInOut(seg(lt, 0.4, dur - 0.7)));
    list.forEach(([img, name], i) => {
      const x = W / 2 + i * gap - scroll; if (x < -400 || x > W + 400) return;
      const near = 1 - clamp(Math.abs(x - W / 2) / gap);
      const sc = 0.78 + near * 0.3; const al = 0.45 + near * 0.55;
      phone(ctx, IMG[img], x, 1060, 400, { scale: sc, alpha: al * easeOut(seg(lt, 0.1 + i * 0.05, 0.5)), glow: near });
      text(ctx, name, x, 1060 + 400 * 16 / 9 * sc / 2 + 70, 44, near > 0.6 ? C.ink : C.dim, { weight: 700, alpha: al });
    });
  },
  trades(ctx, lt, p, t) {
    text(ctx, '12', W / 2 - 250, 330, 190, C.acc, { alpha: easeOut(seg(lt, 0, 0.5)) });
    text(ctx, '类培训行业', W / 2 + 70, 340, 92, C.ink, { alpha: easeOut(seg(lt, 0.15, 0.5)) });
    const rows = [['学科辅导', '考证考公', '外语口才', '钢琴声乐'], ['舞蹈', '美术书法', '少儿编程', '驾校'], ['美甲美妆', '健身游泳', '烘焙咖啡', '知识付费'],
      ['钢琴声乐', '驾校', '健身游泳', '学科辅导'], ['外语口才', '舞蹈', '知识付费', '美术书法']];
    rows.forEach((row, r) => {
      const y = 620 + r * 150; const dir = r % 2 ? 1 : -1; const k = easeOut(seg(lt, 0.2 + r * 0.08, 0.5));
      let x = -200 + dir * (t * 70 % 400) + (r % 2 ? -150 : 0);
      for (let rep = 0; rep < 3; rep++) for (const [j, s] of row.entries()) {
        const hot = (r + j + rep) % 5 === 0;
        setFont(ctx, 46, 700); const w = ctx.measureText(s).width + 76;
        chip(ctx, s, x + w / 2, y, { size: 46, h: 104, bg: hot ? 'rgba(255,90,31,.16)' : C.card, border: hot ? 'rgba(255,90,31,.55)' : C.line, color: hot ? C.acc2 : C.ink, alpha: k * (hot ? 1 : 0.8) });
        x += w + 26;
      }
    });
    // 两边渐隐
    for (const [x0, x1] of [[0, 180], [W, W - 180]]) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, C.bg); g.addColorStop(1, 'rgba(14,13,12,0)'); ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), 520, 180, 800); }
    const L1 = lineAt(p, 1); const k2 = easeOut(seg(lt, L1.start - p.start, 0.5));
    if (k2 > 0) typeIn(ctx, '做培训的，都能用', W / 2, 1450, 84, C.ink, seg(lt, L1.start - p.start, 0.9) * 2);
  },
  remix(ctx, lt, p, t) {
    const L1 = lineAt(p, 1); const t1 = L1.start - p.start;
    text(ctx, '用别人的爆款做', W / 2, 330, 104, C.ink, { alpha: easeOut(seg(lt, 0, 0.5)) });
    const a = easeOut(seg(lt, 0.2, 0.6));
    phone(ctx, IMG.f4, 265, 1020, 360, { alpha: a, rot: -0.05 * a, glow: 0.2 });
    chip(ctx, '同行爆款', 265, 1020 + 360 * 8 / 9 + 70, { size: 40, h: 84, alpha: a });
    // 箭头
    const ar = easeInOut(seg(lt, t1 - 0.2, 0.6));
    if (ar > 0) {
      ctx.save(); ctx.strokeStyle = C.acc; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(480, 1040); ctx.lineTo(lerp(480, 598, ar), 1040); ctx.stroke();
      if (ar > 0.9) { ctx.beginPath(); ctx.moveTo(575, 1012); ctx.lineTo(602, 1040); ctx.lineTo(575, 1068); ctx.stroke(); }
      ctx.restore();
      text(ctx, '学打法', 540, 975, 36, C.acc2, { weight: 700, alpha: ar });
    }
    const b = easeOut(seg(lt, t1 + 0.3, 0.6));
    phone(ctx, IMG.f7, 815, 1020, 360, { alpha: b, scale: 0.85 + pop(b) * 0.15, rot: 0.04 * b });
    if (b > 0) chip(ctx, '你的版本', 815, 1020 + 360 * 8 / 9 + 70, { size: 40, h: 84, bg: 'rgba(255,90,31,.16)', border: 'rgba(255,90,31,.55)', color: C.acc2, alpha: b });
    const c = easeOut(seg(lt, t1 + 1.2, 0.5));
    if (c > 0) text(ctx, '不照抄，换成你自己的内容', W / 2, 1560, 46, C.dim, { weight: 700, alpha: c });
  },
  trust(ctx, lt, p, t) {
    const L1 = lineAt(p, 1); const t1 = L1.start - p.start;
    text(ctx, '不乱编', W / 2, 330, 150, C.ink, { alpha: easeOut(seg(lt, 0, 0.5)) });
    const k = easeOut(seg(lt, 0.2, 0.6));
    const x = 110; const y = lerp(700, 620, k); const w = 860; const h = 700;
    ctx.save(); ctx.globalAlpha = k;
    rr(ctx, x, y, w, h, 36); ctx.fillStyle = '#f4f2ee'; ctx.fill();
    text(ctx, '口播文案', x + 60, y + 80, 40, '#141310', { align: 'left' });
    const rows = ['零基础学琴，先别急着练曲子。', '每天十分钟，把手型找对。', '我们的学员通过率 98%。', '下期讲怎么练节奏。'];
    rows.forEach((s, i) => {
      const ry = y + 190 + i * 120;
      if (i === 2) {
        const hl = easeOut(seg(lt, t1 + 0.1, 0.5));
        if (hl > 0) { setFont(ctx, 42, 700); const tw = ctx.measureText(s).width; ctx.fillStyle = C.yellow; rr(ctx, x + 46, ry - 34, (Math.max(tw, 500) + 30) * hl, 68, 10); ctx.fill(); }
      }
      text(ctx, s, x + 60, ry, 42, '#2b2925', { weight: 700, align: 'left' });
    });
    ctx.restore();
    const tag = easeOut(seg(lt, t1 + 0.6, 0.45));
    if (tag > 0) {
      ctx.save(); ctx.translate(835, y + 190 + 2 * 120); ctx.scale(pop(tag), pop(tag)); ctx.globalAlpha = clamp(tag * 2);
      rr(ctx, -118, -38, 236, 76, 20); ctx.fillStyle = '#141310'; ctx.fill();
      text(ctx, '⚠ 要核实', 0, 2, 34, C.yellow, { weight: 700 }); ctx.restore();
    }
    const c = easeOut(seg(lt, t1 + 1.1, 0.5));
    if (c > 0) text(ctx, '拿不准的地方，自动标黄', W / 2, 1460, 50, C.dim, { weight: 700, alpha: c });
  },
  end(ctx, lt, p, t) {
    const L1 = lineAt(p, 1); const t1 = L1.start - p.start;
    const k = seg(lt, 0, 0.7);
    // 光圈
    const ring = easeOut(seg(lt, 0, 1.2));
    ctx.save(); ctx.globalAlpha = (1 - ring) * 0.8; ctx.strokeStyle = C.acc; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, 760, 140 + ring * 500, 0, 7); ctx.stroke(); ctx.restore();
    const g = ctx.createRadialGradient(W / 2, 760, 0, W / 2, 760, 420); g.addColorStop(0, `rgba(255,90,31,${0.35 * easeOut(k)})`); g.addColorStop(1, 'rgba(255,90,31,0)'); ctx.fillStyle = g; ctx.fillRect(0, 300, W, 900);
    const s = pop(k);
    ctx.save(); ctx.translate(W / 2, 760); ctx.scale(s, s); logo(ctx, 0, 0, 260, clamp(k * 3)); ctx.restore();
    typeIn(ctx, '出片王', W / 2, 1040, 150, C.ink, seg(lt, 0.3, 0.8) * 2, { stagger: 0.12 });
    const tg = easeOut(seg(lt, t1, 0.6));
    if (tg > 0) text(ctx, '一句话，出一条视频', W / 2, 1200 + (1 - tg) * 30, 62, C.acc2, { weight: 700, alpha: tg, spacing: 6 });
    const b = easeOut(seg(lt, t1 + 0.9, 0.6));
    if (b > 0) chip(ctx, '一次买断 · 不按条收费', W / 2, 1390, { size: 38, h: 84, alpha: b });
  },
};

// ---------------------------------------------------------------- 字幕
function subtitle(ctx, sec, t) {
  const ln = sec.lines.find((l) => t >= l.start - 0.05 && t < l.end + 0.25); if (!ln?.text) return;
  const k = easeOut(seg(t, ln.start - 0.05, 0.2));
  ctx.save(); ctx.globalAlpha = k; setFont(ctx, 44, 700);
  const s = ln.text.replace(/[。！]$/, ''); const w = ctx.measureText(s).width + 64;
  rr(ctx, W / 2 - w / 2, 1712, w, 84, 42); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, W / 2, 1756); ctx.restore();
}

// ---------------------------------------------------------------- 主入口
export function drawFrame(ctx, { script, tl, planData, t }) {
  background(ctx, t);
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx]; const lt = t - p.start;
  const fn = SCENES[s.scene] || SCENES.hook;
  // 进场：淡入 + 轻微缩放；出场最后 0.18 秒淡出
  const enter = easeOut(seg(lt, 0, 0.35)); const exit = idx < planData.length - 1 ? 1 - seg(t, p.end - 0.18, 0.18) : 1;
  ctx.save(); ctx.globalAlpha = enter * exit; const sc = 1.03 - 0.03 * enter; ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  fn(ctx, lt, p, t);
  ctx.restore();
  // 角标
  if (s.scene !== 'end') { logo(ctx, 92, 96, 52, 0.9); text(ctx, '出片王', 132, 98, 34, 'rgba(244,242,238,.85)', { align: 'left' }); }
  // 转场：一道橙色细线扫过
  const sw = seg(lt, 0, 0.32);
  if (idx > 0 && sw < 1) { ctx.fillStyle = C.acc; ctx.fillRect(0, H * easeOut(sw) - 4, W, 8); }
  if (s.scene !== 'end') subtitle(ctx, tl.sections[idx], t);
}

export async function preloadFonts(script) {
  const txt = JSON.stringify(script) + '做教培的都知道该发短视频写文案剪视频天天拍每一样都要时间现在只要一句话我是教钢琴的讲讲零基础怎么入门说一句你想讲什么生成成片→AI写口播自动配音配乐出画面几分钟一条竖屏成片✓1080×1920MP46种画面风格真人图文口播系列课介绍手绘图解深度解读像素小剧场知识卡片12类培训行业学科辅导考证考公外语口才钢琴声乐舞蹈美术书法少儿编程驾校美甲美妆健身游泳烘焙咖啡知识付费做培训的都能用用别人的爆款做同行爆款学打法你的版本不照抄换成你自己的内容不乱编口播文案零基础学琴先别急着练曲子每天十分钟把手型找对我们的学员通过率98%下期讲怎么练节奏⚠这个数字要核实拿不准的地方自动标黄出片王一句话出一条视频一次买断·不按条收费0123456789';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, txt), fonts.load(`700 40px "Noto Sans SC"`, txt)]);
}
export function normalize(s) { return s; }
