// 发布到域名（线上服务器 getcut.cn）
//   node scripts/deploy.mjs            发布当前提交到线上（只传改过的文件）
//   node scripts/deploy.mjs --check    只看会发什么、线上是什么版本，不动线上
//   node scripts/deploy.mjs --full     强制全量上传（第一次/结构大改时用）
//   node scripts/deploy.mjs --no-test  跳过服务器上的全量测试（赶时间用，有风险）
//   node scripts/deploy.mjs --rollback 退回上一次发布前的代码
//
// 线上结构（火山引擎 ECS）：systemd 服务 chupianwang，目录 /opt/chupianwang，Node + Caddy。
// 客户数据（data/、works/、topic-log/）不在发布包里，发布和回滚都不会碰。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = '/opt/chupianwang';
const SERVICE = 'chupianwang';
const MARK = `${APP}/.deployed-commit`;          // 线上现在跑的提交号

// 发布配置可以写在 .env 里（CPW_SERVER / CPW_SSH_KEY），换电脑、换网络只改 .env；系统环境变量优先
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*(CPW_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* 没有 .env 就用默认值 */ }

const expandHome = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const HOST = process.env.CPW_SERVER || 'root@115.190.113.128';
const KEY = expandHome(process.env.CPW_SSH_KEY || path.join(os.homedir(), '.ssh', 'videogen_ecs'));
const CACHE = path.join(ROOT, '.cache');
const SH = `ssh -o BatchMode=yes -o ConnectTimeout=20 -i "${KEY}" ${HOST}`;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const FULL = has('--full');
const CHECK = has('--check');
const NOTEST = has('--no-test');
const ROLLBACK = has('--rollback');

// 服务器会对连得太快的连接直接掐断（kex/banner 报错），所以统一走带重试的执行
const sleep = (s) => spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${s * 1000})`], { windowsHide: true });
function run(cmd, { tries = 3, quiet = false } = {}) {
  let r;
  for (let i = 1; i <= tries; i++) {
    r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8', windowsHide: true });
    const text = `${r.stdout || ''}${r.stderr || ''}`;
    const conn = /kex_exchange_identification|Connection closed|Connection reset|banner exchange|Connection timed out|Broken pipe|port 22/i.test(text);
    if (!quiet && r.stdout) process.stdout.write(r.stdout);
    if (!quiet && r.stderr && !conn) process.stderr.write(r.stderr);
    if (r.status === 0) return r;
    if (!conn || i === tries) return r;
    console.log(`  （连接被服务器掐了一下，等 15 秒重试 ${i}/${tries}）`);
    sleep(15);
  }
  return r;
}

let t0 = Date.now();
let tStep = Date.now();
const step = (title) => { console.log(`\n▶ ${title}`); tStep = Date.now(); };
const done = () => console.log(`  ✓ 用时 ${((Date.now() - tStep) / 1000).toFixed(1)}s`);
const fail = (msg) => { console.log(`\n× ${msg}`); process.exit(1); };
const git = (...a) => spawnSync('git', ['-c', 'core.quotepath=false', ...a], { cwd: ROOT, encoding: 'utf8' });
const sh = (cmd, opts = {}) => spawnSync(cmd, { shell: true, cwd: ROOT, stdio: 'inherit', windowsHide: true, ...opts });
const shOut = (cmd) => spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8', windowsHide: true });

if (!fs.existsSync(KEY)) fail(`找不到 SSH 私钥：${KEY}\n可以用环境变量 CPW_SSH_KEY 指定。`);

// ---------- 线上状态 ----------
const remote = run(`${SH} "${ROLLBACK ? `cat ${APP}/.previous-commit 2>/dev/null || true` : `cat ${MARK} 2>/dev/null || true`}; echo ---; systemctl is-active ${SERVICE}; sed -n 's/.*\\"version\\": \\"\\(.*\\)\\".*/\\1/p' ${APP}/package.json | head -1"`, { quiet: true });
if (remote.status !== 0) fail(`连不上线上服务器（${HOST}）。检查网络/VPN 后再试。\n${remote.stderr || ''}`);
const [markRaw, , svc, verRaw] = remote.stdout.trim().split('\n');
const mark = (markRaw || '').trim();
const liveVersion = (verRaw || '').trim();
const head = git('rev-parse', 'HEAD').stdout.trim();
const short = (h) => (h || '').slice(0, 7);
const version = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } };

console.log(`本地：v${version()}  ${short(head)}`);
console.log(`线上：v${liveVersion || '?'}  ${short(mark) || '(未记录)'}  服务 ${svc || '?'}`);

if (CHECK) {
  const changed = mark ? git('diff', '--name-only', `${mark}..HEAD`).stdout.trim().split('\n').filter(Boolean) : [];
  console.log(`\n${mark ? `要发布的文件：${changed.length} 个` : '线上没有发布记录，首次会全量上传'}`);
  changed.slice(0, 40).forEach((f) => console.log('  · ' + f));
  if (changed.length > 40) console.log(`  … 还有 ${changed.length - 40} 个`);
  console.log('\n（--check 只做检查，没有改动线上）');
  process.exit(0);
}

// ---------- 回滚 ----------
if (ROLLBACK) {
  if (!mark) fail('线上没有“上一次发布前”的记录，没法回滚。');
  step(`回滚到 ${short(mark)}（发之前的备份包）`);
  const r = sh(`${SH} "ls -1t /opt/chupianwang-code-bak-*.tgz | head -1"`, { stdio: 'pipe', encoding: 'utf8' });
  const bak = (r.stdout || '').trim();
  if (!bak) fail('线上找不到备份包，没法回滚。');
  console.log(`  用备份：${bak}`);
  const ok = sh(`${SH} "set -e; tar xzf ${bak} -C ${APP}; systemctl restart ${SERVICE}; sleep 3; rm -f ${MARK}; systemctl is-active ${SERVICE}; curl -s --max-time 10 http://127.0.0.1:5173/api/status; echo"`);
  if (ok.status !== 0) fail('回滚失败，把上面的输出发给我们。');
  done();
  process.exit(0);
}

// ---------- 1. 本地检查 ----------
step('本地检查');
const dirty = git('status', '--porcelain', '--untracked-files=no').stdout.trim();
if (dirty) {
  console.log('  注意：本地有没提交的改动，这次发布只发“最后一次提交”里的内容：');
  dirty.split('\n').forEach((l) => console.log('   ' + l));
}
const changedFiles = mark ? git('diff', '--name-only', '--diff-filter=ACMR', `${mark}..HEAD`).stdout.trim().split('\n').filter(Boolean) : [];
const deletedFiles = mark ? git('diff', '--name-only', '--diff-filter=D', `${mark}..HEAD`).stdout.trim().split('\n').filter(Boolean) : [];
const needFull = FULL || !mark || git('merge-base', '--is-ancestor', mark, head).status !== 0;

if (!needFull && changedFiles.length === 0 && deletedFiles.length === 0) {
  console.log('  线上已经是最新提交，不用发。');
  done();
  process.exit(0);
}
// Windows 上中文文件名经过命令行可能变成问号，这时不敢只传局部，直接全量最稳
const garbled = [...changedFiles, ...deletedFiles].some((f) => f.includes('?'));
const tooMany = changedFiles.join(' ').length > 6000;
const incremental = !needFull && !garbled && !tooMany;
console.log(incremental
  ? `  方式：只传改过的 ${changedFiles.length} 个文件（省掉大部分上传时间）`
  : '  方式：全量上传');
done();

// ---------- 2. 打包 ----------
step('打包');
fs.mkdirSync(CACHE, { recursive: true });
const tag = short(head);
const tgz = path.join(CACHE, `deploy-${tag}.tgz`);
if (incremental) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', 'archive', '--format=tar.gz', '-o', tgz, 'HEAD', '--', ...changedFiles], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) fail('打包失败：' + (r.stderr || ''));
} else {
  const r = git('archive', '--format=tar.gz', '-o', tgz, 'HEAD');
  if (r.status !== 0) fail('打包失败：' + r.stderr);
}
console.log(`  ${path.basename(tgz)}  ${(fs.statSync(tgz).size / 1024 / 1024).toFixed(1)} MB`);
done();

// ---------- 3. 上传 + 服务器预检 + 备份 + 上线 ----------
step('上传 + 线上预检 + 上线（等服务器跑完测试）');
const rname = `/opt/deploy-${tag}.tgz`;
if (run(`scp -o BatchMode=yes -o ConnectTimeout=20 -i "${KEY}" "${tgz}" ${HOST}:${rname}`, { quiet: true }).status !== 0) fail('上传失败，检查网络后重试。');

const remoteSh = `set -e
APP=${APP}
TGZ=${rname}
MARK=${MARK}
echo "===== 线上预检（Node $(node -v)）====="
rm -rf /opt/cpw-preflight; mkdir -p /opt/cpw-preflight
# 不要带 .env：线上的 .env 是公网版配置（会开账号登录），会让测试按公网版跑而误判
tar cf - -C $APP --exclude=node_modules --exclude=data --exclude=works --exclude=.cache --exclude=topic-log --exclude=support --exclude='.env' --exclude='.env.*' --exclude='*.bak-*' --exclude=errors.jsonl --exclude=install.json . | tar xf - -C /opt/cpw-preflight
ln -sfn $APP/node_modules /opt/cpw-preflight/node_modules
tar xzf $TGZ -C /opt/cpw-preflight
test ! -f /opt/cpw-preflight/.env || { echo "× 预检目录混进了 .env，停下"; exit 1; }
${deletedFiles.length ? deletedFiles.map((f) => `rm -rf "/opt/cpw-preflight/${f}"`).join('\n') : 'true'}
${NOTEST ? 'echo "（跳过测试）"' : `cd /opt/cpw-preflight && if ! node --test > /tmp/cpwtest.log 2>&1; then echo "× 测试没过，线上不动："; tail -30 /tmp/cpwtest.log; exit 1; fi; grep -E "^# (tests|pass|fail)" /tmp/cpwtest.log`}
echo "===== 备份线上 ====="
TS=$(date +%Y%m%d-%H%M%S)
tar czf /opt/chupianwang-code-bak-$TS.tgz -C $APP --exclude=node_modules --exclude=data --exclude=works --exclude=.cache --exclude=topic-log --exclude=support .
echo "备份: /opt/chupianwang-code-bak-$TS.tgz"
echo "===== 覆盖 + 重启 ====="
[ -f $MARK ] && cp $MARK $APP/.previous-commit || true
tar xzf $TGZ -C $APP
${deletedFiles.length ? deletedFiles.map((f) => `rm -rf "$APP/${f}"`).join('\n') : 'true'}
echo ${head} > $MARK
sed -n 's/.*"version": "\\(.*\\)".*/部署版本: \\1/p' $APP/package.json | head -1
systemctl restart ${SERVICE}
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; curl -s --max-time 3 http://127.0.0.1:5173/api/status > /tmp/st.json 2>/dev/null && break; done
echo "服务: $(systemctl is-active ${SERVICE})"
cat /tmp/st.json; echo
echo "首页: HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:5173/)"
echo "===_OK_==="
rm -rf /opt/cpw-preflight
`;
const scriptPath = path.join(CACHE, 'deploy-remote.sh');
fs.writeFileSync(scriptPath, remoteSh.replace(/\r\n/g, '\n'), 'utf8');
if (run(`scp -o BatchMode=yes -o ConnectTimeout=20 -i "${KEY}" "${scriptPath}" ${HOST}:/opt/deploy-run.sh`, { quiet: true }).status !== 0) fail('上传脚本失败，检查网络后重试。');
const runRes = run(`${SH} "bash /opt/deploy-run.sh"`);
if (runRes.status !== 0) {
  // 连接中途被掐断时脚本可能已经在服务器上跑完了，问一下线上现在是什么版本再判定
  const now = run(`${SH} "cat ${MARK} 2>/dev/null || true"`, { quiet: true });
  if ((now.stdout || '').trim() !== head) fail('线上这一步没过，线上仍是老版本（备份包已生成，可 --rollback）。看看上面输出。');
  console.log('  （连接断了，但服务器上已经跑完，继续）');
}
done();

// ---------- 4. 公网验证 ----------
step('公网验证 https://getcut.cn');
const check = run(`node -e "fetch('https://getcut.cn/api/status',{signal:AbortSignal.timeout(20000)}).then(r=>r.json()).then(j=>{console.log(j.version);process.exit(j.version==='${version()}'?0:2)}).catch(e=>{console.error(e.message);process.exit(3)})"`, { quiet: true });
const pub = (check.stdout || '').trim();
if (check.status === 0) console.log(`  线上公网版本 v${pub} ✓`);
else if (check.status === 2) console.log(`  公网还是 v${pub}（Caddy 缓存/重启中，稍等再刷一下页面）`);
else fail('公网访问不到，检查域名/Caddy（服务器本地是好的）。');
done();

console.log(`\n✓ 发布完成 v${version()}（${tag}），总共 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
console.log('  回滚：node scripts/deploy.mjs --rollback');
