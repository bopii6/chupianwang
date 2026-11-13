// 形式 01：黑金数据卡
// 灵魂：一页一个观点，跟着口播把一张信息图一块一块“搭”出来。
// 画框固定不动（账号区、系列标题、卡片框、语音条、字幕），只有卡片里的内容随段落重建。
import {
  W, H, clamp, easeOut, appear, font, fitFont, wrap, splitSubtitle, strokeRect, withFade, countUp, hash,
} from '../engine/draw.js';
import { themeEmoji, normalizeTheme, drawWallpaper, EMOJI_FONT } from './themes.js';

export const meta = {
  id: 'data-card',
  name: '黑金数据卡',
  category: '知识讲解',
  outcome: '把知识点讲出“研究报告感”，立专业人设，让家长收藏转发',
  ideas: ['初中数学提分的3个真相', '中考志愿填报的5个误区', '孩子成绩卡在70分怎么办', '英语阅读提分的关键'],
  tagline: '一页一个观点，数据跟着口播一块块搭出来',
  fits: '讲知识点 · 讲政策 · 摆数据 · 行业分析',
  durations: [1, 2, 3],
  bgm: 'tech', // 默认背景音乐
};

export const skins = {
  blackGold: { name: '黑金', bg: '#000000', bg2: '#120d04', accent: '#F7A51C', text: '#FFFFFF', muted: '#8E8E8E', frame: 'rgba(255,255,255,0.12)', panel: 'rgba(255,255,255,0.045)', glyph: 0.13, avatarBg: '#F4F1EA', avatarFg: '#1a1a1a' },
  deepSea: { name: '深海蓝', bg: '#01040b', bg2: '#04142b', accent: '#3DA5FF', text: '#FFFFFF', muted: '#8193A8', frame: 'rgba(255,255,255,0.12)', panel: 'rgba(255,255,255,0.045)', glyph: 0.15, avatarBg: '#EAF3FF', avatarFg: '#0b2140' },
  chinaRed: { name: '中国红', bg: '#060101', bg2: '#1f0503', accent: '#FF4B33', text: '#FFFFFF', muted: '#9B8A88', frame: 'rgba(255,255,255,0.12)', panel: 'rgba(255,255,255,0.045)', glyph: 0.13, avatarBg: '#FFF1EE', avatarFg: '#3a0a05' },
  paper: { name: '米白纸感', bg: '#F3EEE4', bg2: '#E9E0CF', accent: '#D4570E', text: '#1B1B1B', muted: '#80766A', frame: 'rgba(0,0,0,0.14)', panel: 'rgba(0,0,0,0.045)', glyph: 0.09, avatarBg: '#1B1B1B', avatarFg: '#F3EEE4' },
};

// ---------- 版式常量（1080×1920） ----------
const L = 92;            // 内容左边
const R = 988;           // 内容右边
const CW = R - L;
const Y = {
  account: 232, title: 345, frameTop: 470, tag: 499, h1: 575, h2: 645, sub: 710, headLine: 762,
  module: 800, divider: 1162, conclusion: 1215, frameBottom: 1280, wave: 1408, waveName: 1497, sub1: 1553,
};

// ---------- 时间规划：每个元素什么时候出现 ----------
function moduleSteps(m) {
  switch (m?.type) {
    case 'compare': return 2 + ((m.items || []).length ? 1 : 0);
    case 'stats': return (m.items || []).length;
    case 'grid': return Math.ceil((m.items || []).length / 2);
    case 'flow': return 4;
    case 'list': return (m.items || []).length;
    case 'matrix': return 3;
    case 'timeline': return (m.nodes || []).length;
    case 'pyramid': return (m.levels || []).length;
    case 'myth': return (m.items || []).length;
    case 'quote': return m.by ? 2 : 1;
    case 'formula': return (m.parts || []).length + 1;
    case 'cycle': return (m.nodes || []).length;
    case 'bars': return (m.items || []).length;
    case 'venn': return 3;
    case 'checks': return (m.items || []).length;
    case 'scale': return 2;
    case 'stairs': return (m.steps || []).length;
    case 'funnel': return (m.levels || []).length;
    case 'iceberg': return 1 + (m.below || []).length;
    case 'gauge': return 2;
    case 'schedule': return (m.rows || []).length;
    case 'qa': return 2;
    case 'mindmap': return (m.branches || []).length;
    case 'checkmatrix': return (m.rows || []).length;
    case 'keyword': return 2;
    case 'roadmap': return (m.stops || []).length;
    case 'donut': return (m.parts || []).length;
    default: return 0;
  }
}

export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i];
    const lines = sec.lines;
    const steps = moduleSteps(s.module) + ((s.chips || []).length ? 1 : 0);
    const first = lines[0];
    const last = lines[lines.length - 1];
    const a = first.start + Math.min(1.6, (first.end - first.start) * 0.6);
    const b = lines.length > 1 ? last.start : Math.max(a + 0.5, last.end - 1.2);
    const anchors = lines.slice(1, -1).map((l) => l.start);
    const times = [];
    if (steps > 0 && anchors.length >= steps && steps > 1) {
      // 足够多的句子：每块对应一句口播
      for (let k = 0; k < steps; k++) times.push(k === 0 ? Math.min(a, anchors[0]) : anchors[k]);
    } else {
      for (let k = 0; k < steps; k++) times.push(a + ((b - a) * k) / Math.max(1, steps));
    }
    return {
      start: sec.start,
      end: sec.end,
      h1: sec.start,
      h2: sec.start + 0.7,
      steps: times,
      conclusion: lines.length > 1 ? last.start + 0.2 : b,
    };
  });
}

// ---------- 背景缓存：静态部分只画一次，每帧只做几次贴图 ----------
const SWEEP_W = 480;
const bgCache = new Map();
// cpu=true 时用 CPU 画布：导出时避免每帧从显卡回读，编码快一倍
function makeCanvas(w, h, cpu) {
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.getContext('2d', { willReadFrequently: !!cpu });
  return c;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function bgLayers(glyph, skin, cpu) {
  const key = glyph + '|' + skin.name + '|' + (cpu ? 1 : 0);
  if (bgCache.has(key)) return bgCache.get(key);
  // 1) 底色 + 中心暖光
  const base = makeCanvas(W, H, cpu);
  const b = base.getContext('2d');
  b.fillStyle = skin.bg;
  b.fillRect(0, 0, W, H);
  const rg = b.createRadialGradient(W / 2, 1000, 50, W / 2, 1000, 1100);
  rg.addColorStop(0, skin.bg2);
  rg.addColorStop(1, skin.bg);
  b.fillStyle = rg;
  b.fillRect(0, 180, W, H - 180);
  // 2) 背景大字（已经乘好透明度）
  const drawGlyph = (g, fill, stroke) => {
    font(g, 1250, 900);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fill;
    g.fillText(glyph || 'K', W / 2 + 20, 1040);
    if (stroke) { g.lineWidth = 6; g.strokeStyle = stroke; g.globalAlpha *= 0.6; g.strokeText(glyph || 'K', W / 2 + 20, 1040); }
  };
  const gl = makeCanvas(W, H, cpu);
  const g = gl.getContext('2d');
  const grad = g.createLinearGradient(0, 400, W, 1700);
  grad.addColorStop(0, skin.accent);
  grad.addColorStop(0.55, shade(skin.accent, -0.55));
  grad.addColorStop(1, skin.accent);
  g.globalAlpha = skin.glyph;
  drawGlyph(g, grad, skin.accent);
  // 3) 扫光用的白色字形遮罩 + 窄条画布
  const mask = makeCanvas(W, H, cpu);
  drawGlyph(mask.getContext('2d'), '#fff', null);
  const strip = makeCanvas(SWEEP_W, H, cpu);
  // 4) 顶部压暗
  const top = makeCanvas(W, 420, cpu);
  const tg = top.getContext('2d');
  const lg = tg.createLinearGradient(0, 0, 0, 420);
  lg.addColorStop(0, skin.bg);
  lg.addColorStop(1, hexA(skin.bg, 0));
  tg.fillStyle = lg;
  tg.fillRect(0, 0, W, 420);
  const out = { base, gl, mask, strip, top };
  bgCache.set(key, out);
  return out;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(clamp(v / 255 + amt, 0, 1) * 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawBackground(ctx, t, script, skin) {
  const { base, gl, mask, strip, top } = bgLayers(script.glyph, skin, !!ctx.getContextAttributes?.().willReadFrequently);
  ctx.drawImage(base, 0, 0);
  // 大字缓慢漂移（整数像素平移，不缩放，贴图最快）
  const dx = Math.round(Math.sin(t * 0.07) * 18);
  const dy = Math.round(Math.cos(t * 0.05) * 12);
  ctx.drawImage(gl, dx, dy);
  // 扫光：每 9 秒一次，只处理一条 480px 宽的竖条
  const p = (t % 9) / 9;
  if (p < 0.45) {
    const x = Math.round(-SWEEP_W + (p / 0.45) * (W + SWEEP_W));
    const s = strip.getContext('2d');
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, SWEEP_W, H);
    s.drawImage(mask, x - dx, 0, SWEEP_W, H, 0, 0, SWEEP_W, H);
    s.globalCompositeOperation = 'source-in';
    const lg = s.createLinearGradient(0, 0, SWEEP_W, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = lg;
    s.fillRect(0, 0, SWEEP_W, H);
    ctx.save();
    ctx.globalAlpha = skin.glyph * 0.9;
    ctx.drawImage(strip, x, dy);
    ctx.restore();
  }
  ctx.drawImage(top, 0, 0);
}

function drawAvatar(ctx, cx, cy, r, name, skin) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = skin.avatarBg;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = skin.accent;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  font(ctx, r * 0.95, 900);
  ctx.fillStyle = skin.avatarFg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText([...(name || '课')][0], cx, cy + r * 0.04);
  ctx.restore();
}

function drawFixedFrame(ctx, script, skin, account) {
  // 账号区
  drawAvatar(ctx, 96, Y.account, 36, account, skin);
  font(ctx, 34, 700);
  ctx.fillStyle = skin.text;
  ctx.globalAlpha = 0.9;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('@' + (account || '我的账号'), 152, Y.account + 2);
  ctx.globalAlpha = 1;
  // 系列标题
  fitFont(ctx, script.title || '', 66, 900, 900, 2);
  ctx.fillStyle = skin.accent;
  ctx.textAlign = 'center';
  ctx.fillText(script.title || '', W / 2, Y.title);
  // 卡片框：两侧细竖线 + 分隔线
  ctx.fillStyle = skin.frame;
  ctx.fillRect(L - 2, Y.frameTop, 2, Y.frameBottom - Y.frameTop);
  ctx.fillRect(R + 2, Y.frameTop, 2, Y.frameBottom - Y.frameTop);
  ctx.fillRect(L, Y.divider, CW, 2);
}

// ---------- 模块 ----------
function drawCompare(ctx, m, st, t, skin) {
  const a0 = appear(t, st[0]);
  const bw = 328; const bh = 145; const by = 830;
  withFade(ctx, a0, 20, () => {
    ctx.fillStyle = skin.panel;
    ctx.fillRect(L, by, bw, bh);
    strokeRect(ctx, L, by, bw, bh, skin.muted, 4);
    fitFont(ctx, m.left || '', 44, bw - 50, 900);
    ctx.fillStyle = skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.left || '', L + bw / 2, by + bh / 2 + 2);
    strokeRect(ctx, R - bw, by, bw, bh, skin.accent, 4);
    fitFont(ctx, m.right || '', 44, bw - 50, 900);
    ctx.fillStyle = skin.accent;
    ctx.fillText(m.right || '', R - bw + bw / 2, by + bh / 2 + 2);
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    ctx.save(); ctx.translate(540, by + bh / 2); ctx.scale(pulse, pulse);
    ctx.fillRect(-21, -21, 42, 42);
    ctx.restore();
  });
  // 曲线描线
  const pc = appear(t, st[1], 0.9);
  if (pc > 0) {
    ctx.save();
    ctx.strokeStyle = skin.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const len = 900;
    ctx.setLineDash([len, len]);
    ctx.lineDashOffset = len * (1 - pc);
    ctx.beginPath();
    ctx.moveTo(L + 110, by + 70);
    ctx.bezierCurveTo(L + 330, by + 20, 470, by + 50, 540, by + bh / 2);
    ctx.bezierCurveTo(610, by + 100, 760, by + 135, R - 140, by + 95);
    ctx.stroke();
    ctx.restore();
  }
  const items = m.items || [];
  if (items.length && st[2] != null) {
    const per = 5; const cw = 168; const gap = (CW - per * cw) / (per - 1);
    items.slice(0, 10).forEach((it, i) => {
      const row = Math.floor(i / per); const col = i % per;
      const inRow = Math.min(per, items.length - row * per);
      const rowW = inRow * cw + (inRow - 1) * gap;
      const x = L + (CW - rowW) / 2 + col * (cw + gap) + (row === 0 && items.length >= per ? 0 : 0);
      const y = 1000 + row * 72;
      withFade(ctx, appear(t, st[2] + i * 0.12), 14, () => {
        ctx.fillStyle = skin.accent; ctx.globalAlpha *= 0.55;
        ctx.fillRect(x, y, cw - 18, 3);
        ctx.globalAlpha /= 0.55;
        ctx.fillRect(x + 16, y + 30, 14, 14);
        fitFont(ctx, it, 30, cw - 60, 700);
        ctx.fillStyle = skin.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(it, x + 42, y + 38);
      });
    });
  }
  return items.length > 5 ? 1130 : 1060;
}

function drawStats(ctx, m, st, t, skin) {
  const items = (m.items || []).slice(0, 3);
  const n = Math.max(1, items.length); const gap = 22;
  const w = (CW - gap * (n - 1)) / n; const y = 790; const h = 225;
  items.forEach((it, i) => {
    const x = L + i * (w + gap);
    const a = appear(t, st[i]);
    withFade(ctx, a, 24, () => {
      ctx.fillStyle = skin.panel; ctx.fillRect(x, y, w, h);
      strokeRect(ctx, x, y, w, h, skin.frame, 3);
      const p = clamp((t - st[i]) / 0.9);
      fitFont(ctx, String(it.value), n === 3 ? 64 : 76, w - 44, 900);
      ctx.fillStyle = skin.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(countUp(it.value, p), x + 26, y + 98);
      ctx.fillStyle = skin.text; ctx.globalAlpha *= 0.85;
      fitFont(ctx, it.label || '', 26, w - 50, 700);
      ctx.fillText(it.label || '', x + 24, y + 145);
      ctx.globalAlpha /= 0.85;
      ctx.fillStyle = skin.frame; ctx.fillRect(x + 24, y + 172, w - 48, 16);
      ctx.fillStyle = skin.accent;
      ctx.fillRect(x + 24, y + 172, (w - 48) * clamp(Number(it.ratio) || 0.5) * easeOut((t - st[i] - 0.2) / 1.0), 16);
    });
  });
  return y + h + 30;
}

function drawGrid(ctx, m, st, t, skin) {
  const items = (m.items || []).slice(0, 8);
  const hdr = appear(t, st[0]);
  withFade(ctx, hdr, 10, () => {
    font(ctx, 22, 700, 2); ctx.textBaseline = 'middle';
    ctx.fillStyle = skin.muted; ctx.textAlign = 'left'; ctx.fillText(m.left || '', L, 800);
    ctx.fillStyle = skin.accent; ctx.textAlign = 'right'; ctx.fillText(m.right || '', R, 800);
    ctx.fillStyle = skin.frame; ctx.fillRect(L, 818, CW, 2);
  });
  const rows = Math.ceil(items.length / 2);
  const rh = rows > 3 ? 60 : 72; const cw = (CW - 18) / 2;
  items.forEach((it, i) => {
    const r = Math.floor(i / 2); const c = i % 2;
    const x = L + c * (cw + 18); const y = 834 + r * (rh + 8);
    withFade(ctx, appear(t, (st[r] ?? st[0]) + c * 0.15), 14, () => {
      ctx.fillStyle = skin.panel; ctx.fillRect(x, y, cw, rh);
      ctx.fillStyle = skin.accent; ctx.fillRect(x, y, 4, rh);
      font(ctx, 22, 900); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + 20, y + rh / 2);
      fitFont(ctx, it.title || '', 32, cw * 0.5, 900);
      ctx.fillStyle = skin.text; ctx.fillText(it.title || '', x + 64, y + rh / 2 + 1);
      fitFont(ctx, '› ' + (it.desc || ''), 24, cw * 0.36, 700);
      ctx.fillStyle = skin.muted; ctx.textAlign = 'right';
      ctx.fillText('› ' + (it.desc || ''), x + cw - 18, y + rh / 2 + 1);
    });
  });
  return 834 + rows * (rh + 8) + 14;
}

function drawFlow(ctx, m, st, t, skin) {
  const cy = 925;
  const fx = L; const fw = 160; const fh = 120;
  const cx = 300; const cwid = 470; const ctop = 812; const cbot = 1040;
  const tw = 180; const tx = R - tw; const th = 110;
  // 起点
  withFade(ctx, appear(t, st[0]), 16, () => {
    ctx.fillStyle = skin.panel; ctx.fillRect(fx, cy - fh / 2, fw, fh);
    strokeRect(ctx, fx, cy - fh / 2, fw, fh, skin.muted, 3);
    font(ctx, 30, 900); ctx.fillStyle = skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ls = wrap(ctx, m.from || '', fw - 26, 2);
    ls.forEach((s, i) => ctx.fillText(s, fx + fw / 2, cy + (i - (ls.length - 1) / 2) * 38));
  });
  // 中心
  const pc = appear(t, st[1], 0.6);
  if (pc > 0) {
    ctx.save(); ctx.globalAlpha *= clamp(pc * 1.5);
    ctx.fillStyle = skin.accent;
    ctx.fillRect(cx, ctop, cwid * pc, 3); ctx.fillRect(cx + cwid * (1 - pc), cbot, cwid * pc, 3);
    ctx.fillStyle = skin.muted; ctx.fillRect(fx + fw, cy, (cx - fx - fw) * pc, 3);
    fitFont(ctx, m.center || '', 40, cwid - 40, 900);
    ctx.fillStyle = skin.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.center || '', cx + cwid / 2, ctop + 50);
    ctx.restore();
  }
  const subs = (m.subs || []).slice(0, 4);
  subs.forEach((s, i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = cx + 30 + col * (cwid / 2); const y = ctop + 120 + row * 62;
    withFade(ctx, appear(t, st[2] + i * 0.18), 12, () => {
      ctx.fillStyle = skin.accent; ctx.fillRect(x, y - 7, 14, 14);
      fitFont(ctx, s, 30, cwid / 2 - 60, 700);
      ctx.fillStyle = skin.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(s, x + 28, y + 1);
    });
  });
  // 终点
  const pt = appear(t, st[3]);
  withFade(ctx, pt, 16, () => {
    ctx.fillStyle = skin.accent; ctx.fillRect(cx + cwid, cy, (tx - cx - cwid) * pt, 3);
    strokeRect(ctx, tx, cy - th / 2, tw, th, skin.accent, 4);
    font(ctx, 30, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ls = wrap(ctx, m.to || '', tw - 30, 2);
    ls.forEach((s, i) => ctx.fillText(s, tx + tw / 2, cy + (i - (ls.length - 1) / 2) * 38));
  });
  return 1070;
}

function drawList(ctx, m, st, t, skin) {
  const items = (m.items || []).slice(0, 4);
  const rh = items.length > 3 ? 66 : 76;
  items.forEach((it, i) => {
    const y = 800 + i * rh;
    withFade(ctx, appear(t, st[i]), 14, () => {
      font(ctx, 24, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1).padStart(2, '0'), L + 6, y + rh / 2);
      fitFont(ctx, it, 36, CW - 90, 900);
      ctx.fillStyle = skin.text; ctx.fillText(it, L + 66, y + rh / 2 + 1);
      ctx.fillStyle = skin.frame; ctx.fillRect(L, y + rh - 2, CW, 2);
    });
  });
  return 800 + items.length * rh + 24;
}

function drawNone(ctx, t, t0, skin) {
  const a = appear(t, t0 + 0.4);
  withFade(ctx, a, 0, () => {
    const s = 1 + Math.sin(t * 3) * 0.08;
    ctx.save(); ctx.translate(540, 935); ctx.scale(s, s);
    ctx.fillStyle = skin.accent; ctx.fillRect(-20, -20, 40, 40);
    ctx.restore();
  });
  return 1080;
}

function drawChips(ctx, chips, y, t0, t, skin) {
  if (!chips.length || t0 == null) return;
  font(ctx, 26, 700);
  const ws = chips.map((c) => ctx.measureText(c).width + 44);
  const gap = 16;
  const total = ws.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let x = L + (CW - total) / 2;
  chips.forEach((c, i) => {
    const w = ws[i];
    withFade(ctx, appear(t, t0 + i * 0.14), 12, () => {
      ctx.fillStyle = skin.panel; ctx.fillRect(x, y, w, 54);
      ctx.fillStyle = skin.accent; ctx.fillRect(x, y, w, 3);
      font(ctx, 26, 700); ctx.fillStyle = skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c, x + w / 2, y + 29);
    });
    x += w + gap;
  });
}


// ---------- 新增模块（同一个模板做出来不重样） ----------
const MY = 800; // 模块区顶部
function drawMatrix(ctx, m, st, t, skin) { // 四象限：两条轴 + 四格，重点那格高亮
  const w = 640; const h = 330; const x0 = L + (CW - w) / 2 + 30; const y0 = MY + 6; const cx = x0 + w / 2; const cy = y0 + h / 2;
  const a0 = appear(t, st[0], 0.5);
  if (a0 > 0) {
    ctx.save(); ctx.globalAlpha *= a0;
    ctx.fillStyle = skin.muted; ctx.fillRect(x0, cy - 1, w * easeOut(a0), 3); ctx.fillRect(cx - 1, y0 + h * (1 - easeOut(a0)), 3, h * easeOut(a0));
    font(ctx, 24, 700); ctx.fillStyle = skin.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`${m.xAxis || ''} →`, x0 + w, cy + 22);
    ctx.save(); ctx.translate(cx - 22, y0); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(`${m.yAxis || ''} →`, 0, 0); ctx.restore();
    ctx.restore();
  }
  const cells = (m.cells || []).slice(0, 4); const pos = [[0, 0], [1, 0], [0, 1], [1, 1]];
  cells.forEach((c, i) => {
    const [col, row] = pos[i]; const cw = w / 2 - 16; const ch = h / 2 - 16;
    const x = x0 + col * (w / 2) + 8; const y = y0 + row * (h / 2) + 8;
    const hi = Number(m.hi) === i;
    withFade(ctx, appear(t, (st[1] ?? 0) + i * 0.15), 12, () => {
      ctx.fillStyle = hi ? hexA(skin.accent, 0.18) : skin.panel; ctx.fillRect(x, y, cw, ch);
      if (hi) strokeRect(ctx, x, y, cw, ch, skin.accent, 4);
      fitFont(ctx, c, 36, cw - 30, 900); ctx.fillStyle = hi ? skin.accent : skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c, x + cw / 2, y + ch / 2 + 2);
    });
  });
  if (m.hi != null && st[2] != null) { // 重点格子闪一下
    const k = clamp((t - st[2]) / 0.6);
    if (k > 0 && k < 1) { const [col, row] = pos[Number(m.hi)] || [0, 0]; ctx.save(); ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = skin.accent; ctx.fillRect(x0 + col * (w / 2) + 8, y0 + row * (h / 2) + 8, w / 2 - 16, h / 2 - 16); ctx.restore(); }
  }
  return y0 + h + 24;
}
function drawTimeline(ctx, m, st, t, skin) { // 横向时间轴：上面时间、下面事件，进度线往右走
  const nodes = (m.nodes || []).slice(0, 5); const n = Math.max(1, nodes.length);
  const x0 = L + 60; const x1 = R - 60; const y = MY + 150; const gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
  ctx.fillStyle = skin.frame; ctx.fillRect(x0, y - 2, x1 - x0, 4);
  const k = clamp((t - (st[0] ?? 1e9) + 0.2) / Math.max(0.3, (st[n - 1] ?? 0) - (st[0] ?? 0) + 0.2));
  ctx.fillStyle = skin.accent; ctx.fillRect(x0, y - 2, (x1 - x0) * easeOut(k), 4);
  nodes.forEach((nd, i) => {
    const x = n > 1 ? x0 + gap * i : (x0 + x1) / 2;
    withFade(ctx, appear(t, st[i]), 14, () => {
      ctx.fillStyle = skin.bg; ctx.fillRect(x - 15, y - 15, 30, 30); strokeRect(ctx, x - 15, y - 15, 30, 30, skin.accent, 4);
      ctx.fillStyle = skin.accent; ctx.fillRect(x - 6, y - 6, 12, 12);
      fitFont(ctx, nd.when || '', 30, Math.max(140, gap - 10), 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nd.when || '', x, y - 62);
      font(ctx, 30, 700); const ls = wrap(ctx, nd.what || '', Math.max(150, gap - 16), 2);
      ctx.fillStyle = skin.text; ls.forEach((l, j) => ctx.fillText(l, x, y + 58 + j * 40));
    });
  });
  return y + 160;
}
function drawPyramid(ctx, m, st, t, skin) { // 金字塔：从底往上搭
  const lv = (m.levels || []).slice(0, 4); const n = Math.max(1, lv.length); const lh = Math.min(84, 320 / n); const base = MY + 12 + n * lh;
  lv.forEach((txt, i) => {
    const a = appear(t, st[i]); if (a <= 0) return;
    const wb = 760 * (1 - (i / n) * 0.66); const wt = 760 * (1 - ((i + 1) / n) * 0.66); const yb = base - i * lh; const yt = yb - lh + 6;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, -(1 - easeOut(a)) * 30);
    ctx.fillStyle = i === n - 1 ? skin.accent : hexA(skin.accent, 0.12 + 0.18 * (i / n));
    ctx.beginPath(); ctx.moveTo(W / 2 - wb / 2, yb); ctx.lineTo(W / 2 + wb / 2, yb); ctx.lineTo(W / 2 + wt / 2, yt); ctx.lineTo(W / 2 - wt / 2, yt); ctx.closePath(); ctx.fill();
    if (i !== n - 1) { ctx.strokeStyle = hexA(skin.accent, 0.6); ctx.lineWidth = 2; ctx.stroke(); }
    fitFont(ctx, txt, 36, (wb + wt) / 2 - 50, 900); ctx.fillStyle = i === n - 1 ? skin.bg : skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W / 2, yt + (lh - 6) / 2 + 2);
    ctx.restore();
  });
  return base + 26;
}
function drawMyth(ctx, m, st, t, skin) { // 误区 → 正解：左边灰色划掉，右边金色
  const rows = (m.items || []).slice(0, 3); const rh = 104; const half = (CW - 90) / 2;
  font(ctx, 22, 700, 2); ctx.textBaseline = 'middle';
  withFade(ctx, appear(t, st[0] ?? 0, 0.4), 0, () => { ctx.fillStyle = skin.muted; ctx.textAlign = 'left'; ctx.fillText('误区', L, MY + 8); ctx.fillStyle = skin.accent; ctx.textAlign = 'left'; ctx.fillText('正解', L + half + 90, MY + 8); });
  rows.forEach((r, i) => {
    const y = MY + 40 + i * rh; const a = appear(t, st[i]); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - easeOut(a)) * -24, 0);
    ctx.fillStyle = skin.panel; ctx.fillRect(L, y, half, rh - 18);
    fitFont(ctx, r.wrong || '', 34, half - 40, 700); ctx.fillStyle = skin.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(r.wrong || '', L + 22, y + (rh - 18) / 2); const ww = ctx.measureText(r.wrong || '').width;
    const s = clamp((t - st[i] - 0.25) / 0.35); ctx.fillStyle = skin.muted; ctx.fillRect(L + 20, y + (rh - 18) / 2, ww * easeOut(s), 3);
    ctx.fillStyle = skin.accent; ctx.beginPath(); ctx.moveTo(L + half + 26, y + (rh - 18) / 2 - 14); ctx.lineTo(L + half + 52, y + (rh - 18) / 2); ctx.lineTo(L + half + 26, y + (rh - 18) / 2 + 14); ctx.fill();
    ctx.fillStyle = hexA(skin.accent, 0.1); ctx.fillRect(L + half + 90, y, half, rh - 18); ctx.fillStyle = skin.accent; ctx.fillRect(L + half + 90, y, 4, rh - 18);
    fitFont(ctx, r.right || '', 34, half - 40, 900); ctx.fillStyle = skin.text; ctx.fillText(r.right || '', L + half + 112, y + (rh - 18) / 2);
    ctx.restore();
  });
  return MY + 40 + rows.length * rh + 6;
}
function drawQuote(ctx, m, st, t, skin) { // 金句卡：大引号 + 两三行大字 + 署名
  const a = appear(t, st[0], 0.5); if (a <= 0) return MY + 300;
  ctx.save(); ctx.globalAlpha *= a;
  font(ctx, 200, 900); ctx.fillStyle = hexA(skin.accent, 0.35); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('“', L - 6, MY - 40);
  font(ctx, 58, 900); const ls = wrap(ctx, m.text || '', CW - 120, 3);
  ctx.fillStyle = skin.text; ctx.textBaseline = 'middle';
  ls.forEach((l, i) => { const k = clamp((t - st[0] - i * 0.12) / 0.4); ctx.save(); ctx.globalAlpha *= k; ctx.fillText(l, L + 90, MY + 90 + i * 82 + (1 - easeOut(k)) * 16); ctx.restore(); });
  if (m.by) { const k = appear(t, st[1] ?? st[0]); ctx.globalAlpha *= k; font(ctx, 28, 700); ctx.fillStyle = skin.accent; ctx.fillText(`—— ${m.by}`, L + 90, MY + 90 + ls.length * 82 + 18); }
  ctx.restore();
  return MY + 90 + ls.length * 82 + 60;
}
function drawFormula(ctx, m, st, t, skin) { // 公式：方框 + 号 = 结果
  const parts = (m.parts || []).slice(0, 3); const n = parts.length; const op = 56; const rw = 200; const bw = Math.min(190, (CW - rw - op * n) / Math.max(1, n)); const bh = 150;
  let x = L + (CW - (n * bw + n * op + rw)) / 2; const y = MY + 70;
  const box = (txt, bx, w, hot, s0) => withFade(ctx, appear(t, s0), 18, () => {
    ctx.fillStyle = hot ? skin.accent : skin.panel; ctx.fillRect(bx, y, w, bh); if (!hot) strokeRect(ctx, bx, y, w, bh, skin.frame, 3);
    fitFont(ctx, txt, 44, w - 28, 900); ctx.fillStyle = hot ? skin.bg : skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + w / 2, y + bh / 2 + 2);
  });
  parts.forEach((p, i) => {
    box(p, x, bw, false, st[i]); x += bw;
    const sym = i === n - 1 ? '=' : '+'; const s0 = i === n - 1 ? st[n] : st[i + 1];
    withFade(ctx, appear(t, s0), 0, () => { font(ctx, 60, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sym, x + op / 2, y + bh / 2); });
    x += op;
  });
  box(m.result || '', x, rw, true, st[n]);
  return y + bh + 40;
}
function drawCycle(ctx, m, st, t, skin) { // 循环图：几个环节绕成一圈，中间是核心
  const nodes = (m.nodes || []).slice(0, 4); const n = Math.max(1, nodes.length); const cx = W / 2; const cy = MY + 175; const r = 140;
  const k = clamp((t - (st[0] ?? 1e9)) / Math.max(0.4, (st[n - 1] ?? 0) - (st[0] ?? 0) + 0.4));
  if (k > 0) { ctx.save(); ctx.strokeStyle = hexA(skin.accent, 0.7); ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOut(k)); ctx.stroke(); ctx.restore(); }
  withFade(ctx, appear(t, st[0] ?? 0, 0.5), 0, () => { ctx.fillStyle = hexA(skin.accent, 0.14); ctx.beginPath(); ctx.arc(cx, cy, 82, 0, Math.PI * 2); ctx.fill(); fitFont(ctx, m.center || '', 40, 140, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.center || '', cx, cy + 2); });
  nodes.forEach((nd, i) => {
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n; const x = cx + Math.cos(ang) * r * 1.55; const y = cy + Math.sin(ang) * r * 0.98;
    withFade(ctx, appear(t, st[i]), 12, () => {
      font(ctx, 32, 900); const w = ctx.measureText(nd).width + 46;
      ctx.fillStyle = skin.bg; ctx.fillRect(x - w / 2, y - 30, w, 60); strokeRect(ctx, x - w / 2, y - 30, w, 60, skin.accent, 3);
      ctx.fillStyle = skin.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nd, x, y + 2);
    });
  });
  return cy + r + 50;
}
function drawBars(ctx, m, st, t, skin) { // 程度条：表示轻重高低，不写数字
  const items = (m.items || []).slice(0, 5); const rh = Math.min(72, 330 / Math.max(1, items.length)); const lw = 230;
  items.forEach((it, i) => {
    const y = MY + 10 + i * rh; const a = appear(t, st[i]); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    fitFont(ctx, it.label || '', 32, lw - 20, 900); ctx.fillStyle = skin.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it.label || '', L, y + rh / 2);
    const bw = CW - lw; ctx.fillStyle = skin.frame; ctx.fillRect(L + lw, y + rh / 2 - 12, bw, 24);
    const lvl = clamp(Number(it.level) || 0.5, 0.08, 1); const g = easeOut(clamp((t - st[i]) / 0.8));
    ctx.fillStyle = i === 0 ? skin.accent : hexA(skin.accent, 0.55); ctx.fillRect(L + lw, y + rh / 2 - 12, bw * lvl * g, 24);
    ctx.restore();
  });
  return MY + 10 + items.length * rh + 20;
}

// ---------- 第三批模块（到 28 种） ----------
const txt = (ctx, s, x, y, size, color, w = 900, align = 'center', maxW = 0) => { if (maxW) fitFont(ctx, s, size, maxW, w); else font(ctx, size, w); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); };
function drawVenn(ctx, m, st, t, skin) { // 韦恩图：两个圈，交集是重点
  const cy = MY + 175; const r = 150; const d = 110;
  [[-1, m.left, st[0]], [1, m.right, st[1]]].forEach(([s, label, s0]) => {
    const a = appear(t, s0); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = hexA(skin.accent, 0.12); ctx.strokeStyle = skin.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2 + s * d, cy, r * (0.85 + 0.15 * easeOut(a)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    txt(ctx, label || '', W / 2 + s * (d + 70), cy, 34, skin.text, 900, 'center', 150); ctx.restore();
  });
  withFade(ctx, appear(t, st[2]), 10, () => { ctx.fillStyle = skin.accent; ctx.fillRect(W / 2 - 62, cy - 30, 124, 60); txt(ctx, m.mid || '', W / 2, cy + 2, 34, skin.bg, 900, 'center', 110); });
  return cy + r + 30;
}
function drawChecks(ctx, m, st, t, skin) { // 打勾清单：方框逐个打勾
  const items = (m.items || []).slice(0, 4); const rh = 80;
  items.forEach((it, i) => {
    const y = MY + 20 + i * rh; const a = appear(t, st[i]);
    ctx.save(); ctx.globalAlpha *= 0.35 + 0.65 * a;
    strokeRect(ctx, L, y, 48, 48, a > 0 ? skin.accent : skin.muted, 4);
    if (a > 0) { ctx.strokeStyle = skin.accent; ctx.lineWidth = 7; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(L + 10, y + 24); ctx.lineTo(L + 21, y + 35); ctx.lineTo(L + 40, y + 12); ctx.stroke(); }
    txt(ctx, it, L + 78, y + 26, 38, skin.text, 900, 'left', CW - 100); ctx.restore();
  });
  return MY + 20 + items.length * rh + 10;
}
function drawScale(ctx, m, st, t, skin) { // 天平：哪边更重一眼看出
  const cx = W / 2; const py = MY + 70; const k = easeOut(clamp((t - (st[1] ?? 1e9)) / 0.8)); const ang = (m.heavier === 'right' ? 1 : -1) * 0.18 * k;
  ctx.fillStyle = skin.muted; ctx.fillRect(cx - 3, py, 6, 250); ctx.fillRect(cx - 80, py + 250, 160, 6);
  ctx.save(); ctx.translate(cx, py); ctx.rotate(ang);
  ctx.fillStyle = skin.accent; ctx.fillRect(-330, -4, 660, 8);
  [[-1, m.left], [1, m.right]].forEach(([s, label]) => {
    const x = s * 310; ctx.save(); ctx.translate(x, 0); ctx.rotate(-ang);
    ctx.strokeStyle = skin.muted; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, 110); ctx.moveTo(0, 0); ctx.lineTo(70, 110); ctx.stroke();
    withFade(ctx, appear(t, st[0]), 0, () => { ctx.fillStyle = skin.panel; ctx.fillRect(-110, 110, 220, 70); strokeRect(ctx, -110, 110, 220, 70, (s === 1) === (m.heavier === 'right') ? skin.accent : skin.frame, 3); txt(ctx, label || '', 0, 146, 36, skin.text, 900, 'center', 190); });
    ctx.restore();
  });
  ctx.restore();
  return MY + 330;
}
function drawStairs(ctx, m, st, t, skin) { // 台阶：一级一级往上走
  const items = (m.steps || []).slice(0, 5); const n = Math.max(1, items.length); const sw = CW / n; const sh = 300 / n;
  items.forEach((it, i) => {
    const a = appear(t, st[i]); if (a <= 0) return;
    const x = L + i * sw; const h = sh * (i + 1); const y = MY + 320 - h;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - easeOut(a)) * 30);
    ctx.fillStyle = i === n - 1 ? skin.accent : hexA(skin.accent, 0.12 + 0.12 * i); ctx.fillRect(x + 4, y, sw - 8, h);
    txt(ctx, it, x + sw / 2, y + 30, 30, i === n - 1 ? skin.bg : skin.text, 900, 'center', sw - 24); ctx.restore();
  });
  return MY + 340;
}
function drawFunnel(ctx, m, st, t, skin) { // 漏斗：层层筛选
  const lv = (m.levels || []).slice(0, 4); const n = Math.max(1, lv.length); const lh = Math.min(84, 320 / n);
  lv.forEach((s, i) => {
    const a = appear(t, st[i]); if (a <= 0) return;
    const wt = 800 * (1 - i / n * 0.6); const wb = 800 * (1 - (i + 1) / n * 0.6); const y = MY + 10 + i * lh;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = i === n - 1 ? skin.accent : hexA(skin.accent, 0.12 + 0.16 * i);
    ctx.beginPath(); ctx.moveTo(W / 2 - wt / 2, y); ctx.lineTo(W / 2 + wt / 2, y); ctx.lineTo(W / 2 + wb / 2, y + lh - 6); ctx.lineTo(W / 2 - wb / 2, y + lh - 6); ctx.closePath(); ctx.fill();
    txt(ctx, s, W / 2, y + (lh - 6) / 2 + 2, 34, i === n - 1 ? skin.bg : skin.text, 900, 'center', wb - 60); ctx.restore();
  });
  return MY + 20 + n * lh;
}
function drawIceberg(ctx, m, st, t, skin) { // 冰山：水面上是表象，水下是真正原因
  const wl = MY + 110; const cx = W / 2;
  ctx.fillStyle = hexA(skin.accent, 0.08); ctx.fillRect(L, wl, CW, 250); ctx.fillStyle = hexA(skin.accent, 0.6); ctx.fillRect(L, wl, CW, 2);
  withFade(ctx, appear(t, st[0]), 10, () => {
    ctx.fillStyle = skin.text; ctx.globalAlpha *= 0.9; ctx.beginPath(); ctx.moveTo(cx - 120, wl); ctx.lineTo(cx - 40, MY + 10); ctx.lineTo(cx + 30, MY + 30); ctx.lineTo(cx + 120, wl); ctx.closePath(); ctx.fill();
    txt(ctx, m.above || '', cx, wl - 36, 30, skin.bg, 900, 'center', 200);
  });
  const below = (m.below || []).slice(0, 3);
  withFade(ctx, appear(t, st[1]), 0, () => { ctx.fillStyle = hexA(skin.accent, 0.25); ctx.beginPath(); ctx.moveTo(cx - 140, wl + 2); ctx.lineTo(cx + 140, wl + 2); ctx.lineTo(cx + 330, wl + 240); ctx.lineTo(cx - 330, wl + 240); ctx.closePath(); ctx.fill(); });
  below.forEach((b, i) => withFade(ctx, appear(t, st[i + 1]), 10, () => txt(ctx, `· ${b}`, cx, wl + 60 + i * 64, 34, skin.text, 900, 'center', 560)));
  return wl + 260;
}
function drawGauge(ctx, m, st, t, skin) { // 仪表盘：指针摆到某个程度（不写数字）
  const cx = W / 2; const cy = MY + 270; const r = 220; const lvl = clamp(Number(m.level) || 0.7); const k = easeOut(clamp((t - (st[0] ?? 1e9)) / 1.0));
  ctx.lineWidth = 34; ctx.strokeStyle = skin.frame; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = skin.accent; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * lvl * k); ctx.stroke();
  const ang = Math.PI + Math.PI * lvl * k; ctx.strokeStyle = skin.text; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * (r - 50), cy + Math.sin(ang) * (r - 50)); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = skin.accent; ctx.fillRect(cx - 14, cy - 14, 28, 28);
  txt(ctx, m.low || '低', cx - r, cy + 40, 26, skin.muted, 700); txt(ctx, m.high || '高', cx + r, cy + 40, 26, skin.muted, 700);
  withFade(ctx, appear(t, st[1] ?? st[0]), 8, () => txt(ctx, m.label || '', cx, cy - 70, 40, skin.accent, 900, 'center', 380));
  return cy + 60;
}
function drawSchedule(ctx, m, st, t, skin) { // 一周安排：左边时间、右边内容
  const rows = (m.rows || []).slice(0, 5); const rh = Math.min(68, 340 / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const y = MY + 10 + i * rh; withFade(ctx, appear(t, st[i]), 10, () => {
      ctx.fillStyle = skin.accent; ctx.fillRect(L, y + 6, 170, rh - 14); txt(ctx, r.when || '', L + 85, y + rh / 2, 30, skin.bg, 900, 'center', 150);
      ctx.fillStyle = skin.panel; ctx.fillRect(L + 180, y + 6, CW - 180, rh - 14); txt(ctx, r.what || '', L + 206, y + rh / 2, 32, skin.text, 900, 'left', CW - 230);
    });
  });
  return MY + 20 + rows.length * rh;
}
function drawQA(ctx, m, st, t, skin) { // 问答卡：Q 先出，A 后出
  withFade(ctx, appear(t, st[0]), 12, () => { ctx.fillStyle = skin.panel; ctx.fillRect(L, MY + 10, CW, 120); txt(ctx, 'Q', L + 50, MY + 70, 64, skin.muted, 900); txt(ctx, m.q || '', L + 110, MY + 72, 40, skin.text, 900, 'left', CW - 140); });
  withFade(ctx, appear(t, st[1]), 12, () => { ctx.fillStyle = hexA(skin.accent, 0.14); ctx.fillRect(L, MY + 150, CW, 170); ctx.fillStyle = skin.accent; ctx.fillRect(L, MY + 150, 6, 170); txt(ctx, 'A', L + 50, MY + 235, 64, skin.accent, 900);
    font(ctx, 38, 900); const ls = wrap(ctx, m.a || '', CW - 160, 2); ctx.fillStyle = skin.text; ctx.textAlign = 'left'; ls.forEach((l, i) => ctx.fillText(l, L + 110, MY + 235 + (i - (ls.length - 1) / 2) * 52)); });
  return MY + 340;
}
function drawMindmap(ctx, m, st, t, skin) { // 思维导图：中心一个词，分支左右散开
  const cx = W / 2; const cy = MY + 170; const br = (m.branches || []).slice(0, 4);
  withFade(ctx, appear(t, st[0] ?? 0, 0.4), 0, () => { ctx.fillStyle = skin.accent; ctx.fillRect(cx - 110, cy - 42, 220, 84); txt(ctx, m.center || '', cx, cy + 2, 40, skin.bg, 900, 'center', 190); });
  const spots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  br.forEach((b, i) => {
    const [sx, sy] = spots[i]; const x = cx + sx * 300; const y = cy + sy * 110; const a = appear(t, st[i]); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = hexA(skin.accent, 0.7); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + sx * 110, cy); ctx.bezierCurveTo(cx + sx * 190, cy, x - sx * 120, y, x - sx * 130, y); ctx.stroke();
    ctx.fillStyle = skin.panel; ctx.fillRect(x - 130, y - 36, 260, 72); strokeRect(ctx, x - 130, y - 36, 260, 72, skin.frame, 2);
    txt(ctx, b, x, y + 2, 34, skin.text, 900, 'center', 230); ctx.restore();
  });
  return cy + 170;
}
function drawCheckmatrix(ctx, m, st, t, skin) { // 对比打勾表：两个选项逐条比
  const cols = (m.cols || ['A', 'B']).slice(0, 2); const rows = (m.rows || []).slice(0, 4); const cw = 200; const x1 = R - cw * 2; const rh = 66;
  withFade(ctx, appear(t, st[0] ?? 0, 0.4), 0, () => cols.forEach((c, j) => { ctx.fillStyle = j ? skin.accent : skin.panel; ctx.fillRect(x1 + j * cw + 6, MY, cw - 12, 56); txt(ctx, c, x1 + j * cw + cw / 2, MY + 29, 32, j ? skin.bg : skin.text, 900, 'center', cw - 30); }));
  rows.forEach((r, i) => {
    const y = MY + 70 + i * rh; withFade(ctx, appear(t, st[i]), 10, () => {
      ctx.fillStyle = skin.frame; ctx.fillRect(L, y + rh - 4, CW, 2);
      txt(ctx, r.label || '', L, y + rh / 2, 34, skin.text, 900, 'left', x1 - L - 20);
      [r.a, r.b].forEach((ok, j) => txt(ctx, ok ? '✓' : '✗', x1 + j * cw + cw / 2, y + rh / 2, 44, ok ? skin.accent : skin.muted, 900));
    });
  });
  return MY + 80 + rows.length * rh;
}
function drawKeyword(ctx, m, st, t, skin) { // 单个关键词：超大字 + 一句解释
  const a = appear(t, st[0], 0.5); if (a <= 0) return MY + 320;
  ctx.save(); ctx.globalAlpha *= a; const sc = 1.25 - 0.25 * easeOut(a);
  ctx.translate(W / 2, MY + 130); ctx.scale(sc, sc); fitFont(ctx, m.word || '', 170, CW - 60, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.word || '', 0, 0); ctx.restore();
  withFade(ctx, appear(t, st[1] ?? st[0]), 10, () => { ctx.fillStyle = skin.frame; ctx.fillRect(W / 2 - 200, MY + 245, 400, 2); txt(ctx, m.note || '', W / 2, MY + 295, 36, skin.text, 700, 'center', CW - 80); });
  return MY + 340;
}
function drawRoadmap(ctx, m, st, t, skin) { // 路线图：起点到终点的一条弯路，沿途几站
  const stops = (m.stops || []).slice(0, 5); const n = Math.max(1, stops.length);
  const pts = stops.map((_, i) => [L + 70 + (CW - 140) * (n > 1 ? i / (n - 1) : 0.5), MY + 170 + (i % 2 ? 90 : -70)]);
  const k = clamp((t - (st[0] ?? 1e9) + 0.2) / Math.max(0.4, (st[n - 1] ?? 0) - (st[0] ?? 0) + 0.3));
  ctx.save(); ctx.strokeStyle = hexA(skin.accent, 0.8); ctx.lineWidth = 6; ctx.setLineDash([18, 12]); ctx.beginPath();
  pts.forEach(([x, y], i) => { const seg = i / Math.max(1, n - 1); if (seg <= k + 0.001) (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); }); ctx.stroke(); ctx.restore();
  stops.forEach((s, i) => withFade(ctx, appear(t, st[i]), 10, () => {
    const [x, y] = pts[i]; ctx.fillStyle = i === n - 1 ? skin.accent : skin.bg; ctx.fillRect(x - 18, y - 18, 36, 36); strokeRect(ctx, x - 18, y - 18, 36, 36, skin.accent, 4);
    txt(ctx, s, x, y + (i % 2 ? 60 : -60), 30, i === n - 1 ? skin.accent : skin.text, 900, 'center', 190);
  }));
  return MY + 340;
}
function drawDonut(ctx, m, st, t, skin) { // 环形构成：几部分各占多少（只表示比重，不写数字）
  const parts = (m.parts || []).slice(0, 4); const sum = parts.reduce((a, p) => a + clamp(Number(p.level) || 0.3, 0.05, 1), 0) || 1;
  const cx = L + 200; const cy = MY + 170; const r = 140; let a0 = -Math.PI / 2;
  parts.forEach((p, i) => {
    const frac = clamp(Number(p.level) || 0.3, 0.05, 1) / sum; const k = easeOut(clamp((t - (st[i] ?? 1e9)) / 0.6));
    if (k > 0) { ctx.strokeStyle = i === 0 ? skin.accent : hexA(skin.accent, 0.65 - i * 0.15); ctx.lineWidth = 56; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + Math.PI * 2 * frac * k - 0.03); ctx.stroke(); }
    withFade(ctx, appear(t, st[i]), 10, () => { const y = MY + 70 + i * 72; ctx.fillStyle = i === 0 ? skin.accent : hexA(skin.accent, 0.65 - i * 0.15); ctx.fillRect(L + 420, y - 14, 28, 28); txt(ctx, p.label || '', L + 470, y, 36, skin.text, 900, 'left', CW - 500); });
    a0 += Math.PI * 2 * frac;
  });
  txt(ctx, m.center || '', cx, cy, 36, skin.text, 900, 'center', 200);
  return MY + 340;
}

// ---------- 段落内容 ----------
function drawSection(ctx, s, idx, p, t, skin) {
  // 段落结尾淡出
  const out = 1 - clamp((t - p.end) / 0.3);
  if (out <= 0) return;
  ctx.save();
  ctx.globalAlpha = out;

  // 编号 + 小标签
  withFade(ctx, appear(t, p.h1, 0.35), 0, () => {
    ctx.fillStyle = skin.accent; ctx.fillRect(L, Y.tag - 16, 5, 32);
    font(ctx, 24, 700, 4); ctx.fillStyle = skin.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${String(idx + 1).padStart(2, '0')} / ${s.tag || ''}`, L + 22, Y.tag);
  });
  const [h1, h2] = s.headline || ['', ''];
  withFade(ctx, appear(t, p.h1), 26, () => {
    fitFont(ctx, h1 || '', 68, CW, 900); ctx.fillStyle = skin.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(h1 || '', L, Y.h1);
  });
  if (h2) {
    withFade(ctx, appear(t, p.h2), 26, () => {
      fitFont(ctx, h2, 68, CW, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(h2, L, Y.h2);
    });
  }
  withFade(ctx, appear(t, p.h2 + 0.2), 10, () => {
    fitFont(ctx, s.sub || '', 26, CW, 700, 3); ctx.fillStyle = skin.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.sub || '', L, h2 ? Y.sub : Y.h2);
    ctx.fillStyle = skin.frame; ctx.fillRect(L, Y.headLine, CW * easeOut((t - p.h2) / 0.8), 2);
  });

  // 可视化模块
  const m = s.module || { type: 'none' };
  const st = p.steps;
  let bottom;
  switch (m.type) {
    case 'compare': bottom = drawCompare(ctx, m, st, t, skin); break;
    case 'stats': bottom = drawStats(ctx, m, st, t, skin); break;
    case 'grid': bottom = drawGrid(ctx, m, st, t, skin); break;
    case 'flow': bottom = drawFlow(ctx, m, st, t, skin); break;
    case 'list': bottom = drawList(ctx, m, st, t, skin); break;
    case 'matrix': bottom = drawMatrix(ctx, m, st, t, skin); break;
    case 'timeline': bottom = drawTimeline(ctx, m, st, t, skin); break;
    case 'pyramid': bottom = drawPyramid(ctx, m, st, t, skin); break;
    case 'myth': bottom = drawMyth(ctx, m, st, t, skin); break;
    case 'quote': bottom = drawQuote(ctx, m, st, t, skin); break;
    case 'formula': bottom = drawFormula(ctx, m, st, t, skin); break;
    case 'cycle': bottom = drawCycle(ctx, m, st, t, skin); break;
    case 'bars': bottom = drawBars(ctx, m, st, t, skin); break;
    case 'venn': bottom = drawVenn(ctx, m, st, t, skin); break;
    case 'checks': bottom = drawChecks(ctx, m, st, t, skin); break;
    case 'scale': bottom = drawScale(ctx, m, st, t, skin); break;
    case 'stairs': bottom = drawStairs(ctx, m, st, t, skin); break;
    case 'funnel': bottom = drawFunnel(ctx, m, st, t, skin); break;
    case 'iceberg': bottom = drawIceberg(ctx, m, st, t, skin); break;
    case 'gauge': bottom = drawGauge(ctx, m, st, t, skin); break;
    case 'schedule': bottom = drawSchedule(ctx, m, st, t, skin); break;
    case 'qa': bottom = drawQA(ctx, m, st, t, skin); break;
    case 'mindmap': bottom = drawMindmap(ctx, m, st, t, skin); break;
    case 'checkmatrix': bottom = drawCheckmatrix(ctx, m, st, t, skin); break;
    case 'keyword': bottom = drawKeyword(ctx, m, st, t, skin); break;
    case 'roadmap': bottom = drawRoadmap(ctx, m, st, t, skin); break;
    case 'donut': bottom = drawDonut(ctx, m, st, t, skin); break;
    default: bottom = drawNone(ctx, t, p.h1, skin);
  }
  const chips = (s.chips || []).slice(0, 4);
  drawChips(ctx, chips, Math.min(bottom, Y.divider - 68), st[st.length - 1], t, skin);

  // 金色结论
  const ac = appear(t, p.conclusion);
  withFade(ctx, ac, 18, () => {
    fitFont(ctx, s.conclusion || '', 46, CW, 900); ctx.fillStyle = skin.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.conclusion || '', L, Y.conclusion);
  });
  if (ac > 0) {
    ctx.fillStyle = skin.accent;
    ctx.fillRect(L, Y.conclusion + 44, CW * easeOut((t - p.conclusion - 0.15) / 0.9), 4);
  }
  ctx.restore();
}

// ---------- 语音条 + 字幕 ----------
function drawVoiceBar(ctx, t, env, fps, skin, account) {
  drawAvatar(ctx, 336, Y.wave, 56, account, skin);
  const amp = env ? env[Math.min(env.length - 1, Math.max(0, Math.floor(t * fps)))] || 0 : 0.35 + 0.25 * Math.sin(t * 6);
  const n = 22; const x0 = 418; const step = 13;
  ctx.fillStyle = skin.accent;
  for (let i = 0; i < n; i++) {
    const base = 0.25 + 0.75 * hash(i);
    const wob = 0.6 + 0.4 * Math.sin(t * 9 + i * 1.7);
    const h = 10 + 62 * base * clamp(amp * 1.1) * wob;
    ctx.fillRect(x0 + i * step, Y.wave - h / 2, 6, h);
  }
  ctx.beginPath();
  ctx.moveTo(780, Y.wave - 16); ctx.lineTo(808, Y.wave); ctx.lineTo(780, Y.wave + 16); ctx.closePath();
  ctx.fill();
  font(ctx, 30, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('@' + (account || '我的账号'), W / 2, Y.waveName);
}

function drawSubtitle(ctx, tl, t, skin) {
  for (const sec of tl.sections) {
    if (t < sec.start - 0.5 || t > sec.end + 0.5) continue;
    for (const ln of sec.lines) {
      if (t >= ln.start && t < ln.end + 0.12) {
        const a = clamp((t - ln.start) / 0.12);
        const rows = splitSubtitle(ln.text);
        ctx.save(); ctx.globalAlpha = a;
        rows.forEach((r, i) => {
          fitFont(ctx, r, 48, 940, 900);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 8; ctx.strokeStyle = skin.bg; ctx.lineJoin = 'round';
          ctx.strokeText(r, W / 2, Y.sub1 + i * 70);
          ctx.fillStyle = skin.text;
          ctx.fillText(r, W / 2, Y.sub1 + i * 70);
        });
        ctx.restore();
        return;
      }
    }
  }
}

// ---------- 主入口：画一帧 ----------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'blackGold', env, fps = 30 }) {
  const skin = skins[skinId] || skins.blackGold;
  const account = script.account || '';
  const tEmoji = themeEmoji(normalizeTheme(script.theme));
  ctx.save();
  drawBackground(ctx, t, script, skin);
  // 行业图标背景只放在浅色纸感皮肤上；黑底皮肤背后已经有行业大字（如“琴”），再叠一层会显得乱
  if (tEmoji && skin.name === '米白纸感') drawWallpaper(ctx, tEmoji, t, { y: 420, w: W, h: 900, alpha: 0.06, step: 260, size: 84, speed: 10 });
  drawFixedFrame(ctx, script, skin, account);
  if (tEmoji) { // 右上角行业徽章：一个小方框 + 行业图标
    const bx = R - 36; const by = Y.account;
    ctx.save(); ctx.fillStyle = skin.panel; ctx.fillRect(bx - 36, by - 36, 72, 72); strokeRect(ctx, bx - 36, by - 36, 72, 72, skin.accent, 3);
    ctx.font = `40px ${EMOJI_FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tEmoji[Math.floor(t / 4) % tEmoji.length], bx, by + 2);
    ctx.restore();
  }
  script.sections.forEach((s, i) => {
    const p = planData[i];
    if (t >= p.start - 0.05 && t <= p.end + 0.35) drawSection(ctx, s, i, p, t, skin);
  });
  drawVoiceBar(ctx, t, env, fps, skin, account);
  drawSubtitle(ctx, tl, t, skin);
  ctx.restore();
}

/** 字体预加载：把脚本里出现的字都加载好（Noto Sans SC 按需分片） */
export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789@/›%.';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, text), fonts.load(`700 40px "Noto Sans SC"`, text)]);
  bgCache.clear();
}
