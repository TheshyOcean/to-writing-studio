/* ============================================================
   To Writing Studio · 全书搜索与替换
   ------------------------------------------------------------
   在当前作品的所有章节（标题 + 正文）、设定卡片、伏笔和时间线里
   找一个词；可以一次全部替换（比如给角色改名）。
   - 入口：「书稿」页右上角的「搜索」按钮，或 Ctrl / ⌘ + Shift + F
   - 点正文里的某一处，跳到那一章并选中它
   - 替换正文前每章都留一份「全书替换前」的版本快照；
     替换完还可以在弹窗里一键撤销这一次替换
   - 只做普通文字匹配（英文不分大小写），不支持正则
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var MAX_SNIP = 3;          // 每一组最多先列几处
  var CTX = 16;              // 命中处前后各带多少字

  function D() { return T.data; }
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
  function allChapters(pid) {
    var d = D(), r = [];
    d.listVolumes(pid).forEach(function (v) { r = r.concat(d.listChapters(v.id)); });
    return r;
  }
  function reOf(q) { return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
  /* 一段文字里所有命中的位置 */
  function findAll(text, q) {
    var out = [], re = reOf(q), m;
    text = String(text || '');
    while ((m = re.exec(text))) { out.push(m.index); if (m.index === re.lastIndex) re.lastIndex++; }
    return out;
  }
  function swap(text, q, to) { return String(text || '').replace(reOf(q), function () { return to; }); }
  function snippet(text, pos, len) {
    var a = Math.max(0, pos - CTX), b = Math.min(text.length, pos + len + CTX);
    return (a > 0 ? '…' : '') + esc(text.slice(a, pos).replace(/\s+/g, ' ')) +
      '<mark>' + esc(text.slice(pos, pos + len)) + '</mark>' +
      esc(text.slice(pos + len, b).replace(/\s+/g, ' ')) + (b < text.length ? '…' : '');
  }

  /* ---------------- 可搜索的字段 ---------------- */
  /* 每一项：{ group, groupName, id, label, text, set(newText) } */
  function fields(pid, scope) {
    var d = D(), out = [];
    if (scope.book) {
      allChapters(pid).forEach(function (c, i) {
        var g = 'ch:' + c.id, name = '第 ' + (i + 1) + ' 章 · ' + c.title;
        out.push({ kind: 'book', group: g, groupName: name, ch: c.id, label: '章节名', text: c.title,
          set: function (v) { if (v.trim()) d.updateChapter(c.id, { title: v.trim() }); } });
        out.push({ kind: 'book', group: g, groupName: name, ch: c.id, body: true, label: '', text: c.content || '',
          set: function (v) { d.saveChapterContent(c.id, v, '全书替换前'); },
          unset: function (v) { d.saveChapterContent(c.id, v, '撤销全书替换前'); } });
      });
    }
    if (scope.lore) {
      d.listCards(pid).forEach(function (c) {
        var g = 'card:' + c.id, name = (d.CARD_KINDS[c.kind] || '设定') + ' · ' + c.name;
        out.push({ kind: 'lore', group: g, groupName: name, label: '名字', text: c.name, set: function (v) { if (v.trim()) d.updateCard(c.id, { name: v.trim() }); } });
        out.push({ kind: 'lore', group: g, groupName: name, label: '描述', text: c.body || '', set: function (v) { d.updateCard(c.id, { body: v }); } });
        (c.aliases || []).forEach(function (a, k) {
          out.push({ kind: 'lore', group: g, groupName: name, label: '别名', text: a, set: function (v) {
            var arr = (c.aliases || []).slice(); arr[k] = v; d.updateCard(c.id, { aliases: arr.filter(function (x) { return String(x).trim(); }) });
          } });
        });
        Object.keys(c.attrs || {}).forEach(function (k) {
          if (typeof c.attrs[k] !== 'string') return;
          out.push({ kind: 'lore', group: g, groupName: name, label: k, text: c.attrs[k], set: function (v) {
            var at = Object.assign({}, c.attrs); at[k] = v; d.updateCard(c.id, { attrs: at });
          } });
        });
      });
    }
    if (scope.threads) {
      d.listThreads(pid).forEach(function (t) {
        var g = 'th:' + t.id, name = '伏笔 · ' + (t.name || '未命名');
        out.push({ kind: 'threads', group: g, groupName: name, label: '名称', text: t.name || '', set: function (v) { d.updateThread(t.id, { name: v }); } });
        out.push({ kind: 'threads', group: g, groupName: name, label: '说明', text: t.note || '', set: function (v) { d.updateThread(t.id, { note: v }); } });
      });
      d.listEvents(pid).forEach(function (ev) {
        var g = 'ev:' + ev.id, name = '时间线 · ' + (ev.whenLabel || '某时');
        ['whenLabel', 'who', 'what'].forEach(function (k) {
          out.push({ kind: 'threads', group: g, groupName: name, label: { whenLabel: '时间', who: '人物', what: '事件' }[k], text: ev[k] || '',
            set: function (v) { ev[k] = v; d.save(); } });
        });
      });
    }
    return out;
  }

  function search(q, scope) {
    var d = D(), pid = d && d.D.activeProject;
    var res = { q: q, total: 0, groups: [], hits: [], count: { book: 0, lore: 0, threads: 0 } };
    if (!pid || !q) return res;
    var byGroup = {};
    fields(pid, scope).forEach(function (f) {
      var pos = findAll(f.text, q); if (!pos.length) return;
      var g = byGroup[f.group];
      if (!g) { g = byGroup[f.group] = { id: f.group, name: f.groupName, kind: f.kind, ch: f.ch, n: 0, items: [] }; res.groups.push(g); }
      g.n += pos.length; res.total += pos.length; res.count[f.kind] += pos.length;
      res.hits.push({ f: f, n: pos.length });
      pos.forEach(function (p) { g.items.push({ f: f, pos: p }); });
    });
    return res;
  }

  /* ---------------- 跳到某一章的某一处 ---------------- */
  function scrollerOf(el) {
    for (var p = el.parentElement; p; p = p.parentElement) {
      var o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return document.scrollingElement || document.documentElement;
  }
  /* 输入框是自动撑高的，要自己算出命中处离顶部多远 */
  function offsetIn(ta, pos) {
    var cs = getComputedStyle(ta), m = document.createElement('div');
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'borderLeftWidth', 'borderRightWidth', 'boxSizing', 'wordBreak', 'tabSize'].forEach(function (k) { m.style[k] = cs[k]; });
    m.style.cssText += ';position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;overflow-wrap:break-word;width:' + ta.clientWidth + 'px';
    m.textContent = ta.value.slice(0, pos) || ' ';
    document.body.appendChild(m);
    var h = m.offsetHeight; m.remove();
    return h;
  }
  function jump(chId, pos, len) {
    try { T.flushSave && T.flushSave(); } catch (e) {}
    if (window.showView) window.showView('v-book');
    var node = document.querySelector('#twsTree .tws-ch[data-ch="' + chId + '"]');
    if (node) node.click(); else if (T.openChapter) T.openChapter(chId);
    setTimeout(function () {
      var ta = document.getElementById('twsContent'); if (!ta) return;
      try { ta.focus({ preventScroll: true }); ta.setSelectionRange(pos, pos + len); } catch (e) {}
      var sc = scrollerOf(ta), y = offsetIn(ta, pos);
      var top = ta.getBoundingClientRect().top - (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) + sc.scrollTop + y;
      sc.scrollTop = Math.max(0, top - sc.clientHeight * 0.35);
    }, 320);
  }

  /* ---------------- 弹窗 ---------------- */
  var KIND_NAME = { book: '正文', lore: '设定', threads: '伏笔与时间线' };
  var lastUndo = null;

  function open(preset) {
    var d = D(), pid = d && d.D.activeProject;
    if (!pid) { toast('先建一部作品'); return; }
    if (document.querySelector('.tws-sr')) return;
    try { T.flushSave && T.flushSave(); } catch (e) {}
    var scope = { book: true, lore: true, threads: true }, res = null, armed = false, expanded = {};
    var wrap = document.createElement('div');
    wrap.className = 'tws-modal-wrap tws-sr';
    wrap.innerHTML =
      '<div class="tws-modal">' +
        '<div class="tws-modal-h"><span class="sq"></span><b>全书搜索</b><button class="tws-x" data-close>✕</button></div>' +
        '<div class="tws-sr-top">' +
          '<input type="text" class="tws-sr-q" id="srQ" placeholder="找什么？比如一个人名、一句话" autocomplete="off" spellcheck="false">' +
          '<div class="tws-sr-scope">' +
            ['book', 'lore', 'threads'].map(function (k) { return '<button type="button" class="on" data-scope="' + k + '">' + KIND_NAME[k] + '</button>'; }).join('') +
            '<span id="srSum"></span></div>' +
        '</div>' +
        '<div class="tws-modal-b tws-sr-list" id="srList"></div>' +
        '<div class="tws-modal-f tws-sr-foot">' +
          '<input type="text" id="srTo" placeholder="替换为…（可留空，表示删掉）" autocomplete="off" spellcheck="false">' +
          '<button class="tws-btn" id="srUndo" style="display:none">撤销这次替换</button>' +
          '<button class="tws-btn primary" id="srGo" disabled>全部替换</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    var $q = wrap.querySelector('#srQ'), $to = wrap.querySelector('#srTo'), $list = wrap.querySelector('#srList'),
      $sum = wrap.querySelector('#srSum'), $go = wrap.querySelector('#srGo'), $undo = wrap.querySelector('#srUndo');
    function close() { wrap.classList.remove('on'); document.removeEventListener('keydown', onKey, true); setTimeout(function () { wrap.remove(); }, 260); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);

    function disarm() { armed = false; $go.classList.remove('warn'); $go.textContent = res && res.total ? '全部替换 ' + res.total + ' 处' : '全部替换'; $go.disabled = !(res && res.total); }
    function run() {
      var q = $q.value;
      res = q.trim() ? search(q, scope) : null;
      disarm();
      $undo.style.display = lastUndo ? '' : 'none';
      if (!res) { $sum.textContent = ''; $list.innerHTML = '<p class="tws-sr-nil">在当前作品的章节、设定、伏笔和时间线里查找。<br>点正文里的结果，会跳到那一章并选中那一处。</p>'; return; }
      if (!res.total) { $sum.textContent = '没有找到'; $list.innerHTML = '<p class="tws-sr-nil">没有找到「' + esc(q) + '」。</p>'; return; }
      var bits = [];
      ['book', 'lore', 'threads'].forEach(function (k) { if (res.count[k]) bits.push(KIND_NAME[k] + ' ' + res.count[k]); });
      $sum.textContent = '共 ' + res.total + ' 处 · ' + bits.join(' · ');
      $list.innerHTML = res.groups.map(function (g, gi) {
        var all = expanded[g.id], items = all ? g.items : g.items.slice(0, MAX_SNIP);
        return '<div class="tws-sr-g"><div class="tws-sr-gh"><b>' + esc(g.name) + '</b><i>' + g.n + ' 处</i></div>' +
          items.map(function (it, k) {
            var jumpable = it.f.body;
            return '<' + (jumpable ? 'button type="button"' : 'div') + ' class="tws-sr-it' + (jumpable ? ' go' : '') + '" data-g="' + gi + '" data-k="' + k + '">' +
              (it.f.label ? '<em>' + esc(it.f.label) + '</em>' : '') + '<span>' + snippet(it.f.text, it.pos, q.length) + '</span></' + (jumpable ? 'button' : 'div') + '>';
          }).join('') +
          (g.items.length > MAX_SNIP && !all ? '<button type="button" class="tws-sr-more" data-more="' + esc(g.id) + '">还有 ' + (g.items.length - MAX_SNIP) + ' 处，展开</button>' : '') +
          '</div>';
      }).join('');
    }
    var timer = 0;
    $q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 160); });
    $to.addEventListener('input', disarm);

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.hasAttribute('data-close')) { close(); return; }
      var sc = e.target.closest('[data-scope]');
      if (sc) {
        var k = sc.dataset.scope; scope[k] = !scope[k];
        if (!scope.book && !scope.lore && !scope.threads) scope[k] = true;     // 至少留一个
        wrap.querySelectorAll('[data-scope]').forEach(function (b) { b.classList.toggle('on', !!scope[b.dataset.scope]); });
        run(); return;
      }
      var more = e.target.closest('[data-more]');
      if (more) { expanded[more.dataset.more] = 1; run(); return; }
      var it = e.target.closest('.tws-sr-it.go');
      if (it && res) {
        var g = res.groups[+it.dataset.g], item = g && g.items[+it.dataset.k];
        if (item) { close(); jump(item.f.ch, item.pos, res.q.length); }
        return;
      }
      if (e.target === $go) { replaceAll(); return; }
      if (e.target === $undo) { undo(); return; }
    });

    function replaceAll() {
      if (!res || !res.total) return;
      var to = $to.value;
      if (to === res.q) { toast('替换成的内容和原来一样'); return; }
      if (!armed) {     // 第一下只是确认
        armed = true; $go.classList.add('warn');
        $go.textContent = '确认：把 ' + res.total + ' 处「' + clip(res.q) + '」换成「' + clip(to) + '」';
        return;
      }
      var log = [], n = res.total;
      res.hits.forEach(function (h) {
        var old = h.f.text, next = swap(old, res.q, to);
        if (next === old) return;
        log.push({ f: h.f, old: old });
        h.f.set(next);
      });
      lastUndo = { log: log, n: n, q: res.q, to: to };
      afterChange();
      toast('已替换 ' + n + ' 处' + (res.count.book ? ' · 正文留了「全书替换前」的版本' : ''));
      run();
    }
    function undo() {
      if (!lastUndo) return;
      lastUndo.log.forEach(function (x) { (x.f.unset || x.f.set)(x.old); });
      toast('已撤销：' + lastUndo.n + ' 处「' + clip(lastUndo.to) + '」改回「' + clip(lastUndo.q) + '」');
      lastUndo = null;
      afterChange(); run();
    }
    function afterChange() {
      try { T.refreshViews && T.refreshViews(); } catch (e) {}
      try { T.renderEditor && T.renderEditor(); } catch (e) {}
    }
    function clip(s) { s = String(s); return s ? (s.length > 12 ? s.slice(0, 12) + '…' : s) : '（空）'; }

    if (preset) $q.value = preset;
    run();
    setTimeout(function () { $q.focus(); $q.select(); }, 120);
  }

  /* ---------------- 入口 ---------------- */
  function addButton() {
    var ex = document.getElementById('twsBtnExport');
    if (!ex) return false;
    if (document.getElementById('twsBtnSearch')) return true;
    var b = document.createElement('button');
    b.className = 'tws-ib'; b.id = 'twsBtnSearch'; b.type = 'button';
    b.setAttribute('aria-label', '全书搜索与替换');
    b.setAttribute('data-tip', '全书搜索与替换（Ctrl / ⌘ + Shift + F）');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.3 4.3"/></svg>';
    b.addEventListener('click', function () { open(); });
    ex.parentNode.insertBefore(b, ex);
    return true;
  }
  function init() {
    (function wait() { if (!addButton() && (wait.n = (wait.n || 0) + 1) < 100) setTimeout(wait, 100); })();
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        var sel = ''; try { sel = String(window.getSelection() || '').trim(); } catch (err) {}
        var ta = document.activeElement;
        if (!sel && ta && ta.id === 'twsContent') sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
        open(sel && sel.length <= 30 && sel.indexOf('\n') < 0 ? sel : '');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.search = { open: open, run: search, _swap: swap };
})();
