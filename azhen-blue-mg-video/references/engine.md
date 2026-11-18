# 引擎接口（template/index.html）

一个页面就是整支片，渲染时按时刻逐帧调用 `seek(t)`。这是纯函数：不读时钟，也不用随机数（需要随机时用 `AK.rand(i)`）。
- `cues.js`：由 build_cues.py 生成，包含场景起止、口播标记和字幕。
- `mouth.js`：由 make_mouth.py 生成，是头像的口型数据。
- `core.js`：动效库底层 `AK`，提供色板 `AK.C`、图标 `AK.icon` / `AK.iconTile`、颜色混合 `AK.mix`。

## 文件结构
- **引擎（不用改）**：缓动、绘图工具、主题、标题、镜头、转场、背景、字幕、头像、运动模糊、加载。
- **本片专属（新片重写）**：页面里两行 `════════` 注释之间的部分，包括主线交接坐标、`SCENES`、`TRANS`。
- `IMGS` 里换成本片的插图路径。

## 画幅（竖版 / 横版）
- 页面读 `?layout=h` 决定画幅，引擎里的常量都从 `LY` 取：
  - `LY.box`：内容框（竖版 x110 y520 860×810；横版 x800 y150 1000×700）；
  - `LY.tx / LY.ty / LY.ts / LY.lh`：标题位置、字号、行距；`LY.ey`：眉标的 y；
  - `LY.cam`：镜头中心（竖版 540, 900；横版 960, 540）；`LY.cap`、`LY.av`：字幕和头像。
- 要横竖两用的片，本片专属段开头写 `const BX = LY.box, bx = BX.x, by = BX.y, bw = BX.w, bh = BX.h, BR = bx + bw; const CX = LY.cam[0], CY = LY.cam[1];`，所有坐标从这几个量算，不写死 110、540、900。
  - 镜头静止位写 `[t, 1, CX, CY]`；
  - 两种画幅差别大的地方用 `HZ ? a : b`，比如横版把文字放到圆环右边、竖版放下面；
  - 交接常量里有镜头倍率时，用 `toScreen(x, y, 倍率, 看向x, 看向y)` 换成屏幕坐标，它和 `cam` 用同一套夹取。
- `TT(c, "比如{奶茶店}|海报", lt, t0, th, {out, bump})`：标题。竖版去掉 `|` 写一行，横版在 `|` 处断成两行，放左栏。不传 `out` 时在本屏结尾自动逐字落下；升起时刻会自动提前 0.3 秒，在转场中就开始。`eyebrow` 也提前 0.25 秒。
- `drawRail(t)`（可选，本片专属段里定义）：横版左栏的分点进度条，引擎每帧在字幕前调用；竖版直接 `return`。
- 镜头幅度按画幅缩小：`LY.zoom` / `LY.follow` 竖版 0.8 / 0.7、横版 0.4 / 0.2（`camS`、`camFocus`），场景里的倍率按竖版手感写；横版看向点再夹在 `LY.keep` 范围里，竖版只夹左边，保证标题离左边至少 60px。

## 场景函数
```js
SCENES.<key> = function (c, S, lt, th) { ... }
```
- `key` 和 script.json 的 key 一一对应，顺序也一样。
- `lt` 是场景内的本地时间。场景推入前就开始画（lt 最早到 −0.45），所以开场动画的时刻可以设成负数。
- `at(S, "mark")`：取口播标记的本地时刻；`dur(S)`：场景时长。
- `th` 是主题：
  - `th.fg` 正文色、`th.sub` 次要文字、`th.card` 卡片底、`th.line` 发丝线、`th.hi` 强调蓝、`th.track` 轨道灰；
  - `th.d.<色>` 是适合放在当前底色上的文字色；`th.light` 表示是否浅色屏。
- `S._pout > 0` 表示这一屏正在退场。主线物体这时交给下一屏画，本屏不要再画。

## 放真实 GIF
- 文章里的 GIF 先拆成帧图：`"$PY" tools/gif2sprite.py <GIF 目录> assets/gif 360`，得到 `<名>.sprite.png`（8 列网格）和 `assets/gif/gifs.js`。

## 通用组件（引擎区，各片直接用）
| 函数 | 作用 |
| --- | --- |
| `fade(lt, t0, d)` | 从 t0 起 d 秒内 0→1 |
| `withA(c, a, fn)` | 带透明度画一组东西 |
| `pillW(c, 文本, 字号, 有无图标)` | 标签宽度 |
| `flow(c, 文本数组, x, y, 最大宽, 字号)` | 一串标签自动换行排开，返回每个的位置 |
| `dashLine(c, x1, y1, x2, y2, 颜色, 进度)` | 虚线引线，按进度画出来 |
| `ripple(c, lt, t0, x, y, w, h, 圆角, 颜色)` | 外扩一圈的提示环（强调某张卡、某个区域） |


## 常用工具
| 函数 | 作用 |
| --- | --- |
| `cam(c, lt, [[t, 倍率, 看向x, 看向y], ...], bump)` | 镜头。关键帧之间大部分时间静止，只在每个关键帧前 0.6 秒（`CAM_MOVE`）内缓入缓出地移到位；没有手持漂移，bump 不生效。传空数组就是这一屏不动。先 `c.save()`、再调 `cam`、画完 `c.restore()` |
| `ktitle(c, 文本, x, y, 字号, lt, t0, th, {out, bump})` | 逐字遮罩升起的标题，强调字写在 `{}` 里。`out` 是逐字落下的时刻，`bump` 是强调字弹一下的时刻。文楷版自动换字体 |
| `eyebrow(c, 文本, 290, lt, t0, th)` | 标题上方的眉标（文楷版显示成蓝色小标签） |
| `box(c, x, y, w, h, th, {r, fill})` | 白卡加发丝线；高亮时传 `fill` 填充色，不要描边 |
| `pill(c, 文本, x, y, th, tone, {size, icon, solid})` | 填充式标签，返回宽度；y 是中线 |
| `tile(c, 图标名, x, y, 边长, 颜色)` / `yuanTile(...)` | 实心图标块配白图标；图标名见 `AK.ICON_NAMES` |
| `pic(c, IMG.xx, lt, S, y, {x, w, d, cut: true})` | 插图（透明底要加 `cut: true`），`d` 是入场延迟 |
| `pop(c, lt, t0, cx, cy, fn, k0)` / `rise(c, p, dy, fn)` | 带过冲的弹出 / 淡入上移的包装 |
| `count(lt, t0, 终值, 时长)` | 数字计数（先快后慢） |
| `arrowR` / `arrowD` / `tick` / `coin` / `note` | 箭头、勾、金币、来源小字 |
| `tw(c, 文本, 字体)` | 量文字宽度。右对齐和排两个标签时用来算位置 |
| `F.head(字号)` / `F.sans(字号, 字重)` / `F.num(字号)` | 黑体标题 / MiSans 正文 / Fraunces 数字 |

## 变形交接（主线物体）
1. 给上一屏的主线物体定一个结束常量，用屏幕坐标，比如 `const FREE_END = { x, y, r }`。上一屏结尾镜头要回到 1 倍，屏幕坐标才等于世界坐标。
2. 上一屏：结尾时按这个常量把物体画在落位上；`S._pout > 0` 时不再画它。
3. 下一屏：用 `const m = eIO((lt + HALF) / 0.9)` 做进度，把物体从 `XXX_END` 插值到本屏的位置，形状、颜色、圆角一起变。
4. 要在镜头之外画（屏幕坐标）的东西，放在 `c.restore()` 之后画。
5. `TRANS` 里对应的下标一般设成 `"dive"`（上一屏轻推淡出，下一屏不动，交接最稳）；用 `push`、`shutter`、`iris` 这类转场时，交接物体会跟着下一屏一起动，也可以，但别连续用。

## 转场类型
- `dive`：主线交接（默认）。上一屏轻微放大到 1.05 倍、加模糊、淡出，下一屏不动；不再有整页冲击。
- `morph`：只淡出的旧版主线交接，太平，不再默认用。
- `dip`：淡到纸底，用在结尾三连页。
- 另外还有 `up`、`push`、`zoom`、`blur`、`wipe`，以及 `iris`（下一屏从内容中心一个圆里扩出来，圆边带蓝圈）和 `shutter`（下一屏像百叶窗一条条翻下来）。全片至少用 5 种、相邻不重复，最后一个用 dip。

## 深色换气屏
在 script.json 里给这一句设 `"alt": true`。这一屏的 `th` 自动换成深色，背景会整页推入。

## 字体版本和渲染参数
- `?font=kai` 是文楷版，`?mb=4&fps=50` 开运动模糊，`?scale=1.3333` 出 2K。
- render.py 对应的环境变量是 `FONT`、`MB`、`FPS`、`SCALE`、`LAYOUT`；`END` 表示只渲到某一秒，做样片时用。
- `LAYOUT=h`：出横版，抽帧放在 `qa/frames_h/`，`sheet.py` 也加 `LAYOUT=h` 拼横版联系表（4 张一行）。
- 预览：在工程目录起一个本地服务（`python3 -m http.server`），打开 `index.html` 拖进度条看。

## 依赖
- 系统 python3：playwright（要安装 Chrome），用来渲染。
- 另一个 Python 环境装 faster-whisper、jieba、numpy、soundfile、scipy、pillow，用来做时间轴、混音、口型和抽帧拼图。
- 还需要 ffmpeg 和 ffprobe。
