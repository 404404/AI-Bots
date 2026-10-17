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
