# Source candidate evidence

`01-real-dm-031a14db.png` is an unchanged 1280 × 800 screenshot captured through T3's collaborative browser on 2026-10-11 at 17:55 UTC.

- Product source: `031a14db43af5b3bf52e76b01c30e27828e6e9c9`.
- Screenshot SHA-256: `41ce37200f221d7c439d2bff3546fe41e1aaf4e10d8c92372a849e594382ae86`.
- Product candidate: `1.2.1-vps.20261012.sha031a14db`.
- Node: `24.21.0`; pnpm: `12.4.2`; DSH: `0.2.0-rc.1`.
- Product-managed Provider: `4.32.0-botharness.19`, upstream source `602baa37fa327f7069545aaadbbd34db8a8f4636`.
- Qualified packaged runtime digest: `09c8066e2565eb1ab018eaf59edef8d47e368c13314a14f9504b1664c836c01c`.
- Verification: the exact committed reply to `SEO_SOURCE_031a14db_OK` is visible in the original local DM after source update and service restart.
- Privacy review: the entire image was visually inspected; it contains only task-created Bots, product text, model labels and the test marker. The address bar, machine identity, credentials and authorization form are absent.

The welcome letter above the actual reply is preset product content. This is local DM evidence, not QQ group-delivery evidence. Other browser recordings remain private pending their media review; reviewed terminal originals and the native binding clip are published below.

`02-qq-app-bound.png` is an unchanged 1280 × 800 T3 screenshot captured on 2026-10-11 at 18:10:31 UTC. It shows the native successful binding of the existing QQ QA App to the task's tutorial Bot after CLI credential reuse. Its SHA-256 is `baa38bc120008315ebab93f829ed17ec7faad900efc851101cea7e1e669445e0`.

The running product and Provider revisions are the same as above; the developer CLI helper is implemented in commit `9de28161`. The full image was visually reviewed: no Secret, authorization QR, group members, native account ID, URL or machine address is visible. The binding-ready screen proves neither a received QQ event nor a visible group reply.

`qq-acceptance.json` records the bounded acceptance summary at 2026-10-11 18:19:56 UTC. The Human confirmed visible matching original-group replies to `SEO_QQ_QA1_20261012_A_OK` and, after the task Host restarted, `SEO_QQ_QA1_20261012_B_OK`. Each matches a distinct canonical Source Event, handled Inbox Admission and provider-accepted Outbox intent with a receipt; both belong to the same native QQ conversation. Private source locators and raw facts are omitted. The Human's original-group observation supplies the rendering confirmation; Provider receipts alone do not. The Human subsequently supplied an original-group screenshot containing both request/reply pairs; the privacy-reviewed derivative `04-qq-group-before-after.png` is now public. The accompanying `qq-group-image.json` records both digests and exact lossless crop/redaction operations. It confirms original-group rendering before and after restart. No group video is claimed.

## Actual terminal recordings

The four files under `terminal/` are unchanged originals from Linux `util-linux script 2.41.3`. `terminal/manifest.json` records their byte sizes and SHA-256 digests. Their headers use `+08:00`; the fresh installation began at **2026-10-11 17:33:25 UTC**, and the later source update began at **17:52:27 UTC**.

- `03-source-install-retry2.typescript` and its `.timing` file record a successful fresh Profile installation of source `73c75f86`, tool versions, actual DSH help and six-component verification. This was the successful retry, not the earlier failed attempts.
- `03-source-update-031a14db.typescript` and its `.timing` file record the subsequent actual update to the final `031a14db` product, including its qualified packaged runtime digest. They do not record a fresh install of that newer SHA.

The entire command/output transcripts were inspected before copying. They contain public package references and task-specific installation paths, but no authentication input, Owner login link, IP address, host fingerprint or credential store. Raw DM API responses with private locators remain private. These are actual terminal data and timing, not a reconstructed terminal animation; a replay of them must be labeled as a replay.

## Actual native QQ binding video

The [17.219-second MP4, bilingual subtitles and equivalent transcript](video/transcript.md) show the original native binding flow. The clip was recorded through T3 at 18:09:51.247–18:10:08.618 UTC with the same product and Provider revisions above. All 516 frames were visually inspected, including full-resolution key states. Only container metadata was removed; a matching H.264 payload hash verifies that all original video data and timing were retained. [The media manifest](video/manifest.json) records digests, dimensions and the privacy review.

No Secret, QR, login URL, machine address, member list or unrelated conversation is visible. The clip shows binding readiness, not original-group delivery or the earlier CLI credential transfer. Other clips and the complete tutorial film remain pending; the original-group A/B image is available separately.

## Supplemental native setup and final-source installation

`03-qq-manual-setup.png` and the [actual manual-setup clip](video/manual-setup-transcript.md) show the real blank native form, captured at 19:59 UTC on 2026-10-11. Its manifest records processing and digests. Authentication was prepared privately; no authorization mutation occurred.

`terminal/05-fresh-profile-031a14db.typescript` and its timing are unchanged util-linux originals from 19:58:23 UTC. The entire output was reviewed. They record actual Ubuntu/resource/tool versions, the active task unit and a fresh final-source Profile installation in a new isolated directory on the already provisioned VPS. All six components and the exact Provider runtime digest were verified. No Host or QQ receiver was started from this supplemental Profile. This is later supplemental installation, not initial provisioning or a clean OS reinstall. The observed task unit peak was 454955008 bytes at that time.
