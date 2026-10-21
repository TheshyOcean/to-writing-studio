/* ============================================================================
   TWS · 入戏模式 Persona（三方分离）+ 提纯 Distillatio — Beta V3.1.0，只在 desktop.html 加载
   你扮演一个角色进入自己的小说：
   - 旁白归旁白：只在你点「✦ AI 写旁白」「✎ 我来写旁白」或开了「自动旁白」时推进
   - 角色归角色：你对谁说话，谁就用自己的独立对话回你；每个角色只知道自己在场时看到、听到的事
   - 角色的动作由模型单独输出，显示成居中的灰色提示条；台词放在气泡里
   - 你的动作写在（）里；「戏外」按钮发的话不进书稿，角色也听不见
   - 入戏内容永远不会直接进书稿：结束后经过提纯（对白保留原话、旁白改写润色、
     戏中即兴设定待确认），由你选择进本章草稿 / 存为备用素材 / 只更新设定
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;
  if (!D || !T.fun) return;
  var F = T.fun, esc = F.esc, $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function pid() { return D.D.activeProject; }

  /* log 每条：{k:'n'|'u'|'c'|'sys', t, who, segs, to, off, mine, discard, load} */
  var st = null, busy = false;
  var HUES = ['#b4782f', '#3f7a8a', '#6f63e6', '#a0527a', '#4f8a4a', '#8a6a3a', '#5d6fb8', '#b0563f'];
  function hue(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return HUES[Math.abs(h) % HUES.length]; }
  function card(name) { return pid() ? D.listCards(pid(), 'character').filter(function (c) { return c.name === name || (c.aliases || []).indexOf(name) >= 0; })[0] : null; }

  /* ---------------- 界面骨架 ---------------- */
  function mount() {
    var stage = $('stage'); if (!stage) return null;
    var el = $('pzStage'); if (el) return el;
    el = document.createElement('section'); el.id = 'pzStage'; el.className = 'pz'; el.setAttribute('aria-label', '入戏模式'); el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="pz-head"><div class="pz-who" id="pzWho"><b>入戏</b></div><span class="pz-tag">入戏 · Persona</span><span class="pz-sp"></span>' +
        '<button type="button" class="fn-btn" id="pzSave" hidden>存档</button><button type="button" class="fn-btn" id="pzLoad" hidden>读档</button>' +
        '<button type="button" class="fn-btn on" id="pzEnd" hidden>结束并提纯</button><button type="button" class="pz-x" id="pzClose" aria-label="退出入戏">×</button></div>' +
      '<div class="pz-body" id="pzBody"></div>' +
      '<div class="pz-foot" id="pzFoot" hidden>' +
        '<div class="pz-cast" id="pzCast"></div>' +
        '<div class="pz-bar"><button type="button" class="fn-btn" id="pzNarr">✦ AI 写旁白</button><button type="button" class="fn-btn" id="pzMine">✎ 我来写旁白</button><span class="pz-sp"></span>' +
          '<label class="pz-sw"><input type="checkbox" id="pzAuto"> 自动旁白</label></div>' +
        '<div class="pz-mine" id="pzMineBox" hidden><label class="fn-sr" for="pzMineIn">自己写旁白</label><input class="fn-fld" id="pzMineIn" placeholder="写一段旁白，或只写一句方向，比如：楼下突然传来敲门声" autocomplete="off">' +
          '<button type="button" class="fn-btn" id="pzMineUse">直接用</button><button type="button" class="fn-btn on" id="pzMineAi">AI 扩写</button></div>' +
        '<div class="pz-row"><button type="button" class="pz-sq" id="pzParen" title="插入动作括号">（ ）</button>' +
          '<label for="pzIn" class="fn-sr">以角色身份说话，括号里写动作</label><textarea class="fn-fld" id="pzIn" rows="1" placeholder="说点什么，（括号里写动作）；@名字 可以点名"></textarea>' +
          '<button type="button" class="pz-sq" id="pzDice" title="这一步掷骰判定">🎲</button>' +
          '<button type="button" class="pz-sq" id="pzOff" aria-pressed="false" title="这句是戏外话：不进书稿，角色也听不见">戏外</button>' +
          '<button type="button" class="pz-sq go" id="pzSend">说</button></div>' +
        '<div class="pz-meta"><span>角色只知道自己在场时看到、听到的事</span><span>入戏内容要经过提纯才会写进书稿</span></div>' +
      '</div>';
    stage.appendChild(el);
    $('pzClose').addEventListener('click', close);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !(e.target.closest && e.target.closest('textarea,input'))) close(); });
    $('pzCast').addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (!b || !st) return; st.target = b.dataset.t; paintCast(); $('pzIn').focus(); });
    $('pzSend').addEventListener('click', function () {
      var v = $('pzIn').value.trim(); if (!v || !st) return;
      if (busy) { F.toast('还在写，稍等一下'); return; }
      $('pzIn').value = ''; send(v);
    });
    $('pzIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('pzSend').click(); } });
    $('pzParen').addEventListener('click', function () {
      var ta = $('pzIn'), s = ta.selectionStart, en = ta.selectionEnd, v = ta.value, sel = v.slice(s, en);
      ta.value = v.slice(0, s) + '（' + sel + '）' + v.slice(en); ta.focus();
      var p = s + 1 + sel.length + (sel ? 1 : 0); ta.setSelectionRange(p, p);
    });
    $('pzOff').addEventListener('click', function () { if (!st) return; st.off = !st.off; this.classList.toggle('on', st.off); this.setAttribute('aria-pressed', st.off); });
    $('pzDice').addEventListener('click', function () { if (!st) return; st.dice = st.dice ? 0 : 1 + Math.floor(Math.random() * 20); this.classList.toggle('on', !!st.dice); this.textContent = st.dice ? '🎲 ' + st.dice : '🎲'; });
    $('pzNarr').addEventListener('click', function () { if (busy) { F.toast('还在写，稍等一下'); return; } narrate(); });
    $('pzMine').addEventListener('click', function () { var m = $('pzMineBox'); m.hidden = !m.hidden; if (!m.hidden) $('pzMineIn').focus(); });
    $('pzMineUse').addEventListener('click', function () { var v = $('pzMineIn').value.trim(); if (!v) return; $('pzMineIn').value = ''; $('pzMineBox').hidden = true; line({ k: 'n', t: v, mine: true }); autoAfter(false); });
    $('pzMineAi').addEventListener('click', function () { var v = $('pzMineIn').value.trim(); if (!v) return; if (busy) { F.toast('还在写，稍等一下'); return; } $('pzMineIn').value = ''; $('pzMineBox').hidden = true; narrate(v); });
    $('pzMineIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('pzMineAi').click(); } });
    $('pzAuto').addEventListener('change', function () { if (st) st.auto = this.checked; });
    $('pzSave').addEventListener('click', function () { if (!st) return; st.save = snap(); sys('已存档'); $('pzLoad').hidden = false; });
    $('pzLoad').addEventListener('click', load);
    $('pzEnd').addEventListener('click', distill);
    $('pzBody').addEventListener('click', function (e) {
      var r = e.target.closest('[data-role]'); if (r) { start(r.dataset.role); return; }
      var n = e.target.closest('#pzNewGo'); if (n) { start($('pzNewName').value.trim() || '外乡人', true, $('pzNewWho').value.trim()); return; }
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
  function setBusy(b) { busy = b; ['pzSend', 'pzNarr', 'pzMineAi'].forEach(function (id) { var e = $(id); if (e) e.disabled = b; }); }

  /* ---------------- 选角 ---------------- */
  function spare() { var m = F.store.my(); return m.spare || (m.spare = []); }
  function pick() {
    var cs = D.listCards(pid(), 'character');
    body().innerHTML = '<div class="pz-pick"><div class="pz-eye">入戏 <span class="lat">Persona</span></div><h2>这一场，你是谁？</h2>' +
      '<p>选一个角色进入《' + esc(F.bookName()) + '》。你对谁说话，谁就用自己的口吻回你；旁白只在你需要时推进。演完点「结束并提纯」，挑出精华再决定写到哪里——入戏的内容不会直接进书稿。</p>' +
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

  /* ---------------- 书的资料 ---------------- */
  function lore() {
    var p = pid();
    var cards = D.listCards(p).filter(function (c) { return c.kind !== 'relation'; }).slice(0, 40).map(function (c) { return '- ' + F.cardLine(c); }).join('\n');
    var open = D.listThreads(p).filter(function (t) { return t.status === 'open'; }).slice(0, 15).map(function (t) { return '- ' + t.name + (t.note ? '：' + String(t.note).slice(0, 60) : ''); }).join('\n');
    return { cards: cards, open: open };
  }
  function sceneText(from, forWho) {
    /* 某个角色视角下发生过的事：只算他在场之后、非戏外、非废稿 */
    return st.log.slice(from || 0).filter(function (e) { return e.k !== 'sys' && !e.off && !e.discard; }).slice(-30).map(function (e) {
      if (e.k === 'n') return '【旁白】' + e.t;
      if (e.k === 'u') return '【' + st.who + (e.to ? ' 对 ' + e.to : '') + '】' + e.t;
      return '【' + e.who + '】' + segText(e.segs);
    }).join('\n');
  }
  function segText(segs) { return (segs || []).map(function (s) { return s.a ? '（' + s.a + '）' : '「' + s.s + '」'; }).join(''); }

  /* ---------------- 旁白 ---------------- */
  function narrPrompt(direction, opening) {
    var L = lore();
    return '你是互动小说的旁白。作者正在用角色「' + st.who + '」' + (st.isNew ? '（新角色：' + (st.newWho || '刚来到这里的人') + '）' : '') + '亲自进入他写的小说《' + F.bookName() + '》。\n' +
      '你只负责旁白：环境、气氛、局面的推进、有人进场或离场。角色的台词由角色自己说，你不要替任何角色说长段对白（一句简短的呼喊可以）。\n\n' +
      '【设定】\n' + (L.cards || '（暂无）') + '\n【人物关系】\n' + (F.relsOf().join('\n') || '（暂无）') + '\n【还没揭开的伏笔（只有你知道）】\n' + (L.open || '（暂无）') + '\n' +
      (F.chapterTail(1500) ? '【故事目前写到】\n' + F.chapterTail(1500) + '\n' : '') +
      (st.scene ? '【这一场的开场】' + st.scene + '\n' : '') +
      '【当前在场】' + (st.cast.join('、') || '（无）') + '\n\n' +
      '规则：\n1. 用第二人称「你」称呼「' + st.who + '」；绝不替他决定说什么、想什么、做什么。\n' +
      '2. 2~5 句，有画面、声音、气味，节奏紧，停在一个能让他行动或开口的地方。\n' +
      '3. 伏笔的真相不要直接说破，只能让线索慢慢露出来。\n' +
      '4. 消息里的掷骰点数（1~5 失败、6~14 部分成功、15~20 成功）要体现在结果里。\n' +
      (direction ? '5. 作者给了这一段的方向，严格照这个方向写，不要偏离、不要加戏：' + direction + '\n' : '') +
      (opening ? '5. 这是开场：描写「' + st.who + '」所在的场景，并决定一开始有哪些角色在场（可以没有）。\n' : '') +
      '\n只输出 JSON：{"n":"旁白","cast":["此刻在场的全部其他角色名"],"enter":{"新进场的人名":"一句话说明他是谁"}}\n（cast 只写真实在场、能听到「' + st.who + '」说话的角色，不含「' + st.who + '」自己；设定里有的角色用设定里的名字）';
  }
  function narrate(direction, opening) {
    if (!st || busy) return Promise.resolve();
    setBusy(true); var w = typing(null);
    var msgs = [{ role: 'system', content: narrPrompt(direction, opening) }, { role: 'user', content: opening ? '（开场）' : ('最近发生的事：\n' + (sceneText(0) || '（刚开场）') + '\n\n请写下一段旁白。') }];
    return F.llm(msgs, { temperature: 0.9, max_tokens: 700 }).then(function (txt) {
      var j = F.json(txt) || { n: String(txt || '').trim() };
      w.remove(); line({ k: 'n', t: String(j.n || '……'), mine: !!direction, dir: direction || '' });
      var cast = Array.isArray(j.cast) ? j.cast.map(String).filter(function (n) { return n && n !== st.who; }) : null;
      var enter = j.enter && typeof j.enter === 'object' ? j.enter : {};
      Object.keys(enter).forEach(function (n) { if (n !== st.who && cast && cast.indexOf(n) < 0) cast.push(n); });
      if (cast) setCast(cast, enter);
    }).catch(function (e) { w.remove(); sys(e.message === 'NO_KEY' ? '先在「系统配置」填 API Key' : '旁白没接上：' + e.message + '，再试一次'); })
      .then(function () { setBusy(false); });
  }
  function setCast(cast, enter) {
    var before = st.cast.slice();
    cast.forEach(function (n) {
      if (before.indexOf(n) < 0) {
        st.cast.push(n); st.joined[n] = st.log.length - 1;
        if (enter && enter[n] && !card(n)) st.extra[n] = String(enter[n]);
        if (before.length || st.log.length > 2) sys(n + ' 进场了 · 现在也可以对他说话');
      }
    });
    st.cast = st.cast.filter(function (n) { var stay = cast.indexOf(n) >= 0; if (!stay) sys(n + ' 离开了'); return stay; });
    if (st.cast.indexOf(st.target) < 0) st.target = st.cast[0] || '';
    paintCast();
  }

  /* ---------------- 角色：各自独立的对话 ---------------- */
  function charPrompt(name) {
    var c = card(name), others = st.cast.filter(function (n) { return n !== name; });
    return '你现在就是小说《' + F.bookName() + '》里的角色「' + name + '」，正在一场戏里，和「' + st.who + '」面对面。\n\n' +
      '【你的人设】\n' + (c ? F.cardLine(c) : (st.extra[name] || '（设定库里没有你的资料，按旁白里的描述和常理来演）')) + '\n' +
      '【你和别人的关系】\n' + (F.relsOf(c ? c.name : name).join('\n') || '（暂无记录）') + '\n' +
      '【此刻在场】' + [st.who].concat(others).join('、') + '\n\n' +
      '规则：\n1. 永远用「' + name + '」的口吻和性格回应「' + st.who + '」，不要说自己是 AI，不要写旁白、不要描写环境。\n' +
      '2. 你只知道自己经历过、在场时看到听到的事；别人的秘密、伏笔的真相，除非是你本来就知道的，否则不要说破。\n' +
      '3. 回应要短：一两个动作 + 一两句台词，像真实对话；也可以只有动作、沉默不语。\n' +
      '4. 动作和台词分开写，按发生顺序排列。动作写第三人称、不带你的名字（例如：把茶杯在掌心转了半圈）；台词只写说出口的话，不加引号、不加括号。\n' +
      '5. 消息里带掷骰点数时，按点数决定对方这次行动在你身上的效果。\n\n' +
      '只输出 JSON：{"segs":[{"a":"动作"},{"s":"台词"}]}';
  }
  function speak(name, userText) {
    var h = st.hist[name] = st.hist[name] || [];
    var seen = st.seen[name] == null ? (st.joined[name] || 0) : st.seen[name];
    var news = sceneText(seen).split('\n').filter(function (l) { return l; });
    news = news.slice(0, Math.max(0, news.length - 1));   /* 最后一条就是这次对他说的话，单独给 */
    var msg = (news.length ? '（刚才发生的事）\n' + news.join('\n') + '\n\n' : '') + '「' + st.who + '」对你：' + userText;
    h.push({ role: 'user', content: msg });
    setBusy(true); var w = typing(name);
    return F.llm([{ role: 'system', content: charPrompt(name) }].concat(h.slice(-16)), { temperature: 0.9, max_tokens: 400 })
      .then(function (txt) {
        var j = F.json(txt), segs = j && Array.isArray(j.segs) ? j.segs : null;
        if (!segs) segs = splitLoose(String(txt || ''));
        segs = segs.map(function (s) { return s.a ? { a: String(s.a).replace(new RegExp('^' + name), '').replace(/^(他|她)/, '').trim() } : s.s ? { s: String(s.s).replace(/^[“「"]|[”」"]$/g, '').trim() } : null; }).filter(function (s) { return s && (s.a || s.s); });
        h.push({ role: 'assistant', content: JSON.stringify({ segs: segs }) });
        var say = segs.filter(function (s) { return s.s; }).map(function (s) { return s.s; }).join(' ');
        return typeInto(w, say).then(function () { w.remove(); line({ k: 'c', who: name, segs: segs, t: segText(segs) }); st.seen[name] = st.log.length; });
      }).catch(function (e) { w.remove(); h.pop(); sys(e.message === 'NO_KEY' ? '先在「系统配置」填 API Key' : name + ' 没接上话：' + e.message); })
      .then(function () { setBusy(false); });
  }
  function splitLoose(t) {
    var out = [], re = /（([^）]*)）|\(([^)]*)\)/g, last = 0, m;
    while ((m = re.exec(t))) { var s = t.slice(last, m.index).trim(); if (s) out.push({ s: s }); out.push({ a: m[1] || m[2] }); last = re.lastIndex; }
    var r = t.slice(last).trim(); if (r) out.push({ s: r }); return out;
  }

  /* ---------------- 一轮 ---------------- */
  function send(raw) {
    var t = raw.trim(), to = st.target;
    var m = t.match(/^[@＠](\S+?)[\s，,：:]/) || t.match(/^[@＠](\S+)$/);
    if (m) { var hit = st.cast.filter(function (n) { return n === m[1] || (card(n) && (card(n).aliases || []).indexOf(m[1]) >= 0); })[0]; if (hit) { to = hit; st.target = hit; t = t.slice(m[0].length).trim(); paintCast(); } }
    var off = st.off; st.off = false; $('pzOff').classList.remove('on'); $('pzOff').setAttribute('aria-pressed', 'false');
    var dice = off ? 0 : st.dice; st.dice = 0; var db = $('pzDice'); db.classList.remove('on'); db.textContent = '🎲';
    line({ k: 'u', t: t + (dice ? '  🎲 ' + dice + '/20' : ''), to: off ? '' : to, off: off });
    if (off) { sys('戏外 · 不进书稿，角色也听不见'); return; }
    if (!to) { sys('动作已记下 · 可以让 AI 写旁白，或你自己写'); autoAfter(true); return; }
    speak(to, t + (dice ? ' [掷骰 ' + dice + '/20]' : '')).then(function () { autoAfter(true); });
  }
  function autoAfter(ok) { if (ok && st && st.auto && !busy) narrate(); }

  function start(name, isNew, newWho) {
    st = { who: name, isNew: !!isNew, newWho: newWho || '', scene: ($('pzScene') && $('pzScene').value.trim()) || '', log: [], cast: [], target: '', joined: {}, seen: {}, hist: {}, extra: {}, save: null, dice: 0, off: false, auto: false, chId: T.currentChapter ? T.currentChapter() : D.D.activeChapter };
    $('pzWho').innerHTML = '<div class="fn-por">' + F.portrait(name) + '</div><div><b>' + esc(name) + '</b><small>《' + esc(F.bookName()) + '》 · 你在扮演' + esc(name) + '</small></div>';
    body().innerHTML = '<div class="pz-log" id="pzLog"></div>'; chrome(true); $('pzAuto').checked = false;
    sys('入戏 · 你是' + name + '。点下方头像或用 @名字 选择对谁说；（）里写动作');
    paintCast();
    narrate('', true);
  }
  function snap() { return { at: st.log.length, cast: st.cast.slice(), target: st.target, hist: JSON.parse(JSON.stringify(st.hist)), seen: JSON.parse(JSON.stringify(st.seen)), joined: JSON.parse(JSON.stringify(st.joined)) }; }
  function load() {
    if (!st || !st.save || busy) return;
    var s = st.save;
    st.log.forEach(function (e, i) { if (i >= s.at && e.k !== 'sys') e.discard = 1; });
    st.cast = s.cast.slice(); st.target = s.target; st.hist = JSON.parse(JSON.stringify(s.hist)); st.seen = JSON.parse(JSON.stringify(s.seen)); st.joined = JSON.parse(JSON.stringify(s.joined));
    [].slice.call($('pzLog').children).forEach(function (d) { if (+d.dataset.i >= s.at) d.classList.add('gone'); });
    line({ k: 'u', t: '读档：回到存档点', off: true, load: 1 });
    sys('已读档 · 之后那段当成废稿，不进提纯'); paintCast();
  }

  /* ---------------- 渲染 ---------------- */
  function fmtAct(t) { return esc(t).replace(/（([^）]*)）|\(([^)]*)\)/g, function (m, a, b) { return '<i class="pz-act">（' + (a || b) + '）</i>'; }); }
  function line(e) {
    st.log.push(e); var i = st.log.length - 1, L = $('pzLog'); if (!L) return;
    var d = document.createElement('div'); d.dataset.i = i;
    if (e.k === 'n') { d.className = 'pz-n' + (e.mine ? ' mine' : ''); d.innerHTML = (e.mine ? '<span class="pz-by">✎ ' + (e.dir ? '按你的方向扩写' : '你写的旁白') + '</span>' : '') + esc(e.t); }
    else if (e.k === 'u') { d.className = 'pz-u' + (e.off ? ' off' : ''); d.innerHTML = (e.off ? '<span class="pz-to">戏外</span>' : e.to ? '<span class="pz-to">对 ' + esc(e.to) + '</span>' : '<span class="pz-to">动作</span>') + fmtAct(e.t); }
    else if (e.k === 'c') {
      d.className = 'pz-cg'; d.style.setProperty('--hue', hue(e.who));
      d.innerHTML = (e.segs || []).map(function (s) {
        return s.a ? '<div class="pz-pill"><b>' + esc(e.who) + '</b> ' + esc(s.a) + '</div>'
          : '<div class="pz-c"><div class="pz-cpor">' + F.portrait(e.who) + '</div><div class="pz-cb"><span class="pz-cn">' + esc(e.who) + '</span><span class="pz-ct">' + esc(s.s) + '</span></div></div>';
      }).join('');
    }
    else { d.className = 'pz-sys'; d.textContent = e.t; }
    L.appendChild(d); scroll();
  }
  function sys(t) { line({ k: 'sys', t: t }); }
  function typing(who) {
    var L = $('pzLog'), d = document.createElement('div');
    if (who) { d.className = 'pz-c pz-wait'; d.style.setProperty('--hue', hue(who)); d.innerHTML = '<div class="pz-cpor">' + F.portrait(who) + '</div><div class="pz-cb"><span class="pz-cn">' + esc(who) + '</span><span class="pz-ct fn-typing"></span></div>'; }
    else { d.className = 'pz-n pz-wait'; d.innerHTML = '<span class="fn-typing">旁白正在落笔</span>'; }
    L.appendChild(d); scroll(); return d;
  }
  function typeInto(w, s) {
    var tx = w.querySelector('.pz-ct'); if (!tx || !s) return Promise.resolve();
    var k = 0; return new Promise(function (res) { (function f() { tx.textContent = s.slice(0, ++k); scroll(); if (k < s.length) setTimeout(f, reduce ? 0 : 28); else res(); })(); });
  }
  function paintCast() {
    var el = $('pzCast'); if (!el || !st) return;
    el.innerHTML = '<span class="pz-castl">在场</span>' + (st.cast.length ? st.cast.map(function (n) {
      return '<button type="button" class="pz-pick' + (n === st.target ? ' on' : '') + '" data-t="' + esc(n) + '" style="--hue:' + hue(n) + '" title="对 ' + esc(n) + ' 说"><span class="pz-mini">' + F.portrait(n) + '</span>' + esc(n) + '</button>';
    }).join('') : '<span class="pz-castl">（暂时没有别人）</span>') +
      '<button type="button" class="pz-pick' + (st.target === '' ? ' on' : '') + '" data-t="">只做动作 / 对环境</button>';
  }
  function scroll() { var b = body(); b.scrollTo({ top: b.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); }

  /* ============================================================
     提纯
     ============================================================ */
  function distill() {
    if (!st || busy) return;
    var items = [];
    st.log.forEach(function (e) {
      if (e.k === 'sys') return;
      var who = e.k === 'u' ? '你' : e.k === 'n' ? '旁白' : e.who, pre = e.load ? '读档' : e.off ? '戏外' : e.discard ? '读档前的废稿' : '';
      items.push({ i: items.length + 1, k: e.k, who: who, t: e.t, e: e, keep: !pre, why: pre, fixed: !!pre });
    });
    var cand = items.filter(function (x) { return !x.fixed; });
    if (cand.length < 2) { F.toast('这一场还太短，再演几步吧'); return; }
    setBusy(true); sys('故事大脑正在提纯这一场…');
    var style = F.chapterTail(1000);
    var sysP = '你是严格的小说编辑，负责把一场「互动角色扮演」提纯成可以放进小说的正文。宁缺毋滥：聊嗨的、重复的、出戏的，一概不要。\n\n' +
      '书名：《' + F.bookName() + '》；作者扮演的角色：「' + st.who + '」\n' +
      (style ? '本书文风样本（照这个文风写）：\n' + style + '\n' : '') +
      '【已有设定】' + D.listCards(pid()).map(function (c) { return c.name; }).slice(0, 60).join('、') + '\n\n' +
      '条目类型：旁白 / 你（作者扮演的「' + st.who + '」，（）里是动作）/ 角色（动作在（）里，台词在「」里）。\n\n' +
      '任务：\n' +
      '1. 逐条判断留还是丢。丢掉：闲聊玩笑、出戏的话、反复试探同一件事的冗余、没推动剧情也没塑造人物的内容、和既有设定冲突的胡闹。保留：推动剧情的行动、有分量的对白、新揭开的信息、关系变化、有画面感的描写。角色的回避、答非所问、沉默、话里有话，往往正是在塑造人物，一律保留，不能当成废话丢掉。丢的给一个不超过 8 个字的理由。\n' +
      '2. 只用保留的内容写成第三人称正文：\n' +
      '   - 对白（「」里的台词和「' + st.who + '」说的话）一字不改地保留原话，配上说话人和必要的动作；\n' +
      '   - 动作改成叙述句（「你」一律改成「' + st.who + '」）；\n' +
      '   - 旁白可以润色、衔接、改成第三人称，对齐文风；\n' +
      '   - 绝对不要编造互动里没有发生的情节。分成若干段，每段标出它来自哪几条（src 用条目编号）。\n' +
      '3. 列出这场戏带来的设定变化，用 tws 指令格式：add_lore / add_alias / add_rel / add_thread / resolve_thread / add_event。互动里旁白或角色即兴编出、原有设定里没有依据的「新事实」，加 "pending":true。\n\n' +
      '只输出 JSON：{"drop":[{"i":3,"why":"闲聊"}],"prose":[{"t":"一段正文","src":[1,2]}],"ops":[{"op":"add_rel","a":"甲","b":"乙","l":"关系"}]}\n没列进 drop 的条目视为保留。';
    var user = cand.map(function (x) { return '[' + x.i + '] ' + (x.k === 'c' ? '角色·' + x.who : x.who) + '：' + x.t; }).join('\n');
    F.llm([{ role: 'system', content: sysP }, { role: 'user', content: user }], { temperature: 0.3, max_tokens: 2600 })
      .then(function (txt) {
        var j = F.json(txt); if (!j || !j.prose) throw new Error('提纯结果没解析出来');
        (j.drop || []).forEach(function (d) { var it = items.filter(function (x) { return x.i === +d.i; })[0]; if (it && !it.fixed) { it.keep = false; it.why = String(d.why || '不推动剧情').slice(0, 12); } });
        report(items, (j.prose || []).filter(function (p) { return p && p.t; }), (j.ops || []).filter(function (o) { return o && o.op; }));
      }).catch(function (e) { sys('提纯失败：' + (e.message === 'NO_KEY' ? '先在系统配置填 API Key' : e.message) + '，再点一次「结束并提纯」'); })
      .then(function () { setBusy(false); });
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
  var KIND = { n: '旁白 · 润色', u: '对白 · 原话', c: '对白 · 原话' };
  function report(items, prose, ops) {
    var kept = items.filter(function (x) { return x.keep; }).length;
    var words = prose.reduce(function (a, p) { return a + String(p.t).replace(/\s/g, '').length; }, 0);
    chrome(false);
    body().innerHTML = '<div class="pr">' +
      '<div class="pr-top"><div><div class="pz-eye">提纯报告 <span class="lat">Distillatio</span></div><h2>这一场留下了什么</h2></div>' +
      '<div class="pr-stat"><div><b>' + items.length + '</b>条互动</div><div><b>' + kept + '</b>条保留</div><div class="hot"><b id="prWords">' + words + '</b>字正文</div></div></div>' +
      '<div class="pr-grid"><div class="pr-col"><div class="pr-h">原始互动 <span class="lat">Acta</span><span class="r">灰掉的不进书稿，可以捞回</span></div><div id="prRaw">' +
      items.map(function (x) {
        var tag = x.keep ? '<span class="kind k-' + x.k + '">' + KIND[x.k] + '</span>' : '<span class="why">' + esc(x.why) + '</span>' + (x.why === '读档' ? '' : '<button type="button" class="tog" data-back="' + x.i + '">捞回</button>');
        return '<div class="pr-item' + (x.keep ? '' : ' drop') + '" data-i="' + x.i + '"><span class="no">' + x.i + '</span><span class="tx"><em>' + esc(x.who) + '：</em>' + esc(x.t.length > 70 ? x.t.slice(0, 70) + '…' : x.t) + '</span>' + tag + '</div>';
      }).join('') + '</div></div>' +
      '<div class="pr-right"><div class="pr-col"><div class="pr-h">提纯后的正文 <span class="lat">Textus</span><span class="r">对白保留原话 · 旁白改第三人称</span></div><div class="pr-prose" id="prProse">' +
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
      d.innerHTML = '<p contenteditable="true" spellcheck="false">' + esc(it.k === 'c' ? it.who + '：' + it.t : it.t) + '</p><span class="pr-src">' + it.i + ' · 捞回，可直接改</span>';
      pr.appendChild(d); count();
    });
    pr.addEventListener('click', function (e) { var b = e.target.closest('[data-cut]'); if (!b) return; var p = b.parentNode; p.classList.toggle('cut'); b.textContent = p.classList.contains('cut') ? '恢复' : '去掉'; count(); });
    pr.addEventListener('input', count);
    function count() { $('prWords').textContent = text().replace(/\s/g, '').length; }
    function text() { return [].slice.call(pr.querySelectorAll('.pr-p:not(.cut) p')).map(function (p) { return p.textContent.trim(); }).filter(Boolean).join('\n\n'); }
    $('prSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    $('prBack').addEventListener('click', function () {
      var log = st.log; st.log = [];
      body().innerHTML = '<div class="pz-log" id="pzLog"></div>'; chrome(true);
      log.forEach(function (e) { line(e); if (e.discard) $('pzLog').lastChild.classList.add('gone'); });
      sys('回到戏里'); paintCast();
    });
    $('prOk').addEventListener('click', function () {
      var mode = document.querySelector('#prSeg .on').dataset.o, out = text(), msg = [];
      var chosen = [].slice.call(document.querySelectorAll('#prSet input[data-op]')).filter(function (x) { return x.checked; }).map(function (x) { var o = ops[+x.dataset.op], c = {}; Object.keys(o).forEach(function (k) { if (k !== 'pending') c[k] = o[k]; }); return c; });
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
      } else msg.push('只更新了设定，正文没动');
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
      F.shoot(['新的一段！', '这段是演出来的吧', '对白好有味道'], true);
    });
  }

  T.persona = { open: open, close: close, _st: function () { return st; } };
})();
