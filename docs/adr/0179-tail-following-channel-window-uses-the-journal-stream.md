---
Status: Proposed
Date: 2026-10-13
Issues: [#1503](https://github.com/BotHarness/DeepSeekBot/issues/1503), [#1504](https://github.com/BotHarness/DeepSeekBot/issues/1504)
---

# The tail-following Channel window uses the journal stream; detached windows stay on timeline pages

ADR-0178 puts the Channel's live frames on DSH's Remote stream carrier in the journal frame vocabulary, but the Client still owns the hard part itself: detecting a revision gap, reloading, and reopening. DSH ships `RemoteJournalStream` for exactly that work and uses it for its own session timeline. ADR-0061 separately gives the Channel timeline Host-owned opaque cursors and four windows (latest, older, newer, around). This record proposes how the two divide the Channel window. It is **Proposed**: nothing here is implemented, and it needs Human acceptance before #1503 starts.

## What the helper does, as read from its source

Read from the published `@deepseek-ai/dsh-api-gateway` `0.2.0-rc.1` Client modules and from DSH's session controller. None of this has been run against a Channel yet.

- Every physical generation starts with one `opened` frame carrying a cursor **and a page**; the page's tail must equal the cursor. The helper publishes it as a `replace` of the whole window.
- Each `entry` must directly follow the last applied cursor. A gap makes the helper read a repair page "through" the missing cursor with a domain page-read call, merge entries that arrived meanwhile, and publish one `replace`. An entry can cover a cursor range (`first` … `last`).
- `prepend(request)` reads one older page and requires it to end exactly before the window's first cursor.
- `notification` frames carry no cursor and wait behind an in-flight repair.
- The window is always attached to the journal tail. There is no call for a window around an older position or for paging towards newer entries.
- A normal end after the opening frame is a carrier loss the Gateway retries; a protocol violation or a failed page read is terminal and reported through `failed`.

## Proposed decision

- The Client timeline has two modes. **Following**: the visible window reaches the tail (`hasNewer` is false). **Detached**: the window is around a read anchor or a located message, or was paged towards newer entries and has not reached the tail.
- In following mode the window is owned by `RemoteJournalStream`. The cursor is the Channel revision; an entry is one committed message with its revision; `follows` is "next revision". `followChannel`'s `opened` frame gains the tail page (messages, `hasOlder`, the opaque older anchor). The Client applies `replace`, `append` and `prepend` changes and no longer checks revision continuity or reloads on a gap itself.
- Older pages in following mode go through the helper's `prepend`, backed by a Host page read that can be fixed at a revision. The opaque anchors of ADR-0061 stay the paging contract; the helper only needs each entry's revision to check contiguity.
- Detached windows keep using `channelTimeline` exactly as ADR-0061 describes. One journal stream stays open for the selected Channel in both modes: while detached, its `append` changes advance the Channel revision, latest preview and the new-message control without being stitched into the visible window, as today. Returning to the latest position adopts the stream's current tail window.
- Receipts, read positions and draft previews remain `notification` frames; the draft revision check stays in the Channel consumer, because drafts are process-local and not part of the journal.
- A terminal failure falls back to the existing recovery: reload the conversation through the bridge and open a new stream. The Host keeps one typed frame source; this ADR does not add a second store, replay log or permission path, and the Human read position stays the reopening authority.

## Open questions that the first implementation spike must answer

1. **Revision contiguity.** Whether every visible message's revision directly follows the previous one after a content purge or a hidden placement. If not, an entry must declare the revision range it covers, or the cursor must be a different monotone value.
2. **Reconnect while scrolled up.** A new generation replaces the window with its opening tail page. If the reader had prepended older pages and is reading them, the consumer must keep those pages and merge the new tail only when contiguous, without the helper's first cursor drifting from the visible window. If that cannot be made exact, following mode must end when the reader pages up, and such a window is treated as detached.
3. **Page read fixed at a revision.** `channelTimeline` pages by opaque message anchors; the helper needs "the page through revision N". Whether this is a new Host method or an option on the existing one.
4. **Opening page size and the read anchor.** Reopening at the Human read position is a detached window by definition; confirm that opening the stream alongside it does not fetch and discard a tail page on every Channel switch, or accept that cost.
5. **Supported DSH range.** The helper exists from `0.1.7-alpha.1`; whether its behaviour is the same there as in `0.2.0`.

## Alternatives

Keeping the Client's own gap detection (the state after #1500) works and is already verified, but leaves two implementations of journal repair to keep in step with DSH. Moving every window, including around and newer paging, into the helper is not possible without changing the helper. Replacing ADR-0061's opaque anchors with revision cursors everywhere would expose a storage detail the Host deliberately hides and is not needed for contiguity checks.

## Verification required before this is Accepted as implemented

Reopen at the read anchor; page up with a stable viewport; locate and highlight an old message and page back to the latest; unread hint without forced scroll while away from the bottom; live message, receipt, read position and draft preview in two same-origin tabs; Host restart and carrier loss in both modes; purge of a visible message. Each in a real isolated Host, with what was and was not exercised stated.
