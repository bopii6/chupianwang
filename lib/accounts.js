// 账号系统（公网版用）：管理员开号 → 客户用账号密码登录
// 每个账号一个文件夹：data/users/<id>/
//   user.json   账号资料（密码哈希、自己的 DeepSeek 密钥（加密存）、到期日、启用状态）
//   works/      他自己的成片
//   文案库/      他自己的文案样本、回收站
//   uploads/    他自己上传的视频临时文件
// 密码用 scrypt 加盐哈希，密钥用 AES-256-GCM 加密，源码和备份里都看不到明文。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { USERS_DATA } from './paths.js';

const ROOT = path.join(USERS_DATA, 'users');
const TRASH = path.join(USERS_DATA, '_已删除账号');
fs.mkdirSync(ROOT, { recursive: true });

const ID_RE = /^[0-9a-f]{24}$/;
const USERNAME_RE = /^[\w.@+\-\u4e00-\u9fa5]{2,64}$/; // 字母数字下划线、点、@、+、横线、中文（手机号/邮箱/拼音都行）
const SCRYPT = { N: 16384, r: 8, p: 1, len: 32 };
// 试用账号：平台提供 AI 密钥，按次数限制（后台默认给这三档，接口允许 1–999 方便以后调整）
export const TRIAL_TIERS = [6, 12, 24];

/** 账号的 AI 方式：trial=试用（平台出 AI，限次数）；selfkey=自己填密钥（不限次数，老账号默认这个） */
export function planOf(u) { return u?.plan === 'trial' ? 'trial' : 'selfkey'; }
export function normalizeQuota(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 999) throw Object.assign(new Error('试用次数要在 1–999 之间'), { status: 400 });
  return n;
}
/** 试用进度：{ trial, plan, limit, used, left } */
export function quotaState(u) {
  const plan = planOf(u);
  if (plan !== 'trial') return { trial: false, plan, limit: 0, used: u?.generations || 0, left: 0 };
  const limit = Math.max(0, Number(u.quota) || 0);
  const used = Math.max(0, Number(u.quotaUsed) || 0);
  return { trial: true, plan, limit, used, left: Math.max(0, limit - used) };
}

// ---------- 签名/加密用的密钥（和登录 cookie 共用一个） ----------
export function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(USERS_DATA, '.session-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}
let SECRET = null;
function secret() { return (SECRET ||= sessionSecret()); }

const KDF = () => crypto.createHash('sha256').update('chupianwang-key:' + secret()).digest();

/** 加密一段敏感文本（DeepSeek 密钥），格式 v1.<iv>.<tag>.<密文>，全是 base64url */
export function encrypt(text) {
  const s = String(text || '');
  if (!s) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KDF(), iv);
  const ct = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function decrypt(blob) {
  try {
    const [v, iv, tag, ct] = String(blob || '').split('.');
    if (v !== 'v1' || !iv || !tag || !ct) return '';
    const d = crypto.createDecipheriv('aes-256-gcm', KDF(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return ''; // 换了密钥或文件被改过，当没有
  }
}

// ---------- 密码 ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT.len, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [alg, n, salt, hash] = String(stored || '').split('$');
    if (alg !== 'scrypt') return false;
    const want = Buffer.from(hash, 'hex');
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), want.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch {
    return false;
  }
}
export function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < 6) return '密码至少 6 位';
  if (s.length > 72) return '密码太长了（最多 72 位）';
  if (/^\d+$/.test(s)) return '别用纯数字，加个字母更安全';
  return '';
}

// ---------- 读写 ----------
export const userDir = (id) => path.join(ROOT, String(id));
const fileOf = (id) => path.join(userDir(id), 'user.json');

export async function readUser(id) {
  if (!ID_RE.test(String(id || ''))) return null;
  try { return JSON.parse(await fsp.readFile(fileOf(id), 'utf8')); } catch { return null; }
}
export async function writeUser(u) {
  const dir = userDir(u.id);
  await fsp.mkdir(dir, { recursive: true });
  const f = fileOf(u.id);
  const tmp = f + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(u, null, 2), 'utf8');
  await fsp.rename(tmp, f);
  return u;
}

export async function listUsers() {
  let ids = [];
  try { ids = (await fsp.readdir(ROOT)).filter((n) => ID_RE.test(n)); } catch { return []; }
  const out = [];
  for (const id of ids) { const u = await readUser(id); if (u) out.push(u); }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function findByUsername(username) {
  const name = String(username || '').trim().toLowerCase();
  if (!name) return null;
  for (const u of await listUsers()) if (u.username === name) return u;
  return null;
}

const newId = () => crypto.randomBytes(12).toString('hex');

export async function createUser({ username, password, name = '', role = 'user', expiresAt = '', plan = '', quota = 0 }) {
  const uname = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(uname)) throw Object.assign(new Error('账号只能用 2–64 位字母、数字、下划线、点、@、横线或中文'), { status: 400 });
  const bad = passwordProblem(password);
  if (bad) throw Object.assign(new Error(bad), { status: 400 });
  if (await findByUsername(uname)) throw Object.assign(new Error('这个账号已经有了'), { status: 409 });
  const userPlan = plan === 'trial' ? 'trial' : 'selfkey';
  const userQuota = userPlan === 'trial' ? normalizeQuota(quota === '' || quota == null ? 6 : quota) : 0;
  const u = {
    id: newId(),
    username: uname,
    name: String(name || '').trim().slice(0, 40),
    role: role === 'admin' ? 'admin' : 'user',
    active: true,
    createdAt: new Date().toISOString(),
    lastLogin: '',
    expiresAt: String(expiresAt || '').slice(0, 10),
    pass: hashPassword(password),
    keys: {},
    plan: userPlan,
    quota: userQuota,
    quotaUsed: 0,
    generations: 0,
    lastUsedAt: '',
    ver: 1,
  };
  await writeUser(u);
  return u;
}

export async function updateUser(id, patch = {}) {
  const u = await readUser(id);
  if (!u) throw Object.assign(new Error('没有这个账号'), { status: 404 });
  if (patch.name != null) u.name = String(patch.name).trim().slice(0, 40);
  if (patch.expiresAt != null) u.expiresAt = String(patch.expiresAt || '').slice(0, 10);
  if (patch.active != null) {
    if (u.role === 'admin' && !patch.active) throw Object.assign(new Error('管理员账号不能停用自己'), { status: 400 });
    u.active = !!patch.active;
  }
  // 试用方式 / 次数：改成 trial 时没给次数就默认 6 次；改回 selfkey 就清掉次数限制
  if (patch.plan != null) {
    u.plan = patch.plan === 'trial' ? 'trial' : 'selfkey';
    if (u.plan === 'trial' && !u.quota) u.quota = normalizeQuota(patch.quota ?? 6);
  }
  if (patch.quota != null && u.plan === 'trial') u.quota = normalizeQuota(patch.quota);
  if (u.plan !== 'trial') u.quota = 0;
  if (patch.resetQuota) u.quotaUsed = 0;
  if (patch.password) {
    const bad = passwordProblem(patch.password);
    if (bad) throw Object.assign(new Error(bad), { status: 400 });
    u.pass = hashPassword(patch.password);
    u.ver = (u.ver || 1) + 1; // 老登录状态立刻失效
  }
  if (patch.keys) u.keys = { ...u.keys, ...patch.keys };
  await writeUser(u);
  return u;
}

export async function deleteUser(id) {
  const u = await readUser(id);
  if (!u) throw Object.assign(new Error('没有这个账号'), { status: 404 });
  if (u.role === 'admin') throw Object.assign(new Error('管理员账号不能删'), { status: 400 });
  await fsp.mkdir(TRASH, { recursive: true });
  await fsp.rename(userDir(id), path.join(TRASH, `${u.username}-${id}-${Date.now()}`)).catch(() => {});
  return true;
}

/** 账号现在能不能用：返回 { ok, code, error } */
export function userState(u) {
  if (!u) return { ok: false, code: 'login', error: '先登录' };
  if (!u.active) return { ok: false, code: 'disabled', error: '这个账号已停用，请联系管理员' };
  if (u.expiresAt && u.expiresAt < new Date().toISOString().slice(0, 10)) {
    return { ok: false, code: 'expired', error: `账号 ${u.expiresAt} 已到期，请联系管理员续期` };
  }
  return { ok: true };
}

/** 登录校验：账号密码对、账号可用 */
export async function login(username, password) {
  const u = await findByUsername(username);
  if (!u || !verifyPassword(password, u.pass)) return { error: '账号或密码不对', code: 'bad-password' };
  const st = userState(u);
  if (!st.ok) return { error: st.error, code: st.code };
  u.lastLogin = new Date().toISOString();
  await writeUser(u);
  return { user: u };
}

/** 记一次成功出片（管理员在后台能看到每人用了多少；试用账号同时扣一次试用次数） */
export async function noteGeneration(id) {
  const u = await readUser(id);
  if (!u) return null;
  u.generations = (u.generations || 0) + 1;
  if (planOf(u) === 'trial') u.quotaUsed = (Number(u.quotaUsed) || 0) + 1;
  u.lastUsedAt = new Date().toISOString();
  await writeUser(u).catch(() => {});
  return u;
}

// ---------- 对外能看到的字段（绝不含密码和密钥） ----------
export function publicUser(u) {
  if (!u) return null;
  const q = quotaState(u);
  return {
    id: u.id, username: u.username, name: u.name || '', role: u.role,
    active: u.active, expiresAt: u.expiresAt || '',
    hasKey: !!(u.keys && u.keys.deepseek),
    plan: q.plan, quota: q.limit, quotaUsed: q.used, quotaLeft: q.left,
    platformAi: u.role === 'admin' || q.trial, // 管理员和试用账号由平台出 AI，不用填密钥
    generations: u.generations || 0,
    createdAt: u.createdAt, lastLogin: u.lastLogin || '', lastUsedAt: u.lastUsedAt || '',
  };
}

// ---------- 启动时按 .env 建管理员 ----------
export async function bootstrapAdmin() {
  const username = String(process.env.ADMIN_USER || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!username || !password) return null;
  const existing = await findByUsername(username);
  if (existing) {
    if (existing.role !== 'admin') { existing.role = 'admin'; await writeUser(existing); }
    return existing;
  }
  const anyAdmin = (await listUsers()).some((u) => u.role === 'admin');
  if (anyAdmin) return null; // 已经有管理员了，不重复建
  const u = await createUser({ username, password, name: '管理员', role: 'admin' });
  console.log(`[账号] 已按 .env 创建管理员：${u.username}`);
  return u;
}

/** 账号数据目录（作品、文案库、上传） */
export function dataDirOf(id, sub) {
  return sub ? path.join(userDir(id), sub) : userDir(id);
}
