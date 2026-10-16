# #1973 verification evidence

PR #1998 · source `8d619fd5be12f8b4780994057d826e1714635e73` · base `fd337d929a5dbd794af69aa96d40041c4287c899` · 2026-10-16 UTC.

This packet is separate from the implementation commit so publication does not invalidate the tested source. All source links in the report are pinned to that source commit.

- [Full report: behavior paths, metrics and complete script ownership](coverage.md) / [JSON](report.json).
- [Independent qualified Activity Center row](idle-row.md).
- [Actual screenshot](verified/activity.png), [full ARIA](verified/aria.json), [same-Bot authority](verified/after.json), [diagnostics](verified/diagnostics.json), [empty console errors](verified/console.json), [immutable run metadata](verified/run.json), [visual inspection receipt](verified/visual-review.json).
- [Chinese review explainer source](explainer.md) / [standalone HTML to download and open](explainer.html). The HTML explains the report; it is not runtime evidence.

## Real path and result

Isolated task-owned DSH 0.2.0-rc.2; macOS arm64, Node v24.21.0, Chromium 153, English, dark, 1440x1100. Public CLI created `AX idle 1792157405603`, ID `bot-849ecc682e7649cca6b9105ea4203dbb`. Real Web actions opened Bot mode → Activity Center → Show idle Bots.

The screenshot and full ARIA visibly show that Bot as **Idle**, **No Session is executing**, with **Actions waiting 0**. Before/after activity, attention and overview CLI reads agree on the same ID, idle state, no sessions or actions, and empty attention. The report qualifies exactly one catalogue row; all other 53 rows remain unrun. This is not the product coverage rate.

The automated run initially required visual review. `verified/before-visual-review.md` preserves that original pending result; the later immutable inspection receipt qualifies the same untouched screenshot/ARIA. The original named-attempt links in that historical pending file are not the shared link index; use the links above.

The task Host was stopped and its disposable Profile removed after collection; evidence was retained. No model call, native device, IM message or production receiver was used. This path does not qualify the complete Inbox. Human QA for this report remains pending.

## Failure and expiry observations

| Selection | Observed result | Evidence |
| --- | --- | --- |
| No run selected | not-run, 0 qualified rows | [not-run.json](not-run.json) |
| Superseded review-fix source `4f9ab58e9c9bc7f84dd38f79208ad6a8cb02411d` | needs-revalidation at this source, 0 qualified rows | [historical-source.json](historical-source.json); [preserved actual attempt](superseded-reviewfix/run.json) |
| Current packet copied privately, screenshot removed | needs-revalidation, missing activity.png; original retained | [missing-evidence.json](missing-evidence.json) |
| Real journey attempted after stopping its own Host | blocked before creation; partial record retained | [blocked-report.json](blocked-report.json), [blocked/run.json](blocked/run.json) |

Synthetic wrong-behavior and many-to-many cases are unit regressions, not product runtime proof. No existing failed attempt was overwritten.

## Validation layers

- Local at final head: 59 tests in report, Activity Center validator, feature-map and verify-app suites; lint, format and build passed. Root/mobile typecheck and 27 CI-selected local tests passed on the initial head; final-head static/typecheck and affected tests are checked by CI. The full local suite was not run for this docs/report-only diff.
- Independent Standards and Spec source reviews at this exact head: zero actionable findings on both axes. These are agent reviews, not Human approval.
- CI: see [exact-head run](https://github.com/BotHarness/DeepSeekBot/actions/runs/38908266741); passed: affected tests, static/build gate, docs site and isolated Host smoke. Full shards and model tests were skipped by plan.
- Visual: real product screenshot and ARIA inspected; HTML reviewed at desktop/narrow widths separately.
- Native historical records: #1919/#1954 source/evidence/device/limits are in the report; none qualifies current source. Shared resources were not touched.
- Human QA: follow [the report guide at this source](https://github.com/BotHarness/DeepSeekBot/blob/8d619fd5be12f8b4780994057d826e1714635e73/docs/agents/verification-inventory.md), run the report, select a fresh idle attempt, and compare the single qualified row with unrun rows and explicit gaps. The Human explicitly authorized merge after fixes and passing checks; this is not a claim of hands-on Human QA. No release or deployment was performed.

## Review correction and main integration

CodeRabbit identified that shell redirection into an unignored checkout creates the report before the dirty-source check. The guide now keeps the entire packet external/ignored and generates into an external temporary file before copying. [Actual before/after reproduction](coderabbit-output-reproduction.json) was run against the original clean `1df01443f31a114210a2fc7846fd95e07f5aaeba` proof: direct output produces dirty/needs-revalidation; external temp produces clean/pass.

CI then caught a newly merged main feature document, `im-conversation-mirroring.md`. The branch includes main `fd337d929a5dbd794af69aa96d40041c4287c899` and its new inventory association. The report now has 17 feature documents and 54 grouped behavior rows; all 131 scripts remain, 11 mapped. IM mirroring is **not-run**, not qualified by the Idle Bot path.

The initial [published packet](https://github.com/BotHarness/DeepSeekBot/blob/ad0a79280f77e47cde2c69aa8d7152e8e394555c/.github/pr-assets/1973-verification-inventory/README.md) and the intermediate [review-fix attempt](superseded-reviewfix/run.json) remain historical. Neither qualifies this final commit. No failure or partial attempt was overwritten.

CodeRabbit's latest status says **Review rate limited**, so it is not a new review. Its original actionable thread is resolved; independent Standards and Spec agent reviews rechecked the integration and found no actionable issues. The generic docstring warning is inapplicable: this repository's source policy prohibits source comments.
