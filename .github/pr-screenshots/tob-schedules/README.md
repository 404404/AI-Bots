# Tob scheduled work — #2093

These are real interaction states from one synthetic isolated Web Profile, not a UI redesign, mockup, or base-versus-head visual comparison. The base revision did not expose schedule management in Tob's scoped CLI. Existing schedule UI components are reused.

- Product head: `cc4f14d6db734830cba46dc8a5df2da5c014f5ba`.
- Stack base: `a3e2c4e64d131191e686e33cb207d3db9b3a0937` (unmerged #2119).
- Web captures: 1440 × 900, dark theme, Chinese locale, synthetic Bot/task only.
- **Before pause:** `before-enabled-next-run.png` shows the created task enabled with its next occurrence. This is after reviewed Tob creation, before the later edit/pause request.
- **Execution:** `execution-history.png` shows the changed title and actual firing history; matching synthetic DM messages remain visible. It includes handled firings and a then-running occurrence.
- **After pause and restart:** `after-paused-restart.png` shows the same task disabled, its handled state, and the actual synthetic DM result after restarting the committed candidate.
- Captures use different existing panel arrangements; this evidence proves interaction outcomes, not a layout change. No image was edited or generated.
- Natural Web creation/edit/pause and firing captures precede the final narrow correction for replaying an identical one-time request after its deadline. Final source tests and rebuilt committed restart-read cover that final correction/state. Do not describe the earlier model journey as a repeated exact-head model run.
- `evidence.json` contains a selected, sanitized canonical firing, Session, successful `channel_send` and its exact message ID. It omits private launch manifests, login URLs, credentials, raw Shell environments, filesystem paths and unrelated conversations.
- Native startup catch-up revealed a credentials Service ordering failure after two earlier successful executions. The inspected `native-startup-failure-before-fix.png` and sanitized canonical JSON preserve this failure; the source fix has two passing startup regressions, root types and build at `fb6cf4ff011594bcc80bdaa28e4b03136306dc94`. Native rerun after this fix, Human QA and CI remain pending. The isolated test task is disabled; only the separate direct-test task was deleted. The task-owned Host was stopped with its Profile retained for later readback.

See [verification.md](verification.md) and [verification.zh.md](verification.zh.md) for phase results and limitations. Screenshot dimensions and SHA-256 digests are recorded in [evidence.json](evidence.json).
