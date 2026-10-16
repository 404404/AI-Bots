| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.grants.temporary-read-revoke | desktop Web + CLI | blocked | 7c2a2c0f92264a0970cbc98a7c98de611c337c4e | The same PersonaBot and temporary Workspace have no Grant, then an active Grant permitting direct attachment-import reads, then an explicitly revoked Grant refusing the same read; visible Web state agrees. / preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1974-run5/instance.json' | [failure.json](./failure.json) | not-run |

Reason: preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1974-run5/instance.json'

Model, native-device and IM checks: not run. Only this temporary Grant and direct attachment-import read are qualified; native file tools, Shell, #1841 and #1957 remain outside this proof.