/* ============================================================
   To Writing Studio · 文笔体检 / 敏感词自查 / 起名器（V3.5.0）
   ------------------------------------------------------------
   三个都在「书稿 → 工具」里。
   - 文笔体检：纯本地统计，不用 API Key，不上传正文
   - 敏感词自查：内置一份很短的通用词表 + 自己的词表（存在 tws_sens_v1）
   - 起名器：本地词库随机组合；配了 Key 还可以让 AI 按本书世界观起
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  function D() { return T.data; }
  function U() { return T.ui; }
  function esc(s) { return D().esc(s); }
  function $(id) { return document.getElementById(id); }

  /* 跳到某一章的某个位置并选中 */
  function jumpTo(cid, pos, len) {
    if (window.showView) window.showView('v-book');
    if (T.currentChapter() !== cid || !$('twsContent')) T.openChapter(cid);
    if (document.documentElement.getAttribute('data-device') === 'phone') document.documentElement.setAttribute('data-m-book', 'edit');
    setTimeout(function () {
      var ta = $('twsContent'); if (!ta) return;
      ta.focus();
      try { ta.setSelectionRange(pos, pos + len); } catch (e) {}
      var box = $('twsEditor');
      if (box && T.kit) {
        var c = T.kit.caretXY(ta, pos);
        box.scrollTop = Math.max(0, ta.offsetTop + c.y - box.clientHeight * 0.35);
      }
    }, 320);
  }
  function snip(text, pos, len, ctx) {
    ctx = ctx || 14;
    var a = Math.max(0, pos - ctx), b = Math.min(text.length, pos + len + ctx);
    return (a > 0 ? '…' : '') + esc(text.slice(a, pos).replace(/\s+/g, ' ')) + '<mark>' + esc(text.slice(pos, pos + len)) + '</mark>' +
      esc(text.slice(pos + len, b).replace(/\s+/g, ' ')) + (b < text.length ? '…' : '');
  }
  function scopeChapters(scope) {
    var d = D(), pid = d.D.activeProject;
    if (scope === 'book') return U().allChapters(pid);
    var c = d.getChapter(T.currentChapter());
    return c ? [c] : [];
  }

  /* ============================================================
     文笔体检
     ============================================================ */
  var CLICHE = ['仿佛', '似乎', '不禁', '一丝', '微微', '缓缓', '淡淡', '轻轻', '深深', '默默', '忽然', '突然', '顿时', '竟然', '居然',
    '不由得', '不由自主', '下意识', '深吸一口气', '嘴角', '眼中闪过', '心中一动', '心头一', '与此同时', '然而', '莫名', '一股', '某种',
    '难以言喻', '无法形容', '说不出的', '仿若', '宛如', '犹如', '显然', '事实上', '毫无疑问', '值得一提', '总而言之'];
  var STOP = ('的 了 是 在 我 他 她 它 你 们 这 那 有 和 与 也 都 就 不 没 着 过 把 被 让 给 对 从 到 向 而 但 又 还 很 更 最 只 才 再 已 ' +
    '一个 没有 什么 自己 我们 他们 她们 你们 这个 那个 这样 那样 这些 那些 知道 可以 时候 已经 还是 就是 不是 但是 因为 所以 如果 ' +
    '然后 起来 出来 下来 过来 上去 下去 一样 一下 一些 一点 这里 那里 现在 之后 之前 怎么 为什么 只是 而且 或者 虽然 可是 不过 ' +
    '这么 那么 东西 地方 觉得 看到 看着 说道 开口 声音 时间 有些 有点 似的 一直 一定 只有 还有 里面 外面 身上 面前 身后 之中 以及 ' +
    '不会 不能 不知 不要 没什么 这种 那种 一种 一声 一眼 一步 一把 一次 两个 几个 所有 任何 其他 另一 自己的 他的 她的 我的 你的').split(' ');
  var stopSet = {};
  STOP.forEach(function (w) { stopSet[w] = 1; });

  function words(text) {
    var out = [];
    if (window.Intl && Intl.Segmenter) {
      try {
        var seg = new Intl.Segmenter('zh', { granularity: 'word' }), it = seg.segment(text)[Symbol.iterator](), r;
        while (!(r = it.next()).done) { if (r.value.isWordLike) out.push({ w: r.value.segment, i: r.value.index }); }
        return out;
      } catch (e) { out = []; }
    }
    /* 没有分词器：退回二字组合 */
    var re = /[一-龥]{2,}/g, m;
    while ((m = re.exec(text))) { for (var i = 0; i + 2 <= m[0].length; i++) out.push({ w: m[0].substr(i, 2), i: m.index + i }); }
    return out;
  }
  function sentences(text) {
    var out = [], re = /[^。！？!?…\n]+[。！？!?…]*[”」』’"']*/g, m;
    while ((m = re.exec(text))) { var s = m[0]; if (s.trim()) out.push({ s: s, i: m.index + (s.length - s.replace(/^\s+/, '').length) }); }
    return out;
  }
  function analyze(text, names) {
    var d = D(), r = { issues: [] };
    var plain = text.replace(/\s/g, '');
    r.chars = plain.length; r.words = d.countWords(text);
    /* 段落 */
    var paras = [], re = /[^\n]+/g, m;
    while ((m = re.exec(text))) { if (m[0].trim()) paras.push({ s: m[0], i: m.index }); }
    r.paras = paras.length;
    r.avgPara = paras.length ? Math.round(r.chars / paras.length) : 0;
    r.longParas = paras.filter(function (p) { return p.s.trim().length > 300; });
    /* 句子 */
    var sens = sentences(text);
    r.sens = sens.length;
    r.avgSen = sens.length ? Math.round(r.chars / sens.length) : 0;
    r.longSens = sens.filter(function (s) { return s.s.trim().length > 80; });
    /* 对话占比 */
    var dia = 0, q = /“[^”]*”|「[^」]*」|"[^"\n]*"/g;
    while ((m = q.exec(text))) dia += m[0].replace(/\s/g, '').length;
    r.dialog = r.chars ? Math.round(dia / r.chars * 100) : 0;
    /* 的 / 了 / 地 */
    r.de = r.chars ? (plain.split('的').length - 1) / r.chars * 100 : 0;
    r.le = r.chars ? (plain.split('了').length - 1) / r.chars * 100 : 0;
    /* 高频词 */
    var cnt = {}, first = {};
    var nameSet = {};
    (names || []).forEach(function (n) { if (n) nameSet[n] = 1; });
    words(text).forEach(function (w) {
      if (w.w.length < 2 || stopSet[w.w] || nameSet[w.w] || !/[一-龥]/.test(w.w)) return;
      cnt[w.w] = (cnt[w.w] || 0) + 1;
      if (first[w.w] == null) first[w.w] = w.i;
    });
    var minC = Math.max(3, Math.round(r.chars / 600));
    r.freq = Object.keys(cnt).filter(function (k) { return cnt[k] >= minC; })
      .sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 18)
      .map(function (k) { return { w: k, n: cnt[k], per: r.chars ? cnt[k] / r.chars * 1000 : 0 }; });
    /* 套话 */
    r.cliche = CLICHE.map(function (w) {
      var pos = [], i = -1;
      while ((i = text.indexOf(w, i + 1)) >= 0) pos.push(i);
      return { w: w, n: pos.length, pos: pos };
    }).filter(function (x) { return x.n >= Math.max(2, Math.round(r.chars / 1500)); })
      .sort(function (a, b) { return b.n - a.n; });
    /* 连续几句用同一个开头 */
    r.openers = [];
    var run = 1;
    function head(s) { return s.replace(/^[\s“「"‘'（(]+/, '').slice(0, 1); }
    for (var i = 1; i <= sens.length; i++) {
      var same = i < sens.length && head(sens[i].s) && head(sens[i].s) === head(sens[i - 1].s) && /[一-龥]/.test(head(sens[i].s));
      if (same) run++;
      else {
        if (run >= 3) {
          var st = sens[i - run], en = sens[i - 1];
          r.openers.push({ ch: head(st.s), n: run, i: st.i, len: en.i + en.s.length - st.i });
        }
        run = 1;
      }
    }
    /* 一句里同一个词出现三次以上 */
    r.echo = [];
    sens.forEach(function (s) {
      if (r.echo.length >= 8 || s.s.length < 12) return;
      var c = {};
      words(s.s).forEach(function (w) { if (w.w.length >= 2 && !stopSet[w.w] && !nameSet[w.w]) c[w.w] = (c[w.w] || 0) + 1; });
      var hit = Object.keys(c).filter(function (k) { return c[k] >= 3; })[0];
      if (hit) r.echo.push({ w: hit, n: c[hit], i: s.i, len: s.s.length });
    });
    return r;
  }

  function openProse() {
    var d = D(), pid = d.D.activeProject;
    if (!pid) { U().toast('先建一部作品'); return; }
    T.flushSave();
    var c = d.getChapter(T.currentChapter());
    if (!c || !(c.content || '').trim()) { U().toast('这一章还没有内容'); return; }
    var text = c.content;
    var names = [];
    d.listCards(pid).forEach(function (k) { names.push(k.name); (k.aliases || []).forEach(function (a) { names.push(a); }); });
    var r = analyze(text, names);
    var tips = [];
    if (r.de > 6) tips.push('「的」占 ' + r.de.toFixed(1) + '%，偏多（一般 3%～5%）。试着删掉不影响意思的「的」，或者把长定语拆成短句。');
    if (r.le > 3.5) tips.push('「了」占 ' + r.le.toFixed(1) + '%，偏多。连续几句都以「了」收尾会显得平。');
    if (r.dialog > 70) tips.push('对话占 ' + r.dialog + '%，几乎全是对白。可以插一点动作和神态，让人物「动」起来。');
    if (r.dialog < 8 && r.chars > 800) tips.push('对话只占 ' + r.dialog + '%。大段叙述容易累，考虑让人物开口。');
    if (r.avgSen > 45) tips.push('平均每句 ' + r.avgSen + ' 字，偏长。长短句交替读起来更有节奏。');
    if (r.avgPara > 220) tips.push('平均每段 ' + r.avgPara + ' 字。手机上读会是一整屏的字，建议多分段。');

    function sec(title, sub, html) { return '<div class="tws-pr-sec"><h4>' + title + (sub ? '<em>' + sub + '</em>' : '') + '</h4>' + html + '</div>'; }
    function jump(i, len, html) { return '<button type="button" class="tws-pr-jump" data-i="' + i + '" data-len="' + len + '">' + html + '</button>'; }
    var html =
      '<div class="tws-stat-row tws-pr-stats">' +
        '<div class="tws-stat"><b>' + r.words + '</b><span>字数</span></div>' +
        '<div class="tws-stat"><b>' + r.paras + '</b><span>段 · 均 ' + r.avgPara + ' 字</span></div>' +
        '<div class="tws-stat"><b>' + r.sens + '</b><span>句 · 均 ' + r.avgSen + ' 字</span></div>' +
        '<div class="tws-stat"><b>' + r.dialog + '%</b><span>对话占比</span></div>' +
      '</div>';
    if (tips.length) html += sec('先看这几条', '', tips.map(function (t) { return '<p class="tws-pr-tip">' + esc(t) + '</p>'; }).join(''));
    if (r.cliche.length) html += sec('用得太勤的词', '点一下跳到第一处', '<div class="tws-pr-tags">' + r.cliche.map(function (x) {
      return jump(x.pos[0], x.w.length, esc(x.w) + '<i>' + x.n + '</i>');
    }).join('') + '</div><p class="tws-kit-dim tws-p">这些词本身没错，只是出现多了会有「AI 味」。选中后用浮动菜单的「换个说法」试试。</p>');
    if (r.freq.length) html += sec('高频词', '已去掉人名和常用虚词', '<div class="tws-pr-tags">' + r.freq.map(function (x) {
      var i = text.indexOf(x.w);
      return jump(i, x.w.length, esc(x.w) + '<i>' + x.n + '</i>');
    }).join('') + '</div>');
    if (r.openers.length) html += sec('连续几句同一个开头', '', r.openers.slice(0, 8).map(function (o) {
      return jump(o.i, o.len, '连续 ' + o.n + ' 句以「' + esc(o.ch) + '」开头：' + esc(text.substr(o.i, 26).replace(/\s+/g, ' ')) + '…');
    }).join(''));
    if (r.echo.length) html += sec('一句里重复用词', '', r.echo.map(function (o) {
      return jump(o.i, o.len, '「' + esc(o.w) + '」出现 ' + o.n + ' 次：' + esc(text.substr(o.i, 30).replace(/\s+/g, ' ')) + '…');
    }).join(''));
    if (r.longSens.length) html += sec('长句', '超过 80 字，共 ' + r.longSens.length + ' 句', r.longSens.slice(0, 6).map(function (s) {
      return jump(s.i, s.s.length, s.s.trim().length + ' 字：' + esc(s.s.trim().slice(0, 30)) + '…');
    }).join(''));
    if (r.longParas.length) html += sec('长段落', '超过 300 字，共 ' + r.longParas.length + ' 段', r.longParas.slice(0, 6).map(function (p) {
      return jump(p.i, p.s.length, p.s.trim().length + ' 字：' + esc(p.s.trim().slice(0, 30)) + '…');
    }).join(''));
    if (!tips.length && !r.cliche.length && !r.openers.length && !r.echo.length && !r.longSens.length && !r.longParas.length) {
      html += '<p class="tws-p" style="margin-top:14px">没有发现明显的问题。</p>';
    }
    html += '<p class="tws-p tws-kit-dim" style="margin-top:14px">全部在本机统计，不用 API Key，也不会上传正文。这些只是数字，写得好不好还得你自己读一遍。</p>';
    var m = U().modal('文笔体检 · ' + c.title, html, { footer: false });
    m.el.addEventListener('click', function (e) {
      var b = e.target.closest('.tws-pr-jump'); if (!b) return;
      m.close();
      jumpTo(c.id, Number(b.getAttribute('data-i')), Number(b.getAttribute('data-len')));
    });
  }

  /* ============================================================
     敏感词自查
     ============================================================ */
  var SENS_KEY = 'tws_sens_v1';
  var SENS_BUILTIN = {
    '色情低俗': ['做爱', '性交', '呻吟', '乳房', '下体', '强奸', '轮奸', '裸体', '阴道', '阴茎', '射精', '春药', '嫖娼', '卖淫', '乱伦'],
    '血腥暴力': ['肢解', '分尸', '碎尸', '虐杀', '斩首', '活埋', '剥皮', '开膛'],
    '毒品赌博': ['冰毒', '海洛因', '大麻', '可卡因', '吸毒', '贩毒', '赌场', '赌博'],
    '违法危险': ['枪支', '炸药', '炸弹', '自杀', '自残', '邪教', '传销'],
    '站外引流': ['微信号', '加微信', 'QQ群', '加群', '公众号', '淘宝', '二维码']
  };
  function sensCfg() {
    var c = T.kit.parse(T.kit.lsGet(SENS_KEY));
    if (!c || typeof c !== 'object') c = {};
    if (!Array.isArray(c.custom)) c.custom = [];
    if (!c.off || typeof c.off !== 'object') c.off = {};
    return c;
  }
  function sensWords(cfg) {
    var list = [];
    Object.keys(SENS_BUILTIN).forEach(function (g) {
      if (cfg.off[g]) return;
      SENS_BUILTIN[g].forEach(function (w) { list.push({ w: w, g: g }); });
    });
    cfg.custom.forEach(function (w) { if (w) list.push({ w: w, g: '我的词表' }); });
    return list;
  }
  function scan(chs, list) {
    var hits = [];   // {w,g,items:[{c,pos}]}
    list.forEach(function (it) {
      var items = [], lw = it.w.toLowerCase();
      chs.forEach(function (c) {
        var text = String(c.content || ''), low = text.toLowerCase(), i = -1;
        while ((i = low.indexOf(lw, i + 1)) >= 0) items.push({ c: c, pos: i });
      });
      if (items.length) hits.push({ w: it.w, g: it.g, items: items });
    });
    return hits;
  }
  function openSens() {
    var d = D(), pid = d.D.activeProject;
    if (!pid) { U().toast('先建一部作品'); return; }
    T.flushSave();
    var cfg = sensCfg(), scope = 'chapter';
    var m = U().modal('敏感词自查',
      '<div class="tws-chips" id="snScope"><span class="chip on" data-s="chapter">本章</span><span class="chip" data-s="book">全书</span></div>' +
      '<div id="snOut" style="margin-top:12px"></div>' +
      '<details class="tws-sn-set"><summary>词表设置</summary>' +
        '<label class="tws-l">内置分类（点一下关掉不需要的）</label><div class="tws-chips" id="snGroups"></div>' +
        '<label class="tws-l">我的词表（用空格、逗号或换行隔开）</label>' +
        '<textarea class="tws-i" id="snCustom" rows="3" placeholder="比如某个平台明确不让写的词"></textarea>' +
        '<div class="tws-ai-bar"><span class="tws-spacer"></span><button class="tws-btn sm" id="snSave">保存并重新检查</button></div>' +
      '</details>' +
      '<p class="tws-p tws-kit-dim" style="margin-top:10px">内置词表很短，只是常见的几类；每个平台的规则不一样，也经常变，查不出来不等于一定能过审。把自己踩过的词加进「我的词表」会越来越准。</p>',
      { footer: false });
    var el = m.el;
    el.querySelector('#snCustom').value = cfg.custom.join(' ');
    function paintGroups() {
      el.querySelector('#snGroups').innerHTML = Object.keys(SENS_BUILTIN).map(function (g) {
        return '<span class="chip' + (cfg.off[g] ? '' : ' on') + '" data-g="' + g + '">' + g + '</span>';
      }).join('');
    }
    function paint() {
      var chs = scopeChapters(scope), hits = scan(chs, sensWords(cfg)), box = el.querySelector('#snOut');
      el.querySelectorAll('[data-s]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-s') === scope); });
      if (!chs.length) { box.innerHTML = '<p class="tws-p">先选一章。</p>'; return; }
      if (!hits.length) { box.innerHTML = '<div class="tws-bk-card"><b>没有命中词表</b><span>检查了 ' + chs.length + ' 章。</span></div>'; return; }
      var total = hits.reduce(function (s, h) { return s + h.items.length; }, 0);
      box.innerHTML = '<p class="tws-p">命中 <b>' + hits.length + '</b> 个词、<b>' + total + '</b> 处。点一下跳过去看上下文，不一定都要改。</p>' +
        hits.map(function (h, hi) {
          return '<div class="tws-pr-sec"><h4>' + esc(h.w) + '<em>' + esc(h.g) + ' · ' + h.items.length + ' 处</em></h4>' +
            h.items.slice(0, 5).map(function (it, ii) {
              return '<button type="button" class="tws-pr-jump" data-h="' + hi + '" data-k="' + ii + '">' +
                (scope === 'book' ? '<i class="c">' + esc(it.c.title) + '</i>' : '') + snip(it.c.content, it.pos, h.w.length) + '</button>';
            }).join('') + (h.items.length > 5 ? '<p class="tws-kit-dim tws-p">…… 还有 ' + (h.items.length - 5) + ' 处，可以用「搜索」逐个看。</p>' : '') + '</div>';
        }).join('');
      box._hits = hits;
    }
    el.querySelector('#snScope').addEventListener('click', function (e) {
      var c = e.target.closest('[data-s]'); if (!c) return; scope = c.getAttribute('data-s'); paint();
    });
    el.querySelector('#snGroups').addEventListener('click', function (e) {
      var c = e.target.closest('[data-g]'); if (!c) return;
      var g = c.getAttribute('data-g');
      if (cfg.off[g]) delete cfg.off[g]; else cfg.off[g] = 1;
      paintGroups();
    });
    el.querySelector('#snSave').addEventListener('click', function () {
      cfg.custom = el.querySelector('#snCustom').value.split(/[\s,，、;；]+/).map(function (s) { return s.trim(); })
        .filter(function (s, i, a) { return s && a.indexOf(s) === i; }).slice(0, 500);
      T.kit.lsSet(SENS_KEY, JSON.stringify(cfg));
      paint(); U().toast('已保存');
    });
    el.querySelector('#snOut').addEventListener('click', function (e) {
      var b = e.target.closest('.tws-pr-jump'); if (!b) return;
      var h = el.querySelector('#snOut')._hits[Number(b.getAttribute('data-h'))], it = h.items[Number(b.getAttribute('data-k'))];
      m.close(); jumpTo(it.c.id, it.pos, h.w.length);
    });
    paintGroups(); paint();
  }

  /* ============================================================
     起名器
     ============================================================ */
  var SUR = '李王张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文'.split('');
  var SUR2 = ['慕容', '上官', '欧阳', '司马', '诸葛', '南宫', '东方', '独孤', '令狐', '皇甫', '尉迟', '公孙', '轩辕', '澹台', '宇文', '长孙', '司徒', '夏侯', '闻人', '百里'];
  var POOL = {
    gu_m: '景行云舟清远怀瑾知微承泽子衿砚书临渊修竹长风明烛青崖望舒听澜牧之玄策鹤鸣言蹊亦安慕白归尘星阑照野惊蛰止戈',
    gu_f: '清欢知意晚晴若微疏影月见青黛南乔听雪云舒令仪婉兮如是念慈扶摇卿云素问朝颜绾绾初霁含章映雪拂衣采薇锦瑟',
    mo_m: '浩然子轩宇航俊杰明哲嘉树一鸣思远泽宇晨阳承宇景川予安知行星野屿森嘉言时序逸飞闻舟',
    mo_f: '雨桐诗涵欣怡梓萱思琪语嫣若曦一诺星遥知夏晚柠疏月念安予鹿栀子南枝听晚清禾以宁初夏',
    xian_m: '无尘太玄凌霄问天破军沧溟玄冥九渊寂灭苍梧烬离北辰擎苍无咎重明斩夜藏锋惊鸿御风',
    xian_f: '璃月霜华紫萱凝霜瑶光素心青鸾洛神琉璃月璃雪衣灵犀红绡冰绡华胥羲和扶桑若木望月'
  };
  var WEST_A = ['艾', '安', '奥', '贝', '卡', '达', '埃', '菲', '加', '海', '伊', '杰', '凯', '莱', '玛', '诺', '佩', '罗', '萨', '塔', '维', '西', '泽', '莉', '薇', '索', '雷', '洛', '米', '尼'];
  var WEST_B = ['德', '恩', '尔', '兰', '里', '琳', '伦', '洛', '曼', '娜', '宁', '诺', '瑞', '萨', '森', '斯', '丝', '特', '提', '薇', '亚', '雅', '文', '温', '修', '克', '拉', '妮', '多', '安'];
  var PLACE_A = '青苍云雾落栖归望断寒白玄赤金碧翠墨雪霜星月日风雷沧幽长临鹿鹤龙凤虎松竹梅柳桃杏'.split('');
  var PLACE_B = ['山', '岭', '峰', '谷', '原', '川', '江', '河', '湖', '泽', '渊', '海', '洲', '岛', '城', '镇', '村', '渡', '关', '台', '原', '林', '崖', '坞', '驿'];
  var PLACE_M = '阳阴溪石水门桥霞岚霄川泉屏岩鸣栖'.split('');
  var SECT_A = '天玄太紫青赤苍九万无归凌御焚镇问听藏沧幽'.split('');
  var SECT_M = '剑刀星月云雷火冰血魂灵丹符兽道霄渊虚极元'.split('');
  var SECT_B = ['宗', '门', '派', '阁', '殿', '宫', '谷', '楼', '盟', '教', '山庄', '书院', '商会', '帮', '堂'];
  var SKILL_A = ['九转', '太虚', '玄天', '焚天', '碎星', '斩月', '御风', '镇魂', '万象', '归元', '无相', '大日', '青冥', '惊雷', '寒霜', '龙吟', '凤舞', '破军', '七杀', '吞天'];
  var SKILL_B = ['诀', '经', '功', '剑法', '刀法', '掌', '指', '拳', '步', '心法', '真解', '神通', '阵', '印', '术'];
  var ITEM_A = ['青冥', '斩龙', '碎星', '玄铁', '流云', '寒月', '赤霄', '定海', '镇魂', '问心', '归墟', '九幽', '太阿', '承影', '惊鸿', '无锋', '照夜', '听雨'];
  var ITEM_B = ['剑', '刀', '枪', '戟', '弓', '鼎', '镜', '铃', '珠', '印', '伞', '扇', '簪', '环', '塔', '幡', '甲', '尺'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function pair(pool) { var i = Math.floor(Math.random() * (pool.length / 2)) * 2; return pool.substr(i, 2); }
  var KINDS = {
    person: { name: '人名', card: 'character', styles: [['gu', '古风'], ['mo', '现代'], ['xian', '仙侠玄幻'], ['west', '西幻音译']], sex: true },
    place: { name: '地名', card: 'place' },
    sect: { name: '门派势力', card: 'term' },
    skill: { name: '功法招式', card: 'term' },
    item: { name: '法宝兵器', card: 'term' }
  };
  function genOne(kind, style, sex) {
    if (kind === 'person') {
      if (style === 'west') {
        var n = pick(WEST_A) + pick(WEST_B) + (Math.random() < 0.55 ? pick(WEST_B) : '');
        return Math.random() < 0.5 ? n + '·' + pick(WEST_A) + pick(WEST_B) + pick(WEST_B) : n;
      }
      var s = sex === 'x' ? (Math.random() < 0.5 ? 'm' : 'f') : sex;
      var given = pair(POOL[style + '_' + s]);
      if (style !== 'xian' && Math.random() < 0.3) given = given.charAt(Math.floor(Math.random() * 2));
      var sur = (style !== 'mo' && Math.random() < 0.18) ? pick(SUR2) : pick(SUR);
      return sur + given;
    }
    if (kind === 'place') return pick(PLACE_A) + (Math.random() < 0.6 ? pick(PLACE_M) : '') + pick(PLACE_B);
    if (kind === 'sect') return pick(SECT_A) + pick(SECT_M) + pick(SECT_B);
    if (kind === 'skill') return pick(SKILL_A) + (Math.random() < 0.35 ? pick(SECT_M) : '') + pick(SKILL_B);
    return pick(ITEM_A) + pick(ITEM_B);
  }
  function openNamer() {
    var d = D(), pid = d.D.activeProject;
    var st = { kind: 'person', style: 'gu', sex: 'x', list: [] };
    var m = U().modal('起名器',
      '<div class="tws-chips" id="nmKind">' + Object.keys(KINDS).map(function (k) { return '<span class="chip" data-k="' + k + '">' + KINDS[k].name + '</span>'; }).join('') + '</div>' +
      '<div class="tws-chips" id="nmStyle" style="margin-top:8px"></div>' +
      '<div class="tws-nm-list" id="nmList"></div>' +
      '<div class="tws-ai-bar"><button class="tws-btn sm" id="nmMore">换一批</button><span class="tws-spacer"></span></div>' +
      '<label class="tws-l">让 AI 按本书的世界观起（可选）</label>' +
      '<input class="tws-i" id="nmAsk" placeholder="比如：北境游牧部族的女首领，名字要有风雪感">' +
      '<div class="tws-ai-bar"><span class="tws-kit-dim" id="nmHint"></span><span class="tws-spacer"></span><button class="tws-btn sm ai" id="nmAi">AI 起名</button></div>',
      { footer: false });
    var el = m.el;
    function taken() { var t = {}; if (pid) d.listCards(pid).forEach(function (c) { t[c.name] = 1; }); return t; }
    function roll() {
      var t = taken(), out = [], guard = 0;
      while (out.length < 12 && guard++ < 200) {
        var n = genOne(st.kind, st.style, st.sex);
        if (!t[n] && out.every(function (x) { return x.name !== n; })) out.push({ name: n, note: '' });
      }
      st.list = out; paintList();
    }
    function paintList() {
      el.querySelector('#nmList').innerHTML = st.list.map(function (x, i) {
        return '<div class="tws-nm-it' + (x.saved ? ' saved' : '') + '"><b>' + esc(x.name) + '</b>' + (x.note ? '<span>' + esc(x.note) + '</span>' : '') +
          '<button type="button" data-copy="' + i + '">复制</button>' +
          (pid ? '<button type="button" data-save="' + i + '">' + (x.saved ? '已存 ✓' : '存为设定') + '</button>' : '') + '</div>';
      }).join('');
    }
    function paintHead() {
      el.querySelectorAll('[data-k]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-k') === st.kind); });
      var K = KINDS[st.kind], h = '';
      if (K.styles) h += K.styles.map(function (s) { return '<span class="chip' + (s[0] === st.style ? ' on' : '') + '" data-st="' + s[0] + '">' + s[1] + '</span>'; }).join('');
      if (K.sex && st.style !== 'west') h += '<span class="tws-nm-gap"></span>' + [['x', '不限'], ['m', '男'], ['f', '女']].map(function (s) {
        return '<span class="chip' + (s[0] === st.sex ? ' on' : '') + '" data-sx="' + s[0] + '">' + s[1] + '</span>';
      }).join('');
      el.querySelector('#nmStyle').innerHTML = h;
      el.querySelector('#nmHint').textContent = T.ai.needKey() ? '需要先在「系统配置」填 API Key' : '';
    }
    el.querySelector('#nmKind').addEventListener('click', function (e) {
      var c = e.target.closest('[data-k]'); if (!c) return; st.kind = c.getAttribute('data-k'); paintHead(); roll();
    });
    el.querySelector('#nmStyle').addEventListener('click', function (e) {
      var a = e.target.closest('[data-st]'), b = e.target.closest('[data-sx]');
      if (a) st.style = a.getAttribute('data-st');
      if (b) st.sex = b.getAttribute('data-sx');
      if (a || b) { paintHead(); roll(); }
    });
    el.querySelector('#nmMore').addEventListener('click', roll);
    el.querySelector('#nmList').addEventListener('click', function (e) {
      var cp = e.target.getAttribute('data-copy'), sv = e.target.getAttribute('data-save');
      if (cp != null) T.io.copyText(st.list[Number(cp)].name).then(function () { U().toast('已复制'); }, function () { U().toast('复制失败'); });
      if (sv != null) {
        var x = st.list[Number(sv)];
        if (x.saved) return;
        d.addCard(pid, KINDS[st.kind].card, x.name, x.note || '');
        x.saved = 1; paintList(); T.refreshViews();
        U().toast('已存进设定库：' + x.name);
      }
    });
    el.querySelector('#nmAi').addEventListener('click', function () {
      if (T.ai.needKey()) { U().needKeyGuide(); return; }
      var btn = this, ask = el.querySelector('#nmAsk').value.trim();
      var p = pid && d.getProject(pid);
      var lore = pid ? d.listCards(pid).slice(0, 40).map(function (c) { return c.name + (c.body ? '：' + c.body.slice(0, 40) : ''); }).join('\n') : '';
      btn.disabled = true; btn.textContent = '正在想…';
      T.checker.callLLM([
        { role: 'system', content: '你是小说起名顾问。只输出 JSON 数组，不要解释，不要 markdown 代码块。\n格式：[{"name":"名字","note":"一句话说明含义或气质，不超过20字"}]\n给 10 个，风格要和这本书一致，不要和已有的名字重复或太像。' },
        { role: 'user', content: '【作品】' + (p ? p.name + (p.genre ? '（' + p.genre + '）' : '') : '未命名') + '\n【要起的是】' + KINDS[st.kind].name +
          (ask ? '\n【要求】' + ask : '') + (lore ? '\n【已有设定（避免重名）】\n' + lore : '') }
      ]).then(function (txt) {
        var s = String(txt || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim(), arr = T.kit.parse(s);
        if (!Array.isArray(arr)) { var mm = s.match(/\[[\s\S]*\]/); arr = mm ? T.kit.parse(mm[0]) : null; }
        if (!Array.isArray(arr) || !arr.length) throw new Error('AI 没有按格式回答，再试一次');
        st.list = arr.slice(0, 12).map(function (x) { return { name: String(x.name || '').slice(0, 20), note: String(x.note || '').slice(0, 40) }; })
          .filter(function (x) { return x.name; });
        paintList();
      }).catch(function (e) { U().toast('起名失败：' + e.message); })
        .then(function () { btn.disabled = false; btn.textContent = 'AI 起名'; });
    });
    paintHead(); roll();
  }

  T.craft = { openProse: openProse, openSens: openSens, openNamer: openNamer, jumpTo: jumpTo, _analyze: analyze, _gen: genOne };
})();
