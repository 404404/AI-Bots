| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-48fe9587d1e14c6bba26fe8e6480d32a: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](superseded-2424/doctor.json), [identity.json](superseded-2424/identity.json), [created.json](superseded-2424/created.json), [before.json](superseded-2424/before.json), [visible-before.json](superseded-2424/visible-before.json), [after.json](superseded-2424/after.json), [console.json](superseded-2424/console.json), [aria.json](superseded-2424/aria.json), [activity.png](superseded-2424/activity.png), [diagnostics.json](superseded-2424/diagnostics.json), [visible.json](superseded-2424/visible.json) | not-run |

Reason: Behavior/commit mismatch or uncommitted source

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
