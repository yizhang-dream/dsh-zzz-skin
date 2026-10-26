# 思考行被撑成空壳（2026-10-27）

## 现象

用户报「这套系统现在有点不可用：只有纯文字输出能渲染，如果不是纯文字，它就渲染空壳」。

## 实测定位（真实 Chrome，CDP 9333，lab-ts DSH 3081）

在会话「新艾利都与待办查询测试」上逐层量几何，找到 36 个**有底色、有圆角、里面零内容**的行：

- 锚点：`["14:assistant-stepN:M","reasoning"]`（思考行）
- 尺寸：114×48（少数 114×24）
- 计算样式：`padding: 12px 22px 12px 92px`、`background: rgba(30,30,38,.93)`、`border-radius: 2px 24px 24px`
- 内部 `.hWmORq_root` 宽度 = **0px**

关掉皮肤两张样式表复测：同一行变成 `padding: 0`、宽度 1407、高度 0（宿主折叠态的原始值）。

## 根因

`§13.1` 的助手气泡规则用子串匹配：

```css
.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"] { … }
```

真正的助手回复锚点是 `14:assistant-step2:1`，而思考行的锚点是数组型
`["14:assistant-step2:1","reasoning"]` —— 同样含 `:assistant` 子串，于是被一并命中：

- 拿到 `padding-left: 92px`（给头像留的位）+ `padding-right: 22px`
- 拿到 `width: fit-content`
- 内部是 flex 容器，可收缩到 0，于是 fit-content 算出 0

结果：宽度只剩 92+22 = 114px 的内边距，高度只剩 12+12 = 24px。
**一个什么都没装的圆角框。**

## 修法

沿用 `§14` 头像规则里既有的排除写法，把 `§13.1` 亮暗两档共 7 条规则收窄：

```css
.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]:not([data-chat-anchor-key*="["])
```

数组型锚点一律以 `[` 开头，一条 `:not` 全部排除。

## 验证

| 项 | 修复前 | 修复后 |
|---|---|---|
| 空壳行（思考行高>4 且无文字） | 36 | **0** |
| 思考行几何 | 114×24~48，内宽 0 | 1407×24，内宽 1407 |
| 正常助手气泡（9 个） | padding 68px / 圆角 / 底色 | 完全一致 |
| 亮档 | — | 完全一致（白底 0.945） |

明暗两档都测。部署到 lab-ts 五个版本主题，md5 与 dist 一致后刷新页面复测。

## 未完成

- 这些思考行所在组的根节点 `O_Ebla_root` 计算样式是 `content-visibility: hidden`、
  高度 0，宿主自己就没画它们。所以**空壳在屏幕上的可见性我没能截到实证**：
  多次裁剪截图取到的都是同一区域下的助手消息，不是思考面板。
- 用户说的「非纯文字渲染空壳」如果指的是表格/代码块/工具卡，本次没复现到：
  实测表格（567×175，表头+数据齐）、行内代码（深底浅字）、工具行
  （「搜索会话 · 暗档消息条」）都正常。
- 需要用户指明空壳长在哪类区块上。

## 回滚

```
ssh lab-ts 'cd ~/.dsh/skins/zzz-zenless-welcome && cp patches.css.bak-pre-shellfix-20261027 patches.css'
```

五个版本主题目录下都有同名 `.bak-pre-shellfix-20261027` 备份。
