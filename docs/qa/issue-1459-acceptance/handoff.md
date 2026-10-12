# Composer recovery continuation handoff — 2026-10-13

## Fetchable continuation source

- Parent spec: [#1458](https://github.com/BotHarness/DeepSeekBot/issues/1458).
- Implementation: [#1459](https://github.com/BotHarness/DeepSeekBot/issues/1459), Draft [PR #1467](https://github.com/BotHarness/DeepSeekBot/pull/1467), branch `codex/1459-composer-drafts`.
- Runtime source and published evidence baseline: `66458b48eea03e8f94f014dd921d2dc3d725739c`.
- This follow-up adds documentation and retained screenshots only. Its commit is **not a new runtime fix or RC2 dependency upgrade**. Obtain the exact evidence commit from the issue/PR handoff and verify the fetched branch contains it; the runtime proof remains bound to the source revisions named in each report.
- Task: `codex/local/01a12f41-fe63-71b1-b649-520c0236079b` (not a DSH Session); [verification claim](https://github.com/BotHarness/DeepSeekBot/issues/1459#issuecomment-6121475917).

```bash
git fetch origin codex/1459-composer-drafts
git show FETCH_HEAD:docs/qa/issue-1459-acceptance/handoff.md
git worktree add --detach <fresh-task-worktree> FETCH_HEAD
```

Refresh the PR head, claims and remote `main` before further changes. At the last status readback, #1467 was Draft with base conflicts (`mergeStateStatus: DIRTY`); resolve the current base in its own verified continuation rather than treating this evidence-only commit as conflict resolution.

## Retained evidence and proof limits

| Evidence                                                                                       | Source and boundary                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Original acceptance matrix](verification.md)                                                  | Exact earlier runtime/baseline, comparable reload captures, focused tests, full-suite baseline failure and original remaining gates. Historical results are not current-head CI.                                                                                |
| [Chrome follow-up](chrome-follow-up.md)                                                        | Published-source narrow Group and actual Bot reply-reference restoration, plus the separately labeled seven-file prerequisite composition. Its initial six-file / 63-test result is separate from RC2.                                                          |
| [RC2 multi-tab follow-up](rc2-multitab-follow-up.md)                                           | Disposable version-only upgrade from the published runtime source: install/typecheck/build and six files / 53 focused tests passed. Repeated same-origin loading failure, observed long responses, independent authenticated request and peer-release recovery. |
| [DSH primary-source research](../../research/2026-10-12-dsh-multitab-loading-investigation.md) | Exact upstream revisions and historical native WebSocket/auth/recovery boundaries. Source statements, supplied earlier observations and new local reproduction remain distinct.                                                                                 |

New screenshots are retained beside these reports. They show synthetic QA content and a disposable built-in Bot surface, not private conversations. Desktop/narrow captures show the measured browser states documented in the reports; they are not physical-device or Safari qualification. The prerequisite-composition and RC2 loading screenshots are **negative evidence**, not screenshots of a released transport fix. Earlier failed/blank documents and timed-out requests remain recorded.

The prior full suite reported **4222 passed, 13 skipped, one baseline-reproduced failure**; it was not green. Current-head Actions qualification and Human QA remain outstanding. Documentation formatting, relative-link checks and image publication are evidence-packaging checks, not runtime acceptance.

## Current blocking reproduction

1. Launch an owned fresh isolated Profile using the repository helper; authenticate through its locally printed login URL.
2. Open one Bot-mode DM and enter an unsent synthetic draft. Open the same origin/DM in a second page.
3. Run the bounded read-only list RPC from the RC2 report. Keep the UI identity/model/message-loading state and failure timing as separate observations.
4. The retained RC2 run observed six simultaneous HTTP/1.1 long responses: HMR twice, Roster twice, Channel once and Companion once. Browser RPCs timed out at about five seconds while an independent authenticated request succeeded in 43 ms.
5. Leaving the peer closed its responses and restored the original page's RPC in 4–8 ms without changing credentials or restarting between cycles; reopening reproduced the failure. The unsent draft remained editable.

These observations strongly isolate this reproduction to same-origin connection pressure. An identity-loading warning does not prove token rejection; preserve actual `401`/`403` separately from queued or aborted requests. RC2 alone did not fix the failure. The temporary read-only observer was removed after collection; its private logs and the probe Profile are not transferred in this branch.

## Ordered #1459 continuation

1. Check the existing owner of [#1451](https://github.com/BotHarness/DeepSeekBot/issues/1451) / [PR #1454](https://github.com/BotHarness/DeepSeekBot/pull/1454). Its separately qualified stack and partial stream consolidation are not automatically qualification of #1467. Coordinate the transport seam instead of taking over the sibling task.
2. Evaluate application-defined logical streams through native Remote multiplexing, including Companion and native HMR in the capacity assessment. Validate cancellation, lifecycle, reconnection and original authority. More retries/longer deadlines or silently disabling live updates are not the accepted product fix.
3. Reconcile the current #1467 base conflicts and run the two-page red/green loop against an exact runtime head. Then finish real concurrent draft conflict preservation **and** successful reference validation/selection without forcing the peer to leave Bot mode.
4. Complete actual reference deletion/revocation, native IME, deliberate welcome-chip sending and second-Host live identity isolation under fresh, bounded authorization. Published-source reply restoration and narrow browser checks already have retained evidence; do not replay the consumed test-message authorization.
5. Record focused/full-suite/CI/native-window/UI evidence separately. Publish comparable screenshots, verify GitHub rendering and stop at explicit Human QA. Keep the PR Draft until its gates are met; do not merge, deploy or start #1460 automatically.

## Independent parent-spec path

- #1460 depends on #1459 closure and explicit Human-QA acceptance.
- #1461 is an independent file-open/preference slice. A new task may refresh claims/PRs and claim that issue in its own worktree/branch; it should not implement file-open changes on this composer branch.
- #1462 depends on #1461 closure and explicit Human-QA acceptance.
- Parent issue text is the published requirement authority. #1459's committed recovery ADR is ADR-0184 (renumbered from 0175 when main took that number); the original proposed ADR-0160 number was occupied. Recheck numbering and existing authority before incorporating the proposed file-open ADR, rather than assuming untracked original-machine drafts are committed documents.

## Separate RC2-default request

The Human requested `0.2.0-rc.2` as the future development/default CLI version. Only the disposable probe was upgraded; this branch still pins its runtime dependencies as before. A separate task must qualify manifests/lockfile/workspace patches, AX guards, global CLI and current developer guidance. Preserve historical version evidence, compatibility ranges and qualified product-artifact/IM-provider boundaries. The probe passed RC2 patch application but did not qualify every optional integration or authorize migration of other tasks' Profiles/Hosts.

## Private reconstruction and authorization

Create an isolated Profile and use machine-local credential setup from the repository launcher/runbooks. Login URLs/tokens, keys, Profile/DB state, original raw traces and native browser sessions remain private; a new machine must recreate them rather than expecting them in Git. Preserve other sessions' receiver/Profile/port ownership. No production receiver cutover took place in this follow-up.

The previously authorized single synthetic model submission was consumed. It does not authorize further sends, deletion/revocation, scheduled tasks, permission changes or production operations. This handoff and evidence commit grant no such authorization and do not claim completed Human QA, merge or deployment.
