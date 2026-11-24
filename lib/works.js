// 作品墙：把导出的 MP4 存在本地 works/ 目录，并提供列表、上传、删除、带 Range 的播放
// 只依赖 node 内置模块，不引入任何第三方包
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES = 120 * 1024 * 1024; // 单个视频上限 120MB（正常成片 10–30MB；太大先压缩）

// 文件名里的标题：去掉 Windows 不允许的字符，并压掉首尾空白
function safeTitle(raw) {
  return String(raw || '未命名')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '未命名';
}

// 从文件名反解标题：<时间戳>_<标题>.mp4
function titleOf(file) {
  const base = file.replace(/\.mp4$/i, '');
  const i = base.indexOf('_');
  return i >= 0 ? base.slice(i + 1) : base;
}

function isVideo(name) {
  return /\.mp4$/i.test(name);
}

// 防目录穿越：名字里不许带路径分隔符，且解析后必须仍在 works 目录内
function resolveInside(dir, name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..') return null;
  if (!isVideo(base)) return null;
  const full = path.join(dir, base);
  if (path.dirname(full) !== dir) return null;
  return full;
}

async function listWorks(dir, urlBase = '/works/') {
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const items = [];
  for (const name of names) {
    if (!isVideo(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fsp.stat(full);
      if (!st.isFile()) continue;
      items.push({
        id: name,
        title: titleOf(name),
        size: st.size,
        mtime: st.mtimeMs,
        url: urlBase + encodeURIComponent(name),
      });
    } catch { /* 文件刚被删掉，跳过 */ }
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// POST /api/works?title=xxx  body = 视频原始字节
function handleUpload(req, res, dir, searchParams, urlBase = '/works/') {
  const title = safeTitle(decodeURIComponent(searchParams.get('title') || ''));
  const name = `${Date.now()}_${title}.mp4`;
  const file = resolveInside(dir, name);
  if (!file) return sendJson(res, 400, { error: '标题或文件名不合法' });

  const tmp = file + '.part';
  const out = fs.createWriteStream(tmp);
  let bytes = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) {
      aborted = true;
      req.destroy();
      out.destroy();
      fs.promises.unlink(tmp).catch(() => {});
      sendJson(res, 413, { error: '视频超过 500MB，建议先压缩' });
    }
  });
  req.on('aborted', () => { aborted = true; out.destroy(); fs.promises.unlink(tmp).catch(() => {}); });
  req.pipe(out);

  out.on('error', (e) => {
    if (!res.headersSent) sendJson(res, 500, { error: '写入失败：' + e.message });
  });
  out.on('finish', async () => {
    if (aborted) return;
    try {
      if (bytes === 0) {
        await fsp.unlink(tmp).catch(() => {});
        return sendJson(res, 400, { error: '没有收到视频数据' });
      }
      await fsp.rename(tmp, file);
      const st = await fsp.stat(file);
      sendJson(res, 200, { ok: true, item: { id: name, title, size: st.size, mtime: st.mtimeMs, url: urlBase + encodeURIComponent(name) } });
    } catch (e) {
      sendJson(res, 500, { error: '保存失败：' + e.message });
    }
  });
}

async function handleDelete(res, dir, idRaw) {
  const file = resolveInside(dir, decodeURIComponent(idRaw));
  if (!file) return sendJson(res, 400, { error: '文件名不合法' });
  try {
    await fsp.unlink(file);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    if (e.code === 'ENOENT') return sendJson(res, 404, { error: '文件不存在，可能已被删除' });
    sendJson(res, 500, { error: '删除失败：' + e.message });
  }
}

// GET /api/works  →  { items: [...] }
export async function handleWorks(req, res, pathname, dir, searchParams, urlBase = '/works/') {
  if (pathname === '/api/works' && req.method === 'GET') {
    return sendJson(res, 200, { items: await listWorks(dir, urlBase) });
  }
  if (pathname === '/api/works' && req.method === 'POST') {
    return handleUpload(req, res, dir, searchParams, urlBase);
  }
  const del = pathname.match(/^\/api\/works\/(.+)$/);
  if (del && req.method === 'DELETE') {
    return handleDelete(res, dir, del[1]);
  }
  sendJson(res, 405, { error: '不支持的请求' });
}

// GET /works/<文件名>：支持 Range，视频才能拖动进度条
export async function serveWorkFile(req, res, pathname, dir) {
  const name = decodeURIComponent(pathname.slice('/works/'.length));
  const file = resolveInside(dir, name);
  if (!file) { res.writeHead(400); return res.end('bad name'); }

  let st;
  try {
    st = await fsp.stat(file);
  } catch {
    res.writeHead(404); return res.end('not found');
  }

  const total = st.size;
  const range = req.headers.range;
  const head = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };

  if (!range) {
    res.writeHead(200, { ...head, 'Content-Length': total });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
    return res.end();
  }
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null && end !== null) { start = Math.max(0, total - end); end = total - 1; }
  else if (start !== null && end === null) { end = total - 1; }
  if (start === null) { start = 0; end = total - 1; }
  if (start > end || start >= total) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
    return res.end();
  }
  end = Math.min(end, total - 1);
  res.writeHead(206, {
    ...head,
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Content-Length': end - start + 1,
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}
