// 「客户在问什么」面板：挂到账号管理页里（/admin/accounts.html 的第二个标签）
// 只负责界面，数据来自 GET /api/support/topics（只有管理员能读）
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FORM_NAME = {
  'footage-mix': '实拍混剪',
  'series-intro': '系列开场',
  'sketch-talk': '手绘图解',
  'deep-dive': '深度解读',
  'pixel-story': '像素小剧场',
  'data-card': '黑金数据卡',
};
let day = '';
let all = [];
let timer = 0;
let root = null;

async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `读取失败（${r.status}）`);
  return d;
}

/** 2026-11-25 16:14:22 (UTC+08:00) → 16:14 */
function clock(local) {
  const m = String(local || '').match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function renderDays(days, cur) {
  const list = days?.length ? days : [cur];
  const today = new Date().toISOString().slice(0, 10);
  root.querySelector('[data-day]').innerHTML = list
    .map((d) => `<option value="${esc(d)}"${d === cur ? ' selected' : ''}>${esc(d)}${d === today ? '（今天）' : ''}</option>`)
    .join('');
  day = cur;
}

function renderBars(d) {
  const forms = Object.entries(d.byForm || {}).sort((a, b) => b[1] - a[1]);
  const users = Object.entries(d.byUser || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  root.querySelector('[data-bars]').innerHTML = d.total
    ? `<span>共 <b>${d.total}</b> 条</span>
       ${users.length ? `<span>客户：${users.map(([u, n]) => `${esc(u)} ${n}`).join('、')}</span>` : ''}
       ${forms.length ? `<span>模板：${forms.map(([f, n]) => `${esc(FORM_NAME[f] || f)} ${n}`).join('、')}</span>` : ''}
       ${d.failed ? `<span style="color:#b23b2e">没出成 ${d.failed} 条</span>` : ''}`
    : '';
}

function render() {
  const q = root.querySelector('[data-q]').value.trim().toLowerCase();
  const items = all.filter((x) => !q || [x.text, x.user, x.title, x.industry].some((v) => String(v || '').toLowerCase().includes(q)));
  root.querySelector('[data-stat]').textContent = q ? `找到 ${items.length} 条` : '';
  const list = root.querySelector('[data-list]');
  if (!items.length) {
    list.innerHTML = `<div class="pane-empty">${all.length ? '没有匹配的内容' : '这一天还没有人问 🎉'}</div>`;
    return;
  }
  list.innerHTML = items.map((x) => {
    const form = FORM_NAME[x.form] || x.form || '';
    return `<div class="ask${x.ok === false ? ' fail' : ''}">
      <div class="t">${esc(clock(x.local))}</div>
      <div class="who"><b>${esc(x.user || '—')}</b>${x.ok === false ? '没出成' : ''}</div>
      <div>
        <div class="q">${x.text ? esc(x.text) : '<span class="muted">（没写字，用的资料）</span>'}</div>
        <div class="meta">
          ${form ? `<span class="tagf">${esc(form)}</span>` : ''}
          ${x.minutes ? `<span>${esc(x.minutes)} 分钟</span>` : ''}
          ${x.materialCount ? `<span>资料 ${esc(x.materialCount)} 份</span>` : ''}
          ${x.kind === 'remix' ? '<span>复刻爆款</span>' : ''}
          ${x.industry ? `<span>行业：${esc(x.industry)}</span>` : ''}
          ${x.title ? `<span>出片标题：${esc(x.title)}</span>` : ''}
          ${x.chars ? `<span>${esc(x.chars)} 字</span>` : ''}
          ${x.error ? `<span class="bad">原因：${esc(x.error)}</span>` : ''}
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
    root.querySelector('[data-list]').innerHTML = `<div class="pane-empty">${esc(e.message)}</div>`;
  }
}

/**
 * 挂到某个容器里。
 * @param {HTMLElement} el 容器
 * @returns {{refresh: Function, stop: Function}}
 */
export function mountTopics(el) {
  root = el;
  root.innerHTML = `
    <p class="pane-lead">客户在首页输入框里写的那句话，用来看出他们真正想做什么内容。<b>这是客户原话，只有你能看</b>，三个月后自动清掉。</p>
    <div class="pane-toolbar">
      <select data-day></select>
      <input data-q type="text" placeholder="搜内容或账号" />
      <button class="quiet" data-reload type="button">刷新</button>
      <span class="spacer"></span>
      <span class="pane-stat" data-stat></span>
    </div>
    <div class="pane-bars" data-bars></div>
    <div data-list><div class="pane-empty">正在读取…</div></div>`;
  root.querySelector('[data-day]').addEventListener('change', (e) => { day = e.target.value; load(); });
  root.querySelector('[data-q]').addEventListener('input', render);
  root.querySelector('[data-reload]').addEventListener('click', () => load());
  load();
  return {
    refresh: () => load(),
    stop: () => clearInterval(timer),
  };
}
