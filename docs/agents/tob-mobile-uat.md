# TOB mobile UAT verification

Scope: [#2101](https://github.com/BotHarness/DeepSeekBot/issues/2101), [TOB T1](https://github.com/BotHarness/tob/issues/2). This is a separate no-Host path. Do not start T2 or change Prod.

## Before the phone run

1. Follow [shared device QA](device-qa.md), obtain the assigned native build/phone window and recheck free disk. New native modules and URL scheme require an SDK58 development binary. Preserve the old app/Keychain/Host state; no erase is required.
2. Deploy the TOB mobile-discovery companion to UAT, read back the exact callback and fixed instance fields, then export public JSON and render its QR using [TOB's operator tools](https://github.com/BotHarness/tob/blob/main/docs/t1-mobile-session.md). Configuration changes require reimport on the CLI too.
3. Record app build/source SHA and UAT service SHA separately. Human authentication occurs only in WorkOS; never capture password, OTP, authorization code or tokens in evidence. Keep a separate CLI session for the isolation check.

## Observable path

- From an unpaired launch, open **Cloud services** on the pairing screen. A paired user reaches the same screen from the Host drawer. Host pairing/active Host stays unchanged.
- Scan the trusted operator QR, or use **Paste configuration** with the same complete public JSON. On Simulator, pasted import validates the real UI and session path; it does not qualify physical camera scanning. Check server/instance/UAT and confirm import. An ordinary URL, wrong callback or malformed QR is refused without credential exchange. Deny camera permission and verify the retry/settings path.
- Tap **Sign in**. Human completes WorkOS login in the system browser. Return to the app; only the initialized admin is admitted. Screenshot the resulting status with unrelated/private data cropped.
- Tap **Refresh session** and **Check session**. Verify the same admitted identity. Cold restart restores a saved session but requires verification before showing the signed-in status.
- Tap **Sign out**. Confirm local removal and reported remote result; independently read back the WorkOS session, confirm the separate CLI session still works. Do not claim already-issued access JWTs are immediately invalidated.
- Repeat cancellation, expired/interrupted browser flow and offline logout. A cold OAuth callback must not create a login or leak query parameters into navigation. Offline logout reports local-only cleanup; a remote session may remain until revoked/expired.
- With operator-produced replacement config, show critical differences and require explicit confirmation; changed discovery refuses credential-bearing requests. Do not point credentials at arbitrary test servers.
- Capture default/intermediate/maximum system text × light/dark. Scroll to all actions and verify VoiceOver labels/reading order. Camera stops when leaving the screen. Android is a separate qualification lane.

Source tests simulate storage failures, state mismatches, rotation errors and concurrency. Native failure injection is additional evidence when feasible, not an automatic pass. This slice does not expose organizations/groups yet. T1 remains open for shared phone/CLI organization creation/list/switch, owner/member/create retry, signed identity events/reconciliation, revocation and complete Human QA.

## Unattended native session tests (UAT only)

WorkOS [recommends API-prepared sessions for real staging tests](https://workos.com/docs/authkit/testing), and its emulator for automated login-page/callback tests. These are distinct evidence categories. An injected real session **does not** qualify Hosted AuthKit, native PKCE exchange, browser return, Google login or physical QR capture.

The local scripts below run outside the app bundle. They add no app route, global auth hook, release-build flag or server authorization bypass. The debugger can already execute code in a development app: treat its connection and the private fixture file as credentials. Never expose Metro's inspector to an untrusted network.

1. Reserve the assigned Simulator and freeze source/native/service identities. Keep an independently authenticated CLI session. Import the operator's public UAT config through the normal UI first; leave this cloud entry signed out.
2. The operator profile contains private `uat-target.json`, `bootstrap-target.json`, `tob-instance.json` and `secrets.env`. Directories must be user-owned 0700 and files 0600; symlinks are refused. It must refer to the previously verified WorkOS staging environment and accepted bootstrap invitation. No script creates users, changes the initialized administrator or changes WorkOS settings. If Magic Auth is disabled, an operator may temporarily enable only that setting, record its previous value, and restore it after session preparation. Registration stays closed.
3. Create a fresh private run directory through the preparation command (its parent already exists). This sends one OTP email through WorkOS, consumes the API-returned code automatically, validates admission through the real UAT `/api/me`, and saves a separate temporary session. The API key and OTP never enter the app, output or run file. This T1 fixture uses the existing authorized UAT administrator; future repeated suites should use an isolated test instance and identity once its admission lifecycle exists.

```sh
node apps/mobile/scripts/tob-uat-session.mjs prepare --profile "$PRIVATE_OPERATOR_PROFILE" --run "$NEW_PRIVATE_RUN"
```

4. Read the assigned Metro's `/json/list`, identify the exact Simulator/app debugger target, and pass that target explicitly. The driver requires a booted assigned Simulator, a loopback inspector, a development runtime, an already-imported matching UAT config, no active cloud operation and no existing session. It writes only the selected cloud entry through the existing SecureStore adapter. It preserves other cloud entries and Host state; cold-restart the app afterwards.

```sh
node apps/mobile/scripts/tob-mobile-driver.mjs inject --session "$NEW_PRIVATE_RUN/session.json" --simulator "$ASSIGNED_SIMULATOR" --metro "$ASSIGNED_METRO_PORT" --target "$INSPECTOR_TARGET"
```

5. Use native UI **Check session** to obtain the service-verified identity, **Refresh session**, cold restart and **Check session** again. After each step, `checkpoint` (same driver arguments) checks the admitted identity/session and saves the latest rotated credentials privately. It prints only booleans, including whether refresh changed since the previous checkpoint. Re-read the inspector target after each restart. Seeded storage alone cannot pass a checkpoint.
6. Tap **Sign out**. Run driver `signed-out` to check both memory and SecureStore have no session while public config remains. Run the operator script `verify-logout` with the same profile/run arguments: the exact WorkOS session must be inactive, its latest saved refresh token rejected, and every baseline active session still active. Independently run the formal CLI `whoami`. Cold restart once more and verify signed-out persists.
7. On interruption, run operator `cleanup` to revoke only the fixture's session; clear it through App Sign out before retrying. Retain private records only until revocation is confirmed, then remove the task-owned run file. Do not delete other sessions or shared app data. Restore any temporarily enabled Magic Auth setting even if testing fails.

Capture only post-login UI states; stop recording during preparation/injection. Screenshots and recordings must omit identities, tokens and debugger payloads. Record source checks, API authentication, native lifecycle, hosted browser flow and Human acceptance separately.
