| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |
| --- | --- | --- | --- | --- | --- | --- |
| desktop.browser.open-observe-stop | desktop Web + CLI | blocked | fdf40ca64d3bca9092b24b8dbfe21f2fe1c060eb | Default local Browser opens one deterministic fixture; panel, observation and direct tools agree on its tab; stop removes the tab; Access-off refusal remains distinct from stopped state. / preconditions: Host-unavailable | [doctor.json](./doctor.json), [failure.json](./failure.json) | not-run |

Reason: preconditions: Host-unavailable

Model, native-device and IM checks: not run. Only default local Browser open/observe/stop and Access refusal are qualified; multi-tab, upload, profile reset, takeover, model and other Computer targets remain gaps.