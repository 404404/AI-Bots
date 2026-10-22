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
| Online CLI against isolated Linux Host        | Passed before and after restart; fixture data remains empty            | Run [39827125770](https://github.com/404404/AI-Bots/actions/runs/39827125770) repeated Bot list/detail, Session, Assignment page, Activity, Timeline, coded `not-found`, and `invalid-cursor`. The checked-in credential-free report from [run 39804904617](acceptance/gui-container-ci-398049.json) records the full suite. Assignment detail was `skipped-empty`; the empty fixture returned no valid continuation cursor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Isolated Host restart and old-token rejection | Passed                                                                 | The old launch token returned `host-unauthorized`; a refreshed token authenticated; the seeded Bot ID remained stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GHCR image build and security gate            | Build and Trivy passed; production GUI gate failed; no image published | [Run 39827125770](https://github.com/404404/AI-Bots/actions/runs/39827125770): production Chromium startup returned `chromium-startup-failed` and exited with `SIGTRAP` before DevTools; publish was skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Browser/Computer shared X11 display           | Shared window and pixel frame confirmed; CUA click failed              | In the CI-only outer-seccomp-unconfined control, Browser opened the fixture, `chrome://sandbox` reported Namespace and Seccomp-BPF `yes`, Computer connected, and `list_windows` found the same Chromium window. The AT-SPI tree exposed only a Window root. The native CUA screenshot and Browser viewport both measured 1600×1000 and input/submit centers were in bounds, but the first CUA pixel click returned the bounded `tool-error` class; no typing or submission was attempted. The next candidate uses CUA's coordinate-aware `type_text` to focus and type, then clicks Submit.                                                                                                                                                                                                                                                                                                                                                                                |
| Production-seccomp syscall trace              | Captured; evidence points to `chroot:EPERM` before SIGTRAP             | The bounded trace attached and reported failed syscall counts only: `openat/ENOENT` 530, `newfstatat/ENOENT` 526, `readlink/ENOENT` 242, `faccessat2/ENOENT` 200, `futex/EAGAIN` 193, `readlink/EINVAL` 123, `statx/ENOENT` 96, `access/ENOENT` 57, `ioctl/ENOTTY` 35, `wait4/ECHILD` 25, `statfs/ENOENT` 20, `prctl/EINVAL` 16, `fcntl/EBADF` 14, `mkdir/EEXIST` 12, `clone3/ENOSYS` 11, `close/EBADF` 4, `io_uring_setup/EPERM` 4, `madvise/EINVAL` 3, `epoll_ctl/ENOENT` 2, `execve/ENOENT` 2. The same-process SIGTRAP context again recorded `chroot:EPERM`; another process reported `seccomp:EFAULT`. Chromium documents that its user-namespace sandbox's filesystem isolation calls `chroot` and requires `CAP_SYS_CHROOT` inside the namespace ([pinned Chromium source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h)). This is a strong lead, not a confirmed root cause. |
| Online CLI against deployed GK50 Host         | Pending                                                                | GK50 is the current local workspace host, and port `20443` is unused. Deployment remains gated on a passing production GUI smoke test and published immutable image.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                            | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                             | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Latest hosted candidate: [Run 39827125770](https://github.com/404404/AI-Bots/actions/runs/39827125770), commit `29c4f802`. Image build, Trivy, container health, the user-namespace probe, DSH-native fixture creation through authenticated Host RPC, the full online read-only CLI suite, and Host restart recovery passed. Session and Assignment rows were empty, Assignment detail was `skipped-empty`, and the Timeline had no valid continuation cursor; no live non-empty pagination result is claimed. The run failed the production Chromium gate and the diagnostic pixel click returned `tool-error`, so it published no image.

With the production seccomp profile, Chromium exited with `SIGTRAP` before DevTools. The same-process trace context contained `chroot:EPERM` immediately before signal delivery and termination. Chromium's [credentials source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h) states that its user-namespace filesystem isolation uses `chroot(2)` and requires `CAP_SYS_CHROOT`, which is acquired after entering that namespace. That correlation makes an outer seccomp denial plausible, but it does not by itself prove the cause. The attempted production-profile change was rejected by automatic approval review and was not applied; the shipped profile remains unchanged.

In the CI-only unconfined control, Chromium opened the fixture and `chrome://sandbox` reported both Namespace and Seccomp-BPF `yes`. Computer saw the same Chromium window, but its accessibility tree exposed only a Window root. The five-second AT-SPI retry reported `elements_complete:false`, `truncated:false`, and zero nodes visited. CUA's native screenshot and Browser's viewport matched at 1600×1000; a click to the computed input center still returned `tool-error`. The pinned CUA v0.31 Linux contract documents coordinate-aware `type_text`, which clicks the field before typing ([CUA v0.31 Linux MCP contract](https://github.com/trycua/cua/blob/cua-driver-rs-v0.31.0/docs/content/docs/reference/cua-driver/mcp-tools-linux.mdx)). The next candidate uses that path and then clicks Submit. This control remains diagnostic only. GHCR publication and GK50 deployment remain pending.

Do not change a pending status to Passed based on build success or static configuration inspection. Attach sanitized command output and the image digest when recording a live result.
