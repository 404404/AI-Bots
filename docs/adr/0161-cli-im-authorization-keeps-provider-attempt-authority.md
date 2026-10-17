---
Status: Accepted
Date: 2026-10-10
Issues: [#1318](https://github.com/BotHarness/DeepSeekBot/issues/1318)
---

# CLI IM application authorization keeps Provider attempt authority

IM application authorization is owned by the qualified `dsh-im` Provider. BotHarness Messaging target grants and PersonaBot external identity selection are separate application-defined behavior. The CLI must use the same Provider attempt as the existing Client authorization flow, including provider-required Human scanning or verification.

## Decision

- Discover supported flows from the existing application-defined Messaging Service `messagingApps` projection. Accept only version 1 Feishu/WeChat descriptors with the qualified Provider identity, expected flow kind and exact `dsh-im/app-setup` endpoint.
- Use the native DSH Connection Fetch Registry endpoint through the authenticated unary carrier selected in ADR-0159. Its payload is `{method: 'setup.start|poll|credentials|verify|cancel', payload: {...}}`, rather than the BotHarness Bridge `{args}` envelope. No new Service Provider, listener, database or Client lifecycle is introduced.
- The Provider owns opaque, process-local attempts, their expiry (at most ten minutes, shortened by native provisioning), provisioning and native account/credential persistence. Separate CLI invocations poll the same `attemptId`; Host restart or expiry requires a new attempt. The CLI stores neither attempt state nor cookies.
- App credentials and phone verification codes enter through stdin only. They travel solely to `setup.credentials` or `setup.verify` over the authenticated connection. This narrows ADR-0159's earlier no-secret-payload assumption: authorizing an IM application necessarily submits its credential to the existing owner. Secrets never appear in argv, stdout, stderr or generic BotHarness RPC payloads.
- Project only validated attempt identity, platform, state, expiry, native PNG QR data URL and ready account identity/fingerprint/connection status. Drop arbitrary Provider fields and names. Submission errors use a bounded code vocabulary and generic messages; failed commands retain the known attempt ID for inspection.
- Waiting stops at ready or a Human-action state (credentials or phone verification). A deadline returns a resumable attempt receipt. No request is automatically restarted. Cancelling a pending attempt does not revoke a ready native account.
- Authorization does not select a PersonaBot or create a Messaging Grant. `pairing-status` names the CLI authorization-attempt poll; offline `pairings <bot-id>` continues to inspect Bot administrator pairing requests.

## Considered Options

- Reusing `messagingAuthorize` would authorize an outbound target Grant rather than an IM application and was rejected.
- Persisting a CLI attempt store or reproducing provisioning would split authority from the Provider and was rejected.
- Bypassing provider-required Human scanning or code entry would misrepresent the native authorization flow and was rejected. Nonsecret QR artifacts and next-step prompts provide the relay instead.

## Consequences

### Scoped Tob Consumer (#2094)

The Tob CLI Consumer reuses the same qualified Provider and native payload through the pinned RC2 Connection's public `createSharedFetchHandler('/api').fetch` contract for already-authenticated in-process Host requests. Its adapter hardcodes the exact route, loopback Host header and `setup.start/poll/cancel` methods; source-bound Tob authority and a fresh Human decision fence writes. It never exposes a general operator RPC path or registers another interceptor. The native implementation and Provider management route are source-verified; runtime qualification remains a separate gate.

The adapter keeps bounded, process-local references from opaque receipts to one Human/protected-Tob owner, platform and native attempt. These references do not provision, store credentials or replace the Provider lifecycle. The Provider remains authoritative for status, expiration, cancellation and ready accounts. Cancel binds a fresh native state fingerprint; unknown, foreign or expired receipts cannot be polled through Tob. Provider success and failure fields are projected to constant-vocabulary status only: no QR, native attempt id, names, instructions or raw error text reach the model.

The authenticated Human Applications UI resolves a selected owned receipt and adopts the same native attempt into its existing ProviderAppSetup/creation form by `setup.poll`. Resuming does not call `setup.start`. QR rendering, secret entry and verification continue through the existing native Client transport; platform and expiry are checked before adoption. Separate Human CLI receipt/resume commands inspect this owner path without emitting private setup artifacts. Host restart discards references and the Provider's process-local attempts; no receipt database or second setup lifecycle is introduced. A failed start without a usable receipt remains uncertain and must not be retried blindly.

The first slice exercises a real WeChat QR through the production Provider, then polls that same attempt. Feishu accepts an existing application ID/secret through stdin. The qualified source is `@xmanrui/dsh-im` 4.32.0 at `bddd7d93e1c1b969ce137721c2494f6d72bfa8bc`, with DSH `0.2.0-rc.1`; future Provider contract changes need renewed qualification. Its management endpoint may refuse nonlocal requests even when the common CLI carrier accepts a tailnet HTTPS origin. A failed start without an attempt ID has an unknown provisioning outcome until the Provider expires its attempt; do not blindly retry.
