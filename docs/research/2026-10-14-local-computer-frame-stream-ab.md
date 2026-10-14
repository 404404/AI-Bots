# Local Computer on the phone: screenshot stream against WebRTC

A/B test for [#1832](https://github.com/BotHarness/DeepSeekBot/issues/1832) and [#1833](https://github.com/BotHarness/DeepSeekBot/issues/1833). Decision: [ADR-0210](../adr/0210-the-phone-watches-the-local-computer-through-a-screenshot-stream.md).

## Method

A clock page (`node scripts/computer-frame-bench.mjs --write-clock`) draws `Date.now() mod 2^24` as 24 black and white cells after a red marker. The receiver decodes the cells from each frame and subtracts them from its own clock, which gives capture-to-receipt latency on one machine. The `static` scene shows fixed text; `?scene=busy` adds scrolling text and moving gradients.

- **Arm A, screenshot stream:** an isolated Host (`scripts/verify-app.mjs`) with the local target on Xvfb at 1440x900, measured with `node scripts/computer-frame-bench.mjs --name <instance> --scene <label>` for 20 s.
- **Arm B, WebRTC:** the Container Computer's Selkies stream at 1280x800 (AV1), received in Playwright Chromium with `requestVideoFrameCallback`, decoding the same clock from a canvas.

Both arms ran in the same Linux sandbox. Network transfer to a real phone is not included.

## Results

| Arm, scene                | fps | Latency p50 / p90    | Frame / bandwidth | CPU                              |
| ------------------------- | --- | -------------------- | ----------------- | -------------------------------- |
| Screenshot stream, static | 6.1 | 162–180 / 180–195 ms | 30 KB / 1.5 Mbps  | Host 3.6%, driver 4.5%           |
| Screenshot stream, busy   | 1.5 | 630–657 / 738 ms     | 1 MB / 12.6 Mbps  | Host 16%, driver 3.5%            |
| WebRTC, static            | 28  | 30 / 43 ms           | 2.4 Mbps          | container 39% idle, 64% in call  |
| WebRTC, busy              | 34  | 81 / 241 ms          | 14.6 Mbps         | container 54% idle, 155% in call |

## Reading

- A static screen changes rarely, so the stream mostly answers 204 and costs little. Capture itself takes about 140 ms per PNG.
- A busy screen makes every capture a new 1 MB PNG; encoding and base64 dominate, and fps falls to 1.5. WebRTC is more than 20 times faster there.
- Downscaling with `max_image_dimension` made PNGs larger on gradient content, so the stream sends the native size.
- The WebRTC CPU cost above is software AV1 in a container without a GPU. On a MacBook Air (Mac15,12, 8 cores, 2560x1664), a 15 s `ffmpeg` screen capture with hardware H.264 (`h264_videotoolbox`) ran at 28 fps full size at 6 Mbps for about 18% of one core, and at 30 fps scaled to 1280 wide at 3 Mbps for about 32% (the downscale ran on the CPU). A WebRTC stack adds packetizing, encryption and congestion control on top, so the screen was mostly static and this is a floor, not a full WebRTC measurement.
- The screenshot-stream run on macOS is still to do with the same script.
