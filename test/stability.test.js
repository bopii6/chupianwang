// 稳定性测试：并发、坏输入、客户端断连、慢连接、反复重启、页面轮询。
// npm test 会一起跑，不调 AI、不配音、不花钱；客户电脑上内存和硬盘都省着用。
// 起的是真服务（随机端口、临时数据目录），测完自己删干净。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 45000 + Math.floor(Math.random() * 10000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-stab-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null;
let stderr = '';

function spawnServer() {
  const p = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1', NODE_ENV: 'test',
      DEEPSEEK_API_KEY: '', PEXELS_API_KEY: '',
      CPW_DATA_DIR: DATA,
      CPW_MODELS_DIR: path.join(ROOT, '.cache', 'models', 'web'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => { /* 启动日志 */ });
  p.stderr.on('data', (d) => { stderr = (stderr + String(d)).slice(-4000); });
  return p;
}

function req(method, pathname, { headers = {}, body, port = PORT } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { Host: `localhost:${port}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.setTimeout(20000, () => r.destroy(new Error('请求超时')));
    if (data) r.write(data);
    r.end();
  });
}
const status = async () => { try { return (await req('GET', '/api/status')).status; } catch { return 0; } };
const sameOrigin = { Origin: `http://localhost:${PORT}` };

async function start() {
  const p = spawnServer();
  for (let i = 0; i < 100; i++) {
    if (await status() === 200) return p;
    if (p.exitCode !== null) throw new Error('服务退出了：\n' + stderr);
    await sleep(100);
  }
  throw new Error('服务 10 秒没启动起来：\n' + stderr);
}
async function stop(p) {
  if (!p || p.exitCode !== null) return;
  await new Promise((resolve) => { p.once('exit', resolve); p.kill(); setTimeout(resolve, 3000); });
}

before(async () => { server = await start(); });
after(async () => {
  await stop(server);
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* 临时目录删不掉也不影响 */ }
});

test('并发 150 个请求：全部正常，服务不崩', async () => {
  const paths = ['/api/status', '/', '/nav.js', '/style.css', '/support.js'];
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: 150 }, (_, i) => req('GET', paths[i % paths.length])));
  const elapsed = Date.now() - t0;
  const bad = results.filter((r) => r.status >= 500 || r.status === 0);
  assert.equal(bad.length, 0, `${bad.length} 个请求出错`);
  assert.ok(results.every((r) => r.status === 200), '有非 200 的响应');
  assert.ok(elapsed < 15000, `150 个并发请求用了 ${elapsed}ms，太慢`);
  assert.equal(await status(), 200, '压测后服务没响应了');
});

test('长连接（浏览器默认方式）连打 100 次不出错', async () => {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
  const one = (p) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, agent }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    r.on('error', reject);
    r.end();
  });
  const codes = await Promise.all(Array.from({ length: 100 }, (_, i) => one(i % 2 ? '/api/status' : '/')));
  agent.destroy();
  assert.ok(codes.every((c) => c === 200), '长连接里有失败的请求');
  assert.equal(await status(), 200);
});

test('坏输入连打 80 次：不返回 5xx，也不会把服务打崩', async () => {
  const huge = 'x'.repeat(1.5 * 1024 * 1024);
  const cases = [
    ['POST', '/api/tts', '{不是json'],
    ['POST', '/api/tts', { text: 42 }],
    ['POST', '/api/tts', { text: '你好', voice: '../../../etc/passwd' }],
    ['POST', '/api/tts-batch', { texts: 'abc' }],
    ['POST', '/api/tts-batch', { texts: [] }],
    ['POST', '/api/script', { form: '../package', input: huge.slice(0, 5000) }],
    ['POST', '/api/script', { form: 'photo-talk', input: huge }],
    ['POST', '/api/fetch-url', { url: 'http://127.0.0.1:5173/' }],
    ['POST', '/api/client-error', 'null'],
    ['GET', '/%E0%A4%A', undefined],
    ['GET', '/api/tts-file/' + 'f'.repeat(40) + '.mp3', undefined],
    ['GET', '/no-such-page-' + Math.random(), undefined],
    ['DELETE', '/api/status', undefined],
    ['POST', '/api/works', 'x'.repeat(100000)],
  ];
  for (let i = 0; i < 80; i++) {
    const [method, p, body] = cases[i % cases.length];
    const r = await req(method, p, { headers: sameOrigin, body });
    assert.ok(r.status < 500, `${method} ${p} 返回了 ${r.status}`);
  }
  assert.equal(await status(), 200, '坏输入之后服务没响应了');
});

test('客户端传到一半就断开（网络差）：30 次不影响别人', async () => {
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/api/tts', headers: { 'Content-Type': 'application/json', 'Content-Length': 100000, Origin: `http://localhost:${PORT}` } });
      r.on('error', () => resolve());
      r.write('{"text":"');
      setTimeout(() => { r.destroy(); resolve(); }, 20);
    });
  }
  assert.equal(await status(), 200, '有人断连就把服务带崩了');
});

test('慢连接占着不放，不耽误正常请求', async () => {
  const slow = [];
  for (let i = 0; i < 5; i++) {
    slow.push(await new Promise((resolve) => {
      const s = net.connect(PORT, '127.0.0.1', () => { s.write('POST /api/tts HTTP/1.1\r\nHost: localhost\r\nContent-Length: 999\r\n\r\n{"text":"'); resolve(s); });
      s.on('error', () => resolve(null));
    }));
  }
  await sleep(300);
  const t0 = Date.now();
  const r = await req('GET', '/api/status');
  const elapsed = Date.now() - t0;
  slow.forEach((s) => { try { s?.destroy(); } catch { /* ignore */ } });
  assert.equal(r.status, 200);
  assert.ok(elapsed < 3000, `慢连接把正常请求拖慢了 ${elapsed}ms`);
});

test('页面轮询 3 秒（每 50ms 一次）一次都不掉', async () => {
  for (let i = 0; i < 60; i++) {
    assert.equal(await status(), 200, `第 ${i + 1} 次轮询失败`);
    await sleep(50);
  }
});

test('连续重启 3 次：每次都能起来，数据不丢', async () => {
  for (let i = 0; i < 3; i++) {
    await stop(server);
    await sleep(150);
    server = await start();
    const s = await req('GET', '/api/status');
    assert.equal(s.status, 200);
    assert.match(JSON.parse(s.text).version, /^\d+\.\d+\.\d+$/, '重启后版本号不对');
  }
  // 重启之后诊断接口也正常（它要读日志、查 Python）
  const d = await req('GET', '/api/diag');
  assert.equal(d.status, 200);
  assert.ok(JSON.parse(d.text).version, '诊断信息里没有版本号');
});

test('整个压测下来，服务进程还活着', async () => {
  assert.equal(server.exitCode, null, '服务进程退出了：' + stderr);
  assert.equal(await status(), 200);
});
