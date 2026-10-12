---
Status: Accepted
Date: 2026-10-12
---

# The Bot DM is the Bot's timeline, so its actions elsewhere also appear there

A PersonaBot answers in a Group, the Human opens its DM, and nothing there says what it just did. ADR-0154 put each Bot Self-Record in the Channel that caused it and wrote nothing at all for a reply inside its own cause, so a Group reply left no trace in the Bot DM. The DM did show some system lines, such as Memory commits made outside any turn, but without the Group work around them they read as noise. User feedback on 2026-10-12 described the result: Group and DM could only be used one at a time, not together.

The Human set the direction the same day: **the Human–PersonaBot DM carries the Bot's whole life.** Whatever the Bot does, wherever it does it, the DM shows a short line for it, and the Human can turn each kind of line off.

## Decision

- **Posts elsewhere leave a trace line in the Bot DM.** When a PersonaBot posts in a Group or a Bot-to-Bot DM, the same transaction writes a `botChannelPost` Channel Notice into that Bot's Human DM. The notice stores only `{ channelId, messageId }`. The excerpt is projected when the notice is read, from the post's own Source Event, so the notice never copies content (ADR-0037). A purged post therefore shows "unavailable" rather than a stale copy. Clicking the line opens the post where it lives.
- **Self-Records caused elsewhere are also placed in the Bot DM.** A Memory commit whose cause is a Group or Bot DM keeps its Source Event and Channel Notice in that cause Channel, as ADR-0154 decided. It also gets a second Channel placement in the Bot's Human DM, which Generation 52 already allows. Read projection marks such a placement with `noticeOrigin`, so the DM line names where it happened.
- **No duplicate lines.** A post in the Human DM itself writes no trace. A Bot DM send whose `botDmAction` notice already lands in the sender's Human DM writes no extra trace either.
- **They stay Channel Notices.** Trace lines and mirrored placements share ADR-0154's notice exclusion: no unread state, no receipts, no Channel preview, and no Inbox Admission, so they never wake anyone. The Bot can still read them through `channel_read`, which helps it see its own recent actions in one place.
- **Display toggles, not recording toggles.** The DM has a "show what this Bot did elsewhere" menu with one switch per kind: posts, and Memory updates. Every kind is shown by default. A switch only hides lines in that Client, so turning one back on shows the history that was already recorded. The choice is a per-Bot local display preference, not Profile state.
- **Consecutive traces collapse.** Consecutive posts in the same Channel render as one line with a count and the latest excerpt, so a busy Group does not flood the DM.

Native DSH tool calls and thinking still stay out of the DM (ADR-0029, ADR-0030, ADR-0154). Showing them is a separate, opt-in decision that will read from DSH SessionPersistence rather than copy traces into Channel history.

## Considered Options

- **Keep ADR-0154's "records follow their cause" only:** rejected. It hides the Bot's Group work from the place the Human treats as the Bot's home.
- **Place the Group post's own Source Event in the DM:** rejected. A full Bot message in the DM would count as unread and as the DM preview, and the Orchestrator would see Group content as DM conversation.
- **Store an excerpt in the notice:** rejected. It is a second copy of content that purge and retraction would have to chase.
- **Toggles that stop recording:** rejected. Hidden history could not be recovered by turning the switch back on.

## Consequences

- This revises ADR-0154 in two places: a reply inside its own cause now leaves a trace in the Bot DM when that cause is not the DM, and Self-Records caused elsewhere gain a DM placement.
- No Profile schema Generation change: the notice and origin are JSON payload fields and placements already allow one Source Event in several Channels. A binary from before this change would show a trace as an empty Bot message, so rollback needs the matching Client.
- Scheduled-task actions join the same rails when their Self-Record lands. Native tool traces remain a later, opt-in slice.
