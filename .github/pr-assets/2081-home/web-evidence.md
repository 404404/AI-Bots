# Home creation and dashboard evidence

Issue #2081 · Agent-Task `codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60`

Product build: `dca95340aa978aedfb82b09feef878bf7ab401b9`, stacked on Memory Read `417c6fc509a1cfdb5730bb068308cc788add82cc`. Source `c7966d48680fa310734ea34aae60b29183ca0fe8` adds verification-driver fixes only; product source is unchanged from that build. Later review-artifact commits do not change product code.

## Actual captures

- Before: genuine macOS Desktop Home from product build `3f29dd4ae36db6fa89e72705d4cba8cf0cb33bd1`, 2522×1640, dark, Chinese. It shows the prior Home with composer and unread summary, without embedded creation or four cards. Its model setup label is not evidence of missing credentials: that Tob already had its own working plan.
- After: actual isolated Web on the product build above, 1440×900, dark, Chinese. Synthetic QA Bots differ from the baseline; these captures compare available surfaces, not pixels across platforms.
- Creation: the visible root blank form is embedded in Home, starts with a name and folded optional settings, and keeps Back to Home. A separate actual Web journey exercised section-plus entry, Git/ZIP source switches, independent draft restoration, then created a Bot and read its DM placement from the canonical roster owner.
- Dashboard: the four cards and exact range are real owner queries. The capture shows positive retained usage after a real official-model Turn, and actual Channel recency.
- Conversation: one Home submission produced the marked arithmetic reply through native `channel_send`; the Turn completed and its Human delivery became handled. A canonical snapshot observed the same Tob root live in working state during execution. Its first working screenshot retained the split layout and does not show the offscreen working card; source/rendered regressions independently cover that row.

## Verification

- Rebased candidate: 209 focused tests across 18 relevant core/client files, root TypeScript, lint, formatting, source/parity/ledger/ADR checks passed.
- One build passed; 7 built Client contract tests passed.
- Direct Human `home-dashboard` CLI passed exact 24h/7d/30d spans and one JSON document per command.
- Real Web dashboard: four cards, range selection, explicit refresh without a generated model report, recent Channel opens Messages alongside mounted Home; no browser errors.
- Real simple official-model Turn: exact one accepted Human message, live working root, `channel_send` outcome `ok`, completed Turn, handled delivery, positive retained usage; no browser errors.
- Prior product-equivalent creation Web: section destination and drafts survive blank/Git/ZIP switching; actual blank creation persists into the same section. Light/dark and supported 1024×650 scrolling/draft retention passed.
- Installed Gateway parser regression fails on the original default-parameter SRC signature and passes with an optional identifier and a default applied inside the method.

## Preserved failures and remaining gates

The first real Gateway SRC failure and first selector/locale failures remain preserved privately. An additional real `ask_user_question` call stayed pending without a canonical Channel question card; the test did not fabricate attention data. The Human CLI stopped that Turn. This existing question bridge path remains a separate diagnosis and is not a passed populated-attention proof.

An actual missing-model attempt failed before a successful UI capture, and its generic full-plan restoration RPC refused a missing Assignment choice. The original Profile default and exact Tob official Orchestrator route were restored through their owners. Missing-model runtime remains pending; rendered tests cover unavailable routing and per-Bot precedence.

Native macOS on this Home candidate is queued, and Human QA, full CI, populated pending-action/source navigation, degraded/partial usage runtime, actual Git/ZIP imports and final integrated-stack qualification remain separate gates. Existing owner/rendered tests cover unknown/partial/degraded and actual task recency. Below 961px the existing compact Bot DM route replaces Workspace/Home; this PR does not alter that viewport boundary. No merge or deployment is authorized.
