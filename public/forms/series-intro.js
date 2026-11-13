// 形式 04：系列开场
// 灵魂：用“每晚睡前看一集，一个月后领先 90% 的人”做钩子，几十秒交代：讲什么、我是谁、怎么带你学、资料备好了、现在关注。
// 版式：顶部头像 + 账号 + 话题，绿青渐变系列大字（全片固定）；中间一块深色网格“屏幕”，每句换一个画面；底部一行字幕。
import { W, H, clamp, easeOut, font, fitFont, wrap } from '../engine/draw.js';
import { demoPresenter } from './photo-talk.js';

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
const VISUALS = ['type', 'icons', 'avatar', 'tree', 'big', 'cards', 'follow'];
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
  const skin = skins[skinId] || skins.dark;
  const account = script.account || '我的账号';
  ctx.save();
  ctx.fillStyle = skin.bg; ctx.fillRect(0, 0, W, H);

  // 头部：头像 + 账号 + 话题
  avatarCircle(ctx, assets, account, 98, 170, 52, skin);
  font(ctx, 42, 900); ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(account, 170, 146);
  font(ctx, 30, 700); ctx.fillStyle = skin.ink2; ctx.fillText(script.hashtags || '', 170, 196);

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
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, text), fonts.load(`700 40px "Noto Sans SC"`, text)]);
}

/** AI 结果兜底 */
export function normalize(s) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '系列开场';
  const series = Array.isArray(s.series) ? s.series : [s.series];
  s.series = [str(series[0], 10) || '每晚睡前看一集', str(series[1], 14)];
  s.hashtags = str(s.hashtags, 30);
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = VISUALS.includes(v.type) ? v.type : 'big';
    return {
      tag: str(v.big || v.title || v.arc || v.root || v.rows?.[0]?.zh || type, 8),
      visual: {
        type,
        rows: (v.rows || []).slice(0, 3).map((r) => ({ zh: str(r.zh, 16), en: String(r.en || '').trim().slice(0, 60), hl: str(r.hl, 10) })).filter((r) => r.zh),
        title: str(v.title, 14), hl: str(v.hl, 8), sub: str(v.sub, 14),
        emoji: (v.emoji || []).map((e) => String(e).trim()).filter(Boolean).slice(0, 8),
        arc: str(v.arc, 12), card: v.card ? { title: str(v.card.title, 12), stats: (v.card.stats || []).map((q) => str(q, 8)).slice(0, 2) } : null,
        root: str(v.root, 7), children: (v.children || []).slice(0, 4).map((c) => ({ icon: String(c.icon || '⭐').trim(), label: str(c.label, 6) })),
        big: str(v.big, 11), cards: (v.cards || []).map((q) => str(q, 8)).filter(Boolean).slice(0, 9),
        text: str(v.text, 16) || '点赞 | 关注 | 评论',
      },
      lines: (x.lines || []).map((l) => String(l).trim()).filter(Boolean).slice(0, 2),
    };
  }).filter((x) => x.lines.length);
  return s;
}
