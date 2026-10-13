---
Status: Accepted
Date: 2026-10-13
Issues: [#1585](https://github.com/BotHarness/DeepSeekBot/issues/1585), [#1562](https://github.com/BotHarness/DeepSeekBot/issues/1562)
---

# The Docker-protected Profile is removed

ADR-0164 introduced secret input as an opt-in of a dedicated Profile, `privateInputExecution`, that ran the Bot's Shell and its MCP servers in a Docker container and refused every other Host tool. ADR-0170 added a fixed MCP consumer inside that boundary. ADR-0189 then made secret input available in every Profile without Docker, and ADR-0191 added a command-line consumer there. The protected Profile stayed as an optional stronger tier.

It needed Docker and a pinned image, changed every Agent tool in the Profile, and never left qualification. With the default tier in place it meant two execution paths, two test suites and two sets of guides for a mode the owner does not expect ordinary users to run. The owner decided to remove it.

## Decision

`privateInputExecution` no longer does anything. The container Shell, the container MCP runner with `privateInputMcpServers`, the fixed private MCP tool, and the rule that refused unqualified Host tools are removed, with their tests and guides.

Kept, because none of it depended on Docker: `ask_secret` and its card, native credential storage and Bot binding, `protected_cli` with its fixed status check, `secret_http`, `secret_cli`, the credential store guard, account replacement and revocation, scheduled reuse, the Owner CLI verbs, and private input started from an IM conversation and filled in Web Chat (`privateInputWebUrl`).

A Profile that still sets `privateInputExecution: true` starts as an ordinary Profile and logs a warning that its Agent tools are no longer fenced by a container. Stored grants stay usable.

## What is lost

The container was the only boundary that held where the default tier has just the command-text guard: on Windows, under the Landlock runner on Linux, and for a command run in `danger-full-access` mode. No stronger option remains for those cases. Someone who needs one runs the whole Host inside a container or a separate OS user they manage themselves.

The fixed MCP consumer goes with the boundary it was qualified in. A Host-launched MCP server that receives secrets in its environment remains an open question in #1571.

The IM-started flow was qualified with a real IM App only inside the protected Profile. Its Host code is unchanged, but it has not been run against a real App since this removal.

## Consequences

ADR-0164's storage, binding and settlement decisions stand; its execution boundary is superseded by ADR-0189 and this record. ADR-0170 is superseded.
