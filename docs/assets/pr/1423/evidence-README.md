# PR #1428 review evidence

Implementation head: `6978f4767b531b4ad1e9ed1b30ca0a1981cac188`.
Integrated base: `e1a3f7ddd3a757b12857751d344de2c96b929b0b`.

All PNGs are unaltered native T3 browser captures from the real DSH Client and a receiver-free isolated Profile. No Lark App credentials were copied. The existing local port was reused; QA1 remained stopped. Desktop CSS viewport is 1440 × 1000, narrow is 390 × 844, locale English. T3's capture pipeline can rescale the PNG independently of its CSS viewport.

Before captures use the prior own baseline checkout's Client (`4cfd90f0`); its pairing-settings, permission-group-settings, pairing-table and styles sources are byte-identical to the integrated base. Both Clients use the same compatible current Host and canonical copied fixture because an older Host cannot reopen Generation 81. This compares rendered Client behavior; it does not claim a downgraded full Host. The fixture contains one current paired QA person, one ordinary Role and Groups A/B; item r5, A r1 Allow, B r4 Deny, one member each. The baseline has no behavior catalog/tab or preview; absence is the predecessor for the new views.

The interim screenshot shows this PR's earlier 560 px stacked editor with repeated checkbox labels, B r3 and a draft member addition. Final screenshots show the saved B r4 and wide 1060 px editor, compact cells and persistent preview. This is explicitly an iteration record, not a data-identical baseline pair.

The compact-preview pair compares the immediately preceding head `31fdb66e` to the final head on identical data. It replaces unstyled disclosure triangles with the Channel sidebar's button/chevron interaction, short conflict badges and smaller policy/source rows. Desktop editor height falls from about 487 px to 432 px. The final editor's header and footer remain fixed while only its body scrolls. At 390 × 568, the body is 404 px tall for 634 px of content and scrolls about 229 px; header and footer positions remain identical before/after scrolling, footer bottom 528 px. The 390 × 844 view has no page overflow, a 288 px behavior table and wrapped tabs within their indicator. Desktop renders check light/dark, tab preservation, native accessible Allow/Deny names, search no-match/reset, name sorting and mutual exclusivity within one Group. Member-save/current-revision persistence was also exercised through the actual UI on this isolated copy.

Real Lark qualification occurred separately, before the screenshot copy. Human accepted Allow → Deny → remaining Allow; three current permission Tool calls, handled Admissions and Provider-accepted Outbox intents correlate with visible native replies. See the issue's runtime evidence and acceptance links in the PR. Native pairing-card cached rendering is not claimed verified here. Natural-language policy is model guidance; the initial exact-format instruction was not strictly followed.

The HTML and Markdown explain the exact implementation head. They are review aids, not runtime evidence or a replacement for Human feedback. Do not treat screenshots, test success, CI, merge or deployment as interchangeable states.
