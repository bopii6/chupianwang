// 给每个镜头找画面：客户自己的现场照片优先，其余从正版素材库（Pexels）按关键词搜。
// 图片由浏览器直接从 Pexels CDN 下载（允许跨域，画布不会被“污染”，可以正常导出）。
const searchCache = new Map();
const imgCache = new Map();

async function search(q) {
  if (!searchCache.has(q)) {
    searchCache.set(q, fetch('/api/stock?q=' + encodeURIComponent(q)).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(d.error || '素材搜索失败'); e.code = d.code; throw e; }
      return d.photos || [];
    }));
  }
  try { return await searchCache.get(q); } catch (e) { searchCache.delete(q); throw e; }
}

function loadImage(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, fetch(src).then((r) => { if (!r.ok) throw new Error('图片下载失败'); return r.blob(); })
      .then((b) => createImageBitmap(b, { resizeWidth: 1440, resizeQuality: 'high' })));
  }
  return imgCache.get(src).catch((e) => { imgCache.delete(src); throw e; });
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/**
 * @param {{kw:string, ours?:boolean, pick?:number}[]} shots 每个镜头的关键词
 * @param {ImageBitmap[]} scenes 客户的现场照片
 * @returns {{ media:(ImageBitmap|null)[], picks:(object|null)[], error?:string }}
 */
export async function resolveMedia(shots, scenes = [], onProgress) {
  const media = new Array(shots.length).fill(null);
  const picks = new Array(shots.length).fill(null);
  // 1) 客户照片：先给 ours 的镜头，照片多就再均匀撒到其它镜头
  let si = 0;
  if (scenes.length) {
    shots.forEach((s, i) => { if (s.ours) { media[i] = scenes[si % scenes.length]; picks[i] = { own: true, idx: si % scenes.length }; si++; } });
    const extra = scenes.length - si;
    if (extra > 0) {
      const free = shots.map((_, i) => i).filter((i) => !media[i]);
      for (let k = 0; k < Math.min(extra, free.length); k++) {
        const i = free[Math.floor(((k + 0.5) * free.length) / Math.min(extra, free.length))];
        if (media[i]) continue;
        media[i] = scenes[si % scenes.length]; picks[i] = { own: true, idx: si % scenes.length }; si++;
      }
    }
  }
  // 2) 素材库
  const need = shots.map((s, i) => i).filter((i) => !media[i] && shots[i].kw && !shots[i].src);
  const kws = [...new Set(need.map((i) => shots[i].kw))];
  let error = '';
  const results = new Map();
  await pool(kws, 4, async (q) => {
    try { results.set(q, await search(q)); } catch (e) { error = e.message; results.set(q, []); }
  });
  // 按图片描述和关键词的吻合度排序（素材库返回的顺序不一定最贴题）
  for (const [q, list] of results) {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (p) => words.reduce((n, w) => n + (p.alt.toLowerCase().includes(w.replace(/s$/, '')) ? 1 : 0), 0);
    results.set(q, list.map((p, k) => ({ p, k, s: score(p) })).sort((a, b) => b.s - a.s || a.k - b.k).map((x) => x.p));
  }
  const used = new Set();
  let done = 0;
  // 示例脚本里直接写好了图片地址的镜头
  await pool(shots.map((s, i) => i).filter((i) => !media[i] && shots[i].src), 6, async (i) => {
    try { media[i] = await loadImage(shots[i].src); picks[i] = { by: shots[i].by || '', kw: shots[i].kw }; } catch { /* 下面按关键词再找 */ }
  });
  await pool(need.filter((i) => !media[i]), 6, async (i) => {
    const list = results.get(shots[i].kw) || [];
    if (!list.length) return;
    // 同一张图不在一条视频里重复出现；pick 用来“换一张”
    const start = (shots[i].pick || 0) % list.length;
    let p = null;
    for (let k = 0; k < list.length; k++) { const c = list[(start + k) % list.length]; if (!used.has(c.id)) { p = c; break; } }
    p ||= list[start];
    used.add(p.id);
    try { media[i] = await loadImage(p.src); picks[i] = { id: p.id, by: p.by, page: p.page, kw: shots[i].kw }; } catch { /* 留空，画兜底画面 */ }
    onProgress?.(++done / need.length);
  });
  if (!scenes.length && need.length && media.every((m) => !m)) error ||= '没找到合适的画面';
  return { media, picks, error };
}
