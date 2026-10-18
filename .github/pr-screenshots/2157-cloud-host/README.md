# Host cloud connection UAT checkpoint

Issue #2155 / Draft #2157; two distinct isolated DSH Profiles and Bots, real Cloudflare UAT. No Prod or merge.

- Initial import/binding runtime: `1a4983f5a69e7f5c7d44ef9fae421912852fde7e`.
- Restart/readback and after screenshots: `eee4047bf8ca51dcf81a2fadfc1935e15f0dc629`.
- Cloud runtime: `3eeed5b05782276b1a02cc2412dd04ab0ec60bca`, schemas 5/4/5.
- Before image shows the imported account **before binding**, not a baseline without this feature. After images show the existing Apps surface retaining its binding after restart. Viewport 1440×900, Chinese locale. Browser console checks reported zero issues. Images were visually inspected.

## Observed

Private CLI import qualified separate channel Agents and saved credentials through the native Credentials provider. A bound through the actual Apps picker; B bound through the parity CLI. Both reported receiving. Human plain text advanced both cursors without a new model turn. Explicit Messaging grants then permitted one fixed CLI send from each real Host; cloud history confirmed the two distinct canonical Agent authors. Both Profiles restarted without deletion; retrying the original Outbox request IDs retained the same receipts and exactly four total cloud messages. The fourth message was a fixed health request while both local work allow-lists were empty; A's model trace stayed at its earlier successful local DM turn, and B still had no model session. This is not an execution-ledger proof.

The initial OpenCode Go model probe failed with quota 429. Only the two synthetic Bots were changed to the already configured official DeepSeek route; A's real DM returned 43. This does not prove cloud work execution or B model readiness.

## Retained failures and limits

Initial English navigation selector did not match the Chinese shell. The binding action succeeded, but waiting for nonexistent “已绑定” text timed out; formal readback and fresh screenshots confirmed the actual Bot-name/unbind state. Sandboxed process checks falsely reported dead Hosts; checks with local process access passed, and the attempted relaunch safely refused a running PID. No Profile was replaced.

Initial CI had two endpoint inventory failures and one real recovery-mode startup failure. The fix defers cloud Provider registration when the Operational Database is unavailable; 51 entry/cloud tests, direct root/mobile typechecks, build and lint passed. The aggregate typecheck wrapper hit pnpm's existing dependency-symlink task-state restriction; its two underlying checks passed separately. Final remote CI is a separate gate.

Pending: explicit ordinary-message wake overrides and bridge boundary coverage; typed Source Event/Inbox authorization; bounded work owner and model-mediated A-to-B forwarding; interruption between source commit and checkpoint; runtime connection removal; WebSocket; organization-wide Agent membership. Phone, Android and Human QA are not established by this desktop Host evidence. No video was captured in this checkpoint.
