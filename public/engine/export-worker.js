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
  }
  async start() {
    const ready = [];
    for (let j = 0; j < this.k; j++) {
      const w = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
      ready.push(new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'ready') resolve();
          else if (m.type === 'error') reject(new Error(m.message));
          else if (m.type === 'frame') {
            const buf = new Uint8Array(m.buf);
            const res = this.waiting.get(m.i);
            if (res) { this.waiting.delete(m.i); res(buf); } else this.done.set(m.i, buf);
          }
        };
        w.onerror = (e) => { e.preventDefault?.(); reject(new Error(e.message ? `${e.message} (${e.filename}:${e.lineno})` : '渲染线程出错（加载失败）')); };
      }));
      w.postMessage({ type: 'init', ...this.init });
      this.workers.push(w);
    }
    await Promise.all(ready);
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
    if (this.done.has(i)) { const b = this.done.get(i); this.done.delete(i); return Promise.resolve(b); }
    return new Promise((resolve) => this.waiting.set(i, resolve));
  }
  /** 编码器已经拷走数据，缓冲区还回来复用 */
  recycle(i, buf) { if (this.spare.length < this.k * 2) this.spare.push(buf); }
  stop() { this.workers.forEach((w) => w.terminate()); }
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
    let frameSource = null; let draw = null; let prepare = null;
    if (k >= 2) {
      pool = new RenderPool(k, { formUrl, frameData, width, height, fps, fontCss });
      await pool.start();
      frameSource = pool;
    } else {
      setDecodeWait(4000);
      draw = (ctx, t) => form.drawFrame(ctx, { ...frameData, t });
      if (form.prepareFrame) prepare = (t) => form.prepareFrame({ ...frameData, t }).catch(() => {});
    }
    const buffer = await encodeMp4({
      width, height, fps, duration, audio, draw, prepare, frameSource,
      onProgress: (p, left) => self.postMessage({ type: 'progress', p, left }),
    });
    self.postMessage({ type: 'done', buffer, threads: k, stats: self.__exportStats }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  } finally {
    pool?.stop();
  }
};
