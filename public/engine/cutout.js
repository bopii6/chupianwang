// 自动抠图：MediaPipe 人像分割（Apache-2.0），在用户浏览器里运行，照片不上传服务器
import { ImageSegmenter, FilesetResolver } from '/vendor/mediapipe/vision_bundle.mjs';

let segPromise = null;
function getSegmenter() {
  if (!segPromise) {
    segPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      const make = (delegate) => ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/selfie_multiclass_256x256.tflite', delegate },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      try { return await make('GPU'); } catch { return make('CPU'); }
    })();
  }
  return segPromise;
}

/**
 * 把一张照片抠成透明背景的人像，并裁到人像范围
 * @param {Blob} file
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function cutoutPerson(file) {
  const src = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale); const h = Math.round(src.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();

  const seg = await getSegmenter();
  const result = seg.segment(canvas);
  // 多类别模型：第 0 个通道是“背景”的置信度，人像 = 1 - 背景
  const bg = result.confidenceMasks[0];
  const mw = bg.width; const mh = bg.height;
  const mask = bg.getAsFloat32Array();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let minX = w; let minY = h; let maxX = 0; let maxY = 0;
  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, Math.floor((y * mh) / h));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(mw - 1, Math.floor((x * mw) / w));
      const person = 1 - mask[my * mw + mx];
      // 平滑过渡，边缘羽化
      const a = Math.max(0, Math.min(1, (person - 0.35) / 0.3));
      const k = (y * w + x) * 4;
      d[k + 3] = Math.round(a * a * (3 - 2 * a) * 255);
      if (a > 0.5) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  result.close?.();
  if (maxX <= minX || maxY <= minY) throw new Error('没有在照片里找到人像，换一张清楚的半身照试试');
  ctx.putImageData(img, 0, 0);
  const pad = Math.round(Math.max(w, h) * 0.02);
  const cx = Math.max(0, minX - pad); const cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad) - cx; const ch = Math.min(h, maxY + pad) - cy;
  const out = new OffscreenCanvas(cw, ch);
  out.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
  const blob = await out.convertToBlob({ type: 'image/png' });
  return { blob, width: cw, height: ch };
}

