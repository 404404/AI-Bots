# Paired-device CLI verification

Issue: [#2098](https://github.com/BotHarness/DeepSeekBot/issues/2098).

Production code build/runtime head: `8bde3340afb8ba4a23f3f715851f83da188168d2`.
Captured on 2026-10-17 UTC with pinned DSH `0.2.0-rc.2`, 1440 × 1000 Web Client, Chinese locale and dark theme. The following commit changes verification/evidence only, with no production-code differences.

- `before-revoke.png`: direct CLI-created offer was redeemed by an authorized synthetic test client; the existing Devices UI lists the live device.
- `after-revoke.png`: identity-reviewed direct CLI revocation is reflected by the same Devices UI. The open stream closed with the existing gateway's `1006`, and the next request returned `401 device-revoked`.
- `tob-safe-receipt.png`: the actual official DeepSeek model's private-DM reply reports a safe receipt and directs the Human to Devices. No pairing link or credential is visible. The completed device commands and canonical reply are verified; the screenshot does not assert that the entire Orchestrator Session has stopped.

Independent direct CLI/Web and official-model Tob journeys both passed. The latter used only the isolated Tob's `deepseek-official/deepseek-flash` plan, confirmed in the current Host catalog; shared model selection was untouched. Tob discovered/called ordinary Shell commands for devices/routes, approved identity-reviewed revocation, created an offer, read its pending receipt and handed the same offer to the Human Devices dialog. Actual model Shell traces, canonical messages, accessibility states and console evidence remain in the task-local verification artifacts; raw Host names/routes and local login material are not published here.

Focused source checks: 25 device/inventory regressions passed; an earlier related CLI set passed 97 tests. Final source typecheck and build passed. CLI parity, source policy, bilingual release checks and feature-map/CI-plan checks passed. Full suite and CI are not claimed.

Preserved verifier failures: accessible title/button ambiguity; an incorrect expected stream code (`1008` corrected to the documented `1006`); a fresh Tob with no Session yet; and the pinned new-Session log materialization race. The verifier now retries only the exact missing-new-Session result for at most 30 seconds and still fails real model/CLI errors. A restricted-shell doctor falsely reported process/network denial as a dead Host; escalated doctor confirmed that the Host remained healthy.

Native macOS Desktop is deferred to the parent-coordinated integrated stack. Physical phone, camera, Keychain/Keystore, Windows private-file ACL and native network transport are unqualified. Synthetic clients prove protocol/gateway behavior only. This work does not merge, release or deploy anything.
