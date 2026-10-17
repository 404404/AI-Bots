# #2055 first busy Group tracer

PR #2124, head `71ce266d35e02da8017690c7a0ed8a11665ebf6e`; runtime/runner `ac41a433b45965789cfda2683079feb07d70d3b7`. This is preliminary tracer evidence, not the final 40-triplet evaluation or acceptance.

The direct CLI path exercises initial hold, two failed rechecks, exhausted budget, no reset, observation/owner/version refusal, one explicit override commit and refused replay. Its first export incorrectly requested 30 trace turns; that history/failure is preserved, then the supported maximum of 20 was used. Two real Web captures show a correct single notice in both arms, with zero console errors. Candidate replies amid the stream; Bi after it. The screenshots cannot prove the internal decision path by themselves.

The excluded one-pair model diagnostic uses real DSH Sessions, two preceding Group exchanges and twenty unrelated messages. Both replies are correct; candidate first correct reply is 8.596s vs Bi 18.918s. Candidate Host usage is 343,112 tokens / frozen-price estimate $0.006437004. Bi Host usage is unknown; its native completed-response subtotal is 459,821 tokens, with one failed TRANSPORT attempt of unknown usage. Unknown auxiliary calls and unreported provider retries are not zero. No p95, statistical improvement or full-cost-saving claim follows from this pair.

`diagnostic-1.json` contains full Group/DM histories and native Tool arguments/results. `diagnostic-1-native.json` adds visible Session assistant text and failed attempts, excluding hidden reasoning and credentials. `diagnostic-assessment.json` is the current GPT-6 Astra assistant's direct unblinded assessment; it is not an independent Human vote and uses no external judge API.

Local focused checks passed with a disclosed 30-second per-test allowance; earlier 15-second Windows test timeouts are retained. Full CI found one unchanged Computer cleanup assertion, tracked separately in #2125; one failed-job rerun is pending. Do not treat this package as all-green CI.

The fixed four-family × ten-triplet cohort is still running without replacement attempts. Setup fetch failures, missing usage and task noncompletion stay in its denominator. The frozen raw oracle can mislabel a preparation confirmation as goal=true when setup aborts before sourceStartedAt; final derived analysis must reject that as target-task success without rewriting the raw data. A 240-second exposed failure remains a failure, not a cheap silent success.

Open the downloaded `pr-explainer.html` for the exact-head implementation explanation. Original report JSONs are the complete offline evidence; formal history browsing and statistics will be published in a separate final package. No deployment occurred.
