// 生成 课程 / 课件 / 实验 三站的首页和课程介绍页。
// 用法：node sites/build.mjs
// 改内容只改数据文件：course/courses.json、bot/courseware.json、lab/projects.json
// 改样式只改 _shared/site.css（会复制到各站）。每一讲的讲稿页（course/*/01.html…）不由这里生成。
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s); console.log("写好", p); };
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (n) => String(n).padStart(2, "0");

const SITES = {
  course: { label: "课程", href: "https://course.getcut.cn" },
  bot: { label: "课件", href: "https://bot.getcut.cn" },
  lab: { label: "实验", href: "https://lab.getcut.cn" },
};
const MAIN = { label: "出片王", href: "https://getcut.cn" };

const MARK = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#1a1612"/><rect x="11" y="11" width="11.5" height="11.5" rx="2.5" fill="#c4452f"/><rect x="25.5" y="11" width="11.5" height="11.5" rx="2.5" fill="#e8d5a3"/><rect x="11" y="25.5" width="11.5" height="11.5" rx="2.5" fill="#e8d5a3"/><rect x="25.5" y="25.5" width="11.5" height="11.5" rx="2.5" fill="#2f6f5e"/></svg>`;
const FAVICON = "data:image/svg+xml," + encodeURIComponent(MARK.replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"'));

// 跨站链接：线上走域名；本机预览（localhost / 127.0.0.1）自动改成同一台服务器上的目录，方便点来点去。
const LOCAL_LINKS = `<script>(function(){if(!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname))return;var m={"https://course.getcut.cn":"/course/","https://bot.getcut.cn":"/bot/","https://lab.getcut.cn":"/lab/"};document.querySelectorAll("a[href^='https://']").forEach(function(a){for(var k in m){var h=a.getAttribute("href");if(h===k||h.indexOf(k+"/")===0){a.setAttribute("href",m[k]+h.slice(k.length).replace(/^\\//,""));}}});})();</script>`;

function page({ site, title, desc, css, body, noindex = true, bodyClass = "", depth = 0 }) {
  const up = "../".repeat(depth);
  const nav = Object.entries(SITES).map(([k, s]) =>
    `<a href="${s.href}"${k === site ? ' aria-current="page"' : ""}>${s.label}</a>`).join("");
  const footNav = [...Object.entries(SITES).map(([k, s]) =>
    `<a href="${s.href}"${k === site ? ' aria-current="page"' : ""}>${s.label}</a>`), `<a href="${MAIN.href}">${MAIN.label}</a>`].join("");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f5f1e8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ""}<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<link rel="stylesheet" href="${up}${css}">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
<a class="skip" href="#main">跳到正文</a>
<header class="bar">
  <div class="wrap bar__in">
    <a class="brand" href="${SITES[site].href}">${MARK}<span>王总 AI 实战<small>· ${SITES[site].label}</small></span></a>
    <nav class="switch" aria-label="站点切换">${nav}<a class="ext" href="${MAIN.href}">${MAIN.label} ↗</a></nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="wrap foot__in">
    <div>{{FOOT}}</div>
    <nav aria-label="站点入口">${footNav}</nav>
  </div>
</footer>
${LOCAL_LINKS}
</body>
</html>
`;
}

/* ============ 课程 ============ */
const courses = json("course/courses.json");
const wares = json("bot/courseware.json");
const totalLessons = courses.reduce((n, c) => n + c.lessons.length, 0);
const priceText = (c) => c.price ? `<small>¥</small>${c.price}` : "定价待定";

function courseCard(c, i, href) {
  return `<a class="card" href="${href}">
      <div class="card__top"><span class="card__no">${pad(i)}</span>${c.price ? `<span class="tag tag--accent">¥${c.price}</span>` : '<span class="tag">定价待定</span>'}</div>
      <h3>${esc(c.name)}</h3>
      <p class="card__lede">${esc(c.leads.join(""))}</p>
      <p class="card__deliver"><b>交出来的是</b>${esc(c.deliver)}</p>
      <div class="chips">${c.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <div class="card__foot"><span class="card__meta">共 ${c.lessons.length} 讲</span><span class="card__go">看目录 <span class="arrow">→</span></span></div>
    </a>`;
}

const COURSE_FOOT = `<p>课里用到的例子都来自公开帖。帖子里的收入、销量数字是作者自己说的，未另作核实，不当承诺。</p><p>直播间或网站购买，本页不放收款码。</p>`;

{
  const flag = courses.find((c) => c.flagship) || courses[0];
  const rest = courses.filter((c) => c !== flag);
  const body = `
<section class="wrap hero">
  <span class="kicker">AI 实战课</span>
  <h1>拿你正在发愁的一件真事，<em>学会让 AI 替你干完。</em></h1>
  <p class="hero__lede">不卖一堆教程。每门课都按“听完多出一样能用的东西”来设计：每一讲交一样东西，整门课交一条你以后还能自己改、自己跑的流程。</p>
  <div class="hero__cta">
    <a class="btn btn--ink" href="#pick">帮我选一门 <span class="arrow">↓</span></a>
    <a class="btn btn--ghost" href="${flag.slug}/">先看主推课：${esc(flag.name)}</a>
  </div>
  <div class="stats">
    <div><b>${courses.length}</b>门课</div>
    <div><b>${totalLessons}</b>讲</div>
    <div><b>每讲</b>都有交付物</div>
    <div><b>0</b>收入承诺</div>
  </div>
</section>

<section class="wrap section" id="pick">
  <div class="section__head"><h2>你现在卡在哪？</h2><p>点最像你的那句话，直接去那门课。</p></div>
  <div class="pick">
    ${courses.map((c) => `<a href="${c.slug}/"><span class="pick__q">${esc(c.pick)}</span><span class="pick__a">→ <b>${esc(c.name)}</b></span><span class="pick__go">去看 <span class="arrow">→</span></span></a>`).join("\n    ")}
  </div>
</section>

<section class="wrap section" id="flagship">
  <div class="section__head"><h2>主推课</h2><p>不知道从哪门开始，就从这门开始。</p></div>
  <article class="feature">
    <div class="feature__main">
      <div class="feature__tags"><span class="tag tag--dark">主推</span><span class="tag tag--dark">共 ${flag.lessons.length} 讲</span>${flag.tools.map((t) => `<span class="tag tag--dark">${esc(t)}</span>`).join("")}</div>
      <h3>${esc(flag.name)}</h3>
      <p class="feature__lede">${esc(flag.leads.join(""))}</p>
      <p class="feature__deliver"><b>学完你手里多出</b>${esc(flag.deliver)}</p>
      <div class="feature__buy">
        <span class="feature__price">${priceText(flag)}</span>
        <a class="btn btn--light" href="${flag.slug}/">看完整目录 <span class="arrow">→</span></a>
      </div>
    </div>
    <aside class="feature__side">
      <h4>这门课里你会做的事</h4>
      <ol class="mini-toc">
        ${(flag.highlights || [1, 2, 3, 4, 5]).map((n) => `<li><span>${pad(n)}</span>${esc(flag.lessons[n - 1])}</li>`).join("\n        ")}
      </ol>
    </aside>
  </article>
</section>

<section class="wrap section">
  <div class="section__head"><h2>其他课程</h2><p>按你手上的活挑。每门 6 讲，听完都要交出一样东西。</p></div>
  <div class="grid grid--2">
    ${rest.map((c, i) => courseCard(c, i + 2, `${c.slug}/`)).join("\n    ")}
  </div>
</section>

<section class="wrap section">
  <div class="section__head"><h2>这几门课的规矩</h2></div>
  <div class="rules">
    <div class="rule"><span class="rule__n">1</span><h3>用你自己的真事</h3><p>不拿假例子练手。开课先写下你正在发愁的一件事，整门课都围着它做。</p></div>
    <div class="rule"><span class="rule__n">2</span><h3>每一讲都要交东西</h3><p>每讲开头写清：听完你多出什么，下一步做什么。没交出来，就不算听完。</p></div>
    <div class="rule"><span class="rule__n">3</span><h3>不承诺你能赚多少</h3><p>课只管把流程做通、让你以后自己会改。收入、涨粉、播放量，一概不承诺。</p></div>
  </div>
</section>

<section class="wrap section">
  <div class="howbuy">
    <div><h3>怎么买</h3><p>在直播间或网站购买。本页不放收款码。</p></div>
    <a class="btn btn--ghost" href="#pick">再看看选哪门 <span class="arrow">↑</span></a>
  </div>
</section>`;
  write("course/index.html", page({ site: "course", title: "AI 实战课 · 课程目录", desc: "拿你正在发愁的一件真事，学会让 AI 替你干完。每一讲交一样东西。", css: "assets/site.css", body }).replace("{{FOOT}}", COURSE_FOOT));

  courses.forEach((c, idx) => {
    const others = courses.filter((o) => o !== c).sort((a, b) => (b.flagship ? 1 : 0) - (a.flagship ? 1 : 0)).slice(0, 2);
    const ware = c.ware && wares.find((w) => w.slug === c.ware);
    const body = `
<div class="wrap crumbs"><a href="../">课程</a><span>/</span>${esc(c.name)}</div>
<section class="wrap detail">
  <div>
    <span class="kicker">${c.flagship ? "主推课" : "付费课"} · 共 ${c.lessons.length} 讲</span>
    <h1>${esc(c.name)}</h1>
    ${c.leads.map((l) => `<p class="detail__lede">${esc(l)}</p>`).join("\n    ")}
    <div class="detail__tools">课里会用到 ${c.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    <div class="deliver"><b>学完你手里多出</b><p>${esc(c.deliver)}</p></div>

    <div class="section" style="padding-top:48px">
      <div class="section__head"><h2>课程目录</h2><p>共 ${c.lessons.length} 讲。点进去就是这一讲的讲稿。</p></div>
      <ol class="lessons">
        ${c.lessons.map((t, i) => `<li><a href="${pad(i + 1)}.html"><span class="n">${pad(i + 1)}</span><span class="t">${esc(t)}</span><span class="g">${i === 0 ? "先看这讲 →" : "→"}</span></a></li>`).join("\n        ")}
      </ol>
      <div class="detail-notes"><p>${esc(c.promise)}</p>${(c.notes || []).map((n) => `<p>${esc(n)}</p>`).join("")}</div>
    </div>
  </div>
  <aside class="buybox" aria-label="购买信息">
    <p class="buybox__label">${c.price ? "课程价" : "价格"}</p>
    <p class="buybox__price${c.price ? "" : " is-open"}">${priceText(c)}</p>
    <ul class="buybox__list">
      <li>共 ${c.lessons.length} 讲，每讲交一样能用的东西</li>
      <li>围着你自己的一件真事来做</li>
      <li>课里会用到：${esc(c.tools.join("、"))}</li>
      <li>不承诺收入、涨粉或播放量</li>
    </ul>
    <a class="btn btn--accent" href="01.html">先看第 01 讲 <span class="arrow">→</span></a>
    <p class="buybox__note">直播间或网站购买，本页不放收款码。</p>
  </aside>
</section>
${ware ? `
<section class="wrap section">
  <div class="section__head"><h2>配套课件</h2><p>想先自己读一遍，可以看这份讲义。</p></div>
  <div class="grid">${wareCard(ware, wares.indexOf(ware) + 1, `${SITES.bot.href}/${ware.slug}/`)}</div>
</section>` : ""}
<section class="wrap section">
  <div class="section__head"><h2>也可以看看</h2><p><a href="../">全部 ${courses.length} 门课 →</a></p></div>
  <div class="grid grid--2">
    ${others.map((o) => courseCard(o, courses.indexOf(o) + 1, `../${o.slug}/`)).join("\n    ")}
  </div>
</section>
<div class="mbuy"><b>${c.price ? `¥${c.price}` : "定价待定"}</b><a class="btn btn--accent" href="01.html">先看第 01 讲 →</a></div>`;
    write(`course/${c.slug}/index.html`, page({ site: "course", title: `${c.name} · 课程目录`, desc: c.leads.join(""), css: "assets/site.css", body, depth: 1, bodyClass: "has-mbuy" }).replace("{{FOOT}}", COURSE_FOOT));
  });
  copyFileSync(join(ROOT, "_shared/site.css"), join(ROOT, "course/assets/site.css"));
}

/* ============ 课件 ============ */
function readMinutes(slug) {
  try {
    const text = read(`bot/${slug}/index.html`).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
    return Math.max(5, Math.round(text.length / 450 / 5) * 5);
  } catch { return null; }
}
function wareCard(w, i, href) {
  const min = readMinutes(w.slug);
  const rel = w.course && courses.find((c) => c.slug === w.course);
  return `<a class="card ware" href="${href}" data-series="${esc(w.series)}">
      <div class="ware__cover cover--${w.color || "ink"}"><span class="ware__series">${esc(w.series)}</span><span class="ware__no">${pad(i)}</span><span class="ware__big">${esc(w.cover || w.title).replace(/\n/g, "<br>")}</span></div>
      <div class="ware__body">
        <h3>${esc(w.title)}</h3>
        <p>${esc(w.desc)}</p>
        <div class="ware__meta"><span>${esc(w.parts)}</span>${min ? `<span>约 ${min} 分钟读完</span>` : ""}<span>${esc(w.level)}</span><span>更新 ${esc(w.updated)}</span></div>
        ${rel ? `<p class="ware__rel">配套课程：${esc(rel.name)}</p>` : ""}
      </div>
    </a>`;
}
{
  const series = [...new Set(wares.map((w) => w.series))];
  const body = `
<section class="wrap hero">
  <span class="kicker">课件库</span>
  <h1>系统化讲义，<em>从零读到会用。</em></h1>
  <p class="hero__lede">每套课件是一份能从头读到尾的讲义：先讲清是什么，再一步步装好、用上、接进你每天的活里。可以自己读，也可以打开“讲解模式”上课用。</p>
  <div class="stats">
    <div><b>${wares.length}</b>套已上线</div>
    <div><b>持续</b>更新中</div>
  </div>
</section>

<section class="wrap section" style="padding-top:48px">
  <div class="filters" role="toolbar" aria-label="按主题筛选">
    <button type="button" aria-pressed="true" data-f="">全部<span>${wares.length}</span></button>
    ${series.map((s) => `<button type="button" aria-pressed="false" data-f="${esc(s)}">${esc(s)}<span>${wares.filter((w) => w.series === s).length}</span></button>`).join("\n    ")}
  </div>
  <div class="grid" id="wares">
    ${wares.map((w, i) => wareCard(w, i + 1, `${w.slug}/`)).join("\n    ")}
    <div class="card ware--next" data-series="*"><i>+</i><b>下一套在做</b><p>课件会一套套加上来，做好就放在这里。</p></div>
  </div>
</section>
<script>
(function(){var bs=document.querySelectorAll(".filters button"),cs=document.querySelectorAll("#wares > [data-series]");
bs.forEach(function(b){b.addEventListener("click",function(){var f=b.getAttribute("data-f");bs.forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false");});
cs.forEach(function(c){var s=c.getAttribute("data-series");c.hidden=!(f===""||s===f||s==="*");});});});})();
</script>`;
  write("bot/index.html", page({ site: "bot", title: "课件库 · 系统化讲义", desc: "一套套能从头读到尾的 AI 讲义，从零读到会用。", css: "assets/site.css", body })
    .replace("{{FOOT}}", "<p>课件依据官方文档和公开讨论整理，不是官方手册。官网有更新时以官网为准。</p>"));
  mkdirSync(join(ROOT, "bot/assets"), { recursive: true });
  copyFileSync(join(ROOT, "_shared/site.css"), join(ROOT, "bot/assets/site.css"));
}

/* ============ 实验 ============ */
{
  const projects = json("lab/projects.json");
  const shown = projects.filter((p) => p.kind !== "intro");
  const intros = projects.filter((p) => p.kind === "intro");
  const tagCls = { play: "tag--accent", live: "tag--teal" };
  const body = `
<section class="wrap hero lab-hero">
  <span class="kicker">实验</span>
  <h1>做出来的东西，<em>点开就能试。</em></h1>
  <p class="hero__lede">这里放王总自己动手做的 AI 小项目。不卖，只是做出来给大家看看、玩玩。能在线打开的直接点；要本机跑模型或服务的，先写成一页介绍。</p>
</section>

<section class="wrap section" style="padding-top:48px">
  <div class="section__head"><h2>能直接打开的</h2><p>${shown.length} 个，在线就能用。</p></div>
  <div class="grid">
    ${shown.map((p) => `<article class="card proj">
      <div class="proj__media">${p.media}</div>
      <div class="proj__body">
        <div class="chips"><span class="tag ${tagCls[p.kind] || ""}">${esc(p.kindLabel)}</span></div>
        <h3>${esc(p.name)}</h3>
        ${p.desc.map((d) => `<p>${d}</p>`).join("")}
        ${p.notes.map((d) => `<p class="proj__note">${d}</p>`).join("")}
        <div class="proj__actions">${p.actions.map((a, i) => `<a class="btn ${i ? "btn--ghost" : "btn--ink"}" href="${a.href}"${/^https?:/.test(a.href) ? ' target="_blank" rel="noopener"' : ""}>${esc(a.label)}</a>`).join("")}</div>
      </div>
    </article>`).join("\n    ")}
  </div>
</section>

<section class="wrap section">
  <div class="section__head"><h2>还在本机跑的</h2><p>需要模型、转码或特定系统，暂时不放线上，先看介绍。</p></div>
  <ul class="notes">
    ${intros.map((p) => `<li><a href="${p.actions[0].href}"><b>${esc(p.name)}</b><span>${p.desc[0].replace(/<[^>]+>/g, "")}</span><em>看介绍 →</em></a></li>`).join("\n    ")}
  </ul>
</section>`;
  write("lab/index.html", page({ site: "lab", title: "实验 · 王总做的 AI 小项目", desc: "王总自己动手做的 AI 小项目：动感岛、出片王、火影人物关系图谱，以及几个本机实验。", css: "assets/site.css", body, noindex: false })
    .replace("{{FOOT}}", "<p>这是王总自己的实验小站，不是公司官网，也不代表上游开源项目的官方站点。</p><p>备案信息只放在主站 getcut.cn。</p>"));
  mkdirSync(join(ROOT, "lab/assets"), { recursive: true });
  copyFileSync(join(ROOT, "_shared/site.css"), join(ROOT, "lab/assets/site.css"));
}
