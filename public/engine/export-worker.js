// 导出总线程：开多个渲染子线程并行画帧，自己按顺序编码 + 封装 MP4
import { encodeMp4 } from './exporter.js';
import { prepareExportFonts } from './worker-fonts.js';
import { setDecodeWait } from './footage.js';

/** 渲染线程池：帧 i 固定交给第 i % k 个子线程，每个子线程按先后顺序处理，结果按帧号取 */
class RenderPool {
  constructor(k, init) {
    this.k = k; this.init = init;
    this.workers = []; this.waiting = new Map(); this.done = new Map(); this.spare = [];
    this.next = 0; this.ahead = k * 3;
    // 任何一个子线程出错（加载失败、半路崩掉）都走这里：正在等的帧一起报错，总线程改用单线程重来
    this.failure = null;
    this.failed = new Promise((_, reject) => { this.fail = (err) => { if (!this.failure) { this.failure = poolError(err); reject(this.failure); } }; });
    this.failed.catch(() => {});
  }
  async start() {
    const ready = [];
    try { this.spawn(ready); } catch (err) { this.fail(err); throw this.failure; } // 线程里没有 Worker、被安全策略拦住，会在这里直接抛错
    try { await Promise.all(ready); } catch (err) { this.fail(err); throw this.failure; }
  }
  spawn(ready) {
    for (let j = 0; j < this.k; j++) {
      const w = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
      ready.push(new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'ready') resolve();
          else if (m.type === 'error') { const err = new Error(m.message); reject(err); this.fail(err); }
          else if (m.type === 'frame') {
            const buf = new Uint8Array(m.buf);
            const res = this.waiting.get(m.i);
            if (res) { this.waiting.delete(m.i); res(buf); } else this.done.set(m.i, buf);
          }
        };
        w.onerror = (e) => { e.preventDefault?.(); const err = new Error(e.message ? `${e.message} (${e.filename}:${e.lineno})` : '渲染线程出错（加载失败）'); reject(err); this.fail(err); };
      }));
      w.postMessage({ type: 'init', ...this.init });
      this.workers.push(w);
    }
  }
  request(i) {
    const buf = this.spare.pop();
    const w = this.workers[i % this.k];
    if (buf) w.postMessage({ type: 'frame', i, buf: buf.buffer }, [buf.buffer]);
    else w.postMessage({ type: 'frame', i });
  }
  /** 取第 i 帧；顺便把后面几帧先派出去 */
  get(i, total) {
    while (this.next < total && this.next <= i + this.ahead) this.request(this.next++);
    if (this.failure) return Promise.reject(this.failure);
    if (this.done.has(i)) { const b = this.done.get(i); this.done.delete(i); return Promise.resolve(b); }
    return Promise.race([new Promise((resolve) => this.waiting.set(i, resolve)), this.failed]);
  }
  /** 编码器已经拷走数据，缓冲区还回来复用 */
  recycle(i, buf) { if (this.spare.length < this.k * 2) this.spare.push(buf); }
  stop() { this.workers.forEach((w) => w.terminate()); }
}

function poolError(err) {
  const e = err instanceof Error ? err : new Error(String(err));
  e.fromPool = true;
  return e;
}

self.onmessage = async (e) => {
  const { formUrl, frameData, width, height, fps, duration, fontCss, audio, threads } = e.data;
  let pool = null;
  try {
    const cores = self.navigator?.hardwareConcurrency || 4;
    // 渲染线程数：按电脑核数自动定，最多 4 个（再多会和编码器抢 CPU）；2 核 / 4 核的电脑和单核服务器就是 1 个。
    // 以前多线程会“抽抽”，根子是每个线程各自下字体、3 秒没下完就先用替代字体画，
    // 现在总线程先把字体下完（浏览器缓存里有了），每个渲染线程也必须等字体全部落地才开画，画出来逐像素一致。
    const cap = Math.max(1, Math.min(4, Math.floor(cores / 2) - 1));
    const k = Math.max(1, Math.min(Number(threads) || cap, cap));
    const form = await import(formUrl);
    await prepareExportFonts(form, frameData.script, fontCss); // 先在这里下一遍字体，渲染线程再取就是走缓存
    const onProgress = (p, left) => self.postMessage({ type: 'progress', p, left });
    let buffer; let used = k; let fallback = null;
    if (k >= 2) {
      try {
        pool = new RenderPool(k, { formUrl, frameData, width, height, fps, fontCss });
        await pool.start();
        buffer = await encodeMp4({ width, height, fps, duration, audio, frameSource: pool, onProgress });
      } catch (err) {
        if (!err?.fromPool) throw err;
        // 有的浏览器 / 安全策略不让“线程里再开线程”，或者某个渲染线程半路崩了：停掉线程池，换单线程从头再导一遍
        pool.stop(); pool = null;
        fallback = String(err.message || err);
        used = 1;
      }
    }
    if (!buffer) {
      setDecodeWait(4000);
      const draw = (ctx, t) => form.drawFrame(ctx, { ...frameData, t });
      const prepare = form.prepareFrame ? (t) => form.prepareFrame({ ...frameData, t }).catch(() => {}) : null;
      buffer = await encodeMp4({ width, height, fps, duration, audio, draw, prepare, onProgress });
    }
    self.postMessage({ type: 'done', buffer, threads: used, fallback, stats: self.__exportStats }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  } finally {
    pool?.stop();
  }
};
