---
title: PR 2024 · SDK 58 合并说明
lang: zh
---
## A 评审范围

SDK 58 原生客户端需要重建。已保存的数据继续使用原有格式。

```kv
PR: #2024
代码基线: 73056fc59dcac42c3fd7e6cb1586f6c1c4e37157
代码 head: 66b1bd978e540d7dad43e6c5d2f40604cb57e63f
生成日期: 2026-10-17
```

[完整改动](https://github.com/BotHarness/DeepSeekBot/compare/73056fc59dcac42c3fd7e6cb1586f6c1c4e37157...66b1bd978e540d7dad43e6c5d2f40604cb57e63f)

## B 为什么必须改同步写入

SDK 58 的 File.write 返回异步结果。原适配器需要立即提交并捕获写入失败。

```flow LR
设置操作 -> 原适配器: 原有同步契约
原适配器 -> File.writeSync: SDK 58
File.writeSync -> 原有文件: 不改变格式
File.writeSync --> 原适配器: 同步返回或抛出
```

缓存、Host 外观、折叠偏好、消息显示和统计共用此迁移方式。

[消息显示适配器](https://github.com/BotHarness/DeepSeekBot/blob/66b1bd978e540d7dad43e6c5d2f40604cb57e63f/apps/mobile/src/host/native-message-display.ts) · [持久化回归测试](https://github.com/BotHarness/DeepSeekBot/blob/66b1bd978e540d7dad43e6c5d2f40604cb57e63f/apps/mobile/test/native-persistence.test.ts)

## C Android 编译修复

中文权限文案移入 locale 的 ios 区域。Android 不再生成这些 iOS 专属资源。

真实 Expo locale 生成器测试先失败，再通过。Release 保留 lint、R8 和资源优化。

[locale 修复](https://github.com/BotHarness/DeepSeekBot/blob/66b1bd978e540d7dad43e6c5d2f40604cb57e63f/apps/mobile/locales/zh-Hans.json) · [生成器回归测试](https://github.com/BotHarness/DeepSeekBot/blob/66b1bd978e540d7dad43e6c5d2f40604cb57e63f/apps/mobile/test/localization.test.ts)

## D 证据与边界

| 检查 | 状态 |
| --- | --- |
| Android Debug 与 Release/R8 编译 | PASS |
| 手机原位升级、配对、真实回复、抽屉、键盘和重连 | PASS，仅 Debug |
| 本地移动端测试 | 511 passed / 8 skipped |
| 最终 head GitHub CI | 单独检查，不以本地测试替代 |
| Release 实机、iOS 原生、剩余权限和真实推送 | UNTESTED |

原生证据来自 aa4376587。最终 head 合入新 main，移动端和依赖文件相同。

Human 已授权先合并。合并不代表发布或未测项目通过。

回退需要恢复 SDK 57 代码并重建客户端。Host 与存储格式未变更。

[Android 完整验收](https://github.com/BotHarness/DeepSeekBot/pull/2024#issuecomment-6232251941)
