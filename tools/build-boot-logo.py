"""
把 logo/to-mark.svg（完整版标记）转成开屏动画用的内联 SVG，写进 boot-ink.js。

转换时把写死的颜色换成主题变量，所以开屏里的标记会跟着主题走：
  浓墨 #1E1B1A → var(--fg)    淡墨 #5B5650 → var(--bi-dan)（深色模式提亮一档，见 boot-ink.css）
  堇紫 #6F63E6 → var(--ac)    宣纸 #EEEAE1 → var(--bg)
灵光模式下 --ac 变金，笔尖和墨心也跟着变金；深色模式下羽毛自动变成宣纸色。
滤镜和遮罩的 id 加上 bi 前缀，避免和页面里其他 SVG 撞名。

用法（仓库根目录）：python tools/build-boot-logo.py
改了 logo/to-mark.svg 之后重新跑一次即可。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "logo" / "to-mark.svg"
DST = ROOT / "boot-ink.js"
VIEWBOX = "54 8 136 234"  # 裁到实际有墨的范围（含滤镜晕开的部分），四周留一点余量

COLORS = {
    "#1E1B1A": "var(--fg,#1E1B1A)",
    "#5B5650": "var(--bi-dan,#5B5650)",
    "#6F63E6": "var(--ac,#6F63E6)",
    "#EEEAE1": "var(--bg,#EEEAE1)",
}


def themed(tag: str) -> str:
    """把一个标签里的 fill / stroke 颜色属性换成 style 里的主题变量。"""
    props = []

    def take(m):
        name, val = m.group(1), m.group(2).upper()
        if val in COLORS:
            props.append(f"{name}:{COLORS[val]}")
            return ""
        return m.group(0)

    tag = re.sub(r'\s(fill|stroke)="(#[0-9A-Fa-f]{6})"', take, tag)
    if props:
        end = "/>" if tag.endswith("/>") else ">"
        tag = tag[: -len(end)].rstrip() + f' style="{";".join(props)}"' + end
    return tag


def main():
    svg = SRC.read_text(encoding="utf-8")
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    body = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
    body = re.sub(r'id="b-', 'id="bi-', body)
    body = body.replace("url(#b-", "url(#bi-")
    body = re.sub(r"<[a-zA-Z][^<>]*>", lambda m: themed(m.group(0)), body)
    body = re.sub(r"></(path|circle|rect|feTurbulence|feColorMatrix|feComposite|feDisplacementMap|feGaussianBlur|feMorphology|stop)>", "/>", body)
    body = re.sub(r"\s*\n\s*", "", body)
    assert "#1E1B1A" not in body.upper().replace("VAR(--FG,#1E1B1A)", ""), "还有没换掉的浓墨色"
    out = (f'<svg class="bi-logo" viewBox="{VIEWBOX}" aria-hidden="true">{body}</svg>')
    out = out.replace("\\", "\\\\").replace("'", "\\'")

    js = DST.read_text(encoding="utf-8")
    new, n = re.subn(r"^var LOGO='.*?';$",
                     lambda _: f"var LOGO='{out}';", js, count=1, flags=re.M)
    assert n == 1, "boot-ink.js 里没找到 var LOGO=…; 这一行"
    DST.write_text(new, encoding="utf-8")
    print(f"已更新 boot-ink.js 的开屏标记（{len(out)} 字符）")


if __name__ == "__main__":
    main()
