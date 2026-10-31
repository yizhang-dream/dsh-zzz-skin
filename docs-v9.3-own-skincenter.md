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
