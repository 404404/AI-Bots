> Historical checkpoint. Pending QA/capture statements below are superseded by [completed-qa.md](completed-qa.md).

### QA1 first-slice rendering verified; screenshot capture blocked

Task `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`, source head `ad7c204acd344d24de337ada0ca5e7460853eaac`.

After Human reported browser recovery, inspected the actual signed-in QA1 private conversation. The Lark message DOM contains both the labelled test `ba8ae68a-843b-447f-8697-5589e0fc300f` and automatic failure `f7a1f78a-73de-4224-8348-5cb11440a0a1`. The automatic notice's visible message element shows fixed bilingual failure status, orchestrator/Session reference, matching notification reference and instructions to inspect Web; it contains no raw AUTH error, credential, prompt or tool argument. These references match the recorded Lark receipts. Both deliveries remain provider-accepted / one attempt after restart, the earlier unavailable-destination record remains cancelled / zero attempts, and reviewer capabilities remain exactly approve/reject.

**Capture limitation:** the saved T3 screenshot showed the previous chat frame rather than the notification DOM just inspected; inspection rejected it and it was removed. The next `preview_open` timed out and the tool then explicitly returned No automation host / Do not retry. No stale screenshot is published as real notification evidence. Existing 9 base/head and local-native UI images remain valid; native Lark screenshots and the accepted-route delivery-state screenshot are still pending a stable preview connection.

Runnable review: in QA1 “BotHarness Inline Setup QA #1111” private chat, inspect the newest two Bot notices replying to `/pair`; compare their references above with the sidebar's delivery records. The first explicitly says no work failed; the second is the actual failure notice and grants no decision permission. Full setup/canonical correlation remains in earlier progress and the PR evidence record.

The task's exact receiver is stopped again. No scope expansion, permissions change, merge or deployment. First-slice Human feedback and the remaining visual evidence gate are pending, so #1041 stays In Progress and PR #1468 stays Draft.
