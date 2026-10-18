/* ============================================================================
   TWS · 音乐面板（预览版）
   三个来源，都走正规渠道：
   ① QQ 音乐：遥控器。在官网小窗口（tws_qqmusic）里搜索 / 播放，登录与会员都由官网负责
   ② 网易云：官方「外链播放器」嵌在面板里，页面内直接播放
   ③ 本地：用户自己电脑里的音频文件，存在本机 IndexedDB，页面内播放，支持媒体键
   关闭面板不会停止播放（面板只是隐藏，播放器还在）
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'tws_music_v1';
  var WIN = 'tws_qqmusic';
  var HOME = 'https://y.qq.com/';
  var mobile = document.documentElement.getAttribute('data-shell') === 'mobile';

  /* ---------- 存储（歌单、最近搜索、上次的页签） ---------- */
  var S = { list: [], recent: [], ne: [], tab: 'qq', vol: 0.8, mode: 'list', relay: { url: '', token: '' }, qqMode: mobile ? 'popup' : 'dock', dock: { x: -1, y: -1, min: false } };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.list)) S.list = raw.list;
      if (Array.isArray(raw.recent)) S.recent = raw.recent;
      if (Array.isArray(raw.ne)) S.ne = raw.ne;
      if (/^(qq|ne|local)$/.test(raw.tab)) S.tab = raw.tab;
      if (raw.vol >= 0 && raw.vol <= 1) S.vol = raw.vol;
      if (/^(list|one|shuffle)$/.test(raw.mode)) S.mode = raw.mode;
      if (/^(dock|popup)$/.test(raw.qqMode)) S.qqMode = raw.qqMode;
      if (raw.dock && typeof raw.dock === 'object') S.dock = { x: +raw.dock.x || -1, y: +raw.dock.y || -1, min: !!raw.dock.min };
      if (raw.relay && typeof raw.relay === 'object') S.relay = { url: String(raw.relay.url || ''), token: String(raw.relay.token || '') };
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function firstUrl(text) { var m = String(text).match(/https?:\/\/[^\s"'<>，。]+/i); return m ? m[0] : ''; }
  function hostIs(u, re) { try { var x = new URL(u); return /^https?:$/.test(x.protocol) && re.test(x.hostname) ? x : null; } catch (e) { return null; } }
  function fmt(t) { if (!(t >= 0) || !isFinite(t)) return '0:00'; t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

  /* ================================================================
     ① QQ 音乐（遥控器）
     ================================================================ */
  function searchUrl(q) { return 'https://y.qq.com/n/ryqq/search?w=' + encodeURIComponent(q) + '&t=song'; }
  /* 解析：「分享周杰伦的单曲《晴天》https://c6.y.qq.com/... @QQ音乐」/ 歌曲页链接 / 「晴天 - 周杰伦」 */
  function parseQQ(text) {
    text = String(text || '').trim();
    var raw = firstUrl(text);
    var x = raw ? hostIs(raw, /(^|\.)qq\.com$/i) : null;
    var url = x ? x.href.replace(/^http:/, 'https:') : '';
    var rest = raw ? text.replace(raw, ' ') : text;
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
  var pop = null;
  /* ---------- 播放器小窗：把 QQ 音乐官方网页播放器嵌在工作台上（可拖动、最小化） ---------- */
  var dock = null, frame = null;
  function buildDock() {
    dock = document.createElement('section');
    dock.className = 'tws-qqdock';
    dock.setAttribute('aria-label', 'QQ 音乐播放器');
    dock.innerHTML =
      '<header class="qd-h"><span class="sq"></span><b>QQ 音乐</b><span class="en">PLAYER</span>' +
        '<button type="button" class="qd-b" data-q="pop" title="改在独立窗口打开">↗</button>' +
        '<button type="button" class="qd-b" data-q="min" title="最小化（继续播放）">—</button>' +
        '<button type="button" class="qd-b" data-q="close" title="关闭（停止播放）">✕</button></header>' +
      '<div class="qd-body"><div class="qd-view"><iframe name="tws_qqframe" title="QQ 音乐官方网页播放器" allow="autoplay; encrypted-media; clipboard-write"></iframe></div>' +
        '<p class="qd-tip">没显示出来？点右上角 ↗ 在独立窗口打开。听会员歌需要先在浏览器里登录过 QQ 音乐官网。</p></div>';
    document.body.appendChild(dock);
    frame = dock.querySelector('iframe');
    dock.querySelector('.qd-h').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]');
      if (!b) { if (S.dock.min) setMin(false); return; }
      var q = b.getAttribute('data-q');
      if (q === 'min') setMin(!S.dock.min);
      if (q === 'close') closeDock();
      if (q === 'pop') { var u = dock.getAttribute('data-url') || HOME; closeDock(); popQQ(u); }
    });
    /* 拖动标题栏 */
    var h = dock.querySelector('.qd-h'), sx, sy, ox, oy, moved;
    h.addEventListener('pointerdown', function (e) {
      if (e.target.closest('[data-q]') || mobile) return;
      var r = dock.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; moved = false;
      dock.classList.add('dragging'); h.setPointerCapture(e.pointerId);
    });
    h.addEventListener('pointermove', function (e) {
      if (!dock.classList.contains('dragging')) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      placeDock(ox + dx, oy + dy);
    });
    function end() {
      if (!dock.classList.contains('dragging')) return;
      dock.classList.remove('dragging');
      var r = dock.getBoundingClientRect(); S.dock.x = Math.round(r.left); S.dock.y = Math.round(r.top); save();
    }
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    window.addEventListener('resize', function () { if (dock && !dock.hidden) placeDock(S.dock.x, S.dock.y); });
  }
  function placeDock(x, y) {
    if (mobile) return;
    var w = dock.offsetWidth, hh = dock.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    if (!(x >= 0) || !(y >= 0)) {
      x = vw - w - 20; y = Math.max(70, vh - hh - 60);
      if (!panel.hidden) { var pr = panel.getBoundingClientRect(); if (pr.left - w - 14 > 8) x = pr.left - w - 14; }
    }
    x = Math.max(8, Math.min(vw - w - 8, x)); y = Math.max(8, Math.min(vh - 40, y));
    dock.style.left = x + 'px'; dock.style.top = y + 'px';
  }
  function setMin(m) { S.dock.min = m; save(); dock.classList.toggle('min', m); placeDock(S.dock.x, S.dock.y); }
  function openDock(url) {
    if (!dock) buildDock();
    dock.hidden = false;
    dock.setAttribute('data-url', url);
    frame.src = url;
    dock.classList.toggle('min', false); S.dock.min = false;
    placeDock(S.dock.x, S.dock.y);
    btn.classList.add('mu-playing');
    status('已在播放器小窗打开 · 在歌曲页点「播放」就会进入官方播放器');
  }
  function closeDock() {
    if (!dock) return;
    frame.removeAttribute('src'); frame.src = 'about:blank';
    dock.hidden = true; syncState();
  }
  function openQQ(url) {
    if (S.qqMode === 'dock') { if (LP.audio && !LP.audio.paused) LP.audio.pause(); openDock(url); return; }
    popQQ(url);
  }
  function popQQ(url) {
    var feat = '';
    if (!mobile) {
      var w = 460, h = Math.min(820, (screen.availHeight || 900) - 80);
      var left = Math.max(0, (screen.availWidth || 1440) - w - 24);
      feat = 'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=56';
    }
    try { pop = window.open(url, WIN, feat); } catch (e) { pop = null; }
    if (pop) { try { pop.focus(); } catch (e) {} status('已在 QQ 音乐窗口打开 · 在那边登录后，会员歌也能正常听'); }
    else status('浏览器拦截了弹窗：请在地址栏右侧允许本站弹出窗口，再点一次', true);
  }
  function searchQQ(q) {
    q = String(q || '').trim();
    if (!q) { if (!relayOn()) openQQ(HOME); return; }
    S.recent = [q].concat(S.recent.filter(function (x) { return x !== q; })).slice(0, 6);
    save(); renderRecent();
    if (relayOn()) { RES.q = q; RES.page = 0; RES.songs = []; fetchRes('/discover/search', { keyword: q, page: 0 }, '搜索「' + q + '」'); }
    else openQQ(searchUrl(q));
  }

  /* ---------- 官方接口（经你自己的 Cloudflare 中转） ---------- */
  var RELAY_RE = /^(https:\/\/[^\s/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)(\/|$)/;
  function relayOn() { return RELAY_RE.test(S.relay.url) && (!!S.relay.token || /^http:/.test(S.relay.url)); }
  var RES = { q: '', page: 0, songs: [], hasMore: false, title: '', busy: false };
  function songPage(s) { return mobile ? (s.url || 'https://i2.y.qq.com/a/song/' + s.mid) : 'https://y.qq.com/n/ryqq/songDetail/' + s.mid; }
  function fetchRes(path, params, title, more) {
    if (RES.busy) return;
    RES.busy = true; RES.title = title; renderRes(true);
    var base = S.relay.url.replace(/\/+$/, '');
    fetch(base + path, {
      method: 'POST',
      headers: S.relay.token ? { 'Content-Type': 'application/json', 'X-TWS-Token': S.relay.token } : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: params })
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, msg: '中转返回了无法解析的内容（HTTP ' + r.status + '）' }; });
    }).then(function (d) {
      RES.busy = false;
      if (!d || !d.ok) { RES.songs = more ? RES.songs : []; renderRes(); status((d && d.msg) || '请求失败', true); return; }
      RES.songs = more ? RES.songs.concat(d.songs) : d.songs;
      RES.hasMore = !!d.hasMore && path === '/discover/search';
      renderRes();
      if (RES.songs.length) status('点歌名在 QQ 音乐窗口里播放，点 ☆ 收藏');
      else status('没有结果' + (d.msg ? ' · ' + d.msg : '') + (d.debug ? ' · 诊断：' + JSON.stringify(d.debug).slice(0, 400) : ''), !!d.debug);
    }).catch(function () {
      RES.busy = false; renderRes();
      status(/^http:/.test(S.relay.url) ? '连不上本机中转：双击「QQ音乐中转」文件夹里的 qqmusic-relay-hidden.vbs 启动它（1 小时没用会自己关）' : '连不上中转：检查中转地址是否正确', true);
    });
  }
  function renderRes(loading) {
    var box = $('.qq-res');
    if (!RES.title) { box.hidden = true; return; }
    box.hidden = false;
    var h = '<div class="mu-sec"><span>/ ' + esc(RES.title) + '</span><button type="button" class="mu-link" data-rx>清除</button></div>';
    if (loading && !RES.songs.length) h += '<p class="mu-empty">加载中…</p>';
    else if (!RES.songs.length) h += '<p class="mu-empty">没有找到。</p>';
    else {
      h += '<ul class="mu-list">' + RES.songs.map(function (s, i) {
        var fav = S.list.some(function (x) { return x.u === songPage(s); });
        return '<li class="mu-it"><button type="button" class="mu-play" data-rp="' + i + '">' +
          '<span class="mu-n">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="mu-t">' + esc(s.name) + '<small> · ' + esc(s.singer) + '</small></span><span class="mu-k">PLAY</span></button>' +
          '<button type="button" class="mu-fav' + (fav ? ' on' : '') + '" data-rf="' + i + '" title="' + (fav ? '已收藏' : '收藏') + '">' + (fav ? '★' : '☆') + '</button></li>';
      }).join('') + '</ul>';
      if (RES.hasMore) h += '<button type="button" class="mu-more" data-rm>' + (loading ? '加载中…' : '加载更多') + '</button>';
    }
    box.innerHTML = h;
  }
  function renderRelay() {
    var on = relayOn();
    $('.qq-feeds').hidden = !on;
    $('.qq-relay-st').textContent = on ? '已连接中转 · 搜索结果直接显示在这里' : '未连接 · 搜索会打开 QQ 音乐官网';
    $('.qq-relay-st').classList.toggle('on', on);
    var f = $('.qq-relay-form');
    f.url.value = S.relay.url; f.token.value = S.relay.token;
  }

  /* ================================================================
     ② 网易云（官方外链播放器）
     支持：music.163.com/#/song?id=…  /playlist?id=…  /album?id=…  以及 y.music.163.com/m/song?id=…
     ================================================================ */
  var NE_TYPE = { song: 2, playlist: 0, album: 1 };
  function parseNE(text) {
    text = String(text || '').trim();
    var raw = firstUrl(text);
    if (!raw) return { err: '没找到链接。请在网易云里点「分享 → 复制链接」再粘贴' };
    var x = hostIs(raw, /(^|\.)(music\.)?163\.com$|(^|\.)163cn\.tv$/i);
    if (!x) return { err: '这不是网易云音乐的链接' };
    if (/163cn\.tv$/i.test(x.hostname)) return { err: '这是短链接，浏览器里打开一下，复制跳转后地址栏里的完整链接再粘贴' };
    var s = x.pathname + x.search + x.hash;
    var m = s.match(/(song|playlist|album)\?(?:[^#]*&)?id=(\d+)/i) || s.match(/\/(song|playlist|album)\/(\d+)/i);
    if (!m) return { err: '认不出是单曲、歌单还是专辑，换一个链接试试' };
    var kind = m[1].toLowerCase();
    var title = text.replace(raw, ' ');
    var bk = title.match(/《([^》]+)》/) || title.match(/「([^」]+)」/);
    title = bk ? bk[1] : title.replace(/分享|\(来自@?网易云音乐\)|@?网易云音乐/g, '').replace(/\s+/g, ' ').trim();
    if (!title) title = { song: '网易云单曲', playlist: '网易云歌单', album: '网易云专辑' }[kind] + ' ' + m[2];
    return { k: kind, id: m[2], t: title.slice(0, 80) };
  }
  function neSrc(it, auto) {
    var h = it.k === 'song' ? 66 : 430;
    return 'https://music.163.com/outchain/player?type=' + NE_TYPE[it.k] + '&id=' + it.id + '&auto=' + (auto ? 1 : 0) + '&height=' + h;
  }
  var neCur = null;
  function playNE(it) {
    neCur = it;
    var box = $('.ne-player');
    box.innerHTML = '<iframe title="网易云音乐外链播放器" src="' + esc(neSrc(it, true)) + '" frameborder="0" allow="autoplay; encrypted-media"></iframe>';
    box.className = 'ne-player ' + (it.k === 'song' ? 'is-song' : 'is-list');
    $('.ne-now').textContent = '正在播放 · ' + it.t;
    if (LP.audio && !LP.audio.paused) LP.audio.pause();      /* 两个来源别同时响 */
    status('网易云外链只能播放允许外链的歌；VIP / 版权受限的歌会显示无法播放');
  }

  /* ================================================================
     ③ 本地音乐（IndexedDB 持久化 + <audio>）
     ================================================================ */
  var DB = null;
  function db() {
    return new Promise(function (res, rej) {
      if (DB) return res(DB);
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open('tws_music', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('tracks', { keyPath: 'id' }); };
      r.onsuccess = function () { DB = r.result; res(DB); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('tracks', mode), st = t.objectStore('tracks'), out = fn(st);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  var LP = { tracks: [], cur: -1, audio: null, url: '' };   /* tracks: {id,name,size,added} —— blob 用时再取 */
  function niceName(file) {
    return file.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
  }
  function loadLocal() {
    return tx('readonly', function (st) { return st.getAll(); }).then(function (all) {
      LP.tracks = (all || []).map(function (r) { return { id: r.id, name: r.name, size: r.size, added: r.added }; })
        .sort(function (a, b) { return a.added - b.added; });
      renderLocal();
    }).catch(function () { renderLocal(); });
  }
  function addFiles(files) {
    var list = Array.prototype.filter.call(files || [], function (f) {
      return /^audio\//.test(f.type) || /\.(mp3|m4a|aac|flac|wav|ogg|opus|webm)$/i.test(f.name);
    });
    if (!list.length) { status('没有可以播放的音频文件（支持 mp3 / m4a / flac / wav / ogg）', true); return; }
    var now = Date.now();
    var recs = list.map(function (f, i) {
      return { id: now + '_' + i + '_' + Math.random().toString(36).slice(2, 7), name: niceName(f.name), size: f.size, added: now + i, blob: f };
    });
    tx('readwrite', function (st) { recs.forEach(function (r) { st.put(r); }); })
      .then(function () { status('已加入 ' + recs.length + ' 首 · 下次打开还在'); return loadLocal(); })
      .catch(function () {
        /* 存不进去（隐私模式 / 空间不够）就只在这次打开时播放 */
        recs.forEach(function (r) { LP.tracks.push({ id: r.id, name: r.name, size: r.size, added: r.added, mem: r.blob }); });
        renderLocal();
        status('浏览器不让保存，这些歌只在本次打开期间可播放', true);
      });
  }
  function getBlob(t) {
    if (t.mem) return Promise.resolve(t.mem);
    return tx('readonly', function (st) { return st.get(t.id); }).then(function (r) { return r && r.blob; });
  }
  function ensureAudio() {
    if (LP.audio) return LP.audio;
    var a = LP.audio = new Audio();
    a.preload = 'metadata';
    a.volume = S.vol;
    a.addEventListener('timeupdate', syncBar);
    a.addEventListener('loadedmetadata', syncBar);
    a.addEventListener('play', syncState);
    a.addEventListener('pause', syncState);
    a.addEventListener('ended', function () {
      if (S.mode === 'one') { a.currentTime = 0; a.play(); }
      else next(1, true);
    });
    a.addEventListener('error', function () { if (LP.cur >= 0) status('这首歌播放失败，文件可能损坏或格式不支持', true); });
    return a;
  }
  function playLocal(i) {
    var t = LP.tracks[i]; if (!t) return;
    var a = ensureAudio();
    getBlob(t).then(function (blob) {
      if (!blob) { status('找不到这首歌的文件，删掉重新加一次吧', true); return; }
      if (LP.url) URL.revokeObjectURL(LP.url);
      LP.url = URL.createObjectURL(blob);
      LP.cur = i;
      a.src = LP.url;
      var ne = $('.ne-player iframe'); if (ne) { $('.ne-player').innerHTML = ''; $('.ne-now').textContent = ''; neCur = null; }  /* 停掉网易云 */
      return a.play();
    }).then(function () {
      if ('mediaSession' in navigator) {
        var p = t.name.split(/\s+-\s+/);
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: p.length > 1 ? p.slice(1).join(' - ') : t.name, artist: p.length > 1 ? p[0] : '', album: 'To写作工作台'
          });
        } catch (e) {}
      }
      renderLocal();
    }).catch(function () { renderLocal(); });
  }
  function next(dir, auto) {
    var n = LP.tracks.length; if (!n) return;
    var i;
    if (S.mode === 'shuffle' && n > 1) { do { i = Math.floor(Math.random() * n); } while (i === LP.cur); }
    else {
      i = LP.cur + dir;
      if (i >= n) { if (auto && S.mode === 'list' && n === 1) return; i = 0; }
      if (i < 0) i = n - 1;
    }
    playLocal(i);
  }
  function toggle() {
    var a = ensureAudio();
    if (LP.cur < 0) { playLocal(0); return; }
    if (a.paused) a.play(); else a.pause();
  }
  function removeLocal(i) {
    var t = LP.tracks[i]; if (!t) return;
    if (i === LP.cur && LP.audio) { LP.audio.pause(); LP.audio.removeAttribute('src'); LP.audio.load(); LP.cur = -1; }
    else if (i < LP.cur) LP.cur--;
    LP.tracks.splice(i, 1);
    if (!t.mem) tx('readwrite', function (st) { st.delete(t.id); }).catch(function () {});
    renderLocal();
  }
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', function () { toggle(); });
      navigator.mediaSession.setActionHandler('pause', function () { toggle(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { next(-1); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { next(1); });
    } catch (e) {}
  }

  /* ================================================================
     界面
     ================================================================ */
  var NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
  var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var I = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2v12H7zM20 6.8v10.4a.8.8 0 0 1-1.2.7L11 12.7a.8.8 0 0 1 0-1.4l7.8-5.2a.8.8 0 0 1 1.2.7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 6h2v12h-2zM4 6.8v10.4a.8.8 0 0 0 1.2.7L13 12.7a.8.8 0 0 0 0-1.4L5.2 6.1A.8.8 0 0 0 4 6.8z"/></svg>'
  };
  var MODE = { list: ['列表循环', '⇄'], one: ['单曲循环', '①'], shuffle: ['随机播放', '⤨'] };

  var btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.id = 'btnMusic';
  btn.type = 'button';
  btn.title = '音乐';
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = NOTE + '<i class="mu-dot" aria-hidden="true"></i>';

  var panel = document.createElement('section');
  panel.className = 'tws-mu';
  panel.id = 'twsMusic';
  panel.setAttribute('aria-label', '音乐');
  panel.hidden = true;
  panel.innerHTML =
    '<header class="mu-h"><span class="sq"></span><b>音乐</b><span class="en">MUSIC · SIDE DECK</span>' +
      '<button class="icon-btn mu-x" type="button" title="关闭（不会停止播放）">' + X + '</button></header>' +
    '<nav class="mu-tabs seg" role="tablist">' +
      '<button type="button" role="tab" data-tab="qq">QQ 音乐</button>' +
      '<button type="button" role="tab" data-tab="ne">网易云</button>' +
      '<button type="button" role="tab" data-tab="local">本地</button>' +
    '</nav>' +

    /* ---- QQ ---- */
    '<div class="mu-pane" data-pane="qq">' +
      '<form class="mu-row mu-search" autocomplete="off">' +
        '<input class="mu-in" name="q" type="search" placeholder="搜歌名、歌手…" enterkeyhint="search">' +
        '<button class="btn primary mu-go" type="submit">搜索</button>' +
      '</form>' +
      '<div class="mu-recent"></div>' +
      '<div class="qq-feeds"><button type="button" class="mu-chip" data-feed="daily">✦ 每日推荐</button><button type="button" class="mu-chip" data-feed="radio">◎ 猜你喜欢</button></div>' +
      '<div class="qq-res" hidden></div>' +
      '<div class="mu-sec"><span>/ QQ 音乐收藏</span><em class="qq-cnt"></em></div>' +
      '<ul class="mu-list qq-list"></ul>' +
      '<form class="mu-row mu-add qq-add" autocomplete="off">' +
        '<input class="mu-in" name="a" type="text" placeholder="粘贴 QQ 音乐分享链接，或写「歌名 - 歌手」">' +
        '<button class="btn mu-go" type="submit">收藏</button>' +
      '</form>' +
      '<div class="qq-mode"><span>播放位置</span><div class="seg"><button type="button" data-qm="dock">工作台小窗</button><button type="button" data-qm="popup">独立窗口</button></div></div>' +
      '<p class="mu-tip">用的是 QQ 音乐官网自己的播放器，登录和会员都由官网负责。<button class="mu-link" type="button" data-home>打开 QQ 音乐</button></p>' +
      '<details class="qq-relay"><summary><span class="qq-relay-st"></span><em>连接设置</em></summary>' +
        '<form class="qq-relay-form" autocomplete="off">' +
          '<label>中转地址<input class="mu-in" name="url" type="url" placeholder="http://127.0.0.1:17890" spellcheck="false"></label>' +
          '<label>访问密码<input class="mu-in" name="token" type="password" placeholder="本机中转不用填" autocomplete="new-password"></label>' +
          '<div class="mu-row" style="padding:0"><button class="btn primary mu-go" type="submit">保存并测试</button><button class="btn mu-go" type="button" data-relay-clear>断开</button></div>' +
          '<p class="mu-tip" style="margin:0">QQ 音乐的 API Key 只填在 Cloudflare 里，不要填在这里。</p>' +
        '</form></details>' +
    '</div>' +

    /* ---- 网易云 ---- */
    '<div class="mu-pane" data-pane="ne">' +
      '<form class="mu-row ne-add" autocomplete="off">' +
        '<input class="mu-in" name="a" type="text" placeholder="粘贴网易云的单曲 / 歌单 / 专辑链接">' +
        '<button class="btn primary mu-go" type="submit">播放</button>' +
      '</form>' +
      '<p class="ne-now"></p>' +
      '<div class="ne-player"></div>' +
      '<div class="mu-sec"><span>/ 网易云收藏</span><em class="ne-cnt"></em></div>' +
      '<ul class="mu-list ne-list"></ul>' +
      '<p class="mu-tip">用的是网易云官方外链播放器，在这里直接播放。VIP 或版权受限的歌可能放不了。</p>' +
    '</div>' +

    /* ---- 本地 ---- */
    '<div class="mu-pane" data-pane="local">' +
      '<div class="lp-deck">' +
        '<div class="lp-title"><span class="lp-now">还没有在放</span><span class="lp-time">0:00 / 0:00</span></div>' +
        '<input class="lp-bar" type="range" min="0" max="1000" value="0" aria-label="进度">' +
        '<div class="lp-ctl">' +
          '<button type="button" class="lp-b" data-a="mode" title="播放模式"></button>' +
          '<button type="button" class="lp-b" data-a="prev" title="上一首">' + I.prev + '</button>' +
          '<button type="button" class="lp-b lp-main" data-a="toggle" title="播放 / 暂停">' + I.play + '</button>' +
          '<button type="button" class="lp-b" data-a="next" title="下一首">' + I.next + '</button>' +
          '<input class="lp-vol" type="range" min="0" max="100" aria-label="音量" title="音量">' +
        '</div>' +
      '</div>' +
      '<div class="mu-sec"><span>/ 本地曲库</span><em class="lp-cnt"></em></div>' +
      '<ul class="mu-list lp-list"></ul>' +
      '<label class="lp-drop"><input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus" multiple hidden>' +
        '<b>＋ 添加音乐</b><span>' + (mobile ? '从手机里选择音频文件' : '点这里选文件，或把音频拖进面板') + '</span></label>' +
    '</div>' +

    '<footer class="mu-f"><p class="mu-st">关掉面板音乐也会继续放。</p></footer>';

  var $ = function (s) { return panel.querySelector(s); };

  /* ---------- 迷你播放条（参考 Hush 群聊歌单的胶囊播放条）：本地音乐播放时常驻，关掉面板也在 ---------- */
  var mini = document.createElement('div');
  mini.className = 'tws-mini';
  mini.hidden = true;
  mini.innerHTML =
    '<button type="button" class="mi-eq" data-m="open" title="打开音乐面板"><i></i><i></i><i></i><i></i></button>' +
    '<button type="button" class="mi-meta" data-m="open" title="打开音乐面板"><b class="mi-song"></b><span class="mi-by"></span></button>' +
    '<div class="mi-ctl">' +
      '<button type="button" class="mi-b" data-m="prev" title="上一首">' + I.prev + '</button>' +
      '<button type="button" class="mi-b mi-main" data-m="toggle" title="播放 / 暂停">' + I.play + '</button>' +
      '<button type="button" class="mi-b" data-m="next" title="下一首">' + I.next + '</button>' +
      '<button type="button" class="mi-b mi-x" data-m="stop" title="停止并收起">' + X + '</button>' +
    '</div>' +
    '<div class="mi-prog"><b></b></div>';
  mini.addEventListener('click', function (e) {
    var b = e.target.closest('[data-m]'); if (!b) return;
    var m = b.getAttribute('data-m');
    if (m === 'open') { show(true); setTab('local'); }
    if (m === 'toggle') toggle();
    if (m === 'prev') next(-1);
    if (m === 'next') next(1);
    if (m === 'stop') {
      if (LP.audio) { LP.audio.pause(); LP.audio.removeAttribute('src'); LP.audio.load(); }
      LP.cur = -1; renderLocal(); mini.hidden = true;
    }
  });
  mini.querySelector('.mi-prog').addEventListener('click', function (e) {
    var a = LP.audio; if (!a || !a.duration) return;
    var r = this.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
  });
  function syncMini() {
    var t = LP.tracks[LP.cur];
    if (!t) { mini.hidden = true; return; }
    var playing = !!(LP.audio && !LP.audio.paused);
    var parts = t.name.split(/\s+-\s+/);
    mini.hidden = false;
    mini.classList.toggle('playing', playing);
    mini.querySelector('.mi-song').textContent = parts.length > 1 ? parts.slice(1).join(' - ') : t.name;
    mini.querySelector('.mi-by').textContent = (parts.length > 1 ? parts[0] + ' · ' : '') + '本地 · ' + MODE[S.mode][0];
    var m = mini.querySelector('.mi-main'); m.innerHTML = playing ? I.pause : I.play; m.title = playing ? '暂停' : '播放';
  }
  function syncMiniBar() {
    var a = LP.audio;
    mini.querySelector('.mi-prog b').style.transform = 'scaleX(' + (a && a.duration ? a.currentTime / a.duration : 0) + ')';
  }
  var st = $('.mu-st');
  function status(msg, warn) { st.textContent = msg; st.classList.toggle('warn', !!warn); }

  /* ---------- 渲染 ---------- */
  function row(i, name, kind, extra, on) {
    return '<li class="mu-it' + (on ? ' cur' : '') + '">' +
      '<button type="button" class="mu-play" data-p="' + i + '">' +
        '<span class="mu-n">' + (on ? '<i class="eqi"><b></b><b></b><b></b></i>' : String(i + 1).padStart(2, '0')) + '</span>' +
        '<span class="mu-t">' + esc(name) + '</span>' +
        (extra ? '<span class="mu-m">' + esc(extra) + '</span>' : '') +
        (kind ? '<span class="mu-k">' + kind + '</span>' : '') +
      '</button>' +
      '<button type="button" class="mu-del" data-d="' + i + '" title="移除">' + X + '</button></li>';
  }
  function renderRecent() {
    var rec = $('.mu-recent');
    rec.innerHTML = S.recent.map(function (q, i) { return '<button type="button" class="mu-chip" data-r="' + i + '">' + esc(q) + '</button>'; }).join('');
    rec.hidden = !S.recent.length;
  }
  function renderQQ() {
    $('.qq-cnt').textContent = S.list.length ? S.list.length + ' 首' : '';
    $('.qq-list').innerHTML = S.list.length ? S.list.map(function (it, i) { return row(i, it.t, it.u ? 'LINK' : 'SEARCH'); }).join('')
      : '<li class="mu-empty">在 QQ 音乐里点「分享 → 复制链接」，粘贴到下面就能存进来。</li>';
  }
  function renderNE() {
    $('.ne-cnt').textContent = S.ne.length ? S.ne.length + ' 个' : '';
    $('.ne-list').innerHTML = S.ne.length ? S.ne.map(function (it, i) {
      return row(i, it.t, { song: 'SONG', playlist: 'LIST', album: 'ALBUM' }[it.k], '', neCur && neCur.id === it.id && neCur.k === it.k);
    }).join('') : '<li class="mu-empty">在网易云里点「分享 → 复制链接」，粘贴到上面。播放过的会自动收进这里。</li>';
  }
  function renderLocal() {
    $('.lp-cnt').textContent = LP.tracks.length ? LP.tracks.length + ' 首' : '';
    var playing = LP.audio && !LP.audio.paused;
    $('.lp-list').innerHTML = LP.tracks.length ? LP.tracks.map(function (t, i) {
      return row(i, t.name, '', (t.size / 1048576).toFixed(1) + 'M', i === LP.cur && playing);
    }).join('') : '<li class="mu-empty">还没有歌。加进来的音乐只存在这台设备的浏览器里，不会上传。</li>';
    var t = LP.tracks[LP.cur];
    $('.lp-now').textContent = t ? t.name : '还没有在放';
    syncState();
  }
  function syncBar() {
    var a = LP.audio; if (!a) return;
    syncMiniBar();
    var d = a.duration || 0;
    if (!dragging) $('.lp-bar').value = d ? Math.round(a.currentTime / d * 1000) : 0;
    $('.lp-bar').style.setProperty('--p', (d ? a.currentTime / d * 100 : 0) + '%');
    $('.lp-time').textContent = fmt(a.currentTime) + ' / ' + fmt(d);
  }
  function syncState() {
    var playing = !!(LP.audio && !LP.audio.paused);
    var m = $('.lp-main'); m.innerHTML = playing ? I.pause : I.play; m.title = playing ? '暂停' : '播放';
    var md = $('[data-a="mode"]'); md.textContent = MODE[S.mode][1]; md.title = MODE[S.mode][0];
    syncMini();
    btn.classList.toggle('mu-playing', playing || !!neCur || !!(dock && !dock.hidden));
    var cur = panel.querySelector('.lp-list .mu-it.cur');
    if (cur && !playing) renderLocalSoon();
    if (!cur && playing && LP.cur >= 0) renderLocalSoon();
  }
  var rq = 0;
  function renderLocalSoon() { if (rq) return; rq = requestAnimationFrame(function () { rq = 0; renderLocal(); }); }
  function setTab(t) {
    S.tab = t; save();
    panel.querySelectorAll('[data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === t;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    panel.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== t; });
  }

  /* ---------- 开关面板 ---------- */
  function place() {
    var r = btn.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 10) + 'px';
    if (mobile) { panel.style.left = '10px'; panel.style.right = '10px'; }
    else panel.style.right = Math.max(12, Math.round(window.innerWidth - r.right - 8)) + 'px';
  }
  function show(on) {
    if (on === panel.hidden) {
      if (on) { place(); panel.hidden = false; void panel.offsetWidth; panel.classList.add('on'); }
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
  $('.mu-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.getAttribute('data-tab')); });

  /* ---------- QQ 事件 ---------- */
  $('.mu-search').addEventListener('submit', function (e) { e.preventDefault(); searchQQ(this.q.value); });
  $('.qq-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var it = parseQQ(this.a.value);
    if (!it.t) { status('先粘贴一个 QQ 音乐的分享链接，或者写上歌名', true); return; }
    S.list.unshift(it); save(); renderQQ(); this.a.value = '';
    status('已收藏「' + it.t + '」' + (it.u ? '' : ' · 没有链接，点它会在 QQ 音乐里搜索'));
  });
  $('.mu-recent').addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return;
    var q = S.recent[+b.getAttribute('data-r')]; $('.mu-search .mu-in').value = q; searchQQ(q);
  });
  $('.qq-list').addEventListener('click', function (e) {
    var p = e.target.closest('[data-p]'), d = e.target.closest('[data-d]');
    if (p) { var it = S.list[+p.getAttribute('data-p')]; openQQ(it.u || searchUrl(it.t)); }
    if (d) { S.list.splice(+d.getAttribute('data-d'), 1); save(); renderQQ(); }
  });
  $('[data-home]').addEventListener('click', function () { openQQ(HOME); });
  function renderMode() {
    panel.querySelectorAll('[data-qm]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-qm') === S.qqMode); });
  }
  $('.qq-mode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-qm]'); if (!b) return;
    S.qqMode = b.getAttribute('data-qm'); save(); renderMode();
    status(S.qqMode === 'dock' ? '之后点歌会在工作台上的播放器小窗里打开' : '之后点歌会弹出独立的 QQ 音乐窗口');
  });
  $('.qq-feeds').addEventListener('click', function (e) {
    var b = e.target.closest('[data-feed]'); if (!b) return;
    var f = b.getAttribute('data-feed');
    RES.q = ''; RES.songs = [];
    fetchRes(f === 'daily' ? '/discover/daily-mix' : '/discover/radio', {}, f === 'daily' ? '每日推荐' : '猜你喜欢');
  });
  $('.qq-res').addEventListener('click', function (e) {
    var p = e.target.closest('[data-rp]'), f = e.target.closest('[data-rf]');
    if (p) openQQ(songPage(RES.songs[+p.getAttribute('data-rp')]));
    if (f) {
      var s = RES.songs[+f.getAttribute('data-rf')], u = songPage(s);
      if (!S.list.some(function (x) { return x.u === u; })) {
        S.list.unshift({ t: s.name + ' - ' + s.singer, u: u }); save(); renderQQ(); renderRes();
        status('已收藏「' + s.name + '」');
      }
    }
    if (e.target.closest('[data-rx]')) { RES.title = ''; RES.songs = []; renderRes(); }
    if (e.target.closest('[data-rm]') && RES.q) { RES.page++; fetchRes('/discover/search', { keyword: RES.q, page: RES.page }, '搜索「' + RES.q + '」', true); }
  });
  $('.qq-relay-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = this.url.value.trim(), t = this.token.value.trim();
    if (!RELAY_RE.test(u)) { status('中转地址不对：本机中转填 http://127.0.0.1:17890', true); return; }
    if (!t && !/^http:/.test(u)) { status('云端中转需要填访问密码', true); return; }
    S.relay = { url: u, token: t }; save(); renderRelay();
    RES.q = ''; RES.songs = [];
    fetchRes('/discover/daily-mix', {}, '每日推荐');
  });
  $('[data-relay-clear]').addEventListener('click', function () {
    S.relay = { url: '', token: '' }; save(); renderRelay(); RES.title = ''; renderRes(); status('已断开中转');
  });

  /* ---------- 网易云事件 ---------- */
  $('.ne-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var it = parseNE(this.a.value);
    if (it.err) { status(it.err, true); return; }
    S.ne = [it].concat(S.ne.filter(function (x) { return !(x.k === it.k && x.id === it.id); })).slice(0, 40);
    save(); this.a.value = '';
    playNE(it); renderNE(); syncState();
  });
  $('.ne-list').addEventListener('click', function (e) {
    var p = e.target.closest('[data-p]'), d = e.target.closest('[data-d]');
    if (p) { playNE(S.ne[+p.getAttribute('data-p')]); renderNE(); syncState(); }
    if (d) {
      var it = S.ne.splice(+d.getAttribute('data-d'), 1)[0]; save();
      if (neCur && it && neCur.id === it.id && neCur.k === it.k) { $('.ne-player').innerHTML = ''; $('.ne-now').textContent = ''; neCur = null; }
      renderNE(); syncState();
    }
  });

  /* ---------- 本地事件 ---------- */
  var dragging = false;
  var bar = $('.lp-bar');
  bar.addEventListener('input', function () {
    dragging = true;
    var a = LP.audio; if (a && a.duration) $('.lp-time').textContent = fmt(bar.value / 1000 * a.duration) + ' / ' + fmt(a.duration);
    bar.style.setProperty('--p', bar.value / 10 + '%');
  });
  bar.addEventListener('change', function () {
    dragging = false;
    var a = LP.audio; if (a && a.duration) a.currentTime = bar.value / 1000 * a.duration;
  });
  var vol = $('.lp-vol');
  vol.value = Math.round(S.vol * 100);
  vol.style.setProperty('--p', vol.value + '%');
  vol.addEventListener('input', function () {
    S.vol = vol.value / 100; vol.style.setProperty('--p', vol.value + '%');
    if (LP.audio) LP.audio.volume = S.vol;
  });
  vol.addEventListener('change', save);
  $('.lp-ctl').addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.getAttribute('data-a');
    if (a === 'toggle') toggle();
    if (a === 'prev') next(-1);
    if (a === 'next') next(1);
    if (a === 'mode') { S.mode = S.mode === 'list' ? 'one' : S.mode === 'one' ? 'shuffle' : 'list'; save(); syncState(); status('播放模式：' + MODE[S.mode][0]); }
  });
  $('.lp-list').addEventListener('click', function (e) {
    var p = e.target.closest('[data-p]'), d = e.target.closest('[data-d]');
    if (p) { var i = +p.getAttribute('data-p'); if (i === LP.cur) toggle(); else playLocal(i); }
    if (d) removeLocal(+d.getAttribute('data-d'));
  });
  var fileIn = $('.lp-drop input');
  fileIn.addEventListener('change', function () { addFiles(fileIn.files); fileIn.value = ''; });
  panel.addEventListener('dragover', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
      e.preventDefault(); panel.classList.add('drag');
      if (S.tab !== 'local') setTab('local');
    }
  });
  panel.addEventListener('dragleave', function (e) { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drag'); });
  panel.addEventListener('drop', function (e) {
    panel.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  });

  /* ---------- 挂载 ---------- */
  function mount() {
    var anchor = document.getElementById('btnDrawer');
    if (!anchor || !anchor.parentNode) return;
    anchor.parentNode.insertBefore(btn, anchor);
    document.body.appendChild(panel);
    document.body.appendChild(mini);
    setTab(S.tab);
    renderRecent(); renderQQ(); renderNE(); renderLocal(); renderRelay(); renderMode();
    loadLocal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  (window.TWS = window.TWS || {}).music = { openQQ: openQQ, searchQQ: searchQQ, parseQQ: parseQQ, parseNE: parseNE, addFiles: addFiles };
})();
