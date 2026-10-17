# Profile backup and cold recovery

## Sub-features

- Human CLI private preview plan, reviewed export, Host inspection and refusal receipts.
- Tob native Shell preview/export/inspection with Host-local private tokens, a fresh Human approval and protected archive output.
- Offline restore to a new task-owned directory; restored readiness, per-Bot model authorization and explicit split-brain acknowledgement.
- Existing Settings preview/export/inspection and recovery UI read the same owner as CLI.

## How to get to it (user POV)

Enter Bot mode, open Bot settings, Data & privacy, Manage backups. Preview export, review its scope and download the verified archive. Choose the archive to inspect it. Offline restore with the installed `botharness-profile restore` into a new directory; launch only that new Profile with pinned DSH 0.2.0-rc.2 and this candidate. Reopen Manage backups to review cold Bots, select target-local model credentials/Model Plans, authorize and activate exactly the intended Bot. Keep original execution stopped to avoid split brain. The active Human Desktop is outside this journey.

## Driving it with verify-app

Build first, launch a fresh named isolated instance and run doctor. Point `BH_E2E_INSTANCE` at its private instance.json and `BH_E2E_EVIDENCE` at a private local evidence directory. `node scripts/e2e-tob-profile-backup.mjs source` creates synthetic preconditions through the Human CLI, exports through the real Web controls, inspects the downloaded file in the UI and CLI, independently exports with direct CLI and exercises stale/corrupt refusals. It emits `backup-fixture.json` with the exact archive and Bot identity.

The `tob` phase submits a natural Home request to prepare/export/inspect, accepts the actual matching export review card, requires fresh native Shell calls for all three commands and a handled Human delivery, then captures the result. It requires a usable real Tob model and manual approval defaults; API success alone is not model evidence.

Restore the emitted source archive offline to a new task-owned directory, stop original execution and launch only the restored directory through the dev helper. Point `BH_E2E_INSTANCE` at that target launch manifest and `BH_E2E_BACKUP_FIXTURE` at the source fixture. The `target` phase captures cold recovery, refuses activation before authorization, authorizes and activates only the fixture Bot through CLI, then refreshes Settings and captures the same active state plus canonical Bot readback. Scripts do not launch, stop, restore or restart Hosts themselves.

For actual macOS, the `target` and `tob` phases can connect through `BH_DESKTOP_CDP`; `BH_E2E_INSTANCE` still selects the task-owned candidate Host for Human CLI. Follow shared-device coordination, use the candidate Desktop only in its authorized exclusive window and restore the Human's prior Desktop afterward. Web screenshots do not prove native rendering.

## Gotchas

- Names may be Chinese or English; inspect ARIA evidence and dismiss tutorial overlays before classifying a selector timeout as a product error.
- Private preview plans contain a one-use token and are never public evidence; protected archives contain sensitive synthetic/source content. Publish only cropped screenshots and bounded receipts.
- Recovery has no credential migration or automatic activation; model readiness may be unavailable until credentials and an explicit Model Plan are selected on the target.
- Source tests prove guarded owner behavior; direct CLI, real Web, real Tob, restart, macOS and Human checks remain separate evidence categories.


## Repair regression gates (#2099)

Retain the source candidate's first Web selector failure as a failure; a seeded Bot and loaded Client do not prove export UI behavior. Before qualification, run the focused source suites and build the exact candidate in the shared resource queue. Check scoped `preview-stale`, `too-large`, `package-invalid` and `plan-changed` through the actual broker/CLI, and mutate the reviewed Model Plan after the adapter snapshot but before HTTP owner capture. Require no new authorization/session. Also change recovery activation state or revoke current accepted-source authority during asynchronous model validation; the owner must refuse before commit.

For downloads, pause a real stream after its first chunk and inspect the output directory: only an exclusive private `.part` sibling may exist, and final output appears only after the correct complete digest. Inject bad hash, dropped stream, a concurrently created destination and an actual CLI process kill. Existing final bytes must remain unchanged; SIGKILL may leave a private stage for manual cleanup, never a partial final archive. Source tests cover streamed visibility and publication races; an actual process-kill run remains a separate gate.

Export via scoped Tob, deliberately ignore the first successful reply, then use the original known `planId` as receipt ID or repeat the exact plan invocation. Require the same artifact/hash and one export, with no new mutation review. Recreate/restart the same target-local broker/Host and repeat under a fresh accepted Human DM execution. A cold incomplete stage is not a completed receipt.

Pair a synthetic test device on the source before export. After offline restore, the original credential must be rejected by the target device gateway before any target operator-cookie forwarding, while authenticated target Human management still works. Device Host identity must differ; explicitly re-pair on the target and require its new credential to work. Verify no imported push destinations or remembered secret-MCP execution approval, the imported Tob is an ordinary paused identity, and target Home creates a new protected Tob. Original source pairing/Tob/credentials and Memory must remain unchanged. Retained creation/group receipts cannot revive an old accepted Source Event or expired Shell. Repeat exact-profile restart and real Web/macOS readback independently; do not treat authored tests as passed evidence.

Preview review-scope CAS is separate from execution-time capture. First-use Tob may have no native Orchestrator Session before its initial Human message; the journey reads ownership before requesting a tool trace. A real export review must permit only its captured execution's progress and exact export-card/decision audit writes. Preserve first failures for Go quota or the former transaction-count-based `preview-stale`; verify that unrelated Source content, same-length Memory bytes, profile/grant changes, a different export call and revoked current authority still refuse. The model never receives the private review context or opaque scope digest.
