# THROWAWAY #2245 — desktop zoom feasibility probe

This is disposable research, **not a feature implementation or a merge candidate**. It asks whether a downstream Client Plugin, without changing DSH, can scale the document, coexist with fixed font-size keys, and include embedded documents. All state is in memory. No production module imports this directory.

The prototype uses a real Client Plugin rather than a standalone HTML mock because the question depends on DSH's Registry, preload and Electron embedding behavior. `host.js` is inert; `client.js` contributes ordinary shortcut commands plus an explicitly marked experiment panel. It does not remove other Plugins' registrations, intercept arbitrary IPC, or modify the installed ASAR. `KeyY` is a **diagnostic positive control**, not a proposed product shortcut.

## Run

Requires macOS, the official installed `DeepSeek Harness.app` version `0.2.1-rc.2`, and a BotHarness checkout with its existing dependencies. No download or install is performed. Keep the usual app untouched.

```sh
BH_SOURCE_ROOT=/path/to/BotHarness node packages/client/prototypes/window-zoom-2245/launch-native.mjs
```

This creates a fresh temporary DSH_HOME and browser directory, lets the desktop initialize its Profile, stops only its own child, inserts the local prototype Plugin, and restarts it. It uses the repository's shared dev credential resolver without printing credentials; no model request is necessary. Ctrl+C stops this owned instance and retains its temporary files. The bootstrap wrapper was syntax-checked; the equivalent steps were executed manually for the recorded experiment, rather than claiming the wrapper itself was replayed.

In another terminal, with the same source checkout:

```sh
BH_SOURCE_ROOT=/path/to/BotHarness node packages/client/prototypes/window-zoom-2245/run-native.mjs
BH_SOURCE_ROOT=/path/to/BotHarness node packages/client/prototypes/window-zoom-2245/run-guest.mjs
```

The first driver hosts an inert loopback fixture on port 39446 and writes screenshots and measurements under `evidence/`. Debug port defaults to 39445; override `ZOOM_PROTOTYPE_DEBUG_PORT` consistently if occupied. The second driver expects the first driver's loaded guest to remain present. Both use automation input; neither constitutes physical-keyboard QA. Each rerun replaces the final measurement filenames, so copy prior evidence first.

`run-web.mjs` separately exercises a real isolated DeepSeekBot Web page using the same CSS mechanism. First launch `node scripts/verify-app.mjs launch --name zoom-2245-prototype` from a built source checkout and check `doctor`; then run the driver with `BH_SOURCE_ROOT`. Stop that Host with `verify-app.mjs stop`. This deliberately forces the candidate CSS mechanism for layout research only; ordinary browser product behavior is unchanged. The recorded Web run used existing built artifacts, not a rebuild of the prototype branch.

## Evidence and limits

Read `REPORT.md` first. `evidence/native-results.json` is the final desktop run; `native-first-attempt.json` preserves the first, incomplete fixture attempt. The Web runs with and without the tutorial are kept separately. `guest-first-input-attempt.json` preserves the failed focus setup; `guest-native-input.json` fixes focus but still lacks a positive native-input response.

No production persistence, default selection, restore command, compatibility package, new desktop shell, CI qualification or release was implemented. No upstream file was edited. The native DSH run and BotHarness Web layout run are separate compositions and must not be presented as an integrated DeepSeekBot desktop acceptance run.
