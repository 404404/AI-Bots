---
Status: Accepted
Date: 2026-10-14
Issues: [#1649](https://github.com/BotHarness/DeepSeekBot/issues/1649), [#1644](https://github.com/BotHarness/DeepSeekBot/issues/1644), [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)
---

# Paired devices reach the Host through a same-listener device gateway

A paired phone must keep calling the Host (HTTP unary `/api/<method>` and the Remote stream socket) after the Host restarts, and the Human must be able to cut one phone off at once, including streams it already has open. DSH 0.2.0-rc.2 has one credential form for both carriers: the per-process launch token exchanged for a signed cookie ([ADR-0159](0159-live-cli-verbs-ride-the-dsh-http-carrier.md)). We decided that **a paired device never holds a DSH credential. BotHarness serves a device gateway on DSH's own web server: the device presents its per-device credential to BotHarness-owned routes, BotHarness verifies and records it, and forwards the request to the native `/api` carrier and Remote stream mux over loopback with a Host-held DSH cookie.** Revocation refuses the device's next request and closes the device's open stream sockets.

## Decision

- **One listener, BotHarness routes.** The Device Pairing module registers, through DSH's public `webServer.register` and `webServer.registerUpgrade`, a prefix route for unary calls and an upgrade route for the stream mux under one BotHarness path prefix. No new port, process or reverse proxy. Operator-only management (create pairing offer, list, revoke) is registered on the authenticated `/api` carrier through `connection.fetch.register` and is therefore admitted only for the Human's own cookie.
- **Same protocol, different credential.** Behind the gateway prefix the device speaks the exact DSH envelopes: `POST <prefix>/api/<method>` with the `client-request` body, and the Remote stream mux frames on `<prefix>/api/remote.mux`. Only the path prefix and an `Authorization: Device <id>.<secret>` header differ from the Web Client. The mobile app needs no second protocol (spec user story 17).
- **The DSH cookie stays on the Host.** The gateway obtains a DSH cookie for the loopback authority by calling the public `connection.authenticatedUrl()` and performing the token exchange against itself. It keeps that cookie in memory and re-mints it on a 401. The launch token and the cookie never leave the Host process.
- **Device credentials are BotHarness facts.** Pairing offers are one-time and short-lived. A paired device record holds id, name, created, last seen and revoked. The device secret is stored only as a hash in the operational database, and is never logged, put in diagnostics, printed by the CLI or written to config. Every gateway request is verified against the current record, so revocation and last-seen need no cache invalidation.
- **Revocation is immediate on both carriers.** The gateway owns the device-facing stream socket, indexed by device id. Revoke marks the record and destroys those sockets. Later unary calls and upgrades are refused with a coded 401 JSON body (`device-revoked`, `device-unknown`, `device-credential-missing`) that the app can tell apart from a transport failure.
- **Device-key binding is optional and later.** The record leaves room for a device public key so a later slice can require proof-of-possession (the t3code DPoP idea). v1 relies on the secret staying in Keychain/Keystore and on TLS routes.

## Evidence from the pinned DSH

Checked against `@deepseek-ai/dsh` 0.2.0-rc.2 as installed by this repository.

- **The signed cookie already survives restarts.** `dsh-client-connection` (`BrowserAuth`) signs cookies with an HMAC secret stored in the credential record `client-connection/browser-session`, which is created once per Harness home and loaded at activation. Only the launch token is per process. Cookies are bound to the request authority (the `Host` header) and expire after `cookieMaxAgeDays` (default 30, minimum 1), with no refresh.
- **The cookie names no device.** Its payload is `{version, authority, issuedAt, expiresAt}`. Every admitted request becomes the same `OperatorPeer`. Invalidating one holder's cookie means rotating the shared secret, which logs out every browser and device.
- **Unary has a refusal hook, the stream has none.** `connection/request` is a documented waterfall that runs after admission for the `/api` prefix route, so a plugin could refuse a unary request. The Remote stream mux upgrade (`dsh-api-gateway`, `/api/remote.mux`) calls `connection.admit()` directly and never runs that waterfall, and no hook lets a plugin close sockets the mux already accepted.
- **Plugin routes are not admitted by DSH.** `dsh-host-webserver` routes have no authentication of their own. Each owner checks its own requests, as BotHarness already does for the Computer and Browser viewers through `connection.requestRejection()`.

## Live spike on an isolated Host

Run on an isolated profile booted with `scripts/dev-instance.mjs`, with a throwaway gateway built into `@botharness/core` (not merged). `botharness/list` stands for a unary bridge call and `botharness/followRoster` for a Remote stream:

| Step                                                      | Unary                             | Remote stream                                 |
| --------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| DSH cookie, before restart                                | 200 `ok=true`                     | 101, first item frame                         |
| Same DSH cookie, after restart (old launch token now 401) | 200 `ok=true`                     | 101, first item frame                         |
| Pair: offer created by the operator, redeemed once        | second redeem 401 `offer-invalid` |                                               |
| Device credential, before restart                         | 200 `ok=true`                     | 101, first item frame                         |
| Same device credential, after restart                     | 200 `ok=true`                     | 101, first item frame                         |
| Revoke while a device stream is open                      |                                   | open socket closed (1006), `closedStreams: 1` |
| Device credential, after revoke                           | 401 `device-revoked`              | upgrade 401 `device-revoked`                  |
| Operator cookie, after revoke                             | 200 `ok=true`                     |                                               |

The probe printed no token, cookie or device credential. The spike code and probe are kept outside the repository as review material only.

## Considered Options

1. **DSH-native durable credential.** Rejected as the whole answer, kept as a mechanism. The cookie does survive restarts (proven above), but it cannot be revoked per device, expires after at most `cookieMaxAgeDays` with no refresh, and pairing would hand the device operator authority that is valid on any carrier until it expires.
2. **Exchange the device secret for a DSH cookie that the device keeps.** Rejected. The exchange is possible through public methods, and unary refusal is possible through `connection/request`. Streams are not: a revoked device could keep an open stream and open new ones with its cookie until the cookie expires. A copied cookie would also outlive revocation.
3. **Upstream device credentials in DSH.** Not chosen for v1, proposed as follow-up work. The fitting upstream shape is a credential verifier seam in `dsh-client-connection` that maps a request to a per-device Peer, with Peer disposal closing that Peer's mux sockets. If DSH ships it, the gateway shrinks to that verifier and the device returns to plain `/api` paths. Envelopes, device records and refusal codes stay the same.
4. **Separate listener or reverse proxy in front of `dsh web`.** Rejected, as in ADR-0159: a second port is more attack surface and duplicates what the same-listener routes already do.

## Trust boundaries

- `dsh web` stays loopback-bound. Phones arrive only through an authenticated route, Tailscale HTTPS first, and the Host's trusted-host configuration must name that route for the operator's own browser to work there.
- The device credential is an explicit header, not ambient browser state, so DNS rebinding and cross-site requests cannot spend it. The gateway refuses any request that carries an `Origin` header, because native devices send none and a browser has no business on these routes.
- A paired device has the Human's full authority in v1, the same as the Web Client (spec user story 15). The gateway adds no per-device scopes.
- Gateway diagnostics are bounded, structured developer log entries (offer created, redeemed or expired; device admitted, refused or revoked), and never contain the secret, the DSH cookie, the launch token or a tailnet address.

## Consequences

- The Device Pairing module ([#1644](https://github.com/BotHarness/DeepSeekBot/issues/1644)) owns offers, device records, verification, revocation, the gateway routes and the route list offered to a device. The mobile app and a paired live CLI use the gateway prefix with the device credential instead of `/?token=`.
- The gateway depends on four public DSH surfaces: `webServer.register`, `webServer.registerUpgrade`, `connection.fetch.register` and `connection.authenticatedUrl`. A change to any of them is a pinned-DSH upgrade check.
- Each device request costs one loopback hop on the Host. Body limits come from the native `/api` carrier behind the gateway.
- Global sign-out of every browser and device remains a DSH operation (rotating `client-connection/browser-session`). It ends the gateway's loopback cookie too, and the gateway mints a new one on the next request.
