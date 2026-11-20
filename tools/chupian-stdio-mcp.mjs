#!/usr/bin/env node
// 出片王 MCP 的 stdio 包装器：让只支持 stdio 的 Agent（Claude Code / Codex / Cursor …）也能调用本机出片王。
//
// 做法：从 stdin 一行一条读 JSON-RPC，转发到本机 HTTP 端点 POST /mcp，把结果写回 stdout 一行一条。
// 不改 lib/mcp.js 的任何行为，只是搬一层传输。
//
// 用法：
//   node tools/chupian-stdio-mcp.mjs
//
// 环境变量：
//   CHUPIAN_MCP_URL   默认 http://127.0.0.1:5173/mcp
//   MCP_ACCESS_CODE   服务端设了访问码时填它（会以 Authorization: Bearer 带上）
//   CHUPIAN_DEBUG=1   把转发细节打到 stderr（stdout 只留 JSON-RPC，避免污染协议）
//
// 协议细节：
//   - 服务端用 Mcp-Session-Id 响应头下发会话号，后续请求必须原样带回，这里自动记住。
//   - JSON-RPC 通知（没有 id）不产生响应，这里也不会往 stdout 写东西。
//   - 任何传输/HTTP 错误都转成标准 JSON-RPC error 返回，调用方能看到原因。

import { createInterface } from 'node:readline';

const URL_ = process.env.CHUPIAN_MCP_URL || 'http://127.0.0.1:5173/mcp';
const ACCESS_CODE = String(process.env.MCP_ACCESS_CODE || '').trim();
const DEBUG = process.env.CHUPIAN_DEBUG === '1';

let sessionId = '';
let chain = Promise.resolve();

function log(...args) {
  if (DEBUG) process.stderr.write('[chupian-mcp] ' + args.join(' ') + '\n');
}

function writeOut(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

async function forward(msg) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  if (ACCESS_CODE) headers.authorization = `Bearer ${ACCESS_CODE}`;

  const isNotification = msg.id === undefined || msg.id === null;

  let res;
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers,
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(11 * 60 * 1000), // 出片最长等 9 分钟，留点余量
    });
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError'
        ? '请求出片王超时（超过 11 分钟）'
        : `连不上出片王（${URL_}）：${err?.message || err}。请先在本机运行「打开出片王.bat」`;
    log('network error', reason);
    if (!isNotification) writeOut(rpcError(msg.id, -32001, reason));
    return;
  }

  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  log('POST', msg.method || msg.id, '→', res.status, sid ? `session=${sid.slice(0, 8)}…` : '');

  const text = await res.text();

  if (isNotification) {
    // 通知没有响应体；服务端返回非 2xx 时只记日志，不打断调用方
    if (!res.ok) log('notification failed', res.status, text.slice(0, 200));
    return;
  }

  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      if (j?.message) detail = `${j.error || 'error'}：${j.message}`;
      else if (j?.error) detail = String(j.error);
    } catch { /* 保持原文 */ }
    writeOut(rpcError(msg.id, -32002, `出片王返回 HTTP ${res.status}：${detail}`));
    return;
  }

  if (!text.trim()) {
    writeOut(rpcError(msg.id, -32603, '出片王返回了空响应'));
    return;
  }

  // 服务端返回的就是标准 JSON-RPC 响应，原样透传（保住 result / error 结构）
  try {
    JSON.parse(text);
  } catch {
    writeOut(rpcError(msg.id, -32603, `出片王返回的不是合法 JSON：${text.slice(0, 200)}`));
    return;
  }
  process.stdout.write(text.trim() + '\n');
}

function handleLine(line) {
  const raw = line.trim();
  if (!raw) return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (err) {
    writeOut(rpcError(null, -32700, '解析 JSON 失败：' + err.message));
    return;
  }
  if (Array.isArray(msg)) {
    // 批量请求：逐个转发，保持顺序
    for (const one of msg) chain = chain.then(() => forward(one));
    return;
  }
  chain = chain.then(() => forward(msg));
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', handleLine);
rl.on('close', () => {
  chain.finally(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
  writeOut(rpcError(null, -32603, 'stdio 包装器内部错误：' + (err?.message || err)));
});
