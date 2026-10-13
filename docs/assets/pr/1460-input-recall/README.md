# Submission snapshots and Up/Down recall — #1460

Captured through the real UI of isolated Hosts on DSH **0.2.0-rc.2**, macOS, Chinese locale, dark theme, 1280 × 800. Before uses base `9a01a3ef`; after uses this branch. Each Profile is fresh, with the default Bot and real model replies. "Offline" means the Host process was stopped before pressing Enter and started again on the same Profile afterwards.

## Screens

- [before-recall-dark.jpg](before-recall-dark.jpg) / [after-recall-dark.jpg](after-recall-dark.jpg): Up in the empty composer after a sent message. Before, nothing happens. After, the submitted text returns to the composer; nothing is sent and no extra text is shown.
- [before-offline-dark.jpg](before-offline-dark.jpg) / [after-offline-dark.jpg](after-offline-dark.jpg): Enter while the Host is stopped. Both clear the composer and keep a bubble; before labels it **发送失败**, after labels it **结果未确认** because no answer came back. DSH's own reconnect toasts partly cover the bubble in both.
- [before-reopen-dark.jpg](before-reopen-dark.jpg) / [after-reopen-dark.jpg](after-reopen-dark.jpg): the Host restarted and the page reopened. Before, the input is gone. After, the entry is still there; the Host was asked for its original ID, did not have it, and the bubble became **发送失败** with the restore action. Nothing was resent.

## What was exercised on the real Host

- A real message was sent and answered; the stored attempt carried the same `human-…` ID as the Host message and settled as sent. Up recalled it, Down returned to the empty draft, and no message was sent by recalling.
- With the Host stopped, Enter cleared the composer, kept focus in it, showed the unconfirmed bubble and stored the attempt as unknown with the transport error. Up recalled the unconfirmed text, Up again reached the older message, Down twice returned to the empty draft.
- After restarting the Host and reopening the page, the attempt was reconciled to failed. Selecting the failed bubble put the text back in the composer; sending it reached the Bot, which replied. The history then held the sent, restored and resent attempts.

## Further scenarios on the real Host

A second pass used real keyboard input and real sends in the same isolated Profile, in the DM and in a new Group Channel with the Bot invited.

| Scenario                                                  | Result                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Up while a draft is being typed                           | No recall; the caret moved to the start.                                                                              |
| Up after editing a recalled text                          | No recall step; the edited text stayed.                                                                               |
| Up inside a two-line draft                                | The caret moved to the first line.                                                                                    |
| Arrows with the slash menu open                           | The menu kept the keys; the text stayed `/`.                                                                          |
| Arrows with the mention candidates open                   | The candidates kept the keys; the text stayed `@`.                                                                    |
| Up in an empty Group composer after DM sends              | Nothing recalled: history is per Channel.                                                                             |
| Group send with a mention, then Up                        | The Bot replied in the Group; recall restored the mention as a chip.                                                  |
| Send with a reply target, then Up                         | Text only, with the note that attachments and the reply target were not brought back; the older entry showed no note. |
| Select an unconfirmed bubble while the Host is stopped    | "Cannot confirm" message; nothing restored or resent.                                                                 |
| Select it again after the Host is back, without reloading | The Host reported no such message; the bubble became failed and restorable.                                           |
| Second tab while the first has an unconfirmed input       | The second tab showed the same bubble without a reload.                                                               |
| Second tab restores a failed bubble                       | The first tab dropped its bubble; a second restore is not possible.                                                   |
| Second tab sends the restored text                        | One message in both tabs; Up in the first tab recalled it.                                                            |
| Light theme                                               | Recall and bubbles render.                                                                                            |

Two defects found in this pass were fixed with tests: a tab kept a failed bubble that another tab had already restored, and kept the "not confirmed" label after another tab had settled it as failed.

One interaction with the #1459 draft recovery was observed and left as is: restoring a failed bubble in one tab while the other tab's composer had just been cleared raised the existing draft-conflict notice, which offers both versions.

## Not covered here

- A lost acknowledgement (Host accepted, answer lost) cannot be produced on a real Host from the browser; it is covered by focused tests against the same send flow, which also cover the late response, the interrupted page and Profile isolation.
- Attachments, Channel references and real IME composition were not exercised on the real Host. IME rests on the key-routing test.
- The 390-wide layout was only checked for overflow, not driven; English copy was not captured.
