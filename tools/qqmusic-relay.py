"""
To写作工作台 · QQ 音乐本机中转
=================================
为什么需要它：QQ 音乐官方开放接口（a.y.qq.com）不允许网页直接跨域调用，
而 API Key 绑定你的账号，不能放进网页。这个小程序在你自己电脑上帮网页转发请求。

用法：
  1. 第一次：双击 qqmusic-relay.bat（有窗口，用来粘贴 Key）
     以后：双击 qqmusic-relay-hidden.vbs 就会隐藏运行（没有窗口）；
     「开机自动运行.bat」让它开机自己在后台启动；「停止中转.bat」关掉它
  2. 第一次运行会让你粘贴 QQ 音乐 API Key（qmk- 开头，输入时不显示），保存在本文件旁边的 qqmusic-key.txt
  3. 窗口开着就能用；写作工作台音乐面板里「连接设置」的中转地址填 http://127.0.0.1:17890
  想换 Key：删掉 qqmusic-key.txt 再运行一次。

安全：只监听本机（127.0.0.1），只接受来自写作工作台网站的请求，只转发搜索 / 每日推荐 / 猜你喜欢三个只读接口。
只用 Python 自带的库，不用装任何东西。
"""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", 17890
UPSTREAM = "https://a.y.qq.com"
SKILL_VERSION = "0.0.3"
ALLOWED_PATHS = {"/discover/search", "/discover/daily-mix", "/discover/radio"}
ALLOWED_ORIGINS = {
    "https://theshyocean.github.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
}
KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qqmusic-key.txt")


def load_key():
    key = os.environ.get("QQMUSIC_API_KEY", "").strip()
    if key:
        return key
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, encoding="utf-8") as f:
            key = f.read().strip()
        if key:
            return key
    if sys.stdin is None or sys.stdout is None:
        # 后台（无窗口）模式下没法输入 Key：直接退出，先用 qqmusic-relay.bat 运行一次
        sys.exit(2)
    print("第一次运行：请粘贴你的 QQ 音乐 API Key（qmk- 开头，输入时不会显示），然后按回车。")
    print("获取地址：https://y.qq.com/n/ryqq_v2/qqmusic_skills")
    while True:
        key = getpass.getpass("API Key: ").strip()
        if key.startswith("qmk-") and len(key) > 8:
            break
        print("看起来不对，应该是 qmk- 开头的一串，请再粘贴一次。")
    with open(KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    print("已保存到", KEY_FILE, "（不要把这个文件发给别人）")
    return key


API_KEY = ""


def upstream(path, params):
    body = json.dumps({"params": params, "comm": {"skill_version": SKILL_VERSION}}).encode("utf-8")
    req = urllib.request.Request(
        UPSTREAM + path,
        data=body,
        method="POST",
        headers={"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"msg": "QQ 音乐接口返回 HTTP %d" % e.code}
    except Exception as e:  # 网络问题
        return 502, {"msg": "连不上 QQ 音乐接口：%s" % e}


SONG_KEYS = ("songMid", "songmid", "mid", "song_mid")


def pick(d, *keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return None


def find_songs(obj, depth=0):
    """在返回数据里找「一串歌曲」：文档写的是 songs / songlist，但实际可能包了一层，所以递归找。"""
    if depth > 5:
        return []
    if isinstance(obj, list) and obj and all(isinstance(x, dict) for x in obj[:3]):
        if any(pick(x, *SONG_KEYS) for x in obj[:3]):
            return obj
        # 有的接口每项是 {"songInfo": {...}}
        inner = [next((v for v in x.values() if isinstance(v, dict) and pick(v, *SONG_KEYS)), None) for x in obj]
        if inner and all(inner[:3]):
            return inner
    if isinstance(obj, dict):
        for k in ("songs", "songlist", "songList", "list", "data", "items"):
            if k in obj:
                r = find_songs(obj[k], depth + 1)
                if r:
                    return r
        for v in obj.values():
            if isinstance(v, (dict, list)):
                r = find_songs(v, depth + 1)
                if r:
                    return r
    return []


def deep_get(obj, key, depth=0):
    if depth > 4 or not isinstance(obj, dict):
        return None
    if key in obj:
        return obj[key]
    for v in obj.values():
        r = deep_get(v, key, depth + 1)
        if r is not None:
            return r
    return None


def shape(obj, depth=0):
    """数据的「形状」：字段名 + 类型 + 列表长度，不带任何内容，方便排查。"""
    if depth > 3:
        return "…"
    if isinstance(obj, dict):
        return {k: shape(v, depth + 1) for k, v in list(obj.items())[:20]}
    if isinstance(obj, list):
        return ["list[%d]" % len(obj)] + ([shape(obj[0], depth + 1)] if obj else [])
    if isinstance(obj, (int, float)) and not isinstance(obj, bool):
        return obj if obj in (0, 1, -1) else "number"
    return type(obj).__name__


class Handler(BaseHTTPRequestHandler):
    server_version = "TWSRelay/1.0"

    def log_message(self, fmt, *args):
        pass  # 不在窗口里刷日志，也不记录搜了什么

    def origin(self):
        o = self.headers.get("Origin", "")
        return o if o in ALLOWED_ORIGINS else ""

    def send_json(self, status, data, origin=""):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        if origin:
            self.cors(origin)
        self.end_headers()
        self.wfile.write(raw)

    def cors(self, origin):
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-TWS-Token")
        self.send_header("Access-Control-Allow-Private-Network", "true")  # Chrome 访问本机需要
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Vary", "Origin")

    def do_OPTIONS(self):
        o = self.origin()
        self.send_response(204 if o else 403)
        if o:
            self.cors(o)
        self.end_headers()

    def do_GET(self):
        if self.path == "/":
            raw = "TWS QQ Music relay is running.".encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            o = self.origin()
            if o:
                self.cors(o)
            self.end_headers()
            self.wfile.write(raw)
        else:
            self.send_json(404, {"ok": False, "msg": "not found"})

    def do_POST(self):
        o = self.origin()
        if not o:
            return self.send_json(403, {"ok": False, "msg": "来源网站不在允许列表里"})
        path = self.path.split("?")[0]
        if path not in ALLOWED_PATHS:
            return self.send_json(404, {"ok": False, "msg": "不支持的接口"}, o)
        params = {}
        try:
            n = min(int(self.headers.get("Content-Length") or 0), 10000)
            body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            if isinstance(body, dict) and isinstance(body.get("params"), dict):
                params = body["params"]
        except Exception:
            pass
        if path == "/discover/search":
            kw = str(params.get("keyword", "")).strip()[:60]
            if not kw:
                return self.send_json(400, {"ok": False, "msg": "关键词为空"}, o)
            try:
                page = max(0, min(20, int(params.get("page", 0))))
            except Exception:
                page = 0
            params = {"keyword": kw, "type": "0", "page": page}
        else:
            params = {}

        status, data = upstream(path, params)
        if status >= 400 or data.get("ret") not in (None, 0) or data.get("sub_ret") not in (None, 0):
            msg = data.get("msg") or "QQ 音乐接口报错"
            if status in (401, 403):
                msg += "（API Key 可能失效了：删掉 qqmusic-key.txt 重新运行，填新的 Key）"
            return self.send_json(502 if status < 400 else status, {"ok": False, "msg": msg}, o)
        found = find_songs(data)
        songs = []
        for s in found[:50]:
            mid = str(pick(s, "songMid", "songmid", "mid", "song_mid") or "")
            name = str(pick(s, "songName", "songname", "name", "title", "song_name") or "")
            singer = pick(s, "singerName", "singername", "singer", "artist")
            if isinstance(singer, list):
                singer = " / ".join(str(x.get("name") if isinstance(x, dict) else x) for x in singer)
            elif isinstance(singer, dict):
                singer = singer.get("name", "")
            url = str(pick(s, "songH5Url", "h5Url", "url") or "")
            if mid and name:
                songs.append({"mid": mid, "name": name, "singer": str(singer or ""),
                              "url": url or "https://i2.y.qq.com/a/song/" + mid})
        out = {"ok": True, "songs": songs, "hasMore": bool(deep_get(data, "hasMore"))}
        if not songs:
            out["debug"] = shape(data)  # 只有字段名和类型，不含内容
            if isinstance(data.get("msg"), str) and data["msg"]:
                out["msg"] = data["msg"][:120]
        self.send_json(200, out, o)



def main():
    global API_KEY
    API_KEY = load_key()
    try:
        srv = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        if sys.stdin is None or sys.stdout is None:
            sys.exit(0)  # 后台模式：已经有一个在运行，安静退出
        print("端口 %d 被占用了：中转可能已经在后台运行（可以直接用）。" % PORT)
        input("按回车退出…")
        sys.exit(1)
    print()
    print("  QQ 音乐中转已启动  →  http://%s:%d" % (HOST, PORT))
    print("  在写作工作台音乐面板 → QQ 音乐 → 连接设置 里填这个地址。")
    print("  用的时候保持这个窗口开着；关掉窗口就停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
