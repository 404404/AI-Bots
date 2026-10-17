# #2053 fixed optimization pilot (v2)

Candidate: `0d50b0669788d04d49a4c2dfe4afc495ad786f35`. B0 and Bi: `73056fc59dcac42c3fd7e6cb1586f6c1c4e37157`.
PR: https://github.com/BotHarness/DeepSeekBot/pull/2066
Frozen plan: https://github.com/BotHarness/DeepSeekBot/issues/2053#issuecomment-6234605100

**Not accepted / keep draft.** Correcting the reply is reliable in these ten correction pairs, and returning the bounded delta removes the extra read. Token budgets still fail for correction and unrelated context. Full histories also expose an unrelated aside copied into a notification and a revoked Bot delivering the notification in DM. Mechanical Group-only success must not conceal those UX failures. No merge, deployment, issue closure or sibling release.

## Offline Human review

解压 review.zip，使用 Chrome 或 Edge 打开 index.html。两张卡片保留每组完整 Group 和 DM 历史，直接选左或右即可。暂时跳过保持未选；不会自动算平局。选择可撤销，刷新后保留。完成后导出 2053-human-review.json；下载失败可复制展开的结果文本。

这是新运行的 40 对，不继承第一轮选择。先独立选择，再主动揭示版本、模型评审和成本。页面完全离线，不调用模型或上传结果。左右偏好不自动代表接受成本超支。evidence.zip 的 history.html 是同一页，并附完整原始证据。

## Fixed evaluation

4 families × 10 pairs, 80 episodes; no replacement runs. Alternating A/B order and two concurrent pairs. Same official DeepSeek route via machine-local DEEPSEEK_API_KEY, reasoning off. Node 24.16.0 and DSH 0.2.0-rc.2 on both Hosts. The serving model revision is an alias and is not independently attested. New Bots/Sessions do not guarantee a cold provider cache. Provider sampling defaults are shared; no seed supported. Prices and budgets remain frozen from v1.

| Family | Behavior-valid pairs | Mechanical goal B0 → candidate | Paired token change | Mean known Host cost USD B0 → candidate | Observed reply p95 change |
|---|---:|---:|---:|---:|---:|
| correction | 10/10 | 0/10 → 10/10 | 32.55% (n=10) | 0.003928 → 0.004258 | 9.81% |
| quiet | 10/10 | 10/10 → 10/10 | 4.58% (n=9) | 0.003924 → 0.003944 | -3.46% |
| unrelated | 10/10 | 10/10 → 10/10 | 37.09% (n=10) | 0.003918 → 0.004263 | 34.00% |
| cancel-or-revoke | 10/10 | 5/10 → 10/10 | 21.96% (n=9) | 0.004113 → 0.004362 | N/A (silence / acknowledgement) |

Correction token budget +25%, p95 +50%; quiet token budget +5%, p95 +10%; unrelated token budget +25%. Bootstrap intervals and medians/p95 are in pilot-v2-analysis.json. Small pilots and provider/cache variation limit generalization. Correct silence has no response latency, never zero milliseconds. Cost means use available Host exports; missing values are not zero. Cost per success is a known lower bound when any usage is missing.

Behavior-valid pairs: 40. Host usage is incomplete in 2 runs. The runner's valid/hostMatches predicate does not itself guarantee numeric Host usage; strict per-response audits and numeric paired denominators are reported separately. Native sensitivity: correction 32.55% (n=10); quiet 4.19% (n=10); unrelated 37.09% (n=10); cancel-or-revoke 25.84% (n=10). Retained original values are never rewritten by supplements. Late responses after the frozen snapshots: 0. The late Host recheck is in late-v2-audit.json.

## Experience findings

- All correction candidates adopt 11:00, but several invent duration or future minutes/link delivery. See assistant-review-v2.json for every pair.
- unrelated-3 candidate copies the explicitly unrelated coffee aside into the meeting notice; baseline stays on task.
- cancel-or-revoke-2 candidate is refused Group membership, lists Channels and explicitly sends the notification in DM. cancel-or-revoke-8 also sends the draft in DM with a refusal explanation and a request to rejoin. Original task requested only the Group. It then resolves the Inbox as done. The frozen oracle tests only absence of a Group reply; this is a real interaction failure despite goal=true.
- Revocation Group safety in both arms comes from existing membership checks, not a new benefit. Cancellation and revocation are therefore also reviewed separately.

All 80 LLM attempts, both display orders, raw rationales, usage, failures and citation/schema checks are retained. Qualified stable results over behavior-valid pairs: {"validPairs":40,"candidate":13,"baseline":1,"tie":22,"insufficient":0,"disagreement":2,"invalidJudge":2}. Citation validity is not reasoning validity. The assistant read all full histories and checked core judge claims, noting disagreements rather than overwriting model scores. Human review of this new run is pending.

## Costs and evidence boundaries

This round's known subtotal, including diagnostics and judging: USD 0.421064418. Earlier v1 known subtotal: USD 0.417174510. Cumulative known subtotal: USD 0.838238928, **plus unknown** auxiliary/title, failed-request and unreported retry billing. No secret or billing credential is exported. 80 formal auxiliary requests lack usage. The failed setup diagnostic is retained, not replaced; later successful diagnostics are distinct artifacts. Native response usage supplements a missing Host row only in the separately labeled ledger.

Historical v1→v2 candidate mean token changes: correction -26.12%; quiet 3.49%; unrelated -34.89%; cancel-or-revoke -18.63%. These are descriptive temporal comparisons, not randomized paired v1-v2 effects. New B0 episodes are the formal comparison arm.

Mechanical regression: 62 relevant tests passed; final responsibility text followed by 9 passing core tests. Root TypeScript check, lint, relevant formatting and build passed. Live direct CLI revises using the held observation handle without an extra read. Exact-head model Group before/after UI screenshots, ARIA and console evidence are included. Current PR CI remains a separate status; no latest full-suite or native-mobile pass is inferred.

The existing schema96 has a one-way downgrade boundary. Disable the opt-in for behavioral rollback; restoring an older binary needs a pre-upgrade Profile backup or compatible migration. This evidence does not authorize merge or deployment. #2054–2056 remain gated on #2053 acceptance.

All source histories are synthetic fixtures. Full raw drafts, tool results, native response usage, dual-order model judgments, assistant findings and hashes are archived. Prior Human feedback remains tied to v1: 16 explicit candidate preferences, 24 chat-confirmed no-meaningful-difference; it is not reused as v2 votes.
