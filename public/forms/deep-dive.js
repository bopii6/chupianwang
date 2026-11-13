// 形式 05：深度解读
// 灵魂：顶部一个“为什么”大问题全程钉住（观众带着问题看完），中间 16:9 实拍画面每句一换，
// 关键处叠一层“信息贴片”（蓝色标签、斜体大字、数据卡、引语），底部一行字幕。像一档财经/行业解读节目。
// 画面来源：客户现场照片优先，其余按关键词从正版素材库（Pexels）找；都没有时画科技感兜底面板。
import { W, H, clamp, easeOut, font, fitFont, wrap, countUp, hash } from '../engine/draw.js';

export const meta = {
  id: 'deep-dive',
  name: '深度解读',
  category: '知识讲解',
  outcome: '用一个“为什么”把家长问住，讲透背后的门道，立住“懂行”的专业人设',
  ideas: ['为什么越来越多家长不报奥数了', '为什么孩子刷了很多题，成绩还是上不去', '中考分流之后，普高到底有多难进', '为什么有的机构开一家倒一家'],
  tagline: '财经解读节目风：钉住一个大问题，实拍画面每句一换，层层拆解',
  fits: '行业解读 · 政策分析 · 教育观点 · 立专业人设',
  durations: [1, 2, 3],
  bgm: 'story',
  needsStock: true,
  coverIdx: 4,
  photoKind: 'scenes',
  photoHint: '可选：上传课堂、校区、学员作品等现场照片，讲到“我们”的时候会优先用。其余画面自动从正版素材库匹配。照片只存在你自己的电脑里。',
};

export const skins = {
  navy: { name: '深蓝财经', bg: '#060a13', bg2: '#0c1424', bar: '#121926', net: 'rgba(120,150,200,', ink: '#ffffff', hl: '#ffe12e', chip1: '#3f86ff', chip2: '#1745c9', chipEdge: 'rgba(170,205,255,0.95)', statInk: '#1747d1' },
  noir: { name: '黑金', bg: '#070707', bg2: '#141414', bar: '#171717', net: 'rgba(200,180,130,', ink: '#ffffff', hl: '#f6c343', chip1: '#e0a92a', chip2: '#9c6b0c', chipEdge: 'rgba(255,230,160,0.95)', statInk: '#a86d00' },
  crimson: { name: '热血红', bg: '#0d0607', bg2: '#1c0b0d', bar: '#1c1012', net: 'rgba(220,130,130,', ink: '#ffffff', hl: '#ffd84a', chip1: '#ff4a4a', chip2: '#b3121c', chipEdge: 'rgba(255,190,190,0.95)', statInk: '#c3161f' },
};

const VISUALS = ['shot', 'chips', 'big', 'stat', 'quote', 'question'];
const SY = 620; const SH = 608; // 画面区 1080×608（16:9）
const SKEW = -0.16; // 标题斜体

// ---------- 工具 ----------
const pop = (t, t0, dur = 0.24) => {
  if (t0 == null || t < t0) return 0;
  const k = clamp((t - t0) / dur);
  return k < 0.7 ? easeOut(k / 0.7) * 1.08 : 1.08 - 0.08 * ((k - 0.7) / 0.3);
};
function withPop(ctx, s, cx, cy, fn) {
  if (s <= 0.001) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.globalAlpha *= clamp(s * 1.6); fn(); ctx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
/** 斜体“标题字”：Noto 900 横向略压窄 + 右倾，接近节目常用的窄体标题字 */
function slantText(ctx, text, x, y, size, fill, { align = 'center', stroke = 0, strokeColor = 'rgba(0,0,0,0.85)', squeeze = 0.92 } = {}) {
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
function fitSlant(ctx, text, size, maxW, squeeze = 0.92) {
  let s = size; font(ctx, s, 900);
  while (s > 20 && ctx.measureText(text).width * squeeze > maxW) { s -= 2; font(ctx, s, 900); }
  return s;
}

// ---------- 背景：缓慢漂移的“网络节点”连线 ----------
const NODES = Array.from({ length: 46 }, (_, i) => ({ x: hash(i + 1) * W, y: hash(i + 101) * H, ax: 20 + hash(i + 201) * 40, ay: 20 + hash(i + 301) * 40, sp: 0.05 + hash(i + 401) * 0.12, ph: hash(i + 501) * 6.28 }));
function drawNet(ctx, skin, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, skin.bg2); g.addColorStop(0.5, skin.bg); g.addColorStop(1, skin.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const pts = NODES.map((n) => [n.x + Math.sin(t * n.sp + n.ph) * n.ax, n.y + Math.cos(t * n.sp * 0.8 + n.ph) * n.ay]);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0]; const dy = pts[i][1] - pts[j][1];
      const d2 = dx * dx + dy * dy;
      if (d2 > 330 * 330) continue;
      ctx.strokeStyle = skin.net + (0.22 * (1 - Math.sqrt(d2) / 330)).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
    }
  }
  ctx.fillStyle = skin.net + '0.45)';
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
}

// ---------- 时间规划 ----------
const itemCount = (v) => (v?.type === 'chips' ? (v.items || []).length : v?.type === 'big' || v?.type === 'question' ? 2 : v?.type === 'shot' ? 0 : 1);
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

// ---------- 画面（照片推拉摇移） ----------
function drawMedia(ctx, img, i, p, t) {
  const dur = Math.max(0.5, p.end - p.start);
  const k = clamp((t - p.start) / dur);
  const mode = Math.floor(hash(i * 7 + 3) * 4);
  const base = Math.max(W / img.width, SH / img.height);
  let z = 1.08; let ox = 0; let oy = 0;
  if (mode === 0) z = 1.02 + 0.1 * k; else if (mode === 1) z = 1.12 - 0.1 * k;
  else { z = 1.12; ox = (mode === 2 ? 1 : -1) * (k - 0.5) * 70; }
  const s = base * z;
  const dw = img.width * s; const dh = img.height * s;
  // 竖图偏上取景（人脸多在上半部分）
  const fy = img.height > img.width ? 0.32 : 0.5;
  const top = clamp(SY + SH / 2 - dh * fy + oy, SY + SH - dh, SY);
  ctx.drawImage(img, W / 2 - dw / 2 + ox, top, dw, dh);
}
/** 没有画面时的兜底：深色科技面板 + 画面描述大字 */
function drawPlaceholder(ctx, skin, label, i, t) {
  const g = ctx.createLinearGradient(0, SY, W, SY + SH);
  g.addColorStop(0, skin.bg2); g.addColorStop(1, skin.bar);
  ctx.fillStyle = g; ctx.fillRect(0, SY, W, SH);
  ctx.strokeStyle = skin.net + '0.12)'; ctx.lineWidth = 2;
  const off = (t * 16) % 60;
  ctx.beginPath();
  for (let x = -60 + off; x < W + 60; x += 60) { ctx.moveTo(x, SY); ctx.lineTo(x, SY + SH); }
  for (let y = SY; y <= SY + SH; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // 扫描光
  const sx = ((t * 0.35 + hash(i)) % 1) * (W + 400) - 200;
  const sg = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.06)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, SY, W, SH);
  if (label) {
    const size = fitSlant(ctx, label, 130, W - 160);
    ctx.globalAlpha = 0.16; slantText(ctx, label, W / 2, SY + SH / 2, size, skin.ink); ctx.globalAlpha = 1;
  }
}

// ---------- 信息贴片 ----------
function drawOverlay(ctx, v, p, t, skin, i) {
  const st = p.steps; const cx = W / 2;
  switch (v.type) {
    case 'chips': {
      const items = (v.items || []).slice(0, 4);
      font(ctx, 46, 900);
      const ws = items.map((s) => Math.min(320, ctx.measureText(s).width + 64));
      const gap = 22; const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      const scale = Math.min(1, (W - 60) / total);
      let x = cx - (total * scale) / 2; const y = SY + SH - 100;
      items.forEach((s, k) => {
        const w = ws[k] * scale; const h = 92 * scale;
        withPop(ctx, pop(t, st[k]), x + w / 2, y, () => {
          ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
          const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, skin.chip1); g.addColorStop(1, skin.chip2);
          ctx.fillStyle = g; rr(ctx, x, y - h / 2, w, h, 12 * scale); ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = skin.chipEdge; ctx.lineWidth = 3; rr(ctx, x + 1.5, y - h / 2 + 1.5, w - 3, h - 3, 11 * scale); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, x + 6, y - h / 2 + 6, w - 12, h * 0.36, 8 * scale); ctx.fill();
          fitFont(ctx, s, 46 * scale, w - 30, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s, x + w / 2, y + 2);
        });
        x += w + gap * scale;
      });
      break;
    }
    case 'big': {
      // 左侧压暗 + 两行斜体大字从左侧带拖影滑入
      const k0 = clamp((t - st[0] + 0.1) / 0.3);
      const g = ctx.createLinearGradient(0, 0, W * 0.85, 0);
      g.addColorStop(0, `rgba(0,0,0,${0.6 * k0})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, SY, W, SH);
      const [l1, l2] = v.lines || [];
      [[l1, skin.ink, SY + SH * 0.42], [l2, skin.hl, SY + SH * 0.66]].forEach(([s, color, y], k) => {
        if (!s || t < st[k]) return;
        const e = easeOut(clamp((t - st[k]) / 0.32));
        const size = fitSlant(ctx, s, 104, W - 110);
        for (let gh = 3; gh >= 0; gh--) {
          const back = (1 - e) * 260 + gh * (1 - e) * 60;
          ctx.globalAlpha = gh ? 0.18 * (1 - e) : clamp(e * 1.6);
          slantText(ctx, s, 56 - back, y, size, color, { align: 'left', stroke: size * 0.12 });
        }
        ctx.globalAlpha = 1;
      });
      break;
    }
    case 'stat': {
      withPop(ctx, pop(t, st[0], 0.3), 300, SY + SH / 2, () => {
        const x = 60; const y = SY + SH / 2 - 150; const w = 470; const h = 300;
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
        ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, x, y, w, h, 22); ctx.fill();
        ctx.shadowColor = 'transparent';
        fitFont(ctx, v.label || '', 40, w - 60, 900); ctx.fillStyle = skin.statInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.label || '', x + w / 2, y + 58);
        ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 40, y + 96, w - 80, 2);
        if (v.sub) { font(ctx, 28, 700); ctx.fillStyle = '#7a8394'; ctx.fillText(v.sub, x + w / 2, y + 128); }
        const val = countUp(v.big || '', clamp((t - st[0]) / 0.9));
        font(ctx, 46, 900); const uw = v.unit ? ctx.measureText(v.unit).width + 10 : 0;
        const bs = fitFont(ctx, val, 120, w - 70 - uw, 900); const bw = ctx.measureText(val).width;
        const bx = x + w / 2 - (bw + uw) / 2;
        ctx.fillStyle = skin.statInk; ctx.textAlign = 'left'; ctx.fillText(val, bx, y + 210);
        if (v.unit) { font(ctx, 40, 900); ctx.fillStyle = '#3b4252'; ctx.fillText(v.unit, bx + bw + 10, y + 210 + bs * 0.18); }
      });
      break;
    }
    case 'quote': {
      const e = easeOut(clamp((t - st[0]) / 0.35));
      if (e <= 0) break;
      ctx.save(); ctx.globalAlpha = e;
      const x = 50; const w = W - 100;
      font(ctx, 48, 900);
      const rows = wrap(ctx, v.text || '', w - 110, 3);
      const h = 70 + rows.length * 66 + (v.by ? 56 : 0);
      const y = SY + SH - h - 34 + (1 - e) * 30;
      ctx.fillStyle = 'rgba(8,10,16,0.82)'; rr(ctx, x, y, w, h, 18); ctx.fill();
      ctx.fillStyle = skin.hl; ctx.fillRect(x, y + 20, 8, h - 40);
      ctx.fillStyle = skin.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      rows.forEach((r, k) => ctx.fillText(r, x + 56, y + 66 + k * 66));
      if (v.by) { font(ctx, 32, 700); ctx.fillStyle = skin.hl; ctx.fillText('—— ' + v.by, x + 56, y + 66 + rows.length * 66); }
      ctx.restore();
      break;
    }
    case 'question': {
      ctx.fillStyle = `rgba(0,0,0,${0.5 * clamp((t - p.start) / 0.3)})`; ctx.fillRect(0, SY, W, SH);
      // 漂浮的问号
      ctx.save(); font(ctx, 54, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let q = 0; q < 26; q++) {
        const life = ((t - p.start) * (0.25 + hash(q + 9) * 0.3) + hash(q + 3)) % 1;
        const x = hash(q + 17) * W; const y = SY + SH - life * (SH + 80) + 40;
        ctx.globalAlpha = 0.55 * Math.sin(life * Math.PI);
        ctx.fillStyle = '#ffffff'; font(ctx, 30 + hash(q + 5) * 40, 900); ctx.fillText('?', x, y);
      }
      ctx.restore();
      const [l1, l2] = v.lines || [];
      if (l1) withPop(ctx, pop(t, st[0]), cx, SY + 220, () => {
        const size = fitFont(ctx, l1, 64, W - 200, 900); const w = ctx.measureText(l1).width;
        ctx.fillStyle = skin.hl; ctx.globalAlpha *= 0.92; ctx.fillRect(cx - w / 2 - 22, SY + 220 - size * 0.62, w + 44, size * 1.24); ctx.globalAlpha = 1;
        ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l1, cx, SY + 222);
      });
      if (l2 && t >= st[1]) {
        const e = easeOut(clamp((t - st[1]) / 0.3));
        const size = fitSlant(ctx, l2, 96, W - 120);
        ctx.globalAlpha = e; slantText(ctx, l2, cx, SY + 400 + (1 - e) * 30, size, skin.ink, { stroke: size * 0.14 }); ctx.globalAlpha = 1;
      }
      break;
    }
    default: break;
  }
}

// ---------- 主入口 ----------
export function drawFrame(ctx, { script, tl, planData, t, skinId = 'navy', assets }) {
  const skin = skins[skinId] || skins.navy;
  const account = script.account || '我的账号';
  ctx.save();
  drawNet(ctx, skin, t);

  // 顶栏：账号
  ctx.fillStyle = skin.bar; ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 95, W, 2);
  ctx.fillStyle = skin.chip1; rr(ctx, 40, 30, 18, 18, 3); ctx.fill();
  ctx.fillStyle = skin.hl; rr(ctx, 52, 44, 14, 14, 3); ctx.fill();
  font(ctx, 38, 700); ctx.fillStyle = '#e8ecf3'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(account, 80, 50);

  // 大问题：全程钉住
  const [h1, h2] = script.headline || [script.title || '', ''];
  const hs = Math.min(fitSlant(ctx, h1, 100, W - 110), h2 ? fitSlant(ctx, h2, 100, W - 110) : 100);
  slantText(ctx, h1, W / 2, h2 ? 376 : 430, hs, skin.ink, { stroke: hs * 0.08 });
  if (h2) slantText(ctx, h2, W / 2, 376 + hs * 1.18, hs, skin.hl, { stroke: hs * 0.08 });

  // 当前镜头
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx]; const p = planData[idx];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, SY, W, SH); ctx.clip();
  if (s && p) {
    const img = assets?.media?.[idx];
    // 切镜头：轻微放大回落
    const k = clamp((t - p.start) / 0.18);
    const z = 1 + (1 - easeOut(k)) * 0.04;
    ctx.save();
    ctx.translate(W / 2, SY + SH / 2); ctx.scale(z, z); ctx.translate(-W / 2, -(SY + SH / 2));
    if (img) drawMedia(ctx, img, idx, p, t); else drawPlaceholder(ctx, skin, s.label, idx, t);
    ctx.restore();
    // 统一压一层暗角，叠字更清楚
    const vg = ctx.createLinearGradient(0, SY, 0, SY + SH);
    vg.addColorStop(0, 'rgba(0,0,0,0.12)'); vg.addColorStop(0.7, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg; ctx.fillRect(0, SY, W, SH);
    if (k < 1) { ctx.fillStyle = `rgba(255,255,255,${0.16 * (1 - k)})`; ctx.fillRect(0, SY, W, SH); }
    drawOverlay(ctx, s.visual || { type: 'shot' }, p, t, skin, idx);
  }
  ctx.restore();
  // 画面上下细边
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, SY - 2, W, 2); ctx.fillRect(0, SY + SH, W, 2);

  // 字幕
  const sec = tl.sections[idx];
  const ln = sec?.lines.find((l) => t >= l.start && t < l.end + 0.15);
  if (ln) {
    font(ctx, 54, 700);
    const rows = wrap(ctx, ln.text, W - 120, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rows.forEach((r, k) => {
      const y = SY + SH + 74 + k * 70;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(r, W / 2, y);
      ctx.fillStyle = skin.ink; ctx.fillText(r, W / 2, y);
    });
  }
  ctx.restore();
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789%?？—';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`900 40px "Noto Sans SC"`, text), fonts.load(`700 40px "Noto Sans SC"`, text)]);
}

/** AI 结果兜底 */
export function normalize(s, splitLine) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '深度解读';
  const hl = Array.isArray(s.headline) ? s.headline : [s.headline];
  s.headline = [str(hl[0], 12) || s.title, str(hl[1], 12)];
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = VISUALS.includes(v.type) ? v.type : 'shot';
    const lines = (x.lines || []).map((l) => String(l).trim()).filter(Boolean).flatMap((l) => (splitLine ? splitLine(l) : [l])).slice(0, 3);
    return {
      tag: str(x.label || v.label || type, 8),
      label: str(x.label, 8),
      kw: String(x.kw || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
      ours: !!x.ours,
      src: /^https:\/\/images\.pexels\.com\//.test(x.src || '') ? x.src : '', by: str(x.by, 40),
      visual: {
        type,
        items: (v.items || []).map((q) => str(q, 6)).filter(Boolean).slice(0, 4),
        lines: (v.lines || []).map((q) => str(q, 12)).slice(0, 2),
        label: str(v.label, 10), big: str(v.big, 8), unit: str(v.unit, 4), sub: str(v.sub, 14),
        text: str(v.text, 40), by: str(v.by, 12),
      },
      lines,
    };
  }).filter((x) => x.lines.length);
  // 素材缺少关键词时，沿用上一个镜头的
  s.sections.forEach((x, i) => { if (!x.kw) x.kw = s.sections[i - 1]?.kw || 'education classroom'; });
  // 控制关键词数量（每个词是一次素材库搜索）：相邻两段不连续换新词；全片最多 14 个，超出的轮流复用前面的词
  const seen = []; let changedLast = false; let rr = 0;
  s.sections.forEach((x, i) => {
    const prev = s.sections[i - 1]?.kw;
    if (!prev || x.kw === prev || seen.includes(x.kw)) { if (!seen.includes(x.kw)) seen.push(x.kw); changedLast = !!prev && x.kw !== prev; return; }
    if (changedLast) { x.kw = prev; changedLast = false; return; }
    if (seen.length >= 14) { const pool = seen.filter((k) => k !== prev); x.kw = pool[rr++ % pool.length]; changedLast = true; return; }
    seen.push(x.kw); changedLast = true;
  });
  return s;
}
