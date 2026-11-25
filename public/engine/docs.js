// 资料解析：把客户手上的 PPT / Word / Excel / PDF / 图片 / 文本，变成 AI 能读的文字。
// - 有文字层的（新版 PPT、Word、Excel、普通 PDF）在浏览器里直接取字，原文件不出这台电脑。
// - 扫描件 PDF、图片多的 PDF 页、照片、老版 .doc/.ppt：交给 DeepSeek 官方 OCR 识字（/api/ocr，用的是同一把 DeepSeek 密钥，
//   每 1000 页 0.225 美元）。扫描件是一页一张图地发，一次 4 页并发，看得到进度。
import { unzipSync, strFromU8 } from '/vendor/fflate/browser.js';
import { readXlsxFiles, readXls } from './sheets.js';

export const ACCEPT = '.pptx,.ppt,.docx,.doc,.xlsx,.xls,.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp';
const MAX_CHARS = 30000;
const MAX_OCR_PAGES = 40; // 扫描件最多识前 40 页：再多 AI 也读不完（总共只取 3 万字）
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']);

const xmlText = (xml, tag) => {
  // 取出 <a:t>…</a:t> / <w:t>…</w:t> 里的文字，按段落拼接
  const out = [];
  const paraTag = tag === 'a' ? 'a:p' : 'w:p';
  for (const p of xml.split(`</${paraTag}>`)) {
    const parts = [...p.matchAll(new RegExp(`<${tag}:t[^>]*>([^<]*)</${tag}:t>`, 'g'))].map((m) => m[1]);
    const line = decode(parts.join('')).trim();
    if (line) out.push(line);
  }
  return out;
};
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const visible = (s) => String(s || '').replace(/\s|【第\d+页】|\/|（备注：）/g, '').length;

// ---------- 识图（DeepSeek OCR，经本机服务转发） ----------
async function ocr(blob, name) {
  let r;
  try {
    r = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) }, body: blob, signal: AbortSignal.timeout(200000) });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' ? '识图等太久了，稍后再试' : '识图连不上，检查一下网络');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `识图失败 ${r.status}`), { code: d.code });
  return d.pages || [];
}
/** 并发跑一批任务（DeepSeek 每个账号最多同时 15 个，这里留余量用 4 个） */
async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function readPptx(buf, name, onProgress) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^ppt\/(slides|notesSlides)\/\w+\.xml$/.test(f.name) || /^ppt\/media\//.test(f.name) });
  const num = (n) => Number((n.match(/(\d+)\.xml$/) || [])[1] || 0);
  const slides = Object.keys(files).filter((n) => /^ppt\/slides\/\w+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  const blocks = slides.map((n, i) => {
    const lines = xmlText(strFromU8(files[n]), 'a');
    const notes = files[`ppt/notesSlides/notesSlide${num(n)}.xml`];
    const noteLines = notes ? xmlText(strFromU8(notes), 'a').filter((l) => !/^\d+$/.test(l)) : [];
    return `【第${i + 1}页】${lines.join(' / ')}${noteLines.length ? `（备注：${noteLines.join(' ')}）` : ''}`;
  });
  const text = blocks.join('\n');
  // 整份 PPT 几乎没字、却有图片：多半是把截图/海报贴成了 PPT，整份交给识图
  const hasMedia = Object.keys(files).some((n) => n.startsWith('ppt/media/'));
  if (hasMedia && visible(text) < Math.max(40, slides.length * 8)) {
    onProgress?.('图片较多，正在识图…');
    const pages = await ocr(new Blob([buf]), name);
    const t = pages.map((p, i) => (p ? `【第${i + 1}页·识图】${p}` : '')).filter(Boolean).join('\n');
    if (visible(t) > visible(text)) return { text: t, meta: `${slides.length} 页 · 识图`, ocr: true };
  }
  return { text, meta: `${slides.length} 页` };
}

async function readDocx(buf, name, onProgress) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' || /^word\/media\//.test(f.name) });
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('这个 Word 文件打不开，试试另存为 .docx 或 PDF');
  const lines = xmlText(strFromU8(xml), 'w');
  const hasMedia = Object.keys(files).some((n) => n.startsWith('word/media/'));
  if (hasMedia && visible(lines.join('')) < 40) {
    onProgress?.('图片较多，正在识图…');
    const pages = await ocr(new Blob([buf]), name);
    const t = pages.filter(Boolean).join('\n');
    if (visible(t) > visible(lines.join(''))) return { text: t, meta: `${pages.length} 页 · 识图`, ocr: true };
  }
  return { text: lines.join('\n'), meta: `${lines.length} 段` };
}

async function readXlsx(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  if (!files['xl/workbook.xml']) throw new Error('这个 Excel 文件打不开，试试在 Excel / WPS 里另存为 .xlsx');
  return readXlsxFiles(files);
}

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= import('/vendor/pdfjs/build/pdf.min.mjs').then((m) => {
  m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.min.mjs';
  return m;
}));
/** 把 PDF 的一页画成 JPEG（长边约 1800 像素，够识字，单张几百 KB） */
async function pageImage(page) {
  const v = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 1800 / Math.max(v.width, v.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  c.width = c.height = 0;
  return blob;
}
/** 这一页上的图片占了多大面积（0–1）：看绘图指令里画图片时的变换矩阵 */
async function imageCover(page, pdfjs) {
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList();
  const v = page.getViewport({ scale: 1 });
  const stack = []; let m = [1, 0, 0, 1, 0, 0]; let area = 0;
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const f = ops.fnArray[i];
    if (f === OPS.save) stack.push(m);
    else if (f === OPS.restore) m = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (f === OPS.transform) m = mul(m, ops.argsArray[i]);
    else if (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject) area += Math.abs(m[0] * m[3] - m[1] * m[2]);
  }
  return Math.min(1, area / (v.width * v.height));
}

async function readPdf(buf, name, onProgress) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/' }).promise;
  const n = Math.min(doc.numPages, 60);
  const pages = []; // { i, text, weak }
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = ''; const lines = [];
    for (const it of tc.items) { line += it.str; if (it.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; } }
    if (line.trim()) lines.push(line.trim());
    const text = lines.join(' ');
    const chars = text.replace(/\s/g, '').length;
    // 要识图的页：几乎没字（扫描件），或者字不多、大半页是图片（海报、截图、拍照页）
    let weak = chars < 40;
    if (!weak && chars < 300) weak = (await imageCover(page, pdfjs).catch(() => 0)) > 0.35;
    pages.push({ i, text, weak, page });
  }
  const todo = pages.filter((p) => p.weak).slice(0, MAX_OCR_PAGES);
  let ocrErr = null; let done = 0;
  if (todo.length) {
    onProgress?.(`正在识图 0/${todo.length} 页`);
    await pool(todo, 4, async (p) => {
      if (ocrErr) return;
      try {
        const got = (await ocr(await pageImage(p.page), `${name}-p${p.i}.jpg`)).join('\n').trim();
        if (got.replace(/\s/g, '').length > p.text.replace(/\s/g, '').length) { p.text = got.replace(/\n+/g, ' '); p.ocr = true; }
      } catch (e) { ocrErr = e; }
      onProgress?.(`正在识图 ${++done}/${todo.length} 页`);
    });
  }
  const text = pages.filter((p) => p.text.trim()).map((p) => `【第${p.i}页${p.ocr ? '·识图' : ''}】${p.text}`).join('\n');
  if (visible(text) < 20) {
    if (ocrErr) throw new Error(`这个 PDF 是扫描图片，识图没成功：${ocrErr.message}`);
    throw new Error('这个 PDF 里没有读到文字');
  }
  const nOcr = pages.filter((p) => p.ocr).length;
  return { text, meta: `${doc.numPages} 页${nOcr ? ` · ${nOcr} 页识图` : ''}`, ocr: nOcr > 0, warn: ocrErr && todo.length ? `有几页是图片，没识别成功（${ocrErr.message}），先用读到的文字` : '' };
}

/** 照片 / 截图：太大就先缩到长边 2000 像素再识 */
async function readImage(file) {
  let blob = file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k < 1 || !/jpe?g|png|webp/i.test(file.type)) {
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    }
    bmp.close?.();
  } catch { /* 解码不了就原样发，让 DeepSeek 判断 */ }
  const pages = await ocr(blob, file.name);
  return { text: pages.join('\n'), meta: '图片 · 识图', ocr: true };
}

/** 解析一个文件 → { name, kind, text, meta, chars, ocr?, warn? }；onProgress(说明) 报告识图进度 */
export async function extractFile(file, { onProgress } = {}) {
  const name = file.name || '资料';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (file.size > 60 * 1024 * 1024) throw new Error(`「${name}」太大了（超过 60MB）`);
  const buf = await file.arrayBuffer();
  let r;
  if (ext === 'pptx') r = await readPptx(buf, name, onProgress);
  else if (ext === 'docx') r = await readDocx(buf, name, onProgress);
  else if (ext === 'xlsx' || ext === 'xlsm') r = await readXlsx(buf);
  else if (ext === 'xls') r = readXls(buf);
  else if (ext === 'pdf') r = await readPdf(buf, name, onProgress);
  else if (ext === 'ppt' || ext === 'doc') {
    // 老版 Office：浏览器读不了，交给识图（DeepSeek OCR 直接认 .doc / .ppt）
    onProgress?.('老版格式，正在识图…');
    const pages = await ocr(new Blob([buf]), name).catch((e) => { throw new Error(`「${name}」是老版格式，识图没成功（${e.message}）。可以在 Office / WPS 里另存为 .${ext}x 再上传`); });
    r = { text: pages.map((p, i) => (ext === 'ppt' && p ? `【第${i + 1}页】${p}` : p)).filter(Boolean).join('\n'), meta: `${pages.length} 页 · 识图`, ocr: true };
  } else if (IMAGE_EXT.has(ext)) { onProgress?.('正在识图…'); r = await readImage(file); }
  else if (ext === 'txt' || ext === 'md' || ext === 'csv') { const text = new TextDecoder().decode(buf); r = { text, meta: '文本' }; }
  else throw new Error(`暂不支持「.${ext}」，可以上传 PPT、Word、Excel、PDF、图片或 TXT`);
  const text = r.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CHARS);
  if (!text) throw new Error(`「${name}」里没有读到文字`);
  return { name, kind: ext === 'jpeg' ? 'jpg' : ext, text, meta: r.meta, chars: [...text].length, ocr: !!r.ocr, warn: r.warn || '' };
}

/** 抓取网页链接（由服务端代抓，浏览器不能跨域） */
export async function extractUrl(url) {
  const r = await fetch('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '这个链接打不开');
  const text = String(d.text || '').slice(0, MAX_CHARS);
  return { name: d.title || url, kind: 'link', text, meta: '网页', chars: [...text].length, url };
}
