| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.browser.open-observe-stop | desktop Web + CLI | blocked | fa292c35b5a719302a96de90e4ef23bf2bd8d5b2 | Default local Browser opens one deterministic fixture; panel, observation and direct tools agree on its tab; stop removes the tab; Access-off refusal remains distinct from stopped state. / preconditions: Host-unavailable | [doctor.json](./doctor.json), [failure.json](./failure.json) | not-run |

Reason: preconditions: Host-unavailable

Model, native-device and IM checks: not run. Only default local Browser open/observe/stop and Access refusal are qualified; multi-tab, upload, profile reset, takeover, model and other Computer targets remain gaps.