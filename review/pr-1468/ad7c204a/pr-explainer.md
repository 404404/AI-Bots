---
title: PR 1468：Bot 工作失败通知
subtitle: 复用私聊管理目的地；首片反馈与原生截图仍待完成
lang: zh
template: sheet
cols: 2
PR: https://github.com/BotHarness/DeepSeekBot/pull/1468
base: 8392828804c71fa54ad802128526f481769adc01
head: ad7c204acd344d24de337ada0ca5e7460853eaac
generated: 2026-10-12
---

## A 交付边界

默认关闭。Human 在 Bot DM 侧栏启用工作失败通知。
通知使用现有 Lark 私聊管理目的地。通知不授予审批权限。
原始失败仍保存在 Channel Store；通知只发送固定状态、执行角色和 Session 标识。

```callout warn 验收状态
本地失败与实际 Lark 消息 DOM 已验证。原生截图和首片反馈仍待完成。
PR 保持 Draft，未合并或部署。
```

## B 谁拥有失败与发送

```flow LR
Runtime -> Channel Store: 提交失败事实
Channel Store -> Messaging: 提交后通知
Messaging -> 现有管理目的地: 校验当前授权
现有管理目的地 -> checked Provider: 核对私聊来源
checked Provider -> Lark DM: 最终发送检查
```

Messaging 校验 Bot、Session 和执行角色的归属。
稳定的 Bot／Channel／消息标识抑制重复通知。
普通模型文本、工具错误文本和汇总计数不会产生通知。
[查看发送 owner](https://github.com/BotHarness/DeepSeekBot/blob/ad7c204acd344d24de337ada0ca5e7460853eaac/packages/core/src/messaging/failure-alerts.ts)。

## C 状态与恢复

| 状态 | 行为 |
|---|---|
| Provider 接受 | 记录回执；不代表 Human 已阅读 |
| 已知未发送 | 最多三次尝试，每次重新检查授权 |
| 结果未知 | 仅供检查，禁止重发 |
| 重启时 pending | 取消，不回放旧失败 |
| 重启时 sending | 记为结果未知，不回放 |

事件开关、路由、配对、App、Provider 和会话封锁都会参与发送检查。
Generation 83 只保存开关与发送元数据。回退需要兼容写入器或升级前备份。
[查看 ADR-0176](https://github.com/BotHarness/DeepSeekBot/blob/ad7c204acd344d24de337ada0ca5e7460853eaac/docs/adr/0176-work-failure-alerts-use-committed-facts-and-management-route.md)。

## D 验证与下一步

13 项失败通知测试通过，覆盖去重、撤销、真实超时、Provider 替换与重启。
75 项已有审批／侧栏测试与 33 项数据库测试通过。
类型、格式、lint、构建与 478 页文档构建通过。
本地 Web DM 回复 221；受控失败产生 Cancelled／0 次发送，恢复后新消息回复 2491。

完整 CI 已通过。QA1 已获独占窗口；测试通知和失败通知的文本与回执一致。
接收器现已停止。T3 截图连接再次中断；待补原生截图和取得首片反馈。
群目的地、其他平台、Host 离线监控和原生等待由已有票推进。
