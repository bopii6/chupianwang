// 我的作品：读 /api/works，支持导入、播放、直播模式轮播、删除（只显示自己账号下的）
(() => {
  const $ = (s) => document.querySelector(s);
  // 管理员从后台点「看作品」会带 ?owner=<账号id>；服务端会校验权限
  const owner = new URLSearchParams(location.search).get('owner') || '';
  const withOwner = (u) => (owner ? `${u}${u.includes('?') ? '&' : '?'}owner=${encodeURIComponent(owner)}` : u);
  const state = { items: [], order: [], q: '', sort: 'new', idx: -1, industry: 'all', hosted: false };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const industryOf = (it) => {
    const t = String(it.title || '');
    const i = t.indexOf('｜');
    return i > 0 ? t.slice(0, i) : '其他';
  };

  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const fmtDate = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const fmtDur = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // 当前筛选+排序后的列表
  function visible() {
    let list = state.items.slice();
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((it) => it.title.toLowerCase().includes(q));
    }
    if (state.industry !== 'all') list = list.filter((it) => industryOf(it) === state.industry);
    list.sort((a, b) => (state.sort === 'old' ? a.mtime - b.mtime : b.mtime - a.mtime));
    return list;
  }

  function render() {
    const list = visible();
    state.order = list;
    const grid = $('#grid');
    const empty = $('#empty');

    const total = state.items.length;
    if (!total) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      $('#wkSub').textContent = state.hosted ? '还没有作品 · 导出的成片会自动存到你账号下' : '还没有作品 · 导出的成片会自动存到这里';
      return;
    }
    empty.classList.add('hidden');
    const inds = [...new Set(state.items.map(industryOf))];
    if (state.industry !== 'all' && !inds.includes(state.industry)) state.industry = 'all';
    const bar = $('#wkFilters');
    if (bar) {
      bar.innerHTML = ['all', ...inds].map((k) => `<button type="button" class="${state.industry === k ? 'on' : ''}" data-ind="${esc(k)}">${k === 'all' ? '全部行业' : esc(k)}</button>`).join('');
      bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { state.industry = b.dataset.ind; render(); }; });
    }
    $('#wkSub').textContent = `共 ${total} 条${state.q ? ` · 匹配 ${list.length} 条` : ''}${state.hosted ? ' · 只显示你自己账号下的' : ''}`;

    grid.innerHTML = list.map((it) => `
      <article class="wk-card" data-id="${encodeURIComponent(it.id)}">
        <button class="wk-thumb" type="button" data-play="${encodeURIComponent(it.id)}" aria-label="播放 ${esc(it.title)}">
          <video src="${esc(it.url)}#t=2" preload="metadata" muted playsinline></video>
          <span class="wk-play"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></span>
          <span class="wk-dur"></span>
        </button>
        <div class="wk-meta">
          <b title="${esc(it.title)}">${esc(it.title)}</b>
          <span>${fmtDate(it.mtime)} · ${fmtSize(it.size)}</span>
        </div>
        <div class="wk-ops">
          <button type="button" data-play="${encodeURIComponent(it.id)}">播放</button>
          <button type="button" data-del="${encodeURIComponent(it.id)}">删除</button>
        </div>
      </article>`).join('');

    // 补时长：读到 metadata 后填
    grid.querySelectorAll('.wk-card').forEach((card) => {
      const v = card.querySelector('video');
      const dur = card.querySelector('.wk-dur');
      v.addEventListener('loadedmetadata', () => { dur.textContent = fmtDur(v.duration); }, { once: true });
    });
  }

  async function load() {
    try {
      const r = await fetch(withOwner('/api/works'), { cache: 'no-store' });
      const data = await r.json();
      if (r.status === 401) { $('#wkSub').innerHTML = '还没登录 · <a href="/">回制作台登录</a>后就能看到自己的作品'; return; }
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      state.items = data.items || [];
      render();
    } catch (e) {
      $('#wkSub').textContent = '读取失败：' + e.message;
    }
  }

  // ---------- 导入 ----------
  async function uploadOne(file) {
    const title = file.name.replace(/\.mp4$/i, '');
    const r = await fetch(withOwner('/api/works?title=' + encodeURIComponent(title)), {
      method: 'POST',
      headers: { 'content-type': 'video/mp4' },
      body: file,
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { msg = (await r.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  async function importFiles(files) {
    const list = [...files].filter((f) => /\.mp4$/i.test(f.name) || f.type === 'video/mp4');
    if (!list.length) { toast('只支持 MP4 文件'); return; }
    let ok = 0;
    const btn = $('#btnImport');
    btn.disabled = true;
    try {
      for (let i = 0; i < list.length; i++) {
        toast(`正在导入 ${i + 1}/${list.length}：${list[i].name}`);
        try {
          await uploadOne(list[i]);
          ok++;
        } catch (e) {
          toast(`「${list[i].name}」导入失败：${e.message}`);
          break;
        }
      }
      if (ok) toast(ok === list.length ? `已导入 ${ok} 条` : `已导入 ${ok}/${list.length} 条`);
      await load();
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 单条播放 ----------
  const player = $('#player');
  const playerVideo = $('#playerVideo');

  function openPlayer(id) {
    const idx = state.order.findIndex((it) => it.id === id);
    if (idx < 0) return;
    state.idx = idx;
    const it = state.order[idx];
    $('#playerTitle').textContent = it.title;
    playerVideo.src = it.url;
    player.classList.remove('hidden');
    playerVideo.play().catch(() => {});
  }
  function closePlayer() {
    playerVideo.pause();
    playerVideo.removeAttribute('src');
    playerVideo.load();
    player.classList.add('hidden');
  }
  function stepPlayer(delta) {
    if (!state.order.length) return;
    state.idx = (state.idx + delta + state.order.length) % state.order.length;
    openPlayer(state.order[state.idx].id);
  }

  // ---------- 直播模式 ----------
  const live = $('#live');
  const liveVideo = $('#liveVideo');

  function openLive(fromId) {
    if (!state.order.length) { toast('还没有视频可以播'); return; }
    const idx = fromId ? state.order.findIndex((it) => it.id === fromId) : 0;
    state.idx = idx >= 0 ? idx : 0;
    live.classList.remove('hidden');
    playLive();
  }
  function playLive() {
    const it = state.order[state.idx];
    if (!it) return;
    $('#liveTitle').textContent = it.title;
    $('#liveIdx').textContent = `${state.idx + 1} / ${state.order.length}`;
    liveVideo.src = it.url;
    liveVideo.play().catch(() => { toast('浏览器拦了自动播放，点一下画面开始'); });
  }
  function closeLive() {
    liveVideo.pause();
    liveVideo.removeAttribute('src');
    liveVideo.load();
    live.classList.add('hidden');
  }
  function stepLive(delta) {
    if (!state.order.length) return;
    state.idx = (state.idx + delta + state.order.length) % state.order.length;
    playLive();
  }
  liveVideo.addEventListener('ended', () => stepLive(1));

  // ---------- 删除 ----------
  async function del(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    if (!confirm(`删除「${it.title}」？\n删掉就找不回来了。`)) return;
    const r = await fetch(withOwner('/api/works/' + encodeURIComponent(id)), { method: 'DELETE' });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { msg = (await r.json()).error || msg; } catch {}
      toast('删除失败：' + msg);
      return;
    }
    toast('已删除');
    await load();
  }

  // ---------- 事件 ----------
  $('#grid').addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { openPlayer(decodeURIComponent(play.dataset.play)); return; }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) { del(decodeURIComponent(delBtn.dataset.del)); }
  });

  $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  const fileInput = $('#fileInput');
  const pick = () => fileInput.click();
  $('#btnImport').addEventListener('click', pick);
  $('#btnImport2').addEventListener('click', pick);
  fileInput.addEventListener('change', () => { if (fileInput.files.length) importFiles(fileInput.files); fileInput.value = ''; });

  $('#btnLive').addEventListener('click', () => {
    if (!state.order.length) state.order = visible();
    openLive(null);
  });

  $('#playerClose').addEventListener('click', closePlayer);
  $('#playerPrev').addEventListener('click', () => stepPlayer(-1));
  $('#playerNext').addEventListener('click', () => stepPlayer(1));
  $('#liveClose').addEventListener('click', closeLive);
  $('#livePrev').addEventListener('click', () => stepLive(-1));
  $('#liveNext').addEventListener('click', () => stepLive(1));
  player.addEventListener('click', (e) => { if (e.target === player) closePlayer(); });
  live.addEventListener('click', (e) => { if (e.target === live) closeLive(); });

  document.addEventListener('keydown', (e) => {
    const inLive = !live.classList.contains('hidden');
    const inPlayer = !player.classList.contains('hidden');
    if (!inLive && !inPlayer) return;
    if (e.key === 'Escape') { inLive ? closeLive() : closePlayer(); }
    if (e.key === 'ArrowLeft') { inLive ? stepLive(-1) : stepPlayer(-1); }
    if (e.key === 'ArrowRight') { inLive ? stepLive(1) : stepPlayer(1); }
    if (e.key === ' ' && inLive) { e.preventDefault(); liveVideo.paused ? liveVideo.play() : liveVideo.pause(); }
  });

  // 拖拽导入
  let dragDepth = 0;
  const drop = document.createElement('div');
  drop.className = 'wk-drop hidden';
  drop.innerHTML = '<b>松手，视频就存进我的作品</b>';
  document.body.appendChild(drop);
  window.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    dragDepth++; drop.classList.remove('hidden');
  });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.add('hidden'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; drop.classList.add('hidden');
    if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
  });

  fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then((d) => { state.hosted = !!d.hosted; if (state.items.length) render(); }).catch(() => {});
  load();
})();

