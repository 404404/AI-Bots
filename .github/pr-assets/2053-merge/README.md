# #2053 merge follow-through

Runtime `78142090b5fd5fc3dd0bf78136356f41919d6dd2`; final PR head `6e727b9f440b47b185f60992a8b09e24c8a0c19c` differs only in a migration test expectation. Parent main `383dec656` is integrated. Schema99 preserves Tob96, Bot creation97 and Channel management98; Group review ADR0227. Old unmerged QA Profiles are historical, not supported migration inputs.

Both reviewed issues are fixed: no-basis holds select a bounded recent tail; observed gaps retain their floor; successful append retires its draft copy and explicit reuse is refused. The live CLI proved a 25-message history includes the newest 11:00 correction, commits once and refuses reuse.

`session-review-public.json` contains both complete visible Group/DM histories, native Session Tool calls/results, usage and the current GPT-6 Astra assistant assessment. No external judge was called. The candidate committed 11:00/B-204 after a held delta containing both Human corrections; B0 committed obsolete 10:00/A-101. One diagnostic pair, not a new p95 result. Baseline 227347 tokens, USD0.004847832, reply2758ms; candidate233495 tokens, USD0.005140890, reply4152ms. Auxiliary billing remains unknown. The accepted fixed-pilot quiet p95 exception (19.068s vs6.183s) remains unchanged.

Final applicable CI passed: https://github.com/BotHarness/DeepSeekBot/actions/runs/39064488956 . Full-suite/model jobs were skipped; local real-model verification is separate. Focused tests included the current migration/Group regressions and Channel management migration. Initial local parallel timeouts and old generation assertions were retained, followed by corrected/serial passing checks; no blanket full-suite or device qualification is claimed.

`after.png` is the actual T3 browser rendering of the same canonical correction history. Web limitations remain: the first headless drive saw native `SlotAssemblyError: scope 'session-maybe' rendered without an installed adapter`; the next stalled at the preview notice. Interactive T3 navigation displayed the full conversation, but a later panel transition again hit the native lifecycle error. A fresh navigation recovered and produced this capture. This is visible-path evidence, not a claim that the Client lifecycle problem was fixed. Earlier before/after and Human review evidence remain at their original revisions in PR2066. Old HTML is explicitly stale for the current head.

Task: `codex/local/01a14906-16cc-7800-a569-b5c812c02eef`. User authorized merge of accepted earlier work; no deployment. #2054 remains separate.
