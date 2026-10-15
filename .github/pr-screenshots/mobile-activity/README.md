# Native activity evidence — #1919 / #1928

Captured on one shared iOS 26.0 Simulator, English locale, 1206 × 2622 pixels,
using the existing development client. No native rebuild, second Simulator or
shared Host restart was used for the comparison.

- After: local integration `a42bc7ce27d0fd798c680f966a01b85b887fef0f`, containing
  PR #1928 code `04939de68a954c8c1de5fd80925d3f1be681555f`.
- Before: `6258e7d0943c0693104304c2f561ee8f0e46524f`, the same integration before
  #1928. Other batch inputs are unchanged.
- The same dedicated QA Host and test conversations were used for both versions.
  The Host remained on its prior batch-4 runtime; activity/pairing code matches
  the tested batch. This does not qualify unrelated Computer viewer Host changes.
- DM/group captures are at the latest messages; profile captures start at the
  top of the same sheet. The added rows change content height and background
  scroll position. Light/dark pairs use identical data. Raw captures are uncropped.
- The group posts, Bot DM and memory commits came from real model turns and were
  read through the authenticated Host journal transport. New-Bot activity came
  from the public direct Bot tool, not a model approval flow. Only local QA data
  is shown; no personal conversation, token or machine path is published.

The baseline already filters empty notices (#1920), so these records are absent,
not blank bubbles. Afterward, the DM shows folded posts, DM action, memory and
new-Bot activity; the group shows memory rows; the profile has two local switches.
`bot-dm-readonly-menu.png` shows Copy/Share without reactions or a composer.

The Simulator's old return-to-Settings status-bar text has missing Chinese glyphs.
This also occurs in iOS Settings; English app content is readable. Native Chinese
rendering and live Web/native visual parity remain unverified.

Targeted native checks passed for links, read-only Copy, switch filtering,
restart persistence, group independence and ordinary group reaction add/remove.
The unified e2e launcher separately failed its first pair-screen assertion behind
the Expo development menu. These screenshots do not turn that run green.
Android, second-Host isolation, physical APNs, ProMotion and Human QA are not passed.
