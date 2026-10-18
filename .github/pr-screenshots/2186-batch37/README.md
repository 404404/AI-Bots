# Recipient-email native acceptance — Batch37

PR [#2212](https://github.com/BotHarness/DeepSeekBot/pull/2212) merged as `92c253254fe9d24fb7243fb978f1defb9bc5c14e`; [full main CI39156654455](https://github.com/BotHarness/DeepSeekBot/actions/runs/39156654455) passed. CodeRabbit reviewed head `15e89926e9f7059ec90f5610a0180e93a3f6cf9f` with no actionable comments. The merged invitation/pair screen source is identical to that reviewed head.

## Setup and boundaries

Assigned shared iOS 26 Simulator, 402 × 874, installed native `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. Existing iOS native inputs remain compatible; no build/install. Baseline `9a51bc6028cdcc7c8beb5a8bfcc30a8a1755f98c` and candidate used the same independently issued UAT test session and existing owner organization. Real WorkOS test authentication, signature verification, service identity and actual native owner identity were checked. The committed debug fixture installed only that genuine session into the matching signed-out trusted configuration. This setup does **not** qualify Hosted AuthKit/PKCE or interactive login.

Actual UI: Workspaces → Cloud → Manage cloud services → Check session → Cloud workspaces → existing owner workspace → Workspace invitations. Only `qa@example.invalid` was typed. **Invite was never invoked.** Canonical invitation list was empty before and after; no organization/channel/grant/Host/resource changes.

## Results

| Candidate text size                               | Light                       | Dark                        | Actual actions                                                                                     |
| ------------------------------------------------- | --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| Default (`large`)                                 | Pass                        | Pass                        | Focus/edit, keyboard-visible read-only Reload invitations, refocus and Back, reopen                |
| Intermediate (`accessibility-large`)              | Pass                        | Pass                        | Same, with content scrolling where required                                                        |
| Maximum (`accessibility-extra-extra-extra-large`) | Pass after corrected driver | Pass after corrected driver | Separate field/action views; scroll complete two-line Reload above keyboard, tap, refocus and Back |

The empty Invite control is disabled; synthetic input enables it. This verifies its appearance/state and geometry, not delivery. At maximum text the single-line email input scrolls horizontally to retain the caret. The input and all page content need not fit simultaneously; action screenshots show the separate scrolled position. Back returns to workspace management and reopening yields an empty recipient draft. This is not a dedicated Cancel-button test (none exists on this screen).

Matched before/after default-light empty and keyboard views are included. Candidate-only dark/intermediate/maximum views are separately named. Default input has a 44 pt outer target and approximately 42 pt native inner rect. The floating gear is the development-client overlay, not a product control. System keyboard Chinese glyphs are missing; no localized-system or translated-name acceptance is claimed.

## First failures and corrections

- The initial Metro command used the repository root instead of the mobile workspace and stopped before starting a server; corrected working directory, no dependency install.
- Initial cold-start checkpoint saw SESSION_BUSY, then unverified identity before the normal Check session action. The UI explicitly displays Saved session / Check to verify; actual Check session established the verified identity.
- The driver initially guessed Recipient email; the actual accessible field label is Email address. Corrected from the snapshot.
- An early candidate capture ran before the navigation helper completed and captured workspace management. Those wrong-page images were retained privately and excluded here. Subsequent device mutations waited for the preceding helper to finish. The helper also attempted Use workspace when that workspace was already selected; corrected to the visible Workspace invitations action.
- **Maximum-text initial helper success was invalidated.** AX returned clipped Reload bounds and a tap succeeded, but the second label line remained beneath the keyboard. `after-maximum-light-reload.png` preserves that failed visibility result. The corrected driver requires space for the complete wrapped button, scrolls it fully above the keyboard, and captures it before the actual tap. `after-maximum-*-verified-reload.png` records the qualified reruns. No product patch was needed.

## Restoration and remaining scope

Actual UI Sign out revoked only the newly issued session; its latest checkpointed refresh token was rejected, and all previously active sessions remained present. The revoked local token file was removed. Original cloud vault/Hosts, stopped-app Documents and Preferences were restored/read back; only a newly created verified-empty draft was removed. Original light/default text and preferences restored, no global language or accessibility setting changes. Own driver/Metro stopped; original shared checkout and its existing untracked documents restored; lane explicitly released to the queue.

[Issue #2186](https://github.com/BotHarness/DeepSeekBot/issues/2186) remains open. Android, physical iPhone, VoiceOver/TalkBack (deferred), older iOS/shared-header transparency, other sheets, directory edge cases, native share/QR and invitation AuthKit/wrong-account/expiry/revoke journeys remain outside this slice. No invitation delivery or Prod action.

Task: `codex/local/01a14eca-891c-7d30-84fa-8e4dd7b060b3`.
