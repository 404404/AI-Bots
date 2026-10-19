# macOS product zoom delivery evidence

Current implementation: ordinary product installation carries the licensed theme but leaves the native `ui-theme` row untouched. The explicit `deepseekbot-zoom-setup enable --home <home> --profile <profile> --dsh <cli>` command adds a Profile-local package link through the native package manager. Restart the same Host/Desktop. Disable before product removal; native settings remain in the original Profile Patch. Setup success reports configuration only (`runtimeVerified:false`).

The earlier grouped replacement booted but renamed the Settings namespace to `qualified-theme`. That was not a valid manual-font preservation proof. Both sync and async Node-hook experiments also failed actual DSH metadata discovery despite standalone resolver tests. Those experiments are not part of the delivered source. The historical validation record must not be used to accept the discarded composition.

Actual prepared product `0.0.0-zoom.2268.7`, isolated macOS Node v24.21.0 / DSH 0.2.1-rc.2, authenticated native Host API:

- Baseline native `ui-theme`: font 16, dark preference.
- Product installed and explicitly enabled: exactly one native theme module id, compatibility marker present, original namespace and font 16/dark retained.
- Native settings mutation changes font to 17; true Host restart retains 17/dark.
- Setup disable plus restart restores native theme bytes without the marker; the same original namespace still contains 17/dark.
- pnpm may leave an unlisted link on remove. Setup removes only its exact owned symlink and verifies absence; other overrides are refused.

These are real tarball/Host/settings checks, not native Desktop visual or manual-font UI acceptance. Both supported Host versions passed fresh ordinary product install, Bot/DM creation and real restart. Reinstall, local-version upgrade and rollback preserved the same canonical Bot identity and one theme module. Raw product removal fell back to the original native theme and retained font 17; explicit post-removal cleanup removed the owned override. The setup command refused 0.2.0-rc.2 without changing the Profile. All 47 focused tests, lint, format, types and targeted product build passed; see `validation.json`. No model or external IM delivery is claimed.

The existing native window remains held for the Human's physical IME check and has not been silently replaced. Earlier native shortcut recording rejected an occupied binding without changing zoom; a temporary custom binding changed one level and retained a synthetic draft, then was reset. That earlier window is not evidence for this corrected package composition.

No new rendered UI is introduced by this packaging/CLI correction. A fresh native-install before/after pair remains pending; the separate fresh-product Web origin was denied by browser approval and no alternate browser/CDP access was attempted. Required wallpaper and chrome before/after evidence belongs to the separate PRs #2294/#2295. Same-user-data Host switching, corrected packed native activation, physical IME and the broader #2269 native matrix remain open.

#2268 and #2269 remain unaccepted. Windows/Linux are deferred to Human testing under #2270. No merge or release.
