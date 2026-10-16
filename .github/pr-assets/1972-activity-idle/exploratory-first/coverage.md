| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-8aedd48cebbf40f3b1ce81c147160f87: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](exploratory-first/doctor.json), [identity.json](exploratory-first/identity.json), [created.json](exploratory-first/created.json), [before.json](exploratory-first/before.json), [visible.json](exploratory-first/visible.json), [after.json](exploratory-first/after.json), [console.json](exploratory-first/console.json), [aria.json](exploratory-first/aria.json), [activity.png](exploratory-first/activity.png), [diagnostics.json](exploratory-first/diagnostics.json) | not-run |

Reason: Behavior/commit mismatch or uncommitted source

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
