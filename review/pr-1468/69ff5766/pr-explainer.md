---
title: PR 1468：工作失败通知与双列管理弹窗
subtitle: 当前为一个 Lark 管理私聊；多目的地由 1492 推进
lang: zh
template: sheet
cols: 2
PR: https://github.com/BotHarness/DeepSeekBot/pull/1468
base: de51af5c1bba97fa34ba58afe2b0f118366729a6
head: 69ff57667e6d7a6d17728807d1519d990c5ac710
generated: 2026-10-13
---

## A 用户能做什么

Human 在 Bot DM 侧栏打开「管理通知」。
工作失败通知默认关闭。启用后，通知发往当前授权的 Lark 管理私聊。
通知只含固定状态、执行角色、Session 和记录标识。

```callout warn 当前验收状态
真实 Lark 通知已获 Human 接受。新版弹窗仍待最终截图与交互反馈。
当前版本 CI 已通过。PR 保持 Draft，尚未合并或部署。
```

## B 弹窗如何组织

| 区域 | 内容 |
|---|---|
| 左列 | 管理目的地、工具审批状态、失败事件开关、测试按钮 |
| 右列 | 两类记录标签页、搜索排序、选中记录详情 |
| 说明 | 标题旁的 info 弹出提示 |
| 窄屏 | 两列堆叠，正文滚动，关闭按钮保持可见 |

1060px 弹窗复用 RBAC 的圆角、表格和原生按钮。
当前目的地显示 Lark DM，避免暗示其他平台已经可用。

## C 谁拥有失败与发送

```flow LR
Runtime -> Channel Store: 提交失败事实
Channel Store -> Messaging: 提交后通知
Messaging -> 管理目的地: 校验当前授权
管理目的地 -> qualified Provider: 核对私聊来源
qualified Provider -> Lark DM: 最终发送检查
```

Messaging 校验 Bot、Session 和执行角色归属。
稳定的 Bot／Channel／消息标识抑制重复通知。
通知不授予权限，也不触发模型执行。
[查看发送 owner](https://github.com/BotHarness/DeepSeekBot/blob/69ff57667e6d7a6d17728807d1519d990c5ac710/packages/core/src/messaging/failure-alerts.ts)。

## D 状态与恢复

| 状态 | 行为 |
|---|---|
| Provider 接受 | 保存回执；不代表 Human 已阅读 |
| 已知未发送 | 最多三次尝试，每次重查授权 |
| 结果未知 | 仅供检查，禁止重发 |
| 重启时 pending | 取消，不回放旧失败 |
| 重启时 sending | 标记结果未知，不回放 |

Generation 83 保存开关与投递元数据。
回退需要升级前备份或兼容写入器。
[查看 ADR-0176](https://github.com/BotHarness/DeepSeekBot/blob/69ff57667e6d7a6d17728807d1519d990c5ac710/docs/adr/0176-work-failure-alerts-use-committed-facts-and-management-route.md)。

## E 已验证与待补证据

当前版本通过 CI、64 项相关测试和完整构建。
文档构建生成 480 页。
实际 UI 已验证搜索、时间排序、记录详情和事件开关持久化。
390×420 检查确认正文滚动且没有横向溢出。

这些 UI 检查早于最后的表头缩短与主分支合入。
T3 截图连续超时，最终版本截图仍待补齐。
原生 Lark 验收使用 ad7c204a；新版 UI 不宣称重新验收了接收器。
QA1 接收器已停止，窗口已释放。

## F 多目的地如何推进

[1492](https://github.com/BotHarness/DeepSeekBot/issues/1492) 是后续计划。
首片先支持两个独立授权的 Lark 管理私聊。
每个目的地分别校验、记录状态和控制重试。
后续再按已有依赖扩展群会话、Slack 和 Discord。
平台消息投递能力与审批资格仍需分别核验。
