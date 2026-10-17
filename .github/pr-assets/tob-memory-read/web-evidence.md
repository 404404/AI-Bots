# #2128: Tob-owned Assignment Memory read verification

Issue: [#2091](https://github.com/BotHarness/DeepSeekBot/issues/2091). Stack base: #2123, `codex/2093-tob-schedules`.

## Revision boundaries

- Original production build and Web/macOS runtime proof: `3f29dd4ae36db6fa89e72705d4cba8cf0cb33bd1`.
- Current integrated code head: `417c6fc509a1cfdb5730bb068308cc788add82cc`, based on schedules `6a6cc80b8f8c06c3327e79df025e1be954e50eb0`. It incorporates credential-ready startup and safe schedule recovery. The Memory patch series is unchanged; verifier corrections and review assets follow it.
- New integrated head: TypeScript, 155 focused tests across 10 files and one build passed. Its runtime qualification is still pending. Original runtime evidence does not qualify the new integrated build.
- This artifact descendant adds only sanitized review assets.

## Checks actually run

| Layer                                            | Result                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Original integrated source                       | TypeScript, 163/163 focused tests across 8 files and build passed                                          |
| Current integrated source `417c6fc50`            | TypeScript, 155/155 focused tests across 10 files with one worker, build passed                            |
| Fresh-profile database readback                  | Generation 101; schedule creation and Assignment Memory scope tables both present                          |
| Official-model Web on original build             | Passed                                                                                                     |
| macOS on original build, same absolute home      | Fresh reviewed comparison, write/raw Shell refusal, continuation, unavailable target and revocation passed |
| Final native completion                          | Exact turn 14 completed, Human delivery handled, Bot/Assignment idle, stable for two seconds               |
| Focused native DM / exact DSH Assignment Session | Captured and independently inspected after stable completion                                               |
| Final native browser/page console                | Both empty                                                                                                 |
| New integrated-build runtime                     | Pending parent stack qualification                                                                         |
| Human QA / merge / deployment                    | Not performed                                                                                              |

The focused suites cover delegated provenance and lifecycle, stale target incarnations before approval, retry receipts, grants, literal CLI/broker isolation, expired leases, interpreter/substitution denial, symlink blobs, schedules and operational migrations. New integration also covers credentials-ready startup and safe scheduled-Inbox recovery.

## Real Web journey

The Host used a new isolated schema 101 profile. The official route was credential-ready before its first model request. The native check used that same absolute home; no prior Session or private database was copied or manually migrated.

1. Human online CLI independently read two synthetic Bots' Memory at exact revisions.
2. Tob prepared the selected stable IDs and incarnation timestamps before Human approval, then created its own Assignment.
3. The real Assignment read both files through its scoped CLI and reported each source Bot, file, full SHA, partial state and honest `pending` revision status.
4. Actual `memory-save` returned `agent-scope-denied`; actual raw `cat` of a synthetic unselected credential canary returned `memory-cli-command-required` without content.
5. Normal unarchive/continuation used the same Assignment and did not add one.
6. Pausing a selected Bot caused actual `memory-target-unavailable` with no returned content.
7. Revocation returned `revoked:true`; the normal continuation tool then refused `memory-scope-unavailable`.
8. The Web showed the final refusal in Tob DM, the Assignment under Tob Sessions, and its native DSH Session with the target-unavailable result.

## Native stages and preserved verifier failures

The fresh macOS phase created its own reviewed Assignment. It completed real selected Memory reads, a raw `cat` canary denial and a denied write. A leftover purpose-text predicate then kept the driver waiting. The parent stopped only that driver and preserved the completed Assignment.

The continuation phase reused that exact Assignment ID. Normal continuation, paused-target refusal and revocation/refused continuation all passed. Its first final screenshot preceded handled Human delivery by about 0.8 seconds; that screenshot is not the completion proof.

A read-only capture phase added a strict closing gate. The first capture attempt proved completed/handled/idle but timed out on an obsolete wrapper selector. The final capture used the observed workspace markup, passed every stage and made no new model request. It shows the full revoked-scope DM and exact Assignment in its DSH Session with `memory-target-unavailable`.

The sanitized [native record](./native-verification.json) preserves each phase, canonical identity and completion facts. Private Profile data, login URLs, credentials and raw journals remain local.

A separate pre-stack run safely refused a mixed Human/lifecycle turn with `human-dm-required`; a fresh Human-only request succeeded without weakening authority. These bounded synthetic checks do not claim exhaustive command-execution security, Human QA, new integrated-build runtime qualification, merge or deployment.
