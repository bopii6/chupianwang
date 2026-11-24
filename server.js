// 出片王 - 轻量服务端
// 只做三件事：静态文件、AI 文案代理（密钥留在服务端）、配音。
// 渲染全部在用户浏览器里完成，不占服务器算力。
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import net from 'node:net';
import https from 'node:https';
import { handleCopyApi, scanRisks } from './lib/copylib.js';
import { handleRelay } from './lib/relay.js';
import { handleAuth, currentUser, requireUser, isAdminUser, noteGeneration } from './lib/auth.js';
import { bootstrapAdmin, readUser as readAccount, userDir as accountDir } from './lib/accounts.js';
import { handleWorks, serveWorkFile } from './lib/works.js';
import { handleJobs } from './lib/jobs.js';
import { handleMcp } from './lib/mcp.js';
import { handleSettings, deepseekKeyOf, pexelsKeyOf } from './lib/settings.js';
import { APP_ROOT, ENV_FILE, LOG_FILE, WORKS_DIR, CACHE_DIR, MODELS_DIR } from './lib/paths.js';

const ROOT = APP_ROOT; // 程序文件（只读）；客户数据的位置见 lib/paths.js
const WORKS = WORKS_DIR; // 作品墙：导出的成片存这里
fs.mkdirSync(WORKS, { recursive: true });
const portArg = process.argv.indexOf('--port');
const PORT = Number((portArg > 0 && process.argv[portArg + 1]) || process.env.PORT || 5173);

// 版本号：页面右下角显示，诊断信息里也带上，客户报问题时一眼知道是哪一版
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const COMMIT = (() => { try { return spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim(); } catch { return ''; } })();
const STARTED = new Date();

// ---------- .env ----------
// 启动时就在环境变量里的（比如测试明确设成空）以它为准；从 .env 读来的，.env 改了再读会更新（填了密钥不用重启）
const FROM_ENV_FILE = new Set();
function loadEnv() {
  const f = ENV_FILE;
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || (m[1] in process.env && !FROM_ENV_FILE.has(m[1]))) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    FROM_ENV_FILE.add(m[1]);
  }
}
loadEnv();

// 默认只听本机：同一个 WiFi 里的其他电脑、手机都连不上。真要局域网用（比如手机扫码上传），在 .env 里设 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_ONLY = ['127.0.0.1', 'localhost', '::1'].includes(HOST);

// 公网部署（比如 getcut.cn 架在服务器上，Caddy/Nginx 反代到本机端口）：
// 在 .env 里写 PUBLIC_BASE_URL=https://getcut.cn，服务仍然只听 127.0.0.1，但允许这个域名的请求进来。
// 还有别名域名（比如 www.getcut.cn）就写 PUBLIC_EXTRA_HOSTS=www.getcut.cn，逗号分隔。
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const PUBLIC_HOST = (() => { try { return PUBLIC_BASE_URL ? new URL(PUBLIC_BASE_URL).host.toLowerCase() : ''; } catch { return ''; } })();
const PUBLIC_EXTRA_HOSTS = (process.env.PUBLIC_EXTRA_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
function isPublicHost(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  return !!PUBLIC_HOST && (h === PUBLIC_HOST || PUBLIC_EXTRA_HOSTS.includes(h));
}

// 公网版（getcut.cn 这种）：账号密码登录 + 每个客户自己的密钥 + 各自的作品/文案库
// 本地版（装在客户自己电脑上）：完全不启用，行为跟以前一模一样
const HOSTED = !!PUBLIC_BASE_URL || process.env.AUTH_REQUIRED === '1';
/** 某个账号的目录（作品、文案库、上传） */
const ownerDir = (id, sub) => (sub ? path.join(accountDir(id), sub) : accountDir(id));
function worksDirOf(user) { return HOSTED && user ? ownerDir(user.id, 'works') : WORKS; }
fs.mkdirSync(WORKS, { recursive: true });

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
  ['/vendor/encode-aac/', path.join(ROOT, 'node_modules/@audio/encode-aac/')],
  ['/vendor/noto-sans-sc/', path.join(ROOT, 'node_modules/@fontsource/noto-sans-sc/')],
  ['/vendor/mediapipe/', path.join(ROOT, 'node_modules/@mediapipe/tasks-vision/')],
  ['/vendor/fflate/', path.join(ROOT, 'node_modules/fflate/esm/')],
  ['/vendor/pdfjs/', path.join(ROOT, 'node_modules/pdfjs-dist/')],
  // 视频转文字（浏览器里跑）：transformers.js + onnxruntime 的 wasm + 繁转简 + 语音模型
  ['/vendor/transformers/', path.join(ROOT, 'node_modules/@huggingface/transformers/dist/')],
  ['/vendor/ort/', path.join(ROOT, 'node_modules/onnxruntime-web/dist/'), LONG_CACHE],
  ['/vendor/opencc/', path.join(ROOT, 'node_modules/opencc-js/dist/esm/')],
  ['/vendor/mp4box/', path.join(ROOT, 'node_modules/mp4box/dist/')],
  ['/fonts/', path.join(ROOT, 'public/fonts/'), LONG_CACHE], // 像素字体分片，一年缓存（首页不再加载，出片时才按需拉）
  ['/models/asr/', MODELS_DIR + path.sep, LONG_CACHE], // 听写模型，正式上线建议放 CDN（服务端设 ASR_MODEL_BASE）
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
const TTS_CACHE = path.join(CACHE_DIR, 'tts');
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
const STOCK_CACHE = path.join(CACHE_DIR, 'stock');
fs.mkdirSync(STOCK_CACHE, { recursive: true });
async function handleStock(req, res, query, keyOverride = '') {
  const q = String(query.get('q') || '').trim().slice(0, 80);
  if (!q) return sendJson(res, 400, { error: '缺少关键词' });
  if (!process.env.PEXELS_API_KEY) loadEnv(); // 填了密钥不用重启
  const key = keyOverride || process.env.PEXELS_API_KEY;
  if (!key) return sendJson(res, 400, { error: '还没填实拍图素材库的密钥。点页面右下角的「出片王」版本号 →「去填」→ 展开「实拍图」那一栏', code: 'no-key' });
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
// key：公网版传客户自己的密钥；本地版不传，用 .env 里的
async function deepseek(messages, { temperature = 0.7, max_tokens = 8000, key = '', who = '' } = {}) {
  const auth = key || process.env.DEEPSEEK_API_KEY;
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages, response_format: { type: 'json_object' }, temperature, max_tokens }),
  });
  if (!r.ok) throw Object.assign(new Error(`DeepSeek 返回错误 ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: 502 });
  const j = await r.json();
  const content = j.choices[0].message.content;
  // 用量记一笔：输入多少（其中多少命中缓存，缓存部分便宜约 10 倍）、输出多少
  if (j.usage) console.log(`[AI 用量]${who ? ` ${who}` : ''} 输入 ${j.usage.prompt_tokens}（命中缓存 ${j.usage.prompt_cache_hit_tokens ?? 0}）输出 ${j.usage.completion_tokens}`);
  try { return { data: JSON.parse(content), content }; } catch { throw Object.assign(new Error('AI 返回的内容不是合法 JSON，请重试'), { status: 502 }); }
}

// ---------- 复刻对标视频 ----------
// 第一步：拆出原视频为什么火、它的打法，推荐用哪个形式来做
async function handleRemixPlan(req, res, key = '', who = '') {
  const { reference = '', forms = [] } = await readJson(req);
  if (!key) return sendJson(res, 400, { error: '还没填 AI 密钥。点右上角账号 →「我的设置」，把 DeepSeek 的密钥填进去', code: 'no-key' });
  const ref = String(reference).trim().slice(0, 12000);
  if (ref.replace(/\s/g, '').length < 20) return sendJson(res, 400, { error: '视频里的话太少了，复刻不了' });
  const list = (Array.isArray(forms) ? forms : []).slice(0, 20)
    .map((f) => ({ id: String(f?.id || '').replace(/[^a-z0-9-]/g, ''), name: String(f?.name || '').slice(0, 20), fit: String(f?.fit || '').slice(0, 80) }))
    .filter((f) => f.id && fs.existsSync(path.join(ROOT, 'prompts', f.id + '.md')));
  if (!list.length) return sendJson(res, 400, { error: '没有可用的形式' });
  const system = (await fsp.readFile(path.join(ROOT, 'prompts', 'remix-plan.md'), 'utf8'))
    .replace('{{FORMS}}', list.map((f) => `- ${f.id}：${f.name}（${f.fit}）`).join('\n'));
  const { data } = await deepseek([{ role: 'system', content: system }, { role: 'user', content: `原视频口播文字稿：\n${ref}` }], { temperature: 0.3, max_tokens: 1200, key, who });
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

// AI 编出来的东西：占位词（XX驾校）、客户没给过的人数/比例/价格/年龄/教龄、服务承诺、头衔。
// source 是客户自己给的文字（输入 + 资料 + 行业 + 账号名），里面出现过的不算编
const NUM = '[0-9０-９]+(?:\\.[0-9]+)?|[一二两三四五六七八九十百千万]+';
const BIG = '[0-9０-９]+(?:\\.[0-9]+)?|[一二两三四五六七八九]?[十百千万][一二两三四五六七八九十百千万]*'; // 不含单独的“一/两”，免得把“一个人”“一块”当成数字
const FAB_RULES = [
  { re: /[XxＸｘ×]{2,}[一-龥]{0,2}|某某[一-龥]{0,2}|此处填[一-龥]*/g, why: '占位词，换成你自己的名字或“我们”', always: true },
  { re: new RegExp(`(?:${BIG})\\s*(?:多|余)?\\s*(?:个|位|名)?(?:学员|学生|孩子|家长|客户|粉丝|人)`, 'g'), why: '人数你没提供过' },
  { re: new RegExp(`(?:${NUM})\\s*(?:多)?(?:年教龄|年经验|年的经验|年老教师)`, 'g'), why: '教龄你没提供过' },
  { re: /[0-9０-９]+(?:\.[0-9]+)?\s*[%％]|百分之[一二三四五六七八九十百]+/g, why: '比例数字你没提供过' },
  { re: new RegExp(`(?:${NUM})\\s*(?:到|至|-|~)\\s*(?:${NUM})\\s*岁|(?:${NUM})\\s*岁(?:以上|以下|起|就能|就可以)`, 'g'), why: '适合年龄你没提供过' },
  { re: new RegExp(`(?:${BIG})\\s*(?:元|块钱|块)`, 'g'), why: '价格你没提供过' },
  { re: /免费[一-龥]{1,2}|赠送[一-龥]{0,2}|名额|限[0-9一二两三四五六七八九十]+[人名位个]|退款|退费|一对一|随到随学|答疑到[一-龥]{0,2}|包(?:过|拿证|就业|分配|满意)/g, why: '这项服务你没说过有' },
  { re: /金牌[一-龥]{0,3}|名师|国家级|冠军|获奖|十佳|特级教师/g, why: '头衔/荣誉你没提供过' },
];
function fabricated(text, source) {
  const src = plain(source); const out = []; const seen = new Set();
  for (const r of FAB_RULES) {
    r.re.lastIndex = 0;
    for (const m of String(text).matchAll(r.re)) {
      const w = m[0].trim(); if (!w || seen.has(w)) continue;
      if (!r.always && src.includes(plain(w))) continue;
      seen.add(w);
      const dup = out.findIndex((x) => x.word.includes(w) || w.includes(x.word)); // 互相包含的只留长的那条
      if (dup < 0) out.push({ word: w, why: r.why }); else if (w.length > out[dup].word.length) out[dup] = { word: w, why: r.why };
    }
  }
  return out;
}

async function handleScript(req, res, { key = '', acct = null } = {}) {
  const { form, input, minutes = 2, account = '', materials = [], reference = '', plan = null, industry = '' } = await readJson(req);
  if (!key) return sendJson(res, 400, { error: '还没填 AI 密钥。点右上角账号 →「我的设置」，把 DeepSeek 的密钥填进去', code: 'no-key' });
  const who = acct ? acct.username : '';
  const promptFile = path.join(ROOT, 'prompts', `${String(form).replace(/[^a-z0-9-]/g, '')}.md`);
  if (!fs.existsSync(promptFile)) return sendJson(res, 400, { error: '未知的形式' });
  const system = await fsp.readFile(promptFile, 'utf8');
  const perMin = form === 'series-intro' || form === 'deep-dive' || form === 'sketch-talk' || form === 'footage-mix' ? 14 : form === 'pixel-story' ? 9 : form === 'photo-talk' ? 6 : 4.5; // 像素小剧场是短镜头，段数更多
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
  // 每分钟口播字数；手绘图解每句 ≤16 字、一段 1-2 句，实测最多写到 450 字左右（约 1 分半），按它能做到的要
  const targetChars = Math.round(minutes * (form === 'pixel-story' ? 220 : form === 'sketch-talk' ? 160 : 250));
  const user = `目标时长：约 ${minutes} 分钟（约 ${sections} 段，口播总字数约 ${targetChars} 字）\n账号名：${account || '（未填写）'}\n\n客户说的话：\n${sayLine || (ref ? '（没写，照原视频的打法来）' : '（没写，按资料来）')}${materialRule}${docs.length ? `\n\n${docs.join('\n\n')}` : ''}${remixRule}

【不许编】客户没提供的人数、比例、价格、适合年龄、教龄、头衔荣誉、服务内容（免费试听、答疑、赠送、名额、一对一等）一律不写；不许用 XX、某某 这种占位词，提到机构就说“我们”${account ? `或“${account}”` : ''}。`;

  // 真人图文口播：每条随机定一个开场画面和两种主打画面，同一句话做两次、换个行业做，出来的样子都不一样
  // 每条随机定一个开场画面和几种主打画面：同一句话做两次、换个行业做，出来的样子都不一样
  const LAYOUT_POOLS = {
    'photo-talk': { open: ['quote', 'ask', 'chat', 'title', 'compare', 'checktest', 'verdict', 'warning', 'keywords', 'rank'], feat: ['quote', 'ask', 'chat', 'compare', 'steps', 'offer', 'tags', 'list', 'emoji', 'table', 'checktest', 'verdict', 'warning', 'formula', 'pyramid', 'rank', 'timeline', 'keywords', 'ticket', 'notify'], n: 3 },
    'series-intro': { open: ['type', 'countdown', 'quote', 'bedtime', 'progress'], feat: ['countdown', 'chat', 'checklist', 'vs', 'calendar', 'episodes', 'quote', 'ask', 'tree', 'cards', 'icons', 'quest', 'levelup', 'lockscreen', 'grid4', 'gift', 'neon', 'pledge', 'timeline', 'quiz', 'notebook', 'top3', 'spotlight', 'faq'], n: 4 },
    'deep-dive': { open: ['question', 'poll', 'marker', 'breaking', 'cinema', 'stamp', 'qa'], feat: ['chips', 'big', 'quote', 'compare', 'steps', 'checklist', 'marker', 'nametag', 'timeline', 'poll', 'ticker', 'caption', 'magnifier', 'qa', 'breaking', 'polaroid', 'top3', 'chain', 'stamp', 'sticky', 'cinema', 'chat', 'tape', 'tug'], n: 4 },
    'footage-mix': { open: ['hook', 'hook', 'qa', 'stamp', 'big', 'quote'], feat: ['chips', 'big', 'quote', 'steps', 'checklist', 'nametag', 'ticker', 'compare', 'qa', 'polaroid', 'focus', 'stamp'], n: 4 },
    'sketch-talk': { open: ['badge', 'spotlight', 'count', 'word', 'crowd', 'mystery', 'bulb', 'versus'], feat: ['phones', 'crowd', 'target', 'calendar', 'stack', 'gauge', 'weeks', 'word', 'grid', 'checklist', 'chat', 'bars', 'versus', 'timer', 'path', 'quote', 'mystery', 'progress', 'bulb', 'flash', 'count'], n: 4 },
    'pixel-story': { open: ['bump', 'fall', 'shocked', 'think', 'sad'], feat: ['jump', 'happy', 'read', 'point', 'talk', 'leave', 'bump', 'fall'], n: 2, word: '动作' },
    'data-card': { open: ['compare', 'myth', 'quote', 'matrix', 'bars', 'list', 'iceberg', 'scale', 'qa', 'keyword', 'gauge'], feat: ['compare', 'grid', 'flow', 'list', 'matrix', 'timeline', 'pyramid', 'myth', 'quote', 'formula', 'cycle', 'bars', 'venn', 'checks', 'scale', 'stairs', 'funnel', 'iceberg', 'gauge', 'schedule', 'qa', 'mindmap', 'checkmatrix', 'keyword', 'roadmap', 'donut'], n: 3 },
  };
  // 结尾的互动引导也随机：不要每条都是“评论区扣1”
  const CTA_STYLES = [
    '抛一个和主题有关的问题，让观众在评论区回答自己的情况（例如“你是哪一种？评论区说说”）',
    '让观众先收藏，用的时候翻出来；再关注看下一期',
    '预告下一期具体讲什么，让观众关注别错过',
    '让观众在评论区留一个和这期主题有关的关键词（2-4个字，不要用“1”“888”这种数字），你挨个回复',
    '让观众把视频转给身边正需要的人',
    '让观众在评论区说说自己踩过的坑或者遇到的问题，下期挑着讲',
    '让观众私信你说想了解什么（不要留电话、微信号）',
  ];
  const ENDS = { 'footage-mix': ['cta'], 'sketch-talk': ['follow', 'button', 'checklist', 'brand'], 'photo-talk': ['ask', 'checktest', 'quote', 'offer', 'notify', 'ticket', 'list', 'verdict', 'title', 'keywords'] };
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const cta = pickOne(CTA_STYLES);
  const endVis = ENDS[form] ? pickOne(ENDS[form]) : '';
  let layoutHint = form === 'pixel-story' ? '' : `

【这条的结尾】${ref ? '' : `最后一段的互动引导这样做：${cta}。`}${endVis ? `最后一段的画面用 ${endVis}。` : ''}`; // 复刻时结尾引导跟原视频走
  const pool = LAYOUT_POOLS[form];
  if (pool) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const opener = pick(pool.open);
    const feature = pool.feat.filter((x) => x !== opener).sort(() => Math.random() - 0.5).slice(0, pool.n);
    layoutHint += pool.word
      ? `

【这条的画面安排】第 1 个镜头主角的动作用 ${opener}；中间多用 ${feature.join('、')} 这几种动作；场景和道具用这个行业自己的。`
      : `

【这条的画面安排】第 1 段用 ${opener}；中间重点用 ${feature.join('、')}；其余按内容挑，满足“至少 5 种、相邻不重复”。`;
  }
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user + layoutHint }];
  try {
    let { data, content } = await deepseek(messages, { temperature: 0.8, key, who });
    // 自动检查一遍：违法用语（每条都查）、照抄原文（复刻时才查），有问题就带着问题让 AI 重写一次
    // 客户自己给过的文字：这里面出现过的数字、服务，不算 AI 编的
    const source = [say, trade, account, ...(Array.isArray(materials) ? materials : []).map((m) => String(m?.text || ''))].join('\n');
    const check = (d) => {
      const text = allText(d);
      const chars = (d?.sections || []).flatMap((x) => x?.lines || []).join('').length;
      return { copied: ref ? copiedPhrases(text, ref).slice(0, 8) : [], illegal: scanRisks(text).filter((x) => x.level === '违法').slice(0, 6), fab: fabricated(text, source).slice(0, 10), chars, short: chars < targetChars * 0.75 };
    };
    // 篇幅明显不够（实测 AI 常常写短，选 3 分钟出来不到 2 分钟），也带着问题让它补一次
    const score = (x) => x.copied.length * 2 + x.illegal.length * 2 + x.fab.length + (x.short ? 3 : 0);
    let c = check(data);
    if (score(c)) {
      const fb = [
        c.copied.length && `这些地方和原视频一模一样，属于照抄：${c.copied.map((x) => `「${x}」`).join('、')}。全部换成你自己的说法。`,
        c.illegal.length && `这些说法违反广告法：${c.illegal.map((x) => `「${x.word}」（${x.reason}）`).join('、')}。改成合规的说法。`,
        c.short && `篇幅不够：现在口播一共只有 ${c.chars} 字，目标约 ${targetChars} 字（约 ${sections} 段）。补到目标篇幅：多加几段新内容（换角度、举例子、讲做法），不要把每句话拉长注水。`,
        c.fab.length && `这些内容客户没提供过，是你编的：${c.fab.map((x) => `「${x.word}」（${x.why}）`).join('、')}。删掉或改成不带具体数字、不承诺具体服务的说法；占位词换成“我们”${account ? `或“${account}”` : ''}。`,
      ].filter(Boolean).join('\n');
      const again = await deepseek([...messages, { role: 'assistant', content }, { role: 'user', content: `${fb}\n其它保持不变，重新输出完整 JSON。` }], { temperature: 0.7, key, who });
      const c2 = check(again.data);
      if (c.short) console.log(`[篇幅] ${form} 目标 ${targetChars} 字，第一版 ${c.chars} 字，补写后 ${c2.chars} 字（问题分 ${score(c)} → ${score(c2)}）`);
      if (score(c2) <= score(c)) { data = again.data; c = c2; }
    }
    // 改完还剩下的，标出来让客户发之前自己核对
    if (acct) { await noteGeneration(acct.id); data._generations = (acct.generations || 0) + 1; }
    data._flags = [...c.illegal.map((x) => ({ word: x.word, why: x.reason || '广告法风险' })), ...c.fab, ...c.copied.map((x) => ({ word: x, why: '和原视频一样' }))].slice(0, 10);
    sendJson(res, 200, data);
  } catch (e) {
    sendJson(res, e.status || 500, { error: String(e.message || e) });
  }
}

// ---------- 访问限制 ----------
// 1. 只认 localhost / 127.0.0.1 这个地址（防“DNS 重绑定”：恶意网页把自己的域名指到本机来调接口）
// 2. 会改东西的请求（POST/PUT/DELETE）必须来自本页面自己：别的网站不能偷偷让浏览器来删作品、刷 AI 额度
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
function rejectReason(req) {
  const host = String(req.headers.host || '');
  const hosted = isPublicHost(host); // 公网域名（PUBLIC_BASE_URL）来的请求
  if (LOCAL_ONLY && !hosted && !LOCAL_HOST_RE.test(host)) return '只能在这台电脑上用 http://localhost 打开';
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return '';
  const origin = req.headers.origin;
  // 公网模式下反代是 https，浏览器发来的 Origin 是 https://getcut.cn，只要同域名就认（www 和主域都算）
  const sameOrigin = (() => {
    if (!origin) return true;
    if (!hosted) return origin === `http://${host}`;
    try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); } catch { return false; }
  })();
  if (!sameOrigin) return '不接受其他网站发来的请求';
  if (!origin && req.headers['sec-fetch-site'] === 'cross-site') return '不接受其他网站发来的请求';
  return '';
}

// ---------- 诊断信息（客户出问题时一键复制给我们） ----------
const clientErrors = []; // 页面上最近的报错，最多留 30 条
function pushClientError(e) {
  clientErrors.push(e);
  if (clientErrors.length > 30) clientErrors.shift();
  console.error(`[页面出错] ${e.page} ${e.message}${e.stack ? '\n' + e.stack : ''}`);
}
function tail(file, n) {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, 'r');
    const len = Math.min(st.size, 64 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    // 登录验证码、邮箱这些不带出去
    return buf.toString('utf8').split(/\r?\n/).filter((l) => !/验证码/.test(l)).slice(-n).join('\n')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***');
  } catch { return '（没有）'; }
}
function checkPython() {
  const r = spawnSync(process.env.PYTHON || 'python', ['-c', 'import edge_tts,sys;print(sys.version.split()[0], edge_tts.__version__)'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  return r.status === 0 ? r.stdout.trim() : `不可用：${(r.error?.message || r.stderr || '').trim().split('\n').pop()}`;
}
async function handleDiag(req, res) {
  const asrDir = path.join(MODELS_DIR, 'onnx-community', 'whisper-base');
  const works = fs.existsSync(WORKS) ? fs.readdirSync(WORKS).filter((f) => f.endsWith('.mp4')).length : 0;
  sendJson(res, 200, {
    version: PKG.version, commit: COMMIT, started: STARTED.toISOString(),
    node: process.versions.node, os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpus: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30), freeMemoryGB: Math.round(os.freemem() / 2 ** 30),
    aiKey: !!process.env.DEEPSEEK_API_KEY, stockKey: !!process.env.PEXELS_API_KEY,
    tts: checkPython(), asrModel: fs.existsSync(path.join(asrDir, 'config.json')) ? '已下载' : '没下载',
    works, clientErrors: clientErrors.slice(-10),
    log: tail(LOG_FILE, 60),
  });
}

// ---------- 路由 ----------
// 公网版：按 .env 里的 ADMIN_USER / ADMIN_PASSWORD 建管理员（已经有的不重复建，也不会改密码）
if (HOSTED) {
  try { await bootstrapAdmin(); } catch (e) { console.error('[账号] 创建管理员失败：', e.message); }
  if (!process.env.ADMIN_USER && !process.env.ADMIN_PASSWORD) console.warn('[账号] 没设 ADMIN_USER / ADMIN_PASSWORD：如果还没有管理员账号，请先跑 node scripts/admin.mjs create-admin 账号 密码');
}
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  // 跨源隔离：浏览器里转文字要用多线程（SharedArrayBuffer）。用 credentialless，外站图片（Pexels）照常能加载
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  const why = rejectReason(req);
  if (why) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(why); }
  try {
    const params = new URL(req.url, 'http://x').searchParams;
    // 公网版要登录的接口都从这里过一次；本地版直接放行
    const gate = (() => {
      let p = null;
      return async () => {
        if (!HOSTED) return { user: null };
        const r = await (p ||= requireUser(req));
        p = r;
        return r.user ? { user: r.user } : { fail: { status: r.status, error: r.error, code: r.code } };
      };
    })();
    const deny = (f) => sendJson(res, f.status || 401, { error: f.error, code: f.code });

    // 登录 / 账号管理（管理员后台）
    if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/admin/')) {
      return await handleAuth(req, res, pathname, { readJson, sendJson, hosted: HOSTED });
    }
    if (req.method === 'GET' && pathname === '/api/diag') {
      if (HOSTED) { const g = await gate(); if (g.fail || !g.user) return deny(g.fail || g); if (!isAdminUser(g.user)) return sendJson(res, 403, { error: '诊断信息只有管理员能看' }); }
      return await handleDiag(req, res);
    }
    if (pathname === '/api/settings') {
      const g = await gate(); if (g.fail) return deny(g.fail);
      return await handleSettings(req, res, { readJson, sendJson, markFromEnvFile: (k) => FROM_ENV_FILE.add(k), hosted: HOSTED, user: g.user });
    }
    if (req.method === 'POST' && pathname === '/api/client-error') {
      const b = await readJson(req).catch(() => ({}));
      const s = (v, n) => String(v ?? '').slice(0, n);
      pushClientError({ at: new Date().toISOString(), page: s(b.page, 200), message: s(b.message, 500), stack: s(b.stack, 1500) });
      return sendJson(res, 200, { ok: true });
    }
    // 配音、转写文件、抓网页、手机上传：公网版要登录，别让陌生人白用服务器
    if (HOSTED && (pathname.startsWith('/api/tts') || pathname === '/api/fetch-url' || pathname === '/api/qr' || pathname.startsWith('/api/relay'))) {
      const g = await gate(); if (g.fail) return deny(g.fail);
    }
    if (req.method === 'POST' && pathname === '/api/tts') return await handleTts(req, res);
    if (req.method === 'POST' && pathname === '/api/tts-batch') return await handleTtsBatch(req, res);
    const tf = pathname.match(/^\/api\/tts-file\/([0-9a-f]{40})\.mp3$/);
    if (req.method === 'GET' && tf) return await handleTtsFile(res, tf[1]);
    // 写文案：公网版用客户自己的密钥
    if (req.method === 'POST' && pathname === '/api/script') {
      let user = null; let key = process.env.DEEPSEEK_API_KEY;
      if (HOSTED) {
        const g = await gate(); if (g.fail) return deny(g.fail);
        user = g.user; key = deepseekKeyOf(user);
        if (!key) return sendJson(res, 400, { error: '还没填你自己的 DeepSeek 密钥。点右上角账号 →「我的设置」，填进去就能出片了。', code: 'no-key' });
      }
      return await handleScript(req, res, { key, acct: user });
    }
    if (req.method === 'POST' && pathname === '/api/remix-plan') {
      let key = process.env.DEEPSEEK_API_KEY; let who = '';
      if (HOSTED) {
        const g = await gate(); if (g.fail) return deny(g.fail);
        key = deepseekKeyOf(g.user); who = g.user.username;
        if (!key) return sendJson(res, 400, { error: '还没填你自己的 DeepSeek 密钥。点右上角账号 →「我的设置」，填进去就能用了。', code: 'no-key' });
      }
      return await handleRemixPlan(req, res, key, who);
    }
    if (pathname === '/api/qr' || pathname.startsWith('/api/relay')) return await handleRelay(req, res, pathname, params, { readJson, sendJson }); // 手机扫码上传
    if (req.method === 'POST' && pathname === '/api/fetch-url') return await handleFetchUrl(req, res);
    if (pathname.startsWith('/api/copy/')) {
      let user = null;
      if (HOSTED) { const g = await gate(); if (g.fail) return deny(g.fail); user = g.user; } else user = await currentUser(req);
      return await handleCopyApi(req, res, pathname, { readJson, sendJson, user }); // 文案库：每个客户自己的
    }
    if (req.method === 'GET' && pathname === '/api/stock') {
      let key = '';
      if (HOSTED) { const g = await gate(); if (g.fail) return deny(g.fail); key = pexelsKeyOf(g.user); }
      return await handleStock(req, res, params, key);
    }
    if (req.method === 'POST' && pathname === '/api/debug-frame' && process.env.NODE_ENV !== 'production') {
      // 开发调试：把浏览器里渲染的某一帧存成图片
      const { name, data } = await readJson(req);
      const dir = path.join(CACHE_DIR, 'frames');
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, String(name).replace(/[^\w.-]/g, '') + '.png'), Buffer.from(String(data).split(',')[1], 'base64'));
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/debug-file' && process.env.NODE_ENV !== 'production') {
      const dir = path.join(CACHE_DIR, 'frames');
      await fsp.mkdir(dir, { recursive: true });
      const fname = (params.get('name') || 'export').replace(/[^\w.-]/g, '');
      const out = fs.createWriteStream(path.join(dir, fname + '.mp4'));
      req.pipe(out);
      return out.on('finish', () => sendJson(res, 200, { ok: true }));
    }
    if (pathname === '/mcp') return await handleMcp(req, res, { readJson });
    if (pathname.startsWith('/api/jobs')) return await handleJobs(req, res, pathname, params);
    // 作品墙：公网版每人一个目录，管理员可以带 ?owner=<账号id> 看别人的
    if (pathname.startsWith('/api/works') || pathname.startsWith('/works/')) {
      if (HOSTED) {
        const g = await gate(); if (g.fail) return deny(g.fail);
        const me = g.user;
        let owner = me;
        const oid = params.get('owner');
        if (oid && isAdminUser(me) && /^[0-9a-f]{24}$/.test(oid)) { const ou = await readAccount(oid); if (ou) owner = ou; }
        if (pathname.startsWith('/api/works')) return await handleWorks(req, res, pathname, worksDirOf(owner), params, `/works/${owner.id}/`);
        const m = pathname.match(/^\/works\/([0-9a-f]{24})\/(.+)$/);
        if (!m) { res.writeHead(404); return res.end('not found'); }
        let target = m[1] === me.id ? me : (isAdminUser(me) ? await readAccount(m[1]) : null);
        if (!target) { res.writeHead(403); return res.end('forbidden'); }
        return await serveWorkFile(req, res, '/works/' + m[2], worksDirOf(target)); // 作品墙视频（支持 Range）
      }
      if (pathname.startsWith('/api/works')) return await handleWorks(req, res, pathname, WORKS, params); // 本地版：还是全局 works/
      if (pathname.startsWith('/works/')) return await serveWorkFile(req, res, pathname, WORKS);
    }
    if (req.method === 'GET' && pathname === '/api/status') { if (!process.env.PEXELS_API_KEY) loadEnv(); return sendJson(res, 200, { ai: !!process.env.DEEPSEEK_API_KEY, stock: !!process.env.PEXELS_API_KEY, hosted: HOSTED, asrBase: process.env.ASR_MODEL_BASE || '/models/asr/', asrModel: process.env.ASR_MODEL || 'whisper-base', authRequired: HOSTED, jobWorker: process.env.JOB_WORKER === '1', version: PKG.version, commit: COMMIT }); }
    // 账号管理页面本身也不给陌生人看：没登录或不管理员就回首页登录（接口那边还有一道校验）
    if (pathname === '/admin/accounts.html' && HOSTED) {
      const g = await gate();
      if (g.fail || !isAdminUser(g.user)) { res.writeHead(302, { Location: '/?admin=1' }); return res.end(); }
    }
    // 听写模型走国内镜像（省服务器带宽）：.env 里设了 ASR_MIRROR=https://hf-mirror.com 就 302 过去，
    // 没设就用本地 .cache 里的模型文件（本地版/离线部署）
    if ((req.method === 'GET' || req.method === 'HEAD') && process.env.ASR_MIRROR && pathname.startsWith('/models/asr/')) {
      const rest = pathname.slice('/models/asr/'.length);
      const m = rest.match(/^([^/]+\/[^/]+)\/(.+)$/);
      if (m) {
        const base = String(process.env.ASR_MIRROR).replace(/\/+$/, '');
        res.writeHead(302, { Location: `${base}/${m[1]}/resolve/main/${m[2]}`, 'Cache-Control': 'no-store' });
        return res.end();
      }
    }
    if (req.method === 'GET' && (await serveStatic(req, res, pathname))) return;
    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, HOST, () => console.log(`出片王 v${PKG.version}${COMMIT ? ` (${COMMIT})` : ''} 已启动: http://localhost:${PORT}${LOCAL_ONLY ? '（只允许本机访问）' : `（局域网可访问，HOST=${HOST}）`}${HOSTED ? '（公网版：账号密码登录）' : ''}`));
