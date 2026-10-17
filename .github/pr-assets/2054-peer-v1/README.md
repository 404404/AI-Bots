# #2054 peer-answer review

PR #2104 · evaluated runtime `ba6205269820d55945a7add32c05adfa1d04cdc6` · current PR head `7a55ab5e945284134973178a06e529c44d89786d`.

Human acceptance is pending. No merge or deployment is authorized. #2053's accepted latency exception does not waive this slice's budgets.

Download `review.zip`, extract it, and open `index.html`. Choose Left, Right, similar or uncertain; no dimension form is required. Select before revealing model identities, judge and costs. Export the JSON, or copy its text backup if downloading fails. The second comparison is `original.html`; each page keeps its own choices. Both pages contain complete Group and preparatory DM histories, authors, timestamps, message IDs and expandable runtime evidence. They work without the Host.

The 40 matched triplets contain 120 unique episodes. Each candidate appears in two comparisons, but is charged once. No failed or missed-window attempt was replaced. The three diagnostic pairs are separately retained and charged. Blind judgments use the same model as the subject, in both orders; this is a small pilot, not independent-model proof.

## Results and limits

The `analysis.json` contains full per-family means, medians, p95 values, paired deltas and 95% bootstrap intervals, coverage, denominators, failures, unknowns, native reconciliation and required Human samples. Observed coverage includes incomparable histories; paired results require the predeclared race window. Unknown values never become zero.

| Comparison | Family | Comparable pairs | Candidate observed coverage | Mean token ratio | p95 contribution ratio | Token gate |
|---|---|---:|---:|---:|---:|---|
| BI | redundant | 6/10 | 100% | 1.29 | 0.82 | inconclusive |
| BI | independent | 7/10 | 90% | 1.28 | 5.34 | inconclusive |
| BI | new-question | 7/10 | 100% | 0.80 | 0.39 | inconclusive |
| BI | fyi-control | 10/10 | 100% | 0.98 | 1.09 | inconclusive |
| B0 | redundant | 9/10 | 100% | 1.23 | 1.32 | inconclusive |
| B0 | independent | 8/10 | 90% | 1.13 | 1.37 | inconclusive |
| B0 | new-question | 8/10 | 100% | 0.96 | 0.52 | inconclusive |
| B0 | fyi-control | 10/10 | 100% | 0.86 | 0.54 | inconclusive |

Ratios use available Host values and do not imply a pass when usage is missing. FYI control latency, native completed-response estimates and all five token buckets are in the JSON. Every unreported provider retry and auxiliary request remains an explicit accounting limit.

Known formal Host estimate: $1.005192; unknown-cost episodes: 13. Diagnostic Host estimate: $0.046612; judge estimate: $0.190252. Native completed-response cost is an alternate estimate, never added to Host cost. These are frozen-price estimates, not invoices.


The full-history assistant audit is unblinded and follows all blind rounds; it does not overwrite the judge or substitute for Human scoring. The mechanical oracle overlooks final R3 contradictions after an R2 correction in independent-4 baselines and a fabricated source in independent-10 Bi. Candidate independent-7/10 weakens the given R2 constraint with optional or unnecessary follow-up. These histories remain required review. Candidate independent-8 actually contains all necessary facts from Aura, then Atlas deliberately yields; the frozen runner waited for Atlas's own post and censored at 240 seconds. Its original failure stays unchanged.

Several new-question judge outputs incorrectly import QA-317/R2 from the independent-evidence family. Other judgments penalize appropriate conditional silence or reverse with order. Citation existence alone does not validate a rationale. Both comparisons have only two valid, same-order-consistent decisive pairs, below the required ten: no stable improvement claim. One B0 FYI judge request failed; 3 other rounds have citation/schema findings. All 160 attempts are retained.

Redundant public acknowledgements fell from 10/10 to 5/10. FYI unnecessary acknowledgement rate remained zero in every arm, so that improvement target is a tie. The Bi comparison has only 6/7/7/10 valid pairs by family, versus B0's 9/8/8/10; invalid histories remain visible. Known-only token ratios for redundant/independent exceed Bi budgets, but missing usage makes every token gate inconclusive. B0 redundant p95 exceeds 1.30. Bi independent p95 is 34.088s vs 6.388s among observed replies, additionally subject to the censoring limit. No #2053 exception is silently carried forward.

Current report/screenshot head differs from the frozen runtime only in reporting, docs and evidence. After the run, mandatory Human review was expanded to baseline failures, FYI latency anomalies and full-history audit concerns; model prompt, judge prompt, thresholds and frozen episodes were not changed. Offline mandatory flags add the assistant's post-judge concerns to the preregistered selection. Second-comparison exposure is recorded where browser storage allows it; absence is not proof of blindness.

## Provenance and qualification

The candidate Host reports the frozen clean source SHA. Both baseline release-info interfaces reported `metadata-invalid`; their independent checkout revisions, clean embedded build stamps and Profile core links were cross-checked and retained with bundle hashes. B0 has two generated client bundle differences after building; its embedded source stamp was clean. No baseline was rebuilt during measurement. `runtime-provenance.json` preserves this limitation rather than upgrading the API claim.

The initial diagnostic used a configuration header as a per-turn start marker and still emitted a no-addition acknowledgement. Its original record remains unchanged. Before freezing, the runner switched to native `step/start` and the tool/prompt explicitly instructed silent drop. Later diagnostics are separate from formal results.

`failed-attempts.json` adds native `assistant/attempt` failures to the immutable episode record. Host unknown totals include unreported attempts, including observed transport failures followed by successful retries. The native completed-response totals exclude these unknown attempts and are lower bounds. Pairwise reports expose the supplement in each Session's evidence; no frozen episode value is rewritten.

One broader local test run hit an existing revocation timeout during concurrent installation; the isolated rerun passed. Both logs are included. Current CI status and real Web Client screenshots are linked from the PR. Tests, model outcomes, Human acceptance, merge and deployment remain separate facts.

## Reproduce

Use the committed `scripts/e2e-group-peer-review.mjs` with three isolated instance JSON files and `--formal`. The frozen model, price table, source hashes, run count and order are recorded in `preregistration.json`. `analyze.mjs` produces the pairwise reports without duplicating candidate charges; the committed shared report runner runs and renders dual-order judgments. Credential files and local login URLs are excluded.

Raw histories contain fixture conversations only. The native export retains usage and tool calls, not hidden model reasoning. Human choices are absent from this archive until the Human independently exports them.
