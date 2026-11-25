// 识图结果清理 + /api/ocr 的出错说法（不真的调 DeepSeek）
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOcrText, ocrBuffer } from '../lib/ocr.js';

test('识图结果：去掉标题记号、加粗、定位标记，表格变成 | 分隔', () => {
  const raw = '## 四、 教学成果\n\n**去年**有12名学员<｜ref｜>入选<｜/ref｜><｜det｜>[[1, 2, 3, 4]]<｜/det｜>\n\n\n\n<table><tr><td>班型</td><td>人数</td></tr></table>';
  const t = cleanOcrText(raw);
  assert.ok(t.startsWith('四、 教学成果'));
  assert.ok(t.includes('去年有12名学员入选'));
  assert.ok(!/[#*<>｜]|\[\[/.test(t.replace(/\|/g, '')), t);
  assert.match(t, /班型\s*\|\s*人数/);
  assert.ok(!/\n{3,}/.test(t));
});

test('没有密钥：给一句看得懂的话，不去请求', async () => {
  await assert.rejects(ocrBuffer(Buffer.from('x'), 'a.png', ''), (e) => e.code === 'no-key' && /密钥/.test(e.message));
});

test('DeepSeek 回 402：说余额不足', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402 });
  try {
    await assert.rejects(ocrBuffer(Buffer.from('x'), 'a.png', 'k'), /余额不足/);
  } finally { globalThis.fetch = orig; }
});

test('DeepSeek 正常返回：按页序排好', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('\n\n' + JSON.stringify({ object: 'ocr.result', page_count: 2, pages: [{ index: 1, text: '第二页' }, { index: 0, text: '## 第一页' }] }), { status: 200 });
  try {
    const r = await ocrBuffer(Buffer.from('x'), 'a.pdf', 'k');
    assert.deepEqual(r.pages, ['第一页', '第二页']);
    assert.equal(r.pageCount, 2);
  } finally { globalThis.fetch = orig; }
});
