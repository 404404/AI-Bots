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

## Two-renderer sample

Both independent renderers held 13 geometries, 28 textures and 20 draw calls each over a five-second observation, with 129 additional rendered frames per instance (about 25.8 fps at a configured 30 fps cap). These are Three.js resource counters, not measured GPU memory. Model loading was below 1.2 seconds in these local observations; it is not a network-download benchmark. The embedded technical sample is 10.28 MiB and the Client bundle is about 16 MB before compression. No mobile/native Desktop or sustained performance qualification is claimed.

## Acceptance limits and next action

The model is a licensed technical sample; its provenance and license accompany the asset. This is silent text-paced speaking, without TTS, audio lip-sync, VRMA packs, model uploads or final character art. Pause/disconnect/hidden-document cancellation and late callbacks have focused regression coverage; all Activity poses exist, but real waiting/blocked transitions and native hot-disable/HMR were not separately qualified in this run.

Open the isolated Host, select VRM QA Ada, open Messages and choose VRM Companion. Send a normal DM and inspect the posture and mouth timing; pin Ada/Bob globally, switch to the QA Group, then return to the DM. Give feedback on character size, motion strength and text/speaking pacing. Keep #2222 open until that feedback and any required fixes are recorded.

Raw logs, authentication URLs, private Profile data and credentials stay local. The PR contains only selected screenshots of this synthetic QA conversation. The public developer contract is in [the Panel guide](../panel-plugin.md).
