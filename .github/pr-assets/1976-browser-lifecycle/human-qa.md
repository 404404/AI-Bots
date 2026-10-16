# Human QA — default Local Browser

This is a fresh manual run, separate from the published Agent observations. No model, production profile or external website is needed.

1. Check out PR #2008 at its recorded source commit in an isolated worktree. Install locked dependencies and build. Launch `node scripts/verify-app.mjs launch --name ax1976-human`. Keep the private login URL local.
2. Run `node scripts/e2e-browser-lifecycle.mjs --name ax1976-human` once. It prepares a new disposable Bot and saves its ID under `.humanlayer/verify/ax1976-human/browser-lifecycle/attempt-*/run.json`. The runner stops its fixture and Browser after recording, but leaves the Host and Bot available. A visual-review-pending exit is expected until you inspect its images.
3. Open the private Host URL from the launcher. In Bot mode select that AX Browser Bot. Close Sessions and Bot Inbox panels; open Browser. Observe permission description and the unlit power button.
4. Start your own fixture in a disposable directory, keep the server terminal open:

```sh
mkdir -p /tmp/ax1976-human-fixture
cat > /tmp/ax1976-human-fixture/index.html <<'HTML'
<!doctype html><title>AX Browser lifecycle 1976</title>
<h1>AX Browser lifecycle 1976</h1><p>Deterministic local fixture: 37 blue boxes.</p>
HTML
python3 -m http.server 8876 --bind 127.0.0.1 --directory /tmp/ax1976-human-fixture
```

If that port is occupied, choose a free one and use it consistently. Do not stop another process.

5. In a separate terminal at the worktree, read the private Host credentials without printing them:

```sh
export DEEPSEEKBOT_HOST="$(node -e 'const i=require("./.humanlayer/verify/ax1976-human/instance.json");process.stdout.write(new URL(i.url).origin)')"
export DEEPSEEKBOT_HOST_TOKEN="$(node -e 'const i=require("./.humanlayer/verify/ax1976-human/instance.json");process.stdout.write(new URL(i.url).searchParams.get("token"))')"
```

Use the actual Bot ID saved in step 2 wherever `<bot-id>` appears. First direct open with access off must refuse:

```sh
printf '%s' '{"url":"http://127.0.0.1:8876/"}' | node packages/deepseekbot/dist/deepseekbot.mjs browser-tool <bot-id> browser_open --args-stdin
```

6. Enable Browser Access in the panel, click Open Bot Browser, then Leave fullscreen. Repeat the same direct open command. Compare the visible fixture title/text/URL with:

```sh
node packages/deepseekbot/dist/deepseekbot.mjs browser-observation <bot-id> --out /tmp/ax1976-human-frame.jpg
printf '%s' '{"action":"list"}' | node packages/deepseekbot/dist/deepseekbot.mjs browser-tool <bot-id> browser_tabs --args-stdin
node packages/deepseekbot/dist/deepseekbot.mjs browser-tool <bot-id> browser_observe
```

Inspect the saved image as well as the panel. If the viewer has an error, record it and use the existing Reconnect button; the button is always present and is not itself an error. Never infer live behavior from a successful response alone.

7. Click Stop. Expect Stopped, No frame yet, No tabs yet. Repeat observation: running false, empty tabs, null focused/frame. Direct browser_observe must refuse with no-tab state. Disable Access and repeat direct open: the refusal must identify Browser Access off; observe no new tab or target switch.
8. Save screenshots, ARIA, direct outputs and `computer-logs --plugin browser --limit 100`. Record Human pass/fail with source commit and environment; preserve any first failure before retrying.
9. Stop the fixture terminal with Ctrl-C. Stop only the Host PID in this named instance's private metadata. Retain the Profile, Memory and evidence; do not call verify-app stop, which deletes the Profile. Remove the two temporary credential environment variables from the terminal.

Do not publish the private instance metadata, login URL, token or Profile. Share only inspected and redacted evidence. This manual path does not qualify model, IM, native, multi-tab, upload, reset, takeover or alternate targets.
