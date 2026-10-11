---
template: doc
theme: paper
lang: zh
title: Slack 私聊普通配对 · PR #1436
subtitle: 当前 App 的审核、重问与撤销
PR: https://github.com/BotHarness/DeepSeekBot/pull/1436
base: 73c75f86aa50767be34a5c8d2cadc17b6a3e8862
head: 960f32d82443359220cf6b6fea676bc423d7c305
generated: 2026-10-11T17:26:16.471Z
---

## A 实现可审查，真实 Slack 验收仍待完成

本轮将既有普通聊天配对扩展到 Slack 私聊。首次未知请求只生成申请；Web 批准后要求重新提问。只有新的有效消息才能启动模型。

| 门槛 | 状态 |
| --- | --- |
| 72 项配对回归与 10 项共享配置回归 | ok 已通过 |
| lint、格式、类型与构建 | ok 已通过 |
| 完整 CI | warn 新增向导 head 待 CI；前一配对 head 已通过 |
| 原生 Slack 流程、截图与 Human 反馈 | warn 未完成 |

这页绑定上方 head，只解释实现。它不证明原生 Slack 已通过验收，也不授予合并或部署许可。

[前一配对 head 的 CI 结果](https://github.com/BotHarness/DeepSeekBot/actions/runs/38157740601)。当前 head 新增共享 QA 向导，CI 仍待完成。CodeRabbit 对 Draft 跳过自动 review，因此其成功状态不代表完成代码审查。

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

[查看此 head 的完整实现](https://github.com/BotHarness/DeepSeekBot/blob/960f32d82443359220cf6b6fea676bc423d7c305/packages/core/src/messaging/chat-sender.ts)。ID 格式只是第一步；后续仍核对当前 Bot、Provider、App account、fingerprint 与 Binding。

复制的回复路由、错误 App 或替换 Binding 不会继承配对。目录不是完整平台成员名单；权限查询按当前规范记录解析。

## E 兼容性与回退需审查

既有 Bot 发送者限制现在覆盖 Lark 会话和 Slack 私聊，默认仍关闭。已开启限制的 Bot，需要先审核 Slack 人员的新申请。

回退到旧程序前，应停用依赖新限制的 Slack Binding。旧程序不能执行新增的 Slack 配对门槛。无需 schema 降级或数据库修复。

Slack 群配对和原生管理审批由独立任务推进。Web Human 保持默认完整权限；此页没有新增 DSH 原生 RBAC 或资源隔离。

## F 如何完成这轮真实验收

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

当前共享文件尚无 Slack 槽，等待 Human 登录与隐藏输入凭据。T3 曾恢复并打开登录页，随后再次报告无 automation host。没有启动 Slack 接收器，也没有原生截图。

[Issue 与 Agent claim](https://github.com/BotHarness/DeepSeekBot/issues/1415#issuecomment-6111271564) · [ADR-0174](https://github.com/BotHarness/DeepSeekBot/blob/960f32d82443359220cf6b6fea676bc423d7c305/docs/adr/0174-slack-dm-chat-pairing-reuses-current-binding-authority.md)
