# #2053 post-CI correction evidence

PR #2066 head `f80e14fac927e08046bf46e2c6a33ddb1eb25944`. This supplements, and does not overwrite, the [fixed pilot archive](https://github.com/BotHarness/DeepSeekBot/blob/275d3f7ee1b9a24109b516de44e3da220cdd651a/.github/pr-assets/2053/README.md).

The earlier head `b625bd6a75ff0069d94f7a97aa413489764b7552` failed CI with four assertions across three files (240 files / 2300 tests passed). One was a real regression: after moving spoken-state marking behind successful sends, the Human DM branch omitted its marker and could request an unnecessary approval preface. This head restores that single post-commit marker. The two attachment tests now assert the explicit `committed` status, and the bridge list includes `channelGroupSendReview`.

The original failing DM test was reproduced and all three approval-notice tests pass after the fix. Typecheck, lint, format and build pass. A local batch exceeded the 15-second timeout on the 20-Bot attachment case and stalled afterward; it was interrupted, not reported as passing. Follow-up isolated tests and the new CI run are linked from the PR.

The fixed 40-pair model pilot still binds runtime `90749c1e13068ed9e8f57ab629146b5bac17468f`. It was not rerun for this DM-only change; it is not an exact-head model evaluation. Group send-review and model-runner logic remain unchanged. The follow-up CLI path runs without the model; the frozen pilot cost ledger is unchanged.

An explicitly selected Node 24.21.0 / DSH 0.2.0-rc.2 isolated Host was rebuilt/restarted from this source. The direct CLI again enabled Group review, read 14:00, held the stale draft after a Human correction, reread and committed only 15:00. `cli-proof.json` contains canonical results; `post-ci-proof.png` and its ARIA snapshot capture the actual Web Client, with zero console errors. This separate integration case does not replace any pilot failure.

`pr-explainer.html` is bound to this exact head. Download and open it locally; GitHub serves HTML as text. It is an explanation, not Human acceptance or a replacement for runtime evidence. The original offline ZIP remains the full-history review artifact: independently score before reveal and export the Human ratings.

Registered correction/unrelated budgets still fail. Human acceptance, merge and deployment remain pending. #2053 stays open; #2054–2056 stay gated.
