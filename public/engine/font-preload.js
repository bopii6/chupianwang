// 出片前把文案里的字备好。Noto Sans SC、Fusion Pixel 都按 unicode-range 拆成很多文件，
// document.fonts.load() 要等用到的分片全部结束才返回。冷缓存时这个 Promise 可能一直不结束
//（文件多、或 CSS 里的 local() 探测卡住），startWithScript 就会停在「AI 正在写文案」。
// 超时就继续画，先用后备字体；自定义字体随后到了，后面的帧会用上，正常加载时画面和原来一样。

const DEFAULT_TIMEOUT = 3000;
// 某一组字体已经超时过、且还没加载完：编辑文案时不要再干等一轮
const givenUp = new Set();

function fontSet() {
  return globalThis.document?.fonts || globalThis.fonts || null;
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
