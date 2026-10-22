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
| Chromium sandbox       | Smoke test verifies there is no `--no-sandbox` argument and checks `chrome://sandbox` for both Namespace Sandbox and Seccomp-BPF enabled.                                                                                                |
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

| Check                                         | Status                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused CLI and Computer regression tests     | Passed                                                      | 43 tests: `packages/core/test/bot-management-cli.test.ts` and `packages/computer/test/local-computer.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Chromium diagnostic helper tests              | Passed                                                      | Seven focused Node tests passed locally and in run 39862473698, including the renderer Seccomp check and CI-only chroot-profile generator.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Online CLI against isolated Linux Host        | Passed before and after restart                             | Run [39862473698](https://github.com/404404/AI-Bots/actions/runs/39862473698), commit `9ffc8cb2`: authenticated Bot list/detail, Session, Assignment, Activity, Timeline, `not-found`, and `invalid-cursor` passed before and after Host restart. The old token returned `host-unauthorized`; the refreshed token authenticated and the same Bot ID remained. The complete credential-free result is [`gui-container-ci-398624.json`](acceptance/gui-container-ci-398624.json); the older sample from [run 39804904617](acceptance/gui-container-ci-398049.json) remains illustrative.                                                                                                                      |
| Isolated Host restart and old-token rejection | Passed                                                      | Run 39862473698 restarted the Host, rejected the old launch token with `host-unauthorized`, authenticated the refreshed token, and returned the same Bot ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GHCR image build and security gate            | Build and Trivy passed; GUI gate failed; no image published | [Run 39862473698](https://github.com/404404/AI-Bots/actions/runs/39862473698): image build, Trivy, container health, user-namespace probe, CLI fixture, read-only CLI, and restart checks passed. Chromium startup failed under the production profile and the chroot-only diagnostic; publish was skipped.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Browser/Computer shared X11 display           | Not reached under production or chroot-only profile         | The production-profile run exited Chromium with `SIGTRAP` before DevTools. The chroot-only diagnostic emitted a DevTools startup signal but did not create the expected port file; the fixture interaction was not reached. Run 39859925339 previously completed click, typing, and screenshot checks only under an outer-seccomp-unconfined diagnostic, which does not qualify as hardened acceptance.                                                                                                                                                                                                                                                                                                     |
| Chromium sandbox                              | Not accepted                                                | Neither production nor chroot-only diagnostic reached `chrome://sandbox`; Namespace and Seccomp-BPF status are unverified for this candidate. No `--no-sandbox` workaround or production seccomp change was made.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Production-seccomp syscall trace              | Inconclusive                                                | Run 39827125770 earlier recorded `chroot:EPERM` before `SIGTRAP`, alongside `seccomp:EFAULT` in another process. The run 39862473698 retry had no SIGTRAP context or `chroot:EPERM` and did not use the D-Bus wrapper; its trace is incomplete evidence. The chroot-only profile still failed Chromium startup. The earlier correlation is not a confirmed root cause. Chromium's user-namespace filesystem isolation does call `chroot` and requires `CAP_SYS_CHROOT` inside the namespace ([pinned Chromium source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h)). The next CI run captures a D-Bus-matched retry. |
| Online CLI against deployed GK50 Host         | Pending                                                     | Deployment remains gated on a passing production GUI acceptance and a published immutable image. Recheck the candidate port immediately before Compose deployment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                 | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                  | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The credential-free machine-readable report for run 39862473698 is [`acceptance/gui-container-ci-398624.json`](acceptance/gui-container-ci-398624.json). It records the successful authenticated CLI and restart checks alongside the failed Chromium gates; empty Session/Assignment collections and the skipped Assignment detail are explicit.

Latest hosted candidate: [Run 39862473698](https://github.com/404404/AI-Bots/actions/runs/39862473698), commit `9ffc8cb237927549f715a9fd54b3054d6a9326f1`. Image build, Trivy, container health, the user-namespace probe, authenticated read-only CLI, old-token rejection, refreshed-token recovery, and stable Bot ID checks passed. Chromium startup failed under both the production profile and a CI-only profile that adds just `chroot`; neither reached the Browser/Computer fixture or `chrome://sandbox`. No image was published. GK50 deployment remains gated, Codex Auth has not made a real model/Browser tool call, and DSM remains untested.

Previous candidate [29c4f802](https://github.com/404404/AI-Bots/actions/runs/39827125770) exited Chromium with `SIGTRAP` before DevTools under the production seccomp profile. Its same-process trace contained `chroot:EPERM` before signal delivery; another process reported `seccomp:EFAULT`. Chromium’s [credentials source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h) says its user-namespace filesystem isolation calls `chroot(2)` and requires `CAP_SYS_CHROOT` inside the namespace. Run 39862473698 tested a CI-only chroot exception, but Chromium still did not complete startup. This correlation remains a lead, not a confirmed root cause. An earlier production-profile edit was rejected by automatic approval review and was not applied; the shipped profile remains unchanged.

Runs 39827125770 and 39829654270 found the same X11 Chromium window but no actionable AT-SPI controls. Run 39832775959 added `--force-renderer-accessibility` without changing the empty tree. Run 39835309374 initialized a private D-Bus session and AT-SPI bus; the report recorded both address booleans as true and a complete 17-element tree with input and Submit candidates. Run 39837628947 typed directly at the input element but CUA returned a bounded `tool-error`. Run 39859925339 completed the fixture click/type/screenshot sequence only in a Docker outer-seccomp-unconfined diagnostic; its renderer-seccomp postcondition was corrected in 9ffc8cb2. Run 39862473698 confirms that adding only `chroot` is insufficient; further production-seccomp diagnosis is still needed.

The CUA [click and type reference](https://cua.ai/docs/cua-driver/reference/mcp-tools/click-and-type) documents direct `type_text` insertion by element token. The current code retains the explicit refusal handling and the verified element path, but the latest production-profile run failed before those interactions could execute.

Do not change a pending status to Passed based on build success or static configuration inspection. Attach sanitized command output and the image digest when recording a live result.
