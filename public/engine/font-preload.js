// 出片前把文案里的字备好。Noto Sans SC、Fusion Pixel 都按 unicode-range 拆成很多文件，
// document.fonts.load() 只下载用到的分片；但前提是页面上有它们的 @font-face。
// 首页不放这些字体（冷启动会下载上百个分片、把带宽吃光），
// 所以第一次真要出片/预览时，这里再把 CSS 插进来（只插一次），然后按文案里的字加载分片。

let DEFAULT_TIMEOUT = 3000;
/**
 * 导出时调大：预览可以先用替代字体凑合，导出不行——
 * 多线程导出时每个渲染线程各自下字体，有的 3 秒内没下完就先用替代字体画、半路才换成真字体，
 * 相邻两帧来自不同线程，字体一帧真一帧假，成片里标题字幕就“抽抽”。导出一律等字体真正下完再画。
 */
export function setFontWait(ms) { DEFAULT_TIMEOUT = ms; }
// 某一组字体已经超时过、且还没加载完：编辑文案时不要再干等一轮
const givenUp = new Set();

// 出片画面实际用到的字体（700/900 正文标题 + 像素字体），界面文字用系统字体
const FONT_CSS = [
  '/vendor/noto-sans-sc/700.css',
  '/vendor/noto-sans-sc/900.css',
  '/fonts/fusion-pixel-12/font.css',
];

const cssReady = new Map();

/** 把一张字体样式表插进页面（只插一次），返回它加载完（或失败）的 Promise */
export function ensureFontCss(href) {
  if (cssReady.has(href)) return cssReady.get(href);
  const p = new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // 加载不到就别卡住出片
    document.head.appendChild(link);
    setTimeout(resolve, 3000);
  });
  cssReady.set(href, p);
  return p;
}

/** 出片要用的字体样式表全部插进来 */
export function ensureRenderFonts() {
  return Promise.all(FONT_CSS.map(ensureFontCss));
}

function fontSet() {
  return globalThis.document?.fonts || globalThis.fonts || null;
}

/**
 * @param {string[]} specs CSS font 简写，例如 `900 40px "Noto Sans SC"`
 * @param {string} text 需要覆盖到的字符
 * @param {number} [timeoutMs]
 */
export async function loadFontFaces(specs, text, timeoutMs = DEFAULT_TIMEOUT) {
  if (!specs?.length) return;
  await ensureRenderFonts(); // 先把 @font-face 备好，否则 fonts.load 找不到字体
  const fonts = fontSet();
  if (!fonts?.load) return;
  const pending = [];
  const waiting = [];
  for (const spec of specs) {
    let job;
    try {
      job = Promise.resolve(fonts.load(spec, text)).then(() => {}, () => {});
    } catch {
      job = Promise.resolve();
    }
    pending.push(job);
    if (!givenUp.has(spec)) waiting.push(job);
  }
  if (!waiting.length) return;
  let timedOut = false;
  await Promise.race([
    Promise.all(waiting).then(() => {}),
    new Promise((resolve) => setTimeout(() => { timedOut = true; resolve(); }, timeoutMs)),
  ]);
  if (!timedOut) return;
  for (const spec of specs) givenUp.add(spec);
  // 加载最终完成（或失败）后恢复等待，下一次改文案仍会等新字
  Promise.all(pending).then(() => {
    for (const spec of specs) givenUp.delete(spec);
  });
}
