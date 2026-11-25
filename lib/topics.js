// 「客户都问了什么」：记下每次生成视频时，客户在首页输入框里写的那句话。
//
// 用途是产品视角：知道客户到底想做什么内容、常问哪些问题，好调模板和提示词。
// 只记客户**自己写的那句话**（截前 300 字）+ 用的模板 + 时长 + 出了没有，不记 AI 写出来的稿子全文。
//
// 隐私：这是客户写的内容，属于他的东西。所以：
//   - 只在公网版（有账号）记，能对上是谁；本地版不记
//   - .env 里 TOPICS_LOG=off 可整体关掉
//   - 后台只有管理员能看
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const DIR = path.join(DATA_DIR, 'topic-log');
const KEEP_DAYS = 90;
const MAX_PER_DAY = 5000;

const enabled = () => String(process.env.TOPICS_LOG || 'on').toLowerCase() !== 'off';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** 本地时间戳，和出错记录保持一样的格式，方便对时间 */
export function stamp(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

/**
 * 记一条“客户问了什么”。
 * @param {{user?: string, kind?: 'script'|'remix', form?: string, minutes?: number, text?: string,
 *          materialCount?: number, industry?: string, ok?: boolean, title?: string, error?: string, chars?: number}} e
 */
export function noteTopic(e = {}) {
  if (!enabled()) return;
  const d = new Date();
  const entry = {
    at: d.toISOString(),
    local: stamp(d),
    user: clip(e.user, 60),
    kind: e.kind === 'remix' ? 'remix' : 'script',
    form: clip(e.form, 30),
    minutes: Number(e.minutes) || 0,
    text: clip(e.text, 300),
    materialCount: Number(e.materialCount) || 0,
    ...(e.industry ? { industry: clip(e.industry, 60) } : {}),
    ok: e.ok !== false,
    ...(e.title ? { title: clip(e.title, 60) } : {}),
    ...(e.error ? { error: clip(e.error, 200) } : {}),
    ...(e.chars ? { chars: Number(e.chars) } : {}),
  };
  // 整条都是空的（没写、没资料）就不记，免得日志里全是空行
  if (!entry.text && !entry.materialCount && !entry.industry) return;
  const line = JSON.stringify(entry) + '\n';
  fsp.mkdir(DIR, { recursive: true })
    .then(() => fsp.appendFile(path.join(DIR, `${dayOf(d)}.jsonl`), line, 'utf8'))
    .catch(() => { /* 记不上不影响出片 */ });
  return entry;
}

async function listDays() {
  try { return (await fsp.readdir(DIR)).filter((f) => DAY_RE.test(f.replace(/\.jsonl$/, ''))).map((f) => f.replace(/\.jsonl$/, '')).sort().reverse(); }
  catch { return []; }
}

async function readDay(day, limit = 300) {
  let txt = '';
  try { txt = (await fsp.readFile(path.join(DIR, `${day}.jsonl`), 'utf8')).replace(/^\uFEFF/, ''); } catch { return []; }
  const rows = [];
  for (const l of txt.split('\n')) {
    if (!l) continue;
    try { rows.push(JSON.parse(l)); } catch { /* 半行忽略 */ }
  }
  rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return rows.slice(0, Math.min(Math.max(Number(limit) || 300, 1), 2000));
}

/** 后台用：某一天客户都问了什么 */
export async function queryTopics(day, limit) {
  const d = DAY_RE.test(String(day || '')) ? day : dayOf();
  const [days, items] = await Promise.all([listDays(), readDay(d, limit)]);
  const failed = items.filter((x) => x.ok === false).length;
  const byForm = {};
  const byUser = {};
  for (const x of items) {
    if (x.form) byForm[x.form] = (byForm[x.form] || 0) + 1;
    if (x.user) byUser[x.user] = (byUser[x.user] || 0) + 1;
  }
  return { day: d, days: days.slice(0, 60), total: items.length, failed, byForm, byUser, items };
}

/** 只留最近 90 天 */
export async function cleanupTopics() {
  try {
    const limit = dayOf(new Date(Date.now() - KEEP_DAYS * 864e5));
    for (const d of await listDays()) if (d < limit) await fsp.unlink(path.join(DIR, `${d}.jsonl`)).catch(() => {});
  } catch { /* 还没目录 */ }
  return DIR;
}

export const maxPerDay = MAX_PER_DAY;
