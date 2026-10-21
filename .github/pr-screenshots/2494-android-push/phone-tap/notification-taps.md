# Android notification taps (phone, main 77ddca9b)

Device: Xiaomi FE5XNBAEFQTS7DMZ, HyperOS 3 / Android 16, zh-CN. Store package `app.deepseekbot.mobile` built from main 77ddca9b and overlay-installed, paired with an isolated QA Host on the same commit (render=app). Live model: deepseek-v4.1-flash. The app was in the background before every tap.

| Tap | Result | Screenshot |
| --- | --- | --- |
| Mira DM reply notification | Opens the Mira DM | `1-dm-notification-opens-dm.png` |
| `#QA 群` Lumi reply notification | Opens the `#QA 群` channel | `2-group-reply-opens-channel.png` |
| Nova `secret_cli` approval notification (body) | Opens the Nova DM with the pending approval card | `3-approval-opens-request.png` |
| 拒绝 action on the Echo approval notification | Host records `outcome: rejected`; the card shows 已拒绝, the bot reports QA-SECRET-REFUSED and the notification is gone | `4-deny-button-rejected.png` |
| 允许这次 action on the Nova approval notification | Host records `outcome: allowed-once`; `gh --version` (synthetic token) exits 0, the bot reports QA-SECRET-OK and the notification is gone | `5-allow-button-allowed-once.png` |

`0-shade-approval-notification.png` is the shade before the allow tap, cropped to the app's own entries. Both action buttons also bring the app to the foreground (`opensAppToForeground: true`).

Notes:
- The action buttons only appear after the notification is expanded on HyperOS.
- Opening a chat clears that chat's notifications, including a pending approval's. The request itself stays pending in the app and on the Host.
- `tool-approval-status` reports `expired` once the bot's turn has ended, for CLI and notification decisions alike, so the decision was read from the channel's decision message instead.
