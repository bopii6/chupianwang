// 出错记录后台：客户电脑上自动报上来的错都在这里（只有管理员能看）
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let me = null;
let day = '';
let timer = 0;

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

/** 2026-11-25 16:14:22 (UTC+08:00) → 16:14:22 */
function clock(local) {
  const m = String(local || '').match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : String(local || '').slice(11, 19);
}

function renderDays(days, cur) {
  const sel = $('#day');
  const list = days?.length ? days : [cur];
  sel.innerHTML = list.map((d) => `<option value="${esc(d)}"${d === cur ? ' selected' : ''}>${esc(d)}${d === new Date().toISOString().slice(0, 10) ? '（今天）' : ''}</option>`).join('');
  day = cur;
}

function renderStat(d) {
  const top = Object.entries(d.byWhere || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('#stat').innerHTML = d.total
    ? `这一天 <b>${d.total}</b> 条，涉及 <b>${d.installs}</b> 台机器${top.length ? '　主要出在：' + top.map(([k, n]) => `${esc(k)}（${n}）`).join('、') : ''}`
    : '这一天没有出错记录';
}

function renderList(events) {
  if (!events?.length) {
    $('#list').innerHTML = '<div class="empty">这一天没有出错记录 🎉</div>';
    return;
  }
  $('#list').innerHTML = `
    <table class="tbl">
      <thead><tr><th>时间</th><th>机器</th><th>版本</th><th>哪一步</th><th>状态</th><th>原因</th></tr></thead>
      <tbody>${events.map((e) => `
        <tr>
          <td class="t" title="${esc(e.local)}">${esc(clock(e.local))}</td>
          <td class="ins" title="${esc(e.install)}">${esc(e.install)}${e.user ? `<br><small>${esc(e.user)}</small>` : ''}</td>
          <td class="t">${esc(e.version || '?')}</td>
          <td class="where">${esc(e.where || e.kind)}</td>
          <td><span class="badge${e.status >= 500 ? ' b5' : ''}">${esc(e.status || '—')}</span></td>
          <td class="msg">${esc(e.message)}${e.detail ? `<small>${esc(e.detail)}</small>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function load() {
  try {
    const d = await api('/api/support/errors' + (day ? `?day=${encodeURIComponent(day)}` : ''));
    renderDays(d.days, d.day);
    renderStat(d);
    renderList(d.events);
  } catch (e) {
    $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

$('#day').addEventListener('change', (e) => { day = e.target.value; load(); });
$('#btnReload').addEventListener('click', () => load());
$('#btnLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
});

async function boot() {
  // 本地版（装在自己电脑上）没有登录这一套，直接就能看
  let hosted = true;
  try { hosted = !!(await (await fetch('/api/status', { cache: 'no-store' })).json()).hosted; } catch { /* 按公网版处理，下面会提示登录 */ }
  if (hosted) {
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
  // 开着的时候每分钟自己刷新，不用手点
  timer = setInterval(load, 60000);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(timer); timer = 0; }
  else if (!timer) { load(); timer = setInterval(load, 60000); }
});
boot();
