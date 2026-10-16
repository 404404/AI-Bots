# #1973 verification evidence

PR #1998 · source `1df01443f31a114210a2fc7846fd95e07f5aaeba` · base `3dc01bd75443810f7cccc5dc942117dee6e98bc6` · 2026-10-16 UTC.

This packet is separate from the implementation commit so publication does not invalidate the tested source. All source links in the report are pinned to that source commit.

- [Full report: behavior paths, metrics and complete script ownership](coverage.md) / [JSON](report.json).
- [Independent qualified Activity Center row](idle-row.md).
- [Actual screenshot](verified/activity.png), [full ARIA](verified/aria.json), [same-Bot authority](verified/after.json), [diagnostics](verified/diagnostics.json), [empty console errors](verified/console.json), [immutable run metadata](verified/run.json), [visual inspection receipt](verified/visual-review.json).
- [Chinese review explainer source](explainer.md) / [standalone HTML to download and open](explainer.html). The HTML explains the report; it is not runtime evidence.

## Real path and result

Isolated task-owned DSH 0.2.0-rc.2; macOS arm64, Node v24.21.0, Chromium 153, English, dark, 1440x1100. Public CLI created `AX idle 1792156227846`, ID `bot-8ec110bd68d5431c85477c8047c1c3e4`. Real Web actions opened Bot mode → Activity Center → Show idle Bots.

The screenshot and full ARIA visibly show that Bot as **Idle**, **No Session is executing**, with **Actions waiting 0**. Before/after activity, attention and overview CLI reads agree on the same ID, idle state, no sessions or actions, and empty attention. The report qualifies exactly one catalogue row; all other 52 rows remain unrun. This is not the product coverage rate.

The automated run initially required visual review. `verified/before-visual-review.md` preserves that original pending result; the later immutable inspection receipt qualifies the same untouched screenshot/ARIA. The original named-attempt links in that historical pending file are not the shared link index; use the links above.

The task Host was stopped and its disposable Profile removed after collection; evidence was retained. No model call, native device, IM message or production receiver was used. This path does not qualify the complete Inbox. Human QA for this report remains pending.

## Failure and expiry observations

| Selection | Observed result | Evidence |
| --- | --- | --- |
| No run selected | not-run, 0 qualified rows | [not-run.json](not-run.json) |
| Actual #1972 source `1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31` | needs-revalidation at this source, 0 qualified rows | [historical-source.json](historical-source.json); [original shared packet](https://github.com/BotHarness/DeepSeekBot/blob/0b49e18941443bbb9d3679cc96cb88c7925810ed/.github/pr-assets/1972-activity-idle/README.md) |
| Current packet copied privately, screenshot removed | needs-revalidation, missing activity.png; original retained | [missing-evidence.json](missing-evidence.json) |
| Real journey attempted after stopping its own Host | blocked before creation; partial record retained | [blocked-report.json](blocked-report.json), [blocked/run.json](blocked/run.json) |

Synthetic wrong-behavior and many-to-many cases are unit regressions, not product runtime proof. No existing failed attempt was overwritten.

## Validation layers

- Local: 59 tests in report, Activity Center validator, feature-map and verify-app suites; lint, format, root/mobile typecheck and build passed. The CI-selected local regression also passed: 27 tests in 3 files. The full local suite was not run for this docs/report-only diff.
- Independent Standards and Spec source reviews at this exact head: zero actionable findings on both axes. These are agent reviews, not Human approval.
- CI: see [exact-head run](https://github.com/BotHarness/DeepSeekBot/actions/runs/38905776325); passed: affected tests, static/build gate, docs site and isolated Host smoke. Full shards and model tests were skipped by plan.
- Visual: real product screenshot and ARIA inspected; HTML reviewed at desktop/narrow widths separately.
- Native historical records: #1919/#1954 source/evidence/device/limits are in the report; none qualifies current source. Shared resources were not touched.
- Human QA: follow [the report guide at this source](https://github.com/BotHarness/DeepSeekBot/blob/1df01443f31a114210a2fc7846fd95e07f5aaeba/docs/agents/verification-inventory.md), run the report, select a fresh idle attempt, and compare the single qualified row with unrun rows and explicit gaps. No merge/release/deploy is authorized by this packet.
