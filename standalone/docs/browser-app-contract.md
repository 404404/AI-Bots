# BrowserService application contract (ADR-0248)

Status: schema-7 direct owner slice is wired into the HTTP API, CLI, and Web UI, with canonical SQLite task/session/step records and authenticated screenshot reads. Application tests exercise a fake local UDS worker. Browser model tools and real worker-container acceptance are not implemented or claimed.

## Ownership and scope

`BrowserService` uses the application's existing `bot.sqlite` and canonical `tasks`. The caller injects a narrow `Storage`, `BrowserClient`, and trusted `BrowserTaskAdapter`; the module never opens another database, performs a migration, starts a worker, or accepts model-provided socket paths or credentials. Construction checks that the four tables in `browserSchemaSql` already exist and returns `schema-upgrade-required` if they do not.

The schema-6→7 migration applies the exported `browserSchemaSql` atomically with `PRAGMA user_version`. It adds per-Bot exact-origin grants with a monotonically increasing row revision, browser sessions, step intents/results, and screenshot BLOB resources. Foreign keys bind sessions to `bots` and `tasks`, and resources to both their session and task. `browserSchemaSql` itself does not set `PRAGMA user_version`.

The single-owner adapter calls `grantOrigin`/`revokeOrigin` only inside trusted owner ALS established by authenticated application entry points; no `ownerId` is accepted because this product has no owner identity entity. Worker executor ALS is mutually exclusive with owner ALS, including async descendants. Those methods validate a canonical `http:` or `https:` origin and update its revision. A revision change persists first, marks matching sessions closing, interrupts accepted steps, and cancels the worker sessions before returning. A worker that cannot be reached is reported in `cleanupPending` with its lease deadline; its row stays closing so the reaper can retry cancellation or record lease expiry. Every open reads the current granted row. Model arguments cannot provide a grant revision or widen origin scope.

`openForOwner({botId,idempotencyKey,origin})` requires the trusted adapter to select the authorized Bot. It calls `createOwnerRootTask` to create/retrieve a canonical no-model root task, then records the browser session before making one worker create request. The task adapter must make root-task creation idempotent by the passed key and return its canonical task ID, Bot/executor, parent, status, and deadline. Concurrent opens with the same key share one in-process RPC; a failed newly accepted owner open ends its root task as interrupted. Closing/cancelling a direct session calls `finishOwnerRootTask` so the task remains the lifecycle authority.

`openForWorker({botId,taskId,idempotencyKey,origin})` does not trust those IDs as proof. It resolves the canonical task, requires a running child task whose executor is the same Bot, requires the actual executor context callback to confirm this task is current, checks the deadline, then reads the Bot's current exact-origin grant and revision. Each later step rechecks task status, actual worker context, deadline, and grant revision.

## RPC and idempotency

`BrowserClient` uses Node HTTP over the configured absolute UDS path. That path is trusted deployment configuration and cannot come from a model. UDS filesystem permissions are the worker's control capability; there is no bearer token in prompts, URLs, or page content. Each call has an `AbortSignal`, a 15-second request timeout, a 128 KiB JSON request/response cap, and a 2 MiB screenshot response cap. It does not follow redirects or accept arbitrary URLs.

Session creation persists the app session ID, worker create operation ID, Bot/task, origin revision, idempotency key, deadline, and `creating` state before the one UDS create call. The worker's remote session ID is recorded only after a valid response. A lost or malformed response marks the row interrupted; it is never retried. The app UUID and worker UUID are separate identifiers.

Each step first stores an `accepted` intent with its step ID, sequence, action, and canonical SHA-256 parameter fingerprint, then sends one worker operation with a fresh stable-for-that-attempt operation ID. The worker receives the same sequence/operation ID required by its protocol. Repeating a completed step with the same ID and parameters returns the stored result only after the trusted owner or active executor scope is rechecked; changing parameters conflicts. An in-process duplicate shares the pending promise. If a pending intent survives a restart or an uncertain RPC failure, it becomes interrupted and is never replayed. An uncertain step marks the canonical worker task interrupted through `BrowserTaskAdapter.interruptTask`, cancels the session best-effort, and returns fatal `browser-step-interrupted`; callers must terminate that task rather than retrying with a new step or session ID. Conditional result updates discard late results after interruption or task/session termination.

The service allows at most four active sessions, a 120-second maximum lease bounded by task deadline, 12 steps per session, eight screenshot resources, 2 MiB per PNG, and 8 MiB total PNG data per session. Screenshot fetch happens immediately after the screenshot operation and before session close. Only a CRC-checked PNG with a single 8-bit RGB/RGBA IHDR, dimensions no greater than 1280×800 and 1,024,000 pixels, IDAT, IEND, and no extra chunks is stored. The service assigns a new opaque app resource ID and returns no worker file path. `readScreenshot({resourceId,botId,taskId})` requires the trusted owner adapter check and canonical task/Bot binding, then returns the BLOB, including after the browser closes. A model-supplied Bot/task pair alone is not authorization.

`taskTerminal(taskId, status)` is connected to canonical task lifecycle transitions; it returns any worker cancellations still pending with their lease deadlines. `recover()` runs after task recovery at process startup to mark surviving accepted steps interrupted and cancel their worker sessions; unreachable workers remain closing and are returned in `cleanupPending`. `reap()` runs periodically, compares lease expiry using the injected service clock, retries closing-session cleanup, and records expired leases after their deadlines. Worker lease expiry is the independent fallback if the app cannot reach the UDS. A task with less than one second remaining is refused so the minimum worker lease never outlives the canonical deadline.

## Intended adapter call shape

The current owner API and CLI pass trusted context into the same service methods; the Web UI uses that API:

```ts
openForOwner({ botId, idempotencyKey, origin })
openForWorker({ botId: executorBotId, taskId: currentTaskId, idempotencyKey, origin })
step({ sessionId, botId, taskId, stepId, action, args, signal })
readScreenshot({ resourceId, botId, taskId })
close({ sessionId, botId, taskId, mode? })
```

`step` accepts `navigate`, `read`, `click`, `type`, `scroll`, and `screenshot`; lifecycle `close`/`cancel` use the dedicated service method. The adapter must not pass upload/download, arbitrary JavaScript, browser credentials, worker URLs, host paths, or control credentials. Page text is untrusted. Screenshot BLOBs are returned through an authenticated resource route and never inline as a local path.

## Limits of this slice

The isolated fake-UDS tests exercise schema migration, SQLite ownership, grants, idempotency, interruption, cancellation, screenshot validation/storage, response scoping, CLI, and Web/API integration. They do not prove real Chromium sandboxing, network isolation, worker image identity, or live worker-container behavior. Browser model tools are not implemented. Those remain separate implementation and Terra acceptance gates.
