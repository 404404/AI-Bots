# Tob reviewed Memory edits: source and Web evidence

Issue [#2092](https://github.com/BotHarness/DeepSeekBot/issues/2092); parent #2081; stacked on #2091.

## Revision boundaries

Web-qualified code and verifier head: `e3ed175ccd26de4ad980d1059ee7783db8f96bc4`, originally stacked on `64ecac0afd6358edba9e03bb0f771f2c5067afcf`.
The sole authorized product build passed at `74c591117`; production source directories are byte-identical through that Web-qualified head.
The branch was then rebased onto `417c6fc509a1cfdb5730bb068308cc788add82cc`, which inherits the upstream credential-startup fix. Range-diff shows the three #2092 production/test commits unchanged. The inherited startup changes still require integration qualification; the prior Web evidence does not qualify them. This does not claim an exact-final-head rebuild or native pass.

The current source is `4a4554904c0b327a9eca7df68b94924870b39ee1`, based on `5d44b7a6507d661415881808ab67e74275d54182`. This second parent update adds #2091 evidence assets and three legacy contract-test corrections; product source is byte-identical to previous PR head `db8073dab`. Its first full CI passed lint, formatting, TypeScript, build, mobile bundles, docs and isolated smoke. Shard2 failed because its old bridge endpoint list omitted `memoryRevisionQuery`; this upstream correction is now included. The new full-CI run remains a separate result, and native integration/Human QA remain pending.

## Checks actually run

| Layer                                            | Result                                                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused source                                   | Initial 9 files / 205 cases: 194 passed; 11 fixture/expectation failures corrected. New cases 10/10, then affected 3 files / 22 cases passed. Other files passed initially; no fresh all-205 rerun claimed. |
| Root TypeScript                                  | Passed                                                                                                                                                                                                      |
| Targeted lint, source policy, formatting         | Passed                                                                                                                                                                                                      |
| CLI parity, feature map/inventory, change ledger | Passed                                                                                                                                                                                                      |
| Product build                                    | Passed once; exact production source equivalence above                                                                                                                                                      |
| Independent live Human CLI                       | Save, exact identity retry, stale expected-HEAD refusal and supported restore passed                                                                                                                        |
| Official-model Tob Web                           | Edit, deny, concurrent-edit stale refusal and separately reviewed restore passed                                                                                                                            |
| Actual same-Profile Host restart                 | Restored revision/content persisted; canonical readback and visible file passed                                                                                                                             |
| Native macOS                                     | Pending; prepared same-absolute-home helper, no Session copying                                                                                                                                             |
| Full CI, Human QA, merge, deployment             | Pending / not performed                                                                                                                                                                                     |

Actual Memory owner tests cover Human-attributed self edits through normal turn reconciliation and abort, preserved accepted state, dirty work, branch changes and frozen prefixes. Targeted operation tests cover scope/source revocation, target incarnation, current-flight eligibility, exact replay and separate restore review. The #2091 Assignment still rejects a fully formed Memory write command.

## Canonical real-model Web results

The disposable target held `Original green tea preference.`; the second Bot held a separate coffee preference and remained unchanged. Each operation used a new actual native Shell CLI call, a completed Tob turn, a handled Human delivery and a real reply. The final journey and capture runs recorded no page errors.

| Stage                                             | Owner result                                                                 | Body                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| Reviewed edit                                     | `263e58397fee551fbf0f8635de0ef0d3c358e81b`                                   | `Reviewed jasmine tea preference.\n` |
| Denied edit                                       | Same `263e58397fee551fbf0f8635de0ef0d3c358e81b`                              | Same reviewed text                   |
| Concurrent Human edit, then obsolete Tob approval | `memory-conflict`; retained `a7e180be068b18465bb48bc62c52411fe1b8266f`       | `Concurrent owner edit preserved.\n` |
| Separately reviewed restore                       | New `4d86372271aadf49036426feaa866f12333ecee7`, distinct from historical SHA | Original text                        |
| Actual same-Profile restart                       | Same `4d86372271aadf49036426feaa866f12333ecee7`                              | Original text                        |

Pending reviews pin target incarnation, original text, exact diff, expected HEAD, accepted HEAD, branch and repository fingerprint. Settled cards intentionally hide their input details. One additional review was captured while pending, then denied; its canonical content and revision remained unchanged. The PR includes both target and scrolled-diff captures from that single proposal.

The original/edited screenshots compare actual file states on the candidate, at the same 1440 × 900 viewport, dark theme and Chinese locale. The original-state screenshot was captured after the separately reviewed restore; it is not an old-binary baseline screenshot. No new Client layout was introduced. To compare binary capability, the #2091 base offers read-only delegated Memory access and has no reviewed Tob Memory-write operation; open a disposable target DM and its existing Memory files view before requesting this new Home workflow.

## Preserved first failures and remaining gates

Early verifier attempts exposed seed newline normalization and current workspace/accessible-name selector assumptions. Those attempts and a clipped pending-card capture were retained as failures, then corrected without weakening product checks. A settled-card attempt confirmed that original input details are unavailable after settlement, so the complete pending diff required the single additional denied proposal.

Native Desktop, Human QA, live Soul/self edits and actual compaction/new-Session prefix adoption remain independent gates. A visible saved file does not prove prompt adoption. The current Session prefix remains frozen; new Sessions and the next compaction adopt standing-file changes. Scoped restore refuses dirty Memory and asks its owner to preserve unfinished work; direct Human restore keeps its existing backup path.
