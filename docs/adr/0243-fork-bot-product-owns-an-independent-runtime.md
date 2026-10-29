---
Status: Accepted in 404404/AI-Bots only
Date: 2026-10-29
---

# The fork Bot product owns an independent runtime and data

The user chose a separately maintained Bot product with a Web first release on GK50. The existing DSH plugin's execution, Session, credential and Client assembly depend on DSH; removing imports or hiding its shell would retain those authorities. We therefore implement the first vertical slice in `standalone/`, with an independent installation, build, HTTP server, execution owner and data directory. This decision is specific to the user's fork and is not an upstream BotHarness architecture change.

The new SQLite owner controls Bots, Conversations, Messages, Runs, idempotency receipts and encrypted authorization. Each Bot's bounded Markdown files own explicitly saved memory. Web and authenticated CLI/API share one business dispatcher. OAuth and model protocols use the independent pi-ai SDK through explicit application proxy dispatchers; the new runtime does not call an old Host or copy its credentials. The original DSH Home and deployment retain their own authority, including their existing online CLI; there is no DevBoard replica or unauthenticated public business API.

Starting with new data avoids an implicit, unverified schema migration and preserves a comparison deployment. Its cost is a new login and deferred data import, plus explicit later replacement of tools, approvals, groups, IM and scheduling. These remain on the migration list. Acceptance of this architectural direction does not assert that real Codex login, replies or the full migration have passed. See the [code-backed assessment](../standalone-bot-migration.md), [current runbook](../standalone-bot-gk50.md) and [acceptance record](../acceptance/standalone-bot-test-results-2026-10-29.md).
