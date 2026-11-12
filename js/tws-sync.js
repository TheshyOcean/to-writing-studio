/* ============================================================
   To Writing Studio · 自动备份到本地文件夹 / 离线可用（V3.5.0）
   ------------------------------------------------------------
   ① 自动备份到本地文件夹（File System Access API，Chrome / Edge 电脑版）
      选一次文件夹，之后书稿一有改动就自动把整本书写进去：
      「To写作工作台-自动备份.json」是最新的一份，另外每天留一份，保留 14 天。
      浏览器重启后要点一下才能继续写入（浏览器的安全限制）。
   ② 离线可用：注册 sw.js，把界面文件缓存下来，断网也能打开写。
   备份内容来自 js/tws-backup.js 的 build()，所以同样不含 API Key。
   不做云同步：想上云，把文件夹选在网盘客户端的同步目录里即可。
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  function U() { return T.ui; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function esc(s) { return T.data.esc(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtSize(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB'; }
  function toast(m) { if (U()) U().toast(m); }

  var dirty = false;          // 上次备份之后有没有新的改动
  var listeners = [];
  function changed() { listeners = listeners.filter(function (f) { try { return f() !== false; } catch (e) { return true; } }); }

  /* ============================================================
     ① 本地文件夹
     ============================================================ */
  var FS_OK = typeof window.showDirectoryPicker === 'function';
  var LATEST = 'To写作工作台-自动备份.json';
  var DAILY = /^To写作工作台-(\d{4}-\d{2}-\d{2})\.json$/;
  var KEEP_DAYS = 14;
  var fs = { handle: null, state: 'none', last: 0, err: '', size: 0, timer: 0, busy: false };   // state: none | ok | ask | error

  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('tws_kit', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function kvGet(k) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction('kv', 'readonly').objectStore('kv').get(k);
        q.onsuccess = function () { db.close(); res(q.result); };
        q.onerror = function () { db.close(); rej(q.error); };
      });
    });
  }
  function kvSet(k, v) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', 'readwrite');
        if (v == null) tx.objectStore('kv').delete(k); else tx.objectStore('kv').put(v, k);
        tx.oncomplete = function () { db.close(); res(); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function perm(h, ask) {
    var o = { mode: 'readwrite' };
    if (!h.queryPermission) return Promise.resolve('granted');
    return h.queryPermission(o).then(function (p) {
      if (p === 'granted' || !ask) return p;
      return h.requestPermission(o);
    });
  }
  function writeFile(dir, name, text) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); });
    });
  }
  function prune(dir) {
    if (!dir.entries) return Promise.resolve();
    var dead = dayStr(Date.now() - KEEP_DAYS * 864e5), kill = [];
    var it = dir.entries();
    return (function next() {
      return it.next().then(function (r) {
        if (r.done) return;
        var m = r.value[0].match(DAILY);
        if (m && m[1] < dead) kill.push(r.value[0]);
        return next();
      });
    })().then(function () {
      return Promise.all(kill.map(function (n) { return dir.removeEntry(n).catch(function () {}); }));
    });
  }
  function fsWrite() {
    if (!fs.handle || fs.state !== 'ok' || fs.busy) return Promise.resolve(false);
    fs.busy = true;
    return T.backup.build().then(function (pack) {
      var text = JSON.stringify(pack);
      return writeFile(fs.handle, LATEST, text)
        .then(function () { return writeFile(fs.handle, 'To写作工作台-' + dayStr(Date.now()) + '.json', text); })
        .then(function () { return prune(fs.handle).catch(function () {}); })
        .then(function () {
          fs.last = Date.now(); fs.size = text.length; fs.err = '';
          lsSet('tws_fsbackup_last', String(fs.last));
          /* 手动备份的「太久没备份」提醒也跟着算已备份 */
          lsSet('tws_backup_last', JSON.stringify({ t: fs.last, w: pack.summary.words }));
          return true;
        });
    }).then(function (ok) { if (ok) dirty = false; return ok; }).catch(function (e) {
      fs.err = (e && e.name === 'NotAllowedError') ? '浏览器收回了写入权限' : (e && e.message) || '写入失败';
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) fs.state = 'ask';
      else if (e && e.name === 'NotFoundError') { fs.state = 'error'; fs.err = '找不到这个文件夹了（被移动或删除）'; }
      return false;
    }).then(function (ok) { fs.busy = false; changed(); return ok; });
  }
  function fsSchedule() {
    if (fs.state !== 'ok') return;
    clearTimeout(fs.timer);
    fs.timer = setTimeout(function () { fsWrite(); }, 20000);     // 停笔 20 秒后写一次
  }
  function fsPick() {
    if (!FS_OK) return Promise.reject(new Error('这个浏览器不支持'));
    return window.showDirectoryPicker({ mode: 'readwrite', id: 'tws-backup' }).then(function (h) {
      return perm(h, true).then(function (p) {
        if (p !== 'granted') throw new Error('没有拿到写入权限');
        fs.handle = h; fs.state = 'ok'; fs.err = '';
        return kvSet('dir', h).catch(function () {});
      });
    }).then(function () { return fsWrite(); }).then(function (ok) {
      changed();
      if (ok) toast('已开启自动备份，第一份已经写进「' + fs.handle.name + '」');
      return ok;
    });
  }
  function fsResume() {
    if (!fs.handle) return Promise.resolve(false);
    return perm(fs.handle, true).then(function (p) {
      if (p !== 'granted') { fs.state = 'ask'; changed(); return false; }
      fs.state = 'ok'; changed();
      return fsWrite();
    }).catch(function () { return false; });
  }
  function fsStop() {
    clearTimeout(fs.timer);
    fs.handle = null; fs.state = 'none'; fs.err = '';
    return kvSet('dir', null).catch(function () {}).then(changed);
  }
  function fsInit() {
    if (!FS_OK || !window.indexedDB) return;
    fs.last = Number(lsGet('tws_fsbackup_last')) || 0;
    kvGet('dir').then(function (h) {
      if (!h) return;
      fs.handle = h;
      return perm(h, false).then(function (p) {
        fs.state = p === 'granted' ? 'ok' : 'ask';
        changed();
        if (fs.state === 'ask') setTimeout(fsNag, 9500);
      });
    }).catch(function () {});
  }
  /* 浏览器重启后权限要重新点一下：给一条不挡事的提示 */
  function fsNag() {
    if (fs.state !== 'ask' || document.querySelector('.tws-fs-nag')) return;
    var bar = document.createElement('div');
    bar.className = 'tws-bk-nag tws-fs-nag';
    bar.innerHTML = '<span>自动备份到「' + esc(fs.handle.name) + '」暂停了，浏览器重启后需要你点一下才能继续。</span>' +
      '<button class="tws-btn sm primary" data-go>继续自动备份</button><button class="tws-x" data-x>✕</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('on'); });
    function close() { bar.classList.remove('on'); setTimeout(function () { bar.remove(); }, 300); }
    bar.querySelector('[data-x]').addEventListener('click', close);
    bar.querySelector('[data-go]').addEventListener('click', function () {
      fsResume().then(function (ok) { close(); toast(ok ? '自动备份已恢复' : '没有拿到权限，自动备份仍然暂停'); });
    });
    setTimeout(close, 30000);
  }

  /* ============================================================
     弹窗
     ============================================================ */
  function open() {
    var m = U().modal('自动备份到本地文件夹', '<div id="syBody"></div>', { footer: false });
    var el = m.el, alive = true;
    function fsHtml() {
      if (!FS_OK) {
        return '<p class="tws-p">这个浏览器不支持直接写本地文件夹（需要电脑上的 Chrome 或 Edge）。请在「系统配置 → 全书备份」手动存一份。</p>';
      }
      if (fs.state === 'none') {
        return '<p class="tws-p">选一个文件夹，之后书稿一有改动就自动存一份进去，清浏览器缓存也不怕。把它选在网盘的同步文件夹里（OneDrive、坚果云、iCloud 云盘……），就等于自动上云。</p>' +
          '<div class="tws-ai-bar"><span class="tws-spacer"></span><button class="tws-btn sm primary" data-a="fsPick">选择文件夹</button></div>';
      }
      var st = fs.state === 'ok'
        ? (fs.last ? '上次写入：' + dayStr(fs.last) + ' ' + hm(fs.last) + (fs.size ? ' · ' + fmtSize(fs.size) : '') : '已开启，等待第一次写入')
        : (fs.state === 'ask' ? '已暂停：浏览器重启后需要重新授权' : '出错了：' + fs.err);
      return '<div class="tws-bk-card' + (fs.state === 'ok' ? '' : ' old') + '"><em>文件夹</em><b>' + esc(fs.handle.name) + '</b><span>' + esc(st) +
        (fs.err && fs.state === 'ok' ? ' · 上一次没写成：' + esc(fs.err) : '') + '</span></div>' +
        '<p class="tws-p tws-kit-dim">停笔 20 秒后自动写入。文件夹里「' + LATEST + '」是最新的，另外每天留一份，保留 ' + KEEP_DAYS + ' 天。要恢复时，到「系统配置 → 全书备份 → 恢复」选其中一个文件。</p>' +
        '<div class="tws-ai-bar"><button class="tws-btn sm ghost" data-a="fsStop">停用</button><button class="tws-btn sm" data-a="fsPick">换个文件夹</button><span class="tws-spacer"></span>' +
        (fs.state === 'ok' ? '<button class="tws-btn sm primary" data-a="fsNow">现在备份一次</button>' : '<button class="tws-btn sm primary" data-a="fsResume">继续自动备份</button>') + '</div>';
    }
    function paint() {
      if (!alive || !document.body.contains(el)) { alive = false; return false; }
      el.querySelector('#syBody').innerHTML =
        '<div id="syFs">' + fsHtml() + '</div>';
    }
    listeners.push(paint);
    el.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (!a) return;
      var btn = e.target;
      if (a === 'fsPick') fsPick().catch(function (err) { if (err && err.name !== 'AbortError') toast('没有开启：' + (err.message || '未知错误')); });
      else if (a === 'fsStop') fsStop().then(function () { toast('已停用自动备份（文件夹里已有的备份不会删）'); });
      else if (a === 'fsResume') fsResume().then(function (ok) { toast(ok ? '自动备份已恢复' : '没有拿到权限'); });
      else if (a === 'fsNow') { btn.disabled = true; fsWrite().then(function (ok) { toast(ok ? '已写入「' + fs.handle.name + '」' : '没写成：' + fs.err); }); }
    });
    paint();
  }

  /* 系统配置里那一行的小字 */
  function rowText() {
    var bits = [];
    if (fs.state === 'ok') bits.push('本地文件夹：' + (fs.last ? dayStr(fs.last) + ' ' + hm(fs.last) : '已开启'));
    else if (fs.state === 'ask') bits.push('本地文件夹：已暂停，需要重新授权');
    return bits.length ? bits.join(' · ') : '写着写着就自动存一份到你选的文件夹';
  }
  function paintRow() { var el = document.getElementById('syncHint'); if (el) el.textContent = rowText(); }

  /* ============================================================
     ② 离线可用
     ============================================================ */
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  /* ============================================================
     启动：盯着数据保存
     ============================================================ */
  function init() {
    if (T.data && T.data.onSave) T.data.onSave(function () { dirty = true; fsSchedule(); });
    listeners.push(paintRow);
    var b = document.getElementById('btnSync');
    if (b) b.addEventListener('click', open);
    fsInit();
    paintRow();
    /* 关页面 / 切到后台时，如果还有没写进文件夹的改动，赶紧写一次 */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && dirty && fs.state === 'ok') { clearTimeout(fs.timer); fsWrite(); }
    });
  }
  registerSW();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.sync = { open: open, fsPick: fsPick, fsWrite: fsWrite, fsStop: fsStop, _fs: fs };
})();
