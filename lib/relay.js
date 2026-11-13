// 手机扫码上传：手机选视频 → 在手机上拆出声音（16kHz 单声道）→ 只把声音传到这里 → 电脑取走后删除
// 只中转几 MB 的音频，不中转视频本身，几乎不占服务器带宽和硬盘
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'relay');
fs.mkdirSync(DIR, { recursive: true });
const TTL = 30 * 60e3;          // 二维码 30 分钟有效
const MAX_BYTES = 32 << 20;     // 16kHz 16 位单声道，15 分钟约 29MB
const MAX_SESSIONS = 300;
const sessions = new Map();     // id -> { k, created, state, name, duration, bytes }

const fileOf = (id) => path.join(DIR, id + '.pcm');
function drop(id) { sessions.delete(id); fsp.rm(fileOf(id), { force: true }).catch(() => {}); }
setInterval(() => { const now = Date.now(); for (const [id, s] of sessions) if (now - s.created > TTL) drop(id); }, 60e3).unref();
// 启动时清掉上次遗留的文件
for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { force: true });

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((x) => x && x.family === 'IPv4' && !x.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address))
    .map((x) => x.address)
    .sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0));
}
function auth(id, k) {
  const s = sessions.get(id);
  if (!s || Date.now() - s.created > TTL) return null;
  const a = Buffer.from(String(k || '')); const b = Buffer.from(s.k);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? s : null;
}

export async function handleRelay(req, res, pathname, query, { readJson, sendJson }) {
  // 电脑：开一个中转会话
  if (req.method === 'POST' && pathname === '/api/relay') {
    if (sessions.size >= MAX_SESSIONS) return sendJson(res, 503, { error: '扫码上传的人太多了，稍后再试' });
    const id = crypto.randomBytes(9).toString('base64url');
    const k = crypto.randomBytes(12).toString('base64url');
    sessions.set(id, { k, created: Date.now(), state: 'waiting', name: '', duration: 0, bytes: 0 });
    return sendJson(res, 200, { id, k, ttl: TTL, lan: lanAddresses() });
  }
  // 电脑：生成二维码（SVG）
  if (req.method === 'GET' && pathname === '/api/qr') {
    const text = String(query.get('text') || '');
    if (!/^https?:\/\//.test(text) || text.length > 400) return sendJson(res, 400, { error: '链接不对' });
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#141310', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(svg);
  }
  const m = pathname.match(/^\/api\/relay\/([\w-]{8,20})(\/audio|\/state)?$/);
  if (!m) return sendJson(res, 404, { error: 'not found' });
  const [, id, sub] = m;
  const s = auth(id, query.get('k'));
  if (!s) return sendJson(res, 410, { error: '二维码过期了，在电脑上重新点一下“扫码上传”' });

  // 手机：报告进度（选好视频了 / 正在读声音），电脑上能看到
  if (req.method === 'POST' && sub === '/state') {
    const { state, name } = await readJson(req);
    if (['picked', 'decoding', 'uploading', 'failed'].includes(state) && s.state !== 'ready') s.state = state;
    if (name) s.name = String(name).slice(0, 80);
    return sendJson(res, 200, { ok: true });
  }
  // 手机：上传声音（16 位 PCM，16kHz 单声道）
  if (req.method === 'PUT' && sub === '/audio') {
    const len = Number(req.headers['content-length'] || 0);
    if (!len || len > MAX_BYTES) return sendJson(res, 413, { error: '视频太长了，剪到 15 分钟以内再传' });
    const tmp = fileOf(id) + '.tmp';
    let got = 0; let tooBig = false;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmp);
      req.on('data', (c) => { got += c.length; if (got > MAX_BYTES) { tooBig = true; req.destroy(); } });
      req.on('error', reject); out.on('error', reject);
      req.on('aborted', () => resolve());
      out.on('finish', resolve);
      req.pipe(out);
    }).catch(() => { tooBig = true; });
    if (tooBig || got !== len) { await fsp.rm(tmp, { force: true }); return sendJson(res, 400, { error: '上传中断了，再试一次' }); }
    await fsp.rename(tmp, fileOf(id));
    Object.assign(s, { state: 'ready', bytes: got, duration: got / 2 / 16000, name: String(query.get('name') || s.name || '手机上的视频').slice(0, 80) });
    return sendJson(res, 200, { ok: true });
  }
  // 电脑：看状态
  if (req.method === 'GET' && !sub) return sendJson(res, 200, { state: s.state, name: s.name, duration: s.duration });
  // 电脑：取走声音，取完就删
  if (req.method === 'GET' && sub === '/audio') {
    if (s.state !== 'ready') return sendJson(res, 409, { error: '还没传好' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': s.bytes, 'Cache-Control': 'no-store' });
    const rs = fs.createReadStream(fileOf(id));
    rs.on('close', () => drop(id));
    return rs.pipe(res);
  }
  return sendJson(res, 405, { error: 'method not allowed' });
}
