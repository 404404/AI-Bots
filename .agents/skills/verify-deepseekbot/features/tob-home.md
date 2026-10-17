# Home and the protected Tob DM

## Sub-features

- Home is a global panel. Fresh workspace entry opens it; upgrades append its control without opening it or replacing existing geometry.
- Tob is one protected local identity with canonical Memory, Workspace and Human DM. Re-entry does not repeat its welcome.
- Model setup replaces the Home input when unavailable, returns to it after native configuration and never auto-sends.
- Home sends once through the existing Human DM path; the conversation continues in Messages.
- A narrow tool reads/changes the global Assignment concurrency limit through existing approval and revision-checked native Settings.
- Old nested layouts and custom/disabled shortcuts remain preserved.

## How to get to it (user POV)

Enter Bot mode, then Home in the control rail. Configure a model if prompted. Ask Tob for the current Assignment concurrency limit; request a change and inspect its approval before accepting or denying. Open shortcut settings to customize Home. Move/resize Home and Tob child panels, close/reopen them and restart.

## Driving it with verify-app

Use a dedicated isolated Profile that passes `doctor`, with a real model credential for reply/approval steps. `scripts/e2e-tob-home.mjs` takes `BH_E2E_INSTANCE` and optional `BH_BROWSER_PROFILE`, plus phase `configure`, `composer`, `read`, `approve`, `deny`, `stale`, `layout` or `inspect`; `BH_DESKTOP_CDP` attaches to the actual candidate Desktop and `BH_DESKTOP_MAIN_CDP` drives its native keyboard events. Keep the Human's main Profile separate and restore it after exclusive native testing.

Run configure with a disposable Profile: it seeds an unavailable default via the public native Settings API, then drives cancellation and model selection through Home. The read/approve phases submit through the visible Home input and capture screenshots, accessibility trees and page errors. Read back `tob-home`, `bot-tool <id> tob_assignment_limit_read`, canonical Channel messages and native settings. Only a real reply plus a recorded tool result proves model integration. Pending approval is not an approved write.

The composer phase uses the shared Messages composer to verify draft preservation through model setup, attachment upload/reload, and Enter versus Shift+Enter. The layout phase seeds a disposable v7 fixture, verifies backup/geometry and custom shortcut persistence. Deny and stale phases verify no overwrite after review.

Compare old v7 layout, v8 backup and reload state. Exercise macOS Command+Option+Shift+H through the actual native key path; custom bindings, modal suppression and no repeat send require independent checks. Evidence must distinguish source tests, Web, native, model and persistence.

## Gotchas

- AX launch model overrides intentionally make native default-model settings read-only. Model-setup QA must use an isolated launch without that command-line override; never edit shared credentials to make the test pass.
- The test service may return quota exhaustion even when readiness reports a valid route. Keep that first failure; changing to an authorized available provider is a new attempt.
- Accessible labels are localized. Inspect the saved tree before treating a selector timeout as a product failure.
- Direct management writes refuse without original Human-DM provenance; a successful direct read does not prove approval or write behavior.
