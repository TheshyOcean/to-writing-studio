/* ============================================================================
   TWS · 数据层
   纯静态版本：所有数据落 localStorage（无后端）
   结构：项目 → 卷 → 章，另有设定卡片 / 伏笔 / 时间线 / 版本快照 / 写作统计
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'tws_data_v1';
  var MAX_VERSIONS = 20;          // 每章最多保留的版本数
  var MAX_TOTAL_BYTES = 4.2e6;    // 软上限，接近时清理旧版本

  /* ---------------- 工具 ---------------- */
  function uid(p) {
    return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() {
    try { return new Date().toLocaleDateString('sv'); } catch (e) { return ''; }
  }
  /* 字数口径：中文按字符、英文按词，去空白 */
  function countWords(s) {
    if (!s) return 0;
    var t = String(s).replace(/\s+/g, '');
    var cn = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    var en = (t.replace(/[\u4e00-\u9fa5]/g, '').match(/[A-Za-z0-9]+/g) || []).length;
    return cn + en;
  }
  function fmtNum(n) {
    n = n || 0;
    return n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n);
  }
  function timeAgo(ts) {
    if (!ts) return '';
    var d = Date.now() - ts;
    if (d < 6e4) return '刚刚';
    if (d < 36e5) return Math.floor(d / 6e4) + ' 分钟前';
    if (d < 864e5) return Math.floor(d / 36e5) + ' 小时前';
    if (d < 6048e5) return Math.floor(d / 864e5) + ' 天前';
    try { return new Date(ts).toLocaleDateString('zh-CN'); } catch (e) { return ''; }
  }

  /* ---------------- 默认结构 ---------------- */
  function blank() {
    return {
      projects: [], volumes: [], chapters: [],
      cards: [], threads: [], events: [],
      versions: {},               // { chapterId: [ {id,label,content,source,created} ] }
      stats: {},                  // { 'YYYY-MM-DD': words }
      goal: 2000,
      activeProject: null,
      activeChapter: null,
      updated: 0
    };
  }

  var D = blank();

  /* ---------------- 持久化 ---------------- */
  function bytes(s) { return s.length * 2; }   // UTF-16 估算

  function save() {
    D.updated = Date.now();
    var raw = JSON.stringify(D);
    try {
      localStorage.setItem(KEY, raw);
      return true;
    } catch (e) {
      // 配额满了：先砍版本历史，再试
      trimVersions(0.5);
      try {
        localStorage.setItem(KEY, JSON.stringify(D));
        console.warn('[TWS] 存储接近上限，已自动清理旧版本快照');
        return true;
      } catch (e2) {
        console.error('[TWS] 保存失败，存储空间不足', e2);
        return false;
      }
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return false;
      /* 必须原地更新：D 被 window.TWS.data.D 引用着，
         重新赋值会让视图层拿着旧对象，读到空数据（曾经的真 bug） */
      var fresh = Object.assign(blank(), d);
      Object.keys(D).forEach(function (k) { delete D[k]; });
      Object.assign(D, fresh);
      return true;
    } catch (e) { return false; }
  }

  /* 清理版本：ratio 表示保留比例 */
  function trimVersions(ratio) {
    Object.keys(D.versions).forEach(function (cid) {
      var arr = D.versions[cid] || [];
      if (arr.length <= 2) return;
      // 手动与定稿的优先保留
      var keep = Math.max(2, Math.ceil(arr.length * (ratio || 0.5)));
      var sorted = arr.slice().sort(function (a, b) {
        var pa = (a.source === 'manual' || a.source === 'final') ? 1 : 0;
        var pb = (b.source === 'manual' || b.source === 'final') ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.created - a.created;
      });
      D.versions[cid] = sorted.slice(0, keep).sort(function (a, b) { return a.created - b.created; });
    });
  }

  function usage() {
    try { return bytes(JSON.stringify(D)); } catch (e) { return 0; }
  }

  /* ---------------- 项目 ---------------- */
  function addProject(name, genre, desc) {
    var p = { id: uid('p'), name: name || '未命名作品', genre: genre || '', desc: desc || '', created: Date.now() };
    D.projects.push(p);
    D.activeProject = p.id;
    save();
    return p;
  }
  function getProject(id) { return D.projects.filter(function (p) { return p.id === id; })[0] || null; }
  function updateProject(id, patch) {
    var p = getProject(id); if (!p) return;
    Object.assign(p, patch); save();
  }
  function removeProject(id) {
    var vids = D.volumes.filter(function (v) { return v.projectId === id; }).map(function (v) { return v.id; });
    D.chapters = D.chapters.filter(function (c) { return vids.indexOf(c.volumeId) < 0; });
    D.volumes = D.volumes.filter(function (v) { return v.projectId !== id; });
    D.cards = D.cards.filter(function (c) { return c.projectId !== id; });
    D.threads = D.threads.filter(function (t) { return t.projectId !== id; });
    D.events = D.events.filter(function (e) { return e.projectId !== id; });
    D.projects = D.projects.filter(function (p) { return p.id !== id; });
    if (D.activeProject === id) D.activeProject = D.projects[0] ? D.projects[0].id : null;
    save();
  }

  /* ---------------- 卷 ---------------- */
  function addVolume(projectId, title) {
    var ord = D.volumes.filter(function (v) { return v.projectId === projectId; }).length;
    var v = { id: uid('v'), projectId: projectId, title: title || ('第' + (ord + 1) + '卷'), ord: ord, created: Date.now() };
    D.volumes.push(v); save();
    return v;
  }
  function listVolumes(projectId) {
    return D.volumes.filter(function (v) { return v.projectId === projectId; })
      .sort(function (a, b) { return a.ord - b.ord; });
  }
  function updateVolume(id, patch) {
    var v = D.volumes.filter(function (x) { return x.id === id; })[0]; if (!v) return;
    Object.assign(v, patch); save();
  }
  function removeVolume(id) {
    D.chapters = D.chapters.filter(function (c) { return c.volumeId !== id; });
    D.volumes = D.volumes.filter(function (v) { return v.id !== id; });
    save();
  }

  /* ---------------- 章 ---------------- */
  function addChapter(volumeId, title) {
    var ord = D.chapters.filter(function (c) { return c.volumeId === volumeId; }).length;
    var c = {
      id: uid('c'), volumeId: volumeId, title: title || ('第' + (ord + 1) + '章'),
      status: 'draft', ord: ord, content: '', words: 0,
      convId: null, created: Date.now(), updated: Date.now()
    };
    /* 一章一对话：新建章节时自动建一个写作会话并绑定 */
    try {
      var api = window.__ENDF__;
      if (api && api.newConv) {
        var conv = api.newConv();
        if (conv) {
          c.convId = conv.id;
          conv.title = c.title;
          api.save && api.save();
        }
      }
    } catch (e) {}
    D.chapters.push(c);
    D.activeChapter = c.id;
    save();
    return c;
  }
  function getChapter(id) { return D.chapters.filter(function (c) { return c.id === id; })[0] || null; }
  function listChapters(volumeId) {
    return D.chapters.filter(function (c) { return c.volumeId === volumeId; })
      .sort(function (a, b) { return a.ord - b.ord; });
  }
  /* 保存正文：自动快照 + 字数 + 统计 */
  function saveChapterContent(id, content, label) {
    var c = getChapter(id); if (!c) return null;
    var oldWords = c.words || 0;
    if (label) snapshot(id, label, c.content);
    c.content = content;
    c.words = countWords(content);
    c.updated = Date.now();
    var delta = c.words - oldWords;
    if (delta > 0) recordWords(delta);
    save();
    return c;
  }
  function updateChapter(id, patch) {
    var c = getChapter(id); if (!c) return;
    if ('content' in patch) patch.words = countWords(patch.content);
    Object.assign(c, patch);
    c.updated = Date.now();
    save();
  }
  function removeChapter(id) {
    D.chapters = D.chapters.filter(function (c) { return c.id !== id; });
    delete D.versions[id];
    if (D.activeChapter === id) D.activeChapter = null;
    save();
  }
  function moveChapter(id, dir) {
    var c = getChapter(id); if (!c) return;
    var list = listChapters(c.volumeId);
    var i = list.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (j < 0 || j >= list.length) return;
    var t = list[i].ord; list[i].ord = list[j].ord; list[j].ord = t;
    save();
  }

  /* 全书统计 */
  function projectWords(projectId) {
    var vids = listVolumes(projectId).map(function (v) { return v.id; });
    return D.chapters.filter(function (c) { return vids.indexOf(c.volumeId) >= 0; })
      .reduce(function (s, c) { return s + (c.words || 0); }, 0);
  }
  function projectChapterCount(projectId) {
    var vids = listVolumes(projectId).map(function (v) { return v.id; });
    return D.chapters.filter(function (c) { return vids.indexOf(c.volumeId) >= 0; }).length;
  }

  /* ---------------- 设定卡片 ---------------- */
  var CARD_KINDS = { character: '人物', place: '地点', term: '名词', relation: '关系' };
  function addCard(projectId, kind, name, body, attrs, aliases) {
    var c = {
      id: uid('k'), projectId: projectId, kind: kind || 'character',
      name: name || '未命名', body: body || '',
      attrs: attrs || {}, aliases: aliases || [],
      pinned: 0, on: 0, created: Date.now(), updated: Date.now()
    };
    D.cards.push(c); save();
    return c;
  }
  function listCards(projectId, kind) {
    return D.cards.filter(function (c) {
      return c.projectId === projectId && (!kind || c.kind === kind);
    }).sort(function (a, b) { return (b.pinned - a.pinned) || (a.name > b.name ? 1 : -1); });
  }
  function updateCard(id, patch) {
    var c = D.cards.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    Object.assign(c, patch); c.updated = Date.now(); save();
  }
  /* 勾选「带上」的卡片 → 拼成 system prompt 片段 */
  function lorePrompt() {
    var pid = D.activeProject;
    if (!pid) return '';
    var on = D.cards.filter(function (c) { return c.projectId === pid && c.on; });
    if (!on.length) return '';
    var lines = on.map(function (c) {
      var parts = [];
      if (c.body) parts.push(c.body);
      var a = c.attrs || {};
      Object.keys(a).forEach(function (k) { if (a[k]) parts.push(k + '：' + a[k]); });
      var nm = c.name;
      if (c.aliases && c.aliases.length) nm += '（' + c.aliases.join('、') + '）';
      return '- ' + nm + '：' + (parts.join('，') || '（无描述）');
    });
    return '【当前涉及的设定】\n' + lines.join('\n');
  }
  function toggleCard(id) {
    var c = D.cards.filter(function (x) { return x.id === id; })[0];
    if (!c) return 0;
    c.on = c.on ? 0 : 1;
    save();
    return c.on;
  }
  function onCards(projectId) {
    var pid = projectId || D.activeProject;
    return D.cards.filter(function (c) { return c.projectId === pid && c.on; });
  }
  function removeCard(id) {
    D.cards = D.cards.filter(function (c) { return c.id !== id; }); save();
  }

  /* ---------------- 伏笔 ---------------- */
  function addThread(projectId, name, note, plantChapter) {
    var t = {
      id: uid('t'), projectId: projectId, name: name || '', note: note || '',
      plantChapter: plantChapter || '', payoffChapter: '', status: 'open',
      created: Date.now(), updated: Date.now()
    };
    D.threads.push(t); save();
    return t;
  }
  function listThreads(projectId) {
    return D.threads.filter(function (t) { return t.projectId === projectId; })
      .sort(function (a, b) { return a.created - b.created; });
  }
  function updateThread(id, patch) {
    var t = D.threads.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    Object.assign(t, patch); t.updated = Date.now(); save();
  }
  function removeThread(id) { D.threads = D.threads.filter(function (t) { return t.id !== id; }); save(); }

  /* ---------------- 时间线事件 ---------------- */
  function addEvent(projectId, chapterId, whenLabel, who, what) {
    var e = {
      id: uid('e'), projectId: projectId, chapterId: chapterId || '',
      whenLabel: whenLabel || '', who: who || '', what: what || '',
      created: Date.now()
    };
    D.events.push(e); save();
    return e;
  }
  function listEvents(projectId) {
    return D.events.filter(function (e) { return e.projectId === projectId; })
      .sort(function (a, b) { return a.created - b.created; });
  }
  function removeEvent(id) { D.events = D.events.filter(function (e) { return e.id !== id; }); save(); }

  /* ---------------- 版本快照 ---------------- */
  function snapshot(chapterId, label, content) {
    var arr = D.versions[chapterId] || (D.versions[chapterId] = []);
    arr.push({
      id: uid('s'), label: label || '快照',
      content: content == null ? '' : content,
      source: /AI/i.test(label || '') ? 'ai' : (/定稿/.test(label || '') ? 'final' : 'manual'),
      created: Date.now()
    });
    if (arr.length > MAX_VERSIONS) {
      // 优先删最旧的 ai 快照
      var idx = -1;
      for (var i = 0; i < arr.length; i++) { if (arr[i].source === 'ai') { idx = i; break; } }
      arr.splice(idx >= 0 ? idx : 0, 1);
    }
    if (usage() > MAX_TOTAL_BYTES) trimVersions(0.6);
    save();
  }
  function listVersions(chapterId) {
    return (D.versions[chapterId] || []).slice().sort(function (a, b) { return b.created - a.created; });
  }
  function rollback(chapterId, versionId) {
    var arr = D.versions[chapterId] || [];
    var v = arr.filter(function (x) { return x.id === versionId; })[0];
    if (!v) return false;
    var c = getChapter(chapterId);
    if (!c) return false;
    snapshot(chapterId, '回滚前', c.content);     // 回滚本身要可撤销
    c.content = v.content;
    c.words = countWords(v.content);
    c.updated = Date.now();
    save();
    return true;
  }

  /* ---------------- 写作统计 ---------------- */
  function recordWords(delta) {
    if (!delta || delta <= 0) return;
    var k = today();
    D.stats[k] = (D.stats[k] || 0) + delta;
  }
  function todayWords() { return D.stats[today()] || 0; }
  function weekWords() {
    var sum = 0, d = new Date();
    for (var i = 0; i < 7; i++) {
      var k = new Date(d.getTime() - i * 864e5).toLocaleDateString('sv');
      sum += D.stats[k] || 0;
    }
    return sum;
  }
  function last7() {
    var out = [], d = new Date();
    for (var i = 6; i >= 0; i--) {
      var dt = new Date(d.getTime() - i * 864e5);
      var k = dt.toLocaleDateString('sv');
      out.push({ date: k, label: '日一二三四五六'[dt.getDay()], words: D.stats[k] || 0 });
    }
    return out;
  }
  /* 连续写作天数：今天没写则从昨天算起 */
  function streak() {
    var n = 0, d = new Date();
    if (!(D.stats[d.toLocaleDateString('sv')] > 0)) d = new Date(d.getTime() - 864e5);
    while (D.stats[d.toLocaleDateString('sv')] > 0) {
      n++; d = new Date(d.getTime() - 864e5);
      if (n > 3650) break;
    }
    return n;
  }
  function setGoal(n) { D.goal = Math.max(0, parseInt(n, 10) || 0); save(); }

  /* ---------------- 导出 ---------------- */
  function buildText(projectId, scope) {
    var p = getProject(projectId);
    if (!p) return '';
    var lines = [p.name, ''];
    listVolumes(projectId).forEach(function (v) {
      var chs = listChapters(v.id);
      if (!chs.length) return;
      lines.push('　　' + v.title);
      lines.push('');
      chs.forEach(function (c) {
        lines.push('　　' + c.title);
        lines.push('');
        (c.content || '').split(/\n+/).forEach(function (par) {
          if (par.trim()) { lines.push('　　' + par.trim()); lines.push(''); }
        });
      });
    });
    return lines.join('\n');
  }

  /* ---------------- 暴露 ---------------- */
  window.TWS = window.TWS || {};
  window.TWS.data = {
    D: D,
    KEY: KEY,
    load: load, save: save, blank: blank, usage: usage,
    uid: uid, esc: esc, today: today, countWords: countWords, fmtNum: fmtNum, timeAgo: timeAgo,
    CARD_KINDS: CARD_KINDS,
    // 项目
    addProject: addProject, getProject: getProject, updateProject: updateProject, removeProject: removeProject,
    // 卷
    addVolume: addVolume, listVolumes: listVolumes, updateVolume: updateVolume, removeVolume: removeVolume,
    // 章
    addChapter: addChapter, getChapter: getChapter, listChapters: listChapters,
    saveChapterContent: saveChapterContent, updateChapter: updateChapter,
    removeChapter: removeChapter, moveChapter: moveChapter,
    projectWords: projectWords, projectChapterCount: projectChapterCount,
    // 卡片
    addCard: addCard, listCards: listCards, updateCard: updateCard, removeCard: removeCard,
    lorePrompt: lorePrompt, toggleCard: toggleCard, onCards: onCards,
    // 伏笔 / 时间线
    addThread: addThread, listThreads: listThreads, updateThread: updateThread, removeThread: removeThread,
    addEvent: addEvent, listEvents: listEvents, removeEvent: removeEvent,
    // 版本
    snapshot: snapshot, listVersions: listVersions, rollback: rollback,
    // 统计
    recordWords: recordWords, todayWords: todayWords, weekWords: weekWords,
    last7: last7, streak: streak, setGoal: setGoal,
    // 导出
    buildText: buildText
  };
})();
