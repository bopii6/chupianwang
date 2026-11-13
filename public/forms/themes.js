// 行业主题（五个模板共用）：同一个模板，钢琴、驾校、编程做出来要一眼看得出是不同行业
// AI 从 12 类里选一个 key，再给 2-3 个这个行业的表情。各模板按自己的风格用：主色、图标、背景、道具。
export const THEMES = {
  k12: { name: '学科辅导', red: '#e5252a', pill: '#ffd0d8', pillInk: '#c2183f', emoji: ['📚', '✏️', '📐'] },
  exam: { name: '考证考公', red: '#1f4fd1', pill: '#dbe4ff', pillInk: '#1e3a8a', emoji: ['📝', '🎓', '📖'] },
  language: { name: '语言外语', red: '#0b9aa6', pill: '#d1f3f5', pillInk: '#086a73', emoji: ['🗣️', '🌍', '💬'] },
  music: { name: '音乐乐器', red: '#6d4ae0', pill: '#e8e1ff', pillInk: '#4b2fb5', emoji: ['🎹', '🎼', '🎵'] },
  dance: { name: '舞蹈', red: '#d6337f', pill: '#ffdbeb', pillInk: '#a2185a', emoji: ['💃', '🩰', '✨'] },
  art: { name: '美术书法', red: '#e8581a', pill: '#ffe0d0', pillInk: '#ad3d0b', emoji: ['🎨', '🖌️', '🖼️'] },
  coding: { name: '编程科技', red: '#2563eb', pill: '#d9e6ff', pillInk: '#1c46c4', emoji: ['💻', '🤖', '🧩'] },
  driving: { name: '驾校', red: '#e08600', pill: '#ffedc2', pillInk: '#8a5000', emoji: ['🚗', '🛞', '🚦'] },
  beauty: { name: '美业手艺', red: '#e14b7d', pill: '#ffdbe7', pillInk: '#ad2858', emoji: ['💅', '💄', '✨'] },
  fitness: { name: '运动健身', red: '#139a45', pill: '#d3f4df', pillInk: '#0c6b30', emoji: ['🏋️', '🏃', '💪'] },
  cooking: { name: '烹饪烘焙', red: '#b4530a', pill: '#fde3c4', pillInk: '#873c05', emoji: ['🍰', '🧁', '☕'] },
  business: { name: '商业知识付费', red: '#b8860b', pill: '#fff0bf', pillInk: '#755500', emoji: ['💼', '📈', '💡'] },
};
export const THEME_KEYS = Object.keys(THEMES);
export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/** 这条视频的行业表情（AI 给的优先，没给就用这一类的默认表情） */
export const themeEmoji = (theme) => (theme?.emoji?.length ? theme.emoji : THEMES[theme?.key]?.emoji) || null;
/** 行业主色（没有主题返回 null，模板用自己的默认色） */
export const themeColor = (theme) => THEMES[theme?.key]?.red || null;

/** AI 结果兜底：key 必须认识；表情最多 3 个 */
export function normalizeTheme(th) {
  th = th || {};
  const key = THEMES[th.key] ? th.key : '';
  const emo = (Array.isArray(th.emoji) ? th.emoji : []).map((e) => String(e).trim()).filter((e) => e && e.length <= 8).slice(0, 3);
  return key || emo.length ? { key, emoji: emo.length ? emo : THEMES[key]?.emoji || [] } : null;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
/** 背景壁纸：行业表情斜着铺满（整张预先画好，每帧只贴一次图）。step = 行距，也是循环飘动的周期 */
const wallCache = new Map();
export function wallpaper(emojis, w, h, { step = 250, size = 92 } = {}) {
  const key = `${emojis.join('|')}|${w}|${h}|${step}|${size}`;
  if (wallCache.has(key)) return wallCache.get(key);
  const c = makeCanvas(w, h + step); const g = c.getContext('2d');
  g.font = `${size}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let n = 0;
  for (let row = 0, y = step * 0.28; y < c.height + 60; row++, y += step) {
    for (let x = row % 2 ? step * 0.76 : step * 0.16; x < w + 140; x += step * 1.2) {
      g.save(); g.translate(x, y); g.rotate(((n % 3) - 1) * 0.22); g.fillText(emojis[n % emojis.length], 0, 0); g.restore(); n++;
    }
  }
  wallCache.set(key, c);
  return c;
}
/** 贴一层慢慢往上飘的壁纸（区域 x,y,w,h，透明度 alpha） */
export function drawWallpaper(ctx, emojis, t, { x = 0, y = 0, w, h, alpha = 0.07, step = 250, size = 92, speed = 16 } = {}) {
  const img = wallpaper(emojis, w, h, { step, size });
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, x, y - ((t * speed) % step));
  ctx.restore();
}
