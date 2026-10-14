---
section: Added
---

## en

- Tool approval cards take the keyboard: `Y` or Enter allows once, `N` or Esc rejects, and `A` opens the always-allow risk confirmation; a new card takes focus when nothing else has it. Cards count down to their expiry and turn amber in the last 15 minutes, and file writes and edits show a line diff instead of raw JSON, with long input folded ([#1749](https://github.com/BotHarness/DeepSeekBot/issues/1749), [#1752](https://github.com/BotHarness/DeepSeekBot/issues/1752), [#1753](https://github.com/BotHarness/DeepSeekBot/issues/1753)).
- The Human Inbox moves with `J`/`K`, opens the source with Enter, marks an item handled with `E`, selects with `X` and snoozes with `S`. Selected items can be marked handled together, and selected tool approvals allowed once or rejected together. **Remind me later** hides an item until a chosen time; the **Snoozed** filter lists them and brings one back, and `deepseekbot inbox-snooze` does the same from the CLI ([#1750](https://github.com/BotHarness/DeepSeekBot/issues/1750), [#1751](https://github.com/BotHarness/DeepSeekBot/issues/1751), [#1754](https://github.com/BotHarness/DeepSeekBot/issues/1754)).

## zh

- 工具审批卡支持键盘：`Y` 或 Enter 仅批准这一次，`N` 或 Esc 拒绝，`A` 打开「始终允许」的风险确认；新卡片出现且页面没有其他焦点时会自动获得焦点。卡片会显示还剩多久过期，最后 15 分钟变成琥珀色；写文件和改文件的请求改为显示逐行 diff，不再是原始 JSON，过长的输入默认折叠（[#1749](https://github.com/BotHarness/DeepSeekBot/issues/1749)、[#1752](https://github.com/BotHarness/DeepSeekBot/issues/1752)、[#1753](https://github.com/BotHarness/DeepSeekBot/issues/1753)）。
- Human Inbox 可以用 `J`/`K` 上下移动，Enter 跳到来源消息，`E` 标为已处理，`X` 选择，`S` 稍后提醒。选中的条目可以一起标为已处理，选中的工具审批可以一起批准一次或一起拒绝。「稍后提醒」把条目隐藏到选定的时间；「已延后」筛选列出它们并可取消延后，`deepseekbot inbox-snooze` 在命令行里做同样的事（[#1750](https://github.com/BotHarness/DeepSeekBot/issues/1750)、[#1751](https://github.com/BotHarness/DeepSeekBot/issues/1751)、[#1754](https://github.com/BotHarness/DeepSeekBot/issues/1754)）。
