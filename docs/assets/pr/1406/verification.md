# #1406 verification — 2026-10-11

Implementation head: `29ba1541e4537131a8f7923581bbacc2032a613e`.
Base: `fe84f5fd952ca7bf2d7232b8beda590eb38971ec`.

## Verified locally

- 154 focused and regression tests across seven files passed: pairing, native approval decisions, Operational Database migration, Client pairing settings, default messaging traffic, the DSH Bot agent adapter, and grant execution.
- Lint, format check, typecheck, build, product/Skill changelog checks, source policy, and unique ADR checks passed. Existing lint warnings remain unchanged.
- Isolated Host and real Client: create a group, scoped member selection, persist two independent groups, write a personal Approve Deny, inspect current permission sources, and restart the same isolated Profile. Both groups Allow Approve/Reject; the personal Deny leaves only Reject effective after restart.
- A real direct authenticated Web Human DM used `channel_send` and delivered `WEB1406_OK` without IM pairing or external permission configuration.
- QA1's first current-permissions request was acknowledged by the Lark platform and admitted by the isolated Host; the real model called the current permission Tool. This is partial Lark evidence, not full approval acceptance.

## Pending gates

- Full Linux CI pending PR creation.
- Real Lark Allow once, independent Reject, delayed-card refusal after authority change, and post-restart approval verification remain pending.
- Lark Web subsequently timed out on `/accounts/web/user` and other requests. Later query and pairing attempts had only optimistic client IDs and no Host admission; they do not count as delivered messages or successful QA.
- Human feedback on the first full tracer remains pending. No merge or deployment occurred.

## Screenshot provenance

All images are actual native Client captures; person names, platform actor IDs, request references, and background private conversations are masked before capture. No credential or private login URL is included.

The baseline UI checkout is `d865ee81`; its three affected pairing UI files match the PR base exactly. The baseline uses the same paired person, primary Role, two Roles, locale, theme, and viewport. Its receiver is intentionally unavailable because no second IM Consumer was started. The new Groups/source/exception views have no predecessor; the baseline's three-tab workspace is the absence view.

Chinese before/after pairs: 1280×800 light, 1280×800 native dark, and 390×844 native dark. The larger permission detail uses its own scroll area; the narrow workspace stacks details and scrolls tables horizontally. Workflow captures also exercise the English locale: Create group entry form, persisted groups, current source revisions, personal Deny editor, and the Chinese delete confirmation. The entry-form capture was reopened without saving a third group; both stored groups were created through the actual Client earlier.

## Reproduction

Use a backed-up, isolated Profile and an independently coordinated QA1 receiver window. Open Bot DM → sidebar External identities → IM roles and pairing. Choose Authorization groups → Create group, choose the current App, grant Approve/Reject and select an approved person from that App. Save; select the group to edit its current member set. In People, inspect current sources and add/remove a personal Deny. Deleting a group asks for confirmation and warns that removing its Deny may restore another source's Allow.

Resume real Lark QA with fresh platform-confirmed messages and an eligible private management pairing/destination; a group-origin ordinary pairing cannot itself become that destination. Verify actual native approval decisions, revoke the contribution while a card is pending, restart, and obtain Human feedback before widening the slice.
