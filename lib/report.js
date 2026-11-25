// 出错记录往我们自己的服务器发一份，客户什么都不用点。
//
// 只发「出错了这件事」：时间、哪一步、状态码、错误文本、版本、机器编号。
// 不发客户的文案、视频、密钥（lib/errors.js 里记的时候就只记这些）。
//
// 发不出去（网络不好、服务器在忙）就先留着，过一会儿再发；关机了也没关系，
// 下次启动会从 errors.jsonl 里把没发过的补上。
//
// 开关（在 .env 里写）：
//   REPORT_URL=off            完全关掉
//   REPORT_URL=http://...     发到别的地址（测试用）
//   不写                       本地版发到 getcut.cn；公网版自己就是服务器，不发
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const STATE = path.join(DATA_DIR, 'report.json'); // 上次发到哪一条
const ERRORS = path.join(DATA_DIR, 'errors.jsonl');
const DEFAULT_URL = 'https://getcut.cn/api/support/report';
const MAX_PENDING = 200; // 攒太多就不发了，别占内存
const SEND_TIMEOUT = 15000;

const cfg = { url: '', key: '', version: '', install: '', delay: 25000, enabled: false };
let pending = [];
let lastAt = '';
let timer = null;
let busy = false;
let tries = 0;

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) || {}; } catch { return {}; }
}
function writeState(obj) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(obj)); } catch { /* 写不了不影响用 */ }
}

function schedule(ms) {
  if (!cfg.enabled || timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, Math.max(0, ms));
  if (timer.unref) timer.unref(); // 别拦着服务退出
}

/** 只带固定的几个字段，避免把客户内容带出去 */
const pick = (e) => ({
  at: String(e?.at || ''),
  local: String(e?.local || '').slice(0, 60),
  kind: String(e?.kind || '').slice(0, 20),
  where: String(e?.where || '').slice(0, 120),
  status: Number(e?.status) || 0,
  message: String(e?.message || '').slice(0, 300),
  ...(e?.detail ? { detail: String(e.detail).slice(0, 300) } : {}),
  ...(e?.user ? { user: String(e.user).slice(0, 60) } : {}),
  version: String(e?.version || '').slice(0, 20),
});

async function flush() {
  if (!cfg.enabled || busy || !pending.length) return;
  busy = true;
  // 按时间排序，一次最多 20 条
  pending.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const batch = pending.slice(0, 20);
  try {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.key ? { 'x-cpw-key': cfg.key } : {}) },
      body: JSON.stringify({ install: cfg.install, version: cfg.version, client: 'chupianwang', events: batch.map(pick) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT),
    });
    if (!r.ok) throw new Error(`上报失败 ${r.status}`);
    pending = pending.slice(batch.length);
    lastAt = batch[batch.length - 1].at || lastAt;
    tries = 0;
    writeState({ lastAt, at: new Date().toISOString() });
  } catch {
    tries++;
    // 试了 5 次还不行就丢掉这一批（本地 errors.jsonl 里还留着，客户发诊断也能看到）
    if (tries >= 5) { pending = []; tries = 0; }
  } finally {
    busy = false;
    if (pending.length) schedule(60000);
  }
}

/** 启动时调一次：读上次发到哪、把没发过的补进队列 */
export function setupReport({ version = '', install = '', hosted = false } = {}) {
  const raw = String(process.env.REPORT_URL ?? '').trim();
  const off = !raw || ['off', '0', 'no', 'none', 'false'].includes(raw.toLowerCase());
  cfg.url = off ? DEFAULT_URL : raw;
  cfg.key = String(process.env.REPORT_KEY || '');
  cfg.version = version;
  cfg.install = install;
  cfg.delay = Math.max(0, Number(process.env.REPORT_DELAY_MS ?? 25000) || 0);
  // 公网版自己就是服务器，不用往自己身上发；测试里除非明确给了地址，也不发
  cfg.enabled = !hosted && !off && (!!raw || process.env.NODE_ENV !== 'test');
  if (!cfg.enabled) return cfg;

  lastAt = readState().lastAt || '';
  try {
    const lines = fs.readFileSync(ERRORS, 'utf8').split('\n').filter(Boolean).slice(-100);
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (e?.at && (!lastAt || String(e.at) > lastAt)) pending.push(e);
      } catch { /* 半行忽略 */ }
    }
  } catch { /* 还没出过错 */ }
  if (pending.length) schedule(8000); // 上次没发出去的，开机几秒后补发
  return cfg;
}

/** 新出了一条错：排队，过几十秒发（不跟正常请求抢时间，也不让客户有感知） */
export function reportError(entry) {
  if (!cfg.enabled || !entry?.at) return;
  pending.push(entry);
  while (pending.length > MAX_PENDING) pending.shift();
  schedule(cfg.delay);
}

export const reportStatus = () => ({ enabled: cfg.enabled, url: cfg.url, pending: pending.length, lastAt, tries });
