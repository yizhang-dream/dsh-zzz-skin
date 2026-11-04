# ZZZ 插件发布准备：1.4.0

本轮把 `plugins/dsh-eridu-skincenter` 从本机手工部署插件改成独立 DSH 安装包。技术包名保持 `dsh-eridu-skincenter`，界面名称为 ZZZ。此记录针对安装包准备；没有执行 npm publish 或创建公开版本。

## 安装包与资源

- 默认包含 ZZZ 静态主视觉主题、观测台主题、233 枚头像及运行代码。
- 包内资源直接只读加载，不要求先建立用户 skins 或 eridu-avatars 目录。
- 用户本地同名资源优先，原有皮肤、激活态和头像选择可继续读取。
- 37 段原片不放入 npm 包；通过随包导入脚本导入已经准备好的本地皮肤目录。不会再次转码。
- 不包含真实会话截图、开发缓存、登录凭据、个人选择或机器专用部署脚本。
- 软件 MIT 与游戏素材权利分开列在包内 LICENSE / NOTICE。

最终安装包：`release/dsh-eridu-skincenter-1.4.0.tgz`，1,826,035 字节；同目录 `SHA256SUMS` 提供校验值。

SHA-256：`a1548d2e0d3780a97baf93ebc0bf8b6fc8875a008803b49e277ff31312f77b5b`。

## 发布格式与兼容性

- `engines.node >=22`，`engines.dsh >=0.2.1-rc.2 <0.3.0`；宿主范围放顶层。
- 真实验证宿主：DSH 0.2.1-rc.2、Node 24.22.0。
- 共享 cordis / schemastery / client-runtime / client-ui-slots 声明为 peer 与 dev 依赖。
- 保留 DSH bundle patch 与 client inject 机制；无需运行源码构建工具、ffmpeg 或 postinstall 下载媒体。
- 导出 Schemastery Config：dataDir、skinsDir、avatarsDir；支持自定义目录，留空采用 DSH_HOME / ~/.dsh。

## 运行改造

每个服务端实例持有独立配置。路径使用 realpath + relative 检查，兼容 Windows 与 Linux，并阻止资源符号链接越界。目录只列本插件管理的 ID。

所有 API 先调用宿主 `connection.requestRejection`，再读取请求。匿名与跨站请求按宿主策略拒绝。HEAD、单段 Range、206 / 416 及流式读取保留。

默认头像只保存选择指针，通过资产路由解析；不再批量复制到全部皮肤目录，也不会改写安装包或其他皮肤。缓存版本包含所选文件身份，避免相同 mtime 导致换头像后命中旧图。

客户端启动、材质注入、观察器和异步请求移入 ctx.effect。停用时 abort 请求，清除自身背景、样式、链接和联系人装饰，恢复启用前材质变量；保留浏览器已保存选择。静态主题卡使用 img，视频卡才创建 video，观测台显示无会话内容的占位图。

## 安装和构建

使用已下载的本地包：

```bash
dsh plugin --profile web add ./dsh-eridu-skincenter-1.4.0.tgz
```

在仓库根目录生成安装包：

```bash
node -e "require('node:fs').mkdirSync('release',{recursive:true})"
npm pack ./plugins/dsh-eridu-skincenter --pack-destination ./release
```

随包脚本可验证资源完整性，以及导入可选本地资源。已有目标文件默认保留，只有显式 --replace 才允许覆盖；禁止目标子目录的符号链接写出，且从不删除用户额外文件。具体用法见插件 README。

## 已完成的真实验证

- Windows 上从源码构建实际 npm tarball；解包后在没有源码树的目录校验并复用 bundle。
- 包内 254 个资源文件的大小、哈希、CSS 资产引用、头像数量与 manifest 版本校验通过。
- 使用真实两套皮肤目录执行导入：19 文件写入成功；再次执行保留全部 19 文件。
- lab-ts 全新 DSH_HOME 与新 profile 安装实际 tarball，loopback 3096 独立启动；未复用生产会话或配置。
- 2 theme / 233 avatar、配置 schema 合法与非法值、匿名401 / 跨站403 / 登录200验证通过。
- 壁纸真实字节、HEAD、Range206、越界416及路径边界验证通过；只写选择指针，bundle 全树哈希不变。
- 禁用后重启、卸载后重启、重新安装均按预期恢复或撤销 API 与首屏注入。生产配置摘要保持一致。

独立无头浏览器真实集成验证 56 项通过、0 失败、0 运行时异常。静态主视觉实际加载为 1920×1080；两套主题均有有效 CSSOM 规则；头像图库为 62 / 76 / 95，共 233 枚。真实点击主题卡与默认头像应用成功，明暗切换及材质保持正确；无空图片地址或视频误请求。

停用配置触发 API 404，同一页面的时间原点与自设标记保持不变，背景、链接、ZZZ 设置入口和材质变量均已清理，确认这段证据没有用刷新代替原位清理。停用后刷新无皮肤且等待 3 秒未复活，再启用后刷新恢复 2 张主题卡和 233 枚头像；宿主 PID 保持不变。安装、更新或移除安装包后仍建议刷新已开页面，确保加载当前客户端代码。

限制：全新验证 profile 没有会话，因此联系人标记在停用前后均为零，本轮没有正向验证“已有联系人行在原位停用时被移除”。逐对话头像和壁纸的真实会话验证记录见 v1.3.1 文档，不将其冒充本轮空环境测试。

## 最终包确认与收尾

最终 a1548d2e 包重新安装到隔离宿主，匿名401、跨站403、登录后两套主题与233头像、壁纸HEAD及100字节Range206均通过。与浏览器已测候选逐文件比较，lib 与 scripts 代码哈希完全一致，仅 README、CHANGELOG 与资源清单生成时间变化。

源码提交 `706119d` 的 [GitHub Actions](https://github.com/yizhang-dream/dsh-zzz-skin/actions/runs/41818797501) 已实际完成：Node 22 / 24 两组资源构建、完整性校验、语法和 npm pack 内容检查全部通过。这些是打包检查，真实运行验证为前述独立宿主与浏览器集成验证。

独立无头浏览器、3096测试宿主与SSH隧道已停止，临时登录URL、token与cookie文件已删除，保留非敏感截图和记录。生产关键配置哈希保持一致，未替换现有部署。后续实际 npm 发布或创建发行版本尚未执行。

[公开安装说明](https://answers.xn--ltr42g543b.cn/2026-11-04-zzz-plugin-release.html) 已发布，线上200与答案目录登记均通过，页面标题、安装命令、最终包大小和SHA-256已核对。
