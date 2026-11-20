// 所有文件位置都在这里定，分两类：
//   程序自带（只读）：网页、提示词、依赖、听写模型、违禁词表 → APP_ROOT
//   客户自己的（会变）：作品、文案样本、登录数据、.env、缓存、日志 → DATA_DIR
// 开发时两者是同一个项目文件夹，和以前完全一样；
// 装成桌面软件后，DATA_DIR 是 C:\Users\<用户>\AppData\Roaming\出片王，卸载重装、升级都不会丢。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.CPW_DATA_DIR ? path.resolve(process.env.CPW_DATA_DIR) : APP_ROOT;

export const ENV_FILE = path.join(DATA_DIR, '.env');
export const LOG_FILE = path.join(DATA_DIR, 'server.log');
export const WORKS_DIR = path.join(DATA_DIR, 'works');
export const USERS_DATA = path.join(DATA_DIR, 'data');
export const COPY_LIB = path.join(DATA_DIR, '文案库'); // 样本/、回收站/
export const CACHE_DIR = path.join(DATA_DIR, '.cache');

// 听写模型随程序一起装（只读）；开发时在项目的 .cache/models/web
export const MODELS_DIR = process.env.CPW_MODELS_DIR ? path.resolve(process.env.CPW_MODELS_DIR) : path.join(APP_ROOT, '.cache', 'models', 'web');
