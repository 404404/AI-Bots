# Batch 6 joint QA — 2026-10-16

Runner: `codex/local/01a1396a-523c-7c80-8ea7-33478f7326a2`.
Human authorized the shared Simulator takeover and one local native rebuild, not distribution.

## Exact inputs

| Input | SHA |
| --- | --- |
| Frozen main | `aad8cc949be414aece6605140af738745298a12d` |
| PR #1942 | `8bd1dc49bea02ee78091b0919fd0f346c78a582d` |
| PR #1945 | `379e8dba2e5a6f07a7d3f2fd888fb2b9f52fc096` |
| PR #1946 | `e1131e0f7a228f8ce74934a4181c233c5ea13ebc` |
| PR #1948 | `99af47fd7dc533c3dad5a8ee9301507d47b7ca6a` |
| Local-only qa/batch-6 | `1f0531dba1f4ea9536b55bd1d9dbe84bc2a420e8` |

Expo 57 / React Native 0.86.3 development Simulator build, iOS 26.
Native identity: `ai.botharness.deepseekbot.dev`, version `0.0.1`, build `1`.
Native stamp: `2026-10-16 14:14 · qa/batch-6`, source `1f0531dba`.
Host: source version `0.0.0`, `darwin/arm64`, protocol 1, pinned DSH `0.2.0-rc.2`.
This is not a TestFlight, Android, npm-installed or signed-distribution artifact qualification.

## Source/build checks

- Offline frozen-lockfile install, root build, root/mobile typechecks passed.
- Selected batch tests: **2,237 passed / 9 skipped** (284 passing / 7 skipped files).
  Command: `pnpm vitest run apps/mobile packages/client/test packages/core/test/release-service.test.ts packages/core/test/cli-host-admin.test.ts packages/core/test/device-compatibility.test.ts`.
- This is not the full suite; the earlier 2,322-test run belongs to an older integration SHA.
- Native Xcode build passed. An initial unsigned build failed secure storage with
  `ERR_NOTIFICATIONS_KEYCHAIN_ACCESS`; incrementally rebuilding the same Simulator app with
  local ad-hoc signing fixed pairing. No cloud build or credential/account change.
- Final free disk: about 13 GiB; sole shared DerivedData: 3.6 GiB. No further rebuild attempted.

## Runtime result matrix

| PR / boundary | Observed result | Remaining gate |
| --- | --- | --- |
| #1942 authenticated compatibility | PASS: unauthenticated HTTP 401; authenticated CLI reports exact Host source/platform/protocol. | Packaged artifact combination and approval checks not exercised with real distribution artifacts. |
| #1942 native connection | PASS: pair two real disposable Hosts, switch rosters, persist pairing across app restart; compatibility warning explicitly does not claim artifact/Human approval; native and Host IDs visible. | Mismatch, legacy 404 and unsupported-push native cases untested: local fault proxy failed its normal transport baseline. Direct pairing worked before and after proxy removal. |
| #1942 real native DM | PASS: sent `23 times 29` from the native composer; visible reply `667`; canonical timeline confirms handled Human input and linked Bot reply. | No physical phone, Android, APNs, notification-action, Browser/Computer refusal or packaged-install test. |
| #1942 full client | PASS: compatible Host opens authenticated full client, renders same DM/reply, exits back to native. | Incompatible full-client admission not exercised live. |
| #1945 busy refusal | PASS: during a real Agent turn, confirmed install and restart return `release-busy`; idle restart returns `release-not-pending`; source install returns `release-unavailable`. | Compaction, queued input, Jobs, delayed restart, real installation and rendered Web busy card not exercised live. |
| #1946 Beta choice | PASS: real Web Join/Leave Beta agrees with CLI; restart preserves A's Beta choice; independent Host B stays stable; missing confirmation refused. EN/ZH light/dark captured. | Two Profiles sharing one home, installed-prerelease exit and stable recovery not exercised. |
| #1948 reminder | PASS: stable suppresses with `not-beta`, Beta source build with `no-update`; invalid version has coded refusal. | New-candidate claim/card, multiple browsers, Later/reopen/manual recheck, at-most-once persistence and rollback are source-tested only. Source version 0.0.0 cannot discover real updates. |

Real-model caveat: the initial Go route failed with quota exhaustion. Only the disposable test
Bot was changed to the existing official DeepSeek route; its CLI and native DM then passed.
No quota purchase or global/default model change occurred.

The unchanged standard `e2e-mobile-sim.mjs` runner was NOT run because it erases/creates Simulator
state. This batch used manual agent-driven native journeys and real authenticated production
APIs without erasing the shared device. Do not call this a complete standard E2E-suite pass.

## Diagnostics and screenshot interpretation

- Real Web Client remained usable, but developer diagnostics reported `shell-lost` / `shell-timeout`
  in Bot mode. Preserved as an unresolved diagnostic observation, not an all-green gate.
- Native AX omitted some rendered Bot text; screenshots and canonical timeline corroborate `667`.
  WebView inspection used the driver's XCTest fallback. No claim of clean AX diagnostics.
- `web-<locale>-<theme>-stable/beta.png`: same-head UI state comparisons, **not base-vs-head code
  before/after**. Eight cropped Settings images. Before-code captures remain absent.
- `native-settings-*.png`: real native compatibility/build identity, both themes. Settings
  truncates its explanatory subtitle; the Chats banner shows the full warning.
- `native-dm-*.png`: real native send/reply, both themes; all conversation content is synthetic QA data.
- `native-full-client-light.png`: compatible full-client admission and same reply, light only.
- The floating gear is Expo's development overlay, not shipping app UI.
- No credentials, personal conversations, machine identity, team ID or Simulator identifier is published.

Human QA, remote main merge, store testing and release remain pending. Both #1931 and #1932 stay open.
