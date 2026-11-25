// 实拍混剪：新版式的“画面怎么摆”（背景、画框、构图、界面装饰）
// FRAMES[id](F)：把这个镜头的素材按这套版式摆出来；BGS[id](F)：背景；DECOS[id](F)：最上层的界面装饰
import { W, H, clamp, easeOut, easeInOut, font, fitFont, wrap, hash } from '../engine/draw.js';
import { EMOJI_FONT } from './themes.js';
import { pop, withPop, rr, grad, slantText, fitSlant } from './footage-mix-parts.js';
import { paintMedia, imageOf, grain, vignette, scanlines, shapePath, gradeIt, coverIn } from './footage-mix-media.js';
import { cleanSub, vText, maskedText, strokeFill, H12 } from './footage-mix-text.js';

const shadow = (ctx, c = 'rgba(0,0,0,0.35)', b = 30, y = 12, x = 0) => { ctx.shadowColor = c; ctx.shadowBlur = b; ctx.shadowOffsetY = y; ctx.shadowOffsetX = x; };
const noShadow = (ctx) => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
/** 画一个格子：F.pm 的简写（带上这套版式的调色和推拉） */
const pm = (F, it, R, o = {}) => paintMedia(F.ctx, it, R, F.t, { gradeKind: F.look.grade, label: F.s?.label, k: F.k, seed: F.idx * 4 + (o.c || 0), ...o });
/** 切换进度：这个格子上一次换画面后过了多久（0-1） */
const cutE = (F, it, dur = 0.35) => (it?.cutAt != null ? clamp((F.t - it.cutAt) / dur) : 1);

// =====================================================================
// 背景
// =====================================================================
export const BGS = {
  black(F) { F.ctx.fillStyle = '#000'; F.ctx.fillRect(0, 0, W, H); },
  solid(F) { F.ctx.fillStyle = F.look.bgColor || '#111'; F.ctx.fillRect(0, 0, W, H); },
  /** 漫画网点 */
  halftone(F) {
    const { ctx } = F; ctx.fillStyle = '#ffd84a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(230,120,0,0.35)';
    for (let y = 0; y < H + 40; y += 36) for (let x = (y / 36) % 2 ? 18 : 0; x < W + 40; x += 36) { const r = 4 + 6 * (y / H); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  },
  /** 手帐：米色方格纸 */
  grid(F) {
    const { ctx } = F; ctx.fillStyle = '#f6efe2'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,150,180,0.18)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x < W; x += 54) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = 0; y < H; y += 54) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
    grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.05, 'multiply');
  },
  feed(F) { F.ctx.fillStyle = '#eceef1'; F.ctx.fillRect(0, 0, W, H); },
  /** 美术馆：暖灰墙 + 顶光 + 地面 */
  wall(F) {
    const { ctx } = F; ctx.fillStyle = '#cfc7ba'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, 250, 60, W / 2, 700, 1000); g.addColorStop(0, 'rgba(255,248,230,0.75)'); g.addColorStop(1, 'rgba(255,248,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a89f91'; ctx.fillRect(0, 1760, W, H - 1760); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 1760, W, 6);
    vignette(ctx, { x: 0, y: 0, w: W, h: H }, 0.25);
  },
  /** 报纸：新闻纸 */
  news(F) { const { ctx } = F; ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, W, H); grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.1, 'multiply'); },
  /** 胶片：深棕黑 */
  film(F) { const { ctx } = F; ctx.fillStyle = '#0d0a07'; ctx.fillRect(0, 0, W, H); },
  offwhite(F) { F.ctx.fillStyle = '#f2efe9'; F.ctx.fillRect(0, 0, W, H); },
  /** 老电视：70 年代竖条墙纸 + 木地板 */
  retro(F) {
    const { ctx } = F; const cols = ['#e8b25a', '#f3dcae', '#d9822b', '#f3dcae'];
    for (let x = 0, k = 0; x < W; x += 60, k++) { ctx.fillStyle = cols[k % 4]; ctx.fillRect(x, 0, 60, H); }
    ctx.fillStyle = 'rgba(90,45,20,0.18)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6b3d22'; ctx.fillRect(0, 1450, W, H - 1450); ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 1450; y < H; y += 46) ctx.fillRect(0, y, W, 3);
  },
  /** 泡泡：糖果渐变 + 飘着的半透明圆 */
  candy(F) {
    const { ctx, t } = F; ctx.fillStyle = grad(ctx, 0, H, '#ffb3d1', '#c9b6ff'); ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) { const x = hash(k * 3.1) * W; const y = ((hash(k * 7.7) * H - t * (20 + k * 6)) % (H + 300) + H + 300) % (H + 300) - 150; const r = 30 + hash(k * 1.3) * 90; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  },
  /** 撞色：每个镜头换一种纯色 + 小十字 */
  flat(F) {
    const { ctx } = F; const cols = F.look.bgCycle || ['#c6ff3d', '#b9a2ff', '#ff9b5c', '#62d7ff'];
    ctx.fillStyle = cols[F.idx % cols.length]; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 60; y < H; y += 120) for (let x = 60; x < W; x += 120) { ctx.fillRect(x - 10, y - 2, 20, 4); ctx.fillRect(x - 2, y - 10, 4, 20); }
  },
  /** 科技：深蓝网格 + 光晕 */
  navy(F) {
    const { ctx, t } = F; ctx.fillStyle = grad(ctx, 0, H, '#071430', '#020611'); ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,200,255,0.08)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x < W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = (t * 20) % 60; y < H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
    const g = ctx.createRadialGradient(W / 2, 840, 40, W / 2, 840, 800); g.addColorStop(0, 'rgba(40,140,255,0.18)'); g.addColorStop(1, 'rgba(40,140,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
  soft(F) { const { ctx } = F; ctx.fillStyle = '#f3f5fa'; ctx.fillRect(0, 0, W, H); },
  /** 卡片：薄荷到天蓝 + 柔和色块 */
  pastel(F) {
    const { ctx, t } = F; ctx.fillStyle = grad(ctx, 0, H, '#c8f3e4', '#cfe4ff'); ctx.fillRect(0, 0, W, H);
    [[180, 380, 260, '#ffe3f1'], [900, 1500, 320, '#fff4c9'], [860, 300, 180, '#e2dcff']].forEach(([x, y, r, c], k) => { ctx.fillStyle = c; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x + Math.sin(t * 0.6 + k) * 20, y + Math.cos(t * 0.5 + k) * 20, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  },
  /** 国风：宣纸 + 远山水墨 */
  rice(F) {
    const { ctx } = F; ctx.fillStyle = '#f3ecdd'; ctx.fillRect(0, 0, W, H);
    grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.07, 'multiply');
    const hill = (y0, amp, col, ph) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y0 - Math.sin(x / 170 + ph) * amp - Math.sin(x / 61 + ph * 2) * amp * 0.3); ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); };
    hill(1560, 90, 'rgba(60,60,60,0.10)', 0.5); hill(1660, 70, 'rgba(40,40,40,0.14)', 2.1); hill(1760, 50, 'rgba(30,30,30,0.18)', 4);
  },
};

// =====================================================================
// 画面怎么摆
// =====================================================================
export const FRAMES = {
  /** 整屏铺满 */
  full(F) {
    const it = F.sc.items[0];
    pm(F, it, { x: 0, y: 0, w: W, h: H });
    if (F.look.leak) { // 港风：漏光
      const { ctx, t } = F; const x = W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.4 + F.idx)));
      const g = ctx.createRadialGradient(x, 200, 10, x, 300, 900); g.addColorStop(0, 'rgba(255,140,60,0.35)'); g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (F.look.shade !== false) {
      F.ctx.fillStyle = grad(F.ctx, 0, 520, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'); F.ctx.fillRect(0, 0, W, 520);
      F.ctx.fillStyle = grad(F.ctx, 1200, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)'); F.ctx.fillRect(0, 1200, W, H - 1200);
    }
  },
  /** 三条横屏，一拍换一条 */
  tri(F) {
    const { ctx } = F; const bh = (H - 12) / 3;
    F.sc.items.forEach((it, c) => {
      const R = { x: 0, y: c * (bh + 6), w: W, h: bh };
      const e = easeOut(cutE(F, it, 0.28)); const dir = c % 2 ? 1 : -1;
      ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
      if (e < 1 && it.prev) pm(F, { ...it, m: it.prev, still: true }, { ...R, x: -dir * W * e }, { c });
      ctx.translate(dir * W * (1 - e), 0); pm(F, it, R, { c });
      ctx.restore();
    });
    ctx.fillStyle = grad(ctx, 0, 480, 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'); ctx.fillRect(0, 0, W, 480);
    ctx.fillStyle = grad(ctx, 1380, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)'); ctx.fillRect(0, 1380, W, H - 1380);
  },
  /** 斜切两块，中间一道亮色斜条 */
  slash(F) {
    const { ctx, skin, t, p } = F; const [a, b] = F.sc.items;
    const e = easeOut(clamp((t - p.start) / 0.4)); const y1 = 1190; const y2 = 730; // 左低右高
    const up = [[0, 0], [W, 0], [W, y2], [0, y1]]; const dn = [[0, y1], [W, y2], [W, H], [0, H]];
    ctx.save(); ctx.translate(-(1 - e) * W, 0); pm(F, a, { x: 0, y: 0, w: W, h: y1 }, { shape: 'poly', pts: up, c: 0 }); ctx.restore();
    ctx.save(); ctx.translate((1 - e) * W, 0); pm(F, b || a, { x: 0, y: y2, w: W, h: H - y2 }, { shape: 'poly', pts: dn, c: 1 }); ctx.restore();
    ctx.fillStyle = skin.hl; ctx.beginPath(); ctx.moveTo(0, y1 - 10); ctx.lineTo(W, y2 - 10); ctx.lineTo(W, y2 + 10); ctx.lineTo(0, y1 + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.chip1; ctx.beginPath(); ctx.moveTo(0, y1 + 10); ctx.lineTo(W, y2 + 10); ctx.lineTo(W, y2 + 22); ctx.lineTo(0, y1 + 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, 520, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'); ctx.fillRect(0, 0, W, 520);
    ctx.fillStyle = grad(ctx, 1350, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)'); ctx.fillRect(0, 1350, W, H - 1350);
  },
  /** 漫画分格：粗黑边、斜着的格子，一格一格弹出来 */
  comic(F) {
    const { ctx, t, p } = F; const n = F.sc.items.length; const g = 22;
    const panels = n >= 3
      ? [[[60, 420], [1020, 400], [1020, 1000], [60, 1040]], [[60, 1040 + g], [520, 1030 + g], [500, 1560], [60, 1560]], [[520 + g, 1030 + g], [1020, 1000 + g], [1020, 1560], [500 + g, 1560]]]
      : n === 2 ? [[[60, 420], [1020, 400], [1020, 960], [60, 1020]], [[60, 1020 + g], [1020, 960 + g], [1020, 1560], [60, 1560]]]
        : [[[70, 430], [1010, 400], [1020, 1540], [60, 1560]]];
    F.mediaR = { x: 60, y: 400, w: 960, h: 1160, noDim: true };
    panels.forEach((pts, c) => {
      const it = F.sc.items[c]; const s = pop(t, p.start + 0.05 + c * 0.25, 0.3); if (s <= 0) return;
      const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]); const R = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      withPop(ctx, s, R.x + R.w / 2, R.y + R.h / 2, () => {
        ctx.fillStyle = '#000'; ctx.save(); ctx.translate(14, 14); shapePath(ctx, R, 'poly', 0, pts); ctx.fill(); ctx.restore();
        pm(F, it, R, { shape: 'poly', pts, c });
        ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; shapePath(ctx, R, 'poly', 0, pts); ctx.stroke();
      });
    });
  },
  /** 种草笔记：上面一张大图（左滑换图），下面白底文字区 */
  note(F) {
    const { ctx, skin, t, sec } = F; const it = F.sc.items[0]; const R = { x: 0, y: 0, w: W, h: 1240 }; F.mediaR = R;
    const e = easeInOut(cutE(F, it, 0.4));
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    if (e < 1 && it.prev) pm(F, { ...it, m: it.prev, still: true }, { ...R, x: -W * e });
    pm(F, it, { ...R, x: W * (1 - e) });
    ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 1240, W, H - 1240);
    // 轮播小圆点：这一段有几句就几个点
    const n = Math.max(1, sec.lines.length); const cur = Math.min(n - 1, F.sc.cutK);
    for (let k = 0; k < n; k++) { ctx.fillStyle = k === cur ? skin.chip1 : '#d7d9de'; const w = k === cur ? 34 : 14; rr(ctx, W / 2 - (n * 26) / 2 + k * 26 + (k > cur ? 20 : 0) - 10, 1268, w, 14, 7); ctx.fill(); }
    // 右上角 1/3
    font(ctx, 30, 700); const txt = `${cur + 1}/${n}`; ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(ctx, W - 130, 60, 90, 54, 27); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W - 85, 88);
    // 标题（笔记的标题就是视频的大标题）
    const [h1, h2] = H12(F); const title = h2 ? `${h1}｜${h2}` : h1;
    font(ctx, 54, 900); const rows = wrap(ctx, title, W - 140, 2); ctx.fillStyle = '#16181d'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    rows.forEach((r, k) => ctx.fillText(r, 70, 1350 + k * 70));
    F.noteTop = 1350 + rows.length * 70 + 40;
  },
  /** 手帐：拍立得 + 和纸胶带 + 涂鸦 */
  scrap(F) {
    const { ctx, skin, t, p, idx } = F; const items = F.sc.items;
    const spots = items.length > 1
      ? [{ x: 110, y: 400, w: 560, h: 620, r: -0.06 }, { x: 470, y: 820, w: 480, h: 520, r: 0.07 }]
      : [{ x: 160, y: 420, w: 760, h: 860, r: (hash(idx) - 0.5) * 0.1 }];
    F.mediaR = { x: 110, y: 400, w: 860, h: 940, noDim: true };
    spots.forEach((S, c) => {
      const it = items[c]; const k = clamp((t - p.start - c * 0.35) / 0.4); if (k <= 0) return;
      const e = easeOut(k); const cx = S.x + S.w / 2; const cy = S.y + S.h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.r + (1 - e) * 0.25); ctx.scale(1.25 - 0.25 * e, 1.25 - 0.25 * e); ctx.globalAlpha = clamp(k * 2); ctx.translate(-cx, -cy);
      shadow(ctx, 'rgba(70,50,30,0.3)', 24, 10); ctx.fillStyle = '#fffdf8'; ctx.fillRect(S.x - 24, S.y - 24, S.w + 48, S.h + 130); noShadow(ctx);
      pm(F, it, S, { c, gradeKind: 'warm' });
      font(ctx, 38, 700); ctx.fillStyle = '#4a3d33'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cap = c === 0 ? (F.s?.label || '') : '今天的样子'; ctx.fillText(cap, cx, S.y + S.h + 54);
      // 胶带
      ctx.fillStyle = c ? 'rgba(130,200,255,0.6)' : `${skin.hl}aa`; ctx.save(); ctx.translate(S.x + 30, S.y - 10); ctx.rotate(-0.6); ctx.fillRect(-70, -22, 140, 44); ctx.restore();
      ctx.save(); ctx.translate(S.x + S.w - 30, S.y - 10); ctx.rotate(0.6); ctx.fillRect(-70, -22, 140, 44); ctx.restore();
      ctx.restore();
    });
    // 涂鸦：星星和箭头
    const d = clamp((t - p.start - 0.6) / 0.5); if (d > 0) {
      ctx.save(); ctx.strokeStyle = skin.chip1; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.globalAlpha = d;
      const star = (x, y, r) => { ctx.beginPath(); for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rr2 = k % 2 ? r * 0.45 : r; k ? ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2) : ctx.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.stroke(); };
      star(items.length > 1 ? 880 : 960, 400, 40); star(110, 1460, 30);
      ctx.beginPath(); ctx.moveTo(130, 1360); ctx.quadraticCurveTo(160, 1240, 260, 1210); ctx.stroke(); ctx.beginPath(); ctx.moveTo(230, 1190); ctx.lineTo(262, 1210); ctx.lineTo(236, 1236); ctx.stroke();
      ctx.restore();
    }
  },
  /** 动态：一张张卡片，换镜头时整张往上划走 */
  post(F) {
    const { ctx, t, p, idx } = F; const e = easeInOut(clamp((t - p.start) / 0.55));
    const card = (i, it, dy) => {
      const y = 290 + dy; if (y > H || y < -1500) return;
      shadow(ctx, 'rgba(0,0,0,0.08)', 20, 6); ctx.fillStyle = '#fff'; rr(ctx, 30, y, W - 60, 1560, 28); ctx.fill(); noShadow(ctx);
      const name = F.account; ctx.fillStyle = F.skin.chip1; ctx.beginPath(); ctx.arc(100, y + 80, 44, 0, Math.PI * 2); ctx.fill();
      font(ctx, 40, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...name][0] || '我', 100, y + 82);
      font(ctx, 38, 900); ctx.fillStyle = '#1b1d22'; ctx.textAlign = 'left'; ctx.fillText(name, 166, y + 62);
      font(ctx, 28, 700); ctx.fillStyle = '#9aa0aa'; ctx.fillText(i === idx ? '刚刚' : `${(idx - i) * 3} 分钟前`, 166, y + 106);
      pm(F, it, { x: 30, y: y + 160, w: W - 60, h: W - 60 }, { c: i === idx ? 0 : 3 });
      const ay = y + 160 + W - 60 + 330;
      font(ctx, 34, 700); ctx.fillStyle = '#5c6270'; ctx.textAlign = 'left';
      ctx.fillText('♡ 赞', 70, ay); ctx.fillText('☆ 收藏', 300, ay); ctx.fillText('↗ 转发', 560, ay);
    };
    if (idx > 0 && e < 1) card(idx - 1, { m: F.mainOf(idx - 1), still: true, lane: 0, start: 0 }, -1700 * e);
    card(idx, F.sc.items[0], (1 - e) * 1700);
    F.postY = 290 + (1 - e) * 1700; F.mediaR = { x: 30, y: F.postY + 160, w: W - 60, h: W - 60 };
  },
  /** 美术馆：画框 + 白卡纸 + 展签 */
  gallery(F) {
    const { ctx, t, p } = F; const it = F.sc.items[0];
    const O = { x: 120, y: 420, w: 840, h: 1080 }; const M = 56; const B = 24;
    shadow(ctx, 'rgba(40,30,20,0.45)', 50, 26); ctx.fillStyle = '#1b1916'; ctx.fillRect(O.x, O.y, O.w, O.h); noShadow(ctx);
    ctx.fillStyle = '#f7f4ee'; ctx.fillRect(O.x + B, O.y + B, O.w - B * 2, O.h - B * 2);
    const R = { x: O.x + B + M, y: O.y + B + M, w: O.w - (B + M) * 2, h: O.h - (B + M) * 2 };
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(R.x - 3, R.y - 3, R.w + 6, R.h + 6);
    pm(F, it, R); F.mediaR = R;
    // 展签
    const e = clamp((t - p.start - 0.6) / 0.5); if (e > 0) {
      ctx.save(); ctx.globalAlpha = e; const x = 640; const y = 1525; shadow(ctx, 'rgba(0,0,0,0.18)', 10, 4); ctx.fillStyle = '#fbfaf7'; ctx.fillRect(x, y, 320, 120); noShadow(ctx);
      fitFont(ctx, F.s?.label || '实拍', 32, 280, 900); ctx.fillStyle = '#2a251f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(F.s?.label || '实拍', x + 22, y + 40);
      fitFont(ctx, `${F.account} · 实拍`, 22, 280, 700); ctx.fillStyle = '#857c70'; ctx.fillText(`${F.account} · 实拍`, x + 22, y + 84);
      ctx.restore();
    }
  },
  /** 报纸：报头 + 大标题 + 黑白大照片 + 图注 */
  paper(F) {
    const { ctx, skin, idx, account } = F; const it = F.sc.items[0]; const [h1, h2] = H12(F);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, `${account}日报`, 96, W - 200, 900); ctx.fillStyle = '#16130f'; ctx.fillText(`${account}日报`, W / 2, 130);
    ctx.fillRect(60, 200, W - 120, 8); ctx.fillRect(60, 216, W - 120, 2);
    font(ctx, 26, 700); ctx.fillStyle = '#4a443b'; ctx.textAlign = 'left'; ctx.fillText(`第 ${String(idx + 1).padStart(2, '0')} 版`, 64, 244); ctx.textAlign = 'right'; ctx.fillText('实拍特刊', W - 64, 244); ctx.textAlign = 'center'; ctx.fillText('· 现场直击 ·', W / 2, 244);
    ctx.fillRect(60, 268, W - 120, 2);
    const head = h2 ? `${h1}，${h2}` : h1; font(ctx, 76, 900); const rows = wrap(ctx, head, W - 140, 2);
    ctx.fillStyle = '#16130f'; rows.forEach((r, k) => ctx.fillText(r, W / 2, 340 + k * 90));
    const top = 340 + rows.length * 90; const R = { x: 60, y: top, w: W - 120, h: 1340 - top };
    pm(F, it, R, { gradeKind: 'news' }); F.mediaR = R;
    ctx.strokeStyle = '#16130f'; ctx.lineWidth = 3; ctx.strokeRect(R.x, R.y, R.w, R.h);
    font(ctx, 28, 700); ctx.fillStyle = '#4a443b'; ctx.textAlign = 'left'; ctx.fillText(`▲ ${F.s?.label || '现场'}（实拍）`, 64, R.y + R.h + 34);
    // 两栏“正文”：灰色细条
    ctx.fillStyle = 'rgba(40,35,28,0.16)';
    for (let c = 0; c < 2; c++) for (let k = 0; k < 3; k++) { const w = (k === 2 ? 0.6 : 1) * 440; ctx.fillRect(64 + c * 490, 1410 + k * 34, w, 14); }
    void skin;
  },
  /** 胶片放映：竖着的胶片条，换画面时往上走一格 */
  filmstrip(F) {
    const { ctx, t, p, idx } = F; const it = F.sc.items[0];
    const X = 150; const SW = W - 300; const FH = 640; const GAP = 70; const step = FH + GAP;
    const e = easeInOut(clamp((t - Math.max(p.start, it.cutAt ?? p.start)) / 0.6));
    const drift = (t - p.start) * 8;
    const cy = 900; const off = (1 - e) * step - drift; F.mediaR = { x: X, y: cy - FH / 2, w: SW, h: FH };
    ctx.fillStyle = '#1c1611'; ctx.fillRect(X - 70, 0, SW + 140, H);
    // 齿孔
    ctx.fillStyle = '#0d0a07'; const hole = (yy) => { rr(ctx, X - 52, yy, 34, 46, 8); ctx.fill(); rr(ctx, X + SW + 18, yy, 34, 46, 8); ctx.fill(); };
    for (let y = ((off % 80) + 80) % 80 - 80; y < H; y += 80) hole(y);
    const seq = F.seq; const cur = F.sc.cutK;
    for (let j = -2; j <= 2; j++) {
      const y = cy - FH / 2 + j * step + off; if (y > H || y + FH < 0) continue;
      const m = j === 0 ? null : seq[((cur + j) % seq.length + seq.length) % seq.length];
      const item = j === 0 ? it : { m, still: true, lane: 0, start: 0 };
      pm(F, item, { x: X, y, w: SW, h: FH }, { c: j + 2 });
      if (j !== 0) { ctx.fillStyle = 'rgba(13,10,7,0.55)'; ctx.fillRect(X, y, SW, FH); }
      font(ctx, 22, 700); ctx.fillStyle = 'rgba(255,190,90,0.7)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${idx + 1}${String.fromCharCode(65 + (((cur + j) % 26) + 26) % 26)}  ▸ KODAK 400`, X + 6, y + FH + 30);
    }
    ctx.fillStyle = `rgba(255,220,160,${0.04 + 0.04 * Math.sin(t * 23)})`; ctx.fillRect(0, 0, W, H);
    grain(ctx, { x: 0, y: 0, w: W, h: H }, t, 0.1);
  },
  /** 黑白：上面大半屏黑白画面，下面黑底留白放字 */
  mono(F) {
    const { ctx } = F; const it = F.sc.items[0];
    pm(F, it, { x: 0, y: 0, w: W, h: 1180 }); F.mediaR = { x: 0, y: 0, w: W, h: 1180 };
    ctx.fillStyle = grad(ctx, 860, 1180, 'rgba(0,0,0,0)', 'rgba(0,0,0,1)'); ctx.fillRect(0, 860, W, 320);
    ctx.fillStyle = grad(ctx, 0, 380, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'); ctx.fillRect(0, 0, W, 380);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(56, 1250, 3, 420);
  },
  /** 镂空：上面是透出画面的大字，下面是圆角大图 */
  mask(F) {
    const { ctx, t, p } = F; const it = F.sc.items[0];
    const word = (F.s?.label || H12(F)[1] || '').slice(0, 8); const rows = [...word].length > 4 ? [word.slice(0, Math.ceil(word.length / 2)), word.slice(Math.ceil(word.length / 2))] : [word];
    const img = imageOf(it, t); const e = easeOut(clamp((t - p.start) / 0.45));
    rows.forEach((r, j) => { const sz = fitFont(ctx, r, rows.length > 1 ? 200 : 260, W - 80, 900); maskedText(ctx, r, W / 2, (rows.length > 1 ? 300 : 400) + j * 215 + (1 - e) * 40, sz, img, e, F.look.grade, t); });
    const R = { x: 60, y: 760, w: W - 120, h: 780 };
    ctx.save(); ctx.translate(0, (1 - e) * 120); ctx.globalAlpha = e; shadow(ctx, 'rgba(0,0,0,0.2)', 40, 16); ctx.fillStyle = '#fff'; rr(ctx, R.x, R.y, R.w, R.h, 40); ctx.fill(); noShadow(ctx);
    pm(F, it, R, { r: 40 }); ctx.restore(); F.mediaR = R;
  },
  /** 老电视：木壳电视机，画面在屏幕里 */
  tv(F) {
    const { ctx, t } = F; const it = F.sc.items[0];
    const B = { x: 70, y: 430, w: 940, h: 860 }; const S = { x: 120, y: 490, w: 660, h: 640, r: 70 };
    ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(540, 430); ctx.lineTo(380, 230); ctx.moveTo(540, 430); ctx.lineTo(720, 250); ctx.stroke();
    ctx.fillStyle = '#3b2414'; ctx.beginPath(); ctx.arc(540, 430, 30, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#3b2414'; ctx.fillRect(180, 1290, 30, 90); ctx.fillRect(870, 1290, 30, 90);
    shadow(ctx, 'rgba(40,20,10,0.5)', 40, 20); ctx.fillStyle = '#8a5a35'; rr(ctx, B.x, B.y, B.w, B.h, 60); ctx.fill(); noShadow(ctx);
    ctx.fillStyle = '#a8744a'; rr(ctx, B.x + 16, B.y + 16, B.w - 32, B.h - 32, 48); ctx.fill();
    ctx.fillStyle = '#2b1a0f'; rr(ctx, S.x - 22, S.y - 22, S.w + 44, S.h + 44, S.r + 16); ctx.fill();
    // 右边的旋钮和喇叭
    ctx.fillStyle = '#e8d4b0'; rr(ctx, 820, 500, 150, 740, 24); ctx.fill();
    [[895, 600], [895, 780]].forEach(([x, y], k) => { ctx.fillStyle = '#3b2414'; ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c9a77a'; ctx.beginPath(); ctx.arc(x, y, 36, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 6; const a = k ? 0.6 : F.idx * 0.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); ctx.stroke(); });
    ctx.fillStyle = 'rgba(59,36,20,0.6)'; for (let y = 900; y < 1200; y += 24) ctx.fillRect(845, y, 100, 8);
    F.screen = S;
    if (F.sc.layout !== 'type') {
      pm(F, it, S, { r: S.r }); F.mediaR = S;
      ctx.save(); shapePath(ctx, S, 'rect', S.r); ctx.clip(); scanlines(ctx, 0.22, S);
      const g = ctx.createRadialGradient(S.x + S.w / 2, S.y + S.h / 2, S.w * 0.3, S.x + S.w / 2, S.y + S.h / 2, S.w * 0.75); g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = g; ctx.fillRect(S.x, S.y, S.w, S.h);
      // 换台：雪花 + 频道号
      const k = clamp((t - F.p.start) / 0.35); if (k < 1) { grain(ctx, S, t * 3, 1 - k, 'source-over'); }
      const ch = clamp((t - F.p.start) / 1.6); if (ch < 1) { font(ctx, 56, 900); ctx.fillStyle = '#7dff7a'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(`CH ${String(F.idx + 1).padStart(2, '0')}`, S.x + S.w - 40, S.y + 36); noShadow(ctx); }
      ctx.restore();
    }
  },
  /** 泡泡：一个大圆 + 两个小圆绕着漂 */
  bubbles(F) {
    const { ctx, skin, t, p } = F; const items = F.sc.items;
    const spots = [{ x: 540, y: 900, r: 390 }, { x: 225, y: 1360, r: 165 }, { x: 860, y: 520, r: 135 }];
    F.mediaR = { x: 150, y: 510, w: 780, h: 780, noDim: true };
    items.forEach((it, c) => {
      const S = spots[c]; const s = pop(t, p.start + 0.05 + c * 0.2, 0.35); if (s <= 0) return;
      const bob = c ? Math.sin(t * 2 + c) * 14 : Math.sin(t * 1.3) * 6; const cy = S.y + bob;
      withPop(ctx, s, S.x, cy, () => {
        ctx.fillStyle = '#ffffff'; shadow(ctx, 'rgba(120,40,120,0.3)', 30, 12); ctx.beginPath(); ctx.arc(S.x, cy, S.r + 16, 0, Math.PI * 2); ctx.fill(); noShadow(ctx);
        ctx.strokeStyle = c === 1 ? skin.hl : skin.chip1; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(S.x, cy, S.r + 30, 0, Math.PI * 2); ctx.stroke();
        pm(F, it, { x: S.x - S.r, y: cy - S.r, w: S.r * 2, h: S.r * 2 }, { shape: 'circle', c });
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(S.x - S.r * 0.45, cy - S.r * 0.5, S.r * 0.18, S.r * 0.1, -0.6, 0, Math.PI * 2); ctx.fill();
      });
    });
  },
  /** 撞色：黑粗边 + 硬阴影的方块照片 */
  brutal(F) {
    const { ctx, skin, t, p, idx } = F; const items = F.sc.items;
    const spots = items.length > 1 ? [{ x: 80, y: 380, w: 760, h: 860, r: -0.02 }, { x: 560, y: 1000, w: 440, h: 440, r: 0.045 }] : [{ x: 80, y: 400, w: 920, h: 1020, r: (idx % 2 ? 1 : -1) * 0.015 }];
    F.mediaR = { x: 80, y: 380, w: 920, h: 1060, noDim: true };
    spots.forEach((S, c) => {
      const it = items[c]; const s = pop(t, p.start + c * 0.25, 0.3); if (s <= 0) return;
      const ce = easeOut(cutE(F, it, 0.25));
      withPop(ctx, s, S.x + S.w / 2, S.y + S.h / 2, () => {
        ctx.save(); ctx.translate(S.x + S.w / 2, S.y + S.h / 2); ctx.rotate(S.r + (1 - ce) * 0.05); ctx.translate(-(S.x + S.w / 2), -(S.y + S.h / 2));
        ctx.fillStyle = '#000'; ctx.fillRect(S.x + 22, S.y + 22, S.w, S.h);
        pm(F, it, S, { c });
        ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeRect(S.x, S.y, S.w, S.h);
        ctx.restore();
      });
    });
    // 转着的贴纸
    const s2 = pop(t, p.start + 0.5, 0.3); if (s2 > 0) {
      ctx.save(); ctx.translate(items.length > 1 ? 880 : 900, 420); ctx.scale(s2, s2); ctx.rotate(t * 0.8);
      ctx.fillStyle = skin.chip1; ctx.beginPath(); for (let k = 0; k < 24; k++) { const r = k % 2 ? 82 : 100; const a = (k * Math.PI) / 12; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0); } ctx.closePath(); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.rotate(-t * 0.8 - 0.2); font(ctx, 40, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('实拍', 0, 2);
      ctx.restore();
    }
  },
  /** 聊天记录：图片消息 + 文字气泡，一条条往上顶 */
  chat(F) {
    const { ctx, skin, t, tl, script, planData } = F;
    const msgs = [];
    const [h1, h2] = H12(F);
    msgs.push({ kind: 'sys', text: h2 ? `${h1} · ${h2}` : h1, at: 0.1 });
    for (let i = 0; i <= F.idx; i++) {
      const pd = planData[i]; const v = script.sections[i]?.visual || {};
      msgs.push({ kind: 'img', i, at: pd.start });
      const card = visualCard(v); if (card) msgs.push({ kind: 'card', card, at: (pd.steps[0] ?? pd.start + 0.4) });
      tl.sections[i].lines.forEach((ln) => msgs.push({ kind: 'text', text: cleanSub(ln.text), at: ln.start, key: script.sections[i]?.key }));
    }
    const shown = msgs.filter((m) => m.at <= t + 0.001);
    // 每条消息多高
    const IMG_W = 600; const ih = (m) => { const mm = F.mainOf(m.i); const img = mm && (mm.poster || mm); const [iw, ihh] = img ? [img.displayWidth || img.width || 3, img.displayHeight || img.height || 4] : [3, 4]; return Math.round(Math.min(780, Math.max(360, (IMG_W * ihh) / iw))); };
    font(ctx, 44, 700);
    shown.forEach((m) => {
      if (m.kind === 'img') m.h = ih(m) + 30;
      else if (m.kind === 'text') { m.rows = wrap(ctx, m.text, 600, 4); m.h = m.rows.length * 62 + 60; }
      else if (m.kind === 'card') m.h = 110 + m.card.items.length * 62 + 30;
      else m.h = 90;
    });
    const bottom = 1720; let total = 0; shown.forEach((m) => { total += m.h * easeOut(clamp((t - m.at) / 0.3)); });
    let y = Math.min(200, bottom - total);
    shown.forEach((m) => {
      const e = easeOut(clamp((t - m.at) / 0.3)); const h = m.h * e;
      ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 40);
      if (m.kind === 'sys') { font(ctx, 30, 700); const w = Math.min(W - 200, ctx.measureText(m.text).width + 50); ctx.fillStyle = 'rgba(0,0,0,0.1)'; rr(ctx, W / 2 - w / 2, y + 20, w, 54, 14); ctx.fill(); ctx.fillStyle = '#6b707a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitFont(ctx, m.text, 30, w - 40, 700); ctx.fillText(m.text, W / 2, y + 48); }
      else {
        // 头像（都是“我”发的）
        ctx.fillStyle = skin.chip1; rr(ctx, W - 130, y + 6, 92, 92, 16); ctx.fill(); font(ctx, 44, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...F.account][0] || '我', W - 84, y + 54);
        if (m.kind === 'img') {
          const hh = m.h - 30; const R = { x: W - 160 - IMG_W, y: y + 6, w: IMG_W, h: hh };
          const live = m.i === F.idx; pm(F, live ? F.sc.items[0] : { m: F.mainOf(m.i), still: true, lane: 0, start: 0 }, R, { r: 22, c: live ? 0 : 3 });
        } else if (m.kind === 'text') {
          font(ctx, 44, 700); const bw = Math.max(...m.rows.map((r) => ctx.measureText(r).width)) + 64; const bh = m.h - 30; const bx = W - 160 - bw;
          ctx.fillStyle = skin.bubble || '#4c8dff'; rr(ctx, bx, y + 6, bw, bh, 22); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx + bw, y + 36); ctx.lineTo(bx + bw + 16, y + 48); ctx.lineTo(bx + bw, y + 60); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; m.rows.forEach((r, k) => ctx.fillText(r, bx + 32, y + 46 + k * 62));
        } else if (m.kind === 'card') {
          const bw = 640; const bh = m.h - 30; const bx = W - 160 - bw;
          ctx.fillStyle = '#ffffff'; rr(ctx, bx, y + 6, bw, bh, 22); ctx.fill();
          ctx.fillStyle = skin.chip1; rr(ctx, bx, y + 6, 14, bh, [22, 0, 0, 22]); ctx.fill();
          fitFont(ctx, m.card.title, 40, bw - 80, 900); ctx.fillStyle = '#16181d'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(m.card.title, bx + 44, y + 62);
          m.card.items.forEach((s, k) => { fitFont(ctx, s, 38, bw - 110, 700); ctx.fillStyle = '#3a3f4a'; ctx.fillText(`${m.card.mark ? (k + 1) + '.' : '·'} ${s}`, bx + 44, y + 128 + k * 62); });
        }
      }
      ctx.restore();
      y += h;
    });
  },
  /** 极简：白底中间一张 4:5 的图，左右滑着换 */
  clean(F) {
    const { ctx, t, p } = F; const it = F.sc.items[0]; const R = { x: 120, y: 360, w: 840, h: 1050 };
    const e = easeInOut(clamp((t - p.start) / 0.5));
    ctx.save(); ctx.beginPath(); ctx.rect(0, R.y, W, R.h); ctx.clip();
    if (F.idx > 0 && e < 1) pm(F, { m: F.mainOf(F.idx - 1), still: true, lane: 0, start: 0 }, { ...R, x: R.x - W * e }, { c: 3 });
    pm(F, it, { ...R, x: R.x + W * (1 - e) });
    ctx.restore(); F.mediaR = R;
  },
  /** 科技窗口：标题栏 + 角标 + 扫描线 */
  window(F) {
    const { ctx, skin, t } = F; const it = F.sc.items[0]; const X = 60; const Y = 380; const WW = W - 120; const HH = 920;
    shadow(ctx, 'rgba(0,160,255,0.35)', 50, 0); ctx.fillStyle = '#0b1a36'; rr(ctx, X, Y, WW, HH, 18); ctx.fill(); noShadow(ctx);
    ctx.fillStyle = '#12284f'; rr(ctx, X, Y, WW, 64, [18, 18, 0, 0]); ctx.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X + 40 + k * 36, Y + 32, 11, 0, Math.PI * 2); ctx.fill(); });
    font(ctx, 28, 700); ctx.fillStyle = 'rgba(200,230,255,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${F.s?.label || 'scene'}_${String(F.idx + 1).padStart(2, '0')}.mp4`, W / 2, Y + 33);
    const R = { x: X + 10, y: Y + 64, w: WW - 20, h: HH - 74 };
    pm(F, it, R); F.mediaR = R;
    // 扫描线 + 角标
    const sy = R.y + ((t * 260) % R.h); ctx.fillStyle = grad(ctx, sy - 60, sy, 'rgba(100,220,255,0)', 'rgba(100,220,255,0.25)'); ctx.fillRect(R.x, Math.max(R.y, sy - 60), R.w, Math.min(60, sy - R.y));
    ctx.strokeStyle = skin.hl; ctx.lineWidth = 6; const L = 46;
    [[X - 14, Y - 14, 1, 1], [X + WW + 14, Y - 14, -1, 1], [X - 14, Y + HH + 14, 1, -1], [X + WW + 14, Y + HH + 14, -1, -1]].forEach(([x, y, sx, sy2]) => { ctx.beginPath(); ctx.moveTo(x, y + L * sy2); ctx.lineTo(x, y); ctx.lineTo(x + L * sx, y); ctx.stroke(); });
    font(ctx, 24, 700); ctx.fillStyle = skin.hl; ctx.textAlign = 'left'; ctx.fillText('● REC  1080P  24FPS', R.x + 20, R.y + 34);
    ctx.textAlign = 'right'; ctx.fillText(`[${String(Math.floor(F.t / 60)).padStart(2, '0')}:${String(Math.floor(F.t % 60)).padStart(2, '0')}]`, R.x + R.w - 20, R.y + 34);
  },
  /** 时间轴：左边一根线和节点，右边是当前这段的画面卡片 */
  timeline(F) {
    const { ctx, skin, t, p, idx, script } = F; const it = F.sc.items[0]; const n = script.sections.length;
    const e = easeInOut(clamp((t - p.start) / 0.5)); const gap = 150; const curY = 560;
    const yOf = (i) => curY + (i - idx) * gap + (1 - e) * gap;
    ctx.strokeStyle = '#d5dae4'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(110, 300); ctx.lineTo(110, H); ctx.stroke();
    ctx.strokeStyle = skin.chip1; ctx.beginPath(); ctx.moveTo(110, 300); ctx.lineTo(110, yOf(idx)); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const y = yOf(i); if (y < 280 || y > H + 40) continue;
      const done = i < idx; const cur = i === idx;
      ctx.fillStyle = cur ? skin.chip1 : done ? '#9ba6b8' : '#ffffff'; ctx.strokeStyle = cur ? skin.chip1 : '#c4cbd8'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(110, y, cur ? 34 : 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      font(ctx, cur ? 30 : 24, 900); ctx.fillStyle = cur || done ? '#fff' : '#9ba6b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(done ? '✓' : String(i + 1), 110, y + 2);
      if (!cur && y > 330) { font(ctx, 32, 700); ctx.fillStyle = done ? '#9ba6b8' : '#c0c7d3'; ctx.textAlign = 'left'; ctx.fillText(script.sections[i]?.label || '', 170, y + 2); }
    }
    font(ctx, 40, 900); ctx.fillStyle = '#121826'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.globalAlpha = e; ctx.fillText(F.s?.label || '', 190, curY - 6); ctx.globalAlpha = 1;
    const R = { x: 190, y: curY + 50 + (1 - e) * 200, w: W - 250, h: 720 };
    ctx.save(); ctx.globalAlpha = e; shadow(ctx, 'rgba(30,50,90,0.2)', 40, 16); ctx.fillStyle = '#fff'; rr(ctx, R.x, R.y, R.w, R.h, 28); ctx.fill(); noShadow(ctx);
    pm(F, it, R, { r: 28 }); ctx.restore(); F.mediaR = R;
  },
  /** 上字下图：上面一大块纯色写着这段的小标题，下面是画面 */
  topbig(F) {
    const { ctx, skin, t, p, idx } = F; const it = F.sc.items[0]; const TOP = 740;
    pm(F, it, { x: 0, y: TOP, w: W, h: H - TOP }); F.mediaR = { x: 0, y: TOP, w: W, h: H - TOP };
    ctx.fillStyle = grad(ctx, 1450, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)'); ctx.fillRect(0, 1450, W, H - 1450);
    const col = idx % 2 ? '#141414' : skin.chip1;
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, TOP); ctx.fillStyle = skin.hl; ctx.fillRect(0, TOP - 14, W, 14);
    const word = (F.s?.label || '').slice(0, 8) || H12(F)[1];
    const rows = [...word].length > 4 ? [word.slice(0, Math.ceil(word.length / 2)), word.slice(Math.ceil(word.length / 2))] : [word];
    const s = clamp((t - p.start - 0.05) / 0.25); const sc = 1.5 - 0.5 * easeOut(s);
    rows.forEach((r, j) => {
      const sz = fitFont(ctx, r, rows.length > 1 ? 190 : 230, W - 120, 900);
      ctx.save(); ctx.translate(W / 2, (rows.length > 1 ? 330 : 430) + j * 200); ctx.scale(sc, sc); ctx.globalAlpha = clamp(s * 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = j % 2 ? skin.hl : '#fff'; ctx.fillText(r, 0, 0); ctx.restore();
    });
    void sc;
  },
  /** 左右对开：一边纯色文字栏，一边整条画面；每段换边 */
  spread(F) {
    const { ctx, skin, t, p, idx } = F; const it = F.sc.items[0]; const CW = 400;
    const left = idx % 2 === 0; const e = easeInOut(clamp((t - p.start) / 0.45));
    const colX = left ? -CW * (1 - e) : W - CW * e;
    const R = left ? { x: CW, y: 0, w: W - CW, h: H } : { x: 0, y: 0, w: W - CW, h: H };
    pm(F, it, R); F.mediaR = R;
    const bg = idx % 2 ? skin.hl : '#111111'; const ink = idx % 2 ? '#111' : '#fff';
    ctx.fillStyle = bg; ctx.fillRect(colX, 0, CW, H);
    ctx.save(); ctx.beginPath(); ctx.rect(colX, 0, CW, H); ctx.clip();
    font(ctx, 150, 900); ctx.fillStyle = idx % 2 ? 'rgba(0,0,0,0.18)' : skin.hl; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(idx + 1).padStart(2, '0'), colX + 36, 300);
    const lab = (F.s?.label || '').slice(0, 6); const n = [...lab].length; const vs = Math.min(110, Math.floor(700 / Math.max(1, n) / 1.08));
    vText(ctx, lab, colX + 90, 420 + vs / 2, vs, ink);
    ctx.restore();
    F.colX = colX; F.colInk = ink;
  },
  /** 九宫格：九块画面，一拍翻一块 */
  grid9(F) {
    const { ctx, t, p } = F; const g = 8; const cw = (W - g * 2) / 3; const ch = (H - g * 2) / 3;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    F.sc.items.forEach((it, c) => {
      const R = { x: (c % 3) * (cw + g), y: Math.floor(c / 3) * (ch + g), w: cw, h: ch };
      const k0 = clamp((t - p.start - [4, 1, 3, 5, 0, 7, 2, 8, 6][c] * 0.05) / 0.25); if (k0 <= 0) return;
      const fl = easeOut(Math.min(k0, cutE(F, it, 0.25)));
      ctx.save(); ctx.translate(R.x + R.w / 2, R.y + R.h / 2); ctx.scale(Math.max(0.02, fl), 1); ctx.translate(-(R.x + R.w / 2), -(R.y + R.h / 2));
      pm(F, it, R, { c });
      if (c !== 4) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(R.x, R.y, R.w, R.h); }
      ctx.restore();
    });
    ctx.strokeStyle = F.skin.hl; ctx.lineWidth = 8; ctx.strokeRect(cw + g + 4, ch + g + 4, cw - 8, ch - 8);
  },
  /** 卡片滑动：一摞卡片，换画面时最上面一张甩出去 */
  cards(F) {
    const { ctx, t } = F; const it = F.sc.items[0]; const R = { x: 110, y: 340, w: 860, h: 1080 };
    const e = cutE(F, it, 0.5); const seq = F.seq; const cur = F.sc.cutK;
    const back = (j, s, rot, dy) => { const m = seq[(cur + j) % seq.length]; ctx.save(); ctx.translate(W / 2, R.y + R.h / 2 + dy); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-W / 2, -(R.y + R.h / 2));
      shadow(ctx, 'rgba(40,60,90,0.2)', 30, 12); ctx.fillStyle = '#fff'; rr(ctx, R.x - 16, R.y - 16, R.w + 32, R.h + 32, 44); ctx.fill(); noShadow(ctx);
      pm(F, { m, still: true, lane: 0, start: 0 }, R, { r: 32, c: j + 3 }); ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, R.x, R.y, R.w, R.h, 32); ctx.fill(); ctx.restore(); };
    const ee = easeOut(e);
    back(2, 0.86, 0.06, 70); back(1, 0.93 + 0.07 * ee * 0, -0.04, 36);
    // 当前这张：从第二张的位置升上来
    ctx.save(); ctx.translate(W / 2, R.y + R.h / 2 + 36 * (1 - ee)); ctx.rotate(-0.04 * (1 - ee)); ctx.scale(0.93 + 0.07 * ee, 0.93 + 0.07 * ee); ctx.translate(-W / 2, -(R.y + R.h / 2));
    shadow(ctx, 'rgba(40,60,90,0.28)', 40, 16); ctx.fillStyle = '#fff'; rr(ctx, R.x - 16, R.y - 16, R.w + 32, R.h + 32, 44); ctx.fill(); noShadow(ctx);
    pm(F, it, R, { r: 32 }); F.mediaR = R;
    const lab = F.s?.label || ''; if (lab) { font(ctx, 34, 900); const w = ctx.measureText(lab).width + 50; ctx.fillStyle = 'rgba(255,255,255,0.92)'; rr(ctx, R.x + 30, R.y + R.h - 90, w, 60, 30); ctx.fill(); ctx.fillStyle = '#2b2540'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, R.x + 55, R.y + R.h - 58); }
    ctx.restore();
    // 上一张被甩出去
    if (it.prev && e < 1) {
      const dir = F.sc.cutK % 2 ? 1 : -1;
      ctx.save(); ctx.translate(W / 2 + dir * W * 1.1 * easeOut(e), R.y + R.h / 2 - 120 * e); ctx.rotate(dir * 0.35 * e); ctx.globalAlpha = 1 - e * 0.5; ctx.translate(-W / 2, -(R.y + R.h / 2));
      ctx.fillStyle = '#fff'; rr(ctx, R.x - 16, R.y - 16, R.w + 32, R.h + 32, 44); ctx.fill();
      pm(F, { ...it, m: it.prev, still: true }, R, { r: 32 }); ctx.restore();
    }
  },
  /** 国风：月洞窗（圆）/ 拱门交替，木框 */
  moon(F) {
    const { ctx, idx } = F; const it = F.sc.items[0];
    const arch = idx % 2 === 1;
    const R = arch ? { x: 150, y: 400, w: 680, h: 1020 } : { x: 100, y: 480, w: 760, h: 760 };
    const shape = arch ? 'arch' : 'circle';
    shadow(ctx, 'rgba(60,40,20,0.35)', 30, 10); ctx.fillStyle = '#5a3d2b'; shapePath(ctx, { x: R.x - 26, y: R.y - 26, w: R.w + 52, h: R.h + 52 }, shape); ctx.fill(); noShadow(ctx);
    ctx.fillStyle = '#c9a66b'; shapePath(ctx, { x: R.x - 10, y: R.y - 10, w: R.w + 20, h: R.h + 20 }, shape); ctx.fill();
    pm(F, it, R, { shape }); F.mediaR = { ...R, noDim: true };
    // 梅枝
    ctx.save(); ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 340); ctx.quadraticCurveTo(160, 360, 260, 300); ctx.moveTo(150, 350); ctx.quadraticCurveTo(200, 420, 300, 430); ctx.stroke();
    [[255, 296], [300, 430], [180, 340], [220, 395], [120, 345]].forEach(([x, y], k) => { ctx.fillStyle = k % 2 ? '#d9534f' : '#c0362c'; ctx.beginPath(); ctx.arc(x, y, 14 + (k % 3) * 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  },
};

/** 聊天里的贴片变成一张“卡片消息” */
function visualCard(v) {
  switch (v?.type) {
    case 'chips': return { title: '划重点', items: (v.items || []).map((s) => '#' + s).slice(0, 4) };
    case 'steps': return { title: v.title || '上课流程', items: (v.items || []).slice(0, 4), mark: true };
    case 'checklist': return { title: v.title || '我们做到', items: (v.items || []).slice(0, 4).map((s) => '✓ ' + s) };
    case 'quote': return { title: v.by ? `${v.by} 说` : '一句话', items: wrapPlain(v.text || '', 15).slice(0, 3) };
    case 'stat': return { title: v.label || '数据', items: [`${v.big || ''}${v.unit || ''}`, v.sub].filter(Boolean) };
    case 'compare': return { title: `${v.left?.label || '别处'} vs ${v.right?.label || '我们'}`, items: (v.right?.items || []).slice(0, 3).map((s) => '✓ ' + s) };
    case 'qa': return { title: `${v.who || '家长'}问：${v.q || ''}`.slice(0, 18), items: wrapPlain(v.a || '', 15).slice(0, 2) };
    case 'nametag': return { title: v.name || '', items: [v.role].filter(Boolean) };
    case 'location': return { title: '📍 ' + (v.place || ''), items: [v.note].filter(Boolean) };
    case 'cta': return { title: v.text || '关注我', items: [v.sub].filter(Boolean) };
    case 'ticker': return { title: v.label || '划重点', items: wrapPlain(v.text || '', 15).slice(0, 2) };
    case 'big': case 'hook': return { title: (v.lines || [])[0] || '', items: (v.lines || []).slice(1) };
    case 'stamp': return { title: v.text || '', items: [v.note].filter(Boolean) };
    case 'polaroid': return v.caption ? { title: v.caption, items: [] } : null;
    case 'focus': return v.label ? { title: '注意看：' + v.label, items: [] } : null;
    default: return null;
  }
}
const wrapPlain = (s, n) => { const cs = [...String(s)]; const out = []; for (let i = 0; i < cs.length; i += n) out.push(cs.slice(i, i + n).join('')); return out; };

// =====================================================================
// 最上层的界面装饰
// =====================================================================
const acct = (F) => F.account;
export const DECOS = {
  none() {},
  /** 卡点：顶上一排分段进度条（每段一格） */
  stories(F) {
    const { ctx, script, planData, t } = F; const n = script.sections.length; const g = 8; const w = (W - 80 - g * (n - 1)) / n;
    for (let i = 0; i < n; i++) { const pd = planData[i]; const k = clamp((t - pd.start) / Math.max(0.1, pd.end - pd.start)); ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(ctx, 40 + i * (w + g), 40, w, 8, 4); ctx.fill(); if (k > 0) { ctx.fillStyle = '#fff'; rr(ctx, 40 + i * (w + g), 40, w * k, 8, 4); ctx.fill(); } }
    font(ctx, 30, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.fillText('@' + acct(F), W - 50, 90); noShadow(ctx);
  },
  /** 三屏：每条右边一个序号 */
  tri(F) {
    const { ctx, skin } = F; const bh = (H - 12) / 3;
    for (let c = 0; c < 3; c++) { font(ctx, 30, 900); ctx.fillStyle = skin.hl; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`0${c + 1}`, W - 40, c * (bh + 6) + bh - 40); }
    font(ctx, 30, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('@' + acct(F), W - 40, 80);
  },
  /** 斜切：右上角账号 + 速度线 */
  slash(F) {
    const { ctx, skin, t } = F;
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    for (let k = 0; k < 6; k++) { const y = 560 + k * 26; const x = (((t * 900 + k * 160) % (W + 400)) - 200); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 120, y - 40); ctx.stroke(); }
    ctx.restore();
    slantText(ctx, '@' + acct(F), W - 50, 1860, 34, skin.hl, { align: 'right' });
  },
  comic(F) {
    const { ctx } = F; font(ctx, 30, 900); const txt = '@' + acct(F); const w = ctx.measureText(txt).width + 40;
    ctx.fillStyle = '#000'; ctx.fillRect(W - 60 - w + 6, 1770 + 6, w, 60); ctx.fillStyle = '#fff'; ctx.fillRect(W - 60 - w, 1770, w, 60); ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeRect(W - 60 - w, 1770, w, 60);
    ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W - 60 - w / 2, 1802);
  },
  /** 笔记：底部一栏：头像 + 账号 + 点赞收藏 */
  note(F) {
    const { ctx, skin } = F; const y = 1830;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, y - 60, W, H - y + 60); ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, y - 60, W, 2);
    ctx.fillStyle = skin.chip1; ctx.beginPath(); ctx.arc(100, y, 36, 0, Math.PI * 2); ctx.fill(); font(ctx, 34, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...acct(F)][0] || '我', 100, y + 2);
    font(ctx, 34, 900); ctx.fillStyle = '#23262d'; ctx.textAlign = 'left'; ctx.fillText(acct(F), 154, y + 2);
    font(ctx, 34, 700); ctx.fillStyle = '#5c6270'; ctx.textAlign = 'right'; ctx.fillText('♡ 赞    ☆ 收藏    💬 评论', W - 60, y + 2);
  },
  scrap(F) {
    const { ctx } = F; font(ctx, 30, 700); ctx.fillStyle = '#6b5a4c'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('—— @' + acct(F), W - 70, 1850);
  },
  /** 美术馆：右下角馆名 */
  gallery(F) { const { ctx } = F; font(ctx, 26, 700, 6); ctx.fillStyle = '#6d655a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${acct(F)} · 实拍展`, W / 2, 1840); ctx.letterSpacing = '0px'; },
  /** 报纸：页脚 */
  paper(F) { const { ctx } = F; ctx.fillStyle = '#16130f'; ctx.fillRect(60, 1840, W - 120, 2); font(ctx, 26, 700); ctx.fillStyle = '#4a443b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`本报讯 · @${acct(F)}`, W / 2, 1870); },
  /** 胶片：右下帧号 */
  film(F) { const { ctx, skin, t } = F; font(ctx, 26, 700, 4); ctx.fillStyle = skin.hl; ctx.globalAlpha = 0.7; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`@${acct(F)}  ·  ${String(Math.floor(t * 24)).padStart(5, '0')}`, W - 60, 1870); ctx.letterSpacing = '0px'; ctx.globalAlpha = 1; },
  /** 纪录片：小标题条（人名条那种） + 右上角时间 */
  doc(F) {
    const { ctx, skin, t, p } = F; const lab = F.s?.label || ''; const k = clamp((t - p.start - 0.5) / 0.4);
    if (lab && k > 0 && F.sc.layout !== 'type') {
      font(ctx, 44, 900); const w = ctx.measureText(lab).width + 70;
      ctx.save(); ctx.beginPath(); ctx.rect(70, 1360, w * easeOut(k), 140); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(70, 1360, w, 80); ctx.fillStyle = skin.hl; ctx.fillRect(70, 1440, w, 8);
      ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, 105, 1402);
      font(ctx, 28, 700); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(`实拍 · ${acct(F)}`, 72, 1482);
      ctx.restore();
    }
  },
  mono(F) { const { ctx } = F; font(ctx, 26, 700, 6); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('@' + acct(F), W - 70, 1860); ctx.letterSpacing = '0px'; },
  mask(F) { const { ctx } = F; font(ctx, 28, 900); ctx.fillStyle = '#16140f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@' + acct(F), W / 2, 1860); },
  tv(F) { const { ctx } = F; font(ctx, 30, 900); ctx.fillStyle = '#fff3d6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@' + acct(F), W / 2, 1860); },
  /** 港风：右下角橙色日期戳 */
  hk(F) {
    const { ctx } = F; const d = new Date(); const txt = `'${String(d.getFullYear()).slice(2)}  ${d.getMonth() + 1}  ${d.getDate()}`;
    font(ctx, 52, 700, 4); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(255,120,0,0.9)'; ctx.shadowBlur = 16; ctx.fillStyle = '#ff9a2e'; ctx.fillText(txt, W - 70, 1830); noShadow(ctx); ctx.letterSpacing = '0px';
    font(ctx, 28, 700); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'left'; ctx.fillText('@' + acct(F), 70, 1830);
  },
  bubble(F) { const { ctx, skin } = F; font(ctx, 30, 900); const txt = '@' + acct(F); const w = ctx.measureText(txt).width + 50; ctx.fillStyle = 'rgba(255,255,255,0.85)'; rr(ctx, W / 2 - w / 2, 1810, w, 60, 30); ctx.fill(); ctx.fillStyle = skin.chip2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W / 2, 1841); },
  brutal(F) { const { ctx } = F; font(ctx, 30, 900); ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`@${acct(F)}  ★  实拍`, 60, 1860); },
  /** 直播间：左上角主播信息 + “正在上课” + 右边飘爱心 */
  live(F) {
    const { ctx, skin, t } = F;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, 30, 80, 470, 104, 52); ctx.fill();
    ctx.fillStyle = skin.chip1; ctx.beginPath(); ctx.arc(82, 132, 42, 0, Math.PI * 2); ctx.fill(); font(ctx, 38, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...acct(F)][0] || '我', 82, 134);
    fitFont(ctx, acct(F), 36, 230, 900); ctx.textAlign = 'left'; ctx.fillText(acct(F), 140, 116);
    font(ctx, 26, 700); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText('正在上课 · 实拍', 140, 156);
    ctx.fillStyle = '#ff2d55'; rr(ctx, 380, 108, 106, 50, 25); ctx.fill(); font(ctx, 28, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('直播', 446, 134);
    if (Math.sin(t * 6) > -0.2) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(402, 133, 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, W - 150, 96, 110, 72, 36); ctx.fill(); font(ctx, 44, 900); ctx.fillStyle = '#fff'; ctx.fillText('×', W - 95, 132);
    // 爱心
    for (let k = 0; k < 7; k++) {
      const per = 2.6; const ph = ((t + k * 0.37) % per) / per; const y = 1760 - ph * 760; const x = W - 110 + Math.sin(ph * 7 + k) * 40;
      ctx.save(); ctx.globalAlpha = 1 - ph; ctx.translate(x, y); ctx.scale(0.6 + ph * 0.6, 0.6 + ph * 0.6);
      ctx.fillStyle = ['#ff4d79', '#ffb020', '#7c5cff', '#28c4ff'][k % 4]; ctx.beginPath(); ctx.moveTo(0, 16); ctx.bezierCurveTo(-34, -8, -18, -38, 0, -18); ctx.bezierCurveTo(18, -38, 34, -8, 0, 16); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(W - 110, 1800, 52, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff2d55'; ctx.save(); ctx.translate(W - 110, 1804); ctx.scale(1.3, 1.3); ctx.beginPath(); ctx.moveTo(0, 16); ctx.bezierCurveTo(-34, -8, -18, -38, 0, -18); ctx.bezierCurveTo(18, -38, 34, -8, 0, 16); ctx.fill(); ctx.restore();
  },
  /** 聊天：顶部标题栏 + 底部输入框 */
  chat(F) {
    const { ctx } = F;
    ctx.fillStyle = '#f7f7f8'; ctx.fillRect(0, 0, W, 170); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 170, W, 2);
    ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(78, 88); ctx.lineTo(54, 112); ctx.lineTo(78, 136); ctx.stroke();
    fitFont(ctx, acct(F), 44, W - 300, 900); ctx.fillStyle = '#1b1d22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(acct(F), W / 2, 112);
    font(ctx, 50, 900); ctx.textAlign = 'right'; ctx.fillText('···', W - 50, 104);
    ctx.fillStyle = '#f7f7f8'; ctx.fillRect(0, 1780, W, H - 1780); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 1780, W, 2);
    ctx.fillStyle = '#fff'; rr(ctx, 120, 1812, W - 300, 76, 14); ctx.fill();
    ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(66, 1850, 30, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(W - 130, 1850, 30, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(W - 56, 1850, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 70, 1850); ctx.lineTo(W - 42, 1850); ctx.moveTo(W - 56, 1836); ctx.lineTo(W - 56, 1864); ctx.stroke();
  },
  /** 极简：左上大序号 + 右上小标签 + 底部细进度线 */
  clean(F) {
    const { ctx, t, tl, script } = F;
    font(ctx, 30, 700, 4); ctx.fillStyle = '#8c8a85'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${String(F.idx + 1).padStart(2, '0')} / ${String(script.sections.length).padStart(2, '0')}`, W - 120, 200); ctx.letterSpacing = '0px';
    ctx.fillStyle = '#e4e2dc'; ctx.fillRect(120, 1820, W - 240, 3); ctx.fillStyle = '#141414'; ctx.fillRect(120, 1820, (W - 240) * clamp(t / Math.max(1, tl.duration)), 3);
    font(ctx, 26, 700); ctx.fillStyle = '#8c8a85'; ctx.textAlign = 'left'; ctx.fillText('@' + acct(F), 120, 1860);
  },
  /** 科技：底部状态栏 */
  hud(F) {
    const { ctx, skin, t, tl } = F; const k = clamp(t / Math.max(1, tl.duration));
    ctx.fillStyle = 'rgba(10,30,60,0.8)'; ctx.fillRect(0, 1800, W, 120);
    font(ctx, 26, 700); ctx.fillStyle = skin.hl; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`@${acct(F)}  ::  LOADING ${Math.round(k * 100)}%`, 50, 1840);
    ctx.fillStyle = 'rgba(120,220,255,0.2)'; ctx.fillRect(50, 1872, W - 100, 10); ctx.fillStyle = skin.hl; ctx.fillRect(50, 1872, (W - 100) * k, 10);
  },
  timeline(F) { const { ctx } = F; font(ctx, 28, 700); ctx.fillStyle = '#7b8494'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('@' + acct(F), W - 60, 120); },
  topbig(F) { const { ctx } = F; const [h1, h2] = H12(F); const txt = `${h1}${h2 ? ' · ' + h2 : ''}`; fitFont(ctx, txt, 34, W - 160, 900, 2); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W / 2, 90); ctx.letterSpacing = '0px'; font(ctx, 28, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('@' + acct(F), W - 50, 1870); },
  spread(F) {
    const { ctx } = F; const [h1, h2] = H12(F); const x = (F.colX ?? 0) + 40; const ink = F.colInk || '#fff';
    ctx.save(); ctx.beginPath(); ctx.rect(F.colX ?? 0, 0, 400, H); ctx.clip();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; fitFont(ctx, h1, 30, 330, 700); ctx.fillStyle = ink; ctx.globalAlpha = 0.7; ctx.fillText(h1, x, 1150); ctx.globalAlpha = 1;
    if (h2) { fitFont(ctx, h2, 40, 330, 900); ctx.fillText(h2, x, 1200); }
    ctx.fillRect(x, 1240, 60, 5);
    font(ctx, 24, 700); ctx.globalAlpha = 0.7; ctx.fillText('@' + acct(F), x, 1870); ctx.restore();
  },
  grid(F) { const { ctx } = F; font(ctx, 30, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 10; ctx.fillText('@' + acct(F), W / 2, 1860); noShadow(ctx); },
  cards(F) { const { ctx } = F; font(ctx, 28, 900); ctx.fillStyle = '#3b4252'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@' + acct(F), W / 2, 1860); },
  moon(F) { const { ctx } = F; font(ctx, 28, 700, 6); ctx.fillStyle = '#5a4636'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('@' + acct(F), 70, 1860); ctx.letterSpacing = '0px'; },
};
export { gradeIt, coverIn };
