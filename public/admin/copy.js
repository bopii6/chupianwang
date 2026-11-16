// 文案库（内部工具）
// 收录：一个框 → 链接走下载转写、文案直接拆 → AI 拆解 + 风险检查 + 自动入库
// 文案库：卡片列表 → 点开看完整拆解
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式忽略 */ } },
};

// ---------- 接口 ----------
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = store.get('cl.token', '');
  if (token) headers['x-admin-token'] = token;
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const r = await fetch(path, { method: opts.body ? 'POST' : 'GET', ...opts, headers });
  if (r.status === 403 && !opts.retried) {
    const t = prompt('这是内部工具，请输入管理员口令（服务器 .env 里的 ADMIN_TOKEN）');
    if (t) { store.set('cl.token', t.trim()); return api(path, { ...opts, retried: true }); }
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `请求失败（${r.status}）`), { data, status: r.status });
  return data;
}

// ---------- 小工具 ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false && c !== '') el.append(c.nodeType ? c : String(c));
  return el;
}
const fmtNum = (n) => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n));
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const ROLE_COLOR = { 钩子: '#ff5a1f', 共鸣: '#a855f7', 干货: '#3b82f6', 证明: '#16a34a', 转折: '#eab308', 引导: '#e5484d' };

// 原文只做排版：按句号断段，一个字都不改；没标点的长文按逗号断
function formatRaw(t) {
  const str = String(t || '').trim();
  if (!str) return '';
  if (str.includes('\n')) return str;
  let parts = str.split(/(?<=[。！？!?…])/);
  if (parts.length < 2) parts = str.split(/(?<=[，、；：,;])/);
  const out = []; let buf = '';
  for (const p of parts) {
    buf += p;
    if (buf.length >= 90) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.join('\n\n');
}
const LEVEL_CLS = { 违法: 'lv-bad', 限流: 'lv-warn', 提示: 'lv-tip' };
const URL_RE = /^(https?:\/\/|weixin\.qq\.com\/sph)|weixin\.qq\.com\/sph\//i;

let META = { taxonomy: { structure: [] } };
let LIB = [];

// ---------- 视图 ----------
function show(view) {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.view === view);
  $('vAdd').classList.toggle('hidden', view !== 'add');
  $('vLib').classList.toggle('hidden', view !== 'lib');
  if (view === 'lib') renderLib();
  store.set('cl.view', view);
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });
function updateCount() { $('libCount').textContent = LIB.length; }

// ---------- 可直接点改的字段 ----------
function editable(tag, cls, value, field, s) {
  const el = h(tag, { class: cls + ' cl-edit', contenteditable: 'plaintext-only', spellcheck: 'false', title: '点击可修改' }, value);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  el.addEventListener('blur', async () => {
    const v = el.innerText.trim();
    const old = field === 'title' ? s.analysis.title : s.analysis.formula;
    if (!v) { el.textContent = old; return; }
    if (v === old) return;
    try {
      const { sample } = await api('/api/copy/update', { json: { id: s.id, [field]: v } });
      Object.assign(s, sample); replaceInLib(sample); toast('已保存');
    } catch (e) { toast('保存失败：' + e.message); el.textContent = old; }
  });
  return el;
}
function replaceInLib(sample) { const i = LIB.findIndex((x) => x.id === sample.id); if (i >= 0) LIB[i] = sample; }

// ---------- 一张拆解卡 ----------
function sampleCard(s, { onDelete } = {}) {
  const a = s.analysis; const st = s.stats || {}; const core = a.core || {};
  const who = [a.subject || a.category, a.audience, a.goal].filter(Boolean).join(' · ');
  const total = a.segments.reduce((n, x) => n + x.text.length, 0) || 1;
  const nums = [st.likes != null && `赞 ${fmtNum(st.likes)}`, st.comments != null && `评 ${fmtNum(st.comments)}`, st.collects != null && `藏 ${fmtNum(st.collects)}`, st.leads].filter(Boolean);

  // ① 一句话核心
  const coreBlock = core.oneLine ? h('section', { class: 'cl-core' },
    h('p', { class: 'cl-core-k' }, '🦴 一句话讲透'),
    h('p', { class: 'cl-core-one' }, core.oneLine),
    core.why ? h('p', { class: 'cl-core-why' }, core.why) : null) : null;

  // ② 五步递进
  const chain = core.chain || [];
  const stepBlock = chain.length ? h('section', { class: 'cl-row' },
    h('span', { class: 'cl-k' }, '五步'),
    h('ul', { class: 'cl-steps' }, ...chain.map((c, i) => h('li', { class: 'cl-step' },
      h('span', { class: 'cl-num' }, String(i + 1)),
      h('span', { class: 'cl-step-k' }, c.step),
      h('p', { class: 'cl-step-t' }, c.what))))) : null;

  // ③ 换行业怎么套
  const skel = h('details', { class: 'cl-fold' }, h('summary', {}, '换行业怎么套（骨架 · 示例 · 禁忌）'),
    h('div', { class: 'cl-fold-body' },
      ...(core.skeleton || []).map((x) => h('p', { class: 'cl-skel-row' }, h('b', {}, x.part), x.fixed,
        x.variable ? h('span', { class: 'cl-sub' }, '｜换：' + x.variable) : null)),
      ...(core.examples || []).map((x) => h('p', { class: 'cl-skel-row' }, h('b', {}, x.industry), x.opening)),
      core.taboo && core.taboo.length ? h('p', { class: 'cl-taboo' }, '禁忌：' +
        core.taboo.map((t) => String(t).replace(/^不能照搬[：:、\s]*/, '')).join('；')) : null));

  // ④ 完整拆解（默认收起，避免一上来一坨字）
  const rest = h('details', { class: 'cl-fold' }, h('summary', {}, '完整拆解（为什么火 · 结构 · 能套到 · 风险）'),
    h('div', { class: 'cl-fold-body' },
      a.highlights.length ? h('div', { class: 'cl-row' }, h('span', { class: 'cl-k' }, '为什么火'),
        h('ul', { class: 'cl-ul' }, ...a.highlights.map((t) => h('li', {}, t)))) : null,
      h('div', { class: 'cl-row', style: 'border-top:none' }, h('span', { class: 'cl-k' }, '结构'),
        h('div', {},
          h('div', { class: 'cl-bar' }, ...a.segments.map((x) => h('i', { style: `flex:${Math.max(x.text.length, total * 0.03)};background:${ROLE_COLOR[x.role] || '#999'}` }))),
          h('div', { class: 'cl-segs' }, ...a.segments.map((x) => h('p', {},
            h('b', { style: `color:${ROLE_COLOR[x.role] || '#999'}` }, x.role), x.text,
            x.note ? h('span', { class: 'cl-sub', style: 'display:block' }, x.note) : null))))),
      a.transfer.length ? h('div', { class: 'cl-row', style: 'border-top:none' }, h('span', { class: 'cl-k' }, '能套到'),
        h('div', { class: 'cl-tf' }, ...a.transfer.map((t) => h('p', {}, h('b', {}, t.track), t.opening)))) : null,
      s.risks.length ? h('div', { class: 'cl-row', style: 'border-top:none' }, h('span', { class: 'cl-k' }, '风险'),
        h('div', { class: 'cl-risks' }, ...s.risks.map((r) => h('p', { class: LEVEL_CLS[r.level] },
          h('span', { class: 'cl-lv' }, r.level), h('b', {}, r.word),
          h('span', { class: 'cl-sub' }, (r.fix ? '改：' + r.fix + '　' : '') + (r.reason || '')))))) : null));

  // ⑤ 原文：默认展开，能收
  const raw = h('details', { class: 'cl-fold', open: true }, h('summary', {}, `原文（${String(s.text || '').length} 字${s.textRaw ? '，转写可能有错字' : ''}）`),
    h('div', { class: 'cl-fold-body' }, h('p', { class: 'cl-raw' }, formatRaw(s.text))));

  return h('article', { class: 'cl-card' },
    editable('h2', 'cl-title', a.title, 'title', s),
    h('p', { class: 'cl-meta' }, who, a.structure ? h('span', { class: 'cl-tag' }, a.structure) : null),

    coreBlock,

    a.formula ? h('div', { class: 'cl-row' }, h('span', { class: 'cl-k' }, '套路'),
      editable('p', 'cl-formula-text', a.formula, 'formula', s)) : null,

    a.hook?.text ? h('div', { class: 'cl-row' }, h('span', { class: 'cl-k' }, '钩子'),
      h('div', {}, h('p', { class: 'cl-hook' }, a.hook.text),
        (a.hook.type || a.hook.why) ? h('p', { class: 'cl-sub' }, [a.hook.type, a.hook.why].filter(Boolean).join(' · ')) : null)) : null,

    stepBlock,
    raw,
    core.skeleton?.length || core.examples?.length ? skel : null,
    rest,

    h('div', { class: 'cl-foot' },
      h('span', {}, [s.source?.account, s.source?.platform, ...nums].filter(Boolean).join(' · ') || '没有填数据'),
      s.source?.url ? h('a', { href: s.source.url, target: '_blank', rel: 'noopener noreferrer' }, '原视频') : null,
      onDelete ? h('button', { class: 'cl-del', type: 'button', onclick: onDelete }, '删除') : null));
}

async function removeSample(s, after) {
  if (!confirm(`删除「${s.analysis.title}」？`)) return;
  try {
    await api('/api/copy/delete', { json: { id: s.id } });
    LIB = LIB.filter((x) => x.id !== s.id); updateCount();
    toast('已删除'); after?.();
  } catch (e) { toast(e.message); }
}

// ---------- 收录 ----------
const textEl = $('text');
const noteEl = $('note');
let working = false;

function busy(on, msg = '') {
  working = on;
  $('go').disabled = on; $('pickFile').disabled = on;
  $('status').innerHTML = on ? `<i class="att-spin"></i>${msg}` : '';
}

async function analyzeText(t, extraNote = '', force = false) {
  busy(true, 'AI 正在拆解（约 20 秒）');
  $('err').replaceChildren();
  $('result').replaceChildren(h('div', { class: 'cl-card cl-skel' }, h('i'), h('i'), h('i', { class: 'tall' }), h('i'), h('i', { class: 'short' })));
  try {
    const fullNote = [noteEl.value.trim(), extraNote].filter(Boolean).join('\n');
    const { sample } = await api('/api/copy/add', { json: { text: t, note: fullNote, force } });
    LIB.unshift(sample); updateCount();
    textEl.value = ''; noteEl.value = ''; store.set('cl.draft', '');
    $('result').replaceChildren(
      h('p', { class: 'cl-done' }, `✓ 已入库，共 ${LIB.length} 条`),
      sampleCard(sample, { onDelete: () => removeSample(sample, () => $('result').replaceChildren()) }));
    return sample;
  } catch (e) {
    $('result').replaceChildren();
    const dup = e.data?.duplicate;
    if (dup) {
      $('err').append('库里已经有这条了：', h('button', { class: 'link', onclick: () => openModal(dup.id) }, `「${dup.title}」`), '　',
        h('button', { class: 'link', onclick: () => analyzeText(t, extraNote, true) }, '仍然收录'));
    } else $('err').textContent = '拆解失败：' + e.message;
    return null;
  } finally { busy(false); }
}

// 视频号链接 → 下载 → 浏览器转写 → 拆解
async function fromLink(u) {
  $('err').replaceChildren();
  busy(true, '正在下载视频…');
  try {
    const r = await api('/api/copy/link', { json: { url: u } });
    busy(true, '下载好了，正在转文字…');
    const blob = await (await fetch(r.videoUrl)).blob();
    const file = new File([blob], 'link.mp4', { type: 'video/mp4' });
    const asr = await (await loadAsr()).transcribe(file, { base: '/models/asr/', model: 'whisper-small' });
    if (!asr.text) throw new Error('没听出人声，这条可能只有音乐');
    textEl.value = asr.text;
    busy(true, 'AI 正在拆解（约 20 秒）');
    await analyzeText(asr.text, r.title ? `来源：${r.title}\n${u}` : u);
    textEl.value = '';
  } catch (e) {
    $('err').textContent = '链接拆解失败：' + e.message;
  } finally { busy(false); }
}

// 视频 / 音频 → 转写 → 拆解
let asrMod = null;
const loadAsr = () => (asrMod ||= import('/engine/asr.js'));
async function fromVideo(file) {
  if (!file) return;
  if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi|flv|mp3|m4a|aac|wav|ogg|opus|amr)$/i.test(file.name)) { toast('只支持视频或音频文件'); return; }
  if (textEl.value.trim() && !confirm('输入框里已经有文字了，用视频转出来的文字替换它吗？')) return;
  $('err').replaceChildren();
  const t0 = Date.now();
  busy(true, '正在转文字…');
  const timer = setInterval(() => busy(true, `转文字 ${Math.round((Date.now() - t0) / 1000)} 秒，大约是视频时长的 2/3`), 1000);
  try {
    const asr = await (await loadAsr()).transcribe(file, { base: '/models/asr/', model: 'whisper-small' });
    if (!asr.text) throw new Error('没听出人声，这条可能只有音乐');
    textEl.value = asr.text;
    await analyzeText(asr.text);
    textEl.value = '';
  } catch (e) {
    $('err').textContent = '转写失败：' + e.message;
  } finally { clearInterval(timer); busy(false); }
}

async function add() {
  if (working) return;
  const t = textEl.value.trim();
  if (!t) { $('err').textContent = '先粘贴链接或文案，或者拖一个视频进来'; return; }
  if (URL_RE.test(t) && t.split(/\s+/).length <= 3) return fromLink(t);
  if (t.replace(/\s/g, '').length < 20) { $('err').textContent = '文案太短了，至少 20 个字，或者直接用视频号链接'; return; }
  await analyzeText(t);
}
$('go').addEventListener('click', () => add());
textEl.addEventListener('input', () => store.set('cl.draft', textEl.value));
textEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); });

$('pickFile').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { fromVideo(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); drop.classList.add('over'); } });
drop.addEventListener('dragleave', (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('over'); });
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); drop.classList.remove('over'); fromVideo(f); } });

// ---------- 文案库 ----------
let filter = '';
const trackOf = (s) => s.analysis.category || '其他';
function renderLib() {
  const counts = {};
  for (const s of LIB) counts[trackOf(s)] = (counts[trackOf(s)] || 0) + 1;
  const tracks = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
  if (filter && !counts[filter]) filter = '';
  $('chips').replaceChildren(...(tracks.length < 2 ? [] : [
    h('button', { class: 'cl-chip' + (filter ? '' : ' on'), type: 'button', onclick: () => { filter = ''; renderLib(); } }, '全部'),
    ...tracks.map((v) => h('button', { class: 'cl-chip' + (filter === v ? ' on' : ''), type: 'button', onclick: () => { filter = filter === v ? '' : v; renderLib(); } }, v, h('b', {}, counts[v]))),
  ]));
  const q = $('q').value.trim().toLowerCase();
  const items = LIB.filter((s) => {
    if (filter && trackOf(s) !== filter) return false;
    if (!q) return true;
    const a = s.analysis;
    const hay = [a.title, a.subject, a.category, a.audience, a.structure, a.hook?.text, a.formula, a.core?.oneLine, s.text, s.myNote, s.source?.account, ...(a.tags || [])].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  $('libTotal').textContent = `${LIB.length} 条`;
  if (!items.length) {
    $('cards').replaceChildren(h('div', { class: 'cl-empty' }, LIB.length ? '没有符合的' : '还是空的，去“收录”加第一条吧'));
    return;
  }
  $('cards').replaceChildren(...items.map((s) => {
    const a = s.analysis; const st = s.stats || {};
    const heat = [st.likes != null && `赞 ${fmtNum(st.likes)}`, st.comments != null && `评 ${fmtNum(st.comments)}`].filter(Boolean).join(' · ');
    const who = [a.subject || a.category, a.audience === '家长' ? '给家长' : a.audience === '学生' ? '给学生' : a.audience].filter(Boolean).join(' · ');
    return h('button', { class: 'cl-sample', type: 'button', onclick: () => openModal(s.id) },
      who ? h('p', { class: 'cl-sample-who' }, who) : null,
      h('h4', {}, a.hook?.text || a.title),
      h('p', { class: 'cl-sample-body' }, a.core?.oneLine || a.why || ''),
      h('div', { class: 'cl-sample-foot' },
        heat ? h('span', {}, heat) : null,
        st.leads ? h('span', { class: 'ok' }, '获客好') : null,
        a.structure ? h('span', { class: 'cl-tag' }, a.structure) : null));
  }));
}
$('q').addEventListener('input', renderLib);

function openModal(id) {
  const s = LIB.find((x) => x.id === id);
  if (!s) return;
  const m = $('modal');
  $('modalBody').replaceChildren(
    h('button', { class: 'cl-close', type: 'button', onclick: () => m.close(), 'aria-label': '关闭' }, '×'),
    sampleCard(s, { onDelete: () => removeSample(s, () => { m.close(); }) }));
  m.showModal();
}
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').close(); });
$('modal').addEventListener('close', () => { if (!$('vLib').classList.contains('hidden')) renderLib(); });

// ---------- 启动 ----------
(async function boot() {
  try {
    [META, { items: LIB }] = await Promise.all([api('/api/copy/meta'), api('/api/copy/list')]);
  } catch (e) { $('err').textContent = '打不开文案库：' + e.message; return; }
  updateCount();
  textEl.value = store.get('cl.draft', '');
  if (!META.ai) $('err').textContent = '服务端没有配置 DEEPSEEK_API_KEY，暂时不能拆解';
  show(store.get('cl.view', 'add') === 'lib' ? 'lib' : 'add');
  if (!$('vAdd').classList.contains('hidden')) textEl.focus();
})();

