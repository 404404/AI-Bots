# Three-action approval evidence (#2080 / #2316)

Captured 2026-10-20 on Windows with DSH 0.2.1-rc.2, a real opted-in OpenCode Go / deepseek-v4.1-flash model and an isolated task-owned Profile. English, 1440 × 1100, matched light/dark themes and the same synthetic PowerShell marker behavior. Full images are unaltered browser captures; `-card` images are browser element crops. No login token or real credential appears.

- Before: clean `b018929ede0aadd3fd350241bdad911c2d90bff4`, four legacy actions and the Full Access shortcut. Existing native pwsh request was captured without answering it, then rejected through the normal Owner command.
- After: clean production source `a84f9dd12ac9b890d8a748ca77db3502b4ecdffc`, three actions and a current-tool scope disclosure. Real Web **Always allow** created a `tool` rule. Native pwsh produced the actual marker. Changed arguments succeeded without another card, another tool still asked, and CLI revocation restored asking.
- Human-only: the same new source, explicit Full Access already on. A synthetic `grant-write-set` command still requested Human approval. **Always allow** is disabled with a reason. Reject produced a native denied result; the synthetic target cannot change a real authorization. The first automated guard capture clipped the bottom action; it is retained privately. These replacement captures scroll the native card fully into view before capturing. The verification runner includes that framing correction.

`proof.json` retains sanitized canonical assertions and bounded native tool results. Full Channel messages, ARIA, diagnostics and logs remain in the private task evidence directory. The model response alone was not treated as execution proof: each marker also required a successful native tool trace.

Reproduce: `node scripts/verify-app.mjs launch --name ax2080-simple`, doctor, then `node scripts/e2e-tool-approval-simple.mjs --name ax2080-simple`. Use `BOTHARNESS_AX_MODEL=deepseek-v4.1-flash` as the documented per-launch override if the machine's saved model is absent from the pinned catalog.

Pending Human acceptance; no merge. Native mobile UI and IM new-rule creation are outside this Web tracer bullet. Companion and Activity reuse is covered by focused component tests; only the Channel surface is shown in these captures.
