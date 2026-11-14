/* ============================================================
   To Writing Studio · 工具箱（V3.5.0）
   ------------------------------------------------------------
   「书稿」右上角的「工具」菜单，以及几个贴着编辑器的小功能：
   - 回收站：删掉的卷 / 章先进回收站，30 天内可恢复
   - 章节拖拽排序、跨卷移动（手机上用「移动本章」）
   - 专注模式：只留纸面，光标所在行保持在屏幕中间
   - 选中文字的浮动菜单：润色 / 扩写 / 缩写 / 换个说法 / 朗读
   - 朗读正文（浏览器自带的语音，不需要 API Key）
   - 番茄钟：计时 + 本次写了多少字
   其它工具（导入、体检、起名……）在各自的文件里，这里只负责列出入口。
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  function D() { return T.data; }
  function U() { return T.ui; }
  function esc(s) { return D().esc(s); }
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function isPhone() { return document.documentElement.getAttribute('data-device') === 'phone' || window.innerWidth < 720; }

  /* ============================================================
     工具菜单
     ============================================================ */
  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(anchor) {
    if (menuEl) { closeMenu(); return; }
    var d = D(), pid = d.D.activeProject;
    var trashN = pid ? d.listTrash(pid).length : 0;
    var items = [
      ['导入与整理'],
      ['import', '导入书稿', '.txt / .docx / .md，自动切章', function () { T.io && T.io.openImport(); }],
      ['trash', '回收站' + (trashN ? '（' + trashN + '）' : ''), '删掉的卷和章，30 天内可恢复', openTrash],
      ['move', '移动本章', '换个位置，或挪到别的卷', function () { openMove(T.currentChapter()); }],
      ['写的时候'],
      ['notes', '旁批待办', '记录需要修改的地方', function () { T.desk && T.desk.openNotes(); }],
      ['reference', '参考页', '写作时查看章节与设定', function () { T.desk && T.desk.openReference(); }],
      ['ask', '问自己的书', '查找正文并查看出处', function () { T.ask && T.ask.open(); }],
      ['focus', '专注模式', '只留纸面 · Ctrl / ⌘ + Shift + Enter', toggleFocus],
      ['pomo', '番茄钟', pomoLabel(), openPomo],
      ['name', '起名器', '人名、地名、门派、功法', function () { T.craft && T.craft.openNamer(); }],
      ['写完以后'],
      ['prose', '文笔体检', '高频词、重复句式、长段落（不用 Key）', function () { T.craft && T.craft.openProse(); }],
      ['sens', '敏感词自查', '发布前扫一遍，词表可自定义', function () { T.craft && T.craft.openSens(); }],
      ['pub', '发布格式', '段首缩进 / 空行 / 标点修正，一键复制', function () { T.io && T.io.openPublish(); }],
      ['数据'],
      ['stats', '写作统计', '热力图、每章字数、预计完稿', function () { T.meter && T.meter.openStats(); }],
      ['usage', '用量与花费', 'Token 用了多少、花了多少钱', function () { T.meter && T.meter.openUsage(); }],
      ['sync', '自动备份', '自动存一份到本地文件夹', function () { T.sync && T.sync.open(); }]
    ];
    menuEl = document.createElement('div');
    menuEl.className = 'tws-kit-menu';
    menuEl.innerHTML = items.map(function (it, i) {
      if (it.length === 1) return '<div class="tws-kit-g">' + it[0] + '</div>';
      return '<button type="button" data-i="' + i + '"><b>' + esc(it[1]) + '</b><span>' + esc(it[2]) + '</span></button>';
    }).join('');
    document.body.appendChild(menuEl);
    var r = anchor.getBoundingClientRect();
    var w = Math.min(300, window.innerWidth - 24);
    menuEl.style.width = w + 'px';
    menuEl.style.left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)) + 'px';
    menuEl.style.top = Math.min(r.bottom + 8, window.innerHeight - 120) + 'px';
    menuEl.style.maxHeight = (window.innerHeight - Math.min(r.bottom + 8, window.innerHeight - 120) - 16) + 'px';
    menuEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]'); if (!b) return;
      var it = items[Number(b.getAttribute('data-i'))];
      closeMenu();
      try { it[3](); } catch (err) { console.error(err); }
    });
    setTimeout(function () {
      document.addEventListener('click', function once(e) {
        if (menuEl && !menuEl.contains(e.target)) closeMenu();
        if (!menuEl) document.removeEventListener('click', once, true);
      }, true);
    }, 0);
  }

  /* ============================================================
     回收站
     ============================================================ */
  function openTrash() {
    var d = D(), pid = d.D.activeProject;
    if (!pid) { U().toast('先建一部作品'); return; }
    var m = U().modal('回收站', '<div id="trList"></div>', { footer: false });
    function paint() {
      var list = d.listTrash(pid), box = m.el.querySelector('#trList');
      if (!list.length) {
        box.innerHTML = '<div class="tws-empty small"><b>回收站是空的</b><p>删掉的卷和章会在这里保留 30 天。</p></div>';
        return;
      }
      box.innerHTML =
        '<p class="tws-p tws-kit-dim">保留 30 天，最多 40 项。恢复时连同版本历史一起放回原来的卷；原卷已经不在的，会放进「回收站恢复」卷。</p>' +
        list.map(function (t) {
          var left = Math.max(1, 30 - Math.floor((Date.now() - t.at) / 864e5));
          return '<div class="tws-kit-row" data-id="' + t.id + '">' +
            '<div class="tws-kit-row-m"><b>' + (t.kind === 'volume' ? '卷 · ' : '章 · ') + esc(t.title) + '</b>' +
            '<span>' + (t.kind === 'volume' ? t.chapters.length + ' 章 · ' : '') + d.fmtNum(t.words) + ' 字 · ' +
            d.timeAgo(t.at) + '删除 · 还剩 ' + left + ' 天</span></div>' +
            '<button class="tws-btn sm" data-a="back">恢复</button>' +
            '<button class="tws-btn sm ghost" data-a="drop">彻底删除</button></div>';
        }).join('') +
        '<div class="tws-ai-bar"><span class="tws-spacer"></span><button class="tws-btn sm ghost" id="trEmpty">清空回收站</button></div>';
    }
    paint();
    m.el.addEventListener('click', function (e) {
      var row = e.target.closest('[data-id]'), a = e.target.getAttribute('data-a');
      if (row && a === 'back') {
        var c = d.restoreTrash(row.getAttribute('data-id'));
        if (c) { U().setChapter(c.id); T.refreshViews(); U().toast('已恢复「' + c.title + '」'); }
        paint();
      } else if (row && a === 'drop') {
        if (e.target.dataset.sure) { d.dropTrash(row.getAttribute('data-id')); paint(); }
        else { e.target.dataset.sure = '1'; e.target.textContent = '再点一次确认'; }
      } else if (e.target.id === 'trEmpty') {
        if (e.target.dataset.sure) {
          d.listTrash(pid).forEach(function (t) { d.dropTrash(t.id); });
          paint(); U().toast('已清空');
        } else { e.target.dataset.sure = '1'; e.target.textContent = '再点一次：清空后无法恢复'; }
      }
    });
  }

  /* ============================================================
     移动章节：弹窗（手机也能用） + 拖拽（电脑）
     ============================================================ */
  function openMove(cid) {
    var d = D(), c = cid && d.getChapter(cid);
    if (!c) { U().toast('先选一章'); return; }
    var pid = d.D.activeProject, vols = d.listVolumes(pid);
    var m = U().modal('移动「' + c.title + '」',
      '<label class="tws-l">放到哪一卷</label><select class="tws-i" id="mvVol">' +
        vols.map(function (v) { return '<option value="' + v.id + '"' + (v.id === c.volumeId ? ' selected' : '') + '>' + esc(v.title) + '</option>'; }).join('') +
      '</select><label class="tws-l">放在哪一章的前面</label><select class="tws-i" id="mvPos"></select>',
      { okText: '移动', onOk: function (w) {
        T.flushSave();
        d.placeChapter(c.id, w.querySelector('#mvVol').value, Number(w.querySelector('#mvPos').value));
        T.refreshViews(); U().toast('已移动');
      } });
    function fill() {
      var vid = m.el.querySelector('#mvVol').value;
      var list = d.listChapters(vid).filter(function (x) { return x.id !== c.id; });
      var cur = vid === c.volumeId ? d.listChapters(vid).findIndex(function (x) { return x.id === c.id; }) : list.length;
      m.el.querySelector('#mvPos').innerHTML = list.map(function (x, i) {
        return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(x.title) + ' 之前</option>';
      }).join('') + '<option value="' + list.length + '"' + (cur >= list.length ? ' selected' : '') + '>（放在最后）</option>';
    }
    m.el.querySelector('#mvVol').addEventListener('change', fill);
    fill();
  }

  var drag = null;
  function clearDrop() {
    document.querySelectorAll('.tws-drop-a,.tws-drop-b,.tws-drop-in').forEach(function (x) {
      x.classList.remove('tws-drop-a', 'tws-drop-b', 'tws-drop-in');
    });
  }
  function dropTarget(e) {
    var ch = e.target.closest('.tws-ch[data-ch]');
    if (ch) {
      var r = ch.getBoundingClientRect();
      return { el: ch, ch: ch.getAttribute('data-ch'), after: e.clientY > r.top + r.height / 2 };
    }
    var vol = e.target.closest('.tws-vol');
    if (vol) { var h = vol.querySelector('[data-vol]'); if (h) return { el: h, vol: h.getAttribute('data-vol') }; }
    return null;
  }
  function initDrag() {
    document.addEventListener('dragstart', function (e) {
      var ch = e.target.closest && e.target.closest('#twsTree .tws-ch[data-ch]');
      if (!ch) return;
      drag = ch.getAttribute('data-ch');
      ch.classList.add('tws-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag); } catch (err) {}
    });
    document.addEventListener('dragend', function () {
      drag = null; clearDrop();
      document.querySelectorAll('.tws-dragging').forEach(function (x) { x.classList.remove('tws-dragging'); });
    });
    document.addEventListener('dragover', function (e) {
      if (!drag || !e.target.closest || !e.target.closest('#twsTree')) return;
      var t = dropTarget(e); if (!t) return;
      e.preventDefault();
      clearDrop();
      if (t.ch) { if (t.ch !== drag) t.el.classList.add(t.after ? 'tws-drop-b' : 'tws-drop-a'); }
      else t.el.classList.add('tws-drop-in');
    });
    document.addEventListener('drop', function (e) {
      if (!drag || !e.target.closest || !e.target.closest('#twsTree')) return;
      var t = dropTarget(e); if (!t) return;
      e.preventDefault();
      var d = D(), id = drag; drag = null; clearDrop();
      T.flushSave();
      if (t.ch) {
        if (t.ch === id) return;
        var to = d.getChapter(t.ch); if (!to) return;
        var list = d.listChapters(to.volumeId).filter(function (x) { return x.id !== id; });
        var i = list.findIndex(function (x) { return x.id === t.ch; });
        d.placeChapter(id, to.volumeId, i + (t.after ? 1 : 0));
      } else {
        d.placeChapter(id, t.vol, null);
      }
      T.refreshViews();
    });
  }

  /* ============================================================
     光标在 textarea 里的像素位置（用一个镜像 div 量）
     ============================================================ */
  var mirror = null;
  var COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'boxSizing', 'textIndent', 'wordSpacing', 'tabSize'];
  function caretXY(ta, pos) {
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.setAttribute('aria-hidden', 'true');
      mirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;pointer-events:none';
      document.body.appendChild(mirror);
    }
    var cs = getComputedStyle(ta);
    COPY.forEach(function (k) { mirror.style[k] = cs[k]; });
    mirror.style.width = ta.clientWidth + 'px';
    mirror.textContent = ta.value.slice(0, pos);
    var mark = document.createElement('span');
    mark.textContent = ta.value.slice(pos, pos + 1) || '​';
    mirror.appendChild(mark);
    return { x: mark.offsetLeft, y: mark.offsetTop, h: mark.offsetHeight || parseFloat(cs.lineHeight) || 30 };
  }

  /* ============================================================
     专注模式
     ============================================================ */
  var focus = { on: false, holder: null, bar: null, raf: 0, tick: 0 };
  function scrollBox() { return $('twsEditor'); }
  function centerCaret(smooth) {
    var ta = $('twsContent'), box = scrollBox();
    if (!focus.on || !ta || !box || document.activeElement !== ta) return;
    var c = caretXY(ta, ta.selectionEnd);
    var want = ta.offsetTop + c.y + c.h / 2 - box.clientHeight * 0.45;
    want = Math.max(0, want);
    if (Math.abs(box.scrollTop - want) < 4) return;
    if (smooth && box.scrollTo) box.scrollTo({ top: want, behavior: 'smooth' }); else box.scrollTop = want;
  }
  function queueCenter() {
    if (focus.raf) return;
    focus.raf = requestAnimationFrame(function () { focus.raf = 0; centerCaret(true); });
  }
  function paintFocusBar() {
    if (!focus.bar) return;
    var c = D().getChapter(T.currentChapter()), ta = $('twsContent');
    var n = ta ? D().countWords(ta.value) : (c ? c.words : 0);
    var goal = D().D.goal || 0;
    focus.bar.querySelector('[data-w]').textContent = '本章 ' + n + ' 字 · 今日 ' + D().todayWords() + (goal ? ' / ' + goal : '');
    var p = focus.bar.querySelector('[data-p]');
    var left = pomoLeft();
    p.textContent = left > 0 ? '番茄钟 ' + mmss(left) : '番茄钟';
  }
  function toggleFocus() {
    var ed = $('twsEditor');
    if (!ed) return;
    if (focus.on) {
      focus.on = false;
      clearInterval(focus.tick);
      document.documentElement.classList.remove('tws-focus');
      ed.classList.remove('tws-focus-host');
      if (focus.holder && focus.holder.parentNode) { focus.holder.parentNode.insertBefore(ed, focus.holder); focus.holder.remove(); }
      if (focus.bar) { focus.bar.remove(); focus.bar = null; }
      focus.holder = null;
      try { T.refreshViews(); } catch (e) {}
      return;
    }
    if (!D().getChapter(T.currentChapter())) { U().toast('先选一章'); return; }
    T.flushSave();
    focus.on = true;
    /* 上层容器带 transform，position:fixed 会被它框住，所以把编辑器整个搬到 body 下面，退出时放回原位 */
    focus.holder = document.createElement('div');
    focus.holder.style.display = 'none';
    ed.parentNode.insertBefore(focus.holder, ed);
    document.body.appendChild(ed);
    ed.classList.add('tws-focus-host');
    document.documentElement.classList.add('tws-focus');
    focus.bar = document.createElement('div');
    focus.bar.className = 'tws-focus-bar';
    focus.bar.innerHTML = '<span data-w></span><button type="button" data-p>番茄钟</button><button type="button" data-x>退出专注 Esc</button>';
    document.body.appendChild(focus.bar);
    focus.bar.querySelector('[data-x]').addEventListener('click', toggleFocus);
    focus.bar.querySelector('[data-p]').addEventListener('click', openPomo);
    paintFocusBar();
    focus.tick = setInterval(paintFocusBar, 1000);
    var ta = $('twsContent');
    if (ta) { ta.focus(); centerCaret(false); }
  }

  /* ============================================================
     选中文字的浮动菜单
     ============================================================ */
  var selBar = null, selTimer = 0;
  var REWRITE = {
    expand: { name: '扩写', sys: '把这段扩写到原来的 1.5～2 倍：补充动作、神态、环境和感官细节，让场面更具体。不新增情节转折，不改变事件的结果。' },
    shrink: { name: '缩写', sys: '把这段压缩到原来的一半左右：删掉重复和可有可无的修饰，保留关键动作、对白和信息。' },
    again: { name: '换个说法', sys: '换一种写法重写这段：意思、情节和人称不变，但句式、用词、节奏要明显不同，不要只换近义词。' }
  };
  function hideSel() { if (selBar) { selBar.remove(); selBar = null; } }
  function showSel(ta) {
    hideSel();
    var ss = ta.selectionStart, se = ta.selectionEnd;
    if (se - ss < 2 || document.activeElement !== ta) return;
    if (!ta.value.slice(ss, se).trim()) return;
    selBar = document.createElement('div');
    selBar.className = 'tws-sel-bar';
    selBar.innerHTML =
      '<button type="button" data-s="polish">润色</button><button type="button" data-s="expand">扩写</button>' +
      '<button type="button" data-s="shrink">缩写</button><button type="button" data-s="again">换个说法</button>' +
      '<button type="button" data-s="note">旁批</button><button type="button" data-s="read">朗读</button><em>' + (se - ss) + ' 字</em>';
    document.body.appendChild(selBar);
    var r = ta.getBoundingClientRect(), a = caretXY(ta, ss), b = caretXY(ta, se);
    var w = selBar.offsetWidth, h = selBar.offsetHeight;
    var x = r.left + Math.min(a.x, b.x) - ta.scrollLeft;
    /* 电脑上放在选区上方；触屏上系统自带的菜单在上面，所以放到选区下方 */
    var touch = isPhone() || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
    var y = touch ? r.top + b.y + b.h + 10 - ta.scrollTop : r.top + a.y - h - 8 - ta.scrollTop;
    if (y < 8) y = r.top + b.y + b.h + 10 - ta.scrollTop;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top + a.y - h - 8 - ta.scrollTop);
    selBar.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    selBar.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
    /* 按下时不让 textarea 失焦，否则选区就没了 */
    selBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    selBar.addEventListener('click', function (e) {
      var k = e.target.getAttribute('data-s'); if (!k) return;
      var saved = k === 'note' && T.desk ? T.desk.captureSelection() : null;
      hideSel();
      if (k === 'note') { if (T.desk) T.desk.addNoteFromSelection(saved); }
      else if (k === 'polish') U().openPolish();
      else if (k === 'read') readAloud();
      else openRewrite(k);
    });
  }
  function queueSel(ta) {
    clearTimeout(selTimer);
    selTimer = setTimeout(function () { showSel(ta); }, 180);
  }
  function openRewrite(kind) {
    var ta = $('twsContent'), c = D().getChapter(T.currentChapter());
    if (!ta || !c) return;
    var ss = ta.selectionStart, se = ta.selectionEnd, src = ta.value.slice(ss, se);
    if (!src.trim()) { U().toast('先选中一段文字'); return; }
    if (T.ai.needKey()) { U().needKeyGuide(); return; }
    var R = REWRITE[kind];
    var before = ta.value.slice(Math.max(0, ss - 400), ss), after = ta.value.slice(se, se + 200);
    var m = U().modal('AI ' + R.name,
      '<div class="tws-p" style="margin-bottom:10px">已选中 <b>' + src.length + '</b> 字</div>' +
      '<div class="tws-ai-out streaming" id="rwOut"></div><div class="tws-ai-meta" id="rwMeta"></div>' +
      '<div class="tws-ai-bar"><button class="tws-btn sm" id="rwAgain" disabled>再来一版</button><span class="tws-spacer"></span>' +
      '<button class="tws-btn sm" id="rwAfter" disabled>插到后面</button><button class="tws-btn primary" id="rwRep" disabled>替换选中</button></div>',
      { footer: false });
    var out = m.el.querySelector('#rwOut'), result = '', review = null, originalContent = ta.value, originalProject = D().D.activeProject;
    function setBtns(on) { ['rwAgain', 'rwAfter', 'rwRep'].forEach(function (id) { m.el.querySelector('#' + id).disabled = !on; }); }
    function run() {
      setBtns(false); result = ''; review = null; out.textContent = ''; out.classList.add('streaming');
      T.checker.callLLM([
        { role: 'system', content: '你是中文小说编辑。' + R.sys + '\n保持叙事视角、人称和文风与上下文一致。只输出改写后的正文，不要解释，不要加引号，不要复述要求。' },
        { role: 'user', content: (before ? '【前文（只供参考，不要改写）】\n' + before + '\n\n' : '') +
          (after ? '【后文（只供参考，不要改写）】\n' + after + '\n\n' : '') + '【要改写的段落】\n' + src }
      ], function (t) { out.textContent = t; out.scrollTop = out.scrollHeight; }).then(function (full) {
        result = String(full || out.textContent).trim();
        out.textContent = result; out.classList.remove('streaming');
        if (result && T.revision) review = T.revision.mount(out, src, result);
        m.el.querySelector('#rwMeta').textContent = '原文 ' + src.length + ' 字 → ' + result.length + ' 字';
        setBtns(!!result);
      }).catch(function (e) {
        out.classList.remove('streaming');
        out.textContent = R.name + '失败：' + e.message;
        m.el.querySelector('#rwAgain').disabled = false;
      });
    }
    function apply(replace) {
      var t = $('twsContent'); if (!t || !result) return;
      if (T.currentChapter() !== c.id || D().D.activeProject !== originalProject || t.value !== originalContent) { U().toast('正文已经变了，请重新选中再试'); return; }
      D().saveChapterContent(c.id, t.value, 'AI ' + R.name + '前');
      var chosen = review ? review.getText() : result;
      t.value = replace ? t.value.slice(0, ss) + chosen + t.value.slice(se)
        : t.value.slice(0, se) + '\n\n' + chosen + t.value.slice(se);
      t.dispatchEvent(new Event('input', { bubbles: true }));
      T.flushSave(); m.close();
      U().toast(replace ? '已替换（旧版本已存进历史）' : '已插到选中段落后面');
    }
    m.el.querySelector('#rwAgain').addEventListener('click', run);
    m.el.querySelector('#rwRep').addEventListener('click', function () { apply(true); });
    m.el.querySelector('#rwAfter').addEventListener('click', function () { apply(false); });
    run();
  }

  /* 每次重画编辑器时由 tws-views.js 调用 */
  function onEditor(ta) {
    ta.addEventListener('mouseup', function () { queueSel(ta); });
    ta.addEventListener('keyup', function (e) {
      if (e.shiftKey || e.key === 'Shift' || /^Arrow/.test(e.key)) queueSel(ta);
      if (focus.on) queueCenter();
    });
    ta.addEventListener('touchend', function () { setTimeout(function () { queueSel(ta); }, 250); });
    ta.addEventListener('input', function () { hideSel(); if (focus.on) queueCenter(); });
    ta.addEventListener('click', function () { if (focus.on) queueCenter(); });
    ta.addEventListener('blur', function () { setTimeout(hideSel, 150); });
    ta.addEventListener('scroll', hideSel);
  }

  /* ============================================================
     朗读
     ============================================================ */
  var tts = { bar: null, list: [], i: 0, rate: 1, on: false, paused: false, gen: 0 };
  function splitSpeech(text) {
    var out = [];
    String(text).split(/\n+/).forEach(function (par) {
      par = par.trim(); if (!par) return;
      /* 按句切，太短的句子并到一起，避免一句一顿 */
      var parts = par.match(/[^。！？!?…；;]+[。！？!?…；;”」』"']*/g) || [par], buf = '';
      parts.forEach(function (s) {
        if ((buf + s).length > 90 && buf) { out.push(buf); buf = s; } else buf += s;
      });
      if (buf.trim()) out.push(buf);
    });
    return out;
  }
  function pickVoice() {
    var vs = window.speechSynthesis.getVoices() || [];
    return vs.filter(function (v) { return /^zh[-_]CN/i.test(v.lang) && v.localService; })[0] ||
      vs.filter(function (v) { return /^zh/i.test(v.lang); })[0] || null;
  }
  function speakNext() {
    if (!tts.on) return;
    if (tts.i >= tts.list.length) { stopRead(); U().toast('读完了'); return; }
    var u = new SpeechSynthesisUtterance(tts.list[tts.i]);
    var v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-CN';
    u.rate = tts.rate;
    /* 每次主动打断（暂停 / 跳句 / 停止）都换一个代号，旧句子的回调就不再往下读 */
    var gen = tts.gen;
    u.onend = function () { if (tts.on && tts.gen === gen) { tts.i++; speakNext(); } };
    u.onerror = function () { if (tts.on && tts.gen === gen) { tts.i++; speakNext(); } };
    paintRead();
    window.speechSynthesis.speak(u);
  }
  function paintRead() {
    if (!tts.bar) return;
    tts.bar.querySelector('[data-t]').textContent = tts.list[tts.i] || '';
    tts.bar.querySelector('[data-n]').textContent = (tts.i + 1) + ' / ' + tts.list.length;
    tts.bar.querySelector('[data-a="pause"]').textContent = tts.paused ? '继续' : '暂停';
  }
  function stopRead() {
    tts.on = false; tts.paused = false; tts.gen++;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    if (tts.bar) { tts.bar.remove(); tts.bar = null; }
  }
  function readAloud() {
    if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) { U().toast('这个浏览器不支持朗读'); return; }
    if (tts.on) { stopRead(); return; }
    var ta = $('twsContent');
    if (!ta || !ta.value.trim()) { U().toast('这一章还没有内容'); return; }
    var ss = ta.selectionStart, se = ta.selectionEnd, text;
    if (se > ss) text = ta.value.slice(ss, se);
    else {
      /* 没选中：从光标所在的那一段开始读；光标在最后就从头读 */
      var from = ss >= ta.value.trim().length ? 0 : ta.value.lastIndexOf('\n', Math.max(0, ss - 1)) + 1;
      text = ta.value.slice(from);
    }
    tts.list = splitSpeech(text);
    if (!tts.list.length) { U().toast('没有可读的内容'); return; }
    tts.i = 0; tts.on = true; tts.paused = false; tts.gen++;
    tts.rate = Number(lsGet('tws_tts_rate')) || 1;
    tts.bar = document.createElement('div');
    tts.bar.className = 'tws-read-bar';
    tts.bar.innerHTML = '<div class="tws-read-t" data-t></div><div class="tws-read-c"><em data-n></em>' +
      '<button type="button" data-a="prev">上一句</button><button type="button" data-a="pause">暂停</button>' +
      '<button type="button" data-a="next">下一句</button>' +
      '<select data-rate title="语速">' + [0.8, 1, 1.2, 1.5, 2].map(function (r) {
        return '<option value="' + r + '"' + (r === tts.rate ? ' selected' : '') + '>' + r + '×</option>';
      }).join('') + '</select><button type="button" data-a="stop">停止</button></div>';
    document.body.appendChild(tts.bar);
    function jump(i) {
      tts.i = Math.max(0, Math.min(tts.list.length - 1, i)); tts.paused = false; tts.gen++;
      window.speechSynthesis.cancel();
      setTimeout(speakNext, 60);
    }
    tts.bar.addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a');
      if (a === 'stop') stopRead();
      else if (a === 'prev') jump(tts.i - 1);
      else if (a === 'next') jump(tts.i + 1);
      else if (a === 'pause') {
        /* 部分浏览器的 pause/resume 不可靠，这里用「取消 + 从这一句重读」 */
        if (tts.paused) { tts.paused = false; speakNext(); }
        else { tts.paused = true; tts.gen++; window.speechSynthesis.cancel(); paintRead(); }
      }
    });
    tts.bar.querySelector('[data-rate]').addEventListener('change', function () {
      tts.rate = Number(this.value) || 1; lsSet('tws_tts_rate', String(tts.rate));
      if (!tts.paused) jump(tts.i);
    });
    window.speechSynthesis.cancel();
    speakNext();
  }

  /* ============================================================
     番茄钟
     ============================================================ */
  var POMO_KEY = 'tws_pomo_v1';
  var pomoChip = null, pomoTick = 0;
  function pomo() {
    var p = parse(lsGet(POMO_KEY));
    if (!p || typeof p !== 'object') p = {};
    if (!Array.isArray(p.hist)) p.hist = [];
    return p;
  }
  function pomoSave(p) { lsSet(POMO_KEY, JSON.stringify(p)); }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function pomoLeft() { var p = pomo(); return p.end ? p.end - Date.now() : 0; }
  function pomoLabel() { var l = pomoLeft(); return l > 0 ? '进行中，还剩 ' + mmss(l) : '25 分钟冲刺，统计本次字数'; }
  function totalWords() { return D().D.chapters.reduce(function (s, c) { return s + (c.words || 0); }, 0); }
  function liveWords() {
    /* 编辑器里还没落盘的字也算上 */
    var ta = $('twsContent'), c = D().getChapter(T.currentChapter());
    return totalWords() + (ta && c ? D().countWords(ta.value) - (c.words || 0) : 0);
  }
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ac = new AC();
      [0, 0.28, 0.56].forEach(function (t, i) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = [660, 880, 1100][i];
        g.gain.setValueAtTime(0.0001, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.24);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.26);
      });
      setTimeout(function () { ac.close(); }, 1500);
    } catch (e) {}
  }
  function pomoStart(min) {
    var p = pomo();
    p.end = Date.now() + min * 60000; p.len = min; p.w0 = liveWords();
    pomoSave(p); pomoWatch();
    U().toast('番茄钟开始：' + min + ' 分钟');
  }
  function pomoFinish(early) {
    var p = pomo(); if (!p.end) return;
    T.flushSave();
    var wrote = Math.max(0, liveWords() - (p.w0 || 0));
    var spent = early ? Math.max(1, Math.round((p.len * 60000 - (p.end - Date.now())) / 60000)) : p.len;
    p.hist.push({ t: Date.now(), len: spent, w: wrote });
    if (p.hist.length > 200) p.hist = p.hist.slice(-200);
    p.end = 0; pomoSave(p); pomoWatch();
    if (!early) beep();
    var m = U().modal(early ? '番茄钟已结束' : '时间到，歇一会儿',
      '<div class="tws-stat-row"><div class="tws-stat"><b>' + spent + '</b><span>分钟</span></div>' +
      '<div class="tws-stat"><b>' + wrote + '</b><span>本次字数</span></div>' +
      '<div class="tws-stat"><b>' + Math.round(wrote / spent * 60) + '</b><span>字 / 小时</span></div></div>' +
      '<p class="tws-p" style="margin-top:14px">站起来走两步，喝口水。</p>',
      { okText: '再来一个', onOk: function () { pomoStart(p.len || 25); } });
    return m;
  }
  function pomoWatch() {
    clearInterval(pomoTick);
    var left = pomoLeft();
    if (!(left > 0)) {
      if (pomoChip) { pomoChip.remove(); pomoChip = null; }
      var p = pomo();
      if (p.end) pomoFinish(false);      // 页面关着的时候到点了：打开时补一次结算
      return;
    }
    if (!pomoChip) {
      pomoChip = document.createElement('button');
      pomoChip.type = 'button'; pomoChip.className = 'tws-pomo-chip';
      pomoChip.addEventListener('click', openPomo);
      document.body.appendChild(pomoChip);
    }
    function paint() {
      var l = pomoLeft();
      if (l <= 0) { clearInterval(pomoTick); if (pomoChip) { pomoChip.remove(); pomoChip = null; } pomoFinish(false); return; }
      pomoChip.innerHTML = '<i></i>' + mmss(l) + '<em>+' + Math.max(0, liveWords() - (pomo().w0 || 0)) + ' 字</em>';
    }
    paint();
    pomoTick = setInterval(paint, 1000);
  }
  function openPomo() {
    var p = pomo(), left = pomoLeft();
    var today = new Date().toDateString();
    var td = p.hist.filter(function (h) { return new Date(h.t).toDateString() === today; });
    var sumMin = td.reduce(function (s, h) { return s + h.len; }, 0), sumW = td.reduce(function (s, h) { return s + h.w; }, 0);
    var body = (left > 0
      ? '<p class="tws-p">正在计时，还剩 <b>' + mmss(left) + '</b>，本次已写 <b>' + Math.max(0, liveWords() - (p.w0 || 0)) + '</b> 字。</p>'
      : '<p class="tws-p">定个时间，只管往下写，不回头改。到点会响三声。</p>' +
        '<div class="tws-chips" id="pmLen">' + [15, 25, 45, 60].map(function (n) {
          return '<span class="chip' + (n === (p.len || 25) ? ' on' : '') + '" data-n="' + n + '">' + n + ' 分钟</span>';
        }).join('') + '</div>') +
      '<p class="tws-p tws-kit-dim" style="margin-top:14px">今天：' + td.length + ' 个番茄 · ' + sumMin + ' 分钟 · ' + sumW + ' 字</p>';
    var len = p.len || 25;
    var m = U().modal('番茄钟', body, {
      okText: left > 0 ? '提前结束' : '开始',
      onOk: function () { if (left > 0) setTimeout(function () { pomoFinish(true); }, 280); else pomoStart(len); }
    });
    var chips = m.el.querySelector('#pmLen');
    if (chips) chips.addEventListener('click', function (e) {
      var c = e.target.closest('[data-n]'); if (!c) return;
      len = Number(c.getAttribute('data-n'));
      chips.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === c); });
    });
  }

  /* ============================================================
     启动
     ============================================================ */
  function init() {
    initDrag();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (selBar) { hideSel(); return; }
        if (menuEl) { closeMenu(); return; }
        if (focus.on && !document.querySelector('.tws-modal-wrap')) toggleFocus();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        var book = $('v-book');
        if (focus.on || (book && book.classList.contains('active'))) { e.preventDefault(); toggleFocus(); }
      }
    });
    window.addEventListener('beforeunload', function () { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} });
    setTimeout(pomoWatch, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.kit = {
    openMenu: openMenu, openTrash: openTrash, openMove: openMove, toggleFocus: toggleFocus,
    readAloud: readAloud, openPomo: openPomo, onEditor: onEditor, caretXY: caretXY,
    lsGet: lsGet, lsSet: lsSet, parse: parse, isPhone: isPhone
  };
})();
