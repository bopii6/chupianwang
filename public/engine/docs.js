// 资料解析：把客户手上的 PPT / Word / PDF / 文本 / 网页链接，变成 AI 能读的文字。
// 文件在浏览器里解析，原文件不上传服务器；只有提取出来的文字会发给 AI 写脚本。
import { unzipSync, strFromU8 } from '/vendor/fflate/browser.js';

export const ACCEPT = '.pptx,.docx,.pdf,.txt,.md';
const MAX_CHARS = 30000;

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

async function readPptx(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^ppt\/(slides|notesSlides)\/\w+\.xml$/.test(f.name) });
  const num = (n) => Number((n.match(/(\d+)\.xml$/) || [])[1] || 0);
  const slides = Object.keys(files).filter((n) => n.startsWith('ppt/slides/')).sort((a, b) => num(a) - num(b));
  const blocks = slides.map((n, i) => {
    const lines = xmlText(strFromU8(files[n]), 'a');
    const notes = files[`ppt/notesSlides/notesSlide${num(n)}.xml`];
    const noteLines = notes ? xmlText(strFromU8(notes), 'a').filter((l) => !/^\d+$/.test(l)) : [];
    return `【第${i + 1}页】${lines.join(' / ')}${noteLines.length ? `（备注：${noteLines.join(' ')}）` : ''}`;
  });
  return { text: blocks.join('\n'), meta: `${slides.length} 页` };
}

async function readDocx(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' });
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('这个 Word 文件打不开，试试另存为 .docx 或 PDF');
  const lines = xmlText(strFromU8(xml), 'w');
  return { text: lines.join('\n'), meta: `${lines.length} 段` };
}

let pdfjsPromise = null;
async function readPdf(buf) {
  if (!pdfjsPromise) {
    pdfjsPromise = import('/vendor/pdfjs/build/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.min.mjs';
      return m;
    });
  }
  const pdfjs = await pdfjsPromise;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/' }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = ''; const lines = [];
    for (const it of tc.items) { line += it.str; if (it.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; } }
    if (line.trim()) lines.push(line.trim());
    if (lines.length) pages.push(`【第${i}页】${lines.join(' ')}`);
  }
  const text = pages.join('\n');
  if (text.replace(/\s/g, '').length < 20) throw new Error('这个 PDF 里没有可读的文字（可能是扫描图片），换成 Word 或 PPT 试试');
  return { text, meta: `${doc.numPages} 页` };
}

/** 解析一个文件 → { name, kind, text, meta, chars } */
export async function extractFile(file) {
  const name = file.name || '资料';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'ppt' || ext === 'doc') throw new Error(`「${name}」是旧版格式，请在 Office / WPS 里另存为 .${ext}x 再上传`);
  if (file.size > 60 * 1024 * 1024) throw new Error(`「${name}」太大了（超过 60MB）`);
  const buf = await file.arrayBuffer();
  let r;
  if (ext === 'pptx') r = await readPptx(buf);
  else if (ext === 'docx') r = await readDocx(buf);
  else if (ext === 'pdf') r = await readPdf(buf);
  else if (ext === 'txt' || ext === 'md') { const text = new TextDecoder().decode(buf); r = { text, meta: '文本' }; }
  else throw new Error(`暂不支持「.${ext}」，可以上传 PPT、Word、PDF 或 TXT`);
  const text = r.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CHARS);
  if (!text) throw new Error(`「${name}」里没有读到文字`);
  return { name, kind: ext, text, meta: r.meta, chars: [...text].length };
}

/** 抓取网页链接（由服务端代抓，浏览器不能跨域） */
export async function extractUrl(url) {
  const r = await fetch('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '这个链接打不开');
  const text = String(d.text || '').slice(0, MAX_CHARS);
  return { name: d.title || url, kind: 'link', text, meta: '网页', chars: [...text].length, url };
}
