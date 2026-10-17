---
template: sheet
title: Tob 的跨 Bot Memory 只读委托
subtitle: 来源、目标、Session 与查询能力保持明确归属
lang: zh
cols: 2
source: 'PR #2128 · issue #2091 · code 302861d6707a4bfa6df0cbac0259d5e5ca041638 · base 320ab04cd0a4c7ed818fdee997108cfa0590595b · 2026-10-17T21:56:08.447102+00:00'
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

代码：[受限执行](https://github.com/BotHarness/DeepSeekBot/blob/302861d6707a4bfa6df0cbac0259d5e5ca041638/packages/core/src/tob/cli-shell.ts#L137)、[来源与目标范围](https://github.com/BotHarness/DeepSeekBot/blob/302861d6707a4bfa6df0cbac0259d5e5ca041638/packages/core/src/runtime/bot-runtime.ts#L3346)。

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

| 类别                                   | 状态                                                   |
| -------------------------------------- | ------------------------------------------------------ |
| 范围、安全、审核、调度与数据库集成回归 | 整合后 163 项通过，8 个测试文件                        |
| TypeScript 与构建                      | 整合后通过；产品构建为 3f，后续仅改验证脚本            |
| 修复后的 Web 模型与消息                | 已证明读取、拒写、原始 cat 拒绝、续接、归档目标与撤销  |
| Web Session 视图导航                   | 已见 Tob 所有的 Assignment 列表及原生 DSH Session 内容 |
| macOS 原生与 Human QA                  | 未执行，由父任务串行安排                               |
| Draft PR / CI full                     | #2128 已创建；完整 CI 已请求，结果待验                 |
| 合并和产品发布                         | 未执行                                                 |

已叠加 schedules 的 generation 100；Memory scope 为 generation 101。
这是向前迁移。调度分支的凭据启动修复尚待同步，并须验证相关风险。

本页解释代码提交 302861d67；后续证据提交只保存本页、截图与验证记录。
本页是审阅辅助，不是测试结果或 Human 批准。
