# GUI Container acceptance record

This record distinguishes repository tests, CI runtime checks, and live GK50 deployment checks. GK50 is the sole deployment target; DSM is outside this task and is not a prerequisite. Credentials, launch tokens, message bodies, local hostnames beyond the named target, and private DSH paths are excluded.

## Current release: 2026-10-29 (Asia/Shanghai)

[CI run 40761954987](https://github.com/404404/AI-Bots/actions/runs/40761954987), source commit `4e56c0d286f785e81d0f7320c1286784d00d7465`, passed the build, vulnerability scan, production GUI/sandbox checks, authenticated online CLI and Host restart recovery. It published the same tested image without rebuilding:

```text
ghcr.io/404404/ai-bots@sha256:afebfa1da0647f85774b0da832c3ca829d58608d99dc4063713417c3748414ba
```

The [sanitized CI evidence](acceptance/gui-container-ci-407619.json) includes the immutable receipt. Chromium 156.0.8078.47 reported both sandbox layers enabled; all 3 CDP renderers matched `/proc` and all 3 had Seccomp filters. Computer saw the Browser fixture, clicked and typed into it, and returned a screenshot. The old launch token returned `host-unauthorized` after restart; a fresh token authenticated and the same Bot ID survived. The Session and Assignment fixture was empty, so this does not verify populated paging or Assignment detail.

The earlier vulnerability failure and evidence-upload permission failure are resolved; see the [security refresh record](acceptance/gui-container-security-refresh.md). Historical results below describe earlier candidates and do not represent the current production policy.

## GK50 deployment result

On 2026-10-29 at 10:38 Asia/Shanghai, the automated runner deployed the digest above to GK50. The container became healthy; an independent read-only check verified the installed image/configuration identity, named runtime user `10001:10001`, and loopback-only ports `20443` (Web Host) and `1455` (OAuth callback). Existing HermesStatus and ddnsto services remained running. See the [sanitized deployment report](acceptance/gk50-deployment-407619.json).

Status is **deployed-awaiting-acceptance**. The deployed image source is `4e56c0d2`; the host-side runner includes subsequent compatibility fixes `b37d6c74` and `4142f2de`, verified by 33 deployment helper tests. Those fixes did not rebuild the image or change the receipt-bound Compose/seccomp files. Two failed attempts were preserved: the first stopped at Docker image ID representation, the second at an unknown D-Bus user. Both causes and recoveries are documented in the [automation guide](gk50-automation.md).

GK50 GUI/CLI/restart acceptance has not run. The independent infrastructure acceptance entry point is:

```bash
node deploy/gk50-release.mjs --run-id 40761954987 --accept --execute
```

Real Codex OAuth, a model reply, a Bot tool call and post-restart model behavior remain unverified. This deployment result does not claim those features work.

## Required checks

| Area                   | Acceptance evidence                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online CLI auth        | DSH launch token exchanges successfully; CLI `list` uses authenticated Host RPC; no credential appears in output.                                                                                                                        |
| Container CLI fixture  | A disposable Bot and DM are created through the authenticated DSH Host RPC in the throwaway CI Profile; the read-only CLI suite uses the existing Host data authority and a loopback-only proxy.                                         |
| Bot read-only commands | Bot list/detail, Session summaries and paging, Channel Timeline and older/newer cursors, Activity revisions, Assignment page/detail and paging.                                                                                          |
| Error contract         | Unknown Bot and invalid cursor return one JSON error object with a stable `error.code`.                                                                                                                                                  |
| Restart recovery       | Old one-time launch token is rejected, new token authenticates, health RPC returns, and stable Bot IDs remain unchanged.                                                                                                                 |
| Shared display         | `deploy/e2e-gui-shared-display.mjs` opens a fixture in visible Chromium, verifies the Computer CUA driver sees the same titled window, clicks and types into it, confirms Browser observes the change, and returns a desktop screenshot. |
| Chromium sandbox       | Under the approved production profile, `chrome://sandbox` must report Namespace Sandbox and Seccomp-BPF enabled; every CDP renderer must match `/proc` and have Seccomp filtering. No sandbox-disabling flag is permitted.               |
| Persistence            | Compose restart retains DSH Profile/Bot state from the bind-mounted DSH Home.                                                                                                                                                            |

## Credential-free sample response

```json
{
  "schemaVersion": 1,
  "status": "illustrative",
  "botId": "ada",
  "sample": {
    "sessions": {
      "total": 12,
      "sessions": [
        {
          "sessionId": "session-7f3a",
          "role": "orchestrator",
          "createdAt": "2026-10-21T08:30:00.000Z"
        }
      ],
      "nextCursor": "eyJ2IjoxLCJjIjoiMjAyNi0xMC0yMVQwODozMDowMC4wMDBaIiwicyI6InNlc3Npb24tN2YzYSJ9"
    },
    "assignments": {
      "total": 3,
      "assignments": [
        {
          "sessionId": "session-a91c",
          "activity": "completed",
          "createdAt": "2026-10-20T16:00:00.000Z",
          "updatedAt": "2026-10-20T16:05:00.000Z"
        }
      ],
      "nextCursor": "opaque-assignment-cursor-example"
    },
    "activity": { "generation": "activity-generation-7f3a", "revision": 28 },
    "channelTimeline": {
      "channelId": "dm-ada",
      "revision": 71,
      "entries": [{ "messageId": "msg-b01e", "at": "2026-10-21T08:41:00.000Z" }],
      "olderCursor": "opaque-older-cursor-example",
      "newerCursor": "opaque-newer-cursor-example",
      "hasOlder": true,
      "hasNewer": false
    }
  },
  "errorExample": {
    "error": {
      "code": "invalid-cursor",
      "message": "Restart Session paging from the first page."
    }
  }
}
```

The values above are illustrative and contain no user data; `status: illustrative` is not an acceptance result. Activity `generation` is a stable string ID; `revision` is an integer. A real report is generated with `scripts/e2e-cli-readonly.mjs`; it never includes message bodies or credential fields. `nextCursor`, `olderCursor` and `newerCursor` are opaque DSH/CLI continuation values.

## Local Linux Host result

The isolated Host ran on 2026-10-22. The report contains no launch URL, token, credential, or message body. The fixture Bot had no model credential, so its Session list, Assignment list, and Channel Timeline were empty. Assignment detail was skipped because there was no Session ID. Non-empty Session and Assignment paging and detail are covered by the focused CLI unit tests.

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "host": "authenticated-local-dsh-host",
  "botId": "bot-b16198a778054e289a81f777a0f0fe4f",
  "checks": [
    { "name": "bot-list", "exitCode": 0 },
    { "name": "bot-detail", "exitCode": 0 },
    { "name": "sessions", "exitCode": 0 },
    { "name": "assignments", "exitCode": 0 },
    { "name": "assignment-detail", "status": "skipped-empty" },
    { "name": "activity", "exitCode": 0 },
    { "name": "channel-timeline", "exitCode": 0 },
    { "name": "coded-error", "exitCode": 1, "errorCode": "not-found" },
    { "name": "invalid-cursor", "exitCode": 1, "errorCode": "invalid-cursor" }
  ],
  "sample": {
    "botDetail": {
      "bot": {
        "slug": "bot-b16198a778054e289a81f777a0f0fe4f",
        "displayName": "GUI Acceptance 01a15ec5",
        "createdAt": "2026-10-22T07:28:26.935Z"
      }
    },
    "sessions": { "total": 0, "sessions": [] },
    "assignments": { "total": 0, "assignments": [] },
    "activity": {
      "generation": "2dc052be-e627-4a58-81ef-55b9a5b50b6e",
      "revision": 0,
      "bot": { "slug": "bot-b16198a778054e289a81f777a0f0fe4f", "state": "idle", "sessions": [] }
    },
    "channelTimeline": {
      "channelId": "dm-bot-b16198a778054e289a81f777a0f0fe4f",
      "revision": 0,
      "entries": [],
      "olderCursor": null,
      "newerCursor": null,
      "hasOlder": false,
      "hasNewer": false
    }
  }
}
```

The complete sanitized reports are checked in as [the online CLI result](acceptance/gui-container-local-cli.json) and [the Host restart result](acceptance/gui-container-local-restart.json). The restart report records successful authentication before and after restart, rejection of the old token with `host-unauthorized`, and the same Bot ID after restart.

## Historical results before production-policy approval

| Check                                         | Status                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused CLI and Computer regression tests     | Passed                                                      | 43 tests: `packages/core/test/bot-management-cli.test.ts` and `packages/computer/test/local-computer.test.ts`.                                                                                                                                                                                                                                                                                                                                 |
| Chromium diagnostic helper tests              | Passed                                                      | Seven focused renderer/sandbox diagnostic tests pass locally; hosted profile and sanitizer checks passed again in run 39879550251.                                                                                                                                                                                                                                                                                                             |
| Online CLI against isolated Linux Host        | Passed before and after restart                             | Run [39879550251](https://github.com/404404/AI-Bots/actions/runs/39879550251), commit `08e8fcd4`: authenticated Bot list/detail, Session, Assignment, Activity, Timeline, `not-found` and `invalid-cursor` checks passed before and after restart. Same Bot ID remained; old launch token returned `host-unauthorized`. Session and Assignment data were empty. See [`gui-container-ci-398795.json`](acceptance/gui-container-ci-398795.json). |
| Isolated Host restart and old-token rejection | Passed                                                      | Run 39879550251 recovered health, rejected the old launch token with `host-unauthorized`, authenticated the refreshed token, and returned the same stable Bot ID.                                                                                                                                                                                                                                                                              |
| GHCR image build and security gate            | Build and Trivy passed; GUI gate failed; no image published | [Run 39879550251](https://github.com/404404/AI-Bots/actions/runs/39879550251): build, Trivy, container health, namespace probe, CLI and restart checks passed. The production-profile GUI check failed; the publish job was skipped.                                                                                                                                                                                                           |
| Browser/Computer shared X11 display           | Passed only under CI diagnostic profile                     | The `chroot + CLONE_NEWPID` control opened visible Chromium, Computer saw that window, its click and typed input were observed by Browser, and Computer returned a screenshot. Production-profile Chromium failed before DevTools, so this is not yet a deployed-production result.                                                                                                                                                            |
| Chromium sandbox                              | Diagnostic pass; production not accepted                    | Under the CI-only diagnostic profile, `chrome://sandbox` reported `Namespace Sandbox: yes` and `Seccomp-BPF: yes`; all 3 CDP renderer processes matched `/proc`, and all 3 had Seccomp filters. Production still exits with SIGTRAP after `chroot:EPERM`. No `--no-sandbox` or unconfined profile was used.                                                                                                                                    |
| Production-seccomp syscall trace              | Narrow failure evidence                                     | Run 398795 traced `chroot:EPERM` immediately before the production-profile SIGTRAP. Under the diagnostic profile, the same E2E passed with `chroot` plus a masked clone rule matching `CLONE_NEWPID` and no other namespace flag. The proposed production delta is recorded separately and awaits approval; the checked-in production profile remains unchanged.                                                                               |
| Production seccomp policy review              | Pending explicit approval                                   | The proposed delta adds an unconditional seccomp allow for `chroot` and a `clone` rule matching only `CLONE_NEWPID` in the namespace-flag mask (with the s390 argument index variant). This changes the sandbox syscall boundary; see [`chromium-production-seccomp-review.md`](acceptance/chromium-production-seccomp-review.md).                                                                                                             |
| Online CLI against deployed GK50 Host         | Pending                                                     | Deployment remains gated on a passing production GUI acceptance and a published immutable image. Recheck the candidate port immediately before Compose deployment.                                                                                                                                                                                                                                                                             |
| Populated online Session/Assignment paging    | Not covered                                                 | The isolated CLI fixture has no model-generated Session or Assignment. Online collection reads pass, but Session/Assignment next-page cursors and Assignment detail are not exercised against populated Host data; focused CLI tests cover non-empty paging and detail behavior.                                                                                                                                                               |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                 | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                 |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                  | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                             |

The credential-free machine-readable reports for [run 39862473698](acceptance/gui-container-ci-398624.json), [run 39865346040](acceptance/gui-container-ci-398653.json), [run 39867953548](acceptance/gui-container-ci-398679.json), [run 39875159151](acceptance/gui-container-ci-398751.json), and [run 39879550251](acceptance/gui-container-ci-398795.json) preserve the authenticated CLI and Host restart checks. The latest fixture had no model-generated Session or Assignment, so those collections were empty and Assignment detail was skipped.

Last candidate before approval: [Run 39879550251](https://github.com/404404/AI-Bots/actions/runs/39879550251), commit `08e8fcd4217faa55036fc266924b84fb1cfb6fb5`. Build and Trivy passed. Production Chromium still stopped with SIGTRAP before DevTools after `chroot:EPERM`. The CI-only `chroot + CLONE_NEWPID` control passed the shared display, `chrome://sandbox`, and renderer Seccomp checks: all 3 CDP renderers matched `/proc`, all 3 had Seccomp filters, and no renderer was unfiltered. The publish job was skipped. GK50 deployment remains gated; Codex Auth has not made a real model/Browser tool call, and DSM remains untested.

Earlier runs 39827125770 through 39865346040 remain historical evidence; their unconfined diagnostic result does not qualify as hardened acceptance. That historical diagnostic pass supported a narrow candidate, but did not qualify the then-unchanged production profile or GK50 deployment.

The CUA [click and type reference](https://cua.ai/docs/cua-driver/reference/mcp-tools/click-and-type) documents direct `type_text` insertion by element token. In run 39879550251, the CI-only diagnostic profile exercised that path successfully; the unchanged production profile still fails before Browser/Computer interactions can execute.

Do not change a pending status to Passed based on build success or diagnostic-profile results alone. Attach sanitized command output and the image digest when recording a live result.
