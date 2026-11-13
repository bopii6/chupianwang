import { forms, categories } from './forms/registry.js';
import { W, H } from './engine/draw.js';
import { buildTimeline, synthesize, mixAudio, mixWithBgm, envelope, getAudioCtx } from './engine/timeline.js';
import { BGM_STYLES, renderBgm, warmBgm } from './engine/music.js';
import { listPhotos, savePhoto, deletePhoto, shrinkPhoto } from './engine/photos.js';
import { exportInWorker, exportSupported } from './engine/exporter.js';

const $ = (s) => document.querySelector(s);
const FPS = 24; // 与对标样片一致；图文动效 24 帧足够流畅，比 30 帧少 20% 渲染量
const IDEAS = ['孩子数学卡在70分怎么办', '少儿编程到底有什么用', '中考英语听说怎么提分', '暑假班招生，6人小班'];
const VOICES = [
  { id: 'zh-CN-YunxiNeural', name: '云希', desc: '阳光男声 · 适合知识讲解', av: '希' },
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', desc: '温暖女声 · 适合家长沟通', av: '晓' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', desc: '新闻播音 · 适合数据分析', av: '扬' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', desc: '活泼女声 · 适合低龄课程', av: '伊' },
  { id: 'zh-CN-YunjianNeural', name: '云健', desc: '激情男声 · 适合招生促单', av: '健' },
];
const SCENE_NAMES = { field: '野外', room: '书房', classroom: '教室', exam: '考场', home: '客厅', street: '街市', river: '河边' };
/** 每个形式记住自己的皮肤 */
const skinOf = () => { const ks = Object.keys(state.form.module.skins); const v = prefs.skins?.[state.form.id]; return ks.includes(v) ? v : ks[0]; };
/** 用来展示一段“完整搭好”样子的时间点 */
const showcaseTime = (p) => (p.conclusion != null ? Math.min(p.end - 0.05, p.conclusion + 1.2) : Math.max(p.start + 0.3, Math.min(p.end - 0.1, (p.lineEnd ?? p.end) - 0.3)));
const MOD_NAMES = { compare: '对比', stats: '数据卡', grid: '清单', flow: '流程', list: '要点', none: '标题' };
const VIS_NAMES = { shot: '画面', chips: '蓝标签', quote: '引语', question: '提问', title: '大标题', tags: '标签', table: '表格', stat: '大数字', emoji: '贴纸', list: '清单', type: '打字', icons: '图标', avatar: '人设', tree: '路线图', big: '大字', cards: '资料卡', follow: '关注' };

// ---------- 偏好记忆（只是方便，读写失败也不影响使用） ----------
const prefs = Object.assign({ account: '', skinId: 'blackGold', voice: VOICES[0].id, rate: '+8%', minutes: 2 }, (() => {
  try { return JSON.parse(localStorage.getItem('ycp.prefs') || '{}'); } catch { return {}; }
})());
const savePrefs = () => { try { localStorage.setItem('ycp.prefs', JSON.stringify(prefs)); } catch { /* ignore */ } };

const state = {
  form: null, script: null, input: '',
  tl: null, planData: null, master: null, env: null, buffers: null, audioKey: '',
  t: 0, playing: false, playStartCtx: 0, playStartT: 0, playStartPerf: 0, source: null,
  exporting: null, voiceJob: 0, attachments: [],
};
const INPUT_PLACEHOLDER = '比如：我教成人钢琴，想讲讲为什么很多人练了半年还弹不完一首曲子';
let aiReady = false;
let asrBase = '/models/asr/'; let asrModel = 'whisper-base'; // 听写模型的位置（正式上线可放 CDN，服务端设 ASR_MODEL_BASE）

// ================= 视图切换 =================
// 只有两个页面：首页（一个大框）→ 看成片
function show(view) {
  for (const v of ['gallery', 'studio']) $('#' + v).classList.toggle('hidden', v !== view);
  if (view !== 'gallery') stopHover(); else drawCovers();
  if (view !== 'studio') stop();
  $('#crumb').innerHTML = view === 'gallery' ? '' : `<span>/</span><b>${state.remix ? '爆款变原创' : state.form?.name || ''}</b>`;
  window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); if (!state.exporting) show(nav.dataset.nav); }
});

// ================= ① 首页：一个大框 =================
// 上面两种开始方式（说一句话 / 用别人的爆款做），中间一排模板缩略图（鼠标移上去播放效果），右下角生成
let galleryLoop = 0;
const previewCache = new Map();
const formOf = (id) => forms.find((f) => f.id === id);
const prepScript = (form, raw) => (form.module.normalize ? form.module.normalize(raw, splitLongLine) : normalize(raw));
const TPL_USE = { 'photo-talk': '招生 · 招商', 'series-intro': '涨粉', 'deep-dive': '立专业人设', 'pixel-story': '好转发', 'data-card': '讲知识点' };
function loadPreview(form) {
  if (!previewCache.has(form.id)) {
    previewCache.set(form.id, (async () => {
      const script = prepScript(form, await (await fetch(form.sample)).json());
      await form.module.preloadFonts(script);
      const tl = buildTimeline(script, null);
      const d = { script, tl, planData: form.module.plan(script, tl), assets: null };
      // 实拍类套路：示例里写好了图片地址。封面那张先加载，其余后台慢慢加载（首页卡片用小图）
      if (form.needsStock) {
        d.assets = { media: [] };
        const load = (i) => script.sections[i]?.src ? fetch(script.sections[i].src.replace(/w=d+/, 'w=640')).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((bm) => { d.assets.media[i] = bm; }).catch(() => {}) : null;
        const cover = Math.min(form.coverIdx ?? 1, script.sections.length - 1);
        await load(cover);
        script.sections.forEach((_, i) => { if (i !== cover) load(i); });
      }
      return d;
    })());
  }
  return previewCache.get(form.id);
}
const GW = 360; const GH = 640;
function drawPreview(ctx, form, d, t) {
  ctx.setTransform(GW / W, 0, 0, GH / H, 0, 0);
  form.module.drawFrame(ctx, { script: d.script, tl: d.tl, planData: d.planData, t, skinId: Object.keys(form.module.skins)[0], env: null, fps: FPS, assets: d.assets });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
const coverIdx = (form, d) => Math.min(form?.coverIdx ?? 1, d.planData.length - 1);
const coverTime = (d, form) => showcaseTime(d.planData[coverIdx(form, d)]);
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderStrip() {
  $('#tplCount').textContent = `共 ${forms.length} 个`;
  $('#tplStrip').innerHTML = forms.map((f, i) => `
    <button class="t" data-id="${f.id}" type="button" title="${esc(f.outcome || f.tagline)}" style="--i:${i}">
      <span class="thumb"><canvas width="${GW}" height="${GH}"></canvas><span class="prog"><i></i></span><span class="ok">${CHECK}</span><span class="rec-badge">推荐</span></span>
      <b>${f.name}</b><small>${TPL_USE[f.id] || f.category}</small>
    </button>`).join('');
  document.querySelectorAll('#tplStrip .t').forEach((el) => {
    el.addEventListener('mouseenter', () => startHover(el));
    el.addEventListener('mouseleave', () => stopHover(el));
  });
  drawCovers();
  requestAnimationFrame(updateTplNav);
}
// 模板多了（将来 10 个以上）就横向滑动：两边出现箭头和渐隐
function updateTplNav() {
  const s = $('#tplStrip'); const max = s.scrollWidth - s.clientWidth;
  $('#tplWrap').classList.toggle('can-prev', s.scrollLeft > 4);
  $('#tplWrap').classList.toggle('can-next', s.scrollLeft < max - 4);
}
$('#tplStrip').addEventListener('scroll', updateTplNav, { passive: true });
$('#tplPrev').addEventListener('click', () => $('#tplStrip').scrollBy({ left: -$('#tplStrip').clientWidth * 0.8, behavior: 'smooth' }));
$('#tplNext').addEventListener('click', () => $('#tplStrip').scrollBy({ left: $('#tplStrip').clientWidth * 0.8, behavior: 'smooth' }));
function drawCovers() {
  // 五个模板同时加载，谁先好谁先画（之前是一个个排队，后面几个要等很久）
  for (const el of document.querySelectorAll('#tplStrip .t')) {
    const f = formOf(el.dataset.id);
    loadPreview(f).then((d) => { if (hoverEl !== el) drawPreview(el.querySelector('canvas').getContext('2d'), f, d, coverTime(d, f)); });
  }
}
let hoverEl = null;
async function startHover(el) {
  cancelAnimationFrame(galleryLoop);
  hoverEl = el;
  const f = formOf(el.dataset.id);
  const d = await loadPreview(f);
  if (hoverEl !== el) return;
  const ctx = el.querySelector('canvas').getContext('2d');
  const bar = el.querySelector('.prog i');
  const dur = Math.min(d.tl.duration, 40);
  const t0 = performance.now(); let last = 0;
  const loop = (now) => {
    galleryLoop = requestAnimationFrame(loop);
    if (now - last < 1000 / 30) return;
    last = now;
    const t = ((now - t0) / 1000) % dur;
    drawPreview(ctx, f, d, t);
    if (bar) bar.style.width = `${(t / dur) * 100}%`;
  };
  galleryLoop = requestAnimationFrame(loop);
}
function stopHover(el = hoverEl) {
  cancelAnimationFrame(galleryLoop);
  if (!el) return;
  if (hoverEl === el) hoverEl = null;
  const bar = el.querySelector('.prog i'); if (bar) bar.style.width = '0';
  const f = formOf(el.dataset.id);
  loadPreview(f).then((d) => { if (hoverEl !== el) drawPreview(el.querySelector('canvas').getContext('2d'), f, d, coverTime(d, f)); });
}

/** 选模板：记住选择，换示例句、照片区 */
function selectForm(id) {
  state.form = formOf(id) || forms[0];
  prefs.formId = state.form.id; savePrefs();
  document.querySelectorAll('#tplStrip .t').forEach((el) => el.classList.toggle('on', el.dataset.id === state.form.id));
  ideaSeen = new Set();
  renderIdeas(true);
  const usesPhotos = state.form.needsPhotos || state.form.photoKind === 'scenes';
  $('#photoPanel').classList.toggle('hidden', !usesPhotos);
  $('#photoPanel .photos-head b').textContent = photoKind() === 'scenes' ? '我的现场照片（可选）' : '我的形象照（可选）';
  $('#photoPanel .photos-head span').textContent = state.form.photoHint || '3–6 张半身照，换不同手势，会自动抠图；不传就用卡通讲师。照片只存在你自己的电脑里。';
  renderPhotoRows();
  warmBgm(bgmOf().style, getAudioCtx().sampleRate); // 用户打字时，后台先把音乐合成好
}
$('#tplStrip').addEventListener('click', (e) => {
  const el = e.target.closest('.t'); if (!el) return;
  if (state.mode === 'video') rm.userPicked = true;
  selectForm(el.dataset.id);
});
// 灵感句：覆盖各种培训（不只是学科），按模板的用途分组；客户刚来没想法，点一点就能出片
const IDEA_POOL = {
  'photo-talk': ['成人钢琴暑假班招生，一对一小课', '美甲培训新一期开班，零基础也能学', '驾校周末班开始报名了', '考教资冲刺班，最后 30 天怎么学', '少儿编程体验课，带孩子来试一节', '成人英语口语班，下班后也能学'],
  'series-intro': ['每晚 10 分钟，带你学一个乐理知识', '30 天学会美甲基础', '每天一道科目一易错题', '每天 1 分钟，练一句地道英语口语', '每晚睡前讲一个数学解题思路'],
  'deep-dive': ['为什么很多人学了半年钢琴，还弹不完一首曲子', '为什么考教资一次过的人越来越少', '为什么有的美甲学徒三年都出不了师', '为什么越来越多成年人开始学跳舞'],
  'pixel-story': ['学习方法比努力更重要', '别等到考前才开始复习', '学手艺最怕三天打鱼两天晒网', '一个零基础学员，三个月开始接单的故事'],
  'data-card': ['驾考科目二最常挂的 3 个点', '学美甲最容易踩的 3 个坑', '初中数学提分的 3 个真相', '成人学钢琴的 4 个误区'],
};
let ideaSeen = new Set();
function pickIdeas(n = 4) {
  const own = [...(IDEA_POOL[state.form?.id] || IDEAS)];
  const others = Object.entries(IDEA_POOL).filter(([k]) => k !== state.form?.id).flatMap(([, v]) => v);
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  let pool = [...shuffle(own.filter((x) => !ideaSeen.has(x))), ...shuffle(others.filter((x) => !ideaSeen.has(x)))];
  if (pool.length < n) { ideaSeen = new Set(); pool = [...shuffle(own), ...shuffle(others)]; }
  const out = pool.slice(0, n); out.forEach((x) => ideaSeen.add(x));
  return out;
}
const SPARK = '<svg viewBox="0 0 24 24"><path d="M12 3.5c.4 3.9 2.6 6.1 6.5 6.5-3.9.4-6.1 2.6-6.5 6.5-.4-3.9-2.6-6.1-6.5-6.5 3.9-.4 6.1-2.6 6.5-6.5zM18.5 15.5c.2 1.6 1 2.4 2.5 2.5-1.6.2-2.4 1-2.5 2.5-.2-1.6-1-2.4-2.5-2.5 1.6-.2 2.4-1 2.5-2.5z" fill="currentColor"/></svg>';
const SHUFFLE = '<svg viewBox="0 0 24 24"><path d="M4 7h3.5c2.2 0 3.5 1.2 4.6 3.3l.8 1.4c1.1 2.1 2.4 3.3 4.6 3.3H20M17 4.5 20 7l-3 2.5M4 17h3.5c1.4 0 2.4-.5 3.2-1.4M13.3 8.4c.8-.9 1.8-1.4 3.2-1.4M17 14.5l3 2.5-3 2.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let ideasFor = '';
function renderIdeas(force = false) {
  $('#ideas').classList.toggle('hidden', state.mode !== 'say');
  if (!force && ideasFor === state.form?.id && $('#ideas').children.length) return; // 切标签不重新抽
  ideasFor = state.form?.id || '';
  $('#ideas').innerHTML = `<span class="sp-label">${SPARK}不知道说什么？点一个试试</span>`
    + pickIdeas().map((q, i) => `<button class="sp" type="button" style="--i:${i}">${esc(q)}</button>`).join('')
    + `<button class="sp-more" type="button" title="换一批">${SHUFFLE}换一批</button>`;
}
// 点灵感：像打字一样填进输入框（快速，不让人等）
let typeTimer = 0;
function typeInto(text) {
  const ta = $('#input');
  clearInterval(typeTimer);
  ta.value = ''; let i = 0;
  ta.classList.add('typing');
  typeTimer = setInterval(() => {
    i = Math.min(text.length, i + 2);
    ta.value = text.slice(0, i); autoGrow(ta);
    if (i >= text.length) { clearInterval(typeTimer); ta.classList.remove('typing'); ta.focus(); ta.setSelectionRange(text.length, text.length); $('#createErr').textContent = ''; }
  }, 22);
}
/** 两种开始方式：say = 说一句你要讲什么；video = 用别人的爆款做 */
function setMode(m) {
  state.mode = m;
  if (m === 'say') state.remix = null;
  $('#modeTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  moveTabInd();
  $('#paneSay').classList.toggle('hidden', m !== 'say');
  $('#paneVideo').classList.toggle('hidden', m !== 'video');
  $('#sayTools').classList.toggle('hidden', m !== 'say');
  $('#tplHint').textContent = m === 'say' ? 'AI 会按它的结构来写' : '画面用哪个模板做';
  $('#createErr').textContent = aiReady ? '' : $('#createErr').textContent;
  renderIdeas(); updateGo();
  if (m === 'say') setTimeout(() => $('#input').focus(), 30);
}
$('#modeTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.mode !== state.mode) setMode(b.dataset.mode); });
function moveTabInd() {
  const on = $('#modeTabs button.on'); if (!on) return;
  const ind = $('#tabInd'); ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
window.addEventListener('resize', () => { moveTabInd(); updateTplNav(); document.querySelectorAll('.seg').forEach(moveSegThumb); });
function updateGo() {
  const b = $('#btnGo');
  if (state.mode === 'video') {
    b.disabled = !rm.file || !!rm.error;
    b.firstChild.textContent = rm.wantGo && rm.busy ? '听完就开始写…' : '生成我的原创视频';
  } else { b.disabled = false; b.firstChild.textContent = '生成视频'; }
}
// 拖文件进首页：视频 → 用别人的爆款做；PPT/文档 → 当资料
const isVideoFile = (f) => /^(video|audio)\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|aac)$/i.test(f.name);
const home = $('#gallery');
home.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('#box').classList.add('drop'); } });
home.addEventListener('dragleave', (e) => { if (!home.contains(e.relatedTarget)) $('#box').classList.remove('drop'); });
home.addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files || [])]; if (!files.length) return;
  e.preventDefault(); $('#box').classList.remove('drop');
  const vid = files.find(isVideoFile); const docs = files.filter((f) => !isVideoFile(f));
  if (vid) { setMode('video'); pickRemixFile(vid); } else { setMode('say');
loadMe();
// 字体加载完再摆好滑块的位置，然后才打开过渡动画（避免一进来滑块乱飞）
document.fonts.ready.then(() => { moveTabInd(); moveSegThumb($('#minutes')); updateTplNav(); requestAnimationFrame(() => document.body.classList.add('ready')); }); addFiles(docs); }
});

// ================= 说一句话 =================
$('#ideas').addEventListener('click', (e) => {
  const more = e.target.closest('.sp-more');
  if (more) { more.classList.remove('spin'); void more.offsetWidth; more.classList.add('spin'); setTimeout(() => renderIdeas(true), 120); return; }
  const b = e.target.closest('.sp'); if (!b) return;
  document.querySelectorAll('#ideas .sp').forEach((x) => x.classList.toggle('picked', x === b));
  typeInto(b.textContent);
});
$('#input').addEventListener('input', (e) => { autoGrow(e.target); $('#createErr').textContent = ''; });
$('#input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); });
$('#account').addEventListener('input', (e) => { prefs.account = e.target.value.trim(); savePrefs(); });
$('#minutes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.minutes = Number(b.dataset.v); savePrefs(); setSeg('#minutes', b.dataset.v);
});
$('#btnGo').addEventListener('click', () => ensureLogin(state.mode === 'video' ? '登录后就能用这条爆款做视频' : '登录后就能生成视频').then(() => (state.mode === 'video' ? goRemix() : (state.remix = null, generate()))).catch(() => {}));
$('#btnSample').addEventListener('click', async () => {
  primeAudio();
  enterStudio();
  overlaySpin('正在载入示例', '');
  const script = await (await fetch(state.form.sample)).json();
  if (prefs.account) script.account = prefs.account;
  await startWithScript(script);
});

// ---------- 添加资料：PPT / Word / PDF / TXT / 网页链接 ----------
let docsMod = null;
const loadDocs = () => (docsMod ||= import('./engine/docs.js'));
const fmtChars = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 万字' : n + ' 字');
const KIND_LABEL = { pptx: 'PPT', docx: 'Word', pdf: 'PDF', txt: 'TXT', md: 'TXT', link: '链接' };
function renderAttachments() {
  const box = $('#attachments');
  box.classList.toggle('hidden', !state.attachments.length);
  box.innerHTML = state.attachments.map((a, i) => `
    <div class="att ${a.loading ? 'loading' : ''}" title="${esc(a.url || a.name)}">
      <span class="att-kind k-${a.kind}">${KIND_LABEL[a.kind] || '资料'}</span>
      <span class="att-name">${esc(a.name)}</span>
      <span class="att-meta">${a.loading ? '正在读取…' : `${a.meta} · ${fmtChars(a.chars)}`}</span>
      ${a.loading ? '<i class="att-spin"></i>' : `<button class="att-x" data-i="${i}" aria-label="移除">×</button>`}
    </div>`).join('');
  $('#input').placeholder = state.attachments.length
    ? '想重点讲哪部分？不写也行，AI 会从资料里挑最能获客的内容'
    : INPUT_PLACEHOLDER;
}
async function addMaterial(job, label, kind) {
  if (state.attachments.filter((a) => !a.loading).length >= 6) { $('#createErr').textContent = '最多添加 6 份资料'; return; }
  const ph = { name: label, kind, loading: true };
  state.attachments.push(ph); renderAttachments();
  $('#createErr').textContent = '';
  try {
    const r = await job();
    Object.assign(ph, r, { loading: false });
  } catch (err) {
    state.attachments.splice(state.attachments.indexOf(ph), 1);
    $('#createErr').textContent = err.message || '这份资料读不出来';
  }
  renderAttachments();
}
function addFiles(files) {
  const vid = files.find(isVideoFile);
  if (vid) { setMode('video'); pickRemixFile(vid); }
  for (const f of files.filter((x) => !isVideoFile(x))) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    addMaterial(async () => (await loadDocs()).extractFile(f), f.name, ext);
  }
}
$('#btnAttach').addEventListener('click', () => $('#docInput').click());
$('#docInput').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
$('#btnLink').addEventListener('click', () => {
  $('#linkRow').classList.toggle('hidden');
  if (!$('#linkRow').classList.contains('hidden')) $('#linkInput').focus();
});
function submitLink() {
  const url = $('#linkInput').value.trim();
  if (!url) return;
  $('#linkInput').value = ''; $('#linkRow').classList.add('hidden');
  addMaterial(async () => (await loadDocs()).extractUrl(url), url.replace(/^https?:\/\//, '').slice(0, 40), 'link');
}
$('#linkAdd').addEventListener('click', submitLink);
$('#linkInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitLink(); } if (e.key === 'Escape') $('#linkRow').classList.add('hidden'); });
$('#attachments').addEventListener('click', (e) => {
  const b = e.target.closest('.att-x'); if (!b) return;
  state.attachments.splice(Number(b.dataset.i), 1); renderAttachments();
});
// 直接粘贴一个链接也自动识别
$('#input').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); return; }
  const t = (e.clipboardData?.getData('text') || '').trim();
  if (/^https?:\/\/\S+$/.test(t) && !$('#input').value.trim()) {
    e.preventDefault();
    addMaterial(async () => (await loadDocs()).extractUrl(t), t.replace(/^https?:\/\//, '').slice(0, 40), 'link');
  }
});

async function generate(input = $('#input').value.trim()) {
  if (state.remix) return replicate();
  if (state.attachments.some((a) => a.loading)) { $('#createErr').textContent = '资料还在读取，稍等一下'; return; }
  const materials = state.attachments.map((a) => ({ name: a.name, text: a.text }));
  if (!input && !materials.length) { $('#createErr').textContent = '先写一句你想讲什么，或者添加一份资料'; $('#input').focus(); return; }
  if (!aiReady) { $('#createErr').textContent = '服务端还没配置 AI 密钥，可以先看示例。'; return; }
  state.input = input;
  primeAudio();
  enterStudio();
  overlaySpin(materials.length ? 'AI 正在读你的资料' : 'AI 正在写文案', materials.length ? '挑出最能获客的内容，按「' + state.form.name + '」的结构来写，大约 20 秒' : '按「' + state.form.name + '」的结构来写，大约 10 秒');
  try {
    const r = await fetch('/api/script', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: state.form.id, input, materials, minutes: prefs.minutes, account: prefs.account }),
    });
    const data = await r.json();
    onAuthFail(r);
    if (!r.ok) throw new Error(data.error || '生成失败');
    data.account = prefs.account || data.account || '';
    await startWithScript(state.form.module.normalize ? state.form.module.normalize(data, splitLongLine) : normalize(data));
  } catch (err) {
    overlayMessage('没写成功', err.message, [
      { label: '返回修改', primary: true, fn: () => show('gallery') },
      { label: '再试一次', fn: () => generate(input) },
    ]);
  }
}


// ================= ②' 爆款变原创：别人的爆款视频 + 你的行业 + 获客模板 = 你的原创视频 =================
// 上传视频 → 浏览器里转成文字（不上传视频）→ AI 拆出为什么火 → 照它的打法换成你的行业写 → 选的模板出片
const rm = { file: null, job: 0, text: '', plan: null, error: '', busy: false, form: '', wantGo: false };
let asrMod = null;
const loadAsr = () => (asrMod ||= import('./engine/asr.js'));
const MB = (n) => Math.round(n / 1048576);

function openRemix(file) {
  show('gallery');
  setMode('video');
  if (file) pickRemixFile(file);
}
/** AI 推荐的模板：缩略图上标“推荐”；用户没自己选过就自动选上 */
function renderRemixForms() {
  document.querySelectorAll('#tplStrip .t').forEach((el) => el.classList.toggle('rec', state.mode === 'video' && el.dataset.id === rm.plan?.form));
  if (rm.plan?.form && !rm.userPicked && state.mode === 'video') selectForm(rm.plan.form);
}
function remixStatus(text, pct = null, cls = '') {
  $('#rmStatus').textContent = text;
  $('#rmStatus').className = 'rm-status ' + cls;
  $('#rmBar').parentElement.classList.toggle('hidden', pct == null);
  if (pct != null) $('#rmBar').style.width = `${Math.max(3, Math.min(100, pct))}%`;
}
function renderRemixPlan() {
  const p = rm.plan;
  $('#rmPlan').classList.toggle('hidden', !p);
  if (!p) return;
  $('#rmPlan').innerHTML = `
    <div class="rp-k">这条为什么火</div>
    <p class="rp-why">${esc(p.why)}</p>
    ${p.moves.length ? `<div class="rp-k">它的文案套路，我们照着写</div><ol class="rp-moves">${p.moves.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>` : ''}
    <details class="rp-src"><summary>看原视频说了什么</summary><p>${esc(rm.text)}</p></details>`;
}
function pickRemixFile(file) {
  if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|aac)$/i.test(file.name)) {
    $('#createErr').textContent = '这不是视频文件。请上传 MP4、MOV 这类视频'; return;
  }
  ensureLogin('登录后就能拆解这条爆款视频').then(() => runRemix(file.name, async (opts) => (await loadAsr()).transcribe(file, opts))).catch(() => {});
}
/** 手机扫码传来的声音（16kHz 单声道），跳过解码直接转文字 */
function pickRemixAudio(name, audio) {
  ensureLogin('登录后就能拆解这条爆款视频').then(() => runRemix(name, async (opts) => (await loadAsr()).transcribeAudio(audio, opts))).catch(() => {});
}
async function runRemix(name, listen) {
  closeQr();
  const job = ++rm.job;
  Object.assign(rm, { file: { name }, text: '', plan: null, error: '', busy: true, userPicked: false });
  $('#createErr').textContent = '';
  $('#rmEmpty').classList.add('hidden'); $('#rmFile').classList.remove('hidden');
  $('#rmName').textContent = name;
  renderRemixPlan(); renderRemixForms(); updateGo();
  try {
    remixStatus('正在读取视频里的声音…', 4);
    const t0 = performance.now();
    const { text } = await listen({
      base: asrBase, model: asrModel,
      onProgress: (p) => {
        if (job !== rm.job) return;
        if (p.stage === 'download') remixStatus(`第一次使用，正在下载听写模型 ${Math.round((p.loaded / p.total) * 100)}%（共 ${MB(p.total)}MB，只下载这一次）`, 5 + (p.loaded / p.total) * 25);
        if (p.stage === 'listen') {
          const sec = Math.round((performance.now() - t0) / 1000);
          remixStatus(`正在听视频里说了什么… ${p.done}/${p.total} 段（已用 ${sec} 秒）`, 30 + (p.done / p.total) * 55);
        }
      },
    });
    if (job !== rm.job) return;
    rm.text = text;
    remixStatus('听完了，正在拆它为什么火…', 90);
    const r = await fetch('/api/remix-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: text, forms: forms.map((f) => ({ id: f.id, name: f.name, fit: f.fits || f.outcome || f.tagline })) }),
    });
    const data = await r.json();
    onAuthFail(r);
    if (!r.ok) throw new Error(data.error || '拆解失败');
    if (job !== rm.job) return;
    rm.plan = data;
    rm.busy = false;
    remixStatus(`已拆解 · ${data.topic || '原视频'}`, null, 'ok');
    renderRemixPlan(); renderRemixForms(); updateGo();
    if (rm.wantGo) replicate();
  } catch (err) {
    if (job !== rm.job) return;
    Object.assign(rm, { busy: false, error: err.message, wantGo: false });
    remixStatus(err.message, null, 'bad');
    updateGo();
  }
}
// ---------- 手机扫码上传：手机上拆出声音，只传声音过来 ----------
let qr = null;
function closeQr() {
  if (qr) clearTimeout(qr.timer);
  qr = null;
  $('#rmQr').classList.add('hidden'); $('#rmQrBtn').classList.remove('hidden');
}
async function openQr() {
  closeQr();
  $('#rmQrBtn').classList.add('hidden'); $('#rmQr').classList.remove('hidden');
  $('#rmQrSt').textContent = '正在生成二维码…'; $('#rmQrTip').textContent = ''; $('#rmQrImg').removeAttribute('src');
  try {
    const r = await fetch('/api/relay', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '生成二维码失败');
    // 本机开发时 localhost 手机打不开，换成电脑的局域网地址
    let origin = location.origin; let lan = false;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && d.lan?.length) { origin = `${location.protocol}//${d.lan[0]}${location.port ? ':' + location.port : ''}`; lan = true; }
    const url = `${origin}/m/up.html#id=${d.id}&k=${d.k}`;
    $('#rmQrImg').src = '/api/qr?text=' + encodeURIComponent(url);
    $('#rmQrSt').textContent = '在手机上选好视频，会自动传到这里';
    $('#rmQrTip').textContent = lan ? '手机要和这台电脑连同一个 Wi-Fi' : '';
    const sess = qr = { id: d.id, k: d.k, timer: 0 };
    const poll = async () => {
      if (qr !== sess) return;
      try {
        const res = await fetch(`/api/relay/${sess.id}?k=${encodeURIComponent(sess.k)}`);
        const s = await res.json();
        if (qr !== sess) return;
        if (res.status === 410) { $('#rmQrSt').textContent = '二维码过期了'; $('#rmQrTip').innerHTML = '<button class="link" id="rmQrAgain" type="button">重新生成</button>'; return; }
        const nm = s.name ? `「${s.name}」` : '';
        if (s.state === 'picked' || s.state === 'decoding') $('#rmQrSt').textContent = `手机已选好${nm}，正在读取声音…`;
        if (s.state === 'uploading') $('#rmQrSt').textContent = '正在从手机传过来…';
        if (s.state === 'failed') $('#rmQrSt').textContent = '手机上没传成功，可以在手机上再选一次';
        if (s.state === 'ready') {
          $('#rmQrSt').textContent = '收到了，正在接收…';
          const a = await fetch(`/api/relay/${sess.id}/audio?k=${encodeURIComponent(sess.k)}`);
          if (!a.ok) throw new Error('接收失败');
          const { fromPcm16 } = await loadAsr();
          const audio = fromPcm16(await a.arrayBuffer());
          if (qr === sess) pickRemixAudio(s.name || '手机上的视频', audio);
          return;
        }
      } catch { /* 网络抖动，下一轮再试 */ }
      sess.timer = setTimeout(poll, 1500);
    };
    sess.timer = setTimeout(poll, 1500);
  } catch (err) {
    $('#rmQrSt').textContent = err.message;
  }
}
$('#rmQrBtn').addEventListener('click', openQr);
$('#rmQrClose').addEventListener('click', closeQr);
$('#rmQr').addEventListener('click', (e) => { if (e.target.id === 'rmQrAgain') openQr(); });

$('#rmDrop').addEventListener('click', (e) => { if (!e.target.closest('#rmFile')) $('#rmInput').click(); });
$('#rmChange').addEventListener('click', () => $('#rmInput').click());
$('#rmInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) pickRemixFile(f); });
$('#rmIndustry').addEventListener('input', (e) => { prefs.industry = e.target.value.trim(); savePrefs(); $('#createErr').textContent = ''; });
$('#rmIndustry').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnGo').click(); });
function goRemix() {
  if (!$('#rmIndustry').value.trim()) { $('#createErr').textContent = '先写一下你是做什么培训的，AI 才知道换成什么内容'; $('#rmIndustry').focus(); return; }
  if (!aiReady) { $('#createErr').textContent = '服务端还没配置 AI 密钥'; return; }
  if (rm.busy) { rm.wantGo = true; updateGo(); return; } // 还在听，听完自动开始
  replicate();
}

async function replicate() {
  rm.wantGo = false; updateGo();
  const industry = $('#rmIndustry').value.trim() || prefs.industry || '';
  state.remix = { industry, plan: rm.plan, form: state.form.id };
  state.input = '';
  primeAudio();
  enterStudio();
  overlaySpin('AI 正在写你的原创文案', `学爆款的文案套路，内容换成「${industry}」，大约 20 秒`);
  try {
    const r = await fetch('/api/script', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: state.form.id, reference: rm.text, plan: rm.plan, industry, minutes: prefs.minutes, account: prefs.account }),
    });
    const data = await r.json();
    onAuthFail(r);
    if (!r.ok) throw new Error(data.error || '生成失败');
    data.account = prefs.account || data.account || '';
    await startWithScript(prepScript(state.form, data));
  } catch (err) {
    overlayMessage('没写成功', err.message, [
      { label: '返回修改', primary: true, fn: () => openRemix() },
      { label: '再试一次', fn: () => replicate() },
    ]);
  }
}
$('#rmNote').addEventListener('click', (e) => { if (e.target.id === 'rmBack' && !state.exporting) openRemix(); });
function renderRemixNote() {
  const p = state.remix?.plan;
  $('#rmNote').classList.toggle('hidden', !p);
  if (p) $('#rmNote').innerHTML = `<b>参考的爆款：</b>${esc(p.topic || '你上传的视频')}<span>${esc(p.why)}</span><button class="link quiet" id="rmBack" type="button">换个模板或行业</button>`;
}


// ================= 登录（邮箱验证码） =================
// 随便看、随便点不用登录；点“生成”或上传别人的爆款视频时才要求登录，登录完自动接着做
let me = null;
let loginWaiters = [];
async function loadMe() {
  try { const d = await (await fetch('/api/auth/me')).json(); me = d.user; } catch { me = null; }
  renderAcct();
}
function renderAcct() {
  $('#acctArea').innerHTML = me
    ? `<button class="me" id="btnMe" type="button"><i>${esc(me.email[0].toUpperCase())}</i><span>${esc(me.email)}</span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
       <div class="me-menu" id="meMenu"><div class="me-head">${esc(me.email)}<small>${me.plan === 'trial' ? '免费试用中' : '已开通'}</small></div><button type="button" id="btnLogout">退出登录</button></div>`
    : '<span class="trial">新用户免费试做 3 条</span><button class="btn-login" id="btnLogin" type="button">登录</button>';
}
$('#acctArea').addEventListener('click', async (e) => {
  if (e.target.closest('#btnLogin')) return void ensureLogin().catch(() => {});
  if (e.target.closest('#btnMe')) return void $('#acctArea').classList.toggle('open');
  if (e.target.closest('#btnLogout')) {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    me = null; $('#acctArea').classList.remove('open'); renderAcct(); toast('已退出登录');
  }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#acctArea')) $('#acctArea').classList.remove('open'); });

/** 已登录直接继续；没登录弹出登录框，登录成功后继续（关掉框就算了） */
function ensureLogin(reason) {
  if (me) return Promise.resolve(me);
  return new Promise((resolve, reject) => { loginWaiters.push({ resolve, reject }); openLogin(reason); });
}
const dlg = $('#loginDlg');
let resendTimer = 0;
function lgStep(n) {
  $('#lgStep1').classList.toggle('hidden', n !== 1);
  $('#lgStep2').classList.toggle('hidden', n !== 2);
  $('#lgErr').textContent = '';
  setTimeout(() => (n === 1 ? $('#lgEmail') : $('#lgCode')).focus(), 60);
}
function openLogin(reason) {
  if (dlg.open) return;
  $('#lgSub').textContent = reason || '新用户免费试做 3 条';
  $('#lgEmail').value = prefs.email || '';
  $('#lgCode').value = ''; $('#lgDev').classList.add('hidden');
  lgStep(1);
  dlg.showModal();
}
dlg.addEventListener('close', () => {
  clearInterval(resendTimer);
  const ws = loginWaiters; loginWaiters = [];
  for (const w of ws) (me ? w.resolve(me) : w.reject(new Error('cancel')));
});
$('#lgClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // 点框外关闭
function countdown(sec) {
  clearInterval(resendTimer);
  const b = $('#lgResend'); let left = sec;
  const tick = () => { b.disabled = left > 0; b.textContent = left > 0 ? `${left} 秒后可以重新发送` : '没收到？重新发送'; left--; if (left < -1) clearInterval(resendTimer); };
  tick(); resendTimer = setInterval(tick, 1000);
}
async function sendCode() {
  const email = $('#lgEmail').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { $('#lgErr').textContent = '邮箱格式不对，检查一下'; $('#lgEmail').focus(); return; }
  const b = $('#lgSend'); b.disabled = true; b.firstChild.textContent = '正在发送…';
  try {
    const r = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const d = await r.json();
    if (!r.ok && r.status !== 429) throw new Error(d.error || '发送失败');
    prefs.email = email; savePrefs();
    $('#lgTo').textContent = email;
    lgStep(2); countdown(d.wait || 60);
    if (r.status === 429) $('#lgErr').textContent = '刚才已经发过了，用邮件里那个验证码就行';
    if (d.devCode) { // 开发模式：没配发信邮箱，本机直接显示验证码
      $('#lgDev').textContent = `开发模式（还没配置发信邮箱）：验证码 ${d.devCode}，已自动填好`;
      $('#lgDev').classList.remove('hidden');
      $('#lgCode').value = d.devCode; setTimeout(verifyCode, 700);
    }
  } catch (err) { $('#lgErr').textContent = err.message; }
  b.disabled = false; b.firstChild.textContent = '获取验证码';
}
let verifying = false;
async function verifyCode() {
  const code = $('#lgCode').value.replace(/\D/g, '');
  if (code.length !== 6 || verifying) return;
  verifying = true; $('#lgErr').textContent = ''; $('#lgCode').classList.add('busy');
  try {
    const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#lgEmail').value.trim(), code }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '登录失败');
    me = d.user; renderAcct();
    dlg.close();
    toast(d.isNew ? '欢迎！你有 3 条免费试做' : '登录成功');
  } catch (err) {
    $('#lgErr').textContent = err.message; $('#lgCode').select();
    $('#lgCode').classList.add('shake'); setTimeout(() => $('#lgCode').classList.remove('shake'), 500);
  }
  $('#lgCode').classList.remove('busy'); verifying = false;
}
$('#lgSend').addEventListener('click', sendCode);
$('#lgEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendCode(); } });
$('#lgCode').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); $('#lgErr').textContent = ''; if (e.target.value.length === 6) verifyCode(); });
$('#lgBack').addEventListener('click', () => lgStep(1));
$('#lgResend').addEventListener('click', () => { $('#lgCode').value = ''; sendCode(); });
/** 接口说没登录（比如登录过期）：清掉登录状态 */
function onAuthFail(r) { if (r.status === 401) { me = null; renderAcct(); } }

// ================= ③ 看成片 =================
function enterStudio() {
  stop();
  state.script = null;
  state.master = null; state.voiceMix = null; state.buffers = null; state.env = null; state.audioKey = ''; state.mixKey = '';
  const ctx = $('#preview').getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  $('#editor').innerHTML = '';
  $('#title').value = '';
  $('#footNote').textContent = '';
  renderRemixNote();
  $('#btnExport').disabled = true;
  switchTab('script');
  show('studio');
}

async function startWithScript(script) {
  state.script = script;
  $('#title').value = script.title || '';
  $('#glyph').value = script.glyph || '';
  $('#glyph').closest('.field').classList.toggle('hidden', script.glyph === undefined);
  $('#photoPanel2').classList.toggle('hidden', !(state.form.needsPhotos || state.form.photoKind === 'scenes'));
  $('#photoPanel2 .group-title').firstChild.textContent = photoKind() === 'scenes' ? '现场照片 ' : '形象照 ';
  $('#photoPanel2 .group-title span').textContent = photoKind() === 'scenes' ? '讲到“我们”时优先用；改完点镜头上的「换图」' : '每个镜头轮流换一张';
  $('#account2').value = script.account || '';
  await state.form.module.preloadFonts(script);
  state.assets.media = [];
  renderEditor();
  refresh();
  state.t = 0;
  drawNow();
  const stock = state.form.needsStock;
  overlaySpin(stock ? '正在配音、找画面' : '正在配音', stock ? `${countLines()} 句配音，${script.sections.length} 个镜头，大约半分钟` : `${countLines()} 句，几秒钟`);
  try {
    await Promise.all([ensureAudio(), stock ? findMedia() : null]);
    hideOverlay();
    $('#btnExport').disabled = false;
    seek(0);
    play();
  } catch (err) {
    overlayMessage('配音失败', err.message, [{ label: '重试', primary: true, fn: () => startWithScript(script) }]);
  }
}

$('#btnRedo').addEventListener('click', () => {
  if (state.exporting) return;
  if (state.remix) replicate();
  else if (state.input || state.attachments.length) generate(state.input);
  else show('gallery');
});
$('#title').addEventListener('input', (e) => { if (state.script) { state.script.title = e.target.value; drawNow(); } });

// ---------- 面板标签 ----------
function switchTab(tab) {
  $('#sideTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const id of ['script', 'style', 'voice']) $('#tab-' + id).classList.toggle('hidden', id !== tab);
  if (tab === 'style') renderSkins();
  if (tab === 'voice') renderVoices();
}
$('#sideTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); });

// ---------- 文案 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderEditor() {
  $('#editor').innerHTML = state.script.sections.map((x, i) => `
    <div class="sec" data-i="${i}">
      <div class="sec-top"><span class="no">${String(i + 1).padStart(2, '0')}</span>
        <input class="bare tag" data-k="tag" value="${esc(x.tag)}" maxlength="8" spellcheck="false" />
        <span class="mod">${x.scene ? SCENE_NAMES[x.scene] || '' : x.visual ? VIS_NAMES[x.visual.type] || '' : MOD_NAMES[x.module?.type] || '标题'}</span>${state.form.needsStock ? '<button class="swap" data-swap title="给这个镜头换一张画面">换图</button>' : ''}</div>
      ${x.headline ? `<input class="bare h1" data-k="h0" value="${esc(x.headline[0])}" maxlength="14" placeholder="标题" spellcheck="false" />` : ''}
      ${x.headline ? `<input class="bare h2" data-k="h1" value="${esc(x.headline[1])}" maxlength="14" placeholder="金色副标题" spellcheck="false" />` : ''}
      <textarea class="bare lines" data-k="lines" rows="2" spellcheck="false">${esc(x.lines.join('\n'))}</textarea>
      ${x.headline ? `<input class="bare concl" data-k="conclusion" value="${esc(x.conclusion)}" maxlength="20" placeholder="金色结论句" spellcheck="false" />` : ''}
    </div>`).join('');
  document.querySelectorAll('.bare.lines').forEach(autoGrow);
}
let redrawTimer = 0;
$('#editor').addEventListener('input', (e) => {
  const k = e.target.dataset.k; if (!k) return;
  const x = state.script.sections[Number(e.target.closest('.sec').dataset.i)];
  const v = e.target.value;
  if (k === 'tag') x.tag = v;
  else if (k === 'h0') x.headline[0] = v;
  else if (k === 'h1') x.headline[1] = v;
  else if (k === 'conclusion') x.conclusion = v;
  else if (k === 'lines') { autoGrow(e.target); x.lines = v.split('\n').map((l) => l.trim()).filter(Boolean); scheduleRevoice(); }
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(async () => { await state.form.module.preloadFonts(state.script); refresh(); drawNow(); }, 200);
});
$('#editor').addEventListener('click', (e) => {
  const b = e.target.closest('[data-swap]'); if (!b) return;
  const i = Number(b.closest('.sec').dataset.i);
  if (state.playing) stop();
  seek(showcaseTime(state.planData[i]));
  swapMedia(i);
});
// 点哪段，预览就跳到哪段（显示这段完整搭好的样子）
$('#editor').addEventListener('focusin', (e) => {
  const sec = e.target.closest('.sec'); if (!sec || !state.planData) return;
  const p = state.planData[Number(sec.dataset.i)];
  if (state.playing) stop();
  seek(showcaseTime(p));
});

// ---------- 风格 ----------
function renderSkins() {
  const skins = state.form.module.skins;
  $('#skins').innerHTML = Object.entries(skins).map(([k, s]) => `
    <button class="skin ${k === skinOf() ? 'on' : ''}" data-skin="${k}">
      <div class="shot"><canvas width="${W / 3}" height="${H / 3}"></canvas></div>${s.name}
    </button>`).join('');
  if (!state.script) return;
  const p = state.planData[Math.min(1, state.planData.length - 1)];
  const t = showcaseTime(p);
  document.querySelectorAll('.skin').forEach((b) => {
    const ctx = b.querySelector('canvas').getContext('2d');
    ctx.setTransform(1 / 3, 0, 0, 1 / 3, 0, 0);
    state.form.module.drawFrame(ctx, {
      script: state.script, tl: state.tl, planData: state.planData, t, skinId: b.dataset.skin, env: null, fps: FPS, assets: state.assets,
    });
  });
}
$('#skins').addEventListener('click', (e) => {
  const b = e.target.closest('.skin'); if (!b) return;
  prefs.skins = { ...(prefs.skins || {}), [state.form.id]: b.dataset.skin }; savePrefs();
  document.querySelectorAll('.skin').forEach((x) => x.classList.toggle('on', x === b));
  drawNow();
});
$('#glyph').addEventListener('input', async (e) => {
  if (!state.script) return;
  state.script.glyph = e.target.value || 'K';
  await state.form.module.preloadFonts(state.script);
  drawNow();
});
$('#account2').addEventListener('input', (e) => {
  prefs.account = e.target.value.trim(); savePrefs();
  if (state.script) { state.script.account = prefs.account; drawNow(); }
});

// ---------- 声音 ----------
function renderVoices() {
  $('#voices').innerHTML = VOICES.map((v) => `
    <div class="voice ${v.id === prefs.voice ? 'on' : ''}" data-v="${v.id}" role="button" tabindex="0">
      <span class="av">${v.av}</span>
      <span><div class="vn">${v.name}</div><div class="vd">${v.desc}</div></span>
      <button class="listen" data-listen="${v.id}" title="试听"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></button>
    </div>`).join('');
  setSeg('#rate', prefs.rate);
  const cur = bgmOf();
  $('#bgms').innerHTML = Object.entries(BGM_STYLES).map(([k, b]) => `
    <div class="voice bgm ${k === cur.style ? 'on' : ''}" data-bgm="${k}" role="button" tabindex="0">
      <span class="av">${k === 'none' ? '—' : '♪'}</span>
      <span><div class="vn">${b.name}</div><div class="vd">${b.desc}</div></span>
      ${k === 'none' ? '' : `<button class="listen" data-bgm-listen="${k}" title="试听"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></button>`}
    </div>`).join('');
  setSeg('#bgmVol', cur.volume);
}
let sampleSrc = null;
$('#voices').addEventListener('click', async (e) => {
  const listen = e.target.closest('[data-listen]');
  if (listen) {
    e.stopPropagation();
    listen.classList.add('busy');
    try {
      const text = state.script?.sections[0]?.lines[0] || '你好，欢迎来到我的课堂。';
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: listen.dataset.listen, rate: prefs.rate }) });
      const ac = getAudioCtx(); await ac.resume();
      const buf = await ac.decodeAudioData(await r.arrayBuffer());
      stop();
      try { sampleSrc?.stop(); } catch { /* */ }
      sampleSrc = ac.createBufferSource(); sampleSrc.buffer = buf; sampleSrc.connect(ac.destination); sampleSrc.start();
    } catch { toast('试听失败，请稍后再试'); }
    listen.classList.remove('busy');
    return;
  }
  const v = e.target.closest('.voice'); if (!v) return;
  prefs.voice = v.dataset.v; savePrefs();
  document.querySelectorAll('.voice').forEach((x) => x.classList.toggle('on', x === v));
  scheduleRevoice(0);
});
$('#rate').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.rate = b.dataset.v; savePrefs(); setSeg('#rate', b.dataset.v);
  scheduleRevoice(0);
});

// ---------- 背景音乐 ----------
let bgmPreview = null;
$('#bgms').addEventListener('click', async (e) => {
  const listen = e.target.closest('[data-bgm-listen]');
  if (listen) {
    e.stopPropagation();
    listen.classList.add('busy');
    try {
      const ac = getAudioCtx(); await ac.resume();
      const buf = await renderBgm(listen.dataset.bgmListen, 12, ac.sampleRate);
      stop();
      try { bgmPreview?.stop(); sampleSrc?.stop(); } catch { /* */ }
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(1, ac.currentTime + 0.4);
      g.gain.setValueAtTime(1, ac.currentTime + 10.5); g.gain.linearRampToValueAtTime(0, ac.currentTime + 12);
      bgmPreview = ac.createBufferSource(); bgmPreview.buffer = buf; bgmPreview.connect(g).connect(ac.destination); bgmPreview.start();
    } catch { toast('试听失败'); }
    listen.classList.remove('busy');
    return;
  }
  const b = e.target.closest('[data-bgm]'); if (!b) return;
  prefs.bgm = { ...(prefs.bgm || {}), [state.form.id]: b.dataset.bgm }; savePrefs();
  document.querySelectorAll('[data-bgm]').forEach((x) => x.classList.toggle('on', x === b));
  remix();
});
$('#bgmVol').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.bgmVol = b.dataset.v; savePrefs(); setSeg('#bgmVol', b.dataset.v);
  remix();
});
/** 只重新混音（不重新配音），换音乐几乎是即时的 */
async function remix() {
  if (!state.voiceMix) return;
  const wasPlaying = state.playing;
  try { bgmPreview?.stop(); } catch { /* */ }
  $('#voiceBadge').classList.remove('hidden');
  try { await ensureAudio(); if (wasPlaying) { stop(); play(); } } catch (err) { toast('混音失败：' + err.message); }
  $('#voiceBadge').classList.add('hidden');
}

// ---------- 配音：自动生成，改了文案自动重配（只重配改动的句子） ----------
const audioKey = () => JSON.stringify([prefs.voice, prefs.rate, state.script?.sections.map((s) => s.lines)]);
const countLines = () => state.script.sections.reduce((n, s) => n + s.lines.length, 0);

/** 当前形式用的背景音乐：每个形式记住自己的选择 */
const bgmOf = () => ({ style: prefs.bgm?.[state.form.id] ?? state.form.module.meta.bgm ?? 'warm', volume: prefs.bgmVol || 'mid' });

async function ensureAudio() {
  if (!(state.voiceMix && state.audioKey === audioKey())) {
    const key = audioKey();
    const job = ++state.voiceJob;
    const buffers = await synthesize(state.script, { voice: prefs.voice, rate: prefs.rate });
    if (job !== state.voiceJob) return ensureAudio(); // 期间又改了，按最新的来
    state.buffers = buffers;
    state.audioKey = key;
    refresh();
    state.voiceMix = await mixAudio(state.tl, buffers);
    state.env = envelope(state.voiceMix, FPS);
    state.mixKey = '';
  }
  const mk = JSON.stringify(bgmOf());
  if (state.master && state.mixKey === mk && state.masterFor === state.voiceMix) return;
  state.master = await mixWithBgm(state.voiceMix, bgmOf());
  state.masterFor = state.voiceMix;
  state.mixKey = mk;
}
let revoiceTimer = 0;
function scheduleRevoice(delay = 1200) {
  if (!state.script) return;
  clearTimeout(revoiceTimer);
  $('#voiceBadge').classList.remove('hidden');
  revoiceTimer = setTimeout(async () => {
    const wasPlaying = state.playing;
    try {
      await ensureAudio();
      if (wasPlaying) { stop(); play(); } else drawNow();
    } catch (err) { toast('配音失败：' + err.message); }
    $('#voiceBadge').classList.add('hidden');
  }, delay);
}

function refresh() {
  if (!state.script) return;
  const durations = state.buffers && state.audioKey === audioKey() ? state.buffers.map((r) => r.map((b) => b.duration)) : null;
  state.tl = buildTimeline(state.script, durations);
  state.planData = state.form.module.plan(state.script, state.tl);
  state.t = Math.min(state.t, state.tl.duration);
  $('#footNote').textContent = `成片约 ${fmt(state.tl.duration)} · 1080×1920 竖屏 MP4`;
  updateTime();
}

// ---------- 导出 ----------
$('#btnExport').addEventListener('click', async () => {
  if (!state.script || state.exporting) return;
  if (!exportSupported()) { toast('当前浏览器不支持本地出片，请用电脑上最新版 Chrome 或 Edge'); return; }
  stop();
  const signal = { cancelled: false };
  state.exporting = signal;
  $('#btnExport').disabled = true;
  overlayProgress(0, '正在生成视频', '准备中…', [{ label: '取消', fn: () => { signal.cancelled = true; } }]);
  try {
    $('#ovSub').textContent = '正在准备声音…'; await ensureAudio();
    const frameData = { script: structuredClone(state.script), tl: state.tl, planData: state.planData, skinId: skinOf(), env: state.env, fps: FPS, assets: state.form.needsPhotos || state.form.needsStock ? state.assets : null };
    const blob = await exportInWorker({
      formUrl: state.form.url, frameData, width: W, height: H, fps: FPS, duration: state.tl.duration,
      audioBuffer: state.master, signal,
      onProgress: (p, left) => overlayProgress(p, '正在生成视频', `还要约 ${Math.max(1, Math.ceil(left))} 秒 · 可以先去忙别的`),
    });
    const name = `${state.script.title || '我的视频'}.mp4`.replace(/[\\/:*?"<>|]/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    overlayDone('视频已导出', `${name} · ${(blob.size / 1048576).toFixed(0)} MB · 已保存到下载文件夹`, [
      { label: '再做一条', primary: true, fn: () => { hideOverlay(); show('gallery'); } },
      { label: '继续修改', fn: hideOverlay },
    ]);
  } catch (err) {
    if (signal.cancelled) { hideOverlay(); toast('已取消导出'); } else overlayMessage('导出失败', err.message, [{ label: '知道了', primary: true, fn: hideOverlay }]);
  } finally {
    state.exporting = null;
    $('#btnExport').disabled = false;
  }
});

// ---------- 浮层 ----------
const RING = 213.6;
function overlayBase(cls, title, sub, actions = []) {
  const ov = $('#overlay');
  ov.className = 'overlay ' + cls;
  $('#ovTitle').textContent = title;
  $('#ovSub').textContent = sub;
  $('#ovPct').textContent = '';
  $('#ringFill').style.strokeDashoffset = '';
  const box = $('#ovActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label; if (a.primary) b.className = 'primary';
    b.onclick = a.fn; box.appendChild(b);
  }
}
const overlaySpin = (title, sub) => overlayBase('spin', title, sub);
const overlayMessage = (title, sub, actions) => overlayBase('msg', title, sub, actions);
const overlayDone = (title, sub, actions) => { overlayBase('done', title, sub, actions); $('#ovPct').textContent = '✓'; };
function overlayProgress(p, title, sub, actions) {
  if (actions || !$('#overlay').classList.contains('prog')) overlayBase('prog', title, sub, actions || []);
  $('#ovSub').textContent = sub;
  $('#ovPct').textContent = Math.round(p * 100) + '%';
  $('#ringFill').style.strokeDashoffset = String(RING * (1 - p));
}
function hideOverlay() { $('#overlay').className = 'overlay hidden'; }

// ---------- 播放 ----------
const pctx = $('#preview').getContext('2d');
function drawNow() {
  if (!state.script || !state.tl) return;
  state.form.module.drawFrame(pctx, { script: state.script, tl: state.tl, planData: state.planData, t: state.t, skinId: skinOf(), env: state.env, fps: FPS, assets: state.assets });
  updateTime();
}
function primeAudio() { try { getAudioCtx().resume(); } catch { /* */ } }
function play() {
  if (!state.script || !state.tl) return;
  if (state.t >= state.tl.duration - 0.05) state.t = 0;
  state.playing = true;
  $('#playIcon').innerHTML = '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>';
  state.playStartT = state.t;
  state.playStartPerf = performance.now();
  if (state.master && state.audioKey === audioKey()) {
    const ac = getAudioCtx(); ac.resume();
    const src = ac.createBufferSource();
    src.buffer = state.master; src.connect(ac.destination);
    src.start(0, state.t);
    state.source = src;
    state.playStartCtx = ac.currentTime;
  }
  requestAnimationFrame(tick);
}
function stop() {
  state.playing = false;
  $('#playIcon').innerHTML = '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>';
  try { state.source?.stop(); } catch { /* already stopped */ }
  state.source = null;
}
function tick() {
  if (!state.playing) return;
  state.t = state.source
    ? state.playStartT + (getAudioCtx().currentTime - state.playStartCtx)
    : state.playStartT + (performance.now() - state.playStartPerf) / 1000;
  if (state.t >= state.tl.duration) { state.t = state.tl.duration; stop(); }
  drawNow();
  highlightSection();
  if (state.playing) requestAnimationFrame(tick);
}
function seek(t) {
  const was = state.playing;
  stop();
  state.t = Math.max(0, Math.min(t, state.tl?.duration || 0));
  drawNow();
  highlightSection();
  if (was) play();
}
const toggle = () => { if ($('#overlay').classList.contains('hidden')) (state.playing ? stop() : play()); };
$('#btnPlay').addEventListener('click', toggle);
$('#tap').addEventListener('click', toggle);
$('#scrub').addEventListener('input', (e) => { if (state.tl) seek((e.target.value / 1000) * state.tl.duration); });
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || $('#studio').classList.contains('hidden')) return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  e.preventDefault(); toggle();
});

let lastActive = -1;
function highlightSection() {
  if (!state.planData) return;
  const i = state.planData.findIndex((p) => state.t >= p.start && state.t <= p.end + 0.5);
  if (i === lastActive) return;
  lastActive = i;
  document.querySelectorAll('.sec').forEach((el) => el.classList.toggle('active', Number(el.dataset.i) === i));
  if (state.playing && i >= 0) document.querySelector(`.sec[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------- 小工具 ----------
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateTime() {
  if (!state.tl) return;
  $('#time').textContent = `${fmt(state.t)} / ${fmt(state.tl.duration)}`;
  $('#scrub').value = String(Math.round((state.t / state.tl.duration) * 1000));
}
function setSeg(sel, v) { $(sel).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); moveSegThumb($(sel)); }
function moveSegThumb(seg) {
  const th = seg?.querySelector('.seg-thumb'); const on = seg?.querySelector('button.on');
  if (!th || !on) return;
  th.style.width = on.offsetWidth + 'px'; th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** 把过长的口播句在标点处拆开，保证字幕两行放得下 */
function splitLongLine(line, max = 26) {
  const chars = [...line.trim()];
  if (chars.length <= max) return [line.trim()];
  const out = [];
  let cur = '';
  let lastBreak = -1;
  for (const ch of chars) {
    cur += ch;
    if ('，、；：,;:'.includes(ch)) lastBreak = [...cur].length;
    if ([...cur].length >= max && lastBreak > 6) {
      const c = [...cur];
      out.push(c.slice(0, lastBreak).join(''));
      cur = c.slice(lastBreak).join('');
      lastBreak = -1;
    }
  }
  if (cur) out.push(cur);
  return out;
}
/** 兜底：AI 把序号当成数据填进数据卡时，改成要点列表 */
function fixModule(m) {
  if (!m || !m.type) return { type: 'none' };
  if (m.type === 'stats') {
    const items = m.items || [];
    const fake = items.length < 2 || items.every((it, i) => String(it.value).trim() === String(i + 1)) || items.every((it) => !/\d/.test(String(it.value)));
    if (fake) return { type: 'list', items: items.map((it) => it.label || String(it.value)).slice(0, 4) };
  }
  return m;
}
function normalize(s) {
  const strip = (v) => String(v || '').trim().replace(/[。.！!]+$/, '');
  s.title = strip(s.title) || '未命名';
  s.glyph = [...(s.glyph || 'K')][0];
  s.sections = (s.sections || []).filter(Boolean).map((x) => ({
    tag: strip(x.tag), headline: [strip(x.headline?.[0]), strip(x.headline?.[1])], sub: strip(x.sub),
    module: fixModule(x.module), chips: (x.chips || []).slice(0, 3), conclusion: strip(x.conclusion),
    lines: (x.lines || []).filter((l) => l && l.trim()).flatMap((l) => splitLongLine(l)),
  })).filter((x) => x.lines.length);
  return s;
}

// ---------- 客户照片：形象照（自动抠图）/ 现场照片（原样），都只存在本机 ----------
state.assets = { photos: [], scenes: [], media: [] };
state.photoLists = { photos: [], scenes: [] };
state.photoBusy = 0;
const photoKind = () => state.form?.photoKind || 'photos';
async function loadPhotos(kind = photoKind()) {
  const list = await listPhotos(kind);
  state.photoLists[kind].forEach((p) => URL.revokeObjectURL(p.url));
  state.photoLists[kind] = await Promise.all(list.map(async (r) => ({ id: r.id, url: URL.createObjectURL(r.blob), bitmap: await createImageBitmap(r.blob) })));
  state.assets[kind] = state.photoLists[kind].map((p) => p.bitmap);
  renderPhotoRows();
  if (state.script) drawNow();
}
function renderPhotoRows() {
  const kind = photoKind(); const list = state.photoLists[kind];
  const max = kind === 'scenes' ? 20 : 8;
  const tiles = list.map((p) => `<div class="ph-tile ${kind}"><img src="${p.url}" alt="" /><button class="del" data-del-photo="${p.id}" title="删除">×</button></div>`).join('')
    + Array.from({ length: state.photoBusy }, () => `<div class="ph-tile busy"><div><i></i>${kind === 'scenes' ? '处理中' : '抠图中'}</div></div>`).join('')
    + (list.length + state.photoBusy < max ? '<button class="ph-tile add" data-add-photo>＋<br/>添加照片</button>' : '');
  document.querySelectorAll('[data-photo-row]').forEach((el) => { el.innerHTML = tiles; });
}
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-add-photo]')) { $('#photoInput').click(); return; }
  const del = e.target.closest('[data-del-photo]');
  if (del) { await deletePhoto(del.dataset.delPhoto, photoKind()); await loadPhotos(); }
});
$('#photoInput').addEventListener('change', async (e) => {
  const kind = photoKind();
  const files = [...e.target.files].slice(0, kind === 'scenes' ? 20 : 8);
  e.target.value = '';
  if (!files.length) return;
  state.photoBusy += files.length; renderPhotoRows();
  let cutoutPerson;
  if (kind === 'photos') {
    try { ({ cutoutPerson } = await import('./engine/cutout.js')); } catch { toast('抠图组件加载失败，请刷新重试'); state.photoBusy = 0; renderPhotoRows(); return; }
  }
  for (const f of files) {
    try {
      if (kind === 'photos') { const r = await cutoutPerson(f); await savePhoto(r.blob); } else await savePhoto(await shrinkPhoto(f), 'scenes');
    } catch (err) { toast(err.message || '这张照片处理失败，换一张试试'); }
    state.photoBusy--; await loadPhotos(kind);
  }
});

// ---------- 画面素材：现场照片优先，其余从正版素材库按关键词找 ----------
let stockMod = null;
const loadStock = () => (stockMod ||= import('./engine/stock.js'));
async function findMedia() {
  const script = state.script;
  const { resolveMedia } = await loadStock();
  const r = await resolveMedia(script.sections.map((x) => ({ kw: x.kw, ours: x.ours, pick: x.pick, src: x.pick ? '' : x.src, by: x.by })), state.assets.scenes);
  if (state.script !== script) return;
  state.assets.media = r.media; state.mediaPicks = r.picks;
  renderCredits();
  if (r.error) toast(r.error.includes('PEXELS') ? '素材库还没配置，先用占位画面（可以上传自己的现场照片）' : r.error);
  drawNow();
}
async function swapMedia(i) {
  const x = state.script.sections[i];
  x.pick = (x.pick || 0) + 1;
  const { resolveMedia } = await loadStock();
  const own = state.mediaPicks?.[i]?.own && state.assets.scenes.length > 1;
  if (own) {
    const idx = (state.mediaPicks[i].idx + 1) % state.assets.scenes.length;
    state.assets.media[i] = state.assets.scenes[idx]; state.mediaPicks[i] = { own: true, idx };
  } else {
    const r = await resolveMedia([{ kw: x.kw, pick: x.pick }], []);
    if (!r.media[0]) { toast(r.error || '没有更多画面了'); return; }
    state.assets.media[i] = r.media[0]; state.mediaPicks[i] = r.picks[0];
  }
  renderCredits(); drawNow();
}
function renderCredits() {
  const by = [...new Set((state.mediaPicks || []).filter((p) => p && !p.own).map((p) => p.by))];
  $('#credits').innerHTML = by.length ? `画面素材来自 <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>，摄影师：${by.slice(0, 6).map(esc).join('、')}${by.length > 6 ? ' 等' : ''}` : '';
}

// 开发调试用
window.__app = { state, seek, drawNow, prefs, load: (s) => startWithScript(state.form.module.normalize ? state.form.module.normalize(s, splitLongLine) : normalize(s)) };

// ================= 启动 =================
renderStrip();
selectForm(prefs.formId);
$('#input').placeholder = INPUT_PLACEHOLDER;
$('#account').value = prefs.account;
setSeg('#minutes', String(prefs.minutes));
$('#rmIndustry').value = prefs.industry || '';
setMode('say');
loadPhotos('photos').catch(() => {});
loadPhotos('scenes').catch(() => {});
fetch('/api/status').then((r) => r.json()).then((d) => { aiReady = !!d.ai; if (!aiReady) $('#createErr').textContent = '服务端还没配置 AI 密钥，可以先看示例。'; if (d.asrBase) asrBase = d.asrBase; if (d.asrModel) asrModel = d.asrModel; }).catch(() => { aiReady = false; });
