// 顶栏导航：制作台 / 文案库 / 我的作品，三个页面共用一份
// 每个标签带图标和实时状态：文案库显示上次看过之后新增几条，我的作品显示最近的成片缩略图
import './support.js'; // 浏览器检测、报错上报、版本号和诊断信息
const ICON = {
  make: '<path d="M4 20 15 9M14 4l1.5 3L19 8.5 15.5 10 14 13l-1.5-3L9 8.5 12.5 7z" />',
  copy: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3.5-1-5.5 1-8.5z" />',
  works: '<rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />',
};
const ITEMS = [
  { key: 'make', href: '/', name: '制作台' },
  { key: 'copy', href: '/admin/copy.html', name: '文案库' },
  { key: 'works', href: '/works.html', name: '我的作品' },
];
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式忽略 */ } },
};

const nav = document.querySelector('.topnav');
if (nav) {
  const p = location.pathname;
  const here = p.startsWith('/admin/copy') ? 'copy' : p.startsWith('/works') ? 'works' : 'make';
  nav.replaceChildren(...ITEMS.map((it) => {
    const a = document.createElement('a');
    a.href = it.href;
    a.title = it.name;
    if (it.key === here) { a.className = 'on'; a.setAttribute('aria-current', 'page'); }
    a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[it.key]}</svg><span class="nav-name">${it.name}</span><span class="nav-st" id="navSt-${it.key}"></span>`;
    return a;
  }));
  fillCopy(here === 'copy');
  fillWorks();
  // 管理员多两个入口：账号、出错记录（普通客户看不到）
  fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
    if (d.user?.role !== 'admin' || !nav) return;
    const admin = [
      { href: '/admin/accounts.html', name: '账号', dir: '/admin/accounts', title: '账号管理', icon: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0z" />' },
      { href: '/admin/topics.html', name: '在问什么', dir: '/admin/topics', title: '客户都在问什么', icon: '<path d="M4 5h16v11H8l-4 4z" />' },
      { href: '/admin/errors.html', name: '出错', dir: '/admin/errors', title: '客户的出错记录', icon: '<path d="M12 4 2.5 20h19zM12 9v5m0 3v.5" />' },
    ];
    for (const it of admin) {
      const a = document.createElement('a');
      a.href = it.href;
      a.title = it.title;
      if (location.pathname.startsWith(it.dir)) { a.className = 'on'; a.setAttribute('aria-current', 'page'); }
      a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${it.icon}</svg><span class="nav-name">${it.name}</span>`;
      nav.append(a);
    }
  }).catch(() => {});
}

// 文案库：内部工具，拿不到（没口令）就什么都不显示，也不弹口令框
async function fillCopy(onPage) {
  try {
    const token = ls.get('cl.token');
    const r = await fetch('/api/copy/list', { cache: 'no-store', headers: token ? { 'x-admin-token': token } : {} });
    if (!r.ok) return;
    const n = ((await r.json()).items || []).length;
    const seen = ls.get('nav.copySeen');
    if (onPage || seen == null) ls.set('nav.copySeen', n);
    const el = document.getElementById('navSt-copy');
    if (!el || !n) return;
    const fresh = !onPage && seen != null && n > seen ? n - seen : 0;
    el.textContent = fresh ? '+' + fresh : String(n);
    el.classList.toggle('new', !!fresh);
    if (fresh) el.title = `上次看过之后新增 ${fresh} 条`;
  } catch { /* 状态是锦上添花，失败不影响导航 */ }
}

// 我的作品：最近两条成片做成小缩略图
async function fillWorks() {
  try {
    const r = await fetch('/api/works', { cache: 'no-store' });
    if (!r.ok) return;
    const items = (await r.json()).items || [];
    const el = document.getElementById('navSt-works');
    if (!el || !items.length) return;
    el.classList.add('thumbs');
    el.title = `共 ${items.length} 条成片`;
    for (const it of items.slice(0, 2)) {
      const v = document.createElement('video');
      v.src = it.url + '#t=0.5';
      v.muted = true; v.preload = 'metadata'; v.playsInline = true;
      el.append(v);
    }
    if (items.length > 2) el.append(Object.assign(document.createElement('b'), { textContent: items.length }));
  } catch { /* 同上 */ }
}
