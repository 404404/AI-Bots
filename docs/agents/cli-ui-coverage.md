# UI-setting and action coverage through the CLI

The management entry for Tob is the DSB CLI. A Human CLI command being available does **not** grant Tob authority to execute it. The Host still verifies the execution context, target scope, approval and revision. The first replacement slice (#2087) authorizes only the reviewed native Assignment concurrency setting; the remaining capabilities are separately delivered under #2081.

## Maintained inventory

[`scripts/cli-ui-inventory.json`](../../scripts/cli-ui-inventory.json) records reviewed source surfaces with an owning scope and exactly one of:

- Existing CLI commands. These are command mappings, not claims of live/runtime verification or Tob access.
- A specific open delivery issue for the gap.
- A reasoned **nonconfigurable** exemption: media transport, rendering, draft recovery or tutorial/read receipts. Configurable preferences are never exempted merely because they live in a Client service.

The existing [`cli-parity-baseline.json`](../../scripts/cli-parity-baseline.json) remains the bridge/Host-route/Bot-tool baseline. Its #1690 gaps and justified running-Agent/UI-only exceptions are preserved. The supplemental inventory does not duplicate or waive that check.

`pnpm lint` runs both through `scripts/check-cli-parity.mjs`. The supplemental parser reads TypeScript/JSX syntax rather than searching comments or example strings. It discovers:

- Registered HTTP route objects, including imported path constants, shorthand `path`, computed expressions, prefix handlers and helper calls with an HTTP method. Finite `for…of` route families include their iterable in the identity, so adding a new action requires review.
- Client `setItem`/`removeItem` calls, including optional chaining, computed storage keys and storage injected into a service.
- Shared `SettingsRow` controls and scoped `field` controls (including Browser target/driver controls), even when their change handler calls a native Client service rather than a bridge.
- Native setting field declarations ending in `_FIELD`, including Computer settings declared outside the Client directory. Client persistence detection also covers sibling Browser/Computer Client modules.

New surfaces fail lint without a mapping; removed surfaces fail until their inventory entry is reviewed. Mapped command names must still exist in CLI sources. An exemption requires an explicit `configurable: false` declaration as well as a reason. A group records individual discovered surfaces; it is not a filename wildcard that silently accepts new settings.

This is a structural regression guard, not a whole-program proof. A new persistence API, custom control primitive, native service adapter or route factory must extend extraction and focused tests in the same PR. Dynamic route functions retain their source expression for review; the checker does not execute them or claim every runtime expansion is understood. Browser-origin state and native settings must be checked on the target Client in addition to the Host.

## Coverage and remaining slices

| User surface                                                                                               | Existing Human CLI / missing work                                                                                                      | Owner / next slice                                                      |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Assignment limit, motion, icon, send key, session visibility, invite acceptance, sorting                   | `settings`, `settings-set` cover the native `botharness-client` fields; Tob starts with the Assignment limit only                      | Host Settings; #2087, #2088, #2094, #2095                               |
| Bot creation, identity, lifecycle, appearance and Zip transfer                                             | Existing create/update/profile commands; Zip export and file-list inspection still need parity                                         | Registry and Git Memory; #2089                                          |
| Channels, members, nicknames and history                                                                   | Existing channel/group/member/purge commands; group avatar and attachment upload remain gaps                                           | Channel owners; #2090                                                   |
| Other Bots' memory                                                                                         | Existing Memory read/write/history commands; authorized Tob-owned Assignment access and mutation approval remain separate capabilities | Git Memory; #2091, #2092                                                |
| Schedules                                                                                                  | Existing schedule CRUD, preview and history commands; authorized cross-Bot management is not implicit                                  | Scheduler; #2093                                                        |
| Approval templates, workspace grants, Browser and Computer control                                         | Existing CLI owners; Browser profile pair/forget, daily connect/grant/return, borrow pair/return have uncovered computed HTTP routes   | Host capabilities and approval owners; #2094                            |
| Model setup                                                                                                | Existing `home-model-set` and model-plan commands; extend scoped management under its own slice                                        | Native model Settings; #2088                                            |
| Theme, locale, desktop notifications, DM trace visibility, file-opening preferences, companion preferences | Native-field cases already covered; Client-local services require a target-Client command and readback                                 | Client; #2095                                                           |
| Global and Channel Dock layout, folder/view choices and local migration backups                            | No complete CLI operation for the target Client; Host roster commands do not cover Client-only layout                                  | Client / Channel; #2096                                                 |
| Shortcut bindings and native shortcut migration                                                            | No complete target-Client command, conflict validation and reload path                                                                 | Client; #2097                                                           |
| Device pairing, offers, revocation                                                                         | Constant/computed HTTP routes currently lack direct management commands                                                                | Profile; #2098                                                          |
| Online profile backup, inspection, recovery authorization and activation                                   | Existing offline portability is not parity for this online UI                                                                          | Profile; #2099                                                          |
| Marketplace search and import workflow                                                                     | Existing catalogue/import commands are reused, then made available to an eligible Tob invocation                                       | Marketplace / Registry; #2100                                           |
| Git install, telemetry choice and external messaging defaults/apps                                         | Existing CLI commands remain the management owners; no duplicate settings store                                                        | Existing #1690 coverage, authorization expanded by applicable Tob slice |
| Diagnostic bundle/preview and Client diagnostics                                                           | Constant HTTP routes need a complete direct agent path                                                                                 | Existing CLI gap tracker #1690                                          |

## Updating the inventory

For each new UI setting or action, identify its durable owner and scope first. Reuse its existing CLI command when equivalent; otherwise record the smallest delivery issue. A combined group is acceptable only while all recorded members share the same mapping or gap. Split a group when one operation becomes covered, remove stale mappings, and preserve precise nonconfigurable exceptions.

For Client settings, acceptance must prove which Client changes, a reload/restart readback, and that another Client or Channel is unaffected. For Host mutations, test the direct CLI independently of the model, then the real Tob conversation and canonical readback. Approval, revoked/stale context, unsupported operations and failed readback remain coded outcomes, never fallback access.
