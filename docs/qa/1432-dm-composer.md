# DM composer delivery evidence — #1432

Scope: [#1432](https://github.com/BotHarness/DeepSeekBot/issues/1432), under [#1431](https://github.com/BotHarness/DeepSeekBot/issues/1431). Base revision: `73c75f86aa50767be34a5c8d2cadc17b6a3e8862`. The PR identifies the exact candidate head. Task: `codex/local/01a12bd8-2d31-7ae1-9fc1-8bf1ba5d6e45`.

## Ownership and review focus

```text
DM ChannelComposer: fixed local / actions, draft and attachment owner unchanged
  model → existing ModelPresetProfile → PersonaBot model plan
  workspace → existing WorkspaceGrantsEntry → confirmed scoped Grant
  companion → existing WindowCompanions owner ← existing header pin
  usage → shared header ProfileActivity snapshot → existing Profile view
```

The menu is an application-defined UI entry point, not a model command protocol. No schema, Host endpoint, statistics authority, permission mode, navigation or Group extension is added. Model and Grant chips subscribe to the existing change owners; late responses are fenced by scope/unmount. The header and composer share one 26-week Bot activity snapshot and the same ready/unknown/partial/unavailable formatter. Refresh is bounded to completed message changes, Profile opening and a 30-second timer; loading/failure never invents zero usage.

Composition borrows a compact context row and input-adjacent menu, adapted to DSH tokens and the existing composer. Existing Modal, Button and model/Grant editors are reused; menu/context controls deliberately use compact semantic native buttons rather than the larger capsule Button. Original sidebar entries and header pin remain available. Shared Bot main/CSS/locale edits are limited to composer wiring, the shared activity reader and translations, keeping #1434's navigation scope separate.

## Automated verification

- Client suite: **167 files passed, one skipped; 1216 tests passed, one skipped**. Existing jsdom navigation warnings are not browser runtime failures.
- Focused regression: **eight files, 53 tests passed**, covering slash filtering, ordinary prose/path slashes, Enter/Tab/arrows/Escape, pointer selection, target changes, draft/attachment preservation, model-store synchronization, scoped Grant confirmation/cancellation/reuse, preview failure readback, Companion readiness/preference restoration and usage states.
- Typecheck, lint/source policy, formatting, build and bilingual Release Ledger checks passed.
- Full repository suite: **488 files passed, one failed, seven skipped; 4114 tests passed, one failed, 13 skipped**. Not green: `scripts/test/dev-im-test-apps.test.mjs` synthetic-stdin setup test exits 2 instead of 0. The same single-test failure reproduces at the exact detached base revision (six tests pass, one fails); its source is unchanged by this PR. No unrelated script fix is included.
- CI and Human QA are separate gates; local results do not claim either.

## Real isolated Host E2E

Verified on the worktree-pinned DSH `0.2.0-rc.1` with a task-owned Profile and loopback port, without touching other running instances. Credentials, paths, raw Profile/database/session files and local login URLs stay private.

1. Opened `/model` from the DM composer, saved `deepseek-flash` through the existing editor, and observed the composer chip and original sidebar Model entry synchronize. A real subsequent DM returned `COMPOSER_MODEL_OK`; persisted usage identifies the selected model.
2. Previewed a directory, checked the Bot/resolved-directory/access confirmation, then cancelled: zero Grants. Confirmed the same directory and repeated it: one existing Grant, not a duplicate; Orchestrator-write remains off and no Assignment-access override is created. Directory preview does not publish a mutation or dismiss its pending confirmation.
3. A real later delegation through the existing Host `create_assignment` tool wrote `proof.txt` containing exactly `COMPOSER_WORKSPACE_OK` plus newline (22 bytes) in the authorized fixture. The Assignment completed; persisted usage contains both Orchestrator and Assignment rows for `deepseek-flash`. Two explicit **Allow once** approvals were used only for read-only file verification (the first command used an unsupported BSD flag); no permanent rule or preset was changed.
4. A real request targeting a different ungranted fixture received the Host refusal `Workspace Grant is missing or revoked`. No Assignment/file was created for that fixture; the expected denied proof file is absent. The Bot did not request authorization or substitute its Memory workspace.
5. Composer `/companion` remove/show and the original header pin synchronize bidirectionally. Actions preserve a synthetic draft and uploaded `composer-proof.txt`; reload restores the Companion selection through its existing Profile-local preference. Reload is not claimed to persist the unsent draft/attachment.
6. Header Profile and composer simultaneously displayed **353504 tokens over the same 26 weeks** for the same Bot; the summary opens the existing detailed Profile view. This is measured historical use, not context-window occupancy or streaming estimation.

The isolated macOS native directory picker initially refused browsing as unavailable. The QA Profile switched only its picker implementation to the installed official Host/Client browse providers, then completed real directory preview/confirmation and delegation. Native-picker fallback and mutation-error readback are covered by focused tests, not claimed as a successful real OS dialog run.

## Visual evidence and limits

Committed PNGs under `1432-dm-composer/` are real rendered UI crops with synthetic data. They intentionally omit unrelated conversation previews, local paths and identifiers. Before shows the prior entry-point/absence state; after shows the new menu/context row. Before/after use the same composer surface, theme and captured image dimensions; configured model/Grant/usage changes in the ready-state after are labeled, not represented as identical fixture data.

Desktop English light/dark captures are browser evidence, not physical-phone, Safari or Human acceptance. Chinese was selected through the real shell settings; DOM verification showed translated menu actions, chips and the existing Profile details reached from the summary. Final Chinese/confirmation-dialog capture and narrow/touch verification remain blocked: the T3 preview continued serving DOM actions but PNG snapshots failed and viewport resizing timed out. The committed dark pair is the completed before/after evidence; ready-state dark/light images are supplemental, not matched light before/after. No standalone headless capture is represented as T3 evidence. Complete these remaining visual checks through the reproduction steps before accepting Human QA.

T3 browser console snapshots during the main E2E had no displayed console errors; canceled streams/diagnostic requests during navigation are not claimed to be a completely clean network trace. The detailed HTML explainer is generated locally against the exact PR head; no authorized shared HTML hosting path was used. This Markdown evidence is reviewer-accessible, but the local HTML is not claimed to be shared or runtime proof.

## Human QA reproduction

1. Launch a new isolated Profile using the repository dev-instance helper and the pinned CLI; use your own authorized model and disposable workspace. Do not reuse another session's port/receiver.
2. In a Bot DM, type a multiline draft, attach a file, then `/`. Exercise model/workspace/Companion via keyboard and pointer, cancel each editor, and confirm draft/attachment survival. Ordinary prose and path slashes must remain message text.
3. Save a model, send a normal DM and verify its real reply; compare the chip with the original Model entry.
4. Preview and cancel a folder, then authorize it explicitly and repeat: same Grant, no mode/rule elevation. Delegate one bounded operation there and verify a separate ungranted directory still fails.
5. Compare summary and header Bot/26-week counts, click into the existing details, then return to Chat. Toggle Companion from each entry and reload to check the existing preference.
6. Review light/dark, zh/en, wrapping and touch on your actual target devices. Group/navigation changes are out of scope.

**Human QA pending.** One issue/PR only; pause after PR publication. No merge or #1433 work is authorized by this delivery.
