# Activity indicator verification — #2231, slice 2

Recorded 2026-10-19. Isolated DSH Host and real Web Client using the pinned `0.2.1-rc.2` CLI, authenticated bridge, canonical Channel/Source Event/read-position owners, and disposable QA conversations.

## Revision and screenshots

- Before: `f31e528af83b749b8726e16fec99836626d999ae` (merged Channel-mute slice #2243).
- After implementation: `545385009976b30ce508c5a4cdb49eb11b32129e` (subsequent evidence commits contain no runtime changes).
- Before/after: 1440 × 1000, Chinese, light and dark, same Profile, Activity Dock open, identical canonical unread and read-position snapshots. Before uses the existing broad dot; after selects Off. The panel retains five read personal records and the true global unread count remains four.
- Menu images show all five choices; unknown image deliberately injects an HTTP 503 for the status call. Its ellipsis uses neutral tokens, not the notification color.
- Screenshots contain only disposable QA data. The floating character can move independently between captures.

## Real browser journeys

The nine successful cases and status readback are in `results.json`.

1. Right-click and Shift+F10 open the Activity context menu without toggling Activity; Escape returns focus to its trigger.
2. All, Needs you, Related, Other unread and Off obey the complete Host summary. Read-but-retained personal messages do not light Related.
3. Off leaves the Activity button clickable and its accessible state truthful. Header category/clear-filter changes and indicator preference changes preserve each other.
4. Two windows synchronize in both directions on one origin. Reload preserves Off.
5. Two independently authenticated Host origins in the same browser keep separate preferences.
6. An actual Bot tool turn creates a canonical Human mention. Related lights, Channel mute clears it, unmute restores it, and marking read clears it while retaining the personal Activity record.
7. Declining a disposable Group join request clears Needs you. The declined request remains in its Channel owner's history.
8. Deliberately failed status requests show unknown. Off stays effective during failure and after recovery.
9. An invalid persisted preference falls back to All.

Normal successful journeys recorded no browser console errors. Bridge and CLI `inbox-status` returned matching full message-category summaries. The preceding slice's expanded real DM/Group message matrix also covers ordinary text, literal @ text, canonical mention, reply, combined mention+reply (count once), arrivals while muted, UI/CLI changes, read positions and reload: [#2243 E2E record](https://github.com/BotHarness/DeepSeekBot/pull/2243#issuecomment-6254454580).

## Reproduce with an isolated test Profile

Start the worktree's verified Host using `scripts/dev-instance.mjs` and open its authenticated Web Client. Use existing CLI Channel commands to read actual unread/read positions and `deepseekbot inbox-status` to read the summary. Create ordinary and canonical personal messages through normal Channel tools; a string containing @ alone does not create a mention. Keep a pending disposable Human request for the action-only case.

Open Activity, right-click its control-rail button and exercise the five choices. Leave the panel open while changing header filters, muting/unmuting the Group from its existing menu, and marking its conversation read. Repeat via CLI and observe the Web refresh. Open a second same-origin window, reload, and compare with an independently authenticated second origin. Repeat in both themes. For failure recovery, intercept only the status request in browser tooling, then remove interception.

## Qualification limits and retained failures

- Initial browser automation attempts stalled on background-tab animation-frame waits and on second-origin authentication. Bringing pages forward and performing that origin's normal login corrected the harness; neither needed a product bypass.
- A journey initially expected a declined Group join request in Activity's handled list. The existing handled query does not expose that request type. The corrected assertion checks the canonical declined Channel record and the cleared action dot; this PR does not claim new handled-list behavior.
- An initial broad related-test run was interrupted after three long-running Channel test failures while browser QA was also active. Those two test files passed all 13 tests in an isolated low-concurrency rerun. The complete final related-run result is recorded in the PR.
- Source checks, browser journeys and CI are separate proof categories. Native Simulator/device behavior, Human QA and deployment are not claimed. The new preference targets the Web control rail only.
- A local HTML explanation supplements this record; it is not a reviewer-hosted artifact or runtime proof.
