// 出错记录：出问题时留一条带时间的记录，存在客户自己的电脑上（data/errors.jsonl）。
//
// 解决的是这个场景：客户发一句“刚才出错了”，我们只能问“什么时候？点什么的时候？报什么？”。
// 现在诊断信息里直接带着「2026-11-25 15:12:03  POST /api/script  502  AI 连着几次没把稿子按格式写完……」，
// 客户点「复制诊断信息」就能发过来，我们不用猜时间点。
//
// 只记“出错了这件事”：时间、哪一步、状态码、错误原因、版本。不记客户的文案、视频、密钥。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './paths.js';

const FILE = path.join(DATA_DIR, 'errors.jsonl');
const INSTALL = path.join(DATA_DIR, 'install.json');
const KEEP_FILE = 300; // 文件里最多留 300 条
const KEEP_MEM = 60; // 内存里最多留 60 条，诊断信息用的是这份

const mem = [];
let appends = 0;
let install = '';
let appVersion = '';

/** 版本号由 server.js 启动时告诉这里，记录里带上，方便区分是哪一版出的问题 */
export function setErrorVersion(v) { appVersion = String(v || ''); }
/** 这台机器的匿名编号：同一台电脑一直是同一个，方便我们认出“又是这位客户” */
export function installId() {
  if (install) return install;
  try {
    const j = JSON.parse(fs.readFileSync(INSTALL, 'utf8'));
    if (j?.id) return (install = String(j.id));
  } catch { /* 还没有 */ }
  install = crypto.randomBytes(6).toString('hex');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(INSTALL, JSON.stringify({ id: install, createdAt: new Date().toISOString() })); } catch { /* 写不了也不影响用 */ }
  return install;
}

const pad = (n) => String(n).padStart(2, '0');
/** 本地时间（年月日时分秒）+ 时区，避免“UTC 差 8 小时”这种对不上的情况 */
function stamp(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

function append(entry) {
  const line = JSON.stringify(entry);
  appends++;
  fsp.mkdir(DATA_DIR, { recursive: true })
    .then(() => fsp.appendFile(FILE, line + '\n', 'utf8'))
    .then(() => (appends % 20 === 0 ? trim() : null))
    .catch(() => { /* 磁盘满/没权限也不该连累主流程 */ });
}

/** 文件别无限长：超过 300 条就只留最近的 */
async function trim() {
  try {
    const lines = (await fsp.readFile(FILE, 'utf8')).split('\n').filter(Boolean);
    if (lines.length > KEEP_FILE) await fsp.writeFile(FILE, lines.slice(-KEEP_FILE).join('\n') + '\n', 'utf8');
  } catch { /* 下次再说 */ }
}

/**
 * 记一条出错。
 * @param {{kind?: string, where?: string, status?: number, message?: string, detail?: string, user?: string, extra?: object}} e
 *   kind：api（接口报错）/ page（页面报错）/ job（出片任务）/ ai（AI 没按格式交稿）
 *   where：哪一步，比如 "POST /api/script"
 */
export function noteError({ kind = 'api', where = '', status = 0, message = '', detail = '', user = '', extra = null } = {}) {
  const d = new Date();
  const entry = {
    at: d.toISOString(),
    local: stamp(d),
    kind: clip(kind, 20),
    where: clip(where, 120),
    status: Number(status) || 0,
    message: clip(message, 300),
    ...(detail ? { detail: clip(detail, 300) } : {}),
    ...(user ? { user: clip(user, 60) } : {}),
    version: appVersion,
    install: installId(),
    ...(extra && typeof extra === 'object' ? { extra: JSON.parse(JSON.stringify(extra)) } : {}),
  };
  mem.push(entry);
  while (mem.length > KEEP_MEM) mem.shift();
  // 日志里也留一行（桌面版会落到 server.log，诊断信息本来就带它）
  console.error(`[出错记录] ${entry.local} ${entry.where || entry.kind} ${entry.status || ''} ${entry.message}`.trim());
  append(entry);
  return entry;
}

/** 最近的出错，新的在前 */
export function recentErrors(n = 20) {
  return mem.slice(-n).reverse();
}

/** 启动时把上一次运行留下的记录读进来，重启之后也查得到 */
export function loadRecentErrors() {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).slice(-KEEP_MEM);
    for (const l of lines) {
      try { mem.push(JSON.parse(l)); } catch { /* 半行（写到一半断电）忽略 */ }
    }
  } catch { /* 第一次运行，没有文件 */ }
  return mem.length;
}
