# #2173: published old-version Desktop baseline

Real official macOS DSH 0.2.0-rc.2 Desktop, actual published npm DeepSeekBot 1.2.1, isolated synthetic Profile. No browser automation, injected UI, fake version or model call.

- `01-installed-notes.png`: first Bot-mode entry opens **installed 1.2.1** notes, not an available-1.3.1 update notice.
- `04-restart-no-update.png`: after dismissing installed notes and restarting the same Desktop/Profile, Bot mode has no new-plugin-version modal. The shell's “新版本” button is not evidence of a DeepSeekBot modal.
- `evidence.json`: authenticated Host current-version and real-registry update-result summary, plus screenshot hashes. Host discovers `available: 1.2.1 → 1.3.1`, with installer availability true.

The screenshot/AX capture sequence reproduced the missing proactive notice. Native settings navigation was not successfully qualified; the registry result is API evidence and is not claimed as a rendered settings result. Neither a fixed candidate nor the unpublished 1.4.0 release was tested. Raw login URLs, credentials, Host logs and local paths are excluded.

Main code inspection agrees: Bot-mode announcement starts installed release notes; remote update checking starts in release settings. Installer availability is not yet a DSH-aware compatibility decision. See #2173 for the proposed fix and acceptance matrix.
