# Fixed Android streaming replay

This local QA provider sends deterministic content through a real isolated Host's existing `channel_send` tool. It does not replace the Host or inject fake chat events. Use the shared Android batch lease and an isolated QA Profile, never a production provider or a private conversation.

1. Create a private, gitignored control file containing the designated QA Bot slug. Start the loopback server in a separate terminal:

   ```sh
   node apps/mobile/scripts/stream-replay.mjs --port 39210 --control <private-control.json> --log <private-metadata.jsonl>
   ```

2. In that isolated Host only, configure an OpenAI-compatible QA provider with base URL `http://127.0.0.1:39210/v1`, a dummy local credential, and model `qa-replay`. Apply it to both the orchestrator and assignment routes of a dedicated QA Bot. Model configuration uses the existing Settings/CLI owner; no real provider key is needed. Read `/health` to check fixture lengths and timing.

3. Open that Bot's DM, hide the keyboard, choose the dark portrait theme and leave the list following the latest message. Arm exactly one reply immediately before the send:

   ```json
   { "slug": "<qa-bot-slug>", "fixture": "prose", "runId": "<fresh-uuid>" }
   ```

   Fixtures: `prose` (21,492 UTF-16 characters), `long` (continuous paragraph, formatting and emoji), `rich` (120 code lines, 40 table rows and other formatting), and `smoke` (short protocol check). The server splits JSON tool arguments at 80-grapheme boundaries on a drift-compensated 32 ms clock. A `runId` is consumed once; tool completion and follow-up requests return `Done` without sending another message. An unarmed file has no `runId`. The bounded in-memory consumed-ID history holds 64 runs; use a new UUID for every run.

4. Start an 18-second native recording with the shared QA helper; after approximately 700 ms, send a marked message with `deepseekbot send <slug> --body AX_FLICKER_FIXED --timeout 45` in another terminal. Keep authentication in the existing private environment/token-file adapter. Keep the returned canonical reply privately and verify exactly one expected body. Do not open a sheet or scroll during the visibility recording. For performance, run a separate, explicitly observed drag and record native frame timing.

5. Check the native video and read it visually:

   ```sh
   node apps/mobile/scripts/check-stream-video.mjs --video <native.mp4> --case streaming --start 4 --seconds 6 --out <private-result.json>
   node apps/mobile/scripts/check-stream-video.mjs --video <rich.mp4> --case rich --start 5 --seconds 6
   node apps/mobile/scripts/check-stream-video.mjs --video <complete.mp4> --case complete-wait --start 3 --seconds 5
   node apps/mobile/scripts/check-stream-video.mjs --video <complete.mp4> --case complete-ready --start 13 --seconds 4
   ```

The checker requires `ffmpeg`. It scales a portrait frame to 244×542 and samples a fixed gray-bubble/bright-text region. Streaming/ready cases require bubble coverage in at least 90% of the full window and no nearly blank text frames. `rich` has a separate sparse-table threshold; the all-gray regression still fails it. `complete-wait` requires no large draft body and must be paired with the ready check and verified app/chat foreground. Different themes, layouts, delays or fixtures need a separately calibrated check; do not move thresholds merely to pass a recording. These checks detect the reported disappearance, not grammar, all image/native extensions, naturalness, exact content, or 120 FPS.

Keep raw recordings, replies, control files and metadata in the batch's private evidence directory. Publish only redacted QA evidence. Stop this exact provider process and remove only its task-owned provider/preset/Bots when the batch owner ends the fixture run; keep shared resources and unrelated QA data intact.
