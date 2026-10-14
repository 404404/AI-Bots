---
Status: Accepted
Date: 2026-10-14
Issues: [#1832](https://github.com/BotHarness/DeepSeekBot/issues/1832), [#1833](https://github.com/BotHarness/DeepSeekBot/issues/1833)
---

# The phone watches the local Computer through a screenshot stream

> Amends the living architecture's "the local target has no viewer": the Host now serves one to the phone.

A Bot that uses the local Computer Target drives the Human's own Mac, Windows or Linux desktop through `cua-driver`. When it needs the Human (a login, a captcha, a confirmation), the Human may be away from that desk with only the phone. The container target already has a Selkies viewer; the local target had none. A separate remote desktop app (RustDesk, VNC) would need another install, another pairing and an app switch at exactly the moment the Bot asks for help, which the owner ruled out.

## Decision

The Host serves the local desktop to the phone itself, in two steps.

1. **Screenshot stream (#1832, this change).** `GET /api/computer/frame?after=<seq>` long-polls the existing driver's `get_desktop_state`: captures are single-flight and paced (150 ms), a frame identical to the last is not republished, and the route answers 204 after 10 s without a change. `POST /api/computer/input` sends click, scroll, type and key input through the driver's desktop-scope tools. The mobile app's **Computer** button opens a native screen that reuses the Browser viewer's stage; **Take control** enables input. Both routes have `deepseekbot computer-frame` and `computer-input` commands.
2. **WebRTC helper (#1833, later).** A hardware-encoded video track for moving content, once the screenshot stream's limits matter in practice.

No new native dependency, port or permission: the stream goes over the phone's existing Host connection, and the capture reuses the driver's Screen Recording and Accessibility grants.

## Evidence

The A/B test in [the research note](../research/2026-10-14-local-computer-frame-stream-ab.md) measured glass-to-glass latency with a clock drawn on screen:

- On a mostly static screen the stream runs at about 6 fps, 165 ms p50, 1.5 Mbps. That is enough for a Human to read a prompt and click.
- On a moving screen it drops to 1.5 fps, 650 ms p50, 13 Mbps (about 1 MB per PNG). WebRTC on the same scenes ran at 28–34 fps and 30–80 ms p50, at the cost of 25–100% of a core for encoding. That gap is why #1833 stays open.

## Consequences

- The Bot is not paused while the Human has control. Both can act on the desktop at once; the Human sees the Bot's moves in the stream.
- Every input is recorded in diagnostics as a `computer-action` with its kind and character count, never the typed text.
- Frames are not stored. The Host keeps only the latest one in memory while a viewer polls.
- The stream sends whole PNGs. A busy screen on a slow uplink will lag further than the measured numbers, which exclude network transfer.
