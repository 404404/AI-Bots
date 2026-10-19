# Desktop whole-window zoom

## Sub-features

- S1 (#2268): one primary macOS window, settings/default/reset, owned font-shortcut handoff, device-local persistence and exact-target CLI.
- S2 (#2269): full focus, composition, recording, extreme-level and compatibility lifecycle matrix.
- S3 (#2270): Windows/Linux native qualification and multiple windows where supported.

## How to get to it (user POV)

In the isolated desktop, enter Bot mode → Bot Settings → General → Window zoom.
Set a default, press ordinary Cmd+= once, and reset to the saved default. The sidebar,
settings modal and content must change together while manual font sizes remain unchanged.
The controlled S1 composition requires the pinned downstream theme adapter; an ordinary
installation without that adapter does not enable these controls.

## Driving it with verify-app

Build the linked worktree, then run `scripts/e2e-desktop-zoom-launch.mjs` on macOS. It owns
a temporary Profile, user-data directory and debug port, and stops only that exact process.
This is a launcher and prerequisite probe, not an acceptance pass. Keep private login data
out of published logs. Select only the uniquely identified isolated window for native input.
The task-only QA Bundle writes the current loopback Host origin and a private token-file path to
`cli-access.json` inside the launcher's isolated root. Launch tokens and native worker ports change
on actual restart; use this fresh metadata rather than an old endpoint. Token and metadata files
are 0600 and remain machine-local. The helper uses existing `webServer` / `connection` Providers
and adds no listener or product API.

Use `window-zoom-clients` to obtain an explicit live Client ID. `window-zoom-get` returns its
revision; `window-zoom-set --zoom-level=1 --expected-revision <revision>` and
`window-zoom-reset --expected-revision <revision>` operate on that same owner. Add
`--zoom-default` to change the device default and current window together. No model is needed.
Verify the visible settings value and root CSS factor independently of the CLI result.

Acceptance requires real native screenshots at 83/100/120/144%, main/iframe/webview focus,
one ordinary Cmd+= action with unchanged font tokens and guest-native zoom, a true process
restart, storage refusals, and Human feedback. Record each run against its exact source SHA.

## Dock layout regression

Run `node scripts/e2e-dock-zoom.mjs` for the real pinned Dockview browser fixture. It asserts
content allocation at normal, smaller, larger and extreme zoom levels, retained inputs and
screen-space splitter movement. This is dependency regression coverage, not a DSH acceptance
pass. In the preserved desktop window, compare each visible panel's content rectangle against
its group allocation at the same levels and capture matched whole-window before/after pixels.
Do not accept clipping, a layout reset or replacing live panels as an overlap fix.

## Gotchas

- The native 0.2.1-rc.2 shortcut protocol rejects NumpadAdd/NumpadSubtract/Numpad0.
  S1 leaves reset unbound but operable through Settings and CLI; do not claim numberpad support.
- Whole-window native pixels are required: a clipped CDP screenshot can omit native guests.
- Loaded DOM, working input and a visible-document flag do not prove a webview painted.
- Create and resize guests while hidden, restore normally at unchanged geometry, and compare
  fixture rulers, retained input, guest identity, navigation count and zoom action count.
  Reload, guest replacement or forced fullscreen are not fixes. Failure blocks qualification.
- Browser tabs retain browser-native zoom; Windows/Linux are not enabled by S1.
