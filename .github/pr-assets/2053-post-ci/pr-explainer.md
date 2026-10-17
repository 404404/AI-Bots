---
title: "群聊发送复核 · PR #2066"
subtitle: Human 纠正后的提交检查与完整评审路径
lang: zh
template: doc
theme: paper
PR: https://github.com/BotHarness/DeepSeekBot/pull/2066
base: 0b19f8871da0bb22669583c51350404af73d4ec4
evalBaseline: 73056fc59dcac42c3fd7e6cb1586f6c1c4e37157
head: f80e14fac927e08046bf46e2c6a33ddb1eb25944
generated: 2026-10-17
---
这份说明绑定上面的 PR head。真实模型评估绑定 runtime `90749c1e13068ed9e8f57ab629146b5bac17468f`；之后更新报告并合并主线界面与移动端变更。

随后 CI 发现 Human DM 提交后遗漏已发言标记，本次 head 已补回。Group 复核与模型运行器逻辑未变，最新真实 CLI 路径再次通过。固定 pilot 没有重跑，不冒充最新 head 的模型评估。Human 验收仍待完成。

## A 一次纠正如何改变发送
```timeline v
01 | 完整观察 | Host 记录实际交付的消息范围。
02 | 原子检查 | 检查与正式 append 在同一事务。
03 | held 或提交 | 依据已变化则保留草稿；仍有效则提交。
04 | 一次重交 | 阅读新增内容后修改、原文重交或 drop。
05 | 保守结束 | 再次变化、过期或重启时停止自动发送。
```
Human 把会议时间从 10:00 改成 11:00。旧通知先进入 held，Bot 阅读纠正后再提交。再次变化、过期或 Host 重启时，结束自动发送并保留待处理责任。

## B 哪个模块拥有事实
| 事实 | 所有者与边界 |
|---|---|
| 实际交付给模型的消息范围 | Host 内的 observation handle，绑定 Bot、Session、Group 和内容指纹 |
| 正式消息 | 原 Channel append 事务内检查后，写入 Source Event 与 placement |
| 未提交草稿 | GroupSendReview 的持久记录，保留原文、修改稿、观察依据和重交次数 |
| 权限与来源 | 现有成员、停用、Session owner 和 Source purge 检查独立执行 |
| Human 评审 | 离线历史页保存独立评分；揭盲后的改分保留首次记录 |

[观察与持久草稿实现](https://github.com/BotHarness/DeepSeekBot/blob/f80e14fac927e08046bf46e2c6a33ddb1eb25944/packages/core/src/channels/send-review.ts) · [原子提交接入](https://github.com/BotHarness/DeepSeekBot/blob/f80e14fac927e08046bf46e2c6a33ddb1eb25944/packages/core/src/runtime/bot-runtime.ts#L6085)

## C 本票的有意取舍
| 选择 | 代价或限制 |
|---|---|
| 每个 Group 显式启用 | 默认关闭；本票只验证本地 Group |
| 最多一次明确重交 | 忙群的持续恢复留给后续 slice |
| 最长十分钟；重启后停止自动发言 | 不承诺跨重启继续发送 |
| 无关新消息也可能 held | 需要真实 token 和延迟数据决定是否接受 |
| schema generation 96 | 关闭开关可回退行为；旧二进制不能直接打开新代数的 Profile |
| 费用按冻结价格估算 | 标题请求及未上报重试的 usage 未知，不能视为零 |

二进制回退需要升级前 Profile 备份或兼容迁移。评审重点是事务边界、owner 隔离、内容 purge 和 held 不产生正式消息。

## D 验证与 Human 决策
固定评估为四类场景各十对。B0 与 Bi 都是上面的 evalBaseline。两边使用 DeepSeek 官方直连、相同模型别名和 reasoning off。

| 验证层 | 已有证据与边界 |
|---|---|
| 机械回归 | 原子交错、权限、重启、过期和 purge 的直接工具测试通过 |
| 工程检查 | lint、format、typecheck、build 通过；CI 曾发现 DM 标记遗漏及两处过时测试契约，修复后结果见 PR |
| 真实路径 | 两个隔离 DSH Host；真实 CLI held→read→revise；Web 前后截图 |
| 模型评估 | 完整结果见补充 README 所链接的固定评估档案；不因超预算而改门槛 |
| 体验评审 | 全部 pair 双顺序盲评，再由助手核对引用；Human 先独立评分，再揭示判断与成本 |
| 尚未完成 | Human 验收、合并、部署；后续三个 slice 未开始 |

这是一份代码说明，不是运行证据或 Human 同意。请在完整历史页复评必看 pair，保存并导出接受、修改或拒绝及理由。


