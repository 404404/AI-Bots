---
Status: Accepted in 404404/AI-Bots only
Date: 2026-10-29
---

# The independent application owns its main Bot identity

The user wants a stable coordination entry without DSH. The independent application's SQLite owner therefore stores one singleton reference to a normal Bot's stable UUID. A fresh or migrated data directory bootstraps that Bot once in a transaction; an existing Bot is never adopted by its display name, slug, persona, model output or supplied JSON flags. A reserved slug collision creates a different unused slug and preserves the existing Bot. A missing referenced Bot or invalid singleton fails explicitly instead of silently changing identity.

The main Bot persists through renames, refreshes and restarts. It cannot be deleted, replaced, demoted or promoted through ordinary Bot settings. Its identity enables only the explicitly implemented coordination interface; it does not give a model the authenticated Human owner's authority. The HTTP/CLI adapter supplies trusted owner context. Future model tools supply an execution-bound Bot context, and model arguments never select that context. Credentials, privilege changes, deletion, other Bots' history and memory require their own owner checks and grants. Persona text is never a policy.

The first slice exposes the persistent main entry and a real management catalog through Web, API and CLI. Catalog capabilities and activity are derived from implemented features and persisted Runs; it must not invent delegated tasks before the task owner exists. Subsequent delegation uses a separate task module with parent/child records and restricted input. Model sharing will use explicit server-side references and owner grants, without copying grants between Bots. Memory remains user-saved; no model memory write tool is implied by this decision.

Schema changes run transactionally with an explicit version, preserve existing Bot IDs and data, and are tested on v1 fixtures and private test directories before current data is touched. Identity/configuration revision and a non-secret execution snapshot make later role changes traceable. Image rollback and data rollback are separate: v1 code must refuse v2 data; recovery uses a validated private pre-migration backup. See [the delivery plan](../standalone-bot-expansion-plan.md) and [new acceptance cases](../acceptance/standalone-bot-expansion-test-cases.md). This is a fork decision, not an upstream BotHarness change.
