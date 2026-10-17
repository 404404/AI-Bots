# #2053 Human review: choose Left or Right

PR #2066 · review UI head `e3d72079bd4961e876a605271ff5954c9f9c8a0b` · Human acceptance pending.

Download `evidence.zip`, extract it, and open `history.html` (or `history-full.html` for every captured runtime frame). Read the two scrollable history cards and choose Left or Right. The choice saves automatically and advances to the next unreviewed pair. No dimension scores or reasons are required. You can undo the last choice, return to any pair, or skip without recording a preference. Export `2053-human-review.json` to keep the selections.

Versions, LLM judgments and costs remain hidden until a choice is saved and you explicitly reveal that pair. Previous choices, undo events and post-reveal changes remain in the export. Existing five-dimension reviews are retained under their original mode; new choices use `pairwise-preference-v1`. This is the Human's explicitly requested protocol revision, not a re-interpretation of earlier ratings. Neither a preference nor its count automatically accepts failed budgets.

All 40 pairs and all 269 collected canonical message bodies remain available. Missing history is labeled; skipping keeps the pair unreviewed. The existing fixed sample/anomaly set still identifies 33 required pairs. Synthetic browser QA votes were cleared and are not Human acceptance.

`simple-review-qa.json` records real browser checks of save/advance, reload, undo/history retention, post-reveal revision, JSON export, complete message coverage and narrow-screen layout, with zero page errors. Six focused reporting tests, lint, formatting, feature-map and changelog checks passed. See PR checks for latest-head CI. Screenshots compare the former rubric form and the new cards.

The model pilot remains frozen at candidate `90749c1e13068ed9e8f57ab629146b5bac17468f`, B0/Bi `73056fc59dcac42c3fd7e6cb1586f6c1c4e37157`. Raw pilot data, dual-order judge outputs, token/cost records and budget failures are unchanged. Host/CLI/model-runner sources are unchanged since runtime-fix head `f80e14fac927e08046bf46e2c6a33ddb1eb25944`; the current head only simplifies Human review and updates its tests/docs. No model re-evaluation was run for this UI change.

The full ZIP includes raw evidence, previous integration proofs, source/hash manifest, the exact-head explainer and review UI screenshots. The earlier v1/v2 archives remain immutable. Only #2053 is implemented; #2054–2056 remain gated pending Human full-history feedback.

<details>
<summary>Evaluation results — read after your independent scoring</summary>

40 fixed pairs / 80 attempts, no replacement retries; 37 pairs are fully comparable. Three runs failed with local API `fetch failed`: baseline cancel-or-revoke-8 and -9, candidate -10. Two independent Host health checks remained healthy; root cause is undetermined. A brief auto-install during the main merge overlapped late cancellation/revocation runs; this is recorded in `environment-deviation.json`, and latency inference for overlaps is confounded. The installation was interrupted; no Host restart or build occurred during the fixed pilot.

| Family | Valid pairs | Baseline / candidate successful valid runs | Mean known tokens, baseline → candidate | Candidate token change | Response p95, baseline → candidate |
|---|---:|---:|---:|---:|---:|
| Human correction | 10 | 0 / 10 | 79,218 → 137,661 | +73.77% (budget +25%, fails) | 4,823 → 8,979 ms (budget +50%, fails) |
| Quiet | 10 | 10 / 10 | 74,197 → 74,734 | +0.72% (budget +5%, passes) | 7,357 → 5,397 ms |
| Unrelated message | 10 | 10 / 10 | 84,333 → 156,261 | +85.29% (budget +25%, fails) | 6,868 → 11,879 ms |
| Cancel or revoke | 7 | 4 / 9 | See per-attempt report; missing buckets retained | Inconclusive with missing data | Correct silence has no reply latency; never zero-filled |

Correction candidate held 10/10 obsolete drafts and adopted 11:00. Quiet candidate held 0/10. Unrelated candidate held 10/10 and still delivered the required answer, so the pause/cost is real. All five candidate cancellation histories stop without an obsolete notification. Group revocation already worked in the baseline; do not claim a new permission improvement. Four candidate revocation episodes are valid, one has a driver failure; all captured Group histories show no post-removal Bot message. Baseline revoke-2 sends a DM fallback, which is a separate destination/experience question, not a Group permission bypass.

Known pilot token subtotal: **8,439,873**, known runtime estimate **USD 0.326525808**. Two runs have unknown full token/cost totals. Native title requests (79 observed) and unreported provider retries have unknown usage, excluded rather than zero-filled. The late native-session audit found no additional formal-run responses. No Assignment/Subagent invocation appeared in the tool inventory. Full billing remains unknown.

The judge attempted 80 independent calls, 79 returned outputs and one failed; 2 returned outputs have citation/schema findings. Known judge tokens **188,665**, estimate **USD 0.068250636**; the failed request's billed usage is unknown. Across 37 valid pairs: 11 stable candidate wins, 0 stable baseline wins, 21 ties, 2 order disagreements and 3 invalid/missing judge pairs. These raw verdict counts do not override assistant semantic findings: two winner fields contradict their own reasons, revoke silence is inconsistently penalized, and quiet/unrelated replies receive inflated all-five scores despite invented durations and follow-up promises. Raw outputs remain intact.

`cost-ledger.json` separately includes diagnostics, the direct model preflight and judge calls. Overall known estimate is **USD 0.417174510** plus unknown charges. An earlier Go-provider preflight falsely passed a loose oracle by matching a 429 failure card; its original evidence and explicit correction are retained, and it is excluded from the pilot. The formal pilot uses `DEEPSEEK_API_KEY` through `deepseek-official/deepseek-flash@off` throughout.

Focused mechanism, CLI, adapter and reporting checks passed; final pinned typecheck, lint, format and build passed. Two earlier broader tests timed out under parallel load and passed with one worker. The later runtime-fix CI passed 243 files / 2304 tests, including the attachment boundary. The final report-only change passes five focused tests and browser export QA. A local 20-Bot attachment test timed out even with 60 seconds on both candidate and frozen B0; it is not specific to this slice and its cause remains undetermined. Full local suite and native-mobile QA were not run for this slice. See the PR for latest-head CI status. Human QA, merge and deployment are pending. **Do not accept or close #2053 solely from these results: the registered correction/unrelated budgets fail.**

</details>
