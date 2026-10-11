---
title: "#1407：外部授权组与个人例外"
subtitle: "当前权限按来源合并，显式拒绝优先"
lang: zh
template: doc
PR: https://github.com/BotHarness/DeepSeekBot/pull/1407
base: fe84f5fd952ca7bf2d7232b8beda590eb38971ec
head: 550898dd4cc3f11198e1eab904755826906381f1
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

[精确 head 的当前权限解析器](https://github.com/BotHarness/DeepSeekBot/blob/550898dd4cc3f11198e1eab904755826906381f1/packages/core/src/messaging/permission-groups.ts#L193)。

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
| 完整 Linux CI | warn 生成页面时运行中 |
| 真实 Lark 审批与延迟卡片 | warn 后续网页请求超时，未完成 |
| 首片真人反馈 | warn 待完整验收后收集 |
| 合并与部署 | no 未执行 |

[完整 UI 截图与操作步骤](https://github.com/BotHarness/DeepSeekBot/pull/1407)。
[验证记录与实际截图来源](https://github.com/BotHarness/DeepSeekBot/blob/147a034e6abc7d717789f6fb0941787913f2a9d7/docs/assets/pr/1406/verification.md)。

恢复 Lark 网页后，确认真实消息获得平台 ID。
验证 Allow once、独立 Reject 和延迟卡片拒绝。
重启后再核对实际审批，然后收集真人反馈。

