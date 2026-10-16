| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | fail | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / confirm-authoritative-state: diagnostics: Host or Client observation unavailable/failed; console: errors or missing observation | [doctor.json](missing-client/doctor.json), [identity.json](missing-client/identity.json), [created.json](missing-client/created.json), [before.json](missing-client/before.json), [visible-before.json](missing-client/visible-before.json), [after.json](missing-client/after.json), [console.json](missing-client/console.json), [aria.json](missing-client/aria.json), [activity.png](missing-client/activity.png), [diagnostics.json](missing-client/diagnostics.json), [visible.json](missing-client/visible.json), [failure.json](missing-client/failure.json) | not-run |

Reason: confirm-authoritative-state: diagnostics: Host or Client observation unavailable/failed; console: errors or missing observation

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
