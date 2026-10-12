# #1041 — accepted private-Lark source slice

Implementation/runtime QA head: `ad7c204acd344d24de337ada0ca5e7460853eaac`.
Final source head: `5bae6e25e578acb8681f76e2b6a82c999d4f5502` (only ADR/tutorial status and generated font changed after runtime QA).
Task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`.

The Human accepted the first slice in this thread. The earlier capture limitation is resolved: the real Lark test/failure screenshot, accepted-route sidebar and destination-disabled sidebar were captured and visually inspected. Images are cropped to the task conversation/control; no credential or unrelated conversation is published. T3's Lark preview raster is soft, but the actual visible message DOM and notification/receipt identities were checked separately.

## Native behavior and canonical correlation

- Current QA1 window was explicitly authorized; local foreign QQ receiver was observed but left untouched. Only this task's isolated Host used QA1, with the checked source Provider pin. No App permissions/shared credential values changed.
- Actual private `/pair` request `74A61BE285` for MUFENG YANG was approved for exactly approve/reject; selected as the existing management destination in the real sidebar.
- Sidebar Test failure alerts produced labelled notice `ba8ae68a-843b-447f-8697-5589e0fc300f`, accepted once, Lark receipt `om_x100b63f91ccec0a0eedb1529eacff42`.
- Genuine owned Runtime failure `session-failure-f2ea3c09-e17a-4645-83d9-d4f3b17dd5d3` produced notice `f7a1f78a-73de-4224-8348-5cb11440a0a1`, accepted once, receipt `om_x100b63f913ffaca4ed52cbde754d846`. Real Lark shows fixed status, orchestrator/Session identity, matching notice reference and Web inspection instructions, without raw AUTH error, credential, prompt or tool arguments. No additional permission was granted.
- Restart/normal-key restoration preserved both one-attempt accepted records; fresh message replied 4757. Runtime's existing failed-work recovery remains distinct from notice recovery.
- After first feedback, disabled the event in the actual sidebar and generated real failure `session-failure-70812aa5-5276-4219-b5c4-83df0e30b6cb`; notification count stayed 3.
- Enabled the event but disabled the management route in the actual sidebar. Real failure `session-failure-51ba3bb7-ebc6-44b1-a719-d7ba15852584` produced record `ed39490f-f9da-40e5-a943-9a46697852cc`, cancelled / destination-unavailable / zero attempts. Sidebar shows unavailable and disables test send; Lark still has the original two notices.
- Restored the management route and normal inherited model environment. Fresh reply 9991; four total records (two accepted, two cancelled), no historical replay, reviewer capabilities unchanged. Existing Runtime recovery may complete admitted failed work; these are not replayed notifications.
- Exact receiver stopped, QA1 window released, task test settings/model environment restored. No merge, publication, product pin promotion or deployment.

## Evidence

- `lark-test-and-failure.png`: real QA1 private messages, 1280×800 CSS viewport, cropped task output.
- `accepted-route-deliveries.png`: real management destination and two accepted/one cancelled records before negative checks.
- `route-disabled-delivery.png`: real destination-off state and new cancelled failure record.
- Existing matched light/dark and short-screen base/head screenshots remain valid; their runtime UI code is unchanged at the final docs-only head.

## Verification limits

13 failure-alert tests cover actual deadline expiry, Provider replacement, persisted pending/sending restart, ownership, deduplication, revocation, finite retries and unknown-outcome refusal. Existing approval/sidebar/database/bridge regression passed. Real negative checks cover event-off and route-off; replacement/unknown-outcome race injection remains automated coverage, not a claim of native Lark fault injection.

Full implementation-head CI passed. Final docs-head CI is tracked on PR #1468. Local direct docs-package build verifies the edited guide; the umbrella docs command encountered the existing Windows `spawnSync pnpm ENOENT` shim limitation before rendering. No unrelated build-script change was made.

This source slice qualifies private Lark only; group/provider/native-wait/Host-down scope remains with existing owners. It is not a published release or deployment. First-slice Human feedback is accepted; PR delivery/merge remains separate.
