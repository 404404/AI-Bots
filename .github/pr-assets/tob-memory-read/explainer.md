---
template: sheet
title: Tob 的跨 Bot Memory 只读委托
subtitle: 来源、目标、Session 与查询能力保持明确归属
lang: zh
cols: 2
source: 'PR #2128 · issue #2091 · code 417c6fc509a1cfdb5730bb068308cc788add82cc · base 6a6cc80b8f8c06c3327e79df025e1be954e50eb0 · runtime 3f29dd4ae · 2026-10-18'
---

Human 请求比较选定 Bot 的 Memory。Tob 创建自己的 Assignment，并沿正常报告路径回答。

## A 谁拥有权限

```flow LR
Human私聊 -> Tob的CLI: 接受原始 Source Event
Tob的CLI -> 审核: 固定目标身份和操作键
审核 -> Tob的Assignment: 保留 Session Ownership
Tob的Assignment -> Memory查询: 仅选定目标和明确修订
Memory查询 -> Assignment报告: 来源和可用性
Assignment报告 -> Tob私聊: 审阅后回答
```

## B 受限执行

委托 Assignment 的 Shell 是 CLI Consumer。
它在进程内运行随产品交付的 CLI，只传入短期 broker 上下文。
它不启动操作系统 Shell，也不继承 Human 的管理 Host 凭据。

代码：[受限执行](https://github.com/BotHarness/DeepSeekBot/blob/417c6fc509a1cfdb5730bb068308cc788add82cc/packages/core/src/tob/cli-shell.ts#L137)、[来源与目标范围](https://github.com/BotHarness/DeepSeekBot/blob/417c6fc509a1cfdb5730bb068308cc788add82cc/packages/core/src/runtime/bot-runtime.ts#L3386)。

| 允许                          | 拒绝                              |
| ----------------------------- | --------------------------------- |
| 一个字面的 deepseekbot 命令   | cat、node、python、curl           |
| snapshot、file、history、diff | 写入和其他管理操作                |
| 正常 Assignment Report        | 文件工具、Subagent 和其他执行工具 |
| 目标、文件、完整 SHA 与分页   | 管道、重定向、命令替换和环境赋值  |

## C 耐久边界与拒绝

一个只读范围绑定 Assignment、原始 Human Source Event、目标 Bot 身份和操作回执。
目标身份在 Human 审核前固定，创建时再次比对。
每次读取都检查原来源、撤销状态、Assignment 生命周期、Workspace Grant 和目标生命周期。

同一操作键与相同参数返回原 Assignment。
占用中的 Continuity Key 拒绝再次创建；续接走正常 Request，保留原目标集合。
扩大目标需要新的授权 Assignment。

Memory 查询固定 Git 修订。后续工作树编辑不改变已固定的页。
结果明确标明 accepted、pending 或 needs-repair，以及 partial、nextOffset 和 unavailable。
读取文本和引用是数据，不能扩大权限。

## D 证据与交接

| 类别                       | 状态                                                     |
| -------------------------- | -------------------------------------------------------- |
| 原构建 3f 的源码回归       | 163 项、8 个文件与类型检查和构建通过                     |
| 新整合源码 417 的回归      | 155 项、10 个文件与类型检查和构建通过                    |
| Web 模型与消息             | 读取、拒写、原始 cat 拒绝、续接、归档目标与撤销通过      |
| 原构建的 macOS 行为        | 独立创建与同 Session 续接、目标拒绝、撤销通过            |
| macOS 收尾与截图           | Turn 14 completed；Human handled；Bot 与 Assignment idle |
| 新整合构建的运行验证       | 待主任务统一验证                                         |
| Human QA / 合并 / 产品发布 | 均未执行                                                 |

已叠加 schedules 的 generation 100；Memory scope 为 generation 101。
新整合源码包含凭据就绪与调度恢复修复。
源码检查不能代替新构建的运行验证。

## E 原生证据怎样收尾

初次 Assignment 已完成，但旧 driver 仍按目的文案等待。
修复后沿同一 Assignment 的正常生命周期继续。
撤销阶段成功，首次截图却早于 Human handled。

最终采集只等现有 Turn，不发新模型请求。
它确认 Turn completed、Human handled 和运行状态 idle。
界面稳定后才采集完整私聊与指定 Assignment。

三个 driver 问题及修复均保留在证据记录中。
本页解释代码 417；截图与模型证据对应原构建 3f。
随后资产提交不改变产品代码。本页不代表 Human 批准。
