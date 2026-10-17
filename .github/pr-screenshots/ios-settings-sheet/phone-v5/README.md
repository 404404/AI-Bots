# Settings handle dismissal: physical follow-up

Draft PR #2112 / issue #2107. No merge or release.

## Identities and scope

- PR source: `79e306f367b0f7b71f7fa3ba800e2ea1a634fe85`.
- Runtime source: `db3c29bd34f01f0ae98bfd0a49fe4ab365d957b9`, clean `qa/batch-11-phone`. The later PR commit only removes a test comment; application and native inputs are identical.
- Signed Debug native source: `baa5777a86b46f39bb1232de214314c5d0ce288f`. No app rebuild, reinstall, data reset, unpair, migration or Host change in this follow-up.
- Native executable SHA256: `357c6e5801c1eeb8aaf51f4c5e2b62dd64a263d944239add6a70478fb0ab877a`; debug dylib SHA256: `2fd107befd5012c0f6dcff5d54c9e08a7c0d763857158a4af17723fd75a11da3` (retained signed binary from the prior build).
- iPhone XS Max / iOS18.1.1, English app, screenshots1125×2436. Existing developer Tools and AssistiveTouch overlays are outside the product UI.
- Independent phone/8097 lane coordinated with #2103 owner and the shared queue. Simulator/shared8091 and existing Hosts are preserved.

## Behavior

The root X is removed. The custom modal handle is the single Close button, with a platform-sized target and explicit accessibility activation/escape. UIKit still owns vertical dismissal. The root header contains only the title. Child Back returns to Settings; either tapping or dragging the child's handle dismisses the entire sheet. Completed settings remain immediately applied.

## Native observations

| Text setting | Light | Dark |
| --- | --- | --- |
| Original standard:4/7, larger accessibility sizes OFF | 4/4 focused checks | 6 root/persistence checks +4 child continuation checks |
| Intermediate enlarged:6/12, larger accessibility sizes ON | 4/4 | 4/4 |
| Maximum:12/12, larger accessibility sizes ON | 4/4 | 4/4 |

Each focused case proves fixed title/final row, handle button activation, handle drag and reopen at root. Font slider screenshots were inspected locally; system settings are not inferred from application pixels alone. Every case uses the runtime above. Actual VoiceOver remains separate.


Default Dark: fixed title/final row, About details expand/collapse, handle drag, immediate preference write → dismiss/reopen → cold launch UI/canonical retention, handle button activation, restoration to Streaming. The first harness passed six recorded checks, then its generic scroll-to-top gesture dismissed the native modal before entering Notifications. That harness was interrupted; child checks were resumed from a fresh root and passed independently. The interrupted run is not represented as 8/8.

Child continuation: Back returns to root; handle button activation closes the whole sheet; handle drag closes the whole sheet; reopen returns to root. No settings data was discarded.

The new handle's native accessibility tree exposes the button name `Close`. Ordinary XCTest activation succeeds, including from a scrolled sheet and from Notifications. This is not a VoiceOver gesture or announcement qualification.

## Accessibility and remaining gates

The Human chose to restore the phone and retain manual VoiceOver acceptance after the previous driver limitations. VoiceOver stayed OFF throughout this follow-up. Component tests directly exercise `onAccessibilityTap` and `onAccessibilityEscape` wiring; no real focus/gesture pass is inferred.

Before merge, manually verify VoiceOver sequential focus and containment, Close announcement and double-tap, two-finger escape from root and child, return focus to the Settings launcher, and disclosure expanded state. Android/TalkBack, Reduce Motion, Chinese app rendering, APNs delivery and Release performance remain unqualified. The Notifications view reports this development build cannot receive notifications; navigation evidence is not delivery proof.

## Validation and restoration

Local mobile suite:567 passed,8 skipped. Five new handle tests cover tap, accessibility activation, escape, routing fallback and no duplicate handle on native resizable form sheets. Full lint, mobile typecheck, formatting/diff and changelog checks passed. [Current-head CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/39069281714) passed applicable checks, including both mobile exports, three test shards, static/build/docs and isolated Host smoke. Real-model jobs skipped; CodeRabbit skipped the Draft. Maestro flow updated but unexecuted (Java unavailable).

Original Dark + Automatic ON and the original 07:00 transition schedule, standard middle font4/7 with larger accessibility sizes OFF, and Streaming were restored. Streaming was rechecked in the UI and canonical device-local file after a final relaunch. VoiceOver remained OFF. The phone driver was closed and independent phone/8097 lane released; compatible Metro remains available for Human review. No shared Simulator/Host actions were performed by this task.

Initial driver startup lacked the existing signing environment; restoring its original local configuration recovered the cached signed runner. No Apple account, certificate or permission changes were needed. Private Host/chat snapshots and raw driver logs remain machine-local; published files contain only bounded product states and sanitized result summaries.
