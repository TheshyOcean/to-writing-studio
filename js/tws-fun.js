/* ============================================================================
   TWS · 趣味玩法（Beta V3.0.0，只在 desktop.html 加载）
   - 读者弹幕 Lectores：AI 每写完一段，虚拟读者发弹幕、追更数上涨（真实模型生成）
   - 命运塔罗 Arcana：卡文时洗牌抽一张大阿卡纳，给出剧情方向（有 Key 时结合本书解读），写进下一段
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
     ② 命运塔罗 Arcana（原「命运骰子」）
     洗牌 → 展开七张 → 凭直觉选一张 → 翻开（可能逆位）→ 牌意 + 剧情方向
     有 API Key 时再结合本书写一段专属解读。牌意只作写作提示，不讲占卜。
     ============================================================ */
  function star(cx, cy, r, inv) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var a = (inv ? Math.PI / 2 : -Math.PI / 2) + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return '<path d="M' + p.join('L') + 'Z"/>';
  }
  function rays(cx, cy, r1, r2, n) {
    var s = ''; for (var i = 0; i < n; i++) { var a = i * 2 * Math.PI / n;
      s += 'M' + (cx + r1 * Math.cos(a)).toFixed(1) + ' ' + (cy + r1 * Math.sin(a)).toFixed(1) + 'L' + (cx + r2 * Math.cos(a)).toFixed(1) + ' ' + (cy + r2 * Math.sin(a)).toFixed(1); }
    return '<path d="' + s + '"/>';
  }
  /* [罗马数字, 中文名, 拉丁名, 图形, 关键词, 正位·剧情方向, 逆位·剧情方向] */
  var ARC = [
    ['0', '愚者', 'Stultus', '<path d="M6 46h28l5 9"/><circle cx="44" cy="18" r="6"/><path d="M22 46l4-14 5 6"/>', '出发 · 未知', '让主角在没想清楚之前就迈出第一步，这一段写一个毫无准备的开始。', '鲁莽的代价：之前一个轻率的决定，在这一段收到了回响。'],
    ['I', '魔术师', 'Magus', '<path d="M18 28c0-6 10-6 12 0s12 6 12 0-10-6-12 0-12 6-12 0"/><path d="M30 38v14M24 52h12"/>', '主动 · 手段', '有人拿出了意想不到的本事，局面因此第一次被主动掌控。', '一场漂亮的表演背后是骗局，有人的本事是装出来的。'],
    ['II', '女祭司', 'Sacerdos', '<path d="M14 14v34M46 14v34M10 48h40"/><path d="M34 22a9 9 0 1 0 0 14a7 7 0 1 1 0-14"/>', '秘密 · 直觉', '有人知道一件事却选择不说，这一段让沉默比对白更有分量。', '被压住的直觉终于浮上来，一个角色意识到自己早就察觉到了。'],
    ['III', '皇后', 'Imperatrix', '<circle cx="30" cy="23" r="9"/><path d="M30 32v17M23 42h14"/>', '滋养 · 丰盛', '写一段安稳、温暖的日常，让读者在风暴前先放松下来。', '过度的保护变成了束缚，有人想逃离对他太好的那个人。'],
    ['IV', '皇帝', 'Imperator', '<rect x="18" y="22" width="24" height="22"/><path d="M14 44h32M30 22v-9M25 15h10"/>', '规则 · 权威', '一条不可违背的规矩被立下，所有人都得在它之下行动。', '权威出现裂缝：发号施令的人，自己其实也在害怕。'],
    ['V', '教皇', 'Pontifex', '<path d="M30 10v42M21 19h18M23 27h14M25 35h10"/>', '传统 · 引导', '一位长辈或导师出场，给出建议，而这条建议日后会很重要。', '主角拒绝了别人眼中“正确”的路，开始按自己的方式来。'],
    ['VI', '恋人', 'Amantes', '<circle cx="24" cy="30" r="10"/><circle cx="36" cy="30" r="10"/>', '选择 · 联结', '让主角面临一个两难选择，两边都是真心想要的东西。', '一段关系出现分歧，两个人第一次站在了不同的一边。'],
    ['VII', '战车', 'Currus', '<rect x="17" y="22" width="26" height="15"/><circle cx="22" cy="43" r="4"/><circle cx="38" cy="43" r="4"/>' + star(30, 13, 5), '推进 · 意志', '节奏加快：写一段目标明确、一路向前的推进，不给喘息。', '冲得太快失去了方向，主角发现自己赢了，却走错了路。'],
    ['VIII', '力量', 'Fortitudo', '<path d="M22 15c0-4 8-4 8 0s8 4 8 0-8-4-8 0-8 4-8 0"/><circle cx="30" cy="36" r="11"/><path d="M24 37q6 6 12 0"/>', '温柔 · 勇气', '不靠蛮力，而是靠耐心和温柔，化解一场一触即发的冲突。', '强撑的人快撑不住了，写出他第一次露出疲惫的瞬间。'],
    ['IX', '隐者', 'Eremita', '<path d="M24 24h10l2 4v12H22V28z"/><path d="M29 24v-9M44 12v40"/>' + star(29, 33, 3), '独处 · 寻找', '让一个角色暂时离开人群，在独处里想明白一件事。', '孤立太久的人开始失去判断，他的“清醒”其实是固执。'],
    ['X', '命运之轮', 'Rota Fortunae', '<circle cx="30" cy="30" r="17"/><circle cx="30" cy="30" r="6"/>' + rays(30, 30, 6, 17, 8), '转折 · 机缘', '时来运转：一个偶然事件把局面整个翻了过来。', '好运用完了，原本顺利的计划在最后一步出了岔子。'],
    ['XI', '正义', 'Iustitia', '<path d="M30 12v38M16 20h28M24 50h12"/><path d="M16 20l-6 12h12zM44 20l-6 12h12z"/>', '因果 · 代价', '旧账被翻出来，有人必须为自己做过的事付出代价。', '一个不公平的判决落下，被冤枉的人只能先咽下去。'],
    ['XII', '倒吊人', 'Suspensus', '<path d="M14 12h32M30 12v10"/><circle cx="30" cy="40" r="6"/><path d="M30 22v12M24 26l12 4"/>', '停滞 · 换角度', '让局面卡住，主角被迫停下来，从另一个角度重新看问题。', '无谓的牺牲：有人在原地等了太久，等来的却是一场空。'],
    ['XIII', '死神', 'Mors', '<path d="M8 38h44M30 44v10"/><path d="M17 38a13 13 0 0 1 26 0"/>', '结束 · 新生', '某样东西彻底结束了：一段关系、一个身份或一座城。写好它的告别。', '有人死死抓着已经结束的东西不放，拒绝向前走。'],
    ['XIV', '节制', 'Temperantia', '<path d="M15 16h11l-2 12h-7zM34 32h11l-2 12h-7z"/><path d="M23 28q7 2 14 4"/>', '调和 · 平衡', '两股对立的力量找到了暂时的平衡，写一段微妙的和解。', '调和失败，一方的退让被当成了软弱。'],
    ['XV', '恶魔', 'Diabolus', star(30, 32, 18, true) + '<circle cx="30" cy="32" r="20"/>', '诱惑 · 束缚', '一个诱惑摆在角色面前，明知不该，他还是伸出了手。', '挣脱：一个被控制已久的人，终于剪断了那根线。'],
    ['XVI', '高塔', 'Turris', '<path d="M22 52V24h16v28M20 24l2-7 4 4 4-7 4 7 4-4 2 7"/><path d="M46 6l-7 11h6l-7 12"/>', '崩塌 · 揭穿', '一直以来相信的东西瞬间崩塌，真相以最猛烈的方式揭开。', '灾难被勉强躲过，但地基已经裂了，迟早还要塌。'],
    ['XVII', '星星', 'Stella', star(30, 25, 13) + '<circle cx="14" cy="14" r="1.6"/><circle cx="47" cy="12" r="1.6"/><circle cx="46" cy="44" r="1.6"/><path d="M10 50q10-6 20 0t20 0"/>', '希望 · 疗愈', '风暴过后，写一段安静的修复，让角色重新相信些什么。', '希望变成了空想，有人一直在等一个不会来的结果。'],
    ['XVIII', '月亮', 'Luna', '<path d="M37 12a15 15 0 1 0 0 28a12 12 0 1 1 0-28"/><path d="M12 54V43h6v11M42 54V43h6v11"/>', '迷雾 · 错觉', '让读者和主角一起看错：这一段里，有一件事不是它看起来的样子。', '迷雾散开，之前的误会被澄清，但真相未必更好受。'],
    ['XIX', '太阳', 'Sol', '<circle cx="30" cy="30" r="9"/>' + rays(30, 30, 13, 21, 12), '明朗 · 喜悦', '难得的好消息，写一段坦荡、明亮、没有阴影的场景。', '过分的乐观遮住了危险，笑声底下藏着一处没人注意的阴影。'],
    ['XX', '审判', 'Iudicium', '<path d="M12 24h16l14-9v24l-14-9H12z"/><path d="M10 48q5-5 10 0t10 0 10 0 10 0"/>', '觉醒 · 召唤', '一个被遗忘的人或事被重新召回，要求所有人给出回应。', '有人听到了召唤却假装没听见，逃避终将被追上。'],
    ['XXI', '世界', 'Mundus', '<ellipse cx="30" cy="30" rx="14" ry="20"/>' + star(30, 30, 5) + '<circle cx="9" cy="9" r="2"/><circle cx="51" cy="9" r="2"/><circle cx="9" cy="51" r="2"/><circle cx="51" cy="51" r="2"/>', '圆满 · 完成', '一条线索在这里画上句号，给读者一个完整的交代。', '差最后一步：眼看就要完成，却还缺一块关键的拼图。']
  ];
  var BACK = '<svg viewBox="0 0 100 170" aria-hidden="true"><rect x="5" y="5" width="90" height="160" rx="7"/><rect x="10" y="10" width="80" height="150" rx="4"/>' +
    '<circle cx="50" cy="85" r="22"/><path d="M58 70a17 17 0 1 0 0 30a13 13 0 1 1 0-30"/>' + rays(50, 85, 26, 34, 16).replace('<path', '<path class="ry"') +
    star(50, 28, 6) + star(50, 142, 6) + '<circle cx="22" cy="22" r="1.4"/><circle cx="78" cy="22" r="1.4"/><circle cx="22" cy="148" r="1.4"/><circle cx="78" cy="148" r="1.4"/></svg>';
  function face(c) {
    return '<div class="tr-num">' + c[0] + '</div><svg class="tr-gl" viewBox="0 0 60 60" aria-hidden="true">' + c[3] + '</svg><div class="tr-nm"><b>' + c[1] + '</b><i>' + c[2] + '</i></div>';
  }

  var NCARD = 7, tcur = null, tbusy = false, tphase = 'idle', tdeal = [];
  function dex() { var m = my(); return m.arc || (m.arc = {}); }
  function paintDex() {
    var d = dex(), n = Object.keys(d).length;
    $('trDexN').textContent = n + ' / 22';
    $('trDexDots').innerHTML = ARC.map(function (c, i) { return '<i class="' + (d[i] ? 'on' : '') + '" title="' + (d[i] ? c[0] + ' ' + c[1] : '未抽到') + '"></i>'; }).join('');
  }
  function shuffled() { var a = ARC.map(function (_, i) { return i; }); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function cards() { return Array.prototype.slice.call($('trStage').querySelectorAll('.tr-card')); }
  function pose(el, x, y, a, s, z) { el.style.setProperty('--x', x + 'px'); el.style.setProperty('--y', y + 'px'); el.style.setProperty('--a', a + 'deg'); el.style.setProperty('--s', s == null ? 1 : s); if (z != null) el.style.zIndex = z; }
  function stack() { cards().forEach(function (el, i) { el.className = 'tr-card'; pose(el, i * 0.8, -i * 0.8, (i % 2 ? 1 : -1) * (i * 0.6), 1, i); }); }
  function setHint(t) { var h = $('trHint'); h.classList.remove('on'); setTimeout(function () { h.textContent = t; h.classList.add('on'); }, 220); }

  function openDice() {
    var g = modal('fnTarot', 'fn-tarot', '<div class="fn-h">命运塔罗 <span class="lat">Arcana</span></div>' +
      '<p class="fn-sub">卡文的时候，洗一次牌，凭直觉抽一张。牌面不预言什么，只给下一段一个方向。</p>' +
      '<div class="tr-stage" id="trStage" data-phase="idle"><div class="tr-glow"></div>' +
      Array.apply(null, Array(NCARD)).map(function (_, i) { return '<button type="button" class="tr-card" data-i="' + i + '" tabindex="-1" aria-label="第 ' + (i + 1) + ' 张牌"><span class="tr-in"><span class="tr-b">' + BACK + '</span><span class="tr-f"></span></span></button>'; }).join('') +
      '<div class="tr-read" id="trRead" aria-live="polite"></div><div class="tr-hint on" id="trHint">牌已备好</div></div>' +
      '<div class="fn-f"><button type="button" class="fn-btn fn-focus" id="trGo">洗牌</button><button type="button" class="fn-btn on" id="trUse" disabled>写进下一段</button></div>' +
      '<div class="fn-dex"><span>图鉴</span><div class="fn-dots tr-dots" id="trDexDots"></div><b id="trDexN">0 / 22</b></div>');
    if (!g.dataset.bound) {
      g.dataset.bound = 1;
      $('trGo').addEventListener('click', function () { roll(); });
      $('trStage').addEventListener('click', function (e) { var c = e.target.closest && e.target.closest('.tr-card'); if (c && tphase === 'fan') pick(+c.dataset.i); });
      $('trUse').addEventListener('click', function () {
        if (!tcur) return; var inp = $('input'); if (!inp) return;
        var c = tcur.c, pos = tcur.rev ? '逆位' : '正位';
        inp.value = '【命运塔罗 · ' + c[0] + ' ' + c[1] + '（' + pos + '）】' + (tcur.rev ? c[6] : c[5]) + (tcur.ai ? ' ' + tcur.ai : '') + ' 请把它自然地写进下一段，不要生硬点题，也不要出现塔罗牌本身。';
        inp.dispatchEvent(new Event('input', { bubbles: true })); closeModal('fnTarot'); setTimeout(function () { inp.focus(); }, 380);
      });
    }
    if (!tbusy) { tphase = 'idle'; $('trStage').dataset.phase = 'idle'; $('trRead').classList.remove('on'); $('trGo').textContent = '洗牌'; $('trUse').disabled = true; $('trHint').textContent = '牌已备好'; $('trHint').classList.add('on'); stack(); }
    paintDex(); openModal('fnTarot');
  }

  function roll() {
    if (tbusy) return Promise.resolve(); tbusy = true; tcur = null;
    var st = $('trStage'), go = $('trGo'), els = cards(), T0 = reduce ? 0 : 1;
    go.disabled = true; $('trUse').disabled = true; $('trRead').classList.remove('on');
    st.dataset.phase = 'shuffle'; tphase = 'shuffle'; setHint('洗牌中……');
    var p = wait(0);
    if (tdeal.length) p = p.then(function () { stack(); return wait(700 * T0); });
    /* 两次交叉洗牌 */
    [0, 1].forEach(function () {
      p = p.then(function () { els.forEach(function (el, i) { var L = i % 2 === 0; pose(el, (L ? -78 : 78) + (Math.random() * 6 - 3), -i * 0.6, L ? -9 : 9); }); return wait(420 * T0); })
        .then(function () { els.forEach(function (el, i) { pose(el, 0, -i * 0.7, (Math.random() * 4 - 2), 1, (i * 3 + 1) % NCARD); }); return wait(420 * T0); });
    });
    /* 展开成扇形 */
    return p.then(function () {
      var ids = shuffled(); tdeal = ids.slice(0, NCARD);
      els.forEach(function (el, i) {
        var t = (i - (NCARD - 1) / 2) / ((NCARD - 1) / 2), a = t * 26, R = 360, r = a * Math.PI / 180;
        el.querySelector('.tr-f').innerHTML = ''; el.tabIndex = 0;
        setTimeout(function () { pose(el, R * Math.sin(r), R * (1 - Math.cos(r)) - 8, a, 1, i); }, i * 70 * T0);
      });
      return wait((NCARD * 70 + 700) * T0);
    }).then(function () {
      st.dataset.phase = 'fan'; tphase = 'fan'; setHint('凭直觉，选一张'); go.textContent = '重新洗牌'; go.disabled = false; tbusy = false;
      var first = els[Math.floor(NCARD / 2)]; if (first) first.focus({ preventScroll: true });
    });
  }

  function pick(i) {
    if (tbusy) return; tbusy = true; tphase = 'reveal';
    var st = $('trStage'), els = cards(), el = els[i], idx = tdeal[i], c = ARC[idx], rev = Math.random() < 0.3, T0 = reduce ? 0 : 1;
    tcur = { c: c, i: idx, rev: rev, ai: '' }; dex()[idx] = 1; save();
    $('trGo').disabled = true; st.dataset.phase = 'reveal'; setHint('');
    els.forEach(function (o, j) { if (j !== i) { o.classList.add('gone'); o.tabIndex = -1; pose(o, (j - i) * 30, 120, (j - i) * 8, .8); } });
    el.classList.add('chosen'); el.tabIndex = -1;
    var f = el.querySelector('.tr-f'); f.innerHTML = face(c); f.classList.toggle('rev', rev);
    pose(el, 0, -14, 0, 1.25, 50);
    return wait(650 * T0).then(function () { el.classList.add('flip'); return wait(1000 * T0); })
      .then(function () { pose(el, -168, 6, 0, 1.4, 50); st.dataset.phase = 'read'; return wait(500 * T0); })
      .then(function () {
        var r = $('trRead'), pos = rev ? '逆位 · Inversa' : '正位 · Recta';
        r.innerHTML = '<div class="tr-rh"><span class="tr-rn">' + c[0] + '</span><b>' + c[1] + '</b><i>' + c[2] + '</i></div>' +
          '<div class="tr-pos' + (rev ? ' rev' : '') + '">' + pos + '</div><div class="tr-kw">' + c[4] + '</div>' +
          '<p class="tr-p" id="trP"></p><div class="tr-ai" id="trAi"></div>';
        r.classList.add('on');
        return type($('trP'), rev ? c[6] : c[5]);
      })
      .then(function () {
        $('trUse').disabled = false; $('trGo').disabled = false; tbusy = false; paintDex();
        var ai = $('trAi');
        if (!hasKey() || !pid()) { ai.innerHTML = '<span class="tr-note">' + (pid() ? '在系统配置填 API Key 后，会结合你这本书再解读一次。' : '建好作品后，会结合你的书来解读。') + '</span>'; return; }
        ai.innerHTML = '<span class="tr-lbl">为《' + esc(bookName()) + '》解读</span><p class="tr-p fn-typing" id="trAiP"></p>';
        var cs = D.listCards(pid(), 'character').slice(0, 8).map(function (x) { return '- ' + cardLine(x).slice(0, 80); }).join('\n');
        var ths = D.listThreads(pid()).filter(function (t) { return t.status === 'open'; }).slice(0, 5).map(function (t) { return '- ' + t.name; }).join('\n');
        var mine = tcur;
        return llm([
          { role: 'system', content: '你是一位小说写作顾问。作者抽到了一张塔罗牌，你只把牌意当成写作提示，结合这本书给出下一段的具体剧情方向。不谈占卜、命运和玄学，不提塔罗本身，只谈剧情。用中文，60 到 110 字，写成一段话，要点出具体的人物或伏笔。只输出这段话。' },
          { role: 'user', content: '书名：《' + bookName() + '》\n牌：' + c[1] + '（' + (rev ? '逆位' : '正位') + '），关键词：' + c[4] + '\n牌意提示：' + (rev ? c[6] : c[5]) + '\n\n人物：\n' + (cs || '（暂无）') + '\n\n未回收伏笔：\n' + (ths || '（暂无）') + '\n\n最近的正文：\n' + (chapterTail(700) || '（还没开始写）') }
        ], { fast: true, temperature: 0.85, max_tokens: 300 })
          .then(function (t) { t = String(t || '').trim(); if (tcur !== mine) return; mine.ai = t; return type($('trAiP'), t); })
          .catch(function (e) { var p = $('trAiP'); if (p) p.textContent = '（没能解读：' + e.message + '）'; })
          .then(function () { var p = $('trAiP'); if (p) p.classList.remove('fn-typing'); });
      });
  }
  function type(el, txt) {
    if (!el) return Promise.resolve(); var k = 0;
    return new Promise(function (res) { (function step() { el.textContent = txt.slice(0, ++k); if (k < txt.length) setTimeout(step, reduce ? 0 : 34); else res(); })(); });
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
    var dice = document.createElement('button'); dice.type = 'button'; dice.id = 'fnDiceBtn'; dice.className = 'fn-headbtn zhu'; dice.setAttribute('aria-label', '命运塔罗');
    dice.innerHTML = '<span class="fn-tcard" aria-hidden="true"><i></i></span><span class="fn-swap"><span class="zh">命运塔罗</span><span class="la" aria-hidden="true">Arcana</span></span>';
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
