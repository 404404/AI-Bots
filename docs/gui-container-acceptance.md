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
| Online CLI against isolated Linux Host        | Passed before and after restart                                         | Run [39829654270](https://github.com/404404/AI-Bots/actions/runs/39829654270) passed Bot list/detail, Session, Assignment page, Activity, Timeline, coded `not-found`, and `invalid-cursor` before and after Host restart. The old token returned `host-unauthorized`; the refreshed token authenticated and the Bot ID stayed stable. The checked-in credential-free sample from [run 39804904617](acceptance/gui-container-ci-398049.json) remains the reference response. |
| Isolated Host restart and old-token rejection | Passed                                                                 | The old launch token returned `host-unauthorized`; a refreshed token authenticated; the seeded Bot ID remained stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GHCR image build and security gate            | Build and Trivy passed; GUI gate failed; no image published             | [Run 39829654270](https://github.com/404404/AI-Bots/actions/runs/39829654270), commit `c708cab8`: production-profile Chromium opened the fixture and `chrome://sandbox` reported Namespace and Seccomp-BPF `yes`. Computer input returned `input-unavailable` before submit and the final Chromium process seccomp check; publish was skipped. The outer-seccomp-unconfined diagnostic also did not pass. |
| Browser/Computer shared X11 display           | Shared window and pixel frame confirmed; input not verified             | In the production-profile run, Browser opened the fixture; Computer found the same Chromium window and title. The screenshot and Browser viewport both measured 1600×1000. The AT-SPI tree contained only its Window root, with zero nodes visited and no input/button candidates; coordinate-aware `type_text` returned the bounded `input-unavailable` class. No text entry or submission is claimed. The next candidate enables Chromium renderer accessibility before retrying semantic element actions. |
| Production-seccomp syscall trace              | Captured on the previous candidate; root cause remains unconfirmed       | Run [39827125770](https://github.com/404404/AI-Bots/actions/runs/39827125770) recorded `chroot:EPERM` in the same-process context before `SIGTRAP`, while another process reported `seccomp:EFAULT`. Chromium documents that its user-namespace sandbox filesystem isolation calls `chroot` and requires `CAP_SYS_CHROOT` inside the namespace ([pinned Chromium source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h)). Run 39829654270 started Chromium under the production profile, so the earlier trace is not treated as a confirmed cause of that run’s Computer input refusal. |
| Online CLI against deployed GK50 Host         | Pending                                                                | Deployment remains gated on a passing production GUI acceptance and a published immutable image. Recheck the candidate port immediately before Compose deployment. |
| Codex OAuth real tool call                    | Pending human OAuth sign-in                                            | The isolated Host has no model credential; no real Codex tool call is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| DSM / Container Manager / Chromium sandbox    | Not tested                                                             | No DSM host is available in this task environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Latest hosted candidate: [Run 39829654270](https://github.com/404404/AI-Bots/actions/runs/39829654270), commit `c708cab83ef23d7d91ea8c45f41d5bee20ba44e8`. Image build, Trivy, container health, the user-namespace probe, DSH-native fixture creation through authenticated Host RPC, the full authenticated read-only CLI suite, and Host restart recovery passed. The production-profile Browser and Computer found the same Chromium window, and `chrome://sandbox` reported Namespace and Seccomp-BPF `yes`. Computer did not expose the form controls in its AT-SPI tree and coordinate-aware `type_text` returned `input-unavailable`; therefore shared-display observation passed but end-to-end interaction did not. The unconfined diagnostic did not pass either. GHCR publication and GK50 deployment remain pending.

Previous candidate [29c4f802](https://github.com/404404/AI-Bots/actions/runs/39827125770) exited Chromium with `SIGTRAP` before DevTools under the production seccomp profile. Its same-process trace contained `chroot:EPERM` before signal delivery; another process reported `seccomp:EFAULT`. Chromium’s [credentials source](https://chromium.googlesource.com/chromium/src.git/+/4d91216184b506a9f0a623919862250f65d4f3e4/sandbox/linux/services/credentials.h) says its user-namespace filesystem isolation calls `chroot(2)` and requires `CAP_SYS_CHROOT` inside the namespace. This correlation is a lead, not a confirmed root cause. The attempted production-profile change was rejected by automatic approval review and was not applied; the shipped profile remains unchanged.

Run 39827125770’s CI-only unconfined control found the same Browser/Computer window but its AT-SPI tree exposed only a Window root; the five-second retry reported `elements_complete:false`, `truncated:false`, and zero nodes visited. Run 39829654270’s production profile also started Chromium and reported both sandbox layers enabled, but its AT-SPI tree still contained no actionable controls and CUA returned `input-unavailable`. The [CUA Linux browser guide](https://github.com/trycua/cua/blob/main/docs/content/docs/how-to-guides/driver/drive-a-web-page.mdx) recommends `--force-renderer-accessibility` when no screen reader enables Chromium’s complete AT-SPI tree. The current candidate adds that flag to the shared Chromium wrapper, then retries element-based click/type and verifies the resulting page state. If semantic background input remains unavailable, foreground delivery will be tested as a separate, action-scoped fallback.

Do not change a pending status to Passed based on build success or static configuration inspection. Attach sanitized command output and the image digest when recording a live result.
