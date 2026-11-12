/* ============================================================
   To Writing Studio · 导入与导出（V3.5.0）
   ------------------------------------------------------------
   - 导入书稿：.txt / .md / .docx，按「第X章」「第X卷」或标题样式自动切章
     · .txt 自动识别 UTF-8 / UTF-16 / GBK（记事本、老小说站常见）
     · .docx 在浏览器里直接解压（不上传），读 Word 的标题样式
     · 导入的字数不算进「今日字数」
   - 导出 .epub（电子书）和 .md（Markdown）
   - 发布格式：段首缩进 / 空行 / 标点修正，一键复制本章
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  function D() { return T.data; }
  function U() { return T.ui; }
  function esc(s) { return D().esc(s); }

  var NUM = '零〇一二三四五六七八九十百千万两0-9０-９';
  var RE_CH = new RegExp('^(第\\s*[' + NUM + ']+\\s*[章节回集话幕]|序章|序幕|楔子|引子|尾声|终章|后记|番外[' + NUM + ']*|Chapter\\s+\\d+|CHAPTER\\s+\\d+)(?:[\\s　:：、.．·\\-—]+.*)?$');
  var RE_VOL = new RegExp('^(第\\s*[' + NUM + ']+\\s*[卷部篇]|卷\\s*[' + NUM + ']+)(?:[\\s　:：、.．·\\-—]+.*)?$');

  /* ============================================================
     读文件
     ============================================================ */
  function readBuf(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error('文件读不出来')); };
      fr.readAsArrayBuffer(file);
    });
  }
  /* 文本编码：有 BOM 按 BOM；否则先当 UTF-8，解不通就按 GBK（GB18030） */
  function decodeText(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch (e) {
      try { return new TextDecoder('gb18030').decode(b); }
      catch (e2) { return new TextDecoder('utf-8').decode(b); }
    }
  }

  /* ---- 解 ZIP：只取需要的那一个文件 ---- */
  function unzipOne(buf, want) {
    var b = new Uint8Array(buf), dv = new DataView(buf);
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('这不是有效的 .docx 文件'));
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
    for (var k = 0; k < n; k++) {
      if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      var off = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      if (name === want) {
        var lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
        var data = b.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
        if (method === 0) return Promise.resolve(data);
        if (method !== 8) return Promise.reject(new Error('这个 .docx 用了不支持的压缩方式'));
        if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('这个浏览器太旧，读不了 .docx。请在 Word 里另存为 .txt 再导入'));
        var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
      }
      p += 46 + nl + el + cl;
    }
    return Promise.reject(new Error('这个 .docx 里没有找到正文'));
  }
  /* ---- .docx → 行（带标题级别） ---- */
  function docxLines(buf) {
    return unzipOne(buf, 'word/document.xml').then(function (bytes) {
      var xml = new TextDecoder('utf-8').decode(bytes);
      var doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('这个 .docx 的正文读不出来');
      var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      var ps = doc.getElementsByTagNameNS(W, 'p'), lines = [];
      for (var i = 0; i < ps.length; i++) {
        var pEl = ps[i], text = '', h = 0;
        var st = pEl.getElementsByTagNameNS(W, 'pStyle')[0];
        if (st) {
          var v = st.getAttributeNS(W, 'val') || st.getAttribute('w:val') || '';
          var mm = v.match(/^(?:Heading|heading|标题)\s*(\d)$/) || v.match(/^(\d)$/);
          if (mm) h = Number(mm[1]);
          else if (/^(Title|标题)$/i.test(v)) h = 1;
        }
        var ol = pEl.getElementsByTagNameNS(W, 'outlineLvl')[0];
        if (!h && ol) { var lv = Number(ol.getAttributeNS(W, 'val') || ol.getAttribute('w:val')); if (lv >= 0 && lv < 6) h = lv + 1; }
        var walker = pEl.getElementsByTagName('*');
        for (var j = 0; j < walker.length; j++) {
          var nd = walker[j];
          if (nd.namespaceURI !== W) continue;
          if (nd.localName === 't') text += nd.textContent;
          else if (nd.localName === 'tab') text += ' ';
          else if (nd.localName === 'br' || nd.localName === 'cr') text += '\n';
        }
        text.split('\n').forEach(function (t, idx) { lines.push({ text: t, h: idx ? 0 : h }); });
      }
      return lines;
    });
  }
  function textLines(text, md) {
    return String(text).replace(/\r\n?/g, '\n').split('\n').map(function (t) {
      var h = 0;
      if (md) { var m = t.match(/^(#{1,6})\s+(.*)$/); if (m) { h = m[1].length; t = m[2].replace(/\s+#+\s*$/, ''); } }
      return { text: t, h: h };
    });
  }

  /* ============================================================
     切章
     ============================================================ */
  function clean(t) { return String(t).replace(/^[\s　﻿]+|[\s　]+$/g, ''); }
  /* 返回 { title, vols:[{title, chs:[{title, paras:[]}]}], found:{vol,ch} } */
  function splitByTitles(lines) {
    /* 标题样式的级别：最上面单独一个 → 书名；剩下的最高一级如果下面还有一级 → 卷，否则 → 章 */
    var levels = {};
    lines.forEach(function (l) { if (l.h && clean(l.text)) levels[l.h] = (levels[l.h] || 0) + 1; });
    var ls = Object.keys(levels).map(Number).sort();
    var titleLv = 0, volLv = 0, chLv = 0;
    if (ls.length && levels[ls[0]] === 1 && ls.length > 1) {
      var firstText = lines.filter(function (l) { return clean(l.text); })[0];
      if (firstText && firstText.h === ls[0]) titleLv = ls.shift();
    }
    if (ls.length >= 2) { volLv = ls[0]; chLv = ls[1]; } else if (ls.length === 1) chLv = ls[0];

    var book = { title: '', vols: [], found: { vol: 0, ch: 0 } }, vol = null, ch = null, pre = [];
    function newVol(t) { vol = { title: t, chs: [] }; book.vols.push(vol); ch = null; }
    function newCh(t) { if (!vol) newVol(''); ch = { title: t, paras: [] }; vol.chs.push(ch); }
    lines.forEach(function (l) {
      var t = clean(l.text);
      if (!t) return;
      var short = t.length <= 40;
      if (titleLv && l.h === titleLv && !book.title) { book.title = t; return; }
      if (short && (RE_VOL.test(t) || (volLv && l.h === volLv && !RE_CH.test(t)))) { newVol(t); book.found.vol++; return; }
      if (short && (RE_CH.test(t) || (chLv && l.h && l.h >= chLv))) { newCh(t); book.found.ch++; return; }
      if (ch) ch.paras.push(t); else pre.push(t);
    });
    /* 第一章之前的内容：只有一行短句就当书名，否则单独成一章 */
    if (pre.length) {
      if (!book.title && pre[0].length <= 30 && book.found.ch) book.title = pre.shift().replace(/^《|》$/g, '');
      if (pre.join('').length > 0) {
        var head = { title: book.found.ch ? '开头' : '正文', paras: pre };
        if (!book.vols.length) book.vols.push({ title: '', chs: [] });
        book.vols[0].chs.unshift(head);
      }
    }
    return book;
  }
  function splitBySize(lines, size) {
    var paras = lines.map(function (l) { return clean(l.text); }).filter(Boolean);
    var chs = [], cur = null, n = 0, d = D();
    paras.forEach(function (p) {
      if (!cur || n >= size) { cur = { title: '第' + (chs.length + 1) + '章', paras: [] }; chs.push(cur); n = 0; }
      cur.paras.push(p); n += d.countWords(p);
    });
    return { title: '', vols: [{ title: '', chs: chs }], found: { vol: 0, ch: 0 } };
  }
  function splitWhole(lines) {
    var paras = lines.map(function (l) { return clean(l.text); }).filter(Boolean);
    return { title: '', vols: [{ title: '', chs: [{ title: '第一章', paras: paras }] }], found: { vol: 0, ch: 0 } };
  }
  function bookStat(book) {
    var d = D(), ch = 0, w = 0;
    book.vols.forEach(function (v) { v.chs.forEach(function (c) { ch++; w += d.countWords(c.paras.join('')); }); });
    return { vols: book.vols.length, chs: ch, words: w };
  }

  /* ============================================================
     写进数据
     ============================================================ */
  function commit(book, target, name) {
    var d = D(), S = d.D;
    var keep = { projects: S.projects.length, volumes: S.volumes.length, chapters: S.chapters.length, ap: S.activeProject, ac: S.activeChapter };
    var pid, now = Date.now(), first = null;
    if (target === 'new') {
      var p = { id: d.uid('p'), name: name || '未命名作品', genre: '', desc: '', created: now };
      S.projects.push(p); pid = p.id; S.activeProject = pid;
    } else pid = S.activeProject;
    var vord = S.volumes.filter(function (v) { return v.projectId === pid; }).length;
    book.vols.forEach(function (v, vi) {
      if (!v.chs.length) return;
      var title = v.title || (book.vols.length === 1 ? (target === 'new' ? '第一卷' : (name || '导入')) : '第' + (vi + 1) + '卷');
      var vol = { id: d.uid('v'), projectId: pid, title: title, ord: vord++, created: now };
      S.volumes.push(vol);
      v.chs.forEach(function (c, ci) {
        var content = c.paras.join('\n\n');
        var ch = {
          id: d.uid('c'), volumeId: vol.id, title: c.title || ('第' + (ci + 1) + '章'), status: 'draft', ord: ci,
          content: content, words: d.countWords(content), convId: null, created: now, updated: now
        };
        S.chapters.push(ch); first = first || ch;
      });
    });
    if (first) S.activeChapter = first.id;
    if (!d.save()) {
      /* 存不下：把刚加的都撤掉，原来的数据不动 */
      S.projects.length = keep.projects; S.volumes.length = keep.volumes; S.chapters.length = keep.chapters;
      S.activeProject = keep.ap; S.activeChapter = keep.ac;
      d.save();
      return null;
    }
    return first;
  }

  /* ============================================================
     导入弹窗
     ============================================================ */
  function openImport() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,.md,.markdown,.docx,text/plain'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      if (f.size > 40 * 1024 * 1024) { U().toast('文件太大了（超过 40 MB）'); return; }
      var ext = (f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      ext = ext.toLowerCase();
      if (ext === 'doc') { U().toast('老版 .doc 读不了，请在 Word 里另存为 .docx 或 .txt'); return; }
      readBuf(f).then(function (buf) {
        if (ext === 'docx') return docxLines(buf);
        return textLines(decodeText(buf), ext === 'md' || ext === 'markdown');
      }).then(function (lines) {
        if (!lines.some(function (l) { return clean(l.text); })) { U().toast('这个文件里没有文字'); return; }
        previewImport(lines, f.name.replace(/\.[^.]+$/, ''));
      }).catch(function (e) { U().toast(e.message || '导入失败'); });
    });
    inp.click();
  }

  function previewImport(lines, fileName) {
    var d = D();
    var byTitle = splitByTitles(lines);
    var hasTitles = byTitle.found.ch > 0;
    var mode = hasTitles ? 'title' : 'size', target = d.D.activeProject ? 'new' : 'new';
    var cur = d.D.activeProject && d.getProject(d.D.activeProject);
    var m = U().modal('导入书稿',
      '<label class="tws-l">怎么分章</label><div class="tws-chips" id="imMode">' +
        '<span class="chip" data-m="title">按标题切章' + (hasTitles ? '（找到 ' + byTitle.found.ch + ' 个）' : '（没找到）') + '</span>' +
        '<span class="chip" data-m="size">每 3000 字一章</span><span class="chip" data-m="whole">整篇作为一章</span></div>' +
      '<div class="tws-bk-card" id="imStat" style="margin-top:12px"></div>' +
      '<div class="tws-im-list" id="imList"></div>' +
      '<label class="tws-l">导入到</label><div class="tws-chips" id="imTarget">' +
        '<span class="chip" data-t="new">新建一部作品</span>' +
        (cur ? '<span class="chip" data-t="cur">追加到《' + esc(cur.name) + '》</span>' : '') + '</div>' +
      '<div id="imNameBox"><label class="tws-l">作品名</label><input class="tws-i" id="imName"></div>' +
      '<p class="tws-p tws-kit-dim" style="margin-top:10px">文件只在这台设备上读取，不会上传。导入的字数不计入「今日字数」。</p>',
      {
        okText: '导入',
        onOk: function (w) {
          var name = w.querySelector('#imName').value.trim() || book.title || fileName;
          var first = commit(book, target, target === 'new' ? name : fileName);
          if (!first) { U().toast('浏览器存储空间不够，放不下这份书稿。原来的数据没有动'); return false; }
          U().setChapter(first.id);
          T.refreshViews();
          if (window.showView) window.showView('v-book');
          var st = bookStat(book);
          U().toast('已导入 ' + st.chs + ' 章 · ' + d.fmtNum(st.words) + ' 字');
        }
      });
    var book = byTitle;
    function paint() {
      book = mode === 'title' ? byTitle : (mode === 'size' ? splitBySize(lines, 3000) : splitWhole(lines));
      var st = bookStat(book);
      m.el.querySelectorAll('[data-m]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-m') === mode); });
      m.el.querySelectorAll('[data-t]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-t') === target); });
      m.el.querySelector('#imStat').innerHTML = '<em>将要导入</em><b>' +
        (st.vols > 1 ? st.vols + ' 卷 · ' : '') + st.chs + ' 章 · ' + d.fmtNum(st.words) + ' 字</b>' +
        (mode === 'title' && !hasTitles ? '<span>没有找到「第X章」这样的标题，全部内容会放进一章。可以改选「每 3000 字一章」。</span>' : '');
      var rows = [];
      book.vols.forEach(function (v) {
        if (v.title) rows.push('<div class="v">' + esc(v.title) + '</div>');
        v.chs.forEach(function (c) { rows.push('<div><span>' + esc(c.title) + '</span><em>' + d.countWords(c.paras.join('')) + '</em></div>'); });
      });
      var more = rows.length - 60;
      m.el.querySelector('#imList').innerHTML = rows.slice(0, 60).join('') + (more > 0 ? '<div class="more">…… 还有 ' + more + ' 项</div>' : '');
      m.el.querySelector('#imNameBox').style.display = target === 'new' ? '' : 'none';
      var nm = m.el.querySelector('#imName');
      if (!nm.dataset.touched) nm.value = book.title || byTitle.title || fileName;
    }
    m.el.querySelector('#imName').addEventListener('input', function () { this.dataset.touched = '1'; });
    m.el.querySelector('#imMode').addEventListener('click', function (e) {
      var c = e.target.closest('[data-m]'); if (!c) return; mode = c.getAttribute('data-m'); paint();
    });
    m.el.querySelector('#imTarget').addEventListener('click', function (e) {
      var c = e.target.closest('[data-t]'); if (!c) return; target = c.getAttribute('data-t'); paint();
    });
    paint();
  }

  /* ============================================================
     导出：Markdown / EPUB
     ============================================================ */
  function paras(c) { return String(c.content || '').split(/\n+/).map(clean).filter(Boolean); }
  function markdown(pid, opt) {
    var d = D(), p = d.getProject(pid); if (!p) return null;
    opt = opt || {};
    var out = ['# ' + p.name, ''];
    d.listVolumes(pid).forEach(function (v) {
      var chs = d.listChapters(v.id); if (!chs.length) return;
      if (opt.volumeTitles !== false) out.push('## ' + v.title, '');
      chs.forEach(function (c) {
        if (opt.titles !== false) out.push('### ' + c.title, '');
        paras(c).forEach(function (t) { out.push(t.replace(/^([#>*+-]|\d+\.)(\s)/, '\\$1$2'), ''); });
      });
    });
    return new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' });
  }
  function xe(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function page(title, body) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">' +
      '<head><meta charset="UTF-8"/><title>' + xe(title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head>' +
      '<body>' + body + '</body></html>';
  }
  function epub(pid, opt) {
    var d = D(), p = d.getProject(pid); if (!p) return null;
    opt = opt || {};
    var files = [], items = [], n = 0;      // items: {id, href, title, level}
    function add(title, level, body) {
      n++;
      var id = 'p' + ('000' + n).slice(-4), href = id + '.xhtml';
      files.push({ name: 'OEBPS/' + href, data: page(title, body) });
      items.push({ id: id, href: href, title: title, level: level });
    }
    add(p.name, 0, '<div class="cover"><h1>' + xe(p.name) + '</h1>' + (p.genre ? '<p class="g">' + xe(p.genre) + '</p>' : '') + '</div>');
    d.listVolumes(pid).forEach(function (v) {
      var chs = d.listChapters(v.id); if (!chs.length) return;
      if (opt.volumeTitles !== false) add(v.title, 1, '<div class="vol"><h1>' + xe(v.title) + '</h1></div>');
      chs.forEach(function (c) {
        add(c.title, 2, (opt.titles !== false ? '<h2>' + xe(c.title) + '</h2>' : '') +
          (paras(c).map(function (t) { return '<p>' + xe(t) + '</p>'; }).join('') || '<p></p>'));
      });
    });
    var uid = 'urn:uuid:tws-' + pid + '-' + Date.now().toString(36);
    var toc = items.slice(1);
    var opf = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="bookid">' + uid + '</dc:identifier><dc:title>' + xe(p.name) + '</dc:title><dc:language>zh-CN</dc:language>' +
      '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta></metadata>' +
      '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>' +
      items.map(function (it) { return '<item id="' + it.id + '" href="' + it.href + '" media-type="application/xhtml+xml"/>'; }).join('') +
      '</manifest><spine toc="ncx">' + items.map(function (it) { return '<itemref idref="' + it.id + '"/>'; }).join('') + '</spine></package>';
    var nav = page('目录', '<nav epub:type="toc" id="toc"><h1>目录</h1><ol>' +
      toc.map(function (it) { return '<li' + (it.level === 1 ? ' class="v"' : '') + '><a href="' + it.href + '">' + xe(it.title) + '</a></li>'; }).join('') + '</ol></nav>');
    var ncx = '<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
      '<head><meta name="dtb:uid" content="' + uid + '"/></head><docTitle><text>' + xe(p.name) + '</text></docTitle><navMap>' +
      toc.map(function (it, i) {
        return '<navPoint id="n' + i + '" playOrder="' + (i + 1) + '"><navLabel><text>' + xe(it.title) + '</text></navLabel><content src="' + it.href + '"/></navPoint>';
      }).join('') + '</navMap></ncx>';
    var css = 'body{margin:1em;line-height:1.9}h1,h2{text-align:center;font-weight:bold}h2{margin:2em 0 1.5em}' +
      'p{text-indent:2em;margin:0 0 .4em;text-align:justify}.cover,.vol{margin-top:35%;text-align:center}.g{text-indent:0;text-align:center;color:#777}' +
      'nav ol{list-style:none;padding:0}nav li{margin:.5em 0 .5em 1.5em}nav li.v{margin-left:0;font-weight:bold}';
    /* mimetype 必须是包里的第一个文件，而且不能压缩（这里的 ZIP 本来就不压缩） */
    var all = [
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
      { name: 'OEBPS/content.opf', data: opf }, { name: 'OEBPS/nav.xhtml', data: nav },
      { name: 'OEBPS/toc.ncx', data: ncx }, { name: 'OEBPS/style.css', data: css }
    ].concat(files);
    return T.exporters.zip(all, 'application/epub+zip');
  }

  /* ============================================================
     发布格式
     ============================================================ */
  var CJK = '\\u4e00-\\u9fa5';
  /* 标点修正：只动夹在中文里的半角标点，英文句子里的不动 */
  function fixPunct(t) {
    var map = { ',': '，', '?': '？', '!': '！', ':': '：', ';': '；', '(': '（', ')': '）' };
    t = t.replace(new RegExp('([' + CJK + '”’」』）])([,?!:;)])', 'g'), function (_, a, b) { return a + map[b]; });
    t = t.replace(new RegExp('\\(([' + CJK + '])', 'g'), '（$1');
    t = t.replace(new RegExp('([' + CJK + '”"’」』）])\\.(?=\\s|$|[' + CJK + '”"])', 'g'), '$1。');
    t = t.replace(/\.{3,}|。{3,}|…+/g, '……');
    t = t.replace(/-{2,}|—+/g, '——');
    t = t.replace(new RegExp('([' + CJK + '，。！？；：、”’）])[ \\t]+(?=[' + CJK + '，。！？；：、“‘（])', 'g'), '$1');
    /* 直引号按出现顺序配成一对弯引号（每段单独配，避免一处漏了后面全错） */
    t = t.split('\n').map(function (ln) {
      var open = true;
      return ln.replace(/"/g, function () { var q = open ? '“' : '”'; open = !open; return q; });
    }).join('\n');
    return t;
  }
  function formatChapter(c, o) {
    var ps = paras(c).map(function (t) { return o.fix ? fixPunct(t) : t; });
    var body = ps.map(function (t) { return (o.indent ? '　　' : '') + t; }).join(o.blank ? '\n\n' : '\n');
    return (o.title ? c.title + '\n\n' : '') + body;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      if (ok) res(); else rej(new Error('复制失败'));
    });
  }
  var PUB_KEY = 'tws_pub_v1';
  function openPublish() {
    var d = D(), pid = d.D.activeProject;
    if (!pid) { U().toast('先建一部作品'); return; }
    T.flushSave();
    var chs = U().allChapters(pid);
    if (!chs.length) { U().toast('还没有章节'); return; }
    var o = Object.assign({ indent: true, blank: false, title: false, fix: true }, T.kit.parse(T.kit.lsGet(PUB_KEY)) || {});
    var cid = T.currentChapter() && d.getChapter(T.currentChapter()) ? T.currentChapter() : chs[0].id;
    var m = U().modal('发布格式',
      '<label class="tws-l">哪一章</label><select class="tws-i" id="pbCh">' +
        chs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('') + '</select>' +
      '<label class="tws-l">排版</label><div class="tws-chips" id="pbPre">' +
        '<span class="chip" data-p="a">段首缩进，不空行</span><span class="chip" data-p="b">空行分段，不缩进</span><span class="chip" data-p="c">缩进 + 空行</span></div>' +
      '<label class="tws-chk"><input type="checkbox" id="pbTitle"> 带上章节标题</label>' +
      '<label class="tws-chk"><input type="checkbox" id="pbFix"> 修正标点（半角 → 全角、直引号 → “”、... → ……、-- → ——、去掉字间空格）</label>' +
      '<textarea class="tws-i tws-pub-out" id="pbOut" readonly></textarea>' +
      '<div class="tws-ai-meta" id="pbMeta"></div>' +
      '<div class="tws-ai-bar"><button class="tws-btn sm" id="pbWrite">把标点修正写回正文</button><span class="tws-spacer"></span>' +
      '<button class="tws-btn primary" id="pbCopy">复制</button></div>' +
      '<p class="tws-p tws-kit-dim" style="margin-top:10px">各平台的编辑器大多会自己处理缩进：粘贴后如果段首多出空格，换成「空行分段，不缩进」再复制一次。</p>',
      { footer: false });
    var el = m.el;
    function preset() { return o.indent && !o.blank ? 'a' : (!o.indent && o.blank ? 'b' : (o.indent && o.blank ? 'c' : '')); }
    function paint() {
      var c = d.getChapter(el.querySelector('#pbCh').value); if (!c) return;
      var text = formatChapter(c, o);
      el.querySelector('#pbOut').value = text;
      el.querySelector('#pbTitle').checked = !!o.title;
      el.querySelector('#pbFix').checked = !!o.fix;
      var pr = preset();
      el.querySelectorAll('[data-p]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-p') === pr); });
      var body = paras(c).join('');
      el.querySelector('#pbMeta').textContent = '字数 ' + d.countWords(body) + '（不含标点）· ' + body.replace(/\s/g, '').length + '（含标点，多数平台按这个算）';
      var changed = o.fix && paras(c).some(function (t) { return fixPunct(t) !== t; });
      el.querySelector('#pbWrite').style.display = changed ? '' : 'none';
      T.kit.lsSet(PUB_KEY, JSON.stringify(o));
    }
    el.querySelector('#pbCh').addEventListener('change', paint);
    el.querySelector('#pbPre').addEventListener('click', function (e) {
      var c = e.target.closest('[data-p]'); if (!c) return;
      var k = c.getAttribute('data-p');
      o.indent = k !== 'b'; o.blank = k !== 'a'; paint();
    });
    el.querySelector('#pbTitle').addEventListener('change', function () { o.title = this.checked; paint(); });
    el.querySelector('#pbFix').addEventListener('change', function () { o.fix = this.checked; paint(); });
    el.querySelector('#pbCopy').addEventListener('click', function () {
      copyText(el.querySelector('#pbOut').value).then(function () { U().toast('已复制，去平台粘贴吧'); },
        function () { el.querySelector('#pbOut').select(); U().toast('自动复制没成功，已帮你全选，请按 Ctrl / ⌘ + C'); });
    });
    el.querySelector('#pbWrite').addEventListener('click', function () {
      var c = d.getChapter(el.querySelector('#pbCh').value); if (!c) return;
      var fixed = String(c.content || '').split('\n').map(function (ln) { return ln.trim() ? fixPunct(ln) : ln; }).join('\n');
      d.saveChapterContent(c.id, fixed, '标点修正前');
      T.refreshViews(); paint();
      U().toast('已写回正文（旧版本已存进历史）');
    });
    paint();
  }

  T.io = {
    openImport: openImport, openPublish: openPublish, epub: epub, markdown: markdown, copyText: copyText,
    _split: splitByTitles, _decode: decodeText, _docx: docxLines, _lines: textLines, _fix: fixPunct, _commit: commit
  };
})();
