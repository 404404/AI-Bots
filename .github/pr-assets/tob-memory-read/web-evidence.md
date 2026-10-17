# #2128: Tob-owned Assignment Memory read verification

Issue: [#2091](https://github.com/BotHarness/DeepSeekBot/issues/2091). Stack base: #2123, `codex/2093-tob-schedules`.

## Revision boundaries

- Integrated production source, typecheck, build and real Web Host: `3f29dd4ae36db6fa89e72705d4cba8cf0cb33bd1`.
- Verification driver: `1e78373c05243d90f9e0444792419b371432d359`. Production files remain unchanged from `3f`; later changes are the verification driver, its inventory checksum and review assets.
- This artifact commit adds review material only. A later base credential-startup fix still requires stack synchronization and risk validation.

## Checks actually run

| Layer                                         | Result                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Integrated TypeScript                         | Passed                                                                                       |
| Focused source integration                    | 163/163 tests, 8 files, one worker                                                           |
| Integrated build                              | Passed                                                                                       |
| Fresh-profile database readback               | Generation 101; schedule creation and Assignment Memory scope tables both present            |
| Official-model Web                            | Passed                                                                                       |
| Web DM, Tob Sessions, native DSH Session view | Captured and independently inspected                                                         |
| Browser console during final capture          | Empty; earlier journey snapshots recorded page errors only                                   |
| GitHub full CI                                | Requested; no passing claim yet                                                              |
| macOS Desktop                                 | Partial run; first native Assignment completed, full continuation/revocation journey pending |
| Human QA / merge / deployment                 | Not performed                                                                                |

The focused suite covers delegated scope/provenance and lifecycle, stale target incarnations before approval, lost-response receipts, grant revocation, literal-command and broker isolation, expired leases, raw Shell/interpreter/substitution denial, symlink blobs, schedules and operational database migration.

## Real Web journey

The Host used a new isolated schema 101 profile. The official route was credential-ready before its first model request. The native check will use that same absolute home; no prior Session or private database was copied or manually migrated.

1. Human online CLI independently read two synthetic Bots' Memory at exact revisions.
2. Tob prepared the selected stable IDs and incarnation timestamps before Human approval, then created its own Assignment.
3. The real Assignment read both files through its scoped CLI and reported each source Bot, file, full SHA, partial state and honest `pending` revision status.
4. Actual `memory-save` returned `agent-scope-denied`; actual raw `cat` of a synthetic unselected credential canary returned `memory-cli-command-required` without content.
5. Normal unarchive/continuation used the same Assignment and did not add one.
6. Pausing a selected Bot caused actual `memory-target-unavailable` with no returned content.
7. Revocation returned `revoked:true`; the normal continuation tool then refused `memory-scope-unavailable`.
8. The Web showed the final refusal in Tob DM, the Assignment under Tob Sessions, and its native DSH Session with the target-unavailable result.

Two verification failures were preserved and corrected: the fresh profile had no Orchestrator for the initial trace preflight, and a purpose-text heuristic missed an otherwise successful Assignment. Both the wait predicate and selection now use the canonical new Session ID set. The first native Assignment completed while the driver still waited on the leftover purpose-text predicate; the parent stopped only the driver, preserved its completed Assignment, and is continuing that same Session after the verifier fix. A separate pre-stack run safely refused a mixed Human/lifecycle turn with `human-dm-required`; a fresh Human-only request succeeded without weakening authority.

No native Desktop pass, unrestricted Shell safety claim, production credential exposure, merge or deployment is implied by this evidence.
