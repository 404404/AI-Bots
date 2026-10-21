# #2397 store build (main bc93a7c3) notification fields on HyperOS, 2026-10-21 15:02 local

- tag=FCM-Notification:… | title=Nova | template=android.app.Notification$BigTextStyle | largeIcon=null | shortcut=null contentView=null vibrate=null sound=null defaults=0 flags=AUTO_CANCEL color=0x00000000 vis=PRIVATE focusType=null)) | actions=none | text=需要你审批：secret_cli · synthetic-qa
- tag=FCM-Notification:… | title=Nova | template=android.app.Notification$BigTextStyle | largeIcon=null | shortcut=null contentView=null vibrate=null sound=null defaults=0 flags=AUTO_CANCEL color=0x00000000 vis=PRIVATE focusType=null)) | actions=none | text=已收到 Token。我接下来会用它在环境变量里执行 `gh --version`
- tag=FCM-Notification:… | title=#QA Lounge | template=android.app.Notification$BigTextStyle | largeIcon=null | shortcut=null | text=Lumi：收到，这是一条回复测试 (read at 15:00, group channel reply with a channel image set)
- tag=FCM-Notification:… | title=Mira | template=android.app.Notification$BigTextStyle | largeIcon=null | shortcut=null | text=私聊通知测试，收到。 (read at 14:59, DM reply)

Expected by #2397: group = channel image, "#channel" title, Bot as MessagingStyle sender in the Conversations section; DM = Bot avatar; approval = action buttons.
Seen: every notification is posted by the FCM SDK itself (tag FCM-Notification), BigTextStyle, no large icon, no conversation shortcut, no actions.
