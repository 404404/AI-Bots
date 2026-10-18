---
section: Added
---

## en

- Bounded Group reply review now stops after two rechecks and offers explicit drop, Inbox snooze or one reviewed continuation attempt. An intervening unread message refuses that attempt instead of permitting an obsolete reply; the original target, permissions and decision audit remain intact ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).
- Deferred Inbox work keeps its deadline wake when new Group context arrives without waking the Bot, so an unobserved update cannot silently cancel recovery ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).
- Exhausted review offers a short Host-time snooze suggestion for message contention while preserving Human deadlines and conditions, with guidance to batch completed background work ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).

## zh

- 群聊回复最多复核两次，随后明确选择放弃、通过 Inbox 延后，或有依据地申请继续一次；期间出现未读消息会拒绝申请，避免发送过时答案，保留原目标、权限检查和决策记录（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
- 未唤醒 Bot 的群聊新消息不再取消 Inbox 延后事项的到期唤醒，避免未读更新使待办无法恢复（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
- 预算耗尽时提供基于 Host 时间的短暂延后建议，保留 Human 的时间和条件约束，并引导批量结清已完成的背景事项（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
