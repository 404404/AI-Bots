---
Status: Accepted
Date: 2026-10-13
Issues: [#1535](https://github.com/BotHarness/DeepSeekBot/issues/1535), [#1536](https://github.com/BotHarness/DeepSeekBot/issues/1536)
---

# Asks follow the Channel the task came from

A PersonaBot can stop a task to ask the Human for something: approval of a tool call, an answer to a question, or access to a folder. All three were pinned to the Bot's Human DM. A Human who mentioned a Bot in a Group therefore saw nothing in the Group while a card waited in the DM, and `request_workspace_grant` refused to run outside the DM. Users reported this as the Bot answering a Group mention in the DM.

## Decision

An ask raised by an Orchestrator turn is posted in that turn's inbound local Channel.

- The runtime answers `askChannel(sessionId)` from the active turn: its inbound Channel when that is a Group the Bot belongs to or the Bot's Human DM, otherwise nothing.
- Tool approval cards and user question cards use that Channel and fall back to the Human DM. Their pending notices carry the Channel, and the Human Inbox and the Window Companion read it from there.
- `request_workspace_grant` works from a Group turn and posts its card in the Group. The Human's resolution in that Group wakes the requesting Bot as a direct mention, and the turn message says it answers the grant request.
- Deciding, answering and resolving are accepted in the Channel that holds the card. In a Group the asking Bot is the card's author and must be a member.
- Authority does not change: the local Human decides in the Channel, and a Group card is not answerable by Bots or by Group membership alone. Delivery of a tool approval to the Bot's configured external management destination (#1019) is unchanged and now also covers a card posted in a Group; an external decision still needs that route's explicit approver capability.

## Kept in the Human DM

- Secret input (`ask_secret`), so credentials and their prompts do not appear in a Group (ADR-0169).
- Asks from an Assignment Session, which has no inbound Channel of its own.
- Asks from a turn with no inbound local Channel, such as a Bot Schedule or an external IM source.

## Consequences

- A turn that carries messages from several Channels asks in the Bot's Human DM. The Host cannot tell which message caused a tool call, and a card shows the tool input, so a DM task must not surface its card in a Group that happened to start the turn.
- Everyone in a Group can see an approval card's tool name, working directory and input. A Bot that needs to keep those private can still be asked in its DM.
- Rejected: keeping cards in the DM and posting a notice in the Group. It keeps the Human moving between two Channels for one task, which is the experience this decision removes.
