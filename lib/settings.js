// 设置：填 AI 密钥
//   本地版（自己电脑）：写进数据目录的 .env，只有本机能改
//   公网版（getcut.cn）：每个客户填自己的 DeepSeek 密钥，加密存到他自己账号里，只用他自己的额度，我们不经手
//   GET  /api/settings   → 密钥填没填（只给头尾几位）、DeepSeek 余额
//   POST /api/settings   → { deepseekKey?, pexelsKey? }，DeepSeek 密钥会先试一下能不能用
import fs from 'node:fs';
import { ENV_FILE } from './paths.js';
import { encrypt, decrypt, readUser, writeUser } from './accounts.js';

const FIELDS = { deepseekKey: 'DEEPSEEK_API_KEY', pexelsKey: 'PEXELS_API_KEY' };
const KEY_RE = /^[\w.-]{8,200}$/;
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
  const info = d.balance_infos && d.balance_infos[0];
  return {
    ok: true,
    available: d.is_available !== false,
    balance: cny ? `${cny.total_balance} ${cny.currency === 'CNY' ? '元' : cny.currency}` : '',
    total: Number(info?.total_balance ?? 0),
  };
}

/** 某个账号自己的 DeepSeek 密钥（解密后）；没有返回空字符串 */
export function deepseekKeyOf(user) {
  return user?.keys?.deepseek ? decrypt(user.keys.deepseek) : '';
}
export function pexelsKeyOf(user) {
  return user?.keys?.pexels ? decrypt(user.keys.pexels) : '';
}

// 校验并保存一把新密钥，返回给页面看的提示（余额等）
async function saveKey(req, res, sendJson, field, value) {
  const v = String(value).trim();
  if (v && !KEY_RE.test(v)) return { error: '密钥格式不对：只能有字母、数字和 - _ .，检查一下有没有多复制空格或中文' };
  if (field === 'deepseekKey' && v) {
    if (!/^sk-/.test(v)) return { error: 'DeepSeek 密钥应该以 sk- 开头' };
    let check;
    try { check = await deepseekBalance(v); } catch { return { error: '连不上 DeepSeek，检查一下网络再保存' }; }
    if (!check.ok) return { error: check.error };
    return { field, value: v, info: check };
  }
  return { field, value: v };
}

export async function handleSettings(req, res, { readJson, sendJson, markFromEnvFile, hosted = false, user = null }) {
  // ---------- 公网版：每个客户自己的密钥 ----------
  if (hosted) {
    if (!user) return sendJson(res, 401, { error: '先登录一下' });
    const params = new URL(req.url, 'http://x').searchParams;
    if (req.method === 'GET') {
      const ds = deepseekKeyOf(user); const px = pexelsKeyOf(user);
      let deepseek = { filled: !!ds, masked: mask(ds) };
      if (ds && params.get('check') === '1') {
        try { deepseek = { ...deepseek, ...(await deepseekBalance(ds)) }; } catch { deepseek.error = '连不上 DeepSeek，检查一下网络'; }
      }
      return sendJson(res, 200, {
        hosted: true,
        account: { username: user.username, name: user.name || '', expiresAt: user.expiresAt || '' },
        deepseek, pexels: { filled: !!px, masked: mask(px) },
      });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
    const body = await readJson(req);
    const fresh = { ...(user.keys || {}) };
    const out = {};
    for (const [field, store] of [['deepseekKey', 'deepseek'], ['pexelsKey', 'pexels']]) {
      if (body[field] === undefined) continue;
      const r = await saveKey(req, res, sendJson, field, body[field]);
      if (r.error) return sendJson(res, 400, { error: r.error });
      fresh[store] = r.value ? encrypt(r.value) : '';
      if (r.info) out.deepseek = r.info;
    }
    const updated = await readUser(user.id);
    updated.keys = fresh;
    await writeUser(updated);
    return sendJson(res, 200, { ok: true, ...out });
  }

  // ---------- 本地版：还是写 .env（只有本机） ----------
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
    const r = await saveKey(req, res, sendJson, field, body[field]);
    if (r.error) return sendJson(res, 400, { error: r.error });
    if (r.info) out.deepseek = r.info;
    writeEnvValue(ENV_FILE, envKey, r.value);
    process.env[envKey] = r.value;
    markFromEnvFile(envKey);
  }
  return sendJson(res, 200, { ok: true, ...out });
}
