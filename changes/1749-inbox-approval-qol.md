---
section: Added
---

## en

- Tool approval cards are shorter and match the mobile app: a category (Terminal, File, Browser) with a **Needs you** pill, one sentence saying what the tool will do, a one-line command or file preview, then **Allow once** and a red **Reject**. The working directory, full input and risk note sit under **Details**, the always-allow choices under **More options**, and a decided card collapses to one line such as "Terminal · Allowed". They also take the keyboard: `Y` or Enter allows once, `N` or Esc rejects, and `A` opens the always-allow risk confirmation; a new card takes focus when nothing else has it. Cards count down to their expiry and turn amber in the last 15 minutes, and file writes and edits show a line diff instead of raw JSON, with long input folded ([#1749](https://github.com/BotHarness/DeepSeekBot/issues/1749), [#1752](https://github.com/BotHarness/DeepSeekBot/issues/1752), [#1753](https://github.com/BotHarness/DeepSeekBot/issues/1753)).
- The Human Inbox moves with `J`/`K`, opens the source with Enter, marks an item handled with `E`, selects with `X` and snoozes with `S`. Selected items can be marked handled together, and selected tool approvals allowed once or rejected together. **Remind me later** hides an item until a chosen time; the **Snoozed** filter lists them and brings one back, and `deepseekbot inbox-snooze` does the same from the CLI ([#1750](https://github.com/BotHarness/DeepSeekBot/issues/1750), [#1751](https://github.com/BotHarness/DeepSeekBot/issues/1751), [#1754](https://github.com/BotHarness/DeepSeekBot/issues/1754)).

## zh

- 工具审批卡更简洁，并与移动端一致：顶部是类别（终端、文件、浏览器）和「需要你确认」标签，接着一句话说明工具要做什么、一行命令或文件预览，然后是「仅批准这一次」和红色的「拒绝」。工作目录、完整输入和风险说明收进「详情」，始终允许的选项收进「更多选项」；处理完的卡片收成一行，例如「终端 · 已允许」。卡片同时支持键盘：`Y` 或 Enter 仅批准这一次，`N` 或 Esc 拒绝，`A` 打开「始终允许」的风险确认；新卡片出现且页面没有其他焦点时会自动获得焦点。卡片会显示还剩多久过期，最后 15 分钟变成琥珀色；写文件和改文件的请求改为显示逐行 diff，不再是原始 JSON，过长的输入默认折叠（[#1749](https://github.com/BotHarness/DeepSeekBot/issues/1749)、[#1752](https://github.com/BotHarness/DeepSeekBot/issues/1752)、[#1753](https://github.com/BotHarness/DeepSeekBot/issues/1753)）。
- Human Inbox 可以用 `J`/`K` 上下移动，Enter 跳到来源消息，`E` 标为已处理，`X` 选择，`S` 稍后提醒。选中的条目可以一起标为已处理，选中的工具审批可以一起批准一次或一起拒绝。「稍后提醒」把条目隐藏到选定的时间；「已延后」筛选列出它们并可取消延后，`deepseekbot inbox-snooze` 在命令行里做同样的事（[#1750](https://github.com/BotHarness/DeepSeekBot/issues/1750)、[#1751](https://github.com/BotHarness/DeepSeekBot/issues/1751)、[#1754](https://github.com/BotHarness/DeepSeekBot/issues/1754)）。
