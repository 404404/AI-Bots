---
Status: Accepted
Date: 2026-10-13
Issues: [#1562](https://github.com/BotHarness/DeepSeekBot/issues/1562), [#1378](https://github.com/BotHarness/DeepSeekBot/issues/1378)
---

# Secret input is available in ordinary Profiles

ADR-0164 made `ask_secret` an opt-in of a dedicated Profile: `privateInputExecution` fences every Agent tool, runs the Bot's Shell in a Docker container, and needs a pinned image. Its reason holds: the native credential store is a file of the same OS user, so a reference alone does not stop an Agent that can read that file. Its cost is that an ordinary user never gets the feature. The owner's direction is that asking for a secret must work by default, without Docker, and that the protection to aim for is control of reads and writes of the credential file, as with any environment file on the user's machine.

## Decision

Secret input has two tiers that share one card, one store and one reference format.

- **Ordinary Profile, the default.** An Orchestrator has `ask_secret`, the fixed `protected_cli` consumer and `secret_http`. Values go to the native Credentials Service bound to the requesting Bot and account; the Channel and the model get opaque references only; only the authenticated Owner can submit. The fixed consumer already runs in a Host child process, not in the container, so it needs no Docker.
- **Store guard.** In an ordinary Profile the Host refuses Agent file tools whose target is the credential store or the DSH home that holds it, and refuses Shell commands that name the store. The refusal is a tool guard, so it applies after a Human approval too, to every Agent in the Profile.
- **Protected Profile, still opt-in.** `privateInputExecution` keeps the ADR-0164 boundary unchanged for anyone who needs it.

A Profile that holds private grants without the opt-in no longer has its Shell locked. That lock existed because such a Profile could not consume its grants safely; it now can.

## What the default tier does not promise

The store guard recognises the store by name and path in the command text. Storing the value in the OS keychain would not change this while the Host is launched from a command line: the keychain authorizes by program, and an Agent's Shell can run the same programs. The stronger control is a kernel-enforced read denial for the store in the sandbox DSH already wraps every Shell command in; on macOS a hand-written Seatbelt rule was verified to refuse direct, indirect and copied reads of one file. DSH's sandbox policy has no such vocabulary today, so this is follow-up work with upstream. A Shell command that reaches the file another way, for example through a variable, a parent-directory traversal or an interpreter script, is not recognised, and Shell commands outside authorized folders already need Human approval. The default tier therefore promises that the model does not receive a secret in normal use, not that a compromised Agent with an approved Shell command cannot extract one. The protected Profile remains the answer for that threat.

## Consequences

- Using a secret happens in the Host, never by substituting a value into a model-written command. Two consumers exist: the fixed `http-status-v1` check, and `secret_http` (`http-request-v1`), which lets a Bot call an HTTP API. For `secret_http` the destination is a field the Owner typed into the card; the Bot chooses only a path under it, the method, and where each secret goes through `{{field}}` placeholders in headers, query values or the body. Redirects are refused, plain http is allowed only for a local endpoint, and the response text is returned with the secret values masked in their raw, base64 and URL-encoded forms. Masking is a courtesy against accidental echo, not a boundary: a service that returns a transformed secret is not caught. The request needs the existing Human execution approval, whose card shows references and placeholders, not values.
- ADR-0164's statement that stored grants fail closed when the opt-in is disabled no longer applies.
