// 形式 06：手绘图解
// 灵魂：米白纸底，顶部大字幕跟着口播一个字一个字出来（关键词变色）；中间是粗描边、带错位阴影的手绘小道具，
// 把一句话“演”成一个小场景（聚光灯、记分牌、靶子、日历、周卡、清单…）；讲师站在右下角讲。
// 偶尔插一帧整屏的品牌色或深色“关键词”镜头，制造节奏。
import { W, H, clamp, easeOut, font, fitFont, wrap, hash } from '../engine/draw.js';
import { THEMES, themeEmoji, normalizeTheme, EMOJI_FONT } from './themes.js';
import { demoPresenter } from './photo-talk.js';

export const meta = {
  id: 'sketch-talk',
  name: '手绘图解',
  category: '知识讲解',
  outcome: '把道理画成一个个小场景，讲师在右下角讲，适合讲干货、讲方法、讲误区',
  ideas: ['新手学琴最容易犯的 4 个错', '为什么有人考了三次都没过', '让孩子主动练习的 3 个办法'],
  tagline: '纸感手绘风：大字幕逐字出现，小道具把每句话演出来，讲师在右下角',
  fits: '干货讲解 · 误区盘点 · 方法步骤 · 立专业人设',
  durations: [1, 2, 3],
  bgm: 'pop',
  needsPhotos: true,
  coverIdx: 2,
};

export const skins = {
  paper: { name: '米白纸感', bg: '#f4eee4', grain: 'rgba(60,40,20,0.07)', line: '#1f2433', text: '#1f2433', text2: '#8a8173', shadow: '#1f2433', acc: '#ec5a3a', accSoft: '#f9d7cc', card: '#ffffff', card2: '#e9e2d6', navy: '#17213a', gold: '#f5b83d', green: '#2fa36b' },
  sky: { name: '清爽浅蓝', bg: '#e9f1fa', grain: 'rgba(20,50,90,0.06)', line: '#18243d', text: '#18243d', text2: '#6f7f97', shadow: '#18243d', acc: '#2f6bff', accSoft: '#d3e0ff', card: '#ffffff', card2: '#d9e3f0', navy: '#111b33', gold: '#ffb020', green: '#1f9d6a' },
  night: { name: '深夜黑板', bg: '#171c2b', grain: 'rgba(255,255,255,0.05)', line: '#0a0d16', text: '#f3efe7', text2: '#9aa3b8', shadow: '#05070c', acc: '#ff6a3d', accSoft: '#4a2a26', card: '#f3efe7', card2: '#c9c3b8', navy: '#0c1020', gold: '#ffc24a', green: '#3cc486' },
};
// 行业主题：浅色皮肤的点缀色跟着行业换
function themedSkin(skinId, theme) {
  const base = skins[skinId] || skins.paper;
  const th = THEMES[theme?.key];
  if (!th || skinId === 'night') return base;
  return { ...base, acc: th.red, accSoft: th.pill };
}

const VISUALS = ['badge', 'spotlight', 'count', 'flash', 'phones', 'crowd', 'target', 'calendar', 'stack', 'gauge', 'weeks', 'word', 'grid',
  'brand', 'button', 'checklist', 'follow', 'chat', 'bars', 'versus', 'timer', 'path', 'quote', 'mystery', 'progress', 'bulb'];
// 整屏换底色的两种“节奏镜头”
const FULL = new Set(['flash', 'word']);
const CAP = { x: 70, y: 150, size: 70, lh: 92, w: 940 };
const FLOOR = 1290;
const CX = W / 2;

// ---------------------------------------------------------------------
// 时间规划
// ---------------------------------------------------------------------
const itemCount = (v) => {
  switch (v?.type) {
    case 'badge': return v.stamp ? 2 : 1;
    case 'spotlight': return 2;
    case 'count': return Math.max(1, v.n);
    case 'phones': return 3;
    case 'crowd': return 2;
    case 'target': return 3;
    case 'calendar': return 2;
    case 'stack': case 'checklist': case 'bars': return (v.items || []).length;
    case 'gauge': return 2;
    case 'weeks': return (v.items || []).length + 1;
    case 'word': return 2;
    case 'grid': return 2;
    case 'brand': return 2;
    case 'button': return 1;
    case 'follow': return 2;
    case 'chat': return (v.msgs || []).length;
    case 'versus': return 3;
    case 'timer': return 2;
    case 'path': return (v.stops || []).length;
    case 'quote': return 1;
    case 'mystery': return 2;
    case 'progress': return 2;
    case 'bulb': return 2;
    default: return 1;
  }
};
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i];
    const next = tl.sections[i + 1];
    const first = sec.lines[0]; const last = sec.lines[sec.lines.length - 1];
    const n = itemCount(s.visual);
    const a = sec.start + 0.25;
    const b = Math.max(a + 0.5, (sec.lines.length > 1 ? last.start + 0.3 : first.end - 0.5));
    const steps = [];
    for (let k = 0; k < n; k++) steps.push(a + ((b - a) * k) / Math.max(1, n));
    return { start: sec.start, end: next ? next.start : tl.duration, lineEnd: sec.end, steps };
  });
}

// ---------------------------------------------------------------------
// 画笔：粗描边 + 错位实心阴影（贴纸感）
// ---------------------------------------------------------------------
const pop = (t, t0, dur = 0.32) => {
  if (t0 == null || t < t0) return 0;
  const k = clamp((t - t0) / dur);
  return k < 0.65 ? easeOut(k / 0.65) * 1.1 : 1.1 - 0.1 * ((k - 0.65) / 0.35);
};
const fade = (t, t0, dur = 0.35) => (t0 == null ? 0 : easeOut((t - t0) / dur));
function withPop(ctx, s, cx, cy, fn) {
  if (s <= 0.001) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  ctx.globalAlpha *= clamp(s * 1.5);
  fn(); ctx.restore();
}
function box(ctx, x, y, w, h, r, fill, S, { lw = 5, off = 8 } = {}) {
  if (off) { ctx.fillStyle = S.shadow; ctx.beginPath(); ctx.roundRect(x + off, y + off, w, h, r); ctx.fill(); }
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = S.line; ctx.stroke(); }
}
function dot(ctx, x, y, r, fill, S, { lw = 5, off = 6 } = {}) {
  if (off) { ctx.fillStyle = S.shadow; ctx.beginPath(); ctx.arc(x + off, y + off, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = S.line; ctx.stroke(); }
}
function txt(ctx, s, x, y, size, color, { align = 'center', weight = 900, maxW = 0 } = {}) {
  if (maxW) fitFont(ctx, s, size, maxW, weight); else font(ctx, size, weight);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
/** 小注释：// 标注，像设计稿上的批注 */
function note(ctx, s, x, y, S, align = 'left') {
  if (!s) return;
  ctx.font = `600 26px ui-monospace, Consolas, "Noto Sans SC", monospace`;
  ctx.fillStyle = S.text2; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText('// ' + s, x, y);
}
function emoji(ctx, e, x, y, size) {
  ctx.font = `${size}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y + size * 0.05);
}
function line(ctx, x1, y1, x2, y2, S, lw = 5) { ctx.strokeStyle = S.line; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function floor(ctx, S, y = FLOOR) { ctx.fillStyle = S.line; ctx.fillRect(40, y, W - 80, 5); }
/** 小人：圆脑袋 + 身体，表情不同 */
function person(ctx, x, y, s, S, k, mood = 'smile') {
  const tone = ['#f6d2b3', '#eec09a', '#f3c7a8', '#e5b28c'][k % 4];
  const hair = ['#2b2420', '#4a3426', '#1d1d24', '#6b4a2e'][(k + 1) % 4];
  box(ctx, x - 34 * s, y + 30 * s, 68 * s, 70 * s, 22 * s, ['#ffffff', S.accSoft, '#dfe8f5', '#f3e3b8'][k % 4], S, { lw: 4 * s, off: 0 });
  dot(ctx, x, y, 36 * s, tone, S, { lw: 4 * s, off: 0 });
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x, y - 6 * s, 37 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillStyle = S.line;
  if (mood === 'sleepy') { line(ctx, x - 17 * s, y + 4 * s, x - 7 * s, y + 4 * s, S, 3.5 * s); line(ctx, x + 7 * s, y + 4 * s, x + 17 * s, y + 4 * s, S, 3.5 * s); } else { ctx.beginPath(); ctx.arc(x - 12 * s, y + 4 * s, 4.5 * s, 0, 7); ctx.arc(x + 12 * s, y + 4 * s, 4.5 * s, 0, 7); ctx.fill(); }
  ctx.lineWidth = 3.5 * s; ctx.strokeStyle = S.line; ctx.beginPath();
  if (mood === 'wow') { ctx.arc(x, y + 20 * s, 6 * s, 0, 7); } else if (mood === 'confused') { ctx.moveTo(x - 9 * s, y + 20 * s); ctx.lineTo(x + 9 * s, y + 17 * s); } else { ctx.arc(x, y + 14 * s, 10 * s, 0.15 * Math.PI, 0.85 * Math.PI); }
  ctx.stroke();
}
/** 手机外框，screen(x, y, w, h) 画屏幕内容 */
function phone(ctx, x, y, w, h, S, screen, ring = null) {
  box(ctx, x, y, w, h, w * 0.16, S.navy, S);
  if (ring) { ctx.lineWidth = 8; ctx.strokeStyle = ring; ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, h + 16, w * 0.2); ctx.stroke(); }
  const ix = x + 12; const iy = y + 26; const iw = w - 24; const ih = h - 46;
  ctx.save(); ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, w * 0.08); ctx.clip();
  screen(ix, iy, iw, ih); ctx.restore();
  ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.roundRect(x + w / 2 - 22, y + 10, 44, 8, 4); ctx.fill();
}
/** 吊牌：两根绳子挂下来 */
function hang(ctx, x, w, y, S, top = 400) {
  line(ctx, x + 30, top, x + 30, y, S, 3); line(ctx, x + w - 30, top, x + w - 30, y, S, 3);
  ctx.fillStyle = S.line; ctx.beginPath(); ctx.arc(x + 30, top, 6, 0, 7); ctx.arc(x + w - 30, top, 6, 0, 7); ctx.fill();
}
/** 盖章 */
function stamp(ctx, s, x, y, k, S, color = S.acc, rot = -0.14) {
  if (k <= 0) return;
  const sc = 1.9 - 0.9 * easeOut(k);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2.5) * 0.95;
  fitFont(ctx, s, 74, 360, 900); const w = ctx.measureText(s).width + 56;
  ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.beginPath(); ctx.roundRect(-w / 2, -58, w, 116, 18); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-w / 2 + 10, -48, w - 20, 96, 12); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 0, 4);
  ctx.restore();
}
const bob = (t, i = 0, a = 6) => Math.sin(t * 2.2 + i * 1.3) * a;

// ---------------------------------------------------------------------
// 画面（每种都是一个小场景）
// ---------------------------------------------------------------------
function drawVisual(ctx, v, p, t, S, top, idx) {
  const st = p.steps;
  const s0 = st[0] ?? p.start + 0.3;
  switch (v.type) {
    case 'badge': { // 大图标 + 盖章
      const cy = top + 330 + bob(t, 0, 5);
      withPop(ctx, pop(t, s0), CX, cy, () => {
        ctx.fillStyle = S.text2 + '33'; ctx.beginPath(); ctx.ellipse(CX, top + 600, 230, 34, 0, 0, 7); ctx.fill();
        box(ctx, CX - 200, cy - 200, 400, 400, 90, S.acc, S, { lw: 7, off: 14 });
        ctx.fillStyle = '#ffffff33'; ctx.beginPath(); ctx.roundRect(CX - 170, cy - 175, 340, 120, 60); ctx.fill();
        emoji(ctx, v.emoji || '⭐', CX, cy - 10, 190);
      });
      stamp(ctx, v.stamp, CX + 20, cy + 120, clamp((t - (st[1] ?? 1e9)) / 0.25), S, S.navy);
      note(ctx, v.note, CX, top + 660, S, 'center');
      break;
    }
    case 'spotlight': { // 舞台聚光灯照着一个东西，后面是观众席
      const k = fade(t, s0, 0.5);
      ctx.save(); ctx.globalAlpha *= k;
      ctx.fillStyle = S.card2; ctx.fillRect(0, top + 120, W, FLOOR - top - 120);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) { ctx.fillStyle = S.text2 + '44'; ctx.beginPath(); ctx.roundRect(30 + c * 88 + (r % 2) * 44, top + 150 + r * 64, 60, 40, 10); ctx.fill(); }
      ctx.restore();
      line(ctx, CX - 170, 400, CX - 170, top + 60, S, 3); line(ctx, CX + 170, 400, CX + 170, top + 60, S, 3);
      const g = ctx.createLinearGradient(0, top + 60, 0, FLOOR - 60);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(1, `rgba(255,255,255,${0.15 * k})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(CX - 60, top + 60); ctx.lineTo(CX + 60, top + 60); ctx.lineTo(CX + 300, FLOOR - 60); ctx.lineTo(CX - 300, FLOOR - 60); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(CX, FLOOR - 70, 290, 48, 0, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = S.line; ctx.setLineDash([14, 12]); ctx.stroke(); ctx.setLineDash([]);
      const cy = FLOOR - 260 + bob(t, 1, 5);
      withPop(ctx, pop(t, st[1] ?? s0 + 0.3), CX, cy, () => { box(ctx, CX - 140, cy - 140, 280, 280, 64, S.acc, S, { lw: 6, off: 10 }); emoji(ctx, v.emoji || '⭐', CX, cy, 140); });
      note(ctx, v.label, CX, FLOOR - 20, S, 'center');
      if (v.side) withPop(ctx, pop(t, (st[1] ?? s0) + 0.3), W - 200, top + 260, () => { box(ctx, W - 300, top + 200, 220, 130, 18, S.card, S, { lw: 4, off: 6 }); txt(ctx, v.side, W - 190, top + 265, 40, S.line, { maxW: 190 }); });
      break;
    }
    case 'count': { // 吊着的记分牌：数字 + 一排格子一格格亮
      const n = clamp(v.n || 3, 2, 8); const bw = 860; const bx = CX - bw / 2; const by = top + 160;
      hang(ctx, bx + 60, bw - 120, by, S, 400);
      withPop(ctx, pop(t, s0), CX, by + 110, () => {
        box(ctx, bx, by, bw, 220, 28, S.navy, S, { lw: 6, off: 10 });
        txt(ctx, String(n), bx + 110, by + 112, 150, S.acc);
        txt(ctx, v.label || '个原因', bx + 200, by + 112, 64, '#ffffff', { align: 'left', maxW: 300 });
        const cw = 58; const gx = bx + bw - 40 - n * (cw + 12);
        for (let i = 0; i < n; i++) {
          const on = t >= (st[i] ?? 1e9);
          ctx.fillStyle = on ? S.acc : '#ffffff18'; ctx.beginPath(); ctx.roundRect(gx + i * (cw + 12), by + 80, cw, 64, 10); ctx.fill();
          ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 3; ctx.stroke();
          txt(ctx, String(i + 1).padStart(2, '0'), gx + i * (cw + 12) + cw / 2, by + 168, 22, '#ffffff99', { weight: 700 });
        }
      });
      break;
    }
    case 'flash': { // 整屏品牌色 + 一个大字（底色在 drawFrame 里画）
      const k = pop(t, s0 + 0.1, 0.4);
      if (v.text) withPop(ctx, k, CX, 900, () => { txt(ctx, v.text, CX + 10, 912, 210, '#00000033', { maxW: 900 }); txt(ctx, v.text, CX, 900, 210, '#ffffff', { maxW: 900 }); });
      break;
    }
    case 'phones': { // 两台手机 + 观众席，观众把心投给更好的那边
      const winR = v.win !== 'left';
      floor(ctx, S, FLOOR - 200);
      const lx = 120; const rx = 380; const py = FLOOR - 200 - 420;
      withPop(ctx, pop(t, s0), lx + 110, py + 210, () => phone(ctx, lx, py, 220, 420, S, (x, y, w, h) => {
        ctx.fillStyle = '#e8e4dc'; ctx.fillRect(x, y, w, h);
        box(ctx, x + w / 2 - 50, y + 90, 100, 100, 22, '#cfc8bb', S, { lw: 0, off: 0 }); dot(ctx, x + w / 2, y + 140, 26, '#e8e4dc', S, { lw: 0, off: 0 });
        ctx.fillStyle = '#cfc8bb'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 24, y + 230 + i * 30, w - 48 - i * 30, 12);
      }, winR ? null : S.acc));
      withPop(ctx, pop(t, st[1]), rx + 110, py + 210, () => phone(ctx, rx, py, 220, 420, S, (x, y, w, h) => {
        ctx.fillStyle = S.accSoft; ctx.fillRect(x, y, w, h);
        emoji(ctx, '🙂', x + w / 2, y + h * 0.42, 110);
        ctx.fillStyle = '#ffffffcc'; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.78, 24, 0, 7); ctx.fill(); ctx.fillStyle = S.line; ctx.beginPath(); ctx.moveTo(x + w / 2 - 7, y + h * 0.78 - 11); ctx.lineTo(x + w / 2 + 11, y + h * 0.78); ctx.lineTo(x + w / 2 - 7, y + h * 0.78 + 11); ctx.fill();
      }, winR ? S.acc : null));
      txt(ctx, v.left || '', lx + 110, py - 40, 36, S.text, { maxW: 240 }); txt(ctx, v.right || '', rx + 110, py - 40, 36, S.acc, { maxW: 240 });
      // 观众
      const bx = 680; const bty = FLOOR - 200 - 150;
      box(ctx, bx - 20, bty + 90, 380, 26, 8, S.card, S, { lw: 4, off: 0 }); line(ctx, bx, bty + 116, bx, FLOOR - 200, S, 5); line(ctx, bx + 340, bty + 116, bx + 340, FLOOR - 200, S, 5);
      for (let i = 0; i < 4; i++) person(ctx, bx + 30 + i * 92, bty + bob(t, i, 3), 1, S, i + idx, t >= (st[2] ?? 1e9) ? 'smile' : 'confused');
      note(ctx, v.crowd || '观众', bx + 170, FLOOR - 160, S, 'center');
      if (t >= (st[2] ?? 1e9)) for (let i = 0; i < 5; i++) { // 小心心飞过去
        const k = ((t - st[2]) * 0.8 + i * 0.2) % 1; const tx = winR ? rx + 160 : lx + 160;
        const x = bx + 60 + i * 60 + (tx - bx - 60 - i * 60) * k; const y = bty - 20 - Math.sin(k * Math.PI) * 140;
        ctx.globalAlpha = 1 - k; emoji(ctx, '❤️', x, y, 46); ctx.globalAlpha = 1;
      }
      break;
    }
    case 'crowd': { // 一排小人坐着，头上冒反应
      const mood = ['love', 'confused', 'sleepy', 'wow'].includes(v.mood) ? v.mood : 'love';
      const n = 5; const y = FLOOR - 330;
      floor(ctx, S, FLOOR - 120);
      withPop(ctx, pop(t, s0), CX, y + 150, () => {
        box(ctx, 110, y + 120, W - 220, 30, 10, S.card, S, { lw: 4, off: 6 });
        line(ctx, 160, y + 150, 160, FLOOR - 120, S, 6); line(ctx, W - 160, y + 150, W - 160, FLOOR - 120, S, 6);
        for (let i = 0; i < n; i++) person(ctx, 210 + i * 165, y + 20 + bob(t, i, 4), 1.3, S, i + idx, mood === 'love' ? 'smile' : mood);
      });
      const em = { love: '❤️', confused: '❓', sleepy: '💤', wow: '❗' }[mood];
      for (let i = 0; i < n; i++) withPop(ctx, pop(t, (st[1] ?? 1e9) + i * 0.08), 210 + i * 165 + 40, y - 80, () => { box(ctx, 210 + i * 165, y - 130, 90, 80, 30, S.card, S, { lw: 4, off: 5 }); emoji(ctx, em, 210 + i * 165 + 45, y - 90 + bob(t, i, 3), 46); });
      note(ctx, v.label, CX, FLOOR - 80, S, 'center');
      break;
    }
    case 'target': { // 靶子 + 一个球飞过去：中或不中
      const tx = 760; const ty = top + 330; const hit = v.hit !== false;
      floor(ctx, S);
      line(ctx, tx, ty + 140, tx, FLOOR, S, 10);
      withPop(ctx, pop(t, s0), tx, ty, () => { [140, 104, 68, 32].forEach((r, i) => dot(ctx, tx, ty, r, i % 2 ? '#ffffff' : S.acc, S, { lw: 5, off: i ? 0 : 10 })); });
      if (v.count) withPop(ctx, pop(t, s0 + 0.15), 870, top + 70, () => { box(ctx, 780, top + 10, 180, 120, 16, S.card, S, { lw: 4, off: 6 }); note(ctx, v.label || '', 870, top + 40, S, 'center'); txt(ctx, v.count, 870, top + 90, 52, S.acc, { maxW: 150 }); });
      else note(ctx, v.label, tx, FLOOR + 40, S, 'center');
      const k = clamp((t - (st[1] ?? 1e9)) / 0.7);
      if (k > 0) {
        const sx = 170; const sy = FLOOR - 120; const ex = hit ? tx : tx + 90; const ey = hit ? ty : ty - 170;
        let x = sx + (ex - sx) * k; let y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 300;
        if (!hit && t > st[1] + 0.7) { const q = clamp((t - st[1] - 0.7) / 0.6); x = ex + q * 180; y = ey + q * q * 520 - Math.sin(q * Math.PI) * 120; }
        dot(ctx, x, y, 38, S.gold, S, { lw: 5, off: 0 }); line(ctx, x - 30, y, x + 30, y, S, 3); ctx.beginPath(); ctx.arc(x, y, 38, -0.9, 0.9); ctx.stroke();
      }
      const h = clamp((t - (st[2] ?? 1e9)) / 0.4);
      if (h > 0) {
        if (hit) { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.fillStyle = i % 2 ? S.acc : S.gold; ctx.globalAlpha = 1 - h; ctx.beginPath(); ctx.arc(tx + Math.cos(a) * (60 + h * 140), ty + Math.sin(a) * (60 + h * 140), 12, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } stamp(ctx, v.result || '命中', tx - 20, ty + 230, h, S, S.green, -0.08); }
        else stamp(ctx, v.result || '偏了', tx - 20, ty + 230, h, S, S.acc, -0.08);
      }
      break;
    }
    case 'calendar': { // 翻页日历：从 A 翻到 B
      const cx = CX - 80; const cy = top + 360; const w = 380; const h = 400;
      withPop(ctx, pop(t, s0), cx, cy, () => {
        box(ctx, cx - w / 2, cy - h / 2, w, h, 26, S.card, S, { lw: 6, off: 12 });
        ctx.fillStyle = S.acc; ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, 110, [26, 26, 0, 0]); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = S.line; ctx.stroke();
        for (const dx of [-100, 100]) { box(ctx, cx + dx - 12, cy - h / 2 - 40, 24, 70, 12, S.card2, S, { lw: 4, off: 0 }); }
        txt(ctx, v.label || '', cx, cy - h / 2 + 56, 40, '#ffffff', { maxW: w - 40 });
        const k = clamp((t - (st[1] ?? 1e9)) / 0.5);
        const face = k < 0.5 ? (v.from || '今天') : (v.to || '明天');
        ctx.save(); ctx.translate(cx, cy + 50); ctx.scale(1, Math.abs(Math.cos(k * Math.PI)) || 0.02);
        txt(ctx, face, 0, 0, 140, k < 0.5 ? S.text2 : S.line, { maxW: w - 60 }); ctx.restore();
      });
      withPop(ctx, pop(t, (st[1] ?? 1e9) + 0.5), cx + 290, cy - 120, () => { dot(ctx, cx + 290, cy - 120, 70, S.gold, S, { lw: 5, off: 6 }); emoji(ctx, '⏰', cx + 290, cy - 120, 70); });
      break;
    }
    case 'stack': { // 卡片一张张往上叠（像梯子）
      const items = v.items || []; const n = items.length;
      floor(ctx, S);
      items.forEach((it, i) => {
        const y = FLOOR - 40 - (i + 1) * 150; const x = 200 + i * 40;
        withPop(ctx, pop(t, st[i]), x + 280, y + 60, () => {
          box(ctx, x, y, 560, 120, 20, i === n - 1 ? S.acc : S.card, S, { lw: 5, off: 8 });
          txt(ctx, String(i + 1).padStart(2, '0'), x + 60, y + 62, 40, i === n - 1 ? '#ffffff' : S.acc);
          txt(ctx, it, x + 110, y + 62, 46, i === n - 1 ? '#ffffff' : S.line, { align: 'left', maxW: 420 });
        });
      });
      if (n && t >= (st[n - 1] ?? 1e9)) { const y = FLOOR - 40 - n * 150 - 70; emoji(ctx, '🚩', 200 + (n - 1) * 40 + 520, y + bob(t, 0, 4), 70); }
      break;
    }
    case 'gauge': { // 表盘指针摆到一个位置
      const cx = CX; const cy = top + 520; const r = 300;
      withPop(ctx, pop(t, s0), cx, cy - 100, () => {
        ctx.fillStyle = S.shadow; ctx.beginPath(); ctx.arc(cx + 10, cy + 10, r, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = S.card; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = S.line; ctx.stroke();
        const cols = [S.green, S.gold, S.acc];
        cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 46; ctx.beginPath(); ctx.arc(cx, cy, r - 50, Math.PI + (i * Math.PI) / 3 + 0.03, Math.PI + ((i + 1) * Math.PI) / 3 - 0.03); ctx.stroke(); });
        for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; line(ctx, cx + Math.cos(a) * (r - 100), cy + Math.sin(a) * (r - 100), cx + Math.cos(a) * (r - 84), cy + Math.sin(a) * (r - 84), S, 4); }
        txt(ctx, v.low || '', cx - r + 70, cy + 40, 32, S.text2, { weight: 700 }); txt(ctx, v.high || '', cx + r - 70, cy + 40, 32, S.text2, { weight: 700 });
      });
      const lv = clamp(v.level ?? 0.7); const k = easeOut(clamp((t - (st[1] ?? 1e9)) / 0.9));
      const wob = k < 1 ? Math.sin(k * 14) * (1 - k) * 0.25 : 0;
      const a = Math.PI + (0.04 + (lv - 0.04) * k + wob) * Math.PI;
      if (t >= s0) { line(ctx, cx, cy, cx + Math.cos(a) * (r - 70), cy + Math.sin(a) * (r - 70), S, 12); dot(ctx, cx, cy, 30, S.navy, S, { lw: 5, off: 0 }); }
      txt(ctx, v.label || '', cx, cy + 110, 54, S.text, { maxW: 700 });
      break;
    }
    case 'weeks': { // 一排周卡：前面几张被“放弃”章盖住，最后一张命中
      const items = v.items || []; const n = items.length; const cw = 190; const gap = 30; const x0 = CX - (n * cw + (n - 1) * gap) / 2; const y = top + 220;
      items.forEach((it, i) => {
        const x = x0 + i * (cw + gap); const last = i === n - 1;
        withPop(ctx, pop(t, st[i]), x + cw / 2, y + 140, () => {
          box(ctx, x, y, cw, 280, 20, last ? S.accSoft : S.card, S, { lw: 5, off: 8 });
          ctx.fillStyle = S.text2; font(ctx, 26, 700); ctx.textAlign = 'center'; ctx.fillText(it.slice(0, 4), x + cw / 2, y + 40);
          txt(ctx, String(i + 1), x + cw / 2, y + 150, 120, last ? S.acc : S.line);
          for (let d = 0; d < 7; d++) { ctx.fillStyle = d < (last ? 7 : 3 + (i % 3)) ? S.line : S.card2; ctx.beginPath(); ctx.arc(x + 30 + d * 22, y + 250, 6, 0, 7); ctx.fill(); }
        });
        if (!last && i > 0) stamp(ctx, v.stamp || '放弃', x + cw / 2, y + 150, clamp((t - (st[n] ?? 1e9)) / 0.25), S, S.acc, -0.25);
      });
      if (n) {
        const x = x0 + (n - 1) * (cw + gap) + cw / 2; const k = pop(t, (st[n] ?? 1e9) + 0.3);
        withPop(ctx, k, x, y - 60, () => { box(ctx, x - 80, y - 110, 160, 80, 18, S.acc, S, { lw: 4, off: 6 }); txt(ctx, v.hit || '见效', x, y - 68, 40, '#ffffff', { maxW: 140 }); });
      }
      note(ctx, v.label, x0, y + 340, S);
      break;
    }
    case 'word': { // 深色底，一个关键词的字从四面飞进来，后面一个雷达圈
      const k = fade(t, s0, 0.6); const word = [...(v.word || '坚持')]; const cy = top + 420;
      ctx.save(); ctx.globalAlpha *= k * 0.9; ctx.strokeStyle = S.acc; ctx.lineWidth = 4;
      for (const r of [200, 300]) { ctx.beginPath(); ctx.arc(CX, cy, r, 0, 7); ctx.stroke(); }
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; line(ctx, CX + Math.cos(a) * 316, cy + Math.sin(a) * 316, CX + Math.cos(a) * 336, cy + Math.sin(a) * 336, { line: S.acc }, 3); }
      const sw = t * 1.6; ctx.fillStyle = S.acc + '33'; ctx.beginPath(); ctx.moveTo(CX, cy); ctx.arc(CX, cy, 300, sw, sw + 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
      const size = Math.min(230, 820 / Math.max(1, word.length));
      word.forEach((ch, i) => {
        const q = easeOut(clamp((t - (st[1] ?? s0 + 0.3) - i * 0.12) / 0.45)); if (q <= 0) return;
        const a = hash(i + 7) * Math.PI * 2; const d = (1 - q) * 700;
        const x = CX + (i - (word.length - 1) / 2) * size * 1.02 + Math.cos(a) * d; const y = cy + Math.sin(a) * d;
        ctx.save(); ctx.translate(x, y); ctx.rotate((1 - q) * (hash(i) - 0.5) * 2); ctx.globalAlpha *= q;
        txt(ctx, ch, 6, 8, size, '#00000066'); txt(ctx, ch, 0, 0, size, i % 2 ? S.acc : '#ffffff'); ctx.restore();
      });
      if (v.sub) { const q = fade(t, (st[1] ?? s0) + 0.6); ctx.globalAlpha = q; note(ctx, v.sub, CX, cy + 380, { text2: '#ffffffaa' }, 'center'); ctx.globalAlpha = 1; }
      break;
    }
    case 'grid': { // 一格格复制出很多个（矩阵）
      const n = clamp(v.n || 12, 4, 30); const cols = n > 20 ? 6 : n > 12 ? 5 : 4; const rows = Math.ceil(n / cols);
      const cw = 118; const ch = 150; const gx = CX - (cols * cw + (cols - 1) * 18) / 2; const gy = top + 150;
      withPop(ctx, pop(t, s0), CX, gy - 60, () => { box(ctx, CX - 190, gy - 110, 380, 80, 40, S.card, S, { lw: 4, off: 6 }); txt(ctx, v.label || `${n} 个`, CX, gy - 68, 40, S.line, { maxW: 340 }); });
      const k = clamp((t - (st[1] ?? 1e9)) / 1.0);
      for (let i = 0; i < n; i++) {
        if (i > 0 && i / n > k) continue;
        const r = Math.floor(i / cols); const c = i % cols; const x = gx + c * (cw + 18); const y = gy + r * (ch + 18);
        if (y + ch > FLOOR) break;
        const q = i === 0 ? pop(t, s0 + 0.15) : 1;
        withPop(ctx, q, x + cw / 2, y + ch / 2, () => phone(ctx, x, y, cw, ch, S, (sx, sy, sw, sh) => { ctx.fillStyle = [S.accSoft, '#dfe8f5', '#f3e3b8'][(i + idx) % 3]; ctx.fillRect(sx, sy, sw, sh); emoji(ctx, ['🙂', '😀', '😎', '🤓'][(i * 7) % 4], sx + sw / 2, sy + sh / 2, 46); }));
      }
      void rows;
      break;
    }
    case 'brand': { // 一张大白卡：图标 + 名字
      const cy = top + 300;
      withPop(ctx, pop(t, s0), CX, cy, () => {
        box(ctx, CX - 380, cy - 120, 760, 240, 40, S.card, S, { lw: 6, off: 12 });
        dot(ctx, CX - 250, cy, 76, S.accSoft, S, { lw: 5, off: 0 }); emoji(ctx, v.emoji || '🙂', CX - 250, cy, 90);
        txt(ctx, v.name || '', CX - 150, cy, 92, S.line, { align: 'left', maxW: 500 });
      });
      if (v.sub) withPop(ctx, pop(t, st[1]), CX, cy + 230, () => { box(ctx, CX - 260, cy + 180, 520, 96, 48, S.acc, S, { lw: 5, off: 6 }); txt(ctx, v.sub, CX, cy + 230, 44, '#ffffff', { maxW: 470 }); });
      break;
    }
    case 'button': { // 一个大药丸按钮砸下来，周围一圈冲击线
      const cy = top + 340; const k = clamp((t - s0) / 0.3);
      if (k <= 0) break;
      const sc = 1.6 - 0.6 * easeOut(k);
      ctx.save(); ctx.translate(CX, cy); ctx.rotate(-0.06); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2);
      fitFont(ctx, v.text || '', 130, 640, 900); const w = Math.max(420, ctx.measureText(v.text || '').width + 140);
      box(ctx, -w / 2, -100, w, 200, 100, S.acc, S, { lw: 8, off: 16 });
      ctx.fillStyle = '#ffffff40'; ctx.beginPath(); ctx.roundRect(-w / 2 + 40, -84, w - 80, 50, 25); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.text || '', 0, 8);
      ctx.restore();
      const r = clamp((t - s0 - 0.2) / 0.5);
      if (r > 0 && r < 1) { ctx.globalAlpha = 1 - r; ctx.strokeStyle = S.acc; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(CX, cy, 380 + r * 160, 160 + r * 90, -0.06, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      if (v.sub) { ctx.globalAlpha = fade(t, s0 + 0.4); note(ctx, v.sub, CX, cy + 210, S, 'center'); ctx.globalAlpha = 1; }
      break;
    }
    case 'checklist': { // 一张清单纸，右上角一个数字章，逐条打勾/打叉
      const items = v.items || []; const n = items.length; const x = 170; const y = top + 120; const w = 740; const h = 140 + n * 92;
      withPop(ctx, pop(t, s0 - 0.15), x + w / 2, y + h / 2, () => {
        box(ctx, x, y, w, h, 22, S.card, S, { lw: 5, off: 10 });
        txt(ctx, v.title || '', x + 40, y + 66, 46, S.line, { align: 'left', maxW: w - 200 });
        line(ctx, x + 40, y + 110, x + w - 40, y + 110, S, 3);
      });
      if (v.badge) withPop(ctx, pop(t, s0 + 0.2), x + w - 40, y + 10, () => { dot(ctx, x + w - 40, y + 10, 62, S.acc, S, { lw: 5, off: 6 }); txt(ctx, v.badge, x + w - 40, y + 14, 64, '#ffffff', { maxW: 90 }); });
      const cross = v.mark === 'cross';
      items.forEach((it, i) => {
        const iy = y + 160 + i * 92; const on = t >= (st[i] ?? 1e9); if (!on && t < s0) return;
        ctx.globalAlpha = fade(t, st[i] - 0.25);
        box(ctx, x + 40, iy - 24, 48, 48, 10, '#ffffff', S, { lw: 4, off: 0 });
        txt(ctx, it, x + 112, iy, 40, S.line, { align: 'left', maxW: w - 170, weight: 700 });
        ctx.globalAlpha = 1;
        const k = clamp((t - st[i]) / 0.2);
        if (k > 0) { ctx.strokeStyle = cross ? S.acc : S.green; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath();
          if (cross) { ctx.moveTo(x + 48, iy - 16); ctx.lineTo(x + 48 + 32 * k, iy - 16 + 32 * k); if (k > 0.5) { ctx.moveTo(x + 80, iy - 16); ctx.lineTo(x + 80 - 32 * (k - 0.5) * 2, iy - 16 + 32 * (k - 0.5) * 2); } } else { ctx.moveTo(x + 48, iy); ctx.lineTo(x + 60, iy + 14 * Math.min(1, k * 2)); if (k > 0.5) ctx.lineTo(x + 60 + 26 * (k - 0.5) * 2, iy + 14 - 34 * (k - 0.5) * 2); }
          ctx.stroke(); }
      });
      break;
    }
    case 'follow': { // 关注按钮：点一下变成“已关注 ✓”，一封信飞出来
      const cy = top + 330; const done = t >= (st[1] ?? 1e9);
      withPop(ctx, pop(t, s0), CX, cy, () => {
        dot(ctx, CX, cy - 190, 100, S.accSoft, S, { lw: 6, off: 8 }); emoji(ctx, v.emoji || '🙂', CX, cy - 190, 110);
        const w = 460; box(ctx, CX - w / 2, cy - 30 + 30, w, 120, 60, done ? S.card : S.acc, S, { lw: 6, off: done ? 4 : 10 });
        txt(ctx, done ? '已关注 ✓' : '+ 关注', CX, cy + 61, 56, done ? S.acc : '#ffffff');
      });
      if (done) { const k = easeOut(clamp((t - st[1]) / 0.6)); const x = CX + 120 + k * 200; const y = cy + 40 - k * 260; ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3 + k * 0.3); ctx.globalAlpha *= clamp(k * 2);
        box(ctx, -70, -48, 140, 96, 10, S.card, S, { lw: 5, off: 5 }); ctx.strokeStyle = S.line; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-70, -48); ctx.lineTo(0, 6); ctx.lineTo(70, -48); ctx.stroke(); dot(ctx, 60, -40, 14, S.acc, S, { lw: 3, off: 0 }); ctx.restore(); }
      if (v.text) { ctx.globalAlpha = fade(t, (st[1] ?? 1e9) + 0.2); txt(ctx, v.text, CX, cy + 230, 46, S.text, { maxW: 820, weight: 700 }); ctx.globalAlpha = 1; }
      break;
    }
    case 'chat': { // 对话气泡
      const msgs = v.msgs || []; let y = top + 120;
      msgs.forEach((m, i) => {
        const me = m.from === 'me'; font(ctx, 42, 700); const ls = wrap(ctx, m.text, 560, 2); const bw = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 70; const bh = ls.length * 58 + 44;
        const x = me ? W - 120 - bw : 160;
        withPop(ctx, pop(t, st[i]), me ? x + bw : x, y + bh / 2, () => {
          if (!me) { dot(ctx, 100, y + bh - 30, 38, S.accSoft, S, { lw: 4, off: 0 }); emoji(ctx, '🙋', 100, y + bh - 30, 44); }
          box(ctx, x, y, bw, bh, 30, me ? S.acc : S.card, S, { lw: 5, off: 7 });
          ls.forEach((l, k) => txt(ctx, l, x + 35, y + 50 + k * 58, 42, me ? '#ffffff' : S.line, { align: 'left', weight: 700 }));
        });
        y += bh + 40;
      });
      break;
    }
    case 'bars': { // 柱状图一根根长起来
      const items = v.items || []; const n = items.length; const bw = 150; const gap = (820 - n * bw) / Math.max(1, n - 1); const base = FLOOR - 110; const maxH = base - top - 220;
      line(ctx, 110, base, W - 110, base, S, 6);
      items.forEach((it, i) => {
        const x = 130 + i * (bw + gap); const k = easeOut(clamp((t - (st[i] ?? 1e9)) / 0.6)); const h = Math.max(20, maxH * clamp(it.level ?? 0.5)) * k;
        if (k <= 0) return;
        const best = (it.level ?? 0) >= Math.max(...items.map((q) => q.level ?? 0));
        box(ctx, x, base - h, bw, h, [16, 16, 0, 0], best ? S.acc : S.card, S, { lw: 5, off: 8 });
        txt(ctx, it.label || '', x + bw / 2, base + 46, 36, S.text, { maxW: bw + gap - 10, weight: 700 });
        if (best && k >= 1) emoji(ctx, '👑', x + bw / 2, base - h - 50 + bob(t, i, 4), 60);
      });
      break;
    }
    case 'versus': { // 两张牌：输的那张被划掉
      const winR = v.win !== 'left'; const cy = top + 340;
      const card = (x, s, good, k) => withPop(ctx, k, x, cy, () => { box(ctx, x - 190, cy - 200, 380, 400, 30, good && t >= (st[2] ?? 1e9) ? S.accSoft : S.card, S, { lw: 6, off: 12 }); txt(ctx, s, x, cy, 66, S.line, { maxW: 320 }); });
      card(CX - 230, v.left || '', !winR, pop(t, s0)); card(CX + 230, v.right || '', winR, pop(t, st[1]));
      withPop(ctx, pop(t, st[1]), CX, cy, () => { dot(ctx, CX, cy, 64, S.navy, S, { lw: 5, off: 6 }); txt(ctx, 'VS', CX, cy + 3, 50, '#ffffff'); });
      const k = clamp((t - (st[2] ?? 1e9)) / 0.3);
      if (k > 0) { const lx = winR ? CX - 230 : CX + 230; ctx.strokeStyle = S.acc; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(lx - 150, cy - 150); ctx.lineTo(lx - 150 + 300 * k, cy - 150 + 300 * k); ctx.stroke();
        if (k > 0.4) { const q = (k - 0.4) / 0.6; ctx.beginPath(); ctx.moveTo(lx + 150, cy - 150); ctx.lineTo(lx + 150 - 300 * q, cy - 150 + 300 * q); ctx.stroke(); } }
      if (v.note) { ctx.globalAlpha = fade(t, (st[2] ?? 1e9) + 0.3); note(ctx, v.note, CX, cy + 270, S, 'center'); ctx.globalAlpha = 1; }
      break;
    }
    case 'timer': { // 秒表：一圈走满
      const cx = CX; const cy = top + 360; const r = 220;
      withPop(ctx, pop(t, s0), cx, cy, () => {
        box(ctx, cx - 40, cy - r - 70, 80, 60, 12, S.card2, S, { lw: 5, off: 0 });
        dot(ctx, cx, cy, r, S.card, S, { lw: 7, off: 12 });
        const k = easeOut(clamp((t - (st[1] ?? 1e9)) / 1.4));
        ctx.strokeStyle = S.acc; ctx.lineWidth = 34; ctx.beginPath(); ctx.arc(cx, cy, r - 40, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        txt(ctx, v.text || '', cx, cy, 96, S.line, { maxW: 300 });
      });
      note(ctx, v.label, cx, cy + r + 70, S, 'center');
      break;
    }
    case 'path': { // 一条弯路，路上插小旗，一个小点往前走
      const stops = v.stops || []; const n = stops.length; const y0 = top + 120; const y1 = FLOOR - 80;
      const pt = (q) => ({ x: CX + Math.sin(q * Math.PI * 2.2) * 200, y: y1 - (y1 - y0) * q });
      ctx.strokeStyle = S.card2; ctx.lineWidth = 70; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i <= 60; i++) { const a = pt(i / 60); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); } ctx.stroke();
      ctx.strokeStyle = S.line; ctx.lineWidth = 4; ctx.setLineDash([18, 16]); ctx.stroke(); ctx.setLineDash([]);
      stops.forEach((s, i) => {
        const q = (i + 0.5) / n; const a = pt(q); const left = Math.cos(q * Math.PI * 2.2) > 0;
        const bx = clamp(left ? a.x + 50 : a.x - 330, 40, W - 330);
        withPop(ctx, pop(t, st[i]), a.x, a.y, () => { dot(ctx, a.x, a.y, 26, i === n - 1 ? S.acc : S.card, S, { lw: 5, off: 4 }); box(ctx, bx, a.y - 42, 280, 84, 18, i === n - 1 ? S.acc : S.card, S, { lw: 4, off: 6 }); txt(ctx, s, bx + 140, a.y, 40, i === n - 1 ? '#ffffff' : S.line, { maxW: 250 }); });
      });
      const last = st[n - 1] ?? 1e9; const k = clamp((t - (st[0] ?? 1e9)) / Math.max(0.6, last - (st[0] ?? 0) + 0.4)) * ((n - 0.5) / n);
      if (t >= (st[0] ?? 1e9)) { const a = pt(k); dot(ctx, a.x, a.y - 30, 30, S.gold, S, { lw: 5, off: 0 }); emoji(ctx, '🏃', a.x, a.y - 30, 40); }
      break;
    }
    case 'quote': { // 一张便签纸，大引号 + 一句话
      const cy = top + 340; const k = pop(t, s0);
      withPop(ctx, k, CX, cy, () => {
        ctx.save(); ctx.translate(CX, cy); ctx.rotate(-0.025);
        box(ctx, -400, -230, 800, 460, 18, S.card, S, { lw: 6, off: 12 });
        ctx.fillStyle = S.accSoft; ctx.fillRect(-90, -258, 180, 54);
        txt(ctx, '“', -330, -150, 200, S.acc);
        font(ctx, 62, 900); const ls = wrap(ctx, v.text || '', 660, 3); ls.forEach((l, i) => txt(ctx, l, -330, -40 + i * 86 - (ls.length - 1) * 20, 62, S.line, { align: 'left' }));
        if (v.by) note(ctx, v.by, 330, 180, S, 'right');
        ctx.restore();
      });
      break;
    }
    case 'mystery': { // 一个盒子，盖子掀开，里面冒出答案
      const cx = CX; const by = FLOOR - 340; const open = clamp((t - (st[1] ?? 1e9)) / 0.4);
      floor(ctx, S);
      withPop(ctx, pop(t, s0), cx, by + 120, () => {
        if (open > 0) { const q = easeOut(open); ctx.globalAlpha = 1 - open * 0.6; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.28; line(ctx, cx + Math.cos(a) * 120, by - 20 + Math.sin(a) * 40, cx + Math.cos(a) * (200 + q * 80), by - 20 + Math.sin(a) * (110 + q * 80), { line: S.gold }, 8); } ctx.globalAlpha = 1; }
        box(ctx, cx - 220, by, 440, 300, 24, S.gold, S, { lw: 6, off: 12 });
        ctx.save(); ctx.translate(cx - 240, by); ctx.rotate(-easeOut(open) * 0.45); box(ctx, 0, -60, 480, 70, 18, S.gold, S, { lw: 6, off: 0 }); ctx.restore();
        txt(ctx, open > 0 ? '!' : '?', cx, by + 160, 160, S.line);
        if (open > 0) { const q = easeOut(open); const ry = by - 60 - q * 230; withPop(ctx, q, cx, ry, () => { box(ctx, cx - 220, ry - 90, 440, 180, 30, S.acc, S, { lw: 6, off: 10 }); if (v.emoji) emoji(ctx, v.emoji, cx - 140, ry, 80); txt(ctx, v.reveal || '', v.emoji ? cx + 40 : cx, ry, 64, '#ffffff', { maxW: v.emoji ? 250 : 380 }); }); }
      });
      note(ctx, v.label, cx, FLOOR + 40, S, 'center');
      break;
    }
    case 'progress': { // 进度条从左往右走满
      const y = top + 330; const x = 140; const w = W - 280;
      withPop(ctx, pop(t, s0), CX, y, () => {
        txt(ctx, v.label || '', CX, y - 130, 60, S.text, { maxW: 820 });
        box(ctx, x, y - 50, w, 100, 50, S.card, S, { lw: 6, off: 10 });
        const k = easeOut(clamp((t - (st[1] ?? 1e9)) / 1.4));
        if (k > 0) { ctx.save(); ctx.beginPath(); ctx.roundRect(x + 10, y - 40, w - 20, 80, 40); ctx.clip(); ctx.fillStyle = S.acc; ctx.fillRect(x + 10, y - 40, (w - 20) * k, 80);
          ctx.fillStyle = '#ffffff33'; for (let i = -2; i < 20; i++) { const sx = x + i * 60 + ((t * 80) % 60); ctx.beginPath(); ctx.moveTo(sx, y + 40); ctx.lineTo(sx + 30, y + 40); ctx.lineTo(sx + 60, y - 40); ctx.lineTo(sx + 30, y - 40); ctx.fill(); } ctx.restore(); }
        txt(ctx, v.from || '', x, y + 110, 38, S.text2, { align: 'left', weight: 700 }); txt(ctx, v.to || '', x + w, y + 110, 38, k >= 1 ? S.acc : S.text2, { align: 'right', weight: 900 });
        if (k >= 1) emoji(ctx, '🎉', x + w - 30, y - 120 + bob(t, 0, 5), 80);
      });
      break;
    }
    case 'bulb': { // 灯泡亮起来，下面一张卡写想法
      const cx = CX; const cy = top + 270; const on = clamp((t - (st[1] ?? 1e9)) / 0.3);
      withPop(ctx, pop(t, s0), cx, cy, () => {
        if (on > 0) { ctx.save(); ctx.globalAlpha *= on; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i - 4.5) * 0.32; line(ctx, cx + Math.cos(a) * 200, cy + Math.sin(a) * 200, cx + Math.cos(a) * (250 + Math.sin(t * 6 + i) * 10), cy + Math.sin(a) * (250 + Math.sin(t * 6 + i) * 10), { line: S.gold }, 10); } ctx.restore(); }
        dot(ctx, cx, cy, 160, on > 0 ? S.gold : S.card, S, { lw: 7, off: 10 });
        box(ctx, cx - 70, cy + 140, 140, 90, 16, S.card2, S, { lw: 6, off: 0 });
        ctx.strokeStyle = S.line; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 30, cy + 140); ctx.lineTo(cx - 30, cy + 40); for (let k = 0; k < 4; k++) ctx.arc(cx - 22 + k * 15, cy + 30, 8, Math.PI, 0); ctx.lineTo(cx + 30, cy + 40); ctx.lineTo(cx + 30, cy + 140); ctx.stroke();
      });
      if (v.text) withPop(ctx, pop(t, (st[1] ?? 1e9) + 0.2), cx, cy + 360, () => { box(ctx, cx - 360, cy + 300, 720, 120, 24, S.acc, S, { lw: 5, off: 8 }); txt(ctx, v.text, cx, cy + 360, 52, '#ffffff', { maxW: 660 }); });
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------------
// 字幕：一个字一个字出来，关键词变色
// ---------------------------------------------------------------------
function drawCaption(ctx, sec, s, t, S, light) {
  if (!sec) return;
  let ln = sec.lines.find((l) => t >= l.start - 0.05 && t < l.end + 0.25);
  if (!ln && t >= sec.lines[sec.lines.length - 1].end) ln = sec.lines[sec.lines.length - 1];
  if (!ln || !ln.text) return;
  const text = ln.text.replace(/[。！？!?.]+$/, '');
  const chars = [...text];
  const hot = new Array(chars.length).fill(false);
  for (const w of s.hl || []) { if (!w) continue; let i = text.indexOf(w); while (i >= 0) { const a = [...text.slice(0, i)].length; for (let k = 0; k < [...w].length; k++) hot[a + k] = true; i = text.indexOf(w, i + w.length); } }
  const prog = clamp((t - ln.start + 0.05) / Math.max(0.35, (ln.end - ln.start) * 0.7)) * chars.length;
  font(ctx, CAP.size, 900);
  const rows = []; let cur = []; let cw = 0;
  chars.forEach((ch, i) => { const w = ctx.measureText(ch).width; if (cw + w > CAP.w && cur.length && !'，、；：,;:）'.includes(ch)) { rows.push(cur); cur = []; cw = 0; } cur.push({ ch, i, w }); cw += w; });
  if (cur.length) rows.push(cur);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  rows.slice(0, 3).forEach((r, ri) => {
    let x = CAP.x;
    for (const c of r) {
      const k = clamp(prog - c.i);
      if (k > 0) { ctx.globalAlpha = k; ctx.fillStyle = hot[c.i] ? S.acc : (light ? '#ffffff' : S.text); ctx.fillText(c.ch, x, CAP.y + ri * CAP.lh + (1 - k) * 16); }
      x += c.w;
    }
  });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// 讲师：右下角，跟着段落换手势；身体被画面底边裁掉
// ---------------------------------------------------------------------
function drawNarrator(ctx, idx, p, t, assets) {
  const photos = assets?.photos?.length ? assets.photos : null;
  const img = photos ? photos[idx % photos.length] : demoPresenter(idx % 3);
  const targetH = photos ? 640 : 720;
  const sc = Math.min(targetH / img.height, 480 / img.width);
  const w = img.width * sc; const h = img.height * sc;
  const k = clamp((t - (p?.start ?? 0)) / 0.22);
  const x = W - w - 20 + (1 - easeOut(k)) * 40;
  const y = H - h * (photos ? 0.98 : 0.86) + Math.sin(t * 2) * 4 + (1 - easeOut(k)) * 20;
  ctx.save(); ctx.globalAlpha = clamp(k * 1.6); ctx.drawImage(img, x, y, w, h); ctx.restore();
}

// ---------------------------------------------------------------------
// 纸纹：一张小图平铺
// ---------------------------------------------------------------------
const grainCache = new Map();
function grain(ctx, color) {
  if (!grainCache.has(color)) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(220, 220) : Object.assign(document.createElement('canvas'), { width: 220, height: 220 });
    const g = c.getContext('2d'); g.fillStyle = color;
    for (let i = 0; i < 420; i++) { const r = hash(i + 3) * 1.6 + 0.4; g.beginPath(); g.arc(hash(i) * 220, hash(i + 99) * 220, r, 0, 7); g.fill(); }
    grainCache.set(color, c);
  }
  return ctx.createPattern(grainCache.get(color), 'repeat');
}
function dots(ctx, color, step = 30) { ctx.fillStyle = color; for (let y = 10; y < H; y += step) for (let x = 10 + ((y / step) % 2) * (step / 2); x < W; x += step) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); } }

// ---------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'paper', assets }) {
  const S = themedSkin(skinId, script.theme);
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx]; const sec = tl.sections[idx];
  const v = s?.visual || { type: 'badge' };
  ctx.save();
  // 底色：普通镜头是纸；flash 整屏品牌色；word 整屏深色
  if (v.type === 'flash') { ctx.fillStyle = S.acc; ctx.fillRect(0, 0, W, H); dots(ctx, '#ffffff22'); }
  else if (v.type === 'word') { ctx.fillStyle = S.navy; ctx.fillRect(0, 0, W, H); ctx.fillStyle = grain(ctx, 'rgba(255,255,255,0.05)'); ctx.fillRect(0, 0, W, H); }
  else { ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = grain(ctx, S.grain); ctx.fillRect(0, 0, W, H); }
  // 换段时一道品牌色擦过去
  const sw = clamp((t - (p?.start ?? 0)) / 0.28);
  if (idx > 0 && sw < 1) { ctx.fillStyle = S.acc; ctx.fillRect(W * easeOut(sw) * 1.1 - 120, 0, 120, H); }

  // 吊牌：01 · 一句话
  const top = s?.sign?.text && !FULL.has(v.type) ? 660 : 560;
  if (s?.sign?.text && !FULL.has(v.type)) {
    const k = pop(t, (p?.start ?? 0) + 0.1); const sx = 70; const sy = 470;
    const swing = Math.sin(t * 2.4) * 0.025 * (1 - clamp((t - p.start) / 3) * 0.6);
    ctx.save(); ctx.translate(sx + 230, 400); ctx.rotate(swing - 0.03); ctx.translate(-(sx + 230), -400);
    line(ctx, sx + 230, 400, sx + 230, sy, S, 3); ctx.fillStyle = S.line; ctx.beginPath(); ctx.arc(sx + 230, 400, 7, 0, 7); ctx.fill();
    withPop(ctx, k, sx + 230, sy + 60, () => {
      box(ctx, sx, sy, 460, 120, 16, S.acc, S, { lw: 5, off: 8 });
      ctx.font = `700 26px ui-monospace, Consolas, monospace`; ctx.fillStyle = '#ffffffcc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${s.sign.num || String(idx + 1).padStart(2, '0')} ·`, sx + 26, sy + 34);
      txt(ctx, s.sign.text, sx + 26, sy + 80, 46, '#ffffff', { align: 'left', maxW: 410 });
    });
    ctx.restore();
  }

  if (s && p) drawVisual(ctx, v, p, t, S, top, idx);
  if (v.type !== 'flash') drawNarrator(ctx, idx, p, t, assets);
  drawCaption(ctx, sec, s || {}, t, S, FULL.has(v.type) || skinId === 'night');
  // 右上角小小的账号名
  if (script.account) { ctx.font = `600 26px ui-monospace, Consolas, "Noto Sans SC", monospace`; ctx.fillStyle = FULL.has(v.type) ? '#ffffff99' : S.text2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('@' + script.account, W - 60, 70); }
  ctx.restore();
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789VS!?已关注✓+';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, text), fonts.load(`700 40px "Noto Sans SC"`, text)]);
}

/** AI 结果兜底 */
export function normalize(s) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  const num = (v, a, b, d) => { const x = Number(v); return Number.isFinite(x) ? Math.max(a, Math.min(b, Math.round(x))) : d; };
  const lvl = (v, d = 0.6) => { const x = Number(v); return Number.isFinite(x) ? clamp(x > 1 ? x / 100 : x) : d; };
  const emo = (e) => { const x = String(e || '').trim(); return x && x.length <= 8 ? x : ''; };
  s.title = str(s.title, 16) || '未命名';
  s.theme = normalizeTheme(s.theme);
  const th = themeEmoji(s.theme);
  s.sections = (s.sections || []).filter(Boolean).map((x, i) => {
    const v = x.visual || {};
    const type = VISUALS.includes(v.type) ? v.type : 'badge';
    const lines = (x.lines || []).map((l) => String(l).trim()).filter(Boolean).slice(0, 4);
    return {
      tag: str(x.tag || x.sign?.text, 8),
      // 吊牌只给“第 N 个点”用；AI 有时把“开头/结尾”也挂上去，过滤掉
      sign: x.sign?.text && /^\d{1,2}$/.test(String(x.sign.num ?? '').trim()) && !/钩子|开头|开场|结尾|收尾|点题|总结|引导/.test(x.sign.text) ? { num: String(x.sign.num).trim().padStart(2, '0'), text: str(x.sign.text, 9) } : null,
      hl: (x.hl || []).map((w) => str(w, 6)).filter(Boolean).slice(0, 3),
      visual: {
        type, emoji: emo(v.emoji) || (th ? th[i % th.length] : '⭐'), stamp: str(v.stamp, 4), note: str(v.note, 12), label: str(v.label, 10), side: str(v.side, 6),
        n: num(v.n, 2, type === 'grid' ? 30 : 8, type === 'grid' ? 12 : 3),
        left: str(v.left, 7), right: str(v.right, 7), win: v.win === 'left' ? 'left' : 'right', crowd: str(v.crowd, 6),
        mood: ['love', 'confused', 'sleepy', 'wow'].includes(v.mood) ? v.mood : 'love',
        count: str(v.count, 4), hit: v.hit !== false, result: str(v.result, 4),
        from: str(v.from, 5), to: str(v.to, 5),
        items: type === 'bars' ? (v.items || []).filter(Boolean).slice(0, 4).map((q) => ({ label: str(q.label ?? q, 5), level: lvl(q.level) }))
          : (v.items || []).map((q) => str(q, type === 'weeks' ? 4 : type === 'checklist' ? 14 : 9)).filter(Boolean).slice(0, type === 'checklist' ? 5 : 4),
        level: lvl(v.level, 0.7), low: str(v.low, 4), high: str(v.high, 4),
        stampText: str(v.stamp, 4), hitText: str(v.hit, 4),
        word: str(v.word, 4), sub: str(v.sub, 12), name: str(v.name, 8), text: str(v.text, type === 'quote' ? 26 : 12), by: str(v.by, 10),
        title: str(v.title, 10), mark: v.mark === 'cross' ? 'cross' : 'check', badge: str(v.badge, 2),
        msgs: (v.msgs || []).filter((m) => m && m.text).slice(0, 3).map((m) => ({ from: m.from === 'me' ? 'me' : 'them', text: str(m.text, 22) })),
        stops: (v.stops || []).map((q) => str(q, 6)).filter(Boolean).slice(0, 5), reveal: str(v.reveal, 6),
      },
      lines,
    };
  }).filter((x) => x.lines.length);
  // weeks 的 stamp/hit 是文字，兼容字段名
  for (const x of s.sections) if (x.visual.type === 'weeks') { x.visual.stamp = x.visual.stampText; x.visual.hit = typeof x.visual.hitText === 'string' && x.visual.hitText ? x.visual.hitText : ''; }
  return s;
}
