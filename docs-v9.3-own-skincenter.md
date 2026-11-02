# v9.3 自研皮肤中心插件（2026-11-01，卸载第三方 skin-center）

用户裁定：卸载 dsh-skins（@linxin666/dsh-client-ui-skin-center），设计我们自己的
皮肤页面。第三方插件一身三职（API 路由 + 客户端注入 + 卡片 UI），直接卸载皮肤
全灭——所以先自建同职插件 `plugins/dsh-eridu-skincenter`，验证后再卸旧。

## 架构（全部自研，零依赖）

| 层 | 实现 |
| --- | --- |
| 服务端 | cordis 插件：`ctx.webServer.register` 六条路由 + `webserver/index-inject` 结构化行 + `tapIndex` 兜底 |
| 数据 | 皮肤目录沿用 `~/.dsh/skins/<id>/`；激活态 `~/.dsh/eridu-skins.json`（首跑从 skin-center-active.json 迁移）；头像素材库 `~/.dsh/eridu-avatars/`（233 webp + catalog） |
| CSS 变换 | 行级状态机：选择器前缀 `html[data-dsh-skin="<id>"]`（@media 递归、keyframes/font-face 跳过、顶层逗号分段）+ `url(assets/…)` → 根相对 API 路径（origin 无关，3080/3081 通吃）+ avatar-agent.webp 追加 `?v=mtime` 缓存戳 |
| 客户端 | vanilla module-loader bundle：背景装饰层（`[data-dsh-skin-layer=background]` video+scrim，MutationObserver 跟亮暗档）、免重载换肤（POST → 换 html 属性/两条 link href/重建背景层）、右缘「皮肤中心」入口签 + 全屏换装页 |
| 换装页 | 「// SKIN LAB」· 动态背景 38 卡（16:9 封面、hover 播视频、使用中贴纸、点击即换）/ 代理人头像三组网格（搜索、使用中标记、应用即换全部皮肤目录的头像文件） |

路由：`GET /api/eridu-skins/list`、`GET|POST /active`（same-origin 校验）、
`POST /avatar`（拷贝到全部皮肤目录）、`GET /avatar/list`、
`GET /avatar-img/<dir>/<file>`、`GET /skin/<id>/(stylesheet|patches|assets/*)`。

## 首屏注入（免闪白）

index-inject 行 `{kind:'html', placement:'head', html:<两条 link>}` + tapIndex
把 `<html` 盖成 `<html data-dsh-skin="id"`（tap 实测被调用，结构化行与 tap
双保险）。客户端启动后再自设一次 html 属性（自愈）。

## 卸载与迁移

1. `dsh plugin --profile web add ~/plugins/dsh-eridu-skincenter`（pnpm 链接本地目录）
2. 过渡期把 `~/.dsh/skin-center-active.json` 指到不存在的 id——旧插件静默
   （"not in catalog; serving stock look"），不与我们双注入。
3. 反向依赖检查（cordis.patch.yml / bundles 无引用）后
   `dsh plugin --profile web remove @linxin666/dsh-client-ui-skin-center`。

## 验收（真实 Chrome + CDP）

- 首屏：服务端 HTML 实测含 `<html data-dsh-skin="zzz-zenless"` + 两条
  /api/eridu-skins link；重载后 accent `#d4cf01`（patches §0 生效）、
  背景视频层挂载、入口签在位。
- 免重载换肤：点 zzz-eridu-12 卡 → html 属性/两条 link/背景视频全部即时切换。
- 换头像：页面选「艾莲」→ 应用 → 全部 38 目录文件更新 + patches css 以
  新缓存戳重载。终态还原：基座 + 铃。
- 旧 API `/api/skin-center/v2/*` 已随卸载消亡；`/api/eridu-skins/*` 健康。
- 目检：换装页双页签、38 卡封面全载、使用中贴纸、头像墙、搜索全部通过；
  右缘入口签开页隐藏/关页复现。

## 坑

- **`ctx.webServer` 需要 `export const inject = ['webServer']`**——不声明直接
  "cannot get property without inject"，插件整体 crash（旧插件 index.js 里
  `const inject = ["webServer"]` 同款）。
- **过渡期旧插件客户端会拆 html 属性**：它的 active 指向无效 id 时进入
  "stock look" 清场，把服务端盖好的 `data-dsh-skin` 属性移除——表现为
  「首屏 HTML 有属性、实机文档没有」。客户端自愈 + 尽快卸旧是正解。
- `curl /` 拿到的是鉴权壳，首屏验证必须从已登录页面内 `fetch('/')`。
- skin.css 的 `:root` 自引用变量（--zzz-accent: var(--zzz-accent)）是历史
  遗留，旧中心靠 deriveFallbacks 兜底；我们不走该路径，accent 实际由
  patches.css §0 的 body 级定义提供（#d4cf01），自引用行无行为影响。
- 头像素材库现在有两份：本地仓 `assets/avatars/`（真源）+ lab-ts
  `~/.dsh/eridu-avatars/`（服务端用）——以后加头像要同步两边。

## v9.3.1 修补（2026-11-02）：HARNESS「Failed to load plugins」

用户次日报 HARNESS 横幅 `invalid plugin, expect function or object with an
"apply" method, received undefined`——**皮肤一切照常**。根因：DSH 客户端把
`__ModuleLoader__.load({id, factory})` 的 **factory 返回值**当插件模块校验，
我们的 factory 只跑副作用不 return → 校验拿到 undefined → 横幅。皮肤没死
是因为副作用在校验之前就已执行——这也是昨天功能验收全绿却漏掉它的原因
（**副作用先跑、校验后炸的失败模式，功能验收不查控制台就看不见**）。

修法（对照 dsh-backend-restart 的客户端样板）：factory 头部建
`const module = { exports: {} }` + `Object.defineProperty(exports, Symbol.toStringTag,
{value:"Module"})`，尾部 `exports.apply = apply; return module.exports;`
（apply 空函数即可，副作用维持原位）。版本 bump 1.0.1。

验收（真 Chrome + CDP）：硬重载/普通导航/重启后首个加载三类共 4+ 次，
invalid-plugin 零复发；皮肤 attr/accent/背景视频/入口签全在位；线上组合包
实拉字节含新代码；本地与 lab-ts 文件 sha256 一致。

### v9.3.2 修补（2026-11-02 下午）：「换肤没变化」——资产与查询串双 404

用户在 SKIN LAB 换肤+换头像后「什么变化也没有」。服务端状态其实都写对了
（active=eridu-01、头像=菲欧妮），坏在两个叠加的服务端 404：

1. **serveAsset 少拼 assets/ 段**：调用方已剥 `assets/` 前缀再传 rel，
   函数却以皮肤根目录为 root 直接拼 → `video/bg.mp4` 解析成
   `skins/<id>/video/bg.mp4`（真身在 `assets/video/`）→ **整棵 assets 自
   上线起全 404**（视频、头像图、旗标箭头都没加载过，CSS 渐变兜底掩盖了
   缺失）。修：root 改 `resolve(SKINS_DIR, id, 'assets')`。
2. **路由正则不剥查询串**：客户端免重载换肤给 link 加 `?t=`、CSS 变换给
   头像 url 加 `?v=`，而 `req.url` 含查询串 → 正则 `$` 匹配失败 →
   **带参 URL 一律 404** → 每次换肤/换头像后两条 CSS 链接变空
   （CSSOM 0 规则），整个皮肤掉光，直到下次重载（首屏链接无参数才恢复）。
   修：`req.url.split('?')[0]` 再匹配（/skin 与 /avatar-img 两处）。

验收（真 Chrome + CDP）：带 `?t=`/`?v=` 的 CSS/资产 URL 全 200；
重载→换基座→换回 eridu-01 三态 CSSOM 都保持 399 规则、accent 在位、
视频 readyState 4 双向播放。真实会话页（新建会话+真实回复）目检：圆形
头像里是具体人物插画（菲欧妮）✓；洋红探针证实 AI 气泡旗标箭头在画
（12px 暗色尾巴压暗背景，对比≈1:1 故目检难辨——与旧插件时代同 CSS 同
观感，非回归）；视频经 A/B 像素采样确认按设计透出（面板 88% 底+纱罩下
的暗渗），旧插件背景层同为 z:-2 fixed（pnpm store 源码为证）。工具：
tools/verify-assets.mjs、tools/probe-arrow.mjs。

**教训两条：①「属性在位」≠「资产渲染」——昨天验收只查了 src 属性和
文件落盘，没查 CSSOM 规则数与资产请求状态码，两个 404 都从这里漏过；
②路由拿 req.url 匹配必须先剥查询串，这是 Node 裸 http 的经典坑。**

### 组合包缓存机制（排查时摸清）

- 客户端插件走组合 URL `/plugins/??<各插件>/client.js,…&rev=<hash>`，
  响应头 `cache-control: public, max-age=31536000, immutable`、无 etag。
- rev 链：单插件 rev = `framedHash("plugin-artifact", [mtimeMs, …])`
  （**touch 一下就会变**，与 package.json version 无关）；组合 rev =
  各 (id, rev) 的再哈希。HTML 无缓存头、每次 F5 都重取 → manifest 里
  带着最新组合 rev → **改文件后用户普通 F5 即自愈**，旧 immutable 条目
  自然烂在缓存里。排查工具：`tools/verify-pluginload.mjs`、
  `tools/probe-pluginload.mjs`（document-start 钩 factory 返回形状）。
