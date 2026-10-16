| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | fail | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / confirm-authoritative-state: idle-card-disappeared-during-evidence-capture | [doctor.json](blank-page/doctor.json), [identity.json](blank-page/identity.json), [created.json](blank-page/created.json), [before.json](blank-page/before.json), [visible-before.json](blank-page/visible-before.json), [after.json](blank-page/after.json), [console.json](blank-page/console.json), [aria.json](blank-page/aria.json), [activity.png](blank-page/activity.png), [diagnostics.json](blank-page/diagnostics.json), [failure.json](blank-page/failure.json) | not-run |

Reason: confirm-authoritative-state: idle-card-disappeared-during-evidence-capture

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
