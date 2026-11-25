// 形式 07：实拍混剪
// 灵魂：客户自己拍的照片和视频是素材，但不是一直垫在底下的背景——
// 每套“版式”先决定画面怎么摆：整屏、三屏、斜切、漫画分格、种草笔记、手帐拼贴、朋友圈动态、美术馆画框、报纸、
// 胶片条、黑白留白、文字镂空、老电视、泡泡、撞色、直播间、聊天记录、极简、科技窗口、时间轴、上字下图、左右对开、九宫格、卡片滑动、月洞窗……
// 防审美疲劳：33 套版式彼此差别很大：构图、标题、字幕、转场、剪辑节奏（按句切 / 卡点切 / 一段一个镜头）、
// 音效、背景音乐（14 种曲风 × 多个变奏）全都不同；每次生成自动换一套（最近用过的不重复）。
import { W, H, clamp, easeOut, font, fitFont, hash } from '../engine/draw.js';
import { loadFontFaces } from '../engine/font-preload.js';
import { bgmTempo } from '../engine/music.js';
import { THEMES, themeEmoji, normalizeTheme, EMOJI_FONT, drawWallpaper } from './themes.js';
import { isClip, prepareClip } from '../engine/footage.js';
import { SKEW, PIXEL_FAMILY, pop, withPop, rr, slantText, fitSlant, grad, pixelFont, fitPixel, flowerText, drawOverlay } from './footage-mix-parts.js';
import { dims, clipT, imageOf, coverIn, blurFill, motion, drawPlaceholder, grain, gradeIt, scanlines, darker } from './footage-mix-media.js';
import { cleanSub, markKeys, subRows, chunk, typeParts, TITLES, SUBS, TYPES } from './footage-mix-text.js';
import { BGS, FRAMES, DECOS } from './footage-mix-frames.js';

export const meta = {
  id: 'footage-mix',
  name: '实拍混剪',
  category: '获客引流',
  outcome: '用你自己拍的课堂、校区、学员视频和照片出片，真实画面最让人信任',
  ideas: ['带大家看看我们的上课现场', '学员从零基础到能接单', '暑假班开课第一天', '我们和别的机构有什么不一样'],
  tagline: '你自己的照片和视频做主角，33 套版式每次自动换着用',
  fits: '课堂实拍 · 校区展示 · 学员成果 · 招生宣传',
  durations: [1, 2, 3],
  bgm: 'pop',
  needsStock: true,
  coverIdx: 2,
  photoKind: 'footage',
  autoSkin: true, // 每条视频自己带版式（script.look），不沿用上一条
  multiLook: true, // 首页可以挑版式、一次出几条不同版式的
  photoHint: '上传你自己拍的课堂、校区、学员、作品的照片和视频（照片最多 30 张、视频最多 10 条；视频每条只取前 30 秒，原声会去掉，换成配音和音乐）。不够的镜头自动用素材库补。只存在你自己的电脑里。',
};

// =====================================================================
// 33 套版式
// =====================================================================
// 老的 6 套（bold/mag/cinema/news/dv/pop）：bleed 贴边；layouts.single / montage 是格子拼法；subcut 一句一换
// 新的 27 套：frame 画面怎么摆；cut 剪辑节奏（line 一句一换 / beat 跟着音乐卡点换 / section 一段一个镜头）
//   beats 卡点隔几拍换；bump 每拍画面轻轻一跳；cutFx 切换时的小效果；typeRate 讲观点的镜头变成大字画面的概率
//   title / sub / type / deco / bg：标题、字幕、大字画面、界面装饰、背景；trans 段与段之间的转场；sfx 音效；bgm 背景音乐（曲风@变奏）
export const skins = {
  // ---------------- 卡点快剪 ----------------
  bold: {
    name: '爆款快剪', group: '卡点快剪', desc: '整屏铺满 · 一句一换 · 字一个个砸下来', bgm: 'phonk', bleed: true, layouts: { single: ['full'], montage: ['full', 'split2', 'trio'] }, typeRate: 0.8, subcut: true,
    grade: 'punch', bg: 'stripes', title: 'band', sub: 'slam', subY: 1440, trans: ['whip', 'zoom', 'flash', 'shake'], deco: 'bar', chip: 'grad', themed: true,
    sfx: { intro: 'impact', cut: 'whoosh', sub: 'swish', pop: 'pop', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#ffe12e', chip1: '#ff3b2f', chip2: '#c41d12', card: '#ffffff', cardInk: '#c41d12', dark: 'rgba(10,12,18,0.86)', bg1: '#111111', bg2: '#000000',
  },
  flash: {
    name: '卡点闪切', group: '卡点快剪', desc: '跟着鼓点两拍一切 · 正中大字一截截跳', bgm: 'edm@1', frame: 'full', cut: 'beat', beats: 2, bump: 0.035, cutFx: 'flash',
    typeRate: 0.55, hookType: true, type: 'flash', grade: 'pop', bg: 'black', title: 'tagTL', sub: 'giant', subY: 1470, subOnType: false, deco: 'stories', trans: ['flash', 'zoom', 'shake'], chip: 'grad',
    ov: { s: 0.86, cy: 960, dy: -150 },
    sfx: { intro: 'impact', cut: 'impact', cutGain: 0.5, beat: 'kick', beatGain: 0.35, pop: 'snap', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#d4ff1e', chip1: '#ff2d6f', chip2: '#b3134a', card: '#ffffff', cardInk: '#b3134a', dark: 'rgba(8,8,10,0.88)',
  },
  tri: {
    name: '三屏律动', group: '卡点快剪', desc: '三条横屏轮流换 · 黑框字幕 · 摇滚', bgm: 'rock@2', frame: 'tri', cut: 'beat', beats: 2, rotate: true,
    typeRate: 0.3, type: 'band', grade: 'teal', bg: 'black', title: 'block', sub: 'boxed', subY: 1650, deco: 'tri', trans: ['shake', 'whip'], chip: 'flat',
    sfx: { intro: 'impact', cut: 'whoosh', beat: 'swish', beatGain: 0.3, pop: 'pop', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#ffcc00', chip1: '#ff4a1c', chip2: '#b02a06', card: '#ffffff', cardInk: '#b02a06', dark: 'rgba(0,0,0,0.85)',
  },
  slash: {
    name: '斜切对撞', group: '卡点快剪', desc: '两个画面斜着对撞 · 斜体错位字 · 飙车风', bgm: 'phonk@3', frame: 'slash', cut: 'line', rotate: true,
    typeRate: 0.4, type: 'slash', grade: 'neon', bg: 'black', title: 'italic', sub: 'shadowItalic', subY: 1560, deco: 'slash', trans: ['whip', 'flash'], chip: 'grad',
    sfx: { intro: 'zap', cut: 'whoosh', sub: 'zap', subGain: 0.3, pop: 'snap', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#00f0ff', chip1: '#ff2e88', chip2: '#a8125a', card: '#ffffff', cardInk: '#a8125a', dark: 'rgba(10,6,20,0.88)',
  },
  grid9: {
    name: '九宫格', group: '卡点快剪', desc: '九块画面一拍翻一块 · 中间那格最亮', bgm: 'edm@5', frame: 'grid9', cut: 'beat', beats: 2, rotate: true,
    typeRate: 0.3, type: 'band', grade: 'punch', bg: 'black', title: 'grid', sub: 'boxed', subY: 1560, deco: 'grid', trans: ['zoom', 'flash'], chip: 'grad',
    sfx: { intro: 'impact', cut: 'whoosh', beat: 'snap', beatGain: 0.4, pop: 'pop', type: 'impact', cell: 'snap', end: 'ding' },
    ink: '#ffffff', hl: '#ffe12e', chip1: '#ff6a00', chip2: '#c24a00', card: '#ffffff', cardInk: '#c24a00', dark: 'rgba(0,0,0,0.85)',
  },
  topbig: {
    name: '上字下图', group: '卡点快剪', desc: '上面一大块写小标题 · 下面是画面', bgm: 'pop@6', frame: 'topbig', cut: 'line',
    typeRate: 0, grade: 'punch', bg: 'black', title: 'none', sub: 'stroke', subY: 1720, deco: 'topbig', trans: ['whip', 'wipe'], chip: 'flat', themed: true,
    ov: { s: 0.85, cy: 960, dy: 240 },
    sfx: { intro: 'impact', cut: 'whoosh', sub: 'swish', subGain: 0.3, pop: 'pop', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#ffd400', chip1: '#ff3b5c', chip2: '#c41d3a', card: '#ffffff', cardInk: '#c41d3a', dark: 'rgba(0,0,0,0.85)',
  },
  // ---------------- 综艺活泼 ----------------
  pop: {
    name: '综艺花字', group: '综艺活泼', desc: '圆框拼图 · 花字一跳一跳 · 撒星星', bgm: 'pop', bleed: true, layouts: { single: ['full', 'circle'], montage: ['grid4', 'circle', 'trio'] }, typeRate: 0.65, subcut: true,
    grade: 'vivid', bg: 'dots', title: 'pop', sub: 'flower', subY: 1440, trans: ['burst', 'zoom', 'shake'], deco: 'pop', chip: 'sticker', themed: true,
    sfx: { intro: 'sparkle', cut: 'boing', sub: 'pop', pop: 'pop', type: 'sparkle', cell: 'pop', end: 'sparkle' },
    ink: '#ffffff', hl: '#ffe14d', chip1: '#ff5fa2', chip2: '#d12f7a', card: '#ffffff', cardInk: '#d12f7a', dark: 'rgba(40,10,40,0.82)', bg1: '#ff8cc6', bg2: '#ffb3d9',
  },
  comic: {
    name: '漫画分格', group: '综艺活泼', desc: '粗黑边分格 · 对话框字幕 · 爆炸大字', bgm: 'chip@4', frame: 'comic', cut: 'section', cellGap: 0.25,
    typeRate: 0.45, hookType: true, type: 'pow', grade: 'pop', bg: 'halftone', title: 'comic', sub: 'speech', subY: 1710, deco: 'comic', trans: ['zoom', 'burst'], chip: 'flat',
    sfx: { intro: 'boing', cut: 'swish', pop: 'pop', type: 'impact', cell: 'thud', end: 'sparkle' },
    ink: '#ffffff', hl: '#ffd400', chip1: '#e8202a', chip2: '#9e0f15', card: '#ffffff', cardInk: '#e8202a', dark: 'rgba(0,0,0,0.85)',
  },
  bubble: {
    name: '泡泡糖', group: '综艺活泼', desc: '大小圆泡泡漂着 · 白色药丸字幕', bgm: 'chip@6', frame: 'bubbles', cut: 'section', cellGap: 0.2,
    typeRate: 0.4, type: 'pop', grade: 'pastel', bg: 'candy', title: 'bubble', sub: 'pill', subY: 1650, deco: 'bubble', trans: ['burst', 'zoom'], chip: 'sticker',
    sfx: { intro: 'sparkle', cut: 'boing', pop: 'pop', type: 'sparkle', cell: 'pop', end: 'sparkle' },
    ink: '#ffffff', hl: '#fff07a', chip1: '#ff5fa2', chip2: '#b8327a', card: '#ffffff', cardInk: '#b8327a', dark: 'rgba(70,20,70,0.82)', bg1: '#ffb3d1', bg2: '#c9b6ff',
  },
  brutal: {
    name: '潮流撞色', group: '综艺活泼', desc: '纯色底 + 黑粗边硬阴影 · 贴纸转圈', bgm: 'house@1', frame: 'brutal', cut: 'line', rotate: true, cellGap: 0.25,
    typeRate: 0.4, type: 'brutal', grade: 'pop', bg: 'flat', title: 'brutal', sub: 'brutal', subY: 1620, deco: 'brutal', trans: ['page', 'shake'], chip: 'flat',
    sfx: { intro: 'thud', cut: 'snap', sub: 'snap', subGain: 0.3, pop: 'pop', type: 'thud', cell: 'thud', end: 'ding' },
    ink: '#ffffff', hl: '#c6ff3d', chip1: '#7b3dff', chip2: '#4a1fb0', card: '#ffffff', cardInk: '#4a1fb0', dark: 'rgba(0,0,0,0.88)',
  },
  live: {
    name: '直播间', group: '综艺活泼', desc: '直播界面 · 主播消息滚动 · 飘爱心', bgm: 'pop@5', frame: 'full', cut: 'line', shade: true,
    typeRate: 0, grade: 'fresh', bg: 'black', title: 'notice', sub: 'live', subAlways: true, subY: 1640, deco: 'live', trans: ['zoom'], chip: 'sticker',
    ov: { s: 0.86, cy: 900, dy: -120 },
    sfx: { intro: 'heart', cut: 'swish', sub: 'msg', subGain: 0.35, pop: 'heart', type: 'heart', cell: 'pop', end: 'heart' }, lineSfx: true,
    ink: '#ffffff', hl: '#ffd23f', chip1: '#ff2d55', chip2: '#b3123a', card: '#ffffff', cardInk: '#ff2d55', dark: 'rgba(0,0,0,0.6)',
  },
  swipe: {
    name: '卡片滑动', group: '综艺活泼', desc: '一摞卡片 · 一句甩走一张 · 清新配色', bgm: 'uke@6', frame: 'cards', cut: 'line',
    typeRate: 0.3, type: 'paper', grade: 'pastel', bg: 'pastel', title: 'card', sub: 'pill', subY: 1620, deco: 'cards', trans: ['zoom'], chip: 'sticker',
    ov: { s: 0.85, cy: 900, dy: -40 },
    sfx: { intro: 'pop', cut: 'swipe', sub: 'swipe', subGain: 0.45, pop: 'pop', type: 'paper', cell: 'pop', end: 'sparkle' },
    ink: '#ffffff', hl: '#ffe066', chip1: '#2fb8a0', chip2: '#1d7f6e', card: '#ffffff', cardInk: '#1d7f6e', dark: 'rgba(20,50,60,0.82)',
  },
  // ---------------- 图文笔记 ----------------
  mag: {
    name: '杂志画报', group: '图文笔记', desc: '纸张底 + 卡片照片 · 四宫格拼贴', bgm: 'warm', bleed: false, layouts: { single: ['card'], montage: ['grid4', 'stack', 'trio', 'split2'] }, typeRate: 0.55, subcut: false,
    grade: 'warm', bg: 'paper', title: 'mag', sub: 'ink', subY: 1530, trans: ['page', 'drop'], deco: 'mag', chip: 'flat', themed: true,
    sfx: { intro: 'shutter', cut: 'paper', pop: 'click', type: 'paper', cell: 'shutter', end: 'ding' },
    ink: '#ffffff', hl: '#ff6f3c', chip1: '#ff6f3c', chip2: '#e04e1c', card: '#ffffff', cardInk: '#e04e1c', dark: 'rgba(29,26,22,0.88)', paper: '#f4eee4', paperInk: '#1f1b16', bg1: '#e9e1d3', bg2: '#d9cfbe',
  },
  note: {
    name: '种草笔记', group: '图文笔记', desc: '上图下文 · 一句滑一张图 · 像发笔记', bgm: 'uke@1', frame: 'note', cut: 'line',
    typeRate: 0, grade: 'fresh', bg: 'solid', bgColor: '#ffffff', title: 'none', sub: 'note', subY: 1560, deco: 'note', trans: [], chip: 'sticker', themed: true,
    ov: { s: 0.8, cy: 620, dy: 0 },
    sfx: { intro: 'pop', cut: 'swipe', sub: 'swipe', subGain: 0.4, pop: 'pop', type: 'pop', cell: 'pop', end: 'heart' },
    ink: '#ffffff', hl: '#ffe14d', chip1: '#ff2442', chip2: '#c4122c', card: '#ffffff', cardInk: '#ff2442', dark: 'rgba(30,30,36,0.85)',
  },
  scrap: {
    name: '手帐拼贴', group: '图文笔记', desc: '方格纸 + 拍立得 + 胶带涂鸦', bgm: 'uke@3', frame: 'scrap', cut: 'section', cellGap: 0.35,
    typeRate: 0.35, type: 'paper', grade: 'warm', bg: 'grid', title: 'hand', sub: 'hand', subY: 1700, deco: 'scrap', trans: ['drop', 'page'], chip: 'sticker',
    ov: { s: 0.85, cy: 900, dy: 0 },
    sfx: { intro: 'tape', cut: 'tape', pop: 'pop', type: 'paper', cell: 'shutter', end: 'sparkle' },
    ink: '#ffffff', hl: '#ffd36e', chip1: '#ef6f6c', chip2: '#b8423f', card: '#ffffff', cardInk: '#b8423f', dark: 'rgba(60,45,35,0.85)',
  },
  post: {
    name: '朋友圈动态', group: '图文笔记', desc: '一段一条动态 · 往上刷着看', bgm: 'lofi@0', frame: 'post', cut: 'section',
    typeRate: 0, grade: 'fresh', bg: 'feed', title: 'feedHead', sub: 'caption', subY: 1540, deco: 'none', trans: [], chip: 'sticker', themed: true,
    ov: { s: 0.82, cy: 960, dy: 0 },
    sfx: { intro: 'msg', cut: 'swipe', pop: 'heart', type: 'pop', cell: 'pop', end: 'heart' },
    ink: '#ffffff', hl: '#ffd23f', chip1: '#3d7bff', chip2: '#1f4fc4', card: '#ffffff', cardInk: '#1f4fc4', dark: 'rgba(25,30,40,0.85)',
  },
  chat: {
    name: '聊天记录', group: '图文笔记', desc: '像聊天一样发图发消息 · 一条条往上顶', bgm: 'lofi@3', frame: 'chat', cut: 'section', ov: false,
    typeRate: 0, grade: 'fresh', bg: 'solid', bgColor: '#e9ebef', title: 'none', sub: 'none', subY: 1600, deco: 'chat', trans: [], chip: 'sticker',
    sfx: { intro: 'msg', cut: 'msg', sub: 'msg', subGain: 0.4, pop: 'msg', type: 'msg', cell: 'pop', end: 'ding' }, lineSfx: true,
    ink: '#ffffff', hl: '#ffd23f', chip1: '#2f7bf6', chip2: '#1a56c0', card: '#ffffff', cardInk: '#1a56c0', dark: 'rgba(25,30,40,0.85)', bubble: '#2f7bf6',
  },
  paper: {
    name: '报纸头条', group: '图文笔记', desc: '报头 + 黑白大照片 + 引语框', bgm: 'story@2', frame: 'paper', cut: 'section',
    typeRate: 0.35, type: 'extra', grade: 'news', bg: 'news', title: 'none', sub: 'pull', subY: 1660, deco: 'paper', trans: ['page'], chip: 'flat',
    ov: { s: 0.8, cy: 860, dy: 0 },
    sfx: { intro: 'paper', cut: 'paper', pop: 'click', type: 'thud', cell: 'click', end: 'ding' },
    ink: '#ffffff', hl: '#ffd400', chip1: '#c8161f', chip2: '#8e0e15', card: '#ffffff', cardInk: '#c8161f', dark: 'rgba(22,19,15,0.9)',
  },
  // ---------------- 电影质感 ----------------
  cinema: {
    name: '电影叙事', group: '电影质感', desc: '上下黑边宽银幕 · 字一个个浮现', bgm: 'story', bleed: false, layouts: { single: ['letter'], montage: ['letter', 'letter2'] }, typeRate: 0.7, subcut: false,
    grade: 'film', bg: 'black', title: 'cine', sub: 'cine', subY: 1560, trans: ['fade', 'iris', 'blinds'], deco: 'cine', chip: 'outline',
    sfx: { intro: 'boom', cut: 'whoosh', cutGain: 0.35, pop: 'click', type: 'boom', cell: 'click', end: 'boom' },
    ink: '#ffffff', hl: '#f1d39a', chip1: '#3a3328', chip2: '#1e1a14', card: '#f6efe2', cardInk: '#7a5a2a', dark: 'rgba(0,0,0,0.78)', bg1: '#141414', bg2: '#050505',
  },
  film: {
    name: '胶片放映', group: '电影质感', desc: '竖着走的胶片条 · 暖黄字幕 · 颗粒', bgm: 'story@4', frame: 'filmstrip', cut: 'line',
    typeRate: 0.4, type: 'leader', grade: 'amber', bg: 'film', title: 'film', sub: 'film', subY: 1520, deco: 'film', trans: ['fade'], chip: 'outline',
    ov: { s: 0.82, cy: 900, dy: 0 },
    sfx: { intro: 'shutter', cut: 'shutter', sub: 'click', subGain: 0.3, pop: 'click', type: 'boom', cell: 'click', end: 'boom' },
    ink: '#ffffff', hl: '#ffb347', chip1: '#3b2a1a', chip2: '#1e150c', card: '#f6efe2', cardInk: '#8a5a20', dark: 'rgba(20,14,8,0.85)',
  },
  docu: {
    name: '纪录片', group: '电影质感', desc: '整屏慢推 · 片名卡 · 人名条 · 叠化', bgm: 'warm@6', frame: 'full', cut: 'section', noHookOv: true,
    typeRate: 0.25, type: 'cine', grade: 'teal', bg: 'black', title: 'doc', sub: 'doc', subY: 1710, deco: 'doc', trans: ['dissolve'], chip: 'outline',
    sfx: { intro: 'boom', introGain: 0.5, cut: 'whoosh', cutGain: 0.22, pop: 'click', type: 'boom', cell: 'click', end: 'chime' },
    ink: '#ffffff', hl: '#f2c46d', chip1: '#2c3a40', chip2: '#151d20', card: '#f6efe2', cardInk: '#7a5a2a', dark: 'rgba(0,0,0,0.75)',
  },
  mono: {
    name: '黑白留白', group: '电影质感', desc: '黑白画面 + 大段留白 · 左对齐大字', bgm: 'warm@3', frame: 'mono', cut: 'line',
    typeRate: 0.45, type: 'mono', grade: 'mono', bg: 'black', title: 'mono', sub: 'monoBig', subY: 1460, deco: 'mono', trans: ['fade', 'dissolve'], chip: 'outline',
    ov: { s: 0.75, cy: 640, dy: 0 },
    sfx: { intro: 'boom', cut: 'click', sub: 'click', subGain: 0.25, pop: 'click', type: 'thud', cell: 'click', end: 'boom' },
    ink: '#ffffff', hl: '#e8e2d4', chip1: '#2a2a2a', chip2: '#111111', card: '#f4f1ea', cardInk: '#222222', dark: 'rgba(0,0,0,0.85)',
  },
  mask: {
    name: '文字镂空', group: '电影质感', desc: '大字里透出画面 · 圆角大图 · 浅底', bgm: 'house@4', frame: 'mask', cut: 'section',
    typeRate: 0.35, type: 'mask', grade: 'fresh', bg: 'offwhite', title: 'mask', sub: 'dark', subY: 1660, deco: 'mask', trans: ['slideUp'], chip: 'flat', themed: true,
    ov: { s: 0.72, cy: 1150, dy: 0 },
    sfx: { intro: 'whoosh', cut: 'swish', pop: 'pop', type: 'impact', cell: 'swish', end: 'ding' },
    ink: '#ffffff', hl: '#ffd400', chip1: '#ff5a1f', chip2: '#c43d0a', card: '#ffffff', cardInk: '#c43d0a', dark: 'rgba(22,20,15,0.88)',
  },
  gallery: {
    name: '美术馆', group: '电影质感', desc: '挂在墙上的画框 · 展签 · 安静叠化', bgm: 'warm@2', frame: 'gallery', cut: 'section',
    typeRate: 0.3, type: 'museum', grade: 'warm', bg: 'wall', title: 'museum', sub: 'elegant', subY: 1700, deco: 'gallery', trans: ['dissolve'], chip: 'outline',
    ov: { s: 0.75, cy: 960, dy: 0 },
    sfx: { intro: 'chime', cut: 'click', cutGain: 0.3, pop: 'click', type: 'chime', cell: 'click', end: 'chime' },
    ink: '#ffffff', hl: '#d9b46a', chip1: '#5b4a36', chip2: '#33291d', card: '#fbfaf7', cardInk: '#8a5a20', dark: 'rgba(42,37,31,0.88)',
  },
  // ---------------- 复古怀旧 ----------------
  dv: {
    name: 'DV 日记', group: '复古怀旧', desc: '摄像机取景框 · 像素字打字机', bgm: 'chip', bleed: true, layouts: { single: ['full'], montage: ['full', 'stack', 'grid4'] }, typeRate: 0.55, subcut: true,
    grade: 'vhs', bg: 'noise', title: 'dv', sub: 'type', subY: 1450, trans: ['static', 'glitch', 'shake'], deco: 'dv', chip: 'pixel',
    sfx: { intro: 'beep', cut: 'static', sub: 'click', pop: 'click', type: 'key', cell: 'shutter', end: 'beep' },
    ink: '#ffffff', hl: '#7dff9a', chip1: '#161616', chip2: '#000000', card: '#111111', cardInk: '#7dff9a', dark: 'rgba(0,0,0,0.8)', bg1: '#161616', bg2: '#000000',
  },
  tv: {
    name: '老电视', group: '复古怀旧', desc: '木壳电视机 · 换台雪花 · 七十年代墙纸', bgm: 'citypop@1', frame: 'tv', cut: 'section',
    typeRate: 0.3, type: 'tv', grade: 'vhs', bg: 'retro', title: 'tv', sub: 'retro', subY: 1570, deco: 'tv', trans: [], chip: 'flat',
    ov: { s: 0.62, cy: 810, dy: 0 },
    sfx: { intro: 'channel', cut: 'channel', pop: 'beep', type: 'channel', cell: 'click', end: 'ding' },
    ink: '#ffffff', hl: '#ffb000', chip1: '#d9542b', chip2: '#8e3214', card: '#fff3d6', cardInk: '#8e3214', dark: 'rgba(59,36,20,0.88)',
  },
  hk: {
    name: '港风胶片', group: '复古怀旧', desc: '青红调色 + 漏光 · 竖排大字 · 日期戳', bgm: 'citypop@0', frame: 'full', cut: 'line', leak: true,
    typeRate: 0.3, type: 'vert', grade: 'hk', bg: 'black', title: 'vertical', sub: 'film', subY: 1660, subInk: '#fff7c2', subKey: '#ffb347', deco: 'hk', trans: ['fade', 'flash'], chip: 'outline',
    vShadow: true, vInk: '#ffffff', vInk2: '#ffd9a0', typeBg: '#0c0a08', typeInk: '#fff4dc', typeInk2: '#ff6a4d',
    sfx: { intro: 'shutter', cut: 'shutter', sub: 'click', subGain: 0.25, pop: 'click', type: 'boom', cell: 'click', end: 'shutter' },
    ink: '#ffffff', hl: '#ffb347', chip1: '#7a1f1f', chip2: '#4a1010', card: '#fff4dc', cardInk: '#7a1f1f', dark: 'rgba(10,8,6,0.82)',
  },
  guofeng: {
    name: '国风雅韵', group: '复古怀旧', desc: '宣纸水墨 · 月洞窗 · 竖排题字 · 古筝笛子', bgm: 'guofeng@0', frame: 'moon', cut: 'section',
    typeRate: 0.35, type: 'vert', grade: 'ink', bg: 'rice', title: 'vertical', sub: 'ink', subY: 1560, deco: 'moon', trans: ['dissolve'], chip: 'outline',
    vInk: '#2f2118', vInk2: '#6b5340', typeBg: '#f3ecdd', typePaper: true, typeInk: '#2f2118', typeInk2: '#b8322a',
    ov: { s: 0.75, cy: 880, dy: 0 },
    sfx: { intro: 'chime', cut: 'chime', cutGain: 0.3, pop: 'click', type: 'thud', cell: 'click', end: 'chime' },
    ink: '#ffffff', hl: '#d9a441', chip1: '#8c2f24', chip2: '#5a1c15', card: '#fbf6ea', cardInk: '#8c2f24', dark: 'rgba(47,33,24,0.88)',
  },
  // ---------------- 干净专业 ----------------
  news: {
    name: '新闻现场', group: '干净专业', desc: '直播角标 · 字幕条 · 底部滚动新闻条', bgm: 'tech', bleed: true, layouts: { single: ['full', 'pip'], montage: ['side', 'pip', 'split2'] }, typeRate: 0.5, subcut: false,
    grade: 'cool', bg: 'studio', title: 'news', sub: 'bar', subY: 1400, trans: ['sting', 'wipe'], deco: 'news', chip: 'flat',
    sfx: { intro: 'sting', cut: 'swish', pop: 'click', type: 'sting', cell: 'swish', end: 'sting' },
    ink: '#ffffff', hl: '#ffd400', chip1: '#e8202a', chip2: '#a8121a', card: '#ffffff', cardInk: '#c8161f', dark: 'rgba(10,22,48,0.9)', bar: '#0f2a5c', bg1: '#13233f', bg2: '#060c18',
  },
  clean: {
    name: '极简留白', group: '干净专业', desc: '白底 4:5 大图 · 左对齐小字 · 很高级', bgm: 'warm@1', frame: 'clean', cut: 'section',
    typeRate: 0.35, type: 'clean', grade: 'fresh', bg: 'solid', bgColor: '#fafaf8', title: 'clean', sub: 'clean', subY: 1520, deco: 'clean', trans: [], chip: 'flat',
    ov: { s: 0.78, cy: 885, dy: 0 },
    sfx: { intro: 'click', cut: 'swish', cutGain: 0.3, pop: 'click', type: 'click', cell: 'click', end: 'ding' },
    ink: '#ffffff', hl: '#f3d36b', chip1: '#c8442f', chip2: '#8e2a1b', card: '#ffffff', cardInk: '#c8442f', dark: 'rgba(20,20,20,0.85)',
  },
  hud: {
    name: '科技窗口', group: '干净专业', desc: '深蓝网格 · 窗口画面 · 打字机字幕', bgm: 'tech@3', frame: 'window', cut: 'line',
    typeRate: 0.35, type: 'hud', grade: 'cool', bg: 'navy', title: 'hud', sub: 'terminal', subY: 1450, deco: 'hud', trans: ['glitch'], chip: 'outline',
    ov: { s: 0.82, cy: 840, dy: 0 },
    sfx: { intro: 'beep', cut: 'zap', sub: 'key', subGain: 0.4, pop: 'beep', type: 'zap', cell: 'beep', end: 'beep' }, lineSfx: true,
    ink: '#ffffff', hl: '#5ee7ff', chip1: '#123a6b', chip2: '#0a2244', card: '#0b1a36', cardInk: '#5ee7ff', dark: 'rgba(6,16,36,0.9)',
  },
  timeline: {
    name: '时间轴', group: '干净专业', desc: '左边节点一格格走 · 右边画面卡片', bgm: 'pop@2', frame: 'timeline', cut: 'section',
    typeRate: 0.3, type: 'clean', typeBg: '#f3f5fa', grade: 'fresh', bg: 'soft', title: 'tl', sub: 'clean', subX: 190, subY: 1420, deco: 'timeline', trans: [], chip: 'flat', themed: true,
    ov: { s: 0.7, cy: 960, dy: 0 },
    sfx: { intro: 'ding', cut: 'swish', pop: 'pop', type: 'pop', cell: 'pop', end: 'ding' },
    ink: '#ffffff', hl: '#ffd23f', chip1: '#3d7bff', chip2: '#1f4fc4', card: '#ffffff', cardInk: '#1f4fc4', dark: 'rgba(18,24,38,0.85)',
  },
  spread: {
    name: '左右对开', group: '干净专业', desc: '一边纯色竖条写字 · 一边整条画面 · 每段换边', bgm: 'house@5', frame: 'spread', cut: 'section',
    typeRate: 0.3, type: 'mono', grade: 'cool', bg: 'black', title: 'none', sub: 'column', subY: 1330, deco: 'spread', trans: [], chip: 'flat',
    ov: { s: 0.8, cy: 960, dy: 0 },
    sfx: { intro: 'whoosh', cut: 'whoosh', pop: 'click', type: 'thud', cell: 'click', end: 'ding' },
    ink: '#ffffff', hl: '#ffcf33', chip1: '#1d1d1d', chip2: '#000000', card: '#ffffff', cardInk: '#111111', dark: 'rgba(0,0,0,0.85)',
  },
};
const LOOK_IDS = Object.keys(skins);
/** 首页 / 风格面板用：版式分组 */
export const lookGroups = (() => {
  const g = new Map();
  for (const [id, s] of Object.entries(skins)) { if (!g.has(s.group)) g.set(s.group, []); g.get(s.group).push(id); }
  return [...g].map(([name, ids]) => ({ name, ids }));
})();
const TYPE_VIS = new Set(['hook', 'big', 'quote', 'stamp', 'stat']);
const NEED = { full: 1, card: 1, letter: 1, circle: 1, pip: 2, split2: 2, side: 2, letter2: 2, trio: 3, stack: 3, grid4: 4, type: 0 };
const CELL_GAP = 0.28; // 拼图里每个格子依次出现的间隔
/** 新版式每个镜头同时要几个画面 */
const FRAME_NEED = { tri: 3, slash: 2, grid9: 9, comic: (n) => Math.min(3, Math.max(1, n)), scrap: (n) => (n >= 2 ? 2 : 1), bubbles: (n) => Math.min(3, Math.max(1, n)), brutal: (n) => (n >= 2 ? 2 : 1) };
const needOf = (frame, poolN) => { const v = FRAME_NEED[frame]; return typeof v === 'function' ? v(poolN) : v || 1; };

const seedOf = (script) => Number(script.seed) || 1;
const lookOf = (script, skinId) => (skins[skinId] ? skinId : skins[script.look] ? script.look : 'bold');
/** 这条视频背景音乐的“曲风@变奏”：客户在声音里挑过曲风就用他挑的 */
const bgmOfScript = (script, look) => script.bgm || look.bgm;

// ---------- 时间规划 ----------
const itemCount = (v) => {
  switch (v?.type) {
    case 'chips': case 'steps': case 'checklist': return (v.items || []).length;
    case 'hook': case 'big': case 'compare': case 'nametag': case 'location': case 'cta': case 'qa': case 'stat': return 2;
    case 'stamp': return v.note ? 2 : 1;
    case 'shot': return 0;
    default: return 1;
  }
};
export function plan(script, tl) {
  return script.sections.map((s, i) => {
    const sec = tl.sections[i]; const next = tl.sections[i + 1];
    const n = itemCount(s.visual);
    const a = sec.start + 0.3;
    const b = Math.max(a + 0.4, sec.lines.length > 1 ? sec.lines[sec.lines.length - 1].start + 0.2 : sec.lines[0].end - 0.8);
    const steps = [];
    for (let k = 0; k < n; k++) steps.push(n === 1 ? a : a + ((b - a) * k) / Math.max(1, n - 1));
    return { start: sec.start, end: next ? next.start : tl.duration, lineEnd: sec.end, steps };
  });
}
function currentIdx(planData, t) {
  let idx = planData.findIndex((pd) => t >= pd.start && t < pd.end);
  if (idx < 0) idx = t < (planData[0]?.start ?? 0) ? 0 : planData.length - 1;
  return idx;
}

// ---------- 每个镜头怎么摆 ----------
const poolOf = (assets) => ((assets?.pool?.length ? assets.pool : assets?.media) || []).filter(Boolean);
function rawLayout(script, look, idx, poolN) {
  const v = script.sections[idx]?.visual?.type || 'shot';
  if (TYPE_VIS.has(v) && (v === 'hook' || hash(seedOf(script) * 0.001 + idx * 1.7) < look.typeRate)) return 'type';
  const list = v === 'shot' && poolN >= 2 ? look.layouts.montage : look.layouts.single;
  const L = list[Math.floor(hash(seedOf(script) * 0.002 + idx * 3.3) * list.length)];
  return poolN >= NEED[L] ? L : look.layouts.single[0];
}
function layoutOf(script, look, idx, poolN) {
  if (look.frame) {
    // 新版式：讲观点的镜头按概率变成大字画面，其余都按这套版式摆
    const v = script.sections[idx]?.visual?.type || 'shot';
    if (!look.typeRate || !TYPE_VIS.has(v)) return look.frame;
    if (v === 'hook') return look.hookType ? 'type' : look.frame;
    return hash(seedOf(script) * 0.001 + idx * 1.7) < look.typeRate ? 'type' : look.frame;
  }
  let L = rawLayout(script, look, idx, poolN);
  // 相邻两个镜头别用同一种拼法
  if (L !== 'type' && idx > 0 && L === rawLayout(script, look, idx - 1, poolN)) {
    const v = script.sections[idx]?.visual?.type;
    const list = v === 'shot' && poolN >= 2 ? look.layouts.montage : look.layouts.single;
    const alt = list.filter((x) => x !== L && poolN >= NEED[x]);
    if (alt.length) L = alt[Math.floor(hash(idx * 5.1) * alt.length)];
  }
  return L;
}
/** 这个镜头能用的画面顺序：自己那张打头，其余按随机种子排好（一句一换、卡点换、拼图都从这里依次取，不重样） */
function seqOf(script, pool, main, idx) {
  const rest = pool.filter((x) => x !== main).map((m, k) => [hash(seedOf(script) * 0.0007 + idx * 7.31 + k * 2.17), m]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const s = main ? [main, ...rest] : rest;
  return s.length ? s : [null];
}
/** 这个镜头里在哪些时间点换画面 */
function cutTimes(data, look, idx, layout) {
  const { script, tl, planData } = data; const sec = tl.sections[idx]; const p = planData[idx];
  if (layout === 'type' || !sec || !p) return [];
  const mode = look.frame ? look.cut : (look.subcut && layout === 'full' ? 'line' : 'section');
  if (mode === 'line') return sec.lines.slice(1).map((l) => l.start - 0.05);
  if (mode === 'beat') {
    const bpm = bgmTempo(bgmOfScript(script, look)) || 120; const iv = (60 / bpm) * (look.beats || 2);
    const out = []; for (let x = Math.ceil((p.start + iv * 0.6) / iv) * iv; x < p.end - iv * 0.45; x += iv) out.push(x);
    return out;
  }
  return [];
}
/** 这一刻这个镜头里有哪些画面：{layout, items:[{m, lane, start, prev, cutAt, still}], cutAt, cutK, seq} */
function sceneOf(data, look, idx, t = data.t) {
  const { script, planData, assets } = data;
  const pool = poolOf(assets);
  const p = planData[idx];
  const main = assets?.media?.[idx] || pool[idx % Math.max(1, pool.length)] || null;
  const seq = seqOf(script, pool, main, idx);
  const layout = layoutOf(script, look, idx, pool.length);
  if (layout === 'type') {
    const show = !look.frame ? (look.bg === 'paper' || look.bg === 'dots') : look.type === 'mask';
    return { layout, items: show ? [{ m: main, lane: 0, start: p.start }] : [], cutAt: p.start, cutK: 0, seq };
  }
  const n = look.frame ? needOf(look.frame, pool.length) : NEED[layout];
  const cuts = cutTimes(data, look, idx, layout);
  const cutK = cuts.filter((x) => t >= x).length;
  const rotate = look.rotate && n > 1;
  const L = seq.length;
  const items = [];
  for (let c = 0; c < n; c++) {
    // 这个格子被换过几次：轮换模式下第 j 刀只换第 j % n 格，其余模式每一刀都换第 0 格
    const mine = cuts.map((x, j) => [x, j + 1]).filter(([, j]) => (rotate ? j % n === c : c === 0));
    const done = mine.filter(([x]) => t >= x);
    const v = done.length;
    const at = (vv) => seq[(c + vv * n) % L];
    const stagger = look.frame ? (look.cellGap ? c * look.cellGap : 0) : c * CELL_GAP;
    items.push({
      m: at(v), lane: c, start: v ? done[v - 1][0] + 0.05 : p.start + stagger,
      prev: v ? at(v - 1) : null, cutAt: v ? done[v - 1][0] : null,
      still: look.frame === 'grid9' && c !== 4,
    });
  }
  return { layout, items, cutAt: cutK ? cuts[cutK - 1] + 0.05 : p.start, cutK, seq };
}

// ---------- 背景（老版式：拼图、卡片、大字画面露出来的地方） ----------
function drawBg(ctx, look, skin, t, tEmoji) {
  switch (look.bg) {
    case 'paper':
      ctx.fillStyle = skin.paper; ctx.fillRect(0, 0, W, H);
      if (tEmoji) drawWallpaper(ctx, tEmoji, t, { w: W, h: H, alpha: 0.06, step: 260, size: 80, speed: 10 });
      grain(ctx, { x: 0, y: 0, w: W, h: H }, 0, 0.05, 'multiply');
      break;
    case 'stripes': {
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = skin.hl; ctx.translate(((t * 80) % 120), 0);
      for (let x = -H; x < W + 120; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 50 + H * 0.6, H); ctx.lineTo(x + H * 0.6, H); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'studio': {
      ctx.fillStyle = grad(ctx, 0, H, '#0c2350', '#040b1c'); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(120,170,255,0.08)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = (t * 30) % 90 - 90; x < W; x += 90) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += 90) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const sx = ((t * 0.3) % 1) * (W + 600) - 300; const g = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(140,190,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'noise': ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H); grain(ctx, { x: 0, y: 0, w: W, h: H }, t, 0.22, 'source-over'); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H); break;
    case 'dots': {
      ctx.fillStyle = grad(ctx, 0, H, skin.chip1, skin.chip2); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      const off = (t * 40) % 80;
      for (let y = -80 + off; y < H + 80; y += 80) for (let x = (Math.round((y - off) / 80) % 2 ? 40 : 0) - 40; x < W + 80; x += 80) { ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    default: ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- 构图：格子在哪（老版式） ----------
function cellsOf(layout, look, idx) {
  const tilt = (k) => (look.bg === 'dots' ? (hash(idx * 3 + k) - 0.5) * 0.12 : look.bg === 'paper' ? (hash(idx * 3 + k) - 0.5) * 0.05 : 0);
  const B = look.bleed;
  // 不贴边的版式：画面放在标题和字幕之间
  const T = 430; const Bt = look.bg === 'paper' ? 1400 : 1340; const X = 70; const CW = W - 140; const CH = Bt - T;
  switch (layout) {
    case 'full': return [{ x: 0, y: 0, w: W, h: H, r: 0 }];
    case 'letter': return [{ x: 0, y: 470, w: W, h: 960, r: 0 }];
    case 'letter2': return [{ x: 0, y: 440, w: W, h: 500, r: 0 }, { x: 0, y: 950, w: W, h: 500, r: 0 }];
    case 'card': return [{ x: X + 20, y: T + 10, w: CW - 40, h: CH - 20, r: 26, rot: (idx % 2 ? 1 : -1) * 0.02, frame: true }];
    case 'circle': return [{ x: W / 2 - 400, y: 520, w: 800, h: 800, circle: true, frame: true }];
    case 'pip': return [{ x: 0, y: 0, w: W, h: H, r: 0 }, { x: W - 420, y: 440, w: 360, h: 420, r: 18, frame: true }];
    case 'split2': return B ? [{ x: 0, y: 0, w: W, h: H / 2 - 4, r: 0 }, { x: 0, y: H / 2 + 4, w: W, h: H / 2 - 4, r: 0 }]
      : [{ x: X, y: T, w: CW, h: CH / 2 - 12, r: 20, rot: tilt(0), frame: true }, { x: X, y: T + CH / 2 + 12, w: CW, h: CH / 2 - 12, r: 20, rot: tilt(1), frame: true }];
    case 'side': return [{ x: 0, y: 0, w: W / 2 - 4, h: H, r: 0 }, { x: W / 2 + 4, y: 0, w: W / 2 - 4, h: H, r: 0 }];
    case 'trio': return B ? [{ x: 0, y: 0, w: W, h: H * 0.56, r: 0 }, { x: 0, y: H * 0.56 + 8, w: W / 2 - 4, h: H * 0.44 - 8, r: 0 }, { x: W / 2 + 4, y: H * 0.56 + 8, w: W / 2 - 4, h: H * 0.44 - 8, r: 0 }]
      : [{ x: X, y: T, w: CW, h: CH * 0.58, r: 20, rot: tilt(0), frame: true }, { x: X, y: T + CH * 0.58 + 20, w: CW / 2 - 10, h: CH * 0.42 - 20, r: 20, rot: tilt(1), frame: true }, { x: X + CW / 2 + 10, y: T + CH * 0.58 + 20, w: CW / 2 - 10, h: CH * 0.42 - 20, r: 20, rot: tilt(2), frame: true }];
    case 'grid4': return B ? [0, 1, 2, 3].map((k) => ({ x: (k % 2) * (W / 2 + 4), y: Math.floor(k / 2) * (H / 2 + 4), w: W / 2 - 4, h: H / 2 - 4, r: 0 }))
      : [0, 1, 2, 3].map((k) => ({ x: X + (k % 2) * (CW / 2 + 10), y: T + Math.floor(k / 2) * (CH / 2 + 10), w: CW / 2 - 10, h: CH / 2 - 10, r: 18, rot: tilt(k), frame: true }));
    case 'stack': return [0, 1, 2].map((k) => ({ x: 190 + [0, 120, 40][k], y: 460 + [0, 80, 170][k], w: 580, h: 600, r: 4, rot: [-0.09, 0.07, -0.02][k], polaroid: true }));
    default: return [{ x: 0, y: 0, w: W, h: H, r: 0 }];
  }
}
function drawCell(ctx, look, skin, cell, it, k, p, t, idx, label) {
  const appear = it.start; const e = clamp((t - appear) / 0.3);
  if (k > 0 && e <= 0) return;
  const img = imageOf(it, t); const video = isClip(it.m);
  const cx = cell.x + cell.w / 2; const cy = cell.y + cell.h / 2;
  ctx.save();
  // 格子入场：贴边的从旁边滑进来，带框的弹出来
  if (k > 0) {
    if (look.bleed && !cell.frame && !cell.polaroid) ctx.translate((k % 2 ? 1 : -1) * cell.w * (1 - easeOut(e)), 0);
    else { const s = pop(t, appear, 0.3); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.globalAlpha *= clamp(e * 2); }
  }
  if (cell.rot) { ctx.translate(cx, cy); ctx.rotate(cell.rot); ctx.translate(-cx, -cy); }
  if (cell.polaroid) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(cell.x - 22, cell.y - 22, cell.w + 44, cell.h + 100); ctx.shadowColor = 'transparent';
  } else if (cell.frame) {
    const sticker = look.bg === 'dots';
    ctx.shadowColor = sticker ? 'rgba(120,0,60,0.45)' : 'rgba(40,30,20,0.3)'; ctx.shadowBlur = sticker ? 0 : 34; ctx.shadowOffsetY = 14; ctx.shadowOffsetX = sticker ? 10 : 0;
    const bw = sticker ? 14 : 10;
    ctx.fillStyle = '#ffffff';
    if (cell.circle) { ctx.beginPath(); ctx.arc(cx, cy, cell.w / 2 + bw, 0, Math.PI * 2); ctx.fill(); } else { rr(ctx, cell.x - bw, cell.y - bw, cell.w + bw * 2, cell.h + bw * 2, (cell.r || 0) + bw); ctx.fill(); }
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0;
  }
  ctx.beginPath();
  if (cell.circle) ctx.arc(cx, cy, cell.w / 2, 0, Math.PI * 2); else if (cell.r) ctx.roundRect(cell.x, cell.y, cell.w, cell.h, cell.r); else ctx.rect(cell.x, cell.y, cell.w, cell.h);
  ctx.clip();
  if (img) {
    const dur = Math.max(0.5, p.end - p.start); const [z, ox] = motion(video, idx * 4 + k, clamp((t - p.start) / dur));
    const [iw, ih] = dims(img);
    if (cell.w === W && cell.h === H && iw / ih > 1.15) {
      // 横屏素材放整屏：上下模糊垫底，中间完整画面
      blurFill(ctx, img, 0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      const s = (W / iw) * 1.18 * z; ctx.drawImage(img, W / 2 - (iw * s) / 2, 760 - (ih * s) / 2, iw * s, ih * s);
    } else coverIn(ctx, img, cell, z, ox * (cell.w / W));
    gradeIt(ctx, look.grade, cell, t);
  } else drawPlaceholder(ctx, label, cell);
  ctx.restore();
  // 新闻分屏：每路画面一个角标
  if (look.deco === 'news' && (cell.w < W || cell.h < H) && (k === 0 || e > 0)) {
    font(ctx, 30, 900); const tag = cell.frame ? '现场' : `画面 ${'ABCD'[k]}`; const tw = ctx.measureText(tag).width + 30;
    const ty = cell.y + (cell.y === 0 ? 150 : 16);
    ctx.fillStyle = skin.chip1; ctx.fillRect(cell.x + 16, ty, tw, 46); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tag, cell.x + 31, ty + 24);
  }
}

// ---------- 大字画面（老版式：讲观点的镜头，不放素材，字就是画面） ----------
function drawTypeScene(ctx, look, skin, sec, p, t, idx, it, tEmoji) {
  const v = sec.visual; const parts = typeParts(v); const st = p.steps;
  const at = (k) => st[k] ?? (p.start + 0.25 + k * 0.45);
  const cx = W / 2;
  switch (look.title) {
    case 'band': { // 爆款：黑底黄条，一行一行砸下来，屏幕震
      const rows = parts.flatMap((s, k) => chunk(s, 6).map((r) => [r, k]));
      const lh = 190; const y0 = 960 - ((rows.length - 1) * lh) / 2;
      const hitK = rows.reduce((m, [, k], j) => (t >= at(k) + j * 0.12 ? j : m), -1);
      const shake = hitK >= 0 ? Math.max(0, 1 - (t - (at(rows[hitK][1]) + hitK * 0.12)) / 0.25) : 0;
      ctx.save(); ctx.translate(Math.sin(t * 90) * 14 * shake, Math.cos(t * 70) * 10 * shake);
      rows.forEach(([r, k], j) => {
        const t0 = at(k) + j * 0.12; if (t < t0) return;
        const e = clamp((t - t0) / 0.16); const sc = 2.2 - 1.2 * easeOut(e); const y = y0 + j * lh;
        const size = fitSlant(ctx, r, 170, W - 120);
        ctx.save(); ctx.translate(cx, y); ctx.scale(sc, sc); ctx.globalAlpha = clamp(e * 3);
        if (k % 2) { font(ctx, size, 900); const w = ctx.measureText(r).width * 0.92; ctx.save(); ctx.transform(1, 0, SKEW, 1, 0, 0); ctx.fillStyle = skin.hl; ctx.fillRect(-w / 2 - 30, -size * 0.62, w + 60, size * 1.24); ctx.restore(); slantText(ctx, r, 0, 0, size, '#0a0a0a'); }
        else slantText(ctx, r, 0, 0, size, '#ffffff', { stroke: size * 0.1, strokeColor: '#000' });
        ctx.restore();
      });
      ctx.restore();
      break;
    }
    case 'mag': { // 杂志：巨大的段号 + 大字 + 一张小照片斜贴着
      font(ctx, 420, 900); ctx.fillStyle = skin.hl; ctx.globalAlpha = 0.16; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(idx + 1).padStart(2, '0'), 40, 860); ctx.globalAlpha = 1;
      const rows = parts.flatMap((s, k) => chunk(s, 7).map((r) => [r, k]));
      rows.forEach(([r, k], j) => {
        const e = easeOut(clamp((t - at(k) - j * 0.1) / 0.4)); if (e <= 0) return;
        const y = 700 + j * 130; const size = fitFont(ctx, r, k ? 92 : 104, W - 160, 900);
        ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 30);
        if (k) { const w = ctx.measureText(r).width; ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.3; ctx.fillRect(74, y + size * 0.05, w * e, size * 0.4); ctx.globalAlpha = e; }
        ctx.fillStyle = skin.paperInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(r, 80, y); ctx.restore();
      });
      const img = imageOf(it, t);
      if (img) {
        const e = pop(t, p.start + 0.5, 0.35); if (e > 0) withPop(ctx, e, 760, 1180, () => {
          ctx.save(); ctx.translate(760, 1180); ctx.rotate(0.07);
          ctx.shadowColor = 'rgba(40,30,20,0.35)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10; ctx.fillStyle = '#fff'; ctx.fillRect(-190, -150, 380, 330); ctx.shadowColor = 'transparent';
          const box = { x: -170, y: -130, w: 340, h: 250 };
          ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip(); coverIn(ctx, img, box); gradeIt(ctx, look.grade, box, t); ctx.restore();
          ctx.restore();
        });
      }
      break;
    }
    case 'cine': { // 电影：黑场白字，一个字一个字浮现
      if (sec.label) { const a = clamp((t - p.start) / 0.5); ctx.globalAlpha = a * 0.6; fitFont(ctx, `— ${sec.label} —`, 32, W - 200, 700, 10); ctx.fillStyle = skin.hl; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`— ${sec.label} —`, cx, 760); ctx.globalAlpha = 1; ctx.letterSpacing = '0px'; }
      const rows = parts.flatMap((s, k) => chunk(s, 9).map((r) => [r, k]));
      rows.forEach(([r, k], j) => {
        const y = 900 + j * 110; const size = k ? 52 : 70;
        fitFont(ctx, r, size, W - 160, k ? 700 : 900); const chars = [...r];
        const total = chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + 8 * (chars.length - 1); let x = cx - total / 2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        chars.forEach((ch, ci) => { const a = clamp((t - at(k) - j * 0.2 - ci * 0.06) / 0.4); ctx.globalAlpha = a; ctx.fillStyle = k ? skin.hl : '#f4f0e8'; ctx.fillText(ch, x, y + (1 - a) * 10); x += ctx.measureText(ch).width + 8; });
        ctx.globalAlpha = 1;
      });
      grain(ctx, { x: 0, y: 0, w: W, h: H }, t, 0.08);
      break;
    }
    case 'news': { // 新闻：红色横幅扫过 + 白字大标题块
      const e0 = easeOut(clamp((t - p.start) / 0.35));
      ctx.fillStyle = skin.chip1; ctx.fillRect(0, 640, W * e0, 150); ctx.fillStyle = skin.hl; ctx.fillRect(0, 790, W * e0, 12);
      font(ctx, 96, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.type === 'quote' ? '原话' : v.type === 'stat' ? '数据' : '快讯', 70 - (1 - e0) * 300, 718);
      font(ctx, 40, 700); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'right'; ctx.fillText('BREAKING', W - 70, 720);
      const rows = parts.flatMap((s, k) => chunk(s, 8).map((r) => [r, k]));
      rows.forEach(([r, k], j) => {
        const e = easeOut(clamp((t - at(k) - j * 0.1) / 0.35)); if (e <= 0) return;
        const y = 900 + j * 140; fitFont(ctx, r, 92, W - 180, 900); const w = ctx.measureText(r).width + 70;
        ctx.save(); ctx.beginPath(); ctx.rect(60, y - 64, w * e, 128); ctx.clip();
        ctx.fillStyle = k ? skin.hl : '#ffffff'; ctx.fillRect(60, y - 64, w, 128);
        ctx.fillStyle = '#0b1838'; ctx.textAlign = 'left'; ctx.fillText(r, 95, y + 4); ctx.restore();
      });
      break;
    }
    case 'dv': { // DV：黑屏打字机
      pixelFont(ctx, 40); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('PLAY ▶', 110, 640);
      const rows = parts.flatMap((s, k) => chunk(s, 8).map((r) => [r, k]));
      let cur = null;
      rows.forEach(([r, k], j) => {
        const s = fitPixel(ctx, r, 100, W - 200); const chars = [...r];
        const n = Math.floor(clamp((t - at(k) - j * 0.3) / Math.max(0.3, chars.length * 0.07)) * chars.length);
        const y = 820 + j * 140; ctx.textAlign = 'left';
        const txt = chars.slice(0, n).join(''); ctx.fillStyle = k ? skin.hl : '#ffffff'; ctx.fillText(txt, 110, y);
        if (n > 0) cur = [110 + ctx.measureText(txt).width + 8, y, s];
      });
      if (cur && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = skin.hl; ctx.fillRect(cur[0], cur[1] - cur[2] * 0.45, cur[2] * 0.55, cur[2] * 0.9); }
      break;
    }
    case 'pop': { // 综艺：旋转放射光 + 花字一行行弹出来
      ctx.save(); ctx.translate(cx, 960); ctx.rotate(t * 0.4);
      for (let k = 0; k < 16; k++) { ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(255,225,77,0.22)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1600, (k * Math.PI) / 8, ((k + 1) * Math.PI) / 8); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      const rows = parts.flatMap((s, k) => chunk(s, 6).map((r) => [r, k]));
      const y0 = 960 - ((rows.length - 1) * 170) / 2;
      rows.forEach(([r, k], j) => {
        const s = pop(t, at(k) + j * 0.15, 0.3); if (s <= 0) return;
        const y = y0 + j * 170 + Math.sin(t * 5 + j) * 6;
        ctx.save(); ctx.translate(cx, y); ctx.rotate((j % 2 ? 1 : -1) * 0.04); ctx.scale(s, s);
        flowerText(ctx, r, 0, 0, fitFont(ctx, r, 150, W - 140, 900), k ? skin.hl : '#ffffff', k ? '#5b1a8a' : skin.chip2); ctx.restore();
      });
      const emo = tEmoji || ['✨', '🎉'];
      [[150, 520], [W - 150, 1380]].forEach(([x, y], j) => { const s = pop(t, p.start + 0.3 + j * 0.2, 0.3); if (s > 0) { ctx.save(); ctx.translate(x, y + Math.sin(t * 4 + j) * 12); ctx.scale(s, s); ctx.font = `130px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emo[j % emo.length], 0, 0); ctx.restore(); } });
      break;
    }
    default: break;
  }
}

// ---------- 转场（整个画面，只用当前帧，导出时多线程乱序画帧也不会出错） ----------
const TRANS_DUR = { flash: 0.22, zoom: 0.3, shake: 0.35, whip: 0.28, page: 0.4, drop: 0.38, wipe: 0.38, sting: 0.6, iris: 0.5, blinds: 0.5, fade: 0.55, glitch: 0.32, static: 0.3, burst: 0.4, dissolve: 0.7, slideUp: 0.45 };
function transOf(script, look, idx) {
  if (look.frame) {
    if (!look.trans?.length) return '';
    if (idx === 0) return look.trans.includes('dissolve') || look.trans.includes('fade') ? 'fade' : look.trans[0] === 'glitch' ? 'glitch' : 'zoom';
    return look.trans[Math.floor(hash(seedOf(script) * 0.013 + idx * 3.7) * look.trans.length)];
  }
  if (idx === 0) return look.title === 'cine' ? 'fade' : look.deco === 'dv' ? 'static' : look.title === 'mag' ? 'drop' : 'zoom';
  const list = look.trans; return list[Math.floor(hash(seedOf(script) * 0.013 + idx * 3.7) * list.length)];
}
function transPre(ctx, type, k) {
  const cx = W / 2; const cy = H / 2; const e = easeOut(k);
  if (type === 'zoom') { const z = 1 + 0.26 * (1 - e); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
  else if (type === 'flash') { const z = 1 + 0.06 * (1 - e); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
  else if (type === 'shake') { const a = 1 - k; ctx.translate(Math.sin(k * 46) * 26 * a, Math.cos(k * 39) * 16 * a); ctx.translate(cx, cy); ctx.rotate(Math.sin(k * 30) * 0.015 * a); ctx.scale(1 + 0.07 * a, 1 + 0.07 * a); ctx.translate(-cx, -cy); }
  else if (type === 'whip') ctx.translate(-W * 0.5 * (1 - e), 0);
  else if (type === 'page') ctx.translate(W * (1 - e), 0);
  else if (type === 'drop') { const z = 1.12 - 0.12 * e; ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.globalAlpha = clamp(k * 2.5); }
  else if (type === 'slideUp') { ctx.translate(0, H * 0.18 * (1 - e)); ctx.globalAlpha = clamp(k * 2); }
}
function transPost(ctx, type, k, skin, idx, account) {
  const e = easeOut(k);
  switch (type) {
    case 'flash': ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`; ctx.fillRect(0, 0, W, H); break;
    case 'shake': ctx.fillStyle = `rgba(255,255,255,${0.12 * (1 - k)})`; ctx.fillRect(0, 0, W, H); break;
    case 'whip': { // 甩镜头：几道拖影
      const a = 1 - k; if (a <= 0) break;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const sx = ctx.canvas.width / W;
      for (let j = 1; j <= 3; j++) { ctx.globalAlpha = 0.22 * a; ctx.drawImage(ctx.canvas, j * 60 * a * sx, 0); }
      ctx.restore(); break;
    }
    case 'page': { const x = W * (1 - e); const g = ctx.createLinearGradient(x - 60, 0, x, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = g; ctx.fillRect(x - 60, 0, 60, H); break; }
    case 'wipe': { const x = W * e; ctx.fillStyle = skin.chip1; ctx.fillRect(x, 0, W, H); ctx.fillStyle = skin.hl; ctx.fillRect(x - 14, 0, 14, H); break; }
    case 'sting': { // 新闻转场：斜色带带着账号名扫过
      const x = -W * 1.4 + W * 2.8 * e;
      ctx.save(); ctx.translate(x, H / 2); ctx.rotate(-0.25);
      ctx.fillStyle = skin.bar; ctx.fillRect(-W * 0.7, -330, W * 1.4, 660); ctx.fillStyle = skin.chip1; ctx.fillRect(-W * 0.7, -330, W * 1.4, 80); ctx.fillStyle = skin.hl; ctx.fillRect(-W * 0.7, 250, W * 1.4, 18);
      fitFont(ctx, account, 110, W * 1.1, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(account, 0, 20);
      ctx.restore(); break;
    }
    case 'iris': { const r = Math.hypot(W, H) * 0.55 * e; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, Math.max(1, r), 0, Math.PI * 2, true); ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore(); break; }
    case 'blinds': { const n = 10; const bh = H / n; ctx.fillStyle = '#000'; for (let j = 0; j < n; j++) { const kk = easeOut(clamp((k - j * 0.035) / 0.65)); const h = bh * (1 - kk); ctx.fillRect(0, j * bh + (bh - h) / 2, W, h); } break; }
    case 'fade': ctx.fillStyle = `rgba(0,0,0,${1 - e})`; ctx.fillRect(0, 0, W, H); break;
    case 'static': if (k < 1) { grain(ctx, { x: 0, y: 0, w: W, h: H }, k * 10, 1 - k, 'source-over'); ctx.fillStyle = `rgba(255,255,255,${0.15 * (1 - k)})`; ctx.fillRect(0, 0, W, H); } break;
    case 'glitch': {
      if (k >= 1) break;
      const a = 1 - k;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const sc = ctx.canvas.width / W;
      for (let j = 0; j < 8; j++) {
        const y = hash(idx * 31 + j + Math.floor(k * 9) * 7) * H * sc; const h = (30 + hash(j * 13 + idx) * 120) * sc; const dx = (hash(j * 7 + Math.floor(k * 12)) - 0.5) * 160 * a * sc;
        ctx.drawImage(ctx.canvas, 0, y, ctx.canvas.width, h, dx, y, ctx.canvas.width, h);
      }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = '#ff2a6d'; ctx.fillRect(0, hash(idx + Math.floor(k * 10)) * H, W, 34);
      ctx.fillStyle = '#05d9e8'; ctx.fillRect(0, hash(idx * 3 + Math.floor(k * 10)) * H, W, 20);
      ctx.restore(); break;
    }
    case 'burst': { // 综艺：彩色圆环从中间炸开
      const r1 = Math.hypot(W, H) * 0.6 * e; const r0 = Math.max(0, r1 - 260 * (1 - k));
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, r1, 0, Math.PI * 2); ctx.arc(W / 2, H / 2, r0, 0, Math.PI * 2, true); ctx.fillStyle = skin.hl; ctx.fill('evenodd'); ctx.restore();
      break;
    }
    default: break;
  }
}

// ---------- 标题（老版式，每套一种） ----------
function drawTitle(ctx, look, skin, script, t, account, tEmoji) {
  const [h1, h2] = script.headline || [script.title || '', ''];
  const ap = easeOut(clamp((t - 0.1) / 0.5));
  ctx.save();
  switch (look.title) {
    case 'band': {
      const hs = Math.min(fitSlant(ctx, h1, 96, W - 110), h2 ? fitSlant(ctx, h2, 96, W - 110) : 96);
      const hy = 230; ctx.globalAlpha = ap; ctx.translate(0, (1 - ap) * -40);
      if (h1) slantText(ctx, h1, W / 2, hy, hs, skin.ink, { stroke: hs * 0.16, strokeColor: '#000' });
      if (h2) {
        font(ctx, hs, 900); const w2 = ctx.measureText(h2).width * 0.92;
        ctx.save(); ctx.translate(W / 2 - w2 / 2 - 24, hy + hs * 1.18 - hs * 0.62); ctx.transform(1, 0, SKEW, 1, 0, 0);
        ctx.fillStyle = skin.hl; ctx.fillRect(0, 0, (w2 + 48) * easeOut(clamp((t - 0.3) / 0.4)), hs * 1.24); ctx.restore();
        slantText(ctx, h2, W / 2, hy + hs * 1.18, hs, '#111111');
      }
      break;
    }
    case 'mag': {
      const x = 70; ctx.globalAlpha = ap;
      fitFont(ctx, h1, 52, W - 280, 700); ctx.fillStyle = skin.paperInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(h1, x, 200);
      if (h2) {
        const s = fitFont(ctx, h2, 92, W - 160, 900); const w = ctx.measureText(h2).width;
        ctx.fillStyle = skin.hl; ctx.globalAlpha = ap * 0.35; ctx.fillRect(x - 6, 300, (w + 12) * easeOut(clamp((t - 0.35) / 0.5)), s * 0.42); ctx.globalAlpha = ap;
        ctx.fillStyle = skin.paperInk; ctx.fillText(h2, x, 300);
      }
      ctx.fillStyle = skin.paperInk; ctx.fillRect(x, 375, W - 140, 3);
      if (tEmoji) { ctx.font = `100px ${EMOJI_FONT}`; ctx.textAlign = 'right'; ctx.fillText(tEmoji[0], W - 70, 220); }
      break;
    }
    case 'cine': {
      ctx.globalAlpha = ap;
      fitFont(ctx, h1, 40, W - 300, 700, 12); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h1, W / 2, 230);
      const w1 = ctx.measureText(h1).width;
      ctx.fillStyle = skin.hl; ctx.fillRect(W / 2 - w1 / 2 - 90, 229, 60, 2); ctx.fillRect(W / 2 + w1 / 2 + 30, 229, 60, 2);
      if (h2) { fitFont(ctx, h2, 74, W - 140, 900, 8); ctx.fillStyle = skin.hl; ctx.fillText(h2, W / 2, 330); }
      ctx.letterSpacing = '0px';
      break;
    }
    case 'news': {
      const y = 1560; const e = easeOut(clamp((t - 0.2) / 0.45));
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, W * e, 230); ctx.clip();
      const tw = 170;
      font(ctx, 46, 900); ctx.fillStyle = skin.chip1; ctx.fillRect(40, y, tw, 112); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('现场', 40 + tw / 2, y + 58);
      ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fillRect(40 + tw, y, W - 80 - tw, 112);
      const hl = h1 + (h2 ? ' ' + h2 : '');
      fitFont(ctx, hl, 54, W - 160 - tw, 900); ctx.fillStyle = '#0f1a33'; ctx.textAlign = 'left'; ctx.fillText(hl, 70 + tw, y + 58);
      ctx.fillStyle = skin.bar; ctx.fillRect(40, y + 112, W - 80, 64);
      fitFont(ctx, '@' + account, 32, W - 200, 700); ctx.fillStyle = '#ffffff'; ctx.fillText('@' + account, 70, y + 145);
      ctx.restore();
      break;
    }
    case 'dv': {
      ctx.globalAlpha = ap;
      const s1 = fitPixel(ctx, h1, 60, W - 220); const w1 = ctx.measureText(h1).width;
      const s2 = h2 ? fitPixel(ctx, h2, 84, W - 180) : 0; const w2 = h2 ? ctx.measureText(h2).width : 0;
      const bw = Math.max(w1, w2) + 70; const bh = 60 + s1 + (h2 ? s2 + 30 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W / 2 - bw / 2, 230, bw, bh);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      pixelFont(ctx, s1); ctx.fillStyle = '#ffffff'; ctx.fillText(h1, W / 2, 260 + s1 / 2);
      if (h2) { pixelFont(ctx, s2); ctx.fillStyle = skin.hl; ctx.fillText(h2, W / 2, 290 + s1 + s2 / 2); }
      break;
    }
    case 'pop': {
      const k = clamp((t - 0.05) / 0.35); const sc = k < 0.7 ? 1.6 - 0.7 * easeOut(k / 0.7) : 0.9 + 0.1 * ((k - 0.7) / 0.3);
      ctx.save(); ctx.translate(W / 2, 230); ctx.rotate(-0.04); ctx.scale(sc, sc); ctx.globalAlpha = clamp(k * 2);
      flowerText(ctx, h1, 0, 0, fitFont(ctx, h1, 100, W - 160, 900), skin.hl, skin.chip2); ctx.restore();
      if (h2) withPop(ctx, pop(t, 0.35, 0.3), W / 2, 370, () => {
        fitFont(ctx, h2, 60, W - 260, 900); const w = ctx.measureText(h2).width + 80;
        ctx.save(); ctx.translate(W / 2, 370); ctx.rotate(0.03);
        ctx.fillStyle = '#ffffff'; rr(ctx, -w / 2 - 8, -50, w + 16, 100, 50); ctx.fill();
        ctx.fillStyle = skin.chip1; rr(ctx, -w / 2, -42, w, 84, 42); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h2, 0, 3); ctx.restore();
      });
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ---------- 字幕（老版式：去掉句末标点、关键词变色放大、每套一种出字方式） ----------
function drawSub(ctx, look, skin, ln, keys, t, y, li) {
  const text = cleanSub(ln.text); if (!text) return;
  const chars = markKeys(text, keys);
  const dur = Math.max(0.3, ln.end - ln.start); const since = t - ln.start;
  ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const layout = (size, weight, maxW, keyScale = 1, spacing = 0) => {
    let s = size; let rows; let rowsW;
    for (;;) {
      font(ctx, s, weight); rows = subRows(ctx, chars, maxW);
      rowsW = rows.map((r) => r.reduce((a, c) => { font(ctx, c.key ? s * keyScale : s, weight); return a + ctx.measureText(c.ch).width + spacing; }, -spacing));
      if (Math.max(...rowsW) <= maxW + 4 || s < 36) break; s -= 4;
    }
    return { s, rows, rowsW };
  };
  const each = (L, lh, o) => {
    let ci = 0;
    L.rows.forEach((r, ri) => {
      let x = W / 2 - L.rowsW[ri] / 2; const yy = y + ri * lh - ((L.rows.length - 1) * lh) / 2;
      r.forEach((c) => { const sz = o.size ? o.size(c) : L.s; font(ctx, sz, o.weight || 900); const cw = ctx.measureText(c.ch).width; o.draw(c, x, yy, cw, ci++, sz); x += cw + (o.spacing || 0); });
    });
  };
  switch (look.sub) {
    case 'slam': { // 爆款：粗大白字黑边，关键词黄色放大，一个字一个字砸出来
      const L = layout(80, 900, W - 120, 1.15);
      each(L, L.s * 1.25, { size: (c) => (c.key ? L.s * 1.15 : L.s), draw: (c, x, yy, cw, ci, sz) => {
        const e = clamp((since - ci * 0.022) / 0.12); if (e <= 0) return;
        const sc = 1.5 - 0.5 * easeOut(e);
        ctx.save(); ctx.translate(x + cw / 2, yy); ctx.scale(sc, sc); ctx.globalAlpha = clamp(e * 2);
        ctx.lineWidth = sz * 0.22; ctx.strokeStyle = '#000'; ctx.strokeText(c.ch, -cw / 2, 0);
        ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, -cw / 2, 0); ctx.restore();
      } });
      break;
    }
    case 'ink': { // 杂志：纸上的深色字，关键词下面一道荧光笔
      const L = layout(60, 900, W - 160);
      const e = easeOut(clamp(since / 0.3)); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 16);
      each(L, L.s * 1.35, { draw: (c, x, yy, cw, ci, sz) => {
        if (c.key) { ctx.fillStyle = skin.hl; ctx.globalAlpha = e * 0.35; ctx.fillRect(x - 1, yy + sz * 0.02, cw + 2, sz * 0.42); ctx.globalAlpha = e; }
        ctx.fillStyle = c.key ? skin.cardInk : skin.paperInk; ctx.fillText(c.ch, x, yy);
      } });
      break;
    }
    case 'cine': { // 电影：细字、字距开、不描边，整句淡入
      const L = layout(44, 700, W - 180, 1, 6);
      ctx.globalAlpha = clamp(since / 0.35);
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
      each(L, L.s * 1.6, { weight: 700, spacing: 6, draw: (c, x, yy) => { ctx.fillStyle = c.key ? skin.hl : '#efebe3'; ctx.fillText(c.ch, x, yy); } });
      break;
    }
    case 'bar': { // 新闻：深蓝字幕条从左边推出来，关键词黄色
      const L = layout(56, 900, W - 200);
      const e = easeOut(clamp(since / 0.22)); const lh = L.s * 1.6;
      L.rows.forEach((_, ri) => { const yy = y + ri * lh - ((L.rows.length - 1) * lh) / 2; const w = L.rowsW[ri] + 80; ctx.fillStyle = 'rgba(8,24,60,0.92)'; ctx.fillRect(W / 2 - w / 2, yy - L.s * 0.72, w * e, L.s * 1.44); ctx.fillStyle = skin.hl; ctx.fillRect(W / 2 - w / 2, yy - L.s * 0.72, 8, L.s * 1.44); });
      ctx.globalAlpha = clamp((since - 0.08) / 0.15);
      each(L, lh, { draw: (c, x, yy) => { ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, x + 4, yy + 2); } });
      break;
    }
    case 'type': { // DV：像素字打字机 + 闪烁光标
      pixelFont(ctx, 64); const rows = subRows(ctx, chars, W - 160);
      const n = Math.floor(clamp(since / Math.min(dur * 0.6, chars.length * 0.07)) * chars.length);
      let ci = 0; let cur = null;
      rows.forEach((r, ri) => {
        const rw = r.reduce((a, c) => a + ctx.measureText(c.ch).width, 0); let x = W / 2 - rw / 2; const yy = y + ri * 86 - ((rows.length - 1) * 86) / 2;
        r.forEach((c) => {
          if (ci < n) { const cw = ctx.measureText(c.ch).width; ctx.fillStyle = '#000'; for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [4, 4]]) ctx.fillText(c.ch, x + dx, yy + dy); ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, x, yy); x += cw; cur = [x, yy]; }
          ci++;
        });
      });
      if (cur && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = skin.hl; ctx.fillRect(cur[0] + 6, cur[1] - 28, 30, 56); }
      break;
    }
    case 'flower': { // 综艺：花字，每个字一跳一跳，关键词换色
      const L = layout(76, 900, W - 150, 1.12);
      ctx.translate(W / 2, y); ctx.rotate(li % 2 ? 0.015 : -0.015); ctx.translate(-W / 2, -y);
      each(L, L.s * 1.3, { size: (c) => (c.key ? L.s * 1.12 : L.s), draw: (c, x, yy, cw, ci, sz) => {
        const s = pop(t, ln.start + ci * 0.03, 0.2); if (s <= 0) return;
        const bob = Math.sin(t * 9 + ci * 0.7) * 5;
        ctx.save(); ctx.translate(x + cw / 2, yy + bob); ctx.scale(s, s);
        ctx.lineWidth = sz * 0.36; ctx.strokeStyle = '#ffffff'; ctx.strokeText(c.ch, -cw / 2, 0);
        ctx.lineWidth = sz * 0.18; ctx.strokeStyle = c.key ? '#5b1a8a' : skin.chip2; ctx.strokeText(c.ch, -cw / 2, 0);
        ctx.fillStyle = c.key ? skin.hl : '#ffffff'; ctx.fillText(c.ch, -cw / 2, 0); ctx.restore();
      } });
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ---------- 装饰（老版式，每套一种） ----------
const tc = (t) => { const s = Math.floor(t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
function drawDeco(ctx, look, skin, script, tl, t, idx, p, account, tEmoji, layout) {
  const label = script.sections[idx]?.label || '';
  const n = script.sections.length;
  switch (look.deco) {
    case 'bar': {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, W, 10);
      ctx.fillStyle = skin.hl; ctx.fillRect(0, 0, W * clamp(t / Math.max(1, tl.duration)), 10);
      font(ctx, 36, 900); const aw = ctx.measureText('@' + account).width;
      ctx.fillStyle = skin.hl; rr(ctx, 40, 60, aw + 48, 62, 8); ctx.fill();
      ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('@' + account, 64, 92);
      break;
    }
    case 'mag': {
      font(ctx, 30, 700); ctx.textBaseline = 'middle';
      ctx.fillStyle = skin.paperInk; ctx.textAlign = 'right'; ctx.globalAlpha = 0.6; ctx.fillText(`${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, W - 70, 100); ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.fillText('@' + account, 70, 100);
      font(ctx, 26, 700); ctx.globalAlpha = 0.45; ctx.textAlign = 'center'; ctx.fillText('— 真实课堂 · 实拍记录 —', W / 2, 1835); ctx.globalAlpha = 1;
      break;
    }
    case 'cine': {
      if (label && layout !== 'type') {
        const k = t - p.start; const a = clamp(k / 0.4) * clamp((1.8 - k) / 0.4);
        if (a > 0) { ctx.save(); ctx.globalAlpha = a; fitFont(ctx, `— ${label} —`, 32, W - 200, 700, 8); ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`— ${label} —`, W / 2, 530); ctx.restore(); }
      }
      font(ctx, 26, 700, 6); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText(`SC.${String(idx + 1).padStart(2, '0')}`, 60, 1840);
      ctx.textAlign = 'right'; ctx.fillText('@' + account, W - 60, 1840);
      ctx.letterSpacing = '0px';
      break;
    }
    case 'news': {
      const blink = Math.sin(t * 5) > -0.3;
      ctx.fillStyle = skin.chip1; rr(ctx, 40, 60, 120, 60, 8); ctx.fill();
      if (blink) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(66, 90, 9, 0, Math.PI * 2); ctx.fill(); }
      font(ctx, 32, 900); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('LIVE', 82, 92);
      font(ctx, 34, 900); const aw = ctx.measureText(account).width + 40;
      ctx.fillStyle = 'rgba(10,22,48,0.8)'; ctx.fillRect(160, 60, aw, 60); ctx.fillStyle = '#ffffff'; ctx.fillText(account, 180, 92);
      font(ctx, 30, 700); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'right'; ctx.fillText(tc(t), W - 44, 92);
      const items = [...new Set(script.sections.flatMap((x) => [...(x.visual?.items || []), x.label]).filter(Boolean))];
      const text = items.join('   ·   ') + '   ·   ';
      ctx.fillStyle = skin.bar; ctx.fillRect(0, 1830, W, 62); ctx.fillStyle = skin.hl; ctx.fillRect(0, 1830, 150, 62);
      font(ctx, 30, 900); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText('关注', 75, 1862);
      ctx.save(); ctx.beginPath(); ctx.rect(150, 1830, W - 150, 62); ctx.clip();
      font(ctx, 30, 700); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; const tw = Math.max(200, ctx.measureText(text).width);
      const off = (t * 110) % tw; ctx.fillText(text, 170 - off, 1862); ctx.fillText(text, 170 - off + tw, 1862);
      ctx.restore();
      break;
    }
    case 'dv': {
      scanlines(ctx, 0.18);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6;
      const m = 50; const L = 70;
      [[m, m + 60, 1, 1], [W - m, m + 60, -1, 1], [m, H - m - 60, 1, -1], [W - m, H - m - 60, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + L * sy); ctx.lineTo(x, y); ctx.lineTo(x + L * sx, y); ctx.stroke(); });
      pixelFont(ctx, 40); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (Math.floor(t * 1.6) % 2 === 0) { ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(110, 150, 14, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.fillText('REC', 138, 152);
      ctx.textAlign = 'right'; ctx.fillText(`${tc(t)}:${String(Math.floor((t % 1) * 24)).padStart(2, '0')}`, W - 110, 152);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(W - 190, 190, 70, 34); ctx.fillStyle = '#ffffff'; ctx.fillRect(W - 120, 199, 8, 16); ctx.fillRect(W - 184, 196, 44, 22);
      if (label) { pixelFont(ctx, 40); ctx.textAlign = 'left'; ctx.fillStyle = '#000'; ctx.fillText('▶ ' + label, 113, H - 147); ctx.fillStyle = skin.hl; ctx.fillText('▶ ' + label, 110, H - 150); }
      pixelFont(ctx, 34); ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.fillText('@' + account, W - 110, H - 150);
      break;
    }
    case 'pop': {
      const emo = tEmoji || ['✨', '🎉'];
      font(ctx, 34, 900); const aw = ctx.measureText('@' + account).width;
      ctx.fillStyle = '#ffffff'; rr(ctx, 40, 60, aw + 48, 60, 30); ctx.fill(); ctx.fillStyle = skin.chip2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('@' + account, 64, 92);
      if (layout !== 'type') for (let j = 0; j < 2; j++) {
        const left = hash(idx * 11 + j) > 0.5; const x = left ? 110 + hash(idx + j * 3) * 80 : W - 110 - hash(idx + j * 5) * 80; const y = 560 + hash(idx * 7 + j * 13) * 620;
        const s = pop(t, p.start + 0.2 + j * 0.25, 0.3); if (s <= 0) continue;
        ctx.save(); ctx.translate(x, y + Math.sin((t - p.start) * 4 + j) * 10); ctx.scale(s, s); ctx.rotate((j ? 1 : -1) * 0.15); ctx.font = `96px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.fillText(emo[(idx + j) % emo.length], 0, 0); ctx.restore();
      }
      const k = (t - p.start) / 0.5;
      if (idx > 0 && k >= 0 && k < 1) {
        for (let j = 0; j < 16; j++) {
          const a = hash(j * 17 + idx) * Math.PI * 2; const d = 120 + 460 * easeOut(k) * (0.6 + hash(j + idx * 3) * 0.6);
          ctx.globalAlpha = 1 - k; ctx.fillStyle = j % 2 ? skin.hl : '#ffffff';
          ctx.save(); ctx.translate(W / 2 + Math.cos(a) * d, 960 + Math.sin(a) * d); ctx.rotate(k * 3); const r = 18 * (1 - k * 0.5);
          ctx.beginPath(); for (let q = 0; q < 8; q++) { const r2 = q % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos((q * Math.PI) / 4) * r2, Math.sin((q * Math.PI) / 4) * r2); } ctx.closePath(); ctx.fill(); ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    default: break;
  }
}

// ---------- 主入口 ----------
/** 视频素材要先解码出这一帧（异步）；导出时每帧先等它，预览时在后台解 */
export async function prepareFrame(data) {
  const { script, planData, t, skinId } = data;
  const look = skins[lookOf(script, skinId)];
  const idx = currentIdx(planData, t);
  const sc = sceneOf(data, look, idx);
  await Promise.all(sc.items.filter((it) => isClip(it.m) && !it.still).map((it) => prepareClip(it.m.clip, clipT(it.m, it.start, t), it.lane)));
}

/** 主题色：跟着行业走的版式，把主色换成行业色 */
function skinFor(script, look) {
  const theme = normalizeTheme(script.theme); const th = THEMES[theme?.key];
  return th && look.themed ? { ...look, chip1: th.red, chip2: darker(th.red), cardInk: th.red, ...(look.bg === 'paper' ? { hl: th.red } : {}) } : look;
}
/** 新版式：这一刻要用到的全部信息 */
function frameCtx(ctx, data, look, skin, idx, t = data.t) {
  const { script, tl, planData, assets } = data;
  const pool = poolOf(assets); const p = planData[idx]; const sec = tl.sections[idx];
  const sc = sceneOf({ ...data, t }, look, idx, t);
  const bpm = bgmTempo(bgmOfScript(script, look)) || 120;
  return {
    ctx, look, skin, script, tl, planData, t, idx, p, sec, s: script.sections[idx], sc, seq: sc.seq,
    account: script.account || '我的账号', tEmoji: themeEmoji(normalizeTheme(script.theme)),
    k: p ? clamp((t - p.start) / Math.max(0.5, p.end - p.start)) : 0, beatLen: 60 / bpm,
    mainOf: (i) => assets?.media?.[i] || pool[i % Math.max(1, pool.length)] || null,
  };
}
/** 新版式画一个镜头的画面层（背景 + 画面 / 大字） */
function paintScene(F) {
  const { ctx, look, s, p, t, idx } = F;
  (BGS[look.bg] || BGS.black)(F);
  if (F.sc.layout === 'type') {
    if (look.frame === 'tv') FRAMES.tv(F); // 大字也放在电视机里
    const parts = typeParts(s.visual || {}); const at = (k) => p.steps[k] ?? (p.start + 0.25 + k * 0.45);
    if (TYPES[look.type]) TYPES[look.type](F, parts, at);
    else drawTypeScene(ctx, { ...look, title: look.type }, F.skin, s, p, t, idx, F.sc.items[0], F.tEmoji);
  } else (FRAMES[look.frame] || FRAMES.full)(F);
}
let _prev = null;
/** 叠化：上一个镜头画在一张小画布上，按透明度盖在这一个上面 */
function paintPrev(F, alpha) {
  const { ctx } = F; const c = ctx.canvas; if (!c || alpha <= 0.01) return;
  if (!_prev || _prev.width !== c.width || _prev.height !== c.height) _prev = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(c.width, c.height) : Object.assign(document.createElement('canvas'), { width: c.width, height: c.height });
  const g = _prev.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, _prev.width, _prev.height); g.setTransform(ctx.getTransform());
  const P = frameCtx(g, F.data, F.look, F.skin, F.idx - 1, F.t);
  P.sc.items.forEach((it) => { it.still = true; });
  P.k = 1;
  paintScene(P);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(_prev, 0, 0); ctx.restore();
}
function drawFrameNew(ctx, data, look) {
  const { script, tl, planData, t } = data;
  const skin = skinFor(script, look);
  const idx = currentIdx(planData, t);
  const F = frameCtx(ctx, data, look, skin, idx); F.data = data;
  const { s, p, sc } = F;
  if (!s || !p) { (BGS[look.bg] || BGS.black)(F); return; }
  const tr = transOf(script, look, idx); const k = tr ? clamp((t - p.start) / (TRANS_DUR[tr] || 0.3)) : 1;
  ctx.save();
  if (k < 1 && tr !== 'dissolve') transPre(ctx, tr, k);
  // 卡点：每一拍画面轻轻一跳
  if (look.bump && sc.layout !== 'type') { const ph = (t / F.beatLen) % 1; const z = 1 + look.bump * Math.pow(1 - ph, 3); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
  // 镜头内的小切点：快速推近
  const kc = sc.cutAt > p.start ? clamp((t - sc.cutAt) / 0.2) : 1;
  if (kc < 1 && look.cutFx) { const z = 1 + 0.1 * (1 - easeOut(kc)); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
  paintScene(F);
  ctx.restore();
  if (kc < 1 && look.cutFx === 'flash') { ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - kc)})`; ctx.fillRect(0, 0, W, H); }
  if (tr === 'dissolve' && k < 1 && idx > 0) paintPrev(F, 1 - easeOut(k));
  else if (k < 1) transPost(ctx, tr, k, skin, idx, F.account);
  // 贴片（标签、步骤、数字卡……）：按版式缩放到画面区域里
  if (sc.layout !== 'type' && look.ov !== false && !(look.noHookOv && s.visual?.type === 'hook')) {
    const drawInner = (box) => { const img = imageOf(sc.items[0], t); if (img) coverIn(ctx, img, box); else drawPlaceholder(ctx, s.label, box); };
    const o = look.ov || null; const os = o?.s || 1; const oy = (o?.cy ?? 960) + (o?.dy || 0);
    // 贴片压暗、横条只盖住画面那一块（换算到贴片自己的坐标里）
    const M = F.mediaR || { x: 0, y: 0, w: W, h: H };
    const R = { x: (M.x - W / 2) / os + W / 2, y: (M.y - oy) / os + 960, w: M.w / os, h: M.h / os, noDim: !!M.noDim };
    ctx.save();
    if (o) { ctx.translate(W / 2, oy); ctx.scale(os, os); ctx.translate(-W / 2, -960); }
    drawOverlay(ctx, s.visual || { type: 'shot' }, p, t, skin, R, idx, drawInner);
    ctx.restore();
  }
  (DECOS[look.deco] || DECOS.none)(F);
  if (sc.layout !== 'type' || look.titleOnType) (TITLES[look.title] || TITLES.none)(F);
  const sec = tl.sections[idx];
  const li = sec ? sec.lines.findIndex((l) => t >= l.start && t < l.end + 0.15) : -1;
  const sub = SUBS[look.sub] || SUBS.none;
  if (look.subAlways) sub(F, sec?.lines[Math.max(0, li)], li);
  else if (li >= 0 && (sc.layout !== 'type' || look.subOnType !== false)) sub(F, sec.lines[li], idx * 3 + li);
}

export function drawFrame(ctx, data) {
  const { script, tl, planData, t, skinId } = data;
  const look = skins[lookOf(script, skinId)];
  if (look.frame) { ctx.save(); drawFrameNew(ctx, data, look); ctx.restore(); return; }
  const skin = skinFor(script, look); const tEmoji = themeEmoji(normalizeTheme(script.theme));
  const account = script.account || '我的账号';
  ctx.save();
  drawBg(ctx, look, skin, t, tEmoji);

  const idx = currentIdx(planData, t);
  const s = script.sections[idx]; const p = planData[idx];
  let layout = 'full';
  if (s && p) {
    const sc = sceneOf(data, look, idx); layout = sc.layout;
    const tr = transOf(script, look, idx); const k = clamp((t - p.start) / (TRANS_DUR[tr] || 0.3));
    // 一句一换的小切点：快速推近 + 闪一下
    const kc = sc.cutAt > p.start ? clamp((t - sc.cutAt) / 0.2) : 1;
    ctx.save();
    if (k < 1) transPre(ctx, tr, k);
    if (kc < 1) { const z = 1 + 0.12 * (1 - easeOut(kc)); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    if (layout === 'type') drawTypeScene(ctx, look, skin, s, p, t, idx, sc.items[0], tEmoji);
    else cellsOf(layout, look, idx).forEach((cell, j) => drawCell(ctx, look, skin, cell, sc.items[j] || sc.items[0], j, p, t, idx, s.label));
    ctx.restore();
    if (kc < 1) { ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - kc)})`; ctx.fillRect(0, 0, W, H); }
    // 贴边版式：上下压暗，标题和字幕在任何画面上都看得清
    if (look.bleed && layout !== 'type') {
      ctx.fillStyle = grad(ctx, 0, 560, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'); ctx.fillRect(0, 0, W, 560);
      ctx.fillStyle = grad(ctx, 1150, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)'); ctx.fillRect(0, 1150, W, H - 1150);
    }
    if (k < 1) transPost(ctx, tr, k, skin, idx, account);
    if (layout !== 'type') {
      const drawInner = (box) => { const img = imageOf(sc.items[0], t); if (img) coverIn(ctx, img, box); else drawPlaceholder(ctx, s.label, box); };
      drawOverlay(ctx, s.visual || { type: 'shot' }, p, t, skin, { x: 0, y: 0, w: W, h: H }, idx, drawInner);
    }
  }

  drawDeco(ctx, look, skin, script, tl, t, idx, p || { start: 0 }, account, tEmoji, layout);
  if (layout !== 'type' || look.title === 'mag' || look.title === 'news') drawTitle(ctx, look, skin, script, t, account, tEmoji);

  const sec = tl.sections[idx];
  const li = sec ? sec.lines.findIndex((l) => t >= l.start && t < l.end + 0.15) : -1;
  if (li >= 0) drawSub(ctx, look, skin, sec.lines[li], s?.key, t, look.subY, idx * 3 + li);
  ctx.restore();
}

/** 这套版式默认配的背景音乐（曲风@变奏） */
export const bgmFor = (script, skinId) => skins[lookOf(script, skinId)].bgm;

/** 音效：开场、每次切镜头、镜头内换画面（一句一换 / 卡点）、贴片弹出、拼图格子出现、大字砸下、结尾 */
export function sfxCues(data) {
  const { script, tl, planData, skinId } = data;
  const look = skins[lookOf(script, skinId)]; const S = look.sfx; const out = [];
  out.push({ t: 0.05, kind: S.intro, gain: S.introGain ?? 0.8 });
  planData.forEach((p, i) => {
    const v = script.sections[i].visual || {};
    const sc = sceneOf({ ...data, t: p.start + 0.01 }, look, i, p.start + 0.01);
    if (i > 0) out.push({ t: Math.max(0, p.start - 0.12), kind: S.cut, gain: S.cutGain ?? 0.7 });
    if (sc.layout === 'type') {
      typeParts(v).forEach((_, k) => out.push({ t: p.steps[k] ?? p.start + 0.25 + k * 0.45, kind: S.type, gain: 0.75 }));
      return;
    }
    if (v.type === 'cta') out.push({ t: p.steps[0] ?? p.start + 0.3, kind: S.end, gain: 0.8 });
    else if (look.ov !== false) p.steps.slice(0, 4).forEach((st) => out.push({ t: st, kind: S.pop, gain: 0.45 }));
    // 拼图格子一个个出现
    const n = sc.items.length; const gap = look.frame ? look.cellGap : CELL_GAP;
    if (gap) for (let k = 1; k < n; k++) out.push({ t: p.start + k * gap, kind: S.cell, gain: 0.5 });
    // 镜头里换画面：卡点每一刀一个鼓点，一句一换每句一个“嗖”
    const cuts = cutTimes(data, look, i, sc.layout);
    const beat = look.frame && look.cut === 'beat';
    cuts.forEach((x) => out.push({ t: Math.max(0, x - (beat ? 0.01 : 0.03)), kind: beat ? (S.beat || S.cut) : (S.sub || S.cut), gain: beat ? (S.beatGain ?? 0.4) : (S.subGain ?? 0.45) }));
    // 每句话一个提示音（聊天、直播、打字机）
    if (look.lineSfx && !cuts.length) tl.sections[i].lines.forEach((l, k) => { if (k || i) out.push({ t: Math.max(0, l.start - 0.02), kind: S.sub, gain: S.subGain ?? 0.4 }); });
  });
  return out.filter((c) => c.kind).sort((a, b) => a.t - b.t);
}

// 画面上固定会出现的字（界面文字、装饰字），出片前和文案里的字一起按需加载字体
const UI_TEXT = '0123456789%?？—@”“✓✗:/·▶◀×★☆♡↗💬📍RECLIVESCPLAYBREAKINGDAYKODAKFPSCHISO1080P// > _.mp4[]现场关注真实课堂实拍记录快讯原话数据画面ABCD'
  + '赞收藏评论转发刚刚分钟前日报第版特刊直击本报讯号外主播公告正在上课直播划重点上课流程我们做到一句话说别处问注意看今天的样子展'
  + '主题公开课学员老师校区作品练习示范环境日常第一天';
export async function preloadFonts(script) {
  const text = JSON.stringify(script) + UI_TEXT;
  await loadFontFaces([`900 40px "Noto Sans SC"`, `700 40px "Noto Sans SC"`, `48px "${PIXEL_FAMILY}"`], text);
}

/** 挑一套版式：最近用过的先不用，连着做几条看起来都不一样（exclude：这一次已经挑走的） */
export function pickLook(exclude = []) {
  let recent = [];
  try { recent = JSON.parse(globalThis.localStorage?.getItem('ycp.footageLooks') || '[]'); } catch { /* */ }
  const ok = (x) => !exclude.includes(x);
  // 先在最近没用过的里面挑；同一组（比如都是卡点）的也尽量隔开
  const lastGroup = recent[0] ? skins[recent[0]]?.group : '';
  let pool = LOOK_IDS.filter((x) => ok(x) && !recent.includes(x) && skins[x].group !== lastGroup);
  if (!pool.length) pool = LOOK_IDS.filter((x) => ok(x) && !recent.includes(x));
  if (!pool.length) pool = LOOK_IDS.filter(ok);
  if (!pool.length) pool = LOOK_IDS;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  rememberLook(pick);
  return pick;
}
/** 记下用过哪套（最近 12 套都先不重复） */
export function rememberLook(id) {
  let recent = [];
  try { recent = JSON.parse(globalThis.localStorage?.getItem('ycp.footageLooks') || '[]'); } catch { /* */ }
  try { globalThis.localStorage?.setItem('ycp.footageLooks', JSON.stringify([id, ...recent.filter((x) => x !== id)].slice(0, 12))); } catch { /* */ }
}

/** AI 结果兜底 */
export function normalize(s, splitLine) {
  const str = (v, n = 20) => String(v ?? '').trim().replace(/[。.！!]+$/, '').slice(0, n);
  s.title = str(s.title, 16) || '实拍混剪';
  const hl = Array.isArray(s.headline) ? s.headline : [s.headline];
  s.headline = [str(hl[0], 12) || s.title, str(hl[1], 12)];
  s.theme = normalizeTheme(s.theme);
  if (!skins[s.look]) s.look = pickLook();
  if (!Number(s.seed)) s.seed = 1 + Math.floor(Math.random() * 999999);
  const TYPES_OK = ['shot', 'hook', 'chips', 'big', 'stat', 'quote', 'steps', 'checklist', 'nametag', 'location', 'ticker', 'compare', 'cta', 'qa', 'polaroid', 'focus', 'stamp'];
  s.sections = (s.sections || []).filter(Boolean).map((x) => {
    const v = x.visual || {};
    const type = TYPES_OK.includes(v.type) ? v.type : 'shot';
    const lines = (x.lines || []).map((l) => String(l).trim()).filter(Boolean).flatMap((l) => (splitLine ? splitLine(l) : [l])).slice(0, 3);
    const items = (n, len) => (v.items || []).map((q) => str(q, len)).filter(Boolean).slice(0, n);
    const all = lines.join('');
    // 字幕关键词：AI 给的、口播里确实出现的；没给就从贴片文字里找口播里出现的
    let key = (Array.isArray(x.key) ? x.key : [x.key]).map((k) => String(k || '').trim()).filter((k) => k.length >= 2 && k.length <= 6 && all.includes(k)).slice(0, 2);
    if (!key.length) key = [...(v.items || []), ...(v.lines || [])].map((k) => String(k || '').trim()).filter((k) => k.length >= 2 && k.length <= 5 && all.includes(k)).slice(0, 2);
    return {
      tag: str(x.label || type, 8),
      label: str(x.label, 8),
      kw: String(x.kw || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
      ours: !!x.ours, key,
      src: /^https:\/\/images\.pexels\.com\//.test(x.src || '') ? x.src : '', by: str(x.by, 40),
      visual: {
        type,
        items: type === 'chips' ? items(4, 6) : items(4, 11),
        lines: (v.lines || []).map((q) => str(q, 12)).slice(0, 2),
        title: str(v.title, 10), label: str(v.label, type === 'ticker' ? 5 : 10),
        big: str(v.big, 8), unit: str(v.unit, 4), sub: str(v.sub, 14),
        text: str(v.text, type === 'cta' ? 14 : type === 'ticker' ? 26 : type === 'stamp' ? 4 : 40), by: str(v.by, 12),
        name: str(v.name, 10), role: str(v.role, 18), place: str(v.place, 14), note: str(v.note, 18),
        q: str(v.q, 22), a: str(v.a, 22), who: str(v.who, 6), caption: str(v.caption, 14),
        left: { label: str(v.left?.label, 5), items: (v.left?.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 3) },
        right: { label: str(v.right?.label, 5), items: (v.right?.items || []).map((q) => str(q, 9)).filter(Boolean).slice(0, 3) },
      },
      lines,
    };
  }).filter((x) => x.lines.length);
  // 同一种贴片最多 2 次（AI 有时不听），多出来的改成纯画面
  const used = {};
  s.sections.forEach((x) => { const ty = x.visual.type; if (ty === 'shot' || ty === 'cta') return; used[ty] = (used[ty] || 0) + 1; if (used[ty] > 2) x.visual = { ...x.visual, type: 'shot' }; });
  s.sections.forEach((x, i) => { if (!x.kw) x.kw = s.sections[i - 1]?.kw || 'education classroom'; });
  const seen = []; let rr2 = 0;
  s.sections.forEach((x) => {
    if (seen.includes(x.kw)) return;
    if (seen.length >= 12) { x.kw = seen[rr2++ % seen.length]; return; }
    seen.push(x.kw);
  });
  return s;
}
