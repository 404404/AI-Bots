---
title: 桌面整页缩放 S1 · PR 2273
subtitle: 可审阅的实现；原生验收仍开放
lang: zh
template: doc
base: adcdcf98dfaaea31458f522f931e3380dd8bd69d
head: dd2301ab949b3aa67210af0af1fbb58f8a010db1
date: 2026-10-19
---

## A 本片交付什么

[PR #2273](https://github.com/BotHarness/DeepSeekBot/pull/2273) 对应 [S1 #2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)。
它提供当前窗口缩放、本机默认值和恢复默认。
设置、快捷键和 CLI 共用一个 Client 状态所有者。
倍率采用 `1.2 ** level`，级别为 -8 至 8。

```callout warn 验收未完成
Draft PR 不代表 S1 完成。
普通前台恢复、原生按键和 Human QA 仍需验证。
S2、S3 与总 issue #2245 保持开放。
```

## B 谁持有状态

```flow LR
设置 -> WindowZoom: 当前窗口操作
快捷键注册表 -> WindowZoom: 一次命令
CLI -> Host转发: 明确 Client ID
Host转发 -> WindowZoom: 请求与预期版本
WindowZoom -> 本地文档: 先保存
WindowZoom -> 根节点缩放: 再应用
```

Host 只保留短期连接与待投递请求。
默认值和当前主窗口值只保存在桌面本地。
CLI 超时后先重读，不自动重放写入。

[状态所有者](https://github.com/BotHarness/DeepSeekBot/blob/dd2301ab949b3aa67210af0af1fbb58f8a010db1/packages/client/src/client/window-zoom.ts)
与 [定向转发](https://github.com/BotHarness/DeepSeekBot/blob/dd2301ab949b3aa67210af0af1fbb58f8a010db1/packages/core/src/window-zoom/control.ts) 是独立边界。

## C 默认字号冲突怎么处理

下游生成器验证主题版本和内容摘要。
它保留 MIT 许可证，生成一个独立副本。
Profile 使用该副本作为唯一主题 Provider。
整页缩放挂载时，只释放原有字号快捷键的 Fiber。
卸载时先撤销缩放命令，再恢复字号快捷键。
手动字号设置仍归原主题管理。

没有修改上游仓库或已安装的 ASAR。
当前组合限定 macOS 桌面 0.2.1-rc.2。
小键盘键码会被当前主进程协议拒绝。
S1 的恢复默认按钮与 CLI 可用，小键盘留给 S2。

## D webview 空白如何验收

可见性变化会重读并应用最后保存的缩放值。
这只能证明状态恢复，不能证明原生嵌入页已经绘制。

| 必须检查 | 通过条件 |
| --- | --- |
| 隐藏时创建或缩放 | 普通切回前台恢复完整画面 |
| 窗口尺寸 | 恢复前后保持不变 |
| 嵌入页面 | 身份、输入和导航状态保留 |
| 按键 | 一次按键只触发一次缩放 |
| 截图 | 完整窗口像素可见，不能只看裁剪图 |

不会自动刷新或重建 guest，也不会强制切全屏。
这项失败就阻止该桌面组合通过验收。

## E 证据与下一步

| 证据类别 | 本次状态 |
| --- | --- |
| lint、格式、TypeScript、构建 | 已通过 |
| 相关回归测试 | 初次 35 个；修复后相关 24 个通过 |
| 真实 CLI 到桌面 Client | 已验证 83/100/120/144% 与默认、重置 |
| 全量测试、远程 CI | 另行记录，本文不声明通过 |
| 原生截图 | 已捕获 83/100/120/144%，运行代码为 aeb70b4 |
| 普通 Cmd+= | 四种焦点位置待真实键盘对照 |
| 固定尺寸前台恢复 | 待补，阻塞验收 |
| 真正退出重启与 Human QA | 待补 |
| Windows/Linux | S3 待验证 |

当前自动化已定位到隔离窗口。后续复用同一个窗口和 Profile。
首次 CI 发现无 DOM 环境的挂载回归，本提交已修复；新 CI 待完成。
本地全量测试没有通过，不以单项重跑替代全量结果。
本说明不包含私人日志、登录地址或凭据。
