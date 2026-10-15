# Lark referenced files in Channel history — candidate #1022

## Scope and provenance

This is the first file tracer on current main, replacing the obsolete implementation closed in #1077 after the owner's cleanup instruction. It reuses the existing QQ/shared file card, canonical Source Event, Channel placement, Messaging authorization and AttachmentStore. The Provider pin and file contract are unchanged.

The current checked Lark Provider associates a text request with its exact quoted parent file, in the same native conversation and topic. Its descriptor supplies a filename but no MIME or size. This candidate projects that single file and enables its authorized acquisition without fabricating metadata or known text/file order. Direct native file messages and multi-file/mixed posts remain outside current Provider qualification.

## Implemented production path

Checked Provider parent descriptor → canonical Source Event → realtime and historical Channel file card → explicit Human download → existing authenticated attachment HTTP route → current Channel/placement/source and independent authorization checks → bounded checked Provider read → canonical AttachmentStore → forced original download.

The file-card Client reports loading, source refusal, unsupported/oversized content and retry. File requests share the existing image concurrency budget, capped at three, and have a 30-second deadline and 25 MiB default bound. Unmount and authorization-change notifications cancel pending Client work. Files never acquire on visibility.

When DSH reports native file opening available, an explicit action opens the existing application menu. The preliminary capability check resolves no file. `channelMediaTarget` uses the same Messaging access before resolving the managed Attachment target; each actual open resolves it afresh. It does not accept a Bot selector, Host path or provider URL. No new launcher, remote editing API, message store or Bot attention authority is added.

`deepseekbot channel-media-target` and `channel-media-download` exercise the same owner without a model. Download writes a new local `--out` file, refuses overwrite and returns byte count, MIME and SHA-256. Nested HTTP refusal codes remain coded source refusals instead of being mislabeled as login errors.

## Controlled regression evidence

The first native-shaped regression failed because the existing projection omitted the checked parent file with unknown MIME. An earlier fixture used a MIME/content-part shape the current Provider does not produce and failed the trust gate; it was corrected rather than weakening that gate.

Focused tests cover the actual single-parent descriptor shape, exact original CSV bytes, no resource-key disclosure, no new attention/model calls, retained projection and bytes after restart, stopped acquisition, unbind/revocation, independent paths, loss of Human membership, bounded downloads, explicit-only UI actions, capability-unavailable fallback, cancellation, safe application selection and CLI owner/byte/refusal behavior. Six focused files passed all 46 tests. A 153-test broader CLI/media run passed 152 tests and timed out in one existing image independent-path case; both image/file variants passed the immediate isolated rerun, and the complete media file then passed all 12 tests serially. The original timeout remains preserved and is not reported as a completely green broader run.

Lint/source policy, CLI parity, bilingual release-fragment validation, typecheck including mobile, formatting and production build passed during candidate preparation. The Windows top-level docs command failed at `sync-slides.mjs` spawning `pnpm`; the dedicated Astro docs-site build passed with 560 pages. Before connecting an App, both new CLI commands also returned one coded refusal against the real Host without writing a file. These checks are separate from native Lark and installed-product acceptance.

## Native window and remaining qualification

The Human confirmed registered **Lark QA2 / BotHarness Cloud QA** was idle and authorized this isolated window. After earlier browser failures, a fresh T3 preview tab restored control. The signed-in Human account and QA2's existing private chat and dedicated test group were checked before sending. Other Apps and receivers were left unchanged.

The task-owned Host used pinned DSH 0.2.0-rc.2 and the unchanged qualified Provider source `beaed4a6dabb583654d28fb09298716267039b4a`. Authenticated doctor checks passed before and after connection. Both model roles were set to official DeepSeek Flash; a real Web DM returned `42`, and canonical usage recorded the official route. A 30-minute stop guard was armed before binding QA2. The first management call rejected an internal `consumerMode` argument; the corrected public credential-binding call and normal Bot identity consumer transition then succeeded. No test message was sent during the intermediate setup.

The fresh native path passed on 2026-10-16 JST:

1. Distinct private/group setup requests produced provider-accepted `CONNECT_OK` and `GROUP_OK` receipts. The group request used the native Bot mention menu. The existing group was connected to a new local Channel through the public Channel Bridge owner, with mention-only collection.
2. A synthetic `LARK_1022_SOURCE_20261016_A.csv` was uploaded through Lark's Local files and Send File UI. Its original contents were `name,quantity\nalpha,17\nbeta,221\n` (32 bytes). A real quoted reply to that exact file, with the native Bot mention and marker `LARK_1022_FILE_20261016_A`, requested only `FILE_RECEIVED` and told the Bot not to acquire the file.
3. Canonical evidence contains the exact native parent association, `mentionedAccount=true`, one filename-only descriptor, one Channel placement and a provider-accepted `FILE_RECEIVED` receipt. The actual Channel rendered the filename and generic File label in the request bubble without inventing MIME or size. The genuine dark capture was inspected and retained privately.
4. Clicking the actual file card produced a forced-download Blob containing the exact original 32 bytes. The real CLI downloaded the same bytes to a new file. Both SHA-256 values were `e2b2f68acee5d6d6ed8d7353459e202ac1f618ed25a5cd23505e2f6c716f4821`. Native source MIME remained unknown; the HTTP acquisition sniffed text/plain and the browser download used application/octet-stream.
5. Before Human download there were no managed file records. Afterward there was one. Source Events (6), Inbox Admissions (4), Outbox intents (3), Outbox attempts (3) and settled usage were unchanged by viewing. Disabling this Channel Bridge still allowed the acquired original; unbinding the Bot identity then refused cached download with `source-unavailable` through the real CLI.
6. The browser connection disappeared again immediately after selecting the native application-menu action. Its visible result was not observed. The exact task-owned Host was stopped early at 05:24 JST, before the 05:44:53 cutoff, and QA2 returned to idle. Private Profile evidence and guard records were retained; other receivers were not restarted.

Remaining qualification includes visible refresh and same-Profile restart history, the actual native application-menu result, matched base/candidate light/dark GitHub-rendered evidence, installed-product acceptance and Human feedback. Stop-before-acquisition, independent paths and failure/retry cases have controlled coverage but are not all native-platform checks. The issue stays open and the PR stays draft; this run does not authorize merge or deployment.
