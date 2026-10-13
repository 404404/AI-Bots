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

## Not covered here

- A lost acknowledgement (Host accepted, answer lost) cannot be produced on a real Host from the browser; it is covered by focused tests against the same send flow, which also cover the late response, the interrupted page and Profile isolation.
- Group Channels, mentions, Channel references, attachments, the reply target, IME composition and the candidate menus were not exercised on the real Host for this slice. Menu and IME priority rest on key-routing tests and the unchanged menu handlers.
- Two tabs, light theme, 390-wide layout and English copy were not captured.
