| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.activity-center.idle-personabot | desktop Web + CLI | needs-revalidation | 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31 | The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI. / bot-18a0782a3d4a4f81b5057a97618ded3e: visible Idle, CLI idle, zero attention, sessions and actions. | [doctor.json](exploratory-second/doctor.json), [identity.json](exploratory-second/identity.json), [created.json](exploratory-second/created.json), [before.json](exploratory-second/before.json), [visible.json](exploratory-second/visible.json), [after.json](exploratory-second/after.json), [console.json](exploratory-second/console.json), [aria.json](exploratory-second/aria.json), [diagnostics.json](exploratory-second/diagnostics.json), [activity.png](exploratory-second/activity.png) | not-run |

Reason: Behavior/commit mismatch or uncommitted source

Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.
