# ADR-0172: Group behavior items resolve by ID with explicit Deny

Date: 2026-10-11
Status: Accepted
Issue: [#1423](https://github.com/BotHarness/DeepSeekBot/issues/1423)

The Human accepted reusable behavior permission items so Group assignment can share natural-language behavior without composing several free-form Roles. This extends ADR-0168's structured-only first tracer: each paired person keeps one primary behavior Role, and Messaging owns Bot-scoped named items in the Operational Database. Groups reference stable IDs, not copies of text. An item's latest canonical revision and all current group sources are resolved on demand; duplicate Allows yield one item, while any explicit Deny yields a prohibition with a visible Allow/Deny conflict when both effects exist. Primary Role constraints remain applicable and Group Allows cannot widen them.

This deterministic algebra concerns item identity/effect, not proof that arbitrary texts are consistent or enforcement of mail, files or Shell access. Existing Host management capabilities and delegation stay independently checked. Group membership keeps the exact current Bot/App pairing fence; revoke/re-pair does not inherit memberships. The first slice qualifies same-ID overlaps/conflicts, settings previews and current-permission results before Human feedback gates semantic/declared-mutual-exclusion variants or other Providers.

Generation 81 adds one item table; existing records default to no behavior-item references. Group selections pin current item revisions at the write boundary; item edits use their own expected revision and show affected people. Deleting a referenced item is refused until every Group reference is removed, avoiding dangling or copied policies. Authenticated settings reuse the existing API Gateway/Client senderAccess commands, and the model reads the existing bridge_sender_permissions result; no second Provider Consumer, permission cache or native DSH RBAC is added. Client previews share a pure ID/effect resolver but are dated UI evidence; Host current queries remain authoritative.

Back up before upgrade. An older writer cannot reopen generation 81; rollback requires the pre-upgrade backup or a compatible forward repair. Natural-language behavior remains model guidance. Reliable hard resource restrictions, arbitrary semantic analysis and declared mutual exclusion require their own reviewed and qualified slice.
