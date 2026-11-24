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
  hashPassword, verifyPassword, passwordProblem, sessionSecret, userState, publicUser, userDir, noteGeneration,
} from './accounts.js';

const SESSION_DAYS = 30;
const COOKIE = 'cpw_sid';
const SECRET = sessionSecret();
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

// ---------- 登录尝试限流（内存，重启清零） ----------
const LOGIN_MAX = 10;         // 同一 IP 10 分钟内最多试 10 次
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
const clientIp = (req) => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

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
    const r = await loginWithRetry(String(username || '').trim(), String(password || ''));
    if (r.error) return sendJson(res, 401, { error: r.error, code: r.code });
    setCookie(res, req, r.user);
    return sendJson(res, 200, { user: publicUser(r.user) });
  }

  // 退出
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return sendJson(res, 200, { ok: true });
  }

  // 自己改密码
  if (req.method === 'POST' && pathname === '/api/auth/password') {
    const u = await currentUser(req);
    if (!u) return sendJson(res, 401, { error: '先登录一下' });
    const { oldPassword, newPassword } = await readJson(req);
    if (!verifyPassword(String(oldPassword || ''), u.pass)) return sendJson(res, 400, { error: '原来的密码不对' });
    const bad = passwordProblem(newPassword);
    if (bad) return sendJson(res, 400, { error: bad });
    const fresh = await updateUser(u.id, { password: newPassword });
    setCookie(res, req, fresh); // 改完密码重新发一张票，别的设备上的登录同时失效
    return sendJson(res, 200, { ok: true });
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
        const u = await createUser({ username: b.username, password: b.password, name: b.name, expiresAt: b.expiresAt, role: b.role });
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
          await updateUser(id, { name: b.name, expiresAt: b.expiresAt, active: b.active, password: b.password });
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
  if (!u) return { error: '账号或密码不对', code: 'bad-password' };
  const st = userState(u);
  if (!st.ok) return { error: st.error, code: st.code };
  if (!verifyPassword(password, u.pass)) return { error: '账号或密码不对', code: 'bad-password' };
  u.lastLogin = new Date().toISOString();
  await writeUser(u);
  return { user: u };
}

export { hashPassword, verifyPassword, noteGeneration };
