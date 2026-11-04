# DSH 动态 UI 覆盖清单（2026-11-05）

盘点基线为1.5.3与当时已安装的宿主/客户端插件。本文保留源码入口、候选缺口及证据层级；后续1.5.4的修复与真实验收见[覆盖记录](docs-v9.9-dynamic-components.md)，不要把候选表读作新版本仍有这些问题。盘点没有读取用户会话内容或凭据。

## 0. 证据等级与来源

### 来源根

- 宿主安装根：`/home/cvgluser/apps/node-v24.22.0-linux-x64/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`
- 前端共享资产：`.../dsh-web-frontend/dist/assets/index-CN7NIWNw.js`、`index-BxpfOGf3.css`（UIKit primitives、dockkit、slots 运行时在此打包）
- 本地审查副本：`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/host-pane/`（未纳入构建，含各包 `client.js` 副本与提取脚本）
- 皮肤侧：`C:/Users/zyz/.zcode/dsh-zzz-skin/patches.css`、`skin.css`、`plugins/dsh-eridu-skincenter/lib/component-surfaces.css`

### 证据标注

| 标注 | 含义 |
| --- | --- |
| **源码级** | 从已安装 `lib/client.js` 或前端 CSS 资产读到的类名、属性、背景值、行号。不等于该节点在真实 DOM 中一定存在。 |
| **实际 DOM** | 主会话在真实隔离宿主中观察到的祖先链/计算样式。本文引用时单独注明。 |
| **未知** | 当前未触发、未取到真实 DOM，或源码未给出明确入口。 |

行号均为对应包 `lib/client.js` 中该 CSS 模块区的起始行；前端 CSS 为压缩单行，只给类名与资产名。

### 一个重要的源码级事实

当前安装宿主全部 JS 中只出现 `data-dsh-boot`、`data-dsh-automatic-focus` 两个 `data-dsh-*` 属性（`grep` 全包，源码级）。`patches.css` 中依赖 `data-dsh-surface`（125 条）、`data-dsh-part`（60 条）、`data-pane=`（63 条）、`data-dsh-frame`（12 条）的选择器在当前宿主上没有对应属性。实际可见样式主要来自 `role`、`data-slot`、`data-dockkit-*`、`data-sidebar-right-*`、`data-files-*`、`data-inspector-*` 与类后缀。

结论：新增覆盖不要依赖上述旧属性；也不能假设这些旧规则正在保护新组件。此项为源码级判断，未在本文件中对每个页面做 DOM 复核。

## 1. 按组件族的覆盖清单

| 组件族 / 触发入口 | 稳定 role / data / slot | 真实 CSS 模块锚点 | 来源（源码级） | 现有公共层 / 冲突 |
| --- | --- | --- | --- | --- |
| 设置外壳（左下设置） | `role="dialog"`、`aria-modal`、`[data-shortcut-modal="settings"]`、`data-modal-autofocus`；slots `settings.section`、`settings.header`、`settings.close`、`settings.nav` | `.VOzbGW_overlay`、`.VOzbGW_mask`、`.VOzbGW_panel`（`bg-layer-2`）、`.VOzbGW_nav` | settings-general `client.js:60` | 已覆盖：`body [role="dialog"]` 改材质、去装饰、16px 圆角。`.mask` 的 `backdrop-filter` 在对话框外，不影响内部 fixed 浮层。 |
| 设置·模型二级页 | slots `settings.models`、`settings.models.provider-card`、`settings.models.footer` | `.zGbnIq_editor`、`.zGbnIq_addCard`、`.zGbnIq_setupCard`（`bg-module-platform`）；`.zGbnIq_input`（`bg-layer-1`） | settings-models `client.js:58` | 对话框壳已材质化；页内表单卡仍是实底，默认按可读层次保留。 |
| 设置·通用/快捷键/会话日志/终端/搜索/子代理 | slots `settings.general.item`、`settings.shell`、`settings.web-search`、`settings.subagent`、`settings.session-log` | 无整页背景；仅行与输入控件 | settings-general `client.js:59`、session-log `client.js:54`、subagent `client.js:104`、web-search `client.js:87` | 自然继承，无需新增规则。 |
| 设置·插件 tab | slots `settings.plugins`、`settings.plugins.tab` | 无背景 | settings-plugins `client.js:10` | 自然继承。 |
| 设置·插件库存 | 无专属 data | `.qSYn7G_search input`、`.qSYn7G_cardIdentity`、`.qSYn7G_switcher`、`.qSYn7G_cardDetails`（`bg-module-platform`） | settings-plugin-inventory（单模块） | 卡片细节实底，低优先。 |
| 插件管理页 | `data-plugin-*`、`data-install-*`、`data-package-meta-error`、`data-window-drag`；slot `sidebar.panellist` | `.X_2TxG_page`（透明）；`.X_2TxG_guide`、`.X_2TxG_registryToggle`、`.X_2TxG_registry`、`.X_2TxG_installField input`（`bg-layer-1/2/3`） | plugin-manager `client.js:1913` | 整页不遮材质；表单卡/浮层实底，低优先。 |
| 插件市场页 | 无专属 data | 仅 `.facts code` 等小面 | plugin-market（单模块） | 无整页实底。 |
| 定时任务·任务管理页（左栏自动化任务，主区） | **`data-testid="task-manager-page"`**、`data-detail-tab="rule|records"`、`data-expanded`、`data-menu-field`；详情也可开在 `sidebar.right.pane.tab` | `.t-XoWW_page`、`.t-XoWW_detail`、`.t-XoWW_listPane`、`.t-XoWW_saveFooter`、`.t-XoWW_instruction`、`.t-XoWW_zoneSearch`、`.t-XoWW_detailNotice` 均 `background: var(--dsw-alias-bg-base)` | schedule `client.js:2433` | 未覆盖。真实 DOM（主会话）：`SECTION[data-testid="task-manager-page"]` 浅色 `rgb(238,235,226)` 整页实底。修复必须全局作用域，不能只限右侧 pane。 |
| 账号登录 / 首次引导 | `data-signed-out`、`data-desktop-onboarding`、`data-avatar-status`、`data-collapsed`；slot `settings.account` | `._44HXVa_overlay`、`.tQSFJa_onboardingOverlay` 均 `position:fixed;inset:0;background:var(--dsw-alias-bg-base)`；darwin 引导已 `background:0 0` | settings-account `client.js:1228`、`3433` | 须区分节点：账号overlay有原生模态dialog，能继承公共层；独立全屏gate保留可读底色，不将实底直接判为漏配。 |
| 账号菜单 / 通知 | `data-collapsed` | `.yHnPSG_trigger` 透明；`.zwW4-W_card` 用 `--dsw-specific-input-major` | settings-account `client.js:1752`、`1538` | 菜单/通知走 primitives 浮层，已有材质 token。 |
| 工作区选择 / 新建工作区 | `data-row-key`；slots `sidebar.workspaces`、`conversation.hero.workspace` | 无整页背景；`.bhn1Oq_search` 透明 | workspace `client.js:1740`、`2546`、`2719` | 自然继承；不作为缺口。 |
| 目录选择 | `data-modal-autofocus`；roles `navigation/list/listitem/alert` | `.ZuhsRW_loadingFloat` 仅小浮层 | directory-picker-browse `client.js:25` | 自然继承。 |
| 搜索 / 筛选 | 会话搜索包无客户端 UI（`dsh-experimental-session-search/lib` 只有 `index.js`）；篩选用各页 `data-*` | 定时任务 `.t-XoWW_zoneSearch`；插件库存 `.qSYn7G_search input` | 同上 | 无独立全局面板；输入框按公共 `input/select` 层。 |
| 上下文菜单 / 浮层（UIKit） | `role="menu|listbox|tooltip|dialog"`；primitives 无专属 data | Menu：`._surface_ri079_1` + `._material_ri079_21`（`--dsw-menu-surface-fill` + `--dsw-menu-backdrop-filter`）；Dialog：`._dialog_o6lrb_33`（`bg-layer-2`）+ `._mask_o6lrb_18`；Tooltip：`--dsw-alias-tooltip-bg` | `index-BxpfOGf3.css` | 菜单有皮肤 token（暗 0.94 / 浅 0.95），且 `patches.css` 的 `[role="menu"]`（暗 0.9 / 浅 0.97）另有一层覆盖。Dialog 有 `role=dialog` 时由现有材质接管。 |
| 会话工具卡 / 审批 / 提问 | `data-tool`、`data-state`、`data-approval-key`、`data-question-key`、`data-question-reply`；slots `tool.call.toolview`、`conversation.approval.detail` | AskQuestionCard `.fsXYAq_card`（`bg-base`）；ToolRow/SkillRow `.inspectButton`（`bg-base`，原生 999px）；提问 `.customBlock`（`bg-module-platform`） | tool `client.js:1257`、`1527`；approval `client.js:10`；user-questions `client.js:470`、`607`、`1404` | 会话窗体已是材质；卡内实底属内容层。`inspectButton` 原生就是胶囊，不按冲突处理。 |
| 右侧·文件 | 源码候选`data-files-root/body/state`；`data-files-row`未获真实DOM确认，不作修复锚点；slot `sidebar.right.pane.tab` | `.k-1LKG_root`、`.k-1LKG_header`、`.k-1LKG_body` 全透明 | sidebar-files `client.js:419` | 已覆盖：tabHost 外壳修好后自然透材质。 |
| 右侧·浏览器 | 无专属 data；kind `browser`，slot `sidebar.right.pane.tab` | `.SB_kFW_root`、`.SB_kFW_frame`（`bg-base`）；`.SB_kFW_address`（`bg-layer-1/2`） | sidebar-browser `client.js:60` | 未覆盖：root 与 iframe 外框整块实底；iframe 内部网页不可改。 |
| 右侧·终端 | `data-sidebar-terminal`；slots `sidebar.right.pane.tab`、`sidebar.right.tab.guide.entry` | `._UE8Aa_root`；`._UE8Aa_screen`、`.xterm .xterm-viewport`（`bg-base`，故意）；`._UE8Aa_status`、`._UE8Aa_error`（`--dsw-alias-bg-l2`） | terminal `client.terminal.js:13056` | 正文/ANSI 保持不透明；状态/错误条引用皮肤未定义的 `--dsw-alias-bg-l2`，落宿主默认值。 |
| 右侧·会话数据诊断 | `data-inspector-context`、`data-inspector-fold-space`；slot `sidebar.right.pane.tab` | `.GTtnTq_root`（透明）；`table th`、`.GTtnTq_objectBreadcrumbs`、`.GTtnTq_modeSelector`、`.GTtnTq_sticky`（`bg-module-platform`）；`.GTtnTq_typeFilterPanel`（`position:fixed`） | session-inspector `client.js:2160` | 根已透；三个 sticky 面是实底。`typeFilterPanel` 固定定位，不可给祖先加 `filter/transform/backdrop-filter`。 |
| 右侧·文档/图片/代码/Office/PDF 预览 | `data-pdf-preview`；各 body 无统一 data | `.HyIruq_frame`（`bg-base`）；`body:has([data-pdf-preview])` 用 `--dsw-alias-bg-document-preview`；`.lyqg2a_panel`、`.JqwYuG_panel`、`.frontmatter` 用 `bg-layer-1/2/3` | documentpreview `client.js:7778`–`227111` | 纸面/iframe 实底多为阅读语义，低优先；浮动缩放/查找面板可按浮层统一。 |
| 右侧·计划 / 交付 | `data-plan-card`、`data-changes-*`、`data-review-*`；slots `sidebar.right.pane.tab`、`tool.call.toolview` | Plan 无整页背景；交付 `.card`、`.output` 用 `bg-layer-1` | plan `client.js:25`；deliverables `client.js:471`、`1509` | 无整页漏材质。 |
| 底部面板 / 全屏共享 shell | `data-fullscreen`；无稳定 data | `.pI_x6G_frame`（皮肤已置透明，`patches.css:88`）；`.pI_x6G_bottomRow`（`bg-base`）；darwin `.pI_x6G_rightbarCol`（`bg-base`） | layout（单模块） | 主窗已透明；`bottomRow` 仍是整块实底，DevTools/NodeJS 诊断底部面板会命中。 |

## 2. 具体遗漏候选（最多 8 项）

1. **定时任务任务管理页（优先）**
   源码级证据：schedule `client.js:2433`，`.t-XoWW_page`/`_detail`/`_saveFooter`/`_instruction`/`_zoneSearch` 均 `background: var(--dsw-alias-bg-base)`。
   实际 DOM：主会话已确认 `SECTION[data-testid="task-manager-page"]` 浅色 `rgb(238,235,226)` 整页实底。
   现有锚点：`[data-testid="task-manager-page"]`；内部用现有 `[class*="_detail"]`、`[class*="_saveFooter"]`、`[class*="_instruction"]`、`[class*="_zoneSearch"]`。必须全局作用域。

2. **浏览器侧栏外框**
   源码级证据：sidebar-browser `client.js:60`，`.SB_kFW_root` 与 `.SB_kFW_frame` 均 `background: var(--dsw-alias-bg-base)`。
   源码结构锚点：`[data-sidebar-right-panel] div:has(> form):has(> [aria-busy])`；嵌入元素有`data-sidebar-browser-frame`。早先的`> iframe`直接子级推断不成立，正确结构见§4.5。只改外框，不碰iframe内文档。

3. **会话数据诊断 sticky 实底**
   源码级证据：session-inspector `client.js:2160`，`table th`、`.objectBreadcrumbs`、`.modeSelector`、`.sticky` 用 `--dsw-alias-bg-module-platform`（暗 `#151517` / 浅 `#fbf9f4`）。
   现有锚点：`[data-slot="sidebar.right.pane.tab"]` 内 `:is([class*="_table"] th, [class*="_objectBreadcrumbs"], [class*="_modeSelector"])`。不要动 `[class*="_typeFilterPanel"]` 的 `position:fixed`。

4. **底部共享面板 `.pI_x6G_bottomRow`**
   源码级证据：layout `.pI_x6G_bottomRow{background:var(--dsw-alias-bg-base)}`；主窗 `.pI_x6G_frame` 已被 `patches.css:88` 置透明。
   风险：NodeJS 诊断/DevTools 底栏、底部终端会遮住工作区材质。仅改外壳，底栏内编辑器/终端正文不动。

5. **账号登录 / 首次引导全屏实底**
   源码级证据：settings-account `client.js:1228` `._44HXVa_overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-base)}`；`client.js:3433` `.tQSFJa_onboardingOverlay` 同。
   须区分节点：账号overlay本身有模态dialog，继承公共层；独立全屏gate保留可读底色。不把账号页实底一概判为样式缺陷，也不据此阻塞已授权修复。

6. **终端状态/错误条 token 缺失**
   源码级证据：terminal `client.terminal.js:13056`，`._UE8Aa_status`、`._UE8Aa_error` 用 `--dsw-alias-bg-l2`；39 份已部署皮肤均未定义该 token。
   现有锚点：`[data-sidebar-terminal] [class*="_status"]`、`[class*="_error"]`。`._UE8Aa_screen` 与 `.xterm-viewport` 保持不透明。

7. **旧 `button` 胶囊覆盖小方控件**
   源码级证据：`patches.css:304 button{border-radius:999px}`，经皮肤前缀 `html[data-dsh-skin]` 后特异性 (0,1,2)，压过类选择器 (0,1,0)。命中示例：schedule `.t-XoWW_ruleIntervalArrow{border-radius:3px}`、`.nRqoaa_nav{8px}`、`.nRqoaa_cell{8px}`；chat `.eGxaPq_mark{8px}`。
   需真实 UI 复核是否已出现胶囊化；若修，恢复几何而不是全局取消胶囊。

8. **旧 `data-dsh-*` 选择器大面积失效（系统性风险）**
   源码级证据：`patches.css` 含 `data-dsh-surface` 125 条、`data-dsh-part` 60 条、`data-pane=` 63 条、`data-dsh-frame` 12 条；当前宿主全部 JS 只发 `data-dsh-boot` 与 `data-dsh-automatic-focus`。
   影响：不要把这些规则当作新组件的保护层；新覆盖使用现有 `role`、`data-slot`、`data-dockkit-*`、稳定 `data-testid` 与已存在的 `data-*`。

## 3. 明确不改 / 不默认判故障

- 设置 dialog 外壳、菜单/浮层、文件面板、计划页、工作区选择、目录选择、插件管理整页：已覆盖或自然继承，不新增规则。
- 设置模型页、插件管理、插件库存、提问卡、工具卡、交付卡中的 `bg-module-platform` / `bg-layer-1` 卡片：默认视为可读层次，不按“漏材质”处理；只有整页/整面板实底才优先。
- 终端 `._UE8Aa_screen`、`.xterm-viewport` 与 xterm 画布：保持不透明，不改 ANSI/语法色。
- 文档/PDF 预览的纸面实底：阅读语义，不默认改。
- 账号登录/首次引导是否透壁纸：产品取舍，未确认前不改。

## 4. 浏览器侧栏（kind `browser`）的正式打开入口

只读结论；不调用外部网页。

### 4.1 宿主/客户端 API

- 跨插件前台 API：`ctx.sidebarRight.openTab(kind, options)`。
  - `kind`：`"browser"`（`BROWSER_KIND`，sidebar-browser `client.js` 定义段）。
  - `options`：`params`（如 `{ url: "about:blank" }`）、`paneId`、`replaceTab`、`revealIfOpened`、`preferNewPane`。
  - 仅对有屏幕会话生效；无会话时由 `require()` 抛错。
- 从已捕获 pane 打开：`ctx.sidebarRight.openTabFromTarget("browser", target)`，`target` 来自 `ctx.sidebarRight.commandTarget(element)`。这是 `browser.new` 快捷键实际走的路径。
- 页内自身动作：`tab.actions.openTab("browser", { params: { url }, revealIfOpened: false })`。
- 浏览器类型注册：`ctx.sidebarRightTabs.register({ id: "@deepseek-ai/dsh-client-ui-sidebar-browser", kind: "browser", multiple: true, priority: "builtin", guide: [{ id: "new", commandId: "browser.new", order: 30, title: "浏览器" }] })`。

### 4.2 真实 UI 入口

- 开始页入口：`browserDefinition` 的 guide 项 `{ id: "new", commandId: "browser.new", order: 30, title: "浏览器" }`；入口 `onPick` 走 `tab.actions.openTab(kind, { replaceTab: true })`。
- 右侧栏 `+`（`[data-dockkit-add-tab]`）只在 `canAddTab(paneId)` 为真时渲染，而 `canAddTab` 的条件是 `guideIn(layout, paneId) === undefined`。当前 pane 已持有开始页（guide）时该条件为假，所以看不到 `+`；此时用开始页里的“浏览器”入口或快捷键。
- 快捷键 `browser.new`（源码默认键位）：
  - `desktop:macos` / `desktop:windows` / `desktop:linux`：`KeyT` + `primary` → `Cmd+T` / `Ctrl+T`。
  - `web:macos` / `web:windows`：`KeyT` + `primary` + `alt` → `Cmd+Alt+T` / `Ctrl+Alt+T`。
  - `web:linux` 未在默认键位表中出现，源码级未知。
  - `regions: ["page", "editable", "terminal"]`，`modals: []`（模态内不触发）。
- 处理函数先 `ctx.sidebarRight.commandTarget(element)` 解析目标；无目标返回 blocked（文案“请先打开一个会话”），否则调用 `openTabFromTarget("browser", target)`。
- 两者打开后默认是空地址起始态（文案“输入 HTTP(S) 地址开始浏览”），不发起外部网络请求。

### 4.3 后端路径与 `about:blank` 限制

- 没有后端/HTTP 打开路由：`dsh-client-ui-sidebar-browser/lib/index.js` 的宿主伴生实现是空 `apply(){}`；浏览器面板由客户端插件注册，桌面载体为 `globalThis.dshDesktop.browser`，Web 载体为 iframe。因此“由后端启动”当前不成立，只能走客户端 API 或真实 UI。
- 地址校验 `parseBrowserAddress`（sidebar-browser `client.js`）只接受 `http:`/`https:`，其他协议返回 `reason: "protocol"`。所以把 `about:blank` 填进地址栏会被拒绝；通过 `params: { url: "about:blank" }` 打开时也会经过同一校验，预期回落到空起始态。
- 实际核对建议：用真实 UI 的“浏览器”入口（空地址、无网络）或 API 不传 `params`；若必须验证 `about:blank` 字面地址，先记录它被 `protocol` 拒绝，不把它当作成功打开。不要在文档或测试里建议新增未落地的 data 属性。

### 4.4 非模态 `role="dialog"` portal 清单与公共层判别

源码级事实（`frontend.js` / 各包 `client.js`）：

| 实例 | 类锚点 | 打开方式 | role / aria | 源码 |
| --- | --- | --- | --- | --- |
| 消息“本轮用量”面板 | `.bRhRbq_panel`（stat_dialog） | `createPortal(..., document.body)`；触发按钮 `aria-haspopup="dialog"` | `role="dialog"`，无 `aria-modal`，无 `data-portal` | chat `client.js:336018` |
| 输入区统计 pill 面板 | `.bRhRbq_panel`（同上，复用一个模块） | `createPortal`；触发 `[data-composer-stat]` | 同上 | chat `client.js:365977` |
| 会话诊断类型筛选 | `.GTtnTq_typeFilterPanel`（`MenuSurface`） | `createPortal`；表格类型筛选按钮 | 同上 | session-inspector `client.js:114968` |
| Office 字体缺失提示 | `.JqwYuG_panel`（FontNotice） | `createPortal`；锚点 `[data-office-font-warning]` | 同上 | documentpreview `client.js:231574` |
| 定时任务日期/时钟选择 | `.ovHEHG_panel`（PickerPopover） | `createPortal`；任务编辑时间控件 | 同上 | schedule `client.js:134026` |
| 输入区上下文用量 | `.JObwrW_panel`（ContextMeter） | `createPortal`；输入区上下文 chip | 同上 | conversation `client.js:706771` |

- 上述 6 个组件（`bRhRbq` 对应 2 个触发实例）的 CSS 都是 `position: fixed`；均未设置 `animation`；其中 chat、schedule、conversation 三个原生带 `backdrop-filter: var(--dsw-menu-backdrop-filter)`，documentpreview 与 inspector 没有。
- 模态 `role="dialog"`（`aria-modal="true"`）的实例：primitives Dialog（portal 外层 `role="presentation"`，内层 `.dialog` 才有 `role="dialog" aria-modal="true"`）、图片 lightbox（portal 根自身）、设置外壳 `.VOzbGW_panel`、账号 `._44HXVa_overlay`。

`data-portal` / `aria-modal` 的落层：

- `data-portal` 只出现在 tooltip 气泡 `span[role="tooltip"]` 上（`"data-portal": h || void 0`），该 span 就是被 portal 到 `document.body` 的节点；CSS `._bubble_12mhf_1` 为 `position: fixed`。**没有任何 dialog 带 `data-portal`**。
- `aria-modal` 落在 dialog 元素本身：primitives Dialog 在 `.dialog` 层；图片 lightbox 在 portal 根 `div`；设置/账号在各自的 `role="dialog"` 元素上。不在 portal 包裹层与 mask 上。

判别可行性：

- `[role="dialog"][data-portal="true"]:not([aria-modal="true"])` 在当前宿主匹配 **0 个**，不能用来替代类名豁免。
- 可用的统一判别是 `[role="dialog"]:not([aria-modal="true"])`，源码级恰好匹配上述 6 个非模态浮层，且它们都由 `createPortal` 挂到 body、CSS 已 `position: fixed`。
- 采用该判别时的注意点：
  - 不要再强制 `position: fixed` 也可（现已全是 fixed），加了只是冗余。
  - 不要把 `backdrop-filter: none` 写成统一规则：3 个浮层原生依赖 `--dsw-menu-backdrop-filter`。若只想撤掉皮肤装饰，用 `background-image: none`，保留原生 blur。
  - `animation: none` 对这 6 个当前是 no-op（它们本身未设 animation）；可为未来入口保留，但属预防性。
  - 现有公共层 `:is([role="dialog"], [role="alertdialog"])` 的 `border-radius: 16px !important` 也会命中这些浮层；若新增非模态分支，应同时把圆角还给 `var(--dsw-radius-lg)`，否则原生圆角继续被 16px 覆盖。
  - 该判别会把未来任何非模态 `role="dialog"`（即便不 portal）一并纳入；当前宿主没有这种实例，源码级无 `role="alertdialog"`。

### 4.5 浏览器 root/frame 的实际 render 结构（源码级）

侧栏浏览器 `view/BrowserBody`（`dsh-client-ui-sidebar-browser/lib/client.js`）的 React 树与控制器追加节点：

1. `div.SB_kFW_root`（无 name/title/data；`flex-direction:column`，`background: var(--dsw-alias-bg-base)`）
2. `└ form.SB_kFW_toolbar`（`onSubmit`；无 name/title/data）
3. `　├ button.SB_kFW_tool` × N（后退/前进/刷新/外部打开/沙箱；有 `aria-label`、`title`，无 data）
4. `　└ div.SB_kFW_addressBox`
5. `　　├ input.SB_kFW_address`（未知地址时追加 `SB_kFW_addressUnknown`；只有 `aria-label`、`placeholder`，**无 name/title/data**）
6. `　　├ span.SB_kFW_addressChanged`（条件）与 `button[type=submit].SB_kFW_tool.SB_kFW_addressGo`
7. `├ div.SB_kFW_sandboxWarning[role="status"]` / `div.SB_kFW_failure[role="status|alert"]`（条件）
8. `└ div.SB_kFW_content[aria-busy]`
9. `　├ div#<viewportId>.SB_kFW_viewport[aria-label]`（React 空宿主；控制器把 frame 追加到这里）
10. `　│　├ Web: iframe.SB_kFW_frame[data-sidebar-browser-frame="iframe"]`（`src=target.url`、`title=target.title`、`referrerPolicy="no-referrer"`、可选 `sandbox`；无 name）
11. `　│　└ Desktop: webview.SB_kFW_webview[data-sidebar-browser-frame="webview"]`（`name=<lease>`、`partition`、`allowpopups`、`src="about:blank#<lease>"`）
12. `　└ section.SB_kFW_restore` / `div.SB_kFW_placeholder > div.SB_kFW_start`（条件）；`p.SB_kFW_limit`（条件）

稳定界定方式（不依赖 `SB_kFW` 哈希）：

- 外壳根：`[data-slot="sidebar.right.pane.tab"] div:has(> form):has(> [aria-busy])`；或 `div:has(> form):has(iframe[data-sidebar-browser-frame], webview[data-sidebar-browser-frame])`。
- frame 本体：`iframe[data-sidebar-browser-frame="iframe"]` / `webview[data-sidebar-browser-frame="webview"]`；只改元素背景/边框/圆角，不读写 iframe 文档。
- React 视图宿主：`div[aria-busy] > div[aria-label]`（直接子层）；工具栏取根下 `> form`；地址框取 `form [class*="_addressBox"]` / `form input[class*="_address"]`。
- 类后缀兜底：`[class*="_root"]`、`[class*="_toolbar"]`、`[class*="_content"]`、`[class*="_viewport"]`、`[class*="_frame"]`、`[class*="_webview"]`，均在上述结构作用域内使用。

启用状态：`@deepseek-ai/dsh-client-ui-sidebar-browser` 在 `dsh-web-app` 的依赖里存在（源码级），但当前隔离实例的开始页只有 3 个入口、没有“浏览器”，说明该 client 插件未注册成功或服务不可用。没有真实入口时不伪造页面；源码侧按上述结构适配即可，实际核对等入口出现或插件启用后再做。

## 5. 未知 / 未验证项

- Agent 预设、技能列表、计划审阅、交付审阅的真实二级 DOM：本轮只做源码级锚点，未逐页取 DOM。
- 定时任务详情在右侧栏（`sidebar.right.pane.tab`）与主区两种宿主下的实际 DOM 差异：主区已实测，右栏待复核。
- 浏览器面板在 Web iframe 与桌面 `webview` 两种载体下的实际根节点 class/data：源码级已知，未逐载体取 DOM。
- 账号登录/首次引导是否应透壁纸：未决策。
- `data-slot` 的完整 DOM 覆盖：主会话已在右栏链路上观察到，本轮未逐页枚举。

## 6. 变更纪律

- 本文是本次唯一新增文件；未改 README、公共 CSS、皮肤文件或其他记录。
- 未 commit、未部署、未改生产。
- 后续修复只使用现有锚点；不新增未落地的 data 属性，不把源码推断当真实 DOM 证明。
