---
title: "#1407：外部授权组与个人例外"
subtitle: "当前权限按来源合并，显式拒绝优先"
lang: zh
template: doc
PR: https://github.com/BotHarness/DeepSeekBot/pull/1407
base: d87b39104305cd9bf2f2420ab018d9e31767741f
head: cefa12fac05856c182bfab4b80f565f7ec074f06
generated: 2026-10-11
---
## A 哪些行为改变了
一个已配对人员可以加入多个持续授权组。
每人仍保留一个主要自然语言行为 Role。

| 项目 | 之前 | 本片 |
| --- | --- | --- |
| 管理能力来源 | Role 或既有管理配对 | 加入组 Allow/Deny 和个人例外 |
| 查看来源 | 主要 Role | 来源类型、名称、revision 与 Allow/Deny |
| Web Human | 默认完整产品权限 | 保持默认权限与原生执行审核 |
| 配对资格 | 显式批准 | 组和例外不授予聊天资格 |

## B 权限由谁决定
```flow TB
Client -> API Gateway: 既有认证命令
API Gateway -> Messaging: senderAccess
Messaging -> [(Operational Database)]: 组与个人例外
[(Operational Database)] -> 当前解析器: 决策时读取
当前解析器 -> 只读查询: 来源与有效能力
当前解析器 -> 私聊原生决策: 有效能力
私聊原生决策 -> 既有范围校验: actor、Bot、App、请求
```

不增加第二个 IM Consumer、数据库或权限缓存。
群成员名单不决定授权组成员。
精确的已批准配对 ID 决定成员资格。

## C 为什么显式拒绝有效
实际代码将全部 Deny 从 Allow 并集中移除。

```ts src=packages/core/src/messaging/permission-groups.ts lines=257-269 hl=261-265
```

[精确 head 的当前权限解析器](https://github.com/BotHarness/DeepSeekBot/blob/cefa12fac05856c182bfab4b80f565f7ec074f06/packages/core/src/messaging/permission-groups.ts#L193)。

运行验证中，两个组均允许批准和拒绝。
个人例外拒绝批准，有效能力只剩拒绝。
删除一个来源仅撤回其贡献。

## D 持久化与范围有哪些约束
| 约束 | 结果 |
| --- | --- |
| 一个 Bot 与当前 App Binding | 不跨 Bot、平台或重新绑定继承 |
| 精确配对 ID | 撤销后新配对不继承旧成员与例外 |
| revision 检查 | 拒绝旧表单覆盖当前数据 |
| 单组最多 100 人 | 写入有界 |
| 每个 Bot 最多 50 组 | 查询与存储有界 |
| generation 79 | 旧 writer 拒绝打开升级后的 Profile |

```callout warn 回退需要备份
升级前备份 Profile。
回退使用升级前备份，或兼容的向前修复。
删除组的 Deny 可能恢复其他来源的 Allow。
自然语言策略不是任意资源的强制 ACL。
```

## E 哪些证据已完成
| 检查 | 状态 |
| --- | --- |
| 针对性与回归测试 | ok 164 个通过 |
| lint、format、typecheck、build、ledger | ok 本地通过 |
| 实际 Client 写入与重启 | ok 当前组、例外与来源保留 |
| Web Human 实际回复 | ok WEB1406_OK |
| 首条 Lark 当前权限查询 | ok 平台确认与模型 Tool 调用 |
| 前一 head 的完整 Linux CI | ok 3994 个测试通过，13 个跳过，构建与 docs 通过 |
| 当前 head 的 CI | ok 完整 Linux 检查通过 |
| 真实 Lark Allow once / Reject | ok 原生结果与实际私聊回复对应 |
| 延迟卡片遇到组 Deny | ok 无执行结果，同卡 Reject 仍有效 |
| 重启后新的 Allow once | ok 原生结果 seq 158 成功，回复已读 |
| 原卡片最终显示 | ok 修复共享更新后，新批准和拒绝卡片均无按钮 |
| 接收器与权限清理 | ok 接收器已停，临时配对撤销，路由关闭，个人 Deny 恢复 |
| 首片真人反馈 | warn 待收集 |
| 合并与部署 | no 未执行 |

[完整 UI 截图与操作步骤](https://github.com/BotHarness/DeepSeekBot/pull/1407)。
[当前 head 的 Linux CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/38129800586)。

本轮只运行打印标记的命令。
独立 Reject 与延迟 Deny 均未执行命令。
组权限提供 Approve，临时管理配对只授予 Reject。
原卡片缺少共享更新模式的问题已修复并实测。
旧卡片保留为失败证据，不重放旧操作。
Provider 修复为独立 PR，真人反馈仍待收集。

