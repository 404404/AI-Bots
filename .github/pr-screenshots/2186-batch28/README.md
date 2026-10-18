# #2186 post-merge native acceptance — Batch28

Source and integrated main: `da9ee46aaca938924a2a3057c9b46ff18bb06977` (#2189, merged by the Human).
Native development client: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`, reused after native-input compatibility check.
Main CI: https://github.com/BotHarness/DeepSeekBot/actions/runs/39131793797 (success).
Issue claim: https://github.com/BotHarness/DeepSeekBot/issues/2186#issuecomment-6250512840

This branch contains evidence only. No product code, deployment or production changes.

## Observed paths

- Pair native modal → Cloud services → Workspaces → Cloud → Manage cloud services → Workspaces, in default/intermediate/maximum Dynamic Type × light/dark. Each case exercised actual tab and Manage taps, not just element presence.
- With the drawer open, default → maximum → default font changes retained operable tabs and Manage action. At maximum size the middle list scrolled independently and Notifications opened its destination; this build cannot deliver notifications, so delivery is not qualified.
- Cloud services → Workspaces → existing paired QA Computer → local Chats → existing Perf Writer DM. An unsent local marker survived the round trip and app cold restart. The same saved Host reconnected; Cloud configuration and signed-out state matched the initial snapshot. Canonical allowed-DM readback contained no marker: no message was sent.

## Evidence limits

All captures are the assigned iOS Simulator at 402×874. The shared development gear appears in captures; it initially obstructed a Workspaces tap and was moved before successful testing. This was a driver overlay, not the product failure from Batch27. Light/dark draft images show different moments (return versus cold restart), not a before/after product comparison.

Large text wraps the word Computers across lines; the maximum-size row needs middle-list scrolling to expose its address. Navigation works, but these screenshots are not a claim of polished typography or complete accessibility acceptance. VoiceOver/TalkBack, Android, physical iOS, older iOS/Reduce Transparency, long translations and all generic-sheet keyboard/actions remain unverified here.

The Computer was a coordinator-authorized retained performance Host, not latest-main Host qualification. One task device was prepared through the real pairing/redeem/save seam; this is fixture setup, not user QR scanning or optional-name pairing acceptance. Only its already-read Perf Writer DM was opened. No Bot send, model call, cloud login/account operation, or unrelated Host mutation was performed.

Cleanup readback: only the new task device was revoked/unpaired; both original devices were preserved and the retained Host process remained alive. Original no-Host/signed-out-Cloud state matched; Documents/preferences were restored byte-for-byte. Original light/large/locale, shared checkout and three pre-existing untracked documents were restored; the task driver and Metro were stopped. No Prod activity.

#2186 stays open for the explicitly unchecked acceptance. CodeRabbit was quota-limited before the Human merge; it is not reported as an approval.
