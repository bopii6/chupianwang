// 形式 05：深度解读
// 灵魂：顶部一个“为什么”大问题全程钉住（观众带着问题看完），中间 16:9 实拍画面每句一换，
// 关键处叠一层“信息贴片”（蓝色标签、斜体大字、数据卡、引语），底部一行字幕。像一档财经/行业解读节目。
// 画面来源：客户现场照片优先，其余按关键词从正版素材库（Pexels）找；都没有时画科技感兜底面板。
import { W, H, clamp, easeOut, font, fitFont, wrap, countUp, hash } from '../engine/draw.js';
import { THEMES, themeEmoji, normalizeTheme, EMOJI_FONT } from './themes.js';

export const meta = {
  id: 'deep-dive',
  name: '深度解读',
  category: '知识讲解',
  outcome: '用一个“为什么”把家长问住，讲透背后的门道，立住“懂行”的专业人设',
  ideas: ['为什么越来越多家长不报奥数了', '为什么孩子刷了很多题，成绩还是上不去', '中考分流之后，普高到底有多难进', '为什么有的机构开一家倒一家'],
  tagline: '财经解读节目风：钉住一个大问题，实拍画面每句一换，层层拆解',
  fits: '行业解读 · 政策分析 · 教育观点 · 立专业人设',
  durations: [1, 2, 3],
  bgm: 'story',
  needsStock: true,
  coverIdx: 4,
  photoKind: 'scenes',
  photoHint: '可选：上传课堂、校区、学员作品等现场照片，讲到“我们”的时候会优先用。其余画面自动从正版素材库匹配。照片只存在你自己的电脑里。',
};

export const skins = {
  navy: { name: '深蓝财经', bg: '#060a13', bg2: '#0c1424', bar: '#121926', net: 'rgba(120,150,200,', ink: '#ffffff', hl: '#ffe12e', chip1: '#3f86ff', chip2: '#1745c9', chipEdge: 'rgba(170,205,255,0.95)', statInk: '#1747d1' },
  noir: { name: '黑金', bg: '#070707', bg2: '#141414', bar: '#171717', net: 'rgba(200,180,130,', ink: '#ffffff', hl: '#f6c343', chip1: '#e0a92a', chip2: '#9c6b0c', chipEdge: 'rgba(255,230,160,0.95)', statInk: '#a86d00' },
  crimson: { name: '热血红', bg: '#0d0607', bg2: '#1c0b0d', bar: '#1c1012', net: 'rgba(220,130,130,', ink: '#ffffff', hl: '#ffd84a', chip1: '#ff4a4a', chip2: '#b3121c', chipEdge: 'rgba(255,190,190,0.95)', statInk: '#c3161f' },
};

const VISUALS = ['shot', 'chips', 'big', 'stat', 'quote', 'question', 'compare', 'steps', 'checklist', 'marker', 'nametag', 'timeline', 'poll', 'ticker',
  'caption', 'magnifier', 'qa', 'breaking', 'polaroid', 'top3', 'chain', 'stamp', 'sticky', 'cinema', 'location', 'chat', 'tape', 'tug'];
/** 颜色加深（行业主色做标签渐变的下半截） */
function darker(hex, amt = 0.35) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * (1 - amt)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
const SY = 620; const SH = 608; // 画面区 1080×608（16:9）
const SKEW = -0.16; // 标题斜体

// ---------- 工具 ----------
const pop = (t, t0, dur = 0.24) => {
  if (t0 == null || t < t0) return 0;
  const k = clamp((t - t0) / dur);
  return k < 0.7 ? easeOut(k / 0.7) * 1.08 : 1.08 - 0.08 * ((k - 0.7) / 0.3);
};
function withPop(ctx, s, cx, cy, fn) {
  if (s <= 0.001) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.globalAlpha *= clamp(s * 1.6); fn(); ctx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
/** 斜体“标题字”：Noto 900 横向略压窄 + 右倾，接近节目常用的窄体标题字 */
function slantText(ctx, text, x, y, size, fill, { align = 'center', stroke = 0, strokeColor = 'rgba(0,0,0,0.85)', squeeze = 0.92 } = {}) {
  font(ctx, size, 900);
  const w = ctx.measureText(text).width * squeeze;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.translate(x0, y); ctx.transform(squeeze, 0, SKEW, 1, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
  return w;
}
function fitSlant(ctx, text, size, maxW, squeeze = 0.92) {
  let s = size; font(ctx, s, 900);
  while (s > 20 && ctx.measureText(text).width * squeeze > maxW) { s -= 2; font(ctx, s, 900); }
  return s;
}

// ---------- 背景：缓慢漂移的“网络节点”连线 ----------
const NODES = Array.from({ length: 46 }, (_, i) => ({ x: hash(i + 1) * W, y: hash(i + 101) * H, ax: 20 + hash(i + 201) * 40, ay: 20 + hash(i + 301) * 40, sp: 0.05 + hash(i + 401) * 0.12, ph: hash(i + 501) * 6.28 }));
function drawNet(ctx, skin, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, skin.bg2); g.addColorStop(0.5, skin.bg); g.addColorStop(1, skin.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const pts = NODES.map((n) => [n.x + Math.sin(t * n.sp + n.ph) * n.ax, n.y + Math.cos(t * n.sp * 0.8 + n.ph) * n.ay]);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0]; const dy = pts[i][1] - pts[j][1];
      const d2 = dx * dx + dy * dy;
      if (d2 > 330 * 330) continue;
      ctx.strokeStyle = skin.net + (0.22 * (1 - Math.sqrt(d2) / 330)).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
    }
  }
  ctx.fillStyle = skin.net + '0.45)';
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
}

// ---------- 时间规划 ----------
const itemCount = (v) => {
  switch (v?.type) {
    case 'chips': case 'steps': case 'checklist': case 'top3': case 'chain': case 'sticky': return (v.items || []).length;
    case 'chat': return (v.msgs || []).length;
    case 'qa': case 'stamp': case 'tug': return 2;
    case 'timeline': return (v.nodes || []).length;
    case 'big': case 'question': case 'compare': case 'nametag': case 'poll': return 2;
    case 'marker': return v.sub ? 2 : 1;
    case 'shot': return 0;
    default: return 1;
  }
};
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i]; const next = tl.sections[i + 1];
    const n = itemCount(s.visual);
    const a = sec.start + 0.3;
    const b = Math.max(a + 0.4, sec.lines.length > 1 ? sec.lines[sec.lines.length - 1].start + 0.2 : sec.lines[0].end - 0.8);
    const steps = [];
    for (let k = 0; k < n; k++) steps.push(n === 1 ? a : a + ((b - a) * k) / Math.max(1, n - 1));
    return { start: sec.start, end: next ? next.start : tl.duration, lineEnd: sec.end, steps };
  });
}

// ---------- 画面（照片推拉摇移） ----------
function drawMedia(ctx, img, i, p, t) {
  const dur = Math.max(0.5, p.end - p.start);
  const k = clamp((t - p.start) / dur);
  const mode = Math.floor(hash(i * 7 + 3) * 4);
  const base = Math.max(W / img.width, SH / img.height);
  let z = 1.08; let ox = 0; let oy = 0;
  if (mode === 0) z = 1.02 + 0.1 * k; else if (mode === 1) z = 1.12 - 0.1 * k;
  else { z = 1.12; ox = (mode === 2 ? 1 : -1) * (k - 0.5) * 70; }
  const s = base * z;
  const dw = img.width * s; const dh = img.height * s;
  // 竖图偏上取景（人脸多在上半部分）
  const fy = img.height > img.width ? 0.32 : 0.5;
  const top = clamp(SY + SH / 2 - dh * fy + oy, SY + SH - dh, SY);
  ctx.drawImage(img, W / 2 - dw / 2 + ox, top, dw, dh);
}
/** 没有画面时的兜底：深色科技面板 + 画面描述大字 */
function drawPlaceholder(ctx, skin, label, i, t) {
  const g = ctx.createLinearGradient(0, SY, W, SY + SH);
  g.addColorStop(0, skin.bg2); g.addColorStop(1, skin.bar);
  ctx.fillStyle = g; ctx.fillRect(0, SY, W, SH);
  ctx.strokeStyle = skin.net + '0.12)'; ctx.lineWidth = 2;
  const off = (t * 16) % 60;
  ctx.beginPath();
  for (let x = -60 + off; x < W + 60; x += 60) { ctx.moveTo(x, SY); ctx.lineTo(x, SY + SH); }
  for (let y = SY; y <= SY + SH; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // 扫描光
  const sx = ((t * 0.35 + hash(i)) % 1) * (W + 400) - 200;
  const sg = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.06)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, SY, W, SH);
  if (label) {
    const size = fitSlant(ctx, label, 130, W - 160);
    ctx.globalAlpha = 0.16; slantText(ctx, label, W / 2, SY + SH / 2, size, skin.ink); ctx.globalAlpha = 1;
  }
}

// ---------- 信息贴片 ----------
// 均匀折行：两行字数差不多，避免最后一行只剩一个字
function bwrap(ctx, s, maxW, maxLines = 2) {
  s = String(s || ''); const w = ctx.measureText(s).width; if (w <= maxW) return [s];
  const n = Math.min(maxLines, Math.ceil(w / maxW)); const per = Math.ceil(s.length / n); const out = [];
  for (let i = 0; i < s.length; i += per) out.push(s.slice(i, i + per));
  for (let k = 1; k < out.length; k++) while (/^[，。！？、；：,.!?]/.test(out[k])) { out[k - 1] += out[k][0]; out[k] = out[k].slice(1); }
  return out.filter(Boolean).slice(0, maxLines);
}

// 先把舞台画面拷一份，再往上盖暗层（拍立得用）
let _snap = null;
function snapStage(ctx) {
  if (!_snap) _snap = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, SH) : Object.assign(document.createElement('canvas'), { width: W, height: SH });
  const c = _snap.getContext('2d'); c.clearRect(0, 0, W, SH); c.drawImage(ctx.canvas, 0, SY, W, SH, 0, 0, W, SH); return _snap;
}

function drawOverlay(ctx, v, p, t, skin, i) {
  const st = p.steps; const cx = W / 2;
  switch (v.type) {
    case 'chips': {
      const items = (v.items || []).slice(0, 4);
      font(ctx, 46, 900);
      const ws = items.map((s) => Math.min(320, ctx.measureText(s).width + 64));
      const gap = 22; const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      const scale = Math.min(1, (W - 60) / total);
      let x = cx - (total * scale) / 2; const y = SY + SH - 100;
      items.forEach((s, k) => {
        const w = ws[k] * scale; const h = 92 * scale;
        withPop(ctx, pop(t, st[k]), x + w / 2, y, () => {
          ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
          const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2);
          ctx.fillStyle = g; rr(ctx, x, y - h / 2, w, h, 12 * scale); ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = skin.chipEdge; ctx.lineWidth = 3; rr(ctx, x + 1.5, y - h / 2 + 1.5, w - 3, h - 3, 11 * scale); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, x + 6, y - h / 2 + 6, w - 12, h * 0.36, 8 * scale); ctx.fill();
          fitFont(ctx, s, 46 * scale, w - 30, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s, x + w / 2, y + 2);
        });
        x += w + gap * scale;
      });
      break;
    }
    case 'big': {
      // 左侧压暗 + 两行斜体大字从左侧带拖影滑入
      const k0 = clamp((t - st[0] + 0.1) / 0.3);
      const g = ctx.createLinearGradient(0, 0, W * 0.85, 0);
      g.addColorStop(0, `rgba(0,0,0,${0.6 * k0})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, SY, W, SH);
      const [l1, l2] = v.lines || [];
      [[l1, skin.ink, SY + SH * 0.42], [l2, skin.hl, SY + SH * 0.66]].forEach(([s, color, y], k) => {
        if (!s || t < st[k]) return;
        const e = easeOut(clamp((t - st[k]) / 0.32));
        const size = fitSlant(ctx, s, 104, W - 110);
        for (let gh = 3; gh >= 0; gh--) {
          const back = (1 - e) * 260 + gh * (1 - e) * 60;
          ctx.globalAlpha = gh ? 0.18 * (1 - e) : clamp(e * 1.6);
          slantText(ctx, s, 56 - back, y, size, color, { align: 'left', stroke: size * 0.12 });
        }
        ctx.globalAlpha = 1;
      });
      break;
    }
    case 'stat': {
      withPop(ctx, pop(t, st[0], 0.3), 300, SY + SH / 2, () => {
        const x = 60; const y = SY + SH / 2 - 150; const w = 470; const h = 300;
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
        ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, x, y, w, h, 22); ctx.fill();
        ctx.shadowColor = 'transparent';
        fitFont(ctx, v.label || '', 40, w - 60, 900); ctx.fillStyle = skin.statInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.label || '', x + w / 2, y + 58);
        ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 40, y + 96, w - 80, 2);
        if (v.sub) { font(ctx, 28, 700); ctx.fillStyle = '#7a8394'; ctx.fillText(v.sub, x + w / 2, y + 128); }
        const val = countUp(v.big || '', clamp((t - st[0]) / 0.9));
        font(ctx, 46, 900); const uw = v.unit ? ctx.measureText(v.unit).width + 10 : 0;
        const bs = fitFont(ctx, val, 120, w - 70 - uw, 900); const bw = ctx.measureText(val).width;
        const bx = x + w / 2 - (bw + uw) / 2;
        ctx.fillStyle = skin.statInk; ctx.textAlign = 'left'; ctx.fillText(val, bx, y + 210);
        if (v.unit) { font(ctx, 40, 900); ctx.fillStyle = '#3b4252'; ctx.fillText(v.unit, bx + bw + 10, y + 210 + bs * 0.18); }
      });
      break;
    }
    case 'quote': {
      const e = easeOut(clamp((t - st[0]) / 0.35));
      if (e <= 0) break;
      ctx.save(); ctx.globalAlpha = e;
      const x = 50; const w = W - 100;
      font(ctx, 48, 900);
      const rows = wrap(ctx, v.text || '', w - 110, 3);
      const h = 70 + rows.length * 66 + (v.by ? 56 : 0);
      const y = SY + SH - h - 34 + (1 - e) * 30;
      ctx.fillStyle = 'rgba(8,10,16,0.82)'; rr(ctx, x, y, w, h, 18); ctx.fill();
      ctx.fillStyle = skin.hl; ctx.fillRect(x, y + 20, 8, h - 40);
      ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      rows.forEach((r, k) => ctx.fillText(r, x + 56, y + 66 + k * 66));
      if (v.by) { font(ctx, 32, 700); ctx.fillStyle = skin.hl; ctx.fillText('—— ' + v.by, x + 56, y + 66 + rows.length * 66); }
      ctx.restore();
      break;
    }
    case 'question': {
      ctx.fillStyle = `rgba(0,0,0,${0.5 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      // 漂浮的问号
      ctx.save(); font(ctx, 54, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let q = 0; q < 26; q++) {
        const life = ((t - p.start) * (0.25 + hash(q + 9) * 0.3) + hash(q + 3)) % 1;
        const x = hash(q + 17) * W; const y = SY + SH - life * (SH + 80) + 40;
        ctx.globalAlpha = 0.55 * Math.sin(life * Math.PI);
        ctx.fillStyle = '#ffffff'; font(ctx, 30 + hash(q + 5) * 40, 900); ctx.fillText('?', x, y);
      }
      ctx.restore();
      const [l1, l2] = v.lines || [];
      if (l1) withPop(ctx, pop(t, st[0]), cx, SY + 220, () => {
        const size = fitFont(ctx, l1, 64, W - 200, 900); const w = ctx.measureText(l1).width;
        ctx.fillStyle = skin.hl; ctx.globalAlpha *= 0.92; ctx.fillRect(cx - w / 2 - 22, SY + 220 - size * 0.62, w + 44, size * 1.24); ctx.globalAlpha = 1;
        ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l1, cx, SY + 222);
      });
      if (l2 && t >= st[1]) {
        const e = easeOut(clamp((t - st[1]) / 0.3));
        const size = fitSlant(ctx, l2, 96, W - 120);
        ctx.globalAlpha = e; slantText(ctx, l2, cx, SY + 400 + (1 - e) * 30, size, skin.ink, { stroke: size * 0.14 }); ctx.globalAlpha = 1;
      }
      break;
    }
    // ---------- 新增贴片 ----------
    case 'compare': { // 误区 vs 真相：压暗画面，左右两块面板
      ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      const pw = 450; const y0 = SY + 90; const ph = SH - 150;
      const panel = (x, label, items, hot, s0) => {
        const e = easeOut(clamp((t - s0) / 0.35)); if (e <= 0) return;
        ctx.save(); ctx.globalAlpha *= e; ctx.translate((hot ? 1 : -1) * (1 - e) * 80, 0);
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.94)' : 'rgba(20,24,32,0.88)'; rr(ctx, x, y0, pw, ph, 18); ctx.fill();
        const g = ctx.createLinearGradient(0, y0, 0, y0 + 86); g.addColorStop(0, hot ? skin.chip1 : '#4a5160'); g.addColorStop(1, hot ? skin.chip2 : '#30353f');
        ctx.fillStyle = g; rr(ctx, x, y0, pw, 86, [18, 18, 0, 0]); ctx.fill();
        fitFont(ctx, label, 48, pw - 40, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + pw / 2, y0 + 45);
        items.slice(0, 3).forEach((it, k) => {
          const yy = y0 + 150 + k * 100;
          font(ctx, 46, 900); ctx.fillStyle = hot ? skin.statInk : '#8a93a5'; ctx.textAlign = 'left'; ctx.fillText(hot ? '✓' : '✗', x + 34, yy);
          fitFont(ctx, it, 42, pw - 110, 900); ctx.fillStyle = hot ? '#1b2230' : '#c7ccd6'; ctx.fillText(it, x + 90, yy + 2);
        });
        ctx.restore();
      };
      panel(60, v.left?.label || '误区', v.left?.items || [], false, st[0] ?? p.start + 0.3);
      panel(W - 60 - pw, v.right?.label || '真相', v.right?.items || [], true, st[1] ?? p.start + 0.8);
      break;
    }
    case 'steps': { // 底部一条步骤带：编号 + 箭头，逐个亮起
      const items = (v.items || []).slice(0, 4); const n = Math.max(1, items.length);
      const by = SY + SH - 190; ctx.fillStyle = `rgba(6,10,19,${0.82 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, by, W, 190);
      const bw = (W - 80 - (n - 1) * 50) / n;
      items.forEach((it, k) => {
        const x = 40 + k * (bw + 50); const a = pop(t, st[k]);
        withPop(ctx, a, x + bw / 2, by + 95, () => {
          const g = ctx.createLinearGradient(0, by + 40, 0, by + 150); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2);
          ctx.fillStyle = g; rr(ctx, x, by + 40, bw, 110, 14); ctx.fill();
          ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.arc(x + 40, by + 95, 26, 0, Math.PI * 2); ctx.fill();
          font(ctx, 32, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), x + 40, by + 97);
          fitFont(ctx, it, 40, bw - 90, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(it, x + 78, by + 97);
        });
        if (k < n - 1 && t >= (st[k + 1] ?? 1e9)) { ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.moveTo(x + bw + 14, by + 80); ctx.lineTo(x + bw + 36, by + 95); ctx.lineTo(x + bw + 14, by + 110); ctx.fill(); }
      });
      break;
    }
    case 'checklist': { // 右侧清单面板
      const x = W - 500; const y0 = SY + 50; const w = 460; const items = (v.items || []).slice(0, 4); const h = 120 + items.length * 96;
      const e = easeOut(clamp((t - p.start - 0.1) / 0.35)); if (e <= 0) break;
      ctx.save(); ctx.globalAlpha *= e; ctx.translate((1 - e) * 120, 0);
      ctx.fillStyle = 'rgba(6,10,19,0.86)'; rr(ctx, x, y0, w, h, 18); ctx.fill();
      fitFont(ctx, v.title || '', 44, w - 60, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.title || '', x + 32, y0 + 58);
      items.forEach((it, k) => {
        const a = clamp((t - (st[k] ?? 1e9)) / 0.3); const yy = y0 + 130 + k * 96;
        ctx.save(); ctx.globalAlpha *= 0.3 + 0.7 * a;
        ctx.fillStyle = a > 0 ? skin.chip1 : 'rgba(255,255,255,0.15)'; rr(ctx, x + 30, yy - 26, 52, 52, 12); ctx.fill();
        if (a > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x + 42, yy); ctx.lineTo(x + 53, yy + 11); ctx.lineTo(x + 71, yy - 12); ctx.stroke(); }
        fitFont(ctx, it, 40, w - 140, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(it, x + 104, yy + 2);
        ctx.restore();
      });
      ctx.restore();
      break;
    }
    case 'marker': { // 荧光笔划重点：一个关键词，黄色笔刷从左往右刷过去
      ctx.fillStyle = `rgba(0,0,0,${0.45 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      const word = v.word || ''; const size = fitSlant(ctx, word, 150, W - 160); font(ctx, size, 900); const w = ctx.measureText(word).width * 0.92;
      const k = easeOut(clamp((t - (st[0] ?? p.start)) / 0.45)); const y = SY + (v.sub ? SH * 0.42 : SH * 0.5);
      ctx.fillStyle = skin.hl; ctx.save(); ctx.translate(W / 2 - w / 2 - 30, y - size * 0.1); ctx.transform(1, 0, SKEW, 1, 0, 0); ctx.fillRect(0, 0, (w + 60) * k, size * 0.55); ctx.restore();
      if (k > 0) slantText(ctx, word, W / 2, y, size, '#ffffff', { stroke: size * 0.1 });
      if (v.sub && t >= (st[1] ?? 1e9)) { const e = easeOut(clamp((t - st[1]) / 0.3)); ctx.globalAlpha = e; fitFont(ctx, v.sub, 50, W - 160, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, W / 2, y + size * 0.62 + 50); ctx.globalAlpha = 1; }
      break;
    }
    case 'nametag': { // 电视名牌：左下角，名字条 + 身份条依次滑出
      const x = 50; const y = SY + SH - 200;
      const e1 = easeOut(clamp((t - (st[0] ?? p.start)) / 0.35));
      if (e1 > 0) {
        fitFont(ctx, v.name || '', 56, 520, 900); const nw = ctx.measureText(v.name || '').width + 70;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, nw * e1, 90); ctx.clip();
        const g = ctx.createLinearGradient(x, 0, x + nw, 0); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2);
        ctx.fillStyle = g; ctx.fillRect(x, y, nw, 90); ctx.fillStyle = skin.hl; ctx.fillRect(x, y, 10, 90);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.name || '', x + 40, y + 47);
        ctx.restore();
      }
      const e2 = easeOut(clamp((t - (st[1] ?? 1e9)) / 0.35));
      if (e2 > 0 && v.role) {
        fitFont(ctx, v.role, 38, 640, 900); const rw = ctx.measureText(v.role).width + 60;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y + 90, rw * e2, 66); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x, y + 90, rw, 66);
        ctx.fillStyle = '#1b2230'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.role, x + 30, y + 124);
        ctx.restore();
      }
      break;
    }
    case 'timeline': { // 底部时间轴：节点逐个点亮
      const nodes = (v.nodes || []).slice(0, 5); const n = Math.max(1, nodes.length);
      const by = SY + SH - 220; ctx.fillStyle = `rgba(6,10,19,${0.84 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, by, W, 220);
      const x0 = 110; const x1 = W - 110; const ly = by + 100; const gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x0, ly - 3, x1 - x0, 6);
      const k = clamp((t - (st[0] ?? 1e9) + 0.2) / Math.max(0.3, (st[n - 1] ?? 0) - (st[0] ?? 0) + 0.2)); ctx.fillStyle = skin.hl; ctx.fillRect(x0, ly - 3, (x1 - x0) * easeOut(k), 6);
      nodes.forEach((nd, i) => {
        const x = n > 1 ? x0 + gap * i : W / 2;
        withPop(ctx, pop(t, st[i]), x, ly, () => {
          ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.arc(x, ly, 16, 0, Math.PI * 2); ctx.fill();
          fitFont(ctx, nd.when || '', 34, Math.max(140, gap - 10), 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nd.when || '', x, ly - 50);
          fitFont(ctx, nd.what || '', 34, Math.max(150, gap - 10), 700); ctx.fillStyle = '#ffffff'; ctx.fillText(nd.what || '', x, ly + 52);
        });
      });
      break;
    }
    case 'poll': { // 二选一：问题 + 两个大选项，引导评论区站队
      ctx.fillStyle = `rgba(0,0,0,${0.5 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      withPop(ctx, pop(t, p.start + 0.1), W / 2, SY + 110, () => {
        const size = fitFont(ctx, v.q || '', 58, W - 200, 900); const w = ctx.measureText(v.q || '').width;
        ctx.fillStyle = skin.hl; ctx.fillRect(W / 2 - w / 2 - 24, SY + 110 - size * 0.62, w + 48, size * 1.24);
        ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.q || '', W / 2, SY + 112);
      });
      (v.options || []).slice(0, 2).forEach((o, k) => {
        const x = k ? W / 2 + 20 : 70; const w = W / 2 - 90; const y = SY + 230;
        withPop(ctx, pop(t, st[k]), x + w / 2, y + 140, () => {
          const g = ctx.createLinearGradient(0, y, 0, y + 280); g.addColorStop(0, k ? skin.chip1 : '#4a5160'); g.addColorStop(1, k ? skin.chip2 : '#2a2f39');
          ctx.fillStyle = g; rr(ctx, x, y, w, 280, 22); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; ctx.stroke();
          font(ctx, 90, 900); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k ? 'B' : 'A', x + w / 2, y + 90);
          font(ctx, 46, 900); const ls = wrap(ctx, o, w - 50, 2); ctx.fillStyle = '#ffffff'; ls.forEach((l, j) => ctx.fillText(l, x + w / 2, y + 180 + j * 56 - (ls.length - 1) * 28));
        });
      });
      break;
    }
    case 'ticker': { // “划重点”新闻条：左边色块标签 + 一行重点从右滑入
      const y = SY + SH - 150; const e = easeOut(clamp((t - (st[0] ?? p.start)) / 0.4));
      if (e <= 0) break;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(0, y, W * e, 110);
      const g = ctx.createLinearGradient(0, y, 0, y + 110); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2);
      fitFont(ctx, v.label || '划重点', 46, 220, 900); const lw = ctx.measureText(v.label || '划重点').width + 70;
      ctx.fillStyle = g; ctx.fillRect(0, y, lw, 110); ctx.fillStyle = skin.hl; ctx.fillRect(lw, y, 10, 110);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.label || '划重点', 32, y + 57);
      ctx.save(); ctx.beginPath(); ctx.rect(lw + 10, y, W - lw - 10, 110); ctx.clip();
      fitFont(ctx, v.text || '', 44, W - lw - 60, 900); ctx.fillStyle = '#111827'; ctx.fillText(v.text || '', lw + 34 + (1 - e) * 300, y + 57);
      ctx.restore();
      ctx.fillStyle = skin.hl; ctx.fillRect(0, y + 110, W * e, 6);
      break;
    }
    // ---------- 第三批贴片（到 28 种） ----------
    case 'caption': { // 解说卡：底部一块半透明卡，小标题 + 两行解说
      const e = easeOut(clamp((t - (st[0] ?? p.start)) / 0.35)); if (e <= 0) break;
      const x = 50; const w = W - 100; const h = 220; const y = SY + SH - h - 30 + (1 - e) * 40;
      ctx.save(); ctx.globalAlpha *= e; ctx.fillStyle = 'rgba(6,10,19,0.84)'; rr(ctx, x, y, w, h, 18); ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + 64); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2); fitFont(ctx, v.title || '', 36, w - 80, 900); const tw = ctx.measureText(v.title || '').width + 44;
      ctx.fillStyle = g; rr(ctx, x + 30, y - 26, tw, 56, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.title || '', x + 52, y + 3);
      font(ctx, 42, 700); const ls = wrap(ctx, v.text || '', w - 80, 2); ctx.fillStyle = '#fff'; ls.forEach((l, k) => ctx.fillText(l, x + 40, y + 90 + k * 60));
      ctx.restore(); break;
    }
    case 'magnifier': { // 放大镜：把画面中间放大看，旁边写一个标签
      const e = easeOut(clamp((t - (st[0] ?? p.start)) / 0.4)); if (e <= 0) break;
      const mx = W * 0.62; const my = SY + SH * 0.48; const r = 170 * e;
      ctx.save(); ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(ctx.canvas, mx - r / 1.9, my - r / 1.9, r * 2 / 1.9, r * 2 / 1.9, mx - r, my - r, r * 2, r * 2); ctx.restore();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(mx + r * 0.72, my + r * 0.72); ctx.lineTo(mx + r * 1.12, my + r * 1.12); ctx.stroke(); ctx.lineCap = 'butt';
      if (v.label) withPop(ctx, pop(t, (st[0] ?? p.start) + 0.3), 260, SY + SH * 0.48, () => { fitFont(ctx, v.label, 52, 400, 900); const w = ctx.measureText(v.label).width + 60; const g = ctx.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2); ctx.fillStyle = g; rr(ctx, 260 - w / 2, SY + SH * 0.48 - 45, w, 90, 14); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.label, 260, SY + SH * 0.48 + 2); });
      break;
    }
    case 'qa': { // 问答：白色问题气泡 + 彩色回答气泡
      ctx.fillStyle = `rgba(0,0,0,${0.4 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      const bub = (txt, x, y, w, hot, s0, tag) => withPop(ctx, pop(t, s0), x + w / 2, y + 60, () => {
        font(ctx, 46, 900); const ls = wrap(ctx, txt, w - 140, 2); const h = 60 + ls.length * 60;
        if (hot) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2); ctx.fillStyle = g; } else ctx.fillStyle = 'rgba(255,255,255,0.95)';
        rr(ctx, x, y, w, h, 26); ctx.fill(); font(ctx, 56, 900); ctx.fillStyle = hot ? skin.hl : skin.statInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tag, x + 30, y + h / 2);
        font(ctx, 46, 900); ctx.fillStyle = hot ? '#fff' : '#1b2230'; ls.forEach((l, k) => ctx.fillText(l, x + 110, y + 60 + k * 60 - (ls.length - 1) * 0));
      });
      bub(v.q || '', 60, SY + 70, W - 220, false, st[0] ?? p.start + 0.2, 'Q');
      bub(v.a || '', 160, SY + 300, W - 220, true, st[1] ?? p.start + 0.8, 'A');
      break;
    }
    case 'breaking': { // 突发新闻：顶部红色标签 + 大标题条，闪一下
      const e = easeOut(clamp((t - (st[0] ?? p.start)) / 0.35)); if (e <= 0) break;
      const y = SY + SH - 260; const flash = Math.sin(t * 8) > 0;
      ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(0, y + 80, W * e, 120);
      ctx.fillStyle = flash ? '#e5252a' : '#b3121c'; ctx.fillRect(40, y, 250, 80); font(ctx, 46, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.label || '关注', 165, y + 42);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(70, y + 40, 8, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(0, y + 80, W, 120); ctx.clip(); fitFont(ctx, v.text || '', 58, W - 100, 900); ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.fillText(v.text || '', 50 + (1 - e) * 200, y + 142); ctx.restore();
      ctx.fillStyle = skin.chip1; ctx.fillRect(0, y + 200, W * e, 10);
      break;
    }
    case 'polaroid': { // 拍立得：画面缩成一张照片，下面手写一句话
      const e = easeOut(clamp((t - (st[0] ?? p.start)) / 0.5)); if (e <= 0) break;
      const snap = snapStage(ctx); const pw = 560 - 120 * (1 - e); const ph = pw * 0.62; const cx = W / 2; const cy = SY + SH / 2 - 20;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.06 * e);
      ctx.fillStyle = `rgba(0,0,0,${0.55 * e})`; ctx.fillRect(-W, -SH, W * 2, SH * 2);
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.fillRect(-pw / 2 - 24, -ph / 2 - 24, pw + 48, ph + 130); ctx.shadowColor = 'transparent';
      ctx.drawImage(snap, 0, 0, W, SH, -pw / 2, -ph / 2, pw, ph);
      fitFont(ctx, v.caption || '', 44, pw, 700); ctx.fillStyle = '#2a2a2a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.caption || '', 0, ph / 2 + 55);
      ctx.restore(); break;
    }
    case 'top3': { // 右侧前三：金银铜三条
      const items = (v.items || []).slice(0, 3); const x = W - 520; const w = 480; const cols = ['#f2c14e', '#c9ced6', '#d9955b'];
      if (v.title) { const e = easeOut(clamp((t - p.start) / 0.3)); ctx.globalAlpha = e; fitFont(ctx, v.title, 44, w, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.title, x, SY + 70); ctx.globalAlpha = 1; }
      items.forEach((it, i) => { const k = items.length - 1 - i; const a = easeOut(clamp((t - (st[k] ?? 1e9)) / 0.3)); if (a <= 0) return; const y = SY + 120 + i * 140;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - a) * 100, 0); ctx.fillStyle = 'rgba(6,10,19,0.86)'; rr(ctx, x, y, w, 116, 16); ctx.fill();
        ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(x + 62, y + 58, 38, 0, Math.PI * 2); ctx.fill(); font(ctx, 46, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x + 62, y + 60);
        fitFont(ctx, it, 44, w - 150, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(it, x + 124, y + 60); ctx.restore(); });
      break;
    }
    case 'chain': { // 因果链：A → 导致 → B → 导致 → C
      ctx.fillStyle = `rgba(0,0,0,${0.5 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      const items = (v.items || []).slice(0, 3); const n = Math.max(1, items.length); const bw = (W - 120 - (n - 1) * 90) / n; const y = SY + SH / 2;
      items.forEach((it, i) => { const x = 60 + i * (bw + 90);
        withPop(ctx, pop(t, st[i]), x + bw / 2, y, () => { const last = i === n - 1; const g = ctx.createLinearGradient(0, y - 80, 0, y + 80); g.addColorStop(0, last ? skin.chip1 : '#3a4150'); g.addColorStop(1, last ? skin.chip2 : '#262b35'); ctx.fillStyle = g; rr(ctx, x, y - 80, bw, 160, 18); ctx.fill();
          font(ctx, 40, 900); const ls = bwrap(ctx, it, bw - 40, 2); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ls.forEach((l, k) => ctx.fillText(l, x + bw / 2, y + (k - (ls.length - 1) / 2) * 52)); });
        if (i < n - 1 && t >= (st[i + 1] ?? 1e9)) { const ax = x + bw + 10; ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.moveTo(ax, y - 22); ctx.lineTo(ax + 60, y); ctx.lineTo(ax, y + 22); ctx.fill(); font(ctx, 26, 900); ctx.textAlign = 'center'; ctx.fillText('导致', ax + 30, y - 50); } });
      break;
    }
    case 'stamp': { // 盖章：红色大印章砸在画面上
      const k = clamp((t - (st[0] ?? p.start)) / 0.3); if (k <= 0) break;
      ctx.save(); ctx.translate(W / 2, SY + SH * 0.45); ctx.rotate(-0.18); const sc = 2.2 - 1.2 * easeOut(k); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2) * 0.92;
      fitFont(ctx, v.text || '真相', 150, 520, 900); const w = ctx.measureText(v.text || '真相').width + 90;
      ctx.strokeStyle = '#e5252a'; ctx.lineWidth = 16; rr(ctx, -w / 2, -110, w, 220, 24); ctx.stroke(); ctx.lineWidth = 5; rr(ctx, -w / 2 + 18, -92, w - 36, 184, 14); ctx.stroke();
      ctx.fillStyle = '#e5252a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.text || '真相', 0, 8); ctx.restore();
      if (v.note && t >= (st[1] ?? 1e9)) { const e = easeOut(clamp((t - st[1]) / 0.3)); ctx.globalAlpha = e; fitFont(ctx, v.note, 48, W - 160, 900); ctx.fillStyle = '#fff'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(v.note, W / 2, SY + SH - 90); ctx.fillText(v.note, W / 2, SY + SH - 90); ctx.globalAlpha = 1; }
      break;
    }
    case 'sticky': { // 便利贴：几张彩色便签贴上去
      const items = (v.items || []).slice(0, 4); const cols = ['#ffe36e', '#ffb3c7', '#a8e6ff', '#c7f5a8']; const n = Math.max(1, items.length); const sw = Math.min(260, (W - 100) / n - 20);
      items.forEach((it, i) => { const x = 50 + i * ((W - 100) / n) + ((W - 100) / n - sw) / 2; const y = SY + 140 + (i % 2 ? 60 : 0); const rot = ((i % 3) - 1) * 0.06;
        withPop(ctx, pop(t, st[i], 0.3), x + sw / 2, y + sw / 2, () => { ctx.save(); ctx.translate(x + sw / 2, y + sw / 2); ctx.rotate(rot);
          ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8; ctx.fillStyle = cols[i % 4]; ctx.fillRect(-sw / 2, -sw / 2, sw, sw); ctx.shadowColor = 'transparent';
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-36, -sw / 2 - 14, 72, 28);
          font(ctx, 40, 900); const ls = bwrap(ctx, it, sw - 40, 3); ctx.fillStyle = '#2a2520'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ls.forEach((l, k) => ctx.fillText(l, 0, (k - (ls.length - 1) / 2) * 52)); ctx.restore(); }); });
      break;
    }
    case 'cinema': { // 电影感：上下黑边推进来，中间一句话
      const e = easeOut(clamp((t - p.start) / 0.5)); const bar = 120 * e;
      ctx.fillStyle = '#000'; ctx.fillRect(0, SY, W, bar); ctx.fillRect(0, SY + SH - bar, W, bar);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * e})`; ctx.fillRect(0, SY + bar, W, SH - bar * 2);
      const k = easeOut(clamp((t - (st[0] ?? p.start + 0.4)) / 0.6)); if (k > 0) { ctx.globalAlpha = k; fitFont(ctx, v.text || '', 64, W - 200, 700); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.text || '', W / 2, SY + SH / 2 - 10);
        if (v.sub) { font(ctx, 32, 700); ctx.fillStyle = skin.hl; ctx.fillText(v.sub, W / 2, SY + SH / 2 + 60); } ctx.globalAlpha = 1; }
      break;
    }
    case 'location': { // 地点：图钉落下 + 地点卡
      const pk = clamp((t - (st[0] ?? p.start)) / 0.45); if (pk <= 0) break;
      const px = 230; const drop = pk < 0.7 ? -200 * (1 - easeOut(pk / 0.7)) : -Math.sin(((pk - 0.7) / 0.3) * Math.PI) * 20; const py = SY + SH / 2 + 40 + drop;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px, SY + SH / 2 + 48, 46 * pk, 14 * pk, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e5252a'; ctx.beginPath(); ctx.arc(px, py - 100, 66, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(px, py); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py - 104, 26, 0, Math.PI * 2); ctx.fill();
      const e = easeOut(clamp((t - (st[0] ?? p.start) - 0.4) / 0.35)); if (e > 0) { ctx.save(); ctx.globalAlpha *= e; ctx.translate((1 - e) * 60, 0); ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, 360, SY + SH / 2 - 110, W - 420, 200, 20); ctx.fill();
        fitFont(ctx, v.place || '', 54, W - 500, 900); ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.place || '', 400, SY + SH / 2 - 40);
        fitFont(ctx, v.note || '', 38, W - 500, 700); ctx.fillStyle = skin.statInk; ctx.fillText(v.note || '', 400, SY + SH / 2 + 40); ctx.restore(); }
      break;
    }
    case 'chat': { // 手机聊天：右侧一块手机屏，消息一条条冒出来
      const px = W - 470; const pw = 420; const py = SY + 30; const ph = SH - 60;
      const e = easeOut(clamp((t - p.start) / 0.35)); if (e <= 0) break;
      ctx.save(); ctx.globalAlpha *= e; ctx.translate((1 - e) * 120, 0); ctx.fillStyle = '#16181d'; rr(ctx, px - 10, py - 10, pw + 20, ph + 20, 40); ctx.fill(); ctx.fillStyle = '#ededed'; rr(ctx, px, py, pw, ph, 32); ctx.fill();
      ctx.fillStyle = '#f7f7f7'; rr(ctx, px, py, pw, 70, [32, 32, 0, 0]); ctx.fill(); fitFont(ctx, v.who || '学员', 32, pw - 60, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.who || '学员', px + pw / 2, py + 38);
      let y = py + 100;
      (v.msgs || []).slice(0, 4).forEach((m, i) => { if (t < (st[i] ?? 1e9)) return; font(ctx, 32, 700); const ls = bwrap(ctx, m.text || '', pw - 140, 2); const bw = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 40; const bh = ls.length * 42 + 26; const me = m.from === 'me';
        const bx = me ? px + pw - 20 - bw : px + 20; ctx.fillStyle = me ? '#95ec69' : '#ffffff'; rr(ctx, bx, y, bw, bh, 14); ctx.fill(); ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ls.forEach((l, k) => ctx.fillText(l, bx + 20, y + 13 + 21 + k * 42)); y += bh + 18; });
      ctx.restore(); break;
    }
    case 'tape': { // 警戒线：两条黄黑胶带交叉，写着提醒
      const e = easeOut(clamp((t - (st[0] ?? p.start)) / 0.4)); if (e <= 0) break;
      ctx.fillStyle = `rgba(0,0,0,${0.35 * e})`; ctx.fillRect(0, SY, W, SH);
      [[-0.22, SY + SH * 0.38], [0.18, SY + SH * 0.62]].forEach(([rot, y], i) => { ctx.save(); ctx.translate(W / 2, y); ctx.rotate(rot); const len = (W + 300) * easeOut(clamp(e * 1.4 - i * 0.3));
        ctx.fillStyle = '#ffd21f'; ctx.fillRect(-len / 2, -46, len, 92); ctx.beginPath(); ctx.rect(-len / 2, -46, len, 92); ctx.clip(); ctx.fillStyle = '#1a1a1a';
        for (let x = -len / 2 - 92; x < len / 2; x += 70) { ctx.beginPath(); ctx.moveTo(x, 46); ctx.lineTo(x + 26, 46); ctx.lineTo(x + 26 + 92, -46); ctx.lineTo(x + 92, -46); ctx.fill(); }
        ctx.fillStyle = '#ffd21f'; fitFont(ctx, v.text || '注意', 48, 600, 900); const tw = ctx.measureText(v.text || '注意').width + 60; ctx.fillRect(-tw / 2, -40, tw, 80); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.text || '注意', 0, 3); ctx.restore(); });
      break;
    }
    case 'tug': { // 拔河：一根条，标记滑向占上风的一边
      ctx.fillStyle = `rgba(0,0,0,${0.5 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      const y = SY + SH / 2 + 20; const x0 = 140; const x1 = W - 140; const lean = v.lean === 'left' ? -1 : 1; const k = easeOut(clamp((t - (st[1] ?? 1e9)) / 0.8));
      withPop(ctx, pop(t, st[0] ?? p.start + 0.2), W / 2, y, () => {
        const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#59606e'); g.addColorStop(0.5, '#59606e'); g.addColorStop(0.5, skin.chip1); g.addColorStop(1, skin.chip2); ctx.fillStyle = g; rr(ctx, x0, y - 20, x1 - x0, 40, 20); ctx.fill();
        fitFont(ctx, v.left || '', 50, 360, 900); ctx.fillStyle = '#c7ccd6'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.left || '', x0, y - 90);
        fitFont(ctx, v.right || '', 50, 360, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'right'; ctx.fillText(v.right || '', x1, y - 90);
      });
      const mx = W / 2 + lean * k * 220; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx, y, 34, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = skin.statInk; ctx.beginPath(); ctx.arc(mx, y, 18, 0, Math.PI * 2); ctx.fill();
      if (v.note && k > 0.6) { fitFont(ctx, v.note, 44, W - 200, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.note, W / 2, y + 110); }
      break;
    }
    default: break;
  }
}

// ---------- 主入口 ----------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'navy', assets }) {
  const theme = normalizeTheme(script.theme); const th = THEMES[theme?.key]; const tEmoji = themeEmoji(theme);
  // 行业主色：默认的深蓝皮肤上，蓝色标签换成行业颜色（其它皮肤保留自己的配色）
  const base = skins[skinId] || skins.navy;
  const skin = th && base === skins.navy ? { ...base, chip1: th.red, chip2: darker(th.red), statInk: th.red } : base;
  const account = script.account || '我的账号';
  ctx.save();
  drawNet(ctx, skin, t);

  // 顶栏：账号
  ctx.fillStyle = skin.bar; ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 95, W, 2);
  ctx.fillStyle = skin.chip1; rr(ctx, 40, 30, 18, 18, 3); ctx.fill();
  ctx.fillStyle = skin.hl; rr(ctx, 52, 44, 14, 14, 3); ctx.fill();
  font(ctx, 38, 700); ctx.fillStyle = '#e8ecf3'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(account, 80, 50);
  if (tEmoji) { ctx.font = `46px ${EMOJI_FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(tEmoji.join(' '), W - 40, 52); }

  // 大问题：全程钉住
  const [h1, h2] = script.headline || [script.title || '', ''];
  const hs = Math.min(fitSlant(ctx, h1, 100, W - 110), h2 ? fitSlant(ctx, h2, 100, W - 110) : 100);
  slantText(ctx, h1, W / 2, h2 ? 376 : 430, hs, skin.ink, { stroke: hs * 0.08 });
  if (h2) slantText(ctx, h2, W / 2, 376 + hs * 1.18, hs, skin.hl, { stroke: hs * 0.08 });

  // 当前镜头
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, SY, W, SH); ctx.clip();
  if (s && p) {
    const img = assets?.media?.[idx];
    // 切镜头：轻微放大回落
    const k = clamp((t - p.start) / 0.18);
    const z = 1 + (1 - easeOut(k)) * 0.04;
    ctx.save();
    ctx.translate(W / 2, SY + SH / 2); ctx.scale(z, z); ctx.translate(-W / 2, -(SY + SH / 2));
    if (img) drawMedia(ctx, img, idx, p, t); else drawPlaceholder(ctx, skin, s.label, idx, t);
    ctx.restore();
    // 统一压一层暗角，叠字更清楚
    const vg = ctx.createLinearGradient(0, SY, 0, SY + SH);
    vg.addColorStop(0, 'rgba(0,0,0,0.12)'); vg.addColorStop(0.7, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg; ctx.fillRect(0, SY, W, SH);
    if (k < 1) { ctx.fillStyle = `rgba(255,255,255,${0.16 * (1 - k)})`; ctx.fillRect(0, SY, W, SH); }
    drawOverlay(ctx, s.visual || { type: 'shot' }, p, t, skin, idx);
  }
  ctx.restore();
  // 画面上下细边
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, SY - 2, W, 2); ctx.fillRect(0, SY + SH, W, 2);

  // 字幕
  const sec = tl.sections[idx];
  const ln = sec?.lines.find((l) => t >= l.start && t < l.end + 0.15);
  if (ln) {
    font(ctx, 54, 700);
    const rows = wrap(ctx, ln.text, W - 120, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rows.forEach((r, k) => {
      const y = SY + SH + 74 + k * 70;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(r, W / 2, y);
      ctx.fillStyle = skin.ink; ctx.fillText(r, W / 2, y);
    });
  }
  ctx.restore();
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789%?？—';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, text), fonts.load(`700 40px "Noto Sans SC"`, text)]);
}

/** AI 结果兜底 */
export function normalize(s, splitLine) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '深度解读';
  const hl = Array.isArray(s.headline) ? s.headline : [s.headline];
  s.headline = [str(hl[0], 12) || s.title, str(hl[1], 12)];
  s.theme = normalizeTheme(s.theme);
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = VISUALS.includes(v.type) ? v.type : 'shot';
    const lines = (x.lines || []).map((l) => String(l).trim()).filter(Boolean).flatMap((l) => (splitLine ? splitLine(l) : [l])).slice(0, 3);
    return {
      tag: str(x.label || v.label || type, 8),
      label: str(x.label, 8),
      kw: String(x.kw || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
      ours: !!x.ours,
      src: /^https:\/\/images\.pexels\.com\//.test(x.src || '') ? x.src : '', by: str(x.by, 40),
      visual: {
        type,
        items: (v.items || []).map((q) => str(q, 6)).filter(Boolean).slice(0, 4),
        lines: (v.lines || []).map((q) => str(q, 12)).slice(0, 2),
        label: str(v.label, 10), big: str(v.big, 8), unit: str(v.unit, 4), sub: str(v.sub, 14),
        text: str(v.text, 40), by: str(v.by, 12),
        left: type === 'tug' ? str(v.left, 8) : { label: str(v.left?.label, 6), items: (v.left?.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 3) },
        right: type === 'tug' ? str(v.right, 8) : { label: str(v.right?.label, 6), items: (v.right?.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 3) },
        title: str(v.title, 10), word: str(v.word, 8), name: str(v.name, 10), role: str(v.role, 16),
        nodes: (v.nodes || []).filter(Boolean).slice(0, 5).map((n) => ({ when: str(n.when, 6), what: str(n.what, 8) })),
        q: str(v.q, 16), options: (v.options || []).map((q) => str(q, 12)).filter(Boolean).slice(0, 2),
        ...(type === 'steps' || type === 'checklist' ? { items: (v.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 4) } : {}),
        ...(type === 'top3' || type === 'chain' || type === 'sticky' ? { items: (v.items || []).map((q) => str(q, 12)).filter(Boolean).slice(0, type === 'sticky' ? 4 : 3) } : {}),
        ...(['caption', 'cinema', 'breaking', 'stamp', 'tape'].includes(type) ? { text: str(v.text, type === 'stamp' || type === 'tape' ? 4 : 32) } : {}),
        ...(type === 'breaking' ? { label: str(v.label, 4) } : {}),
        a: str(v.a, 30), caption: str(v.caption, 16), note: str(v.note, 18), place: str(v.place, 14), who: str(v.who, 8), lean: v.lean === 'left' ? 'left' : 'right',
        msgs: (v.msgs || []).filter((m) => m && m.text).slice(0, 4).map((m) => ({ from: m.from === 'me' ? 'me' : 'them', text: str(m.text, 22) })),
        ...(type === 'ticker' ? { label: str(v.label, 5), text: str(v.text, 30) } : {}),
      },
      lines,
    };
  }).filter((x) => x.lines.length);
  // 素材缺少关键词时，沿用上一个镜头的
  s.sections.forEach((x, i) => { if (!x.kw) x.kw = s.sections[i - 1]?.kw || 'education classroom'; });
  // 控制关键词数量（每个词是一次素材库搜索）：相邻两段不连续换新词；全片最多 14 个，超出的轮流复用前面的词
  const seen = []; let changedLast = false; let rr = 0;
  s.sections.forEach((x, i) => {
    const prev = s.sections[i - 1]?.kw;
    if (!prev || x.kw === prev || seen.includes(x.kw)) { if (!seen.includes(x.kw)) seen.push(x.kw); changedLast = !!prev && x.kw !== prev; return; }
    if (changedLast) { x.kw = prev; changedLast = false; return; }
    if (seen.length >= 14) { const pool = seen.filter((k) => k !== prev); x.kw = pool[rr++ % pool.length]; changedLast = true; return; }
    seen.push(x.kw); changedLast = true;
  });
  return s;
}
