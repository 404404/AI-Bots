# #2053 fourth fixed pilot and Human review

Candidate: `4ff5b6b1460dfe6ddac2fd7a56ee3e2f6bb30d2a`. B0/Bi: `73056fc59dcac42c3fd7e6cb1586f6c1c4e37157`.
PR: https://github.com/BotHarness/DeepSeekBot/pull/2066
Prospective protocol: https://github.com/BotHarness/DeepSeekBot/issues/2053#issuecomment-6235836798

**Not accepted / keep the PR draft. Quiet reply p95 fails the original budget: 19.068 seconds versus 6.183 seconds (+208.39%; budget +10%).** Token savings do not waive this failure. Human acceptance remains pending. Budget outcomes below are measurements, not waivers. Prior Human exports and feedback remain tied to their original runs. No merge, deployment, issue closure or sibling release is authorized by this evidence.

## 离线评审

解压 review.zip，用 Chrome 或 Edge 打开 index.html。阅读左右两张完整历史卡片，选择左、右、差不多或不好判断。跳过仍是未选，不会自动算平局。选完可查看上一组的 token、成本、版本与模型判断。完成后导出 JSON；下载失败可以复制结果文本。页面离线运行，不调用模型、不上传结果。

这是第四轮新运行的 40 对。此前选择不会移植过来。内容偏好不自动代表接受成本或批准后续 slices。原始 Group/DM 历史、工具结果和模型评审完整保留，不能只看群里有没有回复。

## What changed

The Host holds a stale opted-in Group draft at the existing append transaction. Bounded new context is returned with a Host observation handle; the Bot can revise, recheck unchanged, or drop once. Missing/incomplete context requires reading; another change stops the automatic attempt. The owning source/content/membership checks stay in force.

Explicit resolve_inbox_ids executes the existing Inbox owner only after a successful send/drop. If omitted, the result now says not-requested and instructs the Bot to finish completed work in the current turn. A resolution failure is separate from committed delivery: use inbox_resolve, do not resend. Drop now honors the inbound Channel default while preserving draft owner/channel checks. Direct CLI calls have no inbound Channel and must pass channel_id.

Revocation of the initiating opted-in Group stops this run's formal Channel effects, including an unsolicited DM fallback. A later independent DM remains usable in regression coverage. Natural-language cancellation is a model decision, not a Host keyword classifier. Transient preview behavior across all destination races, external IM and later sibling policies are not established by this pilot.

## Fixed runtime measurements

Four families × ten A/B pairs, 80 episodes, no replacements. Each family repeats a narrow synthetic meeting-notice task; these are ten model draws, not ten diverse real-world tasks. Same official DeepSeek route through machine-local DEEPSEEK_API_KEY, reasoning off, alternating arm order and two concurrent pairs. Both arms use new Bots/Sessions, but the baseline Profile is reused across rounds and the candidate Profile is fresh, so operational data volumes differ. New Bots/Sessions do not guarantee cold cache. Provider defaults and alias revision are not independently controlled. Node24.16.0 / DSH0.2.0-rc.2 on both Hosts. Prices and budgets retain the original frozen version. This is a shared-machine pilot; browser captures overlapped early trials, so latency is not an isolated hardware benchmark.

| Family | Behavior-valid pairs | Frozen goal B0 → candidate | Paired token change | Mean known Host cost USD B0 → candidate | Observed reply p95 change |
|---|---:|---:|---:|---:|---:|
| correction | 10/10 | 0/10 → 10/10 | -5.98% (n=10) | 0.003948 → 0.004182 | 25.88% |
| quiet | 10/10 | 10/10 → 10/10 | -30.88% (n=8) | 0.003919 → 0.003849 | 208.39% |
| unrelated | 10/10 | 10/10 → 10/10 | -3.05% (n=10) | 0.003945 → 0.004168 | 6.27% |
| cancel-or-revoke | 10/10 | 5/10 → 10/10 | -18.94% (n=9) | 0.004084 → 0.004067 | N/A (correct silence) |

Budgets: correction tokens +25%, p95 +50%; quiet tokens +5%, p95 +10%; unrelated tokens +25%. Exact pass/fail/null results: `[{"family":"correction","tokenBudget":1.25,"tokenAllAttemptRatio":0.940200367282962,"tokenValidPairRatio":0.940200367282962,"tokenBudgetMet":true,"latencyBudget":1.5,"latencyAllObservedP95Ratio":1.2588195953853871,"latencyBudgetMet":true},{"family":"quiet","tokenBudget":1.05,"tokenAllAttemptRatio":0.6897666094135647,"tokenValidPairRatio":0.6912037575804595,"tokenBudgetMet":true,"latencyBudget":1.1,"latencyAllObservedP95Ratio":3.083939835031538,"latencyBudgetMet":false},{"family":"unrelated","tokenBudget":1.25,"tokenAllAttemptRatio":0.9695271153176698,"tokenValidPairRatio":0.9695271153176698,"tokenBudgetMet":true,"latencyBudget":null,"latencyAllObservedP95Ratio":1.0627049971059233,"latencyBudgetMet":null},{"family":"cancel-or-revoke","tokenBudget":null,"tokenAllAttemptRatio":0.80585106320517,"tokenValidPairRatio":0.8105802269503211,"tokenBudgetMet":null,"latencyBudget":null,"latencyAllObservedP95Ratio":null,"latencyBudgetMet":null}]`.

Paired known cost changes with cache-aware frozen prices: correction 5.91% (n=10); quiet -1.73% (n=8); unrelated 5.63% (n=10); cancel-or-revoke -0.38% (n=9). These percentages do not include unknown auxiliary/title or retry billing. Token savings and money savings are different quantities.

Bootstrap delta intervals, means, medians, p95, response counts and numeric denominators are in pilot-v4-analysis.json. A ten-pair pilot cannot establish population-level guarantees. Correct silence has no reply latency, never zero milliseconds. Missing usage is unknown, not zero. There are 3 missing Host usage exports; separate native supplements never rewrite those values or enter the Host-paired denominator. The late audit found 0 additional formal responses after the fixed snapshots.

V4 quiet-10 took 19.068 seconds, with the first channel_send starting at 19.057 seconds and completing about 16 ms later. There was no held/recheck in that episode. Host health was normal; the cause of initial-response delay and missing Host usage is not established. Keep the tail sample; do not subtract its wait or replace it. See v4-quiet-tail-audit.json.

## Earlier failed round retained

V3 candidate 7fe6308c15c6c4c86e4428ce07971d1beeebfe2b: quiet tokens +11.95% failed the 5% budget; seven quiet episodes needed a cleanup turn. Correction reply p95 was 29.813 seconds versus 6.537 seconds, exceeding the 50% budget. Its raw correction goal is 9/10: correction-8 correctly says old 10:00 is superseded by 11:00 but triggers the frozen regex. This false positive is annotated, not rewritten. Candidate cancellation/revocation was silent 10/10 versus baseline 3/10; baseline had two unsolicited DM continuations.

V3 build provenance is qualified: the running package had a stale dirty stamp from a pre-commit build. A later clean 7fe6308 rebuild has identical parsed executable structure after removing only the build stamp and parser comments/location metadata; the runtime helper is byte-identical. See v3-build-equivalence.json. Original v3 evidence is never presented as a clean exact-head build. V4 was committed before building and has its exact clean stamp.

V3 qualified dual-order judgments: `{"validPairs":40,"candidate":15,"baseline":0,"tie":14,"insufficient":0,"disagreement":11,"invalidJudge":0}`. V4: `{"validPairs":40,"candidate":15,"baseline":0,"tie":18,"insufficient":0,"disagreement":7,"invalidJudge":0}`. All 160 attempts are retained, including failures and disagreements; both rounds were judged after v4 runtime finished. Same-model judging remains susceptible to correlated blind spots. Citation/schema validity is not reasoning validity. Assistant full-history notes and objections are separate from raw judge output and Human acceptance.

## Costs, verification and limits

V4 known subtotal including six diagnostic episodes, eighty formal episodes and eighty judge attempts: USD 0.414382992. Prior cumulative known subtotal: USD 1.256992698. Combined known subtotal: USD 1.671375690, **plus unknown** auxiliary/title, failed-request and unreported retry billing. 80 formal auxiliary requests have no usage. This is an estimate using frozen rates, not an invoice. The ledger retains all v1–v4 known costs and failures.

Seventy-two related tests, root TypeScript, lint, touched formatting and build passed. Real CLI exercises held/recheck and separate post-commit completion refusal. Real Web history screenshots and console evidence are included. No latest full-suite, native-mobile or general external-IM pass is asserted. PR conflicts with main remain unresolved for this frozen evaluation; no merge-ready claim.

Schema96 is additive but older binaries cannot open the newer Profile generation. Disable opt-in for behavioral rollback; binary downgrade requires a pre-upgrade backup or compatible migration. Shared Channel append, source/content checks, owner isolation and explicit post-commit resolution are the high-risk review surfaces. #2054–2056 remain gated on #2053 Human acceptance.

All published histories are synthetic fixtures. Keys, login URLs, private Profile databases, unrelated conversations and hidden reasoning are excluded. The ZIPs contain no preselected synthetic Human votes.
