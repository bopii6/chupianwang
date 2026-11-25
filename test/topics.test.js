// 「客户在问什么」的测试：客户写的那句话会被记下来，只有管理员能看
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = 26000 + Math.floor(Math.random() * 6000);
const PORT = API_PORT + 1;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-topics-'));
const HOSTH = 'getcut.cn';
let server;
let api;

function req(method, pathname, { cookie = '', body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = {
      Host: HOSTH,
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length, Origin: 'https://getcut.cn' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    };
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
    r.setTimeout(20000, () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}
const cookieOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

before(async () => {
  // 假 DeepSeek：回一份能用的稿子
  api = http.createServer((rq, rs) => {
    rq.resume();
    rq.on('end', () => {
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end(JSON.stringify({
        choices: [{ message: { content: '{"title":"练字班怎么讲","sections":[{"lines":["练字不是把字写好看，是让孩子坐得住。","每天十分钟，比周末写两小时管用。"]}]}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));
    });
  });
  await new Promise((r) => api.listen(API_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      CPW_DATA_DIR: DATA,
      PUBLIC_BASE_URL: 'https://getcut.cn',
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'Admin12345',
      LOGIN_MAX_PER_10MIN: '200',
      NODE_ENV: 'test',
      DEEPSEEK_API_KEY: 'sk-test',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${API_PORT}`,
      REPORT_URL: 'off',
    },
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

after(() => { server?.kill(); api?.close(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('客户写了什么会被记下来，管理员能看、能按天查', async () => {
  const admin = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } }));
  await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'asker', password: 'ask123456', name: '提问的客户', plan: 'trial', quota: 6 } });
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'asker', password: 'ask123456' } }));
  // 试用号走平台密钥，正好可以出片
  const made = await req('POST', '/api/script', { cookie: user, body: { form: 'sketch-talk', input: '练字班怎么跟家长讲练字的好处', minutes: 1 } });
  assert.equal(made.status, 200, made.text);

  const q = await req('GET', '/api/support/topics', { cookie: admin });
  assert.equal(q.status, 200, q.text);
  const hit = q.json.items.find((x) => x.text.includes('练字班'));
  assert.ok(hit, `后台要能看到客户写的那句话，实际：${JSON.stringify(q.json.items)}`);
  assert.equal(hit.user, 'asker');
  assert.equal(hit.form, 'sketch-talk');
  assert.equal(hit.minutes, 1);
  assert.equal(hit.ok, true);
  assert.match(hit.local, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)$/);
  assert.equal(q.json.byUser?.asker, 1);
  assert.equal(q.json.days[0], new Date().toISOString().slice(0, 10));
});

test('客户的原话只有管理员能看：没登录 401、普通客户 403、页面 302', async () => {
  assert.equal((await req('GET', '/api/support/topics')).status, 401);
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'asker', password: 'ask123456' } }));
  assert.equal((await req('GET', '/api/support/topics', { cookie: user })).status, 403);
  assert.equal((await req('GET', '/admin/topics.html', { cookie: user })).status, 302);
  const admin = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } }));
  assert.equal((await req('GET', '/admin/topics.html', { cookie: admin })).status, 200);
});

test('生成失败也记下来：能看出卡在什么问题上的提问', async () => {
  const admin = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin12345' } }));
  await req('POST', '/api/admin/users', { cookie: admin, body: { username: 'asker2', password: 'ask223456', plan: 'trial', quota: 6 } });
  const user = cookieOf(await req('POST', '/api/auth/login', { body: { username: 'asker2', password: 'ask223456' } }));
  // 未知模板 → 400，但也该留一条，知道这个客户想做什么
  const bad = await req('POST', '/api/script', { cookie: user, body: { form: 'no-such-form', input: '暑假班怎么招生' } });
  assert.equal(bad.status, 400);
  const q = await req('GET', '/api/support/topics', { cookie: admin });
  const hit = q.json.items.find((x) => x.text.includes('暑假班'));
  assert.ok(hit, '失败的那次也要留下客户的原话');
  assert.equal(hit.ok, false);
  assert.ok(hit.error, '要带上失败原因');
});

test('留了总开关：TOPICS_LOG=off 可以整体关掉', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'topics.js'), 'utf8');
  assert.match(src, /TOPICS_LOG/, '要留一个总开关');
});
