// Excel 资料解析：新版 .xlsx 和老版 .xls 都要读对（日期、百分比、公式结果、多张表、超长的字符串表）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unzipSync } from 'fflate';
import { readXlsxFiles, readXls } from '../public/engine/sheets.js';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const EXPECT = [
  '【表格：春季课程】',
  '课程 | 年龄 | 课时 | 价格 | 开课日期 | 满班率',
  '少儿编程启蒙 | 6-8岁 | 24 | 3880 | 2026-03-01 | 92%',
  '信息学竞赛 | 10-15岁 | 48 | 8800 | 2026-03-15 | 78.5%',
  '合计 | 共3门 | 108',
  '【表格：学员成绩】',
  '小明 | 62 | 91.5',
];

test('xlsx：两张表、日期、百分比、公式都读对', () => {
  const r = readXlsxFiles(unzipSync(fx('sheet.xlsx')));
  for (const s of EXPECT) assert.ok(r.text.includes(s), `缺：${s}\n${r.text}`);
  assert.equal(r.sheets, 2);
});

test('xls：和 xlsx 读出来一样', () => {
  const a = readXls(fx('sheet.xls'));
  const b = readXlsxFiles(unzipSync(fx('sheet.xlsx')));
  assert.equal(a.text, b.text);
});

test('xls：字符串表跨好几个 CONTINUE 记录也不乱，超过 300 行只取前 300 行', () => {
  const r = readXls(fx('big.xls'));
  const lines = r.text.split('\n');
  assert.match(lines[0], /共 1500 行，只取前 300 行/);
  assert.equal(lines.length, 301);
  for (let i = 0; i < 300; i++) assert.equal(lines[i + 1], `学员编号第${i}号同学的长名字abc | 第${i}行备注：上课认真，进步明显`);
});

test('不是 Excel 的文件给一句看得懂的话', () => {
  assert.throws(() => readXls(new Uint8Array(600)), /不是 Excel/);
});
