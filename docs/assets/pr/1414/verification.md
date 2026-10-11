# #1414 verification — 2026-10-11

Product head: `d3cbd0bb4380bc95e57d62cc33be92f9c1010733`.
Product base: `71aa4d06b4ba9619e17cd971c6e303eec9374bf6`.
Provider head: `602baa37fa327f7069545aaadbbd34db8a8f4636`.
Provider base: `81b91291600edba36b1947940c2be8e50abc9fdf`.

## Performed checks

- Product focused coverage: six files / 97 tests passed; pairing-card plus existing native-approval regression: two files / 22 tests passed, including group delegation Deny across restart. These runs overlap and are not additive.
- After the permission-column correction: Client pairing/settings and style-token coverage, two files / 26 tests passed.
- Product lint, typecheck, format, bilingual ledger and ADR-number checks passed. Complete product build passed before the CSS-only correction; the Client rebuild and targeted format check passed after it.
- Provider related Lark transport/controller/delivery coverage: 108 tests passed; build and package verification passed.
- The full local Windows product suite did not finish successfully. The roster-fixture EPERM cleanup failure reproduced in the accepted baseline and current code. Linux PR CI remains the full-suite gate.
- Full Windows Provider results: candidate 3,729 passed / 36 failed / 7 skipped; baseline 3,723 passed / 39 failed / 7 skipped. No new failing test locations. This is not a full-suite pass.

## Native Web captures

Before is accepted #1406 code at `cefa12fac05856c182bfab4b80f565f7ec074f06`; after is the product head above. Candidate screenshots were captured from the same production code at faf91a729eeddf1aa48832b784f236900593d541; the new head adds only a regression test. Both use fresh isolated Profiles and public UI, with synthetic Role names and no external App binding or receiver.

- Role editor: desktop light/dark and 390 × 844 dark before/after. The candidate saves `review-pairing` for use and `approve` for delegation while own `approve` remains unchecked.
- Additional public native setup flow: sidebar entry, create ordinary `QA Member`, saved Role table and reviewer details, then search `Pairing` with descending Time sort state. These screenshots use the same production code; management review/delegation remains empty on the newly created ordinary Role.
- Group editor: desktop before/after and candidate narrow view. These are preparation-state captures: no App is bound, so Save is disabled. They do not prove group persistence or real Lark activity.
- Candidate permission matrix measured at 390px viewport: body width 390px; columns 86.5 / 51.9 / 51.9 / 51.9 / 51.9px. Controls remain within the dialog, without horizontal overflow.
- T3 automation became unavailable with an explicit “No preview automation host … Do not retry”. Native Web capture continued in the permitted fallback browser. A fresh candidate fallback page reached `shell-ready` with no console errors/warnings. Earlier T3 failed reload attempts remain preserved as diagnostic evidence; no claim that their cause is fixed.

## Pending real group-only acceptance

No #1414 QA1 receiver has started. A fresh exclusive window and second applicant/reviewer actor are awaiting Human coordination. The signed-in Lark automation connection must also be restored, or the unavailable-browser step completed by the Human.

1. Confirm QA1's original receiver is stopped, record the exclusive start/stop window, and start only the new isolated Host with the exact qualified Provider.
2. Through Web, pair the reviewer in the same Bot/App and assign `review-pairing` plus explicit delegation choices. Keep reviewer DM unobserved for the group-only case.
3. From a different, unpaired Lark actor, @ the Bot in the authorized test group with a unique question marker. Everyone can see a metadata-only review card; no original-question Admission, wake, Task or model execution occurs.
4. Let the applicant attempt Role selection / Reject / Approve. The Host must refuse using the actual callback actor, without changing canonical pairing.
5. Let the reviewer select a Role. Grant a management Role only when its use and onward-delegation capabilities fit the reviewer's current explicit ceiling. Reject an out-of-ceiling choice.
6. Approve: all card copies reach final status, applicant receives the fixed ask-again notice, and only a fresh question produces a model reply. Correlate visible rendering with canonical Source Event, Admission, pairing and Outbox facts.
7. Exercise independent Reject, permission/Deny changes after selection, two reviewers competing for selection, and cold restart without duplicate sends. Optional private copies require an already observed trusted reviewer DM.
8. Stop the exact isolated receiver, record handback, and obtain first-flow Human feedback before codes or platform expansion.

Human acceptance, real Lark card rendering, native E2E, merge and deployment are pending. No credentials, login URLs or private conversation contents are included here.

## Model preparation

In the separate candidate Web DM, the uniquely marked `1414_WEB_MODEL_READY` question produced the actual model reply `323` for 17 × 19. This verifies the isolated Host's model path and shared machine-local credential reuse only. There is still no external App binding or Lark receiver, and this does not accept the real Lark pairing flow.
