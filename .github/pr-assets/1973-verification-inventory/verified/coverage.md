| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | pass | 1df01443f31a114210a2fc7846fd95e07f5aaeba | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-8ec110bd68d5431c85477c8047c1c3e4: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](./doctor.json), [identity.json](./identity.json), [created.json](./created.json), [before.json](./before.json), [visible-before.json](./visible-before.json), [after.json](./after.json), [console.json](./console.json), [aria.json](./aria.json), [activity.png](./activity.png), [diagnostics.json](./diagnostics.json), [visible.json](./visible.json), [visual-review.json](./visual-review.json) | not-run |

Reason: Same idle PersonaBot observed through Web and CLI; no activity is normal

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.