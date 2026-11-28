// 一键取元宝 Cookie —— 本机/服务器上用，取一条能用的 yuanbao.tencent.com Cookie
//
// 用法：
//   node scripts/sph-login.mjs              开一个独立窗口打开元宝，自动把 Cookie 写进 wxcd 配置并重启它
//   node scripts/sph-login.mjs --headless   不开窗口（服务器/定时任务用，配合 --check 可以只体检）
//   node scripts/sph-login.mjs --check      只看现在能不能用，不改任何东西
//   node scripts/sph-login.mjs --restore    换回上一个备份的配置
//
// 环境变量：SPH_WXCD_DIR（抓包工具目录）、SPH_PROFILE（浏览器小配置目录）、SPH_LOGIN_PORT、SPH_LOCAL_API
// 原理：用 Chrome/Edge 的调试端口开一个独立小配置（不动你自己的浏览器），等元宝页面把 Cookie 写全，
//      通过 CDP 读出整条 Cookie（含 httpOnly），替掉 config.yaml 里 sphcookie 那一行。
// 注意：早读会拿到"看起来有、其实不能用"的残废 Cookie（表现为解析报「此内容暂时无法播放」），
//      所以这里会等 hy_token 和 _qimei_uuid42 出现才收工。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WXCD_DIR = process.env.SPH_WXCD_DIR || 'E:\\项目验证性测试poc\\tools\\wxcd\\bin';
const EXE = path.join(WXCD_DIR, 'wx_video_download.exe');
const CFG = path.join(WXCD_DIR, 'config.yaml');
const API = (process.env.SPH_LOCAL_API || 'http://127.0.0.1:2022').replace(/\/+$/, '');
const PROFILE = process.env.SPH_PROFILE || path.join(ROOT, '.cache', 'sph-browser');
const PORT = Number(process.env.SPH_LOGIN_PORT || 9333);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const HEADLESS = args.includes('--headless');

function findBrowser() {
  const cands = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return cands.find((p) => p && fs.existsSync(p)) || '';
}

async function status() {
  try {
    const r = await fetch(`${API}/api/scraper/platform/status`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const sph = (j?.data?.statuses || []).find((x) => x.key === 'wxchannels:sph') || {};
    return { ok: sph.available === true, reason: sph.reason || '' };
  } catch {
    return { ok: false, reason: '抓包工具没在跑' };
  }
}

async function restartWxcd() {
  if (process.platform === 'win32') {
    const kill = spawn('taskkill', ['/IM', 'wx_video_download.exe', '/F'], { stdio: 'ignore', windowsHide: true });
    await new Promise((r) => kill.on('close', r));
  } else {
    spawn('pkill', ['-f', 'wx_video_download'], { stdio: 'ignore' });
  }
  await sleep(2000);
  spawn(EXE, [], { cwd: WXCD_DIR, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// 通过 CDP 读浏览器里的 Cookie（包括 httpOnly，document.cookie 看不到）
async function cookiesViaCdp() {
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(5000) })).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, { resolve, reject });
    ws.send(JSON.stringify({ id: myId, method, params }));
    setTimeout(() => { if (pending.has(myId)) { pending.delete(myId); reject(new Error(`${method} 超时`)); } }, 15000);
  });
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('连不上浏览器调试端口'));
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    };
  });
  const { cookies } = await call('Storage.getCookies');
  ws.close();
  // 访问 yuanbao.tencent.com 时浏览器会带上 tencent.com 全域的 Cookie，整条抄下来最保险
  const mine = cookies.filter((c) => /(^|\.)tencent\.com$/.test(String(c.domain || '').replace(/^\./, '')));
  return { all: cookies, mine };
}

async function fetchCookie() {
  const browser = findBrowser();
  if (!browser) throw new Error('没找到 Chrome 或 Edge');
  fs.mkdirSync(PROFILE, { recursive: true });
  console.log(`▶ 打开元宝（${path.basename(browser)}${HEADLESS ? '，无界面' : '，独立小窗口'}，不影响你自己的浏览器）`);
  const proc = spawn(browser, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run',
    '--no-default-browser-check', '--disable-features=Translate',
    ...(HEADLESS ? ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : []),
    'https://yuanbao.tencent.com/',
  ], { detached: true, stdio: 'ignore', windowsHide: HEADLESS });
  proc.unref();

  let mine = [];
  let names = [];
  for (let i = 0; i < 24; i++) {
    await sleep(1500);
    try {
      const got = await cookiesViaCdp();
      mine = got.mine;
      names = mine.map((c) => c.name);
      if (names.includes('hy_token') && names.includes('_qimei_uuid42')) break;
    } catch { /* 浏览器还没起来 */ }
  }
  const yb = mine.filter((c) => String(c.domain).includes('yuanbao'));
  if (!yb.length) throw new Error('没读到元宝的 Cookie，窗口里刷新一下再跑一次');
  console.log(`  读到 ${mine.length} 个 Cookie（元宝 ${yb.length} 个）：${names.slice(0, 8).join(', ')}…`);
  if (!names.includes('hy_token')) console.log('  ⚠ 还没拿到 hy_token：等窗口跑完再来一次，或直接在里面扫码登录');
  return mine.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function main() {
  const before = await status();
  if (args.includes('--restore')) {
    const baks = fs.readdirSync(WXCD_DIR).filter((f) => /^config\.yaml\..+\.bak$/.test(f)).sort();
    const last = baks[baks.length - 1];
    if (!last) { console.error('× 没有可用的备份'); process.exit(1); }
    fs.copyFileSync(path.join(WXCD_DIR, last), CFG);
    console.log(`▶ 已换回 ${last}，重启抓包工具`);
    await restartWxcd();
    await sleep(6000);
    const s = await status();
    console.log(s.ok ? '✓ 通道可用' : `× 还不行：${s.reason}`);
    process.exit(s.ok ? 0 : 3);
  }
  if (CHECK) {
    console.log(JSON.stringify({ wxcd: WXCD_DIR, ok: before.ok, reason: before.reason }, null, 2));
    process.exit(before.ok ? 0 : 1);
  }
  if (!fs.existsSync(EXE)) { console.error(`× 找不到抓包工具：${EXE}`); process.exit(1); }
  if (!fs.existsSync(CFG)) { console.error(`× 找不到配置文件：${CFG}`); process.exit(1); }

  const cookie = await fetchCookie();
  if (!/(^|;\s*)hy_token=/.test(cookie)) {
    console.error('× 这条 Cookie 不完整（缺 hy_token），写进去只会让解析报「此内容暂时无法播放」。\n' +
      '  有界面模式下把那个窗口留一会儿、必要时扫码登录后再跑一次；无界面模式大概率拿不到 hy_token。');
    process.exit(4);
  }
  const text = fs.readFileSync(CFG, 'utf8');
  const next = text.replace(/^(\s*)sphcookie:.*$/m, `$1sphcookie: '${cookie.replace(/'/g, "''")}'`);
  if (next === text) { console.error('× config.yaml 里没找到 sphcookie 这一行'); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  fs.copyFileSync(CFG, `${CFG}.${stamp}.bak`);
  fs.writeFileSync(CFG, next, 'utf8');
  console.log(`  已写进 config.yaml（旧的存成 config.yaml.${stamp}.bak，要换回来用 --restore）`);

  console.log('▶ 重启抓包工具');
  await restartWxcd();
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const s = await status();
    if (s.ok) { console.log('✓ 视频号通道可用'); process.exit(0); }
  }
  const s = await status();
  console.error(`× 还是不行：${s.reason || '未知'}。可以在那个窗口里扫码登录元宝，再跑一次本命令`);
  process.exit(3);
}

main().catch((e) => { console.error('× ' + e.message); process.exit(1); });
