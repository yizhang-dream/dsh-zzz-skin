# v8.9 动态背景 + 37 张皮肤卡（2026-10-30）

皮肤背景换成《绝区零》动态视频，37 张各成一张皮肤卡，亮暗两档各自算纱罩。

## 机制

skin-center 的 `contributes.backgroundMedia` 支持 `type: "video"`
（schema `$defs.backgroundLayer` 的 enum 是 `["image","video"]`）。客户端见到
video 就插一个 `<video muted loop autoplay playsinline>` 铺满 background 装饰层，
asset 走 `/api/skin-center/v2/skins/<id>/assets/...`，服务端 `.mp4` 的 mime 是
`video/mp4`。整个改动只落在 manifest，插件没动。

## 命名

一律不出现 wallpaper 字样：皮肤 id 是 `zzz-eridu-01` … `zzz-eridu-37`，
卡片名 `新艾利都 · 01`，背景文件 `assets/video/bg.mp4`。基座皮肤的两个文件是
`assets/video/bg-dark.mp4` / `bg-light.mp4`，静态回退图改名 `assets/keyart.jpg`。

## 亮暗单独算

同一张画面在亮档和暗档的可用性完全不同，所以按壁纸实测平均亮度 L 分三档配纱罩：

| L | 暗档（压暗） | 亮档（压白） |
| --- | --- | --- |
| ≥ 150（亮壁纸） | 0.34 / 0.46 / 0.58 | 0.10 / 0.05 / 0.18 |
| 100–150（中亮） | 0.14 / 0.24 / 0.38 | 0.26 / 0.18 / 0.36 |
| < 100（暗壁纸） | 0.04 / 0.10 / 0.20 | 0.60 / 0.50 / 0.68 |

暗壁纸进亮档时压到 0.6 白纱——白纸漫画那套设计才立得住；亮壁纸进暗档时压到
0.34 暗纱，白字才不会糊在粉色高光上。两档实测截图都看过。

## 上架/下架

- **下架**：`zzz-zenless-welcome` / `-sixth-street` / `-hollow` / `-v13` /
  `-outer-ring` 五个版本主题变体，目录已从 lab-ts 删掉。
- **上架**：37 张 `zzz-eridu-NN`，加原有基座 `zzz-zenless` 与两个内置皮肤，
  皮肤中心现在 40 张卡。

## 工具

```bash
node tools/build-skins.mjs            # 37 张全量生成到 build/skins/（不进 git）
node tools/build-skins.mjs --deploy   # 生成 + 下架旧变体 + scp 到 lab-ts
node tools/set-background.mjs         # 只换基座皮肤的暗/亮两条
node tools/set-background.mjs 12      # 暗档换 12 号，亮档默认 16 号
node tools/set-background.mjs --image # 基座回退成静态插画
```

编码参数统一：`ffmpeg -an -vf scale=2560:1440 -c:v libx264 -crf 30 -pix_fmt
yuv420p -movflags +faststart`。37 条合计 124 MB，平涂画面压缩率很高。

## 验收（真实 Chrome + CDP）

- 目录接口 `/api/skin-center/v2/catalog` 返回 40 条：37 个 `zzz-eridu-*` +
  `zzz-zenless` + `blue-fantasy` + `claude-style`，五个旧变体已消失
- 应用 `zzz-eridu-31`（亮壁纸，L=195）暗档：video readyState 4、`currentTime`
  递增、深色纱罩下 UI 可读
- 应用 `zzz-eridu-37`（暗壁纸，L=76）亮档：白纱 0.6 下纸白面板立得住、正文可读
- 坑：Chrome 窗口最小化时 `document.hidden=true`，Chrome 会暂停背景视频，
  这时 `video.paused` 恒为 true，别误判成 autoplay 被拦——把窗口恢复前台再测

## v8.9.1 全屏 / 半屏都站得住

客户端的 `<video>` 带内联 `object-fit: cover`，窗口一窄就只截到画面中间一条，主体容易被切。
修法是只接管取景中心：skin.css §17 加

```css
[data-dsh-skin-layer="background"] video {
  object-position: var(--zzz-bg-pos, 50% 45%) !important;
}
```

`--zzz-bg-pos` 由 `build-skins.mjs` 逐张算：抽第 3 秒一帧缩到 96px 宽，按梯度能量加权
求质心，clamp 到 28–72% / 30–68%，写进该皮肤自己的 skin.css 末尾。基座皮肤亮暗两条
视频各算一次（暗 45%/54%、亮 48%/51%），分别挂在 `body` 与 `body:not([data-ds-dark-theme])` 上。

**特异性坑**：`body:not([data-ds-dark-theme])` 比 `body` 高一级，37 张皮肤如果只写 `body{}`，
亮档会被基座残留的那条规则盖掉——所以每张都补一条同值的高特异性规则。

验收（真实 Chrome + CDP，`tools/shot-size.mjs` 用 `Emulation.setDeviceMetricsOverride` 覆盖视口）：

- 1600×900 全屏：双人构图完整，侧栏/输入卡/hero 文案都可读
- 780×900 半屏：竖切后仍保住左侧人物全脸与右侧角色，输入卡可读
- 视频实测 readyState 4、`paused=false`、`currentTime` 递增

**另一个坑**：Chrome 窗口被遮挡或最小化时 `document.hidden=true`，Chrome 会暂停背景视频，
`readyState` 掉到 0、`paused` 恒 true。要验动态背景必须用
`--disable-background-media-suspend --disable-backgrounding-occluded-windows` 起一个专用实例，
否则截出来只有纱罩和底色。

## 只留动态皮肤

- 内置 `blue-fantasy`：皮肤中心包 `skins/blue-fantasy/` 整个删掉（目录指纹变化会自动失效缓存，
  不用重启）；备份在服务器 `/tmp/blue-fantasy.bak`。
- `claude-style` 是 `origin: delegated`，由宿主（dsh-web-app）委托给皮肤中心，插件
  `dsh-claude-style` 根本没装，删不掉，只能留着。
- 结果：皮肤中心 39 张 = 37 张 `zzz-eridu-NN` + 基座 `zzz-zenless` + `claude-style`。
