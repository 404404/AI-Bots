# Ask-secret CLI candidate: runtime evidence

This records the opt-in candidate for [#1380](https://github.com/BotHarness/DeepSeekBot/issues/1380), under [Spec #1378](https://github.com/BotHarness/DeepSeekBot/issues/1378). It does not close the issue or accept [proposed ADR-0164](../adr/0164-private-input-candidate-separates-native-storage-from-qualified-execution.md). [The runnable guide](../dev/guides/private-input-cli.md) describes the dedicated Profile and synthetic fixture.

## Observed behavior

Pinned DSH `0.2.0-rc.1` ran the actual Bundle in an isolated local Host. The visible Web DM of a real PersonaBot declared three required confidential strings. The Owner submitted through the inline card, inputs cleared, native Credentials Service persisted one atomic grant, and the Bot received opaque references. Existing approval supported approve-once, rejection and a confirmed broad remembered allowance.

The immutable `http-status-v1` Node CLI consumed references after Host authorization and performed a real GET against the controlled loopback service. Two real Bot runs returned HTTP 200 in their originating DMs; the fixture independently counted two authenticated requests. The fixture echoed raw and base64 synthetic secrets in response headers/body; the CLI discarded these and returned only status and HTTP success. HTTP success alone does not certify arbitrary remote authentication.

Another real PersonaBot tried the first Bot's references with broad approval. The Host refused the grant before an HTTP request; fixture counts did not change. A rejected ordinary bash approval also caused no execution. The final native bash invocation returned actual `ordinary-cli-ok`, UID 65534 and `/tmp` through the real model path, after correcting the pinned native foreground-result union contract.

## Boundary qualification

The passive task-local fetch probe observed nine actual serialized DeepSeek `/messages` bodies, including requests after private submission: zero matches for the published raw, base64 and URL-encoded canaries. The adapter's source was checked to establish that this hook sees the assembled body passed to `fetch`; the probe did not capture bodies or authentication headers. Later review-card setup requests are additional to this fixed evidence checkpoint.

The all-frame native Session/artifact scan at that checkpoint inspected 1,178 files, 232 Session events, four request headers and 18 tool results. Synthetic values were present in the native credential store; there were no matches elsewhere in the isolated home. This includes ordinary Channel persistence, persisted model data/errors, developer logs and any created Spill. Native credentials and the exact task-owned synthetic instrumentation file are explicit exclusions. These finite canary checks do not establish protection against every encoding or provider.

Deterministic active Docker qualification attempted exact Host-file and base64 reads, environment inspection, Docker-socket access and loopback service access through actual arbitrary commands. The Host file, socket and network were unavailable, and no credential/provider canary appeared in the result. This is execution-boundary evidence; a model declining an extraction instruction is not treated as proof.

## Checks and limitations

- Build, lint, typecheck, formatting, bilingual release-ledger and Skill-ledger checks passed.
- Focused regression coverage: 57 passed, one Docker test skipped in the ordinary run. With Docker qualification explicitly enabled, all three execution tests passed.
- The full suite is not green on this Windows host. Native bridge fixture cleanup hit `EPERM` deleting temporary SQLite files; the same 61-test bridge failure was reproduced on the detached base revision `366ade8b`. Other full-suite checks were not all completed, so this is not an assertion that every failure is pre-existing.
- One earlier retained QA Session failed native `REQUEST_EXTENSION` preparation while tool definitions were changing. Fresh real Bot Sessions and the final private flow succeeded; restoration of that earlier Session has not been qualified.
- Protected-Profile ordinary MCP, Host workspace/cwd, Windows shell and persistent/background Job behavior remain unqualified. The candidate refuses those capabilities rather than claim isolation. This does **not** satisfy the requirement that normal CLI/MCP retain their original behavior in the same Profile.
- No production deployment, external email, production IM receiver, server change or sibling slice was performed. Rotation/revocation and later lifecycle cases remain separate issues.

## Human review

Screenshots come from the real base checkout and candidate Host at 1280 × 800, Chinese locale, in both themes. The baseline is the prior DM entry point without a private-input card. The candidate adds a pending inline card and a configured state followed by the actual same-DM result. Existing native question-card composition and native Input/Button primitives were reused; there is no separate settings page or added design-system dependency.

| State                 | Dark                                    | Light                                    |
| --------------------- | --------------------------------------- | ---------------------------------------- |
| Base entry point      | [Before](evidence/1380/before-dark.png) | [Before](evidence/1380/before-light.png) |
| Pending private input | [After](evidence/1380/input-dark.png)   | [After](evidence/1380/input-light.png)   |
| Configured and result | [After](evidence/1380/result-dark.png)  | [After](evidence/1380/result-light.png)  |

The task-local candidate Host and controlled fixture were retained with a fresh pending card for Human interaction. Human feedback is required before extending other consumers; it does not remove the open compatibility and security qualification gates.
