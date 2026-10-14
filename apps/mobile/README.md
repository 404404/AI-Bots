# DeepSeekBot mobile app

Native Expo client for the Human's own Host (hub [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643), spec [#1645](https://github.com/BotHarness/DeepSeekBot/issues/1645)). The app pairs with a Host by scanning the QR code from the Web Client ([#1652](https://github.com/BotHarness/DeepSeekBot/issues/1652)) and shows the Roster of PersonaBots and group Channels with live state.

Pairing gives the phone a per-device credential, kept only in Keychain/Keystore. The app sends it as `Authorization: Device …` to the BotHarness device gateway (`/botharness-device/…`), which forwards the same unary envelope and mux frames to the Host ([ADR-0199](../../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)). The phone never holds a DSH token or cookie, keeps working across Host restarts, and is cut off at once when the Human revokes it.

## Layout

- `src/host/` — the Host client module. One deep module owns the routes, the device credential, unary calls, the Remote stream socket, reconnection and connection state. Screens read it through `useHostSnapshot()` and never talk HTTP. It is plain TypeScript with an injected carrier (`carrier.ts`), so it is tested in Node.
- `src/host/wire.ts` — the slice of the Host's wire shapes the app reads; `test/wire-contract.ts` checks the Host's own types against it in the root typecheck.
- `src/host/pairing.ts` — reads the pairing link (QR code or `deepseekbot://pair?p=…`) and redeems its one-time offer through the first route that answers.
- `app/` — Expo Router screens: the Roster (`index.tsx`) and pairing (`pair.tsx`, camera scan or pasted link).
- `src/ui/` — native views. Pixel avatars are drawn from the Host's own avatar code (`packages/core/src/bots/avatar-appearance.ts`), so they match the Web Client.

Carrier decision and evidence: [ADR-0200](../../docs/adr/0200-the-mobile-app-reads-live-state-over-the-dsh-remote-stream-socket.md).

## Toolchain

Expo SDK 57 (React Native 0.86, React 19.2) inside the pnpm workspace with pnpm's default isolated linker: no `node-linker=hoisted`, no `.npmrc` change. `metro.config.js` adds one resolver rule so Metro can follow the Host sources' `.js`-suffixed TypeScript imports. Having React Native in the workspace makes pnpm link it as an optional peer of a few web packages (`morphicons`, `@tanstack/charts`); those packages only load it from their explicit React Native entry points.

```bash
pnpm install
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile                     # Host client against the recorded fake Host
MOBILE_LIVE_HOST_URL='http://127.0.0.1:<port>/?token=<token>' pnpm vitest run apps/mobile
                                                # also pairs with a live isolated Host and drives it there
pnpm --filter @botharness/mobile export          # Metro bundles for iOS and Android
```

## Full client in the app

Every native screen can offer "Open full client" (`src/ui/open-full-client.tsx`), which opens `app/full-client.tsx` as a modal. It loads `<route>/botharness-device/web/` in a WebView on the route the native screens are using and sends the device credential as a header only on that first load; the Host answers with a session cookie scoped to that directory ([ADR-0199](../../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md#full-web-client-in-the-app-1654)). The target (`home`, a PersonaBot DM, or a private input request) becomes a hash the Web Client reads to land there. Links that leave the Host's web directory open in the system browser. When the Host refuses the device, the modal shows "Pair again" instead of the page. `react-native-webview` is native code, so a development build made before this change must be rebuilt.

## Screenshots without a phone

Cloud sessions have no simulator: the container has no KVM for the Android emulator, no macOS for the iOS simulator, and the egress policy blocks `expo.dev`, so EAS cannot be driven from there. For PR evidence they render the same screens through React Native Web and screenshot them at a 390 × 844 phone viewport:

```bash
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export:web
python3 -m http.server 8099 --directory apps/mobile/dist-web &
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-light.png light
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-dark.png dark
```

The web render is layout evidence, not native evidence: it shows the app's own views, copy, spacing and theme, but not native headers, large titles, keyboard behavior or fonts. `expo-secure-store` has no web backend, so the web build always opens on the pairing screen, and the camera scanner only runs on a native build. Native behavior is still checked on a development build (below) and reported in the PR's Human QA.

## Run it on a phone

1. **Host.** Start an isolated Host and publish its port on your tailnet with HTTPS:

   ```bash
   node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 3080
   tailscale serve --bg 3080                     # https://<machine>.<tailnet>.ts.net → 127.0.0.1:3080
   ```

   The phone talks only to the device gateway, which forwards over loopback, so it needs no `--trusted-host`. Add `--trusted-host <machine>.<tailnet>.ts.net` only if you also open the Web Client through the tailnet name.

2. **Development build.** Once per machine, `npx eas-cli login` and `npx eas-cli init` in `apps/mobile` (writes the EAS project id into `app.json`). Then `pnpm --filter @botharness/mobile eas:dev -- --platform ios` (or `android`) and install the build from the link EAS prints. A local build also works: `pnpm --filter @botharness/mobile ios` / `android` with Xcode or Android Studio. The camera scanner is native code, so a build made before pairing landed must be rebuilt.

3. **Pair.** Start Metro with `pnpm --filter @botharness/mobile start` and open the app. On the computer, open DeepSeekBot settings → Devices → Pair a phone. Scan the QR code with the app (or copy the pairing link and paste it). The settings show a warning with the `tailscale serve` command when the Host has no route a phone can reach.

4. **Check.** The Roster lists every PersonaBot with its avatar. Send the Bot a DM from the computer: its state turns to Thinking and back on the phone without a refresh. Restart the Host: the app reconnects by itself without pairing again. Settings → Devices lists the phone with its last-seen time; Revoke it and the app shows "Pair again" at once.

The device credential is stored only in the platform's secure storage and never logged; the Host keeps only its hash. "Unpair" forgets it on the phone; revoking it in the Web Client cuts the phone off on the Host.
