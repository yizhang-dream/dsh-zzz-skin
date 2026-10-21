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

动效挂在 skin-center 的 L2 语义属性上，不靠猜测 class：

| 属性 | 值 | 对应区域 |
|---|---|---|
| `data-dsh-surface` | `root` / `sidebar` / `conversation` / `composer` / `settings` / `session-header` | 八个外壳区域 |
| `data-dsh-part` | `message-row` / `nav-item` / `thinking` / `streaming-indicator` | 区域内元件 |

这些属性由 skin-center 的兼容适配器从稳定锚点（`data-slot` 出口等）打标，比 CSS-module 哈希类名可靠得多。

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
