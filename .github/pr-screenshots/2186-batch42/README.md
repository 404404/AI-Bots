# Batch 42 — organization invitation copy, share and join

App source `132b33e3c9965fcb5a01066a134f2744269b2d75`; existing iOS 26 development client/native source `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`, 402 × 874, English App, default text. Main verify [39157206364](https://github.com/BotHarness/DeepSeekBot/actions/runs/39157206364) and [39160553634](https://github.com/BotHarness/DeepSeekBot/actions/runs/39160553634) passed; 38 focused CloudClient tests passed. This is evidence-only work after PR #2212 merged; no product code or deployment changed.

## Observed path

1. Two existing synthetic UAT accounts received independent real sessions. Native Check session verified the sender, then Use workspace selected its existing owner organization. All-status, fully paginated provider baselines confirmed the recipient had no relationship to this target; organization and both existing channel reads returned 403.
2. Workspace invitations → enter the designated synthetic email → Invite **once**. The exact new invitation and any new pending membership were recorded privately. No new users, organizations or channels were created.
3. Copy invitation link → actual Simulator clipboard exactly matched the issued canonical URL. Capture `owner-copy-light.png` shows confirmation. Dark invitation controls appear in `owner-copy-dark.png`; copying was not repeated in dark mode.
4. Share invitation opened the real native sheet in light and dark; both were cancelled without sending to an external app. Screenshots: `owner-share-light.png`, `owner-share-dark.png`.
5. Sender signed out. Recipient's independent session was loaded and verified, then actual Workspaces → Cloud → Join by link or QR → paste → Review invitation. `recipient-review-light.png` shows **Workspace and its channels** and the invited account; the URL input was scrolled out of the capture.
6. Join automatically selected the organization and displayed **both pre-existing channels**, without a manual reload. The canonical accepted user and new `member` role matched; channel list IDs matched the owner baseline and both channel reads returned 200. `recipient-channels-light.png` / `recipient-channels-dark.png` show the list; `recipient-first-channel-light.png` and `recipient-second-channel-light.png` show each actual channel open. No messages were sent.
7. After re-reading the exact new, non-directory-managed membership and confirming its absence from both original baselines, only that membership was deleted. All original membership IDs, statuses and roles were restored. Recipient remained authenticated (`/api/me` 200), while organization, channel-list and both channel reads returned 403. Actual Reload channels displayed `ORGANIZATION_ACCESS_DENIED` (`recipient-access-removed-dark.png`).

## Restoration

Both owned sessions were signed out through the UI; each own session was revoked, its latest refresh rejected, and all prior active sessions (one per account) preserved. Revoked local token files removed. The accepted invitation audit row intentionally remains; it grants no membership after cleanup.

Original cloud vault, pending join, Hosts, stopped Documents and Preferences bytes, text size and appearance were restored. Current clipboard text and text-item presence both match this run's initial baseline; the earlier Batch39 no-item → empty-item caveat remains historical and is not erased by this check. Own driver and Metro stopped, shared checkout restored, lane explicitly released to the TOB queue. No Host, build/install, phone or Prod action.

## Limits and findings

- Existing trusted configuration plus genuine independent session fixtures qualify this invitation path, **not Hosted AuthKit/PKCE login**. No borrowed TOB sessions or fabricated auth state.
- Native share open/cancel is not external delivery. Physical QR scanning, new-instance trust/browser return, wrong-account/expiry, Android/physical iPhone and VoiceOver/TalkBack remain untested.
- Some system share-sheet labels show missing Chinese glyphs; English App content and native sheet presentation are visible, but localization is not qualified.
- **Remaining UI finding:** organization access denial leaves previously loaded channel-name rows visible beneath the error. Server reads are denied; this is retained as a separate #2186 cache/selection cleanup item, not a passed stale-state gate.
- The current main's dark header material is not the newer TOB #2211 candidate; this run does not requalify that separate visual fix.
- First failures retained privately: the original sender direction had pre-existing pending/active memberships, so those were preserved and roles reversed; initial runtime backup attempted before lazy cloud modules loaded and was retried only after opening Cloud services; unsupported driver `sessions` corrected to `session list`; one automatic approval timeout executed no command, and its permitted retry succeeded. None requires a product patch for this path.

Safe assertion manifest: [proof.json](proof.json). Tracking: [#2186](https://github.com/BotHarness/DeepSeekBot/issues/2186), [PR #2212](https://github.com/BotHarness/DeepSeekBot/pull/2212).
