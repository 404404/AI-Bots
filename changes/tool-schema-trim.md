---
section: Changed
---

## en

- Each Bot request carries about 5k fewer input tokens. A Bot without an IM connection no longer lists the 15 external IM tools or their instructions, and they appear on the next turn after the Bot is connected. The native subagent tools that a Bot could not call are gone; Bots keep delegating through bot_subagent. The reminder tool no longer repeats rules already in the Bot's instructions.

## zh

- Bot 每次请求的输入少了约 5k token。没有接入 IM 的 Bot 不再列出 15 个外部 IM 工具和相关说明，接入后从下一轮起自动出现。Bot 本来就调不了的原生 subagent 工具已移除，Bot 继续用 bot_subagent 委派。提醒工具不再重复 Bot 说明里已有的规则。
