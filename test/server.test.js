// 服务端冒烟测试：npm test
// 在随机端口起一个真的服务，检查访问限制、诊断信息、各接口的输入校验。不调 AI、不配音，不花钱，几秒跑完。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 20000 + Math.floor(Math.random() * 20000);
let server;

// 用 http.request 而不是 fetch：fetch 不让改 Host 头
function req(method, pathname, { headers = {}, body, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host, port: PORT, method, path: pathname, headers: { Host: `localhost:${PORT}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => {
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
const sameOrigin = { Origin: `http://localhost:${PORT}` };

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], { cwd: ROOT, env: { ...process.env, HOST: '', DEEPSEEK_API_KEY: '', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', (d) => { out += d; });
  server.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 80; i++) {
    try { if ((await req('GET', '/api/status')).status === 200) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务没启动起来：\n' + out);
});
after(() => server?.kill());

test('状态接口带版本号', async () => {
  const r = await req('GET', '/api/status');
  assert.equal(r.status, 200);
  assert.match(r.json.version, /^\d+\.\d+\.\d+$/);
});

test('首页能打开', async () => {
  const r = await req('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.text, /出片王/);
  assert.doesNotMatch(r.text, /微信出片/);
});

test('不能用 ../ 读到项目外面的文件', async () => {
  for (const p of ['/..%2f.env', '/%2e%2e/%2e%2e/package.json', '/vendor/fflate/..%2f..%2f..%2f.env']) {
    const r = await req('GET', p);
    assert.notEqual(r.status, 200, p);
  }
});

test('只听本机：局域网地址连不上', async (t) => {
  const lan = Object.values(os.networkInterfaces()).flat().find((x) => x && x.family === 'IPv4' && !x.internal);
  if (!lan) return t.skip('这台电脑没有局域网地址');
  await assert.rejects(req('GET', '/api/status', { host: lan.address }), /ECONNREFUSED|EHOSTUNREACH|timeout/);
});

test('不认 localhost 以外的域名（防 DNS 重绑定）', async () => {
  const r = await req('GET', '/api/status', { headers: { Host: `evil.example.com:${PORT}` } });
  assert.equal(r.status, 403);
});

test('别的网站发来的修改请求一律拒绝', async () => {
  const r1 = await req('POST', '/api/client-error', { headers: { Origin: 'https://evil.example.com' }, body: { message: 'x' } });
  assert.equal(r1.status, 403);
  const r2 = await req('POST', '/api/client-error', { headers: { 'Sec-Fetch-Site': 'cross-site' }, body: { message: 'x' } });
  assert.equal(r2.status, 403);
  const r3 = await req('POST', '/api/client-error', { headers: { Origin: 'null' }, body: { message: 'x' } });
  assert.equal(r3.status, 403);
});

test('页面报错会出现在诊断信息里，诊断信息不带邮箱和密钥', async () => {
  const msg = '测试报错-' + Date.now();
  const r = await req('POST', '/api/client-error', { headers: sameOrigin, body: { page: '/', message: msg, stack: 'at test' } });
  assert.equal(r.status, 200);
  const d = await req('GET', '/api/diag');
  assert.equal(d.status, 200);
  assert.ok(d.json.clientErrors.some((e) => e.message === msg));
  const all = JSON.stringify(d.json);
  assert.doesNotMatch(all, /sk-[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(all, /[\w.+-]+@[\w-]+\.(com|cn|net)/);
});

test('抓网页不能访问本机和内网', async () => {
  for (const url of ['http://127.0.0.1:5173/', 'http://192.168.1.1/', 'http://localhost/', 'http://[::1]/', 'file:///C:/Windows/win.ini']) {
    const r = await req('POST', '/api/fetch-url', { headers: sameOrigin, body: { url } });
    assert.equal(r.status, 400, url);
  }
});

test('配音接口校验输入', async () => {
  assert.equal((await req('POST', '/api/tts', { headers: sameOrigin, body: { text: '你好', voice: 'evil' } })).status, 400);
  assert.equal((await req('POST', '/api/tts', { headers: sameOrigin, body: { text: '你好', rate: '; rm -rf' } })).status, 400);
  assert.equal((await req('POST', '/api/tts-batch', { headers: sameOrigin, body: { texts: [] } })).status, 400);
  assert.equal((await req('GET', '/api/tts-file/' + '0'.repeat(40) + '.mp3')).status, 404);
});

test('没配 AI 密钥时写文案给出明白的提示', async () => {
  const r = await req('POST', '/api/script', { headers: sameOrigin, body: { form: 'sketch-talk', input: '测试' } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /AI 密钥/);
});

test('写文案拒绝未知的形式（不能读别的文件）', async () => {
  const r = await req('POST', '/api/script', { headers: sameOrigin, body: { form: '../package', input: '测试' } });
  assert.equal(r.status, 400);
});

test('安全响应头 + 坏请求体回 400 而不是 500', async () => {
  const home = await req('GET', '/');
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.equal(home.headers['x-frame-options'], 'SAMEORIGIN');
  const bad = await req('POST', '/api/tts', { headers: sameOrigin, body: '{不是json' });
  assert.equal(bad.status, 400);
  const weird = await req('GET', '/%E0%A4%A');
  assert.ok(weird.status < 500, `乱码路径不该 500，实际 ${weird.status}`);
});

test('识图接口：别的网站不能调；没传文件、没密钥都给一句看得懂的话（不会真去请求 DeepSeek）', async () => {
  const cross = await req('POST', '/api/ocr', { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/octet-stream' }, body: 'x' });
  assert.equal(cross.status, 403);
  const empty = await req('POST', '/api/ocr', { headers: { ...sameOrigin, 'Content-Type': 'application/octet-stream', 'Content-Length': '0' } });
  assert.equal(empty.status, 400);
  assert.match(empty.json.error, /没收到文件/);
  const noKey = await req('POST', '/api/ocr', { headers: { ...sameOrigin, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('扫描件.png') }, body: 'fake-image-bytes' });
  assert.equal(noKey.status, 400);
  assert.equal(noKey.json.code, 'no-key');
});
