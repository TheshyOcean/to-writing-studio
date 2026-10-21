/* ============================================================================
   TWS · 趣味玩法（Beta V3.0.0，只在 desktop.html 加载）
   - 读者弹幕 Lectores：AI 每写完一段，虚拟读者发弹幕、追更数上涨（真实模型生成）
   - 命运骰子 Alea：卡文时抽一张卡（通用卡 + 本书专属卡），写进下一段
   - 角色访谈 Colloquium：用角色自己的口吻聊天，好回答可写进人设
   共用：T.fun.llm()、T.fun.modal()、T.fun.portrait()
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;
  if (!D) return;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function pid() { return D.D.activeProject; }
  function S() { return (window.__ENDF__ && window.__ENDF__.S) || {}; }
  function hasKey() { return !!S().apiKey; }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function toast(t) {
    if (typeof window.toast === 'function') { window.toast(t); return; }
    var w = $('toastWrap'); if (!w) return;
    var el = document.createElement('div'); el.className = 'toast'; el.textContent = t; w.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ---------------- 存储 ---------------- */
  var KEY = 'tws_fun_v1';
  var mem = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  function my() { var p = pid() || '_'; return mem[p] || (mem[p] = {}); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} }
  function opt(k, dft) { var v = mem['_' + k]; return v == null ? dft : v; }
  function setOpt(k, v) { mem['_' + k] = v; save(); }

  /* ---------------- 模型调用 ----------------
     fast：DeepSeek 用 deepseek-flash；否则用当前模型。都不开思考，求快。 */
  function llm(messages, o) {
    o = o || {};
    var s = S();
    if (!s.apiKey) return Promise.reject(new Error('NO_KEY'));
    var ds = /deepseek/i.test((s.provider || '') + ' ' + (s.baseUrl || '') + ' ' + (s.model || ''));
    var body = { model: (o.fast && ds) ? 'deepseek-flash' : s.model, messages: messages, temperature: o.temperature == null ? 0.9 : o.temperature, stream: false, max_tokens: o.max_tokens || 800 };
    if (ds) body.thinking = { type: 'disabled' };
    return fetch(String(s.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; });
  }
  function json(txt) {
    var s = String(txt || '').replace(/```(?:json)?/g, '');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  /* ---------------- 书的上下文 ---------------- */
  function chapterTail(n) {
    var id = T.currentChapter ? T.currentChapter() : D.D.activeChapter;
    var c = id && D.getChapter(id);
    return c && c.content ? String(c.content).slice(-(n || 1200)) : '';
  }
  function cardLine(c) {
    var a = c.attrs || {}, parts = [];
    if (c.body) parts.push(String(c.body).slice(0, 160));
    Object.keys(a).forEach(function (k) { if (a[k]) parts.push(k + '：' + a[k]); });
    return c.name + ((c.aliases || []).length ? '〔又称 ' + c.aliases.join('、') + '〕' : '') + (parts.length ? '：' + parts.join('；') : '');
  }
  function relsOf(name) {
    var rs = T.define && T.define.rels ? T.define.rels() : [];
    return rs.filter(function (r) { return !name || r.a === name || r.b === name; }).map(function (r) { return r.a + ' —' + r.l + '— ' + r.b; });
  }
  function bookName() { var p = pid() && D.getProject(pid()); return p ? p.name : ''; }

  /* ---------------- 弹窗 ---------------- */
  var lastFocus = null;
  function modal(id, cls, html) {
    var g = $(id);
    if (!g) {
      g = document.createElement('div'); g.id = id; g.className = 'fn-gm'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true'); g.hidden = true;
      g.innerHTML = '<div class="fn-box ' + (cls || '') + '"><button type="button" class="fn-x" data-close aria-label="关闭">×</button>' + html + '</div>';
      document.body.appendChild(g);
      g.addEventListener('click', function (e) { if (e.target === g || (e.target.closest && e.target.closest('[data-close]'))) closeModal(id); });
      g.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(id); });
    }
    return g;
  }
  function openModal(id) {
    var g = $(id); lastFocus = document.activeElement; g.hidden = false;
    requestAnimationFrame(function () { g.classList.add('on'); });
    var f = g.querySelector('.fn-focus') || g.querySelector('button:not([data-close])'); if (f) setTimeout(function () { f.focus(); }, 60);
  }
  function closeModal(id) {
    var g = $(id); if (!g) return; g.classList.remove('on');
    setTimeout(function () { g.hidden = true; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function portrait(name) {
    var h = 0, t = String(name || '?'); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; h = Math.abs(h);
    var hue = 230 + h % 60, hue2 = hue + 30 + (h >> 4) % 40;
    return '<svg viewBox="0 0 60 60" aria-hidden="true"><defs><linearGradient id="fp' + h + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + hue + ' 50% 72%)"/><stop offset="1" stop-color="hsl(' + hue2 + ' 55% 42%)"/></linearGradient></defs><rect width="60" height="60" fill="url(#fp' + h + ')"/><circle cx="30" cy="25" r="10" fill="rgba(255,255,255,.55)"/><path d="M12 60c2-12 9-18 18-18s16 6 18 18z" fill="rgba(255,255,255,.45)"/></svg>';
  }

  /* ============================================================
     ① 读者弹幕
     ============================================================ */
  function dmOn() { return opt('dm', true); }
  function follow() { var m = my(); if (m.follow == null) { var w = pid() ? D.projectWords(pid()) : 0; m.follow = 12 + Math.round(w / 60); save(); } return m.follow; }
  function layer() {
    var st = $('stage'); if (!st) return null;
    var l = $('fnDanmu'); if (!l) { l = document.createElement('div'); l.id = 'fnDanmu'; l.className = 'fn-danmu'; l.setAttribute('aria-hidden', 'true'); st.appendChild(l); }
    return l;
  }
  function shoot(list, hot) {
    var box = layer(); if (!box || !dmOn() || reduce) return;
    (list || []).forEach(function (t, i) {
      setTimeout(function () {
        var d = document.createElement('div'); d.className = 'fn-dm' + (hot && i < 2 ? ' hot' : ''); d.textContent = t;
        d.style.top = (6 + (i % 4) * 34) + 'px'; d.style.animationDuration = (9 + Math.random() * 4) + 's';
        box.appendChild(d); setTimeout(function () { d.remove(); }, 14500);
      }, i * 650 + Math.random() * 300);
    });
  }
  function paintReader(n) {
    var b = $('fnFollow'); if (!b) return;
    var to = follow(), from = to - (n || 0), t0 = performance.now();
    (function step(t) { var k = Math.min(1, (t - t0) / 900); b.textContent = Math.round(from + (to - from) * k).toLocaleString('en-US'); if (k < 1) requestAnimationFrame(step); })(t0);
    if (n) { var u = $('fnUp'); u.textContent = '+' + n; u.classList.add('on'); setTimeout(function () { u.classList.remove('on'); }, 2200); }
    var tog = $('fnDmTog'); if (tog) { tog.textContent = '弹幕 ' + (dmOn() ? '开' : '关'); tog.setAttribute('aria-pressed', dmOn()); }
    var l = $('fnLast'), top = my().top;
    if (l) l.innerHTML = top ? '<span class="who">' + esc(top.who) + '</span>“' + esc(top.t) + '”' : '<span class="who">还没有读者留言</span>写完一段，读者就会来了。';
  }
  function readerCard() {
    return '<div class="st-mcard fn-reader"><div class="st-mh">读者 <span class="lat">Lectores</span><button type="button" id="fnDmTog" aria-pressed="true">弹幕 开</button></div>' +
      '<div class="fn-rrow"><b id="fnFollow">0</b><span>人在追更</span><i id="fnUp"></i></div><div class="fn-last" id="fnLast"></div></div>';
  }
  function mountReader() {
    var m = $('stMargin'); if (!m || $('fnFollow')) return;
    var first = m.querySelector('.st-mcard');
    var wrap = document.createElement('div'); wrap.innerHTML = readerCard();
    m.insertBefore(wrap.firstChild, first ? first.nextSibling : m.firstChild);
    $('fnDmTog').addEventListener('click', function () { setOpt('dm', !dmOn()); if (!dmOn()) { var l = $('fnDanmu'); if (l) l.innerHTML = ''; } paintReader(0); });
    paintReader(0);
  }
  var NICK = ['老书虫', '追更到凌晨', '匿名读者', '不吃香菜', '蹲回收的人', '今天也在等更新', '路过的编辑', '第一章就入坑'];
  var seenReply = {}, dmBusy = false;
  function onReply(text, key) {
    if (!dmOn() || !hasKey() || dmBusy || seenReply[key]) return;
    seenReply[key] = 1;
    var t = String(text || '').replace(/```[\s\S]*?```/g, '').trim();
    if (t.replace(/\s/g, '').length < 60) return;
    dmBusy = true;
    llm([{ role: 'system', content: '你扮演这部小说的一群网文读者。读完作者刚更新的一段，写出读者会发的弹幕。\n' +
      '要求：像真实读者——口语、简短、有情绪：猜剧情、磕人物、被细节戳中、吐槽、催更都可以；每条不超过 16 个字；不要剧透作者没写的内容；不要夸“文笔好”这种空话。\n' +
      '再给一个 heat（0~10，这段有多抓人：揭晓 / 反转 / 高潮更高，过渡更低），和一条最有代表性的读者短评（不超过 30 字）。\n' +
      '只输出 JSON：{"dm":["弹幕1","弹幕2","弹幕3","弹幕4","弹幕5"],"heat":6,"top":"短评"}' },
      { role: 'user', content: (bookName() ? '书名：《' + bookName() + '》\n' : '') + '新更新：\n' + t.slice(-2500) }], { fast: true, temperature: 1, max_tokens: 400 })
      .then(function (r) {
        var j = json(r); if (!j || !j.dm) return;
        var heat = Math.max(0, Math.min(10, +j.heat || 3)), n = Math.round(heat * heat * 0.6 + Math.random() * 4 + 1);
        my().follow = follow() + n; if (j.top) my().top = { who: rnd(NICK), t: String(j.top).slice(0, 40) }; save();
        shoot(j.dm.slice(0, 6).map(function (x) { return String(x).slice(0, 20); }), heat >= 7);
        paintReader(n);
      }).catch(function (e) { console.warn('[读者弹幕]', e); })
      .then(function () { dmBusy = false; });
  }

  /* ============================================================
     ② 命运骰子
     ============================================================ */
  var DECK = [
    ['n', '意外', '突然停电', '整个场景暗了下来，只剩一处光源。'],
    ['n', '天气', '一场来得太早的雨', '所有人都被困在原地。'],
    ['n', '物品', '一枚不该出现在这里的纽扣', '它属于某个人，而那个人不该来过。'],
    ['n', '台词', '“我不是第一次来这里了。”', '这句话必须出现在下一段。'],
    ['n', '声音', '远处传来一首老歌', '有人跟着哼了一句，又突然停下。'],
    ['n', '地点', '一个被遗忘的角落', '地上有一行新鲜的脚印。'],
    ['n', '意外', '信 / 消息被打湿', '最重要的那一行字晕开了。'],
    ['n', '人物', '一个问路的陌生人', '他打听的，正是主角最在意的那件事。'],
    ['n', '细节', '有人说话时一直没看对方的眼睛', '让读者察觉到，但别解释。'],
    ['n', '节奏', '用一段沉默收尾', '下一段最后一句，没有人说话。'],
    ['r', '秘密', '有人一直在冒名顶替', '笔迹、口头禅或习惯，露出了一点破绽。'],
    ['r', '重逢', '以为再也见不到的人', '在最不合适的时候出现了。'],
    ['r', '反转', '地址是对的，人是错的', '一切都按计划进行，只是对象换了。'],
    ['r', '物品', '一张只拍了一半的合照', '另一半被人小心地剪掉了。'],
    ['r', '台词', '“你母亲当年也是这么说的。”', '由一个最不该知道这件事的人说出口。'],
    ['g', '命运', '有人说谎了', '从一开始，就有一个人从没说过真话。'],
    ['g', '命运', '时间不多了', '给主角一个无法推迟的期限。'],
    ['g', '命运', '这件事从来没有发生过', '所有人都记得的那件事，其实另有真相。']
  ];
  function bookCards() {
    /* 本书专属卡：从未回收伏笔和人物里抽 */
    var p = pid(); if (!p) return [];
    var out = [], ths = D.listThreads(p).filter(function (t) { return t.status === 'open'; }), cs = D.listCards(p, 'character');
    ths.slice(0, 6).forEach(function (t) { out.push(['r', '本书 · 伏笔', '「' + t.name + '」被人提起', '有人无意间说到了它，但只说了一半。']); });
    cs.slice(0, 6).forEach(function (c) { out.push(['n', '本书 · 人物', c.name + ' 突然出现', '在这一幕最不该出现的时候。']); });
    if (cs.length >= 2) { var a = rnd(cs), b = rnd(cs.filter(function (x) { return x !== a; })); out.push(['g', '本书 · 命运', a.name + ' 和 ' + b.name + ' 之间的秘密', '其中一个人，一直瞒着另一个人。']); }
    return out;
  }
  var TIER = { n: ['Communis', '普通'], r: ['Rara', '稀有'], g: ['Aurea', '金卡'] };
  var dcur = null, rolling = false;
  function deck() { return DECK.concat(bookCards()); }
  function dex() { var m = my(); return m.dex || (m.dex = {}); }
  function paintDex() {
    var d = dex(), keys = Object.keys(d);
    $('fnDexN').textContent = keys.length + ' 张';
    $('fnDexDots').innerHTML = keys.slice(-24).map(function (k) { return '<i class="' + d[k] + '" title="' + esc(k) + '"></i>'; }).join('');
  }
  function openDice() {
    modal('fnDice', 'fn-dice', '<div class="fn-h">命运骰子 <span class="lat">Alea</span></div><p class="fn-sub">卡住了？摇一次，把抽到的东西写进下一段。卡池里有通用卡，也有从你这本书里长出来的专属卡。</p>' +
      '<div class="fn-cwrap" id="fnCwrap"><div class="fn-card" id="fnCard"><div class="fn-back"><span>✦</span></div><div class="fn-front" id="fnFront"></div></div></div>' +
      '<div class="fn-f"><button type="button" class="fn-btn fn-focus" id="fnRoll">摇一次</button><button type="button" class="fn-btn on" id="fnUse" disabled>写进下一段</button></div>' +
      '<div class="fn-dex"><span>图鉴</span><div class="fn-dots" id="fnDexDots"></div><b id="fnDexN">0 张</b></div>');
    if (!$('fnRoll').dataset.bound) {
      $('fnRoll').dataset.bound = 1;
      $('fnRoll').addEventListener('click', function () { roll(); });
      $('fnUse').addEventListener('click', function () {
        if (!dcur) return; var inp = $('input'); if (!inp) return;
        inp.value = '【命运骰子 · ' + dcur[1] + '】' + dcur[2] + '——' + dcur[3] + ' 请把它自然地写进下一段，不要生硬点题。';
        inp.dispatchEvent(new Event('input', { bubbles: true })); closeModal('fnDice'); setTimeout(function () { inp.focus(); }, 380);
      });
    }
    paintDex(); openModal('fnDice');
  }
  function roll() {
    if (rolling) return Promise.resolve(); rolling = true;
    var f = $('fnCard'), w = $('fnCwrap'); $('fnUse').disabled = true;
    var was = f.classList.contains('flip'); f.classList.remove('flip');
    return wait(was ? 450 : 0).then(function () { w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); return wait(520); })
      .then(function () {
        var all = deck(), r = Math.random(), tier = r < 0.1 ? 'g' : r < 0.38 ? 'r' : 'n';
        var pool = all.filter(function (c) { return c[0] === tier; }); if (!pool.length) pool = all;
        var c = rnd(pool); dcur = c; dex()[c[2]] = c[0]; save();
        var fr = $('fnFront'); fr.className = 'fn-front' + (c[0] === 'r' ? ' rare' : c[0] === 'g' ? ' gold' : '');
        fr.innerHTML = '<span class="tier">' + TIER[c[0]][0] + ' · ' + TIER[c[0]][1] + '</span><span class="kind">' + esc(c[1]) + '</span><b>' + esc(c[2]) + '</b><p>' + esc(c[3]) + '</p>';
        f.classList.add('flip'); paintDex(); $('fnUse').disabled = false; $('fnRoll').textContent = '再摇一次';
        return wait(900);
      }).then(function () { rolling = false; });
  }

  /* ============================================================
     ③ 角色访谈
     ============================================================ */
  var ivWho = null, ivHist = {}, ivLast = '', ivBusy = false;
  function card(name) { return pid() ? D.listCards(pid(), 'character').filter(function (c) { return c.name === name; })[0] : null; }
  function ivSys(c) {
    var others = D.listCards(pid(), 'character').filter(function (x) { return x.id !== c.id; }).slice(0, 12).map(function (x) { return '- ' + x.name; }).join('\n');
    return '你现在就是小说《' + bookName() + '》里的角色「' + c.name + '」，正在接受作者的访谈。\n\n' +
      '【你的人设】\n' + cardLine(c) + '\n' +
      '【你和别人的关系】\n' + (relsOf(c.name).join('\n') || '（暂无记录）') + '\n' +
      '【书里的其他人】\n' + (others || '（暂无）') + '\n' +
      (chapterTail(800) ? '【故事最近写到】\n' + chapterTail(800) + '\n' : '') + '\n' +
      '规则：\n1. 永远用「' + c.name + '」的第一人称和口吻说话，符合人设的性格、身份、说话习惯；不要说自己是 AI。\n' +
      '2. 只知道这个角色该知道的事；不知道的就说不知道，或用这个角色的方式回避。\n' +
      '3. 回答 1~4 句，口语、有画面感，可以带一个小动作（用括号）。\n' +
      '4. 当对方问到「作者」「对作者有什么意见」时，可以打破第四面墙，用这个角色的性格吐槽作者对你的安排。\n' +
      '5. 不替作者编造重大的新设定；可以流露情绪、态度、小习惯，让人设更立体。';
  }
  function openIv(name) {
    var c = card(name); if (!c) { toast('设定库里没找到「' + name + '」'); return; }
    if (!hasKey()) { toast('先在「系统配置」填 API Key'); return; }
    ivWho = c.name; ivLast = '';
    modal('fnIv', 'fn-iv', '<div class="fn-ivtop"><div class="fn-por" id="fnIvPor"></div><div><div class="fn-h" id="fnIvName"></div><p class="fn-sub" id="fnIvRole"></p></div></div>' +
      '<div class="fn-ivlog" id="fnIvLog" aria-live="polite"></div><div class="fn-ivq" id="fnIvQ"></div>' +
      '<div class="fn-ivin"><label for="fnIvIn" class="fn-sr">向角色提问</label><input class="fn-fld fn-focus" id="fnIvIn" placeholder="想问点什么……" autocomplete="off"><button type="button" class="fn-btn on" id="fnIvSend">问</button></div>' +
      '<div class="fn-ivfoot"><span class="fn-sub">访谈不会写进书稿，喜欢的回答可以存进人设。</span><button type="button" class="fn-btn" id="fnIvSave" disabled>把这句写进人设</button></div>');
    if (!$('fnIvSend').dataset.bound) {
      $('fnIvSend').dataset.bound = 1;
      $('fnIvSend').addEventListener('click', function () { var v = $('fnIvIn').value.trim(); $('fnIvIn').value = ''; ask(v); });
      $('fnIvIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('fnIvSend').click(); } });
      $('fnIvQ').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { ask(b.textContent); b.remove(); } });
      $('fnIvSave').addEventListener('click', function () {
        var cc = card(ivWho); if (!cc || !ivLast) return;
        D.updateCard(cc.id, { body: (cc.body ? cc.body + '\n' : '') + '【访谈】' + ivLast });
        this.textContent = '已写进人设 ✓'; var b = this; setTimeout(function () { b.textContent = '把这句写进人设'; }, 1800);
        if (T.refreshViews) T.refreshViews();
      });
    }
    $('fnIvPor').innerHTML = portrait(c.name);
    $('fnIvName').innerHTML = esc(c.name) + ' <span class="lat">Colloquium</span>';
    $('fnIvRole').textContent = ((c.attrs || {})['身份'] || String(c.body || '').slice(0, 40) || '');
    var log = $('fnIvLog'); log.innerHTML = '';
    (ivHist[c.name] || []).forEach(function (m) { bubble(m.role === 'user' ? 'u' : 'a', m.content); });
    if (!(ivHist[c.name] || []).length) bubble('a', '（' + c.name + '抬头看了你一眼）有什么想问的？');
    $('fnIvQ').innerHTML = ['你最怕什么？', '你最在意的人是谁？', '你有什么不想让别人知道的事？', '对作者有什么意见？'].map(function (q) { return '<button type="button">' + q + '</button>'; }).join('');
    $('fnIvSave').disabled = true;
    openModal('fnIv');
  }
  function bubble(k, t) {
    var L = $('fnIvLog'), d = document.createElement('div'); d.className = 'fn-' + k;
    if (k === 'a') d.innerHTML = '<span class="who">' + esc(ivWho) + '</span><span class="tx"></span>';
    else d.textContent = t;
    L.appendChild(d); if (k === 'a') d.querySelector('.tx').textContent = t || '';
    L.scrollTop = L.scrollHeight; return d;
  }
  function ask(q) {
    if (!ivWho || !q || ivBusy) return Promise.resolve();
    var c = card(ivWho); if (!c) return Promise.resolve();
    ivBusy = true; bubble('u', q);
    var h = ivHist[c.name] = ivHist[c.name] || []; h.push({ role: 'user', content: q });
    var a = bubble('a', ''), tx = a.querySelector('.tx'); tx.classList.add('fn-typing');
    return llm([{ role: 'system', content: ivSys(c) }].concat(h.slice(-12)), { temperature: 0.9, max_tokens: 300 })
      .then(function (ans) {
        ans = String(ans || '').trim(); h.push({ role: 'assistant', content: ans }); ivLast = ans;
        var k = 0; return new Promise(function (res) {
          (function step() { tx.textContent = ans.slice(0, ++k); $('fnIvLog').scrollTop = 1e9; if (k < ans.length) setTimeout(step, reduce ? 0 : 30); else res(); })();
        });
      }).catch(function (e) { tx.textContent = '（' + (e.message === 'NO_KEY' ? '先在系统配置填 API Key' : '没接上话：' + e.message) + '）'; h.pop(); })
      .then(function () { tx.classList.remove('fn-typing'); $('fnIvSave').disabled = !ivLast; ivBusy = false; });
  }

  /* ---------------- 页边与顶栏入口 ---------------- */
  function mountHead() {
    var tools = $('stTools'); if (!tools || $('fnDiceBtn')) return;
    var dice = document.createElement('button'); dice.type = 'button'; dice.id = 'fnDiceBtn'; dice.className = 'fn-headbtn zhu'; dice.innerHTML = '🎲 命运骰子';
    dice.addEventListener('click', openDice);
    var ru = document.createElement('button'); ru.type = 'button'; ru.id = 'fnRuBtn'; ru.className = 'fn-headbtn ink'; ru.innerHTML = '<span class="fn-mask" aria-hidden="true">🎭</span><span class="fn-swap"><span class="zh">入戏</span><span class="la" aria-hidden="true">Persona</span></span>'; ru.setAttribute('aria-label', '入戏');
    ru.addEventListener('click', function () { if (T.persona) T.persona.open(); });
    tools.insertBefore(ru, tools.firstChild); tools.insertBefore(dice, tools.firstChild);
  }
  function peopleHtml(ps) {
    return ps.map(function (c) { return '<button type="button" class="fn-pchip" data-iv="' + esc(c.name) + '">' + esc(c.name) + '<em>访谈</em></button>'; }).join('');
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-iv]'); if (b) { e.stopPropagation(); openIv(b.dataset.iv); } }, true);

  var lastPid = null;
  function tick() { mountHead(); mountReader(); if (pid() !== lastPid) { lastPid = pid(); paintReader(0); } }

  T.fun = {
    llm: llm, json: json, toast: toast, esc: esc, modal: modal, openModal: openModal, closeModal: closeModal, portrait: portrait,
    chapterTail: chapterTail, cardLine: cardLine, relsOf: relsOf, bookName: bookName, shoot: shoot,
    onReply: onReply, openDice: openDice, roll: roll, openIv: openIv, ask: ask, peopleHtml: peopleHtml, tick: tick, paintReader: paintReader,
    store: { my: my, save: save }
  };
})();
