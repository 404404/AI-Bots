# #1406 verification — 2026-10-11

Implementation head: `cefa12fac05856c182bfab4b80f565f7ec074f06`.
Base: `d87b39104305cd9bf2f2420ab018d9e31767741f`.

## Verified locally

- 164 focused and regression tests across eight files passed: pairing, native approval decisions, Operational Database migration, Client pairing settings, default messaging traffic, the DSH Bot agent adapter, and grant execution.
- Lint, format check, typecheck, build, product/Skill changelog checks, source policy, and unique ADR checks passed. Existing lint warnings remain unchanged.
- Isolated Host and real Client: create a group, scoped member selection, persist two independent groups, write a personal Approve Deny, inspect current permission sources, and restart the same isolated Profile. Both groups Allow Approve/Reject; the personal Deny leaves only Reject effective after restart.
- A real direct authenticated Web Human DM used `channel_send` and delivered `WEB1406_OK` without IM pairing or external permission configuration.
- QA1's first current-permissions request was acknowledged by the Lark platform and admitted by the isolated Host; the real model called the current permission Tool. Earlier optimistic-only sends remain excluded from the evidence below.

Post-merge local checks: typecheck, lint, format and build passed; nine Client pairing tests and 34 Provider-pin/product-artifact tests passed. The broader native-Windows retry stalled before reporting results and was stopped; it is not a passing run. Linux CI covers the combined tree.

## Verified Linux CI

- Full Linux CI passed at previous head `550898dd`: lint, format, typecheck, slides, tests/docs, build, and generated-file consistency. 3994 tests passed and 13 skipped; 480 files passed and 7 skipped. [Successful run](https://github.com/BotHarness/DeepSeekBot/actions/runs/38121674985). Current head adopts the bounded Provider rendering repair; its [fresh CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/38129800586) is running and is not inferred from the previous run.
- After pin adoption, 46 relevant pin/artifact/approval tests, lint, format, typecheck and build passed. An additional unchanged POSIX directory-fsync probe has nine `EPERM` failures on native Windows; no full Windows suite is claimed green. The Provider's 105 relevant public Delivery/Lark/controller tests, build and package verification passed; its new create→patch regression failed before the fix.

## Real Lark decisions — recovered browser, 2026-10-11

The Human authorized QA1 exclusively for #1406 until this acceptance run ended. Each receiver start checked the current claim/process evidence. Tests used the signed-in Lark private conversation with the designated QA App and a separate Host/Profile. Commands only printed unique markers; they did not read/write files or access the network. The temporary management pairing stored Reject only; the primary ordinary Role had no management capabilities. Approve was contributed by the two authorization groups.

| Scenario | Canonical native evidence | Actual Lark result |
| --- | --- | --- |
| Group Allow once | call seq 91, allowed-once decision seq 93, successful result seq 94 | `BH1406_GROUP_ALLOW_ONCE_1811`, exit 0, one execution |
| Independent Reject | call seq 115, rejected decision seq 117, error result seq 118 | Refusal reply; `BH1406_REJECT_MUST_NOT_RUN_1816` was not executed |
| Delayed group Deny | Pending call seq 135; QA Reviewers changed through the actual Client to Approve Deny/Reject Allow while Flow Reviewers retained Approve Allow. Clicking the old Allow once left the request pending with no decision/result. Reject on that same card then committed decision seq 137 and error result seq 138 | Refusal reply; `BH1406_DELAYED_DENY_MUST_NOT_RUN_1817` was not executed |
| New Allow once after restart | Same isolated Profile restarted; restored group permissions, fresh call seq 155, allowed-once decision seq 157, successful result seq 158 | `BH1406_RESTART_ALLOW_ONCE_1819`, exit 0, one execution |

Corresponding Source Events, in table order:

- `im-227fd1270bc5cf42107d0cc9dc308f5c55499f09e2b5d6094a773b80cdb1f4f6`
- `im-b59b73769d2a90008434515fabfe2ebf5e62c896bf0dc314a31f6a4467b0b708`
- `im-034b023c8a86e0bc65d50ffaec2add7d8ad0795c2febdb35d39aeeafd0e9ce38`
- `im-1f7c1551a9f71396f81a8f6510b5a488013e870f2a11b5b18b8177007aab09d0`

All four have handled Admission records and provider-accepted reply Outbox facts. Actual replies were read in Lark DOM, rather than counting provider acceptance alone. Before Reject settled the delayed scenario, separate saved readbacks confirmed pending approval and absence of the native result. No refusal toast was observed; the evidence supports the blocked execution and remaining Reject behavior.

## Original-card repair and final visible qualification

The first run exposed stale original cards despite final Lark service readbacks and correct result replies. A minimal display-only diagnostic using shared mode updated visibly in the same conversation; it had no operation or authority and was not counted as product acceptance.

[Provider PR #20](https://github.com/DoodleBears/dsh-im/pull/20), exact source `1bf6baa8ad09b337f80f119961d10c4783ea702e`, enables `config.update_multi: true` on both initial send and patch. The built Host differs only by this flag and trailing whitespace; the Client is unchanged. The isolated Host installed/digest-verified this exact candidate (412 files, SHA-256 `1d2dcc7d4548cf74edfac7934eb065aa9b1fae99fb0b9309931ae285d932d6c5`).

Two fresh native requests then qualified the product path: Allow once decision/result seq 181/182 produced `BH1406_SHARED_CARD_ALLOW_1835`; independent Reject decision/result seq 201/202 refused the print command. Both actual original cards displayed the final execution/rejected state with zero buttons, and both result replies were read in Lark. Admissions were handled and Outbox replies provider-accepted. Their Source Events are `im-ed3109e3e4467c845f7a431bd780ee54b88f14ccccc60886374061597669c4da` and `im-425f27f45c2c442a67c6a5dd3dc5e6041ed5754908323bdbf39e64a011bc5f1f`.

Earlier non-shared cards are historical failure evidence; the repair does not replay operations or claim to retrofit private copies. Human feedback on the first full tracer remains pending. No merge or deployment occurred. [Committed sanitized QA record](https://github.com/BotHarness/DeepSeekBot/blob/cefa12fac05856c182bfab4b80f565f7ec074f06/docs/qa/1406-im-group-authority-lark.md).

## Receiver and permission cleanup

After all six native requests settled, QA Reviewers was restored to Approve/Reject Allow with no Deny (revision 3); Flow Reviewers remained unchanged (revision 1). The ordinary person's original Approve Deny was restored (revision 9), so only Reject remains effective. All temporary management pairings are revoked, the private approval route is off, and no native approval remains pending. Exact task-owned Host PID was stopped, port 32006 no longer listens, and the exclusive QA1 receiver window has been released. Other Apps, Hosts and production receivers were untouched.

## Screenshot provenance

All images are actual native Client captures; person names, platform actor IDs, request references, and background private conversations are masked before capture. No credential or private login URL is included.

The baseline UI checkout is `d865ee81`; its three affected pairing UI files match the current PR base exactly. Settings and workflow screenshots were captured before the main-line merge; the pairing components and their CSS rules are unchanged by that merge. Main-line private-input and chat-card changes are preserved, with no claim that these older captures re-test those separate flows. The baseline uses the same paired person, primary Role, two Roles, locale, theme, and viewport. Its receiver is intentionally unavailable because no second IM Consumer was started. The new Groups/source/exception views have no predecessor; the baseline's three-tab workspace is the absence view.

Chinese before/after pairs: 1280×800 light, 1280×800 native dark, and 390×844 native dark. The larger permission detail uses its own scroll area; the narrow workspace stacks details and scrolls tables horizontally. Workflow captures also exercise the English locale: Create group entry form, persisted groups, current source revisions, personal Deny editor, and the Chinese delete confirmation. The entry-form capture was reopened without saving a third group; both stored groups were created through the actual Client earlier.

## Reproduction

Use a backed-up, isolated Profile and an independently coordinated QA1 receiver window. Open Bot DM → sidebar External identities → IM roles and pairing. Choose Authorization groups → Create group, choose the current App, grant Approve/Reject and select an approved person from that App. Save; select the group to edit its current member set. In People, inspect current sources and add/remove a personal Deny. Deleting a group asks for confirmation and warns that removing its Deny may restore another source's Allow.

Use fresh platform-confirmed Lark messages and an eligible private management pairing/destination; a group-origin ordinary pairing cannot itself become that destination. Give that management pairing Reject only, leaving Approve to the ordinary person's groups. Verify Allow once and independent Reject. While a fresh card is pending, add an Approve Deny in one group while another still Allows Approve; the old Allow once must not execute and Reject must remain usable. Restore the groups, restart the same Profile, and verify a fresh Allow once. Check the actual final card/reply display and collect Human feedback before widening the slice. Revoke temporary management pairing, clear the route and stop the owned receiver after the run.
