# Home and the protected Tob DM

## Sub-features

- Home is a global panel. Fresh workspace entry opens it; upgrades append its control without opening it or replacing existing geometry.
- Tob is one protected local identity with canonical Memory, Workspace and Human DM. Re-entry does not repeat its welcome.
- Model setup replaces the Home input when unavailable, returns to it after native configuration and never auto-sends.
- Home sends once through the existing Human DM path; the conversation continues in Messages.
- Tob uses native Shell to discover and invoke the DSB CLI. The first supported scoped operation reads/changes the global Assignment concurrency limit through existing approval and revision-checked native Settings; the former dedicated management tools are absent.
- CLI management is authorized only for the protected Tob root Orchestrator and its current accepted Human DM. Shell authority expires when that execution finishes; other Bots, delegation, revoked sources and direct runners cannot borrow it.
- Old nested layouts and custom/disabled shortcuts remain preserved.

## How to get to it (user POV)

Enter Bot mode, then Home in the control rail. Configure a model if prompted. Ask Tob for the current Assignment concurrency limit; request a change and inspect its approval before accepting or denying. Open shortcut settings to customize Home. Move/resize Home and Tob child panels, close/reopen them and restart.

## Driving it with verify-app

Use a dedicated isolated Profile that passes `doctor`, with a real model credential for reply/approval steps. `scripts/e2e-tob-home.mjs` takes `BH_E2E_INSTANCE` and optional `BH_BROWSER_PROFILE`, plus phase `configure`, `composer`, `read`, `approve`, `deny`, `stale`, `layout` or `inspect`; `BH_DESKTOP_CDP` attaches to the actual candidate Desktop and `BH_DESKTOP_MAIN_CDP` drives its native keyboard events. Keep the Human's main Profile separate and restore it after exclusive native testing.

Run configure with a disposable Profile: it seeds an unavailable default via the public native Settings API, then drives cancellation and model selection through Home. The read/approve phases submit through the visible Home input and capture screenshots, accessibility trees and page errors. Read back `tob-home`, canonical Channel messages and native Settings. Save `bot-trace <id> --turns 20`: the new calls must be native `bash`/`pwsh` invoking `deepseekbot capabilities`, `deepseekbot settings botharness-client` and, for a change, `deepseekbot settings-set`. No new call may use `tob_assignment_limit_read` or `tob_assignment_limit_set`. Only a real reply plus a settled Shell result proves model integration. Pending approval is not an approved write.

The composer phase uses the shared Messages composer to verify draft preservation through model setup, attachment upload/reload, and Enter versus Shift+Enter. The layout phase seeds a disposable v7 fixture, verifies backup/geometry and custom shortcut persistence. Deny and stale phases verify no overwrite after review. The approval card must show `deepseekbot settings-set` and the actual parsed global scope, namespace, previous value, patch and expected revision. Accepting must produce authoritative setting read-back; rejecting must return `approval-denied`. For stale review, the journey changes the value through the Human CLI while the card is pending, then approves the old proposal: its Shell result must contain `stale-setting` and the independent value must remain.

The stale phase uses the Web launch manifest for the separate Human CLI. Native runs require `BH_E2E_HUMAN_INSTANCE` pointing to that candidate Desktop's private launch manifest (with its local login URL). The Human token is passed only in the subprocess environment, never to Tob, command arguments or saved evidence. Build before running so `packages/deepseekbot/dist/deepseekbot.mjs` matches the candidate Host. Use fresh manual-approval defaults; remembered or automatic allow rules would intentionally bypass the pending-review fixture.

After an approved write, restart the same isolated Host/Profile and read native Settings again to prove durability. Repeat read, approve, deny and stale through the actual macOS Desktop and save its own evidence; a Web renderer result does not qualify Desktop. Verify permission/refusal branches independently (ordinary Bot, Assignment, foreign/revoked Human source, expired execution capability and changed approval inputs); successful happy-path CLI calls do not prove those boundaries.

Compare old v7 layout, v8 backup and reload state. Exercise macOS Command+Option+Shift+H through the actual native key path; custom bindings, modal suppression and no repeat send require independent checks. Evidence must distinguish source tests, Web, native, model and persistence.

## Gotchas

- AX launch model overrides intentionally make native default-model settings read-only. Model-setup QA must use an isolated launch without that command-line override; never edit shared credentials to make the test pass.
- The test service may return quota exhaustion even when readiness reports a valid route. Keep that first failure; changing to an authorized available provider is a new attempt.
- Accessible labels are localized. Inspect the saved tree before treating a selector timeout as a product failure.
- Management CLI requests refuse without original Human-DM provenance. Do not add a Human Host token, explicit Host override or direct-runner exception to make a Bot request pass.
- Tool trace arguments/results are bounded summaries. Keep commands short and invoke the CLI directly so discovery, settings and coded refusal checks are visible; record full canonical Session evidence separately if a summary is truncated.
- `accept` resumes an existing pending approval without sending a new Human message. A new prompt may supersede the original source, so use a fresh phase only after the prior operation settles.
