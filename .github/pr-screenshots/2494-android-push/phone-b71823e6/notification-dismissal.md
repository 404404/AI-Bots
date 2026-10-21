# #2494 Android notification dismissal (phone, b71823e6)

Device: Xiaomi FE5XNBAEFQTS7DMZ, HyperOS 3 / Android 16, zh-CN. Store package `app.deepseekbot.mobile` built from b71823e6, paired with an isolated QA Host on the same commit (render=app). Live model: deepseek-v4.1-flash.

App in the background the whole time:

| Step | Result |
| --- | --- |
| Mira DM reply (left unread) | Notification shown in the requests channel with avatar; still present after every later step and after opening the app |
| Nova private-input request | Notification shown |
| Private input submitted | Private-input notification removed while the app stayed in the background |
| Follow-up `secret_cli` approval | Notification shown with 允许这次 / 拒绝 actions |
| Approval rejected from the CLI | Approval notification removed while the app stayed in the background |
| App opened, then sent home | Only replies remain (Mira DM, Nova messages); no resolved request reappears |

Mira appears twice because the bot actually sent two identical messages (two separate message ids in the DM), not because of a duplicate notification.

`shade-after-resolve-and-open.png` is cropped to the app's own entries.
