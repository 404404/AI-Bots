# Desktop whole-window zoom is Client-owned

- Status: Accepted direction; controlled S1 implementation, native qualification pending
- Date: 2026-10-19
- Tracking: [#2245](https://github.com/BotHarness/DeepSeekBot/issues/2245), [S1 #2268](https://github.com/BotHarness/DeepSeekBot/issues/2268)

The application-defined WindowZoom owner keeps device-local defaults and the current primary
window level in one versioned document on the stable `dsh-app://app` origin. Settings, shortcut
commands and directly targeted CLI requests consume that owner. Integer levels -8 through 8 map
to `1.2 ** level`. Changing the default also applies it to the current window; an ordinary step
changes only the current level. Reset uses the saved default. Failed persistence refuses the
operation before presentation; a presentation failure after commit is reported separately.
Malformed storage is retained rather than silently overwritten.

The qualified S1 shell has one primary product window. Its persistent identity is `primary`,
independent of the ephemeral delivery Client ID or Host process/port. This does not promise
multiple-window identity or cross-device synchronization. A later shell exposing multiple
product windows needs a new qualified identity contract before this owner can serve it.

## Native boundaries and downstream composition

Root CSS zoom scales the Client document and embedded surfaces. It does not change native
BrowserWindow zoom, guest-native page zoom or the user's manual font settings. The supported
shortcut Registry remains the single input router, including native forwarding from frames and
webviews. Do not add a competing global DOM listener or synthesize input from an observer.

Bot-mode Dockview overlays and splitters must convert viewport measurements back to local
CSS layout units using the effective CSS zoom. The repository pins a local pnpm patch for
Dockview 8.4.1's ESM and CommonJS package entry points; the Client bundles that patched code.
It adjusts overlay geometry and splitter deltas without changing panel ownership, persistence,
minimum constraints or DOM parentage. No DSH source or installed shell is changed. The patch
must be requalified when Dockview is upgraded; restoring the unpatched package reintroduces
panel overlap whenever root CSS zoom differs from one.

The macOS native traffic-light footprint remains 88×40 viewport pixels independently of
Client zoom. The workspace chrome owner converts its measured intersection with each group
back to local header padding, updates on zoom/layout/fullscreen changes, and places a rail
under that native footprint. Fullscreen and non-macOS shells reserve no corner. This is
presentation geometry, not a new layout preference or a native-shell modification.

The pinned DSH theme owns fixed Cmd+=/Cmd+- font commands. The downstream compatibility
generator copies the exact MIT-licensed npm theme artifact, preserves its license, validates
its version and hashes, and changes only its font-shortcut Fiber ownership and canonical ESM
schema import. The generated package replaces the theme through native Profile composition;
it is not an additional theme Provider and does not modify an installed ASAR. A lease removes
only that owned font Fiber while WindowZoom is mounted. Disposal removes application commands
before restoring the original font scope. Other theme behavior and manual font controls remain.

The marker is an application-defined capability, not a public DSH API or an automatic probe of
the running executable's version. S1 activation is limited to the explicitly qualified macOS
0.2.1-rc.2 test composition. Packaging must verify the actual shell combination before wider
activation; an SDK version alone is insufficient. Unknown source artifacts fail generation.
The current native protocol rejects numberpad codes, so S1 reset is available in Settings/CLI
and as a custom-bindable command; default numberpad behavior remains an S2 dependency.

## CLI and lifecycle

The authenticated existing API Gateway route relays requests to an explicit live Client. It
stores only ephemeral leases and one pending delivery per Client, never zoom preferences.
Mutation requests carry the revision observed by the caller. Expired, offline, busy and stale
requests fail with codes. No window is implicitly selected. Delivery timeouts/cancellation can
have an unknown write outcome; callers re-read rather than automatically replaying mutations.
The Client's normal reconnection renews the delivery channel only.

Visibility changes reapply the latest saved level without saving another revision. This is
state reconciliation, not proof of native guest painting. The original guest must recover on
ordinary foreground restoration at unchanged window geometry, retaining input and navigation
identity. Reloading, recreating guests, periodically toggling CSS or forcing fullscreen is not
an accepted production remedy. Failure blocks qualification of that desktop combination.

## Alternatives and validation

Browser-native zoom is retained in ordinary Web Clients. Rebinding upstream font commands,
patching the installed executable, maintaining a Host-side settings copy, and a second keyboard
router would introduce ownership or compatibility conflicts and are excluded.

Source tests cover state/refusal and cleanup, with real pinned shortcut normalization. Live
CLI read/set/default/reset has reached the isolated desktop owner. Source tests and loaded
shells do not qualify native input, visual restoration, true process restart, extreme layouts,
Human QA or Windows/Linux. Those remain explicit issue/PR gates until measured.
