/* ==========================================================================
   To写作工作台 · 手机版外壳（mobile.js）
   功能模块与电脑版完全共用，这里只做手机专属的事：
   1. 底部标签栏：对话 / 定义 / 书稿 / 伏笔 / 更多
   2. 「更多」底部面板：把电脑版左栏 + 右侧页边收进来
   3. 书稿目录/正文两屏、键盘、安全区等手机细节
   ========================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;
  if (root.dataset.device !== 'phone') return;
  var $ = function (id) { return document.getElementById(id); };

  var ICON = {
    chat: '<path d="M4 20.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H8z"/><path d="M8.5 9h7M8.5 12.5h4.5"/>',
    def: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><path d="m17.5 4.5.8 1.8 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3z"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6"/>',
    threads: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8.2V14a4 4 0 0 0 4 4h5.8"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 5l-7 7 7 7"/>'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; }

  var TABS = [
    { id: 'v-chat', label: '对话', icon: 'chat' },
    { id: 'v-def', label: '定义', icon: 'def' },
    { id: 'v-book', label: '书稿', icon: 'book' },
    { id: 'v-threads', label: '伏笔', icon: 'threads' },
    { id: '__more', label: '更多', icon: 'more' }
  ];

  var bar, sheet, scrim, built = false;

  function go(id) {
    closeSheet();
    if (window.showView) window.showView(id);
    syncActive();
  }

  /* ---------- 底部标签栏 ---------- */
  function buildBar() {
    bar = document.createElement('nav');
    bar.className = 'm-tabbar';
    bar.setAttribute('aria-label', '主导航');
    bar.innerHTML = TABS.map(function (t) {
      return '<button type="button" data-tab="' + t.id + '">' + svg(t.icon) + '<span>' + t.label + '</span></button>';
    }).join('');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]'); if (!b) return;
      var id = b.dataset.tab;
      if (id === '__more') { sheet.classList.contains('open') ? closeSheet() : openSheet(); return; }
      go(id);
    });
    document.body.appendChild(bar);
  }

  function currentView() {
    var v = document.querySelector('.stage > .view.active');
    return v ? v.id : 'v-chat';
  }
  function syncActive() {
    if (!bar) return;
    var cur = currentView();
    var inTabs = TABS.some(function (t) { return t.id === cur; });
    var open = sheet && sheet.classList.contains('open');
    bar.querySelectorAll('button').forEach(function (b) {
      var on = open ? b.dataset.tab === '__more' : (b.dataset.tab === cur || (!inTabs && b.dataset.tab === '__more'));
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    root.dataset.mView = cur;
    if (window.__mMeasure) window.__mMeasure();
  }

  /* ---------- 「更多」面板：收纳左栏与页边 ---------- */
  function buildSheet() {
    scrim = document.createElement('div');
    scrim.className = 'm-scrim';
    scrim.addEventListener('click', closeSheet);

    sheet = document.createElement('section');
    sheet.className = 'm-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '更多');
    sheet.innerHTML = '<div class="m-grab" aria-hidden="true"><i></i></div><div class="m-sheet-body"></div>';
    var body = sheet.querySelector('.m-sheet-body');

    var rail = document.querySelector('.rail');
    if (rail) body.appendChild(rail);
    var margin = $('stMargin');
    if (margin) {
      var h = document.createElement('div');
      h.className = 'm-sec-title';
      h.innerHTML = '今日 <span class="lat">Hodie</span>';
      body.appendChild(h);
      body.appendChild(margin);
    }
    /* 版本落款挪到最底 */
    var col = rail && rail.querySelector('.st-colophon');
    if (col) {
      var ver = col.querySelector('.ver');
      if (ver && !/手机版/.test(ver.textContent)) ver.textContent += ' · 手机版';
      body.appendChild(col);
    }

    /* 面板里任何导航按钮点完都收起 */
    body.addEventListener('click', function (e) {
      var b = e.target.closest('.rail-btn, [data-go], #studioNew, #stBook, #stModel');
      if (!b || b.id === 'railSoon') return;
      setTimeout(closeSheet, 60);
      setTimeout(syncActive, 120);
    });

    dragToClose(sheet, body);
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
  }

  function openSheet() {
    root.classList.add('m-sheet-open');
    sheet.classList.add('open');
    sheet.querySelector('.m-sheet-body').scrollTop = 0;
    syncActive();
  }
  function closeSheet() {
    if (!sheet || !sheet.classList.contains('open')) return;
    sheet.classList.remove('open');
    sheet.style.transform = '';
    root.classList.remove('m-sheet-open');
    syncActive();
  }

  /* 下拉关闭面板（只在内容滚到顶时生效） */
  function dragToClose(el, body) {
    var y0 = 0, dy = 0, drag = false;
    el.addEventListener('touchstart', function (e) {
      if (body.scrollTop > 0 && !e.target.closest('.m-grab')) return;
      drag = true; dy = 0; y0 = e.touches[0].clientY;
      el.style.transition = 'none';
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!drag) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0) el.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    el.addEventListener('touchend', function () {
      if (!drag) return; drag = false;
      el.style.transition = '';
      if (dy > 110) closeSheet(); else el.style.transform = '';
    });
  }

  /* ---------- 对话页顶栏：新建对话快捷键 + 换行占位 ---------- */
  function headExtras() {
    var head = $('stHead'), fresh = $('studioNew');
    if (!head || $('mNewChat')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'mNewChat'; b.className = 'icon-btn m-new';
    b.title = '新建对话'; b.setAttribute('aria-label', '新建对话');
    b.innerHTML = svg('plus');
    b.addEventListener('click', function () { if (fresh) fresh.click(); });
    var br = document.createElement('span'); br.className = 'm-break'; head.appendChild(br);
    var drawer = $('btnDrawer');
    head.insertBefore(b, head.querySelector('.sp') || null);
    if (drawer) head.insertBefore(drawer, b);
  }

  /* ---------- 尺寸联动：顶栏高度 → 视图起点；输入框高度 → 回到底部按钮 ---------- */
  function measure() {
    var head = $('stHead'), comp = document.querySelector('#v-chat .composer'), stage = $('stage');
    function upd() {
      if (head) {
        /* 非对话页隐藏顶栏，视图从安全区下沿开始 */
        var h = head.offsetParent ? head.offsetTop + head.offsetHeight : parseFloat(getComputedStyle(stage).paddingTop) || 0;
        root.style.setProperty('--st-head', h + 'px');
      }
      if (comp) root.style.setProperty('--m-comp', comp.offsetHeight + 'px');
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(upd);
      if (head) ro.observe(head);
      if (comp) ro.observe(comp);
    }
    window.addEventListener('resize', upd);
    window.__mMeasure = function () { requestAnimationFrame(upd); };
    upd();
  }

  /* ---------- 手机键盘：回车换行，发送交给发送键（写小说要分段） ---------- */
  function enterKey() {
    var ta = $('input'); if (!ta) return;
    ta.setAttribute('enterkeyhint', 'enter');
    document.addEventListener('keydown', function (e) {
      if (e.target !== ta || e.key !== 'Enter' || e.isComposing) return;
      if (e.ctrlKey || e.metaKey) {             /* 外接键盘 Ctrl/⌘+回车 仍可发送 */
        e.preventDefault(); e.stopPropagation();
        var s = $('sendBtn'); if (s) s.click();
        return;
      }
      e.stopPropagation();                      /* 不让电脑版的「回车即发送」接到 */
    }, true);
    ta.dispatchEvent(new Event('input'));       /* 按手机宽度重新算一次高度 */
  }

  /* ---------- 书稿：目录 / 正文 两步走 ---------- */
  function setBook(mode) {
    root.dataset.mBook = mode;
    var ed = $('twsEditor'); if (mode === 'edit' && ed) ed.scrollTop = 0;
  }
  function bookFlow() {
    var book = document.querySelector('#v-book .tws-book'), tree = $('twsTree');
    if (!book || !tree) return;
    var back = document.createElement('button');
    back.type = 'button'; back.className = 'm-book-back';
    back.innerHTML = svg('back') + '<span>目录</span>';
    back.addEventListener('click', function () { setBook('tree'); });
    book.insertBefore(back, book.firstChild);
    tree.addEventListener('click', function (e) {
      if (e.target.closest('.tws-ch') && !e.target.closest('button')) setTimeout(function () { setBook('edit'); }, 30);
    });
    /* 已在书稿页时再点「书稿」标签，回到目录 */
    bar.querySelector('[data-tab="v-book"]').addEventListener('click', function () {
      if (currentView() === 'v-book') setBook('tree');
    }, true);
    setBook('tree');
  }

  /* ---------- 键盘：高度由电脑版的视口逻辑算好（--kb / .kb-open），这里只管
     「正在输入」时收起标签栏；不要再自己改页面高度，否则会和电脑版叠加，
     输入框被推出屏幕（iOS Safari 上的老问题） ---------- */
  function keyboard() {
    var EDIT = 'textarea, input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"]';
    document.addEventListener('focusin', function (e) {
      if (e.target.matches(EDIT)) root.classList.add('m-typing');
    });
    document.addEventListener('focusout', function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!a || !a.matches(EDIT)) root.classList.remove('m-typing');
      }, 80);
    });
  }

  /* ---------- 返回：先关面板 ---------- */
  function backGesture() {
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  }

  function watchViews() {
    var stage = $('stage'); if (!stage) return;
    new MutationObserver(syncActive).observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    if (built) return true;
    /* 等电脑版模块把左栏、页边、对话顶栏都搭好 */
    if (!document.querySelector('.rail .st-opus') || !$('stHead') || !$('stMargin') || !$('railDef')) return false;
    built = true;
    root.classList.add('m-ready');
    buildSheet();
    buildBar();
    headExtras();
    measure();
    enterKey();
    bookFlow();
    keyboard();
    backGesture();
    watchViews();
    syncActive();
    return true;
  }

  var tries = 0;
  (function wait() {
    if (init()) return;
    if (++tries < 200) setTimeout(wait, 50);
  })();
})();
