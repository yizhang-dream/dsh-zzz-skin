# 新艾利都 · DSH 皮肤

《绝区零》主题的 DSH Web GUI 皮肤。深紫夜底 + 警示黄/信号红双强调，107 个语义令牌 + 77 个 static 色阶全量重映射，外加六招界面动效。

## 为什么在 DSH 上做

ZCode 桌面端没有主题接口，只能靠 CDP 注入。DSH 不一样——它有官方的 **skin-center v2 皮肤契约**，皮肤是纯资产目录，热加载、无需重启、fail-closed 校验。在这里把设计做到极致，再谈迁回。

## 安装

```bash
# 皮肤目录（lab-ts 上已部署）
scp -r skin.json skin.css patches.css preview ~/.dsh/skins/zzz-zenless/
```

然后两种激活方式：

**A. UI**：设置 → 皮肤中心 → 选「新艾利都」→ 应用

**B. API**（脚本化时用）：

```bash
curl -X POST 'http://127.0.0.1:3080/api/skin-center/v2/active' \
  -H 'Content-Type: application/json' \
  -b ~/.dsh/dsh-web.cookie \
  -d '{"active":"zzz-zenless"}'
```

注意请求体字段是 `active`，不是 `id`（写错会返回 `nothing-to-update`）。

改完 CSS 不需要重启，重开皮肤中心卡片或刷新页面即生效。

## 结构

```
skin.json      清单：id / 名称 / 强调色 / 预览图 / 入口文件
skin.css       L1 令牌层：107 alias + 77 static，浅深两档
patches.css    L3 补丁层：六招动效 + 结构改造 + 第三方插件着色
preview/       浅/深两档预览图（SVG）
```

## 两个令牌层，缺一不可

这是这次踩到的主要坑。

**alias 层（107 个）** 是语义令牌：`--dsw-alias-bg-base`、`--dsw-alias-label-primary`、`--dsw-alias-brand-primary`……宿主 UI 的主要配色都走这里。

**static 层（77 个）** 是原始色阶：`--dsw-static-amber-400`、`--dsw-static-blue-500`、`--dsw-static-neutral-bluish-900`……

第一版我只覆盖了 alias 层，结果底部用量条还是宿主的橙 + 蓝——因为那个插件直接吃 `static` 色阶。补上 77 个 static 之后才彻底统一。

**教训**：改之前先数清楚宿主定义了多少令牌，改完再数一遍对账。

## 作用域是强制的

skin-center 会把每一条选择器强制包进 `html[data-dsh-skin="zzz-zenless"]`。所以皮肤里写 `:root`、`body[...]`、`button` 都是安全的，不会污染别处。

验证方式（看服务端返回的转换结果）：

```bash
curl -s 'http://127.0.0.1:3080/api/skin-center/v2/skins/zzz-zenless/stylesheet' | head -5
# html[data-dsh-skin="zzz-zenless"] { ... }
```

CSS 白名单还禁掉了 `@import`、远程 URL、越界路径、内联 JS。这是好事——皮肤不可能偷偷加载外部资源。

## 六招动效

| # | 动作 | 时长 | 缓动 | 触发 |
|---|---|---|---|---|
| ① | CRT 开关机 | 560ms | `cubic-bezier(.3,.9,.3,1)` | 首屏进入 |
| ② | 错峰入场 | 420ms / 每格 +55ms | `cubic-bezier(.16,1.16,.3,1)` | 消息行出现 |
| ③ | 景别推近 | 300ms | `cubic-bezier(.22,1,.36,1)` | 对话区挂载 |
| ④ | 双层弹窗 | 幽灵层 150ms → 实层 260ms | `cubic-bezier(.16,1.3,.3,1)` | 设置面板打开 |
| ⑤ | 故障撕裂 | 190ms | `steps(2)` | 侧栏项按下 |
| ⑥ | 字体抖动 | 180ms | `steps(2)` 循环 | 思考/流式输出 |

三条纪律：

1. **只动 `transform` / `opacity` / `filter`** —— 不触发布局，不重绘。
2. **`prefers-reduced-motion` 时全部停掉** —— 不是隐藏，是 `animation: none` 且把入场元素的 `opacity`/`transform` 复位。
3. **幽灵层用 `::before`** —— 不占布局、不拦截事件（`pointer-events: none`）。

## 选择器锚点

动效挂在稳定锚点上，不靠猜测哈希类名。v3 起按三层使用：

| 层 | 属性 | 实际取值（从 skin-center 源码与实机 DOM 读出） |
|---|---|---|
| 外壳 | `data-dsh-surface` | `root` / `sidebar` / `conversation` / `session-header` / `composer` / `details` / `overlay` / `settings` |
| 元件 | `data-dsh-part` | `message-row` / `message-body` / `scrollport` / `composer-input` / `composer-chip` / `queue-dock` / `turn-tail` / `resize-handle` / `new-session` / `sidebar-entry` |
| 语义槽 | `data-slot` | `sidebar.brand.name` / `sidebar.panellist` / `conversation.header` / `conversation.composer.bar` 等 29 个 |
| 通用 | `role` | `menu` / `menuitem` / `dialog` / `tab` / `tablist` / `switch` / `tooltip` / `treeitem` / `textbox` |
| 状态 | `data-phase` / `data-state` / `aria-*` | `hero` / `running` / `aria-current` / `aria-checked` / `aria-selected` |

⚠️ 早期版本写的 `data-dsh-part="nav-item"`、`"thinking"`、`"streaming-indicator"` **在宿主里不存在**，那些规则从来没生效过。v3 已全部换成上表里的真值。


## 第三方插件着色

`dsh-cost-meter` 的峰谷条写死了 `#ff9800` / `#4d79e8`。用类名精确覆盖成黄 + 青：

```css
.cm-peak-strip, .cm-peak-classic {
  background-image: linear-gradient(to right,
    var(--dsw-static-amber-400, #ffd84d) 0 50%,
    var(--dsw-static-blue-400, #4ad4ff) 50%) !important;
}
```

只改颜色，不动它的布局与行为。装别的插件遇到同类问题，照这个模式处理。

## 验证

真实链路：lab-ts 上的 DSH web（`127.0.0.1:3080`）+ 无头 Chrome + CDP。

```bash
node /tmp/verify_remote.mjs "$(cat ~/.dsh/dsh-web.cookie)" /tmp/shot.png
```

核对项与实测结果：

| 检查 | 结果 |
|---|---|
| `html[data-dsh-skin]` | `zzz-zenless` ✓ |
| body 背景色 | `rgb(18, 16, 42)` = `#12102A` ✓ |
| `--dsw-radius-lg` | `16px` ✓ |
| 根容器动画 | `zzz-crt-on` ✓ |
| 已打标区域 | 8 个（root/sidebar/conversation/session-header/composer/details/overlay×2）✓ |
| 皮肤样式表挂载 | 4 个（stylesheet + patches，各 ×2 次挂载）✓ |
| 目录校验警告 | 0 ✓ |

## 已知限制

- **浅色档是自拟的**。ZZZ 没有官方浅色主题，这档按「新艾利都白天」做。红压深到 `#C8281E` 才过 AA（原始 `#FF4D3D` 在白底只有 3.1:1）。
- **CRT 开机只在首屏播一次**。切会话不重播——宿主的过渡钩子不暴露。
- **双层弹窗是近似的**。用 `::before` 造幽灵层，不是宿主真的渲染两层。
- **`dsh-cost-meter` 那条进度条**已用 CSS 覆盖成 ZZZ 配色，没有卸载——它还带费用统计、余额查询、峰谷提醒等一整套功能。

## 拿登录链接

DSH web 有鉴权，`?token=` 每次服务启动轮换。两个脚本解决：

**lab-ts 上**（`~/apps/dsh-url.sh`）：

```bash
bash ~/apps/dsh-url.sh            # 打印 http://100.112.92.62:3081/?token=...
bash ~/apps/dsh-url.sh host:port  # 换对外地址
```

**本机**（`~/bin/dsh-open.sh`，副本在 `tools/`）：

```bash
bash ~/bin/dsh-open.sh            # 取链接并在浏览器打开
bash ~/bin/dsh-open.sh --print    # 只打印
```

原理：从 `journalctl --user -u dsh-web` 里捞最新 `token=`，拼到对外地址上。
用这个链接访问一次，就会种下绑定 `100.112.92.62:3081` 的 30 天 cookie。

**注意**：服务重启后（`systemctl --user restart dsh-web`）token 会换，
旧链接立即失效。启动到能响应大约要 40 秒，期间访问会拿到 502。

### Windows cmd 里怎么用

`bash` 在 cmd 里可能被解析成 WSL 的 bash（home 变成 `/root`），脚本会找不到。
用 `.cmd` 包装绕开：

```
dsh-open            :: 打开浏览器
dsh-open --print    :: 只打印链接
```

包装文件 `C:\Users\zyz\bin\dsh-open.cmd`（副本在 `tools/`）会显式调用
`C:\Program Files\Git\bin\bash.exe` 并固定 `HOME`，不受 PATH 顺序影响。

注意 `.cmd` 内容必须是纯 ASCII——中文注释在 GBK 代码页下会乱码，
导致 `if not exist` 这类语句被拆断。

---

## v2：按实机取样重做质感

### 之前错在哪

第一版是凭印象配的色：整片深紫，面板也是紫的。实机放大后才发现：

- **画布**是深蓝紫 `#0C0E23`，**面板**是近中性黑 `#0C0C0C` —— 面板比画布更黑，靠这一点分层。
  我原来把两者都做成紫色，层次全糊在一起。
- 强调黄实测 `#FBC827`（不是我用的 `#FFD84D`），红 `#F2343A`（不是 `#FF4D3D`），青 `#28D1E4`（不是 `#4AD4FF`）。
- 面板上有 **45° 交叉细网**（放大 6 倍可见），这是「织物感」的来源，不是扫描线。

取样方法：对实机截图按区域取 5×5 均值，强调色取该区域饱和度前 2% 的像素均值。

### 质感层（新增）

一个固定全屏元素承载五层，参数都在 `patches.css` 的 A2 段：

| 层 | 手法 | alpha |
|---|---|---|
| 45° 网线 | `repeating-linear-gradient(45deg)` 5px 周期 | 1.2% |
| -45° 网线 | 同上反向，两向交叉成菱形 | 0.9% |
| 扫描线 | `repeating-linear-gradient(to bottom)` 3px 周期 | 1.1% |
| 胶片噪点 | SVG `feTurbulence` 内联 data URI，180px 平铺 | SVG 内 10% |
| 暗角 | `radial-gradient` 中心透明 → 边缘 48% 黑 | — |

外加画布双色光晕（洋红在右上、青在左下，18 秒呼吸）。

**调参教训**：噪点第一版 SVG 内 opacity 给到 55%，整页被冲成灰色——画布从 `#0C0E23` 变成 `#393A4A`，侧栏 `#69696C`。
质感层的总抬升要控制在 +9 左右，超过就是雾。

### 实测数据（lab-ts 真实渲染，无头 Chrome 取样）

| 区域 | 实测 | 目标 | 差 |
|---|---|---|---|
| 画布 | `#131529` | `#0C0E23` | +7（光晕+叠层抬升） |
| 侧栏 | `#151517` | `#08080A` | +13 |
| 输入框 | `#0C0C0E` | `#0C0C0E` | 0 |

纹理在场性（局部像素标准差，纯色应为 0）：画布 2.12、输入区 2.12。

对比度（按实测底色算）：

| 组合 | 比值 |
|---|---|
| 主文字 / 画布 | 16.10:1 |
| 主文字 / 侧栏 | 16.31:1 |
| 次文字 / 侧栏 | 6.57:1 |
| 三级文字 / 侧栏 | 4.70:1 |
| 黄 / 侧栏 | 11.63:1 |
| 青 / 侧栏 | 9.84:1 |

按钮用 `#E02A30 → #C81F25` 渐变而不是纯 `#F2343A`：白字在 `#F2343A` 上只有 3.94:1，压到 `#E02A30` 后 4.62:1 过 AA，视觉几乎无差别。

### 锚点修正

动效原来挂在 `[data-dsh-part="nav-item"]` 上，实际不存在。实测可用锚点：

- `entry` —— 侧栏导航项
- `new-session` —— 新建会话按钮
- `composer-input` —— 输入框
- `foot-card` / `foot-card-main` / `foot-card-usage` —— 底部费用卡
- `scrollport` / `lever` / `resize-handle` —— 滚动口与拖拽

猜类名会静默失效，改之前先探一遍 DOM。

---

## v3：从一张图到五张图，从换色到动效系统

v2 的问题被一句话点破：**只是取色，而且只对着一张截图**。v3 换方法：拿五张不同界面的实机截图（设置页 / 主菜单 / 装备页 / 剧情对话 / 战斗 HUD）分别取样，先抽**几何规律**，再抽**动效语言**，最后逐区域装配。

### 五张图给出的规则

| 来源 | 看到的 | 抽出的规则 |
|---|---|---|
| 设置页 | 选中导航是实心黄绿胶囊 + 黑字，未选是纯黑胶囊 | **R1 选中 = 色块反转**，不是描边发光 |
| 设置页 | 面板 28px 大圆角 + 一圈 `#222` 细描边 | **R2 双层描边面板** |
| 设置页 | 每个设置行是独立圆角块，没有分割线 | **R3 独立块行** |
| 设置页 | 背景有巨型字形水印，底部有居中细滚动条 | **R4 水印层** / **R5 滚动指示条** |
| 主菜单 | 底部 dock 选中项上抬并加方块底；标题两侧三横线 | **R6 dock 抬升** / **R7 均衡器条** |
| 装备页 | 选中 = 黄环 + 白外光 + 轻微放大；属性条是细渐变条 | **R8 选中环** / **R9 属性条** |
| 战斗 HUD | 伤害数字上浮；血条分段 | **R10 数字上浮** / **R11 分段条** |
| 剧情 | 电视框 CRT + 逐字 | **R12 逐字机** |

取样值（不是设计值）：

```
选中黄绿  #D4CF01   设置页 Input 胶囊，hue 59° 饱和度 1.00
金色环    #EFDA27   装备页物品格选中环
描边灰    #222222   面板外圈
面板      #0A0A0C   设置行 / 菜单底
画布      #0C0E23   深蓝紫
```

### 12 式动效原语，装到具体区域

| 原语 | 时长 / 缓动 | 装在哪 |
|---|---|---|
| P1 开机（CRT 横线张开） | 560ms `(.3,.9,.3,1)` | 根容器首屏 |
| P2 阶梯入 | 300–340ms，每格 +45ms | 消息行、会话列表、菜单项 |
| P3 侧推入 | 180ms `(.16,1.3,.3,1)` | 菜单、弹层 |
| P4 扫光 | 620ms 单次 | 新建会话 hover、运行中卡片 |
| P5 故障撕裂 / 抖动 | 180–200ms `steps(2)` | 错误态、危险操作 |
| P6 呼吸 | 2.2s 循环 | 运行中的工具卡（黄环起伏 = R8） |
| P7 方块光标 | 1.06s `steps(1)` | 回合尾巴 |
| P8 dock 抬升 | 220ms | 输入区工具按钮 |
| P9 数字滚动 | 260ms | 费用 / 用量数字 |
| P10 准星聚焦 | 220ms | 输入框（四角括号，不是四边描边） |
| P11 水印视差 | 24s 交替 | 侧栏 ZENLESS / 设置页 SYSTEM |
| P12 均衡器 | 6s 交替 | 区块标题 / 会话头 |

### 逐区域装配表

| 区域 | 做了什么 |
|---|---|
| 侧栏 | 品牌粗斜体；导航选中反转黄绿；悬停左侧 2px 黄条；会话行错峰推入；竖向 ZENLESS 水印 |
| 新建会话 | 黄绿实心 + 黑字胶囊，hover 斜带扫光，按下 0.975 硬缩 |
| 会话区 | 进入时 1.035 景别推近；消息行阶梯入场；回合尾巴方块光标 |
| 输入区 | 卡片底 `#050507` + 1px 灰边；聚焦四角准星 + 黄边；光标黄色；chip 斜切角 |
| 菜单 / 弹窗 | 菜单逐项推入、悬停整行反转黄绿黑字；弹窗幽灵层偏右上；遮罩轻微故障后稳定 |
| 设置 | 22px 双层描边面板；背景 SYSTEM 水印；开关选中黄绿；标签页选中黄绿 |
| 工具卡 | 运行中黄环呼吸；错误态抖动 + 左侧红线 |
| 用量卡 | 属性条黄→青渐变；数字等宽 + 滚动；轨道分段刻度 |

### 两个真 bug（v3 修掉）

**① 整页空白。** 宿主 `.pI_x6G_frame{height:100%}` 的百分比链在一个 `display:contents` 包装层处断掉，计算高度变 0，于是除了背景什么都看不见。修复是一行兜底：

```css
[data-dsh-frame] { height: 100dvh; min-height: 100dvh; }
```

**② 辉光盖住了 UI。** v2 把两团径向光晕塞进 `body::after`，而那一层的 `z-index` 顶到 2147483000——于是紫雾盖在所有文字和面板上方。v3 把光晕移回 `body::before`（内容之下），`body::after` 只留很淡的网格 / 扫描线 / 噪点。

### 离线验证台

实机调试受插件干扰，另建了一个干净对照页：`.playwright-mcp/zzz-harness.html`——加载真实的 `app.css` + `vendor.css` + 本皮肤，DOM 用实机导出的结构和语义属性复刻，用来单独判断「是皮肤的问题还是宿主插件的问题」。

```bash
cd .playwright-mcp && python -m http.server 8971
# http://127.0.0.1:8971/zzz-harness.html
```


### v3.1 逐项对照后补的（提交 `1706436`）

把实机设置页和我们的界面并排比对，补掉差异最大的一处：**会话列抬成浮起面板**（`#0A0A0C` + 22px 圆角 + 1px `#222` + 10px 外边距），从"所有东西贴在一个平面上"变成"黑板上浮在蓝紫画布上"。另外补了消息气泡（14px 圆角 + 左上 12px 斜切 + 亮边）、关闭/返回红色键、顶部会话条底边，并接上两式一直声明未用的动效（`zzz-tear` 危险撕裂、`zzz-dock-lift` 输入区按钮抬升）。

对照页：`answers.离命塔.cn/2026-10-22-dsh-vs-zzz-compare.html`。


### v3.2 设置页整页结构（提交 `d771ae7`）

原来设置页只有「借来的行样式」，这轮按实机补齐整页结构：左导航整列 `#070709` + 右灰线、导航项铺满整行做 10px 胶囊、选中 `[aria-current="true"]` 反转成实心黄绿 + 黑字、右侧每个设置行/组变成独立圆角块（组内行去重边框）。

实测：导航底色 `rgb(7,7,9)`、选中 `rgb(212,207,1)`/`rgb(10,11,20)`、行圆角 10px 宽 564px、行标题 700。

控件同轮改深色描边胶囊：`[class*="_selector"]` 透明黑底 + 1px 16% 白边 + 粗斜体；`[class*="_themeCube"][aria-pressed="true"]` 黄边 + 黄字 + 10% 黄底 + 外发光。实测 selector `rgba(0,0,0,.5)` / `1px rgba(255,255,255,.16)`，选中 cube `1px rgb(212,207,1)`。

对照图见 `answers.离命塔.cn/2026-10-22-dsh-vs-zzz-compare.html`。


### v3.3 找到「侧栏不响应样式」的真因（提交见下）

症状：侧栏整块对皮肤改动毫无反应——背景、圆角、描边不改，连内联 `!important` 也不生效；而设置弹窗里同样规则一切正常。

排查过程与结论：

1. 先怀疑选择器/权重：扫了全部 213 个样式表，匹配 `[data-dsh-part="new-session"]` 的最高权重规则就是皮肤自己的（0-2-1），没有对手。
2. 再怀疑 `@layer`、`all: unset`、shadow DOM、iframe——逐个排除。
3. 关键一步是**不信 `getComputedStyle`**：它对 `background-image` / `font-style` / `animation-name` 返回空串，但对 `borderTopLeftRadius`、`fontWeight`、`color` 返回皮肤值。说明规则**是生效的**，只是有的属性读不出来。
4. 用逐个开关样式表 + 元素截图做二分，最后定位到 `[data-dsh-surface="root"]` 的 CRT 开机动画：它当时在 `@keyframes` 里动 `filter: brightness()`，动画结束后整棵子树停留在一个合成层里，**该层的位图不再失效**——侧栏就一直显示首帧的旧位图。

修复：`zzz-power-on` 去掉 `filter`，只动 `transform` / `opacity`，且末帧写 `transform: none`（不留持久合成层）。`zzz-cam-push` / `zzz-rise` / `zzz-win-snap` / `zzz-slide-in` 的末帧同样改成 `none`。

修复后侧栏、黄色主按钮、导航、底部用量条、ZENLESS 水印全部正常显示。

**教训**：装饰性入场动画不要在 `@keyframes` 里动 `filter`（尤其配 `animation-fill-mode: both`）；末帧要用 `none` 而不是恒等变换，否则会留下一个不失效的合成层，把子树钉在旧位图上。


### v3.4 插件市场与卡片列表（提交 `7151b51`）

插件市场页原来只是「继承了一点品牌色」，分类胶囊是纯文本挤成一团、两行互相压字。这轮按实机语汇重排：胶囊 24px 高等距、1px 14% 白边、粗斜体、hover 转黄；卡片 14px 圆角 + `#222` 边 + 近黑底，hover 抬 1px；顶栏加细底边与薄雾。

**踩坑**：第一版用 `[class*="active"]` 认选中态，把 5 个胶囊全染黄——这些组件同时挂 `_interactive`，`active` 子串命中了它。状态必须走 `aria-*` / `data-*`，`class*=` 只适合认**结构**不适合认状态。

**没做顶部资源条**：游戏顶部是等级/资源胶囊，DSH 没有对应数据；用伪元素造数字等于写死假数据，所以只对齐了顶栏结构。要做的话数据源是底部用量卡（今日花费、峰谷倒计时），皮肤只负责排版。

对照页 `answers.离命塔.cn/2026-10-22-dsh-market-align.html`。

### 仍未解决

- **设置面板宽度**：实机接近满屏，宿主写死 802px 居中弹窗；硬改风险高，暂不动。
- **顶部资源条**：游戏顶部有等级/资源胶囊，DSH 没有对应信息，没有自造。
- ~~宿主侧栏渲染异常~~：已定位为 `zzz-power-on` 里 `filter` 导致合成层位图不失效，v3.3 修复（见上）。

## v4 全 DOM 审计收口（2026-10-24）

用户授权「自行优化皮肤」。这轮不再靠截图目检，改为**计算样式全量审计**：真实 Chrome + CDP（`tools/cdp.mjs`）走 8 个页面态（hero / 对话 / 流式 / 设置 / 皮肤 / 模型 / 工坊 / 看板），注入 `tools/audit-inject.js` 逐元素聚合 color / bg / border / radius / animation，按语言色相判定泄漏 + 爬祖先算有效底色查对比度。

结论：v3 系主体已干净，残留集中在**三方插件自带的颜色**与 **v2 琥珀令牌**，共收 9 处：

| 问题 | 位置 | 处置 |
|---|---|---|
| 行内代码底色 v2 琥珀 `rgba(251,200,39,.13)` | skin.css inline-code 令牌 | → 黄绿 `rgba(212,207,1,.13)`（数值语言） |
| warn 族三黄并存 | skin.css warn ×4 + amber-400 | 全部收进金 `#EFDA27`（`#FBC827` 退役） |
| 引导页强调 / 选区琥珀 | onboarding-accent / `::selection` | → `#D4CF01` |
| 「当前使用」徽章绿底透出 | 皮肤页 `TJMolG_badge` | 金环胶囊（装备页选中环语言） |
| 「预览版」角标长春花紫 | `pXSMma_previewBadge` | 金描边胶囊，SF Mono 保留 |
| 工坊预览链接长春花紫 | `bkhjFa_previewLink` | → 青 `#28D1E4`（链接族） |
| Shield 徽章无语言 | `sa-chip-btn` | HP 绿描边胶囊 |
| 凭据状态点裸圆 | `zGbnIq_credentialDot` | 绿色辉光 |
| 壁纸目录提示暖棕块 | `TJMolG_externalWallpaper*` | 中性面板 + 金标题 |
| 看板列计数 4.27:1 | `_7D6uKa_columnCount` | `#9a9ba8`（≈5:1） |
| 会话行 8px 圆角 | `YDXeBa_sessionRow` | → 10px（三档纪律） |
| 危险按钮红字 4.09:1 | `zGbnIq_dangerButton` | `#ff454b` |

**语义裁定**：`#35d98a` 是 state-success 族（HP 绿），保留为「健康」专用色，不再当泄漏处理。

**新坑（重要）**：三方插件样式表比皮肤**晚注入**，同特异性皮肤规则必输——`sa-chip-btn` 第一版边框就是这么丢的。对插件族（`sa-*` / `cm-*` / 三方模块）必须 `!important`，宿主模块（`hHd-Xa` 等）不用。

**审计的两个假信号**（记录防再踩）：① 黄底若画在伪元素/渐变上，`effBg` 爬不到 → 黑字误报 1:1；② 流式入场瞬间的 hover 态会短暂采集到过渡值。真实 Chrome 下 `getComputedStyle` 全量可靠，`background-image` 等空串问题只存在于无头。

**模式拨杆（`hYkIZq_lever`/`lever-track`/`lever-arm`）没做**：会话内与 hero 均未复现该控件，无法实测样式，未盲写。

## v5 · 六层壁纸系统（2026-10-24）

用户裁定 v4「皮肤太单调，要做到壁纸级」。排查发现根因是结构性的：**壁纸层一直在，但被不透明面板盖住**（conversation 主面板占 77% 屏幅、纯黑不透明），v5 因此重做：

- **§2 色洗重做**：双紫星云 + 青渊 + 黄绿街灯回声，六层径向渐变（body::before，z-index -2）
- **§2b 壁纸艺术层**：网点场 × 双向斜纹 × 警示条多背景拼贴（frame::before，径向 mask 挖空中央阅读区）；竖排「NEW ERIDU」描边巨字（frame::after）；SMPTE 电视测试卡底条（html::before，steps(1) 信号闪烁）
- **§2c hero 空态专属壁纸**：`_emptyTabHost` 舞台上网点聚光（黄绿粗点 + 青细点 + 白远点三层）+ 斜体幽灵大字——空态没有正文，是壁纸最该放开的地方
- **面板玻璃化**：侧栏 0.86 / 会话列 0.80 / 详情栏 0.85 / 弹层 0.88 / 菜单 0.90 半透明底 + backdrop-blur，壁纸透过面板显形
- **屏幕微纹理提强**：45° 网 / 扫描线 / 噪点各提 40–60%，仍压在「屏幕质感」档不抢戏

### 工程要点（本次新增的三条铁律）

1. **新官方 UI 没有旧锚点**：dsh-web（zhu fork）卸载后换 @deepseek-ai/dsh-web-app，没有 `[data-dsh-frame]`/`[data-pane=...]`；布局类是 `.pI_x6G_frame/_sidebarCol/_centerCol/_rightbarCol/_bottomRow`。载体一律**双挂**（属性 + 类名）；高度兜底必须同步迁移，否则整页 15px 塌陷（v3 高度链断裂在新 UI 复发）。
2. **skin-center v2 是插件不是本体**：路由由 `@linxin666/dsh-client-ui-skin-center` 提供。它随旧 UI 一起被卸载时，`/api/skin-center/v2/*` 全 404、皮肤全失效且 UI 不再标注 data-dsh-surface 之外的锚点。修复：`pnnpm add` + 写进 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` + 重启 dsh-web。
3. **验皮肤别用 ZCode 自带 MCP 浏览器**：该内核把伪元素 `position` 钉死 `static`（防覆盖加固，连 `!important` 都无效），壁纸层全部假阴性。验收一律真实 Chrome + CDP（`tools/cdp.mjs`）。

## v5.3 · 真·壁纸（backgroundMedia，2026-10-24 二轮）

用户指出「还没换掉壁纸，实拍还是大飞鱼」——大飞鱼=skin-center 内置皮肤 **Blue Fantasy（鲸鱼插画背景）**；zzz-zenless 之前没有声明壁纸，壁纸位空着。v5.3：

- **自绘壁纸「新艾利都·夜行」**（2560×1440，assets/wallpaper-new-eridu.jpg，450KB JPEG）：夜城两层剪影+霓虹招牌+车灯光轨、NEW ERIDU 巨字+竖排「新艾利都」、网点场、斜纹、星云、SMPTE 条、扫描线、噪点。画布源码 tools/wallpaper-art.html，CDP 渲染器 tools/render-wallpaper.mjs（确定性种子，可复现）。
- **manifest 挂载**：`contributes.backgroundMedia.dark/light = {type:image, src:assets/…, scrim:可读性渐变}`——皮肤中心把它填进固定装饰层 `background`（fixed z-2 <img> + scrim div），并触发 `data-dsh-backdrop-active`。
- **优先级铁律**：Wallpaper Engine 壁纸 > 用户手动壁纸 > 皮肤 backgroundMedia。用户端若仍见别的壁纸，查 设置→皮肤 的手动壁纸/试穿状态。
- **平衡修正**：插画接管视觉后，CSS 网点/斜纹降回克制档、§2c hero 专属构图退役（删除）、hero 态玻璃从 0.80/16px 放宽到 0.45/10px 让壁纸呼吸；scrim 加深到 0.50/0.74。

## v5.4 · 壁纸可见性修复（2026-10-24 三轮）

用户连续两轮指出「实拍还是大飞鱼」，两次诊断更正：

1. **大飞鱼真身**：不是 Blue Fantasy，是并行工作流 01:36 装进 bundles 的 **@smalltailqwq/dsh-client-ui-skin-maid-atelier 插件**——它往会话列里塞 absolute 不透明壁纸 div（skin-assets/maid-atelier/*.webp），盖在一切皮肤之上，active 是谁它都画。已从 deps+bundles 摘除（备份 package.json.bak-20261024-remove-smalltail），dsh-web 重启后资源加载归零。
2. **scrim 过深**：壁纸其实一直在 background 装饰层渲染，但 scrim 0.50/0.74 把它压到几乎不可见（隔离实验：隐藏应用后提亮 2.6× 才能看清）。已放宽到 0.16/0.38/0.50（底部渐深保正文）。
3. **验证教训（铁律升级）**：DOM 挂载≠视觉可见；看小图会脑补。本轮起验证三件套：隔离截图（隐藏 .pI_x6G_frame）+ 提亮查看 + 亮度均值核对。像素相关性在低光+jpeg 量化下不灵敏，不能单独作准。

## v5.5 · 壁纸提亮（2026-10-24 四轮）

用户指出背景没有壁纸原图样式——V1 图太暗（mean≈30）+scrim 叠加后直出就是一片深夜色。重渲染 V2：底色/星云/大字描边/光轨/网点整体提亮（对齐原作亮紫青夜空），scrim 放宽到 0.10/0.22/0.34。验收标准改为「无提亮直出可辨」。

## v5.6 · 内容层让位壁纸（2026-10-24 七轮）

用户端壁纸已挂载但被「对话框后面的紫色背景」盖住——真凶是**对话区内容容器 .wSkVaW_root 的不透明底 rgb(12,14,35)**（=皮肤画布令牌 --dsw-alias-bg-base 被它引用），侧栏同伙 .hHd-Xa_root（插件近黑）。v5 只玻璃化了 centerCol/sidebarCol 外壳，内容层没动。修复：两者 background-color: transparent，底与可读性交由外壳玻璃（0.80/0.86+blur）。铁律：玻璃化要打穿到内容层——外壳透明、内容容器不透明等于没透。

## v5.7 · 满幅无缝（2026-10-24 八轮）

用户指出「周围留一圈缝不美观，看看别的壁纸怎么做」——对照内置 Blue Fantasy：它不动布局列、scrim 只有 0.08–0.2，UI 全是叠层，没有浮起面板。那圈缝是 v3 遗留的「黑板上浮」设计（centerCol margin:10px + radius:22px + 描边）。v5.7 撤掉三者回到原生满幅，scrim 对齐 BF 放宽到 0.08/0.18/0.28——壁纸贯穿全窗，侧栏与对话区是连续玻璃层。

## v5.8 · 官方主视觉壁纸（2026-10-24 九轮）

用户裁定自绘夜城「不像绝区零」——换成最广为人知的官方新艾利都主城霓虹街景（图搜筛选 1920×1080 key art）。新文件名 wallpaper-zzz-keyart.jpg（促缓存刷新），scrim 按官方图亮度调 0.2/0.36/0.5。**版权：官方美术归 HoYoverse/miHoYo，仅个人自用，勿再分发。** 自绘夜行图保留在 assets/ 作备选。

## 市场对比与上架（2026-10-24）

npm 全量调研 9 款社区皮肤（蓝幻想/鲸吟/龙的传人/初音/MC/虎鲸链路/清宵/薇儿丹蒂/815）：**无绝区零皮肤，市场空白**。IP 皮肤直接用官方美术是社区常态（非商用二创）；保守路线=MC 全程序化 / 清宵自绘可换背景。上架清单：补 preview/light.png 实拍；可官方图+自绘双版本。详见 answers/2026-10-24-dsh-skins-zenless-compare.html。
