[Refs #1414](https://github.com/BotHarness/DeepSeekBot/issues/1414) | [Task claim](https://github.com/BotHarness/DeepSeekBot/issues/1414#issuecomment-6108082030) | [Provider PR #21](https://github.com/DoodleBears/dsh-im/pull/21)
Agent-Task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`

## Why the change

Let an authorized reviewer approve or reject ordinary Lark pairing directly in a shared group card, including when neither person has a private DM route, with grants limited by current explicit delegation authority.

## Special things to note

- Merge risk: **one-way door for database generation 80 / large blast radius** — back up before upgrading; rollback requires restoring that backup and a compatible writer. Review the Messaging transaction, exclusive qualified Consumer, actual callback actor, source/Binding identity, delegation ceiling and first-winner revision fences.
- `review-pairing` and delegable capabilities are separate from native execution approval and personal use capabilities. Historical roles/groups/people get no implicit review or delegation authority. Web Human authority stays unchanged. Provider is pinned to `602baa37fa327f7069545aaadbbd34db8a8f4636` / `4.32.0-botharness.19` and requires `pairingCardVersion: 1` plus `pairing-card-checked`.
- **Draft: real Lark rendering and first-flow Human feedback pending.** Focused product and native-approval regressions, Client token checks, lint/typecheck/format/ledgers and builds passed; the complete Windows product suite has a reproduced baseline EPERM fixture-cleanup failure, and Linux PR CI remains pending. [Performed checks and runnable acceptance](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/verification.md) keep these gates separate.

## Change outline

```text
unpaired restricted group @ or DM
  → existing Messaging pending request (no old-question execution)
  → canonical delivery/selection receipt in messaging_pairing_cards
  → qualified Provider shared group card (+ observed reviewer DM copies)
  → actual actor selects Role / approves / rejects
  → current review-pairing + explicit delegation ceiling
  → current Bot/App/source + Role/request revision + exact card receipt
  → first canonical decision → fixed ask-again notice
  → only a fresh valid message reaches model execution
```

```diff
  Role.capabilities / group Allow-Deny / person exceptions
+ review-pairing: approve or reject ordinary chat enrollment
+ Role.delegableCapabilities
+ group and person delegateAllow / delegateDeny
  effective use = union(use Allow) − any(use Deny)
+ effective ceiling = union(delegate Allow) − any(delegate Deny)
+ proposed Role use AND onward delegation must fit reviewer ceiling
  messaging_pairing_cards: request, destination, delivery receipt,
    Role revision choices, selecting actor, decision/update state
  botharness/approval-v1 → unchanged private native execution path
+ botharness/pairing-v1 → Messaging-owned chat pairing path
```

Permission settings use native dialogs, contextual info controls and the existing table layout. Review and delegation use independent choices; shared cards show request metadata and Role capabilities without copying the blocked question. Unknown delivery is kept for Web review rather than blindly resent. Cold restart preserves accepted receipts and exact selections.

**Actual native Web before / after:** fresh isolated Profiles with synthetic Role names, no App binding and no receiver. The candidate Role was created, edited, saved and reread through the public UI; it uses `review-pairing` and delegates `approve` while personal `approve` remains unchecked.

| Role editor | Before | After |
| --- | --- | --- |
| Desktop light | ![Before: existing Role use capabilities](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/before-role-light.png?raw=true) | ![After: pairing review and separate delegation](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/after-role-light.png?raw=true) |
| Desktop dark | ![Before dark](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/before-role-dark.png?raw=true) | ![After dark](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/after-role-dark.png?raw=true) |
| 390 × 844 | ![Before narrow Role dialog](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/before-role-narrow-dialog.png?raw=true) | ![After narrow Role dialog](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/after-role-narrow-dialog.png?raw=true) |

**Group preparation flow:** Bot DM → Channel sidebar → External identities → IM roles and pairing → Groups → Create group. These captures show the new editor only; Save is disabled until a real App is bound. They do not claim group-save or Lark E2E evidence.

| Existing group editor | Four independent permission choices |
| --- | --- |
| ![Before group editor](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/before-group-dark.png?raw=true) | ![After group editor](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/after-group-dark-fixed.png?raw=true) |

![Candidate group editor at 390 × 844, all columns and actions visible](https://github.com/BotHarness/DeepSeekBot/blob/codex/1414-review-evidence/docs/assets/pr/1414/after-group-narrow-visible.png?raw=true)

**Remaining visual/QA capture:** actual Lark group/DM cards, paired-person permission sources/exceptions and the complete real apply/select/approve/re-ask/reject/deny/restart flow. A fresh QA1 receiver window and a second applicant/reviewer actor await coordination. T3 returned explicit automation-host unavailability; native Web screenshots used the permitted fallback browser. Keep Draft until this temporary capture exception is resolved and Human feedback is recorded.

One-time codes remain the next #1404 slice after feedback; native Questions, saved rules, group execution destinations and other providers retain their existing owners.
