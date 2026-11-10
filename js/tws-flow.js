/* ============================================================
   To Writing Studio · 写作流（自动采纳 + 长篇记忆）
   ------------------------------------------------------------
   ① 自动采纳：AI 写完一段正文，直接追加到这场对话对应的章节里，
      不用每次点「采纳到本章」。闲聊、提问、列提纲不会进正文；
      每次写入都留版本快照，消息下方可以一键撤销；
      「重生成」会把上一版换掉，而不是再叠一份。
   ② 长篇记忆：每章写完后让模型写一段摘要（存在章节的 sum 字段里），
      续写时把前面各章的摘要拼进提示词，AI 就记得前面发生过什么。

   两者都靠 studio.js 同样的办法感知「AI 写完了一段」：
   最后一条消息是 AI 的、不在流式输出、也不是打开页面前就有的旧回复。
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var ADOPT_KEY = 'tws_autoadopt';   // '1' 开 / 其它 关（默认关）
  var MEM_KEY = 'tws_memory';        // '0' 关 / 其它 开（默认开）
  var HINT_KEY = 'tws_adopt_hint';

  var MIN_PROSE = 200;               // 少于这么多字的回复不算一段正文
  var MIN_SUM_WORDS = 300;           // 少于这么多字的章节不写摘要
  var SUM_BUDGET = 5000;             // 前情提要最多占多少字
  var SUM_FULL = 3500;               // 其中这么多字以内的摘要原样带上，更早的只留开头

  /* ---------------- 小工具 ---------------- */
  function D() { return T.data; }
  function api() { return window.__ENDF__ || null; }
  function S() { var a = api(); return a && a.S; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
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
  function bare(s) { return String(s || '').replace(/\s/g, ''); }
  function curConv() {
    var s = S(); if (!s) return null;
    return (s.convs || []).filter(function (c) { return c.id === s.activeId; })[0] || null;
  }
  function saveChat() { try { api().save(); } catch (e) {} }
  function allChapters(pid) {
    var d = D(), r = [];
    d.listVolumes(pid).forEach(function (v) { r = r.concat(d.listChapters(v.id)); });
    return r;
  }
  /* 这场对话在写哪一章：先找绑定了这场对话的章节，找不到就用书稿里当前打开的那章 */
  function chapterOfConv(conv) {
    var d = D(); if (!d) return null;
    var pid = d.D.activeProject; if (!pid) return null;
    var chs = allChapters(pid), hit = null;
    if (conv) hit = chs.filter(function (c) { return c.convId === conv.id; })[0] || null;
    if (!hit) {
      var id = (T.currentChapter && T.currentChapter()) || d.D.activeChapter;
      hit = chs.filter(function (c) { return c.id === id; })[0] || null;
    }
    return hit;
  }

  /* ============================================================
     ① 自动采纳
     ============================================================ */
  function adoptOn() { return lsGet(ADOPT_KEY) === '1'; }

  var HEAD_META = /^(好的|好嘞|好呀|好啊|当然|没问题|可以的?|明白了?|收到|嗯|行|以下是|下面是|这是|这里是|我来|我为你|我帮你|我给你|那我|让我|根据你|按照你|按你|接着上文|承接上文|续写如下|正文如下|为你|已为你|帮你)/;
  var TAIL_META = /^(希望|如果你|如果需要|如需|需要我|要不要|接下来|你觉得|你想|你希望|想让我|告诉我|以上|上面|这一段|这段|本段|（注|\(注|注：|注:|PS|P\.S|说明：|备注：|——以上|怎么样)/;
  function isMeta(p, head) {
    var b = bare(p);
    if (!b) return true;
    if (/^([-*_—=]){3,}$/.test(b)) return true;                       // 分隔线
    if (/^#{1,6}\s/.test(p) && p.indexOf('\n') < 0) return true;       // 单独一行的标题
    if (/^\*\*[^*\n]{1,40}\*\*$/.test(p.trim())) return true;          // 单独一行的加粗标题
    if (/^[（(][^）)\n]{0,40}(完|待续|未完|字数|约\d+字)[^）)\n]{0,12}[）)]$/.test(b)) return true;   // （本章完）（未完待续）
    if (b.length > 140) return false;                                  // 长段落一律当正文
    if (/^[「“"『]/.test(b)) return false;                             // 以引号开头的是台词
    if (head) return HEAD_META.test(b) || /[：:]$/.test(b);
    return TAIL_META.test(b) || (/[？?]$/.test(b) && /(你|要不要|需要|是否|继续|接着)/.test(b));
  }
  /* 从一条 AI 回复里取出正文；不像正文就返回空串 */
  function extractProse(raw) {
    var t = String(raw || '').replace(/\r/g, '');
    if (/^\s*\*\*请求失败\*\*/.test(t) || t.trim() === '（已停止）') return '';
    t = t.replace(/```[\s\S]*?```/g, '').replace(/```[\s\S]*$/, '');   // 代码块（含 tws 指令）
    var total = bare(t).length;
    if (total < MIN_PROSE) return '';
    /* 提纲 / 列表为主的回复不是正文 */
    var lines = t.split('\n').filter(function (l) { return l.trim(); });
    var listy = lines.filter(function (l) { return /^\s*([-*•·]|\d+[.、)）]|[（(]?[一二三四五六七八九十]+[、.）)])\s*\S/.test(l); }).length;
    if (lines.length >= 3 && listy / lines.length > 0.4) return '';
    if (/^\s*\|.*\|\s*$/m.test(t)) return '';                           // 有表格
    var paras = t.split(/\n\s*\n/).map(function (p) { return p.replace(/^\s+|\s+$/g, ''); }).filter(Boolean);
    while (paras.length && isMeta(paras[0], true)) paras.shift();
    while (paras.length && isMeta(paras[paras.length - 1], false)) paras.pop();
    paras = paras.filter(function (p) { return !/^([-*_—=]\s*){3,}$/.test(p) && !(/^#{1,6}\s/.test(p) && p.indexOf('\n') < 0); });
    var out = paras.join('\n\n')
      .replace(/^#{1,6}\s+.*$/gm, '')                 // 夹在段里的标题行
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')            // 正文是纯文本，去掉 markdown 记号
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
      .replace(/^>\s?/gm, '')
      .replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    var n = bare(out).length;
    if (n < MIN_PROSE || n / total < 0.6) return '';
    return out;
  }
  function sig(text) { return text.length + ':' + text.slice(-24); }
  function endsWithSig(content, s) {
    if (!s) return false;
    var i = s.indexOf(':'), len = +s.slice(0, i), tail = s.slice(i + 1);
    return content.length >= len && content.slice(-tail.length) === tail ? len : 0;
  }

  /* 打开页面前就有的回复不动 */
  var loadKeys = {};
  function snapshot() {
    loadKeys = {};
    var s = S(); if (!s) return;
    (s.convs || []).forEach(function (c) { (c.msgs || []).forEach(function (m, i) { loadKeys[c.id + ':' + i] = m.c; }); });
  }

  function refreshBook(chId) {
    try { if (T.refreshViews) T.refreshViews(); } catch (e) {}
    try { if (T.currentChapter && T.currentChapter() === chId && T.renderEditor) T.renderEditor(); } catch (e) {}
  }

  function maybeAdopt() {
    var s = S(), d = D();
    if (!s || !d || !adoptOn() || s.gen) return;
    var conv = curConv(); if (!conv || !conv.msgs || !conv.msgs.length) return;
    var i = conv.msgs.length - 1, m = conv.msgs[i];
    if (!m || m.r !== 'ai' || m.stream || !m.c || m.ad) return;
    if (loadKeys[conv.id + ':' + i] === m.c) return;
    var prose = extractProse(m.c);
    if (!prose) { m.ad = { st: 'skip' }; return; }
    var ch = chapterOfConv(conv);
    if (!ch) { m.ad = { st: 'skip' }; return; }
    try { if (T.flushSave) T.flushSave(); } catch (e) {}
    ch = d.getChapter(ch.id);
    var base = ch.content || '', replaced = false, last = conv.adLast;
    /* 重生成：上一版就在这一章的末尾，把它换掉 */
    if (last && last.ch === ch.id && last.i === i) {
      var len = endsWithSig(base, last.sig);
      if (len) { base = base.slice(0, base.length - len).replace(/\s+$/, ''); replaced = true; }
    }
    d.saveChapterContent(ch.id, (base ? base + '\n\n' : '') + prose, replaced ? 'AI 重生成前' : 'AI 自动采纳前');
    m.ad = { st: 'done', ch: ch.id, n: d.countWords(prose), re: replaced ? 1 : 0 };
    conv.adLast = { i: i, ch: ch.id, sig: sig(prose) };
    saveChat();
    refreshBook(ch.id);
  }

  function undoAdopt(conv, i) {
    var d = D(), m = conv.msgs[i]; if (!m || !m.ad || m.ad.st !== 'done') return;
    var ch = d.getChapter(m.ad.ch);
    if (!ch) { toast('那一章已经不在了'); m.ad = { st: 'undone' }; saveChat(); paint(); return; }
    try { if (T.flushSave) T.flushSave(); } catch (e) {}
    var prose = extractProse(m.c), content = ch.content || '';
    if (!prose || content.slice(-prose.length) !== prose) {
      toast('「' + ch.title + '」后来又改过，到「书稿 → 历史」里回滚到「AI 自动采纳前」');
      return;
    }
    d.saveChapterContent(ch.id, content.slice(0, content.length - prose.length).replace(/\s+$/, ''), '撤销自动采纳前');
    m.ad = { st: 'undone', ch: ch.id };
    if (conv.adLast && conv.adLast.i === i) conv.adLast = null;
    saveChat(); refreshBook(ch.id); paint();
    toast('已从「' + ch.title + '」撤回这一段');
  }

  function paint() {
    var chat = document.getElementById('chat'), conv = curConv(), d = D();
    if (!chat || !conv || !d) return;
    chat.querySelectorAll('.msg.ai[data-i]').forEach(function (el) {
      var i = +el.getAttribute('data-i'), m = conv.msgs[i], bub = el.querySelector('.bub'); if (!bub) return;
      var box = bub.querySelector('.fl-ad'), ad = m && m.ad, btn = el.querySelector('.tws-adopt');
      var show = ad && (ad.st === 'done' || ad.st === 'undone');
      if (btn) btn.style.display = ad && ad.st === 'done' ? 'none' : '';
      if (!show) { if (box) box.remove(); return; }
      var key = ad.st + ':' + ad.ch + ':' + (ad.n || 0);
      if (box && box.dataset.key === key) return;
      if (!box) { box = document.createElement('div'); box.className = 'fl-ad'; bub.appendChild(box); }
      box.dataset.key = key;
      var ch = d.getChapter(ad.ch), name = ch ? ch.title : '已删除的章节';
      if (ad.st === 'done') {
        box.innerHTML = '<span>✦ ' + (ad.re ? '已换成这一版，写入' : '已写入') + '「' + esc(name) + '」 · ' + d.fmtNum(ad.n) + ' 字</span>' +
          '<button type="button" class="fl-ad-undo">撤销</button>';
        box.querySelector('.fl-ad-undo').addEventListener('click', function (e) { e.stopPropagation(); undoAdopt(conv, i); });
      } else {
        box.classList.add('off');
        box.innerHTML = '<span>已撤回，这一段没有进「' + esc(name) + '」。需要的话点上面的「采纳到本章」</span>';
      }
    });
  }

  /* 手动点了几次「采纳到本章」之后，提示一次可以开自动 */
  function hintOnce(e) {
    if (!e.target.closest || !e.target.closest('.tws-adopt') || adoptOn()) return;
    var n = (+lsGet(HINT_KEY) || 0) + 1; lsSet(HINT_KEY, String(n));
    if (n === 3) setTimeout(function () { toast('嫌每次点麻烦？「系统配置」里可以开启自动采纳'); }, 1800);
  }

  /* ============================================================
     ② 长篇记忆：章节摘要
     ============================================================ */
  function memOn() { return lsGet(MEM_KEY) !== '0'; }
  function sumState(c) {
    var w = c.words || 0, sm = c.sum;
    if (sm && sm.text) {
      if (sm.src === 'manual') return 'ok';
      var diff = Math.abs(w - (sm.w || 0));
      return diff > Math.max(300, (sm.w || 0) * 0.25) ? 'stale' : 'ok';
    }
    return w < MIN_SUM_WORDS ? 'short' : 'none';
  }
  function request(sys, user) {
    var s = S() || {};
    var ds = /deepseek/i.test((s.provider || '') + ' ' + (s.baseUrl || '') + ' ' + (s.model || ''));
    var body = { model: ds ? 'deepseek-flash' : s.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.2, stream: false, max_tokens: 600 };
    if (ds) body.thinking = { type: 'disabled' };
    return fetch(String(s.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; });
  }
  var SUM_SYS = '你是小说编辑。用 150～250 个字概括下面这一章，给以后续写时当「前情提要」用。\n' +
    '要写清楚：发生了哪几件事、谁做了什么、人物之间的关系或处境有什么变化、这一章停在哪里、留下了什么悬念。\n' +
    '要求：只写原文里有的事实，按发生顺序写，人名用原文的写法；不评价、不分点、不加标题、不要开场白，直接输出这一段概括。';
  function summarize(ch) {
    var s = S();
    if (!s || !s.apiKey) return Promise.reject(new Error('NO_KEY'));
    var text = String(ch.content || '');
    if (text.length > 12000) text = text.slice(0, 6000) + '\n……（中间略）……\n' + text.slice(-6000);
    var words = ch.words || 0;
    return request(SUM_SYS, '《' + ch.title + '》\n\n' + text).then(function (out) {
      out = String(out || '').replace(/```[\s\S]*?```/g, '').replace(/^\s*(概括|摘要|前情提要)[:：]\s*/, '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, 420);
      if (out.length < 20) throw new Error('模型没有给出摘要');
      var c = D().getChapter(ch.id); if (!c) return '';
      c.sum = { text: out, w: words, at: Date.now(), src: 'ai' };
      D().save();
      return out;
    });
  }
  var sumBusy = false, sumFail = {}, sumPause = 0;
  function maybeSummarize() {
    var s = S(), d = D();
    if (!s || !d || !memOn() || sumBusy || s.gen || !s.apiKey || Date.now() < sumPause) return;
    var pid = d.D.activeProject; if (!pid) return;
    var cur = chapterOfConv(curConv()), now = Date.now();
    var todo = allChapters(pid).filter(function (c) {
      var st = sumState(c);
      if (st !== 'none' && st !== 'stale') return false;
      if (cur && c.id === cur.id && c.status !== 'final') return false;   // 正在写的这章先不概括，写完换章再说
      return !(sumFail[c.id] && now - sumFail[c.id] < 10 * 60 * 1000);
    })[0];
    if (!todo) return;
    sumBusy = true;
    summarize(todo).catch(function (e) {
      sumFail[todo.id] = Date.now();
      if (/HTTP (401|402|403|429)/.test(String(e && e.message))) sumPause = Date.now() + 10 * 60 * 1000;   // Key 或额度有问题，别一直重试
    }).then(function () { sumBusy = false; refreshCfg(); });
  }

  /* 拼进提示词的「前情提要」；desktop.html / mobile.html 的 buildMessages 会调用 */
  function memPrompt() {
    var d = D(); if (!d || !memOn()) return '';
    var pid = d.D.activeProject; if (!pid) return '';
    var chs = allChapters(pid), cur = chapterOfConv(curConv()); if (!cur) return '';
    var ci = -1; chs.forEach(function (c, i) { if (c.id === cur.id) ci = i; });
    if (ci <= 0) return '';
    var used = 0, lines = [], skipped = 0;
    for (var i = ci - 1; i >= 0; i--) {
      var c = chs[i], t = c.sum && c.sum.text;
      if (!t) continue;
      if (used >= SUM_BUDGET) { skipped++; continue; }
      if (used >= SUM_FULL && t.length > 90) t = t.slice(0, 88) + '…';
      used += t.length;
      lines.unshift('第 ' + (i + 1) + ' 章「' + c.title + '」：' + t);
    }
    var out = '';
    if (lines.length) {
      out += '\n\n【前情提要】下面是当前这章之前各章的摘要，按先后顺序排列' + (skipped ? '（更早的 ' + skipped + ' 章从略）' : '') +
        '。续写时人物、事件、时间都要和它们对得上，不要重写已经发生过的情节：\n' + lines.join('\n');
    }
    /* 新开的一章：把上一章的结尾带上，方便接着写（灵光模式自己会带，不重复） */
    var lux = false; try { lux = !!(window.TWSLux && window.TWSLux.on()); } catch (e) {}
    var prev = chs[ci - 1];
    if (!lux && prev && prev.content && (cur.words || 0) < 200) {
      out += '\n\n【上一章「' + prev.title + '」的结尾】\n' + String(prev.content).slice(-600);
    }
    return out;
  }

  /* ---------------- 摘要面板 ---------------- */
  var STATE_NAME = { ok: '', stale: '正文改动较大，摘要可能过期', none: '还没有摘要', short: '不到 ' + MIN_SUM_WORDS + ' 字，暂不概括' };
  function openPanel() {
    var d = D(), pid = d && d.D.activeProject;
    if (!pid) { toast('先建一部作品'); return; }
    var chs = allChapters(pid);
    var wrap = document.createElement('div');
    wrap.className = 'tws-modal-wrap fl-mem';
    function rows() {
      if (!chs.length) return '<p class="fl-mem-nil">还没有章节。</p>';
      return chs.map(function (c, i) {
        var st = sumState(c), sm = c.sum && c.sum.text || '';
        return '<div class="fl-mem-row" data-id="' + c.id + '">' +
          '<div class="fl-mem-h"><b>第 ' + (i + 1) + ' 章 · ' + esc(c.title) + '</b><i>' + d.fmtNum(c.words || 0) + ' 字</i>' +
          (STATE_NAME[st] ? '<em class="st-' + st + '">' + STATE_NAME[st] + '</em>' : (c.sum && c.sum.src === 'manual' ? '<em>手写</em>' : '')) +
          '<button type="button" class="tws-btn sm" data-gen' + (st === 'short' && !sm ? ' disabled' : '') + '>' + (sm ? '重新生成' : '生成') + '</button></div>' +
          '<textarea rows="3" placeholder="' + (st === 'short' ? '这章还短，也可以自己写一句概括' : '还没有摘要。点「生成」，或者自己写') + '">' + esc(sm) + '</textarea>' +
          '</div>';
      }).join('');
    }
    wrap.innerHTML =
      '<div class="tws-modal">' +
        '<div class="tws-modal-h"><span class="sq"></span><b>章节摘要</b><button class="tws-x" data-close>✕</button></div>' +
        '<div class="tws-modal-b"><p class="fl-mem-tip">续写某一章时，它前面各章的摘要会一起发给 AI。摘要可以直接改，改过的不会被自动覆盖。</p><div class="fl-mem-list">' + rows() + '</div></div>' +
        '<div class="tws-modal-f"><button class="tws-btn" data-all>生成全部缺少的</button><button class="tws-btn primary" data-close>完成</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    function close() { wrap.classList.remove('on'); setTimeout(function () { wrap.remove(); }, 260); refreshCfg(); }
    function redraw() { wrap.querySelector('.fl-mem-list').innerHTML = rows(); }
    function gen(id, btn) {
      var c = d.getChapter(id); if (!c) return Promise.resolve();
      if (!(S() || {}).apiKey) { toast('先在「系统配置」填 API Key'); return Promise.reject(new Error('NO_KEY')); }
      if (!bare(c.content).length) { toast('这一章还没有正文'); return Promise.resolve(); }
      if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
      return summarize(c).then(function () { redraw(); }, function (e) {
        redraw(); toast('「' + c.title + '」的摘要没生成：' + (e && e.message || '未知错误')); throw e;
      });
    }
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.hasAttribute('data-close')) { close(); return; }
      var g = e.target.closest('[data-gen]');
      if (g) { gen(g.closest('.fl-mem-row').dataset.id, g).catch(function () {}); return; }
      var all = e.target.closest('[data-all]');
      if (all) {
        var todo = chs.filter(function (c) { var st = sumState(c); return st === 'none' || st === 'stale'; });
        if (!todo.length) { toast('没有需要生成的章节'); return; }
        all.disabled = true;
        var k = 0;
        (function next() {
          if (k >= todo.length || !document.body.contains(wrap)) { all.disabled = false; all.textContent = '生成全部缺少的'; if (k >= todo.length) toast('摘要都生成好了'); return; }
          all.textContent = '正在生成 ' + (k + 1) + ' / ' + todo.length;
          gen(todo[k++].id).then(next, function () { all.disabled = false; all.textContent = '生成全部缺少的'; });
        })();
      }
    });
    wrap.addEventListener('change', function (e) {
      if (e.target.tagName !== 'TEXTAREA') return;
      var row = e.target.closest('.fl-mem-row'), c = row && d.getChapter(row.dataset.id); if (!c) return;
      var v = e.target.value.trim();
      if (v) c.sum = { text: v.slice(0, 600), w: c.words || 0, at: Date.now(), src: 'manual' }; else delete c.sum;
      d.save(); toast(v ? '摘要已保存' : '摘要已清空');
    });
  }

  /* ============================================================
     系统配置里的两行开关
     ============================================================ */
  function memCount() {
    var d = D(), pid = d && d.D.activeProject; if (!pid) return '';
    var chs = allChapters(pid); if (!chs.length) return '';
    var n = chs.filter(function (c) { return c.sum && c.sum.text; }).length;
    return '已有 ' + n + ' / ' + chs.length + ' 章的摘要';
  }
  function refreshCfg() {
    var a = document.getElementById('flAdopt'), m = document.getElementById('flMem'), n = document.getElementById('flMemCount');
    if (a) a.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === '1') === adoptOn()); });
    if (m) m.querySelectorAll('button[data-v]').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === '1') === memOn()); });
    if (n) n.textContent = memCount();
  }
  function buildCfg() {
    if (document.getElementById('flAdopt')) return true;
    var night = document.getElementById('stNight'), sec = night && night.closest('.cfg-sec');
    if (!sec) return false;
    var box = document.createElement('div');
    box.innerHTML =
      '<div class="st-luxrow br-cfg"><div class="k"><b>自动采纳 <span class="lat" style="font-size:15px;color:var(--mut)">Scriba</span></b>' +
        '<span>AI 写完一段正文，直接追加到这场对话对应的章节，不用每次点「采纳到本章」。闲聊、提问和提纲不会进正文；每次写入都留版本，消息下方可以撤销，重生成会换掉上一版。</span>' +
        '<div class="br-seg" id="flAdopt"><button type="button" data-v="1">开启</button><button type="button" data-v="0">关闭</button></div></div></div>' +
      '<div class="st-luxrow br-cfg"><div class="k"><b>长篇记忆 <span class="lat" style="font-size:15px;color:var(--mut)">Memoria</span></b>' +
        '<span>每章写完后自动写一段摘要，续写时带上前面各章的摘要，AI 就记得前面发生过什么。每章会额外用少量 Token。</span>' +
        '<div class="br-seg" id="flMem"><button type="button" data-v="1">开启</button><button type="button" data-v="0">关闭</button><button type="button" id="flMemOpen">查看摘要</button></div>' +
        '<span class="br-desc" id="flMemCount"></span></div></div>';
    while (box.firstChild) sec.appendChild(box.firstChild);
    document.getElementById('flAdopt').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      lsSet(ADOPT_KEY, b.dataset.v);
      if (b.dataset.v === '1') snapshot();     // 开启之前已经有的回复不补采纳
      refreshCfg(); toast(b.dataset.v === '1' ? '自动采纳已开启' : '自动采纳已关闭');
    });
    document.getElementById('flMem').addEventListener('click', function (e) {
      if (e.target.closest('#flMemOpen')) { openPanel(); return; }
      var b = e.target.closest('button[data-v]'); if (!b) return;
      lsSet(MEM_KEY, b.dataset.v); refreshCfg(); toast(b.dataset.v === '1' ? '长篇记忆已开启' : '长篇记忆已关闭');
    });
    refreshCfg();
    return true;
  }

  /* ============================================================
     启动
     ============================================================ */
  var rq = 0;
  function tick() {
    if (rq) return;
    rq = requestAnimationFrame(function () {
      rq = 0;
      try { maybeAdopt(); paint(); maybeSummarize(); } catch (e) { console.warn('[TWS flow]', e); }
    });
  }
  function init() {
    if (!api() || !D()) { if ((init.n = (init.n || 0) + 1) < 60) setTimeout(init, 80); return; }
    snapshot();
    (function waitCfg() { if (!buildCfg() && (waitCfg.n = (waitCfg.n || 0) + 1) < 80) setTimeout(waitCfg, 100); })();
    var chat = document.getElementById('chat');
    if (chat) new MutationObserver(tick).observe(chat, { childList: true });
    document.addEventListener('click', function (e) { hintOnce(e); setTimeout(tick, 150); }, true);
    setInterval(tick, 4000);
    setInterval(refreshCfg, 6000);
    tick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  else setTimeout(init, 0);

  T.flow = { extractProse: extractProse, adoptOn: adoptOn, memOn: memOn, sumState: sumState, summarize: summarize, openPanel: openPanel, _tick: tick };
  T.memory = { prompt: memPrompt };
})();
