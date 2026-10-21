# main 37971eba (#2491) — Android notification persistence, store build, HyperOS, battery unrestricted + auto-start

Sequence with the app in the background (real Host pushes, fresh QA Host, render=app):
1. Mira DM reply, left unread.
2. Echo private-input request, then submitted with synthetic data.
3. Echo secret_cli approval, then rejected with deepseekbot tool-approval-decide --outcome rejected
   (Echo replied QA-SECRET-REFUSED; the Host sent a badge push at 20:21:42).

| Notification | Expected | Seen (background, 60 s after the decision) | Seen after opening the app (30 s) |
|---|---|---|---|
| Mira DM reply (unread) | stays | stays ✓ | stays ✓ |
| Echo private-input request (submitted) | disappears | still shown ✗ | still shown ✗ |
| Echo approval (rejected) | disappears | still shown ✗ | still shown ✗ |

The badge drop no longer clears the shade (#2491 works for the DM). But nothing removes resolved items either:
push-session reflect() only runs while the app's JS has the inbox loaded, and even after opening the app the resolved
approval and private input stayed. Likely cause (not confirmed, release build is not debuggable): reflect() matches
getPresentedNotificationsAsync() data against the unresolved set, and the app-drawn MessagingStyle notifications
rebuilt by ConversationStyle may no longer carry the expo request extras, so their data cannot be parsed and
nothing is dismissed.

1-after-private-input-submitted.png: Mira DM + private input + approval in the shade.
2-after-app-opened.png: after the rejection and opening the app, the resolved Echo entries are still there.
