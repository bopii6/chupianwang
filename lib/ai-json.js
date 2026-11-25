// AI 回来的内容不一定能直接 JSON.parse：
// 可能裹着 ```json 代码块、前后多说一句“好的，这是你要的文案”、字符串里有没转义的换行/引号，
// 或者写着写着就到了长度上限，最后的 } 没写出来（稿子越长越容易发生）。
// 以前碰到这种就直接把“AI 返回的内容不是合法 JSON”甩给客户，让客户自己一下下点重试。
// 现在统一在这里兜住：先把 JSON 抠出来（能救就救），救不了就带着具体原因让 AI 重写一遍，最多 3 轮。
// 写文案（server.js）和拆解文案（lib/copylib.js）都走这里，行为一致。

const CHAT_URL = () => (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
const MODEL = () => process.env.DEEPSEEK_MODEL || 'deepseek-chat';
// 这些状态码多半是对方临时忙，等一下再来一次就有
const RETRY_HTTP = new Set([429, 500, 502, 503, 504]);
// 被截断时可以往上顶一点，但不超过这个数。2026-11 实测 DeepSeek 接受 max_tokens 到 32000；
// 5 分钟的稿子（约 1300 字口播 + 每段的画面 JSON）要 1 万多 token，所以放到 16384
const MAX_OUTPUT = 16384;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const snippet = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, 240);

/** 把 ```json ... ``` 的围栏去掉，并截掉 JSON 前后多说的废话 */
export function pickJsonText(raw) {
  let s = String(raw == null ? '' : raw).replace(/^\uFEFF/, '').trim();
  if (!s) return '';
  const fence = s.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/);
  if (fence) s = fence[1].trim();
  // 前面带“好的，这是 JSON：”，后面带“希望有帮助”：从第一个括号截到最后一个闭括号
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  const close = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (close > 0 && close < s.length - 1) s = s.slice(0, close + 1);
  return s.trim();
}

/**
 * 只在解析失败时才用：把 AI 手写的坏 JSON 尽量修成能解析的。
 * - 字符串里没转义的换行、制表符 → 转义掉
 * - 字符串里没转义的双引号（中文引号被打成英文，最常见）→ 转义掉
 * - } 和 ] 前面多余的逗号 → 去掉
 */
function repairJson(s) {
  let out = '';
  let inStr = false;
  let esc = false;
  // 看这个引号后面跟的是不是 JSON 的结构符号；不是就说明它是内容里的引号
  const nextMeaningful = (i) => {
    let j = i + 1;
    while (j < s.length && /\s/.test(s[j])) j++;
    return j >= s.length ? '' : s[j];
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') {
        const nxt = nextMeaningful(i);
        if (nxt === '' || nxt === ',' || nxt === ':' || nxt === '}' || nxt === ']') { inStr = false; out += ch; }
        else out += '\\"';
        continue;
      }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      if (ch < ' ') { out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'); continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === ',') {
      // 后面只跟空白和 } / ] → 这个逗号是多余的
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '}' || s[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

/** JSON 的括号/引号有没有配平；没配平基本就是写到一半被长度截断了（可能停在里层的 } 上） */
function unbalanced(s) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
  }
  return depth !== 0 || inStr;
}

/**
 * 尽量把 AI 的回复解析成对象。
 * detail 是 JSON.parse 的原始报错，只用来打日志，方便以后看出还缺哪种修法。
 * @returns {{ok: true, value: any, text: string} | {ok: false, reason: 'empty'|'truncated'|'invalid'|'not-object', text: string, detail?: string}}
 */
export function parseLoose(raw) {
  const text = pickJsonText(raw);
  if (!text) return { ok: false, reason: 'empty', text: '' };
  let detail = '';
  try { return { ok: true, value: JSON.parse(text), text }; } catch (e) { detail = e.message; }
  const fixed = repairJson(text);
  if (fixed !== text) {
    try { return { ok: true, value: JSON.parse(fixed), text: fixed }; } catch (e) { detail = e.message; }
  }
  // 括号没配平 = 写到一半被截断了，这时让 AI“写紧凑重写”比说“格式错了”有用
  const truncated = unbalanced(text);
  return { ok: false, reason: truncated ? 'truncated' : 'invalid', text, detail };
}

// 让 AI 重写时说的话：把具体问题说清楚，比“请重试”有效得多
const NOTICE_TRUNCATED = '你上一条回复写到一半就被长度上限截断了，最后的 JSON 没有闭合。请重新输出**完整**的 JSON：内容压紧一些（句子精炼，不要注水、不要重复），务必把最后的 } 写出来，保证整段能被 JSON.parse 解析。';
const NOTICE_INVALID = '你上一条回复不是合法 JSON（可能多了说明文字、用了 ``` 代码块，或者字符串里有没转义的换行和引号）。请只输出一个 JSON 对象：不要代码块、不要任何解释，字符串里的双引号和换行要正确转义。';
const NOTICE_EMPTY = '你上一条回复是空的。请只输出一个 JSON 对象：第一行是 {，最后一行是 }，中间是完整内容，不要任何解释。';
const NOTICE_NOT_OBJECT = '你上一条回复的 JSON 必须是**对象**（以 { 开头、以 } 结尾），里面按要求的字段写，不要只给数组或一句话。';

const notice = (reason) => (reason === 'truncated' ? NOTICE_TRUNCATED : reason === 'empty' ? NOTICE_EMPTY : reason === 'not-object' ? NOTICE_NOT_OBJECT : NOTICE_INVALID);

/**
 * 一轮请求。把“对方的问题”和“我们该不该重试”都标出来，上层只负责翻译成人话。
 * 出错时抛的 Error 带 reason：unauthorized / insufficient / timeout / network / http
 */
async function postChat({ key, messages, temperature, maxTokens, timeoutMs }) {
  let r;
  try {
    r = await fetch(CHAT_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL(),
        messages,
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
    throw Object.assign(new Error(timeout ? 'AI 等太久没回' : '连不上 AI 服务'), {
      status: 502,
      reason: timeout ? 'timeout' : 'network',
      retryable: !timeout,
    });
  }
  if (r.status === 401) throw Object.assign(new Error('DeepSeek 不认这个密钥（可能填错了或被删了）'), { status: 400, reason: 'unauthorized' });
  if (r.status === 402) throw Object.assign(new Error('DeepSeek 账户余额不足，充值后再来'), { status: 400, reason: 'insufficient' });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    throw Object.assign(new Error(`DeepSeek 返回错误 ${r.status}${detail ? '：' + detail : ''}`), {
      status: 502, reason: 'http', httpStatus: r.status, detail, retryable: RETRY_HTTP.has(r.status),
    });
  }
  let j;
  try { j = await r.json(); } catch {
    throw Object.assign(new Error('DeepSeek 返回的不是 JSON'), { status: 502, reason: 'http', retryable: true });
  }
  const choice = j?.choices?.[0] || {};
  return {
    content: String(choice?.message?.content ?? ''),
    finishReason: choice?.finish_reason || '',
    usage: j?.usage || null,
  };
}

/**
 * 要一份合法的 JSON 对象；AI 没写对就带着原因让它重写，最多 attempts 轮。
 * onUsage(usage, round)：每轮的 token 用量（打日志用）。
 * @returns {{data: any, content: string, attempts: number}}
 */
export async function jsonChat({
  key,
  messages,
  temperature = 0.7,
  maxTokens = 8000,
  timeoutMs = Number(process.env.AI_TIMEOUT_MS || 240000),
  attempts = 3,
  requireObject = true,
  label = '',
  onUsage = null,
} = {}) {
  const seed = (Array.isArray(messages) ? messages : []).slice();
  let msgs = seed;
  const tag = label ? ` ${label}` : '';
  let last = { ok: false, reason: 'empty', text: '' };
  for (let i = 1; i <= attempts; i++) {
    let round;
    try {
      round = await postChat({ key, messages: msgs, temperature, maxTokens, timeoutMs });
    } catch (e) {
      // 密钥错、余额不足、超时不值得重试；网络抖动和对方忙（429/5xx）等一下再试
      const canRetry = i < attempts && (e.retryable || e.reason === 'network');
      if (!canRetry) throw e;
      console.warn(`[AI 重试]${tag} 第 ${i}/${attempts} 轮失败：${e.message}`);
      await sleep(1200 * i);
      continue;
    }
    if (onUsage) onUsage(round.usage, i);
    const parsed = parseLoose(round.content);
    const reason = parsed.ok ? (requireObject && !isPlainObject(parsed.value) ? 'not-object' : '') : parsed.reason;
    if (!reason) return { data: parsed.value, content: round.content, attempts: i };

    last = { ok: false, reason, text: parsed.text };
    console.warn(`[AI 格式]${tag} 第 ${i}/${attempts} 轮不是能用的 JSON（${reason}${parsed.detail ? `：${parsed.detail}` : ''}；finish=${round.finishReason || '?'}；${String(round.content || '').length} 字）：${snippet(round.content)}`);
    if (i === attempts) break;

    // 把上一轮的回复（截一段）也带上，它才知道自己哪里写错了；被截断时不带，免得它接着往下续
    const prev = reason === 'truncated' || reason === 'empty' ? '' : String(round.content || '').slice(0, 3000);
    // 每轮都从原始 messages 重新拼，不把前几轮的错回复堆进去
    msgs = [...seed, ...(prev ? [{ role: 'assistant', content: prev }] : []), { role: 'user', content: notice(reason) }];
    if (reason === 'truncated') maxTokens = Math.min(MAX_OUTPUT, Math.max(maxTokens, Math.round(maxTokens * 1.5)));
    temperature = Math.min(temperature, 0.4);
  }
  throw Object.assign(new Error('AI 返回的内容不是合法 JSON，请重试'), { status: 502, reason: 'json', text: last.text });
}

export const __test = { repairJson, pickJsonText };
