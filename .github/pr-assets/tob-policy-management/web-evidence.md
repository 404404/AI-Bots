# #2094 verification record

Issue: #2094. Agent task: `codex/local/01a145b7-59ea-73c3-9e1f-104d93d7ab60`.
Base: `a3e2c4e64d131191e686e33cb207d3db9b3a0937` (#2119, unmerged).
Final product source: `f9fcb32bc65d0453fdd0559bb7b75b6dc9a7ca45`.
Later documentation, test inventory and evidence descendants do not change the qualified product.

## Source checks

- Policy/IM/owner hardening at semantic source `cd5fa0538a4e6acbac1f6a5611c40a587a3131e6`: 13 focused files, 327 tests passed with one worker and no file parallelism. Includes native authorization-wrapper projection, async owner commit guards, Reviewer compare-and-set, pairing traffic exclusions and Human UI attempt adoption.
- Root TypeScript check, lint, format and full Bundle build passed. Initial release-fragment link parity and formatting failures were corrected. CLI parity: 302/327 surfaces covered, 25 existing baseline gaps; 182 supplemental UI/HTTP surfaces inventoried. These counts describe command coverage, not blanket execution authority.
- Narrow approval-reporting follow-up at final source: two focused files, 101 tests passed with one worker; root TypeScript and lint passed. Changed-file formatting passed after formatter cleanup. Core Host and CLI built with one worker using their existing root configurations.
- Initial package-scoped build had no script; the first scratch config lost relative entry roots. Explicit root cwd corrected that invocation. The actual core rebuild passed with existing declaration/deprecation warnings. No full test-suite claim.
- Independent fixed-source review identified the wrapper projection, async owner guard and Reviewer concurrency defects. They were fixed and re-reviewed, with no remaining P1/P2 at `cd5fa0538`. Reviewers did not run the Host.

## Real isolated Web and CLI

One task-owned Profile and the current worktree's compiled core CLI were used throughout. Pinned DSH: `0.2.0-rc.2`. Native IM Provider: `@xmanrui/dsh-im@4.32.0`, qualified source `beaed4a6dabb583654d28fb09298716267039b4a`. Real Tob turns used the official `deepseek-official/deepseek-flash` route. Every named model journey completed its native turn and marked the Human delivery handled. No dedicated Tob management model tool was called.

| Journey                     | Actual result                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability introduction     | Native Shell ran `deepseekbot capabilities`; no mutation.                                                                                                            |
| Read-only Workspace grant   | Fresh scoped Human review; canonical grant saved with `orchestratorWrite=false`.                                                                                     |
| Approval-template refusal   | Human denied the scoped card; CLI returned `approval-denied`; template stayed unset; no retry.                                                                       |
| Approval-template change    | Fresh Human review selected `cautious`; independent CLI readback confirmed it.                                                                                       |
| Concurrent connector change | Independent Human CLI changed failure alerts while review was pending; approving the old proposal returned `stale-policy`, preserving the newer value.               |
| Connector policy edit       | Fresh Human review disabled failure alerts; canonical revision became 4. Route availability stayed false; no delivery was attempted.                                 |
| Workspace revoke            | Fresh Human review; original grant gained `revokedAt`; active grant list became empty.                                                                               |
| Same-Profile restart        | Existing Workspace UI showed zero workspaces and cautious template. CLI retained disabled alerts revision 4 and the revoked grant.                                   |
| Final reporting check       | A simple natural request created a new read-only grant after Human approval. Tob explicitly reported approval and successful readback; the old grant stayed revoked. |

The first grant reply incorrectly claimed direct application without waiting, despite an actual Human approval card. This was a reporting discrepancy, not a bypass. The final system/catalog instruction and deterministic contracts address it. The fresh final reply said: “你批准了这次请求，改动已实际生效”. This one run supports the corrected path; it does not guarantee all future model wording.

## Existing private IM setup

The real Feishu flow was started once through Tob's scoped Shell and fresh Human review. It reached the Provider's `credentials` state. Model output contained only an opaque receipt, platform, state and expiry.

Applications displayed that platform and expiry. **Continue setup** opened the existing Bot selection and private credentials form. Captured native requests were two `setup.poll` calls for the exact original Provider attempt: no second `setup.start`, no credential submission. The private attempt ID was absent from Tob's trace and the Human CLI resume output. No token, QR or native attempt ID is published here.

A later natural status request read the same attempt. A reviewed cancel reached `cancelled`; the UI disabled continuation. The later Host restart cleared the process-local receipt projection as designed; the Provider remains the setup lifecycle owner. No new durable receipt authority is introduced.

The committed light/dark screenshots are actual 1440 × 1000 captures. The Before images show Applications with no pending setup, the prior entry state for this new handoff. After images show the owned pending receipt and the existing empty private form. The Workspace dialog shows the reviewed cautious template and zero active workspaces after revoke/restart.

## First failures and proof limits

- English-only onboarding and Bot-row selectors did not match Chinese accessible names. First failures and retries were preserved privately; selectors now use observed localized names.
- A template journey first waited for the inner card while an outer native Shell review was pending. The same Human source was resumed, then both reviews were handled. No duplicate source or write was used to evade review.
- The first IM resume selector matched a title instead of the button. The retry used the button role and resumed the same attempt.
- One stock observer classified console error events from caught diagnostic RPC discovery as an unclassified Client exception. Do not treat this as a globally clean observer run. Later task journeys captured empty page-error and console-warning/error arrays.
- Connector proof is local policy configuration only. There was no authorized external destination, test notification, live external message, credential submission, QR scan, browser/container launch or OS-consent claim.
- Parent-controlled macOS Native verification subsequently passed; see `native-evidence.md`. Full CI passed at `496d76ed9c0b4bd99b6d6d06b6888ccd0b8067e2` (run 39077048323). Integrated-stack runtime and Human QA remain separate pending gates. The Draft PR must remain unmerged.

Private reconstruction artifacts retain the authenticated launch manifest, complete traces, raw Provider identity checks, ARIA snapshots, console records and first failures. They are deliberately excluded from publication.
