# ADR-0184: Client-local composer recovery is not message authority

Status: Accepted

## Context

Switching Channels, refreshing or reopening a browser must not discard an unsent Human draft. Recovery must not invent a Source Event, disclose unsent text to a model, or silently change selected targets. The accepted scope is tracked in [#1458](https://github.com/BotHarness/DeepSeekBot/issues/1458).

## Decision

Application-defined Client recovery owns device-local drafts, separate from Host-owned message authority. The browser storage instance and a trusted Host/Profile/Human/Channel tuple scope each draft. Host and Profile issue persistent opaque UUIDs; ports, display names and Bot slugs are not recovery identities.

The implemented draft slice ([#1459](https://github.com/BotHarness/DeepSeekBot/issues/1459)) persists text, explicit mention and Channel tokens, reply ID, and uploaded attachment references in browser localStorage. It never persists File bytes or reply bodies. Restoring blocks submission until current Host references and roster targets are validated. Missing uploads require removal or re-selection; restored `@all` requires explicit re-selection. Unsent text stays outside Source Events, Session Persistence, Memory and telemetry.

Each write publishes an immutable version before removing causally dominated versions. Vector clocks preserve concurrent tab edits; active input is not overwritten. Resolving a conflict explicitly joins the observed versions and revalidates the selected context. Empty drafts are durable tombstones. Storage errors preserve in-memory edits and prior persisted bytes, with visible warnings rather than a claim of successful persistence. Each record has a 1 MiB budget and each scope has at most 100 live conflict heads.

Submission-attempt snapshots, original submission reconciliation and Up/Down recall remain accepted target behavior under [#1460](https://github.com/BotHarness/DeepSeekBot/issues/1460), not implemented by this draft slice. They must retain failed or unknown attempts without automatic resend or a second message log.

## Trade-offs

Reference validation that leaves the serialized draft unchanged updates only the local recovery snapshot, not its durable version. Only normalized reference changes create a new durable version. Otherwise idle tabs would repeatedly validate and rewrite each other's identical drafts, producing storage events and unnecessary Host requests.

Browser-local storage is synchronous and origin-bound; clearing it, private browsing, disabled storage or quota exhaustion can prevent recovery. This is not a backup or cross-device sync service. Uploaded references can survive a reload, but local file bytes and their image previews cannot. Keeping recovery outside the Host avoids a second conversation authority and keeps unsent Human intent private from agents.
