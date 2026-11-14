/* To Writing Studio · 修订对照
   纯本地比对，不额外请求模型。长文按句子分段比对，限制矩阵大小。
   每一处修改都保留原文，所有选择只在点击「应用修订」后写回书稿。 */
(function (root) {
  'use strict';
  var LIMIT = 800000;
  var segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
  function chars(s) { return segmenter ? Array.from(segmenter.segment(s), function (x) { return x.segment; }) : Array.from(s); }
  function sentences(s) { return s.match(/[^\n。！？!?；;]+[。！？!?；;]*|\n|[。！？!?；;]+/g) || []; }
  function push(out, kind, text) {
    if (!text) return;
    var last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind: kind, text: text });
  }
  /* LCS 的内存有上限。过长且完全不同的一块保留为一处整体修改。 */
  function sequence(a, b, budget) {
    var start = 0, end = 0, out = [];
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    push(out, 'same', a.slice(0, start).join(''));
    var aa = a.slice(start, a.length - end), bb = b.slice(start, b.length - end);
    var n = aa.length, m = bb.length, cells = (n + 1) * (m + 1);
    if (!n || !m || cells > budget.remaining) {
      push(out, 'remove', aa.join('')); push(out, 'add', bb.join(''));
    } else {
      budget.remaining -= cells;
      var width = m + 1, dp = new Uint32Array(cells), i, j;
      for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) {
        dp[i * width + j] = aa[i] === bb[j] ? dp[(i + 1) * width + j + 1] + 1 :
          Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
      i = 0; j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && aa[i] === bb[j]) { push(out, 'same', aa[i]); i++; j++; }
        else if (i < n && (j === m || dp[(i + 1) * width + j] >= dp[i * width + j + 1])) push(out, 'remove', aa[i++]);
        else push(out, 'add', bb[j++]);
      }
    }
    if (end) push(out, 'same', a.slice(a.length - end).join(''));
    return out;
  }
  function groups(ops) {
    var out = [], old = '', fresh = '';
    function flush() {
      if (old || fresh) out.push({ kind: 'change', before: old, after: fresh, accepted: true });
      old = ''; fresh = '';
    }
    ops.forEach(function (op) {
      if (op.kind === 'same') { flush(); out.push({ kind: 'same', text: op.text }); }
      else if (op.kind === 'remove') old += op.text;
      else fresh += op.text;
    });
    flush();
    return out;
  }
  function diff(before, after) {
    before = String(before == null ? '' : before); after = String(after == null ? '' : after);
    if (before === after) return before ? [{ kind: 'same', text: before }] : [];
    var a = chars(before), b = chars(after), budget = { remaining: LIMIT * 3 }, ops;
    if (a.length * b.length <= LIMIT) ops = sequence(a, b, budget);
    else {
      var coarse = groups(sequence(sentences(before), sentences(after), budget));
      ops = [];
      coarse.forEach(function (p) {
        if (p.kind === 'same') push(ops, 'same', p.text);
        else sequence(chars(p.before), chars(p.after), budget).forEach(function (o) { push(ops, o.kind, o.text); });
      });
    }
    var parts = groups(ops);
    /* 避免把一个词拆成好几个开关；短的相同字并入左右修改，但句末分隔保留。 */
    for (var i = 1; i < parts.length - 1; i++) {
      var p = parts[i], prev = parts[i - 1], next = parts[i + 1];
      if (p.kind === 'same' && chars(p.text).length <= 2 && !/[\n。！？!?；;]/.test(p.text) && prev.kind === 'change' && next.kind === 'change') {
        prev.before += p.text + next.before; prev.after += p.text + next.after;
        parts.splice(i, 2); i--;
      }
    }
    var number = 0;
    parts.forEach(function (p) { if (p.kind === 'change') p.id = number++; });
    return parts;
  }
  function compose(parts) {
    return parts.map(function (p) { return p.kind === 'same' ? p.text : (p.accepted ? p.after : p.before); }).join('');
  }
  function canApply(expected, current) {
    return !!expected && !!current && expected.chapterId === current.chapterId &&
      expected.projectId === current.projectId && expected.content === current.content;
  }
  function escape(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mount(host, before, after, options) {
    options = options || {};
    var parts = diff(before, after), changes = parts.filter(function (p) { return p.kind === 'change'; });
    host.classList.add('tws-revision-host');
    host.classList.remove('streaming');
    var html = '<div class="rv-head"><span class="rv-count" aria-live="polite"></span>' +
      '<div class="rv-actions"><button class="tws-btn sm" type="button" data-rv-all="yes">全部采纳</button>' +
      '<button class="tws-btn sm" type="button" data-rv-all="no">全部保留原文</button></div></div>' +
      '<p class="rv-guide">勾选想采纳的修改，再点「应用修订」。划线是删去的原文，下划线是新增的文字。</p>';
    if (!changes.length) html += '<p class="rv-unchanged">这次改稿与原文相同。</p>';
    html += '<div class="rv-list">';
    parts.forEach(function (p) {
      if (p.kind === 'same') {
        if (p.text.length > 400) html += '<details class="rv-context"><summary>展开未修改的文字（' + p.text.length + ' 字符）</summary><div>' + escape(p.text) + '</div></details>';
        else html += '<div class="rv-context">' + escape(p.text) + '</div>';
      } else {
        html += '<section class="rv-change" data-rv-row="' + p.id + '">' +
          '<label class="rv-choice"><input type="checkbox" data-rv-id="' + p.id + '" checked><span>采纳第 ' + (p.id + 1) + ' 处修改</span><em data-rv-state>已选择</em></label>' +
          '<div class="rv-columns"><div><small>原文</small>' + (p.before ? '<del>' + escape(p.before) + '</del>' : '<span class="rv-empty">此处新增</span>') + '</div>' +
          '<div><small>改稿</small>' + (p.after ? '<ins>' + escape(p.after) + '</ins>' : '<span class="rv-empty">删除这段文字</span>') + '</div></div></section>';
      }
    });
    host.innerHTML = html + '</div>';
    function update() {
      var accepted = changes.filter(function (p) { return p.accepted; }).length;
      host.querySelector('.rv-count').textContent = changes.length ? '共 ' + changes.length + ' 处修改 · 采纳 ' + accepted + ' 处' : '无需修订';
      changes.forEach(function (p) {
        var row = host.querySelector('[data-rv-row="' + p.id + '"]');
        row.classList.toggle('rv-kept', !p.accepted);
        row.querySelector('input').checked = p.accepted;
        row.querySelector('[data-rv-state]').textContent = p.accepted ? '已选择' : '保留原文';
      });
      if (options.onChange) options.onChange({ accepted: accepted, total: changes.length, text: compose(parts) });
    }
    host.onchange = function (e) {
      var id = e.target.getAttribute('data-rv-id');
      if (id === null) return;
      changes[Number(id)].accepted = e.target.checked; update();
    };
    host.onclick = function (e) {
      var b = e.target.closest('[data-rv-all]');
      if (!b || !host.contains(b)) return;
      changes.forEach(function (p) { p.accepted = b.getAttribute('data-rv-all') === 'yes'; }); update();
    };
    update();
    return { getText: function () { return compose(parts); }, getCount: function () { return changes.filter(function (p) { return p.accepted; }).length; } };
  }
  var api = { diff: diff, compose: compose, canApply: canApply, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { var T = root.TWS = root.TWS || {}; T.revision = api; }
})(typeof window !== 'undefined' ? window : null);
