# Batch39 — invitation copy, share and join

UAT only, source `132b33e3c9965fcb5a01066a134f2744269b2d75`, iOS 26 Simulator, installed native `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`, 402 × 874. Main verify [39157206364](https://github.com/BotHarness/DeepSeekBot/actions/runs/39157206364) passed; 38 Cloud Client source tests passed separately. No product patch or production action.

## Real UI path

1. Existing synthetic owner A: Workspaces → Cloud → Manage cloud services → Check session → Cloud workspaces → existing My workspace → Cloud channels → guest-uat-proof → Invite channel guest. Enter pre-existing synthetic B's address and press Invite exactly once.
2. Copy invitation link in light and dark. Read the actual Simulator clipboard privately and compare exactly with the server origin and new invitation ID. Both passed.
3. Share invitation opens the iOS system sheet in light and dark; cancel by tapping outside. No external app/contact delivery. Preview does not expose the invitation query in the published images.
4. Sign out A; use a separately issued genuine B test session. Cloud drawer → Join by link or QR → enter the copied link → Review invitation → inspect My workspace / guest-uat-proof / Only this channel → Join. The resulting channel opens with its Cloud icon and guest scope notice.
5. Canonical readback: exact invitation accepted by B; target accessible, sibling denied; B's organization membership list unchanged. No message sent.
6. An independent owner cleanup session revokes only the new invitation. B's identity endpoint still returns 200 while target returns 403; native Reload messages displays CHANNEL_ACCESS_DENIED.

## Evidence boundaries

Screenshots show stages of one existing feature, not before/after a new code patch. Light/dark copy and share; light review/join and dark joined view. Existing synthetic `example.test` addresses are test fixtures, not personal recipients. System share-sheet Chinese labels have missing glyphs; no localization or screen-reader pass is claimed. No QR scan, physical device, Android, full font matrix or external share delivery.

Real independent test sessions were seeded using the committed DEBUG fixture. This does not qualify interactive Hosted AuthKit/PKCE, new-instance trust, wrong-account or expiry paths. The new revoked invitation audit record remains by design; existing user-visible invitation fields/channels/access baseline were preserved.

All three owned sessions were revoked and their latest refresh rejected; prior active sessions remained. Owned token files removed. Original cloud vault/Hosts, stopped app Documents/Preferences bytes and display settings restored; pending invitation cleared, shared checkout/driver/Metro released. Clipboard content returned to its original empty value, but an empty text item remains where initially there was no text item; exact pasteboard item metadata restoration is not claimed.

`proof.json` records first driver/audit failures, including premature async reads, an in-flight Join screenshot excluded from success evidence, normalized optional projection fields, and a provider cleanup response that required independent revocation verification. Earlier Batch34 session uncertainty remains outside this run.
