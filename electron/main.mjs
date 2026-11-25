// 出片王桌面软件的主程序（Electron）
// 做的事：只开一个窗口 → 第一次运行把老项目文件夹的数据搬过来 → 在本进程里启动服务 → 打开软件窗口
// 客户数据在 %APPDATA%\出片王（卸载重装不丢）；程序文件、精简版 Python、听写模型随安装包装在一起。
import { app, BrowserWindow, dialog, shell, Menu } from 'electron';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_DIR = app.getAppPath();
const DEV = !app.isPackaged;
const RES = DEV ? path.join(APP_DIR, 'build') : process.resourcesPath;
const DATA_DIR = process.env.CPW_DATA_DIR || app.getPath('userData');
const PREFERRED_PORT = 51730; // 固定端口：草稿、偏好存在浏览器本地，端口一变就读不到了

// 自检用单独的浏览器配置：电脑上正开着出片王也不冲突（“只开一个”是按这个配置目录算的）
if (process.env.CPW_SELFTEST) app.setPath('userData', path.join(process.env.CPW_SELFTEST, 'profile'));
if (!app.requestSingleInstanceLock()) app.quit(); // 已经开着一个：把那个窗口叫到前面，这个退出
let win = null;
const downloads = []; // 本次运行下载（导出）完成的文件，自检用
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------- 日志：服务的输出写到数据目录的 server.log（诊断信息里会带上最后几十行） ----------
function setupLog() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, 'server.log');
  try { if (fs.statSync(file).size > 5 * 2 ** 20) fs.renameSync(file, path.join(DATA_DIR, 'server.old.log')); } catch { /* 还没有日志 */ }
  const out = fs.createWriteStream(file, { flags: 'a' });
  const stamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
  for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      const text = args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      out.write(`[${stamp()}] ${text}\n`);
      if (DEV) orig(...args);
    };
  }
  process.on('uncaughtException', (e) => console.error('[未处理的错误]', e));
  process.on('unhandledRejection', (e) => console.error('[未处理的错误]', e));
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true))).listen(port, '127.0.0.1');
  });
}
async function pickPort() {
  if (await portFree(PREFERRED_PORT)) return PREFERRED_PORT;
  return new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

// ---------- 老客户：把原来项目文件夹里的作品、文案、密钥搬过来（只复制，不删老的） ----------
async function migrate() {
  const { findLegacyDir, migrateLegacy, alreadyMigrated } = await import(pathToFileURL(path.join(APP_DIR, 'lib', 'migrate.js')).href);
  if (alreadyMigrated(DATA_DIR)) return;
  const from = findLegacyDir(process.env.CPW_LEGACY_HINT ? [process.env.CPW_LEGACY_HINT] : undefined); // CPW_LEGACY_HINT 只给测试用
  if (!from) return;
  const splash = new BrowserWindow({ width: 420, height: 180, frame: false, resizable: false, center: true, backgroundColor: '#f6f5f2', show: true });
  const html = (t) => `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="margin:0;font:15px system-ui,'Microsoft YaHei';display:grid;place-items:center;height:100vh;background:#f6f5f2;color:#141310"><div style="text-align:center"><b>出片王</b><p style="color:#57544e">${t}</p></div></body>`)}`;
  await splash.loadURL(html('第一次打开新版，正在把以前的作品和文案搬过来…'));
  let n = 0; let last = 0;
  try {
    await migrateLegacy(from, DATA_DIR, { onFile: () => { n++; if (Date.now() - last > 300) { last = Date.now(); splash.loadURL(html(`正在把以前的作品和文案搬过来…已搬 ${n} 个文件`)).catch(() => {}); } } });
    console.log(`[搬数据] 从 ${from} 复制了 ${n} 个文件到 ${DATA_DIR}`);
  } catch (e) {
    console.error('[搬数据] 失败', e);
    dialog.showMessageBoxSync({ type: 'warning', title: '出片王', message: '以前的作品没能全部搬过来', detail: `老文件都还在原来的位置：\n${from}\n\n可以先照常使用，再联系我们处理（微信：bopii2024）。` });
  } finally { splash.destroy(); }
}

async function startServer() {
  const port = await pickPort();
  Object.assign(process.env, {
    CPW_DATA_DIR: DATA_DIR,
    CPW_MODELS_DIR: path.join(DEV ? path.join(APP_DIR, '.cache', 'models', 'web') : path.join(RES, 'models')),
    PYTHON: fs.existsSync(path.join(RES, 'python', 'python.exe')) ? path.join(RES, 'python', 'python.exe') : (process.env.PYTHON || 'python'),
    HOST: '127.0.0.1',
    PORT: String(port),
    NODE_ENV: 'production',
    CPW_DESKTOP: '1',
  });
  await import(pathToFileURL(path.join(APP_DIR, 'server.js')).href);
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url + 'api/status')).ok) return url; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务 10 秒内没启动起来');
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, title: '出片王', backgroundColor: '#f6f5f2', show: false,
    icon: path.join(APP_DIR, 'electron', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  const origin = new URL(url).origin;
  // 软件里的页面（制作台、文案库、作品墙）在窗口里打开；外面的网址（DeepSeek、Pexels 等）用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith(origin)) return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#f6f5f2', autoHideMenuBar: true } };
    if (/^https?:/.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(origin)) { e.preventDefault(); if (/^https?:/.test(u)) shell.openExternal(u); } });
  win.webContents.on('render-process-gone', (_e, d) => console.error('[页面崩溃]', d.reason, d.exitCode));
  // 出问题时给我们看：Ctrl+Shift+I 打开开发者工具
  win.webContents.on('before-input-event', (_e, input) => { if (input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools(); });
  // 导出的视频直接存进“下载”文件夹（和 Chrome 一样），不弹“另存为”；重名自动加 (1)(2)
  win.webContents.session.on('will-download', (_e, item) => {
    const dir = process.env.CPW_DOWNLOAD_DIR || app.getPath('downloads');
    const { name, ext } = path.parse(item.getFilename());
    let file = path.join(dir, name + ext);
    for (let i = 1; fs.existsSync(file); i++) file = path.join(dir, `${name}(${i})${ext}`);
    item.setSavePath(file);
    item.once('done', (_ev, state) => {
      console.log(`[下载] ${state === 'completed' ? '已保存' : '失败(' + state + ')'} ${file}`);
      downloads.push({ file, state, size: state === 'completed' ? fs.statSync(file).size : 0 });
    });
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(url);
  if (process.env.CPW_SELFTEST) selfTest(process.env.CPW_SELFTEST);
}

// 自检（打包后验证用）：CPW_SELFTEST=<输出文件夹>，启动后截图、检查能不能导出视频和配音，写结果后退出
async function selfTest(outDir) {
  const result = { version: app.getVersion(), dataDir: DATA_DIR, python: process.env.PYTHON, models: process.env.CPW_MODELS_DIR };
  try {
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await new Promise((r) => setTimeout(r, 4000));
    result.page = await win.webContents.executeJavaScript(`(async () => ({
      title: document.title,
      exportApi: typeof VideoEncoder !== 'undefined',
      h264: typeof VideoEncoder !== 'undefined' && (await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 2500000, framerate: 30 })).supported,
      aac: typeof AudioEncoder !== 'undefined' && (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })).supported,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      banner: document.querySelector('.sup-bar')?.textContent || '',
      tts: await fetch('/api/tts-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: ['出片王自检配音'] }) }).then((r) => r.json()),
      asrModel: (await fetch('/models/asr/onnx-community/whisper-base/config.json')).ok,
      fontsMissing: await (async () => {
        const missing = [];
        for (const css of ['400', '500', '700', '900'].map((w) => '/vendor/noto-sans-sc/' + w + '.css').concat('/fonts/fusion-pixel-12/font.css')) {
          const text = await (await fetch(css)).text();
          for (const m of text.matchAll(/url\\(([^)]+\\.woff2)\\)/g)) { const u = new URL(m[1], location.origin + css).href; if (!(await fetch(u)).ok) missing.push(u); }
        }
        return missing;
      })(),
      diag: await fetch('/api/diag').then((r) => r.json()).then((d) => ({ tts: d.tts, asrModel: d.asrModel, works: d.works, clientErrors: d.clientErrors })),
    }))()`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'selftest.png'), (await win.webContents.capturePage()).toPNG());
    // CPW_SELFTEST_EXPORT=1：再真的出一条片（用示例，不花 AI 额度）：看示例 → 等配音 → 导出 → 等文件存好
    if (process.env.CPW_SELFTEST_EXPORT) {
      const t0 = Date.now();
      const js = (code) => win.webContents.executeJavaScript(code);
      const waitFor = async (code, ms, what) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) if (await js(code)) return; throw new Error('等太久：' + what); };
      await js("document.querySelector('#btnSample').click()");
      await waitFor("!!document.querySelector('#btnExport') && !document.querySelector('#btnExport').disabled && document.querySelector('#btnExport').offsetParent !== null", 120_000, '示例载入和配音');
      await new Promise((r) => setTimeout(r, 1500));
      await js("document.querySelector('#btnExport').click()");
      for (const end = Date.now() + 600_000; !downloads.length && Date.now() < end;) await new Promise((r) => setTimeout(r, 1000));
      fs.writeFileSync(path.join(outDir, 'export.png'), (await win.webContents.capturePage()).toPNG());
      const works = await js("fetch('/api/works').then((r) => r.json()).then((d) => d.items.length)");
      result.export = { seconds: Math.round((Date.now() - t0) / 1000), download: downloads[0] || null, works };
      if (!downloads[0] || downloads[0].state !== 'completed' || downloads[0].size < 100_000) result.error = '导出没成功：' + JSON.stringify(result.export);
    }
  } catch (e) { result.error = String(e.stack || e); }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'selftest.json'), JSON.stringify(result, null, 2));
  app.quit();
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  setupLog();
  console.log(`[启动] 出片王 ${app.getVersion()}，数据目录 ${DATA_DIR}`);
  try {
    await migrate();
    createWindow(await startServer());
    setupAutoUpdate().catch((e) => console.error('[更新] 初始化失败', e));
  } catch (e) {
    console.error('[启动失败]', e);
    dialog.showErrorBox('出片王打不开', `${e.message}\n\n请把这个文件发给我们：\n${path.join(DATA_DIR, 'server.log')}`);
    app.quit();
  }
});
// ---------- 自动更新：从 GitHub 公开仓库 bopii6/chupianwang-releases 下新版 ----------
// 后台下载，下好了问客户要不要现在重启；选“稍后”就在下次关软件时装上。连不上只记日志，不打扰客户。
async function setupAutoUpdate() {
  if (DEV || process.env.CPW_SELFTEST) return;
  const { autoUpdater } = (await import('electron-updater')).default;
  autoUpdater.logger = { info: (m) => console.log('[更新]', m), warn: (m) => console.warn('[更新]', m), error: (m) => console.error('[更新]', m), debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let asked = false;
  autoUpdater.on('update-downloaded', async (info) => {
    if (asked || !win) return;
    asked = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info', title: '出片王', buttons: ['现在重启更新', '稍后'], defaultId: 0, cancelId: 1,
      message: `新版本 v${info.version} 已经下载好了`,
      detail: '重启一下就是新版本，大约 10 秒。\n正在导出视频的话选「稍后」，关掉软件时会自动更新。',
    });
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => console.warn('[更新] 检查失败', e.message));
  setTimeout(check, 10_000);
  setInterval(check, 4 * 3600_000);
}

// 只有主窗口开过之后，窗口全关了才退出（搬数据的小窗口关掉时不能退）
app.on('window-all-closed', () => { if (win) app.quit(); });
