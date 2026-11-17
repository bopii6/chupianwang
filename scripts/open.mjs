// 打开微信出片：没在运行就在后台启动服务，然后用 Chrome / Edge 打开
//   node scripts/open.mjs          启动（已在运行就直接打开浏览器）
//   node scripts/open.mjs --stop   关掉后台服务
//   node scripts/open.mjs --no-browser  只启动不打开浏览器
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);
const URL_ = `http://localhost:${PORT}/`;
const PID_FILE = path.join(ROOT, '.cache', 'server.pid');
const LOG = path.join(ROOT, 'server.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function alive() {
  try { const r = await fetch(`${URL_}api/status`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

if (process.argv.includes('--stop')) {
  const pid = fs.existsSync(PID_FILE) ? Number(fs.readFileSync(PID_FILE, 'utf8')) : 0;
  if (pid) { try { process.kill(pid); } catch {} fs.rmSync(PID_FILE, { force: true }); }
  console.log((await alive()) ? `端口 ${PORT} 上还有别的程序在运行（不是这个脚本启动的）` : '微信出片已关闭');
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'mp4-muxer'))) {
  console.log('第一次使用，先安装…');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'setup.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) console.log('安装还有问题（见上面），先尝试打开');
}

if (await alive()) console.log('微信出片已经在运行');
else {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  const out = fs.openSync(LOG, 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();
  let up = false;
  for (let i = 0; i < 40 && !(up = await alive()); i++) await sleep(250);
  if (!up) {
    console.log(`没启动起来，最后几行日志（${LOG}）：`);
    console.log(fs.readFileSync(LOG, 'utf8').split('\n').slice(-20).join('\n'));
    process.exit(1);
  }
  console.log('微信出片已启动');
}

if (!process.argv.includes('--no-browser')) {
  // 导出视频要用 Chrome / Edge（WebCodecs），优先 Chrome，没有就用 Windows 自带的 Edge
  if (process.platform === 'win32') {
    const chrome = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map((d) => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')).find((p) => fs.existsSync(p));
    if (chrome) spawn(chrome, [URL_], { detached: true, stdio: 'ignore' }).unref();
    else spawn('cmd', ['/c', 'start', '', 'msedge', URL_], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [URL_], { detached: true, stdio: 'ignore' }).unref();
  console.log('已在浏览器打开 ' + URL_);
}
