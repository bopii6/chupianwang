// 设置：在软件里填 AI 密钥（存到数据目录的 .env），不用再去找文件改
//   GET  /api/settings   → 密钥填没填（只给头尾几位，不回传完整密钥）、DeepSeek 余额
//   POST /api/settings   → { deepseekKey?, pexelsKey? }，DeepSeek 密钥会先试一下能不能用
// 只允许本机直接访问：即使开了局域网（HOST=0.0.0.0），别的设备也改不了、看不到。
import fs from 'node:fs';
import { ENV_FILE } from './paths.js';

const FIELDS = { deepseekKey: 'DEEPSEEK_API_KEY', pexelsKey: 'PEXELS_API_KEY' };
const mask = (v) => (v ? (v.length > 12 ? `${v.slice(0, 5)}…${v.slice(-4)}` : '已填写') : '');
const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');

/** 改 .env 里的一行（没有就加上），其它行原样保留 */
export function writeEnvValue(file, key, value) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* 还没有 .env */ }
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

async function deepseekBalance(key) {
  const r = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
  if (r.status === 401) return { ok: false, error: '这个密钥不对，DeepSeek 不认（检查有没有复制完整）' };
  if (!r.ok) return { ok: false, error: `DeepSeek 返回错误 ${r.status}，稍后再试` };
  const d = await r.json();
  const cny = (d.balance_infos || []).find((b) => b.currency === 'CNY') || (d.balance_infos || [])[0];
  return { ok: true, available: d.is_available !== false, balance: cny ? `${cny.total_balance} ${cny.currency === 'CNY' ? '元' : cny.currency}` : '' };
}

export async function handleSettings(req, res, { readJson, sendJson, markFromEnvFile }) {
  if (!isLoopback(req)) return sendJson(res, 403, { error: '只能在这台电脑上改设置' });
  if (req.method === 'GET') {
    const key = process.env.DEEPSEEK_API_KEY || '';
    let deepseek = { filled: !!key, masked: mask(key) };
    if (key && new URL(req.url, 'http://x').searchParams.get('check') === '1') {
      try { deepseek = { ...deepseek, ...(await deepseekBalance(key)) }; } catch { deepseek.error = '连不上 DeepSeek，检查一下网络'; }
    }
    return sendJson(res, 200, { deepseek, pexels: { filled: !!process.env.PEXELS_API_KEY, masked: mask(process.env.PEXELS_API_KEY || '') } });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
  const body = await readJson(req);
  const out = {};
  for (const [field, envKey] of Object.entries(FIELDS)) {
    if (body[field] === undefined) continue;
    const v = String(body[field]).trim();
    if (v && !/^[\w.-]{8,200}$/.test(v)) return sendJson(res, 400, { error: '密钥格式不对：只能有字母、数字和 - _ .，检查一下有没有多复制空格或中文' });
    if (field === 'deepseekKey' && v) {
      if (!/^sk-/.test(v)) return sendJson(res, 400, { error: 'DeepSeek 密钥应该以 sk- 开头' });
      let check;
      try { check = await deepseekBalance(v); } catch { return sendJson(res, 502, { error: '连不上 DeepSeek，检查一下网络再保存' }); }
      if (!check.ok) return sendJson(res, 400, { error: check.error });
      out.deepseek = check;
    }
    writeEnvValue(ENV_FILE, envKey, v);
    process.env[envKey] = v;
    markFromEnvFile(envKey);
  }
  return sendJson(res, 200, { ok: true, ...out });
}
