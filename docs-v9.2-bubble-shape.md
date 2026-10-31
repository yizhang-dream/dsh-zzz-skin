# v9.2 气泡形状对齐参考站（2026-10-31）

用户裁定：参考 zenless.tools 聊天生成器（`/zh/chat-generator`）设计对话框形状。
v2 追加裁定「形状不一样，请仔细在意细节」：补齐了参考站的外上角小旗箭头。

## 参考站实测

`.chat-item-message-wrapper`（短信块）：

| 项 | 值 |
| --- | --- |
| 圆角 | `0.9375em` = **15px，四角统一**（computed 与像素双向核实） |
| 小旗箭头 | **wrapper 的兄弟 DIV**（wrapper 自身 computed 全无痕迹）： |
| | `<div style="background-image:url(/images/chat_message_arrow_{left,right}.webp); position:absolute; width:.75em; height:.75em; top:.125em; left:-.4375em">`（右侧镜像 `right:-.34375em`） |
| | 素材 16×16 纯白带 alpha 小旗，显示 12×12、左出 7px / 右出 5.5px、顶 2px |
| 尾巴以外的描边/阴影 | 无 |
| 左侧（NPC/AI 位） | 纯白底黑字；右侧（玩家位）`rgb(44,88,226)` 蓝底黑字 |
| padding | `0.3125em 0.75em`，行高 1.2 |

像素复核（蓝泡，CSS px）：y0 左入 13 / 右入 13（对称），y3 4/5，y8 1/1，
y17 0/0——与 15px 圆弧吻合，两端对称。

## 改动（patches.css §13）

- AI 泡：`border-radius: 2px 24px 24px 24px` → **`15px`**（退役左上尖角镜像方案）
- 用户泡：`border-radius: 26px 2px 26px 26px` → **`15px`**（退役右上尖角）
- **§13.1a AI 泡左上小旗**：行级 `::after`，mask 白模素材（`bubble-arrow-left.webp`）
  + 填色跟气泡本体（两档各自变色）；12×12、left:-7px、top:2px（参考站原值）
- **§13.2b 用户泡右上小旗**：气泡级 `::after` 直铺预上色
  `bubble-arrow-right-blue.webp`（rgb(52,81,211)）；right:-5.5px、top:2px
- 保留不动：fit-content / max 74ch / 漫画硬影 / 配色跟档位走

部署：patches.css + 3 个箭头 webp scp 到 38 个 zzz-* 目录；
build-skins.mjs 资产清单同步（avatar-agent + 左右箭头）。

## 验收

- computed：两档 AI 泡与用户泡 `border-radius: 15px`（reload ignoreCache 后读）。
- 像素（暗档用户泡，物理 px）：y0 左入 12/右入 13、y3 5/6、y7 2/2、y14+ 0——
  弧线平滑、左右对称、无尖角无尾。
- 目检（多模态）：两档可见各角全部统一圆角无尾巴，与参考站形状语言协调；
  圆形白描边头像与 15px 圆角相处无穿角错位。

## 坑

- **参考站的形状细节藏在兄弟节点里**：wrapper 的 computed（圆角/伪元素/mask/
  clip-path）全查不到尾巴——它是 `.chat-generator-item` 下的一个 inline-style
  DIV。逆向第三方 UI 别只看目标元素的 computed，要扫父节点的 children。
- **该宿主上「伪元素 + mask」组合渲染不出来**（输入消息行）：computed 全对、
  同 URL 隔离注入正常、品红无 mask 也落墨——唯独 mask+伪元素不画；AI 行的
  ::after+mask 却正常。结论：输入行伪元素用**预上色图直铺**（无 mask）。
  行级伪元素（::before/::after 挂 .EvIC1a_flowItem 上）在该宿主全程不落墨。
- **fm-widget 浮窗**（feiyu-mood 插件，fixed z-index 99990，180×180）常停
  视口右下，正好盖住最后一条用户泡的右上角——验证用户泡要挑不在它下面的。
- **切档要在 reload 之后**：`data-ds-dark-theme` 是 React 管的 body 属性，
  先 toggle 再 reload 会被应用状态打回去；顺序必须是 reload → toggle → 截图。
- **assistant-step 锚点尺寸不稳定**：有的会话首锚点是 1900px 级的回合容器、
  有的是 57px 单行；按高度过滤（30–400px）再选，别默认 rows[0]。
- `getComputedStyle(el,'::before')` 对真实 AI 行仍不可信（返回宿主回退值），
  判断头像是否在只能看截图；只有注入的探针元素能读到真值。
- 截图验收前先把 rect 与快门放在同一 tick（Promise.all），滚动漂移会让
  写死的裁剪坐标整体错位 8-20px——本轮多轮「没画出来」其实是量错位。
