# #2095 review evidence

Application source frozen at `eb0f85116d934d56d8c60b92e88117e6f2b18725`, based on `a3e2c4e64d131191e686e33cb207d3db9b3a0937` (unmerged #2119). The source build is `50d998e7c8104cb0b34c12e84787c8fcd8e10cd0`; later commits change verification and review material only. Captures: 2026-10-18 Asia/Tokyo, DSH 0.2.0-rc.2, Chromium Web, 1440×900 except the intentionally cropped Host review payload. Native macOS captures are 2522×1640 image pixels, except its cropped Host review payload.

| Artifact                            | Actual observation                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| notifications-before-action.png     | Notification owner off before the peer tab's real Settings switch action                                                                       |
| notifications-after-peer-action.png | First tab's existing switch updates after the other tab changes the shared browser-origin preference                                           |
| tob-notification-result.png         | Fresh natural request, approved ordinary CLI call and real Tob reply; earlier provider-quota failure remains visible and separately classified |
| explicit-host-theme-review.png      | Real rendered approval payload, cropped by the browser to its payload element; explicit Host scope and all-connected-clients disclosure        |
| tob-host-theme-result.png           | Natural explicit Host-wide theme request and actual rendered dark-theme reply                                                                  |
| restart-notification-readback.png   | Actual notification switch after same-home Host and browser-process restart, read before writes                                                |

These are **before/after action states on the candidate**, not base-revision screenshots or a pixel-layout comparison. The existing Notifications panel is retained. The new interaction is CLI/Tob control through its existing owner. A separate base run was not performed because the serialized runtime queue and disk warning prevented another checkout/build/Host run. For a base comparison, run the old Notifications control at the pinned base in a separate checkout when the parent grants a runtime slot, then match theme, locale, viewport and isolated fixture. Do not label candidate captures as base captures.

`verification.json` separates source checks, real Web behavior, model failure/fallback and unrun native/OS/CI/Human gates. Native harness output is explicitly single-client; it cannot qualify multiple windows or contexts. `explainer.html` is generated review prose, not runtime evidence. Open the rendered HTML from an authorized review attachment or raw-download path; a GitHub blob page itself does not render HTML. Draft PR [#2126](https://github.com/BotHarness/DeepSeekBot/pull/2126) publishes these assets; no separate hosting was used. The parent native single-client and retained-Profile restart runs passed; OS delivery and multiple native windows remain untested.

Theme/locale preserve native Host user settings. Notifications preserve browser-origin storage shared among same-origin tabs. No new preference store or migration is introduced. Private Client proofs, cookies, login tokens, credentials and profile contents are omitted. Random local test identity strings in screenshots carry no authentication authority.

## Native macOS single-client evidence

The parent ran the existing direct/model/model-theme phases, then externally restarted the same absolute Profile and retained userdata for restart-read. Both runs exited0 and recorded empty page-error lists. All9 private native captures were inspected before copying the selected sanitized assets. The notification owner started enabled with permission=granted; Tob changed enabled to false, preserving permission=granted. The separately reviewed Host theme changed light to dark. The next process read enabled=false and theme=dark before any new writes, with the real notification switch off.

| Artifact                                 | Actual observation                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| native-notifications-before-model.png    | Existing native Client notification switch on before the natural Tob request              |
| native-tob-notification-result.png       | Natural request, accepted one-time approval and actual Tob reply after owner off readback |
| native-explicit-host-theme-review.png    | Actual native review payload with Host/all-connected-clients scope                        |
| native-tob-host-theme-result.png         | Native dark theme after the explicit reviewed Host change                                 |
| native-restart-notification-readback.png | Actual native Notifications control off after process restart; theme dark                 |

This is one selected native Client. It does not test multiple native windows, peer storage events or independent native profiles. OS permission was observed as granted; no Human OS permission prompt or actual OS notification delivery was tested. The original main Desktop was restored by the parent after each run. No app source changed for these captures.
