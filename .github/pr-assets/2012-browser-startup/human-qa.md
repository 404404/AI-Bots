# Human verification — #2012

Source: `5d81064d78ee4c2dabfa78c755c00908c780b423`. Human QA has not run. Use a fresh isolated worktree/Profile, not production or another task's Host.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-app.mjs launch --name ax2012-human
node scripts/e2e-browser-lifecycle.mjs --name ax2012-human
```

The runner is the exact [maintained feature-map path](https://github.com/BotHarness/DeepSeekBot/blob/5d81064d78ee4c2dabfa78c755c00908c780b423/.agents/skills/verify-deepseekbot/features/browser-lifecycle.md). It creates a disposable Bot and deterministic local fixture; results stay provisional until screenshot/ARIA inspection. It never runs a model or contacts an external website.

For manual interaction, open the launcher's **machine-local** login URL. Enter Bot mode, select a disposable Bot, open Browser, enable Browser Access, and click Open Bot Browser. During startup expect Connecting/waiting, then a running viewer; no transient browser-not-running error should appear. Leave fullscreen. Use the public `browser-tool <bot-id> browser_open --args-stdin` with a local fixture URL, and compare the visible page to `browser-observation <bot-id> --out /absolute/path/frame.jpg`, `browser-tool <bot-id> browser_tabs --args-stdin` with `{"action":"list"}`, and `browser-tool <bot-id> browser_observe`.

Click Stop; require stopped, no tabs/current frame. Direct observe must refuse without restarting. Disable Browser Access; direct open must refuse distinctly. Preserve HTTP/console errors and screenshots before any retry. Reconnect is a separate recovery action and cannot convert a failed cold start to pass.

Inspect the waiting/error text and evidence format. Record Human verdict separately from agent visual inspection. Stop only the exact Host PID from this named instance's instance.json after checking ownership; retain its Profile/Memory and evidence. Do not use `verify-app stop`, which deletes the Profile.
