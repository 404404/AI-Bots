---
section: Added
---

## en

- Added explicit recovery for interrupted Group drafts using fresh observations, and authorized commit receipts that confirm a previously sent message without duplicating it. Bots and the direct CLI share inspection and recovery; expired drafts, changed content and unavailable ownership or access remain refused ([#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)).

## zh

- 新增群聊中断草稿的显式恢复，恢复前须重新观察当前对话；提交回执可在权限仍有效时确认原消息，避免重复发送。Bot 与直接 CLI 共用检查和恢复路径，过期草稿、正文冲突或失效的 owner／访问权限仍被拒绝（[#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)）。
