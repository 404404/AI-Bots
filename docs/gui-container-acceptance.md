# GUI Container acceptance record

This record distinguishes repository tests from live GK50 deployment checks and DSM checks. Credentials, launch tokens, message bodies, local hostnames beyond the named target, and private DSH paths are excluded.

## Required checks

| Area                   | Acceptance evidence                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online CLI auth        | DSH launch token exchanges successfully; CLI `list` uses authenticated Host RPC; no credential appears in output.                                                                                                                        |
| Container CLI fixture  | A disposable Bot and DM are created through the authenticated DSH Host RPC in the throwaway CI Profile; the read-only CLI suite uses the existing Host data authority and a loopback-only proxy.                                         |
| Bot read-only commands | Bot list/detail, Session summaries and paging, Channel Timeline and older/newer cursors, Activity revisions, Assignment page/detail and paging.                                                                                          |
| Error contract         | Unknown Bot and invalid cursor return one JSON error object with a stable `error.code`.                                                                                                                                                  |
| Restart recovery       | Old one-time launch token is rejected, new token authenticates, health RPC returns, and stable Bot IDs remain unchanged.                                                                                                                 |
| Shared display         | `deploy/e2e-gui-shared-display.mjs` opens a fixture in visible Chromium, verifies the Computer CUA driver sees the same titled window, clicks and types into it, confirms Browser observes the change, and returns a desktop screenshot. |
| Chromium sandbox       | Not accepted                                                                                                                                                                                                                             | In the chroot+clone diagnostic, `chrome://sandbox` reported Namespace Sandbox and Seccomp-BPF enabled, but the process-tree check found no renderer with `Seccomp >= 2`; the acceptance ended at `chromium-seccomp-process`. Whether this reflects renderer state or incomplete process discovery remains unresolved. |
| Persistence            | Compose restart retains DSH Profile/Bot state from the bind-mounted DSH Home.                                                                                                                                                            |
| DSM                    | Repeat the same checks on a physical DSM/Container Manager target; record version and model.                                                                                                                                             |

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

## Results

| Check                                         | Status                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused CLI and Computer regression tests     | Passed                                                      | 43 tests: `packages/core/test/bot-management-cli.test.ts` and `packages/computer/test/local-computer.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                               |
| Chromium diagnostic helper tests              | Passed                                                      | Six focused renderer/sandbox diagnostic tests pass locally; the hosted profile and sanitizer checks passed in run 39867953548.                                                                                                                                                                                                                                                                                                                                                                               |
| Online CLI against isolated Linux Host        | Passed before and after restart                             | Run [39867953548](https://github.com/404404/AI-Bots/actions/runs/39867953548), commit `65d9348f`: authenticated Bot list/detail, Session, Assignment, Activity, Timeline, `not-found` and `invalid-cursor` checks passed before and after Host restart. The same Bot ID remained; the expired launch token returned `host-unauthorized`. Session and Assignment data were empty, so Assignment detail was explicitly skipped. See [`gui-container-ci-398679.json`](acceptance/gui-container-ci-398679.json). |
| Isolated Host restart and old-token rejection | Passed                                                      | Run 39867953548 restarted the Host, rejected the old launch token with `host-unauthorized`, authenticated the refreshed token, and returned the same Bot ID.                                                                                                                                                                                                                                                                                                                                                 |
| GHCR image build and security gate            | Build and Trivy passed; GUI gate failed; no image published | [Run 39867953548](https://github.com/404404/AI-Bots/actions/runs/39867953548): image build, Trivy, container health, namespace probe, read-only CLI and restart checks passed. The production Chromium gate and the CI-only chroot+clone sandbox postcondition failed; publish was skipped.                                                                                                                                                                                                                  |
| Browser/Computer shared X11 display           | Passed only in CI diagnostic profile                        | Production seccomp stopped Chromium before DevTools. In the CI-only chroot+clone profile, visible Browser opened the fixture, Computer saw the same X11 window, click/type reached the page, and a desktop screenshot was returned. This diagnostic profile does not qualify as production acceptance.                                                                                                                                                                                                       |
| Chromium sandbox                              | Not accepted                                                | Neither production nor chroot-only diagnostic reached `chrome://sandbox`; Namespace and Seccomp-BPF status are unverified for this candidate. No `--no-sandbox` workaround or production seccomp change was made.                                                                                                                                                                                                                                                                                            |
| Production-seccomp syscall trace              | Partial evidence; root cause unresolved                     | Run 39867953548 traced `chroot:EPERM` before production-profile `SIGTRAP`. With a CI-only chroot+clone allowance, Chromium reached the shared-display checks and sandbox page, but failed the renderer-seccomp postcondition. The production seccomp profile remains unchanged; no image was published.                                                                                                                                                                                                      |
| Online CLI against deployed GK50 Host         | Pending                                                     | Deployment remains gated on a passing production GUI acceptance and a published immutable image. Recheck the candidate port immediately before Compose deployment.                                                                                                                                                                                                                                                                                                                                           |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                 | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                  | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

The credential-free machine-readable reports for [run 39862473698](acceptance/gui-container-ci-398624.json), [run 39865346040](acceptance/gui-container-ci-398653.json), and [run 39867953548](acceptance/gui-container-ci-398679.json) record the authenticated CLI and Host restart checks together with the failed production GUI gate. The latest fixture had no model-generated Session or Assignment, so those collections were empty and Assignment detail was skipped.

Latest hosted candidate: [Run 39867953548](https://github.com/404404/AI-Bots/actions/runs/39867953548), commit `65d9348f88e5a7de53fedcecc04c93ee93ec3127`. Build and Trivy passed. Production Chromium stopped with `SIGTRAP` before DevTools after `chroot:EPERM). The unpublished chroot+clone diagnostic reached Browser/Computer interaction and `chrome://sandbox` (Namespace and Seccomp-BPF both reported enabled), but the renderer process seccomp postcondition failed. The publish step was skipped. GK50 deployment remains gated; Codex Auth has not made a real model/Browser tool call, and DSM remains untested.

The next diagnostic must distinguish a renderer whose seccomp filter is absent from a process-tree scan that did not find the renderer. Do not add the diagnostic allowances to the production profile without a separate security review and passing acceptance. Earlier runs 39827125770 through 39865346040 are retained above as historical evidence; their unconfined diagnostic result does not qualify as hardened acceptance.

The CUA [click and type reference](https://cua.ai/docs/cua-driver/reference/mcp-tools/click-and-type) documents direct `type_text` insertion by element token. The current code retains the explicit refusal handling and the verified element path, but the latest production-profile run failed before those interactions could execute.

Do not change a pending status to Passed based on build success or static configuration inspection. Attach sanitized command output and the image digest when recording a live result.
