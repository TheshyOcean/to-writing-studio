/* ============================================================
   To Writing Studio · 写作统计 / 用量与花费 / 提示词库（V3.5.0）
   ------------------------------------------------------------
   - 写作统计：近 7 天、全年热力图、每章字数、预计完稿日期
   - 用量与花费：记下每次 AI 请求用了多少 Token，按你填的单价算钱
     · 接口返回了用量就用接口的数；没返回就按字数估（会标「估算」）
     · 只在本机记数，不改请求内容，也不会多发请求
   - 提示词库：对话输入框上方的「指令」，把常用的话存成按钮
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  function D() { return T.data; }
  function U() { return T.ui; }
  function esc(s) { return D().esc(s); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function dayKey(dt) { return dt.toLocaleDateString('sv'); }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ============================================================
     写作统计
     ============================================================ */
  function heatmap(stats, goal) {
    var WEEKS = 53, today = new Date();
    today.setHours(12, 0, 0, 0);
    var end = new Date(today.getTime() + (6 - today.getDay()) * 864e5);      // 本周六
    var start = new Date(end.getTime() - (WEEKS * 7 - 1) * 864e5);
    var g = goal > 0 ? goal : 1000, cols = '', months = '', lastM = -1;
    for (var w = 0; w < WEEKS; w++) {
      var col = '';
      for (var i = 0; i < 7; i++) {
        var dt = new Date(start.getTime() + (w * 7 + i) * 864e5), k = dayKey(dt), n = stats[k] || 0;
        if (dt > today) { col += '<i class="f"></i>'; continue; }
        var lv = n <= 0 ? 0 : (n < g * 0.5 ? 1 : (n < g ? 2 : (n < g * 2 ? 3 : 4)));
        col += '<i class="l' + lv + '" title="' + k + ' · ' + n + ' 字"></i>';
      }
      var first = new Date(start.getTime() + w * 7 * 864e5), mth = first.getMonth();
      months += '<span>' + (mth !== lastM ? (mth + 1) + '月' : '') + '</span>';
      lastM = mth;
      cols += '<div>' + col + '</div>';
    }
    return '<div class="tws-heat-wrap" id="twsHeat"><div class="tws-heat-m">' + months + '</div><div class="tws-heat">' + cols + '</div></div>' +
      '<div class="tws-heat-leg">少<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>多' +
      '<em>深色 = 达到每日目标</em></div>';
  }
  function openStats() {
    var d = D(), S = d.D, pid = S.activeProject, p = pid && d.getProject(pid);
    var l7 = d.last7();
    var max = Math.max.apply(null, l7.map(function (x) { return x.words; }).concat([1]));
    var bars = l7.map(function (x) {
      return '<div class="tws-bar"><i style="height:' + Math.round(x.words / max * 100) + '%"></i><span>' + x.label + '</span><em>' + (x.words || '') + '</em></div>';
    }).join('');
    var days = Object.keys(S.stats || {}).filter(function (k) { return S.stats[k] > 0; });
    var best = days.reduce(function (b, k) { return S.stats[k] > (b ? S.stats[b] : 0) ? k : b; }, '');
    var sum14 = 0, now = new Date();
    for (var i = 0; i < 14; i++) sum14 += S.stats[dayKey(new Date(now.getTime() - i * 864e5))] || 0;
    var pace = Math.round(sum14 / 14);

    var chs = p ? U().allChapters(pid) : [], total = p ? d.projectWords(pid) : 0;
    var cmax = Math.max.apply(null, chs.map(function (c) { return c.words || 0; }).concat([1]));
    var avg = chs.length ? Math.round(total / chs.length) : 0;
    var chBars = chs.map(function (c, i) {
      var w = c.words || 0, odd = avg > 500 && (w > avg * 1.8 || (w < avg * 0.4 && w > 0));
      return '<div class="tws-chbar' + (odd ? ' odd' : '') + '"><span>' + (i + 1) + ' · ' + esc(c.title) + '</span><b><i style="width:' + Math.max(1, Math.round(w / cmax * 100)) + '%"></i></b><em>' + w + '</em></div>';
    }).join('');

    var m = U().modal('写作统计',
      '<div class="tws-stat-row">' +
        '<div class="tws-stat"><b>' + d.todayWords() + '</b><span>今日字数</span></div>' +
        '<div class="tws-stat"><b>' + d.weekWords() + '</b><span>近 7 天</span></div>' +
        '<div class="tws-stat"><b>' + d.streak() + '</b><span>连续天数</span></div>' +
        '<div class="tws-stat"><b>' + days.length + '</b><span>累计写作天数</span></div>' +
      '</div>' +
      '<div class="tws-bars">' + bars + '</div>' +
      '<div class="tws-pr-sec"><h4>过去一年<em>' + (best ? '最多的一天：' + best + ' · ' + fmt(S.stats[best]) + ' 字' : '还没有记录') + '</em></h4>' +
        heatmap(S.stats || {}, S.goal) + '</div>' +
      (p ? '<div class="tws-pr-sec"><h4>预计完稿<em>《' + esc(p.name) + '》现有 ' + d.fmtNum(total) + ' 字</em></h4>' +
        '<div class="tws-eta"><label>目标总字数（万字）<input class="tws-i" id="stTarget" type="number" min="0" step="1" value="' + (p.targetWords ? p.targetWords / 10000 : '') + '" placeholder="比如 30"></label>' +
        '<div id="stEta"></div></div></div>' : '') +
      (chs.length ? '<div class="tws-pr-sec"><h4>每章字数<em>共 ' + chs.length + ' 章 · 平均 ' + avg + ' 字' + (avg > 500 ? ' · 标色的是明显偏长或偏短的章' : '') + '</em></h4>' +
        '<div class="tws-chbars">' + chBars + '</div></div>' : '') +
      '<label class="tws-l" style="margin-top:16px">每日目标（字）</label>' +
      '<input class="tws-i" id="sGoal" type="number" min="0" step="100" value="' + (S.goal || 0) + '">',
      {
        okText: '保存',
        onOk: function (w) {
          d.setGoal(w.querySelector('#sGoal').value);
          var t = w.querySelector('#stTarget');
          if (t && p) d.updateProject(p.id, { targetWords: Math.max(0, Math.round((parseFloat(t.value) || 0) * 10000)) });
          U().renderGoalChip(); U().toast('已保存');
        }
      });
    var heat = m.el.querySelector('#twsHeat');
    if (heat) setTimeout(function () { heat.scrollLeft = heat.scrollWidth; }, 30);
    function eta() {
      var box = m.el.querySelector('#stEta'), t = m.el.querySelector('#stTarget');
      if (!box || !t) return;
      var target = Math.round((parseFloat(t.value) || 0) * 10000);
      if (!target) { box.textContent = '填一个目标字数，按你最近 14 天的速度估算哪天写完。'; return; }
      var left = target - total;
      if (left <= 0) { box.innerHTML = '已经写到目标字数了。'; return; }
      var pct = Math.round(total / target * 100);
      if (pace <= 0) { box.innerHTML = '完成 <b>' + pct + '%</b>，还差 ' + d.fmtNum(left) + ' 字。最近 14 天没有落笔，估不出日期。'; return; }
      var n = Math.ceil(left / pace), date = new Date(Date.now() + n * 864e5);
      box.innerHTML = '完成 <b>' + pct + '%</b>，还差 ' + d.fmtNum(left) + ' 字。按最近 14 天日均 <b>' + pace + '</b> 字，大约还要 <b>' + n + '</b> 天，' +
        '<b>' + date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日</b>前后写完。' +
        (S.goal > pace ? '<br>如果每天写够目标 ' + S.goal + ' 字，只要 ' + Math.ceil(left / S.goal) + ' 天。' : '');
    }
    var tg = m.el.querySelector('#stTarget');
    if (tg) tg.addEventListener('input', eta);
    eta();
  }

  /* ============================================================
     用量与花费
     ============================================================ */
  var USE_KEY = 'tws_usage_v1';
  function usage() {
    var u = parse(lsGet(USE_KEY));
    if (!u || typeof u !== 'object') u = {};
    ['d', 'b', 'm'].forEach(function (k) { if (!u[k] || typeof u[k] !== 'object') u[k] = {}; });
    if (!u.price || typeof u.price !== 'object') u.price = {};
    return u;
  }
  function bump(o, k, i, out, est) {
    var x = o[k] || (o[k] = { i: 0, o: 0, n: 0, e: 0 });
    x.i += i; x.o += out; x.n += 1; if (est) x.e = (x.e || 0) + 1;
  }
  /* 没有用量数据时的估算：中文约 0.6 token / 字，其它约 0.3 token / 字符 */
  function estTokens(s) {
    s = String(s || '');
    var cn = (s.match(/[　-鿿＀-￯]/g) || []).length;
    return Math.ceil(cn * 0.6 + (s.length - cn) * 0.3);
  }
  function record(model, inTok, outTok, est) {
    if (!(inTok > 0) && !(outTok > 0)) return;
    var u = usage(), day = dayKey(new Date());
    bump(u.d, day, inTok, outTok, est);
    bump(u.m, String(model || '未知模型').slice(0, 60), inTok, outTok, est);
    var pid = D() && D().D.activeProject;
    if (pid) bump(u.b, pid, inTok, outTok, est);
    var keys = Object.keys(u.d).sort();
    while (keys.length > 400) delete u.d[keys.shift()];
    lsSet(USE_KEY, JSON.stringify(u));
  }
  function hookFetch() {
    if (!window.fetch || window.fetch.__twsMeter) return;
    var real = window.fetch;
    var wrapped = function (input, init) {
      var p = real.apply(this, arguments);
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\/chat\/completions(\?|$)/.test(url) && init && typeof init.body === 'string') {
          var req = parse(init.body);
          if (req && Array.isArray(req.messages)) {
            p.then(function (r) { if (r && r.ok) watch(r.clone(), req); }).catch(function () {});
          }
        }
      } catch (e) {}
      return p;
    };
    wrapped.__twsMeter = true;
    window.fetch = wrapped;
  }
  function watch(res, req) {
    var promptText = req.messages.map(function (m) { return typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''); }).join('\n');
    function done(use, outText) {
      if (use && (use.prompt_tokens || use.completion_tokens)) record(req.model, use.prompt_tokens || 0, use.completion_tokens || 0, false);
      else record(req.model, estTokens(promptText), estTokens(outText), true);
    }
    if (!req.stream) {
      res.json().then(function (j) {
        var msg = j && j.choices && j.choices[0] && j.choices[0].message;
        done(j && j.usage, msg ? (msg.content || '') + (msg.reasoning_content || '') : '');
      }).catch(function () {});
      return;
    }
    if (!res.body || !res.body.getReader) return;
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', out = '', use = null;
    (function pump() {
      reader.read().then(function (r) {
        if (r.done) { done(use, out); return; }
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n'); buf = lines.pop();
        lines.forEach(function (ln) {
          ln = ln.trim();
          if (ln.indexOf('data:') !== 0) return;
          var j = parse(ln.slice(5).trim());
          if (!j) return;
          if (j.usage) use = j.usage;
          var dl = j.choices && j.choices[0] && j.choices[0].delta;
          if (dl) out += (dl.content || '') + (dl.reasoning_content || '');
        });
        pump();
      }).catch(function () { done(use, out); });      // 中途点了「停止」：按已经收到的算
    })();
  }
  function cost(x, price) {
    if (!x) return 0;
    return (x.i / 1e6) * (Number(price.i) || 0) + (x.o / 1e6) * (Number(price.o) || 0);
  }
  function sumOf(o, filter) {
    var s = { i: 0, o: 0, n: 0, e: 0 };
    Object.keys(o).forEach(function (k) { if (filter && !filter(k)) return; s.i += o[k].i; s.o += o[k].o; s.n += o[k].n; s.e += o[k].e || 0; });
    return s;
  }
  function openUsage() {
    var d = D();
    var m = U().modal('用量与花费', '<div id="usBody"></div>', { footer: false });
    function money(x, u) { return (u.price.i || u.price.o) ? '¥ ' + cost(x, u.price).toFixed(cost(x, u.price) < 1 ? 3 : 2) : '—'; }
    function tile(name, x, u) {
      return '<div class="tws-stat"><b>' + money(x, u) + '</b><span>' + name + ' · ' + x.n + ' 次</span><span>入 ' + fmt(x.i) + ' · 出 ' + fmt(x.o) + '</span></div>';
    }
    function paint() {
      var u = usage(), today = dayKey(new Date()), month = today.slice(0, 7);
      var t = u.d[today] || { i: 0, o: 0, n: 0, e: 0 }, mo = sumOf(u.d, function (k) { return k.slice(0, 7) === month; }), all = sumOf(u.m);
      var books = Object.keys(u.b).map(function (pid) { var p = d.getProject(pid); return p ? { name: '《' + p.name + '》', x: u.b[pid] } : null; }).filter(Boolean);
      var models = Object.keys(u.m).map(function (k) { return { name: k, x: u.m[k] }; }).sort(function (a, b) { return (b.x.i + b.x.o) - (a.x.i + a.x.o); });
      function rows(list) {
        return list.map(function (r) {
          return '<div class="tws-kit-row"><div class="tws-kit-row-m"><b>' + esc(r.name) + '</b><span>' + r.x.n + ' 次 · 入 ' + fmt(r.x.i) + ' · 出 ' + fmt(r.x.o) + ' Token</span></div><em>' + money(r.x, u) + '</em></div>';
        }).join('');
      }
      m.el.querySelector('#usBody').innerHTML =
        '<div class="tws-stat-row tws-us-row">' + tile('今天', t, u) + tile('本月', mo, u) + tile('累计', all, u) + '</div>' +
        (all.n ? '' : '<p class="tws-p" style="margin-top:12px">还没有记录。从现在起，每次 AI 续写、润色、检查、故事大脑分析都会记在这里。</p>') +
        (books.length ? '<div class="tws-pr-sec"><h4>按作品</h4>' + rows(books) + '</div>' : '') +
        (models.length ? '<div class="tws-pr-sec"><h4>按模型</h4>' + rows(models) + '</div>' : '') +
        '<div class="tws-pr-sec"><h4>单价<em>元 / 百万 Token，去服务商的价格页抄过来</em></h4>' +
          '<div class="tws-eta"><label>输入<input class="tws-i" id="usPi" type="number" min="0" step="0.1" value="' + (u.price.i || '') + '" placeholder="例如 2"></label>' +
          '<label>输出<input class="tws-i" id="usPo" type="number" min="0" step="0.1" value="' + (u.price.o || '') + '" placeholder="例如 8"></label></div></div>' +
        '<p class="tws-p tws-kit-dim" style="margin-top:10px">' +
          (all.e ? '其中 ' + all.e + ' 次接口没有返回用量，是按字数估的（中文约 0.6 Token / 字），会有出入。' : '') +
          '所有模型按同一个单价算，没算缓存命中的折扣，实际账单以服务商后台为准。记录只存在本机。</p>' +
        '<div class="tws-ai-bar"><button class="tws-btn sm ghost" id="usClear">清空记录</button><span class="tws-spacer"></span><button class="tws-btn sm primary" id="usSave">保存单价</button></div>';
    }
    m.el.addEventListener('click', function (e) {
      if (e.target.id === 'usSave') {
        var u = usage();
        u.price = { i: parseFloat(m.el.querySelector('#usPi').value) || 0, o: parseFloat(m.el.querySelector('#usPo').value) || 0 };
        lsSet(USE_KEY, JSON.stringify(u)); paint(); U().toast('已保存');
      }
      if (e.target.id === 'usClear') {
        if (!e.target.dataset.sure) { e.target.dataset.sure = '1'; e.target.textContent = '再点一次确认'; return; }
        var u2 = usage(); lsSet(USE_KEY, JSON.stringify({ price: u2.price })); paint();
      }
    });
    paint();
  }

  /* ============================================================
     提示词库
     ============================================================ */
  var PR_KEY = 'tws_prompts_v1';
  var PR_SEED = [
    ['续写下一段', '接着上面往下写大约 500 字。保持现在的视角和语气，不要总结，不要跳时间，停在一个有悬念的地方。'],
    ['写一场对话', '写一场两个人的对话，大约 400 字。每个人说话的方式要不一样，对白之间穿插动作和神态，不要用「说道」连成一串。人物和话题：'],
    ['环境描写', '用 150 字左右写这里的环境。从人物的感受出发，带上声音、气味或温度，不要罗列景物。地点：'],
    ['打斗场面', '写一段打斗，大约 500 字。短句为主，写清楚谁出了什么招、对方怎么接、局面怎么变，不要用「一番激战之后」带过。双方：'],
    ['章末钩子', '给这一章写一个结尾，100 字以内，让读者想马上看下一章。可以是一个新发现、一个反转，或者一句没说完的话。'],
    ['这段太平了', '上面这段读起来太平。指出最平的三处，并各给一个具体的改法（改成什么场面、谁做什么），先不要直接改写。']
  ];
  function prompts() {
    var raw = lsGet(PR_KEY), list = parse(raw);
    if (!Array.isArray(list)) {
      list = PR_SEED.map(function (p, i) { return { id: 'seed' + i, name: p[0], text: p[1] }; });
    }
    return list;
  }
  function fillInput(text) {
    if (window.showView) window.showView('v-chat');
    setTimeout(function () {
      var ta = document.getElementById('input');
      if (!ta) { U().toast('找不到输入框'); return; }
      ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
    }, 200);
  }
  function openPrompts() {
    var list = prompts();
    var m = U().modal('指令库', '<div id="prBody"></div>', { footer: false });
    function save() { lsSet(PR_KEY, JSON.stringify(list)); }
    function paint(editId) {
      var box = m.el.querySelector('#prBody');
      if (editId != null) {
        var it = list.filter(function (x) { return x.id === editId; })[0] || { id: '', name: '', text: '' };
        box.innerHTML = '<label class="tws-l">按钮上显示的名字</label><input class="tws-i" id="prName" maxlength="20" value="' + esc(it.name) + '" placeholder="比如：续写下一段">' +
          '<label class="tws-l">点了以后填进输入框的话</label><textarea class="tws-i" id="prText" rows="6" placeholder="把你每次都要重打一遍的要求写在这里">' + esc(it.text) + '</textarea>' +
          '<div class="tws-ai-bar">' + (it.id ? '<button class="tws-btn sm ghost" data-del="' + it.id + '">删除</button>' : '') +
          '<span class="tws-spacer"></span><button class="tws-btn sm" data-back>返回</button><button class="tws-btn sm primary" data-ok="' + it.id + '">保存</button></div>';
        setTimeout(function () { var n = box.querySelector('#prName'); if (n) n.focus(); }, 60);
        return;
      }
      box.innerHTML = '<p class="tws-p tws-kit-dim">点一条，填进对话输入框（不会直接发送，可以先改）。</p>' +
        (list.length ? list.map(function (x) {
          return '<div class="tws-kit-row tws-pr-it" data-use="' + x.id + '"><div class="tws-kit-row-m"><b>' + esc(x.name) + '</b><span>' + esc(x.text.slice(0, 60)) + (x.text.length > 60 ? '…' : '') + '</span></div>' +
            '<button class="tws-btn sm ghost" data-edit="' + x.id + '">改</button></div>';
        }).join('') : '<div class="tws-empty small"><p>还没有指令。</p></div>') +
        '<div class="tws-ai-bar"><span class="tws-spacer"></span><button class="tws-btn sm primary" data-edit="">新建指令</button></div>';
    }
    m.el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-edit')) { e.stopPropagation(); paint(t.getAttribute('data-edit')); return; }
      if (t.hasAttribute('data-back')) { paint(); return; }
      if (t.hasAttribute('data-del')) { list = list.filter(function (x) { return x.id !== t.getAttribute('data-del'); }); save(); paint(); return; }
      if (t.hasAttribute('data-ok')) {
        var name = m.el.querySelector('#prName').value.trim(), text = m.el.querySelector('#prText').value.trim();
        if (!name || !text) { U().toast('名字和内容都要填'); return; }
        var id = t.getAttribute('data-ok'), it = list.filter(function (x) { return x.id === id; })[0];
        if (it) { it.name = name; it.text = text; } else list.push({ id: D().uid('q'), name: name, text: text });
        save(); paint(); return;
      }
      var use = t.closest('[data-use]');
      if (use) {
        var x = list.filter(function (y) { return y.id === use.getAttribute('data-use'); })[0];
        if (x) { m.close(); fillInput(x.text); }
      }
    });
    paint();
  }
  function addPromptEntry() {
    if (document.getElementById('twsBtnPrompts')) return true;
    var tpl = document.getElementById('twsBtnTpl');
    if (!tpl) return false;
    var b = document.createElement('button');
    b.id = 'twsBtnPrompts'; b.type = 'button'; b.className = 'tws-tpl-btn';
    b.textContent = '指令'; b.title = '指令库：把常用的要求存成按钮';
    b.addEventListener('click', openPrompts);
    tpl.parentNode.insertBefore(b, tpl.nextSibling);
    return true;
  }

  hookFetch();
  function init() {
    var n = 0;
    (function tryAdd() { if (!addPromptEntry() && n++ < 20) setTimeout(tryAdd, 300); })();
    var b = document.getElementById('btnUsage');
    if (b) b.addEventListener('click', openUsage);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.meter = { openStats: openStats, openUsage: openUsage, openPrompts: openPrompts, _record: record, _usage: usage, _est: estTokens };
})();
