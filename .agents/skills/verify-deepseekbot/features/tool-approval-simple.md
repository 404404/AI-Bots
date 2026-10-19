# Three-action tool approval and coherent Full Access

## Sub-features

- Behavior ID: `desktop.approval.three-actions`.
- Ordinary Channel, Activity and companion reuse renders Allow once / Always allow / Reject.
- Always allow remembers only the selected tool in the current Bot/role/authority scope; changed inputs match, another tool or revoked rule does not.
- Human-only management keeps the middle action disabled with a reason. Full Access ordinary actions do not ask, while permission management can reach the native Human decision path.
- Schema generation 104 preserves legacy rules and normalizes old top-level Full Access Assignment approval policy without widening its permissions.

## How to get to it (user POV)

Bot mode → the synthetic **2080 审批体验** Channel → Messages → a native PowerShell approval card. Read the disclosed current-tool scope, then choose **Always allow**. A later changed-input call of that tool completes without a new card. Revoke the saved rule in the folder/access panel, or through the online CLI, and another request asks again.

Enable Full Access for only that QA Bot through its existing confirmation. Ordinary marker output runs directly. A recognized permission-management command still produces an individually confirmed card; Always allow is disabled. Reject it and verify no authorization was changed.

## Driving it with verify-app

```bash
pnpm build
node scripts/verify-app.mjs launch --name ax2080-simple
node scripts/verify-app.mjs doctor --name ax2080-simple
node scripts/e2e-tool-approval-simple.mjs --name ax2080-simple
```

This Windows native-pwsh journey creates a synthetic Bot, uses real model calls, clicks Web Always allow, then checks changed input, other-tool rejection, CLI revoke/allow-once, Full Access ordinary output and Human-only management. It retains screenshots, card crops, ARIA, Client diagnostics, native trace, canonical decisions and rules. The model must report actual tool output; a successful decision call is not execution proof.

For a baseline capture, provide `--capture-report <private-json> --expect-legacy`. The private record identifies an existing task-owned instance, Bot and pending request. This mode reads and captures only; it does not decide or create a Bot. Never use a Human's real request as a disposable verification input.

## Gotchas

- DSH native pwsh uses `sandbox_permissions: danger-full-access`, not Codex's `require_escalated`. A harmless output marker explicitly requesting that mode can exercise the real ask without touching a sensitive file.
- DSH `never` rejects before answerers. Top-level Full Access now keeps `ask`; delegated Subagents retain their native policy. Do not bypass never to manufacture a pass.
- The current shell has a Preview Notice and a workspace rail. Dismiss the actual Continue dialog before navigating; do not wait for a Settings button hidden under the account menu.
- Preserve a failed run and observe before retrying. A model that refuses to call the requested tool is a failed model-path attempt, not a successful approval test.
- Native mobile UI, IM new-rule creation, every Shell Provider, and the full recovery matrix are not qualified by this Web slice. Mobile reads the new history value while retaining its legacy decision behavior until its own qualified slice.
