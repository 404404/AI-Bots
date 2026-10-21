# Android push on main 2d0bf6e6 (#2483 + #2485) — store build, HyperOS, battery unrestricted + auto-start

Fresh isolated QA Host on the same main; phone registered with render=app. Real pushes sent by the Host.
Bots use their generated default avatars (no uploaded image).

| Trigger | App state | Drawn by | Style | Title / conversation | Avatar | Actions | Channel |
|---|---|---|---|---|---|---|---|
| Mira DM reply | background | app (tag 0:…) | MessagingStyle | Mira, conversation shortcut | generated Bot avatar shown | – | requests |
| Nova approval (secret_cli) | background | app | MessagingStyle | Nova, conversation shortcut | generated avatar | 允许这次 / 拒绝 | requests |
| Group channel reply (Lumi) | background | app | MessagingStyle | #QA Lounge conversation | channel image | – | requests |
| Mira DM reply | foreground | app | MessagingStyle | Mira | generated avatar | – | requests |
| Echo approval (secret_cli) | foreground | app | MessagingStyle | Echo | generated avatar | 允许这次 / 拒绝 | requests |
| Group channel reply (Lumi) | foreground | app | MessagingStyle | #QA Lounge | channel image | – | requests |
| Private input request | both | app | MessagingStyle | Bot DM | generated avatar | – | requests |

No FCM-Notification records and no Greezer freeze this round.

Issue: a DM reply notification can disappear on its own. In the background run the Mira DM reply (posted 19:26:58)
and the private-input request were both removed at 19:27:46, the same second the Host sent a badge-only push
(logs: push phase=sent kind=badge). Removing the private input is expected (it had just been submitted); removing the
unread DM reply is not. A later DM reply with no badge push after it stayed in the shade. The same thing happened once
in the b485d613 foreground run.
