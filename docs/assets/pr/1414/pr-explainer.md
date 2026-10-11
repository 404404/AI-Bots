---
title: 群里公开申请，按实际审核人授权
subtitle: Lark 配对审核首片 · PR 1418
lang: zh
template: doc
PR: 1418
base: 71aa4d06b4ba9619e17cd971c6e303eec9374bf6
head: d3cbd0bb4380bc95e57d62cc33be92f9c1010733
date: 2026-10-11
---

## A 当前交付与验收

群聊可以完成配对，不要求私聊。
所有人能看到卡片，只有当前审核人能决策。
该路径已实现，真实 Lark 验收仍待完成。

| 项目 | 状态 |
| --- | --- |
| Host、数据库、Provider、设置界面 | ok 已实现 |
| 定向自动化与原生审批回归 | ok 通过 |
| 真实群聊卡片和双人操作 | warn 待验收 |
| 首片真人反馈、合并、部署 | warn 未完成 |

## B 群聊里的动作如何生效

```sequence
申请人 -> 群聊: 新的受限 @ 请求
群聊 -> Messaging: 可信身份和当前来源
Messaging -> 数据库: 仅保存待审核申请
Messaging -> 群聊: 公开配对审核卡片
审核人 -> 群聊: 选择 Role 并批准
群聊 -> Messaging: 实际点击者与卡片回执
Messaging -> 数据库: 校验当前权限并提交决策
Messaging -> 群聊: 最终卡片与重新提问通知
申请人 -> Messaging: 新的有效问题
Messaging -> 模型: 执行新问题
```

原申请不调用模型，不保存为待执行指令。
已观察到的审核人私聊可以收到副本。
没有私聊时，群里的卡片仍可完成审核。

## C 使用权限与委派上限

| 权限 | 作用 |
| --- | --- |
| review-pairing | 审核普通聊天配对 |
| capabilities | 此人自己可使用的能力 |
| delegableCapabilities | 此人能授予别人的能力 |
| delegateDeny | 覆盖组和个人的委派允许 |

管理 Role 的使用和继续委派能力均须在上限内。
拥有某个能力，不代表能把该能力授予别人。
旧记录不会自动获得新的审核或委派权限。

```ts src=packages/core/src/messaging/pairing-cards.ts lines=85-101
```

[准确版本的校验代码](https://github.com/BotHarness/DeepSeekBot/blob/d3cbd0bb4380bc95e57d62cc33be92f9c1010733/packages/core/src/messaging/pairing-cards.ts#L85)

## D 持久化与失效路径

Messaging 拥有规范决策，Provider 只运输可信事件。
数据库保存卡片回执、Role 版本和选择者。
批准事务再次检查当前权限和 Role 版本。
Web 与卡片竞争时，首个有效决策胜出。
重启复用已确认回执，不盲目重发未知投递。
迟到点击、权限撤销和来源变化都会被拒绝。

```callout warn 数据库 generation 80
升级前备份。回退需要恢复备份和兼容的写入版本。
```

## E 证据和下一步

设置截图来自真实原生 Web 界面和隔离 Profile。
角色已通过界面创建、编辑、保存并重新读取。
组截图展示准备态，尚无 App，不能保存。

产品定向测试为 97 项；当前卡片与原生审批回归共 22 项，包含重叠。
修正表格后，26 项 Client 测试通过。
Windows 全套未通过；基线也出现 EPERM 清理失败。
Linux 全套通过：4,045 项测试，跳过 13 项。
真实卡片展示和真人反馈仍须独立验收。

[完整 Linux 校验](https://github.com/BotHarness/DeepSeekBot/actions/runs/38135347584)

[PR 内嵌截图](https://github.com/BotHarness/DeepSeekBot/pull/1418)
[已执行检查及完整验收步骤](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/verification.md)
[Provider PR 21](https://github.com/DoodleBears/dsh-im/pull/21)

QA1 需要新的独占窗口和两个真实用户。
完成群聊首片反馈后，再推进一次性配对码。
