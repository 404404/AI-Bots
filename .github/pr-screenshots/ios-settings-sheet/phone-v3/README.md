# Physical iPhone Settings qualification — PR #2112

2026-10-18 JST. Exact source/native input head `baa5777a86b46f39bb1232de214314c5d0ce288f`, local phone batch `qa/batch-11-phone`. iPhone XS Max, iOS 18.1.1, English app, dark appearance, observed 375×812-point viewport (1125×2436 capture). Signed Debug build succeeded and its signature was verified; same-identity install retained app data and Host pairing. Native executable hashes are in `binary-hashes.json`.

The owner of #2103 explicitly released the phone/build lane while keeping the Simulator, its shared checkout and Metro. This run used an independent frozen phone checkout and matching Metro. No Simulator, shared Metro, Host restart/migration, authentication transaction, erase or uninstall was performed.

## Result

- Default text: 8/8 checks passed.
- Intermediate enlarged text: 3/3 focused checks passed.
- Maximum accessibility text: all 8 checks passed across the initial run and its explicit scroll-to-restore continuation.
- Canonical Complete bubbles value and the selected native row survived dismiss/reopen and cold restart at default and maximum sizes. Streaming restored afterward.
- Original system font restored: Larger Accessibility Sizes OFF, middle (fourth of seven) standard tick. Appearance, app data and pairing preserved. The original preference file was absent (default Streaming); restoring through UI leaves an explicit Streaming value.

See per-size `results.json`, `preference-readback.json`, `restored-state.json` and system font captures. No application source change was needed in this follow-up.

## Scope and reproduction

1. Open Chats → Settings. Verify handle above a fixed Settings header and Close button.
2. Scroll to the final statistics row. Header and Close remain visible; expand/collapse the explanatory text.
3. Choose Complete bubbles. Read the app-owned persisted preference, then drag downward starting on the visible handle. Settings dismisses to Chats.
4. Reopen Settings; verify the selected choice and canonical value. Close while scrolled.
5. Terminate/relaunch the app, reopen Settings and verify Complete bubbles remains selected and persisted. Restore Streaming through the UI and verify its persisted value.
6. Open Notifications and drag its handle downward; reopening Settings returns to the root.

Repeat at default and maximum system accessibility text. An intermediate enlarged-text run additionally checks the last row, fixed header, handle dismissal and root reopen. System settings captures establish the actual slider positions; no exact UIKit category name is inferred from pixel size.

## Evidence boundaries

- These are final-head physical **after** captures; the separately published matched before/after iOS26 Simulator run remains the blank-screen reproduction evidence. No physical baseline comparison is claimed.
- Screenshots of Host names/routes, chats and raw accessibility trees remain local. Published images are unmodified native captures of generic settings. The floating gear is Expo Tools; the other floating circle is the phone's existing AssistiveTouch control.
- Persistence is the device-local Message display preference. This does not qualify Host schema migration, every setting, notification delivery or server persistence.
- Debug functional regression does not qualify Release performance. Physical light appearance, VoiceOver, Reduce Motion, app Chinese rendering, APNs, Android and Human acceptance remain untested in this run.
- Returning from iOS Settings could reload the development app, so this phone run does **not** claim uninterrupted live text-size relayout. The separate Simulator run qualified live text changes.
- Driver limitations retained locally: a launch using physical-unsupported Metro hints was refused before action; the iOS Larger Text page has a snapshot/viewport error, so its controls were inspected visually; an intermediate test initially started from Chats rather than Settings and failed its precondition before being corrected. One slider gesture outside the viewport was refused and retried within bounds. At maximum text, the full driver stopped after its cold-restart pass because Streaming was above the visible viewport; the continuation explicitly scrolls upward before restoring it and completing child dismissal. The initial stop is retained. None is represented as an application pass or hidden product failure.

PR remains Draft and unmerged. CI and previous Simulator results are separate from this physical evidence.
