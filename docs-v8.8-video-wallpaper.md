# v8.8 动态壁纸（2026-10-30）

皮肤背景从静态插画换成《绝区零》动态壁纸。

## 做法

skin-center 的 `contributes.backgroundMedia` 支持 `type: "video"`（schema
`$defs.backgroundLayer` 的 enum 是 `["image","video"]`），客户端会插一个
`<video muted loop autoplay playsinline>` 铺满 background 装饰层，asset 走
`/api/skin-center/v2/skins/<id>/assets/...`，服务端 `.mp4` 的 mime 是 `video/mp4`
（lib/index.js 的 MIME 表）。所以不需要改皮肤中心，只改 manifest。

## 双档各一条

| 档 | 文件 | 来源 | 体积 |
| --- | --- | --- | --- |
| 暗 | `assets/video/wallpaper-zzz-dark.mp4` | 绝区零 12 号（深紫夜，双人） | 5.4 MB |
| 亮 | `assets/video/wallpaper-zzz-light.mp4` | 绝区零 16 号（白天街景，等距） | 0.7 MB |

暗档用暗色画面 + 原暗色 scrim；亮档用明亮画面 + 原纸白 scrim——白纸漫画设计
压在暗视频上，正文会看不清（实测亮档 + 暗视频时 hero 文案几乎不可读），所以
两档分别配图。

编码：`ffmpeg -an -vf scale=2560:1440 -c:v libx264 -crf 30 -pix_fmt yuv420p
-movflags +faststart`。平涂风格压缩率极高，5 秒素材压完 0.7 MB。

## 换壁纸

```bash
node tools/set-wallpaper.mjs              # 列出 37 张（来自 ~/Downloads/绝区零动态壁纸）
node tools/set-wallpaper.mjs 12           # 暗档换 12 号，亮档默认 16 号
node tools/set-wallpaper.mjs 24 --light 03
node tools/set-wallpaper.mjs --image      # 回退静态插画
```

脚本负责编码、改写 skin.json、scp 到 `lab-ts:~/.dsh/skins/zzz-zenless/`
（skin-center 热加载）。换完浏览器 Ctrl+Shift+R。

## 验收（真实 Chrome + CDP，tools/cdp.mjs）

- 暗档：`document.querySelector('video')` → `wallpaper-zzz-dark.mp4`，readyState 4，
  paused false；`currentTime` 1.2 秒内 5.457 → 6.659（确认在动、在循环）
- 亮档：去掉 `data-ds-dark-theme` 后 → `wallpaper-zzz-light.mp4`，同样在播
- 截图：暗档深紫画面 + UI 可读；亮档白天街景 + 纸白面板

## 注意

- 当前激活皮肤原本是 `zzz-zenless-sixth-street`（六分街变体），动态壁纸做在
  基座 `zzz-zenless` 上，所以把 active 切回了基座；想换回去在皮肤中心点一下即可。
- 皮肤中心的壁纸优先级：Wallpaper Engine > 用户手动壁纸 > 皮肤 backgroundMedia。
  本机没装 wallpaper-engine 插件，所以皮肤视频能直接显示。

## 补：皮肤中心卡片缩略图跟着换（同日）

`preview.dark/light` 原来指向静态插画 `wallpaper-zzz-keyart.jpg`，皮肤中心卡片
还显示静态图，与实机动态壁纸不一致。改为从两条视频各抽一帧（1280 宽，q3）：
`assets/preview-dark.jpg` / `assets/preview-light.jpg`。换壁纸时如果想让卡片也
跟着变，重抽一帧即可。
