# #1975 Memory history and safe restore evidence

[PR #2003](https://github.com/BotHarness/DeepSeekBot/pull/2003) · source `9636c460b556e98f0155a4c021d03cbdbf39daf2` · base `53b98377154eef2878bfbac975f9da9225222657`.

**Qualified:** one disposable PersonaBot, one file, two owner-saved versions, historical read, safe commit restore and stale expected-head refusal. The existing product owner and APIs are unchanged.

| Layer | Result |
| --- | --- |
| Local regressions | 146 evidence/report tests + 21 existing Memory CLI/UI tests passed |
| Local checks | lint, format, typecheck and clean-source build passed |
| CI | [Exact-head verify run](https://github.com/BotHarness/DeepSeekBot/actions/runs/38921731675); inspect its current conclusion separately |
| Real isolated Host | Pass, macOS arm64 / Node v24.21.0 / DSH 0.2.0-rc.2 / Chromium 153 |
| Agent visual inspection | Four screenshots/full ARIA inspected; pass receipt is hash-bound |
| Human QA | Not run; use the path below |
| Model, native devices, IM | Not run and not qualified |
| Cleanup | All four task Hosts stopped; test Profiles/Memory and evidence retained |

Bot `bot-983ca30b68de40c98ee1be16d1a7c565`. File `AX-1975.md`.

| State | Memory HEAD | Content |
| --- | --- | --- |
| v1 | `07e47b393f4f5907454406b00e6f4a1749f10ef9` | AX Memory version one. |
| v2 before restore | `c371b11c157378f791f3ec3ebc96a9812d8813ce` | AX Memory version two. |
| restored | `c5360829f856c475bd214b53da51868149ad7d2b` | AX Memory version one. |

The restored HEAD has v2 as its only parent; `backup` is null for this clean fixture. The saved checkpoint records v2. A subsequent request to restore v2 while expecting the obsolete v2 HEAD returns exit 1 / `memory-conflict`; both current content and restored HEAD remain unchanged. See [graph](verified/graph.json), [restore](verified/restored.json), [refusal](verified/refusal.json), [final read](verified/refused.json).

## Real visible states

Before restore: current version two.

![Current version two](verified/before.png)

Read historical version one; the diff's SHA is the target, while the graph HEAD remains v2.

![Historical version one](verified/history.png)

After restore: current version one and the new descendant HEAD.

![Restored version one](verified/after.png)

After stale-head refusal and a fresh Web reload: version one and the same restored HEAD.

![Unchanged after refusal](verified/refused.png)

[Independent coverage row](memory-row.md) · [full catalogue](coverage.md) · [machine report](report.json) · [visual receipt](verified/visual-review.json) · [evidence expiry controls](evidence-controls.json).

The catalogue maps 13/133 E2E files (9.8%), with 19 feature documents. This is script mapping, not code/function coverage. Only the selected Memory row passes on this commit; other rows are not silently inherited.

## Retained failures

- [First attempt](historical-attempts/first/run.json): obsolete Memory-tab locator timed out; Host and Client healthy.
- [Second attempt](historical-attempts/second/run.json): historical row was exposed as a listitem named by full SHA, not a button.
- [Third attempt](historical-attempts/third/visual-review.json): CLI semantics passed but the Refresh click unexpectedly opened Panels; visual review rejected it. Final proof uses a fresh page reload. No underlying product fix is claimed.
- [Stopped Host control](stopped-host/run.json): blocked, with partial diagnostics. Missing image, stale commit and dirty source separately become needs-revalidation.

These attempts remain immutable historical records. They do not qualify the final source.

## Human verification path

Follow the [Memory feature recipe](https://github.com/BotHarness/DeepSeekBot/blob/9636c460b556e98f0155a4c021d03cbdbf39daf2/.agents/skills/verify-deepseekbot/features/memory-restore.md). Build this clean source; launch a uniquely named isolated Host and run `scripts/e2e-memory-restore.mjs --name <name>`. Open the private launcher URL locally, select its new AX Memory Bot, and open Memory files / AX-1975.md and Memory evolution. Compare the file, both historical commits and the restore commit against that attempt's CLI outputs. Record Human feedback separately.

Stop only that instance's recorded PID and keep its Memory repository; do not run verify-app stop, which deletes the Profile. No remote push, credentials, branch switch, real Bot modification or Memory folder deletion is part of this recipe.

[Review explanation (Markdown)](pr-explainer.md) · [HTML download](pr-explainer.html) · [desktop preview](explainer-desktop.png) · [narrow preview](explainer-narrow.png). The explainer is not runtime evidence; GitHub may serve HTML as a download.

Task: `codex/local/01a1444a-0b96-7aa1-b677-220c4053cb4a`.
