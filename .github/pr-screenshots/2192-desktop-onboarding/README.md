# Desktop onboarding evidence

Native macOS DeepSeek Harness 0.2.1-rc.2, isolated synthetic Profile. No browser automation.

- `before-old-guide.jpg`: earlier main UI, legacy seven-item checklist. Captured at 2290 × 1640 with different synthetic fixture; compare the entry pattern, not pixel-identical layout.
- `step5-home-title.jpg`: final candidate, 2522 × 1640, fifth step waiting for real Home title click; unsent draft retained.
- `step5-conversation.jpg`: same final candidate after title click; Home closes, original Tob DM opens. Host readback confirms journey done.
- `layout-tip.jpg`: final candidate explicit replay; first of four short panel tips. Finishing tips returns to step five without completing the journey.
- `legacy-migration.jpg`: final candidate boot with a seeded legacy unfinished tutorial; no forced guide or navigation. Host readback reports v2/paused.
- `new-bot-empty.jpg` / `created-group-members.jpg`: candidate with the same creation and welcome-removal code, before the final navigation-failure guard; real approved Tob CLI creation and actual membership, no default Bot message.
- `model-gate.jpg`: candidate before final navigation guard; cleared default in this isolated Profile, then native setup/cancel/save verified and unsent draft restored.

- `step5-dark.jpg`: final candidate, dark theme, fifth step and retained draft.
- `narrow-desktop.jpg`: final candidate at 1744 × 1200; existing narrow Desktop conversation shell. Restoring 2522 × 1640 returned Home, its draft and step five. This is not mobile Home verification.

## Verification boundaries

Passed: 172 focused tests (13 files), lint including CLI parity, format, typecheck and build. Native model setup/cancel, real approved Bot/group creation, new Bot empty DM, same Tob DM, fifth-step action/readback, layout-tip replay, global resize and Home close/reopen restoration, quiet legacy unfinished migration, dark Home, and narrow-window/wide-window restoration.

Open native gates: actual global/child title drag placement and child resizing/reopen. Drag attempts did not visibly move panels and the native control subsequently returned `noWindowsAvailable`; cause is not established. Later native window Raise restored normal clicks and captures; another child-divider drag still did not visibly resize the panel. These remaining interaction gates are not attributed to an automation failure without evidence. Legacy completed/skipped cases, denial/pending invitation and recovery edges have source coverage; their full native matrix is not claimed.

Screenshots show synthetic data only. This slice excludes mobile Web. Keep the PR unmerged pending remaining Desktop qualification and Human review.
