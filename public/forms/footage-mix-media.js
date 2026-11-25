// 实拍混剪：画面素材怎么画（照片 / 视频帧铺进格子、推拉摇移、调色、颗粒），各个版式共用
import { W, H, clamp, hash } from '../engine/draw.js';
import { isClip, clipFrame } from '../engine/footage.js';
import { slantText, fitSlant, grad } from './footage-mix-parts.js';

export const dims = (img) => [img.displayWidth || img.width, img.displayHeight || img.height];
export const clipT = (m, start, t) => (m.offset + Math.max(0, t - start)) % m.clip.dur;
/** 这一刻这个格子该画哪张图：视频取解好的那一帧（没有就用封面），still=true 一律用封面 */
export function imageOf(it, t) {
  const m = it?.m; if (!m) return null;
  const img = isClip(m) ? (it.still ? m.poster : clipFrame(m.clip, clipT(m, it.start, t), it.lane) || m.poster) : m;
  if (!img) return null;
  const [iw, ih] = dims(img);
  return iw && ih ? img : null;
}
export function coverIn(ctx, img, R, z = 1, ox = 0, oy = 0) {
  const [iw, ih] = dims(img);
  const s = Math.max(R.w / iw, R.h / ih) * z;
  const dw = iw * s; const dh = ih * s;
  const fy = ih > iw ? 0.42 : 0.5;
  const x = clamp(R.x + R.w / 2 - dw / 2 + ox, R.x + R.w - dw, R.x);
  const y = clamp(R.y + R.h / 2 - dh * fy + oy, R.y + R.h - dh, R.y);
  ctx.drawImage(img, x, y, dw, dh);
}
let _tiny = null;
export function blurFill(ctx, img, x, y, w, h) {
  if (!_tiny) _tiny = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(54, 96) : Object.assign(document.createElement('canvas'), { width: 54, height: 96 });
  const [iw, ih] = dims(img);
  const tg = _tiny.getContext('2d'); const ts = Math.max(54 / iw, 96 / ih);
  tg.drawImage(img, 27 - (iw * ts) / 2, 48 - (ih * ts) / 2, iw * ts, ih * ts);
  ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(_tiny, x - 40, y - 60, w + 80, h + 120); ctx.restore();
}
/** 推拉摇移：视频轻推，照片按镜头号换花样；k 是这个镜头播到哪（0-1） */
export function motion(isVideo, i, k) {
  if (isVideo) return [1 + 0.05 * k, 0];
  const mode = Math.floor(hash(i * 7 + 3) * 4);
  if (mode === 0) return [1.02 + 0.12 * k, 0];
  if (mode === 1) return [1.14 - 0.12 * k, 0];
  return [1.14, (mode === 2 ? 1 : -1) * (k - 0.5) * 90];
}
export function drawPlaceholder(ctx, label, R) {
  ctx.fillStyle = grad(ctx, R.y, R.y + R.h, '#2a2d36', '#0d0e12'); ctx.fillRect(R.x, R.y, R.w, R.h);
  if (label) { const size = fitSlant(ctx, label, 120, R.w - 80); ctx.globalAlpha = 0.18; slantText(ctx, label, R.x + R.w / 2, R.y + R.h / 2, size, '#ffffff'); ctx.globalAlpha = 1; }
}

// ---------- 调色 / 颗粒 / 扫描线（混合模式，便宜） ----------
let _noise = null;
export function noiseTile() {
  if (!_noise) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = c.getContext('2d'); const d = g.createImageData(256, 256); let s = 7;
    for (let i = 0; i < d.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); _noise = c;
  }
  return _noise;
}
export function grain(ctx, R, t, alpha, op = 'overlay') {
  const pat = ctx.createPattern(noiseTile(), 'repeat');
  const f = Math.floor(t * 24);
  ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
  ctx.translate((f * 73) % 256, (f * 151) % 256); ctx.fillStyle = pat; ctx.fillRect(R.x - 256, R.y - 256, R.w + 512, R.h + 512); ctx.restore();
}
export function vignette(ctx, R, a) {
  const g = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h / 2, Math.min(R.w, R.h) * 0.3, R.x + R.w / 2, R.y + R.h / 2, Math.hypot(R.w, R.h) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
}
export function blend(ctx, R, op, color) { ctx.save(); ctx.globalCompositeOperation = op; ctx.fillStyle = color; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.restore(); }
/** 调色：每套版式一种色调 */
export function gradeIt(ctx, kind, R, t) {
  switch (kind) {
    case 'punch': blend(ctx, R, 'overlay', 'rgba(255,190,0,0.10)'); vignette(ctx, R, 0.35); break;
    case 'warm': blend(ctx, R, 'soft-light', 'rgba(255,222,170,0.5)'); blend(ctx, R, 'screen', 'rgba(70,50,30,0.10)'); break;
    case 'film': blend(ctx, R, 'saturation', 'rgba(128,128,128,0.78)'); blend(ctx, R, 'soft-light', 'rgba(20,95,115,0.45)'); vignette(ctx, R, 0.5); grain(ctx, R, t, 0.13); break;
    case 'cool': blend(ctx, R, 'soft-light', 'rgba(70,130,255,0.18)'); break;
    case 'vhs': blend(ctx, R, 'overlay', 'rgba(255,110,40,0.18)'); blend(ctx, R, 'saturation', 'rgba(255,0,60,0.12)'); vignette(ctx, R, 0.6); grain(ctx, R, t, 0.16); break;
    case 'vivid': blend(ctx, R, 'saturation', 'rgba(255,0,140,0.28)'); blend(ctx, R, 'soft-light', 'rgba(255,140,210,0.18)'); break;
    // ---- 新版式用的 ----
    case 'mono': blend(ctx, R, 'saturation', '#808080'); blend(ctx, R, 'soft-light', 'rgba(0,0,0,0.25)'); grain(ctx, R, t, 0.1); break;
    case 'amber': blend(ctx, R, 'soft-light', 'rgba(255,170,60,0.55)'); blend(ctx, R, 'saturation', 'rgba(128,128,128,0.35)'); vignette(ctx, R, 0.55); grain(ctx, R, t, 0.12); break;
    case 'hk': blend(ctx, R, 'soft-light', 'rgba(0,140,120,0.35)'); blend(ctx, R, 'overlay', 'rgba(255,80,40,0.16)'); vignette(ctx, R, 0.45); grain(ctx, R, t, 0.08); break;
    case 'fresh': blend(ctx, R, 'soft-light', 'rgba(255,255,255,0.28)'); blend(ctx, R, 'screen', 'rgba(40,60,80,0.08)'); break;
    case 'pastel': blend(ctx, R, 'screen', 'rgba(255,200,230,0.12)'); blend(ctx, R, 'soft-light', 'rgba(255,240,250,0.3)'); break;
    case 'teal': blend(ctx, R, 'soft-light', 'rgba(0,120,160,0.3)'); blend(ctx, R, 'overlay', 'rgba(255,150,60,0.1)'); vignette(ctx, R, 0.3); break;
    case 'news': blend(ctx, R, 'saturation', '#808080'); blend(ctx, R, 'multiply', 'rgba(235,225,205,1)'); grain(ctx, R, t, 0.18, 'multiply'); break;
    case 'ink': blend(ctx, R, 'saturation', 'rgba(128,128,128,0.45)'); blend(ctx, R, 'soft-light', 'rgba(230,210,170,0.45)'); break;
    case 'neon': blend(ctx, R, 'soft-light', 'rgba(90,40,255,0.3)'); blend(ctx, R, 'overlay', 'rgba(0,220,255,0.1)'); vignette(ctx, R, 0.4); break;
    case 'pop': blend(ctx, R, 'saturation', 'rgba(255,60,0,0.22)'); blend(ctx, R, 'overlay', 'rgba(255,210,0,0.08)'); break;
    default: break;
  }
}
let _scan = null;
export function scanlines(ctx, a, R = { x: 0, y: 0, w: W, h: H }) {
  if (!_scan) { _scan = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 6) : Object.assign(document.createElement('canvas'), { width: 4, height: 6 }); const g = _scan.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 2); }
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = ctx.createPattern(_scan, 'repeat'); ctx.fillRect(R.x, R.y, R.w, R.h); ctx.restore();
}
export function darker(hex, amt = 0.35) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * (1 - amt)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

/** 按形状剪出一块区域（矩形 / 圆角 / 圆 / 拱门 / 多边形） */
export function shapePath(ctx, R, shape = 'rect', r = 0, pts = null) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(R.x + R.w / 2, R.y + R.h / 2, Math.min(R.w, R.h) / 2, 0, Math.PI * 2);
  else if (shape === 'arch') { const rad = R.w / 2; ctx.moveTo(R.x, R.y + R.h); ctx.lineTo(R.x, R.y + rad); ctx.arc(R.x + rad, R.y + rad, rad, Math.PI, 0); ctx.lineTo(R.x + R.w, R.y + R.h); ctx.closePath(); }
  else if (shape === 'poly' && pts) { pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  else if (r) ctx.roundRect(R.x, R.y, R.w, R.h, r);
  else ctx.rect(R.x, R.y, R.w, R.h);
}

/**
 * 把一个画面铺进区域 R：裁切形状 + 推拉摇移 + 调色；横屏素材放进竖长格子时，模糊垫底 + 完整画面
 * o: {shape, r, pts, z, gradeKind, label, k(镜头进度 0-1), seed, still, fit:'cover'|'contain'}
 */
export function paintMedia(ctx, it, R, t, o = {}) {
  ctx.save();
  shapePath(ctx, R, o.shape, o.r, o.pts); ctx.clip();
  const img = imageOf(it, t);
  if (img) {
    const video = isClip(it.m);
    const [z, ox] = o.still ? [1.04, 0] : motion(video, o.seed ?? 0, clamp(o.k ?? 0.5));
    const [iw, ih] = dims(img);
    const zz = z * (o.z || 1);
    if (o.fit === 'contain' || (iw / ih > 1.15 && R.h / R.w > 1.35)) {
      blurFill(ctx, img, R.x, R.y, R.w, R.h); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(R.x, R.y, R.w, R.h);
      const s = Math.min(R.w / iw, R.h / ih) * (o.fit === 'contain' ? 1 : 1.18) * zz; const dw = iw * s; const dh = ih * s;
      ctx.drawImage(img, R.x + R.w / 2 - dw / 2, R.y + R.h * 0.42 - dh / 2, dw, dh);
    } else coverIn(ctx, img, R, zz, ox * (R.w / W));
    if (o.gradeKind) gradeIt(ctx, o.gradeKind, R, t);
  } else drawPlaceholder(ctx, o.label, R);
  ctx.restore();
  return !!img;
}
