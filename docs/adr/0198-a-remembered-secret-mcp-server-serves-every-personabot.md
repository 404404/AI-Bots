---
Status: Accepted
Date: 2026-10-14
Issues: [#1613](https://github.com/BotHarness/DeepSeekBot/issues/1613), [#1606](https://github.com/BotHarness/DeepSeekBot/issues/1606)
---

# A remembered secret MCP server serves every PersonaBot

ADR-0196 let the Human remember an approved MCP server for the Bot that asked for it. Its secret, like every private grant since ADR-0164, could be used only by the Bot that requested it. A second Bot that needed the same integration had to be asked to set it up and the Human had to enter the secret again. The owner decided that an MCP server is a common capability of the Profile: once set up, every Bot should be able to call it.

## Decision

Choosing allow and remember on the start card makes the server available to every PersonaBot in the Profile.

- Each Bot's Orchestrator Session runs its own server process. Bots whose Session is running when the server is remembered get it at once; the others when their Session starts. A new Bot gets it too.
- The Host starts each process with the secret of the Bot that set the server up. The other Bots receive the server's tools. They do not receive the references and cannot use the secret through `secret_http`, `secret_cli` or a start of their own.
- Every process is a registered use of that one grant. Revoking the account stops the server for every Bot; deleting the Bot that set it up erases the record and stops it everywhere.
- The Bot's settings list the server under every Bot, name the Bot that set it up, and remove it for all.
- Allow once stays private to the Bot and Session that asked.

## What this changes

Until now a private grant was usable only by the Bot it was given to. A remembered MCP server is the one exception: the Human's choice on the card extends that grant, for that exact start, to the Profile's other Bots. The card and the settings row say so.

A Bot that takes part in Groups or external IM conversations can now be steered by other people into calling a server set up for a different Bot. Each tool call still goes through the ordinary approval unless the Human saved a rule for it or turned on full access.

Tool results are masked for every Bot as before. The sharing is per Profile; there is no per-Bot selection in this decision.
