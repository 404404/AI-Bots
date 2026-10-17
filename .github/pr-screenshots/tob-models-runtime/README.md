# Tob model/runtime approval evidence

Real DSH 0.2.0-rc.2 captures for #2088. Before is the previous #2087 Web approval capture already committed on the base branch; it demonstrates the prior Assignment-limit-only entry. After is a real candidate Web developer-mode proposal. These are comparable operation/decision crops, not a layout redesign; the proposed setting intentionally differs. No mock UI is used.

The candidate approval names the actual CLI command and target, previous values, patch and expected revision. Model writes separately scope the target Bot and recheck both model availability and revisions after review. Release installation/restart always require a fresh Human decision, even with full access or automatic approval rules.

Direct CLI verification covers model catalog, customize, preset create/update/apply, Assignment plan, default-model isolation and inherit (20 successful commands). Focused source tests separately cover authority, input validation, stale review, cancellation and maintenance boundaries. The development Profile cannot install a published Bundle or restart into a pending update: refusal evidence must not be described as successful installation/restart.

Runtime result summaries and exact head evidence are recorded in the PR. Raw traces, login URLs and private Profile paths remain machine-local. Human visual review and merge are pending.

Actual macOS Desktop model readback is captured in `after-desktop-model.png`: after accepting Tob's CLI model-plan proposal, the existing model settings dialog shows an independent Orchestrator model with Assignment choices still inherited. The background contains only the isolated synthetic QA conversation. Web and Desktop separately passed query, approve, deny, stale-review and model-plan/UI readback; maintenance refusals and final restart persistence also passed on each platform. The native restart checked the explicit expected developerMode=true value after a fresh candidate process launch; Web checked false after its own restart. Main Desktop was restored. Initial Companion-overlay targeting failures were retained and fixed in the driver.
