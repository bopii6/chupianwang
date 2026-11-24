// 账号管理后台：开号 / 停用 / 改密码 / 改到期 / 看作品
// 所有接口都在服务端校验管理员身份，这里只是界面
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
let items = [];
let me = null;
let toastTimer = 0;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b ? Math.max(1, Math.round(b / 1024)) + ' KB' : '0');
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `请求失败（${r.status}）`);
  return d;
}

function stateOf(u) {
  if (!u.active) return { cls: 'off', text: '已停用' };
  if (u.expiresAt && u.expiresAt < today()) return { cls: 'bad', text: `已到期 ${u.expiresAt}` };
  if (u.expiresAt) return { cls: 'ok', text: `有效到 ${u.expiresAt}` };
  return { cls: 'ok', text: '正常' };
}

function rowOf(u) {
  const st = stateOf(u);
  const self = me && u.id === me.id;
  return `<div class="row ${u.active ? '' : 'off'}" data-id="${u.id}">
    <div class="who">
      <b>${esc(u.name || u.username)}${u.role === 'admin' ? ' <span class="badge warn">管理员</span>' : ''}${self ? ' <span class="badge off">你自己</span>' : ''}</b>
      <small>@${esc(u.username)}</small>
    </div>
    <div class="meta">
      <span class="badge ${st.cls}">${esc(st.text)}</span>
      <span><em>密钥</em> ${u.hasKey ? '已填（自己的）' : '<span style="color:var(--bad)">没填</span>'}</span>
      <span><em>作品</em> ${u.works} 条 / ${fmtBytes(u.worksBytes)}</span>
      <span><em>文案库</em> ${u.copies} 条</span>
      <span><em>出片</em> ${u.generations} 次</span>
      <span><em>最后登录</em> ${fmtTime(u.lastLogin)}</span>
      <span><em>建号</em> ${fmtTime(u.createdAt)}</span>
    </div>
    <div class="acts">
      ${u.role === 'admin' ? '' : `<button class="ghost mini" data-act="toggle" type="button">${u.active ? '停用' : '启用'}</button>`}
      <button class="ghost mini" data-act="expiry" type="button">改到期</button>
      <button class="ghost mini" data-act="password" type="button">改密码</button>
      <button class="ghost mini" data-act="works" type="button">看作品</button>
      ${u.role === 'admin' ? '' : '<button class="danger mini" data-act="delete" type="button">删除</button>'}
    </div>
  </div>`;
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const list = items.filter((u) => !q || u.username.includes(q) || String(u.name || '').toLowerCase().includes(q));
  const on = items.filter((u) => stateOf(u).cls === 'ok').length;
  $('#stat').textContent = `共 ${items.length} 个，正常 ${on} 个`;
  $('#list').innerHTML = list.length
    ? list.map(rowOf).join('')
    : `<div class="empty">${items.length ? '没有匹配的账号' : '还没有账号，上面开一个'}</div>`;
}

async function load() {
  try {
    const d = await api('/api/admin/users');
    me = d.me;
    items = d.items || [];
    $('#who').textContent = me ? `${me.name || me.username}（${me.username}）` : '';
    render();
  } catch (e) {
    $('#list').innerHTML = `<div class="empty">${esc(e.message)}<br><a href="/">回首页登录</a></div>`;
  }
}

// 开号
$('#createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    username: f.username.value.trim(),
    name: f.name.value.trim(),
    password: f.password.value,
    expiresAt: f.expiresAt.value || '',
  };
  if (!body.username || !body.password) return;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = '开号中…';
  try {
    const d = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    toast(`已开号：${d.user.username}`);
    f.reset();
    await load();
  } catch (err) {
    toast(err.message);
  }
  btn.disabled = false; btn.textContent = '开号';
});

// 行内操作
$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const row = btn.closest('.row');
  const u = items.find((x) => x.id === row.dataset.id);
  if (!u) return;
  const act = btn.dataset.act;
  try {
    if (act === 'toggle') {
      if (u.active && !confirm(`停用「${u.name || u.username}」？停用后他立刻登不上，作品和文案都还在。`)) return;
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) });
      toast(u.active ? '已停用' : '已启用');
    } else if (act === 'expiry') {
      const v = prompt(`「${u.name || u.username}」的到期日（YYYY-MM-DD，留空 = 永久）：`, u.expiresAt || '');
      if (v === null) return;
      const val = v.trim();
      if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) return toast('日期格式要像 2027-01-31');
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ expiresAt: val }) });
      toast(val ? `到期日改成 ${val}` : '已改成永久');
    } else if (act === 'password') {
      const v = prompt(`给「${u.name || u.username}」设一个新密码（至少 6 位，别用纯数字）：`);
      if (!v) return;
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ password: v }) });
      toast('密码已改，他那边会自动退出');
    } else if (act === 'works') {
      location.href = '/works.html?owner=' + encodeURIComponent(u.id);
      return;
    } else if (act === 'delete') {
      if (!confirm(`删除「${u.name || u.username}」？\n账号会消失，作品和文案库挪到 data/users/_已删除账号/ 里，不占他登录。`)) return;
      await api('/api/admin/users/' + u.id, { method: 'DELETE' });
      toast('已删除');
    }
    await load();
  } catch (err) {
    toast(err.message);
  }
});

$('#q').addEventListener('input', render);
$('#btnLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
});

load();
