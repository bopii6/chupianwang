// 形式 03：真人图文口播
// 灵魂：真人（客户自己的照片，自动抠图）站在画面里“讲”，旁边的标题像打字一样蹦出来，标签、表格、贴纸一个个弹出，底部中英双语字幕。
// 真人其实是几张不同手势的照片，每个镜头换一个姿势，靠换姿势 + 弹出效果制造节奏。
import { W, H, clamp, easeOut, font, fitFont, wrap, splitSubtitle } from '../engine/draw.js';

export const meta = {
  id: 'photo-talk',
  name: '真人图文口播',
  category: '获客引流',
  outcome: '你本人出镜讲方案，结尾引导评论区留言，适合招生和招商',
  ideas: ['暑假集训班招生，6人小班', '我们机构的学业规划服务', '秋季班开始报名了', '一种新的教培模式'],
  tagline: '你的照片站在画面里讲，标题打字蹦出、标签弹出、双语字幕',
  fits: '招生宣传 · 课程介绍 · 机构招商 · 行业观点',
  durations: [1, 2, 3],
  bgm: 'pop',
  needsPhotos: true,
};

export const skins = {
  white: { name: '白底红字', bg: '#ffffff', bg2: '#f6f7f9', ink: '#121212', ink2: '#6b6f76', red: '#e5252a', pill: '#ffd0d8', pillInk: '#c2183f', yellow: '#ffd43b', yellowInk: '#1a1a1a', line: '#e4e6ea', table: '#1f3a5f', tableHead: '#ffffff', tableRow: '#f3f6fa', card: '#ffffff', shadow: 'rgba(20,30,50,0.10)' },
  cream: { name: '暖黄纸感', bg: '#fbf6ea', bg2: '#f3ead6', ink: '#1d1a14', ink2: '#7b7263', red: '#d9381e', pill: '#ffe1b8', pillInk: '#b0450f', yellow: '#ffcf33', yellowInk: '#1a1a1a', line: '#e7dcc4', table: '#5a3e22', tableHead: '#fff6e6', tableRow: '#f7efdd', card: '#fffdf7', shadow: 'rgba(80,60,20,0.10)' },
  navy: { name: '深蓝商务', bg: '#0e1a2e', bg2: '#13243f', ink: '#ffffff', ink2: '#a8b3c7', red: '#ffcc33', pill: '#22406b', pillInk: '#bfe0ff', yellow: '#ffcc33', yellowInk: '#10203a', line: '#2a3b58', table: '#2f6fd1', tableHead: '#ffffff', tableRow: '#162c4d', card: '#132744', shadow: 'rgba(0,0,0,0.3)' },
};

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const VISUALS = ['title', 'tags', 'table', 'stat', 'emoji', 'list'];
const Y = { header: 150, gTop: 250, person: 1470, sub: 1560 };

// ---------------------------------------------------------------------
// 示例讲师（没上传照片时用）：代码画的卡通人物，3 种手势
// ---------------------------------------------------------------------
const demoCache = new Map();
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function demoPresenter(pose) {
  if (demoCache.has(pose)) return demoCache.get(pose);
  const c = makeCanvas(640, 1000); const g = c.getContext('2d');
  const skin = '#f5c9a4'; const skinD = '#e3ad86'; const hair = '#24201f'; const suit = '#1f3a5f'; const suitD = '#172c48';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const blob = (fn, fill, stroke = '#1a1a1a', lw = 7) => { g.beginPath(); fn(); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); } };
  // 身体（西装）
  blob(() => { g.moveTo(130, 1000); g.quadraticCurveTo(120, 560, 320, 540); g.quadraticCurveTo(520, 560, 510, 1000); g.closePath(); }, suit);
  blob(() => { g.moveTo(270, 545); g.lineTo(320, 700); g.lineTo(370, 545); g.closePath(); }, '#ffffff', '#1a1a1a', 5);
  blob(() => { g.moveTo(312, 600); g.lineTo(328, 600); g.lineTo(336, 690); g.lineTo(320, 715); g.lineTo(304, 690); g.closePath(); }, '#e5252a', '#1a1a1a', 4);
  blob(() => { g.moveTo(270, 545); g.lineTo(240, 640); g.lineTo(300, 760); g.lineTo(320, 700); g.closePath(); }, suitD, null);
  blob(() => { g.moveTo(370, 545); g.lineTo(400, 640); g.lineTo(340, 760); g.lineTo(320, 700); g.closePath(); }, suitD, null);
  // 脖子 + 头
  blob(() => g.rect(285, 460, 70, 95), skinD, null);
  blob(() => g.ellipse(320, 330, 120, 145, 0, 0, Math.PI * 2), skin);
  blob(() => g.ellipse(200, 345, 22, 34, 0, 0, Math.PI * 2), skin);
  blob(() => g.ellipse(440, 345, 22, 34, 0, 0, Math.PI * 2), skin);
  // 头发
  blob(() => { g.moveTo(198, 320); g.quadraticCurveTo(190, 170, 320, 175); g.quadraticCurveTo(455, 172, 445, 320); g.quadraticCurveTo(430, 250, 360, 245); g.quadraticCurveTo(300, 270, 250, 240); g.quadraticCurveTo(212, 260, 198, 320); g.closePath(); }, hair);
  // 眉眼嘴
  g.fillStyle = '#1a1a1a';
  g.lineWidth = 8; g.strokeStyle = '#1a1a1a';
  g.beginPath(); g.moveTo(250, 300); g.quadraticCurveTo(275, 288, 298, 298); g.stroke();
  g.beginPath(); g.moveTo(342, 298); g.quadraticCurveTo(365, 288, 390, 300); g.stroke();
  g.beginPath(); g.ellipse(275, 340, 11, 14, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(365, 340, 11, 14, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(279, 335, 4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(369, 335, 4, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#3a3a3a';
  for (const cx of [275, 365]) { g.beginPath(); g.roundRect(cx - 38, 312, 76, 58, 16); g.stroke(); }
  g.beginPath(); g.moveTo(313, 338); g.lineTo(327, 338); g.stroke();
  g.fillStyle = '#c8433b'; g.beginPath(); g.moveTo(285, 405); g.quadraticCurveTo(320, 445, 355, 405); g.quadraticCurveTo(320, 420, 285, 405); g.fill();
  g.fillStyle = 'rgba(240,120,110,0.35)'; g.beginPath(); g.ellipse(240, 395, 22, 13, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(400, 395, 22, 13, 0, 0, Math.PI * 2); g.fill();
  // 手臂
  const arm = (pts, fill = suit) => { blob(() => { g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.closePath(); }, fill); };
  const hand = (x, y, r = 38) => blob(() => g.arc(x, y, r, 0, Math.PI * 2), skin);
  if (pose === 0) { // 摊手讲解
    arm([[150, 640], [210, 600], [250, 780], [200, 800]]); hand(205, 800);
    arm([[490, 640], [430, 600], [390, 780], [440, 800]]); hand(435, 800);
  } else if (pose === 1) { // 指向上方
    arm([[150, 640], [210, 600], [250, 820], [200, 840]]); hand(220, 845);
    arm([[455, 600], [505, 560], [560, 330], [515, 315]]);
    blob(() => { g.roundRect(512, 230, 30, 95, 14); }, skin); hand(535, 330, 36);
  } else { // 握拳加油
    arm([[150, 640], [210, 600], [250, 820], [200, 840]]); hand(220, 845);
    arm([[490, 640], [440, 600], [470, 470], [525, 485]]); hand(500, 455, 44);
    g.lineWidth = 5; g.strokeStyle = '#1a1a1a'; for (const dy of [-12, 6]) { g.beginPath(); g.moveTo(470, 455 + dy); g.lineTo(520, 455 + dy); g.stroke(); }
  }
  demoCache.set(pose, c);
  return c;
}

// ---------------------------------------------------------------------
// 时间规划
// ---------------------------------------------------------------------
const itemCount = (v) => {
  switch (v?.type) {
    case 'tags': return (v.tags || []).length + (v.highlight ? 1 : 0);
    case 'table': return (v.rows || []).length;
    case 'emoji': return (v.emoji || []).length;
    case 'list': return (v.items || []).length;
    case 'stat': return 2;
    default: return v?.sub ? 1 : 0;
  }
};
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i];
    const next = tl.sections[i + 1];
    const first = sec.lines[0]; const last = sec.lines[sec.lines.length - 1];
    const n = itemCount(s.visual);
    const a = sec.start + 0.5;
    const b = Math.max(a + 0.4, (sec.lines.length > 1 ? last.start : first.end - 0.4));
    const steps = [];
    for (let k = 0; k < n; k++) steps.push(a + 0.35 + ((b - a) * k) / Math.max(1, n));
    return { start: sec.start, end: next ? next.start : tl.duration, lineEnd: sec.end, steps };
  });
}

// ---------------------------------------------------------------------
// 画面元素
// ---------------------------------------------------------------------
const pop = (t, t0, dur = 0.28) => {
  if (t0 == null || t < t0) return 0;
  const k = clamp((t - t0) / dur);
  return k < 0.7 ? easeOut(k / 0.7) * 1.08 : 1.08 - 0.08 * ((k - 0.7) / 0.3);
};
function withPop(ctx, s, cx, cy, fn) {
  if (s <= 0.001) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  ctx.globalAlpha *= clamp(s * 1.4);
  fn(); ctx.restore();
}
function pill(ctx, text, x, y, h, bg, fg, size, shadow) {
  font(ctx, size, 900);
  const w = ctx.measureText(text).width + h * 0.9;
  if (shadow) { ctx.fillStyle = shadow; ctx.beginPath(); ctx.roundRect(x - w / 2 + 4, y - h / 2 + 6, w, h, h / 2.6); ctx.fill(); }
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2.6); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 2);
  return w;
}
/** 打字机标题：按时间一个字一个字出现 */
function typeTitle(ctx, text, t, t0, x, y, maxW, size, color, align = 'center') {
  const chars = [...(text || '')];
  if (!chars.length) return y;
  const shown = Math.min(chars.length, Math.max(0, Math.floor((t - t0) * 9) + 1));
  font(ctx, size, 900);
  const lines = wrap(ctx, text, maxW, 2);
  let left = shown;
  ctx.fillStyle = color; ctx.textAlign = align === 'center' ? 'left' : 'left'; ctx.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    const full = ctx.measureText(ln).width;
    const part = [...ln].slice(0, Math.max(0, left)).join('');
    left -= [...ln].length;
    const lx = align === 'center' ? x - full / 2 : x;
    // 白色描边让字在任何背景上都清楚
    ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(part, lx, y + i * size * 1.18);
    ctx.fillText(part, lx, y + i * size * 1.18);
  });
  return y + lines.length * size * 1.18;
}

function drawVisual(ctx, v, p, t, skin, layout) {
  const st = p.steps;
  const cx = layout.cx; const maxW = layout.w;
  let y = Y.gTop + 70;
  switch (v.type) {
    case 'title': {
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y + 20, maxW, 120, skin.red, 'center');
      if (v.sub) withPop(ctx, pop(t, st[0]), cx, y + 30, () => {
        fitFont(ctx, v.sub, 64, maxW, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.sub, cx, y + 30);
      });
      break;
    }
    case 'tags': {
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 104, skin.red, 'center') + 30;
      const tags = (v.tags || []).slice(0, 6);
      const perRow = tags.length <= 4 ? 2 : 3;
      tags.forEach((tag, i) => {
        const row = Math.floor(i / perRow); const col = i % perRow;
        const n = Math.min(perRow, tags.length - row * perRow);
        const gap = maxW / n;
        const x = cx - maxW / 2 + gap * (col + 0.5);
        const yy = y + 40 + row * 112;
        withPop(ctx, pop(t, st[i]), x, yy, () => pill(ctx, tag, x, yy, 90, skin.pill, skin.pillInk, fitPillSize(ctx, tag, gap - 30), skin.shadow));
      });
      if (v.highlight) {
        const rows = Math.ceil(tags.length / perRow);
        const yy = y + 40 + rows * 112 + 10;
        withPop(ctx, pop(t, st[tags.length]), cx, yy, () => pill(ctx, v.highlight, cx, yy, 96, skin.yellow, skin.yellowInk, fitPillSize(ctx, v.highlight, maxW - 40), skin.shadow));
      }
      break;
    }
    case 'table': {
      font(ctx, 72, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      typeTitle(ctx, v.title, t, p.start + 0.15, cx, y - 10, maxW, 76, skin.ink, 'center');
      const head = (v.head || []).slice(0, 3); const rows = (v.rows || []).slice(0, 6);
      const cols = Math.max(2, head.length || (rows[0] || []).length || 2);
      const tx = cx - maxW / 2; const tw = maxW; const rh = 82; let ty = y + 70;
      const colW = cols === 2 ? [0.36, 0.64] : [0.28, 0.42, 0.30];
      const cellText = (txt, x, w, yy, color, bold) => { fitFont(ctx, String(txt ?? ''), 36, w - 30, bold ? 900 : 700); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(txt ?? ''), x + 18, yy); };
      withPop(ctx, pop(t, p.start + 0.4), cx, ty + rh / 2, () => {
        ctx.fillStyle = skin.table; ctx.beginPath(); ctx.roundRect(tx, ty, tw, rh, [16, 16, 0, 0]); ctx.fill();
        let x = tx; head.forEach((h, i) => { cellText(h, x, tw * colW[i], ty + rh / 2, skin.tableHead, true); x += tw * colW[i]; });
      });
      ty += rh;
      rows.forEach((r, ri) => {
        const a = clamp((t - (st[ri] ?? 1e9)) / 0.3);
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * -40, 0);
        ctx.fillStyle = ri % 2 ? skin.card : skin.tableRow; ctx.fillRect(tx, ty + ri * rh, tw, rh);
        ctx.fillStyle = skin.line; ctx.fillRect(tx, ty + ri * rh + rh - 2, tw, 2);
        let x = tx; for (let c = 0; c < cols; c++) { cellText(r[c], x, tw * colW[c], ty + ri * rh + rh / 2, c === 0 ? skin.ink : skin.ink2, c === 0); x += tw * colW[c]; }
        ctx.restore();
      });
      break;
    }
    case 'stat': {
      typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 84, skin.ink, 'center');
      const k = clamp((t - st[0]) / 0.9);
      withPop(ctx, pop(t, st[0]), cx, y + 200, () => {
        const big = countUpText(v.big, k);
        const s = fitFont(ctx, big, 220, maxW, 900);
        const bw = ctx.measureText(big).width;
        ctx.fillStyle = skin.yellow; ctx.fillRect(cx - bw / 2 - 20, y + 200 + s * 0.12, (bw + 40) * easeOut(k), s * 0.32);
        ctx.fillStyle = skin.red; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(big, cx, y + 200);
      });
      if (v.label) withPop(ctx, pop(t, st[1]), cx, y + 380, () => pill(ctx, v.label, cx, y + 380, 92, skin.pill, skin.pillInk, fitPillSize(ctx, v.label, maxW - 40), skin.shadow));
      break;
    }
    case 'emoji': {
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 100, skin.red, 'center') + 50;
      const em = (v.emoji || []).slice(0, 4); const labels = v.labels || [];
      const gap = maxW / Math.max(1, em.length);
      em.forEach((e, i) => {
        const x = cx - maxW / 2 + gap * (i + 0.5);
        const s = pop(t, st[i], 0.35);
        const bob = Math.sin(t * 3 + i) * 6;
        withPop(ctx, s, x, y + 90, () => {
          ctx.font = `150px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(e, x, y + 80 + bob);
          if (labels[i]) { fitFont(ctx, labels[i], 44, gap - 20, 900); ctx.fillStyle = skin.ink; ctx.fillText(labels[i], x, y + 200); }
        });
      });
      break;
    }
    case 'list': {
      y = typeTitle(ctx, v.title, t, p.start + 0.15, layout.cx, y, maxW, 92, skin.red, 'center') + 40;
      (v.items || []).slice(0, 5).forEach((it, i) => {
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        if (a <= 0) return;
        const yy = y + i * 100;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * -50, 0);
        const lx = cx - maxW / 2;
        ctx.fillStyle = skin.yellow; ctx.beginPath(); ctx.roundRect(lx, yy - 34, 68, 68, 16); ctx.fill();
        ctx.strokeStyle = skin.yellowInk; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(lx + 17, yy + 2); ctx.lineTo(lx + 30, yy + 16); ctx.lineTo(lx + 52, yy - 14); ctx.stroke();
        fitFont(ctx, it, 54, maxW - 100, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(it, lx + 96, yy + 2);
        ctx.restore();
      });
      break;
    }
    default: break;
  }
}
/** 英文按单词换行（中文的按字换行会把单词拆开） */
function wrapWords(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) return lines; } else cur = next;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}
function fitPillSize(ctx, text, maxW) {
  let s = 52; font(ctx, s, 900);
  while (s > 26 && ctx.measureText(text).width + s * 1.7 > maxW) { s -= 2; font(ctx, s, 900); }
  return s;
}
function countUpText(v, k) {
  const m = String(v ?? '').match(/^(\D*?)(\d+(?:\.\d+)?)(.*)$/);
  if (!m || /\d/.test(m[3])) return String(v ?? '');
  const dec = (m[2].split('.')[1] || '').length;
  return m[1] + (parseFloat(m[2]) * easeOut(k)).toFixed(dec) + m[3];
}

/** 估算这一镜图文占到多低（用来决定人物放多大，避免挡脸） */
function visualBottom(ctx, v, layout) {
  const lines = (txt, size) => { if (!txt) return 0; font(ctx, size, 900); return wrap(ctx, txt, layout.w, 2).length; };
  const top = Y.gTop + 70;
  switch (v.type) {
    case 'title': return top + 20 + lines(v.title, 120) * 142 + (v.sub ? 70 : 0);
    case 'tags': { const per = (v.tags || []).length <= 4 ? 2 : 3; const rows = Math.ceil((v.tags || []).length / per); return top + lines(v.title, 104) * 123 + 70 + rows * 112 + (v.highlight ? 112 : 0); }
    case 'emoji': return top + lines(v.title, 100) * 118 + 50 + 230;
    case 'stat': return top + 430;
    default: return 0; // 表格/清单在左侧，人物靠右
  }
}

// ---------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'white', assets }) {
  const skin = skins[skinId] || skins.white;
  ctx.save();
  ctx.fillStyle = skin.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 900, 100, W / 2, 900, 1100);
  g.addColorStop(0, skin.bg); g.addColorStop(1, skin.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // 顶部口号
  ctx.font = `56px ${EMOJI_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🔎', 56, Y.header);
  fitFont(ctx, script.slogan || script.title || '', 50, W - 200, 900);
  ctx.fillStyle = skin.ink; ctx.fillText(script.slogan || script.title || '', 130, Y.header + 2);

  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx];
  const v = s?.visual || { type: 'title', title: '' };

  // 真人：每个镜头换一张照片（姿势），左右交替
  const photos = assets?.photos?.length ? assets.photos : null;
  const img = photos ? photos[idx % photos.length] : demoPresenter(idx % 3);
  const wide = v.type === 'table' || v.type === 'list';
  const side = wide ? 1 : (idx % 2 ? -1 : 1);
  const layout = wide ? { cx: 360, w: 640 } : { cx: W / 2, w: 940 };
  const vb = visualBottom(ctx, v, layout);
  // 人物大小：既限高也限宽；近景自拍（接近方形）放小，半身照放大，让脸的大小差不多；
  // 并且人物顶部一定在图文下方，不会挡字
  const avail = Math.max(420, (wide ? 760 : Y.person - vb - 50));
  const closeUp = img.width / img.height > 0.8;
  const targetH = Math.min(avail, closeUp ? 500 : 740);
  const maxW = wide ? 440 : 560;
  const scale = Math.min(targetH / img.height, maxW / img.width);
  const ph = img.height * scale;
  const pw = img.width * scale;
  const k = clamp((t - (p?.start ?? 0)) / 0.25);
  const enter = 1 - easeOut(k);
  const breathe = 1 + Math.sin(t * 2.2) * 0.006;
  const px = clamp(W / 2 + side * (wide ? 280 : 190) - pw / 2, 30, W - 30 - pw);
  const py = Y.person - ph * breathe + enter * 60;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.5);
  ctx.shadowColor = skin.shadow; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.drawImage(img, px, py, pw, ph * breathe);
  ctx.restore();

  // 图文
  if (s && p) {
    drawVisual(ctx, v, p, t, skin, layout);
  }

  // 双语字幕
  ctx.fillStyle = skin.bg; ctx.fillRect(0, Y.person, W, H - Y.person);
  ctx.fillStyle = skin.line; ctx.fillRect(60, Y.person, W - 120, 3);
  const sec = tl.sections[idx];
  if (sec) {
    const j = sec.lines.findIndex((l) => t >= l.start && t < l.end + 0.15);
    if (j >= 0) {
      const zh = sec.lines[j].text; const en = s.en?.[j] || '';
      const rows = splitSubtitle(zh, 15);
      rows.forEach((r, i) => {
        fitFont(ctx, r, 60, 980, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(r, W / 2, Y.sub + i * 76);
      });
      if (en) {
        font(ctx, 40, 700);
        const ls = wrapWords(ctx, en, 960, 2);
        ls.forEach((ln, i) => { ctx.fillStyle = skin.ink2; ctx.fillText(ln, W / 2, Y.sub + rows.length * 76 + 8 + i * 52); });
      }
    }
  }
  ctx.restore();
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789%';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, text), fonts.load(`700 40px "Noto Sans SC"`, text)]);
}

/** AI 结果兜底 */
export function normalize(s) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '未命名';
  s.slogan = str(s.slogan, 18) || s.title;
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = VISUALS.includes(v.type) ? v.type : 'title';
    const lines = (x.lines || []).map((l) => String(l).trim()).filter(Boolean).slice(0, 4);
    const en = (x.en || []).map((l) => String(l ?? '').trim());
    return {
      tag: str(x.tag || v.title, 8),
      visual: {
        type, title: str(v.title, 14), sub: str(v.sub, 16),
        tags: (v.tags || []).map((q) => str(q, 7)).filter(Boolean).slice(0, 6), highlight: str(v.highlight, 14),
        head: (v.head || []).map((q) => str(q, 8)).slice(0, 3), rows: (v.rows || []).slice(0, 6).map((r) => (r || []).map((c) => str(c, 16)).slice(0, 3)),
        big: str(v.big, 8), label: str(v.label, 14),
        emoji: (v.emoji || []).map((e) => String(e).trim()).filter(Boolean).slice(0, 4), labels: (v.labels || []).map((q) => str(q, 6)),
        items: (v.items || []).map((q) => str(q, 14)).filter(Boolean).slice(0, 5),
      },
      lines, en: lines.map((_, i) => en[i] || ''),
    };
  }).filter((x) => x.lines.length);
  return s;
}
