# Home and the protected Tob DM

## Sub-features

- Home is a global panel. Fresh workspace entry opens it; upgrades append its control without opening it or replacing existing geometry.
- Tob is one protected local identity with canonical Memory, Workspace and Human DM. Re-entry does not repeat its welcome.
- Model setup replaces the Home input when unavailable, returns to it after native configuration and never auto-sends.
- Home sends once through the existing Human DM path; the conversation continues in Messages.
- Tob uses native Shell to discover and invoke the DSB CLI. Scoped management covers default and per-Bot models, presets (create/read/update/apply), four native runtime fields, telemetry, Git availability/install and release operations through existing owners and review; the former dedicated management tools are absent.
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

## Model, runtime and privacy acceptance (#2088)

`scripts/e2e-tob-model-runtime.mjs` uses `BH_E2E_INSTANCE` for Web or `BH_DESKTOP_CDP` for Desktop, with the candidate Human manifest in `BH_E2E_HUMAN_INSTANCE`. `BH_E2E_TARGET_BOT` selects the Bot and `BH_E2E_EVIDENCE` the output directory. Its phases cover discovery, reviewed model change, runtime accept/deny/stale and restart read-back; inspect the script's supported phases before running. The `maintenance-refusals` phase requires environment-locked disabled telemetry and a development Profile with no installable release or pending restart. It requests one attempt each and checks `telemetry-locked`, `maintenance-unavailable` and `restart-not-pending`, then verifies unchanged canonical state. This proves those refusal branches only, not successful telemetry mutation, release installation or restart. It does not itself prove every preset or successful maintenance branch.

Treat this as an additional user journey, not a claim that the Assignment-limit script covers every command. Use the shared inventory's #2088 table to enumerate each setting and record evidence per command. No additional credentials or administrative token may be passed to Tob.

1. Through the authenticated Human CLI, read `model-catalog`, two Bots' `model-plan`, `model-presets`, `settings botharness-client`, `telemetry-status`, `git-status` and `release-check`. Save redacted baseline values and revisions. Configure model credentials through the native private input beforehand; verify an actual reply.
2. From Home or Tob's private DM, ask to read/change the Host default and one Bot's Orchestrator/Assignment plan. Review the actual target/old/new values, accept one mutation and deny another. Read back through CLI and the native model/plan UI. A second Bot's independent override must remain unchanged. Exercise inherit and preset create/update/apply; a preset or Bot revision changed while approval is pending must refuse rather than overwrite. An unavailable model must return a coded refusal.
3. Ask Tob to change each of `assignmentConcurrencyLimit`, `showBotSessions`, `showApprovalReviewSessions` and `developerMode`. Inspect the corresponding UI and native Settings values, then restart the same isolated Profile and read again. Unknown/non-live settings must refuse; no configuration-file workaround qualifies.
4. Ask Tob to inspect and change usage-statistics preference. Verify the privacy control and effective state; repeat with environment-locked telemetry in a separate isolated launch and confirm no override. Git status/install uses the existing UI owner; distinguish already-installed status, an install attempt and a verified installation. Do not invent a Git identity control.
5. Exercise release history/check and inspect their actual status. Scoped `release-install`/`release-restart` require an isolated disposable candidate, `--confirm` and a fresh Human decision each time; full access, remembered allow rules and automatic approval cannot replace it. Verify these bypass attempts cannot satisfy the Human gate. `git-install` keeps its existing review policy without a new `--confirm` flag. Never disrupt the Human's active Desktop. Keep development/unavailable or platform refusal evidence as such. If a request disconnects, inspect canonical release state before any further action, and verify no automatic replay. Do not count an approval card as a successful install or restart.
6. Repeat the model/runtime/privacy UI read-back and restart checks on actual macOS Desktop. Capture its own screenshots, canonical CLI results and native process identity, then restore the prior Desktop. Web results cannot stand in for this gate. Restore test changes only through their owning commands with current revisions.

Keep direct CLI tests, real native Shell tool traces, rendered Web evidence, native Desktop evidence and restart persistence separate. The map defines required observations; it does not mark these new branches passed.

## Gotchas

- AX launch model overrides intentionally make native default-model settings read-only. Model-setup QA must use an isolated launch without that command-line override; never edit shared credentials to make the test pass.
- The test service may return quota exhaustion even when readiness reports a valid route. Keep that first failure; changing to an authorized available provider is a new attempt.
- Accessible labels are localized. Inspect the saved tree before treating a selector timeout as a product failure.
- Management CLI requests refuse without original Human-DM provenance. Do not add a Human Host token, explicit Host override or direct-runner exception to make a Bot request pass.
- Tool trace arguments/results are bounded summaries. Keep commands short and invoke the CLI directly so discovery, settings and coded refusal checks are visible; record full canonical Session evidence separately if a summary is truncated.
- `accept` resumes an existing pending approval without sending a new Human message. A new prompt may supersede the original source, so use a fresh phase only after the prior operation settles.
