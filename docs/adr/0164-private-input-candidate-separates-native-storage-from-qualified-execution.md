---
Status: Proposed
Date: 2026-10-11
Issues: [#1378](https://github.com/BotHarness/DeepSeekBot/issues/1378), [#1380](https://github.com/BotHarness/DeepSeekBot/issues/1380)
---

# Private input separates native credential storage from qualified execution

The #1380 candidate reuses DSH Credentials Service for original values and uses an application-defined owner for PersonaBot/account binding and inline multi-field requests. A reference alone cannot protect a secret from an Agent that can read the native same-user credential file. The candidate therefore qualifies both the trusted CLI and every model-controlled path that could reach its Host, instead of substituting plaintext into an arbitrary Shell command.

One native `CredentialKey` holds one atomic multi-field grant, including the requesting Bot's creation identity and account. Channel history contains declarations and terminal status/references only; live requests belong to the actual Orchestrator Agent and are not restored as waiters. The authenticated Typert invocation peer, rather than a supplied actor label, establishes Owner authority. DSH's Human-only secret authorization prompt is relevant prior art; ordinary question-answer persistence is unsuitable. Its scalar prompt does not supply this multi-field Channel contract, so the candidate renders a BotHarness card while retaining native storage authority.

The only credential consumer is an immutable Node CLI that receives the three selected fields through stdin, performs one GET to the Owner-supplied endpoint, forbids redirects, discards response body/headers/stderr, and returns bounded HTTP status/request success. HTTP success alone does not certify the remote service's authentication. The controlled fixture independently checks the two credentials. The model controls references, never executable text, headers, environment or field substitution in this consumer. Existing execution approval runs before resolution; broad approval never grants another Bot's credential authority.

Opting into `privateInputExecution` fences the entire isolated Profile: native `bash` keeps its invocation and approval entry point but runs in an ephemeral Linux container with no Host mounts or network, and other unqualified Host capabilities are refused across Bot and native Sessions. The local native Sandbox is insufficient because it does not isolate secret reads. Stored private grants also prevent disabling the fence in the same implementation. A dedicated DSH home is required: shared, independently running or older unfenced Hosts are outside this qualification.

This is **Proposed**, not an accepted replacement for ordinary CLI/MCP behavior. The container lacks the native working directory, persistent workspace, Windows Shell and background Jobs; ordinary MCP pass-through in the protected Profile is not qualified. Those gaps keep #1380 open. Human feedback must establish whether this bounded execution shape is acceptable or whether a different isolation seam is required before expanding consumers. The Feishu-specific glossary definition of Credential reference remains unchanged until the generalized product term is deliberately accepted.

Rejected alternatives are hidden inputs followed by arbitrary-command env injection, exact-value masking, and a second plaintext store in Memory/config/SQLite. None prevents active extraction or preserves the native credential authority. Keeping unrestricted Host tools beside same-user credential storage also fails this boundary. Rotation, revocation and active-use stop remain #1382; concurrent settlement is #1381; Schedule, MCP and IM qualification remain their own slices.

Rollback after storing grants requires purging only application-owned native grants or restoring the isolated pre-trial home before running an older/unfenced binary. Reverting code alone restores a model-readable Host filesystem alongside persistent values. Trusted Owner, Host Plugins, Docker daemon/image and fixed CLI code remain trusted; this candidate does not isolate credentials from those administrators or certify arbitrary third-party consumers. See the [runnable qualification guide](../dev/guides/private-input-cli.md).
