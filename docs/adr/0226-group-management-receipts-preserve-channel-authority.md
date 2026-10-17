# ADR-0226: Group management receipts preserve Channel authority

- Status: Accepted
- Date: 2026-10-18
- Related: [#2090](https://github.com/BotHarness/DeepSeekBot/issues/2090), [ADR-0224](0224-tob-management-uses-scoped-native-shell-cli.md), [ADR-0225](0225-bot-creation-receipts-and-reviewed-profile-lifecycle.md), [ADR-0041](0041-one-database-owns-botharness-operational-state.md)

## Context

A Human can ask Tob to create a group of existing PersonaBots or invite another Bot. Losing the response must not cause another group or invitation. Pending approval must not silently adopt changed membership or invitation policy. A management request is distinct from group participation: Tob's protected role remains rooted in the Human DM.

## Decision

Extend the existing application-defined scoped CLI seam through native Shell and the actual ToolExecution context. The accepted Human DM, protected Tob root Orchestrator, ephemeral capability and approval checks from ADR-0224 remain mandatory. Existing Channel and invitation owners perform mutations; no new model-facing management Tool or parallel membership store is introduced.

Generation 98 adds `channel_management_operations` for durable operation receipts to the existing operational database. A stable operation key binds operation kind, normalized payload, target Bot incarnations and reserved Channel or invitation identity. Repeating the same command, key and payload reconciles that identity through its owner; a completed scoped replay is a checked read rather than another mutation approval. Conflicting payloads and unavailable or replaced identities refuse. Reconciliation cannot recreate deleted groups, silently choose another identity or revive an expired Shell capability.

Group creation may have no Bot members. Explicit initial members are added directly, preserving the existing Human/UI creation contract. Later invitations preserve the existing default `botharness-client.autoAcceptGroupInvites=true`. Once the Tob management operation is approved, the invitation owner commits accepted status (`respondedBy=profile-policy`) and membership together, so the invited Bot joins immediately without a separate invitation decision or wake. An existing Human opt-out retains the previous pending-invitation decision flow as a compatibility branch. This slice adds no setting or UI toggle. Tob reports the canonical result and does not override the Human's choice. Protected Tob cannot be an initial member or invitation target.

Scoped invitation carries the opaque fingerprint returned by a Channel read. The fingerprint covers review-relevant metadata, membership and invitation policy, not message journals or unread counters. The reviewed operation also binds the target Bot identity. The Host checks the current snapshot and authority around approval and immediately before mutation. A policy or target change requires another read and proposal, rather than an automatic refresh of approved inputs.

Scoped Channel reads expose bounded metadata without message bodies. Neither reads nor receipt recovery grant membership or make group content an accepted management instruction. Authenticated Human online commands may use the same operation-key and fingerprint inputs; existing unkeyed Human operations keep their owner semantics.

## Consequences

The receipt coordinates recovery; Channel state, invitations and membership remain canonical. The default successful invitation returns accepted status and current membership. For a Profile that opted out, Tob must distinguish a pending invitation from membership. After uncertainty, inspect canonical state or replay the identical operation rather than submit a new key. Current authority is required after restart.

The operational schema migration is forward-only: an older Host cannot open a Profile advanced to generation 98. This slice does not grant group settings, invitation cancellation, join decisions, member removal, personal presentation preferences, group deletion or external identity management to Tob. Those remain separately delivered scope under #2090. Direct CLI, model-driven execution, Web rendering and macOS Desktop evidence remain separate from this durable decision.
