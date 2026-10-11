---
title: Group 行为权限：互斥与编辑拦截
subtitle: PR 1453 · 已接受真实 Lark 交互，等待合并审查
lang: zh
template: doc
base: e513ac414ab6c38ee95173377ebeb0950324d7dc
head: aefdf9a82d1f18ef162a9914253d39cdcd522c53
date: 2026-10-12
---
## A 用户可见变化

权限项可以声明同一 Bot 内的互斥项。成员同时获得两个互斥 Allow 时，编辑器显示人员、两项名称和来源组，并禁用保存。

| 配置 | 最终结果 |
| --- | --- |
| 同一个 ID，多个 Allow | 一项行为，保留全部来源 |
| 同一个 ID，Allow 与 Deny | Deny 生效 |
| 两个声明互斥的有效 Allow | 拒绝新配置 |
| 删除冲突来源或显式 Deny 一项 | 允许保存 |

自然语言仍是模型行为策略。此功能没有邮件、文件或 Shell 的强制隔离能力。

## B 权限决定在哪里发生

```flow TB
设置编辑器 -> 现有 API Gateway: 编辑提案
现有 API Gateway -> Messaging 事务: 当前 ID 和 revision
Messaging 事务 -> 最终状态检查: 空组及当前配对成员
最终状态检查 -> 拒绝: 不写入冲突配置
最终状态检查 -> Operational Database: 兼容时提交
Operational Database -> 发送者权限查询: 当前有效效果和来源
```

互斥关系双向保存，修改一个端点会更新两个端点的 revision。并发编辑需要当前 revision。

检查包含暂停 Binding 的保留配置，避免恢复后出现冲突。已撤销 Binding 的历史成员不恢复权限。

## C 配置元数据与有效行为

真实 QA 发现模型误把互斥 ID 理解为禁止当前 Allow。发送者查询现已省略配置用的 excludes，保留有效效果、文字、revision 和来源。

互斥声明只限制配置组合。它不会把一个合法 Allow 变成 Deny，也不授予管理或委派能力。主 Role 的约束仍适用。

[事务检查](https://github.com/BotHarness/DeepSeekBot/blob/aefdf9a82d1f18ef162a9914253d39cdcd522c53/packages/core/src/messaging/behavior-compatibility.ts) · [发送者查询](https://github.com/BotHarness/DeepSeekBot/blob/aefdf9a82d1f18ef162a9914253d39cdcd522c53/packages/core/src/messaging/sender-access.ts) · [ADR-0173](https://github.com/BotHarness/DeepSeekBot/blob/aefdf9a82d1f18ef162a9914253d39cdcd522c53/docs/adr/0173-group-behavior-items-resolve-by-id-with-explicit-deny.md)

## D 已验证与交付门槛

| 检查 | 状态 |
| --- | --- |
| 27 项聚焦测试 | ok 通过 |
| 精确 head 的完整 CI | ok 通过 |
| Standards 与 Spec 审查 | ok 发现已修复 |
| 真实 Lark 回复及重启 | ok 3127 / 3599 / 4087 |
| 桌面深浅色与 390px 对比截图 | ok 实际 Client |
| 本轮真人反馈 | ok 接受 |
| 合并与部署 | warn 尚未执行 |

QA1 接收器已停止，独占窗口已释放。真实 Source Event、已处理 Admission 和原生回复 receipt 已对齐。

中途出现原生 Client 空白及 Session 恢复报错。故障记录已保留，冷重启恢复不算根因修复。

## E 回退与评审重点

没有新表或 schema generation。旧写入器不理解互斥声明，因此回退前必须停止权限编辑，并保留兼容配置。

评审关注原子性、Deny 移除、组删除、Binding 范围及双端 revision。可选文本语义建议不在本片范围。

[PR #1453](https://github.com/BotHarness/DeepSeekBot/pull/1453) · [Issue #1423](https://github.com/BotHarness/DeepSeekBot/issues/1423)
