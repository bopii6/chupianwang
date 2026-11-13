// 形式 03：真人图文口播
// 灵魂：真人（客户自己的照片，自动抠图）站在画面里“讲”，旁边的标题像打字一样蹦出来，标签、表格、贴纸一个个弹出，底部中英双语字幕。
// 真人其实是几张不同手势的照片，每个镜头换一个姿势，靠换姿势 + 弹出效果制造节奏。
import { W, H, clamp, easeOut, font, fitFont, wrap, splitSubtitle } from '../engine/draw.js';
import { THEMES, themeEmoji, normalizeTheme, drawWallpaper } from './themes.js';

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
const VISUALS = ['title', 'tags', 'table', 'stat', 'emoji', 'list', 'compare', 'steps', 'chat', 'offer', 'quote', 'ask',
  'checktest', 'verdict', 'warning', 'formula', 'pyramid', 'rank', 'timeline', 'keywords', 'ticket', 'certificate', 'map', 'notify'];
// 这几种画面占左边一大块，讲师站右边；其它的画面在上、讲师在下
const WIDE = new Set(['table', 'list', 'steps', 'chat', 'offer', 'checktest', 'warning', 'map']);
const Y = { header: 150, gTop: 250, person: 1470, sub: 1560 };

// 行业主题（公用表在 themes.js）：浅色皮肤换主色；深蓝皮肤只换图标和壁纸
function themedSkin(skinId, theme) {
  const base = skins[skinId] || skins.white;
  const th = THEMES[theme?.key];
  if (!th || skinId === 'navy') return base;
  return { ...base, red: th.red, pill: th.pill, pillInk: th.pillInk };
}

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
    case 'compare': return Math.max((v.left?.items || []).length, (v.right?.items || []).length) * 2;
    case 'steps': return (v.steps || []).length;
    case 'chat': return (v.msgs || []).length;
    case 'offer': return (v.points || []).length + (v.badge ? 1 : 0) + (v.cta ? 1 : 0);
    case 'quote': return 1;
    case 'ask': return (v.options || []).length;
    case 'checktest': return (v.items || []).length + (v.result ? 1 : 0);
    case 'verdict': return 2;
    case 'warning': return (v.items || []).length;
    case 'formula': return (v.parts || []).length + 1;
    case 'pyramid': return (v.levels || []).length;
    case 'rank': return (v.items || []).length;
    case 'timeline': return (v.nodes || []).length;
    case 'keywords': return (v.words || []).length + (v.sub ? 1 : 0);
    case 'ticket': return (v.info || []).length + (v.cta ? 1 : 0);
    case 'certificate': return 2;
    case 'map': return 1 + (v.near || []).length;
    case 'notify': return (v.msgs || []).length;
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
    // ---------- 新增画面：按内容挑，让同一个模板做出来不一样 ----------
    case 'compare': { // 以前 vs 现在 / 误区 vs 正解：左灰右彩两张卡
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 92, skin.ink, 'center') + 34;
      const L = v.left || {}; const R = v.right || {};
      const li = (L.items || []).slice(0, 4); const ri = (R.items || []).slice(0, 4);
      const n = Math.max(li.length, ri.length, 1);
      const gap = 26; const colW = (maxW - gap) / 2; const lx = cx - maxW / 2; const rx = lx + colW + gap;
      const headH = 92; const rowH = 100; const boxH = headH + n * rowH + 22;
      const col = (x, isR, label, items, i0) => {
        withPop(ctx, pop(t, p.start + (isR ? 0.5 : 0.35)), x + colW / 2, y + boxH / 2, () => {
          ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(x + 4, y + 10, colW, boxH, 28); ctx.fill();
          ctx.fillStyle = isR ? skin.pill : skin.bg2; ctx.beginPath(); ctx.roundRect(x, y, colW, boxH, 28); ctx.fill();
          ctx.fillStyle = isR ? skin.red : skin.line; ctx.beginPath(); ctx.roundRect(x, y, colW, headH, [28, 28, 0, 0]); ctx.fill();
          fitFont(ctx, label || (isR ? '现在' : '以前'), 50, colW - 40, 900);
          ctx.fillStyle = isR ? '#ffffff' : skin.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label || (isR ? '现在' : '以前'), x + colW / 2, y + headH / 2 + 2);
        });
        items.forEach((it, i) => {
          const a = clamp((t - (st[i0 + i * 2] ?? 1e9)) / 0.3);
          if (a <= 0) return;
          const yy = y + headH + 22 + i * rowH + rowH / 2 - 8;
          ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - easeOut(a)) * 24);
          // 图标：左边 ✗，右边 ✓
          ctx.fillStyle = isR ? skin.red : skin.ink2; ctx.beginPath(); ctx.arc(x + 46, yy, 22, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
          if (isR) { ctx.moveTo(x + 35, yy + 1); ctx.lineTo(x + 43, yy + 9); ctx.lineTo(x + 57, yy - 8); } else { ctx.moveTo(x + 38, yy - 8); ctx.lineTo(x + 54, yy + 8); ctx.moveTo(x + 54, yy - 8); ctx.lineTo(x + 38, yy + 8); }
          ctx.stroke();
          fitFont(ctx, it, 44, colW - 100, 900);
          ctx.fillStyle = isR ? skin.ink : skin.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(it, x + 82, yy + 2);
          if (!isR) { const w = ctx.measureText(it).width; ctx.fillStyle = skin.ink2; ctx.globalAlpha *= 0.5; ctx.fillRect(x + 80, yy + 3, w * easeOut(a), 4); }
          ctx.restore();
        });
      };
      col(lx, false, L.label, li, 0);
      col(rx, true, R.label, ri, 1);
      break;
    }
    case 'steps': { // 步骤路线图：竖着的编号节点，连线随口播往下长
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 88, skin.red, 'center') + 46;
      const items = (v.steps || []).slice(0, 5);
      const gapY = Math.min(170, 820 / Math.max(1, items.length));
      const nx = cx - maxW / 2 + 52;
      items.forEach((it, i) => {
        const yy = y + i * gapY;
        if (i > 0) {
          const prevY = y + (i - 1) * gapY;
          ctx.fillStyle = skin.line; ctx.fillRect(nx - 4, prevY + 44, 8, gapY - 88);
          const k = clamp((t - (st[i - 1] ?? 1e9)) / Math.max(0.2, (st[i] ?? 1e9) - (st[i - 1] ?? 0)));
          ctx.fillStyle = skin.red; ctx.fillRect(nx - 4, prevY + 44, 8, (gapY - 88) * k);
        }
        const s = pop(t, st[i], 0.32);
        withPop(ctx, s, nx, yy, () => {
          ctx.fillStyle = skin.red; ctx.beginPath(); ctx.arc(nx, yy, 44, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; font(ctx, 48, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), nx, yy + 3);
        });
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        if (a > 0) {
          ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * 30, 0);
          fitFont(ctx, it, 56, maxW - 140, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(it, nx + 76, yy + 3);
          ctx.restore();
        }
      });
      break;
    }
    case 'chat': { // 聊天截图：家长/学员问，老师答
      const px = cx - maxW / 2; const pw = maxW;
      if (v.title) y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 78, skin.ink, 'center') + 24;
      const msgs = (v.msgs || []).slice(0, 4);
      // 聊天窗口外框
      let total = 96; const blocks = msgs.map((m) => { font(ctx, 44, 700); const ls = wrap(ctx, m.text, pw * 0.72 - 56, 3); const h = ls.length * 58 + 44; total += h + 22; return { ls, h, me: m.from === 'me' }; });
      withPop(ctx, pop(t, p.start + 0.25), cx, y + total / 2, () => {
        ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(px + 4, y + 12, pw, total + 20, 34); ctx.fill();
        ctx.fillStyle = skin.card; ctx.beginPath(); ctx.roundRect(px, y, pw, total + 20, 34); ctx.fill();
        ctx.fillStyle = skin.bg2; ctx.beginPath(); ctx.roundRect(px, y, pw, 88, [34, 34, 0, 0]); ctx.fill();
        ctx.fillStyle = skin.pill; ctx.beginPath(); ctx.arc(px + 58, y + 44, 28, 0, Math.PI * 2); ctx.fill();
        ctx.font = `32px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.avatar || '🙋', px + 58, y + 46);
        fitFont(ctx, v.who || '家长', 40, pw - 160, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.fillText(v.who || '家长', px + 102, y + 46);
      });
      let yy = y + 110;
      blocks.forEach((b, i) => {
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        if (a > 0) {
          font(ctx, 44, 700);
          const bw = Math.max(...b.ls.map((l) => ctx.measureText(l).width)) + 56;
          const bx = b.me ? px + pw - 26 - bw : px + 26;
          ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - easeOut(a)) * 26);
          ctx.fillStyle = b.me ? skin.red : skin.bg2; ctx.beginPath(); ctx.roundRect(bx, yy, bw, b.h, 26); ctx.fill();
          ctx.fillStyle = b.me ? '#ffffff' : skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          b.ls.forEach((l, k) => ctx.fillText(l, bx + 28, yy + 22 + 29 + k * 58));
          ctx.restore();
        }
        yy += b.h + 22;
      });
      break;
    }
    case 'offer': { // 课程/活动卡：顶部色带是课程名，右上角角标，下面打勾卖点
      if (v.title) y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 80, skin.ink, 'center') + 30;
      const pts = (v.points || []).slice(0, 4);
      const x = cx - maxW / 2; const w = maxW; const band = 132; const h = band + pts.length * 96 + (v.cta ? 118 : 40);
      withPop(ctx, pop(t, p.start + 0.3), cx, y + h / 2, () => {
        ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(x + 6, y + 14, w, h, 34); ctx.fill();
        ctx.fillStyle = skin.card; ctx.beginPath(); ctx.roundRect(x, y, w, h, 34); ctx.fill();
        ctx.fillStyle = skin.red; ctx.beginPath(); ctx.roundRect(x, y, w, band, [34, 34, 0, 0]); ctx.fill();
        fitFont(ctx, v.name || '', 62, w - (v.badge ? 230 : 60), 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(v.name || '', x + 36, y + band / 2 + 2);
      });
      pts.forEach((it, i) => {
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        if (a <= 0) return;
        const yy = y + band + 54 + i * 96;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * -30, 0);
        ctx.fillStyle = skin.pill; ctx.beginPath(); ctx.roundRect(x + 34, yy - 28, 56, 56, 16); ctx.fill();
        ctx.strokeStyle = skin.pillInk; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(x + 48, yy + 1); ctx.lineTo(x + 58, yy + 11); ctx.lineTo(x + 76, yy - 11); ctx.stroke();
        fitFont(ctx, it, 50, w - 160, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it, x + 114, yy + 2);
        ctx.restore();
      });
      if (v.badge) withPop(ctx, pop(t, st[pts.length] ?? p.start + 0.8, 0.4), x + w - 96, y + 6, () => {
        ctx.save(); ctx.translate(x + w - 96, y + 6); ctx.rotate(0.14);
        pill(ctx, v.badge, 0, 0, 84, skin.yellow, skin.yellowInk, fitPillSize(ctx, v.badge, 230), skin.shadow);
        ctx.restore();
      });
      if (v.cta) withPop(ctx, pop(t, st[pts.length + 1] ?? p.start + 1), cx, y + h - 66, () => pill(ctx, v.cta, cx, y + h - 66, 84, skin.pill, skin.pillInk, fitPillSize(ctx, v.cta, w - 80), null));
      break;
    }
    case 'quote': { // 金句：大字砸下来 + 荧光笔划线
      const k = clamp((t - (p.start + 0.2)) / 0.45);
      if (k <= 0) break;
      font(ctx, 112, 900);
      const ls = wrap(ctx, v.text || '', maxW - 40, 3);
      const lh = 132; const top = y + 90;
      ctx.save();
      const sc = 1.35 - 0.35 * easeOut(k);
      ctx.translate(cx, top + (ls.length * lh) / 2); ctx.scale(sc, sc); ctx.translate(-cx, -(top + (ls.length * lh) / 2));
      ctx.globalAlpha *= clamp(k * 1.6);
      ctx.fillStyle = skin.pill; font(ctx, 260, 900); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('“', cx - maxW / 2 - 6, top - 40);
      font(ctx, 112, 900);
      ls.forEach((l, i) => {
        const yy = top + i * lh;
        if (i === ls.length - 1) { // 最后一行底下荧光笔
          const w = ctx.measureText(l).width; const hk = clamp((t - (st[0] ?? 1e9)) / 0.5);
          ctx.fillStyle = skin.yellow; ctx.fillRect(cx - w / 2 - 12, yy + 22, (w + 24) * easeOut(hk), 38);
        }
        ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.fillText(l, cx, yy);
      });
      ctx.restore();
      if (v.by) withPop(ctx, pop(t, st[0]), cx, top + ls.length * lh + 50, () => { fitFont(ctx, `—— ${v.by}`, 44, maxW, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`—— ${v.by}`, cx, top + ls.length * lh + 50); });
      break;
    }
    case 'ask': { // 抛问题：大问号 + 投票式选项，引导评论区回答
      const wob = Math.sin(t * 5) * 0.06;
      withPop(ctx, pop(t, p.start + 0.1, 0.4), cx, y + 70, () => {
        ctx.save(); ctx.translate(cx, y + 70); ctx.rotate(wob);
        ctx.fillStyle = skin.red; ctx.beginPath(); ctx.arc(0, 0, 82, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; font(ctx, 120, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 8);
        ctx.restore();
      });
      let yy = typeTitle(ctx, v.q, t, p.start + 0.3, cx, y + 230, maxW, 84, skin.ink, 'center') + 40;
      (v.options || []).slice(0, 4).forEach((op, i) => {
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        if (a <= 0) return;
        const ow = maxW - 120; const ox = cx - ow / 2; const oy = yy + i * 112;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - easeOut(a)) * 20);
        ctx.fillStyle = skin.card; ctx.beginPath(); ctx.roundRect(ox, oy, ow, 92, 46); ctx.fill();
        ctx.strokeStyle = skin.line; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = skin.pill; ctx.beginPath(); ctx.arc(ox + 46, oy + 46, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skin.pillInk; font(ctx, 40, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ABCD'[i], ox + 46, oy + 49);
        fitFont(ctx, op, 46, ow - 130, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.fillText(op, ox + 96, oy + 49);
        ctx.restore();
      });
      break;
    }
    // ---------- 第二批 12 种画面 ----------
    case 'checktest': { // 自测题：框框逐个打勾，最后给结论
      font(ctx, 84, 900); const tsz = ctx.measureText(v.title || '').width > maxW ? Math.max(60, Math.floor(84 * maxW / ctx.measureText(v.title || '').width)) : 84; // 标题尽量一行放下，别把问号挤到第二行
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, tsz, skin.ink, 'center') + 40;
      const items = (v.items || []).slice(0, 5); const lx = cx - maxW / 2;
      const show = clamp((t - (p.start + 0.35)) / 0.35);
      items.forEach((it, i) => {
        const yy = y + i * 108;
        ctx.save(); ctx.globalAlpha *= show; ctx.translate(0, (1 - easeOut(show)) * 20);
        const tick = clamp((t - (st[i] ?? 1e9)) / 0.3);
        ctx.fillStyle = tick > 0 ? skin.red : skin.card; ctx.strokeStyle = tick > 0 ? skin.red : skin.line; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.roundRect(lx, yy - 32, 64, 64, 16); ctx.fill(); ctx.stroke();
        if (tick > 0) { // 勾一笔画出来
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const k1 = clamp(tick * 2); const k2 = clamp(tick * 2 - 1);
          ctx.beginPath(); ctx.moveTo(lx + 15, yy + 1); ctx.lineTo(lx + 15 + 13 * k1, yy + 1 + 14 * k1);
          if (k2 > 0) ctx.lineTo(lx + 28 + 22 * k2, yy + 15 - 30 * k2);
          ctx.stroke();
        }
        fitFont(ctx, it, 50, maxW - 100, 900); ctx.fillStyle = tick > 0 ? skin.ink : skin.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(it, lx + 92, yy + 2);
        ctx.restore();
      });
      if (v.result) {
        const yy = y + items.length * 108 + 34;
        withPop(ctx, pop(t, st[items.length]), cx, yy, () => pill(ctx, v.result, cx, yy, 92, skin.yellow, skin.yellowInk, fitPillSize(ctx, v.result, maxW), skin.shadow));
      }
      break;
    }
    case 'verdict': { // 判对错：亮出一句常见说法，红章“错！”或绿章“对！”砸上去
      const wrong = v.verdict !== 'right';
      font(ctx, 74, 900);
      const ls = wrap(ctx, v.claim || '', maxW - 120, 3);
      const ch = ls.length * 92 + 130; const top = y + 10;
      withPop(ctx, pop(t, p.start + 0.2), cx, top + ch / 2, () => {
        ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(cx - maxW / 2 + 6, top + 14, maxW, ch, 34); ctx.fill();
        ctx.fillStyle = skin.card; ctx.beginPath(); ctx.roundRect(cx - maxW / 2, top, maxW, ch, 34); ctx.fill();
        font(ctx, 36, 900); ctx.fillStyle = skin.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('很多人以为…', cx - maxW / 2 + 44, top + 52);
        font(ctx, 74, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center';
        ls.forEach((l, i) => ctx.fillText(l, cx, top + 120 + i * 92));
      });
      const sk = clamp((t - (st[0] ?? 1e9)) / 0.35);
      if (sk > 0) {
        if (wrong) { // 说法被划掉
          font(ctx, 74, 900);
          ls.forEach((l, i) => { const w = ctx.measureText(l).width; ctx.fillStyle = 'rgba(229,37,42,0.85)'; ctx.fillRect(cx - w / 2, top + 116 + i * 92, w * easeOut(clamp(sk * 1.4)), 8); });
        }
        const col = wrong ? '#e5252a' : '#16a34a';
        const sx = cx + maxW / 2 - 150; const sy = top + ch - 20;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.22); const sc = 2.1 - 1.1 * easeOut(sk); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(sk * 2);
        ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.beginPath(); ctx.roundRect(-130, -78, 260, 156, 26); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(-114, -62, 228, 124, 18); ctx.stroke();
        ctx.fillStyle = col; font(ctx, 104, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(wrong ? '错！' : '对！', 0, 6);
        ctx.restore();
      }
      if (v.note) withPop(ctx, pop(t, st[1]), cx, top + ch + 100, () => pill(ctx, v.note, cx, top + ch + 100, 92, skin.pill, skin.pillInk, fitPillSize(ctx, v.note, maxW - 40), skin.shadow));
      break;
    }
    case 'warning': { // 警示牌：黄黑斜纹牌子 + 逐条闪出
      const lx = cx - maxW / 2; const bh = 132;
      const shake = t - p.start < 0.6 ? Math.sin((t - p.start) * 60) * 6 * (1 - (t - p.start) / 0.6) : 0;
      withPop(ctx, pop(t, p.start + 0.15), cx, y + bh / 2, () => {
        ctx.save(); ctx.translate(shake, 0);
        ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.roundRect(lx, y, maxW, bh, 22); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.roundRect(lx, y, maxW, bh, 22); ctx.clip();
        ctx.fillStyle = '#1a1a1a';
        for (let sx = -bh; sx < maxW + bh; sx += 56) { if (sx > 110 && sx < maxW - 140) continue; ctx.beginPath(); ctx.moveTo(lx + sx, y + bh); ctx.lineTo(lx + sx + 28, y + bh); ctx.lineTo(lx + sx + 28 + bh, y); ctx.lineTo(lx + sx + bh, y); ctx.fill(); }
        ctx.restore();
        fitFont(ctx, `⚠ ${v.title || '注意'}`, 64, maxW - 300, 900); ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`⚠ ${v.title || '注意'}`, cx, y + bh / 2 + 3);
        ctx.restore();
      });
      (v.items || []).slice(0, 4).forEach((it, i) => {
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        if (a <= 0) return;
        const yy = y + bh + 70 + i * 112;
        const flash = clamp(1 - (t - st[i]) / 0.6);
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * -40, 0);
        if (flash > 0) { ctx.fillStyle = `rgba(255,210,31,${0.45 * flash})`; ctx.beginPath(); ctx.roundRect(lx - 10, yy - 46, maxW + 20, 92, 18); ctx.fill(); }
        // 三角形编号
        ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(lx + 36, yy - 36); ctx.lineTo(lx + 76, yy + 32); ctx.lineTo(lx - 4, yy + 32); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd21f'; font(ctx, 38, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), lx + 36, yy + 10);
        fitFont(ctx, it, 52, maxW - 110, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.fillText(it, lx + 100, yy + 2);
        ctx.restore();
      });
      break;
    }
    case 'formula': { // 公式：A + B = C，一块一块拼出来
      if (v.title) y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 80, skin.ink, 'center') + 50;
      const parts = (v.parts || []).slice(0, 3); const n = parts.length;
      const opW = 64; const resW = 230; const bw = Math.min(210, (maxW - resW - opW * n) / Math.max(1, n)); const bh = 190;
      let x = cx - (n * bw + n * opW + resW) / 2; const yy = y + 40;
      const block = (txt, bx, w, bg, fg, s0) => withPop(ctx, pop(t, s0, 0.32), bx + w / 2, yy + bh / 2, () => {
        ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(bx + 4, yy + 10, w, bh, 30); ctx.fill();
        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(bx, yy, w, bh, 30); ctx.fill();
        const words = [...txt]; const two = words.length > 3 && w < 220;
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (two) { const h = Math.ceil(words.length / 2); fitFont(ctx, words.slice(0, h).join(''), 64, w - 24, 900); ctx.fillText(words.slice(0, h).join(''), bx + w / 2, yy + bh / 2 - 36); ctx.fillText(words.slice(h).join(''), bx + w / 2, yy + bh / 2 + 40); } else { fitFont(ctx, txt, 70, w - 24, 900); ctx.fillText(txt, bx + w / 2, yy + bh / 2 + 3); }
      });
      const op = (ch, ox, s0) => withPop(ctx, pop(t, s0), ox + opW / 2, yy + bh / 2, () => { font(ctx, 80, 900); ctx.fillStyle = skin.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, ox + opW / 2, yy + bh / 2); });
      parts.forEach((pt, i) => { block(pt, x, bw, skin.pill, skin.pillInk, st[i]); x += bw; op(i === n - 1 ? '=' : '+', x, i === n - 1 ? st[n] : st[i + 1]); x += opW; });
      block(v.result || '', x, resW, skin.red, '#ffffff', st[n]);
      break;
    }
    case 'pyramid': { // 金字塔：从底往上一层层搭
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 84, skin.red, 'center') + 30;
      const lv = (v.levels || []).slice(0, 4); const n = lv.length; const lh = 128;
      const baseY = y + n * (lh + 10);
      lv.forEach((txt, i) => { // i=0 最底层
        const a = clamp((t - (st[i] ?? 1e9)) / 0.35);
        if (a <= 0) return;
        const wb = maxW * (1 - (i / n) * 0.62); const wt = maxW * (1 - ((i + 1) / n) * 0.62);
        const yb = baseY - i * (lh + 10); const yt = yb - lh;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, -(1 - easeOut(a)) * 60);
        const mix = n > 1 ? i / (n - 1) : 1;
        ctx.fillStyle = mix > 0.66 ? skin.red : mix > 0.33 ? skin.pillInk : skin.pill;
        ctx.beginPath(); ctx.moveTo(cx - wb / 2, yb); ctx.lineTo(cx + wb / 2, yb); ctx.lineTo(cx + wt / 2, yt); ctx.lineTo(cx - wt / 2, yt); ctx.closePath(); ctx.fill();
        fitFont(ctx, txt, 54, (wb + wt) / 2 - 60, 900); ctx.fillStyle = mix > 0.33 ? '#ffffff' : skin.pillInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, cx, yt + lh / 2 + 3);
        ctx.restore();
      });
      break;
    }
    case 'rank': { // 排行榜：领奖台，第三名先上，第一名最后
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 92, skin.ink, 'center') + 30;
      const it = (v.items || []).slice(0, 3);
      const base = y + 600; const bw = 270;
      const spots = [{ r: 0, x: cx, h: 290, c: skin.red, m: '🥇' }, { r: 1, x: cx - bw - 18, h: 210, c: skin.pillInk, m: '🥈' }, { r: 2, x: cx + bw + 18, h: 160, c: skin.pillInk, m: '🥉' }];
      spots.forEach((sp) => {
        if (!it[sp.r]) return;
        const k = clamp((t - (st[it.length - 1 - sp.r] ?? 1e9)) / 0.45);
        if (k <= 0) return;
        const h = sp.h * easeOut(k);
        ctx.fillStyle = sp.c; ctx.beginPath(); ctx.roundRect(sp.x - bw / 2, base - h, bw, h, [18, 18, 0, 0]); ctx.fill();
        if (k > 0.5) {
          const a = clamp((k - 0.5) * 2);
          ctx.save(); ctx.globalAlpha *= a;
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; font(ctx, 90, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(sp.r + 1), sp.x, base - h / 2 + 4);
          ctx.font = `86px ${EMOJI_FONT}`; ctx.fillText(sp.m, sp.x, base - h - 70);
          font(ctx, 46, 900); const ls = wrap(ctx, it[sp.r], bw - 10, 2);
          ctx.fillStyle = skin.ink; ls.forEach((l, j) => ctx.fillText(l, sp.x, base - h - 160 - (ls.length - 1 - j) * 56));
          ctx.restore();
        }
      });
      ctx.fillStyle = skin.line; ctx.fillRect(cx - maxW / 2, base, maxW, 6);
      break;
    }
    case 'timeline': { // 时间轴：横着一条线，节点上面写时间、下面写做什么，进度往右走
      y = typeTitle(ctx, v.title, t, p.start + 0.15, cx, y, maxW, 84, skin.red, 'center') + 90;
      const nodes = (v.nodes || []).slice(0, 5); const n = Math.max(1, nodes.length);
      const lx = cx - maxW / 2 + 70; const rx = cx + maxW / 2 - 70; const ly = y + 70;
      ctx.fillStyle = skin.line; ctx.beginPath(); ctx.roundRect(lx, ly - 5, rx - lx, 10, 5); ctx.fill();
      const last = st[n - 1] ?? p.start; const k = clamp((t - (st[0] ?? 1e9) + 0.2) / Math.max(0.3, last - (st[0] ?? 0) + 0.2));
      ctx.fillStyle = skin.red; ctx.beginPath(); ctx.roundRect(lx, ly - 5, (rx - lx) * easeOut(k), 10, 5); ctx.fill();
      const gap = n > 1 ? (rx - lx) / (n - 1) : 0;
      nodes.forEach((nd, i) => {
        const x = n > 1 ? lx + gap * i : cx; const s = pop(t, st[i], 0.32);
        withPop(ctx, s, x, ly, () => {
          ctx.fillStyle = skin.card; ctx.beginPath(); ctx.arc(x, ly, 30, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = skin.red; ctx.beginPath(); ctx.arc(x, ly, 20, 0, Math.PI * 2); ctx.fill();
          const up = i % 2 === 0;
          pill(ctx, nd.when || '', x, up ? ly - 86 : ly + 86, 70, skin.red, '#ffffff', fitPillSize(ctx, nd.when || '', Math.max(160, gap)) - 6, null);
          font(ctx, 40, 900); const ls = wrap(ctx, nd.what || '', Math.max(170, gap - 10), 2);
          ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ls.forEach((l, j) => ctx.fillText(l, x, up ? ly + 72 + j * 50 : ly - 150 - (ls.length - 1 - j) * 50));
        });
      });
      break;
    }
    case 'keywords': { // 关键词三连：几个大字依次砸下来
      const words = (v.words || []).slice(0, 4); const n = words.length;
      font(ctx, 100, 900);
      const sepW = 70; const total = words.reduce((a, w) => a + ctx.measureText(w).width, 0) + sepW * (n - 1);
      const size = Math.min(190, 100 * (maxW - 20) / Math.max(1, total));
      font(ctx, size, 900);
      const widths = words.map((w) => ctx.measureText(w).width); const tw = widths.reduce((a, b) => a + b, 0) + (sepW * size / 100) * (n - 1);
      let x = cx - tw / 2; const yy = y + 170;
      words.forEach((w, i) => {
        const k = clamp((t - (st[i] ?? 1e9)) / 0.28);
        const wx = x + widths[i] / 2;
        if (k > 0) {
          ctx.save(); ctx.translate(wx, yy); ctx.rotate((i % 2 ? 1 : -1) * 0.05 * (1 - easeOut(k))); const sc = 2.2 - 1.2 * easeOut(k); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2);
          font(ctx, size, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = size * 0.12; ctx.strokeStyle = skin.card; ctx.lineJoin = 'round'; ctx.strokeText(w, 0, 0);
          ctx.fillStyle = i % 2 ? skin.ink : skin.red; ctx.fillText(w, 0, 0);
          ctx.restore();
        }
        x += widths[i];
        if (i < n - 1) { if (clamp((t - (st[i + 1] ?? 1e9)) / 0.2) > 0) { ctx.fillStyle = skin.ink2; ctx.beginPath(); ctx.arc(x + (sepW * size / 100) / 2, yy, size * 0.07, 0, Math.PI * 2); ctx.fill(); } x += sepW * size / 100; }
      });
      if (v.sub) withPop(ctx, pop(t, st[n]), cx, yy + size * 0.5 + 90, () => pill(ctx, v.sub, cx, yy + size * 0.5 + 90, 92, skin.pill, skin.pillInk, fitPillSize(ctx, v.sub, maxW - 40), skin.shadow));
      break;
    }
    case 'ticket': { // 体验课门票：主券 + 撕票口 + 右边存根
      const info = (v.info || []).slice(0, 3);
      const tw = maxW - 20; const th = 400; const tx = cx - tw / 2; const ty = y + 20; const stub = 230;
      const k = clamp((t - (p.start + 0.2)) / 0.5);
      if (k > 0) {
        ctx.save(); ctx.translate(cx, ty + th / 2); ctx.rotate(-0.035 - (1 - easeOut(k)) * 0.12); ctx.translate(-cx, -(ty + th / 2) + (1 - easeOut(k)) * 120); ctx.globalAlpha *= clamp(k * 2);
        const path = () => { ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 30); };
        ctx.fillStyle = skin.shadow; ctx.save(); ctx.translate(6, 14); path(); ctx.fill(); ctx.restore();
        ctx.save(); path(); ctx.clip();
        ctx.fillStyle = skin.red; ctx.fillRect(tx, ty, tw - stub, th);
        ctx.fillStyle = skin.yellow; ctx.fillRect(tx + tw - stub, ty, stub, th);
        ctx.restore();
        // 撕票口：上下两个半圆缺口 + 虚线
        ctx.fillStyle = skin.bg; for (const yy of [ty, ty + th]) { ctx.beginPath(); ctx.arc(tx + tw - stub, yy, 26, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 5; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(tx + tw - stub, ty + 40); ctx.lineTo(tx + tw - stub, ty + th - 40); ctx.stroke(); ctx.setLineDash([]);
        // 主券
        font(ctx, 36, 900); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.kind || '体验课', tx + 44, ty + 62);
        fitFont(ctx, v.name || '', 70, tw - stub - 80, 900); ctx.fillStyle = '#ffffff'; ctx.fillText(v.name || '', tx + 44, ty + 140);
        info.forEach((ln, i) => { const a = clamp((t - (st[i] ?? 1e9)) / 0.3); if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; fitFont(ctx, `· ${ln}`, 44, tw - stub - 80, 700); ctx.fillStyle = '#ffffff'; ctx.fillText(`· ${ln}`, tx + 44, ty + 226 + i * 58); ctx.restore(); });
        // 存根
        ctx.font = `96px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.fillText('🎟️', tx + tw - stub / 2, ty + th / 2 - 50);
        font(ctx, 46, 900); ctx.fillStyle = skin.yellowInk; ctx.fillText('入场券', tx + tw - stub / 2, ty + th / 2 + 62);
        ctx.restore();
      }
      if (v.cta) withPop(ctx, pop(t, st[info.length]), cx, ty + th + 110, () => pill(ctx, v.cta, cx, ty + th + 110, 92, skin.pill, skin.pillInk, fitPillSize(ctx, v.cta, maxW - 40), skin.shadow));
      break;
    }
    case 'certificate': { // 证书 / 喜报 / 成绩单：米色纸 + 金边 + 红章砸上去
      const cw = maxW - 60; const chh = 560; const x0 = cx - cw / 2; const y0 = y + 10;
      withPop(ctx, pop(t, p.start + 0.2, 0.4), cx, y0 + chh / 2, () => {
        ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(x0 + 6, y0 + 16, cw, chh, 20); ctx.fill();
        ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.roundRect(x0, y0, cw, chh, 20); ctx.fill();
        ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 8; ctx.beginPath(); ctx.roundRect(x0 + 22, y0 + 22, cw - 44, chh - 44, 12); ctx.stroke();
        ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x0 + 38, y0 + 38, cw - 76, chh - 76, 8); ctx.stroke();
        font(ctx, 96, 900); ctx.fillStyle = '#c62828'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.kind || '喜报', cx, y0 + 130);
        ctx.fillStyle = '#c9a227'; ctx.fillRect(cx - 220, y0 + 130, 110, 4); ctx.fillRect(cx + 110, y0 + 130, 110, 4);
        fitFont(ctx, v.name || '', 70, cw - 140, 900); ctx.fillStyle = '#1d1a14'; ctx.fillText(v.name || '', cx, y0 + 270);
        fitFont(ctx, v.detail || '', 46, cw - 160, 700); ctx.fillStyle = '#6b5f4a'; ctx.fillText(v.detail || '', cx, y0 + 360);
      });
      if (v.seal) {
        const sk = clamp((t - (st[1] ?? st[0] ?? 1e9)) / 0.35);
        if (sk > 0) {
          const sx = x0 + cw - 150; const sy = y0 + chh - 130;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.25); const sc = 2 - easeOut(sk); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(sk * 2) * 0.9;
          ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
          fitFont(ctx, v.seal, 50, 120, 900); ctx.fillStyle = '#d32f2f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.seal, 0, 4);
          ctx.restore();
        }
      }
      break;
    }
    case 'map': { // 校区地址卡：小地图 + 图钉落下 + 地址 + 附近地标
      const lx = cx - maxW / 2; const mh = 380;
      withPop(ctx, pop(t, p.start + 0.2), cx, y + mh / 2, () => {
        ctx.save(); ctx.beginPath(); ctx.roundRect(lx, y, maxW, mh, 30); ctx.clip();
        ctx.fillStyle = skin.bg2; ctx.fillRect(lx, y, maxW, mh);
        ctx.fillStyle = 'rgba(120,190,120,0.25)'; ctx.beginPath(); ctx.roundRect(lx + 40, y + 40, 170, 120, 20); ctx.fill(); ctx.beginPath(); ctx.roundRect(lx + maxW - 220, y + 230, 190, 110, 20); ctx.fill();
        ctx.fillStyle = 'rgba(110,160,230,0.25)'; ctx.beginPath(); ctx.ellipse(lx + maxW - 120, y + 90, 90, 55, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = skin.card; ctx.lineCap = 'round';
        ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(lx - 20, y + 210); ctx.lineTo(lx + maxW + 20, y + 170); ctx.stroke();
        ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(lx + 300, y - 20); ctx.lineTo(lx + 360, y + mh + 20); ctx.stroke();
        ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(lx + 60, y + mh + 20); ctx.lineTo(lx + 520, y - 20); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = skin.line; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(lx, y, maxW, mh, 30); ctx.stroke();
      });
      const pk = clamp((t - (st[0] ?? 1e9)) / 0.45);
      if (pk > 0) { // 图钉从上面掉下来，落地弹一下
        const px = lx + 340; const drop = pk < 0.7 ? -260 * (1 - easeOut(pk / 0.7)) : -Math.sin(((pk - 0.7) / 0.3) * Math.PI) * 26; const py = y + 190 + drop;
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(lx + 340, y + 196, 30 * pk, 10 * pk, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skin.red; ctx.beginPath(); ctx.arc(px, py - 70, 46, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(px, py); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py - 72, 18, 0, Math.PI * 2); ctx.fill();
      }
      withPop(ctx, pop(t, st[0]), cx, y + mh + 70, () => {
        fitFont(ctx, `📍 ${v.address || ''}`, 50, maxW, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`📍 ${v.address || ''}`, lx, y + mh + 70);
      });
      (v.near || []).slice(0, 3).forEach((nm, i) => {
        const a = pop(t, st[i + 1]); const w = maxW / 3 - 12; const x = lx + i * (w + 18) + w / 2; const yy = y + mh + 160;
        withPop(ctx, a, x, yy, () => pill(ctx, nm, x, yy, 76, skin.pill, skin.pillInk, fitPillSize(ctx, nm, w), null));
      });
      break;
    }
    case 'notify': { // 手机通知：一条条从上面滑下来
      const msgs = (v.msgs || []).slice(0, 3); const nw = maxW; const nh = 168;
      msgs.forEach((m, i) => {
        const k = clamp((t - (st[i] ?? 1e9)) / 0.4);
        if (k <= 0) return;
        const yy = y + 10 + i * (nh + 24); const dy = (1 - easeOut(k)) * -120;
        ctx.save(); ctx.globalAlpha *= clamp(k * 2); ctx.translate(0, dy);
        ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.roundRect(cx - nw / 2 + 4, yy + 12, nw, nh, 36); ctx.fill();
        ctx.fillStyle = skin.card; ctx.beginPath(); ctx.roundRect(cx - nw / 2, yy, nw, nh, 36); ctx.fill();
        ctx.strokeStyle = skin.line; ctx.lineWidth = 3; ctx.stroke();
        const ix = cx - nw / 2 + 34; ctx.fillStyle = skin.red; ctx.beginPath(); ctx.roundRect(ix, yy + 30, 76, 76, 20); ctx.fill();
        ctx.font = `44px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.icon || '🔔', ix + 38, yy + 70);
        font(ctx, 32, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'left'; ctx.fillText(v.app || '通知', ix + 100, yy + 46);
        ctx.textAlign = 'right'; ctx.fillText('现在', cx + nw / 2 - 34, yy + 46);
        fitFont(ctx, m.title || '', 46, nw - 180, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.fillText(m.title || '', ix + 100, yy + 94);
        fitFont(ctx, m.text || '', 38, nw - 180, 700); ctx.fillStyle = skin.ink2; ctx.fillText(m.text || '', ix + 100, yy + 138);
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
    case 'compare': { const n = Math.max((v.left?.items || []).length, (v.right?.items || []).length, 1); return top + lines(v.title, 92) * 109 + 34 + 92 + n * 100 + 22; }
    case 'quote': { font(ctx, 112, 900); return top + 90 + wrap(ctx, v.text || '', layout.w - 40, 3).length * 132 + (v.by ? 70 : 10); }
    case 'ask': return top + 230 + lines(v.q, 84) * 99 + 40 + (v.options || []).length * 112;
    case 'verdict': { font(ctx, 74, 900); return top + 10 + wrap(ctx, v.claim || '', layout.w - 120, 3).length * 92 + 130 + (v.note ? 150 : 20); }
    case 'formula': return top + (v.title ? lines(v.title, 80) * 94 + 50 : 0) + 40 + 190 + 20;
    case 'pyramid': return top + lines(v.title, 84) * 99 + 30 + (v.levels || []).length * 138;
    case 'rank': return top + lines(v.title, 92) * 109 + 30 + 610;
    case 'timeline': return top + lines(v.title, 84) * 99 + 90 + 70 + 150;
    case 'keywords': return top + 170 + 110 + (v.sub ? 160 : 0);
    case 'ticket': return top + 20 + 400 + (v.cta ? 170 : 30);
    case 'certificate': return top + 10 + 560 + 20;
    case 'notify': return top + 10 + (v.msgs || []).length * 192;
    default: return 0; // 表格/清单/步骤/聊天/课程卡/自测/警示/地址在左侧，人物靠右
  }
}

// ---------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'white', assets }) {
  const skin = themedSkin(skinId, script.theme);
  const tEmoji = themeEmoji(script.theme);
  ctx.save();
  ctx.fillStyle = skin.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 900, 100, W / 2, 900, 1100);
  g.addColorStop(0, skin.bg); g.addColorStop(1, skin.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 行业壁纸：很淡的行业表情，慢慢往上飘
  if (tEmoji) {
    drawWallpaper(ctx, tEmoji, t, { w: W, h: Y.person, alpha: skinId === 'navy' ? 0.1 : 0.075 });
  }

  // 顶部口号（图标跟着行业换）
  ctx.font = `56px ${EMOJI_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tEmoji ? tEmoji[0] : '🔎', 56, Y.header);
  fitFont(ctx, script.slogan || script.title || '', 50, W - 200, 900);
  ctx.fillStyle = skin.ink; ctx.fillText(script.slogan || script.title || '', 130, Y.header + 2);

  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx];
  const v = s?.visual || { type: 'title', title: '' };

  // 真人：每个镜头换一张照片（姿势），左右交替
  const photos = assets?.photos?.length ? assets.photos : null;
  const img = photos ? photos[idx % photos.length] : demoPresenter(idx % 3);
  const wide = WIDE.has(v.type);
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
  // 行业徽章：讲师头边上一个白色圆章，里面是行业表情，轻轻上下浮动
  if (tEmoji && k > 0.3) {
    const bx = clamp(wide || side < 0 ? px + pw - 20 : px + 20, 100, W - 100); // 左边放内容的版式：徽章放讲师右边，别压住内容
    const by = py + ph * 0.16 + Math.sin(t * 2.4) * 10;
    const bs = pop(t, (p?.start ?? 0) + 0.25, 0.4);
    withPop(ctx, bs, bx, by, () => {
      ctx.fillStyle = skin.shadow; ctx.beginPath(); ctx.arc(bx + 4, by + 10, 68, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skin.card; ctx.beginPath(); ctx.arc(bx, by, 68, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = skin.pill; ctx.lineWidth = 8; ctx.stroke();
      ctx.font = `76px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tEmoji[idx % tEmoji.length], bx, by + 4);
    });
  }

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
  // 行业主题：key 必须是认识的；表情最多 3 个
  s.theme = normalizeTheme(s.theme);
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
        left: { label: str(v.left?.label, 6), items: (v.left?.items || []).map((q) => str(q, 12)).filter(Boolean).slice(0, 4) },
        right: { label: str(v.right?.label, 6), items: (v.right?.items || []).map((q) => str(q, 12)).filter(Boolean).slice(0, 4) },
        steps: (v.steps || []).map((q) => str(q, 12)).filter(Boolean).slice(0, 5),
        who: str(v.who, 8), avatar: String(v.avatar || '').trim().slice(0, 8),
        name: str(v.name, 14), points: (v.points || []).map((q) => str(q, 14)).filter(Boolean).slice(0, 4), badge: str(v.badge, 7), cta: str(v.cta, 16),
        text: str(v.text, 24), by: str(v.by, 10),
        q: str(v.q, 18), options: (v.options || []).map((q) => str(q, 12)).filter(Boolean).slice(0, 4),
        result: str(v.result, 16),
        claim: str(v.claim, 20), verdict: v.verdict === 'right' ? 'right' : 'wrong', note: str(v.note, 16),
        parts: (v.parts || []).map((q) => str(q, 5)).filter(Boolean).slice(0, 3),
        levels: (v.levels || []).map((q) => str(q, 8)).filter(Boolean).slice(0, 4),
        nodes: (v.nodes || []).filter(Boolean).slice(0, 5).map((n) => ({ when: str(n.when, 6), what: str(n.what, 12) })),
        words: (v.words || []).map((q) => str(q, 4)).filter(Boolean).slice(0, 4),
        kind: str(v.kind, 6), info: (v.info || []).map((q) => str(q, 14)).filter(Boolean).slice(0, 3),
        detail: str(v.detail, 16), seal: str(v.seal, 4),
        address: str(v.address, 22), near: (v.near || []).map((q) => str(q, 8)).filter(Boolean).slice(0, 3),
        app: str(v.app, 6), icon: String(v.icon || '').trim().slice(0, 8),
        // msgs 在聊天和通知里都用：聊天是 {from,text}，通知是 {title,text}
        msgs: (v.msgs || []).filter((m) => m && (m.text || m.title)).slice(0, 4).map((m) => ({ from: m.from === 'me' ? 'me' : 'them', title: str(m.title, 12), text: str(m.text, 30) })),
      },
      lines, en: lines.map((_, i) => en[i] || ''),
    };
  }).filter((x) => x.lines.length);
  return s;
}
