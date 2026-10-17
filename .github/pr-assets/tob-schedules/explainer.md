---
title: Tob 如何管理 Bot 的定时工作
subtitle: 复用既有调度 owner，审核后写入，并核对真实执行
lang: zh
template: sheet
theme: blueprint
cols: 2
pr: Draft 2123，关联 Issue 2093
base: a3e2c4e64d131191e686e33cb207d3db9b3a0937
product-head: 5ae3ed1f8dd966a64756bfb93dede338ad668cf1
generated: 2026-10-18 JST
---

Lead: Tob 可为选定 Bot 创建、修改和暂停定时任务。执行与历史仍由原 Schedule owner 负责。

## A 请求经过哪些边界

```flow LR
Human私聊 -> Tob: 明确请求
Tob -> 原生Shell: 调用CLI
原生Shell -> 受限broker: 临时能力
受限broker -> 既有审批: 准确目标与改动
既有审批 -> ScheduleOwner: 重验后写入
ScheduleOwner -> [(既有数据库)]: 任务与回执
```

这里没有新调度器或新模型工具。Shell 结束会撤销 broker 能力。来源仍须是受保护 Tob 的当前 Human 私聊。

## B 审核绑定什么

| 操作       | 必须观察的状态         | 审核后的约束                 |
| ---------- | ---------------------- | ---------------------------- |
| 创建       | Bot 身份与任务集合指纹 | 同标识、同输入核对原任务     |
| 修改与启停 | 准确任务的状态指纹     | 独立改动使旧请求过期         |
| 立即运行   | 准确任务的状态指纹     | 不确定时先查历史，不自动重试 |
| 删除       | 状态指纹及显式确认     | 同时删除该任务的历史         |

指纹包含可编辑状态，排除下次时间和触发历史。锁定任务只能单独审核解锁，不能夹带编辑或运行。

## C 创建如何避免重复

```sequence num
participants: CLI, broker, ScheduleOwner, 数据库
CLI -> broker: 稳定操作标识与完整输入
broker -> ScheduleOwner: 查找已有回执
ScheduleOwner -> 数据库: 核对输入指纹和任务ID
数据库 --> broker: 原任务或明确拒绝
note broker: 已有回执只读回，不再次创建
broker -> ScheduleOwner: 新请求经审核后提交
ScheduleOwner -> 数据库: 同事务写入任务与回执
```

原任务删除后保留回执，重放会拒绝。一次性任务过期后仍先核对原回执，再验证新建时刻。

[查看准确版本的重放分支](https://github.com/BotHarness/DeepSeekBot/blob/5ae3ed1f8dd966a64756bfb93dede338ad668cf1/packages/core/src/tob/cli-schedule-operations.ts#L239-L262)。

## D Schema 100 与恢复边界

```ts src=packages/core/src/database/schema-plan.ts lines=2348-2357

```

```callout warn 已升级 Profile 不能仅靠 Git revert 降级
旧版本会拒绝新的数据库代次。恢复需兼容的新版本，或升级前的备份。恢复前先保全升级后的状态，不删回执或降低代次标记。
```

这影响共享数据库的启动边界。审核重点是迁移、回执原子性、删除后重放和恢复方案。

## E 哪些证据已通过

| 证据                      | 状态              | 边界                                      |
| ------------------------- | ----------------- | ----------------------------------------- |
| 原管理回归                | ok 48 项          | 原产品版本                                |
| 启动、恢复与既有调度      | ok 30 项          | 当前版本，含 3 项新增回归                 |
| 根类型检查与构建          | ok 通过           | 最终代码                                  |
| 自然 Tob 创建、改名、暂停 | ok 通过           | 早于最后的过期重放修正                    |
| 真实 planned firing       | ok 通过           | Source Event、Session、发送与消息 ID 对应 |
| 同 Profile 重启读回       | ok 通过           | 已提交产品版本，停用状态与历史保留        |
| 原生旧事件恢复与新补跑    | ok 当前源码通过   | 保留历史红卡，新回复精确关联              |
| Human QA、CI              | warn 待父任务验证 | 本地测试不代替验收                        |

本地全套测试因共享资源压力中止，不能算通过。首次模型配额错误与证据脚本修正分别保留。

## F 原生启动发现了什么

原生前两次定时工作完成。重启补跑却早于凭据服务就绪，留下无 Session、无副作用的 retryable Source Event。失败历史与画面保留。

```flow LR
真实凭据Service就绪 -> CorePlugin: Cordis必需依赖
CorePlugin -> RuntimeRecovery: 既有恢复
RuntimeRecovery -> ScheduleOwner: 既有补跑
ScheduleOwner -> 模型路由检查: 缺key仍拒绝
```

源码回归覆盖延迟初始化、缺 key、安全旧事件恢复及再次重启去重。恢复与收集共用检查，拒绝有副作用、不确定、已删、已解决、暂缓及已暂停 Bot 的任务。当前源码已在原生恢复同一个旧 Source Event，并完成错过时间后的新补跑。新截图保留历史红卡，卡片后两条回复分别来自恢复与新触发。

## G 交互截图与后续审核

截图来自合成 Bot 与任务，展示启用、执行历史和重启后的暂停状态。它们不是 UI 改版对照。

[截图与双语验证记录](https://github.com/BotHarness/DeepSeekBot/tree/codex/2093-tob-schedules/.github/pr-screenshots/tob-schedules)。

本页是审核说明，不是运行证据或发布授权。Draft PR 为 #2123。最终提交将推送至同一 PR，full CI 与 Human QA 分别判断。
