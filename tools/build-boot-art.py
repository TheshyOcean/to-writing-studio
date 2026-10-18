"""把 bg/ 里的背景图纸内置进开屏脚本（boot-art-desktop.js / boot-art-mobile.js）。

开屏要逐笔描出背景图纸，需要拿到 SVG 的每一条线。直接 fetch bg/*.svg
在双击打开本地文件（file://）时会被浏览器拦下，所以改为把图纸写进 JS。
修改了 bg/tws-*.svg 之后，在项目根目录运行：  python tools/build-boot-art.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(name):
    s = open(os.path.join(ROOT, 'bg', name), encoding='utf8').read()
    s = re.sub(r'>\s+<', '><', s.strip())
    return s

for shell, prefix in (('desktop', 'tws-'), ('mobile', 'tws-m-')):
    art = {'light': load(prefix + 'light.svg'), 'dark': load(prefix + 'dark.svg')}
    out = ('/* 自动生成：python tools/build-boot-art.py —— 不要手改，改 bg/%s*.svg 后重新生成 */\n'
           'window.TWS_BOOT_ART=%s;\n') % (prefix, json.dumps(art, ensure_ascii=False).replace('</', '<\\/'))
    open(os.path.join(ROOT, 'boot-art-%s.js' % shell), 'w', encoding='utf8', newline='\n').write(out)
    print('boot-art-%s.js' % shell, len(out.encode('utf8')), 'bytes')
