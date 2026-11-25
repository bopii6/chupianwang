// AI 回复容错解析 + 自动重写的测试：npm test
// 前半部分不联网，只测“把 AI 的回复抠成对象”这件事；
// 后半部分起一个假的 DeepSeek（本地端口），验证第一轮写坏了会自动重写，客户不用自己点重试。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLoose } from '../lib/ai-json.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 一、解析 ----------
test('正常 JSON 直接过', () => {
  const r = parseLoose('{"a":1}');
  assert.equal(r.ok, true);
  assert.equal(r.value.a, 1);
});

test('裹着 ```json 代码块也能用', () => {
  const r = parseLoose('```json\n{"sections":[{"lines":["你好"]}]}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.value.sections[0].lines[0], '你好');
});

test('前后多说了一句话也能用（这是最常见的写法）', () => {
  const r = parseLoose('好的，这是你要的文案：\n{"title":"写作业"}\n希望对你有帮助！');
  assert.equal(r.ok, true);
  assert.equal(r.value.title, '写作业');
});

test('字符串里有没转义的换行，救回来', () => {
  // 注意中间那个换行是真实换行，标准 JSON 不允许，AI 偶尔就这么写
  const r = parseLoose('{"lines":["第一句\n第二句"]}');
  assert.equal(r.ok, true);
  assert.equal(r.value.lines[0], '第一句\n第二句');
});

test('字符串里没转义的英文双引号（中文引号被打成英文），救回来', () => {
  // AI 很爱这么写：他说："快点写" —— 中间那两个引号把 JSON 截断了
  const r = parseLoose('{"lines":["他说："快点写"，孩子反而不动了"]}');
  assert.equal(r.ok, true);
  assert.equal(r.value.lines[0], '他说："快点写"，孩子反而不动了');
});

test('结尾多了逗号，救回来', () => {
  const r = parseLoose('{"lines":["a","b",],}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.lines, ['a', 'b']);
});

test('写到一半被截断，认得出来（不是“格式错”，是“太长”）', () => {
  const r = parseLoose('{"sections":[{"lines":["孩子写作业慢');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'truncated');
});

test('截断正好停在里层的 } 上也认得出', () => {
  const r = parseLoose('{"sections":[{"lines":["孩子写作业慢"],"vis":{"type":"badge"}');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'truncated');
});

test('空回复认得出来', () => {
  assert.equal(parseLoose('').reason, 'empty');
  assert.equal(parseLoose('   ').reason, 'empty');
  assert.equal(parseLoose(null).reason, 'empty');
});

test('纯文字、不是 JSON', () => {
  assert.equal(parseLoose('抱歉，我无法完成这个请求。').reason, 'invalid');
});

// ---------- 二、自动重写（假 DeepSeek） ----------
const API_PORT = 30000 + Math.floor(Math.random() * 15000);
const PORT = API_PORT + 1;
const fake = { hits: 0, mode: 'good' }; // mode: broken-then-good / always-broken
let api;
let server;
let serverOut = ''; // 服务进程的日志（桌面版里它会写进 server.log，诊断信息带的就是它）

const SCRIPT_OK = JSON.stringify({
  title: '写作业慢',
  sections: [{ lines: ['孩子写作业慢，别急着催，先看他卡在哪一步。', '读不懂题就陪他读一遍，手跟不上脑子就让他先说一说。'] }],
});

before(async () => {
  api = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      fake.hits++;
      const ok = fake.mode === 'broken-then-good' && fake.hits > 1;
      const content = ok ? SCRIPT_OK : '{"sections":[{"lines":["孩子写作业慢，别急着催';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content }, finish_reason: ok ? 'stop' : 'length' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, prompt_cache_hit_tokens: 0 },
      }));
    });
  });
  await new Promise((r) => api.listen(API_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, HOST: '', CPW_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-aijson-')), DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: `http://127.0.0.1:${API_PORT}`, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  server.stdout.on('data', (d) => { out += d; serverOut += d; });
  server.stderr.on('data', (d) => { out += d; serverOut += d; });
  for (let i = 0; i < 80; i++) {
    if (server.exitCode != null) break;
    try { if ((await get('/api/status')).status === 200) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务没启动起来：\n' + out);
});

after(() => { server?.kill(); api?.close(); });

function get(pathname) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method: 'GET', path: pathname, headers: { Host: `localhost:${PORT}` } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.setTimeout(10000, () => r.destroy(new Error('timeout')));
    r.end();
  });
}

function post(body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const r = http.request({
      host: '127.0.0.1', port: PORT, method: 'POST', path: '/api/script',
      headers: { Host: `localhost:${PORT}`, Origin: `http://localhost:${PORT}`, 'Content-Type': 'application/json', 'Content-Length': data.length },
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
    r.setTimeout(30000, () => r.destroy(new Error('timeout')));
    r.write(data);
    r.end();
  });
}

test('第一轮 AI 写坏了，程序自己重写，客户拿到的是正常稿子', async () => {
  fake.hits = 0;
  fake.mode = 'broken-then-good';
  const r = await post({ form: 'sketch-talk', input: '孩子写作业慢怎么办' });
  assert.equal(r.status, 200, r.text);
  assert.ok(Array.isArray(r.json.sections) && r.json.sections.length, '应该返回完整稿子');
  assert.ok(fake.hits >= 2, `应该重写过，实际只请求了 ${fake.hits} 次`);
});

test('三轮都写不好也不卡死：给客户一句能看懂的话', async () => {
  fake.hits = 0;
  fake.mode = 'always-broken';
  const r = await post({ form: 'sketch-talk', input: '孩子写作业慢怎么办' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /没把稿子按格式写完/);
  assert.match(r.json.error, /时长调短|资料少放/);
  assert.equal(fake.hits, 3, '最多重写两轮，不能无限重试烧钱');
});

test('失败会写进日志和诊断信息：能看到几点几分、哪一步、什么原因', async () => {
  // 接上一条的失败：客户点「复制诊断信息」时，这些内容会一起发给我们
  const d = await get('/api/diag');
  const diag = JSON.parse(d.text);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(diag.version, pkg.version);

  assert.ok(Array.isArray(diag.recentErrors) && diag.recentErrors.length, '诊断信息里要有出错记录');
  const e = diag.recentErrors[0];
  assert.equal(e.where, 'POST /api/script');
  assert.equal(e.status, 502);
  assert.ok(!Number.isNaN(Date.parse(e.at)), '要有机器可读的时间');
  assert.match(e.local, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)$/, `本地时间格式不对：${e.local}`);
  assert.match(e.message, /没把稿子按格式写完/);
  assert.equal(e.version, pkg.version);
  assert.ok(e.install && diag.installId === e.install, '要有机器编号，方便认客户');

  assert.match(serverOut, /\[出错记录\][^\n]*POST \/api\/script 502/, '日志里也要留一行');
});
