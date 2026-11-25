import { forms, categories } from './forms/registry.js';
import { THEMES, THEME_KEYS } from './forms/themes.js';
import { W, H } from './engine/draw.js';
import { buildTimeline, synthesize, mixAudio, mixWithBgm, envelope, getAudioCtx } from './engine/timeline.js';
import { BGM_STYLES, renderBgm, warmBgm } from './engine/music.js';
import { listPhotos, savePhoto, deletePhoto, shrinkPhoto } from './engine/photos.js';
import { exportInWorker, exportSupported } from './engine/exporter.js';

// 注意：这里故意不预先下载字体。中文字体按 unicode-range 拆成上百个分片，页面一打开就抢带宽会让首页更慢；
// 真正出片/预览时由 engine/font-preload.js 的 loadFontFaces 按文案里用到的字按需加载。

const $ = (s) => document.querySelector(s);
const FPS = 24; // 与对标样片一致；图文动效 24 帧足够流畅，比 30 帧少 20% 渲染量
// 导出用几个渲染线程：默认 1。多线程各画各的，个别电脑上成片标题/字幕会逐帧轻微跳动（看着像抽抽），
// 所以默认单线程求稳。想在控制台试回多线程：localStorage.setItem('ycp.exportThreads','4')
const EXPORT_THREADS = (() => { try { return Math.max(1, Math.min(4, Number(localStorage.getItem('ycp.exportThreads')) || 1)); } catch { return 1; } })();
const IDEAS = ['成人学钢琴晚不晚', '少儿编程有什么用', '科目二怎么一次过', '美甲新手接第一单', '律师第一次咨询问什么', '体检报告怎么看', '志愿填错能改吗', '零基础转行学什么'];
const VOICES = [
  { id: 'zh-CN-YunxiNeural', name: '云希', desc: '阳光男声 · 适合知识讲解', av: '希' },
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', desc: '温暖女声 · 适合家长沟通', av: '晓' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', desc: '新闻播音 · 适合数据分析', av: '扬' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', desc: '活泼女声 · 适合低龄课程', av: '伊' },
  { id: 'zh-CN-YunjianNeural', name: '云健', desc: '激情男声 · 适合招生促单', av: '健' },
];
/** 客户没自己挑过配音时，按行业和模板自动配一个声音 */
function autoVoice(script) {
  const key = script?.theme?.key || '';
  const kid = /少儿|孩子|幼儿|小朋友|宝宝|宝贝/.test(state.input + (script?.title || ''));
  if (kid && ['coding', 'art', 'music', 'dance', 'language', 'k12', 'counsel'].includes(key)) return 'zh-CN-XiaoyiNeural'; // 活泼女声
  if (['driving', 'fitness', 'vocation'].includes(key)) return 'zh-CN-YunjianNeural'; // 激情男声
  if (['beauty', 'cooking', 'music', 'dance', 'art', 'health', 'counsel'].includes(key)) return 'zh-CN-XiaoxiaoNeural'; // 温暖女声
  if (state.form?.id === 'deep-dive' || state.form?.id === 'data-card' || ['business', 'legal', 'finance'].includes(key)) return 'zh-CN-YunyangNeural'; // 播音腔
  return 'zh-CN-YunxiNeural';
}
const SCENE_NAMES = { field: '野外', room: '书房', classroom: '教室', exam: '考场', home: '客厅', street: '街市', river: '河边', studio: '练习室', lab: '电脑教室', road: '练车场' };
/** 每个形式记住自己的皮肤 */
const skinOf = () => {
  const ks = Object.keys(state.form.module.skins);
  // 每条视频自带版式的模板（实拍混剪）：用这条自己的，不沿用上一条，免得条条一个样
  if (state.form.autoSkin) { const v = state.script?.skin || state.script?.look; return ks.includes(v) ? v : ks[0]; }
  const v = prefs.skins?.[state.form.id]; return ks.includes(v) ? v : ks[0];
};
/** 用来展示一段“完整搭好”样子的时间点 */
const showcaseTime = (p) => (p.conclusion != null ? Math.min(p.end - 0.05, p.conclusion + 1.2) : Math.max(p.start + 0.3, Math.min(p.end - 0.1, (p.lineEnd ?? p.end) - 0.3)));
const MOD_NAMES = { compare: '对比', stats: '数据卡', grid: '清单', flow: '流程', list: '要点', none: '标题', matrix: '四象限', timeline: '时间轴', pyramid: '金字塔', myth: '误区正解', quote: '金句', formula: '公式', cycle: '循环图', bars: '程度条', venn: '韦恩图', checks: '打勾清单', scale: '天平', stairs: '台阶', funnel: '漏斗', iceberg: '冰山', gauge: '仪表盘', schedule: '安排表', qa: '问答', mindmap: '导图', checkmatrix: '对比表', keyword: '关键词', roadmap: '路线图', donut: '环形构成' };
const VIS_NAMES = { shot: '画面', chips: '标签', quote: '金句', question: '提问', title: '大标题', tags: '标签', table: '表格', stat: '大数字', emoji: '贴纸', list: '清单', type: '打字', icons: '图标', avatar: '人设', tree: '路线图', big: '大字', cards: '资料卡', follow: '关注',
  compare: '对比', steps: '步骤', chat: '聊天', offer: '课程卡', ask: '提问', checktest: '自测', verdict: '判对错', warning: '警示', formula: '公式', pyramid: '金字塔', rank: '排行', timeline: '时间轴', keywords: '关键词', ticket: '门票', certificate: '喜报', map: '地址', notify: '通知',
  countdown: '倒计时', checklist: '清单', vs: '对决', calendar: '日历', episodes: '剧集', marker: '划重点', nametag: '名牌', poll: '投票', ticker: '新闻条',
  progress: '进度条', quest: '闯关', levelup: '升级', lockscreen: '锁屏', grid4: '四宫格', gift: '礼包', neon: '霓虹', bedtime: '睡前', pledge: '承诺书', quiz: '小测验', notebook: '笔记', top3: '前三名', spotlight: '聚光灯', faq: '问答',
  badge: '大图标', spotlight: '聚光灯', count: '记分牌', flash: '闪屏', phones: '两台手机', crowd: '观众', target: '靶子', stack: '叠卡片', gauge: '表盘', weeks: '周卡', word: '关键词', grid: '矩阵', brand: '名片', button: '大按钮', follow: '关注', bars: '柱状图', versus: '对决', timer: '秒表', path: '路线', mystery: '盲盒', bulb: '灯泡',
  hook: '开场', cta: '引导', focus: '圈重点',
  caption: '解说卡', magnifier: '放大镜', qa: '问答', breaking: '快讯', polaroid: '拍立得', chain: '因果链', stamp: '盖章', sticky: '便利贴', cinema: '电影感', location: '地点', tape: '警戒线', tug: '拔河' };

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
const busy = { writing: false }; // 正在等 AI 写文案（导出中看 state.exporting）
const INPUT_PLACEHOLDER = '比如：我教成人钢琴，想讲讲为什么很多人练了半年还弹不完一首曲子';
let aiReady = false;
let asrBase = '/models/asr/'; let asrModel = 'whisper-base'; // 听写模型的位置（正式上线可放 CDN，服务端设 ASR_MODEL_BASE）

// ================= 视图切换 =================
// 只有两个页面：首页（一个大框）→ 看成片
function show(view) {
  for (const v of ['gallery', 'studio']) $('#' + v).classList.toggle('hidden', v !== view);
  renderResume(view);
  if (view !== 'gallery') stopHero(); else { drawCovers(); startHero(state.form); try { ghostStart(1200); } catch { /* 还没初始化完 */ } }
  if (view !== 'studio') stop();
  $('#crumb').innerHTML = view === 'gallery' ? '' : `<span>/</span><b>${state.remix ? '爆款变原创' : state.form?.name || ''}</b>`;
  window.scrollTo(0, 0);
}
// 从成片页点「返回修改」回到首页：刚才那条（连同改过的字、选的声音）还留着，点一下就回去接着改，不用重新生成
let resumeForm = null;
function renderResume(view) {
  let bar = $('#resumeBar');
  const can = view === 'gallery' && state.script && state.tl && !busy.writing;
  if (view === 'studio') resumeForm = state.form;
  if (!can) { bar?.classList.add('hidden'); return; }
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button'; bar.id = 'resumeBar'; bar.className = 'resume-bar';
    bar.addEventListener('click', resumeStudio);
    $('#box').before(bar);
  }
  bar.innerHTML = `<span class="rs-k">刚才那条还在</span><b>${esc(state.script.title || '未命名')}</b><span class="rs-go">接着改 →</span>`;
  bar.classList.remove('hidden');
}
function resumeStudio() {
  if (!state.script) return;
  if (resumeForm && state.form !== resumeForm) {
    // 回首页后点了别的套路：先切回刚才那条用的套路，不然画面会按新套路去画
    selectForm(resumeForm.id);
  }
  refresh();
  show('studio');
  drawNow();
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
const TPL_USE = { 'footage-mix': '用自己的素材', 'sketch-talk': '讲干货', 'series-intro': '系列涨粉', 'deep-dive': '立专业人设', 'pixel-story': '好转发', 'data-card': '讲知识点' };
function loadPreview(form) {
  if (!previewCache.has(form.id)) {
    previewCache.set(form.id, (async () => {
      const script = prepScript(form, await (await fetch(form.sample)).json());
      // 首页这些示例预览故意不等字体：中文正文字体是按 unicode-range 拆的，七个模板的示例一起加载要一两兆，
      // 慢网下首屏会卡十几秒。预览先用系统字体画（雅黑/苹方，看着接近），
      // 用户真点「生成」或「看完整示例」时再加载真字体，导出的成片也用真字体。
      const tl = buildTimeline(script, null);
      const d = { script, tl, planData: form.module.plan(script, tl), assets: null };
      // 实拍类套路：示例里写好了图片地址。封面那张先加载，其余后台慢慢加载（首页卡片用小图）
      if (form.needsStock) {
        d.assets = { media: [] }; d.assets.pool = d.assets.media;
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
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
  form.module.drawFrame(ctx, { script: d.script, tl: d.tl, planData: d.planData, t, skinId: form.autoSkin ? d.script.look : Object.keys(form.module.skins)[0], env: null, fps: FPS, assets: d.assets });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
const coverIdx = (form, d) => Math.min(form?.coverIdx ?? 1, d.planData.length - 1);
const coverTime = (d, form) => showcaseTime(d.planData[coverIdx(form, d)]);
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderStrip() {
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
// 左边的大手机：一直放着当前选中模板的示例；鼠标移到别的缩略图上，就先放那个看看
let hoverEl = null; // 缩略图都是静态封面，这个变量只为兼容 drawCovers
let heroLoop = 0; let heroFor = null;
async function startHero(f) {
  if (!f) return;
  cancelAnimationFrame(heroLoop); heroFor = f;
  $('#heroName').textContent = f.name; $('#heroUse').textContent = TPL_USE[f.id] || f.category || '';
  const d = await loadPreview(f);
  if (heroFor !== f || $('#gallery').classList.contains('hidden')) return;
  const ctx = $('#heroCanvas').getContext('2d'); const bar = $('#heroProg');
  const dur = Math.min(d.tl.duration, 40);
  const t0 = performance.now(); let last = 0; let lastGlow = 0;
  if (heroShown && heroShown !== f) { const p = $('#heroPhone'); p.classList.remove('swap'); void p.offsetWidth; p.classList.add('swap'); }
  heroShown = f;
  drawPreview(ctx, f, d, coverTime(d, f)); // 先有一帧，不黑屏
  sampleGlow();
  const loop = (now) => {
    heroLoop = requestAnimationFrame(loop);
    if (now - last < 1000 / 30) return;
    last = now;
    const t = ((now - t0) / 1000) % dur;
    drawPreview(ctx, f, d, t);
    bar.style.width = `${(t / dur) * 100}%`;
    if (now - lastGlow > 700) { lastGlow = now; sampleGlow(); }
  };
  heroLoop = requestAnimationFrame(loop);
}
function stopHero() { cancelAnimationFrame(heroLoop); heroFor = null; }
let heroShown = null;
// 手机背后的光晕跟着画面变色：从正在放的画面里挑最鲜艳的颜色（白底的就退回品牌橙）
const glowCanvas = document.createElement('canvas'); glowCanvas.width = 27; glowCanvas.height = 48;
const glowCtx = glowCanvas.getContext('2d', { willReadFrequently: true });
function sampleGlow() {
  try {
    glowCtx.drawImage($('#heroCanvas'), 0, 0, 27, 48);
    const px = glowCtx.getImageData(0, 0, 27, 48).data;
    // 按“鲜艳程度”加权平均：大片的主色说了算，零星的小点不会把光晕带偏
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < px.length; i += 4) {
      const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
      const s = mx ? (mx - mn) / mx : 0;
      const k = s * s * (mx / 255) ** 2;
      r += px[i] * k; g += px[i + 1] * k; b += px[i + 2] * k; w += k;
    }
    // 只取色相，饱和度和亮度固定：浅色画面也能出一圈鲜亮的光，不会发灰发脏
    let hue = 18; // 品牌橙
    if (w > 18) {
      const R = r / w / 255, G = g / w / 255, B = b / w / 255;
      const mx = Math.max(R, G, B), d = mx - Math.min(R, G, B);
      if (d > 0.04) hue = Math.round(60 * (mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) + 360) % 360;
    }
    $('#show').style.setProperty('--glow', `hsl(${hue} 90% 56%)`);
  } catch { /* 画面还没画好 */ }
}
// 鼠标在放映区移动：手机跟着微微转动，屏幕上有一道反光扫过（触屏、减少动效时不做）
const canTilt = matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
if (canTilt) {
  const showEl = $('#show'); const phone = $('#heroPhone');
  let raf = 0; let tx = 0; let ty = 0;
  const apply = () => {
    raf = 0;
    phone.style.setProperty('--rx', `${(-ty * 7).toFixed(2)}deg`);
    phone.style.setProperty('--ry', `${(tx * 9).toFixed(2)}deg`);
    phone.style.setProperty('--gx', `${50 + tx * 60}%`);
    phone.style.setProperty('--gy', `${50 + ty * 60}%`);
  };
  showEl.addEventListener('pointermove', (e) => {
    const r = phone.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 1.2)));
    ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
    phone.classList.add('tilting');
    if (!raf) raf = requestAnimationFrame(apply);
  });
  showEl.addEventListener('pointerleave', () => { tx = 0; ty = 0; phone.classList.remove('tilting'); if (!raf) raf = requestAnimationFrame(apply); });
}
function startHover(el) { startHero(formOf(el.dataset.id)); }
function stopHover(el) { if (!el) return stopHero(); if (heroFor !== state.form) startHero(state.form); }

/** 选模板：记住选择，换示例句、照片区 */
// 时长按钮：成片时长是 AI 按字数写出来的，做不到正好 1/2/3 分钟，按实测范围给一个大概的说法
// 实测（2026-11，每档 12 条）：选 1 → 40–70 秒；选 2 → 75–130 秒；选 3 → 130–175 秒
// 手绘图解每句 ≤16 字、节奏快，最长只能到 1 分半左右
const DUR_LABELS = { default: ['1 分钟内', '1–2 分钟', '2–3 分钟'], 'sketch-talk': ['1 分钟内', '1 分钟出头', '1 分半左右'] };
function renderDurLabels() {
  const labels = DUR_LABELS[state.form?.id] || DUR_LABELS.default;
  $('#minutes').querySelectorAll('button').forEach((b, i) => { b.textContent = labels[i]; });
  $('#minutes').title = '成片大概的长度，实际看内容会有出入；生成后右下角会显示准确时长';
  moveSegThumb($('#minutes'));
}
function selectForm(id) {
  state.form = formOf(id) || forms[0];
  prefs.formId = state.form.id; savePrefs();
  document.querySelectorAll('#tplStrip .t').forEach((el) => el.classList.toggle('on', el.dataset.id === state.form.id));
  startHero(state.form);
  ideaSeen = new Set();
  renderIdeas(true);
  const usesPhotos = state.form.needsPhotos || !!state.form.photoKind;
  $('#photoPanel').classList.toggle('hidden', !usesPhotos);
  $('#photoPanel .photos-head b').textContent = PHOTO_TEXT[photoKind()].name;
  $('#photoPanel .photos-head span').textContent = PHOTO_TEXT[photoKind()].hint;
  $('#photoPanel').title = state.form.photoHint || '3–6 张半身照，换不同手势，会自动抠图。照片只存在你自己的电脑里。';
  $('#photoPanel').classList.toggle('is-footage', photoKind() === 'footage');
  $('#photoInput').accept = 'image/*';
  $('#videoInput').accept = 'video/*';
  syncAttach();
  renderDurLabels();
  renderPhotoRows();
  warmBgm(bgmOf().style, getAudioCtx().sampleRate); // 用户打字时，后台先把音乐合成好
}
$('#tplStrip').addEventListener('click', (e) => {
  const el = e.target.closest('.t'); if (!el) return;
  if (state.mode === 'video') rm.userPicked = true;
  selectForm(el.dataset.id);
});
// 灵感句：覆盖各种行业（不只学科和手艺），按模板的用途分组；客户刚来没想法、手里也没文案，点一点就能出片
// 灵感：“短标签|点了以后填进去的完整一句|品类 key”。标签短（≤9 字），一行放得下，不显得乱
// 第三段是品类：客户在上面的下拉里选了行业，就只抽这一类的句子。17 类都至少给 3 条，选哪个都不空。
// 加行业时记得 themes.js、prompts/*.md 和这里一起加。
const IDEA_POOL = {
  // 系列开场：知识连载、案例合集、避坑清单、记录/日记、连载故事……不限于课程
  'series-intro': [
    '装修避坑7集|第一次装修，这 7 个坑我先替你踩了|business',
    '开店这三年|开店三年，每天拍一点给你看|business',
    '每天一个法律常识|每天 1 分钟，讲一个遇事用得上的法律常识|legal',
    '减脂30天记录|减脂 30 天，全过程拍给你看|fitness',
    '每天一个乐理知识|每天 10 分钟，带你学一个乐理知识|music',
    '每天一道科目一题|每天一道科目一易错题|driving',
    '每天一条营养搭配|每天 1 分钟，教你搭一顿不胖的饭|health',
    '每周一条升学政策|每周 5 分钟，讲清一条升学政策|counsel',
    '每天一个编程技巧|每天 1 分钟，讲一个能马上用的编程技巧|coding',
    '每天一个健身动作|每天 1 分钟，学会一个在家能做的动作|fitness',
  ],
  'footage-mix': [
    '带你看钢琴课现场|带大家看看我们成人钢琴课的上课现场|music',
    '美甲学员第一周|美甲零基础学员，第一周都在练什么|beauty',
    '驾校练车日常|带你看看我们驾校学员的练车日常|driving',
    '舞蹈班开课第一天|少儿舞蹈暑假班开课第一天|dance',
    '律所的一天|带你看看我们律所一天是怎么过的|legal',
    '中医馆的上午|带大家看看我们中医馆上午的号是怎么排的|health',
    '康复中心评估|带你看康复中心的第一次评估，都测什么|health',
    '编程课第一节课|带你看少儿编程第一节课，孩子都在干什么|coding',
    '育婴师实操课|育婴师培训第一节课，先练怎么抱孩子|vocation',
    '烘焙班第一次出手|烘焙班学员第一次自己出手做蛋糕|cooking',
    '月子中心的日常|月子中心的一天，护士都在忙什么|vocation',
    '代账公司的一天|代账公司的一天，客户最常问的三个问题|finance',
    '画室集训第一天|美术集训第一天，画室里的真实状态|art',
    '健身房晚高峰|下班后的健身房，器械区基本排不上队|fitness',
    '电工实操课|带你看电工培训班的实操课，先练什么|vocation',
    '成人口语角|每周一次英语角，来了就得开口说|language',
    '咖啡拉花第一杯|咖啡拉花第一杯，先把奶泡打好|cooking',
    '书法课第一次落笔|书法课第一次落笔，先练横竖|art',
  ],
  'deep-dive': [
    '学半年钢琴弹不完一首|为什么很多人学了半年钢琴，还弹不完一首曲子|music',
    '教资越来越难考？|为什么考教资一次过的人越来越少|exam',
    '美甲学徒为何出不了师|为什么有的美甲学徒三年都出不了师|beauty',
    '成年人为何爱上跳舞|为什么越来越多成年人开始学跳舞|dance',
    '律师费为什么这么贵|为什么律师费这么贵，钱到底花在哪|legal',
    '体检报告一半不用怕|为什么体检报告上的箭头，一半都不用怕|health',
    '志愿填错最难受|为什么志愿填错的人，四年后最难受|counsel',
    '30 岁转行为何难|为什么 30 岁转行的人，一半卡在第一步|coding',
    '孩子越补越差？|为什么补课补得越多，孩子成绩越差|k12',
    '书法练多久能写春联|练书法多久能自己写一副春联|art',
    '成年人学舞的松弛感|成年人学舞蹈，最难的是松弛感|dance',
    '做知识付费先想清|做知识付费之前，先想清楚这三件事|business',
  ],
  'pixel-story': [
    '方法比努力重要|学习方法比努力更重要|k12',
    '别等考前才复习|别等到考前才开始复习|exam',
    '学手艺怕三天打鱼|学手艺最怕三天打鱼两天晒网|beauty',
    '零基础三个月接单|一个零基础学员，三个月开始接单的故事|beauty',
    '复读这一年|复读这一年，最难的不是成绩|k12',
    '第一次上庭|第一次上庭的年轻律师，前一晚没睡着|legal',
    '考了三次才上岸|考了三次才上岸的人，中间都想放弃|exam',
    '从后厨到开店|从后厨学徒到自己开店，用了四年|cooking',
  ],
  'sketch-talk': [
    '新手学琴 4 个错|新手学钢琴最容易犯的 4 个错|music',
    '考三次没过的原因|为什么有人科目二考了三次都没过|driving',
    '孩子主动练习|让孩子主动练习的 3 个办法|k12',
    '美甲接单难在哪|美甲新手接不到单，问题出在哪|beauty',
    '工伤别私了|工伤私了最容易吃亏的 3 种情况|legal',
    '体检报告看 3 项|拿到体检报告，先看这 3 项指标|health',
    '血糖高怎么吃|血糖偏高，主食到底该怎么吃|health',
    '零基础学 Python|零基础学 Python，第一个月该学什么|coding',
    '志愿填报 3 个误区|志愿填报最容易踩的 3 个误区|counsel',
    '劳动合同 3 个坑|签劳动合同最容易踩的 3 个坑|legal',
    '减肥先练力量|减肥别只跑步，先练力量的 3 个理由|fitness',
    '带货选品 3 个坑|带货选品最容易踩的 3 个坑|business',
    '代账客户最常问|代账客户最常问的 3 个问题|finance',
  ],
  'data-card': [
    '科目二最常挂 3 点|驾考科目二最常挂的 3 个点|driving',
    '学美甲 3 个坑|学美甲最容易踩的 3 个坑|beauty',
    '初中数学 3 个真相|初中数学提分的 3 个真相|k12',
    '成人学琴 4 个误区|成人学钢琴的 4 个误区|music',
    '律师收费 3 种方式|律师费一般怎么收，3 种方式说清|legal',
    '体检套餐怎么选|体检套餐怎么选，别只看项目数量|health',
    '升学 3 条路|中考之后的三条路，各适合什么样的孩子|counsel',
    '学编程 3 个阶段|从零学编程的 3 个阶段，别跳着走|coding',
    '康复 3 个阶段|康复训练一般分 3 个阶段，别急着加量|health',
    '初级会计考什么|初级会计考什么，3 门课怎么排|finance',
    '月嫂培训第一周|月嫂培训第一周，都练些什么|vocation',
    '美术集训课表|美术集训一天的课表，要画几张|art',
  ],
};
let ideaSeen = new Set();
/** “短标签|整句|品类 key”，第三段可以没有（老内容不受影响） */
const parseIdea = (s) => { const [label, full = label, cat = ''] = String(s).split('|'); return { label, full, cat }; };
const shuffleList = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const uniqList = (a) => [...new Set(a)];
/** 抽 3 条灵感句：选了品类就只抽这一类的；这一类句子不够 3 条时，先用别的补位，不空着 */
function pickIdeas(n = 3) {
  const cat = prefs.category || '';
  const own = [...(IDEA_POOL[state.form?.id] || IDEAS)];
  const others = Object.entries(IDEA_POOL).filter(([k]) => k !== state.form?.id).flatMap(([, v]) => v);
  const fresh = (list) => list.filter((x) => !ideaSeen.has(x));
  let pool;
  if (cat) {
    const same = [...own, ...others].filter((x) => parseIdea(x).cat === cat);
    pool = uniqList([...shuffleList(fresh(same)), ...shuffleList(same)]);
    if (pool.length < n) pool = uniqList([...pool, ...shuffleList(fresh([...own, ...others]))]);
  } else {
    pool = uniqList([...shuffleList(fresh(own)), ...shuffleList(fresh(others))]);
    if (pool.length < n) { ideaSeen = new Set(); pool = uniqList([...shuffleList(own), ...shuffleList(others)]); }
  }
  const out = pool.slice(0, n);
  out.forEach((x) => ideaSeen.add(x));
  return out;
}
const SPARK = '<svg viewBox="0 0 24 24"><path d="M12 3.5c.4 3.9 2.6 6.1 6.5 6.5-3.9.4-6.1 2.6-6.5 6.5-.4-3.9-2.6-6.1-6.5-6.5 3.9-.4 6.1-2.6 6.5-6.5zM18.5 15.5c.2 1.6 1 2.4 2.5 2.5-1.6.2-2.4 1-2.5 2.5-.2-1.6-1-2.4-2.5-2.5 1.6-.2 2.4-1 2.5-2.5z" fill="currentColor"/></svg>';
const SHUFFLE = '<svg viewBox="0 0 24 24"><path d="M4 7h3.5c2.2 0 3.5 1.2 4.6 3.3l.8 1.4c1.1 2.1 2.4 3.3 4.6 3.3H20M17 4.5 20 7l-3 2.5M4 17h3.5c1.4 0 2.4-.5 3.2-1.4M13.3 8.4c.8-.9 1.8-1.4 3.2-1.4M17 14.5l3 2.5-3 2.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let ideasFor = '';
function renderIdeas(force = false) {
  $('#ideas').classList.toggle('hidden', state.mode !== 'say');
  $('#catRow')?.classList.toggle('hidden', state.mode !== 'say');
  if (!force && ideasFor === state.form?.id && $('#ideas').children.length) return; // 切标签不重新抽
  ideasFor = state.form?.id || '';
  $('#ideas').innerHTML = `<span class="sp-label" title="不知道说什么？点一个试试">${SPARK}试试</span>`
    + pickIdeas(3).map((q, i) => {
      const { label, full } = parseIdea(q);
      return `<button class="sp" type="button" style="--i:${i}" data-full="${esc(full)}" title="${esc(full)}">${esc(label)}</button>`;
    }).join('')
    + `<button class="sp-more" type="button" title="换一批" aria-label="换一批">${SHUFFLE}</button>`;
}

// ---------- 品类小下拉：客户连话都不会说时，先点一个行业，例子和出片配色都跟着走 ----------
const CAT_CARET = '<svg class="cat-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// 下拉里分两组：客户一看就知道自己是“做培训的”还是“做专业服务的”，17 类不用一条条读
const CAT_GROUPS = [
  { label: '培训 · 手艺', keys: ['k12', 'art', 'music', 'dance', 'coding', 'driving', 'beauty', 'fitness', 'cooking', 'language', 'exam', 'business', 'vocation'] },
  { label: '专业服务', keys: ['legal', 'health', 'counsel', 'finance'] },
];
let catMenuEl = null;
/** 客户选了的品类；没选就是空字符串 */
const pickedCat = () => (prefs.category && THEMES[prefs.category] ? prefs.category : '');
function catHintText() {
  const k = pickedCat();
  return k ? `例子只出这一类，出片也按这个行业配色` : '说不出自己是哪个行业？点这里挑一个';
}
function renderCatBtn() {
  const b = $('#catBtn'); if (!b) return;
  const k = pickedCat();
  const short = k ? THEMES[k].name.split(' · ')[0] : '全部品类';
  b.innerHTML = `<i class="cat-dot" style="background:${k ? THEMES[k].red : 'var(--text-3)'}"></i><span>${esc(short)}</span>${CAT_CARET}`;
  b.classList.toggle('on', !!k);
  b.title = k ? `只看「${THEMES[k].name}」的例子` : '先挑一个行业，例子就只出这个行业的';
  const hint = $('#catHint'); if (hint) hint.textContent = catHintText();
}
function closeCatMenu() {
  if (!catMenuEl) return;
  catMenuEl.remove(); catMenuEl = null;
  const b = $('#catBtn'); b?.setAttribute('aria-expanded', 'false'); b?.classList.remove('open');
}
function openCatMenu() {
  closeCatMenu();
  const b = $('#catBtn'); if (!b) return;
  const r = b.getBoundingClientRect();
  const cur = pickedCat();
  const el = document.createElement('div');
  el.className = 'cat-menu'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', '选品类');
  const item = (k, extra = '') => {
    const th = k ? THEMES[k] : null;
    const on = k === cur;
    return `<button type="button" role="option" aria-selected="${on}" class="cat-opt${on ? ' on' : ''}${extra}" data-cat="${k}">`
      + `<span class="cat-emoji">${th ? (th.emoji[0] || '') : '✨'}</span>`
      + `<span class="cat-name">${esc(th ? th.name : '全部品类')}</span>`
      + '</button>';
  };
  // 万一以后加了新行业忘了分组，也照样列出来，不能让它消失
  const grouped = new Set(CAT_GROUPS.flatMap((g) => g.keys));
  const rest = THEME_KEYS.filter((k) => !grouped.has(k));
  const groups = rest.length ? [...CAT_GROUPS.slice(0, -1), { ...CAT_GROUPS.at(-1), keys: [...CAT_GROUPS.at(-1).keys, ...rest] }] : CAT_GROUPS;
  // 两列铺开，不用滚：一屏把 17 个行业全看到
  el.innerHTML = item('', ' cat-all') + '<div class="cat-sep" role="presentation"></div>'
    + groups.map((g) => `<div class="cat-group">${esc(g.label)}</div>` + g.keys.filter((k) => THEMES[k]).map((k) => item(k)).join('')).join('');
  document.body.appendChild(el);
  catMenuEl = el;
  [...el.querySelectorAll('.cat-opt, .cat-group')].forEach((n, i) => n.style.setProperty('--i', i)); // 一条条淡进来
  const w = Math.min(400, innerWidth - 24);
  el.style.width = w + 'px';
  el.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  const h = el.offsetHeight;
  const flip = r.bottom + 8 + h > innerHeight - 12; // 下面放不下就往上弹
  el.style.top = (flip ? Math.max(12, r.top - h - 8) : r.bottom + 8) + 'px';
  el.classList.toggle('up', flip);
  b.setAttribute('aria-expanded', 'true'); b.classList.add('open');
  requestAnimationFrame(() => {
    el.classList.add('in');
    el.querySelector('.cat-opt.on')?.scrollIntoView({ block: 'center' }); // 再打开时，直接滚到你选的那个
  });
  el.addEventListener('click', (e) => {
    const o = e.target.closest('.cat-opt'); if (!o) return;
    setCategory(o.dataset.cat);
  });
}
/** 输入框里的示例句：选了品类就用页面上第一条，别另抽一条，免得说的和看到的不一样 */
function syncInputPlaceholder() {
  if (state.attachments.length) return;
  const first = pickedCat() ? $('#ideas .sp') : null;
  $('#input').placeholder = first ? `比如：${first.dataset.full || first.textContent}` : INPUT_PLACEHOLDER;
}
/** 选品类：记住选择，例子立刻换成这一行；出片时也按这一行配色 */
function setCategory(key) {
  prefs.category = THEMES[key] ? key : '';
  savePrefs();
  closeCatMenu();
  renderCatBtn();
  ideaSeen = new Set();
  renderIdeas(true);
  $('#createErr').textContent = '';
  syncInputPlaceholder();
}
$('#catBtn')?.addEventListener('click', (e) => { e.stopPropagation(); catMenuEl ? closeCatMenu() : openCatMenu(); });
document.addEventListener('mousedown', (e) => {
  if (!catMenuEl) return;
  if (e.target.closest('.cat-menu') || e.target.closest('#catBtn')) return;
  closeCatMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCatMenu(); });
// 页面滚动就收起菜单；但菜单自己在里面滚，不算
window.addEventListener('scroll', (e) => {
  if (!catMenuEl) return;
  const t = e.target;
  if (t && t.nodeType === 1 && catMenuEl.contains(t)) return;
  closeCatMenu();
}, { passive: true, capture: true });
window.addEventListener('resize', closeCatMenu);
// 点灵感：像打字一样填进输入框（快速，不让人等）
let typeTimer = 0;
function typeInto(text) {
  const ta = $('#input');
  clearInterval(typeTimer);
  ghostStop(); syncInputPlaceholder();
  ta.value = ''; let i = 0;
  ta.classList.add('typing');
  typeTimer = setInterval(() => {
    i = Math.min(text.length, i + 2);
    ta.value = text.slice(0, i); autoGrow(ta);
    if (i >= text.length) { clearInterval(typeTimer); ta.classList.remove('typing'); ta.focus(); ta.setSelectionRange(text.length, text.length); $('#createErr').textContent = ''; updateGo(); }
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
  syncAttach();
  $('#tplHint').textContent = '';
  $('#createErr').textContent = aiReady ? '' : $('#createErr').textContent;
  renderIdeas(); updateGo();
  if (m === 'say') setTimeout(() => $('#input').focus(), 30);
  if (m === 'video') loadLib();
}
$('#modeTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.mode !== state.mode) setMode(b.dataset.mode); });
/** “加资料”是给纯文字形式补 PPT/Word 的；实拍混剪靠照片和视频就够，底下这块按钮就不显示了，省得挤 */
function syncAttach() {
  const show = state.mode === 'say' && photoKind() !== 'footage';
  $('#sayTools').classList.toggle('hidden', !show);
}
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
  const ready = state.mode === 'video' ? !b.disabled && !!$('#rmIndustry').value.trim() : !!($('#input').value.trim() || state.attachments.length);
  b.classList.toggle('ready', ready);
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
  if (vid) { setMode('video'); pickRemixFile(vid); } else { setMode('say'); addFiles(docs); }
});
// 大框比屏幕高时，底部工具栏（含“生成”按钮）贴在屏幕底部，不用滚下去找；贴住时加阴影
function updateBarStuck() { const r = $('#box').getBoundingClientRect(); $('#box').classList.toggle('bar-stuck', r.bottom > innerHeight + 2 && r.top < innerHeight - 160); }
window.addEventListener('scroll', updateBarStuck, { passive: true });
window.addEventListener('resize', updateBarStuck);
new ResizeObserver(updateBarStuck).observe($('#box'));

// ================= 说一句话 =================
$('#ideas').addEventListener('click', (e) => {
  const more = e.target.closest('.sp-more');
  if (more) { more.classList.remove('spin'); void more.offsetWidth; more.classList.add('spin'); setTimeout(() => renderIdeas(true), 120); return; }
  const b = e.target.closest('.sp'); if (!b) return;
  document.querySelectorAll('#ideas .sp').forEach((x) => x.classList.toggle('picked', x === b));
  typeInto(b.dataset.full || b.textContent);
});
$('#input').addEventListener('input', (e) => { autoGrow(e.target); $('#createErr').textContent = ''; updateGo(); });
$('#rmIndustry').addEventListener('input', () => updateGo());

// 输入框里的示例句自己“打字”：一句句演示可以怎么说，看着就知道往里填什么；一开始打字就停，删空了过一会儿再接着演示
const ghost = { timer: 0, idx: 0 };
const ghostOn = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
function ghostLines() {
  const shown = [...document.querySelectorAll('#ideas .sp')].map((b) => b.dataset.full || b.textContent).filter(Boolean);
  return shown.length ? shown : [INPUT_PLACEHOLDER.replace(/^比如：/, '')];
}
function ghostIdle() {
  const ta = $('#input');
  return state.mode === 'say' && !ta.value && !state.attachments.length && !$('#gallery').classList.contains('hidden');
}
function ghostStop() { clearTimeout(ghost.timer); ghost.timer = 0; }
function ghostStart(delay = 900) {
  ghostStop();
  if (!ghostOn()) return;
  const ta = $('#input');
  let line = ''; let i = 0; let dir = 1;
  const step = () => {
    if (!ghostIdle()) { ghost.timer = 0; syncInputPlaceholder(); return; }
    if (!line) { const ls = ghostLines(); line = ls[ghost.idx++ % ls.length]; i = 0; dir = 1; }
    i += dir;
    ta.placeholder = `比如：${line.slice(0, Math.max(0, i))}${dir > 0 && i < line.length ? '▍' : ''}`;
    let wait = dir > 0 ? 55 + Math.random() * 45 : 14;
    if (dir > 0 && i >= line.length) { dir = -1; wait = 2600; }
    else if (dir < 0 && i <= 0) { line = ''; wait = 380; }
    ghost.timer = setTimeout(step, wait);
  };
  ghost.timer = setTimeout(step, delay);
}
$('#input').addEventListener('input', () => { if (ghostIdle() && !ghost.timer) ghostStart(1600); });
$('#input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); });
$('#account').addEventListener('input', (e) => { prefs.account = e.target.value.trim(); savePrefs(); });
$('#minutes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.minutes = Number(b.dataset.v); savePrefs(); setSeg('#minutes', b.dataset.v);
});
$('#btnGo').addEventListener('click', () => ensureLogin(state.mode === 'video' ? '登录后就能用这条爆款做视频' : '登录后就能生成视频').then(() => (state.mode === 'video' ? goRemix() : (state.remix = null, generate()))).catch(() => {}));
$('#heroPhone').addEventListener('click', () => $('#btnSample').click());
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
  updateGo();
  if (!state.attachments.length && !ghost.timer) ghostStart(1500);
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
$('#attachments').addEventListener('click', (e) => {
  const b = e.target.closest('.att-x'); if (!b) return;
  state.attachments.splice(Number(b.dataset.i), 1); renderAttachments();
});
// 直接粘贴文件也能加资料
$('#input').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); return; }
});

async function generate(input = $('#input').value.trim()) {
  if (state.remix) return replicate();
  if (state.attachments.some((a) => a.loading)) { $('#createErr').textContent = '资料还在读取，稍等一下'; return; }
  const materials = state.attachments.map((a) => ({ name: a.name, text: a.text }));
  if (!input && !materials.length) { $('#createErr').textContent = '先写一句你想讲什么，或者添加一份资料'; $('#input').focus(); return; }
  if (hosted) {
    if (isTrial() && trialLeft() <= 0) { quotaOutTip(); return; }
    if (!(await hasMyKey())) {
      $('#createErr').textContent = me ? (isTrial() ? '试用次数用完了，加微信 bopii2024 开通更多次数' : '先填你自己的 DeepSeek 密钥才能出片') : '先登录才能出片';
      if (!me) openLogin('登录后就能生成视频');
      else if (!isTrial()) setTimeout(() => window.cpwOpenSettings?.(true), 150);
      return;
    }
    $('#createErr').textContent = ''; // 密钥刚填好，把“先填密钥”那句提示清掉
  }
  if (!aiReady && !hosted) { $('#createErr').textContent = '服务端还没配置 AI 密钥，可以先看示例。'; return; }
  state.input = input;
  primeAudio();
  enterStudio();
  overlayStages(materials.length ? 'AI 正在读你的资料' : 'AI 正在写文案', writeStages(state.form.name, materials.length ? ['通读你的资料', '挑出最能打动人的几点'] : ['读懂你想讲什么']));
  busy.writing = true;
  try {
    const r = await fetch('/api/script', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: state.form.id, input, materials, minutes: prefs.minutes, account: prefs.account }),
    });
    const data = await r.json();
    onAuthFail(r, data);
    if (!r.ok) throw new Error(data.error || '生成失败');
    data.account = prefs.account || data.account || '';
    // 客户自己选了品类：画面配色、行业徽章都按这一行来，不让 AI 再猜
    if (pickedCat()) data.theme = { key: pickedCat(), emoji: [] };
    takeQuota(data);
    state.flags = Array.isArray(data._flags) ? data._flags : [];
    busy.writing = false;
    await startWithScript(state.form.module.normalize ? state.form.module.normalize(data, splitLongLine) : normalize(data));
    await afterJobExport();
  } catch (err) {
    busy.writing = false;
    failJob(err.message);
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
    ${p.moves.length ? `<div class="rp-k">照着它的套路写</div><ol class="rp-moves">${p.moves.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>` : ''}
    <details class="rp-src"><summary>原视频说了什么</summary><p>${esc(rm.text)}</p></details>`;
}
function pickRemixFile(file) {
  if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|aac)$/i.test(file.name)) {
    $('#createErr').textContent = '这不是视频文件。请上传 MP4、MOV 这类视频'; return;
  }
  lib.picked = ''; markLib();
  ensureLogin('登录后就能拆解这条爆款视频').then(() => runRemix(file.name, async (opts) => (await loadAsr()).transcribe(file, opts))).catch(() => {});
}
// listen 是听写函数；从文案库来的已经是文字，传 { text } 直接跳过听写
async function runRemix(name, listen) {
  const job = ++rm.job;
  const given = typeof listen === 'object' ? listen : null;
  Object.assign(rm, { file: { name }, text: '', plan: null, error: '', busy: true, userPicked: false });
  $('#createErr').textContent = '';
  $('#rmEmpty').classList.add('hidden'); $('#rmFile').classList.remove('hidden');
  $('#rmName').textContent = name;
  renderRemixPlan(); renderRemixForms(); updateGo();
  if (given) listen = async () => given;
  try {
    remixStatus(given ? '正在拆它为什么火…' : '正在读取视频里的声音…', given ? 50 : 4);
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
    if (!given) remixStatus('听完了，正在拆它为什么火…', 90);
    const r = await fetch('/api/remix-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: text, forms: forms.map((f) => ({ id: f.id, name: f.name, fit: f.fits || f.outcome || f.tagline })) }),
    });
    const data = await r.json();
    onAuthFail(r, data);
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
// ---------- 从我的文案库选：直接摆在上传框下面，一眼看到存了哪些，点一条就用 ----------
// 文案库里存的已经是文字，跳过上传和听写，直接拆解
/** 先登录再做：没登录就弹登录框，登录完接着做 */
function loginThen(reason, fn) {
  return ensureLogin(reason).then(fn).catch(() => {});
}
const lib = { items: null, loading: null, picked: '' };
const fmtLikes = (n) => (n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万' : String(n));
function libTitle(s) { const a = s.analysis || {}; return a.hook?.text || a.title || String(s.text || '').slice(0, 30); }
function useCopy(s) {
  lib.picked = s.id; markLib();
  runRemix(libTitle(s), { text: s.text });
}
function markLib() { $('#rmLibStrip').querySelectorAll('.rl-card').forEach((el) => el.classList.toggle('on', el.dataset.id === lib.picked)); }
function renderLib(msg = '') {
  const strip = $('#rmLibStrip');
  const items = lib.items || [];
  $('#rmLibCount').textContent = items.length ? `共 ${items.length} 条` : '';
  if (msg) { strip.innerHTML = `<p class="rl-tip">${msg}</p>`; return; }
  if (!items.length) {
    strip.innerHTML = '<a class="rl-empty" href="/admin/copy.html"><b>文案库还是空的</b><span>把看到的爆款文案存进来，以后点一下就能用 →</span></a>';
    return;
  }
  strip.replaceChildren(...items.map((s) => {
    const a = s.analysis || {};
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rl-card'; b.dataset.id = s.id;
    const tag = a.subject || a.category || '';
    const likes = Number(s.stats?.likes) > 0 ? `<i>♥ ${fmtLikes(Number(s.stats.likes))}</i>` : '';
    b.innerHTML = `<b>${esc(libTitle(s))}</b><span>${tag ? `<em>${esc(tag)}</em>` : ''}${likes}</span>`;
    b.title = String(s.text || '').slice(0, 120);
    b.addEventListener('click', () => useCopy(s));
    return b;
  }));
  markLib();
}
async function loadLib() {
  if (lib.loading) return lib.loading;
  if (!lib.items) renderLib('正在打开你的文案库…');
  lib.loading = (async () => {
    const r = await fetch('/api/copy/list', { cache: 'no-store' }).catch(() => null);
    if (r?.status === 401) { lib.items = null; renderLib('<button class="link" id="rlLogin" type="button">登录</button>后就能看到你的文案库'); return; }
    if (!r?.ok) { renderLib('文案库打不开，稍后再试'); return; }
    lib.items = (await r.json()).items || [];
    renderLib();
  })().finally(() => { lib.loading = null; });
  return lib.loading;
}
$('#rmLibStrip').addEventListener('click', (e) => { if (e.target.id === 'rlLogin') loginThen('登录后就能用你的文案库', loadLib); });
// 从文案库页回来时重新拉一次，刚存的能马上看到
window.addEventListener('focus', () => { if (state.mode === 'video') loadLib(); });

$('#rmDrop').addEventListener('click', (e) => { if (!e.target.closest('#rmFile')) $('#rmInput').click(); });
$('#rmChange').addEventListener('click', () => $('#rmInput').click());
$('#rmInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) pickRemixFile(f); });
$('#rmIndustry').addEventListener('input', (e) => { prefs.industry = e.target.value.trim(); savePrefs(); $('#createErr').textContent = ''; });
$('#rmIndustry').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnGo').click(); });
async function goRemix() {
  if (!$('#rmIndustry').value.trim()) { $('#createErr').textContent = '先写一下你是做什么培训的，AI 才知道换成什么内容'; $('#rmIndustry').focus(); return; }
  if (hosted) {
    if (isTrial() && trialLeft() <= 0) { quotaOutTip(); return; }
    if (!(await hasMyKey())) {
      $('#createErr').textContent = me ? (isTrial() ? '试用次数用完了，加微信 bopii2024 开通更多次数' : '先填你自己的 DeepSeek 密钥才能出片') : '先登录才能出片';
      if (!me) openLogin('登录后才能用别人的爆款做视频');
      else if (!isTrial()) setTimeout(() => window.cpwOpenSettings?.(true), 150);
      return;
    }
    $('#createErr').textContent = '';
  }
  if (!aiReady && !hosted) { $('#createErr').textContent = '服务端还没配置 AI 密钥'; return; }
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
  overlayStages('AI 正在写你的原创文案', writeStages(state.form.name, ['学爆款的套路', `把内容换成「${industry}」`]));
  busy.writing = true;
  try {
    const r = await fetch('/api/script', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: state.form.id, reference: rm.text, plan: rm.plan, industry, minutes: prefs.minutes, account: prefs.account }),
    });
    const data = await r.json();
    onAuthFail(r, data);
    if (!r.ok) throw new Error(data.error || '生成失败');
    data.account = prefs.account || data.account || '';
    takeQuota(data);
    state.flags = Array.isArray(data._flags) ? data._flags : [];
    busy.writing = false;
    await startWithScript(prepScript(state.form, data));
    await afterJobExport();
  } catch (err) {
    busy.writing = false;
    failJob(err.message);
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


// ================= 登录（账号密码，账号由管理员开通） =================
// 随便看、随便点不用登录；点“生成”或上传别人的爆款视频时才要求登录，登录完自动接着做
let me = null;
let hosted = false; // 公网版才要登录（服务器上设了 PUBLIC_BASE_URL）；本地版不显示登录
let loginWaiters = [];
const acctName = () => (me ? (me.name || me.username || '') : '');
// 试用账号：平台提供 AI，按次数限；管理员：平台提供 AI、不限次数；普通账号用客户自己填的密钥
const isTrial = () => !!(me && me.plan === 'trial');
const platformAi = () => !!(me && (me.platformAi || me.plan === 'trial')); // 平台出 AI，不用填密钥
const trialLeft = () => (me ? Math.max(0, Number(me.quotaLeft) || 0) : 0);
const acctSub = () => (isTrial() ? `试用账号 · 还剩 ${trialLeft()} 次` : (me.role === 'admin' ? '平台 AI' : (me.expiresAt ? `有效期到 ${me.expiresAt}` : '已开通')));
function quotaOutTip() {
  toast(`试用次数用完了（共 ${me?.quota || 0} 次）。加微信 bopii2024 开通更多次数`);
  setTimeout(() => window.cpwOpenSettings?.(true), 250);
}
/** 生成接口带回来的最新试用次数：记下来，右上角立刻更新 */
function takeQuota(data) {
  if (!data?._quota || !me) return;
  me.plan = data._quota.plan; me.quota = data._quota.limit; me.quotaUsed = data._quota.used; me.quotaLeft = data._quota.left;
  renderAcct();
}
async function loadMe() {
  try { const d = await (await fetch('/api/auth/me', { cache: 'no-store' })).json(); me = d.user; hosted = !!d.hosted; } catch { me = null; }
  renderAcct();
  if (!redirectToAdminIfNeeded()) { /* 正常首页 */ }
}
// 从账号管理页被踢回来（?admin=1）：是管理员就直接进去，不是就提示
function redirectToAdminIfNeeded() {
  if (new URLSearchParams(location.search).get('admin') !== '1') return false;
  if (me && me.role === 'admin') { location.href = '/admin/accounts.html'; return true; }
  if (!me) openLogin('用管理员账号登录');
  else toast('这个账号不是管理员，管理后台打不开');
  return true;
}
window.cpwRefreshMe = loadMe;
// 出片前确认“能不能用 AI”：平台出 AI 的账号（试用/管理员）看次数；普通账号看有没有自己的密钥
async function hasMyKey() {
  if (!hosted) return true;
  if (!me) return false;
  if (isTrial()) return trialLeft() > 0;
  if (platformAi()) return true; // 管理员：平台出 AI，不用填密钥
  if (me.hasKey) return true;
  await loadMe();
  return !!(me && (isTrial() ? trialLeft() > 0 : (platformAi() || me.hasKey)));
}
function renderAcct() {
  const area = $('#acctArea');
  if (!hosted) { area.innerHTML = ''; return; } // 本地版：不用登录
  if (!me) { area.innerHTML = '<button class="btn-login" id="btnLogin" type="button">登录</button>'; return; }
  const nm = acctName();
  const sub = acctSub();
  const left = isTrial() ? trialLeft() : null;
  const chip = left == null ? '' : `<em class="quota-chip${left <= 0 ? ' out' : ''}">${left > 0 ? `剩 ${left} 次` : '试用已用完'}</em>`;
  area.innerHTML = `<button class="me" id="btnMe" type="button"><i>${esc(nm[0] ? nm[0].toUpperCase() : '?')}</i><span>${esc(nm)}</span>${chip}<svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
       <div class="me-menu" id="meMenu"><div class="me-head">${esc(nm)}<small>${esc(me.username)}${me.role === 'admin' ? ' · 管理员' : ''} · ${sub}</small></div>
       <button type="button" id="btnMySettings">${isTrial() ? '我的设置（试用 / 素材库）' : (platformAi() ? '我的设置（素材库）' : '我的设置（DeepSeek 密钥）')}</button>
       ${me.role === 'admin' ? '<button type="button" id="btnAdmin">账号管理</button>' : ''}
       <button type="button" id="btnLogout">退出登录</button></div>`;
}
$('#acctArea').addEventListener('click', async (e) => {
  if (e.target.closest('#btnLogin')) return void ensureLogin().catch(() => {});
  if (e.target.closest('#btnMe')) return void $('#acctArea').classList.toggle('open');
  if (e.target.closest('#btnMySettings')) { $('#acctArea').classList.remove('open'); return void (window.cpwOpenSettings ? window.cpwOpenSettings() : toast('设置打不开，刷新一下页面')); }
  if (e.target.closest('#btnAdmin')) return void (location.href = '/admin/accounts.html');
  if (e.target.closest('#btnLogout')) {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    me = null; $('#acctArea').classList.remove('open'); renderAcct(); toast('已退出登录'); loadMe();
  }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#acctArea')) $('#acctArea').classList.remove('open'); });

/** 已登录直接继续；没登录弹出登录框，登录成功后继续（关掉框就算了） */
function ensureLogin(reason) {
  if (!hosted) return Promise.resolve(me);
  if (me) return Promise.resolve(me);
  return new Promise((resolve, reject) => { loginWaiters.push({ resolve, reject }); openLogin(reason); });
}
const dlg = $('#loginDlg');
function openLogin(reason) {
  if (dlg.open) return;
  $('#lgSub').textContent = reason || '账号由管理员开通';
  $('#lgUser').value = prefs.username || '';
  $('#lgPass').value = ''; $('#lgPass').type = 'password'; $('#lgEye').classList.remove('on');
  $('#lgCaps').classList.add('hidden');
  $('#lgErr').textContent = '';
  dlg.showModal();
  setTimeout(() => ($('#lgUser').value ? $('#lgPass') : $('#lgUser')).focus(), 60);
}
dlg.addEventListener('close', () => {
  const ws = loginWaiters; loginWaiters = [];
  for (const w of ws) (me ? w.resolve(me) : w.reject(new Error('cancel')));
});
$('#lgClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // 点框外关闭
let loggingIn = false;
async function doLogin() {
  const username = $('#lgUser').value.trim();
  const password = $('#lgPass').value;
  if (!username) { $('#lgErr').textContent = '先填账号'; $('#lgUser').focus(); return; }
  if (!password) { $('#lgErr').textContent = '先填密码'; $('#lgPass').focus(); return; }
  if (loggingIn) return;
  loggingIn = true;
  const b = $('#lgLogin'); b.disabled = true; b.firstChild.textContent = '正在登录…'; $('#lgErr').textContent = '';
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '登录失败');
    me = d.user; prefs.username = username; savePrefs();
    renderAcct();
    dlg.close();
    toast(isTrial() ? `登录成功，试用还剩 ${trialLeft()} 次` : `登录成功，${acctName()}`);
    // 是从账号管理页被踢回来登录的：管理员登录完直接进后台
    if (redirectToAdminIfNeeded()) return;
    // 试用/管理员登录就能用（平台出 AI）；普通账号还没填自己的密钥：直接弹设置，不然点生成会报错
    if (isTrial()) { if (trialLeft() <= 0) quotaOutTip(); }
    else if (!platformAi() && !me.hasKey) setTimeout(() => window.cpwOpenSettings?.(true), 350);
  } catch (err) {
    $('#lgErr').textContent = err.message;
    $('#lgPass').select();
    $('#lgPass').classList.add('shake'); setTimeout(() => $('#lgPass').classList.remove('shake'), 500);
  }
  b.disabled = false; b.firstChild.textContent = '登录';
  loggingIn = false;
}
$('#lgLogin').addEventListener('click', doLogin);
$('#lgEye').addEventListener('click', () => {
  const p = $('#lgPass'); const show = p.type === 'password';
  p.type = show ? 'text' : 'password';
  $('#lgEye').classList.toggle('on', show);
  $('#lgEye').setAttribute('aria-label', show ? '隐藏密码' : '显示密码'); $('#lgEye').title = show ? '隐藏密码' : '显示密码';
  p.focus();
});
// 大写锁定开着：密码明明对却登不上，很多人想不到是这个
for (const ev of ['keydown', 'keyup']) $('#lgPass').addEventListener(ev, (e) => { if (e.getModifierState) $('#lgCaps').classList.toggle('hidden', !e.getModifierState('CapsLock')); });
$('#lgPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
$('#lgUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#lgPass').focus(); } });
/** 接口说没登录 / 没密钥 / 试用次数用完 / 账号停用：清理状态，该弹登录弹登录，该弹设置弹设置 */
function onAuthFail(r, data) {
  if (r.status === 401) { me = null; renderAcct(); return; }
  if (data?.code === 'no-key') setTimeout(() => window.cpwOpenSettings?.(true), 250);
  if (data?.code === 'quota') { quotaOutTip(); loadMe(); }
  if (data?.code === 'platform-key') { toast(data.error || '平台 AI 密钥没配置，请联系管理员（微信 bopii2024）'); }
  if (data?.code === 'disabled' || data?.code === 'expired') { me = null; renderAcct(); toast(data.error || '账号不能用了，联系管理员'); }
}

// ================= ③ 看成片 =================
function enterStudio() {
  stop();
  state.script = null; state.flags = [];
  state.master = null; state.voiceMix = null; state.buffers = null; state.env = null; state.audioKey = ''; state.mixKey = '';
  const ctx = $('#preview').getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // AI 写文案的这十几秒，右边先放骨架占位，不留一片空白
  $('#editor').innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="sec-skel" style="--i:${i}"><i></i><i></i><i class="short"></i></div>`).join('');
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
  $('#photoPanel2').classList.toggle('hidden', !(state.form.needsPhotos || state.form.photoKind));
  $('#photoPanel2 .group-title').firstChild.textContent = PHOTO_TEXT[photoKind()].name + ' ';
  $('#photoPanel2 .group-title span').textContent = PHOTO_TEXT[photoKind()].hint2;
  $('#account2').value = script.account || '';
  await state.form.module.preloadFonts(script);
  if (!prefs.voicePicked) prefs.voice = autoVoice(script);
  state.assets.media = [];
  renderEditor();
  refresh();
  state.t = 0;
  drawNow();
  const stock = state.form.needsStock;
  overlaySpin(stock ? '正在配音、找画面' : '正在配音', stock ? `${countLines()} 句配音，${script.sections.length} 个镜头，半分钟左右` : `${countLines()} 句，10 秒左右`);
  try {
    await Promise.all([ensureAudio(), stock ? findMedia() : null]);
    if (stock) await ensureAudio(); // 画面找好后音效可能要跟着变（拼图格子的出现声），重新混一下
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
    <div class="sec" data-i="${i}" style="--i:${i}">
      <div class="sec-top"><span class="no">${String(i + 1).padStart(2, '0')}</span>
        <input class="bare tag" data-k="tag" value="${esc(x.tag)}" maxlength="8" spellcheck="false" />
        <span class="mod">${x.scene ? SCENE_NAMES[x.scene] || '' : x.visual ? VIS_NAMES[x.visual.type] || '' : MOD_NAMES[x.module?.type] || '标题'}</span>${state.form.needsStock ? '<button class="swap" data-swap title="给这个镜头换一张画面">换图</button>' : ''}</div>
      ${x.headline ? `<input class="bare h1" data-k="h0" value="${esc(x.headline[0])}" maxlength="14" placeholder="标题" spellcheck="false" />` : ''}
      ${x.headline ? `<input class="bare h2" data-k="h1" value="${esc(x.headline[1])}" maxlength="14" placeholder="金色副标题" spellcheck="false" />` : ''}
      <textarea class="bare lines" data-k="lines" rows="2" spellcheck="false">${esc(x.lines.join('\n'))}</textarea>
      ${x.headline ? `<input class="bare concl" data-k="conclusion" value="${esc(x.conclusion)}" maxlength="20" placeholder="金色结论句" spellcheck="false" />` : ''}
      <div class="sec-flag hidden"></div>
    </div>`).join('');
  document.querySelectorAll('.bare.lines').forEach(autoGrow);
  updateFlags();
}
// AI 可能编的内容（占位词、客户没给过的数字和服务）：标黄，改掉之后自动消失
const flagsOf = (x) => { const t = JSON.stringify(x); return (state.flags || []).filter((f) => f.word && t.includes(f.word)); };
function updateFlags() {
  if (!state.script) return;
  let n = 0;
  document.querySelectorAll('#editor .sec').forEach((el) => {
    const fs = flagsOf(state.script.sections[Number(el.dataset.i)]); n += fs.length;
    el.classList.toggle('flagged', fs.length > 0);
    const box = el.querySelector('.sec-flag'); box.classList.toggle('hidden', !fs.length);
    box.innerHTML = fs.map((f) => `<span><b>「${esc(f.word)}」</b>${esc(f.why)}</span>`).join('');
  });
  const note = $('#flagNote'); note.classList.toggle('hidden', !n);
  if (n) note.innerHTML = `<b>有 ${n} 处请你核对</b><span>AI 可能写了你没提供的内容，发之前在标黄的段落里改成真实情况，或者删掉。</span>`;
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
  if (k !== 'lines') updateFlags();
  else if (k === 'lines') { autoGrow(e.target); x.lines = v.split('\n').map((l) => l.trim()).filter(Boolean); scheduleRevoice(); updateFlags(); }
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
  if (state.form.autoSkin) { if (state.script) { state.script.skin = b.dataset.skin; delete state.script.bgm; remix(); } } else { prefs.skins = { ...(prefs.skins || {}), [state.form.id]: b.dataset.skin }; savePrefs(); }
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
  prefs.account = e.target.value.trim(); savePrefs(); e.target.classList.remove('need');
  if (state.script) { state.script.account = prefs.account; drawNow(); }
});

// ---------- 声音 ----------
function renderVoices() {
  $('#voices').innerHTML = (prefs.voicePicked ? '' : '<div class="voice-auto">已按你的行业自动配了声音，点一个就能换</div>') + VOICES.map((v) => `
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
  prefs.voice = v.dataset.v; prefs.voicePicked = true; savePrefs(); // 客户自己挑过，以后就不按行业自动换了
  $('#voices .voice-auto')?.remove();
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
  if (state.form.autoSkin && state.script) state.script.bgm = b.dataset.bgm; else { prefs.bgm = { ...(prefs.bgm || {}), [state.form.id]: b.dataset.bgm }; savePrefs(); }
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
const bgmOf = () => {
  // 每条自带版式的模板：音乐跟着版式走（这一条里客户自己挑过就用他挑的）
  if (state.form?.autoSkin && state.form.module.bgmFor && state.script) return { style: state.script.bgm || state.form.module.bgmFor(state.script, skinOf()), volume: prefs.bgmVol || 'mid' };
  return { style: prefs.bgm?.[state.form.id] ?? state.form.module.meta.bgm ?? 'warm', volume: prefs.bgmVol || 'mid' };
};

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
  const mod = state.form.module;
  const mk = JSON.stringify([bgmOf(), mod.sfxCues ? [skinOf(), state.assets.pool?.length || 0, state.script.sections.map((s) => s.visual?.type)] : 0]);
  if (state.master && state.mixKey === mk && state.masterFor === state.voiceMix) return;
  let master = await mixWithBgm(state.voiceMix, bgmOf());
  // 转场、弹出、画面出现的音效
  if (mod.sfxCues) {
    const { addSfx } = await import('./engine/sfx.js');
    master = await addSfx(master, mod.sfxCues({ script: state.script, tl: state.tl, planData: state.planData, skinId: skinOf(), assets: state.assets }));
  }
  state.master = master;
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
// 这几个套路的画面上一直挂着「@账号名」，没填就显示“我的账号”，导出前提醒一次
const SHOWS_ACCOUNT = new Set(['footage-mix', 'data-card', 'deep-dive', 'pixel-story', 'series-intro']);
function jobIdFromUrl() {
  return new URLSearchParams(location.search).get('job') || '';
}
async function failJob(msg) {
  const id = jobIdFromUrl();
  if (!id) return;
  await fetch('/api/jobs/' + encodeURIComponent(id) + '/fail', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: String(msg || '出片失败') }),
  }).catch(() => {});
}
async function afterJobExport() {
  const id = jobIdFromUrl();
  if (!id) return;
  const blob = await exportVideo({ skipAccountPrompt: true, saveToWorks: false, jobId: id });
  if (blob) { try { window.close(); } catch {} }
}
async function waitAiReady(ms = 10000) {
  const t0 = Date.now();
  while (!aiReady && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 200));
  return !!aiReady;
}

async function exportVideo({ skipAccountPrompt = false, saveToWorks = true, jobId = '' } = {}) {
  if (!state.script || state.exporting) return null;
  if (!skipAccountPrompt && !state.script.account && SHOWS_ACCOUNT.has(state.form.id) && !state.askedAccount) {
    state.askedAccount = true;
    switchTab('style');
    const f = $('#account2'); f.classList.add('need'); f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast('视频上会显示你的账号名，先在这里填一下（不填就显示“我的账号”），再点导出');
    return null;
  }
  if (!exportSupported()) { toast(matchMedia('(pointer: coarse)').matches ? '这个手机浏览器还不能出片，请用电脑上的 Chrome 或 Edge 打开' : '当前浏览器不支持本地出片，请用最新版 Chrome 或 Edge'); return null; }
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
      audioBuffer: state.master, signal, threads: EXPORT_THREADS,
      onProgress: (p, left) => (tabTitle(`${Math.round(p * 100)}% 正在导出`), overlayProgress(p, '正在生成视频', `${p < 0.06 ? `一般要 1–5 分钟（视频越长越久）` : left > 90 ? `还要约 ${Math.round(left / 60)} 分钟` : `还要约 ${Math.max(5, Math.ceil(left / 5) * 5)} 秒`} · 可以先去忙别的`)),
    });
    const name = `${state.script.title || '我的视频'}.mp4`.replace(/[\\/:*?"<>|]/g, '');
    const file = new File([blob], name, { type: 'video/mp4' });
    const canShare = matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] });
    if (jobId) {
      const up = await fetch('/api/jobs/' + encodeURIComponent(jobId) + '/complete?title=' + encodeURIComponent(state.script?.title || name.replace(/\.mp4$/, '')), {
        method: 'POST', headers: { 'content-type': 'video/mp4' }, body: blob,
      });
      if (!up.ok) {
        const err = await up.json().catch(() => ({}));
        throw new Error(err.error || '回传成片失败');
      }
    } else if (saveToWorks) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      fetch('/api/works?title=' + encodeURIComponent(state.script?.title || name.replace(/\.mp4$/, '')), {
        method: 'POST', headers: { 'content-type': 'video/mp4' }, body: blob,
      }).catch(() => {});
    }
    if (document.hidden) { titleDone = true; tabTitle('✓ 视频好了'); } else tabTitle('');
    overlayDone('视频已导出', `${name} · ${(blob.size / 1048576).toFixed(0)} MB · ${canShare ? '点下面按钮存到相册或发给微信' : '已保存到下载文件夹，也存进了我的作品'}`, [
      ...(canShare ? [{ label: '存到手机 / 分享', primary: true, fn: () => navigator.share({ files: [file], title: state.script?.title || '' }).catch(() => {}) }] : []),
      { label: '再做一条', primary: !canShare, fn: () => { hideOverlay(); show('gallery'); } },
      { label: '看我的作品', fn: () => { location.href = '/works.html'; } },
      { label: '继续修改', fn: hideOverlay },
    ]);
    return blob;
  } catch (err) {
    if (jobId) failJob(err.message);
    if (signal.cancelled) { hideOverlay(); toast('已取消导出'); } else overlayMessage('导出失败', err.message, [{ label: '知道了', primary: true, fn: hideOverlay }]);
    return null;
  } finally {
    state.exporting = null;
    if (!titleDone) tabTitle('');
    $('#btnExport').disabled = false;
  }
}

$('#btnExport').addEventListener('click', () => { exportVideo({}); });

// ---------- 标签页标题 + 离开提醒 ----------
// 导出要 1–3 分钟，客户常切去别的标签页：标题上直接显示进度，好了显示 ✓，不用切回来看
const BASE_TITLE = document.title;
let titleDone = false;
function tabTitle(text) { document.title = text ? `${text} · 出片王` : BASE_TITLE; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && titleDone) { titleDone = false; tabTitle(''); } });
// 正在写文案 / 正在导出时关页面、刷新：先拦一下，免得白等
window.addEventListener('beforeunload', (e) => { if (state.exporting || busy.writing) { e.preventDefault(); e.returnValue = ''; } });

// ---------- 浮层 ----------
const RING = 213.6;
function overlayBase(cls, title, sub, actions = []) {
  clearInterval(stageTimer);
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
// AI 写文案那十几二十秒：一句一句告诉客户“现在在干嘛”，再带上已经等了几秒，不让人觉得卡住了
let stageTimer = 0;
function overlayStages(title, stages, { every = 4.5 } = {}) {
  overlayBase('spin', title, stages[0]);
  const t0 = performance.now();
  stageTimer = setInterval(() => {
    const sec = Math.floor((performance.now() - t0) / 1000);
    const line = sec >= 45 ? 'AI 那边这会儿有点忙，再等一下，一般不超过 1 分钟' : stages[Math.min(stages.length - 1, Math.floor(sec / every))];
    $('#ovSub').textContent = sec >= 3 ? `${line} · ${sec} 秒` : line;
  }, 500);
}
const writeStages = (formName, extra = []) => [...extra, '想一个能让人停下来的开头', `按「${formName}」的结构排段落`, '给每一段挑画面', '检查广告法用语、核对有没有乱编数字', '快好了，正在收尾'];
const overlayMessage = (title, sub, actions) => overlayBase('msg', title, sub, actions);
const overlayDone = (title, sub, actions) => { overlayBase('done', title, sub, actions); $('#ovPct').textContent = '✓'; };
function overlayProgress(p, title, sub, actions) {
  if (actions || !$('#overlay').classList.contains('prog')) overlayBase('prog', title, sub, actions || []);
  $('#ovSub').textContent = sub;
  $('#ovPct').textContent = Math.round(p * 100) + '%';
  $('#ringFill').style.strokeDashoffset = String(RING * (1 - p));
}
function hideOverlay() {
  clearInterval(stageTimer);
  const ov = $('#overlay');
  // 个别显卡/浏览器（尤其被自动化工具启动的 Chrome）在「带玻璃模糊的浮层突然隐藏」时会留下巨大的黑色残影。
  // 做法：先撤掉模糊，下一帧再真正隐藏，并强制重绘一次舞台，让合成层重新生成。
  ov.style.backdropFilter = 'none'; ov.style.webkitBackdropFilter = 'none';
  requestAnimationFrame(() => {
    ov.className = 'overlay hidden';
    const st = document.querySelector('.stage');
    if (st) {
      st.style.transform = 'translateZ(0)';
      requestAnimationFrame(() => { st.style.transform = ''; drawNow(); });
    } else drawNow();
  });
}

// ---------- 播放 ----------
const pctx = $('#preview').getContext('2d');
function drawNow() {
  if (!state.script || !state.tl) return;
  const data = { script: state.script, tl: state.tl, planData: state.planData, t: state.t, skinId: skinOf(), env: state.env, fps: FPS, assets: state.assets };
  const mod = state.form.module;
  mod.drawFrame(pctx, data);
  // 视频素材在后台解码；停着的时候解好了再补画一帧
  if (mod.prepareFrame) mod.prepareFrame(data).then(() => { if (!state.playing && state.t === data.t && state.form.module === mod) mod.drawFrame(pctx, data); }).catch(() => {});
  updateTime();
}
function primeAudio() { try { getAudioCtx().resume(); } catch { /* */ } }
/** 个别显卡/浏览器（尤其被自动化工具启动的 Chrome）合成层会卡住，画面像被一张黑图盖住。
 *  这里强制把舞台重新合成一遍：切换一下 3D 变换 + 重画当前帧。 */
function hardRepaint() {
  const st = document.querySelector('.stage');
  if (!st) { drawNow(); return; }
  st.style.transform = 'translateZ(0)';
  requestAnimationFrame(() => { st.style.transform = ''; drawNow(); });
}
function play() {
  if (!state.script || !state.tl) return;
  if (state.t >= state.tl.duration - 0.05) state.t = 0;
  state.playing = true;
  $('#playIcon').innerHTML = '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>';
  state.playStartT = state.t;
  state.playStartPerf = performance.now();
  // 兜底：开始播放 1.8 秒后时间还没走（说明画面卡住了），强制重绘一次
  clearTimeout(state.playWatch);
  state.playWatch = setTimeout(() => { if (state.playing && state.t < 0.15) hardRepaint(); }, 1800);
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
// 看成片时的快捷键：空格 播放/暂停，← → 退/进 5 秒（在输入框里打字时不抢）
document.addEventListener('keydown', (e) => {
  if ($('#studio').classList.contains('hidden') || !$('#overlay').classList.contains('hidden')) return;
  const el = document.activeElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) && el.type !== 'range') return;
  if (el?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.tl) { e.preventDefault(); seek(state.t + (e.key === 'ArrowLeft' ? -5 : 5)); }
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
  $('#scrub').style.setProperty('--p', `${(state.t / state.tl.duration) * 100}%`); // 进度条已播放部分的颜色
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
state.assets = { photos: [], scenes: [], footage: [], media: [] };
state.photoLists = { photos: [], scenes: [], footage: [] };
state.photoBusy = 0;
const photoKind = () => state.form?.photoKind || 'photos';
const PHOTO_TEXT = {
  photos: { name: '我的形象照', hint: '可选，不传就用卡通讲师', hint2: '每个镜头轮流换一张', max: 8, add: '添加照片' },
  scenes: { name: '现场照片', hint: '可选，讲到“我们”时用', hint2: '讲到“我们”时优先用；改完点镜头上的「换图」', max: 20, add: '添加照片' },
  footage: { name: '我的照片和视频', hint: '课堂、校区、学员、作品；照片最多 30 张、视频最多 10 条', hint2: '按上传顺序铺到各个镜头；点镜头上的「换图」可以换', max: 40, maxPhotos: 30, maxVideos: 10, add: '加照片', addVideo: '加视频' },
};
async function loadPhotos(kind = photoKind()) {
  const list = await listPhotos(kind);
  state.photoLists[kind].forEach((p) => URL.revokeObjectURL(p.url));
  state.photoLists[kind] = (await Promise.all(list.map(async (r) => {
    try {
      const bitmap = await createImageBitmap(r.blob);
      // 视频：blob 是封面图，clip 是压缩好的画面数据
      return { id: r.id, url: URL.createObjectURL(r.blob), bitmap, clip: r.clip ? { ...r.clip, id: r.id } : null };
    } catch { return null; }
  }))).filter(Boolean);
  state.assets[kind] = kind === 'footage'
    ? state.photoLists[kind].map((p) => (p.clip ? { type: 'video', clip: p.clip, poster: p.bitmap } : { type: 'photo', bitmap: p.bitmap }))
    : state.photoLists[kind].map((p) => p.bitmap);
  renderPhotoRows();
  if (state.script && kind === 'footage' && photoKind() === 'footage' && state.tl) findMedia().catch(() => {}); // 在成片页加了素材：重新铺一遍
  else if (state.script) drawNow();
}
const fmtSec = (s) => `0:${String(Math.round(s)).padStart(2, '0')}`;
function renderPhotoRows() {
  const kind = photoKind(); const list = state.photoLists[kind]; const tx = PHOTO_TEXT[kind];
  const cnt = document.getElementById('phCount');
  const tile = (p) => `<div class="ph-tile ${kind}"><img src="${p.url}" alt="" />${p.clip ? `<span class="vd">▶ ${fmtSec(p.clip.dur)}</span>` : ''}<button class="del" data-del-photo="${p.id}" title="删除">×</button></div>`;
  const busy = Array.from({ length: state.photoBusy }, (_, k) => `<div class="ph-tile busy"><div><i></i>${kind === 'photos' ? '抠图中' : k === 0 && state.photoPct ? `处理中 ${state.photoPct}%` : '处理中'}</div></div>`).join('');
  let html;
  if (kind === 'footage') {
    // 照片和视频分两行，各走各的入口，各自有上限；行高固定，传多少都不变高
    const photos = list.filter((p) => !p.clip); const videos = list.filter((p) => p.clip);
    if (cnt) cnt.textContent = list.length ? `已加 ${list.length} 个` : '';
    const group = (label, items, max, attr, addText, extra) => `<div class="ph-group">
        <div class="ph-ghead"><b>${label}</b><em class="${items.length > max ? 'over' : ''}">${items.length > max ? `${items.length} 个，超了` : `${items.length} / ${max}`}</em></div>
        <div class="ph-gline">${items.map(tile).join('')}${items.length >= max ? '<div class="ph-tile add full">已满</div>' : `<button class="ph-tile add" ${attr}>＋<br/>${addText}</button>`}${extra}</div>
      </div>`;
    html = group('照片', photos, tx.maxPhotos, 'data-add-photo', tx.add, '')
      + group('视频', videos, tx.maxVideos, 'data-add-video', tx.addVideo, busy);
  } else {
    if (cnt) cnt.textContent = '';
    html = list.map(tile).join('') + busy
      + (list.length + state.photoBusy < tx.max ? `<button class="ph-tile add" data-add-photo>＋<br/>${tx.add}</button>` : '');
  }
  document.querySelectorAll('[data-photo-row]').forEach((el) => { el.innerHTML = html; });
}
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-add-photo]')) { $('#photoInput').click(); return; }
  if (e.target.closest('[data-add-video]')) { $('#videoInput').click(); return; }
  const del = e.target.closest('[data-del-photo]');
  if (del) { await deletePhoto(del.dataset.delPhoto, photoKind()); await loadPhotos(); }
});
async function addPhotoFiles(raw) {
  const kind = photoKind(); const tx = PHOTO_TEXT[kind];
  const isVid = (f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name);
  let files = [...raw];
  if (kind === 'footage') {
    // 照片、视频各算各的上限，别让客户一口气传 100 个进来
    const list = state.photoLists.footage;
    const roomP = Math.max(0, tx.maxPhotos - list.filter((p) => !p.clip).length);
    const roomV = Math.max(0, tx.maxVideos - list.filter((p) => p.clip).length);
    const imgs = files.filter((f) => !isVid(f)); const vids = files.filter(isVid);
    if (imgs.length > roomP) toast(`照片最多 ${tx.maxPhotos} 张，多的没加`);
    if (vids.length > roomV) toast(`视频最多 ${tx.maxVideos} 条，多的没加`);
    files = [...imgs.slice(0, roomP), ...vids.slice(0, roomV)];
  } else {
    files = files.filter((f) => !isVid(f)).slice(0, Math.max(0, tx.max - state.photoLists[kind].length));
  }
  if (!files.length) { toast(kind === 'footage' ? '照片或视频已经加满了，先删几个再传' : `最多 ${tx.max} 个`); return; }
  state.photoBusy += files.length; renderPhotoRows();
  let cutoutPerson;
  if (kind === 'photos') {
    try { ({ cutoutPerson } = await import('./engine/cutout.js')); } catch { toast('抠图组件加载失败，请刷新重试'); state.photoBusy = 0; renderPhotoRows(); return; }
  }
  for (const f of files) {
    try {
      if (kind === 'photos') { const r = await cutoutPerson(f); await savePhoto(r.blob); }
      else if (kind === 'footage' && (f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name))) {
        // 视频：取前 30 秒，压成 720p、去掉原声，存在本机
        const { importVideo, CLIP_MAX_SEC } = await import('./engine/footage.js');
        state.photoPct = 0; renderPhotoRows();
        const r = await importVideo(f, (p) => { const n = Math.round(p * 100); if (n !== state.photoPct) { state.photoPct = n; renderPhotoRows(); } });
        await savePhoto(r.thumb, 'footage', { clip: r.clip });
        if (r.clip.dur >= CLIP_MAX_SEC - 0.5) toast(`视频比较长，只用了前 ${CLIP_MAX_SEC} 秒`);
      } else await savePhoto(await shrinkPhoto(f), kind);
    } catch (err) { toast(err.message || '这个文件处理失败，换一个试试'); }
    state.photoBusy--; state.photoPct = 0; await loadPhotos(kind);
  }
}
$('#photoInput').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; addPhotoFiles(files); });
$('#videoInput').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; addPhotoFiles(files); });
// 直接把照片和视频拖到上传区也能加（只在这个形式里这样处理，别和首页“拖视频做爆款”打架）
(() => {
  const panel = $('#photoPanel');
  const on = () => photoKind() === 'footage';
  panel.addEventListener('dragenter', (e) => { if (!on()) return; e.preventDefault(); e.stopPropagation(); panel.classList.add('dropping'); });
  panel.addEventListener('dragover', (e) => { if (!on()) return; e.preventDefault(); e.stopPropagation(); panel.classList.add('dropping'); });
  panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('dropping'); });
  panel.addEventListener('drop', (e) => {
    if (!on()) return;
    e.preventDefault(); e.stopPropagation();
    panel.classList.remove('dropping');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) addPhotoFiles(files);
  });
})();

// ---------- 画面素材：现场照片优先，其余从正版素材库按关键词找 ----------
let stockMod = null;
const loadStock = () => (stockMod ||= import('./engine/stock.js'));
async function findMedia() {
  const script = state.script;
  const { resolveMedia } = await loadStock();
  if (photoKind() === 'footage') return findFootage(script, resolveMedia);
  const r = await resolveMedia(script.sections.map((x) => ({ kw: x.kw, ours: x.ours, pick: x.pick, src: x.pick ? '' : x.src, by: x.by })), state.assets.scenes);
  if (state.script !== script) return;
  state.assets.media = r.media; state.mediaPicks = r.picks;
  renderCredits();
  if (r.error) toast(r.error.includes('PEXELS') ? '素材库还没配置，先用占位画面（可以上传自己的现场照片）' : r.error);
  drawNow();
}
/** 实拍混剪：客户自己的照片和视频先铺满，不够的镜头再从素材库补；素材库也没有，就把自己的素材再轮一遍 */
async function findFootage(script, resolveMedia) {
  const { planFootage } = await import('./engine/footage.js');
  const n = script.sections.length;
  const f = planFootage(n, state.assets.footage);
  state.footageSlots = f.slots;
  const need = f.media.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
  let error = '';
  if (need.length) {
    const r = await resolveMedia(need.map((i) => { const x = script.sections[i]; return { kw: x.kw, pick: x.pick, src: x.pick ? '' : x.src, by: x.by }; }), []);
    need.forEach((i, k) => { if (r.media[k]) { f.media[i] = r.media[k]; f.picks[i] = r.picks[k]; } });
    error = r.error;
    if (f.slots.length) need.forEach((i, k) => { if (!f.media[i]) { const idx = (i + k) % f.slots.length; f.media[i] = f.slots[idx]; f.picks[i] = { own: true, idx }; } });
  }
  if (state.script !== script) return;
  state.assets.media = f.media; state.mediaPicks = f.picks;
  // 素材池：分屏、四宫格、一句一换时从这里再挑画面（自己的素材 + 补上的素材库图片）
  state.assets.pool = [...new Set([...f.slots, ...f.media.filter(Boolean)])];
  renderCredits();
  if (error && f.media.some((m) => !m)) toast(error.includes('PEXELS') ? '素材库还没配置，没有素材的镜头先用占位画面（多传几个自己的照片和视频就行）' : error);
  else if (!state.assets.footage.length) toast('还没上传自己的照片和视频，先用素材库的画面；在「风格」里可以加');
  drawNow();
}
async function swapMedia(i) {
  const x = state.script.sections[i];
  x.pick = (x.pick || 0) + 1;
  const { resolveMedia } = await loadStock();
  if (photoKind() === 'footage' && state.mediaPicks?.[i]?.own && (state.footageSlots?.length || 0) > 1) {
    const idx = (state.mediaPicks[i].idx + 1) % state.footageSlots.length;
    state.assets.media[i] = state.footageSlots[idx]; state.mediaPicks[i] = { own: true, idx };
    renderCredits(); drawNow(); return;
  }
  const own = photoKind() === 'scenes' && state.mediaPicks?.[i]?.own && state.assets.scenes.length > 1;
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
renderCatBtn();
syncInputPlaceholder();
ghostStart(1400);
$('#account').value = prefs.account;
setSeg('#minutes', String(prefs.minutes));
$('#rmIndustry').value = prefs.industry || '';
setMode('say');
loadMe(); // 刷新页面后恢复登录状态
// 字体加载完再摆好滑块的位置，然后才打开过渡动画（避免一进来滑块乱飞）
document.fonts.ready.then(() => { moveTabInd(); moveSegThumb($('#minutes')); updateTplNav(); updateBarStuck(); requestAnimationFrame(() => document.body.classList.add('ready')); });
loadPhotos('photos').catch(() => {});
loadPhotos('scenes').catch(() => {});
loadPhotos('footage').catch(() => {});
fetch('/api/status').then((r) => r.json()).then((d) => { aiReady = !!d.ai || !!d.hosted; if (!aiReady) $('#createErr').textContent = '服务端还没配置 AI 密钥，可以先看示例。'; if (d.asrBase) asrBase = d.asrBase; if (d.asrModel) asrModel = d.asrModel; if (typeof d.hosted === 'boolean') hosted = d.hosted; renderAcct(); }).catch(() => { aiReady = false; });

function applyQueryForm(formName) {
  if (formName && typeof forms !== 'undefined') {
    const hit = forms.find((f) => f.name === formName || f.id === formName)
    if (hit) selectForm(hit.id)
  }
}

// 从外部（选题雷达 / 出片王 / 任务接口）带主题进来：?topic=&form=&minutes=&auto=&job=&account=&mode=&industry=
;(async () => {
  const q = new URLSearchParams(location.search)
  const topic = q.get('topic')
  const formName = q.get('form')
  const mins = q.get('minutes')
  const account = q.get('account')
  const auto = q.get('auto') === '1'
  const mode = q.get('mode')
  const industry = (q.get('industry') || topic || '').trim()
  const job = q.get('job')
  if (!topic && !formName && !job && !auto) return

  if (['1', '2', '3'].includes(mins)) { prefs.minutes = Number(mins); setSeg('#minutes', mins) }
  if (account) { prefs.account = account; const el = $('#account'); if (el) el.value = account }

  const apply = () => {
    applyQueryForm(formName)
    if (topic && mode !== 'remix') {
      const input = $('#input')
      if (!input) return
      input.value = topic
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
    }
  }
  if (document.querySelector('#tplStrip .t')) apply()
  else await new Promise((r) => setTimeout(() => { apply(); r() }, 400))

  if (!auto) return
  if (!(await waitAiReady())) {
    const msg = '服务端还没配置 AI 密钥，可以先看示例。'
    if (job) failJob(msg)
    $('#createErr').textContent = msg
    return
  }

  if (mode === 'remix') {
    if (!industry) { if (job) failJob('请提供行业或主题'); $('#createErr').textContent = '请提供行业或主题'; return }
    if (!job) { $('#createErr').textContent = '对标片任务缺少 job 参数'; return }
    setMode('video')
    prefs.industry = industry
    $('#rmIndustry').value = industry
    applyQueryForm(formName)
    const r = await fetch('/api/jobs/' + encodeURIComponent(job) + '/reference')
    if (!r.ok) { failJob('找不到参考视频'); return }
    const buf = await r.blob()
    const file = new File([buf], 'reference.mp4', { type: buf.type || 'video/mp4' })
    try {
      await runRemix(file.name, async (opts) => (await loadAsr()).transcribe(file, opts))
    } catch (err) { failJob(err.message); return }
    if (!rm.plan) { failJob(rm.error || '拆解失败'); return }
    if (!formName && rm.plan.form) applyQueryForm(rm.plan.form)
    await replicate()
    return
  }

  if (topic) await generate(topic)
})()

// 从文案库带一条进来：?copy=<id> → 直接进「用别人的爆款做」，跳过上传和听写
// 文案库页没登录会跳来 ?login=1&back=<原页面>：登录完再回去
;(() => {
  const q = new URLSearchParams(location.search);
  const id = q.get('copy'); const back = q.get('back') || '';
  if (!id && !q.get('login')) return;
  history.replaceState(null, '', location.pathname);
  if (!id) return loginThen('登录后就能用你的文案库', () => { if (back.startsWith('/') && !back.startsWith('//') && !back.includes('\\')) location.href = back; });
  const go = async () => {
    openRemix();
    const r = await fetch('/api/copy/get?id=' + encodeURIComponent(id), { cache: 'no-store' }).catch(() => null);
    if (r?.status === 401) return loginThen('登录后就能用你的文案库做视频', go);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { $('#createErr').textContent = d.error || '这条文案打不开了'; return; }
    useCopy(d.sample);
    $('#rmIndustry').focus();
  };
  go();
})();
