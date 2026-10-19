# #2080 — three-action approval tracer bullet

Production source: `a84f9dd12ac9b890d8a748ca77db3502b4ecdffc` (clean build), based on main `5fba960d8`. Date: 2026-10-20. DSH 0.2.1-rc.2; Windows; native pwsh; real OpenCode Go / deepseek-v4.1-flash; isolated Profile. #2316 remains draft; Human acceptance and merge have not occurred.

## Qualified behavior

The real Web card had exactly **Allow once / Always allow / Reject**. Clicking Always allow saved a current-tool rule for the current Bot, role and authority scope. A changed-input native pwsh call succeeded without another card; bot_create still asked and was rejected. Online CLI revoked the tool rule, a later pwsh call asked again, and CLI Allow once let it produce its real marker.

Explicit chat Full Access let ordinary native pwsh finish without a card. A recognized `grant-write-set` command still asked for Human approval, with Always allow disabled. Reject produced native `denied` / `Human approval was rejected`. No real permission target was modified. Markers required both native successful tool results and committed Bot replies. Client page errors and warnings: none.

The original guard screenshot clipped Reject behind the composer, so it was not published. A second synthetic guard request was captured after scrolling the real Reject action into view, in both themes, and rejected normally. No product state or DOM was fabricated for a screenshot.

## Automated checks

- Current-tool store: restart persistence, changed inputs, isolation by Bot/role/scope/tool and revocation; legacy exact/broad retention; real generation 102 → 103 migration; top-level Full Access snapshot preserves mode, Grant and revision while moving never → ask.
- Approval coordinator: Human-only mutation skips legacy/current rules and Reviewer; Full Access ordinary answer and execution-time revocation check; decision → persisted rule → changed-input match → other-tool ask → revoke → ask.
- Runtime and Grant policy: root Full Access uses ask; delegated native Subagent policy remains separately owned. Runtime file suite passed 20/20 when run serially. A broad concurrent Windows run timed out an unrelated image-read case and hit cleanup EPERM; no timeout was raised.
- Shared Web card, companion, Activity and history regression tests pass. Secret/MCP, Channel approval and operational database checks pass (53 tests). Mobile history recognizes allowed-always-tool (34 conversation tests); no native mobile UI claim.
- CLI decision forwarding passes; Host/Web/mobile typecheck, lint, format and production build pass locally. See the PR checks for exact final-head CI; local tests are not a substitute for that result.

## Limits and recovery

Schema generation 103 is a one-way binary compatibility boundary: an older Host must refuse the newer database. Revoke remembered rules through their owner, restore the desired mode through the existing access setting, and forward recover; do not downgrade by editing SQL. Legacy rules keep their meaning and can be revoked.

This slice covers Channel Web + online CLI with shared-card component checks. It does not qualify native mobile approval UI, new IM rule creation, every Shell Provider or the complete restart/recovery matrix. Directory authorization remains the separate confirmed read/write command from the first slice. #2080 remains open for later slices.

Public screenshots and sanitized canonical/native proof: [capture provenance](../../.github/pr-screenshots/2080-simple-approval/README.md). Run instructions: [feature map](../../.agents/skills/verify-deepseekbot/features/tool-approval-simple.md).
