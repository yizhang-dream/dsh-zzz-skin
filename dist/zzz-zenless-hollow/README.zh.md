# 新艾利都 (New Eridu)

[English](README.md) | 中文

《绝区零》主题的 DSH Web 皮肤。官方狡兔屋主视觉插画垫在玻璃面板之下，
明暗两档各自独立设计：暗色档是**夜航霓虹**（深紫夜底 + 警示黄强调），
亮色档是**白纸漫画**（米纸底 + 黑描边 + 硬阴影）—— 不是同一套配色加滤镜，
两档的面板、弹层、菜单都是各自的色板。

## 构成

- `skin.json` —— v2 清单。
- `skin.css` —— L1 令牌层：107 个 `--dsw-*` 语义令牌 + 77 个静态色阶全量
  重映射，浅深两档。
- `patches.css` —— L3 补丁层：十八件游戏元素动效 + 结构改造 + 第三方
  插件着色。
- `assets/wallpaper-zzz-keyart.jpg` —— 《绝区零》官方主视觉插画（六分街 ·
  狡兔屋），亮色档经印刷调滤镜（降饱和 + 轻纱）转白纸漫画底，暗色档直出
  夜色。
- `preview/light.jpg` / `preview/dark.jpg` —— 运行中的皮肤，1440×900 实拍。

## 设计语言

形式语言取自游戏的漫画语汇，颜色是随从：粗描边（2px 黑线）、斜切角
（`clip-path` 切角按钮）、4px 硬投影、半调网点、SMPTE 电视测试卡底条、
`-2°` 贴纸化徽章、标题 `//` 前缀。强调色收敛为 `--zzz-accent` /
`--zzz-accent-soft` 两个变量（`skin.css` 顶部），缺省是游戏的警示黄
`#FFD84D`，想换青色、洋红只需改一行。

## 动效（十八件游戏元素）

流式时 header 挂 **HDD 侦测警报**斜纹条、回复完成弹 **S 评级**描边卡、
等待时 **邦布** loading 与**加载转盘**、token 计数是 **COMBO** 脉冲牌、
菜单项是**对话选项斜切框**、空会话首屏 **PRESS ANY KEY** 闪烁、切会话
**白闪 + 噪点帧**、出错 **Hollow 侵蚀红雾**、长任务 **Hollow 深潜**进度条、
语音流式**音波纹**、设置弹窗是**调查报告**（纸面横线 + CONFIDENTIAL 红章）、
侧栏底部 **DATA BANK** 铭牌、usage 卡 hover **结算翻卡**、新会话按钮藏
**扭蛋彩蛋**、panellist 铺**空洞监测**等高线扫描。另有 CRT 开关机、错峰
入场、景别推近、故障撕裂、字体抖动六招镜头语言。所有动画在
`prefers-reduced-motion` 下全部停用（真机核验 animationName 全 none）。

## 宿主兼容

- 按官方新 UI（`@deepseek-ai/dsh-web-app`）编写：布局类锚点（`_frame` /
  `_sidebarCol` / `_centerCol` 等）与语义属性双挂。
- 皮肤 CSS 走 skin-center 安全管线（选择器强制限定在 `html[data-dsh-skin]`
  下），无 `@import`、无远程 URL。
- 气泡透明度 / 背景遮蔽 / 输入卡磨砂接受皮肤中心的滑杆控制。

## 版权与许可

| 部分 | 作者 / 权利人 | 许可 |
| --- | --- | --- |
| 皮肤代码与设计 | flower-moon | MIT |
| 壁纸插画（六分街 · 狡兔屋） | © miHoYo / HoYoverse | 非商业同人使用 |

《绝区零》(Zenless Zone Zero) 与登场角色（妮可、安比、比利、邦布）的一切
权利归 miHoYo / HoYoverse 所有。本皮肤为非商业同人作品，与权利方无隶属、
合作或授权关系。详见 `NOTICE`。
