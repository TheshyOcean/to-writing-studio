/* ============================================================================
   TWS · 故事大脑（Cerebrum）V2.6.0
   你只管写，其余自动跟上：
   - AI 每写完一段、或你保存一章，后台只跑「一次」综合分析，
     同时更新：人物 / 地点 / 名词、别名（简称）、人物关系、伏笔埋设与回收、时间线
   - 低风险的直接写入，留一条「撤销」；拿不准的称呼只问一次，答过就记住
   - 模式：全自动 / 半自动 / 每条都问 / 关闭（系统配置里切换）
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;
  if (!D) return;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };
  function pid() { return D.D.activeProject; }
  function S() { return window.__ENDF__ && window.__ENDF__.S; }
  function hasKey() { var s = S(); return !!(s && s.apiKey); }
  function toast(t) {
    if (typeof window.toast === 'function') { window.toast(t); return; }
    var w = $('toastWrap'); if (!w) return;
    var el = document.createElement('div'); el.className = 'toast'; el.textContent = t; w.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ---------------- 设置与记忆 ---------------- */
  var MODE_KEY = 'tws_brain_mode', MEM_KEY = 'tws_brain_v1';
  var MODES = [['auto', '全自动', '直接写入，可撤销；只有拿不准的才问'], ['semi', '半自动', '关系、时间线、别名、伏笔回收直接写；新人物、新伏笔先问'], ['ask', '每条都问', '全部列出来，勾选后才写入'], ['off', '关闭', '不自动分析']];
  var modeMem = null;
  function getMode() {
    var m = modeMem; try { m = localStorage.getItem(MODE_KEY) || m; } catch (e) {}
    if (!m) { try { if (localStorage.getItem('tws_autolore') === '0') m = 'off'; } catch (e) {} }
    return MODES.some(function (x) { return x[0] === m; }) ? m : 'auto';
  }
  function setMode(m) { modeMem = m; try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }
  var mem = (function () { try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch (e) { return {}; } })();
  function my() { var p = pid() || '_'; return mem[p] || (mem[p] = { no: {}, chap: {} }); }
  function saveMem() { try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) {} }

  /* ---------------- 认人 ---------------- */
  function cards(p, kind) { return D.listCards(p, kind); }
  function forms(c) { return [c.name].concat(c.aliases || []); }
  /* 返回 { card, how }：how = exact（正式名/别名完全一致）| part（简称，唯一包含关系） */
  function resolve(name, p, kind) {
    var k = norm(name); if (!k) return null;
    var list = cards(p, kind || 'character');
    var ex = list.filter(function (c) { return forms(c).some(function (f) { return norm(f) === k; }); })[0];
    if (ex) return { card: ex, how: 'exact' };
    if (k.length < 2) return null;
    var hit = list.filter(function (c) {
      return forms(c).some(function (f) { f = norm(f); return f.length >= 2 && (f.indexOf(k) >= 0 || k.indexOf(f) >= 0); });
    });
    return hit.length === 1 ? { card: hit[0], how: 'part' } : null;
  }
  function anyCard(name, p) {
    var k = norm(name);
    return cards(p).filter(function (c) { return forms(c).some(function (f) { return norm(f) === k; }); })[0] || null;
  }
  function saidNo(a, b) { return !!my().no[norm(a) + '|' + norm(b)]; }
  function findOpenThread(p, name) {
    var k = norm(name); if (!k) return null;
    var open = D.listThreads(p).filter(function (t) { return t.status === 'open'; });
    return open.filter(function (t) { return norm(t.name) === k; })[0] ||
      open.filter(function (t) { var n = norm(t.name); return n && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0); })[0] ||
      (T.nameSim ? open.filter(function (t) { return T.nameSim(t.name, k) >= 0.75; })[0] : null) || null;
  }

  /* ---------------- 提示词 ---------------- */
  function buildPrompt(p) {
    var ch = cards(p, 'character').slice(0, 60).map(function (c) {
      return '- ' + c.name + ((c.aliases || []).length ? '〔又称 ' + c.aliases.join('、') + '〕' : '') + (c.body ? '：' + String(c.body).slice(0, 40) : '');
    }).join('\n');
    var other = cards(p).filter(function (c) { return c.kind !== 'character' && c.kind !== 'relation'; }).slice(0, 60).map(function (c) { return c.name; }).join('、');
    var all = D.listThreads(p);
    var open = all.filter(function (t) { return t.status === 'open'; }).slice(0, 30).map(function (t) { return '- ' + t.name + (t.note ? '：' + String(t.note).slice(0, 60) : ''); }).join('\n');
    var rels = T.define && T.define.rels ? T.define.rels().slice(0, 40).map(function (r) { return r.a + ' —' + r.l + '— ' + r.b; }).join('；') : '';
    return '你是这部小说的「故事大脑」：读一段刚写出来的文字，把它对故事资料库的影响一次性整理出来。\n\n' +
      '【已有人物】\n' + (ch || '（无）') + '\n' +
      '【已有地点 / 名词】' + (other || '无') + '\n' +
      '【已有关系】' + (rels || '无') + '\n' +
      '【已记录的伏笔】' + (all.map(function (t) { return t.name; }).slice(0, 40).join('、') || '无') + '\n' +
      '【其中还没回收的】\n' + (open || '（无）') + '\n\n' +
      '只输出一个 tws 代码块，每行一条 JSON，不要任何解释：\n```tws\n' +
      '{"op":"add_lore","kind":"character|place|term","name":"正式名","body":"一句话，取自原文"}\n' +
      '{"op":"add_alias","name":"文中的称呼","of":"已有人物的正式名","sure":true}\n' +
      '{"op":"add_rel","a":"人物A","b":"人物B","l":"关系，不超过8个字"}\n' +
      '{"op":"add_thread","name":"线索名","note":"埋了什么、可能怎么回收"}\n' +
      '{"op":"resolve_thread","name":"照抄上面未回收列表里的名字","how":"一句话说怎么回收的"}\n' +
      '{"op":"add_event","when":"第二天清晨","who":"人物","what":"做了什么"}\n```\n\n' +
      '规则（按重要程度）：\n' +
      '1. 先认人：文中的简称、昵称、只写名不写姓、同音错字，只要指的是已有人物，就不是新人物。' +
      '这个称呼还不在「又称」里时，输出 add_alias；十分确定写 sure:true，有点拿不准写 sure:false。\n' +
      '2. 所有 a / b / who 一律写已有人物的正式名。\n' +
      '3. 关系只取文中明确写出或明显体现的（同学、师徒、暗恋、敌对……），已有且没变的不要重复；关系变了就输出新的。\n' +
      '4. 伏笔只取真正留了悬念的；回收只认真正揭晓或兑现的，仅仅又提到一次不算。\n' +
      '5. 时间线只取有明确时间感的事件。\n' +
      '6. 只取原文确实写到的，不要编造；没名字的路人不算；总共最多 10 条，宁少勿滥；什么都没有就输出空的 tws 代码块。';
  }
  function request(sys, user) {
    var s = S() || {};
    var ds = /deepseek/i.test((s.provider || '') + ' ' + (s.baseUrl || '') + ' ' + (s.model || ''));
    var body = { model: ds ? 'deepseek-flash' : s.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.2, stream: false, max_tokens: 1200 };
    if (ds) body.thinking = { type: 'disabled' };
    return fetch(String(s.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; });
  }
  function parse(txt) {
    if (T.ops && T.ops.parse) return T.ops.parse(txt).ops || [];
    var m = String(txt).match(/```tws\s*([\s\S]*?)```/), out = [];
    if (m) m[1].split('\n').forEach(function (l) { l = l.trim(); if (l.charAt(0) === '{') try { out.push(JSON.parse(l)); } catch (e) {} });
    return out;
  }

  /* ---------------- 整理：把模型输出变成计划 ----------------
     risk：low = 可直接写 · new = 新建条目 · ask = 必须问 */
  var KIND = { character: '人物', place: '地点', term: '名词' };
  function plan(raw, p) {
    var out = [], seen = {}, newNames = {}, batchAlias = {};
    raw.forEach(function (o) {
      if (o && o.op === 'add_lore' && o.kind === 'character' && o.name) newNames[norm(o.name)] = 1;
      if (o && o.op === 'add_alias' && o.name) { var r0 = resolve(o.of, p); if (r0 && r0.how === 'exact' && !saidNo(o.name, r0.card.name)) batchAlias[norm(o.name)] = r0.card.name; }
    });
    function canon(n) { var r = resolve(n, p); return r ? r.card.name : (batchAlias[norm(n)] || (newNames[norm(n)] ? String(n).trim() : null)); }
    function push(o, risk, label, key) { if (seen[key]) return; seen[key] = 1; o.risk = risk; o.label = label; out.push(o); }

    raw.forEach(function (o) {
      if (!o || !o.op) return;
      if (o.op === 'add_lore') {
        var n = String(o.name || '').trim(); if (!n) return;
        var kind = KIND[o.kind] ? o.kind : 'character';
        if (anyCard(n, p)) return;
        if (kind === 'character') {
          var r = resolve(n, p);
          if (r) {   /* 其实是已有人物的简称 */
            if (r.how === 'part' && !saidNo(n, r.card.name)) push({ op: 'add_alias', name: n, of: r.card.name, sure: false }, 'ask', '「' + n + '」是「' + r.card.name + '」吗？', 'al' + norm(n));
            return;
          }
        }
        push({ op: 'add_lore', kind: kind, name: n, body: o.body || '' }, kind === 'character' ? 'new' : 'low', KIND[kind] + '「' + n + '」', 'lo' + norm(n));
      } else if (o.op === 'add_alias') {
        var al = String(o.name || '').trim(), of = resolve(o.of, p);
        if (!al || !of || of.how !== 'exact') return;
        if (forms(of.card).some(function (f) { return norm(f) === norm(al); })) return;
        if (saidNo(al, of.card.name)) return;
        if (anyCard(al, p)) {   /* 已经有一张同名卡：多半是重复建了 */
          push({ op: 'add_alias', name: al, of: of.card.name, sure: false }, 'ask', '「' + al + '」是「' + of.card.name + '」吗？', 'al' + norm(al));
          return;
        }
        var sure = o.sure !== false && o.sure !== 'false';
        push({ op: 'add_alias', name: al, of: of.card.name, sure: sure }, sure ? 'low' : 'ask', sure ? '「' + al + '」记为「' + of.card.name + '」的简称' : '「' + al + '」是「' + of.card.name + '」吗？', 'al' + norm(al));
      } else if (o.op === 'add_rel') {
        if (!T.define || !T.define.addRel) return;
        var a = canon(o.a), b = canon(o.b), l = String(o.l || '').trim().slice(0, 10);
        if (!a || !b || a === b || !l) return;
        var ex = T.define.rels().filter(function (x) { return ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && x.l === l; })[0];
        if (ex) return;
        push({ op: 'add_rel', a: a, b: b, l: l }, 'low', '关系 ' + a + ' — ' + l + ' — ' + b, 're' + [a, b].sort().join('|'));
      } else if (o.op === 'add_thread') {
        var tn = String(o.name || '').trim(); if (!tn) return;
        if (D.listThreads(p).some(function (t) { return norm(t.name) === norm(tn); })) return;
        push({ op: 'add_thread', name: tn, note: o.note || '' }, 'new', '伏笔「' + tn + '」', 'th' + norm(tn));
      } else if (o.op === 'resolve_thread') {
        var th = findOpenThread(p, o.name); if (!th) return;
        push({ op: 'resolve_thread', id: th.id, name: th.name, how: o.how || '' }, 'low', '伏笔「' + th.name + '」已回收', 'rs' + th.id);
      } else if (o.op === 'add_event') {
        if (!o.what) return;
        var who = o.who ? (canon(o.who) || String(o.who)) : '';
        if (D.listEvents(p).some(function (e) { return norm(e.what) === norm(o.what); })) return;
        push({ op: 'add_event', when: o.when || '', who: who, what: o.what }, 'low', '时间线「' + (o.when ? o.when + ' · ' : '') + String(o.what).slice(0, 18) + '」', 'ev' + norm(o.what));
      }
    });
    /* 别名先写，后面的关系、事件才能认出人 */
    var order = { add_alias: 0, add_lore: 1, add_rel: 2, add_thread: 3, resolve_thread: 4, add_event: 5 };
    return out.sort(function (x, y) { return order[x.op] - order[y.op]; }).slice(0, 10);
  }

  /* ---------------- 写入与撤销 ---------------- */
  function applyOne(o, p, chId) {
    try {
      if (o.op === 'add_lore') {
        var c = D.addCard(p, o.kind, o.name, o.body || '', {}, []);
        if (o.kind === 'character') D.updateCard(c.id, { on: 1 });
        return { t: 'card', id: c.id };
      }
      if (o.op === 'add_alias') {
        var r = resolve(o.of, p); if (!r) return null;
        var dup = cards(p, 'character').filter(function (x) { return x.id !== r.card.id && norm(x.name) === norm(o.name); })[0];
        D.updateCard(r.card.id, { aliases: (r.card.aliases || []).concat(o.name) });
        var u = { t: 'alias', id: r.card.id, name: o.name };
        if (dup) {   /* 合并重复卡：人设补进来，删掉短的那张 */
          if (!r.card.body && dup.body) { u.body = r.card.body; D.updateCard(r.card.id, { body: dup.body }); }
          u.dup = JSON.parse(JSON.stringify(dup)); D.removeCard(dup.id);
        }
        return u;
      }
      if (o.op === 'add_rel') {
        var res = T.define.addRel(o.a, o.b, o.l); if (!res) return null;
        return { t: 'rel', a: res.a, b: res.b, prev: res.prev };
      }
      if (o.op === 'add_thread') { var t = D.addThread(p, o.name, o.note || '', chId || ''); return { t: 'thread', id: t.id }; }
      if (o.op === 'resolve_thread') {
        var th = D.listThreads(p).filter(function (x) { return x.id === o.id; })[0]; if (!th || th.status !== 'open') return null;
        var prev = { status: th.status, payoffChapter: th.payoffChapter, note: th.note };
        D.updateThread(th.id, { status: 'done', payoffChapter: th.payoffChapter || chId || '', note: o.how ? (th.note ? th.note + '\n' : '') + '【回收】' + o.how : th.note });
        return { t: 'tpatch', id: th.id, prev: prev };
      }
      if (o.op === 'add_event') { var e = D.addEvent(p, chId || '', o.when || '', o.who || '', o.what); return { t: 'event', id: e.id }; }
    } catch (err) { console.warn('[故事大脑] 写入失败', o, err); }
    return null;
  }
  function undoOne(u) {
    try {
      if (u.t === 'card') D.removeCard(u.id);
      else if (u.t === 'alias') {
        var c = D.D.cards.filter(function (x) { return x.id === u.id; })[0];
        if (c) { var patch = { aliases: (c.aliases || []).filter(function (a) { return a !== u.name; }) }; if ('body' in u) patch.body = u.body; D.updateCard(c.id, patch); }
        if (u.dup && !D.D.cards.some(function (x) { return x.id === u.dup.id; })) { D.D.cards.push(u.dup); if (D.save) D.save(); }
      }
      else if (u.t === 'rel') T.define && T.define.removeRel(u.a, u.b, u.prev);
      else if (u.t === 'thread') D.removeThread(u.id);
      else if (u.t === 'tpatch') D.updateThread(u.id, u.prev);
      else if (u.t === 'event') D.removeEvent(u.id);
    } catch (err) { console.warn('[故事大脑] 撤销失败', u, err); }
  }
  function refresh() { if (T.refreshViews) T.refreshViews(); }

  /* res = { applied:[{label,undo}], pending:[op], asks:[op], undone, done:[label] , chId } */
  function applyList(res, ops) {
    var p = pid(); if (!p) return [];
    var got = [];
    ops.forEach(function (o) { var u = applyOne(o, p, res.chId); if (u) { res.applied.push({ label: o.label.replace(/吗？$/, '').replace(/^「(.+)」是「(.+)」$/, '「$1」记为「$2」的简称'), undo: u }); got.push(o.label); } });
    refresh();
    return got;
  }

  /* ---------------- 主流程 ---------------- */
  var queue = Promise.resolve(), busy = 0;
  function run(text, ctx) {
    ctx = ctx || {};
    var mode = getMode(), p = pid();
    if (mode === 'off' || !p || !hasKey()) return Promise.resolve(null);
    busy++; paintDock();
    var job = queue.then(function () {
      return request(buildPrompt(p), String(text).slice(-5000));
    }).then(function (txt) {
      var ops = plan(parse(txt), p);
      var res = { applied: [], pending: [], asks: [], undone: false, chId: ctx.chapterId || (T.currentChapter ? T.currentChapter() : ''), source: ctx.source || 'reply', at: Date.now() };
      var now = [];
      ops.forEach(function (o) {
        if (o.risk === 'ask') res.asks.push(o);
        else if (mode === 'auto' || (mode === 'semi' && o.risk === 'low')) now.push(o);
        else res.pending.push(o);
      });
      applyList(res, now);
      return res;
    }).catch(function (e) { console.warn('[故事大脑]', e); return { applied: [], pending: [], asks: [], err: String(e && e.message || e) }; })
      .then(function (r) { busy--; paintDock(); return r; });
    queue = job.then(function () {}, function () {});
    return job;
  }
  function isEmpty(res) { return !res || (!res.applied.length && !res.pending.length && !res.asks.length); }

  /* ---------------- 结果卡（对话消息下 & 右下角浮层共用） ---------------- */
  function renderBox(box, res, onChange) {
    if (!res || res.err || isEmpty(res)) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    var h = '';
    if (res.applied.length) {
      h += '<div class="br-h' + (res.undone ? ' undone' : '') + '"><span>✦ ' + (res.undone ? '已撤销这次更新' : '故事大脑更新了 ' + res.applied.length + ' 处') + ' <span class="lat">Cerebrum</span></span>' +
        (res.undone ? '' : '<button type="button" class="br-btn" data-a="undo">撤销</button>') + '</div>';
      if (!res.undone) h += '<div class="br-tags">' + res.applied.map(function (x) { return '<span>' + esc(x.label) + '</span>'; }).join('') + '</div>';
    }
    res.asks.forEach(function (o, i) {
      h += '<div class="br-ask"><span>' + esc(o.label) + '</span><button type="button" class="br-btn on" data-a="yes" data-i="' + i + '">是</button><button type="button" class="br-btn" data-a="no" data-i="' + i + '">不是</button></div>';
    });
    if (res.pending.length) {
      h += '<div class="br-h"><span>✦ 还有 ' + res.pending.length + ' 条等你确认</span></div><div class="br-list">' +
        res.pending.map(function (o, i) { return '<label><input type="checkbox" data-k="' + i + '" checked> ' + esc(o.label) + '</label>'; }).join('') + '</div>' +
        '<div class="br-f"><button type="button" class="br-btn on" data-a="ok">写入所选</button><button type="button" class="br-btn" data-a="skip">忽略</button></div>';
    }
    box.innerHTML = h;
    box.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
      e.stopPropagation();
      var a = b.dataset.a;
      if (a === 'undo') {
        res.applied.slice().reverse().forEach(function (x) { undoOne(x.undo); });
        res.undone = true; refresh(); toast('已撤销这次更新');
      } else if (a === 'yes' || a === 'no') {
        var o = res.asks.splice(+b.dataset.i, 1)[0]; if (!o) return;
        if (a === 'yes') { if (res.undone) { res.applied = []; res.undone = false; } applyList(res, [o]); toast('记住了：' + o.name + ' 就是 ' + o.of); }
        else { my().no[norm(o.name) + '|' + norm(o.of)] = 1; saveMem(); toast('记住了，以后不再问'); }
      } else if (a === 'ok') {
        var sel = []; box.querySelectorAll('input[data-k]').forEach(function (x) { if (x.checked) sel.push(res.pending[+x.dataset.k]); });
        res.pending = [];
        if (res.undone) { res.applied = []; res.undone = false; }
        if (sel.length) { applyList(res, sel); toast('已写入 ' + sel.length + ' 条'); }
      } else if (a === 'skip') res.pending = [];
      renderBox(box, res, onChange);
      if (onChange) onChange(res);
    };
  }

  /* ---------------- 右下角浮层：章节保存时的结果 ---------------- */
  var dockRes = [];
  function dockEl() {
    var d = $('brainDock');
    if (!d) { d = document.createElement('div'); d.id = 'brainDock'; d.className = 'br-dock'; d.setAttribute('aria-live', 'polite'); document.body.appendChild(d); }
    return d;
  }
  function paintDock() {
    var d = dockEl();
    dockRes = dockRes.filter(function (r) { return !isEmpty(r) && !(r.undone && !r.asks.length && !r.pending.length && Date.now() - r.at > 4000); });
    var h = busy ? '<div class="br-card br-busy">✦ 故事大脑正在读这一段… <span class="lat">Cerebrum</span></div>' : '';
    d.innerHTML = h;
    dockRes.slice(-3).forEach(function (r) {
      var c = document.createElement('div'); c.className = 'br-card';
      var x = document.createElement('button'); x.type = 'button'; x.className = 'br-x'; x.setAttribute('aria-label', '收起'); x.textContent = '×';
      x.onclick = function () { dockRes = dockRes.filter(function (y) { return y !== r; }); paintDock(); };
      var box = document.createElement('div'); c.appendChild(x); c.appendChild(box); d.appendChild(c);
      if (r.title) { var t = document.createElement('div'); t.className = 'br-src'; t.textContent = r.title; c.insertBefore(t, box); }
      renderBox(box, r, function () { if (isEmpty(r)) paintDock(); });
    });
    d.classList.toggle('on', !!(busy || dockRes.length));
  }
  function pushDock(res, title) {
    if (isEmpty(res)) return;
    res.title = title; dockRes.push(res); paintDock();
    if (!res.asks.length && !res.pending.length) setTimeout(function () { dockRes = dockRes.filter(function (y) { return y !== res; }); paintDock(); }, 12000);
  }

  /* ---------------- 章节保存后自动读新写的部分 ---------------- */
  var recent = [], timers = {};
  function remember(text) { recent.push(norm(text)); if (recent.length > 12) recent.shift(); }
  function alreadyRead(part) {
    var k = norm(part); if (!k) return true;
    return recent.some(function (r) { return r && (r.indexOf(k) >= 0 || (k.indexOf(r) >= 0 && r.length > k.length * 0.7)); });
  }
  function chapterCheck(id) {
    var c = D.getChapter(id); if (!c) return;
    var m = my(), done = m.chap[id] || 0, txt = c.content || '';
    if (txt.length < done) { m.chap[id] = txt.length; saveMem(); return; }
    var part = txt.slice(done);
    if (part.replace(/\s/g, '').length < 300) return;
    m.chap[id] = txt.length; saveMem();
    if (alreadyRead(part)) return;   /* 采纳进来的 AI 回复，聊天里已经读过 */
    remember(part);
    run(part, { source: 'chapter', chapterId: id }).then(function (res) { if (res) pushDock(res, '来自「' + (c.title || '本章') + '」'); });
  }
  var origSave = D.saveChapterContent;
  D.saveChapterContent = function (id) {
    var r = origSave.apply(this, arguments);
    if (getMode() !== 'off' && hasKey()) { clearTimeout(timers[id]); timers[id] = setTimeout(function () { chapterCheck(id); }, 6000); }
    return r;
  };

  /* ---------------- 设置面板 ---------------- */
  function cfgHtml() {
    var m = getMode();
    return '<div class="st-luxrow br-cfg"><div class="k"><b>故事大脑 <span class="lat" style="font-size:15px;color:var(--mut)">Cerebrum</span></b>' +
      '<span>AI 每写完一段、或你保存一章，自动更新人物、简称、关系、伏笔（含回收）和时间线。每次会额外用少量 Token。</span>' +
      '<div class="br-seg" id="brMode">' + MODES.map(function (x) { return '<button type="button" data-m="' + x[0] + '" class="' + (x[0] === m ? 'on' : '') + '" title="' + esc(x[2]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<span class="br-desc" id="brModeDesc">' + esc(MODES.filter(function (x) { return x[0] === m; })[0][2]) + '</span></div></div>';
  }
  function bindCfg(root) {
    var seg = root.querySelector('#brMode'); if (!seg) return;
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-m]'); if (!b) return;
      setMode(b.dataset.m);
      seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      var d = root.querySelector('#brModeDesc'); if (d) d.textContent = MODES.filter(function (x) { return x[0] === b.dataset.m; })[0][2];
      toast('故事大脑：' + b.textContent);
    });
  }

  T.brain = { run: run, renderBox: renderBox, remember: remember, mode: getMode, setMode: setMode, cfgHtml: cfgHtml, bindCfg: bindCfg, isEmpty: isEmpty, _plan: plan, _apply: applyList, _undo: undoOne };
})();
