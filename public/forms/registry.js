// 形式库：每种形式 = 一套结构 + 多套皮肤，对应一类客户需求
import * as dataCard from './data-card.js';
import * as pixelStory from './pixel-story.js';
import * as photoTalk from './photo-talk.js';
import * as seriesIntro from './series-intro.js';
import * as deepDive from './deep-dive.js';

// 排序：获客的放前面（付费用户最在意的是客资）
export const forms = [
  { ...photoTalk.meta, module: photoTalk, url: '/forms/photo-talk.js', sample: '/samples/photo-talk-edu.json' },
  { ...seriesIntro.meta, module: seriesIntro, url: '/forms/series-intro.js', sample: '/samples/series-intro-edu.json' },
  { ...deepDive.meta, module: deepDive, url: '/forms/deep-dive.js', sample: '/samples/deep-dive-edu.json' },
  { ...pixelStory.meta, module: pixelStory, url: '/forms/pixel-story.js', sample: '/samples/pixel-story-edu.json' },
  { ...dataCard.meta, module: dataCard, url: '/forms/data-card.js', sample: '/samples/data-card-edu.json' },
];

// 两类：获客引流（要客资、要粉丝）/ 知识讲解（把内容讲清楚、立专业人设）
export const categories = ['全部', ...['获客引流', '知识讲解'].filter((c) => forms.some((f) => f.category === c))];
