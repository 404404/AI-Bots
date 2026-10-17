# #2094 macOS Native evidence

Parent-controlled isolated macOS runs used the same canonical Profile and synthetic Bot/Workspace as Web, with no Session copy. Product source/core build: `f9fcb32bc65d0453fdd0559bb7b75b6dc9a7ca45`; Client code unchanged since build `64b58045a`. Documentation, test-inventory and evidence descendants do not change that product.

| Native journey              | Actual result                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grant revocation            | Fresh Human review, completed/handled in 15.350s; zero active grants.                                                                                  |
| Approval refusal            | Human CLI reset template to off as fixture; fresh Tob review denied, completed/handled in 21.444s; baseline stayed off.                                |
| Approval change             | New Human request and approval; cautious template saved, completed/handled in 22.573s.                                                                 |
| Connector policy            | Human CLI enabled the local fixture, then Tob's reviewed disable completed/handled in 18.237s; enabled=false, revision6, available=false. No delivery. |
| Read-only grant             | Fresh Human review, completed/handled in 19.767s; exact synthetic Workspace, one active grant, orchestratorWrite=false.                                |
| Existing settings UI        | Rendered granted Workspace and cautious template in the real Native renderer, light/dark.                                                              |
| Same-Profile Native restart | Exact grants matched the prior Native result; cautious template and disabled alerts revision6 persisted; process-local receipt projection reset.       |
| Feishu start                | Reviewed native Shell CLI call completed/handled in 17.079s; credentials state with one opaque receipt.                                                |
| Human continuation          | Existing Applications/private form adopted that exact Provider attempt; two actual Network setup.poll calls, no setup.start or credentials.            |
| Status                      | Real Tob read completed/handled in 12.739s; same credentials state.                                                                                    |
| Cancel                      | Fresh Human review; completed/handled in 16.164s; original attempt cancelled.                                                                          |
| Finished UI                 | Native Applications disabled continuation for cancelled receipt.                                                                                       |

Independent checks confirmed the original native attempt ID was absent from both Tob's trace and the Human CLI resume output. The optional passive RPC observer was not installed because this Native transport had no RPC override; the two observed polls came from actual Network requests. No response or owner state was simulated.

The committed Native captures are original 2522 × 1640 renderer screenshots. Credential inputs are empty. The parent stopped each exact candidate and restored the main Desktop in its wrapper's finalization.

First helper failures are preserved privately. Initial renderer selection used the wrong URL. A first-match visibility wait later chose a hidden control despite a fully rendered UI. Finally, a carried-over Workspace dialog blocked the IM entry. The last failed IM entry submitted no new Human Source Event, confirmed from read-only canonical metadata. The final helper uses the observed product renderer, visible controls, native viewport, and actual modal Close/Escape actions between phases. No product fallback or automatic policy retry was added to hide these failures.

Full CI is green at exact source/documentation head `496d76ed9c0b4bd99b6d6d06b6888ccd0b8067e2`: https://github.com/BotHarness/DeepSeekBot/actions/runs/39077048323. All three test shards, docs, lint/format/typecheck/build, mobile bundles and isolated smoke passed. Any later evidence-only head has its own CI status.

Native proof is local policy and setup-state verification. No external message, credential submission, QR scan, device launch or OS-consent claim. Integrated-stack runtime and Human QA remain pending; no merge or deployment.
