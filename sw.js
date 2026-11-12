/* ============================================================
   To Writing Studio · 离线缓存（Service Worker）
   ------------------------------------------------------------
   目的：断网也能打开工作台接着写（AI 功能仍然需要联网）。
   策略：
   - 页面、脚本、样式：先走网络，拿到就更新缓存；网络不通才用缓存。
     所以联网时永远是最新版，不会被旧缓存卡住。
   - 字体、图标：基本不变，先用缓存，没有再去下载。
   - 只管本站的 GET 请求；AI 接口、WebDAV 等跨站请求一律不碰。
   发新版时把 CACHE 的版本号改一下，旧缓存会被清掉。
   ============================================================ */
var CACHE = 'tws-v3.5.5';
var CORE = [
  './', 'index.html', 'desktop.html', 'mobile.html', 'manifest.webmanifest',
  'studio.css', 'studio.js', 'mobile.css', 'mobile.js',
  'terminal-redesign.css', 'terminal-redesign.js',
  'boot-ink.css', 'boot-ink.js', 'boot-strokes.js', 'boot-draw.css', 'boot-draw.js',
  'boot-art-desktop.js', 'boot-art-mobile.js', 'lq-glass.js',
  'js/tws.css', 'js/tws-define.css', 'js/tws-fun.css', 'js/tws-kit.css',
  'js/tws-data.js', 'js/tws-features.js', 'js/tws-views.js', 'js/tws-define.js', 'js/tws-brain.js',
  'js/tws-fun.js', 'js/tws-persona.js', 'js/tws-backup.js', 'js/tws-flow.js', 'js/tws-search.js',
  'js/tws-kit.js', 'js/tws-io.js', 'js/tws-craft.js', 'js/tws-meter.js', 'js/tws-sync.js',
  'favicon.svg', 'favicon-32.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'logo/to-icon.svg', 'logo/to-mark.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    /* 一个个加：某个文件没取到不影响其它的 */
    return Promise.all(CORE.map(function (u) {
      return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('tws-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isStatic(url) { return /\/fonts\/|\.(woff2?|png|svg|ico)$/i.test(url.pathname); }

/* 同一个文件只留一份（?v= 版本号变了就把旧的换掉） */
function store(req, res) {
  if (!res || !res.ok || res.type !== 'basic') return;
  var copy = res.clone(), url = new URL(req.url);
  caches.open(CACHE).then(function (c) {
    return c.keys(new Request(url.origin + url.pathname), { ignoreSearch: true }).then(function (old) {
      return Promise.all(old.filter(function (o) { return o.url !== req.url; }).map(function (o) { return c.delete(o); }));
    }).then(function () { return c.put(req, copy); });
  }).catch(function () {});
}
function fromCache(req) {
  return caches.match(req).then(function (hit) { return hit || caches.match(req, { ignoreSearch: true }); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) return;

  if (isStatic(url)) {
    e.respondWith(fromCache(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { store(req, res); return res; });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) { store(req, res); return res; }).catch(function () {
    return fromCache(req).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    });
  }));
});
