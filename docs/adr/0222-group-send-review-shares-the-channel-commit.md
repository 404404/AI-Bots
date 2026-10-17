# ADR-0222: Group send review shares the Channel commit transaction

- Status: Proposed; opt-in pilot, pending Human history review
- Date: 2026-10-17
- Issue: [#2053](https://github.com/BotHarness/DeepSeekBot/issues/2053)
- Specification: [#2051](https://github.com/BotHarness/DeepSeekBot/issues/2051)

The application-defined Channel owner checks an outgoing Group reply against content actually
returned to its PersonaBot. Comparing a version before an asynchronous append leaves a race;
prompt instructions alone cannot close it. The comparison therefore runs in the same SQLite
transaction that appends the Source Event and Channel placement. Previews remain ephemeral.

The Host issues opaque, expiring observation handles scoped to the Bot, Orchestrator Session
and Group. Direct CLI tool calls use a separate Bot-scoped diagnostic owner. A bounded read
records individual message revisions and content fingerprints, not a high-water mark claiming
that omitted messages were read. A recheck retains the initial range floor. Model tool output
must explicitly carry its returned handle into a subsequent send; concurrently executing a
read does not update another send's default basis. A full inbound message present in the actual
Turn content can supply the initial basis. Metadata and truncated content cannot.

A held send persists its identity, owner, original/current draft, basis, expiry and retry count
in the existing Operational Database. It produces no public message or downstream Admission.
One explicit revision or unchanged recheck is allowed. Another change stops the attempt with
`requires-review`. Drop is separate from Inbox resolution. Ten-minute expiry and a different
Host boot fail closed; positive restart recovery belongs to #2056. Purging a Channel source
also clears that Channel's derived send drafts. Revocation, Bot status, Session ownership and
source-content fences remain independent checks at commit.

The rollout is off by default and enabled per local Group through the existing Host bridge
and CLI. Disabling it restores ordinary sends, but an explicit held draft still requires its
review checks. DSH continues owning native Agent lifecycle and Session Persistence; this
decision adds neither a Session manager nor a wake scheduler. Review evidence consumes
canonical history and usage; exported pilot files are process evidence, not message authority.

The durable draft shape and purge integration make this more than a prompt experiment.
Schema generation 96 is additive; roll back by disabling the opt-in before reverting code.
The database generation still requires a compatible binary. Acceptance remains separate from
mechanical regression, real-model outcomes and Human evaluation.
