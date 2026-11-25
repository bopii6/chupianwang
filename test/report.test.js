// 出错上报的测试：本地版出错 → 自动发到我们服务器 → 后台能查
// 不需要联网：起一个假的“我们的服务器”，验证发出来的东西，以及服务器那边的接收和查询。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = 32000 + Math.floor(Math.random() * 8000); // 假 DeepSeek
const HOOK_PORT = API_PORT + 1; // 假“我们的服务器”（收上报）
const PORT = API_PORT + 2; // 被测的出片王

const received = []; // 假服务器收到的上报
let api;
let hook;
let server;
let serverOut = '';

function req(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({
      host: '127.0.0.1', port, method, path: pathname,
      headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* 不是 JSON */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on('error', reject);
    r.setTimeout(15000, () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

const waitFor = async (fn, ms = 6000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

before(async () => {
  // 假 DeepSeek：永远交一份坏 JSON，逼出 502
  api = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: '{"sections":[{"lines":["写到一半' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));
    });
  });
  await new Promise((r) => api.listen(API_PORT, '127.0.0.1', r));

  // 假“我们的服务器”：把收到的上报存起来
  hook = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { received.push(JSON.parse(body)); } catch { received.push({ bad: body }); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => hook.listen(HOOK_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '',
      NODE_ENV: 'test',
      CPW_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-report-')),
      DEEPSEEK_API_KEY: 'sk-test',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${API_PORT}`,
      REPORT_URL: `http://127.0.0.1:${HOOK_PORT}/api/support/report`,
      REPORT_DELAY_MS: '0', // 出完错立刻发，测试不用等
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  server.stdout.on('data', (d) => { out += d; serverOut += d; });
  server.stderr.on('data', (d) => { out += d; serverOut += d; });
  for (let i = 0; i < 80; i++) {
    try { if ((await req(PORT, 'GET', '/api/status')).status === 200) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务没启动起来：\n' + out);
});

after(() => { server?.kill(); api?.close(); hook?.close(); });

test('本地版出错会自己发到我们的服务器（客户不用点任何东西）', async () => {
  const r = await req(PORT, 'POST', '/api/script', { form: 'sketch-talk', input: '孩子写作业慢怎么办' });
  assert.equal(r.status, 502);

  const got = await waitFor(() => received.length > 0);
  assert.ok(got, `没收到上报。服务日志：\n${serverOut}`);
  const payload = received[0];
  assert.match(payload.install, /^[0-9a-z]+$/i, '要带机器编号');
  const e = payload.events?.[0];
  assert.ok(e, '要带出错记录');
  assert.equal(e.where, 'POST /api/script');
  assert.equal(e.status, 502);
  assert.match(e.local, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)$/, '要带本地时间，方便对时间点');
  assert.ok(!Number.isNaN(Date.parse(e.at)));
  assert.match(e.message, /没把稿子按格式写完/);
  // 不许把客户的内容带出去
  const all = JSON.stringify(payload);
  assert.doesNotMatch(all, /孩子写作业慢/, '上报里不能有客户写的文案');
});

test('服务器收下上报、后台能按天查', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const r = await req(PORT, 'POST', '/api/support/report', {
    install: 'abc123def456',
    version: '0.6.6',
    events: [{ at: new Date().toISOString(), local: '2026-11-25 16:20:00 (UTC+08:00)', kind: 'api', where: 'POST /api/script', status: 502, message: 'AI 连着几次没把稿子按格式写完（一般是内容太长被截断了）', version: '0.6.6' }],
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.n, 1);

  const q = await req(PORT, 'GET', `/api/support/errors?day=${day}`);
  assert.equal(q.status, 200);
  assert.ok(q.json.days.includes(day), '后台要能列出有记录的日期');
  const e = q.json.events.find((x) => x.install === 'abc123def456');
  assert.ok(e, '后台要能查到刚收的那条');
  assert.equal(e.where, 'POST /api/script');
  assert.equal(e.status, 502);
  assert.equal(q.json.installs, 1);
  assert.ok(q.json.byWhere['POST /api/script'] >= 1);
});

test('上报接口不认乱来的内容', async () => {
  assert.equal((await req(PORT, 'POST', '/api/support/report', { install: '', events: [] })).status, 400);
  assert.equal((await req(PORT, 'POST', '/api/support/report', { install: '好机器', events: [{ message: 'x' }] })).status, 400);
  assert.equal((await req(PORT, 'POST', '/api/support/report', { install: 'abc12345', events: [] })).status, 400);
  // 一次最多收 50 条，多了截断，不会把磁盘写爆
  const many = Array.from({ length: 120 }, (_, i) => ({ at: new Date().toISOString(), where: 'x', status: 500, message: 'm' + i }));
  const r = await req(PORT, 'POST', '/api/support/report', { install: 'abc12345', events: many });
  assert.equal(r.status, 200);
  assert.equal(r.json.n, 50);
});
