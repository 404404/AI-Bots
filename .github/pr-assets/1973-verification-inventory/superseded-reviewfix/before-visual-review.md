| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 4f9ab58e9c9bc7f84dd38f79208ad6a8cb02411d | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-f8fbd60f595d409fa1dd1d5cd2953c58: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](./doctor.json), [identity.json](./identity.json), [created.json](./created.json), [before.json](./before.json), [visible-before.json](./visible-before.json), [after.json](./after.json), [console.json](./console.json), [aria.json](./aria.json), [activity.png](./activity.png), [diagnostics.json](./diagnostics.json), [visible.json](./visible.json) | not-run |

Reason: Screenshot/ARIA visual review pending

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.