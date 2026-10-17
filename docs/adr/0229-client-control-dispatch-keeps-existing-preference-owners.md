# ADR-0229: Client control dispatch keeps existing preference owners

- Status: Accepted
- Date: 2026-10-18
- Issue: [#2095](https://github.com/BotHarness/DeepSeekBot/issues/2095)

## Context

A Human can ask Tob to change a preference in the Client that submitted a Home/private-DM request. The Host cannot directly mutate browser-local owners. DSH `0.2.0-rc.2` theme and locale UI are Client Services, but their durable preferences already belong to the Host user-settings document (`ui-theme` and `locale`). Bot-mode motion, icon, send-key and invitation defaults are also Host settings. Moving these values into a new per-Client store would change their existing scope and introduce conflicting authorities.

## Decision

Add an application-defined `ClientControlService` in the existing Host Plugin/Fiber, exposed through the existing Typert/API Gateway Service. Each Client Plugin registers a tab id and per-mount generation, renews a bounded lease, polls bounded process-local commands, and reports completion. Discovery exposes exact eligible targets. No default single-Client selection, broadcast, durable command queue or second preference store exists. A Client reload replaces its generation; stale targets refuse. A delivered write whose completion is lost has an uncertain outcome and requires a new owner read before any retry.

The authenticated Human `channelSend` adapter validates the live target and its private per-mount proof, then saves it as metadata on the canonical Human Channel message/Source Event before Admission. The mount proof stays only in Client/Host process memory. A private tab-owner proof in sessionStorage authorizes registration/replacement of that tab id; discovery cannot claim an existing id with another owner proof. Superseded generations cannot register again. Neither proof appears in discovery or canonical messages. Polling, completion and source attribution require the active mount proof bound to the trusted native `this.ctx.invocation.peer.id`; the Gateway supplies that Peer identity internally and never accepts it from wire arguments. Reload replacement with the private owner proof may move to a new Peer. Tob's existing protected Orchestrator authority derives `current` only from all accepted canonical Human-DM sources in the current turn. Missing or mixed origins refuse; model-supplied target text never creates current-Client authority. The normal broker approval binds the exact incarnation, old state and patch. Host dispatch rechecks the captured source guard and target immediately before handing a command to that Client; the Client checks command expiry and its owner state before mutation. Revoked or replaced work is not replayed.

Client command handlers call existing owners. Notification preferences keep their browser-origin localStorage key and OS/browser permission remains Human-owned. Same-origin tabs share that persistence scope; independent browser contexts remain separate. Native theme/locale and Bot-mode Host settings keep their existing namespace and revision protection. Tob must explain their effect on every connected Client and use explicit `--scope host`; a current-Client-only theme/locale request refuses `host-scope-required` instead of creating a local override. Human name and IM defaults retain their existing Profile/Human and per-platform owners. CLI control remains ordinary Shell capability under the existing Tob source and review guard, without dedicated setting model Tools.

## Consequences

The dispatcher may be reused by later layout and shortcut handlers without transferring their persistence ownership. Only currently registered Client capabilities can execute; unsupported controls receive coded refusals. Process-local leases and commands are discarded on Host disposal. Existing preference values bootstrap through their current owners, so no preference migration is required. Web, native macOS, direct CLI, real Tob model, restart and OS delivery qualification remain distinct evidence categories.
