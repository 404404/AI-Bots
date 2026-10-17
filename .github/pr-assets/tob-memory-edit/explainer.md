---
template: sheet
title: Tob 审核后修改指定 Bot 的记忆
subtitle: 现有 Memory owner 保存，Human 审核固定目标、差异和版本
lang: zh
cols: 2
source: 'PR #2132 · issue #2092 · source 1da04d06abc85417e3c4708e401709db6dede977 · base 5d44b7a6507d661415881808ab67e74275d54182 · 2026-10-18'
---

Human 可以让 Tob 修改指定 Bot 的人格或记忆。每次写入都要审核真实差异，Assignment 保持只读。

## A 写入经过谁

```flow TB
Human私聊 -> Tob的CLI: 指定 active Bot
Tob的CLI -> 审核: 固定身份、原文和差异
审核 -> 再检查: Human本次决定
再检查 -> MemoryOwner: 来源和版本仍一致
MemoryOwner -> Git提交: 保存或支持的恢复
Git提交 -> 可见记忆: 读回版本和内容
```

沿用现有保存、历史和恢复逻辑，不增加数据库迁移或第二套存储。
拒绝审批、过期版本、撤销来源和不可用目标都不会写入。

## B 审核固定什么

| 固定对象                    | 防止的问题               |
| --------------------------- | ------------------------ |
| Bot ID 与创建时间           | 同名或替换目标冒用旧审批 |
| 原文、完整差异、路径        | 审核后更换写入内容       |
| branch、HEAD、accepted HEAD | 覆盖并发提交或未接纳状态 |
| 仓库身份与干净状态          | 同 HEAD 下覆盖未提交工作 |
| 原始 Human 来源             | 失效来源继续行使权限     |

代码：[准备与重检](https://github.com/BotHarness/DeepSeekBot/blob/1da04d06abc85417e3c4708e401709db6dede977/packages/core/src/tob/cli-memory-operations.ts#L58)。

## C 自身编辑与失败边界

Tob 可以修改自己的记忆，但只能使用当前所属的 Orchestrator flight。
它必须已接纳当前分支和 HEAD，工作树也必须干净。
初始化尚未形成 accepted baseline 时拒绝自身编辑。

代码：[Memory owner 的 flight 校验](https://github.com/BotHarness/DeepSeekBot/blob/1da04d06abc85417e3c4708e401709db6dede977/packages/core/src/memory/accepted.ts#L1171)。

| 操作                      | 约束                                |
| ------------------------- | ----------------------------------- |
| 保存                      | expected HEAD 与稳定 edit ID        |
| 精确重试                  | 原结果仍是当前提交时，只读取回执    |
| 支持的恢复                | 单独审核，生成新提交，保留历史      |
| scoped restore 遇到 dirty | 明确拒绝，请 owner 先保存未完成工作 |
| Assignment                | 保留只读命令范围，不能代写          |

直接 Human 恢复仍保留现有备份能力。
SOUL.md 和 MEMORY.md 在新 Session 或下次 compaction 生效。
当前 Session 的 prefix 保持冻结。

## D 真实 Web 看到了什么

官方模型通过实际 CLI 提案完成四条路径。
每条路径检查真实工具调用、完成回合、Human 交付和 canonical 读回。

| 路径                    | 结果                                     |
| ----------------------- | ---------------------------------------- |
| 同意保存                | 文件显示 jasmine tea，产生新 revision    |
| 拒绝保存                | 内容和 HEAD 不变                         |
| 审核期间 Human 并发保存 | 旧审批返回 memory-conflict，保留并发内容 |
| 单独审核恢复            | 新提交恢复原文，历史仍保留               |
| 实际重启同一 Profile    | 原文与恢复后的 HEAD 仍一致               |

另一个 Bot 始终不变。
已完成卡片隐藏原输入，因此只补拍一条待审提案，随后拒绝。
[真实截图和证据边界](https://github.com/BotHarness/DeepSeekBot/blob/1da04d06abc85417e3c4708e401709db6dede977/.github/pr-assets/tob-memory-edit/web-evidence.md)。

## E 哪些检查已完成

| 层次                                         | 状态                                      |
| -------------------------------------------- | ----------------------------------------- |
| focused source                               | 初次 194/205；修复后 10/10 与 22/22 通过  |
| TypeScript、针对性 lint、parity 与 inventory | ok 旧 qualified source 已通过             |
| 产品 build                                   | ok 旧 build 已通过，产品内容与旧 Web 相同 |
| 独立 Human CLI 与官方模型 Web                | ok 已通过，保存首次失败                   |
| 上游启动凭据改动                             | warn CI 源检查已过，整合运行仍待验证      |
| 原生 macOS 本片行为                          | ok 旧 qualified bundle 完成全部路径及重启 |
| 完整 CI、整合运行、Human QA                  | warn 待完成                               |

当前 source 已同步上游三个旧 contract 测试修正。旧 Web 证据不证明启动修复的运行结果。
旧 build 为 74c591117，旧 Web source 为 e3ed175cc。
range-diff 确认本片三条产品及测试提交未变。
本页面只解释审阅内容，不代表 Human 批准合并。

首次完整 CI 的检查、构建和冒烟已通过；分片因旧 endpoint 清单漏项失败。
修正后产品源码不变，完整 CI 重新运行。

## F 原生 macOS 的证据边界

主任务在同一绝对 Profile 运行独立 CLI 和真实 Tob 的四条路径。
保存、拒绝、并发冲突和单独审核恢复均通过。
另一次真实启动完成 restart-read，内容与 HEAD 保持一致。
没有复制 Sessions；候选已停止，原 Desktop 已恢复。

运行产品仍是 build 74c591117，对应 qualified source e3ed175cc。
journey driver 是 db8073dab，restart driver 是 1da04d06a。
这些 driver 身份不等于新产品 build。
本片行为已有原生证据，上游启动修复仍待整合运行验证。
Human QA 尚未完成，也没有批准合并。
