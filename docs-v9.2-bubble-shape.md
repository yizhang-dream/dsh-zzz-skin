# v9.2 气泡形状对齐参考站（2026-10-31）

用户裁定：参考 zenless.tools 聊天生成器（`/zh/chat-generator`）设计对话框形状。

## 参考站实测

`.chat-item-message-wrapper`（短信块）：

| 项 | 值 |
| --- | --- |
| 圆角 | `0.9375em` = **15px，四角统一**（computed 与像素双向核实） |
| 尾巴/描边/阴影 | 无（pseudo none、border 0、shadow none） |
| 左侧（NPC/AI 位） | 纯白底黑字 |
| 右侧（玩家位） | `rgb(44,88,226)` 蓝底黑字 |
| padding | `0.3125em 0.75em`，行高 1.2 |

像素复核（蓝泡，CSS px）：y0 左入 13 / 右入 13（对称），y3 4/5，y8 1/1，
y17 0/0——与 15px 圆弧吻合，两端对称无尾。

## 改动（patches.css §13）

- AI 泡：`border-radius: 2px 24px 24px 24px` → **`15px`**（退役左上尖角镜像方案）
- 用户泡：`border-radius: 26px 2px 26px 26px` → **`15px`**（退役右上尖角）
- 保留不动：fit-content / max 74ch / 漫画硬影 / 配色跟档位走（暗=深炭白字、
  亮=白底深字 / 用户 REPLY 蓝白字）——形状对齐参考站，语言仍是本皮肤的。

部署：patches.css scp 到 38 个 zzz-* 目录。

## 验收

- computed：两档 AI 泡与用户泡 `border-radius: 15px`（reload ignoreCache 后读）。
- 像素（暗档用户泡，物理 px）：y0 左入 12/右入 13、y3 5/6、y7 2/2、y14+ 0——
  弧线平滑、左右对称、无尖角无尾。
- 目检（多模态）：两档可见各角全部统一圆角无尾巴，与参考站形状语言协调；
  圆形白描边头像与 15px 圆角相处无穿角错位。

## 坑

- **切档要在 reload 之后**：`data-ds-dark-theme` 是 React 管的 body 属性，
  先 toggle 再 reload 会被应用状态打回去；顺序必须是 reload → toggle → 截图。
- **assistant-step 锚点尺寸不稳定**：有的会话首锚点是 1900px 级的回合容器、
  有的是 57px 单行；按高度过滤（30–400px）再选，别默认 rows[0]。
- `getComputedStyle(el,'::before')` 对真实 AI 行仍不可信（返回宿主回退值），
  判断头像是否在只能看截图；只有注入的探针元素能读到真值。
