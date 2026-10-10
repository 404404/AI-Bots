# Private input CLI candidate

This is the opt-in #1380 qualification path, not a completed v1.3 capability. It demonstrates a real PersonaBot, inline Web input, native storage, existing approval and a fixed reference-consuming CLI. [ADR-0164](../../adr/0164-private-input-candidate-separates-native-storage-from-qualified-execution.md) records the proposed execution boundary and open acceptance gates.

Use a dedicated, isolated DSH home with pinned `0.2.0-rc.1`, Docker running Linux containers, and the exact image below. Do not enable this candidate on a production or shared home. It changes all Agent tool access in this Profile, including native Sessions and other Bots.

```powershell
pnpm install --frozen-lockfile
pnpm build
docker pull node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
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

Ordinary `bash` remains callable without ask-secret in this candidate, but executes only ephemeral Linux foreground commands in `/tmp`, with no Host workspace, network or persistent Jobs. Request `printf 'ordinary-cli-ok\n'; id; pwd` through the DM, approve it, and inspect the actual result. `pwsh`, file tools, MCP, Browser, Computer and delegation are unqualified and refused in this protected Profile. Default Profiles without private grants retain their original invocation paths. **Ordinary MCP pass-through in the protected Profile is still an open #1380 gate.**

Run deterministic active extraction independently of any model's willingness to attempt it:

```powershell
$env:BOTHARNESS_PRIVATE_DOCKER_QA = '1'
pnpm exec vitest run packages/core/test/protected-execution.test.ts --maxWorkers=1
```

This executes arbitrary commands through the real container boundary, attempts Host-file/base64, environment, Docker-socket and loopback-network extraction, and checks fixed-CLI output against an echoing service. The ordinary suite skips Docker qualification when the opt-in environment variable is absent.

Qualification also inspects actual model request bodies, persisted request headers/messages/results/errors, ordinary Channel history, developer logs and Spill using synthetic raw, URL-encoded and base64 patterns. Native credential records and task-owned synthetic instrumentation are allowed destinations; publishing their contents is unnecessary. A model refusing an extraction prompt is not boundary evidence. Node's one-shot zstd decompressor reads one concatenated frame at a time: advance by `engine.bytesWritten` to scan the entire native Session artifact, not only its header.

For the pinned DeepSeek `/messages` adapter, launch the isolated helper with a process-local `NODE_OPTIONS=--import=<file URL of scripts/ask-secret-wire-probe.mjs>` and `BOTHARNESS_PRIVATE_WIRE_EVIDENCE=<task-owned evidence file>`, then restore those environment variables in the launching terminal. The passive probe leaves requests unchanged and writes only request sizes and synthetic-match counts, never bodies or authentication headers. Confirm it observes requests after private submission. The trusted credential CLI scrubs these environment variables. This instrumentation qualifies this adapter and these fixed canaries, not every provider or arbitrary encoding.

```powershell
node scripts/scan-private-input-evidence.mjs <isolated-DSH_HOME>
```

The scan must report `nativeStoreContainsSyntheticValues: true` and no violations. A task-local probe embedded in the home may contain the published synthetic strings; only the exact fixture instrumentation filename is excluded alongside the native credential store.

The request supports 1–8 dynamic confidential strings, preserving significant whitespace, with no defaults or original-value readback. References are bound to the actual live Orchestrator, Bot creation identity and account. The three-field schema belongs only to `http-status-v1`; it is not an email/provider configuration model. Host failure diagnostics contain stable phases, request/Bot/Session identifiers and durations, never raw values or subprocess errors.

Do not disable/remove the Plugin or revert to an older binary while private grants remain. Restore the isolated pre-trial home or purge only application-owned native grants before rollback. Rotation/revocation, Schedule reuse, IM initiation, ordinary/protected MCP and Linux-server verification require their separate slices and Human feedback on this first candidate.
