| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | blocked | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1972-shared-01a1444a/instance.json' | [failure.json](Host-unavailable/failure.json), [console.json](Host-unavailable/console.json), [diagnostics.json](Host-unavailable/diagnostics.json) | not-run |

Reason: preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1972-shared-01a1444a/instance.json'

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
