# 顺发入场动效提速（2026-10-27）

用户：「加快顺发的动效速度」。

「顺发」= 逐行/逐条的错峰入场（阶梯入场）。这套皮肤有四组顺发，行越多铺满越慢，
设置面板那种十几行的列表原来要 1.1 秒才全部落位。本次统一按 **约 0.58 倍** 提速，
只动入场节奏，状态驱动与循环动效（HDD 警报、S 评级、呼吸、扫描、壁纸漂移等）一概不碰。

## 改动明细

| 位置 | 项 | 修前 | 修后 |
|---|---|---|---|
| 设置面板 `[role=dialog] [class*="_row"]` | 单行时长 | 0.50s | **0.28s** |
| 同上 | 逐行步进 | 0.07s（→ 第 9 行起封顶 0.58s） | **0.04s（封顶 0.33s）** |
| 消息行 `[data-dsh-part=message-row]` | 单行时长 / 步进 / 封顶 | 340ms / 45ms / 225ms | **200ms / 24ms / 120ms** |
| 会话列表 `[role=treeitem]` | 单行时长 / 步进 / 封顶 | 300ms / 40ms / 220ms | **180ms / 24ms / 132ms** |
| 菜单 `[role=menu]` / `[role=menuitem]` | 容器 / 条目 / 步进 | 180ms / 220ms / 22ms | **110ms / 130ms / 13ms** |
| 会话切换 `zzz-cam-push` | 时长 / 延迟 | 320ms / 120ms | **190ms / 70ms** |
| 弹窗 `zzz-win-snap` | 时长 | 260ms | **160ms** |
| 遮罩 `zzz-overlay-in` | 时长 | 200ms | **130ms** |
| 用量卡 `[data-dsh-usage-foot-card]` | 时长 / 延迟 | 320ms / 180ms | **190ms / 110ms** |

没动的：启动 CRT 开机（560/600ms，一次性的品牌时刻）、reticle 聚焦环、dock-lift、
tear、swap-flash，以及全部 infinite/状态动画。

## 验证（真实 Chrome CDP 9333 → lab-ts DSH 3081，重载后读计算样式）

| 载体 | animation-name | 时长 | 延迟 |
|---|---|---|---|
| 消息行第 3 条 | `zzz-rise` | **0.2s** | **0.048s** |
| 账号菜单容器 | `zzz-slide-in` | **0.11s** | — |
| 菜单项 | `zzz-rise` | **0.13s** | — |
| 设置弹窗 | `zzz-win-snap` | **0.16s** | — |
| 设置面板行（17 个 `zzz-row-in`） | `zzz-row-in` | **0.28s** | 首行 0.01s，封顶 0.33s |

链路：真实 Chrome → lab-ts DSH → 账号菜单 → 设置弹窗（真交互打开），
读 `getComputedStyle().animationDuration/animationDelay` 与 `document` 里的实际动画名。

## 边界

- 只改时长数值，缓动曲线（`--zzz-ease-snap/pop/cam/crt`）不变，所以「手感」是一致的，只是更快。
- `prefers-reduced-motion` 下照旧全部停用。
- 若觉得过急，按表里任一档单独回调即可（四组互相独立）。

## 回滚

```
cd ~/.zcode/dsh-zzz-skin && git revert <本次提交>
```
