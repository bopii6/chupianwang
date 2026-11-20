// 装成桌面软件后，客户数据放在单独的数据目录（CPW_DATA_DIR）。这里检查：数据写到那里，不写进程序文件夹；老数据能搬过去。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findLegacyDir, migrateLegacy } from '../lib/migrate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-test-'));
const DATA = path.join(TMP, 'data-dir');
const PORT = 20000 + Math.floor(Math.random() * 20000);
let server;

before(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, '.env'), 'PEXELS_API_KEY=from-data-dir\n');
  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], { cwd: TMP, env: { ...process.env, CPW_DATA_DIR: DATA, HOST: '', DEEPSEEK_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/status`)).ok) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务没启动起来');
});
after(async () => {
  if (server && server.exitCode === null) await new Promise((r) => { server.once('exit', r); server.kill(); });
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows 偶尔还占着，临时文件夹系统会清 */ }
});

test('客户数据写到数据目录', async () => {
  const s = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json();
  assert.equal(s.stock, true, '.env 要从数据目录读');
  for (const d of ['works', path.join('文案库', '样本'), path.join('data', 'users'), path.join('.cache', 'tts')]) {
    assert.ok(fs.existsSync(path.join(DATA, d)), d);
  }
  const w = await (await fetch(`http://127.0.0.1:${PORT}/api/works`)).json();
  assert.deepEqual(w.items ?? w.works ?? [], []);
});

test('从老项目文件夹搬数据：只复制客户数据，已有的不覆盖', async () => {
  const old = path.join(TMP, 'old-project');
  const to = path.join(TMP, 'new-data');
  fs.mkdirSync(path.join(old, 'works'), { recursive: true });
  fs.mkdirSync(path.join(old, '文案库', '样本'), { recursive: true });
  fs.mkdirSync(path.join(old, 'data', 'users'), { recursive: true });
  fs.mkdirSync(path.join(old, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(old, 'works', 'a.mp4'), 'video');
  fs.writeFileSync(path.join(old, '文案库', '样本', 's1.json'), '{}');
  fs.writeFileSync(path.join(old, 'data', 'users', 'u.json'), '{}');
  fs.writeFileSync(path.join(old, '.env'), 'DEEPSEEK_API_KEY=old\n');
  fs.writeFileSync(path.join(old, 'server.js'), '');
  fs.mkdirSync(to, { recursive: true });
  fs.writeFileSync(path.join(to, '.env'), 'DEEPSEEK_API_KEY=new\n');

  const r = await migrateLegacy(old, to);
  assert.ok(r.copied >= 3);
  assert.equal(fs.readFileSync(path.join(to, 'works', 'a.mp4'), 'utf8'), 'video');
  assert.ok(fs.existsSync(path.join(to, '文案库', '样本', 's1.json')));
  assert.ok(fs.existsSync(path.join(to, 'data', 'users', 'u.json')));
  assert.match(fs.readFileSync(path.join(to, '.env'), 'utf8'), /new/, '已有的 .env 不能被覆盖');
  assert.ok(!fs.existsSync(path.join(to, 'node_modules')), '程序文件不搬');
  assert.ok(fs.existsSync(path.join(old, 'works', 'a.mp4')), '老文件留着，不删');
  assert.equal((await migrateLegacy(old, to)).skipped, true, '搬过一次就不再搬');
});

test('从 Claude 口令里找到老项目文件夹', () => {
  const old = path.join(TMP, '老项目');
  fs.mkdirSync(path.join(old, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(old, 'server.js'), '');
  const md = path.join(TMP, 'CLAUDE.md');
  fs.writeFileSync(md, `随便什么\n<!-- 微信出片:开始 -->\n- 运行 \`node "${path.join(old, 'scripts', 'open.mjs')}" --stop\`\n<!-- 微信出片:结束 -->\n`);
  assert.equal(findLegacyDir([md]), old);
  assert.equal(findLegacyDir([path.join(TMP, '没有.md')]), null);
});

test('设置：不回传完整密钥，格式不对的密钥不保存', async () => {
  const base = `http://127.0.0.1:${PORT}/api/settings`;
  const g = await (await fetch(base)).json();
  assert.equal(g.pexels.filled, true);
  assert.doesNotMatch(JSON.stringify(g), /from-data-dir/);
  const post = (body) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify(body) });
  // Origin 和 Host 不一致（fetch 的 Host 是 127.0.0.1:端口），也算本机
  assert.equal((await post({ deepseekKey: '你好 世界' })).status, 400);
  assert.equal((await post({ deepseekKey: 'abc123456789' })).status, 400, '不是 sk- 开头');
  assert.match(fs.readFileSync(path.join(DATA, '.env'), 'utf8'), /^PEXELS_API_KEY=from-data-dir$/m, '失败时 .env 不能被改');
  const ok = await post({ pexelsKey: 'newpexelskey123' });
  assert.equal(ok.status, 200);
  const env = fs.readFileSync(path.join(DATA, '.env'), 'utf8');
  assert.match(env, /^PEXELS_API_KEY=newpexelskey123$/m);
  assert.equal(env.match(/PEXELS_API_KEY/g).length, 1, '改原来那一行，不重复加');
});

test('.env 改一行时其它行原样保留', async () => {
  const { writeEnvValue } = await import('../lib/settings.js');
  const f = path.join(TMP, 'x.env');
  fs.writeFileSync(f, '# 注释\nA=1\nDEEPSEEK_API_KEY=old\nB=2');
  writeEnvValue(f, 'DEEPSEEK_API_KEY', 'sk-new');
  writeEnvValue(f, 'C', '3');
  assert.equal(fs.readFileSync(f, 'utf8'), '# 注释\nA=1\nDEEPSEEK_API_KEY=sk-new\nB=2\nC=3\n');
});
