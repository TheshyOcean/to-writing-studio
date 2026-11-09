"""
从 logo/ 里的两份源文件生成全套图标：
  logo/to-mark.svg  完整版（铜版画羽毛 + 水墨 + 落墨），用于 512 / 192 / 180 的应用图标
  logo/to-icon.svg  简化版（实心羽毛 + 墨滴），用于 32 px 的标签页图标

用法（仓库根目录）：
  pip install playwright pillow && playwright install chromium
  python tools/build-logo.py

favicon.svg 是手写的（带深色模式），不由本脚本生成。
"""
import asyncio
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
PAPER = (238, 234, 225, 255)  # 宣纸 #EEEAE1
RENDER = 2048                 # 先放大渲染再缩小，细线才不会糊


async def render(svg_path: Path) -> Image.Image:
    """把 240x240 的 SVG 渲染成 RENDER 尺寸的透明 PNG，并裁到实际有墨的范围。"""
    svg = svg_path.read_text(encoding="utf-8")
    svg = svg.replace('width="240" height="240"', f'width="{RENDER}" height="{RENDER}"', 1)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": RENDER, "height": RENDER})
        await page.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
        await page.wait_for_timeout(300)
        shot = ROOT / ".logo-tmp.png"
        await page.screenshot(path=str(shot), omit_background=True,
                              clip={"x": 0, "y": 0, "width": RENDER, "height": RENDER})
        await browser.close()
    img = Image.open(shot).convert("RGBA")
    shot.unlink()
    box = img.getchannel("A").point(lambda a: 255 if a > 6 else 0).getbbox()
    return img.crop(box)


def compose(art: Image.Image, size: int, fill: float, radius: float = 0.0) -> Image.Image:
    """把裁好的图案按高度占比 fill 居中放到宣纸底上；radius>0 时做成圆角方块、四角透明。"""
    big = size * 4
    canvas = Image.new("RGBA", (big, big), PAPER)
    h = round(big * fill)
    w = round(art.width * h / art.height)
    if w > big * fill:  # 横向太宽时改按宽度缩放
        w = round(big * fill)
        h = round(art.height * w / art.width)
    piece = art.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(piece, ((big - w) // 2, (big - h) // 2))
    if radius:
        mask = Image.new("L", (big, big), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * radius), fill=255)
        canvas.putalpha(mask)
    return canvas.resize((size, size), Image.LANCZOS)


async def main():
    full = await render(ROOT / "logo" / "to-mark.svg")
    simple = await render(ROOT / "logo" / "to-icon.svg")
    # 应用图标：铺满宣纸底的方块（iOS / 安卓会自己裁圆角）。
    # 512 用于安装弹窗、启动画面，尺寸够大，用完整版；
    # 192 / 180 在手机桌面上只有约 60 px，完整版的细线会糊成一片浅灰，改用简化版。
    compose(full, 512, 0.80).save(ROOT / "icon-512.png", optimize=True)
    compose(simple, 192, 0.70).save(ROOT / "icon-192.png", optimize=True)
    compose(simple, 180, 0.70).convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)
    # 标签页 PNG 兜底：宣纸圆角小方块，深色、浅色标签栏上都看得清
    compose(simple, 32, 0.84, radius=0.22).save(ROOT / "favicon-32.png", optimize=True)
    print("已生成 icon-512.png、icon-192.png、apple-touch-icon.png、favicon-32.png")


if __name__ == "__main__":
    asyncio.run(main())
