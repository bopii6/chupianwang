(function () {
  var KEY = "course-site-teach-mode";
  var root = document.documentElement;
  var toggle = document.querySelector("[data-toggle]");

  function read() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function write(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
  }
  function apply(on) {
    root.classList.toggle("present", on);
    if (toggle) {
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.textContent = on ? "讲解模式开" : "讲解模式";
    }
  }
  var start = read() || /(?:\?|&)present=1(?:&|$)/.test(location.search || "");
  apply(start);
  if (toggle) {
    toggle.addEventListener("click", function () {
      var on = !root.classList.contains("present");
      apply(on);
      write(on);
    });
  }

  function go(href) {
    if (href) location.href = href;
  }
  document.addEventListener("keydown", function (e) {
    if (!root.classList.contains("present")) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.isComposing) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
    var prev = document.body.getAttribute("data-prev");
    var next = document.body.getAttribute("data-next");
    var index = document.body.getAttribute("data-index") || "index.html";
    if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
      e.preventDefault();
      go(next);
    } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
      e.preventDefault();
      go(prev);
    } else if (e.key === "Escape" || e.key === "Home") {
      e.preventDefault();
      go(index);
    }
  });

  var SITES = [
    { label: "出片王", href: "https://getcut.cn" },
    { label: "课程", href: "https://course.getcut.cn", current: true },
    { label: "课件", href: "https://bot.getcut.cn" },
    { label: "实验", href: "https://lab.getcut.cn" }
  ];
  function injectSites() {
    if (document.querySelector("nav.sites")) return;
    var nav = document.createElement("nav");
    nav.className = "sites";
    nav.setAttribute("aria-label", "站点入口");
    SITES.forEach(function (site, i) {
      if (i) {
        var sep = document.createElement("span");
        sep.className = "sites-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "·";
        nav.appendChild(sep);
      }
      if (site.current) {
        var cur = document.createElement("span");
        cur.setAttribute("aria-current", "page");
        cur.textContent = site.label;
        nav.appendChild(cur);
      } else {
        var a = document.createElement("a");
        a.href = site.href;
        a.textContent = site.label;
        nav.appendChild(a);
      }
    });
    var foot = document.createElement("footer");
    foot.className = "sites-foot";
    foot.appendChild(nav);
    var main = document.querySelector("main");
    if (main) main.appendChild(foot);
    else document.body.appendChild(foot);
  }
  injectSites();
})();
