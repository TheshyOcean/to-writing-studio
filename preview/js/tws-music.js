/* ============================================================================
   TWS · 音乐（QQ 音乐遥控器）
   思路：不抓任何接口，播放始终在 QQ 音乐官网里进行。
   - 顶栏加一个音符按钮，点开是一个小面板
   - 搜索：在固定名字的小窗口（tws_qqmusic）里打开官网搜索页；之后每次都复用这个窗口
   - 登录 / 会员 / 播放：全部由官网自己负责，工作台读不到也不碰
   - 收藏：只存「歌名 + 可选的官网链接」在本机 localStorage
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'tws_music_v1';
  var WIN = 'tws_qqmusic';
  var HOME = 'https://y.qq.com/';
  var mobile = document.documentElement.getAttribute('data-shell') === 'mobile';

  /* ---------- 存储 ---------- */
  var S = { list: [], recent: [] };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.list)) S.list = raw.list;
      if (Array.isArray(raw.recent)) S.recent = raw.recent;
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function searchUrl(q) { return 'https://y.qq.com/n/ryqq/search?w=' + encodeURIComponent(q) + '&t=song'; }
  /* 只认 QQ 音乐自己的链接，别的网址一律不打开 */
  function qqUrl(u) {
    try {
      var x = new URL(u);
      if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
      return /(^|\.)qq\.com$/i.test(x.hostname) ? x.href.replace(/^http:/, 'https:') : '';
    } catch (e) { return ''; }
  }
  /* 解析粘贴进来的内容：
     「分享周杰伦的单曲《晴天》https://c6.y.qq.com/base/fcgi-bin/u?__=xxx @QQ音乐」
     「https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV」
     「晴天 - 周杰伦」 */
  function parse(text) {
    text = String(text || '').trim();
    var m = text.match(/https?:\/\/[^\s"'<>，。]+/i);
    var url = m ? qqUrl(m[0]) : '';
    var rest = m ? text.replace(m[0], ' ') : text;
    var title = '';
    var bk = rest.match(/《([^》]+)》/);
    if (bk) {
      title = bk[1];
      var who = rest.match(/分享(.+?)的单曲/);
      if (who) title += ' - ' + who[1].trim();
    } else {
      title = rest.replace(/@?QQ音乐/g, '').replace(/\s+/g, ' ').trim();
    }
    if (!title && url) title = 'QQ 音乐单曲';
    return { t: title.slice(0, 80), u: url };
  }

  /* ---------- 小窗口 ---------- */
  var pop = null;
  function open(url) {
    var feat = '';
    if (!mobile) {
      var w = 460, h = Math.min(820, (screen.availHeight || 900) - 80);
      var left = Math.max(0, (screen.availWidth || 1440) - w - 24);
      feat = 'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=56';
    }
    try { pop = window.open(url, WIN, feat); } catch (e) { pop = null; }
    if (pop) {
      try { pop.focus(); } catch (e) {}
      status('已在 QQ 音乐窗口打开 · 在那边登录后，会员歌也能正常听');
    } else {
      status('浏览器拦截了弹窗：请在地址栏右侧允许本站弹出窗口，再点一次', true);
    }
  }
  function search(q) {
    q = String(q || '').trim();
    if (!q) { open(HOME); return; }
    S.recent = [q].concat(S.recent.filter(function (x) { return x !== q; })).slice(0, 6);
    save(); renderRecent();
    open(searchUrl(q));
  }
  function play(item) { open(item.u || searchUrl(item.t)); }

  /* ---------- 界面 ---------- */
  var NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
  var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  var btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = 'btnMusic';
  btn.type = 'button';
  btn.title = '音乐 · QQ 音乐';
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = NOTE;

  var panel = document.createElement('section');
  panel.className = 'tws-mu';
  panel.id = 'twsMusic';
  panel.setAttribute('aria-label', '音乐');
  panel.hidden = true;
  panel.innerHTML =
    '<header class="mu-h"><span class="sq"></span><b>音乐</b><span class="en">QQ MUSIC · REMOTE</span>' +
      '<button class="icon-btn mu-x" type="button" title="关闭">' + X + '</button></header>' +
    '<form class="mu-row mu-search" autocomplete="off">' +
      '<input class="mu-in" name="q" type="search" placeholder="搜歌名、歌手…" enterkeyhint="search">' +
      '<button class="btn primary mu-go" type="submit">搜索</button>' +
    '</form>' +
    '<div class="mu-recent"></div>' +
    '<div class="mu-sec"><span>/ 我的歌单</span><em class="mu-cnt"></em></div>' +
    '<ul class="mu-list"></ul>' +
    '<form class="mu-row mu-add" autocomplete="off">' +
      '<input class="mu-in" name="a" type="text" placeholder="粘贴 QQ 音乐分享链接，或写「歌名 - 歌手」">' +
      '<button class="btn mu-go" type="submit">收藏</button>' +
    '</form>' +
    '<footer class="mu-f">' +
      '<button class="mu-link" type="button" data-home>打开 QQ 音乐 ↗</button>' +
      '<p class="mu-st">播放在 QQ 音乐官网的小窗口里进行，登录也在那边完成。</p>' +
    '</footer>';

  var $ = function (s) { return panel.querySelector(s); };
  var list = $('.mu-list'), rec = $('.mu-recent'), st = $('.mu-st'), cnt = $('.mu-cnt');

  function status(msg, warn) {
    st.textContent = msg;
    st.classList.toggle('warn', !!warn);
  }
  function renderRecent() {
    rec.innerHTML = S.recent.map(function (q, i) {
      return '<button type="button" class="mu-chip" data-r="' + i + '">' + esc(q) + '</button>';
    }).join('');
    rec.hidden = !S.recent.length;
  }
  function renderList() {
    cnt.textContent = S.list.length ? S.list.length + ' 首' : '';
    if (!S.list.length) {
      list.innerHTML = '<li class="mu-empty">还没有收藏。在 QQ 音乐里点「分享 → 复制链接」，粘贴到下面就能存进来。</li>';
      return;
    }
    list.innerHTML = S.list.map(function (it, i) {
      return '<li class="mu-it">' +
        '<button type="button" class="mu-play" data-p="' + i + '" title="' + (it.u ? '打开歌曲页' : '在 QQ 音乐里搜索') + '">' +
          '<span class="mu-n">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="mu-t">' + esc(it.t) + '</span>' +
          '<span class="mu-k">' + (it.u ? 'LINK' : 'SEARCH') + '</span>' +
        '</button>' +
        '<button type="button" class="mu-del" data-d="' + i + '" title="移除">' + X + '</button>' +
      '</li>';
    }).join('');
  }

  function place() {
    var r = btn.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 10) + 'px';
    if (mobile) { panel.style.left = '10px'; panel.style.right = '10px'; }
    else panel.style.right = Math.max(12, Math.round(window.innerWidth - r.right - 8)) + 'px';
  }
  function show(on) {
    if (on === panel.hidden) {
      if (on) { place(); panel.hidden = false; void panel.offsetWidth; panel.classList.add('on'); $('.mu-search .mu-in').focus(); }
      else { panel.classList.remove('on'); panel.hidden = true; }
    }
    btn.classList.toggle('on', !panel.hidden);
    btn.setAttribute('aria-expanded', String(!panel.hidden));
  }

  btn.addEventListener('click', function (e) { e.stopPropagation(); show(panel.hidden); });
  $('.mu-x').addEventListener('click', function () { show(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) show(false); });
  document.addEventListener('pointerdown', function (e) {
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) show(false);
  });
  window.addEventListener('resize', function () { if (!panel.hidden) place(); });

  $('.mu-search').addEventListener('submit', function (e) {
    e.preventDefault();
    search(this.q.value);
  });
  $('.mu-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var it = parse(this.a.value);
    if (!it.t) { status('先粘贴一个 QQ 音乐的分享链接，或者写上歌名', true); return; }
    S.list.unshift(it); save(); renderList();
    this.a.value = '';
    status('已收藏「' + it.t + '」' + (it.u ? '' : ' · 没有链接，点它会在 QQ 音乐里搜索'));
  });
  rec.addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return;
    var q = S.recent[+b.getAttribute('data-r')];
    $('.mu-search .mu-in').value = q; search(q);
  });
  list.addEventListener('click', function (e) {
    var p = e.target.closest('[data-p]'), d = e.target.closest('[data-d]');
    if (p) play(S.list[+p.getAttribute('data-p')]);
    if (d) { S.list.splice(+d.getAttribute('data-d'), 1); save(); renderList(); }
  });
  $('[data-home]').addEventListener('click', function () { open(HOME); });

  /* ---------- 挂载：顶栏里放在「聊天记录」按钮前面 ---------- */
  function mount() {
    var anchor = document.getElementById('btnDrawer');
    if (!anchor || !anchor.parentNode) return;
    anchor.parentNode.insertBefore(btn, anchor);
    document.body.appendChild(panel);
    renderRecent(); renderList();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  (window.TWS = window.TWS || {}).music = { open: open, search: search, parse: parse };
})();
