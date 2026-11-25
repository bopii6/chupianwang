// 识图取字：扫描件 PDF、图片、老版 .doc/.ppt 里的字，交给 DeepSeek 官方的 OCR 接口（2026-11-13 上线）
// 文档：https://api-docs.deepseek.com/guides/ocr/
// - 用的是和写文案同一把 DeepSeek 密钥，按页收费：每 1000 页 0.225 美元（一份 30 页的扫描件不到 5 分钱人民币）
// - 失败、超时的不收费；接口一次最长 180 秒，所以浏览器那边是“一页一张图”地并发送过来，不整本扔
// - 浏览器把文件原样发过来（请求体就是文件本身，文件名放在 X-File-Name 头里），这里转成 multipart 发给 DeepSeek

const OCR_URL = 'https://api.deepseek.com/v1/tools/ocr';
const MAX_BYTES = 60 * 1024 * 1024;

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > max) { failed = true; reject(Object.assign(new Error('文件太大了（超过 60MB）'), { status: 413 })); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

/** 模型原样输出里偶尔带 <｜ref｜> 这种标记、多余空行，清一下 */
export function cleanOcrText(s) {
  return String(s || '')
    .replace(/<｜[^｜]*｜>/g, '')
    .replace(/\[\[[\d.,\s]+\]\]/g, '')
    .replace(/<\/?(table|thead|tbody|tr)[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
    .replace(/<\/?t[dh][^>]*>/gi, '')
    .replace(/<[^>]{1,20}>/g, '')
    .replace(/^#{1,6}\s+/gm, '') // 标题的 ## 记号
    .replace(/\*\*([^*\n]+)\*\*/g, '$1') // **加粗**
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const WHY = {
  400: '这个文件识别不了（可能加了密码，或者格式不对）',
  401: 'DeepSeek 不认这个密钥（可能填错了或被删了），去设置里换一把',
  402: 'DeepSeek 账户余额不足，充值后再来',
  408: '文件传得太慢，检查一下网络再试',
  413: '文件太大了，DeepSeek 一次最多收 100MB',
  429: '识图的人太多了，等几秒再试',
  504: '这份资料太长，识别超时了，拆小一点再传',
};

/** 把一份文件交给 DeepSeek 识字 → { pages: [每页文字], pageCount } */
export async function ocrBuffer(buf, name, key, { timeoutMs = 190000 } = {}) {
  if (!key) throw Object.assign(new Error('还没填 AI 密钥，扫描件和图片读不了。点右上角账号 →「我的设置」，把 DeepSeek 的密钥填进去'), { status: 400, code: 'no-key' });
  const fd = new FormData();
  fd.append('purpose', 'text_recognition');
  fd.append('file', new Blob([buf]), String(name || 'file').replace(/[\r\n"]/g, '').slice(0, 120) || 'file');
  let r;
  try {
    r = await fetch(OCR_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw Object.assign(new Error(e?.name === 'TimeoutError' ? WHY[504] : '连不上 DeepSeek，检查一下网络再试'), { status: 502 });
  }
  const raw = await r.text();
  let data = null;
  try { data = JSON.parse(raw.trim()); } catch { /* 下面按状态码说 */ }
  if (!r.ok || !data || data.error) {
    const st = r.ok ? 502 : r.status;
    const msg = WHY[st] || (data?.error?.message ? `识图失败：${String(data.error.message).slice(0, 120)}` : `识图失败（${st}）`);
    throw Object.assign(new Error(msg), { status: st === 401 || st === 402 ? 400 : 502, ...(st === 401 ? { code: 'no-key' } : {}) });
  }
  const pages = (Array.isArray(data.pages) ? data.pages : []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((p) => cleanOcrText(p.text));
  return { pages, pageCount: Number(data.page_count) || pages.length };
}

export async function handleOcr(req, res, { key, sendJson, who = '' }) {
  try {
    const buf = await readRaw(req, MAX_BYTES);
    if (!buf.length) return sendJson(res, 400, { error: '没收到文件' });
    let name = 'file';
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || 'file')); } catch { /* 用默认名 */ }
    const t = Date.now();
    const out = await ocrBuffer(buf, name, key);
    console.log(`[识图]${who ? ` ${who}` : ''} ${name} ${(buf.length / 1024).toFixed(0)}KB → ${out.pageCount} 页 ${out.pages.join('').length} 字 ${((Date.now() - t) / 1000).toFixed(1)}s`);
    sendJson(res, 200, out);
  } catch (e) {
    sendJson(res, e.status || 500, { error: String(e.message || e), ...(e.code ? { code: e.code } : {}) });
  }
}
