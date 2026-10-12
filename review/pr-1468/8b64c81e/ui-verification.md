# PR #1468 final notification UI verification

Source head: `8b64c81eb8fad3c94e14fbc362043eb9cd186cfe`.
Merge base: `60aa1cd5caeffaafc999167c99680d21d7830317`.
Single-column baseline: `1f1d545fa6155469e4c72f296fa7b3cafdbe0b22`.

## Real capture provenance

Browser execution recovered. Built the merged head and restarted only the task-owned isolated Host through the pinned helper, on the existing port 32115. The Profile has no IM bundle enabled; no receiver started. Four existing records, the same qualified management destination and capabilities were preserved. Native light/dark desktop captures use English and 1280×800 CSS pixels; before/after share the same data and theme. Narrow captures use actual dark theme and 390×420 CSS pixels, retaining browser device scaling. Modal crops remove unrelated shell content; no image content was synthesized or retouched.

The final short-screen screenshots show `Delivery` / `Time`, replacing the intermediate crowded header. Final desktop raster is soft due to the preview capture, so actual DOM, measured layout and semantic controls were checked alongside it. Narrow captures are legible. Earlier intermediate captures and their blockers are superseded by this evidence.

## Borrowed RBAC anatomy

Reuses the IM Roles & Pairing modal's 1060px width, 12px panel radius, native buttons, Checkbox, SegmentedTabs, help and TanStack PairingTable. Notifications use two event tabs and single-record selection rather than RBAC permission editing. Left configuration measures 300px, right history about 696px. Desktop modal measures 1060×725 CSS pixels; content has zero horizontal overflow.

## Actual final-head interactions

- Search by full failure notice reference `f7a1f78a-73de-4224-8348-5cb11440a0a1`: exactly one row, correct selected detail, Provider accepted, one attempt and original Session action.
- Time sort: descending 23:22→21:42→21:39→19:00; ascending reversed this order.
- Tool approvals tab: zero entries and no stale selected failure detail.
- Delivery-history info popover: fixed explanation that platform acceptance is not Human reading and unknown outcomes cannot resend.
- Light/dark captures: actual native Settings appearance control, with DOM theme attribute checked.
- Narrow screen: modal 342×388 within 390×420; body client height 316 / scroll height 1169, final scroll top about 853. Columns stack. Table/content horizontal overflow is zero. Footer Close remains at y352–380 within the viewport at both top and bottom scroll positions.
- Final shortened headers occupy separate measured cells and do not overlap. Status pills wrap, and notice reference/reason wrap within details.
- Previous real event toggle persisted off/on revisions 6→7. Final restart readback remains enabled revision 7, four records and unchanged approve/reject capabilities. No test notice was sent during UI review.

## Diagnostics and limits

Post-restart desktop observer initially reported shell-ready; current UI controls and actual DOM were verified. Browser console retains connection-refused/read-position messages during the deliberate exact-Host stop, followed by no new console errors in the final interaction window.

The existing Client observer later records `shell-lost` at the responsive transition. Its current implementation checks only `.bh-panel-glyph`'s enclosing desktop navigation button (`packages/core/src/diagnostics/client-observer.ts`). Mobile Bot mode removes that desktop button while the functioning conversation/settings/modal remain visible. We preserve that diagnostic and do not present the later collector state as a clean pass. The actual mobile DOM, interactions, screenshots and geometry independently establish the rendered path. This observer limitation is outside the notification UI change; restoring desktop does not erase the prior event.

Typecheck, lint, format, bilingual ledgers, full build, 92 UI/file-open tests and 13 failure-notification tests passed after merging main. [Exact-head CI passed](https://github.com/BotHarness/DeepSeekBot/actions/runs/38286945133), including the full tests and docs build. Independent prior Spec/Standards review found no source defect; the merge adds only main's existing file-open changes and preserves the notification implementation. New UI Human feedback remains pending.

The CLI-generated HTML review aid was inspected at 1280×800 and 390×800 using its actual published HTML content. No horizontal overflow was found; flow semantics, metadata and exact-head source links were checked. Final refresh changes only the CI sentence from running to passed. HTML remains a review aid, not runtime evidence.

## Original native Lark acceptance and future work

Original private-Lark delivery/negative/restoration checks were Human-accepted at `ad7c204a`; see that revision's `completed-qa.md`. No new native IM test is claimed here. QA1 receiver remains stopped and its previous window released.

Current notification delivery remains one qualified Lark management DM. [#1492](https://github.com/BotHarness/DeepSeekBot/issues/1492) plans independent multi-target delivery followed by qualified provider/group expansion. No multi-target behavior, receiver authorization, merge or deployment is implied by this UI verification.

## Runnable path

Build this head with Node 24.21.0 / pnpm 12.4.2; launch `scripts/dev-instance.mjs` in an isolated Profile without `--im-provider`. Open Bot DM → Conversation settings → External identities → Management notifications. Inspect search, Time sorting, both tabs, selected details, info help and body scrolling at 1280×800 and 390×420. Qualified Provider unavailability correctly disables send controls. Human can use the existing task-local UI-only preview without a new port or receiver.
