// 客户在问什么：客户首页输入框里写的那句话（只有管理员能看）
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let day = '';
let all = [];
let timer = 0;

const FORM_NAME = {
  'footage-mix': '实拍混剪',
  'series-intro': '系列开场',
  'sketch-talk': '手绘图解',
  'deep-dive': '深度解读',
  'pixel-story': '像素小剧场',
  'data-card': '黑金数据卡',
};

async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) { showDeny(); throw new Error(d.error || '没有权限'); }
  if (!r.ok) throw new Error(d.error || `读取失败（${r.status}）`);
  return d;
}

function showDeny() {
  $('#app').classList.add('hidden');
  $('#deny').classList.remove('hidden');
  $('#who').textContent = '';
}

/** 2026-11-25 16:14:22 (UTC+08:00) → 16:14 */
function clock(local) {
  const m = String(local || '').match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function renderDays(days, cur) {
  const list = days?.length ? days : [cur];
  const today = new Date().toISOString().slice(0, 10);
  $('#day').innerHTML = list.map((d) => `<option value="${esc(d)}"${d === cur ? ' selected' : ''}>${esc(d)}${d === today ? '（今天）' : ''}</option>`).join('');
  day = cur;
}

function renderBars(d) {
  const forms = Object.entries(d.byForm || {}).sort((a, b) => b[1] - a[1]);
  const users = Object.entries(d.byUser || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('#bars').innerHTML = d.total
    ? `<span>共 <b>${d.total}</b> 条</span>
       ${users.length ? `<span>客户：${users.map(([u, n]) => `${esc(u)} ${n}`).join('、')}</span>` : ''}
       ${forms.length ? `<span>模板：${forms.map(([f, n]) => `${esc(FORM_NAME[f] || f)} ${n}`).join('、')}</span>` : ''}
       ${d.failed ? `<span style="color:#b23b2e">没出成 ${d.failed} 条</span>` : ''}`
    : '';
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const items = all.filter((x) => !q || [x.text, x.user, x.title, x.industry].some((v) => String(v || '').toLowerCase().includes(q)));
  $('#stat').textContent = q ? `找到 ${items.length} 条` : '';
  if (!items.length) {
    $('#list').innerHTML = `<div class="empty">${all.length ? '没有匹配的内容' : '这一天还没有人问 🎉'}</div>`;
    return;
  }
  $('#list').innerHTML = items.map((x) => {
    const form = FORM_NAME[x.form] || x.form || '';
    return `<div class="ask${x.ok === false ? ' fail' : ''}">
      <div class="t">${esc(clock(x.local))}</div>
      <div class="who"><b>${esc(x.user || '—')}</b>${x.ok === false ? '没出成' : ''}</div>
      <div>
        <div class="q">${x.text ? esc(x.text) : '<span style="color:#8a837b">（没写字，用的资料）</span>'}</div>
        <div class="meta">
          ${form ? `<span class="tagf">${esc(form)}</span>` : ''}
          ${x.minutes ? `<span>${esc(x.minutes)} 分钟</span>` : ''}
          ${x.materialCount ? `<span>资料 ${esc(x.materialCount)} 份</span>` : ''}
          ${x.kind === 'remix' ? '<span>复刻爆款</span>' : ''}
          ${x.industry ? `<span>行业：${esc(x.industry)}</span>` : ''}
          ${x.title ? `<span>出片标题：${esc(x.title)}</span>` : ''}
          ${x.chars ? `<span>${esc(x.chars)} 字</span>` : ''}
          ${x.error ? `<span style="color:#b23b2e">原因：${esc(x.error)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function load() {
  try {
    const d = await api('/api/support/topics' + (day ? `?day=${encodeURIComponent(day)}` : ''));
    renderDays(d.days, d.day);
    renderBars(d);
    all = d.items || [];
    render();
  } catch (e) {
    $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

$('#day').addEventListener('change', (e) => { day = e.target.value; load(); });
$('#q').addEventListener('input', render);
$('#btnReload').addEventListener('click', () => load());
$('#btnLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
});

async function boot() {
  // 本地版没有登录这一套，直接看（自己电脑上的记录）
  let hosted = true;
  try { hosted = !!(await (await fetch('/api/status', { cache: 'no-store' })).json()).hosted; } catch { /* 按公网版处理 */ }
  if (hosted) {
    let me = null;
    try { me = (await (await fetch('/api/auth/me', { cache: 'no-store' })).json()).user; } catch { me = null; }
    if (!me || me.role !== 'admin') return showDeny();
    $('#who').innerHTML = `管理员 <b>${esc(me.username)}</b>`;
  } else {
    $('#who').textContent = '本机';
    $('#btnLogout').classList.add('hidden');
  }
  $('#deny').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await load();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(timer); timer = 0; }
  else if (!timer) { load(); timer = setInterval(load, 60000); }
});
boot();
