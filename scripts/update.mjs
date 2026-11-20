// 更新出片王：拉最新版 → 补装依赖 → 重启；新版启动不起来就自动退回上一版
//   node scripts/update.mjs              更新
//   node scripts/update.mjs --rollback   退回到上一次更新前的版本
// 客户自己的数据（data/、works/、文案库/样本/）不在仓库里，更新和退回都不会碰到。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREV_FILE = path.join(ROOT, '.cache', 'previous-version');
const node = (script, ...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, stdio: 'inherit' }).status;
const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const head = () => git('rev-parse', 'HEAD').stdout.trim();
const version = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } };
const fail = (msg) => { console.log('\n× ' + msg); process.exit(1); };

if (git('--version').status !== 0) fail('这台电脑没装 Git，没法自动更新。请联系我们。');

// 重启服务；返回是否启动成功
function restart(openBrowser) {
  node('open.mjs', '--stop');
  return node('open.mjs', ...(openBrowser ? [] : ['--no-browser'])) === 0;
}

if (process.argv.includes('--rollback')) {
  const prev = fs.existsSync(PREV_FILE) ? fs.readFileSync(PREV_FILE, 'utf8').trim() : '';
  if (!/^[0-9a-f]{40}$/.test(prev)) fail('没有找到上一个版本的记录（还没更新过），不用退回。');
  if (prev === head()) fail('现在就是上一个版本，不用退回。');
  console.log('正在退回上一个版本…');
  const r = git('reset', '--keep', prev);
  if (r.status !== 0) fail('退回失败：' + (r.stderr || r.stdout).trim() + '\n请联系我们。');
  node('setup.mjs');
  console.log(restart(true) ? `\n✓ 已退回到 v${version()}` : '\n× 退回后还是没启动起来，请把 server.log 发给我们。');
  process.exit(0);
}

const before = head();
const vBefore = version();
console.log(`当前版本 v${vBefore}，正在检查更新…`);

const pull = git('pull', '--ff-only');
if (pull.status !== 0) {
  const text = (pull.stderr + pull.stdout).trim();
  const changed = git('status', '--porcelain', '--untracked-files=no').stdout.trim();
  if (changed) fail(`项目里有文件被改过，自动更新会把它们覆盖掉，所以先停下了。被改过的文件：\n${changed}\n请联系我们处理。`);
  if (/Could not resolve host|unable to access|timed out|Connection/i.test(text)) fail('连不上更新服务器，检查一下网络后再试。');
  fail('更新失败：\n' + text + '\n请把这段文字发给我们。');
}

const after = head();
if (after === before) {
  console.log(`已经是最新版 v${vBefore}`);
  node('setup.mjs');
  restart(true);
  process.exit(0);
}

fs.mkdirSync(path.dirname(PREV_FILE), { recursive: true });
fs.writeFileSync(PREV_FILE, before);
const log = git('log', '--no-merges', '--format=- %s', `${before}..${after}`).stdout.trim();
console.log(`\n已更新：v${vBefore} → v${version()}\n这次改了：\n${log}\n`);

node('setup.mjs');
if (restart(true)) {
  console.log(`\n✓ 更新完成，现在是 v${version()}。用着有问题可以说“退回出片王上一版”。`);
} else {
  console.log('\n新版本没启动起来，正在自动退回上一版…');
  const r = git('reset', '--keep', before);
  if (r.status !== 0) fail('自动退回也失败了：' + (r.stderr || r.stdout).trim() + '\n请联系我们。');
  node('setup.mjs');
  console.log(restart(true) ? `\n已退回到 v${vBefore}，可以照常使用。请把 server.log 发给我们看看新版哪里有问题。` : '\n× 退回后还是没启动起来，请把 server.log 发给我们。');
  process.exit(1);
}
