# Activity Center live refresh verification

Issue #2230; Draft PR #2232. Production source: `f1c2fc11e8e4bf34d320b70b387cc24e0bd08ac1`.
Base: `0f458c7a3d1684e8d071127647aa66c85d3b2898`. Evidence-only journey fixes follow in the PR head.
Environment: macOS, Chromium via Puppeteer, isolated DSH `0.2.1-rc.2`, disposable QA Bots with the configured DeepSeek official Flash route. No production Profile was used.

## Automated regression and build

- Client suite plus related Host tests: 258 files passed / 1 skipped; 1,957 tests passed / 1 skipped.
- Follow-up focused set: 51 passed; repeated-disconnect and sidebar lifecycle follow-up: 13 passed (overlap, not additive totals).
- Lint, formatting, root/mobile typecheck, bilingual changelog validation and build passed locally.
- Regression first failed on base: background reads replaced all three empty sections with loading text; it passed after the implementation.

## Actual browser and canonical state

- Matched page (600×1000) and Dock (1440×1000), light/dark, Chinese locale, empty data. With a 350ms read delay the base Dock jumps 83.5→72.5→83.5px per section every 10 seconds; the fixed Dock stays at 83.5px. Page stays at 87.5px after the fix.
- Final production build: 12 healthy idle seconds, zero Activity list queries. Creating another Bot triggers a delayed background reread while the loaded empty DOM remains identical.
- Real model reply in another DM appears in Activity; visible Mark read clears it and the canonical unread query.
- Browser goes offline and its real WebSocket is explicitly closed. A second real reply commits while disconnected. Reconnect opens a second `remote.mux`, rereads the baseline and displays the new canonical item.
- In the Messages workspace, Open source reveals the exact canonical message ID in the conversation. No navigation to the Home workspace is treated as conversation evidence.
- Another real Bot calls `group_join_request` for the Human-selected Group. Its action appears, disappears on a public snooze mutation, reappears at the two-second deadline, then disappears after a public decline decision. The request owner reports `declined`.
- Live `inbox-watch --category action --watch-seconds 5`: one JSON result, 6 invalidations, initial pending request and final empty list. See [sanitized canonical identities](live-proof.json).
- Zero browser page exceptions. Console had four expected `ERR_INTERNET_DISCONNECTED` resource errors during injected offline time; raw console/ARIA and first failures remain task-local.

## Qualification limits and retained failures

- The shared AX default route returned a real provider quota failure. Only the disposable QA Bots were changed to an already configured official DeepSeek route, which produced actual replies.
- A native `ask_user_question` tool remained pending without a canonical Channel question card on this pinned Host, including a timed retry. This request-creation path is **not qualified** by this PR. The production change updates projections of canonical actions; the successful live action proof uses a group-join request. Do not label the native question branch passed.
- Early automation failures from a hidden navigation button and fresh-Profile onboarding were retained and corrected in the journey. The final scripted journey completed successfully.
- Human QA, native device UI, external IM providers, merge and deployment are not performed. Mobile evidence here is type compatibility and CI bundle checks only.

## Reproduce

Build, launch a fresh named `verify-app` instance, run `doctor`, then:

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-activity-live.mjs
```

Use the feature-map guide for page/Dock and theme comparisons. The task's local login URLs, credentials, Host home, raw logs and conversation transcript are not public artifacts.
