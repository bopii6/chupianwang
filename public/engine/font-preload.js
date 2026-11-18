// 出片前把文案里的字备好。Noto Sans SC、Fusion Pixel 都按 unicode-range 拆成很多文件，
// document.fonts.load() 要等用到的分片全部结束才返回。冷缓存时这个 Promise 可能一直不结束
//（文件多、或 CSS 里的 local() 探测卡住），startWithScript 就会停在「AI 正在写文案」。
// 超时就继续画，先用后备字体；自定义字体随后到了，后面的帧会用上，正常加载时画面和原来一样。
// 另外在页面一打开时后台把出片要用的 woff2 全数下载进缓存，写文案的那几十秒里通常已经下完，
// 后面 fonts.load() 就能直接用本地缓存，不必再等网络。

const DEFAULT_TIMEOUT = 3000;
// 某一组字体已经超时过、且还没加载完：编辑文案时不要再干等一轮
const givenUp = new Set();

// 出片画面实际用到的字重。400/500 给界面用，浏览器会按页面已有文字按需加载，不必预先全下。
const WARM_STYLESHEETS = [
  '/vendor/noto-sans-sc/700.css',
  '/vendor/noto-sans-sc/900.css',
  '/fonts/fusion-pixel-12/font.css',
];

let warmPromise = null;

function fontSet() {
  return globalThis.document?.fonts || globalThis.fonts || null;
}

function fontUrlsFromCss(cssText, baseHref) {
  const urls = [];
  const base = new URL(baseHref, globalThis.location?.href || 'http://localhost/');
  for (const m of cssText.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = m[2].trim();
    if (!/\.woff2(\?|#|$)/i.test(raw)) continue;
    try { urls.push(new URL(raw, base).href); } catch { /* ignore bad url */ }
  }
  return urls;
}

async function fetchAll(urls, concurrency = 8) {
  const list = [...new Set(urls)];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const url = list[i++];
      try {
        await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
      } catch { /* 单个分片失败不挡住其余 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) || 0 }, worker));
}

/**
 * 页面一打开就在后台把出片字体分片下载进缓存。不要 await，以免挡住首页。
 * 可重复调用，只跑一轮。
 */
export function warmFonts() {
  if (warmPromise) return warmPromise;
  if (typeof fetch !== 'function' || !globalThis.location) {
    warmPromise = Promise.resolve();
    return warmPromise;
  }
  warmPromise = (async () => {
    const urls = [];
    for (const href of WARM_STYLESHEETS) {
      try {
        const res = await fetch(href, { cache: 'force-cache', credentials: 'same-origin' });
        if (!res.ok) continue;
        urls.push(...fontUrlsFromCss(await res.text(), href));
      } catch { /* 某一张样式表失败就跳过 */ }
    }
    await fetchAll(urls);
  })();
  return warmPromise;
}

/**
 * @param {string[]} specs CSS font 简写，例如 `900 40px "Noto Sans SC"`
 * @param {string} text 需要覆盖到的字符
 * @param {number} [timeoutMs]
 */
export async function loadFontFaces(specs, text, timeoutMs = DEFAULT_TIMEOUT) {
  const fonts = fontSet();
  if (!fonts?.load || !specs?.length) return;
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
