/* ============================================================================
   TWS · 功能模块
   ① 开写模板  ② 真 .docx 导出（手工 OOXML + 自写 ZIP）  ③ 一致性检查
   ========================================================================== */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var D = T.data;

  /* ============================================================
     ① 开写模板
     ============================================================ */
  var STYLES = {
    cold:   { name: '冷硬短句', prompt: '多用短句，动词为主，少用形容词堆叠，情绪克制不外露。' },
    warm:   { name: '细腻温润', prompt: '用具体的感官细节承载情绪，避免直接说破人物感受。' },
    tense:  { name: '紧绷节奏', prompt: '缩短句子与段落，加快信息密度，让读者有被推着走的感觉。' },
    plain:  { name: '平实克制', prompt: '语言平实，不炫技，重点在把事情说清楚。' }
  };

  var TEMPLATES = [
    {
      id: 'opening', name: '开篇', hint: '立住主角', style: 'cold',
      fields: [
        { k: 'who', label: '主角是谁？', ph: '沈砚，二十三岁的剑客' },
        { k: 'where', label: '开场在哪？', ph: '断剑崖下的客栈，雪夜' },
        { k: 'hook', label: '开场要抛什么？', ph: '他背着一把不该存在的剑' }
      ],
      skeleton: '写一个开场。主角：{who}。场景：{where}。要在开场抛出的悬念：{hook}。\n' +
                '要求：不要交代背景设定，直接从动作或场景切入；让读者在 300 字内知道主角是个什么样的人。{style}'
    },
    {
      id: 'battle', name: '战斗', hint: '有张力', style: 'tense',
      fields: [
        { k: 'who', label: '谁和谁打？', ph: '沈砚 vs 三名黑衣人' },
        { k: 'where', label: '在哪？', ph: '断剑崖下的松林' },
        { k: 'why', label: '为什么打？', ph: '对方要抢他背上的剑匣' },
        { k: 'outcome', label: '打到什么程度？', ph: '沈砚受伤但赢，剑匣裂了' }
      ],
      skeleton: '写一场战斗。交手双方：{who}。地点：{where}。起因：{why}。结果：{outcome}。\n' +
                '要求：不要总结战况，不要评论招式精妙，直接写动作与身体的感受。{style}'
    },
    {
      id: 'romance', name: '感情戏', hint: '克制不腻', style: 'warm',
      fields: [
        { k: 'who', label: '谁和谁？', ph: '沈砚与柳氏' },
        { k: 'where', label: '在哪？', ph: '雨夜的檐下' },
        { k: 'barrier', label: '卡着什么？', ph: '两人都知道不该再见面' }
      ],
      skeleton: '写一段感情戏。人物：{who}。场景：{where}。他们之间的阻碍：{barrier}。\n' +
                '要求：不要写"心动""心跳加速"这类直白描写，用动作、停顿、视线和未说出口的话来写。{style}'
    },
    {
      id: 'dialogue', name: '对话', hint: '有潜台词', style: 'plain',
      fields: [
        { k: 'who', label: '谁和谁谈？', ph: '沈砚与老张' },
        { k: 'surface', label: '表面上在谈什么？', ph: '问路' },
        { k: 'hidden', label: '实际在试探什么？', ph: '老张认出了那把剑' }
      ],
      skeleton: '写一段对话。人物：{who}。表面话题：{surface}。真正在试探的：{hidden}。\n' +
                '要求：不要写"他意味深长地说"这类提示，靠台词本身和动作停顿传达潜台词。{style}'
    },
    {
      id: 'scene', name: '环境描写', hint: '五感', style: 'warm',
      fields: [
        { k: 'where', label: '写哪里？', ph: '断剑崖，清晨' },
        { k: 'mood', label: '要什么氛围？', ph: '空旷、冷、有种被注视的感觉' },
        { k: 'detail', label: '必须出现什么？', ph: '崖边那口裂了的钟' }
      ],
      skeleton: '写一段环境描写。地点：{where}。氛围：{mood}。必须出现的具体物件：{detail}。\n' +
                '要求：调动至少三种感官（视觉之外的听觉、触觉、嗅觉）；不要写成旅游介绍。{style}'
    },
    {
      id: 'continue', name: '接着写', hint: '顺着往下', style: 'cold',
      fields: [
        { k: 'next', label: '接下来发生什么？', ph: '他发现剑匣里是空的' }
      ],
      skeleton: '接着上文往下写。接下来要发生：{next}。\n' +
                '要求：保持与前文一致的语感与人称，不要重新交代已知信息。{style}'
    }
  ];

  function buildPrompt(tplId, values, styleKey) {
    var tpl = TEMPLATES.filter(function (t) { return t.id === tplId; })[0];
    if (!tpl) return '';
    var st = STYLES[styleKey || tpl.style] || STYLES[tpl.style];
    var out = tpl.skeleton;
    tpl.fields.forEach(function (f) {
      var v = (values && values[f.k]) ? String(values[f.k]).trim() : '';
      out = out.split('{' + f.k + '}').join(v || f.placeholder || '（未填）');
    });
    return out.split('{style}').join(st.prompt);
  }

  /* ============================================================
     ② 真 .docx —— 自写 ZIP（STORE 方式，Word 完全兼容）
     ============================================================ */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    // 现代浏览器都有 TextEncoder
    return new TextEncoder().encode(str);
  }

  /* 极简 ZIP 写入器（STORE，不压缩） */
  function makeZip(files) {
    var parts = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }

    files.forEach(function (f) {
      var nameBuf = utf8(f.name);
      var dataBuf = utf8(f.data);
      var crc = crc32(dataBuf);

      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(dataBuf.length), u32(dataBuf.length),
        u16(nameBuf.length), u16(0)
      );
      parts.push(new Uint8Array(local), nameBuf, dataBuf);

      central.push({ nameBuf: nameBuf, crc: crc, size: dataBuf.length, offset: offset });
      offset += local.length + nameBuf.length + dataBuf.length;
    });

    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) {
      var h = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
      );
      parts.push(new Uint8Array(h), c.nameBuf);
      cdSize += h.length + c.nameBuf.length;
    });

    parts.push(new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0)
    )));

    return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function xesc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function para(text, opts) {
    opts = opts || {};
    var pPr = '<w:pPr>' +
      '<w:spacing w:line="' + (opts.line || 380) + '" w:lineRule="auto" w:before="' + (opts.before || 0) + '" w:after="' + (opts.after || 0) + '"/>' +
      (opts.indent ? '<w:ind w:firstLineChars="200" w:firstLine="480"/>' : '') +
      (opts.align ? '<w:jc w:val="' + opts.align + '"/>' : '') +
      '</w:pPr>';
    var rPr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman"/>' +
      (opts.size ? '<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>' : '') +
      (opts.bold ? '<w:b/>' : '') + '</w:rPr>';
    return '<w:p>' + pPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + xesc(text) + '</w:t></w:r></w:p>';
  }

  /* 生成 docx Blob */
  function buildDocx(projectId, opt) {
    opt = opt || {};
    var p = D.getProject(projectId);
    if (!p) return null;
    var body = [];
    body.push(para(p.name, { size: 36, bold: true, align: 'center', after: 240 }));

    D.listVolumes(projectId).forEach(function (v) {
      var chs = D.listChapters(v.id);
      if (!chs.length) return;
      if (opt.volumeTitles) {
        body.push(para(v.title, { size: 30, bold: true, align: 'center', before: 360, after: 200 }));
      }
      chs.forEach(function (c) {
        if (opt.titles) body.push(para(c.title, { size: 28, bold: true, before: 240, after: 160 }));
        if (opt.meta) body.push(para('字数 ' + (c.words || 0) + ' · ' + statusName(c.status), { size: 18, align: 'center', after: 160 }));
        (c.content || '').split(/\n+/).forEach(function (par) {
          if (par.trim()) body.push(para(par.trim(), { indent: true, size: 24 }));
        });
      });
    });

    var doc =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';

    var files = [
      {
        name: '[Content_Types].xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>'
      },
      {
        name: '_rels/.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>'
      },
      { name: 'word/document.xml', data: doc }
    ];

    return makeZip(files);
  }

  function statusName(s) {
    return s === 'final' ? '定稿' : (s === 'revising' ? '修改中' : '草稿');
  }

  /* 触发下载 */
  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* ============================================================
     ③ 一致性检查
     ============================================================ */
  function callLLM(messages, onText) {
    var S = window.__ENDF__ && window.__ENDF__.S;
    if (!S || !S.apiKey) return Promise.reject(new Error('NO_KEY'));
    var url = (S.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.apiKey },
      body: JSON.stringify({
        model: S.model || 'deepseek-chat',
        messages: messages,
        temperature: 0.2,
        stream: !!onText
      })
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = '请求失败（' + r.status + '）';
          if (r.status === 401) msg = 'API Key 不对，检查是不是复制少了字符';
          else if (r.status === 402) msg = '账户余额不足，去服务商后台充值';
          else if (r.status === 404) msg = '模型名不对，试试切换模型';
          throw new Error(msg);
        });
      }
      if (!onText) return r.json().then(function (d) { return d.choices[0].message.content; });

      // 流式
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', full = '';
      return (function pump() {
        return reader.read().then(function (res) {
          if (res.done) return full;
          buf += dec.decode(res.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          lines.forEach(function (ln) {
            ln = ln.trim();
            if (!ln.indexOf('data:')) {
              var payload = ln.slice(5).trim();
              if (payload === '[DONE]') return;
              try {
                var j = JSON.parse(payload);
                var d = j.choices && j.choices[0] && j.choices[0].delta;
                if (d && d.content) { full += d.content; onText(full); }
              } catch (e) {}
            }
          });
          return pump();
        });
      })();
    });
  }

  /* 本地规则：名字不一致（设定库名字/别名 vs 正文近似串） */
  function checkNames(projectId, content) {
    var out = [];
    var cards = D.listCards(projectId, 'character').concat(D.listCards(projectId, 'place'));
    var seen = {};
    cards.forEach(function (c) {
      var names = [c.name].concat(c.aliases || []);
      names.forEach(function (n) {
        if (!n || n.length < 2) return;
        // 正文里出现一个与设定名编辑距离为 1 且长度相同的串
        var re = new RegExp('.{0,1}' + n.split('').join('.?') + '.{0,1}', 'g');
        var m, guard = 0;
        while ((m = re.exec(content)) && guard++ < 400) {
          var s = m[0];
          if (s === n || s.length !== n.length) continue;
          if (lev(s, n) === 1 && !seen[s]) {
            seen[s] = 1;
            out.push({
              type: 'name', severity: 'warn',
              title: '名字可能写错',
              quote: s, reason: '设定库里是「' + n + '」，正文出现「' + s + '」，只差一个字。',
              card: c.id
            });
          }
        }
      });
    });
    return out;
  }

  function lev(a, b) {
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /* LLM 语义检查：人设崩坏 / 时间矛盾 */
  function checkSemantic(projectId, chapter, content) {
    var cards = D.listCards(projectId);
    if (!cards.length) return Promise.resolve([]);
    if (!content || content.length < 50) return Promise.resolve([]);

    var lore = cards.map(function (c) {
      var s = '- ' + c.name + '（' + (D.CARD_KINDS[c.kind] || '设定') + '）';
      if (c.body) s += '：' + c.body;
      if (c.aliases && c.aliases.length) s += '；别名：' + c.aliases.join('、');
      return s;
    }).join('\n');

    var sys = '你是小说编辑，负责检查正文是否与设定冲突。\n' +
      '只输出 JSON 数组，不要任何解释、不要 markdown 代码块。\n' +
      '数组元素格式：{"type":"persona|timeline","quote":"原文片段（不超过30字）","reason":"为什么冲突（不超过40字）"}\n' +
      '没有问题就输出 []。';

    var user = '【设定】\n' + lore + '\n\n【正文】\n' + content.slice(0, 6000);

    return callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ]).then(function (txt) {
      var s = String(txt || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var arr;
      try { arr = JSON.parse(s); } catch (e) {
        var m = s.match(/\[[\s\S]*\]/);
        if (!m) return [];
        try { arr = JSON.parse(m[0]); } catch (e2) { return []; }
      }
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, 8).map(function (x) {
        return {
          type: x.type === 'timeline' ? 'timeline' : 'persona',
          severity: 'warn',
          title: x.type === 'timeline' ? '时间线可能矛盾' : '人设可能不一致',
          quote: String(x.quote || '').slice(0, 40),
          reason: String(x.reason || '').slice(0, 60)
        };
      }).filter(function (x) { return x.quote || x.reason; });
    }).catch(function (e) {
      if (e.message === 'NO_KEY') return [];
      throw e;
    });
  }

  function runCheck(projectId, chapterId) {
    var c = D.getChapter(chapterId);
    if (!c) return Promise.resolve({ issues: [], noKey: false });
    var content = c.content || '';
    var local = checkNames(projectId, content);
    var noKey = !(window.__ENDF__ && window.__ENDF__.S && window.__ENDF__.S.apiKey);
    if (noKey) return Promise.resolve({ issues: local, noKey: true });
    return checkSemantic(projectId, c, content).then(function (remote) {
      return { issues: local.concat(remote), noKey: false };
    });
  }

  /* ============================================================
     暴露
     ============================================================ */

  /* ============================================================
     ④ AI 润色 / 辅助构思
     ============================================================ */
  var POLISH_STYLES = [
    { k: 'tight',  name: '更精炼',   prompt: '删掉冗余修饰，句子更紧，信息密度更高。' },
    { k: 'vivid',  name: '更有画面感', prompt: '增加具体的动作与感官细节，让读者看得见。' },
    { k: 'deai',   name: '去 AI 味',  prompt: '避免"仿佛""似乎""不禁""一丝"这类套话；句式长短错落，更像人写的。' },
    { k: 'plain',  name: '更口语',   prompt: '让对话与叙述更贴近日常说话的语气。' },
    { k: 'literary', name: '更文学',  prompt: '注重节奏与意象，允许留白，不要解释情绪。' }
  ];

  var IDEAS = [
    { k: 'next',    label: '接下来写什么', q: '接下来应该发生什么？给 3 个具体可行的走向。' },
    { k: 'tension', label: '怎么加张力',   q: '这一章太平了。指出最该加压的地方，并给出 3 个具体做法。' },
    { k: 'turn',    label: '加个反转',     q: '给 3 个可以放进去的反转，要合理、不硬拗。' },
    { k: 'char',    label: '人物还能怎么用', q: '本章出现的人物还有哪些没被用起来的可能？给 3 个方向。' },
    { k: 'stuck',   label: '我卡住了',     q: '作者卡住了。先指出最可能的症结，再给 3 个能立刻往下写的开头句。' }
  ];

  /* 润色：保持原意，只改表达 */
  function polish(text, styleKey, onText) {
    var st = POLISH_STYLES.filter(function (x) { return x.k === styleKey; })[0] || POLISH_STYLES[0];
    var sys = '你是中文小说编辑，只做文字层面的润色。\n' +
      '硬性要求：\n' +
      '1. 保持原意、叙事视角、人称、时态不变，不增删情节；\n' +
      '2. 保留原有的分段；\n' +
      '3. 只输出润色后的正文，不要任何解释、不要加引号、不要复述原文。\n' +
      '风格要求：' + st.prompt;
    return callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: text }
    ], onText);
  }

  /* 构思：基于正文 + 设定给方向 */
  function ideate(projectId, chapter, question, onText) {
    var cards = D.onCards(projectId);
    var lore = cards.length
      ? cards.map(function (c) {
          var parts = [];
          if (c.body) parts.push(c.body);
          var a = c.attrs || {};
          Object.keys(a).forEach(function (k) { if (a[k]) parts.push(k + '：' + a[k]); });
          return '- ' + c.name + '：' + (parts.join('，') || '（无描述）');
        }).join('\n')
      : '（未勾选设定）';

    var body = (chapter && chapter.content || '').slice(-3000);
    var sys = '你是小说策划，帮作者想下一步。\n' +
      '要求：\n' +
      '1. 给 3 个方向，每个 2-3 句，必须具体到"能直接往下写"；\n' +
      '2. 不要空话（如"增加冲突""深化人物"），要说清楚写什么场面、谁做什么；\n' +
      '3. 不要替作者写正文，只给方向。';

    var user = '【设定】\n' + lore + '\n\n' +
      '【本章正文（节选末尾）】\n' + (body || '（本章还是空的）') + '\n\n' +
      '【问题】\n' + question;

    return callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ], onText);
  }


  /* ============================================================
     ⑤ AI 写入书稿的指令通道
     AI 在回复末尾输出 ```tws 代码块（每行一条 JSON），
     页面把它藏起来、换成一张确认卡，用户点了才真正写入。
     ============================================================ */
  var OP_DOC = [
    '{"op":"create_novel","name":"书名","genre":"题材"}  建一本新书',
    '{"op":"add_chapter","title":"第一章 雪夜"}  新增章节（自动挂在最后一卷）',
    '{"op":"add_lore","kind":"character|place|term|relation","name":"名字","body":"描述","aliases":["别名"]}  写入设定库',
    '{"op":"add_thread","name":"伏笔名","note":"埋了什么、准备怎么回收","plantChapter":"第一章 雪夜"}  写入伏笔',
    '{"op":"add_event","when":"第 3 天","who":"沈砚","what":"在断桥下发现了剑匣"}  写入时间线'
  ].join('\n');

  /* 从回复里拆出指令块 */
  function parseOps(text) {
    var s = String(text || '');
    var m = s.match(/```tws\s*([\s\S]*?)```/);
    if (!m) return { ops: [], clean: s };
    var ops = [];
    m[1].split('\n').forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) !== '{') return;
      try { ops.push(JSON.parse(line)); } catch (e) {}
    });
    return { ops: ops, clean: (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim() };
  }

  var OP_LABEL = {
    create_novel: '建立新书',
    add_chapter: '新增章节',
    add_lore: '写入设定库',
    add_thread: '写入伏笔',
    add_event: '写入时间线'
  };

  /* 把一条指令变成人话 */
  function describeOp(op) {
    if (!op || !op.op) return '';
    switch (op.op) {
      case 'create_novel':
        return '新建小说《' + (op.name || '未命名') + '》' + (op.genre ? '（' + op.genre + '）' : '');
      case 'add_chapter':
        return '新增章节「' + (op.title || '未命名') + '」';
      case 'add_lore':
        var k = { character: '人物', place: '地点', term: '名词', relation: '关系' }[op.kind] || '设定';
        return '设定库写入' + k + '「' + (op.name || '') + '」' + (op.body ? '：' + String(op.body).slice(0, 30) : '');
      case 'add_thread':
        return '伏笔「' + (op.name || '') + '」' + (op.plantChapter ? '（埋在 ' + op.plantChapter + '）' : '');
      case 'add_event':
        return '时间线' + (op.when ? '「' + op.when + '」' : '') + '：' + (op.what || '');
      default:
        return '';
    }
  }


  /* 从一章正文里拆出伏笔与时间线事件 */
  function extract(chapter, onText) {
    var body = (chapter && chapter.content || '').trim();
    if (!body) return Promise.reject(new Error('这一章还没有正文'));
    var known = '';
    try {
      var TD = window.TWS && window.TWS.data;
      if (TD && TD.D.activeProject) known = TD.listCards(TD.D.activeProject).map(function (c) { return c.name; }).join('、');
    } catch (e) {}
    var sys = '你是小说编辑。从下面这段正文里提取三类信息：\n' +
      '1. 人物与设定：有名字的新人物、地点、专有名词（已记录的不要重复：' + (known || '无') + '）；\n' +
      '2. 伏笔：埋下但还没解释清楚的线索、悬念、暗示；\n' +
      '3. 时间线事件：有明确时间感的「什么时候、谁、发生了什么」。\n\n' +
      '只输出一个 tws 代码块，每行一条 JSON，不要任何解释：\n' +
      '```tws\n' +
      '{"op":"add_lore","kind":"character|place|term","name":"名字","body":"一句话描述"}\n' +
      '{"op":"add_thread","name":"线索名","note":"埋了什么、可能怎么回收"}\n' +
      '{"op":"add_event","when":"三年前","who":"沈砚","what":"师父被杀"}\n' +
      '```\n\n' +
      '规则：\n' +
      '- 只提取正文里确实写到的，不要编造；\n' +
      '- 伏笔只取「埋下但未解释」的，已经讲清楚的不算；\n' +
      '- 时间线只取有明确时间感的（三年前 / 第二天 / 入夜后 / 三个月后…）；\n' +
      '- 最多 8 条，宁少勿滥；\n' +
      '- 什么都没提取到，就输出一个空的 tws 代码块。';
    return callLLM([
      { role: 'system', content: sys },
      { role: 'user', content: body.slice(-6000) }
    ], onText);
  }

  /* 无 Key 时的统一引导 */
  function needKey() {
    return !(window.__ENDF__ && window.__ENDF__.S && window.__ENDF__.S.apiKey);
  }

  T.templates = { LIST: TEMPLATES, STYLES: STYLES, build: buildPrompt };
  T.exporters = { docx: buildDocx, download: download, statusName: statusName };
  T.checker = { run: runCheck, callLLM: callLLM };
  T.ops = { parse: parseOps, describe: describeOp, LABEL: OP_LABEL, DOC: OP_DOC };
  T.ai = { polish: polish, ideate: ideate, extract: extract, needKey: needKey,
          POLISH_STYLES: POLISH_STYLES, IDEAS: IDEAS };
})();
