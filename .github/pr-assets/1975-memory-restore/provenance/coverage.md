| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.memory.read-restore | desktop Web + CLI | blocked | 8195a4e9dce5da016925025424820d0303cb830d | Two owner-saved Memory versions; historical version one is readable, restoring it creates a descendant commit, and a stale expected-head restore is refused without changing content or HEAD; Web agrees. / preconditions: Command failed: git merge-base origin/main HEAD fatal: Not a valid object name origin/main  | [failure.json](./failure.json) | not-run |

Reason: preconditions: Command failed: git merge-base origin/main HEAD
fatal: Not a valid object name origin/main


Model, native-device and IM checks: not run. Only disposable Memory history/read/commit restore and stale-head guard are qualified; no remote push, credentials, branch switch or complete Self-Record qualification.