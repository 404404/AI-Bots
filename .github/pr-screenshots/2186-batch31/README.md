# Batch31: large text and keyboard reachability

Issue #2186; evidence for merged PR #2189. Tested source: `da9ee46aaca938924a2a3057c9b46ff18bb06977`. Reused iOS native client: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. Actual iOS Simulator screenshots, 402×874, English app UI, existing system keyboard. No product code changes.

Full source CI39131793797 passed. Four focused source files passed 59 tests. Neither substitutes for the native checks below.

## Completed matrix

Each row passed at `large` (default), `accessibility-large` (intermediate), and `accessibility-extra-extra-extra-large` (maximum), in light and dark themes:

| Real UI path | Observable result |
| --- | --- |
| Computer drawer → Pair | Enter optional local name and malformed link, scroll with keyboard open, tap Pair → local refusal; Retry responds; scroll to Cloud services and exit. No device created. |
| Cloud drawer → Join by link or QR | Enter malformed invitation, scroll with keyboard open, tap Review → local refusal; refocus after the normal submit blur, scroll to Cancel invitation → transient draft cleared. No invitation preview/redemption or login. |
| Cloud services → Paste configuration | Enter `{}`, scroll with keyboard open, tap Review → local refusal; scroll to Cancel → form clears. No config import or account change. |

Keyboard-visible reachability means the action label could be fully exposed by ordinary scrolling and the actual button was tapped. It does not mean all actions fit simultaneously without scrolling. Invitation submission normally blurs the field; its secondary action was independently exercised after refocusing. Screenshots were inspected individually; clipped initial attempts were excluded from passing evidence.

## Driver limits and accessibility scope

The Simulator AX tree sometimes clipped rectangles earlier than the rendered keyboard or reported offscreen targets as visible. Synthesized scroll-to-top also sometimes made no progress. Screen-bounded drags, fresh snapshots and actual screenshots resolved these driver limitations; offscreen programmatic actions are not counted. First failed attempts remain in private diagnostics. The existing system keyboard has missing CJK glyphs; app forms were tested in English, so this does not qualify translated labels.

Source inspection confirmed explicit shared Button labels/roles/disabled state, wrapping labels and minimum target tokens; generic Sheet has modal/escape semantics. This is not screen-reader proof. The invitation input has a compact default-height surface, and Pair error announcement behavior still needs accessibility review. Generic Host-backed RenameSheet secondary action, live VoiceOver/TalkBack, long translations, physical iOS/Android, and optional Statistics Sheet are **not covered**. Settings blank behavior was reported independently by Batch30 and was not bypassed with state injection here.

## Restoration

Original zero-Host and signed-out Cloud configuration/session snapshots matched exactly. After the app stopped, Documents and Preferences matched baseline bytes; only the task-created empty draft and changed development-client preferences needed restoration. Display returned to light/default text, temporary launch locale removed, own driver/Metro stopped, shared checkout and original untracked docs restored. Queue coordinator and TOB owner received release. No Host writes, real invites, model messages, deployment, merge or Prod activity.

Task: `codex/local/01a14eca-891c-7d30-84fa-8e4dd7b060b3`. Claim: https://github.com/BotHarness/DeepSeekBot/issues/2186#issuecomment-6251133163
