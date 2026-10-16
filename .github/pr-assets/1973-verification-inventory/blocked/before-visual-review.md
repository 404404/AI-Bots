| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | blocked | 8d619fd5be12f8b4780994057d826e1714635e73 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1973-mergedbase/instance.json' | [failure.json](./failure.json), [console.json](./console.json), [diagnostics.json](./diagnostics.json) | not-run |

Reason: preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1973-mergedbase/instance.json'

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.