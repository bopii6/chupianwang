// 一键出片 - 轻量服务端
// 只做三件事：静态文件、AI 文案代理（密钥留在服务端）、配音。
// 渲染全部在用户浏览器里完成，不占服务器算力。
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import net from 'node:net';
import https from 'node:https';
import { handleCopyApi, scanRisks } from './lib/copylib.js';
import { handleRelay } from './lib/relay.js';
import { handleAuth, currentUser } from './lib/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const portArg = process.argv.indexOf('--port');
const PORT = Number((portArg > 0 && process.argv[portArg + 1]) || process.env.PORT || 5173);

// ---------- .env ----------
function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

// ---------- 静态文件 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};
const LONG_CACHE = 'public, max-age=31536000, immutable';
const STATIC_MOUNTS = [
  ['/vendor/mp4-muxer/', path.join(ROOT, 'node_modules/mp4-muxer/build/')],
  ['/vendor/noto-sans-sc/', path.join(ROOT, 'node_modules/@fontsource/noto-sans-sc/')],
  ['/vendor/mediapipe/', path.join(ROOT, 'node_modules/@mediapipe/tasks-vision/')],
  ['/vendor/fflate/', path.join(ROOT, 'node_modules/fflate/esm/')],
  ['/vendor/pdfjs/', path.join(ROOT, 'node_modules/pdfjs-dist/')],
  // 视频转文字（浏览器里跑）：transformers.js + onnxruntime 的 wasm + 繁转简 + 语音模型
  ['/vendor/transformers/', path.join(ROOT, 'node_modules/@huggingface/transformers/dist/')],
  ['/vendor/ort/', path.join(ROOT, 'node_modules/onnxruntime-web/dist/'), LONG_CACHE],
  ['/vendor/opencc/', path.join(ROOT, 'node_modules/opencc-js/dist/esm/')],
  ['/vendor/mp4box/', path.join(ROOT, 'node_modules/mp4box/dist/')],
  ['/models/asr/', path.join(ROOT, '.cache/models/web/'), LONG_CACHE], // 约 250MB，正式上线建议放 CDN（设 ASR_MODEL_BASE）
  ['/', path.join(ROOT, 'public/')],
];

async function serveStatic(req, res, pathname) {
  for (const [prefix, dir, cache = 'no-cache'] of STATIC_MOUNTS) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) break;
    try {
      const st = await fsp.stat(file);
      if (!st.isFile()) continue;
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache });
      fs.createReadStream(file).pipe(res);
      return true;
    } catch { /* try next mount */ }
  }
  return false;
}

// ---------- 工具 ----------
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------- 配音（开发期用 edge-tts，商用请换 Azure 语音服务） ----------
const TTS_CACHE = path.join(ROOT, '.cache', 'tts');
fs.mkdirSync(TTS_CACHE, { recursive: true });
const VOICES = new Set(['zh-CN-YunxiNeural', 'zh-CN-YunyangNeural', 'zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural']);

function runEdgeTts(text, voice, rate, out) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PYTHON || 'python', ['-m', 'edge_tts', '--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', out], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `edge-tts exit ${code}`))));
  });
}

async function handleTts(req, res) {
  const { text, voice = 'zh-CN-YunxiNeural', rate = '+8%' } = await readJson(req);
  if (!text || typeof text !== 'string' || text.length > 500) return sendJson(res, 400, { error: '文本为空或过长' });
  if (!VOICES.has(voice)) return sendJson(res, 400, { error: '不支持的音色' });
  if (!/^[+-]\d{1,2}%$/.test(rate)) return sendJson(res, 400, { error: '语速格式错误' });
  const key = crypto.createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex');
  const file = path.join(TTS_CACHE, key + '.mp3');
  if (!fs.existsSync(file)) {
    const tmp = file + '.' + process.pid + '.tmp.mp3';
    await runEdgeTts(text, voice, rate, tmp);
    await fsp.rename(tmp, file);
  }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
  fs.createReadStream(file).pipe(res);
}

// 批量配音：只启动一次 Python，并发合成，返回每句的缓存 key
const ttsKey = (voice, rate, text) => crypto.createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex');

function runBatch(job) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PYTHON || 'python', [path.join(ROOT, 'scripts', 'tts_batch.py')], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.split('\n').filter(Boolean).pop() || `配音进程退出 ${code}`))));
    p.stdin.end(JSON.stringify(job), 'utf8');
  });
}

async function handleTtsBatch(req, res) {
  const { texts, voice = 'zh-CN-YunxiNeural', rate = '+8%' } = await readJson(req);
  if (!Array.isArray(texts) || !texts.length || texts.length > 200) return sendJson(res, 400, { error: '句子数量不对' });
  if (texts.some((t) => typeof t !== 'string' || !t.trim() || t.length > 500)) return sendJson(res, 400, { error: '有句子为空或过长' });
  if (!VOICES.has(voice)) return sendJson(res, 400, { error: '不支持的音色' });
  if (!/^[+-]\d{1,2}%$/.test(rate)) return sendJson(res, 400, { error: '语速格式错误' });
  const keys = texts.map((t) => ttsKey(voice, rate, t));
  const todo = [];
  const seen = new Set();
  keys.forEach((k, i) => {
    const out = path.join(TTS_CACHE, k + '.mp3');
    if (!seen.has(k) && !fs.existsSync(out)) todo.push({ text: texts[i], out });
    seen.add(k);
  });
  if (todo.length) await runBatch({ voice, rate, items: todo });
  sendJson(res, 200, { keys, generated: todo.length });
}

async function handleTtsFile(res, key) {
  const file = path.join(TTS_CACHE, key + '.mp3');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  fs.createReadStream(file).pipe(res);
}

// ---------- 网页链接抓取（公众号文章、官网页面等公开网页） ----------
// 安全：只允许 http/https 公网地址。连接时在 DNS 解析这一步检查 IP（防止借服务器访问内网，也防 DNS 重绑定）；
// 手动跟随跳转、每一跳都重新检查；限时 10 秒、最多读 3MB。
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('64:ff9b');
}
function safeLookup(host, opts, cb) {
  dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(new Error('这个网址找不到'));
    if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) return cb(new Error('不支持这个地址'));
    if (opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
function getPage(u) {
  return new Promise((resolve, reject) => {
    // 直接写 IP 的链接不经过 DNS，单独检查
    const bare = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(bare) && isPrivateIp(bare)) return reject(new Error('不支持这个地址'));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, {
      lookup: safeLookup,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'text/html,text/plain;q=0.9', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      timeout: 10000,
    }, (r) => {
      const chunks = []; let size = 0; let settled = false;
      r.on('data', (c) => { size += c.length; if (size > 3e6) { r.destroy(); return; } chunks.push(c); });
      const done = () => { if (settled) return; settled = true; resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }); };
      r.on('end', done); r.on('close', done);
      r.on('error', () => done());
    });
    req.on('timeout', () => req.destroy(new Error('网页打开超时')));
    req.on('error', reject);
  });
}
function decodeHtml(buf, type) {
  let cs = (type.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) cs = (buf.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return buf.toString('utf8'); }
}
function htmlToText(html) {
  const pick = (re) => (html.match(re) || [])[1];
  const ent = (t) => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
  const title = ent(pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || pick(/<title[^>]*>([\s\S]*?)<\/title>/i) || '').trim();
  // 公众号正文在 #js_content；其它网站取 article / main / body
  let body = pick(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<script/i) || pick(/<article[^>]*>([\s\S]*?)<\/article>/i) || pick(/<main[^>]*>([\s\S]*?)<\/main>/i) || pick(/<body[^>]*>([\s\S]*?)<\/body>/i) || html;
  body = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|select|button)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|section|tr|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const text = ent(body).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1).join('\n');
  return { title: title.replace(/\s+/g, ' ').slice(0, 60), text };
}
async function handleFetchUrl(req, res) {
  const { url } = await readJson(req);
  let current = String(url || '').trim();
  if (!/^https?:\/\//i.test(current) && /^[\w-]+(\.[\w-]+)+/.test(current)) current = 'https://' + current;
  try {
    for (let hop = 0; hop < 5; hop++) {
      let u;
      try { u = new URL(current); } catch { throw new Error('链接格式不对'); }
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('只支持 http / https 网页链接');
      if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('不支持这个地址');
      const r = await getPage(u);
      if (r.status >= 300 && r.status < 400 && r.headers.location) { current = new URL(r.headers.location, u).href; continue; }
      if (r.status >= 400) return sendJson(res, 400, { error: `网页打不开（${r.status}），如果需要登录才能看，请导出成 Word/PDF 上传` });
      const type = String(r.headers['content-type'] || '');
      if (/pdf|officedocument|msword|powerpoint/.test(type)) return sendJson(res, 400, { error: '这个链接是文件，请下载后直接上传' });
      if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return sendJson(res, 400, { error: '这个链接不是网页' });
      const html = decodeHtml(r.body, type);
      const { title, text } = type.includes('text/plain') ? { title: '', text: html } : htmlToText(html);
      if (text.replace(/\s/g, '').length < 50) return sendJson(res, 400, { error: '没读到正文。飞书/腾讯文档请先设为“公开可见”，或导出成 Word/PDF 上传' });
      return sendJson(res, 200, { title: title || u.hostname, text: text.slice(0, 30000) });
    }
    return sendJson(res, 400, { error: '跳转次数太多' });
  } catch (e) {
    return sendJson(res, 400, { error: String(e.message || e) });
  }
}

// ---------- 正版素材搜索（Pexels：免费、可商用） ----------
// 密钥只在服务端；图片本身由浏览器直接从 Pexels CDN 加载（对方允许跨域），不占服务器带宽。
// 同一个关键词的结果缓存 7 天：所有客户共用，省接口次数（免费额度 200 次/小时）。
const STOCK_CACHE = path.join(ROOT, '.cache', 'stock');
fs.mkdirSync(STOCK_CACHE, { recursive: true });
async function handleStock(req, res, query) {
  const q = String(query.get('q') || '').trim().slice(0, 80);
  if (!q) return sendJson(res, 400, { error: '缺少关键词' });
  if (!process.env.PEXELS_API_KEY) loadEnv(); // 填了密钥不用重启
  const key = process.env.PEXELS_API_KEY;
  if (!key) return sendJson(res, 400, { error: '服务端还没有配置 PEXELS_API_KEY（在项目根目录的 .env 文件里填写）', code: 'no-key' });
  const file = path.join(STOCK_CACHE, crypto.createHash('sha1').update(q.toLowerCase()).digest('hex') + '.json');
  try {
    const st = await fsp.stat(file);
    if (Date.now() - st.mtimeMs < 7 * 864e5) return sendJson(res, 200, JSON.parse(await fsp.readFile(file, 'utf8')));
  } catch { /* 没缓存 */ }
  const u = new URL('https://api.pexels.com/v1/search');
  u.search = new URLSearchParams({ query: q, orientation: 'landscape', per_page: '15', size: 'medium' }).toString();
  const r = await fetch(u, { headers: { Authorization: key } });
  if (!r.ok) return sendJson(res, 502, { error: r.status === 429 ? '素材库这会儿太忙，稍后再试' : `素材库返回错误 ${r.status}` });
  const d = await r.json();
  const out = {
    q,
    photos: (d.photos || []).map((p) => ({
      id: p.id, w: p.width, h: p.height, alt: p.alt || '', color: p.avg_color || '#333',
      src: `${p.src.original}?auto=compress&cs=tinysrgb&w=1600`, thumb: p.src.medium,
      by: p.photographer, page: p.url,
    })),
  };
  await fsp.writeFile(file, JSON.stringify(out));
  sendJson(res, 200, out);
}

// ---------- AI 文案（DeepSeek） ----------
async function deepseek(messages, { temperature = 0.7, max_tokens = 8000 } = {}) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages, response_format: { type: 'json_object' }, temperature, max_tokens }),
  });
  if (!r.ok) throw Object.assign(new Error(`DeepSeek 返回错误 ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: 502 });
  const content = (await r.json()).choices[0].message.content;
  try { return { data: JSON.parse(content), content }; } catch { throw Object.assign(new Error('AI 返回的内容不是合法 JSON，请重试'), { status: 502 }); }
}

// ---------- 复刻对标视频 ----------
// 第一步：拆出原视频为什么火、它的打法，推荐用哪个形式来做
async function handleRemixPlan(req, res) {
  const { reference = '', forms = [] } = await readJson(req);
  if (!process.env.DEEPSEEK_API_KEY) return sendJson(res, 400, { error: '服务端还没有配置 DEEPSEEK_API_KEY' });
  const ref = String(reference).trim().slice(0, 12000);
  if (ref.replace(/\s/g, '').length < 20) return sendJson(res, 400, { error: '视频里的话太少了，复刻不了' });
  const list = (Array.isArray(forms) ? forms : []).slice(0, 20)
    .map((f) => ({ id: String(f?.id || '').replace(/[^a-z0-9-]/g, ''), name: String(f?.name || '').slice(0, 20), fit: String(f?.fit || '').slice(0, 80) }))
    .filter((f) => f.id && fs.existsSync(path.join(ROOT, 'prompts', f.id + '.md')));
  if (!list.length) return sendJson(res, 400, { error: '没有可用的形式' });
  const system = (await fsp.readFile(path.join(ROOT, 'prompts', 'remix-plan.md'), 'utf8'))
    .replace('{{FORMS}}', list.map((f) => `- ${f.id}：${f.name}（${f.fit}）`).join('\n'));
  const { data } = await deepseek([{ role: 'system', content: system }, { role: 'user', content: `原视频口播文字稿：\n${ref}` }], { temperature: 0.3, max_tokens: 1200 });
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  sendJson(res, 200, {
    topic: s(data.topic, 30), why: s(data.why, 80), hook: s(data.hook, 30), cta: s(data.cta, 40),
    moves: (Array.isArray(data.moves) ? data.moves : []).map((m) => s(m, 40)).filter(Boolean).slice(0, 5),
    form: list.some((f) => f.id === data.form) ? data.form : list[0].id, formWhy: s(data.formWhy, 60),
  });
}

// 改写后检查：和原文连续 8 个字以上相同的句子（照抄），以及违禁词
const plain = (s) => String(s).replace(/[^\p{L}\p{N}]/gu, '');
function copiedPhrases(out, ref, n = 8) {
  const R = plain(ref); const O = plain(out);
  const grams = new Set();
  for (let i = 0; i + n <= R.length; i++) grams.add(R.slice(i, i + n));
  const hits = [];
  for (let i = 0; i + n <= O.length;) {
    if (!grams.has(O.slice(i, i + n))) { i++; continue; }
    let j = i + n;
    while (j < O.length && R.includes(O.slice(i, j + 1))) j++;
    hits.push(O.slice(i, j)); i = j;
  }
  return [...new Set(hits)];
}
const allText = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(allText).join('\n') : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => !/^(src|icon|scene|type|skin|id)$/.test(k)).map(([, x]) => allText(x)).join('\n') : '');

async function handleScript(req, res) {
  const { form, input, minutes = 2, account = '', materials = [], reference = '', plan = null, industry = '' } = await readJson(req);
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return sendJson(res, 400, { error: '服务端还没有配置 DEEPSEEK_API_KEY（在项目根目录的 .env 文件里填写）' });
  const promptFile = path.join(ROOT, 'prompts', `${String(form).replace(/[^a-z0-9-]/g, '')}.md`);
  if (!fs.existsSync(promptFile)) return sendJson(res, 400, { error: '未知的形式' });
  const system = await fsp.readFile(promptFile, 'utf8');
  const perMin = form === 'series-intro' || form === 'deep-dive' ? 14 : form === 'pixel-story' ? 9 : form === 'photo-talk' ? 6 : 4.5; // 像素小剧场是短镜头，段数更多
  const sections = Math.max(4, Math.min(30, Math.round(Number(minutes) * perMin)));
  // 客户上传的资料（PPT / Word / PDF / 网页提取出的文字），总量控制在约 24000 字
  let budget = 24000;
  const docs = (Array.isArray(materials) ? materials : []).slice(0, 6).map((m, i) => {
    const t = String(m?.text || '').slice(0, Math.max(0, budget)); budget -= t.length;
    return t ? `===== 资料${i + 1}：${String(m?.name || '').slice(0, 60)} =====\n${t}` : '';
  }).filter(Boolean);
  const say = String(input || '').trim().slice(0, 8000);
  const materialRule = docs.length ? `\n\n【客户上传了自己的资料】
- 先通读资料，挑出最能打动家长/学员、最适合做成短视频的 1 个主题和 3–6 个要点，不要把资料从头到尾复述一遍。
- 资料里白纸黑字写明的数字、案例、课程名、机构名可以直接用；资料里没有的数字一律不许编。
- 资料是 PPT 时，“【第N页】”只是页码标记，不要念出来；备注里通常是讲师的讲解思路，可以参考。
- 口播要说人话：把书面语、标题腔改写成老师面对面聊天的口吻。
- ${say ? '客户另外说的话代表他这次最想讲的重点，优先满足。' : '客户没有额外说明，由你根据资料决定讲什么。'}` : '';
  // 复刻对标视频：照原视频的打法写，内容换成客户的行业，不许照抄
  const ref = String(reference || '').trim().slice(0, 12000);
  const trade = String(industry || '').trim().slice(0, 60);
  const p = plan && typeof plan === 'object' ? plan : null;
  const remixRule = ref ? `\n\n【复刻一条已经火过的视频】
客户上传了一条火过的短视频，下面附了它的口播文字稿（自动转写，可能有错别字）。复刻它的爆款逻辑，做一条客户自己行业的视频。
客户的行业：${trade || '（没写，按客户说的话判断）'}
${p ? `原视频为什么火：${String(p.why || '').slice(0, 80)}
它的打法（按顺序）：${(Array.isArray(p.moves) ? p.moves : []).map((m) => String(m).slice(0, 40)).join(' → ')}
开头手法：${String(p.hook || '').slice(0, 30)}；结尾引导：${String(p.cta || '').slice(0, 40)}\n` : ''}- 照着原视频的打法写：开头用同样的钩子手法，段落顺序和每段的作用保持一致，结尾用同类的互动引导。
- 内容全部换成客户的行业：痛点、例子、术语、场景，都必须是这个行业里真实存在的。
- 不许照抄原文：连续 8 个字以上和原文相同就算照抄。原视频里的人名、机构名、账号名、具体数字、案例一律不用。
- 客户没提供的数字（提分多少、学员多少、通过率、收入等）一律不编，用不带具体数字的说法。
- 原视频里的违规说法（保证效果、绝对化用语、引导加微信等）不要学，换成合规的说法。
- 篇幅以上面的目标时长为准，不用和原视频一样长。

===== 原视频口播文字稿 =====
${ref}` : '';
  const sayLine = ref ? [trade && `我是做${trade}的。`, say].filter(Boolean).join('\n') : say;
  const user = `目标时长：约 ${minutes} 分钟（约 ${sections} 段，口播总字数约 ${Math.round(minutes * (form === 'pixel-story' ? 220 : 250))} 字）\n账号名：${account || '（未填写）'}\n\n客户说的话：\n${sayLine || (ref ? '（没写，照原视频的打法来）' : '（没写，按资料来）')}${materialRule}${docs.length ? `\n\n${docs.join('\n\n')}` : ''}${remixRule}`;

  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  try {
    let { data, content } = await deepseek(messages, { temperature: 0.8 });
    if (ref) {
      // 自动检查一遍：照抄原文、违法用语，有问题就带着问题让 AI 重写一次
      const check = (d) => {
        const text = allText(d);
        return { copied: copiedPhrases(text, ref).slice(0, 8), illegal: scanRisks(text).filter((x) => x.level === '违法').slice(0, 6) };
      };
      let c = check(data);
      if (c.copied.length || c.illegal.length) {
        const fb = [
          c.copied.length && `这些地方和原视频一模一样，属于照抄：${c.copied.map((x) => `「${x}」`).join('、')}。全部换成你自己的说法。`,
          c.illegal.length && `这些说法违反广告法：${c.illegal.map((x) => `「${x.word}」（${x.reason}）`).join('、')}。改成合规的说法。`,
        ].filter(Boolean).join('\n');
        const again = await deepseek([...messages, { role: 'assistant', content }, { role: 'user', content: `${fb}\n其它保持不变，重新输出完整 JSON。` }], { temperature: 0.7 });
        if (check(again.data).copied.length <= c.copied.length) data = again.data;
      }
    }
    sendJson(res, 200, data);
  } catch (e) {
    sendJson(res, e.status || 500, { error: String(e.message || e) });
  }
}

// ---------- 路由 ----------
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  // 跨源隔离：浏览器里转文字要用多线程（SharedArrayBuffer）。用 credentialless，外站图片（Pexels）照常能加载
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  try {
    if (req.method === 'POST' && pathname === '/api/tts') return await handleTts(req, res);
    if (req.method === 'POST' && pathname === '/api/tts-batch') return await handleTtsBatch(req, res);
    const tf = pathname.match(/^\/api\/tts-file\/([0-9a-f]{40})\.mp3$/);
    if (req.method === 'GET' && tf) return await handleTtsFile(res, tf[1]);
    if (pathname.startsWith('/api/auth/')) return await handleAuth(req, res, pathname, { readJson, sendJson }); // 邮箱验证码登录
    // 写文案要登录（用到 AI 额度）
    if (req.method === 'POST' && (pathname === '/api/script' || pathname === '/api/remix-plan') && !(await currentUser(req))) return sendJson(res, 401, { error: '先登录一下，新用户免费试做 3 条', code: 'login' });
    if (req.method === 'POST' && pathname === '/api/script') return await handleScript(req, res);
    if (req.method === 'POST' && pathname === '/api/remix-plan') return await handleRemixPlan(req, res);
    if (pathname === '/api/qr' || pathname.startsWith('/api/relay')) return await handleRelay(req, res, pathname, new URL(req.url, 'http://x').searchParams, { readJson, sendJson }); // 手机扫码上传
    if (req.method === 'POST' && pathname === '/api/fetch-url') return await handleFetchUrl(req, res);
    if (pathname.startsWith('/api/copy/')) return await handleCopyApi(req, res, pathname, { readJson, sendJson }); // 文案库（内部工具）
    if (req.method === 'GET' && pathname === '/api/stock') return await handleStock(req, res, new URL(req.url, 'http://x').searchParams);
    if (req.method === 'POST' && pathname === '/api/debug-frame' && process.env.NODE_ENV !== 'production') {
      // 开发调试：把浏览器里渲染的某一帧存成图片
      const { name, data } = await readJson(req);
      const dir = path.join(ROOT, '.cache', 'frames');
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, String(name).replace(/[^\w.-]/g, '') + '.png'), Buffer.from(String(data).split(',')[1], 'base64'));
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/debug-file' && process.env.NODE_ENV !== 'production') {
      const dir = path.join(ROOT, '.cache', 'frames');
      await fsp.mkdir(dir, { recursive: true });
      const out = fs.createWriteStream(path.join(dir, 'export.mp4'));
      req.pipe(out);
      return out.on('finish', () => sendJson(res, 200, { ok: true }));
    }
    if (req.method === 'GET' && pathname === '/api/status') { if (!process.env.PEXELS_API_KEY) loadEnv(); return sendJson(res, 200, { ai: !!process.env.DEEPSEEK_API_KEY, stock: !!process.env.PEXELS_API_KEY, asrBase: process.env.ASR_MODEL_BASE || '/models/asr/', asrModel: process.env.ASR_MODEL || 'whisper-base' }); }
    if (req.method === 'GET' && (await serveStatic(req, res, pathname))) return;
    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`一键出片 已启动: http://localhost:${PORT}`));
