/* ============================================================
   To Writing Studio · 账号 TO ACCOUNT（V3.7.0）
   ------------------------------------------------------------
   连接自己搭的账号服务（to-account）。界面：整屏的登录页 / 用户页。
   - 服务器地址由用户填写（隧道地址会变），存在 tws_account_v1.server
   - access token 只放内存；refresh token 放 localStorage（tws_account_v1.rt）
   - 刷新时用 Web Locks 让多个标签页排队；拿到 409 rotated 就去读别的标签页刚存的新 token
   - tws_account_v1 里有登录凭证，**不进全书备份**（js/tws-backup.js 的清单里没有它）
   入口：系统配置「账号 / Account」、电脑版左栏底部的头像
   ============================================================ */
(function () {
  'use strict';
  var T = window.TWS = window.TWS || {};
  var KEY = 'tws_account_v1';
  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  function store(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function patch(p) { var v = load(); Object.keys(p).forEach(function (k) { if (p[k] === undefined) delete v[k]; else v[k] = p[k]; }); store(v); return v; }
  function clientId() { return root.getAttribute('data-device') === 'phone' ? 'to-mobile' : 'to-web'; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ============================================================
     与服务器通信
     ============================================================ */
  var access = null, accessExp = 0;
  function server() { return String(load().server || '').replace(/\/+$/, ''); }
  function normServer(s) {
    s = String(s || '').trim().replace(/\/+$/, '');
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { var u = new URL(s); return u.origin + u.pathname.replace(/\/+$/, ''); } catch (e) { return ''; }
  }
  function raw(path, opt) {
    opt = opt || {};
    var base = opt.base || server();
    if (!base) return Promise.reject(new Error('还没有填服务器地址'));
    var headers = {};
    if (opt.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opt.token) headers.Authorization = 'Bearer ' + opt.token;
    return fetch(base + path, {
      method: opt.method || (opt.body !== undefined ? 'POST' : 'GET'), headers: headers, cache: 'no-store',
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
      signal: AbortSignal.timeout ? AbortSignal.timeout(opt.timeout || 12000) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('请求失败（' + r.status + '）')); e.status = r.status; e.code = j.code; throw e; }
        return j;
      });
    }, function (e) {
      var msg = location.protocol === 'https:' && /^http:/i.test(base) && !/^http:\/\/(localhost|127\.)/i.test(base)
        ? '网页是 https，服务器地址是 http，浏览器不让连。请用 https 地址' : '连不上服务器，检查地址和网络';
      var err = new Error(e && e.name === 'TimeoutError' ? '服务器太久没回应' : msg); err.network = true; throw err;
    });
  }
  function take(j) {
    access = j.access_token; accessExp = Date.now() + (j.expires_in || 900) * 1000 - 30000;
    patch({ rt: j.refresh_token, sid: j.session_id, user: j.user });
    paintEntry();
    return j;
  }
  function signOutLocal() {
    access = null; accessExp = 0;
    patch({ rt: undefined, sid: undefined, user: undefined });
    paintEntry();
  }
  /* 用 refresh token 换新的一对；多个标签页排队，避免同时拿同一个 token 去换 */
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var run = function () {
      var rt = load().rt;
      if (!rt) return Promise.reject(Object.assign(new Error('未登录'), { status: 401 }));
      return raw('/v1/token/refresh', { body: { refresh_token: rt } }).then(take).catch(function (e) {
        if (e.code === 'rotated') {
          /* 别的标签页刚换过：等它存好，读它的 */
          return wait(700).then(function () {
            var now = load().rt;
            if (now && now !== rt) return raw('/v1/token/refresh', { body: { refresh_token: now } }).then(take);
            throw e;
          });
        }
        if (e.status === 401) signOutLocal();
        throw e;
      });
    };
    refreshing = (navigator.locks && navigator.locks.request ? navigator.locks.request('tws-account-refresh', run) : run())
      .then(function (j) { refreshing = null; return j; }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }
  function authed(path, opt) {
    opt = opt || {};
    var go = function () { return raw(path, Object.assign({}, opt, { token: access })); };
    var ready = access && Date.now() < accessExp ? Promise.resolve() : refresh();
    return ready.then(go).catch(function (e) {
      if (e.status !== 401 || opt._retried) throw e;
      return refresh().then(function () { return authed(path, Object.assign({}, opt, { _retried: true })); });
    });
  }
  function loggedIn() { return !!load().rt; }
  function user() { return load().user || null; }

  /* ============================================================
     图标与小部件
     ============================================================ */
  var I = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.6c1.4-3.3 4.1-5 7.2-5s5.8 1.7 7.2 5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 3.5l17 17M10.2 5.7A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.4 7.3C3.9 9 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.8-.4 4-1"/><path d="M9.9 10a2.8 2.8 0 0 0 4 4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>'
  };
  var MARK = '<img class="ac-mark" src="logo/to-mark.svg" alt="" aria-hidden="true">';
  function avatarHtml(u, cls) {
    var a = u && u.avatar || '';
    var inner = /^data:image\//.test(a) ? '<img src="' + esc(a) + '" alt="">' :
      '<span>' + esc(a || [...String((u && (u.nick || u.name)) || '·')][0]) + '</span>';
    return '<span class="ac-ava ' + (cls || '') + (a && !/^data:/.test(a) ? ' emoji' : '') + '">' + inner + '</span>';
  }
  function field(id, label, type, opt) {
    opt = opt || {};
    return '<label class="ac-f' + (opt.cls ? ' ' + opt.cls : '') + '"><input id="' + id + '" type="' + (type || 'text') + '" placeholder=" " autocomplete="' + (opt.ac || 'off') + '"' +
      (opt.value ? ' value="' + esc(opt.value) + '"' : '') + ' spellcheck="false" autocapitalize="off"' + (opt.max ? ' maxlength="' + opt.max + '"' : '') + '>' +
      '<span>' + esc(label) + '</span>' + (type === 'password' ? '<button type="button" class="ac-eye" tabindex="-1" aria-label="显示密码">' + I.eye + '</button>' : '') + '</label>';
  }
  function joined(ts) { if (!ts) return ''; var d = new Date(ts); return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月加入'; }
  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 90) return '刚刚'; if (s < 3600) return Math.round(s / 60) + ' 分钟前';
    if (s < 86400) return Math.round(s / 3600) + ' 小时前'; if (s < 30 * 86400) return Math.round(s / 86400) + ' 天前';
    var d = new Date(ts); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); return Promise.resolve();
  }

  /* ============================================================
     整屏层
     ============================================================ */
  var layer = null;
  function close() {
    if (!layer) return;
    var l = layer; layer = null;
    l.classList.remove('on');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(function () { l.remove(); }, 420);
  }
  function onKey(e) { if (e.key === 'Escape' && layer && !layer.querySelector('.ac-busy')) { e.preventDefault(); close(); } }
  function open(view) {
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'ac-layer'; layer.id = 'acLayer';   // 用 id 压过全站输入框规则（那条规则带了五个 :not，优先级很高）
      layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', 'To Account');
      layer.innerHTML = '<button type="button" class="ac-x" aria-label="关闭">' + I.close + '</button><div class="ac-stage"></div>';
      document.body.appendChild(layer);
      layer.querySelector('.ac-x').addEventListener('click', close);
      document.addEventListener('keydown', onKey, true);
      requestAnimationFrame(function () { requestAnimationFrame(function () { layer && layer.classList.add('on'); }); });
    }
    (view || (loggedIn() ? viewUser : viewSign))();
  }
  function stage(html, cls) {
    var st = layer.querySelector('.ac-stage');
    st.className = 'ac-stage ' + (cls || '');
    st.innerHTML = html;
    st.classList.remove('in'); void st.offsetWidth; st.classList.add('in');
    st.querySelectorAll('.ac-eye').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.innerHTML = show ? I.eyeOff : I.eye;
        b.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      });
    });
    return st;
  }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.classList.add('ac-busy'); btn.innerHTML = '<i></i><i></i><i></i>'; }
    else { btn.disabled = false; btn.classList.remove('ac-busy'); btn.innerHTML = label || btn.dataset.label || ''; }
  }
  function say(el, msg, good) {
    el.textContent = msg || '';
    el.classList.toggle('good', !!good);
    el.classList.remove('shake'); void el.offsetWidth; if (msg && !good) el.classList.add('shake');
  }

  /* ---------------- 登录 / 注册 ---------------- */
  var health = { base: '', at: 0, ok: null, registration: 'invite' };
  function ping(base) {
    if (!base) { health = { base: '', ok: null, registration: 'invite', at: Date.now() }; return Promise.resolve(health); }
    return raw('/v1/health', { base: base, timeout: 6000 }).then(function (j) {
      health = { base: base, ok: !!j.ok, registration: j.registration || 'invite', at: Date.now() };
      return health;
    }, function (e) { health = { base: base, ok: false, registration: 'invite', at: Date.now(), err: e.message }; return health; });
  }
  function viewSign(mode) {
    mode = mode === 'register' ? 'register' : 'login';
    var srv = server();
    var st = stage(
      '<div class="ac-col ac-sign">' +
        MARK +
        '<h1 class="ac-title"><em>To</em> Account</h1>' +
        '<p class="ac-sub">' + (mode === 'login' ? '欢迎回来' : '为你的写作，留一个名字') + '</p>' +
        '<div class="ac-tabs" role="tablist"><button type="button" role="tab" data-m="login">登录</button><button type="button" role="tab" data-m="register">注册</button><i class="ac-tabline"></i></div>' +
        '<form class="ac-form" novalidate>' +
          field('acName', '用户名', 'text', { ac: 'username', max: 16 }) +
          field('acPw', '密码', 'password', { ac: mode === 'login' ? 'current-password' : 'new-password', max: 200 }) +
          (mode === 'register' ? field('acInv', '邀请码', 'text', { cls: 'ac-inv', max: 12 }) : '') +
          '<button type="submit" class="ac-go">' + (mode === 'login' ? '登录' : '创建账号') + I.arrow + '</button>' +
          '<p class="ac-msg" aria-live="polite"></p>' +
        '</form>' +
        '<div class="ac-srv">' +
          '<button type="button" class="ac-srv-t"><i class="ac-dot"></i><span></span></button>' +
          '<div class="ac-srv-edit">' + field('acSrv', '服务器地址', 'url', { value: srv }) + '<button type="button" class="ac-srv-ok">保存</button></div>' +
        '</div>' +
      '</div>', 'sign');
    var tabs = st.querySelector('.ac-tabs'), line = st.querySelector('.ac-tabline');
    function placeLine() {
      var b = tabs.querySelector('[data-m="' + mode + '"]');
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      line.style.width = b.offsetWidth + 'px'; line.style.transform = 'translateX(' + b.offsetLeft + 'px)';
    }
    requestAnimationFrame(placeLine);
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return;
      var keep = { n: $('acName').value, p: $('acPw').value };
      viewSign(b.dataset.m);
      $('acName').value = keep.n; $('acPw').value = keep.p;
    });
    /* 服务器：底部一行小字，点开才编辑 */
    var srvBox = st.querySelector('.ac-srv'), srvT = st.querySelector('.ac-srv-t span'), dot = st.querySelector('.ac-dot');
    function paintSrv() {
      var s = server();
      if (!s) { srvBox.classList.add('open'); srvT.textContent = '先填写账号服务器地址'; dot.className = 'ac-dot'; return; }
      var host = s.replace(/^https?:\/\//, '');
      srvT.textContent = host;
      dot.className = 'ac-dot ' + (health.base !== s || health.ok === null ? 'wait' : health.ok ? 'ok' : 'bad');
      dot.title = health.base === s && health.ok === false ? (health.err || '连不上') : '';
      var inv = st.querySelector('.ac-inv');
      if (inv) inv.classList.toggle('hide', health.base === s && health.registration === 'open');
    }
    function check() { var s = server(); paintSrv(); if (s) ping(s).then(function () { if (layer && st.isConnected) paintSrv(); }); }
    st.querySelector('.ac-srv-t').addEventListener('click', function () { srvBox.classList.toggle('open'); if (srvBox.classList.contains('open')) $('acSrv').focus(); });
    function saveSrv() {
      var v = normServer($('acSrv').value);
      if (!v) { say(st.querySelector('.ac-msg'), '服务器地址不对，例如 https://xxx.trycloudflare.com'); return; }
      if (v !== server()) { signOutLocal(); patch({ server: v }); }
      $('acSrv').value = v; srvBox.classList.remove('open'); say(st.querySelector('.ac-msg'), '');
      check();
    }
    st.querySelector('.ac-srv-ok').addEventListener('click', saveSrv);
    $('acSrv').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveSrv(); } });
    check();
    if (Date.now() - health.at > 20000) check();

    st.querySelector('.ac-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = st.querySelector('.ac-msg'), btn = st.querySelector('.ac-go');
      var name = $('acName').value.trim(), pw = $('acPw').value;
      if (!server()) { srvBox.classList.add('open'); $('acSrv').focus(); return say(msg, '先填写账号服务器地址'); }
      if (!name) { $('acName').focus(); return say(msg, '请填写用户名'); }
      if (!pw) { $('acPw').focus(); return say(msg, '请填写密码'); }
      if (mode === 'register' && pw.length < 8) { $('acPw').focus(); return say(msg, '密码至少 8 位'); }
      busy(btn, true); say(msg, '');
      var body = { name: name, password: pw, client_id: clientId() };
      if (mode === 'register') body.invite = ($('acInv') || {}).value || '';
      raw(mode === 'login' ? '/v1/login' : '/v1/register', { body: body }).then(function (j) {
        take(j);
        btn.classList.remove('ac-busy'); btn.classList.add('ac-done'); btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
        setTimeout(function () { if (layer) viewUser(true); }, 520);
      }, function (err) {
        busy(btn, false); say(msg, err.message);
        if (err.network) { health.ok = false; health.err = err.message; paintSrv(); }
      });
    });
    setTimeout(function () { var n = $('acName'); if (n && server()) n.focus(); }, 380);
  }

  /* ---------------- 用户页 ---------------- */
  function viewUser(welcome) {
    var u = user() || {};
    var st = stage(
      '<div class="ac-col ac-user">' +
        '<div class="ac-hero">' +
          '<button type="button" class="ac-ava-btn" aria-label="更换头像">' + avatarHtml(u, 'xl') + '<i>更换</i></button>' +
          '<h1 class="ac-nick">' + esc(u.nick || u.name || '') + '</h1>' +
          '<p class="ac-meta"><span>@' + esc(u.name || '') + '</span>' + (u.created ? '<i></i><span>' + joined(u.created) + '</span>' : '') +
            (u.admin ? '<i></i><span class="ac-badge">管理员</span>' : '') + '</p>' +
        '</div>' +
        '<section class="ac-sec" data-s="profile"><h2>资料<em>Persona</em></h2>' +
          '<div class="ac-row">' + field('acNick', '昵称', 'text', { value: u.nick && u.nick !== u.name ? u.nick : '', max: 20 }) + '<button type="button" class="ac-link" data-a="nick">保存</button></div>' +
          '<div class="ac-emoji" aria-label="选一个表情当头像">' + ['🪶', '📖', '🌙', '🦊', '🐋', '🌿', '🍵', '🌸'].map(function (x) { return '<button type="button" data-e="' + x + '">' + x + '</button>'; }).join('') +
            '<button type="button" data-a="upload" class="ac-up">上传图片</button><input type="file" accept="image/*" hidden id="acFile"></div>' +
        '</section>' +
        '<section class="ac-sec" data-s="pw"><h2>密码<em>Clavis</em></h2>' +
          '<button type="button" class="ac-link ac-open" data-a="pwopen">修改密码</button>' +
          '<form class="ac-pw" hidden novalidate>' + field('acOld', '当前密码', 'password', { ac: 'current-password' }) + field('acNew', '新密码（至少 8 位）', 'password', { ac: 'new-password' }) +
            '<div class="ac-row end"><button type="button" class="ac-link mute" data-a="pwcancel">取消</button><button type="submit" class="ac-pill">确认修改</button></div>' +
            '<p class="ac-hint">修改后，其他设备上的登录会全部退出。</p></form>' +
        '</section>' +
        '<section class="ac-sec" data-s="dev"><h2>登录设备<em>Loca</em></h2><ul class="ac-devs"><li class="ac-ph">正在读取……</li></ul></section>' +
        (u.admin ? '<section class="ac-sec" data-s="inv"><h2>邀请<em>Invitatio</em></h2>' +
          '<div class="ac-invbox"><div class="ac-code" hidden></div><div class="ac-row"><button type="button" class="ac-pill" data-a="invite">生成邀请码</button><span class="ac-hint">一次性，7 天内有效</span></div></div>' +
          '<ul class="ac-invs"></ul></section>' : '') +
        '<div class="ac-foot"><button type="button" class="ac-link mute" data-a="logout">退出登录</button><i></i><button type="button" class="ac-link mute" data-a="logoutall">所有设备退出</button></div>' +
        '<p class="ac-msg ac-umsg" aria-live="polite"></p>' +
        '<p class="ac-srvline">' + esc(server().replace(/^https?:\/\//, '')) + '</p>' +
      '</div>', 'user' + (welcome ? ' welcome' : ''));
    var msg = st.querySelector('.ac-umsg');

    /* 打开时先刷新一下自己的资料（顺便验证还在登录） */
    authed('/v1/me').then(function (me) {
      patch({ user: Object.assign({}, user(), me) });
      if (layer && st.isConnected && !welcome) {
        var u2 = user();
        st.querySelector('.ac-nick').textContent = u2.nick || u2.name;
        st.querySelector('.ac-ava-btn').innerHTML = avatarHtml(u2, 'xl') + '<i>更换</i>';
      }
    }, function (e) { if (e.status === 401 && layer) viewSign(); });
    loadDevices(st); if (u.admin) loadInvites(st);

    function setAvatar(v) {
      return authed('/v1/me', { method: 'PATCH', body: { avatar: v } }).then(function (me) {
        patch({ user: Object.assign({}, user(), me) });
        st.querySelector('.ac-ava-btn').innerHTML = avatarHtml(me, 'xl') + '<i>更换</i>';
        paintEntry(); say(msg, '头像已更新', true);
      }, function (e) { say(msg, e.message); });
    }
    st.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var a = t.dataset.a;
      if (t.classList.contains('ac-ava-btn')) { st.querySelector('[data-s="profile"]').classList.add('flash'); setTimeout(function () { st.querySelector('[data-s="profile"]').classList.remove('flash'); }, 900); st.querySelector('.ac-emoji').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (t.dataset.e) { setAvatar(t.dataset.e); return; }
      if (a === 'upload') { $('acFile').click(); return; }
      if (a === 'nick') {
        var v = $('acNick').value.trim();
        authed('/v1/me', { method: 'PATCH', body: { nick: v } }).then(function (me) {
          patch({ user: Object.assign({}, user(), me) });
          st.querySelector('.ac-nick').textContent = me.nick || me.name; paintEntry(); say(msg, '昵称已保存', true);
        }, function (err) { say(msg, err.message); });
        return;
      }
      if (a === 'pwopen') { t.hidden = true; st.querySelector('.ac-pw').hidden = false; $('acOld').focus(); return; }
      if (a === 'pwcancel') { st.querySelector('.ac-pw').hidden = true; st.querySelector('[data-a="pwopen"]').hidden = false; return; }
      if (a === 'kick') {
        authed('/v1/sessions/' + encodeURIComponent(t.dataset.id), { method: 'DELETE' }).then(function () { loadDevices(st); }, function (err) { say(msg, err.message); });
        return;
      }
      if (a === 'invite') {
        busy(t, true);
        authed('/v1/invites', { body: {} }).then(function (j) {
          busy(t, false);
          var box = st.querySelector('.ac-code');
          box.hidden = false;
          box.innerHTML = '<span>' + esc(j.code) + '</span><button type="button" class="ac-copy" data-code="' + esc(j.code) + '" aria-label="复制">' + I.copy + '</button>';
          box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
          loadInvites(st);
        }, function (err) { busy(t, false); say(msg, err.message); });
        return;
      }
      if (t.classList.contains('ac-copy')) { copy(t.dataset.code).then(function () { say(msg, '邀请码已复制', true); }); return; }
      if (a === 'logout' || a === 'logoutall') {
        if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = a === 'logout' ? '再点一次退出' : '再点一次：全部退出'; setTimeout(function () { if (t.isConnected) { delete t.dataset.sure; t.textContent = a === 'logout' ? '退出登录' : '所有设备退出'; } }, 3000); return; }
        authed(a === 'logout' ? '/v1/logout' : '/v1/logout-all', { body: {} }).catch(function () {}).then(function () { signOutLocal(); if (layer) viewSign(); });
      }
    });
    $('acFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; this.value = '';
      if (!f) return;
      shrink(f).then(setAvatar, function (e) { say(msg, e.message); });
    });
    st.querySelector('.ac-pw').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('.ac-pill'), old = $('acOld').value, pw = $('acNew').value;
      if (pw.length < 8) return say(msg, '新密码至少 8 位');
      busy(btn, true);
      authed('/v1/password', { body: { old: old, password: pw } }).then(function (j) {
        take(j); busy(btn, false);
        st.querySelector('.ac-pw').hidden = true; st.querySelector('[data-a="pwopen"]').hidden = false;
        $('acOld').value = ''; $('acNew').value = '';
        say(msg, '密码已修改' + (j.others ? '，其他 ' + j.others + ' 台设备已退出' : ''), true);
        loadDevices(st);
      }, function (err) { busy(btn, false); say(msg, err.message); });
    });
  }
  /* 上传的头像缩到 160×160 的 JPEG，控制在服务器限制的 200KB 以内 */
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) return rej(new Error('请选一张图片'));
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = 160, c = document.createElement('canvas'); c.width = c.height = s;
        var k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k;
        c.getContext('2d').drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('这张图片读不出来')); };
      img.src = url;
    });
  }
  function loadDevices(st) {
    authed('/v1/sessions').then(function (list) {
      var ul = st.querySelector('.ac-devs'); if (!ul) return;
      ul.innerHTML = list.map(function (d) {
        return '<li' + (d.current ? ' class="cur"' : '') + '><div><b>' + esc(d.device_name || '未知设备') + '</b><span>' + esc(d.client) + ' · ' + (d.current ? '当前设备' : ago(d.last_used_at)) + '</span></div>' +
          (d.current ? '<em>此处</em>' : '<button type="button" class="ac-link mute" data-a="kick" data-id="' + esc(d.id) + '">移除</button>') + '</li>';
      }).join('') || '<li class="ac-ph">没有其他设备</li>';
    }, function () {});
  }
  function loadInvites(st) {
    authed('/v1/invites').then(function (list) {
      var ul = st.querySelector('.ac-invs'); if (!ul) return;
      var STATUS = { unused: '未使用', used: '已使用', expired: '已过期' };
      ul.innerHTML = list.slice(0, 6).map(function (i) {
        return '<li class="' + i.status + '"><code>' + esc(i.code) + '</code><span>' + STATUS[i.status] + (i.used_by && i.used_by.length ? ' · ' + esc(i.used_by.join('、')) : '') + '</span></li>';
      }).join('');
    }, function () {});
  }

  /* ============================================================
     入口：左栏头像 + 系统配置一行
     ============================================================ */
  function paintEntry() {
    var u = loggedIn() ? user() : null;
    var b = $('stAcct');
    if (b) {
      b.innerHTML = u ? avatarHtml(u, 'sm') : '<span class="ac-ava sm empty">' + I.user + '</span>';
      b.title = u ? (u.nick || u.name) + ' · 账号' : '登录 To Account';
      b.classList.toggle('in', !!u);
    }
    var h = $('acctHint');
    if (h) h.textContent = u ? '已登录 · ' + (u.nick || u.name) + (server() ? ' · ' + server().replace(/^https?:\/\//, '') : '') : (server() ? '未登录 · ' + server().replace(/^https?:\/\//, '') : '连接你自己的账号服务');
    var ob = $('btnAcct'); if (ob) ob.textContent = u ? '管理' : '登录';
  }
  function mount() {
    var ok = true;
    var foot = document.querySelector('.st-foot');
    if (foot && !$('stAcct') && root.getAttribute('data-device') !== 'phone') {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'icon-btn st-acct'; b.id = 'stAcct';
      b.addEventListener('click', function () { open(); });
      foot.insertBefore(b, foot.firstChild);
    } else if (!foot && root.getAttribute('data-device') !== 'phone') ok = false;
    var bk = $('btnBackup'), row = bk && bk.closest('.row');
    if (row && !$('btnAcct')) {
      var r = document.createElement('div');
      r.className = 'row'; r.style.marginTop = '8px';
      r.innerHTML = '<span class="ico" style="--c:var(--i3)" data-ico="user">账</span><span class="row-main"><span class="row-ttl">账号 / Account</span>' +
        '<span class="row-sub" id="acctHint"></span></span><button class="mini-btn" id="btnAcct">登录</button>';
      row.parentNode.insertBefore(r, row);
      $('btnAcct').addEventListener('click', function () { open(); });
    } else if (!row) ok = false;
    paintEntry();
    return ok;
  }
  /* 别的标签页登录 / 退出了：这边跟着变 */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    if (!loggedIn()) { access = null; accessExp = 0; }
    paintEntry();
    if (layer && !loggedIn() && layer.querySelector('.ac-user')) viewSign();
  });
  function init() {
    var n = 0;
    (function tryMount() { if (!mount() && n++ < 40) setTimeout(tryMount, 250); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  T.account = { open: open, close: close, api: authed, user: user, loggedIn: loggedIn, server: server, _normServer: normServer };
})();
