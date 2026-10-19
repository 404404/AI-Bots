# T1 VRM Panel verification

Date: 2026-10-19. Issue: [#2222](https://github.com/BotHarness/DeepSeekBot/issues/2222). Base: c124687079368a4156de00c3edc016bb7c50cad2. This report accompanies the first implementation PR; Human acceptance remains pending and T2–T15 remain blocked.

## Real runtime

- Isolated Windows Host using the worktree-pinned DSH 0.2.1-rc.2, native Web Client, Chrome 153.0.8010.36, 1440 × 900.
- Independently installed the local VRM Bundle with the native plugin CLI into the same isolated Profile. A CLI Profile mutation required restarting this Host. Removal then restart removed the registration and character views while preserving Bot messages; reinstall then restart restored the saved fixed binding. No claim of hot uninstall is made.
- A real Bot DM used an existing authorized DeepSeek provider and DeepSeek-V4.1-Flash. The initial Go provider returned QUOTA; that failed attempt was preserved and is not counted as success.
- Real UI requests produced thinking, a shell-tool working state, a committed Channel reply and simultaneous working/speaking. Existing bot-activity and channel-messages CLI/Host reads corroborated the visible state. The old floating overlay was not needed.
- Two global instances kept distinct Ada/Bob bindings across chat selection, page refresh and graceful browser restart. Restored views did not speak historical messages. The Group header had no contextual character entry; fixed global instances remained bound.
- Reduced-motion rendering, actual WebGL context loss, readable fallback/retry, and deletion were exercised. The deleted renderer reported context loss while the other renderer remained usable. Successful journeys recorded no page/console errors.
- An earlier QA script forced browser termination and a later run lost persisted instance metadata. The script now first closes normally, with a bounded task-owned fallback; the full browser restart path then passed. Private layout snapshots retain the investigation.

## Automated checks

The affected selection (Client, VRM bundle, browser preview, development-model helper, source policy and verification inventory) passed: 260 test files / 1,990 tests, plus one skipped file/test. After the last changes, the three delta suites passed 32 tests and the built VRM bundle contract passed separately. Type checking and production build passed after a fresh frozen-lockfile dependency installation.

The full Windows suite was attempted and **was not green**: 205 failed, 6,966 passed, 40 skipped. Failures included Windows fsync/permission/path assumptions and timeouts; stale assertions caused by this change were corrected and the affected selection rerun. A clean export of the base reproduced 12 failures across the Lark provider contract, iOS voice preflight and links CLI suites (13 passed). That baseline sample does not establish that every full-suite failure is unrelated. Full CI is a separate status on the PR.

## Original standing-view two-renderer sample

Both independent renderers held 13 geometries, 28 textures and 20 draw calls each over a five-second observation, with 129 additional rendered frames per instance (about 25.8 fps at a configured 30 fps cap). These are Three.js resource counters, not measured GPU memory. Model loading was below 1.2 seconds in these local observations; it is not a network-download benchmark. The embedded technical sample is 10.28 MiB and the Client bundle is about 16 MB before compression. No mobile/native Desktop or sustained performance qualification is claimed.

## Room iteration — Chrome acceptance

The subsequent Human-authorized scene iteration was verified in the Human-selected Chrome against the same isolated Host. The in-app browser could not reach that Host; Chrome successfully used the normal authenticated session. No authentication or browser security setting was weakened. Screenshots below describe the new room; the earlier counters and captures above describe the original standing view, not its current rendering cost.

- The canvas fills the Panel body, with status, scene controls and committed speech overlaid. Expanding uses a native dialog with the same renderer; returning preserves the current scene. Both the narrow dock and expanded 1559 × 865 viewport were inspected. QA caught a closed-dialog interaction failure after returning: the inline view now stays an open non-modal dialog, switching to modal only while expanded. Expand → Return → Expand and Escape were rechecked through real controls.
- Self-authored geometry supplies walls, ceiling, floor, window frames, desk, keyboard, chair, books, lamp, cup, plant and headset. The window looks into a 3D exterior: sky sphere, instanced cloud volumes, balloons, sun/moon and stars. Local time drives sky/light color and sun direction; Sunset/Night are explicit previews. Cloud drift, plant sway and steam are bounded ambient animation, paused by reduced motion. This is a view-local room, with no new durable world state.
- The character starts seated. Hands reach the keyboard through a two-bone IK solve. Stand, bounded walking behind the desk, and return-to-chair were driven through the real controls; the final seat returned to `(0.580, -0.150)` with seated amount `1.000`. Camera presets, sunset/night, expand/return and refresh were exercised. Native skeletal axes are preserved when attaching the original headset.
- `QA-WORK-1019` ran a real 20-second waiting shell tool. The screenshot showed `working` and a typing pose; the online `bot-activity` command corroborated revision 20, `executing`, `pwsh`, one active tool. Its committed reply then drove head gaze and an open mouth; the DOM observation recorded mouth weight `0.65`. The earlier `QA-MOUTH-1019` independently captured a visible open mouth with weight `0.2`. These are silent text-paced expressions, not audio lip-sync.
- At the expanded Room view, the renderer reported 151 geometries, 30 textures and 166 draw calls. Counts varied with the frustum and first-use GPU uploads. Chrome window occlusion throttled animation even while document visibility was `visible`; no foreground frame-rate or sustained room-performance claim is made. The current Client bundle is approximately 16.16 MB before compression.
- The inspected Chrome log contained no errors. Reloads emitted the existing multiple-Three.js-import warning; this is retained as a qualification limit. The room's new disposal path is covered by ownership inspection; the prior standing-view context-loss/deletion journey is not presented as a new room leak test.

The final scene regression selection passed 32 tests in six files, including local motion and wall-clock environment behavior. Repository lint, format check, root/mobile type checking and production build passed. The earlier full Windows-suite failures remain disclosed above; this iteration did not rerun that full suite.

The comparison follows the game's close desk camera, warm window light, seated companion, overlay controls and time-varying exterior. It does not claim identical character art, furniture assets, animation quality or the game's full interaction system. The existing licensed VRM sample remains in use. Research on official game screenshots, Three.js room examples and Tripo limitations is recorded under `docs/research/2026-10-19-*.md`; no game assets were copied and no Tripo credits were spent.

For Human acceptance, open VRM QA Ada → Messages → VRM Companion and widen the Panel split. Use Scene controls to compare Desk/Room/Portrait, Sunset/Night/Local time, and Stand up/Walk around/Sit down. Send a new DM to inspect the independent Activity and speaking channels. Selected room screenshots live in `.github/pr-screenshots/2222-vrm-companion/room-*.jpg`; raw browser observations and the login link remain private.

## Room iteration 3 — isolated Host, headless Chromium

Date: 2026-10-19. Branch head before this iteration: `4699c324` (T1 merged with current main). A Linux cloud container ran an isolated Host with the worktree-pinned DSH 0.2.1-rc.2, the native VRM Bundle installed with the Profile CLI and a Host restart, and Puppeteer's headless Chromium using SwiftShader WebGL at 1560 × 865. The Human's Chrome was not available to this run; these are software-rendered pixels and say nothing about frame rate or GPU cost.

- **Iteration 2 loads.** The handoff's stuck "Loading character" did not reproduce: every load reached `data-vrm-loaded`, assets `2/2`, with no page or console errors. Separately, the whole BotHarness shell (sidebar, regions, workspace mount and every Panel) was torn down and rebuilt by the DSH React tree in 6 of 19 traced sessions, 28–75 seconds after page load. No plugin `rebuilt` event preceded it. The VRM view therefore reloads; before this iteration it also reset to Desk/Local time/MToon and briefly showed "Loading character…" inside the error box with a Retry button. The shell remount cause is not diagnosed and is outside this Panel.
- **Remount handling.** Loading is now a transient status without Retry; only load failure or WebGL context loss offers Retry character. Camera, room time and shading are remembered per Bot for the page session and reapplied on remount. Closing and reopening VRM Companion after choosing Sunset and lilToon restored `vrmMood=sunset`, `vrmShading=liltoon`.
- **Room.** The back wall is plaster with a framed 2.4 × 1.5 m window opening, mullion/transom, sill and linen curtains with slow sway; the desk gained a front apron. Clouds are soft fbm-shaded billboards in three depth layers instead of faceted marching-cube blobs; the sun and moon are glow disks. Night drops ambient/fill/key/environment light and raises the desk lamp, which then dominates the desk under MToon.
- **Desk camera.** The previous framing cropped the lamp and cup at a 609 px Panel. The new default (38° FOV, higher and further back) keeps the lamp, cup and seated character in frame, with the desk in the lower third. Inspected at 364, 609 and 977 px wide Panels.
- **Shader A/B.** MToon and lilToon were captured at the same camera under Sunset and Night. lilToon is darker and cooler at night because the port uses only the first directional light; the lamp does not light the character in that mode. MToon remains the default.
- **Real DM.** `QA-WORK-0716` to VRM QA Ada through the visible composer, model DeepSeek V4.1 Flash via the configured opencode-go route. The Panel showed idle → thinking → working → speaking, with mouth weight 0.4 while the committed reply was shown. `bot-trace` recorded `bash` `sleep 6` then `channel_send`; `channel-messages` returned the committed Bot message. Silent text-paced speaking, not lip-sync.
- **Movement.** Stand up → Walk around moved the character along the lane behind the desk; Sit down returned it to `(0.580, -0.150)` with seated amount 1.000, clear of the new wall.
- **Resources.** Five close/reopen cycles each settled at 144 geometries / 34 textures / 142 draw calls in the default view, and every closed renderer's WebGL context was lost while the open one stayed live. Closing three times mid-load, then reopening, loaded `2/2` assets with no page or console errors. These are Three.js counters, not GPU memory measurements.

Selected captures: `room-iteration2-sunset.jpg` (before), `room-iteration3-light.jpg`, `room-iteration3-dark.jpg`, `room-iteration3-narrow-night.jpg`, `room-iteration3-room-view.jpg`, `shader-ab-iteration3.jpg` and `room-iteration3-working-speaking.jpg` in `.github/pr-screenshots/2222-vrm-companion/`.

## Activity facial expressions (#2304)

Date: 2026-10-19. Sub-issue [#2304](https://github.com/BotHarness/DeepSeekBot/issues/2304) of T1. Same isolated Host setup and SwiftShader caveat as iteration 3.

- **Mapping.** The sample model exposes `happy relaxed sad angry surprised` (`data-vrm-faces`). Each Activity drives a blend of these: idle relaxed with an occasional smile, thinking a slight frown with raised gaze, working focused brows, waiting an expectant smile, blocked a troubled frown. Speaking clears the relaxed eyes and adds a smile except when blocked. Weights ease at a 4/s rate; reduced motion snaps them and drops the idle smile. A view that is not live (reconnecting, unavailable, paused) returns to neutral.
- **First pass was too subtle.** At 0.1–0.4 weights the five faces were barely distinguishable in a portrait close-up; weights were roughly doubled. At `angry` above 0.3 this model nearly closes its eyes, so working uses `angry` 0.2 with a little `surprised`.
- **Close-ups.** A scratch harness mounted the same `mountStage` with each Activity snapshot and captured a portrait close-up per state; dominant face: idle → relaxed, thinking → sad, working → angry, waiting → happy, blocked → sad, working + speaking → happy, reconnecting → neutral (`face-activities.jpg`).
- **Real DM.** `QA-FACE-1019b` to VRM QA Ada (DeepSeek V4.1 Flash via opencode-go) moved the Panel idle → thinking → working → speaking (mouth 0.2) → idle; `bot-trace` recorded `bash` `sleep 12` then `channel_send`. The stage reported the thinking face while thinking and the relaxed idle face after the reply. Software rendering runs at a few frames per second, so the blend visibly lags the label by a few seconds there.

## Idle gestures (#2305)

Date: 2026-10-19. Sub-issue [#2305](https://github.com/BotHarness/DeepSeekBot/issues/2305). Same isolated Host and SwiftShader caveat.

- **Gestures.** Window glance (head and torso turn toward the window side), stretch (both arms released from the keyboard and raised, eyes closed), chin rest (right hand to the chin), sip (right hand reaches the mug handle, carries the mug to the mouth and back, steam fades while it is lifted) and a smiling glance at the viewer. The mug handle now faces the character so the hand can reach it; the mug moved 0.14 m toward the keyboard.
- **Close-ups.** A scratch harness forced each gesture at a fixed progress through the real `mountStage` (`idle-gestures.jpg`). Inspected for hand contact, arm crossing and mug position; the first window pose twisted the torso enough to fold the keyboard arm and was reduced.
- **Natural trigger.** In the isolated Host, VRM QA Ada at idle started `stretch` after 8.1 s of render time with no input.
- **Work.** `QA-IDLE-1019` (real DM, DeepSeek V4.1 Flash) moved the Panel to thinking and working; `data-vrm-idle` stayed `none` throughout. Retreat from a gesture already in progress is covered by unit tests, not by a captured frame.

## Acceptance limits and next action

The model is a licensed technical sample; its provenance and license accompany the asset. This is silent text-paced speaking, without TTS, audio lip-sync, VRMA packs, model uploads or final character art. Pause/disconnect/hidden-document cancellation and late callbacks have focused regression coverage; all Activity poses exist, but real waiting/blocked transitions and native hot-disable/HMR were not separately qualified in this run.

Open the isolated Host, select VRM QA Ada, open Messages and choose VRM Companion. Send a normal DM and inspect the posture and mouth timing; pin Ada/Bob globally, switch to the QA Group, then return to the DM. Give feedback on character size, motion strength and text/speaking pacing. Keep #2222 open until that feedback and any required fixes are recorded.

Raw logs, authentication URLs, private Profile data and credentials stay local. The PR contains only selected screenshots of this synthetic QA conversation. The public developer contract is in [the Panel guide](../panel-plugin.md).
