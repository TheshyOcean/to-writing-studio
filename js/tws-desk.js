/* To Writing Studio · 旁批与参考页
 * 旁批随 chapter.annotations 保存；固定参考随 project.deskReference 保存。
 * 不复制书稿、不发 AI 请求；引用失效或无法唯一定位时不会猜位置。
 */
(function (root) {
  'use strict';
  function makeAnchor(text, start, end) {
    text = String(text || ''); start = Math.max(0, Math.min(text.length, Number(start) || 0));
    end = Math.max(start, Math.min(text.length, Number(end) || 0));
    return { quote: text.slice(start, end), start: start, before: text.slice(Math.max(0, start - 40), start), after: text.slice(end, end + 40) };
  }
  function commonTail(a, b) { var n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; }
  function commonHead(a, b) { var n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; }
  function locateAnchor(text, anchor) {
    text = String(text || ''); anchor = anchor || {}; var quote = String(anchor.quote || '');
    if (!quote) return { status: 'chapter', start: 0, end: 0 };
    var positions = [], pos = text.indexOf(quote);
    while (pos >= 0) { positions.push(pos); pos = text.indexOf(quote, pos + 1); }
    if (!positions.length) return { status: 'missing' };
    if (positions.length === 1) return { status: 'found', start: positions[0], end: positions[0] + quote.length };
    var before = String(anchor.before || ''), after = String(anchor.after || '');
    if (!before && !after) return { status: 'ambiguous' };
    var ranked = positions.map(function (p) {
      return { p: p, left: commonTail(before, text.slice(Math.max(0, p - before.length), p)), right: commonHead(after, text.slice(p + quote.length, p + quote.length + after.length)) };
    }).map(function (p) { p.score = p.left + p.right; return p; }).sort(function (a, b) { return b.score - a.score; });
    var best = ranked[0], next = ranked[1];
    /* 重复原文必须有足够且唯一的周边文本。旧字符位置不能作为平局裁判。 */
    var minEvidence = Math.min(12, before.length + after.length);
    if (best.score < minEvidence || best.score === next.score || best.score - next.score < Math.min(4, minEvidence)) return { status: 'ambiguous' };
    return { status: 'found', start: best.p, end: best.p + quote.length };
  }
  var core = { makeAnchor: makeAnchor, locateAnchor: locateAnchor };
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (!root || !root.document) return;
  var T = root.TWS = root.TWS || {}, doc = root.document;
  var mode = 'overview', filter = 'todo', scope = 'book', drawer = null, panel = null, tabs = null;
  var lastHTML = '', refreshTimer = null, hooked = false, priorFocus = null;
  function D() { return T.data; }
  function U() { return T.ui; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(s) { if (U()) U().toast(s); }
  function pid() { return D() && D().D.activeProject; }
  function project() { return D() && D().getProject(pid()); }
  function current() { return T.currentChapter ? T.currentChapter() : D().D.activeChapter; }
  function chapters(id) { var out = []; if (!D()) return out; D().listVolumes(id || pid()).forEach(function (v) { out = out.concat(D().listChapters(v.id)); }); return out; }
  function ownChapter(id, projectId) { return chapters(projectId).filter(function (c) { return c.id === id; })[0] || null; }
  function annotations(c) { return (Array.isArray(c.annotations) ? c.annotations : []).filter(function (n) { return n && typeof n.id === 'string' && typeof n.text === 'string'; }); }
  function countTodo() { return chapters().reduce(function (s, c) { return s + annotations(c).filter(function (n) { return !n.done; }).length; }, 0); }
  function desktop() { var m = doc.getElementById('stMargin'); return !!(m && root.innerWidth > 1240 && root.getComputedStyle(m).display !== 'none' && doc.documentElement.dataset.device !== 'phone'); }
  function button(action, label, extra) { return '<button type="button" class="tws-btn sm ' + (extra || '') + '" data-desk="' + action + '">' + label + '</button>'; }
  function hint(s) { return '<p class="desk-hint">' + esc(s) + '</p>'; }
  function noteList() {
    var cs = chapters(), rows = [], shown = 0, total = 0;
    cs.forEach(function (c) {
      annotations(c).forEach(function (n) {
        total++;
        if ((scope === 'chapter' && c.id !== current()) || (filter === 'todo' && n.done) || (filter === 'done' && !n.done)) return;
        var loc = locateAnchor(c.content, n), orphan = loc.status === 'missing' || loc.status === 'ambiguous';
        rows.push('<article class="desk-note' + (n.done ? ' is-done' : '') + '" data-chapter="' + esc(c.id) + '" data-note="' + esc(n.id) + '">' +
          '<div class="desk-note-head"><span>' + esc(c.title) + '</span>' + (n.source ? '<em>' + esc(n.source) + '</em>' : '') + '</div>' +
          (n.quote ? '<button type="button" class="desk-quote" data-desk="jump"' + (orphan ? ' disabled' : '') + ' title="定位原文">' + esc(n.quote) + '</button>' : '') +
          (orphan ? '<span class="desk-anchor-state">' + (loc.status === 'ambiguous' ? '有多处相同原文，请手动核对' : '原文已改动，保留原来的引用') + '</span>' : '') +
          '<p class="desk-note-text">' + esc(n.text) + '</p>' +
          '<div class="desk-note-actions">' + button('done', n.done ? '重新打开' : '标记完成') + button('edit', '编辑', 'ghost') + button('delete', '删除', 'ghost') + '</div></article>'); shown++;
      });
    });
    return '<div class="desk-heading"><div><span class="desk-kicker">Marginalia</span><h3>旁批 · 待改</h3></div>' + button('add', '+ 记一条') + '</div>' +
      '<div class="desk-filters"><label>状态<select data-desk-filter aria-label="批注状态"><option value="todo"' + (filter === 'todo' ? ' selected' : '') + '>待处理</option><option value="done"' + (filter === 'done' ? ' selected' : '') + '>已完成</option><option value="all"' + (filter === 'all' ? ' selected' : '') + '>全部</option></select></label>' +
      '<label>范围<select data-desk-scope aria-label="批注范围"><option value="book"' + (scope === 'book' ? ' selected' : '') + '>整部作品</option><option value="chapter"' + (scope === 'chapter' ? ' selected' : '') + '>当前章</option></select></label></div>' +
      (shown ? '<div class="desk-notes">' + rows.join('') + '</div>' : hint(total ? '这个范围里没有符合条件的旁批。' : '想到哪里需要改，就先记在页边。选中正文里的句子，可以为它加一条旁批。'));
  }
  function readPlot() { try { return (JSON.parse(root.localStorage.getItem('tws_define_v1') || '{}') || {})[pid()] || {}; } catch (e) { return {}; } }
  function referenceOptions(ref) {
    var cards = D().listCards(pid()), cs = chapters();
    function option(value, name) { return '<option value="' + esc(value) + '"' + (ref && value === ref.kind + ':' + (ref.id || '') ? ' selected' : '') + '>' + esc(name) + '</option>'; }
    return '<option value="">选择要固定的内容…</option>' +
      (cards.length ? '<optgroup label="人物与设定">' + cards.map(function (c) { return option('card:' + c.id, c.name); }).join('') + '</optgroup>' : '') +
      (cs.length ? '<optgroup label="章节原文">' + cs.map(function (c) { return option('chapter:' + c.id, c.title); }).join('') + '</optgroup>' : '') +
      '<optgroup label="创作提纲">' + option('plot:', '本书情节提纲') + '</optgroup>';
  }
  function referenceBody(ref) {
    if (!ref) return hint('把人物设定、前文或情节提纲放在这里，切换章节时它会留在页边。');
    var title = '', body = '', subtitle = '', missing = false;
    if (ref.kind === 'chapter') {
      var c = ownChapter(ref.id); missing = !c;
      if (c) { title = c.title; body = String(c.content || ''); subtitle = '章节原文'; }
    } else if (ref.kind === 'card') {
      var card = D().listCards(pid()).filter(function (c) { return c.id === ref.id; })[0]; missing = !card;
      if (card) {
        title = card.name; subtitle = D().CARD_KINDS[card.kind] || '设定'; body = card.body || '';
        if (card.aliases && card.aliases.length) body += '\n\n别名：' + card.aliases.join('、');
        var attrs = card.attrs || {}; Object.keys(attrs).forEach(function (k) { if (attrs[k]) body += '\n' + k + '：' + String(attrs[k]); });
      }
    } else if (ref.kind === 'plot') {
      var plot = readPlot(); title = '情节提纲'; subtitle = project().name;
      body = (plot.idea ? '梗概\n' + plot.idea + '\n\n' : '') + (Array.isArray(plot.beats) ? plot.beats.map(function (b, i) { return (i + 1) + '. ' + String(b.k || '') + '\n' + String(b.t || ''); }).join('\n\n') : '');
    } else missing = true;
    if (missing) return hint('这份参考已被删除或不在当前作品里。请重新选择。');
    return '<article class="desk-ref-paper"><div class="desk-ref-meta">' + esc(subtitle) + '<span>只读参考</span></div><h4>' + esc(title) + '</h4>' +
      (body.trim() ? '<div class="desk-ref-text">' + esc(body) + '</div>' : hint('这里还没有内容。添加后会自动出现在参考页。')) + '</article>';
  }
  function reference() {
    var p = project(), ref = p.deskReference;
    return '<div class="desk-heading"><div><span class="desk-kicker">Ad marginem</span><h3>固定参考</h3></div>' + (ref ? button('unpin', '取消固定', 'ghost') : '') + '</div>' +
      '<div class="desk-ref-picker"><label class="desk-sr" for="deskReferencePicker">参考内容</label><select id="deskReferencePicker" data-desk-ref>' + referenceOptions(ref) + '</select>' + button('pin', '固定') + '</div>' + referenceBody(ref);
  }
  function bodyHTML() { return project() ? (mode === 'notes' ? noteList() : reference()) : hint('先创建或打开一部作品，再整理旁批和参考。'); }
  function render(force) {
    if (!D() || !U()) return;
    installMargin();
    if (tabs) {
      Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
        var sel = b.dataset.deskTab === mode; b.classList.toggle('on', sel); b.setAttribute('aria-selected', String(sel));
      });
      var count = tabs.querySelector('[data-desk-count]'); if (count) count.textContent = countTodo() || '';
    }
    var margin = doc.getElementById('stMargin');
    if (margin) margin.classList.toggle('desk-active', mode !== 'overview' && !drawer);
    if (mode === 'overview') { if (panel) panel.hidden = true; return; }
    var host = drawer ? drawer.querySelector('.desk-drawer-body') : panel;
    if (!host) return;
    host.hidden = false;
    var html = bodyHTML();
    if (force || html !== lastHTML) { host.innerHTML = html; lastHTML = html; }
  }
  function queueRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(function () { render(); }, 90); }
  function installMargin() {
    var m = doc.getElementById('stMargin'); if (!m || tabs) return;
    tabs = doc.createElement('div'); tabs.className = 'desk-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '页边内容');
    tabs.innerHTML = '<button type="button" role="tab" data-desk-tab="overview">页边</button><button type="button" role="tab" data-desk-tab="notes">旁批 <span data-desk-count></span></button><button type="button" role="tab" data-desk-tab="reference">参考</button>';
    m.insertBefore(tabs, m.firstChild);
    panel = doc.createElement('section'); panel.id = 'twsDeskPanel'; panel.className = 'desk-panel'; panel.hidden = true; panel.setAttribute('aria-label', '旁批与参考'); m.insertBefore(panel, tabs.nextSibling);
    tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-desk-tab]'); if (b) open(b.dataset.deskTab); });
    bind(panel);
  }
  function closeDrawer(restore) {
    if (!drawer) return;
    drawer.remove(); drawer = null; doc.removeEventListener('keydown', drawerKeys, true);
    mode = 'overview'; lastHTML = ''; render(true);
    if (restore !== false && priorFocus && priorFocus.isConnected) priorFocus.focus();
  }
  function drawerKeys(e) {
    if (!drawer || doc.querySelector('.tws-modal-wrap')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    var fs = drawer.querySelectorAll('button:not([disabled]),select,textarea,input,[tabindex="0"]'); if (!fs.length) return;
    var a = fs[0], b = fs[fs.length - 1];
    if (e.shiftKey && (doc.activeElement === a || !drawer.contains(doc.activeElement))) { e.preventDefault(); b.focus(); }
    else if (!e.shiftKey && (doc.activeElement === b || !drawer.contains(doc.activeElement))) { e.preventDefault(); a.focus(); }
  }
  function open(which) {
    if (!D() || !U()) return;
    if (T.flushSave) T.flushSave();
    if (drawer) closeDrawer(false);
    mode = which; lastHTML = '';
    if (which !== 'overview' && !desktop()) {
      priorFocus = doc.activeElement;
      drawer = doc.createElement('div'); drawer.className = 'desk-drawer-wrap';
      drawer.innerHTML = '<section class="desk-drawer" role="dialog" aria-modal="true" aria-label="' + (which === 'notes' ? '旁批与待改' : '固定参考') + '"><div class="desk-drawer-head"><span>' + (which === 'notes' ? '旁批 · Marginalia' : '参考 · Ad marginem') + '</span><button type="button" class="tws-x" data-desk-close aria-label="关闭">✕</button></div><div class="desk-drawer-body"></div></section>';
      doc.body.appendChild(drawer);
      drawer.addEventListener('click', function (e) { if (e.target === drawer || e.target.closest('[data-desk-close]')) closeDrawer(); });
      bind(drawer); doc.addEventListener('keydown', drawerKeys, true);
      drawer.querySelector('[data-desk-close]').focus();
    }
    render(true);
  }
  function captureSelection() {
    var ta = doc.getElementById('twsContent'), c = ownChapter(current()); if (!c) return null;
    var a = ta ? makeAnchor(ta.value, ta.selectionStart, ta.selectionEnd) : makeAnchor(c.content, 0, 0);
    return Object.assign(a, { chapterId: c.id, projectId: pid() });
  }
  function persist(c, next) {
    var prev = c.annotations; c.annotations = next;
    if (!D().save()) { c.annotations = prev; toast('旁批没能保存，请先腾出浏览器空间或导出备份'); return false; }
    lastHTML = ''; render(true); return true;
  }
  function addNote(data) {
    data = data || {}; var projectId = data.projectId || pid(), c = ownChapter(data.chapterId || current(), projectId);
    if (!c || projectId !== pid()) { toast('原来的作品或章节已不可用，请重新打开'); return null; }
    var text = String(data.text || '').trim(); if (!text) { toast('先写下需要修改的地方'); return null; }
    var anchor = makeAnchor(c.content, data.start, Number(data.start || 0) + String(data.quote || '').length);
    if (data.quote) {
      anchor.quote = String(data.quote);
      if (data.before !== undefined) anchor.before = String(data.before);
      if (data.after !== undefined) anchor.after = String(data.after);
      /* 外部检查没有确定的字符位置时，保留引用并由定位器判定。 */
      if (typeof data.start !== 'number') { anchor.start = -1; anchor.before = ''; anchor.after = ''; }
    }
    var n = Object.assign(anchor, { id: 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9), text: text.slice(0, 6000), created: Date.now(), updated: Date.now(), done: false, source: String(data.source || '').slice(0, 80) });
    if (!persist(c, annotations(c).concat([n]))) return null;
    toast('已记在页边'); return n;
  }
  function noteForm(anchor, existing) {
    var projectId = anchor.projectId || pid(), c = ownChapter(anchor.chapterId, projectId);
    if (!c) { toast('先打开一章，再记旁批'); return; }
    if (T.flushSave) T.flushSave();
    U().modal(existing ? '编辑旁批' : '记一条旁批',
      '<p class="desk-form-ch">' + esc(c.title) + '</p>' + (anchor.quote ? '<blockquote class="desk-form-quote">' + esc(anchor.quote) + '</blockquote>' : hint('这条旁批会记在整章上。选中正文后添加，可关联到具体句子。')) +
      '<label class="tws-l" for="deskNoteText">需要留意或修改的地方</label><textarea class="tws-i desk-note-input" id="deskNoteText" rows="4" maxlength="6000" placeholder="例如：这里的动机还不够，后面补一段铺垫">' + esc(existing ? existing.text : '') + '</textarea>',
      { okText: '保存旁批', onOk: function (w) {
        if (pid() !== projectId || !ownChapter(c.id, projectId)) { toast('作品已经切换，请重新记旁批'); return false; }
        var txt = w.querySelector('#deskNoteText').value.trim(); if (!txt) { toast('先写下需要修改的地方'); return false; }
        if (existing) {
          var next = annotations(c).map(function (n) { return n.id === existing.id ? Object.assign({}, n, { text: txt, updated: Date.now() }) : n; });
          if (!persist(c, next)) return false;
        } else if (!addNote(Object.assign({}, anchor, { text: txt }))) return false;
      } });
  }
  function addNoteFromSelection(saved) {
    var anchor = saved && saved.chapterId ? saved : captureSelection();
    if (!anchor) { toast('先打开一章，再记旁批'); return; }
    noteForm(anchor);
  }
  function jump(c, n) {
    if (T.flushSave) T.flushSave();
    var at = locateAnchor(c.content, n);
    if (at.status !== 'found' && at.status !== 'chapter') { toast(at.status === 'ambiguous' ? '原文有多处重复，请手动核对' : '原文已修改，无法准确定位'); return; }
    if (drawer) closeDrawer(false);
    if (T.craft && T.craft.jumpTo) {
      T.craft.jumpTo(c.id, at.start, at.end - at.start);
      toast(n.quote ? '已选中引用的原文' : '已打开这条旁批所在章节'); return;
    }
    root.showView && root.showView('v-book'); T.openChapter(c.id); T.renderEditor();
    var ta = doc.getElementById('twsContent'); if (!ta) return;
    ta.focus(); ta.setSelectionRange(at.start, at.end);
    /* textarea 的原生查找光标不保证滚动；按换行与宽度估计位置。 */
    var style = root.getComputedStyle(ta), lh = parseFloat(style.lineHeight) || 28, width = Math.max(1, ta.clientWidth - 36), fs = parseFloat(style.fontSize) || 16;
    var charsPerLine = Math.max(1, Math.floor(width / fs));
    var lines = ta.value.slice(0, at.start).split('\n').reduce(function (s, line) { return s + Math.max(1, Math.ceil(line.length / charsPerLine)); }, 0);
    ta.scrollTop = Math.max(0, (lines - 2) * lh - ta.clientHeight / 3);
    toast(n.quote ? '已选中引用的原文' : '已打开这条旁批所在章节');
  }
  function bind(host) {
    host.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-desk-filter')) { filter = e.target.value; render(true); }
      if (e.target.hasAttribute('data-desk-scope')) { scope = e.target.value; render(true); }
    });
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-desk]'); if (!b) return;
      var action = b.dataset.desk, row = b.closest('[data-note]'), c = row && ownChapter(row.dataset.chapter), n = c && annotations(c).filter(function (n) { return n.id === row.dataset.note; })[0];
      if (action === 'add') { addNoteFromSelection(); return; }
      if (action === 'pin' || action === 'unpin') {
        var p = project(); if (!p) return;
        var old = p.deskReference;
        if (action === 'pin') {
          var picker = host.querySelector('[data-desk-ref]'), value = picker && picker.value; if (!value) { toast('先选择一份参考内容'); return; }
          var ix = value.indexOf(':'); p.deskReference = { kind: value.slice(0, ix), id: value.slice(ix + 1) };
        } else delete p.deskReference;
        if (!D().save()) { p.deskReference = old; toast('参考选择未能保存，请先导出备份'); return; }
        render(true); return;
      }
      if (!c || !n) { toast('这条旁批已经不存在'); render(true); return; }
      if (action === 'jump') jump(c, n);
      if (action === 'done') persist(c, annotations(c).map(function (x) { return x.id === n.id ? Object.assign({}, x, { done: !x.done, updated: Date.now() }) : x; }));
      if (action === 'edit') noteForm(Object.assign({}, n, { chapterId: c.id, projectId: pid() }), n);
      if (action === 'delete') U().confirm('删除这条旁批？书稿正文会保留。', function () { if (ownChapter(c.id)) persist(c, annotations(c).filter(function (x) { return x.id !== n.id; })); });
    });
  }
  function init() {
    if (!D() || !U()) return false;
    if (!hooked) {
      hooked = true; D().onSave(queueRefresh);
      doc.addEventListener('click', queueRefresh);
      root.addEventListener('resize', function () {
        if (!drawer && mode !== 'overview' && !desktop()) open(mode);
        else if (drawer && desktop()) { var old = mode; closeDrawer(false); mode = old; render(true); }
      });
      root.addEventListener('storage', queueRefresh);
    }
    installMargin(); render(); return !!tabs;
  }
  T.desk = { openNotes: function () { open('notes'); }, openReference: function () { open('reference'); }, addNoteFromSelection: addNoteFromSelection, captureSelection: captureSelection, addNote: addNote, refresh: queueRefresh, makeAnchor: makeAnchor, locateAnchor: locateAnchor };
  function start() { var n = 0; (function retry() { if (!init() && n++ < 40) setTimeout(retry, 150); })(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : null);
