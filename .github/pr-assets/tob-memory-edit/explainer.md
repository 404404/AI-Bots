---
template: sheet
title: Tob 审核后修改指定 Bot 的记忆
subtitle: 现有 Memory owner 保存，Human 审核固定目标、差异和版本
lang: zh
cols: 2
source: 'PR #2132 · issue #2092 · source 926bdf4fef76a7e935d93a57c97fcdc89fbb70a6 · base 417c6fc509a1cfdb5730bb068308cc788add82cc · 2026-10-18'
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

| 固定对象 | 防止的问题 |
| --- | --- |
| Bot ID 与创建时间 | 同名或替换目标冒用旧审批 |
| 原文、完整差异、路径 | 审核后更换写入内容 |
| branch、HEAD、accepted HEAD | 覆盖并发提交或未接纳状态 |
| 仓库身份与干净状态 | 同 HEAD 下覆盖未提交工作 |
| 原始 Human 来源 | 失效来源继续行使权限 |

代码：[准备与重检](https://github.com/BotHarness/DeepSeekBot/blob/926bdf4fef76a7e935d93a57c97fcdc89fbb70a6/packages/core/src/tob/cli-memory-operations.ts#L58)。

## C 自身编辑与失败边界

Tob 可以修改自己的记忆，但只能使用当前所属的 Orchestrator flight。
它必须已接纳当前分支和 HEAD，工作树也必须干净。
初始化尚未形成 accepted baseline 时拒绝自身编辑。

代码：[Memory owner 的 flight 校验](https://github.com/BotHarness/DeepSeekBot/blob/926bdf4fef76a7e935d93a57c97fcdc89fbb70a6/packages/core/src/memory/accepted.ts#L1171)。

| 操作 | 约束 |
| --- | --- |
| 保存 | expected HEAD 与稳定 edit ID |
| 精确重试 | 原结果仍是当前提交时，只读取回执 |
| 支持的恢复 | 单独审核，生成新提交，保留历史 |
| scoped restore 遇到 dirty | 明确拒绝，请 owner 先保存未完成工作 |
| Assignment | 保留只读命令范围，不能代写 |

直接 Human 恢复仍保留现有备份能力。
SOUL.md 和 MEMORY.md 在新 Session 或下次 compaction 生效。
当前 Session 的 prefix 保持冻结。

## D 真实 Web 看到了什么

官方模型通过实际 CLI 提案完成四条路径。
每条路径检查真实工具调用、完成回合、Human 交付和 canonical 读回。

| 路径 | 结果 |
| --- | --- |
| 同意保存 | 文件显示 jasmine tea，产生新 revision |
| 拒绝保存 | 内容和 HEAD 不变 |
| 审核期间 Human 并发保存 | 旧审批返回 memory-conflict，保留并发内容 |
| 单独审核恢复 | 新提交恢复原文，历史仍保留 |
| 实际重启同一 Profile | 原文与恢复后的 HEAD 仍一致 |

另一个 Bot 始终不变。
已完成卡片隐藏原输入，因此只补拍一条待审提案，随后拒绝。
[真实截图和证据边界](https://github.com/BotHarness/DeepSeekBot/blob/926bdf4fef76a7e935d93a57c97fcdc89fbb70a6/.github/pr-assets/tob-memory-edit/web-evidence.md)。

## E 哪些检查已完成

| 层次 | 状态 |
| --- | --- |
| focused source | 初次 194/205；修复后 10/10 与 22/22 通过 |
| TypeScript、针对性 lint、parity 与 inventory | ok 旧 qualified source 已通过 |
| 产品 build | ok 旧 build 已通过，产品内容与旧 Web 相同 |
| 独立 Human CLI 与官方模型 Web | ok 已通过，保存首次失败 |
| 新 base 的启动凭据改动 | warn 已 rebase，仍需集成检查 |
| 完整 CI、原生 macOS、Human QA | warn 待完成 |

当前 source 是新 base 上的代码，旧 Web 证据不证明上游启动修复通过。
旧 build 为 74c591117，旧 Web source 为 e3ed175cc。
range-diff 确认本片三条产品及测试提交未变。
本页面只解释审阅内容，不代表 Human 批准合并。
