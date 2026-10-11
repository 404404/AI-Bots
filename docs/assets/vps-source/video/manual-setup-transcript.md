# Manual QQ setup: actual supplemental recording

Captured on 2026-10-11 at 19:59 UTC on the verified tutorial VPS, product source `031a14db`, Provider `4.32.0-botharness.19`. This supplemental capture uses ordinary strict SSH forwarding into the real authenticated native Web Client. It does not re-enact initial authorization or establish tailnet HTTPS access.

The initial six seconds of page loading were removed. The remaining actual recording opens Settings → IM bots → QQ → Manual setup. AppID and AppSecret stay empty; stop recording before entering credentials and clicking Connect. QQ Provider authorization and PersonaBot binding are separate steps.

| Time    | Action / 操作                                                     |
| ------- | ----------------------------------------------------------------- |
| 00:00   | Authenticated task Host / 已登录本任务 Host                       |
| 00:01.4 | Settings / 设置                                                   |
| 00:02.5 | IM bots / IM机器人                                                |
| 00:03.6 | QQ, then Manual setup / QQ → 手动接入                             |
| 00:04.8 | Blank credential form; stop before entry / 空凭据表单，填写前暂停 |

中文：本次补录展示实际原生界面入口，不包含凭据输入、首次授权或群发送。界面中文按钮是「手动接入」「绑定并连接」；连接后仍需在目标 Bot 的外部身份绑定。所有原始画面逐帧检查，凭据为空，没有二维码、登录链接或机器标识。

[MP4](qq-manual-setup.mp4) · [中文字幕](qq-manual-setup.zh.vtt) · [English captions](qq-manual-setup.en.vtt) · [Capture and digests](manual-setup-manifest.json)
