# SDK 58 iOS Simulator follow-up — 2026-10-18 JST

Result: **partial native verification; Settings FAIL.** No merge or source change performed by this verification task.

## Exact provenance

- PR #2024 final head: `66b1bd978e540d7dad43e6c5d2f40604cb57e63f`, already merged at `2026-10-17T09:47:41Z` by a separate integration task.
- Tested integrated batch: `qa/batch-10`, `a0b2919072af8fee62d8bb5fbb402fc52fb0d852`, based on main `6b6507762ebf5bb91533ada7b99d781890f6b183`; includes #2103. These results do not qualify the old standalone #2024 head.
- Expo 58.0.14 / React Native 0.88.0 / React 19.3.0; native Expo runtime label `exposdk:58.0.0`.
- Xcode 27.0 (27A266a), iPhone 17 Pro Simulator, iOS 26.0. Debug, iphonesimulator, ad-hoc signed.
- Build: **BUILD SUCCEEDED**, exit 0; codesign verification passed.
- Bundle `ai.botharness.deepseekbot.dev`, version/build `0.0.1/1`.
- Executable SHA256: `9afe634f14300fedd692f455eb2feaacdf07ba8d89e1777f5a0999a2f1afd753`.
- Reused frozen generated native inputs and the owner's existing Metro; no prebuild, dependency install, source switch or phone build modification. Prior Simulator DerivedData preserved intact locally. New DerivedData 3.9 GiB; about 35 GiB disk free after build.

## Results

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Native Debug compile, signature, same-identity install, launch | PASS | Actual SDK58 binary built and installed over SDK57 without uninstall or erase. |
| Old file retention | PASS, limited | All five existing Preferences/Cache files retain identical SHA256 immediately after install, before first launch. Data container path changed. Old state did not contain established settings/chat fixtures, so this is not full retained-state upgrade acceptance. |
| Pair two isolated Hosts, select A/B | PASS | Native UI shows SDK58 Mac A / B and their corresponding Ada / Bea bots. |
| Native text entry, send, real reply | PASS | UI entered and sent `Reply with exactly SDK58_IOS_OK. Do not call any tools.`; native screenshot shows reply. Canonical Host timeline has exactly one matching human entry and one bot reply. Thinking state observed; long token streaming and performance not tested. |
| Cold restart | PASS, limited | Both pairings, selected Host A and chat preview returned after explicit app relaunch. This does not prove offline cache behavior. |
| Settings and preference persistence | **FAIL / BLOCKED** | Tap Settings opens a completely blank native formSheet; AX shows only the sheet handle and development overlay. Reproduced again after cold restart. Preference toggles and light/dark comparison could not be completed. Cause not yet isolated. |
| Original QA Host / phone resources | Preserved | Task used two isolated Hosts, then removed only its own pairings through the UI and stopped both Hosts. Original shared Host, pending approvals, phone Products and owner Metro remained untouched. |

## Failures and limits retained

- First provider preflight returned Go quota 429. Only the test Ada bot was switched through public model-plan API to the available official DeepSeek model, which produced the mobile test reply; global credentials/model configuration were not changed. The earlier failure remains visible in the screenshot.
- Simulator system CJK font failure affects SpringBoard and the app; native log reports unavailable PingFangUI font. Chinese visual acceptance is **not passed**. This was also reported as a historical Simulator limitation by the next runner; no global runtime/font modifications were attempted.
- First agent-device screenshot returned black and subsequently SpringBoard; reopening restored the app. No app crash report found in the inspected reports directory. Cause of the interruption remains unconfirmed; no crash-free claim. Later direct simctl captures show the native app.
- Expo floating development-menu gear initially overlapped Settings. It was moved before the two actual blank Settings reproductions.
- Full Maestro journey not run: local Java runtime unavailable and that script erases the existing shared device. No new Simulator or erase was used.
- Simulated push routing/badge/actions, APNs, physical iOS permissions/camera/dictation, attachments/share, Browser/Computer, long streaming, offline recovery, full old preference migration and native write-failure injection remain **UNTESTED**. Android belongs to the separate runner's report.

## Handoff

The same installed app and existing Simulator were released back to #2103's owner after cleanup. Its later JS-only head and cloud-login results require separate provenance. Compatible queued work may share a future frozen batch; conflicted/stale PR heads must first be refreshed by their owners. No frozen batch was expanded mid-run.

Screenshots below are actual Simulator pixels, reviewed for personal data. Test Host and bot names are synthetic. The blank Settings screenshot is failure evidence, not UI acceptance.

- [Native chat after reopen](chat-after-reopen.png)
- [Two pairings after cold restart](two-hosts-restarted.png)
- [Blank Settings formSheet](settings-current.png)
