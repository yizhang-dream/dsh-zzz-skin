# 原片背景与流式传输（2026-11-04）

用户指令：「改成不压缩的，应该不会占多少内存吧」。37 套 eridu 动态背景直接使用 Downloads/绝区零动态壁纸中的原始 MP4，停止 CRF 30 二次编码与强制 2560×1440 缩放。原片本身仍是来源提供的 H.264，不是裸帧视频。

## 改动

- `tools/build-skins.mjs`：逐字节复制原片，保留原始分辨率、帧率与媒体轨道；文件名 `bg-original-<sha256前12位>.mp4`，manifest 引用新文件名，避免旧视频的七天缓存。预览图仍单独生成。
- 插件 1.2.1：资产从 `readFileSync` 改为 `createReadStream`，支持 GET / HEAD、单段 Range（首段、尾段和开放区间）、206 / 416、Content-Length。连接关闭时销毁读取流。权限与路径边界沿用原逻辑。
- `tools/deploy-original-videos.mjs prepare|apply`：验证来源映射、分阶段上传、校验全部原片 SHA-256，备份后定点替换 manifest 与插件；不重建头像或 CSS，不写激活态。旧视频保留供旧缓存与回滚使用。
- 材质参数未修改。若用户仍设置 6px 模糊，原片仍会柔化；0px 可观察原始细节。

## 部署与验证

37 段原片总计 982,899,998 字节（约 983MB）；当前第 35 张为 29,989,429 字节，最大第 33 张为 156,807,797 字节。全部远端文件与本地来源 SHA-256 一致。

备份：`~/.dsh/backups/original-videos-20261104-015055`。37 个 manifest 与插件 index/package 可据其中 manifest.json 回滚；旧压缩版文件未覆盖。部署时激活仍为 zzz-eridu-35，39 份头像 hash 保留。

实际宿主没有自动热载源文件。通过真实后端 `POST /api/session/list` 查询 312 个可见会话，running=0 后执行 user service 重载；新进程 PID 386995，未操作用户窗口。

`tools/verify-original-videos.py <remote-stage>` 对真实运行中的 DSH 验证：

- 37 个视频 manifest 指向原片，HEAD 状态 200、Content-Length 与原片一致。
- 第 35 / 33 张分别验证首 64KiB、尾 512 字节、开放末段的 206 与真实字节；越界返回 416。
- 两段完整 HTTP 响应分别流式计算 SHA-256，与原片一致；ffmpeg 实际解码一帧无错误。
- 读取约 30MB 与 157MB 两段视频期间，20ms 间隔采样服务 VmRSS：624.93MiB → 峰值 635.06MiB，16 个样本，增量约 10.13MiB。仅代表本次服务端短时实测；浏览器内存未实测，不把此值当作浏览器或并发上限。

## 后端忙闲查询（避免操控前端）

使用当前登录 URL 在 3081 获取同 authority 的 cookie，再 POST `/api/session/list`，携带同源 Origin 与 JSON 请求：

```json
{"type":"client-request","rpcId":"eridu-original-busy","method":"session/list","payload":{"args":{"_request":{}}}}
```

返回 `envelope.result.value.items`，每个 SessionSummary 有 `running` 布尔值。该读取不恢复 Agent。验证脚本 `--busy` 只读；`--restart-if-idle` 必须成功读取且 running=0 才会重启，否则中止。token / cookie 不输出、不入库。

原片与 staging、完整验证 JSON 位于忽略的 Temp 或服务器数据目录，不把 1GB 视频推入源码仓库。
