// 实拍混剪的零件：小工具 + 贴片（标签、大字、数字卡、步骤、聊天……）
import { W, clamp, easeOut, font, fitFont, wrap, countUp, hash } from '../engine/draw.js';
import { EMOJI_FONT } from './themes.js';

export const SKEW = -0.16;
export const PIXEL_FAMILY = 'Fusion Pixel 12px Proportional Simplified Chinese';
export const PIXEL_FONT = `"${PIXEL_FAMILY}", "Noto Sans SC", sans-serif`;

export const pop = (t, t0, dur = 0.24) => {
  if (t0 == null || t < t0) return 0;
  const k = clamp((t - t0) / dur);
  return k < 0.7 ? easeOut(k / 0.7) * 1.08 : 1.08 - 0.08 * ((k - 0.7) / 0.3);
};
export function withPop(ctx, s, cx, cy, fn) {
  if (s <= 0.001) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.globalAlpha *= clamp(s * 1.6); fn(); ctx.restore();
}
export function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
export function slantText(ctx, text, x, y, size, fill, { align = 'center', stroke = 0, strokeColor = 'rgba(0,0,0,0.85)', squeeze = 0.92 } = {}) {
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
export function fitSlant(ctx, text, size, maxW, squeeze = 0.92) {
  let s = size; font(ctx, s, 900);
  while (s > 20 && ctx.measureText(text).width * squeeze > maxW) { s -= 2; font(ctx, s, 900); }
  return s;
}
export const grad = (ctx, y0, y1, a, b) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
export function pixelFont(ctx, size) { ctx.font = `${size}px ${PIXEL_FONT}`; ctx.letterSpacing = '0px'; }
export function fitPixel(ctx, text, size, maxW) { let s = size; pixelFont(ctx, s); while (s > 16 && ctx.measureText(text).width > maxW) { s -= 4; pixelFont(ctx, s); } return s; }
/** 花字：外白边 + 彩色中边 + 填色 */
export function flowerText(ctx, text, x, y, size, fill, edge, { align = 'center' } = {}) {
  font(ctx, size, 900); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.42; ctx.strokeStyle = '#ffffff'; ctx.strokeText(text, x, y);
  ctx.lineWidth = size * 0.2; ctx.strokeStyle = edge; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// ---------- 贴片 ----------
/** 贴片底板，按版式换质感；返回上面文字该用的颜色 */
export function chipBox(ctx, skin, x, y, w, h, r = 14) {
  switch (skin.chip) {
    case 'flat':
      ctx.fillStyle = skin.chip1; rr(ctx, x, y, w, h, Math.min(r, 8)); ctx.fill();
      return '#ffffff';
    case 'outline':
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x, y, w, h, Math.min(r, 6)); ctx.fill();
      ctx.strokeStyle = skin.hl; ctx.lineWidth = 3; rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.min(r, 6)); ctx.stroke();
      return skin.hl;
    case 'pixel':
      ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = skin.hl; ctx.fillRect(x, y, w, 6); ctx.fillRect(x, y + h - 6, w, 6); ctx.fillRect(x, y, 6, h); ctx.fillRect(x + w - 6, y, 6, h);
      return skin.hl;
    case 'sticker':
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff'; rr(ctx, x - 6, y - 6, w + 12, h + 12, r + 14); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = skin.chip1; rr(ctx, x, y, w, h, r + 8); ctx.fill();
      return '#ffffff';
    default:
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
      ctx.fillStyle = grad(ctx, y, y + h, skin.chip1, skin.chip2); rr(ctx, x, y, w, h, r); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; rr(ctx, x + 6, y + 6, w - 12, h * 0.36, r * 0.6); ctx.fill();
      return '#ffffff';
  }
}
export function drawOverlay(ctx, v, p, t, skin, R, idx, drawInner) {
  const st = p.steps; const cx = W / 2;
  const s0 = st[0] ?? p.start + 0.3;
  const dim = (a) => { if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(R.x, R.y, R.w, R.h); } };
  switch (v.type) {
    case 'hook': { // 开场：小标题 + 大字砸下来
      dim(0.35 * clamp((t - p.start) / 0.3));
      const [l1, l2] = v.lines || [];
      if (l1) withPop(ctx, pop(t, s0), cx, 760, () => {
        const size = fitFont(ctx, l1, 60, W - 220, 900); const w = ctx.measureText(l1).width;
        ctx.fillStyle = skin.hl; ctx.fillRect(cx - w / 2 - 26, 760 - size * 0.64, w + 52, size * 1.28);
        ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l1, cx, 762);
      });
      if (l2 && t >= (st[1] ?? 1e9)) {
        const k = clamp((t - st[1]) / 0.28); const sc = 1.6 - 0.6 * easeOut(k);
        ctx.save(); ctx.translate(cx, 930); ctx.scale(sc, sc); ctx.globalAlpha = clamp(k * 2);
        if (skin.chip === 'sticker') flowerText(ctx, l2, 0, 0, fitFont(ctx, l2, 120, W - 160, 900), '#ffffff', skin.chip2);
        else if (skin.chip === 'pixel') { const s = fitPixel(ctx, l2, 120, W - 120); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(l2, 6, 6); ctx.fillStyle = skin.hl; ctx.fillText(l2, 0, 0); void s; }
        else { const size = fitSlant(ctx, l2, 124, W - 110); slantText(ctx, l2, 0, 0, size, '#ffffff', { stroke: size * 0.16 }); }
        ctx.restore();
      }
      break;
    }
    case 'chips': {
      const items = (v.items || []).slice(0, 4);
      font(ctx, 52, 900);
      const ws = items.map((s) => Math.min(440, ctx.measureText(s).width + 72));
      const rows = items.length > 2 ? [items.slice(0, 2), items.slice(2)] : [items];
      let k = 0;
      rows.forEach((row, ri) => {
        const rw = row.map((_, j) => ws[k + j]); const gap = 26; const total = rw.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
        let x = cx - total / 2; const y = 1130 + ri * 128;
        row.forEach((s, j) => {
          const w = rw[j]; const n = k + j;
          const tilt = skin.chip === 'sticker' ? ((n % 2) ? 0.05 : -0.05) : 0;
          withPop(ctx, pop(t, st[n]), x + w / 2, y + 50, () => {
            ctx.save(); ctx.translate(x + w / 2, y + 52); ctx.rotate(tilt); ctx.translate(-(x + w / 2), -(y + 52));
            const ink = chipBox(ctx, skin, x, y, w, 104);
            if (skin.chip === 'pixel') fitPixel(ctx, s, 52, w - 36); else fitFont(ctx, s, 52, w - 36, 900);
            ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x + w / 2, y + 54);
            ctx.restore();
          });
          x += w + gap;
        });
        k += row.length;
      });
      break;
    }
    case 'big': { // 两行大字从左边带拖影滑进来
      const k0 = clamp((t - s0 + 0.1) / 0.3);
      const g = ctx.createLinearGradient(0, 0, W * 0.9, 0);
      g.addColorStop(0, `rgba(0,0,0,${0.62 * k0})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(R.x, 640, R.w, 520);
      const [l1, l2] = v.lines || [];
      [[l1, skin.ink, 800], [l2, skin.hl, 960]].forEach(([s, color, y], k) => {
        if (!s || t < (st[k] ?? 1e9)) return;
        const e = easeOut(clamp((t - st[k]) / 0.32));
        if (skin.chip === 'sticker') { ctx.save(); ctx.globalAlpha = clamp(e * 1.6); flowerText(ctx, s, 80 - (1 - e) * 280, y, fitFont(ctx, s, 112, W - 180, 900), k ? skin.hl : '#ffffff', skin.chip2, { align: 'left' }); ctx.restore(); return; }
        const size = fitSlant(ctx, s, 120, W - 110);
        for (let gh = 3; gh >= 0; gh--) {
          const back = (1 - e) * 280 + gh * (1 - e) * 60;
          ctx.globalAlpha = gh ? 0.18 * (1 - e) : clamp(e * 1.6);
          slantText(ctx, s, 60 - back, y, size, color, { align: 'left', stroke: size * 0.13 });
        }
        ctx.globalAlpha = 1;
      });
      break;
    }
    case 'stat': {
      withPop(ctx, pop(t, s0, 0.3), cx, 900, () => {
        const w = 620; const h = 360; const x = cx - w / 2; const y = 720;
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12;
        ctx.fillStyle = skin.card; rr(ctx, x, y, w, h, 28); ctx.fill(); ctx.shadowColor = 'transparent';
        fitFont(ctx, v.label || '', 46, w - 80, 900); ctx.fillStyle = skin.cardInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.label || '', cx, y + 66);
        ctx.fillStyle = 'rgba(128,128,128,0.18)'; ctx.fillRect(x + 50, y + 112, w - 100, 2);
        const val = countUp(v.big || '', clamp((t - s0) / 0.9));
        font(ctx, 52, 900); const uw = v.unit ? ctx.measureText(v.unit).width + 12 : 0;
        const bs = fitFont(ctx, val, 150, w - 90 - uw, 900); const bw = ctx.measureText(val).width;
        const bx = cx - (bw + uw) / 2;
        ctx.fillStyle = skin.cardInk; ctx.textAlign = 'left'; ctx.fillText(val, bx, y + 222);
        if (v.unit) { font(ctx, 46, 900); ctx.fillStyle = '#7a8090'; ctx.fillText(v.unit, bx + bw + 12, y + 222 + bs * 0.2); }
        if (v.sub) { fitFont(ctx, v.sub, 34, w - 80, 700); ctx.fillStyle = '#8a909c'; ctx.textAlign = 'center'; ctx.fillText(v.sub, cx, y + 318); }
      });
      break;
    }
    case 'quote': {
      const e = easeOut(clamp((t - s0) / 0.35)); if (e <= 0) break;
      ctx.save(); ctx.globalAlpha = e;
      const x = 56; const w = W - 112;
      font(ctx, 54, 900);
      const rows = wrap(ctx, v.text || '', w - 130, 3);
      const h = 90 + rows.length * 76 + (v.by ? 60 : 0);
      const y = 1180 - h + (1 - e) * 40;
      ctx.fillStyle = skin.dark; rr(ctx, x, y, w, h, skin.chip === 'pixel' ? 0 : 22); ctx.fill();
      ctx.fillStyle = skin.hl; ctx.fillRect(x, y + 24, 10, h - 48);
      font(ctx, 120, 900); ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.5; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('”', x + w - 30, y + 4); ctx.globalAlpha = e;
      font(ctx, 54, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      rows.forEach((r, k) => ctx.fillText(r, x + 62, y + 82 + k * 76));
      if (v.by) { font(ctx, 36, 700); ctx.fillStyle = skin.hl; ctx.fillText('—— ' + v.by, x + 62, y + 82 + rows.length * 76); }
      ctx.restore();
      break;
    }
    case 'steps': {
      const items = (v.items || []).slice(0, 4);
      const y0 = 1180 - items.length * 132 - (v.title ? 80 : 0);
      if (v.title) { const e = easeOut(clamp((t - p.start - 0.1) / 0.3)); ctx.globalAlpha = e; slantText(ctx, v.title, 70, y0 + 30, fitSlant(ctx, v.title, 72, W - 140), skin.hl, { align: 'left', stroke: 10 }); ctx.globalAlpha = 1; }
      items.forEach((it, k) => {
        const y = y0 + (v.title ? 100 : 0) + k * 132; const a = easeOut(clamp((t - (st[k] ?? 1e9)) / 0.3));
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(-(1 - a) * 120, 0);
        fitFont(ctx, it, 46, 640, 900); const w = Math.min(W - 140, ctx.measureText(it).width + 170);
        const ink = chipBox(ctx, skin, 70, y, w, 108, 54);
        ctx.fillStyle = skin.chip === 'outline' || skin.chip === 'pixel' ? skin.hl : skin.hl; ctx.beginPath(); ctx.arc(124, y + 54, 34, 0, Math.PI * 2); ctx.fill();
        font(ctx, 40, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), 124, y + 57);
        fitFont(ctx, it, 46, 640, 900); ctx.fillStyle = ink === skin.hl ? '#ffffff' : ink; ctx.textAlign = 'left'; ctx.fillText(it, 180, y + 57);
        ctx.restore();
      });
      break;
    }
    case 'checklist': {
      const items = (v.items || []).slice(0, 4); const w = 600; const x = W - w - 70; const h = 130 + items.length * 104; const y0 = 1180 - h;
      const e = easeOut(clamp((t - p.start - 0.1) / 0.35)); if (e <= 0) break;
      ctx.save(); ctx.globalAlpha *= e; ctx.translate((1 - e) * 140, 0);
      ctx.fillStyle = skin.dark; rr(ctx, x, y0, w, h, skin.chip === 'pixel' ? 0 : 22); ctx.fill();
      fitFont(ctx, v.title || '', 48, w - 70, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.title || '', x + 36, y0 + 64);
      items.forEach((it, k) => {
        const a = clamp((t - (st[k] ?? 1e9)) / 0.3); const yy = y0 + 146 + k * 104;
        ctx.save(); ctx.globalAlpha *= 0.3 + 0.7 * a;
        ctx.fillStyle = a > 0 ? (skin.chip === 'outline' || skin.chip === 'pixel' ? skin.hl : skin.chip1) : 'rgba(255,255,255,0.15)'; rr(ctx, x + 34, yy - 30, 60, 60, 14); ctx.fill();
        if (a > 0) { ctx.strokeStyle = skin.chip === 'outline' || skin.chip === 'pixel' ? '#111' : '#fff'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x + 48, yy); ctx.lineTo(x + 60, yy + 13); ctx.lineTo(x + 81, yy - 13); ctx.stroke(); }
        fitFont(ctx, it, 44, w - 150, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(it, x + 118, yy + 2);
        ctx.restore();
      });
      ctx.restore();
      break;
    }
    case 'nametag': {
      const x = 76; const y = 1090;
      const e1 = easeOut(clamp((t - s0) / 0.35));
      if (e1 > 0) {
        fitFont(ctx, v.name || '', 64, 640, 900); const nw = ctx.measureText(v.name || '').width + 80;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, nw * e1, 104); ctx.clip();
        const g = ctx.createLinearGradient(x, 0, x + nw, 0); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2);
        ctx.fillStyle = g; ctx.fillRect(x, y, nw, 104); ctx.fillStyle = skin.hl; ctx.fillRect(x, y, 12, 104);
        ctx.fillStyle = skin.chip === 'outline' || skin.chip === 'pixel' ? skin.hl : '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.name || '', x + 44, y + 55);
        ctx.restore();
      }
      const e2 = easeOut(clamp((t - (st[1] ?? 1e9)) / 0.35));
      if (e2 > 0 && v.role) {
        fitFont(ctx, v.role, 42, 800, 900); const rw = ctx.measureText(v.role).width + 64;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y + 104, rw * e2, 76); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(x, y + 104, rw, 76);
        ctx.fillStyle = '#1b2230'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.role, x + 32, y + 143);
        ctx.restore();
      }
      break;
    }
    case 'location': {
      const pk = clamp((t - s0) / 0.45); if (pk <= 0) break;
      const px = 180; const base = 1100;
      const drop = pk < 0.7 ? -220 * (1 - easeOut(pk / 0.7)) : -Math.sin(((pk - 0.7) / 0.3) * Math.PI) * 20; const py = base + drop;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(px, base + 8, 48 * pk, 15 * pk, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e5252a'; ctx.beginPath(); ctx.arc(px, py - 104, 68, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(px, py); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py - 108, 27, 0, Math.PI * 2); ctx.fill();
      const e = easeOut(clamp((t - (st[1] ?? s0 + 0.4)) / 0.35));
      if (e > 0) {
        ctx.save(); ctx.globalAlpha *= e; ctx.translate((1 - e) * 60, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.97)'; rr(ctx, 280, base - 220, W - 340, 210, 22); ctx.fill();
        fitFont(ctx, v.place || '', 58, W - 420, 900); ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.place || '', 320, base - 150);
        fitFont(ctx, v.note || '', 40, W - 420, 700); ctx.fillStyle = skin.cardInk === '#7dff9a' ? '#1a7f3a' : skin.cardInk; ctx.fillText(v.note || '', 320, base - 70);
        ctx.restore();
      }
      break;
    }
    case 'ticker': {
      const y = 1110; const e = easeOut(clamp((t - s0) / 0.4)); if (e <= 0) break;
      ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(R.x, y, R.w * e, 124);
      fitFont(ctx, v.label || '划重点', 50, 240, 900); const lw = ctx.measureText(v.label || '划重点').width + 76;
      ctx.fillStyle = skin.chip === 'outline' || skin.chip === 'pixel' ? '#111' : skin.chip1; ctx.fillRect(R.x, y, lw, 124); ctx.fillStyle = skin.hl; ctx.fillRect(R.x + lw, y, 12, 124);
      ctx.fillStyle = skin.chip === 'outline' || skin.chip === 'pixel' ? skin.hl : '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.label || '划重点', R.x + 36, y + 64);
      ctx.save(); ctx.beginPath(); ctx.rect(R.x + lw + 12, y, R.w - lw - 12, 124); ctx.clip();
      fitFont(ctx, v.text || '', 48, R.w - lw - 70, 900); ctx.fillStyle = '#111827'; ctx.fillText(v.text || '', R.x + lw + 40 + (1 - e) * 300, y + 64);
      ctx.restore();
      ctx.fillStyle = skin.hl; ctx.fillRect(R.x, y + 124, R.w * e, 8);
      break;
    }
    case 'compare': {
      dim(0.5 * clamp((t - p.start) / 0.3));
      const pw = 440; const y0 = 660; const ph = 540;
      const panel = (x, label, items, hot, s) => {
        const e = easeOut(clamp((t - s) / 0.35)); if (e <= 0) return;
        ctx.save(); ctx.globalAlpha *= e; ctx.translate((hot ? 1 : -1) * (1 - e) * 80, 0);
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.95)' : 'rgba(20,24,32,0.9)'; rr(ctx, x, y0, pw, ph, 22); ctx.fill();
        ctx.fillStyle = hot ? (skin.chip === 'pixel' ? '#1a7f3a' : skin.chip === 'outline' ? '#7a5a2a' : skin.chip1) : '#4a5160'; rr(ctx, x, y0, pw, 100, [22, 22, 0, 0]); ctx.fill();
        fitFont(ctx, label, 52, pw - 40, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + pw / 2, y0 + 52);
        items.slice(0, 3).forEach((it, k) => {
          const yy = y0 + 180 + k * 125;
          font(ctx, 50, 900); ctx.fillStyle = hot ? '#1a9a4a' : '#8a93a5'; ctx.textAlign = 'left'; ctx.fillText(hot ? '✓' : '✗', x + 30, yy);
          fitFont(ctx, it, 44, pw - 100, 900); ctx.fillStyle = hot ? '#1b2230' : '#c7ccd6'; ctx.fillText(it, x + 88, yy + 2);
        });
        ctx.restore();
      };
      panel(70, v.left?.label || '别处', v.left?.items || [], false, st[0] ?? p.start + 0.3);
      panel(W - 70 - pw, v.right?.label || '我们', v.right?.items || [], true, st[1] ?? p.start + 0.8);
      break;
    }
    case 'qa': { // 聊天：家长问、老师答
      const bubble = (text, who, emo, right, y, s) => withPop(ctx, pop(t, s, 0.28), right ? W - 300 : 300, y + 60, () => {
        font(ctx, 46, 900); const rows = wrap(ctx, text, 600, 2); const bw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 64; const bh = rows.length * 62 + 44;
        const ax = right ? W - 150 : 150; const bx = right ? ax - 80 - bw : ax + 80;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ax, y + 50, 52, 0, Math.PI * 2); ctx.fill();
        ctx.font = `58px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emo, ax, y + 54);
        font(ctx, 28, 700); ctx.fillStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(who, ax, y + 128); ctx.fillText(who, ax, y + 128);
        ctx.fillStyle = right ? '#95ec69' : '#ffffff'; rr(ctx, bx, y, bw, bh, 22); ctx.fill();
        ctx.beginPath(); if (right) { ctx.moveTo(bx + bw, y + 36); ctx.lineTo(bx + bw + 18, y + 48); ctx.lineTo(bx + bw, y + 60); } else { ctx.moveTo(bx, y + 36); ctx.lineTo(bx - 18, y + 48); ctx.lineTo(bx, y + 60); } ctx.fill();
        font(ctx, 46, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'left'; rows.forEach((r, k) => ctx.fillText(r, bx + 32, y + 52 + k * 62));
      });
      dim(0.3 * clamp((t - p.start) / 0.3));
      bubble(v.q || '', v.who || '家长', '🙋', false, 720, s0);
      bubble(v.a || '', '老师', '🧑‍🏫', true, 960, st[1] ?? s0 + 0.8);
      break;
    }
    case 'polaroid': { // 定格成一张拍立得
      const e = easeOut(clamp((t - s0) / 0.45)); if (e <= 0) break;
      dim(0.55 * e);
      const pw = 640 - 140 * (1 - e); const ph = pw * 1.05; const pcx = cx; const pcy = 900;
      ctx.save(); ctx.translate(pcx, pcy); ctx.rotate(-0.06 * e);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.fillStyle = '#fbfaf6'; ctx.fillRect(-pw / 2 - 28, -ph / 2 - 28, pw + 56, ph + 150); ctx.shadowColor = 'transparent';
      ctx.save(); ctx.beginPath(); ctx.rect(-pw / 2, -ph / 2, pw, ph); ctx.clip(); drawInner({ x: -pw / 2, y: -ph / 2, w: pw, h: ph }); ctx.restore();
      fitFont(ctx, v.caption || '', 48, pw, 700); ctx.fillStyle = '#2a2a2a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.caption || '', 0, ph / 2 + 62);
      ctx.restore();
      break;
    }
    case 'focus': { // 圈重点：手画的红圈 + 箭头 + 标签
      const k = clamp((t - s0) / 0.5); if (k <= 0) break;
      const fx = W * (0.38 + hash(idx * 5 + 1) * 0.24); const fy = 960 + hash(idx * 9 + 2) * 160; // 人和动作多在画面中下部
      ctx.save(); ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(fx, fy, 190, 140, -0.12, -1.4, -1.4 + Math.PI * 2.15 * easeOut(k)); ctx.stroke();
      const lab = v.label || '注意看这里';
      const e = easeOut(clamp((t - s0 - 0.35) / 0.3));
      if (e > 0) {
        const lx = fx < W / 2 ? fx + 120 : fx - 120; const ly = fy - 300;
        ctx.globalAlpha = e; ctx.beginPath(); ctx.moveTo(lx, ly + 50); ctx.quadraticCurveTo(lx + (fx < W / 2 ? 40 : -40), ly + 130, fx + (fx < W / 2 ? 60 : -60), fy - 150); ctx.stroke();
        fitFont(ctx, lab, 50, 520, 900); const w = ctx.measureText(lab).width + 60;
        const bx = clamp(lx - w / 2, 40, W - 40 - w);
        ctx.fillStyle = '#ff3b30'; rr(ctx, bx, ly - 46, w, 92, 14); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, bx + w / 2, ly + 2);
      }
      ctx.restore();
      break;
    }
    case 'stamp': { // 盖章
      const k = clamp((t - s0) / 0.3); if (k <= 0) break;
      ctx.save(); ctx.translate(cx, 880); ctx.rotate(-0.16); const sc = 2.2 - 1.2 * easeOut(k); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2) * 0.92;
      const txt = v.text || '实拍'; fitFont(ctx, txt, 150, 520, 900); const w = ctx.measureText(txt).width + 90;
      ctx.strokeStyle = '#e5252a'; ctx.lineWidth = 16; rr(ctx, -w / 2, -110, w, 220, 24); ctx.stroke(); ctx.lineWidth = 5; rr(ctx, -w / 2 + 18, -92, w - 36, 184, 14); ctx.stroke();
      ctx.fillStyle = '#e5252a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 8); ctx.restore();
      if (v.note && t >= (st[1] ?? 1e9)) { const e = easeOut(clamp((t - st[1]) / 0.3)); ctx.globalAlpha = e; fitFont(ctx, v.note, 52, W - 160, 900); ctx.fillStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(v.note, cx, 1130); ctx.fillText(v.note, cx, 1130); ctx.globalAlpha = 1; }
      break;
    }
    case 'cta': {
      dim(0.3 * clamp((t - p.start) / 0.4));
      const y = 1080;
      withPop(ctx, pop(t, s0, 0.3), cx, y, () => {
        const beat = 1 + 0.035 * Math.max(0, Math.sin((t - s0) * 6));
        ctx.save(); ctx.translate(cx, y); ctx.scale(beat, beat); ctx.translate(-cx, -y);
        const txt = v.text || '关注我';
        fitFont(ctx, txt, 64, W - 280, 900); const w = Math.min(W - 140, ctx.measureText(txt).width + 140);
        const ink = chipBox(ctx, skin, cx - w / 2, y - 75, w, 150, 75);
        if (skin.chip === 'grad' || skin.chip === 'flat') { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 5; rr(ctx, cx - w / 2 + 6, y - 69, w - 12, 138, skin.chip === 'flat' ? 6 : 69); ctx.stroke(); }
        fitFont(ctx, txt, 64, w - 100, 900); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, cx, y + 4);
        ctx.restore();
        const hand = Math.abs(Math.sin((t - s0) * 3.2)) * 26;
        ctx.font = `110px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('👆', Math.min(W - 90, cx + w / 2 - 70), y + 140 + hand);
      });
      if (v.sub && t >= (st[1] ?? 1e9)) {
        const e = easeOut(clamp((t - st[1]) / 0.3));
        ctx.globalAlpha = e;
        if (skin.chip === 'sticker') flowerText(ctx, v.sub, cx, 880 - (1 - e) * 30, fitFont(ctx, v.sub, 72, W - 180, 900), skin.hl, skin.chip2);
        else { const size = fitSlant(ctx, v.sub, 72, W - 140); slantText(ctx, v.sub, cx, 880 - (1 - e) * 30, size, skin.hl, { stroke: size * 0.15 }); }
        ctx.globalAlpha = 1;
      }
      break;
    }
    default: break;
  }
}

