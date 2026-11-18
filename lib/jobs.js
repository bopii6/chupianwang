'use strict';

// 任务队列（内存 Map）：本地由「本机 Chrome（非 headless）」打开页面出片，
// 页面渲染完成后回传 MP4，落到 works/ 目录。
// 只依赖 node 内置模块；文件名/目录风格对齐 lib/works.js。
// 注意：只有 process.env.JOB_WORKER === '1' 时才会拉起浏览器，
// 云端生产服务器没有该变量，绝不启动浏览器。

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(ROOT, '.cache', 'jobs');
const CHROME_DIR = path.join(ROOT, '.cache', 'job-chrome');
const WORKS_DIR = path.join(ROOT, 'works');

const PORT = Number(process.env.PORT || 5173);
const TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟未 complete 视为失败
const LIST_LIMIT = 50; // GET /api/jobs 最多返回 50 条
const STORE_LIMIT = 200; // 内存里最多保留的已完成任务数
const UPLOAD_LIMIT = 1024 * 1024 * 1024; // 视频上传上限 1GB
const JSON_LIMIT = 1024 * 1024;

// 六种出片形式：id ⇄ 中文名
const FORMS = {
  'photo-talk': '真人图文口播',
  'series-intro': '系列开场',
  'sketch-talk': '手绘图解',
  'deep-dive': '深度解读',
  'pixel-story': '像素小剧场',
  'data-card': '黑金数据卡',
};
const FORM_IDS = Object.keys(FORMS);

// 参考视频允许的常见扩展名
const VIDEO_EXTS = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.avi',
  '.mkv', '.flv', '.wmv', '.ts', '.mpg', '.mpeg',
]);

const WORKER_OFF =
  '当前服务未开启渲染 worker（未设置 JOB_WORKER=1），请在本机用 打开微信出片.bat 启动后再调用，云端服务器不渲染视频';

/** @type {Map<string, any>} */
const jobs = new Map();
/** @type {Map<string, any>} */
const procs = new Map(); // jobId -> ChildProcess
let seq = 0;

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function nowIso() {
  return new Date().toISOString();
}

function trim(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function workerOn() {
  return process.env.JOB_WORKER === '1';
}

function newId() {
  return `j_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// 与 lib/works.js 保持一致的标题清洗：去掉 \/:*?"<>| 与控制符，压空白，最长 60
function safeTitle(input) {
  const cleaned = String(input === undefined || input === null ? '' : input)
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const out = cleaned.slice(0, 60).trim();
  return out || '未命名';
}

function normalizeForm(value, fallback) {
  const raw = trim(value);
  if (!raw) return fallback || null;
  if (FORMS[raw]) return raw;
  for (const id of FORM_IDS) {
    if (FORMS[id] === raw) return id;
  }
  // 宽松匹配：允许「真人图文口播 2 分钟」这类写法
  for (const id of FORM_IDS) {
    if (raw.includes(FORMS[id]) || FORMS[id].includes(raw)) return id;
  }
  return null;
}

function parseMinutes(value) {
  const raw = trim(value);
  if (!raw) return 2;
  const n = Number(raw);
  if (!Number.isInteger(n) || ![1, 2, 3].includes(n)) return null;
  return n;
}

function sendJson(res, code, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
  return true;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, JSON_LIMIT);
  if (!buf || !buf.length) return {};
  const text = buf.toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ */
/* 任务对象                                                            */
/* ------------------------------------------------------------------ */

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    type: job.type,
    topic: job.topic,
    form: job.form,
    minutes: job.minutes,
    account: job.account,
    industry: job.industry,
    title: job.title,
    workId: job.workId,
    url: job.url,
    size: job.size,
    filePath: job.filePath,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function makeJob(data) {
  const createdAt = nowIso();
  return {
    id: data.id || newId(),
    status: 'queued',
    type: data.type,
    topic: data.topic || '',
    form: data.form,
    minutes: data.minutes,
    account: data.account || '',
    industry: data.industry || '',
    title: '',
    workId: '',
    url: '',
    size: 0,
    filePath: '',
    error: null,
    message: '',
    refPath: data.refPath || '',
    pid: 0,
    timer: null,
    seq: ++seq,
    createdAt,
    updatedAt: createdAt,
  };
}

function registerJob(job) {
  jobs.set(job.id, job);
  pruneStore();
  job.timer = setTimeout(() => {
    if (job.status === 'done' || job.status === 'error') return;
    markFailed(job, '渲染超时（10 分钟未完成），已关闭本次拉起的浏览器');
  }, TIMEOUT_MS);
  if (job.timer && typeof job.timer.unref === 'function') job.timer.unref();
}

function pruneStore() {
  if (jobs.size <= STORE_LIMIT) return;
  const finished = [...jobs.values()]
    .filter((j) => j.status === 'done' || j.status === 'error')
    .sort((a, b) => a.seq - b.seq);
  for (const job of finished) {
    if (jobs.size <= STORE_LIMIT) break;
    jobs.delete(job.id);
  }
}

function clearTimer(job) {
  if (job && job.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
}

function markFailed(job, message) {
  if (!job) return;
  job.status = 'error';
  job.error = String(message || '未知错误');
  job.updatedAt = nowIso();
  clearTimer(job);
  stopBrowser(job);
}

/* ------------------------------------------------------------------ */
/* 浏览器：查找 / 启动 / 结束                                           */
/* ------------------------------------------------------------------ */

function browserCandidates() {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  const list = [];
  for (const root of roots) {
    // 优先 Chrome，其次 Edge
    list.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    list.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }
  return list;
}

function findBrowser() {
  for (const exe of browserCandidates()) {
    try {
      if (fs.existsSync(exe)) return exe;
    } catch (_) {
      // 忽略
    }
  }
  return null;
}

function buildPageUrl(job) {
  const params = new URLSearchParams();
  params.set('topic', job.topic || '');
  if (job.form) params.set('form', job.form);
  params.set('minutes', String(job.minutes));
  params.set('auto', '1');
  params.set('job', job.id);
  if (job.account) params.set('account', job.account);
  if (job.type === 'remix') {
    params.set('mode', 'remix');
    params.set('industry', job.industry || job.topic || '');
  }
  return `http://localhost:${PORT}/?${params.toString()}`;
}

function launchBrowser(job) {
  if (!workerOn()) return; // 云端禁止启动浏览器
  const exe = findBrowser();
  if (!exe) {
    markFailed(job, '未找到本机 Chrome / Edge，请先安装 Chrome 后重试');
    return;
  }

  const userDir = path.join(CHROME_DIR, job.id);
  try {
    fs.mkdirSync(userDir, { recursive: true });
  } catch (_) {
    // 目录建不出来也继续尝试
  }

  const args = [
    `--user-data-dir=${userDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    buildPageUrl(job),
  ];

  let child;
  try {
    child = spawn(exe, args, { stdio: 'ignore', windowsHide: false });
  } catch (err) {
    markFailed(job, `启动浏览器失败：${err.message}`);
    return;
  }

  procs.set(job.id, child);
  job.pid = child.pid || 0;
  job.status = 'running';
  job.updatedAt = nowIso();

  child.on('error', (err) => {
    markFailed(job, `启动浏览器失败：${err.message}`);
  });
  child.on('exit', () => {
    procs.delete(job.id);
  });
}

// 杀掉本次拉起的浏览器，并尽量清掉 user-data-dir（失败忽略）
function stopBrowser(job) {
  if (!job) return;
  const child = procs.get(job.id);
  procs.delete(job.id);

  const pid = (child && child.pid) || job.pid;
  if (child) {
    try {
      child.kill();
    } catch (_) {
      // 忽略
    }
  }
  if (pid && process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    } catch (_) {
      // 忽略
    }
  }
  job.pid = 0;

  const userDir = path.join(CHROME_DIR, job.id);
  const timer = setTimeout(() => {
    try {
      fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 3 });
    } catch (_) {
      // 忽略：可能仍被占用
    }
  }, 800);
  if (timer && typeof timer.unref === 'function') timer.unref();
}

/* ------------------------------------------------------------------ */
/* 入参校验                                                            */
/* ------------------------------------------------------------------ */

function resolveVideoPath(input) {
  const raw = trim(input);
  if (!raw) throw new Error('缺少 video_path（本机视频绝对路径）');
  if (raw.includes('\u0000')) throw new Error('video_path 非法');
  const segs = raw.split(/[\\/]+/);
  if (segs.includes('..')) throw new Error('video_path 不允许包含 .. 路径穿越');
  if (!path.isAbsolute(raw)) throw new Error('video_path 必须是绝对路径');

  const full = path.resolve(raw);
  const ext = path.extname(full).toLowerCase();
  if (!VIDEO_EXTS.has(ext)) {
    throw new Error(`video_path 扩展名不支持（可用：${[...VIDEO_EXTS].join(' / ')}）`);
  }
  let stat;
  try {
    stat = fs.statSync(full);
  } catch (_) {
    throw new Error('video_path 指向的文件不存在');
  }
  if (!stat.isFile()) throw new Error('video_path 不是文件');
  if (stat.size <= 0) throw new Error('video_path 文件为空');
  return full;
}

function formErrorText() {
  return `form 不支持，可用值：${FORM_IDS.map((id) => `${id} / ${FORMS[id]}`).join('、')}`;
}

/* ------------------------------------------------------------------ */
/* 创建任务                                                            */
/* ------------------------------------------------------------------ */

// POST /api/jobs  { topic, form, minutes?, account? }
async function createTopicJob(req, res) {
  if (!workerOn()) return sendJson(res, 503, { error: WORKER_OFF });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: `请求体不是合法 JSON：${err.message}` });
  }

  const topic = trim(body.topic);
  if (!topic) return sendJson(res, 400, { error: '缺少 topic（必填）' });

  const form = normalizeForm(body.form, 'photo-talk');
  if (!form) return sendJson(res, 400, { error: formErrorText() });

  const minutes = parseMinutes(body.minutes);
  if (minutes === null) return sendJson(res, 400, { error: 'minutes 只能是 1 / 2 / 3' });

  const account = trim(body.account);

  const job = makeJob({ type: 'topic', topic, form, minutes, account });
  registerJob(job);
  launchBrowser(job);

  return sendJson(res, 200, {
    id: job.id,
    status: 'queued',
    topic: job.topic,
    form: job.form,
    minutes: job.minutes,
    account: job.account,
    type: 'topic',
  });
}

// POST /api/jobs/remix
// A) application/json { industry | topic, form?, minutes?, account?, video_path }
// B) video/* 或 application/octet-stream，参数走 query，body 为视频字节
async function createRemixJob(req, res, searchParams) {
  if (!workerOn()) return sendJson(res, 503, { error: WORKER_OFF });

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  const isBinary =
    contentType.startsWith('video/') || contentType.includes('application/octet-stream');

  if (!isJson && !isBinary) {
    return sendJson(res, 415, {
      error: 'Content-Type 只支持 application/json 或 video/* / application/octet-stream',
    });
  }

  let body = {};
  if (isJson) {
    try {
      body = await readJson(req);
    } catch (err) {
      return sendJson(res, 400, { error: `请求体不是合法 JSON：${err.message}` });
    }
  }

  const pick = (key) => (isJson ? body[key] : searchParams.get(key));

  const industryIn = trim(pick('industry'));
  const topicIn = trim(pick('topic'));
  const base = industryIn || topicIn;
  if (!base) return sendJson(res, 400, { error: 'industry 与 topic 至少提供一个（作为行业/主题）' });

  const rawForm = trim(pick('form'));
  let form = '';
  if (rawForm) {
    form = normalizeForm(rawForm);
    if (!form) return sendJson(res, 400, { error: formErrorText() });
  }

  const minutes = parseMinutes(pick('minutes'));
  if (minutes === null) return sendJson(res, 400, { error: 'minutes 只能是 1 / 2 / 3' });

  const account = trim(pick('account'));

  const id = newId();
  let refPath = '';

  if (isJson) {
    try {
      const srcPath = resolveVideoPath(body.video_path);
      const dir = path.join(JOBS_DIR, id);
      fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(srcPath).toLowerCase() || '.mp4';
      refPath = path.join(dir, 'ref' + ext);
      fs.copyFileSync(srcPath, refPath);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  } else {
    let buf;
    try {
      buf = await readBody(req, UPLOAD_LIMIT);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    if (!buf || !buf.length) return sendJson(res, 400, { error: '请求体为空，缺少参考视频字节' });
    const dir = path.join(JOBS_DIR, id);
    try {
      fs.mkdirSync(dir, { recursive: true });
      refPath = path.join(dir, 'ref.mp4');
      fs.writeFileSync(refPath, buf);
    } catch (err) {
      return sendJson(res, 500, { error: `保存参考视频失败：${err.message}` });
    }
  }

  const job = makeJob({
    id,
    type: 'remix',
    topic: topicIn || industryIn,
    industry: industryIn || topicIn,
    form,
    minutes,
    account,
    refPath,
  });
  registerJob(job);
  launchBrowser(job);

  return sendJson(res, 200, {
    id: job.id,
    status: 'queued',
    topic: job.topic,
    form: job.form,
    minutes: job.minutes,
    account: job.account,
    industry: job.industry,
    type: 'remix',
  });
}

/* ------------------------------------------------------------------ */
/* 查询 / 文件                                                         */
/* ------------------------------------------------------------------ */

function listJobs() {
  return [...jobs.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, LIST_LIMIT)
    .map(publicJob);
}

function mimeOf(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  return 'application/octet-stream';
}

function sendFile(res, filePath, contentType, code = 200) {
  let st;
  try { st = fs.statSync(filePath); } catch { return false; }
  res.writeHead(code, {
    'Content-Type': contentType,
    'Content-Length': st.size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function serveReference(res, job) {
  if (!job.refPath || !fs.existsSync(job.refPath)) {
    return sendJson(res, 404, { error: '找不到参考视频' });
  }
  if (!sendFile(res, job.refPath, mimeOf(job.refPath))) {
    return sendJson(res, 404, { error: '找不到参考视频' });
  }
}

function serveFile(res, job) {
  if (job.status !== 'done') return sendJson(res, 409, { error: job.error || '成片还没好' });
  if (!job.filePath || !fs.existsSync(job.filePath)) {
    return sendJson(res, 404, { error: '成片文件不在了' });
  }
  if (!sendFile(res, job.filePath, 'video/mp4')) {
    return sendJson(res, 404, { error: '成片文件不在了' });
  }
}

async function completeJob(req, res, job, searchParams) {
  if (job.status === 'done' && job.filePath && fs.existsSync(job.filePath)) {
    return sendJson(res, 200, { ok: true, id: job.id, status: 'done', title: job.title, workId: job.workId, url: job.url, size: job.size, filePath: job.filePath });
  }
  const title = trim(searchParams.get('title')) || job.topic || '未命名';
  let buf;
  try { buf = await readBody(req, UPLOAD_LIMIT); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }
  if (!buf || !buf.length) return sendJson(res, 400, { error: '没有收到视频数据' });
  fs.mkdirSync(WORKS_DIR, { recursive: true });
  const fileName = `${Date.now()}_${safeTitle(title)}.mp4`;
  const full = path.join(WORKS_DIR, fileName);
  const tmp = full + '.part';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, full);
  job.status = 'done';
  job.title = safeTitle(title);
  job.workId = fileName; // 与作品墙 id 一致（含 .mp4）
  job.filePath = full;
  job.url = '/works/' + encodeURIComponent(fileName);
  job.size = buf.length;
  job.error = null;
  job.updatedAt = nowIso();
  clearTimer(job);
  stopBrowser(job);
  return sendJson(res, 200, { ok: true, id: job.id, status: 'done', title: job.title, workId: job.workId, url: job.url, size: job.size, filePath: job.filePath });
}

async function failJobRequest(req, res, job) {
  let body = {};
  try { body = await readJson(req); } catch { body = {}; }
  markFailed(job, body.error || '出片失败');
  return sendJson(res, 200, { ok: true, id: job.id, status: 'error', error: job.error });
}

async function progressJob(req, res, job) {
  let body = {};
  try { body = await readJson(req); } catch { body = {}; }
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'running';
    if (body.message) job.message = String(body.message).slice(0, 200);
    job.updatedAt = nowIso();
  }
  return sendJson(res, 200, publicJob(job));
}

export async function handleJobs(req, res, pathname, searchParams) {
  const method = req.method || 'GET';
  try {
    if (pathname === '/api/jobs' && method === 'POST') return await createTopicJob(req, res);
    if (pathname === '/api/jobs/remix' && method === 'POST') return await createRemixJob(req, res, searchParams);
    if (pathname === '/api/jobs' && method === 'GET') return sendJson(res, 200, { items: listJobs() });

    const m = /^\/api\/jobs\/([^/]+)(?:\/(reference|file|complete|fail|progress))?$/.exec(pathname);
    if (!m) return sendJson(res, 404, { error: '接口不存在' });
    const id = decodeURIComponent(m[1]);
    const job = jobs.get(id);
    if (!job) return sendJson(res, 404, { error: '任务不存在，可能已过期或服务刚重启' });
    const action = m[2] || '';
    if (!action && method === 'GET') return sendJson(res, 200, publicJob(job));
    if (action === 'reference' && method === 'GET') return serveReference(res, job);
    if (action === 'file' && method === 'GET') return serveFile(res, job);
    if (action === 'complete' && method === 'POST') return await completeJob(req, res, job, searchParams);
    if (action === 'fail' && method === 'POST') return await failJobRequest(req, res, job);
    if (action === 'progress' && method === 'POST') return await progressJob(req, res, job);
    return sendJson(res, 405, { error: '不支持的请求' });
  } catch (err) {
    if (!res.headersSent) return sendJson(res, 500, { error: String(err.message || err) });
  }
}
