# #2053 continuous-conversation integration evidence

PR #2066 head: `f103902165d0b682b089174d3139b927fb1efadb`. Original B0: `73056fc59dcac42c3fd7e6cb1586f6c1c4e37157`.

Human history feedback has been received and continued implementation is authorized: prioritize current facts and stopped work; evaluate actual multi-turn ingest. This is narrative feedback, not invented pairwise votes or a waiver of every budget. The original v4 quiet p95 failure remains 19.068s vs 6.183s, above +10%, with no held/recheck in its slowest quiet episode. No claim that a necessary review step explains that tail.

## Five prospectively registered diagnostic pairs

Two actual Human/Bot exchanges precede the final request. During its draft, correction arrives as separate time and room changes. Cancellation and revocation are tested separately. All ten episodes are retained, all hit their applicable windows, candidate goals 5/5 and B0 3/5. This n=1/2-per-family diagnostic does not replace the 4×10 fixed v4 pilot or establish p95/overall UX superiority.

| Pair | Goal B0 → candidate | Whole episode tokens | Post-prelude tokens |
|---|---|---|---|
| correction-1 | false → true | 227519 → 233609 | 77727 → 80978 |
| quiet-1 | true → true | 227381 → 153439 | 77638 → 52210 |
| unrelated-1 | true → true | 227207 → 180963 | 77580 → 79713 |
| cancel-or-revoke-1 | false → true | 227262 → 232789 | 77593 → 80188 |
| cancel-or-revoke-2 | true → true | 253485 → 206897 | 103757 → 105587 |

Ten fixed blind judge calls, both presentation orders: candidate wins correction and cancellation; three ties; no order disagreement or citation/schema error. Assistant checked complete Group/DM histories and preserved a qualification about repetitive candidate wording and the judge overstating the baseline's attendance request as a future commitment. Full rationales and costs are available after independent choice. New Human selections remain unreviewed.

Runner: `9496426b0163996e4f61b759e78d90f518179a6d`; runtime build: `fb7334f4b13fa446f7e09b90e009ebaefb3a01da` with dirty stamp. Only evaluation files differ; Host source was identical. This diagnostic is explicitly qualified, not called a clean exact-head measurement. Concurrent local tests/UI capture and provider cache limit performance inference. Whole-episode cost and post-prelude cost stay separate.

## Latest main integration

Main's Tob schema stays generation 96; review tables follow as generation 97 (ADR-0224). The added regression preserves the canonical Tob identity across that upgrade. Historical unmerged pilot Profiles used a different generation96 and were stopped/preserved; a new Profile verifies the merged order. The exact-head clean build has its own provenance, direct CLI proof and a separately retained continuous-correction A/B pair in `latest-integration-history.html`. It does not relabel earlier runs as current-head coverage.

## How to review

Extract the review ZIP and open `index.html` (or `history.html` from the full evidence ZIP). Read full left/right histories, choose Left/Right/similar/uncertain. Save/reload/reopen, undo and actual download/text fallback were checked on the extracted ZIP; no test votes are packaged. Only then reveal identity, judge and token/cost data. This remains an optional supplement to already received narrative feedback, not a request to repeat 40 ratings.

Known cumulative evaluation subtotal: USD 1.743056214; native title/auxiliary and unreported retry/failure billing remain unknown. See `ingest-cost-ledger.json` for runtime vs judge costs.

See `validation-integration.json` for exact CI and local limits. Historical Windows broad-run failures are retained locally and not presented as a pass. The first CI found an old attachment-return-field assertion; it was corrected to explicitly assert inboxResolution:not-requested without removing delivery checks. No merge/deploy or general mobile/IM runtime verification is claimed. #2053 remains open; siblings retain their native dependency and separate scope.
