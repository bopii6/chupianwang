// 公网验证服务端转写：本机（客户侧）登录 → 提交转写 → 轮询 → 打印；用完删临时账号
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const KEY = process.env.CPW_SSH_KEY || '';
const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-i', KEY, 'root@115.190.113.128'];
const BASE = 'https://getcut.cn';
const USER = 'sph_selftest';
const PW = crypto.randomBytes(12).toString('hex');
const LINK = process.argv[2] || 'https://weixin.qq.com/sph/AqN1dEiCNA';

const ssh = (cmd) => execFileSync('ssh', [...SSH, cmd], { encoding: 'utf8' });
ssh(`cd /opt/chupianwang && node scripts/admin.mjs create ${USER} ${PW} 转写自测 2026-12-31`);

let cookie = '';
async function api(path, body) {
  const r = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

try {
  await api('/api/auth/login', { username: USER, password: PW });
  console.log('登录成功');
  const meta = await api('/api/copy/meta');
  console.log('meta.asrServer =', meta.asrServer);

  const t0 = Date.now();
  const job = await api('/api/copy/transcribe', { url: LINK });
  console.log('任务', job.id);
  let st = {};
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    st = await api(`/api/copy/transcribe?id=${job.id}`);
    if (st.status === 'done' || st.status === 'error') break;
    console.log(`   ${st.status} ${st.phase} ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`状态 ${st.status} 总耗时 ${secs}s | 音频 ${st.duration}s | 转写 ${st.took}s | 字数 ${st.chars}`);
  console.log('错误', st.error || '无');
  console.log('开头:', (st.text || '').slice(0, 90));
} finally {
  ssh(`cd /opt/chupianwang && node scripts/admin.mjs delete ${USER}`);
  console.log('临时账号已删除');
}
