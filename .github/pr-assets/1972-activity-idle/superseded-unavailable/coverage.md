| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1972-unavailable-01a1444a/instance.json' | [failure.json](superseded-unavailable/failure.json), [console.json](superseded-unavailable/console.json), [diagnostics.json](superseded-unavailable/diagnostics.json) | not-run |

Reason: Behavior/commit mismatch or uncommitted source

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
