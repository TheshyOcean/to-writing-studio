/* ============================================================================
   TWS · 视图层
   书稿（项目/卷/章 + 正文 + 版本）/ 设定库 / 伏笔与时间线
   + 统计条 + AI 采纳按钮 + 导航入口 + 通用弹层
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;
  var $ = function (id) { return document.getElementById(id); };
  var esc = D.esc;

  var ui = {
    kind: 'character',      // 设定库当前分类
    tab: 'thread',          // 伏笔页当前 tab
    chapterId: null,        // 当前编辑的章节
    saveTimer: null,
    mounted: false
  };

  /* ============================================================
     通用：toast 与 modal
     ============================================================ */
  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'tws-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
    setTimeout(function () {
      el.classList.remove('on');
      setTimeout(function () { el.remove(); }, 300);
    }, 2000);
  }

  var modalStack = [];
  function modal(title, bodyHtml, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'tws-modal-wrap';
    wrap.innerHTML =
      '<div class="tws-modal">' +
        '<div class="tws-modal-h"><span class="sq"></span><b>' + esc(title) + '</b>' +
          '<button class="tws-x" data-close>✕</button></div>' +
        '<div class="tws-modal-b">' + bodyHtml + '</div>' +
        (opts.footer === false ? '' :
          '<div class="tws-modal-f">' +
            '<button class="tws-btn ghost" data-close>取消</button>' +
            '<button class="tws-btn primary" data-ok>' + esc(opts.okText || '确定') + '</button>' +
          '</div>') +
      '</div>';
    document.body.appendChild(wrap);
    modalStack.push(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });

    function close() {
      wrap.classList.remove('on');
      modalStack = modalStack.filter(function (w) { return w !== wrap; });
      setTimeout(function () { wrap.remove(); }, 260);
    }
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.hasAttribute('data-close')) close();
      if (e.target.hasAttribute('data-ok')) {
        if (opts.onOk && opts.onOk(wrap) === false) return;
        close();
      }
    });
    var first = wrap.querySelector('input,textarea');
    if (first) setTimeout(function () { first.focus(); }, 120);
    return { el: wrap, close: close };
  }

  function confirmBox(text, onYes) {
    modal('确认', '<p class="tws-p">' + esc(text) + '</p>', { okText: '确定', onOk: onYes });
  }

  /* ============================================================
     视图骨架
     ============================================================ */
  var BOOK_HTML =
    '<section class="view" id="v-book">' +
      '<div class="sec-head">' +
        '<span class="sec-no">03</span>' +
        '<span class="sec-meta"><span class="sec-en">// Manuscript</span><span class="sec-cn">书稿</span></span>' +
        '<span class="sec-right">' +
          '<span class="chip tws-goal-chip" id="twsGoalChip">今日 0 字</span>' +
          '<button class="mini-btn" id="twsBtnExport">导出</button>' +
          '<button class="mini-btn" id="twsBtnNewCh">新建章节</button>' +
        '</span>' +
      '</div>' +
      '<div class="tws-book">' +
        '<aside class="tws-tree" id="twsTree"></aside>' +
        '<div class="tws-editor" id="twsEditor"></div>' +
      '</div>' +
    '</section>';

  var LORE_HTML =
    '<section class="view" id="v-lore">' +
      '<div class="sec-head">' +
        '<span class="sec-no">04</span>' +
        '<span class="sec-meta"><span class="sec-en">// Lore</span><span class="sec-cn">设定库</span></span>' +
        '<span class="sec-right"><button class="mini-btn" id="twsBtnNewCard">新建卡片</button></span>' +
      '</div>' +
      '<div class="tws-tabs" id="twsLoreTabs"></div>' +
      '<div class="tws-lore-hint" id="twsLoreHint"></div>' +
      '<div class="tws-cards" id="twsCards"></div>' +
    '</section>';

  var THREADS_HTML =
    '<section class="view" id="v-threads">' +
      '<div class="sec-head">' +
        '<span class="sec-no">05</span>' +
        '<span class="sec-meta"><span class="sec-en">// Threads</span><span class="sec-cn">伏笔与时间线</span></span>' +
        '<span class="sec-right">' +
          '<button class="mini-btn" id="twsBtnExtract">从本章提取</button>' +
          '<button class="mini-btn" id="twsBtnNewThread">记一条</button>' +
        '</span>' +
      '</div>' +
      '<div class="tws-tabs" id="twsThreadTabs"></div>' +
      '<div class="tws-thread-list" id="twsThreadList"></div>' +
    '</section>';

  /* ============================================================
     书稿：项目树
     ============================================================ */
  function renderTree() {
    updateChapterChip();
    var box = $('twsTree');
    if (!box) return;
    var pid = D.D.activeProject;
    var p = pid && D.getProject(pid);

    if (!p) {
      box.innerHTML =
        '<div class="tws-empty">' +
          '<b>还没有作品</b>' +
          '<p>先建一本，之后按「卷 → 章」组织内容。</p>' +
          '<button class="tws-btn primary" id="twsCreateProj">新建作品</button>' +
        '</div>';
      var b = $('twsCreateProj');
      if (b) b.addEventListener('click', promptNewProject);
      renderEditor();
      return;
    }

    var vols = D.listVolumes(p.id);
    var html =
      '<div class="tws-proj">' +
        '<div class="tws-proj-h">' +
          '<div class="tws-proj-n">《' + esc(p.name) + '》</div>' +
          '<div class="tws-proj-s">' + vols.length + ' 卷 · ' +
            D.projectChapterCount(p.id) + ' 章 · ' + D.fmtNum(D.projectWords(p.id)) + ' 字</div>' +
          '<div class="tws-proj-a">' +
            '<button data-pact="addvol" title="新建卷">＋卷</button>' +
            '<button data-pact="editproj" title="作品设置">⋯</button>' +
          '</div>' +
        '</div>';

    vols.forEach(function (v) {
      var chs = D.listChapters(v.id);
      var w = chs.reduce(function (s, c) { return s + (c.words || 0); }, 0);
      html +=
        '<div class="tws-vol">' +
          '<div class="tws-vol-h" data-vol="' + v.id + '">' +
            '<span class="tws-caret">▾</span>' +
            '<span class="tws-vol-n">' + esc(v.title) + '</span>' +
            '<span class="tws-vol-s">' + chs.length + ' 章 · ' + D.fmtNum(w) + '</span>' +
            '<button data-vact="addch" data-vid="' + v.id + '" title="新建章节">＋</button>' +
            '<button data-vact="delvol" data-vid="' + v.id + '" title="删除卷">✕</button>' +
          '</div>' +
          '<div class="tws-chs">';
      chs.forEach(function (c) {
        html +=
          '<div class="tws-ch' + (c.id === ui.chapterId ? ' on' : '') + '" data-ch="' + c.id + '">' +
            '<span class="tws-ch-n">' + esc(c.title) + '</span>' +
            '<span class="tws-st st-' + c.status + '">' + T.exporters.statusName(c.status) + '</span>' +
            '<span class="tws-ch-w">' + (c.words || 0) + '</span>' +
          '</div>';
      });
      if (!chs.length) html += '<div class="tws-ch-empty">这一卷还没有章节</div>';
      html += '</div></div>';
    });

    if (!vols.length) {
      html += '<div class="tws-empty small"><p>还没有卷。</p>' +
        '<button class="tws-btn primary" data-pact="addvol">新建第一卷</button></div>';
    }
    html += '</div>';
    box.innerHTML = html;

    box.addEventListener('click', onTreeClick);
    renderEditor();
  }

  function onTreeClick(e) {
    var t = e.target;
    var ch = t.closest('[data-ch]');
    if (ch) { openChapter(ch.getAttribute('data-ch')); return; }

    var vact = t.closest('[data-vact]');
    if (vact) {
      e.stopPropagation();
      var vid = vact.getAttribute('data-vid');
      var act = vact.getAttribute('data-vact');
      if (act === 'addch') promptNewChapter(vid);
      if (act === 'delvol') {
        var v = D.D.volumes.filter(function (x) { return x.id === vid; })[0];
        confirmBox('删除「' + (v ? v.title : '') + '」及其中所有章节？此操作不可撤销。', function () {
          D.removeVolume(vid);
          if (ui.chapterId && !D.getChapter(ui.chapterId)) ui.chapterId = null;
          renderTree(); toast('已删除');
        });
      }
      return;
    }

    var pact = t.closest('[data-pact]');
    if (pact) {
      var a = pact.getAttribute('data-pact');
      if (a === 'addvol') promptNewVolume();
      if (a === 'editproj') promptEditProject();
    }
  }

  function promptNewProject() {
    modal('新建作品',
      '<label class="tws-l">作品名</label><input class="tws-i" id="mName" placeholder="例如：长夜将明">' +
      '<label class="tws-l">题材（可选）</label><input class="tws-i" id="mGenre" placeholder="玄幻 / 都市 / 悬疑…">',
      {
        onOk: function (w) {
          var n = w.querySelector('#mName').value.trim();
          if (!n) { toast('请填作品名'); return false; }
          var p = D.addProject(n, w.querySelector('#mGenre').value.trim());
          D.addVolume(p.id, '第一卷');
          var v = D.listVolumes(p.id)[0];
          var c = D.addChapter(v.id, '第一章');
          ui.chapterId = c.id;
          renderTree(); toast('已创建');
        }
      });
  }

  function promptEditProject() {
    var p = D.getProject(D.D.activeProject);
    if (!p) return;
    modal('作品设置',
      '<label class="tws-l">作品名</label><input class="tws-i" id="mName" value="' + esc(p.name) + '">' +
      '<label class="tws-l">题材</label><input class="tws-i" id="mGenre" value="' + esc(p.genre || '') + '">',
      {
        okText: '保存',
        onOk: function (w) {
          D.updateProject(p.id, {
            name: w.querySelector('#mName').value.trim() || p.name,
            genre: w.querySelector('#mGenre').value.trim()
          });
          renderTree(); toast('已保存');
        }
      });
  }

  function promptNewVolume() {
    var pid = D.D.activeProject; if (!pid) return;
    modal('新建卷',
      '<label class="tws-l">卷名</label><input class="tws-i" id="mVol" placeholder="第二卷">',
      {
        onOk: function (w) {
          var n = w.querySelector('#mVol').value.trim();
          if (!n) { toast('请填卷名'); return false; }
          D.addVolume(pid, n);
          renderTree(); toast('已创建');
        }
      });
  }

  function promptNewChapter(vid) {
    var pid = D.D.activeProject; if (!pid) return;
    var vols = D.listVolumes(pid);
    if (!vols.length) { promptNewVolume(); return; }
    vid = vid || (vols[0] && vols[0].id);
    modal('新建章节',
      '<label class="tws-l">章节标题</label><input class="tws-i" id="mCh" placeholder="第一章 雪夜">' +
      '<label class="tws-l">所属卷</label><select class="tws-i" id="mVol">' +
        vols.map(function (v) { return '<option value="' + v.id + '"' + (v.id === vid ? ' selected' : '') + '>' + esc(v.title) + '</option>'; }).join('') +
      '</select>',
      {
        onOk: function (w) {
          var n = w.querySelector('#mCh').value.trim();
          if (!n) { toast('请填章节标题'); return false; }
          var c = D.addChapter(w.querySelector('#mVol').value, n);
          ui.chapterId = c.id;
          renderTree(); toast('已创建');
        }
      });
  }

  /* ============================================================
     书稿：编辑器
     ============================================================ */
  function openChapter(id) {
    flushSave();
    ui.chapterId = id;
    D.D.activeChapter = id;
    var c = D.getChapter(id);
    if (c) {
      try {
        var api = window.__ENDF__;
        if (!c.convId && api && api.newConv) {
          var nc = api.newConv();
          if (nc) { c.convId = nc.id; nc.title = c.title; api.save && api.save(); }
        }
        if (c.convId && api && api.S) {
          api.S.activeId = c.convId;
          api.save && api.save();
          api.renderChat && api.renderChat();
          api.renderDrawer && api.renderDrawer();
        }
      } catch (e) {}
    }
    D.save();
    renderTree();
    updateChapterChip();
  }

  function renderEditor() {
    var box = $('twsEditor');
    if (!box) return;
    var c = ui.chapterId && D.getChapter(ui.chapterId);
    if (!c) {
      box.innerHTML = '<div class="tws-empty"><b>选一章开始写</b><p>左侧点章节，或新建一章。</p></div>';
      return;
    }
    box.innerHTML =
      '<div class="tws-ch-head">' +
        '<input class="tws-ch-title" id="twsChTitle" value="' + esc(c.title) + '" spellcheck="false">' +
        '<div class="tws-ch-row">' +
          '<span class="tws-st st-' + c.status + '" id="twsStatus">' + T.exporters.statusName(c.status) + '</span>' +
          '<span class="tws-words" id="twsWords">' + (c.words || 0) + ' 字</span>' +
          '<span class="tws-upd">' + D.timeAgo(c.updated) + '</span>' +
          '<span class="tws-spacer"></span>' +
          '<button class="tws-btn sm ai" id="twsBtnPolish">润色</button>' +
          '<button class="tws-btn sm ai" id="twsBtnIdeate">构思</button>' +
          '<button class="tws-btn sm" id="twsBtnHist">历史</button>' +
          '<button class="tws-btn sm" id="twsBtnCheck">检查</button>' +
          '<button class="tws-btn sm ghost" id="twsBtnDelCh">删除</button>' +
        '</div>' +
      '</div>' +
      '<textarea class="tws-content" id="twsContent" spellcheck="false" placeholder="从这里开始写……"></textarea>';

    var ta = $('twsContent');
    ta.value = c.content || '';
    autosize(ta);

    ta.addEventListener('input', function () {
      autosize(ta);
      clearTimeout(ui.saveTimer);
      ui.saveTimer = setTimeout(flushSave, 900);
    });
    ta.addEventListener('blur', flushSave);

    $('twsChTitle').addEventListener('change', function () {
      var c2 = D.getChapter(ui.chapterId);
      if (c2 && this.value.trim()) { D.updateChapter(c2.id, { title: this.value.trim() }); renderTree(); }
    });

    $('twsStatus').addEventListener('click', function () { cycleStatus(); });
    $('twsBtnPolish').addEventListener('click', openPolish);
    $('twsBtnIdeate').addEventListener('click', openIdeate);
    $('twsBtnHist').addEventListener('click', openHistory);
    $('twsBtnCheck').addEventListener('click', openCheck);
    $('twsBtnDelCh').addEventListener('click', function () {
      confirmBox('删除「' + c.title + '」？正文与版本记录都会删除。', function () {
        D.removeChapter(c.id); ui.chapterId = null; renderTree(); toast('已删除');
      });
    });
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(280, ta.scrollHeight) + 'px';
  }

  function flushSave() {
    clearTimeout(ui.saveTimer); ui.saveTimer = null;
    var ta = $('twsContent');
    if (!ta || !ui.chapterId) return;
    var c = D.getChapter(ui.chapterId);
    if (!c || c.content === ta.value) return;
    D.saveChapterContent(ui.chapterId, ta.value, '编辑前');
    var w = $('twsWords');
    if (w) w.textContent = (c.words || 0) + ' 字';
    renderGoalChip();
  }

  var STATUS_CYCLE = ['draft', 'revising', 'final'];
  function cycleStatus() {
    var c = D.getChapter(ui.chapterId); if (!c) return;
    var i = STATUS_CYCLE.indexOf(c.status);
    var next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    if (next === 'final') {
      // 定稿前提示检查
      modal('标记为定稿',
        '<p class="tws-p">定稿前建议跑一次检查。要现在检查吗？</p>',
        {
          okText: '先检查', onOk: function () { setStatus(c.id, 'final'); openCheck(); },
          footer: true
        });
      return;
    }
    setStatus(c.id, next);
  }
  function setStatus(id, st) {
    D.updateChapter(id, { status: st });
    D.snapshot(id, st === 'final' ? '定稿' : '状态变更', D.getChapter(id).content);
    var el = $('twsStatus');
    if (el) { el.textContent = T.exporters.statusName(st); el.className = 'tws-st st-' + st; }
    renderTree();
    toast('已标记为' + T.exporters.statusName(st));
  }


  /* ---------- AI 润色 ---------- */
  function needKeyGuide() {
    modal('还差一步',
      '<p class="tws-p">AI 功能需要你的 API Key。它只存在这台设备的浏览器里，不会上传。</p>' +
      '<p class="tws-p" style="margin-top:10px">到「系统配置」里填入 Key（DeepSeek 等都可以），' +
      '之后润色、构思、检查就都能用了。</p>' +
      '<p class="tws-p" style="margin-top:10px">不配也能用：项目、正文、设定库、伏笔、导出全部可用。</p>',
      { okText: '去配置', onOk: function () { window.showView && window.showView('v-cfg'); } });
  }

  function openPolish() {
    flushSave();
    var ta = $('twsContent'), c = D.getChapter(ui.chapterId);
    if (!ta || !c) return;
    var ss = ta.selectionStart, se = ta.selectionEnd;
    var hasSel = se > ss;
    var target = hasSel ? ta.value.slice(ss, se) : ta.value;
    if (!target.trim()) { toast('先写点内容再润色'); return; }
    if (T.ai.needKey()) { needKeyGuide(); return; }

    var styles = T.ai.POLISH_STYLES.map(function (x, i) {
      return '<span class="chip' + (i === 0 ? ' on' : '') + '" data-ps="' + x.k + '">' + x.name + '</span>';
    }).join('');

    var m = modal('AI 润色',
      '<div class="tws-p" style="margin-bottom:10px">' +
        (hasSel ? '已选中 <b>' + target.length + '</b> 字' : '整章 <b>' + target.length + '</b> 字（未选中则处理全文）') +
      '</div>' +
      '<div class="tws-chips" id="psChips">' + styles + '</div>' +
      '<div class="tws-ai-out" id="psOut">选择风格后点「开始润色」</div>' +
      '<div class="tws-ai-meta" id="psMeta"></div>',
      { footer: false });

    var cur = T.ai.POLISH_STYLES[0].k;
    var out = m.el.querySelector('#psOut');
    var result = '';

    m.el.querySelector('#psChips').addEventListener('click', function (e) {
      var c2 = e.target.closest('[data-ps]');
      if (!c2) return;
      cur = c2.getAttribute('data-ps');
      this.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === c2); });
    });

    var f = m.el.querySelector('.tws-modal-b');
    var bar = document.createElement('div');
    bar.className = 'tws-ai-bar';
    bar.innerHTML = '<button class="tws-btn primary" id="psRun">开始润色</button>' +
      '<span class="tws-spacer"></span>' +
      '<button class="tws-btn sm" id="psReplace" disabled>' + (hasSel ? '替换选中' : '替换全文') + '</button>' +
      '<button class="tws-btn sm" id="psAppend" disabled>追加到末尾</button>';
    f.appendChild(bar);

    bar.querySelector('#psRun').addEventListener('click', function () {
      this.disabled = true;
      result = '';
      out.textContent = '';
      out.classList.add('streaming');
      T.ai.polish(target, cur, function (txt) {
        out.textContent = txt;
        out.scrollTop = out.scrollHeight;
      }).then(function (full) {
        result = full || out.textContent;
        out.classList.remove('streaming');
        var meta = m.el.querySelector('#psMeta');
        if (meta) {
          var longer = result.length > target.length * 1.6;
          meta.textContent = '原文 ' + target.length + ' 字 → 润色后 ' + result.length + ' 字' +
            (longer ? ' · 明显变长了，替换前请先看一眼' : '');
          meta.classList.toggle('warn', longer);
        }
        bar.querySelector('#psReplace').disabled = false;
        bar.querySelector('#psAppend').disabled = false;
        bar.querySelector('#psRun').disabled = false;
      }).catch(function (e) {
        out.textContent = '润色失败：' + e.message;
        out.classList.remove('streaming');
        bar.querySelector('#psRun').disabled = false;
      });
    });

    bar.querySelector('#psReplace').addEventListener('click', function () {
      if (!result) return;
      var t = $('twsContent');
      if (!t) return;
      D.saveChapterContent(c.id, t.value, 'AI 润色前');
      if (hasSel) {
        t.value = t.value.slice(0, ss) + result + t.value.slice(se);
      } else {
        t.value = result;
      }
      t.dispatchEvent(new Event('input', { bubbles: true }));
      flushSave();
      renderTree();
      m.close();
      toast('已替换（旧版本已存进历史）');
    });

    bar.querySelector('#psAppend').addEventListener('click', function () {
      if (!result) return;
      var t = $('twsContent');
      if (!t) return;
      D.saveChapterContent(c.id, t.value, 'AI 润色前');
      t.value = (t.value ? t.value + '\n\n' : '') + result;
      t.dispatchEvent(new Event('input', { bubbles: true }));
      flushSave();
      renderTree();
      m.close();
      toast('已追加到末尾');
    });
  }

  /* ---------- AI 辅助构思 ---------- */
  function openIdeate() {
    flushSave();
    var c = D.getChapter(ui.chapterId);
    if (!c) { toast('先选一章'); return; }
    if (T.ai.needKey()) { needKeyGuide(); return; }

    var chips = T.ai.IDEAS.map(function (x) {
      return '<span class="chip" data-idea="' + x.k + '">' + x.label + '</span>';
    }).join('');

    var m = modal('AI 辅助构思',
      '<div class="tws-chips" id="idChips">' + chips + '</div>' +
      '<input class="tws-i" id="idQ" style="margin-top:12px" placeholder="或者直接写你想问的，例如：这段怎么写得更有压迫感">' +
      '<div class="tws-ai-out" id="idOut">选一个问题，或自己写一个</div>',
      { footer: false });

    var out = m.el.querySelector('#idOut');
    var qInput = m.el.querySelector('#idQ');
    var result = '';

    var bar = document.createElement('div');
    bar.className = 'tws-ai-bar';
    bar.innerHTML = '<button class="tws-btn primary" id="idRun">开始构思</button>' +
      '<span class="tws-spacer"></span>' +
      '<button class="tws-btn sm" id="idCopy" disabled>复制</button>';
    m.el.querySelector('.tws-modal-b').appendChild(bar);

    m.el.querySelector('#idChips').addEventListener('click', function (e) {
      var c2 = e.target.closest('[data-idea]');
      if (!c2) return;
      var it = T.ai.IDEAS.filter(function (x) { return x.k === c2.getAttribute('data-idea'); })[0];
      qInput.value = it ? it.q : '';
      this.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === c2); });
    });

    bar.querySelector('#idRun').addEventListener('click', function () {
      var q = qInput.value.trim();
      if (!q) { toast('先选一个问题或自己写一个'); return; }
      this.disabled = true;
      result = '';
      out.textContent = '';
      out.classList.add('streaming');
      T.ai.ideate(D.D.activeProject, c, q, function (txt) {
        out.textContent = txt;
        out.scrollTop = out.scrollHeight;
      }).then(function (full) {
        result = full || out.textContent;
        out.classList.remove('streaming');
        bar.querySelector('#idCopy').disabled = false;
        bar.querySelector('#idRun').disabled = false;
      }).catch(function (e) {
        out.textContent = '构思失败：' + e.message;
        out.classList.remove('streaming');
        bar.querySelector('#idRun').disabled = false;
      });
    });

    bar.querySelector('#idCopy').addEventListener('click', function () {
      if (!result) return;
      try { navigator.clipboard.writeText(result); toast('已复制'); } catch (e) { toast('复制失败'); }
    });
  }


  /* ---------- 从本章正文提取伏笔与时间线 ---------- */
  function openExtract() {
    flushSave();
    var pid = D.D.activeProject;
    if (!pid) { toast('先建一部作品'); return; }
    var c = ui.chapterId && D.getChapter(ui.chapterId);
    if (!c) { toast('先去书稿选一章'); return; }
    if (!(c.content || '').trim()) { toast('这一章还没有正文'); return; }
    if (T.ai.needKey()) { needKeyGuide(); return; }

    var m = modal('从「' + c.title + '」提取',
      '<p class="tws-p">让 AI 读一遍这章正文，把新人物与设定、埋下的伏笔和有明确时间感的事件整理出来。' +
      '提取结果会先给你过目，你点确认才写入。</p>' +
      '<div class="tws-ai-out" id="exOut" style="margin-top:12px">点下面的按钮开始</div>',
      { footer: false });

    var out = m.el.querySelector('#exOut');
    var bar = document.createElement('div');
    bar.className = 'tws-ai-bar';
    bar.innerHTML = '<button class="tws-btn primary" id="exRun">开始提取</button>' +
      '<span class="tws-spacer"></span>' +
      '<button class="tws-btn sm" id="exOk" disabled>确认写入</button>';
    m.el.querySelector('.tws-modal-b').appendChild(bar);

    var ops = [];
    bar.querySelector('#exRun').addEventListener('click', function () {
      this.disabled = true;
      out.textContent = '';
      out.classList.add('streaming');
      T.ai.extract(c, function (txt) {
        out.textContent = txt;
        out.scrollTop = out.scrollHeight;
      }).then(function (full) {
        out.classList.remove('streaming');
        var parsed = T.ops.parse(full || out.textContent);
        ops = parsed.ops;
        bar.querySelector('#exRun').disabled = false;
        if (!ops.length) {
          out.textContent = '这一章里没找到可以归档的人物、伏笔或时间线事件。';
          return;
        }
        out.textContent = '';
        var list = document.createElement('div');
        list.innerHTML = ops.map(function (op) {
          return '<div class="tws-opline"><i>' + esc(T.ops.LABEL[op.op] || op.op) + '</i>' +
            esc(T.ops.describe(op).replace(/^(写入伏笔|写入时间线|设定库写入)/, '')) + '</div>';
        }).join('');
        out.appendChild(list);
        bar.querySelector('#exOk').disabled = false;
      }).catch(function (e) {
        out.textContent = '提取失败：' + e.message;
        out.classList.remove('streaming');
        bar.querySelector('#exRun').disabled = false;
      });
    });

    bar.querySelector('#exOk').addEventListener('click', function () {
      if (!ops.length) return;
      var r = runOps(ops);
      m.close();
      toast('已写入：' + r.done.join('、'));
      if (ui.tab !== 'thread') { ui.tab = 'thread'; }
      renderThreads();
    });
  }

  /* ---------- 版本历史 ---------- */
  function openHistory() {
    flushSave();
    var c = D.getChapter(ui.chapterId); if (!c) return;
    var list = D.listVersions(c.id);
    var html = '<div class="tws-vers">';
    html += '<div class="tws-ver on"><div class="tws-ver-t">当前</div>' +
      '<div class="tws-ver-m">' + (c.words || 0) + ' 字</div></div>';
    if (!list.length) {
      html += '<p class="tws-p" style="margin-top:12px">还没有历史版本。每次编辑、AI 改写、定稿都会自动留档。</p>';
    }
    list.forEach(function (v) {
      html += '<div class="tws-ver" data-ver="' + v.id + '">' +
        '<div class="tws-ver-t">' + esc(v.label) + '</div>' +
        '<div class="tws-ver-m">' + D.countWords(v.content) + ' 字 · ' + D.timeAgo(v.created) + '</div>' +
        '</div>';
    });
    html += '</div>';

    var m = modal('历史 · ' + c.title, html, { footer: false });
    m.el.addEventListener('click', function (e) {
      var v = e.target.closest('[data-ver]');
      if (!v) return;
      var vid = v.getAttribute('data-ver');
      showDiff(c.id, vid, m);
    });
  }

  function showDiff(chapterId, verId, parentModal) {
    var c = D.getChapter(chapterId);
    var v = (D.D.versions[chapterId] || []).filter(function (x) { return x.id === verId; })[0];
    if (!c || !v) return;
    var a = String(v.content || '').split(/\n+/).filter(function (x) { return x.trim(); });
    var b = String(c.content || '').split(/\n+/).filter(function (x) { return x.trim(); });
    var max = Math.max(a.length, b.length);
    var rows = '';
    for (var i = 0; i < max; i++) {
      var left = a[i] || '', right = b[i] || '';
      var changed = left !== right;
      rows += '<tr class="' + (changed ? 'chg' : '') + '">' +
        '<td>' + esc(left) + '</td><td>' + esc(right) + '</td></tr>';
    }
    parentModal.close();
    var m = modal('对比 · ' + v.label,
      '<div class="tws-diff"><table>' +
        '<thead><tr><th>' + esc(v.label) + '</th><th>当前</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>',
      { okText: '回滚到这一版' });
    m.el.querySelector('[data-ok]').addEventListener('click', function () {
      D.rollback(chapterId, verId);
      renderTree(); renderEditor(); toast('已回滚');
    });
  }

  /* ---------- 一致性检查 ---------- */
  function openCheck() {
    flushSave();
    var c = D.getChapter(ui.chapterId); if (!c) return;
    var m = modal('定稿前检查 · ' + c.title,
      '<div class="tws-checking"><div class="tws-spin"></div><p>正在检查…</p>' +
      '<p class="tws-p">本地规则瞬时完成，语义检查需要几秒</p></div>',
      { footer: false });

    T.checker.run(D.D.activeProject, c.id).then(function (res) {
      var issues = res.issues || [];
      var html = '';
      if (!issues.length) {
        html += '<div class="tws-ok-big">✓ 没有发现明显问题</div>';
      } else {
        html += '<div class="tws-issue-h">⚠ ' + issues.length + ' 处需要注意</div>';
        issues.forEach(function (it, i) {
          html += '<div class="tws-issue">' +
            '<div class="tws-issue-t">' + esc(it.title) + '</div>' +
            (it.quote ? '<div class="tws-issue-q">「' + esc(it.quote) + '」</div>' : '') +
            '<div class="tws-issue-r">' + esc(it.reason) + '</div>' +
            '</div>';
        });
      }
      if (res.noKey) {
        html += '<p class="tws-p" style="margin-top:14px">⚠ 未配置 API Key，只跑了本地规则检查（名字 / 顺序）。配置后可检查人设与时间线。</p>';
      }
      m.el.querySelector('.tws-modal-b').innerHTML = html;
      m.el.querySelector('.tws-modal-f') && (m.el.querySelector('.tws-modal-f').innerHTML =
        '<button class="tws-btn ghost" data-close>关闭</button>' +
        '<button class="tws-btn primary" data-ok>仍然定稿</button>');
      var ok = m.el.querySelector('[data-ok]');
      if (ok) ok.addEventListener('click', function () { setStatus(c.id, 'final'); m.close(); });
    }).catch(function (e) {
      m.el.querySelector('.tws-modal-b').innerHTML =
        '<p class="tws-p">检查失败：' + esc(e.message) + '</p>';
    });
  }

  /* ============================================================
     设定库
     ============================================================ */
  function renderLore() {
    var pid = D.D.activeProject;
    var tabs = $('twsLoreTabs');
    var box = $('twsCards');
    if (!tabs || !box) return;

    if (!pid) {
      tabs.innerHTML = '';
      box.innerHTML = '<div class="tws-empty"><b>先建一部作品</b><p>设定卡片挂在作品下面。</p></div>';
      return;
    }

    tabs.innerHTML = Object.keys(D.CARD_KINDS).map(function (k) {
      var n = D.listCards(pid, k).length;
      return '<span class="chip' + (ui.kind === k ? ' on' : '') + '" data-kind="' + k + '">' +
        D.CARD_KINDS[k] + (n ? ' ' + n : '') + '</span>';
    }).join('');

    var list = D.listCards(pid, ui.kind);
    if (!list.length) {
      box.innerHTML = '<div class="tws-empty small"><b>还没有' + D.CARD_KINDS[ui.kind] + '卡片</b>' +
        '<p>把人物性格、外貌、关系记成卡片，续写时可以带上。</p>' +
        '<button class="tws-btn primary" data-newcard>新建一张</button></div>';
      return;
    }

    updateLoreHint();
    box.innerHTML = list.map(function (c) {
      var attrs = c.attrs || {};
      var brief = c.body || Object.keys(attrs).map(function (k) { return attrs[k]; }).filter(Boolean).join(' · ');
      return '<div class="tws-card' + (c.on ? ' on' : '') + '" data-card="' + c.id + '">' +
        '<div class="tws-card-h">' +
          '<b>' + esc(c.name) + '</b>' +
          '<span class="tws-sw' + (c.on ? ' on' : '') + '" data-on="' + c.id + '" title="写这一章时带上这条设定"></span>' +
        '</div>' +
        (c.aliases && c.aliases.length ? '<div class="tws-card-al">' + esc(c.aliases.join('、')) + '</div>' : '') +
        '<div class="tws-card-b">' + esc(brief || '（未填写描述）') + '</div>' +
      '</div>';
    }).join('');
  }

  function updateLoreHint() {
    var el = $('twsLoreHint');
    if (!el) return;
    var n = D.onCards().length;
    el.innerHTML = n
      ? '已带上 <b>' + n + '</b> 条设定 · 续写时会自动写进提示词'
      : '卡片右上角的开关 = 写这一章时带上它。勾选后 AI 会自动带着设定写，不容易写崩人设。';
    el.classList.toggle('has', n > 0);
  }

  function promptCard(card) {
    var pid = D.D.activeProject; if (!pid) { toast('先建一部作品'); return; }
    var c = card || {};
    var isNew = !card;
    var body =
      '<label class="tws-l">名称</label><input class="tws-i" id="cName" value="' + esc(c.name || '') + '" placeholder="沈砚">' +
      '<label class="tws-l">分类</label><select class="tws-i" id="cKind">' +
        Object.keys(D.CARD_KINDS).map(function (k) {
          return '<option value="' + k + '"' + ((c.kind || ui.kind) === k ? ' selected' : '') + '>' + D.CARD_KINDS[k] + '</option>';
        }).join('') + '</select>' +
      '<label class="tws-l">别名（逗号分隔）</label><input class="tws-i" id="cAlias" value="' + esc((c.aliases || []).join(',')) + '" placeholder="阿砚, 沈七">' +
      '<label class="tws-l">描述</label><textarea class="tws-i tws-ta" id="cBody" placeholder="性格、外貌、关系、来历…">' + esc(c.body || '') + '</textarea>' +
      '<label class="tws-chk"><input type="checkbox" id="cPin"' + (c.pinned ? ' checked' : '') + '> 常驻（每次续写默认带上）</label>';

    modal(isNew ? '新建卡片' : '编辑卡片', body, {
      okText: isNew ? '创建' : '保存',
      onOk: function (w) {
        var name = w.querySelector('#cName').value.trim();
        if (!name) { toast('请填名称'); return false; }
        var patch = {
          name: name,
          kind: w.querySelector('#cKind').value,
          body: w.querySelector('#cBody').value.trim(),
          aliases: w.querySelector('#cAlias').value.split(/[,，\s]+/).map(function (s) { return s.trim(); }).filter(Boolean),
          pinned: w.querySelector('#cPin').checked ? 1 : 0
        };
        if (isNew) D.addCard(pid, patch.kind, patch.name, patch.body, {}, patch.aliases);
        if (isNew) {
          var last = D.D.cards[D.D.cards.length - 1];
          if (last) D.updateCard(last.id, { pinned: patch.pinned });
        } else {
          D.updateCard(c.id, patch);
        }
        ui.kind = patch.kind;
        renderLore(); toast(isNew ? '已创建' : '已保存');
      }
    });
  }

  /* ============================================================
     伏笔与时间线
     ============================================================ */
  function renderThreads() {
    var pid = D.D.activeProject;
    var tabs = $('twsThreadTabs');
    var box = $('twsThreadList');
    if (!tabs || !box) return;

    tabs.innerHTML =
      '<span class="chip' + (ui.tab === 'thread' ? ' on' : '') + '" data-tab="thread">伏笔</span>' +
      '<span class="chip' + (ui.tab === 'timeline' ? ' on' : '') + '" data-tab="timeline">时间线</span>';

    if (!pid) {
      box.innerHTML = '<div class="tws-empty"><b>先建一部作品</b></div>';
      return;
    }

    if (ui.tab === 'thread') {
      var list = D.listThreads(pid);
      if (!list.length) {
        box.innerHTML = '<div class="tws-empty small"><b>还没有伏笔</b><p>记下埋了什么、准备在哪回收。</p></div>';
        return;
      }
      box.innerHTML = list.map(function (t) {
        var pc = t.plantChapter && D.getChapter(t.plantChapter);
        var oc = t.payoffChapter && D.getChapter(t.payoffChapter);
        var st = t.status === 'done' ? 'done' : (t.status === 'dropped' ? 'dropped' : 'open');
        return '<div class="tws-thread" data-thread="' + t.id + '">' +
          '<span class="tws-dot ' + st + '"></span>' +
          '<div class="tws-thread-m">' +
            '<b>' + esc(t.name) + '</b>' +
            (t.note ? '<span class="tws-thread-n">' + esc(t.note) + '</span>' : '') +
          '</div>' +
          '<div class="tws-thread-c">埋 ' + (pc ? esc(pc.title) : '—') +
            ' · 收 ' + (oc ? esc(oc.title) : '—') + '</div>' +
          '<span class="tws-tag ' + st + '">' + (st === 'done' ? '已回收' : st === 'dropped' ? '已废弃' : '未回收') + '</span>' +
        '</div>';
      }).join('');
    } else {
      var evs = D.listEvents(pid);
      if (!evs.length) {
        box.innerHTML = '<div class="tws-empty small"><b>还没有时间线事件</b><p>记下「什么时候、谁、发生了什么」。</p></div>';
        return;
      }
      var cur = null, html = '';
      evs.forEach(function (e) {
        var ch = e.chapterId && D.getChapter(e.chapterId);
        var grp = ch ? ch.title : '全书背景';
        if (grp !== cur) {
          if (cur !== null) html += '</div>';
          html += '<div class="tws-tl-g"><div class="tws-tl-gh">' + esc(grp) + '</div>';
          cur = grp;
        }
        html += '<div class="tws-tl" data-event="' + e.id + '">' +
          '<span class="tws-tl-w">' + esc(e.whenLabel || '—') + '</span>' +
          '<span class="tws-tl-t">' + esc(e.what) + '</span>' +
          (e.who ? '<span class="tws-tl-h">' + esc(e.who) + '</span>' : '') +
          '</div>';
      });
      if (cur !== null) html += '</div>';
      box.innerHTML = html;
    }
  }

  function promptThread() {
    var pid = D.D.activeProject; if (!pid) { toast('先建一部作品'); return; }
    var chs = allChapters(pid);
    modal('记一条伏笔',
      '<label class="tws-l">埋了什么</label><input class="tws-i" id="tName" placeholder="断剑的来历">' +
      '<label class="tws-l">备注（可选）</label><input class="tws-i" id="tNote" placeholder="准备在第三卷揭晓">' +
      '<label class="tws-l">埋在哪一章</label><select class="tws-i" id="tPlant">' +
        '<option value="">（暂不指定）</option>' +
        chs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === ui.chapterId ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('') +
      '</select>',
      {
        onOk: function (w) {
          var n = w.querySelector('#tName').value.trim();
          if (!n) { toast('请填内容'); return false; }
          D.addThread(pid, n, w.querySelector('#tNote').value.trim(), w.querySelector('#tPlant').value);
          renderThreads(); toast('已记录');
        }
      });
  }

  function promptEvent() {
    var pid = D.D.activeProject; if (!pid) { toast('先建一部作品'); return; }
    var chs = allChapters(pid);
    modal('记一条时间线事件',
      '<label class="tws-l">什么时候</label><input class="tws-i" id="eWhen" placeholder="三年前 / 第 3 天">' +
      '<label class="tws-l">发生了什么</label><input class="tws-i" id="eWhat" placeholder="沈砚师父被杀">' +
      '<label class="tws-l">涉及谁</label><input class="tws-i" id="eWho" placeholder="沈砚、老张">' +
      '<label class="tws-l">发生在哪一章</label><select class="tws-i" id="eCh">' +
        '<option value="">（全书背景）</option>' +
        chs.map(function (c) { return '<option value="' + c.id + '">' + esc(c.title) + '</option>'; }).join('') +
      '</select>',
      {
        onOk: function (w) {
          var what = w.querySelector('#eWhat').value.trim();
          if (!what) { toast('请填事件内容'); return false; }
          D.addEvent(pid, w.querySelector('#eCh').value, w.querySelector('#eWhen').value.trim(),
            w.querySelector('#eWho').value.trim(), what);
          renderThreads(); toast('已记录');
        }
      });
  }

  function allChapters(pid) {
    var out = [];
    D.listVolumes(pid).forEach(function (v) {
      D.listChapters(v.id).forEach(function (c) { out.push(c); });
    });
    return out;
  }

  /* ============================================================
     导出
     ============================================================ */
  function openExport() {
    var pid = D.D.activeProject;
    if (!pid) { toast('先建一部作品'); return; }
    modal('导出',
      '<label class="tws-chk"><input type="checkbox" id="xTitles" checked> 章节标题</label>' +
      '<label class="tws-chk"><input type="checkbox" id="xVol" checked> 卷标题</label>' +
      '<label class="tws-chk"><input type="checkbox" id="xMeta"> 章节状态与字数</label>' +
      '<p class="tws-p" style="margin-top:12px">导出整本：Word 会按卷分段，正文首行缩进两字。</p>',
      {
        okText: '导出 .docx',
        onOk: function (w) {
          var p = D.getProject(pid);
          var blob = T.exporters.docx(pid, {
            titles: w.querySelector('#xTitles').checked,
            volumeTitles: w.querySelector('#xVol').checked,
            meta: w.querySelector('#xMeta').checked
          });
          if (!blob) { toast('导出失败'); return false; }
          T.exporters.download(blob, (p ? p.name : 'book') + '.docx');
          toast('已导出');
        }
      });
  }

  function exportTxt() {
    var pid = D.D.activeProject;
    if (!pid) { toast('先建一部作品'); return; }
    var p = D.getProject(pid);
    var txt = D.buildText(pid);
    // UTF-8 BOM，避免记事本乱码
    var blob = new Blob(['\uFEFF' + txt], { type: 'text/plain;charset=utf-8' });
    T.exporters.download(blob, (p ? p.name : 'book') + '.txt');
    toast('已导出 .txt');
  }

  /* ============================================================
     统计条
     ============================================================ */
  function renderGoalChip() {
    var el = $('twsGoalChip');
    if (!el) return;
    var today = D.todayWords(), goal = D.D.goal || 0;
    el.textContent = goal > 0
      ? '今日 ' + today + ' / ' + goal + ' 字'
      : '今日 ' + today + ' 字';
  }

  function openStats() {
    var l7 = D.last7();
    var max = Math.max.apply(null, l7.map(function (x) { return x.words; }).concat([1]));
    var bars = l7.map(function (x) {
      var h = Math.round(x.words / max * 100);
      return '<div class="tws-bar"><i style="height:' + h + '%"></i>' +
        '<span>' + x.label + '</span><em>' + (x.words || '') + '</em></div>';
    }).join('');

    modal('写作进度',
      '<div class="tws-stat-row">' +
        '<div class="tws-stat"><b>' + D.todayWords() + '</b><span>今日字数</span></div>' +
        '<div class="tws-stat"><b>' + D.weekWords() + '</b><span>本周字数</span></div>' +
        '<div class="tws-stat"><b>' + D.streak() + '</b><span>连续天数</span></div>' +
      '</div>' +
      '<div class="tws-bars">' + bars + '</div>' +
      '<label class="tws-l" style="margin-top:16px">每日目标（字）</label>' +
      '<input class="tws-i" id="sGoal" type="number" min="0" step="100" value="' + (D.D.goal || 0) + '">',
      {
        okText: '保存目标',
        onOk: function (w) {
          D.setGoal(w.querySelector('#sGoal').value);
          renderGoalChip(); toast('已保存');
        }
      });
  }

  /* ============================================================
     模板选择器（对话视图）
     ============================================================ */
  function openTemplate() {
    var cards = T.templates.LIST.map(function (t) {
      return '<div class="tws-tpl" data-tpl="' + t.id + '">' +
        '<b>' + t.name + '</b><span>' + t.hint + '</span></div>';
    }).join('');
    var m = modal('选一个开头', '<div class="tws-tpls">' + cards + '</div>', { footer: false });
    m.el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tpl]');
      if (!t) return;
      m.close();
      openTemplateForm(t.getAttribute('data-tpl'));
    });
  }

  function openTemplateForm(tplId) {
    var tpl = T.templates.LIST.filter(function (t) { return t.id === tplId; })[0];
    if (!tpl) return;
    var body = tpl.fields.map(function (f) {
      return '<label class="tws-l">' + esc(f.label) + '</label>' +
        '<input class="tws-i" data-f="' + f.k + '" placeholder="' + esc(f.ph || '') + '">';
    }).join('');
    body += '<label class="tws-l">风格</label><div class="tws-chips" id="tplStyles">' +
      Object.keys(T.templates.STYLES).map(function (k) {
        return '<span class="chip' + (k === tpl.style ? ' on' : '') + '" data-style="' + k + '">' +
          T.templates.STYLES[k].name + '</span>';
      }).join('') + '</div>';

    var curStyle = tpl.style;
    var m = modal(tpl.name, body, {
      okText: '生成',
      onOk: function (w) {
        var vals = {};
        w.querySelectorAll('[data-f]').forEach(function (i) { vals[i.getAttribute('data-f')] = i.value; });
        var prompt = T.templates.build(tpl.id, vals, curStyle);
        sendToChat(prompt);
      }
    });
    m.el.querySelector('#tplStyles').addEventListener('click', function (e) {
      var c = e.target.closest('[data-style]');
      if (!c) return;
      curStyle = c.getAttribute('data-style');
      this.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === c); });
    });
  }

  /* 把提示词发进对话 */
  function sendToChat(text) {
    if (!text) return;
    if (window.showView) window.showView('v-chat');
    setTimeout(function () {
      var ta = document.getElementById('input');
      if (!ta) { toast('找不到输入框'); return; }
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      // 触发发送：优先点按钮
      var send = document.getElementById('btnSend') || document.querySelector('[data-act="send"]');
      if (send) send.click();
      else {
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
      toast('已填入，按需修改后发送');
    }, 380);
  }

  /* ============================================================
     AI 采纳按钮（注入到对话消息）
     ============================================================ */
  function curConv() {
    var S = window.__ENDF__ && window.__ENDF__.S;
    if (!S) return null;
    return (S.convs || []).filter(function (c) { return c.id === S.activeId; })[0] || null;
  }

  function adoptText(text) {
    var pid = D.D.activeProject;
    if (!pid) { promptNewProject(); return; }
    if (!ui.chapterId || !D.getChapter(ui.chapterId)) {
      var chs = allChapters(pid);
      if (!chs.length) { toast('先建一章再采纳'); return; }
      ui.chapterId = chs[0].id;
    }
    var c = D.getChapter(ui.chapterId);
    var add = String(text || '').trim();
    if (!add) return;

    confirmBox('把这段追加到「' + c.title + '」的正文末尾？', function () {
      D.saveChapterContent(c.id, (c.content ? c.content + '\n\n' : '') + add, 'AI 采纳前');
      renderTree(); renderEditor(); renderGoalChip();
      toast('已采纳到「' + c.title + '」');
    });
  }

  /* ---------- 对话快照（防止「重生成」把旧内容吃掉） ---------- */
  function snapConv(label) {
    var conv = curConv();
    if (!conv || !conv.msgs) return;
    conv.history = conv.history || [];
    conv.history.push({
      ts: Date.now(),
      label: label || '快照',
      msgs: JSON.parse(JSON.stringify(conv.msgs))
    });
    if (conv.history.length > 8) conv.history.shift();
    try { window.__ENDF__ && window.__ENDF__.save && window.__ENDF__.save(); } catch (e) {}
  }

  function openConvHistory() {
    var conv = curConv();
    if (!conv) { toast('先打开一个对话'); return; }
    var list = conv.history || [];
    var html = '<div>';
    html += '<div class="tws-snap"><div class="tws-snap-t">当前对话</div>' +
      '<div class="tws-snap-m">' + (conv.msgs || []).length + ' 条</div></div>';
    if (!list.length) {
      html += '<p class="tws-p" style="margin-top:12px">还没有快照。点「重生成」或「编辑」之前会自动存一份。</p>';
    }
    list.slice().reverse().forEach(function (h) {
      var real = list.indexOf(h);
      html += '<div class="tws-snap" data-snap="' + real + '">' +
        '<div class="tws-snap-t">' + esc(h.label) + '</div>' +
        '<div class="tws-snap-m">' + h.msgs.length + ' 条 · ' + D.timeAgo(h.ts) + '</div>' +
        '</div>';
    });
    html += '</div>';
    var m = modal('对话历史', html, { footer: false });
    m.el.addEventListener('click', function (e) {
      var el = e.target.closest('[data-snap]');
      if (!el) return;
      var h = list[+el.getAttribute('data-snap')];
      if (!h) return;
      confirmBox('恢复到「' + h.label + '」（' + h.msgs.length + ' 条）？当前对话会先存一份快照。', function () {
        snapConv('恢复前');
        conv.msgs = JSON.parse(JSON.stringify(h.msgs));
        try {
          window.__ENDF__.save();
          window.__ENDF__.renderChat();
          window.__ENDF__.renderDrawer && window.__ENDF__.renderDrawer();
        } catch (err) {}
        m.close();
        toast('已恢复');
      });
    });
  }

  function injectAdoptButtons() {
    var chat = document.getElementById('chat');
    if (!chat) return;
    chat.querySelectorAll('.msg.ai').forEach(function (el) {
      var act = el.querySelector('.msg-act');
      if (!act) return;
      var i = el.getAttribute('data-i');

      if (!act.querySelector('.tws-adopt')) {
        var btn = document.createElement('button');
        btn.className = 'tws-adopt';
        btn.textContent = '采纳到本章';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var conv = curConv();
          var m = conv && conv.msgs && conv.msgs[+i];
          adoptText(m ? m.c : (el.querySelector('.ans') || {}).textContent);
        });
        act.insertBefore(btn, act.firstChild);
      }

      if (!act.querySelector('.tws-hist')) {
        var hb = document.createElement('button');
        hb.className = 'tws-hist';
        hb.textContent = '历史版本';
        hb.addEventListener('click', function (e) {
          e.stopPropagation();
          openConvHistory();
        });
        var adoptEl = act.querySelector('.tws-adopt');
        act.insertBefore(hb, adoptEl ? adoptEl.nextSibling : act.firstChild);
      }
    });
  }


  /* ============================================================
     AI 写入书稿：状态摘要 + 确认卡 + 执行
     ============================================================ */
  /* 给提示词用的当前书稿状态 */
  function bookState() {
    var pid = D.D.activeProject;
    var p = pid && D.getProject(pid);
    if (!p) return '当前还没有作品。';
    var vols = D.listVolumes(pid);
    var chs = allChapters(pid);
    var lines = ['当前作品：《' + p.name + '》' + (p.genre ? '（' + p.genre + '）' : '') +
      ' · ' + vols.length + ' 卷 · ' + chs.length + ' 章 · ' + D.fmtNum(D.projectWords(pid)) + ' 字'];
    if (chs.length) {
      lines.push('章节：' + chs.slice(-6).map(function (c) {
        return c.title + '（' + T.exporters.statusName(c.status) + ' ' + (c.words || 0) + '字）';
      }).join('、') + (chs.length > 6 ? ' …' : ''));
    }
    var lore = D.listCards(pid).length;
    var th = D.listThreads(pid).length;
    lines.push('设定库 ' + lore + ' 条 · 伏笔 ' + th + ' 条');
    return lines.join('\n');
  }

  /* 执行一批指令 */
  function runOps(ops) {
    var pid = D.D.activeProject;
    var done = [], opened = { book: false, lore: false, threads: false };

    ops.forEach(function (op) {
      if (!op || !op.op) return;
      try {
        if (op.op === 'create_novel') {
          var np = D.addProject(op.name || '未命名作品', op.genre || '');
          D.addVolume(np.id, '第一卷');
          pid = np.id;
          done.push('《' + np.name + '》已建好');
          opened.book = true;

        } else if (op.op === 'add_chapter') {
          if (!pid) return;
          var vols = D.listVolumes(pid);
          if (!vols.length) vols = [D.addVolume(pid, '第一卷')];
          D.addChapter(vols[vols.length - 1].id, op.title || '新章节');
          done.push('章节「' + (op.title || '') + '」');
          opened.book = true;

        } else if (op.op === 'add_lore') {
          if (!pid) return;
          var kind = ['character', 'place', 'term', 'relation'].indexOf(op.kind) >= 0 ? op.kind : 'character';
          var c = D.addCard(pid, kind, op.name || '未命名', op.body || '', {}, op.aliases || []);
          D.updateCard(c.id, { on: 1 });   /* 默认带上，下次续写自动注入 */
          done.push('设定「' + (op.name || '') + '」');
          opened.lore = true;

        } else if (op.op === 'add_thread') {
          if (!pid) return;
          var chId = '';
          if (op.plantChapter) {
            var hit = allChapters(pid).filter(function (c) { return c.title === op.plantChapter; })[0];
            if (hit) chId = hit.id;
          }
          D.addThread(pid, op.name || '未命名', op.note || '', chId);
          done.push('伏笔「' + (op.name || '') + '」');
          opened.threads = true;

        } else if (op.op === 'add_event') {
          if (!pid) return;
          var ecid = ui.chapterId || '';
          if (op.chapter) {
            var hit2 = allChapters(pid).filter(function (c) { return c.title === op.chapter; })[0];
            if (hit2) ecid = hit2.id;
          }
          D.addEvent(pid, ecid, op.when || '', op.who || '', op.what || '');
          done.push('时间线「' + (op.when || op.what || '') + '」');
          opened.threads = true;
        }
      } catch (e) { console.warn('[TWS] 指令执行失败', op, e); }
    });

    /* 兜底：新建了书但一条章节指令都没有，补一个空章节，免得用户进去是死路 */
    if (pid && !allChapters(pid).length) {
      var v0 = D.listVolumes(pid)[0] || D.addVolume(pid, '第一卷');
      D.addChapter(v0.id, '第一章');
    }

    renderTree(); renderLore(); renderThreads(); renderGoalChip();
    return { done: done, opened: opened };
  }

  /* 把某条消息里的指令块藏起来，换成确认卡 */
  function scanOps() {
    var chat = document.getElementById('chat');
    if (!chat) return;
    chat.querySelectorAll('.msg.ai').forEach(function (el) {
      if (el.querySelector('.tws-opcard')) return;
      var ans = el.querySelector('.ans');
      if (!ans) return;
      var pre = null;
      ans.querySelectorAll('pre').forEach(function (x) {
        if (!pre && /^\s*tws\s*\n?\s*\{/.test(x.textContent)) pre = x;
      });
      if (!pre) return;

      var parsed = T.ops.parse('```tws' + pre.textContent.replace(/^\s*tws/, '') + '```');
      if (!parsed.ops.length) return;

      pre.style.display = 'none';   /* 原始 JSON 不给用户看 */

      var card = document.createElement('div');
      card.className = 'tws-opcard';
      card.innerHTML =
        '<div class="tws-opcard-h"><span class="sq"></span>AI 想把这段整理进书稿</div>' +
        '<div class="tws-opcard-b">' +
          parsed.ops.map(function (op) {
            return '<div class="tws-opline"><i>' + esc(T.ops.LABEL[op.op] || op.op) + '</i>' +
              esc(T.ops.describe(op).replace(/^(建立新书|新增章节|写入设定库|写入伏笔)/, '')) + '</div>';
          }).join('') +
        '</div>' +
        '<div class="tws-opcard-f">' +
          '<button class="tws-btn primary sm" data-op-ok>好，加进去</button>' +
          '<button class="tws-btn sm ghost" data-op-no>先不用</button>' +
        '</div>';

      card.querySelector('[data-op-ok]').addEventListener('click', function (e) {
        e.stopPropagation();
        var r = runOps(parsed.ops);
        card.innerHTML = '<div class="tws-opcard-h done"><span class="sq"></span>已写入：' + esc(r.done.join('、')) + '</div>' +
          '<div class="tws-opcard-b"><div class="tws-opline" style="border:0">' +
          (r.opened.book ? '书稿里能看到 · ' : '') +
          (r.opened.lore ? '设定库已同步（默认已勾选「带上」）· ' : '') +
          (r.opened.threads ? '伏笔已记录 · ' : '') +
          '要改就去对应页面改。</div></div>';
        toast('已加入书稿');
      });

      card.querySelector('[data-op-no]').addEventListener('click', function (e) {
        e.stopPropagation();
        card.remove();
      });

      ans.parentNode.insertBefore(card, ans.nextSibling);
    });
  }

  function watchChat() {
    var chat = document.getElementById('chat');
    if (!chat) return;
    injectAdoptButtons(); scanOps();
    var mo = new MutationObserver(function () { injectAdoptButtons(); scanOps(); });
    mo.observe(chat, { childList: true, subtree: true });
  }

  /* ============================================================
     导航入口
     ============================================================ */
  function railBtn(id, label, num, svgPath) {
    var b = document.createElement('button');
    b.className = 'rail-btn';
    b.id = id;
    b.title = label;
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' + svgPath + '</svg>' +
      '<span>' + label + '</span><small>' + num + '</small>';
    return b;   /* 点击由调用方绑定，避免重复触发 */
  }

  function addNav() {
    var rail = document.querySelector('.rail');
    if (!rail || document.getElementById('railBook')) return;

    var defs = [
      ['railBook', '书稿', '03', '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 0 4 23z"/><path d="M8 7h7M8 11h7"/>', 'v-book'],
      ['railLore', '设定库', '04', '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>', 'v-lore'],
      ['railThreads', '伏笔', '05', '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8.2V18h9.8"/>', 'v-threads']
    ];

    var cfg = rail.querySelector('.rail-btn[data-go="v-cfg"]');
    defs.forEach(function (d) {
      var b = railBtn(d[0], d[1], d[2], d[3]);
      b.dataset.go = d[4];
      b.onclick = function () { window.showView(d[4]); };
      if (cfg && cfg.parentNode === rail) rail.insertBefore(b, cfg);
      else rail.appendChild(b);
    });

    // 协作室入口：保留但提示未上线
    var soon = railBtn('railSoon', '协作室', '06',
      '<path d="M21 11.5a8 8 0 0 1-8 8H7l-4 3v-11a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/>');
    soon.onclick = function () { toast('此功能暂未上线敬请期待'); };
    soon.dataset.go = '__soon';
    if (cfg && cfg.parentNode === rail) rail.insertBefore(soon, cfg);
    else rail.appendChild(soon);
  }

  /* 移动端：功能菜单里的入口由 mobile.html 处理，这里只补 toast 用的全局函数 */
  window.TWS_soon = function () { toast('此功能暂未上线敬请期待'); };
  T.lorePrompt = function () { return D.lorePrompt(); };
  T.snapConv = snapConv;
  T.bookState = bookState;
  T.runOps = runOps;

  /* ============================================================
     挂载
     ============================================================ */
  function mount() {
    if (ui.mounted) return;
    var stage = document.querySelector('.stage');
    if (!stage) return;

    D.load();

    // 插入三个视图（放在 stage 末尾）
    stage.insertAdjacentHTML('beforeend', BOOK_HTML + LORE_HTML + THREADS_HTML);
    ui.mounted = true;

    // 默认选中第一章
    var pid = D.D.activeProject;
    if (pid) {
      var chs = allChapters(pid);
      ui.chapterId = D.D.activeChapter && D.getChapter(D.D.activeChapter) ? D.D.activeChapter : (chs[0] && chs[0].id);
    }

    // 顶部按钮
    $('twsBtnNewCh').addEventListener('click', function () {
      var pid2 = D.D.activeProject;
      if (!pid2) { promptNewProject(); return; }
      var vols = D.listVolumes(pid2);
      promptNewChapter(vols[0] && vols[0].id);
    });
    $('twsBtnExport').addEventListener('click', function () {
      // 长按/右键走 txt，点击走 docx 面板
      openExport();
    });
    $('twsBtnExport').addEventListener('contextmenu', function (e) { e.preventDefault(); exportTxt(); });
    $('twsGoalChip').addEventListener('click', openStats);

    $('twsBtnNewCard').addEventListener('click', function () { promptCard(null); });
    $('twsBtnExtract').addEventListener('click', openExtract);
    $('twsBtnNewThread').addEventListener('click', function () {
      if (ui.tab === 'thread') promptThread(); else promptEvent();
    });

    // Tab 与卡片点击（委托）
    document.getElementById('twsLoreTabs').addEventListener('click', function (e) {
      var c = e.target.closest('[data-kind]');
      if (!c) return;
      ui.kind = c.getAttribute('data-kind');
      renderLore();
    });
    document.getElementById('twsThreadTabs').addEventListener('click', function (e) {
      var c = e.target.closest('[data-tab]');
      if (!c) return;
      ui.tab = c.getAttribute('data-tab');
      renderThreads();
    });
    document.getElementById('twsCards').addEventListener('click', function (e) {
      var sw = e.target.closest('[data-on]');
      if (sw) {
        e.stopPropagation();
        var v = D.toggleCard(sw.getAttribute('data-on'));
        sw.classList.toggle('on', !!v);
        var cd = sw.closest('.tws-card'); if (cd) cd.classList.toggle('on', !!v);
        updateLoreHint();
        toast(v ? '已带上，会写进提示词' : '已取消带上');
        return;
      }
      var card = e.target.closest('[data-card]');
      if (card) {
        var c = D.D.cards.filter(function (x) { return x.id === card.getAttribute('data-card'); })[0];
        if (c) promptCard(c);
        return;
      }
      if (e.target.closest('[data-newcard]')) promptCard(null);
    });
    document.getElementById('twsThreadList').addEventListener('click', function (e) {
      var t = e.target.closest('[data-thread]');
      if (!t) return;
      var th = D.D.threads.filter(function (x) { return x.id === t.getAttribute('data-thread'); })[0];
      if (!th) return;
      var chs = allChapters(D.D.activeProject);
      modal('伏笔 · ' + th.name,
        (th.note ? '<p class="tws-p">' + esc(th.note) + '</p>' : '') +
        '<label class="tws-l">埋在哪一章</label><select class="tws-i" id="tPlant">' +
          '<option value="">（未指定）</option>' +
          chs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === th.plantChapter ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('') +
        '</select>' +
        '<label class="tws-l">在哪一章回收</label><select class="tws-i" id="tPayoff">' +
          '<option value="">（未回收）</option>' +
          chs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === th.payoffChapter ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('') +
        '</select>' +
        '<label class="tws-chk"><input type="checkbox" id="tDropped"' + (th.status === 'dropped' ? ' checked' : '') + '> 标记为已废弃</label>',
        {
          okText: '保存',
          onOk: function (w) {
            var pay = w.querySelector('#tPayoff').value;
            D.updateThread(th.id, {
              plantChapter: w.querySelector('#tPlant').value,
              payoffChapter: pay,
              status: w.querySelector('#tDropped').checked ? 'dropped' : (pay ? 'done' : 'open')
            });
            renderThreads(); toast('已保存');
          }
        });
      var del = document.createElement('button');
      del.className = 'tws-btn ghost';
      del.textContent = '删除这条';
      del.style.marginTop = '12px';
      del.addEventListener('click', function () {
        D.removeThread(th.id); renderThreads(); toast('已删除');
        document.querySelectorAll('.tws-modal-wrap').forEach(function (w) { w.remove(); });
      });
      document.querySelector('.tws-modal-b').appendChild(del);
    });

    // 模板入口：挂在输入框上方（对话视图）
    addTemplateEntry();
    mountTempPicker();
    addChapterChip();
    watchChat();
    addNav();

    // 首次渲染
    renderTree(); renderLore(); renderThreads(); renderGoalChip();

    // 切到新视图时重渲染（数据可能已变）
    var origShow = window.showView;
    window.showView = function (id) {
      origShow(id);
      if (id === 'v-book') { renderTree(); renderGoalChip(); }
      if (id === 'v-lore') renderLore();
      if (id === 'v-threads') renderThreads();
    };
  }


  /* ---------- 对话视图头部的章节切换器 ---------- */
  function updateChapterChip() {
    var el = document.getElementById('twsChapterChip');
    if (!el) return;
    var c = ui.chapterId && D.getChapter(ui.chapterId);
    el.textContent = c ? c.title : '未选择章节';
    el.classList.toggle('on', !!c);
  }

  function openChapterPicker() {
    var pid = D.D.activeProject;
    if (!pid) { toast('先建一部作品'); return; }
    var chs = allChapters(pid);
    if (!chs.length) { toast('还没有章节'); return; }
    var html = '<div>';
    chs.forEach(function (c) {
      html += '<div class="tws-snap' + (c.id === ui.chapterId ? ' on' : '') + '" data-pick="' + c.id + '">' +
        '<div class="tws-snap-t">' + esc(c.title) + '</div>' +
        '<div class="tws-snap-m">' + T.exporters.statusName(c.status) + ' · ' + (c.words || 0) + ' 字</div>' +
        '</div>';
    });
    html += '</div>';
    var m = modal('切换到哪一章', html, { footer: false });
    m.el.addEventListener('click', function (e) {
      var el = e.target.closest('[data-pick]');
      if (!el) return;
      var id = el.getAttribute('data-pick');
      openChapter(id);
      updateChapterChip();
      m.close();
      var c = D.getChapter(id);
      toast('已切到「' + (c ? c.title : '') + '」');
    });
  }

  function addChapterChip() {
    var right = document.querySelector('#v-chat .sec-right');
    if (!right || document.getElementById('twsChapterChip')) return;
    var chip = document.createElement('span');
    chip.className = 'chip tws-ch-chip';
    chip.id = 'twsChapterChip';
    chip.title = '当前章节 · 点击切换';
    chip.addEventListener('click', openChapterPicker);
    right.insertBefore(chip, right.firstChild);
    updateChapterChip();
  }


  /* ============================================================
     温度选择器（输入区右下角，GPT 式弹层）
     ============================================================ */
  var TEMP_LEVELS = [
    { max: 0.3, name: '严谨', emoji: '\uD83D\uDE10', desc: '用词保守，紧扣设定与前文，几乎不自由发挥。适合润色、改错、定稿前收口。' },
    { max: 0.7, name: '稳妥', emoji: '\uD83D\uDE42', desc: '在合理范围内变化，优先保证情节连贯。日常续写最安全的选择。' },
    { max: 1.1, name: '均衡', emoji: '\uD83D\uDE0C', desc: '措辞与思路都有一定新鲜感，多数场景的默认值。' },
    { max: 1.5, name: '放飞', emoji: '\uD83D\uDE0F', desc: '用词跳跃，容易冒出意外的好句子，但也更容易跑偏。' },
    { max: 2.0, name: '狂野', emoji: '\uD83D\uDE0E', desc: '高度随机，适合头脑风暴找灵感，不建议直接定稿。' }
  ];

  function tempLevel(v) {
    for (var i = 0; i < TEMP_LEVELS.length; i++) if (v <= TEMP_LEVELS[i].max) return i;
    return TEMP_LEVELS.length - 1;
  }
  function curTemp() {
    var S = window.__ENDF__ && window.__ENDF__.S;
    var v = S && typeof S.temperature === 'number' ? S.temperature : 0.8;
    return Math.max(0, Math.min(2, v));
  }
  function applyTemp(v) {
    v = Math.round(v * 10) / 10;
    try {
      var api = window.__ENDF__;
      api.S.temperature = v;
      api.save && api.save();
    } catch (e) {}
    var tr = document.getElementById('tempRange'), tv = document.getElementById('tempVal');
    if (tr) tr.value = String(v);
    if (tv) tv.textContent = v.toFixed(1);
  }

  /* 胶囊里的流动粒子 */
  function particles() {
    var out = '';
    for (var i = 0; i < 14; i++) {
      var top = 18 + Math.random() * 64;          /* 18%~82% 高度 */
      var dur = 3.4 + Math.random() * 3.2;
      var delay = -Math.random() * 6;
      var size = Math.random() < .28 ? 2.5 : 1.6;
      var left = Math.random() * 100;
      out += '<i style="top:' + top.toFixed(1) + '%;left:' + left.toFixed(1) + '%;' +
        'animation-duration:' + dur.toFixed(2) + 's;' +
        'animation-delay:' + delay.toFixed(2) + 's;' +
        'width:' + size + 'px;height:' + size + 'px"></i>';
    }
    return out;
  }

  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;          /* 强制回流，让动画能重放 */
    el.classList.add(cls);
  }

  function mountTempPicker() {
    var wrap = document.querySelector('.input-wrap');
    if (!wrap || document.getElementById('twsTempBtn')) return;
    var send = wrap.querySelector('.send');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'twsTempBtn';
    btn.className = 'tws-temp-btn';
    btn.title = '温度 · 决定 AI 写得多保守或多放飞';
    if (send) wrap.insertBefore(btn, send); else wrap.appendChild(btn);

    function paintBtn() {
      var v = curTemp();
      var t = v.toFixed(1);
      if (btn.dataset.v && btn.dataset.v !== t) replay(btn, 'bump');
      btn.dataset.v = t;
      var nm = TEMP_LEVELS[tempLevel(v)].name;
      btn.innerHTML = '<span class="tw">T</span>' + nm + '<i>' + t + '</i>';
    }
    paintBtn();

    var pop = null;
    function closePop() {
      if (!pop) return;
      pop._detach && pop._detach();
      pop.remove();
      pop = null;
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop) { closePop(); return; }

      pop = document.createElement('div');
      pop.className = 'tws-temp-pop';
      pop.innerHTML =
        '<div class="tws-temp-h"><span class="ic" id="tpIcon">' + TEMP_LEVELS[tempLevel(curTemp())].emoji + '</span>' +
        '<b id="tpName">均衡</b><em id="tpVal">0.8</em></div>' +
        '<div class="tws-pill">' +
          '<div class="tws-pill-fill" id="tpFill">' + particles() + '</div>' +
          '<input type="range" id="tpRange" min="0" max="2" step="0.1" value="' + curTemp() + '">' +
        '</div>' +
        '<div class="tws-temp-ticks">' +
          TEMP_LEVELS.map(function (l, i) {
            return '<span data-lv="' + i + '">' + l.name + '</span>';
          }).join('') +
        '</div>' +
        '<div class="tws-temp-d" id="tpDesc"></div>' +
        '<div class="tws-temp-f"><button type="button" id="tpReset">恢复默认 0.8</button></div>';
      document.body.appendChild(pop);

      function place() {
        if (!pop) return;
        var r = btn.getBoundingClientRect();
        var w = Math.min(300, window.innerWidth - 24);
        pop.style.width = w + 'px';
        pop.style.left = Math.max(12, Math.min(r.left - w + 44, window.innerWidth - w - 12)) + 'px';
        pop.style.bottom = (window.innerHeight - r.top + 10) + 'px';
      }
      place();
      /* 页面滚动/尺寸变化时跟着按钮走，避免弹层"悬空"看起来在跳 */
      var rafId = 0;
      function onMove() {
        if (rafId) return;
        rafId = requestAnimationFrame(function () { rafId = 0; place(); });
      }
      window.addEventListener('scroll', onMove, true);
      window.addEventListener('resize', onMove);
      pop._detach = function () {
        window.removeEventListener('scroll', onMove, true);
        window.removeEventListener('resize', onMove);
      };

      var range = pop.querySelector('#tpRange');
      var pill = pop.querySelector('.tws-pill');
      var fill = pop.querySelector('#tpFill');
      var nameEl = pop.querySelector('#tpName');
      var valEl = pop.querySelector('#tpVal');
      var descEl = pop.querySelector('#tpDesc');

      var lastLv = -1, lastVs = '';
      /* 填充色随温度变化：冷 → 温 → 热（必须声明在 paint 顶部，下面会先用） */
      var GRAD = [
        'linear-gradient(90deg, #4ea3b8, #6fc7a8)',   /* 严谨：冷青 */
        'linear-gradient(90deg, #6fc7a8, #9fd456)',   /* 稳妥：青绿 */
        'linear-gradient(90deg, #9fd456, #d9e84f)',   /* 均衡：黄绿 */
        'linear-gradient(90deg, #d9e84f, #f0a63c)',   /* 放飞：橙 */
        'linear-gradient(90deg, #f0a63c, #e0568a)'    /* 狂野：品红 */
      ];
      function paint() {
        var v = Number(range.value);
        var lv = tempLevel(v);
        var vs = v.toFixed(1);

        /* 数值：变了才写 */
        if (vs !== lastVs) { valEl.textContent = vs; lastVs = vs; }

        /* 档位相关：变了才写 + 才重放动画（快速拖动时能少掉大量重排/重绘） */
        if (lv !== lastLv) {
          nameEl.textContent = TEMP_LEVELS[lv].name;
          descEl.textContent = TEMP_LEVELS[lv].desc;
          var iconEl = pop.querySelector('#tpIcon');
          if (iconEl) { iconEl.textContent = TEMP_LEVELS[lv].emoji; replay(iconEl, 'pop'); }
          fill.style.backgroundImage = GRAD[lv];
          pill.classList.toggle('hot', lv >= 3);
          pop.querySelectorAll('[data-lv]').forEach(function (s2, i) {
            s2.classList.toggle('on', i === lv);
          });
          if (lastLv !== -1) {
            replay(nameEl, 'swap');
            replay(descEl, 'swap');
          }
          lastLv = lv;
        }
        var pct = v / 2 * 100;
        /* 填充宽度每帧都要变，这是唯一的高频写 */
        fill.style.width = Math.max(6, pct) + '%';
      }
      paint();

      range.addEventListener('input', function () {
        paint();
        applyTemp(Number(range.value));
        paintBtn();
      });
      pop.querySelector('#tpReset').addEventListener('click', function () {
        range.value = '0.8'; paint(); applyTemp(0.8); paintBtn();
      });
      pop.addEventListener('click', function (e2) { e2.stopPropagation(); });
    });

    document.addEventListener('click', closePop);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });

    /* 配置页改动时同步 */
    var tr = document.getElementById('tempRange');
    if (tr) tr.addEventListener('change', function () { paintBtn(); });
    T.refreshTempBtn = paintBtn;
  }

  function addTemplateEntry() {
    var ctx = document.getElementById('ctx') || document.querySelector('.composer-meta') || document.querySelector('.composer');
    if (!ctx || document.getElementById('twsBtnTpl')) return;
    var btn = document.createElement('button');
    btn.id = 'twsBtnTpl';
    btn.className = 'tws-tpl-btn';
    btn.type = 'button';
    btn.textContent = '模板';
    btn.title = '用模板开写';
    btn.addEventListener('click', openTemplate);
    ctx.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
