| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.grants.temporary-read-revoke | desktop Web + CLI | blocked | 3e7929b50080ea2a4e9e90eb2696db77593793ec | The same PersonaBot and temporary Workspace have no Grant, then an active Grant permitting direct attachment-import reads, then an explicitly revoked Grant refusing the same read; visible Web state agrees. / preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1974-final2/instance.json' | [failure.json](./failure.json) | not-run |

Reason: preconditions: ENOENT: no such file or directory, open '[redacted]/.humanlayer/verify/ax1974-final2/instance.json'

Model, native-device and IM checks: not run. Only this temporary Grant and direct attachment-import read are qualified; native file tools, Shell, #1841 and #1957 remain outside this proof.