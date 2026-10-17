# Paired-device native verification plan

Draft PR: [#2129](https://github.com/BotHarness/DeepSeekBot/pull/2129). Tested product source: `8bde3340afb8ba4a23f3f715851f83da188168d2`; Web capture commit: `e734b55dc6b74fa07ec9b0e8d1a9e6b762b67f51`.

Status: **prepared, not run**. The previous Web home was removed after verification; a fresh fixed home must get its own new Web and native proof. Do not claim continuity with the deleted home.

1. Parent grants the serialized Host/native slot, confirms disk budget and the exact candidate head. Existing dependency links and builds belong to this worktree. Their retained timestamps/hashes are inventoried locally; no independent source/build manifest exists. Rebuild only when the parent decides it is necessary and permits it.
2. Launch a fresh isolated Web instance named `tob-devices-2098-fixed` with the pinned development helper and a parent-approved free port. Omit `--build` unless separately authorized. Keep its generated absolute `DSH_HOME` unchanged for the complete Web → Desktop transition. Run doctor before driving.
3. Run `scripts/e2e-tob-devices.mjs` against that instance: offer → synthetic client pairing → Devices list → reviewed revoke → stream closure and subsequent denial. Before the optional model phase, inspect the current catalog and configure only the isolated Tob's Model Plan with an available authorized route. Use the shared dev-secret helper without printing credentials.
4. Stop only the exact Web PID, retaining the fixed home. Copy only its `profiles/web-dev` configuration to `profiles/desktop`, preserving native settings and package links. Do not copy or relocate Session stores.
5. The parent alone stops/restores the Human's main Desktop in an outer `finally`. The prepared task-local switch helper never stops main. It requires the explicit parent-slot marker, checks shared Host port `19387` plus reserved inspect/CDP ports `19785`/`19786`, then launches the installed native app against the same absolute home with a task-private user-data directory.
6. Read a fresh login URL only from bytes appended after this candidate launch's log offset; validate its authenticated API before writing a private 0600 instance manifest. Do not reuse a previous process token, emit the URL, or publish the manifest/log.
7. Connect the verifier using `BH_DESKTOP_CDP` and `BH_E2E_HUMAN_INSTANCE`. It uses the existing candidate page and disconnects without closing the Desktop. Run the direct phase, then the real model phase if the configured route is usable. Observe the actual native window, capture the Devices before/after states and safe Tob reply, and correlate them with canonical state. Do not capture live QR codes.
8. Stop only the exact task candidate. The parent restores main in its outer `finally`, checks the original window is usable, and records exact native head, first failures and screenshots separately from Web evidence.

The fixed-home switch script and machine-local paths remain in the private task folder. They are prepared from the already-qualified parent switch pattern, but this new helper and the verifier's Desktop connection branch are **unexecuted**.

Physical phone is a separate unrun gate: camera, Keychain/Keystore, phone networking and native WebSocket behavior require the designated shared-device queue and Human steps. Synthetic protocol clients and macOS Desktop do not qualify a phone. Windows private output remains refused until ACL support is qualified.
