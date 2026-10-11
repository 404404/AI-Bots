# Private input CLI candidate

This is the opt-in #1380 qualification path, not a completed v1.3 capability. It demonstrates a real PersonaBot, inline Web input, native storage, existing approval and a fixed reference-consuming CLI. [ADR-0164](../../adr/0164-private-input-candidate-separates-native-storage-from-qualified-execution.md) records the proposed execution boundary and open acceptance gates.

Use a dedicated, isolated DSH home with pinned `0.2.0-rc.1`, Docker running Linux containers, and the exact image below. Do not enable this candidate on a production or shared home. It changes all Agent tool access in this Profile, including native Sessions and other Bots.

```powershell
pnpm install --frozen-lockfile
pnpm build
docker pull node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 31380
```

Add this complete config to that isolated Profile's existing `botharness-core` patch, preserving any other intended config keys. Patch replacement is not a deep merge. Stop the launcher's exact PID and restart the same isolated Profile through the helper.

```yaml
- id: botharness-core
  config:
    privateInputExecution: true
    telemetry: false
```

Start the controlled service in a second task-owned terminal:

```powershell
node scripts/ask-secret-fixture.mjs 31381
```

Open the authenticated Web URL printed by the helper, create/select a real PersonaBot with a working model, and send this through its visible DM composer:

```text
Call ask_secret for account synthetic-1380, with three required fields:
endpoint labeled Private URL, api_key labeled API key,
api_secret labeled API secret. After private submission, call protected_cli
consumer http-status-v1 using the returned references and the same account.
Report the actual HTTP status in this DM using channel_send.
```

Fill the inline password fields with these synthetic values only:

| Field       | Synthetic value                                             |
| ----------- | ----------------------------------------------------------- |
| Private URL | `http://127.0.0.1:31381/status?marker=SYNTHETIC-1380-url-A` |
| API key     | `SYNTHETIC-1380-key-A`                                      |
| API secret  | `SYNTHETIC-1380-secret-A`                                   |

Click **Submit privately**. Fields must clear immediately, terminal status must become configured, and the next existing execution approval card must contain only `private:<grant UUID>:<field>` references. Approve once. The Bot must report HTTP 200 in this same DM; `/evidence` on the fixture must increment `authenticated`. Its response deliberately echoes both raw and base64 canaries in body/headers, which the trusted CLI discards.

Repeat execution with references without another input request; reject once and verify no service request occurs. Then exercise the existing broad remembered allowance, including its confirmation, and repeat. Broad approval is execution convenience only: another real Bot using the references must receive a safe grant refusal before the fixture count changes. Missing refs, a wrong account, unsupported consumers and unavailable Docker must fail safely.

Ordinary `bash` uses its native Consumer and approval without ask-secret. Its scoped LinuxShell Provider starts the container through native Subprocess argv, mounts the currently authorized canonical root at `/workspace`, and translates cwd. Bot Memory and current writable Workspace Grants provide authority; a root containing the Host home is rejected. Only the exact Bot Memory subtree may be mounted from within that home. Roots overlapping linked Host Bundle code, its interpreter, Profile data or the Host temporary-directory root are rejected to prevent credential reads and later Host execution of Agent-written code. Request `printf 'linux-workspace-ok\n' > proof.txt; cat proof.txt; pwd; id; printf 'native-error-stream\n' >&2; exit 7` in the DM. Verify persisted file contents, cwd `/workspace`, UID 65534, separate stderr and actual exit code 7. Normal container network access is available, but no Host credentials, ambient environment or Docker socket are forwarded. Git metadata is read-only to prevent Agent-written hooks/config from being executed later by Host Git.

Configure an ordinary nonsecret MCP demo through the existing opt-in Profile, then stop the launcher's exact Host PID and restart it with the same helper:

```powershell
node scripts/setup-private-input-mcp-demo.mjs <isolated-DSH_HOME>
```

The setup preserves other patch entries and installs `privateInputMcpServers` with the published demo source. Request `mcp__linux_demo__workspace_probe` from the same real Bot; it must read `linux-workspace-ok` from the file above, report `/workspace`, UID 65534 and `hostCredentialEnvironment:false`. This uses the native MCP Client and stdio SDK. Its protocol-negotiation probe siblings share an owner label for cleanup; no fixed container name is reused. Qualification checks exact native ToolDefinition identity and current workspace authority. Reconnect/new generations fail closed and require reactivation. Two real Bots may use the same server name in separate native Agent Scopes; the published build must share DSH Scope with the Host.

`privateInputMcpServers` declares a serverName, Guest command/args and optional Host-side authorized workdir. Guest executables must exist in the pinned image or mounted workspace. It does not inject secret references or support arbitrary Host/HTTP MCP servers. Windows commands, unrestricted Host file tools, background Jobs, Git metadata writes, Browser, Computer and delegation remain unqualified in this Profile. Default Profiles without private grants keep their original invocation paths. This local qualification used a Windows Host with Linux containers; Linux-server workspace permissions and full compatibility remain #1386.

The CLI can also settle the same inline private card using the authenticated Owner carrier:

```text
deepseekbot ask-secret-status <dm-channel-id> --message-id <card-id> --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-submit <dm-channel-id> --message-id <card-id> --values-stdin --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-cancel <dm-channel-id> --message-id <card-id> --host <origin> --token-file <private-token-file>
```

Supply a JSON object of declared field IDs and confidential strings over stdin from a trusted input source; do not put values in arguments, shell history or repo files. Submission returns only `{accepted:true}`, status returns only the status, and errors do not echo values or Host error payloads. Submission is never retried automatically. Ordinary `user-question-answer --answer-stdin` retains its existing nonsecret answer JSON contract; ordinary question answers are durable model-visible content.

Run deterministic active extraction independently of any model's willingness to attempt it:

```powershell
$env:BOTHARNESS_PRIVATE_DOCKER_QA = '1'
pnpm exec vitest run packages/core/test/protected-execution.test.ts --maxWorkers=1
pnpm exec vitest run packages/core/test/linux-execution.test.ts packages/core/test/linux-mcp.test.ts --maxWorkers=1
```

This checks both the stricter unmounted command world and the mounted Linux world: Host-file/base64, environment, Docker socket, Git metadata protection and authorized file persistence. It also exercises the actual native MCP SDK and fixed-CLI output against an echoing service. The ordinary suite skips Docker qualification when the opt-in environment variable is absent.

Qualification also inspects actual model request bodies, persisted request headers/messages/results/errors, ordinary Channel history, developer logs and Spill using synthetic raw, URL-encoded and base64 patterns. Native credential records and task-owned synthetic instrumentation are allowed destinations; publishing their contents is unnecessary. A model refusing an extraction prompt is not boundary evidence. Node's one-shot zstd decompressor reads one concatenated frame at a time: advance by `engine.bytesWritten` to scan the entire native Session artifact, not only its header.

For the pinned DeepSeek `/messages` adapter, launch the isolated helper with a process-local `NODE_OPTIONS=--import=<file URL of scripts/ask-secret-wire-probe.mjs>` and `BOTHARNESS_PRIVATE_WIRE_EVIDENCE=<task-owned evidence file>`, then restore those environment variables in the launching terminal. The passive probe leaves requests unchanged and writes only request sizes and synthetic-match counts, never bodies or authentication headers. Confirm it observes requests after private submission. The trusted credential CLI scrubs these environment variables. This instrumentation qualifies this adapter and these fixed canaries, not every provider or arbitrary encoding.

```powershell
node scripts/scan-private-input-evidence.mjs <isolated-DSH_HOME>
```

The scan must report `nativeStoreContainsSyntheticValues: true` and no violations. A task-local probe embedded in the home may contain the published synthetic strings; only the exact fixture instrumentation filename is excluded alongside the native credential store. Export reviewable native events with `node scripts/export-private-input-evidence.mjs <isolated-DSH_HOME> <session-id> <output.json>`. This reads every compressed frame and projects linked declaration/reference/approval/status facts; it omits raw Session messages, reasoning, commands, paths, headers and errors. The PR includes the allowlisted event artifact, not the full private Session.

The request supports 1–8 dynamic confidential strings, preserving significant whitespace, with no defaults or original-value readback. References are bound to the actual live Orchestrator, Bot creation identity and account. The three-field schema belongs only to `http-status-v1`; it is not an email/provider configuration model. Host failure diagnostics contain stable phases, request/Bot/Session identifiers and durations, never raw values or subprocess errors.

Do not disable/remove the Plugin or revert to an older binary while private grants remain. Restore the isolated pre-trial home or purge only application-owned native grants before rollback. Rotation/revocation, Schedule reuse, IM initiation, credential-consuming MCP and Linux-server verification require their separate slices and Human feedback on this first candidate.
