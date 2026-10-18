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
  var S = { list: [], recent: [], ne: [], tab: 'qq', vol: 0.8, mode: 'list', relay: { url: '', token: '' } };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.list)) S.list = raw.list;
      if (Array.isArray(raw.recent)) S.recent = raw.recent;
      if (Array.isArray(raw.ne)) S.ne = raw.ne;
      if (/^(qq|ne|local)$/.test(raw.tab)) S.tab = raw.tab;
      if (raw.vol >= 0 && raw.vol <= 1) S.vol = raw.vol;
      if (/^(list|one|shuffle)$/.test(raw.mode)) S.mode = raw.mode;
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
  function openQQ(url) {
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
  var LP = { tracks: [], cur: -1, audio: null, url: '', coverUrl: '', coverFor: '' };
  /* tracks: {id,name,size,added,title,artist,lrc,cover(Blob),tagged} —— 音频 blob 用时再取 */
  function niceName(file) {
    return file.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
  }

  /* ---------- 读文件里的标签：标题 / 歌手 / 歌词 / 封面（只读文件开头，不上传任何东西） ---------- */
  var dec = {};
  function td(label) { try { return dec[label] || (dec[label] = new TextDecoder(label)); } catch (e) { return dec['utf-8'] || (dec['utf-8'] = new TextDecoder('utf-8')); } }
  function decodeText(u8, enc) {
    if (!u8.length) return '';
    if (enc === 1) return td('utf-16').decode(u8);            /* 带 BOM 的 UTF-16 */
    if (enc === 2) return td('utf-16be').decode(u8);
    if (enc === 3) return td('utf-8').decode(u8);
    /* 0 = ISO-8859-1；国内很多老 mp3 其实是 GBK，先按 UTF-8 试，不对再按 GBK */
    var hi = false; for (var i = 0; i < u8.length; i++) if (u8[i] > 127) { hi = true; break; }
    if (!hi) return td('latin1').decode(u8);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return td('gbk').decode(u8); }
  }
  function clean(s) { return String(s || '').replace(/\u0000/g, '').trim(); }
  /* 在 enc 编码下找字符串结尾（\0 或 \0\0） */
  function strEnd(u8, p, enc) {
    if (enc === 1 || enc === 2) { while (p + 1 < u8.length && (u8[p] || u8[p + 1])) p += 2; return p; }
    while (p < u8.length && u8[p]) p++; return p;
  }
  function parseID3(u8) {
    var out = {};
    if (u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return out;   /* "ID3" */
    var ver = u8[3], flags = u8[5];
    var size = (u8[6] & 127) << 21 | (u8[7] & 127) << 14 | (u8[8] & 127) << 7 | (u8[9] & 127);
    var p = 10, end = Math.min(u8.length, 10 + size);
    if (flags & 0x40) { var ex = ver === 4 ? ((u8[10] & 127) << 21 | (u8[11] & 127) << 14 | (u8[12] & 127) << 7 | (u8[13] & 127)) : ((u8[10] << 24 | u8[11] << 16 | u8[12] << 8 | u8[13]) + 4); p += ex; }
    while (p + 10 <= end) {
      var id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      var fs = ver === 4 ? ((u8[p + 4] & 127) << 21 | (u8[p + 5] & 127) << 14 | (u8[p + 6] & 127) << 7 | (u8[p + 7] & 127))
                         : ((u8[p + 4] << 24) | (u8[p + 5] << 16) | (u8[p + 6] << 8) | u8[p + 7]) >>> 0;
      var b = p + 10, e = Math.min(end, b + fs);
      if (fs <= 0 || b >= end) break;
      var enc = u8[b];
      try {
        if (id === 'TIT2') out.title = clean(decodeText(u8.subarray(b + 1, e), enc));
        else if (id === 'TPE1') out.artist = clean(decodeText(u8.subarray(b + 1, e), enc)).replace(/\u0000/g, ' / ');
        else if (id === 'USLT' && !out.lyrics) {
          var q = strEnd(u8, b + 4, enc); q += (enc === 1 || enc === 2) ? 2 : 1;
          out.lyrics = clean(decodeText(u8.subarray(q, e), enc));
        } else if (id === 'APIC' && !out.cover) {
          var m = b + 1; while (m < e && u8[m]) m++;
          var mime = td('latin1').decode(u8.subarray(b + 1, m)) || 'image/jpeg';
          var d = strEnd(u8, m + 2, enc); d += (enc === 1 || enc === 2) ? 2 : 1;
          if (mime.indexOf('/') < 0) mime = 'image/' + mime.toLowerCase().replace('jpg', 'jpeg');
          if (e > d) out.cover = new Blob([u8.slice(d, e)], { type: mime });
        }
      } catch (err) {}
      p = e;
    }
    return out;
  }
  function parseFLAC(u8) {
    var out = {};
    if (u8[0] !== 0x66 || u8[1] !== 0x4C || u8[2] !== 0x61 || u8[3] !== 0x43) return out;   /* "fLaC" */
    var p = 4, last = false, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    while (!last && p + 4 <= u8.length) {
      last = !!(u8[p] & 0x80);
      var type = u8[p] & 0x7f, len = u8[p + 1] << 16 | u8[p + 2] << 8 | u8[p + 3], b = p + 4;
      if (b + len > u8.length) break;
      try {
        if (type === 4) {                                   /* VORBIS_COMMENT（小端） */
          var q = b + 4 + dv.getUint32(b, true), n = dv.getUint32(q, true); q += 4;
          for (var i = 0; i < n && q + 4 <= b + len; i++) {
            var l = dv.getUint32(q, true), kv = td('utf-8').decode(u8.subarray(q + 4, q + 4 + l)); q += 4 + l;
            var k = kv.slice(0, kv.indexOf('=')).toUpperCase(), v = kv.slice(kv.indexOf('=') + 1);
            if (k === 'TITLE') out.title = clean(v);
            else if (k === 'ARTIST') out.artist = out.artist ? out.artist + ' / ' + clean(v) : clean(v);
            else if ((k === 'LYRICS' || k === 'UNSYNCEDLYRICS') && !out.lyrics) out.lyrics = clean(v);
          }
        } else if (type === 6 && !out.cover) {               /* PICTURE（大端） */
          var r = b + 4, ml = dv.getUint32(r); var mime = td('latin1').decode(u8.subarray(r + 4, r + 4 + ml)); r += 4 + ml;
          r += 4 + dv.getUint32(r); r += 16; var dl = dv.getUint32(r); r += 4;
          out.cover = new Blob([u8.slice(r, r + dl)], { type: mime || 'image/jpeg' });
        }
      } catch (err) {}
      p = b + len;
    }
    return out;
  }
  function readTags(blob) {
    return blob.slice(0, 10).arrayBuffer().then(function (h) {
      var u = new Uint8Array(h), want = 2 * 1024 * 1024;
      if (u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) want = 10 + ((u[6] & 127) << 21 | (u[7] & 127) << 14 | (u[8] & 127) << 7 | (u[9] & 127));
      return blob.slice(0, Math.min(blob.size, want, 16 * 1024 * 1024)).arrayBuffer();
    }).then(function (buf) {
      var u8 = new Uint8Array(buf);
      return u8[0] === 0x66 ? parseFLAC(u8) : parseID3(u8);
    }).catch(function () { return {}; });
  }
  /* LRC：[mm:ss.xx]歌词，支持一行多个时间、[offset:±ms] */
  function parseLRC(text) {
    text = String(text || '');
    var off = 0, m = text.match(/\[offset:\s*([+-]?\d+)\]/i); if (m) off = +m[1] / 1000;
    var lines = [], plain = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    text.split(/\r?\n/).forEach(function (row) {
      var times = [], t; re.lastIndex = 0;
      while ((t = re.exec(row))) times.push(+t[1] * 60 + +t[2] + (t[3] ? +('0.' + t[3]) : 0) - off);
      var words = row.replace(re, '').trim();
      if (times.length) times.forEach(function (x) { lines.push({ t: x, s: words }); });
      else if (words && !/^\[[a-z]+:/i.test(row)) plain.push({ t: -1, s: words });
    });
    if (lines.length) return { synced: true, lines: lines.filter(function (l) { return l.s; }).sort(function (a, b) { return a.t - b.t; }) };
    return { synced: false, lines: plain };
  }

  function meta(r) {
    return { id: r.id, name: r.name, size: r.size, added: r.added, title: r.title || '', artist: r.artist || '', lrc: r.lrc || '', cover: r.cover || null, tagged: !!r.tagged };
  }
  function loadLocal() {
    return tx('readonly', function (st) { return st.getAll(); }).then(function (all) {
      var cur = LP.tracks[LP.cur] && LP.tracks[LP.cur].id;
      LP.tracks = (all || []).map(meta).sort(function (a, b) { return a.added - b.added; });
      if (cur) LP.cur = LP.tracks.findIndex(function (t) { return t.id === cur; });
      renderLocal();
    }).catch(function () { renderLocal(); });
  }
  function baseName(n) { return n.replace(/\.[a-z0-9]{2,5}$/i, '').trim().toLowerCase(); }
  function addFiles(files) {
    var all = Array.prototype.slice.call(files || []);
    var lrcs = {};
    all.forEach(function (f) { if (/\.lrc$/i.test(f.name)) lrcs[baseName(f.name)] = f; });
    var list = all.filter(function (f) { return /^audio\//.test(f.type) || /\.(mp3|m4a|aac|flac|wav|ogg|opus|webm)$/i.test(f.name); });
    if (!list.length && Object.keys(lrcs).length) { attachLrc(lrcs); return; }
    if (!list.length) { status('没有可以播放的音频文件（支持 mp3 / m4a / flac / wav / ogg，歌词支持 .lrc）', true); return; }
    status('正在读取封面和歌词…');
    var now = Date.now();
    Promise.all(list.map(function (f, i) {
      var lf = lrcs[baseName(f.name)];
      return Promise.all([readTags(f), lf ? lf.text().then(function (t) { return t; }, function () { return ''; }) : '']).then(function (res) {
        var tg = res[0];
        return {
          id: now + '_' + i + '_' + Math.random().toString(36).slice(2, 7),
          name: tg.title ? (tg.artist ? tg.artist + ' - ' : '') + tg.title : niceName(f.name),
          size: f.size, added: now + i, blob: f,
          title: tg.title || '', artist: tg.artist || '', lrc: res[1] || tg.lyrics || '', cover: tg.cover || null, tagged: true
        };
      });
    })).then(function (recs) {
      var withLrc = recs.filter(function (r) { return r.lrc; }).length, withCover = recs.filter(function (r) { return r.cover; }).length;
      return tx('readwrite', function (st) { recs.forEach(function (r) { st.put(r); }); })
        .then(function () { status('已加入 ' + recs.length + ' 首 · ' + withCover + ' 首有封面 · ' + withLrc + ' 首有歌词'); return loadLocal(); })
        .catch(function () {
          recs.forEach(function (r) { var m = meta(r); m.mem = r.blob; LP.tracks.push(m); });
          renderLocal();
          status('浏览器不让保存，这些歌只在本次打开期间可播放', true);
        });
    });
  }
  /* 只拖进来 .lrc：按文件名配给已有的歌 */
  function attachLrc(lrcs) {
    var hits = LP.tracks.filter(function (t) { return lrcs[t.name.toLowerCase()] || lrcs[(t.title || '').toLowerCase()]; });
    if (!hits.length) { status('这些歌词文件找不到同名的歌（歌词文件名要和歌曲文件名一样）', true); return; }
    Promise.all(hits.map(function (t) {
      return (lrcs[t.name.toLowerCase()] || lrcs[t.title.toLowerCase()]).text().then(function (txt) {
        t.lrc = txt;
        if (t.mem) return;
        return tx('readwrite', function (st) {
          var g = st.get(t.id);
          g.onsuccess = function () { if (g.result) { g.result.lrc = txt; st.put(g.result); } };
        });
      });
    })).then(function () { status('已给 ' + hits.length + ' 首歌配上歌词'); if (LP.tracks[LP.cur]) xpFill(); });
  }
  function getBlob(t) {
    if (t.mem) return Promise.resolve(t.mem);
    return tx('readonly', function (st) { return st.get(t.id); }).then(function (r) { return r && r.blob; });
  }
  /* 旧版本加进来的歌没读过标签：第一次播放时补读一次 */
  function ensureTags(t, blob) {
    if (t.tagged) return Promise.resolve();
    return readTags(blob).then(function (tg) {
      t.tagged = true;
      t.title = tg.title || ''; t.artist = tg.artist || ''; t.cover = tg.cover || null;
      if (!t.lrc) t.lrc = tg.lyrics || '';
      if (t.mem) return;
      return tx('readwrite', function (st) {
        var g = st.get(t.id);
        g.onsuccess = function () { if (g.result) { var r = g.result; r.tagged = true; r.title = t.title; r.artist = t.artist; r.cover = t.cover; r.lrc = t.lrc; st.put(r); } };
      }).catch(function () {});
    });
  }
  function titleOf(t) { if (t.title) return t.title; var p = t.name.split(/\s+-\s+/); return p.length > 1 ? p.slice(1).join(' - ') : t.name; }
  function artistOf(t) { if (t.artist) return t.artist; var p = t.name.split(/\s+-\s+/); return p.length > 1 ? p[0] : ''; }
  function coverUrl(t) {
    if (!t || !t.cover) return '';
    if (LP.coverFor !== t.id) { if (LP.coverUrl) URL.revokeObjectURL(LP.coverUrl); LP.coverUrl = URL.createObjectURL(t.cover); LP.coverFor = t.id; }
    return LP.coverUrl;
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
      var p = a.play();
      return ensureTags(t, blob).then(function () { return p; });
    }).then(function () {
      if ('mediaSession' in navigator) {
        try {
          var md = { title: titleOf(t), artist: artistOf(t), album: 'To写作工作台' };
          var cu = coverUrl(t); if (cu) md.artwork = [{ src: cu, sizes: '512x512', type: t.cover.type || 'image/jpeg' }];
          navigator.mediaSession.metadata = new MediaMetadata(md);
        } catch (e) {}
      }
      renderLocal(); xpFill();
    }).catch(function () { renderLocal(); xpFill(); });
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
      '<label class="lp-drop"><input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.lrc" multiple hidden>' +
        '<b>＋ 添加音乐</b><span>' + (mobile ? '选择音频文件（可连同同名 .lrc 歌词）' : '选文件或拖进面板 · 同名 .lrc 歌词一起选，歌词会跟着滚动') + '</span></label>' +
    '</div>' +

    '<footer class="mu-f"><p class="mu-st">关掉面板音乐也会继续放。</p></footer>';

  var $ = function (s) { return panel.querySelector(s); };

  /* ---------- 迷你播放条（参考 Hush 群聊歌单的胶囊播放条）：本地音乐播放时常驻，关掉面板也在
     点封面或歌名 → 展开成完整播放页（封面 + 滚动歌词），封面和歌名会「飞」过去 ---------- */
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mini = document.createElement('div');
  mini.className = 'tws-mini';
  mini.hidden = true;
  mini.innerHTML =
    '<button type="button" class="mi-art" data-m="expand" title="展开播放页"><span class="mi-cover"><img alt=""><i class="mi-ph">♪</i></span>' +
      '<span class="mi-eq"><i></i><i></i><i></i><i></i></span></button>' +
    '<button type="button" class="mi-meta" data-m="expand" title="展开播放页"><b class="mi-song"></b><span class="mi-by"></span></button>' +
    '<div class="mi-ctl">' +
      '<button type="button" class="mi-b" data-m="prev" title="上一首">' + I.prev + '</button>' +
      '<button type="button" class="mi-b mi-main" data-m="toggle" title="播放 / 暂停">' + I.play + '</button>' +
      '<button type="button" class="mi-b" data-m="next" title="下一首">' + I.next + '</button>' +
      '<button type="button" class="mi-b mi-x" data-m="stop" title="停止并收起">' + X + '</button>' +
    '</div>' +
    '<div class="mi-prog"><b></b></div>';
  function stopLocal() {
    if (LP.audio) { LP.audio.pause(); LP.audio.removeAttribute('src'); LP.audio.load(); }
    LP.cur = -1; renderLocal(); mini.hidden = true; setXP(false);
  }
  mini.addEventListener('click', function (e) {
    var b = e.target.closest('[data-m]'); if (!b) return;
    var m = b.getAttribute('data-m');
    if (m === 'expand') setXP(true);
    if (m === 'toggle') toggle();
    if (m === 'prev') next(-1);
    if (m === 'next') next(1);
    if (m === 'stop') stopLocal();
  });
  mini.querySelector('.mi-prog').addEventListener('click', function (e) {
    var a = LP.audio; if (!a || !a.duration) return;
    var r = this.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
  });
  function setImg(img, url) {
    if (url) { if (img.getAttribute('src') !== url) img.src = url; img.hidden = false; }
    else { img.removeAttribute('src'); img.hidden = true; }
  }
  function syncMini() {
    var t = LP.tracks[LP.cur];
    if (!t) { mini.hidden = true; if (xpOpen) setXP(false); return; }
    var playing = !!(LP.audio && !LP.audio.paused);
    if (!xpOpen) mini.hidden = false;
    mini.classList.toggle('playing', playing);
    mini.querySelector('.mi-song').textContent = titleOf(t);
    mini.querySelector('.mi-by').textContent = (artistOf(t) ? artistOf(t) + ' · ' : '') + '本地 · ' + MODE[S.mode][0];
    setImg(mini.querySelector('.mi-cover img'), coverUrl(t));
    mini.classList.toggle('has-cover', !!t.cover);
    var m = mini.querySelector('.mi-main'); m.innerHTML = playing ? I.pause : I.play; m.title = playing ? '暂停' : '播放';
    if (xp) syncXP(playing);
  }
  function syncMiniBar() {
    var a = LP.audio, f = a && a.duration ? a.currentTime / a.duration : 0;
    mini.querySelector('.mi-prog b').style.transform = 'scaleX(' + f + ')';
    if (xpOpen) {
      xp.querySelector('.xp-bar').value = Math.round(f * 1000);
      xp.querySelector('.xp-bar').style.setProperty('--p', f * 100 + '%');
      xp.querySelector('.xp-t0').textContent = fmt(a ? a.currentTime : 0);
      xp.querySelector('.xp-t1').textContent = fmt(a ? a.duration : 0);
    }
  }

  /* ---------- 展开播放页 ---------- */
  var xp = null, xpOpen = false, LY = { lines: [], synced: false, cur: -2, raf: 0, forId: '' };
  function buildXP() {
    xp = document.createElement('section');
    xp.className = 'tws-xp';
    xp.hidden = true;
    xp.setAttribute('role', 'dialog');
    xp.setAttribute('aria-label', '正在播放');
    xp.innerHTML =
      '<div class="xp-bg"><img alt=""></div><div class="xp-shade"></div>' +
      '<button type="button" class="xp-close" data-x="close" title="收起（Esc）"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<div class="xp-stage">' +
        '<div class="xp-left">' +
          '<div class="xp-cover"><img alt=""><i class="mi-ph">♪</i></div>' +
          '<div class="xp-meta"><h2 class="xp-title"></h2><p class="xp-by"></p></div>' +
          '<div class="xp-progress"><span class="xp-t0">0:00</span><input class="xp-bar" type="range" min="0" max="1000" value="0" aria-label="进度"><span class="xp-t1">0:00</span></div>' +
          '<div class="xp-ctl">' +
            '<button type="button" class="xp-b" data-x="mode" title="播放模式"></button>' +
            '<button type="button" class="xp-b" data-x="prev" title="上一首">' + I.prev + '</button>' +
            '<button type="button" class="xp-b xp-main" data-x="toggle" title="播放 / 暂停">' + I.play + '</button>' +
            '<button type="button" class="xp-b" data-x="next" title="下一首">' + I.next + '</button>' +
            '<button type="button" class="xp-b" data-x="lrc" title="加歌词（.lrc 文件）">词</button>' +
          '</div>' +
        '</div>' +
        '<div class="xp-right"><div class="xp-lyr"><ol></ol></div></div>' +
      '</div>' +
      '<input class="xp-lrc-in" type="file" accept=".lrc,text/plain" hidden>';
    document.body.appendChild(xp);
    xp.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]');
      if (b) {
        var x = b.getAttribute('data-x');
        if (x === 'close') setXP(false);
        if (x === 'toggle') toggle();
        if (x === 'prev') next(-1);
        if (x === 'next') next(1);
        if (x === 'mode') { S.mode = S.mode === 'list' ? 'one' : S.mode === 'one' ? 'shuffle' : 'list'; save(); syncState(); }
        if (x === 'lrc') xp.querySelector('.xp-lrc-in').click();
        return;
      }
      var li = e.target.closest('.xp-lyr li[data-t]');
      if (li && LP.audio) { LP.audio.currentTime = Math.max(0, +li.getAttribute('data-t')); if (LP.audio.paused) LP.audio.play(); }
      else if (e.target === xp.querySelector('.xp-shade')) setXP(false);
    });
    var bar = xp.querySelector('.xp-bar');
    bar.addEventListener('input', function () { bar.style.setProperty('--p', bar.value / 10 + '%'); });
    bar.addEventListener('change', function () { var a = LP.audio; if (a && a.duration) a.currentTime = bar.value / 1000 * a.duration; });
    xp.querySelector('.xp-lrc-in').addEventListener('change', function () {
      var f = this.files[0], t = LP.tracks[LP.cur]; this.value = '';
      if (!f || !t) return;
      f.text().then(function (txt) {
        t.lrc = txt; LY.forId = ''; xpFill();
        if (!t.mem) tx('readwrite', function (st) { var g = st.get(t.id); g.onsuccess = function () { if (g.result) { g.result.lrc = txt; st.put(g.result); } }; }).catch(function () {});
      });
    });
    document.addEventListener('keydown', function (e) {
      if (!xpOpen) return;
      if (e.key === 'Escape') { e.stopPropagation(); setXP(false); }
      if (e.key === ' ' && !/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) { e.preventDefault(); toggle(); }
    }, true);
    window.addEventListener('resize', function () { if (xpOpen) { LY.cur = -2; tickLyrics(); } });
  }
  /* 填封面、标题、歌词 */
  function xpFill() {
    if (!xp) return;
    var t = LP.tracks[LP.cur]; if (!t) return;
    var cu = coverUrl(t);
    setImg(xp.querySelector('.xp-cover img'), cu);
    setImg(xp.querySelector('.xp-bg img'), cu);
    xp.classList.toggle('has-cover', !!cu);
    xp.querySelector('.xp-title').textContent = titleOf(t);
    xp.querySelector('.xp-by').textContent = artistOf(t) || '本地音乐';
    if (LY.forId === t.id + ':' + (t.lrc || '').length) return;
    LY.forId = t.id + ':' + (t.lrc || '').length;
    var L = parseLRC(t.lrc);
    LY.lines = L.lines; LY.synced = L.synced; LY.cur = -2;
    var ol = xp.querySelector('.xp-lyr ol');
    if (!L.lines.length) {
      ol.innerHTML = '<li class="xp-nolrc">这首歌还没有歌词<br><small>点下面的「词」选一个 .lrc 文件，或者把同名 .lrc 和歌一起加进曲库</small></li>';
    } else {
      ol.innerHTML = L.lines.map(function (l, i) {
        return '<li' + (L.synced ? ' data-t="' + l.t.toFixed(2) + '"' : '') + ' style="--i:' + Math.min(i, 14) + '">' + esc(l.s) + '</li>';
      }).join('');
    }
    xp.querySelector('.xp-lyr').classList.toggle('static', !L.synced);
    ol.style.transform = '';
    tickLyrics();
  }
  /* 当前句高亮，并把它滚到歌词区中间（transform 过渡，交给显卡） */
  function tickLyrics() {
    if (!xpOpen || !LY.synced || !LY.lines.length) return;
    var a = LP.audio, now = a ? a.currentTime + 0.15 : 0, i = -1;
    for (var k = 0; k < LY.lines.length; k++) { if (LY.lines[k].t <= now) i = k; else break; }
    if (i === LY.cur) return;
    var ol = xp.querySelector('.xp-lyr ol'), items = ol.children;
    if (items[LY.cur]) items[LY.cur].classList.remove('on');
    LY.cur = i;
    var box = xp.querySelector('.xp-lyr'), target = items[Math.max(0, i)];
    if (items[i]) items[i].classList.add('on');
    if (target) ol.style.transform = 'translate3d(0,' + Math.round(box.clientHeight * 0.42 - target.offsetTop - target.offsetHeight / 2) + 'px,0)';
  }
  function loopLyrics() {
    cancelAnimationFrame(LY.raf);
    (function f() { tickLyrics(); if (xpOpen) LY.raf = requestAnimationFrame(f); })();
  }
  function syncXP(playing) {
    var m = xp.querySelector('.xp-main'); m.innerHTML = playing ? I.pause : I.play; m.title = playing ? '暂停' : '播放';
    var md = xp.querySelector('[data-x="mode"]'); md.textContent = MODE[S.mode][1]; md.title = MODE[S.mode][0];
    xp.classList.toggle('playing', playing);
  }
  /* 打开 / 收起：支持 View Transitions 的浏览器里，封面和歌名会从胶囊里「飞」到播放页；
     不支持的话退回普通的缩放淡入 */
  function setXP(on) {
    if (on && !LP.tracks[LP.cur]) return;
    if (on === xpOpen) return;
    if (!xp) buildXP();
    var apply = function () {
      xpOpen = on;
      xp.hidden = !on;
      mini.hidden = on || !LP.tracks[LP.cur];
      document.documentElement.classList.toggle('tws-xp-open', on);
      if (on) { xpFill(); syncXP(!!(LP.audio && !LP.audio.paused)); syncMiniBar(); }
    };
    var after = function () { if (on) { LY.cur = -2; loopLyrics(); } else cancelAnimationFrame(LY.raf); };
    if (document.startViewTransition && !reduceMotion) {
      if (!panel.hidden) show(false);
      var vt = document.startViewTransition(apply);
      vt.finished.then(after, after);
    } else {
      if (!panel.hidden) show(false);
      apply();
      if (on && !reduceMotion) { xp.classList.remove('enter'); void xp.offsetWidth; xp.classList.add('enter'); }
      after();
    }
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
    btn.classList.toggle('mu-playing', playing || !!neCur);
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
    renderRecent(); renderQQ(); renderNE(); renderLocal(); renderRelay();
    loadLocal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  (window.TWS = window.TWS || {}).music = { openQQ: openQQ, searchQQ: searchQQ, parseQQ: parseQQ, parseNE: parseNE, addFiles: addFiles, expand: function (v) { setXP(v !== false); }, parseLRC: parseLRC };
})();
