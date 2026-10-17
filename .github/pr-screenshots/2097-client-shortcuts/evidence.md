# Selected Client shortcut evidence

Runtime source: `6eea6b76828c94c7a4dbcab00ff101a2cde16ca1`, 2026-10-18. Subsequent stack changes add evidence only; product source is identical. The screenshots show candidate before-key / after-key behavior at 1440 × 900, dark theme, Chinese locale, with isolated QA data. They are not a comparison of base and PR source revisions.

## Confirmed Web behavior

- Two independent browser contexts connected to one Host. Writes target one live Client generation; the other shortcut fingerprint remains unchanged.
- Legacy navigation overrides migrate to six retained platform/runtime profiles on the first write. Explicit disable stores null; another profile retains the old override.
- Set quick switcher to Command+Alt+J: automated browser key delivery opens the actual switcher and its hint shows the custom keys.
- Disable: the same key no longer opens it. Reset: Command+K opens it again.
- Set Home to Command+Alt+Shift+U: actual browser key delivery opens Home. Disable and reset work independently.
- Native panel Command+K remains refused as unsupported-browser; reserved Channel digits and a mismatched platform profile refuse.
- Refresh creates a new Client generation and retains disabled navigation state and the saved layout.
- No page errors occurred in the successful run.

## Failure retained and fixed

The earlier real run found that resetting disabled navigation quick switcher was refused as unsupported-browser. Native binding restrictions were being applied to the existing navigation owner. The fix lets that owner handle unsupported-browser combinations while preserving its reserved-key and cross-command conflict checks. The regression proves default reset succeeds, navigation Command+R still refuses, and a native panel Command+K still refuses.

Source verification: 19 focused files / 165 cases were covered after the two initial fixture/reset fixes; the latest shortcut file passed all 7 cases. Root TypeScript, lint, format and build passed. No full suite was run.

## Native dispatch boundary

Read-only inspection of installed Desktop 0.2.0-rc.2, build `5e9e301dd9dc8923b2762f76dacfc5751f6ca851`, confirms sender validation and a queued revision comparison before the owner writes. Its edit API accepts no abort signal. BotHarness rechecks authorization, lifetime and state before dispatch; a lost reply or expired lifetime afterward reports client-outcome-uncertain and requires readback, never automatic replay. Focused tests cover pre-dispatch abort, accepted-write abort, lost reply and queued stale revision.

The root-owned native queue passed single-Client desktop:macos direct CLI edits and restart: Home changes from Command+Alt+Shift+H to U, Electron key delivery opens Home, quick-switcher disables, and both bindings persist under a new generation. Main Desktop was restored after both phases. See native-verification.json and native screenshots. Native set/disable/reset coverage is narrower than the Web run; native default reset, editable/modal/IME edge cases, physical keys, the real Tob model approval journey and Human QA remain unverified. No merge authorization is implied.

Private reconstruction: `.humanlayer/verify/tob-layout-shortcuts/journey/web-1792276104850/`; replay helper `.humanlayer/tasks/2097-client-shortcuts/web-control-journey.mjs`. Native driver and the private switch launcher are prepared for the root-owned queue. Credentials, login manifests and user profiles are excluded.

Agent-Task: codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60
