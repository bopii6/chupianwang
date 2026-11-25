// 出片王本地 MCP（Streamable HTTP）：把工具列表暴露给任意 Agent。
// 真正渲染在本机 Chrome 里完成，不在云端服务器上出片。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const FORMS = [
  { id: 'series-intro', name: '系列开场', category: '获客引流', outcome: '系列/连载内容第一集：给追更理由 + 人设 + 关注引导，用来涨粉', fits: '知识连载 · 案例合集 · 避坑清单 · 探店/记录 · 涨粉', needsPhotos: true },
  { id: 'sketch-talk', name: '手绘图解', category: '知识讲解', outcome: '把道理画成一个个小场景，讲师在右下角讲', fits: '干货讲解 · 误区盘点 · 方法步骤 · 立专业人设', needsPhotos: true },
  { id: 'footage-mix', name: '实拍混剪', category: '获客引流', outcome: '用客户自己拍的课堂、校区、学员视频和照片出片', fits: '课堂实拍 · 校区展示 · 学员成果 · 招生宣传', needsPhotos: false },
  { id: 'deep-dive', name: '深度解读', category: '知识讲解', outcome: '用一个“为什么”问住家长，讲透背后的门道', fits: '行业解读 · 政策分析 · 教育观点', needsPhotos: false },
  { id: 'pixel-story', name: '像素小剧场', category: '知识讲解', outcome: '把道理演成一个像素小故事，完播率高', fits: '家长认知 · 学习方法 · 成长心得', needsPhotos: false },
  { id: 'data-card', name: '黑金数据卡', category: '知识讲解', outcome: '把知识点讲出研究报告感，立专业人设', fits: '讲知识点 · 讲政策 · 摆数据', needsPhotos: false },
];

const VERSIONS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);
const PORT = Number(process.env.PORT || 5173);
const LOCAL = `http://127.0.0.1:${PORT}`;
const WAIT_MS = 9 * 60 * 1000;

function findForm(v) {
  const raw = String(v || '').trim();
  return FORMS.find((f) => f.id === raw || f.name === raw);
}

function clientIp(req) {
  return String(req.socket?.remoteAddress || '');
}

function isLoopback(req) {
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function authorized(req) {
  const code = String(process.env.MCP_ACCESS_CODE || '').trim();
  if (!code) return isLoopback(req);
  const a = String(req.headers.authorization || '');
  const bearer = /^bearer /i.test(a) ? a.slice(7).trim() : '';
  const key = String(req.headers['x-mcp-key'] || '').trim();
  const eq = (x) => {
    try {
      const xb = Buffer.from(String(x));
      const cb = Buffer.from(code);
      return xb.length === cb.length && crypto.timingSafeEqual(xb, cb);
    } catch {
      return false;
    }
  };
  return eq(bearer) || eq(key);
}

function send(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

const TOOLS = [
  { name: 'list_formats', description: '列出出片王支持的竖屏视频形式（模板）。做视频前先看有哪些风格。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'create_video',
    description: '按主题出片。在已经用「打开出片王」启动的 Windows 电脑上，用 Chrome 生成并导出竖屏 MP4，完成后返回成片路径。必填主题和风格，时长可选（1/2/3 分钟，默认 2 分钟）。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '视频主题或一句话脚本' },
        format: { type: 'string', description: '形式名或 id，先用 list_formats 查看' },
        minutes: { type: 'integer', enum: [1, 2, 3], description: '时长（分钟），默认 2' },
        account: { type: 'string', description: '画面上展示的账号名，不填则显示「我的账号」' },
        inline: { type: 'boolean', description: 'true 时额外返回 base64 视频（仅 < 8MB 的短片；默认 false，日常出片请用返回的本机路径）' },
      },
      required: ['topic', 'format'],
      additionalProperties: false,
    },
  },
  {
    name: 'remix_video',
    description: '按客户发来的对标/参考片子出片。本机先听写参考片，再学它的打法写成客户自己的内容并导出 MP4。video_path 是这台 Windows 电脑上的视频绝对路径。行业 industry 或主题 topic 至少要有一个。风格可不填，不填则按拆解结果选。',
    inputSchema: {
      type: 'object',
      properties: {
        video_path: { type: 'string', description: '本机参考视频的绝对路径，如 C:\\\\Users\\\\...\\\\demo.mp4' },
        industry: { type: 'string', description: '客户是做什么培训的，例如「少儿编程」' },
        topic: { type: 'string', description: '想讲的主题，可与 industry 一起用或代替 industry' },
        format: { type: 'string', description: '形式名或 id，不填则按参考片自动选' },
        minutes: { type: 'integer', enum: [1, 2, 3], description: '时长（分钟），默认 2' },
        account: { type: 'string', description: '画面上展示的账号名' },
        inline: { type: 'boolean', description: 'true 时额外返回 base64 视频（仅 < 8MB 的短片；默认 false）' },
      },
      required: ['video_path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_works',
    description: '列出这台电脑作品墙里已经导出的成片（标题、大小、文件名），方便把以前做好的片子再发出来。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'prepare_video',
    description: '兼容旧工具。本机出片服务已启动时行为与 create_video 相同（直接返回成片路径）；服务没起来时只返回一句提示，不给任何本机链接。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '视频主题或一句话脚本' },
        format: { type: 'string', description: '形式名或 id' },
        minutes: { type: 'integer', enum: [1, 2, 3], description: '时长（分钟），默认 2' },
        account: { type: 'string', description: '画面上展示的账号名' },
      },
      required: ['topic', 'format'],
      additionalProperties: false,
    },
  },
];

async function localJson(pathname, opts = {}) {
  const r = await fetch(LOCAL + pathname, { ...opts, signal: AbortSignal.timeout(opts.timeout || 30000) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, data };
}

// 作品墙文件在本地 works/ 目录，返回绝对路径而不是链接（同机 Agent 直接读文件）
const WORKS_DIR = new URL('../works/', import.meta.url);

// 同机 Agent 拿文件用路径最省事：第一行成片绝对路径，第二行标题/时长/大小。
// 不再返回任何 http://127.0.0.1 或局域网链接——那只对这台电脑有效，换台机器/手机打开就是打不开。
function fmtJob(job) {
  if (!job) return '没有任务结果';
  if (job.status === 'done') {
    const mb = job.size ? `${(job.size / 1048576).toFixed(1)} MB` : '';
    const lines = [`${job.filePath || '（服务端没返回本机路径）'}`];
    const meta = [
      job.title ? `标题：${job.title}` : '',
      job.minutes ? `时长：${job.minutes} 分钟` : '',
      mb ? `大小：${mb}` : '',
    ].filter(Boolean).join(' · ');
    if (meta) lines.push(meta);
    return lines.join('\n');
  }
  return `出片失败：${job.error || '未知错误'}`;
}

// inline=true 时额外附一个 MCP resource（base64）。体积闸门：超过 8MB 不内联，
// 否则 20MB 视频转 base64 是 27MB 文本，多数客户端会截断或把上下文撑爆。
const INLINE_LIMIT = 8 * 1024 * 1024;

function buildJobResult(job, inline) {
  const content = [{ type: 'text', text: fmtJob(job) }];
  if (!inline) return content;
  if (!job || job.status !== 'done' || !job.filePath) {
    content.push({ type: 'text', text: '（这次没有可内联的成片）' });
    return content;
  }
  let size = 0;
  try { size = fs.statSync(job.filePath).size; } catch {
    content.push({ type: 'text', text: '（读不到成片文件，无法内联，请用上面的路径）' });
    return content;
  }
  if (size > INLINE_LIMIT) {
    const mb = (size / 1048576).toFixed(1);
    const b64mb = ((size * 4) / 3 / 1048576).toFixed(0);
    content.push({
      type: 'text',
      text: `inline 未附：成片 ${mb} MB，超过内联上限 8 MB（转 base64 约 ${b64mb} MB），多数客户端会截断或撑爆上下文。请直接用第一行的本机路径读取文件。`,
    });
    return content;
  }
  const blob = fs.readFileSync(job.filePath).toString('base64');
  content.push({ type: 'resource', resource: { uri: pathToFileURL(job.filePath).href, mimeType: 'video/mp4', blob } });
  return content;
}

function wantInline(args) {
  const v = args?.inline;
  return v === true || v === 'true' || v === 1 || v === '1';
}

async function waitJob(id) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < WAIT_MS) {
    const { data } = await localJson('/api/jobs/' + encodeURIComponent(id), { timeout: 15000 });
    last = data;
    if (data?.status === 'done' || data?.status === 'error') return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last || { status: 'error', error: '等待出片超时（超过 9 分钟）' };
}

async function createVideo(args = {}) {
  const topic = String(args.topic || '').trim();
  if (!topic) throw new Error('请提供 topic（视频主题）');
  const form = findForm(args.format);
  if (!form) throw new Error(`没有「${args.format || ''}」这个形式。可选：${FORMS.map((f) => f.name).join('、')}`);
  const minutes = [1, 2, 3].includes(Number(args.minutes)) ? Number(args.minutes) : 2;
  const account = String(args.account || '').trim();
  const { ok, status, data } = await localJson('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, form: form.id, minutes, account }),
  });
  if (!ok) throw new Error(data.error || `创建任务失败（${status}）`);
  return buildJobResult(await waitJob(data.id), wantInline(args));
}

async function remixVideo(args = {}) {
  const videoPath = String(args.video_path || '').trim();
  if (!videoPath) throw new Error('请提供 video_path（本机参考视频的绝对路径）');
  const industry = String(args.industry || '').trim();
  const topic = String(args.topic || '').trim();
  if (!industry && !topic) throw new Error('请提供 industry（行业）或 topic（主题），至少一个');
  const body = { video_path: videoPath, industry, topic };
  if (args.format) body.form = String(args.format).trim();
  if ([1, 2, 3].includes(Number(args.minutes))) body.minutes = Number(args.minutes);
  if (args.account) body.account = String(args.account).trim();
  const { ok, status, data } = await localJson('/api/jobs/remix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(data.error || `创建任务失败（${status}）`);
  return buildJobResult(await waitJob(data.id), wantInline(args));
}

async function listWorks() {
  const { ok, data } = await localJson('/api/works');
  if (!ok) throw new Error(data.error || '作品墙打不开');
  const items = data.items || [];
  if (!items.length) return '作品墙还是空的，还没有导出过成片。';
  return '已导出的成片（每行第一段是本机绝对路径，可直接读文件）：\n' + items.map((it) => {
    const mb = it.size ? `${(it.size / 1048576).toFixed(1)} MB` : '';
    const full = fileURLToPath(new URL(it.id, WORKS_DIR));
    return `- ${full}${mb ? '　' + mb : ''}${it.title ? '　' + it.title : ''}`;
  }).join('\n');
}

function listFormats() {
  return '出片王可用形式：\n' + FORMS.map((f) => `- ${f.name}（id: ${f.id}，${f.category}${f.needsPhotos ? '，建议上传本人照片' : ''}）：${f.outcome}。适合 ${f.fits}`).join('\n');
}

async function callTool(name, args = {}) {
  if (name === 'list_formats') return listFormats();
  if (name === 'list_works') return await listWorks();
  if (name === 'create_video') return await createVideo(args);
  if (name === 'remix_video') return await remixVideo(args);
  if (name === 'prepare_video') {
    let workerOn = false;
    try {
      const st = await localJson('/api/status');
      workerOn = !!st.data?.jobWorker;
    } catch { /* 服务没起来 */ }
    if (workerOn) return await createVideo(args);
    // 不再给本机链接：出门用手机流量打不开 127.0.0.1，只会误导人
    return '本机出片服务没起来：请先双击「打开出片王.bat」（等浏览器自动打开页面），再重新调用 prepare_video。';
  }
  throw new Error(`未知工具：${name}`);
}

function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
  }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') {
    return ok({
      protocolVersion: VERSIONS.has(params?.protocolVersion) ? params.protocolVersion : '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'chupianwang', title: '出片王', version: '0.2.0' },
      instructions: '这是出片王的本地工具。先用 list_formats 看风格；按主题出片用 create_video（必填 topic、format，可选 minutes、account）；客户给了对标片子用 remix_video（必填 video_path，以及 industry 或 topic）；查看已做好的成片用 list_works。视频在这台 Windows 电脑的 Chrome 里渲染，需要先运行「打开出片王」。',
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    // 长时间出片：返回 Promise，由 handleMcp await
    return (async () => {
      try {
        const out = await callTool(params?.name, params?.arguments);
        return ok({ content: Array.isArray(out) ? out : [{ type: 'text', text: out }] });
      }
      catch (e) { return ok({ content: [{ type: 'text', text: String(e?.message || e) }], isError: true }); }
    })();
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export async function handleMcp(req, res, { readJson }) {
  if (!authorized(req)) {
    return send(res, 401, { error: 'unauthorized', message: '需要本机访问，或请求头 Authorization: Bearer <访问码>' }, { 'WWW-Authenticate': 'Bearer' });
  }
  const sid = String(req.headers['mcp-session-id'] || '') || crypto.randomUUID();
  const h = { 'Mcp-Session-Id': sid };
  if (req.method === 'DELETE') { res.writeHead(204, h); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST, DELETE', ...h }); return res.end(); }
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, h); }
  const list = Array.isArray(body) ? body : [body];
  const out = [];
  for (const msg of list) {
    const result = handle(msg);
    const resolved = result && typeof result.then === 'function' ? await result : result;
    if (resolved) out.push(resolved);
  }
  if (!out.length) { res.writeHead(202, h); return res.end(); }
  return send(res, 200, Array.isArray(body) ? out : out[0], h);
}
