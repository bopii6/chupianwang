// 公网版（getcut.cn 那种）的冒烟测试：账号密码登录、管理员开号、每人自己的密钥、作品按账号隔离
// 不调 AI、不配音，几秒跑完。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 20000 + Math.floor(Math.random() * 20000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-hosted-'));
const HOSTH = 'getcut.cn';
let server;

function req(method, pathname, { cookie = '', body, origin = 'https://getcut.cn' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = { Host: HOSTH, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...(cookie ? { Cookie: cookie } : {}) };
    if (data) headers.Origin = origin;
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* 不是 JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on('error', reject);
    r.setTimeout(15000, () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}
const cookieOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, HOST: '127.0.0.1', CPW_DATA_DIR: DATA, PUBLIC_BASE_URL: 'https://getcut.cn', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin12345', LOGIN_MAX_PER_10MIN: '200', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  server.stdout.on('data', (d) => { out += d; });
  server.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await req('GET', '/api/status')).status === 200) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务没启动起来：\n' + out);
});
after(() => { server?.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('公网版标记 + 没登录不能看作品', async () => {
  const s = await req('GET', '/api/status');
  assert.equal(s.json.hosted, true);
  const w = await req('GET', '/api/works');
  assert.equal(w.status, 401);
  const api = await req('GET', '/api/auth/me');
  assert.equal(api.json.user, null);
  assert.equal(api.json.hosted, true);
});

test('管理员登录、开号、普通客户进不了后台', async () => {
  const bad = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'nope' } });
  assert.equal(bad.status, 401);

  const login = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.role, 'admin');
  const admin = cookieOf(login);

  const list = await req('GET', '/api/admin/users', { cookie: admin });
  assert.equal(list.status, 200);
  assert.equal(list.json.items.length, 1);

  const weak = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'zhang', password: '123' } });
  assert.equal(weak.status, 400);

  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'zhang', password: 'zhang123456', name: '张老师' } });
  assert.equal(created.status, 200);
  const dup = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'zhang', password: 'zhang123456' } });
  assert.equal(dup.status, 409);

  const userLogin = await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } });
  assert.equal(userLogin.status, 200);
  const user = cookieOf(userLogin);
  assert.equal(userLogin.json.user.hasKey, false);
  assert.equal((await req('GET', '/api/admin/users', { cookie: user })).status, 403);
  assert.equal((await req('GET', '/api/diag', { cookie: user })).status, 403);
  assert.equal((await req('GET', '/api/diag', { cookie: admin })).status, 200);
});

test('没填自己的密钥就写不了文案；作品墙按账号隔离', async () => {
  const userLogin = await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } });
  const user = cookieOf(userLogin);
  const s = await req('GET', '/api/settings?check=1', { cookie: user });
  assert.equal(s.json.hosted, true);
  assert.equal(s.json.deepseek.filled, false);
  const script = await req('POST', '/api/script', { cookie: user, body: { form: 'photo-talk', input: '测试' } });
  assert.equal(script.status, 400);
  assert.equal(script.json.code, 'no-key');
  const w = await req('GET', '/api/works', { cookie: user });
  assert.equal(w.status, 200);
  assert.deepEqual(w.json.items, []);
  const badKey = await req('POST', '/api/settings', { cookie: user, body: { deepseekKey: 'not-a-key' } });
  assert.equal(badKey.status, 400);
});

test('账号管理页面本身也不给陌生人看', async () => {
  const anon = await req('GET', '/admin/accounts.html');
  assert.equal(anon.status, 302);
  assert.match(anon.headers.location || '', /admin=1/);
  const adminLogin = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } });
  const admin = cookieOf(adminLogin);
  const page = await req('GET', '/admin/accounts.html', { cookie: admin });
  assert.equal(page.status, 200);
  assert.match(page.text, /账号管理/);
});

test('账号可以用邮箱/手机号当账号名', async () => {
  const adminLogin = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } });
  const admin = cookieOf(adminLogin);
  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'Teacher.Wang+1@example.com', password: 'wang123456', name: '王老师' } });
  assert.equal(created.status, 200);
  assert.equal(created.json.user.username, 'teacher.wang+1@example.com');
  const login = await req('POST', '/api/auth/login', { body: { username: 'Teacher.Wang+1@example.com', password: 'wang123456' } });
  assert.equal(login.status, 200);
  // 用完删掉，后面的测试按“只剩 admin + zhang”来数
  assert.equal((await req('DELETE', '/api/admin/users/' + created.json.user.id, { cookie: admin })).status, 200);
});

test('停用 / 到期 / 改密码 / 删除', async () => {
  const adminLogin = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } });
  const admin = cookieOf(adminLogin);
  const list = await req('GET', '/api/admin/users', { cookie: admin });
  const zhang = list.json.items.find((u) => u.username === 'zhang');

  await req('PATCH', '/api/admin/users/' + zhang.id, { cookie: admin, body: { active: false } });
  let r = await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } });
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'disabled');

  await req('PATCH', '/api/admin/users/' + zhang.id, { cookie: admin, body: { active: true, expiresAt: '2020-01-01' } });
  r = await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } });
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'expired');

  await req('PATCH', '/api/admin/users/' + zhang.id, { cookie: admin, body: { expiresAt: '' } });
  const login = await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } });
  assert.equal(login.status, 200);
  const user = cookieOf(login);
  const changed = await req('POST', '/api/auth/password', { cookie: user, body: { oldPassword: 'zhang123456', newPassword: 'newpass123' } });
  assert.equal(changed.status, 200);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } })).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'newpass123' } })).status, 200);

  assert.equal((await req('DELETE', '/api/admin/users/' + zhang.id, { cookie: admin })).status, 200);
  const after = await req('GET', '/api/admin/users', { cookie: admin });
  assert.equal(after.json.items.length, 1);
});
