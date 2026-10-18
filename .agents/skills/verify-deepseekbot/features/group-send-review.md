# Group send review after a Human correction

An opt-in local Group holds a Bot reply when formal conversation content changed after its
observed basis. The Human sees only committed replies in canonical history.

## Sub-features

- Observe: full inbound content or bounded `channel_read` supplies a Host-issued basis.
- Hold: changed content returns `held`, clears the preview and creates no formal message.
  A bounded `review.content` delta supplies full newly observed messages and an explicit
  `review.observationId`; `review.complete` indicates whether an extra read is needed.
- Recheck: explicit `draft_id` and `observation_id` allow two revisions or unchanged rechecks.
- Drop: `drop: true` abandons the draft independently of Inbox resolution.
- Refuse: revoked membership, purged source, expired draft or restarted Host cannot auto-send.
- Review: the pilot retains complete paired histories and separate runtime/judge usage.
- Human preference: two full-history cards accept one Left/Right choice, save it and advance;
  dimensions and reasons are not required. “两边差不多” and “不好判断” are explicit outcomes; the last-choice button reveals per-arm tokens and known cost only after a choice. Skip leaves the pair unreviewed; undo and changes
  preserve previous choices. Legacy rubric scores retain their original review mode.

## How to get to it (user POV)

Create a local Group with two Bots and mentions-only wake settings. Enable it with
`deepseekbot group-send-review <channel> --accept`. Mention one Bot with a request; correct
the request while its preview is visible. The final reply should account for the correction.
Use `--off` to stop the opt-in. Existing wake defaults remain unchanged.

## Driving it with verify-app

Launch and doctor two isolated instances: frozen baseline #2053 B0 and the candidate.
`node scripts/e2e-group-send-review.mjs --baseline-instance <json> --candidate-instance <json>
--report <json>` runs a diagnostic pair using `DEEPSEEK_API_KEY` and the fixed direct model.
`--formal` runs exactly four families of ten pairs; it must use committed candidate bytes.
Do not count diagnostics or missed race windows as valid pilot successes.

Append `--conversation` for the separately versioned `2053-ingest-v1` supplement: two real
Human/Bot exchanges establish facts before the target request. During its draft, correction
arrives as two separate messages (time and room). Full histories and whole-episode usage stay
in the report; the prelude boundary only excludes already-completed replies from target-stage
cancellation/obsolete-output counts. Post-prelude usage is reported separately, with unknown
buckets preserved. This cohort does not replace the original pilot or erase its latency failures.

Open the resulting Group in the Web Client and capture the original request, correction and
final answer with `verify-app shot`; inspect console output. Compare `channelMessages` with
the draft frames and `botToolTrace`: a held draft must have no canonical placement.
Use `bot-tool <bot> channel_read --args-stdin`, then `channel_send` with the returned
`observationIds[channel]`; append a Human correction between those CLI calls to deterministically
exercise the same production guard without the model. Recheck directly with `review.observationId` after reading a complete held delta.
Verify a second intervening correction still stops it; omitted/oversized content must be
read explicitly, and neither another Bot nor an old concurrent send inherits the handle.

Render the saved pilot with `scripts/group-send-review-report.mjs render` and open the HTML.
Choose one card: progress advances by one, the choice survives reload, and judge/cost evidence
stays hidden. Return to the chosen pair before revealing; a post-reveal change must remain
marked in the exported JSON. Check undo, skipped pairs, full message bodies and narrow layouts.

## Gotchas

- A successful tool call returning `held` is not delivery. Missing usage remains unknown.
- Draft previews are public temporary content; they are retained separately in reports.
- Tool handles cannot cross owners or Groups. Source purge removes derived draft bodies.
- After two failed rechecks, automatic retries stop. Recovery after restart remains #2056.
- Human acceptance requires independent review of full histories; no test or LLM signs it.

## Explicit completion and revoked-source regression

Pass `resolve_inbox_ids` on direct `channel_send` and inspect `inboxResolution` separately
from `status: committed`. A held/refused send must leave the specified work open. A successful
drop resolves only explicitly selected observed IDs. A failure after delivery is repaired
through `inbox_resolve`, without resending. In a real Group turn, remove the sending Bot:
neither the Group nor a DM may receive continuation of that task. A subsequent independent
DM still works. The fixed pilot retains `legacyGroupGoal` but uses the versioned whole-history
oracle; cancellation/revocation succeeds only with no public Bot output in any Channel.

A send without explicit completion IDs returns `inboxResolution.outcome: not-requested`.
Verify the Bot handles completion in the current turn, rather than creating a second cleanup
turn. Drop may omit channel_id only when an inbound Channel exists; the draft owner/channel
checks remain unchanged.

## Peer-answer yielding (#2054)

Run two actual Bots on the same Group request. When B commits while A is generating, A's
held result identifies fully returned committed peers in `review.peerMessageIds`. Read the
content; A may drop silently with `yield_to_message_ids` and `observation_id`. Direct CLI uses
the same `channel_send` tool. Verify `explicit-peer-yield`, durable evidence IDs and no public
agreement bubble; Inbox work stays open unless explicitly resolved. An invented preview ID,
Human/self message, missing observation or changed/purged peer cannot certify yielding.
Verify independent evidence still commits and a repeated-word new Human question is answered.

`node scripts/e2e-group-peer-review.mjs --baseline-instance <accepted-2053-json>
--candidate-instance <candidate-json> --original-instance <B0-json> --report <json>` runs a
diagnostic triplet. `--formal` freezes four families of ten triplets, including same-length
FYI/explicit-request controls. Both Bots' real preparatory and target turns count in usage.
Natural timing may miss the race: retain those attempts as incomparable, not replacement
successes. Export the two pairwise comparisons without double-counting shared candidate cost.
Capture full Group history in Messages and compare with direct CLI/trace evidence. The original
cohort used dual-order external judges; future diagnostics follow the Human-directed direct
assistant assessment below, with complete histories retained for optional Human inspection.

## Merge follow-through regressions

Start from a fresh isolated Profile for schema generation 99; old unmerged generation 96/97/98
pilot Profiles remain immutable evidence, not supported upgrade sources. In a Group with more
than 20 historical messages, send without an observation: the held delta must include the latest
Human correction and permit a corrected recheck. With an existing observation and more than
20 intervening changes, the delta is incomplete and a retry cannot silently skip omitted content.
After successful submission, inspect returns no pending draft and explicit reuse is refused;
the Channel retains exactly one committed reply.

As directed by the Human on 2026-10-18, future cohorts use DSH to run actual Bot Sessions.
The current GPT-6 Astra assistant reads full Session, conversation and Tool records to assess
correctness and interaction quality; no external model judge is invoked. Record reviewer and
protocol provenance, retain original external-judge results, and never label assistant review
as independent Human acceptance. Missing token/cost data remains unknown.

Peer refinement also applies the relevance check before an ordinary Group send, not only after
a hold. Conditional requests to check for additions do not require public acknowledgments;
explicit Human corrections remain constraints rather than speculative confirmation questions.

When a full peer answer has already been read and no held draft exists, verify that the Bot
resolves completed Inbox work without creating a no-addition draft or reaction. Existing held
drafts still use explicit drop with observed peer evidence. Useful replies contain the answer,
not an explanation of task ownership or the yielding protocol. Inspect native Tool records
as well as the final silence: a refused no-addition send followed by drop is not a clean path.


## Busy Group progress (#2055)

`node scripts/e2e-group-busy-review.mjs --baseline-instance <accepted-2054-json>
--candidate-instance <candidate-json> --original-instance <B0-json> --report <json>` runs
the busy-Group diagnostic. `--formal` freezes four families of ten triplets; retain timing
misses and every failure, then directly assess all full histories without external judges.

Use the same direct send Tool to hold a draft, then inject more messages before each of two
rechecks. Verify `budget.used` reaches two and `requires-review` reports the current
`draftVersion`; new ordinary sends must return the existing draft and cannot replenish the
budget. A full read plus `freshness_override` with that version and a reason can commit once
when the observation still covers current content. Insert a correction after that read and
before submission: require `override-context-changed-defer`, no public append, and only
drop/snooze choices. A second override must refuse even after another read. Inspect the one
canonical reply on the unchanged-content path and the durable decision/Tool trace.
In a native Orchestrator turn, drop the exhausted draft and attempt a fresh send: require
`dropped-exhausted-draft-defer-turn`. A later independent request must remain answerable.
Separate direct Tool invocations are separate operations, so verify this turn boundary in
the native Session path as well as the focused runtime regression.
Drop an exhausted draft with completion IDs containing its original Source Event, original
Group Message and completed FYI. Require both original aliases in `keepOpenInboxIds` and
`inboxResolution.keptOpen`, the original Admission still unresolved, and only the FYI
resolved. A later explicit completion decision remains possible; observed peer-yield drops
must still compose normal completion. Check the actual Inbox owner, not only the Tool text.
Wrong owner, wrong version, incomplete observation, revoked membership, stopped/archived Bot,
expiry and purge must refuse without a new message.

To defer, drop the draft without completing the Inbox item, then use the existing
`inbox_snooze` with a note and bounded time. Provide the awaited fact within the episode,
observe the actual resume/read/reply and count all prelude, triage and resume usage. Snoozed
work must still wake at its deadline when the awaited fact arrives without a mention and
has not otherwise been observed; ordinary context alone cannot cancel the return timer.
Verify that a later genuinely observed message still returns the item early without a
duplicate deadline wake.
For freshness-only contention, verify the exhausted/drop result's `suggestedSnoozeUntil`
is a short future Host time and that the Bot actually resumes within the episode. It is
not permission to shorten a Human deadline or ignore a condition. The v2 runner records
the outcome cutoff, pauses only its own episode Bots and stops remaining turns before
final usage settlement; late output stays visible but cannot change a censored outcome.
Snoozed work alone is not a successful task. Human history remains committed messages, with decision
diagnostics separate. Capture the real Group history in the Web Client and inspect console.
