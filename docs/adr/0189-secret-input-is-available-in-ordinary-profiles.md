---
Status: Accepted
Date: 2026-10-13
Issues: [#1562](https://github.com/BotHarness/DeepSeekBot/issues/1562), [#1378](https://github.com/BotHarness/DeepSeekBot/issues/1378)
---

# Secret input is available in ordinary Profiles

ADR-0164 made `ask_secret` an opt-in of a dedicated Profile: `privateInputExecution` fences every Agent tool, runs the Bot's Shell in a Docker container, and needs a pinned image. Its reason holds: the native credential store is a file of the same OS user, so a reference alone does not stop an Agent that can read that file. Its cost is that an ordinary user never gets the feature. The owner's direction is that asking for a secret must work by default, without Docker, and that the protection to aim for is control of reads and writes of the credential file, as with any environment file on the user's machine.

## Decision

Secret input has two tiers that share one card, one store and one reference format.

- **Ordinary Profile, the default.** An Orchestrator has `ask_secret` and the fixed `protected_cli` consumer. Values go to the native Credentials Service bound to the requesting Bot and account; the Channel and the model get opaque references only; only the authenticated Owner can submit. The fixed consumer already runs in a Host child process, not in the container, so it needs no Docker.
- **Store guard.** In an ordinary Profile the Host refuses Agent file tools whose target is the credential store or the DSH home that holds it, and refuses Shell commands that name the store. The refusal is a tool guard, so it applies after a Human approval too, to every Agent in the Profile.
- **Protected Profile, still opt-in.** `privateInputExecution` keeps the ADR-0164 boundary unchanged for anyone who needs it.

A Profile that holds private grants without the opt-in no longer has its Shell locked. That lock existed because such a Profile could not consume its grants safely; it now can.

## What the default tier does not promise

The store guard recognises the store by name and path in the command text. A Shell command that reaches the file another way, for example through a variable, a parent-directory traversal or an interpreter script, is not recognised, and Shell commands outside authorized folders already need Human approval. The default tier therefore promises that the model does not receive a secret in normal use, not that a compromised Agent with an approved Shell command cannot extract one. The protected Profile remains the answer for that threat.

## Consequences

- The only consumer is still `http-status-v1`. A general way for a Bot to call an API with a secret is separate work; any such consumer must run in the Host with the destination fixed by the Owner, never by substituting a value into a model-written command.
- ADR-0164's statement that stored grants fail closed when the opt-in is disabled no longer applies.
