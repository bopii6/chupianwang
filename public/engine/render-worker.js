// 渲染子线程：负责“画一帧 → 读像素 → 转成 I420”，多个子线程并行，编码线程按顺序收帧
import { registerFonts } from './worker-fonts.js';
import { rgbaToI420 } from './exporter.js';

let form = null; let frameData = null; let ctx = null; let W = 0; let H = 0; let fps = 24;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      ({ frameData, width: W, height: H, fps } = m);
      await registerFonts(m.fontCss);
      form = await import(m.formUrl);
      await form.preloadFonts(frameData.script);
      ctx = new OffscreenCanvas(W, H).getContext('2d', { alpha: false, willReadFrequently: true });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
    return;
  }
  if (m.type === 'frame') {
    // 按顺序一帧帧处理：有视频素材的模板要先等画面解码好（异步），不能几帧同时画
    queue = queue.then(async () => {
      const buf = m.buf && m.buf.byteLength === W * H * 1.5 ? new Uint8Array(m.buf) : new Uint8Array(W * H * 1.5);
      const data = { ...frameData, t: m.i / fps };
      if (form.prepareFrame) { try { await form.prepareFrame(data); } catch { /* 画不出视频就用封面图 */ } }
      form.drawFrame(ctx, data);
      rgbaToI420(ctx.getImageData(0, 0, W, H).data, W, H, buf);
      self.postMessage({ type: 'frame', i: m.i, buf: buf.buffer }, [buf.buffer]);
    }).catch((err) => self.postMessage({ type: 'error', message: String(err?.message || err) }));
  }
};
let queue = Promise.resolve();
