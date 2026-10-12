---
Status: Accepted
Date: 2026-10-13
Issues: [#1490](https://github.com/BotHarness/DeepSeekBot/issues/1490), [#1451](https://github.com/BotHarness/DeepSeekBot/issues/1451)
---

# Application live streams use the native Remote stream carrier

Each Bot-mode Web document used to hold one long-lived HTTP response per application live stream (roster, Channel, Activity, Window Companion) besides DSH's own HMR stream. A browser allows about six HTTP/1.1 connections per origin, so two same-origin documents filled that budget and ordinary requests in both stopped answering; the [investigation](../research/2026-10-12-dsh-multitab-loading-investigation.md) records the measured six responses and the recovery when one document left. DSH already carries its own Remote streams on one multiplexed WebSocket per document, outside that request budget. We move application-defined logical streams onto that carrier instead of merging them into fewer SSE responses.

## Decision

- An application live stream is carried by a stream-mode Remote method on the owning Host module's existing Remote Service, declared through the same source marker the unary bridge methods use. The Gateway injects the cancellation `signal`; the method returns an async iterable of JSON items and releases its Host subscriber when the signal aborts or the consumer stops.
- The Host method opens the existing live hub and yields its event frames unchanged (`event`, `data`, optional `id`), after one `open` item. Query, replay, coalescing and refusal therefore keep one implementation and one authority; the carrier adds no second store, replay log or permission path. Authentication is the Connection's admission of the Remote stream socket.
- The Client mounts a matching Remote contribution and consumes the method through the Gateway's reconnecting stream supervisor behind an EventSource-shaped adapter, so existing consumers keep their `open` / typed-event / `error` and `readyState` contract. Carrier loss is retried by the supervisor; a normal end is retried by the adapter with capped backoff and the last event ID; a Host refusal closes the source as an HTTP 4xx did.
- A stream moves only after it is verified in a real Host with several same-origin documents. The SSE route stays on the Host, and the Client uses it when the Remote cannot mount stream methods.
- Native HMR stays one SSE response per document and is counted in every capacity check.

## Boundaries and alternatives

Sharing one SSE response per document (#1451) removed two of the application's responses but still left that response, the Companion response and HMR, which reaches six with two documents. Raising timeouts, adding retries or closing live updates in a second document hides the starvation without creating capacity, so none of them is the fix. HTTP/2 would lift the limit, but the built-in listener is plaintext HTTP/1.1 and a proxy cannot be assumed. Re-declaring every fact as a typed Remote item would duplicate the hub's replay and refusal rules; tunnelling its frames keeps them in one place and can be replaced by typed items later without changing the carrier.

The marker shape, the contribution descriptor with strict parameter codecs and the supervisor are DSH mechanisms verified against `0.2.0-rc.1`, with the Host marker also checked on `0.2.0-rc.2`; they must be rechecked when the pinned DSH changes. The supervisor treats a non-carrier end as terminal, and a mounted namespace is a separate Cordis service that a Plugin reaches through its own Context, not through a captured Remote object.

## Implementation status

[#1490](https://github.com/BotHarness/DeepSeekBot/issues/1490) moves the shared Channel/roster/Activity stream (`botharness/liveFrames`). Measured in a real isolated Host: each Bot-mode document now holds two long-lived HTTP responses (HMR, Window Companion); two same-origin documents both load and answer a read-only request in 3–6 ms, and both refresh their roster after a Host change. A third document reaches six responses and ordinary requests time out again until one closes. Window Companion is the following slice.
