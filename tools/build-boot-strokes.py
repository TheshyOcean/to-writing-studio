"""把开屏标题「让故事，在此发生。」的笔顺数据内置成 boot-strokes.js。

数据来自 Hanzi Writer 的 hanzi-writer-data（源自 Make Me a Hanzi，Arphic Public License，
许可证见根目录 ARPHICPL-strokes.txt）。原始 JSON 放在 tools/hanzi-strokes/。
开屏只借用它的「行笔中线」决定每一笔在哪、往哪走、先写哪笔；屏幕上的字形仍是霞鹜文楷。

换标题文字时：把新字的 JSON（npm pack hanzi-writer-data 解压可得）放进 tools/hanzi-strokes/，
改下面的 CHARS，在项目根目录运行：  python tools/build-boot-strokes.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'hanzi-strokes')
CHARS = '让故事在此发生'
NUM = re.compile(r'-?\d+(?:\.\d+)?')

data = {}
for c in CHARS:
    d = json.load(open(os.path.join(SRC, c + '.json'), encoding='utf8'))
    xs, ys = [], []
    for s in d['strokes']:
        n = list(map(float, NUM.findall(s)))
        xs += n[0::2]; ys += [900 - v for v in n[1::2]]
    data[c] = {
        'm': [[[round(p[0]), round(900 - p[1])] for p in m] for m in d['medians']],  # 行笔中线
        'b': [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))],  # 整字外框（由笔画轮廓算出）
    }

out = ('/* 自动生成：python tools/build-boot-strokes.py —— 不要手改\n'
       '   开屏标题的笔顺数据（Hanzi Writer / Make Me a Hanzi，Arphic Public License，见 ARPHICPL-strokes.txt）\n'
       '   坐标系：1024×1024，y 朝下。m = 每一笔的行笔中线（按笔顺），b = 整字外框 */\n'
       'window.TWS_BOOT_STROKES=%s;\n') % json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(ROOT, 'boot-strokes.js'), 'w', encoding='utf8', newline='\n').write(out)
print('boot-strokes.js', len(out.encode('utf8')), 'bytes')
