# VRM Panel: first runnable slice

Room iteration 3 is implemented and isolated-Host verified; Human visual acceptance is pending. See [the handoff](qa/2222-vrm-materials-handoff.md) for the current validation boundary.

This is the implementation guide for [T1 #2222](https://github.com/BotHarness/DeepSeekBot/issues/2222), under [ADR-0234](adr/0234-panels-are-native-plugins-with-independent-binding.md). It does not implement the T2 Task Kanban or the later migration tickets. Human acceptance remains the gate before expanding those slices.

## Install and open

Build the repository with the pinned dependencies, then install the independent native Bundle into an isolated DSH Profile:

```sh
pnpm install
pnpm build
dsh plugin --profile web-dev add "link:<absolute-checkout>/packages/vrm-companion"
```

Use the worktree's pinned DSH CLI and the same DSH_HOME as the running Host. The package has its own manifest, Patch, Host entry and Client entry. The Host entry creates no domain state or worker. It is not included automatically in the DeepSeekBot umbrella. Native bundle activation/deactivation remains DSH-owned. The isolated CLI install/remove path was verified with a Host restart after each Profile mutation; changing the package manifest alone is not proof that a running Host has unloaded it.

In Bot mode, select a Bot DM, open Messages if it is closed, then choose **VRM Companion** in the Messages header. Group Channels have no contextual character entry. **Pin character globally** creates a separately identified, fixed-Bot instance whose title names that Bot. Close/reopen preserves the binding and layout; **Delete instance** removes its metadata. Refresh restores fixed instances even before a Channel is selected. Uninstalling the plugin retains dormant instance metadata for reinstall. A missing/deleted Bot produces an unavailable state.

## Public Client contract

Plugin authors import only types from `@botharness/ui/panels` and inject the application-defined `dockPanels` and `botPresentation` Services. DSH/Cordis still owns Plugin/Fiber disposal and Service injection. These are BotHarness contracts, not native DSH Panel or Activity APIs.

```tsx
import type { Context } from '@deepseek-ai/cordis';
import type { DockPanelProps, PanelServices } from '@botharness/ui/panels';

export const inject = ['dockPanels', 'botPresentation'];
export function apply(ctx: Context & PanelServices) {
  function View({ channel, botId }: DockPanelProps) {
    const binding = botId ?? channel?.botSlug;
    return <div>{binding}</div>;
  }
  ctx.effect(() =>
    ctx.dockPanels.register({
      id: 'my-character',
      title: 'My character',
      scope: 'channel',
      binding: 'current-bot',
      component: View,
    }),
  );
}
```

The complete resource-owning example is `packages/vrm-companion/src/client/index.tsx`. Acquire `botPresentation.acquire(botId)` when a view mounts; use `getSnapshot` and `subscribe`, and call its idempotent `dispose` when it unmounts. Do not acquire resources during React rendering. Subscribers may return a Promise; one failed subscriber is isolated with bounded diagnostics.

A snapshot contains the current Bot name, availability, paused state, connection state, Activity, optional attention, current visible text, speaking flag and mouth weight. Activity is read from the existing ClientStore projection; the presentation Service does not write Activity or own execution. Attention is independent of Activity: waiting alone does not imply a Human response is required.

There is one output clock and one authorized output subscription per Bot per Client. Multiple views share that clock but own independent Three.js scenes, skeletons, expressions, cameras and renderers. Closing the last view releases the output stream and timer. Different Bots have different output clocks. This slice consumes only committed output from that Bot's own DM; it does not expose shared/private group contents, model deltas or hidden reasoning.

## Persistence and failures

Ordinary instance metadata extends the existing version-8 layout document, with no second persistence key or Host store. Metadata contains instance ID, definition ID, fixed Bot ID and display label; at most 16 ordinary instances are retained. Contextual open state and split geometry remain in the existing per-Channel layout owner. Unknown valid split leaves survive plugin reload.

Registration and instance operations throw stable refusal strings: `invalid_panel_definition`, `panel_definition_unavailable`, `invalid_bot_binding`, `panel_instance_limit`, `panel_layout_unavailable`. An unavailable definition cannot create an instance. A failed save leaves the prior instances intact. Disposers are idempotent and cannot unregister a later replacement.

Mounting or reconnecting establishes a fresh output checkpoint; it never speaks baseline/history. Disconnect, hidden document, pause, deletion and final disposal cancel the current output. Deduplication uses connection generation, Channel and message identity, not text equality. Queues and deduplication sets are bounded. The first slice is silent: it does not opt into the old floating companion's audio owner or add TTS.

## Rendering and assets

The canvas fills the Panel body. Status, scene controls and committed speech overlay the scene rather than reserving a separate column or card. There is no separate expanded view: widen the scene by resizing the native chat/Panel split. Camera, room-time and shading choices survive a remount of the same Bot's view during the page session; they are presentation preferences, not durable state. Loading shows a transient status without a retry action; only a failed load or lost WebGL context offers **Retry character**.

The default pose sits at a desk with hands aligned to the keyboard. **Scene controls** exposes Desk/Room/Portrait views and Reset view, Sit down, Stand up, and opt-in Walk around. Walking stays in a bounded lane and yields to real work or speaking; Sit down cancels wandering and returns to the chair. Each view owns its choreography, with no Host mutation or persistent world simulation. While the Bot is idle and the character is seated, it occasionally makes a small decorative gesture: looking toward the window, stretching, resting its chin on a hand, sipping from the cup or glancing at the viewer. A gesture starts after a random 6–14 seconds of eligible idle time, never repeats the previous one, and eases back to the keyboard as soon as the Bot starts working, speaks or the character is asked to move. Time spent not idle, hidden or under reduced motion does not accumulate, so returning never replays missed gestures. Each view schedules its own gestures; they carry no task or emotion meaning. The sip uses a grip declared on the mug (wrist point, hand orientation and finger curl): the arm reaches it with IK and the mug follows a planned path to the mouth, so moving the mug does not require new animation. Reduced motion suppresses wandering and ambient motion and resolves requested poses directly.

The room, furniture and exterior are self-authored Three.js geometry plus two CC0 KayKit models (books and a decorated shelf). Room objects use real-world sizes (a 27-inch monitor, a tenkeyless keyboard, an 8 cm mug, an articulated desk lamp) in a low-poly style: few segments, flat-shaded faces and matte colors drawn with a three-step toon shader, including the KayKit models. The lamp is a spotlight that casts a warm pool on the desk, and night shifts the ambient light to blue. A framed window opening in a plaster back wall, with linen curtains, reveals soft shader-drawn cloud layers, balloons, a glowing sun/moon and stars; the same local wall clock drives sky colors and the sun's lighting direction. **Local time** is the default; **Sunset** and **Night** are explicit lighting previews. At night the room light drops and the desk lamp becomes the main warm light. **MToon** (default) and **lilToon** are a reversible shading comparison; the lilToon port uses only the first directional light, so the desk lamp does not light the character in that mode. Clouds, leaves and steam move while visible; hidden views stop frame work and resample current local time on return. The room is a bounded T1 presentation, without weather services, music, timers, room editing or a second durable authority.

The renderer uses `three@0.180.0` and `@pixiv/three-vrm@3.5.5`. Idle/thinking/working/waiting/blocked drive normalized humanoid poses; a separate text clock drives the mouth and limited speaking gestures, so working and speaking can coexist. Each Activity also maps to a blend of the model's own facial expressions (relaxed at idle, a thoughtful look upward when thinking, focused brows when working, an expectant smile when waiting, a troubled look when blocked); speaking opens the eyes and adds warmth except when blocked. Expressions ease in and out, expressions the model lacks stay at zero, and a view that is not live returns to a neutral face. This is presentation only: it does not add an emotion fact or Host state. Reduced motion suppresses repetitive movement. Hidden/zero-sized panels stop drawing; restoration resets the frame delta. Failed loads and WebGL context loss leave readable state/text with a retry action. Disposal releases observers, animation frames, geometry/materials/textures, ImageBitmaps and the renderer, including a model that finishes loading after close.

The bundled technical sample is licensed under the VRM Public License, not the repository's source license. See [asset provenance and permissions](../packages/vrm-companion/assets/README.md). It demonstrates the runtime; it is not the final character art direction or a claim to reproduce Nintendo assets. No model upload, VRMA library, wardrobe, scene editor or TTS settings are included.

For this local slice, the sample is embedded in the Client bundle to avoid inventing an asset-serving route. The resulting Client is about 16 MB before transport compression, and each instance owns its mutable GPU resources. Measure cold loading and multiple instances on the target machine; this is an explicit initial-size limitation, not a performance target.

## Verification

The feature map is [VRM companion](../.agents/skills/verify-deepseekbot/features/vrm-companion.md). Activity and committed output use existing CLI parity: `deepseekbot bot-activity <bot>` and `deepseekbot channel-messages <dm-channel>` against the same live Host. This slice adds no Host RPC, route or Bot tool. It does not claim delivery of the separate layout CLI work in #2096.
