# Selected Client layout evidence

Captured on 2026-10-18 at combined runtime source `6eea6b76828c94c7a4dbcab00ff101a2cde16ca1` (the layout source is exactly `b2b3c583b3b385f8606ec4f52c11cf1e0480f51d`; the descendant adds shortcuts). These are candidate **before-action / after-action** states, not screenshots of two source revisions. Viewport 1440 × 900, dark theme, Chinese locale, isolated QA data.

- `before-action.png`: persisted v7 layout upgraded to v8; old order prefix, gap, nested ratio and byte-identical backup verified.
- `after-action.png`: selected Client CLI opens Memory, moves it above Messages, changes the child axis and ratio, and preserves the unsent draft.
- `after-reload.png`: the saved tree and gap survive a new Client generation.
- Two independent browser contexts connect to the same Host. Editing one leaves the other layout fingerprint unchanged.
- Global panel move/size, nested hide/show, DM switch round-trip, draft preservation, wrong-Channel, stale-fingerprint and group-ineligible refusals passed.

Focused source coverage: the 19-file selection had 165 cases; 17 files initially passed, and the two failing files passed all 26 cases after fixes. The initial failures were preserved. Root TypeScript, lint, format and build passed. The descendant shortcut reset fix separately passed 7 cases, TypeScript, lint, scoped format and build.

The full remote CI suite passed at rebased source/evidence head `a2e5dc92560f90655789085908661e89a2d80116`; local checks remained focused. Physical keyboard and Human QA are not claimed. The root-owned native queue separately passed a single-Client gap change (4 to 8) and restart readback with a new generation. The later native run moved Memory above Messages, set root axis vertical and ratio 0.58, hid/showed Memory, switched Channel and returned, then restarted Desktop and read back the identical tree under a new generation. Screenshots show the real mounted tree at 2522×1640; this is owner tree/ratio persistence, not physical drag/resize or a pixel-fit audit. Old native migration remains unverified. See native-verification.json. Two native harness failures remain: an unscoped hidden/transient row target, then an invalid generic-body readiness selector; the final helper uses the visible Channel-list button and actual shared panel header. Main Desktop was restored after each run. The source test and browser evidence do not authorize merge.

## Natural Tob management

Actual Chinese requests entered through Home used the existing review cards and the selected originating ClientTarget. Approving gap 4→10 applied and read back; rejecting gap 12 returned `approval-denied` and kept 10; changing the gap to 9 while gap 14 awaited review made approval return `stale-client-layout`, retaining 9. All model turns completed, Human deliveries were handled, real replies were visible, and both fingerprints of the independent second Client stayed unchanged. The shared run also approved a quick-switcher edit. See `natural-tob-verification.json` and `natural-tob-approved.png` (1440×1000).

The first helper closed Home during review and correctly triggered stale rejection; the later helper preserves the reviewed layout. A separate failed assertion searched truncated trace text; the final run correlates each review to its canonical parent Shell call ID. Both failures remain in private evidence. No product guard was weakened.

Private natural replay: `.humanlayer/verify/tob-layout-shortcuts/natural/web-1792277469075/`, `.humanlayer/tasks/2097-client-shortcuts/natural-control-journey.mjs`.

Private reconstruction: `.humanlayer/verify/tob-layout-shortcuts/journey/web-1792276104850/` contains JSON readbacks, screenshots and ARIA snapshots; `.humanlayer/tasks/2097-client-shortcuts/web-control-journey.mjs` contains the replay harness. Local Host manifests, tokens and profiles are not published.

Agent-Task: codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60
