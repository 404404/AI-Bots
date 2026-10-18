# Cloud Agent Host connections

## Sub-features

Explicit cloud credential import, existing Bot binding, typed source delivery, replay and connection removal.

## How to get to it (user POV)

Import a trusted private Agent credential with `deepseekbot cloud import --input-stdin`, then open Bot settings → Apps and bind the returned account to one local Bot. CLI parity: `cloud list`, `cloud policy --input-stdin`, `cloud remove --input-stdin --confirm`, `im-bind <bot> --app <cloud-id>` and `im-status <bot>`.

## Driving it with verify-app

Reserve the shared QA lane before starting Hosts. Use two distinct isolated DSH Profiles, ports, local Bots and cloud Agent credentials in a synthetic UAT channel. Never reuse another task's running Host or move its credentials.

1. Before import, capture the Bot's existing Apps list. Import through stdin and reopen the list; verify canonical remote name/account and explicit binding. Capture light/dark evidence; do not capture the private input or Host login URL.
2. Send one typed request to the bound remote Agent. Correlate Cloud channel sequence, local Source Event, Inbox admission and Orchestrator run. Ordinary unrelated text and result messages must not independently wake the Bot.
3. Interrupt delivery acknowledgement, resume, and verify one canonical source and one admission. Plain HTTP source tests are not a real network-interruption result.
4. Remove the connection with its current revision. Confirm traffic stops before credential cleanup and that responses already in flight cannot advance the checkpoint. Retry failed cleanup; reimport must require explicit local policy again.
5. For the full collaboration gate, separately prove the bounded work owner, original-Human policy, A-to-B forwarding, one execution, result delivery and both Host restarts through real Cloudflare UAT. Independent Node processes, fake model adapters and source tests do not pass this gate.

## Gotchas

HTTP history is the first transport; WebSocket remains separate. Import/binding does not grant shell access, remote approval authority, or membership in another organization. The protected local steward Tob is not this cloud Agent. Native/phone/Android and Human QA remain separate evidence categories.
