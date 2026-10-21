# #2397 data-only push verification (store build of main 5c351d00, HyperOS, battery unrestricted + auto-start)

Sent straight to the Expo push API for this phone (token read from the QA Host DB, never printed).

| Variant | App state | Result on phone |
|---|---|---|
| current format (top-level title/body + data) | background | shown by the FCM SDK itself (tag FCM-Notification), BigTextStyle, no channel image, no conversation, no actions |
| current format | foreground | shown by expo-notifications + #2397: MessagingStyle, conversation title "#QA Lounge", sender Lumi, channel image as large icon, shortcut conversation:<host>:group-qa-lounge (2-foreground-push-conversation-style.png) |
| data-only, data.channelId = BotHarness channel id | background | nothing shown (data.channelId is read as the Android notification channel) |
| data-only, data.channelId = requests, title/message in data | background and foreground | nothing shown |

Why data-only stays silent: expo-notifications 58.1.5 (CHANGELOG "make data-only notifications consistent with iOS", #39025)
treats a remote message without a notification part as silent. ExpoHandlingDelegate only presents a backgrounded
data-only message when FCM's top-level data has title/text, and its comment says this "can not be triggered by expo
push service, only when using FCM directly" (Expo puts the request's data into a JSON body field).
