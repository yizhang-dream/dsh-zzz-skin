# v9.6 绳网窗体与半透明材质

用户 2026-11-04 指出整页与绳网 / 绝区零仍有明显差异，半透明效果也没有体现。本轮按整页修正，不再以聊天气泡尺寸落在参考范围内作为整页验收结论。

## 原因

- v9.5 白泡公式 `0.90 + slider × 0.09`，默认实际不透明度约 95%；用户气泡约 96%，输入卡完全实心。
- 第三方皮肤中心移除后，旧的材质滑块没有迁入自研设置页，CSS 一直消费 fallback。
- 会话列早先移除了底层遮罩，导致界面主要表现为壁纸上浮着消息；侧栏仍是 92% 不透明的实心感。

## 实现

`patches.css` §17 收口整页窗体：黑灰 / 浅色双档、22px 圆角、12px 窗间隙、低对比斜纹及 INTER-KNOT 大字水印。侧栏去掉 COMBO / DATA BANK 和等高线装饰，空态 PRESS ANY KEY 退役以统一窗体。模糊直接作用于无交互背景层的 video / img，半透明托底画在窗体，`::before` 仅画纹理与水印。内容祖先无 filter / backdrop-filter，避免复制提示框 fixed 包含块偏移，也规避隔离 headless Chrome 中 backdrop-filter 无像素效果的问题。

材质参数：

| 参数 | 默认 | 范围 | 生效对象 |
| --- | --- | --- | --- |
| `--zzz-panel-alpha` | 0.66 | 0.48–0.90 | 会话窗；侧栏额外 +0.08，输入与对话框保留可读下限 |
| `--dsh-skin-bubble-alpha` | 0.86 | 0.65–1 | 白色气泡与箭头直接使用；蓝泡最低 0.88 |
| `--zzz-panel-blur` | 6px | 0–18px | 窗体背景模糊 |

插件 1.2.0 在「设置 → 皮肤中心 → 界面材质」提供三个带 label 的原生 range，拖动即时写 body 变量并保存到当前浏览器 localStorage（`dsh-eridu-material-v1`）。支持恢复默认；加载时验证有限数并夹到范围内。动态背景、头像与 settings.section 机制保留。

console 尾层保留自身石墨风格，撤基座新增窗框、磨砂与间隙。

## 部署

`tools/deploy-materials.mjs` 先核验所有皮肤旧文件与插件 hash，备份后原子替换 39 份 CSS 与客户端/包元数据，不重建任何资产，不调用切肤或头像接口，不重启服务。

首次部署备份：`~/.dsh/backups/materials-20261104-005117`。部署时激活 `zzz-eridu-35`，39 份头像 hash 均保持原值。

## 验收

隔离 headless Chrome（独立 profile / 9347）验证真实运行页面，用户现有窗口不点击、不刷新、不切换前台。

- `node tools/verify-materials.mjs <isolated-target-id>`：真实打开宿主设置 → 皮肤中心 → 界面材质，三项带 label 的 range 用真实键盘 End 调到 0.90 / 1 / 18px；body 变量与 localStorage 即时更新；整页刷新后数值保留；点击恢复默认返回 0.66 / 0.86 / 6px。运行期间无 JS 异常。
- 1440×900 暗 / 浅两档、820×900 窄屏截图通过；document scroll 尺寸等于 viewport，无页面溢出。浅档轨迹 / 视频页签补高特异性深字规则并复核。
- 暂停同一视频帧，对比 blur 0px / 18px 截图，已目视确认实际画面虚化变化，非只读 computed 值。默认视频 filter 为 `blur(6px) saturate(0.78)`；窗体底色实际 `.66`，圆角 22px，水印 `INTER-KNOT` 可见。
- 最终补丁与页面 CSS 请求返回 200。最终部署备份 `~/.dsh/backups/materials-20261104-011741`；激活 35 与全部 39 份头像 hash 保留。

产物：`Temp/v96-material-e2e.json`、`v96-final-dark.jpg`、`v96-final-light.jpg`、`v96-final-narrow.jpg`、`v96-material-defaults.jpg`、`v96-blur-0.jpg` / `v96-blur-18.jpg`。Temp 被 gitignore 排除，含会话凭据与私人会话截图，不推送、不发布。

console 额外完成独立浏览器样式回归：只在隔离 DOM 中切换真实样式资产并隐藏背景媒体，不 POST 全局激活接口；窗间距 0、圆角 0、中心底色 rgb(26,29,36)、伪元素 none，无页面溢出，随后恢复 35。截图 `Temp/v96-console-regression.jpg`。空态 hero 独立浏览器回归未执行。
