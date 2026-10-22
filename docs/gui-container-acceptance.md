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

| Check                                         | Status                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused CLI and Computer regression tests     | Passed                                                                 | 43 tests: `packages/core/test/bot-management-cli.test.ts` and `packages/computer/test/local-computer.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Online CLI against isolated Linux Host        | Passed before and after restart; fixture data remains empty            | Run [39808066239](https://github.com/404404/AI-Bots/actions/runs/39808066239) repeated Bot list/detail, Session, Assignment page, Activity, Timeline, coded `not-found`, and `invalid-cursor`. The checked-in credential-free report from [run 39804904617](acceptance/gui-container-ci-cli-398049.json) records the same complete suite. Assignment detail was `skipped-empty`; the empty fixture returned no valid continuation cursor.                                                                                                                                                                                                                                                             |
| Isolated Host restart and old-token rejection | Passed                                                                 | The old launch token returned `host-unauthorized`; a refreshed token authenticated; the seeded Bot ID remained stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GHCR image build and security gate            | Build and Trivy passed; production GUI gate failed; no image published | [Run 39808066239](https://github.com/404404/AI-Bots/actions/runs/39808066239): Chromium `155.0.8059.79` exited with `SIGTRAP` before DevTools under the production seccomp profile; the publish job was skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Browser/Computer shared X11 display           | Partial; input roundtrip failed in diagnostic control                  | In the CI-only outer-seccomp-unconfined control, Browser opened the fixture, `chrome://sandbox` reported Namespace and Seccomp-BPF `yes`, Computer connected, and `list_windows` found the fixture window. The Computer click/type/submit roundtrip then failed. The next candidate reports each action phase separately. This control does not qualify the production seccomp profile.                                                                                                                                                                                                                                                                                                               |
| Production-seccomp syscall trace              | Captured; cause not established                                        | Run 398080 attached a short host-side trace and reported failed syscall counts only: `openat/ENOENT` 515, `newfstatat/ENOENT` 514, `readlink/ENOENT` 242, `faccessat2/ENOENT` 200, `futex/EAGAIN` 161, `readlink/EINVAL` 123, `statx/ENOENT` 96, `access/ENOENT` 57, `ioctl/ENOTTY` 35, `wait4/ECHILD` 25, `statfs/ENOENT` 20, `prctl/EINVAL` 16, `fcntl/EBADF` 14, `mkdir/EEXIST` 12, `clone3/ENOSYS` 11, `close/EBADF` 4, `io_uring_setup/EPERM` 4, `madvise/EINVAL` 3, `execve/ENOENT` 2, `fadvise64/ESPIPE` 2. Counts alone do not identify the SIGTRAP cause. The next trace summary will retain only the same-process SIGTRAP context and syscall names/errno, with arguments and PIDs removed. |
| Online CLI against deployed GK50 Host         | Pending                                                                | Await the trusted GK50 host key and deployment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                            | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                             | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Latest hosted candidate: [Run 39808066239](https://github.com/404404/AI-Bots/actions/runs/39808066239), commit `630ff305`. Image build, Trivy, container health, the user-namespace probe, DSH-native fixture creation through authenticated Host RPC, the full online read-only CLI suite, and Host restart recovery passed. Session and Assignment rows were empty, Assignment detail was `skipped-empty`, and the Timeline had no valid continuation cursor. No live non-empty pagination result is claimed. The run failed the production Chromium gate and the unconfined diagnostic control's Computer input roundtrip, so it published no image.

The production-profile log records `zygote_host_impl_linux.cc:251` (`zygote-exited-before-ready`) and two optional CPU-frequency-file misses from Crashpad. Chromium's [Crashpad file-open wrapper](https://github.com/chromium/chromium/blob/155.0.8059.79/third_party/crashpad/crashpad/util/file/file_io_posix.cc#L143-L146) shows those are generic file-open errors and do not establish the zygote failure cause. The [zygote host source](https://github.com/chromium/chromium/blob/155.0.8059.79/content/browser/zygote_host/zygote_host_impl_linux.cc#L243-L255) identifies line 251 as the zygote-exited-before-ready fatal check.

The candidate that matches the fixture marker as a title substring confirmed Computer window discovery, then failed during the end-to-end click/type/submit path. The next candidate records which action completed and whether Browser observed the submitted text. Its CI-only SIGTRAP trace summarizer is covered by a test that verifies output omits syscall arguments, PIDs, and file paths. The outer-seccomp-unconfined control remains diagnostic only. GHCR publication and GK50 deployment remain pending.

Do not change a pending status to Passed based on build success or static configuration inspection. Attach sanitized command output and the image digest when recording a live result.
