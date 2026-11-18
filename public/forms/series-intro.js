// 形式 04：系列开场
// 灵魂：用“每晚睡前看一集，一个月后领先 90% 的人”做钩子，几十秒交代：讲什么、我是谁、怎么带你学、资料备好了、现在关注。
// 版式：顶部头像 + 账号 + 话题，绿青渐变系列大字（全片固定）；中间一块深色网格“屏幕”，每句换一个画面；底部一行字幕。
import { W, H, clamp, easeOut, font, fitFont, wrap } from '../engine/draw.js';
import { loadFontFaces } from '../engine/font-preload.js';
import { demoPresenter } from './photo-talk.js';
import { themeEmoji, normalizeTheme, drawWallpaper } from './themes.js';

export const meta = {
  id: 'series-intro',
  name: '系列开场',
  category: '获客引流',
  outcome: '系列课第一集：承诺 + 人设 + 关注引导，专门用来涨粉',
  ideas: ['每晚睡前10分钟讲一个语法点', '每天一道中考压轴题', '30天搞定初中几何', '每晚记住5个高频单词'],
  tagline: '“每晚睡前看一集”式系列开篇：打字钩子、人设贴纸、学习路线',
  fits: '系列课开篇 · 涨粉 · 专栏引流 · 老师人设',
  durations: [1, 2, 3],
  bgm: 'edm',
  needsPhotos: true,
  photoHint: '上传 1 张你的照片就够，会做成头像和带白边的人设贴纸。不传就用卡通形象。照片只存在你自己的电脑里。',
};

export const skins = {
  dark: { name: '黑底霓虹', bg: '#050505', stage: '#1a1a1c', grid: 'rgba(255,255,255,0.07)', g1: '#3ef060', g2: '#2fb8ff', ink: '#ffffff', ink2: '#a0a4ab', hl: '#ffd400', hl2: '#3ef060', card: '#ffffff', cardBar: '#2f6fe0', node: '#16a34a', nodeInk: '#ffffff', arc: '#ffd400' },
  purple: { name: '紫夜', bg: '#07040f', stage: '#17112a', grid: 'rgba(190,160,255,0.09)', g1: '#ff5fd2', g2: '#8b7bff', ink: '#ffffff', ink2: '#a9a1c4', hl: '#ffe14d', hl2: '#ff7ad9', card: '#ffffff', cardBar: '#7c4dff', node: '#7c4dff', nodeInk: '#ffffff', arc: '#ffe14d' },
  ocean: { name: '深海蓝', bg: '#020812', stage: '#0d1a2c', grid: 'rgba(120,190,255,0.08)', g1: '#33e1ff', g2: '#4f8bff', ink: '#ffffff', ink2: '#9fb2c8', hl: '#ffcf33', hl2: '#33e1ff', card: '#ffffff', cardBar: '#1f6feb', node: '#0ea5e9', nodeInk: '#ffffff', arc: '#ffcf33' },
};

const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const VISUALS = ['type', 'icons', 'avatar', 'tree', 'big', 'cards', 'follow', 'countdown', 'chat', 'checklist', 'vs', 'calendar', 'episodes', 'quote', 'ask',
  'progress', 'quest', 'levelup', 'lockscreen', 'grid4', 'gift', 'neon', 'bedtime', 'pledge', 'timeline', 'quiz', 'notebook', 'top3', 'spotlight', 'faq'];
// 行业霓虹色：系列大字的渐变、高亮色跟着行业换（只在默认的黑底霓虹皮肤上换）
const NEON = { k12: ['#ff5a5a', '#ffb03a'], exam: ['#5b8cff', '#33e1ff'], language: ['#2ee6d6', '#5bb7ff'], music: ['#b18cff', '#ff7ad9'], dance: ['#ff5fd2', '#ff9a5f'], art: ['#ff8a3d', '#ffd23f'], coding: ['#33e1ff', '#4f8bff'], driving: ['#ffb300', '#ffe14d'], beauty: ['#ff7ab6', '#ffc2dc'], fitness: ['#3ef060', '#b6ff3b'], cooking: ['#ffa44d', '#ffd59a'], business: ['#ffd400', '#ffb000'] };
const SY = 600; const SH = 608; // 屏幕区 1080×608（16:9）

// ---------- 工具 ----------
const pop = (t, t0, dur = 0.26) => {
  if (t0 == null || t < t0) return 0;
  const k = clamp((t - t0) / dur);
  return k < 0.7 ? easeOut(k / 0.7) * 1.1 : 1.1 - 0.1 * ((k - 0.7) / 0.3);
};
function withPop(ctx, s, cx, cy, fn) {
  if (s <= 0.001) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.globalAlpha *= clamp(s * 1.5); fn(); ctx.restore();
}
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
/** 把照片做成“贴纸”：白色描边 + 投影（结果缓存） */
const stickerCache = new WeakMap();
function sticker(img) {
  if (stickerCache.has(img)) return stickerCache.get(img);
  const scale = Math.min(1, 700 / img.height);
  const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
  const pad = 16;
  const sil = makeCanvas(w, h); const sg = sil.getContext('2d');
  sg.drawImage(img, 0, 0, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, w, h);
  const c = makeCanvas(w + pad * 2, h + pad * 2); const g = c.getContext('2d');
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) g.drawImage(sil, pad + Math.cos(a) * 10, pad + Math.sin(a) * 10);
  g.drawImage(img, pad, pad, w, h);
  stickerCache.set(img, c);
  return c;
}
/** 带关键词高亮的一行字：hl 部分换颜色 */
function hlText(ctx, text, hl, x, y, size, color, hlColor, align = 'left', shown = Infinity) {
  font(ctx, size, 900);
  const chars = [...text];
  const total = ctx.measureText(text).width;
  let cx = align === 'center' ? x - total / 2 : x;
  const start = hl ? text.indexOf(hl) : -1;
  const hlStart = start >= 0 ? [...text.slice(0, start)].length : -1;
  const hlEnd = hlStart >= 0 ? hlStart + [...hl].length : -1;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  chars.slice(0, Math.min(chars.length, shown)).forEach((ch, i) => {
    const on = i >= hlStart && i < hlEnd;
    ctx.strokeText(ch, cx, y);
    ctx.fillStyle = on ? hlColor : color; ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width;
  });
  return total;
}
function roundRect(ctx, x, y, w, h, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

// ---------- 时间规划 ----------
const itemCount = (v) => {
  switch (v?.type) {
    case 'type': return (v.rows || []).length;
    case 'icons': return (v.emoji || []).length + (v.sub ? 1 : 0);
    case 'avatar': return 2;
    case 'tree': return (v.children || []).length;
    case 'cards': return (v.cards || []).length;
    case 'big': return v.sub ? 1 : 0;
    case 'countdown': return v.sub ? 1 : 0;
    case 'chat': return (v.msgs || []).length;
    case 'checklist': return (v.items || []).length;
    case 'vs': return 1;
    case 'calendar': return 7 + (v.sub ? 1 : 0);
    case 'episodes': return (v.items || []).length;
    case 'quote': return v.by ? 1 : 0;
    case 'ask': return (v.options || []).length;
    case 'quest': return (v.stops || []).length;
    case 'levelup': return 2;
    case 'grid4': return (v.items || []).length;
    case 'gift': return (v.items || []).length;
    case 'pledge': return (v.items || []).length + 1;
    case 'timeline': return (v.nodes || []).length;
    case 'quiz': return (v.options || []).length + 1;
    case 'notebook': return (v.lines || []).length;
    case 'top3': return (v.items || []).length;
    case 'faq': return (v.items || []).length;
    default: return 1;
  }
};
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i]; const next = tl.sections[i + 1];
    const n = itemCount(s.visual);
    const a = sec.start + 0.25;
    const b = Math.max(a + 0.3, sec.lines.length > 1 ? sec.lines[sec.lines.length - 1].start + 0.4 : sec.lines[0].end - 0.6);
    const steps = [];
    if (s.visual?.type === 'type') {
      // 打字：每行对应一句口播的开头（行数多于句子时，平均分配）
      for (let k = 0; k < n; k++) steps.push(a + ((b - a) * k) / Math.max(1, n - 1 || 1));
    } else for (let k = 0; k < n; k++) steps.push(a + 0.2 + ((b - a) * k) / Math.max(1, n));
    return { start: sec.start, end: next ? next.start : tl.duration, lineEnd: sec.end, steps };
  });
}

// ---------- 屏幕里的画面 ----------
function drawStageBg(ctx, skin, t) {
  ctx.fillStyle = skin.stage; ctx.fillRect(0, SY, W, SH);
  ctx.strokeStyle = skin.grid; ctx.lineWidth = 2;
  const off = (t * 12) % 54;
  ctx.beginPath();
  for (let x = -54 + off; x < W + 54; x += 54) { ctx.moveTo(x, SY); ctx.lineTo(x, SY + SH); }
  for (let y = SY; y <= SY + SH; y += 54) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  const g = ctx.createRadialGradient(W / 2, SY + SH / 2, 100, W / 2, SY + SH / 2, 700);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, SY, W, SH);
}

function drawVisual(ctx, v, p, t, skin, assets, account) {
  const st = p.steps; const cx = W / 2; const top = SY;
  switch (v.type) {
    case 'type': {
      const rows = (v.rows || []).slice(0, 3);
      const aligns = ['left', 'center', 'left'];
      rows.forEach((r, i) => {
        if (t < st[i]) return;
        const shown = Math.floor((t - st[i]) * 18) + 1;
        const y = top + 120 + i * 180;
        const align = aligns[i];
        const size = fitFont(ctx, r.zh, 76, W - 120, 900);
        const x = align === 'left' ? 60 : cx;
        hlText(ctx, r.zh, r.hl, x, y, size, skin.ink, skin.hl, align, shown);
        if (r.en && shown > [...r.zh].length * 0.4) {
          const enShown = Math.floor((t - st[i]) * 40);
          font(ctx, 30, 700); ctx.font = `italic 700 30px "Noto Sans SC", sans-serif`;
          const part = r.en.slice(0, enShown);
          const ew = ctx.measureText(r.en).width;
          ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(part, align === 'left' ? 64 : cx - ew / 2, y + size * 0.78);
        }
      });
      break;
    }
    case 'icons': {
      const title = v.title || '';
      const shown = Math.floor((t - p.start - 0.1) * 16) + 1;
      const size = fitFont(ctx, title, 70, W - 120, 900);
      hlText(ctx, title, v.hl, cx, top + 100, size, skin.ink, skin.hl, 'center', shown);
      const em = (v.emoji || []).slice(0, 8);
      const per = em.length > 4 ? Math.ceil(em.length / 2) : em.length;
      em.forEach((e, i) => {
        const row = Math.floor(i / per); const col = i % per;
        const n = Math.min(per, em.length - row * per);
        const x = cx + (col - (n - 1) / 2) * 140; const y = top + (v.sub ? 250 : 300) + row * 140;
        withPop(ctx, pop(t, st[i]), x, y, () => {
          roundRect(ctx, x - 56, y - 56, 112, 112, 26, 'rgba(255,255,255,0.08)');
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x - 56, y - 56, 112, 112, 26); ctx.stroke();
          ctx.fillStyle = '#000'; ctx.font = `68px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y + 4);
        });
      });
      if (v.sub) withPop(ctx, pop(t, st[em.length]), cx, top + SH - 110, () => {
        const s2 = fitFont(ctx, v.sub, 92, W - 100, 900);
        hlText(ctx, v.sub, v.sub.slice(-3), cx, top + SH - 110, s2, skin.ink, skin.hl, 'center');
      });
      break;
    }
    case 'avatar': {
      const img = assets?.photos?.[0] || demoPresenter(0);
      const sk = sticker(img);
      const h = 440; const w = sk.width * (h / sk.height);
      const k = easeOut(clamp((t - p.start) / 0.35));
      const ax = cx - (v.card ? 180 : 0) - w / 2; const ay = top + SH - h + (1 - k) * 80;
      ctx.save(); ctx.globalAlpha = k;
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
      ctx.drawImage(sk, ax, ay, w, h);
      ctx.restore();
      // 弯曲大字
      const arc = v.arc || '';
      const ap = clamp((t - st[0]) / 0.4);
      if (ap > 0 && arc) {
        const chars = [...arc];
        const R = 560; const ccx = cx - (v.card ? 180 : 0); const ccy = top + 665;
        const fs2 = chars.length > 7 ? 80 : 98;
        font(ctx, fs2, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // 按每个字的真实宽度排在圆弧上（英文字母比汉字窄，不能等距）
        const widths = chars.map((ch) => ctx.measureText(ch).width + 4);
        const totalW = widths.reduce((x, y) => x + y, 0);
        const span = Math.min(1.3, totalW / R);
        const scaleW = span / (totalW / R);
        let acc = 0;
        chars.forEach((ch, i) => {
          const wi = widths[i] * scaleW;
          if (i / chars.length > ap * 1.2) { acc += wi; return; }
          const ang = -Math.PI / 2 - span / 2 + (acc + wi / 2) / R;
          acc += wi;
          const x = ccx + Math.cos(ang) * R; const y = ccy + Math.sin(ang) * R;
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
          ctx.lineWidth = 16; ctx.strokeStyle = '#111'; ctx.lineJoin = 'round'; ctx.strokeText(ch, 0, 0);
          ctx.fillStyle = skin.arc; ctx.fillText(ch, 0, 0);
          ctx.restore();
        });
      }
      if (v.card) withPop(ctx, pop(t, st[1]), cx + 270, top + 430, () => {
        const x = cx + 90; const y = top + 330; const cw = 380; const ch = 200;
        roundRect(ctx, x, y, cw, ch, 22, 'rgba(20,22,28,0.92)');
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 22); ctx.stroke();
        avatarCircle(ctx, assets, account, x + 60, y + 62, 38, skin);
        fitFont(ctx, v.card.title || account || '', 34, cw - 130, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(v.card.title || account || '', x + 112, y + 62);
        (v.card.stats || []).slice(0, 2).forEach((s, i) => {
          const px = x + 28 + i * 172; const py = y + 140;
          roundRect(ctx, px, py - 26, 160, 52, 14, i ? 'rgba(255,212,0,0.16)' : 'rgba(62,240,96,0.16)');
          fitFont(ctx, s, 28, 140, 900); ctx.fillStyle = i ? skin.hl : skin.hl2; ctx.textAlign = 'center'; ctx.fillText(s, px + 80, py + 2);
        });
      });
      break;
    }
    case 'tree': {
      const kids = (v.children || []).slice(0, 4);
      const rootY = top + 110;
      withPop(ctx, pop(t, p.start + 0.15), cx, rootY, () => {
        const rw = Math.max(240, (fitFont(ctx, v.root || '', 52, 400, 900), ctx.measureText(v.root || '').width + 80));
        roundRect(ctx, cx - rw / 2, rootY - 46, rw, 92, 18, 'rgba(255,255,255,0.06)');
        ctx.strokeStyle = skin.hl2; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(cx - rw / 2, rootY - 46, rw, 92, 18); ctx.stroke();
        ctx.fillStyle = skin.hl2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.root || '', cx, rootY + 2);
      });
      const busY = top + 250; const kidY = top + 400;
      const gap = (W - 120) / Math.max(1, kids.length);
      const xs = kids.map((_, i) => 60 + gap * (i + 0.5));
      const lineP = clamp((t - p.start - 0.3) / 0.4);
      if (lineP > 0 && kids.length) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx, rootY + 46); ctx.lineTo(cx, rootY + 46 + (busY - rootY - 46) * lineP); ctx.stroke();
        if (lineP >= 1) {
          const spread = clamp((t - p.start - 0.7) / 0.35);
          ctx.beginPath(); ctx.moveTo(cx - (cx - xs[0]) * spread, busY); ctx.lineTo(cx + (xs[xs.length - 1] - cx) * spread, busY); ctx.stroke();
        }
      }
      kids.forEach((kd, i) => {
        const s = pop(t, st[i]);
        if (s <= 0) return;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(xs[i], busY); ctx.lineTo(xs[i], busY + (kidY - 50 - busY) * clamp(s)); ctx.stroke();
        withPop(ctx, s, xs[i], kidY, () => {
          const bw = Math.min(gap - 24, 250);
          roundRect(ctx, xs[i] - bw / 2, kidY - 50, bw, 100, 20, skin.node);
          ctx.fillStyle = '#000'; ctx.font = `44px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(kd.icon || '⭐', xs[i] - bw / 2 + 44, kidY + 2);
          fitFont(ctx, kd.label || '', 40, bw - 96, 900); ctx.fillStyle = skin.nodeInk; ctx.textAlign = 'left';
          ctx.fillText(kd.label || '', xs[i] - bw / 2 + 80, kidY + 2);
        });
      });
      break;
    }
    case 'big': {
      const s = pop(t, p.start + 0.1, 0.32);
      withPop(ctx, s, cx, top + (v.sub ? 260 : 300), () => {
        const size = fitFont(ctx, v.big || '', 140, W - 90, 900);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const g = ctx.createLinearGradient(0, top + 200, 0, top + 360);
        g.addColorStop(0, '#fff6b0'); g.addColorStop(0.45, skin.hl); g.addColorStop(1, '#e09a00');
        ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#1a1200'; ctx.lineJoin = 'round';
        ctx.strokeText(v.big || '', cx, top + (v.sub ? 260 : 300));
        ctx.fillStyle = g; ctx.fillText(v.big || '', cx, top + (v.sub ? 260 : 300));
        void size;
      });
      if (v.sub) withPop(ctx, pop(t, st[0]), cx, top + 430, () => {
        fitFont(ctx, v.sub, 58, W - 120, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.sub, cx, top + 430);
      });
      break;
    }
    case 'cards': {
      const cards = (v.cards || []).slice(0, 9);
      const hasTitle = !!v.title;
      if (hasTitle) {
        const s = pop(t, p.start + 0.1);
        withPop(ctx, s, cx, top + 80, () => {
          const size = fitFont(ctx, v.title, 76, W - 100, 900);
          ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#1a1200'; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeText(v.title, cx, top + 80); ctx.fillStyle = skin.hl; ctx.fillText(v.title, cx, top + 80);
        });
      }
      const cols = cards.length > 6 ? 3 : cards.length > 3 ? 3 : cards.length;
      const rows = Math.ceil(cards.length / cols);
      const areaTop = top + (hasTitle ? 150 : 40); const areaH = SH - (hasTitle ? 180 : 70);
      const cw = Math.min(300, (W - 100) / cols - 24); const chh = Math.min(areaH / rows - 20, cw * 0.62);
      cards.forEach((title, i) => {
        const r = Math.floor(i / cols); const c = i % cols;
        const n = Math.min(cols, cards.length - r * cols);
        const x = cx + (c - (n - 1) / 2) * (cw + 24) - cw / 2; const y = areaTop + r * (chh + 20);
        const s = pop(t, st[i], 0.3);
        const rot = (((i * 37) % 7) - 3) * 0.012;
        withPop(ctx, s, x + cw / 2, y + chh / 2, () => {
          ctx.save(); ctx.translate(x + cw / 2, y + chh / 2); ctx.rotate(rot * (1 - clamp((t - st[i]) / 0.5))); ctx.translate(-(x + cw / 2), -(y + chh / 2));
          ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
          roundRect(ctx, x, y, cw, chh, 14, skin.card);
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = skin.cardBar; ctx.beginPath(); ctx.roundRect(x, y, cw, 46, [14, 14, 0, 0]); ctx.fill();
          fitFont(ctx, title, 28, cw - 30, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(title, x + 16, y + 24);
          ctx.fillStyle = '#e3e7ee';
          for (let l = 0; l < 4 && 64 + l * 26 < chh - 12; l++) ctx.fillRect(x + 16, y + 64 + l * 26, (cw - 32) * (l % 3 === 2 ? 0.6 : 0.9), 10);
          ctx.restore();
        });
      });
      break;
    }
    case 'follow': {
      const s = pop(t, p.start + 0.1, 0.35);
      withPop(ctx, s, cx, top + 250, () => {
        avatarCircle(ctx, assets, account, cx, top + 250, 120, skin, true);
        const b = pop(t, p.start + 0.5);
        withPop(ctx, b, cx, top + 380, () => {
          ctx.fillStyle = '#ff2d55'; ctx.beginPath(); ctx.arc(cx, top + 375, 34, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(cx - 14, top + 377); ctx.lineTo(cx - 3, top + 388); ctx.lineTo(cx + 16, top + 364); ctx.stroke();
        });
      });
      withPop(ctx, pop(t, st[0] ?? p.start + 0.6), cx, top + 500, () => {
        font(ctx, 48, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.text || '点赞 | 关注 | 评论', cx, top + 500);
      });
      break;
    }
    // ---------- 新增画面 ----------
    case 'countdown': { // 倒计时圆环：大数字跳上去，圆环跟着走
      const k = clamp((t - p.start - 0.1) / 0.9);
      const r = 175; const cy = top + 255;
      ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2);
      ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOut(k)); ctx.stroke(); ctx.lineCap = 'butt';
      const raw = String(v.num || ''); const m = raw.match(/^(\d+)$/); const shown = m ? String(Math.round(Number(m[1]) * easeOut(k))) : raw;
      const ns = fitFont(ctx, shown, 150, 260, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(shown, cx, cy - 6);
      if (v.unit) { font(ctx, 52, 900); ctx.fillStyle = skin.hl; ctx.fillText(v.unit, cx, cy + ns * 0.55 + 10); }
      if (v.sub) withPop(ctx, pop(t, st[0]), cx, top + 520, () => { fitFont(ctx, v.sub, 58, W - 120, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, cx, top + 520); });
      break;
    }
    case 'chat': { // 粉丝留言：像评论区截图
      font(ctx, 30, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.title || '粉丝留言', 90, top + 70);
      let y = top + 120;
      (v.msgs || []).slice(0, 3).forEach((mm, i) => {
        const a = clamp((t - (st[i] ?? 1e9)) / 0.3); font(ctx, 44, 700); const ls = wrap(ctx, mm.text || '', 620, 2);
        const bh = ls.length * 58 + 40; const bw = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 56; const me = mm.from === 'me';
        if (a > 0) {
          const bx = me ? W - 90 - bw : 90;
          ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - easeOut(a)) * 24);
          if (!me) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(bx + 2, y + 28, 0, 0, 0); }
          ctx.fillStyle = me ? skin.g1 : 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, 26); ctx.fill();
          ctx.fillStyle = me ? '#0a0a0a' : skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ls.forEach((l, j) => ctx.fillText(l, bx + 28, y + 20 + 29 + j * 58));
          ctx.restore();
        }
        y += bh + 22;
      });
      break;
    }
    case 'checklist': { // 学完你会：霓虹勾一个个点亮
      const ts = fitFont(ctx, v.title || '', 64, W - 140, 900);
      hlText(ctx, v.title || '', v.hl, cx, top + 80, ts, skin.ink, skin.hl, 'center', Math.floor((t - p.start) * 16) + 1);
      (v.items || []).slice(0, 4).forEach((it, i) => {
        const y = top + 190 + i * 100; const a = clamp((t - (st[i] ?? 1e9)) / 0.3);
        ctx.save(); ctx.globalAlpha *= 0.35 + 0.65 * a;
        ctx.strokeStyle = a > 0 ? skin.g1 : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(150, y - 30, 60, 60, 14); ctx.stroke();
        if (a > 0) { ctx.strokeStyle = skin.g1; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(164, y); ctx.lineTo(177, y + 13); ctx.lineTo(198, y - 14); ctx.stroke(); }
        fitFont(ctx, it, 50, W - 360, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it, 240, y + 2);
        ctx.restore();
      });
      break;
    }
    case 'vs': { // 左右对决：左边灰、右边亮，中间 VS
      const a1 = easeOut(clamp((t - p.start - 0.1) / 0.35)); const a2 = easeOut(clamp((t - (st[0] ?? p.start + 0.4)) / 0.35));
      const half = W / 2 - 30;
      ctx.save(); ctx.globalAlpha *= a1; ctx.translate(-(1 - a1) * 200, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.roundRect(40, top + 90, half - 30, SH - 180, 28); ctx.fill();
      fitFont(ctx, v.left || '', 64, half - 90, 900); ctx.fillStyle = skin.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.left || '', 40 + (half - 30) / 2, top + 260);
      if (v.leftSub) { fitFont(ctx, v.leftSub, 36, half - 90, 700); ctx.fillText(v.leftSub, 40 + (half - 30) / 2, top + 350); }
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= a2; ctx.translate((1 - a2) * 200, 0);
      const g = ctx.createLinearGradient(W / 2, 0, W - 40, 0); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2);
      ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.roundRect(W / 2 + 50, top + 90, half - 30, SH - 180, 28); ctx.fill(); ctx.stroke();
      fitFont(ctx, v.right || '', 64, half - 90, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.right || '', W / 2 + 50 + (half - 30) / 2, top + 260);
      if (v.rightSub) { fitFont(ctx, v.rightSub, 36, half - 90, 700); ctx.fillStyle = skin.ink; ctx.fillText(v.rightSub, W / 2 + 50 + (half - 30) / 2, top + 350); }
      ctx.restore();
      withPop(ctx, pop(t, st[0] ?? p.start + 0.4, 0.35), cx, top + 300, () => {
        ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.arc(cx + 10, top + 300, 62, 0, Math.PI * 2); ctx.fill();
        font(ctx, 56, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', cx + 10, top + 302);
      });
      break;
    }
    case 'calendar': { // 更新日历：一周七天，每天打一个勾
      const ts = fitFont(ctx, v.title || '', 64, W - 140, 900);
      hlText(ctx, v.title || '', v.hl, cx, top + 80, ts, skin.ink, skin.hl, 'center', Math.floor((t - p.start) * 16) + 1);
      const days = ['一', '二', '三', '四', '五', '六', '日']; const cw = 122; const gx = (W - 7 * cw - 6 * 12) / 2;
      days.forEach((d, i) => {
        const x = gx + i * (cw + 12); const y = top + 170;
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.roundRect(x, y, cw, 220, 20); ctx.fill();
        font(ctx, 32, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`周${d}`, x + cw / 2, y + 44);
        withPop(ctx, pop(t, st[i], 0.3), x + cw / 2, y + 140, () => {
          ctx.fillStyle = skin.g1; ctx.beginPath(); ctx.arc(x + cw / 2, y + 140, 38, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x + cw / 2 - 16, y + 141); ctx.lineTo(x + cw / 2 - 4, y + 153); ctx.lineTo(x + cw / 2 + 17, y + 128); ctx.stroke();
        });
      });
      if (v.sub) withPop(ctx, pop(t, st[7] ?? st[6]), cx, top + 500, () => { fitFont(ctx, v.sub, 54, W - 140, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, cx, top + 500); });
      break;
    }
    case 'episodes': { // 剧集列表：像播放列表，第一集“正在播放”
      const items = (v.items || []).slice(0, 5); const rh = Math.min(100, 500 / Math.max(1, items.length)); const x0 = 110; const w0 = W - 220;
      items.forEach((it, i) => {
        const y = top + 60 + i * rh; const a = clamp((t - (st[i] ?? 1e9)) / 0.3); if (a <= 0) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * 40, 0);
        const on = i === 0;
        ctx.fillStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.roundRect(x0, y, w0, rh - 16, 18); ctx.fill();
        if (on) { const g = ctx.createLinearGradient(x0, 0, x0 + w0, 0); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2); ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.stroke(); }
        ctx.fillStyle = on ? skin.g1 : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(x0 + 36, y + (rh - 16) / 2 - 16); ctx.lineTo(x0 + 64, y + (rh - 16) / 2); ctx.lineTo(x0 + 36, y + (rh - 16) / 2 + 16); ctx.fill();
        font(ctx, 30, 900); ctx.fillStyle = skin.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`EP${String(i + 1).padStart(2, '0')}`, x0 + 90, y + (rh - 16) / 2);
        fitFont(ctx, it, 44, w0 - 380, 900); ctx.fillStyle = skin.ink; ctx.fillText(it, x0 + 190, y + (rh - 16) / 2 + 2);
        if (on) { font(ctx, 26, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'right'; ctx.fillText('正在播放', x0 + w0 - 28, y + (rh - 16) / 2); }
        ctx.restore();
      });
      break;
    }
    case 'quote': { // 霓虹金句：大引号 + 打字
      font(ctx, 220, 900); const g = ctx.createLinearGradient(80, 0, 300, 0); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2);
      ctx.fillStyle = g; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.globalAlpha *= 0.9; ctx.fillText('“', 70, top + 10); ctx.globalAlpha /= 0.9;
      font(ctx, 76, 900); const ls = wrap(ctx, v.text || '', W - 220, 3); let left = Math.floor((t - p.start - 0.15) * 14) + 1;
      ls.forEach((l, i) => { const part = [...l].slice(0, Math.max(0, left)).join(''); left -= [...l].length; hlText(ctx, part, v.hl, 130, top + 230 + i * 104, 76, skin.ink, skin.hl, 'left'); });
      if (v.by) withPop(ctx, pop(t, st[0]), 300, top + 230 + ls.length * 104 + 20, () => { font(ctx, 36, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`—— ${v.by}`, 130, top + 230 + ls.length * 104 + 20); });
      break;
    }
    case 'ask': { // 提问 + 选项按钮
      const ts = fitFont(ctx, v.q || '', 70, W - 140, 900);
      hlText(ctx, v.q || '', v.hl, cx, top + 110, ts, skin.ink, skin.hl, 'center', Math.floor((t - p.start) * 16) + 1);
      const ops = (v.options || []).slice(0, 4); const cols = ops.length > 2 ? 2 : ops.length; const bw = (W - 200 - (cols - 1) * 30) / cols;
      ops.forEach((o, i) => {
        const r = Math.floor(i / cols); const c = i % cols; const x = 100 + c * (bw + 30); const y = top + 240 + r * 150;
        withPop(ctx, pop(t, st[i]), x + bw / 2, y + 55, () => {
          ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.roundRect(x, y, bw, 110, 55); ctx.fill();
          ctx.strokeStyle = i === 0 ? skin.g1 : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 4; ctx.stroke();
          fitFont(ctx, `${'ABCD'[i]}  ${o}`, 46, bw - 60, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${'ABCD'[i]}  ${o}`, x + bw / 2, y + 57);
        });
      });
      break;
    }
    // ---------- 第三批画面（到 30 种） ----------
    case 'progress': { // 进度条：从第 1 集到最后一集，一路充满
      const k = easeOut(clamp((t - p.start - 0.2) / 1.2)); const x0 = 110; const w0 = W - 220; const y = top + 300;
      const ts = fitFont(ctx, v.label || '', 64, W - 160, 900); hlText(ctx, v.label || '', v.hl, cx, top + 140, ts, skin.ink, skin.hl, 'center');
      roundRect(ctx, x0, y - 30, w0, 60, 30, 'rgba(255,255,255,0.1)');
      const g = ctx.createLinearGradient(x0, 0, x0 + w0, 0); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2); roundRect(ctx, x0, y - 30, Math.max(60, w0 * k), 60, 30, g);
      font(ctx, 40, 900); ctx.fillStyle = '#0a0a0a'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${Math.round(k * 100)}%`, x0 + Math.max(60, w0 * k) - 24, y + 2);
      font(ctx, 36, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'left'; ctx.fillText(v.from || '', x0, y + 80); ctx.textAlign = 'right'; ctx.fillStyle = skin.hl; ctx.fillText(v.to || '', x0 + w0, y + 80);
      break;
    }
    case 'quest': { // 闯关地图：几个关卡连成路，小人一关关往前走
      const stops = (v.stops || []).slice(0, 5); const n = Math.max(1, stops.length);
      const pts = stops.map((_, i) => [130 + (W - 260) * (n > 1 ? i / (n - 1) : 0.5), top + 300 + (i % 2 ? 110 : -90)]);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 8; ctx.setLineDash([16, 14]); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
      stops.forEach((s, i) => {
        const [x, y] = pts[i]; const on = t >= (st[i] ?? 1e9); const last = i === n - 1;
        withPop(ctx, on ? 1 : 0.85, x, y, () => {
          ctx.fillStyle = on ? (last ? skin.hl : skin.g1) : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2); ctx.fill();
          font(ctx, 40, 900); ctx.fillStyle = '#0a0a0a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(last ? '★' : String(i + 1), x, y + 2);
          fitFont(ctx, s, 36, 220, 900); ctx.fillStyle = on ? skin.ink : skin.ink2; ctx.fillText(s, x, y + (i % 2 ? 84 : -84));
        });
      });
      const cur = Math.max(0, stops.findIndex((_, i) => t < (st[i] ?? 1e9)) - 1); const ci = cur < 0 ? n - 1 : cur; const [hx, hy] = pts[Math.min(ci, n - 1)] || [cx, top + 300];
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy - 70 + Math.sin(t * 6) * 6, 16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'levelup': { // 等级徽章：Lv.1 → Lv.MAX，经验条充满
      const k = easeOut(clamp((t - (st[0] ?? p.start)) / 0.9));
      const badge = (x, label, sub, hot, s) => withPop(ctx, s, x, top + 250, () => {
        ctx.fillStyle = hot ? skin.hl : 'rgba(255,255,255,0.12)'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * 120, top + 250 + Math.sin(a) * 120); } ctx.closePath(); ctx.fill();
        fitFont(ctx, label, 56, 200, 900); ctx.fillStyle = hot ? '#111' : skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, top + 235);
        fitFont(ctx, sub, 30, 190, 700); ctx.fillStyle = hot ? '#333' : skin.ink2; ctx.fillText(sub, x, top + 290);
      });
      badge(260, 'Lv.1', v.from || '新手', false, pop(t, p.start + 0.1));
      badge(W - 260, 'Lv.MAX', v.to || '高手', true, pop(t, st[1] ?? p.start + 0.8, 0.35));
      roundRect(ctx, 400, top + 240, 280, 20, 10, 'rgba(255,255,255,0.12)'); roundRect(ctx, 400, top + 240, 280 * k, 20, 10, skin.g1);
      if (v.sub) withPop(ctx, pop(t, st[1] ?? p.start + 0.8), cx, top + 480, () => { fitFont(ctx, v.sub, 50, W - 160, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, cx, top + 480); });
      break;
    }
    case 'lockscreen': { // 手机锁屏：大时间 + 更新提醒滑下来
      const px = cx - 170; const pw = 340; const py = top + 30; const ph = SH - 60;
      roundRect(ctx, px - 10, py - 10, pw + 20, ph + 20, 46, '#2a2a2e'); const g = ctx.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, skin.g2); g.addColorStop(1, '#0b0b14'); roundRect(ctx, px, py, pw, ph, 38, g);
      font(ctx, 96, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.time || '20:00', cx, py + 130);
      font(ctx, 26, 700); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText('每晚准时更新', cx, py + 200);
      const k = easeOut(clamp((t - (st[0] ?? p.start + 0.4)) / 0.4));
      if (k > 0) { ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * -60); roundRect(ctx, px + 16, py + 250, pw - 32, 150, 22, 'rgba(255,255,255,0.92)');
        fitFont(ctx, v.title || '', 30, pw - 80, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.fillText(v.title || '', px + 40, py + 295);
        font(ctx, 24, 700); const ls = wrap(ctx, v.text || '', pw - 80, 2); ctx.fillStyle = '#555'; ls.forEach((l, i) => ctx.fillText(l, px + 40, py + 340 + i * 32)); ctx.restore(); }
      break;
    }
    case 'grid4': { // 四宫格：四个方块，每块一个图标一个词
      const items = (v.items || []).slice(0, 4); const bw = 360; const bh = 230;
      items.forEach((it, i) => {
        const x = cx - bw - 15 + (i % 2) * (bw + 30); const y = top + 50 + Math.floor(i / 2) * (bh + 30);
        withPop(ctx, pop(t, st[i]), x + bw / 2, y + bh / 2, () => {
          roundRect(ctx, x, y, bw, bh, 26, 'rgba(255,255,255,0.08)'); ctx.strokeStyle = i === 0 ? skin.g1 : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 26); ctx.stroke();
          ctx.fillStyle = '#000'; ctx.font = `86px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.icon || '⭐', x + bw / 2, y + 90);
          fitFont(ctx, it.label || '', 44, bw - 40, 900); ctx.fillStyle = skin.ink; ctx.fillText(it.label || '', x + bw / 2, y + 180);
        });
      });
      break;
    }
    case 'gift': { // 粉丝礼包：盒子打开，里面的资料一个个飞出来
      const k = easeOut(clamp((t - p.start - 0.2) / 0.5)); const bx = cx; const by = top + 430;
      roundRect(ctx, bx - 130, by - 120, 260, 150, 14, skin.g2); ctx.fillStyle = skin.hl; ctx.fillRect(bx - 20, by - 120, 40, 150);
      ctx.save(); ctx.translate(bx - 150, by - 150); ctx.rotate(-0.5 * k); roundRect(ctx, 0, -10 - 40 * k, 300, 50, 12, skin.g1); ctx.fillStyle = skin.hl; ctx.fillRect(130, -10 - 40 * k, 40, 50); ctx.restore();
      if (v.title) { fitFont(ctx, v.title, 54, W - 200, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.title, cx, top + 70); }
      (v.items || []).slice(0, 4).forEach((it, i) => {
        const e = easeOut(clamp((t - (st[i] ?? 1e9)) / 0.45)); if (e <= 0) return;
        const tx = cx + (i - 1.5) * 230; const ty = top + 190; const x = bx + (tx - bx) * e; const y = by - 120 + (ty - (by - 120)) * e;
        withPop(ctx, 1, x, y, () => { font(ctx, 34, 900); const w = Math.min(220, ctx.measureText(it).width + 44); roundRect(ctx, x - w / 2, y - 34, w, 68, 16, skin.card); fitFont(ctx, it, 34, w - 24, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it, x, y + 2); });
      });
      break;
    }
    case 'neon': { // 霓虹招牌：发光大字，偶尔闪一下
      const flick = (t - p.start) < 0.6 ? (Math.sin((t - p.start) * 60) > 0 ? 1 : 0.3) : (Math.sin(t * 13) > 0.97 ? 0.4 : 1);
      const size = fitFont(ctx, v.text || '', 150, W - 140, 900);
      ctx.save(); ctx.globalAlpha *= flick; ctx.shadowColor = skin.g1; ctx.shadowBlur = 40; ctx.lineWidth = 6; ctx.strokeStyle = skin.g1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(v.text || '', cx, top + 260); ctx.shadowBlur = 20; ctx.fillStyle = '#ffffff'; ctx.fillText(v.text || '', cx, top + 260); ctx.restore();
      ctx.strokeStyle = skin.g2; ctx.lineWidth = 4; ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.roundRect(70, top + 80, W - 140, 360, 40); ctx.stroke(); ctx.globalAlpha /= 0.7;
      if (v.sub) withPop(ctx, pop(t, st[0]), cx, top + 520, () => { fitFont(ctx, v.sub, 48, W - 160, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, cx, top + 520); });
      void size;
      break;
    }
    case 'bedtime': { // 睡前时钟：月亮 + 星星 + 指针转到睡前时间
      for (let i = 0; i < 14; i++) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)); ctx.fillStyle = `rgba(255,255,255,${tw * 0.7})`; ctx.fillRect(80 + ((i * 137) % (W - 160)), top + 40 + ((i * 89) % 200), 5, 5); }
      ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.arc(250, top + 200, 90, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = skin.stage; ctx.beginPath(); ctx.arc(290, top + 170, 85, 0, Math.PI * 2); ctx.fill();
      const ccx = W - 300; const ccy = top + 250; ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(ccx, ccy, 150, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = skin.g1; ctx.lineWidth = 8; ctx.stroke();
      const [hh, mm] = String(v.time || '22:00').split(':').map((x) => Number(x) || 0); const k = easeOut(clamp((t - p.start) / 1.0));
      const ma = -Math.PI / 2 + (mm / 60) * Math.PI * 2 * k + (1 - k) * Math.PI * 2; const ha = -Math.PI / 2 + ((hh % 12) / 12 + mm / 720) * Math.PI * 2 * k;
      ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(ccx + Math.cos(ha) * 80, ccy + Math.sin(ha) * 80); ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = skin.hl; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(ccx + Math.cos(ma) * 120, ccy + Math.sin(ma) * 120); ctx.stroke(); ctx.lineCap = 'butt';
      font(ctx, 54, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.time || '22:00', ccx, ccy + 200);
      if (v.sub) withPop(ctx, pop(t, st[0]), 300, top + 420, () => { fitFont(ctx, v.sub, 48, 460, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, 300, top + 420); });
      break;
    }
    case 'pledge': { // 承诺书：一条条写出来，最后签名
      const x = 170; const w = W - 340; const y = top + 30; const h = SH - 60;
      roundRect(ctx, x, y, w, h, 18, '#fbf7ee'); ctx.fillStyle = '#d4c7a8'; for (let k = 0; k < 6; k++) ctx.fillRect(x + 40, y + 160 + k * 66, w - 80, 2);
      fitFont(ctx, v.title || '我的承诺', 56, w - 80, 900); ctx.fillStyle = '#b3261e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.title || '我的承诺', cx, y + 80);
      const items = (v.items || []).slice(0, 4);
      items.forEach((it, i) => { const a = clamp((t - (st[i] ?? 1e9)) / 0.3); if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; fitFont(ctx, `${i + 1}. ${it}`, 38, w - 100, 900); ctx.fillStyle = '#2a2520'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}. ${it}`, x + 50, y + 140 + i * 66); ctx.restore(); });
      const sk = clamp((t - (st[items.length] ?? 1e9)) / 0.8);
      if (sk > 0) { ctx.strokeStyle = '#1b3a8a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); const sx = x + w - 320; const sy = y + h - 70; for (let q = 0; q <= 40 * sk; q++) { const u = q / 40; const px = sx + u * 220; const py = sy + Math.sin(u * 18) * 18 * (1 - u * 0.5); q ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); ctx.lineCap = 'butt';
        if (v.sign) { fitFont(ctx, `—— ${v.sign}`, 30, 260, 700); ctx.fillStyle = '#555'; ctx.textAlign = 'right'; ctx.fillText(`—— ${v.sign}`, x + w - 40, y + h - 24); } }
      break;
    }
    case 'timeline': { // 时间轴：横着一条霓虹线，几个节点依次亮
      const nodes = (v.nodes || []).slice(0, 5); const n = Math.max(1, nodes.length); const x0 = 120; const x1 = W - 120; const ly = top + 300; const gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x0, ly - 4, x1 - x0, 8);
      const k = clamp((t - (st[0] ?? 1e9) + 0.2) / Math.max(0.3, (st[n - 1] ?? 0) - (st[0] ?? 0) + 0.2)); const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2); ctx.fillStyle = g; ctx.fillRect(x0, ly - 4, (x1 - x0) * easeOut(k), 8);
      nodes.forEach((nd, i) => { const x = n > 1 ? x0 + gap * i : cx; withPop(ctx, pop(t, st[i]), x, ly, () => {
        ctx.fillStyle = skin.g1; ctx.beginPath(); ctx.arc(x, ly, 22, 0, Math.PI * 2); ctx.fill();
        fitFont(ctx, nd.when || '', 38, Math.max(150, gap - 10), 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nd.when || '', x, ly - 70);
        fitFont(ctx, nd.what || '', 38, Math.max(160, gap - 10), 900); ctx.fillStyle = skin.ink; ctx.fillText(nd.what || '', x, ly + 72); }); });
      break;
    }
    case 'quiz': { // 小测验：选项先出，最后揭晓正确答案
      const ts = fitFont(ctx, v.q || '', 62, W - 140, 900); hlText(ctx, v.q || '', v.hl, cx, top + 100, ts, skin.ink, skin.hl, 'center');
      const ops = (v.options || []).slice(0, 4); const ans = Math.max(0, Math.min(ops.length - 1, Number(v.answer) || 0)); const reveal = t >= (st[ops.length] ?? 1e9);
      ops.forEach((o, i) => { const y = top + 200 + i * 100; withPop(ctx, pop(t, st[i]), cx, y + 40, () => {
        const right = reveal && i === ans; roundRect(ctx, 160, y, W - 320, 80, 40, right ? 'rgba(62,240,96,0.25)' : 'rgba(255,255,255,0.08)');
        ctx.strokeStyle = right ? '#3ef060' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(160, y, W - 320, 80, 40); ctx.stroke();
        fitFont(ctx, `${'ABCD'[i]}. ${o}`, 42, W - 440, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${'ABCD'[i]}. ${o}`, 210, y + 42);
        if (right) { font(ctx, 52, 900); ctx.fillStyle = '#3ef060'; ctx.textAlign = 'right'; ctx.fillText('✓', W - 200, y + 42); } }); });
      break;
    }
    case 'notebook': { // 笔记本：横线纸 + 红边线，一行行写出来
      const x = 140; const w = W - 280; const y = top + 30; const h = SH - 60;
      roundRect(ctx, x, y, w, h, 14, '#fffdf6'); ctx.fillStyle = '#e8b4b4'; ctx.fillRect(x + 90, y, 3, h); ctx.fillStyle = '#cfe0f0'; for (let k = 0; k < 8; k++) ctx.fillRect(x, y + 110 + k * 60, w, 2);
      fitFont(ctx, v.title || '', 46, w - 140, 900); ctx.fillStyle = '#1b3a8a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.title || '', x + 120, y + 60);
      (v.lines || []).slice(0, 6).forEach((l, i) => { if (t < (st[i] ?? 1e9)) return; const shown = Math.floor((t - st[i]) * 16) + 1; const part = [...l].slice(0, shown).join('');
        fitFont(ctx, l, 38, w - 150, 700); ctx.fillStyle = '#2a2520'; ctx.fillText(part, x + 120, y + 135 + i * 60); });
      break;
    }
    case 'top3': { // 前三名：竖着三条，奖牌 + 大号数字
      const items = (v.items || []).slice(0, 3); const medals = ['🥇', '🥈', '🥉'];
      if (v.title) { fitFont(ctx, v.title, 56, W - 160, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.title, cx, top + 70); }
      items.forEach((it, i) => { const k = items.length - 1 - i; const y = top + 160 + i * 140; const a = clamp((t - (st[k] ?? 1e9)) / 0.3); if (a <= 0) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * 80, 0);
        roundRect(ctx, 140, y, W - 280, 110, 24, i === 0 ? 'rgba(255,212,0,0.16)' : 'rgba(255,255,255,0.07)');
        ctx.fillStyle = '#000'; ctx.font = `64px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(medals[i], 220, y + 58);
        fitFont(ctx, it, 50, W - 480, 900); ctx.fillStyle = i === 0 ? skin.hl : skin.ink; ctx.textAlign = 'left'; ctx.fillText(it, 300, y + 58); ctx.restore(); });
      break;
    }
    case 'spotlight': { // 聚光灯：从上面打下一束光，照亮一句话
      const k = easeOut(clamp((t - p.start) / 0.5));
      const g = ctx.createRadialGradient(cx, top + 330, 20, cx, top + 330, 420); g.addColorStop(0, `rgba(255,255,230,${0.35 * k})`); g.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 60, top); ctx.lineTo(cx + 60, top); ctx.lineTo(cx + 420, top + SH); ctx.lineTo(cx - 420, top + SH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.12 * k})`; ctx.beginPath(); ctx.ellipse(cx, top + SH - 60, 360, 46, 0, 0, Math.PI * 2); ctx.fill();
      if (k > 0.3) { const size = fitFont(ctx, v.text || '', 110, W - 160, 900); ctx.globalAlpha *= clamp((k - 0.3) * 2); hlText(ctx, v.text || '', v.hl, cx, top + 300, size, skin.ink, skin.hl, 'center'); ctx.globalAlpha = 1; }
      if (v.sub) withPop(ctx, pop(t, st[0]), cx, top + 450, () => { fitFont(ctx, v.sub, 46, W - 200, 700); ctx.fillStyle = skin.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.sub, cx, top + 450); });
      break;
    }
    case 'faq': { // 常见问题：问答卡片一张张叠出来
      const items = (v.items || []).slice(0, 3); const ch = Math.min(170, (SH - 80) / Math.max(1, items.length) - 16);
      items.forEach((it, i) => { const y = top + 40 + i * (ch + 16); const a = clamp((t - (st[i] ?? 1e9)) / 0.3); if (a <= 0) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - easeOut(a)) * 30);
        roundRect(ctx, 120, y, W - 240, ch, 22, 'rgba(255,255,255,0.07)'); roundRect(ctx, 120, y, 12, ch, 6, skin.g1);
        fitFont(ctx, `Q：${it.q || ''}`, 42, W - 320, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`Q：${it.q || ''}`, 160, y + ch * 0.34);
        fitFont(ctx, `A：${it.a || ''}`, 36, W - 320, 700); ctx.fillStyle = skin.hl; ctx.fillText(`A：${it.a || ''}`, 160, y + ch * 0.72); ctx.restore(); });
      break;
    }
    default: break;
  }
}

/** 圆形头像：有照片就裁照片上半部分（脸），没有就用名字首字 */
function avatarCircle(ctx, assets, account, x, y, r, skin, ring = false) {
  ctx.save();
  if (ring) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const img = assets?.photos?.[0];
  if (img) {
    const side = Math.min(img.width, img.height * 0.6);
    ctx.fillStyle = '#dfe6ee'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.drawImage(img, (img.width - side) / 2, 0, side, side, x - r, y - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, skin.g1); g.addColorStop(1, skin.g2);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    font(ctx, r * 1.1, 900); ctx.fillStyle = '#0a0a0a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...(account || '我')][0], x, y + r * 0.05);
  }
  ctx.restore();
}

// ---------- 主入口 ----------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'dark', assets }) {
  const theme = normalizeTheme(script.theme);
  const tEmoji = themeEmoji(theme);
  const neon = skinId === 'dark' || !skins[skinId] ? NEON[theme?.key] : null;
  const skin = neon ? { ...skins.dark, g1: neon[0], g2: neon[1], hl2: neon[0], node: neon[0] } : (skins[skinId] || skins.dark);
  const account = script.account || '我的账号';
  ctx.save();
  ctx.fillStyle = skin.bg; ctx.fillRect(0, 0, W, H);

  // 头部：头像 + 账号 + 话题
  avatarCircle(ctx, assets, account, 98, 170, 52, skin);
  font(ctx, 42, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(account, 170, 146);
  font(ctx, 30, 700); ctx.fillStyle = skin.ink2; ctx.fillText(`${tEmoji ? tEmoji[0] + ' ' : ''}${script.hashtags || ''}`, 170, 196);

  // 系列大字：第一行渐变，第二行白字
  const [s1, s2] = script.series || [script.title || '', ''];
  const z1 = fitFont(ctx, s1, 104, W - 100, 900);
  const gw = ctx.measureText(s1).width;
  const grad = ctx.createLinearGradient(50, 0, 50 + gw, 0); grad.addColorStop(0, skin.g1); grad.addColorStop(1, skin.g2);
  ctx.fillStyle = grad; ctx.textAlign = 'left'; ctx.fillText(s1, 50, 330);
  if (s2) { fitFont(ctx, s2, 84, W - 100, 900); ctx.fillStyle = skin.ink; ctx.fillText(s2, 50, 330 + z1 * 0.5 + 70); }

  // 屏幕
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, SY, W, SH); ctx.clip();
  drawStageBg(ctx, skin, t);
  if (tEmoji) drawWallpaper(ctx, tEmoji, t, { y: SY, w: W, h: SH, alpha: 0.07, step: 210, size: 74, speed: 12 });
  if (s && p) {
    // 切镜头：轻微放大回弹
    const k = clamp((t - p.start) / 0.22);
    const z = 1 + (1 - easeOut(k)) * 0.06;
    ctx.translate(W / 2, SY + SH / 2); ctx.scale(z, z); ctx.translate(-W / 2, -(SY + SH / 2));
    ctx.globalAlpha = clamp(0.3 + k);
    drawVisual(ctx, s.visual || { type: 'big', big: '' }, p, t, skin, assets, account);
  }
  ctx.restore();

  // 字幕
  const sec = tl.sections[idx];
  const ln = sec?.lines.find((l) => t >= l.start && t < l.end + 0.15);
  if (ln) {
    font(ctx, 50, 700);
    const rows = wrap(ctx, ln.text, W - 140, 2);
    rows.forEach((r, i) => { ctx.fillStyle = skin.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r, W / 2, SY + SH + 90 + i * 66); });
  }
  ctx.restore();
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789%|点赞关注评论';
  await loadFontFaces([`900 40px "Noto Sans SC"`, `700 40px "Noto Sans SC"`], text);
}

/** AI 结果兜底 */
export function normalize(s) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '系列开场';
  const series = Array.isArray(s.series) ? s.series : [s.series];
  s.series = [str(series[0], 10) || '每晚睡前看一集', str(series[1], 14)];
  s.hashtags = str(s.hashtags, 30);
  s.theme = normalizeTheme(s.theme);
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = VISUALS.includes(v.type) ? v.type : 'big';
    return {
      tag: str(v.big || v.title || v.arc || v.root || v.q || v.rows?.[0]?.zh || (type === 'quote' ? v.text : '') || type, 8),
      visual: {
        type,
        rows: (v.rows || []).slice(0, 3).map((r) => ({ zh: str(r.zh, 16), en: String(r.en || '').trim().slice(0, 60), hl: str(r.hl, 10) })).filter((r) => r.zh),
        title: str(v.title, 14), hl: str(v.hl, 8), sub: str(v.sub, 14),
        emoji: (v.emoji || []).map((e) => String(e).trim()).filter(Boolean).slice(0, 8),
        arc: str(v.arc, 12), card: v.card ? { title: str(v.card.title, 12), stats: (v.card.stats || []).map((q) => str(q, 8)).slice(0, 2) } : null,
        root: str(v.root, 7), children: (v.children || []).slice(0, 4).map((c) => ({ icon: String(c.icon || '⭐').trim(), label: str(c.label, 6) })),
        big: str(v.big, 11), cards: (v.cards || []).map((q) => str(q, 8)).filter(Boolean).slice(0, 9),
        text: str(v.text, 16) || '点赞 | 关注 | 评论',
        num: str(v.num, 5), unit: str(v.unit, 4),
        msgs: (v.msgs || []).filter((m) => m && m.text).slice(0, 3).map((m) => ({ from: m.from === 'me' ? 'me' : 'them', text: str(m.text, 24) })),
        items: (v.items || []).map((q) => str(q, 12)).filter(Boolean).slice(0, 5),
        left: str(v.left, 8), right: str(v.right, 8), leftSub: str(v.leftSub, 12), rightSub: str(v.rightSub, 12),
        q: str(v.q, 16), options: (v.options || []).map((q) => str(q, 10)).filter(Boolean).slice(0, 4), by: str(v.by, 10),
        ...(type === 'quote' ? { text: str(v.text, 24) } : {}),
        label: str(v.label, 14), from: str(v.from, 8), to: str(v.to, 8), time: str(v.time, 5), sign: str(v.sign, 8), answer: Number(v.answer) || 0,
        stops: (v.stops || []).map((q) => str(q, 6)).filter(Boolean).slice(0, 5),
        nodes: (v.nodes || []).filter(Boolean).slice(0, 5).map((n) => ({ when: str(n.when, 6), what: str(n.what, 8) })),
        ...(type === 'grid4' ? { items: (v.items || []).filter(Boolean).slice(0, 4).map((x) => ({ icon: String(x.icon || '⭐').trim().slice(0, 8), label: str(x.label, 6) })) } : {}),
        ...(type === 'faq' ? { items: (v.items || []).filter(Boolean).slice(0, 3).map((x) => ({ q: str(x.q, 14), a: str(x.a, 16) })) } : {}),
        ...(type === 'neon' || type === 'spotlight' ? { text: str(v.text, 12) } : {}),
        lines: (v.lines || []).map((q) => str(q, 16)).filter(Boolean).slice(0, 6), // 笔记本里的几行字（和口播 lines 不是一回事）
      },
      lines: (x.lines || []).map((l) => String(l).trim()).filter(Boolean).slice(0, 2),
    };
  }).filter((x) => x.lines.length);
  return s;
}
