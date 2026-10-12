# PR #1468 notification UI revision — 2026-10-13

Source head: `69ff57667e6d7a6d17728807d1519d990c5ac710`.
Merge base: `de51af5c1bba97fa34ba58afe2b0f118366729a6`.
Prior single-column baseline: `1f1d545fa6155469e4c72f296fa7b3cafdbe0b22`.

## Capture provenance and explicit limit

These are genuine native DSH UI screenshots from the task's isolated Profile, with four persisted delivery records, two accepted and two cancelled. No IM bundle or receiver was running. Desktop pairs share English locale, 1280×800 CSS-pixel viewport, theme, destination and stored facts. Crops remove unrelated shell content; they do not edit the modal. Short-screen captures share English locale, actual dark theme and 390×420 CSS-pixel viewport; browser images retain device scaling.

The `observed-*` captures are an intermediate UI revision before the final shortened English headers and main merge. They show the implemented wide-modal anatomy, not verified rendering of the final source head. The short table capture exposed the crowded `Delivery state` header. Final source uses `Delivery` and `Time`; final captures remain pending. Do not treat these screenshots as completion of the final-head visual gate.

T3 `preview_status`, `preview_open` and browser execution repeatedly timed out. The Human has been asked to restore the current thread connection. Final light/dark desktop, short-screen and rendered-PR image inspection remain blocked. PR stays Draft pending those checks and new UI feedback. The HTML is generated with the repository CLI, zero STE warnings; its new layout is also not yet browser-inspected.

## Borrowed UI pattern and deliberate adaptation

The existing IM Roles & Pairing / RBAC modal provides the 1060px width, 12px panel radius, native inset/button anatomy, info help, SegmentedTabs and TanStack PairingTable. Notification settings use a 300px left configuration column and a right history/detail column. There are two event history tabs rather than RBAC's personnel/roles/requests, and single-record selection rather than permission editing. Mobile stacks the columns and keeps the native footer outside the scrolling body.

## Observed public behavior

- Searching a full notice reference selected exactly one persisted record.
- Ascending and descending time sorting followed actual record timestamps.
- Selecting an accepted record showed its own reference, one attempt and original Session action.
- Switching to empty Tool approvals history did not leave stale failure details.
- Info popovers showed the relevant help text.
- Toggling the failure event off/on persisted revisions 6→7, restored enabled state and preserved the route, capabilities and four existing records.
- At 390×420, the modal measured about 342×388 CSS pixels. Its body scrolled; the table had no horizontal overflow and Close remained inside the viewport. These measurements precede final copy/main changes.

Current-head [CI passed](https://github.com/BotHarness/DeepSeekBot/actions/runs/38281307049). Typecheck, lint, format, bilingual ledger, complete build, 64 focused tests and a 480-page docs build passed. Independent Spec and Standards reviews found no source implementation defect; they identified the missing final visual evidence and stale previous explainer. This updated artifact and PR body explicitly correct the latter.

## Original native QA remains separate

Human-accepted Lark test/failure notices and event-off/destination-off/restoration checks were executed at `ad7c204a`. See the earlier `ad7c204a/completed-qa.md` and its original screenshots. QA1 receiver was stopped and its exclusive window released. This UI revision starts no receiver and makes no new cross-provider/native QA claim.

## Runnable review path

Check out the source head, install with Node 24.21.0 / pnpm 12.4.2, build, then launch `scripts/dev-instance.mjs` with an isolated DSH_HOME and port. Do not add `--im-provider` for UI-only review. Open a Bot DM → Conversation settings → External identities → Management notifications. Inspect both event tabs, search/sort/selection, info help and body scrolling at desktop and 390×420. Tests are disabled while the Provider is unavailable. The current task's existing UI-only local preview remains on port 32115; its authenticated URL is shared only locally.

Multi-target delivery is planned in [#1492](https://github.com/BotHarness/DeepSeekBot/issues/1492). Current support remains one qualified private Lark management DM. Future provider/group qualification retains the existing owners and blockers.
