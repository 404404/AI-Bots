# #2186 named Computer pairing — Batch29

Source/integrated main: `da9ee46aaca938924a2a3057c9b46ff18bb06977` (merged #2189).
Native development client: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`, reused with unchanged native inputs.
Main CI: https://github.com/BotHarness/DeepSeekBot/actions/runs/39131793797 (success).
Claim: https://github.com/BotHarness/DeepSeekBot/issues/2186#issuecomment-6250937216
Task: `codex/local/01a14eca-891c-7d30-84fa-8e4dd7b060b3`.

Evidence-only branch; no product code, deployment, or production changes.

## Actual native path

1. Open Computers → Pair a new computer. Type `QA Named Computer` into Name on this phone. Capture the form while the pairing-link input is still empty.
2. Request one real offer from the coordinator-authorized retained QA Host. Enter the unchanged link into the visible pairing field using the driver stdin path, dismiss the keyboard by tapping a visible non-input label, then tap the actual Pair button. No pairHost shortcut, direct saved-state insertion, or modified Host name/payload is used for acceptance.
3. Observe the local alias and online marker in the Computers drawer in both themes. Inspect the application read-only: the original server HostName, HostId and routes are unchanged; authenticated connection and live roster are ready. The new Host device ID equals the UI redemption's SavedHost.deviceId and is the only addition to the fresh inventory. Its server device name is separate from the local Computer alias.
4. Terminate and relaunch the app, reopen the drawer, then open the existing already-read Perf Writer DM. The same local name, Host record, route and device ID persist, with an authenticated connection and readable history. No additional pairing or message send occurs. Original signed-out Cloud configuration remains unchanged.

Read-only runtime assertions are in the two check JSON files. Screenshots are actual iOS Simulator captures at 402×874, inspected before publication. Paired and cold screenshots are stages in one working flow, not a product before/after comparison.

## Limits and findings

The old Chats source-filter chip still displays the server HostName while the drawer displays the local alias. This display inconsistency was handed to the concurrent #2194 Header/environment paging owner; no overlapping UI changes were made here. Naming persistence in the drawer passes, not global name consistency.

This verifies an app cold restart with a retained QA Host; it does not qualify latest-main Host behavior, Host restart, physical QR scanning, Android or physical iOS. No model or Bot message was sent. The development gear is a test overlay visible in screenshots.

Driver-only first failures were retained privately: a recording-only flag was refused before input, and the keyboard hid the Pair button until dismissed via a visible label. The same single offer was then successfully entered and redeemed through UI. No link/token, credential, raw device inventory or unrelated-chat screenshot is published.

## Restoration

Precisely one new device was identified by pre/post IDs and the UI redemption result, then revoked/unpaired. All three original device records and statuses were preserved. Original no-Host/signed-out-Cloud runtime state matched; Documents/preferences were restored byte-for-byte, including removal of only the new task alias and empty draft files. Simulator clipboard was cleared; original appearance/text size/locale, shared checkout and three pre-existing documents were restored. Task driver and Metro closed; retained Host remained alive. Coordinator and TOB task received the release report. No Prod activity.

#2186 remains open for other acceptance. This result closes only its named Computer pairing and app restart check.
