# Exact private Lark rule tracer — native QA

Date: 2026-10-12. Host head `9b495bf6705959c668f1f7cac5423f65e1af5760`;
Provider head `cb7f02a99046217db8e26fc203a4f5dfc3e2befc`.
Task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`.
The Human granted QA1 **BotHarness Inline Setup QA #1111** exclusively for this round.
The task-owned isolated receiver was stopped after verification; this window is released.

## Actual browser and canonical authority

The signed-in reviewer was confirmed from trusted platform identity at a fresh DM-origin
pairing request. Web configured QA Rule Reviewer with approve, reject and independent
save-rules; pairing review and all delegation capabilities were empty. The restricted first
request produced only the waiting application and fixed re-ask notification after approval.
It did not become a Source Event, Inbox Admission or deferred tool instruction.

The fixed complete native input was:

```json
{"command":"node -e \"console.log('BH1033_EXACT_OK')\"","description":"Print exact marker string via node"}
```

The scope was the same Bot, Orchestrator, memory directory and empty current Grant set.
The actual preview displayed the complete input and concrete scope key. Public captures
mask the private machine-local directory; they do not replace or alter operation input.

| New message | Actual result | Native asked / decided / result sequence |
|---|---|---|
| 1033_EXACT_A_1410 | Preview created no rule; Back cleared confirmation without executing. A new preview and Confirm saved an exact rule and produced BH1033_EXACT_OK. Final card had no buttons. | 40 / 41 allowed-once / 42 success |
| 1033_MATCH_B_1415 | Identical complete input executed with no additional card delivery. It still appended an independent native approval decision and returned BH1033_EXACT_OK. | 65 / 66 allowed-once / 67 success |
| 1033_MISMATCH_C_1417 | Changed command produced a new pending card. Reject produced a rejected Tool Result; the command did not execute. Final card had no buttons. | 90 / 91 rejected / 92 rejection error |
| 1033_REVOKED_D_1426 | Actual Web revoke permanently disabled the first rule. Its known Lark receipt became fixed disabled text with no parameters or controls. Identical input again required a card and was rejected. | 115 / 116 rejected / 117 rejection error |
| 1033_CREATOR_E_1428 | A new private preview/Confirm explicitly created a different rule; the call returned BH1033_EXACT_OK. | 135 / 136 allowed-once / 137 success |
| 1033_CREATOR_OFF_F_1431 | Actual Role editing removed save-rules. The second rule immediately became revoked. Identical input required a card with only Allow once/Reject and was rejected. | 160 / 161 rejected / 162 rejection error |
| 1033_RESTART_G_1435 | Restored save-rules, drained the turn, stopped and restarted the same task Host/Profile/port. Both old rules remained revoked. Identical input still required fresh approval, with rule saving offered again; Reject did not execute. | 189 / 190 rejected / 191 rejection error |

All seven fresh IM Source Events had **handled** Inbox Admissions. Seven reply Outbox
records were **provider-accepted**, and the actual Lark replies were inspected separately.
No rule came from preview or Back. The two saved rule IDs both retained non-null revocation
timestamps after authority restoration and process restart. Native Session facts were read
from canonical persisted SessionEvent frames; no execution events were injected.

## Screenshot provenance and limits

The Role editor before/after pairs in the PR remain actual base/head comparisons. Native
captures below are the current head's real workflow or current-authority comparisons;
they are not presented as screenshots of the base source revision.

All Lark screenshots use the designated QA1 DM, native English/Chinese card text and the
light Lark theme. The authority comparison uses the same 1280 × 1200 viewport and exact
input: `lark-approve-only.png` has no save-rules grant; `lark-restored-restart.png` restores
the grant but retains disabled old rules. Other captures show the saved result, different-
input rejection, fixed disabled receipt and Web list after restart. Images are cropped to
the relevant card/list, excluding unrelated conversations. Grey rectangles explicitly
redact local path rows. Original screenshots and complete native facts remain task-local.

`lark-preview.png` is the visible preview region, with full risk/input text and Confirm.
Back was below the fold in that raw capture, so this image does not demonstrate Back's
rendering. Back was operated on the refreshed real card and its canonical no-rule result
was checked. A comparable base-version native card capture is unavailable in this round:
only the candidate was connected to the authorized App; simultaneous baseline reception
would violate the exclusive window, and generation 82 cannot be rolled back in place.
Before merge, capture a base card in a separate Profile during a newly coordinated window
or explicitly review this capture limitation. The two-control authority-state capture is
not a substitute for that base-version image.

Lark Web retained cached cards after some accepted updates. Reloading and reselecting the
designated DM rendered the canonical preview/final/disabled state. This verifies refreshed
rendering, not reliable live in-place replacement in this browser. A native button click
that did not settle the request was retried against its actual current text child; only
canonical settlement and the refreshed visible result were counted as successful.

## Separate gates

Host full verification CI and preparation passed. Current-source 68 focused regressions
and Provider 65 regressions passed. Source Standards/Spec reviews had no remaining findings.
Earlier Windows full-suite timeout/EPERM limits remain documented in the PR. Current cold
Client diagnostics before the restart reported shell-ready with no earlier failures, and
actual Role editing and the post-restart Web rule list rendered successfully.

First-slice Human acceptance is still required. Both PRs remain Draft. All-opaque private
confirmation, sibling providers and shared execution destinations are not qualified here.
There was no deployment, package release or production receiver takeover.
