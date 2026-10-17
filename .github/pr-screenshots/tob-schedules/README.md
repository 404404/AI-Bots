# Tob scheduled work — #2093

These are real interaction states from one synthetic isolated Web Profile, not a UI redesign, mockup, or base-versus-head visual comparison. The base revision did not expose schedule management in Tob's scoped CLI. Existing schedule UI components are reused.

- Original Web product head: `cc4f14d6db734830cba46dc8a5df2da5c014f5ba`.
- Stack base: `a3e2c4e64d131191e686e33cb207d3db9b3a0937` (unmerged #2119).
- Web captures: 1440 × 900, dark theme, Chinese locale, synthetic Bot/task only.
- **Before pause:** `before-enabled-next-run.png` shows the created task enabled with its next occurrence. This is after reviewed Tob creation, before the later edit/pause request.
- **Execution:** `execution-history.png` shows the changed title and actual firing history; matching synthetic DM messages remain visible. It includes handled firings and a then-running occurrence.
- **After pause and restart:** `after-paused-restart.png` shows the same task disabled, its handled state, and the actual synthetic DM result after restarting the committed candidate.
- Captures use different existing panel arrangements; this evidence proves interaction outcomes, not a layout change. No image was edited or generated.
- Natural Web creation/edit/pause and firing captures precede the final narrow correction for replaying an identical one-time request after its deadline. Final source tests and rebuilt committed restart-read cover that final correction/state. Do not describe the earlier model journey as a repeated exact-head model run.
- `evidence.json` contains a selected, sanitized canonical firing, Session, successful `channel_send` and its exact message ID. It omits private launch manifests, login URLs, credentials, raw Shell environments, filesystem paths and unrelated conversations.
- Native original management passed on cc4f14d6. Current-source `5ae3ed1f8dd966a64756bfb93dede338ad668cf1` independently passed safe old-event recovery and one new missed-occurrence startup firing with a fresh exact reply; the task is handled and paused. `native-startup-recovered-paused.png` retains the historical red failure card, followed by recovery and new-firing replies. Candidate stopped and main Desktop restored by parent. Human QA and final-head full CI remain separate.

See [verification.md](verification.md) and [verification.zh.md](verification.zh.md) for phase results and limitations. Screenshot dimensions and SHA-256 digests are recorded in [evidence.json](evidence.json).

Native screenshots are 2522 × 1640, dark / Chinese, copied unchanged after inspection. Their exact product heads, captions, digests and canonical correlation are in [native-verification.json](native-verification.json).
