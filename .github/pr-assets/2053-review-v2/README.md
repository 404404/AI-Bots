# #2053 fixed pilot and Human review

Source PR: https://github.com/BotHarness/DeepSeekBot/pull/2066 · Head `8bd571dccfecb106c5be47b0da86889e5ef3d5bb`.

**Human acceptance pending.** Only #2053 is implemented. #2054–2056 remain gated.

Download `evidence.zip`, extract it and open `history-full.html` in a browser. It runs offline after both Hosts stop. `history.html` is a smaller standalone page with complete canonical histories and the last draft frame per event; the ZIP preserves every draft frame and raw judge output.

Read Left/Right histories, score independently, save, then reveal implementation, LLM ratings, assistant qualifications and known costs. Export `2053-human-review.json`; it retains original scores, post-reveal revisions and unreviewed IDs. Choose `insufficient` with an explicit reason when evidence is missing; dimension scores may remain null. Ordinary comparisons still require five valid scores per side. The fixed sample and all detected anomalies make **33 pairs required**; every one of the 40 pairs is available. A failed history collection is explicitly distinguished from silence.

The `manifest.json` binds all files by SHA-256 to B0/Bi `73056fc59dcac42c3fd7e6cb1586f6c1c4e37157`, runtime candidate `90749c1e13068ed9e8f57ab629146b5bac17468f`, and the PR head above. Main was merged afterward for Client/mobile changes. A later one-line Host fix restores the Human DM post-commit spoken marker; Group review and model-runner logic are unchanged. The model pilot was not rerun and is not an exact-head model evaluation. This v2 archive also fixes Human insufficient-evidence scoring; raw model histories, judge outputs and costs are unchanged. Latest integration checks explicitly used Node 24.21.0 and DSH 0.2.0-rc.2. The original shell banner alone did not attest a Node version.

`pr-explainer.html` explains ownership, retry limits and rollback at the current head. `validation-update.json` records the CI correction and the report-only follow-up. `post-ci-proof.png` and `cli-proof-post-ci.json` show another real CLI/Web run after the Host fix; this Host/CLI code is unchanged at the current head. `pinned-cli-proof.png` is a real post-merge Web capture: the direct CLI held the old 14:00 message, read the correction, and committed only 15:00. Console errors: zero. It is a separate integration case, not a pilot replacement.

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
