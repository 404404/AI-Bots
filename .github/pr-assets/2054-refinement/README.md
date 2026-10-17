# #2053 merge fixes and #2054 assistant-reviewed diagnosis

This follow-through uses DSH to run actual Sessions and the current GPT-6 Astra assistant to read complete histories and native tool records. **No external judge calls** were made in this cohort. This is an unblinded engineering assessment, not an independent Human vote or a replacement of the original 40-triplet / 160-judge dataset.

## Revisions and proof

- #2066 parent head `f33c39dea1f208574c655a9f820f7332339c1554`, integrated main `e59bef9932b869e6c9058310724769f5a0ae9353`: same Channel attachment projection for atomic send comparison; no silent refresh of the observed snapshot. Includes specific unavailable refusal and scoped preview discard. Legacy migration and later metadata-change regression passes. 155 existing/new focused tests passed initially; one added bridge test fixture was repaired and then passed separately. Typecheck, lint and build pass. New isolated Host CLI demonstrates committed → later metadata change held → explicit recheck committed. This checks references and visible metadata, not file byte identity. Parent CI is separately linked on PR2066.
- #2104 current head `c9a2f9d51e8196085b00049ef5675bc0ebc84cb4`: inherited parent fixes and the same attachment projection for cited peer evidence. 81 Group/adapter tests, typecheck, lint and build pass. New isolated Host CLI confirms peer commit → held → explicit yield, leaving exactly one public Bot reply. No new native-device or Web lifecycle claim.
- Diagnostic model runtime: candidate `a14e21f1fb6f6378750bc8f8caf0e0802d6c2644`, baseline parent runtime `78142090b5fd5fc3dd0bf78136356f41919d6dd2` (subsequent `6e727b9f4` only changes a migration test). Later attachment integration has separate CLI proof. Original Bi/B0 cohort remains unchanged.

## Direct assessment

All 8 pairs / 16 Subject episodes are retained. Five pairs meet the registered timing windows: 2 candidate preferences, 3 ties. Three missed baseline windows are inconclusive for matched preference, not deleted or replaced.

| Family | Read from full histories | Matched result |
|---|---|---|
| redundant, 2 pairs | Candidate drops both held no-addition drafts; baseline publishes redundant replies. Candidate still drafts unnecessary text and once misuses yield parameters before recovery. | 2 candidate |
| independent, 2 pairs | Candidate preserves QA-317 and mandatory R2 twice. Both variants can add unrequested verification prose. Reversed baseline order in pair2: Atlas sees Aura correction in held but still publishes R3. | 1 tie; 1 inconclusive |
| new-question, 2 pairs | Both correctly answer 18:00 JST. Candidate avoids the obsolete acknowledgment but adds unnecessary responsibility/no-addition commentary. | 2 inconclusive due baseline timing |
| FYI/control, 2 pairs | Both stay silent for explicit FYI, then correctly answer the later direct request. | 2 ties |

`assistant-assessment.json` gives per-pair reasons and canonical Message IDs. `session-review-public.json` retains all complete Group/DM histories, native permitted Tool arguments/results, all-Bot usage and validity flags. The two contact/list tool calls omitted from the public export were also read locally; they recovered a mistaken display-name mention and selected the actual Group member. Hidden reasoning, credentials and private Profile paths are excluded.

`history.html` is an optional offline browser for these histories. No new Human vote is required to read the results; no test votes are included. `explainer.html` explains the ownership and evaluation limits. These are explanations/history viewers, not runtime screenshots.

## Cost and limitations

Known Host estimate: **USD 0.141742368**, plus **one unknown Host episode**, **32 unknown title calls**, and any unreported provider retries. Current assistant review platform cost is not available here. Estimates use the frozen 2026-10-17 price schedule, not invoices. All Bots and preparation turns are included; post-prelude usage is separately preserved, never subtracted from total cost.

| Valid matched subset only | Baseline tokens | Candidate tokens | Change | Baseline USD | Candidate USD |
|---|---:|---:|---:|---:|---:|
| redundant (2) | 745019 | 794632 | +6.66% | 0.018886386 | 0.019629276 |
| independent (1) | 307589 | 371757 | +20.86% | 0.009208098 | 0.009755772 |
| FYI/control (2) | 611836 | 622340 | +1.72% | 0.017726322 | 0.017929734 |

No p95 inference or overall cost improvement is claimed. Subject setup initially failed before any new-question pair/Session; the retained setup-failure record explains resuming the same two registered pairs, with no replacement or extra Subject episodes.

#2053's Human-accepted quiet p95 exception (19.068s vs 6.183s) remains. Earlier native Client lifecycle errors and recovered Web history evidence remain in the previous parent evidence; not fixed here. #2054 remains open/Draft with original acceptance/budget gaps. #2055/#2056 were not implemented. No deployment.

Task: `codex/local/01a14906-16cc-7800-a569-b5c812c02eef`.
