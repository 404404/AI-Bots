# PR #2168 compatibility evidence

Recorded 2026-10-18. Final runtime source: `cb2a201d62847977e7329ca9e92d4cccdf7721f2`. The same locally prepared **1.4.0** tarballs were installed on both released DSH versions; their integrity digests are in [qualification.json](qualification.json). Nothing was published.

| Check                                                        | DSH 0.2.0-rc.2                           | DSH 0.2.1-rc.2                           |
| ------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------- |
| Final artifacts, fresh Profile, normal plugin install        | Passed                                   | Passed                                   |
| No native compatibility-disabled plugin                      | Passed                                   | Passed                                   |
| Host Bot + DM creation and restart persistence               | Passed                                   | Passed                                   |
| Final macOS Desktop Bot mode, settings, restart              | Passed                                   | Passed                                   |
| Native Owner-only secret-list (names only, empty test store) | Passed                                   | Passed                                   |
| Real DM, Assignment write/read, foreground spawn + fork      | Passed on final source                   | Passed on final source                   |
| Background Subagent result delivery                          | Native completion plus visible result 81 | Native completion plus visible result 81 |

After provider credit was restored, the **final old-Desktop model journey passed** from the actual DM composer: Assignment file write/read, independent Orchestrator read, foreground fork 42, foreground spawn 64, and background spawn 81. Both Orchestrator turns ended `completed`. The old parent Session recorded `user/message` sequence 42 with source kind `subagent-settled` and closing message `81`; the new parent recorded the same native completion kind with `9 * 9 = 81`. This proves native parent delivery separately from the model's visible report.

The old Desktop was restarted again. Its DM result and the same Assignment remained available; opening that Assignment in the native Session view showed the retained file proof. The final old file contains exactly `DSH-COMPAT-42` (13 bytes, without a newline); earlier/new runs wrote a trailing newline. Both exact hashes are retained in the JSON record. No runtime code or tarballs changed during this follow-up.

The earlier new-Desktop run delivered its successful results before a subsequent **QUOTA / Insufficient Balance** error. That first failure remains preserved; this follow-up clears the old-version final-package verification gap, not every publication gate.

## Evidence captions

- `final-old-result.png` and `final-old-subagent.png`: final package, old Desktop, actual Assignment read-back and all three Subagent results after credit restoration.
- `final-old-restart.png`: retained DM result and the same Assignment in the Session list after restarting the old Desktop. The separate native accessibility capture confirms the Assignment detail view and file result.
- `old-subagent.png`: earlier candidate, old Desktop, actual Assignment file write/read plus foreground fork 42 and spawn 64. This is **not** a screenshot of the final source.
- `final-new-result.png`: final candidate, new Desktop, actual Assignment and Subagent output. The channel preview also records the subsequent provider QUOTA failure; the successful tool calls are independently listed in the JSON record.
- `final-old-settings.png` and `final-new-settings.png`: final candidate on each Desktop, model and runtime settings loaded.
- `final-new-computer.png`: Computer registration/settings surface loaded with auto-approval still off. This does **not** prove actual OS input or screen capture.

All visible data is synthetic, isolated task data. Screenshots came from native CUA; no browser automation, DOM injection, mocked model output, or permission bypass. Original local private Host logs are not committed because they contain login tokens.

## Reproduction and remaining release gates

Build this source, prepare a single candidate with `scripts/product-artifacts.mjs`, then run `scripts/e2e-fresh-profile-install.mjs` against both versions. This run reused already installed exact-version CLIs and a package cache to fit local disk capacity; each test Profile was new and had no preapproved builds. Use each official Desktop binary with a dedicated `DSH_HOME` and `desktop` Profile containing those same artifacts. In Bot mode, send the synthetic file/delegation task and correlate its visible reply with `bot-trace` and the generated file.

Actual Browser/Computer operations and external IM delivery remain separate publication gates. Future 0.2.x versions are admitted by policy, not runtime-qualified. PR remains Draft; no merge, tag, registry publish, or install-guide promotion is authorized.
