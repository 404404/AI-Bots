# #1974 — temporary Workspace Grant verification

PR: [#2001](https://github.com/BotHarness/DeepSeekBot/pull/2001). Source: `81e24bd81b3bb94939ccfc6ad2cd5aa9e744e695`; clean checkout. Started from main `1d1f8ac0cfeb26a8f3bf3a04550e6b92cee52bd9` after dependency #1972 closed with Human feedback and no competing #1974 claim.

**Result: the one temporary Grant path passes.** This does not qualify all Workspace/Shell boundaries, native file tools, model execution or IM. [#1841](https://github.com/BotHarness/DeepSeekBot/issues/1841) and [#1957](https://github.com/BotHarness/DeepSeekBot/issues/1957) remain unresolved.

## Evidence by layer

| Layer | Result | Evidence |
| --- | --- | --- |
| Local checks | Pass: 90 focused tests; lint, format and build | [Focused tests](checks/focused-final.log), [lint](checks/lint-final.log), [format](checks/format-final.log), [build](checks/build-final2.log) |
| CI | All applicable jobs pass at source above: affected tests, lint/format/typecheck/build, docs, isolated Host smoke | [Exact-head check URLs](checks/ci.json). Full-shard and real-model jobs were intentionally skipped; no full-suite/model claim. CodeRabbit check is successful, both findings resolved and no new inline finding; [review record](checks/coderabbit.json). |
| Real Web/CLI | Pass: actual Web authorization, existing Host authority, direct attachment-import read, explicit CLI revocation, repeated-read refusal | [Run](verified/run.json), [one row](workspace-row.md), [full inventory](coverage.md), [machine report](report.json) |
| Agent visual inspection | Pass: inspected before/granted/after screenshots and full ARIA; same Bot and sample folder, counts 0/1/0, Full access off | [Receipt](verified/visual-review.json), [before](verified/before.png), [granted](verified/granted.png), [after](verified/after.png) |
| Host/Client diagnostics | Healthy independently in all three phases; empty console errors | [Before](verified/before.diagnostics.json), [granted](verified/granted.diagnostics.json), [after](verified/after.diagnostics.json), [console](verified/console.json) |
| Human QA | Not run for #1974 | Runnable path below; agent visual review is not Human acceptance |
| Model / native / IM | Not run | Not part of this proof |

Observed 2026-10-16 23:34–23:35 JST (14:34–14:35 UTC): macOS arm64, Node 24.21.0, DSH 0.2.0-rc.2, Chrome 153.0.8010.36, desktop 1440×1100, English/dark. No model call or message was sent.

Same PersonaBot `bot-32d94147af92418486d9acdaeb18bcf3`, Workspace `e37d4bef-6ec1-4353-9843-8c21ecb8919b`, Grant `eed2a665-a46f-40d2-96df-225700753571` throughout:

1. [Before](verified/before.json): no Grant; [read denied](verified/read-before.json).
2. Real Web form and confirmation produce the [active Grant](verified/granted.json). [Read succeeds](verified/read-granted.json) and imports only the 43-byte temporary README into an independent Attachment.
3. [Without confirmation](verified/unconfirmed-revoke.json), CLI returns `usage` / exit 2; [same Grant remains active](verified/after-unconfirmed.json).
4. [Explicit revocation](verified/revoked.json) marks the same record revoked. [Authoritative history](verified/after.json) retains that record; [the same read is refused](verified/read-after.json) with `outside current authorized directories` / exit 1.
5. Reloaded Web shows zero active workspaces. DSH's collapsed registered-folder picker can retain the directory; that is not an active Grant. [ARIA](verified/after.aria.json) agrees with the screenshot.

The fixture was task-created outside Host/user/repository roots and contained only the sample. [Fixture cleanup](verified/cleanup.json) and [all owned Host/fixture cleanup](cleanup-summary.json) are complete. All screenshots show only disposable test content. Private launcher credentials, host paths and fixture metadata are excluded; JSON paths are redacted.

## Failure history and evidence controls

Failures are preserved, never replaced by the successful record:

- Initial build preparation at `5d544095c` failed from disk exhaustion: [sanitized build log](checks/build-run1.log).
- `8c2190755`: created Bot was not selected; [failure and screenshot](attempts/run2-attempt-1792158747940-91429/).
- `471b00c50`: newly displayed onboarding obscured the Grant dialog; [failure](attempts/run3-attempt-1792159037175-98185/).
- `7c2a2c0f9`: two runs completed authorization/read/revoke but ran out of disk saving final evidence: [run 4](attempts/run4-attempt-1792159166942-896/), [run 5](attempts/run5-attempt-1792159281324-5877/). Some files could not be written; these remain failed, not passes.
- `f6c48c3e5`: a complete capture exposed verifier mismatches (usage exit 2, hidden registered-directory DOM); [failed run](attempts/final-attempt-1792159673622-17861/). Source `3e7929b50` fixes the verifier, not the product permission owner.

[Evidence controls](evidence-controls.json): complete proof passes; missing screenshot and different source require revalidation; no selection is not-run; stopped Host is [blocked](blocked/run.json); the prior semantic failure remains failed. Raw `run.json` records automated steps; the visual receipt is separately required for a qualified pass.

Inventory: 18 feature documents, 132 E2E scripts, 12 mapped (9.1% **script mapping**, not functional/code coverage). Only this behavior is qualified at this source. Other catalogue rows remain unrun; the complete product denominator remains unknown.

## Human verification

Use the [exact-source feature map](https://github.com/BotHarness/DeepSeekBot/blob/81e24bd81b3bb94939ccfc6ad2cd5aa9e744e695/.agents/skills/verify-deepseekbot/features/workspace-grant.md), including isolation, CLI setup references and cleanup instructions. On a clean checkout of this source:

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-app.mjs launch --name ax1974-human
node scripts/e2e-workspace-grant.mjs --name ax1974-human
```

The runner preserves its evidence and exits requiring visual review. Open all three images/ARIA and compare to this packet before recording your own receipt. To operate the UI manually, launch your own named Host, create a new test Bot and dedicated temporary README folder, select that Bot in Bot mode, dismiss onboarding, open Workspace Grants under the composer, enter only that folder and confirm. Compare the same Bot's CLI grants/read results before and after `grant-revoke --confirm`; never use Host data or user-directory ancestors. Stop only your named Host when finished.

[HTML review aid](pr-explainer.html) is source-bound and downloadable for local viewing; [Markdown source](pr-explainer.md) and [desktop preview](explainer-1440.png) are directly readable on GitHub. It explains the flow, not additional runtime proof. Desktop and 390px layouts were inspected; the narrow flow canvas scrolls horizontally within its panel.

This packet was prepared before the explicitly authorized conditional merge. No release, deployment or production-receiver action is included.

## CodeRabbit refresh

The two valid findings were fixed: the Workspace row is in the main headered table and no longer listed as wholly unmapped; browser cleanup preserves an earlier failure reason. [Three direct cleanup-branch cases](checks/cleanup-regression.json) and [GitHub Markdown rendering](checks/map-render-check.json) pass. The generic docstring warning conflicts with the repository no-source-comments policy and was not adopted. Prior proof is [historical only](attempts/pre-review-pass-3e7929b50/run.json); all current proof above was freshly rerun.
