---
template: doc
theme: paper
lang: zh
title: 忙群复核有上限，中断恢复不重置额度
subtitle: PR 2124 最终整合；Human 已接受保留的 pilot 例外，等待最终 CI
issue: https://github.com/BotHarness/DeepSeekBot/issues/2055
PR: https://github.com/BotHarness/DeepSeekBot/pull/2124
base: 35c8737329d2844b32778be3ab85b876c4df05d4
head: 07fd6868c28dbcedf6109927aa07cbbc75fb952f
generated: 2026-10-18
---

## A 先读最新消息，再决定是否发

群里持续来消息时，Bot 的待发答案可能失效。首次变化会暂缓发送，最多再复核两次。正式历史只出现实际提交的答复。

```flow
群消息变化 -> held草稿: 暂不发送
held草稿 -> 两次复核: 读取当前事实
两次复核 -> 显式决定: 额度耗尽
显式决定 -> 放弃或延后: 答案不再需要或条件未满足
显式决定 -> 一次继续: 答案必要且已读完整
一次继续 -> 原子检查: 最新内容与权限仍一致
原子检查 -> 正式消息: 提交一次
```

显式继续只越过复核次数上限。它不能越过未读纠正、撤权、过期或内容清除。检查前又有变化，本次机会也会消耗。

## B 延后保留责任，恢复保留额度

放弃草稿不等于完成任务。Host 保护原始未完成事项；已读且处理完的旁话可以结清。延后复用既有 Inbox 调度。

Human 指定的等待时间和条件优先。无关消息提前唤醒 Bot 时，不应反复移动原定时间；回来后先读最新事实。

重启恢复必须显式携带新观察。Host 只在同一进程内比较观察序号，跨重启仍检查必读消息和当前内容。次数、版本、期限及已用继续机会都保留。

普通提交与显式继续共用原子回执。响应丢失后只确认同一消息 ID，不追加第二条，也不新增 Admission。

## C 验证与接受是不同事实

| 证据 | 结果 |
|---|---|
| 原正式评估 | 40 组、120 次尝试完整保留；忙群完成率 8/10，延后 token 为对照 1.479 倍 |
| 原安静对照 | p95 2.806 秒，对照 2.480 秒；未达到原预算 |
| 后续固定诊断 | 修复后的忙群及等待恢复均完成；对照失败或超时，不能据此声称成本达标 |
| 真实 DSH、CLI、UI 组合 | 新纠正被采用，丢失响应不重发，重启不补充 override 额度；实际历史只有一条通知 |
| 最终聚焦回归 | 首次 50/51；过期拒绝用例超时，原样单跑通过，保留首次失败 |
| 当前代码 | 发送、恢复、预算与注意力模块和真实验证版本相同；类型与文档检查通过 |

```callout info Human 的明确取舍
Human 接受两票保留的 pilot 例外，要求 CI 与组合回归通过后合并关闭。原始失败和未知用量继续保留，不改写为预算通过。不部署。
```

恢复票 #2156 已通过完整 CI 并合并。此票的最终 CI 独立记录在 PR；说明页不是测试结果或新的验收来源。

## D 后续优化与审阅入口

后续应减少重复读取和收尾调用，正确传递已有观察凭据，并改善“无法访问”和“不存在”的表述。失败调用及辅助调用的未知费用不能按零计算。

共享发送和 Inbox 路径影响范围较大。回滚本票不撤回已发消息；已合入的恢复机制仍按其权限和回执规则运行。

[Human 接受记录](https://github.com/BotHarness/DeepSeekBot/issues/2055#issuecomment-6246233349)

[完整正式评估与离线历史](https://github.com/BotHarness/DeepSeekBot/issues/2055#issuecomment-6244736121)

[实际组合对话、CLI 与界面证据](https://github.com/BotHarness/DeepSeekBot/issues/2056#issuecomment-6246159677)

[固定版本发送边界](https://github.com/BotHarness/DeepSeekBot/blob/07fd6868c28dbcedf6109927aa07cbbc75fb952f/packages/core/src/channels/send-review.ts)
