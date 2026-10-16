# Batch 9: statistics switch and system text native follow-up

2026-10-17. Partial native acceptance; **Chinese rendering remains blocked. No remote PR was merged by this runner.**

## Exact source and build

- Frozen main: `9e9a553f3` (no mobile changes relative to `5e5be76e5` / Batch 8).
- Typography: #2007 is merged into #1966 at `37b2bc02eb47e76bc753d8c8a21e5c3590281fed`, **not into main**.
- Switch: #2022 source `20a1b2e66ec6cda0eccc434a7cb9dc7559c112a7`.
- Combined local `qa/batch-9`: `d933829822260c24cf6d892733d818853cfa0d63`.
- Existing signed Batch 8 development binary, source `4116e181cfeba38938c698f55f1260994f9fa1f7`, version 0.0.1 (1), React Native 0.86.3 / Expo SDK 57. Native dependency/config inputs are unchanged in the combined source; JavaScript loaded from its dedicated Metro.
- Some screenshots show `8e46de1c6` in Version: this is the Expo config stamp from Metro startup, before merging #2022 into the local batch. It is **not the effective JS revision**. The actual runtime source was d9338298, verified by restoring the exact tracked telemetry file and full Metro reload. The controlled old/new comparison below changes only the loaded-readiness guard. No source edits remain in the QA checkout.
- iPhone 17 Pro Simulator, iOS 26.0 (23A343), 402 x 874. English; light/dark. Dynamic Type categories: `large` (default), `accessibility-large` (intermediate), `accessibility-extra-extra-extra-large` (maximum).

## Results

| Gate | Result | Evidence and bounds |
| --- | --- | --- |
| ON -> OFF immediate visuals | PASS | Current page changes to gray track/left thumb; persisted enabled=false, hasIdentity=false, empty queue. No restart needed. |
| OFF -> ON immediate visuals | PASS | Current page changes to blue track/right thumb; persisted enabled=true, hasIdentity=true. |
| Repeated toggles | PASS | Three consecutive taps from OFF end ON, matching persisted state and screenshot. This is a short repeated interaction, not a stress/latency benchmark. |
| Cold restart persistence | PASS | ON persisted; cold launch and actual notice -> Open Settings -> statistics navigation still show ON. |
| Live intermediate/maximum text | PASS with #2007 | On plain main, changed text is vertically clipped and statistics labels truncate. Combined typography remounts native text on the live size change; labels wrap fully, details expand/collapse, long disclosure scrolls to its final sentence. Restoring default is readable. |
| Maximum-size notice | PASS | Title wraps, body scrolls, Open Settings and Got it are reachable. Open Settings was actually activated. Light/dark captures included. |
| Chinese pixels | **FAIL / environment blocked** | Correct Chinese accessibility strings but blank/tofu pixels. An independent UIKit/CoreText program using the system font produces 10 missing Chinese glyphs, without Expo/React Native. See diagnosis below. |
| VoiceOver, Android, physical iPhone, retained Host pairing | UNTESTED | No Android device/tooling or physical run; no VoiceOver acceptance. Existing app currently presents pairing. This batch did not recreate pairing or exercise pending approvals. |

## Matched comparisons

- `before-statistics-{default,medium,max}-{light,dark}.png`: source Batch 8 `4116e181c`, mobile-equivalent to frozen main, same Simulator and statistics section at the list bottom. Intermediate captures preserve real in-session clipping. Maximum captures are after a cold restart (which removes the vertical stale-height symptom but still truncates labels). Transitional/theme-animation frames and mismatched scroll positions were retained privately and excluded from the published pairs.
- `after-statistics-{medium,max}-{light,dark}.png`: d9338298 with #2007 and #2022, corresponding categories and themes. The number of visible rows changes because their heights correctly expand. Default-size post-change captures are `after-switch-off-*`, `after-switch-on-light` and `after-switch-restart-light`.
- `before-switch-stale-{light,dark}.png`: combined layout, **only** `if (!loaded) await ready` temporarily changed back to `await ready` in the QA checkout, then a full reload. A click stores enabled=false / hasIdentity=false but leaves the visible switch ON. This holds font/layout constant for the #2022 comparison. The file was then restored to d9338298 and fully reloaded.
- `after-switch-off-{light,dark}.png`: enabled=false and native switch visibly OFF on the current page. `after-switch-on-light`, `after-switch-repeat-dark`, `after-switch-restart-light` cover reverse/repeated/restart states.
- Maximum notice screenshots show initial reading position and the scrolled bottom. The scroll helper reported hidden content even when already at the bottom; the screenshot and successful Open Settings activation establish actual reachability. This helper warning is not suppressed or counted as a separate product failure.
- The accessibility tree aggregates the statistics switch into its row. Pressing the row label does not toggle it; tapping the actual switch, located from the current screenshot, does. VoiceOver semantics remain unqualified.

## Chinese diagnosis and safe attempts

1. Reproduced the same blank/tofu Chinese on the combined app. Existing Batch 8 evidence also shows system dialogs/Safari affected.
2. Independent system-font probe (`glyph-check.m`): `font=.PingFangUITextSC-Regular`, ten glyph IDs all 0; `FAIL missing=10 count=10 unique=1`. Explicit PingFang also resolves to one repeated LastResort glyph, not usable Chinese. The Mac's system-font rendering probe resolves distinct Chinese glyphs.
3. Runtime PingFang font file exists. CoreText reports the requested font unavailable and falls back to LastResort; parsing/registration in a throwaway process returns font-manager error 105. These facts locate the failure below React Native but **do not establish a specific OS defect or prove runtime-file integrity**.
4. Restarted only the QA Simulator's font service: same failure. No system-wide daemon or Mac preference was changed.
5. Public CoreText font-asset matching completed as already matched, without downloading; the original glyph probe still fails. The system Settings -> General -> Fonts screen exposes no usable download content in this runtime.
6. No custom App font, global scale cap, runtime-file replacement, cache purge, Simulator erase, or Keychain reset was introduced. No misleading Chinese “after fixed” image exists.

Next required condition: a healthy supported Simulator runtime (repair/update after sufficient free disk, or a separate authorized device run). Current free disk is about 12 GiB, below the shared native rebuild floor; no runtime download or rebuild was started. Re-run the independent glyph probe first, then the full Chinese light/dark and default/intermediate/maximum matrix. Passing English is not Chinese acceptance.

## Checks and preservation

- Combined mobile typecheck passes. Initial suite: 473 passed, 8 skipped; three network-listener tests blocked by sandbox EPERM. Those tests and the three new actual Settings/telemetry-owner regression tests then pass in the allowed local environment (15 tests across two files). Existing source CI for #2022 is green; this is distinct from native evidence.
- Only the QA-created statistics preference was exercised. Its noticeSeen flag was reset for first-notice layout verification; no production telemetry destination/token was configured.
- Original Host process and data retained; no restart/reseed, unpair, approval decision or Host mutation. Existing unrelated untracked QA documents retained.
- Pending: Chinese environment repair, Android/physical/VoiceOver/paired-Host acceptance and Human QA. No merge or release authorization is implied.

Runner: `codex/local/01a14154-2b70-7442-97ed-e9b5e9e5aa39`. Source owner for #2022: `codex/local/01a14132-1883-78f2-8887-c2dabf6d8c38`. Refs #2004 / #1935.

## Repeat the font preflight

On the queue-assigned Apple Silicon Simulator, with its UDID supplied privately:

```sh
xcrun --sdk iphonesimulator clang -target arm64-apple-ios26.0-simulator \
  -fobjc-arc -framework UIKit -framework CoreText glyph-check.m -o /tmp/bh-glyph-check
xcrun simctl spawn "$QA_SIMULATOR_UDID" /tmp/bh-glyph-check
```

A nonzero exit means the known sample is missing or all characters resolved to the same fallback glyph. A zero exit establishes glyph availability only; inspect the real Chinese App afterward for layout, contrast and input usability.
