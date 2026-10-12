> Historical checkpoint. Pending QA/capture statements below are superseded by [completed-qa.md](completed-qa.md).

# PR #1468 — first work-failure alert tracer

- Source base: `8392828804c71fa54ad802128526f481769adc01`.
- Source head: `ad7c204acd344d24de337ada0ca5e7460853eaac`.
- Host: pinned DSH `0.2.0-rc.1`, Node `24.21.0`, pnpm `12.4.2`; isolated development Profile and the checked development Provider pin from this head. No package publication, product pin promotion, production takeover or deployment.
- Agent task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`; [claim](https://github.com/BotHarness/DeepSeekBot/issues/1041#issuecomment-6120958716).

## Observed local runtime and UI

1. Created a real isolated Bot, opened its DM, External identities and existing Lark approval notifications modal. No App was configured or bound, and no IM receiver was started.
2. Confirmed the failure event defaults off, labelled test is disabled without authorization, and enabling the event with no route shows the destination-unavailable notice.
3. Sent `1041_WEB_HEALTH` via the authenticated Channel API; the real model replied `221`. This verifies the healthy model before fault injection.
4. Restarted only the task Host with a deliberately invalid **non-secret** model key inherited by that child process. Shared machine credentials and Profile credential storage were not edited. Sent `1041_NATIVE_FAILURE_NO_DESTINATION`; the native turn failed with AUTH / invalid credential. The closed error-details UI contains no credential value.
5. Correlated the Runtime-owned committed failure `session-failure-453861e0-2773-4157-acfe-5309bc7176f9` / owned Session `botharness-92111f82-33cf-4cfd-af1e-01309fcd61ac` with alert `450a3b25-8b19-4055-ae8c-846803f711fd`: `cancelled`, reason `destination-unavailable`, attempts `0`, no receipt. The real sidebar displays the same state and an Open failed Session action.
6. Restored the normal inherited model environment and restarted only the same task Host. Fresh `1041_WEB_RESTORED` replied `2491`. Existing Runtime recovery also completed the old failed input with `437`; this is work recovery, not alert replay. The notification remains the one cancelled record with zero attempts. No external receiver or Lark notice was involved.
7. At 390×420 CSS pixels, the fixed modal stays between y=16 and y=404; its native content scrolls (364-pixel client height, 453 pixels when default-off and 595 pixels with the failure row). No horizontal overflow. The base modal had y=-8 to y=429 and no body scrolling.

## Screenshot provenance

Desktop pairs use 1280×800 CSS pixels, English, actual native light/dark settings, the same Bot display name and empty App/pairing/management-route state. They are cropped identically around the real modal, excluding unrelated workspace surfaces. Background conversation differences come from the model health check; the compared management state is the same.

Short-screen pairs use 390×420 CSS pixels. The browser saves device-scaled image pixels; CSS viewport dimensions above are the measured dimensions. The before view is the actual base modal with no failure event control; after adds that default-off control and body scrolling. The extra scrolled/unavailable shots intentionally demonstrate the newly enabled event state.

Default-off source captures precede the final test-only commits and the failed-Session label correction; the controls and layout shown are unchanged at the bound head. The native unavailable-state screenshot was recaptured with the final Open failed Session wording. The explanation page is bound to the exact head above.

## Automated checks and reviews

- Failure alerts: 13 passed, including a real deadline, replacement, ownership/deduplication, revocation, known-unsent budget, unknown refusal and pending/sending restart. The final deadline assertion passed again while authorization stayed enabled.
- Existing Lark approvals: 30 passed; sidebar: 45 passed; Operational Database: 33 passed; bridge/plugin public registration: 25 passed.
- Types, lint/source policy, formatting, build and the 478-page docs build passed locally.
- Standards: zero findings; Spec: zero remaining implementation findings at the exact source head.
- Earlier full CI had 4238 passing tests and two endpoint-list assertions; both lists were corrected and the affected 25 tests passed. Current-head CI remains a separately tracked PR check.

## Still pending

**This is not completed Lark acceptance.** A fresh QA1 exclusive start/stop window is required before configuring or starting a receiver. Actual private Lark receipt/rendering, the fully connected failure-to-notice path and first-slice Human feedback remain pending. The PR stays Draft and #1041 stays In Progress; group/providers/Host-down/native-wait siblings have not been broadened.

## Runnable review

Check out the source head, install with pnpm, build, and launch `scripts/dev-instance.mjs` with a fresh isolated home and the pinned CLI. Create a Bot, open its DM → External identities → Lark approval notifications. Confirm default off; enable without a management destination and confirm unavailable/disabled test. Only after coordinating a test App receiver window, configure the checked App, pair an authorized private reviewer, select that existing management route, send the labelled test and trigger a controlled owned work failure. Correlate the committed Channel fact, notification metadata and actual Lark rendering; then seek Human feedback.
