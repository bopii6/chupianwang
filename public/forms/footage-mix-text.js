// 实拍混剪：新版式的字（标题、字幕、大字画面）。老的 6 套版式的字还在 footage-mix.js 里。
// 每个函数拿到的 F 是“这一刻”的全部信息：{ ctx, look, skin, script, tl, planData, t, idx, p, sec, s, account, tEmoji, sc }
import { W, H, clamp, easeOut, font, fitFont, wrap, hash } from '../engine/draw.js';
import { EMOJI_FONT } from './themes.js';
import { SKEW, pop, withPop, rr, slantText, fitSlant, flowerText } from './footage-mix-parts.js';
import { imageOf, coverIn, gradeIt, grain } from './footage-mix-media.js';

// ---------- 字幕小工具（新老版式共用） ----------
export const cleanSub = (s) => String(s).trim().replace(/[。！？!?…~～，、；：,;:]+$/g, '').replace(/[，、；,;。！？!?]/g, ' ').replace(/\s+/g, ' ').trim();
/** 字幕里每个字是不是关键词 */
export function markKeys(text, keys) {
  const chars = [...text]; const on = new Array(chars.length).fill(false);
  for (const k of keys || []) {
    if (!k) continue;
    let i = text.indexOf(k);
    while (i >= 0) { const ci = [...text.slice(0, i)].length; for (let j = 0; j < [...k].length; j++) on[ci + j] = true; i = text.indexOf(k, i + k.length); }
  }
  return chars.map((ch, i) => ({ ch, key: on[i] }));
}
/** 均匀折成 1-2 行，优先在空格处断 */
export function subRows(ctx, chars, maxW) {
  const w = chars.reduce((a, c) => a + ctx.measureText(c.ch).width, 0);
  if (w <= maxW) return [chars];
  let best = Math.ceil(chars.length / 2); let bd = 1e9;
  chars.forEach((c, i) => { if (i < 2 || i > chars.length - 2) return; const d = Math.abs(i - chars.length / 2) - (c.ch === ' ' ? 3 : 0); if (d < bd) { bd = d; best = i; } });
  const trim = (r) => { while (r.length && r[0].ch === ' ') r.shift(); while (r.length && r[r.length - 1].ch === ' ') r.pop(); return r; };
  return [trim(chars.slice(0, best)), trim(chars.slice(best))];
}
/** 按宽度折成多行（左对齐正文用），最多 n 行 */
function flowRows(ctx, chars, maxW, n = 3) {
  const rows = [[]]; let w = 0;
  for (const c of chars) {
    const cw = ctx.measureText(c.ch).width;
    if (w + cw > maxW && rows[rows.length - 1].length) { if (rows.length >= n) break; rows.push([]); w = 0; if (c.ch === ' ') continue; }
    rows[rows.length - 1].push(c); w += cw;
  }
  return rows;
}
/** 按字数把一句切成几行（大字画面一行别太长） */
export function chunk(text, n = 6) {
  const cs = [...String(text)]; if (cs.length <= n + 1) return [text];
  const k = Math.ceil(cs.length / Math.ceil(cs.length / n)); const out = [];
  for (let i = 0; i < cs.length; i += k) out.push(cs.slice(i, i + k).join(''));
  for (let j = 1; j < out.length; j++) while (/^[，。！？、；：,.!?”]/.test(out[j])) { out[j - 1] += out[j][0]; out[j] = out[j].slice(1); }
  return out.filter(Boolean);
}
export function typeParts(v) {
  switch (v.type) {
    case 'hook': case 'big': return (v.lines || []).filter(Boolean);
    case 'quote': return [v.text].filter(Boolean);
    case 'stamp': return [v.text, v.note].filter(Boolean);
    case 'stat': return [String(v.big || '') + (v.unit || ''), v.label].filter(Boolean);
    default: return [];
  }
}
/** 字幕排版：自动缩字号到放得下；返回每行的字和宽度 */
function lay(ctx, text, keys, { size = 56, weight = 900, maxW = W - 160, keyScale = 1, spacing = 0, min = 34, flow = 0 } = {}) {
  const chars = markKeys(text, keys); let s = size; let rows; let rowsW;
  for (;;) {
    font(ctx, s, weight); rows = flow ? flowRows(ctx, chars, maxW, flow) : subRows(ctx, chars, maxW);
    rowsW = rows.map((r) => r.reduce((a, c) => { font(ctx, c.key ? s * keyScale : s, weight); return a + ctx.measureText(c.ch).width + spacing; }, -spacing));
    if (Math.max(...rowsW) <= maxW + 4 || s <= min) break; s -= 3;
  }
  return { s, rows, rowsW, n: chars.length };
}
/** 一个字一个字画：align center/left；draw(c, x, y, cw, ci, sz) */
function eachChar(ctx, L, { x0 = W / 2, y, lh, align = 'center', weight = 900, spacing = 0, size, draw }) {
  let ci = 0;
  L.rows.forEach((r, ri) => {
    let x = align === 'left' ? x0 : x0 - L.rowsW[ri] / 2; const yy = y + ri * lh - (align === 'left' ? 0 : ((L.rows.length - 1) * lh) / 2);
    r.forEach((c) => { const sz = size ? size(c) : L.s; font(ctx, sz, weight); const cw = ctx.measureText(c.ch).width; draw(c, x, yy, cw, ci++, sz); x += cw + spacing; });
  });
}
const strokeFill = (ctx, ch, x, y, fill, stroke, lw) => { if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(ch, x, y); } ctx.fillStyle = fill; ctx.fillText(ch, x, y); };
/** 竖排字：一个字一行 */
export function vText(ctx, text, x, y, size, color, { gap = 1.08, weight = 900, stroke = 0, strokeColor = '#000' } = {}) {
  font(ctx, size, weight); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  [...String(text)].forEach((ch, i) => strokeFill(ctx, ch, x, y + i * size * gap, color, strokeColor, stroke));
  return [...String(text)].length * size * gap;
}
const H12 = (F) => { const [h1, h2] = F.script.headline || [F.script.title || '', '']; return [h1 || '', h2 || '']; };
const ap = (F, d = 0.1, dur = 0.5) => easeOut(clamp((F.t - d) / dur));

// =====================================================================
// 标题
// =====================================================================
export const TITLES = {
  none() {},
  /** 卡点：左上角两块斜贴的小标签 */
  tagTL(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F);
    ctx.save(); ctx.translate(60 - (1 - a) * 200, 150); ctx.rotate(-0.035);
    font(ctx, 46, 900); const w1 = ctx.measureText(h1).width + 40;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -36, w1, 72); ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(h1, 20, 2);
    if (h2) { const s = fitFont(ctx, h2, 64, W - 200, 900); const w2 = ctx.measureText(h2).width + 44; ctx.fillStyle = skin.hl; ctx.fillRect(0, 44, w2, s + 30); ctx.fillStyle = '#111'; ctx.fillText(h2, 22, 44 + (s + 30) / 2 + 2); }
    ctx.restore();
  },
  /** 三屏：黑块白字 + 亮色块黑字，左对齐叠在一起 */
  block(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F);
    const e1 = easeOut(clamp((F.t - 0.1) / 0.35)); const e2 = easeOut(clamp((F.t - 0.3) / 0.35));
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const s1 = fitFont(ctx, h1, 64, W - 200, 900); const w1 = ctx.measureText(h1).width + 56;
    ctx.save(); ctx.beginPath(); ctx.rect(50, 110, w1 * e1, s1 + 34); ctx.clip(); ctx.fillStyle = '#0b0b0b'; ctx.fillRect(50, 110, w1, s1 + 34); ctx.fillStyle = '#fff'; ctx.fillText(h1, 78, 110 + (s1 + 34) / 2 + 2); ctx.restore();
    if (h2) { const s2 = fitFont(ctx, h2, 80, W - 160, 900); const w2 = ctx.measureText(h2).width + 60; const y2 = 110 + s1 + 44; ctx.save(); ctx.beginPath(); ctx.rect(50, y2, w2 * e2, s2 + 36); ctx.clip(); ctx.fillStyle = skin.hl; ctx.fillRect(50, y2, w2, s2 + 36); ctx.fillStyle = '#0b0b0b'; ctx.fillText(h2, 80, y2 + (s2 + 36) / 2 + 3); ctx.restore(); }
  },
  /** 斜切：大斜体，带一层错位的彩色影子 */
  italic(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F, 0.05, 0.35);
    ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - a) * -120, 0);
    const s1 = fitSlant(ctx, h1, 70, W - 160); slantText(ctx, h1, 70, 170, s1, '#ffffff', { align: 'left', stroke: s1 * 0.14, strokeColor: '#000' });
    if (h2) { const s2 = fitSlant(ctx, h2, 104, W - 140); slantText(ctx, h2, 78, 172 + s1 + s2 * 0.55 + 8, s2, skin.chip1, { align: 'left' }); slantText(ctx, h2, 70, 166 + s1 + s2 * 0.55, s2, '#ffffff', { align: 'left', stroke: s2 * 0.1, strokeColor: '#000' }); }
    ctx.restore();
  },
  /** 漫画：黑边说明框，斜贴在顶上 */
  comic(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const s = pop(F.t, 0.1, 0.3); if (s <= 0) return;
    withPop(ctx, s, W / 2, 190, () => {
      ctx.save(); ctx.translate(W / 2, 190); ctx.rotate(-0.025);
      const s1 = fitFont(ctx, h1, 52, W - 260, 900); const s2 = h2 ? fitFont(ctx, h2, 74, W - 220, 900) : 0;
      font(ctx, s1, 900); const w = Math.max(ctx.measureText(h1).width, (font(ctx, s2, 900), ctx.measureText(h2).width)) + 90; const h = s1 + s2 + 70;
      ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 12, -h / 2 + 12, w, h); ctx.fillStyle = '#fffbe6'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      font(ctx, s1, 900); ctx.fillStyle = '#111'; ctx.fillText(h1, 0, -h / 2 + 22 + s1 / 2);
      if (h2) { font(ctx, s2, 900); ctx.fillStyle = skin.chip1; ctx.fillText(h2, 0, -h / 2 + 34 + s1 + s2 / 2); }
      ctx.restore();
    });
  },
  /** 手帐：手写感标题 + 荧光笔 + DAY 贴纸 */
  hand(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * -20);
    ctx.save(); ctx.translate(80, 150); ctx.rotate(-0.03);
    const s1 = fitFont(ctx, h1, 52, W - 330, 700); ctx.fillStyle = '#3a2f28'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(h1, 0, 0);
    if (h2) { const s2 = fitFont(ctx, h2, 78, W - 220, 900); const w2 = ctx.measureText(h2).width; ctx.fillStyle = skin.hl; ctx.globalAlpha = a * 0.75; ctx.fillRect(-8, s1 * 0.5 + s2 * 0.55, (w2 + 16) * easeOut(clamp((F.t - 0.35) / 0.5)), s2 * 0.45); ctx.globalAlpha = a; ctx.fillStyle = '#2b211b'; ctx.fillText(h2, 0, s1 * 0.5 + s2 * 0.6 + 14); }
    ctx.restore();
    ctx.save(); ctx.translate(W - 150, 150); ctx.rotate(0.12); ctx.fillStyle = skin.chip1; rr(ctx, -80, -46, 160, 92, 46); ctx.fill(); font(ctx, 34, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`DAY ${String(F.idx + 1).padStart(2, '0')}`, 0, 2); ctx.restore();
    ctx.restore();
  },
  /** 动态：顶部一行“频道名” + 标题 */
  feedHead(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, 250); ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, 250, W, 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fitFont(ctx, h1, 40, W - 160, 700); ctx.fillStyle = '#8a8f99'; ctx.fillText(h1, 60, 110);
    if (h2) { fitFont(ctx, h2, 62, W - 160, 900); ctx.fillStyle = '#16181d'; ctx.fillText(h2, 60, 182); }
    ctx.fillStyle = skin.chip1; ctx.beginPath(); ctx.arc(W - 70, 110, 10, 0, Math.PI * 2); ctx.fill();
  },
  /** 美术馆：小字母间距 + 大标题 */
  museum(F) {
    const { ctx } = F; const [h1, h2] = H12(F); const a = ap(F, 0.2, 0.8);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, h1, 32, W - 240, 700, 10); ctx.fillStyle = '#6d655a'; ctx.fillText(h1, W / 2, 150); ctx.letterSpacing = '0px';
    if (h2) { fitFont(ctx, h2, 70, W - 160, 900, 4); ctx.fillStyle = '#2a251f'; ctx.fillText(h2, W / 2, 240); ctx.letterSpacing = '0px'; }
    ctx.fillStyle = '#2a251f'; ctx.fillRect(W / 2 - 30, 300, 60, 3);
    ctx.restore();
  },
  /** 胶片：左边一个 ▶，暖白大字 */
  film(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F, 0.2, 0.7);
    ctx.save(); ctx.globalAlpha = a * (0.92 + 0.08 * Math.sin(F.t * 31)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, '▶  ' + h1, 34, W - 240, 700, 8); ctx.fillStyle = skin.hl; ctx.fillText('▶  ' + h1, W / 2, 140); ctx.letterSpacing = '0px';
    if (h2) { fitFont(ctx, h2, 76, W - 140, 900, 4); ctx.fillStyle = '#f3e6cc'; ctx.fillText(h2, W / 2, 232); ctx.letterSpacing = '0px'; }
    ctx.restore();
  },
  /** 纪录片：开头一张片名卡，3 秒后缩到左上角 */
  doc(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const t = F.t;
    const big = 1 - clamp((t - 3) / 0.6);
    if (big > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(ap(F, 0.2, 0.8), big);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 700, W, 420);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitFont(ctx, h1, 40, W - 240, 700, 12); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(h1, W / 2, 820); ctx.letterSpacing = '0px';
      fitFont(ctx, h2 || h1, 92, W - 140, 900, 6); ctx.fillStyle = '#fff'; ctx.fillText(h2 || h1, W / 2, 940); ctx.letterSpacing = '0px';
      ctx.fillStyle = skin.hl; ctx.fillRect(W / 2 - 50, 1030, 100, 4);
      ctx.restore();
    }
    const small = clamp((t - 3.3) / 0.5);
    if (small > 0) {
      ctx.save(); ctx.globalAlpha = small; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.arc(76, 120, 9, 0, Math.PI * 2); ctx.fill();
      fitFont(ctx, h2 || h1, 36, W - 300, 700, 4); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8; ctx.fillText(h2 || h1, 100, 122); ctx.letterSpacing = '0px';
      ctx.restore();
    }
  },
  /** 黑白：左上角小字 + 大字 */
  mono(F) {
    const { ctx } = F; const [h1, h2] = H12(F); const a = ap(F, 0.2, 0.6);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12;
    fitFont(ctx, h1, 32, W - 200, 700, 10); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(h1, 70, 120); ctx.letterSpacing = '0px';
    if (h2) { fitFont(ctx, h2, 60, W - 160, 900); ctx.fillStyle = '#fff'; ctx.fillText(h2, 70, 192); }
    ctx.restore();
  },
  /** 镂空：顶上一行小黑字 */
  mask(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F, 0.1, 0.4);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = h2 ? `${h1}  /  ${h2}` : h1; fitFont(ctx, txt, 40, W - 140, 900);
    ctx.fillStyle = '#16140f'; ctx.fillText(txt, W / 2, 100);
    ctx.fillStyle = skin.chip1; ctx.fillRect(W / 2 - 24, 136, 48, 6);
    ctx.restore();
  },
  /** 老电视：奶油色大字 + 橙色描边 */
  tv(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const s = pop(F.t, 0.1, 0.35); if (s <= 0) return;
    withPop(ctx, s, W / 2, 190, () => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const s1 = fitFont(ctx, h1, 50, W - 200, 900); strokeFill(ctx, h1, W / 2, 130, '#fff3d6', '#5a2d14', s1 * 0.22);
      if (h2) { const s2 = fitFont(ctx, h2, 84, W - 140, 900); ctx.save(); ctx.translate(6, 6); strokeFill(ctx, h2, W / 2, 230, '#5a2d14', '#5a2d14', s2 * 0.24); ctx.restore(); strokeFill(ctx, h2, W / 2, 230, skin.hl, '#5a2d14', s2 * 0.24); }
    });
  },
  /** 竖排大字（港风、国风）：右边一竖行 + 小一号的一竖行 + 印章 */
  vertical(F) {
    const { ctx, skin, look } = F; const [h1, h2] = H12(F); const a = ap(F, 0.2, 0.8);
    const ink = look.vInk || '#ffffff'; const x = W - 110; const y0 = 200;
    ctx.save(); ctx.globalAlpha = a;
    const main = h2 || h1; const n = [...main].length; const size = Math.min(86, Math.floor(1100 / Math.max(1, n) / 1.08));
    if (look.vShadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14; }
    vText(ctx, main, x, y0 + size / 2, size, ink, { stroke: look.vStroke || 0, strokeColor: '#000' });
    ctx.shadowColor = 'transparent';
    if (h2 && h1) { const n1 = [...h1].length; const s1 = Math.min(44, Math.floor(900 / Math.max(1, n1) / 1.1)); vText(ctx, h1, x - size * 0.5 - s1 * 0.9, y0 + 40 + s1 / 2, s1, look.vInk2 || ink, { weight: 700 }); }
    // 印章
    const sy = y0 + n * size * 1.08 + 30; const seal = [...(F.account || '实拍')].slice(0, 2).join('');
    ctx.fillStyle = '#c0362c'; rr(ctx, x - 38, sy, 76, 76, 8); ctx.fill(); font(ctx, seal.length > 1 ? 30 : 44, 900); ctx.fillStyle = '#fbeee0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (seal.length > 1) { ctx.fillText(seal[0], x, sy + 22); ctx.fillText(seal[1], x, sy + 56); } else ctx.fillText(seal, x, sy + 40);
    ctx.restore();
  },
  /** 泡泡：小药丸 + 花字 */
  bubble(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F);
    withPop(ctx, pop(F.t, 0.1, 0.3), W / 2, 130, () => {
      fitFont(ctx, h1, 44, W - 300, 900); const w = ctx.measureText(h1).width + 70;
      ctx.fillStyle = '#ffffff'; rr(ctx, W / 2 - w / 2, 92, w, 80, 40); ctx.fill(); ctx.fillStyle = skin.chip2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h1, W / 2, 134);
    });
    if (h2) withPop(ctx, pop(F.t, 0.3, 0.3), W / 2, 250, () => { ctx.save(); ctx.translate(W / 2, 250 + Math.sin(F.t * 3) * 4); ctx.rotate(-0.03); flowerText(ctx, h2, 0, 0, fitFont(ctx, h2, 92, W - 160, 900), '#ffffff', skin.chip1); ctx.restore(); });
  },
  /** 撞色：黑框白底 + 亮色框，硬阴影 */
  brutal(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F);
    const box = (txt, x, y, size, bg, s, rot) => withPop(ctx, s, x + 200, y, () => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      fitFont(ctx, txt, size, W - 200, 900); const w = ctx.measureText(txt).width + 56; const h = size + 36;
      ctx.fillStyle = '#000'; ctx.fillRect(10, -h / 2 + 10, w, h); ctx.fillStyle = bg; ctx.fillRect(0, -h / 2, w, h); ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeRect(0, -h / 2, w, h);
      ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 28, 3); ctx.restore();
    });
    box(h1, 56, 130, 50, '#ffffff', pop(F.t, 0.1, 0.3), -0.02);
    if (h2) box(h2, 80, 236, 72, skin.hl, pop(F.t, 0.3, 0.3), 0.015);
  },
  /** 直播间：置顶公告卡 */
  notice(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const e = easeOut(clamp((F.t - 0.4) / 0.4)); if (e <= 0) return;
    const txt = `${h1}${h2 ? ' · ' + h2 : ''}`;
    ctx.save(); ctx.globalAlpha = e; ctx.translate((1 - e) * -100, 0);
    font(ctx, 40, 900); const tw = Math.min(W - 230, ctx.measureText(txt).width); const w = tw + 150;
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; rr(ctx, 40, 230, w, 92, 22); ctx.fill();
    ctx.fillStyle = skin.hl; rr(ctx, 56, 248, 72, 56, 12); ctx.fill(); font(ctx, 28, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('公告', 92, 277);
    fitFont(ctx, txt, 40, tw, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt, 146, 278);
    ctx.restore();
  },
  /** 极简：左对齐，小灰字 + 黑粗字 */
  clean(F) {
    const { ctx } = F; const [h1, h2] = H12(F); const a = ap(F, 0.1, 0.5);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fitFont(ctx, h1, 34, W - 300, 700, 2); ctx.fillStyle = '#8c8a85'; ctx.fillText(h1, 120, 200); ctx.letterSpacing = '0px';
    if (h2) { fitFont(ctx, h2, 60, W - 240, 900); ctx.fillStyle = '#141414'; ctx.fillText(h2, 120, 270); }
    ctx.restore();
  },
  /** 科技：// 注释 + 白字 + 青色下划线 */
  hud(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F, 0.1, 0.4);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fitFont(ctx, '// ' + h1, 36, W - 160, 700); ctx.fillStyle = skin.hl; ctx.fillText('// ' + h1, 70, 150);
    if (h2) { const s = fitFont(ctx, h2, 72, W - 140, 900); const w = ctx.measureText(h2).width; ctx.fillStyle = '#ffffff'; ctx.fillText(h2, 70, 236); ctx.fillStyle = skin.hl; ctx.fillRect(70, 236 + s * 0.62, w * easeOut(clamp((F.t - 0.4) / 0.6)), 6); }
    ctx.restore();
  },
  /** 时间轴：灰字 + 黑粗字 + 彩点 */
  tl(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const a = ap(F, 0.1, 0.5);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fitFont(ctx, h1, 36, W - 200, 700); ctx.fillStyle = '#7b8494'; ctx.fillText(h1, 100, 120);
    if (h2) { fitFont(ctx, h2, 66, W - 180, 900); ctx.fillStyle = '#121826'; ctx.fillText(h2, 100, 196); }
    ctx.fillStyle = skin.chip1; ctx.beginPath(); ctx.arc(70, 120, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  /** 九宫格：顶上一条黑带 */
  grid(F) {
    const { ctx, skin } = F; const [h1, h2] = H12(F); const e = easeOut(clamp((F.t - 0.1) / 0.4));
    ctx.save(); ctx.beginPath(); ctx.rect(0, 120, W * e, 210); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(0, 120, W, 210);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, h1, 46, W - 160, 900); ctx.fillStyle = '#fff'; ctx.fillText(h1, W / 2, 180);
    if (h2) { fitFont(ctx, h2, 70, W - 140, 900); ctx.fillStyle = skin.hl; ctx.fillText(h2, W / 2, 268); }
    ctx.restore();
  },
  /** 卡片：顶上两行深色字 + 表情 */
  card(F) {
    const { ctx, tEmoji } = F; const [h1, h2] = H12(F); const a = ap(F, 0.1, 0.5);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * -20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, h1, 42, W - 240, 700); ctx.fillStyle = '#3b4252'; ctx.fillText(h1, W / 2, 130);
    if (h2) { fitFont(ctx, h2, 74, W - 200, 900); ctx.fillStyle = '#1d2230'; ctx.fillText(h2, W / 2, 218); }
    if (tEmoji) { ctx.font = `64px ${EMOJI_FONT}`; ctx.fillText(tEmoji[0], W - 90, 130 + Math.sin(F.t * 3) * 6); }
    ctx.restore();
  },
};

// =====================================================================
// 字幕：SUBS[id](F, ln, li)，ln = 当前这句 {text,start,end}
// =====================================================================
const keysOf = (F) => F.s?.key;
export const SUBS = {
  none() {},
  /** 卡点：屏幕正中，一句拆成几小截，一截一截砸出来 */
  giant(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const parts = chunk(text.replace(/[\s「」“”"《》]/g, ''), 4); const dur = Math.max(0.4, ln.end - ln.start);
    const k = Math.min(parts.length - 1, Math.floor(((F.t - ln.start) / dur) * parts.length));
    const part = parts[Math.max(0, k)]; const t0 = ln.start + (dur * Math.max(0, k)) / parts.length;
    const e = clamp((F.t - t0) / 0.14); const sc = 1.45 - 0.45 * easeOut(e);
    const keys = keysOf(F) || []; const hot = keys.some((kk) => part.includes(kk) || kk.includes(part));
    ctx.save(); ctx.translate(W / 2, F.look.subY); ctx.scale(sc, sc); ctx.rotate((k % 2 ? 1 : -1) * 0.03);
    const s = fitFont(ctx, part, 150, W - 140, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = clamp(e * 3);
    strokeFill(ctx, part, 0, 0, hot ? skin.hl : '#ffffff', '#000', s * 0.2);
    ctx.restore();
  },
  /** 黑底白字框（经典框字幕） */
  boxed(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 58, maxW: W - 200 }); const lh = L.s * 1.5; const y = F.look.subY;
    const e = easeOut(clamp((F.t - ln.start) / 0.15));
    L.rows.forEach((_, ri) => { const yy = y + ri * lh - ((L.rows.length - 1) * lh) / 2; const w = L.rowsW[ri] + 56; ctx.fillStyle = `rgba(0,0,0,${0.86 * e})`; ctx.fillRect(W / 2 - w / 2, yy - L.s * 0.72, w, L.s * 1.44); });
    ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y: y + 3, lh, draw: (c, x, yy) => { ctx.fillStyle = c.key ? skin.hl : '#fff'; ctx.textAlign = 'left'; ctx.fillText(c.ch, x, yy); } });
    ctx.globalAlpha = 1;
  },
  /** 斜体带错位影子 */
  shadowItalic(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    font(ctx, 66, 900); const rows = subRows(ctx, markKeys(text, keysOf(F)), W - 180);
    const e = easeOut(clamp((F.t - ln.start) / 0.18));
    rows.forEach((r, ri) => {
      const s = r.map((c) => c.ch).join(''); const y = F.look.subY + ri * 92 - ((rows.length - 1) * 92) / 2;
      const size = fitSlant(ctx, s, 66, W - 160); const hot = r.some((c) => c.key);
      ctx.save(); ctx.globalAlpha = e; ctx.translate((1 - e) * (ri % 2 ? 80 : -80), 0);
      slantText(ctx, s, W / 2 + 8, y + 8, size, skin.chip1); slantText(ctx, s, W / 2, y, size, hot ? skin.hl : '#ffffff', { stroke: size * 0.12, strokeColor: '#000' });
      ctx.restore();
    });
  },
  /** 漫画对话框：白底黑边，带个小尖角 */
  speech(F, ln, li) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 54, maxW: W - 260 }); const lh = L.s * 1.3;
    const w = Math.max(...L.rowsW) + 100; const h = L.rows.length * lh + 60; const y = F.look.subY; const x = W / 2 - w / 2;
    const s = pop(F.t, ln.start, 0.22); if (s <= 0) return;
    const left = li % 2 === 0;
    withPop(ctx, s, W / 2, y, () => {
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 7;
      rr(ctx, x, y - h / 2, w, h, h / 2.4); ctx.fill(); ctx.stroke();
      const tx = left ? x + w * 0.25 : x + w * 0.75;
      ctx.beginPath(); ctx.moveTo(tx - 26, y - h / 2 + 3); ctx.lineTo(tx + (left ? -40 : 40), y - h / 2 - 60); ctx.lineTo(tx + 26, y - h / 2 + 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 26, y - h / 2); ctx.lineTo(tx + (left ? -40 : 40), y - h / 2 - 60); ctx.lineTo(tx + 26, y - h / 2); ctx.stroke();
      ctx.textBaseline = 'middle';
      eachChar(ctx, L, { y: y + 3, lh, draw: (c, cx, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.chip1 : '#111'; ctx.fillText(c.ch, cx, yy); } });
    });
  },
  /** 种草笔记：白底黑字正文，左对齐，关键词荧光笔 */
  note(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 58, weight: 700, maxW: W - 140, flow: 3, min: 40 });
    const e = easeOut(clamp((F.t - ln.start) / 0.25)); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { x0: 70, y: F.noteTop ?? F.look.subY, lh: L.s * 1.5, align: 'left', weight: 700, draw: (c, x, yy, cw, ci, sz) => {
      if (c.key) { ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.55; ctx.fillRect(x - 1, yy + sz * 0.05, cw + 2, sz * 0.42); ctx.globalAlpha = e; }
      ctx.fillStyle = '#23262d'; ctx.textAlign = 'left'; ctx.fillText(c.ch, x, yy);
    } });
    ctx.globalAlpha = 1;
  },
  /** 动态：卡片里图下面的配文 */
  caption(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const y = (F.postY ?? 290) + 160 + (W - 60) + 80;
    const L = lay(ctx, text, keysOf(F), { size: 44, weight: 700, maxW: W - 160, flow: 2, min: 34 });
    const e = easeOut(clamp((F.t - ln.start) / 0.25)); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { x0: 70, y, lh: L.s * 1.45, align: 'left', weight: 700, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.chip1 : '#23262d'; ctx.fillText(c.ch, x, yy); } });
    ctx.globalAlpha = 1;
  },
  /** 手帐：深色手写感字，关键词下面一道波浪线 */
  hand(F, ln, li) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 56, weight: 700, maxW: W - 180 }); const y = F.look.subY;
    ctx.save(); ctx.translate(W / 2, y); ctx.rotate(li % 2 ? 0.015 : -0.02); ctx.translate(-W / 2, -y);
    ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y, lh: L.s * 1.4, weight: 700, draw: (c, x, yy, cw, ci) => {
      const a = clamp((F.t - ln.start - ci * 0.03) / 0.15); if (a <= 0) return;
      ctx.globalAlpha = a; ctx.fillStyle = c.key ? skin.chip1 : '#2b211b'; ctx.textAlign = 'left'; ctx.fillText(c.ch, x, yy + (1 - a) * 8);
      if (c.key) { ctx.strokeStyle = skin.chip1; ctx.lineWidth = 4; ctx.beginPath(); for (let k = 0; k <= 6; k++) { const xx = x + (cw * k) / 6; const y2 = yy + L.s * 0.6 + Math.sin(k * 1.6 + ci) * 4; k ? ctx.lineTo(xx, y2) : ctx.moveTo(xx, y2); } ctx.stroke(); }
    } });
    ctx.restore(); ctx.globalAlpha = 1;
  },
  /** 美术馆：深色细字，字距开，上面一道细线 */
  elegant(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 44, weight: 700, maxW: W - 200, spacing: 4 });
    const e = clamp((F.t - ln.start) / 0.4); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2a251f'; ctx.fillRect(W / 2 - 20, F.look.subY - L.s * (L.rows.length > 1 ? 1.5 : 1) - 26, 40, 2);
    eachChar(ctx, L, { y: F.look.subY, lh: L.s * 1.55, weight: 700, spacing: 4, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.cardInk : '#2a251f'; ctx.fillText(c.ch, x, yy); } });
    ctx.globalAlpha = 1;
  },
  /** 报纸：粗黑字“引语框”，上下两道粗线 */
  pull(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 58, maxW: W - 180 }); const lh = L.s * 1.3; const y = F.look.subY;
    const h = L.rows.length * lh + 50; const e = easeOut(clamp((F.t - ln.start) / 0.2));
    ctx.fillStyle = '#16130f'; ctx.fillRect(60, y - h / 2, (W - 120) * e, 8); ctx.fillRect(W - 60 - (W - 120) * e, y + h / 2 - 8, (W - 120) * e, 8);
    ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y: y + 2, lh, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.chip1 : '#16130f'; ctx.fillText(c.ch, x, yy); } });
    ctx.globalAlpha = 1;
  },
  /** 电影 / 港片：暖黄色字幕，细黑边 */
  film(F, ln) {
    const { ctx, look } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: look.subSize || 52, weight: 700, maxW: W - 180, spacing: 2 });
    ctx.globalAlpha = clamp((F.t - ln.start) / 0.2); ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y: look.subY, lh: L.s * 1.4, weight: 700, spacing: 2, draw: (c, x, yy, cw, ci, sz) => { ctx.textAlign = 'left'; strokeFill(ctx, c.ch, x, yy, c.key ? (look.subKey || '#ffffff') : (look.subInk || '#ffd65a'), 'rgba(0,0,0,0.9)', sz * 0.14); } });
    ctx.globalAlpha = 1;
  },
  /** 纪录片：小一号白字，柔和投影 */
  doc(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 46, weight: 700, maxW: W - 200 });
    ctx.save(); ctx.globalAlpha = clamp((F.t - ln.start) / 0.3); ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2;
    eachChar(ctx, L, { y: F.look.subY, lh: L.s * 1.45, weight: 700, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, x, yy); } });
    ctx.restore();
  },
  /** 黑白：左对齐大白字，最多 3 行，上面一个小序号 */
  monoBig(F, ln, li) {
    const { ctx } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 76, maxW: W - 170, flow: 3, min: 50 });
    const e = easeOut(clamp((F.t - ln.start) / 0.3)); const y = F.look.subY;
    ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 24); ctx.textBaseline = 'middle';
    font(ctx, 30, 700, 6); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'left'; ctx.fillText(`— ${String(F.idx + 1).padStart(2, '0')}.${li + 1}`, 84, y - 90); ctx.letterSpacing = '0px';
    eachChar(ctx, L, { x0: 84, y, lh: L.s * 1.32, align: 'left', draw: (c, x, yy, cw, ci, sz) => {
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.fillText(c.ch, x, yy);
      if (c.key) { ctx.fillRect(x, yy + sz * 0.58, cw, 5); }
    } });
    ctx.restore();
  },
  /** 黑粗字，居中，关键词换色（浅底用） */
  dark(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 56, maxW: W - 160 });
    const e = easeOut(clamp((F.t - ln.start) / 0.2)); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y: F.look.subY + (1 - e) * 14, lh: L.s * 1.35, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.chip1 : (F.look.subInk || '#16140f'); ctx.fillText(c.ch, x, yy); } });
    ctx.globalAlpha = 1;
  },
  /** 复古：黄字 + 粗棕边 */
  retro(F, ln) {
    const { ctx } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 60, maxW: W - 160 });
    const s = pop(F.t, ln.start, 0.2); ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(W / 2, F.look.subY); ctx.scale(Math.max(0.01, s), Math.max(0.01, s)); ctx.translate(-W / 2, -F.look.subY);
    eachChar(ctx, L, { y: F.look.subY, lh: L.s * 1.3, draw: (c, x, yy, cw, ci, sz) => { ctx.textAlign = 'left'; strokeFill(ctx, c.ch, x, yy, c.key ? '#ff8a3d' : '#ffe066', '#4a2410', sz * 0.26); } });
    ctx.restore();
  },
  /** 白色药丸底 + 深色字 */
  pill(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 52, maxW: W - 220 }); const lh = L.s * 1.35;
    const w = Math.max(...L.rowsW) + 90; const h = L.rows.length * lh + 46; const y = F.look.subY;
    withPop(ctx, pop(F.t, ln.start, 0.22), W / 2, y, () => {
      ctx.shadowColor = 'rgba(80,40,90,0.25)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff'; rr(ctx, W / 2 - w / 2, y - h / 2, w, h, Math.min(h / 2, 56)); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.textBaseline = 'middle';
      eachChar(ctx, L, { y: y + 2, lh, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.chip1 : '#2b2540'; ctx.fillText(c.ch, x, yy); } });
    });
  },
  /** 撞色：白框黑边硬阴影 */
  brutal(F, ln, li) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 54, maxW: W - 220 }); const lh = L.s * 1.35;
    const w = Math.max(...L.rowsW) + 70; const h = L.rows.length * lh + 40; const y = F.look.subY;
    withPop(ctx, pop(F.t, ln.start, 0.2), W / 2, y, () => {
      ctx.save(); ctx.translate(W / 2, y); ctx.rotate(li % 2 ? 0.012 : -0.012); ctx.translate(-W / 2, -y);
      ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - w / 2 + 12, y - h / 2 + 12, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - w / 2, y - h / 2, w, h); ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeRect(W / 2 - w / 2, y - h / 2, w, h);
      ctx.textBaseline = 'middle';
      eachChar(ctx, L, { y: y + 2, lh, draw: (c, x, yy, cw, ci, sz) => { if (c.key) { ctx.fillStyle = skin.hl; ctx.fillRect(x - 2, yy - sz * 0.55, cw + 4, sz * 1.1); } ctx.textAlign = 'left'; ctx.fillStyle = '#000'; ctx.fillText(c.ch, x, yy); } });
      ctx.restore();
    });
  },
  /** 直播间：左下角滚动的“主播说”消息（最近 3 句） */
  live(F) {
    const { ctx, skin, tl, t } = F;
    const all = tl.sections.flatMap((s) => s.lines).filter((l) => l.start <= t + 0.01).slice(-4);
    let y = F.look.subY; const items = [];
    for (let k = all.length - 1; k >= 0; k--) items.push(all[k]);
    items.forEach((ln, j) => {
      const text = cleanSub(ln.text); if (!text) return;
      const fs = j === 0 ? 50 : 38; const lh = fs * 1.36;
      font(ctx, fs, 900); const rows = wrap(ctx, text, j === 0 ? 700 : 640, 2); const h = rows.length * lh + 36;
      const e = j === 0 ? easeOut(clamp((t - ln.start) / 0.25)) : 1;
      const yy = y - h; y = yy - 14;
      const a = j === 0 ? e : Math.max(0, 0.85 - j * 0.25);
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - e) * -60, (1 - e) * 30);
      const w = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 160;
      ctx.fillStyle = j === 0 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.32)'; rr(ctx, 40, yy, Math.min(w, 900), h, 26); ctx.fill();
      font(ctx, fs * 0.8, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('主播', 64, yy + 18 + lh / 2);
      font(ctx, fs, 900); ctx.fillStyle = '#fff'; rows.forEach((r, k) => ctx.fillText(r, 64 + fs * 1.9, yy + 20 + lh / 2 + k * lh));
      ctx.restore();
    });
  },
  /** 极简：左对齐黑字，最多 2 行 */
  clean(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 48, weight: 700, maxW: W - 240, flow: 2, min: 36 });
    const e = easeOut(clamp((F.t - ln.start) / 0.3)); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { x0: F.look.subX || 120, y: F.look.subY, lh: L.s * 1.5, align: 'left', weight: 700, draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.chip1 : '#141414'; ctx.fillText(c.ch, x, yy + (1 - e) * 10); } });
    ctx.globalAlpha = 1;
  },
  /** 科技：> 打字机 + 光标 */
  terminal(F, ln) {
    const { ctx, skin } = F; const text = '> ' + cleanSub(ln.text); if (text.length <= 2) return;
    const L = lay(ctx, text, keysOf(F), { size: 50, weight: 700, maxW: W - 160, flow: 2, min: 36 });
    const dur = Math.max(0.3, ln.end - ln.start); const n = Math.floor(clamp((F.t - ln.start) / Math.min(dur * 0.6, L.n * 0.05)) * L.n);
    let cur = null; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { x0: 80, y: F.look.subY, lh: L.s * 1.5, align: 'left', weight: 700, draw: (c, x, yy, cw, ci, sz) => { if (ci >= n) return; ctx.textAlign = 'left'; ctx.fillStyle = c.key ? '#ffffff' : skin.hl; ctx.fillText(c.ch, x, yy); cur = [x + cw + 6, yy, sz]; } });
    if (cur && Math.floor(F.t * 3) % 2 === 0) { ctx.fillStyle = skin.hl; ctx.fillRect(cur[0], cur[1] - cur[2] * 0.45, cur[2] * 0.5, cur[2] * 0.9); }
  },
  /** 画面上：白字粗黑边，不砸字，整句淡入 */
  stroke(F, ln) {
    const { ctx, skin } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 66, maxW: W - 140, keyScale: 1.1 });
    const e = easeOut(clamp((F.t - ln.start) / 0.18)); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y: F.look.subY + (1 - e) * 20, lh: L.s * 1.3, size: (c) => (c.key ? L.s * 1.1 : L.s), draw: (c, x, yy, cw, ci, sz) => { ctx.textAlign = 'left'; strokeFill(ctx, c.ch, x, yy, c.key ? skin.hl : '#fff', '#000', sz * 0.2); } });
    ctx.globalAlpha = 1;
  },
  /** 竖条文字栏里：左对齐，最多 5 行 */
  column(F, ln) {
    const { ctx, skin, look } = F; const text = cleanSub(ln.text); if (!text) return;
    const colX = F.colX ?? 0; const L = lay(ctx, text, keysOf(F), { size: 46, weight: 900, maxW: 330, flow: 5, min: 34 });
    const e = easeOut(clamp((F.t - ln.start) / 0.3)); ctx.globalAlpha = e; ctx.textBaseline = 'middle';
    eachChar(ctx, L, { x0: colX + 40, y: look.subY, lh: L.s * 1.4, align: 'left', draw: (c, x, yy) => { ctx.textAlign = 'left'; ctx.fillStyle = c.key ? skin.hl : (F.colInk || '#fff'); ctx.fillText(c.ch, x, yy + (1 - e) * 12); } });
    ctx.globalAlpha = 1;
  },
  /** 国风：墨色字，字距开，关键词朱红 */
  ink(F, ln) {
    const { ctx } = F; const text = cleanSub(ln.text); if (!text) return;
    const L = lay(ctx, text, keysOf(F), { size: 52, weight: 700, maxW: W - 220, spacing: 6 });
    const e = clamp((F.t - ln.start) / 0.45); ctx.textBaseline = 'middle';
    eachChar(ctx, L, { y: F.look.subY, lh: L.s * 1.55, weight: 700, spacing: 6, draw: (c, x, yy, cw, ci) => { const a = clamp(e * 1.6 - ci * 0.04); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.fillStyle = c.key ? '#b8322a' : '#2f2118'; ctx.fillText(c.ch, x, yy); } });
    ctx.globalAlpha = 1;
  },
};

// =====================================================================
// 大字画面：讲观点的镜头，不放素材（或只放一点），字就是画面
// TYPES[id](F, parts, at)：parts 是要显示的几段字，at(k) 是第 k 段出现的时间
// =====================================================================
const rowsOf = (parts, n) => parts.flatMap((s, k) => chunk(s, n).map((r) => [r, k]));
export const TYPES = {
  /** 卡点：一拍一换底色，大字一行行跳 */
  flash(F, parts, at) {
    const { ctx, skin, t } = F; const beat = F.beatLen || 0.5;
    const n = Math.floor(Math.max(0, t - F.p.start) / beat); const flip = n % 2;
    ctx.fillStyle = flip ? skin.hl : '#0a0a0a'; ctx.fillRect(0, 0, W, H);
    const rows = rowsOf(parts, 5); const lh = 210; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, k], j) => {
      const t0 = at(k) + j * 0.1; if (t < t0) return;
      const e = clamp((t - t0) / 0.12); const s = fitFont(ctx, r, 190, W - 100, 900);
      ctx.save(); ctx.translate(W / 2, y0 + j * lh); ctx.scale(1.6 - 0.6 * easeOut(e), 1.6 - 0.6 * easeOut(e)); ctx.globalAlpha = clamp(e * 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; strokeFill(ctx, r, 0, 0, flip ? '#0a0a0a' : (k % 2 ? skin.hl : '#fff'), flip ? skin.hl : '#000', s * 0.06);
      ctx.restore();
    });
  },
  /** 斜切：一半亮色一半黑，斜大字 */
  slash(F, parts, at) {
    const { ctx, skin, t } = F; const e0 = easeOut(clamp((t - F.p.start) / 0.3));
    ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = skin.chip1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * e0, 0); ctx.lineTo(W * e0 - 500, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.moveTo(W * e0, 0); ctx.lineTo(W * e0 + 24, 0); ctx.lineTo(W * e0 - 476, H); ctx.lineTo(W * e0 - 500, H); ctx.closePath(); ctx.fill();
    const rows = rowsOf(parts, 6); const lh = 180; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, k], j) => {
      const a = easeOut(clamp((t - at(k) - j * 0.1) / 0.25)); if (a <= 0) return;
      const s = fitSlant(ctx, r, 160, W - 120);
      ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - a) * (j % 2 ? 300 : -300), 0);
      slantText(ctx, r, W / 2 + 10, y0 + j * lh + 10, s, '#000'); slantText(ctx, r, W / 2, y0 + j * lh, s, k % 2 ? skin.hl : '#fff');
      ctx.restore();
    });
  },
  /** 漫画：爆炸框 */
  pow(F, parts, at) {
    const { ctx, skin, t } = F;
    ctx.save(); ctx.translate(W / 2, 960); ctx.rotate(t * 0.15);
    for (let k = 0; k < 20; k++) { ctx.fillStyle = k % 2 ? '#ffd400' : '#ffb300'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1500, (k * Math.PI) / 10, ((k + 1) * Math.PI) / 10); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    const s0 = pop(t, F.p.start + 0.1, 0.35);
    if (s0 > 0) {
      ctx.save(); ctx.translate(W / 2, 960); ctx.scale(s0, s0); ctx.rotate(-0.05);
      ctx.beginPath(); for (let k = 0; k < 28; k++) { const r = k % 2 ? 430 : 560; const a = (k * Math.PI) / 14; k ? ctx.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 0.95) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
      ctx.fillStyle = '#000'; ctx.save(); ctx.translate(16, 16); ctx.fill(); ctx.restore(); ctx.fillStyle = skin.chip1; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.restore();
    }
    const rows = rowsOf(parts, 5); const lh = 160; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, k], j) => {
      const s = pop(t, at(k) + j * 0.12, 0.25); if (s <= 0) return;
      ctx.save(); ctx.translate(W / 2, y0 + j * lh); ctx.scale(s, s); ctx.rotate((j % 2 ? 1 : -1) * 0.04);
      const sz = fitFont(ctx, r, 140, 820, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      strokeFill(ctx, r, 0, 0, k % 2 ? '#ffd400' : '#ffffff', '#000', sz * 0.2);
      ctx.restore();
    });
  },
  /** 撞色：一块块黑字白框叠起来 */
  brutal(F, parts, at) {
    const { ctx, skin, t } = F;
    ctx.fillStyle = skin.hl; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 60; y < H; y += 120) for (let x = 60; x < W; x += 120) { ctx.fillRect(x - 10, y - 2, 20, 4); ctx.fillRect(x - 2, y - 10, 4, 20); }
    const rows = rowsOf(parts, 6); const lh = 190; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, k], j) => {
      const s = pop(t, at(k) + j * 0.12, 0.25); if (s <= 0) return;
      const sz = fitFont(ctx, r, 120, W - 220, 900); const w = ctx.measureText(r).width + 80; const h = sz + 50;
      ctx.save(); ctx.translate(W / 2, y0 + j * lh); ctx.scale(s, s); ctx.rotate((j % 2 ? 1 : -1) * 0.025);
      ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 16, -h / 2 + 16, w, h); ctx.fillStyle = k % 2 ? skin.chip1 : '#fff'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r, 0, 4);
      ctx.restore();
    });
  },
  /** 便签纸：横线纸 + 胶带 + 手写感大字 */
  paper(F, parts, at) {
    const { ctx, skin, t } = F;
    const e = easeOut(clamp((t - F.p.start) / 0.35)); const x = 110; const y = 520; const w = W - 220; const h = 880;
    ctx.save(); ctx.translate(W / 2, y + h / 2 + (1 - e) * 80); ctx.rotate(-0.025 + (1 - e) * 0.1); ctx.translate(-W / 2, -(y + h / 2)); ctx.globalAlpha = e;
    ctx.shadowColor = 'rgba(60,40,20,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; ctx.fillStyle = '#fffdf6'; ctx.fillRect(x, y, w, h); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(80,140,200,0.25)'; ctx.lineWidth = 2; for (let yy = y + 120; yy < y + h - 20; yy += 80) { ctx.beginPath(); ctx.moveTo(x + 30, yy); ctx.lineTo(x + w - 30, yy); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(230,80,80,0.35)'; ctx.beginPath(); ctx.moveTo(x + 110, y); ctx.lineTo(x + 110, y + h); ctx.stroke();
    ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.75; ctx.save(); ctx.translate(W / 2, y + 4); ctx.rotate(0.04); ctx.fillRect(-120, -28, 240, 56); ctx.restore(); ctx.globalAlpha = e;
    const rows = rowsOf(parts, 7);
    rows.forEach(([r, k], j) => {
      const a = clamp((t - at(k) - j * 0.15) / 0.3); if (a <= 0) return;
      fitFont(ctx, r, 96, w - 200, 900); ctx.fillStyle = k % 2 ? skin.chip1 : '#2b211b'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.save(); ctx.beginPath(); ctx.rect(x + 140, y, (w - 160) * easeOut(a), h); ctx.clip(); ctx.fillText(r, x + 140, y + 270 + j * 160); ctx.restore();
    });
    ctx.restore();
  },
  /** 报纸号外：红色大印 + 黑粗字 */
  extra(F, parts, at) {
    const { ctx, skin, t } = F;
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, W, H); grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.12, 'multiply');
    ctx.fillStyle = '#16130f'; ctx.fillRect(60, 300, W - 120, 10); ctx.fillRect(60, 322, W - 120, 3);
    const s0 = clamp((t - F.p.start - 0.05) / 0.25);
    if (s0 > 0) { ctx.save(); ctx.translate(W / 2, 520); ctx.rotate(-0.06); ctx.scale(2 - easeOut(s0), 2 - easeOut(s0)); ctx.globalAlpha = s0 * 0.9; font(ctx, 200, 900); ctx.fillStyle = skin.chip1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('号外', 0, 0); ctx.lineWidth = 12; ctx.strokeStyle = skin.chip1; ctx.strokeRect(-260, -130, 520, 260); ctx.restore(); }
    const rows = rowsOf(parts, 7); const lh = 150;
    rows.forEach(([r, k], j) => {
      const a = easeOut(clamp((t - at(k) - j * 0.1) / 0.3)); if (a <= 0) return;
      ctx.globalAlpha = a; fitFont(ctx, r, k ? 88 : 120, W - 160, 900); ctx.fillStyle = '#16130f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r, W / 2, 860 + j * lh + (1 - a) * 20);
    });
    ctx.globalAlpha = 1; ctx.fillStyle = '#16130f'; ctx.fillRect(60, 1620, W - 120, 3); ctx.fillRect(60, 1634, W - 120, 10);
  },
  /** 胶片片头：倒数圆圈 + 十字线 */
  leader(F, parts, at) {
    const { ctx, skin, t } = F; const k = (t - F.p.start) % 1;
    ctx.fillStyle = '#1a140e'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(243,230,204,0.4)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 960); ctx.lineTo(W, 960); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, 960, 380, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(W / 2, 960, 330, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(243,230,204,0.12)'; ctx.beginPath(); ctx.moveTo(W / 2, 960); ctx.arc(W / 2, 960, 380, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.closePath(); ctx.fill();
    const rows = rowsOf(parts, 7); const lh = 120; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, kk], j) => {
      const a = clamp((t - at(kk) - j * 0.15) / 0.35); if (a <= 0) return;
      ctx.globalAlpha = a * (0.9 + 0.1 * Math.sin(t * 40)); fitFont(ctx, r, kk ? 70 : 92, 640, 900, 4); ctx.fillStyle = kk ? skin.hl : '#f3e6cc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r, W / 2, y0 + j * lh); ctx.letterSpacing = '0px';
    });
    ctx.globalAlpha = 1; grain(ctx, { x: 0, y: 0, w: W, h: H }, t, 0.16);
  },
  /** 黑白：黑底左对齐巨字 + 细线 */
  mono(F, parts, at) {
    const { ctx, skin, t } = F;
    ctx.fillStyle = F.look.typeBg || '#000'; ctx.fillRect(0, 0, W, H);
    const ink = F.look.typeInk || '#fff';
    const rows = rowsOf(parts, 5); const lh = 170; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    const e0 = easeOut(clamp((t - F.p.start) / 0.5));
    ctx.fillStyle = ink; ctx.fillRect(84, y0 - 150, 300 * e0, 4);
    rows.forEach(([r, k], j) => {
      const a = easeOut(clamp((t - at(k) - j * 0.12) / 0.35)); if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 30);
      fitFont(ctx, r, 150, W - 160, 900); ctx.fillStyle = k % 2 ? skin.hl : ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(r, 80, y0 + j * lh);
      ctx.restore();
    });
    ctx.fillStyle = ink; ctx.fillRect(W - 384, y0 + (rows.length - 1) * lh + 130, 300 * e0, 4);
  },
  /** 文字镂空：满屏大字，字里透出画面 */
  mask(F, parts, at) {
    const { ctx, t } = F; const it = F.sc.items[0];
    ctx.fillStyle = '#f2efe9'; ctx.fillRect(0, 0, W, H);
    const rows = rowsOf(parts, 4); const lh = 250; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    const img = imageOf(it, t);
    rows.forEach(([r, k], j) => {
      const a = easeOut(clamp((t - at(k) - j * 0.1) / 0.35)); if (a <= 0) return;
      const sz = fitFont(ctx, r, 250, W - 80, 900);
      maskedText(ctx, r, W / 2, y0 + j * lh + (1 - a) * 40, sz, img, a, F.look.grade, t);
    });
  },
  /** 美术馆：墙上一段引言 */
  museum(F, parts, at) {
    const { ctx, t } = F;
    const rows = rowsOf(parts, 9); const lh = 120; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    const e0 = clamp((t - F.p.start) / 0.6);
    ctx.globalAlpha = e0; font(ctx, 260, 900); ctx.fillStyle = 'rgba(42,37,31,0.12)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('“', W / 2, y0 - 170);
    rows.forEach(([r, k], j) => {
      const a = clamp((t - at(k) - j * 0.2) / 0.5); if (a <= 0) return;
      ctx.globalAlpha = a; fitFont(ctx, r, k ? 54 : 74, W - 200, k ? 700 : 900, 4); ctx.fillStyle = k ? '#6d655a' : '#2a251f'; ctx.fillText(r, W / 2, y0 + j * lh); ctx.letterSpacing = '0px';
    });
    ctx.globalAlpha = 1;
  },
  /** 老电视：彩条测试图 + 白字 */
  tv(F, parts, at) {
    const { ctx, t } = F; const S = F.screen || { x: 0, y: 0, w: W, h: H };
    const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    ctx.save(); ctx.beginPath(); ctx.roundRect(S.x, S.y, S.w, S.h, S.r || 0); ctx.clip();
    cols.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(S.x + (S.w * k) / 7, S.y, S.w / 7 + 1, S.h * 0.7); });
    ctx.fillStyle = '#111'; ctx.fillRect(S.x, S.y + S.h * 0.7, S.w, S.h * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(S.x, S.y, S.w, S.h);
    const rows = rowsOf(parts, 6); const lh = 110; const cy = S.y + S.h / 2; const y0 = cy - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, k], j) => {
      const s = pop(t, at(k) + j * 0.1, 0.25); if (s <= 0) return;
      ctx.save(); ctx.translate(S.x + S.w / 2, y0 + j * lh); ctx.scale(s, s);
      const sz = fitFont(ctx, r, 96, S.w - 60, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; strokeFill(ctx, r, 0, 0, k % 2 ? '#ffe066' : '#fff', '#000', sz * 0.16);
      ctx.restore();
    });
    ctx.restore();
  },
  /** 竖排大字（港风 / 国风）：中间一竖行，配一竖行小字 */
  vert(F, parts, at) {
    const { ctx, t, look } = F;
    ctx.fillStyle = look.typeBg || '#0c0a08'; ctx.fillRect(0, 0, W, H);
    if (look.typePaper) { grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.06, 'multiply'); }
    const [a, b] = parts; const ink = look.typeInk || '#fff';
    const n = [...(a || '')].length; const size = Math.min(150, Math.floor(1300 / Math.max(1, n) / 1.08));
    const ea = clamp((t - at(0)) / 0.6); const x = b ? W / 2 + 90 : W / 2; const y0 = 960 - (n * size * 1.08) / 2 + size / 2;
    if (a) [...a].forEach((ch, i) => { const al = clamp(ea * n - i); if (al <= 0) return; ctx.globalAlpha = al; vText(ctx, ch, x, y0 + i * size * 1.08, size, ink); });
    if (b) { const nb = [...b].length; const sb = Math.min(70, Math.floor(1100 / Math.max(1, nb) / 1.1)); const eb = clamp((t - at(1)) / 0.6); ctx.globalAlpha = eb; vText(ctx, b, x - size * 0.5 - sb - 40, 960 - (nb * sb * 1.08) / 2 + sb / 2, sb, look.typeInk2 || '#c0362c', { weight: 700 }); }
    ctx.globalAlpha = 1;
  },
  /** 极简：白底左对齐黑字 + 一道红线 */
  clean(F, parts, at) {
    const { ctx, skin, t } = F;
    ctx.fillStyle = F.look.typeBg || '#fafaf8'; ctx.fillRect(0, 0, W, H);
    const rows = rowsOf(parts, 7); const lh = 140; const y0 = 920 - ((rows.length - 1) * lh) / 2;
    font(ctx, 200, 700); ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(F.idx + 1).padStart(2, '0'), W - 80, 520);
    ctx.fillStyle = skin.chip1; ctx.fillRect(120, y0 - 130, 80 * easeOut(clamp((t - F.p.start) / 0.4)), 8);
    rows.forEach(([r, k], j) => {
      const a = easeOut(clamp((t - at(k) - j * 0.1) / 0.35)); if (a <= 0) return;
      ctx.globalAlpha = a; fitFont(ctx, r, k ? 70 : 100, W - 240, 900); ctx.fillStyle = k ? '#6b6a66' : '#141414'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(r, 120, y0 + j * lh + (1 - a) * 16);
    });
    ctx.globalAlpha = 1;
  },
  /** 科技：网格底 + 方括号框住的大字 */
  hud(F, parts, at) {
    const { ctx, skin, t } = F;
    const rows = rowsOf(parts, 6); const lh = 170; const y0 = 960 - ((rows.length - 1) * lh) / 2;
    rows.forEach(([r, k], j) => {
      const a = clamp((t - at(k) - j * 0.1) / 0.3); if (a <= 0) return;
      const sz = fitFont(ctx, r, 120, W - 260, 900); const w = ctx.measureText(r).width + 80; const y = y0 + j * lh; const x = W / 2 - w / 2;
      ctx.strokeStyle = skin.hl; ctx.lineWidth = 6; const L = 30 * a;
      [[x, y - sz * 0.7, 1, 1], [x + w, y - sz * 0.7, -1, 1], [x, y + sz * 0.7, 1, -1], [x + w, y + sz * 0.7, -1, -1]].forEach(([px, py, sx, sy]) => { ctx.beginPath(); ctx.moveTo(px, py + L * sy); ctx.lineTo(px, py); ctx.lineTo(px + L * sx, py); ctx.stroke(); });
      const n = Math.ceil([...r].length * a); ctx.fillStyle = k % 2 ? skin.hl : '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText([...r].slice(0, n).join(''), x + 40, y + 4);
    });
  },
};

/** 文字里透出画面：先画字，再用 source-in 把画面填进字里（小画布上做，不影响主画面） */
let _mask = null;
export function maskedText(ctx, text, cx, cy, size, img, alpha = 1, gradeKind = '', t = 0) {
  const tr = ctx.getTransform(); const sc = Math.max(0.2, Math.hypot(tr.a, tr.b));
  const bw = Math.ceil(W * sc); const bh = Math.ceil(size * 1.4 * sc);
  if (!_mask || _mask.width < bw || _mask.height < bh) _mask = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bw, bh) : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
  const g = _mask.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, _mask.width, _mask.height);
  g.setTransform(sc, 0, 0, sc, 0, 0); g.globalCompositeOperation = 'source-over';
  font(g, size, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#111';
  if (img) {
    // 先铺满画面 + 调色 + 压暗一点，再只留下字的形状
    const B = { x: 0, y: 0, w: W, h: size * 1.4 };
    coverIn(g, img, B, 1.05); if (gradeKind) gradeIt(g, gradeKind, B, t);
    g.fillStyle = 'rgba(20,16,10,0.28)'; g.fillRect(0, 0, W, B.h);
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; g.fillText(text, W / 2, size * 0.7); g.globalCompositeOperation = 'source-over';
  } else g.fillText(text, W / 2, size * 0.7);
  g.lineWidth = Math.max(3, size * 0.018); g.strokeStyle = '#16140f'; g.lineJoin = 'round'; g.strokeText(text, W / 2, size * 0.7);
  ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(_mask, 0, 0, bw, bh, cx - W / 2, cy - size * 0.7, W, size * 1.4); ctx.restore();
}
export { strokeFill, lay, eachChar, H12 };
