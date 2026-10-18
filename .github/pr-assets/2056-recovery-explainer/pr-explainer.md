---
template: doc
theme: paper
lang: zh
title: 群聊发送中断后，先确认结果再恢复
subtitle: PR 2156 固定版本评审；原生故障诊断通过，完整评估待完成
issue: https://github.com/BotHarness/DeepSeekBot/issues/2056
PR: https://github.com/BotHarness/DeepSeekBot/pull/2156
base: 810ae5398deda703b9c2840dbdf0d29eb627c9ed
head: 9c61b4575041bcf1361e155eaf5d27fd5882b451
generated: 2026-10-18
---

## A 先判断有没有发出去

断线不等于发送失败。Host 已提交消息，却没有把结果交给 Bot 时，再发一次会造成重复。

本次实现保留提交回执。Bot 可以先查自己的草稿或回执，再读正式消息。未发出的草稿则要读取当前群消息后显式恢复。

```callout warn 验证边界
已有真实 CLI、Host 重启、界面和原生模型故障诊断。完整 40 组评估正在运行，尚未完成；此页不是验收或合并结论。
```

## B 同一个工具，三个明确动作

**查记录**：channel_send 使用 review_action=inspect，body 为空。返回自己可访问的草稿和回执；不发消息，不结清待办。

**恢复草稿**：recover 带上 draft_id、新 observation_id 和更新后的正文。重新检查权限、来源和最新事实后尝试提交。

**确认已有提交**：使用相同 draft_id 和相同发送内容。返回原消息 ID，不新增正式消息或 Inbox Admission。

没有草稿 ID 的不确定发送，也可通过 inspect 找到回执，再读取正式消息。新建一次发送不是查询旧结果。

## C 原有 owner 保持唯一权威

```flow
Bot -> channel_send: 显式 recover
channel_send -> GroupSendReview: 当前 owner、权限与来源检查
GroupSendReview -> Channel: 最新观察与授权通过
Channel -> 同一事务: 正式消息和提交回执
同一事务 -> 正式消息ID: 提交完成
```

回执沿用 group_send_review_drafts 的 JSON 记录。提交成功后只保留消息 ID、内容指纹和时间，清除复制的正文与观察内容。Channel 的 Source Event 仍是正文权威。

DSH 继续管理 Agent 和 Session。恢复不会复活旧 Tool Promise，也不创建新的 Session 管理器或调度器。

BotHarness 现在声明必需的 credentials Service 依赖。Cordis 等待 Provider 就绪后启动 Consumer，避免恢复任务抢跑而误发凭据失败提示。

## D 旧观察不能授权新的发送

| 情况 | 行为 |
|---|---|
| Host 重启 | 待复核草稿保留；必须用重启后的新观察显式恢复 |
| Human 停止 Bot 或回合 | 待发草稿终止；区别于 Host 重启 |
| 过期、撤权、来源清除 | 拒绝恢复或回执读取 |
| 观察后出现更正 | 继续 held；旧答案不能提交 |
| 附件同大小改写 | 内容摘要变化；旧观察失效 |
| 另一 owner 或不同正文重放 | 拒绝；不能借用旧回执发送新内容 |

恢复保留原有期限和重试额度。#2055 的忙群策略独立交付；两项同时进入主分支时，还需验证组合行为。

## E 关键实现与代价

```ts src=packages/core/src/channels/send-review.ts lines=438-454
```

[查看固定版本的 GroupSendReview](https://github.com/BotHarness/DeepSeekBot/blob/9c61b4575041bcf1361e155eaf5d27fd5882b451/packages/core/src/channels/send-review.ts)

保留小回执增加存储，但能确认丢失响应后的真实结果。附件摘要增加本地 I/O，不增加模型调用；它是一次快照检查，不会锁住后续外部写入。

代码可回滚，已发布的消息不会因此撤回。回滚还会失去回执确认能力；无需数据库结构回滚。

## F 证据分别证明什么

| 证据 | 已有结果 | 尚不能证明 |
|---|---|---|
| 聚焦回归 | 恢复、回执、权限、附件与故障 fixture 检查通过 | 模型会正确选择工具 |
| 真实 CLI 重启 | 新观察恢复为 11:00 / B-204；重放同一 ID | 完整群聊体验与成本 |
| 实际 HTTP 响应丢失 | 正式消息和 Admission 计数不增加 | 原生模型如何处理不确定结果 |
| 实际界面前后对照 | 重启前后的正式历史可见 | 全场景验收 |
| 原生 DSH Session | 当前版本重启后先查草稿、读新消息，再发送 11:00 通知；无重复或启动失败提示 | 仅单次诊断，不能证明总体可靠性 |
| 原生结果丢失 | 69bad 版本查到原消息 ID，没有重发；相关发送代码与当前版本相同 | 不是当前版本的新一轮结果丢失测试 |
| 完整 CI | 当前 head 的全量检查与真实 Host smoke 通过 | CI 的真实模型场景跳过，不能替代会话评估 |
| 40 组评估 | 已登记并启动 | 成本、延迟与全场景验收未通过；不部署 |

前一次原生故障 fixture 没有命中实际 Tool 输出格式，两次尝试保留为不可比，费用不删除。旧版本重启曾误发凭据服务不可用提示，修复后的一次真实重启未再出现。后续评估由当前助手读取完整记录；不生成外部 judge 或 Human 评分。
