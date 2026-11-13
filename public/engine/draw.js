// 通用绘图小工具，所有形式共用
export const W = 1080;
export const H = 1920;
export const FONT = '"Noto Sans SC", "Microsoft YaHei", sans-serif';

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const easeOut = (p) => 1 - Math.pow(1 - clamp(p), 3);
export const easeInOut = (p) => { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };

/** 0→1 的出现进度，t0 之前为 0 */
export const appear = (t, t0, dur = 0.45) => (t0 == null ? 0 : easeOut((t - t0) / dur));

export function font(ctx, size, weight = 900, spacing = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.letterSpacing = `${spacing}px`;
}

/** 在 maxWidth 内自动缩小字号 */
export function fitFont(ctx, text, size, maxWidth, weight = 900, spacing = 0) {
  let s = size;
  font(ctx, s, weight, spacing);
  while (s > 14 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    font(ctx, s, weight, spacing);
  }
  return s;
}

/** 按宽度把中文折行（最多 maxLines 行） */
export function wrap(ctx, text, maxWidth, maxLines = 2) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length === maxLines) break;
    } else cur += ch;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines;
}

/** 字幕断行：优先在标点处分成两行 */
export function splitSubtitle(text, maxChars = 15) {
  const s = String(text).trim();
  const chars = [...s];
  if (chars.length <= maxChars) return [s];
  const mid = Math.ceil(chars.length / 2);
  let best = -1;
  let bestDist = 1e9;
  chars.forEach((c, i) => {
    if ('，、；：,;:'.includes(c) && i < chars.length - 1) {
      const d = Math.abs(i + 1 - mid);
      if (d < bestDist && i + 1 <= maxChars + 3) { best = i + 1; bestDist = d; }
    }
  });
  const cut = best > 0 ? best : mid;
  return [chars.slice(0, cut).join(''), chars.slice(cut).join('')];
}

export function strokeRect(ctx, x, y, w, h, color, lw = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

/** 带 alpha 和上移的绘制包装 */
export function withFade(ctx, a, dy, fn) {
  if (a <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(a);
  ctx.translate(0, (1 - clamp(a)) * dy);
  fn();
  ctx.restore();
}

/** 数字滚动：把 "72" "83%" "1.5倍" 这类值按进度显示；非数字原样返回 */
export function countUp(value, p) {
  const m = String(value).match(/^(\D*?)(\d+(?:\.\d+)?)(.*)$/);
  if (!m || /\d/.test(m[3])) return String(value);
  const n = parseFloat(m[2]);
  const dec = (m[2].split('.')[1] || '').length;
  return m[1] + (n * easeOut(p)).toFixed(dec) + m[3];
}

/** 伪随机（稳定） */
export const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
