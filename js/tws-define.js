/* ============================================================================
   TWS · 智能定义（V2.5.2，只在 desktop.html 加载）
   设定库的升级版，放在导航第一位：
   角色（人设 + 形象图）/ 关系图 / 情节图 / 预告短片 / 故事模板 / 世界设定
   - 人物就是设定库里的「人物」卡片：身份 / 性格 / 外貌 存在 attrs，人设存在 body，
     勾选「带进对话」的照旧写进 AI 提示
   - 形象图存在 IndexedDB（tws_define / img），不占 localStorage 的 5MB
   - 关系图、情节图：配了 API Key 用当前模型生成，没配用本地规则兜底
   - 预告短片：网页动画模拟；每个镜头附画面提示词，以后可交给视频模型
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;
  if (!D) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var mounted = false;

  function toast(msg) {
    if (typeof window.toast === 'function') { window.toast(msg); return; }
    var el = document.createElement('div'); el.className = 'tws-toast on'; el.textContent = msg;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2200);
  }
  function pid() { return D.D.activeProject; }
  function project() { return pid() ? D.getProject(pid()) : null; }
  function hasKey() { return !(T.ai && T.ai.needKey && T.ai.needKey()); }
  function llm(sys, user) { return T.checker.callLLM([{ role: 'system', content: sys }, { role: 'user', content: user }]); }
  function hash(t) { var h = 0; t = String(t); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); }

  /* ---------------- 每部作品自己的数据（关系描述、情节、片名） ---------------- */
  var KEY = 'tws_define_v1';
  var store = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  function my() { var p = pid() || '_'; return store[p] || (store[p] = {}); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast('浏览器存储满了，智能定义的改动没能保存'); } }

  /* ---------------- 形象图：IndexedDB ---------------- */
  var imgs = {};
  var idb = null;
  function openIdb() {
    if (idb) return idb;
    idb = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open('tws_define', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('img'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return idb;
  }
  function idbDo(mode, fn) {
    return openIdb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('img', mode), st = tx.objectStore('img'), out = fn(st);
        tx.oncomplete = function () { res(out && out.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function loadImgs() {
    return idbDo('readonly', function (st) {
      var req = st.openCursor(), got = {};
      req.onsuccess = function () { var c = req.result; if (c) { got[c.key] = c.value; c.continue(); } else imgs = got; };
      return null;
    }).catch(function () {});
  }
  function setImg(id, val) {
    if (val) imgs[id] = val; else delete imgs[id];
    return idbDo('readwrite', function (st) { return val ? st.put(val, id) : st.delete(id); }).catch(function () { toast('形象图没能保存（浏览器不支持本地图片存储）'); });
  }
  /* 压到最长边 640，省空间 */
  function shrink(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 640 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        try { cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.86)); } catch (e) { res(src); }
      };
      im.onerror = function () { res(src); };
      im.crossOrigin = 'anonymous';
      im.src = src;
    });
  }

  /* ---------------- 人物卡 ⇄ 角色 ---------------- */
  function cv(c) {
    var a = c.attrs || {};
    return {
      id: c.id, name: c.name, bio: c.body || '', on: !!c.on, aliases: c.aliases || [],
      role: a['身份'] || '', look: a['外貌'] || '',
      tags: String(a['性格'] || '').split(/[\s、，,]+/).filter(Boolean)
    };
  }
  function chars() { return pid() ? D.listCards(pid(), 'character').map(cv) : []; }
  function genPortrait(c, seed) {
    var h = hash((c.name || '?') + (seed || '')), hue = 230 + h % 60, hue2 = hue + 30 + (h >> 4) % 40, sx = 40 + (h >> 7) % 20, stars = '';
    for (var i = 0; i < 14; i++) { var k = hash(c.name + i + (seed || '')); stars += '<circle cx="' + (k % 300) + '" cy="' + ((k >> 5) % 140) + '" r="' + (0.6 + (k % 3) * 0.5) + '" fill="#fff" opacity="' + (0.3 + (k % 5) / 10) + '"/>'; }
    var gid = 'dfg' + h + '_' + (seed ? hash(seed) % 997 : 0);
    return '<svg class="df-gen" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + hue + ' 55% 72%)"/><stop offset="1" stop-color="hsl(' + hue2 + ' 60% 42%)"/></linearGradient></defs><rect width="300" height="400" fill="url(#' + gid + ')"/>' + stars +
      '<ellipse cx="150" cy="' + (150 + sx / 4) + '" rx="' + (46 + sx / 4) + '" ry="' + (56 + sx / 5) + '" fill="hsl(' + hue2 + ' 40% 22%)" opacity=".85"/><path d="M40 400c8-90 52-130 110-130s102 40 110 130z" fill="hsl(' + hue2 + ' 40% 20%)" opacity=".9"/><circle cx="' + (200 + sx) + '" cy="70" r="22" fill="#fff" opacity=".18"/></svg>';
  }
  function portrait(c, override) {
    var src = override !== undefined ? override : imgs[c.id];
    return src ? '<img src="' + esc(src) + '" alt="' + esc(c.name) + '的形象">' : genPortrait(c);
  }

  /* ---------------- 页面骨架 ---------------- */
  var TABS = [['chars', '角色', 'Personae'], ['rel', '关系图', 'Nexus'], ['plot', '情节图', 'Fabula'], ['film', '预告', 'Praevisio'], ['tpl', '故事模板', 'Exempla'], ['world', '世界设定', 'Mundus']];
  var HTML =
    '<section class="view" id="v-def">' +
      '<div class="sec-head">' +
        '<span class="sec-no">00</span>' +
        '<span class="sec-meta"><span class="st-eye">Definitio</span><span class="sec-en">// Definitio</span><span class="sec-cn">智能定义</span></span>' +
        '<span class="sec-right"><button class="mini-btn" id="dfNewChar" type="button">新建角色</button></span>' +
      '</div>' +
      '<div class="df-body">' +
        '<p class="df-lead">给角色写人设、配形象，让 AI 画出人物关系和情节走向。原来的设定库已并到这里，勾选「带进对话」的会自动写进 AI 的提示里。</p>' +
        '<div class="df-tabs" id="dfTabs" role="tablist">' + TABS.map(function (t, i) { return '<button type="button" role="tab" data-t="' + t[0] + '"' + (i ? '' : ' class="on"') + '>' + t[1] + ' <i>' + t[2] + '</i></button>'; }).join('') + '</div>' +
        '<div class="df-pane on" id="df-chars"><p class="df-note" id="dfCount"></p><div class="df-cgrid" id="dfGrid"></div></div>' +
        '<div class="df-pane" id="df-rel">' +
          '<label class="df-lab" for="dfRelIn">用几句话描述人物关系，AI 会画成关系图</label><textarea class="df-ta" id="dfRelIn" rows="3" placeholder="例如：沈未晞和守灯人是旧识；守灯人暗中保护沈未晞"></textarea>' +
          '<div class="df-bar"><span class="df-note" id="dfRelNote"></span><span class="df-sp"></span><button type="button" class="tws-btn primary" id="dfRelGo">✦ 生成关系图</button></div>' +
          '<div class="df-dup" id="dfRelDup" hidden></div>' +
          '<div class="df-relwrap"><svg id="dfRelSvg" viewBox="0 0 720 440" role="img" aria-label="人物关系图"></svg></div>' +
        '</div>' +
        '<div class="df-pane" id="df-plot">' +
          '<label class="df-lab" for="dfPlotIn">写下这本书的核心冲突或一句话梗概</label><textarea class="df-ta" id="dfPlotIn" rows="2" placeholder="例如：她在雾港收到一封二十年前的信，信里的名字把她拉回一桩被所有人刻意遗忘的海难。"></textarea>' +
          '<div class="df-bar"><label class="df-note" for="dfPlotTpl">结构</label><select class="df-sel" id="dfPlotTpl"></select><span class="df-note" id="dfPlotNote"></span><span class="df-sp"></span><button type="button" class="tws-btn primary" id="dfPlotGo">✦ 生成情节图</button></div>' +
          '<div class="df-plot" id="dfPlot"></div>' +
        '</div>' +
        '<div class="df-pane" id="df-film">' +
          '<div class="df-bar"><label class="df-note" for="dfFilmTitle">片名</label><input class="df-in" id="dfFilmTitle" autocomplete="off" style="width:220px"><span class="df-sp"></span><label class="df-note df-chk"><input type="checkbox" id="dfVoice"> 旁白朗读</label><button type="button" class="mini-btn" id="dfFilmRe">按情节图重新生成</button></div>' +
          '<div class="df-film df-paused" id="dfFilm" role="img" aria-label="剧情预告短片"></div>' +
          '<div class="df-bar"><button type="button" class="tws-btn primary" id="dfPlay">▶ 播放</button><button type="button" class="mini-btn" id="dfRestart">从头</button><div class="df-prog" id="dfProg"></div><span class="df-note" id="dfTime"></span></div>' +
          '<p class="df-note">现在是用网页动画模拟的预告：镜头来自情节图，人物和形象来自角色卡。接入视频模型后，下面每个镜头的画面提示词会送去生成真实片段，再按这个顺序拼起来。</p>' +
          '<div class="df-slist" id="dfShots"></div>' +
        '</div>' +
        '<div class="df-pane" id="df-tpl">' +
          '<div class="df-bar"><input class="df-in" id="dfTplQ" placeholder="搜索故事模板，例如：悬疑、成长、复仇" aria-label="搜索故事模板" style="flex:1;width:auto"><button type="button" class="mini-btn" id="dfTplWeb">联网搜索</button></div>' +
          '<p class="df-note" id="dfTplNote"></p><div class="df-tgrid" id="dfTpl"></div>' +
        '</div>' +
        '<div class="df-pane" id="df-world">' +
          '<div class="df-bar"><span class="df-note">地点、名词、关系卡片。人物在「角色」里编辑。</span><span class="df-sp"></span><button type="button" class="mini-btn" id="dfToLore">在设定库里管理</button></div>' +
          '<div class="df-wgrid" id="dfWorld"></div>' +
        '</div>' +
      '</div>' +
    '</section>' +
    '<div class="df-ced" id="dfCed" aria-hidden="true"><div class="df-ced-in" role="dialog" aria-label="编辑角色">' +
      '<div class="df-ced-pic"><div class="df-portrait big" id="dfCedPic"></div>' +
        '<div class="df-bar"><button type="button" class="tws-btn primary sm" id="dfGenPic">✦ 生成形象</button><label class="tws-btn sm df-up">上传图片<input type="file" accept="image/*" id="dfUpPic" hidden></label><button type="button" class="tws-btn ghost sm" id="dfRmPic">移除</button></div>' +
        '<label class="df-lab" for="dfPicPrompt">画面提示词（会发给图片模型）</label><textarea class="df-ta" id="dfPicPrompt" rows="4"></textarea>' +
        '<details class="df-imgcfg"><summary>图片模型设置</summary>' +
          '<p class="df-note">兼容 OpenAI 图片接口（/images/generations）。Key 只存在这台设备的浏览器里。</p>' +
          '<label class="df-lab" for="dfImgBase">接口地址</label><input class="df-in" id="dfImgBase" placeholder="https://api.openai.com/v1" autocomplete="off">' +
          '<label class="df-lab" for="dfImgKey">API Key</label><input class="df-in" id="dfImgKey" type="password" autocomplete="off">' +
          '<label class="df-lab" for="dfImgModel">模型名</label><input class="df-in" id="dfImgModel" placeholder="gpt-image-1" autocomplete="off">' +
        '</details>' +
      '</div>' +
      '<div class="df-ced-form">' +
        '<div class="df-row2"><div><label class="df-lab" for="dfName">名字</label><input class="df-in" id="dfName" autocomplete="off"></div><div><label class="df-lab" for="dfRole">身份</label><input class="df-in" id="dfRole" autocomplete="off"></div></div>' +
        '<label class="df-lab" for="dfTags">性格（空格分开）</label><input class="df-in" id="dfTags" autocomplete="off">' +
        '<label class="df-lab" for="dfLook">外貌</label><textarea class="df-ta" id="dfLook" rows="2"></textarea>' +
        '<label class="df-lab" for="dfBio">人设</label><textarea class="df-ta" id="dfBio" rows="5"></textarea>' +
        '<div class="df-bar"><label class="df-note df-chk"><input type="checkbox" id="dfOn"> 带进对话</label><span class="df-sp"></span><button type="button" class="tws-btn ai sm" id="dfBioAi">✦ AI 补全人设</button></div>' +
        '<div class="df-bar df-foot"><button type="button" class="tws-btn ghost" id="dfDel">删除</button><span class="df-sp"></span><button type="button" class="tws-btn" id="dfCancel">取消</button><button type="button" class="tws-btn primary" id="dfSave">保存</button></div>' +
      '</div>' +
    '</div></div>';

  /* ---------------- 页签 ---------------- */
  var tab = 'chars';
  function setTab(k) {
    tab = k;
    document.querySelectorAll('#dfTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === k); });
    document.querySelectorAll('#v-def .df-pane').forEach(function (p) { p.classList.toggle('on', p.id === 'df-' + k); });
    if (k !== 'film') filmPause();
    renderTab();
  }
  function renderTab() {
    if (!pid()) return;
    if (tab === 'chars') renderChars();
    else if (tab === 'rel') renderRel();
    else if (tab === 'plot') renderPlot();
    else if (tab === 'film') filmBuild(false);
    else if (tab === 'tpl') renderTpl($('dfTplQ').value);
    else if (tab === 'world') renderWorld();
  }
  function render() {
    var body = document.querySelector('#v-def .df-body');
    var empty = document.getElementById('dfEmpty');
    if (!pid()) {
      body.classList.add('df-none');
      if (!empty) body.insertAdjacentHTML('afterbegin', '<div class="tws-empty" id="dfEmpty"><b>先建一部作品</b><p>角色、关系和情节都挂在作品下面。</p><button class="tws-btn primary" type="button" id="dfGoBook">去书稿新建</button></div>');
      var g = $('dfGoBook'); if (g) g.onclick = function () { window.showView('v-book'); };
      return;
    }
    body.classList.remove('df-none'); if (empty) empty.remove();
    var m = my();
    $('dfRelIn').value = m.relText || '';
    $('dfPlotIn').value = m.idea || '';
    $('dfPlotTpl').value = m.tpl || 'three';
    $('dfFilmTitle').value = m.title || (project() && project().name) || '';
    renderTab();
  }

  /* ---------------- 角色 ---------------- */
  function renderChars() {
    var list = chars();
    $('dfCount').textContent = list.length ? '共 ' + list.length + ' 个角色 · ' + list.filter(function (c) { return c.on; }).length + ' 个带进对话' : '';
    if (!list.length) {
      $('dfGrid').innerHTML = '<div class="tws-empty small" style="grid-column:1/-1"><b>还没有角色</b><p>给主角写一张人设卡，配上形象，续写时 AI 就记得他是谁。</p><button class="tws-btn primary" type="button" data-new>新建角色</button></div>';
      $('dfGrid').querySelector('[data-new]').onclick = function () { openCed(null); };
      return;
    }
    $('dfGrid').innerHTML = list.map(function (c, i) {
      return '<button type="button" class="df-card" data-id="' + c.id + '" style="animation-delay:' + (i * 50) + 'ms"><div class="df-portrait">' + portrait(c) + '</div><div class="df-info"><b>' + esc(c.name) + '</b><span class="df-role">' + esc(c.role || '未写身份') + '</span><span class="df-tags">' + c.tags.slice(0, 4).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>' + (c.on ? '' : '<span class="df-off">不带进对话</span>') + '</div></button>';
    }).join('');
    $('dfGrid').querySelectorAll('.df-card').forEach(function (b) { b.addEventListener('click', function () { openCed(b.dataset.id); }); });
  }

  var draft = null;
  function imgCfg() { try { return JSON.parse(localStorage.getItem('tws_imgcfg')) || {}; } catch (e) { return {}; } }
  function picPrompt(d) {
    return '人物立绘，半身像，' + (d.look || d.name || '').replace(/[。，,.\s]+$/, '') + (d.tags.length ? '，气质：' + d.tags.join('、') : '') + (d.role ? '，身份：' + d.role : '') + '。古典油画质感，柔和侧光，蓝紫色调。';
  }
  function openCed(id) {
    var c = id ? chars().filter(function (x) { return x.id === id; })[0] : null;
    draft = c ? JSON.parse(JSON.stringify(c)) : { id: null, name: '', role: '', tags: [], look: '', bio: '', on: true };
    draft.img = id ? (imgs[id] || '') : '';
    draft.seed = '';
    $('dfName').value = draft.name; $('dfRole').value = draft.role; $('dfTags').value = draft.tags.join(' ');
    $('dfLook').value = draft.look; $('dfBio').value = draft.bio; $('dfOn').checked = draft.on;
    paintCedPic(); $('dfPicPrompt').value = picPrompt(draft);
    var ic = imgCfg(); $('dfImgBase').value = ic.base || ''; $('dfImgKey').value = ic.key || ''; $('dfImgModel').value = ic.model || '';
    $('dfDel').style.visibility = id ? 'visible' : 'hidden';
    $('dfCed').classList.add('on'); $('dfCed').setAttribute('aria-hidden', 'false');
    setTimeout(function () { $('dfName').focus(); }, 250);
  }
  function closeCed() { $('dfCed').classList.remove('on'); $('dfCed').setAttribute('aria-hidden', 'true'); }
  function paintCedPic() { $('dfCedPic').innerHTML = draft.img ? '<img src="' + esc(draft.img) + '" alt="">' : genPortrait({ name: draft.name || '?' }, draft.seed); }
  function readForm() {
    draft.name = $('dfName').value.trim(); draft.role = $('dfRole').value.trim();
    draft.tags = $('dfTags').value.trim().split(/[\s、，,]+/).filter(Boolean);
    draft.look = $('dfLook').value.trim(); draft.bio = $('dfBio').value.trim(); draft.on = $('dfOn').checked;
  }
  function saveCed() {
    readForm();
    if (!draft.name) { $('dfName').focus(); toast('先写个名字'); return; }
    var id = draft.id, attrs;
    if (id) {
      var card = D.listCards(pid()).filter(function (x) { return x.id === id; })[0];
      attrs = Object.assign({}, card && card.attrs || {});
    } else attrs = {};
    attrs['身份'] = draft.role; attrs['性格'] = draft.tags.join('、'); attrs['外貌'] = draft.look;
    if (id) D.updateCard(id, { name: draft.name, body: draft.bio, attrs: attrs, on: draft.on ? 1 : 0 });
    else { id = D.addCard(pid(), 'character', draft.name, draft.bio, attrs, []).id; D.updateCard(id, { on: draft.on ? 1 : 0 }); }
    var p = (draft.img || '') !== (imgs[id] || '') ? setImg(id, draft.img || '') : Promise.resolve();
    p.then(function () { closeCed(); renderChars(); toast('已保存「' + draft.name + '」'); });
  }
  function delCed() {
    if (!draft.id) return;
    if (!confirm('删除角色「' + draft.name + '」？设定库里的这张人物卡也会一起删除。')) return;
    D.removeCard(draft.id); setImg(draft.id, ''); closeCed(); renderChars(); toast('已删除');
  }
  function genPic() {
    readForm();
    var ic = { base: $('dfImgBase').value.trim(), key: $('dfImgKey').value.trim(), model: $('dfImgModel').value.trim() };
    try { localStorage.setItem('tws_imgcfg', JSON.stringify(ic)); } catch (e) {}
    var btn = $('dfGenPic'), pic = $('dfCedPic');
    if (!ic.key) {
      document.querySelector('.df-imgcfg').open = true;
      draft.img = ''; draft.seed = String(Date.now()); paintCedPic();
      toast('还没配图片模型，先换了一张占位形象；在下面填好接口就能生成真图');
      return;
    }
    btn.disabled = true; pic.classList.add('busy');
    fetch((ic.base || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ic.key },
      body: JSON.stringify({ model: ic.model || 'gpt-image-1', prompt: $('dfPicPrompt').value.trim() || picPrompt(draft), n: 1, size: '1024x1024' })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('图片生成失败（' + r.status + '）' + (r.status === 401 ? '：Key 不对' : '')); });
      return r.json();
    }).then(function (d) {
      var it = d && d.data && d.data[0];
      if (!it) throw new Error('接口没有返回图片');
      return shrink(it.b64_json ? 'data:image/png;base64,' + it.b64_json : it.url);
    }).then(function (src) { draft.img = src; paintCedPic(); })
      .catch(function (e) { toast(e.message === 'Failed to fetch' ? '连不上图片接口（地址不对，或对方不允许网页直接调用）' : e.message); })
      .then(function () { btn.disabled = false; pic.classList.remove('busy'); });
  }
  function bioAi() {
    readForm();
    if (!draft.name) { toast('先写个名字'); return; }
    if (!hasKey()) { toast('先在「系统配置」填 API Key'); return; }
    var b = $('dfBioAi'); b.disabled = true; b.textContent = '补全中…';
    var p = project(), others = chars().filter(function (c) { return c.id !== draft.id; }).map(function (c) { return c.name + (c.role ? '（' + c.role + '）' : ''); }).join('、');
    llm('你是小说人物设计助手。根据已知信息补全这个角色的人设：来历、性格的成因、想要什么、害怕什么、和其他人物的联系。150 字以内，一段话，不要标题和列表，不要编造与已知信息冲突的内容。',
      '作品：' + (p ? p.name + (p.genre ? '（' + p.genre + '）' : '') : '') + '\n其他人物：' + (others || '无') + '\n' + (D.lorePrompt() || '') +
      '\n\n角色：' + draft.name + '\n身份：' + (draft.role || '未知') + '\n性格：' + (draft.tags.join('、') || '未知') + '\n外貌：' + (draft.look || '未知') + '\n已有人设：' + (draft.bio || '无'))
      .then(function (t) { $('dfBio').value = String(t || '').trim(); })
      .catch(function (e) { toast(e.message === 'NO_KEY' ? '先在「系统配置」填 API Key' : e.message); })
      .then(function () { b.disabled = false; b.textContent = '✦ AI 补全人设'; });
  }

  /* ---------------- 关系图 ---------------- */
  /* 把简称、别名、少字写法统一到已有角色的正式名：茜香 → 黑见茜香 */
  function canonName(n, list) {
    var k = String(n || '').replace(/\s+/g, ''); if (!k) return k;
    var ex = list.filter(function (c) { return c.name === k || (c.aliases || []).indexOf(k) >= 0; })[0];
    if (ex) return ex.name;
    if (k.length < 2) return k;
    var hit = list.filter(function (c) {
      var forms = [c.name].concat(c.aliases || []);
      return forms.some(function (f) { f = String(f).replace(/\s+/g, ''); return f.length >= 2 && (f.indexOf(k) >= 0 || k.indexOf(f) >= 0); });
    });
    return hit.length === 1 ? hit[0].name : k;
  }
  function canonRels(rels, list) {
    var seen = {}, out = [];
    (rels || []).forEach(function (r) {
      var a = canonName(r.a, list), b = canonName(r.b, list);
      if (!a || !b || a === b) return;
      var key = [a, b].sort().join('|') + '|' + r.l;
      if (seen[key]) return; seen[key] = 1;
      out.push({ a: a, b: b, l: r.l });
    });
    return out;
  }
  function parseRels(text, list) {
    var out = [];
    text.split(/[；;。\n]/).forEach(function (seg) {
      seg = seg.trim(); if (!seg) return;
      var hit = [];
      list.forEach(function (c) {
        var forms = [c.name].concat(c.aliases || []), at = -1, used = '';
        forms.forEach(function (f) { var i = f && seg.indexOf(f); if (f && i >= 0 && (at < 0 || f.length > used.length)) { at = i; used = f; } });
        if (at < 0) { /* 正文里只写了名字后半截：黑见茜香 → 茜香 */
          for (var L = Math.min(3, c.name.length - 1); L >= 2 && at < 0; L--) { var tail = c.name.slice(-L), j = seg.indexOf(tail); if (j >= 0) { at = j; used = tail; } }
        }
        if (at >= 0) hit.push({ name: c.name, at: at, used: used });
      });
      hit.sort(function (a, b) { return a.at - b.at; });
      if (hit.length < 2) return;
      var lab = seg; hit.slice(0, 2).forEach(function (c) { lab = lab.split(c.used).join(''); });
      lab = lab.replace(/^[和与跟同]|是|的$|^的/g, '').replace(/[，,]/g, '').trim();
      out.push({ a: hit[0].name, b: hit[1].name, l: lab.slice(0, 10) || '相关' });
    });
    return out;
  }
  /* 角色卡里重复的人：「茜香」其实就是「黑见茜香」 */
  function findDups(list) {
    var out = [];
    list.forEach(function (x) {
      if (x.name.length < 2) return;
      var ys = list.filter(function (y) { return y !== x && y.name.length > x.name.length && y.name.indexOf(x.name) >= 0; });
      if (ys.length === 1) out.push({ from: x, to: ys[0] });
    });
    return out;
  }
  function mergeDup(d) {
    var to = D.listCards(pid(), 'character').filter(function (c) { return c.id === d.to.id; })[0]; if (!to) return;
    var al = (to.aliases || []).slice();
    [d.from.name].concat(d.from.aliases || []).forEach(function (n) { if (n && n !== to.name && al.indexOf(n) < 0) al.push(n); });
    var patch = { aliases: al };
    if (!to.body && d.from.bio) patch.body = d.from.bio;
    D.updateCard(to.id, patch); D.removeCard(d.from.id);
    toast('已合并：「' + d.from.name + '」记为「' + to.name + '」的简称');
    try { renderChars(); } catch (e) {}
    renderRel();
  }
  function renderRel() {
    var all = chars(), dups = findDups(all), drop = dups.map(function (d) { return d.from.id; });
    var list = all.filter(function (c) { return drop.indexOf(c.id) < 0; });
    dups.forEach(function (d) { d.to.aliases = (d.to.aliases || []).concat(d.from.name); });   /* 图里先按同一人画 */
    var dupBox = $('dfRelDup');
    if (dupBox) {
      dupBox.hidden = !dups.length;
      dupBox.innerHTML = dups.map(function (d, i) { return '<div class="df-dupl"><span>「' + esc(d.from.name) + '」看起来就是「' + esc(d.to.name) + '」，图里已按同一人画。</span><button type="button" class="mini-btn" data-dup="' + i + '">合并角色卡</button></div>'; }).join('');
      dupBox.querySelectorAll('[data-dup]').forEach(function (b) { b.addEventListener('click', function () { mergeDup(dups[+b.dataset.dup]); }); });
    }
    var rels = canonRels(my().rels || [], list), names = list.map(function (c) { return c.name; });
    rels.forEach(function (r) { [r.a, r.b].forEach(function (n) { if (names.indexOf(n) < 0) { names.push(n); list.push({ name: n, role: '' }); } }); });
    $('dfRelNote').textContent = hasKey() ? '用当前模型理解你的描述' : '没配 API Key：用规则识别，每句写清两个人名和关系';
    var svg = $('dfRelSvg'), W = 720, H = 440, cx = W / 2, cy = H / 2, n = list.length, R = n > 8 ? 175 : 150, pos = {};
    if (!n) { svg.innerHTML = '<text x="360" y="220" class="df-relempty">先在「角色」里建几个人物</text>'; return; }
    var a0 = n === 2 ? Math.PI : -Math.PI / 2;
    list.forEach(function (c, i) { var a = a0 + i * 2 * Math.PI / n; pos[c.name] = { x: cx + R * 1.35 * Math.cos(a), y: cy + R * Math.sin(a) }; });
    var h = '', seen = {};
    rels.forEach(function (r, i) {
      var A = pos[r.a], B = pos[r.b]; if (!A || !B) return;
      var key = [r.a, r.b].sort().join('|'), k = seen[key] = (seen[key] || 0) + 1;   /* 同一对人物的多条关系分到两侧 */
      var bend = 30 * Math.ceil(k / 2) * (k % 2 ? -1 : 1) * (r.a < r.b ? 1 : -1);
      var mx = (A.x + B.x) / 2, my2 = (A.y + B.y) / 2, nx = -(B.y - A.y), ny = B.x - A.x, len = Math.hypot(nx, ny) || 1;
      var qx = mx + nx / len * bend, qy = my2 + ny / len * bend, lx = (A.x + 2 * qx + B.x) / 4, ly = (A.y + 2 * qy + B.y) / 4, l = String(r.l || '相关').slice(0, 10), tw = l.length * 12 + 16;
      h += '<g class="df-anim" style="animation-delay:' + (200 + i * 110) + 'ms"><path class="df-edge" d="M' + A.x + ' ' + A.y + 'Q' + qx + ' ' + qy + ' ' + B.x + ' ' + B.y + '"/><rect class="df-elbg" x="' + (lx - tw / 2) + '" y="' + (ly - 11) + '" width="' + tw + '" height="22" rx="11"/><text class="df-elab" x="' + lx + '" y="' + (ly + 4) + '" text-anchor="middle">' + esc(l) + '</text></g>';
    });
    var r0 = n > 8 ? 30 : 36;
    list.forEach(function (c, i) { var p = pos[c.name]; h += '<g class="df-nd df-anim" style="animation-delay:' + (i * 70) + 'ms"><circle cx="' + p.x + '" cy="' + p.y + '" r="' + r0 + '"/><text x="' + p.x + '" y="' + (p.y + 2) + '">' + esc(c.name.slice(0, 5)) + '</text><text class="sub" x="' + p.x + '" y="' + (p.y + 18) + '">' + esc((c.role || '').slice(0, 5)) + '</text></g>'; });
    svg.innerHTML = h;
  }
  function genRel() {
    var text = $('dfRelIn').value.trim(), m = my(), all = chars(), dups = findDups(all), drop = dups.map(function (d) { return d.from.id; });
    var list = all.filter(function (c) { return drop.indexOf(c.id) < 0; });
    dups.forEach(function (d) { d.to.aliases = (d.to.aliases || []).concat(d.from.name); });
    m.relText = text; persist();
    if (!text) { $('dfRelIn').focus(); return; }
    if (!hasKey()) { m.rels = parseRels(text, list); persist(); renderRel(); if (!m.rels.length) toast('没认出关系：每句里要写到两个已有角色的名字'); return; }
    var b = $('dfRelGo'); b.disabled = true; b.textContent = '生成中…';
    llm('你把小说作者对人物关系的描述整理成关系图数据。只输出一个 JSON 数组，不要解释：[{"a":"人物A","b":"人物B","l":"关系，不超过8个字"}]。\n' +
      '人名规则（最重要）：作者常用简称、昵称、只写名不写姓，甚至打错同音字。先判断描述里的每个称呼指的是不是某个已有角色，' +
      '是的话 a/b 一律写成该角色的完整正式名（例：已有「黑见茜香」，描述写「茜香」→ 写黑见茜香；已有「奥空绫音」，描述写「凌音」→ 写奥空绫音）。' +
      '只有确实对不上任何已有角色时，才当作新人物。描述里「A和B和C都是X关系」要拆成两两一条。每对人物只保留一条最主要的关系。',
      '已有角色：' + (list.map(function (c) { return c.name + ((c.aliases || []).length ? '〔又称 ' + c.aliases.join('、') + '〕' : '') + (c.role ? '（' + c.role + '）' : ''); }).join('、') || '无') + '\n描述：' + text)
      .then(function (t) {
        var j = String(t).match(/\[[\s\S]*\]/); var arr = j ? JSON.parse(j[0]) : [];
        m.rels = canonRels(arr.filter(function (r) { return r && r.a && r.b && r.a !== r.b; }).slice(0, 30).map(function (r) { return { a: String(r.a).trim(), b: String(r.b).trim(), l: String(r.l || '相关').trim() }; }), list);
        if (!m.rels.length) m.rels = parseRels(text, list);
        persist(); renderRel();
      })
      .catch(function (e) { m.rels = parseRels(text, list); persist(); renderRel(); toast((e.message === 'NO_KEY' ? '没配 API Key' : e.message) + '，先用规则画了一版'); })
      .then(function () { b.disabled = false; b.textContent = '✦ 生成关系图'; });
  }

  /* ---------------- 故事模板 & 情节图 ---------------- */
  var TPL = [
    { k: 'three', n: '三幕式', lat: 'Tres actus', d: '铺垫、对抗、解决。最通用的骨架，适合大多数中长篇。', b: [['第一幕 · 铺垫', 'Initium', '交代日常与人物，抛出打破平静的事件'], ['转折点一', 'Vertex I', '主角被迫做出选择，踏入新的处境'], ['第二幕 · 对抗', 'Medium', '阻碍层层升级，真相一点点露出'], ['中点', 'Media pars', '一次重大发现或失去，目标随之改变'], ['转折点二', 'Vertex II', '最低谷，看似一切都已无法挽回'], ['第三幕 · 解决', 'Finis', '主角做出最终选择，冲突落幕']] },
    { k: 'hero', n: '英雄之旅', lat: 'Iter heroicum', d: '坎贝尔归纳的神话结构：离开、试炼、归来。适合成长与冒险。', b: [['平凡世界', 'Mundus solitus', '主角原本的生活与缺憾'], ['冒险的召唤', 'Vocatio', '一件事把主角推向未知'], ['跨越门槛', 'Limen', '离开熟悉的世界'], ['试炼与盟友', 'Probationes', '结识同伴，也树立敌人'], ['深渊', 'Abyssus', '直面最大的恐惧'], ['归来', 'Reditus', '带着改变回到原来的世界']] },
    { k: 'qczh', n: '起承转合', lat: 'Quattuor gradus', d: '中国诗文的经典章法，节奏分明，适合短篇和单章。', b: [['起', 'Ortus', '开门见山，立人物、立处境'], ['承', 'Continuatio', '顺势推进，把矛盾慢慢撑开'], ['转', 'Conversio', '意外出现，局面陡变'], ['合', 'Clausula', '收束全篇，余味留白']] },
    { k: 'freytag', n: '五幕金字塔', lat: 'Pyramis Freytagii', d: '弗赖塔格总结的古典戏剧结构：上升、高潮、下降。适合悲剧和群像。', b: [['开端', 'Expositio', '人物关系与背景'], ['上升', 'Ascensus', '冲突逐步加剧'], ['高潮', 'Culmen', '命运的转折点'], ['回落', 'Descensus', '后果层层显现'], ['结局', 'Catastrophe', '尘埃落定']] },
    { k: 'mystery', n: '悬疑倒叙', lat: 'Aenigma', d: '先给结果，再一层层回溯原因，适合推理与悬疑。', b: [['结果', 'Exitus', '一个无法解释的结局摆在读者面前'], ['第一条线索', 'Indicium I', '看似无关的细节'], ['误导', 'Fallacia', '读者和主角一起走错路'], ['真相反转', 'Veritas', '线索拼合，真相出乎意料'], ['余波', 'Sequela', '真相揭开后的代价']] }
  ];
  function tplOf(k) { return TPL.filter(function (t) { return t.k === k; })[0] || TPL[0]; }
  function renderTpl(q) {
    q = (q || '').trim();
    var list = TPL.filter(function (t) { return !q || (t.n + t.d + t.b.map(function (x) { return x[0] + x[2]; }).join('')).indexOf(q) >= 0; });
    $('dfTpl').innerHTML = list.map(function (t) { return '<div class="df-tcard"><b>' + t.n + ' <span class="lat">' + t.lat + '</span></b><p>' + t.d + '</p><span class="df-bt">' + t.b.map(function (x) { return '<span>' + x[0] + '</span>'; }).join('') + '</span><button type="button" class="mini-btn" data-k="' + t.k + '">用它生成情节图</button></div>'; }).join('') || '<p class="df-note">没有找到，换个词试试。</p>';
    $('dfTpl').querySelectorAll('[data-k]').forEach(function (b) { b.addEventListener('click', function () { my().tpl = b.dataset.k; persist(); $('dfPlotTpl').value = b.dataset.k; setTab('plot'); genPlot(); }); });
  }
  function renderPlot() {
    var m = my(), t = tplOf(m.tpl), beats = m.beats;
    $('dfPlotNote').textContent = hasKey() ? '' : '没配 API Key：先生成一版草稿骨架';
    if (!beats || !beats.length) {
      $('dfPlot').innerHTML = '<p class="df-note" style="margin:6px 0 0">写好梗概、选好结构，点「生成情节图」。' + (chars().length ? '' : '先在「角色」里建几个人物，情节会写得更具体。') + '</p>';
      $('dfPlot').classList.add('df-plot-empty');
      return;
    }
    $('dfPlot').classList.remove('df-plot-empty');
    $('dfPlot').innerHTML = beats.map(function (b, i) { return '<div class="df-beat" style="animation-delay:' + (i * 90) + 'ms"><div class="df-bh">' + esc(b.k) + ' <span class="lat">' + esc(b.lat || '') + '</span></div><div class="df-bb" contenteditable="true" spellcheck="false" data-i="' + i + '">' + esc(b.t) + '</div></div>'; }).join('') +
      '<p class="df-note" style="margin:6px 0 0">每一段都可以直接点进去改，改完自动保存。结构：' + t.n + '</p>';
    $('dfPlot').querySelectorAll('.df-bb').forEach(function (el) { el.addEventListener('input', function () { var m2 = my(); if (m2.beats && m2.beats[+el.dataset.i]) { m2.beats[+el.dataset.i].t = el.textContent.trim(); persist(); film.built = false; } }); });
  }
  function mockBeats(t, idea, list) {
    var names = list.map(function (c) { return c.name; });
    return t.b.map(function (b, i) {
      var who = names[i % Math.max(names.length, 1)] || '主角';
      return { k: b[0], lat: b[1], t: b[2] + '。' + (i === 0 && idea ? idea : who + '在这一段' + (i % 2 ? '被迫面对' : '主动推动') + '与「' + (idea.slice(0, 10) || '核心冲突') + '」有关的变化。') };
    });
  }
  function genPlot() {
    var m = my(), idea = $('dfPlotIn').value.trim(), t = tplOf($('dfPlotTpl').value), list = chars();
    m.idea = idea; m.tpl = t.k; persist();
    if (!idea) { $('dfPlotIn').focus(); toast('先写一句梗概'); return; }
    if (!hasKey()) { m.beats = mockBeats(t, idea, list); persist(); film.built = false; renderPlot(); return; }
    var b = $('dfPlotGo'); b.disabled = true; b.textContent = '生成中…';
    var p = project();
    llm('你是小说结构编辑。按给定的结构，为这本书写出情节走向：每一段一到两句话，写具体的人物和事件，不写空泛的概括，优先用上已有人物，前后要连得上。只输出一个 JSON 字符串数组，长度必须等于结构的段数，不要任何解释。',
      '作品：' + (p ? p.name + (p.genre ? '（' + p.genre + '）' : '') : '') + '\n梗概：' + idea +
      '\n人物：' + (list.map(function (c) { return c.name + (c.role ? '（' + c.role + '）' : '') + (c.bio ? '：' + c.bio.slice(0, 60) : ''); }).join('；') || '暂无') +
      '\n结构「' + t.n + '」共 ' + t.b.length + ' 段：\n' + t.b.map(function (x, i) { return (i + 1) + '. ' + x[0] + '：' + x[2]; }).join('\n'))
      .then(function (txt) {
        var j = String(txt).match(/\[[\s\S]*\]/), arr = j ? JSON.parse(j[0]) : [];
        if (!arr.length) throw new Error('模型没按格式返回');
        m.beats = t.b.map(function (x, i) { return { k: x[0], lat: x[1], t: String(arr[i] || x[2]).trim() }; });
      })
      .catch(function (e) { m.beats = mockBeats(t, idea, list); toast((e.message === 'NO_KEY' ? '没配 API Key' : e.message) + '，先给了一版草稿骨架'); })
      .then(function () { persist(); film.built = false; renderPlot(); b.disabled = false; b.textContent = '✦ 生成情节图'; });
  }

  /* ---------------- 世界设定 ---------------- */
  function renderWorld() {
    var list = D.listCards(pid()).filter(function (c) { return c.kind !== 'character'; });
    $('dfWorld').innerHTML = list.length ? list.map(function (c) {
      return '<button type="button" class="df-lore" data-id="' + c.id + '"><span class="df-k">' + esc(D.CARD_KINDS[c.kind] || c.kind) + (c.on ? ' · 带进对话' : '') + '</span><b>' + esc(c.name) + '</b><p>' + esc(c.body || '（未填写描述）') + '</p></button>';
    }).join('') : '<div class="tws-empty small" style="grid-column:1/-1"><b>还没有地点和名词</b><p>在设定库里记下地点、物件、专有名词，AI 续写时会带上。</p></div>';
    $('dfWorld').querySelectorAll('.df-lore').forEach(function (b) { b.addEventListener('click', function () { window.showView('v-lore'); }); });
  }

  /* ---------------- 预告短片 ---------------- */
  var film = { shots: [], i: 0, t: 0, on: false, raf: 0, last: 0, built: false };
  function shortLine(b) {
    /* 草稿骨架会以结构说明开头，剪进预告时去掉；AI 写的整段保留 */
    var x = b.t, def = null;
    TPL.forEach(function (t) { t.b.forEach(function (y) { if (y[0] === b.k) def = y[2]; }); });
    if (def && x.indexOf(def + '。') === 0 && x.length > def.length + 1) x = x.slice(def.length + 1);
    x = x.trim(); return x.length > 44 ? x.slice(0, 43) + '…' : x;
  }
  function shotBg(i, hue) {
    var id = 'dfs' + i + '_' + Date.now(), stars = '', k;
    for (var j = 0; j < 22; j++) { k = hash('s' + i + '-' + j); stars += '<circle cx="' + (k % 1600) + '" cy="' + ((k >> 6) % 420) + '" r="' + (0.8 + (k % 3) * 0.6) + '" fill="#fff" opacity="' + (0.2 + (k % 6) / 12) + '"/>'; }
    var mx = 300 + hash('m' + i) % 1000;
    return '<svg class="df-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' + hue + ' 45% 8%)"/><stop offset=".62" stop-color="hsl(' + (hue + 12) + ' 40% 24%)"/><stop offset="1" stop-color="hsl(' + (hue + 20) + ' 35% 12%)"/></linearGradient><radialGradient id="' + id + 'g"><stop offset="0" stop-color="#fff6dc" stop-opacity=".9"/><stop offset=".3" stop-color="#f3d9a0" stop-opacity=".25"/><stop offset="1" stop-color="#f3d9a0" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="1600" height="900" fill="url(#' + id + ')"/>' + stars +
      '<circle cx="' + mx + '" cy="190" r="140" fill="url(#' + id + 'g)"/><circle cx="' + mx + '" cy="190" r="26" fill="#fff4d6" opacity=".85"/>' +
      '<path d="M0 600 Q400 585 800 600 T1600 598 V900 H0Z" fill="hsl(' + (hue + 16) + ' 35% 9%)"/>' +
      '<path d="M0 640 Q200 630 420 642 T880 640 T1600 645" stroke="hsl(' + hue + ' 50% 70%)" stroke-opacity=".18" fill="none" stroke-width="2"/>' +
      '<g class="df-fog"><ellipse cx="500" cy="590" rx="760" ry="70" fill="#d9d4ec" opacity=".10"/><ellipse cx="1300" cy="640" rx="620" ry="60" fill="#d9d4ec" opacity=".08"/></g>' +
      '<g class="df-fog b"><ellipse cx="900" cy="700" rx="900" ry="90" fill="#cfc8e6" opacity=".09"/></g></svg>';
  }
  function shotHtml(s, i) {
    var bg = shotBg(i, s.hue);
    if (s.type === 'title') return bg + '<div class="df-ttl"><span class="lat">Praevisio</span><h2>' + esc(s.title) + '</h2><p>' + esc(s.line) + '</p></div>';
    if (s.type === 'end') return bg + '<div class="df-ttl"><h2>' + esc(s.title) + '</h2><p>敬请期待</p><span class="lat">Mox in libris</span></div>';
    var t = esc(s.line).replace(/&[a-z]+;|./g, function (ch) { return '\u0001' + ch; }).split('\u0001').filter(Boolean).map(function (ch, j) { return '<span style="animation-delay:' + (700 + j * 45) + 'ms">' + ch + '</span>'; }).join('');
    return bg + '<div class="df-pf ' + s.side + '">' + portrait(s.c) + '<b>' + esc(s.c.name) + '</b></div><div class="df-fcap ' + (s.side === 'r' ? 'l' : 'r') + '"><div class="k">' + esc(s.k) + '</div><div class="t">' + t + '</div></div>';
  }
  function shotPrompt(s) { return '电影镜头，16:9，' + (s.c.look || s.c.name).replace(/[。，,.\s]+$/, '') + '。' + s.line.replace(/…$/, '') + '。冷色调，缓慢推镜，胶片颗粒。'; }
  function filmBuild(force) {
    if (film.built && !force) { paintProg(); return; }
    var m = my(), list = chars(), beats = m.beats || [];
    var title = $('dfFilmTitle').value.trim() || (project() && project().name) || '未命名';
    film.shots = [{ type: 'title', title: title, line: m.idea || '', dur: 5200, hue: 240 }];
    beats.forEach(function (b, i) {
      var c = list.filter(function (x) { return b.t.indexOf(x.name) >= 0; }).sort(function (x, y) { return b.t.indexOf(x.name) - b.t.indexOf(y.name); })[0] || list[i % Math.max(list.length, 1)] || { id: '', name: '主角', look: '' };
      var line = shortLine(b), s = { type: 'beat', k: b.k, line: line, c: c, side: i % 2 ? 'l' : 'r', hue: 228 + (i * 19) % 64, dur: Math.min(7600, 3800 + line.length * 80) };
      s.prompt = (m.prompts && m.prompts[i]) || shotPrompt(s); s.bi = i; film.shots.push(s);
    });
    film.shots.push({ type: 'end', title: title, dur: 4400, hue: 250 });
    $('dfProg').innerHTML = film.shots.map(function (s, i) { return '<button type="button" data-i="' + i + '" aria-label="跳到第 ' + (i + 1) + ' 个镜头"><span><i></i></span></button>'; }).join('');
    $('dfProg').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { filmJump(+b.dataset.i); }); });
    $('dfShots').innerHTML = beats.length ? film.shots.map(function (s, i) { if (s.type !== 'beat') return ''; return '<div class="df-sh"><div class="df-bh">镜头 ' + i + ' · ' + esc(s.k) + '<span class="lat">' + esc(s.c.name) + '</span></div><textarea class="df-ta" rows="3" data-i="' + i + '" aria-label="镜头 ' + i + ' 的画面提示词">' + esc(s.prompt) + '</textarea></div>'; }).join('')
      : '<p class="df-note">情节图还是空的，现在只有片头片尾。先去「情节图」生成一版，预告会按每一段剪出镜头。</p>';
    $('dfShots').querySelectorAll('textarea').forEach(function (a) { a.addEventListener('input', function () { var s = film.shots[+a.dataset.i]; s.prompt = a.value; var m2 = my(); m2.prompts = m2.prompts || []; m2.prompts[s.bi] = a.value; persist(); }); });
    film.built = true; filmPause(); film.i = 0; film.t = 0; $('dfFilm').innerHTML = ''; showShot(0); paintProg();
  }
  function speak(s) {
    if (!$('dfVoice').checked || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(s.type === 'end' ? s.title + '，敬请期待' : s.type === 'title' ? s.title + '。' + s.line : s.line.replace(/…$/, '')); u.lang = 'zh-CN'; u.rate = 0.92; speechSynthesis.speak(u); } catch (e) {}
  }
  function showShot(i) {
    var s = film.shots[i], stage = $('dfFilm'), el = document.createElement('div');
    el.className = 'df-shot'; el.style.setProperty('--d', s.dur + 'ms'); el.innerHTML = shotHtml(s, i);
    stage.querySelectorAll('.df-shot').forEach(function (o) { o.classList.remove('in'); setTimeout(function () { o.remove(); }, 1200); });
    stage.appendChild(el); void el.offsetWidth; el.classList.add('in');
    if (film.on) speak(s);
  }
  function fmt(ms) { var x = Math.round(ms / 1000); return Math.floor(x / 60) + ':' + ('0' + x % 60).slice(-2); }
  function paintProg() {
    var total = 0, done = 0; film.shots.forEach(function (s, i) { total += s.dur; if (i < film.i) done += s.dur; }); done += film.t;
    $('dfProg').querySelectorAll('i').forEach(function (e, i) { e.style.width = (i < film.i ? 100 : i > film.i ? 0 : Math.min(100, film.t / film.shots[i].dur * 100)) + '%'; });
    $('dfTime').textContent = fmt(done) + ' / ' + fmt(total);
  }
  function tick(ts) {
    if (!film.on) return; film.t += ts - film.last; film.last = ts;
    var s = film.shots[film.i];
    if (film.t >= s.dur) { if (film.i < film.shots.length - 1) { film.i++; film.t = 0; showShot(film.i); } else { film.t = s.dur; paintProg(); filmPause(); return; } }
    paintProg(); film.raf = requestAnimationFrame(tick);
  }
  function filmPlay() {
    if (!film.built) filmBuild(true);
    var last = film.shots.length - 1; if (film.i === last && film.t >= film.shots[last].dur) { film.i = 0; film.t = 0; showShot(0); }
    film.on = true; film.last = performance.now(); $('dfFilm').classList.remove('df-paused'); $('dfPlay').textContent = '❚❚ 暂停';
    if (film.t < 50) speak(film.shots[film.i]);
    film.raf = requestAnimationFrame(tick);
  }
  function filmPause() {
    if (!$('dfFilm')) return;
    film.on = false; cancelAnimationFrame(film.raf); $('dfFilm').classList.add('df-paused'); $('dfPlay').textContent = '▶ 播放';
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  }
  function filmJump(i) { film.i = i; film.t = 0; showShot(i); if (film.on) speak(film.shots[i]); paintProg(); }

  /* ---------------- 导航入口 ---------------- */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M17 4.5l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z"/></svg>';
  function addNav() {
    var rail = document.querySelector('.rail');
    if (!rail || $('railDef')) return !!$('railDef');
    var first = rail.querySelector('.rail-btn');
    if (!first || !$('railLore')) return false;
    var b = document.createElement('button');
    b.className = 'rail-btn'; b.id = 'railDef'; b.type = 'button'; b.dataset.go = 'v-def'; b.title = '智能定义';
    b.innerHTML = ICON + '<span>智能定义</span><small>00</small><em>Definitio</em>';
    b.onclick = function () { window.showView('v-def'); };
    rail.insertBefore(b, first);
    $('railLore').classList.add('df-merged');   /* 设定库并进智能定义，左栏不再单独占一项 */
    return true;
  }

  function mount() {
    if (mounted) return;
    var stage = document.querySelector('.stage');
    if (!stage || !$('v-lore') || typeof window.showView !== 'function') { setTimeout(mount, 120); return; }
    mounted = true;
    stage.insertAdjacentHTML('beforeend', HTML);
    var ced = $('dfCed'); document.body.appendChild(ced);
    (function tryNav(n) { if (!addNav() && n < 40) setTimeout(function () { tryNav(n + 1); }, 150); })(0);

    $('dfPlotTpl').innerHTML = TPL.map(function (t) { return '<option value="' + t.k + '">' + t.n + '</option>'; }).join('');
    document.querySelectorAll('#dfTabs button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.t); }); });
    $('dfNewChar').addEventListener('click', function () { if (!pid()) { toast('先在书稿里建一部作品'); return; } setTab('chars'); openCed(null); });
    $('dfCancel').addEventListener('click', closeCed);
    $('dfSave').addEventListener('click', saveCed);
    $('dfDel').addEventListener('click', delCed);
    $('dfCed').addEventListener('click', function (e) { if (e.target === $('dfCed')) closeCed(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('dfCed').classList.contains('on')) closeCed(); });
    ['dfName', 'dfRole', 'dfTags', 'dfLook'].forEach(function (id) { $(id).addEventListener('input', function () { readForm(); $('dfPicPrompt').value = picPrompt(draft); if (id === 'dfName' && !draft.img) paintCedPic(); }); });
    $('dfGenPic').addEventListener('click', genPic);
    $('dfRmPic').addEventListener('click', function () { draft.img = ''; draft.seed = ''; paintCedPic(); });
    $('dfUpPic').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { shrink(r.result).then(function (src) { draft.img = src; paintCedPic(); }); }; r.readAsDataURL(f); this.value = '';
    });
    $('dfBioAi').addEventListener('click', bioAi);
    $('dfRelGo').addEventListener('click', genRel);
    $('dfRelIn').addEventListener('change', function () { my().relText = this.value; persist(); });
    $('dfPlotGo').addEventListener('click', genPlot);
    $('dfPlotIn').addEventListener('change', function () { my().idea = this.value.trim(); persist(); });
    $('dfPlotTpl').addEventListener('change', function () { my().tpl = this.value; persist(); });
    $('dfTplQ').addEventListener('input', function () { renderTpl(this.value); });
    $('dfTplWeb').addEventListener('click', function () { $('dfTplNote').textContent = '联网搜索需要接入搜索服务（纯静态网页不能直接搜别的网站）。接好后，搜到的模板会以「结构」的形式加进这里。'; });
    $('dfToLore').addEventListener('click', function () { window.showView('v-lore'); });
    $('dfPlay').addEventListener('click', function () { film.on ? filmPause() : filmPlay(); });
    $('dfRestart').addEventListener('click', function () { filmJump(0); if (!film.on) filmPlay(); });
    $('dfFilmRe').addEventListener('click', function () { filmBuild(true); });
    $('dfFilmTitle').addEventListener('change', function () { my().title = this.value.trim(); persist(); filmBuild(true); });
    $('dfVoice').addEventListener('change', function () { if (!this.checked) try { speechSynthesis.cancel(); } catch (e) {} });

    var orig = window.showView, lastPid = null;
    window.showView = function (id) {
      orig(id);
      var r = $('railDef'); if (r) r.classList.toggle('active', id === 'v-def' || id === 'v-lore');   /* 设定库属于智能定义 */
      if (id === 'v-def') {
        if (pid() !== lastPid) { lastPid = pid(); film.built = false; }
        render();
      } else filmPause();
    };
    loadImgs().then(function () { if ($('v-def').classList.contains('active')) renderTab(); });
  }

  T.define = { show: function () { window.showView('v-def'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
