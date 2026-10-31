# v9.1 代理人头像选择器（2026-10-31）

参考 zenless.tools 聊天生成器（`/zh/chat-generator`），抓取代理人头像库，
做成可挑选、点击即应用+部署的本地挑选页，换的是 §14 AI 消息头像槽。

## 素材库

三组共 233 枚 webp，全部圆形透明底（yuva420p）：

| 组 | 目录 | 命名 | 尺寸 | 数量 |
| --- | --- | --- | --- | --- |
| 聊天图标 | `assets/avatars/chat-icons/` | IconMessageRoleCircle* | 128 | 76 |
| 头像 | `assets/avatars/avatars/` | IconInterKnotRole* | 200 | 62 |
| 角色 | `assets/avatars/portraits/` | IconRoleCircle*（一人多表情） | 142 | 95 |

- 名字↔文件映射：`assets/avatars/catalog.json`（页面 DOM 提取的中文名清单在
  `refs/avatars-catalog.json`，抓取脚本 `tools/scrape-avatars.mjs` 幂等可重跑）。
- 参考站的渲染基准：`rounded-full` 正圆 + 细描边——代理人头像因此按正圆渲染。
- 直链无防盗链（Cloudflare 公共缓存），curl 直接抓即可。

## 机制：三层背景 + 形状标记行

§14 头像槽只动一处（patches.css）：

```css
border-radius: 50%; /* avatar-shape */   ← 工具写回这一行（代理人=50% / 大肥鱼=15px）
background:
  url("assets/avatar-agent.webp") center / 47px 47px no-repeat,   ← 代理人可选层
  url("assets/avatar-fatfish-128.png") center / 47px 47px no-repeat,  ← 默认层
  linear-gradient(#eaf1ff, #d9e8ff);                              ← 垫底（圆形素材的彩色圆盘）
```

- `avatar-agent.webp` 在 = 盖住大肥鱼；缺文件 = 404 该层不画，自动回落大肥鱼
  （大肥鱼是 v9 敲敲实测批准的圆角方，形状行跟着切回 15px）。
- 形状跟所选头像走：代理人素材是圆形，切 50% 后白描边环贴着圆走（对齐参考站）。
- 服务端 mime：skin-center 的 MIME 表里 `.webp: image/webp` 已有，直出。

## 工具

```bash
node tools/set-avatar.mjs               # 本地挑选页 http://127.0.0.1:4177/
                                         #   搜索/分组页签/点击选中/「应用并部署」一键到 38 个皮肤目录
node tools/set-avatar.mjs --list        # 列全部（名字 + 文件名）
node tools/set-avatar.mjs 艾莲          # CLI 直选；重名时列出候选，--group 头像|聊天图标|角色 消歧
node tools/set-avatar.mjs --fatfish     # 换回默认大肥鱼
node tools/scrape-avatars.mjs           # 重抓素材库（已存在跳过）
```

应用流程：拷图 → `assets/avatar-agent.webp`，写形状行，scp patches.css +
webp 到 lab-ts 全部 `zzz-*` 皮肤目录，记录 `assets/avatars/active.json`。
DSH 端要硬刷新（Ctrl+Shift+R）或设置→皮肤→重新应用。

## 验收（真实 Chrome + CDP）

- CLI 应用「艾莲」：真实会话 AI 消息头像与原图中心 25×25 比对 L1 22.2 /
  相关系数 0.889（对比大肥鱼 69.8 / 0.390）——换图生效。
- `--fatfish` 回落：远端删 agent 文件、形状回 15px，重新比对反转为
  0.801（艾莲 0.411）——回落无损。
- 挑选页端到端：搜索「雅」→ 点选 → 应用 → 38 目录部署 → DSH ignoreCache
  重载后实测 L1 22.6 / corr 0.855——全链路通。
- 形状机制受控实验：注入纯渐变圆盘 50% vs 15px 各一枚，轴向/对角半径
  实测与预测吻合（50% 全向≈32px 圆；15px 轴 32/对角 36.8 圆角方）。
- 挑选页 234 张图全部 naturalWidth>0 无破图；「使用中」标记随 active.json。

## 坑

- **CDP 截图裁剪坐标**：`Page.captureScreenshot` 的 clip 语义在 DPR≠1 时容易
  算错（本次第一轮全拍歪）。可靠做法：整幅截图，元素 rect×dpr 换算物理像素
  后在图内定位。
- **smooth scroll 截图竞速**：`scrollIntoView` 后立刻量 rect 再截图会拿到滚动
  途中的位置（本次同一行先后量到 y=660 与 y=-40）。要等 rect 稳定或直接找
  「已在视口内」的行。
- **白描边环的像素测量不可靠**：0.92 白环压深色底合成后 ≈237 灰，亮度阈值
  一旦卡在边缘，轴向识别不全、对角却透亮壁纸全识别，量出来像「方」。
  形状裁决用黑底受控注入（同素材同环 A/B），别在真实聊天截面上量。
- **同一 `indexOf('--flag')` 参数过滤坑第三次出现**：`argv.find(a => !a.startsWith('--') && a !== argv[argv.indexOf('--group')+1])`
  在无 `--group` 时 `argv[0]` 自比值恒 false，位置参数被吞、直接落进服务器
  分支。修法同 build-skins.mjs：`!(gi >= 0 && i === gi + 1)`。
- MCP playwright 内核浏览器缺 CJK 字体（截图全 tofu），验收文字渲染得用
  真实 Chrome；功能 DOM 检查不受影响。

## 版权

头像素材经 zenless.tools 整理下载，原图为《绝区零》官方游戏素材
（© miHoYo / HoYoverse），非商业同人使用，已在 NOTICE 署名。
