# PR #1995 / #1972 — one idle PersonaBot

Verified source: `1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31`; base: `94d08913d214063512605a31db674c334afbfabd`.

[Coverage row](verified/coverage.md) · [Screenshot](verified/activity.png) · [Full ARIA](verified/aria.json) · [Authority](verified/after.json) · [Diagnostics](verified/diagnostics.json) · [Run metadata/actions](verified/run.json) · [Agent visual inspection](verified/visual-review.json) · [Chinese explainer](pr-explainer.md) · [Download HTML explainer](pr-explainer.html)

## Independent qualification

| Layer | Result |
| --- | --- |
| Local | Lint, formatting, typecheck and build passed; 44 focused tests passed. No repository-wide local suite was requested for this script/doc-only diff. |
| CI | [Exact-source verify run](https://github.com/BotHarness/DeepSeekBot/actions/runs/38893887847); consult this run for its current outcome. Affected tests and isolated-Host smoke run; full shards and docs build are intentionally outside this diff's plan. |
| Real runtime | Fresh isolated Host; public CLI creates one Bot; real Web actions show its Idle card; before/after activity, attention and overview read the same Bot ID. |
| Visual inspection | Agent inspected this exact screenshot and ARIA. Target card says Idle / No Session is executing; Actions waiting is zero. |
| Human QA | **Not run / feedback pending**. The Human must judge this path and evidence format before #1972 closes. |
| Model / native / IM | Not run. This does not qualify the full Inbox or model execution. |

All Hosts created by this task have been stopped, and evidence survives cleanup. No release, deployment or production receiver changes. The PR remains unmerged.

## Failures and expiry checks

- [Missing Client observation](missing-client/coverage.md): controlled browser request interception blocked only diagnostic transport. Host remained healthy and UI rendered, but the row is **fail**. The record identifies this as a controlled probe, not a natural product failure.
- [Blank page](blank-page/coverage.md): controlled navigation of the test browser to `about:blank` before capture; missing target card is **fail**, not normal idle.
- [Host unavailable](Host-unavailable/coverage.md): runner invoked after stopping this task's isolated Host; **blocked**, with partial failure/diagnostic evidence.
- [Required screenshot removed](missing-evidence.json) and [wrong source commit](wrong-commit.json): recomputation yields **needs-revalidation**. Original evidence was preserved; deletion was performed only on a temporary copy.
- [First exploratory screenshot](exploratory-first/activity.png), [second](exploratory-second/activity.png), [fixed-viewport exploration](exploratory-viewport/activity.png): dirty-source attempts, never current passes. The first two screenshots did not show the target card despite DOM observations. Fixed-viewport capture and post-capture checks plus required visual inspection address this verifier gap.
- `superseded-*` directories retain earlier clean-source attempts and controlled failures. Their current rows require revalidation because their source commit differs. Historical ARIA loopback origins were redacted for sharing; their original hash manifests were deliberately retained, so they cannot masquerade as intact current proofs. Original private packets remain local.

The `verified`, `missing-client`, `blank-page` and `Host-unavailable` packets were redacted by the final runner before hashing. `verified` recomputes to pass with all shared bytes and its visual receipt intact. Each controlled probe is annotated in `run.json`; probe scripts only change the test browser and do not install product hooks.

## Human verification path

Use a clean checkout of the verified source. Follow [the feature map](https://github.com/BotHarness/DeepSeekBot/blob/1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31/.agents/skills/verify-deepseekbot/features/activity-center-idle.md) to install/build, launch a uniquely named isolated Host, run the journey and record visual inspection. Open its local login privately, enter Bot mode → Activity Center → Show idle Bots, and inspect the named Bot from `run.json`. Stop that Host afterward.

Please comment on #1972 or the PR: does this represent the intended idle behavior, and are the row fields and evidence links sufficient for review? Feedback and any necessary corrections remain a release gate for sibling work. No acceptance or Human QA is inferred from CI or agent visual inspection.
