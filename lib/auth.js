// 登录 + 账号管理（公网版）
// 客户：管理员开好账号密码，客户用账号密码登录（浏览器记住 30 天）
// 管理员：后台开号 / 停用 / 改密码 / 改到期日 / 看每人用了多少
// 本地版（没设 PUBLIC_BASE_URL、没设 AUTH_REQUIRED）完全不启用这套，行为跟以前一样。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  readUser, writeUser, listUsers, findByUsername, createUser, updateUser, deleteUser,
  hashPassword, verifyPassword, sessionSecret, userState, publicUser, userDir, noteGeneration, quotaState,
} from './accounts.js';

const SESSION_DAYS = 30;
const COOKIE = 'cpw_sid';
const SECRET = sessionSecret();
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

// ---------- 登录尝试限流（内存，重启清零） ----------
const LOGIN_MAX = Number(process.env.LOGIN_MAX_PER_10MIN || 10); // 同一 IP 10 分钟内最多试几次（测试时调大）
const LOGIN_WINDOW = 600e3;
const attempts = new Map();   // ip -> [时间...]
function tooMany(ip) {
  const now = Date.now();
  const hits = (attempts.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW);
  attempts.set(ip, hits);
  if (hits.length >= LOGIN_MAX) return Math.ceil((LOGIN_WINDOW - (now - hits[0])) / 1000);
  hits.push(now);
  return 0;
}
// 同一个账号 10 分钟内最多输错几次（防有人换着 IP 猜同一个账号的密码）
const USER_MAX = Number(process.env.LOGIN_MAX_PER_USER_10MIN || 20);
const userFails = new Map(); // 账号名 -> [输错的时间...]
function userLocked(name) {
  const now = Date.now();
  const hits = (userFails.get(name) || []).filter((t) => now - t < LOGIN_WINDOW);
  if (hits.length) userFails.set(name, hits); else userFails.delete(name);
  return hits.length >= USER_MAX ? Math.ceil((LOGIN_WINDOW - (now - hits[0])) / 1000) : 0;
}
function noteFail(name) {
  if (!name) return;
  userFails.set(name, [...(userFails.get(name) || []), Date.now()]);
  if (userFails.size > 5000) userFails.clear();
}
// 访客 IP：只有请求是本机反代（Caddy/Nginx）转进来的，才信转发头；
// X-Forwarded-For 取最后一个（反代自己加上的那个），前面的客户可以随便伪造
function clientIp(req) {
  const peer = String(req.socket.remoteAddress || '');
  const fromProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
  if (!fromProxy) return peer;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || String(req.headers['x-real-ip'] || '').trim() || peer;
}
// 账号不存在时也算一遍密码，让“账号不存在”和“密码错”花的时间差不多，猜不出哪些账号存在
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

// ---------- 登录状态（签名 cookie） ----------
function readCookie(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [id, ver, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!id || !ver || !exp || !sig) return null;
  const good = sign(`${id}.${ver}.${exp}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Date.now() > Number(exp)) return null;
  return { id, ver: Number(ver) };
}
function setCookie(res, req, u) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const v = `${u.id}.${u.ver || 1}.${exp}`;
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(`${v}.${sign(v)}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

/** 当前登录的账号（原始对象，里面有密钥的密文）；没登录返回 null */
export async function currentUser(req) {
  const c = readCookie(req);
  if (!c) return null;
  const u = await readUser(c.id);
  if (!u || (u.ver || 1) !== c.ver) return null;
  return u;
}
/** 当前登录的账号 + 可用性检查：{ user, error, code, status } */
export async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) return { user: null, status: 401, code: 'login', error: '先登录一下' };
  const st = userState(u);
  if (!st.ok) return { user: null, status: 403, code: st.code, error: st.error };
  return { user: u, status: 200 };
}
export const isAdminUser = (u) => !!u && u.role === 'admin';

// ---------- 每个账号的用量（管理员后台看） ----------
async function dirStats(dir) {
  try {
    const names = await fsp.readdir(dir);
    let size = 0; let n = 0;
    for (const name of names) {
      try { const st = await fsp.stat(path.join(dir, name)); if (st.isFile()) { n++; size += st.size; } } catch { /* 刚删掉 */ }
    }
    return { n, size };
  } catch { return { n: 0, size: 0 }; }
}
async function adminView(u) {
  const base = userDir(u.id);
  const works = await dirStats(path.join(base, 'works'));
  const copies = await dirStats(path.join(base, '文案库', '样本'));
  return {
    ...publicUser(u),
    hasKey: !!u.keys?.deepseek,
    works: works.n, worksBytes: works.size, copies: copies.n,
    keys: {
      deepseek: u.keys?.deepseek ? '已填' : '',
      pexels: u.keys?.pexels ? '已填' : '',
    },
  };
}

// ---------- 路由 ----------
export async function handleAuth(req, res, pathname, { readJson, sendJson, hosted = false }) {
  // 当前账号
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const u = await currentUser(req);
    const st = u ? userState(u) : null;
    return sendJson(res, 200, { user: st?.ok ? publicUser(u) : null, hosted, error: st && !st.ok ? st.error : '' });
  }

  // 登录
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    if (!hosted) return sendJson(res, 400, { error: '这台电脑是本地版，不用登录' });
    const ip = clientIp(req);
    const wait = tooMany(ip);
    if (wait) return sendJson(res, 429, { error: `密码试错太多，${Math.ceil(wait / 60)} 分钟后再试`, wait });
    const { username, password } = await readJson(req);
    const name = String(username || '').trim().toLowerCase().slice(0, 64);
    const locked = userLocked(name);
    if (locked) return sendJson(res, 429, { error: `这个账号密码试错太多，${Math.ceil(locked / 60)} 分钟后再试`, wait: locked });
    const r = await loginWithRetry(name, String(password || ''));
    if (r.error) {
      if (r.code === 'bad-password') noteFail(name);
      return sendJson(res, 401, { error: r.error, code: r.code });
    }
    userFails.delete(name);
    setCookie(res, req, r.user);
    return sendJson(res, 200, { user: publicUser(r.user) });
  }

  // 退出
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return sendJson(res, 200, { ok: true });
  }

  // 密码只能管理员在后台改，客户自己不能改（客户提这个需求：一个号一个密码，由管理员统一发）
  if (req.method === 'POST' && pathname === '/api/auth/password') {
    return sendJson(res, 403, { error: '密码由管理员统一管理，需要改密码请联系你的管理员' });
  }

  // ---------- 管理员：账号管理 ----------
  if (pathname === '/api/admin/users' || pathname.startsWith('/api/admin/users/')) {
    const me = await currentUser(req);
    if (!isAdminUser(me)) return sendJson(res, 403, { error: '只有管理员能管账号' });

    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const users = await listUsers();
      const items = [];
      for (const u of users) items.push(await adminView(u));
      return sendJson(res, 200, { items, me: publicUser(me) });
    }
    if (req.method === 'POST' && pathname === '/api/admin/users') {
      const b = await readJson(req);
      try {
        const u = await createUser({ username: b.username, password: b.password, name: b.name, expiresAt: b.expiresAt, role: b.role, plan: b.plan, quota: b.quota });
        return sendJson(res, 200, { user: await adminView(u) });
      } catch (e) {
        return sendJson(res, e.status || 400, { error: e.message });
      }
    }
    const m = pathname.match(/^\/api\/admin\/users\/([0-9a-f]{24})$/);
    if (m) {
      const id = m[1];
      if (req.method === 'PATCH') {
        const b = await readJson(req);
        try {
          await updateUser(id, { name: b.name, expiresAt: b.expiresAt, active: b.active, password: b.password, plan: b.plan, quota: b.quota, resetQuota: !!b.resetQuota });
          const fresh = await readUser(id);
          return sendJson(res, 200, { user: await adminView(fresh) });
        } catch (e) {
          return sendJson(res, e.status || 400, { error: e.message });
        }
      }
      if (req.method === 'DELETE') {
        try { await deleteUser(id); return sendJson(res, 200, { ok: true }); } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
      }
    }
    return sendJson(res, 404, { error: '没有这个接口' });
  }

  return sendJson(res, 404, { error: 'not found' });
}

// 密码错的时候不区分“账号不存在”和“密码不对”，少给暴力破解留信息
async function loginWithRetry(username, password) {
  const u = await findByUsername(username);
  if (!u) { verifyPassword(password, DUMMY_HASH); return { error: '账号或密码不对', code: 'bad-password' }; }
  // 先核对密码再说账号状态：密码不对时不透露“这个账号存在但已停用/到期”
  if (!verifyPassword(password, u.pass)) return { error: '账号或密码不对', code: 'bad-password' };
  const st = userState(u);
  if (!st.ok) return { error: st.error, code: st.code };
  u.lastLogin = new Date().toISOString();
  await writeUser(u);
  return { user: u };
}

export { hashPassword, verifyPassword, noteGeneration, quotaState };
