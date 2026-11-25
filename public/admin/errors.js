// 「出错记录」面板：挂到账号管理页里（/admin/accounts.html 的第三个标签）
// 数据来自 GET /api/support/errors（只有管理员能读）
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let day = '';
let root = null;

async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `读取失败（${r.status}）`);
  return d;
}

/** 2026-11-25 16:14:22 (UTC+08:00) → 16:14:22 */
function clock(local) {
  const m = String(local || '').match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : String(local || '').slice(11, 19);
}

function renderDays(days, cur) {
  const list = days?.length ? days : [cur];
  const today = new Date().toISOString().slice(0, 10);
  root.querySelector('[data-day]').innerHTML = list
    .map((d) => `<option value="${esc(d)}"${d === cur ? ' selected' : ''}>${esc(d)}${d === today ? '（今天）' : ''}</option>`)
    .join('');
  day = cur;
}

function renderStat(d) {
  const top = Object.entries(d.byWhere || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  root.querySelector('[data-stat]').innerHTML = d.total
    ? `这一天 <b>${d.total}</b> 条，涉及 <b>${d.installs}</b> 台机器${top.length ? '　主要出在：' + top.map(([k, n]) => `${esc(k)}（${n}）`).join('、') : ''}`
    : '这一天没有出错记录';
}

function renderList(events) {
  const list = root.querySelector('[data-list]');
  if (!events?.length) {
    list.innerHTML = '<div class="pane-empty">这一天没有出错记录 🎉</div>';
    return;
  }
  list.innerHTML = `
    <table class="err-tbl">
      <thead><tr><th>时间</th><th>机器</th><th>版本</th><th>哪一步</th><th>状态</th><th>原因</th></tr></thead>
      <tbody>${events.map((e) => `
        <tr>
          <td class="t" title="${esc(e.local)}">${esc(clock(e.local))}</td>
          <td class="ins" title="${esc(e.install)}">${esc(e.install)}${e.user ? `<br><small>${esc(e.user)}</small>` : ''}</td>
          <td class="t">${esc(e.version || '?')}</td>
          <td class="where">${esc(e.where || e.kind)}</td>
          <td><span class="st${e.status >= 500 ? ' b5' : ''}">${esc(e.status || '—')}</span></td>
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
    root.querySelector('[data-list]').innerHTML = `<div class="pane-empty">${esc(e.message)}</div>`;
  }
}

/**
 * 挂到某个容器里。
 * @param {HTMLElement} el 容器
 */
export function mountErrors(el) {
  root = el;
  root.innerHTML = `
    <p class="pane-lead">客户电脑上出的错会自动发到这里：几点几分、哪台机器、在哪一步、什么原因。</p>
    <div class="pane-toolbar">
      <select data-day></select>
      <button class="quiet" data-reload type="button">刷新</button>
      <span class="spacer"></span>
      <span class="pane-stat" data-stat></span>
    </div>
    <div data-list><div class="pane-empty">正在读取…</div></div>`;
  root.querySelector('[data-day]').addEventListener('change', (e) => { day = e.target.value; load(); });
  root.querySelector('[data-reload]').addEventListener('click', () => load());
  load();
  return { refresh: () => load() };
}
