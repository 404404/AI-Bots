# ADR-0228: Busy Group review has an explicit progress boundary

- Status: Proposed; implementation and verification under #2055
- Date: 2026-10-18
- Issue: [#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)
- Extends: [ADR-0227](0227-group-send-review-shares-the-channel-commit.md)

Continuous Group traffic can invalidate every read before a reply commits. The
application-defined Channel owner therefore allows an initial hold followed by at most
two automatic freshness rechecks. A failed second recheck returns `requires-review`,
the consumed budget, current draft version and explicit progress choices. Another ordinary
send cannot replenish the budget, even when it follows a different source message in the
same owner/Group. Existing wake policy remains unchanged.

At that boundary the PersonaBot chooses one of three actions. It may drop a redundant or
cancelled draft. It may drop the draft while leaving responsibility open, then use the existing
Bot Inbox `inbox_snooze` operation with a bounded time and note; resumption must read fresh
context and verify the condition before answering. Or it may explicitly send with
`freshness_override`, a current draft version, observation handle and short reason why its
answer is still necessary. Dropping a draft never implicitly completes Inbox responsibility.
The draft owner does not schedule a wake or interpret natural-language conditions.

The override is one action for the original owner, Group and expected draft version. Its
observation must cover all content required at the exhausted review boundary. Reading a
later revision of the same message counts; an older merged observation does not. Later
traffic can still arrive, so an override proves an explicit reviewed decision, not absolute
freshness or semantic correctness. Human corrections, cancellation and requests to wait
remain model responsibilities tested in real Sessions, not keyword rules in the Host.

The owner records actor, reason, observation, version, count and committed message identity
in its existing draft JSON in the same transaction as the formal Channel append. A successful
override retains that terminal audit record. No additional database generation, content store,
Session manager or scheduler is introduced. Permission, membership, active-Bot, stopped-turn,
Session ownership, source purge and expiry checks still precede the commit. Override does not
cross a Host restart; positive recovery remains #2056.

The existing direct `bot-tool ... channel_send --args-stdin` command invokes this same Consumer.
Tool traces distinguish exhausted review, explicit override, peer yield and snoozed work;
none creates a public system acknowledgment. Complete evaluation histories retain these
diagnostics separately from committed messages. Reverting this slice restores the earlier
review bound; retained terminal audit data confers no send permission on the old code.
