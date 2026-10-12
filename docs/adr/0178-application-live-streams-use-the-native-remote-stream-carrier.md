---
Status: Accepted
Date: 2026-10-13
Issues: [#1490](https://github.com/BotHarness/DeepSeekBot/issues/1490), [#1451](https://github.com/BotHarness/DeepSeekBot/issues/1451)
---

# Application live streams use the native Remote stream carrier

Each Bot-mode Web document used to hold one long-lived HTTP response per application live stream (roster, Channel, Activity, Window Companion) besides DSH's own HMR stream. A browser allows about six HTTP/1.1 connections per origin, so two same-origin documents filled that budget and ordinary requests in both stopped answering; the [investigation](../research/2026-10-12-dsh-multitab-loading-investigation.md) records the measured six responses and the recovery when one document left. DSH already carries its own Remote streams on one multiplexed WebSocket per document, outside that request budget. We move application-defined logical streams onto that carrier instead of merging them into fewer SSE responses.

## Decision

- An application live stream is a stream-mode Remote method on the owning Host module's existing Remote Service, declared through the same source marker the unary bridge methods use. The Gateway injects the cancellation `signal`; the method returns an async iterable of JSON items and releases its subscriber when the signal aborts or the consumer stops.
- The Client mounts a matching Remote contribution and consumes the method through the Gateway's reconnecting stream supervisor. Carrier loss is retried by the supervisor; a terminal end is retried by the application with capped backoff. Every generation starts with a `ready` item, and consumers refresh on it exactly as they did on an SSE `open`.
- Stream items carry the same facts the SSE frames carried. The owning Host module stays the only authority; the carrier adds no second store, replay log or permission path. Authentication is the Connection's admission of the Remote stream socket.
- Streams move one at a time, each verified in a real Host with two same-origin documents. The SSE route for a moved stream stays on the Host until the following release so an older Client keeps working; the current Client uses it only when the Remote contribution cannot be mounted.
- Native HMR stays one SSE response per document and is counted in every capacity check.

## Boundaries and alternatives

Merging application streams into one SSE response still leaves one application response, the Companion response and HMR per document, which reaches six with two documents. Raising timeouts, adding retries or closing live updates in a second document hides the starvation without creating capacity, so none of them is the fix. HTTP/2 would lift the limit, but the built-in listener is plaintext HTTP/1.1 and a proxy cannot be assumed.

The concrete marker shape, the contribution descriptor and the supervisor are DSH mechanisms verified against `0.2.0-rc.1` and `0.2.0-rc.2`; they must be rechecked when the pinned DSH changes. The stream supervisor treats a non-carrier end as terminal, and a mounted namespace is a separate Cordis service that a Plugin reaches through its own Context, not through a captured Remote object.

## Implementation status

[#1490](https://github.com/BotHarness/DeepSeekBot/issues/1490) moves the roster stream (`botharness/watchRoster`). With it, a second same-origin document loads its Bot DM instead of staying on loading skeletons, but each document still holds three long-lived HTTP responses (HMR, Channel, Window Companion), so two documents still reach six and ordinary requests still time out once both are loaded. Channel, Activity and Window Companion are the following slices; the two-document acceptance is not met until they move.
