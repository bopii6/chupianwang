// 文案库（内部工具）
// 收录：一个框 → 链接走下载转写、文案直接拆 → AI 拆解 + 风险检查 + 自动入库
// 文案库：卡片列表 → 点开看完整拆解
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式忽略 */ } },
};

// 管理员维护公共库：地址后面加 ?admin 输一次口令（服务器 .env 里的 ADMIN_TOKEN），之后不用登录也能进公共库
if (new URLSearchParams(location.search).has('admin')) {
  const t = prompt('输入管理员口令（不需要就点取消）', store.get('cl.token', ''));
  if (t != null) store.set('cl.token', t.trim());
  history.replaceState(null, '', location.pathname);
}

// ---------- 接口 ----------
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = store.get('cl.token', '');
  if (token) headers['x-admin-token'] = token;
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const r = await fetch(path, { method: opts.body ? 'POST' : 'GET', ...opts, headers });
  // 文案库是每个客户自己的：没登录就去首页登录，登录完自动回来
  if (r.status === 401) {
    location.href = '/?login=1&back=' + encodeURIComponent(location.pathname);
    return new Promise(() => {});
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

// ---------- 一张拆解卡：原文 → 为什么能来客户 → 换到你的行业 ----------
// 套路公式、五步、骨架等仍存在样本里给出片 AI 用，界面上不再重复展示
const cardTitle = (a) => a.hook?.text || a.title;

function sampleCard(s, { onDelete } = {}) {
  const a = s.analysis; const st = s.stats || {}; const core = a.core || {};
  const who = [a.subject || a.category, a.audience].filter(Boolean).join(' · ');
  const nums = [st.likes != null && `赞 ${fmtNum(st.likes)}`, st.comments != null && `评 ${fmtNum(st.comments)}`, st.collects != null && `藏 ${fmtNum(st.collects)}`].filter(Boolean).join(' · ');
  const sec = (label, ...kids) => h('section', { class: 'cl-sec' }, h('p', { class: 'cl-k' }, label), ...kids);

  // ① 原文：一字不改，放最前面；开头的钩子原话加粗，当作标题来读
  const paras = formatRaw(s.text).split(/\n{2,}/).filter(Boolean);
  const hook = (a.hook?.text || '').trim();
  const rawBlock = h('div', { class: 'cl-raw' }, ...paras.map((p, i) => {
    if (i === 0 && hook && p.startsWith(hook)) return h('p', {}, h('b', { class: 'cl-hookline' }, hook), p.slice(hook.length));
    return h('p', {}, p);
  }));

  // ② 为什么能来客户
  const one = core.oneLine || a.highlights[0] || '';
  const why = core.why || (core.oneLine ? '' : a.highlights.slice(1).join('；'));
  const whyBlock = one ? sec('为什么能来客户', h('p', { class: 'cl-one' }, one), why ? h('p', { class: 'cl-why' }, why) : null) : null;

  // ③ 换到你的行业：示例开头 + 别照搬
  const examples = (core.examples?.length ? core.examples.map((x) => ({ k: x.industry, t: x.opening })) : a.transfer.map((x) => ({ k: x.track, t: x.opening }))).filter((x) => x.t);
  const taboo = (core.taboo || []).map((t) => String(t).replace(/^不能照搬[：:、\s]*/, ''));
  const donts = [
    ...taboo,
    ...s.risks.filter((r) => !taboo.some((t) => t.includes(r.word))).map((r) => `「${r.word}」${r.fix ? '→ 改成「' + r.fix + '」' : ''}${r.reason ? '（' + r.reason + '）' : ''}`),
  ].filter(Boolean);
  const moveBlock = examples.length || donts.length ? sec('换到你的行业',
    examples.length ? h('div', { class: 'cl-ex' }, ...examples.map((x) => h('p', {}, h('b', {}, x.k), x.t))) : null,
    donts.length ? h('p', { class: 'cl-dont' }, '别照搬：' + donts.join('；')) : null) : null;

  return h('article', { class: 'cl-card' },
    h('p', { class: 'cl-meta' }, [who, `原文 ${String(s.text || '').length} 字`, s.textRaw ? '视频转写，可能有错字' : ''].filter(Boolean).join(' · ')),
    rawBlock, whyBlock, moveBlock,
    // 直接拿这条去出片：制作台会跳过上传和听写，只要填自己的行业
    h('a', { class: 'cl-make', href: '/?copy=' + encodeURIComponent(s.id) }, '用这条做视频',
      h('span', { class: 'cl-make-sub' }, '换成你的行业，AI 照它的写法写一条原创的')),
    h('div', { class: 'cl-foot' },
      h('span', {}, [s.source?.account, nums, st.leads].filter(Boolean).join(' · ')),
      s.source?.url ? h('a', { href: s.source.url, target: '_blank', rel: 'noopener noreferrer' }, '原视频') : null,
      onDelete ? h('button', { class: 'cl-del', type: 'button', onclick: onDelete }, '删除') : null));
}


async function removeSample(s, after) {
  if (!confirm(`删除「${cardTitle(s.analysis)}」？`)) return;
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

// 转写进度：第一次用要先把听写模型下下来（约 78MB），不显示进度客户会以为死机
function asrProgress(label) {
  return (p) => {
    if (p.stage === 'download') {
      const pct = p.total ? Math.round((p.loaded / p.total) * 100) : 0;
      busy(true, `正在准备听写模型 ${pct}%（第一次用要下载约 78MB，之后就快了）`);
    } else if (p.stage === 'decode') {
      busy(true, '正在解码音轨…');
    } else if (p.stage === 'listen') {
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      busy(true, `${label} ${pct}%（第 ${p.done}/${p.total} 段）`);
    }
  };
}

// 服务端转写：视频已经在服务器磁盘上，抽音轨转文字，客户不用下 78MB 模型。
// 服务器那边不可用就返回空，调用方自动退回浏览器本地转写。
async function serverTranscribe(u, onNote) {
  const { id } = await api('/api/copy/transcribe', { json: { url: u } });
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await api('/api/copy/transcribe?id=' + encodeURIComponent(id));
    if (s.status === 'done') return s.text || '';
    if (s.status === 'error') throw new Error(s.error || '转写失败');
    const secs = Math.round((Date.now() - t0) / 1000);
    if (s.phase === 'audio') onNote?.(`正在抽音轨… ${secs} 秒`);
    else if (s.phase === 'load') onNote?.(`正在加载转写模型… ${secs} 秒`);
    else onNote?.(`服务器正在转文字… ${secs} 秒${s.done ? `（已出 ${s.done} 段）` : ''}`);
  }
}

// 视频号链接 → 下载 → 浏览器转写 → 拆解
async function fromLink(u) {
  $('err').replaceChildren();
  clearVideoBar();
  busy(true, '正在下载视频…');
  try {
    const r = await api('/api/copy/link', { json: { url: u } });
    const blob = await (await fetch(r.videoUrl)).blob();
    showVideoBar(blob, r.title);   // 先把「存到我的电脑」给出来，别等转文字
    busy(true, '下载好了，正在转文字…');

    let spoken = '';
    if (META.asrServer) {
      try {
        busy(true, '服务器正在转文字…');
        spoken = await serverTranscribe(u, (m) => busy(true, m));
        if (!spoken) throw new Error('没听出人声，这条可能只有音乐');
      } catch (e) {
        console.warn('服务端转写没成，改用浏览器本地：', e.message);
        spoken = '';
        $('err').textContent = '';
      }
    }
    if (!spoken) {
      const file = new File([blob], 'link.mp4', { type: 'video/mp4' });
      const asr = await (await loadAsr()).transcribe(file, {
        base: '/models/asr/', model: await pickAsrModel(), onProgress: asrProgress('正在转文字'),
      });
      spoken = asr.text || '';
      if (!spoken) throw new Error('没听出人声，这条可能只有音乐');
    }
    textEl.value = spoken;
    busy(true, 'AI 正在拆解（约 20 秒）');
    await analyzeText(spoken, r.title ? `来源：${r.title}\n${u}` : u);
    textEl.value = '';
  } catch (e) {
    $('err').textContent = '链接拆解失败：' + e.message;
  } finally { busy(false); }
}

// 上面那步下下来的视频只活在浏览器内存里，刷新就没了。
// 这里给一个明确的出口：点一下就落成电脑里的 mp4，文件名用视频标题 + 日期。
let lastVideo = null;
function clearVideoBar() {
  lastVideo = null;
  const bar = $('dlBar');
  if (bar) bar.remove();
}
function showVideoBar(blob, title) {
  lastVideo = { blob, title: String(title || '').trim() };
  let bar = $('dlBar');
  if (!bar) {
    bar = h('div', { class: 'cl-dlbar', id: 'dlBar' });
    $('result').before(bar);
  }
  const shown = lastVideo.title.length > 26 ? lastVideo.title.slice(0, 26) + '…' : lastVideo.title;
  bar.replaceChildren(
    h('span', { class: 'cl-dlbar-txt' }, `视频已就绪${shown ? '：' + shown : ''}`),
    h('button', { class: 'cl-dlbar-btn', type: 'button', onclick: saveVideo }, '⬇ 存到我的电脑'),
  );
}
function saveVideo() {
  if (!lastVideo?.blob) return;
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const base = (lastVideo.title || '视频号视频')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '视频号视频';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastVideo.blob);
  a.download = `${base}_${stamp}.mp4`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast('已开始下载，可以在浏览器的下载列表里找到');
}

// 视频 / 音频 → 转写 → 拆解
let asrMod = null;
const loadAsr = () => (asrMod ||= import('/engine/asr.js'));
// 听写模型：电脑上有更准的 whisper-small 就用它，没有就用安装包自带的 whisper-base
let asrModel = null;
const pickAsrModel = () => (asrModel ||= fetch('/models/asr/onnx-community/whisper-small/config.json', { cache: 'no-store' })
  .then((r) => (r.ok ? 'whisper-small' : 'whisper-base')).catch(() => 'whisper-base'));
async function fromVideo(file) {
  if (!file) return;
  if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi|flv|mp3|m4a|aac|wav|ogg|opus|amr)$/i.test(file.name)) { toast('只支持视频或音频文件'); return; }
  if (textEl.value.trim() && !confirm('输入框里已经有文字了，用视频转出来的文字替换它吗？')) return;
  $('err').replaceChildren();
  clearVideoBar();
  const t0 = Date.now();
  busy(true, '正在转文字…');
  const timer = setInterval(() => busy(true, `转文字 ${Math.round((Date.now() - t0) / 1000)} 秒，大约是视频时长的 2/3`), 1000);
  try {
    const asr = await (await loadAsr()).transcribe(file, {
      base: '/models/asr/', model: await pickAsrModel(), onProgress: asrProgress('正在转文字'),
    });
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
    const heat = st.likes != null ? `赞 ${fmtNum(st.likes)}` : '';
    const who = [a.subject || a.category, a.audience === '家长' ? '给家长' : a.audience === '学生' ? '给学生' : a.audience].filter(Boolean).join(' · ');
    return h('button', { class: 'cl-sample', type: 'button', onclick: () => openModal(s.id) },
      who ? h('p', { class: 'cl-sample-who' }, who) : null,
      h('h4', {}, cardTitle(a)),
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
  if (!META.ai) $('err').textContent = '还没填 AI 密钥，暂时不能拆解。点右下角的「出片王」版本号 →「去填」';
  show(store.get('cl.view', 'add') === 'lib' ? 'lib' : 'add');
  if (!$('vAdd').classList.contains('hidden')) textEl.focus();
})();

