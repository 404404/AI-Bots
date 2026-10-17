# Selected Client layout evidence

Captured on 2026-10-18 at combined runtime source `6eea6b76828c94c7a4dbcab00ff101a2cde16ca1` (the layout source is exactly `b2b3c583b3b385f8606ec4f52c11cf1e0480f51d`; the descendant adds shortcuts). These are candidate **before-action / after-action** states, not screenshots of two source revisions. Viewport 1440 × 900, dark theme, Chinese locale, isolated QA data.

- `before-action.png`: persisted v7 layout upgraded to v8; old order prefix, gap, nested ratio and byte-identical backup verified.
- `after-action.png`: selected Client CLI opens Memory, moves it above Messages, changes the child axis and ratio, and preserves the unsent draft.
- `after-reload.png`: the saved tree and gap survive a new Client generation.
- Two independent browser contexts connect to the same Host. Editing one leaves the other layout fingerprint unchanged.
- Global panel move/size, nested hide/show, DM switch round-trip, draft preservation, wrong-Channel, stale-fingerprint and group-ineligible refusals passed.

Focused source coverage: the 19-file selection had 165 cases; 17 files initially passed, and the two failing files passed all 26 cases after fixes. The initial failures were preserved. Root TypeScript, lint, format and build passed. The descendant shortcut reset fix separately passed 7 cases, TypeScript, lint, scoped format and build.

No full suite, real Tob model approval journey, native restart, physical keyboard or Human QA is claimed here. Native runtime remains a separate parent-owned queue gate. The source test and browser evidence do not authorize merge.

Private reconstruction: `.humanlayer/verify/tob-layout-shortcuts/journey/web-1792276104850/` contains JSON readbacks, screenshots and ARIA snapshots; `.humanlayer/tasks/2097-client-shortcuts/web-control-journey.mjs` contains the replay harness. Local Host manifests, tokens and profiles are not published.

Agent-Task: codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60
