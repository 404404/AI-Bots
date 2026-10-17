# Tob maintenance qualification — #2088

Product baseline: `a3e2c4e64d131191e686e33cb207d3db9b3a0937`.
Actual application/artifact build: `8962d221307fb46b114dd47b4f0b38bd5f9dab4c`.
Task: `codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60`.

This follow-up changes qualification drivers, documentation and review evidence. It changes no product runtime, preference owner, approval policy or package identity. Existing maintenance behavior belongs to the baseline and merged #2105/#2108.

| Gate                               | Evidence                                                                                                                                                                                                                             | Limits                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Owner/maintenance source checks    | Prior public handoff records74 passing tests across telemetry, managed Git, release/restart and Tob adapters                                                                                                                         | Preserved, not repeated; not real-model or device proof                                                        |
| Managed Git                        | Actual pinned macOS arm64 download62,348,987bytes, production checksum/extract, Git2.53.0 real commit/readback and a new service recovering the binary                                                                               | Prior owner/artifact execution; not Host CLI, Tob Git-install UI or OS reboot                                  |
| Web telemetry                      | Human CLI off/on/restore; natural approval true→false; another request denied and false retained; actual privacy controls and completed/handled turns                                                                                | Explicit telemetry1, no DNT lock; same existing owner                                                          |
| Web restart                        | New Host process, same absolute home and retained browser profile; telemetryfalse read before writes                                                                                                                                 | External process restart, not the release-restart command                                                      |
| macOS telemetry                    | Parent ran direct off/on/restore, natural approval false→true and denial of true→false; actual controls, ordinary Shell, completed/handled turns                                                                                     | One selected native Client; page-error lists empty; parent restored main Desktop                               |
| macOS restart                      | Actual new process, same absolute home/Profile/userdata; telemetrytrue read before writes                                                                                                                                            | External process restart, no multiwindow or release-restart claim                                              |
| Simple capability question         | Web, native and locally installed product replied as a local Bot steward, using fresh scoped CLI discovery and supported settings/model owners                                                                                       | Native and installed-product harness failures were reconciled separately, as described below                   |
| Local product artifacts            | Standard product pack built six unchanged-version artifacts; ordinary offline Bundle installation into a fresh isolated Profile; all component paths/versions and Provider provenance verified; installed CLI and actual model reply | Explicit pinned consumer reproduction, not untouched/default registry resolution or published NPA installation |
| Genuine current-Tob release update | Registry metadata still reports latest1.3.1, published2026-10-14, Provider4.32.0-botharness.20                                                                                                                                       | No eligible published artifact containing current Tob was installed/updated/restarted; gate remains pending    |

Public-safe receipts and actual screenshots are in [the review evidence](../../.github/pr-screenshots/2088-maintenance/verification.json). The prior Git receipt is [managed-git.json](../assets/pr/2088-maintenance/managed-git.json). Source checks, model/device behavior, local artifacts, published release, CI and Human review remain distinct.

## Real runtime paths and first failures

Use `scripts/e2e-tob-model-runtime.mjs` with `intro`, `telemetry-direct`, `telemetry-approve`, `telemetry-deny` or `telemetry-restart-read`, one phase per process. The telemetry controls live in Data & privacy. Separate transition screenshots and receipts preserve before/off/on/restore rather than overwriting one file. The restart expectation comes from the actual preceding decision receipt. Do not copy Sessions to another home or replay uncertain writes.

The real simple prompt was “你能做什么？”. The Web reply used ordinary capabilities discovery, preserved settings/model revisions, proposed no approval/write, and invited a next step. Its first invalid empty Inbox-ID send was refused; the same turn corrected the send and resolved its Inbox without a duplicate final reply.

The native intro actually ran a fresh successful scoped CLI call, parsed52 commands from18,471bytes, completed its turn and handled the exact Human message. Its initial driver nevertheless required the model's chosen stdout preview to contain `assignmentConcurrencyLimit`. That assertion was too specific: a valid command-count summary need not print that field. The original exit1, screenshot, canonical completion and full output remain retained. The native result was reconciled offline without another model submission.

An initial correction tried `capabilities` through the online Human CLI, but that command is intentionally scoped-only. The locally installed product's model turn completed before that fixture failed. Supported installed Human CLI reads of `settings botharness-client` and `model-catalog` then succeeded; canonical trace/message/unchanged plan and the actual retained reply were reconciled and captured read-only, without another model prompt. The final driver keeps the fresh successful scoped Shell requirement and cross-checks those supported owners. These reconciliations are not presented as original harness exit0 runs.

## Local artifact provenance and bounded inputs

The actual development version remains0.0.0. Standard packing produced core/UI/browser/computer/product0.0.0 and Provider4.32.0-botharness.21. Original Provider revision`beaed4a6dabb583654d28fb09298716267039b4a`, manifest, lock and421-file runtime digest passed strict validation. Its missing lockfile was recovered from the original read-only cache and verified by pinned SHA256/SHA512. Standard Provider rebuilding produced its separately recorded422-file managed output.

Only the109-package build/SDK closure was materialized:2,716files,73,628,741bytes. Cached files passed individual digests. Fourteen exact missing locked packages were downloaded separately:2,516,031compressed bytes,11,527,052unpacked bytes, all original lock integrities matched. No full workspace installation, version substitution, package publication or installer lifecycle script was used for this build input. Only the normal Provider build scripts and normal product pack ran.

Ordinary `dsh plugin --profile web-dev add <local-product-tarball>` installed the fresh Profile. The offline first attempt refused missing registry metadata; a metadata-only plan exposed default range resolution selecting dockview/core8.6.0. This reproduction explicitly pins the producer-qualified8.4.1 dependencies and local component/exact dependency tarballs. The successful installation is therefore **pinned consumer reproduction**. Default8.6.0 resolution remains unqualified; no product dependency change is included.

The installed CLI resolves inside that fresh Profile, outside the checkout, and its bytes/hash match the local product artifact. The independent Human fixture explicitly selects it with `BH_E2E_CLI_PATH`; model management still uses the installed protected Tob scope and ordinary Shell.

## DSH installation anchor must remain isolated

Pinned rc.2 `dsh-app-boot.resolveBundleDir` checks the DSH installation anchor before the Profile. A native CLI symlink into the workspace selected its development Bundle before the correctly installed product Bundle. The six-component validator correctly refused the missing IM composition; it was not relaxed.

A task-private physical copy of the identical pinned native CLI package, with verified native dependencies and an installation anchor outside the workspace, corrected resolution. All six installed product components and Provider provenance then passed preflight and the authenticated Host/API doctor. No product code, shared installation, global model, Profile or Session copy was used to hide the refusal. The first failure and native package hashes remain recorded. This pitfall is also in the first-party development skill.

## Remaining acceptance

The latest published1.3.1 artifact predates this Tob implementation. A genuine1.3.0→1.3.1 update could separately qualify that released updater, but cannot prove code absent from that release. Current-Tob `release-install`/`release-restart` still needs an eligible genuine artifact, explicit confirmation and actual new running identity. Development identity and its coded refusal are preserved; local0.0.0 installation does not replace this gate.

Tob Git-install UI, multiple native windows, default unpinned dependency resolution, exact-head CI and Human QA are separate from the proof above. No skipped gate is passed; no merge, auto-merge, release or deployment is authorized by this report.
