// 形式 02：像素小剧场（v2 精修版）
// 灵魂：把道理“演”成一个比喻小故事。像素小人在场景里撞墙、掉坑、拿到一本书，观众看着就懂了。
// 全部美术由代码绘制（原创）。三层画面：场景层（×6）→ 角色/特效层（×9，人物更醒目）→ 前景层（×6）。
import { W, H, clamp, easeOut, hash, splitSubtitle } from '../engine/draw.js';

export const meta = {
  id: 'pixel-story',
  name: '像素小剧场',
  category: '知识讲解',
  outcome: '把道理演成一个小故事，完播率高、容易被转发',
  ideas: ['为什么要早做学业规划', '错题本到底该怎么用', '学习方法比努力更重要', '别让孩子一个人撞墙'],
  tagline: '把道理演成一个像素小故事，看着就懂',
  fits: '家长认知 · 学习方法 · 人生道理 · 成长心得',
  durations: [1, 2, 3],
  bgm: 'chip', // 默认背景音乐
};

const PIXEL_FAMILY = 'Fusion Pixel 12px Proportional Simplified Chinese';
const PIXEL_FONT = `"${PIXEL_FAMILY}", "Noto Sans SC", sans-serif`;

// ---------- 皮肤 ----------
const BASE = {
  outline: '#2a2522', skin: '#f7cfa4', skinShade: '#e7ac80', blush: '#f19c8f', white: '#ffffff', eyeHi: '#ffffff',
  board: '#fbf3e1', boardShade: '#eadfc4', wood: '#a7774b', woodDark: '#7c5535', woodLight: '#c79868',
  red: '#d9534f', redDark: '#a83b38', green: '#5fa05a', greenDark: '#3f7a3e', gold: '#f0bd3f', goldDark: '#b9852b', goldLight: '#fde28a',
  blue: '#4a7fb5', purple: '#8b6bb1', gray: '#9a948a', hole: '#3d332c', hole2: '#5a4b3f', chalk: '#3e5a4c', chalkDark: '#30483c',
  tear: '#6fb3e0', dust: '#e9e1d2', lantern: '#e05a3c',
};
export const skins = {
  warm: { ...BASE, name: '暖阳', paper: '#efe7d6', ink: '#2a2522', ink2: '#8b8275', accent: '#e8743b', dialog: '#fffaf0',
    sky1: '#f6efe0', sky2: '#e9efe2', cloud: '#ffffff', cloudShade: '#e3e6df', sun: '#ffd98a',
    mount: '#cbd8c3', mountHi: '#dde6d6', mount2: '#b2c6a9', tree: '#5b8f62', treeHi: '#77aa72', treeDark: '#3f6c4a', trunk: '#7a5a3c',
    grass: '#8fbf74', grassDark: '#6f9f5a', path: '#e6d6b5', pathDark: '#d4c09a',
    wall: '#f4ecdc', wallStripe: '#efe5d2', wainscot: '#d9c3a0', wainscotDark: '#c4aa82', floor: '#d8bd93', floorHi: '#e3cba4', floorLine: '#b99c72',
    glass: '#cfe2e3', glassHi: '#eef7f6', frame: '#6e5b48', curtain: '#e8a46b', curtainDark: '#cf8a52', beam: 'rgba(255,248,220,0.35)',
    water: '#8fb7bd', water2: '#a9cacd', waterHi: '#d9ecea', roof: '#4c8073', roofHi: '#5f978a', roofDark: '#3a6559', house: '#f3e8d4', houseShade: '#e2d3b8',
    flower1: '#f28b8b', flower2: '#f6d365', flower3: '#ffffff' },
  night: { ...BASE, name: '夜读', paper: '#1c2130', ink: '#f1eadb', ink2: '#9097ab', accent: '#f2b84b', dialog: '#262c3f',
    sky1: '#1f2740', sky2: '#2c3656', cloud: '#3b4567', cloudShade: '#323b59', sun: '#f6e7b5',
    mount: '#334063', mountHi: '#3e4b70', mount2: '#2a3552', tree: '#2f5a4b', treeHi: '#3b6f5c', treeDark: '#234538', trunk: '#4e3a2c',
    grass: '#3d6650', grassDark: '#2f5240', path: '#55546a', pathDark: '#48475b',
    wall: '#3a4058', wallStripe: '#363c53', wainscot: '#4a4560', wainscotDark: '#403b54', floor: '#4d4659', floorHi: '#585066', floorLine: '#3c3647',
    glass: '#f5d57a', glassHi: '#fbe7a8', frame: '#28283a', curtain: '#7d5a8c', curtainDark: '#664877', beam: 'rgba(250,220,140,0.18)',
    water: '#2c4560', water2: '#3a5878', waterHi: '#6f8fb3', roof: '#2f5a52', roofHi: '#3a6d63', roofDark: '#244640', house: '#55566b', houseShade: '#4a4b5f',
    flower1: '#c27a8a', flower2: '#c9b56a', flower3: '#d9d9e6', night: true },
  spring: { ...BASE, name: '春日', paper: '#eef4e8', ink: '#23331f', ink2: '#7b8a72', accent: '#e05f7d', dialog: '#ffffff',
    sky1: '#eef6f8', sky2: '#e3f1e1', cloud: '#ffffff', cloudShade: '#e2ecea', sun: '#ffe08a',
    mount: '#cfe6c4', mountHi: '#e2f1da', mount2: '#b4d8a6', tree: '#6aa85d', treeHi: '#8cc77a', treeDark: '#4d8645', trunk: '#7a5a3c',
    grass: '#9bd27f', grassDark: '#78b764', path: '#ece2c2', pathDark: '#dccfa6',
    wall: '#f8f2e4', wallStripe: '#f3ebd9', wainscot: '#e3cfa8', wainscotDark: '#cfb88d', floor: '#e2c99e', floorHi: '#ecd7b0', floorLine: '#c9ad80',
    glass: '#d4ece8', glassHi: '#f1faf8', frame: '#6e5b48', curtain: '#f2a0b5', curtainDark: '#de859c', beam: 'rgba(255,255,230,0.4)',
    water: '#8ccbcf', water2: '#a8dbdc', waterHi: '#e1f5f3', roof: '#d0606f', roofHi: '#e07b88', roofDark: '#a84a58', house: '#fbf0dc', houseShade: '#efdfc2',
    flower1: '#f58fae', flower2: '#ffd86b', flower3: '#ffffff' },
};

// ---------- 版式 ----------
const SW = 168; const SH = 112; const PX = 6;                     // 场景层
const CPX = 9; const CW = 112; const CH = 75; const K = PX / CPX;  // 角色层
const SX = 36; const SY = 440;                                    // 舞台左上角（1008×672）
const STW = SW * PX; const STH = SH * PX;
const POS = { farleft: 18, left: 44, center: 84, right: 124, farright: 150 };
const GROUND = { field: 96, room: 100, classroom: 100, exam: 100, home: 100, street: 98, river: 92 };
export const SCENES = Object.keys(GROUND);
const OUTDOOR = new Set(['field', 'street', 'river']);

export const CAST = {
  hero: { style: 'cap', hair: '#3a2f2a', hat: '#4a7fb5', hatHi: '#6b9fd0', hatDark: '#35628f', clothes: '#ee7d3e', clothesDark: '#c9612a', pants: '#3f4f6e', shoes: '#2a2522', pack: true, stripe: '#ffffff' },
  teacher: { style: 'bun', hair: '#a29c94', hairHi: '#c4beb5', hairDark: '#7f7a73', glasses: true, clothes: '#4f8a63', clothesDark: '#3c6c4c', pants: '#4a4a52', shoes: '#2a2522', buttons: true },
  parent: { style: 'pony', hair: '#7a4a2e', hairHi: '#9b6a48', hairDark: '#5a3420', clothes: '#d9534f', clothesDark: '#b03e3b', pants: '#4a5a7a', shoes: '#2a2522', apron: '#fff6e8' },
  genius: { style: 'spiky', hair: '#2f2a2e', hairHi: '#4d4650', hairDark: '#1d191c', glasses: true, phones: '#e0524a', clothes: '#8b6bb1', clothesDark: '#6c5090', pants: '#3a3a44', shoes: '#2a2522', hood: true },
  classmate: { style: 'tails', hair: '#4a3328', hairHi: '#6b4c3e', hairDark: '#33221b', clip: '#f28bb0', clothes: '#f6a6b8', clothesDark: '#e08299', pants: '#f2d6c4', shoes: '#7a3b3b', skirt: true },
  passerby: { style: 'beanie', hair: '#5a4a3a', hairHi: '#7a6a5a', hairDark: '#3e3227', hat: '#8d8a84', hatHi: '#a9a6a0', hatDark: '#6e6b66', clothes: '#8b9bb0', clothesDark: '#6e7d91', pants: '#4a4a52', shoes: '#2a2522' },
};
export const ACTIONS = ['idle', 'jump', 'fall', 'bump', 'happy', 'sad', 'shocked', 'think', 'read', 'talk', 'point', 'leave'];
export const PROPS = ['board', 'wall', 'pit', 'snake', 'coin', 'book', 'box', 'clock', 'phone', 'trophy', 'cart', 'desk', 'flag', 'ladder'];
export const BUBBLES = ['!', '?', 'idea', 'heart', '...', 'angry', 'money', 'star'];
const HOLDS = ['book', 'coin', 'phone', 'trophy', 'board', 'map'];

// ---------- 画布工具 ----------
function makeCanvas(w, h, cpu) {
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.getContext('2d', { willReadFrequently: !!cpu });
  return c;
}
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, x, y, map, colors, k = 1) {
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = colors[row[i]];
      if (col) R(g, x + i * k, y + j * k, k, k, col);
    }
  });
}
function disc(g, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y + r * 0.6)));
    R(g, cx - w, cy + y, w * 2 + 1, 1, col);
  }
}

// =====================================================================
// 场景
// =====================================================================
function skyBands(g, p, h) {
  R(g, 0, 0, SW, h, p.sky1);
  const mid = Math.floor(h * 0.55);
  R(g, 0, mid + 4, SW, h - mid - 4, p.sky2);
  for (let y = mid; y < mid + 4; y++) for (let x = (y % 2); x < SW; x += 2) R(g, x, y, 1, 1, p.sky2);
}
function mountains(g, p, base, amp, col, hi, seed) {
  for (let x = 0; x < SW; x++) {
    const v = Math.abs(((x + seed) % 64) / 32 - 1);
    const v2 = Math.abs(((x + seed * 3) % 38) / 19 - 1);
    const h = Math.round(amp * (1 - v) * 0.75 + amp * 0.45 * (1 - v2));
    R(g, x, base - h, 1, h + 40, col);
    if (hi) R(g, x, base - h, 1, 1, hi);
  }
}
function roundTree(g, p, x, base, s = 1) {
  const rows = [4, 8, 10, 12, 12, 12, 10, 8].map((w) => Math.round(w * s));
  const top = base - Math.round(20 * s);
  const trunkTop = top + rows.length - 1;
  R(g, x - 1, trunkTop, 3, base - trunkTop, p.trunk);
  R(g, x + 1, trunkTop, 1, base - trunkTop, p.treeDark);
  rows.forEach((w, i) => {
    R(g, x - w / 2, top + i, w, 1, p.tree);
    if (i > 4) R(g, x + w / 2 - 3, top + i, 3, 1, p.treeDark);
    if (i > 0 && i < 4) R(g, x - w / 2 + 1, top + i, Math.max(1, Math.round(w / 3)), 1, p.treeHi);
  });
}
function pine(g, p, x, base, s = 1) {
  R(g, x - 1, base - Math.round(8 * s), 2, Math.round(8 * s), p.trunk);
  [6, 10, 14].forEach((w0, i) => {
    const w = Math.round(w0 * s); const hh = Math.round(5 * s);
    const y = base - Math.round(24 * s) + i * Math.round(5 * s);
    for (let r = 0; r < hh; r++) {
      const ww = Math.round(w * (0.5 + 0.5 * (r / hh)));
      R(g, x - ww / 2, y + r, ww, 1, p.tree);
      R(g, x + ww / 2 - 2, y + r, 2, 1, p.treeDark);
    }
    R(g, x - Math.round(w / 4), y + 1, 2, 1, p.treeHi);
  });
}
function grassGround(g, p, top) {
  R(g, 0, top, SW, SH - top, p.grass);
  R(g, 0, top + 6, SW, SH - top, p.path);
  R(g, 0, top + 6, SW, 1, p.pathDark);
  R(g, 0, top + 30, SW, SH - top, p.grass);
  R(g, 0, top + 30, SW, 1, p.grassDark);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i + 3) * SW);
    const y = top + 8 + Math.floor(hash(i + 50) * 20);
    R(g, x, y, 2, 1, p.pathDark);
  }
  const flowers = [p.flower1, p.flower2, p.flower3];
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(hash(i + 90) * SW);
    R(g, x, top - 1, 1, 1, p.grass); R(g, x + 1, top - 2, 1, 2, p.grass);
    if (i % 3 === 0) R(g, Math.floor(hash(i + 140) * SW), top + 1 + Math.floor(hash(i + 170) * 4), 1, 1, flowers[(i / 3) % 3]);
  }
}
function windowAt(g, p, x, y, w, h, curtains = true) {
  R(g, x - 1, y - 1, w + 2, h + 2, p.frame);
  R(g, x, y, w, h, p.glass);
  R(g, x + 1, y + 1, 3, 1, p.glassHi); R(g, x + 1, y + 2, 1, 2, p.glassHi);
  R(g, x + Math.floor(w / 2), y, 1, h, p.frame);
  R(g, x, y + Math.floor(h / 2), w, 1, p.frame);
  R(g, x - 3, y + h + 1, w + 6, 2, p.woodDark);
  if (curtains) {
    for (const cx of [x - 4, x + w]) {
      R(g, cx, y - 3, 4, h + 6, p.curtain);
      R(g, cx + (cx < x ? 3 : 0), y - 3, 1, h + 6, p.curtainDark);
    }
    R(g, x - 6, y - 4, w + 12, 1, p.woodDark);
  }
}
function lightBeam(g, p, x, y, w, floorY) {
  g.fillStyle = p.beam;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + 22, floorY + 6); g.lineTo(x + 18, floorY + 6); g.closePath(); g.fill();
}
function interior(g, p, floorTop) {
  R(g, 0, 0, SW, floorTop, p.wall);
  for (let x = 4; x < SW; x += 8) R(g, x, 0, 3, floorTop, p.wallStripe);
  R(g, 0, 0, SW, 4, p.woodDark); R(g, 0, 4, SW, 1, p.wood);
  const wy = floorTop - 20;
  R(g, 0, wy, SW, 20, p.wainscot);
  R(g, 0, wy, SW, 2, p.woodLight); R(g, 0, wy + 2, SW, 1, p.wainscotDark);
  for (let x = 10; x < SW; x += 20) { R(g, x, wy + 5, 14, 12, p.wainscotDark); R(g, x + 1, wy + 6, 12, 10, p.wainscot); }
  R(g, 0, floorTop, SW, SH - floorTop, p.floor);
  R(g, 0, floorTop, SW, 2, p.woodDark);
  for (let row = 0; row < 4; row++) {
    const y = floorTop + 3 + row * 5;
    R(g, 0, y, SW, 1, p.floorLine);
    R(g, 0, y + 1, SW, 1, p.floorHi);
    for (let x = (row % 2) * 12; x < SW; x += 24) R(g, x, y - 4, 1, 4, p.floorLine);
  }
}
function bookshelf(g, p, x, top, bottom) {
  R(g, x, top, 18, bottom - top, p.woodDark);
  R(g, x + 1, top + 1, 16, bottom - top - 1, p.wood);
  const books = [p.red, p.blue, p.green, p.gold, p.purple];
  for (let s = 0; s < 3; s++) {
    const y = top + 2 + s * 11;
    R(g, x + 2, y, 14, 9, p.woodDark);
    for (let b = 0; b < 6; b++) {
      const hgt = 8 - (b % 3 === 1 ? 1 : 0);
      const bx = x + 2 + b * 2 + (b > 2 ? 1 : 0);
      R(g, bx, y + 9 - hgt, 2, hgt, books[(b + s * 2) % 5]);
      R(g, bx, y + 10 - hgt, 1, 1, p.white);
    }
    R(g, x + 1, y + 9, 16, 1, p.woodLight);
  }
}
function plant(g, p, x, base) {
  R(g, x - 4, base - 6, 8, 6, p.redDark); R(g, x - 4, base - 6, 8, 1, p.red);
  [[-5, -12, 4], [-1, -16, 4], [2, -11, 4], [-3, -9, 3]].forEach(([dx, dy, w]) => { R(g, x + dx, base + dy, w, 3, p.green); R(g, x + dx, base + dy + 2, w, 1, p.greenDark); });
}
function lamp(g, p, x) {
  R(g, x, 5, 1, 10, p.outline);
  R(g, x - 5, 15, 11, 4, p.gold); R(g, x - 5, 18, 11, 1, p.goldDark); R(g, x - 3, 15, 2, 1, p.goldLight);
}
function frameArt(g, p, x, y) {
  R(g, x, y, 16, 12, p.woodDark); R(g, x + 1, y + 1, 14, 10, p.sky2);
  R(g, x + 2, y + 6, 12, 4, p.green); R(g, x + 9, y + 2, 3, 3, p.gold);
}
function house(g, p, x, base, w, awning) {
  const h = 26;
  R(g, x, base - h, w, h, p.house);
  R(g, x + w - 3, base - h, 3, h, p.houseShade);
  R(g, x, base - h, 1, h, p.frame); R(g, x + w - 1, base - h, 1, h, p.frame);
  for (let i = 0; i < 6; i++) R(g, x - 4 + i, base - h - 2 - i * 2, w + 8 - i * 2, 2, i === 0 ? p.roofDark : i === 5 ? p.roofHi : p.roof);
  for (let i = 0; i < w + 6; i += 4) R(g, x - 3 + i, base - h - 1, 1, 1, p.roofDark);
  R(g, x + Math.floor(w / 2) - 4, base - 14, 8, 14, p.frame); R(g, x + Math.floor(w / 2) - 3, base - 13, 6, 13, p.woodDark);
  R(g, x + Math.floor(w / 2) + 1, base - 7, 1, 1, p.gold);
  windowAt(g, p, x + 4, base - 21, 7, 6, false);
  windowAt(g, p, x + w - 11, base - 21, 7, 6, false);
  if (awning) {
    for (let i = 0; i < w + 2; i++) R(g, x - 1 + i, base - 16, 1, 4, Math.floor(i / 3) % 2 ? p.white : awning);
    for (let i = 0; i < w + 2; i += 3) R(g, x - 1 + i, base - 12, 2, 1, Math.floor(i / 3) % 2 ? p.white : awning);
  }
}
function deskShape(g, p, x, base, w = 40) {
  R(g, x - w / 2, base - 13, w, 3, p.wood); R(g, x - w / 2, base - 13, w, 1, p.woodLight); R(g, x - w / 2, base - 10, w, 1, p.woodDark);
  R(g, x - w / 2 + 2, base - 10, 2, 10, p.woodDark); R(g, x + w / 2 - 4, base - 10, 2, 10, p.woodDark);
}

function drawScene(scene, p) {
  const c = makeCanvas(SW, SH);
  const g = c.getContext('2d');
  const gy = GROUND[scene];
  if (!OUTDOOR.has(scene)) {
    const ft = gy - 8;
    interior(g, p, ft);
    if (scene === 'room') {
      windowAt(g, p, 40, 18, 24, 20); windowAt(g, p, 106, 18, 24, 20);
      bookshelf(g, p, 6, 40, ft); bookshelf(g, p, SW - 24, 40, ft);
      lamp(g, p, 84); frameArt(g, p, 76, 30);
      lightBeam(g, p, 40, 38, 24, ft); lightBeam(g, p, 106, 38, 24, ft);
    } else if (scene === 'classroom') {
      R(g, 44, 12, 80, 36, p.wood); R(g, 46, 14, 76, 32, p.chalk); R(g, 46, 44, 76, 2, p.chalkDark);
      R(g, 50, 47, 68, 2, p.woodDark); R(g, 56, 46, 4, 1, p.white); R(g, 100, 46, 3, 1, p.flower2);
      windowAt(g, p, 14, 18, 18, 18); windowAt(g, p, 136, 18, 18, 18);
      plant(g, p, 14, ft); plant(g, p, 154, ft);
      lightBeam(g, p, 14, 36, 18, ft);
    } else if (scene === 'exam') {
      R(g, 52, 10, 64, 18, p.redDark); R(g, 53, 11, 62, 16, p.red);
      windowAt(g, p, 14, 20, 18, 18); windowAt(g, p, 136, 20, 18, 18);
      for (const dx of [32, 84, 136]) { deskShape(g, p, dx, ft - 1, 26); R(g, dx - 6, ft - 16, 9, 3, p.white); R(g, dx - 5, ft - 15, 6, 1, p.gray); }
      lightBeam(g, p, 14, 38, 18, ft);
    } else if (scene === 'home') {
      windowAt(g, p, 72, 16, 26, 22);
      lightBeam(g, p, 72, 38, 26, ft);
      R(g, 8, ft - 16, 40, 8, p.curtainDark); R(g, 8, ft - 16, 40, 2, p.curtain);
      R(g, 6, ft - 10, 44, 8, p.curtain); R(g, 6, ft - 10, 44, 1, p.white);
      R(g, 6, ft - 14, 4, 12, p.curtainDark); R(g, 46, ft - 14, 4, 12, p.curtainDark);
      R(g, 9, ft - 2, 2, 2, p.woodDark); R(g, 45, ft - 2, 2, 2, p.woodDark);
      R(g, 122, ft - 10, 36, 10, p.wood); R(g, 122, ft - 10, 36, 1, p.woodLight); R(g, 139, ft - 8, 1, 7, p.woodDark);
      R(g, 126, ft - 30, 28, 19, p.outline); R(g, 128, ft - 28, 24, 15, p.chalk); R(g, 129, ft - 27, 6, 1, p.glassHi);
      frameArt(g, p, 26, 24); plant(g, p, 112, ft);
      R(g, 56, gy + 1, 60, 6, p.curtainDark); R(g, 58, gy + 2, 56, 4, p.curtain);
    }
  } else {
    skyBands(g, p, 72);
    if (!p.night) { disc(g, 138, 16, 6, p.sun); disc(g, 138, 16, 4, p.goldLight); }
    mountains(g, p, 58, 24, p.mount, p.mountHi, 7);
    mountains(g, p, 66, 14, p.mount2, null, 31);
    if (scene === 'street') {
      house(g, p, 4, gy - 12, 42, p.red);
      house(g, p, 64, gy - 12, 40, null);
      house(g, p, 122, gy - 12, 42, p.gold);
      R(g, 0, gy - 12, SW, SH - gy + 12, p.path);
      R(g, 0, gy - 12, SW, 1, p.pathDark);
      for (let row = 0; row < 6; row++) for (let x = (row % 2) * 5; x < SW; x += 10) R(g, x, gy - 8 + row * 4, 8, 1, p.pathDark);
      R(g, 56, gy - 40, 2, 28, p.outline); R(g, 52, gy - 44, 10, 4, p.outline); R(g, 53, gy - 43, 8, 2, p.goldLight);
    } else if (scene === 'river') {
      roundTree(g, p, 14, 70, 1); pine(g, p, 40, 70, 0.8); roundTree(g, p, 134, 70, 1.1); pine(g, p, 160, 70, 0.8);
      R(g, 0, 68, SW, 6, p.grass); R(g, 0, 68, SW, 1, p.grassDark);
      R(g, 0, 74, SW, SH - 74, p.water);
      R(g, 0, 74, SW, 2, p.water2);
      R(g, 0, gy, SW, 5, p.wood); R(g, 0, gy, SW, 1, p.woodLight); R(g, 0, gy + 4, SW, 1, p.woodDark);
      for (let x = 0; x < SW; x += 6) R(g, x, gy, 1, 5, p.woodDark);
      for (let x = 8; x < SW; x += 32) { R(g, x, gy + 5, 3, 20, p.woodDark); R(g, x, gy - 10, 2, 10, p.woodDark); }
      R(g, 0, gy - 9, SW, 1, p.woodDark);
    } else {
      roundTree(g, p, 12, 72, 1.1); pine(g, p, 36, 72, 0.8); roundTree(g, p, 104, 72, 0.9); pine(g, p, 128, 72, 1.2); roundTree(g, p, 158, 72, 0.8);
      for (let x = 48; x < 94; x += 6) { R(g, x, 64, 2, 8, p.woodLight); R(g, x, 64, 2, 1, p.wood); }
      R(g, 48, 66, 46, 1, p.wood); R(g, 48, 69, 46, 1, p.wood);
      grassGround(g, p, 72);
    }
  }
  return c;
}
const sceneCache = new Map();
function sceneLayer(scene, p) {
  const key = scene + '|' + p.name;
  if (!sceneCache.has(key)) sceneCache.set(key, drawScene(scene, p));
  return sceneCache.get(key);
}
function cloud(g, p, x, y, s) {
  R(g, x, y + 3, Math.round(18 * s), 4, p.cloud); R(g, x + Math.round(3 * s), y, Math.round(8 * s), 4, p.cloud);
  R(g, x + Math.round(9 * s), y + 1, Math.round(6 * s), 3, p.cloud); R(g, x, y + 6, Math.round(18 * s), 1, p.cloudShade);
}
function sceneDynamic(g, scene, p, t) {
  if (OUTDOOR.has(scene)) {
    if (p.night) {
      for (let i = 0; i < 30; i++) if (Math.sin(t * 2 + i * 7) > 0.1) R(g, Math.floor(hash(i) * SW), Math.floor(hash(i + 9) * 40), 1, 1, '#f5e9c8');
      disc(g, 140, 14, 5, p.sun); disc(g, 142, 12, 4, p.sky1);
    }
    [[0, 10, 1], [70, 24, 0.7], [120, 6, 0.8]].forEach(([x0, y, s], i) => {
      const x = ((x0 + t * (1.2 + i * 0.4)) % (SW + 30)) - 24;
      cloud(g, p, Math.round(x), y, s);
    });
  }
  if (scene === 'river') {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor((hash(i) * SW + t * 5 * (i % 2 ? 1 : -1) + SW * 4) % SW);
      R(g, x, 78 + (i % 6) * 5, 5 + (i % 3), 1, i % 2 ? p.waterHi : p.water2);
    }
  }
  if (scene === 'street') {
    for (let i = 0; i < 6; i++) {
      const x = 14 + i * 28; const sway = Math.round(Math.sin(t * 2 + i));
      R(g, x - 14, 30 + (i % 2), 28, 1, p.woodDark);
      R(g, x + sway - 3, 31, 6, 7, p.lantern); R(g, x + sway - 2, 31, 1, 7, p.redDark); R(g, x + sway - 2, 38, 4, 1, p.gold);
    }
  }
  if (scene === 'room') { g.fillStyle = 'rgba(255,230,160,0.12)'; g.fillRect(70, 19, 29, 30 + Math.round(Math.sin(t * 3))); }
}
function foreground(g, scene, p, t) {
  if (scene === 'field') {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(hash(i + 300) * SW); const sway = Math.round(Math.sin(t * 2 + i) * 0.6);
      R(g, x, SH - 4, 1, 4, p.grassDark); R(g, x + 1 + sway, SH - 6, 1, 6, p.grass); R(g, x + 2, SH - 3, 1, 3, p.grassDark);
      if (i % 4 === 0) R(g, x + 1 + sway, SH - 7, 1, 1, p.flower1);
    }
  } else if (scene === 'river') {
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(hash(i + 400) * SW); const sway = Math.round(Math.sin(t * 1.6 + i) * 0.8);
      R(g, x, SH - 10, 1, 10, p.greenDark); R(g, x + sway, SH - 12, 1, 3, p.trunk);
    }
  }
}

// =====================================================================
// 道具
// =====================================================================
function drawProp(g, pr, p, gy, t, texts) {
  const x = Math.round(POS[pr.pos] ?? POS.center);
  switch (pr.type) {
    case 'board': {
      R(g, x - 1, gy - 14, 3, 14, p.woodDark); R(g, x - 1, gy - 14, 1, 14, p.wood);
      R(g, x - 18, gy - 34, 36, 22, p.woodDark); R(g, x - 17, gy - 33, 34, 20, p.board);
      R(g, x - 17, gy - 14, 34, 1, p.boardShade);
      R(g, x - 16, gy - 32, 1, 1, p.gray); R(g, x + 15, gy - 32, 1, 1, p.gray);
      if (pr.text) texts.push({ text: pr.text, x, y: gy - 23, w: 32, sizes: [48, 36, 24], px: PX });
      break;
    }
    case 'wall': {
      R(g, x - 10, gy - 38, 20, 38, p.woodDark);
      for (let r = 0; r < 9; r++) {
        const y = gy - 37 + r * 4;
        for (let c = (r % 2 ? -3 : 0); c < 19; c += 6) {
          const bx = Math.max(x - 9, x - 9 + c); const bw = Math.min(x - 9 + c + 5, x + 9) - bx;
          if (bw <= 0) continue;
          R(g, bx, y, bw, 3, '#c87a52'); R(g, bx, y, bw, 1, '#de9a72');
        }
      }
      break;
    }
    case 'pit': {
      R(g, x - 16, gy - 1, 32, 8, p.outline); R(g, x - 15, gy, 30, 7, p.hole2); R(g, x - 13, gy + 2, 26, 5, p.hole);
      R(g, x - 17, gy - 2, 3, 1, p.pathDark); R(g, x + 14, gy - 2, 3, 1, p.pathDark); R(g, x - 4, gy - 2, 2, 1, p.pathDark);
      break;
    }
    case 'snake': {
      const tongue = Math.sin(t * 8) > 0; const sw = Math.sin(t * 3) > 0;
      sprite(g, x - 16, gy - 14, [
        '...........kkkk.',
        '..........kgggGk',
        '..........kgegGk',
        sw ? '..kkk....kgggGk.' : '.kkk.....kgggGk.',
        sw ? '.kgGGk..kgggGk..' : 'kgGGk...kgggGk..',
        sw ? 'kgGkkGkkgggGk...' : 'kGkkGkkkgggGk...',
        'kgk..kggggGk....',
      ], { g: p.green, G: p.greenDark, k: p.outline, e: p.white }, 2);
      if (tongue) { R(g, x + 16, gy - 9, 3, 1, p.red); R(g, x + 19, gy - 10, 1, 1, p.red); R(g, x + 19, gy - 8, 1, 1, p.red); }
      break;
    }
    case 'coin': {
      for (let i = 0; i < 4; i++) { R(g, x - 6, gy - 3 - i * 3, 12, 3, p.goldDark); R(g, x - 6, gy - 3 - i * 3, 12, 2, p.gold); R(g, x - 4, gy - 3 - i * 3, 3, 1, p.goldLight); }
      if (Math.sin(t * 5) > 0.4) { R(g, x + 7, gy - 17, 1, 3, p.white); R(g, x + 6, gy - 16, 3, 1, p.white); }
      break;
    }
    case 'book': {
      R(g, x - 8, gy - 4, 16, 4, p.blue); R(g, x - 8, gy - 4, 16, 1, '#6b9fd0'); R(g, x - 7, gy - 1, 14, 1, p.white);
      R(g, x - 6, gy - 8, 13, 4, p.red); R(g, x - 6, gy - 8, 13, 1, '#e87c78'); R(g, x - 5, gy - 5, 11, 1, p.white);
      break;
    }
    case 'box': {
      R(g, x - 8, gy - 16, 16, 16, p.woodDark); R(g, x - 7, gy - 15, 14, 14, p.wood);
      R(g, x - 7, gy - 15, 14, 1, p.woodLight); R(g, x - 7, gy - 9, 14, 2, p.woodDark);
      break;
    }
    case 'clock': {
      const cy = 26;
      disc(g, x, cy, 7, p.outline); disc(g, x, cy, 6, p.white);
      R(g, x, cy - 4, 1, 4, p.outline);
      const a = t * 1.4;
      for (let k = 1; k < 5; k++) R(g, x + Math.round(Math.cos(a) * k), cy + Math.round(Math.sin(a) * k), 1, 1, p.red);
      break;
    }
    case 'phone': {
      R(g, x - 6, gy - 22, 12, 22, p.outline); R(g, x - 5, gy - 20, 10, 16, Math.sin(t * 3) > 0 ? p.blue : '#6b9fd0');
      R(g, x - 4, gy - 19, 4, 1, p.white); R(g, x - 4, gy - 17, 6, 1, p.white); R(g, x - 1, gy - 3, 2, 1, p.gray);
      break;
    }
    case 'trophy': {
      sprite(g, x - 8, gy - 16, [
        'kkkkkkkkkkkkkkkk', 'kyhhyyyyyyyyyyyk', 'kyhyyyyyyyyyyyDk', 'kkyyyyyyyyyyyDkk', '.kkyyyyyyyyyDkk.', '..kkyyyyyyyDkk..',
        '...kkyyyyyDkk...', '....kkyyyDkk....', '......kyDk......', '......kyDk......', '.....kyyyDk.....', '....kyyyyyDk....',
        '...kkkkkkkkkk...', '...kwwwwwwwwk...', '...kbbbbbbbbk...', '...kkkkkkkkkk...',
      ], { k: p.outline, y: p.gold, h: p.goldLight, D: p.goldDark, w: p.white, b: p.woodDark });
      const sh = (t * 0.8) % 3;
      if (sh < 1) R(g, x - 6 + Math.round(sh * 11), gy - 14, 1, 6, p.white);
      break;
    }
    case 'cart': {
      R(g, x - 18, gy - 16, 36, 7, p.wood); R(g, x - 18, gy - 16, 36, 1, p.woodLight); R(g, x - 18, gy - 10, 36, 1, p.woodDark);
      R(g, x - 14, gy - 24, 10, 8, p.woodDark); R(g, x - 13, gy - 23, 8, 6, '#d9b07a');
      R(g, x - 2, gy - 22, 10, 6, p.woodDark); R(g, x - 1, gy - 21, 8, 4, '#d9b07a');
      R(g, x + 18, gy - 13, 8, 1, p.woodDark);
      for (const wx of [x - 11, x + 10]) {
        disc(g, wx, gy - 5, 4, p.outline); disc(g, wx, gy - 5, 3, p.gray);
        const a = t * 2; R(g, wx + Math.round(Math.cos(a) * 2), gy - 5 + Math.round(Math.sin(a) * 2), 1, 1, p.outline); R(g, wx, gy - 5, 1, 1, p.outline);
      }
      break;
    }
    case 'desk': {
      deskShape(g, p, x, gy, 44);
      R(g, x - 10, gy - 16, 9, 3, p.blue); R(g, x - 10, gy - 16, 9, 1, '#6b9fd0');
      R(g, x + 4, gy - 15, 8, 2, p.white); R(g, x + 5, gy - 15, 5, 1, p.gray);
      break;
    }
    case 'flag': {
      R(g, x, gy - 40, 2, 40, p.woodDark); R(g, x, gy - 40, 1, 40, p.woodLight);
      disc(g, x + 1, gy - 41, 1, p.gold);
      for (let i = 0; i < 16; i++) {
        const dy = Math.round(Math.sin(i / 3 + t * 5) * 1);
        R(g, x + 2 + i, gy - 38 + dy, 1, 10, i < 15 ? p.red : p.redDark);
        if (i < 15) R(g, x + 2 + i, gy - 38 + dy, 1, 1, '#f08a84');
      }
      R(g, x - 4, gy - 2, 10, 2, p.woodDark);
      break;
    }
    case 'ladder': {
      R(g, x - 7, gy - 46, 2, 46, p.woodDark); R(g, x + 5, gy - 46, 2, 46, p.woodDark);
      R(g, x - 7, gy - 46, 1, 46, p.woodLight); R(g, x + 5, gy - 46, 1, 46, p.woodLight);
      for (let y = gy - 42; y < gy; y += 7) { R(g, x - 5, y, 10, 2, p.wood); R(g, x - 5, y, 10, 1, p.woodLight); }
      break;
    }
    default: break;
  }
}

// =====================================================================
// 角色：画在 36×34 的小画布上 → 自动描边 → 按朝向翻转贴到角色层
// =====================================================================
const SPR_W = 44; const SPR_H = 34; const HX = 11; const OY = 4; // 宽一点，举牌时牌子不被裁掉
const FOOT_Y = OY + 25;
let sprTmp = null; let sprOut = null; let sprCpu = null;

function drawFigure(g, who, o, p) {
  const c = CAST[who] || CAST.passerby;
  const P = (x, y, w, h, col) => R(g, HX + x, OY + y, w, h, col);
  const crouch = o.crouch || 0;
  const hy = (o.bob || 0) + crouch;
  // 腿
  const legs = o.legs || [0, 0, 0, 0];
  const legLen = 3 - Math.min(2, crouch);
  const leg = (lx, dx, dy) => { P(lx + dx, 21 + crouch + dy, 2, legLen, c.pants); P(lx + dx, 21 + crouch + dy + legLen, 3, 1, c.shoes); };
  leg(3, legs[0], legs[1]);
  leg(8, legs[2], legs[3]);
  if (c.skirt) { P(1, 19 + hy, 12, 3, c.clothes); P(1, 21 + hy, 12, 1, c.clothesDark); }
  // 后臂
  const arms = o.arms || 'down';
  const swing = o.armSwing || 0;
  if (arms === 'up') { P(0, 10 + hy, 2, 5, c.clothesDark); P(0, 8 + hy, 2, 2, p.skin); }
  else { P(0, 15 + hy - swing, 2, 3, c.clothesDark); P(0, 18 + hy - swing, 2, 2, p.skinShade); }
  // 书包
  if (c.pack) { P(-3, 14 + hy, 4, 7, '#7a4e32'); P(-3, 14 + hy, 4, 1, '#9c6a46'); P(-2, 17 + hy, 2, 1, p.gold); }
  // 身体
  P(2, 15 + hy, 10, 6, c.clothes);
  P(2, 15 + hy, 2, 6, c.clothesDark);
  P(2, 20 + hy, 10, 1, c.clothesDark);
  if (c.stripe) P(4, 17 + hy, 8, 1, c.stripe);
  if (c.apron) { P(5, 16 + hy, 6, 5, c.apron); P(5, 16 + hy, 6, 1, '#efe2cc'); }
  if (c.buttons) { P(9, 16 + hy, 1, 1, p.gold); P(9, 18 + hy, 1, 1, p.gold); }
  if (c.hood) { P(2, 15 + hy, 10, 1, c.clothesDark); P(8, 16 + hy, 1, 2, p.white); }
  if (c.pack) P(9, 15 + hy, 1, 5, '#7a4e32');
  // 头
  const span = (r) => (r === 0 || r === 11 ? [2, 11] : r === 1 || r === 10 ? [1, 12] : [0, 13]);
  const headY = 3 + hy + (o.headDrop || 0);
  for (let r = 0; r < 12; r++) { const [a, b] = span(r); P(a, headY + r, b - a + 1, 1, p.skin); }
  P(1, headY + 10, 11, 1, p.skinShade); P(2, headY + 11, 9, 1, p.skinShade);
  // 头发 / 帽子
  const hairCol = c.hair; const hi = c.hairHi || c.hair; const dk = c.hairDark || c.hair;
  if (c.style === 'cap') {
    P(0, headY + 4, 3, 4, hairCol); P(0, headY + 8, 2, 1, dk);
    for (let r = -1; r < 4; r++) { const [a, b] = span(Math.max(0, r)); P(a, headY + r, b - a + 1, 1, c.hat); }
    P(2, headY, 5, 1, c.hatHi); P(5, headY + 1, 2, 2, p.white);
    P(0, headY + 3, 14, 1, c.hatDark);
    P(8, headY + 4, 9, 1, c.hatDark); P(9, headY + 3, 7, 1, c.hat);
  } else if (c.style === 'beanie') {
    P(0, headY + 4, 3, 3, hairCol);
    for (let r = -2; r < 4; r++) { const [a, b] = span(Math.max(0, r)); P(a, headY + r, b - a + 1, 1, c.hat); }
    P(0, headY + 3, 14, 1, c.hatDark); P(3, headY - 1, 3, 1, c.hatHi);
    P(5, headY - 4, 3, 2, p.white);
  } else {
    for (let r = 0; r < 4; r++) { const [a, b] = span(r); P(a, headY + r, b - a + 1, 1, hairCol); }
    P(0, headY + 4, 7, 1, hairCol); P(9, headY + 4, 2, 1, hairCol); P(12, headY + 4, 1, 1, hairCol);
    P(0, headY + 5, 3, 3, hairCol); P(0, headY + 8, 2, 1, dk);
    P(3, headY + 1, 4, 1, hi); P(2, headY + 2, 2, 1, hi); P(6, headY + 5, 1, 1, dk);
    if (c.style === 'bun') { P(2, headY - 4, 6, 4, hairCol); P(3, headY - 4, 3, 1, hi); P(2, headY - 1, 6, 1, dk); }
    if (c.style === 'pony') { P(-3, headY + 4, 4, 7, hairCol); P(-3, headY + 4, 2, 1, hi); P(-3, headY + 10, 3, 1, dk); P(0, headY + 3, 2, 2, p.red); }
    if (c.style === 'spiky') { P(1, headY - 1, 2, 1, hairCol); P(5, headY - 2, 2, 2, hairCol); P(9, headY - 1, 2, 1, hairCol); }
    if (c.style === 'tails') { P(-3, headY + 5, 3, 6, hairCol); P(-3, headY + 10, 2, 1, dk); P(0, headY + 3, 2, 2, c.clip); P(11, headY + 1, 2, 2, c.clip); }
  }
  if (c.phones) { P(1, headY - 1, 11, 1, p.outline); P(-1, headY + 4, 3, 5, c.phones); P(-1, headY + 4, 3, 1, '#f08a84'); }
  // 脸（朝右）
  const e = o.expr || 'normal';
  const ey = headY + 6 + (o.lookUp ? -1 : 0) + (e === 'sad' ? 1 : 0);
  const eye = (ex) => {
    if (o.blink && e !== 'shocked' && e !== 'happy') { P(ex, ey + 1, 2, 1, p.outline); return; }
    if (e === 'happy') { P(ex, ey + 1, 1, 1, p.outline); P(ex + 1, ey, 1, 1, p.outline); P(ex + 2, ey + 1, 1, 1, p.outline); return; }
    if (e === 'shocked') { P(ex, ey - 1, 2, 3, p.outline); P(ex, ey - 1, 1, 1, p.eyeHi); return; }
    P(ex, ey, 2, 2, p.outline); P(ex, ey, 1, 1, p.eyeHi);
  };
  eye(7); eye(10);
  P(6, headY + 9, 1, 1, p.blush); P(12, headY + 9, 1, 1, p.blush);
  if (e === 'happy' || o.mouth) { P(9, headY + 9, 2, 1, p.outline); P(9, headY + 10, 2, 1, p.red); }
  else if (e === 'shocked') P(9, headY + 9, 2, 2, p.outline);
  else if (e === 'sad') { P(9, headY + 10, 2, 1, p.outline); P(8, headY + 9, 1, 1, p.outline); P(11, headY + 9, 1, 1, p.outline); }
  else P(9, headY + 9, 2, 1, p.skinShade);
  if (c.glasses) {
    const gc = '#6f6a65';
    for (const ex of [7, 10]) { P(ex - 1, ey - 1, 4, 1, gc); P(ex - 1, ey + 2, 4, 1, gc); }
    P(6, ey, 1, 2, gc); P(13, ey, 1, 2, gc);
  }
  // 前臂 + 手里的东西
  const hold = o.hold;
  if (arms === 'up') { P(12, 10 + hy, 2, 5, c.clothes); P(12, 8 + hy, 2, 2, p.skin); }
  else if (arms === 'chin') { P(11, 14 + hy, 2, 3, c.clothes); P(10, 12 + hy, 2, 2, p.skin); }
  else if (arms === 'point' || hold) { P(11, 15 + hy, 4, 2, c.clothes); P(15, 15 + hy, 2, 2, p.skin); }
  else { P(12, 15 + hy + swing, 2, 3, c.clothes); P(12, 18 + hy + swing, 2, 2, p.skin); }
  if (hold === 'book') { P(14, 12 + hy, 9, 6, p.outline); P(15, 13 + hy, 3, 4, p.board); P(19, 13 + hy, 3, 4, p.board); P(18, 13 + hy, 1, 4, p.red); }
  if (hold === 'coin') { P(15, 11 + hy, 5, 5, p.goldDark); P(15, 11 + hy, 5, 4, p.gold); P(16, 12 + hy, 1, 2, p.goldLight); }
  if (hold === 'phone') { P(15, 10 + hy, 4, 7, p.outline); P(16, 11 + hy, 2, 4, p.blue); }
  if (hold === 'trophy') { P(14, 7 + hy, 7, 6, p.goldDark); P(14, 7 + hy, 7, 5, p.gold); P(15, 8 + hy, 1, 2, p.goldLight); P(16, 13 + hy, 3, 2, p.goldDark); }
  if (hold === 'map') { P(14, 9 + hy, 10, 8, p.woodDark); P(15, 10 + hy, 8, 6, p.board); P(16, 11 + hy, 3, 1, p.green); P(19, 13 + hy, 3, 1, p.blue); P(17, 14 + hy, 1, 1, p.red); }
  if (hold === 'board') {
    P(14, 4 + hy, 15, 11, p.woodDark); P(15, 5 + hy, 13, 9, p.board); P(20, 15 + hy, 2, 3, p.woodDark);
    o.boardAt = { x: HX + 21.5, y: OY + 9.5 + hy };
  }
}

function drawChar(cg, who, cx, footY, o, p, cpu) {
  if (!sprTmp || sprCpu !== cpu) { sprTmp = makeCanvas(SPR_W, SPR_H, cpu); sprOut = makeCanvas(SPR_W, SPR_H, cpu); sprCpu = cpu; }
  const g = sprTmp.getContext('2d');
  const out = sprOut.getContext('2d');
  g.clearRect(0, 0, SPR_W, SPR_H);
  drawFigure(g, who, o, p);
  out.globalCompositeOperation = 'source-over';
  out.clearRect(0, 0, SPR_W, SPR_H);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.drawImage(sprTmp, dx, dy);
  out.globalCompositeOperation = 'source-in';
  out.fillStyle = p.outline; out.fillRect(0, 0, SPR_W, SPR_H);
  out.globalCompositeOperation = 'source-over';
  out.drawImage(sprTmp, 0, 0);
  const mid = HX + 7;
  const left = Math.round(cx) - mid;
  const top = Math.round(footY) - FOOT_Y;
  if (o.facing >= 0) cg.drawImage(sprOut, left, top);
  else { cg.save(); cg.translate(left + mid * 2, top); cg.scale(-1, 1); cg.drawImage(sprOut, 0, 0); cg.restore(); }
  if (o.boardAt && o.text) {
    const bx = o.facing >= 0 ? left + o.boardAt.x : left + mid * 2 - o.boardAt.x;
    o.texts.push({ text: o.text, x: bx, y: top + o.boardAt.y, w: 13, sizes: [36, 24], px: CPX });
  }
}

// ---------- 气泡和特效（角色层坐标） ----------
const ICONS = {
  '!': { c: 'r', m: ['..#..', '..#..', '..#..', '..#..', '.....', '..#..'] },
  '?': { c: 'k', m: ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'] },
  idea: { c: 'y', m: ['.###.', '#####', '#####', '.###.', '..k..', '..k..'] },
  heart: { c: 'r', m: ['.....', '##.##', '#####', '#####', '.###.', '..#..'] },
  '...': { c: 'k', m: ['.....', '.....', '.....', '#.#.#', '.....', '.....'] },
  angry: { c: 'r', m: ['#...#', '.#.#.', '.....', '.#.#.', '#...#', '.....'] },
  money: { c: 'y', m: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.'] },
  star: { c: 'y', m: ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'] },
};
function drawBubble(g, x, y, kind, p, age) {
  const icon = ICONS[kind]; if (!icon) return;
  if (age < 0.1) y += 1;
  R(g, x - 6, y - 10, 13, 10, p.outline); R(g, x - 5, y - 9, 11, 8, p.white);
  R(g, x - 5, y - 2, 11, 1, '#e6e0d6');
  R(g, x - 3, y, 2, 1, p.outline); R(g, x - 3, y - 1, 2, 1, p.white); R(g, x - 4, y + 1, 1, 1, p.outline);
  const col = { r: p.red, k: p.outline, y: p.gold }[icon.c];
  sprite(g, x - 2, y - 8, icon.m.map((r) => r.replace(/#/g, 'c')), { c: col, k: p.outline });
}
function dust(g, x, y, age, p) {
  if (age < 0 || age > 0.5) return;
  const k = age / 0.5;
  for (const dir of [-1, 1]) for (let i = 0; i < 3; i++) {
    const s = k < 0.5 ? 2 : 1;
    R(g, x + dir * (4 + i * 3 + k * 6), y - i - k * 2, s, s, p.dust);
  }
}
function stars(g, x, y, t, p) {
  for (let i = 0; i < 3; i++) {
    const a = t * 7 + i * 2.1;
    const sx = x + Math.round(Math.cos(a) * 7); const sy = y + Math.round(Math.sin(a) * 2);
    R(g, sx, sy - 1, 1, 3, p.gold); R(g, sx - 1, sy, 3, 1, p.gold);
  }
}
function sparkles(g, x, y, t, p) {
  for (let i = 0; i < 4; i++) {
    const ph = (t * 2 + i * 0.37) % 1;
    if (ph > 0.6) continue;
    const sx = x + Math.round(Math.cos(i * 1.7) * 11); const sy = y + Math.round(Math.sin(i * 2.3) * 6) - Math.round(ph * 3);
    const col = i % 2 ? p.gold : p.white;
    R(g, sx, sy - 1, 1, 3, col); R(g, sx - 1, sy, 3, 1, col);
  }
}
function sweat(g, x, y, p) { R(g, x, y, 1, 1, p.tear); R(g, x - 1, y + 1, 3, 2, p.tear); R(g, x, y + 1, 1, 1, p.white); }
function gloom(g, x, y, t) { for (let i = 0; i < 3; i++) R(g, x - 4 + i * 4, y - (Math.floor(t * 3 + i) % 2), 1, 4, '#7b8fb8'); }
function tears(g, x, y, d, p) { for (let i = 0; i < 2; i++) { const k = (d * 1.6 + i * 0.5) % 1; R(g, x, y + Math.round(k * 6), 1, 2, p.tear); } }

// =====================================================================
// 时间规划
// =====================================================================
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i];
    const next = tl.sections[i + 1];
    const at = (k) => sec.lines[clamp(Number(k) || 0, 0, sec.lines.length - 1)].start;
    return {
      start: sec.start,
      end: next ? next.start : tl.duration,
      lineEnd: sec.end,
      actors: (s.actors || []).map((a) => ({ ...a, t: a.action && a.action !== 'idle' ? at(a.at) : null })),
    };
  });
}

// =====================================================================
// 舞台
// =====================================================================
let L = null;
function layers(cpu) {
  if (!L || L.cpu !== cpu) L = { cpu, stage: makeCanvas(SW, SH, cpu), chars: makeCanvas(CW, CH, cpu), fg: makeCanvas(SW, SH, cpu) };
  return L;
}

function actorState(a, pd, t, gy) {
  const baseX = POS[a.pos] ?? POS.center;
  const st = { x: baseX, y: gy, facing: a.facing === 'left' ? -1 : a.facing === 'right' ? 1 : (baseX <= 84 ? 1 : -1),
    walking: false, expr: 'normal', arms: 'down', hold: a.hold || null, crouch: 0, bob: 0, armSwing: 0, legs: null,
    mouth: false, lookUp: false, headDrop: 0, clip: false, fx: [], airborne: false, shake: 0, text: a.text || '' };
  if (a.enter) {
    const from = baseX <= 84 ? -16 : SW + 16;
    const k = clamp((t - pd.start) / 1.2);
    if (k < 1) { st.x = from + (baseX - from) * easeOut(k); st.walking = true; st.facing = from < baseX ? 1 : -1; }
  }
  const act = a.action || 'idle';
  const d = a.t == null ? -1 : t - a.t;
  if (d >= 0) {
    switch (act) {
      case 'jump': {
        if (d < 0.15) st.crouch = 2;
        else {
          const k = clamp((d - 0.15) / 0.65);
          if (k < 1) {
            st.y -= Math.sin(Math.PI * k) * 18; st.x += st.facing * 64 * k; st.airborne = true;
            st.legs = [-1, -2, 1, -2]; st.arms = 'up'; st.expr = 'shocked';
          } else {
            st.x += st.facing * 64; const land = d - 0.8;
            if (land < 0.15) st.crouch = 2;
            st.expr = 'happy'; st.fx.push(['dust', land]); if (land > 0.25) st.fx.push(['sparkles']);
          }
        }
        break;
      }
      case 'fall': {
        if (d < 0.12) { st.crouch = 1; st.expr = 'shocked'; }
        else {
          const k = d - 0.12;
          st.y += Math.min(19, k * k * 90); st.clip = true; st.expr = 'shocked'; st.arms = 'up';
          if (k > 0.45) { st.fx.push(['dust', k - 0.45]); if (k < 0.7) st.shake = 1; }
          st.fx.push(['sweat']);
        }
        break;
      }
      case 'bump': {
        const k = clamp(d / 0.55);
        st.x += st.facing * (k < 0.35 ? (k / 0.35) * 6 : 6 - ((k - 0.35) / 0.65) * 10);
        st.expr = d < 1.6 ? 'shocked' : 'sad';
        if (d > 0.18 && d < 1.8) st.fx.push(['stars']);
        if (d > 0.18 && d < 0.4) st.shake = 1;
        if (d < 0.2) st.walking = true;
        break;
      }
      case 'happy': {
        st.expr = 'happy'; st.arms = 'up';
        if (d < 2) { const hop = Math.abs(Math.sin(d * 8)); st.y -= hop * 5; st.airborne = hop > 0.3; }
        st.fx.push(['sparkles']);
        break;
      }
      case 'sad': st.expr = 'sad'; st.headDrop = 1; st.fx.push(['tears', d], ['gloom']); break;
      case 'shocked': {
        st.expr = 'shocked';
        if (d < 0.35) st.y -= Math.sin((d / 0.35) * Math.PI) * 4;
        else if (d < 0.8) st.x += Math.sin(d * 70) > 0 ? 0.6 : -0.6;
        st.fx.push(['sweat']);
        break;
      }
      case 'think': st.arms = 'chin'; st.lookUp = true; break;
      case 'read': st.hold = st.hold || 'book'; if (d > 1.2) st.expr = 'happy'; break;
      case 'talk': if (t < pd.lineEnd) st.mouth = Math.floor(t * 7) % 2 === 0; st.arms = Math.floor(t * 1.5) % 2 ? 'point' : 'down'; break;
      case 'point': st.arms = 'point'; st.mouth = t < pd.lineEnd && Math.floor(t * 7) % 2 === 0; break;
      case 'leave': {
        const to = st.facing > 0 ? SW + 16 : -16;
        const k = clamp(d / 1.5); st.x = baseX + (to - baseX) * k; st.walking = k < 1;
        break;
      }
      default: break;
    }
  }
  if (st.walking) {
    const f = Math.floor(t * 9) % 4;
    st.legs = [[0, 0, 0, 0], [-1, 0, 1, -1], [0, 0, 0, 0], [1, -1, -1, 0]][f];
    st.bob = f % 2 ? -1 : 0;
    st.armSwing = f === 1 ? 1 : f === 3 ? -1 : 0;
  } else if (!st.airborne && !st.crouch && act !== 'fall') {
    st.bob = Math.floor(t * 1.3 + baseX / 9) % 4 === 0 ? 1 : 0; // 呼吸
  }
  st.blink = (t + hash(baseX) * 3) % 3.2 < 0.12;
  return st;
}

function drawStage(s, pd, t, p, cpu) {
  const { stage, chars, fg } = layers(cpu);
  const g = stage.getContext('2d');
  const cg = chars.getContext('2d');
  const fgc = fg.getContext('2d');
  const scene = SCENES.includes(s.scene) ? s.scene : 'field';
  const gy = GROUND[scene];
  const texts = [];
  g.clearRect(0, 0, SW, SH); cg.clearRect(0, 0, CW, CH); fgc.clearRect(0, 0, SW, SH);
  g.drawImage(sceneLayer(scene, p), 0, 0);
  sceneDynamic(g, scene, p, t);
  if (scene === 'classroom' && s.boardText) texts.push({ text: s.boardText, x: 84, y: 30, w: 72, sizes: [72, 60, 48, 36], px: PX, color: '#f3efe2' });
  if (scene === 'exam') texts.push({ text: s.boardText || '考 场', x: 84, y: 19, w: 58, sizes: [60, 48, 36, 24], px: PX, color: '#fff3d6' });
  (s.props || []).filter((pr) => PROPS.includes(pr.type)).forEach((pr) => drawProp(g, pr, p, gy, t, texts));

  let shake = 0;
  const bubbles = [];
  const cgy = Math.round(gy * K);
  for (const a of pd.actors) {
    const st = actorState(a, pd, t, gy);
    const cx = Math.round(st.x * K); const cy = Math.round(st.y * K);
    shake = Math.max(shake, st.shake);
    if (!st.clip) {
      const sw = st.airborne ? 4 : 6;
      cg.fillStyle = 'rgba(0,0,0,0.14)';
      cg.fillRect(cx - sw, cgy + 1, sw * 2, 1); cg.fillRect(cx - sw + 2, cgy + 2, sw * 2 - 4, 1);
    }
    const o = { ...st, texts };
    if (st.clip) {
      cg.save(); cg.beginPath(); cg.rect(0, 0, CW, cgy + 1); cg.clip();
      drawChar(cg, a.who, cx, cy, o, p, cpu);
      cg.restore();
    } else drawChar(cg, a.who, cx, cy, o, p, cpu);
    const headTop = cy - 23;
    for (const [kind, v] of st.fx) {
      if (kind === 'dust') dust(cg, cx, cgy, v, p);
      if (kind === 'stars') stars(cg, cx, headTop - 1, t, p);
      if (kind === 'sparkles') sparkles(cg, cx, headTop + 6, t, p);
      if (kind === 'sweat') sweat(cg, cx - st.facing * 8, Math.min(headTop + 4, cgy - 5), p);
      if (kind === 'tears') tears(cg, cx + st.facing * 3, cy - 13, v, p);
      if (kind === 'gloom') gloom(cg, cx, headTop - 3, t);
    }
    const act = a.action || 'idle';
    const d = a.t == null ? -1 : t - a.t;
    const defaultBubble = { think: '?', shocked: '!', happy: 'heart', sad: '...', fall: '!', read: 'idea' }[act];
    const bub = a.bubble || (d >= 0 ? defaultBubble : null);
    const bubFrom = a.t ?? pd.start + 0.6;
    if (bub && t >= bubFrom && !(act === 'fall' && d > 0.35)) {
      const extra = CAST[a.who]?.style === 'bun' ? 4 : CAST[a.who]?.style === 'beanie' ? 3 : 0;
      bubbles.push({ x: cx + st.facing * 9, y: headTop - 2 - extra, kind: bub, age: t - bubFrom });
    }
  }
  for (const b of bubbles) drawBubble(cg, b.x, b.y, b.kind, p, b.age);
  foreground(fgc, scene, p, t);
  return { texts, shake };
}

// =====================================================================
// 主入口
// =====================================================================
function pixelFont(ctx, size) { ctx.font = `${size}px ${PIXEL_FONT}`; ctx.letterSpacing = '0px'; }
function fitPixel(ctx, text, sizes, maxW) {
  for (const s of sizes) { pixelFont(ctx, s); if (ctx.measureText(text).width <= maxW) return s; }
  return sizes[sizes.length - 1];
}
/** 像素风台阶圆角框：b 为边框粗细 */
function pixelBox(ctx, x, y, w, h, fill, border, b) {
  ctx.fillStyle = border;
  ctx.fillRect(x + b, y, w - 2 * b, h); ctx.fillRect(x, y + b, w, h - 2 * b);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2 * b, y + b, w - 4 * b, h - 2 * b); ctx.fillRect(x + b, y + 2 * b, w - 2 * b, h - 4 * b);
}

export function drawFrame(ctx, { script, tl, planData, t, skinId = 'warm' }) {
  const p = skins[skinId] || skins.warm;
  const cpu = !!ctx.getContextAttributes?.().willReadFrequently;
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.035;
  for (let i = 0; i < 140; i++) ctx.fillRect(Math.floor(hash(i + 7) * 180) * 6, Math.floor(hash(i + 77) * 320) * 6, 6, 6);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'middle';

  // 账号
  const acc = '@' + (script.account || '我的账号');
  pixelFont(ctx, 36);
  const aw = ctx.measureText(acc).width;
  const ax = W / 2 - (aw + 60) / 2;
  ctx.fillStyle = p.accent; ctx.fillRect(ax, 132, 42, 42);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; pixelFont(ctx, 24);
  ctx.fillText([...(script.account || '我')][0], ax + 21, 154);
  pixelFont(ctx, 36); ctx.fillStyle = p.ink2; ctx.textAlign = 'left';
  ctx.fillText(acc, ax + 60, 154);

  // 标题
  const title = script.title || '';
  let tlines = [title];
  let ts = fitPixel(ctx, title, [84, 72], 980);
  if (ctx.measureText(title).width > 980) {
    const ch = [...title]; const mid = Math.ceil(ch.length / 2);
    tlines = [ch.slice(0, mid).join(''), ch.slice(mid).join('')];
    ts = fitPixel(ctx, tlines[0], [72, 60, 48], 980);
  }
  pixelFont(ctx, ts); ctx.fillStyle = p.ink; ctx.textAlign = 'center';
  tlines.forEach((ln, i) => ctx.fillText(ln, W / 2, 262 + (i - (tlines.length - 1) / 2) * (ts + 12)));
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i === 2 ? p.accent : p.ink; ctx.globalAlpha = i === 2 ? 1 : 0.25; ctx.fillRect(W / 2 - 66 + i * 30, 336, 12, 12); }
  ctx.globalAlpha = 1;

  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  const s = script.sections[idx];
  const pd = planData[idx];

  // 舞台框 + 投影
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.16; ctx.fillRect(SX + 6, SY + 6, STW + 12, STH + 12); ctx.globalAlpha = 1;
  ctx.fillStyle = p.ink; ctx.fillRect(SX - 6, SY - 6, STW + 12, STH + 12);

  if (s && pd) {
    const { texts, shake } = drawStage(s, pd, t, p, cpu);
    const ox = shake ? (Math.floor(t * 40) % 2 ? PX : -PX) : 0;
    const oy = shake ? (Math.floor(t * 33) % 2 ? PX : 0) : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(SX, SY, STW, STH); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(L.stage, SX + ox, SY + oy, STW, STH);
    ctx.drawImage(L.chars, SX + ox, SY + oy, CW * CPX, CH * CPX);
    ctx.drawImage(L.fg, SX + ox, SY + oy, STW, STH);
    ctx.imageSmoothingEnabled = true;
    for (const tx of texts) {
      fitPixel(ctx, tx.text, tx.sizes, tx.w * tx.px - 8);
      ctx.fillStyle = tx.color || p.outline; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tx.text, SX + ox + tx.x * tx.px, SY + oy + tx.y * tx.px + 2);
    }
    // 像素溶解转场
    const k = (t - pd.start) / 0.42;
    if (k < 1 && idx > 0) {
      const B = 48; ctx.fillStyle = p.paper;
      for (let by = 0; by < STH; by += B) for (let bx = 0; bx < STW; bx += B) {
        if (hash(bx * 0.37 + by * 1.91 + 0.5) > k) ctx.fillRect(SX + bx, SY + by, B, B);
      }
    }
    ctx.restore();
    // 镜头标签
    pixelFont(ctx, 36);
    const tag = `${String(idx + 1).padStart(2, '0')}  ${s.tag || ''}`;
    const tw = ctx.measureText(tag).width + 48;
    ctx.fillStyle = p.ink; ctx.fillRect(SX + 12, SY - 66, tw + 12, 60);
    ctx.fillStyle = p.accent; ctx.fillRect(SX + 18, SY - 60, tw, 54);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(tag, SX + 42, SY - 32);
  }

  // 对话框字幕（打字机）
  const bx = SX - 6; const by = SY + STH + 48; const bw = STW + 12; const bh = 228;
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.16; ctx.fillRect(bx + 12, by + 12, bw, bh); ctx.globalAlpha = 1;
  pixelBox(ctx, bx, by, bw, bh, p.dialog, p.ink, 6);
  const sec = tl.sections[idx];
  const ln = sec?.lines.find((l) => t >= l.start && t < l.end + 0.15);
  if (ln) {
    const total = [...ln.text].length;
    const shown = Math.min(total, Math.floor((t - ln.start) * 22) + 1);
    const rows = splitSubtitle(ln.text, 13);
    const size = Math.min(...rows.map((r) => fitPixel(ctx, r, [60, 48], bw - 96)));
    pixelFont(ctx, size);
    ctx.fillStyle = p.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let left = shown;
    rows.forEach((r, i) => {
      const full = ctx.measureText(r).width;
      const part = [...r].slice(0, Math.max(0, left)).join('');
      left -= [...r].length;
      ctx.fillText(part, W / 2 - full / 2, by + bh / 2 + (i - (rows.length - 1) / 2) * (size + 24));
    });
    if (shown >= total && Math.floor(t * 2.5) % 2 === 0) {
      ctx.fillStyle = p.accent;
      const x2 = bx + bw - 60; const y2 = by + bh - 54;
      ctx.fillRect(x2, y2, 24, 6); ctx.fillRect(x2 + 6, y2 + 6, 12, 6); ctx.fillRect(x2 + 9, y2 + 12, 6, 6);
    }
  }

  // 进度格
  const n = planData.length;
  const sz = n > 24 ? 12 : 18; const gap = n > 24 ? 6 : 12;
  const total = n * sz + (n - 1) * gap;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i === idx ? p.accent : p.ink;
    ctx.globalAlpha = i === idx ? 1 : i < idx ? 0.5 : 0.14;
    ctx.fillRect(W / 2 - total / 2 + i * (sz + gap), by + bh + 66, sz, sz);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export async function preloadFonts(script) {
  const text = JSON.stringify(script) + '0123456789@/考场我';
  const fonts = globalThis.document?.fonts || self.fonts;
  await Promise.all([fonts.load(`48px "${PIXEL_FAMILY}"`, text), fonts.load(`900 40px "Noto Sans SC"`, text)]);
}

/** AI 结果兜底 */
export function normalize(s, splitLine) {
  const strip = (v) => String(v || '').trim().replace(/[。.！!]+$/, '');
  const posOk = (v) => (POS[v] !== undefined ? v : 'center');
  s.title = strip(s.title) || '未命名';
  s.sections = (s.sections || []).filter(Boolean).map((x) => ({
    tag: strip(x.tag),
    scene: SCENES.includes(x.scene) ? x.scene : 'field',
    boardText: strip(x.boardText).slice(0, 10),
    actors: (x.actors || []).slice(0, 3).map((a) => ({
      who: CAST[a.who] ? a.who : 'hero', pos: posOk(a.pos), enter: !!a.enter,
      action: ACTIONS.includes(a.action) ? a.action : 'idle', at: Number(a.at) || 0,
      bubble: BUBBLES.includes(a.bubble) ? a.bubble : null,
      hold: HOLDS.includes(a.hold) ? a.hold : null,
      text: strip(a.text).slice(0, 5), facing: ['left', 'right'].includes(a.facing) ? a.facing : null,
    })),
    props: (x.props || []).slice(0, 3).filter((pr) => PROPS.includes(pr.type)).map((pr) => ({ type: pr.type, pos: posOk(pr.pos), text: strip(pr.text).slice(0, 5) })),
    lines: (x.lines || []).filter((l) => l && String(l).trim()).flatMap((l) => splitLine(String(l), 20)),
  })).filter((x) => x.lines.length).map(fixLayout);
  return s;
}

/**
 * 自动排版：AI 常把角色和道具放在同一个位置，叠在一起看不清。
 * 规则：角色之间不重叠；道具避开角色（坑和掉坑/跳坑的角色、书桌除外）；撞墙的角色自动面朝墙。
 */
const ORDER = ['farleft', 'left', 'center', 'right', 'farright'];
function nearestFree(pos, taken) {
  const i = ORDER.indexOf(pos);
  for (let d = 1; d < ORDER.length; d++) {
    for (const j of [i + d, i - d]) if (j >= 0 && j < ORDER.length && !taken.has(ORDER[j])) return ORDER[j];
  }
  return pos;
}
function fixLayout(sec) {
  const taken = new Set();
  for (const a of sec.actors) {
    if (taken.has(a.pos)) a.pos = nearestFree(a.pos, taken);
    taken.add(a.pos);
  }
  const pits = sec.props.filter((p) => p.type === 'pit');
  // 掉坑：坑要在角色脚下；跳坑：坑要在角色前方
  for (const a of sec.actors) {
    if (a.action === 'fall') {
      if (pits.length) pits[0].pos = a.pos;
      else sec.props.unshift({ type: 'pit', pos: a.pos, text: '' });
    }
    if (a.action === 'jump' && pits.length) {
      const i = ORDER.indexOf(a.pos);
      const ahead = ORDER[Math.min(ORDER.length - 1, i + 1)];
      if (pits[0].pos === a.pos || ORDER.indexOf(pits[0].pos) < i) pits[0].pos = i < 4 ? ahead : 'right';
      a.facing = 'right';
    }
  }
  const propTaken = new Set();
  for (const p of sec.props) {
    const shareOk = p.type === 'pit' || p.type === 'desk' || p.type === 'clock';
    if ((!shareOk && taken.has(p.pos)) || propTaken.has(p.pos)) p.pos = nearestFree(p.pos, new Set([...taken, ...propTaken]));
    propTaken.add(p.pos);
  }
  sec.props = sec.props.slice(0, 3);
  // 撞墙：面朝最近的墙；墙不能在背后
  const wall = sec.props.find((p) => p.type === 'wall');
  for (const a of sec.actors) {
    if (a.action !== 'bump') continue;
    if (!wall) { sec.props.push({ type: 'wall', pos: nearestFree(a.pos, new Set([...taken, ...propTaken])), text: '' }); }
    const w = sec.props.find((p) => p.type === 'wall');
    const ai = ORDER.indexOf(a.pos);
    a.facing = ORDER.indexOf(w.pos) >= ai ? 'right' : 'left';
    // 墙要紧挨着角色，撞得到
    const adj = ORDER[ai + (a.facing === 'right' ? 1 : -1)];
    if (adj && !taken.has(adj)) {
      const other = sec.props.find((p) => p !== w && p.pos === adj);
      if (other) other.pos = w.pos;
      w.pos = adj;
    }
  }
  return sec;
}
