# Lark scoped-rule native QA

Host head: `fca0d383193791ee0f5a45cdafcd6e9a5794639f`; base: `5134234e18ffd41d566fd94a0ccd214534f92318`.
Provider head: `bc795b9cb576c411f0c94997e025b72a94c4f1fb`; base: `99df05b7c2a14ebb6c122e4f22d655b6b9cbacc7`.
Current PR documentation head: `dbe952ad7f7261eac377d36c3694574b1e8cddaa`; only documentation/screenshots/release wording changed after the native runtime head. Current-head Standards and Spec reviews each report zero remaining findings.

Date: 2026-10-12. Exclusive QA1 App, task-isolated Host, one receiver at a time. The receiver is stopped after completed turns.

The Human accepted the exact first slice previously and the all-opaque first slice during this run, before scope/revocation expansion. No merge, publication or deployment is implied.

## Actual workflow

| Step | Native facts and visible outcome |
| --- | --- |
| Baseline | Actual PR base Host and its qualified older Provider show Allow once/Reject only. Reject prevented execution. The captured initial card was still cached after rejection; its controls illustrate the baseline entry, not a currently pending request. |
| First candidate request | `1033_SCOPE_ALL_A_1600` asked 28 / decided unavailable 29 / result 30. No rule or execution. IM-only Bot had no canonical Web DM. A red regression reproduced it; the existing Channel Store now creates the canonical DM on demand. |
| Fresh fixed request A2 | Native pwsh call 61 / asked 62. Bot Web DM had never been opened. Actual card independently offered matching and all-opaque entries. |
| Preview and Back | High-risk all-tools/all-input disclosure, complete input and scope inspected. Back cleared the confirmation, left zero rules, and left the native call awaiting approval. |
| Fresh preview and Confirm ALL | New kind-bound confirmation; actual Lark operator confirmed. One canonical all-opaque rule. Native decision 63 allowed-once / result 64 contains `BH1033_SCOPE_A`. Final card displays the native result and has zero controls. |
| New different input B | Call 91 / asked 92 / decided allowed-once 93 / result 94 contains `BH1033_SCOPE_B`. No additional approval delivery/card; distinct native audit remains. |
| Scope change C | Created an empty task-local native Workspace through its authenticated controller, then a read Grant through the existing BotHarness RPC. Grant identity/write revision changed the displayed scope. Call 125 / asked 126 remained pending; real card Reject produced decision 127 / result 128, with no execution or stdout. |
| Revoke and restart D | Restored the original no-Grant scope, revoked the canonical rule using authenticated `toolApprovalRuleRevoke`, then restarted the same isolated Profile. The rule retained its original `revokedAt`. New identical B input: call 159 / asked 160 needed a new card; Reject produced 161 / result 162. No execution or stdout. |
| Final rendering | Refresh/reselect the same private conversation: both C and D cards show Rejected and zero controls. The earlier saved-rule card shows fixed-text Approval rule disabled, with no input or controls. |

Five uniquely marked actual IM requests each correlate to a handled Inbox Admission and a provider-accepted reply Outbox record. The first is the preserved unavailable failure; A2/B are real executions; C/D are real rejections. Other canonical Channel/decision observations are excluded from these IM counts.

## Cutoff and rendering limits

The first revoke queued a receipt update, but the test immediately stopped the Host for restart and interrupted that update. The delivery correctly recorded unknown-outcome. After proving D could not match the revoked rule, the same idempotent authenticated revoke command refreshed the same known receipt. It did not create a rule, decision, new card or execution. The update then recorded updated, and the real refreshed webpage displayed the disabled fixed text. This is an explicit refresh, not proof of automatic recovery from an interrupted update.

Lark Web cached several updated cards and needed refresh/reselection. Screenshots are actual 1280×1200 light-theme captures, cropped to the designated card/conversation. Grey rectangles redact only private local paths/scope strings; tool inputs, disclosure and outcomes stay visible. The same baseline/current tool and input are shown, with isolated paths necessarily different. Wide-card preview contains both Confirm and Back. Native Lark dark-mode rendering could not be established; the browser color-scheme preference did not change Lark's theme. Role editor light/dark comparison remains in the separate accepted exact evidence.

## Runnable path

Use the PR-pinned AX development Provider with a new isolated Profile and an exclusively assigned Lark QA App. Configure a DM-origin management reviewer with approve/reject/save-rules and the existing private approval route. Leave its Bot Web DM unopened. Send a print-only native pwsh request; preview all-opaque, Back, preview again and Confirm ALL. Send a different print-only input in the same scope. Add a task-only Workspace Grant, send another new request and Reject it. Remove the Grant, revoke the rule, restart the Profile, send the earlier input as a new message and Reject it. Read the same canonical Web rule and refreshed Lark receipt. Stop the exact task receiver after completed turns. Never replay old failed messages or run two receivers for the App.

## Source and CI

64 focused missing-DM/approval/rule/store tests pass; typecheck, full format check, lint and Host build pass. Provider's 86 relevant tests/build pass at its unchanged head. Standards and Spec reviews at the current Host/Provider heads each have zero remaining source findings. Documentation content builds 476 pages. The Windows umbrella docs command failed because its presentation subprocess could not resolve pnpm; the direct docs build and current full CI both passed.

Current full verify: https://github.com/BotHarness/DeepSeekBot/actions/runs/38220570276
Current preparation: https://github.com/BotHarness/DeepSeekBot/actions/runs/38220570149
Preparation does not publish or deploy. The Provider remains a qualified source candidate; this does not upgrade the published product Provider artifact.
