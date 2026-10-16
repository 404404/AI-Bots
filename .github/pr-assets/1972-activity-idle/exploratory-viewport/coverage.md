| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-1477198198d543cc87c399619d266ea9: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](exploratory-viewport/doctor.json), [identity.json](exploratory-viewport/identity.json), [created.json](exploratory-viewport/created.json), [before.json](exploratory-viewport/before.json), [visible.json](exploratory-viewport/visible.json), [after.json](exploratory-viewport/after.json), [console.json](exploratory-viewport/console.json), [aria.json](exploratory-viewport/aria.json), [activity.png](exploratory-viewport/activity.png), [diagnostics.json](exploratory-viewport/diagnostics.json) | not-run |

Reason: Behavior/commit mismatch or uncommitted source

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
