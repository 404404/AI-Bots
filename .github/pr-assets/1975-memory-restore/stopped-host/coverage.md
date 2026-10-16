| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.memory.read-restore | desktop Web + CLI | blocked | 871c739bc5263508a2773af49f6d53f381cb678b | Two owner-saved Memory versions; historical version one is readable, restoring it creates a descendant commit, and a stale expected-head restore is refused without changing content or HEAD; Web agrees. / preconditions: Host-unavailable | [doctor.json](./doctor.json), [failure.json](./failure.json) | not-run |

Reason: preconditions: Host-unavailable

Model, native-device and IM checks: not run. Only disposable Memory history/read/commit restore and stale-head guard are qualified; no remote push, credentials, branch switch or complete Self-Record qualification.