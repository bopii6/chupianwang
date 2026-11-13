// Worker 里拿不到页面的字体，需要按 CSS 里的分片自己注册（只会下载真正用到的字）
export const FONT_CSS = ['/vendor/noto-sans-sc/700.css', '/vendor/noto-sans-sc/900.css', '/fonts/fusion-pixel-12/font.css'];

export async function registerFonts(cssUrls = FONT_CSS) {
  for (const cssUrl of cssUrls) {
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
