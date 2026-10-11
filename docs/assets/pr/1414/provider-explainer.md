---
title: Lark 配对卡片的可信运输边界
subtitle: Provider PR 21 · BotHarness PR 1418
lang: zh
template: doc
PR: 21
base: 81b91291600edba36b1947940c2be8e50abc9fdf
head: 602baa37fa327f7069545aaadbbd34db8a8f4636
date: 2026-10-11
---

## A 卡片可以在群里审核配对

Provider 增加群聊配对卡片和 Role 选择器。
BotHarness Host 决定谁能审核及能授予什么权限。
真实 Lark 展示仍待验收，PR 保持 Draft。

## B 两种卡片使用不同动作空间

```flow LR
配对卡片 -> pairing-v1: 选择 Role 或审核
原生执行卡片 -> approval-v1: Allow once 或 Reject
pairing-v1 -> 独占 Consumer: 可信事件
approval-v1 -> 独占 Consumer: 可信事件
独占 Consumer -> Messaging: 当前权限校验
```

配对卡片可发到授权群或已观察到的私聊。
原生执行审批的创建路径仍限定私聊。
问题、保存规则及执行群目的地不属于本片。

## C 回调使用实际点击者

选择框从 action.option 读取所选 Role。
实际身份来自 Lark 的 operator.open_id。
卡片、会话和 App 身份随可信事件送到 Host。

```js src=src/channels/feishu/external-cards.mjs lines=49-65
```

[准确版本的回调解析代码](https://github.com/DoodleBears/dsh-im/blob/602baa37fa327f7069545aaadbbd34db8a8f4636/src/channels/feishu/external-cards.mjs#L49)

## D 明确的边界和检查

| 层 | 职责 |
| --- | --- |
| Lark Provider | 来源校验、实际操作人、运输、更新自己的卡片 |
| Messaging | 当前审核权限、委派上限、Role 版本、规范事务 |
| Operational Database | 申请、投递回执、选择者与最终状态 |

配对卡片要求 pairingCardVersion 1 和显式能力标记。
初始卡片与更新均启用共享更新模式。
最终状态移除选择和审核控件。

## E 验证限度

相关 108 项测试、构建和包校验通过。
完整 Windows 套件仍有 36 项失败。
旧基线有 39 项失败，没有新增失败位置。
这不代表全套通过，也不代表真实平台验收通过。

[完整检查与真人路径](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/verification.md)
[产品设置截图和实现 PR](https://github.com/BotHarness/DeepSeekBot/pull/1418)

下一步核对群卡片展示、双人操作和迟到权限拒绝。
