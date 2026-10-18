/* ============================================================================
   To写作工作台 · QQ 音乐中转（Cloudflare Worker）
   为什么需要它：QQ 音乐官方开放接口（a.y.qq.com）不允许网页直接跨域调用，
   而且 API Key 绑定你的账号，不能放进网页里。这个 Worker 帮网页转发请求，Key 只存在 Cloudflare。

   部署后在 Worker 的「设置 → 变量和机密」里添加两个「机密(Secret)」：
     QQMUSIC_API_KEY   你在 y.qq.com/n/ryqq_v2/qqmusic_skills 拿到的 qmk-xxxx
     ACCESS_TOKEN      自己随便设一串长密码（网页里也填同一串），防止别人蹭用

   只转发三个只读接口：搜索、每日推荐、猜你喜欢。只接受来自你网站的请求。
   ========================================================================== */
const UPSTREAM = 'https://a.y.qq.com';
const SKILL_VERSION = '0.0.3';
const ALLOWED_PATHS = new Set(['/discover/search', '/discover/daily-mix', '/discover/radio']);
const ALLOWED_ORIGINS = new Set([
  'https://theshyocean.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-TWS-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, origin ? cors(origin) : {}),
  });
}
/* 比较密码时不提前退出，避免被逐位试出来 */
function same(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const okOrigin = ALLOWED_ORIGINS.has(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return okOrigin ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('TWS QQ Music relay is running.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (!okOrigin) return json({ ok: false, msg: '来源网站不在允许列表里' }, 403);
    if (request.method !== 'POST') return json({ ok: false, msg: '只支持 POST' }, 405, origin);
    if (!env.QQMUSIC_API_KEY || !env.ACCESS_TOKEN) return json({ ok: false, msg: 'Worker 还没配置 QQMUSIC_API_KEY / ACCESS_TOKEN' }, 500, origin);
    if (!same(request.headers.get('X-TWS-Token'), env.ACCESS_TOKEN)) return json({ ok: false, msg: '访问密码不对' }, 401, origin);
    if (!ALLOWED_PATHS.has(url.pathname)) return json({ ok: false, msg: '不支持的接口' }, 404, origin);

    let params = {};
    try {
      const body = await request.json();
      if (body && typeof body.params === 'object' && body.params) params = body.params;
    } catch (e) { /* 没有 body 的接口（每日推荐）就用空参数 */ }
    if (url.pathname === '/discover/search') {
      const kw = String(params.keyword || '').trim().slice(0, 60);
      if (!kw) return json({ ok: false, msg: '关键词为空' }, 400, origin);
      params = { keyword: kw, type: '0', page: Math.max(0, Math.min(20, parseInt(params.page, 10) || 0)) };
    } else {
      params = {};
    }

    let up;
    try {
      up = await fetch(UPSTREAM + url.pathname, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.QQMUSIC_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, comm: { skill_version: SKILL_VERSION } }),
      });
    } catch (e) {
      return json({ ok: false, msg: '连不上 QQ 音乐接口' }, 502, origin);
    }
    let data;
    try { data = await up.json(); } catch (e) { return json({ ok: false, msg: 'QQ 音乐返回了无法解析的内容', status: up.status }, 502, origin); }
    if ((data.ret && data.ret !== 0) || (data.sub_ret && data.sub_ret !== 0) || !up.ok) {
      return json({ ok: false, msg: data.msg || 'QQ 音乐接口报错', ret: data.ret, sub_ret: data.sub_ret }, up.ok ? 502 : up.status, origin);
    }
    /* 只把需要的字段回给网页 */
    const raw = data.songs || data.songlist || [];
    const songs = raw.slice(0, 50).map(s => ({
      mid: String(s.songMid || ''),
      name: String(s.songName || ''),
      singer: String(s.singerName || ''),
      url: String(s.songH5Url || (s.songMid ? 'https://i2.y.qq.com/a/song/' + s.songMid : '')),
    })).filter(s => s.mid && s.name);
    return json({ ok: true, songs, hasMore: !!data.hasMore }, 200, origin);
  },
};
