# #2054 peer refinement v2 — mixed result, not acceptance

DSH ran the registered **8 pairs / 16 attempts**. The current GPT-6 Astra assistant directly read all complete Group/DM histories, all native Tool arguments/results and visible assistant text across **30 actual Sessions**. **Zero external judge calls.** Assessment is unblinded engineering review, not independent Human votes. Two preparation failures produced only one Session each; neither was replaced.

- Candidate runtime: `d53b71e4301c79271b8344acd04994b1b963cbd5`; baseline previous #2054: `c9a2f9d51e8196085b00049ef5675bc0ebc84cb4`.
- Current PR head: `2f7ed758370d9de2e6b2299145dc0a2f1c865222`; the later commit adds screenshots/README only.
- [Preregistration](https://github.com/BotHarness/DeepSeekBot/issues/2054#issuecomment-6240658767) · [PR #2104](https://github.com/BotHarness/DeepSeekBot/pull/2104).
- Route: deepseek-official/deepseek-flash@off. Exact frozen pricing, alias/revision limitations, runner and input hashes are in provenance.json and raw-input-hashes.json.

## Assessment

Seven comparable pairs: **2 candidate preferences, 1 baseline preference, 4 ties**. One pair is inconclusive. There is no statistical improvement or p95 claim from two pairs per family.

| Family | Direct full-history assessment |
| --- | --- |
| Redundant replies | Both candidate cases still publish unnecessary replies, as do both baselines. One candidate invents an unsolicited timezone/design reminder; the other explicitly says it has nothing to add after reading the peer. No silent-completion success. |
| Independent evidence | Both arms preserve QA-317 and mandatory R2. Candidate is clearer in both pairs: no mention-driven recap in one, no stale-R3-is-correct preface or no-addition ending in the other. No suppressed necessary correction. |
| New question | One valid pair answers 18:00 JST in both arms. Baseline is preferred because candidate appends an irrelevant no-addition explanation. Both arms of pair 2 fail with `fetch failed` during preparatory DM, before the Group request. |
| FYI + explicit control | Both arms stay silent on FYI and answer the later direct request correctly, in both pairs. Ties. |

The system/message and request/header records confirm the new prompt and Tool descriptions were present in every candidate Session and absent from the baseline Sessions. This is a real negative/partial result, not an old-binary test. Assistant judgments cite canonical Message IDs in assistant-assessment.json.

Two observed cost/interaction issues remain: no-addition send attempts, and omission of the already-returned observation handle, which can cause an avoidable held/recheck. No server semantic classifier or keyword suppression was added. Internal task-ownership prose is discouraged but not reliably eliminated. The original #2054 acceptance and budget gaps remain; #2053's accepted quiet-latency exception is not transferred here.

## Costs and failures

All participant Bots and preparatory turns count. Use only complete matched pairs for these token comparisons:

| Family | Known matched pairs | Baseline tokens | Candidate tokens | Change |
| --- | ---: | ---: | ---: | ---: |
| Redundant | 1 | 424347 | 340997 | -19.64% |
| Independent | 2 | 853101 | 744450 | -12.74% |
| New question | 1 | 342794 | 345580 | +0.81% |
| FYI/control | 1 | 311822 | 311918 | +0.03% |

**Known whole-episode Host subtotal: $0.122433006**, plus **2 unknown-cost episodes**, **30 unknown title calls**, and unreported provider retry coverage. Current assistant platform cost is unknown and separate. These are frozen-price estimates, not invoices. Do not compare unequal known-only family totals or treat unknowns as zero.

Both unknown Host episodes have a native `assistant/attempt` TRANSPORT failure without usage (baseline redundant-1, candidate FYI-1). Separately, new-question-2 has `fetch failed` in both arms. Their charged preparatory costs are $0.003988386 baseline / $0.004006836 candidate and remain in the subtotal. Subsequent authenticated Host health checks passed; fetch root cause is unestablished. No replacement runs. Post-cohort native reconciliation found **zero late completed responses**, and both failed cases' canonical histories and known usage remained unchanged.

## Runtime and UI proof

81 focused runtime tests, 17 report tests, typecheck, lint and build passed. A mistaken `node --test` invocation could not load Vitest; the corrected Vitest run passed without source changes, and both logs are retained. Direct CLI exercised held → unobserved-peer refusal → explicit yield with one reply → a new question committed. Two actual Web Client captures at 1440 × 900 show the remaining unnecessary replies; zero console issues. They are negative evidence, not a silent-behavior pass. Earlier native Client lifecycle failures are not claimed fixed.

## Files

- `session-review-public.json`: complete Group/DM messages, native allowed Tool arguments/results and all usage snapshots; draft Tool bodies are retained. Live preview frames and private Host paths are excluded.
- `native-supplement.json`: visible assistant text, failed attempts and new-prompt presence checks; no hidden reasoning or system-prompt dump.
- `assistant-assessment.json`: per-pair judgments, Message IDs, denominator and ledger.
- `reconciliation.json`: end-of-run usage/history comparison and late-response check.
- `history.html`: optional full-history cards; no Human scoring is requested or prefilled.
- `explainer.html`: head-bound explanation, not runtime proof.
- `before.png`, `after.png`, ARIA/console records and `cli-proof.json`: real UI/CLI evidence.
- `protocol.json`, `provenance.json`, hashes and `manifest.json`: frozen provenance.

PR #2104 remains Draft; #2054 stays open. #2055/#2056 are untouched. No merge or deployment. Parent #2066/#2053 remains merged/closed with its recorded exception.
