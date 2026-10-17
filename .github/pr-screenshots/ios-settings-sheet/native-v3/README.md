# Settings native regression — PR #2112

Date: 2026-10-18 JST. Automated Simulator evidence; no Human approval or merge.

## Source and binary identity

- PR head: `baa5777a86b46f39bb1232de214314c5d0ce288f`.
- Frozen runtime: `qa/batch-11` at `c6f791671d14b5b627d3a0c28d5f63ac61cd2b4a`. The PR head adds documentation and a Maestro flow only; app routes, src, native configuration and lockfile have zero diff from that runtime.
- Native build: `b8524d02fc4c080573971a291f740651d451ca4a`, Expo SDK 58 / RN 0.88; all checked native inputs unchanged. Executable SHA256 `bf3816640061b94eae46a41f882b781d7eb5ad3bdcb54c5ccbed9a178ab10e70`.
- iPhone 17 Pro Simulator, iOS 26.0, portrait, English, 402×874 points / 1206×2622 screenshot pixels. No erase or uninstall; empty dedicated Settings QA Host.
- The visible Version value `579480205` is the Metro-start build stamp, not the final live JavaScript revision. Runtime identity above is from the frozen checkout and verified source diff.
- Baseline: the six Settings presentation implementation files from main `b6274264e319673fe9aace3fe7d236cfe7f4eac8` were loaded into the same binary/environment before final source was restored. This is a matched presentation baseline, not an independent full-main build.

## Matrix

| Appearance | Content size | Baseline | Final |
| --- | --- | --- | --- |
| Light | large (default) | Blank Settings | Open → Notifications → Back → Close PASS |
| Light | accessibility-large | Blank Settings | Same path PASS |
| Light | accessibility-extra-extra-extra-large | Blank Settings | Same path PASS |
| Dark | large (default) | Blank Settings | Same path PASS |
| Dark | accessibility-large | Blank Settings | Same path PASS |
| Dark | accessibility-extra-extra-extra-extra-large | Blank Settings | Same path PASS |

`before-results.json` false downstream values mean **blocked by blank root**, not separately executed failures. `after-results.json` records the executed final path. Each case has a matched root pair; child screenshots have no runnable baseline because the root was blank.

## Extended checks

All passed at the frozen final runtime, default/light unless specified:

1. Scroll to the final About anonymous statistics row; fixed title and Close remain visible; expand/collapse its details.
2. Select Complete bubbles, verify its canonical local preference file, drag the root handle down, and confirm return to Chats.
3. Cold relaunch; verify both the retained canonical value and selected native row; restore original Streaming through the UI.
4. Close from scrolled content, reopen, enter Notifications, drag its handle down, reopen at the Settings root.
5. Change system text size while open from default → maximum → default, reach the last row, then close.

[Recording](extended/settings-regression.mp4) is an H.264 review copy at 604 px wide, with original timing and no audio; the original native HEVC recording is retained locally. [Contact sheet](extended/contact-sheet.png) is sampled evidence, not every frame. This is functional regression evidence, not a frame-rate measurement.

The first implementation's text Close clipped at maximum text size; it was replaced with an X carrying accessible name Close, then all six cases were repeated. The first extended automation assertion used an interactive-only snapshot which omitted the visible last row; the full native tree and actual press proved it reachable. Neither failed attempt is counted as final success.

## Limits and handoff

- The floating gear is the Expo development-client Tools overlay, not Settings UI. No screenshot was repainted.
- Notifications navigation is tested; Simulator development build reports it cannot receive notifications. No APNs delivery claim.
- Final-head physical iPhone, Android native, VoiceOver/TalkBack, Reduce Motion and Human QA remain untested. Chinese rendering is unqualified because this Simulator also shows missing CJK glyphs in system surfaces. App is portrait-only and does not support tablets.
- Maestro flow updated but not run (Java runtime unavailable); this native journey used agent-device/XCTest.
- This implements Settings only. The bilingual overlay contract describes other overlay families as a future target.
- Task preference restored; only task QA pairing removed; task Host stopped. Shared original app/data/cloud configuration and compatible Batch10 source/Metro are returned to #2103; phone Products and shared QA Host preserved.
- Applicable CI passed on the final PR head: [verify run](https://github.com/BotHarness/DeepSeekBot/actions/runs/39062663292). Real-model scenarios skipped; Draft CodeRabbit reports skipped review, not substantive approval.
