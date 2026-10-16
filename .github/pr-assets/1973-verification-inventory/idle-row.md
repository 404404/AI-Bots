| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | pass | 1df01443f31a114210a2fc7846fd95e07f5aaeba | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-8ec110bd68d5431c85477c8047c1c3e4: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](verified/doctor.json), [identity.json](verified/identity.json), [created.json](verified/created.json), [before.json](verified/before.json), [visible-before.json](verified/visible-before.json), [after.json](verified/after.json), [console.json](verified/console.json), [aria.json](verified/aria.json), [activity.png](verified/activity.png), [diagnostics.json](verified/diagnostics.json), [visible.json](verified/visible.json), [visual-review.json](verified/visual-review.json) | not-run |

Reason: Same idle PersonaBot observed through Web and CLI; no activity is normal

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
