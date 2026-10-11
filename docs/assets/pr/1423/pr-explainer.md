---
title: Group 行为权限项与同项冲突
subtitle: PR #1428 的首个真实交互切片
lang: zh
template: doc
cols: 2
PR: https://github.com/BotHarness/DeepSeekBot/pull/1428
base: e1a3f7ddd3a757b12857751d344de2c96b929b0b
head: 6978f4767b531b4ad1e9ed1b30ca0a1981cac188
date: 2026-10-12
---

## A 本次结果

```callout ok 真人已接受首片
Group 可引用共享的行为权限项。
人员详情显示去重结果、全部组来源和同项冲突。
首轮 Lark 交互已通过真人反馈。
```

每人仍有一个主 Role。行为项使用稳定 ID、名称、文字和 revision。
Group 记录 Allow 或 Deny 引用，不复制文字。

| 当前来源 | 生效结果 |
| --- | --- |
| A Allow + B Allow | 一项 Allow，保留两个来源 |
| A Allow + B Deny | 一项 Deny，显示同项冲突 |
| 移除 B 的成员关系 | A 的独立 Allow 保留 |

## B 写入与读取路径

```flow
设置界面 -> API Gateway: 已认证命令
API Gateway -> Messaging: senderAccess
Messaging -> [(Operational Database)]: revision 校验后写入
真实外部请求 -> 当前权限查询: 可信 Source Event
当前权限查询 -> Messaging: bridge_sender_permissions
Messaging -> 模型: 主 Role 与当前行为项
```

目录按 Bot 隔离。组成员属于当前 App Binding 的有效配对。
旧申请不会因权限变更而执行。
Host 管理能力与可委派范围继续独立校验。

## C 确定性规则来自代码

```ts src=packages/core/src/messaging/behavior-policy.ts lines=25-47
```

[查看精确 head 的代码](https://github.com/BotHarness/DeepSeekBot/blob/6978f4767b531b4ad1e9ed1b30ca0a1981cac188/packages/core/src/messaging/behavior-policy.ts#L25)。

任一来源 Deny 优先。同项 Allow 与 Deny 并存时标记冲突。
当前查询保留每个来源的名称、效果和 revision。

## D 设置与拒绝路径

1. 在行为权限页创建具名正向行为项。
2. 在宽版组编辑弹窗搜索并勾选共享项。
3. 加入有效配对人员，展开生效预览。
4. 修改为 Deny，保存后查看人员详情。
5. 移除 Deny 来源，再查当前权限。

编辑项须提交 expectedRevision。组写入须匹配所选项的当前 revision。
陈旧版本、跨 Bot 引用与仍被引用的删除会被拒绝。
预览为界面当前快照，Host 的当前查询仍是权威。

组弹窗分为管理、行为权限和成员三个标签。
右侧持续显示受影响人员。
名称只显示一次，Allow 与 Deny 列各显示 checkbox。
完整名称保留给屏幕阅读器；窄屏标签可换行。

预览采用 Channel sidebar 的折叠按钮和箭头。
来源逐行显示，正文使用紧凑间距。
弹窗标题与操作按钮固定，中间内容独立滚动。

## E 已执行验证与限制

| 验证 | 状态 |
| --- | --- |
| 聚焦行为测试 | ok 43 项通过 |
| 合入主分支后的交界回归 | ok 100 项通过 |
| 最终 UI 与样式回归 | ok 28 项通过 |
| 最终 Client Bundle 合约 | ok 5 项通过 |
| 审批、卡片与数据库回归 | ok 65 项通过 |
| 构建、类型、lint、格式与发布账本 | ok 通过 |
| 真实 Lark Allow → Deny → 恢复 | ok 真人接受 |
| Windows 默认并行全套 | warn 超时失败后中断 |
| 当前 head 的 Linux CI | warn 运行中，PR 上查看实时结果 |

三条新问题均读取当前权限，回复算术结果 1147、1517、1763。
Deny 时拒绝产品问答，移除来源后恢复问答。
三项 Admission、Outbox 与原生 Tool 记录相互对应。
[真人反馈与运行证据](https://github.com/BotHarness/DeepSeekBot/issues/1423#issuecomment-6110802624)。

模型未严格遵守最初的“两条 bullet”格式指令。
自然语言策略不保证资源隔离或任意文字的一致性。
声明互斥与语义建议尚未交付。

## F 升级与恢复

```callout warn Generation 81 升级前备份
旧 Host 无法读取升级后的 Profile 数据库。
回退需恢复升级前备份，或使用兼容的修复版本。
```

迁移新增 Messaging 行为项表。已有组默认没有行为项。
移除配对后重建，不继承旧组成员关系。
QA1 接收器已停，截图过程不连接 Lark。
本页是审查说明，运行证据与 CI 状态分别记录。
