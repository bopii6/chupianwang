// 形式 01：黑金数据卡
// 灵魂：一页一个观点，跟着口播把一张信息图一块一块“搭”出来。
// 画框固定不动（账号区、系列标题、卡片框、语音条、字幕），只有卡片里的内容随段落重建。
import {
  W, H, clamp, easeOut, appear, font, fitFont, wrap, splitSubtitle, strokeRect, withFade, countUp, hash,
} from '../engine/draw.js';

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
  ctx.save();
  drawBackground(ctx, t, script, skin);
  drawFixedFrame(ctx, script, skin, account);
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
