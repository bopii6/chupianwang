// 客户照片本地保存：IndexedDB，只存在用户自己的浏览器里，不上传
// photos：抠好图的形象照；scenes：现场照片（课堂、校区、学员作品），原样保存
// footage：实拍混剪用的照片和视频（视频是压缩过的画面数据，见 footage.js）
const DB = 'ycp'; const STORES = ['photos', 'scenes', 'footage'];
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 3);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function savePhoto(blob, store = 'photos', extra = {}) {
  const d = await db();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put({ id, blob, at: Date.now(), ...extra }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  return id;
}
export async function listPhotos(store = 'photos') {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const r = d.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result.sort((a, b) => a.at - b.at)); r.onerror = () => rej(r.error); });
  } catch { return []; }
}
export async function deletePhoto(id, store = 'photos') {
  const d = await db();
  await new Promise((res) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = res; tx.onerror = res; });
}
/** 现场照片：缩到长边 1600 存 JPEG，省空间 */
export async function shrinkPhoto(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
}
