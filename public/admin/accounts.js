// 账号管理后台（只有管理员能用；接口那边也有校验，这里只负责界面）
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
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b ? Math.max(1, Math.round(b / 1024)) + ' KB' : '');
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) {
    showDeny(r.status === 401 ? '登录过期了' : '这个账号没有管理权限', '重新用管理员账号登录一下就行。');
    throw new Error(d.error || '没有权限');
  }
  if (!r.ok) throw new Error(d.error || `请求失败（${r.status}）`);
  return d;
}

// ---------- 登录态 ----------
function showDeny(title, text) {
  $('#app').classList.add('hidden');
  $('#deny').classList.remove('hidden');
  $('#denyTitle').textContent = title || '先登录管理员账号';
  $('#denyText').textContent = text || '这个页面只有管理员能用。别人拿到链接也改不了任何东西。';
  $('#who').textContent = '';
}
$('#denyBtn').addEventListener('click', () => { location.href = '/?admin=1'; });
$('#btnLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
});

async function boot() {
  try {
    const d = await (await fetch('/api/auth/me', { cache: 'no-store' })).json();
    me = d.user;
  } catch { me = null; }
  if (!me) return showDeny('先登录管理员账号', '用管理员账号登录后就能管理账号了。');
  if (me.role !== 'admin') return showDeny('这个账号不是管理员', `你现在登录的是「${me.name || me.username}」，没有管理账号的权限。`);
  $('#who').innerHTML = `管理员 <b>${esc(me.username)}</b>`;
  $('#deny').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await load();
}

// ---------- 状态 ----------
function stateOf(u) {
  if (!u.active) return { cls: 'off', text: '已停用' };
  if (u.expiresAt && u.expiresAt < today()) return { cls: 'late', text: `已到期 ${u.expiresAt.slice(5)}` };
  if (u.expiresAt) return { cls: 'on', text: `有效到 ${u.expiresAt}` };
  return { cls: 'on', text: '在用' };
}

// ---------- 列表 ----------
function rowOf(u) {
  const st = stateOf(u);
  const self = me && u.id === me.id;
  const size = fmtSize(u.worksBytes);
  const last = fmtTime(u.lastLogin);
  return `<article class="acct ${u.active ? '' : 'is-off'} ${u.role === 'admin' ? 'is-admin' : ''}" data-id="${u.id}">
    <button class="frame" type="button" data-act="works" title="看他/她的作品">${esc((u.name || u.username || '?').slice(0, 1))}</button>
    <div class="who">
      <b>${esc(u.name || u.username)}${u.role === 'admin' ? '<span class="tag">管理员</span>' : ''}${self ? '<span class="tag you">你自己</span>' : ''}</b>
      <span class="uname">${esc(u.username)}</span>
      <span class="last">${last ? `最近登录 ${last}` : '从没登录'}</span>
    </div>
    <div class="facts">
      <div class="fact"><i>密钥</i><span class="${u.hasKey ? '' : 'miss'}">${u.hasKey ? '已填' : '没填'}</span></div>
      <div class="fact"><i>作品</i><span class="${u.works ? '' : 'none'}">${u.works} 条${size ? `（${size}）` : ''}</span></div>
      <div class="fact"><i>文案库</i><span class="${u.copies ? '' : 'none'}">${u.copies} 条</span></div>
      <div class="fact"><i>出片</i><span class="${u.generations ? '' : 'none'}">${u.generations} 次</span></div>
    </div>
    <div class="state"><span class="seal ${st.cls}">${esc(st.text)}</span></div>
    <div class="ops">
      ${u.role === 'admin' ? '' : `<button class="op" type="button" data-act="toggle">${u.active ? '停用' : '启用'}</button>`}
      <button class="op" type="button" data-act="expiry">有效期</button>
      <button class="op" type="button" data-act="password">改密码</button>
      ${u.role === 'admin' ? '' : '<button class="op danger" type="button" data-act="delete">删除</button>'}
    </div>
  </article>`;
}
function render() {
  const q = $('#q').value.trim().toLowerCase();
  const list = items.filter((u) => !q || u.username.toLowerCase().includes(q) || String(u.name || '').toLowerCase().includes(q));
  const on = items.filter((u) => u.active && !(u.expiresAt && u.expiresAt < today())).length;
  $('#nAll').textContent = items.length;
  $('#nOn').textContent = on;
  $('#nOff').textContent = items.length - on;
  $('#stat').textContent = q ? `找到 ${list.length} 个` : '';
  if (!items.length) {
    $('#list').innerHTML = '<div class="empty"><b>还没有账号</b>上面填一下，开第一个号。</div>';
    return;
  }
  $('#list').innerHTML = list.length ? list.map(rowOf).join('') : '<div class="empty">没有匹配的账号</div>';
}
async function load() {
  try {
    const d = await api('/api/admin/users');
    items = d.items || [];
    me = d.me || me;
    render();
  } catch (e) {
    $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

// ---------- 开号 ----------
function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function addMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function showCustomDate(on) {
  const f = $('#createForm');
  f.preset.classList.toggle('hidden', on);
  f.expiresAt.classList.toggle('hidden', !on);
  $('#backPreset').classList.toggle('hidden', !on);
  if (on) { if (!f.expiresAt.value) f.expiresAt.value = addMonths(3); f.expiresAt.focus(); }
}
$('#genPw').addEventListener('click', () => {
  const f = $('#createForm');
  f.password.value = randomPassword();
  f.password.focus();
});
$('#createForm').preset.addEventListener('change', (e) => {
  showCustomDate(e.target.value === 'custom');
});
$('#backPreset').addEventListener('click', () => {
  const f = $('#createForm');
  f.preset.value = '';
  f.expiresAt.value = '';
  showCustomDate(false);
});
$('#createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const preset = f.preset.value;
  let expiresAt = '';
  if (preset === '1m') expiresAt = addMonths(1);
  else if (preset === '3m') expiresAt = addMonths(3);
  else if (preset === '6m') expiresAt = addMonths(6);
  else if (preset === '1y') expiresAt = addMonths(12);
  else if (preset === 'custom') expiresAt = f.expiresAt.value || '';
  const body = { username: f.username.value.trim(), name: f.name.value.trim(), password: f.password.value, expiresAt };
  if (!body.username) return toast('先填账号');
  if (!body.password) return toast('先填初始密码');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = '正在开…';
  try {
    const d = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    f.reset();
    showCustomDate(false);
    await load();
    openCreated(d.user.username, body.password);
  } catch (err) {
    toast(err.message);
  }
  btn.disabled = false; btn.textContent = '开号';
});

// ---------- 行内操作 ----------
$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const u = items.find((x) => x.id === btn.closest('.acct').dataset.id);
  if (!u) return;
  const act = btn.dataset.act;
  if (act === 'works') { location.href = '/works.html?owner=' + encodeURIComponent(u.id); return; }
  if (act === 'toggle') {
    if (u.active && !confirm(`停用「${u.name || u.username}」？\n停用后他立刻登不上，作品和文案都还在，随时可以启用。`)) return;
    try {
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) });
      toast(u.active ? '已停用' : '已启用');
      await load();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'password') return openPassword(u);
  if (act === 'expiry') return openExpiry(u);
  if (act === 'delete') {
    if (!confirm(`删除「${u.name || u.username}」？\n账号会消失，作品和文案库挪到 data/users/_已删除账号/ 里。`)) return;
    try {
      await api('/api/admin/users/' + u.id, { method: 'DELETE' });
      toast('已删除');
      await load();
    } catch (err) { toast(err.message); }
  }
});

// ---------- 弹窗 ----------
function closeModal() { $('#modalHost').innerHTML = ''; }
function openModal(html) {
  const host = $('#modalHost');
  host.innerHTML = `<div class="modal"><div class="modal-card">${html}</div></div>`;
  const mask = host.querySelector('.modal');
  mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });
  host.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModal; });
  return host.querySelector('.modal-card');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 退回 execCommand */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    return true;
  } catch { return false; }
}
const credentialsText = (username, password) => `出片王账号\n网址：https://getcut.cn\n账号：${username}\n密码：${password}\n\n登录后点右上角头像 →「我的设置」，填上你自己的 DeepSeek 密钥（sk- 开头）就能出片了。`;

function openCreated(username, password) {
  const card = openModal(`
    <h3>账号开好了</h3>
    <p>把下面这段发给客户就行。</p>
    <dl class="creds"><dt>账号</dt><dd>${esc(username)}</dd><dt>密码</dt><dd>${esc(password)}</dd></dl>
    <p style="font-size:12px">他第一次登录会被要求填自己的 DeepSeek 密钥；也能在「我的设置」里改密码。</p>
    <div class="modal-actions">
      <button class="quiet" type="button" data-close>关掉</button>
      <button class="primary" type="button" data-copy>复制账号密码</button>
    </div>`);
  card.querySelector('[data-copy]').onclick = async (e) => {
    const ok = await copyText(credentialsText(username, password));
    e.target.textContent = ok ? '已复制' : '复制失败，手动抄一下';
  };
}
function openPassword(u) {
  const card = openModal(`
    <h3>给「${esc(u.name || u.username)}」设新密码</h3>
    <p>改完他那边会自动退出，用新密码重新登录。</p>
    <div class="stack"><label>新密码</label>
      <div class="inline"><input type="text" data-pw placeholder="至少 6 位，别用纯数字" autocomplete="off" />
      <button class="chip" type="button" data-gen>随机</button></div>
    </div>
    <p class="msg"></p>
    <div class="modal-actions">
      <button class="quiet" type="button" data-close>取消</button>
      <button class="primary" type="button" data-save>保存</button>
    </div>`);
  const pw = card.querySelector('[data-pw]');
  card.querySelector('[data-gen]').onclick = () => { pw.value = randomPassword(); };
  card.querySelector('[data-save]').onclick = async () => {
    const v = pw.value.trim();
    if (!v) { card.querySelector('.msg').textContent = '先填新密码'; return; }
    try {
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ password: v }) });
      const ok = await copyText(credentialsText(u.username, v));
      closeModal();
      toast(ok ? '密码已改，账号密码已复制' : '密码已改');
      await load();
    } catch (err) { card.querySelector('.msg').textContent = err.message; }
  };
  pw.focus();
}
function openExpiry(u) {
  const card = openModal(`
    <h3>「${esc(u.name || u.username)}」的有效期</h3>
    <p>到期当天起登不上；留空就是永久。停用和到期是两回事，停用随时能再启用。</p>
    <div class="presets">
      <button type="button" data-month="">永久</button>
      <button type="button" data-month="1">1 个月</button>
      <button type="button" data-month="3">3 个月</button>
      <button type="button" data-month="6">6 个月</button>
      <button type="button" data-month="12">1 年</button>
    </div>
    <div class="stack"><label>到期日</label><input type="date" data-date value="${esc(u.expiresAt || '')}" /></div>
    <p class="msg"></p>
    <div class="modal-actions">
      <button class="quiet" type="button" data-close>取消</button>
      <button class="primary" type="button" data-save>保存</button>
    </div>`);
  const date = card.querySelector('[data-date]');
  card.querySelectorAll('[data-month]').forEach((b) => {
    b.onclick = () => { date.value = b.dataset.month ? addMonths(Number(b.dataset.month)) : ''; };
  });
  card.querySelector('[data-save]').onclick = async () => {
    try {
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ expiresAt: date.value || '' }) });
      closeModal();
      toast(date.value ? `有效期改成 ${date.value}` : '已改成永久有效');
      await load();
    } catch (err) { card.querySelector('.msg').textContent = err.message; }
  };
}

$('#q').addEventListener('input', render);
boot();
