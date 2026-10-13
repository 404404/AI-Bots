---
Status: Accepted
Date: 2026-10-13
---

# Reachable posts reuse Messaging authority and Outbox

[ADR-0142](0142-a-bound-app-admits-its-direct-messages-and-mentions.md) authorizes proactive posting wherever the platform permits the Bot's owning app to speak. #1115 implements that decision through the application-defined Messaging Provider Service Definition; it creates no additional DSH Service or persistence authority.

The Provider optionally lists current reachable groups and performs a source-free checked post with an authenticated account fingerprint, exact conversation ID, synchronous final caller fence and native receipt. Discovery is permission evidence at one instant; native membership/speaking permission is checked again at dispatch. The first implementation is Lark. Other Providers keep their saved-target route until they implement the optional capability.

The application-defined Host owns Binding, conversation blocks, per-app quota and Outbox. A first reachable post creates one existing implicit conversation entry after current ownership and block checks. It does not synthesize a Source Event, Inbox Admission, local Human DM or Channel placement. Current mute/held policy does not prohibit an explicitly authorized proactive post; a durable block does. Existing checked saved-target posts retain their own route and digest rather than silently switching to discovery.

Schema Generation 84 adds the Binding post limit, default 60 per rolling hour; null disables it. Outbox attempt-start facts are the quota source. A started unknown outcome consumes a slot and retains its request identity. Identical requests return the canonical result and never resend after restart. Block, unbind, archive and Provider replacement fence unstarted effects; acceptance after a native effect remains an acceptance fact.

The existing Typert/API Gateway connects the Host operation to the app's Client picker and native Agent Tool Consumers. Registry/Registration and Fiber disposal remain the process-lifecycle boundary; operational database records remain the durable application authority. Native first-post qualification, the #1111 Provider-release prerequisite and sibling QQ permission work remain distinct delivery gates. Historical evidence from the closed experimental branch is not qualification of this rebuilt revision.
