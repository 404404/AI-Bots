---
Status: Accepted
Date: 2026-10-13
Issues: [#1503](https://github.com/BotHarness/DeepSeekBot/issues/1503), [#1504](https://github.com/BotHarness/DeepSeekBot/issues/1504)
---

# The tail-following Channel window uses the journal stream; detached windows stay on timeline pages

ADR-0181 puts the Channel's live frames on DSH's Remote stream carrier in the journal frame vocabulary, but the Client still owns the hard part itself: detecting a revision gap, reloading, and reopening. DSH ships `RemoteJournalStream` for exactly that work and uses it for its own session timeline. ADR-0061 separately gives the Channel timeline Host-owned opaque cursors and four windows (latest, older, newer, around). This record decides how the two divide the Channel window. The Human accepted it on 2026-10-12 with two instructions: answer the open questions with a spike before implementing, and target DSH `0.2.0` and later for this work without carrying compatibility for older Hosts.

## What the helper does

Read from the published `@deepseek-ai/dsh-api-gateway` `0.2.0-rc.1` Client modules and DSH's session controller, then confirmed by running the real class against a model Channel journal (`packages/client/test/journal-stream-contract.test.ts`). It has not yet been run against a real Channel in a Host.

- Every physical generation starts with one `opened` frame carrying a cursor **and a page**; the page's tail must equal the cursor. The helper publishes it as a `replace` of the whole window.
- Each `entry` must directly follow the last applied cursor. A gap makes the helper read a repair page "through" the missing cursor with a domain page-read call, merge entries that arrived meanwhile, and publish one `replace`. An entry can cover a cursor range (`first` … `last`).
- `prepend(request)` reads one older page and requires it to end exactly before the window's first cursor.
- `notification` frames carry no cursor and wait behind an in-flight repair.
- The window is always attached to the journal tail. There is no call for a window around an older position or for paging towards newer entries.
- A normal end after the opening frame is a carrier loss the Gateway retries; a protocol violation or a failed page read is terminal and reported through `failed`.

## Decision

- The Client timeline has two modes. **Following**: the visible window reaches the tail (`hasNewer` is false). **Detached**: the window is around a read anchor or a located message, or was paged towards newer entries and has not reached the tail.
- In following mode the window is owned by `RemoteJournalStream`. The cursor is the Channel revision; an entry is one committed message with its revision; `follows` is "next revision". `followChannel`'s `opened` frame gains the tail page (messages, `hasOlder`, the opaque older anchor). The Client applies `replace`, `append` and `prepend` changes and no longer checks revision continuity or reloads on a gap itself.
- Older pages in following mode go through the helper's `prepend`, backed by a Host page read that can be fixed at a revision. The opaque anchors of ADR-0061 stay the paging contract; the helper only needs each entry's revision to check contiguity.
- Detached windows keep using `channelTimeline` exactly as ADR-0061 describes. One journal stream stays open for the selected Channel in both modes: while detached, its `append` changes advance the Channel revision, latest preview and the new-message control without being stitched into the visible window, as today. Returning to the latest position adopts the stream's current tail window.
- Receipts, read positions and draft previews remain `notification` frames; the draft revision check stays in the Channel consumer, because drafts are process-local and not part of the journal.
- A terminal failure falls back to the existing recovery: reload the conversation through the bridge and open a new stream. The Host keeps one typed frame source; this ADR does not add a second store, replay log or permission path, and the Human read position stays the reopening authority.

## Spike results

1. **Revision contiguity: holds.** A Channel revision is the message's position in the Channel's placement order, so consecutive messages always have consecutive revisions. A content purge removes the body and keeps the placement; no path deletes a placement. One entry is one message and `follows` is "next revision".
2. **Reconnect while scrolled up: the helper replaces the window, and the consumer can merge.** Run result: after paging up, a new generation publishes one `replace` holding only the new tail page, and the helper's first cursor moves to that page's first entry. A later `prepend` must then end right before that cursor; a request based on the reader's older position is rejected as discontinuous. So the consumer keeps the entries it already shows when the new tail page overlaps or directly continues them, takes the page alone when it does not, and always asks for older pages relative to the helper's first cursor, which it records from each `replace` and `prepend`. Pages it already holds are deduplicated. Following mode therefore does not have to end when the reader pages up.
3. **Page read fixed at a revision: a small addition.** The Host pages over the ordered message list, so "the page through revision N" is the same paging over the first N messages. The journal's own page read takes a revision bound and an optional "before revision"; `channelTimeline` and its opaque anchors are unchanged for detached windows.
4. **Opening page versus read anchor: accept one tail page per Channel open.** Reopening at the read anchor is a detached window, and the stream still opens so the revision, preview and new-message control stay live. Its opening tail page is the window the reader gets on returning to the latest position, so it is used rather than discarded; the opening page size stays at the timeline's default.
5. **Supported DSH range: not a constraint.** By Human decision this work targets DSH `0.2.0` and later. The product's declared `engines.dsh` range is a separate decision and is not changed by this record.

## Alternatives

Keeping the Client's own gap detection (the state after #1500) works and is already verified, but leaves two implementations of journal repair to keep in step with DSH. Moving every window, including around and newer paging, into the helper is not possible without changing the helper. Replacing ADR-0061's opaque anchors with revision cursors everywhere would expose a storage detail the Host deliberately hides and is not needed for contiguity checks.

## Verification required before this is marked implemented

Reopen at the read anchor; page up with a stable viewport; locate and highlight an old message and page back to the latest; unread hint without forced scroll while away from the bottom; live message, receipt, read position and draft preview in two same-origin tabs; Host restart and carrier loss in both modes; purge of a visible message. Each in a real isolated Host, with what was and was not exercised stated.
