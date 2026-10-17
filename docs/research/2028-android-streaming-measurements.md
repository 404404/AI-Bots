# Android streaming measurements for #2028

Measured 2026-10-17 on the shared Android 16 arm64 phone, physical 120 Hz display, Expo 57 / React Native 0.86.3 native development client. These are diagnostic measurements, not a 120 FPS qualification or release-build benchmark.

## Matched-input comparison

Six runs alternated A, B, B, A, A, B. Every run restarted the app and Metro, opened a separately prepared QA DM with one historical Human message, waited three seconds and received one 21,492-character reply from the fixed local provider through the real Host. The provider emitted 281 argument chunks on a 32 ms absolute clock, approximately 8.96 seconds in each run. It allowed one reply per armed run; autonomous follow-ups returned `Done`. The roster was held constant during these six runs. Battery temperature was approximately 34°C.

A used mobile commit `e0f08b5010203d15d12e358a25cc391125993f52`, before draft subscription/buffering and the Android renderer change. B used the subsequent buffered Android text renderer, plus an experimental Android `freezeOnBlur` option. That option did not prevent background Home renders and was removed afterwards; therefore B is an intermediate experiment, not an exact final-head benchmark. Both variants used the same installed native client and development-mode JS. Hermes/React profiling was active.

| Run | ChatConversation renders | MessageBubble renders | React render time, ms | Native sampled-frame completion p95, ms | Longest JS-probe interval, ms |
| --- | -----------------------: | --------------------: | --------------------: | --------------------------------------: | ----------------------------: |
| A4  |                       31 |                    19 |               6,395.5 |                                   175.0 |                       1,882.1 |
| B4  |                       12 |                    19 |              12,438.1 |                                    33.6 |                       4,820.0 |
| B5  |                       12 |                    19 |              12,697.0 |                                    35.1 |                       4,845.4 |
| A5  |                       31 |                    19 |               6,386.4 |                                   179.3 |                       1,884.0 |
| A6  |                       30 |                    19 |               6,737.5 |                                   178.9 |                       1,916.3 |
| B6  |                       12 |                    19 |              12,888.2 |                                    45.2 |                       5,671.2 |

React render time is the profiler's accumulated commit render duration, not wall-clock response latency. Native completion is `FrameCompleted - IntendedVsync` from deduplicated `gfxinfo framestats` entries, including the device's flag-32 samples (283–309 entries per run). It is not compositor presentation FPS. `DisplayPresentTime` was zero, and the device's dynamic frame deadlines were not a fixed 8.33 ms budget. The script attempted a continuous drag; its actual scroll progression was not independently qualified, so these numbers must not be presented as sustained scroll FPS. The existing JS probe assumes a 60 Hz reference and cannot qualify 120 Hz.

The results show fewer parent invalidations and better sampled native p95, but substantially more React work and multi-second JS stalls. The new synchronous renderer fixes the visible disappearance at the cost of mounting many nodes in a huge bubble, especially at draft settlement. Do not report this as an overall performance win. Visibility and performance need separate acceptance.

## Historical-row correction

The unchanged 19 MessageBubble renders exposed a second invalidation: every roster status update recreated the display-name lookup callback. The final implementation derives that callback only from Bot IDs/names, retaining it for status-only updates while rebuilding it on renames or a different Host's names. A regression test drives a memoized historical consumer through those transitions.

A focused native follow-up with the same 21,492-character fixture recorded **0 MessageBubble rerenders / 2 mounts**, while the live draft rendered 13 times. This run started without the historical seed and after the QA roster was cleaned up, so it is evidence for eliminating the callback invalidation, not a matched overall-speed comparison. Total React work and a roughly 4.8-second JS-probe stall remained. Group speaker/appearance updates and background Home subscription work remain separate optimization targets.

## Remaining qualification

- Keep the passing native text-visibility cases in [the buffering investigation](2028-native-streaming-buffer.md).
- Reduce long-bubble node/mount and settlement costs without changing Markdown semantics or hiding previously shown content.
- Verify actual scroll displacement before measuring its frame cadence; collect real compositor presentation timestamps or a native trace, without CPU/React profiling overhead.
- Run matched production/profile builds and use the actual 120 Hz frame budget. Production JS inside a native debug client is a diagnostic step, not a release-build substitute.
- Investigate keyboard timing separately using [the Telegram source findings](2028-telegram-android-keyboard-motion.md); neither the attempted translation mode nor blur freezing materially changed the slow keyboard-event span.

Raw profiles, frame samples, canonical replies and recordings stay in this task's ignored evidence directory. The fixed replay and narrow visibility checker are committed under `apps/mobile/scripts/`; their setup and limits are documented in [stream-replay.md](../../apps/mobile/scripts/stream-replay.md).
