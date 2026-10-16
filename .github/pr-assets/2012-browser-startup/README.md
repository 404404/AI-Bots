# Browser startup #2012 — PR #2018

Final source: `5d81064d78ee4c2dabfa78c755c00908c780b423`; starting main: `0f9f690071c5345eed4427bdcc5ad2471ff77474`.

## What was established

A deterministic Host-route test holds the real Provider's window-open operation pending. Before the fix, observation published a local viewer URL while `focused` was null, and the frame route returned `404 no browser tab`. The regression failed before the implementation change; it now passes. The original intermittent failure's response body was not saved, so this is a proven startup race, not proof that every historical 404 had that cause.

The local viewer is now published only after a current owned tab exists. It reports the first-frame wait, distinguishes stopped/no-tab 404 from unavailable-frame 503, bounds each frame request to 15 seconds, and ends automatic polling after a failure. Existing Reconnect is explicit recovery. Delayed frames recheck authority; no new durable state or alternate target is introduced.

## Verification by layer

- Local: [497 passed, 8 gated skips](focused.log), [lint](lint.log), [format](format.log), [typecheck](typecheck.log), [build](build-final.log). Focused checks ran on the implementation commit; the final commit adds only screenshot assets and their README. The final build and live runs bind the final source above. Full local suite not run.
- CI: [final-source verify](https://github.com/BotHarness/DeepSeekBot/actions/runs/38944069595) — captured `completed` / `success`. [Full job snapshot](ci-final.json). Model E2E and full shards are not claimed; this PR uses affected tests, static/build, docs and isolated smoke.
- Runtime: **two independent default Local cold starts PASS** on final source: [verified](verified/run.json), [repeat](repeat/run.json). No Reconnect action, empty console/HTTP errors, same-Bot/tab Web and CLI readings, deterministic fixture pixels, Stop and Access-off refusals. [Coverage table](coverage.md) selects only this narrow Browser row.
- Light/latency supplement: [third final-source run](light-wait/run.json) uses the same real Host plus browser-side 1500 ms network latency during Open, then removes it. No response/state mock. The [visible Connecting overlay](light-wait/first-frame-wait.png) and [iframe waiting status](light-wait/first-frame-wait-status.json) precede the [actual fixture](light-wait/running.png), without Reconnect or HTTP/console error. This is a labeled latency experiment, not a separate product state.
- Agent visual: screenshots, ARIA and Browser frames inspected for all three final-source runs. Their hash-bound `visual-review.json` files record scope. The transient inner waiting text is covered by the executed viewer-script test and captured DOM status; the outer viewer covers it with its existing Connecting overlay.
- Independent reviews: Standards **0 findings**, Spec **0 findings**, against implementation `cd39d08994765058ca1a5d19cf6ad2d0a10d22dc`; the following commit only adds real screenshots/README.
- Human QA, model, native device and IM: **not run**. [Human verification path](human-qa.md). No merge, release or deployment.

## Failure history and evidence integrity

- [Original first failure](first-failure/run.json), [HTTP](first-failure/http-errors.json), [console](first-failure/console.json), [recovered screenshot](first-failure/running.png) remain **FAIL**, bound to historical source `4116e181cfeba38938c698f55f1260994f9fa1f7`. The screenshot follows recovery and is not a picture of the original 404. [Original immutable packet](https://github.com/BotHarness/DeepSeekBot/blob/2a8f83ced944d0d043f1e5c3292b835e0c636812/.github/pr-assets/1976-merged-browser/README.md).
- Current-main baseline [attempt one](baseline/run.json) and [attempt two](baseline-repeat/run.json) did not reproduce the intermittent HTTP error. They are historical observations, not final-source passes. [First repaired-source attempt](first-fixed/run.json) is also retained separately.
- [Pre-fix failing Host regression](regression-red.log) and [pre-fix frame/Access regressions](frame-regression-red.log) retain the deterministic failures.
- [Expiry controls](evidence-controls.json): missing image, stale source or dirty source requires revalidation; no run selected stays not-run. [SHA-256 manifest](sha256.json).

## Cleanup and review aids

All three task-created Hosts stopped; each runner stopped its own Browser and fixture. Profile, Memory and evidence remain: [baseline](cleanup-ax2012-baseline.json), [first fixed](cleanup-ax2012-fixed.json), [final](cleanup-ax2012-final.json). The loopback fixture addresses are correlation evidence, not shared live services. Host tokens/login URLs and private paths are omitted.

[Chinese explainer source](pr-explainer.md) · [downloadable HTML](pr-explainer.html) · [desktop render](explainer-desktop.png) · [narrow render](explainer-narrow.png). HTML is a review aid, not runtime evidence. Both viewport renders were checked for readability and overflow.

Agent-Task: `codex/local/01a1444a-0b96-7aa1-b677-220c4053cb4a`.
