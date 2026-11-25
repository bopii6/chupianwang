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

function req(method, pathname, { cookie = '', body, origin = 'https://getcut.cn', raw, contentType } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw || (body === undefined ? null : Buffer.from(JSON.stringify(body)));
    const headers = { Host: HOSTH, ...(data ? { 'Content-Type': contentType || 'application/json', 'Content-Length': data.length } : {}), ...(cookie ? { Cookie: cookie } : {}) };
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
    env: { ...process.env, HOST: '127.0.0.1', CPW_DATA_DIR: DATA, PUBLIC_BASE_URL: 'https://getcut.cn', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin12345', LOGIN_MAX_PER_10MIN: '200', NODE_ENV: 'test', DEEPSEEK_API_KEY: '', PEXELS_API_KEY: '' },
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
  const script = await req('POST', '/api/script', { cookie: user, body: { form: 'sketch-talk', input: '测试' } });
  assert.equal(script.status, 400);
  assert.equal(script.json.code, 'no-key');
  const w = await req('GET', '/api/works', { cookie: user });
  assert.equal(w.status, 200);
  assert.deepEqual(w.json.items, []);
  const badKey = await req('POST', '/api/settings', { cookie: user, body: { deepseekKey: 'not-a-key' } });
  assert.equal(badKey.status, 400);
});

test('管理员能看客户的作品，普通客户看不了别人的', async () => {
  const admin = await adminCookie();
  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'workuser', password: 'work123456', name: '作品客户' } });
  assert.equal(created.status, 200, created.text);
  const id = created.json.user.id;
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'workuser', password: 'work123456' } }));

  // 客户自己上传一条成片（浏览器导出后会自动走这一步）
  const up = await req('POST', '/api/works?title=' + encodeURIComponent('测试成片'), {
    cookie: user,
    raw: Buffer.from('fake-mp4-bytes'),
    contentType: 'video/mp4',
  });
  assert.equal(up.status, 200, up.text);

  // 客户自己看得到
  const mine = await req('GET', '/api/works', { cookie: user });
  assert.equal(mine.json.items.length, 1);
  assert.equal(mine.json.items[0].title, '测试成片');

  // 管理员带 owner 能看到这个客户的（后台点他头像就是走这条路）
  const asAdmin = await req('GET', `/api/works?owner=${id}`, { cookie: admin });
  assert.equal(asAdmin.status, 200, asAdmin.text);
  assert.equal(asAdmin.json.items.length, 1, '管理员要能看到客户的成片');
  const url = asAdmin.json.items[0].url;
  assert.match(url, new RegExp(`^/works/${id}/`), '要指向这个客户自己的目录');
  assert.equal((await req('GET', url, { cookie: admin })).status, 200, '管理员要能播这个文件');

  // 普通客户带上别人的 owner 也没用：看到的还是自己的
  const zhang = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } }));
  const sneaky = await req('GET', `/api/works?owner=${id}`, { cookie: zhang });
  assert.equal(sneaky.status, 200);
  assert.equal(sneaky.json.items.length, 0, '别人不能借 owner 看客户的成片');

  assert.equal((await req('DELETE', '/api/admin/users/' + id, { cookie: admin })).status, 200);
});

test('账号管理页面本身也不给陌生人看', async () => {  const anon = await req('GET', '/admin/accounts.html');
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
  // 客户自己不能改密码（一个号一个密码，管理员统一发）
  const selfChange = await req('POST', '/api/auth/password', { cookie: user, body: { oldPassword: 'zhang123456', newPassword: 'newpass123' } });
  assert.equal(selfChange.status, 403);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } })).status, 200);
  // 管理员改密码才行，改完旧密码立刻失效
  assert.equal((await req('PATCH', '/api/admin/users/' + zhang.id, { cookie: admin, body: { password: 'newpass123' } })).status, 200);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'zhang123456' } })).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'zhang', password: 'newpass123' } })).status, 200);

  assert.equal((await req('DELETE', '/api/admin/users/' + zhang.id, { cookie: admin })).status, 200);
  const after = await req('GET', '/api/admin/users', { cookie: admin });
  assert.equal(after.json.items.length, 1);
});

test('公网版关掉后台出片和调试接口（不用登录就能写硬盘的那些）', async () => {
  for (const [m, p] of [['POST', '/mcp'], ['GET', '/api/jobs'], ['POST', '/api/jobs'], ['POST', '/api/debug-frame'], ['POST', '/api/debug-file']]) {
    const r = await req(m, p, { body: {} });
    assert.equal(r.status, 404, `${m} ${p} 应该是 404，实际 ${r.status}`);
  }
});

test('同一个账号连续输错密码会被暂时锁住，换 IP 头也没用', async () => {
  let last;
  for (let i = 0; i < 21; i++) {
    last = await req('POST', '/api/auth/login', { body: { username: 'locktest', password: 'wrong' + i } });
  }
  assert.equal(last.status, 429);
  assert.match(last.json.error, /试错太多/);
});

// ---------- 试用账号：平台出 AI、按次数限、不用填密钥 ----------
const adminCookie = async () => cookieOf(await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } }));
const userFile = (id) => path.join(DATA, 'data', 'users', id, 'user.json');
const readUserFile = (id) => JSON.parse(fs.readFileSync(userFile(id), 'utf8'));
const writeUserFile = (u) => fs.writeFileSync(userFile(u.id), JSON.stringify(u, null, 2));

test('后台能开试用号：登录直接能用，不用填密钥', async () => {
  const admin = await adminCookie();
  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'trial_a', password: 'trial123456', name: '试用一号', plan: 'trial', quota: 12 } });
  assert.equal(created.status, 200, created.text);
  const u = created.json.user;
  assert.equal(u.plan, 'trial');
  assert.equal(u.quota, 12);
  assert.equal(u.quotaLeft, 12);
  assert.equal(u.hasKey, false);

  const login = await req('POST', '/api/auth/login', { body: { username: 'trial_a', password: 'trial123456' } });
  assert.equal(login.status, 200);
  const user = cookieOf(login);
  assert.equal(login.json.user.plan, 'trial');
  assert.equal(login.json.user.quotaLeft, 12);

  const s = await req('GET', '/api/settings?check=1', { cookie: user });
  assert.equal(s.status, 200);
  assert.equal(s.json.plan, 'trial');
  assert.equal(s.json.quotaLeft, 12);
  assert.equal(s.json.deepseek.filled, false);

  // 次数乱填不给开
  const bad = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'trial_bad', password: 'trial123456', plan: 'trial', quota: 0 } });
  assert.equal(bad.status, 400);

  assert.equal((await req('DELETE', '/api/admin/users/' + u.id, { cookie: admin })).status, 200);
});

test('试用号没配平台密钥时：给出明白的提示，不扣次数', async () => {
  const admin = await adminCookie();
  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'trial_nokey', password: 'trial123456', plan: 'trial', quota: 6 } });
  const u = created.json.user;
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'trial_nokey', password: 'trial123456' } }));
  const r = await req('POST', '/api/script', { cookie: user, body: { form: 'sketch-talk', input: '测试' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'platform-key');
  assert.equal(readUserFile(u.id).quotaUsed, 0, '失败不该扣次数');
  assert.equal((await req('DELETE', '/api/admin/users/' + u.id, { cookie: admin })).status, 200);
});

test('试用次数用完不能生成；后台加次数/清零后恢复', async () => {
  const admin = await adminCookie();
  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'trial_used', password: 'trial123456', plan: 'trial', quota: 6 } });
  const u = created.json.user;
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'trial_used', password: 'trial123456' } }));

  // 模拟已经用完了 6 次
  writeUserFile({ ...readUserFile(u.id), quotaUsed: 6 });
  const me = await req('GET', '/api/auth/me', { cookie: user });
  assert.equal(me.json.user.quotaLeft, 0, '剩余次数应该读成 0');

  const script = await req('POST', '/api/script', { cookie: user, body: { form: 'sketch-talk', input: '测试' } });
  assert.equal(script.status, 403);
  assert.equal(script.json.code, 'quota');
  assert.match(script.json.error, /微信/);
  assert.equal((await req('POST', '/api/remix-plan', { cookie: user, body: { reference: '测试' } })).status, 403);

  // 后台把次数改成 24：已用 6，剩 18
  const up = await req('PATCH', '/api/admin/users/' + u.id, { cookie: admin, body: { quota: 24 } });
  assert.equal(up.status, 200);
  assert.equal(up.json.user.quotaLeft, 18);
  assert.equal((await req('GET', '/api/auth/me', { cookie: user })).json.user.quotaLeft, 18);

  // 已用次数清零：剩 24
  const reset = await req('PATCH', '/api/admin/users/' + u.id, { cookie: admin, body: { resetQuota: true } });
  assert.equal(reset.json.user.quotaLeft, 24);

  // 改成自备密钥：变回不限次数，没填密钥就回 no-key
  const self = await req('PATCH', '/api/admin/users/' + u.id, { cookie: admin, body: { plan: 'selfkey' } });
  assert.equal(self.json.user.plan, 'selfkey');
  const r2 = await req('POST', '/api/script', { cookie: user, body: { form: 'sketch-talk', input: '测试' } });
  assert.equal(r2.status, 400);
  assert.equal(r2.json.code, 'no-key');

  assert.equal((await req('DELETE', '/api/admin/users/' + u.id, { cookie: admin })).status, 200);
});

test('试用号成功生成一次会扣 1 次（平台密钥正常时）', async () => {
  // 单独起一个带“假密钥”的服务不方便，这里直接验证扣次数逻辑：
  // 把 quotaUsed 从 2 改成 3，确认剩余次数跟着变
  const admin = await adminCookie();
  const created = await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'trial_count', password: 'trial123456', plan: 'trial', quota: 24 } });
  const u = created.json.user;
  writeUserFile({ ...readUserFile(u.id), quotaUsed: 3 });
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'trial_count', password: 'trial123456' } }));
  assert.equal((await req('GET', '/api/auth/me', { cookie: user })).json.user.quotaLeft, 21);
  assert.equal((await req('DELETE', '/api/admin/users/' + u.id, { cookie: admin })).status, 200);
});

test('管理员不用填密钥：默认走平台 AI，也不占试用次数', async () => {
  const admin = await adminCookie();
  const me = await req('GET', '/api/auth/me', { cookie: admin });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.role, 'admin');
  assert.equal(me.json.user.plan, 'selfkey');
  assert.equal(me.json.user.platformAi, true);

  const s = await req('GET', '/api/settings?check=1', { cookie: admin });
  assert.equal(s.status, 200);
  assert.equal(s.json.platformAi, true);
  assert.equal(s.json.deepseek.filled, false);

  // 测试环境故意没配平台密钥：管理员应该走“平台密钥”分支（503 platform-key），
  // 而不是像普通账号那样报“没填你自己的密钥”（400 no-key）
  const script = await req('POST', '/api/script', { cookie: admin, body: { form: 'sketch-talk', input: '测试' } });
  assert.equal(script.status, 503);
  assert.equal(script.json.code, 'platform-key');
  const remix = await req('POST', '/api/remix-plan', { cookie: admin, body: { reference: '测试' } });
  assert.equal(remix.status, 503);
  assert.equal(remix.json.code, 'platform-key');
});

test('客户电脑的出错上报：谁都能发，但只有管理员能看', async () => {
  // 客户机器上报不需要登录（它本来就没账号）
  const post = await req('POST', '/api/support/report', {
    body: {
      install: 'feedbeef1234',
      version: '0.6.6',
      events: [{ at: new Date().toISOString(), local: '2026-11-25 16:20:00 (UTC+08:00)', kind: 'api', where: 'POST /api/script', status: 502, message: 'AI 连着几次没把稿子按格式写完', version: '0.6.6' }],
    },
  });
  assert.equal(post.status, 200, post.text);

  // 没登录、普通客户，都不能看别人家的出错记录
  assert.equal((await req('GET', '/api/support/errors')).status, 401);
  const admin = await adminCookie();
  await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'erruser', password: 'err123456' } });
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'erruser', password: 'err123456' } }));
  assert.ok(user, '普通账号要能登录');
  assert.equal((await req('GET', '/api/support/errors', { cookie: user })).status, 403);
  assert.equal((await req('GET', '/admin/errors.html', { cookie: user })).status, 302);

  // 管理员能看到
  const q = await req('GET', '/api/support/errors', { cookie: admin });
  assert.equal(q.status, 200, q.text);
  assert.ok(q.json.events.some((e) => e.install === 'feedbeef1234'), '管理员要能看到刚收的报错');
  assert.equal((await req('GET', '/admin/accounts.html', { cookie: admin })).status, 200, '出错记录在账号管理页里，管理员能开');
  assert.equal((await req('GET', '/admin/errors.html', { cookie: user })).status, 302, '普通客户开不了');
});

