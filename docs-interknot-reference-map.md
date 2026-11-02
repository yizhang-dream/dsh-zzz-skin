# 绳网界面重构参考地图（2026-11-03 调研，无皮肤代码改动）

用户指令「找到绝区零绳网界面重构别的地方」。全网盘点 + 三站 CDP 实测，
完整版发布在 answers（2026-11-03-zzz-interknot-rebuild-references.html），
本文件留仓内速查。

## 聊天类（与对话区直接对标）

| 项 | zenless.tools（现行基准） | zzz-chat.auraa.moe（新发现的第二基准） |
| --- | --- | --- |
| 来源 | Reddit 玩家截图生成器；图标=游戏提取资产（IconMessageRoleCircle*） | GitHub AKindWorld/ZZZ-Chat（9★）；Figma 拆解 + Tailwind/SVG 从零重绘 |
| 头像 | 40px 圆外置左侧，间隙 8.3px，顶高 2.3px | 40px（w-10）圆外置左侧，间隙 16px，顶平齐 |
| 左气泡 | 纯白 + 黑字 | gray-200 + 黑字 |
| 右气泡 | #2c58e2 | #1c55e3 + 白字 |
| 圆角/箭头 | 15px / 有（12×12 兄弟节点） | 16px / 无 |
| 聊天窗 | 近黑圆角卡 + 斜纹 + 巨字水印 | bg-black/80 圆角窗 + 巨字水印 |
| 字体 | Inter 16px | 鸿蒙（inpin hongmengti） |

**三方对照（含我方 v9.4.1 线上实测：白泡 .95+深字 / #3451d3 / 15px / 间隙 9px /
顶 −3px）：「40px 外置圆头像 + 左亮泡黑字 + 右蓝泡白字」是跨复刻共识，我方落在
共识带内，不返工。** auraa 交互：Switch 钮切左右侧；React 受控输入用 native
setter + input 事件注入。

## 论坛类（侧栏/卡片气质参考）

- **blacktunes/interknot**（88★，interknot.shenmedouyou.top）：绳网动态生成器，
  社区实际在用。材质：近黑 `#020202` + 灰阶梯面板（`#222`/`#333`）+ 白字 +
  猫啃什锦黑 + 统一圆角卡、无彩色强调。侧栏「绳网化」从此取样（与观测台
  石墨三阶互证）。
- **KawaYiLab/InterKnot-Web**（interk.net，26★，2026-11-02 仍活跃）：Nuxt4+
  Vue3 全功能论坛，UI 用 zenless-ui；致谢点名 zenless.tools 为 UI 资源。
- 其余：share121/inter-knot（停滞）、KawaroX/interknot-app（SvelteKit，1★）、
  Mine-dsa/InterKnot-server（Strapi5+Nuxt4 二开）。

## 组件库 / 素材

- **ChrisChan13/zenless-ui**（40★）：Vue3 桌面端仿 ZZZ 组件库，
  chrischan13.github.io/zenless-ui。不能直接搬进 DSH，可当规格书。
- 花瓣「UI-绝区零」186 张 /「JM-绝区零游戏界面参考」403 张；Fandom wiki
  Inter-Knot Posts（文本）。CodePen/Figma 社区无实质复刻。

## 候选后续（仅记录，等用户裁定）

1. ~~暗档气泡改游戏内 DM 路线~~ **已执行（2026-11-03 用户裁定「改」，v9.5）**：
   §13.1/§13.1a 两档统一白泡深字（rgb(255 255 255/.90+滑块)+#303030），暗档
   硬影统一 rgba(16,16,22,.65)；旗标箭头随白泡在暗窗上高可见（v9.3.2 的
   ≈1:1 对比问题就此消解）。console 卡不跟随：tail 补暗档字色伴侣
   （#f4f4f6）+ 行底按 v9.4.1 前原值恢复炭黑（镜像基座复合选择器加 body
   前缀才压得过基座 (0,4,x) 特异性；行底透明化方案否决——箭头挂行缘 -7px
   会悬空）。E2E 双档实测+console 回归+多模态三检通过。
2. 聊天窗外补巨字水印 + 斜纹底（两参考共有的游戏内既视感来源；我方 §15
   为磨砂壁纸路线）。

## 测量脚本（本轮入库）

`tools/probe-auraachat.mjs`、`tools/auraa-use.mjs`、`tools/auraa-dom.mjs`、
`tools/measure-auraachat.mjs`、`tools/measure-zenless-tools.mjs`、
`tools/measure-zenless-tools2.mjs`、`tools/measure-dsh-current.mjs`、
`tools/measure-interknot.mjs`
