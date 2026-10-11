# SEO AX adapter

Use this entry point when a product coding agent researches SEO, supplies blog evidence, adapts content for a channel, or checks ranking outcomes.

## Ordered workflow

1. Read the canonical [bot-seo shared-VPS runbook](https://github.com/BotHarness/bot-seo/blob/main/docs/maintainers/shared-vps-seo-ax.md) and its keyword-research, seo-report, and content-review skills. If working locally, resolve the bot-seo checkout explicitly; do not assume an adjacent directory or stale untracked spec is authoritative.
2. Follow `AGENTS.md` → VPS over Tailscale for the private machine-local `vps.local.env` setup. Verify your own authorized SSH identity and host key. Keep the existing OpenSEO deployment hands-off: no restart, rebuild, environment change, or shared-port takeover. Use session-local MCP over a loopback-only SSH forward, or SSH requests to VPS loopback.
3. Discover live tools and select the existing deepseekbot.app project. Read its context/reports before research; do not create a duplicate or silently change its default market. Define separate Chinese/English country, language, engine, and device slices.
4. Follow [agent-work-trace](agent-work-trace.md) before product repository implementation. Claim one bounded issue, check concurrent ownership, and include the same task reference in commits and PRs. A coding-agent task is not a DSH Session.
5. Produce evidence for one real task with version/pin, inputs, permissions, result, limitations, and manual correction. Installation intent is not a completed effective trial. Local UI delivery, runtime execution, tests, CI, human QA, merge, and deployment are separate proof categories.
6. Hand evidence to the coordinator; use the canonical write/readback procedure for shared reports and research logs. Do not overwrite another worker's context/report. Confirm paid calls and spend limits before execution; no local-noauth billing exemption is assumed.
7. Use the site's [editorial adapter](https://github.com/BotHarness/deepseekbot-site/blob/main/planning/seo-comparison-series/seo-ax-workflow.md) for content and channel work. Obtain human review before external publication or account activity. Merge is not deployment; observing SEO targets stay unchanged through their cooldown.

## Visual evidence

Capture genuine high-resolution UI at a readable viewport; keep the original capture and document locale/theme/version/task. Redact credentials, chats, identifiers, and private content before public upload. A polished derivative may add a frame, crop, highlights, or labels, but must identify those annotations and must not fabricate controls or execution results. Preserve legible text; never upscale a tiny capture and call it high-resolution evidence. Use repository PR screenshot conventions when the product UI changes.

## Completion and handoff

A completed slice has a traceable issue/PR, repository checks, sanitized real evidence, required human review, and shared-server readback when persistence was authorized. Report gaps explicitly: a shared-read smoke test is not a successful report write or proof that every machine is connected. Leave private connection setup to each authorized machine; publish no tailnet address, SSH account, key, token, internal project ID, private dashboard URL, or profile store.

This adapter changes documentation only. It adds no runtime scheduler, analytics instrumentation, permission grant, service configuration, or deployment.
