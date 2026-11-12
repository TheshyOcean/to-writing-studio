/* ============================================================
   To Writing Studio · 全书备份与恢复
   ------------------------------------------------------------
   为什么要有它：书稿、设定、伏笔、对话都只存在这一个浏览器里，
   换浏览器、换设备、清一次缓存就全没了。这里把它们打包成一个
   .json 文件，可以存到别处，也可以在另一台设备上恢复。

   - 备份内容：下面 LS_KEYS 列出的 localStorage 键 + IndexedDB 里的角色形象图
   - 不备份：API Key（对话接口和图片模型的都会从备份里去掉）
   - 恢复：整体替换当前数据，本机已填的 API Key 保留，然后刷新页面
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};

  var FORMAT = 'to-writing-studio-backup';
  var VERSION = 1;
  var LAST_KEY = 'tws_backup_last';      // { t: 时间戳, w: 当时的总字数 }
  var NAG_KEY = 'tws_backup_nag';        // 上次提醒的日期，一天最多提醒一次
  var NAG_DAYS = 7;                      // 多少天没备份就提醒
  var NAG_WORDS = 500;                   // 总字数少于这个数不提醒

  var CHAT_KEY = 'liangye_endfield_v2';  // 对话与接口配置，里面带 apiKey
  var IMG_KEY = 'tws_imgcfg';            // 图片模型配置，里面带 key
  /* 只备份、只恢复这张清单里的键；备份文件里多出来的键一律忽略 */
  var LS_KEYS = [
    'tws_data_v1',        // 作品 / 卷 / 章 / 设定卡片 / 伏笔 / 时间线 / 版本 / 字数
    'tws_define_v1',      // 智能定义：关系描述、情节、片名
    'tws_brain_v1',       // 故事大脑记住的别名
    'tws_brain_mode',
    'tws_fun_v1',         // 弹幕、塔罗、访谈
    CHAT_KEY,
    IMG_KEY,
    'endfield_theme_v2', 'tws_night', 'tws_lux', 'tws_autolore',
    'tws_autoadopt', 'tws_memory',   // 自动采纳、长篇记忆的开关（js/tws-flow.js）
    'tws_prompts_v1', 'tws_sens_v1', 'tws_usage_v1', 'tws_pomo_v1', 'tws_pub_v1',   // V3.5.0：指令库、敏感词表、用量、番茄钟、发布格式
    'liangye_studio_fontsize', 'liangye_studio_initialized', 'tws_boot_seen'
  ];

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'tws-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
    setTimeout(function () { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 300); }, 2600);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function timeStr(ts) { var d = new Date(ts); return dayStr(ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ago(ts) {
    var d = Date.now() - ts;
    if (d < 6e4) return '刚刚';
    if (d < 36e5) return Math.floor(d / 6e4) + ' 分钟前';
    if (d < 864e5) return Math.floor(d / 36e5) + ' 小时前';
    return Math.floor(d / 864e5) + ' 天前';
  }
  function fmtNum(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtSize(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB'; }

  /* ---------------- 形象图：IndexedDB（与 tws-define.js 同一个库） ---------------- */
  function openIdb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open('tws_define', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('img'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function blobToDataUrl(b) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result || '')); };
      fr.onerror = function () { res(''); };
      fr.readAsDataURL(b);
    });
  }
  function readImages() {
    return openIdb().then(function (db) {
      return new Promise(function (res, rej) {
        var got = {}, tx = db.transaction('img', 'readonly'), req = tx.objectStore('img').openCursor();
        req.onsuccess = function () { var c = req.result; if (c) { got[c.key] = c.value; c.continue(); } };
        tx.oncomplete = function () { db.close(); res(got); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    }).then(function (got) {
      var keys = Object.keys(got);
      return Promise.all(keys.map(function (k) {
        var v = got[k];
        return typeof v === 'string' ? v : (v instanceof Blob ? blobToDataUrl(v) : '');
      })).then(function (vals) {
        var out = {};
        keys.forEach(function (k, i) { if (isImage(vals[i])) out[k] = vals[i]; });
        return out;
      });
    }).catch(function () { return {}; });   // 浏览器不支持就当没有图
  }
  function writeImages(images) {
    return openIdb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('img', 'readwrite'), st = tx.objectStore('img');
        st.clear();
        Object.keys(images).forEach(function (k) { st.put(images[k], k); });
        tx.oncomplete = function () { db.close(); res(); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function isImage(v) { return typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v); }

  /* ---------------- 统计：给人看的摘要 ---------------- */
  function summarize(ls, images) {
    var d = parse(ls && ls.tws_data_v1) || {};
    var chapters = Array.isArray(d.chapters) ? d.chapters : [];
    var projects = Array.isArray(d.projects) ? d.projects : [];
    var words = 0;
    chapters.forEach(function (c) { words += Number(c && c.words) || 0; });
    var chat = parse(ls && ls[CHAT_KEY]) || {};
    return {
      projects: projects.length,
      names: projects.map(function (p) { return String((p && (p.name || p.title)) || '未命名'); }),
      chapters: chapters.length,
      words: words,
      cards: Array.isArray(d.cards) ? d.cards.length : 0,
      threads: Array.isArray(d.threads) ? d.threads.length : 0,
      convs: Array.isArray(chat.convs) ? chat.convs.length : 0,
      images: Object.keys(images || {}).length
    };
  }
  function currentLs() {
    var ls = {};
    LS_KEYS.forEach(function (k) { var v = lsGet(k); if (v != null) ls[k] = v; });
    return ls;
  }
  function currentWords() { return summarize({ tws_data_v1: lsGet('tws_data_v1') }).words; }

  /* ---------------- 去掉 / 补回 API Key ---------------- */
  function stripSecrets(ls) {
    var chat = parse(ls[CHAT_KEY]);
    if (chat && typeof chat === 'object') { chat.apiKey = ''; ls[CHAT_KEY] = JSON.stringify(chat); }
    var ic = parse(ls[IMG_KEY]);
    if (ic && typeof ic === 'object') { ic.key = ''; ls[IMG_KEY] = JSON.stringify(ic); }
    return ls;
  }
  /* 恢复时：备份里没有 Key，把本机现在填的 Key 接着用 */
  function keepLocalSecrets(ls) {
    var cur = parse(lsGet(CHAT_KEY)), chat = parse(ls[CHAT_KEY]);
    if (chat && typeof chat === 'object') {
      chat.apiKey = (cur && typeof cur.apiKey === 'string') ? cur.apiKey : '';
      ls[CHAT_KEY] = JSON.stringify(chat);
    }
    var curIc = parse(lsGet(IMG_KEY)), ic = parse(ls[IMG_KEY]);
    if (ic && typeof ic === 'object') {
      ic.key = (curIc && typeof curIc.key === 'string') ? curIc.key : '';
      ls[IMG_KEY] = JSON.stringify(ic);
    }
    return ls;
  }

  /* 让页面把内存里的最新内容（书稿、对话、接口配置）写进 localStorage */
  function flush() {
    try { if (T.data && T.data.save) T.data.save(); } catch (e) {}
    try { if (window.__ENDF__ && window.__ENDF__.save) window.__ENDF__.save(); } catch (e) {}
  }

  /* ---------------- 导出 ---------------- */
  function build() {
    /* 先让页面把内存里的最新内容落盘，再读 */
    flush();
    return readImages().then(function (images) {
      var ls = stripSecrets(currentLs());
      return {
        format: FORMAT, version: VERSION,
        app: 'To Writing Studio', exported: Date.now(),
        summary: summarize(ls, images),
        ls: ls, images: images
      };
    });
  }
  function fileName(pack) {
    var s = pack.summary, name = s.projects === 1 ? s.names[0] : (s.projects > 1 ? s.projects + '部作品' : '空');
    name = name.replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || '作品';
    var d = new Date(pack.exported);
    return 'To写作工作台备份-' + name + '-' + dayStr(pack.exported) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
  }
  function download(text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
    return blob.size;
  }
  function exportBackup() {
    return build().then(function (pack) {
      var size = download(JSON.stringify(pack), fileName(pack));
      lsSet(LAST_KEY, JSON.stringify({ t: Date.now(), w: pack.summary.words }));
      refreshRow();
      toast('已备份 · ' + pack.summary.chapters + ' 章 ' + fmtNum(pack.summary.words) + ' 字 · ' + fmtSize(size));
      return pack;
    }).catch(function (e) {
      toast('备份没成功：' + (e && e.message || '未知错误'));
      throw e;
    });
  }

  /* ---------------- 读取并检查备份文件 ---------------- */
  function check(text) {
    var pack = parse(text);
    if (!pack || typeof pack !== 'object' || pack.format !== FORMAT) throw new Error('这不是 To 写作工作台的备份文件');
    if (typeof pack.version !== 'number' || pack.version > VERSION) throw new Error('这份备份来自更新的版本，请先更新工作台');
    if (!pack.ls || typeof pack.ls !== 'object') throw new Error('备份文件不完整');
    var ls = {};
    LS_KEYS.forEach(function (k) { if (typeof pack.ls[k] === 'string') ls[k] = pack.ls[k]; });
    var data = parse(ls.tws_data_v1);
    if (!data || typeof data !== 'object' || !Array.isArray(data.chapters) || !Array.isArray(data.projects)) throw new Error('备份里的书稿数据读不出来');
    var images = {};
    if (pack.images && typeof pack.images === 'object') {
      Object.keys(pack.images).forEach(function (k) { if (isImage(pack.images[k])) images[k] = pack.images[k]; });
    }
    return { ls: ls, images: images, exported: Number(pack.exported) || 0, summary: summarize(ls, images) };
  }

  /* ---------------- 恢复 ---------------- */
  function restore(pack) {
    flush();   // 先落盘，下面才读得到本机现在的 API Key
    var ls = keepLocalSecrets(Object.assign({}, pack.ls));
    var old = currentLs();                       // 写失败时用来还原
    var realSet = Storage.prototype.setItem;
    function rollback() {
      LS_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      Object.keys(old).forEach(function (k) { try { realSet.call(localStorage, k, old[k]); } catch (e) {} });
    }
    try {
      LS_KEYS.forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(ls).forEach(function (k) { realSet.call(localStorage, k, ls[k]); });
    } catch (e) {
      rollback();
      return Promise.reject(new Error('浏览器存储空间不够，放不下这份备份。原来的数据没有动'));
    }
    return writeImages(pack.images).catch(function () {
      /* 文字都恢复了，只是图没写进去：不回滚，告诉用户 */
      toast('角色形象图没能恢复（浏览器不支持本地图片存储）');
    }).then(function () {
      lsSet(LAST_KEY, JSON.stringify({ t: pack.exported || Date.now(), w: pack.summary.words }));
      /* 页面关闭前会把内存里的旧数据再存一遍（beforeunload），
         那样会把刚恢复的内容盖掉。刷新前先把写入关掉 */
      Storage.prototype.setItem = function () {};
      Storage.prototype.removeItem = function () {};
      location.reload();
    });
  }

  /* ---------------- 弹窗（沿用 .tws-modal 的样式） ---------------- */
  function modal(title, bodyHtml, footHtml) {
    var wrap = document.createElement('div');
    wrap.className = 'tws-modal-wrap tws-bk';
    wrap.innerHTML =
      '<div class="tws-modal">' +
        '<div class="tws-modal-h"><span class="sq"></span><b>' + esc(title) + '</b><button class="tws-x" data-close>✕</button></div>' +
        '<div class="tws-modal-b">' + bodyHtml + '</div>' +
        '<div class="tws-modal-f">' + footHtml + '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    function close() { wrap.classList.remove('on'); setTimeout(function () { wrap.remove(); }, 260); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.hasAttribute('data-close')) close(); });
    return { el: wrap, close: close };
  }
  function statLine(s) {
    if (!s.projects && !s.chapters) return '<span class="tws-bk-nil">空的，还没有作品</span>';
    var name = s.names.slice(0, 2).map(function (n) { return '《' + esc(n) + '》'; }).join('') + (s.projects > 2 ? ' 等 ' + s.projects + ' 部' : '');
    var bits = [s.chapters + ' 章', fmtNum(s.words) + ' 字'];
    if (s.cards) bits.push(s.cards + ' 张设定');
    if (s.threads) bits.push(s.threads + ' 条伏笔');
    if (s.convs) bits.push(s.convs + ' 段对话');
    if (s.images) bits.push(s.images + ' 张形象图');
    return '<b>' + name + '</b><span>' + bits.join(' · ') + '</span>';
  }

  function pickFile() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      if (f.size > 80 * 1024 * 1024) { toast('这个文件太大了，不像是备份文件'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var pack;
        try { pack = check(String(fr.result || '')); } catch (e) { toast(e.message); return; }
        confirmRestore(pack, f.name);
      };
      fr.onerror = function () { toast('文件读不出来'); };
      fr.readAsText(f);
    });
    inp.click();
  }

  function confirmRestore(pack, name) {
    readImages().then(function (curImgs) {
      var cur = summarize(currentLs(), curImgs);
      var hasCur = cur.projects > 0 || cur.chapters > 0;
      var m = modal('恢复备份',
        '<div class="tws-bk-card"><em>备份里的内容' + (pack.exported ? ' · ' + timeStr(pack.exported) : '') + '</em>' + statLine(pack.summary) + '</div>' +
        '<div class="tws-bk-arrow">替换 ↓</div>' +
        '<div class="tws-bk-card old"><em>这台设备上现在的内容</em>' + statLine(cur) + '</div>' +
        '<p class="tws-bk-note">' + (hasCur
          ? '恢复后，这台设备上现在的书稿、设定和对话会被备份里的内容<b>整体替换</b>，不是合并。拿不准的话，先把现在的也备份一份。'
          : '这台设备上还没有内容，可以放心恢复。') +
        '<br>API Key 不在备份里，本机已经填的会保留。</p>',
        (hasCur ? '<button class="tws-btn" data-save>先备份现在的</button>' : '') +
        '<button class="tws-btn ghost" data-close>取消</button>' +
        '<button class="tws-btn primary" data-go>恢复</button>');
      var saveBtn = m.el.querySelector('[data-save]'), goBtn = m.el.querySelector('[data-go]');
      if (saveBtn) saveBtn.addEventListener('click', function () {
        saveBtn.disabled = true;
        exportBackup().then(function () { saveBtn.textContent = '已备份 ✓'; }, function () { saveBtn.disabled = false; });
      });
      goBtn.addEventListener('click', function () {
        goBtn.disabled = true; goBtn.textContent = '正在恢复…';
        restore(pack).catch(function (e) { goBtn.disabled = false; goBtn.textContent = '恢复'; toast(e.message); });
      });
    });
  }

  /* ---------------- 系统配置里的那一行 ---------------- */
  function lastInfo() { var v = parse(lsGet(LAST_KEY)); return v && typeof v.t === 'number' ? v : null; }
  function rowText() {
    var last = lastInfo(), words = currentWords();
    if (!last) return words ? '还没备份过 · 书稿只存在这个浏览器里' : '把整本书存成一个文件，换设备也能接着写';
    var more = words - (last.w || 0);
    return '上次备份：' + ago(last.t) + (more > 0 ? ' · 之后又写了 ' + fmtNum(more) + ' 字' : '');
  }
  function refreshRow() { var el = document.getElementById('bkHint'); if (el) el.textContent = rowText(); }

  /* ---------------- 太久没备份：提醒一次 ---------------- */
  function maybeNag() {
    var words = currentWords();
    if (words < NAG_WORDS) return;
    var last = lastInfo(), today = dayStr(Date.now());
    if (lsGet(NAG_KEY) === today) return;
    var stale = !last || (Date.now() - last.t > NAG_DAYS * 864e5 && words > (last.w || 0));
    if (!stale) return;
    lsSet(NAG_KEY, today);
    var bar = document.createElement('div');
    bar.className = 'tws-bk-nag';
    bar.innerHTML =
      '<span>' + (last ? '距离上次备份已经 ' + Math.floor((Date.now() - last.t) / 864e5) + ' 天了' : '这本书还没有备份过') +
      '，书稿只存在这个浏览器里。</span>' +
      '<button class="tws-btn sm primary" data-go>现在备份</button><button class="tws-x" data-x>✕</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('on'); });
    function close() { bar.classList.remove('on'); setTimeout(function () { bar.remove(); }, 300); }
    bar.querySelector('[data-x]').addEventListener('click', close);
    bar.querySelector('[data-go]').addEventListener('click', function () { exportBackup().then(close, close); });
    setTimeout(close, 20000);
  }

  function init() {
    var b1 = document.getElementById('btnBackup'), b2 = document.getElementById('btnRestore');
    if (b1) b1.addEventListener('click', function () { exportBackup().catch(function () {}); });
    if (b2) b2.addEventListener('click', pickFile);
    refreshRow();
    /* 打开「系统配置」时字数可能已经变了，点一下就刷新 */
    document.addEventListener('click', function () { setTimeout(refreshRow, 60); }, true);
    setTimeout(maybeNag, 9000);   // 等开场动画放完
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.backup = { exportBackup: exportBackup, pickFile: pickFile, build: build, check: check, restore: restore, confirmRestore: confirmRestore, _keys: LS_KEYS };
})();
