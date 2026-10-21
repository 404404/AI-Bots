# #2465 (b14c3d35) Android push check — store build, HyperOS, battery unrestricted + auto-start

Real pushes sent by the QA Host (migration 105 present; push_devices.render = app for this phone).

| Trigger | App | Who drew it | Style | Title / conversation | Avatar | Actions | Android channel |
|---|---|---|---|---|---|---|---|
| Group channel reply (Lumi in #QA Lounge) | foreground | app (tag 0:…) | MessagingStyle | conversationTitle #QA Lounge, shortcut conversation:<host>:group-qa-lounge | channel image (bitmap) | – | requests |
| DM reply (Mira, generated avatar) | foreground | app | MessagingStyle | Mira, shortcut conversation:<host>:dm-… | blank (no Bot avatar) | – | requests |
| DM reply (Mira after bot-avatar-set PNG) | foreground | app | MessagingStyle | Mira | Bot avatar shown | – | requests |
| Approval secret_cli (Nova) | foreground | app | MessagingStyle | Nova | blank | 允许这次 / 拒绝 | requests |
| Private input (Nova) | foreground | app | MessagingStyle | Nova | blank | – | requests |
| Group reply, DM reply, private input, approval (Echo) | background | FCM SDK (tag FCM-Notification) | none | android.title = null, android.text = null (empty) | – | – | requests |

Background cause: for render=app the Host drops the top-level title/body but still sends sound, badge, priority,
channelId, categoryId and mutableContent, so Expo still builds an FCM notification part. The FCM SDK shows it
(empty) and never calls onMessageReceived, so ConversationHandlingDelegate never runs. Logcat: background-logcat-notifications.txt.

Probe with a truly data-only message (only to, priority high, data incl. title/message/categoryId), app in background:
- group, DM and approval are all drawn by the app: MessagingStyle, #QA Lounge conversation with channel image,
  conversation shortcuts, approval buttons 允许这次 / 拒绝 (4-background-data-only-probes.png);
- but every one lands in expo_notifications_fallback_notification_channel, not requests. Putting channelId=requests
  into data does not help (Expo wraps data into the body JSON) and breaks the shortcut/group icon.

Generated (SVG) Bot avatars never appear; an uploaded PNG avatar does (3-dm-with-image-avatar.png), so the SVG ->
PNG step in native-notification-avatars.ts most likely fails on Android.
