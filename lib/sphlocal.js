// 本机转存：用客户自己电脑上的「抓包工具 + sph-dl」把视频号视频下到本机，不经过我们的服务器。
//
// 需要两样东西（这台机上都已经有了）：
//   1. wx_video_download.exe 在跑（默认 127.0.0.1:2022，配了一条 yuanbao.tencent.com 的 Cookie）
//   2. python + sph-dl（默认 E:\项目验证性测试poc\sph-dl，可用环境变量 SPH_LOCAL_DIR 改）
//
// 优点：不占线上那台机器的额度、不排队、视频不经过别人电脑。
// 限制：元宝 Cookie 几周会过期，过期后要重新取一条（wxcd 的 config.yaml 里 sphcookie）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DIR = process.env.SPH_LOCAL_DIR || 'E:\\项目验证性测试poc\\sph-dl';
const PY = process.env.PYTHON || 'python';
const API = (process.env.SPH_LOCAL_API || 'http://127.0.0.1:2022').replace(/\/+$/, '');

const LINK_RE = /https?:\/\/weixin\.qq\.com\/sph\/[A-Za-z0-9]+/;

// 本机这套东西在不在（不在就当没有，别报错吓人）
export function localReady() {
  try { return fs.existsSync(path.join(DIR, 'sph_dl', '__init__.py')); } catch { return false; }
}

// 抓包工具活着没、视频号分享通道是否可用（Cookie 过期时这里是 unavailable）
export async function localStatus() {
  if (!localReady()) return { ok: false, reason: '本机没装下载引擎' };
  try {
    const r = await fetch(`${API}/api/scraper/platform/status`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const sph = (j?.data?.statuses || []).find((x) => x.key === 'wxchannels:sph') || {};
    return { ok: sph.available === true, reason: sph.reason || (sph.available ? '' : '视频号通道不可用'), api: API };
  } catch (e) {
    return { ok: false, reason: `抓包工具没起来（${API}）`, api: API };
  }
}

function runPy(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, args, { cwd: DIR, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = ''; let err = '';
    const timer = setTimeout(() => { try { p.kill(); } catch { /* 已经退了 */ } reject(new Error(`本机下载超过 ${Math.round(timeoutMs / 1000)} 秒还没好`)); }, timeoutMs);
    p.stdout.on('data', (b) => { out += b.toString('utf8'); });
    p.stderr.on('data', (b) => { err += b.toString('utf8'); });
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`跑不起来 python：${e.message}`)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) return resolve(out);
      reject(new Error((err.trim().split('\n').filter(Boolean).pop() || `本机下载失败（退出码 ${code}）`).slice(0, 300)));
    });
  });
}

// 下一条视频号视频 → { buf, title, duration, file }
export async function fetchSphLocal(raw, { outDir, timeoutMs = 240000 } = {}) {
  const m = String(raw).match(LINK_RE);
  if (!m) throw new Error('没找到视频号链接（形如 https://weixin.qq.com/sph/xxxx）');
  if (!localReady()) throw new Error('本机没装下载引擎');
  const out = outDir || path.join(DIR, 'downloads');
  fs.mkdirSync(out, { recursive: true });
  const args = ['-m', 'sph_dl', m[0], '--out', out, '--db', path.join(out, '.index.sqlite3'), '--json'];
  const text = await runPy(args, timeoutMs);

  let data;
  try { data = JSON.parse(text.slice(text.indexOf('{'))); } catch { throw new Error('本机下载返回的不是 JSON'); }
  const item = (data.results || []).find((r) => r && (r.status === 'ok' || r.status === 'skip')) || {};
  const file = item.send_path || item.path || '';
  if (!file || !fs.existsSync(file)) throw new Error(String(item.error || '本机没下到视频').slice(0, 200));
  return {
    buf: fs.readFileSync(file),
    title: String(item.title || ''),
    duration: item.duration ? String(item.duration) : '',
    file,
  };
}
