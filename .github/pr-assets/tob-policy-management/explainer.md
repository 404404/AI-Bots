---
template: sheet
title: Tob policy changes keep Human authority
subtitle: Review guide for Draft PR 2139 · Issue 2094
lang: en
cols: 2
base: a3e2c4e64d131191e686e33cb207d3db9b3a0937
qualified-source: f9fcb32bc65d0453fdd0559bb7b75b6dc9a7ca45
evidence-head: 496d76ed9c0b4bd99b6d6d06b6888ccd0b8067e2
generated: 2026-10-18
---

Tob prepares supported policy changes through ordinary Shell and CLI calls. Existing owners retain permissions, persistence and private inputs.

## A What changes for the Human

| Before                              | After                                                      |
| ----------------------------------- | ---------------------------------------------------------- |
| Open separate settings for each Bot | Ask Tob to prepare supported policy edits                  |
| Review those settings directly      | Review the exact current and proposed values               |
| Start IM setup from Applications    | Start through Tob, then continue privately in Applications |

Granting access and changing policy require a fresh Human decision. Tob cannot answer its own review card or another Bot's card.

## B Who owns each step

```flow LR
Human -> Tob: private DM request
Tob -> CLI: native Shell
CLI -> Broker: source-bound operation
Broker -> Review: exact proposal
Review -> Owner: fresh Human approval
Owner -> Readback: canonical result
Readback -> Tob: bounded output
```

The current Grant, Registry, Messaging and native Settings owners perform writes. A capability toggle does not launch a device or grant OS consent.

## C Why async checks reach the commit

A Provider inspection can pause after review. Human withdrawal or a changed policy must still block the later write.

The trusted invocation context carries the current source and review checks into the existing Messaging transaction. It compares configuration fields, excluding message traffic.

```ts src=packages/core/src/messaging/policy-mutation.ts lines=120-132 hl=127

```

[Read the owner commit check at the qualified source](https://github.com/BotHarness/DeepSeekBot/blob/f9fcb32bc65d0453fdd0559bb7b75b6dc9a7ca45/packages/core/src/messaging/policy-mutation.ts#L124).

Reviewer Settings also compare the expected current value inside their synchronous file owner.

## D IM secrets stay in the existing form

```sequence num
Tob -> Broker: start Feishu setup
Broker -> Human: review
Human -> Broker: approve once
Broker -> Provider: setup.start once
Provider --> Tob: opaque receipt and status
Human -> Applications: Continue setup
Applications -> Provider: poll original attempt
Human -> Applications: private credentials or QR consent
```

Only the authenticated Human adapter resolves the native attempt. Tob and the Human CLI receive safe receipt/status output. The process-local receipt projection expires and disappears on restart.

Both Web and macOS resumed their original attempt. Each captured two polls, with no new start or credential submission.

## E What the evidence proves

| Gate                                                  | Status                                          |
| ----------------------------------------------------- | ----------------------------------------------- |
| Policy, IM and concurrency coverage                   | ok 327 focused tests                            |
| Final reporting contracts                             | ok 101 tests in two focused files               |
| TypeScript, lint, formatting and builds               | ok passed                                       |
| Real Tob Web grant, revoke and approval refusal       | ok Human review and exact readback              |
| Real connector policy change and stale refusal        | ok local policy only                            |
| IM start, private continuation, status and cancel     | ok same Provider attempt                        |
| Same-Profile restart and final reporting              | ok persisted policy and accurate approval reply |
| Native macOS policy, private continuation and restart | ok same Profile and exact readback              |
| Full CI at 496d76ed9                                  | ok all shards, docs, bundles and smoke          |
| Integrated stack                                      | warn separate pending gate                      |
| Human QA and merge                                    | warn pending; Draft remains unmerged            |

The first grant reply incorrectly claimed direct application. Actual Human review occurred. The final instruction, contracts and fresh real reply address that reporting discrepancy.

The run sent no external message and submitted no secret. It did not scan a QR code or request OS permission. Read the committed Web evidence record for first failures and limits.
