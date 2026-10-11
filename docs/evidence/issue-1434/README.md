# #1434 — Mobile Bot-mode navigation evidence

Task: `codex/local/01a12be6-bca2-79c0-8651-e63c72476072`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1434#issuecomment-6111442834).
Baseline: `73c75f86` in a separate detached checkout. Captured on October 12, 2026.
Only synthetic conversations from task-owned isolated Profiles are shown; no production receiver
was changed. This is Client navigation/layout work, independent of #1432.

## Captures

The mobile browser measured **427 × 925 CSS pixels**, despite a requested 390 × 844 preset.
The desktop browser measured **1402 × 877 CSS pixels**. The files are original screenshots;
image pixels are not CSS viewport measurements. All pairs use English and the native dark theme.

| View          | Before                                                      | After                       | Interpretation                                                                                                            |
| ------------- | ----------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bot DM        | [Before](before-dm.png)                                     | [After](after-dm-draft.png) | Same real Channel messages; after additionally shows the restored unsent DM draft.                                        |
| Group         | [Before](before-group.png)                                  | [After](after-group.png)    | Same real Channel messages and long Group name, without the native sidebar occupying mobile space.                        |
| Conversations | [Prior rail / absence of full-width list](before-group.png) | [List](after-list.png)      | The new full-width entry has no direct baseline predecessor. Thirty synthetic archive groups exercise scrolling.          |
| Desktop Group | [Before](before-desktop.png)                                | [After](after-desktop.png)  | Layout-only comparison: the after capture is still loading messages. It does not prove desktop message loading completed. |

Captures precede the final nonvisual viewport guard and test additions. Those changes do not
change the rendered layout. A final browser recapture was blocked by collaborative-preview
timeouts; do not interpret the screenshots as a new exact-head runtime rerun.

## Verified categories

- **Focused automation:** 7 files / 100 tests passed, including navigation, stable list node and
  scroll, draft isolation (text, mentions, reply, Channel refs and uploads), late send-failure
  restoration into the original scope, viewport listener disposal, desktop shadow restoration,
  bundle contract and absent-browser initialization.
- **Checks:** typecheck, lint (existing warnings), format check, bilingual release-ledger check
  and build passed.
- **Real isolated Host:** sent from the visible current composer to Bot DM and Group; both
  produced real provider-driven `channel_send` responses, `MOBILE DM OK` and `MOBILE GROUP OK`.
  Canonical Channel readback and visible messages were both checked. The earlier no-tool DM
  request only produced a native Session answer; it is not counted as Channel delivery.
- **Browser navigation:** DM draft → Back → initially empty Group → Group draft → Back → DM
  restored only its own draft. List scroll was 900.5px both before opening Group and after Back.
  Horizontal overflow was zero. Exit removed the mobile shell/sidebar mark and restored native
  Plugins, New session and Settings. The Group send control stayed within the measured viewport.
- **Existing destinations:** Activity Center opens its existing view, and Bot Settings opens its
  existing dialog. Their data-loading states did not settle in the last observation; this is
  route reachability evidence only, not proof that every destination projection finished loading.
- **Locale/theme:** native dark appearance and native Chinese locale were inspected. This does
  not establish a complete light/dark platform matrix.

The initial full-suite run was **not green**: 481 files passed, 7 failed, 7 skipped; 4102 tests
passed, 13 failed, 13 skipped. Six task-related absent-window/bundle failures were fixed and
rerun in focused coverage. The other failures were outside this diff: dev-im-test-apps synthetic
stdin exit, source-policy timeout, bot-contact-discovery timeouts, channel-attachment-forwarding
timeout and channel-query timeout. A serial rerun of those five files passed 30 of 31 tests;
the dev-im-test-apps synthetic stdin exit failure remained. This does not turn the full suite green.

## Required Human QA / 人工验收

The mobile bottom bar is currently absent inside conversations to reserve composer space;
**this remains a candidate design, not a phone-validated conclusion**. The persistent Back and
Exit controls are the intended escape routes. The existing Companion can overlap the bottom
area in these captures; its business logic is unchanged and needs a phone-level reachability
check before accepting this layout.

1. On a physical iPhone/Mobile Safari and Android browser, enter Bot mode and open both DM and
   Group from the list; send a message and observe the actual Channel response.
2. Open/close the software keyboard; verify composer, attachments, send, Back and Exit remain
   reachable. Test nonzero top/bottom safe areas and browser chrome collapse/expansion.
3. Rotate portrait ↔ landscape, including with keyboard open, and check for horizontal overflow,
   clipped controls and correct desktop/mobile breakpoint restoration.
4. Scroll a long list, enter/return from a conversation and check position. Leave different
   unsent drafts in DM/Group; include reply, mention and attachment context. Drafts are ephemeral
   for this Client lifetime, not promised across page reload or Host restart.
5. Exercise all three bottom destinations, keyboard Tab/Enter/Space navigation, light/dark and
   English/Chinese. Check that destination data loads, and that Companion does not obstruct taps.
6. Exit Bot mode and inspect restored Host navigation/layout; repeat on desktop with messages
   fully loaded. Compare the current composer and menus; no #1432 dependency is required.

The environment reported device access disabled. Real keyboard, nonzero safe-area behavior,
landscape interaction, Mobile Safari and physical-phone QA are **pending**, not passed.
The automated VisualViewport contraction test is a simulation, not native keyboard evidence.
Do not merge automatically; pause this PR for Human QA.
