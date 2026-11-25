// 卡通讲师（没上传照片时用）：代码画的人物，3 种手势。
// 系列开场、手绘图解等模板共用；以前在 photo-talk.js 里，那个模板下架后挪到这里。
const demoCache = new Map();
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function demoPresenter(pose) {
  if (demoCache.has(pose)) return demoCache.get(pose);
  const c = makeCanvas(640, 1000); const g = c.getContext('2d');
  const skin = '#f5c9a4'; const skinD = '#e3ad86'; const hair = '#24201f'; const suit = '#1f3a5f'; const suitD = '#172c48';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const blob = (fn, fill, stroke = '#1a1a1a', lw = 7) => { g.beginPath(); fn(); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); } };
  // 身体（西装）
  blob(() => { g.moveTo(130, 1000); g.quadraticCurveTo(120, 560, 320, 540); g.quadraticCurveTo(520, 560, 510, 1000); g.closePath(); }, suit);
  blob(() => { g.moveTo(270, 545); g.lineTo(320, 700); g.lineTo(370, 545); g.closePath(); }, '#ffffff', '#1a1a1a', 5);
  blob(() => { g.moveTo(312, 600); g.lineTo(328, 600); g.lineTo(336, 690); g.lineTo(320, 715); g.lineTo(304, 690); g.closePath(); }, '#e5252a', '#1a1a1a', 4);
  blob(() => { g.moveTo(270, 545); g.lineTo(240, 640); g.lineTo(300, 760); g.lineTo(320, 700); g.closePath(); }, suitD, null);
  blob(() => { g.moveTo(370, 545); g.lineTo(400, 640); g.lineTo(340, 760); g.lineTo(320, 700); g.closePath(); }, suitD, null);
  // 脖子 + 头
  blob(() => g.rect(285, 460, 70, 95), skinD, null);
  blob(() => g.ellipse(320, 330, 120, 145, 0, 0, Math.PI * 2), skin);
  blob(() => g.ellipse(200, 345, 22, 34, 0, 0, Math.PI * 2), skin);
  blob(() => g.ellipse(440, 345, 22, 34, 0, 0, Math.PI * 2), skin);
  // 头发
  blob(() => { g.moveTo(198, 320); g.quadraticCurveTo(190, 170, 320, 175); g.quadraticCurveTo(455, 172, 445, 320); g.quadraticCurveTo(430, 250, 360, 245); g.quadraticCurveTo(300, 270, 250, 240); g.quadraticCurveTo(212, 260, 198, 320); g.closePath(); }, hair);
  // 眉眼嘴
  g.fillStyle = '#1a1a1a';
  g.lineWidth = 8; g.strokeStyle = '#1a1a1a';
  g.beginPath(); g.moveTo(250, 300); g.quadraticCurveTo(275, 288, 298, 298); g.stroke();
  g.beginPath(); g.moveTo(342, 298); g.quadraticCurveTo(365, 288, 390, 300); g.stroke();
  g.beginPath(); g.ellipse(275, 340, 11, 14, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(365, 340, 11, 14, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(279, 335, 4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(369, 335, 4, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#3a3a3a';
  for (const cx of [275, 365]) { g.beginPath(); g.roundRect(cx - 38, 312, 76, 58, 16); g.stroke(); }
  g.beginPath(); g.moveTo(313, 338); g.lineTo(327, 338); g.stroke();
  g.fillStyle = '#c8433b'; g.beginPath(); g.moveTo(285, 405); g.quadraticCurveTo(320, 445, 355, 405); g.quadraticCurveTo(320, 420, 285, 405); g.fill();
  g.fillStyle = 'rgba(240,120,110,0.35)'; g.beginPath(); g.ellipse(240, 395, 22, 13, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(400, 395, 22, 13, 0, 0, Math.PI * 2); g.fill();
  // 手臂
  const arm = (pts, fill = suit) => { blob(() => { g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.closePath(); }, fill); };
  const hand = (x, y, r = 38) => blob(() => g.arc(x, y, r, 0, Math.PI * 2), skin);
  if (pose === 0) { // 摊手讲解
    arm([[150, 640], [210, 600], [250, 780], [200, 800]]); hand(205, 800);
    arm([[490, 640], [430, 600], [390, 780], [440, 800]]); hand(435, 800);
  } else if (pose === 1) { // 指向上方
    arm([[150, 640], [210, 600], [250, 820], [200, 840]]); hand(220, 845);
    arm([[455, 600], [505, 560], [560, 330], [515, 315]]);
    blob(() => { g.roundRect(512, 230, 30, 95, 14); }, skin); hand(535, 330, 36);
  } else { // 握拳加油
    arm([[150, 640], [210, 600], [250, 820], [200, 840]]); hand(220, 845);
    arm([[490, 640], [440, 600], [470, 470], [525, 485]]); hand(500, 455, 44);
    g.lineWidth = 5; g.strokeStyle = '#1a1a1a'; for (const dy of [-12, 6]) { g.beginPath(); g.moveTo(470, 455 + dy); g.lineTo(520, 455 + dy); g.stroke(); }
  }
  demoCache.set(pose, c);
  return c;
}
