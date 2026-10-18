# PR #2168 compatibility evidence

Recorded 2026-10-18. Final runtime source: `cb2a201d62847977e7329ca9e92d4cccdf7721f2`. The same locally prepared **1.4.0** tarballs were installed on both released DSH versions; their integrity digests are in [qualification.json](qualification.json). Nothing was published.

| Check | DSH 0.2.0-rc.2 | DSH 0.2.1-rc.2 |
| --- | --- | --- |
| Final artifacts, fresh Profile, normal plugin install | Passed | Passed |
| No native compatibility-disabled plugin | Passed | Passed |
| Host Bot + DM creation and restart persistence | Passed | Passed |
| Final macOS Desktop Bot mode, settings, restart | Passed | Passed |
| Native Owner-only secret-list (names only, empty test store) | Passed | Passed |
| Real DM, Assignment write/read, foreground spawn + fork | Passed on earlier source `511ce4dc2`; final rerun blocked | Passed on final source |
| Background Subagent result delivery | Contract tests only | Native completion plus visible result 81 |

The sole runtime delta after the successful older-Desktop journey was removal of the legacy `{{cwd}}` persona suffix: the newer Host no longer registers this variable. The final package installation, startup, restart and settings were rechecked on the older Desktop. Its final model rerun remains pending because the provider returned **QUOTA / Insufficient Balance** after the new-Desktop result was delivered. This is not an all-green runtime qualification.

## Evidence captions

- `old-subagent.png`: earlier candidate, old Desktop, actual Assignment file write/read plus foreground fork 42 and spawn 64. This is **not** a screenshot of the final source.
- `final-new-result.png`: final candidate, new Desktop, actual Assignment and Subagent output. The channel preview also records the subsequent provider QUOTA failure; the successful tool calls are independently listed in the JSON record.
- `final-old-settings.png` and `final-new-settings.png`: final candidate on each Desktop, model and runtime settings loaded.
- `final-new-computer.png`: Computer registration/settings surface loaded with auto-approval still off. This does **not** prove actual OS input or screen capture.

All visible data is synthetic, isolated task data. Screenshots came from native CUA; no browser automation, DOM injection, mocked model output, or permission bypass. Original local private Host logs are not committed because they contain login tokens.

## Reproduction and remaining release gates

Build this source, prepare a single candidate with `scripts/product-artifacts.mjs`, then run `scripts/e2e-fresh-profile-install.mjs` against both versions. This run reused already installed exact-version CLIs and a package cache to fit local disk capacity; each test Profile was new and had no preapproved builds. Use each official Desktop binary with a dedicated `DSH_HOME` and `desktop` Profile containing those same artifacts. In Bot mode, send the synthetic file/delegation task and correlate its visible reply with `bot-trace` and the generated file.

Once provider credit is available, repeat the old Desktop model journey on the final package and include background delivery. Actual Browser/Computer operations and external IM delivery remain separate publication gates. Future 0.2.x versions are admitted by policy, not runtime-qualified. PR remains Draft; no merge, tag, registry publish, or install-guide promotion is authorized.
