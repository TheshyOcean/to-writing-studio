/* ============================================================
   To Writing Studio · 剧情完成 Finis（V3.6.0）
   ------------------------------------------------------------
   写完一段剧情时，弹一条「《剧情名》已完成」的横幅，给一点仪式感。
   - 什么时候检查：某一章保存后停笔 40 秒，且这章已有 1200 字以上、
     比上次检查又多了 400 字以上，才用便宜的快模型读一下本章结尾。
   - 怎么判断：让模型判断「这一段剧情是不是收束了」，并起一个短名字；
     参考「智能定义 → 情节图」的段落名（有的话）。拿不准（conf < 0.72）就不弹。
   - 每章只庆祝一次，结果存在章节的 finis 字段：{ cw: 上次检查时的字数, done: {title,line,at} }
   - 开关：系统配置 →「剧情完成 Finis」，默认开，需要 API Key（tws_finis，'0' 为关）
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var KEY = 'tws_finis';
  var MIN_WORDS = 1200, STEP_WORDS = 400, IDLE_MS = 40000, CONF = 0.72;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function D() { return T.data; }
  function S() { return (window.__ENDF__ && window.__ENDF__.S) || null; }
  function esc(s) { return D().esc(s); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function on() { return lsGet(KEY) !== '0'; }
  function toast(m) { if (T.ui) T.ui.toast(m); }

  /* ---------------- 便宜的快模型（和长篇记忆同一套） ---------------- */
  function request(sys, user) {
    var s = S() || {};
    var ds = /deepseek/i.test((s.provider || '') + ' ' + (s.baseUrl || '') + ' ' + (s.model || ''));
    var body = { model: ds ? 'deepseek-flash' : s.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.2, stream: false, max_tokens: 300 };
    if (ds) body.thinking = { type: 'disabled' };
    return fetch(String(s.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; });
  }
  function parseJson(txt) {
    var s = String(txt || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(s); } catch (e) {}
    var m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
    return null;
  }
  function beats() {
    try {
      var all = JSON.parse(lsGet('tws_define_v1') || '{}'), mine = all[D().D.activeProject] || {};
      return Array.isArray(mine.beats) ? mine.beats : [];
    } catch (e) { return []; }
  }

  var SYS = '你是小说编辑。判断这一章写到现在，是不是刚好完成了一段剧情——一个事件、一场戏或一条小线索有了明确的收束' +
    '（冲突有了结果、目标达成或落空、谜底揭开、人物关系发生了确定的变化），而不是写到一半、还在铺垫或正处在高潮中间。\n' +
    '要严格：只是告一段落、换了个场景、或者结尾留了个钩子但事情本身没有结果，都不算完成。\n' +
    '如果完成了，给这段剧情起一个名字：4～10 个字，像任务名，有画面感，不要书名号，不要出现「完成」「结束」；再写一句不超过 30 字的小结。\n' +
    '只输出 JSON：{"done":true,"conf":0.0~1.0,"title":"剧情名","line":"一句话小结"}；没完成就输出 {"done":false,"conf":0.0~1.0}';

  function judge(c) {
    var d = D(), p = d.getProject(d.D.activeProject), text = String(c.content || '');
    var bs = beats().filter(function (b) { return b && b.t; }).slice(0, 8);
    var user = (p ? '作品：《' + p.name + '》\n' : '') + '本章：' + c.title + '\n' +
      (bs.length ? '作者的情节图（参考，用来给剧情起名）：\n' + bs.map(function (b) { return '- ' + b.k + '：' + String(b.t).slice(0, 60); }).join('\n') + '\n' : '') +
      (c.sum && c.sum.text ? '本章早先的摘要：' + c.sum.text + '\n' : '') +
      '\n【本章开头】\n' + text.slice(0, 600) + '\n\n【本章最新写到的部分】\n' + text.slice(-3000);
    return request(SYS, user).then(parseJson);
  }

  /* ---------------- 什么时候检查 ---------------- */
  var timer = 0, busy = false, failAt = 0;
  function candidate() {
    var d = D(), pid = d.D.activeProject; if (!pid) return null;
    var vids = d.listVolumes(pid).map(function (v) { return v.id; });
    var list = d.D.chapters.filter(function (c) { return vids.indexOf(c.volumeId) >= 0; })
      .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    var c = list[0];
    if (!c || (c.words || 0) < MIN_WORDS) return null;
    var f = c.finis || {};
    if (f.done) return null;
    if ((c.words || 0) - (f.cw || 0) < STEP_WORDS) return null;
    return c;
  }
  function check() {
    var s = S();
    if (!on() || busy || !s || !s.apiKey || s.gen) return;
    if (Date.now() - failAt < 10 * 60 * 1000) return;
    var c = candidate(); if (!c) return;
    busy = true;
    var words = c.words || 0;
    judge(c).then(function (r) {
      var cur = D().getChapter(c.id); if (!cur) return;
      cur.finis = cur.finis || {};
      cur.finis.cw = words;
      var ok = r && r.done === true && Number(r.conf) >= CONF && String(r.title || '').trim();
      if (ok) {
        var title = String(r.title).replace(/[《》「」"“”]/g, '').trim().slice(0, 14);
        cur.finis.done = { title: title, line: String(r.line || '').trim().slice(0, 40), at: Date.now() };
      }
      D().save();
      if (ok) play(cur.finis.done.title, cur, cur.finis.done.line);
    }).catch(function (e) {
      failAt = Date.now();
      console.warn('[剧情完成]', e && e.message);
    }).then(function () { busy = false; });
  }
  function schedule() {
    clearTimeout(timer);
    if (!on()) return;
    timer = setTimeout(check, IDLE_MS);
  }

  /* ---------------- 动画 ---------------- */
  function chime() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ac = new AC(), t0 = ac.currentTime + 0.05;
      [[523.25, 0], [659.25, 0.16], [783.99, 0.32], [1046.5, 0.5]].forEach(function (n) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t0 + n[1]);
        g.gain.exponentialRampToValueAtTime(0.07, t0 + n[1] + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 1.1);
        o.connect(g); g.connect(ac.destination); o.start(t0 + n[1]); o.stop(t0 + n[1] + 1.2);
      });
      setTimeout(function () { ac.close(); }, 2200);
    } catch (e) {}
  }
  function nextChapter(c) {
    var d = D();
    var list = d.listChapters(c.volumeId), i = list.findIndex(function (x) { return x.id === c.id; });
    var nx = list[i + 1];
    if (!nx) {
      /* 这一卷后面没有了：看下一卷，再没有就新建一章 */
      var vols = d.listVolumes(d.D.activeProject), vi = vols.findIndex(function (v) { return v.id === c.volumeId; });
      var nv = vols[vi + 1], first = nv && d.listChapters(nv.id)[0];
      nx = first || d.addChapter(c.volumeId, '第' + (list.length + 1) + '章');
    }
    T.flushSave && T.flushSave();
    if (T.ui) T.ui.setChapter(nx.id);
    if (window.showView) window.showView('v-book');
    T.openChapter && T.openChapter(nx.id);
  }
  /* 烫金卷草花饰：一道带卷的细线，末端一颗小菱形；右边那道是左边的镜像 */
  var GOLD = '<linearGradient id="finGold-$" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6a1f"/><stop offset=".35" stop-color="#e6c56c"/>' +
    '<stop offset=".55" stop-color="#fff1c2"/><stop offset=".75" stop-color="#c9a243"/><stop offset="1" stop-color="#8a6a1f"/></linearGradient>';
  function flourish(side) {
    return '<svg class="fin-fl ' + side + '" viewBox="0 0 120 24" fill="none"><defs>' + GOLD.replace('$', side) + '</defs>' +
      '<path class="ln" d="M118 12 C98 12 86 4 72 7 C60 10 63 20 52 19 C43 18 44 9 51 9 C57 9 57 16 50 17 C38 19 24 12 8 12" stroke="url(#finGold-' + side + ')" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path class="dm" d="M0 12 L3.5 9.2 L7 12 L3.5 14.8 Z" fill="url(#finGold-' + side + ')"/></svg>';
  }
  var live = null;
  function play(title, chapter, line) {
    if (live) live.close(true);
    title = String(title || '这一段剧情');
    var vol = chapter && D().D.volumes.filter(function (v) { return v.id === chapter.volumeId; })[0];
    var sub = chapter ? (vol ? vol.title + ' · ' : '') + chapter.title : '';
    var chars = Array.prototype.map.call(title, function (ch, i) {
      return '<span style="--i:' + i + '">' + esc(ch) + '</span>';
    }).join('');
    var n = title.length;
    var wrap = document.createElement('div');
    wrap.className = 'fin-wrap' + (reduce ? ' still' : '');
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', '《' + title + '》已完成');
    wrap.style.setProperty('--n', n);
    wrap.innerHTML =
      '<div class="fin-band">' +
        '<i class="fin-rule t"></i><i class="fin-rule b"></i>' +
        '<div class="fin-kicker"><i></i>剧情完成<i></i></div>' +
        '<div class="fin-title"><b class="q">《</b>' + chars + '<b class="q r">》</b></div>' +
        '<div class="fin-gold" aria-hidden="true">' + flourish('l') + '<span class="fin-script">Finis</span>' + flourish('r') + '</div>' +
        (sub ? '<div class="fin-sub">' + esc(sub) + '</div>' : '') +
        (line ? '<div class="fin-line">' + esc(line) + '</div>' : '') +
        '<div class="fin-acts">' + (chapter ? '<button type="button" data-a="next">开始下一章</button>' : '') +
        '<button type="button" data-a="ok">好</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    if (!reduce) setTimeout(chime, 450);
    var hover = false, autoT = 0;
    function close(fast) {
      clearTimeout(autoT);
      if (!wrap.parentNode) return;
      wrap.classList.add('out');
      setTimeout(function () { wrap.remove(); }, fast ? 0 : 520);
      document.removeEventListener('keydown', onKey, true);
      if (live && live.el === wrap) live = null;
    }
    function arm() { clearTimeout(autoT); autoT = setTimeout(function () { if (!hover) close(); }, 7000 + n * 60); }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } }
    wrap.addEventListener('mouseenter', function () { hover = true; clearTimeout(autoT); });
    wrap.addEventListener('mouseleave', function () { hover = false; arm(); });
    wrap.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'next' && chapter) { close(); nextChapter(chapter); return; }
      close();
    });
    document.addEventListener('keydown', onKey, true);
    arm();
    live = { el: wrap, close: close };
  }

  /* ---------------- 系统配置里的一行 ---------------- */
  function paintCfg() {
    var seg = document.getElementById('finSeg'); if (!seg) return;
    seg.querySelectorAll('button[data-v]').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === '1') === on()); });
  }
  function buildCfg() {
    if (document.getElementById('finSeg')) return true;
    var mem = document.getElementById('flMem'), sec = mem && mem.closest('.cfg-sec');
    if (!sec) return false;
    var box = document.createElement('div');
    box.innerHTML =
      '<div class="st-luxrow br-cfg"><div class="k"><b>剧情完成 <span class="lat" style="font-size:15px;color:var(--mut)">Finis</span></b>' +
        '<span>写完一段剧情时，弹一条「《剧情名》已完成」的横幅。停笔一会儿后，用便宜的快模型读一下本章结尾判断，每章只庆祝一次；拿不准就不弹。需要 API Key，每次判断用很少的 Token。</span>' +
        '<div class="br-seg" id="finSeg"><button type="button" data-v="1">开启</button><button type="button" data-v="0">关闭</button><button type="button" id="finDemo">看看效果</button></div></div></div>';
    while (box.firstChild) sec.appendChild(box.firstChild);
    document.getElementById('finSeg').addEventListener('click', function (e) {
      if (e.target.closest('#finDemo')) {
        var c = D().getChapter(T.currentChapter && T.currentChapter());
        play('初来乍到', c || null, '老师终于走进了阿拜多斯的校门。');
        return;
      }
      var b = e.target.closest('button[data-v]'); if (!b) return;
      lsSet(KEY, b.dataset.v); paintCfg();
      toast(b.dataset.v === '1' ? '剧情完成提示已开启' : '剧情完成提示已关闭');
      if (b.dataset.v === '1') schedule(); else clearTimeout(timer);
    });
    paintCfg();
    return true;
  }

  function init() {
    if (D() && D().onSave) D().onSave(schedule);
    var n = 0;
    (function tryCfg() { if (!buildCfg() && n++ < 40) setTimeout(tryCfg, 300); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.finis = { play: play, check: check, _judge: judge, _candidate: candidate };
})();
