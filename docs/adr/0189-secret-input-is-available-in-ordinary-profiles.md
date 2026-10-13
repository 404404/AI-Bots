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
- **Store guard, two layers.** DSH already runs every Shell command inside an OS sandbox that limits writes. In an ordinary Profile the Host adds one rule to that sandbox: the credential store cannot be read. On macOS this is a Seatbelt `deny file-read*` for the store; under bwrap the store is masked with an empty file. The kernel enforces it, so a command reaches the same refusal however it names the file. As a second layer the Host refuses Agent file tools whose target is the store or the DSH home that holds it, and Shell commands that name the store in their text. Both layers apply after a Human approval too, to every Agent in the Profile.
- **Protected Profile, still opt-in.** `privateInputExecution` keeps the ADR-0164 boundary unchanged for anyone who needs it.

A Profile that holds private grants without the opt-in no longer has its Shell locked. That lock existed because such a Profile could not consume its grants safely; it now can.

## What the default tier does not promise

The kernel rule exists only where DSH's sandbox wraps the command with a runner the Host recognises. It does not exist when a command runs in `danger-full-access` mode, where DSH does not consult the sandbox, under the Landlock runner, or on Windows, whose sandbox does not confine reads. There only the text layer applies, and it recognises the store by name and path in the command text; a command that reaches the file through a variable, a traversal or a script is not recognised. The rule is added by rewriting the command line the sandbox provider returns, because DSH's sandbox policy has no vocabulary for a protected read path; a change in that command line's shape makes the rewrite a no-op rather than an error. Both gaps are reasons to ask DSH for a first-class protected-read path.

Storing the value in the OS keychain would not replace this while the Host is launched from a command line: the keychain authorizes by program, and an Agent's Shell can run the same programs.

The default tier therefore promises that the model does not receive a secret in normal use and that, where the sandbox rule applies, an Agent's Shell cannot read the store. The protected Profile remains the answer where that is not enough.

## Consequences

- Using a secret happens in the Host, never by substituting a value into a model-written command. Two consumers exist: the fixed `http-status-v1` check, and `secret_http` (`http-request-v1`), which lets a Bot call an HTTP API. For `secret_http` the destination is a field the Owner typed into the card; the Bot chooses only a path under it, the method, and where each secret goes through `{{field}}` placeholders in headers, query values or the body. Redirects are refused, plain http is allowed only for a local endpoint, and the response text is returned with the secret values masked in their raw, base64 and URL-encoded forms. Masking is a courtesy against accidental echo, not a boundary: a service that returns a transformed secret is not caught. The request needs the existing Human execution approval, whose card shows references and placeholders, not values.
- ADR-0164's statement that stored grants fail closed when the opt-in is disabled no longer applies.
