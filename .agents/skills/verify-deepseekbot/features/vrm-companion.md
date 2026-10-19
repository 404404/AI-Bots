# VRM companion Panel

Current WIP override: the expanded dialog was removed in the material iteration. Do not drive Expand/Return below; resize the native Panel split instead. Scene controls now includes MToon/lilToon. Re-run both shaders, real Activity/speaking and narrow/wide Panel coverage after the pending visual work; see [handoff](../../../../docs/qa/2222-vrm-materials-handoff.md).

## Sub-features

- Independent native Bundle installation, activation, removal and reinstall.
- DM-bound current Bot Panel, absent in Groups; fixed global A/B instances retain identity after switching and refresh.
- Current/live Activity plus committed own-DM output drive independent body and speaking channels.
- Pause/disconnect/hidden/close cancel playback; reconnect never speaks history.
- Per-instance renderer disposal, late model loads, reduced motion, resizing and visible fallback on WebGL loss.
- Full-body Panel canvas with overlay controls, expanded same-renderer dialog, desk/room/portrait cameras, seated keyboard contact and bounded stand/walk/return choreography.
- Spatial exterior, local-time sky/sun/lamp lighting, explicit sunset/night previews, and reduced-motion-aware ambient movement.

## How to get to it (user POV)

Install the local `@botharness/vrm-companion` Bundle into the task-owned Profile. Enter Bot mode, select a Bot, open Messages from the rail if closed, then choose VRM Companion in the Messages header. Pin globally for an explicitly fixed instance. Delete instance removes metadata; a normal close retains it. Group headers omit the contextual entry while fixed global instances remain available.

## Driving it with verify-app

Launch and doctor an isolated Host. Seed two Bots named VRM QA Ada and VRM QA Bob and a QA Group using the public CLI, configure a working model, and install the native plugin in the same home/profile.

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs open
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs send
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs work
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs instances
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-vrm-companion.mjs lifecycle
```

The journey uses visible Web controls, captures screenshots/ARIA/console and correlates visible Activity and speaking with canonical Host reads. The instances phase recreates only the test Profile's fixed character instances, verifies A/B identity and fresh-load silence, and records a five-second two-renderer sample. Preserve failure evidence before reruns. Inspect screenshot pixels, not just data attributes.

The lifecycle phase selects the named QA Group, checks the missing contextual entry, emulates reduced motion, loses a WebGL context, retries and deletes one fixed instance while inspecting real context disposal. Separately remove the Bundle with the native CLI, restart only the task-owned Host without deleting its home, run the removed phase, then reinstall and restart again. This path is restart-required; an offline manifest change alone does not qualify live unloading. Confirm current state remains readable, no historical speaking resumes, and other Bot functions work after removal. CLI reads must match the visible Bot and Channel identities.

## Gotchas

For the room journey, use the authorized browser's visible controls: open Scene controls, select Room view, Stand up, then Walk around; observe actual position changes, choose Sit down, and verify the same chair position. Return to Desk view and compare Local time, Sunset and Night. Expand scene and return/Escape must preserve the same renderer and pose. Send a uniquely marked real DM; capture a nonzero mouth frame and the committed text, then correlate the message ID using the online `channel-messages` CLI. Inspect hands, knees and chair contact in pixels as well as phase attributes.

The canvas must cover its entire Panel content box in both a narrow dock and the expanded dialog. Scene controls and speech are overlays. Keep the Chrome acceptance tab visible for motion/performance sampling: operating-system occlusion may throttle frames even when `document.visibilityState` remains visible. Do not report such a sample as foreground frame rate. Capture fresh pixels after an action settles; a browser accessibility snapshot can update before the next rendered screenshot.

The existing workspace remembers Messages visibility separately from Channel selection. A closed Messages panel must be opened from the rail. Both hidden fallback and visible workspace sidebars can contain the same accessible name; target visible controls. More than two long-lived streams make network-idle waits unsuitable: wait for DOM and the loaded character instead. The generic screenshot helper's old Settings precondition does not match this native shell; use this dedicated journey.

The machine's Go quota may be exhausted even when configuration checks pass. Preserve the QUOTA receipt and use only an already configured authorized model route. A real committed reply is required for a speaking claim. The current sample model and silent text clock do not establish audio lip-sync, arbitrary model compatibility, native Desktop performance or Human acceptance.
