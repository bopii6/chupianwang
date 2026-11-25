// 售后支持（三个页面共用，由 nav.js 引入）：
// 1. 一打开就检查浏览器能不能导出视频，不行就在顶上提示，别等做完了才发现
// 2. 页面上的报错自动记到 server.log，客户说“点了没反应”时有据可查
// 3. 右下角显示版本号，点开能一键复制诊断信息，客户直接发给我们
const css = `
.sup-bar{position:sticky;top:0;z-index:60;background:#fff4ec;color:#8a2c00;border-bottom:1px solid rgba(255,90,31,.25);padding:10px 16px;font-size:13px;line-height:1.5;text-align:center}
.sup-bar b{color:#c2410c}
.sup-ver{position:fixed;right:10px;bottom:0;z-index:40;font:11px/1 system-ui,sans-serif;color:var(--text-3,#908c84);background:transparent;border:0;padding:1px 8px 2px;border-radius:6px 6px 0 0;cursor:pointer;opacity:.75}
.sup-ver:hover{opacity:1;background:var(--surface-2,#f3f2ee)}
.sup-mask{position:fixed;inset:0;z-index:70;background:rgba(20,18,14,.5);display:flex;align-items:center;justify-content:center;padding:16px;animation:supFade .2s ease-out}
.sup-mask .sup-card{animation:supIn .32s cubic-bezier(.2,.8,.2,1)}
@keyframes supFade{from{opacity:0}}
@keyframes supIn{from{opacity:0;transform:translateY(12px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.sup-mask,.sup-mask .sup-card{animation:none}}
.sup-row button:focus-visible{outline:2px solid var(--accent,#ff5a1f);outline-offset:2px}
.sup-card{background:var(--surface,#fff);color:var(--text,#141310);border-radius:var(--r-lg,20px);box-shadow:var(--shadow-lg,0 30px 60px -24px rgba(0,0,0,.3));width:min(520px,100%);max-height:86vh;display:flex;flex-direction:column;padding:22px;gap:12px;font-size:14px}
.sup-card h3{margin:0;font-size:17px}
.sup-card p{margin:0;color:var(--text-2,#57544e);line-height:1.6}
.sup-card dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}
.sup-card dt{color:var(--text-3,#908c84)}
.sup-card dd{margin:0;word-break:break-all}
.sup-card .bad{color:var(--danger,#e5484d)}
.sup-row{display:flex;gap:10px;justify-content:flex-end;margin-top:4px}
.sup-row button{border:0;border-radius:999px;padding:10px 18px;font-size:14px;cursor:pointer;background:var(--surface-2,#f3f2ee);color:inherit}
.sup-in{width:100%;box-sizing:border-box;border:1px solid var(--hair-2,rgba(20,18,14,.13));border-radius:var(--r-sm,10px);padding:11px 12px;font:14px/1.2 ui-monospace,Consolas,monospace;background:var(--surface,#fff);color:inherit}
.sup-in:focus{outline:2px solid var(--accent,#ff5a1f);outline-offset:-1px}
.sup-card details summary{cursor:pointer;color:var(--text-2,#57544e);font-size:13px}
.sup-card a{color:var(--accent,#ff5a1f)}
.sup-contact{font-size:13px;color:var(--text-2,#57544e);background:var(--surface-2,#f3f2ee);border-radius:var(--r-sm,10px);padding:9px 12px}
.sup-contact b{font-weight:600;color:#fff;background:var(--accent,#ff5a1f);padding:1px 8px;border-radius:999px;cursor:pointer;user-select:all}
.sup-contact b:hover{filter:brightness(.94)}
.sup-contact span{color:var(--text-3,#908c84)}
.sup-msg:empty,.sup-now:empty{display:none}
.sup-row button:disabled{opacity:.6;cursor:default}
.sup-row button.pri{background:var(--accent,#ff5a1f);color:#fff;font-weight:600}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

// ---------- 报错自动上报到本机 server.log ----------
let sent = 0;
function report(message, stack = '') {
  if (sent++ > 20) return; // 同一个页面最多报 20 条，免得刷屏
  const body = JSON.stringify({ page: location.pathname + location.search, message: String(message).slice(0, 500), stack: String(stack || '').slice(0, 1500) });
  fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
addEventListener('error', (e) => { if (e.message) report(e.message, e.error?.stack || `${e.filename}:${e.lineno}`); });
addEventListener('unhandledrejection', (e) => { const r = e.reason; report(r?.message || r, r?.stack); });

// ---------- 浏览器能不能出片 ----------
async function checkBrowser() {
  const problems = [];
  const hasApi = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
  if (!hasApi) problems.push('不能导出视频');
  else {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 2_500_000, framerate: 30 });
      const base = supported || (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 720, height: 1280, bitrate: 2_000_000, framerate: 30 })).supported;
      if (!base) problems.push('不支持 H.264 视频编码');
    } catch { problems.push('不支持 H.264 视频编码'); }
  }
  if (typeof SharedArrayBuffer === 'undefined') problems.push('不能在本机转文字（“用别人的爆款做”会很慢或用不了）');
  return problems;
}
const browserProblems = checkBrowser();
browserProblems.then((list) => {
  if (!list.length) return;
  const phone = matchMedia('(pointer: coarse)').matches;
  const bar = document.createElement('div');
  bar.className = 'sup-bar';
  bar.innerHTML = phone
    ? '手机浏览器还不能出片，<b>请用电脑上的 Chrome 或 Edge 打开</b>'
    : `这个浏览器${list.join('、')}。<b>请用最新版 Chrome 或 Edge 打开</b>（360、QQ 等浏览器内核太旧）`;
  document.body.prepend(bar);
});

// ---------- 版本号 + 诊断信息 ----------
const ver = document.createElement('button');
ver.className = 'sup-ver';
ver.type = 'button';
ver.title = '版本信息 / 出问题点这里复制诊断信息发给我们（微信 bopii666）';
ver.textContent = '出片王';
document.body.appendChild(ver);
fetch('/api/status').then((r) => r.json()).then((s) => {
  if (s.version) ver.textContent = `出片王 v${s.version}`;
  // 本地版第一次用、还没填 AI 密钥：直接弹出填写框（这次打开只弹一次）
  // 公网版等登录后再判断（账号里有没有自己填的密钥）
  let shown = false;
  try { shown = sessionStorage.getItem('cpw-key-asked') === '1'; sessionStorage.setItem('cpw-key-asked', '1'); } catch { /* 隐私模式 */ }
  if (!s.hosted && !s.ai && !shown) openSettings(true);
}).catch(() => {});

// ---------- 设置：AI 密钥 ----------
// 公网版（getcut.cn 这种）：显示当前账号、填自己的 DeepSeek 密钥、改密码
// 本地版：还是写 .env 里那把密钥
let hostedFlag = null;
async function isHosted() {
  if (hostedFlag == null) {
    try { hostedFlag = !!(await (await fetch('/api/status')).json()).hosted; } catch { hostedFlag = false; }
  }
  return hostedFlag;
}
const KEY_HELP = '到 <b>platform.deepseek.com</b> 登录 →「API keys」→ 创建，把 <b>sk-</b> 开头的那一串复制过来。保存时会先试一下能不能用。';

async function openSettings(first = false) {
  const hosted = await isHosted();
  document.querySelector('.sup-mask[data-settings]')?.remove();
  const mask = document.createElement('div');
  mask.className = 'sup-mask';
  mask.dataset.settings = '1';
  mask.innerHTML = `<div class="sup-card" role="dialog" aria-label="设置">
    <h3>${hosted ? '我的设置' : (first ? '先填一下 AI 密钥' : 'AI 密钥设置')}</h3>
    <p class="sup-acct"></p>
    <p data-aihelp>${first ? '写文案要用 DeepSeek 的 AI。' : ''}${KEY_HELP}</p>
    <p class="sup-now">正在读取…</p>
    <input class="sup-in" type="password" placeholder="sk-…（你自己的 DeepSeek 密钥）" autocomplete="off" spellcheck="false" data-ds>
    <details><summary>深度解读模板的实拍图（选填）</summary>
      <p style="margin-top:8px" data-px-hint>到 <b>pexels.com/api</b> 免费申请，填进来后“深度解读”模板会自动配实拍图。</p>
      <input class="sup-in" type="password" placeholder="Pexels 密钥（选填）" autocomplete="off" spellcheck="false" data-px>
    </details>
    <p class="sup-msg"></p>
    <div class="sup-row"><button type="button" data-x>${first ? '先看看示例' : '关闭'}</button><button type="button" class="pri" data-save>保存</button></div>
  </div>`;
  document.body.appendChild(mask);
  const $ = (s) => mask.querySelector(s);
  let hadKey = false; // 打开时账号里已经有密钥了
  let trialAccount = false; // 这是试用账号（平台出 AI，不用填密钥）
  // 关框（不管点“关闭”、点“保存”、点框外）时，保存过就把账号状态重新拉一遍
  const close = () => { mask.remove(); refreshMeIfChanged(); };
  $('[data-x]').onclick = close;
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  fetch('/api/settings?check=1').then((r) => r.json()).then((d) => {
    const ds = d.deepseek || {};
    if (d.account) $('.sup-acct').innerHTML = `账号 <b>${esc(d.account.name || d.account.username)}</b>（${esc(d.account.username)}）${d.account.expiresAt ? `　有效期到 ${esc(d.account.expiresAt)}` : ''}`;
    // 试用账号：平台提供 AI，客户不用填密钥 —— 只显示这次开通了几次、还剩几次
    if (d.plan === 'trial') {
      trialAccount = true;
      const left = Math.max(0, Number(d.quotaLeft) || 0);
      mask.querySelector('h3').textContent = '我的试用次数';
      mask.querySelector('[data-aihelp]')?.classList.add('hidden');
      $('[data-ds]').classList.add('hidden');
      $('[data-save]').textContent = '保存';
      $('.sup-now').innerHTML = `平台提供 AI，<b>不用填密钥</b>，登录就能用。<br>这次开通 <b>${Number(d.quota) || 0}</b> 次，还剩 <b>${left}</b> 次；每生成一条视频算 1 次。${left <= 0 ? '<br><span class="bad">已经用完了，加微信 bopii666 可以再开次数。</span>' : ''}`;
      if (d.pexels?.filled) {
        $('[data-px]').placeholder = `已填写 ${d.pexels.masked}（不改就留空）`;
        $('[data-px-hint]').innerHTML = '现在用的是你自己申请的 Pexels 密钥，只走你自己的额度。';
      } else {
        $('[data-px-hint]').innerHTML = '不填也能用：出片时走平台内置的那把 Pexels 密钥（免费额度大家共用，用多了会提示“素材库这会儿太忙”）。填了自己申请的，就只走你自己的额度，不受别人影响。';
      }
      return;
    }
    $('.sup-now').innerHTML = ds.filled
      ? `现在用的：${esc(ds.masked)}${ds.ok ? `　余额 <b>${esc(ds.balance)}</b>${ds.available ? '' : '（<span class="bad">余额不足，写不了文案</span>）'}` : ds.error ? `　<span class="bad">${esc(ds.error)}</span>` : ''}`
      : '<span class="bad">还没填你自己的密钥，填了才能出片</span>';
    // 已经填过：输入框只是“要换一把才用”，别让人以为还得重填一次
    if (ds.filled) {
      hadKey = true;
      $('[data-ds]').placeholder = `已经填好了（${ds.masked}）· 要换新的才在这儿贴，留空不改`;
    }
    if (d.pexels?.filled) {
      $('[data-px]').placeholder = `已填写 ${d.pexels.masked}（不改就留空）`;
      $('[data-px-hint]').innerHTML = '现在用的是你自己申请的 Pexels 密钥，只走你自己的额度。';
    } else if (d.hosted) {
      $('[data-px-hint]').innerHTML = '不填也能用：出片时走平台内置的那把 Pexels 密钥（免费额度大家共用，用多了会提示“素材库这会儿太忙”）。填了自己申请的，就只走你自己的额度，不受别人影响。';
    }
  }).catch(() => { $('.sup-now').textContent = ''; });
  $('[data-save]').onclick = async () => {
    const btn = $('[data-save]');
    const msg = $('.sup-msg');
    const ds = $('[data-ds]').value.trim(); const px = $('[data-px]').value.trim();
    const body = {};
    if (ds) body.deepseekKey = ds;
    if (px) body.pexelsKey = px;
    if (!Object.keys(body).length) {
      msg.innerHTML = trialAccount ? '不用填密钥，直接用就行。要换实拍图密钥才在这儿贴。' : (hadKey ? '没改动。要换密钥就把新的贴进来，不换直接点「关闭」。' : '<span class="bad">还没填内容</span>');
      return;
    }
    btn.disabled = true; btn.textContent = '正在检查…';
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '保存失败');
      msg.innerHTML = `✓ 已保存${d.deepseek?.balance ? `，DeepSeek 余额 ${esc(d.deepseek.balance)}` : ''}`;
      unrefreshed = true;
      // 保存成功马上就刷新：不然页面里还是“没填密钥”，点生成又把这个框弹出来
      refreshMeIfChanged();
      btn.textContent = '好了';
      btn.disabled = false;
      btn.onclick = close;
    } catch (e) {
      msg.innerHTML = `<span class="bad">${esc(e.message)}</span>`;
      btn.disabled = false; btn.textContent = '保存';
    }
  };
  setTimeout(() => $('[data-ds]').focus(), 50);
}
let unrefreshed = false; // 这次打开设置里保存过东西，关框时要把页面上的账号状态重新拉一遍
function refreshMeIfChanged() {
  if (!unrefreshed) return;
  unrefreshed = false;
  try { window.cpwRefreshMe?.(); } catch { /* 这个页面没有账号状态 */ }
}
window.cpwOpenSettings = openSettings;

function browserName() {
  const b = navigator.userAgentData?.brands?.find((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand));
  if (b) return `${b.brand} ${b.version}`;
  const m = navigator.userAgent.match(/(Edg|Chrome|Firefox|Version)\/([\d.]+)/);
  return m ? `${m[1] === 'Edg' ? 'Edge' : m[1] === 'Version' ? 'Safari' : m[1]} ${m[2]}` : navigator.userAgent;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function openDiag() {
  const hosted = await isHosted();
  const mask = document.createElement('div');
  mask.className = 'sup-mask';
  mask.innerHTML = '<div class="sup-card" role="dialog" aria-label="诊断信息"><h3>诊断信息</h3><p>正在检查…</p></div>';
  document.body.appendChild(mask);
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  let d = {};
  if (hosted) {
    try { d = { ...(await (await fetch('/api/status')).json()), hosted: true }; } catch (e) { d = { error: '连不上服务：' + e.message }; }
  } else {
    try { d = await (await fetch('/api/diag')).json(); } catch (e) { d = { error: '连不上本机服务：' + e.message }; }
  }
  const problems = await browserProblems;
  let acct = null;
  if (hosted) { try { acct = (await (await fetch('/api/auth/me')).json()).user; } catch { /* 没登录 */ } }
  const rows = hosted
    ? [
        ['版本', d.version ? `v${d.version}${d.commit ? `（${d.commit}）` : ''}` : '?'],
        ['浏览器', browserName()],
        ['能否出片', problems.length ? `<span class="bad">${esc(problems.join('、'))}</span>` : '正常'],
        ['账号', acct ? esc(acct.name || acct.username) : '没登录'],
        ['密钥', !acct ? '—' : acct.plan === 'trial' ? `平台提供（试用还剩 ${acct.quotaLeft} 次）` : (acct.hasKey ? '已填（自己的）' : '<span class="bad">还没填</span>')],
        ['提示', '服务器上的细节（配音、日志）由管理员在后台看；页面报错会自动记进去'],
      ]
    : [
        ['版本', d.version ? `v${d.version}${d.commit ? `（${d.commit}）` : ''}` : '?'],
        ['浏览器', browserName()],
        ['能否出片', problems.length ? `<span class="bad">${esc(problems.join('、'))}</span>` : '正常'],
        ['AI 写文案', `${d.aiKey ? '已配置' : '<span class="bad">没填密钥</span>'}　<a href="#" data-set>${d.aiKey ? '修改' : '去填'}</a>`],
        ['配音', d.tts && !/^不可用/.test(d.tts) ? '正常' : `<span class="bad">${esc(d.tts || '?')}</span>`],
        ['听写模型', d.asrModel === '已下载' ? '已下载' : `<span class="bad">${esc(d.asrModel || '?')}</span>`],
        ['电脑', d.os ? `${esc(d.os)}，${d.cpus} 核，内存 ${d.memoryGB}GB（空闲 ${d.freeMemoryGB}GB）` : esc(d.error || '?')],
        ['最近报错', d.clientErrors?.length ? `<span class="bad">${d.clientErrors.length} 条</span>` : '没有'],
      ];
  const text = hosted
    ? [
        `出片王诊断信息 ${new Date().toLocaleString('zh-CN')}`,
        `版本：v${d.version}（${d.commit}）`,
        `浏览器：${browserName()}  ${navigator.userAgent}`,
        `屏幕：${screen.width}x${screen.height} @${devicePixelRatio}`,
        `能否出片：${problems.length ? problems.join('、') : '正常'}`,
        `账号：${acct ? `${acct.name || ''}（${acct.username}）` : '没登录'}  自己的密钥：${acct?.hasKey ? '已填' : '没有'}${acct?.plan === 'trial' ? `  试用：剩 ${acct.quotaLeft}/${acct.quota} 次` : ''}`,
        `页面地址：${location.href}`,
      ].join('\n')
    : [
        `出片王诊断信息 ${new Date().toLocaleString('zh-CN')}`,
        `版本：v${d.version}（${d.commit}） 启动于 ${d.started}`,
        `浏览器：${browserName()}  ${navigator.userAgent}`,
        `屏幕：${screen.width}x${screen.height} @${devicePixelRatio}`,
        `能否出片：${problems.length ? problems.join('、') : '正常'}`,
        `Node ${d.node}  ${d.os}  ${d.cpus} 核  内存 ${d.memoryGB}GB（空闲 ${d.freeMemoryGB}GB）`,
        `AI 密钥：${d.aiKey ? '有' : '没有'}  素材库密钥：${d.stockKey ? '有' : '没有'}  配音：${d.tts}  听写模型：${d.asrModel}  作品数：${d.works}`,
        '',
        '—— 页面最近报错 ——',
        ...(d.clientErrors?.length ? d.clientErrors.map((e) => `${e.at} ${e.page} ${e.message}\n${e.stack}`) : ['没有']),
        '',
        '—— 服务日志最后 60 行 ——',
        d.log || '',
      ].join('\n');
  mask.querySelector('.sup-card').innerHTML = `
    <h3>诊断信息</h3>
    <p>用着出了问题？点「复制诊断信息」，把内容发到微信 <b>bopii666</b>，不用截图。里面不含你的文案、视频和密钥。</p>
    <p class="sup-contact">加我微信：<b data-wx title="点一下复制微信号">bopii666</b><span>　（点号码可复制；加的时候备注“出片王”）</span></p>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="sup-row"><button type="button" data-x>关闭</button><button type="button" class="pri" data-copy>复制诊断信息</button></div>`;
  mask.querySelector('[data-x]').onclick = () => mask.remove();
  const setBtn = mask.querySelector('[data-set]');
  if (setBtn) setBtn.onclick = (e) => { e.preventDefault(); mask.remove(); openSettings(); };
  const wx = mask.querySelector('[data-wx]');
  if (wx) wx.onclick = async () => { await copyText('bopii666'); wx.textContent = '已复制 bopii666 ✓'; };
  const btn = mask.querySelector('[data-copy]');
  btn.onclick = async () => {
    await copyText(text);
    btn.textContent = '已复制，去微信搜 bopii666 发给我们';
  };
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* 不是 https 或没权限，退回老办法 */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  } catch { /* 复制不了也不影响看 */ }
}
ver.addEventListener('click', openDiag);
// Esc 关掉最上面那个弹窗（设置框走它自己的「关闭」，好顺便刷新账号状态）
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const masks = document.querySelectorAll('.sup-mask');
  const top = masks[masks.length - 1];
  if (!top) return;
  e.preventDefault();
  const x = top.querySelector('[data-x]');
  if (x) x.click(); else top.remove();
});
