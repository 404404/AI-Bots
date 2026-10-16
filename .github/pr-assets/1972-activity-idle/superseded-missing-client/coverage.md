| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / confirm-authoritative-state: diagnostics: Host or Client observation unavailable/failed; console: errors or missing observation | [doctor.json](superseded-missing-client/doctor.json), [identity.json](superseded-missing-client/identity.json), [created.json](superseded-missing-client/created.json), [before.json](superseded-missing-client/before.json), [visible-before.json](superseded-missing-client/visible-before.json), [after.json](superseded-missing-client/after.json), [console.json](superseded-missing-client/console.json), [aria.json](superseded-missing-client/aria.json), [activity.png](superseded-missing-client/activity.png), [diagnostics.json](superseded-missing-client/diagnostics.json), [visible.json](superseded-missing-client/visible.json), [failure.json](superseded-missing-client/failure.json) | not-run |

Reason: Behavior/commit mismatch or uncommitted source

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
