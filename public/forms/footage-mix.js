// 形式 07：实拍混剪
// 灵魂：客户自己拍的照片和视频是素材，但不是一直垫在底下的背景——
// 每个镜头先决定“怎么摆”：整屏、卡片、上下分屏、左右分屏、一大两小、四宫格、拍立得叠放、画中画、圆形画框，
// 讲观点的镜头直接变成大字排版画面；节奏快的版式一句话换一个画面。
// 防审美疲劳：6 套版式（skins）彼此差别很大：调色、背景、画面摆法、标题、字幕、转场、音效、背景音乐全都不同；
// 每次生成自动换一套（最近用过的不重复），同一套里构图和转场也按随机种子变化。
import { W, H, clamp, easeOut, font, fitFont, hash } from '../engine/draw.js';
import { loadFontFaces } from '../engine/font-preload.js';
import { THEMES, themeEmoji, normalizeTheme, EMOJI_FONT, drawWallpaper } from './themes.js';
import { isClip, clipFrame, prepareClip } from '../engine/footage.js';
import { SKEW, PIXEL_FAMILY, pop, withPop, rr, slantText, fitSlant, grad, pixelFont, fitPixel, flowerText, drawOverlay } from './footage-mix-parts.js';

export const meta = {
  id: 'footage-mix',
  name: '实拍混剪',
  category: '获客引流',
  outcome: '用你自己拍的课堂、校区、学员视频和照片出片，真实画面最让人信任',
  ideas: ['带大家看看我们的上课现场', '学员从零基础到能接单', '暑假班开课第一天', '我们和别的机构有什么不一样'],
  tagline: '你自己的照片和视频做主角，6 套版式每次自动换着用',
  fits: '课堂实拍 · 校区展示 · 学员成果 · 招生宣传',
  durations: [1, 2, 3],
  bgm: 'pop',
  needsStock: true,
  coverIdx: 2,
  photoKind: 'footage',
  autoSkin: true, // 每条视频自己带版式（script.look），不沿用上一条
  photoHint: '上传你自己拍的课堂、校区、学员、作品的照片和视频（视频每个最多取 30 秒，原声会去掉，换成配音和音乐）。越多越好，不够的镜头自动用素材库补。只存在你自己的电脑里。',
};

// ---------- 6 套版式 ----------
// bleed：画面贴边铺满；layouts.single：有贴片的镜头怎么摆；layouts.montage：纯画面镜头怎么拼
// typeRate：讲观点的镜头变成大字画面的概率；subcut：一句话换一个画面
// grade：调色；bg：背景；title / sub / deco：标题、字幕、装饰；trans：转场；sfx：音效；bgm：背景音乐
export const skins = {
  bold: {
    name: '爆款快剪', bgm: 'phonk', bleed: true, layouts: { single: ['full'], montage: ['full', 'split2', 'trio'] }, typeRate: 0.8, subcut: true,
    grade: 'punch', bg: 'stripes', title: 'band', sub: 'slam', subY: 1440, trans: ['whip', 'zoom', 'flash', 'shake'], deco: 'bar', chip: 'grad', themed: true,
    sfx: { intro: 'impact', cut: 'whoosh', sub: 'swish', pop: 'pop', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#ffe12e', chip1: '#ff3b2f', chip2: '#c41d12', card: '#ffffff', cardInk: '#c41d12', dark: 'rgba(10,12,18,0.86)', bg1: '#111111', bg2: '#000000',
  },
  mag: {
    name: '杂志画报', bgm: 'warm', bleed: false, layouts: { single: ['card'], montage: ['grid4', 'stack', 'trio', 'split2'] }, typeRate: 0.55, subcut: false,
    grade: 'warm', bg: 'paper', title: 'mag', sub: 'ink', subY: 1530, trans: ['page', 'drop'], deco: 'mag', chip: 'flat', themed: true,
    sfx: { intro: 'shutter', cut: 'paper', pop: 'click', type: 'paper', cell: 'shutter', end: 'ding' },
    ink: '#ffffff', hl: '#ff6f3c', chip1: '#ff6f3c', chip2: '#e04e1c', card: '#ffffff', cardInk: '#e04e1c', dark: 'rgba(29,26,22,0.88)', paper: '#f4eee4', paperInk: '#1f1b16', bg1: '#e9e1d3', bg2: '#d9cfbe',
  },
  cinema: {
    name: '电影叙事', bgm: 'story', bleed: false, layouts: { single: ['letter'], montage: ['letter', 'letter2'] }, typeRate: 0.7, subcut: false,
    grade: 'film', bg: 'black', title: 'cine', sub: 'cine', subY: 1560, trans: ['fade', 'iris', 'blinds'], deco: 'cine', chip: 'outline',
    sfx: { intro: 'boom', cut: 'whoosh', cutGain: 0.35, pop: 'click', type: 'boom', cell: 'click', end: 'boom' },
    ink: '#ffffff', hl: '#f1d39a', chip1: '#3a3328', chip2: '#1e1a14', card: '#f6efe2', cardInk: '#7a5a2a', dark: 'rgba(0,0,0,0.78)', bg1: '#141414', bg2: '#050505',
  },
  news: {
    name: '新闻现场', bgm: 'tech', bleed: true, layouts: { single: ['full', 'pip'], montage: ['side', 'pip', 'split2'] }, typeRate: 0.5, subcut: false,
    grade: 'cool', bg: 'studio', title: 'news', sub: 'bar', subY: 1400, trans: ['sting', 'wipe'], deco: 'news', chip: 'flat',
    sfx: { intro: 'sting', cut: 'swish', pop: 'click', type: 'sting', cell: 'swish', end: 'sting' },
    ink: '#ffffff', hl: '#ffd400', chip1: '#e8202a', chip2: '#a8121a', card: '#ffffff', cardInk: '#c8161f', dark: 'rgba(10,22,48,0.9)', bar: '#0f2a5c', bg1: '#13233f', bg2: '#060c18',
  },
  dv: {
    name: 'DV 日记', bgm: 'chip', bleed: true, layouts: { single: ['full'], montage: ['full', 'stack', 'grid4'] }, typeRate: 0.55, subcut: true,
    grade: 'vhs', bg: 'noise', title: 'dv', sub: 'type', subY: 1450, trans: ['static', 'glitch', 'shake'], deco: 'dv', chip: 'pixel',
    sfx: { intro: 'beep', cut: 'static', sub: 'click', pop: 'click', type: 'key', cell: 'shutter', end: 'beep' },
    ink: '#ffffff', hl: '#7dff9a', chip1: '#161616', chip2: '#000000', card: '#111111', cardInk: '#7dff9a', dark: 'rgba(0,0,0,0.8)', bg1: '#161616', bg2: '#000000',
  },
  pop: {
    name: '综艺花字', bgm: 'pop', bleed: true, layouts: { single: ['full', 'circle'], montage: ['grid4', 'circle', 'trio'] }, typeRate: 0.65, subcut: true,
    grade: 'vivid', bg: 'dots', title: 'pop', sub: 'flower', subY: 1440, trans: ['burst', 'zoom', 'shake'], deco: 'pop', chip: 'sticker', themed: true,
    sfx: { intro: 'sparkle', cut: 'boing', sub: 'pop', pop: 'pop', type: 'sparkle', cell: 'pop', end: 'sparkle' },
    ink: '#ffffff', hl: '#ffe14d', chip1: '#ff5fa2', chip2: '#d12f7a', card: '#ffffff', cardInk: '#d12f7a', dark: 'rgba(40,10,40,0.82)', bg1: '#ff8cc6', bg2: '#ffb3d9',
  },
};
const LOOK_IDS = Object.keys(skins);
const TYPE_VIS = new Set(['hook', 'big', 'quote', 'stamp', 'stat']);
const NEED = { full: 1, card: 1, letter: 1, circle: 1, pip: 2, split2: 2, side: 2, letter2: 2, trio: 3, stack: 3, grid4: 4, type: 0 };
const CELL_GAP = 0.28; // 拼图里每个格子依次出现的间隔

function darker(hex, amt = 0.35) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * (1 - amt)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
const seedOf = (script) => Number(script.seed) || 1;
const lookOf = (script, skinId) => (skins[skinId] ? skinId : skins[script.look] ? script.look : 'bold');

// ---------- 时间规划 ----------
const itemCount = (v) => {
  switch (v?.type) {
    case 'chips': case 'steps': case 'checklist': return (v.items || []).length;
    case 'hook': case 'big': case 'compare': case 'nametag': case 'location': case 'cta': case 'qa': case 'stat': return 2;
    case 'stamp': return v.note ? 2 : 1;
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
function currentIdx(planData, t) {
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  return idx;
}

// ---------- 每个镜头怎么摆 ----------
const poolOf = (assets) => ((assets?.pool?.length ? assets.pool : assets?.media) || []).filter(Boolean);
function rawLayout(script, look, idx, poolN) {
  const v = script.sections[idx]?.visual?.type || 'shot';
  if (TYPE_VIS.has(v) && (v === 'hook' || hash(seedOf(script) * 0.001 + idx * 1.7) < look.typeRate)) return 'type';
  const list = v === 'shot' && poolN >= 2 ? look.layouts.montage : look.layouts.single;
  const L = list[Math.floor(hash(seedOf(script) * 0.002 + idx * 3.3) * list.length)];
  return poolN >= NEED[L] ? L : look.layouts.single[0];
}
function layoutOf(script, look, idx, poolN) {
  let L = rawLayout(script, look, idx, poolN);
  // 相邻两个镜头别用同一种拼法
  if (L !== 'type' && idx > 0 && L === rawLayout(script, look, idx - 1, poolN)) {
    const v = script.sections[idx]?.visual?.type;
    const list = v === 'shot' && poolN >= 2 ? look.layouts.montage : look.layouts.single;
    const alt = list.filter((x) => x !== L && poolN >= NEED[x]);
    if (alt.length) L = alt[Math.floor(hash(idx * 5.1) * alt.length)];
  }
  return L;
}
/** 从素材池里给这个镜头再挑一个画面（不和主画面重复） */
function extraMedia(script, pool, main, idx, k) {
  if (pool.length <= 1) return main || pool[0];
  let n = Math.floor(hash(seedOf(script) * 0.0007 + idx * 7.31 + k * 2.17) * pool.length);
  for (let tries = 0; tries < pool.length && pool[n] === main; tries++) n = (n + 1) % pool.length;
  return pool[n];
}
/** 这一刻这个镜头里有哪些画面：{layout, items:[{m, lane, start}], cutAt} */
function sceneOf({ script, tl, planData, assets, t }, look, idx) {
  const pool = poolOf(assets);
  const layout = layoutOf(script, look, idx, pool.length);
  const p = planData[idx]; const sec = tl.sections[idx];
  const main = assets?.media?.[idx] || pool[idx % Math.max(1, pool.length)] || null;
  const items = [];
  if (layout === 'type') {
    if (look.bg === 'paper' || look.bg === 'dots') items.push({ m: main, lane: 0, start: p.start });
  } else if (layout === 'full' && look.subcut && sec.lines.length > 1) {
    // 一句话换一个画面
    let j = 0; sec.lines.forEach((l, k) => { if (t >= l.start - 0.05) j = k; });
    const used = [main]; let m = main;
    for (let k = 1; k <= j; k++) { const rest = pool.filter((x) => !used.includes(x)); m = extraMedia(script, rest.length ? rest : pool, main, idx, k); used.push(m); }
    items.push({ m, lane: j, start: j ? sec.lines[j].start : p.start });
    return { layout, items, cutAt: j ? sec.lines[j].start : p.start };
  } else {
    const need = NEED[layout]; const used = [main];
    items.push({ m: main, lane: 0, start: p.start });
    for (let k = 1; k < need; k++) {
      const rest = pool.filter((x) => !used.includes(x));
      const m = extraMedia(script, rest.length ? rest : pool, main, idx, k); used.push(m);
      items.push({ m, lane: k, start: p.start + k * CELL_GAP });
    }
  }
  return { layout, items, cutAt: p.start };
}

// ---------- 画面 ----------
const dims = (img) => [img.displayWidth || img.width, img.displayHeight || img.height];
const clipT = (m, start, t) => (m.offset + Math.max(0, t - start)) % m.clip.dur;
function imageOf(it, t) {
  const m = it?.m; if (!m) return null;
  const img = isClip(m) ? clipFrame(m.clip, clipT(m, it.start, t), it.lane) || m.poster : m;
  if (!img) return null;
  const [iw, ih] = dims(img);
  return iw && ih ? img : null;
}
function coverIn(ctx, img, R, z = 1, ox = 0) {
  const [iw, ih] = dims(img);
  const s = Math.max(R.w / iw, R.h / ih) * z;
  const dw = iw * s; const dh = ih * s;
  const fy = ih > iw ? 0.42 : 0.5;
  const x = clamp(R.x + R.w / 2 - dw / 2 + ox, R.x + R.w - dw, R.x);
  const y = clamp(R.y + R.h / 2 - dh * fy, R.y + R.h - dh, R.y);
  ctx.drawImage(img, x, y, dw, dh);
}
let _tiny = null;
function blurFill(ctx, img, x, y, w, h) {
  if (!_tiny) _tiny = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(54, 96) : Object.assign(document.createElement('canvas'), { width: 54, height: 96 });
  const [iw, ih] = dims(img);
  const tg = _tiny.getContext('2d'); const ts = Math.max(54 / iw, 96 / ih);
  tg.drawImage(img, 27 - (iw * ts) / 2, 48 - (ih * ts) / 2, iw * ts, ih * ts);
  ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(_tiny, x - 40, y - 60, w + 80, h + 120); ctx.restore();
}
/** 推拉摇移：视频轻推，照片按镜头号换花样 */
function motion(isVideo, i, k) {
  if (isVideo) return [1 + 0.05 * k, 0];
  const mode = Math.floor(hash(i * 7 + 3) * 4);
  if (mode === 0) return [1.02 + 0.12 * k, 0];
  if (mode === 1) return [1.14 - 0.12 * k, 0];
  return [1.14, (mode === 2 ? 1 : -1) * (k - 0.5) * 90];
}
function drawPlaceholder(ctx, skin, label, R) {
  ctx.fillStyle = grad(ctx, R.y, R.y + R.h, '#2a2d36', '#0d0e12'); ctx.fillRect(R.x, R.y, R.w, R.h);
  if (label) { const size = fitSlant(ctx, label, 120, R.w - 80); ctx.globalAlpha = 0.18; slantText(ctx, label, R.x + R.w / 2, R.y + R.h / 2, size, '#ffffff'); ctx.globalAlpha = 1; }
}

// ---------- 调色 / 颗粒 / 扫描线（混合模式，便宜） ----------
let _noise = null;
function noiseTile() {
  if (!_noise) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = c.getContext('2d'); const d = g.createImageData(256, 256); let s = 7;
    for (let i = 0; i < d.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); _noise = c;
  }
  return _noise;
}
function grain(ctx, R, t, alpha, op = 'overlay') {
  const pat = ctx.createPattern(noiseTile(), 'repeat');
  const f = Math.floor(t * 24);
  ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
  ctx.translate((f * 73) % 256, (f * 151) % 256); ctx.fillStyle = pat; ctx.fillRect(R.x - 256, R.y - 256, R.w + 512, R.h + 512); ctx.restore();
}
function vignette(ctx, R, a) {
  const g = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h / 2, Math.min(R.w, R.h) * 0.3, R.x + R.w / 2, R.y + R.h / 2, Math.hypot(R.w, R.h) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
}
function blend(ctx, R, op, color) { ctx.save(); ctx.globalCompositeOperation = op; ctx.fillStyle = color; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.restore(); }
function grade(ctx, look, R, t) {
  switch (look.grade) {
    case 'punch': blend(ctx, R, 'overlay', 'rgba(255,190,0,0.10)'); vignette(ctx, R, 0.35); break;
    case 'warm': blend(ctx, R, 'soft-light', 'rgba(255,222,170,0.5)'); blend(ctx, R, 'screen', 'rgba(70,50,30,0.10)'); break;
    case 'film': blend(ctx, R, 'saturation', 'rgba(128,128,128,0.78)'); blend(ctx, R, 'soft-light', 'rgba(20,95,115,0.45)'); vignette(ctx, R, 0.5); grain(ctx, R, t, 0.13); break;
    case 'cool': blend(ctx, R, 'soft-light', 'rgba(70,130,255,0.18)'); break;
    case 'vhs': blend(ctx, R, 'overlay', 'rgba(255,110,40,0.18)'); blend(ctx, R, 'saturation', 'rgba(255,0,60,0.12)'); vignette(ctx, R, 0.6); grain(ctx, R, t, 0.16); break;
    case 'vivid': blend(ctx, R, 'saturation', 'rgba(255,0,140,0.28)'); blend(ctx, R, 'soft-light', 'rgba(255,140,210,0.18)'); break;
    default: break;
  }
}
let _scan = null;
function scanlines(ctx, a) {
  if (!_scan) { _scan = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 6) : Object.assign(document.createElement('canvas'), { width: 4, height: 6 }); const g = _scan.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 2); }
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = ctx.createPattern(_scan, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}

// ---------- 背景（拼图、卡片、大字画面露出来的地方） ----------
function drawBg(ctx, look, skin, t, tEmoji) {
  switch (look.bg) {
    case 'paper':
      ctx.fillStyle = skin.paper; ctx.fillRect(0, 0, W, H);
      if (tEmoji) drawWallpaper(ctx, tEmoji, t, { w: W, h: H, alpha: 0.06, step: 260, size: 80, speed: 10 });
      grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.05, 'multiply');
      break;
    case 'stripes': {
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = skin.hl; ctx.translate(((t * 80) % 120), 0);
      for (let x = -H; x < W + 120; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 50 + H * 0.6, H); ctx.lineTo(x + H * 0.6, H); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'studio': {
      ctx.fillStyle = grad(ctx, 0, H, '#0c2350', '#040b1c'); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(120,170,255,0.08)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = (t * 30) % 90 - 90; x < W; x += 90) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += 90) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const sx = ((t * 0.3) % 1) * (W + 600) - 300; const g = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(140,190,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'noise': ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H); grain(ctx, { x: 0, y: 0, w: W, h: H }, t, 0.22, 'source-over'); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H); break;
    case 'dots': {
      ctx.fillStyle = grad(ctx, 0, H, skin.chip1, skin.chip2); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      const off = (t * 40) % 80;
      for (let y = -80 + off; y < H + 80; y += 80) for (let x = (Math.round((y - off) / 80) % 2 ? 40 : 0) - 40; x < W + 80; x += 80) { ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    default: ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- 构图：格子在哪 ----------
function cellsOf(layout, look, idx) {
  const tilt = (k) => (look.bg === 'dots' ? (hash(idx * 3 + k) - 0.5) * 0.12 : look.bg === 'paper' ? (hash(idx * 3 + k) - 0.5) * 0.05 : 0);
  const B = look.bleed;
  // 不贴边的版式：画面放在标题和字幕之间
  const T = 430; const Bt = look.bg === 'paper' ? 1400 : 1340; const X = 70; const CW = W - 140; const CH = Bt - T;
  switch (layout) {
    case 'full': return [{ x: 0, y: 0, w: W, h: H, r: 0 }];
    case 'letter': return [{ x: 0, y: 470, w: W, h: 960, r: 0 }];
    case 'letter2': return [{ x: 0, y: 440, w: W, h: 500, r: 0 }, { x: 0, y: 950, w: W, h: 500, r: 0 }];
    case 'card': return [{ x: X + 20, y: T + 10, w: CW - 40, h: CH - 20, r: 26, rot: (idx % 2 ? 1 : -1) * 0.02, frame: true }];
    case 'circle': return [{ x: W / 2 - 400, y: 520, w: 800, h: 800, circle: true, frame: true }];
    case 'pip': return [{ x: 0, y: 0, w: W, h: H, r: 0 }, { x: W - 420, y: 440, w: 360, h: 420, r: 18, frame: true }];
    case 'split2': return B ? [{ x: 0, y: 0, w: W, h: H / 2 - 4, r: 0 }, { x: 0, y: H / 2 + 4, w: W, h: H / 2 - 4, r: 0 }]
      : [{ x: X, y: T, w: CW, h: CH / 2 - 12, r: 20, rot: tilt(0), frame: true }, { x: X, y: T + CH / 2 + 12, w: CW, h: CH / 2 - 12, r: 20, rot: tilt(1), frame: true }];
    case 'side': return [{ x: 0, y: 0, w: W / 2 - 4, h: H, r: 0 }, { x: W / 2 + 4, y: 0, w: W / 2 - 4, h: H, r: 0 }];
    case 'trio': return B ? [{ x: 0, y: 0, w: W, h: H * 0.56, r: 0 }, { x: 0, y: H * 0.56 + 8, w: W / 2 - 4, h: H * 0.44 - 8, r: 0 }, { x: W / 2 + 4, y: H * 0.56 + 8, w: W / 2 - 4, h: H * 0.44 - 8, r: 0 }]
      : [{ x: X, y: T, w: CW, h: CH * 0.58, r: 20, rot: tilt(0), frame: true }, { x: X, y: T + CH * 0.58 + 20, w: CW / 2 - 10, h: CH * 0.42 - 20, r: 20, rot: tilt(1), frame: true }, { x: X + CW / 2 + 10, y: T + CH * 0.58 + 20, w: CW / 2 - 10, h: CH * 0.42 - 20, r: 20, rot: tilt(2), frame: true }];
    case 'grid4': return B ? [0, 1, 2, 3].map((k) => ({ x: (k % 2) * (W / 2 + 4), y: Math.floor(k / 2) * (H / 2 + 4), w: W / 2 - 4, h: H / 2 - 4, r: 0 }))
      : [0, 1, 2, 3].map((k) => ({ x: X + (k % 2) * (CW / 2 + 10), y: T + Math.floor(k / 2) * (CH / 2 + 10), w: CW / 2 - 10, h: CH / 2 - 10, r: 18, rot: tilt(k), frame: true }));
    case 'stack': return [0, 1, 2].map((k) => ({ x: 190 + [0, 120, 40][k], y: 460 + [0, 80, 170][k], w: 580, h: 600, r: 4, rot: [-0.09, 0.07, -0.02][k], polaroid: true }));
    default: return [{ x: 0, y: 0, w: W, h: H, r: 0 }];
  }
}
function drawCell(ctx, look, skin, cell, it, k, p, t, idx, label) {
  const appear = it.start; const e = clamp((t - appear) / 0.3);
  if (k > 0 && e <= 0) return;
  const img = imageOf(it, t); const video = isClip(it.m);
  const cx = cell.x + cell.w / 2; const cy = cell.y + cell.h / 2;
  ctx.save();
  // 格子入场：贴边的从旁边滑进来，带框的弹出来
  if (k > 0) {
    if (look.bleed && !cell.frame && !cell.polaroid) ctx.translate((k % 2 ? 1 : -1) * cell.w * (1 - easeOut(e)), 0);
    else { const s = pop(t, appear, 0.3); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.globalAlpha *= clamp(e * 2); }
  }
  if (cell.rot) { ctx.translate(cx, cy); ctx.rotate(cell.rot); ctx.translate(-cx, -cy); }
  if (cell.polaroid) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(cell.x - 22, cell.y - 22, cell.w + 44, cell.h + 100); ctx.shadowColor = 'transparent';
  } else if (cell.frame) {
    const sticker = look.bg === 'dots';
    ctx.shadowColor = sticker ? 'rgba(120,0,60,0.45)' : 'rgba(40,30,20,0.3)'; ctx.shadowBlur = sticker ? 0 : 34; ctx.shadowOffsetY = 14; ctx.shadowOffsetX = sticker ? 10 : 0;
    const bw = sticker ? 14 : 10;
    ctx.fillStyle = '#ffffff';
    if (cell.circle) { ctx.beginPath(); ctx.arc(cx, cy, cell.w / 2 + bw, 0, Math.PI * 2); ctx.fill(); } else { rr(ctx, cell.x - bw, cell.y - bw, cell.w + bw * 2, cell.h + bw * 2, (cell.r || 0) + bw); ctx.fill(); }
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0;
  }
  ctx.beginPath();
  if (cell.circle) ctx.arc(cx, cy, cell.w / 2, 0, Math.PI * 2); else if (cell.r) ctx.roundRect(cell.x, cell.y, cell.w, cell.h, cell.r); else ctx.rect(cell.x, cell.y, cell.w, cell.h);
  ctx.clip();
  if (img) {
    const dur = Math.max(0.5, p.end - p.start); const [z, ox] = motion(video, idx * 4 + k, clamp((t - p.start) / dur));
    const [iw, ih] = dims(img);
    if (cell.w === W && cell.h === H && iw / ih > 1.15) {
      // 横屏素材放整屏：上下模糊垫底，中间完整画面
      blurFill(ctx, img, 0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      const s = (W / iw) * 1.18 * z; ctx.drawImage(img, W / 2 - (iw * s) / 2, 760 - (ih * s) / 2, iw * s, ih * s);
    } else coverIn(ctx, img, cell, z, ox * (cell.w / W));
    grade(ctx, look, cell, t);
  } else drawPlaceholder(ctx, skin, label, cell);
  ctx.restore();
  // 新闻分屏：每路画面一个角标
  if (look.deco === 'news' && (cell.w < W || cell.h < H) && (k === 0 || e > 0)) {
    font(ctx, 30, 900); const tag = cell.frame ? '现场' : `画面 ${'ABCD'[k]}`; const tw = ctx.measureText(tag).width + 30;
    const ty = cell.y + (cell.y === 0 ? 150 : 16);
    ctx.fillStyle = skin.chip1; ctx.fillRect(cell.x + 16, ty, tw, 46); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tag, cell.x + 31, ty + 24);
  }
}

// ---------- 大字画面（讲观点的镜头：不放素材，字就是画面） ----------
function typeParts(v) {
  switch (v.type) {
    case 'hook': case 'big': return (v.lines || []).filter(Boolean);
    case 'quote': return [v.text].filter(Boolean);
    case 'stamp': return [v.text, v.note].filter(Boolean);
    case 'stat': return [String(v.big || '') + (v.unit || ''), v.label].filter(Boolean);
    default: return [];
  }
}
/** 按字数把一句切成几行（大字画面一行别太长） */
function chunk(text, n = 6) {
  const cs = [...String(text)]; if (cs.length <= n + 1) return [text];
  const k = Math.ceil(cs.length / Math.ceil(cs.length / n)); const out = [];
  for (let i = 0; i < cs.length; i += k) out.push(cs.slice(i, i + k).join(''));
  for (let j = 1; j < out.length; j++) while (/^[，。！？、；：,.!?”]/.test(out[j])) { out[j - 1] += out[j][0]; out[j] = out[j].slice(1); }
  return out.filter(Boolean);
}
function drawTypeScene(ctx, look, skin, sec, p, t, idx, it, tEmoji) {
  const v = sec.visual; const parts = typeParts(v); const st = p.steps;
  const at = (k) => st[k] ?? (p.start + 0.25 + k * 0.45);
  const cx = W / 2;
  switch (look.title) {
    case 'band': { // 爆款：黑底黄条，一行一行砸下来，屏幕震
      const rows = parts.flatMap((s, k) => chunk(s, 6).map((r) => [r, k]));
      const lh = 190; const y0 = 960 - ((rows.length - 1) * lh) / 2;
      const hitK = rows.reduce((m, [, k], j) => (t >= at(k) + j * 0.12 ? j : m), -1);
      const shake = hitK >= 0 ? Math.max(0, 1 - (t - (at(rows[hitK][1]) + hitK * 0.12)) / 0.25) : 0;
      ctx.save(); ctx.translate(Math.sin(t * 90) * 14 * shake, Math.cos(t * 70) * 10 * shake);
      rows.forEach(([r, k], j) => {
        const t0 = at(k) + j * 0.12; if (t < t0) return;
        const e = clamp((t - t0) / 0.16); const sc = 2.2 - 1.2 * easeOut(e); const y = y0 + j * lh;
        const size = fitSlant(ctx, r, 170, W - 120);
        ctx.save(); ctx.translate(cx, y); ctx.scale(sc, sc); ctx.globalAlpha = clamp(e * 3);
        if (k % 2) { font(ctx, size, 900); const w = ctx.measureText(r).width * 0.92; ctx.save(); ctx.transform(1, 0, SKEW, 1, 0, 0); ctx.fillStyle = skin.hl; ctx.fillRect(-w / 2 - 30, -size * 0.62, w + 60, size * 1.24); ctx.restore(); slantText(ctx, r, 0, 0, size, '#0a0a0a'); }
        else slantText(ctx, r, 0, 0, size, '#ffffff', { stroke: size * 0.1, strokeColor: '#000' });
        ctx.restore();
      });
      ctx.restore();
      break;
    }
    case 'mag': { // 杂志：巨大的段号 + 大字 + 一张小照片斜贴着
      font(ctx, 420, 900); ctx.fillStyle = skin.hl; ctx.globalAlpha = 0.16; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(idx + 1).padStart(2, '0'), 40, 860); ctx.globalAlpha = 1;
      const rows = parts.flatMap((s, k) => chunk(s, 7).map((r) => [r, k]));
      rows.forEach(([r, k], j) => {
        const e = easeOut(clamp((t - at(k) - j * 0.1) / 0.4)); if (e <= 0) return;
        const y = 700 + j * 130; const size = fitFont(ctx, r, k ? 92 : 104, W - 160, 900);
        ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 30);
        if (k) { const w = ctx.measureText(r).width; ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.3; ctx.fillRect(74, y + size * 0.05, w * e, size * 0.4); ctx.globalAlpha = e; }
        ctx.fillStyle = skin.paperInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(r, 80, y); ctx.restore();
      });
      const img = imageOf(it, t);
      if (img) {
        const e = pop(t, p.start + 0.5, 0.35); if (e > 0) withPop(ctx, e, 760, 1180, () => {
          ctx.save(); ctx.translate(760, 1180); ctx.rotate(0.07);
          ctx.shadowColor = 'rgba(40,30,20,0.35)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10; ctx.fillStyle = '#fff'; ctx.fillRect(-190, -150, 380, 330); ctx.shadowColor = 'transparent';
          const box = { x: -170, y: -130, w: 340, h: 250 };
          ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip(); coverIn(ctx, img, box); grade(ctx, look, box, t); ctx.restore();
          ctx.restore();
        });
      }
      break;
    }
    case 'cine': { // 电影：黑场白字，一个字一个字浮现
      if (sec.label) { const a = clamp((t - p.start) / 0.5); ctx.globalAlpha = a * 0.6; fitFont(ctx, `— ${sec.label} —`, 32, W - 200, 700, 10); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`— ${sec.label} —`, cx, 760); ctx.globalAlpha = 1; ctx.letterSpacing = '0px'; }
      const rows = parts.flatMap((s, k) => chunk(s, 9).map((r) => [r, k]));
      rows.forEach(([r, k], j) => {
        const y = 900 + j * 110; const size = k ? 52 : 70;
        fitFont(ctx, r, size, W - 160, k ? 700 : 900); const chars = [...r];
        const total = chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + 8 * (chars.length - 1); let x = cx - total / 2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        chars.forEach((ch, ci) => { const a = clamp((t - at(k) - j * 0.2 - ci * 0.06) / 0.4); ctx.globalAlpha = a; ctx.fillStyle = k ? skin.hl : '#f4f0e8'; ctx.fillText(ch, x, y + (1 - a) * 10); x += ctx.measureText(ch).width + 8; });
        ctx.globalAlpha = 1;
      });
      grain(ctx, { x: 0, y: 0, w: W, h: H }, t, 0.08);
      break;
    }
    case 'news': { // 新闻：红色横幅扫过 + 白字大标题块
      const e0 = easeOut(clamp((t - p.start) / 0.35));
      ctx.fillStyle = skin.chip1; ctx.fillRect(0, 640, W * e0, 150); ctx.fillStyle = skin.hl; ctx.fillRect(0, 790, W * e0, 12);
      font(ctx, 96, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.type === 'quote' ? '原话' : v.type === 'stat' ? '数据' : '快讯', 70 - (1 - e0) * 300, 718);
      font(ctx, 40, 700); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'right'; ctx.fillText('BREAKING', W - 70, 720);
      const rows = parts.flatMap((s, k) => chunk(s, 8).map((r) => [r, k]));
      rows.forEach(([r, k], j) => {
        const e = easeOut(clamp((t - at(k) - j * 0.1) / 0.35)); if (e <= 0) return;
        const y = 900 + j * 140; fitFont(ctx, r, 92, W - 180, 900); const w = ctx.measureText(r).width + 70;
        ctx.save(); ctx.beginPath(); ctx.rect(60, y - 64, w * e, 128); ctx.clip();
        ctx.fillStyle = k ? skin.hl : '#ffffff'; ctx.fillRect(60, y - 64, w, 128);
        ctx.fillStyle = '#0b1838'; ctx.textAlign = 'left'; ctx.fillText(r, 95, y + 4); ctx.restore();
      });
      break;
    }
    case 'dv': { // DV：黑屏打字机
      pixelFont(ctx, 40); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('PLAY ▶', 110, 640);
      const rows = parts.flatMap((s, k) => chunk(s, 8).map((r) => [r, k]));
      let cur = null;
      rows.forEach(([r, k], j) => {
        const s = fitPixel(ctx, r, 100, W - 200); const chars = [...r];
        const n = Math.floor(clamp((t - at(k) - j * 0.3) / Math.max(0.3, chars.length * 0.07)) * chars.length);
        const y = 820 + j * 140; ctx.textAlign = 'left';
        const txt = chars.slice(0, n).join(''); ctx.fillStyle = k ? skin.hl : '#ffffff'; ctx.fillText(txt, 110, y);
        if (n > 0) cur = [110 + ctx.measureText(txt).width + 8, y, s];
      });
      if (cur && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = skin.hl; ctx.fillRect(cur[0], cur[1] - cur[2] * 0.45, cur[2] * 0.55, cur[2] * 0.9); }
      break;
    }
    case 'pop': { // 综艺：旋转放射光 + 花字一行行弹出来
      ctx.save(); ctx.translate(cx, 960); ctx.rotate(t * 0.4);
      for (let k = 0; k < 16; k++) { ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(255,225,77,0.22)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1600, (k * Math.PI) / 8, ((k + 1) * Math.PI) / 8); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      const rows = parts.flatMap((s, k) => chunk(s, 6).map((r) => [r, k]));
      const y0 = 960 - ((rows.length - 1) * 170) / 2;
      rows.forEach(([r, k], j) => {
        const s = pop(t, at(k) + j * 0.15, 0.3); if (s <= 0) return;
        const y = y0 + j * 170 + Math.sin(t * 5 + j) * 6;
        ctx.save(); ctx.translate(cx, y); ctx.rotate((j % 2 ? 1 : -1) * 0.04); ctx.scale(s, s);
        flowerText(ctx, r, 0, 0, fitFont(ctx, r, 150, W - 140, 900), k ? skin.hl : '#ffffff', k ? '#5b1a8a' : skin.chip2); ctx.restore();
      });
      const emo = tEmoji || ['✨', '🎉'];
      [[150, 520], [W - 150, 1380]].forEach(([x, y], j) => { const s = pop(t, p.start + 0.3 + j * 0.2, 0.3); if (s > 0) { ctx.save(); ctx.translate(x, y + Math.sin(t * 4 + j) * 12); ctx.scale(s, s); ctx.font = `130px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emo[j % emo.length], 0, 0); ctx.restore(); } });
      break;
    }
    default: break;
  }
}

// ---------- 转场（整个画面，只用当前帧，导出时多线程乱序画帧也不会出错） ----------
const TRANS_DUR = { flash: 0.22, zoom: 0.3, shake: 0.35, whip: 0.28, page: 0.4, drop: 0.38, wipe: 0.38, sting: 0.6, iris: 0.5, blinds: 0.5, fade: 0.55, glitch: 0.32, static: 0.3, burst: 0.4 };
function transOf(script, look, idx) {
  if (idx === 0) return look.title === 'cine' ? 'fade' : look.deco === 'dv' ? 'static' : look.title === 'mag' ? 'drop' : 'zoom';
  const list = look.trans; return list[Math.floor(hash(seedOf(script) * 0.013 + idx * 3.7) * list.length)];
}
function transPre(ctx, type, k) {
  const cx = W / 2; const cy = H / 2; const e = easeOut(k);
  if (type === 'zoom') { const z = 1 + 0.26 * (1 - e); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
  else if (type === 'flash') { const z = 1 + 0.06 * (1 - e); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
  else if (type === 'shake') { const a = 1 - k; ctx.translate(Math.sin(k * 46) * 26 * a, Math.cos(k * 39) * 16 * a); ctx.translate(cx, cy); ctx.rotate(Math.sin(k * 30) * 0.015 * a); ctx.scale(1 + 0.07 * a, 1 + 0.07 * a); ctx.translate(-cx, -cy); }
  else if (type === 'whip') ctx.translate(-W * 0.5 * (1 - e), 0);
  else if (type === 'page') ctx.translate(W * (1 - e), 0);
  else if (type === 'drop') { const z = 1.12 - 0.12 * e; ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.globalAlpha = clamp(k * 2.5); }
}
function transPost(ctx, type, k, skin, idx, account) {
  const e = easeOut(k);
  switch (type) {
    case 'flash': ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`; ctx.fillRect(0, 0, W, H); break;
    case 'shake': ctx.fillStyle = `rgba(255,255,255,${0.12 * (1 - k)})`; ctx.fillRect(0, 0, W, H); break;
    case 'whip': { // 甩镜头：几道拖影
      const a = 1 - k; if (a <= 0) break;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const sx = ctx.canvas.width / W;
      for (let j = 1; j <= 3; j++) { ctx.globalAlpha = 0.22 * a; ctx.drawImage(ctx.canvas, j * 60 * a * sx, 0); }
      ctx.restore(); break;
    }
    case 'page': { const x = W * (1 - e); const g = ctx.createLinearGradient(x - 60, 0, x, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = g; ctx.fillRect(x - 60, 0, 60, H); break; }
    case 'wipe': { const x = W * e; ctx.fillStyle = skin.chip1; ctx.fillRect(x, 0, W, H); ctx.fillStyle = skin.hl; ctx.fillRect(x - 14, 0, 14, H); break; }
    case 'sting': { // 新闻转场：斜色带带着账号名扫过
      const x = -W * 1.4 + W * 2.8 * e;
      ctx.save(); ctx.translate(x, H / 2); ctx.rotate(-0.25);
      ctx.fillStyle = skin.bar; ctx.fillRect(-W * 0.7, -330, W * 1.4, 660); ctx.fillStyle = skin.chip1; ctx.fillRect(-W * 0.7, -330, W * 1.4, 80); ctx.fillStyle = skin.hl; ctx.fillRect(-W * 0.7, 250, W * 1.4, 18);
      fitFont(ctx, account, 110, W * 1.1, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(account, 0, 20);
      ctx.restore(); break;
    }
    case 'iris': { const r = Math.hypot(W, H) * 0.55 * e; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, Math.max(1, r), 0, Math.PI * 2, true); ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore(); break; }
    case 'blinds': { const n = 10; const bh = H / n; ctx.fillStyle = '#000'; for (let j = 0; j < n; j++) { const kk = easeOut(clamp((k - j * 0.035) / 0.65)); const h = bh * (1 - kk); ctx.fillRect(0, j * bh + (bh - h) / 2, W, h); } break; }
    case 'fade': ctx.fillStyle = `rgba(0,0,0,${1 - e})`; ctx.fillRect(0, 0, W, H); break;
    case 'static': if (k < 1) { grain(ctx, { x: 0, y: 0, w: W, h: H }, k * 10, 1 - k, 'source-over'); ctx.fillStyle = `rgba(255,255,255,${0.15 * (1 - k)})`; ctx.fillRect(0, 0, W, H); } break;
    case 'glitch': {
      if (k >= 1) break;
      const a = 1 - k;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const sc = ctx.canvas.width / W;
      for (let j = 0; j < 8; j++) {
        const y = hash(idx * 31 + j + Math.floor(k * 9) * 7) * H * sc; const h = (30 + hash(j * 13 + idx) * 120) * sc; const dx = (hash(j * 7 + Math.floor(k * 12)) - 0.5) * 160 * a * sc;
        ctx.drawImage(ctx.canvas, 0, y, ctx.canvas.width, h, dx, y, ctx.canvas.width, h);
      }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = '#ff2a6d'; ctx.fillRect(0, hash(idx + Math.floor(k * 10)) * H, W, 34);
      ctx.fillStyle = '#05d9e8'; ctx.fillRect(0, hash(idx * 3 + Math.floor(k * 10)) * H, W, 20);
      ctx.restore(); break;
    }
    case 'burst': { // 综艺：彩色圆环从中间炸开
      const r1 = Math.hypot(W, H) * 0.6 * e; const r0 = Math.max(0, r1 - 260 * (1 - k));
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, r1, 0, Math.PI * 2); ctx.arc(W / 2, H / 2, r0, 0, Math.PI * 2, true); ctx.fillStyle = skin.hl; ctx.fill('evenodd'); ctx.restore();
      break;
    }
    default: break;
  }
}

// ---------- 标题（每套版式一种） ----------
function drawTitle(ctx, look, skin, script, t, account, tEmoji) {
  const [h1, h2] = script.headline || [script.title || '', ''];
  const ap = easeOut(clamp((t - 0.1) / 0.5));
  ctx.save();
  switch (look.title) {
    case 'band': {
      const hs = Math.min(fitSlant(ctx, h1, 96, W - 110), h2 ? fitSlant(ctx, h2, 96, W - 110) : 96);
      const hy = 230; ctx.globalAlpha = ap; ctx.translate(0, (1 - ap) * -40);
      if (h1) slantText(ctx, h1, W / 2, hy, hs, skin.ink, { stroke: hs * 0.16, strokeColor: '#000' });
      if (h2) {
        font(ctx, hs, 900); const w2 = ctx.measureText(h2).width * 0.92;
        ctx.save(); ctx.translate(W / 2 - w2 / 2 - 24, hy + hs * 1.18 - hs * 0.62); ctx.transform(1, 0, SKEW, 1, 0, 0);
        ctx.fillStyle = skin.hl; ctx.fillRect(0, 0, (w2 + 48) * easeOut(clamp((t - 0.3) / 0.4)), hs * 1.24); ctx.restore();
        slantText(ctx, h2, W / 2, hy + hs * 1.18, hs, '#111111');
      }
      break;
    }
    case 'mag': {
      const x = 70; ctx.globalAlpha = ap;
      fitFont(ctx, h1, 52, W - 280, 700); ctx.fillStyle = skin.paperInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(h1, x, 200);
      if (h2) {
        const s = fitFont(ctx, h2, 92, W - 160, 900); const w = ctx.measureText(h2).width;
        ctx.fillStyle = skin.hl; ctx.globalAlpha = ap * 0.35; ctx.fillRect(x - 6, 300, (w + 12) * easeOut(clamp((t - 0.35) / 0.5)), s * 0.42); ctx.globalAlpha = ap;
        ctx.fillStyle = skin.paperInk; ctx.fillText(h2, x, 300);
      }
      ctx.fillStyle = skin.paperInk; ctx.fillRect(x, 375, W - 140, 3);
      if (tEmoji) { ctx.font = `100px ${EMOJI_FONT}`; ctx.textAlign = 'right'; ctx.fillText(tEmoji[0], W - 70, 220); }
      break;
    }
    case 'cine': {
      ctx.globalAlpha = ap;
      fitFont(ctx, h1, 40, W - 300, 700, 12); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h1, W / 2, 230);
      const w1 = ctx.measureText(h1).width;
      ctx.fillStyle = skin.hl; ctx.fillRect(W / 2 - w1 / 2 - 90, 229, 60, 2); ctx.fillRect(W / 2 + w1 / 2 + 30, 229, 60, 2);
      if (h2) { fitFont(ctx, h2, 74, W - 140, 900, 8); ctx.fillStyle = skin.hl; ctx.fillText(h2, W / 2, 330); }
      ctx.letterSpacing = '0px';
      break;
    }
    case 'news': {
      const y = 1560; const e = easeOut(clamp((t - 0.2) / 0.45));
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, W * e, 230); ctx.clip();
      const tw = 170;
      font(ctx, 46, 900); ctx.fillStyle = skin.chip1; ctx.fillRect(40, y, tw, 112); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('现场', 40 + tw / 2, y + 58);
      ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fillRect(40 + tw, y, W - 80 - tw, 112);
      const hl = h1 + (h2 ? ' ' + h2 : '');
      fitFont(ctx, hl, 54, W - 160 - tw, 900); ctx.fillStyle = '#0f1a33'; ctx.textAlign = 'left'; ctx.fillText(hl, 70 + tw, y + 58);
      ctx.fillStyle = skin.bar; ctx.fillRect(40, y + 112, W - 80, 64);
      fitFont(ctx, '@' + account, 32, W - 200, 700); ctx.fillStyle = '#ffffff'; ctx.fillText('@' + account, 70, y + 145);
      ctx.restore();
      break;
    }
    case 'dv': {
      ctx.globalAlpha = ap;
      const s1 = fitPixel(ctx, h1, 60, W - 220); const w1 = ctx.measureText(h1).width;
      const s2 = h2 ? fitPixel(ctx, h2, 84, W - 180) : 0; const w2 = h2 ? ctx.measureText(h2).width : 0;
      const bw = Math.max(w1, w2) + 70; const bh = 60 + s1 + (h2 ? s2 + 30 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W / 2 - bw / 2, 230, bw, bh);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      pixelFont(ctx, s1); ctx.fillStyle = '#ffffff'; ctx.fillText(h1, W / 2, 260 + s1 / 2);
      if (h2) { pixelFont(ctx, s2); ctx.fillStyle = skin.hl; ctx.fillText(h2, W / 2, 290 + s1 + s2 / 2); }
      break;
    }
    case 'pop': {
      const k = clamp((t - 0.05) / 0.35); const sc = k < 0.7 ? 1.6 - 0.7 * easeOut(k / 0.7) : 0.9 + 0.1 * ((k - 0.7) / 0.3);
      ctx.save(); ctx.translate(W / 2, 230); ctx.rotate(-0.04); ctx.scale(sc, sc); ctx.globalAlpha = clamp(k * 2);
      flowerText(ctx, h1, 0, 0, fitFont(ctx, h1, 100, W - 160, 900), skin.hl, skin.chip2); ctx.restore();
      if (h2) withPop(ctx, pop(t, 0.35, 0.3), W / 2, 370, () => {
        fitFont(ctx, h2, 60, W - 260, 900); const w = ctx.measureText(h2).width + 80;
        ctx.save(); ctx.translate(W / 2, 370); ctx.rotate(0.03);
        ctx.fillStyle = '#ffffff'; rr(ctx, -w / 2 - 8, -50, w + 16, 100, 50); ctx.fill();
        ctx.fillStyle = skin.chip1; rr(ctx, -w / 2, -42, w, 84, 42); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h2, 0, 3); ctx.restore();
      });
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ---------- 字幕（重做：去掉句末标点、关键词变色放大、每套一种出字方式） ----------
const cleanSub = (s) => String(s).trim().replace(/[。！？!?…~～，、；：,;:]+$/g, '').replace(/[，、；,;。！？!?]/g, ' ').replace(/\s+/g, ' ').trim();
/** 字幕里每个字是不是关键词 */
function markKeys(text, keys) {
  const chars = [...text]; const on = new Array(chars.length).fill(false);
  for (const k of keys || []) {
    if (!k) continue;
    let i = text.indexOf(k);
    while (i >= 0) { const ci = [...text.slice(0, i)].length; for (let j = 0; j < [...k].length; j++) on[ci + j] = true; i = text.indexOf(k, i + k.length); }
  }
  return chars.map((ch, i) => ({ ch, key: on[i] }));
}
/** 均匀折成 1-2 行，优先在空格处断 */
function subRows(ctx, chars, maxW) {
  const w = chars.reduce((a, c) => a + ctx.measureText(c.ch).width, 0);
  if (w <= maxW) return [chars];
  let best = Math.ceil(chars.length / 2); let bd = 1e9;
  chars.forEach((c, i) => { if (i < 2 || i > chars.length - 2) return; const d = Math.abs(i - chars.length / 2) - (c.ch === ' ' ? 3 : 0); if (d < bd) { bd = d; best = i; } });
  const trim = (r) => { while (r.length && r[0].ch === ' ') r.shift(); while (r.length && r[r.length - 1].ch === ' ') r.pop(); return r; };
  return [trim(chars.slice(0, best)), trim(chars.slice(best))];
}
function drawSub(ctx, look, skin, ln, keys, t, y, li) {
  const text = cleanSub(ln.text); if (!text) return;
  const chars = markKeys(text, keys);
  const dur = Math.max(0.3, ln.end - ln.start); const since = t - ln.start;
  ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const layout = (size, weight, maxW, keyScale = 1, spacing = 0) => {
    let s = size; let rows; let rowsW;
    for (;;) {
      font(ctx, s, weight); rows = subRows(ctx, chars, maxW);
      rowsW = rows.map((r) => r.reduce((a, c) => { font(ctx, c.key ? s * keyScale : s, weight); return a + ctx.measureText(c.ch).width + spacing; }, -spacing));
      if (Math.max(...rowsW) <= maxW + 4 || s < 36) break; s -= 4;
    }
    return { s, rows, rowsW };
  };
  const each = (L, lh, o) => {
    let ci = 0;
    L.rows.forEach((r, ri) => {
      let x = W / 2 - L.rowsW[ri] / 2; const yy = y + ri * lh - ((L.rows.length - 1) * lh) / 2;
      r.forEach((c) => { const sz = o.size ? o.size(c) : L.s; font(ctx, sz, o.weight || 900); const cw = ctx.measureText(c.ch).width; o.draw(c, x, yy, cw, ci++, sz); x += cw + (o.spacing || 0); });
    });
  };
  switch (look.sub) {
    case 'slam': { // 爆款：粗大白字黑边，关键词黄色放大，一个字一个字砸出来
      const L = layout(80, 900, W - 120, 1.15);
      each(L, L.s * 1.25, { size: (c) => (c.key ? L.s * 1.15 : L.s), draw: (c, x, yy, cw, ci, sz) => {
        const e = clamp((since - ci * 0.022) / 0.12); if (e <= 0) return;
        const sc = 1.5 - 0.5 * easeOut(e);
        ctx.save(); ctx.translate(x + cw / 2, yy); ctx.scale(sc, sc); ctx.globalAlpha = clamp(e * 2);
        ctx.lineWidth = sz * 0.22; ctx.strokeStyle = '#000'; ctx.strokeText(c.ch, -cw / 2, 0);
        ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, -cw / 2, 0); ctx.restore();
      } });
      break;
    }
    case 'ink': { // 杂志：纸上的深色字，关键词下面一道荧光笔
      const L = layout(60, 900, W - 160);
      const e = easeOut(clamp(since / 0.3)); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 16);
      each(L, L.s * 1.35, { draw: (c, x, yy, cw, ci, sz) => {
        if (c.key) { ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.35; ctx.fillRect(x - 1, yy + sz * 0.02, cw + 2, sz * 0.42); ctx.globalAlpha = e; }
        ctx.fillStyle = c.key ? skin.cardInk : skin.paperInk; ctx.fillText(c.ch, x, yy);
      } });
      break;
    }
    case 'cine': { // 电影：细字、字距开、不描边，整句淡入
      const L = layout(44, 700, W - 180, 1, 6);
      ctx.globalAlpha = clamp(since / 0.35);
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
      each(L, L.s * 1.6, { weight: 700, spacing: 6, draw: (c, x, yy) => { ctx.fillStyle = c.key ? skin.hl : '#efebe3'; ctx.fillText(c.ch, x, yy); } });
      break;
    }
    case 'bar': { // 新闻：深蓝字幕条从左边推出来，关键词黄色
      const L = layout(56, 900, W - 200);
      const e = easeOut(clamp(since / 0.22)); const lh = L.s * 1.6;
      L.rows.forEach((_, ri) => { const yy = y + ri * lh - ((L.rows.length - 1) * lh) / 2; const w = L.rowsW[ri] + 80; ctx.fillStyle = 'rgba(8,24,60,0.92)'; ctx.fillRect(W / 2 - w / 2, yy - L.s * 0.72, w * e, L.s * 1.44); ctx.fillStyle = skin.hl; ctx.fillRect(W / 2 - w / 2, yy - L.s * 0.72, 8, L.s * 1.44); });
      ctx.globalAlpha = clamp((since - 0.08) / 0.15);
      each(L, lh, { draw: (c, x, yy) => { ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, x + 4, yy + 2); } });
      break;
    }
    case 'type': { // DV：像素字打字机 + 闪烁光标
      pixelFont(ctx, 64); const rows = subRows(ctx, chars, W - 160);
      const n = Math.floor(clamp(since / Math.min(dur * 0.6, chars.length * 0.07)) * chars.length);
      let ci = 0; let cur = null;
      rows.forEach((r, ri) => {
        const rw = r.reduce((a, c) => a + ctx.measureText(c.ch).width, 0); let x = W / 2 - rw / 2; const yy = y + ri * 86 - ((rows.length - 1) * 86) / 2;
        r.forEach((c) => {
          if (ci < n) { const cw = ctx.measureText(c.ch).width; ctx.fillStyle = '#000'; for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [4, 4]]) ctx.fillText(c.ch, x + dx, yy + dy); ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, x, yy); x += cw; cur = [x, yy]; }
          ci++;
        });
      });
      if (cur && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = skin.hl; ctx.fillRect(cur[0] + 6, cur[1] - 28, 30, 56); }
      break;
    }
    case 'flower': { // 综艺：花字，每个字一跳一跳，关键词换色
      const L = layout(76, 900, W - 150, 1.12);
      ctx.translate(W / 2, y); ctx.rotate(li % 2 ? 0.015 : -0.015); ctx.translate(-W / 2, -y);
      each(L, L.s * 1.3, { size: (c) => (c.key ? L.s * 1.12 : L.s), draw: (c, x, yy, cw, ci, sz) => {
        const s = pop(t, ln.start + ci * 0.03, 0.2); if (s <= 0) return;
        const bob = Math.sin(t * 9 + ci * 0.7) * 5;
        ctx.save(); ctx.translate(x + cw / 2, yy + bob); ctx.scale(s, s);
        ctx.lineWidth = sz * 0.36; ctx.strokeStyle = '#ffffff'; ctx.strokeText(c.ch, -cw / 2, 0);
        ctx.lineWidth = sz * 0.18; ctx.strokeStyle = c.key ? '#5b1a8a' : skin.chip2; ctx.strokeText(c.ch, -cw / 2, 0);
        ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, -cw / 2, 0); ctx.restore();
      } });
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ---------- 装饰（每套版式一种） ----------
const tc = (t) => { const s = Math.floor(t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
function drawDeco(ctx, look, skin, script, tl, t, idx, p, account, tEmoji, layout) {
  const label = script.sections[idx]?.label || '';
  const n = script.sections.length;
  switch (look.deco) {
    case 'bar': {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, W, 10);
      ctx.fillStyle = skin.hl; ctx.fillRect(0, 0, W * clamp(t / Math.max(1, tl.duration)), 10);
      font(ctx, 36, 900); const aw = ctx.measureText('@' + account).width;
      ctx.fillStyle = skin.hl; rr(ctx, 40, 60, aw + 48, 62, 8); ctx.fill();
      ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('@' + account, 64, 92);
      break;
    }
    case 'mag': {
      font(ctx, 30, 700); ctx.textBaseline = 'middle';
      ctx.fillStyle = skin.paperInk; ctx.textAlign = 'right'; ctx.globalAlpha = 0.6; ctx.fillText(`${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, W - 70, 100); ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.fillText('@' + account, 70, 100);
      font(ctx, 26, 700); ctx.globalAlpha = 0.45; ctx.textAlign = 'center'; ctx.fillText('— 真实课堂 · 实拍记录 —', W / 2, 1835); ctx.globalAlpha = 1;
      break;
    }
    case 'cine': {
      if (label && layout !== 'type') {
        const k = t - p.start; const a = clamp(k / 0.4) * clamp((1.8 - k) / 0.4);
        if (a > 0) { ctx.save(); ctx.globalAlpha = a; fitFont(ctx, `— ${label} —`, 32, W - 200, 700, 8); ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`— ${label} —`, W / 2, 530); ctx.restore(); }
      }
      font(ctx, 26, 700, 6); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText(`SC.${String(idx + 1).padStart(2, '0')}`, 60, 1840);
      ctx.textAlign = 'right'; ctx.fillText('@' + account, W - 60, 1840);
      ctx.letterSpacing = '0px';
      break;
    }
    case 'news': {
      const blink = Math.sin(t * 5) > -0.3;
      ctx.fillStyle = skin.chip1; rr(ctx, 40, 60, 120, 60, 8); ctx.fill();
      if (blink) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(66, 90, 9, 0, Math.PI * 2); ctx.fill(); }
      font(ctx, 32, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('LIVE', 82, 92);
      font(ctx, 34, 900); const aw = ctx.measureText(account).width + 40;
      ctx.fillStyle = 'rgba(10,22,48,0.8)'; ctx.fillRect(160, 60, aw, 60); ctx.fillStyle = '#ffffff'; ctx.fillText(account, 180, 92);
      font(ctx, 30, 700); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'right'; ctx.fillText(tc(t), W - 44, 92);
      const items = [...new Set(script.sections.flatMap((x) => [...(x.visual?.items || []), x.label]).filter(Boolean))];
      const text = items.join('   ·   ') + '   ·   ';
      ctx.fillStyle = skin.bar; ctx.fillRect(0, 1830, W, 62); ctx.fillStyle = skin.hl; ctx.fillRect(0, 1830, 150, 62);
      font(ctx, 30, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText('关注', 75, 1862);
      ctx.save(); ctx.beginPath(); ctx.rect(150, 1830, W - 150, 62); ctx.clip();
      font(ctx, 30, 700); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; const tw = Math.max(200, ctx.measureText(text).width);
      const off = (t * 110) % tw; ctx.fillText(text, 170 - off, 1862); ctx.fillText(text, 170 - off + tw, 1862);
      ctx.restore();
      break;
    }
    case 'dv': {
      scanlines(ctx, 0.18);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6;
      const m = 50; const L = 70;
      [[m, m + 60, 1, 1], [W - m, m + 60, -1, 1], [m, H - m - 60, 1, -1], [W - m, H - m - 60, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + L * sy); ctx.lineTo(x, y); ctx.lineTo(x + L * sx, y); ctx.stroke(); });
      pixelFont(ctx, 40); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (Math.floor(t * 1.6) % 2 === 0) { ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(110, 150, 14, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.fillText('REC', 138, 152);
      ctx.textAlign = 'right'; ctx.fillText(`${tc(t)}:${String(Math.floor((t % 1) * 24)).padStart(2, '0')}`, W - 110, 152);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(W - 190, 190, 70, 34); ctx.fillStyle = '#ffffff'; ctx.fillRect(W - 120, 199, 8, 16); ctx.fillRect(W - 184, 196, 44, 22);
      if (label) { pixelFont(ctx, 40); ctx.textAlign = 'left'; ctx.fillStyle = '#000'; ctx.fillText('▶ ' + label, 113, H - 147); ctx.fillStyle = skin.hl; ctx.fillText('▶ ' + label, 110, H - 150); }
      pixelFont(ctx, 34); ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.fillText('@' + account, W - 110, H - 150);
      break;
    }
    case 'pop': {
      const emo = tEmoji || ['✨', '🎉'];
      font(ctx, 34, 900); const aw = ctx.measureText('@' + account).width;
      ctx.fillStyle = '#ffffff'; rr(ctx, 40, 60, aw + 48, 60, 30); ctx.fill(); ctx.fillStyle = skin.chip2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('@' + account, 64, 92);
      if (layout !== 'type') for (let j = 0; j < 2; j++) {
        const left = hash(idx * 11 + j) > 0.5; const x = left ? 110 + hash(idx + j * 3) * 80 : W - 110 - hash(idx + j * 5) * 80; const y = 560 + hash(idx * 7 + j * 13) * 620;
        const s = pop(t, p.start + 0.2 + j * 0.25, 0.3); if (s <= 0) continue;
        ctx.save(); ctx.translate(x, y + Math.sin((t - p.start) * 4 + j) * 10); ctx.scale(s, s); ctx.rotate((j ? 1 : -1) * 0.15); ctx.font = `96px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.fillText(emo[(idx + j) % emo.length], 0, 0); ctx.restore();
      }
      const k = (t - p.start) / 0.5;
      if (idx > 0 && k >= 0 && k < 1) {
        for (let j = 0; j < 16; j++) {
          const a = hash(j * 17 + idx) * Math.PI * 2; const d = 120 + 460 * easeOut(k) * (0.6 + hash(j + idx * 3) * 0.6);
          ctx.globalAlpha = 1 - k; ctx.fillStyle = j % 2 ? skin.hl : '#ffffff';
          ctx.save(); ctx.translate(W / 2 + Math.cos(a) * d, 960 + Math.sin(a) * d); ctx.rotate(k * 3); const r = 18 * (1 - k * 0.5);
          ctx.beginPath(); for (let q = 0; q < 8; q++) { const r2 = q % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos((q * Math.PI) / 4) * r2, Math.sin((q * Math.PI) / 4) * r2); } ctx.closePath(); ctx.fill(); ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    default: break;
  }
}

// ---------- 主入口 ----------
/** 视频素材要先解码出这一帧（异步）；导出时每帧先等它，预览时在后台解 */
export async function prepareFrame(data) {
  const { script, planData, t, skinId } = data;
  const look = skins[lookOf(script, skinId)];
  const idx = currentIdx(planData, t);
  const sc = sceneOf(data, look, idx);
  await Promise.all(sc.items.filter((it) => isClip(it.m)).map((it) => prepareClip(it.m.clip, clipT(it.m, it.start, t), it.lane)));
}

export function drawFrame(ctx, data) {
  const { script, tl, planData, t, skinId } = data;
  const theme = normalizeTheme(script.theme); const th = THEMES[theme?.key]; const tEmoji = themeEmoji(theme);
  const look = skins[lookOf(script, skinId)];
  const skin = th && look.themed ? { ...look, chip1: th.red, chip2: darker(th.red), cardInk: th.red, ...(look.bg === 'paper' ? { hl: th.red } : {}) } : look;
  const account = script.account || '我的账号';
  ctx.save();
  drawBg(ctx, look, skin, t, tEmoji);

  const idx = currentIdx(planData, t);
  const s = script.sections[idx]; const p = planData[idx];
  let layout = 'full';
  if (s && p) {
    const sc = sceneOf(data, look, idx); layout = sc.layout;
    const tr = transOf(script, look, idx); const k = clamp((t - p.start) / (TRANS_DUR[tr] || 0.3));
    // 一句一换的小切点：快速推近 + 闪一下
    const kc = sc.cutAt > p.start ? clamp((t - sc.cutAt) / 0.2) : 1;
    ctx.save();
    if (k < 1) transPre(ctx, tr, k);
    if (kc < 1) { const z = 1 + 0.12 * (1 - easeOut(kc)); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    if (layout === 'type') drawTypeScene(ctx, look, skin, s, p, t, idx, sc.items[0], tEmoji);
    else cellsOf(layout, look, idx).forEach((cell, j) => drawCell(ctx, look, skin, cell, sc.items[j] || sc.items[0], j, p, t, idx, s.label));
    ctx.restore();
    if (kc < 1) { ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - kc)})`; ctx.fillRect(0, 0, W, H); }
    // 贴边版式：上下压暗，标题和字幕在任何画面上都看得清
    if (look.bleed && layout !== 'type') {
      ctx.fillStyle = grad(ctx, 0, 560, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'); ctx.fillRect(0, 0, W, 560);
      ctx.fillStyle = grad(ctx, 1150, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)'); ctx.fillRect(0, 1150, W, H - 1150);
    }
    if (k < 1) transPost(ctx, tr, k, skin, idx, account);
    if (layout !== 'type') {
      const drawInner = (box) => { const img = imageOf(sc.items[0], t); if (img) coverIn(ctx, img, box); else drawPlaceholder(ctx, skin, s.label, box); };
      drawOverlay(ctx, s.visual || { type: 'shot' }, p, t, skin, { x: 0, y: 0, w: W, h: H }, idx, drawInner);
    }
  }

  drawDeco(ctx, look, skin, script, tl, t, idx, p || { start: 0 }, account, tEmoji, layout);
  if (layout !== 'type' || look.title === 'mag' || look.title === 'news') drawTitle(ctx, look, skin, script, t, account, tEmoji);

  const sec = tl.sections[idx];
  const li = sec ? sec.lines.findIndex((l) => t >= l.start && t < l.end + 0.15) : -1;
  if (li >= 0) drawSub(ctx, look, skin, sec.lines[li], s?.key, t, look.subY, idx * 3 + li);
  ctx.restore();
}

/** 这套版式默认配的背景音乐 */
export const bgmFor = (script, skinId) => skins[lookOf(script, skinId)].bgm;

/** 音效：开场、每次切镜头、一句一换、贴片弹出、拼图格子出现、大字砸下、结尾 */
export function sfxCues(data) {
  const { script, tl, planData, skinId } = data;
  const look = skins[lookOf(script, skinId)]; const S = look.sfx; const out = [];
  out.push({ t: 0.05, kind: S.intro, gain: 0.8 });
  planData.forEach((p, i) => {
    const v = script.sections[i].visual || {};
    const sc = sceneOf({ ...data, t: p.start + 0.01 }, look, i);
    if (i > 0) out.push({ t: Math.max(0, p.start - 0.12), kind: S.cut, gain: S.cutGain ?? 0.7 });
    if (sc.layout === 'type') {
      typeParts(v).forEach((_, k) => out.push({ t: p.steps[k] ?? p.start + 0.25 + k * 0.45, kind: S.type, gain: 0.75 }));
    } else {
      if (v.type === 'cta') out.push({ t: p.steps[0] ?? p.start + 0.3, kind: S.end, gain: 0.8 });
      else p.steps.slice(0, 4).forEach((st) => out.push({ t: st, kind: S.pop, gain: 0.45 }));
      const n = NEED[sc.layout] || 1;
      for (let k = 1; k < n; k++) out.push({ t: p.start + k * CELL_GAP, kind: S.cell, gain: 0.5 });
      if (look.subcut && sc.layout === 'full') tl.sections[i].lines.slice(1).forEach((l) => out.push({ t: l.start - 0.05, kind: S.sub || S.cut, gain: 0.45 }));
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789%?？—@”✓✗:/·▶RECLIVESCPLAYBREAKING现场关注真实课堂实拍记录快讯原话数据画面ABCD';
  await loadFontFaces([`900 40px "Noto Sans SC"`, `700 40px "Noto Sans SC"`, `48px "${PIXEL_FAMILY}"`], text);
}

/** 挑一套版式：最近 3 条用过的先不用，连着做几条看起来都不一样 */
function pickLook() {
  let recent = [];
  try { recent = JSON.parse(globalThis.localStorage?.getItem('ycp.footageLooks') || '[]'); } catch { /* */ }
  const pool = LOOK_IDS.filter((x) => !recent.includes(x));
  const list = pool.length ? pool : LOOK_IDS;
  const pick = list[Math.floor(Math.random() * list.length)];
  try { globalThis.localStorage?.setItem('ycp.footageLooks', JSON.stringify([pick, ...recent].slice(0, 3))); } catch { /* */ }
  return pick;
}

/** AI 结果兜底 */
export function normalize(s, splitLine) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '实拍混剪';
  const hl = Array.isArray(s.headline) ? s.headline : [s.headline];
  s.headline = [str(hl[0], 12) || s.title, str(hl[1], 12)];
  s.theme = normalizeTheme(s.theme);
  if (!skins[s.look]) s.look = pickLook();
  if (!Number(s.seed)) s.seed = 1 + Math.floor(Math.random() * 999999);
  const TYPES = ['shot', 'hook', 'chips', 'big', 'stat', 'quote', 'steps', 'checklist', 'nametag', 'location', 'ticker', 'compare', 'cta', 'qa', 'polaroid', 'focus', 'stamp'];
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = TYPES.includes(v.type) ? v.type : 'shot';
    const lines = (x.lines || []).map((l) => String(l).trim()).filter(Boolean).flatMap((l) => (splitLine ? splitLine(l) : [l])).slice(0, 3);
    const items = (n, len) => (v.items || []).map((q) => str(q, len)).filter(Boolean).slice(0, n);
    const all = lines.join('');
    // 字幕关键词：AI 给的、口播里确实出现的；没给就从贴片文字里找口播里出现的
    let key = (Array.isArray(x.key) ? x.key : [x.key]).map((k) => String(k || '').trim()).filter((k) => k.length >= 2 && k.length <= 6 && all.includes(k)).slice(0, 2);
    if (!key.length) key = [...(v.items || []), ...(v.lines || [])].map((k) => String(k || '').trim()).filter((k) => k.length >= 2 && k.length <= 5 && all.includes(k)).slice(0, 2);
    return {
      tag: str(x.label || type, 8),
      label: str(x.label, 8),
      kw: String(x.kw || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
      ours: !!x.ours, key,
      src: /^https:\/\/images\.pexels\.com\//.test(x.src || '') ? x.src : '', by: str(x.by, 40),
      visual: {
        type,
        items: type === 'chips' ? items(4, 6) : items(4, 11),
        lines: (v.lines || []).map((q) => str(q, 12)).slice(0, 2),
        title: str(v.title, 10), label: str(v.label, type === 'ticker' ? 5 : 10),
        big: str(v.big, 8), unit: str(v.unit, 4), sub: str(v.sub, 14),
        text: str(v.text, type === 'cta' ? 14 : type === 'ticker' ? 26 : type === 'stamp' ? 4 : 40), by: str(v.by, 12),
        name: str(v.name, 10), role: str(v.role, 18), place: str(v.place, 14), note: str(v.note, 18),
        q: str(v.q, 22), a: str(v.a, 22), who: str(v.who, 6), caption: str(v.caption, 14),
        left: { label: str(v.left?.label, 5), items: (v.left?.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 3) },
        right: { label: str(v.right?.label, 5), items: (v.right?.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 3) },
      },
      lines,
    };
  }).filter((x) => x.lines.length);
  // 同一种贴片最多 2 次（AI 有时不听），多出来的改成纯画面
  const used = {};
  s.sections.forEach((x) => { const ty = x.visual.type; if (ty === 'shot' || ty === 'cta') return; used[ty] = (used[ty] || 0) + 1; if (used[ty] > 2) x.visual = { ...x.visual, type: 'shot' }; });
  s.sections.forEach((x, i) => { if (!x.kw) x.kw = s.sections[i - 1]?.kw || 'education classroom'; });
  const seen = []; let rr2 = 0;
  s.sections.forEach((x) => {
    if (seen.includes(x.kw)) return;
    if (seen.length >= 12) { x.kw = seen[rr2++ % seen.length]; return; }
    seen.push(x.kw);
  });
  return s;
}
