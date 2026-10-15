---
section: Added
---

## en

- New `deepseekbot` commands cover the Bot Marketplace (`marketplace-list`, `-topics`, `-detail`, `-submit`, `-report`), releases (`release-check`, and `release-install` and `release-restart` with `--confirm`), usage statistics (`telemetry-status`, `telemetry-set`), Git (`git-status`, `git-install`) and IM pairing review (`pairing-list`, `pairing-review`). They call the same Host methods as the Web UI, so an agent can browse and list Bots, update a Host, opt out of statistics and approve a pairing without opening the page. Eight methods that only serve Web rendering, such as the unread divider and the composer preview, are recorded as UI-only ([#1703](https://github.com/BotHarness/DeepSeekBot/issues/1703)).

## zh

- `deepseekbot` 新增命令，覆盖 Bot 市场（`marketplace-list`、`-topics`、`-detail`、`-submit`、`-report`）、版本更新（`release-check`，以及需要 `--confirm` 的 `release-install` 和 `release-restart`）、使用统计（`telemetry-status`、`telemetry-set`）、Git（`git-status`、`git-install`）和 IM 配对审核（`pairing-list`、`pairing-review`）。它们调用与 Web 界面相同的 Host 方法，Agent 不打开页面也能浏览和上架 Bot、更新 Host、关闭使用统计、批准配对。另有 8 个只服务于网页渲染的方法（如未读分隔线、输入框预览）登记为仅限界面（[#1703](https://github.com/BotHarness/DeepSeekBot/issues/1703)）。
