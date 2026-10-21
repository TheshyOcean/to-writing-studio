/* ============================================================================
   TWS · 入戏模式 Persona + 提纯 Distillatio（Beta V3.0.0，只在 desktop.html 加载）
   你扮演一个角色，AI 负责旁白和其他所有人；演完一场，经过「提纯」再决定写到哪里。
   - 入戏内容永远不会直接进书稿
   - 打括号说的话算戏外（导演指令 / 闲聊），不进书稿
   - 存档 / 读档：读档后，存档点之后的那段自动当成废稿
   - 提纯：模型逐条判断留 / 丢并给理由 → 改写成第三人称正文（对齐本书文风）→
     设定变化里「戏中即兴」的标成待确认，默认不写 → 你选：进本章草稿 / 存为备用素材 / 只更新设定
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;
  if (!D || !T.fun) return;
  var F = T.fun, esc = F.esc, $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function pid() { return D.D.activeProject; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* 一场戏：log 每条 = { k:'n'|'u'|'sys', t, off, discard, load, dice } */
  var st = null, busy = false;

  /* ---------------- 界面骨架 ---------------- */
  function mount() {
    var stage = $('stage'); if (!stage) return null;
    var el = $('pzStage'); if (el) return el;
    el = document.createElement('section'); el.id = 'pzStage'; el.className = 'pz'; el.setAttribute('aria-label', '入戏模式'); el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="pz-head"><div class="pz-who" id="pzWho"><b>入戏</b></div><span class="pz-tag">入戏 · Persona</span><span class="pz-sp"></span>' +
      '<button type="button" class="fn-btn" id="pzSave" hidden>存档</button><button type="button" class="fn-btn" id="pzLoad" hidden>读档</button>' +
      '<button type="button" class="fn-btn on" id="pzEnd" hidden>结束并提纯</button><button type="button" class="pz-x" id="pzClose" aria-label="退出入戏">×</button></div>' +
      '<div class="pz-body" id="pzBody"></div>' +
      '<div class="pz-foot" id="pzFoot" hidden><div class="pz-opts" id="pzOpts"></div>' +
      '<div class="pz-row"><label for="pzIn" class="fn-sr">以角色身份说话或行动</label><textarea class="fn-fld" id="pzIn" rows="1" placeholder="以角色身份说话或行动；打括号算戏外，比如（让他更凶一点）"></textarea>' +
      '<button type="button" class="fn-btn" id="pzDice" title="这一步掷骰判定">🎲</button><button type="button" class="fn-btn on" id="pzSend">行动</button></div>' +
      '<div class="pz-meta"><span>你只知道这个角色该知道的</span><span>（括号里的话）不进书稿 · 入戏内容要经过提纯才会写入</span></div></div>';
    stage.appendChild(el);
    $('pzClose').addEventListener('click', close);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !e.target.closest('textarea,input')) close(); });
    $('pzOpts').addEventListener('click', function (e) { var b = e.target.closest('button[data-o]'); if (b) act(b.textContent); });
    $('pzSend').addEventListener('click', function () { var v = $('pzIn').value.trim(); if (!v) return; $('pzIn').value = ''; act(v); });
    $('pzIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('pzSend').click(); } });
    $('pzDice').addEventListener('click', function () { if (!st) return; st.dice = st.dice ? 0 : 1 + Math.floor(Math.random() * 20); this.classList.toggle('on', !!st.dice); this.textContent = st.dice ? '🎲 ' + st.dice : '🎲'; });
    $('pzSave').addEventListener('click', function () { if (!st) return; st.save = { at: st.log.length, msgs: st.msgs.length, opts: st.opts.slice() }; sys('已存档'); $('pzLoad').hidden = false; });
    $('pzLoad').addEventListener('click', load);
    $('pzEnd').addEventListener('click', distill);
    $('pzBody').addEventListener('click', function (e) {
      var r = e.target.closest('[data-role]'); if (r) { start(r.dataset.role); return; }
      var n = e.target.closest('#pzNewGo'); if (n) { var v = $('pzNewName').value.trim(); start(v || '外乡人', true, $('pzNewWho').value.trim()); return; }
      var sp = e.target.closest('[data-spare]'); if (sp) { var it = spare()[+sp.dataset.spare]; if (it && navigator.clipboard) navigator.clipboard.writeText(it.t).then(function () { F.toast('已复制这段素材'); }); }
    });
    return el;
  }
  function open() {
    if (!pid()) { F.toast('先在书稿里建一本书'); return; }
    var el = mount(); if (!el) return;
    el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
    if (!st) pick();
  }
  function close() { var el = $('pzStage'); if (!el) return; el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
  function body() { return $('pzBody'); }
  function chrome(playing) { $('pzFoot').hidden = !playing; $('pzEnd').hidden = !playing; $('pzSave').hidden = !playing; $('pzLoad').hidden = !(playing && st && st.save); }

  /* ---------------- 选角 ---------------- */
  function spare() { var m = F.store.my(); return m.spare || (m.spare = []); }
  function pick() {
    var cs = D.listCards(pid(), 'character');
    body().innerHTML = '<div class="pz-pick"><div class="pz-eye">入戏 <span class="lat">Persona</span></div><h2>这一场，你是谁？</h2>' +
      '<p>选一个角色进入《' + esc(F.bookName()) + '》。AI 负责旁白和其他所有人，你只管用这个角色去说、去做。演完点「结束并提纯」，挑出精华再决定写到哪里——入戏的内容不会直接进书稿。</p>' +
      '<label class="pz-l" for="pzScene">这一场从哪里开始（可不填，默认接着当前章节）</label><input class="fn-fld" id="pzScene" placeholder="例如：深夜，灯塔顶层，雨很大" autocomplete="off">' +
      '<div class="pz-roles">' + cs.map(function (c) {
        return '<button type="button" class="pz-role" data-role="' + esc(c.name) + '"><div class="fn-por">' + F.portrait(c.name) + '</div><b>' + esc(c.name) + '</b><span>' + esc(((c.attrs || {})['身份'] || String(c.body || '').slice(0, 30)) || '设定库里的人物') + '</span></button>';
      }).join('') +
      '<div class="pz-role pz-new"><b>＋ 新角色</b><label class="fn-sr" for="pzNewName">新角色名字</label><input class="fn-fld" id="pzNewName" placeholder="名字，例如：外乡人" autocomplete="off"><label class="fn-sr" for="pzNewWho">一句话身份</label><input class="fn-fld" id="pzNewWho" placeholder="一句话身份（可不填）" autocomplete="off"><button type="button" class="fn-btn on" id="pzNewGo">用这个身份入戏</button></div>' +
      '</div>' + (cs.length ? '' : '<p class="pz-note">设定库里还没有人物，可以先用「新角色」入戏。</p>') +
      (spare().length ? '<div class="pz-spare"><div class="pz-l">备用素材（点一下复制）</div>' + spare().slice(-6).reverse().map(function (x, i) { var idx = spare().length - 1 - i; return '<button type="button" data-spare="' + idx + '"><b>' + esc(x.title) + '</b><span>' + esc(x.t.slice(0, 60)) + '…</span></button>'; }).join('') + '</div>' : '') +
      '</div>';
    $('pzWho').innerHTML = '<b>入戏</b>'; chrome(false);
  }

  /* ---------------- 旁白（模型） ---------------- */
  function sysPrompt() {
    var p = pid(), me = st.who;
    var cards = D.listCards(p).filter(function (c) { return c.kind !== 'relation'; }).slice(0, 40).map(function (c) { return '- ' + F.cardLine(c); }).join('\n');
    var open = D.listThreads(p).filter(function (t) { return t.status === 'open'; }).slice(0, 15).map(function (t) { return '- ' + t.name + (t.note ? '：' + String(t.note).slice(0, 60) : ''); }).join('\n');
    return '你是互动小说的旁白兼主持人。作者正在用角色「' + me + '」' + (st.isNew ? '（新角色：' + (st.newWho || '刚来到这里的人') + '）' : '') + '亲自进入他写的小说《' + F.bookName() + '》，你负责世界和其他所有人物。\n\n' +
      '【设定】\n' + (cards || '（暂无）') + '\n【人物关系】\n' + (F.relsOf().join('\n') || '（暂无）') + '\n【还没揭开的伏笔（只有你知道，玩家角色不一定知道）】\n' + (open || '（暂无）') + '\n' +
      (F.chapterTail(1500) ? '【故事目前写到】\n' + F.chapterTail(1500) + '\n' : '') +
      (st.scene ? '【这一场的开场】' + st.scene + '\n' : '') + '\n' +
      '规则：\n' +
      '1. 用第二人称「你」称呼玩家角色；其他人物严格按人设说话做事；对白用中文引号。\n' +
      '2. 绝不替玩家决定他说什么、想什么、做什么；只描写世界的反应，然后停下来等他。\n' +
      '3. 玩家角色只知道他该知道的：伏笔的真相不要在旁白里直接说破，只能通过别人的言行、线索慢慢露出来，让玩家自己问出来、查出来。\n' +
      '4. 每次 2~5 句，有画面、有声音、有气味，节奏紧；在一个能让玩家做选择的地方停住。\n' +
      '5. 玩家用括号说的话是戏外：可能是导演指令（照做，调整后面的走向），也可能是闲聊；这时 n 只用一句括号话简短回应，不推进剧情。\n' +
      '6. 消息里带「[掷骰 x/20]」时，按点数判定这次行动的成败（1~5 失败、6~14 部分成功、15~20 成功），在叙述里体现。\n' +
      '7. 不要突然引入和现有设定冲突的大设定；需要即兴补的小细节可以补。\n\n' +
      '只输出 JSON：{"n":"这一轮的叙述","o":["可选行动1","可选行动2","可选行动3"]}（选项是玩家角色可能做的事，每个不超过 14 个字）';
  }
  function narrate() {
    busy = true; var w = typing();
    return F.llm([{ role: 'system', content: sysPrompt() }].concat(st.msgs.slice(-24)), { temperature: 0.95, max_tokens: 600 })
      .then(function (txt) {
        var j = F.json(txt) || { n: String(txt || '').trim(), o: [] };
        st.msgs.push({ role: 'assistant', content: JSON.stringify({ n: j.n, o: j.o }) });
        w.remove(); line('n', String(j.n || '……'), { off: st.lastOff });
        opts((j.o || []).slice(0, 4));
      }).catch(function (e) {
        w.remove(); st.msgs.pop(); sys(e.message === 'NO_KEY' ? '先在「系统配置」填 API Key' : '旁白没接上：' + e.message + '，再试一次');
      }).then(function () { busy = false; });
  }
  function start(name, isNew, newWho) {
    if (!F.store) return;
    st = { who: name, isNew: !!isNew, newWho: newWho || '', scene: ($('pzScene') && $('pzScene').value.trim()) || '', log: [], msgs: [], opts: [], save: null, dice: 0, chId: T.currentChapter ? T.currentChapter() : D.D.activeChapter };
    $('pzWho').innerHTML = '<div class="fn-por">' + F.portrait(name) + '</div><div><b>' + esc(name) + '</b><small>《' + esc(F.bookName()) + '》 · 入戏中</small></div>';
    body().innerHTML = '<div class="pz-log" id="pzLog"></div>'; chrome(true);
    sys('入戏 · 你是' + name + '。打括号说的话算戏外，不进书稿');
    st.msgs.push({ role: 'user', content: '（开场：请描述「' + name + '」所在的场景，然后停在一个可以行动的地方。）' });
    narrate();
  }
  function act(text) {
    if (!st || busy || !text) return;
    var off = /^[（(]/.test(text.trim());
    var dice = st.dice; st.dice = 0; var db = $('pzDice'); db.classList.remove('on'); db.textContent = '🎲';
    line('u', text + (dice && !off ? '  🎲 ' + dice : ''), { off: off, dice: dice });
    st.lastOff = off;
    st.msgs.push({ role: 'user', content: text + (dice && !off ? ' [掷骰 ' + dice + '/20]' : '') });
    opts([]); narrate();
  }
  function load() {
    if (!st || !st.save || busy) return;
    st.log.forEach(function (e, i) { if (i >= st.save.at && e.k !== 'sys') e.discard = 1; });
    st.msgs = st.msgs.slice(0, st.save.msgs);
    line('u', '读档：回到存档点', { load: 1, off: true });
    sys('已读档 · 之后那段会当成废稿，不进提纯'); opts(st.save.opts);
  }

  /* ---------------- 记录与渲染 ---------------- */
  function line(k, t, f) {
    var e = { k: k, t: t }; Object.keys(f || {}).forEach(function (x) { e[x] = f[x]; }); st.log.push(e);
    var L = $('pzLog'); if (!L) return;
    var d = document.createElement('div'); d.className = 'pz-' + k + (e.off ? ' off' : '');
    d.textContent = t; L.appendChild(d); scroll();
  }
  function sys(t) { var L = $('pzLog'); if (!L) return; var d = document.createElement('div'); d.className = 'pz-sys'; d.textContent = t; L.appendChild(d); scroll(); }
  function typing() { var L = $('pzLog'), d = document.createElement('div'); d.className = 'pz-n pz-wait'; d.innerHTML = '<span class="fn-typing">旁白正在落笔</span>'; L.appendChild(d); scroll(); return d; }
  function opts(list) { st.opts = list || []; $('pzOpts').innerHTML = st.opts.map(function (o) { return '<button type="button" data-o>' + esc(o) + '</button>'; }).join(''); }
  function scroll() { var b = body(); b.scrollTo({ top: b.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); }

  /* ============================================================
     提纯
     ============================================================ */
  function distill() {
    if (!st || busy) return;
    var items = st.log.filter(function (e) { return e.k !== 'sys'; }).map(function (e, i) {
      var who = e.k === 'u' ? '你' : '旁白', pre = e.load ? '读档' : e.off ? '戏外' : e.discard ? '读档前的废稿' : '';
      return { i: i + 1, who: who, t: e.t, keep: !pre, why: pre, fixed: !!pre };
    });
    var cand = items.filter(function (x) { return !x.fixed; });
    if (cand.length < 2) { F.toast('这一场还太短，再演几步吧'); return; }
    busy = true; sys('故事大脑正在提纯这一场…');
    var style = F.chapterTail(1000);
    var sysP = '你是严格的小说编辑，负责把一场「互动角色扮演」提纯成可以放进小说的正文。宁缺毋滥：聊嗨的、重复的、出戏的，一概不要。\n\n' +
      '书名：《' + F.bookName() + '》；作者扮演的角色：「' + st.who + '」' + (st.isNew ? '（新角色：' + (st.newWho || '') + '）' : '') + '\n' +
      (style ? '本书文风样本（照这个文风写）：\n' + style + '\n' : '') +
      '【已有设定】' + D.listCards(pid()).map(function (c) { return c.name; }).slice(0, 60).join('、') + '\n\n' +
      '任务：\n' +
      '1. 逐条判断留还是丢。丢掉：闲聊玩笑、出戏的话、反复试探同一件事的冗余、没有推动剧情或塑造人物的内容、和既有设定冲突的胡闹。保留：推动剧情的行动、有分量的对白、新揭开的信息、关系变化、有画面感的描写。丢的要给一个不超过 8 个字的理由。\n' +
      '2. 只用保留的内容，改写成第三人称的小说正文（「你」改成「' + st.who + '」）：去掉口水话，补上必要的动作和环境衔接，对齐文风；绝对不要编造互动里没有发生的情节。分成若干段，每段标出它来自哪几条（src 用条目编号）。\n' +
      '3. 列出这场戏带来的设定变化，用 tws 指令格式：add_lore / add_alias / add_rel / add_thread / resolve_thread / add_event。互动里旁白即兴编出、或作者随口说出、原有设定里没有依据的「新事实」，加 "pending":true（待作者确认）。\n\n' +
      '只输出 JSON：{"drop":[{"i":3,"why":"闲聊"}],"prose":[{"t":"一段正文","src":[1,2]}],"ops":[{"op":"add_rel","a":"甲","b":"乙","l":"关系"},{"op":"add_lore","kind":"character","name":"…","body":"…","pending":true}]}\n' +
      '没列进 drop 的条目视为保留。';
    var user = cand.map(function (x) { return '[' + x.i + '] ' + x.who + '：' + x.t; }).join('\n');
    F.llm([{ role: 'system', content: sysP }, { role: 'user', content: user }], { temperature: 0.3, max_tokens: 2400 })
      .then(function (txt) {
        var j = F.json(txt); if (!j || !j.prose) throw new Error('提纯结果没解析出来');
        (j.drop || []).forEach(function (d) { var it = items.filter(function (x) { return x.i === +d.i; })[0]; if (it && !it.fixed) { it.keep = false; it.why = String(d.why || '不推动剧情').slice(0, 12); } });
        report(items, (j.prose || []).filter(function (p) { return p && p.t; }), (j.ops || []).filter(function (o) { return o && o.op; }));
      }).catch(function (e) { sys('提纯失败：' + (e.message === 'NO_KEY' ? '先在系统配置填 API Key' : e.message) + '，再点一次「结束并提纯」'); })
      .then(function () { busy = false; });
  }

  function opLabel(o) {
    if (o.op === 'add_lore') return ({ character: '人物', place: '地点', term: '名词' }[o.kind] || '设定') + '「' + o.name + '」' + (o.body ? '：' + String(o.body).slice(0, 24) : '');
    if (o.op === 'add_alias') return '「' + o.name + '」是「' + o.of + '」的简称';
    if (o.op === 'add_rel') return '关系：' + o.a + ' — ' + o.l + ' — ' + o.b;
    if (o.op === 'add_thread') return '新伏笔「' + o.name + '」';
    if (o.op === 'resolve_thread') return '伏笔「' + o.name + '」回收';
    if (o.op === 'add_event') return '时间线：' + (o.when ? o.when + ' · ' : '') + String(o.what || '').slice(0, 20);
    return o.op;
  }
  function report(items, prose, ops) {
    var kept = items.filter(function (x) { return x.keep; }).length;
    var words = prose.reduce(function (a, p) { return a + String(p.t).replace(/\s/g, '').length; }, 0);
    chrome(false);
    body().innerHTML = '<div class="pr">' +
      '<div class="pr-top"><div><div class="pz-eye">提纯报告 <span class="lat">Distillatio</span></div><h2>这一场留下了什么</h2></div>' +
      '<div class="pr-stat"><div><b>' + items.length + '</b>条互动</div><div><b>' + kept + '</b>条保留</div><div class="hot"><b id="prWords">' + words + '</b>字正文</div></div></div>' +
      '<div class="pr-grid"><div class="pr-col"><div class="pr-h">原始互动 <span class="lat">Acta</span><span class="r">灰掉的不进书稿，可以捞回</span></div><div id="prRaw">' +
      items.map(function (x) {
        return '<div class="pr-item' + (x.keep ? '' : ' drop') + '" data-i="' + x.i + '"><span class="no">' + x.i + '</span><span class="tx"><em>' + x.who + '：</em>' + esc(x.t.length > 70 ? x.t.slice(0, 70) + '…' : x.t) + '</span>' +
          (x.keep ? '' : '<span class="why">' + esc(x.why) + '</span>' + (x.fixed && x.why === '读档' ? '' : '<button type="button" class="tog" data-back="' + x.i + '">捞回</button>')) + '</div>';
      }).join('') + '</div></div>' +
      '<div class="pr-right"><div class="pr-col"><div class="pr-h">提纯后的正文 <span class="lat">Textus</span><span class="r">第三人称 · 对齐本书文风</span></div><div class="pr-prose" id="prProse">' +
      prose.map(function (p, k) { return '<div class="pr-p" data-src="' + (p.src || []).join(',') + '"><p contenteditable="true" spellcheck="false">' + esc(p.t) + '</p><span class="pr-src">' + (p.src || []).join('·') + '</span><button type="button" class="tog" data-cut="' + k + '">去掉</button></div>'; }).join('') +
      '</div><span class="pr-note">正文可以直接点进去改。</span></div>' +
      '<div class="pr-col"><div class="pr-h">设定变化 <span class="lat">Cerebrum</span></div><div class="pr-set" id="prSet">' +
      (ops.length ? ops.map(function (o, k) { return '<label><input type="checkbox" data-op="' + k + '"' + (o.pending ? '' : ' checked') + '> ' + esc(opLabel(o)) + (o.pending ? ' <span class="pend">戏中设定 · 待确认</span>' : '') + '</label>'; }).join('') : '<span class="pr-note">这一场没有带来新的设定。</span>') +
      '</div></div></div></div>' +
      '<div class="pr-out"><span class="pr-h">写到哪里</span><div class="seg" id="prSeg"><button type="button" class="on" data-o="draft">进本章草稿</button><button type="button" data-o="spare">存为备用素材</button><button type="button" data-o="lore">只更新设定</button></div><span class="pz-sp"></span>' +
      '<button type="button" class="fn-btn" id="prBack">回到戏里</button><button type="button" class="fn-btn on" id="prOk">确认写入</button></div></div>';
    var raw = $('prRaw'), pr = $('prProse');
    function light(i) {
      raw.querySelectorAll('.pr-item').forEach(function (x) { x.classList.toggle('lit', !!i && x.dataset.i === String(i)); });
      pr.querySelectorAll('.pr-p').forEach(function (x) { x.classList.toggle('lit', !!i && x.dataset.src.split(',').indexOf(String(i)) >= 0); });
    }
    raw.addEventListener('mouseover', function (e) { var it = e.target.closest('.pr-item'); light(it && it.dataset.i); });
    raw.addEventListener('mouseleave', function () { light(null); });
    pr.addEventListener('mouseover', function (e) { var p = e.target.closest('.pr-p'); if (!p) return; raw.querySelectorAll('.pr-item').forEach(function (x) { x.classList.toggle('lit', p.dataset.src.split(',').indexOf(x.dataset.i) >= 0); }); });
    pr.addEventListener('mouseleave', function () { light(null); });
    raw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-back]'); if (!b) return;
      var it = items.filter(function (x) { return x.i === +b.dataset.back; })[0]; if (!it) return;
      it.keep = true; var row = b.parentNode; row.classList.remove('drop'); row.querySelector('.why').textContent = '已捞回'; b.remove();
      var d = document.createElement('div'); d.className = 'pr-p back'; d.dataset.src = String(it.i);
      d.innerHTML = '<p contenteditable="true" spellcheck="false">' + esc(it.t) + '</p><span class="pr-src">' + it.i + ' · 捞回，可直接改</span>';
      pr.appendChild(d); count();
    });
    pr.addEventListener('click', function (e) { var b = e.target.closest('[data-cut]'); if (!b) return; var p = b.parentNode; p.classList.toggle('cut'); b.textContent = p.classList.contains('cut') ? '恢复' : '去掉'; count(); });
    pr.addEventListener('input', count);
    function count() { $('prWords').textContent = text().replace(/\s/g, '').length; }
    function text() { return [].slice.call(pr.querySelectorAll('.pr-p:not(.cut) p')).map(function (p) { return p.textContent.trim(); }).filter(Boolean).join('\n\n'); }
    $('prSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    $('prBack').addEventListener('click', function () {
      body().innerHTML = '<div class="pz-log" id="pzLog"></div>'; chrome(true);
      st.log.forEach(function (e) { if (e.k === 'sys') return; var L = $('pzLog'), d = document.createElement('div'); d.className = 'pz-' + e.k + (e.off ? ' off' : '') + (e.discard ? ' gone' : ''); d.textContent = e.t; L.appendChild(d); });
      sys('回到戏里'); opts(st.opts);
    });
    $('prOk').addEventListener('click', function () {
      var mode = document.querySelector('#prSeg .on').dataset.o, out = text(), msg = [];
      var chosen = [].slice.call(document.querySelectorAll('#prSet input[data-op]')).filter(function (x) { return x.checked; }).map(function (x) { var o = ops[+x.dataset.op]; var c = {}; Object.keys(o).forEach(function (k) { if (k !== 'pending') c[k] = o[k]; }); return c; });
      if (mode === 'draft') {
        var ch = st.chId && D.getChapter(st.chId);
        if (!ch) { F.toast('先在书稿里打开一章，再写进草稿'); return; }
        if (!out) { F.toast('正文是空的'); return; }
        if (T.brain && T.brain.remember) T.brain.remember(out);   /* 设定变化下面单独写，这段不让故事大脑重复读 */
        D.saveChapterContent(ch.id, (ch.content ? ch.content.replace(/\s+$/, '') + '\n\n' : '') + out, '入戏写入前');
        msg.push('已写进「' + ch.title + '」草稿 · ' + out.replace(/\s/g, '').length + ' 字');
      } else if (mode === 'spare') {
        if (!out) { F.toast('正文是空的'); return; }
        spare().push({ title: st.who + ' · ' + new Date().toLocaleDateString('zh-CN'), t: out, at: Date.now() }); F.store.save();
        msg.push('已存为备用素材（入戏首页可以找到）');
      }
      var n = 0;
      if (chosen.length && T.brain && T.brain._plan) {
        var planned = T.brain._plan(chosen, pid()), res = { applied: [], pending: [], asks: [], chId: st.chId };
        T.brain._apply(res, planned.filter(function (o) { return o.risk !== 'ask'; })); n = res.applied.length;
      }
      msg.push(n ? '更新了 ' + n + ' 条设定' : '设定没有变化');
      if (T.refreshViews) T.refreshViews();
      body().innerHTML = '<div class="pr-done"><b>✦ ' + esc(msg[0]) + '</b><span>' + esc(msg.slice(1).join(' · ')) + (ops.some(function (o) { return o.pending; }) ? ' · 待确认的戏中设定只有勾选了才会写入' : '') + '</span><div class="pr-f"><button type="button" class="fn-btn" id="prAgain">再入一场</button><button type="button" class="fn-btn on" id="prClose">回到书桌</button></div></div>';
      $('prClose').addEventListener('click', function () { st = null; close(); });
      $('prAgain').addEventListener('click', function () { st = null; pick(); });
      F.shoot(['新的一段！', '这段是演出来的吧', '更新了更新了'], true);
    });
  }

  T.persona = { open: open, close: close };
})();
