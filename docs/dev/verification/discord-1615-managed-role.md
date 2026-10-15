# Discord managed-role mention qualification (#1615)

## Candidate and scope

This candidate recognizes only a native mention of the current authenticated Bot user or its own verified integration-managed role. It retains the existing checked Provider → canonical Source/Inbox → Orchestrator → source-bound Outbox/reply path. Role recognition is separate from Message Content permission and actual Gateway delivery.

Maintained Provider source: `1fc80010ab7cfd10ecc4f63c1d46c098e829c6a6` on DSH `0.2.0-rc.2`. Input runtime: 421 files, SHA-256 `8e9416fc17b44d5af993654794e8a795b1a01784bcda68115e1479b1f6695358`. Product candidate: independently versioned `4.32.0-botharness.22`; no publication or deployment is implied.

## Automated proof

The original Runtime/Consumer regression failed with expected one admission, actual zero, before the fix. It now passes with unchanged ordinary collection opt-out. The complete affected Discord suite passes 96/96, including native-channel and existing-thread routes, unrelated roles, everyone/here, role ownership changes, exact IDs, forged message metadata, lifetime disposal, checked replies and existing ordinary intake. Provider build and package verification pass.

The Core regression additionally exercises a checked event with `mentionedAccount: true`, original role text and an empty user-mention list through canonical Inbox/Orchestrator/Outbox. It must not depend on text search or fabricate a user mention. Controlled tests are not live-model or native Discord proof.

## Outstanding real qualification

- Fresh current-App Bot-user and managed-role mentions, with original-location rendered replies and correlated native receipts.
- Unrelated native role, everyone and here negatives, with no direct-mention admission/model wake or unintended send.
- Verified current App/role/member identity, exclusive receiver window, and restoration of normal replies if an existing receiver is switched.
- Actual Client evidence and installed tarball verification, bound to the final Core/Provider revisions.

The T3 preview initially reported an available tab but snapshot/open then refused with no connected automation host. The fallback browser reached Discord's login route without an authenticated chat. These are browser-access limits, not Provider failures or native qualification. No existing receiver has been stopped or replaced by this task.

References: [issue #1615](https://github.com/BotHarness/DeepSeekBot/issues/1615), [role tags](https://docs.discord.com/developers/topics/permissions#role-object), [message fields](https://docs.discord.com/developers/resources/message#message-object), [ADR-0128](../../adr/0128-discord-checked-replies-preserve-native-child-channel-routing.md).
