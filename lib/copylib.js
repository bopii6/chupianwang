// 文案库（内部工具）：拆解爆款文案 → 存成样本 → 以后出片时给 AI 当参考
// 样本是一条条 JSON 文件，放在 文案库/样本/，可以直接打开看、手动改、拷走备份。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { COPY_LIB, CACHE_DIR, USERS_DATA } from './paths.js';
import { jsonChat } from './ai-json.js';

// ---------- 分类（拆解提示词、页面下拉框、检索都用这一份） ----------
export const TAXONOMY = {
  goal: ['获客引流', '知识讲解'],
  category: ['K12学科', '升学规划', '语言外语', '艺术素养', '体育运动', '科技编程', '学历提升', '职业考证', '考公考编', '考研留学', '成人技能', '家庭教育', '机构招商', '其他'],
  audience: ['家长', '学生', '成人学员', '机构老板/同行'],
  hookType: ['痛点戳心', '反常识', '数字清单', '身份点名', '结果前置', '故事悬念', '对比冲突', '福利诱饵', '恐惧警告', '提问互动'],
  structure: ['痛点清单型', '反常识纠偏型', '案例故事型', '错误对比型', '避坑指南型', '自检信号型', '规划时间线型', '干货演示型', '福利领取型', '观点输出型', '招商机会型'],
  role: ['钩子', '共鸣', '干货', '证明', '转折', '引导'],
  ctaType: ['评论区扣字', '领资料', '私信咨询', '点主页/橱窗', '预约试听', '关注追更', '无明显引导'],
  platform: ['抖音', '视频号', '小红书', '快手', 'B站', '其他'],
};
// 现有视频形式（拆解时让 AI 推荐用哪个形式呈现）
export const FORMS = [
  { id: 'footage-mix', name: '实拍混剪', fit: '用客户自己拍的课堂、校区、学员视频和照片' },
  { id: 'series-intro', name: '系列开场', fit: '系列/连载内容第一集、追更理由 + 人设 + 关注' },
  { id: 'pixel-story', name: '像素小剧场', fit: '把道理演成故事、案例、对比' },
  { id: 'data-card', name: '黑金数据卡', fit: '知识点、原因清单、反常识、数据感' },
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB_DIR = COPY_LIB; // 客户自己的样本、回收站
const SAMPLE_DIR = path.join(LIB_DIR, '样本');
const RULE_FILE = path.join(ROOT, '文案库', '违禁词.json'); // 违禁词表随程序发布
const UPLOAD_DIR = path.join(CACHE_DIR, 'uploads');
fs.mkdirSync(SAMPLE_DIR, { recursive: true });

// ---------- 权限 ----------
// 设置了 ADMIN_TOKEN（部署到服务器时必须设）→ 每个请求都要带 x-admin-token；
// 没设 → 只允许本机直接访问（带转发头的请求一律拒绝，防止反向代理后被当成本机）。
export function isAdmin(req) {
  const token = process.env.ADMIN_TOKEN;
  if (token) {
    const got = String(req.headers['x-admin-token'] || '');
    return got.length === token.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token));
  }
  const ip = req.socket.remoteAddress || '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  return local && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'] && !req.headers.forwarded;
}

// ---------- 违禁词 / 限流词 ----------
let ruleCache = { mtime: 0, rules: [] };
function loadRules() {
  try {
    const st = fs.statSync(RULE_FILE);
    if (st.mtimeMs !== ruleCache.mtime) {
      const raw = JSON.parse(fs.readFileSync(RULE_FILE, 'utf8'));
      const rules = [];
      for (const r of raw.rules || []) {
        try { rules.push({ ...r, re: new RegExp(r.pattern, 'gi') }); } catch (e) { console.warn('违禁词规则写错了，已跳过：', r.pattern, e.message); }
      }
      ruleCache = { mtime: st.mtimeMs, rules };
    }
  } catch (e) { console.warn('读不到 文案库/违禁词.json：', e.message); }
  return ruleCache.rules;
}

export function scanRisks(text) {
  const out = [];
  const seen = new Set();
  for (const r of loadRules()) {
    r.re.lastIndex = 0;
    for (const m of String(text).matchAll(r.re)) {
      const word = m[0].trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push({ word, level: r.level, reason: r.reason, fix: r.fix || '', source: '规则' });
    }
  }
  return out;
}

// 规则命中的和 AI 指出的合并：同一个词（或互相包含）只留一条，规则优先（更确定）
function mergeRisks(ruleRisks, aiRisks, text) {
  const out = [...ruleRisks];
  const rank = { 违法: 0, 限流: 1, 提示: 2 };
  for (const r of aiRisks) {
    const word = String(r?.word || '').trim();
    if (!word || !String(text).includes(word.slice(0, 6))) continue; // AI 引用的词原文里没有 → 多半是编的
    if (out.some((x) => x.word.includes(word) || word.includes(x.word))) continue;
    out.push({ word, level: rank[r.level] != null ? r.level : '提示', reason: String(r.reason || ''), fix: String(r.fix || ''), source: 'AI' });
  }
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ---------- 相似度（防止同一条收两次；以后也用来查“改写后是不是太像原文”） ----------
const norm = (t) => String(t || '').replace(/[\s\p{P}\p{S}]/gu, '');
function grams(t) {
  const s = norm(t); const g = new Set();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}
export function similarity(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  // 用“较短一方被覆盖了多少”，这样一条是另一条的片段时也能查出来
  return inter / Math.min(A.size, B.size);
}

// ---------- 存储 ----------
const ID_RE = /^[\w-]{6,40}$/;
const fileOf = (dir, id) => path.join(dir, id + '.json');
// 每个客户一个自己的文案库：data/users/<账号>/文案库/；没登录的管理员（本机或 ADMIN_TOKEN）用仓库里的 文案库/样本/
const USERS_DIR = path.join(USERS_DATA, 'users');
function libOf(user) {
  if (!user) return { dir: SAMPLE_DIR, bin: path.join(LIB_DIR, '回收站') };
  const base = path.join(USERS_DIR, user.id, '文案库');
  return { dir: path.join(base, '样本'), bin: path.join(base, '回收站') };
}
function newId() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomBytes(2).toString('hex')}`;
}
export async function listSamples(dir = SAMPLE_DIR) {
  let names = [];
  try { names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json')); } catch { return []; }
  const items = [];
  for (const n of names) {
    try { items.push(JSON.parse(await fsp.readFile(path.join(dir, n), 'utf8'))); } catch (e) { console.warn('样本文件读不了：', n, e.message); }
  }
  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function findSimilar(dir, text, exceptId) {
  const all = await listSamples(dir);
  return all.filter((s) => s.id !== exceptId)
    .map((s) => ({ id: s.id, title: s.analysis?.title || '', score: Math.round(similarity(text, s.text) * 100) / 100 }))
    .filter((x) => x.score >= 0.35).sort((a, b) => b.score - a.score).slice(0, 3);
}

// ---------- 规范化 AI 输出（AI 偶尔不按列表选，这里兜底） ----------
const pick = (v, list, fallback) => {
  const s = String(v || '').trim();
  if (list.includes(s)) return s;
  const near = list.find((x) => s && (s.includes(x) || x.includes(s)));
  return near || fallback;
};
const str = (v, n = 400) => String(v ?? '').trim().slice(0, n);
const arr = (v, n = 20) => (Array.isArray(v) ? v.slice(0, n) : []);
function normalizeAnalysis(a) {
  const T = TAXONOMY;
  const structure = String(a.structure || '').startsWith('其他') ? str(a.structure, 30) : pick(a.structure, T.structure, '观点输出型');
  return {
    title: str(a.title, 30),
    goal: pick(a.goal, T.goal, '获客引流'),
    category: pick(a.category, T.category, '其他'),
    subject: str(a.subject, 30),
    audience: pick(a.audience, T.audience, '家长'),
    hook: { text: str(a.hook?.text, 200), type: pick(a.hook?.type, T.hookType, '痛点戳心'), why: str(a.hook?.why, 200) },
    structure,
    formula: str(a.formula, 400),
    segments: arr(a.segments, 40).map((s) => ({ role: pick(s?.role, T.role, '干货'), text: str(s?.text, 2000), note: str(s?.note, 200) })).filter((s) => s.text),
    cta: { type: pick(a.cta?.type, T.ctaType, '无明显引导'), text: str(a.cta?.text, 200) },
    slots: arr(a.slots).map((s) => ({ name: str(s?.name, 20), example: str(s?.example, 60) })).filter((s) => s.name),
    highlights: arr(a.highlights, 8).map((x) => str(x, 200)).filter(Boolean),
    transfer: arr(a.transfer, 6).map((t) => ({ track: str(t?.track, 20), opening: str(t?.opening, 120) })).filter((t) => t.track),
    forms: arr(a.forms, 2).map(String).filter((f) => FORMS.some((x) => x.id === f)),
    tags: arr(a.tags, 8).map((x) => str(x, 12)).filter(Boolean),
  };
}

function taxonomyText() {
  const T = TAXONOMY;
  return [
    `- goal（目标）：${T.goal.join(' / ')}`,
    `- category（赛道大类）：${T.category.join(' / ')}`,
    `- audience（受众）：${T.audience.join(' / ')}`,
    `- hook.type（钩子类型）：${T.hookType.join(' / ')}`,
    `- structure（套路骨架）：${T.structure.join(' / ')}`,
    `- segments.role（每段作用）：${T.role.join(' / ')}`,
    `- cta.type（引导方式）：${T.ctaType.join(' / ')}`,
    `- forms（视频形式）：${FORMS.map((f) => `${f.id}=${f.name}（${f.fit}）`).join('；')}`,
  ].join('\n');
}

// 转写后先做一遍只纠错不改写的校对，减少同音字/断句错误
async function proofread(text, key = process.env.DEEPSEEK_API_KEY) {
  if (!key) return text;
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      signal: AbortSignal.timeout(180000), // DeepSeek 偶尔卡住不回
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是严谨的中文校对员。只修正语音转文字产生的错别字、同音字、重复词和明显断句错误；不改写、不增删内容、不总结、不解释。拿不准的地方保留原样。只输出校对后的正文。' },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 8000,
      }),
    });
    if (!r.ok) return text;
    const data = await r.json();
    const fixed = String(data.choices?.[0]?.message?.content || '').trim();
    return fixed && fixed.length > text.length * 0.5 ? fixed : text;
  } catch { return text; }
}

async function analyze(text, note = '', key = process.env.DEEPSEEK_API_KEY, hosted = false) {
  if (!key) throw Object.assign(new Error(hosted ? '还没填你自己的 DeepSeek 密钥。点右上角账号 →「我的设置」，填进去就能拆解了' : '还没填 AI 密钥。点页面右下角的「出片王」版本号，在「AI 写文案」那一行点「去填」'), { code: 400 });
  const system = (await fsp.readFile(path.join(ROOT, 'prompts', 'copy-analyze.md'), 'utf8')).replace('{{TAXONOMY}}', taxonomyText());
  let raw;
  try {
    const { data } = await jsonChat({
      key,
      messages: [{ role: 'system', content: system }, { role: 'user', content: `原文：\n${text}${note ? `\n\n收录人的补充说明（从这里提取 stats）：\n${note}` : ''}` }],
      temperature: 0.3,
      maxTokens: 8000,
      label: '拆解文案',
    });
    raw = data;
  } catch (e) {
    if (e.reason === 'json') throw Object.assign(new Error('AI 连着几次没按格式拆完（这条可能太长），再点一次试试'), { code: 502 });
    throw Object.assign(new Error(e.message), { code: e.status || 502 });
  }
  return { analysis: normalizeAnalysis(raw), aiRisks: arr(raw.risks), stats: note && raw.stats && typeof raw.stats === 'object' ? raw.stats : {} };
}

// ---------- 抽骨吸髓：为什么这条视频能带来咨询，换行业怎么套 ----------
async function analyzeCore(text, analysis, key = process.env.DEEPSEEK_API_KEY) {
  if (!key) return null;
  try {
    const system = await fsp.readFile(path.join(ROOT, 'prompts', 'copy-core.md'), 'utf8');
    // 这一步只是锦上添花，失败就算了，不重试、不打扰客户
    const { data: raw } = await jsonChat({
      key,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `原文：\n${text}\n\n初步拆解：\n${JSON.stringify({ title: analysis.title, hook: analysis.hook, structure: analysis.structure, formula: analysis.formula, cta: analysis.cta }, null, 2)}` },
      ],
      temperature: 0.4,
      maxTokens: 4000,
      attempts: 1,
      label: '抽骨吸髓',
    });
    return {
      oneLine: str(raw.oneLine, 300),
      why: str(raw.why, 800),
      hookCore: str(raw.hookCore, 400),
      chain: arr(raw.chain, 6).map((x) => ({ step: str(x?.step, 12), what: str(x?.what, 300) })).filter((x) => x.step),
      skeleton: arr(raw.skeleton, 8).map((x) => ({ part: str(x?.part, 20), fixed: str(x?.fixed, 200), variable: str(x?.variable, 200) })).filter((x) => x.part),
      fill: arr(raw.fill, 8).map((x) => ({ slot: str(x?.slot, 20), example: str(x?.example, 100), advice: str(x?.advice, 100) })).filter((x) => x.slot),
      examples: arr(raw.examples, 4).map((x) => ({ industry: str(x?.industry, 20), opening: str(x?.opening, 200) })).filter((x) => x.industry),
      taboo: arr(raw.taboo, 5).map((x) => str(x, 200)).filter(Boolean),
    };
  } catch (e) {
    console.warn('抽骨吸髓失败：', e.message);
    return null;
  }
}

// 直接调视频号转存服务（不走子进程）
async function fetchSphVideo(raw) {
  const m = String(raw).match(/https?:\/\/weixin\.qq\.com\/sph\/[A-Za-z0-9]+/);
  if (!m) throw new Error('没找到视频号链接（形如 https://weixin.qq.com/sph/xxxx）');
  const link = m[0];
  let api = process.env.SPH_API;
  let code = process.env.SPH_CODE;
  if (!api) {
    try {
      const cfg = JSON.parse(fs.readFileSync('C:\\Users\\wang\\.dsh\\skills\\sph-video\\config.json', 'utf8'));
      api = cfg.api; code = code || cfg.code;
    } catch { /* ignore */ }
  }
  if (!api) throw new Error('转存服务没配置');
  const headers = code ? { 'x-access-code': code } : {};
  const created = await fetch(api + '/api/jobs', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ url: link }),
    signal: AbortSignal.timeout(30000),
  });
  const meta = await created.json().catch(() => ({}));
  if (!created.ok || !meta.id) throw new Error(meta.detail || `提交失败（${created.status}）`);
  const id = meta.id;
  const deadline = Date.now() + 180000;
  let data = {};
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(`${api}/api/jobs/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r) continue;
    data = await r.json().catch(() => ({}));
    if (data.status === 'done') break;
    if (data.status === 'error') throw new Error(data.error || '解析失败');
  }
  if (data.status !== 'done') throw new Error('等了 180 秒还没好，换一条或稍后重试');
  const dl = await fetch(`${api}/media/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(300000) });
  if (!dl.ok) throw new Error(`下载失败（${dl.status}）`);
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length < 10 * 1024) throw new Error('下载到的文件太小');
  return { buf, title: data.title || '', duration: data.duration || '' };
}

// 视频/音频转文字在浏览器里做（public/engine/asr.js），服务端不再转写

// ---------- 存一条样本 ----------
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
const PLATFORM_HOSTS = [[/douyin|iesdouyin/, '抖音'], [/channels\.weixin|weixin\.qq|finder/, '视频号'], [/xiaohongshu|xhslink/, '小红书'], [/kuaishou|gifshow/, '快手'], [/bilibili|b23\.tv/, 'B站']];
async function writeSample(dir, sample) {
  // 写到临时文件再改名，避免写到一半断电留下坏文件
  await fsp.mkdir(dir, { recursive: true });
  const tmp = fileOf(dir, sample.id) + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(sample, null, 2), 'utf8');
  await fsp.rename(tmp, fileOf(dir, sample.id));
  return sample;
}

// 一步完成：拆解 + 入库。note 是收录人随手写的补充（链接、数据、评论区情况、为什么觉得好），数据由 AI 从里面提取
async function addSample(dir, text, note, key, hosted) {
  const raw = text;
  const fixed = await proofread(text, key);
  const { analysis, aiRisks, stats } = await analyze(fixed, note, key, hosted);
  const core = await analyzeCore(fixed, analysis, key);
  if (core) analysis.core = core;
  const url = (note.match(/https?:\/\/[^\s，。]+/) || [''])[0];
  const now = new Date().toISOString();
  return writeSample(dir, {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    text: fixed,
    textRaw: raw,
    source: { platform: (PLATFORM_HOSTS.find(([re]) => re.test(url)) || [])[1] || '', url: str(url, 500), account: str(stats.account, 60), publishedAt: '' },
    stats: { likes: num(stats.likes), comments: num(stats.comments), collects: num(stats.collects), shares: num(stats.shares), leads: str(stats.leads, 500) },
    rating: 0,
    myNote: str(note, 2000),
    analysis,
    risks: mergeRisks(scanRisks(fixed), aiRisks, fixed),
  });
}

// ---------- 路由：/api/copy/* ----------
// 客户每天最多拆解多少条（拆解要调 AI）。内存计数，重启清零
const DAILY_ADD = Number(process.env.COPY_DAILY_LIMIT || 30);
const addHits = new Map(); // 账号|日期 -> 次数
function overDaily(user) {
  if (!user) return false;
  const k = user.id + '|' + new Date().toISOString().slice(0, 10);
  const n = (addHits.get(k) || 0) + 1;
  if (n > DAILY_ADD) return true;
  addHits.set(k, n);
  return false;
}

// 转存的视频临时文件：放一天就删，不然硬盘越攒越满
async function cleanupUploads() {
  try {
    const cutoff = Date.now() - 864e5;
    for (const n of await fsp.readdir(UPLOAD_DIR)) {
      const f = path.join(UPLOAD_DIR, n);
      try { if ((await fsp.stat(f)).mtimeMs < cutoff) await fsp.unlink(f); } catch { /* 刚删 */ }
    }
  } catch { /* 还没有目录 */ }
}
setTimeout(cleanupUploads, 60e3).unref();
setInterval(cleanupUploads, 6 * 3600e3).unref();

// aiKey：公网版传客户自己的 DeepSeek 密钥（拆解走他自己的额度）；本地版用 .env 里的
export async function handleCopyApi(req, res, pathname, { readJson, sendJson, user, aiKey = process.env.DEEPSEEK_API_KEY, hosted = false }) {
  const admin = isAdmin(req);
  if (!user && !admin) return sendJson(res, 401, { error: '先登录一下，文案库是你自己的，别人看不到', code: 'login' });
  const { dir, bin } = libOf(user);
  try {
    if (req.method === 'GET' && pathname === '/api/copy/meta') {
      return sendJson(res, 200, { taxonomy: TAXONOMY, forms: FORMS, ai: !!aiKey });
    }
    if (req.method === 'GET' && pathname === '/api/copy/list') return sendJson(res, 200, { items: await listSamples(dir), owner: user ? 'me' : 'admin' });
    if (req.method === 'GET' && pathname === '/api/copy/get') {
      const id = String(new URL(req.url, 'http://x').searchParams.get('id') || '');
      if (!ID_RE.test(id)) return sendJson(res, 400, { error: 'id 不对' });
      try { return sendJson(res, 200, { sample: JSON.parse(await fsp.readFile(fileOf(dir, id), 'utf8')) }); } catch { return sendJson(res, 404, { error: '文案库里没有这条了' }); }
    }
    if (req.method === 'GET' && pathname === '/api/copy/video') {
      const u = new URL(req.url, 'http://x');
      const id = String(u.searchParams.get('id') || '');
      if (!/^[0-9a-f]{16}$/.test(id)) return sendJson(res, 400, { error: 'id 不对' });
      const file = path.join(UPLOAD_DIR, id + '.mp4');
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: '视频已过期，请重新转一次' });
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store' });
      const rs = fs.createReadStream(file);
      rs.on('error', () => res.destroy());
      return rs.pipe(res);
    }
    if (req.method === 'POST' && pathname === '/api/copy/link') {
      const { url } = await readJson(req);
      const u = String(url || '').trim();
      if (/douyin|iesdouyin/i.test(u)) return sendJson(res, 400, { error: '抖音暂不支持托管转存，请先下载再把视频拖进来' });
      const got = await fetchSphVideo(u);
      const id = crypto.randomBytes(8).toString('hex');
      await fsp.mkdir(UPLOAD_DIR, { recursive: true });
      await fsp.writeFile(path.join(UPLOAD_DIR, id + '.mp4'), got.buf);
      return sendJson(res, 200, { videoUrl: '/api/copy/video?id=' + id, title: got.title, duration: got.duration });
    }
    if (req.method === 'POST' && pathname === '/api/copy/add') {
      const body = await readJson(req);
      const text = String(body.text || '').trim();
      const note = String(body.note || '').trim().slice(0, 2000);
      if (text.replace(/\s/g, '').length < 20) return sendJson(res, 400, { error: '文案太短了，至少要有一两句话' });
      if (text.length > 20000) return sendJson(res, 400, { error: '文案太长（超过 2 万字），一条短视频口播一般不会这么长' });
      if (!body.force) {
        const dup = (await findSimilar(dir, text)).find((x) => x.score >= 0.7);
        if (dup) return sendJson(res, 409, { error: '库里已经有这条了', duplicate: dup });
      }
      if (overDaily(user)) return sendJson(res, 429, { error: `今天已经拆了 ${DAILY_ADD} 条，明天再来` });
      return sendJson(res, 200, { sample: await addSample(dir, text, note, aiKey, hosted) });
    }
    if (req.method === 'POST' && pathname === '/api/copy/reanalyze') {
      const { id } = await readJson(req);
      if (!ID_RE.test(String(id))) return sendJson(res, 400, { error: 'id 不对' });
      const s = JSON.parse(await fsp.readFile(fileOf(dir, id), 'utf8'));
      const src = String(s.textRaw || s.text || '').trim();
      if (overDaily(user)) return sendJson(res, 429, { error: `今天已经拆了 ${DAILY_ADD} 条，明天再来` });
      if (!src) return sendJson(res, 400, { error: '这条没有原文可校对' });
      const fixed = await proofread(src, aiKey);
      const { analysis, aiRisks } = await analyze(fixed, s.myNote || '', aiKey, hosted);
      const core = await analyzeCore(fixed, analysis, aiKey);
      if (core) analysis.core = core;
      s.text = fixed; s.textRaw = src; s.analysis = analysis;
      s.risks = mergeRisks(scanRisks(fixed), aiRisks, fixed);
      s.updatedAt = new Date().toISOString();
      return sendJson(res, 200, { sample: await writeSample(dir, s) });
    }
    if (req.method === 'POST' && pathname === '/api/copy/update') {
      // 页面上只开放改标题、套路公式、补充说明；其余保留 AI 拆解结果
      const { id, title, formula, myNote } = await readJson(req);
      if (!ID_RE.test(String(id))) return sendJson(res, 400, { error: 'id 不对' });
      const s = JSON.parse(await fsp.readFile(fileOf(dir, id), 'utf8'));
      if (title != null) s.analysis.title = str(title, 30);
      if (formula != null) s.analysis.formula = str(formula, 400);
      if (myNote != null) s.myNote = str(myNote, 2000);
      s.updatedAt = new Date().toISOString();
      return sendJson(res, 200, { sample: await writeSample(dir, s) });
    }
    if (req.method === 'POST' && pathname === '/api/copy/delete') {
      const { id } = await readJson(req);
      if (!ID_RE.test(String(id))) return sendJson(res, 400, { error: 'id 不对' });
      // 不真删：挪到 文案库/回收站/，误删能找回
      await fsp.mkdir(bin, { recursive: true });
      await fsp.rename(fileOf(dir, id), path.join(bin, id + '.json'));
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: '没有这个接口' });
  } catch (e) {
    // e.code 可能是 'ENOENT' 这种文件错误码，不是 HTTP 状态码
    const status = Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : e.code === 'ENOENT' ? 404 : 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: status === 404 && e.code === 'ENOENT' ? '文案库里没有这条了' : String(e.message || e) });
  }
}
