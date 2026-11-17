// 微信出片：客户电脑一键安装 / 检查（可以反复运行，装好的会跳过）
//   node scripts/setup.mjs
// 做的事：
//   1. 装网页依赖（npm install，走国内镜像）
//   2. 装配音（Python 的 edge-tts，走国内镜像）
//   3. 下载“用别人的爆款做”要用的听写模型（约 77MB，走国内镜像）
//   4. 没有 .env 就从 .env.example 复制一份（DeepSeek 密钥要手动填）
//   5. 让电脑上的 Claude 记住：说“打开微信出片”就运行本项目的 打开微信出片.bat
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log('  ✓ ' + m);
const warn = (m) => console.log('  ! ' + m);
const step = (m) => console.log('\n' + m);
const problems = [];
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
const quiet = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

console.log('微信出片 · 安装检查\n项目位置：' + ROOT);

// ---------- 1. Node 版本 ----------
step('1/5 检查 Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { problems.push(`Node.js 版本太旧（${process.versions.node}），请装 20 以上：https://nodejs.org/zh-cn`); warn(problems.at(-1)); }
else ok('Node.js ' + process.versions.node);

// ---------- 2. 网页依赖 ----------
step('2/5 网页依赖');
const need = ['@fontsource/noto-sans-sc', '@huggingface/transformers', 'mp4-muxer', 'pdfjs-dist', 'fflate'];
if (need.every((p) => fs.existsSync(path.join(ROOT, 'node_modules', p, 'package.json'))) && !process.argv.includes('--force')) ok('已装好');
else {
  console.log('  正在安装（第一次大约 1–3 分钟）…');
  // Windows 上 npm 是 npm.cmd，要经过 cmd 才能运行
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd install --no-audit --no-fund --registry=https://registry.npmmirror.com' : 'npm install --no-audit --no-fund --registry=https://registry.npmmirror.com', { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status === 0) ok('装好了'); else { problems.push('npm install 失败，看上面的报错；网络不好就再运行一次'); warn(problems.at(-1)); }
}

// ---------- 3. 配音（edge-tts） ----------
step('3/5 配音组件');
const PY = process.env.PYTHON || 'python';
const pyv = quiet(PY, ['--version']);
if (pyv.status !== 0 || !/Python 3/.test(pyv.stdout + pyv.stderr)) {
  problems.push('没找到 Python 3。去 https://www.python.org/downloads/ 装 3.10 以上，安装时勾选 “Add python.exe to PATH”，装完再运行一次');
  warn(problems.at(-1));
} else {
  ok((pyv.stdout || pyv.stderr).trim());
  if (quiet(PY, ['-c', 'import edge_tts']).status === 0) ok('edge-tts 已装好');
  else {
    console.log('  正在安装 edge-tts…');
    const r = run(PY, ['-m', 'pip', 'install', '-q', 'edge-tts', '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple']);
    if (r.status === 0) ok('edge-tts 装好了'); else { problems.push('edge-tts 安装失败，手动运行：python -m pip install edge-tts'); warn(problems.at(-1)); }
  }
}

// ---------- 4. 听写模型（用别人的爆款做：把视频里的话转成文字） ----------
step('4/5 听写模型（约 77MB）');
const MODEL = 'onnx-community/whisper-base';
const FILES = ['added_tokens.json', 'config.json', 'generation_config.json', 'merges.txt', 'normalizer.json', 'preprocessor_config.json',
  'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
const MIRRORS = ['https://hf-mirror.com', 'https://huggingface.co'];
const modelDir = path.join(ROOT, '.cache', 'models', 'web', MODEL);
async function download(file) {
  const out = path.join(modelDir, file);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return 'skip';
  await fsp.mkdir(path.dirname(out), { recursive: true });
  let last;
  for (const m of MIRRORS) {
    try {
      const r = await fetch(`${m}/${MODEL}/resolve/main/${file}`, { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      await fsp.writeFile(out + '.part', buf);
      await fsp.rename(out + '.part', out);
      return `${(buf.length / 1048576).toFixed(1)}MB`;
    } catch (e) { last = e; }
  }
  throw new Error(`${file} 下载失败：${last?.message}`);
}
try {
  let got = 0;
  for (const f of FILES) { const r = await download(f); if (r !== 'skip') { got++; console.log(`  下载 ${f} ${r}`); } }
  ok(got ? '模型下载好了' : '模型已在本地');
} catch (e) { problems.push(e.message + '（网络好了再运行一次就行；不影响“说一句话”出片）'); warn(problems.at(-1)); }

// ---------- 5. 配置：.env 和 Claude 的口令 ----------
step('5/5 配置');
const envFile = path.join(ROOT, '.env');
if (!fs.existsSync(envFile)) { fs.copyFileSync(path.join(ROOT, '.env.example'), envFile); warn('已创建 .env，请在里面填好 DEEPSEEK_API_KEY'); }
const env = fs.readFileSync(envFile, 'utf8');
if (!/^DEEPSEEK_API_KEY=[ 	]*\S+/m.test(env)) { problems.push('.env 里的 DEEPSEEK_API_KEY 还没填（不填就不能 AI 写文案）'); warn(problems.at(-1)); }
else ok('.env 已配置 AI 密钥');

// 让电脑上的 Claude 不管在哪个目录，听到“打开微信出片”都知道怎么做
const claudeDir = path.join(os.homedir(), '.claude');
const claudeMd = path.join(claudeDir, 'CLAUDE.md');
const BEGIN = '<!-- 微信出片:开始 -->', END = '<!-- 微信出片:结束 -->';
const bat = (n) => path.join(ROOT, n);
const block = `${BEGIN}
## 微信出片（本机视频出片工具）
- 用户说“打开微信出片”“帮我打开微信出片儿”之类：运行 \`"${bat('打开微信出片.bat')}"\`（它会在后台启动服务并用浏览器打开 http://localhost:5173 ），然后告诉用户已打开。不要用前台方式运行 node server.js。
- 用户说“更新微信出片”：运行 \`"${bat('更新微信出片.bat')}"\`。
- 用户说“关掉微信出片”：运行 \`node "${path.join(ROOT, 'scripts', 'open.mjs')}" --stop\`。
- 打不开时：看 \`${path.join(ROOT, 'server.log')}\` 的最后几十行找原因；缺东西就运行 \`node "${path.join(ROOT, 'scripts', 'setup.mjs')}"\`。
${END}`;
if (process.argv.includes('--no-claude')) ok('跳过 Claude 口令（--no-claude）');
else try {
  await fsp.mkdir(claudeDir, { recursive: true });
  const old = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  const next = re.test(old) ? old.replace(re, block) : (old.trim() ? old.trimEnd() + '\n\n' : '') + block + '\n';
  if (next !== old) fs.writeFileSync(claudeMd, next, 'utf8');
  ok('已告诉 Claude：说“打开微信出片”就能打开（' + claudeMd + '）');
} catch (e) { warn('没写进 Claude 的设置：' + e.message); }

console.log('\n' + (problems.length ? `还有 ${problems.length} 件事要处理：\n- ${problems.join('\n- ')}` : '全部就绪。双击「打开微信出片.bat」，或对 Claude 说“打开微信出片”。'));
process.exitCode = problems.length ? 1 : 0;
