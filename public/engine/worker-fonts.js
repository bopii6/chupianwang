// Worker 里拿不到页面的字体，需要按 CSS 里的分片自己注册（只会下载真正用到的字）
export const FONT_CSS = ['/vendor/noto-sans-sc/700.css', '/vendor/noto-sans-sc/900.css', '/fonts/fusion-pixel-12/font.css'];

/**
 * 导出线程：注册字体 → 按文案把要用的字全部下完（不设 3 秒上限）→ 再等所有正在下的字体落地。
 * 所有渲染线程都这样准备好才开画，每一帧用的都是同一套真字体，多线程画出来逐像素一致。
 */
export async function prepareExportFonts(form, script, fontCss) {
  const { setFontWait } = await import('./font-preload.js');
  setFontWait(60000);
  await registerFonts(fontCss);
  const t0 = Date.now();
  await form.preloadFonts(script);
  // 再等每一个正在下载的字体文件落地。注意不能用 self.fonts.ready：Worker 里它经常一直不兑现，白等到超时
  const loading = () => [...self.fonts].filter((f) => f.status === 'loading');
  while (loading().length && Date.now() - t0 < 90000) {
    await Promise.race([Promise.allSettled(loading().map((f) => f.loaded)), new Promise((r) => setTimeout(r, 1000))]);
  }
  const stuck = loading().length;
  if (stuck) throw new Error(`字体还没下载完（还差 ${stuck} 个，网络有点慢），请稍等几秒再点一次导出`);
  self.__fontStats = { ms: Date.now() - t0, loaded: [...self.fonts].filter((f) => f.status === 'loaded').length };
}

const registered = new Set();
export async function registerFonts(cssUrls = FONT_CSS) {
  for (const cssUrl of cssUrls) {
    if (registered.has(cssUrl)) continue; // 同一个线程里只注册一次，不然字体会重复
    registered.add(cssUrl);
    const abs = new URL(cssUrl, self.location.origin);
    const css = await (await fetch(abs)).text();
    for (const block of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const body = block[1];
      const family = body.match(/font-family:\s*["']([^"']+)["']/)?.[1];
      const weight = body.match(/font-weight:\s*(\d+)/)?.[1] || '400';
      const src = body.match(/url\(([^)]+\.woff2)\)/)?.[1];
      const range = body.match(/unicode-range:\s*([^;]+);/)?.[1];
      if (!family || !src) continue;
      self.fonts.add(new FontFace(family, `url(${new URL(src, abs).href})`, { weight, unicodeRange: range || undefined }));
    }
  }
}
