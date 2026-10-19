# ADR-0236: DeepSeekBot appearance is Client-local and scoped

- Status: Accepted
- Date: 2026-10-19
- Scope: DeepSeekBot Web and macOS Desktop, T1 only
- Spec: [#2256](https://github.com/BotHarness/DeepSeekBot/issues/2256)
- Implementation slice: [#2258](https://github.com/BotHarness/DeepSeekBot/issues/2258)

## Context

DeepSeekBot's Appearance page previously wrote the DSH-native Host theme. Users need independent light/dark/system selection, separate presets and Primary colors for each mode, and device-local persistence. This must not change DSH's native settings or PersonaBot identity colors.

## Decision

`Appearance` is the application-defined Client authority. It stores one versioned document at `botharness:appearance:v1` in localStorage. Web uses browser/site storage; Desktop uses its fixed `dsh-app://app/` origin and application user-data directory. Neither the key nor the document contains a Host identity. Web and Desktop do not synchronize. A storage event refreshes another tab in the same browser/site. System mode observes the local media query.

Each mode selects Classic Blue or Mist Purple and can override Primary. Selecting a preset clears that mode's Primary override, retaining the other mode, unknown future fields and all unrelated settings. Every write rereads storage; an explicit expected revision refuses a stale CLI write. A storage/parse/version failure preserves stored bytes and the last accepted rendering and reports failure. There is no optimistic persisted-success state. localStorage does not offer cross-tab compare-and-swap: concurrent writes are last-writer-wins; revision checks detect an already observed conflicting write, not a transaction across processes.

A disposable stylesheet applies palette variables only to DeepSeekBot roots, the enabled workspace mount, and explicitly marked owned modal/menu surfaces. It never mutates `body[data-ds-dark-theme]`, native theme services or native preference storage. Existing native primitives retain focus, dismissal and positioning behavior. Scope removal restores inherited native values. PersonaBot source colors and error/warning/success roles retain their own semantics.

The pinned native baseline in `appearance-native-tokens.ts` is derived from `@deepseek-ai/dsh-client-ui-theme@0.2.1-rc.2`, MIT licensed by DeepSeek. Its license is retained in `packages/client/appearance-palette.LICENSE`. It flattens the upstream design-platform, gradient/shadow and Shiki token declarations into local light/dark maps, not global selectors. Recheck this adapter when the pinned DSH palette changes. Feature styles continue to consume the existing semantic token aliases; this is not a new global theme registration.

## Direct Client control

`appearance-clients`, `appearance-get` and `appearance-set` use an authenticated `connection.fetch` route, `/api/botharness/appearance-control`. The Host holds only bounded, ephemeral delivery leases and one pending request per Client, never preference snapshots or a durable mirror. The route uses DSH's existing authentication boundary; it does not install a second `/api` interceptor.

A Client registers a fresh id and private polling token on mount. CLI callers must select an id; writes also require the revision returned by a live read and a JSON patch on stdin. A request is sent only to that Client's waiting poll. The same local owner processes UI and CLI writes, then acknowledges the accepted snapshot. Missing, stale, busy or unavailable targets, expired delivery, invalid input and storage failures produce coded refusals. No broadcast, inferred target, queued offline mutation or automatic write retry exists. A timeout has an unknown outcome if delivery already occurred; read again before retrying. Leases expire after 30 seconds, polls after 15 seconds and requests after 8 seconds; disposal clears leases and pending callers.

This is not #2095's native Host-theme/locale control. Native language, notifications, geometry, wallpaper, transparency, blur and per-panel settings are outside T1. Only T1 is implemented; sibling slices wait for Human QA of this first path.

## Verification boundaries

Owner tests cover mode independence, restart restoration, unknown-field retention, failed writes and revision conflicts. Delivery tests cover exact targeting, private poll tokens, expiry and refusal propagation. The feature map supplies runnable real Web and task-owned macOS Desktop journeys. Source tests, runtime evidence and Human QA are separate gates; this ADR does not assert an unrun platform passed.

## T2: global materials

Each mode may hold partial `materials.header` and `materials.body` values: six-digit `color`, `opacity` from 0 to 100 percent, and `blur` from 0 to 40 CSS pixels. These are application-owned surface properties, not a DSH theme or layout setting. Each field resolves against that mode's selected preset. Classic Blue retains the opaque neutral panel baseline; Mist Purple, Forest Green and Warm Amber supply translucent, blurred defaults in both modes. Explicit user values are not automatically recolored for contrast.

Changing a preset clears the known Primary and global material adjustments for that mode, retaining the other mode and unknown future fields. The same local owner and explicit Client CLI patch process every field; no Host preference store is added. CSS paints the Dock header and content container, with alpha only in the background color and blur only in backdrop-filter. Internal roots and the Control Rail stop painting redundant opaque backgrounds. Dock geometry, message bubbles, cards, inputs and scoped modal/menu palettes remain independent. A controlled background pixel comparison verifies actual blur separately from computed-property assertions. Wallpaper assets and panel-specific overrides belong to later slices.

## T3: functional Panel overrides

Each mode's `panels` map stores partial Header/Body materials by `dock:<functional-registration-id>`. The registered Dock catalog provides labels and target availability; the local appearance owner remains the sole preference authority. Closing or changing the Panel content does not remove its configuration. The Header-only context menu opens an opaque, locally themed modal; it does not introduce a global Panel editor or a visible ellipsis button.

Each property resolves target override → mode global material → preset default. A null field in a Panel patch removes that field; a target reset removes only that target in that mode. Global preset selection retains Panel overrides. Active Dock-tab group selectors paint the Header/content surfaces directly, avoiding inheritable per-panel material variables that would incorrectly impose parent overrides on nested containers. Nested presentation targets are a separate slice.

`appearance-targets` uses the existing explicit-Client read request and returns the registered target catalog alongside the local snapshot. Panel writes share `appearance-set`, revision checks and storage refusal. Missing or duplicate target identities refuse instead of selecting another target; unregistered saved overrides remain available when that registration returns. No new Host preference authority is introduced.
