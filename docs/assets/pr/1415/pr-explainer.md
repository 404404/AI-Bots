---
template: doc
theme: paper
lang: zh
title: "Slack 私聊普通配对 · PR #1436"
subtitle: 当前 App 的审核、重问与撤销
PR: https://github.com/BotHarness/DeepSeekBot/pull/1436
base: 184edf23b422a69b9f04bdfde29e35e40c88f3a0
head: 1710c42c3ce56e812bbd678633c2431ce87bfd24
generated: 2026-10-11T21:17:04.944Z
---

## A Slack 私聊普通配对已获接受

本轮将既有普通聊天配对扩展到 Slack 私聊。首次未知请求只生成申请；Web 批准后要求重新提问。只有新的有效消息才能启动模型。

| 门槛 | 状态 |
| --- | --- |
| 配对与共享配置回归 | ok 已通过；两项超时独立重跑通过 |
| lint、格式、类型与构建 | ok 已通过 |
| 完整 CI | ok 当前配对、共享向导与教程 head 已通过 |
| 原生 Slack 流程、截图与 Human 反馈 | ok 已通过，Human 已接受并授权合并 |

这页绑定上方 head，只解释实现。实际运行证据在 PR 中，部署另行安排。

[当前 head 的完整 CI 结果](https://github.com/BotHarness/DeepSeekBot/actions/runs/38174991769)。规范与需求审查均无发现。CodeRabbit 先前跳过 Draft，不计为代码审查。

## B 旧问题不会在批准后执行

~~~sequence num
Applicant -> Provider: 未配对的新 DM
Provider -> Messaging: checked 事件与当前 App 身份
Messaging -> Database: 仅保存申请元数据
Messaging -> Applicant: 固定等待审核提示
Reviewer -> Messaging: Web 选择现有 Role 并批准
Messaging -> Applicant: 请发送新的问题
Applicant -> Messaging: 新的有效 DM
Messaging -> Model: 规范 Source Event 与 Admission
Model -> Applicant: checked 原私聊回复
~~~

未审核的指令不保存为待执行消息。申请、批准通知与保留控制命令都不启动模型。撤销后，新消息也须重新审核。

## C 复用同一个权威和生命周期

~~~tree
Messaging owner
  chat-sender.ts | 判断支持的接收面与人员 namespace
  pairing.ts | 规范申请、Role 审核与通知状态
  sender-access.ts | 当前 Bot/App/Binding 与消息时间检查
  directory.ts | Bot 范围内的当前只读查询
  inbound.ts | 既有 Consumer、固定提示与新消息接收
  outbound.ts | checked 回复与设置快照
Operational Database | 唯一持久化权威
API Gateway / Client | 既有 Web 人员、角色与申请界面
~~~

没有新增 Provider 监听器、schema 或权限存储。Group 与个人例外沿用现有 resolver；角色文字仍是模型行为策略。

## D 可信人员与原会话必须匹配

~~~ts src=packages/core/src/messaging/chat-sender.ts lines=11-28
~~~

[查看此 head 的完整实现](https://github.com/BotHarness/DeepSeekBot/blob/1710c42c3ce56e812bbd678633c2431ce87bfd24/packages/core/src/messaging/chat-sender.ts)。ID 格式只是第一步；后续仍核对当前 Bot、Provider、App account、fingerprint 与 Binding。

复制的回复路由、错误 App 或替换 Binding 不会继承配对。目录不是完整平台成员名单；权限查询按当前规范记录解析。

## E 兼容性与回退需审查

既有 Bot 发送者限制现在覆盖 Lark 会话和 Slack 私聊，默认仍关闭。已开启限制的 Bot，需要先审核 Slack 人员的新申请。

回退到旧程序前，应停用依赖新限制的 Slack Binding。旧程序不能执行新增的 Slack 配对门槛。无需 schema 降级或数据库修复。

Slack 群配对和原生管理审批由独立任务推进。Web Human 保持默认完整权限；此页没有新增 DSH 原生 RBAC 或资源隔离。

## F 已完成的真实验收

复用 Human 指定的 BotHarness Slack QA。三步本机向导选择独立 QA 槽与 App/Workspace，隐藏输入两个 Token，再核对 Socket Mode、DM 权限、安装与 App Home。共享配置保留 Lark，可跨 worktree、branch 和 session 复用；向导不启动接收器。旧版 Lark 读写兼容性已验证。

登录正确 Workspace、完成配置并确认当前独占接收窗口后，才启动隔离 Host。已保存的时间戳不是持续接收许可。Token 只在机器本地，不进入 GitHub secrets。

| 步骤 | 可见结果与规范事实 |
| --- | --- |
| 创建普通 Role，开启限制 | Web 显示 Slack 私聊范围 |
| 未配对人员发 DM | 固定提示、元数据申请；没有执行 Admission |
| Web 审核并批准 | 固定重新提问提示；旧指令不执行 |
| 人员发送新问题 | 原 App 在同一 DM 回复；核对 Source Event/Admission/Outbox |
| 撤销、重问、重启 | 新请求被拦；当前授权与时间边界保留 |
| Human 反馈 | 接受首轮交互后才扩大范围 |

QA2 的旧接收 Token 已撤销，恢复后的接收窗口由本任务独占。此前来源冲突的结果不计为通过。

恢复后，新消息 I 与 L 返回 9797 和 10403。两条可见回复均匹配规范 Source Event、Admission 和 Outbox。

Web 选择 Role 与批准按钮已实测。三个目录各返回一条记录，并说明覆盖范围。撤销与重启后，新消息只申请；旧指令没有执行。

Human 已接受这轮交互并授权合并。QA2 接收器已停止。本轮只验收普通 Slack 私聊；群配对和原生管理审批仍由后续票推进。

[中英文 Slack 教程](https://github.com/BotHarness/DeepSeekBot/blob/1710c42c3ce56e812bbd678633c2431ce87bfd24/docs/slack-connection.md)包含权限用途和实际流程截图。浅色、深色与窄屏对比使用独立的空配置，复用同一个本地端口。

[Issue 与 Agent claim](https://github.com/BotHarness/DeepSeekBot/issues/1415#issuecomment-6111271564) · [ADR-0174](https://github.com/BotHarness/DeepSeekBot/blob/1710c42c3ce56e812bbd678633c2431ce87bfd24/docs/adr/0174-slack-dm-chat-pairing-reuses-current-binding-authority.md)
