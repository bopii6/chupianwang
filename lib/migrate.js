// 老客户升级到桌面软件：把原来项目文件夹里的客户数据复制到新的数据目录
// 只复制、不删除，老文件夹原样留着，出了问题还能找回；搬过一次就不再搬。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// 要搬的：客户自己的数据。程序文件（node_modules、代码）和能重新生成的缓存不搬
const ITEMS = ['works', 'data', path.join('文案库', '样本'), path.join('文案库', '回收站'), path.join('.cache', 'tts')];
const MARK = '.migrated-from';

/** 从电脑上 Claude 的口令文件里找老项目文件夹（安装脚本当年把路径写在那里） */
export function findLegacyDir(candidates = [path.join(os.homedir(), '.claude', 'CLAUDE.md')]) {
  for (const md of candidates) {
    let text;
    try { text = fs.readFileSync(md, 'utf8'); } catch { continue; }
    const block = text.match(/<!-- (?:微信出片|出片王):开始 -->([\s\S]*?)<!-- (?:微信出片|出片王):结束 -->/);
    if (!block) continue;
    const m = block[1].match(/"([^"]+?)[\\/]scripts[\\/](?:open|setup|update)\.mjs"/);
    if (m && fs.existsSync(path.join(m[1], 'server.js'))) return m[1];
  }
  return null;
}

export const alreadyMigrated = (toDir) => fs.existsSync(path.join(toDir, MARK));

// 不用 fs.cp：Node 24 在 Windows 上复制带中文的路径（文案库/样本）会直接崩溃。异步复制，几 GB 的作品也不卡界面
async function copyDir(src, dst, onFile) {
  await fsp.mkdir(dst, { recursive: true });
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name); const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d, onFile);
    else if (e.isFile() && !fs.existsSync(d)) { await fsp.copyFile(s, d); onFile?.(e.name); }
  }
}

/** 复制老数据到新数据目录；已经存在的文件不覆盖。返回 { copied, skipped } */
export async function migrateLegacy(fromDir, toDir, { onFile } = {}) {
  if (alreadyMigrated(toDir)) return { copied: 0, skipped: true };
  let copied = 0;
  for (const item of ITEMS) {
    const src = path.join(fromDir, item);
    if (!fs.existsSync(src)) continue;
    await copyDir(src, path.join(toDir, item), onFile);
    copied++;
  }
  const env = path.join(fromDir, '.env');
  if (fs.existsSync(env) && !fs.existsSync(path.join(toDir, '.env'))) { await fsp.copyFile(env, path.join(toDir, '.env')); copied++; }
  await fsp.mkdir(toDir, { recursive: true });
  await fsp.writeFile(path.join(toDir, MARK), `${fromDir}\n${new Date().toISOString()}\n`);
  return { copied, skipped: false };
}
