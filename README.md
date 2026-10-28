# To Writing Studio 写作工作台 · Beta V3.3.0

> **English** · An AI-powered novel-writing workbench that helps people who have never used AI write a whole book with it.
> Purely static — no Node, no server, no build step. Open `index.html` (or the [live demo](https://theshyocean.github.io/to-writing-studio/)) and start writing.
> Bring your own API key (e.g. DeepSeek); it stays in your browser's localStorage and is never uploaded.
>
> **Features:** projects → volumes → chapters · AI chat per chapter with "adopt into chapter" · character / world-setting library · relationship & plot graphs · foreshadowing and timeline tracking · consistency checks · version history · export to .docx / .txt · daily word goals.
>
> This is my first project — feedback, issues and pull requests are very welcome! The UI is currently in Chinese.

**纯静态版本** —— 不需要 Node、不需要服务器。双击 `index.html` 就能用。

> 与 `beta2.0.04` 的区别：移除账号系统与协作室（入口保留，点击提示"暂未上线"），
> 新增八项写作功能。数据全部存在浏览器本地（localStorage）。

---

## 版本

> 目前所有版本都是 **Beta（测试版）**，还没有正式发版；以前标过的 V / Preview 版本号也一律算作 Beta。

**Beta V3.3.0 · 2026-10-29**（电脑版 + 手机版）：换字体。① 中文从思源宋体换成**霞鹜文楷**：原来连按钮、导航、输入框都是宋体，看起来像打开了一份 Word 文档；楷书带手写笔意，读长篇也舒服。② 英文和数字继续用 EB Garamond，拉丁小字（Colloquium、Codex 等）保留 Cormorant 斜体；西文字体只负责拉丁字母、数字和半角标点，中文引号、破折号、省略号固定由文楷来出。③ 加粗用文楷自带的 Medium 字重，不再是浏览器假粗体。④ 中文去掉额外字距；落款「写作工作台」不再折行；数字改为等高数字（0 不再像字母 O）。⑤ 不再加载思源宋体（约 4 MB），文楷按需分片加载。改动文件：`studio.css`、新增 `fonts/lxgw-wenkai/`、`fonts/OFL-LXGWWenKai.txt`；`studio.js`、`desktop.html`、`mobile.html`（版本号）。

**Beta V3.2.0 · 2026-10-21**（电脑版）：① 「命运骰子」改为**命运塔罗 Arcana**：洗牌（两次交叉洗牌）→ 七张牌展开成扇形 → 凭直觉选一张 → 翻牌（约三成概率逆位）→ 牌意与剧情方向逐字浮现；配了 API Key 时再结合本书的人物、未回收伏笔和最近正文写一段专属解读。牌意只当写作提示，写进下一段时会要求 AI 不出现塔罗本身。22 张大阿卡纳均为原创线描牌面，图鉴记录抽到过的牌。② 顶栏按钮悬停：塔罗按钮小牌翻转、「命运塔罗」化作 *Arcana*；「入戏」面具摇摆、化作 *Persona*。③ 修正：顶栏按钮与弹窗主按钮的底色被通用按钮规则清掉，导致昼读 / 夜读下文字看不见。改动文件：`js/tws-fun.js`、`js/tws-fun.css`、`desktop.html`（引用版本号）。

**Beta V3.1.0 · 2026-10-21**（电脑版）：入戏模式改为「旁白 / 角色 / 你」三方分离。① 你对谁说话，谁就用自己的独立对话回你：每个角色有自己的记忆，只知道自己在场时看到、听到的事；点下方「在场」头像或用 @名字 选择对象。② 角色的动作由模型单独输出，显示成居中的灰色提示条（像 QQ 群提示），台词放在气泡里。③ 旁白单独一层，只在你需要时推进：「✦ AI 写旁白」「✎ 我来写旁白」（可直接用，或只写一句方向让 AI 扩写），另有「自动旁白」开关（默认关）。旁白写到有人进场 / 离场，「在场」名单自动更新。④ 输入框新增（）按钮，方便写自己的动作；「戏外」改为独立按钮，戏外的话不进书稿、角色也听不见。⑤ 提纯：对白一字不改保留原话，动作改为叙述，旁白润色成第三人称。⑥ 旁白落笔时发送不再吞掉输入。
改动文件：`js/tws-persona.js`（重写）、`js/tws-fun.css`、`studio.js`、`desktop.html`。

**Beta V3.0.0 · 2026-10-21**（电脑版）：① **故事大脑**：AI 每写完一段、或保存章节后，一次分析同时更新人物、简称别名、关系图、伏笔（含回收）和时间线；低风险直接写入并可撤销，拿不准的称呼只问一次；系统配置里可选全自动 / 半自动 / 每条都问 / 关闭。② **入戏模式**（顶栏「🎭 入戏」）：选一个角色进入自己的小说，AI 负责旁白和其他人物；支持选项 / 自由行动、括号戏外、存档读档、掷骰判定。③ **提纯**：入戏结束后逐条判断留 / 丢并写明理由，改写成第三人称正文，戏中即兴的设定标为待确认；由你选择进本章草稿、存为备用素材或只更新设定——入戏内容不会直接进书稿。④ **读者弹幕**：写完一段，虚拟读者发弹幕、追更数上涨（右侧「读者」卡可关）。⑤ **命运骰子**（顶栏「🎲」）：通用卡 + 本书专属卡，分普通 / 稀有 / 金卡，抽到写进下一段。⑥ **角色访谈**：点右侧出场人物，用角色口吻对话，好回答可写进人设。⑦ 界面改为暖纸色 + 朱砂点缀 + 纸纹，紫色只做强调。⑧ 关系图认简称（茜香 = 黑见茜香）、重复角色卡可一键合并；伏笔回收可被自动识别。
改动文件：新增 `js/tws-brain.js`、`js/tws-fun.js`、`js/tws-persona.js`、`js/tws-fun.css`；`studio.js`、`studio.css`、`js/tws-define.js`、`js/tws-views.js`、`js/tws-features.js`、`desktop.html`。

**Beta V2.6.x / V2.5.3–2.5.4 · 2026-10-21**：故事大脑与伏笔回收、关系图简称识别的测试迭代（已并入 Beta V3.0.0）。

**Beta V2.5.2 · 2026-10-20**：新增「智能定义」（电脑版），设定库的升级版，放在左栏导航第一位，原来的「设定库」入口并进来（设定库页面仍在，从「世界设定」或右侧「出场人物」进入）。
① 角色：人物卡配形象图，写身份 / 性格 / 外貌 / 人设；这些就是设定库里的人物卡片，勾选「带进对话」照旧写进 AI 提示。「AI 补全人设」用当前模型。形象图可上传，也可接自己的图片模型（兼容 OpenAI `/images/generations`，在编辑框里的「图片模型设置」填，Key 只存在本机）；图片存在 IndexedDB，不占 localStorage。
② 关系图：用几句话描述人物关系，AI 画成关系图；没配 API Key 时按规则识别。
③ 情节图：一句梗概 + 选一种结构（三幕式 / 英雄之旅 / 起承转合 / 五幕金字塔 / 悬疑倒叙），AI 按结构写出每一段，可直接点进去改。
④ 预告：用情节图和角色卡剪一段可播放的预告短片（片头、每段一个镜头、片尾，可开旁白朗读）；每个镜头附画面提示词，以后可交给视频模型生成真实片段。
⑤ 故事模板（内置结构，可搜索；联网搜索待接搜索服务）、世界设定（地点 / 名词 / 关系卡片一览）。
改动文件：新增 `js/tws-define.js`、`js/tws-define.css`；`desktop.html`（引用、版本号）、`studio.js`（版本号）。数据：人物仍在 `tws_data_v1.cards`，关系描述 / 情节 / 片名在 `tws_define_v1`，形象图在 IndexedDB `tws_define`。

**Beta V2.5.1 · 2026-10-20**：① 自动识别（电脑版）：AI 每写完一段，会自动找出新人物 / 地点 / 名词、时间线事件和可能的伏笔，在那条回复下面列出来，勾选后一键写入设定库 / 时间线 / 伏笔；已记录过的不会重复，不确认就什么都不写。识别请求很短（DeepSeek 用 `deepseek-flash` 且不开思考），可在「系统配置」关闭。② 书稿 / 伏笔页的「从本章提取」现在也会提取人物与设定。③ 左栏移除「对话档案」入口，历史记录从纸面右上角的图标打开。

**Beta V2.5.0 · 2026-10-20**：电脑版大翻新「书斋 · 堇紫 × 鎏金」（手机版暂保持 V2.3 外观，之后单独适配）。
① 视觉：去掉终末地式的黄绿信号色、切角、等宽 HUD、扫描线、液态玻璃与工程图纸；改为月白纸面 + 堇紫点缀，正文浮在一张大圆角“纸”上。字体全部换成古典衬线并自托管（思源宋体 + EB Garamond + Cormorant Garamond，`fonts/`，SIL OFL），国内也能稳定加载。
② 布局：左栏从上到下是「正在写」作品卡、新建对话、导航（中文 + 拉丁名）、昼夜切换与模型标识、落款；中间是手稿纸面，页眉显示作品与章节；右侧新增页边栏：今日落笔、上下文用量、本书伏笔、出场人物。
③ 温度胶囊：五档配拉丁名与罗马数字，液体里逐字显影中西神话史诗名句，放不下时缓缓滚出后半句；拉满提示“创新性大幅提升”。
④ 灵光模式（温度面板右上角的灯泡）：整页由紫渐变为金（夜读为暗金）；请求改用深度思考（DeepSeek：`deepseek-v4-pro` + `thinking`），单次输出上限放宽到 32768，并带上全部设定、未回收伏笔与当前章 / 上一章正文。会明显多用 Token。日常模式下 DeepSeek 新模型改为关闭思考，更快、更省，温度也会生效。
⑤ 夜读配色四套：墨夜（默认）/ 青金 / 烛照 / 堇夜，在「系统配置」切换。
⑥ 开屏改为「墨字显影」：To 标识浮现，标题逐字由墨晕凝成字，落一句 *Incipit fabula*，对话为空时标题直接飞进卷首。
⑦ DeepSeek 预设模型更新为 `deepseek-flash` / `deepseek-v4-pro`（旧名保留在列表里）；新用户默认 `deepseek-flash`。
改动文件：新增 `studio.css`、`studio.js`、`boot-ink.css`、`boot-ink.js`、`fonts/studio-fonts.css` 与字体子集；`desktop.html`（引用、灵光钩子、文案、版本号）、`index.html`（入口页外观）。电脑版不再加载 `lq-glass.js`、`boot-draw.*`、`boot-art-desktop.js`（手机版仍在用，未删除）。

**Beta V2.3.0 · 2026-10-18**：开屏改为「图纸显影」——背景图纸《书写机械与版式考》在原位一笔笔描出，标注随后浮现，「让故事，在此发生。」逐字落下；揭幕时黄绿扫线掠过、纸面退去，线条留在原地，主界面直接出现在同一张图纸上，对话为空时标题会落到工作台里同一句话的位置。删除旧的百分比加载动画（以及 0.1 秒自动跳过开屏的逻辑）。首次约 3 秒，之后约 2 秒；点任意处 / Esc 可跳过；系统“减少动效”时直接进入。深浅主题、电脑 / 手机均适配，双击本地文件也能正常播放。
改动文件：新增 `boot-draw.js`、`boot-draw.css`、`boot-art-desktop.js`、`boot-art-mobile.js`、`tools/build-boot-art.py`（改了 `bg/tws-*.svg` 后运行它重新生成开屏图纸）；`desktop.html` / `mobile.html`（开屏结构与逻辑、版本号）、`terminal-redesign.css` / `terminal-redesign.js`（去掉旧开屏样式与自动跳过、版本号）。

**Beta V2.2.0 · 2026-10-18**：① 界面统一成“终末地 × 液态玻璃”：所有功能按钮都是圆润的玻璃胶囊（主操作是黄绿色液体胶囊），对话气泡、输入框、抽屉、弹窗都是圆角玻璃，和 Hush 同一套规格。② 背景是原创平面设计图纸《书写机械与版式考》：线装书叶版式（版框 / 界栏 / 鱼尾 / 天头地脚 / 四眼订线）、永字八法、对开页比例、打字机结构图，桌面横版 / 手机竖版各一张。③ 过渡动画：切换页面像翻过一页纸，章节编号和标题依次浮现，新消息从气泡底角“长”出来，按钮有液面高光和弹性按压，侧栏选中块用弹簧曲线滑动，面板弹簧滑入。④ 手机端单独设计：悬浮玻璃顶栏、黄绿章节小签 + 大标题、贴底玻璃输入 Dock、指令芯片横向滑动、功能菜单改成分组列表。⑤ 系统配置页新增“外观 · 液态玻璃”：通透 / 标准 / 磨砂预设 + 透明度、背景模糊滑杆，实时预览，只存在本机浏览器。⑥ 修正：系统配置页左上角编号由 02 改为 07。
改动文件：`terminal-redesign.css`（末尾样式）、`desktop.html` / `mobile.html`（引用新样式与 `lq-glass.js`、编号 07）、新增 `lq-glass.js`、`bg/`。旧的 `bg/blueprint-*.svg` 已不再使用，可以删除。

**Beta V2.0.11** · 2026-10-17

## 怎么打开

**双击 `index.html`**，浏览器按设备自动进入电脑版或手机版。

- 也可以直接用 `desktop.html` / `mobile.html`
- 首次打开会引导你建一部作品

> ⚠️ 数据存在**浏览器本地**。换浏览器、换电脑、清理浏览器数据都会丢失。
> 请定期用「导出」把书稿存成 .docx 或 .txt。

---

## 八项功能在哪

| 功能 | 位置 |
|---|---|
| 项目 → 卷 → 章 | 左侧导航「书稿」 |
| 正文编辑 + 字数统计 | 「书稿」右区 |
| 智能定义（角色 / 关系图 / 情节图 / 预告） | 左侧导航第一项「智能定义」 |
| 设定库（人物/地点/名词/关系） | 「智能定义」→「世界设定」→「在设定库里管理」 |
| 伏笔与时间线 | 左侧导航「伏笔」 |
| 开写模板 | 对话视图输入框上方的「模板」按钮 |
| 一致性检查 | 「书稿」的「检查」按钮 / 标记定稿时自动提示 |
| 版本历史 | 「书稿」的「历史」按钮（支持对比与回滚） |
| 导出 .docx / .txt | 「书稿」右上「导出」（右键 = 直接导 .txt） |
| 写作进度与目标 | 「书稿」右上「今日 N / 2000 字」点开 |

---

## 关键设计

### 一章一对话

每章对应一个写作会话。AI 写出来的内容，要在对话里点 **「采纳到本章」** 才会进入正文 ——
不自动写入，避免闲聊和重试污染正文。

### 数据在 localStorage

键名 `tws_data_v1`：

```
projects[] → volumes[] → chapters[]   章节含 content 正文与 words 字数
cards[]      设定卡片（人物/地点/名词/关系）
threads[]    伏笔
events[]     时间线事件
versions{}   每章版本快照（每章最多 20 版）
stats{}      每日字数
goal         每日目标
```

**容量**：localStorage 上限约 5MB。版本快照存全文，接近上限时程序会自动清理最旧的
AI 快照（手动与定稿版本优先保留）。

### 字数口径

中文按字符、英文按单词，去掉空白。**只在保存正文时计算**，避免多端算法不一致。

---

## 文件说明

```
index.html                入口：设备识别 → 跳 desktop / mobile
desktop.html              电脑版界面（约 4300 行，含原有对话与配置）
mobile.html               手机版界面（约 4600 行）
terminal-redesign.css/js  视觉层：品牌、图标系统、响应式覆盖
js/tws.css                新视图样式（复用现有设计令牌）
js/tws-data.js            数据层：项目/章节/卡片/伏笔/版本/统计/导出文本
js/tws-features.js        开写模板 + 真 .docx 生成 + 一致性检查
js/tws-views.js           书稿 / 设定库 / 伏笔三视图 + 采纳按钮 + 导航
fonts/                    自托管字体分包子集（霞鹜文楷 + EB Garamond / Cormorant；旧的思源宋体子集仅供 index.html）
```

**没有构建步骤**：改文件即生效。脚本用 `<script>` 顺序加载，挂在 `window.TWS` 命名空间下。

---

## 改代码注意事项

### 视觉改动优先写在 CSS 层

`terminal-redesign.css` 和 `js/tws.css` 都在 HTML 内联样式之后加载，靠覆盖生效。
直接改 HTML 内联样式会被盖掉。

### 图标系统

`.ico[data-ico="xxx"]` 由 `terminal-redesign.js` 注入 SVG，颜色由 `--c` 驱动
（双色瓷片：同色相淡底 + 描边 + 本色字形）。调色板 `--i1` ~ `--i9`。

注意 `data-ico` 打在 **`.ico` 自身**，不是父级 `.row`。

### API Key

对话与一致性检查需要用户自己的 API Key，存在 localStorage（`liangye_endfield_v2`
里的 `apiKey`），**不会上传到任何地方**。

未配置 Key 时：项目、正文、设定库、伏笔、导出全部可用；AI 续写与语义检查降级。

### 验证界面

系统 Edge 在浏览器开着时会把无头命令**转发到已有会话**，截图会静默失败。用 Playwright 绕过：

```js
chromium.launch({ channel: 'msedge' })   // 独立调试端口，不会被转发
```

---

## 已知限制

- 协作室入口保留但未实现（点击提示"暂未上线敬请期待"）
- 正文用 `textarea`，不支持富文本
- 一致性检查的语义部分需要 API Key；无 Key 时只跑本地规则（名字、章节顺序）
- 数据不跨设备同步（纯本地）
- 移动端技能标签条的右缘渐隐未实现

* * *

## 欢迎指点 · Feedback welcome

这是我的第一个项目，还有很多不成熟的地方。不管是代码写法、界面设计，还是功能上的想法，都非常欢迎来 [Issues](https://github.com/TheshyOcean/to-writing-studio/issues) 留言指点，也欢迎直接提 Pull Request 🙏

## 许可证 · License

[MIT](LICENSE)。`fonts/` 中的字体另行遵循 SIL Open Font License 1.1。
