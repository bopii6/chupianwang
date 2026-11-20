// 打包用：做一个随安装包发布的精简版 Python（只带配音用的 edge-tts），客户电脑上不用装 Python
//   node scripts/build-python.mjs        → 生成 build/python/（打包时 electron-builder 会把它放进安装包）
// 微软改了配音接口时：把下面的 EDGE_TTS 升到新版本，重新打包发布即可。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY_VERSION = '3.12.10';
const EDGE_TTS = '7.3.1';
const ZIP_URL = `https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`;
const DL = path.join(ROOT, '.cache', 'build');
const ZIP = path.join(DL, path.basename(ZIP_URL));
const OUT = path.join(ROOT, 'build', 'python');
const SITE = path.join(OUT, 'Lib', 'site-packages');

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) { console.error(`\n× 失败：${cmd} ${args.join(' ')}`); process.exit(1); }
};

fs.mkdirSync(DL, { recursive: true });
if (!fs.existsSync(ZIP)) {
  console.log('下载 ' + ZIP_URL);
  const r = await fetch(ZIP_URL);
  if (!r.ok) { console.error('下载失败 ' + r.status); process.exit(1); }
  fs.writeFileSync(ZIP, Buffer.from(await r.arrayBuffer()));
}

console.log('解压到 ' + OUT);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// 用 Windows 自带的 tar（Git 带的那个不认 C: 盘符）；它又不认中文路径，所以在目标文件夹里用相对路径解压
{
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const r = spawnSync(tar, ['-xf', path.relative(OUT, ZIP)], { cwd: OUT, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) { console.error('× 解压失败'); process.exit(1); }
}

// 嵌入版默认不读 site-packages：在 ._pth 里加上，并打开 import site
const pth = fs.readdirSync(OUT).find((f) => f.endsWith('._pth'));
const pthFile = path.join(OUT, pth);
let text = fs.readFileSync(pthFile, 'utf8').replace(/^#\s*import site/m, 'import site');
if (!/Lib\\site-packages/.test(text)) text = text.replace(/^\.$/m, '.\r\nLib\\site-packages');
fs.writeFileSync(pthFile, text);

console.log(`安装 edge-tts ${EDGE_TTS}（只要现成的 Windows 64 位包，和 Python ${PY_VERSION} 配套）`);
fs.mkdirSync(SITE, { recursive: true });
const sysPy = process.env.PYTHON || 'python';
run(sysPy, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-compile', '--target', SITE,
  '--only-binary=:all:', '--platform', 'win_amd64', '--python-version', PY_VERSION.split('.').slice(0, 2).join(''), '--implementation', 'cp',
  `edge-tts==${EDGE_TTS}`]);

// 删掉用不着的，减小体积
for (const d of fs.readdirSync(SITE)) if (d.endsWith('.dist-info') || d === 'bin') fs.rmSync(path.join(SITE, d), { recursive: true, force: true });

const check = spawnSync(path.join(OUT, 'python.exe'), ['-c', 'import edge_tts, aiohttp, sys; print("Python", sys.version.split()[0], "edge-tts", edge_tts.__version__)'], { encoding: 'utf8' });
if (check.status !== 0) { console.error('× 精简版 Python 装好了但用不了：\n' + check.stderr); process.exit(1); }
const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`✓ ${check.stdout.trim()}，共 ${(size(OUT) / 2 ** 20).toFixed(1)} MB`);
