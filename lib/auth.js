// 邮箱验证码登录
// 流程：填邮箱 → 发 6 位验证码到邮箱 → 填验证码 → 登录（浏览器记住 30 天）
// 发邮件用 SMTP（.env 里配置）；没配置时是“开发模式”：验证码打印在服务端日志里，本机访问时页面上也直接显示。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const USER_DIR = path.join(DATA, 'users');
fs.mkdirSync(USER_DIR, { recursive: true });

const TRIAL = 3;                      // 新用户免费试做条数
const SESSION_DAYS = 30;
const CODE_TTL = 10 * 60e3;           // 验证码 10 分钟有效
const RESEND_GAP = 60e3;              // 同一邮箱 60 秒内只能发一次
const MAX_TRIES = 5;                  // 一个验证码最多试 5 次
const IP_LIMIT = 20;                  // 同一 IP 每小时最多发 20 次
const COOKIE = 'cpw_sid';

// 签名密钥：优先用 .env 的 SESSION_SECRET；没有就生成一个存在 data/ 下（重启后登录状态不丢）
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA, '.session-secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(f, 'utf8').trim();
}
const SECRET = secret();
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const userId = (email) => crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
const userFile = (id) => path.join(USER_DIR, id + '.json');

async function readUser(id) {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  try { return JSON.parse(await fsp.readFile(userFile(id), 'utf8')); } catch { return null; }
}
async function writeUser(u) {
  const f = userFile(u.id); const tmp = f + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(u, null, 2)); await fsp.rename(tmp, f);
}

// ---------- 发邮件 ----------
let transport = null;
async function mailer() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  return transport;
}
async function sendCodeMail(email, code) {
  const t = await mailer();
  if (!t) { console.log(`[登录·开发模式] ${email} 的验证码：${code}`); return false; }
  await t.sendMail({
    from: process.env.MAIL_FROM || `出片王 <${process.env.SMTP_USER}>`,
    to: email,
    subject: `出片王登录验证码：${code}`,
    text: `你的登录验证码是 ${code}，10 分钟内有效。\n如果不是你本人操作，忽略这封邮件就好。`,
    html: `<div style="font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;max-width:420px;margin:24px auto;padding:28px;border-radius:16px;background:#f6f5f2;color:#141310">
      <div style="font-weight:800;font-size:17px">出片王</div>
      <p style="color:#57544e;margin:18px 0 8px">你的登录验证码</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#ff5a1f">${code}</div>
      <p style="color:#908c84;font-size:13px;margin-top:18px">10 分钟内有效。如果不是你本人操作，忽略这封邮件就好。</p></div>`,
  });
  return true;
}

// ---------- 验证码（内存里，重启即失效，没关系） ----------
const codes = new Map();   // email -> { hash, exp, sent, tries }
const ipHits = new Map();  // ip -> [时间...]
const hashCode = (email, code) => sign(`code:${email}:${code}`);
setInterval(() => { const now = Date.now(); for (const [k, v] of codes) if (now > v.exp) codes.delete(k); }, 60e3).unref();

const isLoopback = (req) => {
  const ip = req.socket.remoteAddress || '';
  return (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'];
};
const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');

// ---------- 登录状态（签名 cookie） ----------
function readCookie(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [id, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!id || !exp || !sig) return null;
  const good = sign(`${id}.${exp}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Date.now() > Number(exp)) return null;
  return id;
}
function setCookie(res, req, id) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const v = `${id}.${exp}`;
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(`${v}.${sign(v)}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

/** 当前登录的用户；没登录返回 null */
export async function currentUser(req) {
  const id = readCookie(req);
  return id ? readUser(id) : null;
}
/** 试用额度：试用用户每成功生成一条扣 1 条；开通了的不限条数 */
export const hasQuota = (u) => !u || u.plan !== 'trial' || (u.trialLeft ?? 0) > 0;
export async function useQuota(u) {
  if (!u || u.plan !== 'trial') return u;
  const fresh = (await readUser(u.id)) || u; // 重新读一遍，两个标签页同时生成也不会多扣或少扣
  fresh.trialLeft = Math.max(0, (fresh.trialLeft ?? 0) - 1);
  await writeUser(fresh);
  return fresh;
}
const publicUser = (u) => (u ? { email: u.email, trialLeft: u.trialLeft, plan: u.plan } : null);

export async function handleAuth(req, res, pathname, { readJson, sendJson }) {
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    return sendJson(res, 200, { user: publicUser(await currentUser(req)), mail: !!process.env.SMTP_HOST });
  }
  if (req.method === 'POST' && pathname === '/api/auth/send-code') {
    const email = normEmail((await readJson(req)).email);
    if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: '邮箱格式不对，检查一下' });
    const now = Date.now();
    const prev = codes.get(email);
    if (prev && now - prev.sent < RESEND_GAP) return sendJson(res, 429, { error: `发得太快了，${Math.ceil((RESEND_GAP - (now - prev.sent)) / 1000)} 秒后再试`, wait: Math.ceil((RESEND_GAP - (now - prev.sent)) / 1000) });
    const ip = clientIp(req);
    const hits = (ipHits.get(ip) || []).filter((t) => now - t < 3600e3);
    if (hits.length >= IP_LIMIT) return sendJson(res, 429, { error: '验证码发得太多了，过一小时再试' });
    hits.push(now); ipHits.set(ip, hits);
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    codes.set(email, { hash: hashCode(email, code), exp: now + CODE_TTL, sent: now, tries: 0 });
    let mailed;
    try { mailed = await sendCodeMail(email, code); } catch (e) {
      codes.delete(email);
      console.error('发验证码邮件失败', e);
      return sendJson(res, 502, { error: '验证码邮件没发出去，稍后再试' });
    }
    // 开发模式（没配 SMTP）且是本机访问：直接把验证码给页面，方便自己测试
    return sendJson(res, 200, { ok: true, wait: RESEND_GAP / 1000, ...(!mailed && isLoopback(req) ? { devCode: code } : {}) });
  }
  if (req.method === 'POST' && pathname === '/api/auth/verify') {
    const body = await readJson(req);
    const email = normEmail(body.email); const code = String(body.code || '').replace(/\D/g, '');
    const c = codes.get(email);
    if (!c || Date.now() > c.exp) return sendJson(res, 400, { error: '验证码过期了，重新获取一个' });
    if (++c.tries > MAX_TRIES) { codes.delete(email); return sendJson(res, 400, { error: '试错太多次了，重新获取验证码' }); }
    const got = hashCode(email, code);
    if (got.length !== c.hash.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(c.hash))) return sendJson(res, 400, { error: '验证码不对，再看一眼邮件' });
    codes.delete(email);
    const id = userId(email);
    let u = await readUser(id);
    const isNew = !u;
    if (!u) u = { id, email, createdAt: new Date().toISOString(), plan: 'trial', trialLeft: TRIAL };
    u.lastLogin = new Date().toISOString();
    await writeUser(u);
    setCookie(res, req, id);
    return sendJson(res, 200, { user: publicUser(u), isNew });
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}
