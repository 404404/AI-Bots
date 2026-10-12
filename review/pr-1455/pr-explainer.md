---
title: Lark 精确审批规则 · PR 1455
lang: zh
---

## A 当前交付状态

PR #1455 仍是 Draft。首片只处理 Lark 私聊中的精确匹配规则。

| 项目 | 状态 |
|---|---|
| 源码 | 9b495bf6705959c668f1f7cac5423f65e1af5760 |
| 基线 | [5134234e](https://github.com/BotHarness/DeepSeekBot/commit/5134234e18ffd41d566fd94a0ccd214534f92318)；Role UI 对照来自未改动的前一基线 65bfa22e |
| Provider | PR #24，[源码 cb7f02a](https://github.com/DoodleBears/dsh-im/commit/cb7f02a99046217db8e26fc203a4f5dfc3e2befc)，[基线 99df05b](https://github.com/DoodleBears/dsh-im/commit/99df05b7c2a14ebb6c122e4f22d655b6b9cbacc7) |
| 当前源码检查 | 类型、lint、格式、构建及 68 项相关测试通过 |
| 源码审查 | 规范与规格均无剩余发现 |
| 真实 Lark 与真人反馈 | 等待本轮 QA1 独占窗口；接收器未启动 |

生成日期：2026-10-12。此页面解释代码，不代替验收或发布许可。

## B 从一次批准到保存规则

```flow
初始卡片 -> 允许一次: 只批准当前调用
初始卡片 -> 范围预览: 另行检查保存规则能力
范围预览 -> 返回: 不创建规则
范围预览 -> 显式确认: 核对完整输入与具体范围
显式确认 -> 原生审批拥有者: 重查当前调用和审核人
原生审批拥有者 -> 同一规则存储: 提交决定后再检查并启用
```

确认绑定请求、审核人、私聊回执及已展示的随机标识。
预览不调用模型，也不生成可执行 Inbox 请求。
旧按钮、重复回调或改变后的输入不能另行创建授权。

## C 后续调用仍需当前权限

| 判断 | 规则行为 |
|---|---|
| Bot、执行角色、目录与 Grant 范围一致 | 继续检查完整工具名和输入 |
| 原配对仍拥有批准及保存规则能力 | 本次产生独立原生决定，执行前再次检查 |
| 另一个当前 Group 仍提供能力 | 移除单个来源不导致停用 |
| 明确 Deny、撤销配对或停用 App | 永久停用旧规则 |
| 恢复权限或重新配对 | 必须重新确认创建规则 |
| Web Human 创建的规则 | 沿用既有授权方式 |

保存规则不扩大原生、Workspace 或 Service 的授权。
自然语言行为说明本身不能授予管理能力。

## D 同一持久化与可见状态

Generation 82 在既有规则表增加可空的外部创建人字段。
旧 Web 规则保持兼容。升级前需备份；旧程序回退需要备份或兼容修复。

Web 和 Lark 都读取同一规则的范围、创建人及启用状态。
Web 撤销后会尝试更新已知卡片回执。
撤销后的清理只有固定停用文字，没有操作参数或审批按钮。

代码：[原生审批拥有者](https://github.com/BotHarness/DeepSeekBot/blob/9b495bf6705959c668f1f7cac5423f65e1af5760/packages/core/src/workspaces/tool-approval.ts)、[规则存储](https://github.com/BotHarness/DeepSeekBot/blob/9b495bf6705959c668f1f7cac5423f65e1af5760/packages/core/src/workspaces/tool-approval-rules.ts)、[ADR-0175](https://github.com/BotHarness/DeepSeekBot/blob/9b495bf6705959c668f1f7cac5423f65e1af5760/docs/adr/0175-external-tool-rules-retain-current-creator-authority.md)。

## E 验证范围和剩余门槛

| 验证 | 证据与限制 |
|---|---|
| 相关回归 | 68 项通过，覆盖确认、重复操作、取消、范围改变、撤销与重启 |
| Provider | 65 项卡片、运行时与控制器回归通过 |
| 文档 | 内容构建成功；Windows 总入口的 slides 启动另有既有问题 |
| 全量 Windows 测试 | 运行被终止，未通过；存在超时及临时目录清理失败 |
| 基线核对 | 未改动基线同样出现 6 项 telemetry 清理 EPERM |
| 真实 Web 模型 | 已通过私聊回复 323 |
| 真实 Lark | 待验收初始卡片、二次确认、匹配／不匹配调用及撤销状态 |

CI、实际平台验收、真人接受和合并是独立门槛。
首片反馈之后再扩展全部不透明工具的风险确认。
