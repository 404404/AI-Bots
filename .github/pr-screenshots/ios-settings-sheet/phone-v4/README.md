# Physical Settings follow-up — PR #2112

2026-10-18 JST. iPhone XS Max, iOS18.1.1, English app, 375×812 points (1125×2436 captures), standard middle text size, signed Debug development client. Independent phone lane coordinated with #2103; no Simulator, shared Metro, Host or pairing changes. No merge.

## Source and binary identity

- Before runtime: `baa5777a86b46f39bb1232de214314c5d0ce288f`.
- After runtime and PR head: `62483069bd930ef48c49ac1cc2bbd3d77be73342`, clean `qa/batch-11-phone`; visible Version stamp agrees after task Metro restart.
- Native binary remains built at `baa5777a86b46f39bb1232de214314c5d0ce288f`; all native inputs unchanged by this two-file styling/changelog update. No new build or installation.
- Executable SHA256: `357c6e5801c1eeb8aaf51f4c5e2b62dd64a263d944239add6a70478fb0ab877a`.
- Debug dylib SHA256: `2fd107befd5012c0f6dcff5d54c9e08a7c0d763857158a4af17723fd75a11da3`.

## Change and proof

The iOS statistics group previously used the sheet background and muted disclosure text, making the clickable row resemble a caption. It now uses the same raised Settings group and normal foreground as neighboring rows. Existing button semantics, expanded state and expand/collapse handler remain. Telemetry consent/storage are unchanged.

`statistics-before-light.png` and `statistics-after-light.png` match device, theme, font, locale and scroll position. Only source/version stamp and the statistics group treatment differ. Expo Tools and AssistiveTouch are existing development/system overlays.

The physical Light-mode regression passed all **8/8** recorded checks (`light-results.json`): fixed header and final-row reachability; root handle dismissal; immediate preference retained on reopen; scrolled Close; cold restart canonical persistence; original Streaming restored; Notifications child handle dismissal; reopen returns to root. About anonymous statistics expanded to Hide statistics details and collapsed before the preference checks. Cold restart screenshot shows Complete bubbles selected; canonical device file agreed, then Streaming was restored. Notifications is a navigation test only: this Debug build reports it cannot receive notifications, so APNs is unqualified.

## VoiceOver boundary

Actual system VoiceOver was enabled and its focus rectangle appeared. The first-use tutorial prompt was skipped; the optional VoiceOver notification request was dismissed. However, automation single taps still directly activated app rows and the attempted next-item pan entered Models and presets instead of establishing ordinary screen-reader navigation. No model or preset was edited. These observations do **not** qualify real VoiceOver traversal or activation.

The Human explicitly chose to restore the phone and retain manual acceptance on2026-10-18. Still requires manual screen-reader acceptance: title announcement; focus containment and return; Statistics disclosure activation/expanded-state announcement; Close activation; two-finger escape. Speech audio was not captured. Ordinary AX snapshots and successful automated clicks are not substitutes. The root Close is currently an explicit non-drag exit; it does not save or undo immediately applied settings. No removal was assumed from the Human's question.

## Validation and limits

Latest-head CI [39067096273](https://github.com/BotHarness/DeepSeekBot/actions/runs/39067096273) passed applicable checks, including both mobile exports. Focused local Settings/statistics/style tests13/13, mobile typecheck, lint/format, diff and bilingual changelog checks passed. Older dark default/intermediate/maximum and iOS26 Simulator results belong to the prior `baa5777a8` head; this follow-up does not relabel them as fresh final-head runs.

One regression attempt raced initial Metro bundling, failed its root-ready precondition and is retained locally; the loaded-app rerun passed8/8. System Settings AX snapshots and VoiceOver's first-use alert probe exceeded the device driver's watchdog; screenshots and the dedicated alert action recovered. These are recorded tool limits, not application passes. Raw Host/chat/system captures remain private.

Android native, complete VoiceOver/TalkBack, Reduce Motion, Chinese app rendering, APNs, Release performance and Human design acceptance remain unqualified.

## Restoration

VoiceOver restored OFF; appearance restored DARK with Automatic ON and original schedule intact. Both were visually checked against the before captures. Font size and other display/VoiceOver options were not changed. VoiceOver’s first-use notification permission was denied, so enabling it later will not re-prompt; notification delivery is unrelated to this app test. Original Streaming was restored and rechecked in both the selected UI and canonical device file after final relaunch. `statistics-after-dark.png` records the new group treatment in the restored original theme. The task driver was closed and phone lane released; matching Metro remains available for Human review.
