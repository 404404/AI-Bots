# ADR-0230: Cloud Agent connections use native Credentials and Messaging

- Status: Accepted for the UAT Host slice; two-Host runtime qualification pending
- Date: 2026-10-18
- Issue: [#2155](https://github.com/BotHarness/DeepSeekBot/issues/2155)

## Context

A TOB cloud Agent is a remote service identity. A local PersonaBot can bind that identity, but importing its credential must not create a second local chat store, substitute for Human authentication, or grant arbitrary local execution. The protected local steward named Tob is unrelated to this cloud service.

## Decision

The application-defined `CloudConnections` owner stores public connection metadata, a history cursor, a policy revision and explicit local work policy in the existing Operational Database (generation 100). Secret values reside only in the DSH native Credentials Provider under `botharness-core/cloud-<fingerprint>`. No environment token fallback exists. Explicit credential import pins the complete public instance configuration and qualifies channel, organization, Agent and owner using the public authenticated identity endpoint. Credential-free discovery is checked before bearer transmission. Matching discovery detects change; it does not independently establish trust in a server supplied by the operator.

Native credential persistence precedes activating metadata. An interrupted credential write is accepted only after exact readback; a conflicting record is refused. Removal disables the connection and aborts active requests before attempting native deletion. A failed deletion remains visible and retryable. Reimport restores deny-by-default local work policy. Metadata and public management responses never include secrets.

`botharness/tob` implements the existing Messaging Provider seam. Its account is one channel-scoped remote Agent; its reachable target is that channel. The existing Apps/Bot connection UI and CLI bind it to a PersonaBot. There is no automatic binding or local Bot creation. Application-defined Source Event, Admission, Bot Inbox and Outbox remain the local authorities. DSH SessionEvent persistence remains the Agent execution history.

The initial transport uses bounded public HTTP history. Human and remote Agent authorship remain distinct. A delegated typed work request retains the original Human, target, capability, parent and deadline; replay changes to this provenance are a source conflict. Plain text/results do not independently wake the Bot, even when an existing Messaging grant or Channel bridge requests immediate ordinary-message wake. Admission and later source consumption check the current connection, bound local Bot, original-Human allow-list and request deadline. Authorized context collection stays separate from work admission; a different local Channel member does not inherit the target Bot’s work authority. The checkpoint advances only after Messaging acknowledges its canonical commit. A crash between commit and checkpoint causes replay through the existing source identity, never a skipped source. The cursor is a transport checkpoint, not a second message store. WebSocket delivery is a subsequent transport increment.

Text sending receives the existing Outbox's durable operation ID. A deterministic cloud idempotency key is derived from that ID, never from message text. Binding/grant fences run immediately before network send and after response. Uncertain responses remain `unknown`; this adapter does not turn them into confirmed sends or invent automatic retries.

Host management uses authenticated `cloudConnections` RPC and `deepseekbot cloud`. Credentials enter CLI via stdin; removal requires a revision and explicit confirmation. Agent-side health execution/forwarding must use a separate bounded operation owner tied to the accepted source and current local policy. Import or message receipt alone does not grant those capabilities. That owner, model-mediated forwarding, and two isolated Hosts communicating through UAT remain outstanding qualification work.

## Consequences

The connector can reuse the existing Bot binding, channel placement and diagnostics surfaces. Native secrets and local canonical messages retain their established ownership. The protocol v1 parser is pinned locally for the independent TOB service; changing that contract requires compatibility tests with both repositories. An old Host cannot open generation 100 without the standard schema recovery gate. No production rollout, automatic downgrade, federation or group-to-group bridge is implied.
