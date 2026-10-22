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

| Check                                         | Status                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused CLI and Computer regression tests     | Passed                                                                 | 43 tests: `packages/core/test/bot-management-cli.test.ts` and `packages/computer/test/local-computer.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Online CLI against isolated Linux Host        | Passed before and after restart                                         | Run [39835309374](https://github.com/404404/AI-Bots/actions/runs/39835309374) passed Bot list/detail, Session, Assignment page, Activity, Timeline, coded `not-found`, and `invalid-cursor` before and after Host restart. The old token returned `host-unauthorized`; the refreshed token authenticated and the Bot ID stayed stable. The checked-in credential-free sample from [run 39804904617](acceptance/gui-container-ci-398049.json) remains the reference response. |
| Isolated Host restart and old-token rejection | Passed                                                                 | The old launch token returned `host-unauthorized`; a refreshed token authenticated; the seeded Bot ID remained stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GHCR image build and security gate            | Build and Trivy passed; GUI gate failed; no image published             | [Run 39835309374](https://github.com/404404/AI-Bots/actions/runs/39835309374), commit `74e752a2`: production-profile Chromium opened the fixture and `chrome://sandbox` reported Namespace and Seccomp-BPF `yes`. D-Bus and AT-SPI session/address checks passed; the GUI gate failed when Computer could not click the accessible input element (`tool-error`). Publish was skipped. |
| Browser/Computer shared X11 display           | Shared window and accessible tree confirmed; input not verified         | Browser and Computer found the same Chromium window. The D-Bus session and AT-SPI address were available, and Computer returned a complete 17-element tree with one input and one Submit candidate. Computer’s element click returned the bounded `tool-error`; no text entry or submission is claimed. The next candidate types directly into the accessible input element, then clicks Submit and verifies Browser’s page state. |
| Production-seccomp syscall trace              | Captured on an earlier candidate; root cause remains unconfirmed        | Run [39827125770](https://github.com/404404/AI-Bots/actions/runs/39827125770) recorded `chroot:EPERM` in the same-process context before `SIGTRAP`, while another process reported `seccomp:EFAULT`. Chromium documents that its user-namespace sandbox filesystem isolation calls `chroot` and requires `CAP_SYS_CHROOT` inside the namespace ([pinned Chromium source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h)). Runs 39829654270, 39832775959, and 39835309374 started Chromium under the production profile, so the earlier trace is not treated as the cause of their Computer interaction failures. |
| Online CLI against deployed GK50 Host         | Pending                                                                | Deployment remains gated on a passing production GUI acceptance and a published immutable image. Recheck the candidate port immediately before Compose deployment. |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                            | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                             | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Latest hosted candidate: [Run 39835309374](https://github.com/404404/AI-Bots/actions/runs/39835309374), commit `74e752a211b55ddf3cadc619d926da323ddec391`. Image build, Trivy, container health, user-namespace probe, DSH-native fixture creation, the authenticated read-only CLI suite, and Host restart recovery passed. Production-profile Browser and Computer found the same Chromium window; `chrome://sandbox` reported Namespace and Seccomp-BPF `yes`. D-Bus and AT-SPI initialized and Computer returned a complete 17-element tree, but the element click returned `tool-error`, so input and submit remain unverified. No image was published.

Previous candidate [29c4f802](https://github.com/404404/AI-Bots/actions/runs/39827125770) exited Chromium with `SIGTRAP` before DevTools under the production seccomp profile. Its same-process trace contained `chroot:EPERM` before signal delivery; another process reported `seccomp:EFAULT`. Chromium’s [credentials source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h) says its user-namespace filesystem isolation calls `chroot(2)` and requires `CAP_SYS_CHROOT` inside the namespace. This correlation is a lead, not a confirmed root cause. The attempted production-profile change was rejected by automatic approval review and was not applied; the shipped profile remains unchanged.

Runs 39827125770 and 39829654270 found the same X11 Chromium window but no actionable AT-SPI controls. Run 39832775959 added `--force-renderer-accessibility` without changing the empty tree. Run 39835309374 initialized a private D-Bus session and AT-SPI bus for the smoke process; the report recorded both address booleans as true and a complete 17-element tree with input and Submit candidates. This confirms the earlier empty tree was caused by the smoke runner lacking desktop-session accessibility context. Element-based `click` then returned `tool-error` before any input was typed. The next candidate uses CUA’s documented `type_text` action directly on the accessible input, then clicks Submit and requires Browser to observe the entered value.

The CUA [click and type reference](https://cua.ai/docs/cua-driver/reference/mcp-tools/click-and-type) documents direct `type_text` insertion by element token. The next candidate uses that path without requiring a separate input click.

Do not change a pending status to Passed based on build success or static configuration inspection. Attach sanitized command output and the image digest when recording a live result.
