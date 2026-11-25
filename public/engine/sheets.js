// Excel 表格 → 给 AI 读的文字。新版 .xlsx（压缩包里的 XML）和老版 .xls（二进制 BIFF8）都在这里。
// 不依赖浏览器，Node 里也能跑（test/sheets.test.js）。
// 输出每张表一段：「【表格：工作表名】」下面一行一行，各列用 “ | ” 隔开；空行空列去掉，每张表最多取 MAX_ROWS 行。

const MAX_ROWS = 300;
const MAX_COLS = 30;
const utf8 = new TextDecoder();

// ---------- 数字、日期怎么写成字 ----------
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const BUILTIN_PCT = new Set([9, 10]);
/** 自定义格式像不像日期：去掉引号里的字和 [颜色] 之后，还有 y / d，或者有 m 但不是 [h]:mm 这种时长 */
function fmtKind(code) {
  const c = String(code || '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '').toLowerCase();
  if (/%/.test(c)) return 'pct';
  if (/[yd]|e{1,2}(?![+-])|年|月|日/.test(c)) return 'date';
  if (/h|s/.test(c) && /m/.test(c)) return 'time';
  return '';
}
const pad = (n) => String(n).padStart(2, '0');
function serialToDate(v, withTime) {
  const ms = Math.round((v - 25569) * 86400000); // 1900 日期系统：25569 = 1970-01-01
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(v);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (v < 1) return hm;
  return withTime && hm !== '00:00' ? `${day} ${hm}` : day;
}
function numText(v, kind) {
  if (!Number.isFinite(v)) return '';
  if (kind === 'date') return serialToDate(v, true);
  if (kind === 'time') return serialToDate(v % 1, false);
  if (kind === 'pct') return `${+(v * 100).toPrecision(10)}%`;
  return String(+v.toPrecision(12)); // 0.1+0.2 这种浮点尾巴去掉
}

/** rows: Map<行号, Map<列号, 文字>> → 一张表的文字 */
function sheetText(name, rows) {
  const keys = [...rows.keys()].sort((a, b) => a - b);
  const lines = [];
  for (const r of keys) {
    const cells = rows.get(r);
    const cols = [...cells.keys()].filter((c) => c < MAX_COLS);
    if (!cols.length) continue;
    const max = Math.max(...cols);
    const arr = [];
    for (let c = 0; c <= max; c++) arr.push(String(cells.get(c) ?? '').replace(/\s+/g, ' ').trim());
    while (arr.length && !arr[arr.length - 1]) arr.pop();
    if (!arr.some(Boolean)) continue;
    lines.push(arr.join(' | '));
  }
  if (!lines.length) return null;
  const more = lines.length > MAX_ROWS ? `（共 ${lines.length} 行，只取前 ${MAX_ROWS} 行）` : '';
  return { name, rows: lines.length, text: `【表格：${name}】${more}\n${lines.slice(0, MAX_ROWS).join('\n')}` };
}
function setCell(rows, r, c, v) {
  if (v === '' || v == null) return;
  if (!rows.has(r)) rows.set(r, new Map());
  rows.get(r).set(c, v);
}
const pack = (sheets) => {
  const ok = sheets.filter(Boolean);
  return { text: ok.map((s) => s.text).join('\n\n'), meta: `${ok.length} 张表 · ${ok.reduce((n, s) => n + s.rows, 0)} 行`, sheets: ok.length };
};

// ---------- .xlsx ----------
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? decode(m[1]) : ''; };
/** 一段 XML 里所有 <t>…</t> 拼起来（富文本会拆成好几段 <r><t>），跳过拼音 <rPh> */
const tText = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const colNum = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/** files：解压后的 { 路径: Uint8Array }（至少要有 xl/ 下面的文件） */
export function readXlsxFiles(files) {
  const str = (p) => (files[p] ? utf8.decode(files[p]) : '');
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => tText(m[1]));
  // 样式：第几号样式是不是日期 / 百分比
  const styles = str('xl/styles.xml');
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode')]));
  const xfs = ((styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '');
  const styleKind = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], 'numFmtId')) || 0;
    if (BUILTIN_DATE.has(id)) return id >= 18 && id <= 21 ? 'time' : 'date';
    if (BUILTIN_PCT.has(id)) return 'pct';
    return custom.has(id) ? fmtKind(custom.get(id)) : '';
  });
  // 表的顺序和名字在 workbook.xml，对应的文件在 workbook.xml.rels
  const rels = new Map([...str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  let list = [...str('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const t = rels.get(attr(m[0], 'r:id')) || '';
    const p = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
    return { name: attr(m[0], 'name'), path: p, hidden: /hidden/i.test(attr(m[0], 'state')) };
  }).filter((s) => !s.hidden && files[s.path]);
  if (!list.length) list = Object.keys(files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort().map((p, i) => ({ name: `表${i + 1}`, path: p }));
  return pack(list.map((s) => {
    const xml = str(s.path);
    const rows = new Map();
    let autoRow = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = (Number(attr(rm[0], 'r')) || autoRow + 1) - 1; autoRow = r + 1;
      if (r >= MAX_ROWS * 2) break;
      let autoCol = 0;
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cm[0], 'r');
        const c = ref ? colNum(ref) : autoCol; autoCol = c + 1;
        const t = attr(cm[0], 't');
        const body = cm[2] || '';
        const v = decode((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
        let out = '';
        if (t === 's') out = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') out = tText(body);
        else if (t === 'str' || t === 'e') out = v;
        else if (t === 'b') out = v === '1' ? '是' : '否';
        else if (v !== '') out = numText(Number(v), styleKind[Number(attr(cm[0], 's')) || 0]);
        setCell(rows, r, c, out);
      }
    }
    return sheetText(s.name, rows);
  }));
}

// ---------- .xls（Office 97–2003）：先拆 OLE 复合文件拿到 Workbook 流，再读 BIFF8 记录 ----------
function cfbStream(u8, wanted) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (sig.some((b, i) => u8[i] !== b)) throw new Error('不是 Excel 97–2003 格式');
  const ssz = 1 << dv.getUint16(0x1e, true);
  const msz = 1 << dv.getUint16(0x20, true);
  const u32 = (o) => dv.getUint32(o, true);
  const secOff = (s) => (s + 1) * ssz;
  // FAT 扇区的位置：头里 109 个，不够再顺着 DIFAT 链往下找
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const s = u32(0x4c + i * 4); if (s < 0xfffffffa) fatSecs.push(s); }
  let dif = u32(0x44); let guard = 0;
  while (dif < 0xfffffffa && guard++ < 10000) {
    const per = ssz / 4 - 1;
    for (let i = 0; i < per; i++) { const s = u32(secOff(dif) + i * 4); if (s < 0xfffffffa) fatSecs.push(s); }
    dif = u32(secOff(dif) + per * 4);
  }
  const fat = [];
  for (const s of fatSecs) for (let i = 0; i < ssz / 4; i++) { const o = secOff(s) + i * 4; fat.push(o + 4 <= u8.length ? u32(o) : 0xfffffffe); }
  const chain = (start, table) => { const out = []; let s = start; const seen = new Set(); while (s < 0xfffffffa && !seen.has(s) && s < table.length + 1) { seen.add(s); out.push(s); s = table[s]; } return out; };
  const readChain = (start) => { const secs = chain(start, fat); const out = new Uint8Array(secs.length * ssz); secs.forEach((s, i) => out.set(u8.subarray(secOff(s), secOff(s) + ssz), i * ssz)); return out; };
  const dir = readChain(u32(0x30));
  const ddv = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nlen = ddv.getUint16(o + 0x40, true);
    let name = ''; for (let i = 0; i < Math.max(0, nlen - 2); i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
    entries.push({ name, type: dir[o + 0x42], start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
  }
  const root = entries.find((e) => e.type === 5);
  const ent = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!ent) throw new Error('这个 Excel 里没找到表格内容');
  if (ent.size >= u32(0x38) || !root) return readChain(ent.start).subarray(0, ent.size);
  // 小于 4096 字节的流放在“迷你流”里
  const mini = readChain(root.start);
  const mfat = []; const mf = readChain(u32(0x3c)); const mdv = new DataView(mf.buffer);
  for (let i = 0; i + 4 <= mf.length; i += 4) mfat.push(mdv.getUint32(i, true));
  const secs = chain(ent.start, mfat);
  const out = new Uint8Array(secs.length * msz);
  secs.forEach((s, i) => out.set(mini.subarray(s * msz, s * msz + msz), i * msz));
  return out.subarray(0, ent.size);
}

/** 顺着记录读字符串：字符串可能被切到下一个 CONTINUE 记录里，切开处会重新带一个“是不是双字节”的标志 */
class SegReader {
  constructor(segs) { this.segs = segs; this.i = 0; this.p = 0; }
  get cur() { return this.segs[this.i]; }
  fix() { while (this.i < this.segs.length && this.p >= this.cur.length) { this.i++; this.p = 0; } }
  u8() { this.fix(); return this.i < this.segs.length ? this.cur[this.p++] : 0; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n) { while (n > 0 && this.i < this.segs.length) { this.fix(); if (this.i >= this.segs.length) break; const k = Math.min(n, this.cur.length - this.p); this.p += k; n -= k; } }
  chars(cch, high) {
    let s = '';
    while (cch > 0 && this.i < this.segs.length) {
      if (this.p >= this.cur.length) { this.i++; this.p = 0; if (this.i >= this.segs.length) break; high = this.cur[this.p++] & 1; continue; }
      if (high) { s += String.fromCharCode(this.cur[this.p] | ((this.cur[this.p + 1] || 0) << 8)); this.p += 2; }
      else { s += String.fromCharCode(this.cur[this.p]); this.p += 1; }
      cch--;
    }
    return s;
  }
  /** XLUnicodeRichExtendedString（SST 里的字符串） */
  richString() {
    const cch = this.u16(); const f = this.u8();
    const runs = f & 8 ? this.u16() : 0;
    const ext = f & 4 ? this.u32() : 0;
    const s = this.chars(cch, f & 1);
    this.skip(runs * 4 + ext);
    return s;
  }
}
const uniStr = (u8, o, lenBytes = 2) => {
  const cch = lenBytes === 2 ? u8[o] | (u8[o + 1] << 8) : u8[o];
  const f = u8[o + lenBytes]; let s = ''; let p = o + lenBytes + 1;
  if (f & 8) p += 2; if (f & 4) p += 4;
  for (let i = 0; i < cch && p < u8.length; i++) { if (f & 1) { s += String.fromCharCode(u8[p] | (u8[p + 1] << 8)); p += 2; } else s += String.fromCharCode(u8[p++]); }
  return s;
};
function rkValue(dv, o) {
  const rk = dv.getInt32(o, true);
  let v;
  if (rk & 2) v = rk >> 2;
  else { const b = new DataView(new ArrayBuffer(8)); b.setInt32(4, rk & ~3, true); b.setInt32(0, 0, true); v = b.getFloat64(0, true); }
  return rk & 1 ? v / 100 : v;
}

export function readXls(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const wb = cfbStream(u8, ['Workbook', 'Book']);
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  // 先过一遍所有记录
  const recs = [];
  for (let o = 0; o + 4 <= wb.length;) {
    const type = dv.getUint16(o, true); const len = dv.getUint16(o + 2, true);
    recs.push({ type, off: o + 4, len, at: o });
    o += 4 + len;
  }
  const body = (r) => wb.subarray(r.off, r.off + r.len);
  if (recs[0]?.type !== 0x0809 || dv.getUint16(recs[0].off, true) !== 0x0600) throw new Error('这个 Excel 版本太老了，请在 Excel / WPS 里另存为 .xlsx 再上传');
  const sheets = []; let sst = [];
  const xfFmt = []; const fmts = new Map();
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === 0x0085) { const b = body(r); sheets.push({ pos: dv.getUint32(r.off, true), hidden: b[4] !== 0, kind: b[5], name: uniStr(b, 6, 1) }); }
    else if (r.type === 0x041e) { const b = body(r); fmts.set(b[0] | (b[1] << 8), uniStr(b, 2, 2)); }
    else if (r.type === 0x00e0) { const b = body(r); xfFmt.push(b[2] | (b[3] << 8)); }
    else if (r.type === 0x00fc) {
      const segs = [body(r)];
      for (let j = i + 1; j < recs.length && recs[j].type === 0x003c; j++) segs.push(body(recs[j]));
      const rd = new SegReader(segs); rd.u32(); const n = rd.u32();
      for (let k = 0; k < n && rd.i < segs.length; k++) sst.push(rd.richString());
    } else if (r.type === 0x000a) break; // 全局部分读完
  }
  const kindOf = (xf) => {
    const id = xfFmt[xf] ?? 0;
    if (BUILTIN_DATE.has(id)) return id >= 18 && id <= 21 ? 'time' : 'date';
    if (BUILTIN_PCT.has(id)) return 'pct';
    return fmts.has(id) ? fmtKind(fmts.get(id)) : '';
  };
  const out = [];
  for (const sh of sheets) {
    if (sh.hidden || sh.kind !== 0) continue;
    let k = recs.findIndex((r) => r.at === sh.pos);
    if (k < 0) continue;
    const rows = new Map();
    let pendingFormula = null;
    for (k++; k < recs.length && recs[k].type !== 0x000a; k++) {
      const r = recs[k]; const o = r.off; const b = body(r);
      const row = () => dv.getUint16(o, true); const col = () => dv.getUint16(o + 2, true); const xf = () => dv.getUint16(o + 4, true);
      if (r.type === 0x00fd) setCell(rows, row(), col(), sst[dv.getUint32(o + 6, true)] ?? '');
      else if (r.type === 0x0203) setCell(rows, row(), col(), numText(dv.getFloat64(o + 6, true), kindOf(xf())));
      else if (r.type === 0x027e) setCell(rows, row(), col(), numText(rkValue(dv, o + 6), kindOf(xf())));
      else if (r.type === 0x00bd) {
        const last = dv.getUint16(o + r.len - 2, true);
        for (let c = col(), p = o + 4; c <= last && p + 6 <= o + r.len - 2; c++, p += 6) setCell(rows, row(), c, numText(rkValue(dv, p + 2), kindOf(dv.getUint16(p, true))));
      } else if (r.type === 0x0204 || r.type === 0x00d6) setCell(rows, row(), col(), uniStr(b, 6, 2));
      else if (r.type === 0x0205) setCell(rows, row(), col(), b[7] ? '' : (b[6] ? '是' : '否'));
      else if (r.type === 0x0006) {
        if (dv.getUint16(o + 12, true) === 0xffff) {
          const t = b[6];
          if (t === 0) pendingFormula = { r: row(), c: col() };
          else if (t === 1) setCell(rows, row(), col(), b[8] ? '是' : '否');
        } else setCell(rows, row(), col(), numText(dv.getFloat64(o + 6, true), kindOf(xf())));
      } else if (r.type === 0x0207 && pendingFormula) { setCell(rows, pendingFormula.r, pendingFormula.c, uniStr(b, 0, 2)); pendingFormula = null; }
    }
    out.push(sheetText(sh.name, rows));
  }
  return pack(out);
}
