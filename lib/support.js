// 接收客户电脑发来的出错记录（GET / 后台查看也在这里）。
//
// 装在客户自己电脑上的版本，出错时会把那一条发过来（lib/report.js），存成按天的文件：
//   data/support/2026-11-25.jsonl
// 我们在后台就能按天翻：几点几分、哪台机器、哪一步、什么错。
//
// 收到的只有：时间、哪一步、状态码、错误文本、版本、机器编号。没有客户的文案、视频、密钥。
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const DIR = path.join(DATA_DIR, 'support');
const KEEP_DAYS = 90; // 只留最近三个月，免得越攒越多
const MAX_PER_DAY = 5000; // 一天最多收这么多条，防止被人刷爆磁盘

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// 每个 IP 每分钟最多发几次：正常客户电脑一天也就几次，被刷了也伤不到磁盘
const hits = new Map();
function overRate(ip) {
  const now = Date.now();
  const k = ip || '?';
  const cur = hits.get(k);
  if (!cur || now - cur.at > 60e3) { hits.set(k, { at: now, n: 1 }); return false; }
  cur.n++;
  return cur.n > 60;
}

function sanitize(e, meta) {
  if (!e || typeof e !== 'object') return null;
  const at = Number.isNaN(Date.parse(e.at)) ? new Date().toISOString() : new Date(e.at).toISOString();
  return {
    at,
    local: clip(e.local, 60),
    kind: clip(e.kind, 20),
    where: clip(e.where, 120),
    status: Number(e.status) || 0,
    message: clip(e.message, 300),
    ...(e.detail ? { detail: clip(e.detail, 300) } : {}),
    ...(e.user ? { user: clip(e.user, 60) } : {}),
    version: clip(e.version, 20),
    ...meta,
  };
}

async function ingest(req, res, readJson, sendJson) {
  if (process.env.REPORT_KEY && String(req.headers['x-cpw-key'] || '') !== process.env.REPORT_KEY) {
    return sendJson(res, 401, { error: '不收' });
  }
  if (overRate(req.socket?.remoteAddress)) return sendJson(res, 429, { error: '慢点' });
  const body = await readJson(req);
  const install = clip(body.install, 40);
  if (!/^[0-9a-z-]{4,40}$/i.test(install)) return sendJson(res, 400, { error: '机器编号不对' });
  const list = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!list.length) return sendJson(res, 400, { error: '没有内容' });
  const recvAt = new Date().toISOString();
  const rows = list.map((e) => sanitize(e, { install, version: clip(body.version, 20), recvAt })).filter(Boolean);
  if (!rows.length) return sendJson(res, 400, { error: '没有内容' });

  await fsp.mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${today()}.jsonl`);
  try {
    if ((await fsp.stat(file)).size > MAX_PER_DAY * 400) return sendJson(res, 200, { ok: true, n: 0, full: true });
  } catch { /* 今天第一次收 */ }
  await fsp.appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return sendJson(res, 200, { ok: true, n: rows.length });
}

async function listDays() {
  try {
    return (await fsp.readdir(DIR)).filter((f) => DAY_RE.test(f.replace(/\.jsonl$/, ''))).map((f) => f.replace(/\.jsonl$/, '')).sort().reverse();
  } catch { return []; }
}

async function readDay(day, limit = 200) {
  const file = path.join(DIR, `${day}.jsonl`);
  let txt = '';
  try { txt = await fsp.readFile(file, 'utf8'); } catch { return []; }
  const rows = [];
  for (const l of txt.split('\n')) {
    if (!l) continue;
    try { rows.push(JSON.parse(l)); } catch { /* 半行忽略 */ }
  }
  // 按时间倒序（新的在前）：上报有时是补发的，文件顺序不一定等于时间顺序
  rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return rows.slice(0, Math.min(Math.max(Number(limit) || 200, 1), 1000));
}

async function query(req, res, sendJson) {
  const u = new URL(req.url, 'http://x');
  const day = DAY_RE.test(String(u.searchParams.get('day') || '')) ? u.searchParams.get('day') : today();
  const [days, events] = await Promise.all([listDays(), readDay(day, u.searchParams.get('limit'))]);
  // 顺手统计一下：哪个环节出错最多，一眼看出主要问题在哪
  const byWhere = {};
  for (const e of events) byWhere[e.where || e.kind] = (byWhere[e.where || e.kind] || 0) + 1;
  const installs = new Set(events.map((e) => e.install)).size;
  return sendJson(res, 200, { day, days: days.slice(0, 60), total: events.length, installs, byWhere, events });
}

/** 收上报、查记录；路由在 server.js 里（/api/support/*） */
export async function handleSupportApi(req, res, pathname, { readJson, sendJson }) {
  if (req.method === 'POST' && pathname === '/api/support/report') return ingest(req, res, readJson, sendJson);
  if (req.method === 'GET' && pathname === '/api/support/errors') return query(req, res, sendJson);
  return sendJson(res, 404, { error: '没有这个接口' });
}

/** 只留最近 90 天 */
export async function cleanupSupport() {
  try {
    const limit = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
    for (const d of await listDays()) if (d < limit) await fsp.unlink(path.join(DIR, `${d}.jsonl`)).catch(() => {});
  } catch { /* 还没目录 */ }
  return DIR;
}
