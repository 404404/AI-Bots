---
Status: Accepted
Date: 2026-10-17
Issues: [#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)
---

# Mobile presentation keeps caches and stream buffers local

Opening a Bot profile must respond before network work completes, and a fast reply must not force the entire chat tree to render for every text append. The Human also requested a per-device choice between streamed text and complete message bubbles.

## Decision

Keep these application-defined presentation concerns inside the Expo client. The owning Host remains the authority for PersonaBots, Channel Messages and drafts. This change adds no Host service, bridge method, Bot tool, persistence table or execution policy.

Bot profiles use TanStack Query through a resource interface scoped to the authenticated Host client and Bot/DM identity. The cache holds at most 24 resource entries per client, with inactive query collection after ten minutes. Opening reads the cached value synchronously and refreshes asynchronously; simultaneous refreshes deduplicate. Failed sections retain the previous successful value and a retry error. The native form-sheet shell starts immediately and defers heavier content until its opening transition ends. Model/permission editors are outside this read cache and retain their existing load/save behavior.

Conversation exposes a stable timeline snapshot with draft references. Text-only appends preserve that snapshot and historical message references; the active draft row subscribes separately. A disposable presentation buffer coalesces notifications, prefers a completed paragraph boundary and bounds an unfinished tail's wait. Interruption releases the latest received text; settlement cancels pending presentation work and committed messages render from the authoritative snapshot. The buffer does not persist messages or change transport ingestion.

A device-local JSON preference chooses Streaming or Complete bubbles. The latter hides uncommitted draft bodies, retains the working state and reveals each committed Channel Message, rather than waiting for an entire agent turn. Hydration completes before exposing a default draft presentation. A write failure leaves the current process choice visible with a retry notice; durable persistence is claimed only after a successful write. No message text, credential or Host identity enters this preference file.

Android surface choices follow the official Material references recorded in [the design research](../research/2028-android17-mobile-surfaces.md). The floating navigation container is an explicit product customization. System Android 17 screenshots are not an application component specification. Existing iOS native tab and form-sheet mechanisms remain platform-owned.

## Alternatives and consequences

Waiting for profile data before navigation adds network latency to the tap. Mounting every profile section at the start adds React work to the native opening transition. Caching editor mutations with the read-only profile risks displaying outdated settings. A character-by-character React loop couples model TPS to layout work and can leave an artificial typing backlog after completion.

Separate subscriptions reduce React invalidation, but do not prove that Android native Markdown remains visible or that scrolling achieves 120 FPS. A deterministic replay, native recordings and frame timing qualify those claims independently. The original disappearing-text recording remains a failing regression until a matching real-device replay passes; buffering is not evidence that the underlying flicker has been fixed. [Buffering research](../research/2028-native-streaming-buffer.md) records the reference implementation and limits.
