// 发布新版本：npm run release
// 先把 package.json 里的 version 改大（比如 0.2.0 → 0.2.1）并提交，然后运行。
// 顺序：检查 → 跑测试 → 打包 → 自检 → 隐私检查 → 上传到 GitHub 公开仓库（客户软件会自动更新）
// 任何一步不过就停下，不会把坏版本推给客户。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { owner, repo } = pkg.build.publish[0];
const TAG = `v${pkg.version}`;
const DIST = path.join(ROOT, 'dist');
const EXE = `chupianwang-setup-${pkg.version}.exe`;

const fail = (m) => { console.error(`\n× ${m}`); process.exit(1); };
const step = (m) => console.log(`\n== ${m}`);
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' && !path.isAbsolute(cmd), ...opts });
const must = (cmd, args) => { const r = sh(cmd, args, { stdio: 'inherit' }); if (r.status !== 0) fail(`没通过：${cmd} ${args.join(' ')}`); };

step(`准备发布 ${TAG} 到 ${owner}/${repo}`);
if (sh('git', ['status', '--porcelain']).stdout.trim()) fail('还有没提交的改动，先提交再发布（发布的版本要和代码对得上）');
if (sh('gh', ['release', 'view', TAG, '--repo', `${owner}/${repo}`]).status === 0) fail(`${TAG} 已经发布过了。先把 package.json 里的 version 改大`);

step('跑测试');
must('npm', ['test']);

step('打包（含精简版 Python）');
fs.rmSync(DIST, { recursive: true, force: true });
must(process.execPath, [path.join(ROOT, 'scripts', 'build-python.mjs')]);
must('npx', ['electron-builder', '--win', '--x64', '--publish', 'never']);
for (const f of [EXE, `${EXE}.blockmap`, 'latest.yml']) if (!fs.existsSync(path.join(DIST, f))) fail(`打包结果里缺 ${f}`);

step('隐私检查：安装包里不能有密钥、客户文案、作品、日志');
const bad = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (['样本', '回收站', 'works', 'users'].includes(e.name) && !p.includes('node_modules')) bad.push(p); else walk(p); }
    else if (e.name === '.env' || e.name === 'server.log' || /\.(mp4|mov)$/i.test(e.name)) bad.push(p);
  }
})(path.join(DIST, 'win-unpacked'));
const key = (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').match(/^DEEPSEEK_API_KEY=(\S{12,})/m)?.[1];
if (key) {
  const hit = sh('grep', ['-rl', '--', key, path.join(DIST, 'win-unpacked')]).stdout.trim();
  if (hit) bad.push(...hit.split('\n'));
}
if (bad.length) fail('安装包里混进了不该有的文件：\n' + bad.join('\n'));
console.log('✓ 干净');

step('自检：打开打包好的软件，检查导出、配音、听写模型、字体、页面报错');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpw-release-'));
sh(path.join(DIST, 'win-unpacked', `${pkg.productName}.exe`), [], { env: { ...process.env, CPW_DATA_DIR: path.join(tmp, 'data'), CPW_SELFTEST: path.join(tmp, 'out') }, timeout: 180_000 });
let r;
try { r = JSON.parse(fs.readFileSync(path.join(tmp, 'out', 'selftest.json'), 'utf8')); } catch { fail('自检没出结果（软件可能没启动起来），看 ' + path.join(tmp, 'data', 'server.log')); }
const p = r.page || {};
const problems = [
  r.error && `出错：${r.error}`,
  !p.h264 && '不能导出 H.264 视频',
  !p.aac && '不能编码 AAC 声音',
  !p.sharedArrayBuffer && '不能多线程转文字',
  !(p.tts?.keys?.length) && `配音不行：${JSON.stringify(p.tts)}`,
  !p.asrModel && '听写模型没带上',
  p.fontsMissing?.length && `缺字体文件 ${p.fontsMissing.length} 个，如 ${p.fontsMissing[0]}`,
  p.diag?.clientErrors?.length && `页面报错：${p.diag.clientErrors.map((e) => e.message).join('；')}`,
].filter(Boolean);
if (problems.length) fail('自检没通过：\n- ' + problems.join('\n- '));
console.log('✓ 自检通过，截图：' + path.join(tmp, 'out', 'selftest.png'));

step(`上传到 ${owner}/${repo}`);
// 发布仓库是公开的：说明写给客户看，从 发布说明.md 里取当前版本那一节，不用 git 提交记录（那是写给开发看的）
const notesAll = fs.existsSync(path.join(ROOT, '发布说明.md')) ? fs.readFileSync(path.join(ROOT, '发布说明.md'), 'utf8') : '';
const notes = (() => {
  const lines = notesAll.split(/\r?\n/); const start = lines.findIndex((l) => l.trim() === `## ${TAG}`);
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
})();
if (!notes) fail(`发布说明.md 里还没写 “## ${TAG}” 这一节（写给客户看这次更新了什么）`);
must('gh', ['release', 'create', TAG, '--repo', `${owner}/${repo}`, '--title', `出片王 ${TAG}`, '--notes', notes,
  path.join(DIST, EXE), path.join(DIST, `${EXE}.blockmap`), path.join(DIST, 'latest.yml')]);
sh('git', ['tag', TAG]);
sh('git', ['push', 'origin', TAG], { stdio: 'inherit' });
console.log(`\n✓ 已发布 ${TAG}。客户的软件 10 秒到 4 小时内会自动下载，下载好会提示重启。`);
console.log(`  新客户下载地址：https://github.com/${owner}/${repo}/releases/latest/download/${EXE}`);
