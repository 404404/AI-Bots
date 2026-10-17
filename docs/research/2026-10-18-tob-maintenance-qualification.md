# Tob maintenance qualification — #2088

Source baseline: `a3e2c4e64d131191e686e33cb207d3db9b3a0937`.
Qualification-driver commit: `ca5b7ad9f`.
Task: `codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60`.

This follow-up preserves the existing telemetry, Git and release owners. It adds verification paths and records their evidence boundaries; it does not add a maintenance tool, alter permissions or manufacture release identity.

| Gate                                 | Current evidence                                                                                                                                                                                                                | Limits                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner/maintenance source regressions | 74 tests passed across telemetry, managed Git, release notes/service, restart and Tob maintenance adapters                                                                                                                      | Test fixtures do not qualify real model or native execution                                                                                                                                       |
| Managed Git fresh installation       | Actual pinned macOS arm64 download: 62,348,987 bytes from `media.botharness.ai`; production checksum verification/extraction; managed Git 2.53.0 created/read a real local commit; a new service recovered the installed binary | Process PATH was isolated to a fresh directory containing tar. No system Git uninstall or mutation. This was owner/artifact execution, without a Host CLI, Tob approval, rendered UI or OS reboot |
| Unlocked telemetry                   | Driver now supports independent Human CLI off/on/restore, natural Tob approval and denial, real privacy-control readback and same-Profile restart readback                                                                      | Added phases are available for separate Web/macOS qualification; a source check is not a passed journey                                                                                           |
| Genuine published release            | Registry metadata returned latest/next `1.3.1`, published `2026-10-14T15:06:33.226Z`; exact product component dependencies remain `1.3.1`, IM Provider `4.32.0-botharness.20`                                                   | This publication predates current Tob implementation. No actual released Profile install/update/restart was attempted in this follow-up                                                           |
| Current Tob install/restart          | Existing development-identity refusal remains authoritative                                                                                                                                                                     | Candidate is a development Bundle. Changing its version/stamp would fabricate qualification. Actual install/restart through current Tob requires an artifact containing this code                 |

The public-safe Git receipt is [managed-git.json](../assets/pr/2088-maintenance/managed-git.json). The first standalone-driver attempt failed at the local loader argument before invoking the owner; changing `filepath` to the installed loader's documented `path` produced the successful second run. The expanded telemetry script required its existing verification-inventory hash to be re-audited; that check passes after updating the precise classification/hash.

## Executable paths

- `node scripts/qualify-managed-git.mjs <private-evidence-directory>` creates its own disposable home below the supplied output and retains it for inspection. It loads production source through the existing development loader; it is not proof of an npm product installation.
- Use the existing `scripts/e2e-tob-model-runtime.mjs` connection variables with `telemetry-direct`, `telemetry-approve`, `telemetry-deny` or `telemetry-restart-read`. Start the disposable Host with explicit `BOTHARNESS_TELEMETRY=1` and no `DO_NOT_TRACK` lock. The helper's ordinary disabled-telemetry default remains in place.
- The Tob phases require the visible exact approval payload/decision, a fresh native Shell command, completed native turn, handled submitted Human delivery, real reply and independent CLI/UI canonical readback. `telemetry-restart-read` takes `BH_E2E_EXPECT_TELEMETRY=true|false` after an external restart of the same Profile. Scripts never restart the Human's active Desktop.

## Remaining acceptance

A released-owner update can be qualified separately by installing genuine published `1.3.0` into a disposable Profile, then checking/installing `1.3.1`, explicitly confirming restart and reading the new running identity. That proves the released updater only. Current Tob scope needs its own actual release-artifact journey after the candidate exists in such an artifact; no publication or production operation is implied by this report.

The parent integration retains separate Web, actual macOS Desktop, Human review, CI and merge gates. No skipped gate is reported as passed here.
